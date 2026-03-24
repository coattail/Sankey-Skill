from __future__ import annotations

from typing import Any

from generic_ir_pdf_parser import fetch_generic_ir_pdf_history

from .base import AdapterResult


FIELD_PRIORITIES = {
    "revenueBn": 78,
    "costOfRevenueBn": 76,
    "grossProfitBn": 76,
    "sgnaBn": 74,
    "rndBn": 74,
    "operatingExpensesBn": 76,
    "operatingIncomeBn": 76,
    "pretaxIncomeBn": 76,
    "taxBn": 74,
    "netIncomeBn": 76,
    "officialCostBreakdown": 80,
    "officialOpexBreakdown": 80,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del base_payload
    payload = fetch_generic_ir_pdf_history(company, refresh=refresh)
    return AdapterResult(
        adapter_id="generic_ir_pdf",
        kind="statement",
        label="Generic IR PDF parser",
        priority=72,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=list(payload.get("errors") or []) if isinstance(payload, dict) else [],
        enabled=bool((payload or {}).get("financials")) if isinstance(payload, dict) else False,
    )
