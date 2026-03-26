function companyDisplay(company) {
  const nameZh = String(company?.nameZh || company?.nameEn || company?.ticker || "Unknown");
  const nameEn = String(company?.nameEn || company?.nameZh || company?.ticker || "Unknown");
  return `${nameZh} / ${nameEn}`;
}

function renderCompanyList() {
  if (!refs.companyList) return;
  const search = refs.companySearch?.value?.trim()?.toLowerCase() || "";
  const filtered = companies().filter((company) => !search || companySearchValue(company).includes(search));
  state.filteredCompanyIds = filtered.map((company) => company.id);
  refs.companyList.innerHTML = filtered
    .map((company) => {
      const active = company.id === state.selectedCompanyId;
      const adr = company.isAdr ? `<span class="mini-badge">ADR</span>` : "";
      return `
        <button class="company-card ${active ? "is-active" : ""}" type="button" data-company-id="${company.id}">
          <div class="company-topline">
            <span>#${company.rank} · ${escapeHtml(company.ticker)}</span>
          </div>
          <div class="company-title">${escapeHtml(companyDisplay(company))}</div>
          <div class="company-subtitle">${escapeHtml(company.nameEn || company.nameZh || company.ticker)}</div>
          <div class="company-badges">
            ${adr}
            <span class="mini-badge">${company.coverage?.quarterCount || 0} 个季度</span>
          </div>
        </button>
      `;
    })
    .join("");
  syncActiveCompanyCard();
}

function syncActiveCompanyCard() {
  if (!refs.companyList) return;
  refs.companyList.querySelectorAll("[data-company-id]").forEach((node) => {
    const isActive = node.getAttribute("data-company-id") === state.selectedCompanyId;
    node.classList.toggle("is-active", isActive);
  });
}

function requestRenderCurrent() {
  if (state.pendingRenderFrame && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.pendingRenderFrame);
  }
  const execute = () => {
    state.pendingRenderFrame = 0;
    renderCurrent();
  };
  if (typeof requestAnimationFrame === "function") {
    state.pendingRenderFrame = requestAnimationFrame(execute);
  } else {
    execute();
  }
}

function selectCompany(companyId, { preferReplica = false, rerenderList = false } = {}) {
  const company = getCompany(companyId);
  if (!company) return;
  state.selectedCompanyId = companyId;
  syncQuarterOptions({ preferReplica });
  if (rerenderList) {
    renderCompanyList();
  } else {
    syncActiveCompanyCard();
  }
  renderCoverage();
  setStatus(`正在生成 ${company.nameEn} 图像...`);
  requestRenderCurrent();
}

function quarterOptionLabel(company, quarterKey) {
  const entry = company?.financials?.[quarterKey];
  if (!entry) return quarterKey;
  const end = entry.periodEnd || "-";
  const fiscal = entry.fiscalLabel || "";
  return `${quarterKey} · ${fiscal} · ${end}`;
}

function isRenderableBridgeEntry(entry) {
  if (!entry) return false;
  const revenueBn = safeNumber(entry.revenueBn, null);
  if (!(revenueBn > 0.05)) return false;
  return (
    (entry.grossProfitBn !== null && entry.grossProfitBn !== undefined) ||
    (entry.costOfRevenueBn !== null && entry.costOfRevenueBn !== undefined) ||
    (entry.operatingIncomeBn !== null && entry.operatingIncomeBn !== undefined) ||
    (entry.netIncomeBn !== null && entry.netIncomeBn !== undefined) ||
    (entry.taxBn !== null && entry.taxBn !== undefined)
  );
}

function renderableQuarterKeys(company) {
  if (!company) return [];
  const quarterKeys = Array.isArray(company.quarters) ? company.quarters : [];
  const presetKeys = new Set(Object.keys(company.statementPresets || {}));
  const validQuarterKeys = quarterKeys.filter((quarterKey) => {
    if (presetKeys.has(quarterKey)) return true;
    return isRenderableBridgeEntry(company.financials?.[quarterKey]);
  });
  const baseQuarterKeys = validQuarterKeys.length ? validQuarterKeys : quarterKeys;
  const filteredQuarterKeys = filterQuarterKeysByClassificationPolicy(company, baseQuarterKeys);
  return filteredQuarterKeys.length ? filteredQuarterKeys : baseQuarterKeys;
}

function reportingCycleForQuarterKey(quarterKey) {
  const parsed = parseQuarterKey(quarterKey);
  if (!parsed) return null;
  if (parsed.quarter === 2) return "half-year";
  if (parsed.quarter === 4) return "annual";
  return "quarterly";
}

function quarterHasOfficialRevenueClassification(company, quarterKey) {
  const entry = company?.financials?.[quarterKey];
  if (Array.isArray(entry?.officialRevenueSegments) && entry.officialRevenueSegments.some((item) => safeNumber(item?.valueBn) > 0.02)) {
    return true;
  }
  const structurePayload = company?.officialRevenueStructureHistory?.quarters?.[quarterKey];
  return Array.isArray(structurePayload?.segments) && structurePayload.segments.some((item) => safeNumber(item?.valueBn) > 0.02);
}

function quarterHasOfficialExpenseClassification(company, quarterKey) {
  const entry = company?.financials?.[quarterKey];
  return (
    (Array.isArray(entry?.officialOpexBreakdown) && entry.officialOpexBreakdown.some((item) => safeNumber(item?.valueBn) > 0.02)) ||
    (Array.isArray(entry?.opexBreakdown) && entry.opexBreakdown.some((item) => safeNumber(item?.valueBn) > 0.02))
  );
}

function filterQuarterKeysByClassificationPolicy(company, quarterKeys = []) {
  const policy = company?.classificationPolicy;
  if (!policy || !policy.displayOfficiallyClassifiedPeriodsOnly) return quarterKeys;
  const allowedCycles = Array.isArray(policy.displayPeriodTypes) && policy.displayPeriodTypes.length
    ? new Set(policy.displayPeriodTypes.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))
    : null;
  const requireRevenue = policy.requireDisplayRevenueClassification !== false;
  const requireExpense = !!policy.requireDisplayExpenseClassification;
  const filteredKeys = quarterKeys.filter((quarterKey) => {
    const cycle = reportingCycleForQuarterKey(quarterKey);
    if (allowedCycles && (!cycle || !allowedCycles.has(cycle))) return false;
    if (requireRevenue && !quarterHasOfficialRevenueClassification(company, quarterKey)) return false;
    if (requireExpense && !quarterHasOfficialExpenseClassification(company, quarterKey)) return false;
    return true;
  });
  return filteredKeys.length ? filteredKeys : quarterKeys;
}

function preferredQuarter(company, preferReplica) {
  const presetQuarters = Object.keys(company.statementPresets || {}).sort((left, right) => quarterSortValue(right) - quarterSortValue(left));
  if (preferReplica && presetQuarters.length) return presetQuarters[0];
  const availableQuarters = renderableQuarterKeys(company);
  if (state.selectedQuarter && availableQuarters.includes(state.selectedQuarter)) return state.selectedQuarter;
  return availableQuarters[availableQuarters.length - 1] || presetQuarters[0] || null;
}

function resolveDefaultLandingCompany() {
  const rankedCompanies = companies()
    .filter((company) => renderableQuarterKeys(company).length)
    .slice()
    .sort((left, right) => {
      const rankGap = safeNumber(left?.rank, Infinity) - safeNumber(right?.rank, Infinity);
      if (rankGap !== 0) return rankGap;
      return String(left?.ticker || "").localeCompare(String(right?.ticker || ""));
    });
  return rankedCompanies[0] || companies()[0] || null;
}

function initializeDefaultLandingSelection() {
  const company = resolveDefaultLandingCompany();
  if (!company) return;
  state.selectedCompanyId = company.id;
  state.selectedQuarter = null;
  state.chartViewMode = "sankey";
}

function syncQuarterOptions({ preferReplica } = { preferReplica: false }) {
  const company = getCompany(state.selectedCompanyId);
  if (!company || !refs.quarterSelect) return;
  const nextQuarter = preferredQuarter(company, preferReplica);
  state.selectedQuarter = nextQuarter;
  refs.quarterSelect.innerHTML = renderableQuarterKeys(company)
    .slice()
    .sort((left, right) => quarterSortValue(right) - quarterSortValue(left))
    .map((quarterKey) => `<option value="${quarterKey}" ${quarterKey === nextQuarter ? "selected" : ""}>${escapeHtml(quarterOptionLabel(company, quarterKey))}</option>`)
    .join("");
}

function summarizeCoverage(company, snapshot) {
  return "当前季度使用结构原型生成";
}

function resolveNormalizedOperatingStage(entry, grossProfitBn, costOfRevenueBn, operatingProfitBnBase) {
  const sourceOperatingExpensesBn =
    entry?.operatingExpensesBn !== null && entry?.operatingExpensesBn !== undefined ? Math.max(safeNumber(entry.operatingExpensesBn), 0) : null;
  const sourceOperatingProfitBn =
    entry?.operatingIncomeBn !== null && entry?.operatingIncomeBn !== undefined ? safeNumber(entry.operatingIncomeBn) : null;
  const revenueBn = entry?.revenueBn !== null && entry?.revenueBn !== undefined ? Math.max(safeNumber(entry.revenueBn), 0) : null;
  const disclosedOperatingExpensesBn = [entry?.sgnaBn, entry?.rndBn]
    .map((value) => (value !== null && value !== undefined ? Math.max(safeNumber(value), 0) : null))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const explicitOpexBreakdownSumBn = (
    Array.isArray(entry?.officialOpexBreakdown)
      ? entry.officialOpexBreakdown
      : Array.isArray(entry?.opexBreakdown)
        ? entry.opexBreakdown
        : []
  ).reduce((sum, item) => sum + Math.max(safeNumber(item?.valueBn), 0), 0);
  const hasGrossStage =
    revenueBn !== null &&
    grossProfitBn !== null &&
    grossProfitBn !== undefined &&
    costOfRevenueBn !== null &&
    costOfRevenueBn !== undefined;
  const totalCostsAdjustedOperatingExpensesBn =
    hasGrossStage && sourceOperatingExpensesBn !== null
      ? Math.max(sourceOperatingExpensesBn - Math.max(safeNumber(costOfRevenueBn), 0), 0)
      : null;
  const totalCostsOperatingProfitBn =
    revenueBn !== null && sourceOperatingExpensesBn !== null ? safeNumber(revenueBn) - sourceOperatingExpensesBn : null;
  const sourceLooksDerivedFromGrossBridge =
    sourceOperatingExpensesBn !== null &&
    sourceOperatingProfitBn !== null &&
    grossProfitBn !== null &&
    grossProfitBn !== undefined &&
    Math.abs(sourceOperatingProfitBn - (safeNumber(grossProfitBn) - sourceOperatingExpensesBn)) <=
      Math.max(0.35, sourceOperatingExpensesBn * 0.015);
  const totalCostsProxyLikely =
    sourceOperatingExpensesBn !== null &&
    hasGrossStage &&
    sourceOperatingExpensesBn > safeNumber(grossProfitBn) + 0.25 &&
    sourceOperatingExpensesBn <= safeNumber(revenueBn) + Math.max(0.35, safeNumber(revenueBn) * 0.02) &&
    totalCostsAdjustedOperatingExpensesBn !== null &&
    totalCostsAdjustedOperatingExpensesBn <= safeNumber(grossProfitBn) + Math.max(0.35, safeNumber(grossProfitBn) * 0.04);
  const shouldNormalizeFromTotalCosts =
    totalCostsProxyLikely &&
    !(
      explicitOpexBreakdownSumBn > 0.05 &&
      sourceOperatingExpensesBn !== null &&
      Math.abs(explicitOpexBreakdownSumBn - sourceOperatingExpensesBn) <= Math.max(0.35, explicitOpexBreakdownSumBn * 0.05)
    ) &&
    (
      sourceOperatingProfitBn === null ||
      sourceLooksDerivedFromGrossBridge ||
      (totalCostsOperatingProfitBn !== null &&
        sourceOperatingProfitBn < totalCostsOperatingProfitBn - Math.max(0.4, Math.abs(totalCostsOperatingProfitBn) * 0.08)) ||
      (disclosedOperatingExpensesBn > 0.05 && totalCostsAdjustedOperatingExpensesBn >= disclosedOperatingExpensesBn - 0.35)
    );
  if (shouldNormalizeFromTotalCosts) {
    return {
      operatingProfitBn: totalCostsOperatingProfitBn,
      operatingExpensesBn: totalCostsAdjustedOperatingExpensesBn,
      sourceReliable: false,
      reconciled: totalCostsAdjustedOperatingExpensesBn,
      source: sourceOperatingExpensesBn,
      includesCostOfRevenue: true,
    };
  }
  const operatingExpensesResolution = resolveNormalizedOperatingExpenses(entry, grossProfitBn, operatingProfitBnBase);
  return {
    operatingProfitBn: operatingProfitBnBase,
    operatingExpensesBn: operatingExpensesResolution.value,
    sourceReliable: operatingExpensesResolution.sourceReliable,
    reconciled: operatingExpensesResolution.reconciled,
    source: operatingExpensesResolution.source,
    includesCostOfRevenue: false,
  };
}

function resolveNormalizedOperatingExpenses(entry, grossProfitBn, operatingProfitBn) {
  const sourceOperatingExpensesBn =
    entry?.operatingExpensesBn !== null && entry?.operatingExpensesBn !== undefined ? Math.max(safeNumber(entry.operatingExpensesBn), 0) : null;
  const revenueBn = entry?.revenueBn !== null && entry?.revenueBn !== undefined ? Math.max(safeNumber(entry.revenueBn), 0) : null;
  const explicitOpexBreakdownSumBn = (
    Array.isArray(entry?.officialOpexBreakdown)
      ? entry.officialOpexBreakdown
      : Array.isArray(entry?.opexBreakdown)
        ? entry.opexBreakdown
        : []
  ).reduce((sum, item) => sum + Math.max(safeNumber(item?.valueBn), 0), 0);
  const reconciledOperatingExpensesBn =
    grossProfitBn !== null && grossProfitBn !== undefined && operatingProfitBn !== null && operatingProfitBn !== undefined
      ? Math.max(safeNumber(grossProfitBn) - safeNumber(operatingProfitBn), 0)
      : null;
  if (sourceOperatingExpensesBn === null && reconciledOperatingExpensesBn === null) {
    return {
      value: null,
      sourceReliable: false,
      reconciled: null,
      source: null,
    };
  }
  if (sourceOperatingExpensesBn === null) {
    return {
      value: reconciledOperatingExpensesBn,
      sourceReliable: false,
      reconciled: reconciledOperatingExpensesBn,
      source: null,
    };
  }
  if (reconciledOperatingExpensesBn === null) {
    const exceedsRevenue = revenueBn !== null && sourceOperatingExpensesBn > revenueBn + 0.25;
    const exceedsGrossProfit =
      grossProfitBn !== null && grossProfitBn !== undefined && sourceOperatingExpensesBn > safeNumber(grossProfitBn) + 0.25;
    if (exceedsRevenue || exceedsGrossProfit) {
      return {
        value: 0,
        sourceReliable: false,
        reconciled: null,
        source: sourceOperatingExpensesBn,
      };
    }
    return {
      value: sourceOperatingExpensesBn,
      sourceReliable: true,
      reconciled: null,
      source: sourceOperatingExpensesBn,
    };
  }
  const delta = Math.abs(sourceOperatingExpensesBn - reconciledOperatingExpensesBn);
  const relativeDelta = reconciledOperatingExpensesBn > 0.05 ? delta / reconciledOperatingExpensesBn : delta;
  const exceedsGrossProfit =
    grossProfitBn !== null && grossProfitBn !== undefined && sourceOperatingExpensesBn > safeNumber(grossProfitBn) + 0.25;
  const explicitBreakdownMatchesSource =
    explicitOpexBreakdownSumBn > 0.05 &&
    Math.abs(explicitOpexBreakdownSumBn - sourceOperatingExpensesBn) <= Math.max(0.35, explicitOpexBreakdownSumBn * 0.05);
  const sourceReliable =
    !exceedsGrossProfit &&
    (
      delta <= 0.25 ||
      relativeDelta <= 0.08 ||
      (explicitBreakdownMatchesSource && relativeDelta <= 0.12)
    );
  return {
    value: sourceReliable ? sourceOperatingExpensesBn : reconciledOperatingExpensesBn,
    sourceReliable,
    reconciled: reconciledOperatingExpensesBn,
    source: sourceOperatingExpensesBn,
  };
}

function resolveNormalizedNonOperating(entry, operatingProfitBn, pretaxIncomeBn) {
  const sourceNonOperatingBn =
    entry?.nonOperatingBn !== null && entry?.nonOperatingBn !== undefined ? safeNumber(entry.nonOperatingBn) : null;
  const reconciledNonOperatingBn =
    pretaxIncomeBn !== null &&
    pretaxIncomeBn !== undefined &&
    operatingProfitBn !== null &&
    operatingProfitBn !== undefined
      ? safeNumber(pretaxIncomeBn) - safeNumber(operatingProfitBn)
      : null;
  if (sourceNonOperatingBn === null && reconciledNonOperatingBn === null) {
    return {
      value: null,
      sourceReliable: false,
      reconciled: null,
      source: null,
      usePretaxResidualLabel: false,
    };
  }
  if (sourceNonOperatingBn === null) {
    return {
      value: reconciledNonOperatingBn,
      sourceReliable: false,
      reconciled: reconciledNonOperatingBn,
      source: null,
      usePretaxResidualLabel: true,
    };
  }
  if (reconciledNonOperatingBn === null) {
    return {
      value: sourceNonOperatingBn,
      sourceReliable: true,
      reconciled: null,
      source: sourceNonOperatingBn,
      usePretaxResidualLabel: false,
    };
  }
  const delta = Math.abs(sourceNonOperatingBn - reconciledNonOperatingBn);
  const relativeDelta = Math.abs(reconciledNonOperatingBn) > 0.05 ? delta / Math.abs(reconciledNonOperatingBn) : delta;
  const sourceReliable = delta <= 0.25 || relativeDelta <= 0.08;
  return {
    value: sourceReliable ? sourceNonOperatingBn : reconciledNonOperatingBn,
    sourceReliable,
    reconciled: reconciledNonOperatingBn,
    source: sourceNonOperatingBn,
    usePretaxResidualLabel: !sourceReliable,
  };
}

function resolveNormalizedPretaxIncome(entry, operatingProfitBn) {
  const sourcePretaxIncomeBn =
    entry?.pretaxIncomeBn !== null && entry?.pretaxIncomeBn !== undefined ? safeNumber(entry.pretaxIncomeBn) : null;
  const netPlusTaxPretaxBn =
    entry?.netIncomeBn !== null &&
    entry?.netIncomeBn !== undefined &&
    entry?.taxBn !== null &&
    entry?.taxBn !== undefined
      ? safeNumber(entry.netIncomeBn) + safeNumber(entry.taxBn)
      : null;
  const operatingBridgePretaxBn =
    operatingProfitBn !== null &&
    operatingProfitBn !== undefined &&
    entry?.nonOperatingBn !== null &&
    entry?.nonOperatingBn !== undefined
      ? safeNumber(operatingProfitBn) + safeNumber(entry.nonOperatingBn)
      : null;
  const alignsWith = (left, right) => {
    if (left === null || left === undefined || right === null || right === undefined) return false;
    const tolerance = Math.max(0.25, Math.abs(safeNumber(right)) * 0.05);
    return Math.abs(safeNumber(left) - safeNumber(right)) <= tolerance;
  };
  if (sourcePretaxIncomeBn === null) {
    return {
      value: netPlusTaxPretaxBn !== null ? netPlusTaxPretaxBn : operatingBridgePretaxBn,
      sourceReliable: false,
      source: null,
      reconciled: netPlusTaxPretaxBn !== null ? netPlusTaxPretaxBn : operatingBridgePretaxBn,
    };
  }
  if (alignsWith(sourcePretaxIncomeBn, netPlusTaxPretaxBn) || alignsWith(sourcePretaxIncomeBn, operatingBridgePretaxBn)) {
    return {
      value: sourcePretaxIncomeBn,
      sourceReliable: true,
      source: sourcePretaxIncomeBn,
      reconciled: sourcePretaxIncomeBn,
    };
  }
  if (netPlusTaxPretaxBn !== null) {
    return {
      value: netPlusTaxPretaxBn,
      sourceReliable: false,
      source: sourcePretaxIncomeBn,
      reconciled: netPlusTaxPretaxBn,
    };
  }
  if (operatingBridgePretaxBn !== null) {
    return {
      value: operatingBridgePretaxBn,
      sourceReliable: false,
      source: sourcePretaxIncomeBn,
      reconciled: operatingBridgePretaxBn,
    };
  }
  return {
    value: sourcePretaxIncomeBn,
    sourceReliable: true,
    source: sourcePretaxIncomeBn,
    reconciled: sourcePretaxIncomeBn,
  };
}

function buildGenericBreakdown(entry) {
  const rawItems = [];
  if (entry.rndBn && entry.rndBn > 0.05) {
    rawItems.push({
      key: "rndBn",
      name: "R&D",
      valueBn: entry.rndBn,
      color: "#E43B54",
    });
  }
  if (entry.sgnaBn && entry.sgnaBn > 0.05) {
    rawItems.push({
      key: "sgnaBn",
      name: "SG&A",
      valueBn: entry.sgnaBn,
      color: "#F15B6C",
    });
  }
  if (entry.otherOpexBn && entry.otherOpexBn > 0.05) {
    rawItems.push({
      key: "otherOpexBn",
      name: "Other OpEx",
      valueBn: entry.otherOpexBn,
      color: "#FB7185",
    });
  }
  const decorate = (item) => ({
    ...item,
    pctOfRevenue: entry.revenueBn ? (safeNumber(item.valueBn) / entry.revenueBn) * 100 : null,
    note: entry.revenueBn ? formatShareMetricNote((safeNumber(item.valueBn) / entry.revenueBn) * 100, { basis: "of revenue" }) : "",
  });
  const targetOperatingExpensesBn = Math.max(safeNumber(entry.operatingExpensesBn), 0);
  if (!rawItems.length) return [];
  if (targetOperatingExpensesBn <= 0.05) {
    return rawItems.map(decorate);
  }
  const tolerance = 0.08;
  const rawSum = rawItems.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
  const rawFitsTarget = rawItems.every((item) => safeNumber(item.valueBn) <= targetOperatingExpensesBn + tolerance);
  if (rawFitsTarget && rawSum <= targetOperatingExpensesBn + tolerance) {
    const items = rawItems.map(decorate);
    if (targetOperatingExpensesBn - rawSum > tolerance) {
      items.push(
        decorate({
          name: "Residual OpEx",
          valueBn: targetOperatingExpensesBn - rawSum,
          color: "#FB7185",
        })
      );
    }
    return items;
  }
  if (rawItems.length === 1) {
    return [
      decorate({
        ...rawItems[0],
        valueBn: Math.min(safeNumber(rawItems[0].valueBn), targetOperatingExpensesBn),
      }),
    ];
  }
  const anchoredItems = rawItems.filter(
    (item) => item.key !== "otherOpexBn" && safeNumber(item.valueBn) <= targetOperatingExpensesBn + tolerance
  );
  let anchoredSum = anchoredItems.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
  const items = [];
  if (anchoredSum > targetOperatingExpensesBn + tolerance && anchoredSum > 0) {
    const scaleFactor = targetOperatingExpensesBn / anchoredSum;
    anchoredItems.forEach((item) => {
      items.push(
        decorate({
          ...item,
          valueBn: safeNumber(item.valueBn) * scaleFactor,
        })
      );
    });
    return items;
  }
  anchoredItems.forEach((item) => items.push(decorate(item)));
  anchoredSum = items.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
  if (targetOperatingExpensesBn - anchoredSum > tolerance) {
    items.push(
      decorate({
        name: "Other OpEx",
        valueBn: targetOperatingExpensesBn - anchoredSum,
        color: "#FB7185",
      })
    );
  }
  return items;
}

function reconcileExpenseBreakdownToTarget(items, totalValueBn, options = {}) {
  return reconcileBreakdownItemsToTarget(items, totalValueBn, {
    ...options,
    residualName: "Residual OpEx",
    residualNameZh: "其他营业费用",
  });
}

function firstResolvedBreakdownNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const normalized = Number(value);
    if (!Number.isNaN(normalized)) {
      return normalized;
    }
  }
  return null;
}

function resolveOperatingExpenseBreakdown(snapshot, company, entry) {
  if (snapshot?.opexBreakdown?.length) {
    return reconcileExpenseBreakdownToTarget(snapshot.opexBreakdown, snapshot?.operatingExpensesBn, {
      fallbackSourceUrl: snapshot?.sourceUrl || null,
    });
  }
  const supplemental = supplementalComponentsFor(company, snapshot?.quarterKey || entry?.quarterKey);
  const entrySupplemental = entry?.supplementalComponents || {};
  const directBreakdown =
    entry?.officialOpexBreakdown ||
    entry?.opexBreakdown ||
    entrySupplemental?.officialOpexBreakdown ||
    entrySupplemental?.opexBreakdown ||
    supplemental?.officialOpexBreakdown ||
    supplemental?.opexBreakdown;
  const sourceUrl = supplemental?.sourceUrl || entrySupplemental?.sourceUrl || null;
  if (Array.isArray(directBreakdown) && directBreakdown.length) {
    const targetOperatingExpensesBn = firstResolvedBreakdownNumber(
      snapshot?.operatingExpensesBn,
      entry?.operatingExpensesBn,
      entrySupplemental?.operatingExpensesBn,
      supplemental?.operatingExpensesBn
    );
    return reconcileExpenseBreakdownToTarget(directBreakdown, targetOperatingExpensesBn, {
      fallbackSourceUrl: sourceUrl,
    });
  }
  const resolvedEntry = {
    ...entry,
    rndBn: firstResolvedBreakdownNumber(entry?.rndBn, entrySupplemental?.rndBn, supplemental?.rndBn),
    sgnaBn: firstResolvedBreakdownNumber(entry?.sgnaBn, entrySupplemental?.sgnaBn, supplemental?.sgnaBn),
    otherOpexBn: firstResolvedBreakdownNumber(entry?.otherOpexBn, entrySupplemental?.otherOpexBn, supplemental?.otherOpexBn),
    operatingExpensesBn: firstResolvedBreakdownNumber(
      entry?.operatingExpensesBn,
      entrySupplemental?.operatingExpensesBn,
      supplemental?.operatingExpensesBn
    ),
  };
  return buildGenericBreakdown(resolvedEntry).map((item) => ({
    ...item,
    sourceUrl: item?.sourceUrl || sourceUrl || null,
  }));
}

