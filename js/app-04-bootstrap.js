const BAR_CHART_LOGO_LAYOUT_OVERRIDES = Object.freeze({
  "procter-gamble": Object.freeze({
    dx: -44,
    dy: -4,
    widthScale: 0.78,
    heightScale: 0.78,
    scaleMultiplier: 0.94,
  }),
});

function resolveBarChartLogoPlacement({
  logoKey,
  plotLeft,
  chartTop,
  baselineY,
  barStartX,
  barWidth,
  barGap,
  valueScale,
  history,
}) {
  const normalizedLogoKey = normalizeLogoKey(logoKey);
  const override =
    BAR_CHART_LOGO_LAYOUT_OVERRIDES[logoKey] ||
    BAR_CHART_LOGO_LAYOUT_OVERRIDES[normalizedLogoKey] ||
    {};
  const visibleMetrics = corporateLogoVisibleMetrics(logoKey);
  const area = {
    width: 250 * safeNumber(override.widthScale, 1),
    height: 156 * safeNumber(override.heightScale, 1),
    x: plotLeft + 12 + safeNumber(override.dx, 0),
    y: chartTop + 8 + safeNumber(override.dy, 0),
  };

  let scale =
    Math.min(area.width / Math.max(visibleMetrics.width, 1), area.height / Math.max(visibleMetrics.height, 1)) *
    safeNumber(override.scaleMultiplier, 1);
  let renderedWidth = visibleMetrics.width * scale * CORPORATE_LOGO_LINEAR_SCALE_MULTIPLIER;
  let renderedHeight = visibleMetrics.height * scale * CORPORATE_LOGO_LINEAR_SCALE_MULTIPLIER;
  // Reserve the left axis band so wide wordmarks do not touch the y-axis or tick area.
  const minX = Math.max(20, plotLeft + 18);
  const minY = chartTop + 2;
  let x = Math.max(minX, area.x + (area.width - renderedWidth) / 2);
  let y = Math.max(minY, area.y + (area.height - renderedHeight) / 2);

  const logoRight = () => x + renderedWidth;
  const logoBottom = () => y + renderedHeight;
  const overlappingBarTop = (history?.quarters || []).reduce((top, quarter, quarterIndex) => {
    const barX = barStartX + quarterIndex * (barWidth + barGap);
    const barRight = barX + barWidth;
    if (barRight <= x || barX >= logoRight()) return top;
    const barTop = baselineY - Math.max(safeNumber(quarter?.totalRevenueBn) * valueScale, 1.2);
    return Math.min(top, barTop);
  }, Number.POSITIVE_INFINITY);

  if (Number.isFinite(overlappingBarTop) && logoBottom() > overlappingBarTop - 10) {
    const requiredLift = logoBottom() - (overlappingBarTop - 10);
    const availableLift = Math.max(y - minY, 0);
    if (availableLift > 0) {
      y -= Math.min(requiredLift, availableLift);
    }
  }

  if (Number.isFinite(overlappingBarTop) && logoBottom() > overlappingBarTop - 10) {
    const availableHeight = Math.max(overlappingBarTop - 10 - y, 72);
    const shrinkFactor = clamp(availableHeight / Math.max(renderedHeight, 1), 0.72, 1);
    if (shrinkFactor < 0.999) {
      scale *= shrinkFactor;
      renderedWidth *= shrinkFactor;
      renderedHeight *= shrinkFactor;
      x = Math.max(minX, area.x + (area.width - renderedWidth) / 2);
      y = Math.max(minY, Math.min(y, area.y + (area.height - renderedHeight) / 2));
    }
  }

  return {
    scale,
    x,
    y,
  };
}

function computeNiceBarAxisStep(maxValue, maxGridLines = 6) {
  const numericMax = Math.max(safeNumber(maxValue, 0), 0);
  if (!(numericMax > 0)) return 1;
  const roughStep = numericMax / Math.max(maxGridLines, 1);
  if (!(roughStep > 0)) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  let niceNormalized = 10;

  if (normalized < 1.5) niceNormalized = 1;
  else if (normalized < 3) niceNormalized = 2;
  else if (normalized < 7) niceNormalized = 5;

  return niceNormalized * magnitude;
}

function formatBarAxisTick(value, step) {
  const numeric = safeNumber(value);
  const safeStep = Math.max(safeNumber(step, 1), 0.000001);
  const decimals = Math.max(0, Math.ceil(-Math.log10(safeStep) - 0.000001));
  return Number(numeric.toFixed(decimals)).toString();
}

