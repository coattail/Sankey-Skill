from __future__ import annotations

import re
from typing import Any


STATEMENT_FIELDS: tuple[str, ...] = (
    "revenueBn",
    "costOfRevenueBn",
    "grossProfitBn",
    "sgnaBn",
    "rndBn",
    "otherOpexBn",
    "operatingExpensesBn",
    "operatingIncomeBn",
    "nonOperatingBn",
    "pretaxIncomeBn",
    "taxBn",
    "netIncomeBn",
)


BREAKDOWN_TAXONOMY: dict[str, dict[str, dict[str, Any]]] = {
    "cost": {
        "products": {
            "aliases": ("products", "product", "costproducts", "costofgoods", "costofgoodssold", "merchandise", "materials", "manufacturing"),
            "name": "Products",
            "nameZh": "产品",
        },
        "services": {
            "aliases": ("services", "service", "costservices", "costofservices", "subscription", "cloud", "content", "platform"),
            "name": "Services",
            "nameZh": "服务",
        },
        "traffic_acquisition_cost": {
            "aliases": ("tac", "trafficacquisitioncost", "traffic acquisition cost"),
            "name": "TAC",
            "nameZh": "流量获取成本",
        },
        "other_cost": {
            "aliases": ("othercost", "other cost"),
            "name": "Other cost",
            "nameZh": "其他成本",
        },
    },
    "opex": {
        "sales_marketing": {
            "aliases": ("salesmarketing", "sales & marketing", "sellingmarketing", "marketing", "sm", "sellingexpense", "sellingexpenses", "salesdistribution", "sellingdistribution", "advertising", "promotion"),
            "name": "Sales & Marketing",
            "nameZh": "销售与营销",
        },
        "general_administrative": {
            "aliases": ("ga", "g&a", "generaladministrative", "administrative", "administrativeexpense", "administrativeexpenses", "generaladministrativeexpense", "corporate", "corporateoverhead", "sharedservices"),
            "name": "G&A",
            "nameZh": "管理费用",
        },
        "rnd": {
            "aliases": ("rnd", "r&d", "researchdevelopment", "research and development", "r&dexpense", "researchdevelopmentexpense", "productdevelopment", "engineering", "technologydevelopment"),
            "name": "R&D",
            "nameZh": "研发",
        },
        "taxes_surcharges": {
            "aliases": ("taxesandsurcharges", "taxessurcharges", "taxes surcharge", "taxessurcharge", "taxesandlevies", "levies"),
            "name": "Taxes & Surcharges",
            "nameZh": "税金及附加",
        },
        "finance_expense": {
            "aliases": ("financeexpense", "finance expense", "net finance expense", "financecosts", "interestexpense", "interestandotherexpense", "borrowingcosts", "财务费用"),
            "name": "Finance Expense",
            "nameZh": "财务费用",
        },
        "fulfillment": {
            "aliases": ("fulfillment", "logistics", "shipping", "delivery", "warehousing"),
            "name": "Fulfillment",
            "nameZh": "履约",
        },
        "technology_content": {
            "aliases": ("technologycontent", "technology & content", "content technology"),
            "name": "Technology & Content",
            "nameZh": "技术与内容",
        },
        "restructuring": {
            "aliases": ("restructuring", "realignment", "integration", "transformation", "reorganization"),
            "name": "Restructuring",
            "nameZh": "重组费用",
        },
        "impairment": {
            "aliases": ("impairment", "creditimpairment", "assetimpairment", "creditimpairmentloss", "assetimpairmentloss", "writeoff", "writedown"),
            "name": "Impairment",
            "nameZh": "减值",
        },
        "other_opex": {
            "aliases": ("otheropex", "other opex", "other operating expenses"),
            "name": "Other opex",
            "nameZh": "其他经营费用",
        },
    },
}

BREAKDOWN_REJECT_TOKENS: tuple[str, ...] = (
    "total",
    "subtotal",
    "operatingincome",
    "pretaxincome",
    "incomebeforetax",
    "netincome",
    "earningspershare",
    "dilutedeps",
    "basiceps",
    "dividendsdeclared",
    "weightedaverage",
    "sharesoutstanding",
)

