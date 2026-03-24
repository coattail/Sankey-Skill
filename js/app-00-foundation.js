const state = {
  dataset: null,
  supplementalComponents: {},
  logoCatalog: {},
  normalizedLogoKeys: {},
  logoNormalizationJobs: {},
  sortedCompanies: [],
  companyById: {},
  selectedCompanyId: null,
  selectedQuarter: null,
  chartViewMode: "sankey",
  uiLanguage: "zh",
  filteredCompanyIds: [],
  currentSnapshot: null,
  pendingRenderFrame: 0,
  editor: {
    enabled: false,
    selectedNodeId: null,
    dragging: null,
    rerenderFrame: 0,
    overridesBySession: {},
  },
  calibration: {
    overlayEnabled: false,
    overlayOpacity: 35,
    overlayImageDataUrl: null,
    tokenOverridesByPreset: {},
    tokenDraftByPreset: {},
  },
};

const BUILD_ASSET_VERSION = "20260324-company-pool-v127";
const CORPORATE_LOGO_AREA_MULTIPLIER = 1.728;
const CORPORATE_LOGO_LINEAR_SCALE_MULTIPLIER = Math.sqrt(CORPORATE_LOGO_AREA_MULTIPLIER);
const CORPORATE_LOGO_REVENUE_GAP_MULTIPLIER = 1.2;

const CORPORATE_LOGO_SCALE_OVERRIDES = {
  abbvie: 1.14,
  amazon: 1.18,
  asml: 1.12,
  "bank-of-america": 1.38,
  broadcom: 1.08,
  "coca-cola": 1.18,
  costco: 1.14,
  exxon: 1.12,
  jnj: 1.42,
  jpmorgan: 1.28,
  micron: 1.1,
  netflix: 1.12,
  oracle: 1.12,
  palantir: 1.1,
  "procter-gamble": 1.16,
  tsmc: 1.18,
  visa: 1.16,
  walmart: 1.16,
};

const CORPORATE_LOGO_BASE_SCALE_OVERRIDES = {
  berkshire: 1.12,
  "meta-corporate": 0.52,
  "amazon-corporate": 0.9,
  "tesla-corporate": 0.84,
  "nvidia-corporate": 1.02,
};

const DEFAULT_COMPANY_BRAND = Object.freeze({
  primary: "#2563EB",
  secondary: "#111827",
  accent: "#DBEAFE",
});

const COMPANY_METADATA_FALLBACKS = Object.freeze({
  tencent: Object.freeze({
    nameZh: "腾讯控股",
    nameEn: "Tencent",
    slug: "tcehy",
    rank: 14.5,
    isAdr: true,
    brand: {
      primary: "#1D9BF0",
      secondary: "#111827",
      accent: "#DBEEFF",
    },
  }),
  alibaba: Object.freeze({
    nameZh: "阿里巴巴",
    nameEn: "Alibaba",
    slug: "baba",
    rank: 30.5,
    isAdr: true,
    brand: {
      primary: "#FF6A00",
      secondary: "#111827",
      accent: "#FFE7D1",
    },
  }),
});

const BASE_CORPORATE_LOGO_TOKENS = {
  heroScale: 1.04,
  fallbackScale: 0.92,
  baseScales: CORPORATE_LOGO_BASE_SCALE_OVERRIDES,
  ratioScaleBands: [
    { min: 5.2, scale: 1 },
    { min: 3.2, scale: 0.98 },
    { min: 1.7, scale: 1 },
    { min: 0, scale: 1.04 },
  ],
};

const BASE_RIGHT_BAND_TOKENS = {
  deductions: {
    minOffsetFromNet: 28,
    maxOffsetAboveOpex: 44,
    minClamp: 420,
    maxClamp: 680,
    gap: 24,
    minGap: 10,
    centerStep: 18,
    heightOffset: -8,
  },
  costBreakdown: {
    minY: 744,
    maxY: 1002,
    gap: 24,
    minGap: 10,
    centerStart: 816,
    centerStep: 118,
    heightOffset: 0,
  },
  opex: {
    denseThreshold: 5,
    regular: {
      minY: 700,
      maxY: 1028,
      gap: 28,
      minGap: 10,
      centerStart: 736,
      centerStep: 126,
      heightOffset: 0,
    },
    dense: {
      minY: 670,
      maxY: 1042,
      gap: 12,
      minGap: 4,
      centerStart: 702,
      centerStep: 92,
      heightOffset: 0,
    },
  },
};

const BASE_TEMPLATE_TOKENS = {
  layout: {
    canvasWidth: 2048,
    canvasHeight: 1325,
    canvasDesignHeight: 1160,
    leftX: 368,
    revenueX: 742,
    sourceNodeWidth: 52,
    sourceLabelX: 68,
    sourceMetricOffsetX: 0,
    grossX: 1122,
    opX: 1480,
    rightX: 1688,
    opexTargetX: 1664,
    costBreakdownX: 1294,
    costBreakdownLabelX: 1362,
    rightLabelX: 1750,
    opexLabelX: 1726,
    belowLabelX: 1750,
    revenueTop: 330,
    revenueHeight: 452,
    chartBottomLimit: 1004,
    sourceNodeGap: 28,
    sourceNodeMinY: 284,
    sourceNodeMaxY: 1088,
    sourceFan: {
      spread: 1.12,
      exponent: 1.22,
      edgeBoost: 24,
      edgeExponent: 1.15,
      bandBias: 0.08,
      sideBoost: 18,
      sideExponent: 1.08,
    },
    grossNodeTop: 376,
    opNodeTop: 370,
    netNodeTop: 332,
    opexNodeTop: 612,
    costNodeTop: 804,
    opexSummaryX: 1604,
    opexSummaryY: 874,
    logoScale: 1,
    logoY: 166,
    titleFontSize: 82,
    titleMaxWidth: 1540,
    titleY: 112,
    quarterSummaryY: 136,
    quarterSummaryX: 1932,
    periodEndY: 188,
    periodEndX: 1932,
  },
  ribbon: {
    curveFactor: 0.42,
    topStartBias: 0.18,
    topEndBias: 0.82,
    bottomStartBias: 0.18,
    bottomEndBias: 0.82,
    startCurveFactor: 0.24,
    endCurveFactor: 0.2,
    minStartCurveFactor: 0.1,
    maxStartCurveFactor: 0.28,
    minEndCurveFactor: 0.08,
    maxEndCurveFactor: 0.24,
    deltaScale: 0.58,
    deltaInfluence: 0.11,
    thicknessInfluence: 0.035,
    sourceHorn: {
      startCurveFactor: 0.24,
      endCurveFactor: 0.18,
      minStartCurveFactor: 0.07,
      maxStartCurveFactor: 0.28,
      minEndCurveFactor: 0.06,
      maxEndCurveFactor: 0.22,
      deltaScale: 0.52,
      deltaInfluence: 0.16,
    },
  },
  logo: {
    corporate: BASE_CORPORATE_LOGO_TOKENS,
  },
  bands: BASE_RIGHT_BAND_TOKENS,
};

const TEMPLATE_STYLE_PRESETS = {
  "default-replica": BASE_TEMPLATE_TOKENS,
  "asml-technology-bridge": {
    layout: {
      leftX: 372,
      revenueX: 772,
      grossX: 1144,
      opX: 1492,
      rightX: 1702,
      revenueTop: 322,
      revenueHeight: 470,
      sourceNodeGap: 18,
      sourceNodeMaxY: 1024,
      logoScale: 1.06,
      titleFontSize: 80,
    },
    ribbon: {
      curveFactor: 0.44,
      topStartBias: 0.16,
      topEndBias: 0.84,
      bottomStartBias: 0.16,
      bottomEndBias: 0.84,
    },
  },
  "oracle-revenue-bridge": {
    layout: {
      revenueTop: 326,
      revenueHeight: 462,
      grossNodeTop: 366,
      opNodeTop: 364,
      netNodeTop: 324,
      logoScale: 1.04,
    },
  },
  "mastercard-revenue-bridge": {
    layout: {
      leftX: 360,
      revenueTop: 320,
      revenueHeight: 472,
      grossNodeTop: 372,
      opNodeTop: 366,
      netNodeTop: 328,
      logoScale: 1.08,
    },
    ribbon: {
      curveFactor: 0.45,
      topStartBias: 0.15,
      topEndBias: 0.85,
      bottomStartBias: 0.16,
      bottomEndBias: 0.84,
    },
  },
  "netflix-regional-revenue": {
    layout: {
      leftX: 356,
      revenueTop: 318,
      revenueHeight: 480,
      sourceNodeGap: 12,
      sourceNodeMaxY: 1008,
      grossNodeTop: 372,
      opNodeTop: 364,
      netNodeTop: 326,
      titleFontSize: 80,
    },
    ribbon: {
      curveFactor: 0.44,
      topStartBias: 0.17,
      topEndBias: 0.83,
      bottomStartBias: 0.17,
      bottomEndBias: 0.83,
    },
  },
  "tsmc-platform-mix": {
    layout: {
      leftX: 350,
      revenueTop: 314,
      revenueHeight: 488,
      sourceNodeGap: 10,
      sourceNodeMinY: 300,
      sourceNodeMaxY: 1126,
      grossNodeTop: 378,
      opNodeTop: 372,
      netNodeTop: 334,
      opexNodeTop: 626,
      titleFontSize: 79,
      logoScale: 1.08,
    },
    ribbon: {
      curveFactor: 0.4,
      topStartBias: 0.15,
      topEndBias: 0.85,
      bottomStartBias: 0.16,
      bottomEndBias: 0.84,
    },
  },
};

