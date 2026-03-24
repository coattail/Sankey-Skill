#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import official_segments
from company_payload_builder import build_arbitrary_company_payload
from build_dataset import load_manual_presets
from company_logo_resolver import ensure_logo_catalog_entry


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE_ROOT = PROJECT_ROOT / "tmp"
PUBLIC_ROOT_FILES = ("index.html", "style.css", "favicon.svg")
PUBLIC_DATA_FILES = ("logo-catalog.json", "supplemental-components.json")
BRAND_PALETTE = (
    ("#2563EB", "#111827", "#DBEAFE"),
    ("#0F766E", "#111827", "#CCFBF1"),
    ("#C2410C", "#111827", "#FFEDD5"),
    ("#7C3AED", "#111827", "#EDE9FE"),
    ("#B91C1C", "#111827", "#FEE2E2"),
    ("#155E75", "#111827", "#CFFAFE"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a single-company temporary preview workspace for the standalone Earnings Chart Generator Studio frontend."
    )
    parser.add_argument("--ticker", required=True, help="Ticker symbol, for example MSFT or SAP.")
    parser.add_argument("--company-id", default="", help="Optional stable company id. Defaults to a slugified ticker/name.")
    parser.add_argument("--name-en", default="", help="Optional English company name.")
    parser.add_argument("--name-zh", default="", help="Optional Chinese company name.")
    parser.add_argument("--slug", default="", help="Optional URL slug. Defaults to lowercase ticker.")
    parser.add_argument("--quarter", default="", help="Optional quarter key such as 2025Q4. Defaults to the latest available quarter.")
    parser.add_argument(
        "--financial-source",
        default="",
        choices=("", "stockanalysis"),
        help="Optional financial source override. Leave empty for official SEC/companyfacts.",
    )
    parser.add_argument("--financial-ticker", default="", help="Optional StockAnalysis ticker override.")
    parser.add_argument("--is-adr", action="store_true", help="Mark the company as ADR/non-US listing for display purposes.")
    parser.add_argument("--rank", type=float, default=999.0, help="Display rank used by the frontend. Defaults to 999.")
    parser.add_argument("--refresh", action="store_true", help="Refresh remote caches before building the payload.")
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional output directory for the generated preview workspace. Defaults to <project>/tmp/<company>-<quarter>.",
    )
    parser.add_argument("--filing-url", default="", help="Optional official filing/report URL kept for bookkeeping in the summary output.")
    return parser.parse_args()


def normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return slug or "company"


def deterministic_brand(ticker: str) -> dict[str, str]:
    seed = sum(ord(character) for character in str(ticker or "").upper())
    primary, secondary, accent = BRAND_PALETTE[seed % len(BRAND_PALETTE)]
    return {"primary": primary, "secondary": secondary, "accent": accent}


def resolve_name_from_sec(ticker: str, refresh: bool) -> str:
    try:
        cik = official_segments._resolve_cik(str(ticker or ""), refresh=refresh)
        if cik is None:
            return ""
        submissions = official_segments._request_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        return str(submissions.get("name") or "").strip()
    except Exception:
        return ""


def build_company_record(args: argparse.Namespace) -> dict[str, Any]:
    ticker = str(args.ticker or "").strip().upper()
    if not ticker:
        raise ValueError("Ticker is required.")
    resolved_name_en = str(args.name_en or "").strip() or resolve_name_from_sec(ticker, refresh=args.refresh)
    if not resolved_name_en:
        resolved_name_en = ticker
    resolved_name_zh = str(args.name_zh or "").strip() or resolved_name_en
    slug = str(args.slug or "").strip() or ticker.lower()
    company_id = str(args.company_id or "").strip() or normalize_slug(resolved_name_en if resolved_name_en != ticker else ticker.lower())
    company = {
        "id": company_id,
        "ticker": ticker,
        "nameZh": resolved_name_zh,
        "nameEn": resolved_name_en,
        "slug": slug,
        "rank": float(args.rank),
        "isAdr": bool(args.is_adr),
        "brand": deterministic_brand(ticker),
    }
    if args.financial_source:
        company["financialSource"] = args.financial_source
    if args.financial_ticker:
        company["financialTicker"] = str(args.financial_ticker).strip().lower()
    return company


