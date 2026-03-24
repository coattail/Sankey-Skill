from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup
from official_revenue_structures import (
    _extract_pdf_text,
    _load_alibaba_press_release_pdf,
    _load_alibaba_quarterly_items,
    _normalize_text_space,
    _quarter_from_alibaba_title,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "stockanalysis-financials"

REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


ROW_ALIASES = {
    "revenue": ["Revenue"],
    "revenueYoyPct": ["Revenue Growth (YoY)"],
    "costOfRevenue": ["Cost of Revenue"],
    "grossProfit": ["Gross Profit"],
    "sgna": ["Selling, General & Admin"],
    "rnd": ["Research & Development"],
    "otherOpex": ["Other Operating Expenses"],
    "operatingExpenses": ["Total Operating Expenses", "Operating Expenses"],
    "operatingIncome": ["Operating Income"],
    "nonOperating": ["Total Non-Operating Income (Expense)"],
    "pretaxIncome": ["Pretax Income", "EBT Excluding Unusual Items"],
    "tax": ["Provision for Income Taxes", "Income Tax Expense"],
    "netIncome": ["Net Income"],
    "netIncomeYoyPct": ["Net Income Growth"],
    "grossMarginPct": ["Gross Margin"],
    "operatingMarginPct": ["Operating Margin"],
    "profitMarginPct": ["Profit Margin"],
}


def _cache_path(company_id: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{company_id}.json"


def _load_cached_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_cached_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _request_text(url: str) -> str:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=30)
    response.raise_for_status()
    return response.text


def _parse_currency(html_text: str) -> str | None:
    match = re.search(r"Financials in millions ([A-Z]{3})", html_text)
    return match.group(1) if match else None


def _clean_number(raw: str) -> float | None:
    text = str(raw or "").strip()
    if not text or text in {"-", "—", "N/A"}:
        return None
    text = text.replace(",", "").replace("%", "")
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    try:
        return float(text)
    except ValueError:
        return None


def _extract_period_end(raw: str) -> str | None:
    match = re.search(r"([A-Z][a-z]{2})\s+\d{1,2},\s+(\d{4})", raw)
    if not match:
        return None
    month = {
        "Jan": 1,
        "Feb": 2,
        "Mar": 3,
        "Apr": 4,
        "May": 5,
        "Jun": 6,
        "Jul": 7,
        "Aug": 8,
        "Sep": 9,
        "Oct": 10,
        "Nov": 11,
        "Dec": 12,
    }[match.group(1)]
    # raw always includes exact day too.
    day_match = re.search(r"[A-Z][a-z]{2}\s+(\d{1,2}),\s+\d{4}", raw)
    if not day_match:
        return None
    return date(int(match.group(2)), month, int(day_match.group(1))).isoformat()


def _calendar_quarter(period_end: str) -> str:
    year, month, _day = (int(part) for part in period_end.split("-"))
    quarter = (month - 1) // 3 + 1
    return f"{year}Q{quarter}"


def _normalize_fiscal_header(raw: str) -> tuple[str, str, str]:
    text = str(raw or "").strip()
    quarter_match = re.fullmatch(r"Q([1-4])\s+(\d{4})", text)
    if quarter_match:
        fiscal_quarter = f"Q{quarter_match.group(1)}"
        fiscal_year = quarter_match.group(2)
        return fiscal_year, fiscal_quarter, f"FY{fiscal_year} {fiscal_quarter}"
    year_match = re.fullmatch(r"FY\s+(\d{4})", text)
    if year_match:
        fiscal_year = year_match.group(1)
        return fiscal_year, "Q4", f"FY{fiscal_year} Q4"
    return "", "", text


def _row_map(table) -> dict[str, list[str]]:
    rows: dict[str, list[str]] = {}
    for tr in table.find_all("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if len(cells) < 2:
            continue
        rows[cells[0]] = cells[1:]
    return rows


def _find_row(row_map_value: dict[str, list[str]], aliases: list[str]) -> list[str] | None:
    for alias in aliases:
        if alias in row_map_value:
            return row_map_value[alias]
    return None


def _to_billions(value_millions: float | None) -> float | None:
    if value_millions is None:
        return None
    return round(value_millions / 1000, 3)


def _to_pct(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 3)


def _extract_first_billion_value(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text, re.IGNORECASE)
    if not match:
        return None
    raw = str(match.group(1) or "").replace(",", "")
    try:
        return round(float(raw) / 1000, 3)
    except ValueError:
        return None


def _parse_alibaba_pdf_financial_entry(pdf_text: str, quarter_key: str, fiscal_label: str, source_url: str, period_end: str) -> dict[str, Any] | None:
    normalized = _normalize_text_space(pdf_text)
    quarter_end_label = {
        "Q1": f"March 31, {quarter_key[:4]}",
        "Q2": f"June 30, {quarter_key[:4]}",
        "Q3": f"September 30, {quarter_key[:4]}",
        "Q4": f"December 31, {quarter_key[:4]}",
    }[quarter_key[-2:]]
    revenue_bn = _extract_first_billion_value(r"Revenue was RMB([\d,]+)\s+million", normalized)
    cost_bn = _extract_first_billion_value(
        rf"Cost of revenue\s*[–-]\s*Cost of revenue in the quarter ended {re.escape(quarter_end_label)} (?:was|were) RMB([\d,]+)\s+million",
        normalized,
    )
    operating_income_bn = _extract_first_billion_value(r"Income from operations was RMB([\d,]+)\s+million", normalized)
    net_income_bn = _extract_first_billion_value(r"net income was RMB([\d,]+)\s+million", normalized)
    tax_bn = _extract_first_billion_value(
        rf"Income tax expenses\s*Income tax expenses in the quarter ended {re.escape(quarter_end_label)} (?:was|were) RMB([\d,]+)\s+million",
        normalized,
    )
    if revenue_bn is None or operating_income_bn is None or net_income_bn is None:
        return None
    gross_profit_bn = round(revenue_bn - cost_bn, 3) if cost_bn is not None else None
    gross_margin_pct = round(gross_profit_bn / revenue_bn * 100, 3) if gross_profit_bn is not None and revenue_bn else None
    operating_margin_pct = round(operating_income_bn / revenue_bn * 100, 3) if revenue_bn else None
    profit_margin_pct = round(net_income_bn / revenue_bn * 100, 3) if revenue_bn else None
    fiscal_year = fiscal_label.split()[0].replace("FY", "") if fiscal_label.startswith("FY") else period_end[:4]
    fiscal_quarter = fiscal_label.split()[-1] if " " in fiscal_label else quarter_key[-2:]
    return {
        "calendarQuarter": quarter_key,
        "periodEnd": period_end,
        "fiscalYear": fiscal_year,
        "fiscalQuarter": fiscal_quarter,
        "fiscalLabel": fiscal_label,
        "statementCurrency": "CNY",
        "revenueBn": revenue_bn,
        "revenueYoyPct": None,
        "costOfRevenueBn": cost_bn,
        "grossProfitBn": gross_profit_bn,
        "sgnaBn": None,
        "rndBn": None,
        "otherOpexBn": None,
        "operatingExpensesBn": round(gross_profit_bn - operating_income_bn, 3) if gross_profit_bn is not None else None,
        "operatingIncomeBn": operating_income_bn,
        "nonOperatingBn": None,
        "pretaxIncomeBn": round(net_income_bn + tax_bn, 3) if tax_bn is not None else None,
        "taxBn": tax_bn,
        "netIncomeBn": net_income_bn,
        "netIncomeYoyPct": None,
        "grossMarginPct": gross_margin_pct,
        "operatingMarginPct": operating_margin_pct,
        "profitMarginPct": profit_margin_pct,
        "effectiveTaxRatePct": round((tax_bn / (net_income_bn + tax_bn)) * 100, 3) if tax_bn not in (None, 0) and net_income_bn is not None else None,
        "revenueQoqPct": None,
        "grossMarginYoyDeltaPp": None,
        "operatingMarginYoyDeltaPp": None,
        "profitMarginYoyDeltaPp": None,
        "statementSource": "alibaba-ir-pdf",
        "statementSourceUrl": source_url,
        "statementFilingDate": period_end,
    }


def _supplement_alibaba_missing_quarters(result: dict[str, Any]) -> None:
    if str(result.get("id") or "") != "alibaba":
        return

    def _fiscal_label_from_calendar_quarter(quarter_key: str) -> tuple[str, str] | tuple[None, None]:
        match = re.fullmatch(r"(\d{4})Q([1-4])", str(quarter_key or ""))
        if not match:
            return None, None
        year = int(match.group(1))
        quarter = int(match.group(2))
        period_end = {
            1: f"{year:04d}-03-31",
            2: f"{year:04d}-06-30",
            3: f"{year:04d}-09-30",
            4: f"{year:04d}-12-31",
        }[quarter]
        fiscal_year = year if quarter == 1 else year + 1
        fiscal_quarter = {1: "Q4", 2: "Q1", 3: "Q2", 4: "Q3"}[quarter]
        return f"FY{fiscal_year} {fiscal_quarter}", period_end

    for item in _load_alibaba_quarterly_items():
        title_field = item.get("documentTitle")
        title = str((title_field or {}).get("en_US") if isinstance(title_field, dict) else title_field or "")
        quarter_key = _quarter_from_alibaba_title(title)
        if not quarter_key or quarter_key in result["financials"]:
            continue
        fiscal_label, period_end = _fiscal_label_from_calendar_quarter(quarter_key)
        if not fiscal_label or not period_end:
            continue
        pdf_url, _page_url = _load_alibaba_press_release_pdf(item)
        if not pdf_url:
            continue
        pdf_text = _extract_pdf_text(pdf_url)
        entry = _parse_alibaba_pdf_financial_entry(pdf_text, quarter_key, fiscal_label, pdf_url, period_end)
        if not entry:
            continue
        result["financials"][quarter_key] = entry


def _load_table(url: str) -> tuple[str, Any]:
    html_text = _request_text(url)
    soup = BeautifulSoup(html_text, "html.parser")
    table = soup.find("table")
    if table is None:
        raise RuntimeError(f"Unable to locate financial table for {url}")
    return html_text, table


def fetch_stockanalysis_financial_history(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    cache_path = _cache_path(company["id"])
    if cache_path.exists() and not refresh:
        return _load_cached_json(cache_path)

    ticker = str(company.get("financialTicker") or company["ticker"]).lower()
    source_url = f"https://stockanalysis.com/stocks/{ticker}/financials/?{urlencode({'p': 'quarterly'})}"
    html_text, table = _load_table(source_url)
    currency = _parse_currency(html_text)
    row_map_value = _row_map(table)
    headers = row_map_value.get("Fiscal Quarter") or row_map_value.get("Fiscal Year")
    if not headers:
        raise RuntimeError(f"Unsupported Stock Analysis table structure for {company['ticker']}")
    period_ends = row_map_value.get("Period Ending") or []
    if not period_ends:
        raise RuntimeError(f"Missing period ending row for {company['ticker']}")

    column_count = min(len(headers), len(period_ends))
    result = {
        **company,
        "quarters": [],
        "financials": {},
        "statementSource": "stockanalysis-financials",
        "statementSourceUrl": source_url,
        "reportingCurrency": currency,
        "errors": [],
    }

    extracted_rows = {
        key: _find_row(row_map_value, aliases)
        for key, aliases in ROW_ALIASES.items()
    }

    for index in range(column_count):
        period_end = _extract_period_end(period_ends[index])
        if not period_end:
            continue
        fiscal_year, fiscal_quarter, fiscal_label = _normalize_fiscal_header(headers[index])
        quarter_key = _calendar_quarter(period_end)
        if headers[0].startswith("FY "):
            quarter_key = f"{fiscal_year}Q4"

        revenue = _clean_number(extracted_rows["revenue"][index]) if extracted_rows["revenue"] else None
        cost_of_revenue = _clean_number(extracted_rows["costOfRevenue"][index]) if extracted_rows["costOfRevenue"] else None
        gross_profit = _clean_number(extracted_rows["grossProfit"][index]) if extracted_rows["grossProfit"] else None
        operating_expenses = _clean_number(extracted_rows["operatingExpenses"][index]) if extracted_rows["operatingExpenses"] else None
        operating_income = _clean_number(extracted_rows["operatingIncome"][index]) if extracted_rows["operatingIncome"] else None
        tax = _clean_number(extracted_rows["tax"][index]) if extracted_rows["tax"] else None
        pretax_income = _clean_number(extracted_rows["pretaxIncome"][index]) if extracted_rows["pretaxIncome"] else None
        net_income = _clean_number(extracted_rows["netIncome"][index]) if extracted_rows["netIncome"] else None
        sgna = _clean_number(extracted_rows["sgna"][index]) if extracted_rows["sgna"] else None
        rnd = _clean_number(extracted_rows["rnd"][index]) if extracted_rows["rnd"] else None
        other_opex = _clean_number(extracted_rows["otherOpex"][index]) if extracted_rows["otherOpex"] else None
        non_operating = _clean_number(extracted_rows["nonOperating"][index]) if extracted_rows["nonOperating"] else None

        result["financials"][quarter_key] = {
            "calendarQuarter": quarter_key,
            "periodEnd": period_end,
            "fiscalYear": fiscal_year or period_end[:4],
            "fiscalQuarter": fiscal_quarter or f"Q{((int(period_end[5:7]) - 1) // 3) + 1}",
            "fiscalLabel": fiscal_label or quarter_key,
            "statementCurrency": currency,
            "revenueBn": _to_billions(revenue),
            "revenueYoyPct": _to_pct(_clean_number(extracted_rows["revenueYoyPct"][index])) if extracted_rows["revenueYoyPct"] else None,
            "costOfRevenueBn": _to_billions(cost_of_revenue),
            "grossProfitBn": _to_billions(gross_profit),
            "sgnaBn": _to_billions(sgna),
            "rndBn": _to_billions(rnd),
            "otherOpexBn": _to_billions(other_opex),
            "operatingExpensesBn": _to_billions(operating_expenses),
            "operatingIncomeBn": _to_billions(operating_income),
            "nonOperatingBn": _to_billions(non_operating),
            "pretaxIncomeBn": _to_billions(pretax_income),
            "taxBn": _to_billions(tax),
            "netIncomeBn": _to_billions(net_income),
            "netIncomeYoyPct": _to_pct(_clean_number(extracted_rows["netIncomeYoyPct"][index])) if extracted_rows["netIncomeYoyPct"] else None,
            "grossMarginPct": _to_pct(_clean_number(extracted_rows["grossMarginPct"][index])) if extracted_rows["grossMarginPct"] else None,
            "operatingMarginPct": _to_pct(_clean_number(extracted_rows["operatingMarginPct"][index])) if extracted_rows["operatingMarginPct"] else None,
            "profitMarginPct": _to_pct(_clean_number(extracted_rows["profitMarginPct"][index])) if extracted_rows["profitMarginPct"] else None,
            "effectiveTaxRatePct": round((tax / pretax_income) * 100, 3) if tax not in (None, 0) and pretax_income not in (None, 0) else None,
            "revenueQoqPct": None,
            "grossMarginYoyDeltaPp": None,
            "operatingMarginYoyDeltaPp": None,
            "profitMarginYoyDeltaPp": None,
            "statementSourceUrl": source_url,
            "statementFilingDate": period_end,
        }

    _supplement_alibaba_missing_quarters(result)

    ordered_quarters = sorted(result["financials"].keys())
    for quarter_key in ordered_quarters:
        entry = result["financials"][quarter_key]
        year = int(quarter_key[:4])
        quarter = int(quarter_key[-1])
        prior_year_key = f"{year - 1}Q{quarter}"
        prior_quarter_key = f"{year - 1}Q4" if quarter == 1 else f"{year}Q{quarter - 1}"
        prior_year = result["financials"].get(prior_year_key)
        prior_quarter = result["financials"].get(prior_quarter_key)
        if prior_quarter and prior_quarter.get("revenueBn") not in (None, 0) and entry.get("revenueBn") is not None:
            entry["revenueQoqPct"] = round((entry["revenueBn"] / prior_quarter["revenueBn"] - 1) * 100, 3)
        if prior_year:
            for field, delta_field in [
                ("grossMarginPct", "grossMarginYoyDeltaPp"),
                ("operatingMarginPct", "operatingMarginYoyDeltaPp"),
                ("profitMarginPct", "profitMarginYoyDeltaPp"),
            ]:
                if entry.get(field) is not None and prior_year.get(field) is not None:
                    entry[delta_field] = round(entry[field] - prior_year[field], 3)

    result["quarters"] = ordered_quarters
    _write_cached_json(cache_path, result)
    return result