const STRUCTURAL_PROTOTYPES = {
  "default-replica": {
    label: "Universal revenue bridge",
    tokens: {},
    flags: {},
    defaults: {},
  },
  "triad-lockup-bridge": {
    label: "Triad lockup bridge",
    tokens: {
      layout: {
        revenueX: 734,
        grossX: 1124,
        opX: 1492,
        rightX: 1802,
        sourceNodeGap: 50,
        grossNodeTop: 404,
        opNodeTop: 398,
        netNodeTop: 274,
        opexNodeTop: 708,
        costNodeTop: 838,
        titleFontSize: 88,
        logoX: 680,
        logoY: 178,
        logoScale: 1.1,
      },
    },
    flags: {
      heroLockups: true,
      leftAnchoredRevenueLabel: true,
      compactQuarterLabel: true,
      largeTitle: true,
    },
    defaults: {
      revenueLabelMode: "left",
    },
  },
  "hierarchical-detail-bridge": {
    label: "Hierarchical detail bridge",
    tokenPresetKey: "asml-technology-bridge",
    flags: {
      hierarchicalDetails: true,
    },
    defaults: {},
  },
  "share-platform-mix": {
    label: "Share platform mix",
    tokenPresetKey: "tsmc-platform-mix",
    flags: {
      preferCompactSources: true,
    },
    defaults: {},
  },
  "membership-fee-bridge": {
    label: "Membership fee bridge",
    tokens: {
      layout: {
        leftX: 384,
        revenueX: 790,
        grossX: 1168,
        opX: 1514,
        rightX: 1774,
        opexTargetX: 1748,
        rightLabelX: 1838,
        opexLabelX: 1808,
        belowLabelX: 1838,
        revenueTop: 344,
        revenueHeight: 424,
        chartBottomLimit: 972,
        sourceNodeGap: 32,
        sourceNodeMinY: 352,
        sourceNodeMaxY: 928,
        grossNodeTop: 394,
        opNodeTop: 308,
        netNodeTop: 270,
        opexNodeTop: 622,
        costNodeTop: 762,
        opexSummaryX: 1608,
        opexSummaryY: 820,
        titleFontSize: 78,
        logoScale: 1.1,
      },
      ribbon: {
        curveFactor: 0.44,
      },
    },
    flags: {},
    defaults: {
      costLabel: "Merchandise costs",
      operatingExpensesLabel: "SG&A expenses",
    },
  },
  "apps-labs-bridge": {
    label: "Apps and labs bridge",
    tokens: {
      layout: {
        leftX: 362,
        revenueX: 742,
        grossX: 1120,
        opX: 1482,
        rightX: 1704,
        opexTargetX: 1678,
        rightLabelX: 1768,
        opexLabelX: 1742,
        belowLabelX: 1768,
        revenueTop: 330,
        revenueHeight: 456,
        chartBottomLimit: 986,
        sourceNodeGap: 16,
        sourceNodeMinY: 320,
        sourceNodeMaxY: 980,
        grossNodeTop: 382,
        opNodeTop: 378,
        netNodeTop: 338,
        opexNodeTop: 624,
        costNodeTop: 790,
        opexSummaryX: 1602,
        opexSummaryY: 858,
        titleFontSize: 80,
        logoScale: 0.62,
      },
      ribbon: {
        curveFactor: 0.43,
      },
    },
    flags: {},
    defaults: {
      revenueNodeColor: "#365DD9",
      revenueTextColor: "#29508F",
    },
  },
  "ad-funnel-bridge": {
    label: "Ad funnel bridge",
    tokens: {
      layout: {
        leftDetailX: 196,
        leftX: 432,
        revenueX: 828,
        grossX: 1184,
        opX: 1480,
        rightX: 1710,
        opexTargetX: 1686,
        costBreakdownX: 1298,
        costBreakdownLabelX: 1338,
        rightLabelX: 1774,
        opexLabelX: 1750,
        belowLabelX: 1774,
        sourceSummaryX: 620,
        leftDetailGap: 36,
        revenueLabelX: 946,
        revenueLabelY: 546,
        revenueLabelTitleSize: 34,
        revenueLabelValueSize: 52,
        revenueLabelNoteSize: 21,
        revenueTop: 318,
        revenueHeight: 468,
        chartBottomLimit: 976,
        sourceNodeGap: 28,
        sourceNodeMinY: 310,
        sourceNodeMaxY: 1128,
        summarySourceMaxOffsetFromDetails: 74,
        regularSourceStartAfterDetails: 0,
        regularSourceFloorY: 568,
        microSourceY: 984,
        microSourceLabelX: 610,
        microSourceValueX: 832,
        grossNodeTop: 378,
        opNodeTop: 370,
        netNodeTop: 324,
        opexNodeTop: 602,
        costNodeTop: 776,
        opexSummaryX: 1538,
        opexSummaryY: 820,
        positiveNodeX: 1658,
        positiveLabelX: 1648,
        positiveFloatPadding: 20,
        titleFontSize: 108,
        titleMaxWidth: 1840,
        logoX: 844,
        logoY: 172,
        logoScale: 1.84,
      },
      bands: {
        deductions: {
          minOffsetFromNet: 26,
          maxOffsetAboveOpex: 52,
          minClamp: 432,
          maxClamp: 702,
          gap: 30,
          centerStep: 22,
        },
        costBreakdown: {
          minY: 744,
          maxY: 1004,
          gap: 32,
          centerStart: 804,
          centerStep: 138,
        },
        opex: {
          regular: {
            minY: 700,
            maxY: 1026,
            gap: 38,
            centerStart: 744,
            centerStep: 148,
          },
          dense: {
            minY: 680,
            maxY: 980,
            gap: 22,
            centerStart: 704,
            centerStep: 110,
          },
        },
      },
      ribbon: {
        curveFactor: 0.45,
        topStartBias: 0.15,
        topEndBias: 0.85,
        bottomStartBias: 0.15,
        bottomEndBias: 0.85,
      },
    },
    flags: {
      floatingPositiveAdjustments: true,
      stackRegularSourcesBelowDetails: true,
    },
    defaults: {
      revenueNodeColor: "#4F76E8",
      revenueTextColor: "#4F76E8",
    },
  },
  "commerce-service-bridge": {
    label: "Commerce service bridge",
    tokens: {
      layout: {
        leftX: 332,
        revenueX: 776,
        sourceLabelX: 48,
        sourceTemplateInsetX: 80,
        grossX: 1152,
        opX: 1492,
        rightX: 1724,
        opexTargetX: 1692,
        rightLabelX: 1786,
        opexLabelX: 1756,
        belowLabelX: 1786,
        revenueTop: 320,
        revenueHeight: 466,
        chartBottomLimit: 980,
        sourceNodeGap: 22,
        sourceNodeMinY: 274,
        sourceNodeMaxY: 1020,
        sourceFan: {
          spread: 1.17,
          exponent: 1.18,
          edgeBoost: 32,
          edgeExponent: 1.12,
          bandBias: 0.1,
          sideBoost: 28,
          sideExponent: 1.04,
        },
        microSourceY: 1072,
        microSourceLabelX: 30,
        microSourceValueX: 308,
        grossNodeTop: 376,
        opNodeTop: 332,
        netNodeTop: 288,
        opexNodeTop: 596,
        costNodeTop: 778,
        opexSummaryX: 1528,
        opexSummaryY: 810,
        positiveNodeX: 1658,
        positiveLabelX: 1650,
        positiveFloatPadding: 18,
        operatingProfitBreakdownX: 1506,
        operatingProfitBreakdownY: 528,
        operatingProfitBreakdownWidth: 232,
        operatingProfitBreakdownPointerX: 1618,
        titleFontSize: 104,
        titleMaxWidth: 1820,
        logoX: 720,
        logoY: 166,
        logoScale: 1.58,
      },
      bands: {
        opex: {
          denseThreshold: 4,
          dense: {
            minY: 672,
            maxY: 1042,
            gap: 14,
            minGap: 4,
            centerStart: 694,
            centerStep: 92,
          },
        },
      },
      ribbon: {
        curveFactor: 0.46,
        topStartBias: 0.16,
        topEndBias: 0.84,
        bottomStartBias: 0.16,
        bottomEndBias: 0.84,
        sourceHorn: {
          startCurveFactor: 0.2,
          endCurveFactor: 0.16,
          minStartCurveFactor: 0.06,
          maxStartCurveFactor: 0.24,
          minEndCurveFactor: 0.05,
          maxEndCurveFactor: 0.2,
          deltaScale: 0.48,
          deltaInfluence: 0.18,
        },
      },
    },
    flags: {
      preferCompactSources: true,
      floatingPositiveAdjustments: true,
      leftAnchoredRevenueLabel: true,
    },
    defaults: {
      revenueNodeColor: "#F89E1B",
      revenueTextColor: "#111111",
      costLabel: "Cost of sales",
    },
  },
};

const OFFICIAL_STYLE_TO_PROTOTYPE = {
  "ad-funnel-bridge": "ad-funnel-bridge",
  "alibaba-commerce-staged": "hierarchical-detail-bridge",
  "asml-technology-bridge": "hierarchical-detail-bridge",
  "commerce-service-bridge": "commerce-service-bridge",
  "tsmc-platform-mix": "share-platform-mix",
};

const refs = {};

function queryRefs() {
  refs.heroCoverageText = document.querySelector("#heroCoverageText");
  refs.companyCountPill = document.querySelector("#companyCountPill");
  refs.companySearch = document.querySelector("#companySearch");
  refs.companyList = document.querySelector("#companyList");
  refs.quarterSelect = document.querySelector("#quarterSelect");
  refs.quarterHint = document.querySelector("#quarterHint");
  refs.renderBtn = document.querySelector("#renderBtn");
  refs.downloadSvgBtn = document.querySelector("#downloadSvgBtn");
  refs.downloadPngBtn = document.querySelector("#downloadPngBtn");
  refs.downloadHdBtn = document.querySelector("#downloadHdBtn");
  refs.chartModeToggleBtn = document.querySelector("#chartModeToggleBtn");
  refs.chartEditGroup = document.querySelector("#chartEditGroup");
  refs.editImageBtn = document.querySelector("#editImageBtn");
  refs.resetImageBtn = document.querySelector("#resetImageBtn");
  refs.languageSelect = document.querySelector("#languageSelect");
  refs.overlayToggle = document.querySelector("#overlayToggle");
  refs.overlayFileInput = document.querySelector("#overlayFileInput");
  refs.overlayOpacity = document.querySelector("#overlayOpacity");
  refs.overlayOpacityValue = document.querySelector("#overlayOpacityValue");
  refs.referenceOverlay = document.querySelector("#referenceOverlay");
  refs.templateTokenEditor = document.querySelector("#templateTokenEditor");
  refs.applyTokenBtn = document.querySelector("#applyTokenBtn");
  refs.resetTokenBtn = document.querySelector("#resetTokenBtn");
  refs.downloadTokenBtn = document.querySelector("#downloadTokenBtn");
  refs.calibrationPresetPill = document.querySelector("#calibrationPresetPill");
  refs.tokenStatus = document.querySelector("#tokenStatus");
  refs.statusText = document.querySelector("#statusText");
  refs.chartTitle = document.querySelector("#chartTitle");
  refs.chartMeta = document.querySelector("#chartMeta");
  refs.toolbarCompany = document.querySelector("#toolbarCompany");
  refs.toolbarQuarter = document.querySelector("#toolbarQuarter");
  refs.toolbarUpdatedLabel = document.querySelector("#toolbarUpdatedLabel");
  refs.toolbarUpdatedAt = document.querySelector("#toolbarUpdatedAt");
  refs.chartOutput = document.querySelector("#chartOutput");
  refs.detailSegmentCount = document.querySelector("#detailSegmentCount");
  refs.detailSegmentNote = document.querySelector("#detailSegmentNote");
  refs.detailStatementSummary = document.querySelector("#detailStatementSummary");
  refs.detailStatementNote = document.querySelector("#detailStatementNote");
  refs.detailSourceTitle = document.querySelector("#detailSourceTitle");
  refs.detailSourceNote = document.querySelector("#detailSourceNote");
  refs.footnoteText = document.querySelector("#footnoteText");
  refs.openMicrosoftPreset = document.querySelector("#openMicrosoftPreset");
}

function setStatus(message) {
  if (refs.statusText) refs.statusText.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]));
  }
  return value;
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) return deepClone(override);
  const result = deepClone(base);
  if (!isPlainObject(override)) return result;
  Object.entries(override).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
      return;
    }
    result[key] = deepClone(value);
  });
  return result;
}

const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "€",
  TWD: "NT$",
  CNY: "¥",
  HKD: "HK$",
  JPY: "¥",
  KRW: "₩",
  GBP: "£",
  CAD: "C$",
};

function activeDisplayCurrency() {
  return state.currentSnapshot?.displayCurrency || "USD";
}

