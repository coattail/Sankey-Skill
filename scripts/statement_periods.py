from __future__ import annotations

from typing import Any, Callable

from official_segments import _period_key


ABSOLUTE_BN_FIELDS: tuple[str, ...] = (
    "revenueBn",
    "costOfRevenueBn",
    "grossProfitBn",
    "sgnaBn",
    "rndBn",
    "otherOpexBn",
    "operatingExpensesBn",
    "operatingIncomeBn",
    "nonOperatingBn",
    "pretaxIncomeBn",
    "taxBn",
    "netIncomeBn",
)

BREAKDOWN_FIELDS: tuple[str, ...] = ("officialOpexBreakdown", "officialCostBreakdown")
NON_NEGATIVE_FIELDS: tuple[str, ...] = (
    "revenueBn",
    "costOfRevenueBn",
    "sgnaBn",
    "rndBn",
    "otherOpexBn",
    "operatingExpensesBn",
)
DERIVED_PROVENANCE_FIELDS: tuple[str, ...] = (
    "statementDerivedFromSpanQuarters",
    "statementDerivedFromQuarters",
)


def quarter_window(end_quarter: str, span: int) -> list[str]:
    try:
        year = int(str(end_quarter)[:4])
        quarter = int(str(end_quarter)[-1])
    except (TypeError, ValueError):
        return []
    quarters: list[str] = []
    current_year = year
    current_quarter = quarter
    for _ in range(max(int(span or 0), 0)):
        quarters.append(f"{current_year}Q{current_quarter}")
        current_quarter -= 1
        if current_quarter == 0:
            current_quarter = 4
            current_year -= 1
    return list(reversed(quarters))


def _period_span(entry: dict[str, Any]) -> int:
    try:
        span = int(entry.get("statementSpanQuarters") or 1)
    except (TypeError, ValueError):
        span = 1
    return max(span, 1)