function renderRevenueSegmentBarsSvg(snapshot, company, options = {}) {
  const width = 2048;
  const height = 1325;
  const history = buildRevenueSegmentBarHistory(company, snapshot?.quarterKey, safeNumber(options.maxQuarters, 30));
  const chartTitle =
    currentChartLanguage() === "en"
      ? `${displayChartTitle(company?.nameEn || "")} Revenue by Segment`
      : `${company?.nameZh || company?.nameEn || ""} 分部营收趋势`;
  if (!history || !history.quarters.length) {
    return {
      svg: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chartTitle)}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="#F3F3F3"></rect>
          <g id="chartContent">
            <text x="${width / 2}" y="150" text-anchor="middle" font-size="96" font-weight="800" fill="#155C8F">${escapeHtml(chartTitle)}</text>
            <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="44" fill="#6B7280">${
              currentChartLanguage() === "en" ? "No segment history available." : "缺少可用的分部历史数据。"
            }</text>
          </g>
        </svg>
      `,
      history: null,
      width,
      height,
    };
  }

  const background = "#F3F3F3";
  const titleColor = "#155C8F";
  const mutedText = "#6B7280";
  const axisText = "#145B8E";
  const unitSpec = barChartUnitSpec(history);
  const unitLines = barAxisUnitLines(history);
  const hasConvertedCurrency = history.convertedQuarterCount > 0;
  const barCount = history.quarters.length;
  const plotLeft = 94;
  const plotRight = width - 38;
  const titleX = width / 2;
  const titleY = 146;
  const titleLength = String(chartTitle || "").length;
  const titleFontSize =
    currentChartLanguage() === "en"
      ? Math.round(clamp(88 - Math.max(titleLength - 30, 0) * 1.25, 56, 88) * 0.85)
      : clamp(80 - Math.max(titleLength - 16, 0) * 1.75, 52, 80);

  const latestQuarter = history.quarters[history.quarters.length - 1] || null;
  const latestPeriodEndRaw =
    formatPeriodEndLabel(latestQuarter?.entry?.periodEnd || "") ||
    latestQuarter?.entry?.periodEnd ||
    snapshot?.periodEndLabel ||
    "";
  const latestFiscalLabel = latestQuarter?.label || compactFiscalLabel(snapshot?.fiscalLabel || "") || "";
  const latestPeriodEnd = localizePeriodEndLabel(latestPeriodEndRaw);
  const legendItems = history.segmentStats;
  const legendTop = 218;
  const legendAreaLeft = plotLeft + 120;
  const legendAreaRight = plotRight - 120;
  const legendAvailableWidth = Math.max(320, legendAreaRight - legendAreaLeft);
  const legendRowGap = 20;
  const swatchSize = legendItems.length <= 3 ? 28 : 24;
  const swatchGap = 10;
  const legendItemGap = currentChartLanguage() === "en" ? 46 : 40;
  const maxLegendRows = legendItems.length <= 3 ? 1 : 2;

  const fitLegendLabel = (label, fontSize, maxTextWidth, options = {}) => {
    const raw = String(label || "").trim();
    if (!raw) return "";
    const truncate = options.truncate !== false;
    if (approximateTextWidth(raw, fontSize) <= maxTextWidth || !truncate) return raw;
    if (raw.length <= 4) return raw;
    let cut = raw.length;
    while (cut > 2) {
      const trial = `${raw.slice(0, cut)}...`;
      if (approximateTextWidth(trial, fontSize) <= maxTextWidth) return trial;
      cut -= 1;
    }
    return `${raw.slice(0, 2)}...`;
  };
  const buildLegendRows = (fontSize, options = {}) => {
    const truncateLabels = options.truncate !== false;
    const rows = [[]];
    const rowWidths = [0];
    legendItems.forEach((item) => {
      const rawLabel = localizedBarSegmentName(item);
      const maxLabelWidth = Math.max(
        truncateLabels ? 150 : 240,
        truncateLabels
          ? Math.min(
              legendAvailableWidth * (maxLegendRows === 1 ? 0.34 : 0.5),
              legendAvailableWidth - swatchSize - swatchGap - 20
            )
          : legendAvailableWidth - swatchSize - swatchGap - 20
      );
      const label = fitLegendLabel(rawLabel, fontSize, maxLabelWidth, { truncate: truncateLabels });
      const itemWidth = swatchSize + swatchGap + approximateTextWidth(label, fontSize);
      let rowIndex = rows.length - 1;
      let row = rows[rowIndex];
      let currentWidth = rowWidths[rowIndex];
      const neededGap = row.length ? legendItemGap : 0;
      if (row.length && currentWidth + neededGap + itemWidth > legendAvailableWidth) {
        rows.push([]);
        rowWidths.push(0);
        rowIndex += 1;
        row = rows[rowIndex];
        currentWidth = rowWidths[rowIndex];
      }
      const offsetX = currentWidth + (row.length ? legendItemGap : 0);
      row.push({
        item,
        label,
        itemWidth,
        offsetX,
      });
      rowWidths[rowIndex] = offsetX + itemWidth;
    });
    return {
      rows,
      rowWidths,
      hasOverflow: rowWidths.some((width) => width > legendAvailableWidth + 0.5),
    };
  };
  const isEnglishLegend = currentChartLanguage() === "en";
  let legendFontSize =
    isEnglishLegend
      ? 26
      : legendItems.length <= 3
        ? 32
        : 25;
  const legendMinFontSize = isEnglishLegend ? 18 : 18;
  let legendLayout = buildLegendRows(legendFontSize, { truncate: !isEnglishLegend });
  while ((legendLayout.rows.length > maxLegendRows || legendLayout.hasOverflow) && legendFontSize > legendMinFontSize) {
    legendFontSize -= 1;
    legendLayout = buildLegendRows(legendFontSize, { truncate: !isEnglishLegend });
  }
  if (isEnglishLegend && (legendLayout.rows.length > maxLegendRows || legendLayout.hasOverflow)) {
    while ((legendLayout.rows.length > maxLegendRows || legendLayout.hasOverflow) && legendFontSize > 18) {
      legendFontSize -= 1;
      legendLayout = buildLegendRows(legendFontSize, { truncate: true });
    }
  }
  const legendRows = legendLayout.rows;
  const legendRowWidths = legendLayout.rowWidths;
  const legendLineHeight = Math.round(legendFontSize * 1.12);
  const legendTotalHeight = legendRows.length * legendLineHeight + Math.max(0, legendRows.length - 1) * legendRowGap;

  const baselineY = 1166;
  const chartTop = legendTop + legendTotalHeight + 18;
  const barGap = barCount >= 28 ? 7 : barCount >= 22 ? 9 : 11;
  let barWidth = Math.floor((plotRight - plotLeft - barGap * Math.max(barCount - 1, 0)) / Math.max(barCount, 1));
  barWidth = clamp(barWidth, 16, 56);
  const barsTotalWidth = barWidth * barCount + barGap * Math.max(barCount - 1, 0);
  const barStartX = plotLeft + Math.max((plotRight - plotLeft - barsTotalWidth) / 2, 0);
  const chartHeight = Math.max(baselineY - chartTop, 120);
  const valueScale = chartHeight / Math.max(history.maxRevenueBn, 1);
  const barCornerRadius = Math.min(14, Math.max(6, barWidth * 0.24));
  const topQuarterFontSize = currentChartLanguage() === "en" ? 58 : 56;
  const periodEndFontSize = currentChartLanguage() === "en" ? 28 : 26;
  const topInfoX = width - 76;
  const topQuarterY = titleY - 6;
  const estimatedQuarterLeft = topInfoX - approximateTextWidth(latestFiscalLabel, topQuarterFontSize);
  const estimatedTitleRight = titleX + approximateTextWidth(chartTitle, titleFontSize) / 2;
  const estimatedPeriodLeft = topInfoX - approximateTextWidth(latestPeriodEnd, periodEndFontSize);
  const topInfoNeedsShift = estimatedQuarterLeft < estimatedTitleRight + 26 || estimatedPeriodLeft < estimatedTitleRight + 26;
  const topQuarterDisplayY = topInfoNeedsShift ? titleY + 30 : topQuarterY;
  const topPeriodY = topInfoNeedsShift ? titleY + 64 : titleY + 30;
  const yLabelFontSize = currentChartLanguage() === "en" ? 22 : 20;
  const xLabelBaseFontSize = barCount >= 28 ? 14 : barCount >= 24 ? 15 : 17;
  const xLabelFontSize = Math.round(xLabelBaseFontSize * 1.15);
  const xLabelAngle = 38;
  const approxXLabelWidth = approximateTextWidth("Q4 FY25", xLabelFontSize);
  const minSlotForLabel = approxXLabelWidth * Math.cos((xLabelAngle * Math.PI) / 180) * 0.95;
  const strideByWidth = Math.ceil(minSlotForLabel / Math.max(barWidth + barGap, 1));
  const strideByCount = Math.ceil(barCount / 16);
  const labelStride = Math.max(1, strideByWidth, strideByCount);
  const maxGridLines = 6;
  const displayMaxRevenue = unitSpec.displayValue(history.maxRevenueBn);
  const gridStepDisplay = computeNiceBarAxisStep(displayMaxRevenue, maxGridLines);
  const gridStep = gridStepDisplay * unitSpec.unitValueBn;
  const gridValues = [];
  for (let value = gridStep; value < history.maxRevenueBn; value += gridStep) {
    gridValues.push(Number(value.toFixed(6)));
  }
  const chartLogoKey = snapshot?.companyLogoKey || company?.id || "";
  const chartLogoPlacement = resolveBarChartLogoPlacement({
    logoKey: chartLogoKey,
    plotLeft,
    chartTop,
    baselineY,
    barStartX,
    barWidth,
    barGap,
    valueScale,
    history,
  });
  const isNonUsCompany = !!company?.isAdr;
  const fxNoteY = isNonUsCompany ? height - 34 : chartTop - 10;
  const fxNoteX = isNonUsCompany ? 38 : plotLeft;
  const fxNoteFontSize = isNonUsCompany ? 20 : 18;

  let svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chartTitle)}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${background}"></rect>
      <g id="chartContent">
        <text x="${titleX}" y="${titleY}" text-anchor="middle" font-size="${titleFontSize}" font-weight="800" fill="${titleColor}">${escapeHtml(chartTitle)}</text>
        ${
          latestFiscalLabel
            ? `<text x="${topInfoX}" y="${topQuarterDisplayY}" text-anchor="end" font-size="${topQuarterFontSize}" font-weight="700" fill="#575C63">${escapeHtml(
                latestFiscalLabel
              )}</text>`
            : ""
        }
        ${
          latestPeriodEnd
            ? `<text x="${topInfoX}" y="${topPeriodY}" text-anchor="end" font-size="${periodEndFontSize}" font-weight="600" fill="${mutedText}">${escapeHtml(
                latestPeriodEnd
              )}</text>`
            : ""
        }
        <text x="${Math.max(18, plotLeft - 72).toFixed(2)}" y="${(legendTop + 18).toFixed(2)}" text-anchor="start" font-size="${yLabelFontSize}" font-weight="700" fill="${axisText}">${escapeHtml(
    unitLines.line1
  )}</text>
        <text x="${Math.max(18, plotLeft - 72).toFixed(2)}" y="${(legendTop + 48).toFixed(2)}" text-anchor="start" font-size="${yLabelFontSize}" font-weight="700" fill="${axisText}">${escapeHtml(
    unitLines.line2
  )}</text>
        ${
          hasConvertedCurrency
            ? `<text x="${fxNoteX}" y="${fxNoteY.toFixed(2)}" text-anchor="start" font-size="${fxNoteFontSize}" fill="#7B8490">${
                currentChartLanguage() === "en" ? "Converted to USD by filing-date FX rates." : "已按申报日汇率折算为美元。"
              }</text>`
            : ""
        }
  `;

  legendRows.forEach((row, rowIndex) => {
    const rowWidth = legendRowWidths[rowIndex] || 0;
    const centeredFromTitle = titleX - rowWidth / 2;
    const rowStartX = clamp(centeredFromTitle, legendAreaLeft, Math.max(legendAreaLeft, legendAreaRight - rowWidth));
    const rowY = legendTop + rowIndex * (legendLineHeight + legendRowGap);
    row.forEach((entry) => {
      const swatchX = rowStartX + entry.offsetX;
      const swatchY = rowY + (legendLineHeight - swatchSize) / 2;
      const textX = swatchX + swatchSize + swatchGap;
      const textY = rowY + legendFontSize * 0.82;
      svg += `<rect x="${swatchX.toFixed(2)}" y="${swatchY.toFixed(2)}" width="${swatchSize}" height="${swatchSize}" rx="${
        swatchSize * 0.24
      }" fill="${entry.item.color}"></rect>`;
      svg += `<text x="${textX.toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="start" font-size="${legendFontSize}" font-weight="700" fill="${axisText}">${escapeHtml(
        entry.label
      )}</text>`;
    });
  });

  svg += `<line x1="${plotLeft}" y1="${chartTop}" x2="${plotLeft}" y2="${baselineY}" stroke="#C9CED6" stroke-width="2.2"></line>`;
  gridValues.forEach((gridValue) => {
    const y = baselineY - gridValue * valueScale;
    if (y <= chartTop + 8 || y >= baselineY - 8) return;
    svg += `<line x1="${plotLeft}" y1="${y.toFixed(2)}" x2="${plotRight}" y2="${y.toFixed(2)}" stroke="#DDE2E8" stroke-width="1.4"></line>`;
    svg += `<line x1="${plotLeft - 8}" y1="${y.toFixed(2)}" x2="${plotLeft}" y2="${y.toFixed(2)}" stroke="#C9CED6" stroke-width="1.8"></line>`;
    svg += `<text x="${plotLeft - 14}" y="${(y + 6).toFixed(2)}" text-anchor="end" font-size="18" fill="#8A9098">${escapeHtml(
      formatBarAxisTick(unitSpec.displayValue(gridValue), gridStepDisplay)
    )}</text>`;
  });
  svg += `<line x1="${plotLeft}" y1="${baselineY}" x2="${plotRight}" y2="${baselineY}" stroke="#C9CED6" stroke-width="2.2"></line>`;
  svg += `
    <g opacity="0.98">
      ${renderCorporateLogo(chartLogoKey, chartLogoPlacement.x.toFixed(2), chartLogoPlacement.y.toFixed(2), {
        scale: Number(chartLogoPlacement.scale.toFixed(4)),
      })}
    </g>
  `;

  history.quarters.forEach((quarter, quarterIndex) => {
    const x = barStartX + quarterIndex * (barWidth + barGap);
    const activeKeys = history.stackOrder.filter((segmentKey) => safeNumber(quarter.segmentMap?.[segmentKey]) > 0.005);
    let cursorBottom = baselineY;
    activeKeys.forEach((segmentKey, segmentIndex) => {
      const valueBn = safeNumber(quarter.segmentMap?.[segmentKey]);
      const heightValue = Math.max(valueBn * valueScale, 1.2);
      const y = cursorBottom - heightValue;
      const isBottom = segmentIndex === 0;
      const isTop = segmentIndex === activeKeys.length - 1;
      const fillColor = history.colorBySegment[segmentKey] || "#1CA1E2";
      svg += stackedBarSegmentElement(
        x,
        y,
        barWidth,
        heightValue,
        barCornerRadius,
        isTop,
        isBottom,
        fillColor
      );
      const valueLabel = formatBarSegmentValue(valueBn, history);
      const valueFontSize = clamp(Math.round(barWidth * 0.42), 11, 24);
      if (heightValue >= valueFontSize + 7) {
        svg += `<text x="${x + barWidth / 2}" y="${y + heightValue / 2 + valueFontSize * 0.34}" text-anchor="middle" font-size="${valueFontSize}" font-weight="700" fill="${barSegmentTextColor(
          fillColor
        )}">${escapeHtml(
          valueLabel
        )}</text>`;
      }
      cursorBottom = y;
    });
    if (!activeKeys.length) {
      const placeholderHeight = 8;
      const placeholderY = baselineY - placeholderHeight;
      svg += `<rect x="${x.toFixed(2)}" y="${placeholderY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${placeholderHeight.toFixed(
        2
      )}" rx="${Math.min(4, barCornerRadius)}" fill="#C8D0DA" stroke="#AEB5BE" stroke-width="1"></rect>`;
    }
    const tickX = x + barWidth / 2;
    const tickY = baselineY + 30;
    const shouldRenderTick =
      quarterIndex % labelStride === 0 || quarterIndex === 0 || quarterIndex === barCount - 1;
    if (shouldRenderTick) {
      svg += `<text x="${tickX}" y="${tickY}" text-anchor="middle" font-size="${xLabelFontSize}" font-weight="700" fill="#111111" transform="rotate(${xLabelAngle} ${tickX} ${tickY})">${escapeHtml(
        quarter.label
      )}</text>`;
    }
  });

  svg += "</g></svg>";
  return {
    svg,
    history,
    width,
    height,
  };
}

