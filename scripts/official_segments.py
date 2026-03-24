from __future__ import annotations

import json
import re
import socket
import time
import urllib.error
import urllib.request
from http.client import IncompleteRead, RemoteDisconnected
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "official-segments"
SEC_TICKER_CACHE: dict[str, int] | None = None
MIN_FILING_DATE = "2017-01-01"
MIN_CALENDAR_QUARTER = (2018, 1)
CACHE_VERSION = "20260321-v2"

SEC_HEADERS = {
    "User-Agent": "Codex/official-segments yuwan@example.com",
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}

ALLOWED_FORMS = {"10-Q", "10-K", "20-F", "6-K"}
REVENUE_TAG_PRIORITY = {
    "RevenueFromContractWithCustomerExcludingAssessedTax": 120,
    "RevenueFromContractWithCustomerIncludingAssessedTax": 118,
    "RevenuesNetOfInterestExpense": 116,
    "RevenuesNetOfInterestExpenseFullTaxEquivalentBasis": 116,
    "NetRevenues": 114,
    "SalesRevenueNet": 112,
    "SalesRevenueServicesNet": 110,
    "SalesRevenueGoodsNet": 109,
    "Revenues": 108,
    "Revenue": 106,
    "OperatingRevenue": 104,
    "OperatingRevenueNet": 102,
    "TotalRevenue": 100,
    "NetSales": 98,
}

BUSINESS_AXIS_HINTS = (
    "statementbusinesssegmentsaxis",
    "operatingsegmentsaxis",
    "businesssegmentsaxis",
    "lineofbusinessaxis",
    "reportablesegmentsaxis",
    "segmentaxis",
)
PRODUCT_AXIS_HINTS = (
    "productorserviceaxis",
    "classesofbusinessesaxis",
    "classesofbusinessaxis",
    "majorproductlinesaxis",
    "applicationaxis",
    "enduseaxis",
    "technologyaxis",
    "platformaxis",
)
IGNORED_DIMENSIONS = {
    "consolidationitemsaxis",
    "statementscenarioaxis",
}
GENERIC_MEMBERS = {
    "operatingsegmentsmember",
    "businesssegmentsmember",
    "productmember",
    "serviceothermember",
    "serviceMember".lower(),
    "consolidatedentitiesmember",
    "allothersegmentsmember",
}
GENERIC_PRODUCT_MEMBERS = {
    "productmember",
    "productsmember",
}
GENERIC_SERVICE_MEMBERS = {
    "servicemember",
    "servicesmember",
    "serviceothermember",
}
GEOGRAPHIC_LABEL_HINTS = (
    "americas",
    "asia pacific",
    "canada",
    "china",
    "domestic",
    "emea",
    "europe",
    "foreign",
    "greater china",
    "international",
    "japan",
    "latin america",
    "north america",
    "rest of asia pacific",
    "rest of world",
    "south america",
    "united states",
    "worldwide",
)
GEOGRAPHIC_TOKENS = {
    "americas",
    "america",
    "north",
    "south",
    "east",
    "west",
    "international",
    "europe",
    "asia",
    "pacific",
    "greater",
    "china",
    "japan",
    "domestic",
    "foreign",
    "world",
    "worldwide",
    "global",
    "region",
    "regions",
    "rest",
    "of",
    "the",
    "united",
    "states",
    "us",
    "canada",
    "latin",
    "emea",
    "apac",
}


@dataclass
class SegmentFact:
    accession: str
    filing_date: str
    form: str
    concept: str
    concept_priority: int
    axis_key: str
    axis_priority: int
    member_key: str
    label: str
    start_date: str
    end_date: str
    value: float
    source_url: str

    @property
    def day_span(self) -> int:
        start = date.fromisoformat(self.start_date)
        end = date.fromisoformat(self.end_date)
        return (end - start).days + 1


def _request(url: str) -> bytes:
    last_error: Exception | None = None
    for attempt in range(5):
        request = urllib.request.Request(url, headers=SEC_HEADERS)
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read()
        except (
            IncompleteRead,
            RemoteDisconnected,
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            ConnectionResetError,
            socket.timeout,
        ) as exc:
            last_error = exc
            time.sleep(0.8 * (attempt + 1))
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Unable to fetch {url}")


def _request_json(url: str) -> Any:
    return json.loads(_request(url).decode("utf-8", errors="ignore"))


