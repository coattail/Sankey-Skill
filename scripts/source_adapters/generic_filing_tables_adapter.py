from __future__ import annotations

from typing import Any

from generic_filing_table_parser import fetch_generic_filing_table_history

from .base import AdapterResult


FIELD_PRIORITIES = {
    "revenueBn": 86,
    "costOfRevenueBn": 84,
    "grossProfitBn": 84,
    "sgnaBn": 82,
    "rndBn": 82,
    "operatingExpensesBn": 84,
    "operatingIncomeBn": 84,
    "pretaxIncomeBn": 84,
    "taxBn": 82,
    "netIncomeBn": 84,
    "officialOpexBreakdown": 88,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del base_payload
    payload = fetch_generic_filing_table_history(company, refresh=refresh)
    return AdapterResult(
        adapter_id="generic_filing_tables",
        kind="statement",
        label="Generic official filing table parser",
        priority=80,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=list(payload.get("errors") or []) if isinstance(payload, dict) else [],
        enabled=bool((payload or {}).get("financials")) if isinstance(payload, dict) else False,
    )