function renderIncomeStatementSvg(snapshot, company) {
  if (snapshot.mode === "pixel-replica" || snapshot.mode === "replica-template") {
    return renderPixelReplicaSvg(snapshot);
  }
  const width = 1600;
  const height = 900;
  const titleText = localizeChartTitle(snapshot);
  const titleFontSize = 82;
  const titleX = width / 2;
  const titleY = 104;
  const inlinePeriodLayout = inlinePeriodEndLayout({
    titleText,
    titleFontSize,
    titleX,
    titleY,
    periodEndFontSize: 28,
    width,
    rightPadding: 70,
  });
  const periodEndX = inlinePeriodLayout.periodEndX;
  const periodEndY = inlinePeriodLayout.periodEndY;
  const revenue = Number(snapshot.revenueBn || 0);
  const companyBrand = resolvedCompanyBrand(company);
  const grossProfit = Number(snapshot.grossProfitBn || 0);
  const costOfRevenue =
    snapshot.costOfRevenueBn !== null && snapshot.costOfRevenueBn !== undefined
      ? Number(snapshot.costOfRevenueBn || 0)
      : Math.max(revenue - grossProfit, 0);
  const rawOperatingProfit = Number(snapshot.operatingProfitBn || 0);
  const hasOperatingLoss = rawOperatingProfit < -0.02;
  const operatingProfit = hasOperatingLoss ? 0 : rawOperatingProfit;
  const operatingExpenses =
    snapshot.operatingExpensesBn !== null && snapshot.operatingExpensesBn !== undefined
      ? hasOperatingLoss
        ? Math.min(Number(snapshot.operatingExpensesBn || 0), grossProfit)
        : Number(snapshot.operatingExpensesBn || 0)
      : Math.max(grossProfit - operatingProfit, 0);
  const netOutcome = resolvedNetOutcomeValue(snapshot);
  const netLoss = isLossMakingNetOutcome(snapshot);
  const nearZeroNet = isNearZeroNetOutcome(snapshot);
  const netProfit = netLoss ? Math.abs(netOutcome) : Math.max(netOutcome, 0);
  const sources = [...(snapshot.businessGroups || [])].filter((item) => Number(item.valueBn || 0) > 0.02);
  const opexItems = [...(snapshot.opexBreakdown || [])].filter((item) => Number(item.valueBn || 0) > 0.02);
  const positiveAdjustments = [...(snapshot.positiveAdjustments || [])].filter((item) => Number(item.valueBn || 0) > 0.02);
  const belowOperatingItems = [...(snapshot.belowOperatingItems || [])].filter((item) => Number(item.valueBn || 0) > 0.02);

  const titleColor = snapshot.mode === "pixel-replica" ? "#145B8E" : "#17496D";
  const background = snapshot.mode === "pixel-replica" ? "#F6F5F2" : "#F7FBFF";
  const profitFill = "#9BD199";
  const profitNode = "#2CA52C";
  const expenseFill = "#EA9294";
  const expenseNode = "#E10600";
  const neutralNode = "#6A6A6A";

  const leftNodeX = 340;
  const revenueX = 556;
  const grossX = 812;
  const opX = 1078;
  const rightX = 1328;
  const nodeWidth = snapshot.mode === "pixel-replica" ? 56 : 42;
  const centerY = 468;
  const scale = 410 / Math.max(revenue, 1);

  const revenueHeight = Math.max(revenue * scale, 4);
  const grossHeight = Math.max(grossProfit * scale, 2);
  const costHeight = Math.max(costOfRevenue * scale, 2);
  const opHeight = Math.max(operatingProfit * scale, 2);
  const opexHeight = Math.max(operatingExpenses * scale, 2);
  const netHeight = Math.max(netProfit * scale, nearZeroNet ? 4 : 2);

  const revenueTop = centerY - revenueHeight / 2;
  const revenueBottom = centerY + revenueHeight / 2;
  const grossTop = centerY - grossHeight / 2;
  const grossBottom = grossTop + grossHeight;
  const costTop = grossBottom;
  const costBottom = revenueBottom;
  const opTop = grossTop;
  const opBottom = opTop + opHeight;
  const opexTop = opBottom;
  const opexBottom = grossBottom;
  const netTop = opTop;
  const netBottom = netTop + netHeight;
  const fallbackExpenseTitleSize = 26;
  const fallbackExpenseValueSize = 26;
  const fallbackExpenseVisualGap = 18;
  const fallbackExpenseBaselineY = (nodeBottom) => nodeBottom + fallbackExpenseVisualGap + fallbackExpenseTitleSize * 0.82;

  const bridgeHeight = Math.min(opHeight, netHeight);
  const bridgeSourceBottom = opTop + bridgeHeight;
  const bridgeTargetBottom = netTop + bridgeHeight;

  let svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(titleText)}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${background}"></rect>
      <g id="chartContent">
      <text x="${titleX}" y="${titleY}" text-anchor="middle" font-size="${titleFontSize}" font-weight="800" fill="${titleColor}" letter-spacing="0.5">${escapeHtml(titleText)}</text>
      ${snapshot.periodEndLabel ? `<text x="${periodEndX}" y="${periodEndY}" text-anchor="start" font-size="28" fill="#5E6269">${escapeHtml(localizePeriodEndLabel(snapshot.periodEndLabel || ""))}</text>` : ""}
      ${renderCorporateLogo(snapshot.companyLogoKey, 650, 172)}
    `;

  let sourceCursor = revenueTop;
  sources.forEach((item) => {
    const value = Number(item.valueBn || 0);
    const heightValue = Math.max(value * scale, 2);
    const top = sourceCursor;
    const bottom = top + heightValue;
    const lockupProfile = lockupLayoutProfile(item.lockupKey);
    const lockupY = top + heightValue / 2 - (lockupProfile?.previewOffset || 30);
    svg += `<path d="${flowPath(leftNodeX + nodeWidth, top, bottom, revenueX, top, bottom)}" fill="${item.flowColor || rgba(companyBrand.primary, 0.48)}" opacity="0.94"></path>`;
    svg += `<rect x="${leftNodeX}" y="${top.toFixed(1)}" width="${nodeWidth}" height="${heightValue.toFixed(1)}" fill="${item.nodeColor || companyBrand.primary}"></rect>`;
    svg += renderBusinessLockup(item.lockupKey, 64, lockupY);
    const valueX = 324;
    const labelCenterY = top + heightValue / 2;
    svg += `<text x="${valueX}" y="${labelCenterY - 4}" text-anchor="end" font-size="22" font-weight="500" fill="#666666">${escapeHtml(formatBillions(value))}</text>`;
    if (item.qoqPct !== null && item.qoqPct !== undefined) {
      svg += `<text x="${valueX}" y="${labelCenterY + 18}" text-anchor="end" font-size="13" fill="#8A9098">${escapeHtml(formatGrowthMetric(item.qoqPct, "qoq"))}</text>`;
    }
    if (item.yoyPct !== null && item.yoyPct !== undefined) {
      svg += `<text x="${valueX}" y="${labelCenterY + (item.qoqPct !== null && item.qoqPct !== undefined ? 38 : 18)}" text-anchor="end" font-size="16" fill="#666666">${escapeHtml(formatGrowthMetric(item.yoyPct, "yoy"))}</text>`;
    }
    const fallbackLabelLines =
      currentChartLanguage() === "zh"
        ? wrapLabelWithMaxWidth(localizeChartItemName(item), snapshot.mode === "pixel-replica" ? 22 : 20, currentChartLanguage() === "zh" ? 150 : 180, {
            maxLines: 3,
          })
        : item.displayLines?.length
          ? item.displayLines
          : wrapLines(item.name || "", 14);
    if (fallbackLabelLines.length) {
      svg += svgTextBlock(
        252,
        labelCenterY + (fallbackLabelLines.length > 1 ? 40 : 34),
        fallbackLabelLines,
        {
          fill: "#555555",
          fontSize: snapshot.mode === "pixel-replica" ? 22 : 20,
          weight: 800,
          anchor: "middle",
          lineHeight: snapshot.mode === "pixel-replica" ? 26 : 24,
        }
      );
    }
    if (item.operatingMarginPct !== null && item.operatingMarginPct !== undefined) {
      const offset = fallbackLabelLines.length > 1 ? 76 : 58;
      svg += `<text x="252" y="${labelCenterY + offset}" text-anchor="middle" font-size="15" fill="#666666">${escapeHtml(formatPct(item.operatingMarginPct))} ${marginLabel()}</text>`;
    }
    sourceCursor = bottom;
  });

  svg += `
      <rect x="${revenueX}" y="${revenueTop.toFixed(1)}" width="${nodeWidth}" height="${revenueHeight.toFixed(1)}" fill="${neutralNode}"></rect>
      <text x="${revenueX + nodeWidth / 2}" y="${revenueTop - 28}" text-anchor="middle" font-size="30" font-weight="800" fill="#555A63">${escapeHtml(localizeChartPhrase("Revenue"))}</text>
      <text x="${revenueX + nodeWidth / 2}" y="${revenueTop + 2}" text-anchor="middle" font-size="34" font-weight="800" fill="#555A63">${escapeHtml(formatBillions(revenue))}</text>
      ${snapshot.revenueQoqPct !== null && snapshot.revenueQoqPct !== undefined ? `<text x="${revenueX + nodeWidth / 2}" y="${revenueTop + 28}" text-anchor="middle" font-size="14" fill="#8A9098">${escapeHtml(formatGrowthMetric(snapshot.revenueQoqPct, "qoq"))}</text>` : ""}
      ${snapshot.revenueYoyPct !== null && snapshot.revenueYoyPct !== undefined ? `<text x="${revenueX + nodeWidth / 2}" y="${revenueTop + (snapshot.revenueQoqPct !== null && snapshot.revenueQoqPct !== undefined ? 48 : 28)}" text-anchor="middle" font-size="16" fill="#666666">${escapeHtml(formatGrowthMetric(snapshot.revenueYoyPct, "yoy"))}</text>` : ""}

      <path d="${flowPath(revenueX + nodeWidth, revenueTop, grossBottom, grossX, grossTop, grossBottom)}" fill="${profitFill}" opacity="0.96"></path>
      <path d="${flowPath(revenueX + nodeWidth, grossBottom, revenueBottom, grossX, costTop, costBottom)}" fill="${expenseFill}" opacity="0.96"></path>

      <rect x="${grossX}" y="${grossTop.toFixed(1)}" width="${nodeWidth}" height="${grossHeight.toFixed(1)}" fill="${profitNode}"></rect>
      <text x="${grossX + nodeWidth / 2}" y="${grossTop - 28}" text-anchor="middle" font-size="26" font-weight="800" fill="#089256">${escapeHtml(localizeChartPhrase("Gross profit"))}</text>
      <text x="${grossX + nodeWidth / 2}" y="${grossTop + 2}" text-anchor="middle" font-size="26" font-weight="800" fill="#089256">${escapeHtml(formatBillions(grossProfit))}</text>
      <text x="${grossX + nodeWidth / 2}" y="${grossTop + 28}" text-anchor="middle" font-size="16" fill="#666666">${escapeHtml(formatPct(snapshot.grossMarginPct))} ${marginLabel()}</text>
      ${snapshot.grossMarginYoyDeltaPp !== null && snapshot.grossMarginYoyDeltaPp !== undefined ? `<text x="${grossX + nodeWidth / 2}" y="${grossTop + 52}" text-anchor="middle" font-size="15" fill="#666666">${escapeHtml(formatPp(snapshot.grossMarginYoyDeltaPp))}</text>` : ""}

      <rect x="${grossX}" y="${costTop.toFixed(1)}" width="${nodeWidth}" height="${costHeight.toFixed(1)}" fill="${expenseNode}"></rect>
      <text x="${grossX + nodeWidth / 2}" y="${fallbackExpenseBaselineY(costBottom)}" text-anchor="middle" font-size="${fallbackExpenseTitleSize}" font-weight="800" fill="#8C1F0A">${escapeHtml(localizeChartPhrase("Cost of revenue"))}</text>
      <text x="${grossX + nodeWidth / 2}" y="${fallbackExpenseBaselineY(costBottom) + 30}" text-anchor="middle" font-size="${fallbackExpenseValueSize}" font-weight="800" fill="#8C1F0A">${escapeHtml(formatBillions(costOfRevenue, true))}</text>

      <path d="${flowPath(grossX + nodeWidth, grossTop, opBottom, opX, opTop, opBottom)}" fill="${profitFill}" opacity="0.96"></path>
      <path d="${flowPath(grossX + nodeWidth, opBottom, grossBottom, opX, opexTop, opexBottom)}" fill="${expenseFill}" opacity="0.96"></path>

      <rect x="${opX}" y="${opTop.toFixed(1)}" width="${nodeWidth}" height="${opHeight.toFixed(1)}" fill="${profitNode}"></rect>
      <text x="${opX + nodeWidth / 2}" y="${opTop - 28}" text-anchor="middle" font-size="26" font-weight="800" fill="#089256">${escapeHtml(localizeChartPhrase("Operating profit"))}</text>
      <text x="${opX + nodeWidth / 2}" y="${opTop + 2}" text-anchor="middle" font-size="26" font-weight="800" fill="#089256">${escapeHtml(formatBillions(operatingProfit))}</text>
      <text x="${opX + nodeWidth / 2}" y="${opTop + 28}" text-anchor="middle" font-size="16" fill="#666666">${escapeHtml(formatPct(snapshot.operatingMarginPct))} ${marginLabel()}</text>
      ${snapshot.operatingMarginYoyDeltaPp !== null && snapshot.operatingMarginYoyDeltaPp !== undefined ? `<text x="${opX + nodeWidth / 2}" y="${opTop + 52}" text-anchor="middle" font-size="15" fill="#666666">${escapeHtml(formatPp(snapshot.operatingMarginYoyDeltaPp))}</text>` : ""}

      <rect x="${opX}" y="${opexTop.toFixed(1)}" width="${nodeWidth}" height="${opexHeight.toFixed(1)}" fill="${expenseNode}"></rect>
      <text x="${opX + nodeWidth / 2}" y="${fallbackExpenseBaselineY(opexBottom)}" text-anchor="middle" font-size="${fallbackExpenseTitleSize}" font-weight="800" fill="#8C1F0A">${escapeHtml(localizeChartPhrase("Operating expenses"))}</text>
      <text x="${opX + nodeWidth / 2}" y="${fallbackExpenseBaselineY(opexBottom) + 30}" text-anchor="middle" font-size="${fallbackExpenseValueSize}" font-weight="800" fill="#8C1F0A">${escapeHtml(formatBillions(operatingExpenses, true))}</text>
    `;

  if (revenue > 0) {
    svg += `<text x="${opX + nodeWidth / 2}" y="${fallbackExpenseBaselineY(opexBottom) + 56}" text-anchor="middle" font-size="16" fill="#666666">${escapeHtml(formatPct((operatingExpenses / revenue) * 100))} ${ofRevenueLabel()}</text>`;
  }

  svg += `
      <path d="${flowPath(opX + nodeWidth, opTop, bridgeSourceBottom, rightX, netTop, bridgeTargetBottom)}" fill="${netLoss ? expenseFill : profitFill}" opacity="0.96"></path>
      <rect x="${rightX}" y="${netTop.toFixed(1)}" width="${nodeWidth}" height="${bridgeHeight.toFixed(1)}" fill="${netLoss ? expenseNode : profitNode}"></rect>
      ${svgTextBlock(rightX + 62, netTop + 12, [localizeChartPhrase(resolvedNetOutcomeLabel(snapshot)), formatNetOutcomeBillions(snapshot)], { fill: netLoss ? "#8C1F0A" : "#089256", fontSize: 24, weight: 800, lineHeight: 30 })}
      <text x="${rightX + 62}" y="${netTop + 68}" font-size="16" fill="#666666">${escapeHtml(formatPct(snapshot.netMarginPct))} ${marginLabel()}</text>
      ${snapshot.netMarginYoyDeltaPp !== null && snapshot.netMarginYoyDeltaPp !== undefined ? `<text x="${rightX + 62}" y="${netTop + 92}" font-size="15" fill="#666666">${escapeHtml(formatPp(snapshot.netMarginYoyDeltaPp))}</text>` : ""}
    `;

  let positiveCursor = bridgeTargetBottom;
  positiveAdjustments.forEach((item) => {
    const itemHeight = Math.max(Number(item.valueBn || 0) * scale, 4);
    svg += `<rect x="${rightX}" y="${positiveCursor.toFixed(1)}" width="${nodeWidth}" height="${itemHeight.toFixed(1)}" fill="${item.color || "#16A34A"}"></rect>`;
      svg += svgTextBlock(rightX + 62, positiveCursor + 14, [item.name, `+${formatBillions(item.valueBn)}`], {
        fill: "#089256",
        fontSize: 16,
        weight: 800,
        lineHeight: 20,
      });
    positiveCursor += itemHeight + 10;
  });

  let belowCursor = netBottom;
  belowOperatingItems.forEach((item, index) => {
    const itemHeight = Math.max(Number(item.valueBn || 0) * scale, index === 0 ? 10 : 4);
    const itemTop = belowCursor + (index === 0 ? 0 : 26);
    const itemBottom = itemTop + itemHeight;
    svg += `<path d="${outboundFlowPath(opX + nodeWidth, itemTop, itemBottom, rightX, itemTop, itemBottom, { targetCoverInsetX: 12 })}" fill="${expenseFill}" opacity="0.96"></path>`;
    svg += `<rect x="${rightX}" y="${itemTop.toFixed(1)}" width="${nodeWidth}" height="${itemHeight.toFixed(1)}" fill="${item.color || expenseNode}"></rect>`;
    svg += svgTextBlock(rightX + 62, itemTop + 6, [item.name, formatBillions(item.valueBn, true)], {
      fill: "#8C1F0A",
      fontSize: 16,
      weight: 800,
      lineHeight: 20,
    });
    belowCursor = itemBottom;
  });

  const opexTotal = opexItems.reduce((sum, item) => sum + Number(item.valueBn || 0), 0);
  let opexTargetY = 566;
  const opexTargetX = rightX;
  opexItems.forEach((item) => {
    const itemHeight = Math.max(Number(item.valueBn || 0) * scale, 5);
    const itemTop = opexTargetY;
    const itemBottom = itemTop + itemHeight;
    const sourceShare = opexTotal > 0 ? Number(item.valueBn || 0) / opexTotal : 0;
    const sourceCenter = opexTop + opexHeight * sourceShare * 0.5 + opexHeight * Math.max(0, opexItems.indexOf(item) / Math.max(opexItems.length, 1)) * 0.34;
    svg += `<path d="${outboundFlowPath(opX + nodeWidth, sourceCenter - itemHeight / 2, sourceCenter + itemHeight / 2, opexTargetX, itemTop, itemBottom, { targetCoverInsetX: 12 })}" fill="${expenseFill}" opacity="0.96"></path>`;
    svg += `<rect x="${opexTargetX}" y="${itemTop.toFixed(1)}" width="${nodeWidth}" height="${itemHeight.toFixed(1)}" fill="${item.color || expenseNode}"></rect>`;
    svg += svgTextBlock(opexTargetX + 62, itemTop + 6, [item.name, formatBillions(item.valueBn, true)], {
      fill: "#8C1F0A",
      fontSize: 16,
      weight: 800,
      lineHeight: 20,
    });
    if (item.note) {
      svg += `<text x="${opexTargetX + 62}" y="${itemTop + 44}" font-size="13" fill="#666666">${escapeHtml(displayChartNote(item.note))}</text>`;
    }
    opexTargetY = itemBottom + 48;
  });

  svg += `</g></svg>`;
  return svg;
}

