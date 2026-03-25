function sanitizeOfficialStructureRows(entry, rows = []) {
  const normalizedRows = [...(rows || [])].map((item) => ({ ...item }));
  if (!normalizedRows.length) return normalizedRows;
  const revenueBn = Math.max(safeNumber(entry?.revenueBn), 0);
  const maxValue = Math.max(...normalizedRows.map((item) => safeNumber(item?.valueBn)));
  const totalValue = normalizedRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const appearsRawMillions =
    revenueBn > 0 &&
    maxValue > revenueBn * 8 &&
    totalValue > revenueBn * 8 &&
    maxValue > 500;
  if (!appearsRawMillions) return normalizedRows;
  return normalizedRows.map((item) => ({
    ...item,
    valueBn: Number((safeNumber(item.valueBn) / 1000).toFixed(3)),
    flowValueBn:
      item.flowValueBn !== null && item.flowValueBn !== undefined
        ? Number((safeNumber(item.flowValueBn) / 1000).toFixed(3))
        : item.flowValueBn,
  }));
}

function normalizeBreakdownItems(items = [], fallbackSourceUrl = null, defaultMode = "negative-parentheses") {
  if (!Array.isArray(items) || !items.length) return [];
  return items
    .map((item) => ({
      ...item,
      nameZh: item?.nameZh || translateBusinessLabelToZh(item?.name || ""),
      valueBn: Number(safeNumber(item?.valueBn).toFixed(3)),
      valueFormat: item?.valueFormat || defaultMode,
      sourceUrl: item?.sourceUrl || fallbackSourceUrl || null,
    }))
    .filter((item) => safeNumber(item.valueBn) > 0.02);
}

function resolveDirectCostBreakdown(snapshot, company, entry) {
  if (snapshot?.costBreakdown?.length) {
    return normalizeBreakdownItems(snapshot.costBreakdown);
  }
  const supplemental = supplementalComponentsFor(company, snapshot?.quarterKey || entry?.quarterKey);
  const entrySupplemental = entry?.supplementalComponents || {};
  const breakdown =
    entry?.officialCostBreakdown ||
    entry?.costBreakdown ||
    entrySupplemental?.officialCostBreakdown ||
    entrySupplemental?.costBreakdown ||
    supplemental?.officialCostBreakdown ||
    supplemental?.costBreakdown;
  return normalizeBreakdownItems(breakdown, supplemental?.sourceUrl || null);
}

function resolveProfileCostBreakdown(snapshot, company, entry) {
  const supplemental = supplementalComponentsFor(company, snapshot?.quarterKey || entry?.quarterKey);
  const entrySupplemental = entry?.supplementalComponents || {};
  const profile =
    entry?.costBreakdownProfile ||
    entrySupplemental?.costBreakdownProfile ||
    supplemental?.costBreakdownProfile;
  if (!profile || typeof profile !== "object") return [];
  const totalCostBn = safeNumber(snapshot?.costOfRevenueBn ?? entry?.costOfRevenueBn);
  if (totalCostBn <= 0.02) return [];
  const segmentRows = [...(snapshot?.businessGroups || entry?.officialRevenueSegments || [])].filter((item) => safeNumber(item?.valueBn) > 0.02);
  if (!segmentRows.length) return [];
  const segmentMap = new Map();
  segmentRows.forEach((item) => {
    const normalizedKeys = [
      normalizeLabelKey(item?.memberKey || item?.id || item?.name),
      normalizeLabelKey(item?.name),
    ].filter(Boolean);
    normalizedKeys.forEach((key) => {
      if (!segmentMap.has(key)) {
        segmentMap.set(key, item);
      }
    });
  });
  const orderedSegmentNames =
    Array.isArray(profile.segmentOrder) && profile.segmentOrder.length
      ? profile.segmentOrder
      : segmentRows.map((item) => item.name);
  const fixedGrossMarginPctBySegment = profile.fixedGrossMarginPctBySegment || {};
  const sourceUrl = profile.sourceUrl || supplemental?.sourceUrl || null;
  const defaultMode = profile.valueFormat || "negative-parentheses";
  const resolvedSegments = orderedSegmentNames
    .map((segmentName) => segmentMap.get(normalizeLabelKey(segmentName)))
    .filter(Boolean);
  if (!resolvedSegments.length) return [];

  const itemMap = new Map();
  let assignedCostBn = 0;
  const unresolvedSegments = [];
  resolvedSegments.forEach((segment) => {
    const normalizedName = normalizeLabelKey(segment?.name);
    const fixedMarginPct = fixedGrossMarginPctBySegment[segment?.name] ?? fixedGrossMarginPctBySegment[normalizedName];
    if (fixedMarginPct === null || fixedMarginPct === undefined || Number.isNaN(Number(fixedMarginPct))) {
      unresolvedSegments.push(segment);
      return;
    }
    const marginPct = clamp(Number(fixedMarginPct), -20, 99.5);
    const costBn = safeNumber(segment.valueBn) * (1 - marginPct / 100);
    assignedCostBn += costBn;
    itemMap.set(normalizeLabelKey(segment.name), {
      name: segment.name,
      nameZh: segment.nameZh || translateBusinessLabelToZh(segment.name),
      valueBn: Number(costBn.toFixed(3)),
      note: `${formatCompactPct(marginPct)} gross margin`,
      valueFormat: defaultMode,
      sourceUrl,
    });
  });
  if (unresolvedSegments.length === 1) {
    const segment = unresolvedSegments[0];
    const residualCostBn = Math.max(totalCostBn - assignedCostBn, 0);
    const revenueBn = safeNumber(segment.valueBn);
    const grossMarginPct = revenueBn > 0 ? clamp(((revenueBn - residualCostBn) / revenueBn) * 100, -20, 99.5) : null;
    itemMap.set(normalizeLabelKey(segment.name), {
      name: segment.name,
      nameZh: segment.nameZh || translateBusinessLabelToZh(segment.name),
      valueBn: Number(residualCostBn.toFixed(3)),
      note: grossMarginPct === null ? "" : `${formatCompactPct(grossMarginPct)} gross margin`,
      valueFormat: defaultMode,
      sourceUrl,
    });
  }
  const items = resolvedSegments
    .map((segment) => itemMap.get(normalizeLabelKey(segment.name)))
    .filter(Boolean);
  if (!unresolvedSegments.length && items.length) {
    const computedTotalBn = items.reduce((total, item) => total + safeNumber(item.valueBn), 0);
    const scaleFactor = computedTotalBn > 0 ? totalCostBn / computedTotalBn : 1;
    if (Math.abs(scaleFactor - 1) > 0.015) {
      items.forEach((item) => {
        item.valueBn = Number((safeNumber(item.valueBn) * scaleFactor).toFixed(3));
      });
    }
  }
  return normalizeBreakdownItems(items, sourceUrl, defaultMode);
}

function resolveAdFunnelCostBreakdown(snapshot, company, entry) {
  const explicitBreakdown = resolveDirectCostBreakdown(snapshot, company, entry);
  if (explicitBreakdown.length) {
    return explicitBreakdown;
  }
  const supplemental = supplementalComponentsFor(company, snapshot?.quarterKey || entry?.quarterKey);
  const entrySupplemental = entry?.supplementalComponents || {};
  const tacBn = safeNumber(entry?.trafficAcquisitionCostBn ?? entrySupplemental?.trafficAcquisitionCostBn ?? supplemental?.trafficAcquisitionCostBn);
  if (tacBn <= 0.02) return [];
  const totalCostBn = safeNumber(snapshot?.costOfRevenueBn ?? entry?.costOfRevenueBn);
  const otherCostBn = safeNumber(
    entry?.otherCostOfRevenueBn ?? entrySupplemental?.otherCostOfRevenueBn ?? supplemental?.otherCostOfRevenueBn,
    Math.max(totalCostBn - tacBn, 0)
  );
  const items = [];
  if (otherCostBn > 0.02) {
    items.push({
      name: "Other",
      valueBn: Number(otherCostBn.toFixed(3)),
      valueFormat: "negative-parentheses",
      sourceUrl: supplemental?.sourceUrl || null,
    });
  }
  items.push({
    name: "TAC",
    valueBn: Number(tacBn.toFixed(3)),
    valueFormat: "negative-parentheses",
    sourceUrl: supplemental?.sourceUrl || null,
  });
  return normalizeBreakdownItems(items, supplemental?.sourceUrl || null);
}

function resolveOperatingProfitBreakdown(snapshot, company, entry) {
  if (snapshot?.operatingProfitBreakdown?.length) {
    return [...snapshot.operatingProfitBreakdown];
  }
  const supplemental = supplementalComponentsFor(company, snapshot?.quarterKey || entry?.quarterKey);
  const entrySupplemental = entry?.supplementalComponents || {};
  const breakdown = entry?.operatingProfitBreakdown || entrySupplemental?.operatingProfitBreakdown || supplemental?.operatingProfitBreakdown;
  if (!Array.isArray(breakdown) || !breakdown.length) {
    return snapshot?.operatingProfitBreakdown || [];
  }
  return breakdown.map((item) => ({
    ...item,
    valueBn: Number(safeNumber(item.valueBn).toFixed(3)),
    valueFormat: item.valueFormat || "plain",
    sourceUrl: item.sourceUrl || supplemental?.sourceUrl || null,
  }));
}

const PROTOTYPE_DATA_ADAPTERS = {
  "ad-funnel-bridge": {
    deriveCostBreakdown: resolveAdFunnelCostBreakdown,
  },
  "commerce-service-bridge": {
    deriveOperatingProfitBreakdown: resolveOperatingProfitBreakdown,
  },
};

function adaptPrototypeDerivedFields(snapshot, company, entry, prototypeKey) {
  const adapter = PROTOTYPE_DATA_ADAPTERS[prototypeKey];
  const nextFields = {};
  const directCostBreakdown = resolveDirectCostBreakdown(snapshot, company, entry);
  if (directCostBreakdown.length) {
    nextFields.costBreakdown = directCostBreakdown;
  } else {
    const profileCostBreakdown = resolveProfileCostBreakdown(snapshot, company, entry);
    if (profileCostBreakdown.length) {
      nextFields.costBreakdown = profileCostBreakdown;
    } else if (adapter?.deriveCostBreakdown) {
      nextFields.costBreakdown = adapter.deriveCostBreakdown(snapshot, company, entry);
    }
  }
  if (adapter?.deriveOperatingProfitBreakdown) {
    nextFields.operatingProfitBreakdown = adapter.deriveOperatingProfitBreakdown(snapshot, company, entry);
  }
  return nextFields;
}

function formatBillionsByMode(value, mode = "plain") {
  if (mode === "negative-parentheses" || mode === "cost") {
    return formatBillions(-Math.abs(safeNumber(value)), true);
  }
  if (mode === "positive-plus") {
    return `+${formatBillions(Math.abs(safeNumber(value)))}`;
  }
  return formatBillions(value);
}

function formatItemBillions(item, defaultMode = "plain") {
  return formatBillionsByMode(item?.valueBn, item?.valueFormat || defaultMode);
}

function resolvedNetOutcomeValue(snapshot) {
  return safeNumber(snapshot?.netProfitBn, 0);
}

function isLossMakingNetOutcome(snapshot) {
  return resolvedNetOutcomeValue(snapshot) < -0.05;
}

function isNearZeroNetOutcome(snapshot) {
  return Math.abs(resolvedNetOutcomeValue(snapshot)) < 0.05;
}

function resolvedNetOutcomeLabel(snapshot) {
  if (snapshot?.netProfitLabel) return snapshot.netProfitLabel;
  return isLossMakingNetOutcome(snapshot) ? "Net loss" : "Net profit";
}

function formatNetOutcomeBillions(snapshot) {
  const value = resolvedNetOutcomeValue(snapshot);
  return isLossMakingNetOutcome(snapshot) ? formatBillions(value, true) : formatBillions(value);
}

function weightedMetricForGroups(groups, key, valueKey = "valueBn") {
  const total = groups.reduce((sum, item) => sum + safeNumber(item?.[valueKey]), 0);
  if (!total) return null;
  const weighted = groups.reduce((sum, item) => {
    const metric = item?.[key];
    if (metric === null || metric === undefined || Number.isNaN(Number(metric))) return sum;
    return sum + safeNumber(item?.[valueKey]) * Number(metric);
  }, 0);
  return Number((weighted / total).toFixed(1));
}

function normalizeGroupFlowTotalsToRevenue(groups = [], revenueBn = null) {
  const normalized = [...(groups || [])].map((item) => ({
    ...item,
    flowValueBn: safeNumber(item?.flowValueBn ?? item?.valueBn),
  }));
  const revenueValue = safeNumber(revenueBn);
  if (!normalized.length || revenueValue <= 0) return normalized;
  const totalFlowValue = normalized.reduce((sum, item) => sum + safeNumber(item.flowValueBn), 0);
  if (totalFlowValue <= 0) return normalized;
  const overflowTolerance = Math.max(0.02, revenueValue * 0.002);
  if (totalFlowValue <= revenueValue + overflowTolerance) return normalized;
  const scale = revenueValue / totalFlowValue;
  let runningTotal = 0;
  return normalized.map((item, index) => {
    const baseFlowValue = safeNumber(item.flowValueBn);
    const scaledFlowValue =
      index === normalized.length - 1
        ? Number(Math.max(revenueValue - runningTotal, 0).toFixed(3))
        : Number(Math.max(baseFlowValue * scale, 0).toFixed(3));
    runningTotal += scaledFlowValue;
    return {
      ...item,
      flowValueBn: scaledFlowValue,
      flowNormalizedToRevenue: true,
    };
  });
}

function sortBusinessGroupsByValue(groups) {
  return [...(groups || [])].sort((left, right) => {
    const rightValue = safeNumber(right?.valueBn, safeNumber(right?.flowValueBn));
    const leftValue = safeNumber(left?.valueBn, safeNumber(left?.flowValueBn));
    return rightValue - leftValue;
  });
}

function normalizePrototypeBusinessGroups(groups, prototypeKey) {
  const items = [...(groups || [])].map((item) => ({
    ...item,
    flowValueBn: item?.flowValueBn ?? item?.valueBn,
  }));
  if (!items.length) return items;
  const refreshMonochromePalette = (rows, styleKey) => {
    const distinctColors = new Set(rows.map((item) => String(item.nodeColor || item.labelColor || "").toLowerCase()).filter(Boolean));
    if (distinctColors.size > 2) return rows;
    const palette = revenuePaletteForStyle(null, styleKey, rows.length);
    return rows.map((item, index) => {
      const color = palette[index % palette.length];
      return {
        ...item,
        nodeColor: color,
        flowColor: rgba(color, 0.58),
        labelColor: color,
        valueColor: color,
      };
    });
  };

  if (prototypeKey === "membership-fee-bridge") {
    const membershipGroup =
      items.find((item) => normalizeLabelKey(item.id || item.memberKey || item.name) === "membership") ||
      items.find((item) => normalizeLabelKey(item.name).includes("membership"));
    if (membershipGroup && items.length >= 2) {
      const netSalesMembers = items.filter((item) => item !== membershipGroup);
      const valueBn = netSalesMembers.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
      const flowValueBn = netSalesMembers.reduce((sum, item) => sum + safeNumber(item.flowValueBn ?? item.valueBn), 0);
      const netSalesGroup = {
        id: "netsales",
        memberKey: "netsales",
        name: "Net Sales",
        displayLines: ["Net Sales"],
        valueBn,
        flowValueBn,
        yoyPct: weightedMetricForGroups(netSalesMembers, "yoyPct"),
        qoqPct: weightedMetricForGroups(netSalesMembers, "qoqPct", "flowValueBn"),
        nodeColor: UNIVERSAL_REVENUE_SEGMENT_PALETTE[0],
        flowColor: rgba(UNIVERSAL_REVENUE_SEGMENT_PALETTE[0], 0.58),
        labelColor: UNIVERSAL_REVENUE_SEGMENT_PALETTE[0],
        valueColor: UNIVERSAL_REVENUE_SEGMENT_PALETTE[0],
      };
      return [
        netSalesGroup,
        {
          ...membershipGroup,
          id: "membershipfee",
          memberKey: "membershipfee",
          name: "Membership Fee",
          displayLines: ["Membership Fee"],
          nodeColor: membershipGroup.nodeColor || UNIVERSAL_REVENUE_SEGMENT_PALETTE[1],
          flowColor: membershipGroup.flowColor || rgba(UNIVERSAL_REVENUE_SEGMENT_PALETTE[1], 0.58),
          labelColor: membershipGroup.nodeColor || UNIVERSAL_REVENUE_SEGMENT_PALETTE[1],
          valueColor: membershipGroup.nodeColor || UNIVERSAL_REVENUE_SEGMENT_PALETTE[1],
        },
      ];
    }
  }

  if (prototypeKey === "commerce-service-bridge") {
    const normalizedItems = items.map((item) => {
      const key = normalizeLabelKey(item.id || item.memberKey || item.name);
      if (key === "amazonwebservices") {
        return {
          ...item,
          name: "AWS",
          displayLines: ["AWS"],
          supportLines: item.supportLines?.length ? item.supportLines : null,
        };
      }
      if (key === "advertisingservices") {
        return {
          ...item,
          name: "Advertising",
          displayLines: ["Advertising"],
          supportLines: item.supportLines?.length ? item.supportLines : ["Amazon Ads"],
        };
      }
      if (key === "subscriptionservices") {
        return {
          ...item,
          name: "Subscription",
          displayLines: ["Subscription"],
        };
      }
      if (key === "physicalstores") {
        return {
          ...item,
          name: "Physical Store",
          displayLines: ["Physical Store"],
        };
      }
      if (key === "thirdpartysellerservices") {
        return {
          ...item,
          name: "3rd party sellers services",
          displayLines: ["3rd party sellers", "services"],
        };
      }
      if (key === "otherservices") {
        return {
          ...item,
          name: "Other",
          displayLines: ["Other"],
          microSource: safeNumber(item.valueBn) < 2,
          compactLabel: safeNumber(item.valueBn) < 2 ? true : item.compactLabel,
        };
      }
      if (safeNumber(item.valueBn) < 2) {
        return {
          ...item,
          microSource: true,
          compactLabel: true,
          layoutDensity: item.layoutDensity || "dense",
        };
      }
      return item;
    });
    return refreshMonochromePalette(normalizedItems, "commerce-service-bridge");
  }

  if (prototypeKey === "ad-funnel-bridge") {
    return items.map((item) => {
      const key = normalizeLabelKey(item.id || item.memberKey || item.name);
      if (key === "googleservices") {
        return {
          ...item,
          id: "adrevenue",
          memberKey: "adrevenue",
          name: "Ad Revenue",
          displayLines: ["Ad Revenue"],
        };
      }
      if (key === "other") {
        return {
          ...item,
          microSource: true,
          compactLabel: true,
          layoutDensity: item.layoutDensity || "dense",
        };
      }
      if (safeNumber(item.valueBn) < 2) {
        return {
          ...item,
          compactLabel: true,
          layoutDensity: item.layoutDensity || "dense",
        };
      }
      return item;
    });
  }

  if (prototypeKey === "apps-labs-bridge") {
    return items.map((item) => {
      const key = normalizeLabelKey(item.id || item.memberKey || item.name);
      if (key === "familyofapps") {
        return {
          ...item,
          name: "Family of Apps",
          displayLines: ["Family of Apps", "(FoA)"],
        };
      }
      if (key === "realitylabs") {
        return {
          ...item,
          name: "Reality Labs",
          displayLines: ["Reality Labs", "(RL)"],
        };
      }
      return item;
    });
  }

  return items;
}

