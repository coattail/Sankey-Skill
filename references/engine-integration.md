# Engine Integration

Use the standalone Earnings Chart Generator Studio project as the rendering engine:

- Engine root: `/Users/yuwan/Documents/New project/earnings-chart-generator-studio`
- Frontend entry: `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/index.html`
- Data loader: `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/js/app-04-bootstrap.js`
- Dataset builders: `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/`

## Preferred flow

1. Resolve the request into structured inputs:
   - ticker
   - company English name
   - optional Chinese name
   - optional target quarter like `2025Q4`
   - optional source override like `stockanalysis`
2. Run `scripts/build_single_company_images.py` to build the workspace and export local chart PNG files directly.
3. Return the local image paths to the user instead of a localhost preview link.
4. Confirm:
   - the right company is selected by default
   - the requested quarter exists
   - both Sankey and bar chart PNGs render
   - any available official cost-of-revenue or operating-expense taxonomy is surfaced as explicit Sankey branches instead of being silently collapsed into a total-only node
   - signed/loss-making stages still render as a pure Sankey; the renderer must keep widths conservative instead of switching to detached hybrid bridge lists
   - no minimum-height compensation makes a downstream node or branch thicker than the source ribbon that feeds it
   - if operating expenses exceed gross profit, the operating-expense node only encodes the covered portion and the overflow-to-loss portion is explained separately
   - company logos are auto-resolved from the official website path and stored back into `data/logo-catalog.json` with alias mappings

## Automatic source strategy

- Prefer official SEC/companyfacts for ordinary U.S. issuers.
- Use `--financial-source stockanalysis` only when the issuer is not handled well by SEC/companyfacts or the company is a non-SEC sample.
- Always prefer official filing links and official IR pages when the user gives a link.

## Unified extraction engine

The studio now has a first-pass extraction orchestration layer in `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/extraction_engine.py`.

- Source adapters live under `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/source_adapters/`.
- Canonical statement and breakdown taxonomy normalization lives in `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/taxonomy_normalizer.py`.
- Shared OCR helpers live in `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/ocr_utils.py` and compile the local Vision bridge at `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/vision_ocr.swift`.
- The payload builder keeps the existing source-specific parsers, then merges a unified field-level view back into the company payload.

Current precedence is intentionally field-specific instead of company-specific:

- statement totals: prefer `manual_financials`, then `official_financials`, then `stockanalysis_financials`
- revenue taxonomy: prefer `official_revenue_structures`, then `official_segments`
- expense taxonomy: prefer manual/official explicit breakdowns, then supplemental structured components, then normalized mixed-source residual reconstruction

The merged company payload may now include:

- top-level `unifiedExtraction`
- quarter-level `fieldSources`
- quarter-level `extractionDiagnostics`
- generic `costBreakdown` / `opexBreakdown` when a usable breakdown exists but an `official*` field is not present
- quarter-level `costBreakdownProfile` when the best available representation is profile-assisted instead of directly disclosed

Current built-in adapters include:

- `manual_financials`
- `manual_revenue_structures`
- `official_financials`
- `generic_filing_tables`
- `generic_ir_pdf`
- `stockanalysis_financials`
- `supplemental_components`
- `official_segments`
- `official_revenue_structures`

`extractionDiagnostics` is the current machine-readable quality layer. It reports coverage, residuals, mode flags such as `profile-assisted`, and issue tags such as low segment coverage. This is the main place to inspect before deciding whether a new source adapter or a one-off manual patch is needed.

It now also preserves statement-level parser hints when available:

- `statementSource`
- `statementValueMode`
- `statementSpanQuarters`
- `statementQualityFlags`

The current generic parser layer is:

- active: SEC filing HTML tables and EX-99 earnings-release tables via `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/generic_filing_table_parser.py`
- active: IR/filing PDF text extraction via `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/generic_ir_pdf_parser.py`, including fiscal-year quarter headers, generic expense-section breakdown capture, challenge-page-aware official-site fallback (`curl` plus mirror text), Chinese statement aliasing plus quarterly-summary revenue fallback, and page-level OCR fallback for image-heavy or low-text PDFs
- still limited: Cloudflare-protected PDF downloads that block both direct fetch and mirror fallback, and locale-specific statement grammars outside the current English/CJK alias map

The parser stack now uses a shared period model in `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/statement_periods.py`.

- Parsers emit raw `period entries` with `statementSpanQuarters` and `statementValueMode` instead of assuming every extracted table is already single-quarter.
- The finalization pass prefers direct quarter records first, then derives missing quarters from cumulative disclosures.
- Entry ranking is quality-first rather than date-first: more complete direct-quarter records outrank later but weaker partial rows, and derived provenance metadata does not overwrite a stronger direct source that is only borrowing fallback fields.
- Derivation supports both:
  - cumulative minus prior cumulative, for example `Q3 YTD - H1 YTD`
  - cumulative minus already-finalized prior quarter records, for example `Nine Months Ended - (Q1 + Q2)`
