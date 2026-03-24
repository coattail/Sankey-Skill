---
name: earnings-chart-generator
description: Build arbitrary-company earnings Sankey and revenue bar chart previews from a company request or an official filing link. Use when the user wants charts for any public company and quarter, or wants Codex to turn official earnings or filing data into chart-ready payloads.
---

# Earnings Chart Generator

Create local Sankey and revenue bar-chart image files from the standalone `earnings-chart-generator-studio` project for any public company and quarter.

## Workflow

### 1. Resolve the request into structured inputs

If the user gives a company name and quarter:

- Resolve the ticker and official company name first.
- Use the requested quarter if it is explicit.

If the user gives an official filing or earnings link:

- Browse the link.
- Extract company name, ticker, and target quarter from the official page or filing.
- Prefer official filing metadata over guesses.

If the request is time-sensitive or asks for the latest quarter, browse to verify the latest official release before generating.

### 2. Build and export local chart images

Use the standalone project at `/Users/yuwan/Documents/New project/earnings-chart-generator-studio`.

Run:

```bash
python3 /Users/yuwan/Documents/New\ project/earnings-chart-generator-studio/scripts/build_single_company_images.py \
  --ticker <TICKER> \
  --name-en "<ENGLISH_NAME>" \
  [--name-zh "<CHINESE_NAME>"] \
  [--quarter 2025Q4] \
  [--financial-source stockanalysis] \
  [--refresh]
```

Read `references/engine-integration.md` if you need the exact engine assumptions.

The studio also contains a unified extraction layer that reconciles multiple adapters into one quarter-level payload:

- adapters: `scripts/source_adapters/`
- normalizer: `scripts/taxonomy_normalizer.py`
- reconciler: `scripts/extraction_engine.py`
- quality signals: quarter-level `fieldSources` and `extractionDiagnostics`
- generic filing parser: `scripts/generic_filing_table_parser.py`
- generic PDF parser: `scripts/generic_ir_pdf_parser.py`

The command returns JSON including:

- the generated workspace path
- the Sankey PNG path
- the bar-chart PNG path

### 3. Return local image files, not localhost links

- Do not give the user a preview URL or background localhost link by default.
- Return the absolute local PNG paths directly.
- In Codex desktop replies, prefer embedding the local image files directly with Markdown image tags that use absolute paths.

### 4. Validate the output

Check:

- the company is selected by default
- the expected quarter exists
- Sankey PNG renders
- bar chart PNG renders
- when official cost or expense classifications are available, the Sankey shows them as real branches instead of collapsing them into a single undifferentiated node
- if a company only discloses partial cost taxonomy, prefer exact official categories first and use an explicit profile/manual fallback only for the undisclosed remainder
- Sankey stays pure even in loss-making quarters; do not fall back to hybrid side lists or detached signed bridges
- every Sankey node and ribbon keeps strict width conservation; do not use minimum-height inflation that makes a downstream node or branch thicker than its source flow
- if operating expenses exceed gross profit, the operating-expense node must only encode the gross-profit-covered portion and explicitly explain the overflow-to-loss portion
- the bar chart reaches a continuous 30-quarter window whenever the combined financial sources can support it
- historical revenue-category parsers handle both direct-quarter and cumulative-only tables (`six months`, `nine months`, `year ended`) before deriving quarter bars
- historical revenue-category parsers normalize table-unit changes such as `In thousands` vs `In millions` before writing `valueBn`
- if the issuer uses `stockanalysis`, confirm any available official 6-K / earnings-release fallback was merged before signing off
- the preview auto-resolves a real company logo from the official website path when possible and writes the canonical logo plus aliases into `data/logo-catalog.json`
- labels, logo, and layout are sane enough for review

### 5. Use manual fallback when automation is incomplete

If the engine cannot fully extract a company from official sources:

- keep using the generated temporary workspace
- patch `data/earnings-dataset.json` with exact official values
- prefer `officialCostBreakdown`, `officialOpexBreakdown`, or `costBreakdownProfile` when only part of the expense taxonomy is explicitly disclosed
- do not fabricate exact numbers

Read `references/manual-fallback.md` for the minimum payload shape.

## Notes

- Prefer official SEC/companyfacts for ordinary U.S. issuers.
- Use `stockanalysis` only when the issuer is outside the SEC-first path or the engine already relies on that source.
- For foreign ADRs and other `stockanalysis`-backed issuers, merge official 6-K / earnings-release fallbacks when they add longer quarterly history or better official revenue taxonomy.
- When debugging extraction quality, inspect `unifiedExtraction` and per-quarter `fieldSources` before adding a one-off company patch.
- If a quarter still needs manual intervention, prefer adding a structured adapter or structured supplemental/manual source before patching raw frontend JSON.
- The exported images come from the same in-browser rendering code used by the studio UI; the headless exporter only automates selection and file saving.
- Treat this skill as an arbitrary-company chart-generation path backed by the standalone `earnings-chart-generator-studio` project.