function prototypeLockupKeyForItem(prototypeKey, item, tier = "group") {
  const key = normalizeLabelKey(item?.id || item?.memberKey || item?.name);
  if (prototypeKey === "ad-funnel-bridge") {
    if (tier === "detail") {
      if (key === "searchadvertising") return "google-search-business";
      if (key === "youtube") return "youtube-business";
      if (key === "admob") return "admob-business";
      return null;
    }
    if (key === "googleplay") return "google-play-business";
    if (key === "googlecloud") return "google-cloud-business";
    if (key === "adrevenue") return "google-ad-stack-business";
    return null;
  }
  if (prototypeKey === "commerce-service-bridge") {
    if (key === "onlinestores") return "amazon-online-business";
    if (key === "physicalstore" || key === "physicalstores") return "wholefoods-business";
    if (key === "advertising") return "amazon-ads-business";
    if (key === "subscription") return "prime-audible-business";
    if (key === "aws" || key === "amazonwebservices") return "aws-business";
    return null;
  }
  if (prototypeKey === "apps-labs-bridge") {
    if (key === "familyofapps") return "meta-apps-business";
    if (key === "realitylabs") return "meta-quest-business";
    return null;
  }
  return null;
}

function normalizePrototypeDetailGroups(groups, prototypeKey) {
  return [...(groups || [])].map((item) => {
    const lockupKey = prototypeLockupKeyForItem(prototypeKey, item, "detail");
    const normalizedItem = lockupKey ? { ...item, lockupKey } : { ...item };
    if (prototypeKey === "apps-labs-bridge") {
      const targetKey = normalizeLabelKey(normalizedItem.targetId || normalizedItem.targetName || "");
      if (targetKey === "familyofapps") {
        normalizedItem.targetName = "Family of Apps";
      } else if (targetKey === "realitylabs") {
        normalizedItem.targetName = "Reality Labs";
      }
    }
    return normalizedItem;
  });
}

function prototypeDefinitionForKey(prototypeKey) {
  return STRUCTURAL_PROTOTYPES[prototypeKey] || STRUCTURAL_PROTOTYPES["default-replica"];
}

function inferSnapshotPrototype(snapshot, company, entry = null) {
  const styleKey = snapshot?.officialRevenueStyle || entry?.officialRevenueStyle || null;
  if (styleKey && OFFICIAL_STYLE_TO_PROTOTYPE[styleKey]) {
    return OFFICIAL_STYLE_TO_PROTOTYPE[styleKey];
  }
  const normalizedNames = new Set(
    [...(snapshot?.businessGroups || [])].map((item) => normalizeLabelKey(item.id || item.memberKey || item.name))
  );
  if (
    (normalizedNames.has("productivitybusinessprocesses") || normalizedNames.has("productivityandbusinessprocesses")) &&
    normalizedNames.has("intelligentcloud") &&
    normalizedNames.has("morepersonalcomputing")
  ) {
    return "triad-lockup-bridge";
  }
  if (normalizedNames.has("membership") || normalizedNames.has("membershipfee")) {
    return "membership-fee-bridge";
  }
  if (normalizedNames.has("adrevenue") && (normalizedNames.has("googleplay") || normalizedNames.has("googlecloud"))) {
    return "ad-funnel-bridge";
  }
  if (
    normalizedNames.has("onlinestores") &&
    (normalizedNames.has("amazonwebservices") || normalizedNames.has("aws") || normalizedNames.has("thirdpartysellerservices"))
  ) {
    return "commerce-service-bridge";
  }
  if (normalizedNames.has("familyofapps") && normalizedNames.has("realitylabs")) {
    return "apps-labs-bridge";
  }
  if ((snapshot?.leftDetailGroups || []).length) {
    return "hierarchical-detail-bridge";
  }
  return "default-replica";
}

function attachLocalizedNameHints(items = []) {
  return [...items].map((item) => ({
    ...item,
    nameZh: item?.nameZh || translateBusinessLabelToZh(item?.name || ""),
  }));
}

function applyPrototypeLanguage(snapshot, company, entry = null) {
  const prototypeKey = snapshot.prototypeKey || inferSnapshotPrototype(snapshot, company, entry);
  const prototype = prototypeDefinitionForKey(prototypeKey);
  const normalizedBelowOperatingItems = attachLocalizedNameHints(snapshot.belowOperatingItems || []).map((item) => ({
    ...item,
    valueFormat: item.valueFormat || "negative-parentheses",
  }));
  const derivedFields = adaptPrototypeDerivedFields(snapshot, company, entry, prototypeKey);
  const nextSnapshot = {
    ...snapshot,
    prototypeKey,
    prototypeLabel: prototype.label,
    prototypeFlags: {
      ...(prototype.flags || {}),
      ...(snapshot.prototypeFlags || {}),
    },
    businessGroups: sortBusinessGroupsByValue(
      normalizePrototypeBusinessGroups(attachLocalizedNameHints(snapshot.businessGroups || []), prototypeKey).map((item) => {
        const lockupKey = item.lockupKey || prototypeLockupKeyForItem(prototypeKey, item, "group");
        return lockupKey ? { ...item, lockupKey } : item;
      })
    ),
    leftDetailGroups: normalizePrototypeDetailGroups(attachLocalizedNameHints(snapshot.leftDetailGroups || []), prototypeKey),
    opexBreakdown: attachLocalizedNameHints(snapshot.opexBreakdown || []),
    costBreakdown: attachLocalizedNameHints(snapshot.costBreakdown || []),
    belowOperatingItems: normalizedBelowOperatingItems,
    positiveAdjustments: attachLocalizedNameHints(snapshot.positiveAdjustments || []).map((item) => ({
      ...item,
      valueFormat: item.valueFormat || "plain",
    })),
    ...derivedFields,
  };
  Object.entries(prototype.defaults || {}).forEach(([key, value]) => {
    if (nextSnapshot[key] === null || nextSnapshot[key] === undefined || nextSnapshot[key] === "") {
      nextSnapshot[key] = deepClone(value);
    }
  });
  if (nextSnapshot.prototypeFlags?.leftAnchoredRevenueLabel && !nextSnapshot.revenueLabelMode) {
    nextSnapshot.revenueLabelMode = "left";
  }
  if (nextSnapshot.prototypeFlags?.preferCompactSources && nextSnapshot.compactSourceLabels === undefined) {
    nextSnapshot.compactSourceLabels = true;
  }
  return nextSnapshot;
}

function templatePresetKey(snapshot, company) {
  return snapshot?.prototypeKey || inferSnapshotPrototype(snapshot, company);
}

function templatePresetLabel(snapshot, company) {
  const key = templatePresetKey(snapshot, company);
  return prototypeDefinitionForKey(key).label;
}

function baseTemplateTokensForSnapshot(snapshot, company) {
  if (!snapshot) return deepClone(BASE_TEMPLATE_TOKENS);
  const prototype = prototypeDefinitionForKey(templatePresetKey(snapshot, company));
  const styleTokens = prototype.tokenPresetKey ? TEMPLATE_STYLE_PRESETS[prototype.tokenPresetKey] || {} : {};
  const prototypeTokens = deepMerge(styleTokens, prototype.tokens || {});
  return deepMerge(
    deepMerge(BASE_TEMPLATE_TOKENS, prototypeTokens),
    {
      layout: deepClone(snapshot.layout || {}),
      ribbon: deepClone(snapshot.ribbon || BASE_TEMPLATE_TOKENS.ribbon),
      typography: deepClone(snapshot.typography || {}),
    }
  );
}

function effectiveTemplateTokens(snapshot, company) {
  const presetKey = templatePresetKey(snapshot, company);
  const base = baseTemplateTokensForSnapshot(snapshot, company);
  const override = state.calibration.tokenOverridesByPreset[presetKey] || {};
  return deepMerge(base, override);
}

function applyTemplateTokensToSnapshot(snapshot, company) {
  const tokens = effectiveTemplateTokens(snapshot, company);
  const snapshotLayout = deepClone(snapshot.layout || {});
  const layoutFromTokens = deepClone(tokens.layout || {});
  ["costNodeTop", "opNodeTop", "opexNodeTop", "netNodeTop", "costBreakdownX"].forEach((key) => {
    if (snapshotLayout[key] === null || snapshotLayout[key] === undefined) {
      delete layoutFromTokens[key];
    }
  });
  return {
    ...snapshot,
    layout: {
      ...layoutFromTokens,
      ...snapshotLayout,
    },
    ribbon: {
      ...(snapshot.ribbon || {}),
      ...(tokens.ribbon || {}),
    },
    typography: {
      ...(snapshot.typography || {}),
      ...(tokens.typography || {}),
    },
    templatePresetKey: templatePresetKey(snapshot, company),
    templatePresetLabel: templatePresetLabel(snapshot, company),
    templateTokens: tokens,
  };
}