function resolveCollapsedSingleExpenseBreakdown(items, totalValueBn, options = {}) {
  const normalizedItems = Array.isArray(items) ? items.filter((item) => safeNumber(item?.valueBn) > 0.02) : [];
  if (normalizedItems.length !== 1) return null;
  const total = Math.max(safeNumber(totalValueBn), 0);
  const itemValue = Math.max(safeNumber(normalizedItems[0]?.valueBn), 0);
  const tolerance = Math.max(
    safeNumber(options.baseTolerance, 0.08),
    total * safeNumber(options.relativeToleranceFactor, 0.01)
  );
  if (Math.abs(itemValue - total) > tolerance) return null;
  return normalizedItems[0];
}

const UNIVERSAL_REVENUE_SEGMENT_PALETTE = [
  "#2499D5",
  "#F6C244",
  "#A8ABB4",
  "#8BCB9B",
  "#F28B52",
  "#8E6BBE",
  "#E58FA7",
  "#58B8C9",
  "#C9A66B",
  "#7A9CCF",
];

const REVENUE_STYLE_PALETTES = {
  "ad-funnel-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "alibaba-commerce-staged": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "asml-technology-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "commerce-service-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "micron-business-unit-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "oracle-revenue-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "mastercard-revenue-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "netflix-regional-revenue": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "tsmc-platform-mix": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
  "xiaomi-revenue-bridge": UNIVERSAL_REVENUE_SEGMENT_PALETTE,
};

const ORACLE_SUPPORT_LINES = {
  cloud: ["Cloud services + support"],
  software: ["License + on-prem"],
  hardware: ["Hardware systems"],
  services: ["Consulting + support"],
};

const MASTERCARD_SUPPORT_LINES = {
  paymentnetwork: ["Core payment network"],
  valueaddedservicessolutions: ["Cyber + data + loyalty"],
  valueaddedservicesandsolutions: ["Cyber + data + loyalty"],
  domesticassessments: ["Domestic assessments"],
  crossbordervolumefees: ["Cross-border fees"],
  transactionprocessing: ["Processing fees"],
  otherrevenues: ["Other revenues"],
};

const NETFLIX_REGION_SUPPORT_LINES = {
  ucan: ["US + Canada"],
  emea: ["Europe + MEA"],
  latam: ["Latin America"],
  apac: ["Asia-Pacific"],
};

const ASML_DETAIL_ORDER = {
  euv: 0,
  arfi: 1,
  arfdry: 2,
  krf: 3,
  iline: 4,
  metrologyinspection: 5,
};

const ASML_DETAIL_PALETTE = ["#1D9FD8", "#4CA8E8", "#79C3F5", "#A5D4E4", "#E9B955", "#8CB68C"];

function supportLinesForOfficialRow(style, row) {
  if (row?.supportLines?.length) return row.supportLines;
  if (style === "oracle-revenue-bridge") {
    return ORACLE_SUPPORT_LINES[row.memberKey] || null;
  }
  if (style === "mastercard-revenue-bridge") {
    return MASTERCARD_SUPPORT_LINES[row.memberKey] || null;
  }
  if (style === "netflix-regional-revenue") {
    return NETFLIX_REGION_SUPPORT_LINES[row.memberKey] || null;
  }
  return null;
}

function revenuePaletteForStyle(company, style, count) {
  const palette = REVENUE_STYLE_PALETTES[style];
  if (palette?.length) return palette.slice(0, Math.max(count, palette.length));
  return segmentPaletteForCompany(company, count);
}

function segmentPaletteForCompany(company, count) {
  const base = UNIVERSAL_REVENUE_SEGMENT_PALETTE;
  if (count <= 3) return base.slice(0, count);
  return base.slice(0, Math.min(base.length, count));
}

const SEGMENT_TOKEN_STOPWORDS = new Set([
  "and",
  "before",
  "business",
  "businesses",
  "centers",
  "company",
  "corporate",
  "corporation",
  "group",
  "groups",
  "holding",
  "holdings",
  "inc",
  "limited",
  "llc",
  "ltd",
  "operating",
  "other",
  "reportable",
  "retailing",
  "segment",
  "segments",
  "services",
  "the",
]);

function segmentTokenSet(label, company) {
  const companyTokens = new Set(
    String(company?.nameEn || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  return new Set(
    String(label || "")
      .toLowerCase()
      .replaceAll("&", " ")
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !SEGMENT_TOKEN_STOPWORDS.has(token) && !companyTokens.has(token))
  );
}

function normalizeSegmentLabel(label) {
  return String(label || "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAggregateLikeSegmentLabel(label) {
  const normalized = normalizeSegmentLabel(label);
  if (!normalized) return false;
  if (["primary", "primary segment", "reportable", "reportable segment"].includes(normalized)) return true;
  return (
    normalized === "other segments" ||
    normalized === "all other segments" ||
    normalized === "corporate non" ||
    normalized.includes("aggregation before other operating") ||
    normalized.includes("reportable aggregation") ||
    normalized.includes("segment aggregation") ||
    normalized.includes("business segments") ||
    normalized.includes("operating segments") ||
    normalized.includes("consolidated") ||
    normalized.includes("total company") ||
    normalized.includes("total segment")
  );
}

function isCombinedSegmentLabel(label, labels = []) {
  const normalized = normalizeSegmentLabel(label);
  if (!normalized.includes(" and ")) return false;
  const tokens = new Set(
    normalized
      .split(" ")
      .filter((token) => token && !SEGMENT_TOKEN_STOPWORDS.has(token))
  );
  if (tokens.size < 2) return false;
  let overlaps = 0;
  labels.forEach((other) => {
    if (!other || other === label || isAggregateLikeSegmentLabel(other)) return;
    const otherTokens = new Set(
      normalizeSegmentLabel(other)
        .split(" ")
        .filter((token) => token && !SEGMENT_TOKEN_STOPWORDS.has(token))
    );
    if (!otherTokens.size || otherTokens.size === tokens.size) return;
    if ([...otherTokens].every((token) => tokens.has(token))) {
      overlaps += 1;
    }
  });
  return overlaps >= 2;
}

function hasOtherSiblingAggregateLabel(label, labels = []) {
  const normalized = normalizeSegmentLabel(label);
  if (!normalized || normalized.startsWith("other ")) return false;
  return labels.some((other) => normalizeSegmentLabel(other) === `other ${normalized}`);
}

function segmentLabelPenalty(label) {
  const normalized = normalizeSegmentLabel(label);
  let penalty = 0;
  if (/aggregation|reportable|consolidated/.test(normalized)) penalty += 220;
  if (/before other operating/.test(normalized)) penalty += 200;
  if (/all other segments/.test(normalized)) penalty += 32;
  if (/corporate .* other|other .* corporate/.test(normalized)) penalty += 18;
  if (isAggregateLikeSegmentLabel(normalized)) penalty += 110;
  return penalty;
}

function buildResidualRevenueSegment(valueBn, sourceRows = []) {
  const residualValueBn = Number(Math.max(safeNumber(valueBn), 0).toFixed(3));
  if (residualValueBn <= 0.02) return null;
  const sourceUrl = [...(sourceRows || [])].map((item) => item?.sourceUrl).find(Boolean) || null;
  return {
    name: "Other revenue",
    memberKey: "otherrevenue",
    valueBn: residualValueBn,
    flowValueBn: residualValueBn,
    yoyPct: null,
    qoqPct: null,
    sourceUrl,
    syntheticResidual: true,
  };
}

function revenueRowCanonicalKey(company, item) {
  return canonicalBarSegmentKey(
    company?.id,
    normalizeLabelKey(item?.memberKey || item?.id || item?.name),
    item?.name || ""
  );
}

function revenueTargetCanonicalKey(company, item) {
  return canonicalBarSegmentKey(
    company?.id,
    normalizeLabelKey(item?.targetId || item?.targetName || item?.target || item?.groupName || ""),
    item?.targetName || item?.target || item?.groupName || ""
  );
}

function entryQuarterKey(company, entry) {
  if (!entry || !company?.financials) return null;
  if (parseQuarterKey(entry?.quarterKey)) return entry.quarterKey;
  const directMatch = Object.entries(company.financials).find(([, candidate]) => candidate === entry);
  if (directMatch) return directMatch[0];
  const periodEnd = String(entry?.periodEnd || "");
  const revenueBn = safeNumber(entry?.revenueBn, null);
  if (!periodEnd) return null;
  const looseMatch = Object.entries(company.financials).find(([, candidate]) => {
    if (!candidate) return false;
    if (String(candidate.periodEnd || "") !== periodEnd) return false;
    const candidateRevenueBn = safeNumber(candidate.revenueBn, null);
    return revenueBn === null || candidateRevenueBn === null ? true : Math.abs(candidateRevenueBn - revenueBn) < 0.002;
  });
  return looseMatch?.[0] || null;
}

function quarterDistanceBetween(leftQuarterKey, rightQuarterKey) {
  const leftParsed = parseQuarterKey(leftQuarterKey);
  const rightParsed = parseQuarterKey(rightQuarterKey);
  if (!leftParsed || !rightParsed) return null;
  const leftIndex = leftParsed.year * 4 + (leftParsed.quarter - 1);
  const rightIndex = rightParsed.year * 4 + (rightParsed.quarter - 1);
  return Math.abs(leftIndex - rightIndex);
}

function resolvedBarBridgeStyle(company, entry = null, structurePayload = null, candidateRows = null) {
  const explicitStyle = String(structurePayload?.style || entry?.officialRevenueStyle || "").trim().toLowerCase();
  if (explicitStyle) return explicitStyle;
  const rowsToInspect = Array.isArray(candidateRows) && candidateRows.length ? candidateRows : entry?.officialRevenueSegments || [];
  if (String(company?.id || "").toLowerCase() === "alibaba" && alibabaBarComparablePhase(rowsToInspect)) {
    return "alibaba-commerce-staged";
  }
  if (!entry) return "";
  const inferredStyle = inferredOfficialRevenueStyle(
    company,
    entry,
    rowsToInspect
  );
  return String(inferredStyle || "").trim().toLowerCase();
}

function shouldUseOfficialGroupCandidate(company, entry, structurePayload = null) {
  if (!entry) return false;
  const hasEntryDetailGroups = Array.isArray(entry?.officialRevenueDetailGroups) && entry.officialRevenueDetailGroups.some((item) => safeNumber(item?.valueBn) > 0.02);
  const hasStructureDetailGroups =
    Array.isArray(structurePayload?.detailGroups) && structurePayload.detailGroups.some((item) => safeNumber(item?.valueBn) > 0.02);
  const officialSegmentCount =
    Array.isArray(entry?.officialRevenueSegments) ? entry.officialRevenueSegments.filter((item) => safeNumber(item?.valueBn) > 0.02).length : 0;
  return !!resolvedBarBridgeStyle(company, entry, structurePayload) || hasEntryDetailGroups || hasStructureDetailGroups || officialSegmentCount >= 8;
}

function inferResidualRevenueSegment(company, entry, rows = []) {
  const revenueBn = safeNumber(entry?.revenueBn, null);
  if (!(revenueBn > 0.2) || !Array.isArray(rows) || !rows.length) return null;
  const bridgeStyle = resolvedBarBridgeStyle(company, entry, null, rows);
  if (!bridgeStyle) return null;
  const currentQuarterKey = entryQuarterKey(company, entry);
  if (
    String(company?.id || "").toLowerCase() === "alphabet" &&
    currentQuarterKey &&
    quarterSortValue(currentQuarterKey) < quarterSortValue("2021Q1")
  ) {
    return null;
  }
  const coveredRevenueBn = rows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const residualRevenueBn = revenueBn - coveredRevenueBn;
  if (residualRevenueBn <= Math.max(0.08, revenueBn * 0.06)) return null;
  const presentKeys = new Set(rows.map((item) => revenueRowCanonicalKey(company, item)).filter(Boolean));
  const blockedCandidateKeys = new Set();
  const conflictMap = BAR_RESIDUAL_INFERENCE_CONFLICTS[String(company?.id || "").toLowerCase()] || null;
  if (conflictMap) {
    presentKeys.forEach((presentKey) => {
      (conflictMap[presentKey] || []).forEach((candidateKey) => blockedCandidateKeys.add(candidateKey));
    });
  }
  const candidateScores = new Map();
  Object.entries(company?.financials || {}).forEach(([quarterKey, candidateEntry]) => {
    if (!candidateEntry || candidateEntry === entry) return;
    const candidateRows = sanitizeOfficialStructureRows(candidateEntry, candidateEntry?.officialRevenueSegments || []).filter(
      (item) => safeNumber(item?.valueBn) > 0.02
    );
    if (!candidateRows.length) return;
    const distance = quarterDistanceBetween(currentQuarterKey, quarterKey);
    const distanceWeight = distance === null ? 0.08 : 1 / Math.max(distance, 1);
    const candidateRevenueBn = safeNumber(candidateEntry?.revenueBn, null);
    candidateRows.forEach((item) => {
      const key = revenueRowCanonicalKey(company, item);
      if (!key || presentKeys.has(key) || blockedCandidateKeys.has(key) || key === "otherrevenue" || isAggregateLikeSegmentLabel(item?.name || "")) return;
      const valueShare = candidateRevenueBn > 0.02 ? clamp(safeNumber(item?.valueBn) / candidateRevenueBn, 0.04, 1.2) : 0.18;
      const existing = candidateScores.get(key) || {
        key,
        name: item?.name || "Segment",
        nameZh: item?.nameZh || "",
        score: 0,
        nearestDistance: Number.POSITIVE_INFINITY,
      };
      existing.score += distanceWeight * (0.55 + valueShare);
      existing.nearestDistance = Math.min(existing.nearestDistance, distance ?? Number.POSITIVE_INFINITY);
      if (!existing.nameZh && item?.nameZh) existing.nameZh = item.nameZh;
      candidateScores.set(key, existing);
    });
  });
  const ranked = [...candidateScores.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.nearestDistance - right.nearestDistance;
  });
  if (!ranked.length) return null;
  const topCandidate = ranked[0];
  const secondCandidate = ranked[1] || null;
  const minimumScore =
    !secondCandidate && topCandidate.nearestDistance <= 24 && bridgeStyle ? 0.28 : 0.55;
  if (topCandidate.score < minimumScore) return null;
  if (secondCandidate && topCandidate.score < secondCandidate.score * 1.18) return null;
  const meta = canonicalBarSegmentMeta(company?.id, topCandidate.key, topCandidate.name, topCandidate.nameZh || "");
  const sourceRowWithMeta = rows.find((item) => item?.filingDate || item?.periodEnd || item?.sourceUrl) || null;
  return {
    name: meta.name || topCandidate.name || "Segment",
    nameZh: meta.nameZh || topCandidate.nameZh || translateBusinessLabelToZh(topCandidate.name || "Segment"),
    memberKey: topCandidate.key,
    valueBn: Number(residualRevenueBn.toFixed(3)),
    flowValueBn: Number(residualRevenueBn.toFixed(3)),
    syntheticResidual: true,
    sourceUrl: sourceRowWithMeta?.sourceUrl || null,
    filingDate: sourceRowWithMeta?.filingDate || null,
    periodEnd: sourceRowWithMeta?.periodEnd || entry?.periodEnd || null,
  };
}

function resolveRenderableOfficialRevenueRows(company, entry, options = {}) {
  const allowNearbyInterpolation = options.allowNearbyInterpolation !== false;
  const includeSyntheticResidual = options.includeSyntheticResidual !== false;
  const revenueBn = safeNumber(entry?.revenueBn, null);
  const rawRows = sanitizeOfficialStructureRows(entry, entry?.officialRevenueSegments || [])
    .filter((item) => safeNumber(item?.valueBn) > 0.02)
    .sort((left, right) => safeNumber(right?.valueBn) - safeNumber(left?.valueBn));
  if (rawRows.length) {
    const nextRows = rawRows.map((item) => ({ ...item }));
    const inferredResidual = includeSyntheticResidual ? inferResidualRevenueSegment(company, entry, nextRows) : null;
    if (inferredResidual) {
      nextRows.push(inferredResidual);
      nextRows.sort((left, right) => safeNumber(right?.valueBn) - safeNumber(left?.valueBn));
    }
    return nextRows;
  }
  if (!allowNearbyInterpolation || !(revenueBn > 0.2)) return [];
  const currentQuarterKey = entryQuarterKey(company, entry);
  if (!currentQuarterKey) return [];
  let bestCandidate = null;
  Object.entries(company?.financials || {}).forEach(([quarterKey, candidateEntry]) => {
    if (!candidateEntry || candidateEntry === entry) return;
    const distance = quarterDistanceBetween(currentQuarterKey, quarterKey);
    if (distance === null || distance > 2) return;
    const candidateRows = resolveRenderableOfficialRevenueRows(company, candidateEntry, { allowNearbyInterpolation: false });
    if (candidateRows.length < 2) return;
    const candidateSum = candidateRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    const candidateRevenueBn = safeNumber(candidateEntry?.revenueBn, null);
    const coverageRatio = candidateRevenueBn > 0.02 ? candidateSum / candidateRevenueBn : 0;
    if (coverageRatio < 0.62 || coverageRatio > 1.18) return;
    const score = distance * 100 - candidateRows.length * 4 + Math.abs(coverageRatio - 1) * 20;
    if (!bestCandidate || score < bestCandidate.score) {
      bestCandidate = {
        score,
        rows: candidateRows,
        sourceQuarterKey: quarterKey,
      };
    }
  });
  if (!bestCandidate) return [];
  const sourceTotalBn = bestCandidate.rows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  if (!(sourceTotalBn > 0.02)) return [];
  const scale = revenueBn / sourceTotalBn;
  return bestCandidate.rows
    .map((item) => ({
      ...item,
      valueBn: Number((safeNumber(item?.valueBn) * scale).toFixed(3)),
      flowValueBn: Number((safeNumber(item?.flowValueBn ?? item?.valueBn) * scale).toFixed(3)),
      syntheticInterpolated: true,
      inferredFromQuarter: bestCandidate.sourceQuarterKey,
    }))
    .sort((left, right) => safeNumber(right?.valueBn) - safeNumber(left?.valueBn));
}

function finalizeCuratedOfficialSegments(selected, revenueBn, options = {}) {
  const preserveAllRows = options.preserveAllRows === true;
  const maxItems = 7;
  let curated = selected
    .slice()
    .sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn))
    .map((item) => ({
      ...item,
      flowValueBn: safeNumber(item.valueBn),
    }));

  if (!curated.length || revenueBn <= 0.02) return curated;

  const ensureCoverage = (rows) => {
    const sortedRows = rows
      .slice()
      .sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn))
      .map((item) => ({
        ...item,
        flowValueBn: safeNumber(item.flowValueBn ?? item.valueBn),
      }));
    if (preserveAllRows) {
      return sortedRows;
    }
    const rowsSum = sortedRows.reduce((total, item) => total + safeNumber(item.valueBn), 0);
    if (rowsSum < revenueBn - 0.08) {
      const residual = buildResidualRevenueSegment(revenueBn - rowsSum, sortedRows);
      return residual ? [...sortedRows, residual] : sortedRows;
    }
    return sortedRows;
  };

  if (curated.length > maxItems) {
    curated = ensureCoverage(curated.slice(0, maxItems - 1));
  } else {
    curated = ensureCoverage(curated);
  }

  const curatedSum = curated.reduce((total, item) => total + safeNumber(item.valueBn), 0);
  if (curatedSum > revenueBn + 0.08 && curated.length > 1) {
    if (preserveAllRows) {
      const scale = revenueBn > 0.02 && curatedSum > 0.02 ? revenueBn / curatedSum : 1;
      let runningTotal = 0;
      return curated.map((item, index) => {
        const nextFlowValue =
          index === curated.length - 1
            ? Number(Math.max(revenueBn - runningTotal, 0).toFixed(3))
            : Number((safeNumber(item.valueBn) * scale).toFixed(3));
        runningTotal += nextFlowValue;
        return {
          ...item,
          flowValueBn: nextFlowValue,
        };
      });
    }
    const kept = [];
    let runningTotal = 0;
    curated
      .filter((item) => !item.syntheticResidual)
      .forEach((item) => {
        if (kept.length >= maxItems - 1) return;
        const nextTotal = runningTotal + safeNumber(item.valueBn);
        if (nextTotal <= revenueBn + 0.04 || kept.length < 2) {
          kept.push({
            ...item,
            flowValueBn: safeNumber(item.valueBn),
          });
          runningTotal = nextTotal;
        }
      });
    const residual = buildResidualRevenueSegment(revenueBn - runningTotal, kept);
    curated = residual ? [...kept, residual] : kept;
  }
  if (preserveAllRows && curatedSum < revenueBn - 0.08 && curated.length > 1) {
    const scale = curatedSum > 0.02 ? revenueBn / curatedSum : 1;
    let runningTotal = 0;
    curated = curated.map((item, index) => {
      const nextFlowValue =
        index === curated.length - 1
          ? Number(Math.max(revenueBn - runningTotal, 0).toFixed(3))
          : Number((safeNumber(item.valueBn) * scale).toFixed(3));
      runningTotal += nextFlowValue;
      return {
        ...item,
        flowValueBn: nextFlowValue,
      };
    });
  }

  return curated;
}

function curatedOfficialSegments(company, entry, rows, detailGroups = []) {
  const revenueBn = safeNumber(entry?.revenueBn);
  const rawCandidates = [...rows].filter((item) => safeNumber(item.valueBn) > 0.02).slice(0, 12);
  const rawLabels = rawCandidates.map((item) => item.name);
  const candidates = rawCandidates.filter((item) => {
    if (rawCandidates.length < 3) return true;
    if (hasOtherSiblingAggregateLabel(item.name, rawLabels)) {
      return false;
    }
    if (isAggregateLikeSegmentLabel(item.name)) {
      return false;
    }
    if (isCombinedSegmentLabel(item.name, rawLabels)) {
      return false;
    }
    return true;
  });
  const workingCandidates = candidates.length ? candidates : rawCandidates;
  if (!workingCandidates.length || revenueBn <= 0) {
    return finalizeCuratedOfficialSegments(workingCandidates, revenueBn);
  }
  const requiredTargetKeys = new Set(
    [...(detailGroups || [])]
      .flatMap((item) => [
        normalizeLabelKey(item?.targetId || ""),
        normalizeLabelKey(item?.targetName || item?.target || item?.groupName || ""),
      ])
      .filter(Boolean)
  );
  const candidateKey = (item) => normalizeLabelKey(item?.memberKey || item?.id || item?.name);
  const requiredCandidates = workingCandidates.filter((item) => {
    const itemKeys = [candidateKey(item), normalizeLabelKey(item?.name)].filter(Boolean);
    return itemKeys.some((key) => requiredTargetKeys.has(key));
  });
  const candidateSum = workingCandidates.reduce((total, item) => total + safeNumber(item.valueBn), 0);
  const candidateRatio = candidateSum / revenueBn;
  const preserveDetailHierarchy =
    requiredCandidates.length > 0 &&
    requiredCandidates.length === requiredTargetKeys.size &&
    workingCandidates.length <= 7 &&
    candidateRatio >= 0.72 &&
    candidateRatio <= 1.18;
  const preserveFullBreakdown =
    preserveDetailHierarchy ||
    (entry?.officialRevenueStyle && candidateRatio >= 0.78 && candidateRatio <= 1.18) ||
    (workingCandidates.length >= 3 && workingCandidates.length <= 6 && candidateRatio >= 0.88 && candidateRatio <= 1.18);

  if (preserveFullBreakdown) {
    return finalizeCuratedOfficialSegments(workingCandidates, revenueBn, { preserveAllRows: true });
  }

  let best = null;
  const maxMask = 1 << workingCandidates.length;
  for (let mask = 1; mask < maxMask; mask += 1) {
    const selected = [];
    let sum = 0;
    let count = 0;
    for (let index = 0; index < workingCandidates.length; index += 1) {
      if (!(mask & (1 << index))) continue;
      selected.push(workingCandidates[index]);
      sum += safeNumber(workingCandidates[index].valueBn);
      count += 1;
    }
    if (count === 0 || count > 7 || (count === 1 && workingCandidates.length > 1)) continue;
    if (requiredCandidates.length) {
      const selectedKeys = new Set(selected.flatMap((item) => [candidateKey(item), normalizeLabelKey(item?.name)].filter(Boolean)));
      const missingRequired = [...requiredTargetKeys].some((key) => !selectedKeys.has(key));
      if (missingRequired) continue;
    }

    const ratio = sum / revenueBn;
    if (ratio < 0.45 || ratio > 1.35) continue;

    let overlapPenalty = 0;
    const tokenSets = selected.map((item) => segmentTokenSet(item.name, company));
    for (let leftIndex = 0; leftIndex < tokenSets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < tokenSets.length; rightIndex += 1) {
        const sharedCount = [...tokenSets[leftIndex]].filter((token) => tokenSets[rightIndex].has(token)).length;
        overlapPenalty += sharedCount * 28;
      }
    }

    const genericPenalty = selected.reduce((total, item) => total + segmentLabelPenalty(item.name), 0);
    const distancePenalty = Math.abs(sum - revenueBn) * 110;
    const countPenalty = count > 5 ? (count - 5) * 18 : count < 3 && workingCandidates.length > 3 ? (3 - count) * 40 : 0;
    const coveragePenalty = ratio < 0.78 ? (0.78 - ratio) * 260 : ratio > 1.08 ? (ratio - 1.08) * 360 : 0;
    const reward = count >= 3 && count <= 6 ? 44 : 0;
    const score = reward - distancePenalty - countPenalty - coveragePenalty - genericPenalty - overlapPenalty;

    if (!best || score > best.score || (Math.abs(score - best.score) < 0.01 && count < best.selected.length)) {
      best = { score, selected, sum };
    }
  }

  if (!best) return finalizeCuratedOfficialSegments(workingCandidates.slice(0, Math.min(workingCandidates.length, 7)), revenueBn);

  return finalizeCuratedOfficialSegments(best.selected, revenueBn);
}