function createLayoutEngine() {
  return Object.freeze({
    snapshotCanvasSize,
    stackValueSlices,
    separateStackSlices,
    resolveVerticalBoxes,
    resolveVerticalBoxesVariableGap,
    prototypeBandConfig,
    approximateTextWidth,
    approximateTextBlockWidth,
    estimatedStackSpan,
  });
}

function createRenderEngine() {
  return Object.freeze({
    renderPixelReplicaSvg,
    renderIncomeStatementSvg,
    renderRevenueSegmentBarsSvg,
  });
}

const EarningsVizRuntime = Object.freeze({
  version: BUILD_ASSET_VERSION,
  layout: createLayoutEngine(),
  render: createRenderEngine(),
  i18n: Object.freeze({
    translateBusinessLabelToZh,
    localizeChartPhrase,
  }),
});

if (typeof window !== "undefined") {
  window.earningsImageStudio = EarningsVizRuntime;
}

const automationBootState = {
  isReady: false,
  error: null,
};

let resolveAutomationReady = null;
let rejectAutomationReady = null;

const automationReadyPromise = new Promise((resolve, reject) => {
  resolveAutomationReady = resolve;
  rejectAutomationReady = reject;
});

function markAutomationReady() {
  if (automationBootState.isReady) return;
  automationBootState.isReady = true;
  automationBootState.error = null;
  if (typeof resolveAutomationReady === "function") {
    resolveAutomationReady(true);
    resolveAutomationReady = null;
    rejectAutomationReady = null;
  }
}