function snapshotCanvasSize(snapshot) {
  const baseWidth = safeNumber(snapshot?.layout?.canvasWidth, 2048);
  const baseHeight = safeNumber(snapshot?.layout?.canvasHeight, 1325);
  const baseDesignHeight = safeNumber(snapshot?.layout?.canvasDesignHeight, 1160);
  const nodeWidth = 58;
  const sourceNodeWidth = safeNumber(snapshot?.layout?.sourceNodeWidth, Math.max(nodeWidth - 6, 48));
  const stageLayout = resolveUniformStageLayout(snapshot, {
    nodeWidth,
    sourceNodeWidth,
  });
  const showQoq = hasSnapshotQoqMetrics(snapshot);
  const sources = Array.isArray(snapshot?.businessGroups) ? snapshot.businessGroups.filter((item) => safeNumber(item?.valueBn) > 0.02) : [];
  const detailGroups = Array.isArray(snapshot?.leftDetailGroups) ? snapshot.leftDetailGroups.filter((item) => safeNumber(item?.valueBn) > 0.02) : [];
  const opexItems = Array.isArray(snapshot?.opexBreakdown) ? snapshot.opexBreakdown.filter((item) => safeNumber(item?.valueBn) > 0.02) : [];
  const deductionItems = Array.isArray(snapshot?.belowOperatingItems)
    ? snapshot.belowOperatingItems.filter((item) => safeNumber(item?.valueBn) > 0.02)
    : [];
  const costBreakdownItems = Array.isArray(snapshot?.costBreakdown) ? snapshot.costBreakdown.filter((item) => safeNumber(item?.valueBn) > 0.02) : [];
  const positiveItems = Array.isArray(snapshot?.positiveAdjustments) ? snapshot.positiveAdjustments.filter((item) => safeNumber(item?.valueBn) > 0.02) : [];
  const detailTargetKeys = new Set(
    detailGroups
      .map((item) => normalizeLabelKey(item.targetId || item.targetName || item.target || item.groupName))
      .filter(Boolean)
  );
  const autoStackRegularSourcesBelowDetails = shouldStackRegularSourcesBelowDetails(snapshot, detailTargetKeys, sources);
  const sourceCount = sources.length;
  const detailCount = detailGroups.length;
  const opexCount = opexItems.length;
  const deductionCount = deductionItems.length;
  const costBreakdownCount = costBreakdownItems.length;
  const positiveCount = positiveItems.length;
  const bottomCanvasPadding =
    safeNumber(snapshot?.layout?.bottomCanvasPadding, 88) +
    Math.max(sourceCount + detailCount + opexCount + deductionCount + costBreakdownCount - 12, 0) * 4;
  const usesPreDetailRevenueLayout = detailCount > 0;
  const sourceDensity = sourceCount >= 11 ? "ultra" : sourceCount >= 8 ? "dense" : sourceCount >= 6 ? "compact" : "regular";
  const compactSources = !!snapshot?.compactSourceLabels || sourceDensity !== "regular";
  const sourceExtra =
    Math.max(sourceCount - 5, 0) * 54 +
    Math.max(sourceCount - 9, 0) * 30 +
    Math.max(sourceCount - 13, 0) * 42;
  const detailExtra = Math.max(detailCount - 3, 0) * 18 + Math.max(detailCount - 6, 0) * 10;
  const rightExtra =
    Math.max(opexCount - 2, 0) * 44 +
    Math.max(deductionCount - 1, 0) * 58 +
    Math.max(costBreakdownCount - 1, 0) * 36 +
    Math.max(costBreakdownCount - 2, 0) * 22 +
    Math.max(costBreakdownCount - 4, 0) * 44 +
    positiveCount * 46;
  const densityExtra =
    (sourceCount + detailCount >= 8 ? 56 : 0) +
    (sourceCount + detailCount >= 11 ? 86 : 0) +
    (sourceCount + detailCount >= 14 ? 108 : 0) +
    (sourceCount >= 8 ? 44 : 0) +
    (sourceCount >= 12 ? 72 : 0) +
    (sourceCount >= 16 ? 84 : 0) +
    (opexCount + deductionCount + costBreakdownCount >= 6 ? 40 : 0);
  const hierarchyExtra =
    (detailCount ? 72 : 0) +
    Math.max(sourceCount - 6, 0) * 22 +
    Math.max(sourceCount - 8, 0) * 26;
  const sourceLabelTitleSize = safeNumber(snapshot?.layout?.sourceTemplateTitleSize, 28);
  const detailLabelTitleSize = safeNumber(snapshot?.layout?.detailSourceTitleSize, sourceLabelTitleSize);
  const baseLeftX = stageLayout.leftX;
  const baseLeftDetailX = stageLayout.leftDetailX;
  const sourceTemplateLabelGapX = safeNumber(
    snapshot?.layout?.sourceTemplateLabelGapX,
    safeNumber(snapshot?.layout?.sourceLabelGapX, 18)
  );
  const detailSourceLabelGapX = safeNumber(snapshot?.layout?.detailSourceLabelGapX, sourceTemplateLabelGapX);
  const leftDetailWidth = safeNumber(snapshot?.layout?.leftDetailWidth, sourceNodeWidth);
  const baseSourceLabelX = safeNumber(
    snapshot?.layout?.sourceTemplateLabelX,
    usesPreDetailRevenueLayout
      ? safeNumber(snapshot?.layout?.sourceLabelX, baseLeftX - sourceTemplateLabelGapX)
      : baseLeftX - sourceTemplateLabelGapX
  );
  const baseDetailLabelX = safeNumber(snapshot?.layout?.detailSourceLabelX, baseLeftDetailX - detailSourceLabelGapX);
  const preDetailLeadEnabled = autoStackRegularSourcesBelowDetails;
  const leadEligibleSourceIndexes = collectPreDetailLeadEligibleSourceIndexes(detailTargetKeys, sources);
  const regularSourceRankMap = new Map(leadEligibleSourceIndexes.map((sourceIndex, orderIndex) => [sourceIndex, orderIndex]));
  const sourceLabelLeftEdges = sources.map((item, sourceIndex) => {
    const compactMode = compactSources || item.compactLabel;
    const labelLines = resolveSourceLabelLines(item, {
      compactMode,
      fontSize: sourceLabelTitleSize,
      maxWidth: currentChartLanguage() === "zh" ? 166 : 198,
    });
    const leadOffsetX =
      preDetailLeadEnabled && regularSourceRankMap.has(sourceIndex)
        ? resolvePreDetailRegularSourceLeadDistance(snapshot, {
            regularCount: leadEligibleSourceIndexes.length,
            orderIndex: regularSourceRankMap.get(sourceIndex),
            leftX: baseLeftX,
            detailRightX: baseLeftDetailX + leftDetailWidth,
          })
        : 0;
    return baseSourceLabelX - leadOffsetX - approximateTextBlockWidth(labelLines, sourceLabelTitleSize) - 12;
  });
  const detailLabelLeftEdges = detailGroups.map((item) => {
    const compactMode = compactSources || item.compactLabel;
    const labelLines = resolveSourceLabelLines(item, {
      compactMode,
      fontSize: detailLabelTitleSize,
      maxWidth: currentChartLanguage() === "zh" ? 166 : 198,
    });
    return baseDetailLabelX - approximateTextBlockWidth(labelLines, detailLabelTitleSize) - 12;
  });
  const leftCanvasPadding = safeNumber(snapshot?.layout?.leftCanvasPadding, 44);
  const minLabelLeftEdge = Math.min(...sourceLabelLeftEdges, ...detailLabelLeftEdges, leftCanvasPadding);
  const leftShiftX = usesPreDetailRevenueLayout ? Math.max(Math.ceil(leftCanvasPadding - minLabelLeftEdge), 0) : 0;

  const sourceNodeMinY = safeNumber(snapshot?.layout?.sourceNodeMinY, safeNumber(snapshot?.layout?.revenueTop, 330) - 8);
  const sourceNodeMaxY = safeNumber(
    snapshot?.layout?.sourceNodeMaxY,
    sourceDensity === "ultra" ? 1136 : sourceDensity === "dense" ? 1108 : 1058
  );
  const isAdFunnelDetailLayout = snapshot?.prototypeKey === "ad-funnel-bridge";
  const leftDetailMinY = safeNumber(snapshot?.layout?.leftDetailMinY, isAdFunnelDetailLayout ? 224 : 246);
  const leftDetailMaxY = safeNumber(snapshot?.layout?.leftDetailMaxY, isAdFunnelDetailLayout ? 1042 : 1026);
  const microSourceHeight = safeNumber(snapshot?.layout?.microSourceHeight, 48);
  const sourceBoxGap = safeNumber(
    snapshot?.layout?.sourceLabelGap,
    sourceDensity === "ultra" ? 4 : sourceDensity === "dense" ? 8 : compactSources ? 12 : 24
  ) + (showQoq ? (compactSources ? 8 : 14) : compactSources ? 4 : 0);
  const detailBoxGap = safeNumber(snapshot?.layout?.leftDetailGap, safeNumber(snapshot?.layout?.leftDetailNodeGap, sourceBoxGap));
  const sourceBoxHeights = sources.map((item) =>
    item.microSource
      ? microSourceHeight
      : estimateReplicaSourceBoxHeight(item, showQoq, compactSources || item.compactLabel)
  );
  const detailBoxHeights = detailGroups.map((item) => estimateReplicaSourceBoxHeight(item, showQoq, compactSources || item.compactLabel));
  const sourceSpanRequired = estimatedStackSpan(sourceBoxHeights, sourceBoxGap);
  const detailSpanRequired = estimatedStackSpan(detailBoxHeights, detailBoxGap);
  const sourceSpanAvailable = Math.max(sourceNodeMaxY - sourceNodeMinY, 1);
  const detailSpanAvailable = Math.max(leftDetailMaxY - leftDetailMinY, 1);
  const sourceSpanOverflow = Math.max(sourceSpanRequired - sourceSpanAvailable, 0);
  const detailSpanOverflow = Math.max(detailSpanRequired - detailSpanAvailable, 0);
  let sequentialLeftOverflow = 0;
  if (autoStackRegularSourcesBelowDetails) {
    const summarySourceHeights = [];
    const regularSourceHeights = [];
    sources.forEach((item, index) => {
      const sourceKey = normalizeLabelKey(item.id || item.memberKey || item.name);
      if (detailTargetKeys.has(sourceKey)) {
        summarySourceHeights.push(sourceBoxHeights[index]);
      } else {
        regularSourceHeights.push(sourceBoxHeights[index]);
      }
    });
    const sequentialSpanRequired =
      estimatedStackSpan(summarySourceHeights, sourceBoxGap) +
      estimatedStackSpan(detailBoxHeights, detailBoxGap) +
      estimatedStackSpan(regularSourceHeights, sourceBoxGap) +
      (summarySourceHeights.length && detailBoxHeights.length ? sourceBoxGap : 0) +
      (regularSourceHeights.length && detailBoxHeights.length ? sourceBoxGap : 0);
    const sequentialSpanAvailable = Math.max(Math.max(sourceNodeMaxY, leftDetailMaxY) - Math.min(sourceNodeMinY, leftDetailMinY), 1);
    sequentialLeftOverflow = Math.max(sequentialSpanRequired - sequentialSpanAvailable, 0);
  }
  const boundedSequentialLeftOverflow = usesPreDetailRevenueLayout
    ? Math.min(sequentialLeftOverflow, safeNumber(snapshot?.layout?.maxSequentialLeftOverflow, 136))
    : sequentialLeftOverflow;

  const templateTokens = snapshot?.templateTokens || {};
  const opexBand = prototypeBandConfig(templateTokens, "opex", opexCount);
  const opexDensity = opexBand.densityKey === "dense" ? "dense" : "regular";
  const opexSpanRequired = estimatedStackSpan(
    opexItems.map((item) => Math.max(estimateReplicaTreeBoxHeight(item, { density: opexDensity }) + safeNumber(opexBand.heightOffset, 0), 24)),
    safeNumber(opexBand.gap, opexCount >= 5 ? 18 : 28)
  );
  const opexSpanAvailable = Math.max(
    safeNumber(opexBand.maxY, opexCount >= 5 ? 982 : 1028) - safeNumber(opexBand.minY, opexCount >= 5 ? 680 : 700),
    1
  );
  const deductionBand = prototypeBandConfig(templateTokens, "deductions");
  const deductionDensity = deductionCount >= 3 ? "dense" : "regular";
  const deductionSpanRequired = estimatedStackSpan(
    deductionItems.map((item) => Math.max(estimateReplicaTreeBoxHeight(item, { density: deductionDensity }) + safeNumber(deductionBand.heightOffset, -8), 24)),
    safeNumber(deductionBand.gap, 24)
  );
  const deductionSpanAvailable = Math.max(
    safeNumber(deductionBand.maxClamp, 680) - safeNumber(deductionBand.minClamp, 420),
    1
  );
  const costBreakdownBand = prototypeBandConfig(templateTokens, "costBreakdown");
  const costBreakdownDensity = costBreakdownCount >= 3 ? "dense" : "regular";
  const costBreakdownGapEstimate =
    costBreakdownCount >= 5
      ? 44
      : costBreakdownCount >= 4
        ? 38
        : safeNumber(costBreakdownBand.gap, 24);
  const costBreakdownSpanRequired = estimatedStackSpan(
    costBreakdownItems.map((item) => Math.max(estimateReplicaTreeBoxHeight(item, { density: costBreakdownDensity }) + safeNumber(costBreakdownBand.heightOffset, 0), 24)),
    costBreakdownGapEstimate
  );
  const costBreakdownSpanAvailable = Math.max(
    safeNumber(costBreakdownBand.maxY, 1002) - safeNumber(costBreakdownBand.minY, 744),
    1
  );
  const structuralOverflow =
    sourceSpanOverflow +
    detailSpanOverflow * 0.7 +
    boundedSequentialLeftOverflow +
    Math.max(opexSpanRequired - opexSpanAvailable, 0) +
    Math.max(deductionSpanRequired - deductionSpanAvailable, 0) * 0.7 +
    Math.max(costBreakdownSpanRequired - costBreakdownSpanAvailable, 0) * 0.85 +
    (positiveCount ? 26 + Math.max(positiveCount - 1, 0) * 18 : 0);
  const detailLayoutExtraScale = usesPreDetailRevenueLayout ? 0.68 : 1;
  const extraHeight =
    sourceExtra +
    detailExtra +
    Math.max(rightExtra, 0) +
    densityExtra * detailLayoutExtraScale +
    hierarchyExtra * detailLayoutExtraScale +
    structuralOverflow * (usesPreDetailRevenueLayout ? 0.58 : 0.78);
  const height = baseHeight + extraHeight;
  const revenueBn = Math.max(safeNumber(snapshot?.revenueBn), safeNumber(snapshot?.layout?.ratioRevenueFloorBn, 0.25));
  const opexRatio = Math.max(safeNumber(snapshot?.operatingExpensesBn) / revenueBn, 0);
  const costRatio = Math.max(safeNumber(snapshot?.costOfRevenueBn) / revenueBn, 0);
  const designHeight =
    baseDesignHeight +
    Math.max(opexRatio - 1.45, 0) * 320 +
    Math.max(costRatio - 1.15, 0) * 120 +
    structuralOverflow * (usesPreDetailRevenueLayout ? 0.48 : 1.05) +
    Math.max(detailCount - 2, 0) * 22;
  return {
    width: Math.max(Math.round(baseWidth + leftShiftX + safeNumber(stageLayout.rightExpansion, 0)), 1),
    height: Math.max(Math.round(height + bottomCanvasPadding), 1),
    designHeight: Math.max(Math.round(designHeight + bottomCanvasPadding), 1),
    leftShiftX: Math.max(Math.round(leftShiftX), 0),
  };
}

function currentSnapshotLogoKeys() {
  const snapshot = state.currentSnapshot;
  if (!snapshot) return [];
  const keys = new Set();
  if (snapshot.companyLogoKey) keys.add(normalizeLogoKey(snapshot.companyLogoKey));
  (snapshot.businessGroups || []).forEach((item) => {
    if (item.lockupKey && !String(item.lockupKey).startsWith("region-")) {
      keys.add(normalizeLogoKey(item.lockupKey));
    }
  });
  return [...keys].filter(Boolean);
}

function queueLogoNormalization(logoKey) {
  const normalizedKey = normalizeLogoKey(logoKey);
  const asset = state.logoCatalog?.[normalizedKey];
  if (!normalizedKey || !asset || state.normalizedLogoKeys[normalizedKey] || state.logoNormalizationJobs[normalizedKey]) return;
  state.logoNormalizationJobs[normalizedKey] = normalizeBitmapLogoAsset(asset)
    .then((normalizedAsset) => {
      state.logoCatalog[normalizedKey] = normalizedAsset || asset;
      state.normalizedLogoKeys[normalizedKey] = true;
    })
    .catch(() => {
      state.normalizedLogoKeys[normalizedKey] = true;
    })
    .finally(() => {
      delete state.logoNormalizationJobs[normalizedKey];
      if (currentSnapshotLogoKeys().includes(normalizedKey)) {
        requestAnimationFrame(() => {
          if (state.currentSnapshot) renderCurrent();
        });
      }
    });
}

function warmVisibleLogoAssets() {
  currentSnapshotLogoKeys().forEach((logoKey) => queueLogoNormalization(logoKey));
}

function normalizeCompanyBrand(brand = null) {
  const candidate = isPlainObject(brand) ? brand : {};
  return {
    primary: candidate.primary || DEFAULT_COMPANY_BRAND.primary,
    secondary: candidate.secondary || DEFAULT_COMPANY_BRAND.secondary,
    accent: candidate.accent || DEFAULT_COMPANY_BRAND.accent,
  };
}

function normalizeLoadedCompany(company, index = 0) {
  const fallback = COMPANY_METADATA_FALLBACKS[String(company?.id || "").trim().toLowerCase()] || {};
  const ticker = String(company?.ticker || fallback.ticker || "N/A");
  const nameEn = String(company?.nameEn || fallback.nameEn || ticker);
  const nameZh = String(company?.nameZh || fallback.nameZh || nameEn);
  const quarterCount = Array.isArray(company?.quarters) ? company.quarters.length : 0;
  const coverage = {
    ...(isPlainObject(company?.coverage) ? company.coverage : {}),
    quarterCount: Math.max(safeNumber(company?.coverage?.quarterCount, quarterCount), quarterCount),
  };
  return {
    ...fallback,
    ...company,
    ticker,
    nameEn,
    nameZh,
    slug: company?.slug || fallback.slug || normalizeLabelKey(nameEn || ticker),
    rank: safeNumber(company?.rank, safeNumber(fallback.rank, index + 1)),
    isAdr: company?.isAdr !== undefined ? !!company.isAdr : !!fallback.isAdr,
    brand: normalizeCompanyBrand({
      ...(isPlainObject(fallback.brand) ? fallback.brand : {}),
      ...(isPlainObject(company?.brand) ? company.brand : {}),
    }),
    coverage,
  };
}

function companySearchValue(company) {
  return `${company?.nameZh || ""} ${company?.nameEn || ""} ${company?.ticker || ""}`.toLowerCase();
}

function rgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;
  const red = Number.parseInt(safe.slice(0, 2), 16);
  const green = Number.parseInt(safe.slice(2, 4), 16);
  const blue = Number.parseInt(safe.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHex(hexA, hexB, ratio = 0.5) {
  const normalizeHex = (value) => {
    const normalized = String(value || "").replace("#", "");
    return normalized.length === 3
      ? normalized.split("").map((part) => `${part}${part}`).join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  };
  const left = normalizeHex(hexA);
  const right = normalizeHex(hexB);
  const mix = clamp(Number(ratio), 0, 1);
  const channelAt = (hex, offset) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  const channel = (offset) => Math.round(channelAt(left, offset) * (1 - mix) + channelAt(right, offset) * mix);
  return `#${[0, 2, 4].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

function wrapLines(text, maxChars) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const words = raw.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = word;
  });
  if (line) lines.push(line);
  return lines;
}

function approximateTextWidth(text, fontSize = 16) {
  const raw = String(text || "");
  if (!raw) return 0;
  let emWidth = 0;
  for (const char of raw) {
    if (/\s/.test(char)) {
      emWidth += 0.34;
    } else if (/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(char)) {
      emWidth += 1;
    } else if (/[MW@#%&]/.test(char)) {
      emWidth += 0.84;
    } else if (/[A-Z0-9$]/.test(char)) {
      emWidth += 0.66;
    } else if (/[ilI1.,:;|!']/u.test(char)) {
      emWidth += 0.32;
    } else if (/[\(\)\[\]\/\\_\-]/.test(char)) {
      emWidth += 0.42;
    } else {
      emWidth += 0.56;
    }
  }
  return emWidth * fontSize;
}

function approximateTextBlockWidth(lines, fontSize = 16) {
  return (lines || []).reduce((maxWidth, line) => Math.max(maxWidth, approximateTextWidth(line, fontSize)), 0);
}

function estimatedStackSpan(heights, gap = 0) {
  const filteredHeights = (heights || []).map((value) => Math.max(safeNumber(value), 0)).filter((value) => value > 0);
  if (!filteredHeights.length) return 0;
  return filteredHeights.reduce((sum, value) => sum + value, 0) + Math.max(filteredHeights.length - 1, 0) * Math.max(safeNumber(gap), 0);
}

function resolvePreDetailRegularSourceLeadCompression(snapshot, regularCount = 0) {
  const detailGroups = Array.isArray(snapshot?.leftDetailGroups)
    ? snapshot.leftDetailGroups.filter((item) => Math.max(safeNumber(item?.valueBn), 0) > 0.02)
    : [];
  if (!detailGroups.length || regularCount <= 0) return 0;
  const totalDetailValue = Math.max(detailGroups.reduce((sum, item) => sum + Math.max(safeNumber(item?.valueBn), 0), 0), 0.01);
  const dominantDetailShare = detailGroups.reduce(
    (largest, item) => Math.max(largest, Math.max(safeNumber(item?.valueBn), 0) / totalDetailValue),
    0
  );
  const smallDetailCount = detailGroups.filter((item) => {
    const valueBn = Math.max(safeNumber(item?.valueBn), 0);
    const share = valueBn / totalDetailValue;
    return valueBn <= 0.42 || share <= 0.055;
  }).length;
  const tinyDetailCount = detailGroups.filter((item) => {
    const valueBn = Math.max(safeNumber(item?.valueBn), 0);
    const share = valueBn / totalDetailValue;
    return valueBn <= 0.2 || share <= 0.028;
  }).length;
  const crowdedLayoutPenalty =
    Math.max(detailGroups.length - 4, 0) * 18 +
    smallDetailCount * 14 +
    tinyDetailCount * 10 +
    Math.max(dominantDetailShare - 0.52, 0) * 120;
  const regularCountWeight = regularCount <= 1 ? 1 : regularCount === 2 ? 0.72 : 0.46;
  const maxCompression = regularCount <= 1 ? 110 : regularCount === 2 ? 86 : 58;
  return clamp(crowdedLayoutPenalty * regularCountWeight, 0, maxCompression);
}

function resolvePreDetailRegularSourceLeadConfig(snapshot, regularCount = 0) {
  const count = Math.max(safeNumber(regularCount), 0);
  const detailCount = Array.isArray(snapshot?.leftDetailGroups)
    ? snapshot.leftDetailGroups.filter((item) => safeNumber(item?.valueBn) > 0.02).length
    : 0;
  const densityBoostX = clamp(Math.max(detailCount - 2, 0) * 10 + Math.max(count - 2, 0) * 8, 0, 42);
  const leadCompressionX = resolvePreDetailRegularSourceLeadCompression(snapshot, count);
  const baseMaxLeadBudgetX = (count >= 4 ? 184 : count >= 3 ? 170 : 154) + densityBoostX;
  return {
    leadGapX: safeNumber(snapshot?.layout?.regularSourceLeadGapX, 22),
    maxLeadBudgetX: safeNumber(
      snapshot?.layout?.regularSourceMaxLeadX,
      Math.max(baseMaxLeadBudgetX - leadCompressionX, count <= 1 ? 86 : count === 2 ? 96 : 112)
    ),
    minLeadFactor: safeNumber(snapshot?.layout?.regularSourceMinLeadFactor, count >= 4 ? 0.52 : count >= 3 ? 0.48 : 0.56),
    leadExponent: safeNumber(snapshot?.layout?.regularSourceLeadExponent, 1.0),
  };
}

function resolvePreDetailRegularSourceLeadDistance(snapshot, options = {}) {
  const regularCount = Math.max(safeNumber(options.regularCount), 0);
  if (!regularCount) return 0;
  const leftX = safeNumber(options.leftX);
  const detailRightX = safeNumber(options.detailRightX);
  const orderIndex = clamp(Math.round(safeNumber(options.orderIndex, regularCount - 1)), 0, Math.max(regularCount - 1, 0));
  const { leadGapX, maxLeadBudgetX, minLeadFactor, leadExponent } = resolvePreDetailRegularSourceLeadConfig(snapshot, regularCount);
  const availableLeadX = Math.max(leftX - (detailRightX + leadGapX), 0);
  const maxLeadX = Math.min(availableLeadX, Math.max(maxLeadBudgetX, 0));
  if (maxLeadX <= 0) return 0;
  const positionNorm = regularCount <= 1 ? 1 : orderIndex / Math.max(regularCount - 1, 1);
  const leadFactor = minLeadFactor + (1 - minLeadFactor) * Math.pow(positionNorm, leadExponent);
  return maxLeadX * clamp(leadFactor, 0, 1);
}

function collectPreDetailLeadEligibleSourceIndexes(detailTargetKeys = new Set(), sourceItems = []) {
  if (!detailTargetKeys?.size || !Array.isArray(sourceItems) || !sourceItems.length) {
    return [];
  }
  let lastDetailTargetIndex = -1;
  sourceItems.forEach((item, index) => {
    const sourceKey = normalizeLabelKey(item?.id || item?.memberKey || item?.name);
    if (sourceKey && detailTargetKeys.has(sourceKey)) {
      lastDetailTargetIndex = index;
    }
  });
  if (lastDetailTargetIndex < 0) return [];
  return sourceItems.reduce((indexes, item, index) => {
    const sourceKey = normalizeLabelKey(item?.id || item?.memberKey || item?.name);
    if (index > lastDetailTargetIndex && sourceKey && !detailTargetKeys.has(sourceKey)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
}

function shouldStackRegularSourcesBelowDetails(snapshot, detailTargetKeys = new Set(), sourceItems = []) {
  const hasDetailGroups = Array.isArray(snapshot?.leftDetailGroups)
    ? snapshot.leftDetailGroups.some((item) => safeNumber(item?.valueBn) > 0.02)
    : false;
  if (!hasDetailGroups || !detailTargetKeys?.size || !Array.isArray(sourceItems) || !sourceItems.length) {
    return false;
  }
  if (snapshot?.prototypeFlags?.stackRegularSourcesBelowDetails === false) {
    return false;
  }
  return collectPreDetailLeadEligibleSourceIndexes(detailTargetKeys, sourceItems).length > 0;
}

function medianNumber(values = []) {
  const filtered = [...values].map((value) => safeNumber(value, null)).filter((value) => value !== null).sort((left, right) => left - right);
  if (!filtered.length) return 0;
  const middle = Math.floor(filtered.length / 2);
  return filtered.length % 2 ? filtered[middle] : (filtered[middle - 1] + filtered[middle]) / 2;
}

function resolveUniformStageGap(layout, stageGaps, options = {}) {
  const filtered = (stageGaps || []).map((value) => safeNumber(value, null)).filter((value) => value !== null && value > 0);
  const minGap = safeNumber(layout?.minUniformStageGapX, safeNumber(options.min, 220));
  const maxGap = safeNumber(layout?.maxUniformStageGapX, safeNumber(options.max, 360));
  const explicitGap = safeNumber(layout?.uniformStageGapX, null);
  const standardGap = safeNumber(layout?.standardStageGapX, safeNumber(options.standard, 332));
  if (explicitGap !== null) return clamp(explicitGap, minGap, maxGap);
  if (!filtered.length) return clamp(standardGap, minGap, maxGap);
  const strategy = String(layout?.uniformStageGapStrategy || options.strategy || "max").toLowerCase();
  let preferredGap;
  if (strategy === "standard" || strategy === "fixed") {
    preferredGap = standardGap;
  } else if (strategy === "median") {
    preferredGap = medianNumber(filtered);
  } else if (strategy === "mean" || strategy === "average") {
    preferredGap = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  } else {
    preferredGap = Math.max(...filtered);
  }
  return clamp(preferredGap, minGap, maxGap);
}

function resolvePreferredGraphicWidth(layout, options = {}) {
  return Math.max(safeNumber(layout?.preferredGraphicWidth, safeNumber(options.preferredGraphicWidth, 1996)), 1200);
}

function resolveGapFromGraphicWidth(preferredGraphicWidth, stageCount, fixedNodeSpan) {
  if (!stageCount) return 0;
  return Math.max((Math.max(safeNumber(preferredGraphicWidth, 0), fixedNodeSpan + stageCount * 220) - fixedNodeSpan) / stageCount, 0);
}

function resolveUniformStageLayout(snapshot, options = {}) {
  const layout = snapshot?.layout || {};
  const nodeWidth = safeNumber(options.nodeWidth, 58);
  const sourceNodeWidth = safeNumber(options.sourceNodeWidth, Math.max(nodeWidth - 6, 48));
  const usesHeroLockups = !!options.usesHeroLockups;
  const hasDetailGroups = Array.isArray(snapshot?.leftDetailGroups)
    ? snapshot.leftDetailGroups.some((item) => safeNumber(item?.valueBn) > 0.02)
    : false;
  const leftDetailWidth = safeNumber(layout.leftDetailWidth, sourceNodeWidth);
  const baseLeftDetailX = safeNumber(layout.leftDetailX, 156);
  const baseLeftX = safeNumber(layout.leftX, 368);
  const baseRevenueX = safeNumber(layout.revenueX, 742);
  const baseGrossX = safeNumber(layout.grossX, 1122);
  const baseOpX = safeNumber(layout.opX, 1480);
  const baseRightX = safeNumber(layout.rightX, usesHeroLockups ? 1790 : 1688);
  const preferredGraphicWidth = resolvePreferredGraphicWidth(layout, options);
  const clearGap = (fromX, fromWidth, toX) => Math.max(toX - (fromX + fromWidth), 1);

  if (hasDetailGroups) {
    const stageGaps = [
      clearGap(baseLeftDetailX, leftDetailWidth, baseLeftX),
      clearGap(baseLeftX, sourceNodeWidth, baseRevenueX),
      clearGap(baseRevenueX, nodeWidth, baseGrossX),
      clearGap(baseGrossX, nodeWidth, baseOpX),
      clearGap(baseOpX, nodeWidth, baseRightX),
    ];
    const preferredGap = resolveGapFromGraphicWidth(preferredGraphicWidth, 5, leftDetailWidth + sourceNodeWidth + nodeWidth * 4);
    const targetGap = resolveUniformStageGap(layout, stageGaps, {
      min: Math.max(Math.floor(preferredGap - 20), 300),
      max: Math.max(Math.ceil(preferredGap + 20), Math.floor(preferredGap - 20) + 1),
      standard: preferredGap,
      strategy: "standard",
    });
    const leftX = baseLeftDetailX + leftDetailWidth + targetGap;
    const revenueX = leftX + sourceNodeWidth + targetGap;
    const grossX = revenueX + nodeWidth + targetGap;
    const opX = grossX + nodeWidth + targetGap;
    const rightX = opX + nodeWidth + targetGap;
    return {
      hasDetailGroups,
      targetGap,
      leftDetailX: baseLeftDetailX,
      leftX,
      revenueX,
      grossX,
      opX,
      rightX,
      rightExpansion: Math.max(rightX - baseRightX, 0),
    };
  }

  const stageGaps = [
    clearGap(baseLeftX, sourceNodeWidth, baseRevenueX),
    clearGap(baseRevenueX, nodeWidth, baseGrossX),
    clearGap(baseGrossX, nodeWidth, baseOpX),
    clearGap(baseOpX, nodeWidth, baseRightX),
  ];
  const preferredGap = resolveGapFromGraphicWidth(preferredGraphicWidth, 4, sourceNodeWidth + nodeWidth * 4);
  const targetGap = resolveUniformStageGap(layout, stageGaps, {
    min: Math.max(Math.floor(preferredGap - 28), 320),
    max: Math.max(Math.ceil(preferredGap + 28), Math.floor(preferredGap - 28) + 1),
    standard: preferredGap,
    strategy: "standard",
  });
  const revenueX = baseLeftX + sourceNodeWidth + targetGap;
  const grossX = revenueX + nodeWidth + targetGap;
  const opX = grossX + nodeWidth + targetGap;
  const rightX = opX + nodeWidth + targetGap;
  return {
    hasDetailGroups,
    targetGap,
    leftDetailX: baseLeftDetailX,
    leftX: baseLeftX,
    revenueX,
    grossX,
    opX,
    rightX,
    rightExpansion: Math.max(rightX - baseRightX, 0),
  };
}

function svgTextBlock(x, y, lines, options = {}) {
  const {
    fill = "#111827",
    fontSize = 16,
    weight = 700,
    anchor = "start",
    lineHeight = fontSize + 4,
    opacity = 1,
    haloColor = null,
    haloWidth = 0,
  } = options;
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" opacity="${opacity}" ${
          haloColor ? `paint-order="stroke fill" stroke="${haloColor}" stroke-width="${haloWidth || 6}" stroke-linejoin="round"` : ""
        }>${escapeHtml(line)}</text>`
    )
    .join("");
}

function smoothBoundaryCurve(x0, x1, y0, y1, geometry = {}) {
  const direction = x1 >= x0 ? 1 : -1;
  const dx = Math.max(Math.abs(x1 - x0), 1);
  const startCurve = clamp(safeNumber(geometry.startCurve, 0.3), 0.08, 0.42);
  const endCurve = clamp(safeNumber(geometry.endCurve, 0.3), 0.08, 0.42);
  const cp1x = x0 + direction * dx * startCurve;
  const cp2x = x1 - direction * dx * endCurve;
  return `C ${cp1x} ${y0}, ${cp2x} ${y1}, ${x1} ${y1}`;
}

function cubicBezierValue(p0, p1, p2, p3, t) {
  const oneMinusT = 1 - t;
  return (
    oneMinusT * oneMinusT * oneMinusT * p0 +
    3 * oneMinusT * oneMinusT * t * p1 +
    3 * oneMinusT * t * t * p2 +
    t * t * t * p3
  );
}

function cubicBezierYForX(targetX, p0x, p1x, p2x, p3x, p0y, p1y, p2y, p3y) {
  const increasing = p3x >= p0x;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const x = cubicBezierValue(p0x, p1x, p2x, p3x, mid);
    if ((increasing && x < targetX) || (!increasing && x > targetX)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const t = (low + high) / 2;
  return cubicBezierValue(p0y, p1y, p2y, p3y, t);
}

function resolveFlowCurveGeometry(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options = {}, config = {}) {
  const directionAware = config.directionAware !== false;
  const direction = directionAware ? (x1 >= x0 ? 1 : -1) : 1;
  const dx = Math.max(directionAware ? Math.abs(x1 - x0) : x1 - x0, 1);
  const startBase = safeNumber(options.startCurveFactor, safeNumber(options.curveFactor, 0.5) * 0.76);
  const endBase = safeNumber(options.endCurveFactor, safeNumber(options.curveFactor, 0.5) * 0.74);
  const minStart = safeNumber(options.minStartCurveFactor, 0.17);
  const maxStart = safeNumber(options.maxStartCurveFactor, 0.4);
  const minEnd = safeNumber(options.minEndCurveFactor, 0.16);
  const maxEnd = safeNumber(options.maxEndCurveFactor, 0.38);
  const deltaScale = Math.max(safeNumber(options.deltaScale, 0.98), 0.12);
  const deltaInfluence = safeNumber(options.deltaInfluence, 0.048);
  const deltaCurveBoost = safeNumber(options.deltaCurveBoost, 0.02);
  const thicknessInfluence = safeNumber(options.thicknessInfluence, 0.07);
  const averageThickness = Math.max(((y0Bottom - y0Top) + (y1Bottom - y1Top)) / 2, 1);
  const topDelta = Math.abs(y1Top - y0Top);
  const bottomDelta = Math.abs(y1Bottom - y0Bottom);
  const adaptCurve = (delta, base, minFactor, maxFactor) => {
    const normalizedDelta = clamp(delta / (dx * deltaScale), 0, 1);
    const thicknessBoost = clamp(averageThickness / (dx * 0.96), 0, 1) * thicknessInfluence;
    return clamp(base - normalizedDelta * deltaInfluence * 0.42 + normalizedDelta * deltaCurveBoost + thicknessBoost, minFactor, maxFactor);
  };
  const topStartCurve = adaptCurve(topDelta, startBase, minStart, maxStart);
  const topEndCurve = adaptCurve(topDelta, endBase, minEnd, maxEnd);
  const bottomStartCurve = adaptCurve(bottomDelta, startBase, minStart, maxStart);
  const bottomEndCurve = adaptCurve(bottomDelta, endBase, minEnd, maxEnd);
  let sourceHoldLength = clamp(
    safeNumber(options.sourceHoldLength, dx * safeNumber(options.sourceHoldFactor, 0.095)),
    safeNumber(options.minSourceHoldLength, 10),
    safeNumber(options.maxSourceHoldLength, 34)
  );
  let targetHoldLength = clamp(
    safeNumber(options.targetHoldLength, dx * safeNumber(options.targetHoldFactor, 0.075)),
    safeNumber(options.minTargetHoldLength, 8),
    safeNumber(options.maxTargetHoldLength, 28)
  );
  if (options.adaptiveHold !== false) {
    const centerDelta = Math.abs((y1Top + y1Bottom) / 2 - (y0Top + y0Bottom) / 2);
    const edgeDelta = Math.max(topDelta, bottomDelta, centerDelta);
    const holdDeltaNorm = clamp(edgeDelta / Math.max(dx * safeNumber(options.holdDeltaScale, 0.56), 1), 0, 1);
    const sourceHoldReduction = clamp(safeNumber(options.sourceHoldDeltaReduction, 0.5), 0, 0.88);
    const targetHoldReduction = clamp(safeNumber(options.targetHoldDeltaReduction, 0.58), 0, 0.9);
    sourceHoldLength = Math.max(
      sourceHoldLength * (1 - holdDeltaNorm * sourceHoldReduction),
      safeNumber(options.minAdaptiveSourceHoldLength, 4)
    );
    targetHoldLength = Math.max(
      targetHoldLength * (1 - holdDeltaNorm * targetHoldReduction),
      safeNumber(options.minAdaptiveTargetHoldLength, 4)
    );
  }
  const availableCurveDx = Math.max(dx - 1, 1);
  if (sourceHoldLength + targetHoldLength > availableCurveDx) {
    const scale = availableCurveDx / Math.max(sourceHoldLength + targetHoldLength, 1);
    sourceHoldLength *= scale;
    targetHoldLength *= scale;
  }
  const sourceJoinX = x0 + direction * sourceHoldLength;
  const targetJoinX = x1 - direction * targetHoldLength;
  return {
    direction,
    sourceJoinX,
    targetJoinX,
    topStartCurve,
    topEndCurve,
    bottomStartCurve,
    bottomEndCurve,
  };
}

function flowEnvelopeAtX(targetX, x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options = {}) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  if (targetX < minX || targetX > maxX) return null;
  const {
    direction,
    sourceJoinX,
    targetJoinX,
    topStartCurve,
    topEndCurve,
    bottomStartCurve,
    bottomEndCurve,
  } = resolveFlowCurveGeometry(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options);
  const resolveBoundaryY = (startY, endY, startCurve, endCurve) => {
    if ((direction > 0 && targetX <= sourceJoinX) || (direction < 0 && targetX >= sourceJoinX)) return startY;
    if ((direction > 0 && targetX >= targetJoinX) || (direction < 0 && targetX <= targetJoinX)) return endY;
    const cp1x = sourceJoinX + direction * Math.abs(targetJoinX - sourceJoinX) * startCurve;
    const cp2x = targetJoinX - direction * Math.abs(targetJoinX - sourceJoinX) * endCurve;
    return cubicBezierYForX(targetX, sourceJoinX, cp1x, cp2x, targetJoinX, startY, startY, endY, endY);
  };
  return {
    top: resolveBoundaryY(y0Top, y1Top, topStartCurve, topEndCurve),
    bottom: resolveBoundaryY(y0Bottom, y1Bottom, bottomStartCurve, bottomEndCurve),
  };
}

function flowPath(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options = {}) {
  const {
    sourceJoinX,
    targetJoinX,
    topStartCurve,
    topEndCurve,
    bottomStartCurve,
    bottomEndCurve,
  } = resolveFlowCurveGeometry(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options, {
    directionAware: false,
  });
  return [
    `M ${x0} ${y0Top}`,
    `L ${sourceJoinX} ${y0Top}`,
    smoothBoundaryCurve(sourceJoinX, targetJoinX, y0Top, y1Top, {
      startCurve: topStartCurve,
      endCurve: topEndCurve,
    }),
    `L ${x1} ${y1Top}`,
    `L ${x1} ${y1Bottom}`,
    `L ${targetJoinX} ${y1Bottom}`,
    smoothBoundaryCurve(targetJoinX, sourceJoinX, y1Bottom, y0Bottom, {
      startCurve: bottomEndCurve,
      endCurve: bottomStartCurve,
    }),
    `L ${x0} ${y0Bottom}`,
    "Z",
  ].join(" ");
}

function outboundFlowPath(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options = {}) {
  const targetCoverInsetX = Math.max(safeNumber(options.targetCoverInsetX, 0), 0);
  return flowPath(x0, y0Top, y0Bottom, x1 + targetCoverInsetX, y1Top, y1Bottom, options);
}

function resolveReplicaMetricClusterLayout(nodeTop, hasDeltaLine, options = {}) {
  const compactThreshold = safeNumber(options.compactThreshold, 352);
  const noteLineHeight = safeNumber(options.noteLineHeight, 22);
  const compact = nodeTop <= compactThreshold;
  const placement = compact
    ? {
        blockHeight: hasDeltaLine ? 66 + noteLineHeight : 66,
        preferredClearance: hasDeltaLine ? 102 : 88,
        minTop: 170,
        bottomClearance: hasDeltaLine ? 90 : 76,
      }
    : {
        blockHeight: hasDeltaLine ? 76 + noteLineHeight : 76,
        preferredClearance: hasDeltaLine ? 114 : 96,
        minTop: 152,
        bottomClearance: hasDeltaLine ? 98 : 84,
      };
  if (options.includeTypography === false) {
    return placement;
  }
  const noteSize = safeNumber(options.noteSize, 18);
  return compact
    ? {
        titleSize: 36,
        valueSize: 29,
        subSize: noteSize,
        titleStroke: 9,
        valueStroke: 8,
        subStroke: 6,
        valueOffset: 40,
        subOffset: 66,
        deltaOffset: hasDeltaLine ? 66 + noteLineHeight : 66,
        ...placement,
      }
    : {
        titleSize: 41,
        valueSize: 33,
        subSize: noteSize,
        titleStroke: 10,
        valueStroke: 9,
        subStroke: 6,
        valueOffset: 46,
        subOffset: 76,
        deltaOffset: hasDeltaLine ? 76 + noteLineHeight : 76,
        ...placement,
      };
}