def _cache_path(name: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / name


def _load_cached_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_cached_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize_ticker(ticker: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(ticker or "").upper())


def _local_name(qname: str) -> str:
    if not qname:
        return ""
    return qname.split(":", 1)[-1]


def _prettify_member_name(raw: str) -> str:
    lowered_raw = str(raw or "").lower()
    if lowered_raw == "servicemember":
        return "Services"
    if lowered_raw == "productmember":
        return "Products"
    label = re.sub(r"(Member|Segment)$", "", raw)
    label = re.sub(r"([A-Za-z])and([A-Z])", r"\1And\2", label)
    label = label.replace("ThreeSixFive", "365")
    label = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", label)
    label = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", label)
    label = label.replace(" And ", " & ")
    label = re.sub(r"\bUs\b", "US", label)
    label = re.sub(r"\bUk\b", "UK", label)
    label = re.sub(r"\bIot\b", "IoT", label)
    label = re.sub(r"\bAi\b", "AI", label)
    label = re.sub(r"\bI Phone\b", "iPhone", label)
    label = re.sub(r"\bI Pad\b", "iPad", label)
    label = re.sub(r"\s+", " ", label).strip()
    return label or raw


def _canonical_segment_label(label: str) -> str:
    normalized = re.sub(r"\bSegment\b", "", label).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def _canonical_segment_key(label: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "", _canonical_segment_label(label)).lower()


def _group_signature_tokens(label: str) -> list[str]:
    normalized = _canonical_segment_label(label).lower().replace("&", " and ")
    tokens = [token for token in re.split(r"[^a-z0-9]+", normalized) if token]
    normalized_tokens: list[str] = []
    for token in tokens:
        if token in {"and", "seg", "segment", "segments", "member"}:
            continue
        if len(token) in {4, 5} and token.endswith("s") and token not in {"news", "this", "us"}:
            token = token[:-1]
        normalized_tokens.append(token)
    return sorted(dict.fromkeys(normalized_tokens))


def _fact_group_key(fact: SegmentFact) -> str:
    label = fact.label or _prettify_member_name(fact.member_key)
    tokens = _group_signature_tokens(label)
    if tokens:
        return "|".join(tokens)
    canonical = _canonical_segment_key(label)
    return canonical or str(fact.member_key or "").strip()


def _calendar_quarter(period_end: str) -> str | None:
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", period_end)
    if not match:
        return None
    year = int(match.group(1))
    month = int(match.group(2))
    quarter = (month - 1) // 3 + 1
    return f"{year}Q{quarter}"


def _period_key(period: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d{4})Q([1-4])", period)
    if not match:
        return (0, 0)
    return (int(match.group(1)), int(match.group(2)))


def _expected_period_span(first_period: str, last_period: str) -> int:
    first_year, first_quarter = _period_key(first_period)
    last_year, last_quarter = _period_key(last_period)
    if not first_year or not last_year:
        return 0
    return (last_year - first_year) * 4 + (last_quarter - first_quarter) + 1


def _revenue_priority(concept: str) -> int:
    if concept in REVENUE_TAG_PRIORITY:
        return REVENUE_TAG_PRIORITY[concept]
    normalized = concept.lower()
    if normalized.endswith("revenues") or normalized.endswith("revenue"):
        return 70
    return -1


def _axis_kind(axis_key: str) -> str:
    lowered = str(axis_key or "").lower()
    if any(hint in lowered for hint in PRODUCT_AXIS_HINTS):
        return "product"
    if any(hint in lowered for hint in BUSINESS_AXIS_HINTS):
        return "business"
    if "segment" in lowered or "business" in lowered:
        return "business"
    return "other"


def _normalized_member_label(member_key: str) -> str:
    label = _canonical_segment_label(_prettify_member_name(member_key)).lower()
    label = label.replace("&", " and ")
    label = re.sub(r"[^a-z0-9]+", " ", label)
    return re.sub(r"\s+", " ", label).strip()


def _is_aggregate_like_label(label: str) -> bool:
    normalized = _normalized_member_label(label)
    if not normalized:
        return False
    if normalized in {"primary", "primary segment", "reportable", "reportable segment"}:
        return True
    aggregate_hints = (
        "aggregation before other operating",
        "reportable aggregation",
        "segment aggregation",
        "business segments",
        "operating segments",
        "consolidated",
        "total company",
        "total segment",
    )
    return any(hint in normalized for hint in aggregate_hints)


def _member_token_set(label: str) -> set[str]:
    normalized = _normalized_member_label(label)
    return {token for token in normalized.split() if token not in {"and", "other", "services", "service"}}


def _is_combined_member_label(label: str, all_labels: list[str]) -> bool:
    normalized = _normalized_member_label(label)
    if " and " not in normalized:
        return False
    label_tokens = _member_token_set(label)
    if len(label_tokens) < 2:
        return False
    overlaps = 0
    for other in all_labels:
        if other == label or _is_aggregate_like_label(other):
            continue
        other_tokens = _member_token_set(other)
        if other_tokens and other_tokens.issubset(label_tokens) and other_tokens != label_tokens:
            overlaps += 1
        if overlaps >= 2:
            return True
    return False


def _is_geographic_member(member_key: str) -> bool:
    label = _normalized_member_label(member_key)
    if not label:
        return False
    if any(hint in label for hint in GEOGRAPHIC_LABEL_HINTS):
        return True
    tokens = set(label.split())
    return bool(tokens) and tokens.issubset(GEOGRAPHIC_TOKENS)


def _should_drop_generic_member(member_key: str, all_members: set[str]) -> bool:
    lowered = str(member_key or "").lower()
    normalized_members = {str(item or "").lower() for item in all_members}

    if lowered in {"businesssegmentsmember", "operatingsegmentsmember", "consolidatedentitiesmember"}:
        return True

    if lowered in GENERIC_PRODUCT_MEMBERS:
        specific_members = normalized_members - GENERIC_PRODUCT_MEMBERS - GENERIC_SERVICE_MEMBERS
        return len(specific_members) >= 2

    if lowered in GENERIC_SERVICE_MEMBERS:
        specific_service_members = {
            item
            for item in normalized_members - GENERIC_SERVICE_MEMBERS
            if (
                "service" in item
                or "cloud" in item
                or "subscription" in item
                or "seller" in item
                or "advertising" in item
                or "webservices" in item
            )
        }
        return bool(specific_service_members)

    return False


def _select_axis(members: list[tuple[str, str]]) -> tuple[str, int, str] | None:
    meaningful: list[tuple[str, str]] = []
    for dimension, member in members:
        local_dimension = _local_name(dimension)
        local_member = _local_name(member)
        if not local_dimension or not local_member:
            continue
        if local_dimension.lower() in IGNORED_DIMENSIONS:
            continue
        meaningful.append((local_dimension, local_member))
    if not meaningful:
        return None

    best_dimension = ""
    best_priority = -1
    primary_member = ""
    for local_dimension, local_member in meaningful:
        lowered_dimension = local_dimension.lower()
        if any(hint in lowered_dimension for hint in BUSINESS_AXIS_HINTS):
            priority = 100
        elif any(hint in lowered_dimension for hint in PRODUCT_AXIS_HINTS):
            priority = 80
        elif "segment" in lowered_dimension or "business" in lowered_dimension:
            priority = 60
        else:
            priority = 0
        if priority > best_priority:
            best_priority = priority
            best_dimension = local_dimension
            primary_member = local_member

    if best_priority <= 0:
        return None

    dimension_members = [member for dimension, member in meaningful if dimension == best_dimension]
    non_generic_members = [member for member in dimension_members if member.lower() not in GENERIC_MEMBERS]
    non_dropped_members = [member for member in non_generic_members if not _should_drop_generic_member(member, set(dimension_members))]
    non_geographic_members = [member for member in non_dropped_members if not _is_geographic_member(member)]
    candidate_members = non_geographic_members or non_dropped_members or non_generic_members or dimension_members
    if candidate_members:
        primary_member = candidate_members[-1]
    return (best_dimension, best_priority, primary_member)


def _choose_instance_name(index_payload: dict[str, Any]) -> str | None:
    items = [item.get("name", "") for item in index_payload.get("directory", {}).get("item", [])]
    preferred = [name for name in items if name.endswith("_htm.xml")]
    if preferred:
        return preferred[0]
    fallback = [
        name
        for name in items
        if name.endswith(".xml")
        and "lab" not in name.lower()
        and "def" not in name.lower()
        and "pre" not in name.lower()
        and "filingsummary" not in name.lower()
        and "metalink" not in name.lower()
    ]
    return fallback[0] if fallback else None


def _parse_instance_facts(cik: int, accession: str, filing_date: str, form: str, instance_name: str) -> list[SegmentFact]:
    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{instance_name}"
    xml_bytes = _request(url)
    root = ET.fromstring(xml_bytes)
    ns = {"xbrli": "http://www.xbrl.org/2003/instance", "xbrldi": "http://xbrl.org/2006/xbrldi"}

    contexts: dict[str, tuple[str, str, list[tuple[str, str]]]] = {}
    for context in root.findall("xbrli:context", ns):
        context_id = context.attrib.get("id")
        if not context_id:
            continue
        start = context.findtext("xbrli:period/xbrli:startDate", default="", namespaces=ns)
        end = context.findtext("xbrli:period/xbrli:endDate", default="", namespaces=ns)
        if not start or not end:
            continue
        members = [(member.attrib.get("dimension", ""), member.text or "") for member in context.findall(".//xbrldi:explicitMember", ns)]
        contexts[context_id] = (start, end, members)

    facts: list[SegmentFact] = []
    for child in root:
        context_ref = child.attrib.get("contextRef")
        if not context_ref or context_ref not in contexts:
            continue
        concept = child.tag.split("}")[-1]
        concept_priority = _revenue_priority(concept)
        if concept_priority < 0:
            continue
        value_text = (child.text or "").strip()
        if not value_text:
            continue
        try:
            value = float(value_text)
        except ValueError:
            continue
        start_date, end_date, members = contexts[context_ref]
        axis = _select_axis(members)
        if axis is None:
            continue
        axis_key, axis_priority, member_key = axis
        if not member_key:
            continue
        facts.append(
            SegmentFact(
                accession=accession,
                filing_date=filing_date,
                form=form,
                concept=concept,
                concept_priority=concept_priority,
                axis_key=axis_key,
                axis_priority=axis_priority,
                member_key=member_key,
                label=_prettify_member_name(member_key),
                start_date=start_date,
                end_date=end_date,
                value=value,
                source_url=url,
            )
        )
    return facts


def _pick_best_axis(facts: list[SegmentFact]) -> str | None:
    axis_stats: dict[str, dict[str, Any]] = {}
    for fact in facts:
        stats = axis_stats.setdefault(
            fact.axis_key,
            {
                "axis_priority": fact.axis_priority,
                "members": set(),
                "periods": set(),
                "score": 0,
                "kind": _axis_kind(fact.axis_key),
            },
        )
        stats["members"].add(fact.member_key)
        stats["periods"].add(fact.end_date)
        stats["score"] += fact.concept_priority

    ranked = sorted(
        axis_stats.items(),
        key=lambda item: (
            (
                item[1]["axis_priority"]
                + (
                    28
                    if item[1]["kind"] == "product"
                    and len(
                        {
                            member
                            for member in item[1]["members"]
                            if not _should_drop_generic_member(member, item[1]["members"])
                        }
                    )
                    >= 3
                    and sum(1 for member in item[1]["members"] if _is_geographic_member(member)) == 0
                    else 0
                )
                + (
                    12
                    if item[1]["kind"] == "business"
                    and len(
                        {
                            member
                            for member in item[1]["members"]
                            if not _should_drop_generic_member(member, item[1]["members"])
                        }
                    )
                    >= 2
                    and sum(1 for member in item[1]["members"] if _is_geographic_member(member)) == 0
                    else 0
                )
                - (
                    90
                    if item[1]["members"]
                    and sum(1 for member in item[1]["members"] if _is_geographic_member(member)) / len(item[1]["members"]) >= 0.95
                    else 70
                    if item[1]["members"]
                    and sum(1 for member in item[1]["members"] if _is_geographic_member(member)) / len(item[1]["members"]) >= 0.66
                    else 36
                    if item[1]["members"]
                    and sum(1 for member in item[1]["members"] if _is_geographic_member(member)) / len(item[1]["members"]) >= 0.4
                    else 0
                )
                - (
                    18
                    if len(
                        {
                            member
                            for member in item[1]["members"]
                            if not _should_drop_generic_member(member, item[1]["members"])
                        }
                    )
                    < 2
                    else 0
                )
                - (sum(1 for member in item[1]["members"] if _is_aggregate_like_label(member)) * 18)
                - (10 if len(item[1]["members"]) > 12 else 0)
            ),
            len(item[1]["periods"]),
            1
            if 2
            <= len(
                {
                    member
                    for member in item[1]["members"]
                    if not _should_drop_generic_member(member, item[1]["members"])
                }
            )
            <= 8
            else 0,
            len(
                {
                    member
                    for member in item[1]["members"]
                    if not _should_drop_generic_member(member, item[1]["members"])
                }
            ),
            item[1]["score"],
        ),
        reverse=True,
    )
    return ranked[0][0] if ranked else None


def _parse_iso_date(value: str) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _filing_lag_days(filing_date: str, end_date: str) -> int | None:
    filing = _parse_iso_date(filing_date)
    end = _parse_iso_date(end_date)
    if filing is None or end is None:
        return None
    return (filing - end).days


def _form_preference(form: str, day_span: int) -> int:
    normalized = str(form or "").upper().replace(" ", "")
    quarter_forms = {"10-Q", "10Q", "6-K", "6K"}
    annual_forms = {"10-K", "10K", "20-F", "20F", "40-F", "40F"}
    is_quarter_span = 45 <= day_span <= 120
    if is_quarter_span:
        if normalized in quarter_forms:
            return 3
        if normalized in annual_forms:
            return 2
        return 1
    if normalized in annual_forms:
        return 3
    if normalized in quarter_forms:
        return 2
    return 1


def _fact_quality_tuple(fact: SegmentFact) -> tuple[int, int, int, int, int, str]:
    lag_days = _filing_lag_days(fact.filing_date, fact.end_date)
    if lag_days is None:
        lag_bucket = 1
        lag_closeness = -9999
    elif lag_days < -2:
        lag_bucket = 0
        lag_closeness = -9999
    elif lag_days <= 220:
        lag_bucket = 5
        lag_closeness = -abs(lag_days - 45)
    elif lag_days <= 450:
        lag_bucket = 4
        lag_closeness = -abs(lag_days - 120)
    elif lag_days <= 720:
        lag_bucket = 3
        lag_closeness = -abs(lag_days - 240)
    else:
        lag_bucket = 2
        lag_closeness = -abs(lag_days - 360)
    return (
        int(fact.concept_priority),
        int(_form_preference(fact.form, fact.day_span)),
        lag_bucket,
        lag_closeness,
        -abs(int(fact.day_span) - 91),
        str(fact.filing_date),
    )


def _dedupe_facts(facts: list[SegmentFact]) -> list[SegmentFact]:
    best: dict[tuple[str, str, str, str], SegmentFact] = {}
    for fact in facts:
        key = (fact.member_key, fact.start_date, fact.end_date, fact.concept)
        current = best.get(key)
        if current is None or _fact_quality_tuple(fact) > _fact_quality_tuple(current):
            best[key] = fact
    return list(best.values())


def _build_quarterly_series(facts: list[SegmentFact]) -> dict[str, list[dict[str, Any]]]:
    facts = _dedupe_facts(facts)
    by_member: dict[str, list[SegmentFact]] = defaultdict(list)
    label_map: dict[str, str] = {}
    raw_members_by_group: dict[str, set[str]] = defaultdict(set)
    for fact in facts:
        group_key = _fact_group_key(fact)
        if not group_key:
            continue
        by_member[group_key].append(fact)
        raw_members_by_group[group_key].add(str(fact.member_key or ""))
        existing_label = label_map.get(group_key)
        if existing_label is None or len(str(fact.label or "")) > len(existing_label or ""):
            label_map[group_key] = fact.label

    all_members = {member for members in raw_members_by_group.values() for member in members}
    filtered_member_keys = [
        member_key
        for member_key in by_member
        if not all(_should_drop_generic_member(raw_member, all_members) for raw_member in raw_members_by_group.get(member_key, {member_key}))
    ]

    quarter_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for member_key in filtered_member_keys:
        member_facts = by_member[member_key]
        direct: dict[str, SegmentFact] = {}
        cumulative_by_end: dict[str, SegmentFact] = {}
        for fact in sorted(member_facts, key=lambda item: (item.end_date, item.day_span, item.filing_date, item.concept_priority)):
            span = fact.day_span
            if 45 <= span <= 120:
                existing = direct.get(fact.end_date)
                if existing is None or _fact_quality_tuple(fact) > _fact_quality_tuple(existing):
                    direct[fact.end_date] = fact
            elif 121 <= span <= 390:
                existing = cumulative_by_end.get(fact.end_date)
                if existing is None or _fact_quality_tuple(fact) > _fact_quality_tuple(existing):
                    cumulative_by_end[fact.end_date] = fact

        derived: dict[str, SegmentFact] = dict(direct)
        changed = True
        while changed:
            changed = False
            for fact in sorted(cumulative_by_end.values(), key=lambda item: (item.end_date, item.day_span)):
                if fact.end_date in derived:
                    continue
                covered = [
                    entry
                    for entry in derived.values()
                    if entry.start_date >= fact.start_date and entry.end_date < fact.end_date
                ]
                expected = max(round(fact.day_span / 91) - 1, 1)
                if len(covered) != expected:
                    continue
                derived_value = fact.value - sum(item.value for item in covered)
                last_end = max(date.fromisoformat(item.end_date) for item in covered)
                derived_start = last_end + timedelta(days=1)
                derived[fact.end_date] = SegmentFact(
                    accession=fact.accession,
                    filing_date=fact.filing_date,
                    form=fact.form,
                    concept=f"{fact.concept}:derived",
                    concept_priority=fact.concept_priority - 1,
                    axis_key=fact.axis_key,
                    axis_priority=fact.axis_priority,
                    member_key=fact.member_key,
                    label=fact.label,
                    start_date=derived_start.isoformat(),
                    end_date=fact.end_date,
                    value=derived_value,
                    source_url=fact.source_url,
                )
                changed = True

        for end_date, fact in sorted(derived.items()):
            quarter = _calendar_quarter(end_date)
            if not quarter or _period_key(quarter) < MIN_CALENDAR_QUARTER:
                continue
            quarter_rows[quarter].append(
                {
                    "name": _canonical_segment_label(label_map.get(member_key) or _prettify_member_name(member_key)),
                    "memberKey": _canonical_segment_key(label_map.get(member_key) or _prettify_member_name(member_key)),
                    "valueBn": round(fact.value / 1_000_000_000, 3),
                    "sourceUrl": fact.source_url,
                    "sourceForm": fact.form,
                    "filingDate": fact.filing_date,
                    "periodStart": fact.start_date,
                    "periodEnd": fact.end_date,
                    "_quality": list(_fact_quality_tuple(fact)),
                }
            )

    for quarter, rows in quarter_rows.items():
        deduped: dict[str, dict[str, Any]] = {}
        for row in rows:
            existing = deduped.get(row["memberKey"])
            row_quality = tuple(row.get("_quality") or ())
            existing_quality = tuple(existing.get("_quality") or ()) if existing else ()
            if existing is None or row_quality > existing_quality or (
                row_quality == existing_quality and (row["filingDate"], row["periodStart"]) > (existing["filingDate"], existing["periodStart"])
            ):
                deduped[row["memberKey"]] = row
        merged: list[dict[str, Any]] = []
        for row in deduped.values():
            match = next(
                (
                    item
                    for item in merged
                    if abs(float(item["valueBn"]) - float(row["valueBn"])) < 0.001
                    and (item["name"] in row["name"] or row["name"] in item["name"])
                ),
                None,
            )
            if match is None:
                merged.append(row)
                continue
            preferred = row if len(str(row["name"])) > len(str(match["name"])) else match
            match.update(preferred)
        labels = [str(item.get("name") or "") for item in merged]
        cleaned = [item for item in merged if float(item.get("valueBn") or 0) > 0.001]
        if len(cleaned) >= 3:
            non_aggregate_count = sum(1 for item in cleaned if not _is_aggregate_like_label(str(item.get("name") or "")))
            if non_aggregate_count >= 2:
                cleaned = [item for item in cleaned if not _is_aggregate_like_label(str(item.get("name") or ""))]
            combined_cleaned = [item for item in cleaned if not _is_combined_member_label(str(item.get("name") or ""), labels)]
            if combined_cleaned:
                cleaned = combined_cleaned
        quarter_rows[quarter] = sorted(
            [{key: value for key, value in item.items() if key != "_quality"} for item in cleaned],
            key=lambda item: item["valueBn"],
            reverse=True,
        )
    return quarter_rows


def _resolve_cik(ticker: str, refresh: bool) -> int | None:
    global SEC_TICKER_CACHE
    path = _cache_path("sec-company-tickers.json")
    if SEC_TICKER_CACHE is None:
        if path.exists() and not refresh:
            payload = _load_cached_json(path)
        else:
            payload = _request_json("https://www.sec.gov/files/company_tickers.json")
            _write_cached_json(path, payload)
        SEC_TICKER_CACHE = {
            _normalize_ticker(entry.get("ticker")): int(entry.get("cik_str"))
            for entry in payload.values()
            if isinstance(entry, dict) and entry.get("ticker")
        }
    if refresh and not path.exists():
        payload = _request_json("https://www.sec.gov/files/company_tickers.json")
        _write_cached_json(path, payload)
    return SEC_TICKER_CACHE.get(_normalize_ticker(ticker))


def _submission_records(submissions: dict[str, Any]) -> list[tuple[str, str, str, str]]:
    records: list[tuple[str, str, str, str]] = []
    recent = submissions.get("filings", {}).get("recent", {})
    records.extend(zip(recent.get("form", []), recent.get("accessionNumber", []), recent.get("filingDate", []), recent.get("primaryDocument", [])))
    for file_entry in submissions.get("filings", {}).get("files", []):
        name = file_entry.get("name")
        if not name:
            continue
        try:
            archived = _request_json(f"https://data.sec.gov/submissions/{name}")
        except Exception:
            continue
        records.extend(
            zip(
                archived.get("form", []),
                archived.get("accessionNumber", []),
                archived.get("filingDate", []),
                archived.get("primaryDocument", []),
            )
        )
    normalized: list[tuple[str, str, str, str]] = []
    for form, accession, filing_date, primary_document in records:
        normalized.append((str(form), str(accession), str(filing_date), str(primary_document)))
    return normalized


def fetch_official_segment_history(company: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    cache_name = f"{company['id']}.json"
    path = _cache_path(cache_name)
    if path.exists() and not refresh:
        cached_payload = _load_cached_json(path)
        if isinstance(cached_payload, dict) and cached_payload.get("_cacheVersion") == CACHE_VERSION:
            return cached_payload

    cik = _resolve_cik(str(company.get("ticker", "")), refresh=refresh)
    result = {
        "_cacheVersion": CACHE_VERSION,
        "source": "official-filings",
        "ticker": company.get("ticker"),
        "cik": cik,
        "axis": None,
        "quarters": {},
        "filingsUsed": [],
        "errors": [],
    }
    if cik is None:
        _write_cached_json(path, result)
        return result

    try:
        submissions = _request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"submissions: {exc}")
        _write_cached_json(path, result)
        return result

    facts: list[SegmentFact] = []
    records = _submission_records(submissions)
    seen_accessions: set[str] = set()
    for form, accession, filing_date, primary_document in records:
        if form not in ALLOWED_FORMS or filing_date < MIN_FILING_DATE:
            continue
        accession_nodash = str(accession).replace("-", "")
        if accession_nodash in seen_accessions:
            continue
        seen_accessions.add(accession_nodash)
        try:
            index_payload = _request_json(f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/index.json")
            instance_name = _choose_instance_name(index_payload)
            if not instance_name:
                continue
            filing_facts = _parse_instance_facts(cik, accession_nodash, filing_date, form, instance_name)
            if filing_facts:
                facts.extend(filing_facts)
                result["filingsUsed"].append(
                    {
                        "form": form,
                        "filingDate": filing_date,
                        "accession": accession,
                        "primaryDocument": primary_document,
                        "instance": instance_name,
                    }
                )
                best_axis_so_far = _pick_best_axis(facts)
                if best_axis_so_far:
                    provisional = _build_quarterly_series([fact for fact in facts if fact.axis_key == best_axis_so_far])
                    periods = sorted(provisional)
                    min_anchor_quarter = f"{MIN_CALENDAR_QUARTER[0]}Q{MIN_CALENDAR_QUARTER[1]}"
                    if periods and periods[0] <= min_anchor_quarter:
                        expected = _expected_period_span(min_anchor_quarter, periods[-1])
                        if expected and len(periods) >= expected:
                            break
            time.sleep(0.12)
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            ET.ParseError,
            TimeoutError,
            ValueError,
            socket.timeout,
        ) as exc:
            result["errors"].append(f"{form} {filing_date}: {exc}")
            continue

    best_axis = _pick_best_axis(facts)
    if best_axis is None:
        _write_cached_json(path, result)
        return result

    selected_facts = [fact for fact in facts if fact.axis_key == best_axis]
    result["axis"] = best_axis
    result["quarters"] = _build_quarterly_series(selected_facts)
    _write_cached_json(path, result)
    return result