function buildOfficialBusinessGroups(company, entry, options = {}) {
  const revenueBn = safeNumber(entry?.revenueBn);
  const official = resolveRenderableOfficialRevenueRows(company, entry, options);
  const detailGroups = sanitizeOfficialStructureRows(entry, entry.officialRevenueDetailGroups || [])
    .filter((item) => safeNumber(item.valueBn) > 0.02);
  if (!official.length) return null;
  const style = inferredOfficialRevenueStyle(company, entry, official);
  if (style === "alibaba-commerce-staged") {
    return buildAlibabaStagedBusinessGroups(company, entry);
  }
  const officialCoverageRatio = safeNumber(entry?.revenueBn) > 0 ? official.reduce((total, item) => total + safeNumber(item.valueBn), 0) / safeNumber(entry.revenueBn) : 0;
  if (!style && official.length <= 1 && officialCoverageRatio < 0.02) {
    return null;
  }
  const curated = curatedOfficialSegments(company, entry, official, detailGroups);
  if (!curated.length) {
    return null;
  }
  if ((!style && officialCoverageRatio < 0.18 && curated.length < 2) || curated.every((item) => isAggregateLikeSegmentLabel(item.name))) {
    return null;
  }
  const palette = revenuePaletteForStyle(company, style, curated.length);
  const compactMode = curated.length >= 5;
  const groups = curated.map((item, index) => {
    const memberKey = item.memberKey || item.name;
    const color = palette[index % palette.length];
    const group = {
      id: memberKey,
      name: item.name,
      nameZh: item.nameZh || translateBusinessLabelToZh(item.name),
      displayLines: wrapLines(item.name, compactMode ? 14 : 16),
      valueBn: item.valueBn,
      flowValueBn: item.flowValueBn ?? item.valueBn,
      yoyPct: item.yoyPct ?? null,
      qoqPct: item.qoqPct ?? null,
      mixPct: item.mixPct ?? null,
      mixYoyDeltaPp: item.mixYoyDeltaPp ?? null,
      metricMode: item.metricMode || null,
      operatingMarginPct: null,
      nodeColor: color,
      flowColor: rgba(color, compactMode ? 0.5 : 0.58),
      labelColor: "#55595F",
      valueColor: "#676C75",
      supportLines: supportLinesForOfficialRow(style, item),
      supportLinesZh: item.supportLinesZh || null,
      compactLabel: compactMode,
      sourceUrl: item.sourceUrl || null,
      filingDate: item.filingDate || null,
      periodEnd: item.periodEnd || entry?.periodEnd || null,
      memberKey,
    };
    if (style === "netflix-regional-revenue") {
      group.lockupKey = `region-${memberKey}`;
      group.compactLabel = true;
      group.layoutDensity = "compact";
      group.lockupScale = 0.58;
    }
    if (style === "tsmc-platform-mix") {
      group.compactLabel = true;
      group.layoutDensity = "compact";
    }
    return group;
  });
  return normalizeGroupFlowTotalsToRevenue(groups, revenueBn);
}

function buildOfficialDetailGroups(company, entry, businessGroups = null) {
  const style = inferredOfficialRevenueStyle(company, entry, entry.officialRevenueSegments || []);
  const rawDetailGroups = sanitizeOfficialStructureRows(entry, entry.officialRevenueDetailGroups || [])
    .filter((item) => safeNumber(item.valueBn) > 0.02);
  if (!rawDetailGroups.length) return null;
  const resolvedBusinessGroups = businessGroups || buildOfficialBusinessGroups(company, entry) || [];
  const businessGroupMap = new Map();
  resolvedBusinessGroups.forEach((group) => {
    [
      revenueRowCanonicalKey(company, group),
      revenueRowCanonicalKey(company, { memberKey: group?.memberKey, id: group?.id, name: group?.name }),
      normalizeLabelKey(group?.name || ""),
    ]
      .filter(Boolean)
      .forEach((key) => {
        if (!businessGroupMap.has(key)) {
          businessGroupMap.set(key, group);
        }
      });
  });
  const detailRowsByTarget = new Map();
  rawDetailGroups.forEach((item) => {
    const targetKey = revenueTargetCanonicalKey(company, item);
    if (!targetKey) return;
    if (!detailRowsByTarget.has(targetKey)) {
      detailRowsByTarget.set(targetKey, []);
    }
    detailRowsByTarget.get(targetKey).push(item);
  });
  const suppressedTargetKeys = new Set();
  detailRowsByTarget.forEach((rows, targetKey) => {
    const targetGroup = businessGroupMap.get(targetKey) || null;
    const targetValueBn = safeNumber(targetGroup?.valueBn, null);
    if (!(targetValueBn > 0.02)) return;
    const detailValueBn = rows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    const coverageRatio = detailValueBn / targetValueBn;
    if (rows.length === 1 && coverageRatio < 0.55) {
      suppressedTargetKeys.add(targetKey);
    }
  });
  const detailGroups = rawDetailGroups.filter((item) => !suppressedTargetKeys.has(revenueTargetCanonicalKey(company, item)));
  if (!detailGroups.length) return null;
  if (style === "alibaba-commerce-staged") {
    const targetGroupMap = new Map();
    resolvedBusinessGroups.forEach((group, index) => {
      [
        normalizeLabelKey(group.id || group.memberKey || group.name),
        normalizeLabelKey(group.memberKey || ""),
        normalizeLabelKey(group.name || ""),
      ]
        .filter(Boolean)
        .forEach((key) => {
          if (!targetGroupMap.has(key)) {
            targetGroupMap.set(key, { group, index });
          }
        });
    });
    const detailGroupCounts = new Map();
    detailGroups.forEach((item) => {
      const targetKey = normalizeLabelKey(item.targetId || item.targetName || item.target || item.groupName);
      detailGroupCounts.set(targetKey, (detailGroupCounts.get(targetKey) || 0) + 1);
    });
    const detailGroupIndexes = new Map();
    return detailGroups
      .slice()
      .sort((left, right) => {
        const leftTargetKey = normalizeLabelKey(left.targetId || left.targetName || left.target || left.groupName);
        const rightTargetKey = normalizeLabelKey(right.targetId || right.targetName || right.target || right.groupName);
        const targetOrder = (targetGroupMap.get(leftTargetKey)?.index ?? 999) - (targetGroupMap.get(rightTargetKey)?.index ?? 999);
        if (targetOrder !== 0) return targetOrder;
        const leftOrder = ALIBABA_DETAIL_ORDER[normalizeLabelKey(left.memberKey || left.name)] ?? 99;
        const rightOrder = ALIBABA_DETAIL_ORDER[normalizeLabelKey(right.memberKey || right.name)] ?? 99;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return safeNumber(right.valueBn) - safeNumber(left.valueBn);
      })
      .map((item) => {
        const targetKey = normalizeLabelKey(item.targetId || item.targetName || item.target || item.groupName);
        const targetInfo = targetGroupMap.get(targetKey);
        const targetGroup = targetInfo?.group || null;
        const targetId = targetGroup?.id || item.targetId || item.targetName || item.target || item.groupName;
        const groupIndex = detailGroupIndexes.get(targetId) || 0;
        const groupCount = detailGroupCounts.get(targetId) || 1;
        detailGroupIndexes.set(targetId, groupIndex + 1);
        const baseColor = targetGroup?.nodeColor || company?.brand?.primary || "#2499D5";
        const color = groupCount <= 1 ? baseColor : mixHex(baseColor, "#FFFFFF", clamp(groupIndex * 0.16, 0, 0.32));
        return {
          id: item.memberKey || item.name,
          name: item.name,
          nameZh: item.nameZh || translateBusinessLabelToZh(item.name),
          displayLines: wrapLines(item.name, 14),
          valueBn: item.valueBn,
          yoyPct: item.yoyPct ?? null,
          qoqPct: item.qoqPct ?? null,
          nodeColor: color,
          flowColor: rgba(color, 0.72),
          labelColor: color,
          valueColor: color,
          supportLines: item.supportLines || null,
          supportLinesZh: item.supportLinesZh || null,
          targetName: targetGroup?.name || item.targetName || item.target || item.groupName,
          targetId,
        };
      });
  }
  if (style === "asml-technology-bridge") {
    return detailGroups
      .slice()
      .sort((left, right) => (ASML_DETAIL_ORDER[left.memberKey] ?? 99) - (ASML_DETAIL_ORDER[right.memberKey] ?? 99))
      .map((item, index) => {
        const color = ASML_DETAIL_PALETTE[index % ASML_DETAIL_PALETTE.length];
        return {
          id: item.memberKey || item.name,
          name: item.name,
          nameZh: item.nameZh || translateBusinessLabelToZh(item.name),
          displayLines: wrapLines(item.name, 14),
          valueBn: item.valueBn,
          yoyPct: item.yoyPct ?? null,
          qoqPct: item.qoqPct ?? null,
          nodeColor: color,
          flowColor: rgba(color, 0.72),
          labelColor: "#55595F",
          valueColor: "#676C75",
          supportLines: item.supportLines || null,
          supportLinesZh: item.supportLinesZh || null,
          targetName: item.targetName || "Net system sales",
          targetId: item.targetId || item.targetName || "Net system sales",
        };
      });
  }

  const targetGroupMap = new Map();
  resolvedBusinessGroups.forEach((group, index) => {
    [
      normalizeLabelKey(group.id || group.memberKey || group.name),
      normalizeLabelKey(group.memberKey || ""),
      normalizeLabelKey(group.name || ""),
    ]
      .filter(Boolean)
      .forEach((key) => {
        if (!targetGroupMap.has(key)) {
          targetGroupMap.set(key, { group, index });
        }
      });
  });
  const detailGroupCounts = new Map();
  detailGroups.forEach((item) => {
    const targetKey = normalizeLabelKey(item.targetId || item.targetName || item.target || item.groupName);
    detailGroupCounts.set(targetKey, (detailGroupCounts.get(targetKey) || 0) + 1);
  });
  const detailGroupIndexes = new Map();
  const sortedDetailGroups = detailGroups.slice().sort((left, right) => {
    const leftTargetKey = normalizeLabelKey(left.targetId || left.targetName || left.target || left.groupName);
    const rightTargetKey = normalizeLabelKey(right.targetId || right.targetName || right.target || right.groupName);
    const targetOrder = (targetGroupMap.get(leftTargetKey)?.index ?? 999) - (targetGroupMap.get(rightTargetKey)?.index ?? 999);
    if (targetOrder !== 0) return targetOrder;
    return safeNumber(right.valueBn) - safeNumber(left.valueBn);
  });

  return sortedDetailGroups.map((item) => {
    const targetKey = normalizeLabelKey(item.targetId || item.targetName || item.target || item.groupName);
    const targetInfo = targetGroupMap.get(targetKey);
    const targetGroup = targetInfo?.group || null;
    const groupIndex = detailGroupIndexes.get(targetKey) || 0;
    const groupCount = detailGroupCounts.get(targetKey) || 1;
    detailGroupIndexes.set(targetKey, groupIndex + 1);
    const baseColor = targetGroup?.nodeColor || company?.brand?.primary || "#2499D5";
    const color = groupCount <= 1 ? baseColor : mixHex(baseColor, "#FFFFFF", clamp(groupIndex * 0.16, 0, 0.32));
    return {
      id: item.memberKey || item.name,
      name: item.name,
      nameZh: item.nameZh || translateBusinessLabelToZh(item.name),
      displayLines: wrapLines(item.name, 14),
      valueBn: item.valueBn,
      yoyPct: item.yoyPct ?? null,
      qoqPct: item.qoqPct ?? null,
      nodeColor: color,
      flowColor: rgba(color, 0.72),
      labelColor: color,
      valueColor: color,
      supportLines: item.supportLines || null,
      supportLinesZh: item.supportLinesZh || null,
      targetName: targetGroup?.name || item.targetName || item.target || item.groupName,
      targetId: item.targetId || targetGroup?.id || targetGroup?.memberKey || item.targetName || item.target || item.groupName,
    };
  });
}

function buildGenericSnapshot(company, entry, quarterKey) {
  const companyBrand = resolvedCompanyBrand(company);
  const displayConfig = resolveQuarterDisplayConfig(company, entry, null);
  const formatSnapshotBillions = (value, wrapNegative = false) =>
    formatBillionsInCurrency(safeNumber(value) * safeNumber(displayConfig.displayScaleFactor, 1), displayConfig.displayCurrency, wrapNegative);
  const grossProfitBnRaw =
    entry.grossProfitBn !== null && entry.grossProfitBn !== undefined
      ? entry.grossProfitBn
      : entry.revenueBn !== null && entry.costOfRevenueBn !== null
        ? entry.revenueBn - entry.costOfRevenueBn
        : entry.operatingIncomeBn !== null && entry.operatingExpensesBn !== null
          ? entry.operatingIncomeBn + entry.operatingExpensesBn
          : null;
  const grossProfitBn = grossProfitBnRaw !== null && grossProfitBnRaw !== undefined ? grossProfitBnRaw : null;
  const costOfRevenueBnRaw =
    entry.costOfRevenueBn !== null && entry.costOfRevenueBn !== undefined
      ? entry.costOfRevenueBn
      : entry.revenueBn !== null && grossProfitBn !== null
        ? Math.max(entry.revenueBn - grossProfitBn, 0)
        : null;
  const costOfRevenueBn = costOfRevenueBnRaw !== null && costOfRevenueBnRaw !== undefined ? costOfRevenueBnRaw : null;
  const hasRenderableGrossStage = grossProfitBn !== null && costOfRevenueBn !== null;
  const bridgeCoverageMode = hasRenderableGrossStage ? "full" : "revenue-only";
  const sourcePretaxIncomeBn =
    entry.pretaxIncomeBn !== null && entry.pretaxIncomeBn !== undefined
      ? safeNumber(entry.pretaxIncomeBn)
      : entry.netIncomeBn !== null && entry.netIncomeBn !== undefined && entry.taxBn !== null && entry.taxBn !== undefined
        ? safeNumber(entry.netIncomeBn) + safeNumber(entry.taxBn)
        : null;
  const inferredPretaxOperatingBn =
    sourcePretaxIncomeBn !== null && entry.nonOperatingBn !== null && entry.nonOperatingBn !== undefined
      ? sourcePretaxIncomeBn - safeNumber(entry.nonOperatingBn, 0)
      : entry.netIncomeBn !== null && entry.netIncomeBn !== undefined
        ? safeNumber(entry.netIncomeBn) + safeNumber(entry.taxBn, 0) - safeNumber(entry.nonOperatingBn, 0)
        : null;
  const operatingProfitBnBase =
    entry.operatingIncomeBn !== null && entry.operatingIncomeBn !== undefined
      ? entry.operatingIncomeBn
      : inferredPretaxOperatingBn;
  const operatingStageResolution = hasRenderableGrossStage
    ? resolveNormalizedOperatingStage(entry, grossProfitBn, costOfRevenueBn, operatingProfitBnBase)
    : {
        operatingProfitBn: null,
        operatingExpensesBn: null,
        sourceReliable: false,
        reconciled: null,
        source: entry?.operatingExpensesBn ?? null,
        includesCostOfRevenue: false,
      };
  const operatingProfitBn = hasRenderableGrossStage ? operatingStageResolution.operatingProfitBn : null;
  const operatingExpensesBn = hasRenderableGrossStage ? operatingStageResolution.operatingExpensesBn : null;
  const pretaxResolution = hasRenderableGrossStage
    ? resolveNormalizedPretaxIncome(entry, operatingProfitBn)
    : {
        value: sourcePretaxIncomeBn,
        sourceReliable: sourcePretaxIncomeBn !== null && sourcePretaxIncomeBn !== undefined,
        reconciled: sourcePretaxIncomeBn,
      };
  const normalizedPretaxIncomeBn = pretaxResolution.value;
  const nonOperatingResolution = hasRenderableGrossStage
    ? resolveNormalizedNonOperating(entry, operatingProfitBn, normalizedPretaxIncomeBn)
    : {
        value: entry.nonOperatingBn !== null && entry.nonOperatingBn !== undefined ? safeNumber(entry.nonOperatingBn) : null,
        sourceReliable: entry.nonOperatingBn !== null && entry.nonOperatingBn !== undefined,
        reconciled: entry.nonOperatingBn !== null && entry.nonOperatingBn !== undefined ? safeNumber(entry.nonOperatingBn) : null,
        usePretaxResidualLabel: false,
      };
  const inferredNonOperatingBnRaw = hasRenderableGrossStage ? nonOperatingResolution.value : null;
  const inferredNonOperatingBn =
    inferredNonOperatingBnRaw !== null && inferredNonOperatingBnRaw !== undefined && Math.abs(safeNumber(inferredNonOperatingBnRaw)) > 0.05
      ? Number(safeNumber(inferredNonOperatingBnRaw).toFixed(3))
      : null;
  const grossMarginPct =
    hasRenderableGrossStage && entry.grossMarginPct !== null && entry.grossMarginPct !== undefined
      ? entry.grossMarginPct
      : hasRenderableGrossStage && entry.revenueBn
        ? (safeNumber(grossProfitBn) / entry.revenueBn) * 100
        : null;
  const operatingMarginPct =
    hasRenderableGrossStage && entry.operatingMarginPct !== null && entry.operatingMarginPct !== undefined
      ? entry.operatingMarginPct
      : hasRenderableGrossStage && entry.revenueBn && operatingProfitBn !== null && operatingProfitBn !== undefined
        ? (operatingProfitBn / entry.revenueBn) * 100
        : null;
  const normalizedEntry = {
    ...entry,
    quarterKey: entry.quarterKey || quarterKey,
    grossProfitBn,
    costOfRevenueBn,
    operatingIncomeBn: operatingProfitBn,
    operatingExpensesBn,
    operatingExpensesSourceReliable: operatingStageResolution.sourceReliable,
    reconciledOperatingExpensesBn: operatingStageResolution.reconciled,
    operatingExpensesIncludesCostOfRevenue: operatingStageResolution.includesCostOfRevenue,
    nonOperatingBn: inferredNonOperatingBn,
    nonOperatingSourceReliable: nonOperatingResolution.sourceReliable,
    reconciledNonOperatingBn: nonOperatingResolution.reconciled,
    usePretaxResidualLabel: nonOperatingResolution.usePretaxResidualLabel,
    grossMarginPct,
    operatingMarginPct,
  };
  const usesFinancialFallback = String(entry.statementSource || "").includes("financial-fallback");
  const financialSourceLabel =
    entry.statementSource === "stockanalysis-financials"
      ? "Stock Analysis financials fallback"
      : usesFinancialFallback
        ? "Official-first financial pipeline"
        : "Official SEC filing financials";
  const financialSubtitle =
    entry.statementSource === "stockanalysis-financials"
      ? "Replica template data scaffold based on Stock Analysis financial statement tables."
      : usesFinancialFallback
        ? "Replica template data scaffold based on official filings with a normalized financial-table fallback for incomplete statement bridges."
      : "Replica template data scaffold based on quarterly financial statement fields.";
  const financialFootnote =
    entry.statementSource === "stockanalysis-financials"
      ? "当前桥图主干来自 Stock Analysis 财务表后备数据源，适用于验证非 SEC 公司扩展接入能力。"
      : usesFinancialFallback
      ? "当前桥图主干采用官方优先的数据流程；若官方主干字段不完整，会安全回退到标准化财务表数据，而不是凭空推断错误桥段。"
      : "模板底稿基于公开季度财务主干字段生成；若部分利润层级未直接披露，会按财报主干关系自动补齐桥图节点。";
  const operatingLossOverflowBn = hasRenderableGrossStage && operatingProfitBn < -0.02 ? Math.abs(operatingProfitBn) : 0;
  const displayOperatingExpensesBn =
    !hasRenderableGrossStage
      ? null
      : operatingLossOverflowBn > 0
      ? Math.min(Math.max(safeNumber(operatingExpensesBn), 0), Math.max(safeNumber(grossProfitBn), 0))
      : Math.max(safeNumber(operatingExpensesBn), 0);
  const resolvedFinancialFootnote =
    !hasRenderableGrossStage
      ? `${financialFootnote} 当前季度缺少可稳定还原毛利桥的财务主干字段，因此仅保留营收结构，不再伪造利润桥节点。`
      : operatingLossOverflowBn > 0
      ? `${financialFootnote} 当前季度实际营业费用为 ${formatSnapshotBillions(operatingExpensesBn)}；其中 ${formatSnapshotBillions(displayOperatingExpensesBn)} 由毛利覆盖，超出的 ${formatSnapshotBillions(operatingLossOverflowBn)} 会在净利桥中单列为营业亏损。`
      : financialFootnote;
  const positiveAdjustments = [];
  const belowOperatingItems = [];
  if (hasRenderableGrossStage && operatingLossOverflowBn > 0.05) {
    belowOperatingItems.push({
      name: "Operating loss overflow",
      nameZh: "超出毛利的营业费用",
      valueBn: Math.abs(operatingLossOverflowBn),
      color: "#D92D20",
    });
  }
  if (hasRenderableGrossStage && inferredNonOperatingBn) {
    const residualPositiveLabel = {
      name: "Other pretax gain",
      nameZh: "其他税前收益",
    };
    const residualNegativeLabel = {
      name: "Other pretax expense",
      nameZh: "其他税前费用",
    };
    const standardPositiveLabel = {
      name: "Non-operating gain",
      nameZh: "营业外收益",
    };
    const standardNegativeLabel = {
      name: "Non-operating",
      nameZh: "营业外费用",
    };
    const positiveLabel = normalizedEntry.usePretaxResidualLabel ? residualPositiveLabel : standardPositiveLabel;
    const negativeLabel = normalizedEntry.usePretaxResidualLabel ? residualNegativeLabel : standardNegativeLabel;
    if (inferredNonOperatingBn > 0.05) {
      positiveAdjustments.push({
        name: positiveLabel.name,
        nameZh: positiveLabel.nameZh,
        valueBn: Math.abs(inferredNonOperatingBn),
        color: "#16A34A",
      });
    } else if (inferredNonOperatingBn < -0.05) {
      belowOperatingItems.push({
        name: negativeLabel.name,
        nameZh: negativeLabel.nameZh,
        valueBn: Math.abs(inferredNonOperatingBn),
        color: "#D92D20",
      });
    }
  }
  if (hasRenderableGrossStage && entry.taxBn && entry.taxBn > 0.05) {
    belowOperatingItems.push({
      name: "Tax",
      valueBn: Math.abs(entry.taxBn),
      color: "#D92D20",
    });
  } else if (hasRenderableGrossStage && entry.taxBn && entry.taxBn < -0.05) {
    positiveAdjustments.push({
      name: "Tax benefit",
      valueBn: Math.abs(entry.taxBn),
      color: "#16A34A",
    });
  }
  const explicitPositiveBridgeBn = positiveAdjustments.reduce((sum, item) => sum + Math.max(safeNumber(item?.valueBn), 0), 0);
  const explicitNegativeBridgeBn = belowOperatingItems.reduce((sum, item) => sum + Math.max(safeNumber(item?.valueBn), 0), 0);
  const operatingBridgeBaseBn = operatingLossOverflowBn > 0 ? 0 : safeNumber(operatingProfitBn);
  const accountedNetBridgeBn = operatingBridgeBaseBn + explicitPositiveBridgeBn - explicitNegativeBridgeBn;
  const targetNetBridgeBn = safeNumber(entry.netIncomeBn, null);
  const netBridgeResidualBn =
    targetNetBridgeBn !== null && targetNetBridgeBn !== undefined ? Number((targetNetBridgeBn - accountedNetBridgeBn).toFixed(3)) : null;
  const netBridgeResidualTolerance =
    targetNetBridgeBn !== null && targetNetBridgeBn !== undefined ? Math.max(0.08, Math.abs(targetNetBridgeBn) * 0.01) : 0;
  if (hasRenderableGrossStage && netBridgeResidualBn !== null && Math.abs(netBridgeResidualBn) > netBridgeResidualTolerance) {
    if (netBridgeResidualBn > 0) {
      positiveAdjustments.push({
        name: "Other net bridge gain",
        nameZh: "其他净利调整收益",
        valueBn: Math.abs(netBridgeResidualBn),
        color: "#16A34A",
      });
    } else {
      belowOperatingItems.push({
        name: "Other net bridge expense",
        nameZh: "其他净利调整费用",
        valueBn: Math.abs(netBridgeResidualBn),
        color: "#D92D20",
      });
    }
  }
  return {
    mode: "template-base",
    modeLabel: "高精复刻版",
    sourceLabel: financialSourceLabel,
    coverageLabel: "结构原型 + 高精模板",
    title: `${company.nameEn} ${compactFiscalLabel(entry.fiscalLabel) || entry.fiscalLabel || quarterKey} Income Statement`,
    subtitle: financialSubtitle,
    quarterSummary: compactFiscalLabel(entry.fiscalLabel) || quarterKey,
    periodEndLabel: formatPeriodEndLabel(entry.periodEnd) || entry.periodEnd || "",
    companyLogoKey: company.id,
    companyName: company.nameEn,
    companyDisplayName: companyDisplay(company),
    ticker: company.ticker,
    quarterKey,
    fiscalLabel: entry.fiscalLabel || quarterKey,
    displayCurrency: displayConfig.displayCurrency,
    sourceCurrency: displayConfig.sourceCurrency,
    displayScaleFactor: displayConfig.displayScaleFactor,
    usesFxConversion: displayConfig.usesFxConversion,
    bridgeCoverageMode,
    businessGroups: [
      {
        name: "Reported revenue",
        displayLines: [company.nameEn],
        lockupKey: company.id,
        valueBn: entry.revenueBn,
        yoyPct: entry.revenueYoyPct,
        qoqPct: entry.revenueQoqPct,
        operatingMarginPct,
        nodeColor: companyBrand.primary,
        flowColor: rgba(companyBrand.primary, 0.55),
      },
    ],
    revenueBn: entry.revenueBn,
    revenueYoyPct: entry.revenueYoyPct,
    revenueQoqPct: entry.revenueQoqPct,
    grossProfitBn,
    grossMarginPct,
    grossMarginYoyDeltaPp: entry.grossMarginYoyDeltaPp,
    costOfRevenueBn,
    operatingProfitBn,
    nonOperatingBn: inferredNonOperatingBn,
    operatingMarginPct,
    operatingMarginYoyDeltaPp: entry.operatingMarginYoyDeltaPp,
    operatingExpensesBn,
    displayOperatingExpensesBn,
    operatingLossOverflowBn,
    netProfitBn: entry.netIncomeBn,
    pretaxIncomeBn: normalizedPretaxIncomeBn,
    netMarginPct: entry.profitMarginPct,
    netMarginYoyDeltaPp: entry.profitMarginYoyDeltaPp,
    opexBreakdown: hasRenderableGrossStage
      ? resolveOperatingExpenseBreakdown(null, company, {
          ...normalizedEntry,
          operatingExpensesBn: displayOperatingExpensesBn,
        })
      : [],
    positiveAdjustments,
    belowOperatingItems,
    footnote: resolvedFinancialFootnote,
  };
}

