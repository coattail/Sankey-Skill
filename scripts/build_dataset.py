from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import requests
from pypdf import PdfReader

from official_financials import fetch_official_financial_history
from official_segments import fetch_official_segment_history
from official_revenue_structures import fetch_official_revenue_structure_history
from stockanalysis_financials import fetch_stockanalysis_financial_history
from company_logo_resolver import ensure_logo_catalog_entry


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
OUTPUT_PATH = DATA_DIR / "earnings-dataset.json"
MANUAL_PRESETS_PATH = DATA_DIR / "manual-presets.json"
OFFICIAL_SEGMENT_CACHE_DIR = DATA_DIR / "cache" / "official-segments"
OFFICIAL_REVENUE_STRUCTURE_CACHE_DIR = DATA_DIR / "cache" / "official-revenue-structures"
FX_CACHE_PATH = DATA_DIR / "cache" / "fx-rates.json"
COMPANY_CACHE_DIR = DATA_DIR / "cache"
PDF_TEXT_CACHE: dict[str, str] = {}

REFERENCE_UNIVERSE_SOURCE = {
    "label": "Reference coverage universe",
    "url": "https://www.stocktitan.net/market-cap/us-stocks/",
    "as_of": "2026-03-14",
    "note": "Legacy reference universe retained for compatibility testing; the standalone project itself supports arbitrary companies beyond this list.",
}

