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
```

Build a preview:

```bash
python3 scripts/build_single_company_preview.py --ticker ADBE --name-en "Adobe Inc." --quarter 2025Q4
```

Serve the generated preview:

```bash
python3 -m http.server 9036 --directory "tmp/adobe-inc-2025q4"
```

Open [http://127.0.0.1:9036](http://127.0.0.1:9036).
