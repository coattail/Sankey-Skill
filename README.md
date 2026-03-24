# Earnings Chart Generator Studio

Standalone project for generating arbitrary-company earnings Sankey and revenue bar chart previews from official filings, SEC/companyfacts data, or supported fallback sources.

## What It Includes

- standalone frontend shell for Sankey and bar chart rendering
- standalone arbitrary-company data-build pipeline
- Codex skill metadata so the project can also serve as the source of truth for the installed skill

## Quick Start

Install dependencies:

```bash
python3 -m pip install -r requirements.txt
npm install
```

Build local chart images:

```bash
python3 scripts/build_single_company_images.py --ticker ADBE --name-en "Adobe Inc." --quarter 2025Q4
```

The command prints JSON with local output paths for:

- the generated workspace
- the Sankey PNG
- the revenue segment bar-chart PNG

If you need to inspect the workspace manually, `scripts/build_single_company_preview.py` is still available for local preview/debug flows.