function resolveAdaptiveSourceFan(sourceSlices, options = {}) {
  if (!sourceSlices.length) {
    return {
      spread: Math.max(safeNumber(options.spread, 1.12), 1),
      exponent: Math.max(safeNumber(options.exponent, 1.2), 0.6),
      edgeBoost: safeNumber(options.edgeBoost, 24),
      edgeExponent: Math.max(safeNumber(options.edgeExponent, 1.15), 0.6),
      bandBias: safeNumber(options.bandBias, 0.08),
      sideBoost: safeNumber(options.sideBoost, 18),
      sideExponent: Math.max(safeNumber(options.sideExponent, 1.08), 0.6),
      rangeBoost: safeNumber(options.rangeBoost, 0),
      anchorOffset: safeNumber(options.anchorOffset, 0),
    };
  }
  const count = sourceSlices.length;
  const totalHeight = Math.max(sourceSlices.reduce((sum, slice) => sum + Math.max(slice.height, 0), 0), 1);
  const dominantShare = sourceSlices.reduce((largest, slice) => Math.max(largest, slice.height / totalHeight), 0);
  const medianIndex = Math.floor(count / 2);
  const medianCenter = sourceSlices[medianIndex]?.center || sourceSlices[0].center;
  const stackCenter = (sourceSlices[0].top + sourceSlices[sourceSlices.length - 1].bottom) / 2;
  const countBoost = clamp((count - 3) * 0.042, 0, 0.24);
  const dominanceBoost = dominantShare >= 0.44 ? (dominantShare - 0.44) * 0.46 : 0;
  const denseDamping = count >= 8 ? 0.04 : 0;
  return {
    spread: clamp(Math.max(safeNumber(options.spread, 1.12), 1) + countBoost + dominanceBoost - denseDamping, 1.1, 1.38),
    exponent: clamp(safeNumber(options.exponent, 1.2) - Math.min(count, 8) * 0.01, 0.96, 1.28),
    edgeBoost: safeNumber(options.edgeBoost, 24) + Math.max(count - 4, 0) * 5 + dominanceBoost * 104,
    edgeExponent: clamp(safeNumber(options.edgeExponent, 1.15) - Math.min(count, 7) * 0.012, 0.92, 1.18),
    bandBias: clamp(safeNumber(options.bandBias, 0.08) + dominanceBoost * 0.08 - (count >= 7 ? 0.012 : 0), 0.04, 0.14),
    sideBoost: safeNumber(options.sideBoost, 18) + Math.max(count - 4, 0) * 4 + dominanceBoost * 84,
    sideExponent: clamp(safeNumber(options.sideExponent, 1.08) - Math.min(count, 7) * 0.012, 0.88, 1.08),
    rangeBoost: safeNumber(options.rangeBoost, 12) + Math.max(count - 4, 0) * 5 + dominanceBoost * 64,
    anchorOffset: safeNumber(options.anchorOffset, 0) + (medianCenter - stackCenter) * 0.08,
  };
}

function spreadSourceCenters(entries, anchor, options = {}) {
  if (!entries.length) return [];
  const spread = Math.max(safeNumber(options.spread, 1.12), 1);
  const exponent = Math.max(safeNumber(options.exponent, 1.2), 0.6);
  const edgeBoost = safeNumber(options.edgeBoost, 24);
  const edgeExponent = Math.max(safeNumber(options.edgeExponent, 1.15), 0.6);
  const bandBias = safeNumber(options.bandBias, 0.08);
  const sideBoost = safeNumber(options.sideBoost, 18);
  const sideExponent = Math.max(safeNumber(options.sideExponent, 1.08), 0.6);
  const maxDelta = entries.reduce((largest, entry) => Math.max(largest, Math.abs(safeNumber(entry.center, anchor) - anchor)), 0);
  if (maxDelta <= 0) {
    return entries.map((entry) => safeNumber(entry.center, anchor));
  }
  const sideRanks = new Map();
  const topSide = [];
  const bottomSide = [];
  entries.forEach((entry, index) => {
    const center = safeNumber(entry.center, anchor);
    if (center < anchor) topSide.push(index);
    if (center > anchor) bottomSide.push(index);
  });
  topSide.forEach((index, position) => {
    const norm = topSide.length <= 1 ? 1 : position / (topSide.length - 1);
    sideRanks.set(index, { direction: -1, norm });
  });
  bottomSide.forEach((index, position) => {
    const norm = bottomSide.length <= 1 ? 1 : position / (bottomSide.length - 1);
    sideRanks.set(index, { direction: 1, norm });
  });
  return entries.map((entry, index) => {
    const center = safeNumber(entry.center, anchor);
    const delta = center - anchor;
    const direction = delta === 0 ? 0 : Math.sign(delta);
    const norm = clamp(Math.abs(delta) / maxDelta, 0, 1);
    const spreadFactor = 1 + (spread - 1) * Math.pow(norm, exponent);
    const edgeOffset = direction * edgeBoost * Math.pow(norm, edgeExponent);
    const bandOffset = direction * safeNumber(entry.height, 0) * bandBias * norm;
    const sideRank = sideRanks.get(index);
    const sideOffset = sideRank ? sideRank.direction * sideBoost * Math.pow(sideRank.norm, sideExponent) : 0;
    return anchor + delta * spreadFactor + edgeOffset + bandOffset + sideOffset;
  });
}

function hornFlowPath(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, options = {}) {
  const dx = Math.max(x1 - x0, 1);
  const startBase = safeNumber(options.startCurveFactor, safeNumber(options.curveFactor, 0.36));
  const endBase = safeNumber(options.endCurveFactor, safeNumber(options.curveFactor, 0.38));
  const minStart = safeNumber(options.minStartCurveFactor, 0.14);
  const maxStart = safeNumber(options.maxStartCurveFactor, 0.36);
  const minEnd = safeNumber(options.minEndCurveFactor, 0.16);
  const maxEnd = safeNumber(options.maxEndCurveFactor, 0.38);
  const deltaScale = Math.max(safeNumber(options.deltaScale, 0.92), 0.1);
  const deltaInfluence = safeNumber(options.deltaInfluence, 0.065);
  const thicknessInfluence = safeNumber(options.thicknessInfluence, 0.055);
  const averageThickness = Math.max(((y0Bottom - y0Top) + (y1Bottom - y1Top)) / 2, 1);
  const adaptCurve = (delta, base, minFactor, maxFactor) => {
    const norm = clamp(Math.abs(delta) / (dx * deltaScale), 0, 1);
    const thicknessBoost = clamp(averageThickness / (dx * 0.92), 0, 1) * thicknessInfluence;
    return clamp(base - norm * deltaInfluence + thicknessBoost, minFactor, maxFactor);
  };
  const topStartCurve = adaptCurve(y1Top - y0Top, startBase, minStart, maxStart);
  const topEndCurve = adaptCurve(y1Top - y0Top, endBase, minEnd, maxEnd);
  const bottomStartCurve = adaptCurve(y1Bottom - y0Bottom, startBase, minStart, maxStart);
  const bottomEndCurve = adaptCurve(y1Bottom - y0Bottom, endBase, minEnd, maxEnd);
  let sourceHoldLength = clamp(
    safeNumber(options.sourceHoldLength, dx * safeNumber(options.sourceHoldFactor, 0.05)),
    safeNumber(options.minSourceHoldLength, 4),
    safeNumber(options.maxSourceHoldLength, 18)
  );
  let targetHoldLength = clamp(
    safeNumber(options.targetHoldLength, dx * safeNumber(options.targetHoldFactor, 0.04)),
    safeNumber(options.minTargetHoldLength, 3),
    safeNumber(options.maxTargetHoldLength, 14)
  );
  const adaptiveHoldEnabled = options.adaptiveHold !== false;
  if (adaptiveHoldEnabled) {
    const centerDelta = Math.abs((y1Top + y1Bottom) / 2 - (y0Top + y0Bottom) / 2);
    const edgeDelta = Math.max(Math.abs(y1Top - y0Top), Math.abs(y1Bottom - y0Bottom), centerDelta);
    const holdDeltaNorm = clamp(edgeDelta / Math.max(dx * safeNumber(options.holdDeltaScale, 0.52), 1), 0, 1);
    const sourceHoldReduction = clamp(safeNumber(options.sourceHoldDeltaReduction, 0.3), 0, 0.8);
    const targetHoldReduction = clamp(safeNumber(options.targetHoldDeltaReduction, 0.34), 0, 0.82);
    sourceHoldLength = Math.max(
      sourceHoldLength * (1 - holdDeltaNorm * sourceHoldReduction),
      safeNumber(options.minAdaptiveSourceHoldLength, 2)
    );
    targetHoldLength = Math.max(
      targetHoldLength * (1 - holdDeltaNorm * targetHoldReduction),
      safeNumber(options.minAdaptiveTargetHoldLength, 2)
    );
  }
  const availableCurveDx = Math.max(dx - 1, 1);
  if (sourceHoldLength + targetHoldLength > availableCurveDx) {
    const scale = availableCurveDx / Math.max(sourceHoldLength + targetHoldLength, 1);
    sourceHoldLength *= scale;
    targetHoldLength *= scale;
  }
  const sourceJoinX = x0 + sourceHoldLength;
  const targetJoinX = x1 - targetHoldLength;
  return [
    `M ${x0} ${y0Top}`,
    `L ${sourceJoinX} ${y0Top}`,
    smoothBoundaryCurve(sourceJoinX, targetJoinX, y0Top, y1Top, {
      startCurve: topStartCurve,
      endCurve: topEndCurve,
    }),
    `L ${x1} ${y1Top}`,
    `L ${x1} ${y1Bottom}`,
    `L ${targetJoinX} ${y1Bottom}`,
    smoothBoundaryCurve(targetJoinX, sourceJoinX, y1Bottom, y0Bottom, {
      startCurve: bottomEndCurve,
      endCurve: bottomStartCurve,
    }),
    `L ${x0} ${y0Bottom}`,
    "Z",
  ].join(" ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rectsOverlap(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    safeNumber(a.right) + padding <= safeNumber(b.left) ||
    safeNumber(b.right) + padding <= safeNumber(a.left) ||
    safeNumber(a.bottom) + padding <= safeNumber(b.top) ||
    safeNumber(b.bottom) + padding <= safeNumber(a.top)
  );
}

function compactFiscalLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const match = /^FY(\d{4})\s+Q([1-4])$/i.exec(raw);
  if (!match) return raw;
  return `Q${match[2]} FY${match[1].slice(-2)}`;
}

function formatPeriodEndLabel(periodEnd) {
  const raw = String(periodEnd || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
  const month = months[Math.max(Number(match[2]) - 1, 0)] || raw;
  return `Ending ${month} ${Number(match[3])}, ${match[1]}`;
}

function stackValueSlices(items, startY, scale, options = {}) {
  const {
    minHeight = 0,
    targetBottom = null,
    valueKey = "valueBn",
    targetSnapTolerance = 4,
  } = options;
  let cursor = startY;
  const slices = items.map((item, index) => {
    const rawHeight = safeNumber(item?.[valueKey]) * scale;
    const height = Math.max(rawHeight, minHeight);
    const top = cursor;
    const bottom = top + height;
    cursor = bottom;
    return {
      item,
      index,
      rawHeight,
      height,
      top,
      bottom,
      center: top + height / 2,
    };
  });
  if (targetBottom !== null && slices.length) {
    const last = slices[slices.length - 1];
    if (Math.abs(targetBottom - last.bottom) <= Math.max(safeNumber(targetSnapTolerance, 4), 1)) {
      last.bottom = targetBottom;
      last.height = Math.max(targetBottom - last.top, 1);
      last.center = last.top + last.height / 2;
    }
  }
  return slices;
}

function fitSlicesToBand(slices, bandTop, bandBottom, options = {}) {
  if (!Array.isArray(slices) || !slices.length) return [];
  const totalBandHeight = Math.max(safeNumber(bandBottom) - safeNumber(bandTop), 1);
  const desiredGap = Math.max(safeNumber(options.gap, 0), 0);
  const maxGap = slices.length > 1 ? Math.max((totalBandHeight - 1) / Math.max(slices.length - 1, 1), 0) : 0;
  const gap = Math.min(desiredGap, maxGap);
  const availableHeight = Math.max(totalBandHeight - gap * Math.max(slices.length - 1, 0), 1);
  const preferredMinHeight = Math.max(safeNumber(options.minHeight, 0), 0);
  const minHeight = Math.min(preferredMinHeight, availableHeight / Math.max(slices.length, 1));
  const rawHeights = slices.map((slice) => Math.max(safeNumber(slice?.rawHeight, safeNumber(slice?.height, 0)), 0));
  const totalRawHeight = rawHeights.reduce((sum, height) => sum + height, 0);
  if (totalRawHeight <= 0) {
    const fallbackHeight = availableHeight / Math.max(slices.length, 1);
    let cursor = bandTop;
    return slices.map((slice, index) => {
      const top = cursor;
      const bottom = index === slices.length - 1 ? bandBottom : top + fallbackHeight;
      cursor = bottom + gap;
      return {
        ...slice,
        top,
        bottom,
        height: Math.max(bottom - top, 1),
        center: top + Math.max(bottom - top, 1) / 2,
      };
    });
  }
  const scaledHeights = rawHeights.map((height) => (height / totalRawHeight) * availableHeight);
  const locked = new Array(slices.length).fill(false);
  const resolvedHeights = new Array(slices.length).fill(0);
  let remainingHeight = availableHeight;
  let remainingRawHeight = totalRawHeight;
  let progress = true;
  while (progress) {
    progress = false;
    scaledHeights.forEach((height, index) => {
      if (locked[index]) return;
      const proportionalHeight = remainingRawHeight > 0 ? (rawHeights[index] / remainingRawHeight) * remainingHeight : 0;
      if (minHeight > 0 && proportionalHeight < minHeight) {
        locked[index] = true;
        resolvedHeights[index] = minHeight;
        remainingHeight -= minHeight;
        remainingRawHeight -= rawHeights[index];
        progress = true;
      }
    });
    if (remainingHeight <= 0 || remainingRawHeight <= 0) break;
  }
  slices.forEach((slice, index) => {
    if (!locked[index]) {
      resolvedHeights[index] = remainingRawHeight > 0 ? (rawHeights[index] / remainingRawHeight) * Math.max(remainingHeight, 0) : 0;
    }
  });
  const totalResolvedHeight = resolvedHeights.reduce((sum, height) => sum + height, 0);
  const heightAdjust = availableHeight - totalResolvedHeight;
  if (Math.abs(heightAdjust) > 0.01) {
    const lastIndex = resolvedHeights.length - 1;
    resolvedHeights[lastIndex] = Math.max(resolvedHeights[lastIndex] + heightAdjust, 1);
  }
  let cursor = bandTop;
  return slices.map((slice, index) => {
    const height = Math.max(resolvedHeights[index], 1);
    const top = cursor;
    const bottom = index === slices.length - 1 ? bandBottom : top + height;
    cursor = bottom + gap;
    return {
      ...slice,
      top,
      bottom,
      height: Math.max(bottom - top, 1),
      center: top + Math.max(bottom - top, 1) / 2,
    };
  });
}

function separateStackSlices(slices, gap = 0, minThickness = 2) {
  if (!Array.isArray(slices) || !slices.length || !(gap > 0)) {
    return (slices || []).map((slice) => ({
      ...slice,
      height: Math.max(safeNumber(slice.bottom) - safeNumber(slice.top), 1),
      center: (safeNumber(slice.top) + safeNumber(slice.bottom)) / 2,
    }));
  }
  const halfGap = gap / 2;
  return slices.map((slice, index) => {
    const top = safeNumber(slice.top);
    const bottom = safeNumber(slice.bottom);
    const insetTop = index === 0 ? 0 : halfGap;
    const insetBottom = index === slices.length - 1 ? 0 : halfGap;
    const requestedInset = insetTop + insetBottom;
    const availableInset = Math.max(bottom - top - minThickness, 0);
    const ratio = requestedInset > 0 ? Math.min(1, availableInset / requestedInset) : 1;
    const nextTop = top + insetTop * ratio;
    const nextBottom = bottom - insetBottom * ratio;
    return {
      ...slice,
      top: nextTop,
      bottom: Math.max(nextBottom, nextTop + minThickness),
      height: Math.max(nextBottom - nextTop, minThickness),
      center: nextTop + Math.max(nextBottom - nextTop, minThickness) / 2,
    };
  });
}

function resolveVerticalBoxes(entries, minY, maxY, gap = 24) {
  if (!entries.length) return [];
  const boxes = entries
    .map((entry, originalIndex) => {
      const height = Math.max(safeNumber(entry.height, 0), 1);
      const preferredTop =
        entry.top !== null && entry.top !== undefined ? safeNumber(entry.top, minY) : safeNumber(entry.center, minY + height / 2) - height / 2;
      return {
        ...entry,
        originalIndex,
        height,
        top: clamp(preferredTop, minY, maxY - height),
      };
    })
    .sort((left, right) => left.top - right.top);

  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const minimumTop = previous.top + previous.height + gap;
    if (boxes[index].top < minimumTop) {
      boxes[index].top = minimumTop;
    }
  }

  const overflow = boxes[boxes.length - 1].top + boxes[boxes.length - 1].height - maxY;
  if (overflow > 0) {
    boxes[boxes.length - 1].top -= overflow;
    for (let index = boxes.length - 2; index >= 0; index -= 1) {
      const next = boxes[index + 1];
      const maximumTop = next.top - gap - boxes[index].height;
      if (boxes[index].top > maximumTop) {
        boxes[index].top = maximumTop;
      }
    }
  }

  if (boxes[0].top < minY) {
    const shift = minY - boxes[0].top;
    boxes.forEach((box) => {
      box.top += shift;
    });
  }

  return boxes
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map((box) => ({
      ...box,
      bottom: box.top + box.height,
      center: box.top + box.height / 2,
    }));
}

