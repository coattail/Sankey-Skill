from __future__ import annotations

from copy import deepcopy
from typing import Any

from manual_data_sources import load_supplemental_components, lookup_company_record

from .base import AdapterResult


FIELD_PRIORITIES = {
    "sgnaBn": 90,
    "rndBn": 90,
    "costBreakdown": 96,
    "opexBreakdown": 92,
    "costBreakdownProfile": 94,
}


def _breakdown_item(name: str, name_zh: str, value_bn: float, source_url: str | None, source_label: str | None) -> dict[str, Any]:
    item = {
        "name": name,
        "nameZh": name_zh,
        "valueBn": round(float(value_bn), 3),
        "valueFormat": "negative-parentheses",
    }
    if source_url:
        item["sourceUrl"] = source_url
    if source_label:
        item["note"] = source_label
    return item


def _resolve_quarter_values(record: dict[str, Any], quarter: str) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    default_payload = record.get("_default")
    if isinstance(default_payload, dict):
        merged.update(deepcopy(default_payload))
    quarter_payload = record.get(quarter)
    if isinstance(quarter_payload, dict):
        merged.update(deepcopy(quarter_payload))
    return merged


def run(company: dict[str, Any], refresh: bool = False, base_payload: dict[str, Any] | None = None) -> AdapterResult:
    del refresh
    source_payload = load_supplemental_components()
    record = lookup_company_record(source_payload, company)
    if not isinstance(record, dict):
        return AdapterResult(
            adapter_id="supplemental_components",
            kind="statement",
            label="Supplemental structured components",
            priority=84,
            payload={},
            field_priorities=FIELD_PRIORITIES,
            enabled=False,
        )

    quarters = []
    if isinstance(base_payload, dict):
        quarters = [str(item) for item in base_payload.get("quarters", []) if str(item)]
    if not quarters:
        quarters = [key for key, value in record.items() if key != "_default" and isinstance(value, dict)]

    financials: dict[str, Any] = {}
    for quarter in quarters:
        values = _resolve_quarter_values(record, quarter)
        if not values:
            continue
        entry: dict[str, Any] = {"calendarQuarter": quarter}
        source_url = str(values.get("sourceUrl") or "").strip() or None
        source_label = str(values.get("sourceLabel") or "").strip() or None
        for field_name in ("sgnaBn", "rndBn"):
            value = values.get(field_name)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                entry[field_name] = round(float(value), 3)

        cost_items = []
        if isinstance(values.get("trafficAcquisitionCostBn"), (int, float)) and not isinstance(values.get("trafficAcquisitionCostBn"), bool):
            cost_items.append(_breakdown_item("TAC", "流量获取成本", float(values["trafficAcquisitionCostBn"]), source_url, source_label))
        if isinstance(values.get("otherCostOfRevenueBn"), (int, float)) and not isinstance(values.get("otherCostOfRevenueBn"), bool):
            cost_items.append(_breakdown_item("Other cost", "其他成本", float(values["otherCostOfRevenueBn"]), source_url, source_label))
        if cost_items:
            entry["costBreakdown"] = cost_items

        opex_items = []
        if isinstance(entry.get("sgnaBn"), (int, float)):
            opex_items.append(_breakdown_item("SG&A", "销售及管理费用", float(entry["sgnaBn"]), source_url, source_label))
        if isinstance(entry.get("rndBn"), (int, float)):
            opex_items.append(_breakdown_item("R&D", "研发", float(entry["rndBn"]), source_url, source_label))
        if opex_items:
            entry["opexBreakdown"] = opex_items

        if isinstance(values.get("costBreakdownProfile"), dict):
            entry["costBreakdownProfile"] = deepcopy(values["costBreakdownProfile"])

        if source_url:
            entry["statementSourceUrl"] = source_url
        if source_label:
            entry["statementSource"] = source_label
        financials[quarter] = entry

    return AdapterResult(
        adapter_id="supplemental_components",
        kind="statement",
        label="Supplemental structured components",
        priority=84,
        payload={"financials": financials},
        field_priorities=FIELD_PRIORITIES,
        enabled=bool(financials),
    )

