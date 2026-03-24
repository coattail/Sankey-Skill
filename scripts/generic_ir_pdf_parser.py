from __future__ import annotations

import calendar
import json
from datetime import date
from io import BytesIO
import re
from html import unescape
from pathlib import Path
import subprocess
from typing import Any
from urllib.parse import urljoin, urlparse
import urllib.request

from generic_filing_table_parser import OPTIONAL_BREAKDOWN_ROWS, ROW_ALIASES, _merge_entry
from ocr_utils import ocr_pdf_pages_bytes, ocr_pdf_pages_bytes_structured
from official_financials import _build_financial_entry, _make_breakdown_item, _quarter_from_date_label, _quarter_period_end
from official_revenue_structures import _extract_first_pdf_link_from_html, _normalize_text_space, _parse_number_token
from official_segments import _period_key, _request, _request_json, _resolve_cik, _submission_records
from pypdf import PdfReader
from statement_periods import finalize_period_entries


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "generic-ir-pdf"
MIN_FILING_DATE = "2018-01-01"
SUPPORTED_FORMS = {"10-Q", "10-K", "20-F", "6-K", "8-K"}
MAX_FILINGS_TO_SCAN = 20
MAX_PDFS_PER_FILING = 4
LOGO_CATALOG_PATH = ROOT_DIR / "data" / "logo-catalog.json"
MAX_IR_ROOT_PAGES = 12
MAX_IR_DETAIL_PAGES = 10
MAX_IR_CRAWL_PAGES = 24
MAX_IR_PDF_CANDIDATES = 40
TARGET_HISTORY_WINDOW_QUARTERS = 30
OCR_PDF_PAGE_LIMIT = 24
OCR_MIN_TEXT_SIGNAL = 80
OCR_MIN_MEANINGFUL_SIGNAL = 50
OCR_ROW_Y_BUCKET = 0.009
OCR_COLUMN_GAP = 0.05
OCR_COLUMN_CLUSTER_GAP = 0.065
HTTP_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
MIRROR_PREFIX = "https://r.jina.ai/http://"

FISCAL_QUARTER_NAME_MAP = {
    "first": 1,
    "1st": 1,
    "q1": 1,
    "second": 2,
    "2nd": 2,
    "q2": 2,
    "third": 3,
    "3rd": 3,
    "q3": 3,
    "fourth": 4,
    "4th": 4,
    "q4": 4,
}

EXPENSE_ABSOLUTE_FIELDS = {
    "costOfRevenue",
    "sgna",
    "salesAndMarketing",
    "generalAndAdministrative",
    "rnd",
    "fulfillment",
    "taxesAndSurcharges",
    "financeExpense",
    "operatingExpenses",
    "tax",
}

GENERIC_BREAKDOWN_STOP_FIELDS = {
    "revenue",
    "costOfRevenue",
    "grossProfit",
    "operatingExpenses",
    "operatingIncome",
    "pretaxIncome",
    "tax",
    "netIncome",
}

GENERIC_BREAKDOWN_STOP_TOKENS = (
    "earningsper",
    "dilutedeps",
    "basiceps",
    "dividendsdeclared",
    "weightedaverage",
    "sharesoutstanding",
)


def _cache_path(company_id: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{company_id}.json"


def _load_cached_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_cached_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _fetch_via_curl(url: str, *, accept: str, timeout_seconds: int, binary: bool = False) -> str | bytes:
    command = [
        "curl",
        "-L",
        "-A",
        HTTP_USER_AGENT,
        "-H",
        f"Accept: {accept}",
        "--max-time",
        str(timeout_seconds),
        url,
    ]
    completed = subprocess.run(command, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or b"curl failed").decode("utf-8", errors="ignore").strip() or "curl failed")
    return completed.stdout if binary else completed.stdout.decode("utf-8", errors="ignore")


def _mirror_url(url: str) -> str:
    parsed = urlparse(url)
    target = f"{parsed.netloc}{parsed.path or ''}"
    if parsed.query:
        target = f"{target}?{parsed.query}"
    return f"{MIRROR_PREFIX}{target}"


def _strip_mirror_envelope(text: str) -> str:
    marker = "Markdown Content:"
    if marker in text:
        return text.split(marker, 1)[1].strip()
    return text


def _looks_like_blocked_html(text: str) -> bool:
    normalized = str(text or "").lower()
    return any(
        token in normalized
        for token in (
            "just a moment...",
            "enable javascript and cookies to continue",
            "_cf_chl_opt",
            "cf-browser-verification",
            "attention required!",
        )
    )