function markAutomationBootFailure(error) {
  automationBootState.error = error instanceof Error ? error : new Error(String(error || "Automation boot failed."));
  if (typeof rejectAutomationReady === "function") {
    rejectAutomationReady(automationBootState.error);
    resolveAutomationReady = null;
    rejectAutomationReady = null;
  }
}

function currentTemplatePresetState(company = getCompany(state.selectedCompanyId), snapshot = state.currentSnapshot) {
  if (!company || !snapshot) return null;
  const presetKey = snapshot.templatePresetKey || templatePresetKey(snapshot, company);
  return {
    company,
    snapshot,
    presetKey,
    presetLabel: snapshot.templatePresetLabel || templatePresetLabel(snapshot, company),
    tokens: deepClone(snapshot.templateTokens || effectiveTemplateTokens(snapshot, company)),
  };
}

function setTokenStatus(message) {
  if (refs.tokenStatus) refs.tokenStatus.textContent = message;
}

function syncReferenceOverlay() {
  if (!refs.referenceOverlay) return;
  const { overlayEnabled, overlayOpacity, overlayImageDataUrl } = state.calibration;
  if (!overlayEnabled || !overlayImageDataUrl) {
    refs.referenceOverlay.classList.remove("is-visible");
    refs.referenceOverlay.removeAttribute("src");
    return;
  }
  refs.referenceOverlay.src = overlayImageDataUrl;
  refs.referenceOverlay.style.opacity = `${overlayOpacity / 100}`;
  refs.referenceOverlay.classList.add("is-visible");
}

function refreshTokenEditor(snapshot, company) {
  const presetState = currentTemplatePresetState(company, snapshot);
  if (!presetState) return;
  const draft = state.calibration.tokenDraftByPreset[presetState.presetKey];
  if (refs.templateTokenEditor) {
    refs.templateTokenEditor.value = draft || JSON.stringify(presetState.tokens, null, 2);
  }
  if (refs.calibrationPresetPill) {
    refs.calibrationPresetPill.textContent = presetState.presetLabel;
  }
}

