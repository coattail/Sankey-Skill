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
2. Run `scripts/build_single_company_preview.py`.
3. Start a local static server against the generated workspace.
4. Open the local link and confirm:
   - the right company is selected by default
   - the requested quarter exists
   - both Sankey and bar chart modes render

## Automatic source strategy

- Prefer official SEC/companyfacts for ordinary U.S. issuers.
- Use `--financial-source stockanalysis` only when the issuer is not handled well by SEC/companyfacts or the company is a non-SEC sample.
- Always prefer official filing links and official IR pages when the user gives a link.

## Example

```bash
python3 /Users/yuwan/Documents/New\ project/earnings-chart-generator-studio/scripts/build_single_company_preview.py \
  --ticker SAP \
  --name-en SAP \
  --quarter 2025Q4
```

Then serve the generated workspace:

```bash
python3 -m http.server 9036 --directory "/Users/yuwan/Documents/New project/earnings-chart-generator-studio/tmp/sap-2025q4"
```
