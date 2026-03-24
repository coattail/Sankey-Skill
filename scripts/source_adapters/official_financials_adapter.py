from __future__ import annotations

from typing import Any

from official_financials import fetch_official_financial_history

from .base import AdapterResult


FIELD_PRIORITIES = {
    "revenueBn": 120,
    "costOfRevenueBn": 120,
    "grossProfitBn": 118,
    "sgnaBn": 112,
    "rndBn": 112,
    "operatingExpensesBn": 118,
    "operatingIncomeBn": 118,
    "pretaxIncomeBn": 118,
    "taxBn": 112,
    "netIncomeBn": 118,
    "officialCostBreakdown": 124,
    "officialOpexBreakdown": 124,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del base_payload
    payload = fetch_official_financial_history(company, refresh=refresh)
    return AdapterResult(
        adapter_id="official_financials",
        kind="statement",
        label="SEC companyfacts / filings",
        priority=110,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=list(payload.get("errors") or []) if isinstance(payload, dict) else [],
    )