def build_company_payload(company: dict[str, Any], refresh: bool) -> dict[str, Any]:
    payload = build_arbitrary_company_payload(company, refresh=refresh)
    manual_presets = load_manual_presets()
    payload["statementPresets"] = manual_presets.get(str(company.get("id") or "").strip().lower()) or {}
    segment_quarter_count = sum(1 for item in payload.get("financials", {}).values() if item.get("officialRevenueSegments"))
    payload["coverage"] = {
        "quarterCount": len(payload.get("quarters", [])),
        "pixelReplicaQuarterCount": len(payload["statementPresets"]),
        "hasPixelReplica": bool(payload["statementPresets"]),
        "officialFinancialQuarterCount": len(payload.get("quarters", [])),
        "officialSegmentQuarterCount": segment_quarter_count,
    }
    return payload


def validate_target_quarter(payload: dict[str, Any], requested_quarter: str) -> str:
    available_quarters = [str(item) for item in payload.get("quarters", []) if str(item)]
    if not available_quarters:
        raise RuntimeError("No usable quarters were fetched for this company.")
    if requested_quarter:
        if requested_quarter not in available_quarters:
            raise RuntimeError(
                f"Requested quarter {requested_quarter} is not available. Available quarters: {', '.join(available_quarters)}"
            )
        return requested_quarter
    return available_quarters[-1]


def build_dataset_payload(company_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "generatedAt": company_payload.get("generatedAt") or "",
        "universeSource": {
            "label": "single-company-preview",
            "url": "",
            "as_of": "",
            "note": "Generated by the earnings-chart-generator standalone project.",
        },
        "companyCount": 1,
        "notes": [
            "Single-company temporary preview generated by the earnings-chart-generator standalone project.",
            "The preview shell and data pipeline are bundled inside this standalone project.",
        ],
        "companies": [company_payload],
        "failures": company_payload.get("errors", []),
    }


def reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_preview_shell(engine_root: Path, output_dir: Path, dataset_payload: dict[str, Any]) -> None:
    for filename in PUBLIC_ROOT_FILES:
        shutil.copy2(engine_root / filename, output_dir / filename)
    shutil.copytree(engine_root / "js", output_dir / "js")

    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    for filename in PUBLIC_DATA_FILES:
        shutil.copy2(engine_root / "data" / filename, data_dir / filename)
    (data_dir / "earnings-dataset.json").write_text(
        json.dumps(dataset_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    engine_root = PROJECT_ROOT
    company = build_company_record(args)
    logo_entry = ensure_logo_catalog_entry(company, refresh=args.refresh)
    if isinstance(logo_entry, dict):
        if logo_entry.get("website") and not company.get("website"):
            company["website"] = logo_entry.get("website")
        if logo_entry.get("domain") and not company.get("domain"):
            company["domain"] = logo_entry.get("domain")
    company_payload = build_company_payload(company, refresh=args.refresh)
    selected_quarter = validate_target_quarter(company_payload, str(args.quarter or "").strip())
    dataset_payload = build_dataset_payload(company_payload)

    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else (DEFAULT_WORKSPACE_ROOT / f"{company['id']}-{selected_quarter.lower()}").resolve()
    )
    reset_directory(output_dir)
    copy_preview_shell(engine_root, output_dir, dataset_payload)

    summary = {
        "engineRoot": str(engine_root),
        "workspace": str(output_dir),
        "datasetPath": str(output_dir / "data" / "earnings-dataset.json"),
        "companyId": company["id"],
        "ticker": company["ticker"],
        "nameEn": company["nameEn"],
        "nameZh": company["nameZh"],
        "availableQuarters": company_payload.get("quarters", []),
        "selectedQuarter": selected_quarter,
        "filingUrl": str(args.filing_url or "").strip(),
        "serveCommand": f"python3 -m http.server 9036 --directory '{output_dir}'",
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