function resolveVerticalBoxesVariableGap(entries, minY, maxY, gap = 24) {
  if (!entries.length) return [];
  const boxes = entries
    .map((entry, originalIndex) => {
      const height = Math.max(safeNumber(entry.height, 0), 1);
      const gapAbove = Math.max(safeNumber(entry.gapAbove, gap), gap);
      const preferredTop =
        entry.top !== null && entry.top !== undefined
          ? safeNumber(entry.top, minY + gapAbove)
          : safeNumber(entry.center, minY + gapAbove + height / 2) - height / 2;
      return {
        ...entry,
        originalIndex,
        height,
        gapAbove,
        top: clamp(preferredTop, minY + gapAbove, maxY - height),
      };
    })
    .sort((left, right) => left.top - right.top);

  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    const minimumTop = previous.top + previous.height + Math.max(gap, current.gapAbove);
    if (current.top < minimumTop) {
      current.top = minimumTop;
    }
  }

  const overflow = boxes[boxes.length - 1].top + boxes[boxes.length - 1].height - maxY;
  if (overflow > 0) {
    boxes[boxes.length - 1].top -= overflow;
    for (let index = boxes.length - 2; index >= 0; index -= 1) {
      const next = boxes[index + 1];
      const current = boxes[index];
      const maximumTop = next.top - Math.max(gap, next.gapAbove) - current.height;
      if (current.top > maximumTop) {
        current.top = maximumTop;
      }
    }
  }

  if (boxes[0].top < minY + boxes[0].gapAbove) {
    const shift = minY + boxes[0].gapAbove - boxes[0].top;
    boxes.forEach((box) => {
      box.top += shift;
    });
  }

  return boxes
    .sort((left, right) => left.originalIndex - right.originalIndex)
    .map((box) => ({
      ...box,
      bottom: box.top + box.height,
      center: box.top + box.height / 2,
    }));
}

const LOCKUP_LAYOUT_PROFILES = {
  "microsoft-productivity": {
    minHeight: 154,
    previewOffset: 42,
    labelCenterX: 204,
    lockupScale: 0.72,
    lockupX: 52,
    titleStartOffset: 96,
  },
  "microsoft-cloud": {
    minHeight: 150,
    previewOffset: 54,
    labelCenterX: 216,
    lockupScale: 0.64,
    lockupX: 110,
    titleStartOffset: 108,
  },
  "microsoft-personal": {
    minHeight: 162,
    previewOffset: 36,
    labelCenterX: 204,
    lockupScale: 0.72,
    lockupX: 96,
    titleStartOffset: 100,
  },
  "google-search-business": {
    detailLockupScale: 1.52,
    detailLockupX: 0,
    detailLockupYOffset: 26,
    detailHideTitle: true,
    detailHideSupport: true,
    detailValueX: 416,
    detailValueYOffset: 8,
    detailYoyYOffset: 36,
    detailMinHeight: 196,
  },
  "youtube-business": {
    detailLockupScale: 1.14,
    detailLockupX: 8,
    detailLockupYOffset: 22,
    detailHideTitle: true,
    detailHideSupport: true,
    detailValueX: 384,
    detailValueYOffset: 10,
    detailYoyYOffset: 36,
    detailMinHeight: 132,
  },
  "admob-business": {
    detailLockupScale: 1.1,
    detailLockupX: 8,
    detailLockupYOffset: 22,
    detailHideTitle: true,
    detailHideSupport: true,
    detailValueX: 384,
    detailValueYOffset: 10,
    detailYoyYOffset: 36,
    detailMinHeight: 138,
  },
  "google-play-business": {
    minHeight: 152,
    lockupScale: 1.22,
    lockupX: 52,
    lockupYOffset: 24,
    titleStartOffset: 94,
    hideTitle: true,
    noteX: 420,
    noteYOffset: 12,
    yoyYOffset: 44,
    supportX: 176,
    supportStartOffset: 96,
    supportAnchor: "start",
  },
  "google-cloud-business": {
    minHeight: 156,
    lockupScale: 1.2,
    lockupX: 44,
    lockupYOffset: 24,
    titleStartOffset: 98,
    hideTitle: true,
    noteX: 420,
    noteYOffset: 12,
    yoyYOffset: 44,
    supportX: 182,
    supportStartOffset: 94,
    supportAnchor: "start",
  },
  "amazon-online-business": {
    compactMinHeight: 168,
    compactClampMax: 182,
    compactLockupScale: 1.46,
    compactLockupX: 44,
    compactLockupYOffset: 18,
    compactLabelX: 26,
    compactLabelYOffset: 22,
    compactTitleFontSize: 24,
    compactTitleLineHeight: 27,
    compactSupportOffset: 10,
    compactSupportFontSize: 13,
    compactSupportLineHeight: 17,
    compactNoteX: 364,
    compactValueYOffset: 16,
    compactYoyYOffset: 34,
  },
  "wholefoods-business": {
    compactMinHeight: 128,
    compactClampMax: 138,
    compactLockupScale: 1.16,
    compactLockupX: 38,
    compactLockupYOffset: 16,
    compactLabelX: 24,
    compactLabelYOffset: 20,
    compactTitleFontSize: 20,
    compactTitleLineHeight: 24,
    compactSupportOffset: 10,
    compactSupportFontSize: 12,
    compactSupportLineHeight: 15,
    compactNoteX: 344,
    compactValueYOffset: 14,
    compactYoyYOffset: 32,
  },
  "amazon-ads-business": {
    compactMinHeight: 122,
    compactClampMax: 132,
    compactLockupScale: 1.06,
    compactLockupX: 18,
    compactLockupYOffset: 16,
    compactLabelX: 24,
    compactLabelYOffset: 20,
    compactTitleFontSize: 20,
    compactTitleLineHeight: 24,
    compactSupportOffset: 8,
    compactSupportFontSize: 12,
    compactSupportLineHeight: 15,
    compactNoteX: 344,
    compactValueYOffset: 14,
    compactYoyYOffset: 32,
  },
  "prime-audible-business": {
    compactMinHeight: 122,
    compactClampMax: 132,
    compactLockupScale: 1.06,
    compactLockupX: 18,
    compactLockupYOffset: 14,
    compactLabelX: 24,
    compactLabelYOffset: 18,
    compactTitleFontSize: 20,
    compactTitleLineHeight: 24,
    compactSupportOffset: 8,
    compactSupportFontSize: 12,
    compactSupportLineHeight: 15,
    compactNoteX: 344,
    compactValueYOffset: 14,
    compactYoyYOffset: 32,
  },
  "aws-business": {
    compactMinHeight: 144,
    compactClampMax: 156,
    compactLockupScale: 1.46,
    compactLockupX: 26,
    compactLockupYOffset: 14,
    compactLabelX: 24,
    compactLabelYOffset: 20,
    compactTitleFontSize: 21,
    compactTitleLineHeight: 24,
    compactSupportOffset: 8,
    compactSupportFontSize: 12,
    compactSupportLineHeight: 15,
    compactNoteX: 352,
    compactValueYOffset: 14,
    compactYoyYOffset: 32,
  },
};

function lockupLayoutProfile(lockupKey) {
  return LOCKUP_LAYOUT_PROFILES[lockupKey] || null;
}

function lockupHasWordmark(lockupKey) {
  if (!lockupKey) return false;
  return new Set([
    "amazon-online-business",
    "wholefoods-business",
    "amazon-ads-business",
    "prime-audible-business",
    "aws-business",
    "google-search-business",
    "youtube-business",
    "admob-business",
    "google-play-business",
    "google-cloud-business",
  ]).has(lockupKey);
}

function constantThicknessBridge(slice, targetCenter, minHeight, clampTop = -Infinity, clampBottom = Infinity) {
  const thickness = Math.max(safeNumber(slice?.height, 0), safeNumber(minHeight, 0));
  const sourceCenter = clamp(safeNumber(slice?.center, 0), clampTop + thickness / 2, clampBottom - thickness / 2);
  return {
    sourceTop: sourceCenter - thickness / 2,
    sourceBottom: sourceCenter + thickness / 2,
    targetTop: targetCenter - thickness / 2,
    targetHeight: thickness,
  };
}

function resolveConservedTargetBand(sourceBand, targetTop, targetBottom, options = {}) {
  const sourceHeight = Math.max(safeNumber(sourceBand?.bottom, 0) - safeNumber(sourceBand?.top, 0), 0);
  const resolvedTargetTop = safeNumber(targetTop, 0);
  const resolvedTargetBottom = Math.max(safeNumber(targetBottom, resolvedTargetTop), resolvedTargetTop);
  const targetHeight = Math.max(resolvedTargetBottom - resolvedTargetTop, 0);
  const bandHeight = sourceHeight > 0 ? Math.min(sourceHeight, targetHeight) : targetHeight;
  const align = options.align || "top";
  let bandTop = resolvedTargetTop;
  if (align === "bottom") {
    bandTop = resolvedTargetBottom - bandHeight;
  } else if (align === "center") {
    bandTop = resolvedTargetTop + (targetHeight - bandHeight) / 2;
  }
  return {
    top: bandTop,
    bottom: bandTop + bandHeight,
    height: bandHeight,
    center: bandTop + bandHeight / 2,
  };
}

function bridgeObstacleRect(sourceX, sourceTop, sourceBottom, targetX, targetTop, targetHeight, options = {}) {
  const padX = safeNumber(options.padX, 0);
  const padY = safeNumber(options.padY, 0);
  const targetWidth = safeNumber(options.targetWidth, 0);
  return {
    left: Math.min(sourceX, targetX) - padX,
    right: Math.max(sourceX, targetX + targetWidth) + padX,
    top: Math.min(sourceTop, targetTop) - padY,
    bottom: Math.max(sourceBottom, targetTop + targetHeight) + padY,
  };
}

function terminalNodeExtraX(sourceTop, sourceBottom, targetTop, targetHeight, options = {}) {
  const sourceCenter = (safeNumber(sourceTop, 0) + safeNumber(sourceBottom, 0)) / 2;
  const targetCenter = safeNumber(targetTop, 0) + safeNumber(targetHeight, 0) / 2;
  const factor = safeNumber(options.factor, 0.26);
  const sourceThickness = Math.max(safeNumber(sourceBottom, 0) - safeNumber(sourceTop, 0), 0);
  const branchThickness = Math.max(sourceThickness, safeNumber(targetHeight, 0));
  const baseRunway = safeNumber(options.base, Math.max(14, branchThickness * 0.2));
  const thicknessFactor = safeNumber(options.thicknessFactor, 0.14);
  const minValue = safeNumber(options.min, baseRunway);
  const maxValue = safeNumber(options.max, 64);
  return clamp(baseRunway + Math.abs(targetCenter - sourceCenter) * factor + branchThickness * thicknessFactor, minValue, maxValue);
}

function terminalCapPath(x, y, width, height, radius = 0, options = {}) {
  const rightOnly = options.rightOnly !== false;
  const maxRadius = Math.min(width / 2, height / 2);
  const rightRadius = clamp(safeNumber(options.rightRadius, radius), 0, maxRadius);
  const leftRadius = clamp(safeNumber(options.leftRadius, rightOnly ? 0 : rightRadius), 0, maxRadius);
  if (rightRadius <= 0 && leftRadius <= 0) {
    return [`M ${x} ${y}`, `H ${x + width}`, `V ${y + height}`, `H ${x}`, "Z"].join(" ");
  }
  if (!rightOnly) {
    return [
      `M ${x + leftRadius} ${y}`,
      `H ${x + width - rightRadius}`,
      `Q ${x + width} ${y} ${x + width} ${y + rightRadius}`,
      `V ${y + height - rightRadius}`,
      `Q ${x + width} ${y + height} ${x + width - rightRadius} ${y + height}`,
      `H ${x + leftRadius}`,
      `Q ${x} ${y + height} ${x} ${y + height - leftRadius}`,
      `V ${y + leftRadius}`,
      `Q ${x} ${y} ${x + leftRadius} ${y}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${x + leftRadius} ${y}`,
    `H ${x + width - rightRadius}`,
    `Q ${x + width} ${y} ${x + width} ${y + rightRadius}`,
    `V ${y + height - rightRadius}`,
    `Q ${x + width} ${y + height} ${x + width - rightRadius} ${y + height}`,
    `H ${x + leftRadius}`,
    leftRadius > 0 ? `Q ${x} ${y + height} ${x} ${y + height - leftRadius}` : `H ${x}`,
    leftRadius > 0 ? `V ${y + leftRadius}` : `V ${y}`,
    leftRadius > 0 ? `Q ${x} ${y} ${x + leftRadius} ${y}` : `H ${x + leftRadius}`,
    "Z",
  ].join(" ");
}

function sourceMetricLayout(item, options = {}) {
  const {
    density = item?.layoutDensity || "regular",
    compactMode = false,
    showQoq = false,
    profile = lockupLayoutProfile(item?.lockupKey),
  } = options;
  if (item?.microSource) {
    return {
      value: 14,
      yoy: 11,
      qoq: 11,
      topPadding: 5,
      bottomPadding: 9,
      gapValueToYoy: 3,
      gapYoyToQoq: 2,
    };
  }
  if (compactMode) {
    return {
      value: safeNumber(profile?.compactValueFontSize, density === "ultra" ? 14 : density === "dense" ? 15 : 17),
      yoy: safeNumber(profile?.compactYoyFontSize, density === "ultra" ? 11 : density === "dense" ? 12 : 13),
      qoq: safeNumber(profile?.compactQoqFontSize, density === "ultra" ? 11 : density === "dense" ? 12 : 13),
      topPadding: density === "ultra" ? 7 : 8,
      bottomPadding: density === "ultra" ? 11 : 13,
      gapValueToYoy: density === "ultra" ? 3 : 4,
      gapYoyToQoq: density === "ultra" ? 2 : 3,
    };
  }
  return {
    value: safeNumber(profile?.sourceValueFontSize, 18),
    yoy: safeNumber(profile?.sourceYoyFontSize, 13),
    qoq: safeNumber(profile?.sourceQoqFontSize, 13),
    topPadding: 10,
    bottomPadding: 16,
    gapValueToYoy: 5,
    gapYoyToQoq: 4,
  };
}

function sourceMetricBlockHeight(item, options = {}) {
  const layout = sourceMetricLayout(item, options);
  let height = layout.topPadding + layout.value + layout.bottomPadding;
  if (item?.yoyPct !== null && item?.yoyPct !== undefined) {
    height += layout.gapValueToYoy + layout.yoy;
  }
  if (options.showQoq && item?.qoqPct !== null && item?.qoqPct !== undefined) {
    height += (item?.yoyPct !== null && item?.yoyPct !== undefined ? layout.gapYoyToQoq : layout.gapValueToYoy) + layout.qoq;
  }
  const density = options.density || item?.layoutDensity || "regular";
  const compactMode = !!options.compactMode;
  const safetyPad = item?.microSource
    ? 6
    : compactMode
      ? density === "ultra"
        ? options.showQoq ? 18 : 14
        : options.showQoq ? 22 : 18
      : options.showQoq
        ? 28
        : 22;
  return height + safetyPad;
}

function estimateReplicaSourceBoxHeight(item, showQoq, compactMode = false) {
  const density = item.layoutDensity || (compactMode ? "compact" : "regular");
  const lineCount = item.displayLines?.length || wrapLines(item.name || "", 18).length || 1;
  const supportLineCount = item.supportLines?.length || 0;
  const profile = lockupLayoutProfile(item.lockupKey);
  const noteCount =
    1 +
    (item.yoyPct !== null && item.yoyPct !== undefined ? 1 : 0) +
    (showQoq && item.qoqPct !== null && item.qoqPct !== undefined ? 1 : 0) +
    (item.operatingMarginPct !== null && item.operatingMarginPct !== undefined ? 1 : 0);
  if (density === "ultra") {
    return clamp(34 + lineCount * 18 + supportLineCount * 15 + Math.max(noteCount - 1, 0) * 11, 54, 82);
  }
  if (density === "dense") {
    return clamp(40 + lineCount * 20 + supportLineCount * 15 + Math.max(noteCount - 1, 0) * 12, 64, 96);
  }
  let estimate = compactMode
    ? 48 + lineCount * 24 + supportLineCount * 19 + Math.max(noteCount - 1, 0) * 15
    : 92 + lineCount * 32 + supportLineCount * 20 + Math.max(noteCount - 1, 0) * 19;
  if (compactMode) {
    if (profile?.compactMinHeight) estimate = Math.max(estimate, profile.compactMinHeight);
    return clamp(estimate, safeNumber(profile?.compactClampMin, 88), safeNumber(profile?.compactClampMax, 138));
  }
  if (profile?.minHeight) estimate = Math.max(estimate, profile.minHeight);
  return clamp(estimate, 148, 208);
}

function sourceLabelScale(boxHeight, lineCount, supportLineCount, density = "regular") {
  const referenceHeight =
    density === "ultra" ? 64 : density === "dense" ? 84 : density === "compact" ? 114 : 164;
  const rawScale =
    boxHeight / referenceHeight - Math.max(0, lineCount - 2) * 0.05 - Math.max(0, supportLineCount - 1) * 0.03;
  return clamp(rawScale, density === "ultra" ? 0.84 : 0.88, 1.05);
}

function splitReplicaTreeNoteLines(note, density = "regular") {
  const raw = String(note || "").trim();
  if (!raw) return [];
  const structuredLines = structuredChartNoteLines(raw);
  if (structuredLines?.length) return structuredLines;
  const explicitLines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicitLines.length > 1) return explicitLines;
  const revenuePattern = /^(.*?(?:of revenue|of sales|margin))\s+((?:\([^)]+pp\)|[+-]?\d+(?:\.\d+)?pp)\s+(?:Y\/Y|Q\/Q))$/i;
  const revenueMatch = raw.match(revenuePattern);
  if (revenueMatch) {
    return [revenueMatch[1], revenueMatch[2]];
  }
  return wrapLines(raw, density === "dense" ? 18 : 22);
}