def _safe_pct(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return round((float(numerator) / float(denominator)) * 100, 2)


def _normalize_money_fields(entry: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(entry)
    for key in ABSOLUTE_BN_FIELDS:
        value = normalized.get(key)
        if value is None:
            continue
        normalized[key] = round(float(value), 3)

    revenue = normalized.get("revenueBn")
    cost = normalized.get("costOfRevenueBn")
    gross = normalized.get("grossProfitBn")
    sgna = normalized.get("sgnaBn")
    rnd = normalized.get("rndBn")
    other_opex = normalized.get("otherOpexBn")
    operating_expenses = normalized.get("operatingExpensesBn")
    operating_income = normalized.get("operatingIncomeBn")
    non_operating = normalized.get("nonOperatingBn")
    pretax = normalized.get("pretaxIncomeBn")
    tax = normalized.get("taxBn")
    net_income = normalized.get("netIncomeBn")

    if gross is None and revenue is not None and cost is not None:
        gross = round(float(revenue) - float(cost), 3)
    if cost is None and revenue is not None and gross is not None:
        cost = round(float(revenue) - float(gross), 3)
    if operating_income is None and gross is not None and operating_expenses is not None:
        operating_income = round(float(gross) - float(operating_expenses), 3)
    if operating_expenses is None and gross is not None and operating_income is not None:
        operating_expenses = round(float(gross) - float(operating_income), 3)
    if tax is None and pretax is not None and net_income is not None:
        tax = round(float(pretax) - float(net_income), 3)
    if non_operating is None and pretax is not None and operating_income is not None:
        non_operating = round(float(pretax) - float(operating_income), 3)
    if other_opex is None and operating_expenses is not None:
        disclosed_opex = sum(float(value) for value in (sgna, rnd) if value is not None)
        residual = round(float(operating_expenses) - disclosed_opex, 3)
        if residual > 0.01:
            other_opex = residual

    normalized["costOfRevenueBn"] = cost
    normalized["grossProfitBn"] = gross
    normalized["otherOpexBn"] = other_opex
    normalized["operatingExpensesBn"] = operating_expenses
    normalized["operatingIncomeBn"] = operating_income
    normalized["nonOperatingBn"] = non_operating
    normalized["taxBn"] = tax
    normalized["grossMarginPct"] = _safe_pct(gross, revenue)
    normalized["operatingMarginPct"] = _safe_pct(operating_income, revenue)
    normalized["profitMarginPct"] = _safe_pct(net_income, revenue)
    normalized["effectiveTaxRatePct"] = _safe_pct(tax, pretax)
    normalized.setdefault("revenueYoyPct", None)
    normalized.setdefault("netIncomeYoyPct", None)
    normalized.setdefault("revenueQoqPct", None)
    normalized.setdefault("grossMarginYoyDeltaPp", None)
    normalized.setdefault("operatingMarginYoyDeltaPp", None)
    normalized.setdefault("profitMarginYoyDeltaPp", None)
    return normalized


def _entry_rank(entry: dict[str, Any], score_entry: Callable[[dict[str, Any]], tuple[Any, ...]] | None) -> tuple[Any, ...]:
    score = tuple(score_entry(entry)) if score_entry is not None else ()
    value_mode = str(entry.get("statementValueMode") or "").lower()
    value_mode_rank = 2 if value_mode == "direct" else 1 if value_mode == "derived" else 0
    return (*score, value_mode_rank, str(entry.get("statementFilingDate") or ""))


def _merge_quality_flags(primary: dict[str, Any], secondary: dict[str, Any], merged: dict[str, Any]) -> dict[str, Any]:
    flags = sorted(set(primary.get("qualityFlags") or []) | set(secondary.get("qualityFlags") or []))
    if flags:
        merged["qualityFlags"] = flags
    return merged


def _merge_preferred(
    preferred: dict[str, Any],
    fallback: dict[str, Any],
    merge_entry: Callable[[dict[str, Any] | None, dict[str, Any]], dict[str, Any]] | None,
) -> dict[str, Any]:
    if merge_entry is None:
        merged = dict(preferred)
        for key, value in fallback.items():
            if merged.get(key) is None and value is not None:
                merged[key] = value
    else:
        merged = merge_entry(preferred, fallback)
    merged = _merge_quality_flags(preferred, fallback, merged)
    preferred_value_mode = str(preferred.get("statementValueMode") or "").lower()
    fallback_value_mode = str(fallback.get("statementValueMode") or "").lower()
    if preferred_value_mode != "derived" and fallback_value_mode == "derived":
        for field_name in DERIVED_PROVENANCE_FIELDS:
            merged.pop(field_name, None)
        flags = [flag for flag in merged.get("qualityFlags") or [] if flag != "derived-from-cumulative"]
        if flags:
            merged["qualityFlags"] = flags
        else:
            merged.pop("qualityFlags", None)
    return merged


def _breakdown_map(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    mapped: dict[str, dict[str, Any]] = {}
    for item in items:
        key = str(item.get("memberKey") or item.get("name") or "").strip()
        if key:
            mapped[key] = item
    return mapped


def _derive_breakdown(
    current_items: list[dict[str, Any]] | None,
    prior_entries: list[dict[str, Any]],
    field_name: str,
) -> list[dict[str, Any]] | None:
    if not isinstance(current_items, list):
        return None
    prior_maps: list[dict[str, dict[str, Any]]] = []
    for entry in prior_entries:
        prior_items = entry.get(field_name)
        if not isinstance(prior_items, list):
            return None
        prior_maps.append(_breakdown_map(prior_items))

    derived_items: list[dict[str, Any]] = []
    for item in current_items:
        key = str(item.get("memberKey") or item.get("name") or "").strip()
        if not key:
            continue
        try:
            current_value = float(item.get("valueBn") or 0)
        except (TypeError, ValueError):
            continue
        derived_value = round(current_value - sum(float(prior_map.get(key, {}).get("valueBn") or 0) for prior_map in prior_maps), 3)
        if abs(derived_value) <= 0.0005:
            continue
        derived_items.append({**item, "valueBn": derived_value, "derived": True})
    return derived_items


def _can_mix(current: dict[str, Any], prior_entries: list[dict[str, Any]]) -> bool:
    current_currency = str(current.get("statementCurrency") or "")
    if not current_currency:
        return True
    return all(str(entry.get("statementCurrency") or "") in {"", current_currency} for entry in prior_entries)


def _derive_quarter_entry(current: dict[str, Any], prior_entries: list[dict[str, Any]], *, source_span: int) -> dict[str, Any] | None:
    if not prior_entries or not _can_mix(current, prior_entries):
        return None

    derived: dict[str, Any] = {
        key: value
        for key, value in current.items()
        if key not in ABSOLUTE_BN_FIELDS and key not in BREAKDOWN_FIELDS
    }
    derived["statementSpanQuarters"] = 1
    derived["statementValueMode"] = "derived"
    derived["statementDerivedFromSpanQuarters"] = source_span
    derived["statementDerivedFromQuarters"] = [str(entry.get("calendarQuarter") or "") for entry in prior_entries]

    flags = set(current.get("qualityFlags") or [])
    flags.add("derived-from-cumulative")
    derived["qualityFlags"] = sorted(flags)

    derived_field_count = 0
    for field_name in ABSOLUTE_BN_FIELDS:
        current_value = current.get(field_name)
        if current_value is None:
            continue
        try:
            prior_total = 0.0
            for prior in prior_entries:
                prior_value = prior.get(field_name)
                if prior_value is None:
                    raise ValueError(field_name)
                prior_total += float(prior_value)
            derived[field_name] = round(float(current_value) - prior_total, 3)
            derived_field_count += 1
        except (TypeError, ValueError):
            continue

    for field_name in BREAKDOWN_FIELDS:
        derived_items = _derive_breakdown(current.get(field_name), prior_entries, field_name)
        if derived_items is not None:
            derived[field_name] = derived_items

    if derived_field_count == 0 and not any(derived.get(field_name) for field_name in BREAKDOWN_FIELDS):
        return None
    normalized = _normalize_money_fields(derived)
    for field_name in NON_NEGATIVE_FIELDS:
        value = normalized.get(field_name)
        if value is not None and float(value) < -0.001:
            return None
    return normalized


def finalize_period_entries(
    entries: list[dict[str, Any]],
    *,
    merge_entry: Callable[[dict[str, Any] | None, dict[str, Any]], dict[str, Any]] | None = None,
    score_entry: Callable[[dict[str, Any]], tuple[Any, ...]] | None = None,
) -> dict[str, dict[str, Any]]:
    best_period_entries: dict[tuple[str, int], dict[str, Any]] = {}
    for raw_entry in entries:
        if not isinstance(raw_entry, dict):
            continue
        quarter = str(raw_entry.get("calendarQuarter") or "").strip()
        if not quarter:
            continue
        entry = _normalize_money_fields(raw_entry)
        key = (quarter, _period_span(entry))
        current = best_period_entries.get(key)
        if current is None:
            best_period_entries[key] = entry
            continue
        if _entry_rank(entry, score_entry) >= _entry_rank(current, score_entry):
            best_period_entries[key] = _merge_preferred(entry, current, merge_entry)
        else:
            best_period_entries[key] = _merge_preferred(current, entry, merge_entry)

    finalized: dict[str, dict[str, Any]] = {}
    for quarter, span in sorted(best_period_entries, key=lambda item: (_period_key(item[0]), item[1])):
        entry = best_period_entries[(quarter, span)]
        if span <= 1:
            current = finalized.get(quarter)
            if current is None:
                finalized[quarter] = entry
            elif _entry_rank(entry, score_entry) >= _entry_rank(current, score_entry):
                finalized[quarter] = _merge_preferred(entry, current, merge_entry)
            else:
                finalized[quarter] = _merge_preferred(current, entry, merge_entry)
            continue

        prior_quarters = quarter_window(quarter, span)[:-1]
        if not prior_quarters:
            continue

        derived: dict[str, Any] | None = None
        previous_quarter = prior_quarters[-1]
        prior_cumulative = best_period_entries.get((previous_quarter, span - 1))
        if prior_cumulative is not None:
            derived = _derive_quarter_entry(entry, [prior_cumulative], source_span=span)
        elif all(prior_quarter in finalized for prior_quarter in prior_quarters):
            derived = _derive_quarter_entry(entry, [finalized[prior_quarter] for prior_quarter in prior_quarters], source_span=span)
        if derived is None:
            continue

        current = finalized.get(quarter)
        if current is None:
            finalized[quarter] = derived
        else:
            finalized[quarter] = _merge_preferred(current, derived, merge_entry)

    return {
        quarter: finalized[quarter]
        for quarter in sorted(finalized, key=_period_key)
    }
