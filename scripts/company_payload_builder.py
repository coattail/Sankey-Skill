from __future__ import annotations

from typing import Any

from build_dataset import (
    apply_usd_display_fields,
    fetch_company_payload,
    load_fx_cache,
    merge_official_revenue_structure_history,
    merge_official_segment_history,
    sanitize_implausible_q4_revenue_aligned_statements,
    supplement_tencent_official_financials,
)


def build_arbitrary_company_payload(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    payload = fetch_company_payload(company, refresh=refresh)
    if company.get("financialSource") != "stockanalysis":
        payload = merge_official_segment_history(payload, company, refresh=refresh)
    payload = merge_official_revenue_structure_history(payload, company, refresh=refresh)
    payload = supplement_tencent_official_financials(payload)
    payload = sanitize_implausible_q4_revenue_aligned_statements(payload)
    payload = apply_usd_display_fields(payload, load_fx_cache())
    return payload