function updateCalibrationUi(snapshot = state.currentSnapshot, company = getCompany(state.selectedCompanyId)) {
  if (refs.overlayToggle) refs.overlayToggle.checked = state.calibration.overlayEnabled;
  if (refs.overlayOpacity) refs.overlayOpacity.value = String(state.calibration.overlayOpacity);
  if (refs.overlayOpacityValue) refs.overlayOpacityValue.textContent = `${state.calibration.overlayOpacity}%`;
  refreshTokenEditor(snapshot, company);
  syncReferenceOverlay();
}

function storeCurrentTokenDraft() {
  const presetState = currentTemplatePresetState();
  if (!presetState || !refs.templateTokenEditor) return;
  state.calibration.tokenDraftByPreset[presetState.presetKey] = refs.templateTokenEditor.value;
}

function applyCurrentTokenDraft() {
  const presetState = currentTemplatePresetState();
  if (!presetState || !refs.templateTokenEditor) return;
  try {
    const parsed = JSON.parse(refs.templateTokenEditor.value || "{}");
    if (!isPlainObject(parsed)) {
      setTokenStatus("Token JSON 必须是对象，至少包含 layout / ribbon / typography 之一。");
      return;
    }
    state.calibration.tokenOverridesByPreset[presetState.presetKey] = parsed;
    state.calibration.tokenDraftByPreset[presetState.presetKey] = JSON.stringify(parsed, null, 2);
    setTokenStatus(`已应用 ${presetState.presetLabel} 的模板 token。`);
    renderCurrent();
  } catch (error) {
    setTokenStatus(`Token JSON 解析失败：${error.message || "未知错误"}`);
  }
}

function resetCurrentTokenDraft() {
  const presetState = currentTemplatePresetState();
  if (!presetState) return;
  delete state.calibration.tokenOverridesByPreset[presetState.presetKey];
  delete state.calibration.tokenDraftByPreset[presetState.presetKey];
  setTokenStatus(`已恢复 ${presetState.presetLabel} 的默认模板参数。`);
  renderCurrent();
}

function downloadCurrentTokenJson() {
  const presetState = currentTemplatePresetState();
  if (!presetState) return;
  const payload = refs.templateTokenEditor?.value || JSON.stringify(presetState.tokens, null, 2);
  downloadBlob(
    new Blob([payload], { type: "application/json;charset=utf-8" }),
    `${currentFilenameStem()}-${presetState.presetKey.replace(/[^a-z0-9-]+/gi, "-")}-tokens.json`
  );
  setTokenStatus("模板 token JSON 已导出。");
}

function loadReferenceOverlayFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.calibration.overlayImageDataUrl = String(reader.result || "");
    state.calibration.overlayEnabled = true;
    updateCalibrationUi();
    setTokenStatus(`已载入参考图：${file.name}`);
  };
  reader.onerror = () => {
    setTokenStatus("参考图读取失败。");
  };
  reader.readAsDataURL(file);
}

function updateMeta(snapshot, company, viewPayload = null) {
  const isBarMode = currentChartViewMode() === "bars";
  refs.toolbarCompany.textContent = companyDisplay(company);
  refs.toolbarQuarter.textContent = `${snapshot.quarterKey} · ${snapshot.fiscalLabel || "-"}`;
  updateDatasetTimestampUi();

  if (isBarMode) {
    const history = viewPayload?.history || null;
    const quarterCount = history?.quarters?.length || 0;
    const requestedQuarterCount = history?.requestedQuarterCount || quarterCount || 30;
    const windowUnitLabel = history?.windowUnitLabel || "quarters";
    const windowUnitLabelZh = history?.windowUnitLabelZh || "个季度";
    const convertedQuarterCount = history?.convertedQuarterCount || 0;
    const primaryDisplayCurrency = history?.primaryDisplayCurrency || "USD";
    const sourceCurrencySet = Array.isArray(history?.sourceCurrencySet) ? history.sourceCurrencySet : [];
    const currencySummary =
      primaryDisplayCurrency === "MIXED"
        ? (history?.displayCurrencySet || []).join("/")
        : primaryDisplayCurrency;
    const segmentCount = history?.segmentStats?.length || 0;
    const availableRevenues = (history?.quarters || [])
      .map((item) => safeNumber(item?.totalRevenueBn, null))
      .filter((value) => value !== null && value > 0.02);
    const earliestRevenue = availableRevenues.length ? availableRevenues[0] : safeNumber(snapshot?.revenueBn);
    const latestRevenue = availableRevenues.length ? availableRevenues[availableRevenues.length - 1] : safeNumber(snapshot?.revenueBn);
    const growthPct = earliestRevenue > 0.02 ? ((latestRevenue / earliestRevenue - 1) * 100) : null;
    refs.chartTitle.textContent =
      currentChartLanguage() === "en"
        ? `${displayChartTitle(company.nameEn)} Revenue by Segment`
        : `${company.nameZh || company.nameEn} 分部营收趋势`;
    refs.chartMeta.textContent =
      currentChartLanguage() === "en"
        ? `${companyDisplay(company)} · ${quarterCount}/${requestedQuarterCount} ${windowUnitLabel} · Stacked segment bars`
        : `${companyDisplay(company)} · ${quarterCount}/${requestedQuarterCount} ${windowUnitLabelZh} · 分部堆叠柱状图`;
    refs.detailSegmentCount.textContent = currentChartLanguage() === "en" ? `${segmentCount} segments` : `${segmentCount} 个`;
    refs.detailSegmentNote.textContent =
      currentChartLanguage() === "en"
        ? `Each bar shows quarterly revenue split by segment; categories follow each filing period's official taxonomy.`
        : `每个柱子代表一个季度，并按分部营收堆叠；分类严格遵循各期官方披露口径。`;
    refs.detailStatementSummary.textContent = `${formatBillionsInCurrency(earliestRevenue, primaryDisplayCurrency)} → ${formatBillionsInCurrency(
      latestRevenue,
      primaryDisplayCurrency
    )}`;
    refs.detailStatementNote.textContent =
      growthPct !== null && Number.isFinite(growthPct)
        ? currentChartLanguage() === "en"
          ? `Window growth: ${formatPct(growthPct, true)} · ${requestedQuarterCount}-${windowUnitLabel === "quarters" ? "quarter" : "period"} continuity verified`
          : `窗口营收增长：${formatPct(growthPct, true)} · ${requestedQuarterCount}${windowUnitLabelZh}连续性已校验`
        : currentChartLanguage() === "en"
          ? `${requestedQuarterCount}-${windowUnitLabel === "quarters" ? "quarter" : "period"} continuity verified`
          : `${requestedQuarterCount}${windowUnitLabelZh}连续性已校验`;
    refs.detailSourceTitle.textContent =
      currentChartLanguage() === "en" ? "Official segments + currency normalization" : "官方分部 + 币种归一";
    refs.detailSourceNote.textContent =
      currentChartLanguage() === "en"
        ? `Currency: ${currencySummary}${convertedQuarterCount ? ` (converted ${convertedQuarterCount}/${quarterCount} quarters from ${sourceCurrencySet.join("/") || "local currencies"})` : ""}. Historical bars are taxonomy-harmonized by period.`
        : `币种：${currencySummary}${convertedQuarterCount ? `（${convertedQuarterCount}/${quarterCount} 个季度由 ${sourceCurrencySet.join("/") || "本币"} 折算）` : ""}。历史季度按分期口径进行分类对齐。`;
    refs.footnoteText.textContent =
      currentChartLanguage() === "en"
        ? `Color mappings are brand-driven and remain stable by segment key within the selected window.`
        : `颜色映射由公司品牌自动驱动，并在当前窗口内按分部键保持稳定。`;
  } else {
    refs.chartTitle.textContent = localizeChartTitle(snapshot);
    refs.chartMeta.textContent = [companyDisplay(company), snapshot.quarterKey].filter(Boolean).join(" · ");
    refs.detailSegmentCount.textContent = `${snapshot.businessGroups?.length || 0} 个`;
    refs.detailSegmentNote.textContent =
      snapshot.mode === "pixel-replica"
        ? "当前季度使用统一高精复刻模板生成，并按参考样板参数校准业务板块布局。"
        : "当前季度使用统一高精复刻模板自动生成；如果缺少分部数据，会保留同一套汇聚/分散主桥并自动收敛为单收入块。";
    refs.detailStatementSummary.textContent = `${formatBillions(snapshot.revenueBn)} → ${formatNetOutcomeBillions(snapshot)}`;
    refs.detailStatementNote.textContent = `毛利 ${formatBillions(snapshot.grossProfitBn)} / 营业利润 ${formatBillions(snapshot.operatingProfitBn)}`;
    refs.detailSourceTitle.textContent = snapshot.sourceLabel;
    refs.detailSourceNote.textContent = snapshot.footnote;
    refs.footnoteText.textContent = snapshot.footnote;
  }

  refs.quarterHint.textContent = `${snapshot.periodEndLabel || ""} · ${snapshot.fiscalLabel || ""}`;
  if (refs.calibrationPresetPill) refs.calibrationPresetPill.textContent = snapshot.templatePresetLabel || "-";
  if (refs.languageSelect) refs.languageSelect.value = currentChartLanguage();
  syncChartModeToggleUi();
}