REFERENCE_COMPANIES: list[dict[str, Any]] = [
    {"id": "nvidia", "ticker": "NVDA", "nameZh": "英伟达", "nameEn": "NVIDIA", "slug": "nvda", "rank": 1, "isAdr": False, "brand": {"primary": "#76B900", "secondary": "#111827", "accent": "#E7F8BC"}},
    {"id": "apple", "ticker": "AAPL", "nameZh": "苹果", "nameEn": "Apple", "slug": "aapl", "rank": 2, "isAdr": False, "brand": {"primary": "#111827", "secondary": "#2563EB", "accent": "#DCEAFE"}},
    {"id": "alphabet", "ticker": "GOOGL", "nameZh": "谷歌", "nameEn": "Alphabet", "slug": "googl", "rank": 3, "isAdr": False, "brand": {"primary": "#2563EB", "secondary": "#DB4437", "accent": "#E8F0FE"}},
    {"id": "microsoft", "ticker": "MSFT", "nameZh": "微软", "nameEn": "Microsoft", "slug": "msft", "rank": 4, "isAdr": False, "brand": {"primary": "#0078D4", "secondary": "#107C10", "accent": "#DCEFFD"}},
    {"id": "amazon", "ticker": "AMZN", "nameZh": "亚马逊", "nameEn": "Amazon", "slug": "amzn", "rank": 5, "isAdr": False, "brand": {"primary": "#111827", "secondary": "#F59E0B", "accent": "#FEF3C7"}},
    {"id": "tsmc", "ticker": "TSM", "nameZh": "台积电", "nameEn": "TSMC", "slug": "tsm", "rank": 6, "isAdr": True, "brand": {"primary": "#B91C1C", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "meta", "ticker": "META", "nameZh": "Meta", "nameEn": "Meta", "slug": "meta", "rank": 7, "isAdr": False, "brand": {"primary": "#0866FF", "secondary": "#111827", "accent": "#DCEAFE"}},
    {"id": "broadcom", "ticker": "AVGO", "nameZh": "博通", "nameEn": "Broadcom", "slug": "avgo", "rank": 8, "isAdr": False, "brand": {"primary": "#C62828", "secondary": "#12263F", "accent": "#FCE7E7"}},
    {"id": "tesla", "ticker": "TSLA", "nameZh": "特斯拉", "nameEn": "Tesla", "slug": "tsla", "rank": 9, "isAdr": False, "brand": {"primary": "#DC2626", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "berkshire", "ticker": "BRK.B", "nameZh": "伯克希尔哈撒韦", "nameEn": "Berkshire Hathaway", "slug": "brk.b", "rank": 10, "isAdr": False, "brand": {"primary": "#4B5563", "secondary": "#111827", "accent": "#E5E7EB"}},
    {"id": "walmart", "ticker": "WMT", "nameZh": "沃尔玛", "nameEn": "Walmart", "slug": "wmt", "rank": 11, "isAdr": False, "brand": {"primary": "#0F6CBD", "secondary": "#F3B700", "accent": "#E0F2FE"}},
    {"id": "eli-lilly", "ticker": "LLY", "nameZh": "礼来", "nameEn": "Eli Lilly", "slug": "lly", "rank": 12, "isAdr": False, "brand": {"primary": "#D62828", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "jpmorgan", "ticker": "JPM", "nameZh": "摩根大通", "nameEn": "JPMorgan Chase", "slug": "jpm", "rank": 13, "isAdr": False, "brand": {"primary": "#1F3C88", "secondary": "#111827", "accent": "#DBEAFE"}},
    {"id": "exxon", "ticker": "XOM", "nameZh": "埃克森美孚", "nameEn": "Exxon Mobil", "slug": "xom", "rank": 14, "isAdr": False, "brand": {"primary": "#E51636", "secondary": "#111827", "accent": "#FCE7F3"}},
    {"id": "visa", "ticker": "V", "nameZh": "Visa", "nameEn": "Visa", "slug": "v", "rank": 15, "isAdr": False, "brand": {"primary": "#1434CB", "secondary": "#F7B600", "accent": "#DBEAFE"}},
    {"id": "jnj", "ticker": "JNJ", "nameZh": "强生", "nameEn": "Johnson & Johnson", "slug": "jnj", "rank": 16, "isAdr": False, "brand": {"primary": "#D61F2C", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "asml", "ticker": "ASML", "nameZh": "阿斯麦", "nameEn": "ASML", "slug": "asml", "rank": 17, "isAdr": True, "brand": {"primary": "#009FE3", "secondary": "#111827", "accent": "#E0F2FE"}},
    {"id": "oracle", "ticker": "ORCL", "nameZh": "甲骨文", "nameEn": "Oracle", "slug": "orcl", "rank": 18, "isAdr": False, "brand": {"primary": "#F80000", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "micron", "ticker": "MU", "nameZh": "美光科技", "nameEn": "Micron Technology", "slug": "mu", "rank": 19, "isAdr": False, "brand": {"primary": "#005EB8", "secondary": "#111827", "accent": "#DBEAFE"}},
    {"id": "costco", "ticker": "COST", "nameZh": "好市多", "nameEn": "Costco", "slug": "cost", "rank": 20, "isAdr": False, "brand": {"primary": "#E31837", "secondary": "#005DAA", "accent": "#FCE7F3"}},
    {"id": "mastercard", "ticker": "MA", "nameZh": "万事达卡", "nameEn": "Mastercard", "slug": "ma", "rank": 21, "isAdr": False, "brand": {"primary": "#EB001B", "secondary": "#F79E1B", "accent": "#FDF2D8"}},
    {"id": "abbvie", "ticker": "ABBV", "nameZh": "艾伯维", "nameEn": "AbbVie", "slug": "abbv", "rank": 22, "isAdr": False, "brand": {"primary": "#071D49", "secondary": "#3AB6C1", "accent": "#D9F5F6"}},
    {"id": "netflix", "ticker": "NFLX", "nameZh": "奈飞", "nameEn": "Netflix", "slug": "nflx", "rank": 23, "isAdr": False, "brand": {"primary": "#E50914", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "chevron", "ticker": "CVX", "nameZh": "雪佛龙", "nameEn": "Chevron", "slug": "cvx", "rank": 24, "isAdr": False, "brand": {"primary": "#005AAA", "secondary": "#D52B1E", "accent": "#DBEAFE"}},
    {"id": "palantir", "ticker": "PLTR", "nameZh": "Palantir", "nameEn": "Palantir", "slug": "pltr", "rank": 25, "isAdr": False, "brand": {"primary": "#111827", "secondary": "#64748B", "accent": "#E2E8F0"}},
    {"id": "procter-gamble", "ticker": "PG", "nameZh": "宝洁", "nameEn": "Procter & Gamble", "slug": "pg", "rank": 26, "isAdr": False, "brand": {"primary": "#0056A7", "secondary": "#111827", "accent": "#DBEAFE"}},
    {"id": "bank-of-america", "ticker": "BAC", "nameZh": "美国银行", "nameEn": "Bank of America", "slug": "bac", "rank": 27, "isAdr": False, "brand": {"primary": "#C41230", "secondary": "#1B365D", "accent": "#FCE7F3"}},
    {"id": "home-depot", "ticker": "HD", "nameZh": "家得宝", "nameEn": "Home Depot", "slug": "hd", "rank": 28, "isAdr": False, "brand": {"primary": "#F96302", "secondary": "#111827", "accent": "#FFEDD5"}},
    {"id": "coca-cola", "ticker": "KO", "nameZh": "可口可乐", "nameEn": "Coca-Cola", "slug": "ko", "rank": 29, "isAdr": False, "brand": {"primary": "#F40009", "secondary": "#111827", "accent": "#FEE2E2"}},
    {"id": "caterpillar", "ticker": "CAT", "nameZh": "卡特彼勒", "nameEn": "Caterpillar", "slug": "cat", "rank": 30, "isAdr": False, "brand": {"primary": "#FFCD11", "secondary": "#111827", "accent": "#FEF3C7"}},
    {"id": "tencent", "ticker": "TCEHY", "nameZh": "腾讯控股", "nameEn": "Tencent", "slug": "tcehy", "rank": 14.5, "isAdr": True, "brand": {"primary": "#1D9BF0", "secondary": "#111827", "accent": "#DBEEFF"}, "financialSource": "stockanalysis"},
    {"id": "alibaba", "ticker": "BABA", "nameZh": "阿里巴巴", "nameEn": "Alibaba", "slug": "baba", "rank": 30.5, "isAdr": True, "brand": {"primary": "#FF6A00", "secondary": "#111827", "accent": "#FFE7D1"}, "financialSource": "stockanalysis"},
]

BAR_SEGMENT_CANONICAL_BY_COMPANY: dict[str, dict[str, str]] = {
    "alphabet": {
        "googleinc": "googleservices",
        "googleservices": "googleservices",
        "allothersegments": "othersegments",
        "othersegments": "othersegments",
        "otherrevenue": "otherrevenue",
        "other": "otherrevenue",
    },
    "jnj": {
        "pharmaceutical": "innovativemedicine",
        "medicaldevices": "medtech",
        "medicaldevicesdiagnostics": "medtech",
    },
    "berkshire": {
        "serviceandretailingbusinesses": "serviceretailbusinesses",
        "serviceandretailbusinesses": "serviceretailbusinesses",
    },
    "tesla": {
        "automotive": "auto",
        "automotivebusiness": "auto",
        "automobile": "auto",
    },
    "costco": {
        "foodsundries": "foodssundries",
        "freshfood": "freshfoods",
    },
}

MICRON_LEGACY_SEGMENT_KEYS = {"cnbu", "mbu", "sbu", "ebu", "allothersegments"}
MICRON_CURRENT_SEGMENT_KEYS = {"cmbu", "mcbu", "cdbu", "aebu"}
MICRON_SCHEMA_CHANGE_QUARTER = "2025Q4"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the standalone earnings dataset from official filings.")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached SEC responses.")
    parser.add_argument(
        "--companies",
        type=str,
        default="",
        help="Optional comma-separated company ids, tickers, or slugs to refresh. Unspecified companies are kept from local cache when available.",
    )
    return parser.parse_args()


def parse_period(period: str) -> tuple[int, int]:
    if len(period) != 6 or period[4] != "Q":
        return (0, 0)
    try:
        return (int(period[:4]), int(period[5]))
    except ValueError:
        return (0, 0)


def parse_company_selection(raw: str) -> set[str]:
    tokens = {
        str(token or "").strip().lower()
        for token in str(raw or "").split(",")
        if str(token or "").strip()
    }
    return tokens


def company_matches_selection(company: dict[str, Any], selected_tokens: set[str]) -> bool:
    if not selected_tokens:
        return True
    candidates = {
        str(company.get("id") or "").strip().lower(),
        str(company.get("ticker") or "").strip().lower(),
        str(company.get("slug") or "").strip().lower(),
    }
    normalized_ticker = re.sub(r"[^a-z0-9]+", "", str(company.get("ticker") or "").lower())
    if normalized_ticker:
        candidates.add(normalized_ticker)
    return bool(candidates & selected_tokens)


def load_cached_company_payload(company_id: str) -> dict[str, Any] | None:
    path = COMPANY_CACHE_DIR / f"{company_id}.json"
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def normalize_segment_label_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def canonical_revenue_segment_member_key(company_id: str, member_key: Any, name: Any) -> str:
    normalized_company_id = str(company_id or "").strip().lower()
    normalized_key = normalize_segment_label_key(member_key or name)
    if not normalized_key:
        return normalized_key
    company_aliases = BAR_SEGMENT_CANONICAL_BY_COMPANY.get(normalized_company_id) or {}
    return company_aliases.get(normalized_key, normalized_key)


def dedupe_revenue_segment_rows(company_id: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for raw_row in rows:
        row = dict(raw_row)
        canonical_key = canonical_revenue_segment_member_key(company_id, row.get("memberKey"), row.get("name"))
        if not canonical_key:
            continue
        row["memberKey"] = canonical_key
        existing = deduped.get(canonical_key)
        if existing is None:
            deduped[canonical_key] = row
            continue
        existing_filing = str(existing.get("filingDate") or "")
        row_filing = str(row.get("filingDate") or "")
        existing_value = float(existing.get("valueBn") or 0)
        row_value = float(row.get("valueBn") or 0)
        prefer_row = row_filing > existing_filing or (row_filing == existing_filing and row_value > existing_value)
        merged = dict(row if prefer_row else existing)
        merged["memberKey"] = canonical_key
        merged["valueBn"] = max(existing_value, row_value)
        if not merged.get("nameZh"):
            merged["nameZh"] = row.get("nameZh") or existing.get("nameZh")
        deduped[canonical_key] = merged
    return list(deduped.values())


def filter_micron_mixed_segment_rows(quarter_key: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return rows
    member_keys = {
        normalize_segment_label_key(row.get("memberKey") or row.get("name"))
        for row in rows
        if isinstance(row, dict)
    }
    has_legacy = any(key in MICRON_LEGACY_SEGMENT_KEYS - {"allothersegments"} for key in member_keys)
    has_current = any(key in MICRON_CURRENT_SEGMENT_KEYS for key in member_keys)
    if not (has_legacy and has_current):
        return rows
    try:
        prefers_current = parse_period(str(quarter_key)) >= parse_period(MICRON_SCHEMA_CHANGE_QUARTER)
    except Exception:
        prefers_current = False
    allowed_keys = MICRON_CURRENT_SEGMENT_KEYS if prefers_current else MICRON_LEGACY_SEGMENT_KEYS
    filtered_rows = [
        row
        for row in rows
        if normalize_segment_label_key((row or {}).get("memberKey") or (row or {}).get("name")) in allowed_keys
    ]
    return filtered_rows or rows


def normalize_official_revenue_segments(company_id: str, quarter_key: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_company_id = str(company_id or "").strip().lower()
    normalized_rows: list[dict[str, Any]] = []
    for raw_row in rows:
        if not isinstance(raw_row, dict):
            continue
        row = dict(raw_row)
        canonical_key = canonical_revenue_segment_member_key(normalized_company_id, row.get("memberKey"), row.get("name"))
        if canonical_key:
            row["memberKey"] = canonical_key
        normalized_rows.append(row)

    if normalized_company_id == "jpmorgan":
        keys = {canonical_revenue_segment_member_key(normalized_company_id, row.get("memberKey"), row.get("name")) for row in normalized_rows}
        if "commercialinvestmentbank" in keys:
            normalized_rows = [
                row
                for row in normalized_rows
                if canonical_revenue_segment_member_key(normalized_company_id, row.get("memberKey"), row.get("name"))
                not in {"corporateinvestmentbank", "commercialbanking"}
            ]

    if normalized_company_id == "costco":
        keys = {canonical_revenue_segment_member_key(normalized_company_id, row.get("memberKey"), row.get("name")) for row in normalized_rows}
        if "nonfoods" in keys:
            normalized_rows = [
                row
                for row in normalized_rows
                if canonical_revenue_segment_member_key(normalized_company_id, row.get("memberKey"), row.get("name"))
                not in {"hardlines", "softlines"}
            ]

    if normalized_company_id == "micron":
        normalized_rows = filter_micron_mixed_segment_rows(quarter_key, normalized_rows)

    return dedupe_revenue_segment_rows(normalized_company_id, normalized_rows)


def _median(values: list[float]) -> float:
    cleaned = sorted(float(value) for value in values if float(value) > 0)
    if not cleaned:
        return 0.0
    midpoint = len(cleaned) // 2
    if len(cleaned) % 2 == 1:
        return cleaned[midpoint]
    return (cleaned[midpoint - 1] + cleaned[midpoint]) / 2


def normalize_q4_annualized_outliers(financials: dict[str, Any]) -> None:
    if not financials:
        return
    for quarter_key in sorted(financials.keys(), key=parse_period):
        if not str(quarter_key).endswith("Q4"):
            continue
        quarter_entry = financials.get(quarter_key)
        if not isinstance(quarter_entry, dict):
            continue
        year_text = str(quarter_key)[:4]
        if not year_text.isdigit():
            continue
        prior_quarter_keys = [f"{year_text}Q1", f"{year_text}Q2", f"{year_text}Q3"]
        prior_entries = [financials.get(key) for key in prior_quarter_keys]
        if any(not isinstance(item, dict) for item in prior_entries):
            continue
        prior_revenues = [float((item or {}).get("revenueBn") or 0) for item in prior_entries]
        if any(value <= 0 for value in prior_revenues):
            continue
        q4_revenue = float(quarter_entry.get("revenueBn") or 0)
        baseline_revenue = _median(prior_revenues)
        if q4_revenue <= 0 or baseline_revenue <= 0:
            continue
        if q4_revenue / baseline_revenue < 2.6:
            continue

        q4_rows = [row for row in (quarter_entry.get("officialRevenueSegments") or []) if isinstance(row, dict)]
        if len(q4_rows) < 2:
            continue
        q4_segment_sum = sum(float(row.get("valueBn") or 0) for row in q4_rows if float(row.get("valueBn") or 0) > 0)
        prior_segment_sums = []
        for prior_entry in prior_entries:
            rows = [row for row in ((prior_entry or {}).get("officialRevenueSegments") or []) if isinstance(row, dict)]
            if len(rows) < 2:
                continue
            segment_sum = sum(float(row.get("valueBn") or 0) for row in rows if float(row.get("valueBn") or 0) > 0)
            if segment_sum > 0:
                prior_segment_sums.append(segment_sum)
        baseline_segment = _median(prior_segment_sums)
        if q4_segment_sum > 0 and baseline_segment > 0:
            segment_ratio = q4_segment_sum / baseline_segment
            revenue_to_segment_ratio = q4_revenue / q4_segment_sum if q4_segment_sum > 0 else 0
            if segment_ratio <= 1.6 and revenue_to_segment_ratio >= 1.8:
                quarter_entry["revenueBn"] = round(q4_segment_sum, 3)
                quality_flags = quarter_entry.get("qualityFlags")
                if not isinstance(quality_flags, list):
                    quality_flags = []
                if "q4-revenue-aligned-to-segment-sum" not in quality_flags:
                    quality_flags.append("q4-revenue-aligned-to-segment-sum")
                quarter_entry["qualityFlags"] = quality_flags
                continue

        q3_entry = financials.get(f"{year_text}Q3")
        if not isinstance(q3_entry, dict):
            continue
        q3_rows = [row for row in (q3_entry.get("officialRevenueSegments") or []) if isinstance(row, dict)]
        if len(q3_rows) < 2:
            continue

        q3_map = {str(row.get("memberKey") or row.get("name") or "").strip(): float(row.get("valueBn") or 0) for row in q3_rows}
        q4_map = {str(row.get("memberKey") or row.get("name") or "").strip(): float(row.get("valueBn") or 0) for row in q4_rows}
        multipliers: list[float] = []
        for member_key, q4_value in q4_map.items():
            q3_value = float(q3_map.get(member_key) or 0)
            if q3_value > 0.05 and q4_value > 0.05:
                multipliers.append(q4_value / q3_value)
        if len(multipliers) < 2:
            continue
        median_multiplier = _median(multipliers)
        multiplier_spread = max(multipliers) - min(multipliers)
        if median_multiplier < 2.6 or median_multiplier > 5.4 or multiplier_spread > 1.8:
            continue

        normalization_factor = 4.0 if 3.3 <= median_multiplier <= 4.7 else round(median_multiplier, 3)
        if normalization_factor <= 1.5:
            continue

        quarter_entry["revenueBn"] = round(q4_revenue / normalization_factor, 3)
        for row in q4_rows:
            current_value = float(row.get("valueBn") or 0)
            row["valueBn"] = round(current_value / normalization_factor, 3)
            row["yoyPct"] = None
            row["qoqPct"] = None
            row["mixPct"] = None
            row["mixYoyDeltaPp"] = None
        detail_rows = [row for row in (quarter_entry.get("officialRevenueDetailGroups") or []) if isinstance(row, dict)]
        for row in detail_rows:
            current_value = float(row.get("valueBn") or 0)
            row["valueBn"] = round(current_value / normalization_factor, 3)
            row["yoyPct"] = None
            row["qoqPct"] = None
            row["mixPct"] = None
            row["mixYoyDeltaPp"] = None

        q3_revenue = float((financials.get(f"{year_text}Q3") or {}).get("revenueBn") or 0)
        if q3_revenue > 0:
            quarter_entry["revenueQoqPct"] = round((quarter_entry["revenueBn"] / q3_revenue - 1) * 100, 3)
        prior_year_q4_revenue = float((financials.get(f"{int(year_text) - 1}Q4") or {}).get("revenueBn") or 0)
        if prior_year_q4_revenue > 0:
            quarter_entry["revenueYoyPct"] = round((quarter_entry["revenueBn"] / prior_year_q4_revenue - 1) * 100, 3)

        quality_flags = quarter_entry.get("qualityFlags")
        if not isinstance(quality_flags, list):
            quality_flags = []
        if "q4-annualized-normalized" not in quality_flags:
            quality_flags.append("q4-annualized-normalized")
        quarter_entry["qualityFlags"] = quality_flags


def recompute_revenue_growth_metrics(financials: dict[str, Any]) -> None:
    ordered_quarters = sorted(financials.keys(), key=parse_period)
    for quarter_key in ordered_quarters:
        entry = financials.get(quarter_key)
        if not isinstance(entry, dict):
            continue
        revenue_bn = float(entry.get("revenueBn") or 0)
        if revenue_bn <= 0:
            entry["revenueQoqPct"] = None
            entry["revenueYoyPct"] = None
            continue
        year = int(str(quarter_key)[:4]) if str(quarter_key)[:4].isdigit() else None
        quarter_number = int(str(quarter_key)[-1]) if str(quarter_key).endswith(("Q1", "Q2", "Q3", "Q4")) else None
        if year is None or quarter_number is None:
            continue
        prior_quarter_key = f"{year - 1}Q4" if quarter_number == 1 else f"{year}Q{quarter_number - 1}"
        prior_year_key = f"{year - 1}Q{quarter_number}"
        prior_quarter_revenue = float((financials.get(prior_quarter_key) or {}).get("revenueBn") or 0)
        prior_year_revenue = float((financials.get(prior_year_key) or {}).get("revenueBn") or 0)
        entry["revenueQoqPct"] = round((revenue_bn / prior_quarter_revenue - 1) * 100, 3) if prior_quarter_revenue > 0 else None
        entry["revenueYoyPct"] = round((revenue_bn / prior_year_revenue - 1) * 100, 3) if prior_year_revenue > 0 else None


def quarter_end_date(quarter_key: str) -> str | None:
    if len(quarter_key) != 6 or quarter_key[4] != "Q":
        return None
    try:
        year = int(quarter_key[:4])
        quarter = int(quarter_key[5])
    except ValueError:
        return None
    mapping = {
        1: f"{year:04d}-03-31",
        2: f"{year:04d}-06-30",
        3: f"{year:04d}-09-30",
        4: f"{year:04d}-12-31",
    }
    return mapping.get(quarter)


def synthesize_financial_entry_from_structure(
    quarter_key: str,
    company: dict[str, Any],
    quarter_payload: dict[str, Any],
) -> dict[str, Any] | None:
    if not isinstance(quarter_payload, dict):
        return None
    segment_rows = [row for row in (quarter_payload.get("segments") or []) if isinstance(row, dict)]
    segment_sum_bn = round(
        sum(float(row.get("valueBn") or 0) for row in segment_rows if float(row.get("valueBn") or 0) > 0),
        3,
    )
    display_revenue_bn = float(quarter_payload.get("displayRevenueBn") or 0)
    revenue_bn = round(display_revenue_bn, 3) if display_revenue_bn > 0 else segment_sum_bn
    if revenue_bn <= 0:
        return None
    period_end = quarter_end_date(quarter_key) or ""
    fiscal_year = quarter_key[:4]
    fiscal_quarter = f"Q{quarter_key[5]}"
    statement_currency = str(quarter_payload.get("displayCurrency") or company.get("reportingCurrency") or "USD").upper()
    source_url = ""
    filing_date = period_end
    for row in segment_rows:
        if not source_url and row.get("sourceUrl"):
            source_url = str(row.get("sourceUrl"))
        if row.get("filingDate"):
            filing_date = str(row.get("filingDate"))
            break
    return {
        "calendarQuarter": quarter_key,
        "periodEnd": period_end,
        "fiscalYear": fiscal_year,
        "fiscalQuarter": fiscal_quarter,
        "fiscalLabel": f"FY{fiscal_year} {fiscal_quarter}",
        "statementCurrency": statement_currency,
        "revenueBn": revenue_bn,
        "revenueYoyPct": None,
        "costOfRevenueBn": None,
        "grossProfitBn": None,
        "sgnaBn": None,
        "rndBn": None,
        "otherOpexBn": None,
        "operatingExpensesBn": None,
        "operatingIncomeBn": None,
        "nonOperatingBn": None,
        "pretaxIncomeBn": None,
        "taxBn": None,
        "netIncomeBn": None,
        "netIncomeYoyPct": None,
        "grossMarginPct": None,
        "operatingMarginPct": None,
        "profitMarginPct": None,
        "effectiveTaxRatePct": None,
        "revenueQoqPct": None,
        "grossMarginYoyDeltaPp": None,
        "operatingMarginYoyDeltaPp": None,
        "profitMarginYoyDeltaPp": None,
        "statementSource": "official-revenue-structure",
        "statementSourceUrl": source_url,
        "statementFilingDate": filing_date,
    }


def load_manual_presets() -> dict[str, Any]:
    if not MANUAL_PRESETS_PATH.exists():
        return {}
    return json.loads(MANUAL_PRESETS_PATH.read_text(encoding="utf-8"))


def load_fx_cache() -> dict[str, float]:
    if not FX_CACHE_PATH.exists():
        return {}
    return json.loads(FX_CACHE_PATH.read_text(encoding="utf-8"))


def save_fx_cache(cache: dict[str, float]) -> None:
    FX_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FX_CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def fetch_usd_fx_rate(currency: str, date_text: str, cache: dict[str, float]) -> float | None:
    normalized_currency = str(currency or "").upper()
    if not normalized_currency or normalized_currency == "USD":
        return 1.0
    try:
        base_date = date.fromisoformat(date_text)
    except ValueError:
        return None
    for day_offset in range(0, 8):
        lookup_date = (base_date - timedelta(days=day_offset)).isoformat()
        cache_key = f"{normalized_currency}:{lookup_date}"
        if cache_key in cache:
            return cache[cache_key]
        url = f"https://api.frankfurter.app/{lookup_date}?from={normalized_currency}&to=USD"
        try:
            response = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
            if not response.ok:
                continue
            payload = response.json()
        except (requests.RequestException, ValueError):
            continue
        rate = payload.get("rates", {}).get("USD")
        if isinstance(rate, (int, float)) and rate > 0:
            cache[cache_key] = float(rate)
            return float(rate)
    return None


def _fetch_pdf_text(url: str) -> str | None:
    if not url:
        return None
    cached = PDF_TEXT_CACHE.get(url)
    if cached is not None:
        return cached
    try:
        response = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/pdf"})
        if not response.ok:
            PDF_TEXT_CACHE[url] = ""
            return None
        reader = PdfReader(io.BytesIO(response.content))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:  # noqa: BLE001
        PDF_TEXT_CACHE[url] = ""
        return None
    PDF_TEXT_CACHE[url] = text
    return text or None


def _parse_numeric_token(token: str) -> float | None:
    cleaned = str(token or "").strip().replace(",", "").replace("%", "")
    if not cleaned:
        return None
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    if negative:
        cleaned = cleaned[1:-1]
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return -value if negative else value


def _collapse_pdf_statement_lines(text: str) -> list[str]:
    collapsed: list[str] = []
    cursor = ""
    for raw_line in str(text or "").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        merged = f"{cursor} {line}".strip() if cursor else line
        if re.search(r"\(?\d[\d,]*\)?%?(?:\s|$)", line):
            collapsed.append(merged)
            cursor = ""
        else:
            cursor = merged
    if cursor:
        collapsed.append(cursor)
    return collapsed


def _pdf_label_pattern(label: str) -> re.Pattern[str]:
    escaped = re.escape(label)
    escaped = escaped.replace(r"\ ", r"\s+")
    escaped = escaped.replace(r"\(", r"\(?").replace(r"\)", r"\)?")
    return re.compile(rf"^(?:[A-Za-z][A-Za-z*/-]*\s+)*{escaped}\s+(.+)$", re.IGNORECASE)


def _extract_tencent_row_values(lines: list[str], label: str) -> list[float]:
    pattern = _pdf_label_pattern(label)
    for line in lines:
        match = pattern.match(line)
        if not match:
            continue
        tokens = re.findall(r"\(?\d[\d,]*\)?%?", match.group(1))
        values = [_parse_numeric_token(token) for token in tokens]
        return [value for value in values if value is not None]
    return []


def _quarter_prior_key(quarter_key: str) -> str | None:
    if len(quarter_key) != 6 or quarter_key[4] != "Q":
        return None
    year = int(quarter_key[:4])
    quarter = int(quarter_key[5])
    if quarter == 1:
        return f"{year - 1}Q4"
    return f"{year}Q{quarter - 1}"


def _parse_tencent_pdf_financial_entry(quarter_key: str, source_url: str, filing_date: str | None) -> dict[str, Any] | None:
    pdf_text = _fetch_pdf_text(source_url)
    if not pdf_text:
        return None
    section_start_match = re.search(r"(?:CONDENSED\s+)?CONSOLIDATED\s+INCOME\s+STATEMENT", pdf_text, re.IGNORECASE)
    if not section_start_match:
        return None
    section_start = section_start_match.start()
    section_end_match = re.search(
        r"(?:CONDENSED\s+)?CONSOLIDATED\s+STATEMENT\s+OF\s+COMPREHENSIVE\s+INCOME",
        pdf_text[section_start:],
        re.IGNORECASE,
    )
    section_end = section_start + section_end_match.start() if section_end_match else -1
    statement_section = pdf_text[section_start:section_end] if section_end > section_start else pdf_text[section_start:]
    lines = _collapse_pdf_statement_lines(statement_section)
    revenue_values = _extract_tencent_row_values(lines, "Revenues")
    cost_values = _extract_tencent_row_values(lines, "Cost of revenues")
    gross_values = _extract_tencent_row_values(lines, "Gross profit")
    selling_values = _extract_tencent_row_values(lines, "Selling and marketing expenses")
    ga_values = _extract_tencent_row_values(lines, "General and administrative expenses")
    other_values = _extract_tencent_row_values(lines, "Other gains/(losses), net")
    operating_values = _extract_tencent_row_values(lines, "Operating profit")
    pretax_values = _extract_tencent_row_values(lines, "Profit before income tax")
    tax_values = _extract_tencent_row_values(lines, "Income tax expense")
    equity_values = _extract_tencent_row_values(lines, "Attributable to: Equity holders of the Company")
    if not (revenue_values and gross_values and operating_values and pretax_values and tax_values and equity_values):
        return None

    revenue_current = revenue_values[0]
    revenue_prior = revenue_values[1] if len(revenue_values) > 1 else None
    gross_current = gross_values[0]
    gross_prior = gross_values[1] if len(gross_values) > 1 else None
    reported_operating_current = operating_values[0]
    reported_operating_prior = operating_values[1] if len(operating_values) > 1 else None
    pretax_current = pretax_values[0]
    tax_current = tax_values[0]
    tax_prior = tax_values[1] if len(tax_values) > 1 else None
    net_income_current = equity_values[0]
    net_income_prior = equity_values[1] if len(equity_values) > 1 else None
    if revenue_current <= 0 or gross_current <= 0 or net_income_current <= 0:
        return None

    cost_current = abs(cost_values[0]) if cost_values else max(revenue_current - gross_current, 0)
    selling_current = abs(selling_values[0]) if selling_values else 0
    selling_prior = abs(selling_values[1]) if len(selling_values) > 1 else 0
    ga_current = abs(ga_values[0]) if ga_values else 0
    ga_prior = abs(ga_values[1]) if len(ga_values) > 1 else 0
    other_current = other_values[0] if other_values else 0
    other_prior = other_values[1] if len(other_values) > 1 else 0
    explicit_operating_expenses_current = selling_current + ga_current + (abs(other_current) if other_current < 0 else 0)
    explicit_operating_expenses_prior = selling_prior + ga_prior + (abs(other_prior) if other_prior < 0 else 0)
    if explicit_operating_expenses_current > 0:
        operating_expenses_current = explicit_operating_expenses_current
        operating_current = gross_current - operating_expenses_current
    else:
        operating_current = reported_operating_current
        operating_expenses_current = max(gross_current - operating_current, 0)
    if explicit_operating_expenses_prior > 0 and gross_prior is not None:
        operating_prior = gross_prior - explicit_operating_expenses_prior
    else:
        operating_prior = reported_operating_prior
    net_income_yoy = round((net_income_current / net_income_prior - 1) * 100, 3) if net_income_prior and net_income_prior > 0 else None
    gross_margin_current = round(gross_current / revenue_current * 100, 3)
    operating_margin_current = round(operating_current / revenue_current * 100, 3)
    profit_margin_current = round(net_income_current / revenue_current * 100, 3)
    gross_margin_prior = round(gross_prior / revenue_prior * 100, 3) if gross_prior and revenue_prior else None
    operating_margin_prior = round(operating_prior / revenue_prior * 100, 3) if operating_prior and revenue_prior else None
    profit_margin_prior = round(net_income_prior / revenue_prior * 100, 3) if net_income_prior and revenue_prior else None

    return {
        "calendarQuarter": quarter_key,
        "periodEnd": quarter_end_date(quarter_key) or "",
        "fiscalYear": quarter_key[:4],
        "fiscalQuarter": f"Q{quarter_key[5]}",
        "fiscalLabel": f"FY{quarter_key[:4]} Q{quarter_key[5]}",
        "statementCurrency": "CNY",
        "revenueBn": round(revenue_current / 1000, 3),
        "revenueYoyPct": round((revenue_current / revenue_prior - 1) * 100, 3) if revenue_prior and revenue_prior > 0 else None,
        "costOfRevenueBn": round(cost_current / 1000, 3),
        "grossProfitBn": round(gross_current / 1000, 3),
        "sgnaBn": round((selling_current + ga_current) / 1000, 3) if selling_current or ga_current else None,
        "rndBn": None,
        "otherOpexBn": round(abs(other_current) / 1000, 3) if other_current < 0 else None,
        "operatingExpensesBn": round(operating_expenses_current / 1000, 3),
        "operatingIncomeBn": round(operating_current / 1000, 3),
        "nonOperatingBn": round((pretax_current - operating_current) / 1000, 3),
        "pretaxIncomeBn": round(pretax_current / 1000, 3),
        "taxBn": round(abs(tax_current) / 1000, 3),
        "netIncomeBn": round(net_income_current / 1000, 3),
        "netIncomeYoyPct": net_income_yoy,
        "grossMarginPct": gross_margin_current,
        "operatingMarginPct": operating_margin_current,
        "profitMarginPct": profit_margin_current,
        "effectiveTaxRatePct": round(abs(tax_current) / pretax_current * 100, 3) if pretax_current > 0 else None,
        "revenueQoqPct": None,
        "grossMarginYoyDeltaPp": round(gross_margin_current - gross_margin_prior, 3) if gross_margin_prior is not None else None,
        "operatingMarginYoyDeltaPp": round(operating_margin_current - operating_margin_prior, 3) if operating_margin_prior is not None else None,
        "profitMarginYoyDeltaPp": round(profit_margin_current - profit_margin_prior, 3) if profit_margin_prior is not None else None,
        "statementSource": "tencent-ir-pdf",
        "statementSourceUrl": source_url,
        "statementFilingDate": filing_date or quarter_end_date(quarter_key) or "",
    }


def supplement_tencent_official_financials(company_payload: dict[str, Any]) -> dict[str, Any]:
    if str(company_payload.get("id") or "") != "tencent":
        return company_payload
    financials: dict[str, Any] = company_payload.get("financials", {})
    for quarter_key, entry in financials.items():
        if not isinstance(entry, dict):
            continue
        source_rows = [row for row in (entry.get("officialRevenueSegments") or []) if isinstance(row, dict)]
        source_url = next((str(row.get("sourceUrl") or "") for row in source_rows if row.get("sourceUrl")), "")
        filing_date = next((str(row.get("filingDate") or "") for row in source_rows if row.get("filingDate")), "") or str(
            entry.get("statementFilingDate") or entry.get("periodEnd") or ""
        )
        if not source_url.endswith(".pdf"):
            continue
        parsed_entry = _parse_tencent_pdf_financial_entry(quarter_key, source_url, filing_date)
        if not parsed_entry:
            continue
        preserved_fields = {
            "officialRevenueSegments": entry.get("officialRevenueSegments"),
            "officialRevenueDetailGroups": entry.get("officialRevenueDetailGroups"),
            "officialRevenueStyle": entry.get("officialRevenueStyle"),
            "displayCurrency": entry.get("displayCurrency"),
            "displayScaleFactor": entry.get("displayScaleFactor"),
            "qualityFlags": entry.get("qualityFlags"),
        }
        entry.update(parsed_entry)
        for key, value in preserved_fields.items():
            if value is not None:
                entry[key] = value

    ordered_quarters = sorted(financials.keys(), key=parse_period)
    for quarter_key in ordered_quarters:
        entry = financials.get(quarter_key)
        if not isinstance(entry, dict):
            continue
        prior_quarter_key = _quarter_prior_key(quarter_key)
        prior_quarter_revenue = float((financials.get(prior_quarter_key or "") or {}).get("revenueBn") or 0)
        prior_year_key = f"{int(quarter_key[:4]) - 1}{quarter_key[4:]}" if quarter_key[:4].isdigit() else ""
        prior_year_revenue = float((financials.get(prior_year_key) or {}).get("revenueBn") or 0)
        revenue_bn = float(entry.get("revenueBn") or 0)
        if revenue_bn > 0 and prior_quarter_revenue > 0:
            entry["revenueQoqPct"] = round((revenue_bn / prior_quarter_revenue - 1) * 100, 3)
        if revenue_bn > 0 and prior_year_revenue > 0:
            entry["revenueYoyPct"] = round((revenue_bn / prior_year_revenue - 1) * 100, 3)
    company_payload["quarters"] = sorted(financials.keys(), key=parse_period)
    return company_payload


def supplement_stockanalysis_with_official_financials(company_payload: dict[str, Any], refresh: bool = False) -> dict[str, Any]:
    if str(company_payload.get("statementSource") or "") != "stockanalysis-financials":
        return company_payload

    company = {
        "id": company_payload.get("id"),
        "ticker": company_payload.get("ticker"),
        "nameZh": company_payload.get("nameZh"),
        "nameEn": company_payload.get("nameEn"),
        "slug": company_payload.get("slug"),
        "rank": company_payload.get("rank"),
        "isAdr": company_payload.get("isAdr"),
        "brand": company_payload.get("brand"),
    }
    official_payload = fetch_official_financial_history(company, refresh=refresh)
    official_financials = official_payload.get("financials") or {}
    if not isinstance(official_financials, dict) or not official_financials:
        return company_payload

    financials: dict[str, Any] = company_payload.setdefault("financials", {})
    for quarter_key, official_entry in official_financials.items():
        if not isinstance(official_entry, dict):
            continue
        existing_entry = financials.get(quarter_key)
        if not isinstance(existing_entry, dict):
            financials[quarter_key] = dict(official_entry)
            continue
        preserved_fields = {
            "officialRevenueSegments": existing_entry.get("officialRevenueSegments"),
            "officialRevenueDetailGroups": existing_entry.get("officialRevenueDetailGroups"),
            "officialRevenueStyle": existing_entry.get("officialRevenueStyle"),
            "displayCurrency": existing_entry.get("displayCurrency"),
            "displayScaleFactor": existing_entry.get("displayScaleFactor"),
            "qualityFlags": existing_entry.get("qualityFlags"),
        }
        merged_entry = dict(existing_entry)
        merged_entry.update(official_entry)
        for field_name, field_value in preserved_fields.items():
            if field_value is not None:
                merged_entry[field_name] = field_value
        financials[quarter_key] = merged_entry

    company_payload["quarters"] = sorted(financials.keys(), key=parse_period)
    company_payload["statementSource"] = "stockanalysis-financials+official-fallback"
    source_url_candidates = [
        str(company_payload.get("statementSourceUrl") or "").strip(),
        str(official_payload.get("statementSourceUrl") or "").strip(),
    ]
    company_payload["statementSourceUrl"] = " | ".join([item for item in source_url_candidates if item])
    merged_errors = list(company_payload.get("errors") or [])
    for error in official_payload.get("errors") or []:
        if error not in merged_errors:
            merged_errors.append(error)
    company_payload["errors"] = merged_errors
    return company_payload


def sanitize_implausible_q4_revenue_aligned_statements(company_payload: dict[str, Any]) -> dict[str, Any]:
    financials: dict[str, Any] = company_payload.get("financials", {})
    bridge_fields = (
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
        "netIncomeYoyPct",
        "grossMarginPct",
        "operatingMarginPct",
        "profitMarginPct",
        "effectiveTaxRatePct",
        "grossMarginYoyDeltaPp",
        "operatingMarginYoyDeltaPp",
        "profitMarginYoyDeltaPp",
    )
    for quarter_key, entry in financials.items():
        if not isinstance(entry, dict):
            continue
        quality_flags = entry.get("qualityFlags")
        if not isinstance(quality_flags, list) or "q4-revenue-aligned-to-segment-sum" not in quality_flags:
            continue
        revenue_bn = float(entry.get("revenueBn") or 0)
        if revenue_bn <= 0:
            continue
        suspicious_values = [
            float(entry.get(field_name) or 0)
            for field_name in ("costOfRevenueBn", "grossProfitBn", "operatingExpensesBn", "operatingIncomeBn", "pretaxIncomeBn", "netIncomeBn")
            if float(entry.get(field_name) or 0) > 0
        ]
        if not suspicious_values or max(suspicious_values) <= revenue_bn * 1.18:
            continue
        for field_name in bridge_fields:
            entry[field_name] = None
        if "q4-statement-bridge-cleared" not in quality_flags:
            quality_flags.append("q4-statement-bridge-cleared")
        entry["qualityFlags"] = quality_flags
    company_payload["quarters"] = sorted(financials.keys(), key=parse_period)
    return company_payload


def apply_usd_display_fields(payload: dict[str, Any], fx_cache: dict[str, float]) -> dict[str, Any]:
    financials: dict[str, Any] = payload.get("financials", {})
    for entry in financials.values():
        if not isinstance(entry, dict):
            continue
        currency = str(entry.get("statementCurrency") or entry.get("displayCurrency") or "").upper()
        if not currency:
            continue
        if currency == "USD":
            entry["displayCurrency"] = "USD"
            if not entry.get("displayScaleFactor"):
                entry["displayScaleFactor"] = 1
            continue
        if entry.get("displayCurrency") == "USD" and entry.get("displayScaleFactor"):
            continue
        reference_date = entry.get("statementFilingDate") or entry.get("periodEnd")
        if not reference_date:
            continue
        fx_rate = fetch_usd_fx_rate(currency, str(reference_date), fx_cache)
        if fx_rate:
            entry["displayCurrency"] = "USD"
            entry["displayScaleFactor"] = round(float(fx_rate), 6)
    return payload


def fetch_company_payload(company: dict[str, Any], refresh: bool) -> dict[str, Any]:
    source = company.get("financialSource")
    if source == "stockanalysis":
        return fetch_stockanalysis_financial_history(company, refresh=refresh)
    return fetch_official_financial_history(company, refresh=refresh)


def load_official_segment_history(company: dict[str, Any], refresh: bool) -> dict[str, Any]:
    return fetch_official_segment_history(company, refresh=refresh)


def merge_official_segment_history(company_payload: dict[str, Any], company: dict[str, Any], refresh: bool) -> dict[str, Any]:
    history = load_official_segment_history(company, refresh=refresh)
    quarter_map = history.get("quarters", {}) if isinstance(history, dict) else {}
    financials: dict[str, Any] = company_payload.get("financials", {})
    for quarter, rows in quarter_map.items():
        entry = financials.get(quarter)
        if not isinstance(entry, dict):
            continue
        cleaned_rows = [row for row in rows if isinstance(row, dict) and row.get("valueBn") is not None]
        if not cleaned_rows:
            continue
        normalized_rows: list[dict[str, Any]] = []
        for row in cleaned_rows:
            member_key = str(row.get("memberKey") or row.get("name") or "")
            normalized_rows.append(
                {
                    "name": row.get("name"),
                    "nameZh": row.get("nameZh"),
                    "memberKey": member_key,
                    "valueBn": row.get("valueBn"),
                    "yoyPct": None,
                    "sourceUrl": row.get("sourceUrl"),
                    "sourceForm": row.get("sourceForm"),
                    "filingDate": row.get("filingDate"),
                    "periodStart": row.get("periodStart"),
                    "periodEnd": row.get("periodEnd"),
                }
            )
        entry["officialRevenueSegments"] = normalized_rows
        entry["officialSegmentAxis"] = history.get("axis")
        entry["officialSegmentSource"] = history.get("source")

    company_payload["officialSegmentHistory"] = {
        "source": history.get("source"),
        "axis": history.get("axis"),
        "filingsUsed": history.get("filingsUsed", []),
        "errors": history.get("errors", []),
    }
    return company_payload


def load_official_revenue_structure_history(company: dict[str, Any], refresh: bool) -> dict[str, Any]:
    return fetch_official_revenue_structure_history(company, refresh=refresh)


def enrich_growth_rows(financials: dict[str, Any], field_name: str) -> None:
    ordered_quarters = sorted(financials, key=parse_period)
    for quarter in ordered_quarters:
        rows = financials.get(quarter, {}).get(field_name) or []
        if not rows:
            continue
        prior_year_quarter = f"{int(quarter[:4]) - 1}{quarter[4:]}"
        prior_year_rows = financials.get(prior_year_quarter, {}).get(field_name) or []
        prior_year_map = {str(item.get("memberKey") or item.get("name") or ""): item for item in prior_year_rows}
        prior_quarter = quarter
        if quarter.endswith("Q1"):
            prior_quarter = f"{int(quarter[:4]) - 1}Q4"
        else:
            prior_quarter = f"{quarter[:4]}Q{int(quarter[-1]) - 1}"
        prior_quarter_rows = financials.get(prior_quarter, {}).get(field_name) or []
        prior_quarter_map = {str(item.get("memberKey") or item.get("name") or ""): item for item in prior_quarter_rows}
        revenue_bn = float(financials.get(quarter, {}).get("revenueBn") or 0)
        prior_year_revenue_bn = float(financials.get(prior_year_quarter, {}).get("revenueBn") or 0)
        for row in rows:
            member_key = str(row.get("memberKey") or row.get("name") or "")
            if revenue_bn and row.get("metricMode") == "share":
                share_pct = float(row.get("mixPct") or row.get("valueBn") or 0)
                row["valueBn"] = round(share_pct / 100 * revenue_bn, 3)
                row["mixPct"] = round(share_pct, 1)
            elif revenue_bn and row.get("mixPct") is None:
                row["mixPct"] = round(float(row.get("valueBn") or 0) / revenue_bn * 100, 1)
            previous = prior_year_map.get(member_key)
            previous_value = float(previous.get("valueBn") or 0) if previous else 0
            if row.get("yoyPct") is None and previous_value:
                row["yoyPct"] = round((float(row.get("valueBn") or 0) / previous_value - 1) * 100, 2)
            previous = prior_quarter_map.get(member_key)
            previous_value = float(previous.get("valueBn") or 0) if previous else 0
            if row.get("qoqPct") is None and previous_value:
                row["qoqPct"] = round((float(row.get("valueBn") or 0) / previous_value - 1) * 100, 2)
            previous = prior_year_map.get(member_key)
            previous_value = float(previous.get("valueBn") or 0) if previous else 0
            if revenue_bn and prior_year_revenue_bn and previous_value and row.get("mixYoyDeltaPp") is None:
                current_mix = float(row.get("valueBn") or 0) / revenue_bn * 100
                prior_mix = previous_value / prior_year_revenue_bn * 100
                row["mixYoyDeltaPp"] = round(current_mix - prior_mix, 1)


def merge_official_revenue_structure_history(company_payload: dict[str, Any], company: dict[str, Any], refresh: bool) -> dict[str, Any]:
    history = load_official_revenue_structure_history(company, refresh=refresh)
    financials: dict[str, Any] = company_payload.get("financials", {})
    for quarter, payload in (history.get("quarters") or {}).items():
        segments = payload.get("segments") or []
        normalized_segments = []
        if segments:
            for row in segments:
                normalized_segments.append(
                    {
                        "name": row.get("name"),
                        "nameZh": row.get("nameZh"),
                        "memberKey": str(row.get("memberKey") or row.get("name") or ""),
                        "valueBn": row.get("valueBn"),
                        "yoyPct": row.get("yoyPct"),
                        "qoqPct": row.get("qoqPct"),
                        "mixPct": row.get("mixPct"),
                        "mixYoyDeltaPp": row.get("mixYoyDeltaPp"),
                        "sourceUrl": row.get("sourceUrl"),
                        "sourceForm": row.get("sourceForm"),
                        "filingDate": row.get("filingDate"),
                        "supportLines": row.get("supportLines"),
                        "supportLinesZh": row.get("supportLinesZh"),
                        "metricMode": row.get("metricMode"),
                    }
                )
            normalized_segments = normalize_official_revenue_segments(company["id"], quarter, normalized_segments)
            payload["segments"] = normalized_segments

        entry = financials.get(quarter)
        if not isinstance(entry, dict):
            synthesized_entry = synthesize_financial_entry_from_structure(quarter, company_payload, payload)
            if not synthesized_entry:
                continue
            financials[quarter] = synthesized_entry
            entry = synthesized_entry
        if normalized_segments:
            entry["officialRevenueSegments"] = normalized_segments
        detail_groups = payload.get("detailGroups") or []
        if detail_groups:
            normalized_detail_groups = []
            for row in detail_groups:
                normalized_detail_groups.append(
                    {
                        "name": row.get("name"),
                        "nameZh": row.get("nameZh"),
                        "memberKey": str(row.get("memberKey") or row.get("name") or ""),
                        "valueBn": row.get("valueBn"),
                        "yoyPct": row.get("yoyPct"),
                        "qoqPct": row.get("qoqPct"),
                        "mixPct": row.get("mixPct"),
                        "mixYoyDeltaPp": row.get("mixYoyDeltaPp"),
                        "sourceUrl": row.get("sourceUrl"),
                        "sourceForm": row.get("sourceForm"),
                        "filingDate": row.get("filingDate"),
                        "supportLines": row.get("supportLines"),
                        "supportLinesZh": row.get("supportLinesZh"),
                        "targetName": row.get("targetName"),
                        "metricMode": row.get("metricMode"),
                    }
                )
            entry["officialRevenueDetailGroups"] = normalized_detail_groups
        if payload.get("style"):
            entry["officialRevenueStyle"] = payload.get("style")
        if payload.get("displayCurrency"):
            entry["displayCurrency"] = payload.get("displayCurrency")
        display_revenue_bn = float(payload.get("displayRevenueBn") or 0)
        segment_sum_bn = round(sum(float(row.get("valueBn") or 0) for row in normalized_segments if float(row.get("valueBn") or 0) > 0), 3)
        if (
            str(company.get("id") or "").lower() == "mastercard"
            and display_revenue_bn > 0
            and segment_sum_bn > 0
            and abs(segment_sum_bn - display_revenue_bn) <= 0.08
        ):
            entry["revenueBn"] = round(display_revenue_bn, 3)
            entry["displayCurrency"] = "USD"
            entry["displayScaleFactor"] = 1
        elif payload.get("displayRevenueBn") and entry.get("revenueBn"):
            entry["displayScaleFactor"] = round(float(payload["displayRevenueBn"]) / float(entry["revenueBn"]), 6)

    normalize_q4_annualized_outliers(financials)
    for quarter_key, entry in financials.items():
        if not isinstance(entry, dict):
            continue
        rows = entry.get("officialRevenueSegments")
        if isinstance(rows, list) and rows:
            entry["officialRevenueSegments"] = dedupe_revenue_segment_rows(company["id"], rows)
    enrich_growth_rows(financials, "officialRevenueSegments")
    enrich_growth_rows(financials, "officialRevenueDetailGroups")
    recompute_revenue_growth_metrics(financials)
    company_payload["quarters"] = sorted(financials.keys(), key=parse_period)

    company_payload["officialRevenueStructureHistory"] = {
        "source": history.get("source"),
        "quarters": history.get("quarters", {}),
        "filingsUsed": history.get("filingsUsed", []),
        "errors": history.get("errors", []),
    }
    return company_payload


def main() -> int:
    args = parse_args()
    manual_presets = load_manual_presets()
    fx_cache = load_fx_cache()
    selected_tokens = parse_company_selection(args.companies)
    selected_companies = [company for company in REFERENCE_COMPANIES if company_matches_selection(company, selected_tokens)]
    selected_company_ids = {company["id"] for company in selected_companies}
    if selected_tokens and not selected_companies:
        print("[warn] no companies matched --companies selection; nothing to refresh.", flush=True)

    results_by_company_id: dict[str, dict[str, Any]] = {}

    failures: list[str] = []
    for company in selected_companies:
        print(f"[build] {company['ticker']} ...", flush=True)
        try:
            ensure_logo_catalog_entry(company, refresh=args.refresh)
            payload = fetch_company_payload(company, refresh=args.refresh)
            if company.get("financialSource") != "stockanalysis":
                payload = merge_official_segment_history(payload, company, refresh=args.refresh)
            payload = merge_official_revenue_structure_history(payload, company, refresh=args.refresh)
            payload = supplement_stockanalysis_with_official_financials(payload, refresh=args.refresh)
            payload = supplement_tencent_official_financials(payload)
            payload = sanitize_implausible_q4_revenue_aligned_statements(payload)
            payload = apply_usd_display_fields(payload, fx_cache)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{company['ticker']}: {exc}")
            print(f"  failed: {exc}", file=sys.stderr, flush=True)
            continue

        presets = manual_presets.get(str(company["id"])) or {}
        payload["statementPresets"] = presets
        segment_quarter_count = sum(1 for item in payload["financials"].values() if item.get("officialRevenueSegments"))
        payload["coverage"] = {
            "quarterCount": len(payload["quarters"]),
            "pixelReplicaQuarterCount": len(presets),
            "hasPixelReplica": bool(presets),
            "officialFinancialQuarterCount": len(payload["quarters"]),
            "officialSegmentQuarterCount": segment_quarter_count,
        }
        COMPANY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (COMPANY_CACHE_DIR / f"{company['id']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        results_by_company_id[company["id"]] = payload
        time.sleep(0.2)

    if selected_tokens:
        for company in REFERENCE_COMPANIES:
            if company["id"] in results_by_company_id:
                continue
            cached_payload = load_cached_company_payload(company["id"])
            if cached_payload is not None:
                results_by_company_id[company["id"]] = cached_payload
                continue
            print(f"[build] {company['ticker']} ...", flush=True)
            try:
                ensure_logo_catalog_entry(company, refresh=False)
                payload = fetch_company_payload(company, refresh=False)
                if company.get("financialSource") != "stockanalysis":
                    payload = merge_official_segment_history(payload, company, refresh=False)
                payload = merge_official_revenue_structure_history(payload, company, refresh=False)
                payload = supplement_stockanalysis_with_official_financials(payload, refresh=args.refresh)
                payload = supplement_tencent_official_financials(payload)
                payload = sanitize_implausible_q4_revenue_aligned_statements(payload)
                payload = apply_usd_display_fields(payload, fx_cache)
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{company['ticker']}: {exc}")
                print(f"  failed: {exc}", file=sys.stderr, flush=True)
                continue

            presets = manual_presets.get(str(company["id"])) or {}
            payload["statementPresets"] = presets
            segment_quarter_count = sum(1 for item in payload["financials"].values() if item.get("officialRevenueSegments"))
            payload["coverage"] = {
                "quarterCount": len(payload["quarters"]),
                "pixelReplicaQuarterCount": len(presets),
                "hasPixelReplica": bool(presets),
                "officialFinancialQuarterCount": len(payload["quarters"]),
                "officialSegmentQuarterCount": segment_quarter_count,
            }
            COMPANY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            (COMPANY_CACHE_DIR / f"{company['id']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            results_by_company_id[company["id"]] = payload

    save_fx_cache(fx_cache)
    companies = [results_by_company_id[company["id"]] for company in REFERENCE_COMPANIES if company["id"] in results_by_company_id]

    dataset = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "universeSource": REFERENCE_UNIVERSE_SOURCE,
        "companyCount": len(companies),
        "notes": [
            "Quarterly financial trunks are sourced through an official-first pipeline, using SEC EDGAR XBRL companyfacts whenever available.",
            "Revenue structure enrichment is sourced directly from official company filings and official IR disclosures, including PDF parsing for non-SEC issuers when needed.",
            "When official statement fields are incomplete or structurally incompatible, the renderer safely falls back to a normalized financial table source instead of fabricating the bridge.",
            "Pixel-replica layouts rely on manual presets and the unified replica template.",
        ],
        "companies": companies,
        "failures": failures,
    }
    OUTPUT_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[done] wrote {OUTPUT_PATH}", flush=True)
    if failures:
        print("[warn] partial failures detected:", flush=True)
        for failure in failures:
            print(f"  - {failure}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
