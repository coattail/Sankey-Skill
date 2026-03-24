from __future__ import annotations

from typing import Any

from official_segments import fetch_official_segment_history

from .base import AdapterResult


FIELD_PRIORITIES = {
    "officialRevenueSegments": 104,
}


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del base_payload
    payload = fetch_official_segment_history(company, refresh=refresh)
    return AdapterResult(
        adapter_id="official_segments",
        kind="revenue_segments",
        label="Official XBRL segment facts",
        priority=96,
        payload=payload if isinstance(payload, dict) else {},
        field_priorities=FIELD_PRIORITIES,
        errors=list(payload.get("errors") or []) if isinstance(payload, dict) else [],
    )
