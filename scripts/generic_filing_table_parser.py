from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any

from official_financials import (
    _build_financial_entry,
    _extract_html_tables,
    _make_breakdown_item,
    _normalize_table_key,
    _parse_number,
    _quarter_from_date_label,
    _quarter_period_end,
    _select_reporting_currency,
)
from official_segments import _period_key, _request, _request_json, _resolve_cik, _submission_records
from statement_periods import finalize_period_entries


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "generic-filing-tables"
MIN_FILING_DATE = "2018-01-01"
SUPPORTED_FORMS = {"10-Q", "10-K", "20-F", "6-K", "8-K"}
MAX_FILINGS_TO_SCAN = 28

ROW_ALIASES: dict[str, tuple[str, ...]] = {
    "revenue": (
        "revenue",
        "revenues",
        "totalrevenue",
        "netrevenue",
        "netrevenues",
        "sales",
        "netsales",
        "salesrevenue",
        "totalnetrevenues",
        "营业收入",
        "主营业务收入",
        "收入",
        "销售收入",
    ),
    "costOfRevenue": (
        "costofrevenue",
        "costofrevenues",
        "costofsales",
        "costofgoodsold",
        "costofgoodssold",
        "costofproductsold",
        "costofservices",
        "costofservicesales",
        "营业成本",
        "销售成本",
        "主营业务成本",
    ),
    "grossProfit": ("grossprofit", "毛利", "毛利润", "毛利额"),
    "sgna": (
        "sellinggeneralandadministrative",
        "sellinggeneraladministrative",
        "sellinggeneralandadministrativeexpenses",
        "sellinggeneralandadministrativeexpense",
        "销售及管理费用",
        "销售和管理费用",
    ),
    "salesAndMarketing": (
        "salesandmarketing",
        "salesandmarketingexpense",
        "sellingandmarketing",
        "sellingexpense",
        "marketing",
        "marketingexpense",
        "销售费用",
        "营销费用",
        "销售及分销开支",
        "销售和市场费用",
    ),
    "generalAndAdministrative": (
        "generalandadministrative",
        "generalandadministrativeexpense",
        "administrativeexpense",
        "administrativeexpenses",
        "管理费用",
        "一般及行政开支",
    ),
    "rnd": (
        "researchanddevelopment",
        "researchanddevelopmentexpense",
        "researchdevelopmentexpense",
        "technologyandcontent",
        "研发费用",
        "研究及开发费用",
        "研究开发费用",
    ),
    "fulfillment": ("fulfillment", "fulfillmentexpense", "履约费用"),
    "taxesAndSurcharges": ("taxesandsurcharges", "税金及附加"),
    "financeExpense": ("financeexpense", "财务费用", "净财务费用"),
    "operatingExpenses": (
        "operatingexpenses",
        "totaloperatingexpenses",
        "costsandexpenses",
        "营业费用",
        "经营费用",
        "期间费用",
        "总营业费用",
    ),
    "operatingIncome": (
        "operatingincome",
        "incomefromoperations",
        "incomelossfromoperations",
        "operatingprofit",
        "profitfromoperations",
        "营业利润",
        "经营利润",
    ),
    "pretaxIncome": (
        "incomebeforetaxes",
        "incomebeforeincometaxes",
        "incomebeforetax",
        "pretaxincome",
        "profitbeforetax",
        "利润总额",
        "税前利润",
    ),
    "tax": (
        "incometaxexpense",
        "incometaxexpenses",
        "provisionforincometaxes",
        "provisionforincometax",
        "taxexpense",
        "所得税费用",
    ),
    "netIncome": (
        "netincome",
        "netincomeloss",
        "profitloss",
        "netincomeattributabletoordinaryshareholders",
        "netincomelossattributabletoordinaryshareholders",
        "净利润",
        "本期净利润",
    ),
}

