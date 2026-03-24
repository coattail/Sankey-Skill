---
name: earnings-chart-generator
description: Build arbitrary-company earnings Sankey and revenue bar chart previews from a company request or an official filing link. Use when the user wants charts for any public company and quarter, or wants Codex to turn official earnings or filing data into chart-ready payloads.
---

# Earnings Chart Generator

Create a temporary one-company preview site from the standalone `earnings-chart-generator-studio` project for any public company and quarter.

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

### 2. Build the single-company preview workspace

Use the standalone project at `/Users/yuwan/Documents/New project/earnings-chart-generator-studio`.

Run:

```bash
python3 /Users/yuwan/Documents/New\ project/earnings-chart-generator-studio/scripts/build_single_company_preview.py \
  --ticker <TICKER> \
  --name-en "<ENGLISH_NAME>" \
  [--name-zh "<CHINESE_NAME>"] \
  [--quarter 2025Q4] \
  [--financial-source stockanalysis] \
  [--refresh]
```

Read `references/engine-integration.md` if you need the exact engine assumptions.

### 3. Start the local preview

Serve the generated workspace with a static file server, for example:

```bash
python3 -m http.server 9036 --directory "/Users/yuwan/Documents/New project/earnings-chart-generator-studio/tmp/<company>-<quarter>"
```

Then give the user the local URL and tell them that the preview contains:

- Sankey mode
- Bar chart mode

### 4. Validate the output

Check:

- the company is selected by default
- the expected quarter exists
- Sankey renders
- bar chart renders
- labels, logo, and layout are sane enough for review

### 5. Use manual fallback when automation is incomplete

If the engine cannot fully extract a company from official sources:

- keep using the generated temporary workspace
- patch `data/earnings-dataset.json` with exact official values
- do not fabricate exact numbers

Read `references/manual-fallback.md` for the minimum payload shape.

## Notes

- Prefer official SEC/companyfacts for ordinary U.S. issuers.
- Use `stockanalysis` only when the issuer is outside the SEC-first path or the engine already relies on that source.
- Treat this skill as an arbitrary-company chart-generation path backed by the standalone `earnings-chart-generator-studio` project.
