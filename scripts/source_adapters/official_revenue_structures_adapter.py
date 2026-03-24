from __future__ import annotations

from typing import Any

from official_revenue_structures import fetch_official_revenue_structure_history

from .base import AdapterResult


FIELD_PRIORITIES = {
    "officialRevenueSegments": 114,
    "officialRevenueDetailGroups": 112,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del base_payload
    payload = fetch_official_revenue_structure_history(company, refresh=refresh)
    return AdapterResult(
        adapter_id="official_revenue_structures",
        kind="revenue_structure",
        label="Official filing revenue structure",
        priority=106,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=list(payload.get("errors") or []) if isinstance(payload, dict) else [],
    )