OPTIONAL_BREAKDOWN_ROWS: tuple[tuple[str, str, str, str], ...] = (
    ("salesAndMarketing", "Sales & Marketing", "销售与营销", "negative-parentheses"),
    ("generalAndAdministrative", "G&A", "管理费用", "negative-parentheses"),
    ("rnd", "R&D", "研发", "negative-parentheses"),
    ("fulfillment", "Fulfillment", "履约", "negative-parentheses"),
    ("taxesAndSurcharges", "Taxes & Surcharges", "税金及附加", "negative-parentheses"),
    ("financeExpense", "Finance Expense", "财务费用", "negative-parentheses"),
)


def _cache_path(company_id: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{company_id}.json"


def _load_cached_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_cached_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _table_scale(rows: list[list[str]]) -> float:
    header_text = " ".join(" ".join(row[:4]) for row in rows[:6]).lower()
    if "in billions" in header_text or "billions" in header_text:
        return 1_000_000_000
    if "in millions" in header_text or "millions" in header_text:
        return 1_000_000
    if "in thousands" in header_text or "thousands" in header_text:
        return 1_000
    return 1


def _infer_scale_from_revenue_values(values: list[float], base_scale: float) -> float:
    if base_scale != 1 or not values:
        return base_scale
    max_abs = max(abs(value) for value in values)
    if max_abs >= 100_000:
        return 1_000
    if max_abs >= 100:
        return 1_000_000
    return 1


def _normalize_row_name(value: str) -> str:
    return _normalize_table_key(value)


def _find_row(row_map: dict[str, list[str]], field_name: str) -> list[str] | None:
    aliases = ROW_ALIASES.get(field_name, ())
    for key, row in row_map.items():
        normalized_key = _normalize_row_name(key)
        for alias in aliases:
            normalized_alias = _normalize_row_name(alias)
            if normalized_key == normalized_alias or normalized_key.startswith(normalized_alias) or normalized_key.endswith(normalized_alias):
                return row
    return None


def _period_column(year: int, quarter_number: int, *, span: int = 1) -> dict[str, Any]:
    return {
        "quarter": f"{year}Q{quarter_number}",
        "periodEnd": _quarter_period_end(year, quarter_number),
        "statementSpanQuarters": max(int(span or 1), 1),
        "statementValueMode": "direct" if int(span or 1) <= 1 else "cumulative",
    }


def _extract_quarter_columns(rows: list[list[str]]) -> list[dict[str, Any]]:
    columns: list[dict[str, Any]] = []
    header_scan_rows = rows[:6]
    for row in header_scan_rows:
        for cell in row:
            quarter_match = re.fullmatch(r"Q([1-4])\s+(\d{4})", str(cell or "").strip())
            if quarter_match:
                year = int(quarter_match.group(2))
                quarter_number = int(quarter_match.group(1))
                columns.append(_period_column(year, quarter_number))
    if columns:
        return columns

    for row_index, row in enumerate(header_scan_rows[:-1]):
        span = 0
        header_cell = ""
        for cell in row:
            normalized = _normalize_table_key(cell)
            if "threemonthsended" in normalized or "quarterended" in normalized:
                span = 1
                header_cell = str(cell or "")
                break
            if "sixmonthsended" in normalized:
                span = 2
                header_cell = str(cell or "")
                break
            if "ninemonthsended" in normalized:
                span = 3
                header_cell = str(cell or "")
                break
            if "yearended" in normalized or "twelvemonthsended" in normalized:
                span = 4
                header_cell = str(cell or "")
                break
        if span <= 0:
            continue
        next_row = header_scan_rows[row_index + 1]
        years = [int(match.group(1)) for cell in next_row for match in [re.search(r"(\d{4})", str(cell or ""))] if match]
        if not header_cell or len(years) < 2:
            continue
        extracted: list[dict[str, Any]] = []
        for year in years[:2]:
            parsed = _quarter_from_date_label(header_cell, str(year))
            if parsed is None:
                continue
            parsed_year, quarter_number, _ = parsed
            extracted.append(_period_column(parsed_year, quarter_number, span=span))
        if extracted:
            return extracted

    header_text = " ".join(" ".join(row) for row in header_scan_rows)
    chinese_span_map = {"3": 1, "三": 1, "6": 2, "六": 2, "9": 3, "九": 3, "12": 4, "十二": 4}
    chinese_columns: list[dict[str, Any]] = []
    for match in re.finditer(r"截至\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日止\s*(12|[369]|十二|三|六|九)\s*个月期间", header_text):
        year = int(match.group(1))
        month = int(match.group(2))
        quarter_number = ((month - 1) // 3) + 1
        chinese_columns.append(_period_column(year, quarter_number, span=chinese_span_map.get(match.group(4), 1)))
    if chinese_columns:
        return chinese_columns

    for row in header_scan_rows:
        for cell in row:
            parsed = _quarter_from_date_label(cell, cell)
            if parsed is None:
                continue
            year, quarter_number, _ = parsed
            columns.append(_period_column(year, quarter_number))
    return columns


def _row_numeric_series(row: list[str] | None, expected_count: int, *, absolute: bool = False) -> list[float]:
    if row is None or expected_count <= 0:
        return []
    values: list[float] = []
    for cell in row[1:]:
        parsed = _parse_number(cell)
        if parsed is None:
            continue
        values.append(abs(parsed) if absolute else parsed)
    if len(values) >= expected_count + 1 and abs(values[0] - round(values[0])) < 1e-9 and 0 <= values[0] <= 999:
        trailing_values = values[1 : expected_count + 1]
        if trailing_values and max(abs(value) for value in trailing_values) > max(abs(values[0]) * 100, 10_000):
            values = trailing_values
    if len(values) < expected_count:
        return []
    return values[:expected_count]


def _score_entry(entry: dict[str, Any]) -> tuple[int, int, int, int]:
    field_count = sum(1 for key in ("revenueBn", "costOfRevenueBn", "grossProfitBn", "operatingIncomeBn", "pretaxIncomeBn", "taxBn", "netIncomeBn") if entry.get(key) is not None)
    has_breakdown = int(bool(entry.get("officialOpexBreakdown")))
    has_cost = int(entry.get("costOfRevenueBn") is not None)
    revenue_magnitude = int(round(abs(float(entry.get("revenueBn") or 0)) * 1000))
    return (field_count, has_breakdown, has_cost, revenue_magnitude)


def _merge_entry(existing: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(existing, dict):
        return incoming
    merged = dict(existing)
    for key, value in incoming.items():
        if value is None:
            continue
        if key == "officialOpexBreakdown":
            current = merged.get(key)
            if not isinstance(current, list) or len(value) > len(current):
                merged[key] = value
            continue
        if merged.get(key) is None:
            merged[key] = value
    return merged


def _period_entries_from_table(rows: list[list[str]], currency: str, source_url: str, filing_date: str) -> list[dict[str, Any]]:
    if len(rows) < 3:
        return []
    quarter_columns = _extract_quarter_columns(rows)
    if not quarter_columns:
        return []

    row_map = {_normalize_row_name(row[0]): row for row in rows if row and len(row) > 1}
    revenue_row = _find_row(row_map, "revenue")
    revenue_present = revenue_row is not None
    supporting_rows_present = any(
        _find_row(row_map, field_name) is not None
        for field_name in ("operatingIncome", "pretaxIncome", "netIncome", "salesAndMarketing", "generalAndAdministrative", "rnd", "fulfillment")
    )
    if not revenue_present and not supporting_rows_present:
        return []

    scale = _table_scale(rows)
    results: list[dict[str, Any]] = []
    expected_count = len(quarter_columns)
    revenue_series = _row_numeric_series(revenue_row, expected_count)
    if revenue_present and len(revenue_series) != expected_count:
        return []
    scale = _infer_scale_from_revenue_values(revenue_series, scale)

    cost_row = _find_row(row_map, "costOfRevenue")
    gross_row = _find_row(row_map, "grossProfit")
    sgna_row = _find_row(row_map, "sgna")
    sales_marketing_row = _find_row(row_map, "salesAndMarketing")
    general_admin_row = _find_row(row_map, "generalAndAdministrative")
    rnd_row = _find_row(row_map, "rnd")
    fulfillment_row = _find_row(row_map, "fulfillment")
    taxes_surcharges_row = _find_row(row_map, "taxesAndSurcharges")
    finance_expense_row = _find_row(row_map, "financeExpense")
    operating_expenses_row = _find_row(row_map, "operatingExpenses")
    operating_income_row = _find_row(row_map, "operatingIncome")
    pretax_row = _find_row(row_map, "pretaxIncome")
    tax_row = _find_row(row_map, "tax")
    net_income_row = _find_row(row_map, "netIncome")

    cost_series = _row_numeric_series(cost_row, expected_count, absolute=True)
    gross_series = _row_numeric_series(gross_row, expected_count)
    sgna_series = _row_numeric_series(sgna_row, expected_count, absolute=True)
    sales_marketing_series = _row_numeric_series(sales_marketing_row, expected_count, absolute=True)
    general_admin_series = _row_numeric_series(general_admin_row, expected_count, absolute=True)
    rnd_series = _row_numeric_series(rnd_row, expected_count, absolute=True)
    fulfillment_series = _row_numeric_series(fulfillment_row, expected_count, absolute=True)
    taxes_surcharges_series = _row_numeric_series(taxes_surcharges_row, expected_count, absolute=True)
    finance_expense_series = _row_numeric_series(finance_expense_row, expected_count, absolute=True)
    operating_expenses_series = _row_numeric_series(operating_expenses_row, expected_count, absolute=True)
    operating_income_series = _row_numeric_series(operating_income_row, expected_count)
    pretax_series = _row_numeric_series(pretax_row, expected_count)
    tax_series = _row_numeric_series(tax_row, expected_count, absolute=True)
    net_income_series = _row_numeric_series(net_income_row, expected_count)

    for index, column in enumerate(quarter_columns):
        quarter = str(column.get("quarter") or "")
        period_end = str(column.get("periodEnd") or "")
        statement_span_quarters = int(column.get("statementSpanQuarters") or 1)
        revenue_raw = revenue_series[index] if len(revenue_series) == expected_count else None
        if revenue_raw is not None and abs(revenue_raw) < 1:
            continue
        if _period_key(quarter) < (2018, 1):
            continue

        cost_raw = cost_series[index] if len(cost_series) == expected_count else None
        gross_raw = gross_series[index] if len(gross_series) == expected_count else None
        sgna_raw = sgna_series[index] if len(sgna_series) == expected_count else None
        sales_marketing_raw = sales_marketing_series[index] if len(sales_marketing_series) == expected_count else None
        general_admin_raw = general_admin_series[index] if len(general_admin_series) == expected_count else None
        rnd_raw = rnd_series[index] if len(rnd_series) == expected_count else None
        fulfillment_raw = fulfillment_series[index] if len(fulfillment_series) == expected_count else None
        taxes_surcharges_raw = taxes_surcharges_series[index] if len(taxes_surcharges_series) == expected_count else None
        finance_expense_raw = finance_expense_series[index] if len(finance_expense_series) == expected_count else None
        operating_expenses_raw = operating_expenses_series[index] if len(operating_expenses_series) == expected_count else None
        operating_income_raw = operating_income_series[index] if len(operating_income_series) == expected_count else None
        pretax_raw = pretax_series[index] if len(pretax_series) == expected_count else None
        tax_raw = tax_series[index] if len(tax_series) == expected_count else None
        net_income_raw = net_income_series[index] if len(net_income_series) == expected_count else None

        if gross_raw is None and revenue_raw is not None and cost_raw is not None:
            gross_raw = revenue_raw - cost_raw
        if operating_expenses_raw is None and gross_raw is not None and operating_income_raw is not None:
            operating_expenses_raw = gross_raw - operating_income_raw
        if sgna_raw is None:
            disclosed_sgna = sum(value for value in (sales_marketing_raw, general_admin_raw, fulfillment_raw) if value is not None)
            sgna_raw = disclosed_sgna or None

        entry = _build_financial_entry(
            quarter,
            currency,
            period_end,
            quarter[:4],
            f"Q{quarter[-1]}",
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
        entry["statementSource"] = "generic-official-filing-table"
        entry["statementSourceUrl"] = source_url
        entry["statementFilingDate"] = filing_date
        entry["statementSpanQuarters"] = statement_span_quarters
        entry["statementValueMode"] = "direct" if statement_span_quarters == 1 else "cumulative"

        opex_items: list[dict[str, Any]] = []
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
        results.append(entry)
    return results


def _parse_table_entries(rows: list[list[str]], currency: str, source_url: str, filing_date: str) -> dict[str, dict[str, Any]]:
    return finalize_period_entries(
        _period_entries_from_table(rows, currency, source_url, filing_date),
        merge_entry=_merge_entry,
        score_entry=_score_entry,
    )


def _preferred_html_names(index_payload: dict[str, Any], primary_document: str) -> list[str]:
    names = [
        str(item.get("name") or "")
        for item in index_payload.get("directory", {}).get("item", [])
        if str(item.get("name") or "")
    ]
    html_names = [
        name
        for name in names
        if name.lower().endswith((".htm", ".html"))
        and "index" not in name.lower()
        and not name.lower().endswith((".jpg", ".jpeg", ".png", ".gif"))
    ]
    if not html_names:
        return []
    preferred = sorted(
        html_names,
        key=lambda name: (
            0 if "ex99" in name.lower() or "press" in name.lower() or "earn" in name.lower() or "financial" in name.lower() else 1 if name == primary_document else 2,
            name,
        ),
    )
    return preferred[:6]


def fetch_generic_filing_table_history(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    path = _cache_path(str(company.get("id") or "company"))
    if path.exists() and not refresh:
        return _load_cached_json(path)

    result = {
        "id": company.get("id"),
        "ticker": company.get("ticker"),
        "quarters": [],
        "financials": {},
        "statementSource": "generic-official-filing-table",
        "statementSourceUrl": None,
        "reportingCurrency": None,
        "errors": [],
        "filingsUsed": [],
    }
    cik = _resolve_cik(str(company.get("ticker") or ""), refresh=refresh)
    if cik is None:
        result["errors"].append("Unable to resolve SEC CIK.")
        _write_cached_json(path, result)
        return result

    try:
        companyfacts = _request_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json")
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"companyfacts: {exc}")
        _write_cached_json(path, result)
        return result
    reporting_currency = _select_reporting_currency(companyfacts)
    if not reporting_currency:
        result["errors"].append("Unable to determine reporting currency.")
        _write_cached_json(path, result)
        return result
    result["reportingCurrency"] = reporting_currency
    result["statementSourceUrl"] = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"

    try:
        submissions = _request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"submissions: {exc}")
        _write_cached_json(path, result)
        return result

    scanned = 0
    period_entries: list[dict[str, Any]] = []
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
        html_names = _preferred_html_names(index_payload, primary_document)
        if not html_names:
            continue
        scanned += 1
        parsed_any = False
        for name in html_names:
            url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{name}"
            try:
                html_text = _request(url).decode("utf-8", errors="ignore")
            except Exception:
                continue
            parsed_period_entries: list[dict[str, Any]] = []
            for rows in _extract_html_tables(html_text):
                parsed_period_entries.extend(_period_entries_from_table(rows, reporting_currency, url, filing_date))
            if not parsed_period_entries:
                continue
            parsed_any = True
            period_entries.extend(parsed_period_entries)
            result["filingsUsed"].append(
                {
                    "form": form,
                    "filingDate": filing_date,
                    "sourceUrl": url,
                }
            )
            break
        if parsed_any and len({str(entry.get("calendarQuarter") or "") for entry in period_entries}) >= 12:
            break

    financials = finalize_period_entries(period_entries, merge_entry=_merge_entry, score_entry=_score_entry)
    result["quarters"] = sorted(financials.keys(), key=_period_key)
    result["financials"] = {quarter: financials[quarter] for quarter in result["quarters"]}
    _write_cached_json(path, result)
    return result
