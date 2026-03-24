from __future__ import annotations

import json
from io import BytesIO
from typing import Any

from pypdf import PdfReader

from generic_filing_table_parser import _merge_entry
from generic_ir_pdf_parser import (
    _extract_pdf_page_texts,
    _maybe_enrich_page_texts_with_ocr,
    _period_entries_from_pdf_pages,
    _quick_fetch_pdf_bytes,
    _score_entry,
    fetch_generic_ir_pdf_history,
)
from statement_periods import finalize_period_entries
from taxonomy_normalizer import normalize_breakdown_items


def _approx_equal(actual: Any, expected: float, tolerance: float = 0.02) -> bool:
    try:
        return abs(float(actual) - float(expected)) <= tolerance
    except Exception:
        return False


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _fedex_release_summary_ocr_case() -> dict[str, Any]:
    url = "https://s21.q4cdn.com/665674268/files/doc_financials/2022/q4/FedEx-Q4-FY22-Earnings-Release.pdf"
    pdf_bytes = _quick_fetch_pdf_bytes(url)
    blank_pages = ["" for _ in PdfReader(BytesIO(pdf_bytes)).pages]
    enriched_pages = _maybe_enrich_page_texts_with_ocr(pdf_bytes, blank_pages)
    rows = _period_entries_from_pdf_pages(enriched_pages, url, "")
    summary_rows = [row for row in rows if row.get("statementSource") == "generic-ir-pdf-release-summary"]
    current = next((row for row in summary_rows if row.get("calendarQuarter") == "2022Q2"), None)
    prior = next((row for row in summary_rows if row.get("calendarQuarter") == "2021Q2"), None)
    _assert(current is not None, "FedEx release summary OCR case missing 2022Q2")
    _assert(prior is not None, "FedEx release summary OCR case missing 2021Q2")
    _assert(_approx_equal(current.get("revenueBn"), 24.4), "FedEx release summary 2022Q2 revenue mismatch")
    _assert(_approx_equal(current.get("operatingIncomeBn"), 1.92), "FedEx release summary 2022Q2 operating income mismatch")
    _assert(_approx_equal(current.get("netIncomeBn"), 0.558), "FedEx release summary 2022Q2 net income mismatch")
    _assert(_approx_equal(prior.get("revenueBn"), 22.6), "FedEx release summary 2021Q2 revenue mismatch")
    return {
        "case": "fedex_release_summary_ocr",
        "status": "passed",
        "quarters": {
            "2022Q2": {key: current.get(key) for key in ("revenueBn", "operatingIncomeBn", "netIncomeBn")},
            "2021Q2": {key: prior.get(key) for key in ("revenueBn", "operatingIncomeBn", "netIncomeBn")},
        },
    }


def _fedex_formal_statement_ocr_case() -> dict[str, Any]:
    url = "https://s21.q4cdn.com/665674268/files/doc_financials/2023/q3/FedEx-Q3-FY23-10-Q.pdf"
    pdf_bytes = _quick_fetch_pdf_bytes(url)
    blank_pages = ["" for _ in PdfReader(BytesIO(pdf_bytes)).pages]
    enriched_pages = _maybe_enrich_page_texts_with_ocr(pdf_bytes, blank_pages)
    rows = _period_entries_from_pdf_pages([enriched_pages[4]], url, "")
    finalized = finalize_period_entries(rows, merge_entry=_merge_entry, score_entry=_score_entry)
    current = finalized.get("2023Q1")
    prior = finalized.get("2022Q1")
    _assert(current is not None, "FedEx formal OCR case missing 2023Q1")
    _assert(prior is not None, "FedEx formal OCR case missing 2022Q1")
    _assert(_approx_equal(current.get("revenueBn"), 22.169), "FedEx formal OCR 2023Q1 revenue mismatch")
    _assert(_approx_equal(current.get("operatingIncomeBn"), 1.042), "FedEx formal OCR 2023Q1 operating income mismatch")
    _assert(_approx_equal(current.get("netIncomeBn"), 0.771), "FedEx formal OCR 2023Q1 net income mismatch")
    return {
        "case": "fedex_formal_statement_ocr",
        "status": "passed",
        "quarters": {
            "2023Q1": {
                key: current.get(key)
                for key in ("revenueBn", "operatingIncomeBn", "taxBn", "netIncomeBn", "statementSpanQuarters")
            },
            "2022Q1": {
                key: prior.get(key)
                for key in ("revenueBn", "operatingIncomeBn", "taxBn", "netIncomeBn", "statementSpanQuarters")
            },
        },
    }


