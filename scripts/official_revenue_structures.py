from __future__ import annotations

import json
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from io import BytesIO
from html import unescape
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from official_financials import _extract_html_tables, _parse_number
from official_segments import (
    SegmentFact,
    _build_quarterly_series,
    _calendar_quarter,
    fetch_official_segment_history,
    _local_name,
    _parse_instance_facts,
    _period_key,
    _request,
    _request_json,
    _resolve_cik,
    _revenue_priority,
    _submission_records,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "official-revenue-structures"
OFFICIAL_SEGMENT_CACHE_DIR = ROOT_DIR / "data" / "cache" / "official-segments"
OFFICIAL_FINANCIAL_CACHE_DIR = ROOT_DIR / "data" / "cache" / "official-financials"
VISION_OCR_SWIFT = ROOT_DIR / "scripts" / "vision_ocr.swift"
VISION_OCR_BIN = CACHE_DIR / "vision-ocr"
CACHE_VERSION = "20260323-v6"

XBRL_AXIS_COMPANY_CONFIGS: dict[str, dict[str, Any]] = {
    "mastercard": {
        "axis": "ProductOrServiceAxis",
        "source": "official-filings-xbrl-axis",
        "style": "mastercard-revenue-bridge",
        "labels": {
            "paymentnetwork": "Payment network",
            "valueaddedservicesandsolutions": "Value-added services and solutions",
            "valueaddedservicessolutions": "Value-added services and solutions",
            "domesticassessments": "Domestic assessments",
            "crossbordervolumefees": "Cross-border volume fees",
            "transactionprocessing": "Transaction processing",
            "otherrevenues": "Other revenues",
        },
    },
    "netflix": {
        "axis": "ProductOrServiceAxis",
        "source": "official-filings-xbrl-axis",
        "style": "netflix-regional-revenue",
        "labels": {
            "unitedstatesandcanada": "UCAN",
            "unitedstatescanada": "UCAN",
            "emea": "EMEA",
            "latinamerica": "LATAM",
            "asiapacific": "APAC",
        },
    },
    "nvidia": {
        "axis": "ProductOrServiceAxis",
        "source": "official-filings-xbrl-axis",
        "labels": {
            "datacenter": "Data Center",
            "gaming": "Gaming",
            "professionalvisualization": "Professional Visualization",
            "automotive": "Automotive",
            "oemother": "OEM & Other",
        },
        "support_lines": {
            "datacenter": ["AI · cloud · DGX"],
            "gaming": ["GeForce · gaming GPUs"],
            "professionalvisualization": ["RTX workstation"],
            "automotive": ["Drive platform"],
            "oemother": ["OEM · legacy"],
        },
    },
}

SEGMENT_CACHE_HIERARCHY_CONFIGS: dict[str, dict[str, Any]] = {
    "apple": {
        "segments": [
            {
                "name": "Products",
                "memberKey": "products",
                "members": ["iphone", "mac", "ipad", "wearableshomeaccessories"],
            },
            {
                "name": "Services",
                "memberKey": "services",
                "members": ["services"],
            },
        ],
        "detailGroups": [
            {
                "name": "iPhone",
                "memberKey": "iphone",
                "members": ["iphone"],
                "targetName": "Products",
            },
            {
                "name": "Mac",
                "memberKey": "mac",
                "members": ["mac"],
                "targetName": "Products",
            },
            {
                "name": "iPad",
                "memberKey": "ipad",
                "members": ["ipad"],
                "targetName": "Products",
            },
            {
                "name": "Wearables",
                "memberKey": "wearables",
                "members": ["wearableshomeaccessories"],
                "targetName": "Products",
            },
        ],
    },
}

CUSTOM_XBRL_HIERARCHY_CONFIGS: dict[str, dict[str, Any]] = {
    "jnj": {
        "source": "official-filings-xbrl-hierarchy",
        "segments": [
            {
                "name": "Innovative Medicine",
                "memberKey": "innovativemedicine",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["InnovativeMedicineMember", "PharmaceuticalMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "Med Tech",
                "memberKey": "medtech",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["MedTechMember", "MedicalDevicesMember", "MedicalDevicesDiagnosticsMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "Consumer",
                "memberKey": "consumer",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["ConsumerMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
        ],
    },
    "coca-cola": {
        "source": "official-filings-xbrl-hierarchy",
        "segments": [
            {
                "name": "North America",
                "memberKey": "northamerica",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["NorthAmericaSegmentMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "EMEA",
                "memberKey": "emea",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["EuropeMiddleEastAfricaMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "Latin America",
                "memberKey": "latinamerica",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["LatinAmericaSegmentMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "Pacific",
                "memberKey": "pacific",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["PacificMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "Bottling Investments",
                "memberKey": "bottlinginvestments",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["BottlingInvestmentsMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
        ],
    },
    "chevron": {
        "source": "official-filings-xbrl-hierarchy",
        "segments": [
            {
                "name": "Upstream",
                "memberKey": "upstream",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["UpstreamSegmentMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis"],
                "aggregateMatches": True,
            },
            {
                "name": "Downstream",
                "memberKey": "downstream",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["DownstreamSegmentMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis"],
                "aggregateMatches": True,
            },
            {
                "name": "All Other Segments",
                "memberKey": "allothersegments",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["AllOtherSegmentsMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
        ],
    },
    "exxon": {
        "source": "official-filings-xbrl-hierarchy",
        "segments": [
            {
                "name": "Upstream",
                "memberKey": "upstream",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["UpstreamMember"],
                    "ProductOrServiceAxis": ["SalesAndOtherOperatingRevenueMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis", "ProductOrServiceAxis"],
                "aggregateMatches": True,
            },
            {
                "name": "Energy Products",
                "memberKey": "energyproducts",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["EnergyProductsMember"],
                    "ProductOrServiceAxis": ["SalesAndOtherOperatingRevenueMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis", "ProductOrServiceAxis"],
                "aggregateMatches": True,
            },
            {
                "name": "Chemical Products",
                "memberKey": "chemicalproducts",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["ChemicalProductsMember"],
                    "ProductOrServiceAxis": ["SalesAndOtherOperatingRevenueMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis", "ProductOrServiceAxis"],
                "aggregateMatches": True,
            },
            {
                "name": "Specialty Products",
                "memberKey": "specialtyproducts",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["SpecialtyProductsMember"],
                    "ProductOrServiceAxis": ["SalesAndOtherOperatingRevenueMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "StatementGeographicalAxis", "ProductOrServiceAxis"],
                "aggregateMatches": True,
            },
        ],
    },
    "meta": {
        "source": "official-filings-xbrl-hierarchy",
        "segments": [
            {
                "name": "Family Of Apps",
                "memberKey": "familyofapps",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["FamilyOfAppsMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
            {
                "name": "Reality Labs",
                "memberKey": "realitylabs",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["RealityLabsMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis"],
            },
        ],
        "detailGroups": [
            {
                "name": "Advertising",
                "memberKey": "advertising",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["FamilyOfAppsMember"],
                    "ProductOrServiceAxis": ["AdvertisingMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "ProductOrServiceAxis"],
                "targetName": "Family Of Apps",
            },
            {
                "name": "Other",
                "memberKey": "other",
                "filters": {
                    "StatementBusinessSegmentsAxis": ["FamilyOfAppsMember"],
                    "ProductOrServiceAxis": ["ServiceOtherMember", "OtherRevenueMember"],
                },
                "exactDimensions": ["StatementBusinessSegmentsAxis", "ProductOrServiceAxis"],
                "targetName": "Family Of Apps",
            },
        ],
    },
    "tesla": {
        "source": "official-filings-xbrl-hierarchy",
        "segments": [
            {
                "name": "Auto",
                "memberKey": "auto",
                "filters": {
                    "ProductOrServiceAxis": ["AutomotiveRevenuesMember"],
                },
                "exactDimensions": ["ProductOrServiceAxis"],
            },
            {
                "name": "Energy generation & storage",
                "memberKey": "energygenerationstorage",
                "filters": {
                    "ProductOrServiceAxis": ["EnergyGenerationAndStorageMember", "EnergyGenerationAndStorageSegmentMember"],
                },
                "exactDimensions": ["ProductOrServiceAxis"],
            },
            {
                "name": "Services",
                "memberKey": "services",
                "filters": {
                    "ProductOrServiceAxis": ["ServicesAndOtherMember"],
                },
                "exactDimensions": ["ProductOrServiceAxis"],
            },
        ],
        "detailGroups": [
            {
                "name": "Auto sales",
                "memberKey": "autosales",
                "filters": {
                    "ProductOrServiceAxis": ["AutomotiveSalesMember"],
                },
                "exactDimensions": ["ProductOrServiceAxis"],
                "targetName": "Auto",
            },
            {
                "name": "Regulatory credits",
                "memberKey": "regulatorycredits",
                "filters": {
                    "ProductOrServiceAxis": ["AutomotiveRegulatoryCreditsMember"],
                },
                "exactDimensions": ["ProductOrServiceAxis"],
                "targetName": "Auto",
            },
            {
                "name": "Leasing",
                "memberKey": "leasing",
                "filters": {
                    "ProductOrServiceAxis": ["AutomotiveLeasingMember", "AutomotiveLeasingDirectVehicleOperatingMember"],
                },
                "exactDimensions": ["ProductOrServiceAxis"],
                "targetName": "Auto",
            },
        ],
    },
}


def _cache_path(company_id: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{company_id}.json"


def _load_cached_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_cached_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_cached_filing_entries(company_id: str) -> list[dict[str, Any]]:
    path = OFFICIAL_SEGMENT_CACHE_DIR / f"{company_id}.json"
    if not path.exists():
        return []
    payload = _load_cached_json(path)
    return [item for item in payload.get("filingsUsed", []) if isinstance(item, dict)]


def _load_cached_financial_entries(company_id: str) -> list[tuple[str, dict[str, Any]]]:
    path = OFFICIAL_FINANCIAL_CACHE_DIR / f"{company_id}.json"
    if not path.exists():
        return []
    payload = _load_cached_json(path)
    quarters = sorted(payload.get("quarters", []), key=_period_key)
    financials = payload.get("financials", {})
    return [(quarter, financials.get(quarter) or {}) for quarter in quarters]


def _submission_filing_entries(cik: int) -> list[dict[str, Any]]:
    submissions = _request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    return [
        {
            "form": form,
            "accession": accession,
            "filingDate": filing_date,
            "primaryDocument": primary_document,
        }
        for form, accession, filing_date, primary_document in _submission_records(submissions)
    ]


def _merged_filing_entries(company_id: str, cik: int) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for filing in _submission_filing_entries(cik):
        accession = str(filing.get("accession") or "")
        if not accession:
            continue
        merged[accession] = dict(filing)
    for filing in _load_cached_filing_entries(company_id):
        accession = str(filing.get("accession") or "")
        if not accession:
            continue
        existing = merged.get(accession, {})
        merged[accession] = {**existing, **filing}
    return sorted(merged.values(), key=lambda item: str(item.get("filingDate") or ""), reverse=True)


def _previous_quarter(quarter: str) -> str | None:
    match = re.fullmatch(r"(\d{4})Q([1-4])", str(quarter))
    if not match:
        return None
    year = int(match.group(1))
    quarter_number = int(match.group(2))
    if quarter_number == 1:
        return f"{year - 1}Q4"
    return f"{year}Q{quarter_number - 1}"


def _quarter_window(end_quarter: str, span: int) -> list[str]:
    quarters = [end_quarter]
    cursor = end_quarter
    for _ in range(max(span - 1, 0)):
        cursor = _previous_quarter(cursor)
        if cursor is None:
            break
        quarters.append(cursor)
    return list(reversed(quarters))


def _combine_date_label(month_day_label: str, year_label: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", f"{month_day_label} {year_label}".replace(",", " ")).strip()
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})", cleaned)
    if not match:
        return None
    month_token = match.group(1).lower()
    month_map = {
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
    month = month_map.get(month_token)
    if month is None:
        return None
    return f"{int(match.group(3)):04d}-{month:02d}-{int(match.group(2)):02d}"


def _numeric_cells(row: list[str]) -> list[float]:
    values: list[float] = []
    for cell in row[1:]:
        if cell in {"$", "€", "NT$", "US$", "US"}:
            continue
        value = _parse_number(cell)
        if value is None:
            continue
        values.append(float(value))
    return values


def _find_slide_blocks(html_text: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    pattern = re.compile(r'<IMG\s+src="([^"]+)"[^>]*>\s*<DIV><FONT[^>]*>(.*?)</FONT>', re.IGNORECASE | re.DOTALL)
    for image_name, raw_text in pattern.findall(html_text):
        text = unescape(re.sub(r"<[^>]+>", " ", raw_text))
        text = re.sub(r"\s+", " ", text).strip()
        blocks.append({"image": image_name, "text": text})
    return blocks


def _instance_name_for_filing(cik: int, accession_nodash: str, filing: dict[str, Any]) -> str:
    instance_name = str(filing.get("instance") or "")
    if instance_name:
        return instance_name
    index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
    items = [str(item.get("name") or "") for item in index_payload.get("directory", {}).get("item", [])]
    instance_name = next((name for name in items if name.endswith("_htm.xml")), "")
    if instance_name:
        return instance_name
    return next(
        (
            name
            for name in items
            if name.endswith(".xml")
            and "lab" not in name.lower()
            and "def" not in name.lower()
            and "pre" not in name.lower()
            and "filingsummary" not in name.lower()
            and "metalink" not in name.lower()
        ),
        "",
    )


def _ensure_vision_ocr_binary() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    needs_build = not VISION_OCR_BIN.exists()
    if not needs_build:
        needs_build = VISION_OCR_BIN.stat().st_mtime < VISION_OCR_SWIFT.stat().st_mtime
    if needs_build:
        subprocess.run(["swiftc", str(VISION_OCR_SWIFT), "-o", str(VISION_OCR_BIN)], check=True)
    return VISION_OCR_BIN


def _ocr_image(url: str) -> str:
    binary = _ensure_vision_ocr_binary()
    with tempfile.TemporaryDirectory() as temp_dir:
        extension = Path(url).suffix or ".jpg"
        image_path = Path(temp_dir) / f"ocr-source{extension}"
        image_path.write_bytes(_request(url))
        result = subprocess.run([str(binary), str(image_path)], check=True, capture_output=True, text=True)
    return result.stdout


def _normalize_member_key(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(label).lower())


def _build_row(
    name: str,
    value_bn: float,
    *,
    member_key: str | None = None,
    source_url: str,
    source_form: str,
    filing_date: str,
    support_lines: list[str] | None = None,
    target_name: str | None = None,
    metric_mode: str | None = None,
    mix_pct: float | None = None,
    yoy_pct: float | None = None,
    qoq_pct: float | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "name": name,
        "memberKey": member_key or _normalize_member_key(name),
        "valueBn": round(float(value_bn), 3),
        "sourceUrl": source_url,
        "sourceForm": source_form,
        "filingDate": filing_date,
    }
    if support_lines:
        row["supportLines"] = support_lines
    if target_name:
        row["targetName"] = target_name
    if metric_mode:
        row["metricMode"] = metric_mode
    if mix_pct is not None:
        row["mixPct"] = round(float(mix_pct), 1)
    if yoy_pct is not None:
        row["yoyPct"] = round(float(yoy_pct), 2)
    if qoq_pct is not None:
        row["qoqPct"] = round(float(qoq_pct), 2)
    return row


def _build_quarter_rows_from_period_records(period_records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    direct_records: dict[str, dict[str, dict[str, Any]]] = {}
    cumulative_records = sorted(
        [record for record in period_records if int(record.get("span") or 0) > 1],
        key=lambda item: (_period_key(str(item.get("quarter"))), int(item.get("span") or 0)),
    )

    for record in period_records:
        if int(record.get("span") or 0) != 1:
            continue
        quarter = str(record.get("quarter") or "")
        quarter_rows = direct_records.setdefault(quarter, {})
        for row in record.get("rows", []):
            member_key = str(row.get("memberKey") or row.get("name") or "")
            if not member_key:
                continue
            quarter_rows[member_key] = row

    for record in cumulative_records:
        quarter = str(record.get("quarter") or "")
        span = int(record.get("span") or 0)
        if span <= 1:
            continue
        prior_quarters = _quarter_window(quarter, span)[:-1]
        if not prior_quarters or not all(item in direct_records for item in prior_quarters):
            continue
        current_rows = {str(row.get("memberKey") or row.get("name") or ""): row for row in record.get("rows", [])}
        if not current_rows:
            continue
        quarter_rows = direct_records.setdefault(quarter, {})
        derived_rows: dict[str, dict[str, Any]] = {}
        derivation_failed = False
        for member_key, row in current_rows.items():
            if member_key in quarter_rows:
                continue
            prior_total = 0.0
            for prior_quarter in prior_quarters:
                prior_row = direct_records.get(prior_quarter, {}).get(member_key)
                if prior_row is None:
                    derivation_failed = True
                    break
                prior_total += float(prior_row.get("valueBn") or 0)
            if derivation_failed:
                break
            derived_value = round(float(row.get("valueBn") or 0) - prior_total, 3)
            derived_rows[member_key] = {
                **row,
                "valueBn": derived_value,
                "derived": True,
                }
        if not derivation_failed and derived_rows:
            quarter_rows.update(derived_rows)

    return {
        quarter: sorted(rows.values(), key=lambda item: float(item.get("valueBn") or 0), reverse=True)
        for quarter, rows in direct_records.items()
    }


def _build_quarter_display_revenue_map(period_records: list[dict[str, Any]]) -> dict[str, float]:
    direct_values: dict[str, float] = {}
    cumulative_records = sorted(
        [record for record in period_records if int(record.get("span") or 0) > 1],
        key=lambda item: (_period_key(str(item.get("quarter"))), int(item.get("span") or 0)),
    )

    for record in period_records:
        if int(record.get("span") or 0) != 1:
            continue
        quarter = str(record.get("quarter") or "")
        display_revenue_bn = float(record.get("displayRevenueBn") or 0)
        if quarter and display_revenue_bn > 0:
            direct_values[quarter] = round(display_revenue_bn, 3)

    for record in cumulative_records:
        quarter = str(record.get("quarter") or "")
        span = int(record.get("span") or 0)
        display_revenue_bn = float(record.get("displayRevenueBn") or 0)
        if span <= 1 or not quarter or display_revenue_bn <= 0 or quarter in direct_values:
            continue
        prior_quarters = _quarter_window(quarter, span)[:-1]
        if not prior_quarters or not all(item in direct_values for item in prior_quarters):
            continue
        derived_value = round(display_revenue_bn - sum(direct_values[item] for item in prior_quarters), 3)
        if derived_value > 0:
            direct_values[quarter] = derived_value

    return direct_values


def _normalize_text_space(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _timestamp_ms_to_iso_date(value: Any) -> str:
    try:
        milliseconds = int(value)
    except (TypeError, ValueError):
        return ""
    return datetime.fromtimestamp(milliseconds / 1000, tz=timezone.utc).date().isoformat()


def _extract_json_script_props(html_text: str) -> dict[str, Any]:
    match = re.search(r"window\.__ICE_PAGE_PROPS__=(\{.*?\});\s*</script>", html_text, re.DOTALL)
    if not match:
        return {}
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _extract_first_pdf_link_from_html(html_text: str) -> str | None:
    match = re.search(r'href="([^"]+\.pdf)"', html_text, re.IGNORECASE)
    if match:
        return unescape(match.group(1)).strip()
    return None


def _extract_pdf_page_texts(url: str) -> list[str]:
    reader = PdfReader(BytesIO(_request(url)))
    return [page.extract_text() or "" for page in reader.pages]


def _extract_pdf_text(url: str) -> str:
    return " ".join(_extract_pdf_page_texts(url))


def _parse_number_token(raw: str) -> float | None:
    cleaned = str(raw or "").strip().replace(",", "")
    if not cleaned:
        return None
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = f"-{cleaned[1:-1]}"
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_pct_token(raw: str) -> float | None:
    cleaned = str(raw or "").strip().replace(" ", "").replace("%", "")
    if not cleaned:
        return None
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = f"-{cleaned[1:-1]}"
    try:
        return float(cleaned)
    except ValueError:
        return None


def _extract_current_table_value(text: str, label: str) -> float | None:
    normalized = _normalize_text_space(text)
    pattern = re.compile(
        rf"{re.escape(label)}(?:\(\d+\))?\s+(\(?[\d,]+\)?)\s+(\(?[\d,]+\)?)\s+(\(?[\d,]+\)?)",
        re.IGNORECASE,
    )
    match = pattern.search(normalized)
    if not match:
        return None
    current_value = _parse_number_token(match.group(2))
    if current_value is None:
        return None
    return round(current_value / 1000, 3)


def _extract_alibaba_table_metrics(text: str, label: str) -> tuple[float | None, float | None]:
    normalized = _normalize_text_space(text)
    pattern = re.compile(
        rf"{re.escape(label)}(?:\(\d+\))?\s+(\(?[\d,]+\)?)\s+(\(?[\d,]+\)?)\s+(?:\(?[\d,]+\)?\s+)?(\(?[\d.]+\)?%)",
        re.IGNORECASE,
    )
    match = pattern.search(normalized)
    if not match:
        return None, None
    current_value = _parse_number_token(match.group(2))
    yoy_pct = _parse_pct_token(match.group(3))
    return (round(current_value / 1000, 3) if current_value is not None else None, yoy_pct)


def _extract_alibaba_narrative_metrics(text: str, label: str) -> tuple[float | None, float | None]:
    normalized = _normalize_text_space(text)
    patterns = [
        re.compile(
            rf"{re.escape(label)}(?:['’]s)?(?:\s+revenue)?\s+(?:grew|increased|rose|was up|up|declined|decreased)\s+(\d+(?:\.\d+)?)%\s+year-(?:on-)?year(?:\s+to\s+RMB\s*([\d,]+)\s+million)?",
            re.IGNORECASE,
        ),
        re.compile(
            rf"{re.escape(label)}(?:['’]s)?(?:\s+revenue)?[^.]*?\s+to\s+RMB\s*([\d,]+)\s+million[^.]*?\s+(\d+(?:\.\d+)?)%\s+year-(?:on-)?year",
            re.IGNORECASE,
        ),
    ]
    for pattern in patterns:
        match = pattern.search(normalized)
        if not match:
            continue
        if len(match.groups()) == 2 and pattern is patterns[0]:
            yoy_pct = _parse_pct_token(match.group(1))
            current_value = _parse_number_token(match.group(2)) if match.group(2) else None
        else:
            current_value = _parse_number_token(match.group(1))
            yoy_pct = _parse_pct_token(match.group(2))
        return (round(current_value / 1000, 3) if current_value is not None else None, yoy_pct)
    return None, None


def _extract_labeled_number_sequence(text: str, label: str, *, min_count: int = 2, max_count: int = 4) -> list[float]:
    normalized = _normalize_text_space(text)
    pattern = re.compile(
        rf"{re.escape(label)}\s+((?:\(?[\d,]+\)?\s+){{{min_count},{max_count}}})",
        re.IGNORECASE,
    )
    match = pattern.search(normalized)
    if not match:
        return []
    values = [_parse_number_token(token) for token in re.findall(r"\(?[\d,]+\)?", match.group(1))]
    return [value for value in values if value is not None]


def _pdf_fuzzy_phrase_pattern(label: str) -> str:
    tokens = [re.escape(char) for char in str(label or "") if not char.isspace()]
    return r"\s*".join(tokens)


def _quarter_from_alibaba_title(title: str) -> str | None:
    match = re.search(r"(December|September|June|March)\s+Quarter\s+(20\d{2})", str(title or ""), re.IGNORECASE)
    if not match:
        return None
    month_to_quarter = {"march": 1, "june": 2, "september": 3, "december": 4}
    quarter = month_to_quarter.get(match.group(1).lower())
    if quarter is None:
        return None
    return f"{match.group(2)}Q{quarter}"


def _alibaba_quarter_end_label(quarter: str) -> str | None:
    match = re.fullmatch(r"(\d{4})Q([1-4])", str(quarter or ""))
    if not match:
        return None
    year = int(match.group(1))
    quarter_number = int(match.group(2))
    mapping = {
        1: f"March 31, {year}",
        2: f"June 30, {year}",
        3: f"September 30, {year}",
        4: f"December 31, {year}",
    }
    return mapping.get(quarter_number)


def _extract_alibaba_segment_table_block(text: str, quarter: str) -> str:
    normalized = _normalize_text_space(text)
    end_label = _alibaba_quarter_end_label(quarter)
    if not end_label:
        return ""
    anchor = f"Three months ended {end_label}"
    start = normalized.find(anchor)
    if start < 0:
        return ""
    return normalized[start : start + 3200]


def _extract_alibaba_row_tokens(block: str, row_label: str) -> list[str]:
    if not block:
        return []
    pattern = re.compile(
        rf"{re.escape(row_label)}\s+(.*?)(?:YoY% change|Income \(Loss\) from operations|Add:\s+Share-based compensation expense|Adjusted EBITA|Adjusted EBITA margin)",
        re.IGNORECASE,
    )
    match = pattern.search(block)
    if not match:
        return []
    return re.findall(r"\(?[\d,]+\)?|—|-", match.group(1))


def _extract_alibaba_change_tokens(block: str) -> list[str]:
    if not block:
        return []
    pattern = re.compile(
        r"YoY% change\s+(.*?)(?:Income \(Loss\) from operations|Add:\s+Share-based compensation expense|Adjusted EBITA)",
        re.IGNORECASE,
    )
    match = pattern.search(block)
    if not match:
        return []
    normalized = match.group(1).replace("N/A", " N/A ")
    normalized = re.sub(r"(?<=%)\(", " (", normalized)
    normalized = re.sub(r"(?<=\d)%(?=\d)", "% ", normalized)
    return re.findall(r"\(?[\d.]+\)?%|N/A", normalized, re.IGNORECASE)


def _build_alibaba_segments_from_revenue_tokens(
    tokens: list[str],
    rows: list[tuple[str, str, str]],
    *,
    source_url: str,
    filing_date: str,
    yoy_tokens: list[str] | None = None,
) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    if len(tokens) < len(rows):
        return segments
    for index, (source_label, display_name, member_key) in enumerate(rows):
        current_value = _parse_number_token(tokens[index])
        if current_value is None:
            continue
        yoy_pct = _parse_pct_token((yoy_tokens or [])[index]) if yoy_tokens and index < len(yoy_tokens) else None
        segments.append(
            _build_row(
                display_name,
                current_value / 1000,
                member_key=member_key,
                source_url=source_url,
                source_form="IR PDF",
                filing_date=filing_date,
                yoy_pct=yoy_pct,
            )
        )
    return segments


def _quarter_from_tencent_title(title: str) -> tuple[str, str] | tuple[None, None]:
    normalized = _normalize_text_space(title)
    annual_match = re.search(r"(\d{4})\s+(?:Annual and Fourth Quarter Results|Fourth Quarter and Annual Results)", normalized, re.IGNORECASE)
    if annual_match:
        return f"{annual_match.group(1)}Q4", "annual"
    interim_match = re.search(r"(\d{4})\s+Second\s+Quarter\s+and\s+Interim\s+Results", normalized, re.IGNORECASE)
    if interim_match:
        return f"{interim_match.group(1)}Q2", "quarter"
    half_year_match = re.search(r"(\d{4})\s+Interim\s+Results", normalized, re.IGNORECASE)
    if half_year_match:
        return f"{half_year_match.group(1)}Q2", "quarter"
    for quarter_number, token in ((1, "First"), (2, "Second"), (3, "Third"), (4, "Fourth")):
        match = re.search(rf"(\d{{4}})\s+{token}\s+Quarter(?:\s+and\s+Interim)?\s+Results", normalized, re.IGNORECASE)
        if match:
            return f"{match.group(1)}Q{quarter_number}", "quarter"
    return None, None


def _select_tencent_quarter_value(values: list[float], mode: str) -> float | None:
    cleaned = [float(item) for item in values if item is not None and float(item) > 0]
    if not cleaned:
        return None
    # Tencent "Annual and Fourth Quarter Results" tables usually disclose
    # [current quarter, prior-year quarter, current annual, prior annual].
    # We always need single-quarter values for YYYYQ4.
    if mode == "annual" and len(cleaned) >= 4:
        return cleaned[0]
    return cleaned[0]


def _select_tencent_detail_value(candidates: list[float], *, vas_quarter_value: float | None = None) -> float | None:
    cleaned = [float(item) for item in candidates if item is not None and float(item) > 0]
    if not cleaned:
        return None
    if vas_quarter_value and vas_quarter_value > 0:
        plausible = [item for item in cleaned if item <= vas_quarter_value * 1.08]
        if plausible:
            return max(plausible)
    # Annual decks often include both quarterly and annual narrative values.
    # When anchor filtering is unavailable, prefer the smaller candidate.
    return min(cleaned)


def _extract_tencent_quarter_discussion(pdf_text: str, quarter: str) -> str:
    quarter_code = f"{quarter[-1]}Q{quarter[:4]}"
    match = re.search(
        rf"{re.escape(quarter_code)}\s+Management Discussion and Analysis(.*?)(?=(?:FY\d{{4}}|[1-4]Q\d{{4}})\s+Management Discussion and Analysis|Non-IFRS|$)",
        pdf_text,
        re.IGNORECASE,
    )
    if match:
        return _normalize_text_space(match.group(1))
    return pdf_text


def _extract_tencent_growth_metrics(text: str, label: str, *, prefix: str | None = None) -> tuple[float | None, float | None]:
    label_pattern = rf"{_pdf_fuzzy_phrase_pattern(label)}\s*\d*"
    prefix_pattern = rf"{re.escape(prefix)}\s+" if prefix else ""
    yoy_pattern = r"year\s*-\s*on\s*-\s*year|year-on-year"
    patterns = [
        re.compile(
            rf"{prefix_pattern}{label_pattern}\s+(?:revenues?\s+)?(?:increased|grew|rose|declined|decreased)\s+by\s+"
            rf"(?P<yoy>[+-]?\d+(?:\.\d+)?)%\s+(?:{yoy_pattern})\s+to\s+RMB\s*(?P<value>[\d.]+)\s+billion",
            re.IGNORECASE,
        ),
        re.compile(
            rf"{prefix_pattern}{label_pattern}\s+(?:revenues?\s+)?(?:were|was)\s+RMB\s*(?P<value>[\d.]+)\s+billion,\s*"
            rf"(?P<direction>up|down)\s+(?P<yoy>\d+(?:\.\d+)?)%\s+(?:{yoy_pattern})",
            re.IGNORECASE,
        ),
        re.compile(
            rf"{prefix_pattern}{label_pattern}\s+(?:revenues?\s+)?(?:were|was)\s+RMB\s*(?P<value>[\d.]+)\s+billion(?:\s+for\s+(?:the\s+)?[^,]+)?,\s*"
            rf"(?P<direction>up|down)\s+(?P<yoy>\d+(?:\.\d+)?)%\s+(?:{yoy_pattern})",
            re.IGNORECASE,
        ),
        re.compile(
            rf"{prefix_pattern}{label_pattern}\s+(?:revenues?\s+)?(?:were|was)\s+RMB\s*(?P<value>[\d.]+)\s+billion(?:\s+for\s+(?:the\s+)?[^,]+)?,\s*"
            rf"(?:reflecting|representing)\s+a\s+(?P<yoy>\d+(?:\.\d+)?)%\s+(?:{yoy_pattern})\s+(?P<direction>increase|decrease)",
            re.IGNORECASE,
        ),
    ]
    for pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue
        value = _parse_number_token(match.group("value"))
        yoy = _parse_number_token(match.group("yoy"))
        direction = match.groupdict().get("direction", "").lower()
        if direction in {"down", "decrease"} and yoy is not None:
            yoy = -abs(float(yoy))
        return value, yoy
    return None, None


def _parse_generic_segment_cache_records(company: dict[str, Any]) -> dict[str, Any]:
    result = {"source": "official-segment-cache", "quarters": {}, "filingsUsed": [], "errors": []}
    payload = fetch_official_segment_history(company, refresh=False)
    if not isinstance(payload, dict) or not payload.get("quarters"):
        result["errors"].append("segment-cache-missing")
        return result
    result["filingsUsed"] = payload.get("filingsUsed", [])
    result["errors"] = payload.get("errors", [])
    for quarter, rows in (payload.get("quarters") or {}).items():
        cleaned_rows = [
            row
            for row in rows
            if isinstance(row, dict)
            and row.get("valueBn") is not None
            and float(row.get("valueBn") or 0) > 0.02
            and str(row.get("name") or "").strip()
        ]
        if len(cleaned_rows) < 2:
            continue
        result["quarters"][quarter] = {
            "segments": [
                _build_row(
                    str(row.get("name") or ""),
                    float(row.get("valueBn") or 0),
                    member_key=str(row.get("memberKey") or row.get("name") or ""),
                    source_url=str(row.get("sourceUrl") or ""),
                    source_form=str(row.get("sourceForm") or ""),
                    filing_date=str(row.get("filingDate") or ""),
                )
                for row in sorted(cleaned_rows, key=lambda item: float(item.get("valueBn") or 0), reverse=True)
            ]
        }
    return result


def _parse_tencent_records(company: dict[str, Any]) -> dict[str, Any]:
    result = {"source": "official-ir-pdf", "quarters": {}, "filingsUsed": [], "errors": []}
    html_text = _request("https://www.tencent.com/en-us/investors/financial-news").decode("utf-8", errors="ignore")
    link_pattern = re.compile(
        r'<a\b[^>]*class="[^"]*ten_finance_item[^"]*"[^>]*>(?P<body>.*?)</a>',
        re.IGNORECASE | re.DOTALL,
    )
    seen_urls: set[str] = set()
    for match in link_pattern.finditer(html_text):
        anchor_html = match.group(0)
        body_html = match.group("body")
        url_match = re.search(r'href="(?P<url>https?://[^"]+?\.pdf(?:\?[^"]*)?)"', anchor_html, re.IGNORECASE)
        if not url_match:
            continue
        pdf_url = unescape(url_match.group("url")).strip()
        body_text = re.sub(r"<br\s*/?>", "\n", body_html, flags=re.IGNORECASE)
        body_text = re.sub(r"<[^>]+>", " ", body_text)
        body_lines = [
            _normalize_text_space(unescape(line))
            for line in body_text.split("\n")
            if _normalize_text_space(unescape(line))
        ]
        if not body_lines:
            continue
        date_text = body_lines[0]
        title = " ".join(body_lines[1:]) if len(body_lines) > 1 else body_lines[0]
        title = re.sub(r"\s+PDF$", "", title, flags=re.IGNORECASE).strip()
        if pdf_url in seen_urls or not title.lower().startswith("tencent announces"):
            continue
        seen_urls.add(pdf_url)
        quarter, mode = _quarter_from_tencent_title(title)
        if not quarter or not mode:
            continue
        filing_date_match = re.search(r"(\d{4})[./-](\d{2})[./-](\d{2})", date_text)
        if not filing_date_match:
            filing_date_match = re.search(r"/(\d{4})/(\d{2})/(\d{2})/", pdf_url)
        filing_date = (
            f"{filing_date_match.group(1)}-{filing_date_match.group(2)}-{filing_date_match.group(3)}"
            if filing_date_match
            else ""
        )
        try:
            pdf_text = _normalize_text_space(_extract_pdf_text(pdf_url))
            quarter_discussion = _extract_tencent_quarter_discussion(pdf_text, quarter)
            top_level_rows = [
                (["VAS"], "Value-added services", "valueaddedservices", "VAS"),
                (["Marketing Services", "Online Advertising"], "Marketing Services", "marketingservices", "Marketing Services"),
                (["FinTech and Business Services"], "FinTech and Business Services", "fintechandbusinessservices", "FinTech and Business Services"),
                (["Others"], "Others", "others", "Others"),
            ]
            segments = []
            selected_top_level_values: dict[str, float] = {}
            for source_labels, display_name, member_key, narrative_label in top_level_rows:
                values: list[float] = []
                for source_label in source_labels:
                    values = _extract_labeled_number_sequence(pdf_text, source_label, min_count=2, max_count=4)
                    if values:
                        break
                selected_value = _select_tencent_quarter_value(values, mode)
                narrative_value, narrative_yoy = _extract_tencent_growth_metrics(
                    quarter_discussion,
                    narrative_label,
                    prefix="Revenues from",
                )
                current_value_bn = selected_value / 1000 if selected_value is not None else narrative_value
                if current_value_bn is None:
                    continue
                segments.append(
                    _build_row(
                        display_name,
                        current_value_bn,
                        member_key=member_key,
                        source_url=pdf_url,
                        source_form="IR PDF",
                        filing_date=filing_date,
                        yoy_pct=narrative_yoy,
                    )
                )
                selected_top_level_values[member_key] = current_value_bn

            detail_groups = []
            detail_names = ["Domestic Games", "International Games", "Social Networks"]
            vas_quarter_value = selected_top_level_values.get("valueaddedservices")
            for detail_name in detail_names:
                detail_value, detail_yoy = _extract_tencent_growth_metrics(quarter_discussion, detail_name)
                if detail_value is None:
                    continue
                selected_detail_value = _select_tencent_detail_value([detail_value], vas_quarter_value=vas_quarter_value)
                if selected_detail_value is None:
                    continue
                detail_groups.append(
                    _build_row(
                        detail_name,
                        selected_detail_value,
                        member_key=_normalize_member_key(detail_name),
                        source_url=pdf_url,
                        source_form="IR PDF",
                        filing_date=filing_date,
                        target_name="Value-added services",
                        yoy_pct=detail_yoy,
                    )
                )

            if segments:
                quarter_payload: dict[str, Any] = {"segments": segments}
                if detail_groups:
                    quarter_payload["detailGroups"] = detail_groups
                result["quarters"][quarter] = quarter_payload
                result["filingsUsed"].append({"title": title, "quarter": quarter, "filingDate": filing_date, "pdf": pdf_url})
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{quarter}: {exc}")
    return result


def _load_alibaba_press_release_pdf(item: dict[str, Any]) -> tuple[str | None, str | None]:
    press_release_id = str(item.get("pressRelease") or "")
    if not press_release_id:
        return None, None
    page_url = f"https://www.alibabagroup.com/en-US/document-{press_release_id}"
    html_text = _request(page_url).decode("utf-8", errors="ignore")
    props = _extract_json_script_props(html_text)
    document_content = str((props.get("document") or {}).get("documentContent") or "")
    pdf_url = _extract_first_pdf_link_from_html(document_content)
    return pdf_url, page_url


def _load_alibaba_quarterly_items() -> list[dict[str, Any]]:
    page_html = _request("https://www.alibabagroup.com/en-US/ir-financial-reports-quarterly-results").decode("utf-8", errors="ignore")
    page_props = _extract_json_script_props(page_html)
    seen_document_ids: set[str] = set()
    results: list[dict[str, Any]] = []
    for year_item in page_props.get("yearDatas") or []:
        category_name = str((year_item or {}).get("categoryName") or "").strip()
        if not re.fullmatch(r"20\d{2}", category_name):
            continue
        year_url = f"https://data.alibabagroup.com/data/index/ir/quarterly-results/q{category_name}/list.json"
        try:
            payload = _request_json(year_url)
        except Exception:
            continue
        for item in payload.get("content") or []:
            if not isinstance(item, dict):
                continue
            document_id = str(item.get("documentId") or "")
            if document_id and document_id in seen_document_ids:
                continue
            if document_id:
                seen_document_ids.add(document_id)
            results.append(item)
    return results


def _parse_alibaba_quarter_rows(text: str, quarter: str, filing_date: str, source_url: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    normalized = _normalize_text_space(text)
    if "Total Alibaba China E-commerce Group" in normalized:
        top_level_rows = [
            ("Total Alibaba China E-commerce Group", "Alibaba China E-commerce Group", "alibabachinaecommercegroup"),
            ("Total Alibaba International Digital Commerce Group", "Alibaba International Digital Commerce Group", "alidcg"),
            ("Cloud Intelligence Group", "Cloud Intelligence Group", "cloudintelligencegroup"),
            ("All others", "All others", "allothers"),
        ]
        detail_rows = [
            ("Customer management", "Alibaba China E-commerce Group"),
            ("Direct sales, logistics and others", "Alibaba China E-commerce Group"),
            ("Quick commerce", "Alibaba China E-commerce Group"),
            ("China commerce wholesale", "Alibaba China E-commerce Group"),
            ("International commerce retail", "Alibaba International Digital Commerce Group"),
            ("International commerce wholesale", "Alibaba International Digital Commerce Group"),
        ]
    elif "Total Taobao and Tmall Group" in normalized:
        top_level_rows = [
            ("Total Taobao and Tmall Group", "Taobao and Tmall Group", "taobaoandtmallgroup"),
            ("Total Alibaba International Digital Commerce Group", "Alibaba International Digital Commerce Group", "alidcg"),
            ("Cloud Intelligence Group", "Cloud Intelligence Group", "cloudintelligencegroup"),
            ("Cainiao Smart Logistics Network Limited", "Cainiao Smart Logistics Network Limited", "cainiao"),
            ("Local Services Group", "Local Services Group", "localservicesgroup"),
            ("Digital Media and Entertainment Group", "Digital Media and Entertainment Group", "dmeg"),
            ("All others", "All others", "allothers"),
        ]
        detail_rows = [
            ("Customer management", "Taobao and Tmall Group"),
            ("Direct sales and others", "Taobao and Tmall Group"),
            ("China commerce wholesale", "Taobao and Tmall Group"),
            ("International commerce retail", "Alibaba International Digital Commerce Group"),
            ("International commerce wholesale", "Alibaba International Digital Commerce Group"),
        ]
    else:
        segment_block = _extract_alibaba_segment_table_block(normalized, quarter)
        normalized_block = re.sub(r"\(\d+\)", "", segment_block)
        if "China commerce International commerce Local consumer services Cainiao Cloud Digital media and entertainment Innovation initiatives and others" in normalized_block:
            revenue_tokens = _extract_alibaba_row_tokens(segment_block, "Revenue")
            yoy_tokens = _extract_alibaba_change_tokens(segment_block)
            segments = _build_alibaba_segments_from_revenue_tokens(
                revenue_tokens,
                [
                    ("China commerce", "China commerce", "chinacommerce"),
                    ("International commerce", "International commerce", "internationalcommerce"),
                    ("Local consumer services", "Local consumer services", "localconsumerservices"),
                    ("Cainiao", "Cainiao", "cainiao"),
                    ("Cloud", "Cloud", "cloud"),
                    ("Digital media and entertainment", "Digital media and entertainment", "digitalmediaandentertainment"),
                    ("Innovation initiatives and others", "Innovation initiatives and others", "innovationinitiativesandothers"),
                ],
                source_url=source_url,
                filing_date=filing_date,
                yoy_tokens=yoy_tokens,
            )
            return segments, []
        if "Commerce Cloud computing Digital media and entertainment Innovation initiatives and others" in normalized_block:
            revenue_tokens = _extract_alibaba_row_tokens(segment_block, "Revenue")
            yoy_tokens = _extract_alibaba_change_tokens(segment_block)
            segments = _build_alibaba_segments_from_revenue_tokens(
                revenue_tokens,
                [
                    ("Commerce", "Commerce", "commerce"),
                    ("Cloud computing", "Cloud computing", "cloudcomputing"),
                    ("Digital media and entertainment", "Digital media and entertainment", "digitalmediaandentertainment"),
                    ("Innovation initiatives and others", "Innovation initiatives and others", "innovationinitiativesandothers"),
                ],
                source_url=source_url,
                filing_date=filing_date,
                yoy_tokens=yoy_tokens,
            )
            return segments, []
        if "Core commerce Cloud computing Digital media and entertainment Innovation initiatives and others" in normalized_block:
            revenue_tokens = _extract_alibaba_row_tokens(segment_block, "Revenue")
            yoy_tokens = _extract_alibaba_change_tokens(segment_block)
            segments = _build_alibaba_segments_from_revenue_tokens(
                revenue_tokens,
                [
                    ("Core commerce", "Core commerce", "corecommerce"),
                    ("Cloud computing", "Cloud computing", "cloudcomputing"),
                    ("Digital media and entertainment", "Digital media and entertainment", "digitalmediaandentertainment"),
                    ("Innovation initiatives and others", "Innovation initiatives and others", "innovationinitiativesandothers"),
                ],
                source_url=source_url,
                filing_date=filing_date,
                yoy_tokens=yoy_tokens,
            )
            return segments, []
        return [], []

    segments = []
    for row_label, display_name, member_key in top_level_rows:
        current_value, yoy_pct = _extract_alibaba_table_metrics(normalized, row_label)
        if current_value is None:
            current_value = _extract_current_table_value(normalized, row_label)
        if yoy_pct is None:
            _, yoy_pct = _extract_alibaba_narrative_metrics(normalized, row_label)
        if current_value is None:
            continue
        segments.append(
            _build_row(
                display_name,
                current_value,
                member_key=member_key,
                source_url=source_url,
                source_form="IR PDF",
                filing_date=filing_date,
                yoy_pct=yoy_pct,
            )
        )

    detail_groups = []
    for row_label, target_name in detail_rows:
        current_value, yoy_pct = _extract_alibaba_table_metrics(normalized, row_label)
        if current_value is None:
            current_value = _extract_current_table_value(normalized, row_label)
        if yoy_pct is None:
            _, yoy_pct = _extract_alibaba_narrative_metrics(normalized, row_label)
        if current_value is None:
            continue
        detail_groups.append(
            _build_row(
                row_label,
                current_value,
                member_key=_normalize_member_key(row_label),
                source_url=source_url,
                source_form="IR PDF",
                filing_date=filing_date,
                target_name=target_name,
                yoy_pct=yoy_pct,
            )
        )
    return segments, detail_groups


def _parse_alibaba_records(company: dict[str, Any]) -> dict[str, Any]:
    result = {"source": "official-ir-pdf", "quarters": {}, "filingsUsed": [], "errors": []}
    for item in _load_alibaba_quarterly_items():
        if not isinstance(item, dict):
            continue
        title_field = item.get("documentTitle")
        title = str((title_field or {}).get("en_US") if isinstance(title_field, dict) else title_field or "")
        quarter = _quarter_from_alibaba_title(title)
        if not quarter:
            continue
        filing_date = _timestamp_ms_to_iso_date(item.get("eventDate") or item.get("documentPublishTime"))
        try:
            pdf_url, page_url = _load_alibaba_press_release_pdf(item)
            if not pdf_url:
                continue
            pdf_text = _extract_pdf_text(pdf_url)
            segments, detail_groups = _parse_alibaba_quarter_rows(pdf_text, quarter, filing_date, pdf_url)
            if not segments:
                continue
            quarter_payload: dict[str, Any] = {"segments": segments}
            if detail_groups:
                quarter_payload["detailGroups"] = detail_groups
            result["quarters"][quarter] = quarter_payload
            result["filingsUsed"].append({"title": title, "quarter": quarter, "filingDate": filing_date, "pdf": pdf_url, "page": page_url})
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{quarter}: {exc}")
    return result


def _context_member_map(members: list[tuple[str, str]]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for dimension, member in members:
        local_dimension = _local_name(dimension)
        local_member = _local_name(member)
        if local_dimension and local_member:
            mapped[local_dimension] = local_member
    return mapped


def _matches_member_filters(member_map: dict[str, str], filters: dict[str, list[str]], exact_dimensions: list[str] | None = None) -> bool:
    if exact_dimensions is not None:
        if set(member_map.keys()) != set(exact_dimensions):
            return False
    for dimension, allowed_members in filters.items():
        actual = member_map.get(dimension)
        if actual not in set(allowed_members):
            return False
    return True


def _collect_custom_hierarchy_facts(
    cik: int,
    accession_nodash: str,
    filing_date: str,
    form: str,
    instance_name: str,
    rows: list[dict[str, Any]],
) -> list[SegmentFact]:
    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{instance_name}"
    root = ET.fromstring(_request(url))
    ns = {"xbrli": "http://www.xbrl.org/2003/instance", "xbrldi": "http://xbrl.org/2006/xbrldi"}

    contexts: dict[str, tuple[str, str, dict[str, str]]] = {}
    for context in root.findall("xbrli:context", ns):
        context_id = context.attrib.get("id")
        if not context_id:
            continue
        start = context.findtext("xbrli:period/xbrli:startDate", default="", namespaces=ns)
        end = context.findtext("xbrli:period/xbrli:endDate", default="", namespaces=ns)
        if not start or not end:
            continue
        members = [(member.attrib.get("dimension", ""), member.text or "") for member in context.findall(".//xbrldi:explicitMember", ns)]
        contexts[context_id] = (start, end, _context_member_map(members))

    facts: list[SegmentFact] = []
    aggregated_facts: dict[tuple[str, str, str, str], SegmentFact] = {}
    for child in root:
        context_ref = child.attrib.get("contextRef")
        if not context_ref or context_ref not in contexts:
            continue
        concept = child.tag.split("}")[-1]
        concept_priority = _revenue_priority(concept)
        if concept_priority < 0:
            continue
        value_text = (child.text or "").strip()
        if not value_text:
            continue
        try:
            value = float(value_text)
        except ValueError:
            continue
        start_date, end_date, member_map = contexts[context_ref]
        for row in rows:
            if not _matches_member_filters(member_map, dict(row.get("filters") or {}), row.get("exactDimensions")):
                continue
            fact = SegmentFact(
                accession=accession_nodash,
                filing_date=filing_date,
                form=form,
                concept=concept,
                concept_priority=concept_priority,
                axis_key="CustomRevenueHierarchyAxis",
                axis_priority=120,
                member_key=str(row.get("memberKey") or row.get("name") or ""),
                label=str(row.get("name") or ""),
                start_date=start_date,
                end_date=end_date,
                value=value,
                source_url=url,
            )
            if row.get("aggregateMatches"):
                aggregate_key = (
                    str(fact.member_key),
                    str(fact.concept),
                    str(fact.start_date),
                    str(fact.end_date),
                )
                existing = aggregated_facts.get(aggregate_key)
                if existing is None:
                    aggregated_facts[aggregate_key] = fact
                else:
                    existing.value += value
                continue
            facts.append(fact)
    facts.extend(aggregated_facts.values())
    return facts


def _enrich_growth(financials: dict[str, Any], field_name: str) -> None:
    ordered_quarters = sorted(financials, key=_period_key)
    for quarter in ordered_quarters:
        rows = financials.get(quarter, {}).get(field_name) or []
        if not rows:
            continue
        prior_year_quarter = f"{int(quarter[:4]) - 1}{quarter[4:]}"
        prior_year_rows = financials.get(prior_year_quarter, {}).get(field_name) or []
        prior_year_map = {str(item.get("memberKey") or item.get("name") or ""): item for item in prior_year_rows}
        prior_quarter = _previous_quarter(quarter)
        prior_quarter_rows = financials.get(prior_quarter, {}).get(field_name) or [] if prior_quarter else []
        prior_quarter_map = {str(item.get("memberKey") or item.get("name") or ""): item for item in prior_quarter_rows}
        revenue_bn = float(financials.get(quarter, {}).get("revenueBn") or 0)
        prior_year_revenue_bn = float(financials.get(prior_year_quarter, {}).get("revenueBn") or 0)
        for row in rows:
            member_key = str(row.get("memberKey") or row.get("name") or "")
            if row.get("yoyPct") is None:
                previous = prior_year_map.get(member_key)
                previous_value = float(previous.get("valueBn") or 0) if previous else 0
                if previous_value:
                    row["yoyPct"] = round((float(row.get("valueBn") or 0) / previous_value - 1) * 100, 2)
            if row.get("qoqPct") is None:
                previous = prior_quarter_map.get(member_key)
                previous_value = float(previous.get("valueBn") or 0) if previous else 0
                if previous_value:
                    row["qoqPct"] = round((float(row.get("valueBn") or 0) / previous_value - 1) * 100, 2)
            if revenue_bn and row.get("mixPct") is None:
                row["mixPct"] = round(float(row.get("valueBn") or 0) / revenue_bn * 100, 1)
            previous = prior_year_map.get(member_key)
            previous_value = float(previous.get("valueBn") or 0) if previous else 0
            if revenue_bn and prior_year_revenue_bn and previous_value and row.get("mixYoyDeltaPp") is None:
                current_mix = float(row.get("valueBn") or 0) / revenue_bn * 100
                prior_mix = previous_value / prior_year_revenue_bn * 100
                row["mixYoyDeltaPp"] = round(current_mix - prior_mix, 1)


def _find_quarter_column(header_row: list[str], quarter: str) -> int | None:
    for index, label in enumerate(header_row[1:], start=1):
        match = re.fullmatch(r"Q([1-4])\s+(20\d{2})", str(label))
        if not match:
            continue
        if f"{match.group(2)}Q{match.group(1)}" == quarter:
            return index
    return None


def _parse_oracle_records(html_text: str, filing_date: str, source_url: str, source_form: str) -> list[dict[str, Any]]:
    period_records: list[dict[str, Any]] = []
    category_rows = {
        "cloud": ("Cloud", {"cloud", "cloud services and license support"}),
        "software": ("Software", {"software", "cloud license and on-premise license"}),
        "hardware": ("Hardware", {"hardware"}),
        "services": ("Services", {"services"}),
    }
    for rows in _extract_html_tables(html_text):
        if len(rows) < 6:
            continue
        flat = " | ".join(" / ".join(row) for row in rows[:10]).lower()
        if "revenues:" not in flat or "hardware" not in flat or "services" not in flat:
            continue

        normalized_map: dict[str, tuple[str, list[float]]] = {}
        for row in rows[3:]:
            label = row[0].strip().lower()
            values = _numeric_cells(row)
            for member_key, (name, aliases) in category_rows.items():
                if label in aliases:
                    normalized_map[member_key] = (name, values)
                    break
        if len(normalized_map) != 4:
            continue

        if rows[0][0].startswith("Three Months Ended"):
            period_end = _combine_date_label(rows[0][0].replace("Three Months Ended", "").strip(), rows[1][1])
            quarter = _calendar_quarter(period_end or "")
            if not quarter:
                continue
            direct_rows: list[dict[str, Any]] = []
            cumulative_rows: list[dict[str, Any]] = []
            cumulative_span = 3 if len(rows[0]) > 1 and "Nine Months Ended" in rows[0][1] else 2 if len(rows[0]) > 1 and "Six Months Ended" in rows[0][1] else 1
            for member_key, (name, values) in normalized_map.items():
                if values:
                    direct_rows.append(_build_row(name, values[0] / 1000, member_key=member_key, source_url=source_url, source_form=source_form, filing_date=filing_date))
                if cumulative_span > 1 and len(values) >= 3:
                    cumulative_rows.append(_build_row(name, values[2] / 1000, member_key=member_key, source_url=source_url, source_form=source_form, filing_date=filing_date))
            if direct_rows:
                period_records.append({"quarter": quarter, "span": 1, "rows": direct_rows})
            if cumulative_rows:
                period_records.append({"quarter": quarter, "span": cumulative_span, "rows": cumulative_rows})
            continue

        if rows[0][0].startswith("Year Ended"):
            period_end = _combine_date_label(rows[0][0].replace("Year Ended", "").strip(), rows[1][1])
            quarter = _calendar_quarter(period_end or "")
            if not quarter:
                continue
            annual_rows = [
                _build_row(name, values[0] / 1000, member_key=member_key, source_url=source_url, source_form=source_form, filing_date=filing_date)
                for member_key, (name, values) in normalized_map.items()
                if values
            ]
            if annual_rows:
                period_records.append({"quarter": quarter, "span": 4, "rows": annual_rows})
    return period_records


def _parse_oracle_detail_records(html_text: str, filing_date: str, source_url: str, source_form: str) -> list[dict[str, Any]]:
    period_records: list[dict[str, Any]] = []
    detail_tables = {
        "cloud": {
            "targetName": "Cloud",
            "rows": {
                "cloudapplications": "Cloud applications",
                "cloudinfrastructure": "Cloud infrastructure",
            },
        },
        "software": {
            "targetName": "Software",
            "rows": {
                "softwarelicense": "Software license",
                "softwaresupport": "Software support",
            },
        },
    }
    for rows in _extract_html_tables(html_text):
        if len(rows) < 4:
            continue
        flat = " | ".join(" / ".join(row) for row in rows[:10]).lower()
        matched_key = next(
            (
                key
                for key, table in detail_tables.items()
                if all(label.lower() in flat for label in table["rows"].values())
            ),
            None,
        )
        if not matched_key:
            continue
        values_map: dict[str, list[float]] = {}
        target_name = str(detail_tables[matched_key]["targetName"])
        for row in rows[2:]:
            label = _normalize_member_key(row[0])
            if label not in detail_tables[matched_key]["rows"]:
                continue
            values_map[label] = _numeric_cells(row)
        if len(values_map) != len(detail_tables[matched_key]["rows"]):
            continue

        if rows[0][0].startswith("Three Months Ended"):
            period_end = _combine_date_label(rows[0][0].replace("Three Months Ended", "").strip(), rows[1][1])
            quarter = _calendar_quarter(period_end or "")
            if not quarter:
                continue
            cumulative_span = 3 if len(rows[0]) > 1 and "Nine Months Ended" in rows[0][1] else 2 if len(rows[0]) > 1 and "Six Months Ended" in rows[0][1] else 1
            direct_rows = [
                _build_row(
                    detail_tables[matched_key]["rows"][member_key],
                    values[0] / 1000,
                    member_key=member_key,
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    target_name=target_name,
                )
                for member_key, values in values_map.items()
                if values
            ]
            if direct_rows:
                period_records.append({"quarter": quarter, "span": 1, "rows": direct_rows})
            if cumulative_span > 1:
                cumulative_rows = [
                    _build_row(
                        detail_tables[matched_key]["rows"][member_key],
                        values[2] / 1000,
                        member_key=member_key,
                        source_url=source_url,
                        source_form=source_form,
                        filing_date=filing_date,
                        target_name=target_name,
                    )
                    for member_key, values in values_map.items()
                    if len(values) >= 3
                ]
                if cumulative_rows:
                    period_records.append({"quarter": quarter, "span": cumulative_span, "rows": cumulative_rows})
            continue

        if rows[0][0].startswith("Year Ended"):
            period_end = _combine_date_label(rows[0][0].replace("Year Ended", "").strip(), rows[1][1])
            quarter = _calendar_quarter(period_end or "")
            if not quarter:
                continue
            annual_rows = [
                _build_row(
                    detail_tables[matched_key]["rows"][member_key],
                    values[0] / 1000,
                    member_key=member_key,
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    target_name=target_name,
                )
                for member_key, values in values_map.items()
                if values
            ]
            if annual_rows:
                period_records.append({"quarter": quarter, "span": 4, "rows": annual_rows})
    return period_records


def _parse_mastercard_records(html_text: str, filing_date: str, source_url: str, source_form: str) -> list[dict[str, Any]]:
    period_records: list[dict[str, Any]] = []
    for rows in _extract_html_tables(html_text):
        if len(rows) < 6:
            continue
        flat = " | ".join(" / ".join(row) for row in rows[:14]).lower()
        monetary_table = "in millions" in flat
        has_current_schema = (
            monetary_table
            and "net revenue" in flat
            and "payment network" in flat
            and "value-added services and solutions" in flat
        )
        has_legacy_schema = (
            monetary_table
            and "net revenue" in flat
            and "domestic assessments" in flat
            and "cross-border volume fees" in flat
            and "transaction processing" in flat
            and "other revenues" in flat
            and "rebates and incentives" in flat
        )
        if not has_current_schema and not has_legacy_schema:
            continue

        values_map: dict[str, list[float]] = {}
        for row in rows:
            if not row:
                continue
            label = _normalize_member_key(row[0])
            if not label:
                continue
            values = _numeric_cells(row)
            if values:
                values_map[label] = values

        segment_labels: dict[str, str] = {}
        display_values: list[float] = []
        if has_current_schema:
            segment_labels = {
                "paymentnetwork": "Payment network",
                "valueaddedservicesandsolutions": "Value-added services and solutions",
            }
            display_values = values_map.get("totalnetrevenue") or values_map.get("netrevenue") or []
            if len([key for key in segment_labels if values_map.get(key)]) != 2:
                continue
        else:
            other_revenues = values_map.get("otherrevenues") or []
            net_revenue = values_map.get("netrevenue") or []
            if not other_revenues or not net_revenue:
                continue
            legacy_payment_values = []
            for index, other_value in enumerate(other_revenues):
                if index >= len(net_revenue):
                    break
                legacy_payment_values.append(net_revenue[index] - other_value)
            values_map["paymentnetwork"] = legacy_payment_values
            values_map["valueaddedservicesandsolutions"] = other_revenues
            segment_labels = {
                "paymentnetwork": "Payment network",
                "valueaddedservicesandsolutions": "Value-added services and solutions",
            }
            display_values = net_revenue

        if rows[0][0].startswith("Three Months Ended"):
            current_year = rows[1][0]
            current_end = _combine_date_label(rows[0][0].replace("Three Months Ended", "").strip(), current_year)
            current_quarter = _calendar_quarter(current_end or "")
            if not current_quarter:
                continue
            cumulative_span = 3 if len(rows[0]) > 1 and "Nine Months Ended" in rows[0][1] else 2 if len(rows[0]) > 1 and "Six Months Ended" in rows[0][1] else 1
            direct_rows = [
                _build_row(name, values[0] / 1000, member_key=member_key, source_url=source_url, source_form=source_form, filing_date=filing_date)
                for member_key, name in segment_labels.items()
                if (values := values_map.get(member_key))
            ]
            if direct_rows:
                period_records.append(
                    {
                        "quarter": current_quarter,
                        "span": 1,
                        "rows": direct_rows,
                        "displayRevenueBn": round(float(display_values[0]) / 1000, 3) if display_values else None,
                    }
                )
            if cumulative_span > 1:
                cumulative_rows = [
                    _build_row(name, values[2] / 1000, member_key=member_key, source_url=source_url, source_form=source_form, filing_date=filing_date)
                    for member_key, name in segment_labels.items()
                    if (values := values_map.get(member_key)) and len(values) >= 3
                ]
                if cumulative_rows:
                    period_records.append(
                        {
                            "quarter": current_quarter,
                            "span": cumulative_span,
                            "rows": cumulative_rows,
                            "displayRevenueBn": round(float(display_values[2]) / 1000, 3) if len(display_values) >= 3 else None,
                        }
                    )
            continue

        annual_like = rows[0][0].startswith("Year Ended") or "years ended december 31" in flat or "for the years ended december 31" in flat
        annual_like = annual_like or (len(rows[0]) >= 3 and all(re.fullmatch(r"20\d{2}", cell) for cell in rows[0][:3]))
        if annual_like:
            year_cell = next((cell for cell in rows[1] if re.fullmatch(r"20\d{2}", cell)), "")
            if not year_cell and rows[0] and re.fullmatch(r"20\d{2}", rows[0][0]):
                year_cell = rows[0][0]
            year_match = re.search(r"(20\d{2})", year_cell)
            year = year_match.group(1) if year_match else ""
            if not year:
                continue
            period_end = f"{int(year):04d}-12-31"
            quarter = _calendar_quarter(period_end)
            annual_rows = [
                _build_row(name, values[0] / 1000, member_key=member_key, source_url=source_url, source_form=source_form, filing_date=filing_date)
                for member_key, name in segment_labels.items()
                if (values := values_map.get(member_key))
            ]
            if quarter and annual_rows:
                period_records.append(
                    {
                        "quarter": quarter,
                        "span": 4,
                        "rows": annual_rows,
                        "displayRevenueBn": round(float(display_values[0]) / 1000, 3) if display_values else None,
                    }
                )
    return period_records


def _parse_netflix_records(html_text: str, filing_date: str, source_url: str, source_form: str) -> list[dict[str, Any]]:
    period_records: list[dict[str, Any]] = []
    row_names = {
        "unitedstatesandcanadaucan": "UCAN",
        "europemiddleeastandafricaemea": "EMEA",
        "latinamericalatam": "LATAM",
        "asiapacificapac": "APAC",
    }
    for rows in _extract_html_tables(html_text):
        if len(rows) < 6:
            continue
        flat = " | ".join(" / ".join(row) for row in rows[:8]).lower()
        has_standard_region_table = (
            "united states and canada (ucan)" in flat
            and "asia-pacific (apac)" in flat
            and ("total revenues" in flat or "total streaming revenues" in flat)
        )
        has_compact_region_table = any(
            _normalize_member_key(row[0]) in {"ucanstreaming", "emea", "latam", "apac"}
            for row in rows
            if row
        )
        if not has_standard_region_table and not has_compact_region_table:
            continue
        if not has_standard_region_table:
            compact_headers = [cell for cell in rows[0] if re.search(r"Q[1-4]\s*['’]?\s*\d{2,4}", str(cell or ""), re.IGNORECASE)]
            if not compact_headers:
                continue
            latest_header = str(compact_headers[-1] or "")
            header_match = re.search(r"Q([1-4])\s*['’]?\s*(\d{2,4})", latest_header, re.IGNORECASE)
            if not header_match:
                continue
            header_year = int(header_match.group(2))
            if header_year < 100:
                header_year += 2000
            quarter = f"{header_year}Q{int(header_match.group(1))}"
            region_values: dict[str, float] = {}
            current_region = ""
            scale = 1000 if "in millions" in flat else 1_000_000
            for row in rows[1:]:
                if not row:
                    continue
                normalized_label = _normalize_member_key(row[0])
                if normalized_label in {"ucanstreaming", "unitedstatesandcanadaucan", "ucan"}:
                    current_region = "UCAN"
                    continue
                if normalized_label in {"europemiddleeastandafricaemea", "emea"}:
                    current_region = "EMEA"
                    continue
                if normalized_label in {"latinamericalatam", "latam"}:
                    current_region = "LATAM"
                    continue
                if normalized_label in {"asiapacificapac", "apac"}:
                    current_region = "APAC"
                    continue
                if current_region and normalized_label == "revenue":
                    values = _numeric_cells(row)
                    if values:
                        region_values[current_region] = values[-1]
            if len(region_values) == 4:
                period_records.append(
                    {
                        "quarter": quarter,
                        "span": 1,
                        "rows": [
                            _build_row(
                                name,
                                region_values[name] / scale,
                                member_key=_normalize_region_member_key(name),
                                source_url=source_url,
                                source_form=source_form,
                                filing_date=filing_date,
                            )
                            for name in ["UCAN", "EMEA", "LATAM", "APAC"]
                        ],
                    }
                )
            continue
        values_map: dict[str, list[float]] = {}
        for row in rows[3:]:
            label = _normalize_member_key(row[0])
            if label not in row_names:
                continue
            values_map[label] = _numeric_cells(row)
        if len(values_map) != 4:
            continue

        if rows[0][0].startswith("Three Months Ended"):
            current_end = rows[1][0]
            quarter = _calendar_quarter(re.sub(r"[^\d-]", "", current_end.replace(", ", "-").replace(" ", "-")))
            if quarter is None:
                current_end_match = re.search(r"([A-Za-z]+\s+\d{1,2},\s+\d{4})", current_end)
                if not current_end_match:
                    continue
                month_day_year = current_end_match.group(1)
                month_day, year = month_day_year.rsplit(" ", 1)
                quarter = _calendar_quarter(_combine_date_label(month_day, year) or "")
            if not quarter:
                continue
            cumulative_header = rows[0][1] if len(rows[0]) > 1 else ""
            cumulative_span = 2 if cumulative_header.startswith("Six Months Ended") else 3 if cumulative_header.startswith("Nine Months Ended") else 1
            direct_rows = [
                _build_row(name, values[0] / 1_000_000, member_key=_normalize_region_member_key(name), source_url=source_url, source_form=source_form, filing_date=filing_date)
                for member_key, name in row_names.items()
                if (values := values_map.get(member_key))
            ]
            if direct_rows:
                period_records.append({"quarter": quarter, "span": 1, "rows": direct_rows})
            if cumulative_span > 1:
                cumulative_rows = [
                    _build_row(name, values[2] / 1_000_000, member_key=_normalize_region_member_key(name), source_url=source_url, source_form=source_form, filing_date=filing_date)
                    for member_key, name in row_names.items()
                    if (values := values_map.get(member_key)) and len(values) >= 3
                ]
                if cumulative_rows:
                    period_records.append({"quarter": quarter, "span": cumulative_span, "rows": cumulative_rows})
            continue

        annual_like = rows[0][0].startswith("Year Ended") or "year ended december 31" in flat
        annual_like = annual_like or (len(rows[0]) >= 3 and all(re.fullmatch(r"20\d{2}", cell) for cell in rows[1][:3]))
        if annual_like:
            year_match = re.search(r"(20\d{2})", " ".join(rows[1]))
            if year_match is None and rows[0] and re.fullmatch(r"20\d{2}", rows[0][0]):
                year_match = re.search(r"(20\d{2})", rows[0][0])
            year = year_match.group(1) if year_match else ""
            if not year:
                continue
            annual_rows = [
                _build_row(name, values[0] / 1_000_000, member_key=_normalize_region_member_key(name), source_url=source_url, source_form=source_form, filing_date=filing_date)
                for member_key, name in row_names.items()
                if (values := values_map.get(member_key))
            ]
            quarter_key = _calendar_quarter(f"{int(year):04d}-12-31")
            if quarter_key and annual_rows:
                period_records.append({"quarter": quarter_key, "span": 4, "rows": annual_rows})
            continue

    return period_records


def _latest_year_in_rows(rows: list[list[str]], limit: int = 4) -> str:
    years = re.findall(r"\b(20\d{2})\b", " ".join(" ".join(row) for row in rows[:limit]))
    return max(years) if years else ""


def _alphabet_value_at(values: list[float], index: int) -> float | None:
    if index < 0 or index >= len(values):
        return None
    return float(values[index])


def _alphabet_bn(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) / 1000, 3)


def _parse_alphabet_period_records(
    html_text: str,
    filing_date: str,
    source_url: str,
    source_form: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    segment_period_records: list[dict[str, Any]] = []
    detail_period_records: list[dict[str, Any]] = []
    row_aliases = {
        "googlesearchother": "search",
        "youtubeads": "youtube",
        "googlenetwork": "admob",
        "googleadvertising": "adrevenue",
        "googleother": "googleplay",
        "googlesubscriptionsplatformsanddevices": "googleplay",
        "googleservicestotal": "googleservices",
        "googlecloud": "googlecloud",
        "otherbets": "otherbets",
        "hedginggainslosses": "hedging",
        "totalrevenues": "totalrevenues",
    }
    detail_support_lines = {
        "search": ["Official: Search & other"],
        "admob": ["Official: Google Network"],
    }
    group_support_lines = {
        "googleplay": ["Official: subscriptions, platforms, and devices"],
        "other": ["Other Bets + hedging"],
    }
    required_keys = {"search", "youtube", "admob", "adrevenue", "googleplay", "googlecloud", "totalrevenues"}

    for rows in _extract_html_tables(html_text):
        if len(rows) < 8:
            continue
        flat = " | ".join(" / ".join(row) for row in rows[:16]).lower()
        if "youtube ads" not in flat or "google cloud" not in flat or "total revenues" not in flat:
            continue

        values_map: dict[str, list[float]] = {}
        for row in rows:
            if not row:
                continue
            row_key = row_aliases.get(_normalize_member_key(row[0]))
            if not row_key:
                continue
            values = _numeric_cells(row)
            if values:
                values_map[row_key] = values
        if not required_keys.issubset(values_map):
            continue

        current_year = _latest_year_in_rows(rows)
        if not current_year:
            continue

        if rows[0] and rows[0][0].startswith("Three Months Ended"):
            current_end = _combine_date_label(rows[1][0].replace("Three Months Ended", "").strip(), current_year) if len(rows) > 1 and rows[1] else None
            quarter = _calendar_quarter(current_end or "")
            if not quarter:
                continue
            cumulative_header = rows[0][1] if len(rows[0]) > 1 else ""
            cumulative_span = 3 if cumulative_header.startswith("Nine Months Ended") else 2 if cumulative_header.startswith("Six Months Ended") else 1

            def current_direct(key: str) -> float | None:
                values = values_map.get(key) or []
                return _alphabet_value_at(values, 1 if len(values) >= 2 else 0)

            def current_cumulative(key: str) -> float | None:
                values = values_map.get(key) or []
                if cumulative_span <= 1:
                    return None
                return _alphabet_value_at(values, 3 if len(values) >= 4 else -1)

            direct_ad_value = _alphabet_bn(current_direct("adrevenue"))
            direct_play_value = _alphabet_bn(current_direct("googleplay"))
            direct_cloud_value = _alphabet_bn(current_direct("googlecloud"))
            direct_total_value = _alphabet_bn(current_direct("totalrevenues"))
            if None in {direct_ad_value, direct_play_value, direct_cloud_value, direct_total_value}:
                continue
            direct_other_value = round(float(direct_total_value) - float(direct_ad_value) - float(direct_play_value) - float(direct_cloud_value), 3)
            direct_segments = [
                _build_row("Ad Revenue", direct_ad_value, member_key="adrevenue", source_url=source_url, source_form=source_form, filing_date=filing_date),
                _build_row(
                    "Google Play",
                    direct_play_value,
                    member_key="googleplay",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=group_support_lines["googleplay"],
                ),
                _build_row("Google Cloud", direct_cloud_value, member_key="googlecloud", source_url=source_url, source_form=source_form, filing_date=filing_date),
                _build_row(
                    "Other",
                    direct_other_value,
                    member_key="other",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=group_support_lines["other"],
                ),
            ]
            direct_details = [
                _build_row(
                    "Google Search",
                    _alphabet_bn(current_direct("search")) or 0,
                    member_key="searchadvertising",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=detail_support_lines["search"],
                    target_name="Ad Revenue",
                ),
                _build_row(
                    "YouTube",
                    _alphabet_bn(current_direct("youtube")) or 0,
                    member_key="youtube",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    target_name="Ad Revenue",
                ),
                _build_row(
                    "Google AdMob",
                    _alphabet_bn(current_direct("admob")) or 0,
                    member_key="admob",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=detail_support_lines["admob"],
                    target_name="Ad Revenue",
                ),
            ]
            segment_period_records.append({"quarter": quarter, "span": 1, "rows": direct_segments})
            detail_period_records.append({"quarter": quarter, "span": 1, "rows": direct_details})

            if cumulative_span > 1:
                cumulative_ad_value = _alphabet_bn(current_cumulative("adrevenue"))
                cumulative_play_value = _alphabet_bn(current_cumulative("googleplay"))
                cumulative_cloud_value = _alphabet_bn(current_cumulative("googlecloud"))
                cumulative_total_value = _alphabet_bn(current_cumulative("totalrevenues"))
                if None not in {cumulative_ad_value, cumulative_play_value, cumulative_cloud_value, cumulative_total_value}:
                    cumulative_other_value = round(
                        float(cumulative_total_value) - float(cumulative_ad_value) - float(cumulative_play_value) - float(cumulative_cloud_value),
                        3,
                    )
                    cumulative_segments = [
                        _build_row("Ad Revenue", cumulative_ad_value, member_key="adrevenue", source_url=source_url, source_form=source_form, filing_date=filing_date),
                        _build_row(
                            "Google Play",
                            cumulative_play_value,
                            member_key="googleplay",
                            source_url=source_url,
                            source_form=source_form,
                            filing_date=filing_date,
                            support_lines=group_support_lines["googleplay"],
                        ),
                        _build_row("Google Cloud", cumulative_cloud_value, member_key="googlecloud", source_url=source_url, source_form=source_form, filing_date=filing_date),
                        _build_row(
                            "Other",
                            cumulative_other_value,
                            member_key="other",
                            source_url=source_url,
                            source_form=source_form,
                            filing_date=filing_date,
                            support_lines=group_support_lines["other"],
                        ),
                    ]
                    cumulative_details = [
                        _build_row(
                            "Google Search",
                            _alphabet_bn(current_cumulative("search")) or 0,
                            member_key="searchadvertising",
                            source_url=source_url,
                            source_form=source_form,
                            filing_date=filing_date,
                            support_lines=detail_support_lines["search"],
                            target_name="Ad Revenue",
                        ),
                        _build_row(
                            "YouTube",
                            _alphabet_bn(current_cumulative("youtube")) or 0,
                            member_key="youtube",
                            source_url=source_url,
                            source_form=source_form,
                            filing_date=filing_date,
                            target_name="Ad Revenue",
                        ),
                        _build_row(
                            "Google AdMob",
                            _alphabet_bn(current_cumulative("admob")) or 0,
                            member_key="admob",
                            source_url=source_url,
                            source_form=source_form,
                            filing_date=filing_date,
                            support_lines=detail_support_lines["admob"],
                            target_name="Ad Revenue",
                        ),
                    ]
                    segment_period_records.append({"quarter": quarter, "span": cumulative_span, "rows": cumulative_segments})
                    detail_period_records.append({"quarter": quarter, "span": cumulative_span, "rows": cumulative_details})
            continue

        annual_like = rows[0][0].startswith("Year Ended") or "year ended december 31" in flat or "years ended december 31" in flat
        if annual_like:
            quarter = _calendar_quarter(f"{int(current_year):04d}-12-31")
            if not quarter:
                continue

            def annual_value(key: str) -> float | None:
                values = values_map.get(key) or []
                return _alphabet_value_at(values, len(values) - 1)

            annual_ad_value = _alphabet_bn(annual_value("adrevenue"))
            annual_play_value = _alphabet_bn(annual_value("googleplay"))
            annual_cloud_value = _alphabet_bn(annual_value("googlecloud"))
            annual_total_value = _alphabet_bn(annual_value("totalrevenues"))
            if None in {annual_ad_value, annual_play_value, annual_cloud_value, annual_total_value}:
                continue
            annual_other_value = round(float(annual_total_value) - float(annual_ad_value) - float(annual_play_value) - float(annual_cloud_value), 3)
            annual_segments = [
                _build_row("Ad Revenue", annual_ad_value, member_key="adrevenue", source_url=source_url, source_form=source_form, filing_date=filing_date),
                _build_row(
                    "Google Play",
                    annual_play_value,
                    member_key="googleplay",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=group_support_lines["googleplay"],
                ),
                _build_row("Google Cloud", annual_cloud_value, member_key="googlecloud", source_url=source_url, source_form=source_form, filing_date=filing_date),
                _build_row(
                    "Other",
                    annual_other_value,
                    member_key="other",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=group_support_lines["other"],
                ),
            ]
            annual_details = [
                _build_row(
                    "Google Search",
                    _alphabet_bn(annual_value("search")) or 0,
                    member_key="searchadvertising",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=detail_support_lines["search"],
                    target_name="Ad Revenue",
                ),
                _build_row(
                    "YouTube",
                    _alphabet_bn(annual_value("youtube")) or 0,
                    member_key="youtube",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    target_name="Ad Revenue",
                ),
                _build_row(
                    "Google AdMob",
                    _alphabet_bn(annual_value("admob")) or 0,
                    member_key="admob",
                    source_url=source_url,
                    source_form=source_form,
                    filing_date=filing_date,
                    support_lines=detail_support_lines["admob"],
                    target_name="Ad Revenue",
                ),
            ]
            segment_period_records.append({"quarter": quarter, "span": 4, "rows": annual_segments})
            detail_period_records.append({"quarter": quarter, "span": 4, "rows": annual_details})
    return segment_period_records, detail_period_records


def _parse_alphabet_records(company: dict[str, Any], cik: int) -> dict[str, Any]:
    result = {"source": "official-filing-tables", "quarters": {}, "filingsUsed": [], "errors": []}
    segment_period_records: list[dict[str, Any]] = []
    detail_period_records: list[dict[str, Any]] = []
    seen_accessions: set[str] = set()

    for filing in _merged_filing_entries(str(company.get("id") or ""), cik):
        form = str(filing.get("form") or "")
        accession = str(filing.get("accession") or "")
        filing_date = str(filing.get("filingDate") or "")
        primary_document = str(filing.get("primaryDocument") or "")
        if filing_date < "2020-01-01" or form not in {"10-Q", "10-K"} or not accession or not primary_document:
            continue
        accession_nodash = accession.replace("-", "")
        if accession_nodash in seen_accessions:
            continue
        seen_accessions.add(accession_nodash)
        try:
            source_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{primary_document}"
            html_text = _request(source_url).decode("utf-8", errors="ignore")
            filing_segment_records, filing_detail_records = _parse_alphabet_period_records(html_text, filing_date, source_url, form)
            if filing_segment_records:
                segment_period_records.extend(filing_segment_records)
                detail_period_records.extend(filing_detail_records)
                result["filingsUsed"].append({"form": form, "filingDate": filing_date, "accession": accession, "primaryDocument": primary_document})
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{filing_date}: {exc}")

    segment_quarter_rows = _build_quarter_rows_from_period_records(segment_period_records)
    detail_quarter_rows = _build_quarter_rows_from_period_records(detail_period_records)
    for quarter in sorted(set(segment_quarter_rows) | set(detail_quarter_rows), key=_period_key):
        payload: dict[str, Any] = {"style": "ad-funnel-bridge"}
        if segment_quarter_rows.get(quarter):
            payload["segments"] = segment_quarter_rows[quarter]
        if detail_quarter_rows.get(quarter):
            payload["detailGroups"] = detail_quarter_rows[quarter]
        result["quarters"][quarter] = payload
    return result


def _normalize_region_member_key(name: str) -> str:
    return {
        "UCAN": "ucan",
        "EMEA": "emea",
        "LATAM": "latam",
        "APAC": "apac",
    }.get(name, _normalize_member_key(name))


def _parse_asml_mix_text(ocr_text: str) -> dict[str, float]:
    normalized = re.sub(r"\s+", " ", ocr_text).replace("letrology", "Metrology").replace("Inspection 4 %", "Inspection 4%")
    percent_map: dict[str, float] = {}
    patterns = {
        "euv": (r"\bEUV\s+(\d+)%", "EUV"),
        "arfi": (r"\bArFi\s+(\d+)%", "ArFi"),
        "arfdry": (r"\bArF Dry\s+(\d+)%", "ArF Dry"),
        "krf": (r"\bKrF\s+(\d+)%", "KrF"),
        "iline": (r"\bI-line\s+(\d+)%", "I-line"),
        "metrologyinspection": (r"\bMetrology\s*&\s*Inspection\s+(\d+)%", "Metrology & Inspection"),
    }
    for member_key, (pattern, _) in patterns.items():
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            percent_map[member_key] = float(match.group(1))
    return percent_map


def _asml_total_sales_row(rows: list[list[str]]) -> list[str] | None:
    for row in rows:
        if not row:
            continue
        label = re.sub(r"[^a-z]+", " ", str(row[0]).lower()).strip()
        if re.fullmatch(r"(total )?net sales", label):
            return row
    return None


def _score_asml_mix_ocr(ocr_text: str) -> int:
    normalized = re.sub(r"\s+", " ", ocr_text).strip().lower()
    score = 0
    if "net system sales breakdown" in normalized:
        score += 5
    if "technology" in normalized:
        score += 2
    for token in ("euv", "arfi", "arf dry", "krf", "i-line", "metrology", "inspection"):
        if token in normalized:
            score += 1
    for pattern in (r"\beuv\s+\d+%", r"\barfi\s+\d+%", r"\bkrf\s+\d+%"):
        if re.search(pattern, normalized):
            score += 2
    return score


def _find_asml_pdf_mix_ocr(pdf_bytes: bytes) -> str | None:
    reader = PdfReader(BytesIO(pdf_bytes))
    best_score = -1
    best_text: str | None = None
    with tempfile.TemporaryDirectory() as temp_dir:
        for page_index, page in enumerate(reader.pages):
            page_text = re.sub(r"\s+", " ", page.extract_text() or "")
            page_hint = "Net system sales breakdown" in page_text
            try:
                images = list(page.images)
            except Exception:  # noqa: BLE001
                images = []
            for image_index, image in enumerate(images):
                suffix = Path(str(getattr(image, "name", "") or f"page-{page_index + 1}-{image_index}.png")).suffix or ".png"
                image_path = Path(temp_dir) / f"asml-{page_index + 1}-{image_index}{suffix}"
                image_path.write_bytes(image.data)
                try:
                    ocr_text = subprocess.run([str(_ensure_vision_ocr_binary()), str(image_path)], check=True, capture_output=True, text=True).stdout
                except Exception:  # noqa: BLE001
                    continue
                score = _score_asml_mix_ocr(ocr_text) + (4 if page_hint else 0)
                if score > best_score:
                    best_score = score
                    best_text = ocr_text
                if page_hint and score >= 12:
                    return ocr_text
    return best_text if best_score >= 8 else None


def _parse_tsmc_mix_text(ocr_text: str) -> dict[str, float]:
    normalized = re.sub(r"\s+", " ", ocr_text)
    normalized = normalized.replace("loT", "IoT").replace("1oT", "IoT").replace("lo T", "IoT").replace("1o T", "IoT").replace("03ers", "Others").replace("tsme", "tsmc")
    percent_map: dict[str, float] = {}

    combined_match = re.search(r"\bAutomotive\s+DCE\s+(\d+)%\s+(\d+)%", normalized, re.IGNORECASE)
    if combined_match:
        percent_map["automotive"] = float(combined_match.group(1))
        percent_map["dce"] = float(combined_match.group(2))

    reverse_combined_match = re.search(r"\bDCE\s+Automotive\s+(\d+)%\s+(\d+)%", normalized, re.IGNORECASE)
    if reverse_combined_match:
        percent_map["dce"] = float(reverse_combined_match.group(1))
        percent_map["automotive"] = float(reverse_combined_match.group(2))

    patterns = {
        "hpc": r"\bHPC\s+(\d+)%",
        "smartphones": r"\bSmartphones?\s+(\d+)%",
        "iot": r"\bIoT\s+(\d+)%",
        "automotive": r"\bAutomotive\s+(\d+)%",
        "dce": r"\bDCE\s+(\d+)%",
        "others": r"\bOthers\s+(\d+)%",
    }
    for member_key, pattern in patterns.items():
        if member_key in percent_map:
            continue
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            percent_map[member_key] = float(match.group(1))
    ordered_keys = ["hpc", "smartphones", "iot", "automotive", "dce", "others"]
    missing_keys = [member_key for member_key in ordered_keys if member_key not in percent_map]
    total_pct = sum(percent_map.values())
    if len(missing_keys) == 1 and total_pct < 100:
        percent_map[missing_keys[0]] = round(100 - total_pct, 1)
    return percent_map


def _parse_tsmc_qoq_growth_text(ocr_text: str) -> dict[str, float]:
    normalized = re.sub(r"\s+", " ", ocr_text)
    normalized = normalized.replace("loT", "IoT").replace("1oT", "IoT").replace("Q0Q", "QoQ").replace("tsme", "tsmc")
    marker_match = re.search(r"Growth Rate by Platform\s*\((?:QoQ)\)", normalized, re.IGNORECASE)
    section = normalized[marker_match.end(): marker_match.end() + 260] if marker_match else normalized
    signed_values = [_parse_pct_token(token) for token in re.findall(r"[+-]\d+(?:\.\d+)?%", section)]
    signed_values = [value for value in signed_values if value is not None]
    ordered_keys = ["hpc", "smartphones", "iot", "automotive", "dce", "others"]
    if len(signed_values) >= len(ordered_keys):
        return {member_key: float(signed_values[index]) for index, member_key in enumerate(ordered_keys)}
    return {}


def _tsmc_quarter_code(quarter: str) -> str:
    return f"{quarter[-1]}Q{quarter[2:4]}"


def _score_tsmc_mix_ocr(ocr_text: str, quarter: str) -> int:
    normalized = re.sub(r"\s+", " ", ocr_text).strip().lower()
    normalized = normalized.replace("lot", "iot").replace("1ot", "iot")
    score = 0
    if _tsmc_quarter_code(quarter).lower() in normalized:
        score += 5
    if "revenue by platform" in normalized or "revenue by application" in normalized:
        score += 6
    if "growth rate by platform" in normalized or "growth rate by application" in normalized:
        score += 3
    for token in ("hpc", "smartphone", "iot", "automotive", "dce", "others"):
        if token in normalized:
            score += 1
    if re.search(r"\b20\d{2}\s+revenue by platform\b", normalized) and _tsmc_quarter_code(quarter).lower() not in normalized:
        score -= 2
    return score


def _find_tsmc_mix_ocr(
    cik: int,
    accession_nodash: str,
    quarter: str,
    index_payload: dict[str, Any],
    *,
    presentation_html: str | None = None,
) -> tuple[str | None, str | None]:
    if presentation_html:
        slide_blocks = _find_slide_blocks(presentation_html)
        mix_block = next(
            (
                block
                for block in slide_blocks
                if "Revenue by Platform" in block["text"] and re.search(r"[1-4]Q\d{2}", block["text"])
            ),
            None,
        )
        if mix_block is not None:
            image_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{mix_block['image']}"
            return _ocr_image(image_url), image_url

    candidate_names: list[str] = []
    for item in index_payload.get("directory", {}).get("item", []):
        name = str(item.get("name") or "")
        lowered = name.lower()
        if not lowered.endswith((".jpg", ".jpeg", ".png")):
            continue
        if "slide" in lowered or "presentation" in lowered:
            candidate_names.append(name)
    if not candidate_names:
        for item in index_payload.get("directory", {}).get("item", []):
            name = str(item.get("name") or "")
            if name.lower().endswith((".jpg", ".jpeg", ".png")):
                candidate_names.append(name)

    best_score = -10
    best_text: str | None = None
    best_url: str | None = None
    for name in candidate_names:
        image_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{name}"
        try:
            ocr_text = _ocr_image(image_url)
        except Exception:  # noqa: BLE001
            continue
        score = _score_tsmc_mix_ocr(ocr_text, quarter)
        if score > best_score:
            best_score = score
            best_text = ocr_text
            best_url = image_url
        if score >= 14:
            break

    if best_score < 8:
        return None, None
    return best_text, best_url


def _parse_asml_records(company: dict[str, Any], cik: int) -> dict[str, Any]:
    result = {"source": "official-filings-presentation-ocr", "quarters": {}, "filingsUsed": [], "errors": []}
    tech_support_lines = {
        "euv": ["Extreme Ultraviolet"],
        "arfi": ["Argon Fluoride Immersion"],
        "arfdry": ["Argon Fluoride Dry"],
        "krf": ["Krypton Fluoride"],
        "iline": ["Mercury I-line"],
        "metrologyinspection": ["YieldStar · e-beam"],
    }
    tech_names = {
        "euv": "EUV",
        "arfi": "ArFi",
        "arfdry": "ArF Dry",
        "krf": "KrF",
        "iline": "I-line",
        "metrologyinspection": "Metrology & Inspection",
    }
    for quarter, entry in _load_cached_financial_entries("asml"):
        press_release_url = str(entry.get("statementSourceUrl") or "")
        filing_date = str(entry.get("statementFilingDate") or "")
        if not press_release_url or not filing_date or filing_date < "2020-01-01":
            continue
        try:
            match = re.search(r"/data/\d+/(\d+)/([^/]+)$", press_release_url)
            if not match:
                continue
            accession_nodash = match.group(1)
            primary_document = match.group(2)
            index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
            names = [str(item.get("name") or "") for item in index_payload.get("directory", {}).get("item", [])]
            presentation_name = next(
                (
                    name
                    for name in names
                    if name.lower().endswith((".htm", ".html")) and "presentat" in name.lower() and "financialstatements" not in name.lower()
                ),
                None,
            )
            if not presentation_name:
                presentation_name = next((name for name in names if name.lower().endswith(".pdf") and "presentat" in name.lower()), None)
            if not presentation_name:
                continue
            presentation_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{presentation_name}"
            presentation_bytes = _request(presentation_url)
            presentation_html = ""
            mix_ocr_text: str | None = None
            mix_source_url = presentation_url
            if presentation_name.lower().endswith(".pdf"):
                mix_ocr_text = _find_asml_pdf_mix_ocr(presentation_bytes)
                if mix_ocr_text is None:
                    continue
            else:
                presentation_html = presentation_bytes.decode("utf-8", errors="ignore")
                slide_blocks = _find_slide_blocks(presentation_html)
                mix_block = next((block for block in slide_blocks if "Net system sales breakdown" in block["text"]), None)
                if mix_block is None:
                    continue
                mix_source_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{mix_block['image']}"
            press_release_html = _request(press_release_url).decode("utf-8", errors="ignore")
            exact_total = None
            exact_installed = None
            for rows in _extract_html_tables(press_release_html):
                if len(rows) < 3:
                    continue
                header = rows[0]
                if not header or "Installed Base Management" not in " ".join(" ".join(row) for row in rows[:4]):
                    continue
                column_index = _find_quarter_column(header, quarter)
                if column_index is None:
                    continue
                total_row = _asml_total_sales_row(rows)
                installed_row = next((row for row in rows if row and "Installed Base Management sales" in row[0]), None)
                if total_row is None or installed_row is None:
                    continue
                exact_total = _parse_number(total_row[column_index]) if len(total_row) > column_index else None
                exact_installed = _parse_number(installed_row[column_index]) if len(installed_row) > column_index else None
                if exact_total is not None and exact_installed is not None:
                    break
            if exact_total is None or exact_installed is None:
                continue
            if mix_ocr_text is None:
                mix_ocr_text = _ocr_image(mix_source_url)
            tech_mix = _parse_asml_mix_text(mix_ocr_text)
            if len(tech_mix) < 5:
                result["errors"].append(f"{filing_date}: asml-tech-mix-ocr-incomplete")
                continue
            net_system_sales_bn = round((float(exact_total) - float(exact_installed)) / 1000, 3)
            installed_bn = round(float(exact_installed) / 1000, 3)
            detail_groups = []
            remaining_value = net_system_sales_bn
            ordered_keys = ["euv", "arfi", "arfdry", "krf", "iline", "metrologyinspection"]
            for index, member_key in enumerate(ordered_keys):
                share_pct = tech_mix.get(member_key)
                if share_pct is None:
                    continue
                if index == len(ordered_keys) - 1:
                    value_bn = round(remaining_value, 3)
                else:
                    value_bn = round(net_system_sales_bn * share_pct / 100, 3)
                    remaining_value = round(remaining_value - value_bn, 3)
                detail_groups.append(
                    _build_row(
                        tech_names[member_key],
                        value_bn,
                        member_key=member_key,
                        source_url=mix_source_url,
                        source_form="6-K",
                        filing_date=filing_date,
                        support_lines=tech_support_lines.get(member_key),
                        target_name="Net system sales",
                    )
                )
            result["quarters"][quarter] = {
                "segments": [
                    _build_row("Net system sales", net_system_sales_bn, member_key="netsystemsales", source_url=press_release_url, source_form="6-K", filing_date=filing_date),
                    _build_row("Installed base management", installed_bn, member_key="installedbasemanagement", source_url=press_release_url, source_form="6-K", filing_date=filing_date),
                ],
                "detailGroups": detail_groups,
                "style": "asml-technology-bridge",
                "displayCurrency": "EUR",
                "displayScaleFactor": 1,
                "sourceUrl": press_release_url,
            }
            result["filingsUsed"].append({"form": "6-K", "filingDate": filing_date, "accession": accession_nodash, "presentation": presentation_name, "pressRelease": primary_document})
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{filing_date}: {exc}")
    return result


def _parse_tsmc_records(company: dict[str, Any], cik: int) -> dict[str, Any]:
    result = {"source": "official-filings-presentation-ocr", "quarters": {}, "filingsUsed": [], "errors": []}
    platform_names = {
        "hpc": ("High Performance Computing", ["AI · accelerator · server"]),
        "smartphones": ("Smartphones", ["Mobile SoC"]),
        "iot": ("Internet of Things", ["IoT"]),
        "automotive": ("Automotive", ["Automotive"]),
        "dce": ("Digital Consumer Electronics", ["DCE"]),
        "others": ("Others", ["Other platforms"]),
    }
    for quarter, entry in _load_cached_financial_entries("tsmc"):
        press_release_url = str(entry.get("statementSourceUrl") or "")
        filing_date = str(entry.get("statementFilingDate") or "")
        if not press_release_url or not filing_date or filing_date < "2020-01-01":
            continue
        try:
            match = re.search(r"/data/\d+/(\d+)/([^/]+)$", press_release_url)
            if not match:
                continue
            accession_nodash = match.group(1)
            primary_document = match.group(2)
            index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
            names = [str(item.get("name") or "") for item in index_payload.get("directory", {}).get("item", [])]
            presentation_name = next((name for name in names if name.lower().endswith((".htm", ".html")) and "presentation" in name.lower()), None)
            presentation_url = (
                f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{presentation_name}"
                if presentation_name
                else press_release_url
            )
            presentation_html = _request(presentation_url).decode("utf-8", errors="ignore")
            ocr_text, ocr_source_url = _find_tsmc_mix_ocr(
                cik,
                accession_nodash,
                quarter,
                index_payload,
                presentation_html=presentation_html,
            )
            if not ocr_text or not ocr_source_url:
                continue
            mix_map = _parse_tsmc_mix_text(ocr_text)
            if len(mix_map) < 5:
                result["errors"].append(f"{filing_date}: tsmc-platform-ocr-incomplete")
                continue
            qoq_growth_map = _parse_tsmc_qoq_growth_text(ocr_text)
            press_release_html = _request(press_release_url).decode("utf-8", errors="ignore")
            usd_revenue_match = re.search(r"In US dollars, .*? revenue was \$([0-9.]+) billion", re.sub(r"\s+", " ", press_release_html), re.IGNORECASE)
            if usd_revenue_match is None:
                continue
            usd_revenue_bn = float(usd_revenue_match.group(1))
            result["quarters"][quarter] = {
                "segments": [],
                "style": "tsmc-platform-mix",
                "displayCurrency": "USD",
                "displayRevenueBn": round(usd_revenue_bn, 3),
                "sourceUrl": press_release_url,
            }
            ordered_keys = ["hpc", "smartphones", "iot", "automotive", "dce", "others"]
            for member_key in ordered_keys:
                if member_key not in mix_map:
                    continue
                name, support_lines = platform_names[member_key]
                result["quarters"][quarter]["segments"].append(
                    _build_row(
                        name,
                        mix_map[member_key],
                        member_key=member_key,
                        source_url=ocr_source_url,
                        source_form="6-K",
                        filing_date=filing_date,
                        support_lines=support_lines,
                        metric_mode="share",
                        mix_pct=mix_map[member_key],
                        qoq_pct=qoq_growth_map.get(member_key),
                    )
                )
            result["filingsUsed"].append({"form": "6-K", "filingDate": filing_date, "accession": accession_nodash, "presentation": presentation_name, "pressRelease": primary_document})
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{filing_date}: {exc}")
    return result


def _parse_cached_segment_hierarchy_records(company: dict[str, Any]) -> dict[str, Any]:
    company_id = str(company.get("id") or "")
    config = SEGMENT_CACHE_HIERARCHY_CONFIGS[company_id]
    segment_history_path = OFFICIAL_SEGMENT_CACHE_DIR / f"{company_id}.json"
    result = {"source": "official-segment-cache-hierarchy", "quarters": {}, "filingsUsed": [], "errors": []}
    if not segment_history_path.exists():
        result["errors"].append("segment-cache-missing")
        return result
    payload = _load_cached_json(segment_history_path)
    quarter_rows = payload.get("quarters") or {}
    result["filingsUsed"] = payload.get("filingsUsed", [])
    result["errors"] = payload.get("errors", [])

    for quarter, rows in quarter_rows.items():
        row_map = {
            str(row.get("memberKey") or row.get("name") or ""): row
            for row in rows
            if isinstance(row, dict) and row.get("valueBn") is not None
        }
        segments = []
        for segment in config.get("segments", []):
            members = [row_map.get(member_key) for member_key in segment.get("members", [])]
            members = [row for row in members if row]
            if not members:
                continue
            segments.append(
                _build_row(
                    str(segment.get("name") or ""),
                    sum(float(item.get("valueBn") or 0) for item in members),
                    member_key=str(segment.get("memberKey") or segment.get("name") or ""),
                    source_url=str(members[0].get("sourceUrl") or ""),
                    source_form=str(members[0].get("sourceForm") or ""),
                    filing_date=str(members[0].get("filingDate") or ""),
                )
            )
        detail_groups = []
        for group in config.get("detailGroups", []):
            members = [row_map.get(member_key) for member_key in group.get("members", [])]
            members = [row for row in members if row]
            if not members:
                continue
            detail_groups.append(
                _build_row(
                    str(group.get("name") or ""),
                    sum(float(item.get("valueBn") or 0) for item in members),
                    member_key=str(group.get("memberKey") or group.get("name") or ""),
                    source_url=str(members[0].get("sourceUrl") or ""),
                    source_form=str(members[0].get("sourceForm") or ""),
                    filing_date=str(members[0].get("filingDate") or ""),
                    target_name=str(group.get("targetName") or ""),
                )
            )
        if segments or detail_groups:
            quarter_payload: dict[str, Any] = {}
            if segments:
                quarter_payload["segments"] = sorted(segments, key=lambda item: float(item.get("valueBn") or 0), reverse=True)
            if detail_groups:
                quarter_payload["detailGroups"] = sorted(detail_groups, key=lambda item: float(item.get("valueBn") or 0), reverse=True)
            result["quarters"][quarter] = quarter_payload
    return result


def _parse_custom_xbrl_hierarchy_records(company: dict[str, Any], cik: int) -> dict[str, Any]:
    company_id = str(company.get("id") or "")
    config = CUSTOM_XBRL_HIERARCHY_CONFIGS[company_id]
    result = {"source": str(config.get("source") or "official-filings-xbrl-hierarchy"), "quarters": {}, "filingsUsed": [], "errors": []}
    segment_facts: list[SegmentFact] = []
    detail_facts: list[SegmentFact] = []

    for filing in _merged_filing_entries(company_id, cik):
        form = str(filing.get("form") or "")
        filing_date = str(filing.get("filingDate") or "")
        accession = str(filing.get("accession") or "")
        if filing_date < "2020-01-01" or form not in {"10-Q", "10-K"} or not accession:
            continue
        accession_nodash = accession.replace("-", "")
        try:
            instance_name = _instance_name_for_filing(cik, accession_nodash, filing)
            if not instance_name:
                continue
            segment_facts.extend(
                _collect_custom_hierarchy_facts(
                    cik,
                    accession_nodash,
                    filing_date,
                    form,
                    instance_name,
                    list(config.get("segments", [])),
                )
            )
            detail_facts.extend(
                _collect_custom_hierarchy_facts(
                    cik,
                    accession_nodash,
                    filing_date,
                    form,
                    instance_name,
                    list(config.get("detailGroups", [])),
                )
            )
            result["filingsUsed"].append(
                {
                    "form": form,
                    "filingDate": filing_date,
                    "accession": accession,
                    "instance": instance_name,
                }
            )
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{filing_date}: {exc}")

    segment_rows_by_quarter = _build_quarterly_series(segment_facts)
    detail_rows_by_quarter = _build_quarterly_series(detail_facts)
    detail_target_map = {
        str(item.get("memberKey") or item.get("name") or ""): str(item.get("targetName") or "")
        for item in config.get("detailGroups", [])
    }
    detail_support_map = {
        str(item.get("memberKey") or item.get("name") or ""): item.get("supportLines")
        for item in config.get("detailGroups", [])
    }

    all_quarters = sorted(set(segment_rows_by_quarter) | set(detail_rows_by_quarter), key=_period_key)
    for quarter in all_quarters:
        segment_rows = []
        for row in segment_rows_by_quarter.get(quarter, []):
            segment_rows.append(
                _build_row(
                    str(row.get("name") or ""),
                    float(row.get("valueBn") or 0),
                    member_key=str(row.get("memberKey") or row.get("name") or ""),
                    source_url=str(row.get("sourceUrl") or ""),
                    source_form=str(row.get("sourceForm") or ""),
                    filing_date=str(row.get("filingDate") or ""),
                )
            )
        detail_rows = []
        for row in detail_rows_by_quarter.get(quarter, []):
            member_key = str(row.get("memberKey") or row.get("name") or "")
            detail_rows.append(
                _build_row(
                    str(row.get("name") or ""),
                    float(row.get("valueBn") or 0),
                    member_key=member_key,
                    source_url=str(row.get("sourceUrl") or ""),
                    source_form=str(row.get("sourceForm") or ""),
                    filing_date=str(row.get("filingDate") or ""),
                    support_lines=detail_support_map.get(member_key),
                    target_name=detail_target_map.get(member_key),
                )
            )
        quarter_payload: dict[str, Any] = {}
        if segment_rows:
            quarter_payload["segments"] = sorted(segment_rows, key=lambda item: float(item.get("valueBn") or 0), reverse=True)
        if detail_rows:
            quarter_payload["detailGroups"] = sorted(detail_rows, key=lambda item: float(item.get("valueBn") or 0), reverse=True)
        if quarter_payload:
            result["quarters"][quarter] = quarter_payload
    return result


def _parse_xbrl_axis_company_records(company: dict[str, Any], cik: int, axis_key: str) -> dict[str, Any]:
    company_id = str(company.get("id") or "")
    config = XBRL_AXIS_COMPANY_CONFIGS.get(company_id, {})
    result = {"source": str(config.get("source") or "official-filings-xbrl-axis"), "quarters": {}, "filingsUsed": [], "errors": []}
    facts = []
    for filing in _merged_filing_entries(str(company.get("id") or ""), cik):
        form = str(filing.get("form") or "")
        filing_date = str(filing.get("filingDate") or "")
        accession = str(filing.get("accession") or "")
        if filing_date < "2020-01-01" or form not in {"10-Q", "10-K"} or not accession:
            continue
        accession_nodash = accession.replace("-", "")
        try:
            instance_name = str(filing.get("instance") or "")
            if not instance_name:
                index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
                items = [str(item.get("name") or "") for item in index_payload.get("directory", {}).get("item", [])]
                instance_name = next((name for name in items if name.endswith("_htm.xml")), "")
                if not instance_name:
                    instance_name = next(
                        (
                            name
                            for name in items
                            if name.endswith(".xml")
                            and "lab" not in name.lower()
                            and "def" not in name.lower()
                            and "pre" not in name.lower()
                            and "filingsummary" not in name.lower()
                            and "metalink" not in name.lower()
                        ),
                        "",
                    )
            if not instance_name:
                continue
            filing_facts = _parse_instance_facts(cik, accession_nodash, filing_date, form, instance_name)
            facts.extend([fact for fact in filing_facts if fact.axis_key == axis_key])
            result["filingsUsed"].append(
                {
                    "form": form,
                    "filingDate": filing_date,
                    "accession": accession,
                    "instance": instance_name,
                }
            )
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{filing_date}: {exc}")

    quarter_rows = _build_quarterly_series(facts)
    allowed = dict(config.get("labels") or {})
    support_lines_map = dict(config.get("support_lines") or {})
    style = config.get("style")

    for quarter, rows in quarter_rows.items():
        filtered_rows = []
        for row in rows:
            member_key = str(row.get("memberKey") or "")
            label = allowed.get(member_key)
            if not label:
                continue
            filtered_rows.append(
                _build_row(
                    label,
                    float(row.get("valueBn") or 0),
                    member_key=_normalize_region_member_key(label) if company_id == "netflix" else member_key,
                    source_url=str(row.get("sourceUrl") or ""),
                    source_form=str(row.get("sourceForm") or ""),
                    filing_date=str(row.get("filingDate") or ""),
                    support_lines=support_lines_map.get(member_key),
                )
            )
        if filtered_rows:
            quarter_payload: dict[str, Any] = {"segments": filtered_rows}
            if style:
                quarter_payload["style"] = style
            result["quarters"][quarter] = quarter_payload
    return result


def _table_parser_candidate_urls(
    *,
    company_id: str,
    cik: int,
    accession_nodash: str,
    primary_document: str,
    form: str,
) -> list[str]:
    candidate_names = [primary_document]
    if company_id == "netflix" and form == "8-K":
        try:
            index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
        except Exception:
            index_payload = {}
        for item in index_payload.get("directory", {}).get("item", []):
            name = str(item.get("name") or "")
            if not name or name == primary_document:
                continue
            lowered_name = name.lower()
            if lowered_name.endswith((".htm", ".html")) and "ex99" in lowered_name:
                candidate_names.append(name)
    seen_names: set[str] = set()
    urls: list[str] = []
    for name in candidate_names:
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        urls.append(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{name}")
    return urls


def _parse_table_company_records(company: dict[str, Any], cik: int) -> dict[str, Any]:
    company_id = str(company.get("id") or "")
    parsers = {
        "oracle": _parse_oracle_records,
        "mastercard": _parse_mastercard_records,
        "netflix": _parse_netflix_records,
    }
    parser = parsers[company_id]
    result = {"source": "official-filing-tables", "quarters": {}, "filingsUsed": [], "errors": []}
    period_records: list[dict[str, Any]] = []
    detail_period_records: list[dict[str, Any]] = []
    filings = _merged_filing_entries(str(company.get("id") or ""), cik)
    seen_accessions: set[str] = set()
    for filing in filings:
        form = str(filing.get("form") or "")
        accession = str(filing.get("accession") or "")
        filing_date = str(filing.get("filingDate") or "")
        primary_document = str(filing.get("primaryDocument") or "")
        allowed_forms = {"10-Q", "10-K"} | ({"8-K"} if company_id == "netflix" else set())
        if filing_date < "2019-01-01" or form not in allowed_forms or not accession or not primary_document:
            continue
        accession_nodash = str(accession).replace("-", "")
        if accession_nodash in seen_accessions:
            continue
        seen_accessions.add(accession_nodash)
        try:
            used_source_url = ""
            for source_url in _table_parser_candidate_urls(
                company_id=company_id,
                cik=cik,
                accession_nodash=accession_nodash,
                primary_document=primary_document,
                form=form,
            ):
                html_text = _request(source_url).decode("utf-8", errors="ignore")
                records = parser(html_text, filing_date, source_url, form)
                if not records:
                    continue
                period_records.extend(records)
                if company_id == "oracle":
                    detail_period_records.extend(_parse_oracle_detail_records(html_text, filing_date, source_url, form))
                used_source_url = source_url
                break
            if used_source_url:
                result["filingsUsed"].append(
                    {
                        "form": form,
                        "filingDate": filing_date,
                        "accession": accession,
                        "primaryDocument": primary_document,
                        "sourceUrl": used_source_url,
                    }
                )
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"{filing_date}: {exc}")
    style_by_company = {
        "oracle": "oracle-revenue-bridge",
        "mastercard": "mastercard-revenue-bridge",
        "netflix": "netflix-regional-revenue",
    }
    style = style_by_company.get(company_id)
    segment_quarters = _build_quarter_rows_from_period_records(period_records)
    display_revenue_quarters = _build_quarter_display_revenue_map(period_records)
    detail_quarters = _build_quarter_rows_from_period_records(detail_period_records)
    all_quarters = sorted(set(segment_quarters) | set(detail_quarters), key=_period_key)
    for quarter in all_quarters:
        quarter_payload: dict[str, Any] = {}
        if segment_quarters.get(quarter):
            quarter_payload["segments"] = segment_quarters[quarter]
        if display_revenue_quarters.get(quarter):
            quarter_payload["displayRevenueBn"] = display_revenue_quarters[quarter]
        if detail_quarters.get(quarter):
            quarter_payload["detailGroups"] = detail_quarters[quarter]
        if style:
            quarter_payload["style"] = style
        if quarter_payload:
            result["quarters"][quarter] = quarter_payload
    return result


def _post_process_result(company: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    result["quarters"] = result.get("quarters", {})
    return result


def fetch_official_revenue_structure_history(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    company_id = str(company.get("id") or "")
    path = _cache_path(company_id)
    empty_result = {"source": "official-revenue-structures", "quarters": {}, "filingsUsed": [], "errors": []}
    cached_payload = _load_cached_json(path) if path.exists() else None
    if path.exists() and not refresh:
        if isinstance(cached_payload, dict) and cached_payload.get("_cacheVersion") == CACHE_VERSION:
            return cached_payload

    result = empty_result
    cik: int | None = None

    if company_id == "tencent":
        result = _parse_tencent_records(company)
    elif company_id == "alibaba":
        result = _parse_alibaba_records(company)
    else:
        cik = _resolve_cik(str(company.get("ticker") or ""), refresh=refresh)
        if cik is not None:
            if company_id in SEGMENT_CACHE_HIERARCHY_CONFIGS:
                result = _parse_cached_segment_hierarchy_records(company)
            elif company_id == "alphabet":
                result = _parse_alphabet_records(company, cik)
            elif company_id == "asml":
                result = _parse_asml_records(company, cik)
            elif company_id in {"oracle", "mastercard", "netflix"}:
                result = _parse_table_company_records(company, cik)
            elif company_id in CUSTOM_XBRL_HIERARCHY_CONFIGS:
                result = _parse_custom_xbrl_hierarchy_records(company, cik)
            elif company_id == "tsmc":
                result = _parse_tsmc_records(company, cik)
            elif company_id in XBRL_AXIS_COMPANY_CONFIGS:
                result = _parse_xbrl_axis_company_records(company, cik, str(XBRL_AXIS_COMPANY_CONFIGS[company_id]["axis"]))

    if not result.get("quarters"):
        fallback_result = _parse_generic_segment_cache_records(company)
        if fallback_result.get("quarters"):
            result = fallback_result
        elif not result.get("errors") and fallback_result.get("errors"):
            result["errors"] = fallback_result.get("errors", [])

    if (
        isinstance(cached_payload, dict)
        and cached_payload.get("quarters")
        and not result.get("quarters")
    ):
        preserved_result = dict(cached_payload)
        preserved_errors = list(preserved_result.get("errors") or [])
        for error in result.get("errors") or []:
            if error not in preserved_errors:
                preserved_errors.append(error)
        preserved_result["errors"] = preserved_errors
        result = preserved_result

    result = _post_process_result(company, result)
    result["_cacheVersion"] = CACHE_VERSION
    _write_cached_json(path, result)
    return result