BREAKDOWN_KEYWORD_RULES: dict[str, dict[str, tuple[str, ...]]] = {
    "cost": {
        "products": ("hardware", "device", "equipment", "handset", "merchandise", "materials", "manufacturing", "productcost"),
        "services": ("service", "subscription", "cloud", "content", "platform", "support", "deliveryservice"),
        "traffic_acquisition_cost": ("trafficacquisition", "distributionpartner", "partnerfees", "contentacquisition"),
    },
    "opex": {
        "sales_marketing": ("salesanddistribution", "sellinganddistribution", "customeracquisition", "advertising", "promotion", "brandmarketing", "commercial"),
        "general_administrative": ("generalcorporate", "corporateoverhead", "sharedservices", "backoffice", "officeexpense", "administration"),
        "rnd": ("research", "development", "engineering", "productdevelopment", "technologydevelopment"),
        "taxes_surcharges": ("taxesandlevies", "surcharges", "levies"),
        "finance_expense": ("financecost", "interestexpense", "borrowingcost", "netinterest", "interestandotherexpense"),
        "fulfillment": ("shipping", "delivery", "logistics", "warehousing", "distributioncenter"),
        "restructuring": ("restructuring", "realignment", "integration", "reorganization", "transformation"),
        "impairment": ("impairment", "creditloss", "assetwriteoff", "writedown"),
    },
}


def normalize_key(value: Any) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", str(value or "").strip().lower())


def normalize_member_key(value: Any) -> str:
    normalized = normalize_key(value)
    if normalized.endswith("member"):
        normalized = normalized[:-6]
    if normalized.endswith("segment"):
        normalized = normalized[:-7]
    return normalized


