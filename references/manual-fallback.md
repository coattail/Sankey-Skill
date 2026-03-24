# Manual Fallback

Use this fallback when the engine cannot auto-extract a company or a quarter from official data sources.

## Goal

Produce a temporary single-company preview even if automatic data extraction is incomplete.

## Minimum bar chart payload

Inside `data/earnings-dataset.json`, each company needs:

- `id`
- `ticker`
- `nameEn`
- `nameZh`
- `slug`
- `rank`
- `isAdr`
- `brand`
- `quarters`
- `financials`

Each quarter entry should include at least:

- `periodEnd`
- `fiscalLabel`
- `revenueBn`

For the bar chart, add:

- `officialRevenueSegments`

Each segment row should include:

- `name`
- `memberKey`
- `valueBn`

Optional but useful:

- `nameZh`
- `yoyPct`
- `qoqPct`
- `mixPct`
- `sourceUrl`
- `filingDate`

## Minimum Sankey payload

For Sankey rendering, the target quarter should ideally also include:

- `costOfRevenueBn` or `grossProfitBn`
- `operatingExpensesBn` or at least enough detail to derive it
- `operatingIncomeBn`
- `taxBn`
- `netIncomeBn`

Optional detailed breakdown fields:

- `sgnaBn`
- `rndBn`
- `otherOpexBn`
- `officialRevenueDetailGroups`
- `officialRevenueStyle`

## Fallback workflow

1. Read the official filing, shareholder letter, or earnings release.
2. Extract the exact quarter values instead of estimating.
3. Patch the generated single-company `data/earnings-dataset.json`.
4. Refresh the local preview.

## Rule

Never infer exact quarterly values if the user asked for accurate official data. If an official number is missing, keep it missing and explain the gap.
