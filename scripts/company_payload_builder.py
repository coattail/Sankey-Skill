from __future__ import annotations

from copy import deepcopy
import json
from typing import Any

from build_dataset import (
    apply_usd_display_fields,
    fetch_company_payload,
    load_fx_cache,
    merge_official_revenue_structure_history,
    merge_official_segment_history,
    parse_period,
    sanitize_implausible_q4_revenue_aligned_statements,
    supplement_stockanalysis_with_official_financials,
    supplement_tencent_official_financials,
)
from extraction_engine import build_unified_extraction, merge_unified_extraction
from manual_data_sources import load_manual_company_overrides


def deep_merge_dicts(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge_dicts(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def apply_manual_company_override(payload: dict[str, Any], company: dict[str, Any]) -> dict[str, Any]:
    overrides = load_manual_company_overrides()
    lookup_candidates = [
        str(company.get("id") or "").strip().lower(),
        str(company.get("ticker") or "").strip().lower(),
        str(company.get("slug") or "").strip().lower(),
    ]
    override = next((overrides.get(candidate) for candidate in lookup_candidates if candidate and isinstance(overrides.get(candidate), dict)), None)
    if not isinstance(override, dict):
        return payload

    result = deep_merge_dicts(payload, {key: value for key, value in override.items() if key not in {"financials", "quarters", "officialRevenueStructureHistory", "errors"}})
    if isinstance(override.get("financials"), dict):
        result["financials"] = deepcopy(override["financials"])
        if not isinstance(override.get("quarters"), list):
            result["quarters"] = sorted(result["financials"].keys(), key=parse_period)
    if isinstance(override.get("quarters"), list):
        result["quarters"] = [str(item) for item in override["quarters"] if str(item)]
    if isinstance(override.get("officialRevenueStructureHistory"), dict):
        result["officialRevenueStructureHistory"] = deepcopy(override["officialRevenueStructureHistory"])
    if isinstance(override.get("errors"), list):
        result["errors"] = deepcopy(override["errors"])
    return result


def build_arbitrary_company_payload(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    payload = fetch_company_payload(company, refresh=refresh)
    if company.get("financialSource") != "stockanalysis":
        payload = merge_official_segment_history(payload, company, refresh=refresh)
    payload = merge_official_revenue_structure_history(payload, company, refresh=refresh)
    payload = supplement_stockanalysis_with_official_financials(payload, refresh=refresh)
    payload = supplement_tencent_official_financials(payload)
    payload = sanitize_implausible_q4_revenue_aligned_statements(payload)
    payload = apply_usd_display_fields(payload, load_fx_cache())
    payload = apply_manual_company_override(payload, company)
    payload = merge_unified_extraction(payload, build_unified_extraction(company, refresh=refresh, base_payload=payload))
    return payload