function tightenRenderedSvgViewport() {
  const svg = refs.chartOutput?.querySelector("svg");
  const content = svg?.querySelector("#chartContent");
  if (!svg || !content || typeof content.getBBox !== "function") return null;
  try {
    const bbox = content.getBBox();
    if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) return null;
    const currentViewBox = String(svg.getAttribute("viewBox") || "0 0 1600 900")
      .trim()
      .split(/\s+/)
      .map((value) => Number(value));
    const [, , currentWidth = 1600, currentHeight = 900] = currentViewBox;
    const padLeft = 56;
    const padRight = 56;
    const padTop = 40;
    const padBottom = 156;
    const x = Math.max(Math.floor(bbox.x - padLeft), 0);
    const y = Math.max(Math.floor(bbox.y - padTop), 0);
    const width = Math.min(Math.ceil(bbox.width + padLeft + padRight), Math.max(currentWidth - x, 1));
    const height = Math.min(Math.ceil(bbox.height + padTop + padBottom), Math.max(currentHeight - y, 1));
    svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
    refs.chartOutput.style.aspectRatio = `${width} / ${height}`;
    return { x, y, width, height };
  } catch (_error) {
    return null;
  }
}

function renderCurrent() {
  const company = getCompany(state.selectedCompanyId);
  if (!company) return;
  const quarterKey = refs.quarterSelect?.value || state.selectedQuarter;
  state.selectedQuarter = quarterKey;
  try {
    const snapshot = buildSnapshot(company, quarterKey);
    if (!snapshot) {
      refs.chartOutput.innerHTML = "";
      setStatus("当前公司或季度缺少可用数据。");
      return;
    }
    snapshot.companyNameZh = company.nameZh;
    snapshot.companyNameEn = company.nameEn;
    snapshot.editorNodeOverrides = currentEditorOverrides();
    snapshot.editorSelectedNodeId = state.editor.selectedNodeId;
    snapshot.editModeEnabled = state.editor.enabled;
    state.currentSnapshot = snapshot;
    let barHistory = null;
    const isBarsMode = currentChartViewMode() === "bars";
    if (isBarsMode) {
      const barRenderResult = EarningsVizRuntime.render.renderRevenueSegmentBarsSvg(snapshot, company, { maxQuarters: 30 });
      refs.chartOutput.innerHTML = barRenderResult.svg;
      refs.chartOutput.style.aspectRatio = `${barRenderResult.width} / ${barRenderResult.height}`;
      barHistory = barRenderResult.history;
    } else {
      refs.chartOutput.innerHTML = EarningsVizRuntime.render.renderIncomeStatementSvg(snapshot, company);
      if (snapshot.mode === "pixel-replica" || snapshot.mode === "replica-template") {
        const canvas = EarningsVizRuntime.layout.snapshotCanvasSize(snapshot);
        refs.chartOutput.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
      } else {
        refs.chartOutput.style.aspectRatio = "1600 / 900";
      }
    }
    if (!isBarsMode) {
      tightenRenderedSvgViewport();
    }
    updateMeta(snapshot, company, { history: barHistory });
    updateCalibrationUi(snapshot, company);
    bindInteractiveEditor(snapshot);
    setStatus(
      currentChartViewMode() === "bars"
        ? `已生成 ${company.nameEn} ${quarterKey} 分部柱状图。`
        : `已生成 ${company.nameEn} ${quarterKey} 图像。`
    );
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => warmVisibleLogoAssets(), { timeout: 180 });
    } else {
      setTimeout(() => warmVisibleLogoAssets(), 0);
    }
  } catch (error) {
    refs.chartOutput.innerHTML = "";
    syncEditModeUi();
    const message = error?.message || String(error || "图像渲染失败。");
    setStatus(`图像渲染失败：${message}`);
    if (typeof window !== "undefined") {
      window.__codexDebugError = message;
    }
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

function currentFilenameStem() {
  const snapshot = state.currentSnapshot;
  const company = getCompany(state.selectedCompanyId);
  if (!snapshot || !company) return "earnings-image";
  const modeSuffix =
    currentChartViewMode() === "bars"
      ? "segment-bars"
      : snapshot.mode === "pixel-replica"
        ? "replica"
        : "template";
  return `${company.ticker.toLowerCase()}-${snapshot.quarterKey}-${modeSuffix}-chart`;
}

function currentSvgText() {
  const svg = refs.chartOutput?.querySelector("svg");
  if (!svg) return null;
  return new XMLSerializer().serializeToString(svg);
}

function exportSvg() {
  const svgText = currentSvgText();
  if (!svgText) {
    setStatus("当前没有可导出的 SVG。");
    return;
  }
  downloadBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), `${currentFilenameStem()}.svg`);
  setStatus("SVG 已导出。");
}

function exportPng(scaleFactor = 1, suffix = "") {
  currentPngDataUrl(scaleFactor)
    .then(({ dataUrl }) => {
      const pngBlob = dataUrlToBlob(dataUrl);
      downloadBlob(pngBlob, `${currentFilenameStem()}${suffix}.png`);
      setStatus(scaleFactor > 1 ? "超清 PNG 已导出。" : "PNG 已导出。");
    })
    .catch(() => {
      setStatus("PNG 导出失败。");
    });
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || "").split(",");
  const header = parts[0] || "";
  const body = parts[1] || "";
  const mimeMatch = /^data:([^;]+);base64$/i.exec(header);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function currentPngDataUrl(scaleFactor = 1) {
  const svgText = currentSvgText();
  if (!svgText) return Promise.reject(new Error("当前没有可导出的 PNG。"));
  return new Promise((resolve, reject) => {
    const viewBoxMatch = /viewBox="([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.]+)\s+([0-9.]+)"/.exec(svgText);
    const exportWidth = Math.max(Math.round((viewBoxMatch ? Number(viewBoxMatch[3]) : 1600) * Math.max(scaleFactor, 1)), 1);
    const exportHeight = Math.max(Math.round((viewBoxMatch ? Number(viewBoxMatch[4]) : 900) * Math.max(scaleFactor, 1)), 1);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = exportWidth;
        canvas.height = exportHeight;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f7f7f5";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        URL.revokeObjectURL(url);
        resolve({
          dataUrl,
          width: exportWidth,
          height: exportHeight,
          filenameStem: currentFilenameStem(),
        });
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("PNG 导出失败。"));
    };
    image.src = url;
  });
}

function waitForAnimationFrames(count = 1) {
  const frameCount = Math.max(1, Math.floor(safeNumber(count, 1)));
  let remaining = frameCount;
  return new Promise((resolve) => {
    const advance = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(advance);
        return;
      }
      setTimeout(advance, 16);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(advance);
      return;
    }
    setTimeout(advance, 0);
  });
}

function resolveAutomationCompanyId(target) {
  const requested = String(target || "").trim();
  if (!requested) return state.selectedCompanyId || null;
  if (state.companyById?.[requested]) return requested;
  const normalized = requested.toLowerCase();
  const exactMatch = companies().find((company) => {
    const fields = [
      company.id,
      company.ticker,
      company.slug,
      company.nameEn,
      company.nameZh,
    ];
    return fields.some((value) => String(value || "").trim().toLowerCase() === normalized);
  });
  if (exactMatch) return exactMatch.id;
  const fuzzyMatch = companies().find((company) => {
    const fields = [
      company.id,
      company.ticker,
      company.slug,
      company.nameEn,
      company.nameZh,
    ];
    return fields.some((value) => String(value || "").trim().toLowerCase().includes(normalized));
  });
  return fuzzyMatch?.id || null;
}

async function automationRenderSelection(options = {}) {
  await automationReadyPromise;
  const requestedCompanyId = resolveAutomationCompanyId(
    options.companyId || options.company || options.ticker || options.name || ""
  );
  if (!requestedCompanyId) {
    throw new Error(`无法匹配公司：${options.companyId || options.company || options.ticker || options.name || ""}`);
  }
  const requestedLanguage = options.language === "en" ? "en" : "zh";
  state.uiLanguage = requestedLanguage;
  if (refs.languageSelect) refs.languageSelect.value = requestedLanguage;

  state.selectedCompanyId = requestedCompanyId;
  state.selectedQuarter = options.quarterKey ? String(options.quarterKey).trim() : null;
  state.chartViewMode = options.viewMode === "bars" ? "bars" : "sankey";
  state.editor.selectedNodeId = null;
  state.editor.dragging = null;
  syncChartModeToggleUi();
  syncQuarterOptions({ preferReplica: !!options.preferReplica });

  const company = getCompany(requestedCompanyId);
  if (!company) {
    throw new Error(`公司不存在：${requestedCompanyId}`);
  }
  if (options.quarterKey) {
    const requestedQuarter = String(options.quarterKey).trim();
    const availableQuarters = renderableQuarterKeys(company);
    if (!availableQuarters.includes(requestedQuarter)) {
      throw new Error(`季度 ${requestedQuarter} 不可用，可选季度：${availableQuarters.join(", ")}`);
    }
    state.selectedQuarter = requestedQuarter;
    if (refs.quarterSelect) refs.quarterSelect.value = requestedQuarter;
  }

  renderCompanyList();
  renderCoverage();
  renderCurrent();
  await waitForAnimationFrames(2);
  return {
    companyId: state.selectedCompanyId,
    quarterKey: state.selectedQuarter,
    viewMode: currentChartViewMode(),
    language: currentChartLanguage(),
    filenameStem: currentFilenameStem(),
    status: refs.statusText?.textContent || "",
  };
}