function replicaTreeBlockLayout(item, options = {}) {
  const density = options.density || "regular";
  const compact = density === "dense" || density === "ultra";
  const defaultMode = options.defaultMode || "negative-parentheses";
  const titleFontSize = safeNumber(options.titleFontSize, compact ? 18 : 20);
  const titleLineHeight = safeNumber(options.titleLineHeight, compact ? 20 : 22);
  const noteFontSize = safeNumber(options.noteFontSize, compact ? 12 : 13);
  const noteLineHeight = safeNumber(options.noteLineHeight, compact ? 15 : 16);
  const titleMaxChars = safeNumber(options.titleMaxChars, compact ? 18 : 20);
  const titleMaxWidth = safeNumber(options.titleMaxWidth, 0);
  const titleText = `${localizeChartPhrase(item?.name || "")} ${formatItemBillions(item, defaultMode)}`.trim();
  const titleLines = item?.titleLines?.length
    ? localizeChartLines(item.titleLines)
    : titleMaxWidth > 0
      ? resolveBranchTitleLines(item, defaultMode, titleFontSize, titleMaxWidth)
      : wrapLines(titleText, titleMaxChars);
  const noteMaxWidth = safeNumber(options.noteMaxWidth, titleMaxWidth);
  const noteLines = resolveTreeNoteLines(item, density, noteFontSize, noteMaxWidth);
  const topPadding = safeNumber(options.topPadding, compact ? 12 : 16);
  const noteGap = noteLines.length ? safeNumber(options.noteGap, compact ? 5 : 7) : 0;
  const fallbackMinHeight = safeNumber(options.fallbackMinHeight, compact ? 42 : 52);
  const totalHeight = Math.max(
    topPadding + titleLines.length * titleLineHeight + noteGap + noteLines.length * noteLineHeight,
    fallbackMinHeight
  );
  return {
    density,
    compact,
    titleLines,
    noteLines,
    titleFontSize,
    titleLineHeight,
    noteFontSize,
    noteLineHeight,
    topPadding,
    noteGap,
    totalHeight,
    minHeight: fallbackMinHeight,
  };
}

function estimateReplicaTreeBoxHeight(item, options = {}) {
  return replicaTreeBlockLayout(item, options).totalHeight;
}

function resolveReplicaBandBoxes(entries, minY, maxY, options = {}) {
  if (!entries.length) return [];
  const available = Math.max(maxY - minY, 1);
  let gap = safeNumber(options.gap, 24);
  const minGap = safeNumber(options.minGap, Math.min(gap, 6));
  const fallbackMinHeight = safeNumber(options.fallbackMinHeight, 30);
  let working = entries.map((entry) => ({
    ...entry,
    height: Math.max(safeNumber(entry.height, 0), 1),
    minHeight: Math.max(Math.min(safeNumber(entry.minHeight, fallbackMinHeight), safeNumber(entry.height, 0)), fallbackMinHeight),
  }));
  const compress = () => {
    if (!working.length) return;
    const totalHeight = working.reduce((sum, entry) => sum + entry.height, 0);
    if (working.length > 1 && totalHeight + gap * (working.length - 1) > available) {
      gap = Math.max(minGap, (available - totalHeight) / (working.length - 1));
    }
    const required = working.reduce((sum, entry) => sum + entry.height, 0) + gap * Math.max(working.length - 1, 0);
    const overflow = required - available;
    if (overflow <= 0) return;
    const shrinkable = working.reduce((sum, entry) => sum + Math.max(entry.height - entry.minHeight, 0), 0);
    if (shrinkable > 0) {
      const ratio = Math.min(1, overflow / shrinkable);
      working = working.map((entry) => ({
        ...entry,
        height: Math.max(entry.minHeight, entry.height - (entry.height - entry.minHeight) * ratio),
      }));
    }
    const remainingOverflow =
      working.reduce((sum, entry) => sum + entry.height, 0) + gap * Math.max(working.length - 1, 0) - available;
    if (remainingOverflow > 0) {
      const hardScale = Math.min(
        1,
        (available - gap * Math.max(working.length - 1, 0)) /
          Math.max(working.reduce((sum, entry) => sum + entry.height, 0), 1)
      );
      working = working.map((entry) => ({
        ...entry,
        height: Math.max(fallbackMinHeight, entry.height * hardScale),
      }));
    }
  };
  compress();
  compress();
  return resolveVerticalBoxes(working, minY, maxY, gap);
}

function resolveAnchoredBandBoxes(entries, minY, maxY, options = {}) {
  if (!entries.length) return [];
  const gap = safeNumber(options.gap, 24);
  const minGap = safeNumber(options.minGap, Math.min(gap, 8));
  const spreadExponent = Math.max(safeNumber(options.spreadExponent, 1.08), 0.7);
  const fallbackMinHeight = safeNumber(options.fallbackMinHeight, 24);
  const sortedEntries = entries
    .map((entry, originalIndex) => ({
      ...entry,
      originalIndex,
      height: Math.max(safeNumber(entry.height, 0), 1),
      center: safeNumber(entry.center, minY),
    }))
    .sort((left, right) => left.center - right.center || left.originalIndex - right.originalIndex);
  const totalHeight = sortedEntries.reduce((sum, entry) => sum + entry.height, 0);
  const minimumSpan = totalHeight + Math.max(sortedEntries.length - 1, 0) * minGap;
  const firstHeight = sortedEntries[0]?.height || 0;
  const lastHeight = sortedEntries[sortedEntries.length - 1]?.height || 0;
  const bottomAnchorCenter = clamp(
    safeNumber(options.bottomAnchorCenter, maxY - lastHeight / 2),
    minY + minimumSpan - lastHeight / 2,
    maxY - lastHeight / 2
  );
  const topAnchorCenterFloor = minY + firstHeight / 2;
  const topAnchorCenterCeiling = Math.max(bottomAnchorCenter - minimumSpan + firstHeight / 2, topAnchorCenterFloor);
  const preferredTopCenter = Math.max(
    safeNumber(options.topAnchorCenter, sortedEntries[0]?.center ?? topAnchorCenterFloor),
    topAnchorCenterFloor
  );
  const topAnchorCenter = clamp(preferredTopCenter, topAnchorCenterFloor, topAnchorCenterCeiling);
  const centerRange = Math.max(bottomAnchorCenter - topAnchorCenter, 0);
  const anchoredEntries = sortedEntries.map((entry, index) => {
    const ratio = sortedEntries.length <= 1 ? 1 : index / Math.max(sortedEntries.length - 1, 1);
    const easedRatio = Math.pow(ratio, spreadExponent);
    return {
      ...entry,
      center: topAnchorCenter + centerRange * easedRatio,
      minHeight: Math.max(Math.min(safeNumber(entry.minHeight, fallbackMinHeight), entry.height), fallbackMinHeight),
    };
  });
  const resolved = resolveReplicaBandBoxes(anchoredEntries, minY, maxY, {
    gap,
    minGap,
    fallbackMinHeight,
  });
  const resolvedLast = resolved[resolved.length - 1];
  if (resolvedLast) {
    const desiredBottom = bottomAnchorCenter + resolvedLast.height / 2;
    const actualBottom = resolvedLast.bottom;
    const shift = clamp(desiredBottom - actualBottom, minY - resolved[0].top, maxY - actualBottom);
    if (Math.abs(shift) > 0.01) {
      return resolved
        .map((entry) => ({
          ...entry,
          top: entry.top + shift,
          bottom: entry.bottom + shift,
          center: entry.center + shift,
        }))
        .sort((left, right) => left.originalIndex - right.originalIndex);
    }
  }
  return resolved.sort((left, right) => left.originalIndex - right.originalIndex);
}

function logoFrameMetrics(logoKey, context = "corporate") {
  const asset = getLogoAsset(logoKey);
  const normalizedKey = normalizeLogoKey(logoKey);
  if (!asset) {
    return context === "corporate"
      ? { width: 116, height: 116, padding: 14, radius: 30 }
      : { width: 84, height: 84, padding: 10, radius: 22 };
  }
  const ratio = safeNumber(asset.width, 64) / Math.max(safeNumber(asset.height, 64), 1);
  if (context === "corporate") {
    if (normalizedKey === "jpmorgan") return { width: 248, height: 44, paddingX: 0, paddingY: 0, radius: 0, showPlate: false };
    if (normalizedKey === "exxon") return { width: 208, height: 48, paddingX: 0, paddingY: 0, radius: 0, showPlate: false };
    if (normalizedKey === "berkshire") return { width: 324, height: 30, paddingX: 0, paddingY: 0, radius: 0, showPlate: false };
    if (ratio > 5.2) return { width: 244, height: 54, paddingX: 4, paddingY: 3, radius: 0, showPlate: false };
    if (ratio > 3.2) return { width: 212, height: 60, paddingX: 6, paddingY: 4, radius: 0, showPlate: false };
    if (ratio > 1.7) return { width: 172, height: 84, paddingX: 6, paddingY: 6, radius: 0, showPlate: false };
    if (ratio < 0.75) return { width: 112, height: 126, paddingX: 6, paddingY: 4, radius: 0, showPlate: false };
    return { width: 110, height: 110, paddingX: 6, paddingY: 6, radius: 0, showPlate: false };
  }
  if (normalizedKey === "berkshire") return { width: 182, height: 18, paddingX: 0, paddingY: 0, radius: 0, showPlate: false };
  if (ratio > 5.2) return { width: 162, height: 42, paddingX: 8, paddingY: 4, radius: 14 };
  if (ratio > 3.2) return { width: 144, height: 46, padding: 12, radius: 16 };
  if (ratio > 1.7) return { width: 118, height: 60, padding: 10, radius: 18 };
  if (ratio < 0.75) return { width: 72, height: 92, padding: 10, radius: 18 };
  return { width: 84, height: 84, padding: 10, radius: 22 };
}

function renderImageLogo(asset, x, y, options = {}) {
  const {
    scale = 1,
    boxWidth = 116,
    boxHeight = 116,
    padding = 12,
    paddingX = padding,
    paddingY = padding,
    radius = 28,
    showPlate = true,
    borderColor = "#E5E7EB",
    plateFill = "#FFFFFF",
  } = options;
  const imageWidth = Math.max(boxWidth - paddingX * 2, 24);
  const imageHeight = Math.max(boxHeight - paddingY * 2, 12);
  const plateMarkup = showPlate
    ? `<rect x="0" y="0" width="${boxWidth}" height="${boxHeight}" rx="${radius}" fill="${plateFill}" stroke="${borderColor}" stroke-width="2.5"></rect>`
    : "";
  return `
    <g transform="translate(${x}, ${y}) scale(${scale})">
      ${plateMarkup}
      <image x="${paddingX}" y="${paddingY}" width="${imageWidth}" height="${imageHeight}" href="${asset.dataUrl}" preserveAspectRatio="xMidYMid meet"></image>
    </g>
  `;
}

function renderCorporateLogo(logoKey, x, y, options = {}) {
  const { scale = 1 } = options;
  const effectiveScale = scale * CORPORATE_LOGO_LINEAR_SCALE_MULTIPLIER;
  if (normalizeLogoKey(logoKey) === "jpmorgan") {
    return `
      <g transform="translate(${x}, ${y}) scale(${effectiveScale})">
        <text x="0" y="34" font-family="Aptos, Segoe UI, Arial, Helvetica, sans-serif" font-size="34" font-weight="700" letter-spacing="-0.4" fill="#1F3C88">JPMorganChase</text>
      </g>
    `;
  }
  if (normalizeLogoKey(logoKey) === "exxon") {
    return `
      <g transform="translate(${x}, ${y}) scale(${effectiveScale})">
        <text x="0" y="36" font-family="Aptos, Segoe UI, Arial, Helvetica, sans-serif" font-size="36" font-weight="800" letter-spacing="-1.1" fill="#E51636">ExxonMobil</text>
      </g>
    `;
  }
  if (normalizeLogoKey(logoKey) === "eli-lilly") {
    return `
      <g transform="translate(${x}, ${y}) scale(${effectiveScale})">
        <text x="0" y="52" font-family="Times New Roman, Georgia, serif" font-style="italic" font-size="56" font-weight="700" fill="#111111">Lilly</text>
      </g>
    `;
  }
  if (logoKey === "microsoft-corporate") {
    return `
      <g transform="translate(${x}, ${y}) scale(${effectiveScale})">
        <rect x="0" y="0" width="54" height="54" fill="#F25022"></rect>
        <rect x="62" y="0" width="54" height="54" fill="#7FBA00"></rect>
        <rect x="0" y="62" width="54" height="54" fill="#00A4EF"></rect>
        <rect x="62" y="62" width="54" height="54" fill="#FFB900"></rect>
      </g>
    `;
  }
  const asset = getLogoAsset(logoKey);
  if (asset) {
    const company = getCompany(normalizeLogoKey(logoKey));
    const primary = company?.brand?.primary || "#CBD5E1";
    const metrics = logoFrameMetrics(logoKey, "corporate");
    return renderImageLogo(asset, x, y, {
      scale: effectiveScale,
      boxWidth: metrics.width,
      boxHeight: metrics.height,
      padding: metrics.padding,
      paddingX: metrics.paddingX,
      paddingY: metrics.paddingY,
      radius: metrics.radius,
      borderColor: rgba(primary, 0.18),
      plateFill: "#FFFFFF",
      showPlate: false,
    });
  }
  const company = getCompany(logoKey);
  const initial = escapeHtml((company?.ticker || logoKey || "?").slice(0, 1).toUpperCase());
  const primary = company?.brand?.primary || "#0F172A";
  const secondary = company?.brand?.secondary || company?.brand?.accent || primary;
  return `
    <g transform="translate(${x}, ${y}) scale(${effectiveScale})">
      <circle cx="58" cy="58" r="54" fill="#FFFFFF" opacity="0.98"></circle>
      <circle cx="58" cy="58" r="50" fill="${rgba(primary, 0.08)}" stroke="${rgba(primary, 0.18)}" stroke-width="4"></circle>
      <circle cx="58" cy="58" r="24" fill="${rgba(secondary, 0.16)}"></circle>
      <text x="58" y="74" text-anchor="middle" font-size="52" font-weight="800" fill="${primary}">${initial}</text>
    </g>
  `;
}

function currentEditorSessionKey() {
  const companyId = state.selectedCompanyId || "";
  const quarterKey = state.selectedQuarter || "";
  const mode = currentChartViewMode();
  return `${companyId}::${quarterKey}::${mode}`;
}

function currentEditorOverrides() {
  return state.editor.overridesBySession[currentEditorSessionKey()] || {};
}

function clearCurrentEditorOverrides() {
  const key = currentEditorSessionKey();
  delete state.editor.overridesBySession[key];
}

function setCurrentEditorNodeOverride(nodeId, override) {
  const key = currentEditorSessionKey();
  const current = { ...(state.editor.overridesBySession[key] || {}) };
  current[nodeId] = {
    dx: safeNumber(override?.dx, 0),
    dy: safeNumber(override?.dy, 0),
  };
  state.editor.overridesBySession[key] = current;
}

function requestEditorRerender() {
  if (state.editor.rerenderFrame && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.editor.rerenderFrame);
  }
  const execute = () => {
    state.editor.rerenderFrame = 0;
    renderCurrent();
  };
  if (typeof requestAnimationFrame === "function") {
    state.editor.rerenderFrame = requestAnimationFrame(execute);
  } else {
    execute();
  }
}

function isInteractiveSankeyEditable(snapshot = state.currentSnapshot) {
  return currentChartViewMode() === "sankey" && (snapshot?.mode === "pixel-replica" || snapshot?.mode === "replica-template");
}

function syncEditModeUi(snapshot = state.currentSnapshot) {
  const editable = isInteractiveSankeyEditable(snapshot);
  const showEditorControls = currentChartViewMode() !== "bars";
  const hasOverrides = Object.keys(currentEditorOverrides()).length > 0;
  if (refs.chartEditGroup) {
    refs.chartEditGroup.hidden = !showEditorControls;
  }
  if (refs.editImageBtn) {
    refs.editImageBtn.disabled = !editable;
    refs.editImageBtn.textContent = state.editor.enabled && editable ? "完成编辑" : "编辑图片";
    refs.editImageBtn.classList.toggle("is-active", !!(state.editor.enabled && editable));
  }
  if (refs.resetImageBtn) {
    refs.resetImageBtn.disabled = !(editable && hasOverrides);
  }
  refs.chartOutput?.classList.toggle("is-editing", !!(editable && state.editor.enabled));
  const svg = refs.chartOutput?.querySelector("svg");
  if (svg) {
    svg.classList.toggle("is-dragging", !!state.editor.dragging);
  }
}

function svgPointFromClient(clientX, clientY) {
  const svg = refs.chartOutput?.querySelector("svg");
  if (!svg || typeof svg.createSVGPoint !== "function") return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm || typeof ctm.inverse !== "function") return null;
  return point.matrixTransform(ctm.inverse());
}

function editorCanvasBounds(svg) {
  if (!svg) return null;
  const left = safeNumber(svg.dataset?.editorBoundsLeft, 0);
  const top = safeNumber(svg.dataset?.editorBoundsTop, 0);
  const right = safeNumber(svg.dataset?.editorBoundsRight, NaN);
  const bottom = safeNumber(svg.dataset?.editorBoundsBottom, NaN);
  if (Number.isFinite(right) && Number.isFinite(bottom)) {
    return { left, top, right, bottom };
  }
  const viewBoxParts = String(svg.getAttribute("viewBox") || "")
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));
  if (viewBoxParts.length === 4 && viewBoxParts.every((value) => Number.isFinite(value))) {
    return {
      left: viewBoxParts[0],
      top: viewBoxParts[1],
      right: viewBoxParts[0] + viewBoxParts[2],
      bottom: viewBoxParts[1] + viewBoxParts[3],
    };
  }
  return null;
}