function buildHistoryHarmonizedBusinessGroups(company, quarterKey) {
  if (!company || !quarterKey) return null;
  const maxQuarters = Math.max((Array.isArray(company?.quarters) ? company.quarters.length : 0) + 8, 40);
  const history = buildRevenueSegmentBarHistory(company, quarterKey, maxQuarters, { includeAllQuarters: true });
  const quarter = history?.quarters?.find((item) => item.quarterKey === quarterKey);
  const displayScaleFactor = Math.max(safeNumber(quarter?.displayScaleFactor, 1), 0.000001);
  const rawRows = Array.isArray(quarter?.segmentRows) ? quarter.segmentRows : [];
  const candidateRows = rawRows.filter((item) => item?.key !== "reportedrevenue" && safeNumber(item?.valueBn) > 0.02);
  if (candidateRows.length < 2) return null;
  const compactMode = candidateRows.length >= 5;
  return candidateRows.map((item, index) => {
    const key = canonicalBarSegmentKey(company?.id, item?.key || item?.id || item?.name, item?.name || "");
    const canonicalMeta = canonicalBarSegmentMeta(company?.id, key, item?.name || "Segment", item?.nameZh || "");
    const color = history?.colorBySegment?.[key] || stableBarColorMap(company?.id, candidateRows.map((row) => row.key || row.id || row.name))[key];
    return {
      id: key,
      memberKey: key,
      name: canonicalMeta.name || item?.name || "Segment",
      nameZh: canonicalMeta.nameZh || item?.nameZh || translateBusinessLabelToZh(item?.name || "Segment"),
      displayLines: wrapLines(canonicalMeta.name || item?.name || "Segment", compactMode ? 14 : 16),
      valueBn: Number((safeNumber(item?.valueBn) / displayScaleFactor).toFixed(3)),
      yoyPct: null,
      qoqPct: null,
      mixPct: null,
      operatingMarginPct: null,
      nodeColor: color,
      flowColor: rgba(color, compactMode ? 0.5 : 0.58),
      labelColor: "#55595F",
      valueColor: "#676C75",
      compactLabel: compactMode,
      sourceUrl: null,
      filingDate: quarter?.entry?.statementFilingDate || null,
      periodEnd: quarter?.entry?.periodEnd || null,
    };
  });
}

function buildReplicaTemplateSnapshot(company, entry, quarterKey) {
  const companyBrand = resolvedCompanyBrand(company);
  const snapshot = buildGenericSnapshot(company, entry, quarterKey);
  const officialBusinessGroups = buildOfficialBusinessGroups(company, entry);
  const officialDetailGroups = buildOfficialDetailGroups(company, entry, officialBusinessGroups);
  const historyHarmonizedBusinessGroups = !officialBusinessGroups ? buildHistoryHarmonizedBusinessGroups(company, quarterKey) : null;
  const resolvedBusinessGroups = officialBusinessGroups || historyHarmonizedBusinessGroups;
  const fallbackSourceLabel = entry.statementSource === "stockanalysis-financials" ? "Stock Analysis financials fallback" : "Replica-style auto template";
  const fallbackSubtitle =
    entry.statementSource === "stockanalysis-financials"
      ? "Replica-style layout auto-generated from Stock Analysis financial statement tables."
      : "Replica-style layout auto-generated from quarterly statement data.";
  const fallbackFootnote =
    entry.statementSource === "stockanalysis-financials"
      ? "统一模板会复用模板集的版式语言，并以 Stock Analysis 财务表后备数据生成非 SEC 公司的利润桥。"
      : "统一模板会复用模板集的版式语言，并按当前公司的真实季度财务数据自动排版。";
  const structureFootnote = officialBusinessGroups
    ? "统一模板会复用模板集的版式语言，并优先使用官方财报披露的营收结构数据自动排版。"
    : historyHarmonizedBusinessGroups
      ? `${fallbackFootnote} 当前季度的左侧营收分类由历史分部口径统一回填，以避免同一季度因观察窗口变化而丢失分类。`
      : fallbackFootnote;
  return {
    ...snapshot,
    businessGroups: resolvedBusinessGroups || snapshot.businessGroups.map((item) => ({
      ...item,
      displayLines: item.displayLines?.length ? item.displayLines : wrapLines(company.nameEn, 14),
      flowColor: item.flowColor || rgba(companyBrand.primary, 0.28),
    })),
    leftDetailGroups: officialDetailGroups || null,
    officialRevenueStyle: inferredOfficialRevenueStyle(company, entry, officialBusinessGroups || historyHarmonizedBusinessGroups || entry.officialRevenueSegments || []) || null,
    displayCurrency: snapshot.displayCurrency,
    sourceCurrency: snapshot.sourceCurrency,
    displayScaleFactor: snapshot.displayScaleFactor || 1,
    usesFxConversion: snapshot.usesFxConversion,
    compactSourceLabels: entry.officialRevenueStyle === "netflix-regional-revenue" ? true : snapshot.compactSourceLabels,
    mode: "replica-template",
    modeLabel: "高精复刻版",
    sourceLabel: officialBusinessGroups ? "Official filings segment data" : historyHarmonizedBusinessGroups ? "History-harmonized revenue structure" : fallbackSourceLabel,
    coverageLabel: "结构原型 + 高精模板",
    subtitle: officialBusinessGroups
      ? "Replica-style layout auto-generated from quarterly statement data and official filing segment disclosures."
      : historyHarmonizedBusinessGroups
        ? "Replica-style layout auto-generated from quarterly statement data and history-harmonized segment taxonomy."
      : fallbackSubtitle,
    footnote: snapshot.bridgeCoverageMode === "revenue-only" ? `${snapshot.footnote} ${structureFootnote}` : structureFootnote,
  };
}

function mergeOfficialRevenueStructureIntoSnapshot(snapshot, company, entry) {
  if (!entry) return snapshot;
  const officialBusinessGroups = buildOfficialBusinessGroups(company, entry);
  const officialDetailGroups = buildOfficialDetailGroups(company, entry, officialBusinessGroups);
  const historyHarmonizedBusinessGroups = !officialBusinessGroups ? buildHistoryHarmonizedBusinessGroups(company, snapshot?.quarterKey || entryQuarterKey(company, entry)) : null;
  if (!officialBusinessGroups && !officialDetailGroups && !historyHarmonizedBusinessGroups) return snapshot;
  return {
    ...snapshot,
    businessGroups: officialBusinessGroups || historyHarmonizedBusinessGroups || snapshot.businessGroups,
    leftDetailGroups: officialDetailGroups || snapshot.leftDetailGroups || null,
    officialRevenueStyle:
      inferredOfficialRevenueStyle(company, entry, officialBusinessGroups || historyHarmonizedBusinessGroups || entry.officialRevenueSegments || []) ||
      snapshot.officialRevenueStyle ||
      null,
    displayCurrency: snapshot.displayCurrency,
    sourceCurrency: snapshot.sourceCurrency,
    displayScaleFactor: snapshot.displayScaleFactor || 1,
    usesFxConversion: snapshot.usesFxConversion,
    sourceLabel: officialBusinessGroups ? "Official filings segment data" : "History-harmonized revenue structure",
    coverageLabel: "结构原型 + 高精模板",
    footnote: snapshot.bridgeCoverageMode === "revenue-only"
      ? officialBusinessGroups
        ? `${snapshot.footnote} 该季度左侧营收结构直接取自官方财报分部披露。`
        : snapshot.footnote?.includes("历史分部口径统一回填")
          ? snapshot.footnote
          : `${snapshot.footnote} 当前季度的左侧营收分类由历史分部口径统一回填，以避免同一季度因观察窗口变化而丢失分类。`
      : officialBusinessGroups || snapshot.footnote?.includes("历史分部口径统一回填")
        ? snapshot.footnote
        : `${snapshot.footnote} 当前季度的左侧营收分类由历史分部口径统一回填，以避免同一季度因观察窗口变化而丢失分类。`,
  };
}

function buildSnapshot(company, quarterKey) {
  const entry = company.financials?.[quarterKey];
  const preset = company.statementPresets?.[quarterKey];
  if (!entry && !preset) return null;
  if (preset) {
    return applyTemplateTokensToSnapshot(
      applyPrototypeLanguage(
        mergeOfficialRevenueStructureIntoSnapshot(
          {
            ...preset,
            mode: "pixel-replica",
            modeLabel: "高精复刻版",
            sourceLabel: "Calibrated prototype + quarterly statement",
            coverageLabel: "结构原型 + 高精模板",
            companyName: company.nameEn,
            companyDisplayName: companyDisplay(company),
            ticker: company.ticker,
            quarterKey,
            fiscalLabel: entry?.fiscalLabel || preset.quarterSummary || quarterKey,
            revenueQoqPct: preset.revenueQoqPct ?? entry?.revenueQoqPct ?? null,
          },
          company,
          entry
        ),
        company,
        entry
      ),
      company
    );
  }
  if (entry) {
    return applyTemplateTokensToSnapshot(applyPrototypeLanguage(buildReplicaTemplateSnapshot(company, entry, quarterKey), company, entry), company);
  }
  return null;
}

function entryHasSuspiciousOperatingStageMismatch(primaryEntry, fallbackEntry = null) {
  if (!fallbackEntry) return false;
  const compareWithinTolerance = (leftValue, rightValue, baseTolerance = 0.12, relativeFactor = 0.012) => {
    if (leftValue === null || leftValue === undefined || rightValue === null || rightValue === undefined) return true;
    const left = safeNumber(leftValue);
    const right = safeNumber(rightValue);
    return Math.abs(left - right) <= Math.max(baseTolerance, Math.max(Math.abs(left), Math.abs(right)) * relativeFactor);
  };
  const revenueAligned = compareWithinTolerance(primaryEntry?.revenueBn, fallbackEntry?.revenueBn, 0.12, 0.006);
  const grossAligned = compareWithinTolerance(primaryEntry?.grossProfitBn, fallbackEntry?.grossProfitBn, 0.12, 0.008);
  const pretaxAligned = compareWithinTolerance(primaryEntry?.pretaxIncomeBn, fallbackEntry?.pretaxIncomeBn, 0.18, 0.012);
  const taxAligned = compareWithinTolerance(primaryEntry?.taxBn, fallbackEntry?.taxBn, 0.18, 0.02);
  const netAligned = compareWithinTolerance(primaryEntry?.netIncomeBn, fallbackEntry?.netIncomeBn, 0.18, 0.012);
  if (!(revenueAligned && grossAligned && pretaxAligned && taxAligned && netAligned)) {
    return false;
  }
  const fallbackGrossProfitBn = safeNumber(fallbackEntry?.grossProfitBn, null);
  const fallbackOperatingExpensesBn = safeNumber(fallbackEntry?.operatingExpensesBn, null);
  const fallbackOperatingIncomeBn = safeNumber(fallbackEntry?.operatingIncomeBn, null);
  if (
    fallbackGrossProfitBn === null ||
    fallbackOperatingExpensesBn === null ||
    fallbackOperatingIncomeBn === null
  ) {
    return false;
  }
  const fallbackExpectedOperatingExpensesBn = Math.max(fallbackGrossProfitBn - fallbackOperatingIncomeBn, 0);
  const fallbackBridgeSane =
    Math.abs(fallbackOperatingExpensesBn - fallbackExpectedOperatingExpensesBn) <=
    Math.max(0.35, fallbackGrossProfitBn * 0.03);
  if (!fallbackBridgeSane) {
    return false;
  }
  const primaryOperatingExpensesBn = safeNumber(primaryEntry?.operatingExpensesBn, null);
  const primaryOperatingIncomeBn = safeNumber(primaryEntry?.operatingIncomeBn, null);
  const primaryNonOperatingBn = safeNumber(primaryEntry?.nonOperatingBn, null);
  const fallbackNonOperatingBn = safeNumber(fallbackEntry?.nonOperatingBn, null);
  const operatingExpensesGap =
    primaryOperatingExpensesBn === null
      ? 0
      : Math.abs(primaryOperatingExpensesBn - fallbackOperatingExpensesBn);
  const operatingIncomeGap =
    primaryOperatingIncomeBn === null
      ? 0
      : Math.abs(primaryOperatingIncomeBn - fallbackOperatingIncomeBn);
  const nonOperatingGap =
    primaryNonOperatingBn === null || fallbackNonOperatingBn === null
      ? 0
      : Math.abs(primaryNonOperatingBn - fallbackNonOperatingBn);
  const operatingExpensesMismatch =
    primaryOperatingExpensesBn !== null &&
    operatingExpensesGap > Math.max(1.2, Math.abs(fallbackOperatingExpensesBn) * 0.24);
  const operatingIncomeMismatch =
    primaryOperatingIncomeBn !== null &&
    operatingIncomeGap > Math.max(1.2, Math.abs(fallbackOperatingIncomeBn) * 0.24 + 0.4);
  const nonOperatingMismatch =
    primaryNonOperatingBn !== null &&
    fallbackNonOperatingBn !== null &&
    nonOperatingGap > Math.max(1.2, Math.abs(fallbackNonOperatingBn) * 0.4 + 0.4);
  return operatingExpensesMismatch || operatingIncomeMismatch || nonOperatingMismatch;
}

function mergeFinancialEntryFallback(primaryEntry, fallbackEntry) {
  if (!primaryEntry) return fallbackEntry ? { ...fallbackEntry } : primaryEntry;
  if (!fallbackEntry) return primaryEntry;
  const mergedEntry = { ...fallbackEntry, ...primaryEntry };
  Object.entries(fallbackEntry).forEach(([key, value]) => {
    const primaryValue = primaryEntry[key];
    if ((primaryValue === null || primaryValue === undefined || Number.isNaN(primaryValue)) && value !== null && value !== undefined) {
      mergedEntry[key] = value;
    }
  });
  const primaryMissingGrossStage =
    (primaryEntry.costOfRevenueBn === null || primaryEntry.costOfRevenueBn === undefined) &&
    (primaryEntry.grossProfitBn === null || primaryEntry.grossProfitBn === undefined);
  const fallbackHasCompleteBridge =
    fallbackEntry.revenueBn !== null &&
    fallbackEntry.revenueBn !== undefined &&
    fallbackEntry.costOfRevenueBn !== null &&
    fallbackEntry.costOfRevenueBn !== undefined &&
    fallbackEntry.grossProfitBn !== null &&
    fallbackEntry.grossProfitBn !== undefined;
  const primaryRevenueBn = safeNumber(primaryEntry.revenueBn, null);
  const primaryOpexBn = safeNumber(primaryEntry.operatingExpensesBn, null);
  const officialSegmentTotalBn = Array.isArray(primaryEntry.officialRevenueSegments)
    ? primaryEntry.officialRevenueSegments.reduce((sum, item) => sum + Math.max(safeNumber(item?.valueBn), 0), 0)
    : 0;
  const primaryBridgeLooksBroken =
    (primaryRevenueBn !== null && primaryOpexBn !== null && primaryOpexBn > primaryRevenueBn + 0.25) ||
    (primaryRevenueBn !== null && officialSegmentTotalBn > primaryRevenueBn + Math.max(0.25, primaryRevenueBn * 0.08));
  const primaryOperatingStageMismatch = entryHasSuspiciousOperatingStageMismatch(primaryEntry, fallbackEntry);
  if (primaryMissingGrossStage && fallbackHasCompleteBridge && primaryBridgeLooksBroken) {
    [
      "revenueBn",
      "revenueYoyPct",
      "revenueQoqPct",
      "costOfRevenueBn",
      "grossProfitBn",
      "grossMarginPct",
      "grossMarginYoyDeltaPp",
      "sgnaBn",
      "rndBn",
      "otherOpexBn",
      "operatingExpensesBn",
      "operatingIncomeBn",
      "operatingMarginPct",
      "operatingMarginYoyDeltaPp",
      "nonOperatingBn",
      "pretaxIncomeBn",
      "taxBn",
      "netIncomeBn",
      "netIncomeYoyPct",
      "profitMarginPct",
      "profitMarginYoyDeltaPp",
      "effectiveTaxRatePct",
    ].forEach((key) => {
      const fallbackValue = fallbackEntry[key];
      if (fallbackValue !== null && fallbackValue !== undefined && !Number.isNaN(Number(fallbackValue))) {
        mergedEntry[key] = fallbackValue;
      }
    });
    mergedEntry.statementSource = `${primaryEntry.statementSource || "official"}+financial-fallback`;
  }
  if (primaryOperatingStageMismatch) {
    [
      "sgnaBn",
      "rndBn",
      "otherOpexBn",
      "operatingExpensesBn",
      "operatingIncomeBn",
      "operatingMarginPct",
      "operatingMarginYoyDeltaPp",
      "nonOperatingBn",
      "pretaxIncomeBn",
      "taxBn",
      "netIncomeBn",
      "netIncomeYoyPct",
      "profitMarginPct",
      "profitMarginYoyDeltaPp",
      "effectiveTaxRatePct",
    ].forEach((key) => {
      const fallbackValue = fallbackEntry[key];
      if (fallbackValue !== null && fallbackValue !== undefined && !Number.isNaN(Number(fallbackValue))) {
        mergedEntry[key] = fallbackValue;
      }
    });
    mergedEntry.statementSource = `${primaryEntry.statementSource || "official"}+operating-stage-fallback`;
  }
  return mergedEntry;
}

function mergeCompanyFinancialFallback(company, fallbackCompany) {
  if (!fallbackCompany?.financials) return company;
  const quarterKeys = [...new Set([...(company.quarters || []), ...(fallbackCompany.quarters || [])])].sort();
  const mergedFinancials = {};
  quarterKeys.forEach((quarterKey) => {
    const primaryEntry = company.financials?.[quarterKey];
    const fallbackEntry = fallbackCompany.financials?.[quarterKey];
    const mergedEntry = mergeFinancialEntryFallback(primaryEntry, fallbackEntry);
    if (mergedEntry) {
      mergedFinancials[quarterKey] = mergedEntry;
    }
  });
  return {
    ...company,
    quarters: quarterKeys,
    financials: mergedFinancials,
  };
}

async function enrichDatasetWithFinancialFallbacks() {
  if (!state.sortedCompanies.length) return;
  const enrichedCompanies = await Promise.all(
    state.sortedCompanies.map(async (company) => {
      try {
        const response = await fetchJson(`./data/cache/${company.id}.json?v=${BUILD_ASSET_VERSION}`);
        if (!response.ok) return company;
        const fallbackCompany = await response.json();
        return mergeCompanyFinancialFallback(company, fallbackCompany);
      } catch (_error) {
        return company;
      }
    })
  );
  state.sortedCompanies = enrichedCompanies.map((company, index) => normalizeLoadedCompany(company, index)).sort((left, right) => left.rank - right.rank);
  state.companyById = Object.fromEntries(state.sortedCompanies.map((company) => [company.id, company]));
  if (state.dataset) {
    state.dataset.companies = state.sortedCompanies;
  }
}

function renderCoverage() {
  return;
}

const BAR_SEGMENT_COLOR_POOL = [
  "#2B8AE8",
  "#F6B400",
  "#17B890",
  "#F05D5E",
  "#8A63D2",
  "#2D9CDB",
  "#F2994A",
  "#27AE60",
  "#6D5BD0",
  "#5B6472",
];

const BAR_COMPANY_PALETTE_OVERRIDES = Object.freeze({
  microsoft: Object.freeze([
    "#00A4EF",
    "#7FBA00",
    "#FFB900",
    "#F25022",
    "#6B7280",
    "#2F6E5A",
    "#2E5CB8",
    "#B15B3E",
  ]),
  apple: Object.freeze([
    "#616975",
    "#2F6BD8",
    "#E5A52C",
    "#5A9D7D",
    "#7A69B2",
    "#A3ADBA",
    "#3A4E7A",
    "#9C6F3C",
  ]),
  amazon: Object.freeze([
    "#146EB4",
    "#FF9900",
    "#1FA8A2",
    "#5B6472",
    "#7B57D1",
    "#2E7D32",
    "#F6A23B",
    "#2B8AE8",
  ]),
  broadcom: Object.freeze([
    "#D62828",
    "#1F4DBD",
    "#20A39E",
    "#F4A259",
    "#7358D8",
    "#5B6472",
    "#2E8F63",
    "#F05D5E",
  ]),
  tencent: Object.freeze([
    "#1D9BF0",
    "#13A9B8",
    "#F4B400",
    "#6B7280",
    "#34A853",
    "#7A5AF5",
    "#FF7A59",
    "#2F6BD8",
  ]),
  visa: Object.freeze([
    "#1434CB",
    "#F7B600",
    "#2D9CDB",
    "#5B6472",
    "#3E63DD",
    "#F2994A",
    "#17B890",
    "#6D5BD0",
  ]),
});

const BAR_SEGMENT_CANONICAL_BY_COMPANY = Object.freeze({
  alphabet: Object.freeze({
    googleinc: "googleservices",
    googleservices: "googleservices",
    allothersegments: "othersegments",
    othersegments: "othersegments",
    otherrevenue: "otherrevenue",
    other: "otherrevenue",
  }),
  jnj: Object.freeze({
    pharmaceutical: "innovativemedicine",
    medicaldevices: "medtech",
    medicaldevicesdiagnostics: "medtech",
  }),
  berkshire: Object.freeze({
    serviceandretailingbusinesses: "serviceretailbusinesses",
    serviceandretailbusinesses: "serviceretailbusinesses",
  }),
  tesla: Object.freeze({
    automotive: "auto",
    automotivebusiness: "auto",
    automobile: "auto",
  }),
  costco: Object.freeze({
    foodsundries: "foodssundries",
    freshfood: "freshfoods",
  }),
  palantir: Object.freeze({
    commercialoperating: "commercial",
  }),
  walmart: Object.freeze({
    samsclubus: "samsclub",
  }),
  micron: Object.freeze({
    cnbu: "microncomputedatacenter",
    cdbu: "microncomputedatacenter",
    mbu: "micronmobileclient",
    mcbu: "micronmobileclient",
    sbu: "micronstoragecloudmemory",
    cmbu: "micronstoragecloudmemory",
    ebu: "micronautoembedded",
    aebu: "micronautoembedded",
    allothersegments: "othersegments",
  }),
});

const BAR_SEGMENT_ROLLUPS_BY_COMPANY = Object.freeze({
  costco: Object.freeze({
    nonfoods: Object.freeze(["hardlines", "softlines"]),
  }),
});

const BAR_SEGMENT_LABEL_OVERRIDES = Object.freeze({
  googleservices: Object.freeze({ name: "Google Services", nameZh: "Google 服务" }),
  othersegments: Object.freeze({ name: "Other segments", nameZh: "其他分部" }),
  otherrevenue: Object.freeze({ name: "Other revenue", nameZh: "其他营收" }),
  nonfoods: Object.freeze({ name: "Non Foods", nameZh: "非食品" }),
  microncomputedatacenter: Object.freeze({ name: "Compute & Data Center", nameZh: "计算与数据中心" }),
  micronmobileclient: Object.freeze({ name: "Mobile & Client", nameZh: "移动与客户端" }),
  micronstoragecloudmemory: Object.freeze({ name: "Storage & Cloud Memory", nameZh: "存储与云内存" }),
  micronautoembedded: Object.freeze({ name: "Auto & Embedded", nameZh: "汽车与嵌入式" }),
  alibabacommerce: Object.freeze({ name: "Commerce", nameZh: "商业" }),
  alibabacloud: Object.freeze({ name: "Cloud", nameZh: "云业务" }),
  alibabaothers: Object.freeze({ name: "All others", nameZh: "其他业务" }),
  innovativemedicine: Object.freeze({ name: "Innovative Medicine", nameZh: "创新药" }),
  medtech: Object.freeze({ name: "Med Tech", nameZh: "医疗科技" }),
  serviceretailbusinesses: Object.freeze({ name: "Service & Retail businesses", nameZh: "服务与零售业务" }),
  iphone: Object.freeze({ name: "iPhone", nameZh: "iPhone" }),
  mac: Object.freeze({ name: "Mac", nameZh: "Mac" }),
  ipad: Object.freeze({ name: "iPad", nameZh: "iPad" }),
  wearables: Object.freeze({ name: "Wearables", nameZh: "可穿戴设备" }),
  samsclub: Object.freeze({ name: "Sam's Club", nameZh: "山姆会员店" }),
  auto: Object.freeze({ name: "Automotive", nameZh: "汽车业务" }),
  energygenerationstorage: Object.freeze({ name: "Energy generation & storage", nameZh: "能源发电与储能" }),
});

const BAR_SEGMENT_COLOR_SLOT_OVERRIDES = Object.freeze({
  microncomputedatacenter: 0,
  micronmobileclient: 1,
  micronstoragecloudmemory: 2,
  micronautoembedded: 3,
  alibabacommerce: 0,
  alibabacloud: 1,
  alibabaothers: 2,
  intelligentcloud: 0,
  productivitybusinessprocesses: 1,
  productivityandbusinessprocesses: 1,
  morepersonalcomputing: 2,
  products: 0,
  services: 1,
  googleservices: 1,
  adrevenue: 0,
  googlecloud: 3,
  googleplay: 2,
  othersegments: 3,
  __other_segments__: 3,
  otherrevenue: 6,
  reportedrevenue: 2,
  iphone: 0,
  mac: 2,
  ipad: 3,
  wearables: 4,
  familyofapps: 0,
  realitylabs: 5,
  onlineadvertisingservices: 0,
  cloudservices: 3,
  networkservices: 2,
  energyproducts: 1,
  onlinestores: 0,
  thirdpartysellerservices: 2,
  amazonwebservices: 1,
  subscriptionservices: 4,
  advertisingservices: 5,
  physicalstores: 6,
  otherservices: 7,
  semiconductorsolutions: 0,
  infrastructuresoftware: 1,
  iplicensing: 2,
  valueaddedservices: 0,
  fintechandbusinessservices: 1,
  marketingservices: 2,
  others: 3,
});

const BAR_SEGMENT_COLOR_SLOT_OVERRIDES_BY_COMPANY = Object.freeze({
  visa: Object.freeze({
    dataprocessingrevenues: 0,
    internationaltransactionrevenues: 1,
    valueaddedservices: 2,
  }),
});

const BAR_RESIDUAL_INFERENCE_CONFLICTS = Object.freeze({
  alphabet: Object.freeze({
    googleinc: Object.freeze(["adrevenue", "googleplay"]),
    googleservices: Object.freeze(["adrevenue", "googleplay"]),
  }),
});

function canonicalBarSegmentKey(companyId, rawKey, rawName = "") {
  const normalizedCompanyId = String(companyId || "").trim().toLowerCase();
  const normalizedKey = normalizeLabelKey(rawKey || rawName);
  if (!normalizedKey) return normalizedKey;
  const companyAliases = BAR_SEGMENT_CANONICAL_BY_COMPANY[normalizedCompanyId] || null;
  if (companyAliases && companyAliases[normalizedKey]) {
    return companyAliases[normalizedKey];
  }
  return normalizedKey;
}

function canonicalBarSegmentMeta(companyId, canonicalKey, fallbackName, fallbackNameZh = "") {
  const normalizedCompanyId = String(companyId || "").trim().toLowerCase();
  const key = canonicalBarSegmentKey(normalizedCompanyId, canonicalKey, fallbackName);
  const override = BAR_SEGMENT_LABEL_OVERRIDES[key];
  if (override) return override;
  return {
    name: fallbackName || "Segment",
    nameZh: fallbackNameZh || translateBusinessLabelToZh(fallbackName || "Segment"),
  };
}