def _candidate_texts(raw: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("name", "nameZh", "memberKey", "targetName"):
        value = raw.get(key)
        if value:
            values.append(str(value))
    for key in ("supportLines", "supportLinesZh"):
        payload = raw.get(key)
        if isinstance(payload, list):
            values.extend(str(item) for item in payload if item)
    return values


def _is_reject_breakdown_label(raw: dict[str, Any]) -> bool:
    for text in _candidate_texts(raw):
        normalized = normalize_key(text)
        if any(token in normalized for token in BREAKDOWN_REJECT_TOKENS):
            return True
    return False


def _keyword_taxonomy_entry(kind: str, texts: list[str]) -> tuple[str, dict[str, Any]] | tuple[None, None]:
    scored: list[tuple[int, str, dict[str, Any]]] = []
    normalized_texts = [normalize_key(text) for text in texts if normalize_key(text)]
    for taxonomy_id, keywords in BREAKDOWN_KEYWORD_RULES.get(kind, {}).items():
        config = BREAKDOWN_TAXONOMY.get(kind, {}).get(taxonomy_id) or {}
        score = 0
        for normalized in normalized_texts:
            for keyword in keywords:
                keyword_key = normalize_key(keyword)
                if keyword_key and keyword_key in normalized:
                    score += 1
        if score > 0:
            scored.append((score, taxonomy_id, config))
    if not scored:
        return None, None
    scored.sort(key=lambda item: (-item[0], item[1]))
    return scored[0][1], scored[0][2]


def _taxonomy_entry(kind: str, raw_name: Any, *, raw: dict[str, Any] | None = None) -> tuple[str, dict[str, Any]] | tuple[None, None]:
    texts = [str(raw_name or "")]
    if isinstance(raw, dict):
        texts.extend(_candidate_texts(raw))
    normalized_values = [normalize_key(text) for text in texts if normalize_key(text)]
    for taxonomy_id, config in BREAKDOWN_TAXONOMY.get(kind, {}).items():
        aliases = {normalize_key(alias) for alias in config.get("aliases", ())}
        aliases.add(normalize_key(config.get("name")))
        aliases.add(normalize_key(config.get("nameZh")))
        if any(normalized in aliases for normalized in normalized_values):
            return taxonomy_id, config
    return _keyword_taxonomy_entry(kind, texts)


def _merge_support_lines(current: Any, incoming: Any) -> list[str] | None:
    merged: list[str] = []
    for payload in (current, incoming):
        if isinstance(payload, list):
            for item in payload:
                text = str(item or "").strip()
                if text and text not in merged:
                    merged.append(text)
    return merged or None


def normalize_breakdown_items(kind: str, items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    merged: dict[str, dict[str, Any]] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        if _is_reject_breakdown_label(raw):
            continue
        value_bn = raw.get("valueBn")
        if not isinstance(value_bn, (int, float)) or isinstance(value_bn, bool):
            continue
        display_name = raw.get("name") or raw.get("nameZh") or raw.get("memberKey")
        taxonomy_id, config = _taxonomy_entry(kind, display_name, raw=raw)
        normalized_id = taxonomy_id or normalize_member_key(raw.get("memberKey") or display_name)
        if not normalized_id:
            continue
        target = merged.get(normalized_id)
        base = {
            "taxonomyId": normalized_id,
            "name": (config or {}).get("name") or raw.get("name") or display_name,
            "nameZh": (config or {}).get("nameZh") or raw.get("nameZh"),
            "memberKey": normalize_member_key(raw.get("memberKey") or display_name),
            "valueBn": round(float(value_bn), 3),
            "sourceUrl": raw.get("sourceUrl"),
            "sourceForm": raw.get("sourceForm"),
            "filingDate": raw.get("filingDate"),
            "metricMode": raw.get("metricMode"),
            "supportLines": raw.get("supportLines"),
            "supportLinesZh": raw.get("supportLinesZh"),
            "provenance": raw.get("provenance"),
        }
        if target is None:
            merged[normalized_id] = base
            continue
        if taxonomy_id:
            target["valueBn"] = round(float(target.get("valueBn") or 0) + float(base["valueBn"]), 3)
            target["supportLines"] = _merge_support_lines(target.get("supportLines"), base.get("supportLines"))
            target["supportLinesZh"] = _merge_support_lines(target.get("supportLinesZh"), base.get("supportLinesZh"))
            if not target.get("sourceUrl") and base.get("sourceUrl"):
                target["sourceUrl"] = base.get("sourceUrl")
            if not target.get("sourceForm") and base.get("sourceForm"):
                target["sourceForm"] = base.get("sourceForm")
            if not target.get("filingDate") and base.get("filingDate"):
                target["filingDate"] = base.get("filingDate")
            continue
        if float(base["valueBn"]) > float(target.get("valueBn") or 0):
            merged[normalized_id] = base
    return sorted(merged.values(), key=lambda item: (-float(item.get("valueBn") or 0), str(item.get("taxonomyId") or "")))


def normalize_revenue_segments(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: dict[str, dict[str, Any]] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        value_bn = raw.get("valueBn")
        if not isinstance(value_bn, (int, float)) or isinstance(value_bn, bool):
            continue
        member_key = normalize_member_key(raw.get("memberKey") or raw.get("name") or raw.get("nameZh"))
        if not member_key:
            continue
        item = {
            "name": raw.get("name"),
            "nameZh": raw.get("nameZh"),
            "memberKey": member_key,
            "valueBn": round(float(value_bn), 3),
            "yoyPct": raw.get("yoyPct"),
            "qoqPct": raw.get("qoqPct"),
            "mixPct": raw.get("mixPct"),
            "mixYoyDeltaPp": raw.get("mixYoyDeltaPp"),
            "sourceUrl": raw.get("sourceUrl"),
            "sourceForm": raw.get("sourceForm"),
            "filingDate": raw.get("filingDate"),
            "supportLines": raw.get("supportLines"),
            "supportLinesZh": raw.get("supportLinesZh"),
            "metricMode": raw.get("metricMode"),
            "targetName": raw.get("targetName"),
            "provenance": raw.get("provenance"),
        }
        current = normalized.get(member_key)
        if current is None or float(item["valueBn"]) > float(current.get("valueBn") or 0):
            normalized[member_key] = item
    return sorted(normalized.values(), key=lambda item: (-float(item.get("valueBn") or 0), str(item.get("memberKey") or "")))
