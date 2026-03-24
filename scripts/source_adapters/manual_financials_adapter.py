from __future__ import annotations

from copy import deepcopy
from typing import Any

from manual_data_sources import load_manual_company_overrides, lookup_company_record

from .base import AdapterResult


FIELD_PRIORITIES = {
    "revenueBn": 150,
    "costOfRevenueBn": 150,
    "grossProfitBn": 150,
    "sgnaBn": 148,
    "rndBn": 148,
    "otherOpexBn": 148,
    "operatingExpensesBn": 150,
    "operatingIncomeBn": 150,
    "nonOperatingBn": 148,
    "pretaxIncomeBn": 150,
    "taxBn": 148,
    "netIncomeBn": 150,
    "officialCostBreakdown": 154,
    "officialOpexBreakdown": 154,
    "costBreakdown": 154,
    "opexBreakdown": 154,
}


def _derive_opex_breakdown_from_operating_profit(entry: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = entry.get("operatingProfitBreakdown")
    if not isinstance(raw_items, list):
        return []
    derived = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("valueFormat") or "") != "negative-parentheses":
            continue
        value_bn = raw.get("valueBn")
        if not isinstance(value_bn, (int, float)) or isinstance(value_bn, bool):
            continue
        derived.append(
            {
                "name": raw.get("name"),
                "nameZh": raw.get("nameZh"),
                "valueBn": round(float(value_bn), 3),
                "valueFormat": "negative-parentheses",
                "sourceUrl": raw.get("sourceUrl"),
            }
        )
    return derived


def _normalize_manual_payload(payload: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(payload)
    financials = result.get("financials")
    if not isinstance(financials, dict):
        return result
    for entry in financials.values():
        if not isinstance(entry, dict):
            continue
        if not entry.get("opexBreakdown"):
            derived = _derive_opex_breakdown_from_operating_profit(entry)
            if derived:
                entry["opexBreakdown"] = derived
    return result


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del refresh, base_payload
    source_payload = load_manual_company_overrides()
    record = lookup_company_record(source_payload, company)
    payload = _normalize_manual_payload(record) if isinstance(record, dict) else {}
    enabled = isinstance(payload.get("financials"), dict)
    return AdapterResult(
        adapter_id="manual_financials",
        kind="statement",
        label="Manual company overrides",
        priority=146,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=list(payload.get("errors") or []) if isinstance(payload, dict) else [],
        enabled=enabled,
    )
