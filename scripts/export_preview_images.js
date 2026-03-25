#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const puppeteer = require("puppeteer-core");

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
});

function parseArgs(argv) {
  const args = {
    workspace: "",
    outputDir: "",
    companyId: "",
    company: "",
    ticker: "",
    name: "",
    quarter: "",
    language: "zh",
    mode: "both",
    scale: "1",
    chromePath: "",
    includeSvg: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "include-svg") {
      args.includeSvg = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    index += 1;
    if (key === "output-dir") args.outputDir = value;
    else if (key === "company-id") args.companyId = value;
    else if (key === "workspace") args.workspace = value;
    else if (key === "company") args.company = value;
    else if (key === "ticker") args.ticker = value;
    else if (key === "name") args.name = value;
    else if (key === "quarter") args.quarter = value;
    else if (key === "language") args.language = value;
    else if (key === "mode") args.mode = value;
    else if (key === "scale") args.scale = value;
    else if (key === "chrome-path") args.chromePath = value;
    else throw new Error(`Unknown argument: --${key}`);
  }
  if (!args.workspace) {
    throw new Error("Missing required argument --workspace");
  }
  return args;
}

function resolveChromeExecutablePath(preferredPath) {
  const candidates = [
    preferredPath,
    process.env.CHROME_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error("Unable to locate a Chrome/Chromium executable. Pass --chrome-path if needed.");
  }
  return match;
}

function safeSlug(value, fallback = "chart") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Invalid PNG data URL returned by automation export.");
  }
  return Buffer.from(match[2], "base64");
}

function mimeTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function ensureInsideRoot(rootDir, targetPath) {
  const relative = path.relative(rootDir, targetPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function createStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(requestUrl.pathname || "/");
      if (pathname === "/") pathname = "/index.html";
      const candidate = path.resolve(rootDir, `.${pathname}`);
      if (!ensureInsideRoot(rootDir, candidate) && candidate !== path.join(rootDir, "index.html")) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }
      fs.readFile(candidate, (error, body) => {
        if (error) {
          response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
          return;
        }
        response.writeHead(200, {
          "Content-Type": mimeTypeFor(candidate),
          "Cache-Control": "no-store",
        });
        response.end(body);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to bind local static server."));
        return;
      }
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function exportCharts(args) {
  const workspace = path.resolve(args.workspace);
  const outputDir = path.resolve(args.outputDir || path.join(workspace, "exports"));
  fs.mkdirSync(outputDir, { recursive: true });

  const { server, origin } = await createStaticServer(workspace);
  const browser = await puppeteer.launch({
    executablePath: resolveChromeExecutablePath(args.chromePath),
    headless: true,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1720,
      height: 1600,
      deviceScaleFactor: 1,
    });
    await page.goto(`${origin}/`, { waitUntil: "networkidle0" });
    const payload = await page.evaluate(async (options) => {
      const automation = window.earningsImageStudioAutomation;
      if (!automation) {
        throw new Error("Automation export API is unavailable.");
      }
      await automation.waitUntilReady();
      return automation.exportChartSet(options);
    }, {
      companyId: args.companyId || "",
      company: args.company || "",
      ticker: args.ticker || "",
      name: args.name || "",
      quarterKey: args.quarter || "",
      language: args.language === "en" ? "en" : "zh",
      scaleFactor: Math.max(Number(args.scale || 1), 1),
      modes:
        args.mode === "sankey"
          ? ["sankey"]
          : args.mode === "bars"
            ? ["bars"]
            : ["sankey", "bars"],
    });

    const baseStem = safeSlug(`${payload.companyId || args.companyId || args.ticker || "company"}-${payload.quarterKey || args.quarter || "latest"}`);
    const exportedCharts = (payload.exports || []).map((item) => {
      const modeSuffix = item.viewMode === "bars" ? "segment-bars" : "sankey";
      const pngPath = path.resolve(outputDir, `${baseStem}-${modeSuffix}.png`);
      fs.writeFileSync(pngPath, dataUrlToBuffer(item.pngDataUrl));

      let svgPath = null;
      if (args.includeSvg && item.svgText) {
        svgPath = path.resolve(outputDir, `${baseStem}-${modeSuffix}.svg`);
        fs.writeFileSync(svgPath, item.svgText, "utf-8");
      }

      return {
        viewMode: item.viewMode,
        language: item.language,
        renderFilenameStem: item.filenameStem,
        pngPath,
        svgPath,
        width: item.width,
        height: item.height,
        status: item.status,
        coverageDiagnostics: item.coverageDiagnostics || null,
      };
    });

    return {
      workspace,
      outputDir,
      serverOrigin: origin,
      companyId: payload.companyId || "",
      quarterKey: payload.quarterKey || "",
      language: payload.language || args.language,
      charts: exportedCharts,
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await exportCharts(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exit(1);
});