function activeDisplayScaleFactor() {
  const raw = Number(state.currentSnapshot?.displayScaleFactor);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function formatBillions(value, wrapNegative = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const absolute = Math.abs(Number(value) * activeDisplayScaleFactor()).toFixed(1);
  const currencySymbol = CURRENCY_SYMBOLS[activeDisplayCurrency()] || `${activeDisplayCurrency()} `;
  const label = `${currencySymbol}${absolute}B`;
  if (!wrapNegative || Number(value) >= 0) return label;
  return `(${label})`;
}

function formatBillionsInCurrency(value, currency = "USD", wrapNegative = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const absolute = Math.abs(Number(value)).toFixed(1);
  const normalizedCurrency = String(currency || "USD").toUpperCase();
  const currencySymbol = CURRENCY_SYMBOLS[normalizedCurrency] || `${normalizedCurrency} `;
  const label = `${currencySymbol}${absolute}B`;
  if (!wrapNegative || Number(value) >= 0) return label;
  return `(${label})`;
}

function formatPct(value, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const prefix = signed && Number(value) >= 0 ? "+" : "";
  return `${prefix}${Number(value).toFixed(1)}%`;
}

function formatCompactPct(value, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  const prefix = signed && numeric >= 0 ? "+" : "";
  const rounded = Math.round(numeric * 10) / 10;
  const label = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${prefix}${label}%`;
}

function formatGrowthMetric(value, period = "yoy") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  const metricLabel = period === "qoq" ? qoqLabel() : yoyLabel();
  const valueLabel = formatPct(value, true);
  if (currentChartLanguage() === "en") {
    return `${metricLabel} ${valueLabel}`;
  }
  return `${metricLabel}${valueLabel}`;
}

function formatPp(value, period = "yoy") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  const numeric = Math.round(Number(value) * 10) / 10;
  const prefix = numeric >= 0 ? "+" : "";
  const rounded = Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1);
  const metricLabel = period === "qoq" ? qoqLabel() : yoyLabel();
  if (currentChartLanguage() === "en") return `${metricLabel} ${prefix}${rounded}pp`;
  return `${metricLabel}${prefix}${rounded}个百分点`;
}

function parseLegacyPpDelta(raw) {
  const normalized = String(raw || "").trim();
  if (!normalized) return null;
  const parenthesesMatch = normalized.match(/^\(([-+]?\d+(?:\.\d+)?)pp\)$/i);
  if (parenthesesMatch) {
    return -Math.abs(Number(parenthesesMatch[1]));
  }
  const simpleMatch = normalized.match(/^([+-]?\d+(?:\.\d+)?)pp$/i);
  if (simpleMatch) {
    return Number(simpleMatch[1]);
  }
  return null;
}

function parseShareMetricNote(rawNote) {
  const normalized = String(rawNote || "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  const match = normalized.match(
    /^([-+]?\d+(?:\.\d+)?)%\s+(of revenue|of sales)(?:\s+(\([^)]+pp\)|[+-]?\d+(?:\.\d+)?pp)\s+(Y\/Y|Q\/Q))?$/i
  );
  if (!match) return null;
  return {
    sharePct: Number(match[1]),
    basis: match[2].toLowerCase(),
    deltaPp: match[3] ? parseLegacyPpDelta(match[3]) : null,
    period: match[4] ? match[4].toLowerCase() : null,
  };
}

function shareMetricBasisLabel(basis = "of revenue") {
  if (currentChartLanguage() === "en") {
    return basis === "of sales" ? "of sales" : "of revenue";
  }
  return basis === "of sales" ? "占销售额比重" : "占营收比重";
}

function formatShareMetricNote(sharePct, options = {}) {
  if (sharePct === null || sharePct === undefined || Number.isNaN(Number(sharePct))) return "";
  const basis = options.basis || "of revenue";
  const shareLabel = `${formatCompactPct(sharePct)} ${shareMetricBasisLabel(basis)}`;
  const period = options.period === "qoq" ? "qoq" : "yoy";
  if (options.deltaPp === null || options.deltaPp === undefined || Number.isNaN(Number(options.deltaPp))) {
    return shareLabel;
  }
  const deltaLabel = formatPp(options.deltaPp, period);
  if (!deltaLabel) return shareLabel;
  return `${shareLabel} ${deltaLabel}`;
}

function structuredChartNote(rawNote) {
  const parsedShareMetric = parseShareMetricNote(rawNote);
  if (parsedShareMetric) {
    return formatShareMetricNote(parsedShareMetric.sharePct, {
      basis: parsedShareMetric.basis,
      deltaPp: parsedShareMetric.deltaPp,
      period: parsedShareMetric.period,
    });
  }
  return null;
}

function structuredChartNoteLines(rawNote) {
  const parsedShareMetric = parseShareMetricNote(rawNote);
  if (!parsedShareMetric) return null;
  const shareLine = `${formatCompactPct(parsedShareMetric.sharePct)} ${shareMetricBasisLabel(parsedShareMetric.basis)}`;
  const deltaLine =
    parsedShareMetric.deltaPp !== null && parsedShareMetric.deltaPp !== undefined
      ? formatPp(parsedShareMetric.deltaPp, parsedShareMetric.period === "qoq" ? "qoq" : "yoy")
      : "";
  return deltaLine ? [shareLine, deltaLine] : [shareLine];
}

function displayChartNote(rawNote) {
  const structured = structuredChartNote(rawNote);
  if (structured) return structured;
  return localizeChartPhrase(rawNote || "");
}

function formatSourceMetric(item) {
  return formatBillions(item?.valueBn);
}

function displayChartTitle(title) {
  return String(title || "")
    .replace(/\s+income statement\s*$/i, "")
    .trim();
}

function currentChartLanguage() {
  return state.uiLanguage === "en" ? "en" : "zh";
}

function currentChartViewMode() {
  return state.chartViewMode === "bars" ? "bars" : "sankey";
}

function chartModeToggleLabel() {
  if (currentChartLanguage() === "en") {
    return currentChartViewMode() === "bars" ? "Switch to Sankey" : "Switch to Bars";
  }
  return currentChartViewMode() === "bars" ? "切换到桑基图" : "切换到柱状图";
}

function syncChartModeToggleUi() {
  if (!refs.chartModeToggleBtn) return;
  refs.chartModeToggleBtn.textContent = chartModeToggleLabel();
  refs.chartModeToggleBtn.classList.toggle("is-bars", currentChartViewMode() === "bars");
  if (refs.chartEditGroup) {
    refs.chartEditGroup.hidden = currentChartViewMode() === "bars";
  }
}

const CHART_TEXT_TRANSLATIONS_ZH = {
  revenue: "营收",
  "reported revenue": "报告营收",
  "gross profit": "毛利润",
  "gross margin": "毛利率",
  "cost of revenue": "营收成本",
  "cost of revenues": "营收成本",
  "cost of sales": "销售成本",
  "operating profit": "营业利润",
  "operating expenses": "营业费用",
  "residual opex": "其余营业费用",
  "net profit": "净利润",
  "net loss": "净亏损",
  tax: "税项",
  other: "其他",
  "r&d": "研发",
  "r&d expenses": "研发费用",
  "s&m": "销售与营销",
  "s&m expenses": "销售与营销费用",
  "g&a": "一般及行政",
  "g&a expenses": "一般及行政费用",
  "sg&a": "销售、一般及行政",
  "sg&a expenses": "销售、一般及行政费用",
  "research & development": "研发",
  "sales, general & admin": "销售、一般及行政",
  "technology & content": "技术与内容",
  fulfillment: "履约",
  "other opex": "其他营业费用",
  "non-operating gain": "营业外收益",
  "non-operating": "营业外项目",
  "tax benefit": "税收收益",
  "ad revenue": "广告营收",
  "all other segments": "其他业务",
  "data center": "数据中心",
  gaming: "游戏",
  "professional visualization": "专业可视化",
  automotive: "汽车",
  "oem & other": "OEM 与其他",
  products: "产品",
  services: "服务",
  "productivity & business processes": "生产力与业务流程",
  "productivity &": "生产力与",
  business: "业务",
  processes: "流程",
  intelligent: "智能",
  cloud: "云",
  "intelligent cloud": "智能云",
  "more personal": "更多个人",
  computing: "计算",
  "more personal computing": "更多个人计算",
  "google services": "谷歌服务",
  "google search": "谷歌搜索",
  youtube: "YouTube 广告",
  "google admob": "移动广告联盟",
  "google network": "谷歌广告网络",
  "google cloud": "谷歌云",
  "google play": "应用商店",
  "amazon web services": "亚马逊云服务",
  aws: "AWS",
  "online stores": "在线商店",
  advertising: "广告",
  "advertising services": "广告服务",
  subscription: "订阅",
  "subscription services": "订阅服务",
  "physical stores": "实体门店",
  "physical store": "实体门店",
  "third party seller services": "第三方卖家服务",
  "3rd party sellers services": "第三方卖家服务",
  "other services": "其他服务",
  "high performance computing": "高性能计算",
  smartphones: "智能手机",
  "internet of things": "物联网",
  "digital consumer electronics": "数字消费电子",
  others: "其他",
  "family of apps": "应用家族",
  "family of apps (foa)": "应用家族（FoA）",
  "family of apps (foa": "应用家族（FoA",
  "reality labs": "现实实验室",
  auto: "汽车业务",
  "energy generation & storage": "能源发电与储能",
  leasing: "租赁",
  "regulatory credits": "监管积分",
  software: "软件",
  hardware: "硬件",
  membership: "会员费",
  "sams club": "山姆会员店",
  "sams club us": "山姆美国",
  "walmart us": "沃尔玛美国",
  "walmart international": "沃尔玛国际",
  "asset & wealth management": "资产与财富管理",
  "commercial & investment bank": "商业与投资银行",
  "commercial banking": "商业银行",
  "consumer community banking": "消费者与社区银行",
  "global banking": "全球银行",
  "global markets": "全球市场",
  "global wealth & investment management": "全球财富与投资管理",
  "data processing revenues": "数据处理营收",
  "international transaction revenues": "国际交易营收",
  "value added services": "增值服务",
  "value-added services and solutions": "增值服务与解决方案",
  "installed base management": "存量设备管理",
  "net system sales": "系统销售净额",
  "official: search & other": "官方口径：搜索及其他",
  "official: google network": "官方口径：谷歌广告网络",
  "official: subscriptions, platforms, and devices": "官方口径：订阅、平台与设备",
  "other bets + hedging": "其他创新业务与套保",
  tac: "流量获取成本",
  "pilot travel centers": "Pilot 旅行中心",
  "auto sales": "汽车销售",
  "consulting + support": "咨询与支持",
  "license + on-prem": "许可证与本地部署",
  "cloud applications": "云应用",
  "cloud infrastructure": "云基础设施",
  "cloud services + support": "云服务与支持",
  "hardware systems": "硬件系统",
  "software license": "软件许可证",
  "software support": "软件支持",
  "merchandise net sales": "商品净销售额",
  "merchandise costs": "商品成本",
  merchandise: "商品",
  "net sales": "净销售额",
  costs: "成本",
  expenses: "费用",
  "cyber + data + loyalty": "网络安全、数据与忠诚度",
  "asia-pacific": "亚太",
  "europe + mea": "欧洲、中东和非洲",
  "latin america": "拉丁美洲",
  "us + canada": "美国和加拿大",
  "mobile soc": "移动 SoC",
  "other platforms": "其他平台",
  iot: "物联网",
  dce: "数字消费电子",
  inspection: "检测",
  metrology: "计量",
  "extreme ultraviolet": "极紫外光刻",
  "argon fluoride dry": "氩氟干式光刻",
  "argon fluoride immersion": "氩氟浸润式光刻",
  "krypton fluoride": "氪氟光刻",
  "mercury i-line": "汞灯 I-line 光刻",
  "yieldstar · e-beam": "YieldStar · 电子束",
  "ai · cloud · dgx": "AI · 云 · DGX",
  "geforce · gaming gpus": "GeForce · 游戏 GPU",
  "drive platform": "自动驾驶平台",
  "oem · legacy": "OEM · 旧平台",
  "rtx workstation": "RTX 工作站",
  "ai · accelerator · server": "AI · 加速器 · 服务器",
  apac: "亚太",
  emea: "欧洲、中东和非洲",
  latam: "拉丁美洲",
  ucan: "美国和加拿大",
  "non-operating gain ": "营业外收益",
};

const CHART_LABEL_TRANSLATIONS_ZH_EXACT = {
  "3rd party sellers services": "第三方卖家服务",
  aebu: "汽车与嵌入式业务单元",
  apac: "亚太",
  aws: "AWS",
  "ad revenue": "广告营收",
  advertising: "广告",
  "advertising services": "广告服务",
  "all other segments": "其他业务",
  "amazon web services": "亚马逊云服务",
  "asset & wealth management": "资产与财富管理",
  auto: "汽车业务",
  automotive: "汽车",
  "baby feminine & family care": "婴儿、女性及家庭护理",
  "baby feminine family care": "婴儿、女性及家庭护理",
  beauty: "美容",
  "berkshire hathaway energy company": "伯克希尔哈撒韦能源",
  "berkshire hathaway insurance group": "伯克希尔哈撒韦保险集团",
  "burlington northern santa fe corporation": "伯灵顿北方圣太菲铁路",
  cmbu: "云内存业务单元",
  cnbu: "计算与网络业务单元",
  "consumerhealth & pharmaceutical": "消费健康与制药",
  "covid19 antibodies": "新冠抗体",
  "cardiometabolic health": "心血管代谢健康",
  cloud: "云",
  "collaboration & other revenue": "合作及其他营收",
  commercial: "商业",
  "commercial & investment bank": "商业与投资银行",
  "commercial banking": "商业银行",
  "commercial operating": "商业业务",
  "concentrate operations": "浓缩液业务",
  consumer: "消费者业务",
  "consumer banking": "消费者银行",
  "consumer community banking": "消费者与社区银行",
  corporate: "企业及其他",
  "corporate & investment bank": "企业与投资银行",
  "corporate investment bank": "企业投资银行",
  "cross-border volume fees": "跨境交易量费用",
  "data center": "数据中心",
  "data processing revenues": "数据处理营收",
  diabetes: "糖尿病",
  "diabetes & obesity": "糖尿病与肥胖",
  "digital consumer electronics": "数字消费电子",
  "domestic assessments": "国内评估费",
  downstream: "下游",
  "downstream equipment": "下游设备",
  ebu: "嵌入式业务单元",
  emea: "欧洲、中东和非洲",
  "energy generation & storage": "能源发电与储能",
  "fabric & home care": "织物与家居护理",
  "fabric home care": "织物与家居护理",
  "family of apps": "应用家族",
  "family of apps (foa)": "应用家族（FoA）",
  "family of apps (foa": "应用家族（FoA",
  "financial products": "金融产品",
  "finished product operations": "成品业务",
  "food & sundries": "食品与杂货",
  "foods & sundries": "食品与杂货",
  "fresh food": "生鲜食品",
  "fresh foods": "生鲜食品",
  gaming: "游戏",
  "global banking": "全球银行",
  "global markets": "全球市场",
  "global wealth & investment management": "全球财富与投资管理",
  "google cloud": "谷歌云",
  "google play": "应用商店",
  "google search": "谷歌搜索",
  "google services": "谷歌服务",
  "google admob": "移动广告联盟",
  youtube: "YouTube 广告",
  "government operating": "政府业务",
  grooming: "个护美容",
  hardlines: "硬装及耐用品",
  hardware: "硬件",
  "health care": "医疗健康",
  "high performance computing": "高性能计算",
  "income from equity affiliates": "权益法投资收益",
  "infrastructure software": "基础设施软件",
  "innovative medicine": "创新药",
  "installed base management": "存量设备管理",
  "insurance corporate & other": "保险、企业及其他",
  "intelligent cloud": "智能云",
  "international transaction revenues": "国际交易营收",
  "internet of things": "物联网",
  latam: "拉丁美洲",
  leasing: "租赁",
  mbu: "移动业务单元",
  mcbu: "移动与客户端业务单元",
  "machinery energy transportation": "机械、能源与运输",
  "major product line building materials": "主要产品线：建筑材料",
  "major product line dcor": "主要产品线：家居装饰",
  "major product line hardlines": "主要产品线：硬装及耐用品",
  "manufacturing businesses": "制造业务",
  "mc lane company": "麦克莱恩公司",
  "med tech": "医疗科技",
  "medical devices": "医疗器械",
  membership: "会员费",
  "more personal computing": "更多个人计算",
  "net system sales": "系统销售净额",
  neuroscience: "神经科学",
  "non foods": "非食品",
  "oem & other": "OEM 与其他",
  oncology: "肿瘤",
  "online stores": "在线商店",
  other: "其他",
  "other aesthetics": "其他美学",
  "other cardiometabolic health": "其他心血管代谢健康",
  "other diabetes": "其他糖尿病",
  "other diabetes & obesity": "其他糖尿病与肥胖",
  "other eye care": "其他眼科",
  "other immunology": "其他免疫",
  "other neuroscience": "其他神经科学",
  "other oncology": "其他肿瘤",
  "other product": "其他产品",
  "other product total": "其他产品合计",
  "other products": "其他产品",
  "other revenue": "其他营收",
  "other revenue interest": "其他营收及利息",
  "other services": "其他服务",
  "other womens health": "其他女性健康",
  "other revenues": "其他营收",
  others: "其他",
  "payment network": "支付网络",
  "pilot travel centers": "Pilot 旅行中心",
  pharmaceutical: "制药",
  "physical store": "实体门店",
  "physical stores": "实体门店",
  "pilot travel centers llc": "Pilot 旅行中心",
  "pilot travel centers limited liability company": "Pilot 旅行中心",
  "productivity & business processes": "生产力与业务流程",
  products: "产品",
  "professional visualization": "专业可视化",
  "reality labs": "现实实验室",
  "regulatory credits": "监管积分",
  royalty: "特许权使用费",
  sbu: "存储业务单元",
  "sales & other operating revenue": "销售及其他营业收入",
  "sams club": "山姆会员店",
  "sams club us": "山姆会员店美国",
  "semiconductor solutions": "半导体解决方案",
  "service & retailing businesses": "服务与零售业务",
  services: "服务",
  smartphones: "智能手机",
  softlines: "软装及服饰",
  software: "软件",
  subscription: "订阅",
  "subscription services": "订阅服务",
  "third party seller services": "第三方卖家服务",
  "transaction processing": "交易处理",
  "tax": "税项",
  "r&d": "研发",
  "r&d expenses": "研发费用",
  "s&m": "销售与营销",
  "s&m expenses": "销售与营销费用",
  "g&a": "一般及行政",
  "g&a expenses": "一般及行政费用",
  "sg&a": "销售、一般及行政",
  "sg&a expenses": "销售、一般及行政费用",
  "residual opex": "其余营业费用",
  "other opex": "其他营业费用",
  "non-operating": "营业外项目",
  "cost of sales": "销售成本",
  "reported revenue": "报告营收",
  "other bets + hedging": "其他创新业务与套保",
  tac: "流量获取成本",
  "auto sales": "汽车销售",
  iphone: "iPhone 手机",
  ipad: "iPad 平板",
  mac: "Mac 电脑",
  wearables: "可穿戴设备",
  euv: "EUV 光刻",
  arfi: "ArF 浸润式光刻",
  "arf dry": "ArF 干式光刻",
  krf: "KrF 光刻",
  "i-line": "I-line 光刻",
  "inspection": "检测",
  "metrology": "计量",
  "yieldstar · e-beam": "YieldStar · 电子束",
  "official: search & other": "官方口径：搜索及其他",
  "official: google network": "官方口径：谷歌广告网络",
  "official: subscriptions, platforms, and devices": "官方口径：订阅、平台与设备",
  "consulting + support": "咨询与支持",
  "license + on-prem": "许可证与本地部署",
  "cloud applications": "云应用",
  "cloud infrastructure": "云基础设施",
  "cloud services + support": "云服务与支持",
  "hardware systems": "硬件系统",
  "software license": "软件许可证",
  "software support": "软件支持",
  "cyber + data + loyalty": "网络安全、数据与忠诚度",
  "asia-pacific": "亚太",
  "europe + mea": "欧洲、中东和非洲",
  "latin america": "拉丁美洲",
  "us + canada": "美国和加拿大",
  "mobile soc": "移动 SoC",
  "other platforms": "其他平台",
  iot: "物联网",
  dce: "数字消费电子",
  cdbu: "云与数据中心业务单元",
  "extreme ultraviolet": "极紫外光刻",
  "argon fluoride dry": "氩氟干式光刻",
  "argon fluoride immersion": "氩氟浸润式光刻",
  "krypton fluoride": "氪氟光刻",
  "mercury i-line": "汞灯 I-line 光刻",
  "merchandise net sales": "商品净销售额",
  "merchandise costs": "商品成本",
  merchandise: "商品",
  "net sales": "净销售额",
  costs: "成本",
  expenses: "费用",
  "ai · cloud · dgx": "AI · 云 · DGX",
  "geforce · gaming gpus": "GeForce · 游戏 GPU",
  "drive platform": "自动驾驶平台",
  "oem · legacy": "OEM · 旧平台",
  "rtx workstation": "RTX 工作站",
  "ai · accelerator · server": "AI · 加速器 · 服务器",
  humira: "修美乐",
  imbruvica: "亿珂",
  skyrizi: "利生奇珠单抗",
  creon: "得每通",
  mavyret: "MAVYRET（格卡瑞韦/哌仑他韦）",
  venclexta: "维奈克拉",
  vraylar: "卡立普拉嗪",
  rinvoq: "乌帕替尼",
  lupron: "Lupron（亮丙瑞林）",
  synthroid: "Synthroid（左甲状腺素）",
  duodopa: "Duodopa（左旋多巴肠凝胶）",
  "botox therapeutic": "保妥适治疗",
  "botox cosmetic": "保妥适美容",
  "juvederm collection": "乔雅登系列",
  "linzess constella": "Linzess / Constella",
  "lumigan ganfort": "Lumigan / Ganfort",
  "alphagan combigan": "Alphagan / Combigan",
  restasis: "丽爱思",
  ubrelvy: "乌布罗吉泮",
  ozurdex: "地塞米松植入剂",
  qulipta: "阿托吉泮",
  epkinly: "艾可瑞妥单抗",
  elahere: "米妥索单抗",
  vyalev: "左旋多巴/卡比多巴",
  "orilissa oriahnn": "Orilissa / Oriahnn",
  "lo loestrin": "Lo Loestrin（避孕药）",
  jardiance: "恩格列净",
  taltz: "依奇珠单抗",
  verzenio: "阿贝西利",
  basaglar: "甘精胰岛素",
  cyramza: "雷莫西尤单抗",
  emgality: "加卡奈珠单抗",
  erbitux: "西妥昔单抗",
  humalog: "赖脯胰岛素",
  humulin: "人胰岛素",
  forteo: "特立帕肽",
  "trajenta bi": "利格列汀",
  olumiant: "巴瑞替尼",
  alimta: "培美曲塞",
  cialis: "他达拉非",
  cymbalta: "度洛西汀",
  zyprexa: "奥氮平",
  mounjaro: "替尔泊肽",
  trulicity: "度拉糖肽",
  "trulicity member": "度拉糖肽",
  zepbound: "替尔泊肽减重",
  tyvyt: "达伯舒",
  baqsimi: "Baqsimi（胰高血糖素鼻喷）",
  ucan: "美国和加拿大",
  upstream: "上游",
  "upstream equipment": "上游设备",
  "value-added services": "增值服务",
  "value added services": "增值服务",
  "value-added services and solutions": "增值服务与解决方案",
  "marketing services": "营销服务",
  "marketplace and marketing revenues": "平台与营销收入",
  "selling and marketing": "销售与营销",
  "selling and marketing expenses": "销售与营销费用",
  "research and development": "研发",
  "research and development expenses": "研发费用",
  "general and administrative": "一般及行政",
  "general and administrative expenses": "一般及行政费用",
  "fintech and business services": "金融科技与企业服务",
  "domestic games": "本土游戏",
  "international games": "国际游戏",
  "social networks": "社交网络",
  "alibaba china e-commerce group": "阿里巴巴中国电商集团",
  "alibaba international digital commerce group": "阿里国际数字商业集团",
  commerce: "商业",
  "cloud computing": "云计算",
  cloud: "云业务",
  "china commerce": "中国商业",
  "international commerce": "国际商业",
  "cloud intelligence": "云智能",
  "other businesses": "其他业务",
  "cloud intelligence group": "云智能集团",
  "all others": "其他业务",
  "quick commerce": "即时零售",
  "china commerce wholesale": "中国批发商业",
  "local consumer services": "本地消费者服务",
  "local consumer services and others": "本地消费者服务及其他",
  "cloud business": "云业务",
  "digital media and entertainment": "数字媒体及娱乐",
  "innovation initiatives and others": "创新业务及其他",
  "smart ev, ai and other new initiatives": "智能电动汽车、AI 及其他创新业务",
  "smart ev and other new initiatives": "智能电动汽车及其他创新业务",
  "international commerce retail": "国际零售商业",
  "international commerce wholesale": "国际批发商业",
  "direct sales and others": "直销及其他",
  "direct sales, logistics and others": "直销、物流及其他",
  "taobao and tmall group": "淘天集团",
  "cainiao smart logistics network limited": "菜鸟",
  "local services group": "本地生活集团",
  "digital media and entertainment group": "大文娱集团",
  "walmart international": "沃尔玛国际",
  "walmart us": "沃尔玛美国",
  "iot and lifestyle products": "物联网与生活消费产品",
  "internet services": "互联网服务",
  "other related businesses": "其他相关业务",
  smartphones: "智能手机",
  "smartphone x aiot": "手机 x AIoT",
  "net product revenues": "净产品营收",
  "net service revenues": "净服务营收",
  "core local commerce": "核心本地商业",
  "e-commerce": "电商业务",
  "e-mail and others": "邮箱及其他",
  youdao: "有道",
  "cloud music": "云音乐",
  "innovative businesses and others": "创新业务及其他",
  "other pretax gain": "其他税前收益",
  "other pretax expense": "其他税前损失",
};

const CHART_LABEL_TRANSLATIONS_ZH_PHRASES = {
  "other womens health": "其他女性健康",
  "other eye care": "其他眼科",
  "other neuroscience": "其他神经科学",
  "other oncology": "其他肿瘤",
  "other immunology": "其他免疫",
  "other diabetes & obesity": "其他糖尿病与肥胖",
  "other diabetes": "其他糖尿病",
  "other cardiometabolic health": "其他心血管代谢健康",
  "high performance computing": "高性能计算",
  "internet of things": "物联网",
  "digital consumer electronics": "数字消费电子",
  "energy generation & storage": "能源发电与储能",
  "asset & wealth management": "资产与财富管理",
  "commercial & investment bank": "商业与投资银行",
  "corporate & investment bank": "企业与投资银行",
  "consumer community banking": "消费者与社区银行",
  "global wealth & investment management": "全球财富与投资管理",
  "value-added services and solutions": "增值服务与解决方案",
  "sales & other operating revenue": "销售及其他营业收入",
  "marketplace and marketing revenues": "平台与营销收入",
  "selling and marketing": "销售与营销",
  "research and development": "研发",
  "general and administrative": "一般及行政",
  "service & retailing businesses": "服务与零售业务",
  "manufacturing businesses": "制造业务",
  "concentrate operations": "浓缩液业务",
  "finished product operations": "成品业务",
  "installed base management": "存量设备管理",
  "net system sales": "系统销售净额",
  "major product line building materials": "主要产品线：建筑材料",
  "major product line dcor": "主要产品线：家居装饰",
  "major product line hardlines": "主要产品线：硬装及耐用品",
  "internet services": "互联网服务",
  "iot and lifestyle products": "物联网与生活消费产品",
  "other related businesses": "其他相关业务",
  smartphones: "智能手机",
  "smartphone x aiot": "手机 x AIoT",
  "net product revenues": "净产品营收",
  "net service revenues": "净服务营收",
  "core local commerce": "核心本地商业",
  "e-commerce": "电商业务",
  "e-mail and others": "邮箱及其他",
  youdao: "有道",
  "cloud music": "云音乐",
  "innovative businesses and others": "创新业务及其他",
  "pretax gain": "税前收益",
  "pretax expense": "税前损失",
  "new initiatives": "创新业务",
  "smart ev": "智能电动汽车",
};

const CHART_LABEL_TRANSLATIONS_ZH_TOKENS = {
  asset: "资产",
  and: "与",
  wealth: "财富",
  management: "管理",
  commercial: "商业",
  investment: "投资",
  bank: "银行",
  banking: "银行",
  corporate: "企业",
  consumer: "消费者",
  community: "社区",
  costs: "成本",
  global: "全球",
  market: "市场",
  markets: "市场",
  data: "数据",
  processing: "处理",
  international: "国际",
  transaction: "交易",
  transactions: "交易",
  revenues: "营收",
  revenue: "营收",
  value: "增值",
  added: "增值",
  solutions: "解决方案",
  solution: "解决方案",
  payment: "支付",
  network: "网络",
  service: "服务",
  services: "服务",
  retailing: "零售",
  retail: "零售",
  business: "业务",
  businesses: "业务",
  subscriptions: "订阅",
  manufacturing: "制造",
  insurance: "保险",
  company: "公司",
  group: "集团",
  energy: "能源",
  cloud: "云",
  memory: "内存",
  core: "核心",
  center: "中心",
  centres: "中心",
  centre: "中心",
  mobile: "移动",
  client: "客户端",
  clients: "客户端",
  automotive: "汽车",
  embedded: "嵌入式",
  compute: "计算",
  computing: "计算",
  networking: "网络",
  storage: "存储",
  downstream: "下游",
  upstream: "上游",
  equipment: "设备",
  concentrate: "浓缩液",
  operations: "业务",
  finished: "成品",
  food: "食品",
  foods: "食品",
  sundries: "杂货",
  fresh: "生鲜",
  hardlines: "硬装及耐用品",
  softlines: "软装及服饰",
  non: "非",
  beauty: "美容",
  fabric: "织物",
  home: "家居",
  care: "护理",
  baby: "婴儿",
  feminine: "女性",
  family: "家庭",
  health: "健康",
  collaboration: "合作",
  antibodies: "抗体",
  cardiometabolic: "心血管代谢",
  diabetes: "糖尿病",
  obesity: "肥胖",
  immunology: "免疫",
  neuroscience: "神经科学",
  oncology: "肿瘤",
  royalty: "特许权使用费",
  medical: "医疗",
  devices: "器械",
  device: "设备",
  innovative: "创新",
  medicine: "药",
  products: "产品",
  product: "产品",
  other: "其他",
  womens: "女性",
  "women's": "女性",
  online: "在线",
  official: "官方口径",
  research: "研发",
  development: "开发",
  selling: "销售",
  marketing: "营销",
  general: "一般",
  administrative: "行政",
  related: "相关",
  lifestyle: "生活消费",
  smart: "智能",
  new: "新",
  initiative: "业务",
  initiatives: "业务",
  pretax: "税前",
  gain: "收益",
  loss: "损失",
  expense: "费用",
  store: "门店",
  stores: "门店",
  search: "搜索",
  physical: "实体",
  advertising: "广告",
  platform: "平台",
  platforms: "平台",
  device: "设备",
  devices: "设备",
  subscription: "订阅",
  subscriptions: "订阅",
  software: "软件",
  license: "许可证",
  licenses: "许可证",
  hardware: "硬件",
  semiconductor: "半导体",
  financial: "金融",
  machinery: "机械",
  transportation: "运输",
  operating: "运营",
  residual: "剩余",
  opex: "营业费用",
  tax: "税项",
  gross: "毛",
  margin: "利润率",
  reported: "报告",
  sales: "销售",
  consulting: "咨询",
  support: "支持",
  inspection: "检测",
  metrology: "计量",
  server: "服务器",
  servers: "服务器",
  accelerator: "加速器",
  workstation: "工作站",
  drive: "自动驾驶",
  gpu: "GPU",
  gpus: "GPU",
  legacy: "旧平台",
  dry: "干式",
  immersion: "浸润式",
  argon: "氩氟",
  krypton: "氪氟",
  mercury: "汞灯",
  beam: "电子束",
  applications: "应用",
  application: "应用",
  infrastructure: "基础设施",
  systems: "系统",
  net: "净",
  government: "政府",
  intelligent: "智能",
  productivity: "生产力",
  processes: "流程",
  more: "更多",
  personal: "个人",
  high: "高",
  performance: "性能",
  internet: "互联网",
  things: "物联网",
  digital: "数字",
  iot: "物联网",
  dce: "数字消费电子",
  consumerhealth: "消费健康",
  pharmaceutical: "制药",
  med: "医疗",
  tech: "科技",
};

function normalizeTranslationKey(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function translateBusinessLabelToZh(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const normalized = normalizeTranslationKey(raw);
  const exact = CHART_LABEL_TRANSLATIONS_ZH_EXACT[normalized];
  if (exact) return exact;

  const tokenSource = raw
    .replace(/&/g, " & ")
    .replace(/\//g, " / ")
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .replace(/,/g, " , ")
    .replace(/:/g, " : ")
    .replace(/\+/g, " + ")
    .replace(/·/g, " · ")
    .replace(/-/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = tokenSource ? tokenSource.split(" ") : [];
  if (!tokens.length) return raw;

  const phraseEntries = Object.entries(CHART_LABEL_TRANSLATIONS_ZH_PHRASES)
    .map(([source, target]) => ({
      sourceTokens: source.split(" "),
      target,
    }))
    .sort((left, right) => right.sourceTokens.length - left.sourceTokens.length);

  const pieces = [];
  let translatedCount = 0;
  let unknownCount = 0;
  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index];
    if (token === "&") {
      pieces.push("与");
      translatedCount += 1;
      index += 1;
      continue;
    }
    if (token === "/") {
      pieces.push("/");
      index += 1;
      continue;
    }
    if (token === "," || token === "(" || token === ")" || token === "-" || token === ":" || token === "+" || token === "·") {
      pieces.push(token);
      index += 1;
      continue;
    }

    let matched = null;
    for (const entry of phraseEntries) {
      const slice = tokens.slice(index, index + entry.sourceTokens.length).map((value) => normalizeTranslationKey(value));
      if (slice.length !== entry.sourceTokens.length) continue;
      if (entry.sourceTokens.every((value, phraseIndex) => value === slice[phraseIndex])) {
        matched = entry;
        break;
      }
    }
    if (matched) {
      pieces.push(matched.target);
      translatedCount += matched.sourceTokens.length;
      index += matched.sourceTokens.length;
      continue;
    }

    const normalizedToken = normalizeTranslationKey(token);
    const translatedToken = CHART_LABEL_TRANSLATIONS_ZH_TOKENS[normalizedToken];
    if (translatedToken) {
      pieces.push(translatedToken);
      translatedCount += 1;
      index += 1;
      continue;
    }

    if (/^[A-Z0-9.+]+$/.test(token) || /^[A-Z][a-z]+$/.test(token)) {
      pieces.push(token);
      index += 1;
      continue;
    }

    unknownCount += 1;
    pieces.push(token);
    index += 1;
  }

  if (!translatedCount || unknownCount > Math.max(1, Math.floor(tokens.length * 0.34))) {
    return raw;
  }

  return pieces
    .join(" ")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/\s+,/g, ",")
    .replace(/\s+:\s+/g, "：")
    .replace(/\s+\/\s+/g, "/")
    .replace(/\s+\+\s+/g, " + ")
    .replace(/\s+·\s+/g, " · ")
    .replace(/\s+-\s+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/([\u3400-\u9FFF])\s+([\u3400-\u9FFF])/gu, "$1$2")
    .replace(/([\u3400-\u9FFF])\s+([A-Za-z0-9])/gu, "$1$2")
    .replace(/([A-Za-z0-9])\s+([\u3400-\u9FFF])/gu, "$1$2")
    .trim();
}

function localizeChartItemName(item) {
  if (currentChartLanguage() === "en") return String(item?.name || "");
  if (item?.nameZh) return String(item.nameZh);
  return translateBusinessLabelToZh(item?.name || "");
}

function localizeChartPhrase(text) {
  const raw = String(text || "");
  if (!raw || currentChartLanguage() === "en") return raw;
  const structuredNote = structuredChartNote(raw);
  if (structuredNote) return structuredNote;
  const trimmed = raw.trim();
  const exact = CHART_TEXT_TRANSLATIONS_ZH[trimmed] || CHART_TEXT_TRANSLATIONS_ZH[normalizeTranslationKey(trimmed)];
  let translated = exact || trimmed;
  if (!exact) {
    const escaped = Object.entries(CHART_TEXT_TRANSLATIONS_ZH)
      .filter(([source]) => /[\s&()/.-]/.test(source))
      .sort((left, right) => right[0].length - left[0].length)
      .map(([source, target]) => ({
        pattern: new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        target,
      }));
    escaped.forEach(({ pattern, target }) => {
      translated = translated.replace(pattern, target);
    });
  }
  if (translated === trimmed) {
    const autoTranslated = translateBusinessLabelToZh(trimmed);
    if (autoTranslated && autoTranslated !== trimmed) {
      translated = autoTranslated;
    }
  }
  return translated
    .replace(/\bY\/Y\b/g, "同比")
    .replace(/\bQ\/Q\b/g, "环比")
    .replace(/\(([-+]?\d+(?:\.\d+)?)pp\)/gi, "($1个百分点)")
    .replace(/([+-]?\d+(?:\.\d+)?)pp/gi, "$1个百分点")
    .replace(/\bmargin\b/gi, "利润率")
    .replace(/gross\s*利润率/gi, "毛利率")
    .replace(/\bof revenue\b/gi, "占营收比重")
    .replace(/of营收/gi, "占营收比重")
    .replace(/of 营收/gi, "占营收比重");
}

function localizeChartLines(lines = []) {
  return (lines || []).map((line) => localizeChartPhrase(line));
}

function resolveLocalizedSupportLines(item, explicitLines = null, explicitZhLines = null) {
  if (currentChartLanguage() === "zh") {
    const preferredZhLines = Array.isArray(explicitZhLines) ? explicitZhLines : item?.supportLinesZh;
    if (preferredZhLines?.length) {
      return preferredZhLines.map((line) => String(line || "").trim()).filter(Boolean);
    }
    if (Array.isArray(explicitZhLines) && !explicitZhLines.length) return [];
  }
  if (Array.isArray(explicitLines)) {
    return explicitLines.map((line) => String(line || "").trim()).filter(Boolean);
  }
  const sourceLines = item?.supportLines || [];
  return localizeChartLines(sourceLines);
}

function isCjkLabelText(text) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(String(text || ""));
}

function splitBalancedCjkLabel(text, lineCount = 2) {
  const chars = [...String(text || "").trim()];
  if (!chars.length || lineCount <= 1) return chars.length ? [chars.join("")] : [];
  if (lineCount === 2 && chars.length >= 7 && String(text || "").includes("、")) {
    const preferredSplit = clamp(Math.round(chars.length * 0.62), 2, chars.length - 2);
    return [chars.slice(0, preferredSplit).join(""), chars.slice(preferredSplit).join("")].filter(Boolean);
  }
  const lines = [];
  let cursor = 0;
  for (let index = 0; index < lineCount; index += 1) {
    const remainingChars = chars.length - cursor;
    const remainingLines = lineCount - index;
    const take = Math.ceil(remainingChars / remainingLines);
    lines.push(chars.slice(cursor, cursor + take).join(""));
    cursor += take;
  }
  return lines.filter(Boolean);
}

function wrapLabelWithMaxWidth(text, fontSize, maxWidth, options = {}) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const maxLines = Math.max(safeNumber(options.maxLines, 2), 1);
  const widthLimit = Math.max(safeNumber(maxWidth, 140), 60);
  if (approximateTextWidth(raw, fontSize) <= widthLimit) return [raw];
  if (isCjkLabelText(raw) && !/\s/.test(raw)) {
    const neededLines = clamp(Math.ceil(approximateTextWidth(raw, fontSize) / widthLimit), 2, maxLines);
    return splitBalancedCjkLabel(raw, neededLines);
  }
  const averageCharWidth = Math.max(fontSize * 0.58, 1);
  const roughChars = Math.max(Math.floor(widthLimit / averageCharWidth), 4);
  const wrapped = wrapLines(raw, roughChars);
  if (wrapped.length <= maxLines) return wrapped;
  const valueSplitMatch = raw.match(/^(.*?)(\s*(?:\([^()]+\)|[+\-]?\$[\d.,]+B))$/);
  if (valueSplitMatch) {
    return [valueSplitMatch[1].trim(), valueSplitMatch[2].trim()].filter(Boolean);
  }
  const compact = [];
  let cursor = "";
  wrapped.forEach((line) => {
    const next = cursor ? `${cursor} ${line}` : line;
    if (compact.length + 1 >= maxLines) {
      cursor = next;
      return;
    }
    if (approximateTextWidth(next, fontSize) <= widthLimit * 1.18) {
      cursor = next;
    } else {
      if (cursor) compact.push(cursor);
      cursor = line;
    }
  });
  if (cursor) compact.push(cursor);
  if (compact.length > maxLines) {
    const head = compact.slice(0, maxLines - 1);
    const tail = compact.slice(maxLines - 1).join(" ");
    return [...head, tail];
  }
  return compact;
}

function resolveSourceLabelLines(item, options = {}) {
  const compactMode = !!options.compactMode;
  const fontSize = safeNumber(options.fontSize, compactMode ? 24 : 26);
  const maxWidth = safeNumber(options.maxWidth, currentChartLanguage() === "zh" ? 166 : 198);
  const maxLines = safeNumber(options.maxLines, currentChartLanguage() === "zh" ? 2 : 3);
  if (currentChartLanguage() === "zh") {
    return wrapLabelWithMaxWidth(localizeChartItemName(item), fontSize, maxWidth, { maxLines });
  }
  const preferred = item?.displayLines?.length ? item.displayLines.join(" ") : item?.name || "";
  return wrapLabelWithMaxWidth(preferred, fontSize, maxWidth, { maxLines });
}

function resolveBranchTitleLines(item, defaultMode, fontSize, maxWidth) {
  const localizedName = currentChartLanguage() === "zh" ? localizeChartItemName(item) : String(item?.name || "");
  const valueLabel = formatItemBillions(item, defaultMode);
  const singleLine = `${localizedName} ${valueLabel}`.trim();
  if (approximateTextWidth(singleLine, fontSize) <= maxWidth) return [singleLine];
  const nameLines = wrapLabelWithMaxWidth(localizedName, fontSize, maxWidth, {
    maxLines: currentChartLanguage() === "zh" ? 2 : 2,
  });
  return [...nameLines, valueLabel];
}

function resolveTreeNoteLines(item, density, fontSize, maxWidth) {
  const preferredLines = item?.noteLines?.length ? localizeChartLines(item.noteLines) : [];
  const structuredLines = !preferredLines.length ? structuredChartNoteLines(item?.note || "") : null;
  if (structuredLines?.length) return structuredLines;
  const rawNote = preferredLines.length ? preferredLines.join(" ") : displayChartNote(item?.note || "");
  if (!rawNote.trim()) return [];
  if (!(safeNumber(maxWidth, 0) > 0)) {
    return preferredLines.length ? preferredLines : splitReplicaTreeNoteLines(rawNote, density);
  }
  return wrapLabelWithMaxWidth(rawNote, fontSize, maxWidth, {
    maxLines: density === "dense" || density === "ultra" ? 3 : 2,
  });
}

function localizeChartTitle(snapshot) {
  if (currentChartLanguage() === "en") return displayChartTitle(snapshot?.title || "");
  const companyName = snapshot?.companyNameZh || snapshot?.companyName || "";
  const fiscal = compactFiscalLabel(snapshot?.fiscalLabel || snapshot?.quarterKey || "");
  return [companyName, fiscal].filter(Boolean).join(" ").trim();
}

function localizePeriodEndLabel(label) {
  const raw = String(label || "").trim();
  if (!raw || currentChartLanguage() === "en") return raw;
  const match = /^Ending\s+([A-Za-z.]+)\s*(\d{1,2})?,?\s*(\d{4})$/i.exec(raw);
  if (!match) return raw;
  const monthMap = {
    "jan.": "1",
    "feb.": "2",
    "mar.": "3",
    "apr.": "4",
    may: "5",
    "jun.": "6",
    "jul.": "7",
    "aug.": "8",
    "sept.": "9",
    "oct.": "10",
    "nov.": "11",
    "dec.": "12",
  };
  const month = monthMap[String(match[1]).toLowerCase()] || match[1];
  const day = match[2] ? `${Number(match[2])}日` : "";
  return `截至 ${match[3]}年${month}月${day}`;
}

function inlinePeriodEndLayout({
  titleText,
  titleFontSize,
  titleX,
  titleY,
  periodEndFontSize,
  width,
  titleMaxWidth = null,
  rightPadding = 84,
}) {
  const titleVisualWidth = titleMaxWidth !== null && titleMaxWidth !== undefined
    ? Math.min(safeNumber(titleMaxWidth), Math.max(approximateTextWidth(titleText, titleFontSize), titleFontSize * 3.2))
    : Math.max(approximateTextWidth(titleText, titleFontSize), titleFontSize * 3.2);
  const smallCharWidth = approximateTextWidth(currentChartLanguage() === "zh" ? "字" : "a", periodEndFontSize);
  const gapX = smallCharWidth * 1.5;
  const titleVisualCenterY = titleY - titleFontSize * 0.32;
  const periodEndY = titleVisualCenterY + periodEndFontSize * 0.32;
  const periodEndX = Math.min(titleX + titleVisualWidth / 2 + gapX, width - rightPadding);
  return {
    titleVisualWidth,
    periodEndX,
    periodEndY,
  };
}

function yoyLabel() {
  return currentChartLanguage() === "en" ? "Y/Y" : "同比";
}

function qoqLabel() {
  return currentChartLanguage() === "en" ? "Q/Q" : "环比";
}

function marginLabel() {
  return currentChartLanguage() === "en" ? "margin" : "利润率";
}

function ofRevenueLabel() {
  return currentChartLanguage() === "en" ? "of revenue" : "占营收比重";
}

function hasSnapshotQoqMetrics(snapshot) {
  if (snapshot?.revenueQoqPct !== null && snapshot?.revenueQoqPct !== undefined) return true;
  const collections = [
    snapshot?.businessGroups,
    snapshot?.leftDetailGroups,
    snapshot?.opexBreakdown,
    snapshot?.costBreakdown,
    snapshot?.belowOperatingItems,
    snapshot?.positiveAdjustments,
  ];
  return collections.some(
    (items) =>
      Array.isArray(items) &&
      items.some((item) => item?.qoqPct !== null && item?.qoqPct !== undefined)
  );
}

function quarterSortValue(period) {
  const match = /^(\d{4})Q([1-4])$/.exec(period || "");
  if (!match) return 0;
  return Number(match[1]) * 10 + Number(match[2]);
}

function parseQuarterKey(quarterKey) {
  const match = /^(\d{4})Q([1-4])$/.exec(String(quarterKey || ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    quarter: Number(match[2]),
  };
}

function shiftQuarterKey(quarterKey, delta = 0) {
  const parsed = parseQuarterKey(quarterKey);
  if (!parsed) return null;
  const baseIndex = parsed.year * 4 + (parsed.quarter - 1);
  const shiftedIndex = baseIndex + Math.trunc(safeNumber(delta, 0));
  if (!Number.isFinite(shiftedIndex) || shiftedIndex < 0) return null;
  const nextYear = Math.floor(shiftedIndex / 4);
  const nextQuarter = (shiftedIndex % 4) + 1;
  return `${nextYear}Q${nextQuarter}`;
}

function continuousQuarterWindow(anchorQuarterKey, size = 30) {
  const count = Math.max(1, Math.floor(safeNumber(size, 30)));
  const parsedAnchor = parseQuarterKey(anchorQuarterKey);
  if (!parsedAnchor) return [];
  const result = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const quarterKey = shiftQuarterKey(anchorQuarterKey, -offset);
    if (quarterKey) result.push(quarterKey);
  }
  return result;
}

function companies() {
  return state.sortedCompanies || [];
}

function getCompany(companyId) {
  return state.companyById?.[companyId] || null;
}

function resolvedCompanyBrand(company) {
  return normalizeCompanyBrand(company?.brand);
}

function normalizeLogoKey(logoKey) {
  return String(logoKey || "").replace(/-corporate$/i, "");
}

function getLogoAsset(logoKey) {
  return state.logoCatalog?.[normalizeLogoKey(logoKey)] || null;
}

function isNeutralBackgroundPixel(red, green, blue) {
  return Math.max(red, green, blue) - Math.min(red, green, blue) <= 22;
}

function detectLogoBackground(imageData, width, height) {
  const samples = [];
  const pushSample = (x, y) => {
    const offset = (y * width + x) * 4;
    if (imageData[offset + 3] < 245) return;
    samples.push({
      x,
      y,
      red: imageData[offset],
      green: imageData[offset + 1],
      blue: imageData[offset + 2],
    });
  };
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      if (imageData[offset + 3] >= 245) {
        pushSample(x, y);
        break;
      }
    }
    for (let y = height - 1; y >= 0; y -= 1) {
      const offset = (y * width + x) * 4;
      if (imageData[offset + 3] >= 245) {
        pushSample(x, y);
        break;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (imageData[offset + 3] >= 245) {
        pushSample(x, y);
        break;
      }
    }
    for (let x = width - 1; x >= 0; x -= 1) {
      const offset = (y * width + x) * 4;
      if (imageData[offset + 3] >= 245) {
        pushSample(x, y);
        break;
      }
    }
  }
  const neutralSamples = samples.filter((pixel) => {
    if (!isNeutralBackgroundPixel(pixel.red, pixel.green, pixel.blue)) return false;
    const luminance = (pixel.red + pixel.green + pixel.blue) / 3;
    return luminance < 18 || luminance > 236;
  });
  if (neutralSamples.length < 12) return null;
  const average = neutralSamples.reduce(
    (accumulator, pixel) => ({
      red: accumulator.red + pixel.red,
      green: accumulator.green + pixel.green,
      blue: accumulator.blue + pixel.blue,
    }),
    { red: 0, green: 0, blue: 0 }
  );
  const red = Math.round(average.red / neutralSamples.length);
  const green = Math.round(average.green / neutralSamples.length);
  const blue = Math.round(average.blue / neutralSamples.length);
  if (!isNeutralBackgroundPixel(red, green, blue)) return null;
  const stableSamples = neutralSamples.filter(
    (pixel) =>
      Math.abs(pixel.red - red) <= 18 &&
      Math.abs(pixel.green - green) <= 18 &&
      Math.abs(pixel.blue - blue) <= 18
  );
  if (stableSamples.length < 8) return null;
  return { red, green, blue, seeds: stableSamples.map((pixel) => ({ x: pixel.x, y: pixel.y })) };
}

function removeEdgeBackground(imageData, width, height, background) {
  const data = new Uint8ClampedArray(imageData.data);
  const visited = new Uint8Array(width * height);
  const queue = [];
  const tolerance = 26;
  const matchBackground = (index) => {
    if (data[index + 3] < 20) return false;
    return (
      Math.abs(data[index] - background.red) <= tolerance &&
      Math.abs(data[index + 1] - background.green) <= tolerance &&
      Math.abs(data[index + 2] - background.blue) <= tolerance
    );
  };
  const enqueue = (x, y) => {
    const pointIndex = y * width + x;
    if (visited[pointIndex]) return;
    visited[pointIndex] = 1;
    queue.push(pointIndex);
  };
  (background.seeds || []).forEach((seed) => enqueue(seed.x, seed.y));
  let removed = 0;
  while (queue.length) {
    const pointIndex = queue.shift();
    const x = pointIndex % width;
    const y = Math.floor(pointIndex / width);
    const pixelIndex = pointIndex * 4;
    if (!matchBackground(pixelIndex)) continue;
    data[pixelIndex + 3] = 0;
    removed += 1;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
  if (removed < width * height * 0.04) return null;
  return new ImageData(data, width, height);
}

function opaqueBoundsFromImageData(imageData, width, height, alphaThreshold = 10) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (imageData.data[offset + 3] < alphaThreshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function normalizeBitmapLogoAsset(asset) {
  const mime = String(asset?.mime || "").trim().toLowerCase();
  if (!asset?.dataUrl || !/^image\/(png|jpeg|jpg|webp|svg\+xml|svg)$/i.test(mime)) return asset;
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    image.src = asset.dataUrl;
    await loaded;
    const naturalWidth = image.naturalWidth || safeNumber(asset.width, 0);
    const naturalHeight = image.naturalHeight || safeNumber(asset.height, 0);
    if (!naturalWidth || !naturalHeight) return asset;
    const maxRasterSide = 900;
    const rasterScale = Math.min(1, maxRasterSide / Math.max(naturalWidth, naturalHeight, 1));
    const width = Math.max(1, Math.round(naturalWidth * rasterScale));
    const height = Math.max(1, Math.round(naturalHeight * rasterScale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return asset;
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const background = detectLogoBackground(imageData.data, width, height);
    const transparentImageData = background ? removeEdgeBackground(imageData, width, height, background) : null;
    const normalizedImageData = transparentImageData || imageData;
    context.clearRect(0, 0, width, height);
    context.putImageData(normalizedImageData, 0, 0);
    const visibleBounds = opaqueBoundsFromImageData(normalizedImageData, width, height);
    if (!visibleBounds) {
      if (!transparentImageData) return asset;
      return {
        ...asset,
        mime: "image/png",
        dataUrl: canvas.toDataURL("image/png"),
        width,
        height,
      };
    }
    const trimPadding = Math.max(1, Math.round(Math.min(width, height) * 0.012));
    const cropLeft = Math.max(visibleBounds.left - trimPadding, 0);
    const cropTop = Math.max(visibleBounds.top - trimPadding, 0);
    const cropRight = Math.min(visibleBounds.right + trimPadding, width - 1);
    const cropBottom = Math.min(visibleBounds.bottom + trimPadding, height - 1);
    const cropWidth = cropRight - cropLeft + 1;
    const cropHeight = cropBottom - cropTop + 1;
    if (!transparentImageData && cropWidth >= width - 2 && cropHeight >= height - 2) return asset;
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedContext = croppedCanvas.getContext("2d");
    if (!croppedContext) return asset;
    croppedContext.drawImage(canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return {
      ...asset,
      mime: "image/png",
      dataUrl: croppedCanvas.toDataURL("image/png"),
      width: cropWidth,
      height: cropHeight,
    };
  } catch (_error) {
    return asset;
  }
}

async function normalizeLogoCatalogAssets(catalog) {
  const entries = Object.entries(catalog || {});
  const normalizedEntries = await Promise.all(
    entries.map(async ([companyId, asset]) => [companyId, await normalizeBitmapLogoAsset(asset)])
  );
  return Object.fromEntries(normalizedEntries);
}

function normalizeLabelKey(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("&", "and")
    .replaceAll("+", "plus")
    .replace(/[^a-z0-9]+/g, "");
}

function mergeSupplementalComponentPayload(basePayload, quarterPayload) {
  const base = basePayload && typeof basePayload === "object" ? basePayload : {};
  const quarter = quarterPayload && typeof quarterPayload === "object" ? quarterPayload : {};
  if (!Object.keys(base).length) return Object.keys(quarter).length ? { ...quarter } : null;
  if (!Object.keys(quarter).length) return { ...base };
  const merged = {
    ...base,
    ...quarter,
  };
  ["costBreakdownProfile"].forEach((fieldName) => {
    const baseField = base[fieldName];
    const quarterField = quarter[fieldName];
    if (
      baseField &&
      typeof baseField === "object" &&
      !Array.isArray(baseField) &&
      quarterField &&
      typeof quarterField === "object" &&
      !Array.isArray(quarterField)
    ) {
      merged[fieldName] = {
        ...baseField,
        ...quarterField,
        fixedGrossMarginPctBySegment: {
          ...(baseField.fixedGrossMarginPctBySegment || {}),
          ...(quarterField.fixedGrossMarginPctBySegment || {}),
        },
      };
    }
  });
  return merged;
}

function supplementalComponentsFor(company, quarterKey) {
  if (!company?.id || !quarterKey) return null;
  const companySupplemental = state.supplementalComponents?.[company.id];
  if (!companySupplemental || typeof companySupplemental !== "object") return null;
  const defaultPayload =
    companySupplemental._default ||
    companySupplemental.default ||
    companySupplemental.__default__ ||
    null;
  const quarterPayload = companySupplemental[quarterKey] || null;
  return mergeSupplementalComponentPayload(defaultPayload, quarterPayload);
}

function inferredOfficialRevenueStyle(company, entry, rows = []) {
  const explicitStyle = entry?.officialRevenueStyle || "";
  if (explicitStyle) return explicitStyle;
  const memberKeys = new Set(
    [...(rows || [])].map((item) => normalizeLabelKey(item?.memberKey || item?.id || item?.key || item?.name))
  );
  if (
    company?.id === "alibaba" &&
    (memberKeys.has("taobaoandtmallgroup") ||
      memberKeys.has("alibabachinaecommercegroup") ||
      memberKeys.has("alidcg") ||
      memberKeys.has("cloudintelligencegroup"))
  ) {
    return "alibaba-commerce-staged";
  }
  if (
    company?.id === "alphabet" &&
    (memberKeys.has("adrevenue") || memberKeys.has("googleservices")) &&
    memberKeys.has("googlecloud")
  ) {
    return "ad-funnel-bridge";
  }
  if (
    company?.id === "amazon" &&
    memberKeys.has("onlinestores") &&
    (memberKeys.has("amazonwebservices") || memberKeys.has("aws") || memberKeys.has("thirdpartysellerservices"))
  ) {
    return "commerce-service-bridge";
  }
  if (
    company?.id === "tesla" &&
    [memberKeys.has("auto"), memberKeys.has("services"), memberKeys.has("energygenerationstorage")].filter(Boolean).length >= 2
  ) {
    return "tesla-revenue-bridge";
  }
  if (
    company?.id === "xiaomi" &&
    (memberKeys.has("smartphonexaiot") ||
      memberKeys.has("smartevaiandothernewinitiatives") ||
      memberKeys.has("smartphones") ||
      memberKeys.has("internetservices"))
  ) {
    return "xiaomi-revenue-bridge";
  }
  if (
    company?.id === "visa" &&
    memberKeys.has("dataprocessingrevenues") &&
    memberKeys.has("internationaltransactionrevenues")
  ) {
    return "visa-revenue-bridge";
  }
  if (
    company?.id === "micron" &&
    (memberKeys.has("cnbu") ||
      memberKeys.has("mbu") ||
      memberKeys.has("sbu") ||
      memberKeys.has("ebu") ||
      memberKeys.has("cmbu") ||
      memberKeys.has("mcbu") ||
      memberKeys.has("cdbu") ||
      memberKeys.has("aebu") ||
      memberKeys.has("microncomputedatacenter") ||
      memberKeys.has("micronmobileclient") ||
      memberKeys.has("micronstoragecloudmemory") ||
      memberKeys.has("micronautoembedded"))
  ) {
    return "micron-business-unit-bridge";
  }
  return "";
}

const ALIBABA_SEGMENT_PHASE_KEYS = {
  stagedCurrent: new Set(["taobaoandtmallgroup", "alidcg", "cloudintelligencegroup", "cainiao", "localservicesgroup", "dmeg", "allothers"]),
  condensedCurrent: new Set(["alibabachinaecommercegroup", "alidcg", "cloudintelligencegroup", "allothers"]),
  legacy: new Set([
    "chinacommerce",
    "internationalcommerce",
    "localconsumerservices",
    "localconsumerservicesandothers",
    "cainiao",
    "cloudbusiness",
    "cloud",
    "digitalmediaandentertainment",
    "innovationinitiativesandothers",
  ]),
};

// For bars we bridge Alibaba to the coarsest fully disclosed quarterly taxonomy,
// so the full history stays comparable without inventing pre-split subsegments.
const ALIBABA_BAR_COMPARABLE_SEGMENTS = Object.freeze([
  Object.freeze({ key: "alibabacommerce", name: "Commerce", nameZh: "商业" }),
  Object.freeze({ key: "alibabacloud", name: "Cloud", nameZh: "云业务" }),
  Object.freeze({ key: "alibabaothers", name: "All others", nameZh: "其他业务" }),
]);

const ALIBABA_BAR_PHASE_KEYS = {
  comparable: new Set(["alibabacommerce", "alibabacloud", "alibabaothers"]),
  condensedCurrent: new Set(["alibabachinaecommercegroup", "alidcg", "cloudintelligencegroup", "allothers"]),
  stagedCurrent: new Set(["taobaoandtmallgroup", "alidcg", "cloudintelligencegroup", "cainiao", "localservicesgroup", "dmeg", "allothers"]),
  legacyDetailed: new Set([
    "chinacommerce",
    "internationalcommerce",
    "localconsumerservices",
    "localconsumerservicesandothers",
    "cainiao",
    "cloudbusiness",
    "cloud",
    "digitalmediaandentertainment",
    "innovationinitiativesandothers",
  ]),
  legacyCoarse: new Set(["corecommerce", "commerce", "cloudcomputing", "digitalmediaandentertainment", "innovationinitiativesandothers"]),
};

const ALIBABA_BAR_COMPARABLE_KEYS_BY_PHASE = {
  comparable: {
    alibabacommerce: ["alibabacommerce"],
    alibabacloud: ["alibabacloud"],
    alibabaothers: ["alibabaothers"],
  },
  condensedCurrent: {
    alibabacommerce: ["alibabachinaecommercegroup", "alidcg"],
    alibabacloud: ["cloudintelligencegroup"],
    alibabaothers: ["allothers"],
  },
  stagedCurrent: {
    alibabacommerce: ["taobaoandtmallgroup", "alidcg", "cainiao", "localservicesgroup"],
    alibabacloud: ["cloudintelligencegroup"],
    alibabaothers: ["allothers", "dmeg"],
  },
  legacyDetailed: {
    alibabacommerce: ["chinacommerce", "internationalcommerce", "localconsumerservices", "localconsumerservicesandothers", "cainiao"],
    alibabacloud: ["cloudbusiness", "cloud"],
    alibabaothers: ["digitalmediaandentertainment", "innovationinitiativesandothers"],
  },
  legacyCoarse: {
    alibabacommerce: ["corecommerce", "commerce"],
    alibabacloud: ["cloudcomputing"],
    alibabaothers: ["digitalmediaandentertainment", "innovationinitiativesandothers"],
  },
};

const ALIBABA_COMPARABLE_KEYS_BY_PHASE = {
  condensedCurrent: {
    alibabachinaecommercegroup: ["alibabachinaecommercegroup"],
    alidcg: ["alidcg"],
    cloudintelligencegroup: ["cloudintelligencegroup"],
    allothers: ["allothers"],
  },
  stagedCurrent: {
    alibabachinaecommercegroup: ["taobaoandtmallgroup", "cainiao", "localservicesgroup"],
    taobaoandtmallgroup: ["taobaoandtmallgroup"],
    alidcg: ["alidcg"],
    cloudintelligencegroup: ["cloudintelligencegroup"],
    cainiao: ["cainiao"],
    localservicesgroup: ["localservicesgroup"],
    dmeg: ["dmeg"],
    allothers: ["allothers", "dmeg"],
  },
  legacy: {
    alibabachinaecommercegroup: ["chinacommerce", "localconsumerservices", "localconsumerservicesandothers", "cainiao"],
    taobaoandtmallgroup: ["chinacommerce"],
    alidcg: ["internationalcommerce"],
    cloudintelligencegroup: ["cloudbusiness", "cloud"],
    cainiao: ["cainiao"],
    localservicesgroup: ["localconsumerservices", "localconsumerservicesandothers"],
    dmeg: ["digitalmediaandentertainment"],
    allothers: ["innovationinitiativesandothers", "digitalmediaandentertainment"],
  },
};

const ALIBABA_DETAIL_ORDER = {
  customermanagement: 0,
  directsalesandothers: 1,
  directsaleslogisticsandothers: 1,
  quickcommerce: 2,
  chinacommercewholesale: 3,
  internationalcommerceretail: 0,
  internationalcommercewholesale: 1,
};

function detectQuarterKeyForEntry(company, entry) {
  if (!company?.financials || !entry) return entry?.quarterKey || null;
  if (entry?.quarterKey && company.financials[entry.quarterKey] === entry) return entry.quarterKey;
  return Object.entries(company.financials).find(([, value]) => value === entry)?.[0] || entry?.quarterKey || null;
}

function previousQuarterKey(quarterKey) {
  if (!quarterKey || !/^\d{4}Q[1-4]$/.test(quarterKey)) return null;
  const year = Number(quarterKey.slice(0, 4));
  const quarter = Number(quarterKey.slice(-1));
  if (quarter === 1) {
    return `${year - 1}Q4`;
  }
  return `${year}Q${quarter - 1}`;
}

function priorYearQuarterKey(quarterKey) {
  if (!quarterKey || !/^\d{4}Q[1-4]$/.test(quarterKey)) return null;
  return `${Number(quarterKey.slice(0, 4)) - 1}${quarterKey.slice(4)}`;
}

function alibabaSegmentPhase(rows = []) {
  const memberKeys = new Set([...(rows || [])].map((item) => normalizeLabelKey(item?.memberKey || item?.id || item?.name)));
  if ([...ALIBABA_SEGMENT_PHASE_KEYS.condensedCurrent].some((key) => memberKeys.has(key)) && memberKeys.has("alibabachinaecommercegroup")) {
    return "condensedCurrent";
  }
  if ([...ALIBABA_SEGMENT_PHASE_KEYS.stagedCurrent].some((key) => memberKeys.has(key)) && memberKeys.has("taobaoandtmallgroup")) {
    return "stagedCurrent";
  }
  if ([...ALIBABA_SEGMENT_PHASE_KEYS.legacy].some((key) => memberKeys.has(key))) {
    return "legacy";
  }
  return "";
}

function alibabaComparableKeys(memberKey, comparisonRows = []) {
  const normalizedKey = normalizeLabelKey(memberKey);
  const phase = alibabaSegmentPhase(comparisonRows);
  return ALIBABA_COMPARABLE_KEYS_BY_PHASE[phase]?.[normalizedKey] || [normalizedKey];
}

function alibabaBarComparablePhase(rows = []) {
  const memberKeys = new Set([...(rows || [])].map((item) => normalizeLabelKey(item?.memberKey || item?.id || item?.name)));
  if ([...ALIBABA_BAR_PHASE_KEYS.comparable].some((key) => memberKeys.has(key))) {
    return "comparable";
  }
  if ([...ALIBABA_BAR_PHASE_KEYS.condensedCurrent].some((key) => memberKeys.has(key)) && memberKeys.has("alibabachinaecommercegroup")) {
    return "condensedCurrent";
  }
  if ([...ALIBABA_BAR_PHASE_KEYS.stagedCurrent].some((key) => memberKeys.has(key)) && memberKeys.has("taobaoandtmallgroup")) {
    return "stagedCurrent";
  }
  if ([...ALIBABA_BAR_PHASE_KEYS.legacyDetailed].some((key) => memberKeys.has(key)) && memberKeys.has("chinacommerce")) {
    return "legacyDetailed";
  }
  if ([...ALIBABA_BAR_PHASE_KEYS.legacyCoarse].some((key) => memberKeys.has(key)) && (memberKeys.has("corecommerce") || memberKeys.has("commerce"))) {
    return "legacyCoarse";
  }
  return "";
}

function buildAlibabaComparableBarRows(entry, rows = []) {
  const normalizedRows = [...(rows || [])]
    .map((item) => ({
      ...item,
      valueBn: Number(safeNumber(item?.valueBn).toFixed(3)),
    }))
    .filter((item) => safeNumber(item?.valueBn) > 0.02);
  if (!normalizedRows.length) return [];
  const phase = alibabaBarComparablePhase(normalizedRows);
  const comparableKeysByPhase = ALIBABA_BAR_COMPARABLE_KEYS_BY_PHASE[phase] || null;
  if (!comparableKeysByPhase) return [];
  return ALIBABA_BAR_COMPARABLE_SEGMENTS
    .map((segment) => {
      const memberKeys = new Set(comparableKeysByPhase[segment.key] || []);
      if (!memberKeys.size) return null;
      const matchedRows = normalizedRows.filter((item) => {
        const itemKey = normalizeLabelKey(item?.memberKey || item?.id || item?.name);
        return memberKeys.has(itemKey);
      });
      const valueBn = matchedRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
      if (!(valueBn > 0.02)) return null;
      const filingDate =
        matchedRows
          .map((item) => item?.filingDate)
          .filter(Boolean)
          .sort(compareIsoDateStrings)
          .pop() || entry?.statementFilingDate || null;
      const periodEnd = matchedRows.map((item) => item?.periodEnd).find(Boolean) || entry?.periodEnd || null;
      return {
        id: segment.key,
        name: segment.name,
        nameZh: segment.nameZh,
        valueBn: Number(valueBn.toFixed(3)),
        filingDate,
        periodEnd,
      };
    })
    .filter(Boolean);
}

// Micron switched from legacy end-market BUs to a new BU taxonomy in FY26.
// For bars we stabilize both schemas into comparable buckets and discard mixed future-filing contamination.
const MICRON_LEGACY_SEGMENT_KEYS = new Set(["cnbu", "mbu", "sbu", "ebu", "allothersegments"]);
const MICRON_CURRENT_SEGMENT_KEYS = new Set(["cmbu", "mcbu", "cdbu", "aebu"]);
const MICRON_SCHEMA_CHANGE_QUARTER = "2025Q4";

function micronSegmentPhase(rows = []) {
  const memberKeys = new Set([...(rows || [])].map((item) => normalizeLabelKey(item?.memberKey || item?.id || item?.name)));
  const hasLegacy = [...MICRON_LEGACY_SEGMENT_KEYS].some((key) => key !== "allothersegments" && memberKeys.has(key));
  const hasCurrent = [...MICRON_CURRENT_SEGMENT_KEYS].some((key) => memberKeys.has(key));
  if (hasLegacy && hasCurrent) return "mixed";
  if (hasCurrent) return "current";
  if (hasLegacy || memberKeys.has("allothersegments")) return "legacy";
  return "";
}

function micronRowsForPhase(rows = [], phase = "") {
  const allowedKeys = phase === "current" ? MICRON_CURRENT_SEGMENT_KEYS : phase === "legacy" ? MICRON_LEGACY_SEGMENT_KEYS : null;
  if (!allowedKeys) return [];
  return [...(rows || [])].filter((item) => allowedKeys.has(normalizeLabelKey(item?.memberKey || item?.id || item?.name)));
}

function normalizeMicronBarRows(entry, rows = []) {
  const phase = micronSegmentPhase(rows);
  if (phase !== "mixed") return rows;
  const revenueBn = safeNumber(entry?.revenueBn, null);
  const quarterKey = String(entry?.quarterKey || "").trim();
  const preferredPhase =
    quarterKey && quarterSortValue(quarterKey) >= quarterSortValue(MICRON_SCHEMA_CHANGE_QUARTER) ? "current" : "legacy";
  const preferredRows = micronRowsForPhase(rows, preferredPhase);
  const preferredSum = preferredRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const preferredCoverage = revenueBn > 0.02 ? preferredSum / revenueBn : 0;
  if (preferredRows.length >= 3 && (revenueBn <= 0.02 || (preferredCoverage >= 0.72 && preferredCoverage <= 1.18))) {
    return preferredRows;
  }
  const alternatePhase = preferredPhase === "current" ? "legacy" : "current";
  const alternateRows = micronRowsForPhase(rows, alternatePhase);
  const alternateSum = alternateRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const alternateCoverage = revenueBn > 0.02 ? alternateSum / revenueBn : 0;
  if (alternateRows.length >= 3 && (revenueBn <= 0.02 || (alternateCoverage >= 0.72 && alternateCoverage <= 1.18))) {
    return alternateRows;
  }
  return preferredRows.length ? preferredRows : alternateRows.length ? alternateRows : rows;
}

function buildAlibabaStagedBusinessGroups(company, entry) {
  const official = sanitizeOfficialStructureRows(entry, entry.officialRevenueSegments || []).filter(
    (item) => safeNumber(item.valueBn) > 0.02
  );
  if (!official.length) return null;
  const revenueBn = safeNumber(entry?.revenueBn);
  if (revenueBn <= 0) return null;
  const rows = official.slice().sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn));
  const palette = revenuePaletteForStyle(company, "alibaba-commerce-staged", rows.length);
  const compactMode = rows.length >= 5;
  const groups = rows.map((item, index) => {
    const memberKey = item.memberKey || item.name;
    const currentValue = safeNumber(item.valueBn);
    const mixPct = revenueBn ? Number(((currentValue / revenueBn) * 100).toFixed(1)) : item.mixPct ?? null;
    const color = palette[index % palette.length];
    return {
      id: memberKey,
      name: item.name,
      nameZh: item.nameZh || translateBusinessLabelToZh(item.name),
      displayLines: wrapLines(item.name, compactMode ? 14 : 16),
      valueBn: Number(currentValue.toFixed(3)),
      flowValueBn: Number(safeNumber(item.flowValueBn ?? currentValue).toFixed(3)),
      yoyPct: item.yoyPct ?? null,
      qoqPct: item.qoqPct ?? null,
      mixPct,
      mixYoyDeltaPp: item.mixYoyDeltaPp ?? null,
      metricMode: item.metricMode || null,
      operatingMarginPct: null,
      nodeColor: color,
      flowColor: rgba(color, compactMode ? 0.5 : 0.58),
      labelColor: "#55595F",
      valueColor: "#676C75",
      supportLines: item.supportLines || null,
      supportLinesZh: item.supportLinesZh || null,
      compactLabel: compactMode,
      sourceUrl: item.sourceUrl || null,
      memberKey,
    };
  });
  return normalizeGroupFlowTotalsToRevenue(groups, revenueBn);
}