async function automationCaptureCurrentChart(options = {}) {
  const renderSummary = await automationRenderSelection(options);
  const svgText = currentSvgText();
  if (!svgText) {
    throw new Error("当前图表没有可导出的 SVG。");
  }
  const pngPayload = await currentPngDataUrl(Math.max(safeNumber(options.scaleFactor, 1), 1));
  return {
    ...renderSummary,
    svgText,
    pngDataUrl: pngPayload.dataUrl,
    width: pngPayload.width,
    height: pngPayload.height,
  };
}

async function automationExportChartSet(options = {}) {
  const requestedModes = Array.isArray(options.modes) && options.modes.length ? options.modes : ["sankey", "bars"];
  const exports = [];
  for (const mode of requestedModes) {
    exports.push(
      await automationCaptureCurrentChart({
        ...options,
        viewMode: mode === "bars" ? "bars" : "sankey",
      })
    );
  }
  return {
    companyId: exports[0]?.companyId || null,
    quarterKey: exports[0]?.quarterKey || null,
    language: exports[0]?.language || currentChartLanguage(),
    exports,
  };
}

if (typeof window !== "undefined") {
  window.earningsImageStudioAutomation = Object.freeze({
    waitUntilReady: () => automationReadyPromise,
    renderSelection: automationRenderSelection,
    captureCurrentChart: automationCaptureCurrentChart,
    exportChartSet: automationExportChartSet,
    getBootState: () => ({
      isReady: automationBootState.isReady,
      error: automationBootState.error ? String(automationBootState.error.message || automationBootState.error) : null,
    }),
  });
}

async function loadDataset() {
  setStatus("正在加载数据集...");
  const response = await fetchJson(`./data/earnings-dataset.json?v=${BUILD_ASSET_VERSION}`);
  if (!response.ok) throw new Error("数据文件读取失败。");
  state.dataset = await response.json();
  state.sortedCompanies = [...(state.dataset?.companies || [])].map((company, index) => normalizeLoadedCompany(company, index)).sort((left, right) => left.rank - right.rank);
  state.companyById = Object.fromEntries(state.sortedCompanies.map((company) => [company.id, company]));
  state.dataset.companies = state.sortedCompanies;
  await enrichDatasetWithFinancialFallbacks();
}

async function loadLogoCatalog() {
  try {
    const response = await fetchJson(`./data/logo-catalog.json?v=${BUILD_ASSET_VERSION}`);
    if (!response.ok) return;
    const payload = await response.json();
    state.logoCatalog = payload?.logos || {};
    state.normalizedLogoKeys = {};
    state.logoNormalizationJobs = {};
  } catch (_error) {
    state.logoCatalog = {};
    state.normalizedLogoKeys = {};
    state.logoNormalizationJobs = {};
  }
}

async function loadSupplementalComponents() {
  try {
    const response = await fetchJson(`./data/supplemental-components.json?v=${BUILD_ASSET_VERSION}`);
    if (!response.ok) {
      state.supplementalComponents = {};
      return;
    }
    state.supplementalComponents = await response.json();
  } catch (_error) {
    state.supplementalComponents = {};
  }
}

function fetchJson(url) {
  return fetch(url, {
    cache: "no-store",
  });
}

function formatDatasetGeneratedAt(value) {
  if (!value) return "-";
  const dateValue = new Date(value);
  if (!Number.isFinite(dateValue.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat(currentChartLanguage() === "en" ? "en-US" : "zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dateValue);
  } catch (_error) {
    return dateValue.toLocaleString();
  }
}

function updateDatasetTimestampUi() {
  if (!refs.toolbarUpdatedLabel || !refs.toolbarUpdatedAt) return;
  refs.toolbarUpdatedLabel.textContent = currentChartLanguage() === "en" ? "Data updated" : "数据更新";
  refs.toolbarUpdatedAt.textContent = formatDatasetGeneratedAt(state.dataset?.generatedAt);
}

function updateHero() {
  const count = state.dataset?.companyCount || 0;
  if (refs.heroCoverageText) {
    refs.heroCoverageText.textContent = `当前已载入 ${count} 家公司；核心样本优先补齐近 30 季（约自 2018Q1 起），其余公司按公开源可得范围扩展。`;
  }
  if (refs.companyCountPill) {
    refs.companyCountPill.textContent = `${count} 家`;
  }
}

function bindEvents() {
  refs.companySearch?.addEventListener("input", renderCompanyList);
  refs.companyList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-company-id]");
    const companyId = button?.getAttribute?.("data-company-id");
    if (!companyId || companyId === state.selectedCompanyId) return;
    selectCompany(companyId, { preferReplica: false, rerenderList: false });
  });
  refs.quarterSelect?.addEventListener("change", requestRenderCurrent);
  refs.renderBtn?.addEventListener("click", renderCurrent);
  refs.downloadSvgBtn?.addEventListener("click", exportSvg);
  refs.downloadPngBtn?.addEventListener("click", exportPng);
  refs.downloadHdBtn?.addEventListener("click", () => exportPng(3, "-uhd"));
  refs.chartModeToggleBtn?.addEventListener("click", () => {
    state.chartViewMode = currentChartViewMode() === "bars" ? "sankey" : "bars";
    state.editor.selectedNodeId = null;
    state.editor.dragging = null;
    requestRenderCurrent();
  });
  refs.editImageBtn?.addEventListener("click", () => {
    if (!isInteractiveSankeyEditable()) return;
    state.editor.enabled = !state.editor.enabled;
    if (!state.editor.enabled) {
      state.editor.selectedNodeId = null;
      state.editor.dragging = null;
    }
    requestRenderCurrent();
  });
  refs.resetImageBtn?.addEventListener("click", () => {
    if (!isInteractiveSankeyEditable()) return;
    clearCurrentEditorOverrides();
    state.editor.selectedNodeId = null;
    state.editor.dragging = null;
    requestRenderCurrent();
  });
  refs.languageSelect?.addEventListener("change", () => {
    state.uiLanguage = refs.languageSelect?.value === "en" ? "en" : "zh";
    requestRenderCurrent();
  });
  refs.overlayToggle?.addEventListener("change", () => {
    state.calibration.overlayEnabled = !!refs.overlayToggle?.checked;
    syncReferenceOverlay();
  });
  refs.overlayFileInput?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0];
    loadReferenceOverlayFile(file);
  });
  refs.overlayOpacity?.addEventListener("input", () => {
    state.calibration.overlayOpacity = safeNumber(refs.overlayOpacity?.value, 35);
    updateCalibrationUi();
  });
  refs.templateTokenEditor?.addEventListener("input", storeCurrentTokenDraft);
  refs.applyTokenBtn?.addEventListener("click", applyCurrentTokenDraft);
  refs.resetTokenBtn?.addEventListener("click", resetCurrentTokenDraft);
  refs.downloadTokenBtn?.addEventListener("click", downloadCurrentTokenJson);
  refs.openMicrosoftPreset?.addEventListener("click", () => {
    selectCompany("microsoft", { preferReplica: true, rerenderList: true });
  });
  if (typeof window !== "undefined") {
    window.addEventListener("pointermove", (event) => {
      const drag = state.editor.dragging;
      if (!drag) return;
      const point = svgPointFromClient(event.clientX, event.clientY);
      if (!point) return;
      const desiredDx = drag.baseDx + (point.x - drag.startX);
      const desiredDy = drag.baseDy + (point.y - drag.startY);
      setCurrentEditorNodeOverride(drag.nodeId, {
        dx: clamp(desiredDx, drag.minDx, drag.maxDx),
        dy: clamp(desiredDy, drag.minDy, drag.maxDy),
      });
      requestEditorRerender();
    });
    window.addEventListener("pointerup", () => {
      if (!state.editor.dragging) return;
      state.editor.dragging = null;
      requestEditorRerender();
    });
  }
}

async function boot() {
  queryRefs();
  bindEvents();
  syncChartModeToggleUi();
  try {
    await Promise.all([loadDataset(), loadLogoCatalog(), loadSupplementalComponents()]);
  } catch (error) {
    setStatus(error.message || "数据加载失败。");
    markAutomationBootFailure(error);
    return;
  }
  updateHero();
  initializeDefaultLandingSelection();
  syncQuarterOptions({ preferReplica: false });
  renderCompanyList();
  renderCoverage();
  renderCurrent();
  markAutomationReady();
}

document.addEventListener("DOMContentLoaded", boot);