def _byd_cumulative_case() -> dict[str, Any]:
    urls = [
        "https://static.cninfo.com.cn/finalpage/2025-08-30/1224626653.PDF",
        "https://static.cninfo.com.cn/finalpage/2025-10-31/1224776127.PDF",
    ]
    rows: list[dict[str, Any]] = []
    for url in urls:
        rows.extend(_period_entries_from_pdf_pages(_extract_pdf_page_texts(url), url, ""))
    finalized = finalize_period_entries(rows, merge_entry=_merge_entry, score_entry=_score_entry)
    target = finalized.get("2025Q3")
    _assert(target is not None, "BYD cumulative case missing 2025Q3")
    _assert(_approx_equal(target.get("revenueBn"), 194.985), "BYD 2025Q3 revenue mismatch")
    _assert(_approx_equal(target.get("costOfRevenueBn"), 160.639), "BYD 2025Q3 cost mismatch")
    _assert(_approx_equal(target.get("operatingIncomeBn"), 10.186), "BYD 2025Q3 operating income mismatch")
    _assert(_approx_equal(target.get("netIncomeBn"), 8.193), "BYD 2025Q3 net income mismatch")
    return {
        "case": "byd_cumulative_derivation",
        "status": "passed",
        "quarter": {key: target.get(key) for key in ("revenueBn", "costOfRevenueBn", "operatingIncomeBn", "pretaxIncomeBn", "taxBn", "netIncomeBn")},
    }


def _taxonomy_case() -> dict[str, Any]:
    items = normalize_breakdown_items(
        "opex",
        [
            {"name": "Sales and distribution expense", "valueBn": 1.5},
            {"name": "Advertising and promotion", "valueBn": 0.7},
            {"name": "Total operating expenses", "valueBn": 9.9},
            {"name": "General corporate overhead", "valueBn": 0.8},
            {"name": "Interest and other expense", "valueBn": 0.4},
            {"name": "Product development", "valueBn": 1.1},
        ],
    )
    taxonomy_map = {str(item.get("taxonomyId") or ""): float(item.get("valueBn") or 0) for item in items}
    _assert("sales_marketing" in taxonomy_map and _approx_equal(taxonomy_map["sales_marketing"], 2.2), "taxonomy sales_marketing aggregation mismatch")
    _assert("general_administrative" in taxonomy_map, "taxonomy missing G&A")
    _assert("finance_expense" in taxonomy_map, "taxonomy missing finance_expense")
    _assert(all(item.get("taxonomyId") != "totaloperatingexpenses" for item in items), "taxonomy failed to reject total row")
    return {
        "case": "taxonomy_normalizer",
        "status": "passed",
        "items": items,
    }


def _fedex_history_case() -> dict[str, Any]:
    company = {"id": "fedex-ir-only", "ticker": "", "slug": "fedex", "website": "https://investors.fedex.com"}
    result = fetch_generic_ir_pdf_history(company, refresh=False)
    quarters = result.get("quarters") or []
    _assert(quarters[:1] == ["2020Q4"], "FedEx history missing 2020Q4 start")
    _assert(quarters[-1:] == ["2026Q1"], "FedEx history missing 2026Q1 end")
    _assert(len(quarters) >= 22, "FedEx history length regressed")
    return {
        "case": "fedex_history_window",
        "status": "passed",
        "quarters": {"count": len(quarters), "first": quarters[0], "last": quarters[-1]},
    }


def main() -> None:
    cases = [
        _fedex_release_summary_ocr_case,
        _fedex_formal_statement_ocr_case,
        _byd_cumulative_case,
        _taxonomy_case,
        _fedex_history_case,
    ]
    results: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for case in cases:
        try:
            results.append(case())
        except Exception as exc:  # noqa: BLE001
            failures.append({"case": case.__name__, "status": "failed", "error": str(exc)})
    payload = {
        "status": "passed" if not failures else "failed",
        "passedCount": len(results),
        "failedCount": len(failures),
        "results": results + failures,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