def _mirror_fetch_text(url: str, timeout_seconds: int = 20) -> str:
    mirror = _mirror_url(url)
    request = urllib.request.Request(
        mirror,
        headers={
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "text/plain,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return _strip_mirror_envelope(response.read().decode("utf-8", errors="ignore"))
    except Exception:
        mirrored = _fetch_via_curl(mirror, accept="text/plain,*/*;q=0.8", timeout_seconds=timeout_seconds, binary=False)
        return _strip_mirror_envelope(str(mirrored))


def _quick_fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": url,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            text = response.read().decode("utf-8", errors="ignore")
            if not _looks_like_blocked_html(text):
                return text
    except Exception:
        pass
    try:
        curled = str(_fetch_via_curl(url, accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", timeout_seconds=8, binary=False))
        if not _looks_like_blocked_html(curled):
            return curled
    except Exception:
        pass
    return _mirror_fetch_text(url, timeout_seconds=15)


def _quick_fetch_pdf_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": HTTP_USER_AGENT,
            "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": url,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read()
    except Exception:
        return bytes(_fetch_via_curl(url, accept="application/pdf,application/octet-stream;q=0.9,*/*;q=0.8", timeout_seconds=30, binary=True))


def _extract_pdf_page_texts(url: str) -> list[str]:
    pdf_bytes = _quick_fetch_pdf_bytes(url)
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        page_texts = [page.extract_text() or "" for page in reader.pages]
        return _maybe_enrich_page_texts_with_ocr(pdf_bytes, page_texts)
    except Exception:
        mirrored = _mirror_fetch_text(url, timeout_seconds=30)
        return [mirrored] if mirrored else []


def _text_signal(text: str) -> int:
    return len(re.findall(r"[0-9A-Za-z\u4e00-\u9fff]", str(text or "")))


def _ocr_signal(text: str) -> int:
    return _text_signal(text)


def _looks_like_financial_page(text: str) -> bool:
    normalized = re.sub(r"\s+", " ", str(text or "")).lower()
    return any(
        token in normalized
        for token in (
            "revenue",
            "operating income",
            "net income",
            "income before",
            "quarter ended",
            "months ended",
            "year ended",
            "营业收入",
            "营业利润",
            "净利润",
            "利润总额",
            "截至",
        )
    )


def _normalized_ocr_observations(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(observations, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for raw in observations:
        if not isinstance(raw, dict):
            continue
        text = _normalize_text_space(str(raw.get("text") or "")).strip()
        if not text:
            continue
        try:
            x = float(raw.get("x") or 0)
            y = float(raw.get("y") or 0)
            width = float(raw.get("width") or 0)
            height = float(raw.get("height") or 0)
        except (TypeError, ValueError):
            continue
        cleaned.append({"text": text, "x": x, "y": y, "width": width, "height": height})
    return cleaned


def _group_ocr_rows(observations: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    cleaned = _normalized_ocr_observations(observations)
    if not cleaned:
        return []

    cleaned.sort(key=lambda item: (item["y"], item["x"]))
    rows: list[list[dict[str, Any]]] = []
    current_row: list[dict[str, Any]] = []
    current_anchor: float | None = None
    for item in cleaned:
        if current_anchor is None or abs(item["y"] - current_anchor) <= max(OCR_ROW_Y_BUCKET, item["height"] * 0.45):
            current_row.append(item)
            current_anchor = item["y"] if current_anchor is None else ((current_anchor * (len(current_row) - 1)) + item["y"]) / len(current_row)
            continue
        rows.append(sorted(current_row, key=lambda value: value["x"]))
        current_row = [item]
        current_anchor = item["y"]
    if current_row:
        rows.append(sorted(current_row, key=lambda value: value["x"]))
    return rows


def _cluster_ocr_columns(rows: list[list[dict[str, Any]]]) -> list[float]:
    anchors: list[float] = []
    for row in rows:
        for item in row:
            x = float(item["x"])
            matched_index: int | None = None
            for index, anchor in enumerate(anchors):
                if abs(x - anchor) <= OCR_COLUMN_CLUSTER_GAP:
                    matched_index = index
                    break
            if matched_index is None:
                anchors.append(x)
                anchors.sort()
                continue
            anchors[matched_index] = (anchors[matched_index] + x) / 2
    return sorted(anchors)


def _structured_ocr_grid_lines(observations: list[dict[str, Any]]) -> list[str]:
    rows = _group_ocr_rows(observations)
    if not rows:
        return []
    anchors = _cluster_ocr_columns(rows)
    if len(anchors) < 2:
        return []
    line_rows: list[tuple[float, str]] = []
    for row in rows:
        cells: dict[int, list[str]] = {}
        for item in row:
            x = float(item["x"])
            best_index = min(range(len(anchors)), key=lambda index: abs(anchors[index] - x))
            cells.setdefault(best_index, []).append(str(item["text"]))
        ordered_cells = [
            " ".join(part for part in cells.get(index, []) if part).strip()
            for index in range(len(anchors))
        ]
        while ordered_cells and not ordered_cells[-1]:
            ordered_cells.pop()
        non_empty = [cell for cell in ordered_cells if cell]
        if not non_empty:
            continue
        line_rows.append((min(float(item["y"]) for item in row), " | ".join(non_empty)))
    return [line for _y, line in sorted(line_rows, key=lambda item: item[0])]


def _structured_ocr_lines(observations: list[dict[str, Any]]) -> list[str]:
    rows = _group_ocr_rows(observations)
    if not rows:
        return []
    line_rows: list[tuple[float, str]] = []
    for row in rows:
        parts: list[str] = []
        previous_right: float | None = None
        for item in row:
            left = float(item["x"])
            if previous_right is not None:
                gap = left - previous_right
                if gap > OCR_COLUMN_GAP:
                    parts.append(" | ")
                else:
                    parts.append(" ")
            parts.append(str(item["text"]))
            previous_right = left + float(item["width"])
        line = "".join(parts).strip()
        if line:
            line_rows.append((min(float(item["y"]) for item in row), line))
    return [line for _y, line in sorted(line_rows, key=lambda item: item[0])]


def _ocr_pipe_data_cell_count(line: str) -> int:
    if "|" not in str(line or ""):
        return 0
    count = 0
    for cell in [segment.strip() for segment in str(line or "").split("|")[1:]]:
        if _line_number_count(cell) > 0 or _extract_scaled_values_from_line(cell):
            count += 1
    return count


def _is_ocr_table_header_line(line: str) -> bool:
    normalized = _normalize_key(line)
    return any(
        token in normalized
        for token in (
            "statementsofincome",
            "statementsofoperations",
            "balance sheets",
            "balancesheets",
            "cashflows",
            "threemonthsended",
            "sixmonthsended",
            "ninemonthsended",
            "yearended",
            "quarterended",
            "fiscal20",
            "gaap",
            "nongaap",
            "inmillions",
            "inbillions",
            "unaudited",
        )
    )


def _is_ocr_label_only_line(line: str) -> bool:
    normalized = str(line or "").strip()
    if not normalized or "|" in normalized:
        return False
    if _line_number_count(normalized) > 0:
        return False
    if len(normalized) > 90 or normalized.endswith(".") or '"' in normalized:
        return False
    return True


def _is_ocr_section_header_line(line: str) -> bool:
    normalized = _normalize_key(line)
    if not normalized:
        return False
    if str(line or "").strip().endswith(":"):
        return True
    return normalized in {
        "operatingexpenses",
        "otherexpenseincome",
        "otherincomeexpense",
        "earningspercommonshare",
        "impactperdilutedshare",
    }


def _is_ocr_table_value_line(line: str) -> bool:
    if "|" in str(line or "") and _ocr_pipe_data_cell_count(line) >= 2:
        return True
    normalized = _normalize_key(line)
    return bool(_line_number_count(line) >= 2 and any(token in normalized for token in ("revenue", "income", "tax", "净利润", "营业收入", "利润")))


def _merge_wrapped_ocr_grid_lines(lines: list[str]) -> list[str]:
    if not lines:
        return []
    merged: list[str] = []
    index = 0
    while index < len(lines):
        current = str(lines[index] or "").strip()
        if (
            _is_ocr_label_only_line(current)
            and index + 1 < len(lines)
            and "|" in str(lines[index + 1] or "")
            and _ocr_pipe_data_cell_count(str(lines[index + 1] or "")) >= 2
        ):
            if _is_ocr_section_header_line(current):
                merged.append(current)
                index += 1
                continue
            merged.append(f"{current} {str(lines[index + 1]).strip()}".strip())
            index += 2
            continue
        merged.append(current)
        index += 1
    return [line for line in merged if line]


def _merge_numeric_continuation_ocr_grid_lines(lines: list[str]) -> list[str]:
    if not lines:
        return []
    merged: list[str] = []
    for line in lines:
        current = str(line or "").strip()
        if (
            merged
            and "|" in current
            and not current.split("|", 1)[0].strip()
            and _ocr_pipe_data_cell_count(current) >= 2
            and "|" in merged[-1]
        ):
            merged[-1] = f"{merged[-1]} | {' | '.join(part.strip() for part in current.split('|') if part.strip())}".strip()
            continue
        first_cell = current.split("|", 1)[0].strip() if "|" in current else current
        if (
            merged
            and "|" in current
            and _line_number_count(first_cell) > 0
            and _line_number_count(first_cell) == len(first_cell.split())
            and _ocr_pipe_data_cell_count(current) >= 2
            and "|" in merged[-1]
            and _is_ocr_label_only_line(merged[-1].split("|", 1)[0].strip())
        ):
            merged[-1] = f"{merged[-1]} | {' | '.join(part.strip() for part in current.split('|') if part.strip())}".strip()
            continue
        merged.append(current)
    return [line for line in merged if line]


def _extract_ocr_table_block_lines(lines: list[str]) -> list[str]:
    if not lines:
        return []
    best_block: list[str] = []
    current_block: list[str] = []
    started = False
    slack = 0
    for line in lines:
        normalized = str(line or "").strip()
        if not normalized:
            if started:
                slack += 1
            continue
        is_header = _is_ocr_table_header_line(normalized)
        is_value = _is_ocr_table_value_line(normalized)
        is_label = _is_ocr_label_only_line(normalized)
        if not started:
            if is_header or is_value:
                started = True
                current_block.append(normalized)
            continue
        if "the accompanying notes" in normalized.lower():
            break
        if is_header or is_value or is_label:
            current_block.append(normalized)
            slack = 0
            continue
        slack += 1
        if slack >= 2:
            break
        current_block.append(normalized)
    if current_block:
        best_block = current_block
    return _merge_numeric_continuation_ocr_grid_lines(_merge_wrapped_ocr_grid_lines(best_block))


def _should_try_document_ocr(page_texts: list[str]) -> bool:
    sample = page_texts[: min(len(page_texts), 6)]
    if not sample:
        return False
    low_signal_pages = sum(1 for page_text in sample if _text_signal(page_text) < OCR_MIN_TEXT_SIGNAL)
    return low_signal_pages >= max(2, len(sample) // 2)


def _maybe_enrich_page_texts_with_ocr(pdf_bytes: bytes, page_texts: list[str]) -> list[str]:
    if not page_texts or not _should_try_document_ocr(page_texts):
        return page_texts

    page_limit = min(len(page_texts), OCR_PDF_PAGE_LIMIT)
    pages_to_ocr = [
        page_index + 1
        for page_index, page_text in enumerate(page_texts[:page_limit])
        if _text_signal(page_text) < OCR_MIN_TEXT_SIGNAL or _looks_like_financial_page(page_text)
    ]
    if not pages_to_ocr:
        return page_texts

    try:
        ocr_map = ocr_pdf_pages_bytes(pdf_bytes, page_numbers=pages_to_ocr)
        structured_map = ocr_pdf_pages_bytes_structured(pdf_bytes, page_numbers=pages_to_ocr)
    except Exception:
        return page_texts
    if not ocr_map and not structured_map:
        return page_texts

    enriched = list(page_texts)
    for page_number in pages_to_ocr:
        page_index = page_number - 1
        if page_index < 0 or page_index >= len(enriched):
            continue
        ocr_text = str(ocr_map.get(page_number) or "")
        structured_observations = structured_map.get(page_number) or []
        structured_grid_text = "\n".join(_structured_ocr_grid_lines(structured_observations))
        structured_block_text = "\n".join(_extract_ocr_table_block_lines(structured_grid_text.splitlines()))
        structured_text = "\n".join(_structured_ocr_lines(structured_observations))
        candidate_parts = [part.strip() for part in (structured_block_text, structured_grid_text, structured_text, ocr_text) if str(part or "").strip()]
        candidate_text = "\n".join(candidate_parts).strip()
        if _ocr_signal(candidate_text) < OCR_MIN_MEANINGFUL_SIGNAL:
            continue
        current_text = str(enriched[page_index] or "").strip()
        if not candidate_text:
            continue
        if not current_text:
            enriched[page_index] = candidate_text
            continue
        current_signal = _text_signal(current_text)
        if current_signal < OCR_MIN_TEXT_SIGNAL or (_looks_like_financial_page(candidate_text) and _ocr_signal(candidate_text) > current_signal):
            enriched[page_index] = f"{current_text}\n{candidate_text}"
    return enriched


def _normalize_key(value: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", str(value or "").lower())


def _month_number(month_name: str) -> int | None:
    normalized = str(month_name or "").strip().lower()
    months = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }
    return months.get(normalized)


def _scale_from_text(text: str) -> float:
    normalized = str(text or "").lower()
    if "in billions" in normalized or "billions" in normalized:
        return 1_000_000_000
    if "in millions" in normalized or "millions" in normalized:
        return 1_000_000
    if "in thousands" in normalized or "thousands" in normalized:
        return 1_000
    if any(token in normalized for token in ("单位为千元", "单位：千元", "人民币千元", "以人民币千元为单位", "rmb in thousands")):
        return 1_000
    if any(token in normalized for token in ("单位为万元", "单位：万元", "人民币万元", "以人民币万元为单位")):
        return 10_000
    if any(token in normalized for token in ("单位为百万元", "单位：百万元", "人民币百万元", "单位为百万", "单位：百万")):
        return 1_000_000
    if any(token in normalized for token in ("单位为亿元", "单位：亿元", "人民币亿元")):
        return 100_000_000
    return 1


def _explicit_scale_from_lines(lines: list[str]) -> float | None:
    local_text = " ".join(lines[:40])
    normalized = str(local_text or "").lower()
    if any(token in normalized for token in ("单位：元", "单位为元", "（元）", "(元)")):
        return 1
    scaled = _scale_from_text(local_text)
    return scaled if scaled != 1 else None


def _load_logo_catalog() -> dict[str, Any]:
    if not LOGO_CATALOG_PATH.exists():
        return {}
    try:
        payload = json.loads(LOGO_CATALOG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _company_domain(company: dict[str, Any]) -> str:
    website = str(company.get("website") or "").strip()
    if website:
        parsed = urlparse(website if "://" in website else f"https://{website}")
        host = (parsed.netloc or parsed.path or "").strip().lower()
        if host:
            return host[4:] if host.startswith("www.") else host
    domain = str(company.get("domain") or "").strip().lower()
    if domain:
        return domain[4:] if domain.startswith("www.") else domain
    catalog = _load_logo_catalog()
    logos = catalog.get("logos") if isinstance(catalog.get("logos"), dict) else {}
    aliases = catalog.get("aliases") if isinstance(catalog.get("aliases"), dict) else {}
    candidates = {
        str(company.get("id") or "").strip().lower(),
        str(company.get("slug") or "").strip().lower(),
        str(company.get("ticker") or "").strip().lower(),
    }
    for candidate in list(candidates):
        if candidate:
            candidates.add(re.sub(r"[^a-z0-9]+", "", candidate))
            candidates.add(candidate.replace("-inc", ""))
            candidates.add(candidate.replace("-co", ""))
    for candidate in candidates:
        key = aliases.get(candidate, candidate)
        entry = logos.get(key)
        if isinstance(entry, dict) and str(entry.get("domain") or "").strip():
            host = str(entry.get("domain") or "").strip().lower()
            return host[4:] if host.startswith("www.") else host
    return ""


def _clamp_day(year: int, month: int, day: int) -> int:
    return min(day, calendar.monthrange(year, month)[1])


def _shift_month(year: int, month: int, delta_months: int) -> tuple[int, int]:
    absolute_month = year * 12 + (month - 1) + delta_months
    return (absolute_month // 12, absolute_month % 12 + 1)


def _fiscal_quarter_period_end(fiscal_year: int, fiscal_quarter: int, end_month: int, end_day: int) -> date:
    shifted_year, shifted_month = _shift_month(fiscal_year, end_month, -3 * (4 - fiscal_quarter))
    return date(shifted_year, shifted_month, _clamp_day(shifted_year, shifted_month, end_day))


def _period_column_spec(
    period_end: date,
    *,
    fiscal_year: int | None = None,
    fiscal_quarter: int | None = None,
    span: int = 1,
) -> dict[str, Any]:
    quarter_number = ((period_end.month - 1) // 3) + 1
    normalized_span = max(int(span or 1), 1)
    return {
        "quarter": f"{period_end.year}Q{quarter_number}",
        "periodEnd": period_end.isoformat(),
        "fiscalYear": fiscal_year or period_end.year,
        "fiscalQuarter": fiscal_quarter or quarter_number,
        "statementSpanQuarters": normalized_span,
        "statementValueMode": "direct" if normalized_span == 1 else "cumulative",
    }


def _fiscal_year_end_from_lines(lines: list[str]) -> tuple[int, int] | None:
    header_text = " ".join(lines[:20])
    match = re.search(
        r"(?:years?|fiscal year)\s+ended\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})",
        header_text,
        re.IGNORECASE,
    )
    if not match:
        return None
    month = _month_number(match.group(1))
    if month is None:
        return None
    return (month, int(match.group(2)))


def _fiscal_header_quarters_from_lines(lines: list[str]) -> list[dict[str, Any]]:
    fiscal_year_end = _fiscal_year_end_from_lines(lines)
    if fiscal_year_end is None:
        return []
    end_month, end_day = fiscal_year_end
    header_lines = lines[:20]
    header_text = " ".join(header_lines)
    annual_header = "annual" in " ".join(lines[:4]).lower()

    fiscal_years: list[int] = []
    for line in header_lines:
        for match in re.finditer(r"\b(?:FY|Fiscal\s+Year)\s*[' ]?(\d{2,4})\b", line, re.IGNORECASE):
            raw_year = int(match.group(1))
            year = raw_year if raw_year >= 100 else 2000 + raw_year
            if year not in fiscal_years:
                fiscal_years.append(year)
    if not fiscal_years:
        return []

    ytd_match = re.search(r"\bQ([1-4])\s*YTD\b", header_text, re.IGNORECASE)
    if ytd_match:
        fiscal_quarter = int(ytd_match.group(1))
        target_years = [fiscal_years[-1]] if annual_header and fiscal_years else fiscal_years
        return [
            _period_column_spec(
                _fiscal_quarter_period_end(fiscal_year, fiscal_quarter, end_month, end_day),
                fiscal_year=fiscal_year,
                fiscal_quarter=fiscal_quarter,
                span=fiscal_quarter,
            )
            for fiscal_year in target_years
        ]

    quarter_tokens: list[int] = []
    index = 0
    while index < len(header_lines):
        line = header_lines[index].strip()
        normalized_line = _normalize_key(line)
        matched = False
        for token, quarter_number in FISCAL_QUARTER_NAME_MAP.items():
            token_key = _normalize_key(token)
            if token_key and normalized_line == token_key:
                next_key = _normalize_key(header_lines[index + 1]) if index + 1 < len(header_lines) else ""
                if next_key == "quarter":
                    quarter_tokens.append(quarter_number)
                    index += 2
                    matched = True
                    break
            if token_key and normalized_line == f"{token_key}quarter":
                quarter_tokens.append(quarter_number)
                index += 1
                matched = True
                break
        if matched:
            continue
        inline_tokens = re.findall(r"\b(first|second|third|fourth|1st|2nd|3rd|4th|q[1-4])\s+quarter\b", line, re.IGNORECASE)
        if inline_tokens:
            quarter_tokens.extend(FISCAL_QUARTER_NAME_MAP[str(token).lower()] for token in inline_tokens)
        index += 1

    if not quarter_tokens:
        return []

    columns: list[dict[str, Any]] = []
    token_index = 0
    for year_index, fiscal_year in enumerate(fiscal_years):
        del year_index
        year_quarters = quarter_tokens[token_index : token_index + 4]
        if not year_quarters:
            break
        for fiscal_quarter in year_quarters:
            period_end = _fiscal_quarter_period_end(fiscal_year, fiscal_quarter, end_month, end_day)
            columns.append(_period_column_spec(period_end, fiscal_year=fiscal_year, fiscal_quarter=fiscal_quarter))
        token_index += len(year_quarters)
    return columns


def _quarter_from_month_end(year: int, month: int, day: int, *, span: int = 1) -> dict[str, Any]:
    quarter_number = ((month - 1) // 3) + 1
    return _period_column_spec(date(year, month, _clamp_day(year, month, day)), fiscal_year=year, fiscal_quarter=quarter_number, span=span)


def _chinese_quarter_headers_from_lines(lines: list[str]) -> list[dict[str, Any]]:
    header_text = " ".join(lines[:24])
    columns: list[dict[str, Any]] = []

    chinese_span_map = {"3": 1, "三": 1, "6": 2, "六": 2, "9": 3, "九": 3, "12": 4, "十二": 4}
    for match in re.finditer(r"截至\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日止\s*(12|[369]|十二|三|六|九)\s*个月期间", header_text):
        span = chinese_span_map.get(match.group(4), 1)
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))
        columns.append(_quarter_from_month_end(year, month, day, span=span))
    if columns:
        return columns

    for match in re.finditer(r"(\d{4})\s*年\s*(\d{1,2})\s*[-至]\s*(\d{1,2})\s*月", header_text):
        year = int(match.group(1))
        start_month = int(match.group(2))
        end_month = int(match.group(3))
        if (start_month, end_month) not in {(1, 3), (4, 6), (7, 9), (10, 12)}:
            continue
        columns.append(_quarter_from_month_end(year, end_month, calendar.monthrange(year, end_month)[1]))
    return columns


def _document_period_context(page_texts: list[str]) -> dict[str, Any]:
    cover_text = " ".join(str(page or "") for page in page_texts[:6])
    report_year_match = re.search(r"(\d{4})\s*年", cover_text)
    if not report_year_match:
        return {}
    report_year = int(report_year_match.group(1))
    if re.search(rf"{report_year}\s*年\s*第?\s*([一二三四1-4])\s*季度报告", cover_text):
        quarter_map = {"一": 1, "二": 2, "三": 3, "四": 4, "1": 1, "2": 2, "3": 3, "4": 4}
        quarter_match = re.search(rf"{report_year}\s*年\s*第?\s*([一二三四1-4])\s*季度报告", cover_text)
        report_quarter = quarter_map[str(quarter_match.group(1))]
        report_type = "quarterly"
    elif re.search(rf"{report_year}\s*年\s*半年度报告", cover_text):
        report_quarter = 2
        report_type = "half-year"
    elif re.search(rf"{report_year}\s*年\s*年度报告", cover_text):
        report_quarter = 4
        report_type = "annual"
    else:
        return {}
    return {
        "reportType": report_type,
        "reportYear": report_year,
        "reportQuarter": report_quarter,
        "currentQuarter": f"{report_year}Q{report_quarter}",
        "priorYearQuarter": f"{report_year - 1}Q{report_quarter}",
    }


def _inferred_chinese_cumulative_columns(lines: list[str], document_context: dict[str, Any]) -> list[dict[str, Any]]:
    if not document_context:
        return []
    header_text = " ".join(lines[:40])
    if not any(token in header_text for token in ("利润表", "损益表")):
        return []
    if "年初到报告期末" not in header_text and "年初至报告期末" not in header_text and "本期发生额" not in header_text:
        return []
    report_year = int(document_context.get("reportYear") or 0)
    report_quarter = int(document_context.get("reportQuarter") or 0)
    if report_year <= 0 or report_quarter <= 0:
        return []
    period_end_month = report_quarter * 3
    period_end_day = calendar.monthrange(report_year, period_end_month)[1]
    current = _quarter_from_month_end(report_year, period_end_month, period_end_day, span=report_quarter)
    prior = _quarter_from_month_end(report_year - 1, period_end_month, calendar.monthrange(report_year - 1, period_end_month)[1], span=report_quarter)
    return [current, prior]


def _pipe_grid_cells(lines: list[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in lines[:16]:
        if "|" not in str(line or ""):
            continue
        cells = [cell.strip() for cell in str(line).split("|")]
        if len(cells) < 2:
            continue
        rows.append(cells)
    return rows


def _span_from_header_cell(cell: str) -> int | None:
    normalized = _normalize_key(cell)
    if not normalized:
        return None
    if "quarterended" in normalized or "threemonthsended" in normalized:
        return 1
    if "sixmonthsended" in normalized:
        return 2
    if "ninemonthsended" in normalized:
        return 3
    if "yearended" in normalized or "twelvemonthsended" in normalized:
        return 4
    return None


def _quarter_columns_from_pipe_grid(lines: list[str]) -> list[dict[str, Any]]:
    cell_rows = _pipe_grid_cells(lines)
    if not cell_rows:
        return []

    span_row_index: int | None = None
    spans: list[int] = []
    for row_index, row in enumerate(cell_rows):
        candidate_spans = [_span_from_header_cell(cell) for cell in row]
        candidate_spans = [span for span in candidate_spans if span is not None]
        if candidate_spans:
            span_row_index = row_index
            spans = candidate_spans
            break
    if span_row_index is None or not spans:
        return []

    header_rows = cell_rows[span_row_index : min(span_row_index + 4, len(cell_rows))]
    month_day_labels: list[str] = []
    years: list[int] = []
    for row in header_rows:
        for cell in row:
            month_day_labels.extend(match.group(0) for match in re.finditer(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}", cell, re.IGNORECASE))
            years.extend(int(match.group(1)) for match in re.finditer(r"\b(20\d{2})\b", cell))

    if not years or not month_day_labels:
        return []

    group_size = max(len(years) // max(len(spans), 1), 1)
    if len(years) < len(spans):
        return []

    columns: list[dict[str, Any]] = []
    year_index = 0
    for span_index, span in enumerate(spans):
        month_day_label = month_day_labels[min(span_index, len(month_day_labels) - 1)]
        current_group_size = group_size
        remaining_spans = len(spans) - span_index
        remaining_years = len(years) - year_index
        if remaining_spans > 0:
            current_group_size = max(1, remaining_years // remaining_spans)
        for _ in range(current_group_size):
            if year_index >= len(years):
                break
            year = years[year_index]
            year_index += 1
            parsed = _quarter_from_date_label(month_day_label, str(year))
            if parsed is None:
                continue
            parsed_year, quarter_number, _period_end = parsed
            columns.append(
                _period_column_spec(
                    date.fromisoformat(_quarter_period_end(parsed_year, quarter_number)),
                    fiscal_year=parsed_year,
                    fiscal_quarter=quarter_number,
                    span=span,
                )
            )
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for column in columns:
        key = (str(column.get("quarter") or ""), int(column.get("statementSpanQuarters") or 1))
        if not key[0] or key in seen:
            continue
        seen.add(key)
        deduped.append(column)
    return deduped


def _quarter_columns_from_lines(lines: list[str], *, document_context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    pipe_grid_columns = _quarter_columns_from_pipe_grid(lines)
    if pipe_grid_columns:
        return pipe_grid_columns

    columns: list[dict[str, Any]] = []
    for line in lines[:12]:
        for match in re.finditer(r"\bQ([1-4])\s+(\d{4})\b", line):
            year = int(match.group(2))
            quarter_number = int(match.group(1))
            columns.append(_period_column_spec(date.fromisoformat(_quarter_period_end(year, quarter_number)), fiscal_year=year, fiscal_quarter=quarter_number))
        for match in re.finditer(r"\b([1-4])Q(?:\s*|[-/']?)(\d{2,4})\b", line, re.IGNORECASE):
            raw_year = int(match.group(2))
            year = raw_year if raw_year >= 100 else 2000 + raw_year
            quarter_number = int(match.group(1))
            columns.append(_period_column_spec(date.fromisoformat(_quarter_period_end(year, quarter_number)), fiscal_year=year, fiscal_quarter=quarter_number))
        for match in re.finditer(r"\b(\d{4})\s*Q([1-4])\b", line, re.IGNORECASE):
            year = int(match.group(1))
            quarter_number = int(match.group(2))
            columns.append(_period_column_spec(date.fromisoformat(_quarter_period_end(year, quarter_number)), fiscal_year=year, fiscal_quarter=quarter_number))
    if columns:
        deduped: list[dict[str, Any]] = []
        seen: set[str] = set()
        for column in columns:
            quarter = str(column.get("quarter") or "")
            if quarter in seen:
                continue
            seen.add(quarter)
            deduped.append(column)
        return deduped

    fiscal_columns = _fiscal_header_quarters_from_lines(lines)
    if fiscal_columns:
        return fiscal_columns

    for index, line in enumerate(lines[:12]):
        normalized_line = _normalize_key(line)
        span = 0
        if "threemonthsended" in normalized_line or "quarterended" in normalized_line:
            span = 1
        elif "sixmonthsended" in normalized_line:
            span = 2
        elif "ninemonthsended" in normalized_line:
            span = 3
        elif "yearended" in normalized_line or "twelvemonthsended" in normalized_line:
            span = 4
        if span <= 0:
            continue
        years: list[int] = []
        for probe in lines[index : index + 4]:
            years.extend(int(match.group(1)) for match in re.finditer(r"\b(20\d{2})\b", probe))
        month_day_match = re.search(
            r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}",
            " ".join(lines[index : index + 2]),
            re.IGNORECASE,
        )
        if not month_day_match or not years:
            continue
        extracted: list[dict[str, Any]] = []
        for year in years[:2]:
            parsed = _quarter_from_date_label(month_day_match.group(0), str(year))
            if parsed is None:
                continue
            parsed_year, quarter_number, _ = parsed
            extracted.append(_period_column_spec(date.fromisoformat(_quarter_period_end(parsed_year, quarter_number)), fiscal_year=parsed_year, fiscal_quarter=quarter_number, span=span))
        if extracted:
            return extracted
    chinese_columns = _chinese_quarter_headers_from_lines(lines)
    if chinese_columns:
        return chinese_columns
    inferred_columns = _inferred_chinese_cumulative_columns(lines, document_context or {})
    if inferred_columns:
        return inferred_columns
    return []


def _is_segment_statement_page(lines: list[str]) -> bool:
    if not lines:
        return False
    footer_text = " ".join(lines[-8:]).lower()
    if not footer_text:
        return False
    return bool(
        re.search(r"\b(segment|division|business unit)\b", footer_text)
        and not re.search(r"\b(segments|segment information|segment data)\b", footer_text)
    )


def _looks_like_statement_continuation(parsed_rows: list[dict[str, Any]]) -> bool:
    field_names = {str(row.get("fieldName") or "") for row in parsed_rows if row.get("fieldName")}
    if not field_names:
        return False
    if field_names & {"revenue", "costOfRevenue", "grossProfit", "operatingIncome", "salesAndMarketing", "generalAndAdministrative", "rnd"}:
        return False
    return bool(field_names & {"pretaxIncome", "tax", "netIncome"})


def _line_number_count(line: str) -> int:
    return sum(1 for token in _normalize_text_space(line).split(" ") if _parse_number_token(token) is not None)


def _candidate_row_texts(lines: list[str]) -> list[tuple[int, str]]:
    candidates: list[tuple[int, str]] = []
    total_lines = len(lines)
    for index, line in enumerate(lines):
        candidates.append((index, line))
        if _line_number_count(line) == 0:
            combined = line
            for offset in (1, 2):
                if index + offset >= total_lines:
                    break
                combined = f"{combined} {lines[index + offset]}".strip()
                if _line_number_count(combined) > 0:
                    candidates.append((index, combined))
        elif _line_number_count(line) < 2 and index + 1 < total_lines and _line_number_count(lines[index + 1]) > 0:
            candidates.append((index, f"{line} {lines[index + 1]}".strip()))
    return candidates


def _extract_label_and_values(line: str) -> tuple[str, list[float]]:
    cleaned = _normalize_text_space(line)
    if not cleaned:
        return "", []
    tokens = cleaned.split(" ")
    label_tokens: list[str] = []
    number_tokens: list[float] = []
    numeric_started = False
    for token in tokens:
        parsed = _parse_number_token(token)
        if parsed is None:
            if not numeric_started:
                label_tokens.append(token)
            continue
        numeric_started = True
        number_tokens.append(float(parsed))
    return (" ".join(label_tokens).strip(), number_tokens)


def _clean_statement_label(label: str) -> str:
    cleaned = _normalize_text_space(label).strip().strip(":：")
    while cleaned:
        next_cleaned = re.sub(r"^(?:[一二三四五六七八九十]+[、.．:：)]*|[0-9ivxIVX]+[、.．:：)]*)", "", cleaned).strip()
        next_cleaned = re.sub(r"^(?:加|减|其中)[：:\s]*", "", next_cleaned).strip()
        if next_cleaned == cleaned:
            break
        cleaned = next_cleaned
    return cleaned


def _parse_rows_from_lines(lines: list[str]) -> list[dict[str, Any]]:
    best_by_index: dict[int, dict[str, Any]] = {}
    for line_index, candidate in _candidate_row_texts(lines):
        label, values = _extract_label_and_values(candidate)
        label = _clean_statement_label(label)
        field_name = _match_field(label) if label else None
        if not label:
            continue
        if not values and not str(candidate).strip().endswith(":") and field_name not in {"costOfRevenue", "operatingExpenses"}:
            continue
        parsed = {
            "lineIndex": line_index,
            "label": label,
            "normalizedLabel": _normalize_key(label),
            "values": values,
            "fieldName": field_name,
        }
        current = best_by_index.get(line_index)
        if current is not None and not current.get("values") and current.get("fieldName") in {"costOfRevenue", "operatingExpenses"}:
            continue
        if current is None or len(values) > len(current.get("values") or []) or (len(values) == len(current.get("values") or []) and len(label) > len(str(current.get("label") or ""))):
            best_by_index[line_index] = parsed
    return [best_by_index[index] for index in sorted(best_by_index)]


def _match_field(label: str) -> str | None:
    normalized = _normalize_key(label)
    if not normalized:
        return None
    for field_name, aliases in ROW_ALIASES.items():
        for alias in aliases:
            alias_key = _normalize_key(alias)
            if normalized == alias_key or normalized.startswith(alias_key) or normalized.endswith(alias_key):
                return field_name
    return None


def _row_series_from_parsed_rows(parsed_rows: list[dict[str, Any]], expected_count: int) -> dict[str, list[float]]:
    series: dict[str, list[float]] = {}
    for row in parsed_rows:
        label = str(row.get("label") or "")
        values = row.get("values") or []
        if len(values) < expected_count or not label:
            continue
        field_name = row.get("fieldName")
        if field_name is None:
            continue
        if len(values) >= expected_count + 1 and abs(values[0] - round(values[0])) < 1e-9 and 0 <= values[0] <= 999:
            trailing_values = values[1 : expected_count + 1]
            if trailing_values and max(abs(value) for value in trailing_values) > max(abs(values[0]) * 100, 10_000):
                values = trailing_values
        picked = values[:expected_count]
        if field_name in EXPENSE_ABSOLUTE_FIELDS:
            picked = [abs(value) for value in picked]
        current = series.get(field_name)
        if current is None or len(picked) > len(current):
            series[field_name] = picked
    return series


def _infer_scale_from_revenue_values(values: list[float], base_scale: float) -> float:
    if base_scale != 1 or not values:
        return base_scale
    max_abs = max(abs(value) for value in values)
    if max_abs >= 100_000:
        return 1_000
    if max_abs >= 100:
        return 1_000_000
    return 1


def _section_detail_rows(
    parsed_rows: list[dict[str, Any]],
    *,
    section_keys: set[str],
    total_keys: set[str],
    expected_count: int,
    stop_fields: set[str] | None = None,
) -> list[dict[str, Any]]:
    section_start: int | None = None
    stop_fields = set(stop_fields or set())
    for row in parsed_rows:
        normalized_label = str(row.get("normalizedLabel") or "")
        row_values = row.get("values") or []
        if normalized_label in section_keys and not row_values:
            section_start = int(row.get("lineIndex") or 0)
            continue
        if section_start is None:
            continue
        if normalized_label in total_keys:
            break
    if section_start is None:
        return []

    detail_rows: list[dict[str, Any]] = []
    seen_labels: set[str] = set()
    for row in parsed_rows:
        line_index = int(row.get("lineIndex") or 0)
        normalized_label = str(row.get("normalizedLabel") or "")
        field_name = str(row.get("fieldName") or "")
        values = row.get("values") or []
        if line_index <= section_start:
            continue
        if normalized_label in total_keys:
            break
        if field_name in stop_fields or any(token in normalized_label for token in GENERIC_BREAKDOWN_STOP_TOKENS):
            break
        if len(values) < expected_count:
            continue
        if normalized_label.startswith("total") or normalized_label in section_keys:
            continue
        if normalized_label in seen_labels:
            continue
        seen_labels.add(normalized_label)
        detail_rows.append(row)
    return detail_rows


def _generic_breakdown_items(
    parsed_rows: list[dict[str, Any]],
    *,
    section_keys: set[str],
    total_keys: set[str],
    expected_count: int,
    scale: float,
    source_url: str,
) -> dict[int, list[dict[str, Any]]]:
    detail_rows = _section_detail_rows(
        parsed_rows,
        section_keys=section_keys,
        total_keys=total_keys,
        expected_count=expected_count,
        stop_fields=GENERIC_BREAKDOWN_STOP_FIELDS,
    )
    per_column: dict[int, list[dict[str, Any]]] = {}
    for row in detail_rows:
        label = str(row.get("label") or "").strip()
        if not label:
            continue
        values = row.get("values") or []
        for index in range(expected_count):
            raw_value = values[index] if index < len(values) else None
            if raw_value is None or abs(raw_value) <= 0:
                continue
            per_column.setdefault(index, []).append(
                _make_breakdown_item(
                    label,
                    label,
                    abs(raw_value) * scale,
                    value_format="negative-parentheses",
                    source_url=source_url,
                )
            )
    return per_column


def _first_money_number(text: str) -> float | None:
    for match in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", text):
        end = match.end()
        if end < len(text) and text[end] == "%":
            continue
        token = match.group(0).replace(",", "")
        try:
            return float(token)
        except Exception:
            continue
    return None


def _quarter_number_from_text(text: str) -> int | None:
    normalized = str(text or "").lower()
    for token, quarter_number in (
        ("first quarter", 1),
        ("1st quarter", 1),
        ("q1", 1),
        ("second quarter", 2),
        ("2nd quarter", 2),
        ("q2", 2),
        ("third quarter", 3),
        ("3rd quarter", 3),
        ("q3", 3),
        ("fourth quarter", 4),
        ("4th quarter", 4),
        ("q4", 4),
    ):
        if token in normalized:
            return quarter_number
    return None


def _extract_scaled_values_from_line(line: str) -> list[float]:
    if "|" in str(line or ""):
        pipe_values: list[float] = []
        unit_pattern = r"(b\s*i\s*l\s*l\s*i\s*o\s*n|m\s*i\s*l\s*l\s*i\s*o\s*n)"
        for cell in [segment.strip() for segment in str(line or "").split("|")[1:]]:
            for match in re.finditer(rf"\$?\s*(\d[\d,]*(?:\.\d+)?)\s*{unit_pattern}\b", cell, re.IGNORECASE):
                raw_value = float(str(match.group(1) or "0").replace(",", ""))
                unit = re.sub(r"\s+", "", str(match.group(2) or "").lower())
                scale = 1_000_000_000 if unit == "billion" else 1_000_000
                pipe_values.append(raw_value * scale)
                break
        if len(pipe_values) >= 2:
            return pipe_values
    values: list[float] = []
    unit_pattern = r"(b\s*i\s*l\s*l\s*i\s*o\s*n|m\s*i\s*l\s*l\s*i\s*o\s*n)"
    for match in re.finditer(rf"\$?\s*(\d[\d,]*(?:\.\d+)?)\s*{unit_pattern}\b", str(line or ""), re.IGNORECASE):
        raw_value = float(str(match.group(1) or "0").replace(",", ""))
        unit = re.sub(r"\s+", "", str(match.group(2) or "").lower())
        scale = 1_000_000_000 if unit == "billion" else 1_000_000
        values.append(raw_value * scale)
    return values


def _release_summary_period_entries(page_texts: list[str], source_url: str, filing_date: str) -> tuple[list[dict[str, Any]], set[int]]:
    entries: list[dict[str, Any]] = []
    skip_pages: set[int] = set()
    for page_index, page_text in enumerate(page_texts[:3]):
        page_entry_count_before = len(entries)
        lines = [_normalize_text_space(line) for line in str(page_text or "").splitlines()]
        lines = [line for line in lines if line]
        if not lines:
            continue
        page_header = " ".join(lines[:40])
        normalized_header = page_header.lower()
        if "quarter ended" not in normalized_header:
            continue
        if not any(
            token in normalized_header
            for token in (
                "financial results for the quarter ended",
                "results for the quarter ended",
                "consolidated results for the quarter ended",
            )
        ):
            continue
        fiscal_years = [int(match.group(1)) for match in re.finditer(r"Fiscal\s+(20\d{2})", page_header, re.IGNORECASE)]
        if len(fiscal_years) < 2:
            continue
        quarter_number = _quarter_number_from_text(page_header)
        ended_match = re.search(
            r"quarter ended\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})",
            page_header,
            re.IGNORECASE,
        )
        release_date_match = re.search(
            r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*(20\d{2})",
            page_header,
            re.IGNORECASE,
        )
        if quarter_number is None or ended_match is None:
            continue
        current_end_year = int(release_date_match.group(2)) if release_date_match else int(filing_date[:4]) if filing_date else fiscal_years[0]
        month_label = ended_match.group(1)
        day_label = ended_match.group(2)
        current_parsed = _quarter_from_date_label(f"{month_label} {day_label}", str(current_end_year))
        prior_parsed = _quarter_from_date_label(f"{month_label} {day_label}", str(current_end_year - 1))
        if current_parsed is None or prior_parsed is None:
            continue
        current_year, current_calendar_quarter, current_period_end = current_parsed
        prior_year, prior_calendar_quarter, prior_period_end = prior_parsed
        summary_rows: dict[str, list[float]] = {}
        for line in lines:
            normalized_line = str(line or "").lower()
            for row_name in ("revenue", "operating income", "net income"):
                if normalized_line.startswith(row_name):
                    values = _extract_scaled_values_from_line(line)
                    if len(values) >= 3:
                        summary_rows[row_name] = values
        if not summary_rows:
            continue
        current_entry = _build_financial_entry(
            f"{current_year}Q{current_calendar_quarter}",
            "USD",
            current_period_end,
            str(fiscal_years[0]),
            f"Q{quarter_number}",
            revenue_value=(summary_rows.get("revenue") or [None])[0],
            operating_income_value=(summary_rows.get("operating income") or [None])[0],
            net_income_value=(summary_rows.get("net income") or [None])[0],
        )
        prior_entry = _build_financial_entry(
            f"{prior_year}Q{prior_calendar_quarter}",
            "USD",
            prior_period_end,
            str(fiscal_years[1]),
            f"Q{quarter_number}",
            revenue_value=(summary_rows.get("revenue") or [None, None, None])[2],
            operating_income_value=(summary_rows.get("operating income") or [None, None, None])[2],
            net_income_value=(summary_rows.get("net income") or [None, None, None])[2],
        )
        for entry in (current_entry, prior_entry):
            if entry.get("revenueBn") is None and entry.get("operatingIncomeBn") is None and entry.get("netIncomeBn") is None:
                continue
            entry["statementSource"] = "generic-ir-pdf-release-summary"
            entry["statementSourceUrl"] = source_url
            entry["statementFilingDate"] = filing_date
            entry["statementSpanQuarters"] = 1
            entry["statementValueMode"] = "direct"
            entries.append(entry)
        if len(entries) > page_entry_count_before:
            skip_pages.add(page_index)
    return (entries, skip_pages)


def _is_non_gaap_reconciliation_page(lines: list[str]) -> bool:
    header_text = " ".join(lines[:20]).lower()
    return "reconciliations of non-gaap financial measures" in header_text or "impact per diluted share" in header_text


def _chinese_quarter_report_summary_period_entries(page_texts: list[str], source_url: str, filing_date: str) -> list[dict[str, Any]]:
    document_context = _document_period_context(page_texts)
    cover_text = " ".join(str(page or "") for page in page_texts[:6])
    if document_context.get("reportType") != "quarterly":
        return []
    report_year = int(document_context.get("reportYear") or 0)
    report_quarter = int(document_context.get("reportQuarter") or 0)
    if report_year <= 0 or report_quarter <= 0:
        return []
    quarter = f"{report_year}Q{report_quarter}"
    period_end = _quarter_period_end(report_year, report_quarter)

    for page_text in page_texts[:12]:
        lines = [_normalize_text_space(line) for line in str(page_text or "").splitlines()]
        lines = [line for line in lines if line]
        if not lines or not any("本报告期" in line for line in lines):
            continue
        revenue_value: float | None = None
        for _line_index, candidate in _candidate_row_texts(lines):
            cleaned_label, _values = _extract_label_and_values(candidate)
            cleaned_label = _clean_statement_label(cleaned_label)
            normalized_label = _normalize_key(cleaned_label)
            if normalized_label not in {"营业收入元", "营业收入"}:
                continue
            suffix = candidate.split(cleaned_label, 1)[1] if cleaned_label in candidate else candidate
            revenue_value = _first_money_number(suffix)
            if revenue_value is not None:
                break
        if revenue_value is None or revenue_value <= 0:
            continue
        entry = _build_financial_entry(
            quarter,
            "CNY" if document_context else ("CNY" if any(token in cover_text for token in ("人民币", "元）", "季度报告")) else "USD"),
            period_end,
            str(report_year),
            f"Q{report_quarter}",
            revenue_value=revenue_value,
        )
        entry["statementSource"] = "generic-ir-pdf-summary"
        entry["statementSourceUrl"] = source_url
        entry["statementFilingDate"] = filing_date
        entry["statementSpanQuarters"] = 1
        entry["statementValueMode"] = "direct"
        entry["qualityFlags"] = ["summary-quarter-report"]
        return [entry]
    return []


def _score_entry(entry: dict[str, Any]) -> tuple[int, int, int, int, int, int]:
    field_count = sum(
        1
        for key in ("revenueBn", "costOfRevenueBn", "grossProfitBn", "operatingIncomeBn", "pretaxIncomeBn", "taxBn", "netIncomeBn")
        if entry.get(key) is not None
    )
    has_breakdown = int(bool(entry.get("officialOpexBreakdown")))
    has_cost = int(entry.get("costOfRevenueBn") is not None)
    source = str(entry.get("statementSource") or "")
    source_rank = 2 if source == "generic-ir-pdf-release-summary" else 1 if source == "generic-ir-pdf-summary" else 0
    value_mode = str(entry.get("statementValueMode") or "").lower()
    direct_rank = 2 if value_mode == "direct" else 1 if value_mode == "derived" else 0
    revenue_magnitude = int(round(abs(float(entry.get("revenueBn") or 0)) * 1000))
    return (field_count, has_breakdown, has_cost, source_rank, direct_rank, revenue_magnitude)


def _latest_consecutive_quarter_run_length(quarters: list[str]) -> int:
    ordered = sorted({str(quarter or "") for quarter in quarters if quarter}, key=_period_key)
    if not ordered:
        return 0
    try:
        previous_year = int(ordered[-1][:4])
        previous_quarter = int(ordered[-1][-1])
    except (TypeError, ValueError):
        return 0
    run_length = 1
    for quarter in reversed(ordered[:-1]):
        try:
            year = int(quarter[:4])
            quarter_number = int(quarter[-1])
        except (TypeError, ValueError):
            break
        expected_year = previous_year
        expected_quarter = previous_quarter - 1
        if expected_quarter == 0:
            expected_year -= 1
            expected_quarter = 4
        if (year, quarter_number) != (expected_year, expected_quarter):
            break
        run_length += 1
        previous_year = year
        previous_quarter = quarter_number
    return run_length


def _has_target_history_window(
    period_entries: list[dict[str, Any]],
    *,
    target_quarters: int,
) -> bool:
    if not period_entries:
        return False
    finalized = finalize_period_entries(period_entries, merge_entry=_merge_entry, score_entry=_score_entry)
    return _latest_consecutive_quarter_run_length(list(finalized.keys())) >= max(int(target_quarters or 0), 1)


def _is_low_quality_statement_entry(entry: dict[str, Any]) -> bool:
    if "summary-quarter-report" in set(entry.get("qualityFlags") or []):
        return False
    core_count = sum(
        1
        for key in ("revenueBn", "costOfRevenueBn", "grossProfitBn", "operatingExpensesBn", "operatingIncomeBn", "pretaxIncomeBn", "netIncomeBn")
        if entry.get(key) is not None
    )
    if core_count >= 2:
        return False
    return entry.get("taxBn") is None and entry.get("netIncomeBn") is None


def _period_entries_from_pdf_pages(page_texts: list[str], source_url: str, filing_date: str) -> list[dict[str, Any]]:
    release_summary_entries, skipped_summary_pages = _release_summary_period_entries(page_texts, source_url, filing_date)
    results: list[dict[str, Any]] = list(release_summary_entries)
    results.extend(_chinese_quarter_report_summary_period_entries(page_texts, source_url, filing_date))
    document_context = _document_period_context(page_texts)
    document_scale = _scale_from_text(" ".join(str(page or "") for page in page_texts[: min(len(page_texts), 120)]))
    active_quarter_columns: list[dict[str, Any]] = []
    for page_index, page_text in enumerate(page_texts):
        if page_index in skipped_summary_pages:
            continue
        lines = [_normalize_text_space(line) for line in str(page_text or "").splitlines()]
        lines = [line for line in lines if line]
        if len(lines) < 4:
            continue
        if _is_segment_statement_page(lines):
            continue
        if _is_non_gaap_reconciliation_page(lines):
            continue
        parsed_rows = _parse_rows_from_lines(lines)
        quarter_columns = _quarter_columns_from_lines(lines, document_context=document_context)
        if quarter_columns:
            active_quarter_columns = quarter_columns
        elif active_quarter_columns and _looks_like_statement_continuation(parsed_rows):
            quarter_columns = active_quarter_columns
        if not quarter_columns:
            continue
        expected_count = len(quarter_columns)
        explicit_scale = _explicit_scale_from_lines(lines)
        scale = explicit_scale if explicit_scale is not None else _scale_from_text(" ".join(lines[:8]))
        if explicit_scale is None and scale == 1 and document_scale != 1:
            scale = document_scale
        row_series = _row_series_from_parsed_rows(parsed_rows, expected_count)
        if not row_series:
            continue
        revenue_values = row_series.get("revenue") or []
        if explicit_scale is None:
            scale = _infer_scale_from_revenue_values(revenue_values, scale)
        generic_cost_breakdown = _generic_breakdown_items(
            parsed_rows,
            section_keys={"costofrevenue", "costofrevenues", "costofsales", "营业成本", "销售成本", "主营业务成本"},
            total_keys={"totalcostofrevenue", "totalcostofrevenues", "totalcostofsales", "costofrevenue", "costofrevenues", "costofsales", "营业成本", "销售成本", "主营业务成本"},
            expected_count=expected_count,
            scale=scale,
            source_url=source_url,
        )
        generic_opex_breakdown = _generic_breakdown_items(
            parsed_rows,
            section_keys={"operatingexpenses", "operatingexpense", "营业费用", "经营费用", "期间费用", "总营业费用"},
            total_keys={"totaloperatingexpenses", "operatingexpenses", "operatingexpense", "营业费用", "经营费用", "期间费用", "总营业费用"},
            expected_count=expected_count,
            scale=scale,
            source_url=source_url,
        )

        for index, column in enumerate(quarter_columns):
            quarter = str(column.get("quarter") or "")
            period_end = str(column.get("periodEnd") or "")
            fiscal_year_label = column.get("fiscalYear")
            fiscal_quarter_number = int(column.get("fiscalQuarter") or 0)
            statement_span_quarters = int(column.get("statementSpanQuarters") or 1)
            if _period_key(quarter) < (2018, 1):
                continue
            cost_values = row_series.get("costOfRevenue") or []
            gross_values = row_series.get("grossProfit") or []
            sgna_values = row_series.get("sgna") or []
            sales_marketing_values = row_series.get("salesAndMarketing") or []
            general_admin_values = row_series.get("generalAndAdministrative") or []
            rnd_values = row_series.get("rnd") or []
            fulfillment_values = row_series.get("fulfillment") or []
            taxes_surcharges_values = row_series.get("taxesAndSurcharges") or []
            finance_expense_values = row_series.get("financeExpense") or []
            operating_expenses_values = row_series.get("operatingExpenses") or []
            operating_income_values = row_series.get("operatingIncome") or []
            pretax_values = row_series.get("pretaxIncome") or []
            tax_values = row_series.get("tax") or []
            net_income_values = row_series.get("netIncome") or []

            revenue_raw = revenue_values[index] if len(revenue_values) == expected_count else None
            cost_raw = cost_values[index] if len(cost_values) == expected_count else None
            gross_raw = gross_values[index] if len(gross_values) == expected_count else None
            sgna_raw = sgna_values[index] if len(sgna_values) == expected_count else None
            sales_marketing_raw = sales_marketing_values[index] if len(sales_marketing_values) == expected_count else None
            general_admin_raw = general_admin_values[index] if len(general_admin_values) == expected_count else None
            rnd_raw = rnd_values[index] if len(rnd_values) == expected_count else None
            fulfillment_raw = fulfillment_values[index] if len(fulfillment_values) == expected_count else None
            taxes_surcharges_raw = taxes_surcharges_values[index] if len(taxes_surcharges_values) == expected_count else None
            finance_expense_raw = finance_expense_values[index] if len(finance_expense_values) == expected_count else None
            operating_expenses_raw = operating_expenses_values[index] if len(operating_expenses_values) == expected_count else None
            operating_income_raw = operating_income_values[index] if len(operating_income_values) == expected_count else None
            pretax_raw = pretax_values[index] if len(pretax_values) == expected_count else None
            tax_raw = tax_values[index] if len(tax_values) == expected_count else None
            net_income_raw = net_income_values[index] if len(net_income_values) == expected_count else None

            if gross_raw is None and revenue_raw is not None and cost_raw is not None:
                gross_raw = revenue_raw - cost_raw
            if sgna_raw is None:
                disclosed_sgna = sum(value for value in (sales_marketing_raw, general_admin_raw, fulfillment_raw) if value is not None)
                sgna_raw = disclosed_sgna or None
            if operating_expenses_raw is None and gross_raw is not None and operating_income_raw is not None:
                operating_expenses_raw = gross_raw - operating_income_raw

            entry_currency = _currency_from_text(" ".join(lines[:40]))
            if entry_currency == "USD" and document_context:
                entry_currency = "CNY"
            entry = _build_financial_entry(
                quarter,
                entry_currency,
                period_end,
                str(fiscal_year_label),
                f"Q{fiscal_quarter_number}",
                revenue_value=revenue_raw * scale if revenue_raw is not None else None,
                cost_value=cost_raw * scale if cost_raw is not None else None,
                gross_value=gross_raw * scale if gross_raw is not None else None,
                sgna_value=sgna_raw * scale if sgna_raw is not None else None,
                rnd_value=rnd_raw * scale if rnd_raw is not None else None,
                operating_expenses_value=operating_expenses_raw * scale if operating_expenses_raw is not None else None,
                operating_income_value=operating_income_raw * scale if operating_income_raw is not None else None,
                pretax_value=pretax_raw * scale if pretax_raw is not None else None,
                tax_value=tax_raw * scale if tax_raw is not None else None,
                net_income_value=net_income_raw * scale if net_income_raw is not None else None,
            )
            entry["statementSource"] = "generic-ir-pdf"
            entry["statementSourceUrl"] = source_url
            entry["statementFilingDate"] = filing_date
            entry["statementSpanQuarters"] = statement_span_quarters
            entry["statementValueMode"] = "direct" if statement_span_quarters == 1 else "cumulative"

            cost_items = generic_cost_breakdown.get(index) or []
            if cost_items:
                entry["officialCostBreakdown"] = cost_items

            opex_items = generic_opex_breakdown.get(index) or []
            if not opex_items:
                opex_items = []
                for raw_name, display_name, display_name_zh, value_format in OPTIONAL_BREAKDOWN_ROWS:
                    raw_value = {
                        "salesAndMarketing": sales_marketing_raw,
                        "generalAndAdministrative": general_admin_raw,
                        "rnd": rnd_raw,
                        "fulfillment": fulfillment_raw,
                        "taxesAndSurcharges": taxes_surcharges_raw,
                        "financeExpense": finance_expense_raw,
                    }.get(raw_name)
                    if raw_value is None or raw_value <= 0:
                        continue
                    opex_items.append(
                        _make_breakdown_item(
                            display_name,
                            display_name_zh,
                            raw_value * scale,
                            value_format=value_format,
                            source_url=source_url,
                        )
                    )
            if opex_items:
                entry["officialOpexBreakdown"] = opex_items
            if _is_low_quality_statement_entry(entry):
                continue
            results.append(entry)
    return results


def _entries_from_pdf_pages(page_texts: list[str], source_url: str, filing_date: str) -> dict[str, dict[str, Any]]:
    return finalize_period_entries(
        _period_entries_from_pdf_pages(page_texts, source_url, filing_date),
        merge_entry=_merge_entry,
        score_entry=_score_entry,
    )


def _currency_from_text(text: str) -> str:
    normalized = str(text or "").upper()
    for currency in ("USD", "EUR", "CNY", "RMB", "JPY", "TWD", "HKD", "GBP"):
        if currency in normalized:
            return "CNY" if currency == "RMB" else currency
    return "USD"


def _filing_pdf_candidates(cik: int, accession_nodash: str, primary_document: str, index_payload: dict[str, Any]) -> list[str]:
    names = [
        str(item.get("name") or "")
        for item in index_payload.get("directory", {}).get("item", [])
        if str(item.get("name") or "")
    ]
    pdf_names = [
        name
        for name in names
        if name.lower().endswith(".pdf")
    ]
    preferred = sorted(
        pdf_names,
        key=lambda name: (
            0 if any(token in name.lower() for token in ("ex99", "earn", "press", "release", "financial", "results")) else 1,
            name,
        ),
    )[:MAX_PDFS_PER_FILING]
    urls = [f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{name}" for name in preferred]

    primary_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{primary_document}"
    if primary_document.lower().endswith((".htm", ".html")):
        try:
            html_text = _quick_fetch_text(primary_url)
        except Exception:
            html_text = ""
        linked_pdf = _extract_first_pdf_link_from_html(html_text)
        if linked_pdf:
            urls.insert(0, urljoin(primary_url, unescape(linked_pdf)))
    deduped: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        deduped.append(url)
    return deduped[:MAX_PDFS_PER_FILING]


def _extract_pdf_links_from_html(page_url: str, html_text: str) -> list[str]:
    links: list[str] = []
    patterns = (
        r'href="([^"]+\.pdf(?:\?[^"]*)?)"',
        r"href='([^']+\.pdf(?:\?[^']*)?)'",
        r'["\']((?:https?:)?[^"\']+\.pdf(?:\?[^"\']*)?)["\']',
        r"\((https?://[^\s)]+\.pdf(?:\?[^\s)]*)?)\)",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, html_text, re.IGNORECASE):
            links.append(urljoin(page_url, unescape(match.group(1)).strip()))
    linked_pdf = _extract_first_pdf_link_from_html(html_text)
    if linked_pdf:
        links.append(urljoin(page_url, unescape(linked_pdf).strip()))
    deduped: list[str] = []
    seen: set[str] = set()
    for link in links:
        if link in seen:
            continue
        seen.add(link)
        deduped.append(link)
    return deduped


def _normalize_ir_url(url: str) -> str:
    normalized = str(url or "").strip()
    if normalized.startswith("http://"):
        return "https://" + normalized[len("http://") :]
    return normalized


def _extract_html_links_from_html(page_url: str, html_text: str, allowed_host: str) -> list[str]:
    links: list[str] = []
    for pattern in (r'href="([^"]+)"', r"href='([^']+)'", r"\((https?://[^\s)]+)\)"):
        for match in re.finditer(pattern, html_text, re.IGNORECASE):
            href = unescape(match.group(1)).strip()
            if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
                continue
            if href.lower().endswith(".pdf"):
                continue
            absolute = urljoin(page_url, href)
            parsed = urlparse(absolute)
            host = (parsed.netloc or "").lower()
            if not host:
                continue
            base_host = allowed_host.lower()
            if host != base_host and host != f"www.{base_host}" and not host.endswith(f".{base_host}"):
                continue
            path = parsed.path.lower()
            if not path or not any(token in path for token in ("invest", "result", "earn", "release", "press", "quarter", "financial", "news", "report")):
                continue
            links.append(absolute)
    deduped: list[str] = []
    seen: set[str] = set()
    for link in links:
        if link in seen:
            continue
        seen.add(link)
        deduped.append(link)
    return deduped


def _score_ir_url(url: str) -> tuple[int, int, int, int, str]:
    normalized = _normalize_ir_url(url).lower()
    if any(token in normalized for token in ("result", "earn", "quarter", "financial-supplement", "supplement", "stat-book")):
        primary = 0
    elif any(token in normalized for token in ("release", "financial")):
        primary = 1
    else:
        primary = 2
    if any(token in normalized for token in ("transcript", "presentation", "slides", "roadshow", "webcast", "overview", "policy", "codeconduct")):
        primary += 4
    if re.search(r"/[0-9a-f]{8}-[0-9a-f-]{27,}\.pdf(?:\?|$)", normalized):
        primary += 2
    if any(token in normalized for token in ("proxy", "annual-report", "annual+report", "presentation", "icr", "conference", "webcast")):
        primary += 3
    pdf_bias = 0 if normalized.endswith(".pdf") or ".pdf?" in normalized else 1
    years = [int(match.group(0)) for match in re.finditer(r"\b20\d{2}\b", normalized)]
    latest_year = max(years) if years else 0
    quarter_tokens = [int(match.group(1)) for match in re.finditer(r"\bq([1-4])\b", normalized)]
    latest_quarter = max(quarter_tokens) if quarter_tokens else 0
    return (primary, -latest_year, -latest_quarter, pdf_bias, url)


def _is_likely_ir_statement_pdf(url: str) -> bool:
    normalized = _normalize_ir_url(url).lower()
    excluded_tokens = (
        "transcript",
        "presentation",
        "slides",
        "roadshow",
        "webcast",
        "overview",
        "policy",
        "codeconduct",
        "proxy",
        "annual-meeting",
    )
    if any(token in normalized for token in excluded_tokens):
        return False
    preferred_tokens = (
        "earn",
        "result",
        "release",
        "stat-book",
        "statistical-book",
        "financial-supplement",
        "supplement",
        "10-q",
        "10-k",
        "20-f",
        "6-k",
    )
    return any(token in normalized for token in preferred_tokens)


def _is_promising_ir_html(url: str) -> bool:
    normalized = _normalize_ir_url(url).lower()
    return any(
        token in normalized
        for token in (
            "investor-news-details",
            "earnings-releases",
            "quarterly-results",
            "statistical-books",
            "financial-timeline",
            "financial-information",
            "results",
            "quarter",
            "earn",
            "release",
            "news",
            "report",
            "archive",
            "history",
        )
    )


def _official_ir_pdf_candidates(company: dict[str, Any]) -> list[str]:
    domain = _company_domain(company)
    if not domain:
        return []
    candidate_pages: list[str] = []
    localized_paths = ("", "/en", "/english", "/en-us")
    ir_paths = (
        "",
        "/investors",
        "/investor",
        "/investor-relations",
        "/financial-news",
        "/investors/financial-news",
        "/investors/news",
        "/news",
        "/results",
        "/quarterly-results",
    )
    for root in (
        f"https://{domain}",
        f"https://www.{domain}",
        f"https://investor.{domain}",
        f"https://ir.{domain}",
        f"https://investors.{domain}",
    ):
        for prefix in localized_paths:
            for path in ir_paths:
                url = f"{root}{prefix}{path}"
                if url not in candidate_pages:
                    candidate_pages.append(url)
    pdf_links: list[str] = []
    queued_pages = sorted(set(candidate_pages[:MAX_IR_ROOT_PAGES]), key=_score_ir_url)
    seen_pages: set[str] = set()
    crawl_budget = 0
    while queued_pages and crawl_budget < MAX_IR_CRAWL_PAGES:
        page_url = queued_pages.pop(0)
        normalized_page_url = _normalize_ir_url(page_url)
        if normalized_page_url in seen_pages:
            continue
        seen_pages.add(normalized_page_url)
        crawl_budget += 1
        try:
            html_text = _quick_fetch_text(normalized_page_url)
        except Exception:
            continue
        pdf_links.extend(_normalize_ir_url(link) for link in _extract_pdf_links_from_html(normalized_page_url, html_text))
        discovered_html_links = [
            _normalize_ir_url(link)
            for link in _extract_html_links_from_html(normalized_page_url, html_text, domain)
            if _is_promising_ir_html(link)
        ]
        for link in sorted(set(discovered_html_links), key=_score_ir_url)[:MAX_IR_DETAIL_PAGES]:
            if link not in seen_pages and link not in queued_pages:
                queued_pages.append(link)
        queued_pages = sorted(queued_pages, key=_score_ir_url)
    deduped: list[str] = []
    seen: set[str] = set()
    for link in pdf_links:
        if not _is_likely_ir_statement_pdf(link):
            continue
        if link in seen:
            continue
        seen.add(link)
        deduped.append(link)
    preferred = sorted(deduped, key=_score_ir_url)
    return preferred[:MAX_IR_PDF_CANDIDATES]


def fetch_generic_ir_pdf_history(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    path = _cache_path(str(company.get("id") or "company"))
    if path.exists() and not refresh:
        return _load_cached_json(path)

    result = {
        "id": company.get("id"),
        "ticker": company.get("ticker"),
        "quarters": [],
        "financials": {},
        "statementSource": "generic-ir-pdf",
        "statementSourceUrl": None,
        "errors": [],
        "filingsUsed": [],
    }
    period_entries: list[dict[str, Any]] = []
    cik = _resolve_cik(str(company.get("ticker") or ""), refresh=refresh)
    if cik is None:
        result["errors"].append("Unable to resolve SEC CIK; trying official IR PDFs.")
    else:
        try:
            submissions = _request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        except Exception as exc:  # noqa: BLE001
            submissions = None
            result["errors"].append(f"submissions: {exc}")

        if isinstance(submissions, dict):
            scanned = 0
            for form, accession, filing_date, primary_document in _submission_records(submissions):
                if scanned >= MAX_FILINGS_TO_SCAN:
                    break
                if filing_date < MIN_FILING_DATE or form not in SUPPORTED_FORMS:
                    continue
                accession_nodash = str(accession).replace("-", "")
                try:
                    index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
                except Exception:
                    continue
                pdf_urls = _filing_pdf_candidates(cik, accession_nodash, primary_document, index_payload)
                if not pdf_urls:
                    continue
                scanned += 1
                parsed_any = False
                for pdf_url in pdf_urls:
                    try:
                        page_texts = _extract_pdf_page_texts(pdf_url)
                    except Exception:
                        continue
                    parsed_period_entries = _period_entries_from_pdf_pages(page_texts, pdf_url, filing_date)
                    if not parsed_period_entries:
                        continue
                    parsed_any = True
                    period_entries.extend(parsed_period_entries)
                    result["filingsUsed"].append({"form": form, "filingDate": filing_date, "sourceUrl": pdf_url})
                    break
                if parsed_any and len({str(entry.get("calendarQuarter") or "") for entry in period_entries}) >= 8:
                    break

    if len({str(entry.get("calendarQuarter") or "") for entry in period_entries}) < 12:
        for pdf_url in _official_ir_pdf_candidates(company):
            try:
                page_texts = _extract_pdf_page_texts(pdf_url)
            except Exception:
                continue
            parsed_period_entries = _period_entries_from_pdf_pages(page_texts, pdf_url, "")
            if not parsed_period_entries:
                continue
            period_entries.extend(parsed_period_entries)
            result["filingsUsed"].append({"form": "IR-PDF", "filingDate": "", "sourceUrl": pdf_url})
            if _has_target_history_window(period_entries, target_quarters=TARGET_HISTORY_WINDOW_QUARTERS):
                break

    financials = finalize_period_entries(period_entries, merge_entry=_merge_entry, score_entry=_score_entry)
    result["quarters"] = sorted(financials.keys(), key=_period_key)
    result["financials"] = {quarter: financials[quarter] for quarter in result["quarters"]}
    _write_cached_json(path, result)
    return result