function hashStringDeterministic(text) {
  const value = String(text || "");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

function normalizeBarPaletteColor(hexColor) {
  const raw = String(hexColor || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return null;
  const rgb = parseHexColor(raw);
  if (!rgb) return null;
  const channelSpread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  const isNearNeutral = channelSpread < 14;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  let toned = raw;
  if (hsl) {
    if (isNearNeutral) {
      toned = hslToHex(hsl.h, clamp(hsl.s, 0, 0.12), clamp(hsl.l, 0.24, 0.64));
    } else {
      toned = hslToHex(hsl.h, clamp(Math.max(hsl.s, 0.42), 0.42, 0.88), clamp(hsl.l, 0.28, 0.72));
    }
  }
  const lum = relativeLuminance(toned);
  if (lum > 0.74) return mixHex(toned, "#1F2937", 0.2);
  if (lum < 0.09) return mixHex(toned, "#FFFFFF", 0.22);
  return toned;
}

function uniqueBarPalette(colors = []) {
  const unique = [];
  const used = new Set();
  (colors || []).forEach((color) => {
    const normalized = normalizeBarPaletteColor(color);
    if (!normalized || used.has(normalized)) return;
    used.add(normalized);
    unique.push(normalized);
  });
  return unique;
}

function rgbToHsl(r, g, b) {
  const rn = clamp(r / 255, 0, 1);
  const gn = clamp(g / 255, 0, 1);
  const bn = clamp(b / 255, 0, 1);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta > 0.000001) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex(h, s, l) {
  const hue = ((safeNumber(h) % 360) + 360) % 360;
  const sat = clamp(safeNumber(s), 0, 1);
  const lig = clamp(safeNumber(l), 0, 1);
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hue < 60) [rp, gp, bp] = [c, x, 0];
  else if (hue < 120) [rp, gp, bp] = [x, c, 0];
  else if (hue < 180) [rp, gp, bp] = [0, c, x];
  else if (hue < 240) [rp, gp, bp] = [0, x, c];
  else if (hue < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const toHex = (unit) => Math.round((unit + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
}

function colorToHsl(hexColor) {
  const rgb = parseHexColor(hexColor);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function rotateColorHue(hexColor, deltaHue = 180) {
  const hsl = colorToHsl(hexColor);
  if (!hsl) return hexColor;
  return hslToHex(hsl.h + deltaHue, hsl.s, hsl.l);
}

function hueDistanceDegrees(leftHue, rightHue) {
  const raw = Math.abs(safeNumber(leftHue) - safeNumber(rightHue));
  return Math.min(raw, 360 - raw);
}

function barColorsAreTooSimilar(leftColor, rightColor, options = {}) {
  const leftHsl = colorToHsl(leftColor);
  const rightHsl = colorToHsl(rightColor);
  if (!leftHsl || !rightHsl) return false;
  const hueGap = hueDistanceDegrees(leftHsl.h, rightHsl.h);
  const satGap = Math.abs(leftHsl.s - rightHsl.s);
  const lumGap = Math.abs(leftHsl.l - rightHsl.l);
  const minHueDistance = safeNumber(options.minHueDistance, 20);
  const minSatDistance = safeNumber(options.minSatDistance, 0.16);
  const minLightnessDistance = safeNumber(options.minLightnessDistance, 0.16);
  if (hueGap < Math.max(10, minHueDistance * 0.65) && satGap < Math.max(0.1, minSatDistance * 0.9) && lumGap < Math.max(0.22, minLightnessDistance * 1.5)) {
    return true;
  }
  return hueGap < minHueDistance && satGap < minSatDistance && lumGap < minLightnessDistance;
}

function pushPaletteColorWithContrast(palette, color, minHueDistance = 16, minLumaDistance = 0.05) {
  const normalized = normalizeBarPaletteColor(color);
  if (!normalized || palette.includes(normalized)) return;
  const candidateHsl = colorToHsl(normalized);
  const candidateLum = relativeLuminance(normalized);
  if (!candidateHsl) {
    palette.push(normalized);
    return;
  }
  const tooClose = palette.some((existing) => {
    const existingHsl = colorToHsl(existing);
    if (!existingHsl) return false;
    const hueGap = hueDistanceDegrees(candidateHsl.h, existingHsl.h);
    const satGap = Math.abs(candidateHsl.s - existingHsl.s);
    const lumGap = Math.abs(candidateLum - relativeLuminance(existing));
    return (
      (hueGap < minHueDistance && satGap < 0.12 && lumGap < minLumaDistance) ||
      barColorsAreTooSimilar(normalized, existing, {
        minHueDistance: Math.max(minHueDistance, 18),
        minSatDistance: 0.16,
        minLightnessDistance: Math.max(minLumaDistance * 2.2, 0.14),
      })
    );
  });
  if (!tooClose) {
    palette.push(normalized);
  }
}

function companyBrandBarPalette(companyId, minCount = 8) {
  const companyKey = String(companyId || "").trim().toLowerCase();
  const overridePalette = BAR_COMPANY_PALETTE_OVERRIDES[companyKey];
  if (Array.isArray(overridePalette) && overridePalette.length) {
    const mergedOverride = uniqueBarPalette([...overridePalette, ...BAR_SEGMENT_COLOR_POOL]);
    while (mergedOverride.length < minCount) {
      const idx = mergedOverride.length % BAR_SEGMENT_COLOR_POOL.length;
      pushPaletteColorWithContrast(mergedOverride, BAR_SEGMENT_COLOR_POOL[idx], 10, 0.03);
    }
    return mergedOverride;
  }

  const company = getCompany(companyId) || null;
  const primary = normalizeBarPaletteColor(company?.brand?.primary || "#1CA1E2") || "#1CA1E2";
  const secondary = normalizeBarPaletteColor(company?.brand?.secondary || mixHex(primary, "#F6B800", 0.38)) || "#F6B800";
  const accentBase = normalizeBarPaletteColor(company?.brand?.accent || mixHex(primary, "#FFFFFF", 0.55)) || "#7D7D80";
  const accent = relativeLuminance(accentBase) > 0.72 ? mixHex(accentBase, "#374151", 0.34) : accentBase;
  const seed = hashStringDeterministic(String(companyId || "global"));
  const complementary = rotateColorHue(primary, 180);
  const splitA = rotateColorHue(primary, 145);
  const splitB = rotateColorHue(primary, -145);
  const warmCompanion = mixHex(complementary, "#F59E0B", 0.55);
  const coolCompanion = mixHex(primary, "#14B8A6", 0.5);
  const neutralCompanion = mixHex(secondary, "#94A3B8", 0.35);
  const punchCompanion = mixHex(primary, "#EF4444", 0.36);
  const bridgeCompanion = mixHex(primary, secondary, 0.52);
  const rotatingPool = BAR_SEGMENT_COLOR_POOL.map((_, index) => BAR_SEGMENT_COLOR_POOL[(seed + index * 3) % BAR_SEGMENT_COLOR_POOL.length]);
  const palette = [];
  [primary, secondary, accent, complementary, splitA, splitB, warmCompanion, coolCompanion, neutralCompanion, punchCompanion, bridgeCompanion, ...rotatingPool].forEach(
    (color) => pushPaletteColorWithContrast(palette, color, 18, 0.06)
  );
  while (palette.length < minCount) {
    const idx = palette.length % BAR_SEGMENT_COLOR_POOL.length;
    pushPaletteColorWithContrast(palette, BAR_SEGMENT_COLOR_POOL[idx], 10, 0.03);
    if (palette.length < minCount) {
      pushPaletteColorWithContrast(palette, mixHex(BAR_SEGMENT_COLOR_POOL[idx], "#FFFFFF", 0.12), 10, 0.03);
    }
  }
  return palette;
}

function stableBarColorMap(companyId, segmentKeys = []) {
  const normalizedCompanyId = String(companyId || "").trim().toLowerCase();
  const usedColors = [];
  const colorMap = {};
  const orderedKeys = [...new Set(segmentKeys.filter(Boolean))];
  const brandPalette = companyBrandBarPalette(normalizedCompanyId, Math.max(orderedKeys.length + 2, 8));
  const companySlotOverrides = BAR_SEGMENT_COLOR_SLOT_OVERRIDES_BY_COMPANY[normalizedCompanyId] || null;
  const canUseCandidateColor = (candidateColor) =>
    !!candidateColor &&
    !usedColors.includes(candidateColor) &&
    !usedColors.some((existingColor) => barColorsAreTooSimilar(candidateColor, existingColor));
  orderedKeys.forEach((segmentKey) => {
    const preferredSlot = companySlotOverrides?.[segmentKey] ?? BAR_SEGMENT_COLOR_SLOT_OVERRIDES[segmentKey];
    if (preferredSlot === null || preferredSlot === undefined) return;
    const candidate = brandPalette[preferredSlot % brandPalette.length];
    if (!canUseCandidateColor(candidate)) return;
    colorMap[segmentKey] = candidate;
    usedColors.push(candidate);
  });
  const primaryKey = orderedKeys[0];
  if (primaryKey && !colorMap[primaryKey]) {
    for (let index = 0; index < brandPalette.length; index += 1) {
      const candidate = brandPalette[index];
      if (!canUseCandidateColor(candidate)) continue;
      colorMap[primaryKey] = candidate;
      usedColors.push(candidate);
      break;
    }
    if (!colorMap[primaryKey]) {
      for (let index = 0; index < brandPalette.length; index += 1) {
        const candidate = brandPalette[index];
        if (!candidate || usedColors.includes(candidate)) continue;
        colorMap[primaryKey] = candidate;
        usedColors.push(candidate);
        break;
      }
    }
    if (!colorMap[primaryKey]) {
      colorMap[primaryKey] = brandPalette[0];
      usedColors.push(brandPalette[0]);
    }
  }
  orderedKeys.forEach((segmentKey) => {
    if (colorMap[segmentKey]) return;
    const seed = hashStringDeterministic(`${normalizedCompanyId || "global"}:${segmentKey}`);
    for (let offset = 0; offset < brandPalette.length; offset += 1) {
      const color = brandPalette[(seed + offset) % brandPalette.length];
      if (canUseCandidateColor(color)) {
        colorMap[segmentKey] = color;
        usedColors.push(color);
        return;
      }
    }
    for (let offset = 0; offset < brandPalette.length; offset += 1) {
      const color = brandPalette[(seed + offset) % brandPalette.length];
      if (!usedColors.includes(color)) {
        colorMap[segmentKey] = color;
        usedColors.push(color);
        return;
      }
    }
    colorMap[segmentKey] = brandPalette[seed % brandPalette.length];
  });
  return colorMap;
}

function parseHexColor(value) {
  const normalized = String(value || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function srgbToLinear(value) {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hexColor) {
  const rgb = parseHexColor(hexColor);
  if (!rgb) return 0;
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

function barSegmentTextColor(fillColor) {
  return relativeLuminance(fillColor) > 0.52 ? "#0F3552" : "#FFFFFF";
}

function formatBarQuarterLabel(entry, quarterKey) {
  const compactLabel = compactFiscalLabel(entry?.fiscalLabel || "");
  if (compactLabel) return compactLabel;
  const match = /^(\d{4})Q([1-4])$/.exec(quarterKey || "");
  if (!match) return quarterKey || "";
  return `Q${match[2]} FY${match[1].slice(-2)}`;
}

function localizedBarSegmentName(item) {
  if (!item) return "";
  if (currentChartLanguage() === "zh") {
    return item.nameZh || translateBusinessLabelToZh(item.name || "");
  }
  return String(item.name || "");
}

function roundedTopRectPath(x, y, width, height, radius) {
  const r = clamp(radius, 0, Math.min(width / 2, height));
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    "Z",
  ].join(" ");
}

function roundedBottomRectPath(x, y, width, height, radius) {
  const r = clamp(radius, 0, Math.min(width / 2, height));
  return [
    `M ${x} ${y}`,
    `L ${x} ${y + height - r}`,
    `Q ${x} ${y + height} ${x + r} ${y + height}`,
    `L ${x + width - r} ${y + height}`,
    `Q ${x + width} ${y + height} ${x + width} ${y + height - r}`,
    `L ${x + width} ${y}`,
    "Z",
  ].join(" ");
}

function stackedBarSegmentElement(x, y, width, height, radius, isTop, isBottom, fillColor) {
  if (isTop && isBottom) {
    const r = clamp(radius, 0, Math.min(width / 2, height / 2));
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${r.toFixed(2)}" fill="${fillColor}"></rect>`;
  }
  if (isTop) {
    return `<path d="${roundedTopRectPath(x, y, width, height, radius)}" fill="${fillColor}"></path>`;
  }
  if (isBottom) {
    return `<path d="${roundedBottomRectPath(x, y, width, height, radius)}" fill="${fillColor}"></path>`;
  }
  return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="${fillColor}"></rect>`;
}

const companyFxFallbackScaleCache = new WeakMap();

function companyFxFallbackByCurrency(company) {
  if (!company || typeof company !== "object") return {};
  const cached = companyFxFallbackScaleCache.get(company);
  if (cached) return cached;
  const samplesByCurrency = new Map();
  Object.values(company?.financials || {}).forEach((quarterEntry) => {
    const sourceCurrency = String(quarterEntry?.statementCurrency || "").toUpperCase();
    const displayCurrency = String(quarterEntry?.displayCurrency || "").toUpperCase();
    const scale = safeNumber(quarterEntry?.displayScaleFactor, null);
    if (!sourceCurrency || sourceCurrency === "USD" || displayCurrency !== "USD" || !(scale > 0.000001) || Math.abs(scale - 1) < 0.000001) return;
    if (!samplesByCurrency.has(sourceCurrency)) {
      samplesByCurrency.set(sourceCurrency, []);
    }
    samplesByCurrency.get(sourceCurrency).push(scale);
  });
  const fallbackByCurrency = {};
  samplesByCurrency.forEach((samples, currency) => {
    const median = medianNumber(samples);
    if (median > 0.000001) {
      fallbackByCurrency[currency] = Number(median.toFixed(6));
    }
  });
  companyFxFallbackScaleCache.set(company, fallbackByCurrency);
  return fallbackByCurrency;
}

function resolveQuarterDisplayConfig(company, entry = null, structurePayload = null) {
  const fromEntryScale = safeNumber(entry?.displayScaleFactor, null);
  const fromStructureScale = safeNumber(structurePayload?.displayScaleFactor, null);
  let scaleFactor = fromEntryScale > 0 ? fromEntryScale : fromStructureScale > 0 ? fromStructureScale : 1;
  let displayCurrency =
    String(entry?.displayCurrency || structurePayload?.displayCurrency || entry?.statementCurrency || company?.reportingCurrency || "USD").toUpperCase() || "USD";
  const sourceCurrency = String(entry?.statementCurrency || company?.reportingCurrency || displayCurrency || "USD").toUpperCase() || displayCurrency || "USD";
  const fallbackScale = companyFxFallbackByCurrency(company)?.[sourceCurrency];
  if (
    sourceCurrency !== "USD" &&
    fallbackScale > 0.000001 &&
    (displayCurrency !== "USD" || Math.abs(scaleFactor - 1) < 0.000001)
  ) {
    displayCurrency = "USD";
    scaleFactor = fallbackScale;
  }
  return {
    displayScaleFactor: scaleFactor,
    displayCurrency,
    sourceCurrency,
    usesFxConversion: sourceCurrency !== "USD" && displayCurrency === "USD" && Math.abs(scaleFactor - 1) > 0.000001,
  };
}

function resolveBarQuarterDisplayConfig(company, entry = null, structurePayload = null) {
  return resolveQuarterDisplayConfig(company, entry, structurePayload);
}

function scaleBarSegmentRows(rows = [], scaleFactor = 1) {
  const scale = safeNumber(scaleFactor, 1);
  return (rows || []).map((item) => ({
    ...item,
    valueBn: Number((safeNumber(item.valueBn) * scale).toFixed(3)),
  }));
}

function parseIsoDateToUtcMs(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const utcMs = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(utcMs) ? utcMs : null;
}

function medianNumber(values = []) {
  const numeric = [...(values || [])].map((item) => safeNumber(item, null)).filter((item) => item !== null).sort((left, right) => left - right);
  if (!numeric.length) return null;
  const middle = Math.floor(numeric.length / 2);
  if (numeric.length % 2) return numeric[middle];
  return (numeric[middle - 1] + numeric[middle]) / 2;
}

function compareIsoDateStrings(leftValue, rightValue) {
  const leftMs = parseIsoDateToUtcMs(leftValue);
  const rightMs = parseIsoDateToUtcMs(rightValue);
  if (leftMs !== null && rightMs !== null) return leftMs - rightMs;
  if (leftMs !== null) return 1;
  if (rightMs !== null) return -1;
  const leftText = String(leftValue || "");
  const rightText = String(rightValue || "");
  if (leftText === rightText) return 0;
  return leftText > rightText ? 1 : -1;
}

function preferCanonicalBarSegmentRow(currentRow, candidateRow) {
  const filingComparison = compareIsoDateStrings(currentRow?.filingDate, candidateRow?.filingDate);
  if (filingComparison !== 0) return filingComparison < 0;
  const candidateValue = safeNumber(candidateRow?.valueBn);
  const currentValue = safeNumber(currentRow?.valueBn);
  if (Math.abs(candidateValue - currentValue) > 0.002) return candidateValue > currentValue;
  const currentNameLength = String(currentRow?.name || "").trim().length;
  const candidateNameLength = String(candidateRow?.name || "").trim().length;
  return candidateNameLength > currentNameLength;
}

function barSourceRowKey(item) {
  return normalizeLabelKey(item?.id || item?.memberKey || item?.name);
}

function applyCompanyBarSegmentRollups(entry, rows = []) {
  const companyId = String(entry?.companyId || "").trim().toLowerCase();
  const rollups = BAR_SEGMENT_ROLLUPS_BY_COMPANY[companyId];
  if (!rollups || !Array.isArray(rows) || !rows.length) return rows;

  let nextRows = rows.map((item) => ({ ...item }));
  Object.entries(rollups).forEach(([targetRawKey, childRawKeys]) => {
    const targetKey = normalizeLabelKey(targetRawKey);
    const childKeys = new Set((childRawKeys || []).map((key) => normalizeLabelKey(key)).filter(Boolean));
    if (!targetKey || childKeys.size < 2) return;

    const rowMap = new Map(nextRows.map((item) => [barSourceRowKey(item), item]));
    const childRows = [...childKeys].map((key) => rowMap.get(key)).filter(Boolean);
    if (childRows.length !== childKeys.size) return;

    const explicitTargetRow = rowMap.get(targetKey) || null;
    const childValueBn = childRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    if (!(childValueBn > 0.02)) return;

    const explicitTargetValueBn = safeNumber(explicitTargetRow?.valueBn, 0);
    const useExplicitTargetValue =
      explicitTargetValueBn > 0.02 &&
      explicitTargetValueBn / Math.max(childValueBn, 0.001) >= 0.82 &&
      explicitTargetValueBn / Math.max(childValueBn, 0.001) <= 1.18;
    const resolvedValueBn = useExplicitTargetValue ? explicitTargetValueBn : childValueBn;
    const labelMeta = canonicalBarSegmentMeta(companyId, targetKey, explicitTargetRow?.name || targetRawKey, explicitTargetRow?.nameZh || "");
    const preferredSourceRow = childRows.reduce(
      (selected, item) => (selected && !preferCanonicalBarSegmentRow(selected, item) ? selected : item),
      explicitTargetRow
    );

    nextRows = nextRows.filter((item) => {
      const key = barSourceRowKey(item);
      return key !== targetKey && !childKeys.has(key);
    });
    nextRows.push({
      id: targetKey,
      name: labelMeta.name || explicitTargetRow?.name || targetRawKey,
      nameZh: labelMeta.nameZh || explicitTargetRow?.nameZh || translateBusinessLabelToZh(targetRawKey),
      valueBn: Number(resolvedValueBn.toFixed(3)),
      filingDate: preferredSourceRow?.filingDate || null,
      periodEnd: preferredSourceRow?.periodEnd || entry?.periodEnd || null,
    });
  });

  return nextRows;
}

function normalizeBarSourceRows(entry, rows = []) {
  const sourceRows = sanitizeOfficialStructureRows(entry, rows || []);
  if (!sourceRows.length) return [];
  const revenueBn = safeNumber(entry?.revenueBn, null);
  const positiveRows = sourceRows.filter((item) => safeNumber(item?.valueBn) > 0.001);
  if (!positiveRows.length) return [];
  const rawSum = positiveRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const shareLikeByShape =
    revenueBn > 0.02 &&
    positiveRows.length >= 2 &&
    positiveRows.every((item) => safeNumber(item?.valueBn) >= 0 && safeNumber(item?.valueBn) <= 100.5) &&
    Math.abs(rawSum - 100) <= 4.5;
  const normalizedRows = positiveRows
    .map((item) => {
      const metricMode = normalizeLabelKey(item?.metricMode || "");
      const mixPct = safeNumber(item?.mixPct, null);
      const rawValue = safeNumber(item?.valueBn);
      const flowValue = safeNumber(item?.flowValueBn, rawValue);
      const shareLikeRow =
        revenueBn > 0.02 &&
        (metricMode === "share" || metricMode === "mix" || metricMode === "percentage" || (shareLikeByShape && rawValue <= 100.5));
      const resolvedSharePct = mixPct !== null && mixPct >= 0 && mixPct <= 100.5 ? mixPct : rawValue;
      const resolvedValueBn = shareLikeRow ? (revenueBn * resolvedSharePct) / 100 : flowValue;
      return {
        id: item.memberKey || item.id || item.name,
        name: item.name,
        nameZh: item.nameZh || translateBusinessLabelToZh(item.name || ""),
        valueBn: Number(safeNumber(resolvedValueBn).toFixed(3)),
        filingDate: item.filingDate || null,
        periodEnd: item.periodEnd || entry?.periodEnd || null,
      };
    })
    .filter((item) => safeNumber(item.valueBn) > 0.02);
  const rolledUpRows = applyCompanyBarSegmentRollups(entry, normalizedRows);
  if (String(entry?.companyId || "").toLowerCase() === "micron") {
    return normalizeMicronBarRows(entry, rolledUpRows);
  }
  if (String(entry?.companyId || "").toLowerCase() === "alibaba") {
    const comparableRows = buildAlibabaComparableBarRows(entry, rolledUpRows);
    if (comparableRows.length >= 2) return comparableRows;
  }
  return rolledUpRows;
}

function barSourceLagDaysMedian(entry, rows = []) {
  const fallbackPeriodEndMs = parseIsoDateToUtcMs(entry?.periodEnd);
  const lagDays = [...(rows || [])]
    .map((item) => {
      const filingMs = parseIsoDateToUtcMs(item?.filingDate);
      const periodEndMs = parseIsoDateToUtcMs(item?.periodEnd) || fallbackPeriodEndMs;
      if (!(filingMs && periodEndMs)) return null;
      return (filingMs - periodEndMs) / 86400000;
    })
    .filter((value) => value !== null && Number.isFinite(value));
  return medianNumber(lagDays);
}

function scoreBarSourceCandidate(entry, rows = []) {
  if (!rows.length) {
    return {
      score: -999,
      coverageRatio: null,
      topShare: null,
      lagMedianDays: null,
    };
  }
  const revenueBn = safeNumber(entry?.revenueBn, null);
  const segmentSum = rows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const count = rows.length;
  const aggregateLikeCount = rows.filter((item) => isAggregateLikeSegmentLabel(item?.name || "")).length;
  const topShare = segmentSum > 0.02 ? safeNumber(rows[0]?.valueBn) / segmentSum : 1;
  const coverageRatio = revenueBn > 0.02 ? segmentSum / revenueBn : null;
  const lagMedianDays = barSourceLagDaysMedian(entry, rows);
  let score = 0;
  score += count >= 2 ? 22 : -14;
  if (count >= 3) score += 5;
  if (count > 7) score -= (count - 7) * 4;
  if (count > 10) score -= (count - 10) * 5;
  if (coverageRatio !== null) {
    const coverageDelta = Math.abs(coverageRatio - 1);
    if (coverageDelta <= 0.08) score += 18;
    else if (coverageDelta <= 0.25) score += 10;
    else if (coverageRatio < 0.36 || coverageRatio > 1.4) score -= 18;
    else score += 2;
  }
  if (topShare > 0.84 && count >= 3) score -= 8;
  if (aggregateLikeCount >= 2 && count >= 4) score -= aggregateLikeCount * 4;
  if (lagMedianDays !== null) {
    if (lagMedianDays > 900) score -= 16;
    else if (lagMedianDays > 540) score -= 10;
    else if (lagMedianDays < -2) score -= 6;
    else if (lagMedianDays <= 260) score += 3;
  }
  return {
    score,
    coverageRatio,
    topShare,
    lagMedianDays,
  };
}

function expandBarDetailRows(company, entry, baseRows = []) {
  const detailRows = sanitizeOfficialStructureRows(entry, entry?.officialRevenueDetailGroups || [])
    .filter((item) => safeNumber(item?.valueBn) > 0.02);
  if (detailRows.length < 2 || !baseRows.length) return baseRows;
  const bridgeStyle = resolvedBarBridgeStyle(company, entry, null, baseRows);
  const totalBaseValue = baseRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const detailRowsByTarget = new Map();
  detailRows.forEach((item) => {
    const targetLabel = item.targetId || item.targetName || item.target || item.groupName || "";
    const targetRawKey = normalizeLabelKey(targetLabel);
    const targetKey = canonicalBarSegmentKey(company?.id, targetRawKey, targetLabel);
    if (!targetKey) return;
    if (!detailRowsByTarget.has(targetKey)) {
      detailRowsByTarget.set(targetKey, []);
    }
    detailRowsByTarget.get(targetKey).push(item);
  });

  let nextRows = [...baseRows];
  detailRowsByTarget.forEach((rows, targetKey) => {
    const targetIndex = nextRows.findIndex((item) => {
      const itemKey = item.key || canonicalBarSegmentKey(company?.id, normalizeLabelKey(item.id || item.name || ""), item.name || "");
      return itemKey === targetKey;
    });
    if (targetIndex < 0) return;
    const targetRow = nextRows[targetIndex];
    const targetValueBn = safeNumber(targetRow?.valueBn);
    if (!(targetValueBn > 0.02)) return;
    const cleanedRows = rows
      .filter((item) => !isAggregateLikeSegmentLabel(item?.name || ""))
      .map((item) => ({
        id: item.memberKey || item.id || item.name,
        name: item.name,
        nameZh: item.nameZh || translateBusinessLabelToZh(item.name || ""),
        valueBn: safeNumber(item.valueBn),
        filingDate: item.filingDate || null,
        periodEnd: item.periodEnd || entry?.periodEnd || null,
      }))
      .filter((item) => safeNumber(item?.valueBn) > 0.02)
      .sort((left, right) => safeNumber(right?.valueBn) - safeNumber(left?.valueBn));
    if (cleanedRows.length < 2) return;
    const detailValueBn = cleanedRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    const coverageRatio = detailValueBn / Math.max(targetValueBn, 0.001);
    const projectedRowCount = nextRows.length - 1 + cleanedRows.length;
    const targetShare = targetValueBn / Math.max(totalBaseValue, 0.001);
    const priorityTargetKeys = new Set(["products", "product", "adrevenue"]);
    if (bridgeStyle === "xiaomi-revenue-bridge") {
      priorityTargetKeys.add("smartphonexaiot");
    }
    const targetIsAggregateLike = isAggregateLikeSegmentLabel(targetRow?.name || "");
    const shouldExpand =
      projectedRowCount <= 7 &&
      coverageRatio >= 0.72 &&
      coverageRatio <= 1.08 &&
      (priorityTargetKeys.has(normalizeLabelKey(targetKey)) ||
        (targetIsAggregateLike && cleanedRows.length >= 3 && targetShare >= 0.28));
    if (!shouldExpand) return;
    nextRows.splice(targetIndex, 1, ...cleanedRows);
  });

  return nextRows.sort((left, right) => safeNumber(right?.valueBn) - safeNumber(left?.valueBn));
}

function reconcileBarSegmentRowsToRevenue(company, rows = [], totalRevenueBn = null, options = {}) {
  const revenueBn = safeNumber(totalRevenueBn, null);
  const inputRows = Array.isArray(rows) ? rows : [];
  const segmentSum = inputRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  const minCoverageForResidualAddition = clamp(safeNumber(options.minCoverageForResidualAddition, 0.36), 0.2, 0.94);
  if (!(revenueBn > 0.02) || !inputRows.length) {
    return {
      rows: inputRows,
      coverageRatio: revenueBn > 0.02 ? segmentSum / revenueBn : null,
      insufficientCoverage: false,
      reconciliationMode: "none",
    };
  }
  const coverageRatio = segmentSum / revenueBn;
  if (coverageRatio < minCoverageForResidualAddition) {
    return {
      rows: [],
      coverageRatio,
      insufficientCoverage: true,
      reconciliationMode: "coverage-too-low",
    };
  }
  let nextRows = inputRows.map((item) => ({ ...item, valueBn: safeNumber(item.valueBn) }));
  let reconciliationMode = "none";
  if (coverageRatio > 1.12 && segmentSum > 0.02) {
    const scale = revenueBn / segmentSum;
    nextRows = nextRows.map((item) => ({
      ...item,
      valueBn: Number((safeNumber(item.valueBn) * scale).toFixed(3)),
    }));
    reconciliationMode = "scaled-down";
  } else if (coverageRatio < 0.94) {
    const residualValue = revenueBn - segmentSum;
    if (residualValue > 0.03) {
      const residualKey = canonicalBarSegmentKey(company?.id, "otherrevenue", "Other revenue");
      const residualMeta = canonicalBarSegmentMeta(company?.id, residualKey, "Other revenue", "其他营收");
      const existingIndex = nextRows.findIndex((item) => item.key === residualKey);
      if (existingIndex >= 0) {
        nextRows[existingIndex].valueBn = Number((safeNumber(nextRows[existingIndex].valueBn) + residualValue).toFixed(3));
      } else {
        nextRows.push({
          key: residualKey,
          name: residualMeta.name,
          nameZh: residualMeta.nameZh,
          valueBn: Number(residualValue.toFixed(3)),
        });
      }
      reconciliationMode = "residual-added";
    }
  }
  return {
    rows: nextRows.sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn)),
    coverageRatio,
    insufficientCoverage: false,
    reconciliationMode,
  };
}

function selectQuarterBarSource(company, entry, structurePayload = null) {
  let rows = [];
  const candidates = [];
  const entryForNormalization =
    entry ||
    {
      revenueBn: safeNumber(structurePayload?.displayRevenueBn, null),
      periodEnd: null,
    };
  const addCandidate = (source, sourceRows = []) => {
    if (!Array.isArray(sourceRows) || !sourceRows.length) return;
    const entryWithCompanyId = entryForNormalization
      ? {
          ...entryForNormalization,
          companyId: company?.id || entryForNormalization.companyId,
          quarterKey: entryQuarterKey(company, entry) || structurePayload?.quarterKey || entryForNormalization.quarterKey || null,
        }
      : entryForNormalization;
    let normalizedRows = normalizeBarSourceRows(entryWithCompanyId, sourceRows);
    if (!normalizedRows.length) return;
    if (entry) {
      normalizedRows = expandBarDetailRows(company, entry, normalizedRows);
    }
    if (!normalizedRows.length) return;
    normalizedRows = normalizedRows.sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn));
    const quality = scoreBarSourceCandidate(entryForNormalization, normalizedRows);
    candidates.push({
      source,
      rows: normalizedRows,
      ...quality,
    });
  };

  addCandidate("structure-history", Array.isArray(structurePayload?.segments) ? structurePayload.segments : []);
  addCandidate("official-segments", Array.isArray(entry?.officialRevenueSegments) ? entry.officialRevenueSegments : []);
  if (shouldUseOfficialGroupCandidate(company, entry, structurePayload)) {
    let groups = null;
    try {
      groups = buildOfficialBusinessGroups(company, entry, { includeSyntheticResidual: false });
    } catch (_error) {
      groups = null;
    }
    const quarterKey = entryQuarterKey(company, entry);
    const shouldSkipOfficialGroups =
      String(company?.id || "").toLowerCase() === "alphabet" &&
      quarterKey &&
      quarterSortValue(quarterKey) < quarterSortValue("2021Q1");
    if (!shouldSkipOfficialGroups && Array.isArray(groups) && groups.length) {
      addCandidate(
        "official-groups",
        groups.map((item) => ({
          memberKey: item.memberKey || item.id || item.name,
          name: item.name,
          nameZh: item.nameZh,
          valueBn: item.valueBn,
          sourceUrl: item.sourceUrl || null,
          filingDate: item.filingDate || null,
          periodEnd: item.periodEnd || entry?.periodEnd || null,
          metricMode: item.metricMode || null,
        }))
      );
    }
  }

  let selectedCandidate = null;
  if (candidates.length) {
    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftCoverageDelta = left.coverageRatio === null ? Number.POSITIVE_INFINITY : Math.abs(left.coverageRatio - 1);
      const rightCoverageDelta = right.coverageRatio === null ? Number.POSITIVE_INFINITY : Math.abs(right.coverageRatio - 1);
      if (leftCoverageDelta !== rightCoverageDelta) return leftCoverageDelta - rightCoverageDelta;
      if (right.rows.length !== left.rows.length) return right.rows.length - left.rows.length;
      const sourcePriority = {
        "official-segments": 3,
        "official-groups": 2,
        "structure-history": 1,
      };
      return (sourcePriority[right.source] || 0) - (sourcePriority[left.source] || 0);
    });
    selectedCandidate = candidates[0];
    rows = selectedCandidate.rows;
  }

  if (!rows.length) {
    const fallbackRevenue = safeNumber(entry?.revenueBn, safeNumber(structurePayload?.displayRevenueBn, null));
    if (fallbackRevenue > 0.02) {
      rows = [
        {
          id: "reportedrevenue",
          name: "Reported revenue",
          nameZh: "报告营收",
          valueBn: fallbackRevenue,
        },
      ];
    }
  }

  const mergedByKey = new Map();
  rows.forEach((item) => {
    const rawKey = normalizeLabelKey(item.id || item.name);
    const key = canonicalBarSegmentKey(company?.id, rawKey, item.name || "");
    const valueBn = safeNumber(item.valueBn);
    if (!key || valueBn <= 0.02) return;
    const canonicalMeta = canonicalBarSegmentMeta(company?.id, key, item.name || "Segment", item.nameZh || "");
    const candidateRow = {
      key,
      name: canonicalMeta.name || item.name || "Segment",
      nameZh: canonicalMeta.nameZh || item.nameZh || translateBusinessLabelToZh(item.name || "Segment"),
      valueBn,
      filingDate: item.filingDate || null,
      periodEnd: item.periodEnd || null,
    };
    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, candidateRow);
      return;
    }
    const existingRow = mergedByKey.get(key);
    const preferredRow = preferCanonicalBarSegmentRow(existingRow, candidateRow) ? candidateRow : existingRow;
    mergedByKey.set(key, {
      ...preferredRow,
      key,
      valueBn: Number(Math.max(safeNumber(existingRow?.valueBn), valueBn).toFixed(3)),
    });
  });

  const normalizedMergedRows = [...mergedByKey.values()]
    .map((item) => ({
      ...item,
      valueBn: Number(item.valueBn.toFixed(3)),
    }))
    .sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn));
  return {
    rows: normalizedMergedRows,
    source: selectedCandidate?.source || (normalizedMergedRows.length === 1 && normalizedMergedRows[0]?.key === "reportedrevenue" ? "fallback-reported" : "none"),
    score: selectedCandidate?.score ?? null,
    coverageRatio: selectedCandidate?.coverageRatio ?? null,
    topShare: selectedCandidate?.topShare ?? null,
    lagMedianDays: selectedCandidate?.lagMedianDays ?? null,
  };
}

function normalizeQuarterSegmentsForBar(company, entry, structurePayload = null) {
  return selectQuarterBarSource(company, entry, structurePayload).rows;
}

function isBarTaxonomyOptionalRow(row) {
  const key = normalizeLabelKey(row?.key || row?.memberKey || row?.id || row?.name);
  if (!key || key === "reportedrevenue" || key === "otherrevenue") return true;
  return isAggregateLikeSegmentLabel(row?.name || "");
}

function comparableTaxonomyRows(rows = []) {
  const cleaned = [...(rows || [])].filter((item) => item?.key && item.key !== "reportedrevenue" && safeNumber(item?.valueBn) > 0.02);
  const nonOptional = cleaned.filter((item) => !isBarTaxonomyOptionalRow(item));
  return nonOptional.length >= 2 ? nonOptional : cleaned;
}

function quarterComparableTaxonomyProfile(quarter) {
  const rows = comparableTaxonomyRows(quarter?.rawSegmentRows || []);
  const map = new Map(rows.map((item) => [item.key, item]));
  const total = rows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
  return {
    rows,
    map,
    keys: rows.map((item) => item.key),
    total,
  };
}

function quarterComparableTaxonomySignature(quarter) {
  return quarterComparableTaxonomyProfile(quarter).keys.join("|");
}

function pickAnchorTaxonomyQuarter(quarters = []) {
  for (let index = quarters.length - 1; index >= 0; index -= 1) {
    const quarter = quarters[index];
    if (!quarter?.hasRevenueValue || !Array.isArray(quarter?.rawSegmentRows) || quarter.rawSegmentRows.length < 2) continue;
    if (quarter.wasReportedOnlyRaw || quarter.insufficientSegments) continue;
    const profile = quarterComparableTaxonomyProfile(quarter);
    if (profile.rows.length >= 2) {
      return quarter;
    }
  }
  return null;
}

function phaseAnchorQuarterScore(quarter) {
  if (!quarter) return -1;
  const profile = quarterComparableTaxonomyProfile(quarter);
  return (
    profile.rows.length * 20 +
    safeNumber(quarter?.rawSegmentSourceScore, 0) +
    safeNumber(quarter?.rawCoverageRatio, 0) * 12 +
    safeNumber(quarter?.totalRevenueBn, 0) * 0.01
  );
}

function shouldStartNewBarTaxonomyPhase(company, anchorQuarter, candidateQuarter) {
  if (!anchorQuarter || !candidateQuarter) return false;
  const anchorProfile = quarterComparableTaxonomyProfile(anchorQuarter);
  const candidateProfile = quarterComparableTaxonomyProfile(candidateQuarter);
  if (anchorProfile.rows.length < 2 || candidateProfile.rows.length < 2) return false;
  const anchorSignature = quarterComparableTaxonomySignature(anchorQuarter);
  const candidateSignature = quarterComparableTaxonomySignature(candidateQuarter);
  if (anchorSignature && anchorSignature === candidateSignature) return false;

  const forward = alignQuarterRowsToAnchorRegime(company, candidateQuarter, anchorQuarter);
  const reverse = alignQuarterRowsToAnchorRegime(company, anchorQuarter, candidateQuarter);
  const commonCount = anchorProfile.keys.filter((key) => candidateProfile.map.has(key)).length;
  const unionSize = new Set([...anchorProfile.keys, ...candidateProfile.keys]).size || 1;
  const jaccard = commonCount / unionSize;
  const bundledPhaseShift =
    (forward.comparable && forward.reason === "schema-bundled") || (reverse.comparable && reverse.reason === "schema-bundled");
  if (bundledPhaseShift && anchorProfile.rows.length >= 3 && candidateProfile.rows.length >= 3) {
    return true;
  }
  if (!forward.comparable && !reverse.comparable) {
    return true;
  }
  return anchorProfile.rows.length >= 3 && candidateProfile.rows.length >= 3 && jaccard < 0.75;
}

function buildBarTaxonomyPhases(company, quarters = []) {
  const phases = [];
  quarters.forEach((quarter) => {
    quarter.taxonomyPhaseId = null;
  });
  quarters.forEach((quarter, index) => {
    const profile = quarterComparableTaxonomyProfile(quarter);
    const isReliableQuarter =
      quarter?.hasRevenueValue &&
      !quarter?.wasReportedOnlyRaw &&
      !quarter?.insufficientSegments &&
      profile.rows.length >= 2;
    if (!isReliableQuarter) return;
    const currentPhase = phases[phases.length - 1] || null;
    if (!currentPhase) {
      phases.push({
        id: phases.length,
        indexes: [index],
        anchorIndex: index,
      });
      quarter.taxonomyPhaseId = phases[phases.length - 1].id;
      return;
    }
    const anchorQuarter = quarters[currentPhase.anchorIndex];
    if (shouldStartNewBarTaxonomyPhase(company, anchorQuarter, quarter)) {
      phases.push({
        id: phases.length,
        indexes: [index],
        anchorIndex: index,
      });
      quarter.taxonomyPhaseId = phases[phases.length - 1].id;
      return;
    }
    currentPhase.indexes.push(index);
    quarter.taxonomyPhaseId = currentPhase.id;
    const currentAnchorQuarter = quarters[currentPhase.anchorIndex];
    if (phaseAnchorQuarterScore(quarter) >= phaseAnchorQuarterScore(currentAnchorQuarter)) {
      currentPhase.anchorIndex = index;
    }
  });

  for (let index = 0; index < quarters.length; index += 1) {
    if (quarters[index].taxonomyPhaseId !== null && quarters[index].taxonomyPhaseId !== undefined) continue;
    const previousPhaseId = index > 0 ? quarters[index - 1]?.taxonomyPhaseId : null;
    const nextPhaseId = index + 1 < quarters.length ? quarters[index + 1]?.taxonomyPhaseId : null;
    if (previousPhaseId !== null && previousPhaseId !== undefined && previousPhaseId === nextPhaseId) {
      quarters[index].taxonomyPhaseId = previousPhaseId;
    }
  }

  return phases;
}

function applyBarTaxonomyPhaseAlignment(company, quarters = [], phases = []) {
  phases.forEach((phase) => {
    const anchorQuarter = quarters[phase?.anchorIndex];
    if (!anchorQuarter) return;
    phase.indexes.forEach((quarterIndex) => {
      const quarter = quarters[quarterIndex];
      if (!quarter?.hasRevenueValue || !Array.isArray(quarter.rawSegmentRows) || !quarter.rawSegmentRows.length) return;
      const alignment = alignQuarterRowsToAnchorRegime(company, quarter, anchorQuarter);
      quarter.taxonomyComparableToAnchor = alignment.comparable;
      quarter.taxonomyComparisonMode = alignment.reason || null;
      if (!alignment.comparable) return;
      quarter.rawSegmentRows = alignment.rows.map((item) => ({ ...item }));
      const reconciled = reconcileBarSegmentRowsToRevenue(company, quarter.rawSegmentRows, quarter.totalRevenueBn, {
        minCoverageForResidualAddition: quarter.bridgeStyle ? 0.36 : 0.62,
      });
      quarter.segmentRows = reconciled.rows;
      quarter.segmentMap = Object.fromEntries(quarter.segmentRows.map((item) => [item.key, safeNumber(item.valueBn)]));
      quarter.rawCoverageRatio = reconciled.coverageRatio;
      quarter.insufficientSegments = !!reconciled.insufficientCoverage;
      if (alignment.reason && alignment.reason !== "anchor-quarter") {
        quarter.reconciliationMode =
          quarter.reconciliationMode === "none"
            ? alignment.reason
            : String(quarter.reconciliationMode || "").includes(alignment.reason)
              ? quarter.reconciliationMode
              : `${quarter.reconciliationMode}+${alignment.reason}`;
      } else {
        quarter.reconciliationMode = reconciled.reconciliationMode;
      }
    });
  });
}

function alignQuarterRowsToAnchorRegime(company, quarter, anchorQuarter) {
  if (!quarter || !anchorQuarter) return { comparable: false, rows: [] };
  if (quarter === anchorQuarter) {
    return { comparable: true, rows: quarter.rawSegmentRows || [], reason: "anchor-quarter" };
  }
  const anchorStyle = String(anchorQuarter?.bridgeStyle || "").trim().toLowerCase();
  const quarterStyle = String(quarter?.bridgeStyle || "").trim().toLowerCase();
  if (anchorStyle && quarterStyle && anchorStyle !== quarterStyle) {
    return { comparable: false, rows: [], reason: "style-mismatch" };
  }

  const anchorProfile = quarterComparableTaxonomyProfile(anchorQuarter);
  const quarterProfile = quarterComparableTaxonomyProfile(quarter);
  if (anchorProfile.rows.length < 2 || quarterProfile.rows.length < 1) {
    return { comparable: false, rows: [], reason: "insufficient-profile" };
  }

  let alignedRows = [...(quarter.rawSegmentRows || [])].map((item) => ({ ...item }));
  let alignedProfile = quarterProfile;
  let bundledReplacement = false;

  const recomputeProfile = () => {
    const nextQuarter = { rawSegmentRows: alignedRows };
    alignedProfile = quarterComparableTaxonomyProfile(nextQuarter);
  };

  const commonKeys = anchorProfile.keys.filter((key) => alignedProfile.map.has(key));
  let missingKeys = anchorProfile.keys.filter((key) => !alignedProfile.map.has(key));
  let extraKeys = alignedProfile.keys.filter((key) => !anchorProfile.map.has(key));

  if (missingKeys.length === 1 && extraKeys.length >= 1 && extraKeys.length <= 3 && commonKeys.length >= 2) {
    const missingAnchorRow = anchorProfile.map.get(missingKeys[0]);
    const extraRows = alignedRows.filter((item) => extraKeys.includes(item.key));
    const extraValue = extraRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    const anchorMissingShare = safeNumber(missingAnchorRow?.valueBn) / Math.max(safeNumber(anchorQuarter?.totalRevenueBn), 0.001);
    const quarterExtraShare = extraValue / Math.max(safeNumber(quarter?.totalRevenueBn), 0.001);
    const comparableBundleShare =
      (anchorMissingShare > 0.1 && quarterExtraShare > 0.1 && quarterExtraShare / Math.max(anchorMissingShare, 0.001) >= 0.55 && quarterExtraShare / Math.max(anchorMissingShare, 0.001) <= 1.8) ||
      Math.abs(anchorMissingShare - quarterExtraShare) <= 0.18;
    if (comparableBundleShare) {
      const canonicalMeta = canonicalBarSegmentMeta(company?.id, missingAnchorRow?.key, missingAnchorRow?.name || "Segment", missingAnchorRow?.nameZh || "");
      alignedRows = alignedRows.filter((item) => !extraKeys.includes(item.key));
      alignedRows.push({
        key: missingAnchorRow.key,
        name: canonicalMeta.name || missingAnchorRow.name || "Segment",
        nameZh: canonicalMeta.nameZh || missingAnchorRow.nameZh || translateBusinessLabelToZh(missingAnchorRow.name || "Segment"),
        valueBn: Number(extraValue.toFixed(3)),
      });
      bundledReplacement = true;
      recomputeProfile();
      missingKeys = anchorProfile.keys.filter((key) => !alignedProfile.map.has(key));
      extraKeys = alignedProfile.keys.filter((key) => !anchorProfile.map.has(key));
    }
  }

  const recomputedCommonKeys = anchorProfile.keys.filter((key) => alignedProfile.map.has(key));
  const unionSize = new Set([...anchorProfile.keys, ...alignedProfile.keys]).size || 1;
  const jaccard = recomputedCommonKeys.length / unionSize;
  const missingAnchorShare = missingKeys.reduce((sum, key) => sum + safeNumber(anchorProfile.map.get(key)?.valueBn), 0) / Math.max(safeNumber(anchorQuarter?.totalRevenueBn), 0.001);
  const extraQuarterShare = extraKeys.reduce((sum, key) => sum + safeNumber(alignedProfile.map.get(key)?.valueBn), 0) / Math.max(safeNumber(quarter?.totalRevenueBn), 0.001);
  const commonAnchorShare =
    recomputedCommonKeys.reduce((sum, key) => sum + safeNumber(anchorProfile.map.get(key)?.valueBn), 0) / Math.max(safeNumber(anchorQuarter?.totalRevenueBn), 0.001);
  const commonQuarterShare =
    recomputedCommonKeys.reduce((sum, key) => sum + safeNumber(alignedProfile.map.get(key)?.valueBn), 0) / Math.max(safeNumber(quarter?.totalRevenueBn), 0.001);
  const styleComparable = !!anchorStyle && anchorStyle === quarterStyle && recomputedCommonKeys.length >= 2 && commonAnchorShare >= 0.45;
  const schemaComparable =
    recomputedCommonKeys.length >= 2 &&
    (jaccard >= 0.58 || (commonAnchorShare >= 0.55 && commonQuarterShare >= 0.55 && missingAnchorShare <= 0.26 && extraQuarterShare <= 0.26));
  if (!styleComparable && !schemaComparable) {
    return { comparable: false, rows: [], reason: "schema-mismatch" };
  }

  if (extraKeys.length) {
    const optionalExtraKeys = new Set(
      extraKeys.filter((key) => {
        const row = alignedProfile.map.get(key);
        const share = safeNumber(row?.valueBn) / Math.max(safeNumber(quarter?.totalRevenueBn), 0.001);
        return isBarTaxonomyOptionalRow(row) || share <= 0.08;
      })
    );
    if (optionalExtraKeys.size) {
      alignedRows = alignedRows.filter((item) => !optionalExtraKeys.has(item.key));
    }
  }

  return {
    comparable: true,
    rows: alignedRows
      .filter((item) => safeNumber(item?.valueBn) > 0.02)
      .map((item) => ({ ...item, valueBn: Number(safeNumber(item.valueBn).toFixed(3)) }))
      .sort((left, right) => safeNumber(right?.valueBn) - safeNumber(left?.valueBn)),
    reason: bundledReplacement ? "schema-bundled" : "schema-compatible",
  };
}

function buildRevenueSegmentBarHistory(company, anchorQuarterKey, maxQuarters = 30, options = {}) {
  const structureQuarterMap =
    company?.officialRevenueStructureHistory?.quarters && typeof company.officialRevenueStructureHistory.quarters === "object"
      ? company.officialRevenueStructureHistory.quarters
      : {};
  const financialQuarterKeys = Array.isArray(company?.quarters) ? company.quarters : [];
  const structureQuarterKeys = Object.keys(structureQuarterMap || {});
  const quarterKeys = filterQuarterKeysByClassificationPolicy(
    company,
    [...new Set([...financialQuarterKeys, ...structureQuarterKeys])]
    .filter((quarterKey) => /^\d{4}Q[1-4]$/.test(quarterKey))
    .sort((left, right) => quarterSortValue(left) - quarterSortValue(right))
  );
  if (!quarterKeys.length) return null;
  const allValidQuarterKeys = quarterKeys.filter((quarterKey) => {
    const entry = company?.financials?.[quarterKey];
    const structurePayload = structureQuarterMap?.[quarterKey];
    const structureSegments = Array.isArray(structurePayload?.segments) ? structurePayload.segments : [];
    const structureSum = structureSegments.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    const hasRevenue = safeNumber(entry?.revenueBn, null) > 0.02 || safeNumber(structurePayload?.displayRevenueBn, null) > 0.02 || structureSum > 0.02;
    const hasSegments =
      (Array.isArray(entry?.officialRevenueSegments) && entry.officialRevenueSegments.some((item) => safeNumber(item?.valueBn) > 0.02)) ||
      structureSegments.some((item) => safeNumber(item?.valueBn) > 0.02);
    return hasRevenue || hasSegments;
  });
  if (!allValidQuarterKeys.length) return null;

  const windowSize = Math.max(1, Math.floor(safeNumber(maxQuarters, 30)));
  const resolvedAnchorQuarterKey =
    (anchorQuarterKey && parseQuarterKey(anchorQuarterKey) && anchorQuarterKey) || allValidQuarterKeys[allValidQuarterKeys.length - 1] || null;
  if (!resolvedAnchorQuarterKey) return null;
  const anchorSort = quarterSortValue(resolvedAnchorQuarterKey);
  const anchorBoundKeys = allValidQuarterKeys.filter((quarterKey) => quarterSortValue(quarterKey) <= anchorSort);
  const selectedQuarterKeys = (anchorBoundKeys.length ? anchorBoundKeys : allValidQuarterKeys).slice(-windowSize);
  if (!selectedQuarterKeys.length) return null;
  const displayPeriodTypes = Array.isArray(company?.classificationPolicy?.displayPeriodTypes)
    ? company.classificationPolicy.displayPeriodTypes.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const usesNonQuarterDisplayWindow =
    !!company?.classificationPolicy?.displayOfficiallyClassifiedPeriodsOnly &&
    displayPeriodTypes.some((item) => item === "half-year" || item === "annual");
  const requestedWindowCount =
    usesNonQuarterDisplayWindow || selectedQuarterKeys.length < windowSize ? selectedQuarterKeys.length : windowSize;
  const windowUnitLabel = usesNonQuarterDisplayWindow ? "periods" : "quarters";
  const windowUnitLabelZh = usesNonQuarterDisplayWindow ? "个披露期" : "个季度";
  const includeAllQuarters = options?.includeAllQuarters === true;
  const historyQuarterKeys = allValidQuarterKeys;

  let quarters = historyQuarterKeys.map((quarterKey) => {
    const entry = company.financials?.[quarterKey] || null;
    const structurePayload = structureQuarterMap?.[quarterKey] || null;
    const sourceSelection = selectQuarterBarSource(company, entry, structurePayload);
    const rawSegments = sourceSelection.rows;
    const displayConfig = resolveBarQuarterDisplayConfig(company, entry, structurePayload);
    const scaledSegments = scaleBarSegmentRows(rawSegments, displayConfig.displayScaleFactor);
    const scaledSegmentSum = scaledSegments.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
    const revenueBnRaw = safeNumber(entry?.revenueBn, null);
    const revenueBnDisplay = revenueBnRaw > 0.02 ? revenueBnRaw * safeNumber(displayConfig.displayScaleFactor, 1) : null;
    const structureDisplayRevenueBn = safeNumber(structurePayload?.displayRevenueBn, null);
    const resolvedRevenueBn =
      revenueBnDisplay > 0.02
        ? revenueBnDisplay
        : structureDisplayRevenueBn > 0.02
          ? structureDisplayRevenueBn
          : scaledSegmentSum;
    const wasReportedOnlyRaw = scaledSegments.length === 1 && scaledSegments[0].key === "reportedrevenue";
    const rawSegmentKeys = [...new Set(scaledSegments.map((item) => item.key).filter(Boolean))].sort();
    const methodTag = resolvedBarBridgeStyle(company, entry, structurePayload, scaledSegments);
    const segmentSchemaTag = methodTag ? `style:${methodTag}` : rawSegmentKeys.length ? `keys:${rawSegmentKeys.join("|")}` : "schema:unknown";
    const segmentSchemaFamily =
      methodTag ||
      (rawSegmentKeys.length >= 2 ? `legacy:${rawSegmentKeys.slice(0, 3).join("|")}` : rawSegmentKeys.length === 1 ? `single:${rawSegmentKeys[0]}` : "unknown");
    const reconciled = reconcileBarSegmentRowsToRevenue(company, scaledSegments, resolvedRevenueBn, {
      minCoverageForResidualAddition: methodTag ? 0.36 : 0.62,
    });
    const segmentRows = reconciled.rows;
    const segmentMap = Object.fromEntries(segmentRows.map((item) => [item.key, safeNumber(item.valueBn)]));
    return {
      quarterKey,
      entry,
      structurePayload,
      label: formatBarQuarterLabel(entry, quarterKey),
      segmentMap,
      segmentRows,
      totalRevenueBn: Number(safeNumber(resolvedRevenueBn).toFixed(3)),
      displayCurrency: displayConfig.displayCurrency,
      sourceCurrency: displayConfig.sourceCurrency,
      displayScaleFactor: Number(safeNumber(displayConfig.displayScaleFactor, 1).toFixed(6)),
      hasRevenueValue: safeNumber(resolvedRevenueBn, null) > 0.02,
      hasRawSegments: scaledSegments.length > 0,
      wasReportedOnlyRaw,
      rawCoverageRatio: reconciled.coverageRatio,
      insufficientSegments: !!reconciled.insufficientCoverage,
      reconciliationMode: reconciled.reconciliationMode,
      segmentSchemaTag,
      segmentSchemaFamily,
      isImputedSegments: false,
      isBackfilledSegments: false,
      isSmoothedSegments: false,
      isMissingQuarterData: false,
      bridgeStyle: methodTag || null,
      allowsSyntheticHarmonization: !!methodTag,
      rawSegmentRows: scaledSegments.map((item) => ({ ...item })),
      rawSegmentSource: sourceSelection.source,
      rawSegmentSourceScore: sourceSelection.score,
    };
  });

  const taxonomyPhases = buildBarTaxonomyPhases(company, quarters);
  applyBarTaxonomyPhaseAlignment(company, quarters, taxonomyPhases);

  const multiSegmentQuarterCount = quarters.filter((quarter) => quarter.segmentRows.length >= 2).length;
  if (multiSegmentQuarterCount > 0) {
    quarters.forEach((quarter) => {
      const looksLikeSingleSegmentGap =
        quarter.segmentRows.length === 1 &&
        quarter.hasRevenueValue &&
        quarter.hasRawSegments &&
        !quarter.wasReportedOnlyRaw;
      if (!looksLikeSingleSegmentGap) return;
      quarter.insufficientSegments = true;
      if (quarter.reconciliationMode === "none") {
        quarter.reconciliationMode = "single-segment-gap";
      }
    });
  }
  const rowShareMap = (rows = []) => {
    const total = rows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    if (!(total > 0.02)) return {};
    return Object.fromEntries(rows.map((item) => [item.key, safeNumber(item.valueBn) / total]));
  };
  const normalizeShareMap = (shareMap = {}) => {
    const rows = Object.entries(shareMap).filter(([, value]) => safeNumber(value) > 0);
    const total = rows.reduce((sum, [, value]) => sum + safeNumber(value), 0);
    if (!(total > 0.000001)) return {};
    return Object.fromEntries(rows.map(([key, value]) => [key, safeNumber(value) / total]));
  };
  const synthesizeRowsFromShares = (quarter, templateRows = [], shareMap = {}) => {
    const normalizedShareMap = normalizeShareMap(shareMap);
    const totalRevenueBn = safeNumber(quarter?.totalRevenueBn, 0);
    if (!(totalRevenueBn > 0.02)) return [];
    const templateMeta = new Map((templateRows || []).map((row) => [row.key, row]));
    const keys = Object.keys(normalizedShareMap);
    if (!keys.length) return [];
    const syntheticRows = keys.map((key) => {
      const template = templateMeta.get(key);
      const canonicalMeta = canonicalBarSegmentMeta(company?.id, key, template?.name || "Segment", template?.nameZh || "");
      return {
        key,
        name: canonicalMeta.name || template?.name || "Segment",
        nameZh: canonicalMeta.nameZh || template?.nameZh || translateBusinessLabelToZh(template?.name || "Segment"),
        valueBn: Number((totalRevenueBn * safeNumber(normalizedShareMap[key])).toFixed(3)),
      };
    });
    const syntheticTotal = syntheticRows.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
    const residual = Number((totalRevenueBn - syntheticTotal).toFixed(3));
    if (Math.abs(residual) > 0.004 && syntheticRows.length) {
      syntheticRows[0].valueBn = Number((safeNumber(syntheticRows[0].valueBn) + residual).toFixed(3));
    }
    return syntheticRows.sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn));
  };
  const stableQuarterKeys = (quarter) =>
    [...new Set((quarter?.segmentRows || []).map((item) => item.key).filter((key) => key && key !== "otherrevenue" && key !== "reportedrevenue"))].sort();
  const rebuildQuarterRows = (quarter, nextRows = []) => {
    const sortedRows = [...(nextRows || [])]
      .filter((item) => safeNumber(item?.valueBn) > 0.02)
      .map((item) => ({
        ...item,
        valueBn: Number(safeNumber(item.valueBn).toFixed(3)),
      }))
      .sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn));
    quarter.segmentRows = sortedRows;
    quarter.segmentMap = Object.fromEntries(sortedRows.map((item) => [item.key, safeNumber(item.valueBn)]));
  };
  const appendReconciliationMode = (quarter, mode) => {
    if (!quarter || !mode) return;
    if (quarter.reconciliationMode === "none") {
      quarter.reconciliationMode = mode;
      return;
    }
    if (String(quarter.reconciliationMode || "").includes(mode)) return;
    quarter.reconciliationMode = `${quarter.reconciliationMode}+${mode}`;
  };
  if (String(company?.id || "").toLowerCase() === "alphabet") {
    quarters.forEach((quarter) => {
      const quarterKeys = stableQuarterKeys(quarter);
      const hasLegacyGoogleSchema = quarterKeys.includes("googleservices") && !quarterKeys.includes("adrevenue");
      if (!hasLegacyGoogleSchema || safeNumber(quarter.rawCoverageRatio, 1) >= 0.78) return;
      quarter.insufficientSegments = true;
      quarter.reconciliationMode =
        quarter.reconciliationMode === "none" ? "legacy-schema-partial" : `${quarter.reconciliationMode}+legacy-schema-partial`;
    });
  }
  const quarterHasLegacyNvidiaSchema = (quarter) => {
    if (String(company?.id || "").toLowerCase() !== "nvidia") return false;
    const quarterKeys = stableQuarterKeys(quarter);
    return quarterKeys.length === 2 && quarterKeys.includes("gpu") && quarterKeys.includes("tegraprocessor");
  };
  if (String(company?.id || "").toLowerCase() === "nvidia") {
    quarters.forEach((quarter) => {
      if (!quarterHasLegacyNvidiaSchema(quarter)) return;
      quarter.insufficientSegments = true;
      quarter.reconciliationMode =
        quarter.reconciliationMode === "none" ? "legacy-coarse-taxonomy" : `${quarter.reconciliationMode}+legacy-coarse-taxonomy`;
    });
  }
  const conceptualRevenueComponentHints = [
    "sales and other operating revenue",
    "income from equity affiliates",
    "other revenue interest",
    "fees and commissions",
    "service charges",
    "noninterest income",
    "interest income expense net",
  ];
  const isConceptualRevenueComponentRow = (row) => {
    const normalized = normalizeSegmentLabel(row?.name || row?.key || "");
    if (!normalized) return false;
    return conceptualRevenueComponentHints.some((hint) => normalized.includes(hint));
  };
  const quarterHasConceptualTaxonomy = (quarter) => {
    const substantiveRows = (quarter?.rawSegmentRows || []).filter((item) => {
      if (!item?.key || item.key === "reportedrevenue" || safeNumber(item?.valueBn) <= 0.02) return false;
      return !isBarTaxonomyOptionalRow(item);
    });
    return substantiveRows.length >= 2 && substantiveRows.every((item) => isConceptualRevenueComponentRow(item));
  };
  const reliableTemplateIndexes = [];
  const reliableTemplateIndexesBySchema = new Map();
  const reliableTemplateIndexesByPhase = new Map();
  quarters.forEach((quarter, index) => {
    const reliableRawSegments =
      quarter.hasRawSegments &&
      !quarter.wasReportedOnlyRaw &&
      !quarter.insufficientSegments &&
      !quarterHasConceptualTaxonomy(quarter) &&
      (multiSegmentQuarterCount === 0 || quarter.segmentRows.length >= 2) &&
      (quarter.allowsSyntheticHarmonization ||
        (quarter.rawSegmentSource !== "fallback-reported" &&
          safeNumber(quarter.rawCoverageRatio, 0) >= 0.78 &&
          safeNumber(quarter.rawCoverageRatio, 0) <= 1.22));
    if (!(quarter.segmentRows.length && reliableRawSegments)) return;
    reliableTemplateIndexes.push(index);
    if (!reliableTemplateIndexesBySchema.has(quarter.segmentSchemaTag)) {
      reliableTemplateIndexesBySchema.set(quarter.segmentSchemaTag, []);
    }
    reliableTemplateIndexesBySchema.get(quarter.segmentSchemaTag).push(index);
    if (quarter.taxonomyPhaseId !== null && quarter.taxonomyPhaseId !== undefined) {
      if (!reliableTemplateIndexesByPhase.has(quarter.taxonomyPhaseId)) {
        reliableTemplateIndexesByPhase.set(quarter.taxonomyPhaseId, []);
      }
      reliableTemplateIndexesByPhase.get(quarter.taxonomyPhaseId).push(index);
    }
  });
  const dominantReliablePhaseEntry = [...reliableTemplateIndexesByPhase.entries()]
    .sort((left, right) => right[1].length - left[1].length)[0] || null;
  const dominantReliablePhaseId = dominantReliablePhaseEntry?.[0] ?? null;
  const dominantReliablePhaseIndexes = dominantReliablePhaseEntry?.[1] || [];
  const pickNearestIndex = (indexes = [], currentIndex) => {
    if (!indexes.length) return null;
    let nearest = indexes[0];
    let nearestDistance = Math.abs(currentIndex - nearest);
    indexes.forEach((candidateIndex) => {
      const distance = Math.abs(currentIndex - candidateIndex);
      if (distance < nearestDistance) {
        nearest = candidateIndex;
        nearestDistance = distance;
        return;
      }
      if (distance === nearestDistance && candidateIndex < currentIndex && nearest > currentIndex) {
        nearest = candidateIndex;
      }
    });
    return nearest;
  };
  const pickTemplateIndex = (quarter, index) => {
    const sameSchemaCandidates = reliableTemplateIndexesBySchema.get(quarter.segmentSchemaTag) || [];
    const sameSchemaNearest = pickNearestIndex(sameSchemaCandidates, index);
    if (sameSchemaNearest !== null && sameSchemaNearest !== undefined) return sameSchemaNearest;
    const samePhaseCandidates =
      quarter.taxonomyPhaseId !== null && quarter.taxonomyPhaseId !== undefined
        ? reliableTemplateIndexesByPhase.get(quarter.taxonomyPhaseId) || []
        : [];
    const samePhaseNearest = pickNearestIndex(samePhaseCandidates, index);
    if (samePhaseNearest !== null && samePhaseNearest !== undefined) return samePhaseNearest;
    const sameFamilyCandidates = reliableTemplateIndexes.filter(
      (candidateIndex) =>
        quarters[candidateIndex]?.segmentSchemaFamily === quarter.segmentSchemaFamily &&
        (quarter.taxonomyPhaseId === null ||
          quarter.taxonomyPhaseId === undefined ||
          quarters[candidateIndex]?.taxonomyPhaseId === quarter.taxonomyPhaseId)
    );
    const sameFamilyNearest = pickNearestIndex(sameFamilyCandidates, index);
    if (sameFamilyNearest !== null && sameFamilyNearest !== undefined) return sameFamilyNearest;
    const futureCandidates = reliableTemplateIndexes.filter((candidateIndex) => candidateIndex > index);
    if (String(quarter?.reconciliationMode || "").includes("legacy-schema-partial") && futureCandidates.length) {
      return futureCandidates[0];
    }
    const pastCandidates = reliableTemplateIndexes.filter((candidateIndex) => candidateIndex < index);
    if (pastCandidates.length) return pastCandidates[pastCandidates.length - 1];
    if (futureCandidates.length) return futureCandidates[0];
    return null;
  };
  const averagedShareMapForIndexes = (indexes = []) => {
    const normalizedIndexes = indexes.filter((value) => Number.isInteger(value) && quarters[value]?.segmentRows?.length >= 2);
    if (!normalizedIndexes.length) return {};
    const aggregate = {};
    normalizedIndexes.forEach((quarterIndex) => {
      const shareMap = rowShareMap(quarters[quarterIndex].segmentRows);
      Object.entries(shareMap).forEach(([key, value]) => {
        aggregate[key] = (aggregate[key] || 0) + safeNumber(value);
      });
    });
    return normalizeShareMap(
      Object.fromEntries(Object.entries(aggregate).map(([key, value]) => [key, safeNumber(value) / normalizedIndexes.length]))
    );
  };
  const quarterNeedsAutoTemplateFill = (quarter) =>
    quarter.hasRevenueValue &&
    (quarter.segmentRows.length < 2 || quarter.wasReportedOnlyRaw || quarter.insufficientSegments || quarterHasConceptualTaxonomy(quarter));
  const quarterHasOnlyCoarseTaxonomy = (quarter) => {
    const substantiveRows = (quarter?.rawSegmentRows || []).filter((item) => {
      if (!item?.key || item.key === "reportedrevenue" || safeNumber(item?.valueBn) <= 0.02) return false;
      return !isBarTaxonomyOptionalRow(item);
    });
    return (
      !quarter?.hasRawSegments ||
      quarter?.wasReportedOnlyRaw ||
      substantiveRows.length <= 1 ||
      quarterHasConceptualTaxonomy(quarter) ||
      quarterHasLegacyNvidiaSchema(quarter)
    );
  };
  const quarterAllowsAggressiveNeighborRebalance = (quarter) => {
    const rawCoverage = safeNumber(quarter?.rawCoverageRatio, null);
    const totalRevenueBn = Math.max(safeNumber(quarter?.totalRevenueBn), 0.001);
    const residualShare = safeNumber(quarter?.segmentMap?.otherrevenue, 0) / totalRevenueBn;
    const rawSource = String(quarter?.rawSegmentSource || "");
    const hasTrustedReportedSegments =
      quarter?.hasRawSegments &&
      !quarter?.wasReportedOnlyRaw &&
      !quarter?.insufficientSegments &&
      !quarter?.isBackfilledSegments &&
      !quarter?.isImputedSegments &&
      rawSource !== "fallback-reported" &&
      rawSource !== "none" &&
      !quarterHasConceptualTaxonomy(quarter) &&
      (rawCoverage === null || (rawCoverage >= 0.94 && rawCoverage <= 1.12)) &&
      residualShare <= 0.05;
    return !hasTrustedReportedSegments;
  };
  const canUseExtendedTemplateFill = (quarter, templateIndex) => {
    if (quarter.allowsSyntheticHarmonization) return true;
    if (!Number.isInteger(templateIndex)) return false;
    if (dominantReliablePhaseId === null || dominantReliablePhaseId === undefined) return false;
    if ((quarters[templateIndex]?.taxonomyPhaseId ?? null) !== dominantReliablePhaseId) return false;
    if (dominantReliablePhaseIndexes.length < 6) return false;
    if (quarterHasOnlyCoarseTaxonomy(quarter)) return true;
    return String(quarter?.reconciliationMode || "").includes("legacy-schema-partial");
  };
  const phaseEdgeTemplateSharePayload = (quarter, templateIndex) => {
    if (!Number.isInteger(templateIndex)) return null;
    const templateQuarter = quarters[templateIndex];
    if (!templateQuarter?.segmentRows?.length) return null;
    const templatePhaseIndexes =
      templateQuarter.taxonomyPhaseId !== null && templateQuarter.taxonomyPhaseId !== undefined
        ? reliableTemplateIndexesByPhase.get(templateQuarter.taxonomyPhaseId) || [templateIndex]
        : [templateIndex];
    const isBeforePhase = templatePhaseIndexes.length && quarterSortValue(quarter.quarterKey) < quarterSortValue(quarters[templatePhaseIndexes[0]].quarterKey);
    const isAfterPhase =
      templatePhaseIndexes.length &&
      quarterSortValue(quarter.quarterKey) > quarterSortValue(quarters[templatePhaseIndexes[templatePhaseIndexes.length - 1]].quarterKey);
    if (!isBeforePhase && !isAfterPhase) return null;
    const sampleIndexes = isBeforePhase ? templatePhaseIndexes.slice(0, 3) : templatePhaseIndexes.slice(-3);
    const shareMap = averagedShareMapForIndexes(sampleIndexes);
    if (!Object.keys(shareMap).length) return null;
    const referenceQuarter = quarters[sampleIndexes[0]] || templateQuarter;
    return {
      templateRows: referenceQuarter.segmentRows || templateQuarter.segmentRows || [],
      shareMap,
    };
  };

  for (let index = 1; index < quarters.length - 1; index += 1) {
    const quarter = quarters[index];
    const previousQuarter = quarters[index - 1];
    const nextQuarter = quarters[index + 1];
    if (!quarter?.hasRevenueValue) continue;
    if (!quarter?.allowsSyntheticHarmonization || !previousQuarter?.allowsSyntheticHarmonization || !nextQuarter?.allowsSyntheticHarmonization) continue;
    const previousKeys = stableQuarterKeys(previousQuarter);
    const nextKeys = stableQuarterKeys(nextQuarter);
    if (!previousKeys.length || previousKeys.join("|") !== nextKeys.join("|")) continue;
    const currentKeys = stableQuarterKeys(quarter);
    if (!currentKeys.length || currentKeys.some((key) => !previousKeys.includes(key))) continue;
    const missingKeys = previousKeys.filter((key) => !currentKeys.includes(key));
    if (!missingKeys.length || missingKeys.length > 2) continue;
    const rawResidualValue = safeNumber(quarter.segmentMap?.otherrevenue, 0);
    const currentStableTotal = (quarter.segmentRows || []).reduce((sum, item) => {
      if (!item?.key || item.key === "otherrevenue" || item.key === "reportedrevenue") return sum;
      return sum + safeNumber(item.valueBn);
    }, 0);
    const availableGapValue = rawResidualValue > 0.02 ? rawResidualValue : Math.max(safeNumber(quarter.totalRevenueBn) - currentStableTotal, 0);
    if (!(availableGapValue > 0.12)) continue;
    const previousShares = rowShareMap(previousQuarter.segmentRows);
    const nextShares = rowShareMap(nextQuarter.segmentRows);
    const weightByMissingKey = Object.fromEntries(
      missingKeys.map((key) => [key, Math.max((safeNumber(previousShares[key]) + safeNumber(nextShares[key])) / 2, 0)])
    );
    const totalMissingWeight = Object.values(weightByMissingKey).reduce((sum, value) => sum + safeNumber(value), 0);
    if (!(totalMissingWeight > 0.000001)) continue;
    const missingRows = missingKeys
      .map((key) => {
        const estimatedValueBn = Number((availableGapValue * safeNumber(weightByMissingKey[key]) / totalMissingWeight).toFixed(3));
        if (!(estimatedValueBn > 0.02)) return null;
        const templateRow =
          previousQuarter.segmentRows.find((item) => item.key === key) ||
          nextQuarter.segmentRows.find((item) => item.key === key) ||
          null;
        const canonicalMeta = canonicalBarSegmentMeta(company?.id, key, templateRow?.name || "Segment", templateRow?.nameZh || "");
        return {
          key,
          name: canonicalMeta.name || templateRow?.name || "Segment",
          nameZh: canonicalMeta.nameZh || templateRow?.nameZh || translateBusinessLabelToZh(templateRow?.name || "Segment"),
          valueBn: estimatedValueBn,
        };
      })
      .filter(Boolean);
    const missingValueTotal = missingRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
    if (!(missingValueTotal > 0.02)) continue;
    const nextRows = (quarter.segmentRows || []).filter((item) => item.key !== "otherrevenue");
    nextRows.push(...missingRows);
    const residualAfterFill = Number((availableGapValue - missingValueTotal).toFixed(3));
    if (residualAfterFill > 0.03) {
      const residualMeta = canonicalBarSegmentMeta(company?.id, "otherrevenue", "Other revenue", "其他营收");
      nextRows.push({
        key: canonicalBarSegmentKey(company?.id, "otherrevenue", "Other revenue"),
        name: residualMeta.name,
        nameZh: residualMeta.nameZh,
        valueBn: residualAfterFill,
      });
    }
    rebuildQuarterRows(quarter, nextRows);
    quarter.isBackfilledSegments = true;
    quarter.reconciliationMode =
      quarter.reconciliationMode === "none" ? "stable-key-gap-filled" : `${quarter.reconciliationMode}+stable-key-gap-filled`;
  }

  for (let index = 1; index < quarters.length - 1; index += 1) {
    const quarter = quarters[index];
    const previousQuarter = quarters[index - 1];
    const nextQuarter = quarters[index + 1];
    if (!quarter?.hasRevenueValue) continue;
    if (!quarter?.allowsSyntheticHarmonization || !previousQuarter?.allowsSyntheticHarmonization || !nextQuarter?.allowsSyntheticHarmonization) continue;
    if (!(previousQuarter?.segmentRows?.length >= 2 && nextQuarter?.segmentRows?.length >= 2)) continue;
    const previousKeys = [...new Set(previousQuarter.segmentRows.map((item) => item.key))].sort();
    const nextKeys = [...new Set(nextQuarter.segmentRows.map((item) => item.key))].sort();
    if (!previousKeys.length || previousKeys.join("|") !== nextKeys.join("|")) continue;
    const quarterKeys = [...new Set((quarter.segmentRows || []).map((item) => item.key))].sort();
    const needsGapFill =
      !quarter.segmentRows.length ||
      quarter.segmentRows.length < 2 ||
      quarter.wasReportedOnlyRaw ||
      quarter.insufficientSegments ||
      quarter.reconciliationMode === "coverage-too-low";
    const isolatedSchema = quarterKeys.join("|") !== previousKeys.join("|");
    if (!needsGapFill && !isolatedSchema) continue;
    if (isolatedSchema && quarter.segmentRows.length >= 2) {
      const shareMap = rowShareMap(quarter.segmentRows);
      const topShare = Math.max(0, ...Object.values(shareMap).map((value) => safeNumber(value)));
      const coverage = safeNumber(quarter.rawCoverageRatio, 1);
      if (topShare < 0.82 && coverage >= 0.7 && coverage <= 1.28) continue;
    }
    const previousShares = rowShareMap(previousQuarter.segmentRows);
    const nextShares = rowShareMap(nextQuarter.segmentRows);
    const blendedShares = {};
    previousKeys.forEach((key) => {
      blendedShares[key] = (safeNumber(previousShares[key]) + safeNumber(nextShares[key])) / 2;
    });
    const syntheticRows = synthesizeRowsFromShares(quarter, previousQuarter.segmentRows, blendedShares);
    if (!syntheticRows.length) continue;
    quarter.segmentRows = syntheticRows;
    quarter.segmentMap = Object.fromEntries(syntheticRows.map((item) => [item.key, safeNumber(item.valueBn)]));
    quarter.segmentSchemaTag = previousQuarter.segmentSchemaTag;
    quarter.segmentSchemaFamily = previousQuarter.segmentSchemaFamily;
    quarter.isBackfilledSegments = true;
    quarter.isSmoothedSegments = true;
    quarter.reconciliationMode =
      quarter.reconciliationMode === "none"
        ? "neighbor-schema-harmonized"
        : `${quarter.reconciliationMode}+neighbor-schema-harmonized`;
  }

  if (reliableTemplateIndexes.length) {
    quarters.forEach((quarter, index) => {
      if (!quarterNeedsAutoTemplateFill(quarter)) return;
      let templateIndex = pickTemplateIndex(quarter, index);
      const shouldPreferDominantPhaseTemplate =
        !quarter.allowsSyntheticHarmonization &&
        dominantReliablePhaseIndexes.length >= 6 &&
        (quarterHasOnlyCoarseTaxonomy(quarter) || String(quarter?.reconciliationMode || "").includes("legacy-schema-partial"));
      if (shouldPreferDominantPhaseTemplate) {
        const dominantTemplateIndex = pickNearestIndex(dominantReliablePhaseIndexes, index);
        if (dominantTemplateIndex !== null && dominantTemplateIndex !== undefined) {
          templateIndex = dominantTemplateIndex;
        }
      }
      if (templateIndex === null || templateIndex === undefined) return;
      const extendedTemplateFill = canUseExtendedTemplateFill(quarter, templateIndex);
      if (!extendedTemplateFill) return;
      const maxTemplateDistance =
        !quarter.allowsSyntheticHarmonization || String(quarter.reconciliationMode || "").includes("legacy-schema-partial") ? 16 : 4;
      if (Math.abs(templateIndex - index) > maxTemplateDistance) return;
      const edgePayload = phaseEdgeTemplateSharePayload(quarter, templateIndex);
      const templateRows = edgePayload?.templateRows || quarters[templateIndex].segmentRows || [];
      const templateShares = edgePayload?.shareMap || rowShareMap(templateRows);
      const syntheticRows = synthesizeRowsFromShares(quarter, templateRows, templateShares);
      if (!syntheticRows.length) return;
      quarter.segmentRows = syntheticRows;
      quarter.segmentMap = Object.fromEntries(syntheticRows.map((item) => [item.key, safeNumber(item.valueBn)]));
      quarter.segmentSchemaTag = quarters[templateIndex].segmentSchemaTag;
      quarter.segmentSchemaFamily = quarters[templateIndex].segmentSchemaFamily;
      quarter.isBackfilledSegments = true;
      quarter.isImputedSegments = !quarter.allowsSyntheticHarmonization;
      if (quarter.taxonomyPhaseId === null || quarter.taxonomyPhaseId === undefined) {
        quarter.taxonomyPhaseId = quarters[templateIndex]?.taxonomyPhaseId ?? quarter.taxonomyPhaseId;
      }
      quarter.reconciliationMode =
        quarter.reconciliationMode === "none"
          ? "template-harmonized"
          : String(quarter.reconciliationMode || "").includes("template-harmonized")
            ? quarter.reconciliationMode
            : `${quarter.reconciliationMode}+template-harmonized`;
    });
  }

  quarters.forEach((quarter) => {
    if (!quarter?.isBackfilledSegments || !quarter?.segmentRows?.length) return;
    const shouldPromoteSyntheticRows =
      quarter.wasReportedOnlyRaw || quarter.insufficientSegments || quarterHasConceptualTaxonomy(quarter);
    if (!shouldPromoteSyntheticRows) return;
    quarter.rawSegmentRows = quarter.segmentRows.map((item) => ({ ...item }));
    quarter.rawCoverageRatio = 1;
    quarter.insufficientSegments = false;
    quarter.wasReportedOnlyRaw = false;
    quarter.hasRawSegments = true;
  });

  const finalTaxonomyPhases = buildBarTaxonomyPhases(company, quarters);
  applyBarTaxonomyPhaseAlignment(company, quarters, finalTaxonomyPhases);

  quarters.forEach((quarter) => {
    if (!quarter?.hasRevenueValue || !Array.isArray(quarter.segmentRows) || !quarter.segmentRows.length) return;
    const totalRevenueBn = Math.max(safeNumber(quarter.totalRevenueBn), 0.001);
    const residualRow = quarter.segmentRows.find((item) => item?.key === "otherrevenue") || null;
    const residualShare = safeNumber(residualRow?.valueBn) / totalRevenueBn;
    const isSparseOfficialSegmentResidual =
      !quarter.bridgeStyle &&
      quarter.rawSegmentSource === "official-segments" &&
      safeNumber(quarter.rawCoverageRatio, 0) < 0.72 &&
      residualShare > 0.28;
    if (isSparseOfficialSegmentResidual) {
      quarter.segmentRows = [];
      quarter.segmentMap = {};
      quarter.hasRawSegments = false;
      quarter.insufficientSegments = true;
      quarter.allowsSyntheticHarmonization = false;
      quarter.reconciliationMode =
        quarter.reconciliationMode === "none" ? "residual-dominant" : `${quarter.reconciliationMode}+residual-dominant`;
      return;
    }
    const tinyOptionalRows = quarter.segmentRows.filter((item) => {
      const share = safeNumber(item?.valueBn) / totalRevenueBn;
      return isBarTaxonomyOptionalRow(item) && share < 0.015;
    });
    if (!tinyOptionalRows.length) return;
    quarter.segmentRows = quarter.segmentRows.filter((item) => !tinyOptionalRows.includes(item));
    quarter.segmentMap = Object.fromEntries(quarter.segmentRows.map((item) => [item.key, safeNumber(item.valueBn)]));
  });

  for (let index = 1; index < quarters.length - 1; index += 1) {
    const quarter = quarters[index];
    const residualRow = quarter.segmentRows.find((item) => item?.key === "otherrevenue") || null;
    if (!quarter?.hasRevenueValue || !residualRow || quarter.rawSegmentSource === "official-groups") continue;
    const preserveHighCoverageOfficialBreakout =
      (quarter.rawSegmentSource === "official-segments" || quarter.rawSegmentSource === "structure-history") &&
      safeNumber(quarter.rawCoverageRatio, 0) >= 0.85 &&
      (quarter.rawSegmentRows || []).filter((item) => item?.key && item.key !== "reportedrevenue").length >= 2;
    if (preserveHighCoverageOfficialBreakout) continue;
    const previousQuarter = quarters[index - 1];
    const nextQuarter = quarters[index + 1];
    const previousKeys = stableQuarterKeys(previousQuarter);
    const currentKeys = stableQuarterKeys(quarter);
    const nextKeys = stableQuarterKeys(nextQuarter);
    if (!previousKeys.length || previousKeys.join("|") !== currentKeys.join("|") || currentKeys.join("|") !== nextKeys.join("|")) continue;
    const residualShare = safeNumber(residualRow?.valueBn) / Math.max(safeNumber(quarter.totalRevenueBn), 0.001);
    if (!(residualShare > 0.01 && residualShare <= 0.1)) continue;
    const previousShares = rowShareMap(previousQuarter.segmentRows);
    const nextShares = rowShareMap(nextQuarter.segmentRows);
    const averagedShares = {};
    currentKeys.forEach((key) => {
      averagedShares[key] = Math.max((safeNumber(previousShares[key]) + safeNumber(nextShares[key])) / 2, 0);
    });
    const totalShareWeight = Object.values(averagedShares).reduce((sum, value) => sum + safeNumber(value), 0);
    if (!(totalShareWeight > 0.000001)) continue;
    const redistributedRows = (quarter.segmentRows || [])
      .filter((item) => item.key !== "otherrevenue")
      .map((item) => ({
        ...item,
        valueBn: Number(
          (
            safeNumber(item.valueBn) +
            (safeNumber(residualRow.valueBn) * safeNumber(averagedShares[item.key])) / totalShareWeight
          ).toFixed(3)
        ),
      }));
    rebuildQuarterRows(quarter, redistributedRows);
    quarter.isSmoothedSegments = true;
    appendReconciliationMode(quarter, "residual-absorbed");
  }

  quarters.forEach((quarter) => {
    if (quarter.segmentRows.length || !quarter.hasRevenueValue) return;
    const fallbackValue = safeNumber(quarter.totalRevenueBn, 0);
    if (!(fallbackValue > 0.02)) return;
    const fallbackMeta = canonicalBarSegmentMeta(company?.id, "reportedrevenue", "Reported revenue", "报告营收");
    const fallbackRow = {
      key: canonicalBarSegmentKey(company?.id, "reportedrevenue", "Reported revenue"),
      name: fallbackMeta.name,
      nameZh: fallbackMeta.nameZh,
      valueBn: Number(fallbackValue.toFixed(3)),
    };
    quarter.segmentRows = [fallbackRow];
    quarter.segmentMap = { [fallbackRow.key]: fallbackRow.valueBn };
    quarter.reconciliationMode = quarter.reconciliationMode === "none" ? "fallback-single-segment" : quarter.reconciliationMode;
  });

  const dominantPhaseTemplateCoverage =
    reliableTemplateIndexes.length > 0 ? dominantReliablePhaseIndexes.length / reliableTemplateIndexes.length : 0;
  if (dominantReliablePhaseIndexes.length >= 6 && dominantPhaseTemplateCoverage >= 0.75) {
    quarters.forEach((quarter, index) => {
      const isReportedOnlyFallback =
        quarter.hasRevenueValue &&
        quarter.segmentRows.length === 1 &&
        quarter.segmentRows[0]?.key === "reportedrevenue";
      if (!isReportedOnlyFallback) return;
      const templateIndex = pickNearestIndex(dominantReliablePhaseIndexes, index);
      if (templateIndex === null || templateIndex === undefined) return;
      const edgePayload = phaseEdgeTemplateSharePayload(quarter, templateIndex);
      const templateRows = edgePayload?.templateRows || quarters[templateIndex]?.segmentRows || [];
      const templateShares = edgePayload?.shareMap || rowShareMap(templateRows);
      const syntheticRows = synthesizeRowsFromShares(quarter, templateRows, templateShares);
      if (!syntheticRows.length) return;
      quarter.segmentRows = syntheticRows;
      quarter.segmentMap = Object.fromEntries(syntheticRows.map((item) => [item.key, safeNumber(item.valueBn)]));
      quarter.isBackfilledSegments = true;
      quarter.isImputedSegments = true;
      if (quarter.taxonomyPhaseId === null || quarter.taxonomyPhaseId === undefined) {
        quarter.taxonomyPhaseId = dominantReliablePhaseId;
      }
      quarter.reconciliationMode =
        quarter.reconciliationMode === "none"
          ? "template-harmonized"
          : String(quarter.reconciliationMode || "").includes("template-harmonized")
            ? quarter.reconciliationMode
            : `${quarter.reconciliationMode}+template-harmonized`;
    });
  }

  const isStrictOfficialSegmentsSandwichQuarter = (quarter, previousQuarter, nextQuarter) => {
    if (
      !quarter?.hasRevenueValue ||
      !previousQuarter?.hasRevenueValue ||
      !nextQuarter?.hasRevenueValue ||
      !(previousQuarter?.segmentRows?.length >= 2 && nextQuarter?.segmentRows?.length >= 2)
    ) {
      return false;
    }
    if (String(quarter?.rawSegmentSource || "") !== "official-segments") return false;
    if (String(previousQuarter?.rawSegmentSource || "") === "fallback-reported") return false;
    if (String(nextQuarter?.rawSegmentSource || "") === "fallback-reported") return false;
    const previousKeys = stableQuarterKeys(previousQuarter);
    const nextKeys = stableQuarterKeys(nextQuarter);
    const currentKeys = stableQuarterKeys(quarter);
    if (!previousKeys.length || previousKeys.join("|") !== nextKeys.join("|")) return false;
    if (currentKeys.join("|") === previousKeys.join("|")) return false;
    const coverage = safeNumber(quarter.rawCoverageRatio, null);
    if (coverage !== null && (coverage < 0.72 || coverage > 1.6)) return false;
    const neighborAverageRevenueBn = (safeNumber(previousQuarter.totalRevenueBn) + safeNumber(nextQuarter.totalRevenueBn)) / 2;
    if (neighborAverageRevenueBn > 0.02) {
      const revenueJumpRatio = safeNumber(quarter.totalRevenueBn) / neighborAverageRevenueBn;
      if (revenueJumpRatio < 0.45 || revenueJumpRatio > 1.85) return false;
    }
    return true;
  };

  for (let index = 1; index < quarters.length - 1; index += 1) {
    const quarter = quarters[index];
    const previousQuarter = quarters[index - 1];
    const nextQuarter = quarters[index + 1];
    if (!isStrictOfficialSegmentsSandwichQuarter(quarter, previousQuarter, nextQuarter)) continue;

    const previousKeys = stableQuarterKeys(previousQuarter);
    const currentKeys = stableQuarterKeys(quarter);
    const missingKeys = previousKeys.filter((key) => !currentKeys.includes(key));
    const extraKeys = currentKeys.filter((key) => !previousKeys.includes(key));

    if (missingKeys.length && !extraKeys.length) {
      const rawResidualValue = safeNumber(quarter.segmentMap?.otherrevenue, 0);
      const currentStableTotal = (quarter.segmentRows || []).reduce((sum, item) => {
        if (!item?.key || item.key === "otherrevenue" || item.key === "reportedrevenue") return sum;
        return sum + safeNumber(item.valueBn);
      }, 0);
      const availableGapValue = rawResidualValue > 0.02 ? rawResidualValue : Math.max(safeNumber(quarter.totalRevenueBn) - currentStableTotal, 0);
      const previousShares = rowShareMap(previousQuarter.segmentRows);
      const nextShares = rowShareMap(nextQuarter.segmentRows);
      const weightByMissingKey = Object.fromEntries(
        missingKeys.map((key) => [key, Math.max((safeNumber(previousShares[key]) + safeNumber(nextShares[key])) / 2, 0)])
      );
      const totalMissingWeight = Object.values(weightByMissingKey).reduce((sum, value) => sum + safeNumber(value), 0);
      if (availableGapValue > 0.12 && totalMissingWeight > 0.000001) {
        const missingRows = missingKeys
          .map((key) => {
            const estimatedValueBn = Number((availableGapValue * safeNumber(weightByMissingKey[key]) / totalMissingWeight).toFixed(3));
            if (!(estimatedValueBn > 0.02)) return null;
            const templateRow =
              previousQuarter.segmentRows.find((item) => item.key === key) ||
              nextQuarter.segmentRows.find((item) => item.key === key) ||
              null;
            const canonicalMeta = canonicalBarSegmentMeta(company?.id, key, templateRow?.name || "Segment", templateRow?.nameZh || "");
            return {
              key,
              name: canonicalMeta.name || templateRow?.name || "Segment",
              nameZh: canonicalMeta.nameZh || templateRow?.nameZh || translateBusinessLabelToZh(templateRow?.name || "Segment"),
              valueBn: estimatedValueBn,
            };
          })
          .filter(Boolean);
        const missingValueTotal = missingRows.reduce((sum, item) => sum + safeNumber(item?.valueBn), 0);
        if (missingValueTotal > 0.02) {
          const nextRows = (quarter.segmentRows || []).filter((item) => item.key !== "otherrevenue");
          nextRows.push(...missingRows);
          const residualAfterFill = Number((availableGapValue - missingValueTotal).toFixed(3));
          if (residualAfterFill > 0.03) {
            const residualMeta = canonicalBarSegmentMeta(company?.id, "otherrevenue", "Other revenue", "其他营收");
            nextRows.push({
              key: canonicalBarSegmentKey(company?.id, "otherrevenue", "Other revenue"),
              name: residualMeta.name,
              nameZh: residualMeta.nameZh,
              valueBn: residualAfterFill,
            });
          }
          rebuildQuarterRows(quarter, nextRows);
          quarter.isBackfilledSegments = true;
          appendReconciliationMode(quarter, "strict-sandwich-gap-filled");
          continue;
        }
      }
    }

    const previousShares = rowShareMap(previousQuarter.segmentRows);
    const nextShares = rowShareMap(nextQuarter.segmentRows);
    const blendedShares = {};
    previousKeys.forEach((key) => {
      blendedShares[key] = (safeNumber(previousShares[key]) + safeNumber(nextShares[key])) / 2;
    });
    const syntheticRows = synthesizeRowsFromShares(quarter, previousQuarter.segmentRows, blendedShares);
    if (!syntheticRows.length) continue;
    quarter.segmentRows = syntheticRows;
    quarter.segmentMap = Object.fromEntries(syntheticRows.map((item) => [item.key, safeNumber(item.valueBn)]));
    quarter.segmentSchemaTag = previousQuarter.segmentSchemaTag;
    quarter.segmentSchemaFamily = previousQuarter.segmentSchemaFamily;
    quarter.isBackfilledSegments = true;
    quarter.isSmoothedSegments = true;
    appendReconciliationMode(quarter, "strict-sandwich-harmonized");
  }

  const isStrictOfficialGroupsSandwichQuarter = (quarter, previousQuarter, nextQuarter) => {
    if (
      !quarter?.hasRevenueValue ||
      !previousQuarter?.hasRevenueValue ||
      !nextQuarter?.hasRevenueValue ||
      !(previousQuarter?.segmentRows?.length >= 2 && nextQuarter?.segmentRows?.length >= 2)
    ) {
      return false;
    }
    if (String(quarter?.rawSegmentSource || "") !== "official-groups") return false;
    const previousKeys = stableQuarterKeys(previousQuarter);
    const nextKeys = stableQuarterKeys(nextQuarter);
    const currentKeys = stableQuarterKeys(quarter);
    if (!previousKeys.length || previousKeys.join("|") !== nextKeys.join("|")) return false;
    if (currentKeys.join("|") === previousKeys.join("|")) return false;
    const coverage = safeNumber(quarter.rawCoverageRatio, null);
    return coverage === null || (coverage >= 0.95 && coverage <= 1.05);
  };

  for (let index = 1; index < quarters.length - 1; index += 1) {
    const quarter = quarters[index];
    const previousQuarter = quarters[index - 1];
    const nextQuarter = quarters[index + 1];
    if (!isStrictOfficialGroupsSandwichQuarter(quarter, previousQuarter, nextQuarter)) continue;

    const targetSignature = stableQuarterKeys(previousQuarter).join("|");
    const alignment = alignQuarterRowsToAnchorRegime(company, quarter, previousQuarter);
    const alignedKeys = [...new Set((alignment.rows || []).map((item) => item?.key).filter((key) => key && key !== "otherrevenue" && key !== "reportedrevenue"))].sort();
    if (alignment.comparable && alignedKeys.join("|") === targetSignature) {
      const reconciled = reconcileBarSegmentRowsToRevenue(company, alignment.rows, quarter.totalRevenueBn, {
        minCoverageForResidualAddition: 0.62,
      });
      quarter.segmentRows = reconciled.rows;
      quarter.segmentMap = Object.fromEntries(reconciled.rows.map((item) => [item.key, safeNumber(item.valueBn)]));
      quarter.segmentSchemaTag = previousQuarter.segmentSchemaTag;
      quarter.segmentSchemaFamily = previousQuarter.segmentSchemaFamily;
      quarter.isBackfilledSegments = true;
      appendReconciliationMode(quarter, "strict-official-groups-aligned");
      continue;
    }
  }

  const shareMapForQuarter = (quarter) => {
    const total = quarter.segmentRows.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
    if (!(total > 0.02)) return {};
    return Object.fromEntries(
      quarter.segmentRows.map((item) => [item.key, safeNumber(item.valueBn) / total])
    );
  };

  for (let index = 1; index < quarters.length - 1; index += 1) {
    const quarter = quarters[index];
    const previousQuarter = quarters[index - 1];
    const nextQuarter = quarters[index + 1];
    if (
      quarter.segmentRows.length < 2 ||
      previousQuarter.segmentRows.length < 2 ||
      nextQuarter.segmentRows.length < 2 ||
      !quarter.hasRevenueValue
    ) {
      continue;
    }
    const quarterKeys = [...new Set(quarter.segmentRows.map((item) => item.key))].sort();
    const previousKeys = [...new Set(previousQuarter.segmentRows.map((item) => item.key))].sort();
    const nextKeys = [...new Set(nextQuarter.segmentRows.map((item) => item.key))].sort();
    if (
      quarterKeys.length !== previousKeys.length ||
      quarterKeys.length !== nextKeys.length ||
      quarterKeys.join("|") !== previousKeys.join("|") ||
      quarterKeys.join("|") !== nextKeys.join("|")
    ) {
      continue;
    }

    const currentShares = shareMapForQuarter(quarter);
    const previousShares = shareMapForQuarter(previousQuarter);
    const nextShares = shareMapForQuarter(nextQuarter);
    const neighborAverageRevenueBn = (safeNumber(previousQuarter.totalRevenueBn) + safeNumber(nextQuarter.totalRevenueBn)) / 2;
    const revenueJumpRatio =
      neighborAverageRevenueBn > 0.02 ? safeNumber(quarter.totalRevenueBn) / neighborAverageRevenueBn : 1;

    let maxShareDeviation = 0;
    let topShare = 0;
    quarterKeys.forEach((key) => {
      const currentShare = safeNumber(currentShares[key]);
      const neighborShare = (safeNumber(previousShares[key]) + safeNumber(nextShares[key])) / 2;
      maxShareDeviation = Math.max(maxShareDeviation, Math.abs(currentShare - neighborShare));
      topShare = Math.max(topShare, currentShare);
    });

    const shouldRebalance =
      quarterAllowsAggressiveNeighborRebalance(quarter) &&
      maxShareDeviation > 0.3 &&
      topShare > 0.68 &&
      revenueJumpRatio < 1.3 &&
      !quarter.isSmoothedSegments;
    if (!shouldRebalance) continue;

    const rebalancedRows = quarter.segmentRows.map((item) => {
      const neighborShare = (safeNumber(previousShares[item.key]) + safeNumber(nextShares[item.key])) / 2;
      const valueBn = Number((safeNumber(quarter.totalRevenueBn) * clamp(neighborShare, 0, 1)).toFixed(3));
      return {
        ...item,
        valueBn,
      };
    });
    const rebalancedTotal = rebalancedRows.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
    const residual = Number((safeNumber(quarter.totalRevenueBn) - rebalancedTotal).toFixed(3));
    if (Math.abs(residual) > 0.004 && rebalancedRows.length) {
      rebalancedRows[0].valueBn = Number((safeNumber(rebalancedRows[0].valueBn) + residual).toFixed(3));
    }
    rebalancedRows.sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn));
    quarter.segmentRows = rebalancedRows;
    quarter.segmentMap = Object.fromEntries(rebalancedRows.map((item) => [item.key, safeNumber(item.valueBn)]));
    quarter.isSmoothedSegments = true;
    quarter.reconciliationMode =
      quarter.reconciliationMode === "none"
        ? "neighbor-share-rebalanced"
        : `${quarter.reconciliationMode}+neighbor-share-rebalanced`;
  }

  const visibleQuarterKeySet = new Set(includeAllQuarters ? allValidQuarterKeys : selectedQuarterKeys);
  const visibleQuarters = quarters.filter((quarter) => visibleQuarterKeySet.has(quarter.quarterKey));
  if (!visibleQuarters.length) return null;

  const totals = new Map();
  const nameRegistry = new Map();
  visibleQuarters.forEach((quarter) => {
    quarter.segmentRows.forEach((item) => {
      totals.set(item.key, (totals.get(item.key) || 0) + safeNumber(item.valueBn));
      if (!nameRegistry.has(item.key)) {
        const canonicalMeta = canonicalBarSegmentMeta(company?.id, item.key, item.name, item.nameZh || "");
        nameRegistry.set(item.key, {
          name: canonicalMeta.name || item.name,
          nameZh: canonicalMeta.nameZh || item.nameZh || translateBusinessLabelToZh(item.name || ""),
        });
      }
    });
  });

  let sortedSegmentKeys = [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => key);

  if (!sortedSegmentKeys.length) return null;

  const maxSegments = 9;
  if (sortedSegmentKeys.length > maxSegments) {
    const keepKeys = new Set(sortedSegmentKeys.slice(0, maxSegments - 1));
    const otherKey = "__other_segments__";
    nameRegistry.set(otherKey, {
      name: "Other segments",
      nameZh: "其他分部",
    });
    visibleQuarters.forEach((quarter) => {
      let otherValue = 0;
      const nextMap = {};
      Object.entries(quarter.segmentMap).forEach(([key, value]) => {
        if (keepKeys.has(key)) {
          nextMap[key] = safeNumber(value);
        } else {
          otherValue += safeNumber(value);
        }
      });
      if (otherValue > 0.02) {
        nextMap[otherKey] = Number(otherValue.toFixed(3));
      }
      quarter.segmentMap = nextMap;
      quarter.totalRevenueBn =
        safeNumber(quarter.totalRevenueBn, null) > 0.02
          ? safeNumber(quarter.totalRevenueBn)
          : Object.values(nextMap).reduce((sum, value) => sum + safeNumber(value), 0);
    });
    totals.clear();
    visibleQuarters.forEach((quarter) => {
      Object.entries(quarter.segmentMap).forEach(([key, value]) => {
        totals.set(key, (totals.get(key) || 0) + safeNumber(value));
      });
    });
    sortedSegmentKeys = [...totals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([key]) => key);
  }

  const colorBySegment = stableBarColorMap(company?.id, sortedSegmentKeys);

  const segmentStats = sortedSegmentKeys.map((segmentKey) => ({
    key: segmentKey,
    totalValueBn: Number(safeNumber(totals.get(segmentKey)).toFixed(3)),
    name: nameRegistry.get(segmentKey)?.name || "Segment",
    nameZh: nameRegistry.get(segmentKey)?.nameZh || translateBusinessLabelToZh(nameRegistry.get(segmentKey)?.name || "Segment"),
    color: colorBySegment[segmentKey],
  }));

  const displayCurrencySet = [...new Set(visibleQuarters.map((item) => item.displayCurrency).filter(Boolean))];
  const sourceCurrencySet = [...new Set(visibleQuarters.map((item) => item.sourceCurrency).filter(Boolean))];
  const convertedQuarterCount = visibleQuarters.filter((item) => Math.abs(safeNumber(item.displayScaleFactor, 1) - 1) > 0.000001).length;
  const availableQuarterCount = visibleQuarters.filter((item) => item.hasRevenueValue).length;
  const missingQuarterCount = Math.max(0, visibleQuarters.length - availableQuarterCount);
  const imputedQuarterCount = visibleQuarters.filter((item) => item.isImputedSegments).length;
  const smoothedQuarterCount = visibleQuarters.filter((item) => item.isSmoothedSegments).length;
  const reportedSegmentQuarterCount = visibleQuarters.filter((item) => item.hasRawSegments && !item.wasReportedOnlyRaw && !item.insufficientSegments).length;
  const primaryDisplayCurrency = displayCurrencySet.length === 1 ? displayCurrencySet[0] : "MIXED";

  return {
    quarters: visibleQuarters,
    segmentStats,
    colorBySegment,
    stackOrder: segmentStats.slice().sort((left, right) => left.totalValueBn - right.totalValueBn).map((item) => item.key),
    maxRevenueBn: Math.max(...visibleQuarters.map((item) => safeNumber(item.totalRevenueBn)), 1),
    anchorQuarterKey: selectedQuarterKeys[selectedQuarterKeys.length - 1] || null,
    requestedQuarterCount: requestedWindowCount,
    availableQuarterCount,
    missingQuarterCount,
    reportedSegmentQuarterCount,
    imputedQuarterCount,
    smoothedQuarterCount,
    convertedQuarterCount,
    windowUnitLabel,
    windowUnitLabelZh,
    displayCurrencySet,
    sourceCurrencySet,
    primaryDisplayCurrency,
  };
}

function barChartUnitSpec(history) {
  const currency = String(history?.primaryDisplayCurrency || "USD").toUpperCase();
  const maxRevenueBn = safeNumber(history?.maxRevenueBn, 0);
  const unitValueBn = maxRevenueBn > 0 && maxRevenueBn < 3 ? 0.1 : 1;
  const displayValue = (valueBn) => safeNumber(valueBn) / unitValueBn;

  if (currentChartLanguage() === "en") {
    if (currency === "MIXED") {
      return {
        currency,
        unitValueBn,
        displayValue,
        line1: "Mixed",
        line2: "currencies",
      };
    }
    return {
      currency,
      unitValueBn,
      displayValue,
      line1: currency === "USD" ? "In $" : `In ${currency}`,
      line2: unitValueBn >= 1 ? "billion" : "100 million",
    };
  }
  if (currency === "MIXED") {
    return {
      currency,
      unitValueBn,
      displayValue,
      line1: "单位",
      line2: "混合币种",
    };
  }
  if (currency === "USD") {
    return {
      currency,
      unitValueBn,
      displayValue,
      line1: "单位",
      line2: unitValueBn >= 1 ? "十亿美元" : "亿美元",
    };
  }
  return {
    currency,
    unitValueBn,
    displayValue,
    line1: "单位",
    line2: unitValueBn >= 1 ? `${currency} 十亿` : `${currency} 亿`,
  };
}

function formatBarSegmentValue(valueBn, history) {
  const unitSpec = barChartUnitSpec(history);
  const numeric = unitSpec.displayValue(valueBn);
  if (numeric >= 100) return `${Math.round(numeric)}`;
  if (Math.abs(numeric - Math.round(numeric)) < 0.05) return `${Math.round(numeric)}`;
  return numeric.toFixed(numeric >= 10 ? 0 : 1).replace(/\.0$/, "");
}

function barAxisUnitLines(history) {
  const unitSpec = barChartUnitSpec(history);
  return {
    line1: unitSpec.line1,
    line2: unitSpec.line2,
  };
}
