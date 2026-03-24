from __future__ import annotations

from typing import Any

from stockanalysis_financials import fetch_stockanalysis_financial_history

from .base import AdapterResult


FIELD_PRIORITIES = {
    "revenueBn": 72,
    "costOfRevenueBn": 70,
    "grossProfitBn": 70,
    "sgnaBn": 66,
    "rndBn": 66,
    "operatingExpensesBn": 70,
    "operatingIncomeBn": 70,
    "pretaxIncomeBn": 70,
    "taxBn": 66,
    "netIncomeBn": 70,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del base_payload
    enabled = str(company.get("financialSource") or "") == "stockanalysis"
    payload: dict[str, Any] = {}
    errors: list[str] = []
    if enabled:
        payload = fetch_stockanalysis_financial_history(company, refresh=refresh)
        errors = list(payload.get("errors") or []) if isinstance(payload, dict) else []
    return AdapterResult(
        adapter_id="stockanalysis_financials",
        kind="statement",
        label="StockAnalysis financials",
        priority=64,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=errors,
        enabled=enabled,
    )
