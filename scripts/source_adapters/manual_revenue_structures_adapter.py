from __future__ import annotations

from typing import Any

from manual_data_sources import load_manual_company_overrides, lookup_company_record

from .base import AdapterResult


FIELD_PRIORITIES = {
    "officialRevenueSegments": 154,
    "officialRevenueDetailGroups": 152,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del refresh, base_payload
    source_payload = load_manual_company_overrides()
    record = lookup_company_record(source_payload, company)
    payload = {}
    enabled = False
    if isinstance(record, dict):
        history = record.get("officialRevenueStructureHistory")
        if isinstance(history, dict):
            payload = history
            enabled = True
    return AdapterResult(
        adapter_id="manual_revenue_structures",
        kind="revenue_structure",
        label="Manual revenue structure overrides",
        priority=146,
        payload=payload,
        field_priorities=FIELD_PRIORITIES,
        enabled=enabled,
    )
