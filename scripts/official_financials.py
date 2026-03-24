from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import date, timedelta
from html import unescape
from pathlib import Path
from typing import Any

from official_segments import ALLOWED_FORMS, _calendar_quarter, _period_key, _request, _request_json, _resolve_cik, _submission_records


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "official-financials"
CURRENCY_UNIT_PATTERN = re.compile(r"^[A-Z]{3}$")
MIN_FILING_DATE = "2017-01-01"
MIN_CALENDAR_QUARTER = (2018, 1)
NAMESPACE_PRIORITY = {
    "us-gaap": 20,
    "ifrs-full": 18,
}

FINANCIAL_CONCEPTS: dict[str, list[str]] = {
    "revenue": [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "RevenueFromContractsWithCustomers",
        "RevenuesNetOfInterestExpense",
        "NetRevenues",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet",
        "SalesRevenueServicesNet",
        "Revenues",
        "Revenue",
        "OperatingRevenue",
        "OperatingRevenueNet",
        "TotalRevenue",
        "NetSales",
        "InterestRevenueExpenseNet",
    ],
    "costOfRevenue": [
        "CostOfRevenue",
        "CostOfSales",
        "CostOfGoodsSold",
        "CostOfGoodsAndServicesSold",
        "CostOfServices",
    ],
    "grossProfit": [
        "GrossProfit",
    ],
    "sgna": [
        "SellingGeneralAndAdministrativeExpense",
    ],
    "salesAndMarketing": [
        "SellingAndMarketingExpense",
        "SalesAndMarketingExpense",
        "MarketingExpense",
    ],
    "generalAndAdministrative": [
        "GeneralAndAdministrativeExpense",
        "GeneralAndAdministrativeExpenseOtherThanAmortizationOfAcquiredIntangibleAssets",
    ],
    "rnd": [
        "ResearchAndDevelopmentExpense",
    ],
    "operatingExpenses": [
        "OperatingExpenses",
        "OperatingExpenseExcludingCostOfSales",
        "NoninterestExpense",
        "CostsAndExpenses",
    ],
    "operatingIncome": [
        "OperatingIncomeLoss",
        "ProfitLossFromOperatingActivities",
        "OperatingProfit",
    ],
    "pretaxIncome": [
        "IncomeBeforeTaxExpenseBenefit",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        "PretaxIncome",
        "ProfitLossBeforeTax",
    ],
    "tax": [
        "IncomeTaxExpenseBenefit",
        "IncomeTaxExpenseContinuingOperations",
        "IncomeTaxes",
        "CurrentTaxExpenseIncomeAndAdjustmentsForCurrentTaxOfPriorPeriods",
    ],
    "netIncome": [
        "NetIncomeLoss",
        "ProfitLoss",
        "ProfitLossAttributableToOwnersOfParent",
    ],
}


@dataclass
class StatementFact:
    namespace: str
    concept: str
    concept_priority: int
    namespace_priority: int
    accession: str
    filed: str
    form: str
    fiscal_year: str
    fiscal_period: str
    start_date: str
    end_date: str
    value: float
    unit: str
    frame: str

    @property
    def day_span(self) -> int:
        start = date.fromisoformat(self.start_date)
        end = date.fromisoformat(self.end_date)
        return (end - start).days + 1

    @property
    def filing_gap_days(self) -> int:
        try:
            filed = date.fromisoformat(self.filed)
            end = date.fromisoformat(self.end_date)
        except ValueError:
            return 9_999
        return (filed - end).days