function bindInteractiveEditor(snapshot = state.currentSnapshot) {
  syncEditModeUi(snapshot);
  const svg = refs.chartOutput?.querySelector("svg");
  if (!svg || !isInteractiveSankeyEditable(snapshot) || !state.editor.enabled) return;
  svg.querySelectorAll("[data-edit-hit='true']").forEach((node) => {
    node.addEventListener("pointerdown", (event) => {
      const nodeId = node.getAttribute("data-edit-node-id");
      const origin = svgPointFromClient(event.clientX, event.clientY);
      const visibleNode = node.previousElementSibling;
      const frameX = safeNumber(visibleNode?.getAttribute?.("x"), NaN);
      const frameY = safeNumber(visibleNode?.getAttribute?.("y"), NaN);
      const frameWidth = safeNumber(visibleNode?.getAttribute?.("width"), NaN);
      const frameHeight = safeNumber(visibleNode?.getAttribute?.("height"), NaN);
      const bounds = editorCanvasBounds(svg);
      if (!nodeId || !origin) return;
      event.preventDefault();
      const existing = currentEditorOverrides()[nodeId] || { dx: 0, dy: 0 };
      const baseFrameX = Number.isFinite(frameX) ? frameX - safeNumber(existing.dx, 0) : NaN;
      const baseFrameY = Number.isFinite(frameY) ? frameY - safeNumber(existing.dy, 0) : NaN;
      state.editor.selectedNodeId = nodeId;
      state.editor.dragging = {
        nodeId,
        pointerId: event.pointerId,
        startX: origin.x,
        startY: origin.y,
        baseDx: safeNumber(existing.dx, 0),
        baseDy: safeNumber(existing.dy, 0),
        minDx:
          bounds && Number.isFinite(baseFrameX) && Number.isFinite(frameWidth)
            ? bounds.left - baseFrameX
            : -Infinity,
        maxDx:
          bounds && Number.isFinite(baseFrameX) && Number.isFinite(frameWidth)
            ? bounds.right - baseFrameX - frameWidth
            : Infinity,
        minDy:
          bounds && Number.isFinite(baseFrameY) && Number.isFinite(frameHeight)
            ? bounds.top - baseFrameY
            : -Infinity,
        maxDy:
          bounds && Number.isFinite(baseFrameY) && Number.isFinite(frameHeight)
            ? bounds.bottom - baseFrameY - frameHeight
            : Infinity,
      };
      requestEditorRerender();
    });
  });
}

function corporateLogoMetrics(logoKey) {
  if (logoKey === "microsoft-corporate") return { width: 116, height: 116 };
  if (getLogoAsset(logoKey)) {
    const metrics = logoFrameMetrics(logoKey, "corporate");
    return { width: metrics.width, height: metrics.height };
  }
  return { width: 116, height: 116 };
}

function corporateLogoVisibleMetrics(logoKey) {
  if (logoKey === "microsoft-corporate") return { width: 116, height: 116 };
  if (getLogoAsset(logoKey)) {
    const metrics = logoFrameMetrics(logoKey, "corporate");
    const paddingX = safeNumber(metrics.paddingX, safeNumber(metrics.padding, 0));
    const paddingY = safeNumber(metrics.paddingY, safeNumber(metrics.padding, 0));
    return {
      width: Math.max(safeNumber(metrics.width, 116) - paddingX * 2, 24),
      height: Math.max(safeNumber(metrics.height, 116) - paddingY * 2, 12),
    };
  }
  return { width: 116, height: 116 };
}

function corporateLogoBaseScale(logoKey, options = {}) {
  const normalizedKey = normalizeLogoKey(logoKey);
  const config = options.config || {};
  const visualScaleOverride = safeNumber(
    CORPORATE_LOGO_SCALE_OVERRIDES[logoKey] ?? CORPORATE_LOGO_SCALE_OVERRIDES[normalizedKey],
    1
  );
  const explicitScale =
    config.baseScales?.[logoKey] ??
    config.baseScales?.[normalizedKey] ??
    CORPORATE_LOGO_BASE_SCALE_OVERRIDES[logoKey] ??
    CORPORATE_LOGO_BASE_SCALE_OVERRIDES[normalizedKey];
  if (explicitScale !== null && explicitScale !== undefined) {
    return safeNumber(explicitScale, 1) * visualScaleOverride;
  }
  if (options.hero) {
    return safeNumber(config.heroScale, 1.04) * visualScaleOverride;
  }
  if (!getLogoAsset(logoKey)) {
    return safeNumber(config.fallbackScale, 0.92) * visualScaleOverride;
  }
  const metrics = logoFrameMetrics(logoKey, "corporate");
  const ratio = safeNumber(metrics.width, 116) / Math.max(safeNumber(metrics.height, 116), 1);
  const bands = [...(config.ratioScaleBands || BASE_CORPORATE_LOGO_TOKENS.ratioScaleBands)].sort(
    (left, right) => safeNumber(right.min, 0) - safeNumber(left.min, 0)
  );
  const matchedBand = bands.find((band) => ratio >= safeNumber(band.min, 0));
  return safeNumber(matchedBand?.scale, 1.04) * visualScaleOverride;
}

function prototypeBandConfig(templateTokens, bandKey, count = 0) {
  const config = templateTokens?.bands?.[bandKey] || {};
  if (bandKey !== "opex") return config;
  const denseThreshold = safeNumber(config.denseThreshold, BASE_RIGHT_BAND_TOKENS.opex.denseThreshold);
  const densityKey = count >= denseThreshold ? "dense" : "regular";
  return {
    ...(config.common || {}),
    ...(config[densityKey] || {}),
    densityKey,
  };
}

function renderReplicaFooter(snapshot) {
  return "";
}

function renderRegionMapLockup(lockupKey, x, y, scale = 1) {
  const outlines = {
    "region-ucan": `<path d="M17 18 L24 12 L33 10 L40 14 L39 19 L33 22 L30 28 L21 31 L15 28 L11 21 Z" fill="#6B7280"></path>`,
    "region-emea": `<path d="M24 10 L31 12 L35 17 L31 20 L27 18 L24 22 L27 30 L31 39 L27 45 L22 39 L20 29 L16 22 L18 15 Z" fill="#6B7280"></path>`,
    "region-latam": `<path d="M28 17 L33 23 L31 29 L27 35 L29 43 L25 50 L21 46 L22 37 L18 30 L21 22 Z" fill="#6B7280"></path>`,
    "region-apac": `<path d="M18 17 L25 12 L34 14 L40 19 L36 24 L31 24 L27 27 L23 24 L18 24 L15 20 Z M39 34 L43 39 L40 44 L35 41 Z" fill="#6B7280"></path>`,
  };
  const regionShape = outlines[lockupKey];
  if (!regionShape) return "";
  return `
    <g transform="translate(${x}, ${y}) scale(${scale})">
      <circle cx="30" cy="30" r="24" fill="none" stroke="#D1D5DB" stroke-width="2"></circle>
      <ellipse cx="30" cy="30" rx="18" ry="24" fill="none" stroke="#E5E7EB" stroke-width="1.4"></ellipse>
      <path d="M8 30 H52" fill="none" stroke="#E5E7EB" stroke-width="1.2"></path>
      <path d="M13 20 H47" fill="none" stroke="#ECEFF3" stroke-width="1"></path>
      <path d="M13 40 H47" fill="none" stroke="#ECEFF3" stroke-width="1"></path>
      ${regionShape}
    </g>
  `;
}

function renderBusinessLockup(lockupKey, x, y, options = {}) {
  const { scale = 1 } = options;
  if (lockupKey === "microsoft-productivity") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <rect x="0" y="0" width="20" height="20" fill="#F25022"></rect>
        <rect x="23" y="0" width="20" height="20" fill="#7FBA00"></rect>
        <rect x="0" y="23" width="20" height="20" fill="#00A4EF"></rect>
        <rect x="23" y="23" width="20" height="20" fill="#FFB900"></rect>
        <text x="54" y="15" font-size="18" font-weight="700" fill="#73767E">Microsoft 365</text>
        <text x="54" y="38" font-size="20" font-weight="800" fill="#2563EB">LinkedIn</text>
      </g>
    `;
  }

  if (lockupKey === "microsoft-cloud") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <path d="M30 0 L60 92 L45 92 L37 67 L16 67 L4 92 L0 92 L26 0 Z" fill="#2B63C6"></path>
        <path d="M42 0 L96 0 L54 92 L40 92 Z" fill="#2DB3F1" opacity="0.92"></path>
        <path d="M42 45 L49 67 L35 67 Z" fill="#FFFFFF" opacity="0.9"></path>
      </g>
    `;
  }

  if (lockupKey === "microsoft-personal") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <rect x="0" y="12" width="32" height="32" fill="#1C9CDD" transform="skewY(-8)"></rect>
        <rect x="36" y="7" width="32" height="37" fill="#1C9CDD" transform="skewY(-8)"></rect>
        <circle cx="114" cy="20" r="14" fill="#111111"></circle>
        <path d="M102 10 L107 7 L114 14 L121 7 L126 10 L119 18 L126 25 L121 29 L114 21 L107 29 L102 25 L109 18 Z" fill="#FFFFFF"></path>
        <text x="78" y="60" font-size="22" font-weight="500" fill="#111111">XBOX</text>
      </g>
    `;
  }

  if (lockupKey === "google-search-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="44" font-size="46" font-weight="700" font-family="Aptos, Segoe UI, Arial, sans-serif">
          <tspan fill="#4285F4">G</tspan><tspan fill="#DB4437">o</tspan><tspan fill="#F4B400">o</tspan><tspan fill="#4285F4">g</tspan><tspan fill="#0F9D58">l</tspan><tspan fill="#DB4437">e</tspan>
        </text>
        <text x="0" y="78" font-size="22" font-weight="700" fill="#3974D9">Search advertising</text>
      </g>
    `;
  }

  if (lockupKey === "youtube-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <rect x="0" y="8" width="62" height="42" rx="11" fill="#FF0033"></rect>
        <path d="M25 19 L43 29 L25 39 Z" fill="#FFFFFF"></path>
        <text x="76" y="41" font-size="32" font-weight="700" fill="#111111">YouTube</text>
      </g>
    `;
  }

  if (lockupKey === "admob-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <path d="M8 35 C8 18, 18 8, 32 8 C44 8, 52 16, 52 28 C52 40, 45 50, 34 50 C22 50, 14 42, 14 30" fill="none" stroke="#EA4335" stroke-width="8" stroke-linecap="round"></path>
        <path d="M34 50 C48 50, 58 39, 58 26" fill="none" stroke="#4285F4" stroke-width="8" stroke-linecap="round"></path>
        <text x="76" y="34" font-size="28" font-weight="700" fill="#5F6368">Google AdMob</text>
        <text x="76" y="60" font-size="16" font-weight="500" fill="#6B7280">+ AdSense &amp; Google Ad Manager</text>
      </g>
    `;
  }

  if (lockupKey === "google-play-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <path d="M0 0 L0 52 L30 26 Z" fill="#00C6FF"></path>
        <path d="M0 0 L34 20 L22 31 Z" fill="#32A853"></path>
        <path d="M22 31 L34 20 L54 26 L22 31 Z" fill="#FBBC04"></path>
        <path d="M0 52 L22 31 L54 26 L34 40 Z" fill="#EA4335"></path>
        <text x="72" y="34" font-size="27" font-weight="700" fill="#5F6368">Google Play</text>
      </g>
    `;
  }

  if (lockupKey === "google-cloud-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <path d="M17 37 C17 25, 25 17, 36 17 C44 17, 50 21, 54 28 C57 27, 60 26, 64 26 C74 26, 82 34, 82 44 C82 54, 74 62, 64 62 L24 62 C13 62, 4 53, 4 42 C4 33, 10 25, 18 22" fill="none" stroke="#4285F4" stroke-width="8" stroke-linecap="round"></path>
        <path d="M18 22 C22 16, 29 12, 36 12" fill="none" stroke="#EA4335" stroke-width="8" stroke-linecap="round"></path>
        <path d="M54 28 C57 22, 62 18, 68 18" fill="none" stroke="#FBBC04" stroke-width="8" stroke-linecap="round"></path>
        <path d="M64 62 L24 62" fill="none" stroke="#34A853" stroke-width="8" stroke-linecap="round"></path>
        <text x="94" y="43" font-size="28" font-weight="700" fill="#5F6368">Google Cloud</text>
      </g>
    `;
  }

  if (lockupKey === "google-ad-stack-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="26" font-size="22" font-weight="700" fill="#4285F4">Google Ads</text>
        <text x="0" y="50" font-size="22" font-weight="700" fill="#FF0033">YouTube</text>
        <text x="102" y="50" font-size="22" font-weight="700" fill="#5F6368">AdMob</text>
      </g>
    `;
  }

  if (lockupKey === "amazon-online-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="34" font-size="29" font-weight="700" fill="#111111">amazon.com</text>
        <path d="M14 42 C28 52, 58 52, 82 40" fill="none" stroke="#FF9900" stroke-width="4" stroke-linecap="round"></path>
        <path d="M78 36 L86 39 L80 45" fill="none" stroke="#FF9900" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      </g>
    `;
  }

  if (lockupKey === "wholefoods-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="26" font-size="24" font-weight="800" fill="#59A23A">fresh</text>
        <text x="72" y="26" font-size="18" font-weight="700" fill="#1F4027">WHOLE</text>
        <text x="72" y="46" font-size="18" font-weight="700" fill="#1F4027">FOODS</text>
      </g>
    `;
  }

  if (lockupKey === "amazon-ads-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="26" font-size="22" font-weight="700" fill="#111111">amazon ads</text>
        <path d="M12 33 C26 42, 46 42, 60 32" fill="none" stroke="#FF9900" stroke-width="3.6" stroke-linecap="round"></path>
        <text x="78" y="30" font-size="23" font-weight="800" fill="#7C3AED">twitch</text>
      </g>
    `;
  }

  if (lockupKey === "prime-audible-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="24" font-size="24" font-weight="700" fill="#1F77D0">prime</text>
        <path d="M8 30 C18 38, 34 38, 46 28" fill="none" stroke="#1F77D0" stroke-width="3.5" stroke-linecap="round"></path>
        <text x="62" y="24" font-size="22" font-weight="700" fill="#111111">audible</text>
        <path d="M142 12 C148 16, 148 32, 142 36" fill="none" stroke="#F59E0B" stroke-width="3.5" stroke-linecap="round"></path>
        <path d="M150 8 C158 15, 158 33, 150 40" fill="none" stroke="#F59E0B" stroke-width="3.5" stroke-linecap="round"></path>
      </g>
    `;
  }

  if (lockupKey === "aws-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <text x="0" y="28" font-size="34" font-weight="700" fill="#111111">aws</text>
        <path d="M10 36 C26 47, 50 47, 70 34" fill="none" stroke="#FF9900" stroke-width="4" stroke-linecap="round"></path>
        <path d="M66 30 L74 34 L68 40" fill="none" stroke="#FF9900" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      </g>
    `;
  }

  if (lockupKey === "meta-apps-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <circle cx="16" cy="18" r="13" fill="#1877F2"></circle>
        <text x="16" y="24" text-anchor="middle" font-size="18" font-weight="800" fill="#FFFFFF">f</text>
        <circle cx="48" cy="18" r="13" fill="#E1306C"></circle>
        <circle cx="48" cy="18" r="6" fill="none" stroke="#FFFFFF" stroke-width="2"></circle>
        <circle cx="78" cy="18" r="13" fill="#25D366"></circle>
        <text x="78" y="24" text-anchor="middle" font-size="15" font-weight="800" fill="#FFFFFF">w</text>
        <circle cx="108" cy="18" r="13" fill="#00B2FF"></circle>
        <path d="M101 22 L108 14 L115 22" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
      </g>
    `;
  }

  if (lockupKey === "meta-quest-business") {
    return `
      <g transform="translate(${x}, ${y}) scale(${scale})">
        <path d="M2 22 C8 8, 20 8, 28 22 C36 8, 48 8, 54 22" fill="none" stroke="#2563EB" stroke-width="6" stroke-linecap="round"></path>
        <text x="66" y="28" font-size="24" font-weight="700" fill="#111111">Quest</text>
      </g>
    `;
  }

  if (lockupKey.startsWith("region-")) {
    return renderRegionMapLockup(lockupKey, x, y, scale);
  }

  const asset = getLogoAsset(lockupKey);
  if (asset) {
    const company = getCompany(normalizeLogoKey(lockupKey));
    const primary = company?.brand?.primary || "#CBD5E1";
    const metrics = logoFrameMetrics(lockupKey, "lockup");
    return renderImageLogo(asset, x, y, {
      scale,
      boxWidth: metrics.width,
      boxHeight: metrics.height,
      padding: metrics.padding,
      paddingX: metrics.paddingX,
      paddingY: metrics.paddingY,
      radius: metrics.radius,
      borderColor: rgba(primary, 0.18),
      plateFill: "#FFFFFF",
      showPlate: metrics.showPlate !== false,
    });
  }

  const company = getCompany(lockupKey);
  const primary = company?.brand?.primary || "#0F172A";
  const initial = escapeHtml((company?.ticker || lockupKey || "?").slice(0, 1).toUpperCase());
  return `
    <g transform="translate(${x}, ${y}) scale(${scale})">
      <circle cx="42" cy="42" r="34" fill="#FFFFFF" stroke="${rgba(primary, 0.16)}" stroke-width="6"></circle>
      <circle cx="42" cy="42" r="22" fill="${rgba(primary, 0.08)}"></circle>
      <text x="42" y="54" text-anchor="middle" font-size="30" font-weight="800" fill="${primary}">${initial}</text>
    </g>
  `;
}
