#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BUILD_SCRIPT = SCRIPT_DIR / "build_single_company_preview.py"
EXPORT_SCRIPT = SCRIPT_DIR / "export_preview_images.js"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a single-company preview workspace and export local chart PNGs."
    )
    parser.add_argument("--ticker", required=True, help="Ticker symbol, for example AAPL or SAP.")
    parser.add_argument("--company-id", default="", help="Optional stable company id.")
    parser.add_argument("--name-en", default="", help="Optional English company name.")
    parser.add_argument("--name-zh", default="", help="Optional Chinese company name.")
    parser.add_argument("--slug", default="", help="Optional URL slug.")
    parser.add_argument("--quarter", default="", help="Optional quarter key such as 2025Q4.")
    parser.add_argument(
        "--financial-source",
        default="",
        choices=("", "stockanalysis"),
        help="Optional financial source override.",
    )
    parser.add_argument("--financial-ticker", default="", help="Optional StockAnalysis ticker override.")
    parser.add_argument("--is-adr", action="store_true", help="Mark the company as ADR/non-US listing.")
    parser.add_argument("--rank", type=float, default=999.0, help="Display rank used by the frontend.")
    parser.add_argument("--refresh", action="store_true", help="Refresh remote caches before building.")
    parser.add_argument("--output-dir", default="", help="Optional preview workspace path.")
    parser.add_argument("--filing-url", default="", help="Optional filing/report URL kept for bookkeeping.")
    parser.add_argument("--image-output-dir", default="", help="Optional directory for exported chart images.")
    parser.add_argument("--language", choices=("zh", "en"), default="zh", help="Chart language.")
    parser.add_argument("--mode", choices=("both", "sankey", "bars"), default="both", help="Which charts to export.")
    parser.add_argument("--png-scale", type=float, default=1.0, help="PNG rasterization scale multiplier.")
    parser.add_argument("--include-svg", action="store_true", help="Also export SVG files next to PNG files.")
    parser.add_argument("--chrome-path", default="", help="Optional Chrome/Chromium executable path.")
    return parser.parse_args()


def build_preview(args: argparse.Namespace) -> dict:
    command = [
        sys.executable,
        str(BUILD_SCRIPT),
        "--ticker",
        args.ticker,
        "--rank",
        str(args.rank),
    ]
    optional_pairs = [
        ("--company-id", args.company_id),
        ("--name-en", args.name_en),
        ("--name-zh", args.name_zh),
        ("--slug", args.slug),
        ("--quarter", args.quarter),
        ("--financial-source", args.financial_source),
        ("--financial-ticker", args.financial_ticker),
        ("--output-dir", args.output_dir),
        ("--filing-url", args.filing_url),
    ]
    for flag, value in optional_pairs:
        if value:
            command.extend([flag, str(value)])
    if args.is_adr:
        command.append("--is-adr")
    if args.refresh:
        command.append("--refresh")

    completed = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def export_images(preview_summary: dict, args: argparse.Namespace) -> dict:
    workspace = preview_summary["workspace"]
    output_dir = args.image_output_dir or str(Path(workspace) / "exports")
    command = [
        "node",
        str(EXPORT_SCRIPT),
        "--workspace",
        workspace,
        "--output-dir",
        output_dir,
        "--company-id",
        preview_summary.get("companyId") or args.company_id or "",
        "--ticker",
        preview_summary.get("ticker") or args.ticker,
        "--quarter",
        preview_summary.get("selectedQuarter") or args.quarter,
        "--language",
        args.language,
        "--mode",
        args.mode,
        "--scale",
        str(args.png_scale),
    ]
    if args.name_en:
        command.extend(["--name", args.name_en])
    if args.chrome_path:
        command.extend(["--chrome-path", args.chrome_path])
    if args.include_svg:
        command.append("--include-svg")

    completed = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def main() -> int:
    args = parse_args()
    preview_summary = build_preview(args)
    export_summary = export_images(preview_summary, args)
    result = {
        "engineRoot": preview_summary.get("engineRoot"),
        "workspace": preview_summary.get("workspace"),
        "datasetPath": preview_summary.get("datasetPath"),
        "companyId": preview_summary.get("companyId"),
        "ticker": preview_summary.get("ticker"),
        "nameEn": preview_summary.get("nameEn"),
        "nameZh": preview_summary.get("nameZh"),
        "availableQuarters": preview_summary.get("availableQuarters", []),
        "selectedQuarter": preview_summary.get("selectedQuarter"),
        "imageOutputDir": export_summary.get("outputDir"),
        "charts": export_summary.get("charts", []),
        "barCoverageDiagnostics": next(
            (item.get("coverageDiagnostics") for item in export_summary.get("charts", []) if item.get("viewMode") == "bars"),
            None,
        ),
        "filingUrl": preview_summary.get("filingUrl") or "",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