def _cache_path(company_id: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{company_id}.json"


def _load_cached_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_cached_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _is_money_unit(unit: str) -> bool:
    return bool(CURRENCY_UNIT_PATTERN.fullmatch(str(unit or "").strip()))


def _parse_fact(
    namespace: str,
    concept: str,
    concept_priority: int,
    unit: str,
    raw: dict[str, Any],
) -> StatementFact | None:
    form = str(raw.get("form") or "")
    if form not in ALLOWED_FORMS:
        return None
    filed = str(raw.get("filed") or "")
    if filed and filed < MIN_FILING_DATE:
        return None
    start_date = str(raw.get("start") or "")
    end_date = str(raw.get("end") or "")
    if not start_date or not end_date:
        return None
    value = raw.get("val")
    if not isinstance(value, (int, float)) or isinstance(value, bool) or math.isnan(float(value)):
        return None
    namespace_priority = NAMESPACE_PRIORITY.get(namespace, 0)
    if namespace_priority <= 0:
        return None
    return StatementFact(
        namespace=namespace,
        concept=concept,
        concept_priority=concept_priority,
        namespace_priority=namespace_priority,
        accession=str(raw.get("accn") or ""),
        filed=filed,
        form=form,
        fiscal_year=str(raw.get("fy") or ""),
        fiscal_period=str(raw.get("fp") or ""),
        start_date=start_date,
        end_date=end_date,
        value=float(value),
        unit=unit,
        frame=str(raw.get("frame") or ""),
    )


def _fact_rank(fact: StatementFact) -> tuple[int, int, int, int, str, str]:
    gap = fact.filing_gap_days
    timely = 1 if 0 <= gap <= 210 else 0
    return (
        timely,
        -max(gap, 0),
        fact.namespace_priority,
        fact.concept_priority,
        fact.filed,
        fact.accession,
    )


def _field_rank(fact: StatementFact, priority: int) -> tuple[int, int, int, int, int, str]:
    gap = fact.filing_gap_days
    timely = 1 if 0 <= gap <= 210 else 0
    return (
        timely,
        priority,
        fact.namespace_priority,
        fact.concept_priority,
        -max(gap, 0),
        fact.filed,
    )


def _dedupe_exact_facts(facts: list[StatementFact]) -> list[StatementFact]:
    best: dict[tuple[str, str, str, str], StatementFact] = {}
    for fact in facts:
        key = (fact.namespace, fact.concept, fact.start_date, fact.end_date)
        current = best.get(key)
        if current is None or _fact_rank(fact) > _fact_rank(current):
            best[key] = fact
    return list(best.values())


def _clone_fact(
    base: StatementFact,
    *,
    concept: str | None = None,
    concept_priority: int | None = None,
    fiscal_period: str | None = None,
    start_date: str | None = None,
    value: float | None = None,
) -> StatementFact:
    return StatementFact(
        namespace=base.namespace,
        concept=concept or base.concept,
        concept_priority=base.concept_priority if concept_priority is None else concept_priority,
        namespace_priority=base.namespace_priority,
        accession=base.accession,
        filed=base.filed,
        form=base.form,
        fiscal_year=base.fiscal_year,
        fiscal_period=base.fiscal_period if fiscal_period is None else fiscal_period,
        start_date=base.start_date if start_date is None else start_date,
        end_date=base.end_date,
        value=base.value if value is None else value,
        unit=base.unit,
        frame=base.frame,
    )


def _sum_facts(*facts: StatementFact | None) -> StatementFact | None:
    existing = [fact for fact in facts if fact is not None]
    if not existing:
        return None
    anchor = max(existing, key=_fact_rank)
    return _clone_fact(
        anchor,
        concept="+".join(sorted({fact.concept for fact in existing})),
        concept_priority=max(fact.concept_priority for fact in existing),
        start_date=min(fact.start_date for fact in existing),
        value=sum(fact.value for fact in existing),
    )


def _normalized_fiscal_period(fact: StatementFact) -> str:
    fiscal_period = str(fact.fiscal_period or "").upper()
    if fiscal_period in {"Q1", "Q2", "Q3", "Q4"}:
        return fiscal_period
    if fiscal_period == "FY":
        return "Q4"
    span = fact.day_span
    if 120 <= span <= 210:
        return "Q2"
    if 211 <= span <= 310:
        return "Q3"
    if span >= 311:
        return "Q4"
    return ""


def _build_concept_series(facts: list[StatementFact]) -> dict[str, StatementFact]:
    facts = _dedupe_exact_facts(facts)
    direct: dict[str, StatementFact] = {}
    cumulative: dict[str, StatementFact] = {}
    for fact in sorted(facts, key=lambda item: (item.end_date, item.day_span, item.filed, item.concept_priority)):
        span = fact.day_span
        target = None
        if 45 <= span <= 120:
            target = direct
        elif 121 <= span <= 390:
            target = cumulative
        if target is None:
            continue
        current = target.get(fact.end_date)
        if current is None or _fact_rank(fact) > _fact_rank(current):
            target[fact.end_date] = fact

    derived: dict[str, StatementFact] = dict(direct)
    changed = True
    while changed:
        changed = False
        for fact in sorted(cumulative.values(), key=lambda item: (item.end_date, item.day_span)):
            if fact.end_date in derived:
                continue
            covered = [
                entry
                for entry in derived.values()
                if entry.start_date >= fact.start_date and entry.end_date < fact.end_date
            ]
            expected = max(round(fact.day_span / 91) - 1, 1)
            if len(covered) != expected:
                continue
            covered_sorted = sorted(covered, key=lambda item: item.end_date)
            last_end = date.fromisoformat(covered_sorted[-1].end_date)
            derived[fact.end_date] = _clone_fact(
                fact,
                concept=f"{fact.concept}:derived",
                concept_priority=max(fact.concept_priority - 1, 1),
                fiscal_period=_normalized_fiscal_period(fact),
                start_date=(last_end + timedelta(days=1)).isoformat(),
                value=fact.value - sum(item.value for item in covered_sorted),
            )
            changed = True

    quarter_rows: dict[str, StatementFact] = {}
    for fact in derived.values():
        quarter = _calendar_quarter(fact.end_date)
        if not quarter or _period_key(quarter) < MIN_CALENDAR_QUARTER:
            continue
        current = quarter_rows.get(quarter)
        if current is None or _fact_rank(fact) > _fact_rank(current):
            quarter_rows[quarter] = fact
    return quarter_rows


def _build_field_series(facts: list[StatementFact]) -> dict[str, StatementFact]:
    facts = _dedupe_exact_facts(facts)
    direct: dict[str, StatementFact] = {}
    cumulative: dict[str, StatementFact] = {}
    for fact in sorted(facts, key=lambda item: (item.end_date, item.day_span, item.filed, item.concept_priority)):
        span = fact.day_span
        target = None
        if 45 <= span <= 120:
            target = direct
        elif 121 <= span <= 390:
            target = cumulative
        if target is None:
            continue
        current = target.get(fact.end_date)
        if current is None or _field_rank(fact, fact.concept_priority) > _field_rank(current, current.concept_priority):
            target[fact.end_date] = fact

    derived: dict[str, StatementFact] = dict(direct)
    changed = True
    while changed:
        changed = False
        for fact in sorted(cumulative.values(), key=lambda item: (item.end_date, item.day_span, item.filed, item.concept_priority)):
            if fact.end_date in derived:
                continue
            covered = [
                entry
                for entry in derived.values()
                if entry.start_date >= fact.start_date and entry.end_date < fact.end_date
            ]
            expected = max(round(fact.day_span / 91) - 1, 1)
            if len(covered) != expected:
                continue
            covered_sorted = sorted(covered, key=lambda item: item.end_date)
            last_end = date.fromisoformat(covered_sorted[-1].end_date)
            derived[fact.end_date] = _clone_fact(
                fact,
                concept=f"{fact.concept}:derived",
                concept_priority=max(fact.concept_priority - 1, 1),
                fiscal_period=_normalized_fiscal_period(fact),
                start_date=(last_end + timedelta(days=1)).isoformat(),
                value=fact.value - sum(item.value for item in covered_sorted),
            )
            changed = True

    quarter_rows: dict[str, StatementFact] = {}
    for fact in derived.values():
        quarter = _calendar_quarter(fact.end_date)
        if not quarter or _period_key(quarter) < MIN_CALENDAR_QUARTER:
            continue
        current = quarter_rows.get(quarter)
        if current is None or _field_rank(fact, fact.concept_priority) > _field_rank(current, current.concept_priority):
            quarter_rows[quarter] = fact
    return quarter_rows


def _collect_concept_series(companyfacts: dict[str, Any], reporting_currency: str) -> dict[str, dict[str, StatementFact]]:
    facts_payload = companyfacts.get("facts", {})
    concept_names = {concept for concepts in FINANCIAL_CONCEPTS.values() for concept in concepts}
    concept_series: dict[str, dict[str, StatementFact]] = {}
    for concept in concept_names:
        concept_facts: list[StatementFact] = []
        for namespace, namespace_facts in facts_payload.items():
            if not isinstance(namespace_facts, dict):
                continue
            concept_payload = namespace_facts.get(concept)
            if not isinstance(concept_payload, dict):
                continue
            units = concept_payload.get("units", {})
            items = units.get(reporting_currency, [])
            if not isinstance(items, list):
                continue
            priority = 100 - FINANCIAL_CONCEPTS["revenue"].index(concept) if concept in FINANCIAL_CONCEPTS["revenue"] else 50
            for raw in items:
                if not isinstance(raw, dict):
                    continue
                fact = _parse_fact(namespace, concept, priority, reporting_currency, raw)
                if fact is not None:
                    concept_facts.append(fact)
        if concept_facts:
            concept_series[concept] = _build_concept_series(concept_facts)
    return concept_series


def _collect_field_series(companyfacts: dict[str, Any], reporting_currency: str) -> dict[str, dict[str, StatementFact]]:
    facts_payload = companyfacts.get("facts", {})
    field_series: dict[str, dict[str, StatementFact]] = {}
    for field, concepts in FINANCIAL_CONCEPTS.items():
        field_facts: list[StatementFact] = []
        total = len(concepts)
        for index, concept in enumerate(concepts):
            concept_priority = total - index
            for namespace, namespace_facts in facts_payload.items():
                if not isinstance(namespace_facts, dict):
                    continue
                concept_payload = namespace_facts.get(concept)
                if not isinstance(concept_payload, dict):
                    continue
                units = concept_payload.get("units", {})
                items = units.get(reporting_currency, [])
                if not isinstance(items, list):
                    continue
                for raw in items:
                    if not isinstance(raw, dict):
                        continue
                    fact = _parse_fact(namespace, concept, concept_priority, reporting_currency, raw)
                    if fact is not None:
                        field_facts.append(fact)
        if field_facts:
            field_series[field] = _build_field_series(field_facts)
    return field_series


def _pick_field_fact(
    concept_series: dict[str, dict[str, StatementFact]],
    field: str,
    quarter: str,
) -> StatementFact | None:
    candidates: list[tuple[int, StatementFact]] = []
    concepts = FINANCIAL_CONCEPTS[field]
    total = len(concepts)
    for index, concept in enumerate(concepts):
        fact = concept_series.get(concept, {}).get(quarter)
        if fact is None:
            continue
        candidates.append((total - index, fact))
    if not candidates:
        return None
    _, selected = max(candidates, key=lambda item: _field_rank(item[1], item[0]))
    return selected


def _pick_field_fact_with_fallback(
    concept_series: dict[str, dict[str, StatementFact]],
    field_series: dict[str, dict[str, StatementFact]],
    field: str,
    quarter: str,
) -> StatementFact | None:
    return _pick_field_fact(concept_series, field, quarter) or field_series.get(field, {}).get(quarter)


def _select_reporting_currency(companyfacts: dict[str, Any]) -> str | None:
    facts_payload = companyfacts.get("facts", {})
    unit_scores: dict[str, int] = {}
    for field in ("revenue", "netIncome", "pretaxIncome", "operatingIncome"):
        concepts = FINANCIAL_CONCEPTS[field]
        weight = len(concepts) + 2
        for index, concept in enumerate(concepts):
            concept_weight = weight - index
            for namespace_facts in facts_payload.values():
                if not isinstance(namespace_facts, dict):
                    continue
                concept_payload = namespace_facts.get(concept)
                if not isinstance(concept_payload, dict):
                    continue
                for unit, values in concept_payload.get("units", {}).items():
                    if not _is_money_unit(unit) or not isinstance(values, list):
                        continue
                    valid_count = sum(
                        1
                        for item in values
                        if isinstance(item, dict)
                        and str(item.get("form") or "") in ALLOWED_FORMS
                        and item.get("start")
                        and item.get("end")
                    )
                    if valid_count:
                        unit_scores[unit] = unit_scores.get(unit, 0) + valid_count * concept_weight
    if not unit_scores:
        return None
    return max(unit_scores.items(), key=lambda item: (item[1], item[0] != "USD", item[0]))[0]


def _money_to_bn(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value / 1_000_000_000, 3)


def _safe_pct(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return round(numerator / denominator * 100, 2)


def _fiscal_label(fiscal_year: str, fiscal_quarter: str) -> str:
    if not fiscal_year or not fiscal_quarter:
        return ""
    return f"FY{fiscal_year} {fiscal_quarter}"


def _quarter_period_end(year: int, quarter: int) -> str:
    month = quarter * 3
    day = 31 if month in {3, 12} else 30
    return f"{year}-{month:02d}-{day:02d}"


def _quarter_from_date_label(date_label: str, year_label: str) -> tuple[int, int, str] | None:
    month_match = re.search(r"([A-Za-z]{3,9})\s+(\d{1,2})", str(date_label or ""))
    year_match = re.search(r"(\d{4})", str(year_label or ""))
    if not month_match or not year_match:
        return None
    month_token = month_match.group(1).strip().lower()[:3]
    month_lookup = {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "may": 5,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
    month = month_lookup.get(month_token)
    if month is None:
        return None
    year = int(year_match.group(1))
    quarter = (month - 1) // 3 + 1
    return (year, quarter, f"{year}-{month:02d}-{int(month_match.group(2)):02d}")


def _normalize_table_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(text or "").lower())


def _parse_number(text: str | None) -> float | None:
    if text is None:
        return None
    cleaned = unescape(str(text))
    cleaned = cleaned.replace("−", "-").replace("–", "-").replace("—", "-")
    cleaned = re.sub(r"\b[a-zA-Z]\b", " ", cleaned)
    cleaned = cleaned.replace("%", "").replace(",", "")
    cleaned = re.sub(r"[^0-9().\-]+", "", cleaned)
    if not cleaned or cleaned in {"-", ".", "()"}:
        return None
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return -value if negative else value


def _extract_html_tables(html_text: str) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    for table_html in re.findall(r"<table\b.*?</table>", html_text, re.IGNORECASE | re.DOTALL):
        rows: list[list[str]] = []
        for row_html in re.findall(r"<tr\b.*?</tr>", table_html, re.IGNORECASE | re.DOTALL):
            cells: list[str] = []
            for _, cell_html in re.findall(r"<t[dh]\b([^>]*)>(.*?)</t[dh]>", row_html, re.IGNORECASE | re.DOTALL):
                cleaned = re.sub(r"<br\s*/?>", " ", cell_html, flags=re.IGNORECASE)
                cleaned = re.sub(r"<[^>]+>", " ", cleaned)
                cleaned = unescape(cleaned)
                cleaned = re.sub(r"\s+", " ", cleaned).strip()
                if cleaned:
                    cells.append(cleaned)
            normalized_cells: list[str] = []
            for cell in cells:
                if cell in {")", "%"} and normalized_cells:
                    normalized_cells[-1] = f"{normalized_cells[-1]}{cell}"
                    continue
                normalized_cells.append(cell)
            if normalized_cells:
                rows.append(normalized_cells)
        if rows:
            tables.append(rows)
    return tables


def _build_financial_entry(
    quarter: str,
    currency: str,
    period_end: str,
    fiscal_year: str,
    fiscal_quarter: str,
    *,
    revenue_value: float | None,
    cost_value: float | None = None,
    gross_value: float | None = None,
    sgna_value: float | None = None,
    rnd_value: float | None = None,
    other_opex_value: float | None = None,
    operating_expenses_value: float | None = None,
    operating_income_value: float | None = None,
    non_operating_value: float | None = None,
    pretax_value: float | None = None,
    tax_value: float | None = None,
    net_income_value: float | None = None,
) -> dict[str, Any]:
    if gross_value is None and revenue_value is not None and cost_value is not None:
        gross_value = revenue_value - cost_value
    if cost_value is None and revenue_value is not None and gross_value is not None:
        cost_value = revenue_value - gross_value
    if operating_income_value is None and gross_value is not None and operating_expenses_value is not None:
        operating_income_value = gross_value - operating_expenses_value
    if operating_expenses_value is None and gross_value is not None and operating_income_value is not None:
        operating_expenses_value = gross_value - operating_income_value
    if tax_value is None and pretax_value is not None and net_income_value is not None:
        tax_value = pretax_value - net_income_value
    if non_operating_value is None and pretax_value is not None and operating_income_value is not None:
        non_operating_value = pretax_value - operating_income_value
    if other_opex_value is None and operating_expenses_value is not None:
        disclosed = sum(value for value in (sgna_value, rnd_value) if value is not None)
        residual = operating_expenses_value - disclosed
        if residual > 0.01:
            other_opex_value = residual

    return {
        "calendarQuarter": quarter,
        "periodEnd": period_end,
        "fiscalYear": fiscal_year,
        "fiscalQuarter": fiscal_quarter,
        "fiscalLabel": _fiscal_label(fiscal_year, fiscal_quarter) or quarter,
        "statementCurrency": currency,
        "revenueBn": _money_to_bn(revenue_value),
        "revenueYoyPct": None,
        "costOfRevenueBn": _money_to_bn(cost_value),
        "grossProfitBn": _money_to_bn(gross_value),
        "sgnaBn": _money_to_bn(sgna_value),
        "rndBn": _money_to_bn(rnd_value),
        "otherOpexBn": _money_to_bn(other_opex_value),
        "operatingExpensesBn": _money_to_bn(operating_expenses_value),
        "operatingIncomeBn": _money_to_bn(operating_income_value),
        "nonOperatingBn": _money_to_bn(non_operating_value),
        "pretaxIncomeBn": _money_to_bn(pretax_value),
        "taxBn": _money_to_bn(tax_value),
        "netIncomeBn": _money_to_bn(net_income_value),
        "netIncomeYoyPct": None,
        "grossMarginPct": _safe_pct(gross_value, revenue_value),
        "operatingMarginPct": _safe_pct(operating_income_value, revenue_value),
        "profitMarginPct": _safe_pct(net_income_value, revenue_value),
        "effectiveTaxRatePct": _safe_pct(tax_value, pretax_value),
        "revenueQoqPct": None,
        "grossMarginYoyDeltaPp": None,
        "operatingMarginYoyDeltaPp": None,
        "profitMarginYoyDeltaPp": None,
    }


def _finalize_financials(financials: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    ordered_periods = sorted(financials, key=_period_key)
    for index, period in enumerate(ordered_periods):
        entry = financials[period]
        previous = financials[ordered_periods[index - 1]] if index > 0 else None
        year_ago = financials[ordered_periods[index - 4]] if index >= 4 else None
        if previous and entry.get("revenueBn") not in (None, 0) and previous.get("revenueBn") not in (None, 0):
            entry["revenueQoqPct"] = round((entry["revenueBn"] / previous["revenueBn"] - 1) * 100, 2)
        if year_ago and entry.get("revenueBn") not in (None, 0) and year_ago.get("revenueBn") not in (None, 0):
            entry["revenueYoyPct"] = round((entry["revenueBn"] / year_ago["revenueBn"] - 1) * 100, 2)
        if year_ago and entry.get("netIncomeBn") not in (None, 0) and year_ago.get("netIncomeBn") not in (None, 0):
            entry["netIncomeYoyPct"] = round((entry["netIncomeBn"] / year_ago["netIncomeBn"] - 1) * 100, 2)
        if year_ago:
            for key, target in (
                ("grossMarginPct", "grossMarginYoyDeltaPp"),
                ("operatingMarginPct", "operatingMarginYoyDeltaPp"),
                ("profitMarginPct", "profitMarginYoyDeltaPp"),
            ):
                if entry.get(key) is not None and year_ago.get(key) is not None:
                    entry[target] = round(entry[key] - year_ago[key], 2)
    return (ordered_periods, {period: financials[period] for period in ordered_periods})


def _parse_tsm_release(html_text: str, filing_date: str, source_url: str, currency: str) -> tuple[str, dict[str, Any]] | None:
    tables = _extract_html_tables(html_text)
    all_rows = [row for table in tables for row in table if row]
    if len(all_rows) < 5:
        return None
    row_map = {_normalize_table_key(row[0]): row for row in all_rows}
    if not {"netsales", "grossprofit", "incomefromoperations", "incomebeforetax", "netincome"}.issubset(row_map):
        return None
    quarter_label = ""
    for row in all_rows[:8]:
        for cell in row:
            compact_cell = cell.replace(" ", "")
            if re.search(r"[1-4]Q\d{2}", compact_cell, re.IGNORECASE):
                quarter_label = compact_cell
                break
        if quarter_label:
            break
    match = re.search(r"([1-4])Q(\d{2})", quarter_label, re.IGNORECASE)
    if not match:
        return None
    quarter_number = int(match.group(1))
    year = 2000 + int(match.group(2))
    quarter = f"{year}Q{quarter_number}"
    period_end = _quarter_period_end(year, quarter_number)

    revenue_value = _parse_number(row_map["netsales"][1])
    gross_value = _parse_number(row_map["grossprofit"][1])
    operating_income_value = _parse_number(row_map["incomefromoperations"][1])
    pretax_value = _parse_number(row_map["incomebeforetax"][1])
    net_income_value = _parse_number(row_map["netincome"][1])
    if revenue_value is None or net_income_value is None:
        return None
    scale = 1_000_000
    entry = _build_financial_entry(
        quarter,
        currency,
        period_end,
        str(year),
        f"Q{quarter_number}",
        revenue_value=revenue_value * scale,
        gross_value=gross_value * scale if gross_value is not None else None,
        operating_income_value=operating_income_value * scale if operating_income_value is not None else None,
        pretax_value=pretax_value * scale if pretax_value is not None else None,
        net_income_value=net_income_value * scale if net_income_value is not None else None,
    )
    entry["statementSourceUrl"] = source_url
    entry["statementFilingDate"] = filing_date
    return (quarter, entry)


def _parse_asml_release(html_text: str, filing_date: str, source_url: str, currency: str) -> tuple[str, dict[str, Any]] | None:
    for rows in _extract_html_tables(html_text):
        if len(rows) < 4:
            continue
        row_map = {_normalize_table_key(row[0]): row for row in rows[1:] if row}
        if {
            "totalnetsales",
            "grossprofit",
            "researchanddevelopmentcosts",
            "sellinggeneralandadministrativecosts",
            "incomefromoperations",
            "incomebeforeincometaxes",
            "benefitfromprovisionforincometaxes",
            "netincome",
        }.issubset(row_map):
            header_candidates: list[tuple[int, int, int, str]] = []
            if len(rows) > 2:
                limit = min(2, len(rows[1]), len(rows[2]))
                for index in range(limit):
                    info = _quarter_from_date_label(rows[1][index], rows[2][index])
                    if info is not None:
                        year_value, quarter_value, period_label = info
                        header_candidates.append((index, year_value, quarter_value, period_label))
            if header_candidates:
                header_index, year, quarter_number, _ = max(header_candidates, key=lambda item: (item[1], item[2]))
                value_index = header_index + 1
                quarter = f"{year}Q{quarter_number}"
                period_end = _quarter_period_end(year, quarter_number)
                revenue_value = _parse_number(row_map["totalnetsales"][value_index]) if len(row_map["totalnetsales"]) > value_index else None
                cost_value = abs(_parse_number(row_map["totalcostofsales"][value_index])) if row_map.get("totalcostofsales") and len(row_map["totalcostofsales"]) > value_index else None
                gross_value = _parse_number(row_map["grossprofit"][value_index]) if len(row_map["grossprofit"]) > value_index else None
                rnd_value = abs(_parse_number(row_map["researchanddevelopmentcosts"][value_index])) if len(row_map["researchanddevelopmentcosts"]) > value_index else None
                sgna_value = abs(_parse_number(row_map["sellinggeneralandadministrativecosts"][value_index])) if len(row_map["sellinggeneralandadministrativecosts"]) > value_index else None
                operating_income_value = _parse_number(row_map["incomefromoperations"][value_index]) if len(row_map["incomefromoperations"]) > value_index else None
                non_operating_value = _parse_number(row_map["interestandothernet"][value_index]) if row_map.get("interestandothernet") and len(row_map["interestandothernet"]) > value_index else None
                pretax_value = _parse_number(row_map["incomebeforeincometaxes"][value_index]) if len(row_map["incomebeforeincometaxes"]) > value_index else None
                tax_value = abs(_parse_number(row_map["benefitfromprovisionforincometaxes"][value_index])) if len(row_map["benefitfromprovisionforincometaxes"]) > value_index else None
                net_income_value = _parse_number(row_map["netincome"][value_index]) if len(row_map["netincome"]) > value_index else None
                if revenue_value is None or net_income_value is None:
                    continue
                scale = 1_000_000
                entry = _build_financial_entry(
                    quarter,
                    currency,
                    period_end,
                    str(year),
                    f"Q{quarter_number}",
                    revenue_value=revenue_value * scale,
                    cost_value=cost_value * scale if cost_value is not None else None,
                    gross_value=gross_value * scale if gross_value is not None else None,
                    sgna_value=sgna_value * scale if sgna_value is not None else None,
                    rnd_value=rnd_value * scale if rnd_value is not None else None,
                    operating_income_value=operating_income_value * scale if operating_income_value is not None else None,
                    non_operating_value=non_operating_value * scale if non_operating_value is not None else None,
                    pretax_value=pretax_value * scale if pretax_value is not None else None,
                    tax_value=tax_value * scale if tax_value is not None else None,
                    net_income_value=net_income_value * scale,
                )
                entry["statementSourceUrl"] = source_url
                entry["statementFilingDate"] = filing_date
                return (quarter, entry)

        header = rows[0]
        if len(header) < 3:
            continue
        quarter_columns: list[tuple[int, int, int]] = []
        for index, label in enumerate(header[1:], start=1):
            match = re.fullmatch(r"Q([1-4])\s+(\d{4})", label)
            if match:
                quarter_columns.append((index, int(match.group(2)), int(match.group(1))))
        if not quarter_columns:
            continue
        current_index, year, quarter_number = max(quarter_columns, key=lambda item: (item[1], item[2]))
        row_map = {_normalize_table_key(row[0]): row for row in rows[1:] if row}
        sales_row = row_map.get("totalnetsales") or row_map.get("netsales")
        if sales_row is None or not {"grossprofit", "netincome"}.issubset(row_map):
            continue
        revenue_value = _parse_number(sales_row[current_index])
        gross_value = _parse_number(row_map["grossprofit"][current_index])
        gross_margin_row = row_map.get("grossmargin")
        gross_margin_pct = _parse_number(gross_margin_row[current_index]) if gross_margin_row and len(gross_margin_row) > current_index else None
        net_income_value = _parse_number(row_map["netincome"][current_index])
        if revenue_value is None or net_income_value is None:
            continue
        scale = 1_000_000
        quarter = f"{year}Q{quarter_number}"
        period_end = _quarter_period_end(year, quarter_number)
        if gross_value is None and gross_margin_pct is not None:
            gross_value = revenue_value * gross_margin_pct / 100
        entry = _build_financial_entry(
            quarter,
            currency,
            period_end,
            str(year),
            f"Q{quarter_number}",
            revenue_value=revenue_value * scale,
            gross_value=gross_value * scale if gross_value is not None else None,
            net_income_value=net_income_value * scale,
        )
        entry["statementSourceUrl"] = source_url
        entry["statementFilingDate"] = filing_date
        return (quarter, entry)
    return None


def _quarter_from_month_day_year_label(label: str) -> tuple[str, str] | None:
    match = re.search(r"([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})", str(label or ""))
    if not match:
        return None
    month_lookup = {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "may": 5,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
    month = month_lookup.get(match.group(1).strip().lower()[:3])
    if month is None:
        return None
    year = int(match.group(3))
    quarter_number = (month - 1) // 3 + 1
    quarter = f"{year}Q{quarter_number}"
    return (quarter, _quarter_period_end(year, quarter_number))


def _extract_dense_number_series(cells: list[str], expected_count: int, *, min_abs: float) -> list[float]:
    values: list[float] = []
    for cell in cells:
        number = _parse_number(cell)
        if number is None:
            continue
        if abs(number) < min_abs:
            continue
        values.append(number)
    if len(values) < expected_count:
        return []
    return values[:expected_count]


def _parse_palantir_registration_release(html_text: str, filing_date: str, source_url: str, currency: str) -> dict[str, dict[str, Any]]:
    parsed_quarters: dict[str, dict[str, Any]] = {}
    for rows in _extract_html_tables(html_text):
        if len(rows) < 4:
            continue
        header_index = None
        for index, row in enumerate(rows[:6]):
            if not row:
                continue
            if "threemonthsended" in _normalize_table_key(" ".join(row)):
                header_index = index
                break
        if header_index is None or header_index + 1 >= len(rows):
            continue

        quarter_pairs: list[tuple[str, str]] = []
        for label in rows[header_index + 1]:
            parsed_label = _quarter_from_month_day_year_label(label)
            if parsed_label is not None:
                quarter_pairs.append(parsed_label)
        if len(quarter_pairs) < 4:
            continue

        row_map = {_normalize_table_key(row[0]): row for row in rows if row}
        revenue_row = row_map.get("revenue") or row_map.get("totalrevenue")
        if revenue_row is None:
            continue

        expected_count = len(quarter_pairs)
        revenue_values = _extract_dense_number_series(revenue_row[1:], expected_count, min_abs=100)
        if len(revenue_values) != expected_count:
            continue

        operating_row = row_map.get("incomelossfromoperations") or row_map.get("incomefromoperations")
        operating_values = _extract_dense_number_series(operating_row[1:], expected_count, min_abs=1) if operating_row else []
        pretax_row = row_map.get("incomebeforeincometaxes") or row_map.get("incomebeforetaxes")
        pretax_values = _extract_dense_number_series(pretax_row[1:], expected_count, min_abs=1) if pretax_row else []
        tax_row = row_map.get("provisionforincometaxes") or row_map.get("incometaxexpense")
        tax_values = _extract_dense_number_series(tax_row[1:], expected_count, min_abs=1) if tax_row else []
        net_income_row = row_map.get("netincomeloss") or row_map.get("netincome")
        net_income_values = _extract_dense_number_series(net_income_row[1:], expected_count, min_abs=1) if net_income_row else []

        scale = 1_000 if any("inthousands" in _normalize_table_key(" ".join(row)) for row in rows[:4]) else 1
        for index, (quarter, period_end) in enumerate(quarter_pairs):
            if _period_key(quarter) < MIN_CALENDAR_QUARTER:
                continue
            revenue_value = revenue_values[index] * scale
            operating_value = operating_values[index] * scale if len(operating_values) == expected_count else None
            pretax_value = pretax_values[index] * scale if len(pretax_values) == expected_count else None
            tax_value = tax_values[index] * scale if len(tax_values) == expected_count else None
            net_income_value = net_income_values[index] * scale if len(net_income_values) == expected_count else None
            entry = _build_financial_entry(
                quarter,
                currency,
                period_end,
                quarter[:4],
                f"Q{quarter[-1]}",
                revenue_value=revenue_value,
                operating_income_value=operating_value,
                pretax_value=pretax_value,
                tax_value=tax_value,
                net_income_value=net_income_value,
            )
            entry["statementSourceUrl"] = source_url
            entry["statementFilingDate"] = filing_date
            current = parsed_quarters.get(quarter)
            if current is None or str(entry.get("statementFilingDate") or "") > str(current.get("statementFilingDate") or ""):
                parsed_quarters[quarter] = entry
    return parsed_quarters


def _load_palantir_registration_quarters(cik: int, currency: str) -> dict[str, dict[str, Any]]:
    try:
        submissions = _request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    except Exception:
        return {}

    results: dict[str, dict[str, Any]] = {}
    seen_accessions: set[str] = set()
    for form, accession, filing_date, primary_document in _submission_records(submissions):
        if filing_date < "2020-01-01" or form not in {"S-1", "S-1/A", "424B4"}:
            continue
        accession_nodash = str(accession).replace("-", "")
        if accession_nodash in seen_accessions:
            continue
        seen_accessions.add(accession_nodash)

        try:
            index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
        except Exception:
            continue
        html_names = [
            str(item.get("name") or "")
            for item in index_payload.get("directory", {}).get("item", [])
            if str(item.get("name") or "").lower().endswith((".htm", ".html"))
            and "index" not in str(item.get("name") or "").lower()
            and not str(item.get("name") or "").lower().endswith((".jpg", ".jpeg", ".png", ".gif"))
        ]
        if not html_names:
            continue
        ordered_names = [primary_document] + [name for name in html_names if name != primary_document]
        for name in ordered_names:
            if name not in html_names:
                continue
            url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{name}"
            try:
                html_text = _request(url).decode("utf-8", errors="ignore")
            except Exception:
                continue
            parsed = _parse_palantir_registration_release(html_text, filing_date, url, currency)
            if not parsed:
                continue
            for quarter, entry in parsed.items():
                current = results.get(quarter)
                if current is None or str(entry.get("statementFilingDate") or "") > str(current.get("statementFilingDate") or ""):
                    results[quarter] = entry
            break
    return results


def _load_html_fallback_financials(company: dict[str, Any], cik: int, currency: str) -> dict[str, Any]:
    parser = {
        "tsmc": _parse_tsm_release,
        "asml": _parse_asml_release,
    }.get(str(company.get("id") or ""))
    if parser is None:
        return {}

    results: dict[str, dict[str, Any]] = {}
    try:
        submissions = _request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    except Exception:
        return {}

    seen_accessions: set[str] = set()
    for form, accession, filing_date, primary_document in _submission_records(submissions):
        if filing_date < MIN_FILING_DATE or form not in {"6-K", "20-F"}:
            continue
        try:
            filing_month = int(str(filing_date)[5:7])
            filing_day = int(str(filing_date)[8:10])
        except ValueError:
            continue
        accession_nodash = str(accession).replace("-", "")
        if accession_nodash in seen_accessions:
            continue
        seen_accessions.add(accession_nodash)

        primary_lower = str(primary_document or "").lower()
        if company["id"] == "tsmc":
            if form != "6-K" or filing_month not in {1, 4, 7, 10}:
                continue
            if filing_day < 10 or filing_day > 25:
                continue
            if any(
                token in primary_lower
                for token in ("revenue", "monthend", "dividend", "agm", "changeof", "board", "director", "mediastatement")
            ):
                continue
        if company["id"] == "asml":
            if form != "6-K" or filing_month not in {1, 4, 7, 10}:
                continue
            if any(token in primary_lower for token in ("annualreport", "investorday", "agm")):
                continue

        try:
            index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
        except Exception:
            continue
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
            continue
        ordered_names = [primary_document] + [name for name in html_names if name != primary_document]
        if company["id"] == "tsmc":
            ordered_names = sorted(
                html_names,
                key=lambda name: (
                    0 if "withguidance" in name.lower() or "ex99" in name.lower() else 1 if name == primary_document else 2,
                    name,
                ),
            )
        if company["id"] == "asml":
            ordered_names = sorted(
                html_names,
                key=lambda name: (
                    0 if "pressrelease" in name.lower() else 1 if "financialstatements" in name.lower() else 2 if name == primary_document else 3,
                    name,
                ),
            )
        for name in ordered_names:
            if name not in html_names:
                continue
            url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{name}"
            try:
                html_text = _request(url).decode("utf-8", errors="ignore")
            except Exception:
                continue
            parsed = parser(html_text, filing_date, url, currency)
            if parsed is None:
                continue
            quarter, entry = parsed
            if _period_key(quarter) < MIN_CALENDAR_QUARTER:
                break
            current = results.get(quarter)
            if current is None or str(entry.get("statementFilingDate") or "") > str(current.get("statementFilingDate") or ""):
                results[quarter] = entry
            periods = sorted(results, key=_period_key)
            min_anchor_quarter = f"{MIN_CALENDAR_QUARTER[0]}Q{MIN_CALENDAR_QUARTER[1]}"
            if min_anchor_quarter in results and periods:
                expected = (int(periods[-1][:4]) - MIN_CALENDAR_QUARTER[0]) * 4 + int(periods[-1][-1]) - MIN_CALENDAR_QUARTER[1] + 1
                if len(periods) >= expected:
                    return results
            break
    return results


def fetch_official_financial_history(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    path = _cache_path(str(company["id"]))
    if path.exists() and not refresh:
        return _load_cached_json(path)

    cik = _resolve_cik(str(company.get("ticker") or ""), refresh=refresh)
    result = {
        "id": company["id"],
        "ticker": company["ticker"],
        "nameZh": company["nameZh"],
        "nameEn": company["nameEn"],
        "slug": company["slug"],
        "rank": company["rank"],
        "isAdr": company["isAdr"],
        "brand": company["brand"],
        "quarters": [],
        "financials": {},
        "statementSource": "official-sec-companyfacts",
        "statementSourceUrl": None,
        "reportingCurrency": None,
        "cik": cik,
        "errors": [],
    }
    if cik is None:
        result["errors"].append("Unable to resolve SEC CIK.")
        _write_cached_json(path, result)
        return result

    source_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
    result["statementSourceUrl"] = source_url
    try:
        companyfacts = _request_json(source_url)
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"companyfacts: {exc}")
        _write_cached_json(path, result)
        return result

    reporting_currency = _select_reporting_currency(companyfacts)
    if reporting_currency is None:
        result["errors"].append("Unable to determine reporting currency from companyfacts.")
        _write_cached_json(path, result)
        return result
    result["reportingCurrency"] = reporting_currency

    concept_series = _collect_concept_series(companyfacts, reporting_currency)
    field_series = _collect_field_series(companyfacts, reporting_currency)
    quarter_keys = sorted(
        {
            quarter
            for series in [*concept_series.values(), *field_series.values()]
            for quarter in series.keys()
            if _period_key(quarter) >= MIN_CALENDAR_QUARTER
        },
        key=_period_key,
    )

    financials: dict[str, Any] = {}
    for quarter in quarter_keys:
        revenue_fact = _pick_field_fact_with_fallback(concept_series, field_series, "revenue", quarter)
        cost_fact = _pick_field_fact_with_fallback(concept_series, field_series, "costOfRevenue", quarter)
        gross_fact = _pick_field_fact_with_fallback(concept_series, field_series, "grossProfit", quarter)
        sgna_fact = _pick_field_fact_with_fallback(concept_series, field_series, "sgna", quarter)
        if sgna_fact is None:
            sgna_fact = _sum_facts(
                _pick_field_fact_with_fallback(concept_series, field_series, "salesAndMarketing", quarter),
                _pick_field_fact_with_fallback(concept_series, field_series, "generalAndAdministrative", quarter),
            )
        rnd_fact = _pick_field_fact_with_fallback(concept_series, field_series, "rnd", quarter)
        operating_expenses_fact = _pick_field_fact_with_fallback(concept_series, field_series, "operatingExpenses", quarter)
        operating_income_fact = _pick_field_fact_with_fallback(concept_series, field_series, "operatingIncome", quarter)
        pretax_fact = _pick_field_fact_with_fallback(concept_series, field_series, "pretaxIncome", quarter)
        tax_fact = _pick_field_fact_with_fallback(concept_series, field_series, "tax", quarter)
        net_income_fact = _pick_field_fact_with_fallback(concept_series, field_series, "netIncome", quarter)

        revenue_value = revenue_fact.value if revenue_fact else None
        cost_value = cost_fact.value if cost_fact else None
        gross_value = gross_fact.value if gross_fact else None
        if gross_value is None and revenue_value is not None and cost_value is not None:
            gross_value = revenue_value - cost_value
        if cost_value is None and revenue_value is not None and gross_value is not None:
            cost_value = revenue_value - gross_value

        operating_expenses_value = operating_expenses_fact.value if operating_expenses_fact else None
        if operating_expenses_value is None and gross_value is not None and operating_income_fact is not None:
            operating_expenses_value = gross_value - operating_income_fact.value

        other_opex_value = None
        disclosed_opex = sum(
            value
            for value in (
                sgna_fact.value if sgna_fact else None,
                rnd_fact.value if rnd_fact else None,
            )
            if value is not None
        )
        if operating_expenses_value is not None:
            residual = operating_expenses_value - disclosed_opex
            if residual > 0.01:
                other_opex_value = residual

        non_operating_value = None
        if pretax_fact is not None and operating_income_fact is not None:
            non_operating_value = pretax_fact.value - operating_income_fact.value

        metadata_candidates = [
            fact
            for fact in (
                revenue_fact,
                gross_fact,
                operating_expenses_fact,
                operating_income_fact,
                pretax_fact,
                net_income_fact,
            )
            if fact is not None
        ]
        metadata = max(metadata_candidates, key=_fact_rank) if metadata_candidates else None
        fiscal_year = metadata.fiscal_year if metadata else str(_period_key(quarter)[0])
        fiscal_quarter = _normalized_fiscal_period(metadata) if metadata else ""
        period_end = metadata.end_date if metadata else ""

        financials[quarter] = _build_financial_entry(
            quarter,
            reporting_currency,
            period_end,
            fiscal_year,
            fiscal_quarter,
            revenue_value=revenue_value,
            cost_value=cost_value,
            gross_value=gross_value,
            sgna_value=sgna_fact.value if sgna_fact else None,
            rnd_value=rnd_fact.value if rnd_fact else None,
            other_opex_value=other_opex_value,
            operating_expenses_value=operating_expenses_value,
            operating_income_value=operating_income_fact.value if operating_income_fact else None,
            non_operating_value=non_operating_value,
            pretax_value=pretax_fact.value if pretax_fact else None,
            tax_value=tax_fact.value if tax_fact else None,
            net_income_value=net_income_fact.value if net_income_fact else None,
        )

    fallback_financials = _load_html_fallback_financials(company, cik, reporting_currency)
    if fallback_financials:
        financials.update(fallback_financials)
        result["statementSource"] = "official-sec-companyfacts-and-filings"
    if str(company.get("id") or "") == "palantir":
        registration_financials = _load_palantir_registration_quarters(cik, reporting_currency)
        if registration_financials:
            for quarter, entry in registration_financials.items():
                if quarter not in financials:
                    financials[quarter] = entry
            result["statementSource"] = "official-sec-companyfacts-and-filings"

    ordered_periods, ordered_financials = _finalize_financials(financials)
    result["quarters"] = ordered_periods
    result["financials"] = ordered_financials
    _write_cached_json(path, result)
    return result