- This allows the generic adapters to recover quarter-level revenue, cost, opex, pretax, tax, and net income from:
  - English `Six Months Ended`, `Nine Months Ended`, `Year Ended`, and `Q3 YTD` layouts
  - Chinese `截至 ... 止 6/9/12 个月期间` layouts
  - Chinese quarter-report profit tables that use `年初到报告期末利润表` plus continuation pages for tax/net-income rows
- Fiscal-header parsing is now preferred over generic `Year Ended` fallback when a page exposes explicit fiscal-quarter grids. This prevents multi-year stat books from collapsing a 7-column quarter table into a 2-column annual span.
- The IR PDF adapter now treats page-1 earnings-release summary tables as a first-class source. It handles news-release wording variants such as `consolidated results for the quarter ended ...` and OCR-fragmented units like `bil lion` / `billio n`, so older IR PDFs can still yield direct quarter revenue, operating income, and net income.
- The OCR layer is now shared instead of company-specific. It can OCR standalone images and directly render PDF pages through macOS Vision/PDFKit, which gives the generic IR PDF parser a fallback path for scanned or image-dominant earnings releases even when `pypdf` text extraction is sparse.
- OCR output is now available in both plain-text and structured bounding-box form. The generic IR PDF parser uses the structured observations to rebuild row-like table text before running the normal statement-row parser, which makes scanned summary tables much more likely to survive into the shared period model instead of stopping at raw OCR blobs.
- Structured OCR is now also column-aware. The generic IR PDF parser clusters OCR boxes into column bands and rebuilds grid-style lines such as `Revenue | current GAAP | current adjusted | prior GAAP | prior adjusted`, which materially improves scanned summary-table recovery for release PDFs and other multi-column layouts.
- The OCR/grid header parser now recognizes multi-span statement headers such as `Three Months Ended | Nine Months Ended` followed by split date/year rows. This lets scanned formal income statements emit both direct-quarter and cumulative period entries from the same OCR-rebuilt table instead of only recovering the first visible pair of columns.
- The IR PDF parser also drops obvious segment/division statement pages when the footer identifies a business segment page instead of a consolidated statement page. This reduces false positives from issuer stat books that mix consolidated and segment-level statements in the same PDF.
- Official-site PDF discovery now crawls a small archive graph instead of stopping at the first few root pages. It follows high-signal IR archive pages such as quarterly results, statistical books, financial timelines, and investor-news detail pages, then keeps statement-like PDFs while filtering out transcripts, decks, roadshows, policy PDFs, and other non-statement attachments.
- Official-site PDF history scanning now optimizes for a continuous quarter window instead of a raw unique-quarter count. This prevents the crawler from stopping early when it has enough scattered quarters but is still missing older releases needed to close gaps in the bar-chart history.
- Generic expense-section breakdown capture now stops when the parser hits downstream statement totals such as operating income, pretax income, tax, net income, EPS, or dividend rows, which reduces false category capture in long stat-book/10-Q tables.
- Taxonomy normalization is no longer exact-alias-only. Breakdown categories now support keyword inference, total-row rejection, and same-taxonomy aggregation, so variants such as `sales and distribution`, `advertising`, `general corporate overhead`, `interest expense`, and `product development` can still land in stable canonical buckets.
- For annual stat-book pages that mix `Annual ... Statements of Income` with a current `Qx YTD` column, the parser only trusts the latest/current fiscal-year column. Earlier fiscal-year columns on those pages are treated as annual history, not same-basis quarter/YTD comparables.
- The frontend now exposes a browser automation export API, and `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/export_preview_images.js` uses Chrome headless plus the exact in-browser renderer to save local Sankey/bar PNG files.

This is the extensibility hook for future adapters such as IR PDF extractors, CN/JP/HK disclosure adapters, or third-party structured fallbacks.

## Regression Suite

Use `/Users/yuwan/Documents/New project/earnings-chart-generator-studio/scripts/run_parser_regression_suite.py` to re-run the current parser golden cases. The suite currently covers:

- FedEx release-summary OCR-only recovery
- FedEx formal statement OCR-only recovery
- BYD cumulative-quarter derivation
- taxonomy normalization aggregation/rejection
- FedEx continuous history window preservation

## Example

```bash
python3 /Users/yuwan/Documents/New\ project/earnings-chart-generator-studio/scripts/build_single_company_images.py \
  --ticker SAP \
  --name-en SAP \
  --quarter 2025Q4
```
