function renderPixelReplicaSvg(snapshot) {
  const canvas = snapshotCanvasSize(snapshot);
  const width = canvas.width;
  const height = canvas.height;
  const leftShiftX = safeNumber(canvas.leftShiftX, 0);
  const verticalScale = height / canvas.designHeight;
  const scaleY = (value) => value * verticalScale;
  const layoutY = (value, fallback) => scaleY(safeNumber(value, fallback));
  const shiftCanvasX = (value, fallback) => safeNumber(value, fallback) + leftShiftX;
  const ribbonCurve = Math.max(safeNumber(snapshot.ribbon?.curveFactor, 0.5), 0.48);
  const ribbonSource = snapshot.ribbon || {};
  const ribbonOptions = {
    curveFactor: ribbonCurve,
    topStartBias: safeNumber(ribbonSource.topStartBias, 0.18),
    topEndBias: safeNumber(ribbonSource.topEndBias, 0.82),
    bottomStartBias: safeNumber(ribbonSource.bottomStartBias, 0.18),
    bottomEndBias: safeNumber(ribbonSource.bottomEndBias, 0.82),
    startCurveFactor: Math.max(safeNumber(ribbonSource.startCurveFactor, ribbonCurve * 0.72), 0.3),
    endCurveFactor: Math.max(safeNumber(ribbonSource.endCurveFactor, ribbonCurve * 0.7), 0.28),
    minStartCurveFactor: Math.max(safeNumber(ribbonSource.minStartCurveFactor, 0.16), 0.16),
    maxStartCurveFactor: Math.max(safeNumber(ribbonSource.maxStartCurveFactor, 0.38), 0.38),
    minEndCurveFactor: Math.max(safeNumber(ribbonSource.minEndCurveFactor, 0.15), 0.15),
    maxEndCurveFactor: Math.max(safeNumber(ribbonSource.maxEndCurveFactor, 0.36), 0.36),
    deltaScale: Math.max(safeNumber(ribbonSource.deltaScale, 0.9), 0.9),
    deltaInfluence: Math.min(safeNumber(ribbonSource.deltaInfluence, 0.06), 0.06),
    thicknessInfluence: Math.max(safeNumber(ribbonSource.thicknessInfluence, 0.06), 0.06),
  };
  const sourceHornSource = ribbonSource.sourceHorn || {};
  const sourceHornOptions = {
    ...sourceHornSource,
    curveFactor: Math.max(safeNumber(sourceHornSource.curveFactor, 0.36), 0.34),
    startCurveFactor: Math.max(safeNumber(sourceHornSource.startCurveFactor, 0.32), 0.3),
    endCurveFactor: Math.max(safeNumber(sourceHornSource.endCurveFactor, 0.36), 0.34),
    minStartCurveFactor: Math.max(safeNumber(sourceHornSource.minStartCurveFactor, 0.14), 0.14),
    maxStartCurveFactor: Math.max(safeNumber(sourceHornSource.maxStartCurveFactor, 0.36), 0.36),
    minEndCurveFactor: Math.max(safeNumber(sourceHornSource.minEndCurveFactor, 0.16), 0.16),
    maxEndCurveFactor: Math.max(safeNumber(sourceHornSource.maxEndCurveFactor, 0.38), 0.38),
    deltaScale: Math.max(safeNumber(sourceHornSource.deltaScale, 0.92), 0.92),
    deltaInfluence: Math.min(safeNumber(sourceHornSource.deltaInfluence, 0.065), 0.065),
    thicknessInfluence: Math.max(safeNumber(sourceHornSource.thicknessInfluence, 0.055), 0.055),
  };
  const detailSourceHornOptions = {
    ...sourceHornOptions,
    curveFactor: Math.max(safeNumber(sourceHornSource.detailCurveFactor, sourceHornOptions.curveFactor + 0.05), 0.38),
    startCurveFactor: Math.max(safeNumber(sourceHornSource.detailStartCurveFactor, sourceHornOptions.startCurveFactor + 0.04), 0.34),
    endCurveFactor: Math.max(safeNumber(sourceHornSource.detailEndCurveFactor, sourceHornOptions.endCurveFactor + 0.05), 0.38),
    minStartCurveFactor: Math.max(safeNumber(sourceHornSource.detailMinStartCurveFactor, 0.16), sourceHornOptions.minStartCurveFactor),
    maxStartCurveFactor: Math.max(safeNumber(sourceHornSource.detailMaxStartCurveFactor, 0.42), sourceHornOptions.maxStartCurveFactor),
    minEndCurveFactor: Math.max(safeNumber(sourceHornSource.detailMinEndCurveFactor, 0.18), sourceHornOptions.minEndCurveFactor),
    maxEndCurveFactor: Math.max(safeNumber(sourceHornSource.detailMaxEndCurveFactor, 0.44), sourceHornOptions.maxEndCurveFactor),
    deltaScale: Math.max(safeNumber(sourceHornSource.detailDeltaScale, 0.96), sourceHornOptions.deltaScale),
    deltaInfluence: Math.min(safeNumber(sourceHornSource.detailDeltaInfluence, 0.058), sourceHornOptions.deltaInfluence),
    sourceHoldFactor: clamp(safeNumber(sourceHornSource.detailSourceHoldFactor, 0.03), 0.012, 0.05),
    minSourceHoldLength: Math.max(safeNumber(sourceHornSource.detailMinSourceHoldLength, 2), 1),
    maxSourceHoldLength: Math.max(safeNumber(sourceHornSource.detailMaxSourceHoldLength, 10), 6),
    targetHoldFactor: clamp(safeNumber(sourceHornSource.detailTargetHoldFactor, 0.024), 0.01, 0.045),
    minTargetHoldLength: Math.max(safeNumber(sourceHornSource.detailMinTargetHoldLength, 2), 1),
    maxTargetHoldLength: Math.max(safeNumber(sourceHornSource.detailMaxTargetHoldLength, 8), 4),
  };
  const replicaFlowPath = (x0, y0Top, y0Bottom, x1, y1Top, y1Bottom) =>
    flowPath(
      x0,
      y0Top,
      y0Bottom,
      x1 + safeNumber(snapshot.layout?.targetCoverInsetX, 20),
      y1Top,
      y1Bottom,
      ribbonOptions
    );
  const outflowRibbonOptions = {
    ...ribbonOptions,
    curveFactor: clamp(ribbonCurve + 0.03, 0.52, 0.58),
    startCurveFactor: clamp(Math.min(safeNumber(ribbonOptions.startCurveFactor, 0.34), 0.32) - 0.04, 0.18, 0.26),
    endCurveFactor: clamp(Math.min(safeNumber(ribbonOptions.endCurveFactor, 0.32), 0.34) - 0.01, 0.22, 0.32),
    minStartCurveFactor: clamp(Math.min(safeNumber(ribbonOptions.minStartCurveFactor, 0.17), 0.18) - 0.01, 0.14, 0.18),
    maxStartCurveFactor: clamp(Math.min(safeNumber(ribbonOptions.maxStartCurveFactor, 0.4), 0.36) - 0.02, 0.22, 0.32),
    minEndCurveFactor: clamp(Math.min(safeNumber(ribbonOptions.minEndCurveFactor, 0.16), 0.2) + 0.02, 0.18, 0.24),
    maxEndCurveFactor: clamp(Math.min(safeNumber(ribbonOptions.maxEndCurveFactor, 0.38), 0.36), 0.28, 0.36),
    deltaScale: Math.max(safeNumber(ribbonSource.outflowDeltaScale, 0.98), 0.92),
    deltaInfluence: Math.min(safeNumber(ribbonSource.outflowDeltaInfluence, 0.045), 0.05),
    thicknessInfluence: Math.max(safeNumber(ribbonSource.outflowThicknessInfluence, 0.075), 0.06),
    sourceHoldFactor: clamp(safeNumber(ribbonSource.outflowSourceHoldFactor, 0.05), 0.03, 0.08),
    minSourceHoldLength: Math.max(safeNumber(ribbonSource.outflowMinSourceHoldLength, 6), 4),
    maxSourceHoldLength: Math.max(safeNumber(ribbonSource.outflowMaxSourceHoldLength, 18), 10),
    targetHoldFactor: clamp(safeNumber(ribbonSource.outflowTargetHoldFactor, 0.066), 0.04, 0.1),
    minTargetHoldLength: Math.max(safeNumber(ribbonSource.outflowMinTargetHoldLength, 8), 4),
    maxTargetHoldLength: Math.max(safeNumber(ribbonSource.outflowMaxTargetHoldLength, 24), 12),
    sourceHoldDeltaReduction: clamp(safeNumber(ribbonSource.outflowSourceHoldDeltaReduction, 0.56), 0, 0.88),
    targetHoldDeltaReduction: clamp(safeNumber(ribbonSource.outflowTargetHoldDeltaReduction, 0.68), 0, 0.9),
    minAdaptiveSourceHoldLength: Math.max(safeNumber(ribbonSource.outflowMinAdaptiveSourceHoldLength, 2), 1),
    minAdaptiveTargetHoldLength: Math.max(safeNumber(ribbonSource.outflowMinAdaptiveTargetHoldLength, 3), 1),
    holdDeltaScale: clamp(safeNumber(ribbonSource.outflowHoldDeltaScale, 0.52), 0.24, 1.2),
  };
  const mergeOutflowRibbonOptions = (overrides = {}) => ({
    ...outflowRibbonOptions,
    ...overrides,
  });
  const replicaOutflowPath = (x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, overrides = {}) =>
    flowPath(
      x0,
      y0Top,
      y0Bottom,
      x1 + safeNumber(snapshot.layout?.targetCoverInsetX, 20),
      y1Top,
      y1Bottom,
      mergeOutflowRibbonOptions(overrides)
    );
  const sourceFlowPath = (x0, y0Top, y0Bottom, x1, y1Top, y1Bottom) =>
    hornFlowPath(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, sourceHornOptions);
  const detailSourceFlowPath = (x0, y0Top, y0Bottom, x1, y1Top, y1Bottom) =>
    hornFlowPath(x0, y0Top, y0Bottom, x1, y1Top, y1Bottom, detailSourceHornOptions);
  const titleColor = "#175C8E";
  const muted = "#676C75";
  const dark = "#55595F";
  const greenText = "#009B5F";
  const greenNode = "#2BAB2B";
  const greenFlow = "#ACDBA3";
  const redText = "#9D1F07";
  const redNode = "#E50000";
  const redFlow = "#E58A92";
  const revenueNode = "#707070";
  const background = "#F6F5F2";
  const nodeWidth = 58;
  const sourceNodeWidth = safeNumber(snapshot.layout?.sourceNodeWidth, Math.max(nodeWidth - 6, 48));
  const prototypeFlags = snapshot.prototypeFlags || {};
  const templateTokens = snapshot.templateTokens || {};
  const usesHeroLockups = !!prototypeFlags.heroLockups;
  const usesLeftAnchoredRevenueLabel = !!prototypeFlags.leftAnchoredRevenueLabel;
  const usesCompactQuarterLabel = !!prototypeFlags.compactQuarterLabel;
  const usesLargeTitle = !!prototypeFlags.largeTitle;
  const showQoq = hasSnapshotQoqMetrics(snapshot);
  const usesPreDetailRevenueLayout = Array.isArray(snapshot.leftDetailGroups)
    ? snapshot.leftDetailGroups.some((item) => safeNumber(item?.valueBn) > 0.02)
    : false;
  const stageLayout = resolveUniformStageLayout(snapshot, {
    nodeWidth,
    sourceNodeWidth,
    usesHeroLockups,
  });
  const baseLeftX = stageLayout.leftX;
  const baseLeftDetailX = stageLayout.leftDetailX;
  const baseRightX = stageLayout.rightX;
  const sourceTemplateLabelGapX = safeNumber(
    snapshot.layout?.sourceTemplateLabelGapX,
    safeNumber(snapshot.layout?.sourceLabelGapX, 18)
  );
  const detailSourceLabelGapX = safeNumber(snapshot.layout?.detailSourceLabelGapX, sourceTemplateLabelGapX);
  const layoutBaseRightX = safeNumber(snapshot.layout?.rightX, usesHeroLockups ? 1790 : 1688);
  const leftX = shiftCanvasX(baseLeftX, 368);
  const sourceLabelX = shiftCanvasX(snapshot.layout?.sourceLabelX, Math.max(baseLeftX - 224, 112));
  const sourceTemplateLabelX = shiftCanvasX(
    snapshot.layout?.sourceTemplateLabelX,
    usesPreDetailRevenueLayout
      ? safeNumber(snapshot.layout?.sourceLabelX, baseLeftX - sourceTemplateLabelGapX)
      : baseLeftX - sourceTemplateLabelGapX
  );
  const sourceMetricX = shiftCanvasX(snapshot.layout?.sourceMetricX, baseLeftX + sourceNodeWidth / 2 + safeNumber(snapshot.layout?.sourceMetricOffsetX, 0));
  const sourceTemplateMetricX = shiftCanvasX(snapshot.layout?.sourceTemplateMetricX, safeNumber(snapshot.layout?.sourceMetricX, baseLeftX + 4));
  const detailSourceLabelX = shiftCanvasX(snapshot.layout?.detailSourceLabelX, baseLeftDetailX - detailSourceLabelGapX);
  const detailSourceMetricX = shiftCanvasX(snapshot.layout?.detailSourceMetricX, baseLeftDetailX + 4);
  const revenueX = shiftCanvasX(stageLayout.revenueX, 742);
  const grossX = shiftCanvasX(stageLayout.grossX, 1122);
  const opX = shiftCanvasX(stageLayout.opX, 1480);
  const rightBaseX = shiftCanvasX(baseRightX, usesHeroLockups ? 1790 : 1688);
  const opexTargetX = shiftCanvasX(
    snapshot.layout?.opexTargetX,
    baseRightX + (safeNumber(snapshot.layout?.opexTargetX, layoutBaseRightX - 24) - layoutBaseRightX)
  );
  const rawCostBreakdown = [...(snapshot.costBreakdown || [])].filter((item) => safeNumber(item.valueBn) > 0.02);
  const rawOpexTerminalCount = [...(snapshot.opexBreakdown || [])].filter((item) => safeNumber(item?.valueBn) > 0.02).length;
  const rawBelowTerminalCount = [...(snapshot.belowOperatingItems || [])].filter((item) => safeNumber(item?.valueBn) > 0.02).length;
  const alignCostBreakdownWithOperatingStage =
    rawCostBreakdown.length > 0 &&
    safeNumber(
      snapshot.layout?.alignCostBreakdownWithOperatingStage,
      rawCostBreakdown.length >= 2 || rawOpexTerminalCount + rawBelowTerminalCount > 0 ? 1 : 0
    ) > 0;
  const rawCostBreakdownX = shiftCanvasX(
    snapshot.layout?.costBreakdownX,
    stageLayout.grossX + (safeNumber(snapshot.layout?.costBreakdownX, 1294) - safeNumber(snapshot.layout?.grossX, 1122))
  );
  const templateCostBreakdownBaseX = shiftCanvasX(
    templateTokens.layout?.costBreakdownX,
    stageLayout.grossX + (safeNumber(templateTokens.layout?.costBreakdownX, 1294) - safeNumber(templateTokens.layout?.grossX, 1122))
  );
  const costBreakdownRunwayAvailable = Math.max(opX - (grossX + nodeWidth), 0);
  const costBreakdownRunwayMinX = safeNumber(
    snapshot.layout?.costBreakdownRunwayMinX,
    clamp(costBreakdownRunwayAvailable * 0.66, 188, 248)
  );
  const costBreakdownAutoPullbackX = safeNumber(
    snapshot.layout?.costBreakdownTargetPullbackX,
    rawCostBreakdown.length <= 2
      ? 0
      : rawCostBreakdown.length === 3
        ? 24
        : Math.min(84, (rawCostBreakdown.length - 2) * 24)
  );
  const costBreakdownAlignmentFactor = clamp(
    safeNumber(
      snapshot.layout?.costBreakdownAlignmentFactor,
      rawCostBreakdown.length <= 1
        ? 0.72
        : rawCostBreakdown.length === 2
          ? 1
          : rawCostBreakdown.length === 3
            ? 0.78
            : 0.7
    ),
    0,
    1
  );
  const costBreakdownAlignmentTargetX = opX - costBreakdownAutoPullbackX;
  const costBreakdownAutoX = Math.max(
    grossX + costBreakdownRunwayMinX,
    templateCostBreakdownBaseX + (costBreakdownAlignmentTargetX - templateCostBreakdownBaseX) * costBreakdownAlignmentFactor
  );
  const costBreakdownRunwayMaxX = Math.max(
    grossX +
      safeNumber(
        snapshot.layout?.costBreakdownRunwayMaxX,
        opX - grossX + safeNumber(snapshot.layout?.costBreakdownMaxOffsetFromOpX, 0)
      ),
    grossX + costBreakdownRunwayMinX
  );
  const costBreakdownX =
    alignCostBreakdownWithOperatingStage
      ? opX
      : snapshot.layout?.costBreakdownX !== null && snapshot.layout?.costBreakdownX !== undefined
      ? clamp(rawCostBreakdownX, grossX + costBreakdownRunwayMinX, costBreakdownRunwayMaxX)
      : clamp(costBreakdownAutoX, grossX + costBreakdownRunwayMinX, costBreakdownRunwayMaxX);
  const costBreakdownOpexCollisionTriggerX = safeNumber(snapshot.layout?.costBreakdownOpexCollisionTriggerX, 92);
  const costBreakdownNearOpexColumn =
    rawCostBreakdown.length > 0 && (alignCostBreakdownWithOperatingStage || costBreakdownX >= opX - costBreakdownOpexCollisionTriggerX);
  const costBreakdownExpandedFanout = rawCostBreakdown.length >= 2 && (alignCostBreakdownWithOperatingStage || costBreakdownNearOpexColumn);
  const costBreakdownLabelX = shiftCanvasX(
    snapshot.layout?.costBreakdownLabelX,
    stageLayout.grossX + (safeNumber(snapshot.layout?.costBreakdownLabelX, 1362) - safeNumber(snapshot.layout?.grossX, 1122))
  );
  const rightBranchLabelGapX = safeNumber(snapshot.layout?.rightBranchLabelGapX, safeNumber(snapshot.layout?.sourceTemplateLabelGapX, 18));
  const rightLabelXBase = shiftCanvasX(
    snapshot.layout?.rightLabelX,
    baseRightX + (safeNumber(snapshot.layout?.rightLabelX, layoutBaseRightX + 62) - layoutBaseRightX)
  );
  const opexLabelXBase = shiftCanvasX(
    snapshot.layout?.opexLabelX,
    baseRightX + (safeNumber(snapshot.layout?.opexLabelX, safeNumber(snapshot.layout?.opexTargetX, layoutBaseRightX - 24) + 62) - layoutBaseRightX)
  );
  const belowLabelXBase = shiftCanvasX(
    snapshot.layout?.belowLabelX,
    baseRightX + (safeNumber(snapshot.layout?.belowLabelX, safeNumber(snapshot.layout?.rightLabelX, layoutBaseRightX + 62)) - layoutBaseRightX)
  );
  const negativeTerminalLabelX = Math.max(
    rightBaseX + nodeWidth + rightBranchLabelGapX,
    rightLabelXBase,
    opexLabelXBase,
    belowLabelXBase,
    costBreakdownLabelX
  );
  const opexLabelX = negativeTerminalLabelX;
  const belowLabelX = negativeTerminalLabelX;
  const rightLabelPaddingRight = safeNumber(snapshot.layout?.rightLabelPaddingRight, 44);
  const rightTerminalTitleMaxWidth = Math.max(width - (rightBaseX + nodeWidth + rightBranchLabelGapX) - rightLabelPaddingRight, 120);
  const costTerminalTitleMaxWidth = Math.max(
    width -
      (costBreakdownX +
        nodeWidth +
        rightBranchLabelGapX +
        safeNumber(snapshot.layout?.terminalNodeExtraMaxX, 68)) -
      rightLabelPaddingRight,
    120
  );
  const baseRevenueTop = safeNumber(snapshot.layout?.revenueTop, 330);
  const baseRevenueHeight = safeNumber(snapshot.layout?.revenueHeight, 452);
  const revenueHeight = scaleY(baseRevenueHeight);
  // Keep the stage scale anchored to actual revenue so sub-$1B charts do not leave
  // phantom slack inside the revenue node that later makes cost ribbons appear to taper.
  const revenueBn = Math.max(safeNumber(snapshot.revenueBn), safeNumber(snapshot.layout?.revenueScaleFloorBn, 0.05));
  const grossProfitBn = Math.max(safeNumber(snapshot.grossProfitBn), 0);
  const costOfRevenueBn =
    snapshot.costOfRevenueBn !== null && snapshot.costOfRevenueBn !== undefined
      ? Math.max(safeNumber(snapshot.costOfRevenueBn), 0)
      : Math.max(revenueBn - grossProfitBn, 0);
  const rawOperatingProfitBn = safeNumber(snapshot.operatingProfitBn);
  const hasOperatingLoss = rawOperatingProfitBn < -0.02;
  const operatingProfitBn = hasOperatingLoss ? 0 : Math.max(rawOperatingProfitBn, 0);
  const operatingExpensesBn =
    snapshot.operatingExpensesBn !== null && snapshot.operatingExpensesBn !== undefined
      ? hasOperatingLoss
        ? Math.min(Math.max(safeNumber(snapshot.operatingExpensesBn), 0), grossProfitBn)
        : Math.max(safeNumber(snapshot.operatingExpensesBn), 0)
      : Math.max(grossProfitBn - operatingProfitBn, 0);
  const netOutcomeBn = resolvedNetOutcomeValue(snapshot);
  const netLoss = isLossMakingNetOutcome(snapshot);
  const nearZeroNet = isNearZeroNetOutcome(snapshot);
  const netProfitBn = netLoss ? Math.abs(netOutcomeBn) : Math.max(netOutcomeBn, 0);
  const scale = revenueHeight / revenueBn;
  const grossHeight = Math.max(grossProfitBn * scale, 4);
  const costHeight = costOfRevenueBn > 0.05 ? Math.max(costOfRevenueBn * scale, 4) : 0;
  const opHeight = Math.max(operatingProfitBn * scale, 4);
  const opexHeight = Math.max(operatingExpensesBn * scale, 4);
  const netHeight = Math.max(netProfitBn * scale, nearZeroNet ? scaleY(4.5) : 4);
  const showCostBridge = costHeight > 0;
  const baseChartBottomLimit = layoutY(snapshot.layout?.chartBottomLimit, 1004);
  const rawSources = sortBusinessGroupsByValue(snapshot.businessGroups || []).filter((item) => safeNumber(item.valueBn) > 0.02);
  const rawLeftDetailGroups = [...(snapshot.leftDetailGroups || [])].filter((item) => safeNumber(item.valueBn) > 0.02);
  const rawOpexItemsSource = [...(snapshot.opexBreakdown || [])].filter((item) => safeNumber(item.valueBn) > 0.02);
  const collapsedOpexItem = resolveCollapsedSingleExpenseBreakdown(rawOpexItemsSource, snapshot.operatingExpensesBn, {
    baseTolerance: 0.08,
    relativeToleranceFactor: 0.01,
  });
  const rawOpexItems = collapsedOpexItem ? [] : rawOpexItemsSource;
  const rawBelowOperatingItems = [...(snapshot.belowOperatingItems || [])].filter((item) => safeNumber(item.valueBn) > 0.02);
  const rawPositiveAdjustments = [...(snapshot.positiveAdjustments || [])].filter((item) => safeNumber(item.valueBn) > 0.02);
  const leftBranchCount = rawSources.length + rawLeftDetailGroups.length * 0.92;
  const rightBranchCount =
    rawOpexItems.length +
    rawBelowOperatingItems.length +
    rawCostBreakdown.length * 0.85 +
    rawPositiveAdjustments.length * 0.7;
  const leftComplexity =
    Math.max(leftBranchCount - 4.5, 0) * 7.4 +
    Math.max(rawLeftDetailGroups.length - 1, 0) * 6.6;
  const rightComplexity =
    Math.max(rightBranchCount - 2.15, 0) * 10.8 +
    Math.max(rawCostBreakdown.length - 1, 0) * 6.2 +
    Math.max(rawPositiveAdjustments.length - 1, 0) * 4.2;
  const lowerRightPressureY = scaleY(
    clamp(
      safeNumber(
        snapshot.layout?.lowerRightPressureY,
        Math.max(rightComplexity - 9, 0) * 1.85 +
          (costBreakdownNearOpexColumn ? 18 : 0) +
          (rawCostBreakdown.length === 2 ? 16 : Math.max(rawCostBreakdown.length - 2, 0) * 10) +
          Math.max(rawOpexItems.length - 2, 0) * 8 +
          Math.max(rawBelowOperatingItems.length - 1, 0) * 10
      ),
      0,
      usesHeroLockups ? 88 : 74
    )
  );
  const rightStageCrowdingStrength = clamp(
    safeNumber(
      snapshot.layout?.rightStageCrowdingStrength,
      clamp(lowerRightPressureY / scaleY(88), 0, 1) * 0.54 +
        Math.max(rawCostBreakdown.length - 1, 0) * 0.18 +
        Math.max(rawOpexItems.length + rawBelowOperatingItems.length - 3, 0) * 0.08 +
        (costBreakdownNearOpexColumn ? 0.26 : 0)
    ),
    0,
    0.94
  );
  const hasDenseLeftStage = rawSources.length >= 6 || rawLeftDetailGroups.length >= 2;
  const hasDenseRightStage =
    rightBranchCount >= 3 ||
    rawOpexItems.length + rawBelowOperatingItems.length >= 3 ||
    rawCostBreakdown.length >= 2 ||
    rawPositiveAdjustments.length >= 2;
  const stageBottomClearanceY = scaleY(safeNumber(snapshot.layout?.stageBottomClearanceY, usesHeroLockups ? 118 : 108));
  const unilateralStageSlackY = Math.max(height - baseChartBottomLimit - stageBottomClearanceY, 0);
  const unilateralStageSlackEligible =
    (hasDenseLeftStage || hasDenseRightStage) &&
    unilateralStageSlackY >= scaleY(safeNumber(snapshot.layout?.minUnilateralStageSlackY, 42));
  const stageRecenteringEligibility = hasDenseLeftStage && hasDenseRightStage || unilateralStageSlackEligible;
  const chartBottomLimit = stageRecenteringEligibility
    ? Math.max(
        baseChartBottomLimit,
        height - stageBottomClearanceY
      )
    : baseChartBottomLimit;
  const bilateralDensity =
    Math.max(Math.min(leftComplexity, rightComplexity), 0) * 0.56 +
    Math.max(leftComplexity + rightComplexity - 32, 0) * 0.44;
  const bilateralStageComplexity =
    hasDenseLeftStage && hasDenseRightStage
      ? bilateralDensity
      : hasDenseLeftStage
        ? bilateralDensity * 0.38
        : bilateralDensity * 0.16;
  const stageCenteringShiftY = scaleY(
    clamp(
      safeNumber(
        snapshot.layout?.stageCenteringShiftY,
        bilateralStageComplexity +
          (hasDenseLeftStage && hasDenseRightStage ? 22 : 0) +
          (rawLeftDetailGroups.length && hasDenseRightStage ? 12 : 0) +
          (rawSources.length >= 7 && hasDenseRightStage ? 8 : 0) +
          (rightBranchCount >= 4 && hasDenseLeftStage ? 10 : 0)
      ),
      0,
      usesHeroLockups ? 124 : 108
    )
  );
  const hasExplicitGrossNodeTop = snapshot.layout?.grossNodeTop !== null && snapshot.layout?.grossNodeTop !== undefined;
  const hasExplicitCostNodeTop = snapshot.layout?.costNodeTop !== null && snapshot.layout?.costNodeTop !== undefined;
  const revenueTopBase = clamp(
    scaleY(baseRevenueTop) + stageCenteringShiftY * safeNumber(snapshot.layout?.revenueStageShiftFactor, 0.82),
    scaleY(244),
    chartBottomLimit - revenueHeight
  );
  const grossTopBase = clamp(
    layoutY(snapshot.layout?.grossNodeTop, baseRevenueTop + (usesHeroLockups ? 74 : 46)) +
      stageCenteringShiftY * safeNumber(snapshot.layout?.grossStageShiftFactor, 0.98),
    scaleY(236),
    chartBottomLimit - grossHeight
  );
  const hasExplicitOpNodeTop = snapshot.layout?.opNodeTop !== null && snapshot.layout?.opNodeTop !== undefined;
  const hasExplicitOpexNodeTop = snapshot.layout?.opexNodeTop !== null && snapshot.layout?.opexNodeTop !== undefined;
  const hasExplicitNetNodeTop = snapshot.layout?.netNodeTop !== null && snapshot.layout?.netNodeTop !== undefined;
  const positiveFlowRiseBoostY = rawPositiveAdjustments.length
    ? scaleY(
        clamp(
          safeNumber(
            snapshot.layout?.positiveFlowRiseBoostY,
            22 +
              Math.max(rawPositiveAdjustments.length - 1, 0) * 8 +
              Math.max(rawOpexItems.length + rawBelowOperatingItems.length - 2, 0) * 4
          ),
          usesHeroLockups ? 18 : 16,
          usesHeroLockups ? 62 : 54
        )
      )
    : 0;
  const profitRiseRatio = safeNumber(snapshot.layout?.profitRiseRatio, usesHeroLockups ? 0.62 : 0.64);
  const profitRiseBaseY = scaleY(safeNumber(snapshot.layout?.profitRiseBaseY, usesHeroLockups ? 16 : 12));
  const profitRiseMinY = scaleY(safeNumber(snapshot.layout?.profitRiseMinY, usesHeroLockups ? 40 : 34));
  const profitRiseMaxY = scaleY(safeNumber(snapshot.layout?.profitRiseMaxY, usesHeroLockups ? 106 : 92));
  const profitRiseY = clamp(
    Math.max(grossHeight - opHeight, 0) * profitRiseRatio +
      profitRiseBaseY +
      positiveFlowRiseBoostY * 0.7 +
      lowerRightPressureY *
        safeNumber(
          snapshot.layout?.profitRiseLowerRightPressureFactor,
          costBreakdownNearOpexColumn ? 0.82 : rawCostBreakdown.length >= 2 ? 0.7 : 0.54
        ),
    profitRiseMinY,
    profitRiseMaxY +
      positiveFlowRiseBoostY +
      lowerRightPressureY * safeNumber(snapshot.layout?.profitRiseLowerRightPressureMaxFactor, 0.94)
  );
  const costMinGapFromGross = scaleY(safeNumber(snapshot.layout?.costMinGapFromGross, usesHeroLockups ? 20 : 18));
  const costGapRatio = safeNumber(snapshot.layout?.costGapRatio, 0.018);
  const costGapBaseY = scaleY(safeNumber(snapshot.layout?.costGapBaseY, usesHeroLockups ? 14 : 12));
  const costGapMinY = scaleY(safeNumber(snapshot.layout?.costGapMinY, usesHeroLockups ? 22 : 20));
  const costGapMaxY = scaleY(safeNumber(snapshot.layout?.costGapMaxY, usesHeroLockups ? 36 : 30));
  const costGapY = clamp(
    costHeight * costGapRatio +
      costGapBaseY +
      lowerRightPressureY * safeNumber(snapshot.layout?.costGapLowerRightPressureFactor, rawCostBreakdown.length >= 2 ? 0.14 : 0.08),
    costGapMinY,
    costGapMaxY + lowerRightPressureY * safeNumber(snapshot.layout?.costGapLowerRightPressureMaxFactor, 0.24)
  );
  const templateCostTopBaseline = layoutY(
    templateTokens.layout?.costNodeTop,
    baseRevenueTop + baseRevenueHeight + (usesHeroLockups ? 56 : 36)
  );
  const costOutflowBiasYBase = scaleY(
    clamp(
      safeNumber(
        snapshot.layout?.costOutflowBiasY,
        14 +
          (rawCostBreakdown.length <= 1 ? 0 : rawCostBreakdown.length === 2 ? 18 : 24 + (rawCostBreakdown.length - 3) * 8)
      ),
      usesHeroLockups ? 18 : 14,
      usesHeroLockups ? 66 : 56
    )
  );
  const costOutflowBiasY =
    costOutflowBiasYBase +
    lowerRightPressureY *
      safeNumber(
        snapshot.layout?.costOutflowLowerRightPressureFactor,
        costBreakdownNearOpexColumn ? 0.58 : rawCostBreakdown.length >= 2 ? 0.46 : 0.24
      );
  const costTemplateAnchorWeight = clamp(
    safeNumber(
      snapshot.layout?.costTemplateAnchorWeight,
      rawCostBreakdown.length <= 1
        ? 0.64
        : rawCostBreakdown.length === 2
          ? 0.72
          : rawCostBreakdown.length === 3
            ? 0.68
            : 0.6
    ),
    0,
    1
  );
  const costAutoTopTarget =
    templateCostTopBaseline * costTemplateAnchorWeight +
    (grossTopBase + grossHeight + costGapY + costOutflowBiasY) * (1 - costTemplateAnchorWeight);
  const costBaseTopCandidate = showCostBridge
    ? clamp(
        hasExplicitCostNodeTop ? layoutY(snapshot.layout?.costNodeTop) : costAutoTopTarget,
        grossTopBase + grossHeight + costMinGapFromGross,
        chartBottomLimit - costHeight
      )
    : chartBottomLimit - scaleY(8);
  const opTopBase = clamp(
    (hasExplicitOpNodeTop ? layoutY(snapshot.layout?.opNodeTop) : grossTopBase - profitRiseY) +
      stageCenteringShiftY * safeNumber(snapshot.layout?.operatingStageShiftFactor, 1),
    scaleY(220),
    chartBottomLimit - opHeight
  );
  const opexMinGapFromOperating = scaleY(safeNumber(snapshot.layout?.opexMinGapFromOperating, usesHeroLockups ? 46 : 40));
  const grossExpenseGapRatio = safeNumber(snapshot.layout?.grossExpenseGapRatio, 0.44);
  const grossExpenseGapBaseY = scaleY(safeNumber(snapshot.layout?.grossExpenseGapBaseY, 0));
  const grossExpenseGapMinY = scaleY(safeNumber(snapshot.layout?.grossExpenseGapMinY, usesHeroLockups ? 34 : 28));
  const grossExpenseGapMaxY = scaleY(safeNumber(snapshot.layout?.grossExpenseGapMaxY, usesHeroLockups ? 72 : 60));
  const grossExpenseGapY = clamp(opexHeight * grossExpenseGapRatio + grossExpenseGapBaseY, grossExpenseGapMinY, grossExpenseGapMaxY);
  const opexMinTop = Math.min(
    Math.max(scaleY(360), opTopBase + opHeight + opexMinGapFromOperating),
    chartBottomLimit - opexHeight
  );
  const opexBaseCandidate =
    (hasExplicitOpexNodeTop ? layoutY(snapshot.layout?.opexNodeTop) : grossTopBase + opHeight + grossExpenseGapY) +
    stageCenteringShiftY * safeNumber(snapshot.layout?.opexStageShiftFactor, 1.12);
  const opexAdaptiveLiftHeadroom = Math.max(opexBaseCandidate - opexMinTop, 0);
  const opexAdaptiveLiftY =
    snapshot.layout?.disableAdaptiveRightStageLift === true
      ? 0
      : Math.min(
          scaleY(safeNumber(snapshot.layout?.opexAdaptiveLiftMaxY, 126)),
          opexAdaptiveLiftHeadroom * safeNumber(snapshot.layout?.opexAdaptiveLiftHeadroomFactor, 0.82),
          scaleY(safeNumber(snapshot.layout?.opexAdaptiveLiftBaseY, 34)) +
            lowerRightPressureY * safeNumber(snapshot.layout?.opexAdaptiveLiftPressureFactor, 1.42) +
            scaleY(safeNumber(snapshot.layout?.opexAdaptiveLiftCrowdingY, 46)) * rightStageCrowdingStrength
        );
  const revenueUpperSplitOpeningDeltaY = Math.max(grossTopBase - revenueTopBase, 0);
  const revenueLowerSplitOpeningDeltaYBase = showCostBridge
    ? Math.max(costBaseTopCandidate - (revenueTopBase + grossHeight), 0)
    : revenueUpperSplitOpeningDeltaY;
  const grossUpperSplitOpeningDeltaY = Math.max(grossTopBase - opTopBase, 0);
  const grossLowerSplitOpeningDeltaYBase = Math.max(opexBaseCandidate - opexAdaptiveLiftY - (grossTopBase + opHeight), 0);
  const costGapFromGrossBaseY = showCostBridge
    ? Math.max(costBaseTopCandidate - (grossTopBase + grossHeight), 0)
    : 0;
  const costSplitOpeningReferenceY = clamp(
    revenueUpperSplitOpeningDeltaY * safeNumber(snapshot.layout?.costStageRevenueUpperWeight, 0.28) +
      revenueLowerSplitOpeningDeltaYBase * safeNumber(snapshot.layout?.costStageRevenueLowerWeight, 0.18) +
      grossUpperSplitOpeningDeltaY * safeNumber(snapshot.layout?.costStageGrossUpperWeight, 0.34) +
      grossLowerSplitOpeningDeltaYBase * safeNumber(snapshot.layout?.costStageGrossLowerWeight, 0.2),
    scaleY(safeNumber(snapshot.layout?.costStageOpeningReferenceMinY, 30)),
    scaleY(safeNumber(snapshot.layout?.costStageOpeningReferenceMaxY, usesHeroLockups ? 128 : 114))
  );
  const desiredCostGapFromGrossY = clamp(
    Math.max(
      costGapFromGrossBaseY,
      costSplitOpeningReferenceY * safeNumber(snapshot.layout?.costStageReferenceMatchFactor, rawCostBreakdown.length >= 2 ? 0.42 : rawCostBreakdown.length === 1 ? 0.5 : 0.58),
      scaleY(safeNumber(snapshot.layout?.costStageGapBaseY, rawCostBreakdown.length ? 36 : 42))
    ),
    costMinGapFromGross,
    scaleY(safeNumber(snapshot.layout?.costStageGapTargetMaxY, usesHeroLockups ? 122 : 108)) +
      lowerRightPressureY * safeNumber(snapshot.layout?.costStageGapTargetPressureFactor, 0.24)
  );
  const costStageBalanceAvailableDropY = showCostBridge
    ? Math.max(chartBottomLimit - costHeight - costBaseTopCandidate, 0)
    : 0;
  const enableCostStageGapBalance =
    showCostBridge &&
    !hasExplicitCostNodeTop &&
    snapshot.layout?.disableCostStageGapBalance !== true;
  const costStageGapBalanceDropY =
    !enableCostStageGapBalance
      ? 0
      : Math.min(
          Math.max(desiredCostGapFromGrossY - costGapFromGrossBaseY, 0) *
            safeNumber(snapshot.layout?.costStageGapBalanceFactor, rawCostBreakdown.length >= 2 ? 0.46 : rawCostBreakdown.length === 1 ? 0.62 : 0.9),
          costStageBalanceAvailableDropY,
          scaleY(safeNumber(snapshot.layout?.costStageGapBalanceMaxY, rawCostBreakdown.length ? 56 : 82))
        );
  const costTopBase = showCostBridge
    ? clamp(
        costBaseTopCandidate + costStageGapBalanceDropY,
        grossTopBase + grossHeight + costMinGapFromGross,
        chartBottomLimit - costHeight
      )
    : chartBottomLimit - scaleY(8);
  const revenueLowerSplitOpeningDeltaY = showCostBridge ? Math.max(costTopBase - (revenueTopBase + grossHeight), 0) : revenueUpperSplitOpeningDeltaY;
  const grossSplitOpeningReferenceY = clamp(
    revenueUpperSplitOpeningDeltaY * safeNumber(snapshot.layout?.stageSplitRevenueUpperWeight, 0.34) +
      revenueLowerSplitOpeningDeltaY * safeNumber(snapshot.layout?.stageSplitRevenueLowerWeight, 0.32) +
      grossUpperSplitOpeningDeltaY * safeNumber(snapshot.layout?.stageSplitGrossUpperWeight, 0.34),
    scaleY(safeNumber(snapshot.layout?.stageSplitOpeningReferenceMinY, 24)),
    scaleY(safeNumber(snapshot.layout?.stageSplitOpeningReferenceMaxY, usesHeroLockups ? 118 : 102))
  );
  const desiredGrossLowerSplitOpeningDeltaY = clamp(
    Math.max(
      grossUpperSplitOpeningDeltaY * safeNumber(snapshot.layout?.stageSplitSiblingMatchFactor, 0.94),
      grossSplitOpeningReferenceY * safeNumber(snapshot.layout?.stageSplitReferenceMatchFactor, 0.98)
    ),
    grossExpenseGapMinY,
    scaleY(safeNumber(snapshot.layout?.stageSplitOpeningTargetMaxY, usesHeroLockups ? 112 : 96)) +
      lowerRightPressureY * safeNumber(snapshot.layout?.stageSplitOpeningTargetPressureFactor, 0.28)
  );
  const opexAngleBalancedBaseTop = clamp(
    opexBaseCandidate - opexAdaptiveLiftY,
    opexMinTop,
    chartBottomLimit - opexHeight
  );
  const opexAngleBalanceAvailableDropY = Math.max(chartBottomLimit - opexHeight - opexAngleBalancedBaseTop, 0);
  const stageSplitAngleBalanceCountFactor =
    rawOpexItems.length <= 2 ? 1 : rawOpexItems.length === 3 ? safeNumber(snapshot.layout?.stageSplitAngleBalanceThreeWayFactor, 0.92) : 0;
  const enableStageSplitAngleBalance =
    !hasExplicitOpexNodeTop &&
    snapshot.layout?.disableStageSplitAngleBalance !== true &&
    rawOpexItems.length <= 3 &&
    stageSplitAngleBalanceCountFactor > 0 &&
    rawCostBreakdown.length === 0;
  const opexAngleBalanceDropY =
    !enableStageSplitAngleBalance
      ? 0
      : Math.min(
          Math.max(desiredGrossLowerSplitOpeningDeltaY - grossLowerSplitOpeningDeltaYBase, 0) * stageSplitAngleBalanceCountFactor,
          opexAngleBalanceAvailableDropY,
          scaleY(safeNumber(snapshot.layout?.stageSplitAngleBalanceMaxY, 78)) * stageSplitAngleBalanceCountFactor
        );
  const opexTopBase = clamp(
    opexBaseCandidate - opexAdaptiveLiftY + opexAngleBalanceDropY,
    opexMinTop,
    chartBottomLimit - opexHeight
  );
  const netRiseBaseY = scaleY(safeNumber(snapshot.layout?.netRiseBaseY, usesHeroLockups ? 26 : 22));
  const netRiseRatio = safeNumber(snapshot.layout?.netRiseRatio, 1.12);
  const netRiseMinY = scaleY(safeNumber(snapshot.layout?.netRiseMinY, usesHeroLockups ? 46 : 40));
  const netRiseMaxY = scaleY(safeNumber(snapshot.layout?.netRiseMaxY, usesHeroLockups ? 86 : 74));
  const netRiseSeedHeight = Math.max(opHeight - Math.min(netHeight, opHeight), 0);
  const netRiseY = clamp(
    netRiseBaseY + netRiseSeedHeight * netRiseRatio + positiveFlowRiseBoostY * 1.18,
    netRiseMinY,
    netRiseMaxY + positiveFlowRiseBoostY * 1.2
  );
  const netBaseCandidate =
    (hasExplicitNetNodeTop ? layoutY(snapshot.layout?.netNodeTop) : opTopBase - netRiseY) +
    stageCenteringShiftY * safeNumber(snapshot.layout?.netStageShiftFactor, 0.36);
  const netAdaptiveLiftHeadroom = Math.max(netBaseCandidate - scaleY(220), 0);
  const netAdaptiveLiftY =
    snapshot.layout?.disableAdaptiveRightStageLift === true
      ? 0
      : Math.min(
          scaleY(safeNumber(snapshot.layout?.netAdaptiveLiftMaxY, 58)),
          netAdaptiveLiftHeadroom * safeNumber(snapshot.layout?.netAdaptiveLiftHeadroomFactor, 0.72),
          scaleY(safeNumber(snapshot.layout?.netAdaptiveLiftBaseY, 12)) +
            scaleY(safeNumber(snapshot.layout?.netAdaptiveLiftCrowdingY, 26)) * rightStageCrowdingStrength
        );
  const netTopBase = clamp(
    netBaseCandidate - netAdaptiveLiftY,
    scaleY(220),
    chartBottomLimit - netHeight
  );
  const preliminaryStageTop = Math.min(revenueTopBase, grossTopBase, costTopBase, opTopBase, opexTopBase);
  const preliminaryStageBottom = Math.max(
    revenueTopBase + revenueHeight,
    grossTopBase + grossHeight,
    costTopBase + costHeight,
    opTopBase + opHeight,
    opexTopBase + opexHeight
  );
  const stageCenterTargetY = layoutY(snapshot.layout?.stageCenterTargetY, usesHeroLockups ? 748 : 740);
  const stageRecenteringDownYDesired = stageRecenteringEligibility
    ? Math.max(stageCenterTargetY - (preliminaryStageTop + preliminaryStageBottom) / 2, 0)
    : 0;
  const netRecenteringFactor = safeNumber(snapshot.layout?.netRecenteringShiftFactor, 0.44);
  const stageRecenteringDownY = clamp(
    stageRecenteringDownYDesired,
    0,
    Math.max(
      0,
      Math.min(
        chartBottomLimit - revenueHeight - revenueTopBase,
        chartBottomLimit - grossHeight - grossTopBase,
        chartBottomLimit - costHeight - costTopBase,
        chartBottomLimit - opHeight - opTopBase,
        chartBottomLimit - opexHeight - opexTopBase,
        netRecenteringFactor > 0 ? (chartBottomLimit - netHeight - netTopBase) / netRecenteringFactor : chartBottomLimit
      )
    )
  );
  const revenueTop = revenueTopBase + stageRecenteringDownY;
  const revenueBottom = revenueTop + revenueHeight;
  const revenueGrossBottom = revenueTop + grossHeight;
  const revenueCostTop = revenueGrossBottom;
  const grossTop = grossTopBase + stageRecenteringDownY;
  const grossBottom = grossTop + grossHeight;
  const costTop = costTopBase + stageRecenteringDownY;
  const costBottom = costTop + costHeight;
  const opTop = opTopBase + stageRecenteringDownY;
  const opBottom = opTop + opHeight;
  const opexTop = opexTopBase + stageRecenteringDownY;
  const opexBottom = opexTop + opexHeight;
  const netTop = netTopBase + stageRecenteringDownY * netRecenteringFactor;
  const netBottom = netTop + netHeight;
  const sourceDensity = rawSources.length >= 11 ? "ultra" : rawSources.length >= 8 ? "dense" : rawSources.length >= 6 ? "compact" : "regular";
  const sources = rawSources.map((item) => ({
    ...item,
    layoutDensity: item.layoutDensity || sourceDensity,
  }));
  const compactSources = snapshot.compactSourceLabels || sourceDensity !== "regular";
  const denseSources = sourceDensity === "dense" || sourceDensity === "ultra";
  const ultraDenseSources = sourceDensity === "ultra";
  const sourceHasMetrics = sources.some(
    (item) => item.yoyPct !== null && item.yoyPct !== undefined || (showQoq && item.qoqPct !== null && item.qoqPct !== undefined)
  );
  const sourceMetricGapBoost = sourceHasMetrics
    ? scaleY(ultraDenseSources ? (showQoq ? 10 : 8) : denseSources ? (showQoq ? 18 : 14) : compactSources ? (showQoq ? 30 : 22) : showQoq ? 42 : 34)
    : 0;
  const leftDetailGroups = rawLeftDetailGroups;
  const costBreakdown = rawCostBreakdown;
  const opexItems = rawOpexItems
    .filter((item) => safeNumber(item.valueBn) > 0.02)
    .sort((left, right) => safeNumber(right.valueBn) - safeNumber(left.valueBn) || String(left.name || "").localeCompare(String(right.name || "")));
  const operatingProfitBreakdown = [...(snapshot.operatingProfitBreakdown || [])].filter((item) => safeNumber(item.valueBn) > 0.02);
  const belowOperatingItems = rawBelowOperatingItems;
  const positiveAdjustments = rawPositiveAdjustments;
  const positiveMinVisibleHeight = scaleY(safeNumber(snapshot.layout?.positiveMinVisibleHeight, 6.5));
  const positiveCollapsedMinHeight = scaleY(safeNumber(snapshot.layout?.positiveCollapsedMinHeight, 4.5));
  const positiveVisibilityLiftTarget = scaleY(safeNumber(snapshot.layout?.positiveVisibilityLiftTarget, 14));
  const positiveVisibilityLiftFactor = clamp(safeNumber(snapshot.layout?.positiveVisibilityLiftFactor, 0.55), 0, 1);
  const positiveRawHeights = positiveAdjustments.map((item) => {
    const proportionalHeight = safeNumber(item.valueBn) * scale;
    const liftedHeight =
      proportionalHeight < positiveVisibilityLiftTarget
        ? proportionalHeight + (positiveVisibilityLiftTarget - proportionalHeight) * positiveVisibilityLiftFactor
        : proportionalHeight;
    return Math.max(liftedHeight, positiveMinVisibleHeight);
  });
  const positiveMergeHeights = positiveAdjustments.map((item) => Math.max(safeNumber(item.valueBn) * scale, 0));
  const positiveHeightBudget = Math.max(netHeight - 4, 0);
  const positiveRawHeightTotal = positiveRawHeights.reduce((sum, height) => sum + height, 0);
  const positiveHeightScale =
    positiveRawHeights.length && positiveRawHeightTotal > positiveHeightBudget && positiveHeightBudget > 0
      ? positiveHeightBudget / positiveRawHeightTotal
      : 1;
  let positiveHeights = positiveRawHeights.map((height) =>
    Math.max(height * positiveHeightScale, positiveHeightScale < 0.999 ? positiveCollapsedMinHeight : positiveMinVisibleHeight)
  );
  const positiveDisplayHeightTotal = positiveHeights.reduce((sum, height) => sum + height, 0);
  if (positiveDisplayHeightTotal > positiveHeightBudget && positiveHeightBudget > 0) {
    const overflowScale = positiveHeightBudget / positiveDisplayHeightTotal;
    positiveHeights = positiveHeights.map((height) => height * overflowScale);
  }
  const totalPositiveHeight = positiveHeights.reduce((sum, height) => sum + height, 0);
  const totalPositiveMergeHeight = positiveMergeHeights.reduce((sum, height) => sum + height, 0);
  const explicitBelowOperatingBn = belowOperatingItems.reduce((sum, item) => sum + Math.max(safeNumber(item.valueBn), 0), 0);
  const explicitCoreNetHeight = Math.max((operatingProfitBn - explicitBelowOperatingBn) * scale, 0);
  const zeroNetRibbonHeight =
    nearZeroNet && !netLoss && operatingProfitBn > 0
      ? Math.min(scaleY(safeNumber(snapshot.layout?.zeroNetRibbonHeight, 4.5)), opHeight)
      : 0;
  const sourceCoreNetHeightBase = belowOperatingItems.length ? clamp(explicitCoreNetHeight, 0, opHeight) : opHeight;
  const sourceCoreNetHeight = nearZeroNet && !netLoss ? Math.max(sourceCoreNetHeightBase, zeroNetRibbonHeight) : sourceCoreNetHeightBase;
  const minCoreNetHeight = positiveAdjustments.length || belowOperatingItems.length ? 0 : Math.min(4, opHeight);
  const coreNetHeight = clamp(sourceCoreNetHeight, minCoreNetHeight, opHeight);
  const residualNetTargetHeight = positiveAdjustments.length ? Math.max(netHeight - totalPositiveMergeHeight, 0) : netHeight;
  const implicitPositiveNetBridgeBn =
    !positiveAdjustments.length && !belowOperatingItems.length
      ? Math.max(netProfitBn - operatingProfitBn, 0)
      : 0;
  const implicitPositiveNetBridgeMaxBn = Math.max(
    safeNumber(snapshot.layout?.implicitPositiveNetBridgeMaxBn, 0.06),
    0
  );
  const useImplicitPositiveNetExpansion =
    implicitPositiveNetBridgeBn > 0.002 && implicitPositiveNetBridgeBn <= implicitPositiveNetBridgeMaxBn;
  const coreNetTargetHeight = useImplicitPositiveNetExpansion
    ? netHeight
    : clamp(Math.min(coreNetHeight, residualNetTargetHeight), 0, netHeight);
  const deductionTop = opTop + coreNetHeight;
  const deductionBottom = opBottom;
  const revenueNodeFill = revenueNode;
  const revenueTextColor = "#111111";
  const revenueLabelCenterX = revenueX + nodeWidth / 2 + safeNumber(snapshot.layout?.revenueLabelOffsetX, 0);
  const revenueLabelCenterY = revenueTop + revenueHeight / 2 + layoutY(snapshot.layout?.revenueLabelOffsetY, -8);
  const revenueLabelTitleSize = safeNumber(snapshot.layout?.revenueLabelTitleSize, 32);
  const revenueLabelValueSize = safeNumber(snapshot.layout?.revenueLabelValueSize, 58);
  const revenueLabelNoteSize = safeNumber(snapshot.layout?.revenueLabelNoteSize, 22);
  const revenueLabelQoqSize = safeNumber(snapshot.layout?.revenueLabelQoqSize, 20);
  const expenseSummaryTitleSize = 41;
  const costLabelLines = snapshot.costLabelLines?.length
    ? localizeChartLines(snapshot.costLabelLines)
    : wrapLabelWithMaxWidth(localizeChartPhrase(snapshot.costLabel || "Cost of revenue"), expenseSummaryTitleSize, currentChartLanguage() === "zh" ? 280 : 360, {
        maxLines: 2,
      });
  const resolvedOperatingExpensesLabel =
    collapsedOpexItem
      ? currentChartLanguage() === "zh"
        ? collapsedOpexItem.nameZh || translateBusinessLabelToZh(collapsedOpexItem.name || "")
        : collapsedOpexItem.name || snapshot.operatingExpensesLabel || "Operating Expenses"
      : snapshot.operatingExpensesLabel || "Operating Expenses";
  const operatingExpenseLabelLines = !collapsedOpexItem && snapshot.operatingExpensesLabelLines?.length
    ? localizeChartLines(snapshot.operatingExpensesLabelLines)
    : wrapLabelWithMaxWidth(localizeChartPhrase(resolvedOperatingExpensesLabel), expenseSummaryTitleSize, currentChartLanguage() === "zh" ? 296 : 392, {
        maxLines: 2,
      });
  const revenueSourceSlices = stackValueSlices(sources, revenueTop, scale, { targetBottom: revenueBottom, valueKey: "flowValueBn" });
  const sourceMetricRequirementUnits = revenueSourceSlices.map((slice) =>
    sourceMetricBlockHeight(slice.item, {
      density: slice.item.layoutDensity || sourceDensity,
      compactMode: compactSources || slice.item.compactLabel,
      showQoq,
    })
  );
  const maxSourceMetricRequirementUnits = sourceMetricRequirementUnits.length ? Math.max(...sourceMetricRequirementUnits) : 0;
  const avgSourceMetricRequirementUnits = sourceMetricRequirementUnits.length
    ? sourceMetricRequirementUnits.reduce((sum, value) => sum + value, 0) / sourceMetricRequirementUnits.length
    : 0;
  const metricDrivenSpreadUnits = sourceHasMetrics
    ? clamp(
        Math.max(avgSourceMetricRequirementUnits - (compactSources ? 38 : 34), 0) * 0.8 +
          Math.max(maxSourceMetricRequirementUnits - (compactSources ? 52 : 48), 0) * 0.44 +
          Math.max(sources.length - 4, 0) * 3.4 +
          (showQoq ? 8 : 3),
        0,
        compactSources ? 48 : 68
      )
    : 0;
  const sourceNodeGap = layoutY(
    snapshot.layout?.sourceNodeGap,
    ultraDenseSources ? 4 : denseSources ? 8 : compactSources ? 14 : usesHeroLockups ? 50 : 28
  ) + sourceMetricGapBoost + scaleY(metricDrivenSpreadUnits * 0.2);
  const sourceFanEntries = revenueSourceSlices.map((slice, index) => ({
    center: slice.center + layoutY(snapshot.layout?.sourceNodeOffsets?.[index], 0),
    height: slice.height,
    top: slice.top,
    bottom: slice.bottom,
  }));
  const sourceFanBaseOptions = snapshot.layout?.sourceFan || {};
  const sourceFanOptions = resolveAdaptiveSourceFan(sourceFanEntries, {
    spread: safeNumber(sourceFanBaseOptions.spread, compactSources ? 1.1 : 1.12) + (sourceHasMetrics ? clamp(metricDrivenSpreadUnits / 260, 0, 0.18) : 0),
    exponent: safeNumber(sourceFanBaseOptions.exponent, 1.22),
    edgeBoost: safeNumber(sourceFanBaseOptions.edgeBoost, compactSources ? 18 : 24) + metricDrivenSpreadUnits * 0.62,
    edgeExponent: safeNumber(sourceFanBaseOptions.edgeExponent, 1.15),
    bandBias: safeNumber(sourceFanBaseOptions.bandBias, compactSources ? 0.06 : 0.08),
    sideBoost: safeNumber(sourceFanBaseOptions.sideBoost, compactSources ? 14 : 18) + metricDrivenSpreadUnits * 0.42,
    sideExponent: safeNumber(sourceFanBaseOptions.sideExponent, 1.08),
    rangeBoost: safeNumber(sourceFanBaseOptions.rangeBoost, compactSources ? 10 : 12) + metricDrivenSpreadUnits + (sourceHasMetrics ? (showQoq ? 24 : 14) : 0),
    anchorOffset: layoutY(sourceFanBaseOptions.anchorOffset, 0),
  });
  const sourceRangeBoost = scaleY(sourceFanOptions.rangeBoost);
  const sourceMetricHeadroomBoost = scaleY(
    sourceHasMetrics
      ? clamp(metricDrivenSpreadUnits * 0.82 + (showQoq ? 14 : 8), 0, compactSources ? 52 : 72)
      : 0
  );
  const sourceMetricFootroomBoost = scaleY(
    sourceHasMetrics
      ? clamp(metricDrivenSpreadUnits * 0.52 + (sources.length >= 6 ? 10 : 4), 0, compactSources ? 34 : 48)
      : 0
  );
  const sourceNodeMinY = clamp(
    layoutY(snapshot.layout?.sourceNodeMinY, baseRevenueTop - 8) - sourceRangeBoost - sourceMetricHeadroomBoost,
    scaleY(160),
    scaleY(520)
  );
  const sourceNodeMaxY = clamp(
    layoutY(snapshot.layout?.sourceNodeMaxY, ultraDenseSources ? 1136 : denseSources ? 1108 : 1058) + sourceRangeBoost + sourceMetricFootroomBoost,
    scaleY(820),
    scaleY(1128)
  );
  const sourceFanAnchor = (revenueTop + revenueBottom) / 2 + sourceFanOptions.anchorOffset;
  const sourcePreferredCenters = spreadSourceCenters(sourceFanEntries, sourceFanAnchor, {
    spread: sourceFanOptions.spread,
    exponent: sourceFanOptions.exponent,
    edgeBoost: scaleY(sourceFanOptions.edgeBoost),
    edgeExponent: sourceFanOptions.edgeExponent,
    bandBias: sourceFanOptions.bandBias,
    sideBoost: scaleY(sourceFanOptions.sideBoost),
    sideExponent: sourceFanOptions.sideExponent,
  });
  const sourceMetricRequirements = sourceMetricRequirementUnits.map((value) => scaleY(value));
  const sourceNodeBoxes = resolveVerticalBoxesVariableGap(
    revenueSourceSlices.map((slice, index) => ({
      center: sourcePreferredCenters[index],
      height: slice.height,
      gapAbove: sourceMetricRequirements[index],
    })),
    sourceNodeMinY,
    sourceNodeMaxY,
    sourceNodeGap
  );
  const sourceSlices = revenueSourceSlices.map((slice, index) => {
    const box = sourceNodeBoxes[index];
    return {
      ...slice,
      revenueTop: slice.top,
      revenueBottom: slice.bottom,
      top: box.top,
      bottom: box.top + slice.height,
      center: box.top + slice.height / 2,
    };
  });
  const sourceSliceMap = new Map(sourceSlices.map((slice) => [slice.item.id || slice.item.name, slice]));
  const leftDetailSlices = [];
  const isAdFunnelDetailLayout = snapshot.prototypeKey === "ad-funnel-bridge";
  const leftDetailTargetKeys = new Set(
    leftDetailGroups
      .map((item) => normalizeLabelKey(item.targetId || item.targetName || item.target || item.groupName))
      .filter(Boolean)
  );
  const autoStackRegularSourcesBelowDetails = shouldStackRegularSourcesBelowDetails(
    snapshot,
    leftDetailTargetKeys,
    sourceSlices.map((slice) => slice.item)
  );
  const leftDetailX = shiftCanvasX(snapshot.layout?.leftDetailX, 156);
  const leftDetailWidth = safeNumber(snapshot.layout?.leftDetailWidth, sourceNodeWidth);
  if (leftDetailGroups.length) {
    const targetGroups = new Map();
    leftDetailGroups.forEach((item) => {
      const key = item.targetId || item.targetName || item.target || item.groupName;
      if (!key) return;
      const list = targetGroups.get(key) || [];
      list.push(item);
      targetGroups.set(key, list);
    });
    targetGroups.forEach((items, key) => {
      const targetSlice = sourceSliceMap.get(key) || sourceSlices.find((slice) => slice.item.name === key);
      if (!targetSlice) return;
      const totalValue = items.reduce((sum, item) => sum + safeNumber(item.valueBn), 0);
      const detailScale = totalValue > 0 ? targetSlice.height / totalValue : 0;
      let cursor = targetSlice.top;
      const groupSlices = [];
      items.forEach((item, index) => {
        const top = cursor;
        const height = Math.max(safeNumber(item.valueBn) * detailScale, 3);
        const rawBottom = index === items.length - 1 ? targetSlice.bottom : top + height;
        const bottom = Math.max(rawBottom, top + 1);
        const groupCenterIndex = (items.length - 1) / 2;
        const groupPosition = index - groupCenterIndex;
        const groupNorm = items.length <= 1 ? 0 : Math.abs(groupPosition) / Math.max(groupCenterIndex, 1);
        groupSlices.push({
          item,
          targetSlice,
          top,
          bottom,
          height: bottom - top,
          center: top + (bottom - top) / 2,
          groupIndex: index,
          groupCount: items.length,
          groupPosition,
          groupNorm,
        });
        cursor = bottom;
      });
      const groupCenterIndex = (groupSlices.length - 1) / 2;
      const groupStackHeight = groupSlices.reduce((sum, slice) => sum + slice.height, 0);
      const groupLaunchGapY = scaleY(safeNumber(snapshot.layout?.leftDetailLaunchGapY, 14));
      const groupLaunchSpan = Math.max(
        targetSlice.height * safeNumber(snapshot.layout?.leftDetailLaunchTargetHeightRatio, 0.36),
        groupStackHeight * safeNumber(snapshot.layout?.leftDetailLaunchStackHeightRatio, 0.62),
        scaleY(safeNumber(snapshot.layout?.leftDetailLaunchMinSpanY, 54))
      );
      const launchStepY = groupSlices.length <= 1 ? 0 : groupLaunchSpan / Math.max(groupCenterIndex, 1);
      groupSlices.forEach((slice, index) => {
        const groupPosition = index - groupCenterIndex;
        const groupNorm = groupSlices.length <= 1 ? 0 : Math.abs(groupPosition) / Math.max(groupCenterIndex, 1);
        const launchOffsetY =
          groupPosition * launchStepY +
          Math.sign(groupPosition || 0) * groupNorm * groupLaunchGapY +
          Math.sign(groupPosition || 0) * slice.height * safeNumber(snapshot.layout?.leftDetailLaunchThicknessRatio, 0.14);
        slice.groupIndex = index;
        slice.groupCount = groupSlices.length;
        slice.groupPosition = groupPosition;
        slice.groupNorm = groupNorm;
        slice.launchCenter = targetSlice.center + launchOffsetY;
      });
      groupSlices.forEach((groupSlice) => leftDetailSlices.push(groupSlice));
    });
  }
  const leftDetailMetricRequirementUnits = leftDetailSlices.map((slice) =>
    sourceMetricBlockHeight(slice.item, {
      density: slice.item.layoutDensity || sourceDensity,
      compactMode: compactSources || slice.item.compactLabel,
      showQoq,
    })
  );
  const leftDetailHasMetrics = leftDetailSlices.some(
    (slice) => slice.item?.yoyPct !== null && slice.item?.yoyPct !== undefined || (showQoq && slice.item?.qoqPct !== null && slice.item?.qoqPct !== undefined)
  );
  const maxLeftDetailMetricRequirementUnits = leftDetailMetricRequirementUnits.length ? Math.max(...leftDetailMetricRequirementUnits) : 0;
  const avgLeftDetailMetricRequirementUnits = leftDetailMetricRequirementUnits.length
    ? leftDetailMetricRequirementUnits.reduce((sum, value) => sum + value, 0) / leftDetailMetricRequirementUnits.length
    : 0;
  const leftDetailMetricDrivenSpreadUnits = leftDetailHasMetrics
    ? clamp(
        Math.max(avgLeftDetailMetricRequirementUnits - (compactSources ? 38 : 34), 0) * 0.8 +
          Math.max(maxLeftDetailMetricRequirementUnits - (compactSources ? 52 : 48), 0) * 0.44 +
          Math.max(leftDetailSlices.length - 4, 0) * 3.4 +
          (showQoq ? 8 : 3),
        0,
        compactSources ? 48 : 68
      )
    : 0;
  const leftDetailFanBaseOptions = snapshot.layout?.leftDetailFan || snapshot.layout?.sourceFan || {};
  const leftDetailFanEntries = leftDetailSlices.map((slice, index) => ({
    center:
      safeNumber(slice.launchCenter, slice.center) +
      layoutY(snapshot.layout?.leftDetailNodeOffsets?.[index], 0) +
      (slice.groupCount > 1
        ? Math.sign(safeNumber(slice.groupPosition, 0)) *
          scaleY(
            clamp(
              safeNumber(snapshot.layout?.leftDetailConvergeBaseY, 12) +
                slice.groupNorm * safeNumber(snapshot.layout?.leftDetailConvergeSpreadY, 26) +
                clamp(slice.targetSlice.height * safeNumber(snapshot.layout?.leftDetailConvergeHeightRatio, 0.08), 0, 18),
              safeNumber(snapshot.layout?.leftDetailConvergeMinY, 8),
              safeNumber(snapshot.layout?.leftDetailConvergeMaxY, 42)
            )
          )
        : 0),
    height: slice.height,
    top: slice.top,
    bottom: slice.bottom,
  }));
  const leftDetailFanOptions = resolveAdaptiveSourceFan(leftDetailFanEntries, {
    spread: safeNumber(leftDetailFanBaseOptions.spread, compactSources ? 1.1 : 1.12) + (leftDetailHasMetrics ? clamp(leftDetailMetricDrivenSpreadUnits / 260, 0, 0.18) : 0),
    exponent: safeNumber(leftDetailFanBaseOptions.exponent, 1.22),
    edgeBoost: safeNumber(leftDetailFanBaseOptions.edgeBoost, compactSources ? 18 : 24) + leftDetailMetricDrivenSpreadUnits * 0.62,
    edgeExponent: safeNumber(leftDetailFanBaseOptions.edgeExponent, 1.15),
    bandBias: safeNumber(leftDetailFanBaseOptions.bandBias, compactSources ? 0.06 : 0.08),
    sideBoost: safeNumber(leftDetailFanBaseOptions.sideBoost, compactSources ? 14 : 18) + leftDetailMetricDrivenSpreadUnits * 0.42,
    sideExponent: safeNumber(leftDetailFanBaseOptions.sideExponent, 1.08),
    rangeBoost: safeNumber(leftDetailFanBaseOptions.rangeBoost, compactSources ? 10 : 12) + leftDetailMetricDrivenSpreadUnits + (leftDetailHasMetrics ? (showQoq ? 24 : 14) : 0),
    anchorOffset: layoutY(leftDetailFanBaseOptions.anchorOffset, 0),
  });
  const leftDetailRangeBoost = scaleY(leftDetailFanOptions.rangeBoost);
  const leftDetailMetricHeadroomBoost = scaleY(
    leftDetailHasMetrics
      ? clamp(leftDetailMetricDrivenSpreadUnits * 0.82 + (showQoq ? 14 : 8), 0, compactSources ? 52 : 72)
      : 0
  );
  const leftDetailMetricFootroomBoost = scaleY(
    leftDetailHasMetrics
      ? clamp(leftDetailMetricDrivenSpreadUnits * 0.52 + (leftDetailSlices.length >= 6 ? 10 : 4), 0, compactSources ? 34 : 48)
      : 0
  );
  const leftDetailDesiredTop = leftDetailFanEntries.length
    ? Math.min(...leftDetailFanEntries.map((entry) => entry.center - entry.height / 2))
    : layoutY(snapshot.layout?.leftDetailMinY, isAdFunnelDetailLayout ? 224 : 246);
  const leftDetailDesiredBottom = leftDetailFanEntries.length
    ? Math.max(...leftDetailFanEntries.map((entry) => entry.center + entry.height / 2))
    : layoutY(snapshot.layout?.leftDetailMaxY, isAdFunnelDetailLayout ? 1042 : 1026);
  const leftDetailNodeMinY = clamp(
    Math.min(
      layoutY(snapshot.layout?.leftDetailMinY, isAdFunnelDetailLayout ? 224 : 246) - leftDetailRangeBoost - leftDetailMetricHeadroomBoost,
      leftDetailDesiredTop - scaleY(safeNumber(snapshot.layout?.leftDetailLaunchTopPaddingY, 20))
    ),
    scaleY(safeNumber(snapshot.layout?.leftDetailAbsoluteMinY, 96)),
    scaleY(520)
  );
  const leftDetailNodeMaxY = clamp(
    Math.max(
      layoutY(snapshot.layout?.leftDetailMaxY, isAdFunnelDetailLayout ? 1042 : 1026) + leftDetailRangeBoost + leftDetailMetricFootroomBoost,
      leftDetailDesiredBottom + scaleY(safeNumber(snapshot.layout?.leftDetailLaunchBottomPaddingY, 24))
    ),
    scaleY(820),
    scaleY(1160)
  );
  const leftDetailAnchor = leftDetailSlices.length
    ? leftDetailSlices.reduce((sum, slice) => sum + safeNumber(slice.launchCenter, slice.targetSlice.center), 0) / leftDetailSlices.length +
      leftDetailFanOptions.anchorOffset
    : scaleY(520);
  const leftDetailPreferredCenters = leftDetailFanEntries.map((entry, index) => {
    const baseCenter = safeNumber(entry.center, leftDetailAnchor);
    const slice = leftDetailSlices[index];
    if (!slice || slice.groupCount <= 1) return baseCenter;
    const direction = Math.sign(safeNumber(slice.groupPosition, 0));
    const groupBiasY = scaleY(
      clamp(
        safeNumber(snapshot.layout?.leftDetailGroupBiasY, 10) +
          safeNumber(slice.groupNorm, 0) * safeNumber(snapshot.layout?.leftDetailGroupBiasSpreadY, 12),
        safeNumber(snapshot.layout?.leftDetailGroupBiasMinY, 6),
        safeNumber(snapshot.layout?.leftDetailGroupBiasMaxY, 22)
      )
    );
    return baseCenter + direction * groupBiasY;
  });
  const leftDetailMetricRequirements = leftDetailMetricRequirementUnits.map((value) => scaleY(value));
  const leftDetailNodeGap = layoutY(snapshot.layout?.leftDetailNodeGap, sourceNodeGap) + scaleY(leftDetailMetricDrivenSpreadUnits * 0.2);
  const leftDetailNodeBoxes = resolveVerticalBoxesVariableGap(
    leftDetailSlices.map((slice, index) => ({
      center: leftDetailPreferredCenters[index],
      height: slice.height,
      gapAbove: leftDetailMetricRequirements[index],
    })),
    leftDetailNodeMinY,
    leftDetailNodeMaxY,
    leftDetailNodeGap
  );
  const leftDetailRenderSlices = leftDetailSlices.map((slice, index) => {
    const nodeBox = leftDetailNodeBoxes[index];
    return {
      ...slice,
      targetTop: slice.top,
      targetBottom: slice.bottom,
      targetHeight: slice.height,
      targetCenter: slice.center,
      top: nodeBox.top,
      bottom: nodeBox.bottom,
      height: slice.height,
      center: nodeBox.center,
    };
  });
  const leftDetailLabelBoxes = resolveVerticalBoxes(
    leftDetailRenderSlices.map((slice) => ({
      center: slice.center,
      height: estimateReplicaSourceBoxHeight(slice.item, showQoq, compactSources || slice.item.compactLabel),
    })),
    leftDetailNodeMinY,
    leftDetailNodeMaxY,
    scaleY(safeNumber(snapshot.layout?.leftDetailGap, sourceNodeGap))
  );
  const leftBoxGap = scaleY(ultraDenseSources ? 4 : denseSources ? 8 : compactSources ? 12 : 24) + sourceMetricGapBoost * 0.45;
  const sourceLayoutIndexes = [];
  const microSourceIndexes = [];
  sourceSlices.forEach((slice, index) => {
    if (slice.item.microSource) {
      microSourceIndexes.push(index);
      return;
    }
    sourceLayoutIndexes.push(index);
  });
  const layoutSourceSlices = sourceLayoutIndexes.map((index) => sourceSlices[index]);
  const sourceBoxEntries = layoutSourceSlices.map((slice) => ({
    center: slice.center,
    height: estimateReplicaSourceBoxHeight(slice.item, showQoq, compactSources || slice.item.compactLabel),
  }));
  let layoutBoxes;
  if (autoStackRegularSourcesBelowDetails && leftDetailTargetKeys.size && layoutSourceSlices.length) {
    layoutBoxes = new Array(layoutSourceSlices.length);
    const summaryIndexes = [];
    const regularIndexes = [];
    layoutSourceSlices.forEach((slice, index) => {
      const sourceKey = normalizeLabelKey(slice.item.id || slice.item.memberKey || slice.item.name);
      if (leftDetailTargetKeys.has(sourceKey)) {
        summaryIndexes.push(index);
      } else {
        regularIndexes.push(index);
      }
    });
    if (summaryIndexes.length) {
      const detailRegionBottom = leftDetailLabelBoxes.length ? Math.max(...leftDetailLabelBoxes.map((box) => box.bottom)) : scaleY(520);
      const summaryMaxY = Math.min(
        sourceNodeMaxY,
        Math.max(
          sourceNodeMinY + scaleY(safeNumber(snapshot.layout?.summarySourceMinSpan, 160)),
          detailRegionBottom - scaleY(safeNumber(snapshot.layout?.summarySourceMaxOffsetFromDetails, 20))
        )
      );
      const summaryBoxes = resolveVerticalBoxes(
        summaryIndexes.map((index) => sourceBoxEntries[index]),
        sourceNodeMinY,
        summaryMaxY,
        leftBoxGap
      );
      summaryIndexes.forEach((index, position) => {
        layoutBoxes[index] = summaryBoxes[position];
      });
      if (regularIndexes.length) {
        const regularMinY = Math.max(
          detailRegionBottom + scaleY(safeNumber(snapshot.layout?.regularSourceStartAfterDetails, 28)),
          scaleY(safeNumber(snapshot.layout?.regularSourceFloorY, 620))
        );
        const regularBoxes = resolveVerticalBoxes(
          regularIndexes.map((index) => sourceBoxEntries[index]),
          regularMinY,
          sourceNodeMaxY,
          leftBoxGap
        );
        regularIndexes.forEach((index, position) => {
          layoutBoxes[index] = regularBoxes[position];
        });
      }
    }
    if (layoutBoxes.filter(Boolean).length !== layoutSourceSlices.length) {
      layoutBoxes = resolveVerticalBoxes(sourceBoxEntries, sourceNodeMinY, sourceNodeMaxY, leftBoxGap);
    }
  } else {
    layoutBoxes = resolveVerticalBoxes(sourceBoxEntries, sourceNodeMinY, sourceNodeMaxY, leftBoxGap);
  }
  const leftBoxes = new Array(sourceSlices.length);
  sourceLayoutIndexes.forEach((sourceIndex, position) => {
    leftBoxes[sourceIndex] = layoutBoxes[position];
  });
  const microSourceBaseY = layoutY(snapshot.layout?.microSourceY, 1014);
  const microSourceStepY = scaleY(safeNumber(snapshot.layout?.microSourceStepY, 44));
  const microSourceHeight = scaleY(safeNumber(snapshot.layout?.microSourceHeight, 48));
  microSourceIndexes.forEach((sourceIndex, position) => {
    const top = microSourceBaseY + position * microSourceStepY;
    leftBoxes[sourceIndex] = {
      top,
      bottom: top + microSourceHeight,
      height: microSourceHeight,
      center: top + microSourceHeight / 2,
    };
  });
  const sourceSummaryLabelGapX = safeNumber(snapshot.layout?.sourceSummaryLabelGapX, sourceTemplateLabelGapX);
  sourceSlices.forEach((slice) => {
    slice.nodeX = leftX;
    slice.labelX = usesPreDetailRevenueLayout ? leftX - sourceSummaryLabelGapX : sourceTemplateLabelX;
    slice.metricX = sourceTemplateMetricX;
  });
  if (autoStackRegularSourcesBelowDetails && leftDetailTargetKeys.size && layoutSourceSlices.length) {
    const leadEligibleSourceIndexes = new Set(
      collectPreDetailLeadEligibleSourceIndexes(
        leftDetailTargetKeys,
        sourceSlices.map((slice) => slice.item)
      )
    );
    const regularLeadIndexes = sourceLayoutIndexes
      .filter((sourceIndex) => leadEligibleSourceIndexes.has(sourceIndex))
      .sort((leftIndex, rightIndex) => {
        const leftCenter = safeNumber(leftBoxes[leftIndex]?.center, sourceSlices[leftIndex]?.center);
        const rightCenter = safeNumber(leftBoxes[rightIndex]?.center, sourceSlices[rightIndex]?.center);
        return leftCenter - rightCenter;
      });
    const detailRightX = leftDetailX + leftDetailWidth;
    regularLeadIndexes.forEach((sourceIndex, orderIndex) => {
      const slice = sourceSlices[sourceIndex];
      const leadDistanceX = resolvePreDetailRegularSourceLeadDistance(snapshot, {
        regularCount: regularLeadIndexes.length,
        orderIndex,
        leftX,
        detailRightX,
      });
      const nodeX = leftX - leadDistanceX;
      slice.nodeX = nodeX;
      slice.labelX = nodeX - sourceSummaryLabelGapX;
      slice.metricX = sourceTemplateMetricX + (nodeX - leftX);
    });
  }
  const deductionSlices = stackValueSlices(belowOperatingItems, deductionTop, scale, { minHeight: 4, targetBottom: deductionBottom });
  const deductionBand = prototypeBandConfig(templateTokens, "deductions");
  const deductionDensity = deductionSlices.length >= 3 ? "dense" : "regular";
  const deductionEntries = deductionSlices.map((slice, index) => {
    const layout = replicaTreeBlockLayout(slice.item, {
      density: deductionDensity,
      titleMaxWidth: rightTerminalTitleMaxWidth,
      noteMaxWidth: rightTerminalTitleMaxWidth,
    });
    return {
      center: slice.center + index * scaleY(safeNumber(deductionBand.centerStep, 18)),
      height: Math.max(layout.totalHeight + safeNumber(deductionBand.heightOffset, -8), 24),
      minHeight: layout.minHeight,
      layout,
    };
  });
  const deductionMinYBase = Math.max(
    netBottom + scaleY(safeNumber(deductionBand.minOffsetFromNet, 28)),
    scaleY(safeNumber(deductionBand.minClamp, 420))
  );
  const rawDeductionMaxYBase = Math.max(
    opexTop - scaleY(safeNumber(deductionBand.maxOffsetAboveOpex, 44)),
    scaleY(safeNumber(deductionBand.maxClamp, 680))
  );
  const deductionBoxOptions = {
    gap: scaleY(safeNumber(deductionBand.gap, 24)),
    minGap: scaleY(safeNumber(deductionBand.minGap, 10)),
    fallbackMinHeight: 34,
  };
  const opexSlices = stackValueSlices(opexItems, opexTop, scale, { minHeight: 12, targetBottom: opexBottom });
  const opexBand = prototypeBandConfig(templateTokens, "opex", opexItems.length);
  const opexDensity = opexBand.densityKey === "dense" ? "dense" : "regular";
  const opexMinY = scaleY(safeNumber(opexBand.minY, opexItems.length >= 5 ? 680 : 700));
  const rightBandBottomPaddingBase = scaleY(safeNumber(snapshot.layout?.rightBandBottomPadding, 122));
  const rightBandBottomReleaseY =
    lowerRightPressureY *
    safeNumber(
      snapshot.layout?.rightBandBottomReleaseFactor,
      costBreakdownNearOpexColumn ? 1.08 : rawCostBreakdown.length >= 2 ? 0.72 : 0.34
    );
  const rightBandBottomPadding = Math.max(
    rightBandBottomPaddingBase - rightBandBottomReleaseY,
    scaleY(safeNumber(snapshot.layout?.rightBandMinBottomPadding, 34))
  );
  const opexBoxOptions = {
    gap: scaleY(safeNumber(opexBand.gap, opexItems.length >= 5 ? 18 : 28)),
    minGap: scaleY(safeNumber(opexBand.minGap, opexItems.length >= 5 ? 4 : 10)),
    fallbackMinHeight: opexDensity === "dense" ? 30 : 36,
  };
  const opexEntries = opexSlices.map((slice, index) => {
    const layout = replicaTreeBlockLayout(slice.item, {
      density: opexDensity,
      titleMaxWidth: rightTerminalTitleMaxWidth,
      noteMaxWidth: rightTerminalTitleMaxWidth,
    });
    return {
      center:
        scaleY(safeNumber(opexBand.centerStart, opexItems.length >= 5 ? 710 : 736)) +
        index * scaleY(safeNumber(opexBand.centerStep, opexItems.length >= 5 ? 102 : 126)),
      height: Math.max(layout.totalHeight + safeNumber(opexBand.heightOffset, 0), 24),
      minHeight: layout.minHeight,
      layout,
    };
  });
  const opexRequiredSpanY = estimatedStackSpan(
    opexEntries.map((entry) => entry.height),
    opexBoxOptions.gap
  );
  const opexMaxY = clamp(
    Math.max(
      scaleY(safeNumber(opexBand.maxY, opexItems.length >= 5 ? 982 : 1028)),
      opexMinY + opexRequiredSpanY + scaleY(safeNumber(snapshot.layout?.opexSelfBottomBufferY, 68)),
      opexBottom + scaleY(safeNumber(snapshot.layout?.rightBandMinExtensionFromSourceY, 112))
    ),
    opexMinY + scaleY(120),
    height - rightBandBottomPadding
  );
  const opexBottomAnchorCenter = opexEntries.length
    ? clamp(
        scaleY(
          safeNumber(
            snapshot.layout?.opexBottomAnchorCenter,
            safeNumber(
              opexBand.bottomAnchorCenter,
              safeNumber(opexBand.centerStart, opexItems.length >= 5 ? 710 : 736) +
                Math.max(opexEntries.length - 1, 0) * safeNumber(opexBand.centerStep, opexItems.length >= 5 ? 102 : 126)
            )
          )
        ),
        opexMinY + opexEntries[opexEntries.length - 1].height / 2,
        opexMaxY - opexEntries[opexEntries.length - 1].height / 2
      )
    : opexMaxY;
  let opexBoxes =
    opexEntries.length >= 2
      ? resolveAnchoredBandBoxes(opexEntries, opexMinY, opexMaxY, {
          ...opexBoxOptions,
          spreadExponent: safeNumber(snapshot.layout?.opexSpreadExponent, opexEntries.length >= 4 ? 1.16 : 1.12),
          topAnchorCenter: opexEntries[0]?.center,
          bottomAnchorCenter: opexBottomAnchorCenter,
        })
      : resolveReplicaBandBoxes(opexEntries, opexMinY, opexMaxY, opexBoxOptions);
  let opexObstacleTop = opexBoxes.length ? Math.min(...opexBoxes.map((box) => box.top)) : Infinity;
  const deductionToOpexClearance = scaleY(safeNumber(snapshot.layout?.deductionToOpexClearance, 54));
  let deductionMaxYBase = Math.max(
    deductionMinYBase,
    Math.min(rawDeductionMaxYBase, opexObstacleTop - deductionToOpexClearance)
  );
  const costBreakdownSlices = stackValueSlices(costBreakdown, costTop, scale, { minHeight: 8, targetBottom: costBottom });
  const costBreakdownBand = prototypeBandConfig(templateTokens, "costBreakdown");
  const costBreakdownSourceAnchored = costBreakdownSlices.length > 0 && costBreakdownSlices.length <= 3;
  const costBreakdownCenterBaseShiftY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownCenterBaseShiftY,
      costBreakdownSlices.length <= 1
        ? 18
        : costBreakdownExpandedFanout
          ? costBreakdownSlices.length === 2
            ? 42
            : 34
          : 26
    )
  );
  const costBreakdownCenterStepY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownCenterStepY,
      costBreakdownSlices.length === 2
        ? costBreakdownExpandedFanout
          ? 138
          : 72
        : costBreakdownExpandedFanout
          ? 102
          : 68
    )
  );
  const costBreakdownHeightBias = safeNumber(snapshot.layout?.costBreakdownHeightBias, 0.09);
  const costBreakdownBottomReleaseY =
    lowerRightPressureY *
    safeNumber(
      snapshot.layout?.costBreakdownLowerRightBottomReleaseFactor,
      costBreakdownNearOpexColumn ? 1.18 : rawCostBreakdown.length >= 2 ? 0.62 : 0.24
    );
  const costBreakdownBottomPadY = Math.max(
    rightBandBottomPadding - costBreakdownBottomReleaseY,
    scaleY(safeNumber(snapshot.layout?.costBreakdownMinBottomPadY, costBreakdownNearOpexColumn ? 26 : 34))
  );
  const costBreakdownBandGapY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownBandGapY,
      costBreakdownExpandedFanout
        ? costBreakdownSlices.length === 2
          ? 44
          : 34
        : safeNumber(costBreakdownBand.gap, 24)
    )
  );
  const costBreakdownBandMinGapY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownBandMinGapY,
      costBreakdownExpandedFanout
        ? costBreakdownSlices.length === 2
          ? 18
          : 14
        : safeNumber(costBreakdownBand.minGap, 10)
    )
  );
  const costBreakdownEntries = costBreakdownSlices.map((slice, index) => {
    const layout = replicaTreeBlockLayout(slice.item, {
      density: costBreakdownSlices.length >= 3 ? "dense" : "regular",
      titleMaxWidth: costTerminalTitleMaxWidth,
      noteMaxWidth: costTerminalTitleMaxWidth,
    });
    const fixedCenter =
      scaleY(safeNumber(costBreakdownBand.centerStart, 816)) +
      index * scaleY(safeNumber(costBreakdownBand.centerStep, 118));
    const sourceAnchoredCenter =
      slice.center +
      costBreakdownCenterBaseShiftY +
      index * costBreakdownCenterStepY +
      Math.min(slice.height * costBreakdownHeightBias, scaleY(26));
    return {
      center: costBreakdownSourceAnchored ? sourceAnchoredCenter : fixedCenter,
      height: Math.max(layout.totalHeight + safeNumber(costBreakdownBand.heightOffset, 0), 24),
      minHeight: layout.minHeight,
      layout,
    };
  });
  const costBreakdownRequiredSpanY = estimatedStackSpan(
    costBreakdownEntries.map((entry) => entry.height),
    costBreakdownBandGapY
  );
  let costBreakdownMaxY = clamp(
    Math.max(
      scaleY(safeNumber(costBreakdownBand.maxY, 1002)),
      scaleY(safeNumber(costBreakdownBand.minY, 744)) +
        costBreakdownRequiredSpanY +
        scaleY(
          safeNumber(
            snapshot.layout?.costBreakdownSelfBottomBufferY,
            costBreakdownExpandedFanout ? (costBreakdownSlices.length === 2 ? 122 : 102) : 78
          )
        )
    ),
    scaleY(safeNumber(costBreakdownBand.minY, 744)) + scaleY(90),
    height - costBreakdownBottomPadY
  );
  const costBreakdownBoxes = resolveReplicaBandBoxes(
    costBreakdownEntries,
    scaleY(safeNumber(costBreakdownBand.minY, 744)),
    costBreakdownMaxY,
    {
      gap: costBreakdownBandGapY,
      minGap: costBreakdownBandMinGapY,
      fallbackMinHeight: 34,
    }
  );
  const positiveGap = scaleY(safeNumber(snapshot.layout?.positiveGapY, 18));
  const positiveLabelBlockHeight = scaleY(safeNumber(snapshot.layout?.positiveLabelBlockHeight, 82));
  const positiveNodeGap = scaleY(safeNumber(snapshot.layout?.positiveNodeGap, 26));
  const positiveFloatPadding = scaleY(safeNumber(snapshot.layout?.positiveFloatPadding, 18));
  const positiveDeductionClearance = scaleY(safeNumber(snapshot.layout?.positiveDeductionClearance, 20));
  const positiveTaxDropY = scaleY(safeNumber(snapshot.layout?.positiveTaxDropY, 38));
  const positiveTaxSourceDropY = scaleY(safeNumber(snapshot.layout?.positiveTaxSourceDropY, 24));
  const positiveTaxCorridorExtraY = scaleY(safeNumber(snapshot.layout?.positiveTaxCorridorExtraY, 24));
  const positivePlacementMetricNoteSize = safeNumber(snapshot.layout?.profitMetricNoteSize, 18);
  const positivePlacementMetricNoteLineHeight = Math.max(
    safeNumber(snapshot.layout?.profitMetricNoteLineHeight, currentChartLanguage() === "zh" ? 22 : 23),
    positivePlacementMetricNoteSize + (currentChartLanguage() === "zh" ? 4 : 5)
  );
  const metricClusterObstacleRectEstimate = (centerX, y, title, value, subline, deltaLine, layout, padding = scaleY(10)) => {
    const localizedTitle = localizeChartPhrase(title);
    const localizedSubline = subline ? localizeChartPhrase(subline) : "";
    const widths = [
      approximateTextWidth(localizedTitle, layout.titleSize),
      approximateTextWidth(value, layout.valueSize),
      localizedSubline ? approximateTextWidth(localizedSubline, layout.subSize) : 0,
      deltaLine ? approximateTextWidth(deltaLine, layout.subSize) : 0,
    ];
    const blockWidth = Math.max(...widths, 1);
    const blockBottomBaseline = y + (deltaLine ? layout.deltaOffset : subline ? layout.subOffset : layout.valueOffset);
    const blockBottomSize = deltaLine || subline ? layout.subSize : layout.valueSize;
    return {
      left: centerX - blockWidth / 2 - padding,
      right: centerX + blockWidth / 2 + padding,
      top: y - layout.titleSize - padding,
      bottom: blockBottomBaseline + blockBottomSize * 0.42 + padding,
    };
  };
  const grossMetricPlacementLayout = resolveReplicaMetricClusterLayout(
    grossTop,
    snapshot.grossMarginYoyDeltaPp !== null && snapshot.grossMarginYoyDeltaPp !== undefined,
    {
      compactThreshold: scaleY(352),
      noteLineHeight: positivePlacementMetricNoteLineHeight,
    }
  );
  const operatingMetricPlacementLayout = resolveReplicaMetricClusterLayout(
    opTop,
    snapshot.operatingMarginYoyDeltaPp !== null && snapshot.operatingMarginYoyDeltaPp !== undefined,
    {
      compactThreshold: scaleY(352),
      noteLineHeight: positivePlacementMetricNoteLineHeight,
    }
  );
  const grossMetricPlacementY = clamp(
    layoutY(
      snapshot.layout?.grossMetricY,
      (grossTop - scaleY(grossMetricPlacementLayout.preferredClearance)) / Math.max(verticalScale, 0.0001)
    ),
    scaleY(grossMetricPlacementLayout.minTop),
    grossTop - scaleY(grossMetricPlacementLayout.bottomClearance)
  );
  const operatingMetricPlacementY = clamp(
    layoutY(
      snapshot.layout?.operatingMetricY,
      (opTop - scaleY(operatingMetricPlacementLayout.preferredClearance)) / Math.max(verticalScale, 0.0001)
    ),
    scaleY(operatingMetricPlacementLayout.minTop),
    opTop - scaleY(operatingMetricPlacementLayout.bottomClearance)
  );
  const grossMetricPlacementObstacle = metricClusterObstacleRectEstimate(
    grossX + nodeWidth / 2,
    grossMetricPlacementY,
    snapshot.grossProfitLabel || "Gross profit",
    formatBillions(grossProfitBn),
    snapshot.grossMarginPct !== null && snapshot.grossMarginPct !== undefined ? `${formatPct(snapshot.grossMarginPct)} ${marginLabel()}` : "",
    snapshot.grossMarginYoyDeltaPp !== null && snapshot.grossMarginYoyDeltaPp !== undefined ? formatPp(snapshot.grossMarginYoyDeltaPp) : "",
    grossMetricPlacementLayout
  );
  const operatingMetricPlacementObstacle = metricClusterObstacleRectEstimate(
    opX + nodeWidth / 2,
    operatingMetricPlacementY,
    snapshot.operatingProfitLabel || "Operating profit",
    formatBillions(rawOperatingProfitBn),
    snapshot.operatingMarginPct !== null && snapshot.operatingMarginPct !== undefined ? `${formatPct(snapshot.operatingMarginPct)} ${marginLabel()}` : "",
    snapshot.operatingMarginYoyDeltaPp !== null && snapshot.operatingMarginYoyDeltaPp !== undefined ? formatPp(snapshot.operatingMarginYoyDeltaPp) : "",
    operatingMetricPlacementLayout
  );
  const positiveDecisionCorridorMinX = positiveAdjustments.length
    ? clamp(
        rightBaseX -
          Math.max(
            safeNumber(snapshot.layout?.positiveDecisionCorridorReachX, 236),
            (rightBaseX - (opX + nodeWidth)) * safeNumber(snapshot.layout?.positiveDecisionCorridorReachFactor, 0.52)
          ),
        opX + nodeWidth + scaleY(safeNumber(snapshot.layout?.positiveDecisionCorridorMinOffsetFromOpX, 44)),
        rightBaseX - scaleY(safeNumber(snapshot.layout?.positiveDecisionCorridorMinOffsetFromNetX, 48))
      )
    : rightBaseX;
  const positiveDecisionCorridorMaxX = positiveAdjustments.length
    ? Math.max(
        positiveDecisionCorridorMinX + scaleY(safeNumber(snapshot.layout?.positiveDecisionCorridorMinWidthX, 36)),
        rightBaseX - scaleY(safeNumber(snapshot.layout?.positiveDecisionCorridorTargetInsetX, 18))
      )
    : rightBaseX;
  const positiveDecisionSampleXs = positiveAdjustments.length
    ? [0, 0.25, 0.5, 0.75, 1].map((t) =>
        clamp(
          positiveDecisionCorridorMinX + (positiveDecisionCorridorMaxX - positiveDecisionCorridorMinX) * t,
          positiveDecisionCorridorMinX,
          positiveDecisionCorridorMaxX
        )
      )
    : [];
  const positiveUpperObstacleFloorEstimateAtX = (sampleX) => {
    let floor = 0;
    [grossMetricPlacementObstacle, operatingMetricPlacementObstacle].forEach((obstacle) => {
      if (!obstacle) return;
      if (sampleX >= obstacle.left && sampleX <= obstacle.right) {
        floor = Math.max(floor, obstacle.bottom);
      }
    });
    return floor;
  };
  const positiveUpperObstacleFloorEstimate = positiveDecisionSampleXs.length
    ? Math.max(...positiveDecisionSampleXs.map((sampleX) => positiveUpperObstacleFloorEstimateAtX(sampleX)), 0)
    : Math.max(grossMetricPlacementObstacle.bottom, operatingMetricPlacementObstacle.bottom);
  const deductionEntriesForPositiveState = (placePositiveAbove) =>
    deductionEntries.map((entry, index) =>
      index === 0 && positiveAdjustments.length && !placePositiveAbove
        ? {
            ...entry,
            center: entry.center + positiveTaxDropY,
          }
        : entry
    );
  const totalPositiveStackHeight = totalPositiveHeight + Math.max(0, positiveAdjustments.length - 1) * positiveGap;
  const maxPositiveLabelBlockWidth = positiveAdjustments.reduce((maxWidth, item) => {
    const positiveNameSize = String(item.name || "").length > 14 ? 18 : 22;
    const positiveValueSize = String(item.name || "").length > 14 ? 18 : 20;
    const labelWidth = Math.max(
      approximateTextWidth(localizeChartPhrase(item.name), positiveNameSize),
      approximateTextWidth(formatItemBillions(item, "positive-plus"), positiveValueSize),
      1
    );
    return Math.max(
      maxWidth,
      labelWidth + scaleY(safeNumber(snapshot.layout?.positiveLabelWidthPaddingX, 10)) * 2
    );
  }, 0);
  const positiveDecisionCorridorWidth = Math.max(positiveDecisionCorridorMaxX - positiveDecisionCorridorMinX, 1);
  const positiveBelowTopMin = Math.max(netBottom + positiveNodeGap, scaleY(308));
  const positiveBelowTopMax = chartBottomLimit - totalPositiveStackHeight - positiveLabelBlockHeight - scaleY(12);
  const positiveBelowReservedHeight =
    totalPositiveStackHeight + positiveLabelBlockHeight + positiveFloatPadding + positiveDeductionClearance + positiveTaxCorridorExtraY;
  if (positiveAdjustments.length && opexBoxes.length) {
    const desiredOpexTop = positiveBelowTopMin + positiveBelowReservedHeight;
    const currentOpexTop = Math.min(...opexBoxes.map((box) => box.top));
    const opexBottomEdge = Math.max(...opexBoxes.map((box) => box.bottom));
    const shiftRoom = Math.max(opexMaxY - opexBottomEdge, 0);
    const shift = clamp(desiredOpexTop - currentOpexTop, 0, shiftRoom);
    if (shift > 0.5) {
      opexBoxes = opexBoxes.map((box) => ({
        ...box,
        top: box.top + shift,
        bottom: box.bottom + shift,
        center: box.center + shift,
      }));
      opexObstacleTop = Math.min(...opexBoxes.map((box) => box.top));
      deductionMaxYBase = Math.max(
        deductionMinYBase,
        Math.min(rawDeductionMaxYBase, opexObstacleTop - deductionToOpexClearance)
      );
    }
  }
  const deductionBelowMinY = Math.max(deductionMinYBase, positiveBelowTopMin + positiveBelowReservedHeight);
  const deductionBoxesBelowCandidate =
    deductionEntries.length >= 2
      ? resolveAnchoredBandBoxes(
          deductionEntriesForPositiveState(false),
          Math.min(deductionBelowMinY, Math.max(deductionMaxYBase - 1, deductionMinYBase)),
          deductionMaxYBase,
          {
            ...deductionBoxOptions,
            spreadExponent: safeNumber(snapshot.layout?.deductionSpreadExponent, deductionEntries.length >= 3 ? 1.14 : 1.1),
            topAnchorCenter: deductionEntries[0]?.center,
            bottomAnchorCenter: Math.min(
              deductionMaxYBase - (deductionEntries[deductionEntries.length - 1]?.height || 0) / 2,
              opexObstacleTop - deductionToOpexClearance - (deductionEntries[deductionEntries.length - 1]?.height || 0) / 2
            ),
          }
        )
      : resolveReplicaBandBoxes(
          deductionEntriesForPositiveState(false),
          Math.min(deductionBelowMinY, Math.max(deductionMaxYBase - 1, deductionMinYBase)),
          deductionMaxYBase,
          deductionBoxOptions
        );
  const highestDeductionBoxTopBelow = deductionBoxesBelowCandidate.length
    ? Math.min(...deductionBoxesBelowCandidate.map((box) => box.top))
    : Infinity;
  const highestRightObstacleTopBelow = Math.min(highestDeductionBoxTopBelow, opexObstacleTop);
  const belowPositiveClearance = highestRightObstacleTopBelow - (positiveBelowTopMin + totalPositiveStackHeight + positiveLabelBlockHeight);
  const belowPositiveFeasible = positiveAdjustments.length
    ? positiveBelowTopMax >= positiveBelowTopMin &&
      belowPositiveClearance >= positiveFloatPadding * 0.8
    : false;
  const abovePositiveCorridorHeight =
    netTop +
    totalPositiveHeight -
    (positiveUpperObstacleFloorEstimate +
      scaleY(safeNumber(snapshot.layout?.positiveAboveCorridorTopGapY, 10)) +
      scaleY(safeNumber(snapshot.layout?.positiveAboveCorridorBottomGapY, 14)));
  const abovePositiveRequiredHeight =
    totalPositiveStackHeight +
    positiveLabelBlockHeight +
    Math.max(
      scaleY(safeNumber(snapshot.layout?.positiveAboveLabelGapY, 8)),
      positiveFloatPadding * safeNumber(snapshot.layout?.positiveAboveLabelGapFactor, 0.72)
    );
  const abovePositiveFeasible = positiveAdjustments.length ? abovePositiveCorridorHeight >= abovePositiveRequiredHeight : false;
  const belowPositiveSlack = positiveAdjustments.length ? belowPositiveClearance - positiveFloatPadding * 0.8 : -Infinity;
  const abovePositiveWidthShortfall = positiveAdjustments.length
    ? Math.max(
        maxPositiveLabelBlockWidth -
          positiveDecisionCorridorWidth * safeNumber(snapshot.layout?.positiveAboveUsableCorridorWidthFactor, 0.92),
        0
      )
    : 0;
  const abovePositiveSlack = positiveAdjustments.length
    ? abovePositiveCorridorHeight -
      abovePositiveRequiredHeight -
      abovePositiveWidthShortfall * safeNumber(snapshot.layout?.positiveAboveWidthPenaltyFactor, 0.36)
    : -Infinity;
  const belowPositiveComfortable = positiveAdjustments.length
    ? belowPositiveClearance >= Math.max(scaleY(36), positiveFloatPadding * 1.35, totalPositiveStackHeight * 1.2)
    : false;
  const positivePreferredMergeDeltaY = positiveAdjustments.length
    ? Math.max(
        scaleY(safeNumber(snapshot.layout?.positivePreferredMergeDeltaY, 38)),
        positiveFloatPadding * safeNumber(snapshot.layout?.positivePreferredMergeDeltaPaddingFactor, 2.1),
        totalPositiveHeight * safeNumber(snapshot.layout?.positivePreferredMergeDeltaHeightFactor, 1.75)
      )
    : 0;
  const belowPositiveVisibleDelta = positiveAdjustments.length
    ? positiveBelowTopMax + totalPositiveStackHeight / 2 - (netBottom - totalPositiveHeight / 2)
    : -Infinity;
  const belowPositiveVisuallyClear = positiveAdjustments.length
    ? positiveBelowTopMax >= positiveBelowTopMin && belowPositiveVisibleDelta >= positivePreferredMergeDeltaY
    : false;
  const positiveAbove = positiveAdjustments.length
    ? abovePositiveFeasible &&
      (!belowPositiveFeasible ||
        !belowPositiveComfortable ||
        !belowPositiveVisuallyClear ||
        abovePositiveSlack + scaleY(8) >= belowPositiveSlack)
    : false;
  const positiveBelowLabelAbove =
    positiveAdjustments.length && !positiveAbove && belowPositiveClearance < positiveFloatPadding * 1.45;
  const resolveDeductionBoxes = (entries, minY, maxY) =>
    entries.length >= 2
      ? resolveAnchoredBandBoxes(entries, minY, maxY, {
          ...deductionBoxOptions,
          spreadExponent: safeNumber(snapshot.layout?.deductionSpreadExponent, entries.length >= 3 ? 1.14 : 1.1),
          topAnchorCenter: entries[0]?.center,
          bottomAnchorCenter: Math.min(
            maxY - (entries[entries.length - 1]?.height || 0) / 2,
            opexObstacleTop - deductionToOpexClearance - (entries[entries.length - 1]?.height || 0) / 2
          ),
        })
      : resolveReplicaBandBoxes(entries, minY, maxY, deductionBoxOptions);
  let deductionBoxes =
    positiveAdjustments.length && !positiveAbove
      ? deductionBoxesBelowCandidate
      : resolveDeductionBoxes(deductionEntriesForPositiveState(true), deductionMinYBase, deductionMaxYBase);
  const positiveNetTextAllowanceX = safeNumber(snapshot.layout?.positiveNetTextAllowanceX, 170);
  const positiveNetExtensionMaxX = Math.max(
    Math.min(safeNumber(snapshot.layout?.positiveNetExtensionMaxX, 56), width - rightLabelXBase - positiveNetTextAllowanceX),
    0
  );
  const positiveNetExtensionX = positiveAdjustments.length
    ? clamp(safeNumber(snapshot.layout?.positiveNetExtensionX, positiveAbove ? 28 : 34), 0, positiveNetExtensionMaxX)
    : 0;
  const netX = rightBaseX;
  const rightTerminalNodeX = netX;
  const rightLabelX = rightLabelXBase;
  const rightPrimaryLabelGapX = safeNumber(snapshot.layout?.rightPrimaryLabelGapX, rightBranchLabelGapX);
  const netSummaryLines = [
    {
      text: localizeChartPhrase(resolvedNetOutcomeLabel(snapshot)),
      size: 37,
      weight: 700,
      color: netLoss ? redText : greenText,
      strokeWidth: 8,
      gapAfter: 9,
    },
    {
      text: formatNetOutcomeBillions(snapshot),
      size: 31,
      weight: 700,
      color: netLoss ? redText : greenText,
      strokeWidth: 8,
      gapAfter: snapshot.netMarginPct !== null && snapshot.netMarginPct !== undefined ? 11 : 0,
    },
  ];
  if (snapshot.netMarginPct !== null && snapshot.netMarginPct !== undefined) {
    netSummaryLines.push({
      text: `${formatPct(snapshot.netMarginPct)} ${marginLabel()}`,
      size: 18,
      weight: 400,
      color: muted,
      strokeWidth: 6,
      gapAfter: snapshot.netMarginYoyDeltaPp !== null && snapshot.netMarginYoyDeltaPp !== undefined ? 8 : 0,
    });
  }
  if (snapshot.netMarginYoyDeltaPp !== null && snapshot.netMarginYoyDeltaPp !== undefined) {
    netSummaryLines.push({
      text: formatPp(snapshot.netMarginYoyDeltaPp),
      size: 18,
      weight: 400,
      color: muted,
      strokeWidth: 6,
      gapAfter: 0,
    });
  }
  const netSummaryBlockHeight = netSummaryLines.reduce(
    (sum, line, index) => sum + line.size + (index < netSummaryLines.length - 1 ? line.gapAfter : 0),
    0
  );
  const netSummaryCenterY = netTop + netHeight / 2;
  const netSummaryTop = netSummaryCenterY - netSummaryBlockHeight / 2;
  const netSummaryBottom = netSummaryCenterY + netSummaryBlockHeight / 2;
  const rightTerminalCompressionPressure = clamp(
    Math.max(rawCostBreakdown.length + opexItems.length + belowOperatingItems.length - 4, 0) * 0.15 +
      clamp(lowerRightPressureY / scaleY(92), 0, 1) * 0.32 +
      (costBreakdownNearOpexColumn ? 0.22 : 0),
    0,
    0.82
  );
  const rightTerminalSummaryClearance = scaleY(
    safeNumber(
      snapshot.layout?.rightTerminalSummaryClearanceResolvedY,
      Math.max(
        safeNumber(snapshot.layout?.rightTerminalSummaryClearanceMinY, 8),
        safeNumber(snapshot.layout?.rightTerminalSummaryClearanceY, 20) -
          safeNumber(snapshot.layout?.rightTerminalSummaryClearanceCompressionY, 14) * rightTerminalCompressionPressure
      )
    )
  );
  const rightTerminalSummaryObstacleBottom = netSummaryBottom + rightTerminalSummaryClearance;
  const branchSourceGapY = scaleY(safeNumber(snapshot.layout?.branchSourceGapY, 16));
  const branchSourceMinThickness = scaleY(safeNumber(snapshot.layout?.branchSourceMinThickness, 8));
  const netPositiveTop = positiveAdjustments.length ? (positiveAbove ? netTop : netTop + coreNetTargetHeight) : netBottom;
  const netCoreTop = positiveAdjustments.length && positiveAbove ? netTop + totalPositiveMergeHeight : netTop;
  const netCoreBottom = netCoreTop + coreNetTargetHeight;
  const revenueGrossSourceBand = {
    top: revenueTop,
    bottom: revenueGrossBottom,
    height: Math.max(revenueGrossBottom - revenueTop, 1),
    center: revenueTop + Math.max(revenueGrossBottom - revenueTop, 1) / 2,
  };
  const revenueCostSourceBand = showCostBridge
    ? {
        top: revenueCostTop,
        bottom: revenueBottom,
        height: Math.max(revenueBottom - revenueCostTop, 1),
        center: revenueCostTop + Math.max(revenueBottom - revenueCostTop, 1) / 2,
      }
    : null;
  const grossProfitSourceBand = {
    top: grossTop,
    bottom: grossTop + opHeight,
    height: Math.max(opHeight, 1),
    center: grossTop + Math.max(opHeight, 1) / 2,
  };
  const grossExpenseSourceBand = {
    top: grossTop + opHeight,
    bottom: grossBottom,
    height: Math.max(grossBottom - (grossTop + opHeight), 1),
    center: grossTop + opHeight + Math.max(grossBottom - (grossTop + opHeight), 1) / 2,
  };
  const opexInboundTargetBand = resolveConservedTargetBand(grossExpenseSourceBand, opexTop, opexBottom, {
    align: snapshot.layout?.opexInboundTargetBandAlign || "top",
  });
  const opNetSourceBand = {
    top: opTop,
    bottom: opTop + coreNetHeight,
    height: Math.max(coreNetHeight, 1),
    center: opTop + Math.max(coreNetHeight, 1) / 2,
  };
  const opDeductionSourceBand = {
    top: deductionTop,
    bottom: deductionBottom,
    height: Math.max(deductionBottom - deductionTop, 1),
    center: deductionTop + Math.max(deductionBottom - deductionTop, 1) / 2,
  };
  let deductionSourceSlices = fitSlicesToBand(
    deductionSlices.map((slice) => ({ ...slice })),
    opDeductionSourceBand.top,
    opDeductionSourceBand.bottom,
    {
      minHeight: scaleY(safeNumber(snapshot.layout?.deductionSourceMinHeight, 4)),
    }
  );
  const costBreakdownSourceMinHeight = scaleY(
    safeNumber(snapshot.layout?.costBreakdownSourceMinHeight, Math.max(branchSourceMinThickness, costBreakdownSlices.length === 2 ? 10 : 8))
  );
  let costBreakdownSourceSlices =
    costBreakdownSlices.length > 1
      ? fitSlicesToBand(
          costBreakdownSlices.map((slice) => ({ ...slice })),
          costTop,
          costBottom,
          {
            minHeight: costBreakdownSourceMinHeight,
          }
        )
      : costBreakdownSlices.map((slice) => ({ ...slice }));
  let opexSourceSlices = opexSlices.map((slice) => ({ ...slice }));
  const shiftBoxCenter = (box, nextCenter) => {
    const delta = nextCenter - safeNumber(box?.center, nextCenter);
    if (!(Math.abs(delta) > 0.01)) return box;
    return {
      ...box,
      top: box.top + delta,
      bottom: box.bottom + delta,
      center: nextCenter,
    };
  };
  const shiftBoxSetBy = (boxes, deltaY) => {
    if (!(Math.abs(deltaY) > 0.01) || !Array.isArray(boxes)) return 0;
    boxes.forEach((box, index) => {
      if (!box) return;
      boxes[index] = shiftBoxCenter(box, box.center + deltaY);
    });
    return deltaY;
  };
  const shiftSliceSetBy = (slices, deltaY) => {
    if (!(Math.abs(deltaY) > 0.01) || !Array.isArray(slices)) return 0;
    slices.forEach((slice, index) => {
      if (!slice) return;
      slices[index] = {
        ...slice,
        top: safeNumber(slice.top, 0) + deltaY,
        bottom: safeNumber(slice.bottom, 0) + deltaY,
        center: safeNumber(slice.center, 0) + deltaY,
      };
    });
    return deltaY;
  };
  if (deductionSourceSlices.length) {
    const leadNegativeSourceHeight = Math.max(safeNumber(deductionSourceSlices[0]?.height, 0), 0);
    const primaryNegativeSourceGapY = Math.max(
      scaleY(
        safeNumber(
          snapshot.layout?.primaryNegativeSourceGapY,
          clamp(
            Math.max(
              leadNegativeSourceHeight * 0.42,
              branchSourceGapY * (positiveAdjustments.length && positiveAbove ? 0.78 : 0.68)
            ),
            10,
            positiveAdjustments.length && positiveAbove ? 24 : 22
          )
        )
      ),
      0
    );
    const currentLeadSourceGapY = Math.max(
      safeNumber(deductionSourceSlices[0]?.top, opDeductionSourceBand.top) - opDeductionSourceBand.top,
      0
    );
    const availableLeadSourceShiftY = Math.max(
      opDeductionSourceBand.bottom - safeNumber(deductionSourceSlices[deductionSourceSlices.length - 1]?.bottom, opDeductionSourceBand.bottom),
      0
    );
    const desiredLeadSourceShiftY = Math.max(primaryNegativeSourceGapY - currentLeadSourceGapY, 0);
    const appliedLeadSourceShiftY = Math.min(desiredLeadSourceShiftY, availableLeadSourceShiftY);
    if (appliedLeadSourceShiftY > 0.5) {
      shiftSliceSetBy(deductionSourceSlices, appliedLeadSourceShiftY);
    }
  }
  const resolveTerminalPackingHeight = (nodeHeight, collisionHeight, options = {}) => {
    const baseHeight = Math.max(safeNumber(nodeHeight, 0), 1);
    const resolvedCollisionHeight = Math.max(safeNumber(collisionHeight, baseHeight), baseHeight);
    const maxExtraY = scaleY(safeNumber(options.maxExtraY, 52));
    return Math.max(baseHeight, Math.min(resolvedCollisionHeight, baseHeight + maxExtraY));
  };
  const enforceMinimumCenterGap = (boxes, slices, desiredGapY, minTop, maxBottom, collisionHeights = null) => {
    if (!Array.isArray(boxes) || boxes.length !== 2 || !Array.isArray(slices) || slices.length !== 2) return;
    const upperBox = boxes[0];
    const lowerBox = boxes[1];
    if (!upperBox || !lowerBox) return;
    const upperSlice = slices[0];
    const lowerSlice = slices[1];
    const upperEffectiveHeight = Math.max(
      safeNumber(upperSlice?.height, 0),
      safeNumber(upperBox?.height, 0),
      Array.isArray(collisionHeights) ? safeNumber(collisionHeights[0], 0) : 0,
      10
    );
    const lowerEffectiveHeight = Math.max(
      safeNumber(lowerSlice?.height, 0),
      safeNumber(lowerBox?.height, 0),
      Array.isArray(collisionHeights) ? safeNumber(collisionHeights[1], 0) : 0,
      10
    );
    const requiredCenterDelta =
      (upperEffectiveHeight + lowerEffectiveHeight) / 2 + Math.max(desiredGapY, 0);
    const currentCenterDelta = safeNumber(lowerBox?.center, 0) - safeNumber(upperBox?.center, 0);
    if (currentCenterDelta >= requiredCenterDelta) return;
    let remainingDelta = requiredCenterDelta - currentCenterDelta;
    const lowerMaxCenter = maxBottom - lowerEffectiveHeight / 2;
    const lowerShiftY = Math.min(Math.max(lowerMaxCenter - lowerBox.center, 0), remainingDelta);
    if (lowerShiftY > 0.01) {
      boxes[1] = shiftBoxCenter(lowerBox, lowerBox.center + lowerShiftY);
      remainingDelta -= lowerShiftY;
    }
    if (remainingDelta > 0.01) {
      const nextUpperBox = boxes[0];
      const upperMinCenter = minTop + upperEffectiveHeight / 2;
      const upperShiftY = Math.min(Math.max(nextUpperBox.center - upperMinCenter, 0), remainingDelta);
      if (upperShiftY > 0.01) {
        boxes[0] = shiftBoxCenter(nextUpperBox, nextUpperBox.center - upperShiftY);
      }
    }
  };
  const expenseDownwardBranchCenter = (slice, index, count, options = {}) => {
    const indexNorm = count <= 1 ? 0 : index / Math.max(count - 1, 1);
    const baseShiftY = scaleY(safeNumber(options.baseShiftY, 14));
    const stepY = scaleY(safeNumber(options.stepY, 28));
    const fanBoostY = scaleY(safeNumber(options.fanBoostY, 18));
    const sparseBranchBoostY = scaleY(safeNumber(options.sparseBranchBoostY, count <= 1 ? 28 : count === 2 ? 14 : 0));
    const heightBias = safeNumber(options.heightBias, 0.03);
    const maxHeightBiasY = scaleY(safeNumber(options.maxHeightBiasY, 14));
    const heightShiftY = Math.min(Math.max(safeNumber(slice?.height, 0) * heightBias, 0), maxHeightBiasY) * indexNorm;
    return safeNumber(slice?.center, 0) + baseShiftY + sparseBranchBoostY + index * stepY + indexNorm * fanBoostY + heightShiftY;
  };
  const costBreakdownOpexSummaryLayout = resolveReplicaMetricClusterLayout(opTop, false, {
    compactThreshold: scaleY(352),
    noteLineHeight: positivePlacementMetricNoteLineHeight,
    noteSize: positivePlacementMetricNoteSize,
  });
  const costBreakdownSharesOpexColumn = costBreakdownNearOpexColumn;
  const costBreakdownSharedLaneCrowdingStrength = costBreakdownSharesOpexColumn
    ? clamp(
        Math.max(costBreakdownSlices.length + opexItems.length + deductionSlices.length - 4, 0) * 0.16 +
          clamp(lowerRightPressureY / scaleY(92), 0, 1) * 0.36 +
          (costBreakdownSlices.length === 2 ? 0.14 : 0),
        0,
        0.84
      )
    : 0;
  const baseCostBreakdownOpexSummaryGapY = safeNumber(
    snapshot.layout?.opexSummaryGapY,
    36 + Math.max(operatingExpenseLabelLines.length - 1, 0) * 10 + (opexItems.length >= 3 ? 8 : 0)
  );
  const costBreakdownOpexSummaryGapY = safeNumber(
    snapshot.layout?.costBreakdownOpexSummaryGapResolvedY,
    Math.max(
      safeNumber(snapshot.layout?.costBreakdownOpexSummaryGapMinY, 12),
      baseCostBreakdownOpexSummaryGapY -
        safeNumber(snapshot.layout?.costBreakdownOpexSummaryGapCompressionY, 30) * costBreakdownSharedLaneCrowdingStrength
    )
  );
  const costBreakdownOpexSummaryTopY =
    opexBottom + scaleY(costBreakdownOpexSummaryGapY) + costBreakdownOpexSummaryLayout.titleSize * 0.82;
  const costBreakdownOpexSummaryTitleLineHeight = costBreakdownOpexSummaryLayout.titleSize + 1;
  const costBreakdownOpexSummaryValueText = formatBillionsByMode(operatingExpensesBn, "negative-parentheses");
  const costBreakdownOpexSummaryRatioText = revenueBn > 0 ? `${formatPct((operatingExpensesBn / revenueBn) * 100)} ${ofRevenueLabel()}` : "";
  const costBreakdownOpexSummaryMaxTextWidth = Math.max(
    approximateTextBlockWidth(operatingExpenseLabelLines, costBreakdownOpexSummaryLayout.titleSize),
    approximateTextWidth(costBreakdownOpexSummaryValueText, costBreakdownOpexSummaryLayout.valueSize),
    costBreakdownOpexSummaryRatioText
      ? approximateTextWidth(costBreakdownOpexSummaryRatioText, costBreakdownOpexSummaryLayout.subSize)
      : 0,
    1
  );
  const costBreakdownOpexSummaryBottom =
    costBreakdownOpexSummaryTopY +
    (operatingExpenseLabelLines.length - 1) * costBreakdownOpexSummaryTitleLineHeight +
    (costBreakdownOpexSummaryRatioText
      ? costBreakdownOpexSummaryLayout.subOffset + costBreakdownOpexSummaryLayout.subSize * 0.42
      : costBreakdownOpexSummaryLayout.valueOffset + costBreakdownOpexSummaryLayout.valueSize * 0.42);
  const costBreakdownOpexAvoidanceY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownOpexAvoidanceResolvedY,
      Math.max(
        safeNumber(snapshot.layout?.costBreakdownOpexAvoidanceMinY, 8),
        safeNumber(snapshot.layout?.costBreakdownOpexAvoidanceY, 24) -
          safeNumber(snapshot.layout?.costBreakdownOpexAvoidanceCompressionY, 16) * costBreakdownSharedLaneCrowdingStrength
      )
    )
  );
  const costBreakdownLabelGapX = safeNumber(snapshot.layout?.costBreakdownLabelGapX, 12);
  const costBreakdownLabelSafeX = costBreakdownX + nodeWidth + costBreakdownLabelGapX;
  const costBreakdownLabelSpecs = costBreakdownSlices.map((slice) =>
    resolveRightBranchLabelSpec(slice.item, costBreakdownX, nodeWidth, {
      density: costBreakdownSlices.length >= 3 ? "dense" : "regular",
      defaultMode: "negative-parentheses",
      labelX: costBreakdownLabelSafeX,
    })
  );
  const costBreakdownNodeHeights = costBreakdownSlices.map((slice) => Math.max(safeNumber(slice?.height, 0), 12));
  const costBreakdownPackingHeights = costBreakdownSlices.map((slice, index) =>
    resolveTerminalPackingHeight(costBreakdownNodeHeights[index], costBreakdownLabelSpecs[index]?.collisionHeight, {
      maxExtraY:
        costBreakdownSlices.length === 2
          ? costBreakdownNearOpexColumn
            ? costBreakdownExpandedFanout
              ? 96
              : 44
            : costBreakdownExpandedFanout
              ? 72
              : 52
          : costBreakdownExpandedFanout
            ? costBreakdownSlices.length >= 4
              ? 108
              : 84
            : 40,
    })
  );
  const costBreakdownBarrierHeights = costBreakdownSlices.map((slice, index) =>
    resolveTerminalPackingHeight(costBreakdownNodeHeights[index], costBreakdownLabelSpecs[index]?.collisionHeight, {
      maxExtraY:
        costBreakdownSlices.length === 2
          ? costBreakdownNearOpexColumn
            ? costBreakdownExpandedFanout
              ? 110
              : 52
            : costBreakdownExpandedFanout
              ? 88
              : 80
          : costBreakdownExpandedFanout
            ? costBreakdownSlices.length >= 4
              ? 132
              : 104
            : 64,
    })
  );
  const costBreakdownGapHeights = costBreakdownSlices.map((slice, index) =>
    costBreakdownSlices.length === 2
      ? Math.max(
          costBreakdownNodeHeights[index],
          Math.min(
            safeNumber(costBreakdownPackingHeights[index], costBreakdownNodeHeights[index]),
            costBreakdownNodeHeights[index] +
              scaleY(
                safeNumber(
                  snapshot.layout?.costBreakdownGapHeightExtraCapY,
                  costBreakdownSharesOpexColumn ? 72 : 60
                )
              )
          )
        )
      : Math.max(
          costBreakdownNodeHeights[index],
          costBreakdownExpandedFanout ? safeNumber(costBreakdownPackingHeights[index], costBreakdownNodeHeights[index]) : costBreakdownNodeHeights[index]
        )
  );
  const costBreakdownTerminalTopBarrierY = costBreakdownSharesOpexColumn
    ? costBreakdownOpexSummaryBottom + costBreakdownOpexAvoidanceY
    : -Infinity;
  const desiredCostBreakdownNodeGapY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownNodeGapY,
      costBreakdownSlices.length >= 3
        ? costBreakdownExpandedFanout
          ? 32
          : 20
        : costBreakdownSlices.length === 2
          ? costBreakdownSharesOpexColumn
            ? costBreakdownExpandedFanout
              ? 84
              : 52
            : costBreakdownExpandedFanout
              ? 66
              : 54
          : 38
    )
  );
  const costBreakdownTerminalGap = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownTerminalGapY,
      costBreakdownSlices.length >= 3
        ? costBreakdownExpandedFanout
          ? 26
          : 14
        : costBreakdownSlices.length === 2
          ? costBreakdownSharesOpexColumn
            ? costBreakdownExpandedFanout
              ? 86
              : 52
            : costBreakdownExpandedFanout
              ? 58
              : 44
          : 22
    )
  );
  const costBreakdownTerminalTopFloor = Math.max(
    Math.max(costTop - scaleY(safeNumber(snapshot.layout?.costBreakdownTerminalTopPadY, 10)), scaleY(620)),
    costBreakdownTerminalTopBarrierY
  );
  const rightTerminalBottomPadding = scaleY(safeNumber(snapshot.layout?.rightTerminalBottomPadding, 18));
  const terminalLayoutBottomLimit = chartBottomLimit - rightTerminalBottomPadding;
  const costBreakdownSharedLaneBottomPadY = scaleY(
    safeNumber(snapshot.layout?.costBreakdownSharedLaneBottomPadY, costBreakdownSlices.length === 2 ? 6 : 12)
  );
  const costBreakdownBottomLimit = Math.max(
    chartBottomLimit -
      (costBreakdownSharesOpexColumn
        ? costBreakdownSharedLaneBottomPadY
        : scaleY(safeNumber(snapshot.layout?.costBreakdownTerminalBottomPadY, 24))),
    costBreakdownSharesOpexColumn ? -Infinity : terminalLayoutBottomLimit
  );
  const costBreakdownRequiredResolvedSpan =
    costBreakdownGapHeights.reduce((sum, heightValue) => sum + Math.max(heightValue, 0), 0) +
    Math.max(costBreakdownGapHeights.length - 1, 0) * Math.max(costBreakdownTerminalGap, desiredCostBreakdownNodeGapY);
  const costBreakdownBarrierAwareBottomBufferY = scaleY(
    safeNumber(
      snapshot.layout?.costBreakdownBarrierAwareBottomBufferY,
      costBreakdownSlices.length === 2
        ? costBreakdownSharesOpexColumn
          ? costBreakdownExpandedFanout
            ? 54
            : 34
          : costBreakdownExpandedFanout
            ? 34
            : 24
        : costBreakdownExpandedFanout
          ? 26
          : 18
    )
  );
  costBreakdownMaxY = clamp(
    Math.max(
      costBreakdownMaxY,
      costBreakdownTerminalTopFloor + costBreakdownRequiredResolvedSpan + costBreakdownBarrierAwareBottomBufferY
    ),
    costBreakdownTerminalTopFloor + scaleY(90),
    costBreakdownBottomLimit
  );
  if (costBreakdownSharesOpexColumn) {
    costBreakdownMaxY = Math.min(
      costBreakdownBottomLimit,
      costBreakdownMaxY +
        scaleY(
          safeNumber(
            snapshot.layout?.costBreakdownSharedLaneReleaseY,
            costBreakdownExpandedFanout
              ? costBreakdownSlices.length === 2
                ? 112
                : 64
              : costBreakdownSlices.length === 2
                ? 54
                : 34
          )
        )
    );
  }
  const baseSharedCostBreakdownMaxY = costBreakdownMaxY;
  const anchoredTerminalBottomCenter = clamp(
    terminalLayoutBottomLimit - scaleY(safeNumber(snapshot.layout?.rightTerminalBottomAnchorInsetY, 34)),
    netBottom + scaleY(safeNumber(snapshot.layout?.rightTerminalMinOffsetFromNet, 22)),
    terminalLayoutBottomLimit - scaleY(10)
  );
  const maxCollisionBasedGroupShiftDown = (boxes, collisionHeights, maxBottom) => {
    if (!Array.isArray(boxes) || !boxes.length || !Array.isArray(collisionHeights) || !collisionHeights.length) return 0;
    return boxes.reduce((minRoom, box, index) => {
      if (!box) return minRoom;
      const heightValue = Math.max(safeNumber(collisionHeights[index], box.height), 1);
      return Math.min(minRoom, maxBottom - heightValue / 2 - box.center);
    }, Infinity);
  };
  const maxActualBoxGroupShiftDown = (boxes, maxBottom) => {
    if (!Array.isArray(boxes) || !boxes.length) return 0;
    return boxes.reduce((minRoom, box) => {
      if (!box) return minRoom;
      return Math.min(minRoom, maxBottom - safeNumber(box.bottom, maxBottom));
    }, Infinity);
  };
  const costBreakdownCollisionTop = () =>
    costBreakdownBoxes.reduce((minTop, box, index) => {
      if (!box) return minTop;
      return Math.min(minTop, box.center - Math.max(safeNumber(costBreakdownBarrierHeights[index], box.height), 1) / 2);
    }, Infinity);
  const expandSharedCostBreakdownBottomCapacity = (requestedExtraShiftY) => {
    if (!(costBreakdownSharesOpexColumn && requestedExtraShiftY > 0.01)) return 0;
    const adaptiveBottomLimit = Math.max(
      costBreakdownBottomLimit,
      Math.min(
        height - scaleY(safeNumber(snapshot.layout?.costBreakdownSharedLaneCanvasBottomPadY, 42)),
        baseSharedCostBreakdownMaxY +
          scaleY(
            safeNumber(snapshot.layout?.costBreakdownSharedLaneAdaptiveReleaseCapY, costBreakdownSlices.length === 2 ? 24 : 18)
          )
      )
    );
    const availableReleaseY = Math.max(adaptiveBottomLimit - costBreakdownMaxY, 0);
    if (!(availableReleaseY > 0.01)) return 0;
    const appliedReleaseY = Math.min(availableReleaseY, requestedExtraShiftY);
    if (!(appliedReleaseY > 0.01)) return 0;
    costBreakdownMaxY += appliedReleaseY;
    return appliedReleaseY;
  };
  const shiftCostBreakdownGroupDown = (requestedShiftY) => {
    if (!(requestedShiftY > 0.01) || !costBreakdownBoxes.length) return 0;
    let availableShiftY = Math.max(
      maxCollisionBasedGroupShiftDown(costBreakdownBoxes, costBreakdownPackingHeights, costBreakdownMaxY),
      maxActualBoxGroupShiftDown(costBreakdownBoxes, costBreakdownMaxY)
    );
    if (requestedShiftY > availableShiftY + 0.01 && costBreakdownSharesOpexColumn) {
      expandSharedCostBreakdownBottomCapacity(
        requestedShiftY - availableShiftY + scaleY(safeNumber(snapshot.layout?.costBreakdownAdaptiveReleaseBufferY, 6))
      );
      availableShiftY = Math.max(
        maxCollisionBasedGroupShiftDown(costBreakdownBoxes, costBreakdownPackingHeights, costBreakdownMaxY),
        maxActualBoxGroupShiftDown(costBreakdownBoxes, costBreakdownMaxY)
      );
    }
    const appliedShiftY = Math.min(Math.max(availableShiftY, 0), requestedShiftY);
    if (!(appliedShiftY > 0.01)) return 0;
    shiftBoxSetBy(costBreakdownBoxes, appliedShiftY);
    clampCostBreakdownBoxesToBounds();
    return appliedShiftY;
  };
  const resolveCostBreakdownMinDownwardShiftY = (index) => {
    const configuredShiftY =
      Array.isArray(snapshot.layout?.costBreakdownMinDownwardShiftByIndex)
        ? snapshot.layout.costBreakdownMinDownwardShiftByIndex[index]
        : snapshot.layout?.costBreakdownMinDownwardShiftY;
    const defaultShiftY =
      costBreakdownSlices.length === 2
        ? index === 0
          ? Math.max(12, 42 - 34 * costBreakdownSharedLaneCrowdingStrength)
          : Math.max(104, 138 - 24 * costBreakdownSharedLaneCrowdingStrength)
        : costBreakdownSlices.length <= 1
          ? 24
          : index === 0
            ? 24
            : 52 + (index - 1) * 18;
    return scaleY(safeNumber(configuredShiftY, defaultShiftY));
  };
  const resolveCostBreakdownDownwardCenterFloor = (index, fallbackCenter = 0) => {
    const slice = costBreakdownSourceSlices[index] || costBreakdownSlices[index];
    if (!slice) return -Infinity;
    return safeNumber(slice.center, fallbackCenter) + resolveCostBreakdownMinDownwardShiftY(index);
  };
  const resolveCostBreakdownCenterBounds = (index, box = costBreakdownBoxes[index]) => {
    const packingHeight = Math.max(safeNumber(costBreakdownPackingHeights[index], box?.height), safeNumber(box?.height, 0), 1);
    const barrierHeight = Math.max(safeNumber(costBreakdownBarrierHeights[index], packingHeight), packingHeight, 1);
    return {
      packingHeight,
      barrierHeight,
      minCenter: Math.max(
        costBreakdownTerminalTopFloor + packingHeight / 2,
        costBreakdownSharesOpexColumn ? costBreakdownTerminalTopBarrierY + barrierHeight / 2 : -Infinity,
        resolveCostBreakdownDownwardCenterFloor(index, safeNumber(box?.center, 0))
      ),
      maxCenter: costBreakdownMaxY - packingHeight / 2,
    };
  };
  const resolveCostBreakdownSpacingHeight = (index, box = costBreakdownBoxes[index]) =>
    Math.max(
      safeNumber(costBreakdownNodeHeights[index], 0),
      Math.min(
        safeNumber(costBreakdownGapHeights[index], safeNumber(costBreakdownNodeHeights[index], 0)),
        safeNumber(costBreakdownNodeHeights[index], 0) +
          scaleY(
            safeNumber(
              snapshot.layout?.costBreakdownUniformSpacingExtraCapY,
              costBreakdownSlices.length >= 5 ? 14 : costBreakdownSlices.length >= 3 ? 10 : 8
            )
          )
      ),
      1
    );
  const clampCostBreakdownBoxesToBounds = () => {
    costBreakdownBoxes.forEach((box, index) => {
      if (!box) return;
      const { minCenter, maxCenter } = resolveCostBreakdownCenterBounds(index, box);
      if (!(maxCenter >= minCenter)) return;
      costBreakdownBoxes[index] = shiftBoxCenter(box, clamp(box.center, minCenter, maxCenter));
    });
  };
  const resolveUniformCostBreakdownCenters = (gapY) => {
    if (costBreakdownBoxes.length <= 1 || costBreakdownBoxes.some((box) => !box)) return null;
    const resolvedGapY = Math.max(safeNumber(gapY, 0), 0);
    const spacingHeights = costBreakdownBoxes.map((box, index) => resolveCostBreakdownSpacingHeight(index, box));
    const prefixDistances = [];
    let cumulativeDistance = 0;
    spacingHeights.forEach((height, index) => {
      if (index === 0) {
        prefixDistances.push(0);
        return;
      }
      cumulativeDistance += spacingHeights[index - 1] / 2 + resolvedGapY + height / 2;
      prefixDistances.push(cumulativeDistance);
    });
    let minStartCenter = -Infinity;
    let maxStartCenter = Infinity;
    spacingHeights.forEach((_height, index) => {
      const { minCenter, maxCenter } = resolveCostBreakdownCenterBounds(index, costBreakdownBoxes[index]);
      minStartCenter = Math.max(minStartCenter, minCenter - prefixDistances[index]);
      maxStartCenter = Math.min(maxStartCenter, maxCenter - prefixDistances[index]);
    });
    if (!(maxStartCenter >= minStartCenter)) return null;
    const currentTop = Math.min(
      ...costBreakdownBoxes.map((box, index) => safeNumber(box?.center, 0) - spacingHeights[index] / 2)
    );
    const currentBottom = Math.max(
      ...costBreakdownBoxes.map((box, index) => safeNumber(box?.center, 0) + spacingHeights[index] / 2)
    );
    const currentClusterCenter = (currentTop + currentBottom) / 2;
    const terminalOffset =
      (prefixDistances[prefixDistances.length - 1] + spacingHeights[spacingHeights.length - 1] / 2 - spacingHeights[0] / 2) / 2;
    const anchoredStartCenter = clamp(currentClusterCenter - terminalOffset, minStartCenter, maxStartCenter);
    return prefixDistances.map((distance) => anchoredStartCenter + distance);
  };
  const findCostBreakdownFeasibleGap = (minGapY, maxGapY) => {
    let lowerGapY = Math.max(safeNumber(minGapY, 0), 0);
    let upperGapY = Math.max(safeNumber(maxGapY, lowerGapY), lowerGapY);
    let bestGapY = resolveUniformCostBreakdownCenters(lowerGapY) ? lowerGapY : 0;
    if (!(upperGapY > lowerGapY + 0.01)) return bestGapY;
    for (let pass = 0; pass < 18; pass += 1) {
      const candidateGapY = (lowerGapY + upperGapY) / 2;
      if (resolveUniformCostBreakdownCenters(candidateGapY)) {
        bestGapY = candidateGapY;
        lowerGapY = candidateGapY;
      } else {
        upperGapY = candidateGapY;
      }
    }
    return bestGapY;
  };
  const rebalanceCostBreakdownSpacing = (options = {}) => {
    if (costBreakdownBoxes.length <= 1 || costBreakdownBoxes.some((box) => !box)) return false;
    const baseGapY = Math.max(
      safeNumber(options.minimumGapY, Math.max(costBreakdownTerminalGap, desiredCostBreakdownNodeGapY)),
      scaleY(8)
    );
    let feasibleBaseGapY = baseGapY;
    let targetCenters = resolveUniformCostBreakdownCenters(feasibleBaseGapY);
    if (!targetCenters) {
      feasibleBaseGapY = findCostBreakdownFeasibleGap(0, baseGapY);
      targetCenters = resolveUniformCostBreakdownCenters(feasibleBaseGapY);
    }
    if (!targetCenters) return false;
    const totalSpacingHeight = costBreakdownBoxes.reduce(
      (sum, box, index) => sum + resolveCostBreakdownSpacingHeight(index, box),
      0
    );
    const theoreticalGapCeilingY = Math.max(
      feasibleBaseGapY,
      (costBreakdownMaxY - costBreakdownTerminalTopFloor - totalSpacingHeight) / Math.max(costBreakdownBoxes.length - 1, 1)
    );
    const feasibleMaxGapY = findCostBreakdownFeasibleGap(feasibleBaseGapY, theoreticalGapCeilingY);
    const defaultSpacingFill =
      costBreakdownSlices.length >= 5
        ? costBreakdownSharesOpexColumn
          ? 0.92
          : 0.86
        : costBreakdownSlices.length === 4
          ? costBreakdownSharesOpexColumn
            ? 0.84
            : 0.76
          : costBreakdownSlices.length === 3
            ? costBreakdownExpandedFanout
              ? 0.7
              : 0.58
            : costBreakdownExpandedFanout
              ? 0.46
              : 0.34;
    const spacingFill = clamp(
      safeNumber(options.spacingFill, safeNumber(snapshot.layout?.costBreakdownSpacingFill, defaultSpacingFill)),
      0,
      1
    );
    const targetGapY = feasibleBaseGapY + Math.max(feasibleMaxGapY - feasibleBaseGapY, 0) * spacingFill;
    const resolvedTargetCenters =
      resolveUniformCostBreakdownCenters(targetGapY) ||
      resolveUniformCostBreakdownCenters(feasibleMaxGapY) ||
      targetCenters;
    const strength = clamp(safeNumber(options.strength, 1), 0, 1);
    costBreakdownBoxes.forEach((box, index) => {
      if (!box) return;
      const targetCenter = safeNumber(resolvedTargetCenters[index], box.center);
      const nextCenter = box.center + (targetCenter - box.center) * strength;
      costBreakdownBoxes[index] = shiftBoxCenter(box, nextCenter);
    });
    clampCostBreakdownBoxesToBounds();
    return true;
  };
  const maintainCostBreakdownNodeGap = (options = {}) => {
    clampCostBreakdownBoxesToBounds();
    if (costBreakdownBoxes.length <= 1) return;
    const rebalanced = rebalanceCostBreakdownSpacing(options);
    if (!rebalanced && costBreakdownBoxes.length === 2) {
      enforceMinimumCenterGap(
        costBreakdownBoxes,
        [costBreakdownSourceSlices[0] || costBreakdownSlices[0], costBreakdownSourceSlices[1] || costBreakdownSlices[1]],
        desiredCostBreakdownNodeGapY,
        costBreakdownTerminalTopFloor,
        costBreakdownMaxY,
        costBreakdownGapHeights
      );
    }
    clampCostBreakdownBoxesToBounds();
  };
  if (costBreakdownSlices.length > 1) {
    const costBreakdownCurrentMinCenter = Math.min(
      ...costBreakdownSlices.map((slice, index) =>
        expenseDownwardBranchCenter(slice, index, costBreakdownSlices.length, {
          baseShiftY: safeNumber(snapshot.layout?.costBreakdownDownwardBaseShiftY, costBreakdownSlices.length === 2 ? 56 : 38),
          stepY: safeNumber(snapshot.layout?.costBreakdownDownwardStepY, costBreakdownSlices.length === 2 ? 168 : 108),
          fanBoostY: safeNumber(snapshot.layout?.costBreakdownDownwardFanBoostY, costBreakdownSlices.length === 2 ? 92 : 40),
          sparseBranchBoostY: safeNumber(snapshot.layout?.costBreakdownSparseBranchBoostY, costBreakdownSlices.length === 2 ? 32 : 0),
          heightBias: safeNumber(snapshot.layout?.costBreakdownDownwardHeightBias, 0.034),
          maxHeightBiasY: safeNumber(snapshot.layout?.costBreakdownDownwardMaxHeightBiasY, costBreakdownSlices.length === 2 ? 24 : 18),
        })
      )
    );
    const costBreakdownCurrentCenters = costBreakdownSlices.map((slice, index) =>
        expenseDownwardBranchCenter(slice, index, costBreakdownSlices.length, {
          baseShiftY: safeNumber(snapshot.layout?.costBreakdownDownwardBaseShiftY, costBreakdownSlices.length === 2 ? 56 : 38),
          stepY: safeNumber(snapshot.layout?.costBreakdownDownwardStepY, costBreakdownSlices.length === 2 ? 168 : 108),
          fanBoostY: safeNumber(snapshot.layout?.costBreakdownDownwardFanBoostY, costBreakdownSlices.length === 2 ? 92 : 40),
          sparseBranchBoostY: safeNumber(snapshot.layout?.costBreakdownSparseBranchBoostY, costBreakdownSlices.length === 2 ? 32 : 0),
          heightBias: safeNumber(snapshot.layout?.costBreakdownDownwardHeightBias, 0.034),
          maxHeightBiasY: safeNumber(snapshot.layout?.costBreakdownDownwardMaxHeightBiasY, costBreakdownSlices.length === 2 ? 24 : 18),
        })
      );
    const costBreakdownCurrentTop = Math.min(
      ...costBreakdownCurrentCenters.map((center, index) => center - (costBreakdownPackingHeights[index] || 0) / 2)
    );
    const costBreakdownCurrentBottom = Math.max(
      ...costBreakdownCurrentCenters.map((center, index) => center + (costBreakdownPackingHeights[index] || 0) / 2)
    );
    const costBreakdownAvailableSpan = Math.max(
      costBreakdownBottomLimit - costBreakdownTerminalTopFloor,
      1
    );
    const costBreakdownRequiredSpan =
      costBreakdownPackingHeights.reduce((sum, heightValue) => sum + Math.max(heightValue, 0), 0) +
      Math.max(costBreakdownPackingHeights.length - 1, 0) * costBreakdownTerminalGap;
    const costBreakdownSpreadStrength = clamp(
      safeNumber(
        snapshot.layout?.costBreakdownSpreadStrength,
        Math.max(costBreakdownRequiredSpan / costBreakdownAvailableSpan - 0.42, 0) * 0.9 +
          Math.max(costBreakdownSlices.length - 1, 0) * 0.12 +
          clamp(lowerRightPressureY / scaleY(92), 0, 1) * 0.34 +
          (costBreakdownSharesOpexColumn ? 0.14 : 0) +
          (costBreakdownExpandedFanout ? 0.18 : 0)
      ),
      0,
      0.78
    );
    const costBreakdownTopSlack = Math.max(costBreakdownCurrentTop - costBreakdownTerminalTopFloor, 0);
    const costBreakdownBottomSlack = Math.max(costBreakdownBottomLimit - costBreakdownCurrentBottom, 0);
    const costBreakdownTerminalBands = resolveAnchoredBandBoxes(
      costBreakdownSlices.map((slice, index) => {
        return {
          center: expenseDownwardBranchCenter(slice, index, costBreakdownSlices.length, {
            baseShiftY: safeNumber(snapshot.layout?.costBreakdownDownwardBaseShiftY, costBreakdownSlices.length === 2 ? 56 : 38),
            stepY: safeNumber(snapshot.layout?.costBreakdownDownwardStepY, costBreakdownSlices.length === 2 ? 168 : 108),
            fanBoostY: safeNumber(snapshot.layout?.costBreakdownDownwardFanBoostY, costBreakdownSlices.length === 2 ? 92 : 40),
            sparseBranchBoostY: safeNumber(snapshot.layout?.costBreakdownSparseBranchBoostY, costBreakdownSlices.length === 2 ? 32 : 0),
            heightBias: safeNumber(snapshot.layout?.costBreakdownDownwardHeightBias, 0.034),
            maxHeightBiasY: safeNumber(snapshot.layout?.costBreakdownDownwardMaxHeightBiasY, costBreakdownSlices.length === 2 ? 24 : 18),
          }),
          height: costBreakdownPackingHeights[index],
        };
      }),
      costBreakdownTerminalTopFloor,
      costBreakdownBottomLimit,
      {
        gap: costBreakdownTerminalGap,
        minGap: scaleY(10),
        bottomAnchorCenter: clamp(
          anchoredTerminalBottomCenter + costBreakdownBottomSlack * Math.min(costBreakdownSpreadStrength * 0.36 + 0.08, 0.42),
          costBreakdownTerminalTopFloor + (costBreakdownPackingHeights[costBreakdownPackingHeights.length - 1] || 0) / 2,
          costBreakdownBottomLimit - (costBreakdownPackingHeights[costBreakdownPackingHeights.length - 1] || 0) / 2
        ),
        topAnchorCenter: clamp(
          Math.max(costTop + scaleY(34), costBreakdownSlices[0]?.center ?? costTop) - costBreakdownTopSlack * costBreakdownSpreadStrength,
          costBreakdownTerminalTopFloor + (costBreakdownPackingHeights[0] || 0) / 2,
          costBreakdownBottomLimit - (costBreakdownPackingHeights[0] || 0) / 2
        ),
        spreadExponent: clamp(
          safeNumber(snapshot.layout?.costBreakdownSpreadExponent, 1.16) - costBreakdownSpreadStrength * 0.18,
          1.02,
          1.16
        ),
        fallbackMinHeight: 24,
      }
    );
    costBreakdownTerminalBands.forEach((band, index) => {
      const slice = costBreakdownSourceSlices[index] || costBreakdownSlices[index];
      const enforcedCenter = Math.max(
        band.center,
        resolveCostBreakdownDownwardCenterFloor(index, safeNumber(slice?.center, band.center))
      );
      costBreakdownBoxes[index] = shiftBoxCenter(costBreakdownBoxes[index], enforcedCenter);
    });
    maintainCostBreakdownNodeGap();
  } else if (costBreakdownBoxes.length === 1 && costBreakdownTerminalTopBarrierY > 0) {
    const box = costBreakdownBoxes[0];
    const { minCenter, maxCenter } = resolveCostBreakdownCenterBounds(0, box);
    costBreakdownBoxes[0] = shiftBoxCenter(box, clamp(Math.max(box.center, minCenter), minCenter, maxCenter));
  }
  clampCostBreakdownBoxesToBounds();
  const rightTerminalSeparationGap = scaleY(
    safeNumber(snapshot.layout?.rightTerminalSeparationGapY, positiveAdjustments.length && !positiveAbove ? 18 : 14)
  );
  const rightTerminalCrowdedUpwardLiftY = scaleY(safeNumber(snapshot.layout?.rightTerminalCrowdedUpwardLiftY, 0));
  const rightTerminalTopPackingStrength = clamp(safeNumber(snapshot.layout?.rightTerminalTopPackingStrength, 0), 0, 0.24);
  const rightTerminalTopPackingLiftY = scaleY(
    safeNumber(
      snapshot.layout?.rightTerminalTopPackingLiftY,
      20
    )
  ) * rightTerminalTopPackingStrength;
  const rightTerminalEntries = [];
  deductionBoxes.forEach((box, index) => {
    const slice = deductionSourceSlices[index] || deductionSlices[index];
    const minTargetHeight = deductionSlices[index]?.item?.name === "Other" ? 6 : 12;
    const labelSpec = resolveRightBranchLabelSpec(slice.item, rightTerminalNodeX, nodeWidth, {
      density: deductionSlices.length >= 3 ? "dense" : "regular",
      defaultMode: "negative-parentheses",
    });
    const packingHeight = resolveTerminalPackingHeight(
      Math.max(safeNumber(slice?.height, 0), minTargetHeight),
      labelSpec.collisionHeight,
      { maxExtraY: deductionSlices.length >= 3 ? 38 : 46 }
    );
    const deductionBaseCenter = expenseDownwardBranchCenter(slice, index, deductionBoxes.length, {
      baseShiftY: safeNumber(snapshot.layout?.deductionDownwardBaseShiftY, 24),
      stepY: safeNumber(snapshot.layout?.deductionDownwardStepY, 46),
      fanBoostY: safeNumber(snapshot.layout?.deductionDownwardFanBoostY, 30),
      sparseBranchBoostY: safeNumber(snapshot.layout?.deductionSparseBranchBoostY, 20),
      heightBias: safeNumber(snapshot.layout?.deductionDownwardHeightBias, 0.024),
      maxHeightBiasY: safeNumber(snapshot.layout?.deductionDownwardMaxHeightBiasY, 14),
    });
    const deductionLiftFactor =
      deductionBoxes.length <= 1 ? 1 : 1 - (index / Math.max(deductionBoxes.length - 1, 1)) * 0.32;
    rightTerminalEntries.push({
      lane: "deduction",
      index,
      center: Math.max(
        Math.min(box.center, deductionBaseCenter) - rightTerminalCrowdedUpwardLiftY * 0.74 * deductionLiftFactor,
        0
      ),
      height: packingHeight,
    });
  });
  opexBoxes.forEach((box, index) => {
    const slice = opexSourceSlices[index] || opexSlices[index];
    const labelSpec = resolveRightBranchLabelSpec(slice.item, rightTerminalNodeX, nodeWidth, {
      density: opexDensity,
      defaultMode: "negative-parentheses",
    });
    const packingHeight = resolveTerminalPackingHeight(
      Math.max(safeNumber(slice?.height, 0), 14),
      labelSpec.collisionHeight,
      { maxExtraY: opexDensity === "dense" ? 42 : 52 }
    );
    const opexBaseCenter = expenseDownwardBranchCenter(slice, index, opexBoxes.length, {
      baseShiftY: safeNumber(snapshot.layout?.opexDownwardBaseShiftY, 28),
      stepY: safeNumber(snapshot.layout?.opexDownwardStepY, 52),
      fanBoostY: safeNumber(snapshot.layout?.opexDownwardFanBoostY, 36),
      sparseBranchBoostY: safeNumber(snapshot.layout?.opexSparseBranchBoostY, 26),
      heightBias: safeNumber(snapshot.layout?.opexDownwardHeightBias, 0.026),
      maxHeightBiasY: safeNumber(snapshot.layout?.opexDownwardMaxHeightBiasY, 16),
    });
    const opexLiftFactor = opexBoxes.length <= 1 ? 1 : 1 - (index / Math.max(opexBoxes.length - 1, 1)) * 0.26;
    rightTerminalEntries.push({
      lane: "opex",
      index,
      center: Math.max(
        Math.min(box.center, opexBaseCenter) - rightTerminalCrowdedUpwardLiftY * 0.56 * opexLiftFactor,
        0
      ),
      height: packingHeight,
    });
  });
  if (rightTerminalEntries.length > 1) {
    if (rightTerminalTopPackingLiftY > 0.5) {
      const orderedPreferredEntries = [...rightTerminalEntries].sort((left, right) => left.center - right.center || left.index - right.index);
      const topPackingExponent = Math.max(safeNumber(snapshot.layout?.rightTerminalTopPackingExponent, 1.12), 0.72);
      orderedPreferredEntries.forEach((entry, orderIndex) => {
        const orderNorm = orderedPreferredEntries.length <= 1 ? 0 : orderIndex / Math.max(orderedPreferredEntries.length - 1, 1);
        const topBias = Math.pow(1 - orderNorm, topPackingExponent);
        const laneWeight = entry.lane === "deduction" ? 1 : entry.lane === "opex" ? 0.84 : 0.9;
        entry.center = Math.max(entry.center - rightTerminalTopPackingLiftY * topBias * laneWeight, 0);
      });
    }
    const currentTerminalTop = Math.min(...rightTerminalEntries.map((entry) => entry.center - entry.height / 2));
    const currentTerminalBottom = Math.max(...rightTerminalEntries.map((entry) => entry.center + entry.height / 2));
    const rightTerminalMinOffsetFromNetY = scaleY(
      safeNumber(
        snapshot.layout?.rightTerminalMinOffsetFromNetResolvedY,
        Math.max(
          safeNumber(snapshot.layout?.rightTerminalMinOffsetFromNetMinY, 8),
          safeNumber(snapshot.layout?.rightTerminalMinOffsetFromNet, positiveAdjustments.length && positiveAbove ? 16 : 22) -
            safeNumber(snapshot.layout?.rightTerminalMinOffsetFromNetCompressionY, 12) * rightTerminalCompressionPressure
        )
      )
    );
    const terminalMinY = Math.max(
      netBottom + rightTerminalMinOffsetFromNetY,
      rightTerminalSummaryObstacleBottom
    );
    const terminalMaxY = terminalLayoutBottomLimit;
    const orderedRightTerminalEntries = [...rightTerminalEntries].sort((left, right) => left.center - right.center || left.index - right.index);
    const firstRightTerminalHeight = Math.max(safeNumber(orderedRightTerminalEntries[0]?.height, 0), 1);
    const lastRightTerminalHeight = Math.max(
      safeNumber(orderedRightTerminalEntries[orderedRightTerminalEntries.length - 1]?.height, 0),
      1
    );
    const rightTerminalAvailableSpan = Math.max(terminalMaxY - terminalMinY, 1);
    const rightTerminalRequiredSpan =
      rightTerminalEntries.reduce((sum, entry) => sum + Math.max(safeNumber(entry.height, 0), 0), 0) +
      Math.max(rightTerminalEntries.length - 1, 0) * rightTerminalSeparationGap;
    const rightTerminalUtilization = rightTerminalRequiredSpan / rightTerminalAvailableSpan;
    const rightTerminalSpreadStrength = clamp(
      safeNumber(
        snapshot.layout?.rightTerminalSpreadStrength,
        Math.max(rightTerminalUtilization - 0.4, 0) * 0.78 +
          Math.max(rightTerminalEntries.length - 2, 0) * 0.06 +
          (costBreakdownSharesOpexColumn ? 0.08 : 0)
      ),
      0.08,
      0.72
    );
    const rightTerminalUniformLiftStrength = clamp(
      safeNumber(
        snapshot.layout?.rightTerminalUniformLiftStrength,
        Math.max(rightTerminalUtilization - 0.48, 0) * 0.92 +
          Math.max(rightTerminalEntries.length - 4, 0) * 0.08
      ),
      0,
      0.56
    );
    const rightTerminalSparseCompactionStrength = clamp(
      safeNumber(
        snapshot.layout?.rightTerminalSparseCompactionStrength,
        Math.max(safeNumber(snapshot.layout?.rightTerminalSparseCompactionActivationUtilization, 0.74) - rightTerminalUtilization, 0) *
          safeNumber(snapshot.layout?.rightTerminalSparseCompactionFactor, 1.18) +
          Math.max(rightTerminalEntries.length - 3, 0) * safeNumber(snapshot.layout?.rightTerminalSparseCompactionCountBoost, 0.08)
      ),
      0,
      0.82
    );
    const rightTerminalAnchorCompressionStrength = clamp(
      rightTerminalUniformLiftStrength +
        rightTerminalSparseCompactionStrength *
          safeNumber(snapshot.layout?.rightTerminalSparseAnchorCompressionFactor, 0.46),
      0,
      0.76
    );
    const rightTerminalSymmetryReleaseStrength = 0;
    const rightTerminalPositiveAboveLiftY =
      scaleY(
        safeNumber(
          snapshot.layout?.rightTerminalPositiveAboveLiftY,
          positiveAdjustments.length && positiveAbove ? 28 : 0
        )
      ) * rightTerminalSymmetryReleaseStrength;
    const rightTerminalTopSlack = Math.max(currentTerminalTop - terminalMinY, 0);
    const rightTerminalBottomSlack = Math.max(terminalMaxY - currentTerminalBottom, 0);
    const compressedTopAnchorCenter = terminalMinY + firstRightTerminalHeight / 2;
    const compressedBottomAnchorCenter = clamp(
      terminalMinY + rightTerminalRequiredSpan - lastRightTerminalHeight / 2,
      compressedTopAnchorCenter + Math.max(lastRightTerminalHeight - firstRightTerminalHeight, 0),
      terminalMaxY - lastRightTerminalHeight / 2
    );
    const releasedBottomAnchorBase = clamp(
      anchoredTerminalBottomCenter,
      terminalMinY + lastRightTerminalHeight / 2,
      terminalMaxY - lastRightTerminalHeight / 2
    );
    const sparseBottomSlackAllowanceY = scaleY(
      safeNumber(
        snapshot.layout?.rightTerminalSparseBottomSlackAllowanceY,
        rightTerminalEntries.length >= 5 ? 84 : rightTerminalEntries.length === 4 ? 72 : 58
      )
    );
    const sparseBottomAnchorBase = clamp(
      terminalMinY + rightTerminalRequiredSpan - lastRightTerminalHeight / 2 + sparseBottomSlackAllowanceY,
      compressedTopAnchorCenter + Math.max(lastRightTerminalHeight - firstRightTerminalHeight, 0),
      terminalMaxY - lastRightTerminalHeight / 2
    );
    const releasedBottomAnchorBaseCompacted =
      sparseBottomAnchorBase +
      (releasedBottomAnchorBase - sparseBottomAnchorBase) * (1 - rightTerminalSparseCompactionStrength);
    const sparseTopLiftY = scaleY(
      safeNumber(
        snapshot.layout?.rightTerminalSparseTopLiftY,
        rightTerminalEntries.length >= 5 ? 42 : rightTerminalEntries.length === 4 ? 36 : 26
      )
    ) * rightTerminalSparseCompactionStrength;
    const topAnchorCenterRaw = clamp(
      orderedRightTerminalEntries[0].center -
        rightTerminalTopSlack * Math.min(0.12 + rightTerminalSpreadStrength * 0.16, 0.28) -
        rightTerminalTopPackingLiftY * 0.14 -
        sparseTopLiftY,
      terminalMinY + firstRightTerminalHeight / 2,
      terminalMaxY - firstRightTerminalHeight / 2
    );
    const bottomAnchorCenterRaw = clamp(
      releasedBottomAnchorBaseCompacted +
        rightTerminalBottomSlack * Math.min(0.12 + rightTerminalSpreadStrength * 0.18, 0.3) * (1 - rightTerminalSparseCompactionStrength * 0.9) -
        rightTerminalTopPackingLiftY * 0.14,
      terminalMinY + lastRightTerminalHeight / 2,
      terminalMaxY - lastRightTerminalHeight / 2
    );
    const topAnchorCenter = clamp(
      compressedTopAnchorCenter + (topAnchorCenterRaw - compressedTopAnchorCenter) * (1 - rightTerminalAnchorCompressionStrength),
      compressedTopAnchorCenter,
      terminalMaxY - firstRightTerminalHeight / 2
    );
    const bottomAnchorCenter = clamp(
      compressedBottomAnchorCenter + (bottomAnchorCenterRaw - compressedBottomAnchorCenter) * (1 - rightTerminalAnchorCompressionStrength),
      compressedBottomAnchorCenter,
      terminalMaxY - lastRightTerminalHeight / 2
    );
    const resolvedTerminalBands = resolveAnchoredBandBoxes(
      rightTerminalEntries.map((entry) => ({
        center: entry.center,
        height: entry.height,
      })),
      terminalMinY,
      terminalMaxY,
      {
        gap: rightTerminalSeparationGap,
        minGap: scaleY(10),
        bottomAnchorCenter,
        topAnchorCenter,
        spreadExponent: clamp(
          safeNumber(snapshot.layout?.rightTerminalSpreadExponent, 1.12) -
            rightTerminalSpreadStrength * 0.1 -
            rightTerminalAnchorCompressionStrength * 0.08,
          1.0,
          1.14
        ),
        fallbackMinHeight: 22,
      }
    );
    resolvedTerminalBands.forEach((band, entryIndex) => {
      const entry = rightTerminalEntries[entryIndex];
      if (entry.lane === "deduction") {
        deductionBoxes[entry.index] = shiftBoxCenter(deductionBoxes[entry.index], band.center);
      } else if (entry.lane === "opex") {
        opexBoxes[entry.index] = shiftBoxCenter(opexBoxes[entry.index], band.center);
      } else {
        const box = costBreakdownBoxes[entry.index];
        const { minCenter, maxCenter } = resolveCostBreakdownCenterBounds(entry.index, box);
        costBreakdownBoxes[entry.index] = shiftBoxCenter(box, clamp(band.center, minCenter, maxCenter));
      }
    });
    if (positiveAdjustments.length && positiveAbove) {
      const liftableTerminalBoxes = [...deductionBoxes, ...opexBoxes].filter(Boolean);
      if (liftableTerminalBoxes.length) {
        const currentGroupTop = Math.min(...liftableTerminalBoxes.map((box) => box.top));
        const availableLiftY = Math.max(currentGroupTop - terminalMinY, 0);
        const desiredLiftY =
          scaleY(safeNumber(snapshot.layout?.rightTerminalVisualLiftY, positiveAbove ? 28 : 22)) *
          clamp(rightTerminalTopPackingStrength + 0.18 + rightTerminalSymmetryReleaseStrength * 0.22, 0, 0.78);
        const appliedLiftY = Math.min(availableLiftY, desiredLiftY);
        if (appliedLiftY > 0.5) {
          deductionBoxes = deductionBoxes.map((box) => (box ? shiftBoxCenter(box, box.center - appliedLiftY) : box));
          opexBoxes = opexBoxes.map((box) => (box ? shiftBoxCenter(box, box.center - appliedLiftY) : box));
        }
      }
    }
    if (costBreakdownBoxes.length) {
      maintainCostBreakdownNodeGap();
    }
    if (costBreakdownSharesOpexColumn && costBreakdownBoxes.length) {
      const topBarrierDeficit = costBreakdownTerminalTopBarrierY - costBreakdownCollisionTop();
      if (topBarrierDeficit > 0.5) {
        shiftCostBreakdownGroupDown(topBarrierDeficit + scaleY(2));
        maintainCostBreakdownNodeGap();
      }
    }
  }
  let netCoreTargetBand = {
    top: netCoreTop,
    bottom: netCoreBottom,
    height: Math.max(coreNetTargetHeight, 1),
    center: netCoreTop + Math.max(coreNetTargetHeight, 1) / 2,
  };
  let positiveTargetBands = [];
  if (positiveAdjustments.length) {
    if (positiveAbove) {
      let positiveCursor = netTop;
      positiveTargetBands = positiveMergeHeights.map((height) => {
        const top = positiveCursor;
        positiveCursor += height;
        return {
          top,
          bottom: top + height,
          height,
          center: top + height / 2,
        };
      });
      netCoreTargetBand = {
        top: positiveCursor,
        bottom: positiveCursor + coreNetTargetHeight,
        height: Math.max(coreNetTargetHeight, 1),
        center: positiveCursor + Math.max(coreNetTargetHeight, 1) / 2,
      };
    } else {
      let positiveCursor = netCoreTop + coreNetTargetHeight;
      positiveTargetBands = positiveMergeHeights.map((height) => {
        const top = positiveCursor;
        positiveCursor += height;
        return {
          top,
          bottom: top + height,
          height,
          center: top + height / 2,
        };
      });
      netCoreTargetBand = {
        top: netTop,
        bottom: netTop + coreNetTargetHeight,
        height: Math.max(coreNetTargetHeight, 1),
        center: netTop + Math.max(coreNetTargetHeight, 1) / 2,
      };
    }
  }
  const netDisplayTargetBand = {
    ...netCoreTargetBand,
  };
  const netRibbonOptions = positiveAdjustments.length
    ? {
        ...mergeOutflowRibbonOptions(),
        startCurveFactor: clamp(safeNumber(outflowRibbonOptions.startCurveFactor, 0.2) - (positiveAbove ? 0.03 : 0.01), 0.1, 0.22),
        endCurveFactor: clamp(safeNumber(outflowRibbonOptions.endCurveFactor, 0.22) + (positiveAbove ? 0.05 : 0.04), 0.18, 0.32),
        minStartCurveFactor: clamp(safeNumber(outflowRibbonOptions.minStartCurveFactor, 0.12) - 0.01, 0.08, 0.16),
        maxEndCurveFactor: clamp(safeNumber(outflowRibbonOptions.maxEndCurveFactor, 0.28) + (positiveAbove ? 0.06 : 0.04), 0.24, 0.34),
        deltaScale: Math.max(safeNumber(outflowRibbonOptions.deltaScale, 0.9) - 0.08, 0.42),
        deltaInfluence: Math.min(safeNumber(outflowRibbonOptions.deltaInfluence, 0.06) + 0.02, 0.12),
        sourceHoldFactor: clamp(
          safeNumber(
            snapshot.layout?.netSourceHoldFactor,
            belowOperatingItems.length ? (positiveAbove ? 0.22 : 0.19) : safeNumber(outflowRibbonOptions.sourceHoldFactor, 0.05)
          ),
          0.04,
          0.28
        ),
        minSourceHoldLength: Math.max(
          safeNumber(
            snapshot.layout?.netMinSourceHoldLength,
            belowOperatingItems.length ? (positiveAbove ? 54 : 42) : safeNumber(outflowRibbonOptions.minSourceHoldLength, 6)
          ),
          4
        ),
        maxSourceHoldLength: Math.max(
          safeNumber(
            snapshot.layout?.netMaxSourceHoldLength,
            belowOperatingItems.length ? (positiveAbove ? 156 : 132) : safeNumber(outflowRibbonOptions.maxSourceHoldLength, 18)
          ),
          10
        ),
        sourceHoldDeltaReduction: clamp(
          safeNumber(
            snapshot.layout?.netSourceHoldDeltaReduction,
            belowOperatingItems.length ? 0.22 : safeNumber(outflowRibbonOptions.sourceHoldDeltaReduction, 0.56)
          ),
          0,
          0.88
        ),
        minAdaptiveSourceHoldLength: Math.max(
          safeNumber(
            snapshot.layout?.netMinAdaptiveSourceHoldLength,
            belowOperatingItems.length ? (positiveAbove ? 38 : 28) : safeNumber(outflowRibbonOptions.minAdaptiveSourceHoldLength, 2)
          ),
          1
        ),
      }
    : mergeOutflowRibbonOptions();
  const netBridgePath = (x0, y0Top, y0Bottom, x1, y1Top, y1Bottom) =>
    flowPath(
      x0,
      y0Top,
      y0Bottom,
      x1 + safeNumber(snapshot.layout?.netTargetCoverInsetX, 0),
      y1Top,
      y1Bottom,
      netRibbonOptions
    );
  const mainNetRibbonEnvelopeAtX = (sampleX) => {
    return flowEnvelopeAtX(
      sampleX,
      opX + nodeWidth,
      opNetSourceBand.top,
      opNetSourceBand.bottom,
      netX + safeNumber(snapshot.layout?.netTargetCoverInsetX, 0),
      netDisplayTargetBand.top,
      netDisplayTargetBand.bottom,
      netRibbonOptions
    );
  };
  const sourceGrowthNoteSize = safeNumber(
    snapshot.layout?.sourceTemplateYoySize,
    safeNumber(snapshot.layout?.sourceTemplateQoqSize, 14)
  );
  const sourceGrowthNoteLineHeight = Math.max(
    safeNumber(snapshot.layout?.sourceTemplateSubtitleLineHeight, currentChartLanguage() === "zh" ? 17 : 18),
    sourceGrowthNoteSize + (currentChartLanguage() === "zh" ? 3 : 4)
  );
  const profitMetricNoteSize = safeNumber(snapshot.layout?.profitMetricNoteSize, 18);
  const profitMetricNoteLineHeight = Math.max(
    safeNumber(snapshot.layout?.profitMetricNoteLineHeight, currentChartLanguage() === "zh" ? 22 : 23),
    profitMetricNoteSize + (currentChartLanguage() === "zh" ? 4 : 5)
  );
  const renderMetricCluster = (centerX, y, title, value, subline, deltaLine, color, layout) => `
      <text x="${centerX}" y="${y}" text-anchor="middle" font-size="${layout.titleSize}" font-weight="700" fill="${color}" paint-order="stroke fill" stroke="${background}" stroke-width="${layout.titleStroke}" stroke-linejoin="round">${escapeHtml(localizeChartPhrase(title))}</text>
      <text x="${centerX}" y="${y + layout.valueOffset}" text-anchor="middle" font-size="${layout.valueSize}" font-weight="700" fill="${color}" paint-order="stroke fill" stroke="${background}" stroke-width="${layout.valueStroke}" stroke-linejoin="round">${escapeHtml(value)}</text>
      ${subline ? `<text x="${centerX}" y="${y + layout.subOffset}" text-anchor="middle" font-size="${layout.subSize}" fill="${muted}" paint-order="stroke fill" stroke="${background}" stroke-width="${layout.subStroke}" stroke-linejoin="round">${escapeHtml(localizeChartPhrase(subline))}</text>` : ""}
      ${deltaLine ? `<text x="${centerX}" y="${y + layout.deltaOffset}" text-anchor="middle" font-size="${layout.subSize}" fill="${muted}" paint-order="stroke fill" stroke="${background}" stroke-width="${layout.subStroke}" stroke-linejoin="round">${escapeHtml(deltaLine)}</text>` : ""}
    `;
  const metricClusterObstacleRect = (centerX, y, title, value, subline, deltaLine, layout, padding = scaleY(10)) => {
    const localizedTitle = localizeChartPhrase(title);
    const localizedSubline = subline ? localizeChartPhrase(subline) : "";
    const widths = [
      approximateTextWidth(localizedTitle, layout.titleSize),
      approximateTextWidth(value, layout.valueSize),
      localizedSubline ? approximateTextWidth(localizedSubline, layout.subSize) : 0,
      deltaLine ? approximateTextWidth(deltaLine, layout.subSize) : 0,
    ];
    const blockWidth = Math.max(...widths, 1);
    const blockBottomBaseline = y + (deltaLine ? layout.deltaOffset : subline ? layout.subOffset : layout.valueOffset);
    const blockBottomSize = deltaLine || subline ? layout.subSize : layout.valueSize;
    return {
      left: centerX - blockWidth / 2 - padding,
      right: centerX + blockWidth / 2 + padding,
      top: y - layout.titleSize - padding,
      bottom: blockBottomBaseline + blockBottomSize * 0.42 + padding,
    };
  };
  const grossMetricLayout = resolveReplicaMetricClusterLayout(grossTop, snapshot.grossMarginYoyDeltaPp !== null && snapshot.grossMarginYoyDeltaPp !== undefined, {
    compactThreshold: scaleY(352),
    noteLineHeight: profitMetricNoteLineHeight,
    noteSize: profitMetricNoteSize,
  });
  const operatingMetricLayout = resolveReplicaMetricClusterLayout(opTop, snapshot.operatingMarginYoyDeltaPp !== null && snapshot.operatingMarginYoyDeltaPp !== undefined, {
    compactThreshold: scaleY(352),
    noteLineHeight: profitMetricNoteLineHeight,
    noteSize: profitMetricNoteSize,
  });
  const expenseSummaryLayout = resolveReplicaMetricClusterLayout(opTop, false, {
    compactThreshold: scaleY(352),
    noteLineHeight: profitMetricNoteLineHeight,
    noteSize: profitMetricNoteSize,
  });
  const resolveExpenseSummaryBaselineY = (nodeBottom, options = {}) => {
    const visualGap = scaleY(safeNumber(options.visualGapY, 28));
    return nodeBottom + visualGap + expenseSummaryLayout.titleSize * 0.82;
  };
  const grossMetricY = clamp(
    layoutY(
      snapshot.layout?.grossMetricY,
      (grossTop - scaleY(grossMetricLayout.preferredClearance)) / Math.max(verticalScale, 0.0001)
    ),
    scaleY(grossMetricLayout.minTop),
    grossTop - scaleY(grossMetricLayout.bottomClearance)
  );
  const operatingMetricY = clamp(
    layoutY(
      snapshot.layout?.operatingMetricY,
      (opTop - scaleY(operatingMetricLayout.preferredClearance)) / Math.max(verticalScale, 0.0001)
    ),
    scaleY(operatingMetricLayout.minTop),
    opTop - scaleY(operatingMetricLayout.bottomClearance)
  );
  const logoMetrics = corporateLogoMetrics(snapshot.companyLogoKey);
  const logoVisibleMetrics = corporateLogoVisibleMetrics(snapshot.companyLogoKey);
  const normalizedCompanyLogoKey = normalizeLogoKey(snapshot.companyLogoKey);
  const titleText = localizeChartTitle(snapshot);
  const titleBaseSize = 82;
  const titleMaxWidth = safeNumber(snapshot.layout?.titleMaxWidth, 1540);
  const titleFontSize = titleBaseSize;
  const titleX = width / 2;
  const titleY = layoutY(snapshot.layout?.titleY, 112);
  const periodEndFontSize = 28;
  const inlinePeriodLayout = inlinePeriodEndLayout({
    titleText,
    titleFontSize,
    titleX,
    titleY,
    periodEndFontSize,
    width,
    titleMaxWidth,
    rightPadding: 84,
  });
  const titleVisualWidth = inlinePeriodLayout.titleVisualWidth;
  const periodEndY = layoutY(snapshot.layout?.periodEndInlineY, inlinePeriodLayout.periodEndY / verticalScale);
  const referenceLogoMetrics = corporateLogoVisibleMetrics("microsoft-corporate");
  const referenceLogoScale = corporateLogoBaseScale("microsoft-corporate", {
    hero: usesHeroLockups,
    config: templateTokens.logo?.corporate || BASE_CORPORATE_LOGO_TOKENS,
  });
  const logoTargetArea = safeNumber(
    snapshot.layout?.logoTargetArea,
    Math.max(referenceLogoMetrics.width * referenceLogoMetrics.height * referenceLogoScale * referenceLogoScale, 1)
  );
  const rawLogoScale = Math.sqrt(logoTargetArea / Math.max(logoVisibleMetrics.width * logoVisibleMetrics.height, 1));
  const logoScale = clamp(
    rawLogoScale * safeNumber(snapshot.layout?.logoAreaScaleFactor, 1),
    safeNumber(snapshot.layout?.logoMinScale, 0.74),
    safeNumber(snapshot.layout?.logoMaxScale, 1.32)
  );
  const titleAnchor = "middle";
  const periodEndPreferredX =
    snapshot.layout?.periodEndInlineX !== null && snapshot.layout?.periodEndInlineX !== undefined
      ? safeNumber(snapshot.layout?.periodEndInlineX) + leftShiftX
      : inlinePeriodLayout.periodEndX;
  const periodEndX = Math.min(periodEndPreferredX, width - 84);
  const logoX = revenueX + nodeWidth / 2 - (logoMetrics.width * logoScale) / 2;
  const logoHeight = logoMetrics.height * logoScale;
  const logoDefaultY =
    revenueTop -
    logoHeight -
    scaleY(safeNumber(snapshot.layout?.logoGapAboveRevenueY, 42) * CORPORATE_LOGO_REVENUE_GAP_MULTIPLIER);
  const logoMinY = layoutY(snapshot.layout?.logoMinY, 134);
  const logoY = clamp(
    logoDefaultY,
    logoMinY,
    revenueTop - logoHeight - scaleY(safeNumber(snapshot.layout?.logoBottomClearanceY, 16))
  );
  const opexSummaryX =
    snapshot.layout?.opexSummaryX !== null && snapshot.layout?.opexSummaryX !== undefined
      ? safeNumber(snapshot.layout?.opexSummaryX) + leftShiftX
      : opX + 124;
  const opexSummaryY = layoutY(snapshot.layout?.opexSummaryY, Math.min(opexBottom / verticalScale + 56, 904));
  const opexSummaryAnchor = snapshot.layout?.opexSummaryAnchor || "middle";
  const autoLayoutNodeOffsets = Object.create(null);
  const autoLayoutOffsetForNode = (nodeId) => {
    const offset = autoLayoutNodeOffsets?.[nodeId] || {};
    return {
      dx: safeNumber(offset?.dx, 0),
      dy: safeNumber(offset?.dy, 0),
    };
  };
  const manualNodeOffsetFor = (nodeId) => {
    const override = snapshot.editorNodeOverrides?.[nodeId] || {};
    return {
      dx: safeNumber(override?.dx, 0),
      dy: safeNumber(override?.dy, 0),
    };
  };
  const combinedNodeOffsetFor = (nodeId, options = {}) => {
    const manualOffset = options.includeManual === false ? { dx: 0, dy: 0 } : manualNodeOffsetFor(nodeId);
    const autoOffset = options.includeAuto === false ? { dx: 0, dy: 0 } : autoLayoutOffsetForNode(nodeId);
    return {
      dx: manualOffset.dx + autoOffset.dx,
      dy: manualOffset.dy + autoOffset.dy,
    };
  };
  const layoutReferenceOffsetFor = (nodeId) =>
    combinedNodeOffsetFor(nodeId, {
      includeManual: false,
    });
  const revenueShift = combinedNodeOffsetFor("revenue");
  const revenueLabelMarkup = (() => {
    const lines = [
      { text: localizeChartPhrase("Revenue"), size: revenueLabelTitleSize, weight: 700, color: revenueTextColor, strokeWidth: 10, gapAfter: 12 },
      {
        text: formatBillions(revenueBn),
        size: revenueLabelValueSize,
        weight: 700,
        color: revenueTextColor,
        strokeWidth: 10,
        gapAfter:
          (showQoq && snapshot.revenueQoqPct !== null && snapshot.revenueQoqPct !== undefined) ||
          (snapshot.revenueYoyPct !== null && snapshot.revenueYoyPct !== undefined)
            ? 12
            : 0,
      },
    ];
    if (showQoq && snapshot.revenueQoqPct !== null && snapshot.revenueQoqPct !== undefined) {
      lines.push({
        text: formatGrowthMetric(snapshot.revenueQoqPct, "qoq"),
        size: revenueLabelQoqSize,
        weight: 500,
        color: muted,
        strokeWidth: 7,
        gapAfter: snapshot.revenueYoyPct !== null && snapshot.revenueYoyPct !== undefined ? 6 : 0,
      });
    }
    if (snapshot.revenueYoyPct !== null && snapshot.revenueYoyPct !== undefined) {
      lines.push({
        text: formatGrowthMetric(snapshot.revenueYoyPct, "yoy"),
        size: revenueLabelNoteSize,
        weight: 500,
        color: muted,
        strokeWidth: 7,
        gapAfter: 0,
      });
    }
    const blockHeight = lines.reduce((sum, line, index) => sum + line.size + (index < lines.length - 1 ? line.gapAfter : 0), 0);
    let cursor = revenueLabelCenterY - blockHeight / 2;
    return lines
      .map((line, index) => {
        cursor += line.size;
        const markup = `<text x="${revenueLabelCenterX + revenueShift.dx}" y="${cursor + revenueShift.dy}" text-anchor="middle" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}" opacity="0.98" paint-order="stroke fill" stroke="${background}" stroke-width="${line.strokeWidth}" stroke-linejoin="round">${escapeHtml(line.text)}</text>`;
        if (index < lines.length - 1) cursor += line.gapAfter;
        return markup;
      })
      .join("");
  })();
  const opexSummaryCenterX = opX + nodeWidth / 2;
  const opexSummaryGapY = safeNumber(
    snapshot.layout?.opexSummaryGapY,
    36 + Math.max(operatingExpenseLabelLines.length - 1, 0) * 10 + (opexItems.length >= 3 ? 8 : 0)
  );
  const opexSummaryTopY = resolveExpenseSummaryBaselineY(opexBottom, {
    visualGapY: opexSummaryGapY,
  });
  const opexSummaryTitleLineHeight = expenseSummaryLayout.titleSize + 1;
  const opexSummaryTitleHeight = operatingExpenseLabelLines.length * opexSummaryTitleLineHeight;
  const opexSummaryValueY = opexSummaryTopY + (operatingExpenseLabelLines.length - 1) * opexSummaryTitleLineHeight + expenseSummaryLayout.valueOffset;
  const opexSummaryRatioY = opexSummaryTopY + (operatingExpenseLabelLines.length - 1) * opexSummaryTitleLineHeight + expenseSummaryLayout.subOffset;
  const opexSummaryValueOffsetY = opexSummaryValueY - opexSummaryTopY;
  const opexSummaryRatioOffsetY = opexSummaryRatioY - opexSummaryTopY;
  let opexSummaryAutoLiftY = 0;
  const opexSummaryVisibleTopOffsetY = -expenseSummaryLayout.titleSize * safeNumber(snapshot.layout?.opexSummaryVisibleTopFactor, 0.933);
  const opexSummaryVisibleBottomOffsetY =
    (revenueBn > 0
      ? opexSummaryRatioOffsetY + expenseSummaryLayout.subSize * 0.42
      : opexSummaryValueOffsetY + expenseSummaryLayout.valueSize * 0.42);
  const resolveCostSummaryVisibleTopGapY = () =>
    resolveExpenseSummaryBaselineY(costBottom, {
      visualGapY: safeNumber(snapshot.layout?.costSummaryGapY, 28),
    }) +
    opexSummaryVisibleTopOffsetY -
    costBottom;
  const resolveOpexSummaryTargetTopGapY = () =>
    snapshot.layout?.opexSummaryTargetTopGapY !== null && snapshot.layout?.opexSummaryTargetTopGapY !== undefined
      ? scaleY(safeNumber(snapshot.layout?.opexSummaryTargetTopGapY))
      : resolveCostSummaryVisibleTopGapY() + scaleY(safeNumber(snapshot.layout?.opexSummaryTargetTopGapAdjustY, 0));
  const resolveOpexSummaryTitleBaselineY = (
    shift = combinedNodeOffsetFor("operating-expenses"),
    summaryLiftY = opexSummaryAutoLiftY
  ) =>
    opexBottom + shift.dy + resolveOpexSummaryTargetTopGapY() - opexSummaryVisibleTopOffsetY - summaryLiftY;
  const resolveOpexSummaryMetrics = (shift = combinedNodeOffsetFor("operating-expenses"), summaryLiftY = opexSummaryAutoLiftY) => {
    const baselineTopY = resolveOpexSummaryTitleBaselineY(shift, summaryLiftY);
    return {
      centerX: opexSummaryCenterX + shift.dx,
      top: baselineTopY + opexSummaryVisibleTopOffsetY,
      bottom: baselineTopY + opexSummaryVisibleBottomOffsetY,
      titleY: baselineTopY,
      valueY: baselineTopY + opexSummaryValueOffsetY,
      ratioY: baselineTopY + opexSummaryRatioOffsetY,
    };
  };
  const resolveOpexSummaryObstacleRect = (
    shift = combinedNodeOffsetFor("operating-expenses"),
    summaryLiftY = opexSummaryAutoLiftY,
    options = {}
  ) => {
    const summaryMetrics = resolveOpexSummaryMetrics(shift, summaryLiftY);
    const obstaclePadX = scaleY(safeNumber(options.padX, 10));
    const obstaclePadY = scaleY(safeNumber(options.padY, 8));
    const obstacleWidth = Math.max(
      approximateTextBlockWidth(operatingExpenseLabelLines, expenseSummaryLayout.titleSize),
      approximateTextWidth(formatBillionsByMode(operatingExpensesBn, "negative-parentheses"), expenseSummaryLayout.valueSize),
      revenueBn > 0 ? approximateTextWidth(`${formatPct((operatingExpensesBn / revenueBn) * 100)} ${ofRevenueLabel()}`, expenseSummaryLayout.subSize) : 0,
      1
    );
    return {
      metrics: summaryMetrics,
      left: summaryMetrics.centerX - obstacleWidth / 2 - obstaclePadX,
      right: summaryMetrics.centerX + obstacleWidth / 2 + obstaclePadX,
      top: summaryMetrics.top - obstaclePadY,
      bottom: summaryMetrics.bottom + obstaclePadY,
    };
  };
  const alignOpexSummaryToNode = () => {
    opexSummaryAutoLiftY = 0;
  };
  const renderOpexSummaryMarkup = () => {
    const summaryMetrics = resolveOpexSummaryMetrics();
    return `
      ${svgTextBlock(summaryMetrics.centerX, summaryMetrics.titleY, operatingExpenseLabelLines, {
        fill: redText,
        fontSize: expenseSummaryLayout.titleSize,
        weight: 700,
        anchor: "middle",
        lineHeight: opexSummaryTitleLineHeight,
        haloColor: background,
        haloWidth: expenseSummaryLayout.titleStroke,
      })}
      <text x="${summaryMetrics.centerX}" y="${summaryMetrics.valueY}" text-anchor="middle" font-size="${expenseSummaryLayout.valueSize}" font-weight="700" fill="${redText}" paint-order="stroke fill" stroke="${background}" stroke-width="${expenseSummaryLayout.valueStroke}" stroke-linejoin="round">${escapeHtml(formatBillionsByMode(operatingExpensesBn, "negative-parentheses"))}</text>
      ${revenueBn > 0 ? `<text x="${summaryMetrics.centerX}" y="${summaryMetrics.ratioY}" text-anchor="middle" font-size="${expenseSummaryLayout.subSize}" fill="${muted}" paint-order="stroke fill" stroke="${background}" stroke-width="${expenseSummaryLayout.subStroke}" stroke-linejoin="round">${escapeHtml(formatPct((operatingExpensesBn / revenueBn) * 100))} ${ofRevenueLabel()}</text>` : ""}
    `;
  };
  const shiftOpexGroupDownForSummaryClearance = () => {
    if (!opexBoxes.length) return;
    const opexSummaryObstacle = resolveOpexSummaryObstacleRect(layoutReferenceOffsetFor("operating-expenses"), opexSummaryAutoLiftY, {
      padX: safeNumber(snapshot.layout?.opexSummaryOpexObstaclePadX, 10),
      padY: safeNumber(snapshot.layout?.opexSummaryOpexObstaclePadY, 8),
    });
    const sampleXsAcrossRange = (left, right, count = 7) => {
      if (!(right > left)) return [left];
      return Array.from({ length: count }, (_value, index) => left + ((right - left) * index) / Math.max(count - 1, 1));
    };
    const computeOpexEnvelopeDeficit = (index) => {
      const box = opexBoxes[index];
      const sourceSlice = opexSourceSlices[index] || opexSlices[index];
      if (!box || !sourceSlice) return 0;
      const sourceShift = layoutReferenceOffsetFor("operating-expenses");
      const targetShift = layoutReferenceOffsetFor(`opex-${index}`);
      const sourceCoverInset = Math.max(
        safeNumber(standardTerminalBranchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)),
        0
      );
      const mergedBranchOptions = {
        ...mergeOutflowRibbonOptions(standardTerminalBranchOptions),
        endCapWidth: 0,
        targetCoverInsetX: safeNumber(
          standardTerminalBranchOptions.targetCoverInsetX,
          safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)
        ),
      };
      const bridge = constantThicknessBridge(sourceSlice, box.center, 14, opexTop, opexBottom);
      const targetTop = bridge.targetTop + targetShift.dy;
      const targetHeight = bridge.targetHeight;
      const branchOptions = resolveAdaptiveNegativeTerminalBranchOptions(
        standardTerminalBranchOptions,
        bridge.sourceTop + sourceShift.dy,
        bridge.sourceBottom + sourceShift.dy,
        targetTop,
        targetHeight,
        {
          index,
          count: Math.max(opexBoxes.filter(Boolean).length, 1),
          laneBias: 0.04,
        }
      );
      const sourceX = opX + nodeWidth + sourceShift.dx - sourceCoverInset;
      const targetX = rightTerminalNodeX + mergedBranchOptions.targetCoverInsetX + targetShift.dx;
      const overlapLeft = Math.max(opexSummaryObstacle.left, sourceX + scaleY(4));
      const overlapRight = Math.min(opexSummaryObstacle.right, targetX - scaleY(4));
      if (!(overlapRight > overlapLeft)) return 0;
      const ribbonClearanceY = scaleY(safeNumber(snapshot.layout?.opexSummaryToRibbonGapY, 14));
      return sampleXsAcrossRange(overlapLeft, overlapRight).reduce((maxDeficit, sampleX) => {
        const envelope = flowEnvelopeAtX(
          sampleX,
          sourceX,
          bridge.sourceTop + sourceShift.dy,
          bridge.sourceBottom + sourceShift.dy,
          targetX,
          targetTop,
          targetTop + targetHeight,
          branchOptions
        );
        if (!envelope) return maxDeficit;
        return Math.max(maxDeficit, opexSummaryObstacle.bottom + ribbonClearanceY - envelope.top);
      }, 0);
    };
    const summaryClearanceY = scaleY(
      safeNumber(snapshot.layout?.opexSummaryToFirstOpexGapY, opexBoxes.length >= 2 ? 52 : 44)
    );
    const desiredFirstOpexTopY = opexSummaryObstacle.metrics.bottom + summaryClearanceY;
    const firstOpexTopY = Math.min(...opexBoxes.filter(Boolean).map((box) => safeNumber(box.top, Infinity)));
    const topDeficitY = desiredFirstOpexTopY - firstOpexTopY;
    const ribbonDeficitY = opexBoxes.reduce(
      (maxDeficit, _box, index) => Math.max(maxDeficit, computeOpexEnvelopeDeficit(index)),
      0
    );
    let requiredShiftY = Math.max(topDeficitY, ribbonDeficitY);
    if (!(requiredShiftY > 0.5)) return;
    const currentOpexBottomY = Math.max(...opexBoxes.filter(Boolean).map((box) => safeNumber(box.bottom, -Infinity)));
    if (costBreakdownSharesOpexColumn && costBreakdownBoxes.length) {
      const firstCostBreakdownTopY = Math.min(...costBreakdownBoxes.filter(Boolean).map((box) => safeNumber(box.top, Infinity)));
      const minOpexToCostGapY = scaleY(safeNumber(snapshot.layout?.opexToCostBreakdownMinGapY, 74));
      const availableOpexToCostGapY = firstCostBreakdownTopY - currentOpexBottomY;
      const nextGapAfterShiftY = availableOpexToCostGapY - requiredShiftY;
      if (nextGapAfterShiftY < minOpexToCostGapY) {
        const costBreakdownFollowShiftY = minOpexToCostGapY - nextGapAfterShiftY;
        if (costBreakdownFollowShiftY > 0.5) {
          shiftCostBreakdownGroupDown(costBreakdownFollowShiftY + scaleY(2));
          maintainCostBreakdownNodeGap();
        }
      }
    }
    const opexShiftHeadroomY = maxActualBoxGroupShiftDown(opexBoxes, opexMaxY);
    const appliedShiftY = Math.min(Math.max(requiredShiftY, 0), opexShiftHeadroomY);
    if (!(appliedShiftY > 0.5)) return;
    shiftBoxSetBy(opexBoxes, appliedShiftY);
  };
  const resolveSourceMetricBaselines = (slice, index, lineMetrics, options = {}) => {
    if (!lineMetrics.length) return [];
    const minTop = scaleY(safeNumber(options.minTop, 188));
    const topPadding = scaleY(safeNumber(options.topPadding, 8));
    const bottomPadding = scaleY(safeNumber(options.bottomPadding, 10));
    const ribbonClearance = scaleY(safeNumber(options.ribbonClearance, 8));
    const verticalBias = clamp(safeNumber(options.verticalBias, 0.18), 0, 1);
    const prevBottom = index > 0 ? sourceSlices[index - 1].bottom : minTop - topPadding;
    const regionTop = Math.max(prevBottom + topPadding, minTop);
    const regionBottom = slice.top - bottomPadding - ribbonClearance;
    const blockHeight = lineMetrics.reduce((sum, line, lineIndex) => sum + line.fontSize + (lineIndex < lineMetrics.length - 1 ? line.gapAfter : 0), 0);
    const slack = Math.max(regionBottom - regionTop - blockHeight, 0);
    const top = regionTop + slack * verticalBias;
    let cursor = top;
    return lineMetrics.map((line, lineIndex) => {
      cursor += line.fontSize;
      const baseline = cursor;
      if (lineIndex < lineMetrics.length - 1) cursor += line.gapAfter;
      return baseline;
    });
  };
  const renderSourceMetricBlock = (item, x, anchor, baselines, sizes) => {
    if (!baselines.length) return "";
    let block = `<text x="${x}" y="${baselines[0]}" text-anchor="${anchor}" font-size="${sizes.value}" font-weight="500" fill="${item.valueColor || muted}" paint-order="stroke fill" stroke="${background}" stroke-width="5" stroke-linejoin="round">${escapeHtml(formatSourceMetric(item))}</text>`;
    let lineIndex = 1;
    if (showQoq && item.qoqPct !== null && item.qoqPct !== undefined && baselines[lineIndex] !== undefined) {
      block += `<text x="${x}" y="${baselines[lineIndex]}" text-anchor="${anchor}" font-size="${sizes.qoq}" fill="${muted}" paint-order="stroke fill" stroke="${background}" stroke-width="4.5" stroke-linejoin="round">${escapeHtml(formatGrowthMetric(item.qoqPct, "qoq"))}</text>`;
      lineIndex += 1;
    }
    if (item.yoyPct !== null && item.yoyPct !== undefined && baselines[lineIndex] !== undefined) {
      block += `<text x="${x}" y="${baselines[lineIndex]}" text-anchor="${anchor}" font-size="${sizes.yoy}" fill="${muted}" paint-order="stroke fill" stroke="${background}" stroke-width="4.5" stroke-linejoin="round">${escapeHtml(formatGrowthMetric(item.yoyPct, "yoy"))}</text>`;
    }
    return block;
  };
  const sourceTemplatePreset = (density = "regular", options = {}) => {
    const detail = !!options.detail;
    if (density === "micro") {
      return {
        titleSize: detail ? 18 : 19,
        titleLineHeight: detail ? 21 : 22,
        subtitleSize: 12,
        subtitleLineHeight: 15,
        valueSize: 18,
        yoySize: 12,
        qoqSize: 12,
        metricGap: 3,
        metricBlockGap: 4,
      };
    }
    if (density === "compact" || density === "dense" || density === "ultra") {
      return {
        titleSize: detail ? 22 : 24,
        titleLineHeight: detail ? 25 : 27,
        subtitleSize: detail ? 13 : 14,
        subtitleLineHeight: detail ? 16 : 17,
        valueSize: detail ? 21 : 23,
        yoySize: detail ? 13 : 14,
        qoqSize: detail ? 13 : 14,
        metricGap: 4,
        metricBlockGap: 5,
      };
    }
    return {
      titleSize: detail ? 23 : 26,
      titleLineHeight: detail ? 26 : 29,
      subtitleSize: detail ? 13 : 14,
      subtitleLineHeight: detail ? 16 : 17,
      valueSize: detail ? 22 : 24,
      yoySize: detail ? 13 : 14,
      qoqSize: detail ? 13 : 14,
      metricGap: 4,
      metricBlockGap: 5,
    };
  };
  const renderTemplateSourceAnnotation = (item, slice, box, options = {}) => {
    const density = options.density || item.layoutDensity || "regular";
    const preset = sourceTemplatePreset(density, options);
    const titleSize = safeNumber(options.titleSize, preset.titleSize);
    const titleLineHeight = safeNumber(options.titleLineHeight, preset.titleLineHeight);
    const subtitleSize = safeNumber(options.subtitleSize, preset.subtitleSize);
    const subtitleLineHeight = safeNumber(options.subtitleLineHeight, preset.subtitleLineHeight);
    const valueSize = safeNumber(options.valueSize, preset.valueSize);
    const yoySize = safeNumber(options.yoySize, preset.yoySize);
    const qoqSize = safeNumber(options.qoqSize, preset.qoqSize);
    const metricGap = safeNumber(options.metricGap, preset.metricGap);
    const metricBlockGap = safeNumber(options.metricBlockGap, preset.metricBlockGap);
    const labelLines = options.labelLines?.length
      ? localizeChartLines(options.labelLines)
      : resolveSourceLabelLines(item, {
          compactMode: compactSources || item.compactLabel,
          fontSize: titleSize,
          maxWidth: safeNumber(options.labelMaxWidth, currentChartLanguage() === "zh" ? 154 : 194),
          maxLines: currentChartLanguage() === "zh" ? 2 : 3,
        });
    const supportLines = resolveLocalizedSupportLines(item, options.supportLines, options.supportLinesZh);
    const titleColor = options.titleColor || item.labelColor || item.nodeColor || dark;
    const subtitleColor = options.subtitleColor || item.supportColor || muted;
    const valueColor = options.valueColor || item.valueColor || item.nodeColor || item.labelColor || dark;
    const labelX = safeNumber(options.labelX, sourceLabelX);
    const labelAnchor = options.labelAnchor || "start";
    const metricX = safeNumber(options.metricX, leftX - 12);
    const metricAnchor = options.metricAnchor || "end";
    const titleBlockHeight = labelLines.length * titleLineHeight;
    const subtitleGap = supportLines.length ? metricBlockGap : 0;
    const subtitleBlockHeight = supportLines.length ? supportLines.length * subtitleLineHeight : 0;
    const totalLabelHeight = titleBlockHeight + subtitleGap + subtitleBlockHeight;
    const clampLabelToBox = options.clampLabelToBox !== false;
    const labelCenterY = clampLabelToBox
      ? clamp(
          safeNumber(options.labelCenterY, slice.center),
          box.top + totalLabelHeight / 2,
          box.bottom - totalLabelHeight / 2
        )
      : safeNumber(options.labelCenterY, slice.center);
    const titleStartY = labelCenterY - totalLabelHeight / 2 + titleLineHeight * 0.8;
    const centeredWrappedLabel = labelLines.length > 1;
    const labelBlockWidth = approximateTextBlockWidth(labelLines, titleSize);
    const effectiveLabelAnchor = centeredWrappedLabel ? "middle" : labelAnchor;
    const effectiveLabelX =
      effectiveLabelAnchor === "middle"
        ? labelAnchor === "end"
          ? labelX - labelBlockWidth / 2
          : labelAnchor === "start"
            ? labelX + labelBlockWidth / 2
            : labelX
        : labelX;
    const metricLines = [
      {
        text: formatSourceMetric(item),
        size: valueSize,
        weight: 700,
        color: valueColor,
        strokeWidth: 6,
      },
    ];
    if (showQoq && item.qoqPct !== null && item.qoqPct !== undefined) {
      metricLines.push({
        text: formatGrowthMetric(item.qoqPct, "qoq"),
        size: qoqSize,
        weight: 500,
        color: muted,
        strokeWidth: 4.5,
      });
    }
    if (item.yoyPct !== null && item.yoyPct !== undefined) {
      metricLines.push({
        text: formatGrowthMetric(item.yoyPct, "yoy"),
        size: yoySize,
        weight: 500,
        color: muted,
        strokeWidth: 4.5,
      });
    }
    const metricBlockHeight = metricLines.reduce(
      (sum, line, lineIndex) => sum + line.size + (lineIndex < metricLines.length - 1 ? metricGap : 0),
      0
    );
    const metricPlacement = options.metricPlacement || "center";
    let metricTop;
    if (metricPlacement === "above-ribbon") {
      const metricTopPadding = scaleY(safeNumber(options.metricTopPadding, 10));
      const metricMinTop = scaleY(safeNumber(options.metricMinTop, 146));
      const ribbonTop = safeNumber(options.ribbonTop, slice.top);
      const previousRibbonBottom = options.previousRibbonBottom !== undefined && options.previousRibbonBottom !== null
        ? safeNumber(options.previousRibbonBottom)
        : null;
      const previousClearance = scaleY(safeNumber(options.metricPreviousClearance, 10));
      metricTop = safeNumber(options.metricTop, ribbonTop - metricTopPadding - metricBlockHeight);
      if (previousRibbonBottom !== null && previousRibbonBottom !== undefined) {
        metricTop = Math.max(metricTop, previousRibbonBottom + previousClearance);
      }
      metricTop = Math.max(metricTop, metricMinTop);
      metricTop = Math.min(metricTop, ribbonTop - scaleY(safeNumber(options.metricBottomClearance, 6)) - metricBlockHeight);
    } else {
      const metricCenterY = clamp(
        safeNumber(options.metricCenterY, slice.center),
        box.top + metricBlockHeight / 2,
        box.bottom - metricBlockHeight / 2
      );
      metricTop = metricCenterY - metricBlockHeight / 2;
    }
    let metricCursor = metricTop;
    let html = "";
    metricLines.forEach((line, lineIndex) => {
      metricCursor += line.size;
      html += `<text x="${metricX}" y="${metricCursor}" text-anchor="${metricAnchor}" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}" paint-order="stroke fill" stroke="${background}" stroke-width="${line.strokeWidth}" stroke-linejoin="round">${escapeHtml(line.text)}</text>`;
      if (lineIndex < metricLines.length - 1) metricCursor += metricGap;
    });
    html += svgTextBlock(effectiveLabelX, titleStartY, labelLines, {
      fill: titleColor,
      fontSize: titleSize,
      weight: 800,
      anchor: effectiveLabelAnchor,
      lineHeight: titleLineHeight,
      haloColor: background,
      haloWidth: 5,
    });
    if (supportLines.length) {
      html += svgTextBlock(
        effectiveLabelX,
        titleStartY + labelLines.length * titleLineHeight + subtitleGap,
        supportLines,
        {
          fill: subtitleColor,
          fontSize: subtitleSize,
          weight: 500,
          anchor: effectiveLabelAnchor,
          lineHeight: subtitleLineHeight,
          haloColor: background,
          haloWidth: 4,
        }
      );
    }
    return html;
  };
  const renderLeftDetailLabel = (slice, box, index) => {
    const item = slice.item;
    const detailNodeId = `left-detail-${index}`;
    const detailFrame = editableNodeFrame(detailNodeId, leftDetailX, slice.top, leftDetailWidth, slice.height);
    const targetIndex = sourceSlices.indexOf(slice.targetSlice);
    const targetNodeId = targetIndex >= 0 ? `source-${targetIndex}` : null;
    const targetShift = targetNodeId ? editorOffsetForNode(targetNodeId) : { dx: 0, dy: 0 };
    const detailShift = editorOffsetForNode(detailNodeId);
    const compactMode = compactSources || item.compactLabel;
    const labelLines = resolveSourceLabelLines(item, {
      compactMode,
      fontSize: safeNumber(snapshot.layout?.detailSourceTitleSize, safeNumber(snapshot.layout?.sourceTemplateTitleSize, 28)),
      maxWidth: currentChartLanguage() === "zh" ? 166 : 198,
    });
    const labelX = detailSourceLabelX + detailShift.dx;
    const metricX = detailSourceMetricX + detailShift.dx;
    let block = `<path d="${detailSourceFlowPath(detailFrame.right, detailFrame.top, detailFrame.bottom, leftX + targetShift.dx, slice.targetTop + targetShift.dy, slice.targetBottom + targetShift.dy)}" fill="${item.flowColor || slice.targetSlice.item.flowColor}" opacity="0.98"></path>`;
    block += renderEditableNodeRect(detailFrame, item.nodeColor || slice.targetSlice.item.nodeColor);
    block += renderTemplateSourceAnnotation(item, slice, box, {
      density: "regular",
      labelLines,
      supportLines: [],
      labelX,
      labelAnchor: "end",
      metricX,
      metricAnchor: "start",
      metricPlacement: "above-ribbon",
      previousRibbonBottom: box?.previousRibbonBottom ?? null,
      ribbonTop: detailFrame.top,
      labelCenterY: detailFrame.centerY,
      clampLabelToBox: false,
      titleSize: safeNumber(snapshot.layout?.detailSourceTitleSize, safeNumber(snapshot.layout?.sourceTemplateTitleSize, 28)),
      titleLineHeight: safeNumber(snapshot.layout?.detailSourceTitleLineHeight, safeNumber(snapshot.layout?.sourceTemplateTitleLineHeight, 31)),
      subtitleSize: safeNumber(snapshot.layout?.detailSourceSubtitleSize, safeNumber(snapshot.layout?.sourceTemplateSubtitleSize, 14)),
      subtitleLineHeight: safeNumber(snapshot.layout?.detailSourceSubtitleLineHeight, safeNumber(snapshot.layout?.sourceTemplateSubtitleLineHeight, 17)),
      valueSize: safeNumber(snapshot.layout?.detailSourceValueSize, safeNumber(snapshot.layout?.sourceTemplateValueSize, 24)),
      yoySize: safeNumber(snapshot.layout?.detailSourceYoySize, safeNumber(snapshot.layout?.sourceTemplateYoySize, 14)),
      qoqSize: safeNumber(snapshot.layout?.detailSourceQoqSize, safeNumber(snapshot.layout?.sourceTemplateQoqSize, 14)),
      titleColor: item.nodeColor || item.labelColor || dark,
      valueColor: item.nodeColor || item.valueColor || item.labelColor || dark,
    });
    return block;
  };
  const renderLeftLabel = (slice, box, index) => {
    const item = slice.item;
    const sourceShift = editorOffsetForNode(`source-${index}`);
    const compactMode = compactSources || item.compactLabel;
    const labelLines = resolveSourceLabelLines(item, {
      compactMode,
      fontSize: safeNumber(snapshot.layout?.sourceTemplateTitleSize, 28),
      maxWidth: currentChartLanguage() === "zh" ? 166 : 198,
    });
    const labelX = safeNumber(slice.labelX, usesPreDetailRevenueLayout ? leftX - sourceSummaryLabelGapX : sourceTemplateLabelX) + sourceShift.dx;
    const metricX = safeNumber(slice.metricX, sourceTemplateMetricX) + sourceShift.dx;
    return renderTemplateSourceAnnotation(item, slice, box, {
      density: "regular",
      labelLines,
      supportLines: [],
      labelX,
      labelAnchor: "end",
      metricX,
      metricAnchor: "start",
      metricPlacement: "above-ribbon",
      previousRibbonBottom:
        index > 0
          ? safeNumber(sourceSlices[index - 1]?.bottom) + editorOffsetForNode(`source-${index - 1}`).dy
          : null,
      ribbonTop: slice.top + sourceShift.dy,
      labelCenterY: slice.center + sourceShift.dy,
      clampLabelToBox: false,
      titleSize: safeNumber(snapshot.layout?.sourceTemplateTitleSize, 28),
      titleLineHeight: safeNumber(snapshot.layout?.sourceTemplateTitleLineHeight, 31),
      subtitleSize: safeNumber(snapshot.layout?.sourceTemplateSubtitleSize, 14),
      subtitleLineHeight: safeNumber(snapshot.layout?.sourceTemplateSubtitleLineHeight, 17),
      valueSize: safeNumber(snapshot.layout?.sourceTemplateValueSize, 24),
      yoySize: safeNumber(snapshot.layout?.sourceTemplateYoySize, 14),
      qoqSize: safeNumber(snapshot.layout?.sourceTemplateQoqSize, 14),
      titleColor: item.nodeColor || item.labelColor || dark,
      valueColor: item.nodeColor || item.valueColor || item.labelColor || dark,
    });
  };
  const renderTreeLabelBlock = (item, box, labelX, color, options = {}) => {
    const baseLayout = box.layout || {};
    const resolvedDensity = options.density || baseLayout.density || (box.height <= 76 ? "dense" : "regular");
    const layout = replicaTreeBlockLayout(item, {
      density: resolvedDensity,
      defaultMode: options.defaultMode || "negative-parentheses",
      titleFontSize: safeNumber(options.titleFontSize, baseLayout.titleFontSize),
      titleLineHeight: safeNumber(options.titleLineHeight, baseLayout.titleLineHeight),
      noteFontSize: safeNumber(options.noteFontSize, baseLayout.noteFontSize),
      noteLineHeight: safeNumber(options.noteLineHeight, baseLayout.noteLineHeight),
      titleMaxWidth: options.maxWidth,
      noteMaxWidth: options.maxWidth,
      fallbackMinHeight: safeNumber(options.fallbackMinHeight, baseLayout.minHeight),
      topPadding: safeNumber(options.topPadding, baseLayout.topPadding),
      noteGap: safeNumber(options.noteGap, baseLayout.noteGap),
    });
    const titleLines =
      options.maxWidth && !item?.titleLines?.length
        ? resolveBranchTitleLines(item, options.defaultMode || "negative-parentheses", layout.titleFontSize, options.maxWidth)
        : localizeChartLines(layout.titleLines);
    const noteLines =
      options.maxWidth && !item?.noteLines?.length
        ? resolveTreeNoteLines(item, layout.density, layout.noteFontSize, options.maxWidth)
        : localizeChartLines(layout.noteLines);
    const titleBlockHeight = titleLines.length * layout.titleLineHeight;
    const noteOffsetY = clamp(
      safeNumber(options.noteOffsetY, 0),
      -Math.max(layout.titleLineHeight * 0.5, 0),
      Math.max(layout.noteLineHeight, 0)
    );
    const effectiveNoteGap = noteLines.length ? layout.noteGap + noteOffsetY : 0;
    const noteBlockHeight = noteLines.length ? noteLines.length * layout.noteLineHeight + effectiveNoteGap : 0;
    const totalBlockHeight = titleBlockHeight + noteBlockHeight;
    const labelCenterY = safeNumber(options.labelCenterY, box.center);
    const titleStartY = labelCenterY - totalBlockHeight / 2 + layout.titleLineHeight * 0.8;
    const defaultAnchor = options.anchor || "start";
    const shouldCenterWrapped = options.centerWrapped !== false && (titleLines.length > 1 || noteLines.length > 1);
    const effectiveAnchor = shouldCenterWrapped ? "middle" : defaultAnchor;
    const titleBlockWidth = approximateTextBlockWidth(titleLines, layout.titleFontSize);
    const noteBlockWidth = approximateTextBlockWidth(noteLines, layout.noteFontSize);
    const effectiveBlockWidth = Math.max(titleBlockWidth, noteBlockWidth, 0);
    const effectiveLabelX =
      effectiveAnchor === "middle" && defaultAnchor === "start"
        ? labelX + Math.min(effectiveBlockWidth, safeNumber(options.maxWidth, effectiveBlockWidth || 0)) / 2
        : labelX;
    let html = svgTextBlock(effectiveLabelX, titleStartY, titleLines, {
      fill: color,
      fontSize: layout.titleFontSize,
      weight: 700,
      anchor: effectiveAnchor,
      lineHeight: layout.titleLineHeight,
      haloColor: background,
      haloWidth: 7,
    });
    if (noteLines.length) {
      html += svgTextBlock(
        effectiveLabelX,
        titleStartY + titleBlockHeight + effectiveNoteGap,
        noteLines,
        {
          fill: muted,
          fontSize: layout.noteFontSize,
          weight: 400,
          anchor: effectiveAnchor,
          lineHeight: layout.noteLineHeight,
          haloColor: background,
          haloWidth: 5,
        }
      );
    }
    return html;
  };
  function resolveRightBranchLabelSpec(item, terminalNodeX, terminalNodeWidth, options = {}) {
    const labelX = safeNumber(options.labelX, terminalNodeX + terminalNodeWidth + rightBranchLabelGapX);
    const baseMaxWidth = Math.max(safeNumber(options.maxWidth, width - labelX - rightLabelPaddingRight), 120);
    const density = options.density || "regular";
    const titleFontSize = safeNumber(options.titleFontSize, safeNumber(snapshot.layout?.sourceTemplateTitleSize, 28));
    const titleLineHeight = safeNumber(
      options.titleLineHeight,
      safeNumber(snapshot.layout?.sourceTemplateTitleLineHeight, Math.max(Math.round(titleFontSize * 1.1), titleFontSize + 2))
    );
    const localizedTitle = currentChartLanguage() === "zh" ? localizeChartItemName(item) : String(item?.name || "");
    const configuredWrapMaxWidth = safeNumber(
      options.wrapMaxWidth,
      currentChartLanguage() === "zh"
        ? safeNumber(snapshot.layout?.rightBranchWrapMaxWidthZh, 136)
        : safeNumber(snapshot.layout?.rightBranchWrapMaxWidthEn, 196)
    );
    let wrapMaxWidth = Math.min(baseMaxWidth, configuredWrapMaxWidth);
    if (currentChartLanguage() === "zh" && localizedTitle && isCjkLabelText(localizedTitle)) {
      const condensedTitle = localizedTitle.replace(/\s+/g, "");
      const titleCharCount = [...condensedTitle].filter((char) => !/[()]/.test(char)).length;
      const shortSingleLineChars = Math.max(
        1,
        safeNumber(snapshot.layout?.rightBranchShortCjkSingleLineChars, density === "dense" ? 6 : 7)
      );
      const mediumSingleLineChars = Math.max(
        shortSingleLineChars,
        safeNumber(snapshot.layout?.rightBranchMediumCjkSingleLineChars, shortSingleLineChars + 1)
      );
      const desiredSingleLineWidth =
        approximateTextWidth(localizedTitle, titleFontSize) +
        safeNumber(snapshot.layout?.rightBranchShortCjkSingleLinePadX, 12);
      if (titleCharCount <= shortSingleLineChars) {
        wrapMaxWidth = Math.min(baseMaxWidth, Math.max(wrapMaxWidth, desiredSingleLineWidth));
      } else if (
        titleCharCount <= mediumSingleLineChars &&
        desiredSingleLineWidth <=
          baseMaxWidth * clamp(safeNumber(snapshot.layout?.rightBranchMediumCjkSingleLineWidthUtilization, 0.92), 0.72, 1)
      ) {
        wrapMaxWidth = Math.min(baseMaxWidth, Math.max(wrapMaxWidth, desiredSingleLineWidth));
      }
    }
    const sharedGrowthNoteSize = safeNumber(
      snapshot.layout?.sourceTemplateYoySize,
      safeNumber(snapshot.layout?.sourceTemplateQoqSize, 14)
    );
    const sharedGrowthNoteLineHeight = Math.max(
      safeNumber(snapshot.layout?.sourceTemplateSubtitleLineHeight, currentChartLanguage() === "zh" ? 17 : 18),
      sharedGrowthNoteSize + (currentChartLanguage() === "zh" ? 3 : 4)
    );
    const noteFontSize = safeNumber(options.noteFontSize, sharedGrowthNoteSize);
    const noteLineHeight = safeNumber(options.noteLineHeight, sharedGrowthNoteLineHeight);
    const noteGap = safeNumber(
      options.noteGap,
      safeNumber(snapshot.layout?.rightBranchNoteGapY, currentChartLanguage() === "zh" ? 2 : 3)
    );
    const noteOffsetY = safeNumber(
      options.noteOffsetY,
      safeNumber(snapshot.layout?.rightBranchNoteOffsetY, currentChartLanguage() === "zh" ? -12 : -10)
    );
    const layout = replicaTreeBlockLayout(item, {
      density,
      defaultMode: options.defaultMode || "negative-parentheses",
      titleFontSize,
      titleLineHeight,
      noteFontSize,
      noteLineHeight,
      noteGap,
      titleMaxWidth: wrapMaxWidth,
      noteMaxWidth: wrapMaxWidth,
      fallbackMinHeight: safeNumber(options.fallbackMinHeight, density === "dense" ? 42 : 52),
    });
    const titleLines =
      options.maxWidth && !item?.titleLines?.length
        ? resolveBranchTitleLines(item, options.defaultMode || "negative-parentheses", titleFontSize, wrapMaxWidth)
        : localizeChartLines(layout.titleLines);
    const noteLines =
      options.maxWidth && !item?.noteLines?.length
        ? resolveTreeNoteLines(item, layout.density, noteFontSize, wrapMaxWidth)
        : localizeChartLines(layout.noteLines);
    return {
      labelX,
      maxWidth: wrapMaxWidth,
      titleFontSize,
      titleLineHeight,
      noteFontSize,
      noteLineHeight,
      noteGap,
      noteOffsetY,
      blockWidth: Math.max(
        approximateTextBlockWidth(titleLines, titleFontSize),
        approximateTextBlockWidth(noteLines, noteFontSize),
        1
      ),
      collisionHeight: Math.max(
        safeNumber(options.minCollisionHeight, 0),
        layout.totalHeight + noteOffsetY + safeNumber(options.collisionPaddingY, currentChartLanguage() === "zh" ? 18 : 14)
      ),
    };
  }
  const sampleXsAcrossRect = (rect, minX, maxX, count = 9) => {
    if (!rect) return [];
    const left = clamp(rect.left + 1, minX, maxX);
    const right = clamp(rect.right - 1, minX, maxX);
    if (!(right >= left)) return [];
    if (right <= left + 0.5) return [left];
    return Array.from({ length: count }, (_unused, index) =>
      clamp(left + ((right - left) * index) / Math.max(count - 1, 1), minX, maxX)
    ).filter((value, index, values) => Number.isFinite(value) && (index === 0 || Math.abs(value - values[index - 1]) > 0.5));
  };
  const resolveRightBranchLabelCenterY = (labelSpec, preferredCenterY, options = {}) => {
    if (options.lockLabelCenterY) return preferredCenterY;
    const flowModel = options.avoidFlowModel;
    if (!flowModel) return preferredCenterY;
    const clearanceY = Math.max(scaleY(safeNumber(options.ribbonClearanceY, 10)), 0);
    const labelPadX = scaleY(safeNumber(options.labelPadX, 8));
    const minCenterY = safeNumber(options.minLabelCenterY, preferredCenterY - scaleY(safeNumber(options.maxAutoShiftY, 42)));
    const maxCenterY = safeNumber(options.maxLabelCenterY, preferredCenterY + scaleY(safeNumber(options.maxAutoShiftY, 42)));
    if (!(maxCenterY >= minCenterY)) return preferredCenterY;
    const rectForCenterY = (centerY) => ({
      left: labelSpec.labelX - labelPadX,
      right: labelSpec.labelX + labelSpec.blockWidth + labelPadX,
      top: centerY - labelSpec.collisionHeight / 2,
      bottom: centerY + labelSpec.collisionHeight / 2,
    });
    const overlapScore = (centerY) => {
      const rect = rectForCenterY(centerY);
      const sampleXs = sampleXsAcrossRect(
        rect,
        Math.min(flowModel.x0, flowModel.x1),
        Math.max(flowModel.x0, flowModel.x1)
      );
      let hitCount = 0;
      let overlapDepth = 0;
      sampleXs.forEach((sampleX) => {
        const envelope = flowEnvelopeAtX(
          sampleX,
          flowModel.x0,
          flowModel.sourceTop,
          flowModel.sourceBottom,
          flowModel.x1,
          flowModel.targetTop,
          flowModel.targetTop + flowModel.targetHeight,
          flowModel.options
        );
        if (!envelope) return;
        const overlapTop = Math.max(rect.top, envelope.top - clearanceY);
        const overlapBottom = Math.min(rect.bottom, envelope.bottom + clearanceY);
        const overlap = overlapBottom - overlapTop;
        if (overlap > 0) {
          hitCount += 1;
          overlapDepth += overlap;
        }
      });
      return {
        hitCount,
        overlapDepth,
        shiftDistance: Math.abs(centerY - preferredCenterY),
      };
    };
    const candidateCenters = [
      preferredCenterY,
      preferredCenterY - scaleY(12),
      preferredCenterY + scaleY(12),
      preferredCenterY - scaleY(24),
      preferredCenterY + scaleY(24),
      preferredCenterY - scaleY(36),
      preferredCenterY + scaleY(36),
      minCenterY,
      maxCenterY,
    ]
      .map((value) => clamp(value, minCenterY, maxCenterY))
      .filter((value, index, values) => values.findIndex((candidate) => Math.abs(candidate - value) < 0.5) === index);
    let bestCenterY = preferredCenterY;
    let bestScore = null;
    candidateCenters.forEach((candidateCenterY) => {
      const score = overlapScore(candidateCenterY);
      if (
        !bestScore ||
        score.hitCount < bestScore.hitCount ||
        (score.hitCount === bestScore.hitCount && score.overlapDepth < bestScore.overlapDepth - 0.01) ||
        (score.hitCount === bestScore.hitCount &&
          Math.abs(score.overlapDepth - bestScore.overlapDepth) <= 0.01 &&
          score.shiftDistance < bestScore.shiftDistance)
      ) {
        bestCenterY = candidateCenterY;
        bestScore = score;
      }
    });
    return bestCenterY;
  };
  const renderRightBranchLabel = (item, box, terminalNodeX, terminalNodeWidth, color, options = {}) =>
    {
      const labelSpec = resolveRightBranchLabelSpec(item, terminalNodeX, terminalNodeWidth, options);
      const preferredLabelCenterY = safeNumber(options.labelCenterY, box.center);
      const resolvedLabelCenterY = resolveRightBranchLabelCenterY(labelSpec, preferredLabelCenterY, options);
      return renderTreeLabelBlock(item, box, labelSpec.labelX, color, {
        ...options,
        anchor: "start",
        centerWrapped: options.centerWrapped !== false,
        maxWidth: labelSpec.maxWidth,
        titleFontSize: labelSpec.titleFontSize,
        titleLineHeight: labelSpec.titleLineHeight,
        noteFontSize: labelSpec.noteFontSize,
        noteLineHeight: labelSpec.noteLineHeight,
        noteGap: labelSpec.noteGap,
        noteOffsetY: labelSpec.noteOffsetY,
        labelCenterY: resolvedLabelCenterY,
      });
    };
  const renderRightSummaryLabel = (lines, labelX, labelCenterY) => {
    const blockHeight = lines.reduce((sum, line, index) => sum + line.size + (index < lines.length - 1 ? line.gapAfter : 0), 0);
    let cursor = labelCenterY - blockHeight / 2;
    return lines
      .map((line, index) => {
        cursor += line.size;
        const markup = `<text x="${labelX}" y="${cursor}" text-anchor="start" font-size="${line.size}" font-weight="${line.weight}" fill="${line.color}" paint-order="stroke fill" stroke="${background}" stroke-width="${line.strokeWidth}" stroke-linejoin="round">${escapeHtml(line.text)}</text>`;
        if (index < lines.length - 1) cursor += line.gapAfter;
        return markup;
      })
      .join("");
  };
  const rightSummaryObstacleRect = (lines, labelX, labelCenterY, padding = scaleY(10)) => {
    const blockHeight = lines.reduce((sum, line, index) => sum + line.size + (index < lines.length - 1 ? line.gapAfter : 0), 0);
    const blockWidth = Math.max(...lines.map((line) => approximateTextWidth(line.text, line.size)), 1);
    return {
      left: labelX - padding,
      right: labelX + blockWidth + padding,
      top: labelCenterY - blockHeight / 2 - padding,
      bottom: labelCenterY + blockHeight / 2 + padding,
    };
  };
  const renderTerminalCapRibbon = ({
    sourceX,
    sourceTop,
    sourceBottom,
    capX,
    capWidth,
    targetTop,
    targetHeight,
    flowColor,
    capColor,
      branchOptions = {},
      opacity = 0.97,
  }) => {
    const sourceCoverInset = Math.max(safeNumber(branchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)), 0);
    const mergedBranchOptions = {
      ...mergeOutflowRibbonOptions(branchOptions),
      endCapWidth: 0,
      targetCoverInsetX: safeNumber(branchOptions.targetCoverInsetX, safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)),
    };
    let html = `<path d="${outboundFlowPath(
      sourceX - sourceCoverInset,
      sourceTop,
      sourceBottom,
      capX,
      targetTop,
      targetTop + targetHeight,
      mergedBranchOptions
    )}" fill="${flowColor}" opacity="${opacity}"></path>`;
    if (capColor) {
      html += `<rect x="${capX.toFixed(1)}" y="${targetTop.toFixed(1)}" width="${capWidth.toFixed(1)}" height="${targetHeight.toFixed(1)}" fill="${capColor}"></rect>`;
    }
    return html;
  };
  const mirrorFlowBoundaryOptions = (options = {}) => ({
    ...options,
    sourceHoldFactor: safeNumber(options.targetHoldFactor, options.sourceHoldFactor),
    minSourceHoldLength: safeNumber(options.minTargetHoldLength, options.minSourceHoldLength),
    maxSourceHoldLength: safeNumber(options.maxTargetHoldLength, options.maxSourceHoldLength),
    sourceHoldLength:
      options.targetHoldLength !== null && options.targetHoldLength !== undefined
        ? safeNumber(options.targetHoldLength)
        : undefined,
    targetHoldFactor: safeNumber(options.sourceHoldFactor, options.targetHoldFactor),
    minTargetHoldLength: safeNumber(options.minSourceHoldLength, options.minTargetHoldLength),
    maxTargetHoldLength: safeNumber(options.maxSourceHoldLength, options.maxTargetHoldLength),
    targetHoldLength:
      options.sourceHoldLength !== null && options.sourceHoldLength !== undefined
        ? safeNumber(options.sourceHoldLength)
        : undefined,
    sourceHoldDeltaReduction: safeNumber(options.targetHoldDeltaReduction, options.sourceHoldDeltaReduction),
    targetHoldDeltaReduction: safeNumber(options.sourceHoldDeltaReduction, options.targetHoldDeltaReduction),
    minAdaptiveSourceHoldLength: safeNumber(options.minAdaptiveTargetHoldLength, options.minAdaptiveSourceHoldLength),
    minAdaptiveTargetHoldLength: safeNumber(options.minAdaptiveSourceHoldLength, options.minAdaptiveTargetHoldLength),
    startCurveFactor: safeNumber(options.endCurveFactor, options.startCurveFactor),
    endCurveFactor: safeNumber(options.startCurveFactor, options.endCurveFactor),
    minStartCurveFactor: safeNumber(options.minEndCurveFactor, options.minStartCurveFactor),
    maxStartCurveFactor: safeNumber(options.maxEndCurveFactor, options.maxStartCurveFactor),
    minEndCurveFactor: safeNumber(options.minStartCurveFactor, options.minEndCurveFactor),
    maxEndCurveFactor: safeNumber(options.maxStartCurveFactor, options.maxEndCurveFactor),
  });
  const buildFlowBoundarySegment = (startX, startY, endX, endY, options = {}) => {
    const geometry = resolveFlowCurveGeometry(startX, startY, startY, endX, endY, endY, options);
    if (Math.abs(geometry.targetJoinX - geometry.sourceJoinX) <= 0.5) {
      return `L ${endX} ${endY}`;
    }
    return [
      `L ${geometry.sourceJoinX} ${startY}`,
      smoothBoundaryCurve(geometry.sourceJoinX, geometry.targetJoinX, startY, endY, {
        startCurve: geometry.topStartCurve,
        endCurve: geometry.topEndCurve,
      }),
      `L ${endX} ${endY}`,
    ].join(" ");
  };
  const selectedEditorNodeId = String(snapshot.editorSelectedNodeId || "");
  const setAutoLayoutNodeOffset = (nodeId, nextOffset = {}) => {
    if (!nodeId) return;
    const previous = autoLayoutOffsetForNode(nodeId);
    const resolvedOffset = {
      dx: safeNumber(nextOffset.dx, previous.dx),
      dy: safeNumber(nextOffset.dy, previous.dy),
    };
    if (Math.abs(resolvedOffset.dx) <= 0.01 && Math.abs(resolvedOffset.dy) <= 0.01) {
      delete autoLayoutNodeOffsets[nodeId];
      return;
    }
    autoLayoutNodeOffsets[nodeId] = resolvedOffset;
  };
  const editorOffsetForNode = (nodeId, options = {}) => combinedNodeOffsetFor(nodeId, options);
  const editableNodeFrame = (nodeId, x, y, widthValue, heightValue) => {
    const offset = editorOffsetForNode(nodeId);
    return {
      id: nodeId,
      x: x + offset.dx,
      y: y + offset.dy,
      width: widthValue,
      height: heightValue,
      left: x + offset.dx,
      right: x + offset.dx + widthValue,
      top: y + offset.dy,
      bottom: y + offset.dy + heightValue,
      centerX: x + offset.dx + widthValue / 2,
      centerY: y + offset.dy + heightValue / 2,
      dx: offset.dx,
      dy: offset.dy,
    };
  };
  const resolveDeductionTerminalSourceSlice = (index, sourceSlice) =>
    index === 0 && positiveAdjustments.length && !positiveAbove
      ? {
          ...sourceSlice,
          center: clamp(
            sourceSlice.center + positiveTaxSourceDropY,
            opDeductionSourceBand.top + sourceSlice.height / 2,
            opDeductionSourceBand.bottom - sourceSlice.height / 2
          ),
        }
      : sourceSlice;
  const resolveDeductionTerminalBranchOptions = (index) =>
    index === 0 && positiveAdjustments.length && !positiveAbove
      ? {
          curveFactor: 0.52,
          startCurveFactor: 0.16,
          endCurveFactor: 0.24,
          minStartCurveFactor: 0.12,
          maxStartCurveFactor: 0.24,
          minEndCurveFactor: 0.18,
          maxEndCurveFactor: 0.3,
          deltaScale: 0.92,
          deltaInfluence: 0.046,
          sourceHoldFactor: 0.036,
          maxSourceHoldLength: 12,
        }
      : {
          curveFactor: 0.5,
          startCurveFactor: 0.16,
          endCurveFactor: 0.24,
          minStartCurveFactor: 0.12,
          maxStartCurveFactor: 0.24,
          minEndCurveFactor: 0.16,
          maxEndCurveFactor: 0.3,
          deltaScale: 0.9,
          deltaInfluence: 0.05,
          sourceHoldFactor: 0.034,
          maxSourceHoldLength: 10,
        };
  const resolveNegativeTerminalGeometry = (entry, options = {}) => {
    if (!entry?.box || !entry?.sourceSlice) return null;
    const sourceSlice =
      entry.lane === "deduction"
        ? resolveDeductionTerminalSourceSlice(entry.index, entry.sourceSlice)
        : entry.sourceSlice;
    const resolvedCenter = safeNumber(options.center, entry.box.center);
    const bridge = constantThicknessBridge(sourceSlice, resolvedCenter, entry.minHeight, entry.sourceTop, entry.sourceBottom);
    const includeManualOffsets = options.includeManualOffsets === true;
    const sourceShift = editorOffsetForNode(entry.sourceNodeId, { includeManual: includeManualOffsets });
    const targetShift = editorOffsetForNode(entry.targetNodeId, { includeManual: includeManualOffsets });
    const targetTop = bridge.targetTop + targetShift.dy;
    return {
      bridge,
      sourceTop: bridge.sourceTop + sourceShift.dy,
      sourceBottom: bridge.sourceBottom + sourceShift.dy,
      targetTop,
      targetHeight: bridge.targetHeight,
      targetBottom: targetTop + bridge.targetHeight,
      targetCenter: targetTop + bridge.targetHeight / 2,
    };
  };
  const shiftedInterval = (topValue, bottomValue, nodeId) => {
    const offset = editorOffsetForNode(nodeId);
    return {
      top: topValue + offset.dy,
      bottom: bottomValue + offset.dy,
      height: bottomValue - topValue,
      center: (topValue + bottomValue) / 2 + offset.dy,
    };
  };
  const renderEditableNodeRect = (frame, fill, options = {}) => {
    const hitPaddingX = safeNumber(options.hitPaddingX, Math.max(12, (28 - frame.width) / 2));
    const hitPaddingY = safeNumber(options.hitPaddingY, Math.max(10, (24 - frame.height) / 2));
    const isSelected = selectedEditorNodeId === frame.id;
    const visibleStroke = isSelected ? ` stroke="${rgba("#175C8E", 0.8)}" stroke-width="3"` : "";
    return `
      <rect x="${frame.x.toFixed(1)}" y="${frame.y.toFixed(1)}" width="${frame.width.toFixed(1)}" height="${frame.height.toFixed(1)}" fill="${fill}"${visibleStroke}></rect>
      <rect x="${(frame.x - hitPaddingX).toFixed(1)}" y="${(frame.y - hitPaddingY).toFixed(1)}" width="${(frame.width + hitPaddingX * 2).toFixed(1)}" height="${(frame.height + hitPaddingY * 2).toFixed(1)}" fill="transparent" opacity="0.001" data-edit-hit="true" data-edit-node-id="${escapeHtml(frame.id)}"></rect>
    `;
  };
  const standardTerminalBranchOptions = {
    curveFactor: 0.56,
    startCurveFactor: 0.18,
    endCurveFactor: 0.3,
    minStartCurveFactor: 0.14,
    maxStartCurveFactor: 0.28,
    minEndCurveFactor: 0.2,
    maxEndCurveFactor: 0.34,
    deltaScale: 0.96,
    deltaInfluence: 0.042,
    sourceHoldFactor: 0.03,
    minSourceHoldLength: 4,
    maxSourceHoldLength: 8,
    targetHoldFactor: 0.072,
    minTargetHoldLength: 8,
    maxTargetHoldLength: 22,
    sourceHoldDeltaReduction: 0.72,
    targetHoldDeltaReduction: 0.82,
    minAdaptiveSourceHoldLength: 1.5,
    minAdaptiveTargetHoldLength: 2.5,
    holdDeltaScale: 0.46,
  };
  const resolveAdaptiveNegativeTerminalBranchOptions = (baseOptions, sourceTop, sourceBottom, targetTop, targetHeight, options = {}) => {
    const sourceCenter = (safeNumber(sourceTop, 0) + safeNumber(sourceBottom, 0)) / 2;
    const targetCenter = safeNumber(targetTop, 0) + safeNumber(targetHeight, 0) / 2;
    const deltaY = Math.abs(targetCenter - sourceCenter);
    const count = Math.max(safeNumber(options.count, 1), 1);
    const index = clamp(safeNumber(options.index, 0), 0, Math.max(count - 1, 0));
    const laneBias = safeNumber(options.laneBias, 0);
    const orderNorm = count <= 1 ? 0 : index / Math.max(count - 1, 1);
    const countNorm = clamp((count - 1) / 3, 0, 1);
    const deltaNorm = clamp(deltaY / scaleY(safeNumber(options.referenceDeltaY, 196)), 0, 1.8);
    const divergenceStrength = clamp(
      deltaNorm * safeNumber(options.deltaStrengthFactor, 0.92) +
        orderNorm * safeNumber(options.orderStrengthFactor, 0.28) +
        laneBias +
        countNorm * safeNumber(options.countStrengthFactor, 0.14),
      0,
      1.32
    );
    const minSourceHoldLength = Math.max(
      0,
      safeNumber(baseOptions.minSourceHoldLength, 0) -
        safeNumber(options.minSourceHoldReduction, 7) * divergenceStrength
    );
    const maxSourceHoldLength = Math.max(
      minSourceHoldLength,
      safeNumber(baseOptions.maxSourceHoldLength, minSourceHoldLength) -
        safeNumber(options.maxSourceHoldReduction, 12) * divergenceStrength
    );
    return {
      ...baseOptions,
      curveFactor: clamp(
        safeNumber(baseOptions.curveFactor, 0.56) + safeNumber(options.curveFactorGain, 0.08) * divergenceStrength,
        0.5,
        0.9
      ),
      startCurveFactor: clamp(
        safeNumber(baseOptions.startCurveFactor, 0.18) + safeNumber(options.startCurveGain, 0.14) * divergenceStrength,
        safeNumber(baseOptions.minStartCurveFactor, 0.14),
        safeNumber(baseOptions.maxStartCurveFactor, 0.28) + safeNumber(options.maxStartCurveBoost, 0.08) * divergenceStrength
      ),
      endCurveFactor: clamp(
        safeNumber(baseOptions.endCurveFactor, 0.3) + safeNumber(options.endCurveGain, 0.1) * divergenceStrength,
        safeNumber(baseOptions.minEndCurveFactor, 0.2),
        safeNumber(baseOptions.maxEndCurveFactor, 0.34) + safeNumber(options.maxEndCurveBoost, 0.08) * divergenceStrength
      ),
      minStartCurveFactor: clamp(
        safeNumber(baseOptions.minStartCurveFactor, 0.14) + safeNumber(options.minStartCurveGain, 0.05) * divergenceStrength,
        0.08,
        0.42
      ),
      maxStartCurveFactor: clamp(
        safeNumber(baseOptions.maxStartCurveFactor, 0.28) + safeNumber(options.maxStartCurveGain, 0.08) * divergenceStrength,
        0.16,
        0.52
      ),
      minEndCurveFactor: clamp(
        safeNumber(baseOptions.minEndCurveFactor, 0.2) + safeNumber(options.minEndCurveGain, 0.04) * divergenceStrength,
        0.14,
        0.42
      ),
      maxEndCurveFactor: clamp(
        safeNumber(baseOptions.maxEndCurveFactor, 0.34) + safeNumber(options.maxEndCurveGain, 0.08) * divergenceStrength,
        0.24,
        0.58
      ),
      deltaScale: clamp(
        safeNumber(baseOptions.deltaScale, 0.96) - safeNumber(options.deltaScaleReduction, 0.1) * divergenceStrength,
        0.68,
        1.08
      ),
      deltaInfluence: clamp(
        safeNumber(baseOptions.deltaInfluence, 0.042) + safeNumber(options.deltaInfluenceGain, 0.022) * divergenceStrength,
        0.018,
        0.14
      ),
      sourceHoldFactor: clamp(
        safeNumber(baseOptions.sourceHoldFactor, 0.03) - safeNumber(options.sourceHoldReduction, 0.022) * divergenceStrength,
        0.004,
        0.08
      ),
      minSourceHoldLength,
      maxSourceHoldLength,
      sourceHoldDeltaReduction: clamp(
        safeNumber(baseOptions.sourceHoldDeltaReduction, 0.72) + safeNumber(options.sourceDeltaReductionGain, 0.12) * divergenceStrength,
        0,
        0.96
      ),
      holdDeltaScale: clamp(
        safeNumber(baseOptions.holdDeltaScale, 0.46) - safeNumber(options.holdDeltaScaleReduction, 0.08) * divergenceStrength,
        0.24,
        0.7
      ),
    };
  };
  const costBreakdownTerminalBranchOptions = {
    ...standardTerminalBranchOptions,
    curveFactor: 0.6,
    startCurveFactor: 0.13,
    endCurveFactor: 0.3,
    minStartCurveFactor: 0.1,
    maxStartCurveFactor: 0.2,
    minEndCurveFactor: 0.2,
    maxEndCurveFactor: 0.34,
    deltaScale: 0.9,
    deltaInfluence: 0.038,
    sourceHoldFactor: 0.062,
    minSourceHoldLength: 12,
    maxSourceHoldLength: 26,
    targetHoldFactor: 0.084,
    minTargetHoldLength: 10,
    maxTargetHoldLength: 24,
    sourceHoldDeltaReduction: 0.62,
    targetHoldDeltaReduction: 0.74,
    minAdaptiveSourceHoldLength: 3,
    minAdaptiveTargetHoldLength: 3,
    holdDeltaScale: 0.5,
  };
  const costBreakdownCrowdingNorm = clamp(lowerRightPressureY / scaleY(88), 0, 1);
  const costBreakdownEarlySplitMode = costBreakdownNearOpexColumn || costBreakdownCrowdingNorm >= 0.28;
  const resolvedCostBreakdownTerminalBranchOptions =
    costBreakdownSlices.length <= 2
      ? {
          ...costBreakdownTerminalBranchOptions,
          curveFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.84 : 0.74) : 0.68,
          startCurveFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.28 : 0.18) : 0.09,
          endCurveFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.46 : 0.38) : 0.34,
          minStartCurveFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.18 : 0.12) : 0.05,
          maxStartCurveFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.38 : 0.24) : 0.12,
          minEndCurveFactor: 0.22,
          maxEndCurveFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.5 : 0.4) : 0.36,
          deltaScale: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.72 : 0.78) : 0.88,
          deltaInfluence: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.042 : 0.032) : 0.05,
          sourceHoldFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.012 : 0.034) : 0.1,
          minSourceHoldLength: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 1 : 4) : 28,
          maxSourceHoldLength: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 8 : 16) : 44,
          targetHoldFactor: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.028 : 0.038) : 0.052,
          minTargetHoldLength: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 2 : 4) : 6,
          maxTargetHoldLength: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 7 : 9) : 12,
          sourceHoldDeltaReduction: costBreakdownEarlySplitMode ? 0.76 : 0,
          targetHoldDeltaReduction: costBreakdownEarlySplitMode ? 0.68 : 0.52,
          minAdaptiveSourceHoldLength: costBreakdownEarlySplitMode ? 1 : 22,
          minAdaptiveTargetHoldLength: 2,
          holdDeltaScale: costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.36 : 0.42) : 0.56,
        }
      : costBreakdownSlices.length === 3
        ? {
            ...costBreakdownTerminalBranchOptions,
            curveFactor: 0.64,
            startCurveFactor: 0.15,
            endCurveFactor: 0.32,
            sourceHoldFactor: 0.04,
            minSourceHoldLength: 8,
            maxSourceHoldLength: 16,
            targetHoldFactor: 0.074,
            maxTargetHoldLength: 20,
          }
        : costBreakdownTerminalBranchOptions;
  const refineOpexSplitSmoothness = () => {
    if (!opexBoxes.length || !opexSourceSlices.length) return;
    const currentOpexNodeShift = layoutReferenceOffsetFor("operating-expenses");
    const currentNodeOffsetY = currentOpexNodeShift.dy;
    const denseOpexStageBalance = !costBreakdownBoxes.length && opexBoxes.filter(Boolean).length >= 3;
    const relevantOpexIndexes = opexBoxes
      .map((box, index) => ({ box, index }))
      .filter((entry) => entry.box)
      .slice(0, Math.min(opexBoxes.length, denseOpexStageBalance ? 3 : 2))
      .map((entry) => entry.index);
    if (!relevantOpexIndexes.length) return;
    const currentTopGapY =
      Math.min(...relevantOpexIndexes.map((index) => safeNumber(opexBoxes[index]?.top, Infinity))) - (opexBottom + currentNodeOffsetY);
    const currentOpeningGapY = opexTop + currentNodeOffsetY - grossBottom;
    const currentAverageBranchDropY =
      relevantOpexIndexes.reduce((sum, index) => {
        const box = opexBoxes[index];
        const sourceSlice = opexSourceSlices[index] || opexSlices[index];
        if (!box || !sourceSlice) return sum;
        return sum + (safeNumber(box.center, 0) - (safeNumber(sourceSlice.center, 0) + currentNodeOffsetY));
      }, 0) / Math.max(relevantOpexIndexes.length, 1);
    const sampleXsAcrossRange = (left, right, count = 7) => {
      if (!(right > left)) return [left];
      return Array.from({ length: count }, (_value, index) => left + ((right - left) * index) / Math.max(count - 1, 1));
    };
    const evaluateCostBreakdownSummaryClearance = (nodeDropY, costShiftY) => {
      if (!(costBreakdownSharesOpexColumn && costBreakdownBoxes.length)) {
        return {
          deficitY: 0,
          minGapY: Infinity,
        };
      }
      const summaryObstacle = resolveOpexSummaryObstacleRect(
        {
          dx: currentOpexNodeShift.dx,
          dy: currentNodeOffsetY + nodeDropY,
        },
        0,
        {
          padX: safeNumber(snapshot.layout?.costBreakdownOpexRibbonObstaclePadX, 10),
          padY: safeNumber(snapshot.layout?.costBreakdownOpexRibbonObstaclePadY, 8),
        }
      );
      const sourceShift = layoutReferenceOffsetFor("cost");
      const ribbonClearanceY = scaleY(safeNumber(snapshot.layout?.costBreakdownOpexRibbonClearanceY, 10));
      const summaryClearanceY = scaleY(
        safeNumber(
          snapshot.layout?.costBreakdownOpexSummaryClearanceY,
          costBreakdownSlices.length === 2 && costBreakdownSharesOpexColumn ? 18 : 14
        )
      );
      const nodeClearanceY = scaleY(safeNumber(snapshot.layout?.costBreakdownOpexNodeClearanceY, 8));
      let minGapY = Infinity;
      let deficitY = 0;
      costBreakdownBoxes.forEach((box, index) => {
        const sourceSlice = costBreakdownSourceSlices[index] || costBreakdownSlices[index];
        if (!box || !sourceSlice) return;
        const targetShift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
        const shiftedCenter = safeNumber(box.center, 0) + costShiftY;
        const collisionHeight = Math.max(
          safeNumber(costBreakdownGapHeights[index], box.height),
          safeNumber(costBreakdownPackingHeights[index], box.height),
          safeNumber(box.height, 0),
          1
        );
        const collisionTop = shiftedCenter + targetShift.dy - collisionHeight / 2;
        const nodeTop = safeNumber(box.top, 0) + targetShift.dy + costShiftY;
        minGapY = Math.min(minGapY, collisionTop - summaryObstacle.bottom, nodeTop - summaryObstacle.bottom);
        deficitY = Math.max(
          deficitY,
          summaryObstacle.bottom + summaryClearanceY - collisionTop,
          summaryObstacle.bottom + nodeClearanceY - nodeTop
        );
        const sourceCoverInset = Math.max(
          safeNumber(resolvedCostBreakdownTerminalBranchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)),
          0
        );
        const mergedBranchOptions = {
          ...mergeOutflowRibbonOptions(resolvedCostBreakdownTerminalBranchOptions),
          endCapWidth: 0,
          targetCoverInsetX: safeNumber(
            resolvedCostBreakdownTerminalBranchOptions.targetCoverInsetX,
            safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)
          ),
        };
        const bridge = constantThicknessBridge(sourceSlice, shiftedCenter, 10, costTop, costBottom);
        const sourceX = grossX + nodeWidth + sourceShift.dx - sourceCoverInset;
        const sourceTop = bridge.sourceTop + sourceShift.dy;
        const sourceBottom = bridge.sourceBottom + sourceShift.dy;
        const targetX = costBreakdownX + targetShift.dx + mergedBranchOptions.targetCoverInsetX;
        const targetTop = bridge.targetTop + targetShift.dy + costShiftY;
        const targetBottom = targetTop + bridge.targetHeight;
        const overlapLeft = Math.max(summaryObstacle.left, sourceX + scaleY(4));
        const overlapRight = Math.min(summaryObstacle.right, targetX - scaleY(4));
        if (!(overlapRight > overlapLeft) || targetBottom <= summaryObstacle.top) return;
        sampleXsAcrossRange(overlapLeft, overlapRight).forEach((sampleX) => {
          const envelope = flowEnvelopeAtX(
            sampleX,
            sourceX,
            sourceTop,
            sourceBottom,
            targetX,
            targetTop,
            targetBottom,
            mergedBranchOptions
          );
          if (!envelope) return;
          minGapY = Math.min(minGapY, envelope.top - summaryObstacle.bottom);
          deficitY = Math.max(deficitY, summaryObstacle.bottom + ribbonClearanceY - envelope.top);
        });
      });
      return {
        deficitY: Math.max(deficitY, 0),
        minGapY,
      };
    };
    const currentCostClusterGapY = costBreakdownBoxes.length
      ? Math.min(
          ...costBreakdownBoxes.filter(Boolean).map((box, index) => {
            const shift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
            return safeNumber(box.top, Infinity) + shift.dy;
          })
        ) - (opexBottom + currentNodeOffsetY)
      : 0;
    const currentSummaryCostClearance = evaluateCostBreakdownSummaryClearance(0, 0);
    const branchSeverityThresholdY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothSeverityThresholdY, costBreakdownBoxes.length >= 2 ? 222 : 246)
    );
    const topGapThresholdY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothTopGapThresholdY, costBreakdownBoxes.length >= 2 ? 176 : 188)
    );
    const costClusterGapSeverityY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothCostClusterGapSeverityY, costBreakdownBoxes.length >= 2 ? 212 : 196)
    );
    const summaryGapSeverityY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothSummaryGapSeverityY, costBreakdownBoxes.length >= 2 ? 24 : 20)
    );
    const minOpeningGapY = scaleY(safeNumber(snapshot.layout?.opexSmoothMinOpeningGapY, denseOpexStageBalance ? 24 : 18));
    const preferredOpeningGapY = clamp(
      safeNumber(
        snapshot.layout?.opexSmoothPreferredOpeningGapResolvedY,
        Math.max(
          scaleY(safeNumber(snapshot.layout?.opexSmoothPreferredOpeningGapY, denseOpexStageBalance ? 44 : 30)),
          desiredGrossLowerSplitOpeningDeltaY *
            safeNumber(snapshot.layout?.opexSmoothPreferredOpeningGapMatchFactor, denseOpexStageBalance ? 1.08 : 0.94)
        )
      ),
      minOpeningGapY,
      scaleY(safeNumber(snapshot.layout?.opexSmoothMaxOpeningGapY, denseOpexStageBalance ? 76 : 60))
    );
    const openingGapSeverityY = Math.max(
      minOpeningGapY,
      preferredOpeningGapY - scaleY(safeNumber(snapshot.layout?.opexSmoothOpeningGapSeverityToleranceY, denseOpexStageBalance ? 8 : 6))
    );
    const preferredTopGapY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothPreferredNodeToTerminalGapY, costBreakdownBoxes.length >= 2 ? 104 : 100)
    );
    if (
      !(
        currentAverageBranchDropY > branchSeverityThresholdY ||
        currentTopGapY > topGapThresholdY ||
        currentOpeningGapY < openingGapSeverityY ||
        currentCostClusterGapY > costClusterGapSeverityY ||
        currentSummaryCostClearance.deficitY > 0.5 ||
        currentSummaryCostClearance.minGapY < summaryGapSeverityY
      )
    ) {
      return;
    }
    const costFollowFactor = costBreakdownBoxes.length
      ? clamp(
          safeNumber(snapshot.layout?.opexSmoothCostFollowFactor, costBreakdownBoxes.length >= 2 ? 1.04 : 0.94),
          0,
          1.34
        )
      : 0;
    const costShiftHeadroomY = costBreakdownBoxes.length
      ? Math.max(
          maxCollisionBasedGroupShiftDown(costBreakdownBoxes, costBreakdownPackingHeights, costBreakdownMaxY),
          maxActualBoxGroupShiftDown(costBreakdownBoxes, costBreakdownMaxY)
        )
      : 0;
    const nodeDropHeadroomFromCostY = costFollowFactor > 0.01 ? costShiftHeadroomY / costFollowFactor : Infinity;
    const denseNodeDropBoostY = denseOpexStageBalance
      ? Math.min(
          scaleY(safeNumber(snapshot.layout?.opexSmoothDenseNodeDropBoostMaxY, 34)),
          Math.max(preferredOpeningGapY - currentOpeningGapY, 0) * 0.82 +
            Math.max(currentTopGapY - preferredTopGapY, 0) * 0.18
        )
      : 0;
    const nodeDropMaxY = Math.max(
      0,
      Math.min(
        scaleY(safeNumber(snapshot.layout?.opexSmoothNodeDropMaxY, costBreakdownBoxes.length ? 92 : denseOpexStageBalance ? 86 : 34)) +
          denseNodeDropBoostY,
        nodeDropHeadroomFromCostY
      )
    );
    const costExtraShiftMaxY =
      costBreakdownSharesOpexColumn && costBreakdownBoxes.length
        ? Math.max(
            0,
            Math.min(
              scaleY(safeNumber(snapshot.layout?.opexSmoothCostExtraShiftMaxY, costBreakdownBoxes.length >= 2 ? 42 : 28)),
              costShiftHeadroomY
            )
          )
        : 0;
    const rightLaneEntries = [
      ...deductionBoxes.filter(Boolean).map((box) => ({ lane: "deduction", box })),
      ...opexBoxes.filter(Boolean).map((box) => ({ lane: "opex", box })),
      ...(costBreakdownSharesOpexColumn ? costBreakdownBoxes.filter(Boolean).map((box) => ({ lane: "costBreakdown", box })) : []),
    ].sort((left, right) => left.box.center - right.box.center);
    const firstOpexEntryIndex = rightLaneEntries.findIndex((entry) => entry.lane === "opex");
    const previousNonOpexEntry =
      firstOpexEntryIndex > 0
        ? [...rightLaneEntries.slice(0, firstOpexEntryIndex)].reverse().find((entry) => entry.lane !== "opex")
        : null;
    const opexLiftFloorTop = previousNonOpexEntry
      ? previousNonOpexEntry.box.bottom + rightTerminalSeparationGap
      : Math.max(
          rightTerminalSummaryObstacleBottom,
          netBottom + scaleY(safeNumber(snapshot.layout?.opexSmoothMinOffsetFromNetY, 18))
        );
    const currentOpexGroupTop = Math.min(...opexBoxes.filter(Boolean).map((box) => box.top));
    const opexLiftMaxY = Math.max(
      0,
      Math.min(
        scaleY(safeNumber(snapshot.layout?.opexSmoothTerminalLiftMaxY, 72)),
        Math.max(currentOpexGroupTop - opexLiftFloorTop, 0)
      )
    );
    if (!(nodeDropMaxY > 0.5 || opexLiftMaxY > 0.5 || costExtraShiftMaxY > 0.5)) return;
    const buildAxisCandidates = (maxY, segments = 6) =>
      Array.from(
        new Set(
          [0, maxY, ...Array.from({ length: segments + 1 }, (_unused, index) => (maxY * index) / Math.max(segments, 1))].map(
            (value) => Number(clamp(value, 0, maxY).toFixed(2))
          )
        )
      );
    const nodeDropCandidates = buildAxisCandidates(nodeDropMaxY, costBreakdownBoxes.length ? 6 : 4);
    const opexLiftCandidates = buildAxisCandidates(opexLiftMaxY, 6);
    const costExtraShiftCandidates = buildAxisCandidates(costExtraShiftMaxY, costBreakdownBoxes.length ? 4 : 1);
    const minTopGapY = scaleY(safeNumber(snapshot.layout?.opexSmoothMinNodeToTerminalGapY, 84));
    const maxTopGapY = scaleY(safeNumber(snapshot.layout?.opexSmoothMaxNodeToTerminalGapY, costBreakdownBoxes.length >= 2 ? 176 : 164));
    const preferredInboundDeltaY = scaleY(safeNumber(snapshot.layout?.opexSmoothPreferredInboundDeltaY, 22));
    const maxInboundDeltaY = scaleY(safeNumber(snapshot.layout?.opexSmoothMaxInboundDeltaY, 54));
    const preferredBranchDropBaseY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothPreferredBranchDropBaseY, opexBoxes.length <= 2 ? 148 : 140)
    );
    const preferredBranchDropStepY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothPreferredBranchDropStepY, opexBoxes.length <= 2 ? 134 : 88)
    );
    const minCostClusterGapY = scaleY(safeNumber(snapshot.layout?.opexSmoothMinCostClusterGapY, 116));
    const preferredCostClusterGapY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothPreferredCostClusterGapY, costBreakdownBoxes.length >= 2 ? 160 : 138)
    );
    const minSummaryClearanceGapY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothMinSummaryClearanceGapY, costBreakdownBoxes.length >= 2 ? 28 : 24)
    );
    const preferredSummaryClearanceGapY = scaleY(
      safeNumber(snapshot.layout?.opexSmoothPreferredSummaryClearanceGapY, costBreakdownBoxes.length >= 2 ? 46 : 38)
    );
    const evaluateCandidate = (nodeDropY, opexLiftY, costExtraShiftY) => {
      const costShiftY = Math.min(costShiftHeadroomY, nodeDropY * costFollowFactor + costExtraShiftY);
      const topGapY =
        Math.min(...relevantOpexIndexes.map((index) => safeNumber(opexBoxes[index]?.top, Infinity) - opexLiftY)) -
        (opexBottom + currentNodeOffsetY + nodeDropY);
      const openingGapY = opexTop + currentNodeOffsetY + nodeDropY - grossBottom;
      let score = 0;
      relevantOpexIndexes.forEach((index, orderIndex) => {
        const box = opexBoxes[index];
        const sourceSlice = opexSourceSlices[index] || opexSlices[index];
        if (!box || !sourceSlice) return;
        const branchDropY =
          safeNumber(box.center, 0) - opexLiftY - (safeNumber(sourceSlice.center, 0) + currentNodeOffsetY + nodeDropY);
        const preferredBranchDropY =
          preferredBranchDropBaseY +
          orderIndex * preferredBranchDropStepY +
          Math.min(Math.max(safeNumber(sourceSlice.height, 0) - 28, 0), scaleY(42)) * 0.18;
        const minBranchDropY = scaleY(
          safeNumber(snapshot.layout?.opexSmoothMinBranchDropBaseY, 112) +
            orderIndex * safeNumber(snapshot.layout?.opexSmoothMinBranchDropStepY, 42)
        );
        const branchWeight = orderIndex === 0 ? (denseOpexStageBalance ? 5.6 : 4.4) : denseOpexStageBalance ? 2.6 : 2.1;
        score += Math.abs(branchDropY - preferredBranchDropY) * branchWeight;
        score += Math.max(minBranchDropY - branchDropY, 0) * (orderIndex === 0 ? 58 : 34);
      });
      const inboundDeltaY = Math.abs(opexInboundTargetBand.center + currentNodeOffsetY + nodeDropY - grossExpenseSourceBand.center);
      score += Math.max(minOpeningGapY - openingGapY, 0) * (denseOpexStageBalance ? 320 : 210);
      score += Math.abs(openingGapY - preferredOpeningGapY) * (denseOpexStageBalance ? 9.6 : 4.4);
      score += Math.max(minTopGapY - topGapY, 0) * 210;
      score += Math.max(topGapY - maxTopGapY, 0) * 44;
      score += Math.abs(topGapY - preferredTopGapY) * 6.4;
      score += Math.abs(inboundDeltaY - preferredInboundDeltaY) * 1.2;
      score += Math.max(inboundDeltaY - maxInboundDeltaY, 0) * 12;
      if (costBreakdownBoxes.length) {
        const summaryClearance = evaluateCostBreakdownSummaryClearance(nodeDropY, costShiftY);
        const costClusterGapY =
          Math.min(
            ...costBreakdownBoxes.filter(Boolean).map((box, index) => {
              const shift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
              return box.top + shift.dy + costShiftY;
            })
          ) - (opexBottom + currentNodeOffsetY + nodeDropY);
        score += Math.max(minCostClusterGapY - costClusterGapY, 0) * 90;
        score += Math.abs(costClusterGapY - preferredCostClusterGapY) * 1.9;
        score += summaryClearance.deficitY * 320;
        if (Number.isFinite(summaryClearance.minGapY)) {
          score += Math.max(minSummaryClearanceGapY - summaryClearance.minGapY, 0) * 170;
          score += Math.abs(summaryClearance.minGapY - preferredSummaryClearanceGapY) * 4.8;
        }
      }
      score += nodeDropY * 0.08 + opexLiftY * 0.1 + costExtraShiftY * 0.22;
      return {
        score,
        costShiftY,
      };
    };
    const baselineCandidate = evaluateCandidate(0, 0, 0);
    let bestCandidate = {
      nodeDropY: 0,
      opexLiftY: 0,
      costShiftY: 0,
      score: baselineCandidate.score,
    };
    nodeDropCandidates.forEach((nodeDropY) => {
      opexLiftCandidates.forEach((opexLiftY) => {
        costExtraShiftCandidates.forEach((costExtraShiftY) => {
          const candidate = evaluateCandidate(nodeDropY, opexLiftY, costExtraShiftY);
          if (candidate.score < bestCandidate.score) {
            bestCandidate = {
              nodeDropY,
              opexLiftY,
              costShiftY: candidate.costShiftY,
              score: candidate.score,
            };
          }
        });
      });
    });
    if (bestCandidate.score >= baselineCandidate.score - 1.5) return;
    if (bestCandidate.nodeDropY > 0.5) {
      setAutoLayoutNodeOffset("operating-expenses", { dy: currentNodeOffsetY + bestCandidate.nodeDropY });
    }
    if (bestCandidate.costShiftY > 0.5 && costBreakdownBoxes.length) {
      shiftCostBreakdownGroupDown(bestCandidate.costShiftY);
      maintainCostBreakdownNodeGap();
    }
    if (bestCandidate.opexLiftY > 0.5) {
      opexBoxes = opexBoxes.map((box) => (box ? shiftBoxCenter(box, box.center - bestCandidate.opexLiftY) : box));
    }
  };
  const refineSharedNegativeLadder = () => {
    if (!(costBreakdownSharesOpexColumn && costBreakdownBoxes.length >= 2 && opexBoxes.length >= 2)) return;
    const firstOpexEntry = {
      lane: "opex",
      index: 0,
      box: opexBoxes[0],
      sourceSlice: opexSourceSlices[0] || opexSlices[0],
      minHeight: 14,
      sourceTop: opexTop,
      sourceBottom: opexBottom,
      sourceNodeId: "operating-expenses",
      targetNodeId: "opex-0",
    };
    const deductionEntry =
      deductionBoxes.length && deductionBoxes[0]
        ? {
            lane: "deduction",
            index: 0,
            box: deductionBoxes[0],
            sourceSlice: deductionSourceSlices[0] || deductionSlices[0],
            minHeight: deductionSlices[0]?.item?.name === "Other" ? 6 : 12,
            sourceTop: opDeductionSourceBand.top,
            sourceBottom: opDeductionSourceBand.bottom,
            sourceNodeId: "operating",
            targetNodeId: "deduction-0",
          }
        : null;
    const firstOpexBox = opexBoxes[0];
    const secondOpexBox = opexBoxes[1];
    const firstCostBox = costBreakdownBoxes[0];
    if (!firstOpexBox || !secondOpexBox || !firstCostBox || !firstOpexEntry.sourceSlice) return;
    const firstOpexGeometry = resolveNegativeTerminalGeometry(firstOpexEntry);
    const deductionGeometry = deductionEntry ? resolveNegativeTerminalGeometry(deductionEntry) : null;
    if (!firstOpexGeometry) return;
    const currentNodeOffsetY = autoLayoutOffsetForNode("operating-expenses").dy;
    const nodeBottomShifted = opexBottom + currentNodeOffsetY;
    const nodeToFirstGapY = firstOpexGeometry.targetTop - nodeBottomShifted;
    const firstBranchDropY =
      safeNumber(firstOpexGeometry.targetCenter, 0) -
      (safeNumber(opexSourceSlices[0]?.center, firstOpexGeometry.targetCenter) + currentNodeOffsetY);
    const costClusterGapY = firstCostBox.top - nodeBottomShifted;
    const severeSplit =
      firstBranchDropY > scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderBranchSeverityY, 156)) ||
      nodeToFirstGapY > scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderNodeGapSeverityY, 94)) ||
      costClusterGapY > scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderCostGapSeverityY, 216));
    if (!severeSplit) return;
    const availableCostShiftY = Math.max(
      maxCollisionBasedGroupShiftDown(costBreakdownBoxes, costBreakdownPackingHeights, costBreakdownMaxY),
      maxActualBoxGroupShiftDown(costBreakdownBoxes, costBreakdownMaxY)
    );
    const costFollowFactor = clamp(safeNumber(snapshot.layout?.sharedNegativeLadderCostFollowFactor, 1.02), 0.84, 1.22);
    const nodeShiftMaxY = Math.max(
      0,
      Math.min(
        scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderNodeShiftMaxY, 132)),
        availableCostShiftY / Math.max(costFollowFactor, 0.0001)
      )
    );
    const deductionShiftMaxY =
      deductionGeometry && deductionBoxes[0]
        ? Math.min(
            Math.max(
              safeNumber(firstOpexGeometry.targetTop, firstOpexBox.top) -
                safeNumber(deductionGeometry.targetBottom, deductionBoxes[0].bottom) -
                scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinDeductionToOpexGapY, 54)),
              0
            ),
            scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderDeductionShiftMaxY, 58))
          )
        : 0;
    const opexLiftFloorY = deductionGeometry
      ? safeNumber(deductionGeometry.targetBottom, deductionBoxes[0]?.bottom) +
        scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinOpexAboveDeductionGapY, 88))
      : Math.max(
          rightTerminalSummaryObstacleBottom,
          netBottom + scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinOffsetFromNetY, 42))
        );
    const opexLiftMaxY = Math.max(
      0,
      Math.min(
        safeNumber(firstOpexGeometry.targetTop, firstOpexBox.top) - opexLiftFloorY,
        scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderOpexLiftMaxY, 44))
      )
    );
    if (!(nodeShiftMaxY > 0.5 || deductionShiftMaxY > 0.5 || opexLiftMaxY > 0.5)) return;
    const secondOpexEntry =
      opexBoxes.length > 1 && opexBoxes[1]
        ? {
            lane: "opex",
            index: 1,
            box: opexBoxes[1],
            sourceSlice: opexSourceSlices[1] || opexSlices[1],
            minHeight: 14,
            sourceTop: opexTop,
            sourceBottom: opexBottom,
            sourceNodeId: "operating-expenses",
            targetNodeId: "opex-1",
          }
        : null;
    const buildAxisCandidates = (maxY, segments = 6) =>
      Array.from(
        new Set(
          [0, maxY, ...Array.from({ length: segments + 1 }, (_unused, index) => (maxY * index) / Math.max(segments, 1))].map(
            (value) => Number(clamp(value, 0, maxY).toFixed(2))
          )
        )
      );
    const nodeShiftCandidates = buildAxisCandidates(nodeShiftMaxY, 7);
    const deductionShiftCandidates = buildAxisCandidates(deductionShiftMaxY, deductionGeometry ? 5 : 1);
    const opexLiftCandidates = buildAxisCandidates(opexLiftMaxY, 6);
    const netBottomShifted = netBottom + layoutReferenceOffsetFor("net").dy;
    const minNodeToFirstGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinNodeGapY, 58));
    const preferredNodeToFirstGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderPreferredNodeGapY, 72));
    const maxNodeToFirstGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMaxNodeGapY, 96));
    const preferredBranchDropY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderPreferredBranchDropY, 118));
    const maxBranchDropY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMaxBranchDropY, 156));
    const minCostClusterGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinCostClusterGapY, 152));
    const preferredCostClusterGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderPreferredCostClusterGapY, 198));
    const minSummaryGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinSummaryGapY, 24));
    const preferredSummaryGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderPreferredSummaryGapY, 42));
    const minDeductionNetGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinDeductionNetGapY, 74));
    const preferredDeductionNetGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderPreferredDeductionNetGapY, 118));
    const minTerminalGapY = scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderMinTerminalGapY, 72));
    const preferredTerminalGapY = scaleY(
      safeNumber(snapshot.layout?.sharedNegativeLadderPreferredTerminalGapY, secondOpexEntry ? 138 : 124)
    );
    const evaluateCandidate = (nodeShiftY, deductionShiftY, opexLiftY) => {
      const costShiftY = Math.min(availableCostShiftY, nodeShiftY * costFollowFactor);
      const firstOpexGeometryCandidate = resolveNegativeTerminalGeometry({
        ...firstOpexEntry,
        box: shiftBoxCenter(firstOpexBox, firstOpexBox.center - opexLiftY),
      });
      if (!firstOpexGeometryCandidate) {
        return {
          score: Infinity,
          costShiftY,
        };
      }
      const secondOpexGeometryCandidate = secondOpexEntry
        ? resolveNegativeTerminalGeometry({
            ...secondOpexEntry,
            box: shiftBoxCenter(secondOpexBox, secondOpexBox.center - opexLiftY),
          })
        : null;
      const deductionGeometryCandidate =
        deductionEntry && deductionBoxes[0]
          ? resolveNegativeTerminalGeometry({
              ...deductionEntry,
              box: shiftBoxCenter(deductionBoxes[0], deductionBoxes[0].center + deductionShiftY),
            })
          : null;
      const nodeBottomCandidate = opexBottom + currentNodeOffsetY + nodeShiftY;
      const nodeToFirstGapCandidateY = firstOpexGeometryCandidate.targetTop - nodeBottomCandidate;
      const firstBranchDropCandidateY =
        safeNumber(firstOpexGeometryCandidate.targetCenter, 0) -
        (safeNumber(opexSourceSlices[0]?.center, firstOpexGeometryCandidate.targetCenter) + currentNodeOffsetY + nodeShiftY);
      const costClusterGapCandidateY = firstCostBox.top + costShiftY - nodeBottomCandidate;
      const summaryLiftAllowanceY = Math.min(
        scaleY(safeNumber(snapshot.layout?.sharedNegativeLadderSummaryLiftAllowanceMaxY, 26)),
        Math.max(
          nodeShiftY * safeNumber(snapshot.layout?.sharedNegativeLadderSummaryLiftFollowFactor, 0.78),
          0
        )
      );
      const summaryBottomCandidateY = costBreakdownOpexSummaryBottom + currentNodeOffsetY + nodeShiftY - summaryLiftAllowanceY;
      const summaryGapCandidateY = firstOpexGeometryCandidate.targetTop - summaryBottomCandidateY;
      const deductionNetGapCandidateY = deductionGeometryCandidate
        ? deductionGeometryCandidate.targetTop - netBottomShifted
        : Infinity;
      const deductionToFirstGapCandidateY = deductionGeometryCandidate
        ? firstOpexGeometryCandidate.targetTop - deductionGeometryCandidate.targetBottom
        : preferredTerminalGapY;
      const firstToSecondGapCandidateY = secondOpexGeometryCandidate
        ? secondOpexGeometryCandidate.targetTop - firstOpexGeometryCandidate.targetBottom
        : deductionToFirstGapCandidateY;
      const terminalGapMeanY = secondOpexGeometryCandidate
        ? (deductionToFirstGapCandidateY + firstToSecondGapCandidateY) / 2
        : deductionToFirstGapCandidateY;
      let score =
        Math.max(minNodeToFirstGapY - nodeToFirstGapCandidateY, 0) * 230 +
        Math.max(nodeToFirstGapCandidateY - maxNodeToFirstGapY, 0) * 124 +
        Math.abs(nodeToFirstGapCandidateY - preferredNodeToFirstGapY) * 9.1 +
        Math.max(firstBranchDropCandidateY - maxBranchDropY, 0) * 164 +
        Math.abs(firstBranchDropCandidateY - preferredBranchDropY) * 8.6 +
        Math.max(minCostClusterGapY - costClusterGapCandidateY, 0) * 82 +
        Math.abs(costClusterGapCandidateY - preferredCostClusterGapY) * 1.8 +
        Math.max(minSummaryGapY - summaryGapCandidateY, 0) * 260 +
        Math.abs(summaryGapCandidateY - preferredSummaryGapY) * 4.9;
      if (deductionGeometryCandidate) {
        score +=
          Math.max(minDeductionNetGapY - deductionNetGapCandidateY, 0) * 92 +
          Math.abs(deductionNetGapCandidateY - preferredDeductionNetGapY) * 1.6 +
          Math.max(minTerminalGapY - deductionToFirstGapCandidateY, 0) * 128 +
          Math.abs(deductionToFirstGapCandidateY - preferredTerminalGapY) * 1.8;
      }
      if (secondOpexGeometryCandidate) {
        score +=
          Math.max(minTerminalGapY - firstToSecondGapCandidateY, 0) * 116 +
          Math.abs(firstToSecondGapCandidateY - preferredTerminalGapY * 1.04) * 1.5 +
          Math.abs(deductionToFirstGapCandidateY - terminalGapMeanY) * 2.3 +
          Math.abs(firstToSecondGapCandidateY - terminalGapMeanY) * 2.1;
      }
      score += nodeShiftY * 0.18 + deductionShiftY * 0.24 + opexLiftY * 0.22;
      return {
        score,
        costShiftY,
      };
    };
    const baselineCandidate = evaluateCandidate(0, 0, 0);
    let bestCandidate = {
      nodeShiftY: 0,
      deductionShiftY: 0,
      opexLiftY: 0,
      costShiftY: 0,
      score: baselineCandidate.score,
    };
    nodeShiftCandidates.forEach((nodeShiftY) => {
      deductionShiftCandidates.forEach((deductionShiftY) => {
        opexLiftCandidates.forEach((opexLiftY) => {
          const candidate = evaluateCandidate(nodeShiftY, deductionShiftY, opexLiftY);
          if (candidate.score < bestCandidate.score) {
            bestCandidate = {
              nodeShiftY,
              deductionShiftY,
              opexLiftY,
              costShiftY: candidate.costShiftY,
              score: candidate.score,
            };
          }
        });
      });
    });
    if (bestCandidate.score >= baselineCandidate.score - 1.5) return;
    if (bestCandidate.nodeShiftY > 0.5) {
      setAutoLayoutNodeOffset("operating-expenses", { dy: currentNodeOffsetY + bestCandidate.nodeShiftY });
    }
    if (bestCandidate.costShiftY > 0.5) {
      shiftCostBreakdownGroupDown(bestCandidate.costShiftY);
      maintainCostBreakdownNodeGap();
    }
    if (bestCandidate.deductionShiftY > 0.5 && deductionBoxes.length && deductionBoxes[0]) {
      deductionBoxes[0] = shiftBoxCenter(deductionBoxes[0], deductionBoxes[0].center + bestCandidate.deductionShiftY);
    }
    if (bestCandidate.opexLiftY > 0.5) {
      opexBoxes = opexBoxes.map((box) => (box ? shiftBoxCenter(box, box.center - bestCandidate.opexLiftY) : box));
    }
  };
  const refinePrimaryNegativeLead = () => {
    const leadNegativeEntry =
      deductionBoxes.length && deductionSlices.length
        ? {
            lane: "deduction",
            index: 0,
            box: deductionBoxes[0],
            sourceSlice: deductionSourceSlices[0] || deductionSlices[0],
            minHeight: deductionSlices[0]?.item?.name === "Other" ? 6 : 12,
            sourceTop: opDeductionSourceBand.top,
            sourceBottom: opDeductionSourceBand.bottom,
            sourceX: operatingFrame.right,
            targetX: rightTerminalNodeX,
            sourceNodeId: "operating",
            targetNodeId: "deduction-0",
            branchOptions: resolveDeductionTerminalBranchOptions(0),
          }
        : opexBoxes.length && opexSlices.length
          ? {
              lane: "opex",
              index: 0,
              box: opexBoxes[0],
              sourceSlice: opexSourceSlices[0] || opexSlices[0],
              minHeight: 14,
              sourceTop: opexTop,
              sourceBottom: opexBottom,
              sourceX: operatingExpenseFrame.right,
              targetX: opexTargetX,
              sourceNodeId: "operating-expenses",
              targetNodeId: "opex-0",
              branchOptions: standardTerminalBranchOptions,
            }
          : null;
    if (!leadNegativeEntry?.box || !leadNegativeEntry?.sourceSlice) return;
    const followingNegativeEntries = [
      ...(leadNegativeEntry.lane === "deduction"
        ? deductionBoxes.slice(1).map((box, relativeIndex) => {
            const index = relativeIndex + 1;
            const sourceSlice = deductionSourceSlices[index] || deductionSlices[index];
            if (!box || !sourceSlice) return null;
            return {
              lane: "deduction",
              index,
              box,
              sourceSlice,
              minHeight: deductionSlices[index]?.item?.name === "Other" ? 6 : 12,
              sourceTop: opDeductionSourceBand.top,
              sourceBottom: opDeductionSourceBand.bottom,
              sourceNodeId: "operating",
              targetNodeId: `deduction-${index}`,
            };
          })
        : []),
      ...opexBoxes.map((box, index) => {
        const sourceSlice = opexSourceSlices[index] || opexSlices[index];
        if (!box || !sourceSlice) return null;
        return {
          lane: "opex",
          index,
          box,
          sourceSlice,
          minHeight: 14,
          sourceTop: opexTop,
          sourceBottom: opexBottom,
          sourceNodeId: "operating-expenses",
          targetNodeId: `opex-${index}`,
        };
      }),
    ]
      .filter(Boolean)
      .sort((left, right) => left.box.center - right.box.center);
    const nextNegativeEntry = followingNegativeEntries.find(
      (entry) => safeNumber(entry.box.center, Infinity) > safeNumber(leadNegativeEntry.box.center, -Infinity)
    );
    const nextNegativeGeometry = nextNegativeEntry ? resolveNegativeTerminalGeometry(nextNegativeEntry) : null;
    const leadNegativeCount =
      leadNegativeEntry.lane === "deduction"
        ? Math.max(deductionBoxes.filter(Boolean).length + opexBoxes.filter(Boolean).length, 1)
        : Math.max(opexBoxes.filter(Boolean).length, 1);
    const leadingLaneDensityNorm = clamp(
      (leadNegativeCount - 1) * 0.22 + (leadNegativeEntry.lane === "deduction" && costBreakdownSharesOpexColumn ? 0.22 : 0),
      0,
      0.9
    );
    const leadCurrentTargetBottom =
      safeNumber(leadNegativeEntry.box.bottom, -Infinity) + layoutReferenceOffsetFor(leadNegativeEntry.targetNodeId).dy;
    const currentNextGapY = nextNegativeGeometry ? nextNegativeGeometry.targetTop - leadCurrentTargetBottom : Infinity;
    const leadSpacingPressureNorm = Math.max(
      leadingLaneDensityNorm,
      nextNegativeGeometry ? clamp((currentNextGapY - scaleY(92)) / scaleY(220), 0, 1) : 0
    );
    const netShift = layoutReferenceOffsetFor("net");
    const sourceShift = layoutReferenceOffsetFor(leadNegativeEntry.sourceNodeId);
    const targetShift = layoutReferenceOffsetFor(leadNegativeEntry.targetNodeId);
    const netBottomShifted = netBottom + netShift.dy;
    const sourceCoverInset = Math.max(
      safeNumber(
        leadNegativeEntry.branchOptions.sourceCoverInsetX,
        safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)
      ),
      0
    );
    const mergedBranchOptions = {
      ...mergeOutflowRibbonOptions(leadNegativeEntry.branchOptions),
      endCapWidth: 0,
      targetCoverInsetX: safeNumber(
        leadNegativeEntry.branchOptions.targetCoverInsetX,
        safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)
      ),
    };
    const sourceX = leadNegativeEntry.sourceX - sourceCoverInset + sourceShift.dx;
    const targetX = leadNegativeEntry.targetX + mergedBranchOptions.targetCoverInsetX + targetShift.dx;
    const minNodeGapY = scaleY(
      safeNumber(snapshot.layout?.primaryNegativeMinNodeGapY, positiveAdjustments.length && positiveAbove ? 22 : 18)
    );
    const preferredNodeGapBaseY = scaleY(
      safeNumber(
        snapshot.layout?.primaryNegativePreferredNodeGapY,
        clamp(
          netHeight * 0.18 +
            safeNumber(leadNegativeEntry.box.height, 0) * 0.24 +
            (positiveAdjustments.length && positiveAbove ? 12 : 6),
          30,
          positiveAdjustments.length && positiveAbove ? 84 : 72
        )
      )
    );
    const preferredNodeGapY =
      preferredNodeGapBaseY +
      scaleY(safeNumber(snapshot.layout?.primaryNegativePreferredNodeGapBoostY, 28)) * leadSpacingPressureNorm;
    const maxNodeGapBaseY = scaleY(
      safeNumber(
        snapshot.layout?.primaryNegativeMaxNodeGapY,
        Math.max(preferredNodeGapBaseY / Math.max(verticalScale, 0.0001) + (positiveAdjustments.length && positiveAbove ? 34 : 26), 56)
      )
    );
    const maxNodeGapY =
      maxNodeGapBaseY + scaleY(safeNumber(snapshot.layout?.primaryNegativeMaxNodeGapBoostY, 54)) * leadSpacingPressureNorm;
    const candidateSourceSlice =
      leadNegativeEntry.lane === "deduction"
        ? resolveDeductionTerminalSourceSlice(0, leadNegativeEntry.sourceSlice)
        : leadNegativeEntry.sourceSlice;
    const leadNegativeThickness = Math.max(
      safeNumber(leadNegativeEntry.box.height, 0),
      safeNumber(candidateSourceSlice?.height, 0),
      1
    );
    const minCorridorGapY = scaleY(
      safeNumber(
        snapshot.layout?.primaryNegativeMinCorridorGapY,
        clamp(
          leadNegativeThickness * 0.14 + (positiveAdjustments.length && positiveAbove ? 3 : 2),
          6,
          positiveAdjustments.length && positiveAbove ? 14 : 12
        )
      )
    );
    const earlyCorridorGapY = scaleY(
      safeNumber(
        snapshot.layout?.primaryNegativeEarlyCorridorGapY,
        clamp(
          leadNegativeThickness * 0.22 + (positiveAdjustments.length && positiveAbove ? 6 : 4),
          10,
          positiveAdjustments.length && positiveAbove ? 20 : 16
        )
      )
    );
    const preferredCorridorGapY = scaleY(
      safeNumber(
        snapshot.layout?.primaryNegativePreferredCorridorGapY,
        clamp(
          leadNegativeThickness * 0.34 + (positiveAdjustments.length && positiveAbove ? 9 : 7),
          14,
          positiveAdjustments.length && positiveAbove ? 30 : 24
        )
      )
    );
    const maxCorridorGapY = scaleY(
      safeNumber(
        snapshot.layout?.primaryNegativeMaxCorridorGapY,
        clamp(
          preferredCorridorGapY / Math.max(verticalScale, 0.0001) +
            leadNegativeThickness * 0.34 +
            (positiveAdjustments.length && positiveAbove ? 16 : 14),
          34,
          positiveAdjustments.length && positiveAbove ? 72 : 58
        )
      )
    );
    const spacingBalanceActivationRatio = safeNumber(snapshot.layout?.primaryNegativeSpacingBalanceActivationRatio, 2.12);
    const spacingBalanceActivationExtraY = scaleY(safeNumber(snapshot.layout?.primaryNegativeSpacingBalanceActivationExtraY, 26));
    const enableSpacingBalance =
      nextNegativeGeometry &&
      currentNextGapY >
        Math.max(
          safeNumber(leadNegativeEntry.box.height, 0) + safeNumber(nextNegativeGeometry.targetHeight, 0) + rightTerminalSeparationGap,
          (safeNumber(leadNegativeEntry.box.top, 0) - netBottomShifted) * spacingBalanceActivationRatio + spacingBalanceActivationExtraY
        );
    const preferredNextGapY = enableSpacingBalance
      ? scaleY(
          safeNumber(
            snapshot.layout?.primaryNegativePreferredNextGapY,
            clamp(
              preferredNodeGapBaseY / Math.max(verticalScale, 0.0001) * 1.06 + leadNegativeThickness * 0.28 + 12,
              72,
              148
            )
          )
        ) +
        scaleY(safeNumber(snapshot.layout?.primaryNegativePreferredNextGapBoostY, 24)) * leadSpacingPressureNorm
      : null;
    const minNextGapY = enableSpacingBalance
      ? scaleY(safeNumber(snapshot.layout?.primaryNegativeMinNextGapY, 26))
      : null;
    const maxNextGapY = enableSpacingBalance
      ? scaleY(safeNumber(snapshot.layout?.primaryNegativeMaxNextGapY, 184)) +
        scaleY(safeNumber(snapshot.layout?.primaryNegativeMaxNextGapBoostY, 44)) * leadSpacingPressureNorm
      : null;
    const candidateMinCenter = Math.max(
      leadNegativeEntry.box.height / 2,
      rightTerminalSummaryObstacleBottom + leadNegativeEntry.box.height / 2,
      netBottom + leadNegativeEntry.box.height / 2 + minNodeGapY
    );
    const candidateMaxCenterFromNext = nextNegativeGeometry
      ? nextNegativeGeometry.targetCenter - (leadNegativeEntry.box.height + nextNegativeGeometry.targetHeight) / 2 - rightTerminalSeparationGap
      : terminalLayoutBottomLimit - leadNegativeEntry.box.height / 2;
    const candidateMaxCenter = Math.max(candidateMinCenter, candidateMaxCenterFromNext);
    if (!(candidateMaxCenter >= candidateMinCenter)) return;
    const sampleXs = [0.12, 0.24, 0.42, 0.62, 0.8]
      .map((ratio) => sourceX + (targetX - sourceX) * ratio)
      .filter((value, index, values) => Number.isFinite(value) && (index === 0 || Math.abs(value - values[index - 1]) > 0.5));
    const candidateCenters = Array.from(
      new Set(
        [
          candidateMinCenter,
          candidateMaxCenter,
          leadNegativeEntry.box.center,
          ...Array.from({ length: 11 }, (_unused, index) =>
            candidateMinCenter + ((candidateMaxCenter - candidateMinCenter) * index) / 10
          ),
        ].map((value) => Number(clamp(value, candidateMinCenter, candidateMaxCenter).toFixed(2)))
      )
    );
    let bestCandidate = null;
    candidateCenters.forEach((candidateCenter) => {
      const bridge = constantThicknessBridge(
        candidateSourceSlice,
        candidateCenter,
        leadNegativeEntry.minHeight,
        leadNegativeEntry.sourceTop,
        leadNegativeEntry.sourceBottom
      );
      const targetTop = candidateCenter - bridge.targetHeight / 2 + targetShift.dy;
      const nodeGapY = targetTop - netBottomShifted;
      const adaptedBranchOptions = resolveAdaptiveNegativeTerminalBranchOptions(
        mergedBranchOptions,
        bridge.sourceTop + sourceShift.dy,
        bridge.sourceBottom + sourceShift.dy,
          targetTop,
          bridge.targetHeight,
          {
            index: leadNegativeEntry.index,
            count: leadNegativeCount,
            laneBias: leadNegativeEntry.lane === "deduction" ? 0.12 : 0.06,
          }
        );
      let minGap = Infinity;
      let earlyMinGap = Infinity;
      let averageGap = 0;
      let sampleCount = 0;
      sampleXs.forEach((sampleX, sampleIndex) => {
        const mainEnvelope = mainNetRibbonEnvelopeAtX(sampleX);
        const branchEnvelope = flowEnvelopeAtX(
          sampleX,
          sourceX,
          bridge.sourceTop + sourceShift.dy,
          bridge.sourceBottom + sourceShift.dy,
          targetX,
          targetTop,
          targetTop + bridge.targetHeight,
          adaptedBranchOptions
        );
        if (!mainEnvelope || !branchEnvelope) return;
        const gapY = branchEnvelope.top - mainEnvelope.bottom;
        minGap = Math.min(minGap, gapY);
        if (sampleIndex < 2) earlyMinGap = Math.min(earlyMinGap, gapY);
        averageGap += gapY;
        sampleCount += 1;
      });
      if (!sampleCount) return;
      averageGap /= sampleCount;
      const nextGapY = nextNegativeGeometry ? nextNegativeGeometry.targetTop - (targetTop + bridge.targetHeight) : Infinity;
      const corridorPenaltyBoost = 1 + leadSpacingPressureNorm * 0.72;
      const score =
        Math.max(minCorridorGapY - minGap, 0) * 220 * corridorPenaltyBoost +
        Math.max(earlyCorridorGapY - earlyMinGap, 0) * (enableSpacingBalance ? 320 : 250) * (1 + leadSpacingPressureNorm) +
        Math.max(preferredCorridorGapY - averageGap, 0) * 34 +
        Math.max(averageGap - maxCorridorGapY, 0) * 18 +
        Math.max(minNodeGapY - nodeGapY, 0) * 150 +
        Math.max(nodeGapY - maxNodeGapY, 0) * (leadNegativeEntry.lane === "deduction" ? 28 : 42) +
        Math.abs(nodeGapY - preferredNodeGapY) * (enableSpacingBalance ? 1.08 : 1.82) +
        (enableSpacingBalance
          ? Math.max(minNextGapY - nextGapY, 0) * 146 +
            Math.abs(nextGapY - preferredNextGapY) * 4.1 +
            Math.max(nextGapY - maxNextGapY, 0) * 42
          : 0) +
        Math.abs(candidateCenter - leadNegativeEntry.box.center) * 0.04;
      if (!bestCandidate || score < bestCandidate.score) {
        bestCandidate = {
          center: candidateCenter,
          score,
        };
      }
    });
    if (!bestCandidate || Math.abs(bestCandidate.center - leadNegativeEntry.box.center) <= 0.5) return;
    if (leadNegativeEntry.lane === "deduction") {
      deductionBoxes[0] = shiftBoxCenter(deductionBoxes[0], bestCandidate.center);
    } else {
      opexBoxes[0] = shiftBoxCenter(opexBoxes[0], bestCandidate.center);
    }
  };
  refineOpexSplitSmoothness();
  refineSharedNegativeLadder();
  if (costBreakdownSharesOpexColumn) {
    alignOpexSummaryToNode();
  }
  if (costBreakdownSharesOpexColumn && costBreakdownBoxes.length) {
    const opexSummaryShift = layoutReferenceOffsetFor("operating-expenses");
    const opexSummaryMetrics = resolveOpexSummaryMetrics(opexSummaryShift);
    const opexSummaryObstaclePadX = scaleY(safeNumber(snapshot.layout?.costBreakdownOpexRibbonObstaclePadX, 10));
    const opexSummaryObstaclePadY = scaleY(safeNumber(snapshot.layout?.costBreakdownOpexRibbonObstaclePadY, 8));
    const opexSummaryObstacleWidth = Math.max(
      approximateTextBlockWidth(operatingExpenseLabelLines, expenseSummaryLayout.titleSize),
      approximateTextWidth(formatBillionsByMode(operatingExpensesBn, "negative-parentheses"), expenseSummaryLayout.valueSize),
      revenueBn > 0 ? approximateTextWidth(formatPct((operatingExpensesBn / revenueBn) * 100) + ` ${ofRevenueLabel()}`, expenseSummaryLayout.subSize) : 0,
      1
    );
    const opexSummaryObstacle = {
      left: opexSummaryMetrics.centerX - opexSummaryObstacleWidth / 2 - opexSummaryObstaclePadX,
      right: opexSummaryMetrics.centerX + opexSummaryObstacleWidth / 2 + opexSummaryObstaclePadX,
      top: opexSummaryMetrics.top - opexSummaryObstaclePadY,
      bottom: opexSummaryMetrics.bottom + opexSummaryObstaclePadY,
    };
    const costBreakdownRibbonClearanceY = scaleY(safeNumber(snapshot.layout?.costBreakdownOpexRibbonClearanceY, 10));
    const costBreakdownSummaryClearanceY = scaleY(
      safeNumber(
        snapshot.layout?.costBreakdownOpexSummaryClearanceY,
        costBreakdownSlices.length === 2 && costBreakdownSharesOpexColumn ? 18 : 14
      )
    );
    const topBarrierDeficit = costBreakdownTerminalTopBarrierY - costBreakdownCollisionTop();
    if (topBarrierDeficit > 0.5) {
      shiftCostBreakdownGroupDown(topBarrierDeficit + scaleY(2));
      maintainCostBreakdownNodeGap();
    }
    const sampleXsAcrossRange = (left, right, count = 7) => {
      if (!(right > left)) return [left];
      return Array.from({ length: count }, (_value, index) => left + ((right - left) * index) / Math.max(count - 1, 1));
    };
    const computeCostBreakdownEnvelopeDeficit = (index) => {
      const box = costBreakdownBoxes[index];
      const sourceSlice = costBreakdownSourceSlices[index] || costBreakdownSlices[index];
      if (!box || !sourceSlice) return 0;
      const sourceShift = layoutReferenceOffsetFor("cost");
      const targetShift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
      const sourceCoverInset = Math.max(
        safeNumber(resolvedCostBreakdownTerminalBranchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)),
        0
      );
      const mergedBranchOptions = {
        ...mergeOutflowRibbonOptions(resolvedCostBreakdownTerminalBranchOptions),
        endCapWidth: 0,
        targetCoverInsetX: safeNumber(
          resolvedCostBreakdownTerminalBranchOptions.targetCoverInsetX,
          safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)
        ),
      };
      const bridge = constantThicknessBridge(sourceSlice, box.center, 10, costTop, costBottom);
      const sourceX = grossX + nodeWidth + sourceShift.dx - sourceCoverInset;
      const sourceTop = bridge.sourceTop + sourceShift.dy;
      const sourceBottom = bridge.sourceBottom + sourceShift.dy;
      const targetX = costBreakdownX + targetShift.dx + mergedBranchOptions.targetCoverInsetX;
      const targetTop = bridge.targetTop + targetShift.dy;
      const targetBottom = targetTop + bridge.targetHeight;
      const overlapLeft = Math.max(opexSummaryObstacle.left, sourceX + scaleY(4));
      const overlapRight = Math.min(opexSummaryObstacle.right, targetX - scaleY(4));
      if (!(overlapRight > overlapLeft) || targetBottom <= opexSummaryObstacle.top) return 0;
      return sampleXsAcrossRange(overlapLeft, overlapRight).reduce((maxDeficit, sampleX) => {
        const envelope = flowEnvelopeAtX(
          sampleX,
          sourceX,
          sourceTop,
          sourceBottom,
          targetX,
          targetTop,
          targetBottom,
          mergedBranchOptions
        );
        if (!envelope) return maxDeficit;
        return Math.max(maxDeficit, opexSummaryObstacle.bottom + costBreakdownRibbonClearanceY - envelope.top);
      }, 0);
    };
    const computeCostBreakdownSummaryDeficit = (index) => {
      const box = costBreakdownBoxes[index];
      if (!box) return 0;
      const targetShift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
      const collisionHeight = Math.max(
        safeNumber(costBreakdownGapHeights[index], box.height),
        safeNumber(costBreakdownPackingHeights[index], box.height),
        safeNumber(box.height, 0),
        1
      );
      const collisionTop = safeNumber(box.center, 0) + targetShift.dy - collisionHeight / 2;
      const nodeTop = safeNumber(box.top, 0) + targetShift.dy;
      return Math.max(
        opexSummaryObstacle.bottom + costBreakdownSummaryClearanceY - collisionTop,
        opexSummaryObstacle.bottom + scaleY(8) - nodeTop,
        computeCostBreakdownEnvelopeDeficit(index)
      );
    };
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = false;
      const groupDeficit = costBreakdownBoxes.reduce(
        (maxDeficit, _box, index) => Math.max(maxDeficit, computeCostBreakdownSummaryDeficit(index)),
        0
      );
      if (groupDeficit > 0.5) {
        const groupShiftY = shiftCostBreakdownGroupDown(groupDeficit + scaleY(2));
        if (groupShiftY > 0.01) {
          maintainCostBreakdownNodeGap();
          moved = true;
          continue;
        }
      }
      for (let index = 0; index < costBreakdownBoxes.length; index += 1) {
        const deficit = computeCostBreakdownSummaryDeficit(index);
        if (deficit <= 0.5) continue;
        const box = costBreakdownBoxes[index];
        const maxCenter =
          costBreakdownMaxY -
          Math.max(
            safeNumber(costBreakdownGapHeights[index], box.height),
            safeNumber(costBreakdownPackingHeights[index], box.height),
            safeNumber(box.height, 0),
            1
          ) /
            2;
        const nextCenter = clamp(box.center + deficit + scaleY(2), box.center, maxCenter);
        if (nextCenter <= box.center + 0.1) continue;
        costBreakdownBoxes[index] = shiftBoxCenter(box, nextCenter);
        maintainCostBreakdownNodeGap();
        moved = true;
      }
      if (!moved) break;
    }
    maintainCostBreakdownNodeGap();
  }
  const renderStandardTerminalBranchBlock = ({
    sourceX,
    sourceNodeId = null,
    terminalNodeX,
    terminalNodeWidth,
    terminalNodeId,
    block,
    targetTop,
    targetHeight,
    flowColor,
    labelColor,
    density,
    labelX = undefined,
    centerWrapped = true,
    lockLabelCenterY = false,
    branchOptions = standardTerminalBranchOptions,
  }) => {
    const sourceShift = sourceNodeId ? editorOffsetForNode(sourceNodeId) : { dx: 0, dy: 0 };
    const sourceTop = safeNumber(block.bridge?.sourceTop, block.top) + sourceShift.dy;
    const sourceBottom = safeNumber(block.bridge?.sourceBottom, block.bottom) + sourceShift.dy;
    const targetFrame = editableNodeFrame(terminalNodeId, terminalNodeX, targetTop, terminalNodeWidth, targetHeight);
    const sourceCoverInset = Math.max(
      safeNumber(branchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)),
      0
    );
    const avoidFlowModel = {
      x0: sourceX + sourceShift.dx - sourceCoverInset,
      x1: targetFrame.x + safeNumber(branchOptions.targetCoverInsetX, safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)),
      sourceTop,
      sourceBottom,
      targetTop: targetFrame.y,
      targetHeight,
      options: mergeOutflowRibbonOptions(branchOptions),
    };
    let html = renderTerminalCapRibbon({
      sourceX: sourceX + sourceShift.dx,
      sourceTop,
      sourceBottom,
      capX: targetFrame.x,
      capWidth: terminalNodeWidth,
      targetTop: targetFrame.y,
      targetHeight,
      flowColor,
      capColor: redNode,
      branchOptions,
    });
    html += renderEditableNodeRect(targetFrame, redNode);
    html += renderRightBranchLabel(block.item, block.box, targetFrame.x, terminalNodeWidth, labelColor, {
      density,
      defaultMode: "negative-parentheses",
      labelX,
      centerWrapped,
      lockLabelCenterY,
      labelCenterY: targetFrame.centerY,
      avoidFlowModel,
    });
    return html;
  };
  const renderRightExpenseBlock = (_nodeX, nodeWidthValue, block, targetTop, targetHeight, _labelX, fillColor, index) => {
    const terminalNodeX = rightTerminalNodeX + Math.max(nodeWidth - nodeWidthValue, 0);
    const branchOptions = resolveAdaptiveNegativeTerminalBranchOptions(
      standardTerminalBranchOptions,
      safeNumber(block.bridge?.sourceTop, block.top),
      safeNumber(block.bridge?.sourceBottom, block.bottom),
      targetTop,
      targetHeight,
      {
        index,
        count: Math.max(opexSlices.length, 1),
        laneBias: 0.04,
      }
    );
    return renderStandardTerminalBranchBlock({
      sourceX: opX + nodeWidth,
      sourceNodeId: "operating-expenses",
      terminalNodeX,
      terminalNodeWidth: nodeWidthValue,
      terminalNodeId: `opex-${index}`,
      block,
      targetTop,
      targetHeight,
      flowColor: fillColor,
      labelColor: redText,
      density: opexDensity,
      labelX: negativeTerminalLabelX,
      lockLabelCenterY: true,
      branchOptions,
    });
  };
  const renderCostBreakdownBlock = (block, targetTop, targetHeight, index) => {
    return renderStandardTerminalBranchBlock({
      sourceX: grossX + nodeWidth,
      sourceNodeId: "cost",
      terminalNodeX: costBreakdownX,
      terminalNodeWidth: nodeWidth,
      terminalNodeId: `cost-breakdown-${index}`,
      block,
      targetTop,
      targetHeight,
      flowColor: redFlow,
      labelColor: redText,
      density: costBreakdownSlices.length >= 3 ? "dense" : "regular",
      labelX: costBreakdownLabelSafeX,
      centerWrapped: false,
      lockLabelCenterY: true,
      branchOptions: resolvedCostBreakdownTerminalBranchOptions,
    });
  };
  const resolveSplitBranchBoundaryOptions = (baseOptions = {}, overrides = {}) => ({
    ...baseOptions,
    ...overrides,
    adaptiveHold: false,
    sourceHoldLength: 0,
    minSourceHoldLength: 0,
    maxSourceHoldLength: 0,
    sourceHoldDeltaReduction: 0,
    minAdaptiveSourceHoldLength: 0,
  });
  const renderSharedTrunkCostBreakdownPair = (upperBlock, lowerBlock) => {
    if (!upperBlock || !lowerBlock) return "";
    const density = costBreakdownSlices.length >= 3 ? "dense" : "regular";
    const sourceShift = editorOffsetForNode("cost");
    const shiftFrameY = (frame, deltaY) => ({
      ...frame,
      y: frame.y + deltaY,
      top: frame.top + deltaY,
      bottom: frame.bottom + deltaY,
      centerY: frame.centerY + deltaY,
    });
    let upperFrame = editableNodeFrame("cost-breakdown-0", costBreakdownX, upperBlock.bridge.targetTop, nodeWidth, upperBlock.bridge.targetHeight);
    let lowerFrame = editableNodeFrame("cost-breakdown-1", costBreakdownX, lowerBlock.bridge.targetTop, nodeWidth, lowerBlock.bridge.targetHeight);
    const desiredRenderGapY = scaleY(
      safeNumber(
        snapshot.layout?.costBreakdownRenderGapY,
        costBreakdownExpandedFanout
          ? costBreakdownSharesOpexColumn
            ? 36
            : 24
          : costBreakdownSharesOpexColumn
            ? 14
            : 10
      )
    );
    const currentRenderGapY = lowerFrame.y - (upperFrame.y + upperFrame.height);
    if (currentRenderGapY < desiredRenderGapY) {
      let remainingGapY = desiredRenderGapY - currentRenderGapY;
      const lowerMaxY = costBreakdownMaxY - lowerFrame.height;
      const lowerShiftY = Math.min(Math.max(lowerMaxY - lowerFrame.y, 0), remainingGapY);
      if (lowerShiftY > 0.01) {
        lowerFrame = shiftFrameY(lowerFrame, lowerShiftY);
        remainingGapY -= lowerShiftY;
      }
      if (remainingGapY > 0.01) {
        const upperMinY = Math.max(
          costBreakdownTerminalTopFloor,
          costBreakdownSharesOpexColumn ? costBreakdownTerminalTopBarrierY + scaleY(8) : costBreakdownTerminalTopFloor
        );
        const upperShiftY = Math.min(Math.max(upperFrame.y - upperMinY, 0), remainingGapY);
        if (upperShiftY > 0.01) {
          upperFrame = shiftFrameY(upperFrame, -upperShiftY);
        }
      }
    }
    const sourceCoverInset = Math.max(
      safeNumber(resolvedCostBreakdownTerminalBranchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)),
      0
    );
    const resolvedBranchOptions = {
      ...mergeOutflowRibbonOptions(resolvedCostBreakdownTerminalBranchOptions),
      endCapWidth: 0,
      targetCoverInsetX: safeNumber(
        resolvedCostBreakdownTerminalBranchOptions.targetCoverInsetX,
        safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)
      ),
    };
    const mirroredResolvedBranchOptions = mirrorFlowBoundaryOptions(resolvedBranchOptions);
    const sourcePathX = grossX + nodeWidth + sourceShift.dx - sourceCoverInset;
    const upperSourceTop = safeNumber(upperBlock.bridge?.sourceTop, upperBlock.top) + sourceShift.dy;
    const upperSourceBottom = safeNumber(upperBlock.bridge?.sourceBottom, upperBlock.bottom) + sourceShift.dy;
    const lowerSourceTop = safeNumber(lowerBlock.bridge?.sourceTop, lowerBlock.top) + sourceShift.dy;
    const lowerSourceBottom = safeNumber(lowerBlock.bridge?.sourceBottom, lowerBlock.bottom) + sourceShift.dy;
    const sharedSeamY = (upperSourceBottom + lowerSourceTop) / 2;
    const targetCoverInsetX = resolvedBranchOptions.targetCoverInsetX;
    const upperTargetPathX = upperFrame.x + targetCoverInsetX;
    const lowerTargetPathX = lowerFrame.x + targetCoverInsetX;
    const sharedTrunkAvailableX = Math.max(
      Math.min(upperTargetPathX, lowerTargetPathX) - sourcePathX - safeNumber(snapshot.layout?.costBreakdownSharedTargetReserveX, 10),
      12
    );
    const sharedTrunkLength = clamp(
      safeNumber(
        snapshot.layout?.costBreakdownSharedTrunkLength,
        sharedTrunkAvailableX *
          safeNumber(
            snapshot.layout?.costBreakdownSharedTrunkFactor,
            costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.05 : 0.1) : 0.2
          )
      ),
      safeNumber(snapshot.layout?.costBreakdownMinSharedTrunkLength, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 4 : 8) : 18),
      Math.max(
        Math.min(
          sharedTrunkAvailableX,
          safeNumber(snapshot.layout?.costBreakdownMaxSharedTrunkLength, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 10 : 18) : 30)
        ),
        8
      )
    );
    const splitX = sourcePathX + sharedTrunkLength;
    const splitOuterBranchOptions = resolveSplitBranchBoundaryOptions(resolvedBranchOptions, {
      targetHoldFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterTargetHoldFactor, costBreakdownEarlySplitMode ? 0.03 : 0.05),
      minTargetHoldLength: safeNumber(snapshot.layout?.costBreakdownSplitOuterMinTargetHoldLength, costBreakdownEarlySplitMode ? 3 : 6),
      maxTargetHoldLength: safeNumber(snapshot.layout?.costBreakdownSplitOuterMaxTargetHoldLength, costBreakdownEarlySplitMode ? 8 : 12),
      startCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterStartCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.36 : 0.22) : 0.12),
      endCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterEndCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.5 : 0.38) : 0.3),
      minStartCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterMinStartCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.22 : 0.14) : 0.08),
      maxStartCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterMaxStartCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.46 : 0.28) : 0.18),
      minEndCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterMinEndCurveFactor, 0.18),
      maxEndCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitOuterMaxEndCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.56 : 0.42) : 0.36),
      deltaScale: safeNumber(snapshot.layout?.costBreakdownSplitOuterDeltaScale, 0.92),
      deltaInfluence: safeNumber(snapshot.layout?.costBreakdownSplitOuterDeltaInfluence, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.034 : 0.024) : 0.036),
    });
    const splitInnerBranchOptions = resolveSplitBranchBoundaryOptions(resolvedBranchOptions, {
      targetHoldFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerTargetHoldFactor, costBreakdownEarlySplitMode ? 0.028 : 0.046),
      minTargetHoldLength: safeNumber(snapshot.layout?.costBreakdownSplitInnerMinTargetHoldLength, costBreakdownEarlySplitMode ? 2 : 4),
      maxTargetHoldLength: safeNumber(snapshot.layout?.costBreakdownSplitInnerMaxTargetHoldLength, costBreakdownEarlySplitMode ? 7 : 10),
      startCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerStartCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.4 : 0.24) : 0.14),
      endCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerEndCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.44 : 0.34) : 0.28),
      minStartCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerMinStartCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.24 : 0.16) : 0.1),
      maxStartCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerMaxStartCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.5 : 0.3) : 0.2),
      minEndCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerMinEndCurveFactor, 0.18),
      maxEndCurveFactor: safeNumber(snapshot.layout?.costBreakdownSplitInnerMaxEndCurveFactor, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.48 : 0.38) : 0.34),
      deltaScale: safeNumber(snapshot.layout?.costBreakdownSplitInnerDeltaScale, 0.9),
      deltaInfluence: safeNumber(snapshot.layout?.costBreakdownSplitInnerDeltaInfluence, costBreakdownEarlySplitMode ? (costBreakdownExpandedFanout ? 0.03 : 0.02) : 0.03),
    });
    const mirroredSplitOuterBranchOptions = mirrorFlowBoundaryOptions(splitOuterBranchOptions);
    const mirroredSplitInnerBranchOptions = mirrorFlowBoundaryOptions(splitInnerBranchOptions);
    const upperPath = [
      `M ${sourcePathX} ${upperSourceTop}`,
      `L ${splitX} ${upperSourceTop}`,
      buildFlowBoundarySegment(splitX, upperSourceTop, upperTargetPathX, upperFrame.y, splitOuterBranchOptions),
      `L ${upperTargetPathX} ${upperFrame.y + upperFrame.height}`,
      buildFlowBoundarySegment(
        upperTargetPathX,
        upperFrame.y + upperFrame.height,
        splitX,
        sharedSeamY,
        mirroredSplitInnerBranchOptions
      ),
      `L ${sourcePathX} ${sharedSeamY}`,
      "Z",
    ].join(" ");
    const lowerPath = [
      `M ${sourcePathX} ${sharedSeamY}`,
      `L ${splitX} ${sharedSeamY}`,
      buildFlowBoundarySegment(splitX, sharedSeamY, lowerTargetPathX, lowerFrame.y, splitInnerBranchOptions),
      `L ${lowerTargetPathX} ${lowerFrame.y + lowerFrame.height}`,
      buildFlowBoundarySegment(
        lowerTargetPathX,
        lowerFrame.y + lowerFrame.height,
        splitX,
        lowerSourceBottom,
        mirroredSplitOuterBranchOptions
      ),
      `L ${sourcePathX} ${lowerSourceBottom}`,
      "Z",
    ].join(" ");
    let html = `<path d="${upperPath}" fill="${redFlow}" opacity="0.97"></path>`;
    html += `<path d="${lowerPath}" fill="${redFlow}" opacity="0.97"></path>`;
    html += renderEditableNodeRect(upperFrame, redNode);
    html += renderEditableNodeRect(lowerFrame, redNode);
    html += renderRightBranchLabel(upperBlock.item, upperBlock.box, upperFrame.x, nodeWidth, redText, {
      density,
      defaultMode: "negative-parentheses",
      labelX: costBreakdownLabelSafeX,
      centerWrapped: false,
      lockLabelCenterY: true,
      labelCenterY: upperFrame.centerY,
    });
    html += renderRightBranchLabel(lowerBlock.item, lowerBlock.box, lowerFrame.x, nodeWidth, redText, {
      density,
      defaultMode: "negative-parentheses",
      labelX: costBreakdownLabelSafeX,
      centerWrapped: false,
      lockLabelCenterY: true,
      labelCenterY: lowerFrame.centerY,
    });
    return html;
  };
  const renderOperatingProfitBreakdownCallout = () => {
    if (!operatingProfitBreakdown.length) return "";
    const boxX =
      snapshot.layout?.operatingProfitBreakdownX !== null && snapshot.layout?.operatingProfitBreakdownX !== undefined
        ? safeNumber(snapshot.layout?.operatingProfitBreakdownX) + leftShiftX
        : opX + 140;
    const boxY = layoutY(snapshot.layout?.operatingProfitBreakdownY, 554);
    const boxWidth = safeNumber(snapshot.layout?.operatingProfitBreakdownWidth, 232);
    const rowHeight = scaleY(safeNumber(snapshot.layout?.operatingProfitBreakdownRowHeight, 42));
    const paddingX = safeNumber(snapshot.layout?.operatingProfitBreakdownPaddingX, 16);
    const paddingTop = scaleY(safeNumber(snapshot.layout?.operatingProfitBreakdownPaddingTop, 18));
    const pointerX =
      snapshot.layout?.operatingProfitBreakdownPointerX !== null && snapshot.layout?.operatingProfitBreakdownPointerX !== undefined
        ? safeNumber(snapshot.layout?.operatingProfitBreakdownPointerX) + leftShiftX
        : boxX + boxWidth / 2;
    const pointerWidth = safeNumber(snapshot.layout?.operatingProfitBreakdownPointerWidth, 30);
    const pointerHeight = scaleY(safeNumber(snapshot.layout?.operatingProfitBreakdownPointerHeight, 16));
    const boxHeight = paddingTop * 2 + operatingProfitBreakdown.length * rowHeight;
    let html = `
      <path d="M ${pointerX - pointerWidth / 2} ${boxY} L ${pointerX} ${boxY - pointerHeight} L ${pointerX + pointerWidth / 2} ${boxY}" fill="#FFFFFF" stroke="#111111" stroke-width="2.4" stroke-linejoin="round"></path>
      <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="16" fill="#FFFFFF" stroke="#111111" stroke-width="2.4"></rect>
    `;
    operatingProfitBreakdown.forEach((item, index) => {
      const rowY = boxY + paddingTop + rowHeight * index;
      const valueX = boxX + boxWidth - paddingX;
      const labelX = boxX + paddingX + (item.lockupKey ? safeNumber(item.labelOffsetX, 88) : 0);
      if (item.lockupKey) {
        html += renderBusinessLockup(item.lockupKey, boxX + paddingX, rowY - scaleY(safeNumber(item.lockupYOffset, 18)), {
          scale: safeNumber(item.lockupScale, 0.34),
        });
      }
      if (!item.hideLabel) {
        html += `<text x="${labelX}" y="${rowY + scaleY(10)}" font-size="18" font-weight="700" fill="${dark}">${escapeHtml(item.name)}</text>`;
      }
      html += `<text x="${valueX}" y="${rowY + scaleY(10)}" text-anchor="end" font-size="18" font-weight="700" fill="${greenText}">${escapeHtml(formatItemBillions(item, "plain"))}</text>`;
    });
    return html;
  };
  let revenueFrame;
  let grossFrame;
  let costFrame;
  let operatingFrame;
  let operatingExpenseFrame;
  let netFrame;
  const refreshEditableNodeFrames = () => {
    revenueFrame = editableNodeFrame("revenue", revenueX, revenueTop, nodeWidth, revenueHeight);
    grossFrame = editableNodeFrame("gross", grossX, grossTop, nodeWidth, grossHeight);
    costFrame = editableNodeFrame("cost", grossX, costTop, nodeWidth, costHeight);
    operatingFrame = editableNodeFrame("operating", opX, opTop, nodeWidth, opHeight);
    operatingExpenseFrame = editableNodeFrame("operating-expenses", opX, opexTop, nodeWidth, opexHeight);
    netFrame = editableNodeFrame("net", netX, netTop, nodeWidth, netHeight);
  };
  refreshEditableNodeFrames();
  const refineLeadingNegativeExpansion = () => {
    const negativeEntries = [
      ...deductionBoxes
        .map((box, index) => {
          const sourceSlice = deductionSourceSlices[index] || deductionSlices[index];
          if (!box || !sourceSlice) return null;
          return {
            lane: "deduction",
            index,
            box,
            sourceSlice,
            minHeight: deductionSlices[index]?.item?.name === "Other" ? 6 : 12,
            sourceTop: opDeductionSourceBand.top,
            sourceBottom: opDeductionSourceBand.bottom,
            sourceX: operatingFrame.right,
            targetX: rightTerminalNodeX,
            sourceNodeId: "operating",
            targetNodeId: `deduction-${index}`,
            branchOptions: resolveDeductionTerminalBranchOptions(index),
          };
        })
        .filter(Boolean),
      ...opexBoxes
        .map((box, index) => {
          const sourceSlice = opexSourceSlices[index] || opexSlices[index];
          if (!box || !sourceSlice) return null;
          return {
            lane: "opex",
            index,
            box,
            sourceSlice,
            minHeight: 14,
            sourceTop: opexTop,
            sourceBottom: opexBottom,
            sourceX: operatingExpenseFrame.right,
            targetX: opexTargetX,
            sourceNodeId: "operating-expenses",
            targetNodeId: `opex-${index}`,
            branchOptions: standardTerminalBranchOptions,
          };
        })
        .filter(Boolean),
    ].sort((left, right) => left.box.center - right.box.center);
    if (negativeEntries.length < 2) return;
    const leadEntry = negativeEntries[0];
    const suffixEntries = negativeEntries.slice(1);
    const nextEntry = suffixEntries[0];
    if (!nextEntry) return;
    const sampleRatios = [0.18, 0.36, 0.56, 0.76, 0.92];
    const resolveEntryGeometry = (entry, centerShiftY = 0) => {
      const sourceSlice =
        entry.lane === "deduction"
          ? resolveDeductionTerminalSourceSlice(entry.index, entry.sourceSlice)
          : entry.sourceSlice;
      const sourceShift = layoutReferenceOffsetFor(entry.sourceNodeId);
      const targetShift = layoutReferenceOffsetFor(entry.targetNodeId);
      const sourceCoverInset = Math.max(
        safeNumber(entry.branchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)),
        0
      );
      const mergedBranchOptions = {
        ...mergeOutflowRibbonOptions(entry.branchOptions),
        endCapWidth: 0,
        targetCoverInsetX: safeNumber(
          entry.branchOptions.targetCoverInsetX,
          safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)
        ),
      };
      const bridge = constantThicknessBridge(
        sourceSlice,
        entry.box.center + centerShiftY,
        entry.minHeight,
        entry.sourceTop,
        entry.sourceBottom
      );
      const targetTop = bridge.targetTop + targetShift.dy;
      return {
        sourceX: entry.sourceX - sourceCoverInset + sourceShift.dx,
        sourceTop: bridge.sourceTop + sourceShift.dy,
        sourceBottom: bridge.sourceBottom + sourceShift.dy,
        targetX: entry.targetX + mergedBranchOptions.targetCoverInsetX + targetShift.dx,
        targetTop,
        targetBottom: targetTop + bridge.targetHeight,
        options: mergedBranchOptions,
      };
    };
    const leadGeometry = resolveEntryGeometry(leadEntry, 0);
    const suffixShiftHeadroomY = Math.max(
      terminalLayoutBottomLimit - Math.max(...suffixEntries.map((entry) => entry.box.bottom)),
      0
    );
    if (!(suffixShiftHeadroomY > 0.5)) return;
    const buildCandidates = (maxY, segments = 6) =>
      Array.from(
        new Set(
          [0, maxY, ...Array.from({ length: segments + 1 }, (_unused, index) => (maxY * index) / Math.max(segments, 1))].map(
            (value) => Number(clamp(value, 0, maxY).toFixed(2))
          )
        )
      );
    const candidateShiftYs = buildCandidates(
      Math.min(
        suffixShiftHeadroomY,
        scaleY(safeNumber(snapshot.layout?.leadingNegativeExpansionMaxShiftY, 88))
      ),
      7
    );
    const minExpansionY = scaleY(safeNumber(snapshot.layout?.leadingNegativeExpansionMinY, 18));
    const sourceGapY = scaleY(safeNumber(snapshot.layout?.leadingNegativeExpansionSourceGapY, 10));
    const preferredTargetGapBaseY = scaleY(
      safeNumber(snapshot.layout?.leadingNegativeExpansionPreferredTargetGapY, leadEntry.lane === "deduction" ? 96 : 82)
    );
    const minTargetGapY = scaleY(safeNumber(snapshot.layout?.leadingNegativeExpansionMinTargetGapY, 34));
    const maxTargetGapOvershootY = scaleY(safeNumber(snapshot.layout?.leadingNegativeExpansionMaxOvershootY, 30));
    const measureCorridor = (shiftY) => {
      const nextGeometry = resolveEntryGeometry(nextEntry, shiftY);
      const targetGapY = nextGeometry.targetTop - leadGeometry.targetBottom;
      let maxDeficitY = 0;
      let earlyMinGapY = Infinity;
      let lateMinGapY = Infinity;
      const sampleLeft = Math.max(leadGeometry.sourceX, nextGeometry.sourceX);
      const sampleRight = Math.min(leadGeometry.targetX, nextGeometry.targetX);
      if (sampleRight > sampleLeft + 4) {
        sampleRatios.forEach((ratio) => {
          const sampleX = sampleLeft + (sampleRight - sampleLeft) * ratio;
          const leadEnvelope = flowEnvelopeAtX(
            sampleX,
            leadGeometry.sourceX,
            leadGeometry.sourceTop,
            leadGeometry.sourceBottom,
            leadGeometry.targetX,
            leadGeometry.targetTop,
            leadGeometry.targetBottom,
            leadGeometry.options
          );
          const nextEnvelope = flowEnvelopeAtX(
            sampleX,
            nextGeometry.sourceX,
            nextGeometry.sourceTop,
            nextGeometry.sourceBottom,
            nextGeometry.targetX,
            nextGeometry.targetTop,
            nextGeometry.targetBottom,
            nextGeometry.options
          );
          if (!leadEnvelope || !nextEnvelope) return;
          const corridorGapY = nextEnvelope.top - leadEnvelope.bottom;
          const desiredGapY = sourceGapY + (preferredTargetGapBaseY - sourceGapY) * Math.pow(ratio, 1.34);
          maxDeficitY = Math.max(maxDeficitY, desiredGapY - corridorGapY);
          if (ratio <= 0.36) earlyMinGapY = Math.min(earlyMinGapY, corridorGapY);
          if (ratio >= 0.56) lateMinGapY = Math.min(lateMinGapY, corridorGapY);
        });
      }
      return {
        nextGeometry,
        targetGapY,
        maxDeficitY,
        earlyMinGapY,
        lateMinGapY,
      };
    };
    const currentGapProfile = measureCorridor(0);
    const currentTargetGapY = currentGapProfile.targetGapY;
    const activationGapY = scaleY(
      safeNumber(snapshot.layout?.leadingNegativeExpansionActivationGapY, leadEntry.lane === "deduction" ? 78 : 62)
    );
    const activationCorridorDeficitY = scaleY(
      safeNumber(snapshot.layout?.leadingNegativeExpansionActivationCorridorDeficitY, 16)
    );
    const insufficientCorridor =
      currentGapProfile.maxDeficitY > activationCorridorDeficitY ||
      currentGapProfile.lateMinGapY <
        preferredTargetGapBaseY * safeNumber(snapshot.layout?.leadingNegativeExpansionLateGapFloorFactor, 0.56);
    if (currentTargetGapY >= activationGapY && !insufficientCorridor) return;
    const preferredTargetGapY = Math.max(
      preferredTargetGapBaseY,
      currentTargetGapY +
        clamp(
          candidateShiftYs[candidateShiftYs.length - 1] * safeNumber(snapshot.layout?.leadingNegativeExpansionFactor, 0.68),
          minExpansionY,
          candidateShiftYs[candidateShiftYs.length - 1]
        )
    );
    const evaluateShift = (shiftY) => {
      const gapProfile = measureCorridor(shiftY);
      const nextGeometry = gapProfile.nextGeometry;
      const targetGapY = gapProfile.targetGapY;
      let score =
        Math.max(minTargetGapY - targetGapY, 0) * 180 +
        Math.abs(targetGapY - preferredTargetGapY) * 3.1 +
        shiftY * 0.12;
      const sampleLeft = Math.max(leadGeometry.sourceX, nextGeometry.sourceX);
      const sampleRight = Math.min(leadGeometry.targetX, nextGeometry.targetX);
      if (sampleRight > sampleLeft + 4) {
        sampleRatios.forEach((ratio) => {
          const sampleX = sampleLeft + (sampleRight - sampleLeft) * ratio;
          const leadEnvelope = flowEnvelopeAtX(
            sampleX,
            leadGeometry.sourceX,
            leadGeometry.sourceTop,
            leadGeometry.sourceBottom,
            leadGeometry.targetX,
            leadGeometry.targetTop,
            leadGeometry.targetBottom,
            leadGeometry.options
          );
          const nextEnvelope = flowEnvelopeAtX(
            sampleX,
            nextGeometry.sourceX,
            nextGeometry.sourceTop,
            nextGeometry.sourceBottom,
            nextGeometry.targetX,
            nextGeometry.targetTop,
            nextGeometry.targetBottom,
            nextGeometry.options
          );
          if (!leadEnvelope || !nextEnvelope) return;
          const corridorGapY = nextEnvelope.top - leadEnvelope.bottom;
          const desiredGapY = sourceGapY + (preferredTargetGapY - sourceGapY) * Math.pow(ratio, 1.34);
          const weight = 1.2 + ratio * 3.4;
          score += Math.max(desiredGapY - corridorGapY, 0) * 22 * weight;
          score += Math.max(corridorGapY - (desiredGapY + maxTargetGapOvershootY), 0) * 2.8 * weight;
        });
      }
      score += Math.max(sourceGapY - gapProfile.earlyMinGapY, 0) * 18;
      return score;
    };
    const baselineScore = evaluateShift(0);
    let bestShiftY = 0;
    let bestScore = baselineScore;
    candidateShiftYs.forEach((shiftY) => {
      const score = evaluateShift(shiftY);
      if (score < bestScore) {
        bestScore = score;
        bestShiftY = shiftY;
      }
    });
    if (!(bestShiftY > 0.5) || bestScore >= baselineScore - 1.5) return;
    suffixEntries.forEach((entry) => {
      if (entry.lane === "deduction") {
        deductionBoxes[entry.index] = shiftBoxCenter(deductionBoxes[entry.index], deductionBoxes[entry.index].center + bestShiftY);
      } else {
        opexBoxes[entry.index] = shiftBoxCenter(opexBoxes[entry.index], opexBoxes[entry.index].center + bestShiftY);
      }
    });
  };
  const refineSparseOpexLadderBalance = () => {
    if (deductionBoxes.length || costBreakdownSharesOpexColumn || opexBoxes.length !== 2) return;
    const firstBox = opexBoxes[0];
    const secondBox = opexBoxes[1];
    const firstSourceSlice = opexSourceSlices[0] || opexSlices[0];
    const secondSourceSlice = opexSourceSlices[1] || opexSlices[1];
    if (!firstBox || !secondBox || !firstSourceSlice || !secondSourceSlice) return;
    const currentNodeOffsetY = autoLayoutOffsetForNode("operating-expenses").dy;
    const currentTopGapY = safeNumber(firstBox.top, Infinity) - (opexBottom + currentNodeOffsetY);
    const currentInterGapY = safeNumber(secondBox.top, Infinity) - safeNumber(firstBox.bottom, -Infinity);
    const currentBranchSpreadY =
      (safeNumber(secondBox.center, 0) - (safeNumber(secondSourceSlice.center, 0) + currentNodeOffsetY)) -
      (safeNumber(firstBox.center, 0) - (safeNumber(firstSourceSlice.center, 0) + currentNodeOffsetY));
    const activationInterGapY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderActivationGapY, 244));
    const activationBranchSpreadY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderActivationBranchSpreadY, 316));
    if (currentTopGapY >= scaleY(safeNumber(snapshot.layout?.sparseOpexLadderTopGapActivationY, 10)) &&
        currentInterGapY < activationInterGapY &&
        currentBranchSpreadY < activationBranchSpreadY) {
      return;
    }
    const minInterGapY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMinGapY, 92));
    const availableCompressionY = Math.max(currentInterGapY - minInterGapY, 0);
    const nodeDropMaxY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderNodeDropMaxY, 44));
    const topShiftMaxY = Math.max(
      0,
      Math.min(scaleY(safeNumber(snapshot.layout?.sparseOpexLadderTopShiftMaxY, 42)), availableCompressionY)
    );
    const bottomLiftMaxY = Math.max(
      0,
      Math.min(scaleY(safeNumber(snapshot.layout?.sparseOpexLadderBottomLiftMaxY, 520)), availableCompressionY)
    );
    if (!(nodeDropMaxY > 0.5 || topShiftMaxY > 0.5 || bottomLiftMaxY > 0.5)) return;
    const buildAxisCandidates = (maxY, segments = 6) =>
      Array.from(
        new Set(
          [0, maxY, ...Array.from({ length: segments + 1 }, (_unused, index) => (maxY * index) / Math.max(segments, 1))].map(
            (value) => Number(clamp(value, 0, maxY).toFixed(2))
          )
        )
      );
    const nodeDropCandidates = buildAxisCandidates(nodeDropMaxY, 5);
    const topShiftCandidates = buildAxisCandidates(topShiftMaxY, 5);
    const bottomLiftCandidates = buildAxisCandidates(bottomLiftMaxY, 8);
    const sparseAvailableSpanY = Math.max(
      terminalLayoutBottomLimit - Math.max(rightTerminalSummaryObstacleBottom, opexBottom + currentNodeOffsetY),
      1
    );
    const preferredTopGapY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderPreferredNodeGapY, 16));
    const minTopGapY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMinNodeGapY, 4));
    const maxTopGapY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMaxNodeGapY, 42));
    const preferredInterGapY = clamp(
      sparseAvailableSpanY * safeNumber(snapshot.layout?.sparseOpexLadderPreferredGapFactor, 0.2),
      scaleY(148),
      scaleY(228)
    );
    const maxInterGapY = Math.max(
      preferredInterGapY + scaleY(56),
      scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMaxGapY, 296))
    );
    const preferredFirstBranchDropY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderPreferredFirstDropY, 54));
    const maxFirstBranchDropY = scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMaxFirstDropY, 104));
    const preferredBranchSpreadY = preferredInterGapY + scaleY(safeNumber(snapshot.layout?.sparseOpexLadderBranchSpreadBufferY, 38));
    const maxBranchSpreadY = preferredBranchSpreadY + scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMaxBranchSpreadOvershootY, 84));
    const preferredSecondBranchDropY = preferredFirstBranchDropY + preferredBranchSpreadY;
    const maxSecondBranchDropY = preferredSecondBranchDropY + scaleY(safeNumber(snapshot.layout?.sparseOpexLadderMaxSecondDropOvershootY, 110));
    const resolveCandidateGeometry = (sourceSlice, center, nodeDropY) => {
      const shiftedSourceSlice = {
        ...sourceSlice,
        center: safeNumber(sourceSlice.center, 0) + currentNodeOffsetY + nodeDropY,
      };
      const shiftedClampTop = opexTop + currentNodeOffsetY + nodeDropY;
      const shiftedClampBottom = opexBottom + currentNodeOffsetY + nodeDropY;
      const bridge = constantThicknessBridge(shiftedSourceSlice, center, 14, shiftedClampTop, shiftedClampBottom);
      return {
        targetTop: bridge.targetTop,
        targetHeight: bridge.targetHeight,
        targetBottom: bridge.targetTop + bridge.targetHeight,
        targetCenter: bridge.targetTop + bridge.targetHeight / 2,
      };
    };
    const evaluateCandidate = (nodeDropY, topShiftY, bottomLiftY) => {
      const firstGeometry = resolveCandidateGeometry(firstSourceSlice, firstBox.center + topShiftY, nodeDropY);
      const secondGeometry = resolveCandidateGeometry(secondSourceSlice, secondBox.center - bottomLiftY, nodeDropY);
      const nodeBottomY = opexBottom + currentNodeOffsetY + nodeDropY;
      const topGapY = firstGeometry.targetTop - nodeBottomY;
      const interGapY = secondGeometry.targetTop - firstGeometry.targetBottom;
      const firstBranchDropY = firstGeometry.targetCenter - (safeNumber(firstSourceSlice.center, 0) + currentNodeOffsetY + nodeDropY);
      const secondBranchDropY = secondGeometry.targetCenter - (safeNumber(secondSourceSlice.center, 0) + currentNodeOffsetY + nodeDropY);
      const branchSpreadY = secondBranchDropY - firstBranchDropY;
      let score =
        Math.max(minTopGapY - topGapY, 0) * 240 +
        Math.max(topGapY - maxTopGapY, 0) * 74 +
        Math.abs(topGapY - preferredTopGapY) * 8.2 +
        Math.max(minInterGapY - interGapY, 0) * 210 +
        Math.max(interGapY - maxInterGapY, 0) * 92 +
        Math.abs(interGapY - preferredInterGapY) * 2.4 +
        Math.max(firstBranchDropY - maxFirstBranchDropY, 0) * 128 +
        Math.abs(firstBranchDropY - preferredFirstBranchDropY) * 5.2 +
        Math.max(branchSpreadY - maxBranchSpreadY, 0) * 96 +
        Math.abs(branchSpreadY - preferredBranchSpreadY) * 2.8 +
        Math.max(secondBranchDropY - maxSecondBranchDropY, 0) * 84 +
        Math.abs(secondBranchDropY - preferredSecondBranchDropY) * 2.1;
      score += nodeDropY * 0.1 + topShiftY * 0.12 + bottomLiftY * 0.08;
      return score;
    };
    const baselineScore = evaluateCandidate(0, 0, 0);
    let bestCandidate = {
      nodeDropY: 0,
      topShiftY: 0,
      bottomLiftY: 0,
      score: baselineScore,
    };
    nodeDropCandidates.forEach((nodeDropY) => {
      topShiftCandidates.forEach((topShiftY) => {
        bottomLiftCandidates.forEach((bottomLiftY) => {
          if (topShiftY + bottomLiftY > availableCompressionY + 0.01) return;
          const score = evaluateCandidate(nodeDropY, topShiftY, bottomLiftY);
          if (score < bestCandidate.score) {
            bestCandidate = {
              nodeDropY,
              topShiftY,
              bottomLiftY,
              score,
            };
          }
        });
      });
    });
    if (bestCandidate.score >= baselineScore - 1.5) return;
    if (bestCandidate.nodeDropY > 0.5) {
      setAutoLayoutNodeOffset("operating-expenses", { dy: currentNodeOffsetY + bestCandidate.nodeDropY });
    }
    if (bestCandidate.topShiftY > 0.5 && opexBoxes[0]) {
      opexBoxes[0] = shiftBoxCenter(opexBoxes[0], opexBoxes[0].center + bestCandidate.topShiftY);
    }
    if (bestCandidate.bottomLiftY > 0.5 && opexBoxes[1]) {
      opexBoxes[1] = shiftBoxCenter(opexBoxes[1], opexBoxes[1].center - bestCandidate.bottomLiftY);
    }
  };
  refinePrimaryNegativeLead();
  refineLeadingNegativeExpansion();
  if (costBreakdownSharesOpexColumn) {
    alignOpexSummaryToNode();
    refineSharedNegativeLadder();
    refinePrimaryNegativeLead();
  }
  alignOpexSummaryToNode();
  shiftOpexGroupDownForSummaryClearance();
  refineSparseOpexLadderBalance();
  alignOpexSummaryToNode();
  shiftOpexGroupDownForSummaryClearance();
  if (costBreakdownSharesOpexColumn && costBreakdownBoxes.length) {
    const opexSummaryMetrics = resolveOpexSummaryMetrics(layoutReferenceOffsetFor("operating-expenses"));
    const firstCostBreakdownTopY = Math.min(
      ...costBreakdownBoxes.filter(Boolean).map((box, index) => {
        const shift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
        const clearanceHeight = Math.max(
          safeNumber(costBreakdownGapHeights[index], box.height),
          safeNumber(costBreakdownPackingHeights[index], box.height),
          safeNumber(box.height, 0),
          1
        );
        return safeNumber(box.center, Infinity) + shift.dy - clearanceHeight / 2;
      })
    );
    const desiredCostBreakdownTopY =
      opexSummaryMetrics.bottom +
      scaleY(
        safeNumber(
          snapshot.layout?.opexSummaryToCostBreakdownGapY,
          costBreakdownSlices.length === 2 && costBreakdownSharesOpexColumn ? 30 : 24
        )
      );
    const costBreakdownShiftY = desiredCostBreakdownTopY - firstCostBreakdownTopY;
    if (costBreakdownShiftY > 0.5) {
      shiftCostBreakdownGroupDown(costBreakdownShiftY + scaleY(2));
      maintainCostBreakdownNodeGap();
    }
    alignOpexSummaryToNode();
  }
  if (costBreakdownSharesOpexColumn && costBreakdownBoxes.length >= 2 && opexBoxes.length) {
    const relevantOpexIndexes = opexBoxes
      .map((box, index) => ({ box, index }))
      .filter((entry) => entry.box)
      .slice(0, Math.min(opexBoxes.length, 2))
      .map((entry) => entry.index);
    if (relevantOpexIndexes.length) {
      const computeFirstCostBreakdownTopY = () =>
        Math.min(
          ...costBreakdownBoxes.filter(Boolean).map((box, index) => {
            const shift = layoutReferenceOffsetFor(`cost-breakdown-${index}`);
            return safeNumber(box.top, Infinity) + shift.dy;
          })
        );
      const currentNodeShiftY = autoLayoutOffsetForNode("operating-expenses").dy;
      const summaryObstacle = resolveOpexSummaryObstacleRect(layoutReferenceOffsetFor("operating-expenses"), opexSummaryAutoLiftY, {
        padX: safeNumber(snapshot.layout?.costBreakdownOpexRibbonObstaclePadX, 10),
        padY: safeNumber(snapshot.layout?.costBreakdownOpexRibbonObstaclePadY, 8),
      });
      let summaryGapY = computeFirstCostBreakdownTopY() - summaryObstacle.bottom;
      const preferredSummaryGapY = scaleY(
        safeNumber(snapshot.layout?.sharedOpexClusterPreferredSummaryGapY, costBreakdownBoxes.length >= 2 ? 42 : 32)
      );
      const minSummaryGapY = scaleY(
        safeNumber(snapshot.layout?.sharedOpexClusterMinSummaryGapY, costBreakdownBoxes.length >= 2 ? 26 : 20)
      );
      if (summaryGapY < preferredSummaryGapY - 0.5) {
        const appliedCostShiftY = shiftCostBreakdownGroupDown(preferredSummaryGapY - summaryGapY + scaleY(2));
        if (appliedCostShiftY > 0.01) {
          maintainCostBreakdownNodeGap();
          summaryGapY += appliedCostShiftY;
        }
      }
      const currentTopGapY =
        Math.min(...relevantOpexIndexes.map((index) => safeNumber(opexBoxes[index]?.top, Infinity))) - (opexBottom + currentNodeShiftY);
      const currentAverageBranchDropY =
        relevantOpexIndexes.reduce((sum, index) => {
          const box = opexBoxes[index];
          const sourceSlice = opexSourceSlices[index] || opexSlices[index];
          if (!box || !sourceSlice) return sum;
          return sum + (safeNumber(box.center, 0) - (safeNumber(sourceSlice.center, 0) + currentNodeShiftY));
        }, 0) / Math.max(relevantOpexIndexes.length, 1);
      const preferredTopGapY = scaleY(
        safeNumber(snapshot.layout?.sharedOpexClusterPreferredTopGapY, costBreakdownBoxes.length >= 2 ? 100 : 92)
      );
      const preferredBranchDropY = scaleY(
        safeNumber(snapshot.layout?.sharedOpexClusterPreferredBranchDropY, opexBoxes.length <= 2 ? 146 : 138)
      );
      const requestedNodeDropY = Math.max(
        currentTopGapY - preferredTopGapY,
        currentAverageBranchDropY - preferredBranchDropY,
        0
      );
      const nodeDropMaxY = Math.max(
        0,
        Math.min(
          scaleY(safeNumber(snapshot.layout?.sharedOpexClusterNodeDropMaxY, 28)),
          summaryGapY - minSummaryGapY
        )
      );
      const appliedNodeDropY = clamp(requestedNodeDropY, 0, nodeDropMaxY);
      if (appliedNodeDropY > 0.5) {
        setAutoLayoutNodeOffset("operating-expenses", { dy: currentNodeShiftY + appliedNodeDropY });
        alignOpexSummaryToNode();
      }
    }
  }
  const refineCostStageElbowBalance = () => {
    if (!(showCostBridge && costBreakdownBoxes.length)) return;
    const leadCostBreakdownEntry = costBreakdownBoxes
      .map((box, index) => ({
        box,
        index,
        sourceSlice: costBreakdownSourceSlices[index] || costBreakdownSlices[index] || null,
      }))
      .filter((entry) => entry.box && entry.sourceSlice)
      .sort(
        (left, right) =>
          safeNumber(left.sourceSlice?.top, Infinity) - safeNumber(right.sourceSlice?.top, Infinity) || left.index - right.index
      )[0];
    if (!leadCostBreakdownEntry) return;
    const costShift = layoutReferenceOffsetFor("cost");
    const grossShift = layoutReferenceOffsetFor("gross");
    const targetShift = layoutReferenceOffsetFor(`cost-breakdown-${leadCostBreakdownEntry.index}`);
    const leadSourceHeight = Math.max(
      safeNumber(leadCostBreakdownEntry.sourceSlice?.height, 0),
      safeNumber(leadCostBreakdownEntry.box?.height, 0),
      1
    );
    const leadBridge = constantThicknessBridge(
      leadCostBreakdownEntry.sourceSlice,
      safeNumber(leadCostBreakdownEntry.box?.center, safeNumber(leadCostBreakdownEntry.sourceSlice?.center, 0)),
      10,
      costTop,
      costBottom
    );
    const leadTargetTopY = safeNumber(leadBridge?.targetTop, safeNumber(leadCostBreakdownEntry.box?.top, 0)) + targetShift.dy;
    const leadDropHeightRatio = clamp(
      safeNumber(
        snapshot.layout?.costStageLeadBreakdownDropHeightRatio,
        costBreakdownBoxes.length >= 5
          ? 0.26
          : costBreakdownBoxes.length === 4
            ? 0.24
            : costBreakdownBoxes.length === 3
              ? 0.22
              : 0.18
      ),
      0.1,
      0.42
    );
    const currentLeadTopDropY =
      leadTargetTopY -
      (safeNumber(leadCostBreakdownEntry.sourceSlice?.top, 0) + costShift.dy);
    const desiredLeadTopDropY = clamp(
      Math.max(
        scaleY(
          safeNumber(
            snapshot.layout?.costStageLeadBreakdownMinTopDropY,
            costBreakdownBoxes.length >= 5
              ? 64
              : costBreakdownBoxes.length === 4
                ? 56
                : costBreakdownBoxes.length === 3
                  ? 48
                  : costBreakdownBoxes.length === 2
                    ? 40
                    : 30
          )
        ),
        leadSourceHeight * leadDropHeightRatio
      ) +
        lowerRightPressureY *
          safeNumber(
            snapshot.layout?.costStageLeadBreakdownDropPressureFactor,
            costBreakdownBoxes.length >= 4 ? 0.14 : 0.1
          ),
      scaleY(24),
      Math.max(
        scaleY(safeNumber(snapshot.layout?.costStageLeadBreakdownMaxTopDropY, costBreakdownBoxes.length >= 4 ? 92 : 74)),
        leadSourceHeight * safeNumber(snapshot.layout?.costStageLeadBreakdownMaxHeightRatio, 0.42)
      )
    );
    const requestedLiftY = Math.max(desiredLeadTopDropY - currentLeadTopDropY, 0);
    const currentVisibleCostGapY =
      costTop + costShift.dy - (grossBottom + grossShift.dy);
    const retainedGapFactor = clamp(
      safeNumber(snapshot.layout?.costStageLiftRetainedGapFactor, costBreakdownBoxes.length >= 3 ? 0.62 : 0.72),
      0.35,
      1
    );
    const retainedCostGapY = Math.max(
      costMinGapFromGross,
      desiredCostGapFromGrossY * retainedGapFactor,
      scaleY(safeNumber(snapshot.layout?.costStageLiftGuardGapY, costBreakdownBoxes.length >= 3 ? 26 : 22))
    );
    const availableLiftY = Math.max(currentVisibleCostGapY - retainedCostGapY, 0);
    const appliedLiftY = Math.min(
      requestedLiftY,
      availableLiftY,
      scaleY(
        safeNumber(
          snapshot.layout?.costStageElbowLiftMaxY,
          costBreakdownBoxes.length >= 5 ? 34 : costBreakdownBoxes.length >= 3 ? 28 : 22
        )
      )
    );
    if (!(requestedLiftY > 0.5)) return;
    if (!(appliedLiftY > 0.5)) return;
    const currentAutoCostShiftY = autoLayoutOffsetForNode("cost").dy;
    setAutoLayoutNodeOffset("cost", { dy: currentAutoCostShiftY - appliedLiftY });
  };
  refineCostStageElbowBalance();
  refreshEditableNodeFrames();
  const revenueGrossBand = shiftedInterval(revenueGrossSourceBand.top, revenueGrossSourceBand.bottom, "revenue");
  const revenueCostBand = revenueCostSourceBand ? shiftedInterval(revenueCostSourceBand.top, revenueCostSourceBand.bottom, "revenue") : null;
  const grossProfitBand = shiftedInterval(grossProfitSourceBand.top, grossProfitSourceBand.bottom, "gross");
  const grossExpenseBand = shiftedInterval(grossExpenseSourceBand.top, grossExpenseSourceBand.bottom, "gross");
  const opexInboundBand = shiftedInterval(opexInboundTargetBand.top, opexInboundTargetBand.bottom, "operating-expenses");
  const opNetBand = shiftedInterval(opNetSourceBand.top, opNetSourceBand.bottom, "operating");
  const netDisplayBand = shiftedInterval(netDisplayTargetBand.top, netDisplayTargetBand.bottom, "net");
  const grossMetricYShifted = grossMetricY + editorOffsetForNode("gross").dy;
  const operatingMetricYShifted = operatingMetricY + editorOffsetForNode("operating").dy;
  const revenueLabelCenterXShifted = revenueLabelCenterX + editorOffsetForNode("revenue").dx;
  const revenueLabelCenterYShifted = revenueLabelCenterY + editorOffsetForNode("revenue").dy;
  const opexSummaryCenterXShifted = operatingExpenseFrame.centerX;
  const opexSummaryTopYShifted = opexSummaryTopY + editorOffsetForNode("operating-expenses").dy;
  const opexSummaryValueYShifted = opexSummaryValueY + editorOffsetForNode("operating-expenses").dy;
  const opexSummaryRatioYShifted = opexSummaryRatioY + editorOffsetForNode("operating-expenses").dy;
  const costSummaryBaselineY = resolveExpenseSummaryBaselineY(costFrame.bottom, {
    visualGapY: safeNumber(snapshot.layout?.costSummaryGapY, 28),
  });
  const mainOutflowSmoothingBoost = clamp(lowerRightPressureY / scaleY(92), 0, 1);
  const grossToOperatingRibbonOptions = {
    curveFactor: 0.6 + mainOutflowSmoothingBoost * 0.04,
    startCurveFactor: 0.2 + mainOutflowSmoothingBoost * 0.03,
    endCurveFactor: 0.33 + mainOutflowSmoothingBoost * 0.03,
    minStartCurveFactor: 0.17,
    maxStartCurveFactor: 0.32,
    minEndCurveFactor: 0.24,
    maxEndCurveFactor: 0.38,
    deltaScale: 0.84,
    deltaInfluence: 0.028,
    deltaCurveBoost: 0.028,
    sourceHoldFactor: 0.024,
    minSourceHoldLength: 0,
    maxSourceHoldLength: 4,
    targetHoldFactor: 0.054,
    minTargetHoldLength: 4,
    maxTargetHoldLength: 16,
    sourceHoldDeltaReduction: 0.76,
    targetHoldDeltaReduction: 0.84,
    minAdaptiveSourceHoldLength: 0.5,
    minAdaptiveTargetHoldLength: 1.5,
    holdDeltaScale: 0.42,
  };
  const grossToExpenseRibbonOptions = {
    curveFactor: 0.62 + mainOutflowSmoothingBoost * 0.05,
    startCurveFactor: 0.22 + mainOutflowSmoothingBoost * 0.04,
    endCurveFactor: 0.34 + mainOutflowSmoothingBoost * 0.03,
    minStartCurveFactor: 0.18,
    maxStartCurveFactor: 0.34,
    minEndCurveFactor: 0.24,
    maxEndCurveFactor: 0.4,
    deltaScale: 0.78,
    deltaInfluence: 0.026,
    deltaCurveBoost: 0.03,
    sourceHoldFactor: 0.018,
    minSourceHoldLength: 0,
    maxSourceHoldLength: 3,
    targetHoldFactor: 0.048,
    minTargetHoldLength: 3,
    maxTargetHoldLength: 14,
    sourceHoldDeltaReduction: 0.82,
    targetHoldDeltaReduction: 0.88,
    minAdaptiveSourceHoldLength: 0.5,
    minAdaptiveTargetHoldLength: 1.5,
    holdDeltaScale: 0.4,
  };
  const shiftedMainNetRibbonEnvelopeAtX = (sampleX) =>
    flowEnvelopeAtX(
      sampleX,
      operatingFrame.right,
      opNetBand.top,
      opNetBand.bottom,
      netFrame.x + safeNumber(snapshot.layout?.netTargetCoverInsetX, 0),
      netDisplayBand.top,
      netDisplayBand.bottom,
      netRibbonOptions
    );

  let svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(titleText)}" font-family="Aptos, Segoe UI, Arial, Helvetica, sans-serif" data-editor-bounds-left="0" data-editor-bounds-top="0" data-editor-bounds-right="${width}" data-editor-bounds-bottom="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${background}"></rect>
      <g id="chartContent">
      <text x="${titleX}" y="${titleY}" text-anchor="${titleAnchor}" font-size="${titleFontSize}" font-weight="800" fill="${titleColor}" letter-spacing="0.3">${escapeHtml(titleText)}</text>
      ${snapshot.periodEndLabel ? `<text x="${periodEndX}" y="${periodEndY}" text-anchor="start" font-size="${periodEndFontSize}" fill="${muted}">${escapeHtml(localizePeriodEndLabel(snapshot.periodEndLabel || ""))}</text>` : ""}
      ${renderCorporateLogo(snapshot.companyLogoKey, logoX, logoY, { scale: logoScale })}
    `;

  leftDetailRenderSlices.forEach((slice, index) => {
    svg += renderLeftDetailLabel(slice, {
      ...leftDetailLabelBoxes[index],
      previousRibbonBottom: index > 0 ? leftDetailRenderSlices[index - 1]?.bottom : null,
    }, index);
  });

  sourceSlices.forEach((slice, index) => {
    const sourceFrame = editableNodeFrame(`source-${index}`, safeNumber(slice.nodeX, leftX), slice.top, sourceNodeWidth, slice.height);
    const revenueBandTop = slice.revenueTop + editorOffsetForNode("revenue").dy;
    const revenueBandBottom = slice.revenueBottom + editorOffsetForNode("revenue").dy;
    svg += `<path d="${sourceFlowPath(sourceFrame.right, sourceFrame.top, sourceFrame.bottom, revenueFrame.left, revenueBandTop, revenueBandBottom)}" fill="${slice.item.flowColor}" opacity="0.98"></path>`;
    svg += renderEditableNodeRect(sourceFrame, slice.item.nodeColor);
    svg += renderLeftLabel(slice, leftBoxes[index], index);
  });

  svg += `
      ${renderEditableNodeRect(revenueFrame, revenueNodeFill)}

      <path d="${replicaFlowPath(revenueFrame.right, revenueGrossBand.top, revenueGrossBand.bottom, grossFrame.left, grossFrame.top, grossFrame.bottom)}" fill="${greenFlow}" opacity="0.97"></path>
      ${
        showCostBridge && revenueCostBand
          ? `<path d="${replicaFlowPath(revenueFrame.right, revenueCostBand.top, revenueCostBand.bottom, costFrame.left, costFrame.top, costFrame.bottom)}" fill="${redFlow}" opacity="0.97"></path>`
          : ""
      }

      ${renderEditableNodeRect(grossFrame, greenNode)}
      ${renderMetricCluster(
        grossFrame.centerX,
        grossMetricYShifted,
        localizeChartPhrase(snapshot.grossProfitLabel || "Gross profit"),
        formatBillions(grossProfitBn),
        snapshot.grossMarginPct !== null && snapshot.grossMarginPct !== undefined ? `${formatPct(snapshot.grossMarginPct)} ${marginLabel()}` : "",
        snapshot.grossMarginYoyDeltaPp !== null && snapshot.grossMarginYoyDeltaPp !== undefined ? formatPp(snapshot.grossMarginYoyDeltaPp) : "",
        greenText,
        grossMetricLayout
      )}

      ${
        showCostBridge
          ? `
      ${renderEditableNodeRect(costFrame, redNode)}
      ${svgTextBlock(costFrame.centerX, costSummaryBaselineY, costLabelLines, {
        fill: redText,
        fontSize: expenseSummaryLayout.titleSize,
        weight: 700,
        anchor: "middle",
        lineHeight: expenseSummaryLayout.titleSize + 1,
        haloColor: background,
        haloWidth: expenseSummaryLayout.titleStroke,
      })}
      <text x="${costFrame.centerX}" y="${costSummaryBaselineY + (costLabelLines.length - 1) * (expenseSummaryLayout.titleSize + 1) + expenseSummaryLayout.valueOffset}" text-anchor="middle" font-size="${expenseSummaryLayout.valueSize}" font-weight="700" fill="${redText}" paint-order="stroke fill" stroke="${background}" stroke-width="${expenseSummaryLayout.valueStroke}" stroke-linejoin="round">${escapeHtml(formatBillionsByMode(costOfRevenueBn, "negative-parentheses"))}</text>
      `
          : ""
      }

      <path d="${replicaOutflowPath(grossFrame.right, grossProfitBand.top, grossProfitBand.bottom, operatingFrame.left, operatingFrame.top, operatingFrame.bottom, grossToOperatingRibbonOptions)}" fill="${greenFlow}" opacity="0.97"></path>
      <path d="${replicaOutflowPath(grossFrame.right, grossExpenseBand.top, grossExpenseBand.bottom, operatingExpenseFrame.left, opexInboundBand.top, opexInboundBand.bottom, grossToExpenseRibbonOptions)}" fill="${redFlow}" opacity="0.97"></path>

      ${renderEditableNodeRect(operatingFrame, greenNode)}
      ${renderMetricCluster(
        operatingFrame.centerX,
        operatingMetricYShifted,
        localizeChartPhrase(snapshot.operatingProfitLabel || "Operating profit"),
        formatBillions(rawOperatingProfitBn),
        snapshot.operatingMarginPct !== null && snapshot.operatingMarginPct !== undefined ? `${formatPct(snapshot.operatingMarginPct)} ${marginLabel()}` : "",
        snapshot.operatingMarginYoyDeltaPp !== null && snapshot.operatingMarginYoyDeltaPp !== undefined ? formatPp(snapshot.operatingMarginYoyDeltaPp) : "",
        greenText,
        operatingMetricLayout
      )}

      ${renderEditableNodeRect(operatingExpenseFrame, redNode)}

  `;

  let positiveMarkup = "";
  if (positiveAdjustments.length) {
    const positiveRunwayAvailable = Math.max(netX - (opX + nodeWidth), 1);
    const positiveReferenceHeight = positiveHeights.length ? Math.max(...positiveHeights) : scaleY(10);
    const positiveNodeWidth = clamp(
      safeNumber(
        snapshot.layout?.positiveNodeWidth,
        Math.max(
          positiveReferenceHeight * safeNumber(snapshot.layout?.positiveSourceCapWidthFactor, 3.4),
          positiveRunwayAvailable * safeNumber(snapshot.layout?.positiveSourceCapWidthRunwayFactor, 0.065) +
            safeNumber(snapshot.layout?.positiveSourceCapBaseWidth, 52)
        )
      ),
      safeNumber(snapshot.layout?.positiveNodeMinWidth, 56),
      Math.max(
        safeNumber(snapshot.layout?.positiveNodeMaxWidth, clamp(positiveRunwayAvailable * 0.22, 84, 112)),
        safeNumber(snapshot.layout?.positiveNodeMinWidth, 56)
      )
    );
    const positiveTargetInsetX = safeNumber(snapshot.layout?.positiveTargetInsetX, 0);
    const positiveMergeOverlapY = scaleY(safeNumber(snapshot.layout?.positiveMergeOverlapY, 0));
    const positiveNodeMinX = opX + nodeWidth + clamp(
      safeNumber(snapshot.layout?.positiveNodeMinOffsetFromOpX, positiveRunwayAvailable * (positiveAbove ? 0.08 : 0.1)),
      24,
      56
    );
    const positiveNodeMaxX = netX - positiveNodeWidth - clamp(
      safeNumber(snapshot.layout?.positiveNodeMinOffsetFromNetX, positiveRunwayAvailable * (positiveAbove ? 0.055 : 0.07)),
      18,
      56
    );
    const positiveNetAffinityStrength = clamp(
      safeNumber(
        snapshot.layout?.positiveNetAffinityStrength,
        positiveAbove
          ? (positiveAdjustments.length === 1 ? 0.2 : 0) +
            clamp(lowerRightPressureY / scaleY(92), 0, 1) * 0.18 +
            Math.max(rawCostBreakdown.length + rawOpexItems.length + rawBelowOperatingItems.length - 4, 0) * 0.04
          : 0
      ),
      0,
      0.48
    );
    const positiveBranchRunwayX = clamp(
      safeNumber(
        snapshot.layout?.positiveBranchRunwayX,
        Math.max(
          positiveReferenceHeight * safeNumber(snapshot.layout?.positiveBranchRunwayHeightFactor, positiveAbove ? 0.98 : 0.94),
          positiveRunwayAvailable * safeNumber(snapshot.layout?.positiveBranchRunwayFactor, positiveAbove ? 0.074 : 0.068),
          positiveAbove ? 42 : 38
        )
      ),
      positiveAbove ? 30 : 28,
      Math.max(positiveRunwayAvailable - positiveNodeWidth - 20, positiveAbove ? 30 : 28)
    );
    const defaultPositiveNodeX = clamp(
      netX - positiveNodeWidth - positiveBranchRunwayX,
      positiveNodeMinX,
      Math.max(positiveNodeMaxX, positiveNodeMinX)
    );
    const positiveCorridorSampleXsForNode = (candidateNodeX) => {
      const runwayDx = Math.max(netX - (candidateNodeX + positiveNodeWidth), 1);
      return [0.14, 0.32, 0.52, 0.74].map((t) =>
        clamp(
          candidateNodeX + positiveNodeWidth + runwayDx * t,
          candidateNodeX + positiveNodeWidth + 1,
          Math.max(netX - 2, candidateNodeX + positiveNodeWidth + 1)
        )
      );
    };
    let positiveNodeX = defaultPositiveNodeX;
    const positiveSourceDropY = 0;
    let positiveTop = positiveAbove
      ? clamp(
          netTop - totalPositiveStackHeight - positiveNodeGap,
          scaleY(212) + positiveLabelBlockHeight,
          netTop - scaleY(10) - totalPositiveStackHeight
        )
      : clamp(
          netBottom + positiveNodeGap,
          scaleY(308),
          chartBottomLimit - totalPositiveStackHeight - positiveLabelBlockHeight - scaleY(12)
        );
    let upperMetricFloor = Math.max(grossMetricY + grossMetricLayout.blockHeight, operatingMetricY + operatingMetricLayout.blockHeight);
    let positiveBranchClearanceY = Math.max(scaleY(16), positiveReferenceHeight * 0.72);
    let positiveCapClearanceY = Math.max(scaleY(12), positiveReferenceHeight * 0.52);
    const positiveProminenceRatio =
      totalPositiveMergeHeight > 0 && coreNetTargetHeight > 0 ? totalPositiveMergeHeight / Math.max(coreNetTargetHeight, 1) : 0;
    const positiveProminentAbove =
      positiveAbove &&
      positiveProminenceRatio >= safeNumber(snapshot.layout?.positiveProminentThresholdRatio, 0.6);
    const positiveBranchPathOptions = {
      curveFactor: positiveAbove ? 0.68 : 0.7,
      startCurveFactor: positiveAbove ? 0.28 : 0.26,
      endCurveFactor: positiveAbove ? 0.42 : 0.46,
      minStartCurveFactor: 0.22,
      maxStartCurveFactor: 0.36,
      minEndCurveFactor: 0.34,
      maxEndCurveFactor: 0.54,
      deltaScale: 0.78,
      deltaInfluence: 0.036,
      thicknessInfluence: 0.038,
      sourceHoldFactor: 0,
      minSourceHoldLength: 0,
      maxSourceHoldLength: 1,
      targetHoldFactor: 0,
      minTargetHoldLength: 0,
      maxTargetHoldLength: 2,
      sourceHoldDeltaReduction: 0.08,
      targetHoldDeltaReduction: 0.14,
      minAdaptiveSourceHoldLength: 0,
      minAdaptiveTargetHoldLength: 0,
    };
    const grossMetricObstacle = metricClusterObstacleRect(
      grossFrame.centerX,
      grossMetricYShifted,
      snapshot.grossProfitLabel || "Gross profit",
      formatBillions(grossProfitBn),
      snapshot.grossMarginPct !== null && snapshot.grossMarginPct !== undefined ? `${formatPct(snapshot.grossMarginPct)} ${marginLabel()}` : "",
      snapshot.grossMarginYoyDeltaPp !== null && snapshot.grossMarginYoyDeltaPp !== undefined ? formatPp(snapshot.grossMarginYoyDeltaPp) : "",
      grossMetricLayout,
      scaleY(10)
    );
    const operatingMetricObstacle = metricClusterObstacleRect(
      operatingFrame.centerX,
      operatingMetricYShifted,
      snapshot.operatingProfitLabel || "Operating profit",
      formatBillions(rawOperatingProfitBn),
      snapshot.operatingMarginPct !== null && snapshot.operatingMarginPct !== undefined ? `${formatPct(snapshot.operatingMarginPct)} ${marginLabel()}` : "",
      snapshot.operatingMarginYoyDeltaPp !== null && snapshot.operatingMarginYoyDeltaPp !== undefined ? formatPp(snapshot.operatingMarginYoyDeltaPp) : "",
      operatingMetricLayout,
      scaleY(10)
    );
    const netSummaryObstacle = rightSummaryObstacleRect(
      netSummaryLines,
      netFrame.x + nodeWidth + rightPrimaryLabelGapX,
      netFrame.centerY,
      scaleY(10)
    );
    const positiveUpperObstacleBottomAtX = (sampleX) => {
      let bottom = 0;
      [grossMetricObstacle, operatingMetricObstacle].forEach((obstacle) => {
        if (!obstacle) return;
        if (sampleX >= obstacle.left && sampleX <= obstacle.right) {
          bottom = Math.max(bottom, obstacle.bottom);
        }
      });
      return bottom;
    };
    const positiveUpperObstacleBottomForXs = (sampleXs) =>
      sampleXs.reduce((maxBottom, sampleX) => Math.max(maxBottom, positiveUpperObstacleBottomAtX(sampleX)), 0);
    const rightSideObstacles = [
      { left: netFrame.left - 10, right: netFrame.right + 10, top: netFrame.top - 10, bottom: netFrame.bottom + 10 },
      netSummaryObstacle,
      grossMetricObstacle,
      operatingMetricObstacle,
      ...deductionBoxes.map((box) => ({ left: belowLabelX - 12, right: width - 56, top: box.top - 6, bottom: box.bottom + 6 })),
      ...opexBoxes.map((box) => ({ left: opexLabelX - 12, right: width - 56, top: box.top - 6, bottom: box.bottom + 6 })),
    ];
    const deductionFlowObstacles = deductionSlices
      .map((slice, index) => {
        const box = deductionBoxes[index];
        if (!box) return null;
        const sourceSlice = deductionSourceSlices[index] || slice;
        const adjustedSourceSlice = resolveDeductionTerminalSourceSlice(index, sourceSlice);
        const bridge = constantThicknessBridge(
          adjustedSourceSlice,
          box.center,
          slice.item.name === "Other" ? 6 : 12,
          opDeductionSourceBand.top,
          opDeductionSourceBand.bottom
        );
        const branchOptions = resolveAdaptiveNegativeTerminalBranchOptions(
          resolveDeductionTerminalBranchOptions(index),
          bridge.sourceTop + editorOffsetForNode("operating").dy,
          bridge.sourceBottom + editorOffsetForNode("operating").dy,
          bridge.targetTop + editorOffsetForNode(`deduction-${index}`).dy,
          bridge.targetHeight,
          {
            index,
            count: Math.max(deductionSlices.length + opexSlices.length, 1),
            laneBias: index === 0 ? 0.1 : 0.06,
          }
        );
        const targetFrame = editableNodeFrame(`deduction-${index}`, rightTerminalNodeX, bridge.targetTop, nodeWidth, bridge.targetHeight);
        return bridgeObstacleRect(
          operatingFrame.right,
          bridge.sourceTop + editorOffsetForNode("operating").dy,
          bridge.sourceBottom + editorOffsetForNode("operating").dy,
          targetFrame.x,
          targetFrame.y,
          targetFrame.height,
          {
            targetWidth: nodeWidth,
            padX: scaleY(18),
            padY: scaleY(12),
            branchOptions,
          }
        );
      })
      .filter(Boolean);
    const opexFlowObstacles = opexSlices
      .map((slice, index) => {
        const box = opexBoxes[index];
        const sourceSlice = opexSourceSlices[index] || slice;
        if (!box || !sourceSlice) return null;
        const bridge = constantThicknessBridge(sourceSlice, box.center, 12, opDeductionSourceBand.top, opDeductionSourceBand.bottom);
        const branchOptions = resolveAdaptiveNegativeTerminalBranchOptions(
          standardTerminalBranchOptions,
          bridge.sourceTop + editorOffsetForNode("operating-expenses").dy,
          bridge.sourceBottom + editorOffsetForNode("operating-expenses").dy,
          bridge.targetTop + editorOffsetForNode(`opex-${index}`).dy,
          bridge.targetHeight,
          {
            index,
            count: Math.max(opexSlices.length, 1),
            laneBias: 0.04,
          }
        );
        const targetFrame = editableNodeFrame(`opex-${index}`, rightTerminalNodeX, bridge.targetTop, nodeWidth, bridge.targetHeight);
        return bridgeObstacleRect(
          operatingExpenseFrame.right,
          bridge.sourceTop + editorOffsetForNode("operating-expenses").dy,
          bridge.sourceBottom + editorOffsetForNode("operating-expenses").dy,
          targetFrame.x,
          targetFrame.y,
          targetFrame.height,
          {
            targetWidth: nodeWidth,
            padX: scaleY(18),
            padY: scaleY(12),
            branchOptions,
          }
        );
      })
      .filter(Boolean);
    const positiveLabelObstacles = [...rightSideObstacles, ...deductionFlowObstacles, ...opexFlowObstacles];
    const branchSourceInsetX = Math.max(safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5), 0);
    const branchTargetInsetX = safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14);
    const deductionBranchModels = deductionSlices
      .map((slice, index) => {
        const box = deductionBoxes[index];
        if (!box) return null;
        const sourceSlice = deductionSourceSlices[index] || slice;
        const deductionSourceSlice = resolveDeductionTerminalSourceSlice(index, sourceSlice);
        const bridge = constantThicknessBridge(
          deductionSourceSlice,
          box.center,
          slice.item.name === "Other" ? 6 : 12,
          opDeductionSourceBand.top,
          opDeductionSourceBand.bottom
        );
        const sourceShift = editorOffsetForNode("operating");
        const targetFrame = editableNodeFrame(`deduction-${index}`, rightTerminalNodeX, bridge.targetTop, nodeWidth, bridge.targetHeight);
        const options = resolveAdaptiveNegativeTerminalBranchOptions(
          resolveDeductionTerminalBranchOptions(index),
          bridge.sourceTop + sourceShift.dy,
          bridge.sourceBottom + sourceShift.dy,
          targetFrame.y,
          targetFrame.height,
          {
            index,
            count: Math.max(deductionSlices.length + opexSlices.length, 1),
            laneBias: index === 0 ? 0.1 : 0.06,
          }
        );
        return {
          x0: operatingFrame.right - branchSourceInsetX,
          x1: targetFrame.x + safeNumber(options.targetCoverInsetX, branchTargetInsetX),
          sourceTop: bridge.sourceTop + sourceShift.dy,
          sourceBottom: bridge.sourceBottom + sourceShift.dy,
          targetTop: targetFrame.y,
          targetHeight: targetFrame.height,
          options,
        };
      })
      .filter(Boolean);
    const opexBranchModels = opexSlices
      .map((slice, index) => {
        const box = opexBoxes[index];
        const sourceSlice = opexSourceSlices[index] || slice;
        if (!box || !sourceSlice) return null;
        const bridge = constantThicknessBridge(sourceSlice, box.center, 14, opexTop, opexBottom);
        const targetFrame = editableNodeFrame(`opex-${index}`, rightTerminalNodeX, bridge.targetTop, nodeWidth, bridge.targetHeight);
        const options = resolveAdaptiveNegativeTerminalBranchOptions(
          standardTerminalBranchOptions,
          bridge.sourceTop + editorOffsetForNode("operating-expenses").dy,
          bridge.sourceBottom + editorOffsetForNode("operating-expenses").dy,
          targetFrame.y,
          targetFrame.height,
          {
            index,
            count: Math.max(opexSlices.length, 1),
            laneBias: 0.04,
          }
        );
        return {
          x0: operatingExpenseFrame.right - branchSourceInsetX,
          x1: targetFrame.x + safeNumber(options.targetCoverInsetX, branchTargetInsetX),
          sourceTop: bridge.sourceTop + editorOffsetForNode("operating-expenses").dy,
          sourceBottom: bridge.sourceBottom + editorOffsetForNode("operating-expenses").dy,
          targetTop: targetFrame.y,
          targetHeight: targetFrame.height,
          options,
        };
      })
      .filter(Boolean);
    const positiveRibbonTopAtX = (sampleX) => {
      let top = Infinity;
      [...deductionBranchModels, ...opexBranchModels].forEach((model) => {
        const envelope = flowEnvelopeAtX(
          sampleX,
          model.x0,
          model.sourceTop,
          model.sourceBottom,
          model.x1,
          model.targetTop,
          model.targetTop + model.targetHeight,
          model.options
        );
        if (envelope) {
          top = Math.min(top, envelope.top);
        }
      });
      return top;
    };
    const netMainRibbonBottomAtX = (sampleX) => {
      const envelope = shiftedMainNetRibbonEnvelopeAtX(sampleX);
      return envelope ? envelope.bottom : -Infinity;
    };
    const netMainRibbonTopAtX = (sampleX) => {
      const envelope = shiftedMainNetRibbonEnvelopeAtX(sampleX);
      return envelope ? envelope.top : Infinity;
    };
    const positiveTerminalObstacleReachX = Math.max(
      safeNumber(
        snapshot.layout?.positiveTerminalObstacleReachX,
        Math.max(
          positiveBranchRunwayX * safeNumber(snapshot.layout?.positiveTerminalObstacleReachFactor, 0.9),
          positiveAbove ? 68 : 56
        )
      ),
      24
    );
    let positiveTerminalNodeObstacles = [];
    let corridorSampleXs = [];
    let positiveTopMin = positiveTop;
    let positiveTopMax = positiveTop;
    if (positiveAdjustments.length) {
      const netShift = editorOffsetForNode("net");
      const positiveTargetStackCenter =
        positiveTargetBands.length
          ? (safeNumber(positiveTargetBands[0]?.top, netTop) + safeNumber(positiveTargetBands[positiveTargetBands.length - 1]?.bottom, netBottom)) / 2 + netShift.dy
          : (safeNumber(netPositiveTop, netTop) + safeNumber(netPositiveTop + totalPositiveHeight, netBottom)) / 2 + netShift.dy;
      const positiveTargetStackTop = positiveTargetBands.length
        ? safeNumber(positiveTargetBands[0]?.top, netTop) + netShift.dy
        : netPositiveTop + netShift.dy;
      const positiveTargetStackBottom = positiveTargetBands.length
        ? safeNumber(positiveTargetBands[positiveTargetBands.length - 1]?.bottom, netBottom) + netShift.dy
        : netPositiveTop + totalPositiveHeight + netShift.dy;
      positiveBranchClearanceY = Math.max(
        scaleY(safeNumber(snapshot.layout?.positiveBranchClearanceY, 16)),
        positiveReferenceHeight * safeNumber(snapshot.layout?.positiveBranchClearanceHeightFactor, 0.72)
      );
      positiveCapClearanceY = Math.max(
        scaleY(safeNumber(snapshot.layout?.positiveCapClearanceY, 12)),
        positiveReferenceHeight * safeNumber(snapshot.layout?.positiveCapClearanceHeightFactor, 0.52)
      );
      const positiveTerminalClearanceY = Math.max(
        scaleY(safeNumber(snapshot.layout?.positiveTerminalClearanceY, positiveAbove ? 24 : 20)),
        positiveCapClearanceY * safeNumber(snapshot.layout?.positiveTerminalClearanceCapFactor, positiveAbove ? 1.45 : 1.18)
      );
      const positiveTerminalCapClearanceY = Math.max(
        scaleY(safeNumber(snapshot.layout?.positiveTerminalCapObstacleClearanceY, positiveAbove ? 36 : 28)),
        positiveCapClearanceY * safeNumber(snapshot.layout?.positiveTerminalCapObstacleClearanceFactor, positiveAbove ? 2.25 : 1.65)
      );
      const positiveTerminalLabelObstacles = [...deductionBoxes, ...opexBoxes]
        .filter(Boolean)
        .map((box) => ({
          left: rightTerminalNodeX - positiveTerminalObstacleReachX,
          right: rightTerminalNodeX + nodeWidth,
          top: box.top - positiveTerminalClearanceY,
          bottom: box.bottom + positiveTerminalClearanceY,
        }));
      const positiveTerminalCapObstacles = [...deductionBranchModels, ...opexBranchModels]
        .map((model) => ({
          left: rightTerminalNodeX - positiveTerminalObstacleReachX,
          right: rightTerminalNodeX + nodeWidth,
          top: model.targetTop - positiveTerminalCapClearanceY,
          bottom: model.targetTop + model.targetHeight + positiveTerminalCapClearanceY,
        }));
      positiveTerminalNodeObstacles = [...positiveTerminalLabelObstacles, ...positiveTerminalCapObstacles];
      const positiveProminentMinRunwayX = positiveProminentAbove
        ? Math.max(
            safeNumber(snapshot.layout?.positiveProminentMinRunwayX, 96),
            totalPositiveStackHeight * safeNumber(snapshot.layout?.positiveProminentMinRunwayHeightFactor, 0.78)
          )
        : 0;
      const effectivePositiveNodeMaxX = positiveProminentAbove
        ? Math.min(positiveNodeMaxX, netX - positiveNodeWidth - positiveProminentMinRunwayX)
        : positiveNodeMaxX;
      const positiveNodeXCandidates = [
        effectivePositiveNodeMaxX,
        netX - positiveNodeWidth - Math.max(positiveBranchRunwayX * 0.36, positiveAbove ? 14 : 12),
        netX - positiveNodeWidth - Math.max(positiveBranchRunwayX * 0.58, positiveAbove ? 20 : 18),
        defaultPositiveNodeX,
        netX - positiveNodeWidth - Math.max(positiveBranchRunwayX * 0.82, positiveAbove ? 28 : 24),
        positiveNodeMinX,
        positiveNodeMinX + (effectivePositiveNodeMaxX - positiveNodeMinX) * 0.25,
        (positiveNodeMinX + effectivePositiveNodeMaxX) / 2,
        positiveNodeMinX + (effectivePositiveNodeMaxX - positiveNodeMinX) * 0.75,
      ]
        .map((value) => clamp(value, positiveNodeMinX, Math.max(effectivePositiveNodeMaxX, positiveNodeMinX)))
        .filter((value, index, values) => values.findIndex((candidate) => Math.abs(candidate - value) < 1) === index);
      let bestNodePlacement = null;
      positiveNodeXCandidates.forEach((candidateNodeX) => {
        const runwayDx = Math.max(netX - (candidateNodeX + positiveNodeWidth), 1);
        const corridorSampleXsCandidate = positiveCorridorSampleXsForNode(candidateNodeX);
        const preferredVisualGapY = Math.max(
          safeNumber(snapshot.layout?.positiveCorridorPreferredGapY, 22),
          positiveReferenceHeight * safeNumber(snapshot.layout?.positiveCorridorPreferredGapFactor, positiveAbove ? 0.78 : 0.92)
        );
        const preferredCorridorTop = positiveAbove
          ? positiveUpperObstacleBottomForXs(corridorSampleXsCandidate) + scaleY(safeNumber(snapshot.layout?.positiveAboveCorridorTopGapY, 12))
          : Math.max(upperMetricFloor, ...corridorSampleXsCandidate.map((sampleX) => netMainRibbonBottomAtX(sampleX))) +
            scaleY(safeNumber(snapshot.layout?.positiveCorridorTopGapY, 18));
        const preferredCorridorBottom = positiveAbove
          ? Math.min(...corridorSampleXsCandidate.map((sampleX) => netMainRibbonTopAtX(sampleX))) -
            scaleY(safeNumber(snapshot.layout?.positiveAboveCorridorBottomGapY, 14))
          : (() => {
              const lowerRibbonSamples = corridorSampleXsCandidate.map((sampleX) => positiveRibbonTopAtX(sampleX)).filter((value) => Number.isFinite(value));
              const lowerRibbonTop = lowerRibbonSamples.length ? Math.min(...lowerRibbonSamples) : chartBottomLimit;
              return lowerRibbonTop - scaleY(safeNumber(snapshot.layout?.positiveCorridorBottomGapY, 14));
            })();
        const hardCorridorTop = positiveAbove
          ? positiveUpperObstacleBottomForXs(corridorSampleXsCandidate) +
            scaleY(safeNumber(snapshot.layout?.positiveAboveHardCorridorTopGapY, 0))
          : Math.max(upperMetricFloor, ...corridorSampleXsCandidate.map((sampleX) => netMainRibbonBottomAtX(sampleX))) +
            scaleY(safeNumber(snapshot.layout?.positiveCorridorHardTopGapY, 0));
        const hardCorridorBottom = positiveAbove
          ? Math.min(...corridorSampleXsCandidate.map((sampleX) => netMainRibbonTopAtX(sampleX))) -
            scaleY(safeNumber(snapshot.layout?.positiveAboveHardCorridorBottomGapY, 6))
          : (() => {
              const lowerRibbonSamples = corridorSampleXsCandidate.map((sampleX) => positiveRibbonTopAtX(sampleX)).filter((value) => Number.isFinite(value));
              const lowerRibbonTop = lowerRibbonSamples.length ? Math.min(...lowerRibbonSamples) : chartBottomLimit;
              return lowerRibbonTop - scaleY(safeNumber(snapshot.layout?.positiveCorridorHardBottomGapY, 6));
            })();
        const desiredLiftY = Math.max(
          scaleY(safeNumber(snapshot.layout?.positiveBranchLiftY, 28)),
          preferredVisualGapY * safeNumber(snapshot.layout?.positiveBranchLiftGapFactor, positiveAbove ? 1.16 : 0.86),
          positiveReferenceHeight * safeNumber(snapshot.layout?.positiveBranchLiftHeightFactor, positiveAbove ? 1.08 : 0.92)
        );
        const netAffinityAdjustedLiftY = Math.max(
          scaleY(safeNumber(snapshot.layout?.positiveBranchLiftMinY, positiveAbove ? 18 : 16)),
          desiredLiftY * (positiveAbove ? 1 - positiveNetAffinityStrength * 0.44 : 1)
        );
        const desiredCenter = positiveAbove
          ? positiveTargetStackCenter - netAffinityAdjustedLiftY
          : positiveTargetStackCenter + netAffinityAdjustedLiftY;
        const positiveProminentMaxMergeDeltaY = positiveProminentAbove
          ? Math.max(
              scaleY(safeNumber(snapshot.layout?.positiveProminentMaxMergeDeltaY, 86)),
              totalPositiveStackHeight * safeNumber(snapshot.layout?.positiveProminentMaxMergeDeltaHeightFactor, 0.92),
              (positiveTargetStackBottom - positiveTargetStackTop) *
                safeNumber(snapshot.layout?.positiveProminentMaxMergeDeltaTargetFactor, 0.84)
            )
          : Infinity;
        const prominentTopFloor = positiveProminentAbove
          ? positiveTargetStackCenter - positiveProminentMaxMergeDeltaY - totalPositiveStackHeight / 2
          : -Infinity;
        const preferredTopMin = Math.max(preferredCorridorTop, prominentTopFloor);
        const preferredTopMax = Math.max(preferredCorridorBottom - totalPositiveStackHeight, preferredTopMin);
        const candidateTopMin = Math.max(hardCorridorTop, prominentTopFloor);
        const candidateTopMax = Math.max(hardCorridorBottom - totalPositiveStackHeight, candidateTopMin);
        const desiredTop = clamp(
          desiredCenter - totalPositiveStackHeight / 2,
          preferredTopMin <= preferredTopMax ? preferredTopMin : candidateTopMin,
          preferredTopMin <= preferredTopMax ? preferredTopMax : candidateTopMax
        );
        const positiveBandEnvelopeAtX = (sampleX, stackTop) => {
          const stackBottom = stackTop + totalPositiveStackHeight;
          if (sampleX <= candidateNodeX + positiveNodeWidth) {
            return {
              top: stackTop,
              bottom: stackBottom,
            };
          }
          return flowEnvelopeAtX(
            sampleX,
            candidateNodeX + positiveNodeWidth,
            stackTop,
            stackBottom,
            netX + positiveTargetInsetX,
            positiveTargetStackTop,
            positiveTargetStackBottom,
            positiveBranchPathOptions
          );
        };
        const positiveVerticalCandidateTops = [];
        const positiveSearchOffsets = positiveAbove
          ? [-1.8, -1.35, -1, -0.65, -0.3, 0, 0.3, 0.6, 0.9]
          : [-1.45, -1.05, -0.72, -0.4, -0.12, 0.12, 0.42, 0.78, 1.08, 1.36];
        positiveSearchOffsets.forEach((offsetNorm) => {
          const offsetY = offsetNorm * Math.max(
            scaleY(safeNumber(snapshot.layout?.positiveTopSearchSpanY, 26)),
            positiveReferenceHeight * safeNumber(snapshot.layout?.positiveTopSearchSpanHeightFactor, 0.9)
          );
          positiveVerticalCandidateTops.push(clamp(desiredTop + offsetY, candidateTopMin, candidateTopMax));
        });
        positiveVerticalCandidateTops.push(candidateTopMin, candidateTopMax, desiredTop);
        let bestVerticalPlacement = null;
        [...new Set(positiveVerticalCandidateTops.map((value) => Number(value.toFixed(2))))].forEach((candidateTop) => {
          const nodeRect = {
            left: candidateNodeX,
            right: candidateNodeX + positiveNodeWidth,
            top: candidateTop,
            bottom: candidateTop + totalPositiveStackHeight,
          };
          const evaluationXs = [
            candidateNodeX + positiveNodeWidth * 0.16,
            candidateNodeX + positiveNodeWidth * 0.5,
            candidateNodeX + positiveNodeWidth * 0.84,
            ...corridorSampleXsCandidate,
          ];
          let gapShortfall = 0;
          let minGap = Infinity;
          let capGapShortfall = 0;
          evaluationXs.forEach((sampleX, sampleIndex) => {
            const envelope = positiveBandEnvelopeAtX(sampleX, candidateTop);
            if (!envelope) return;
            const requiredGap = sampleIndex < 3 ? positiveCapClearanceY : positiveBranchClearanceY;
            const upperGap = positiveAbove
              ? envelope.top - positiveUpperObstacleBottomAtX(sampleX)
              : envelope.top - Math.max(upperMetricFloor, netMainRibbonBottomAtX(sampleX));
            const lowerObstacleTop = positiveAbove ? netMainRibbonTopAtX(sampleX) : positiveRibbonTopAtX(sampleX);
            const lowerGap = (Number.isFinite(lowerObstacleTop) ? lowerObstacleTop : chartBottomLimit) - envelope.bottom;
            const localMinGap = Math.min(upperGap, lowerGap);
            minGap = Math.min(minGap, localMinGap);
            gapShortfall += Math.max(requiredGap - upperGap, 0) * 1.2 + Math.max(requiredGap - lowerGap, 0) * 1.35;
            if (sampleIndex < 3) {
              const capRequiredGap = requiredGap * safeNumber(snapshot.layout?.positiveCapPreferredGapFactor, 1.18);
              capGapShortfall += Math.max(capRequiredGap - upperGap, 0) * 2.5 + Math.max(capRequiredGap - lowerGap, 0) * 2.3;
            }
          });
          const sourceCenter = candidateTop + totalPositiveStackHeight / 2;
          const branchDirectionDelta = positiveAbove
            ? positiveTargetStackCenter - sourceCenter
            : sourceCenter - positiveTargetStackCenter;
          const preferredDirectionDelta = Math.max(
            scaleY(safeNumber(snapshot.layout?.positiveBranchPreferredDeltaY, 30)),
            preferredVisualGapY * safeNumber(snapshot.layout?.positiveBranchPreferredDeltaGapFactor, positiveAbove ? 0.92 : 0.72),
            positiveReferenceHeight * safeNumber(snapshot.layout?.positiveBranchPreferredDeltaHeightFactor, positiveAbove ? 2.15 : 1.28)
          );
          const branchDirectionShortfall = Math.max(preferredDirectionDelta - branchDirectionDelta, 0);
          const excessiveBranchDirectionAllowance = preferredDirectionDelta * safeNumber(
            snapshot.layout?.positiveBranchExcessiveDeltaAllowanceFactor,
            positiveAbove ? 1.45 : 1.8
          );
          const branchDirectionExcess = Math.max(branchDirectionDelta - excessiveBranchDirectionAllowance, 0);
          const excessiveMergePenalty =
            positiveAbove && positiveNetAffinityStrength > 0
              ? branchDirectionExcess *
                safeNumber(
                  snapshot.layout?.positiveNetAffinityMergeDeltaPenaltyFactor,
                  4.6 + positiveNetAffinityStrength * 10
                )
              : 0;
          const targetDeviation = Math.abs(candidateTop - desiredTop);
          const preferredRunwayDxBase = clamp(
            Math.max(
              safeNumber(snapshot.layout?.positivePreferredRunwayX, positiveAbove ? 74 : 72),
              totalPositiveStackHeight * safeNumber(snapshot.layout?.positivePreferredRunwayHeightFactor, positiveAbove ? 2.25 : 2.1),
              preferredDirectionDelta * safeNumber(snapshot.layout?.positivePreferredRunwayDeltaFactor, positiveAbove ? 0.72 : 0.62)
            ),
            24,
            Math.max(netX - positiveNodeWidth - positiveNodeMinX, 24)
          );
          const preferredRunwayDx = clamp(
            preferredRunwayDxBase * (positiveAbove ? 1 - positiveNetAffinityStrength * 0.5 : 1),
            24,
            Math.max(netX - positiveNodeWidth - positiveNodeMinX, 24)
          );
          const preferredNodeX = clamp(
            netX - positiveNodeWidth - preferredRunwayDx,
            positiveNodeMinX,
            Math.max(positiveNodeMaxX, positiveNodeMinX)
          );
          const runwayShortfallPenalty =
            Math.max(preferredRunwayDx - runwayDx, 0) *
            safeNumber(snapshot.layout?.positiveRunwayShortfallPenaltyFactor, positiveAbove ? 7.4 : 4.2);
          const runwayExcessAllowanceFactor = safeNumber(
            snapshot.layout?.positiveRunwayExcessAllowanceFactor,
            positiveAbove ? Math.max(1.08, 1.22 - positiveNetAffinityStrength * 0.16) : 1.45
          );
          const runwayExcessPenaltyFactor = safeNumber(
            snapshot.layout?.positiveRunwayExcessPenaltyFactor,
            positiveAbove ? 0.8 + positiveNetAffinityStrength * 2.6 : 0.18
          );
          const runwayExcessPenalty =
            Math.max(runwayDx - preferredRunwayDx * runwayExcessAllowanceFactor, 0) * runwayExcessPenaltyFactor;
          const runwayDistancePenalty =
            positiveAbove && positiveNetAffinityStrength > 0
              ? runwayDx * safeNumber(snapshot.layout?.positiveNetAffinityRunwayPenaltyFactor, 0.04 + positiveNetAffinityStrength * 0.18)
              : 0;
          const nodeXDeviationPenalty =
            Math.abs(candidateNodeX - preferredNodeX) *
            safeNumber(snapshot.layout?.positiveNodeXDeviationPenaltyFactor, positiveAbove ? 0.42 : 0.24);
          let terminalObstacleHits = 0;
          let terminalObstacleOverlapDepth = 0;
          positiveTerminalNodeObstacles.forEach((obstacle) => {
            if (!rectsOverlap(nodeRect, obstacle)) return;
            terminalObstacleHits += 1;
            terminalObstacleOverlapDepth +=
              Math.max(Math.min(nodeRect.bottom, obstacle.bottom) - Math.max(nodeRect.top, obstacle.top), 0);
          });
          const score =
            gapShortfall * 100 +
            capGapShortfall * 126 +
            branchDirectionShortfall * 10.5 +
            branchDirectionExcess * safeNumber(snapshot.layout?.positiveBranchExcessPenaltyFactor, positiveAbove ? 3.1 : 1.6) +
            excessiveMergePenalty +
            targetDeviation * safeNumber(snapshot.layout?.positiveTargetDeviationPenaltyFactor, positiveAbove ? 0.72 : 0.26) +
            terminalObstacleHits * safeNumber(snapshot.layout?.positiveTerminalObstaclePenalty, 40000) +
            terminalObstacleOverlapDepth * safeNumber(snapshot.layout?.positiveTerminalObstacleDepthPenaltyFactor, 480) +
            runwayShortfallPenalty +
            runwayExcessPenalty +
            runwayDistancePenalty +
            nodeXDeviationPenalty -
            Math.max(minGap, 0) * 2.7;
          if (!bestVerticalPlacement || score < bestVerticalPlacement.score) {
            bestVerticalPlacement = {
              top: candidateTop,
              score,
              minGap,
            };
          }
        });
        if (!bestVerticalPlacement) return;
        if (!bestNodePlacement || bestVerticalPlacement.score < bestNodePlacement.score) {
          bestNodePlacement = {
            nodeX: candidateNodeX,
            top: bestVerticalPlacement.top,
            score: bestVerticalPlacement.score,
            minGap: bestVerticalPlacement.minGap,
            corridorSampleXs: corridorSampleXsCandidate,
            topMin: candidateTopMin,
            topMax: candidateTopMax,
          };
        }
      });
      if (bestNodePlacement) {
        const positiveAestheticNudgeStrength = clamp(
          safeNumber(
            snapshot.layout?.positiveAestheticNudgeStrength,
            positiveAbove ? positiveNetAffinityStrength + 0.12 : 0
          ),
          0,
          0.64
        );
        const positiveAestheticNudgeX =
          scaleY(safeNumber(snapshot.layout?.positiveAestheticNudgeX, positiveAbove ? 48 : 0)) * positiveAestheticNudgeStrength;
        const positiveAestheticNudgeY =
          scaleY(safeNumber(snapshot.layout?.positiveAestheticNudgeY, positiveAbove ? 40 : 0)) * positiveAestheticNudgeStrength;
        positiveNodeX = clamp(
          bestNodePlacement.nodeX + positiveAestheticNudgeX,
          positiveNodeMinX,
          Math.max(positiveNodeMaxX, positiveNodeMinX)
        );
        positiveTop = clamp(bestNodePlacement.top + positiveAestheticNudgeY, bestNodePlacement.topMin, bestNodePlacement.topMax);
        corridorSampleXs = positiveCorridorSampleXsForNode(positiveNodeX);
        positiveTopMin = bestNodePlacement.topMin;
        positiveTopMax = bestNodePlacement.topMax;
      }
    }
    const placedPositiveLabelRects = [];
    let netPositiveCursor = netPositiveTop;
    positiveAdjustments.forEach((item, index) => {
      const gainHeight = positiveHeights[index];
      const mergeHeight = positiveMergeHeights[index] ?? Math.max(safeNumber(item.valueBn) * scale, 0);
      const positiveNameSize = String(item.name || "").length > 14 ? 18 : 22;
      const positiveValueSize = String(item.name || "").length > 14 ? 18 : 20;
      const labelGapX = safeNumber(snapshot.layout?.positiveLabelGapX, 14);
      const twoLineGap = scaleY(safeNumber(snapshot.layout?.positiveLabelLineGapY, 8));
      const valueYOffset = scaleY(safeNumber(snapshot.layout?.positiveLabelValueOffsetY, 16));
      const labelTopGapY = positiveValueSize * 0.5;
      const positiveTargetBand = positiveTargetBands[index] || {
        top: clamp(netPositiveCursor, netTop, netBottom - gainHeight),
        bottom: clamp(netPositiveCursor + mergeHeight, netTop + mergeHeight, netBottom),
        height: mergeHeight,
      };
      const netShift = editorOffsetForNode("net");
      const adjustedTargetTop = Math.max(positiveTargetBand.top + netShift.dy - positiveMergeOverlapY, netFrame.top);
      const adjustedTargetHeight = Math.min(
        Math.max(safeNumber(positiveTargetBand.height, mergeHeight), 0) + positiveMergeOverlapY,
        netFrame.bottom - adjustedTargetTop
      );
      const labelValue = formatItemBillions(item, "positive-plus");
      const leftCorridor = positiveNodeX - (opX + nodeWidth);
      const labelNameWidth = approximateTextWidth(localizeChartPhrase(item.name), positiveNameSize);
      const labelValueWidth = approximateTextWidth(labelValue, positiveValueSize);
      const labelBlockWidth = Math.max(labelNameWidth, labelValueWidth, 1);
      const positiveLabelMinLeftPad = safeNumber(snapshot.layout?.positiveLabelMinLeftPadX, 10);
      const positiveLabelObstaclePadding = scaleY(safeNumber(snapshot.layout?.positiveLabelObstaclePadding, 6));
      const positiveLabelRibbonClearance = Math.max(
        positiveLabelObstaclePadding,
        scaleY(safeNumber(snapshot.layout?.positiveLabelRibbonClearanceY, 12))
      );
      const positiveLabelInterLabelPadding = Math.max(
        positiveLabelObstaclePadding,
        scaleY(safeNumber(snapshot.layout?.positiveLabelInterLabelPadding, 8))
      );
      const positiveLabelWidthPadding = Math.max(
        positiveLabelObstaclePadding,
        scaleY(safeNumber(snapshot.layout?.positiveLabelWidthPaddingX, 10))
      );
      const labelNameAscent = positiveNameSize * 0.9;
      const labelNameDescent = positiveNameSize * 0.34;
      const labelValueAscent = positiveValueSize * 0.9;
      const labelValueDescent = positiveValueSize * 0.36;
      const labelTopOffset = Math.min(-twoLineGap - labelNameAscent, valueYOffset - labelValueAscent) - positiveLabelObstaclePadding;
      const labelBottomOffset = Math.max(-twoLineGap + labelNameDescent, valueYOffset + labelValueDescent) + positiveLabelObstaclePadding;
      const labelBlockHeight = labelBottomOffset - labelTopOffset;
      const labelCenterBias = (labelTopOffset + labelBottomOffset) / 2;
      const positiveLabelOrderNorm = positiveAdjustments.length <= 1 ? 0.5 : index / Math.max(positiveAdjustments.length - 1, 1);
      const positiveLabelPreferredVerticalType =
        positiveAbove && positiveAdjustments.length > 1
          ? positiveLabelOrderNorm >= safeNumber(snapshot.layout?.positiveLabelPreferBelowFromOrderNorm, 0.5)
            ? "below"
            : "above"
          : null;
      const labelBoundsRect = (anchor, x, centerY) => {
        const left =
          anchor === "middle"
            ? x - labelBlockWidth / 2 - positiveLabelWidthPadding
            : anchor === "start"
              ? x - positiveLabelWidthPadding
              : x - labelBlockWidth - positiveLabelWidthPadding;
        const right =
          anchor === "middle"
            ? x + labelBlockWidth / 2 + positiveLabelWidthPadding
            : anchor === "start"
              ? x + labelBlockWidth + positiveLabelWidthPadding
              : x + positiveLabelWidthPadding;
        return {
          left,
          right,
          top: centerY + labelTopOffset,
          bottom: centerY + labelBottomOffset,
        };
      };
      const sourceTopSearchMin = clamp(
        positiveTopMin + positiveSourceDropY,
        scaleY(160),
        chartBottomLimit - gainHeight - scaleY(6)
      );
      const sourceTopSearchMax = clamp(
        positiveTopMax + positiveSourceDropY,
        sourceTopSearchMin,
        chartBottomLimit - gainHeight - scaleY(6)
      );
      const resolvePositivePlacement = (sourceTopCandidate) => {
        const positiveSourceTop = clamp(sourceTopCandidate, sourceTopSearchMin, sourceTopSearchMax);
        const positiveSourceBottom = positiveSourceTop + gainHeight;
        const positiveSourceCenter = positiveSourceTop + gainHeight / 2;
        const positiveTargetCenter = adjustedTargetTop + adjustedTargetHeight / 2;
        const positiveLocalUpperObstacleBottom = positiveAbove
          ? positiveUpperObstacleBottomAtX(positiveNodeX + positiveNodeWidth * 0.5)
          : Math.max(upperMetricFloor, netMainRibbonBottomAtX(positiveNodeX + positiveNodeWidth * 0.5));
        const availableAbove = positiveSourceTop - positiveLocalUpperObstacleBottom;
        const positiveLocalLowerObstacleTop = (() => {
          const sampleX = positiveNodeX + positiveNodeWidth * 0.5;
          if (positiveAbove) {
            const mainRibbonTop = netMainRibbonTopAtX(sampleX);
            return Number.isFinite(mainRibbonTop) ? mainRibbonTop : chartBottomLimit;
          }
          const lowerRibbonTop = positiveRibbonTopAtX(sampleX);
          return Number.isFinite(lowerRibbonTop) ? lowerRibbonTop : chartBottomLimit;
        })();
        const availableBelow = positiveLocalLowerObstacleTop - positiveSourceBottom;
        const abovePlacementBaseCenterY = positiveSourceTop - labelTopGapY - labelBottomOffset;
        const belowPlacementBaseCenterY = positiveSourceBottom + labelTopGapY - labelTopOffset;
        const sampleXsAcrossRect = (rect, count = 5) => {
          if (!rect) return [];
          const left = clamp(rect.left + 1, opX + nodeWidth + 1, netX + positiveTargetInsetX);
          const right = clamp(rect.right - 1, opX + nodeWidth + 1, netX + positiveTargetInsetX);
          if (right <= left) return [left];
          return Array.from({ length: count }, (_unused, index) =>
            clamp(left + ((right - left) * index) / Math.max(count - 1, 1), opX + nodeWidth + 1, netX + positiveTargetInsetX)
          ).filter((value, idx, arr) => Number.isFinite(value) && (idx === 0 || Math.abs(value - arr[idx - 1]) > 0.8));
        };
        const lowerObstacleTopForRect = (rect) => {
          const sampleXs = sampleXsAcrossRect(rect, 7);
          let top = Infinity;
          sampleXs.forEach((sampleX) => {
            const candidateTop = positiveAbove ? netMainRibbonTopAtX(sampleX) : positiveRibbonTopAtX(sampleX);
            if (Number.isFinite(candidateTop)) {
              top = Math.min(top, candidateTop);
            }
          });
          return top;
        };
        const upperObstacleBottomForRect = (rect) => {
          const sampleXs = sampleXsAcrossRect(rect, 7);
          let bottom = positiveAbove ? 0 : upperMetricFloor;
          sampleXs.forEach((sampleX) => {
            const mainBottom = positiveAbove ? positiveUpperObstacleBottomAtX(sampleX) : netMainRibbonBottomAtX(sampleX);
            if (Number.isFinite(mainBottom)) {
              bottom = Math.max(bottom, mainBottom);
            }
          });
          return bottom;
        };
        const labelRectIsValid = (rect) =>
          rect.left >= opX + nodeWidth + positiveLabelMinLeftPad &&
          rect.right <= width - 56 &&
          rect.top >= upperObstacleBottomForRect(rect) + scaleY(6) &&
          rect.bottom <= chartBottomLimit - scaleY(6);
        const positiveBranchEnvelopeAtX = (sampleX) =>
          flowEnvelopeAtX(
            sampleX,
            positiveNodeX + positiveNodeWidth,
            positiveSourceTop,
            positiveSourceBottom,
            netX + positiveTargetInsetX,
            adjustedTargetTop,
            adjustedTargetTop + adjustedTargetHeight,
            positiveBranchPathOptions
          );
        const branchClearanceScore = (() => {
          const sampleXs = [
            positiveNodeX + positiveNodeWidth * 0.12,
            positiveNodeX + positiveNodeWidth * 0.5,
            positiveNodeX + positiveNodeWidth * 0.88,
            ...corridorSampleXs,
          ];
          let penalty = 0;
          let minGap = Infinity;
          sampleXs.forEach((sampleX, sampleIndex) => {
            const envelope =
              sampleX <= positiveNodeX + positiveNodeWidth
                ? { top: positiveSourceTop, bottom: positiveSourceBottom }
                : positiveBranchEnvelopeAtX(sampleX);
            if (!envelope) return;
            const requiredGap =
              sampleIndex < 3
                ? positiveCapClearanceY * safeNumber(snapshot.layout?.positiveCapPreferredGapFactor, 1.18)
                : positiveBranchClearanceY;
            const upperGap = positiveAbove
              ? envelope.top - positiveUpperObstacleBottomAtX(sampleX)
              : envelope.top - Math.max(upperMetricFloor, netMainRibbonBottomAtX(sampleX));
            const lowerObstacleTop = positiveAbove ? netMainRibbonTopAtX(sampleX) : positiveRibbonTopAtX(sampleX);
            const lowerGap = (Number.isFinite(lowerObstacleTop) ? lowerObstacleTop : chartBottomLimit) - envelope.bottom;
            const localMinGap = Math.min(upperGap, lowerGap);
            minGap = Math.min(minGap, localMinGap);
            penalty += Math.max(requiredGap - upperGap, 0) * (sampleIndex < 3 ? 3.2 : 2.2);
            penalty += Math.max(requiredGap - lowerGap, 0) * (sampleIndex < 3 ? 3.4 : 2.4);
          });
          return {
            penalty,
            minGap,
          };
        })();
        const preferredMergeDeltaY = Math.max(
          scaleY(safeNumber(snapshot.layout?.positivePerItemPreferredMergeDeltaY, 26)),
          gainHeight * safeNumber(snapshot.layout?.positivePerItemPreferredMergeDeltaHeightFactor, 2),
          positiveReferenceHeight * safeNumber(snapshot.layout?.positivePerItemPreferredMergeDeltaReferenceFactor, 1.6)
        );
        const mergeDeltaY = positiveAbove
          ? positiveTargetCenter - positiveSourceCenter
          : positiveSourceCenter - positiveTargetCenter;
        const mergeDeltaShortfall = Math.max(preferredMergeDeltaY - mergeDeltaY, 0);
        const preferredMergeDeltaExcessAllowance = preferredMergeDeltaY * safeNumber(
          snapshot.layout?.positivePerItemMergeDeltaExcessAllowanceFactor,
          positiveAbove ? 1.08 : 1.36
        );
        const mergeDeltaExcess = Math.max(mergeDeltaY - preferredMergeDeltaExcessAllowance, 0);
        const mergeRunway = Math.max(netX - (positiveNodeX + positiveNodeWidth), 1);
        const evaluateLabelRibbonCollisions = (rect) => {
          const safeRectLeft = clamp(rect.left + 1, opX + nodeWidth + 1, netX + positiveTargetInsetX);
          const safeRectRight = clamp(rect.right - 1, opX + nodeWidth + 1, netX + positiveTargetInsetX);
          if (safeRectRight <= safeRectLeft) {
            return { hitCount: 0, overlapDepth: 0 };
          }
          const sampleCount = 11;
          const sampleXs = Array.from({ length: sampleCount }, (_unused, index) =>
            clamp(
              safeRectLeft + ((safeRectRight - safeRectLeft) * index) / Math.max(sampleCount - 1, 1),
              opX + nodeWidth + 1,
              netX + positiveTargetInsetX
            )
          ).filter((value, idx, arr) => Number.isFinite(value) && (idx === 0 || Math.abs(value - arr[idx - 1]) > 0.5));
          let hitCount = 0;
          let overlapDepth = 0;
          sampleXs.forEach((sampleX) => {
            const envelopes = [];
            const mainEnvelope = shiftedMainNetRibbonEnvelopeAtX(sampleX);
            if (mainEnvelope) envelopes.push(mainEnvelope);
            const positiveEnvelope = positiveBranchEnvelopeAtX(sampleX);
            if (positiveEnvelope) envelopes.push(positiveEnvelope);
            [...deductionBranchModels, ...opexBranchModels].forEach((model) => {
              const branchEnvelope = flowEnvelopeAtX(
                sampleX,
                model.x0,
                model.sourceTop,
                model.sourceBottom,
                model.x1,
                model.targetTop,
                model.targetTop + model.targetHeight,
                model.options
              );
              if (branchEnvelope) envelopes.push(branchEnvelope);
            });
            if (sampleX >= positiveNodeX && sampleX <= positiveNodeX + positiveNodeWidth) {
              envelopes.push({ top: positiveSourceTop, bottom: positiveSourceBottom });
            }
            let hasLocalHit = false;
            envelopes.forEach((envelope) => {
              const overlapTop = Math.max(rect.top, envelope.top - positiveLabelRibbonClearance);
              const overlapBottom = Math.min(rect.bottom, envelope.bottom + positiveLabelRibbonClearance);
              const overlap = overlapBottom - overlapTop;
              if (overlap > 0) {
                hasLocalHit = true;
                overlapDepth += overlap;
              }
            });
            if (hasLocalHit) hitCount += 1;
          });
          return { hitCount, overlapDepth };
        };
        const collisionPenalty = (rect) => {
          let penalty = 0;
          let obstacleHits = 0;
          let interLabelHits = 0;
          positiveLabelObstacles.forEach((obstacle) => {
            if (rectsOverlap(rect, obstacle, positiveLabelObstaclePadding)) {
              obstacleHits += 1;
              penalty += 12;
            }
          });
          placedPositiveLabelRects.forEach((placedRect) => {
            if (rectsOverlap(rect, placedRect, positiveLabelInterLabelPadding)) {
              interLabelHits += 1;
              penalty += safeNumber(snapshot.layout?.positiveLabelPlacedOverlapPenalty, 96);
            }
          });
          const ribbonCollision = evaluateLabelRibbonCollisions(rect);
          if (ribbonCollision.hitCount > 0) {
            penalty += ribbonCollision.hitCount * 24 + ribbonCollision.overlapDepth * 0.28;
          }
          return {
            penalty,
            obstacleHits,
            interLabelHits,
            ribbonHitCount: ribbonCollision.hitCount,
            ribbonOverlapDepth: ribbonCollision.overlapDepth,
            hardCollisionCount: obstacleHits + interLabelHits + ribbonCollision.hitCount,
          };
        };
        const associationAmbiguityPenalty = (candidate, rect) => {
          const verticalGapToBand = (box, bandTop, bandBottom) => {
            if (!Number.isFinite(bandTop) || !Number.isFinite(bandBottom)) return Infinity;
            if (box.bottom < bandTop) return bandTop - box.bottom;
            if (box.top > bandBottom) return box.top - bandBottom;
            return 0;
          };
          const ownGap = verticalGapToBand(rect, positiveSourceTop, positiveSourceBottom);
          const sampleXs = [
            rect.left + (rect.right - rect.left) * 0.2,
            rect.left + (rect.right - rect.left) * 0.5,
            rect.left + (rect.right - rect.left) * 0.8,
          ]
            .map((value) => clamp(value, opX + nodeWidth + 1, netX + positiveTargetInsetX))
            .filter((value, index, values) => Number.isFinite(value) && (index === 0 || Math.abs(value - values[index - 1]) > 0.8));
          let hardAmbiguityCount = 0;
          let proximityPenalty = 0;
          let minNearestCompetingGap = Infinity;
          sampleXs.forEach((sampleX) => {
            const competingGaps = [];
            const mainEnvelope = shiftedMainNetRibbonEnvelopeAtX(sampleX);
            if (mainEnvelope) {
              competingGaps.push(verticalGapToBand(rect, mainEnvelope.top, mainEnvelope.bottom));
            }
            [...deductionBranchModels, ...opexBranchModels].forEach((model) => {
              const envelope = flowEnvelopeAtX(
                sampleX,
                model.x0,
                model.sourceTop,
                model.sourceBottom,
                model.x1,
                model.targetTop,
                model.targetTop + model.targetHeight,
                model.options
              );
              if (envelope) {
                competingGaps.push(verticalGapToBand(rect, envelope.top, envelope.bottom));
              }
            });
            const nearestCompetingGap = competingGaps.length ? Math.min(...competingGaps) : Infinity;
            if (nearestCompetingGap < minNearestCompetingGap) minNearestCompetingGap = nearestCompetingGap;
            if (Number.isFinite(nearestCompetingGap)) {
              const associationSafeMargin = scaleY(safeNumber(snapshot.layout?.positiveLabelAssociationSafeMarginY, 8));
              if (ownGap > nearestCompetingGap + associationSafeMargin) {
                hardAmbiguityCount += 1;
                proximityPenalty += (ownGap - nearestCompetingGap) * 1.15;
              } else if (nearestCompetingGap < scaleY(16)) {
                proximityPenalty += (scaleY(16) - nearestCompetingGap) * 0.9;
              }
            }
          });
          if (Number.isFinite(minNearestCompetingGap)) {
            const associationSafeMargin = scaleY(safeNumber(snapshot.layout?.positiveLabelAssociationSafeMarginY, 8));
            const contrastShortfall = ownGap + associationSafeMargin - minNearestCompetingGap;
            if (contrastShortfall > 0) {
              proximityPenalty += contrastShortfall * safeNumber(snapshot.layout?.positiveLabelAssociationContrastPenaltyFactor, 7.2);
              if (contrastShortfall > scaleY(6)) {
                hardAmbiguityCount += 1;
              }
            }
          }
          const sourceAssociationCenterY = positiveSourceTop + gainHeight / 2 - labelCenterBias;
          const labelAssociationCenterY = (rect.top + rect.bottom) / 2;
          const associationDistance = Math.abs(labelAssociationCenterY - sourceAssociationCenterY);
          const hardAssociationDistanceThreshold = Math.max(
            scaleY(safeNumber(snapshot.layout?.positiveLabelHardAssociationDistanceY, 88)),
            labelBlockHeight + scaleY(16)
          );
          if (associationDistance > hardAssociationDistanceThreshold) {
            hardAmbiguityCount += 1;
            proximityPenalty += (associationDistance - hardAssociationDistanceThreshold) * 1.6;
          }
          const directionalPenalty =
            candidate.type === "below"
              ? safeNumber(snapshot.layout?.positiveLabelBelowDirectionalPenalty, 0.7)
              : candidate.type === "above"
                ? safeNumber(snapshot.layout?.positiveLabelAboveDirectionalPenalty, 0.7)
                : safeNumber(snapshot.layout?.positiveLabelLeftDirectionalPenalty, 2.4);
          const placementOrderPenalty = (() => {
            if (!(positiveAbove && positiveAdjustments.length > 1 && positiveLabelPreferredVerticalType)) return 0;
            if (candidate.type === "left") {
              return safeNumber(snapshot.layout?.positiveLabelMultiSplitLeftPenalty, 9);
            }
            return candidate.type === positiveLabelPreferredVerticalType
              ? 0
              : safeNumber(snapshot.layout?.positiveLabelWrongSplitSidePenalty, 18);
          })();
          const penalty =
            hardAmbiguityCount * safeNumber(snapshot.layout?.positiveLabelHardAmbiguityPenalty, 260) +
            proximityPenalty +
            associationDistance * safeNumber(snapshot.layout?.positiveLabelAssociationDistancePenaltyFactor, 0.1) +
            directionalPenalty +
            placementOrderPenalty;
          return {
            penalty,
            hardAmbiguityCount,
          };
        };
        const positiveNodeCenterX = positiveNodeX + positiveNodeWidth / 2;
        const positiveLabelFollowMinX = opX + nodeWidth + positiveLabelMinLeftPad + positiveLabelWidthPadding;
        const positiveLabelFollowMaxX = width - 56 - labelBlockWidth - positiveLabelWidthPadding;
        const positiveLabelBranchFollowForwardX = clamp(
          positiveNodeX +
            positiveNodeWidth +
            scaleY(safeNumber(snapshot.layout?.positiveLabelBranchFollowOffsetX, 18)),
          positiveLabelFollowMinX,
          Math.max(positiveLabelFollowMinX, positiveLabelFollowMaxX)
        );
        const positiveLabelBacktrackMinX =
          opX + nodeWidth + positiveLabelMinLeftPad + labelBlockWidth + positiveLabelWidthPadding;
        const positiveLabelBranchFollowBacktrackX = clamp(
          positiveNodeX - scaleY(safeNumber(snapshot.layout?.positiveLabelBranchBacktrackOffsetX, 18)),
          positiveLabelBacktrackMinX,
          width - 56 - positiveLabelWidthPadding
        );
        const positiveLabelCandidatePriority = (type, variant = null) => {
          if (type === "left") {
            return leftCorridor >= labelBlockWidth + safeNumber(snapshot.layout?.positiveLabelMinCorridorX, 72) ? 1.2 : 3.2;
          }
          let priority = type === "above" ? 0 : 0.1;
          if (positiveLabelPreferredVerticalType) {
            priority +=
              type === positiveLabelPreferredVerticalType
                ? safeNumber(snapshot.layout?.positiveLabelPreferredPlacementBonus, -0.18)
                : safeNumber(snapshot.layout?.positiveLabelAlternatePlacementPenalty, 0.32);
          }
          if (variant === "branch-follow") {
            priority += safeNumber(snapshot.layout?.positiveLabelBranchFollowPriorityOffset, 0.06);
          }
          return priority;
        };
        const candidatePlacements = [
          {
            priority: positiveLabelCandidatePriority("above"),
            type: "above",
            anchor: "middle",
            x: positiveNodeCenterX,
            centerY: abovePlacementBaseCenterY,
          },
          {
            priority: positiveLabelCandidatePriority("below"),
            type: "below",
            anchor: "middle",
            x: positiveNodeCenterX,
            centerY: belowPlacementBaseCenterY,
          },
          ...(positiveLabelPreferredVerticalType && positiveLabelFollowMaxX > positiveLabelFollowMinX + 2
            ? [
                {
                  priority: positiveLabelCandidatePriority(positiveLabelPreferredVerticalType, "branch-follow"),
                  type: positiveLabelPreferredVerticalType,
                  anchor: positiveLabelPreferredVerticalType === "below" ? "end" : "start",
                  x:
                    positiveLabelPreferredVerticalType === "below"
                      ? positiveLabelBranchFollowBacktrackX
                      : positiveLabelBranchFollowForwardX,
                  centerY: positiveLabelPreferredVerticalType === "above" ? abovePlacementBaseCenterY : belowPlacementBaseCenterY,
                  variant: "branch-follow",
                },
              ]
            : []),
          {
            priority: positiveLabelCandidatePriority("left"),
            type: "left",
            anchor: "end",
            x: positiveNodeX - labelGapX,
            centerY: positiveSourceTop + gainHeight / 2 - labelCenterBias,
          },
        ];
        const comparePlacement = (placement, baseline) => {
          if (!baseline) return true;
          if (placement.hardViolationCount !== baseline.hardViolationCount) {
            return placement.hardViolationCount < baseline.hardViolationCount;
          }
          if (placement.hardAmbiguityCount !== baseline.hardAmbiguityCount) {
            return placement.hardAmbiguityCount < baseline.hardAmbiguityCount;
          }
          const placementConflictPenalty = placement.collisionPenalty + placement.ambiguityPenalty;
          const baselineConflictPenalty = baseline.collisionPenalty + baseline.ambiguityPenalty;
          if (Math.abs(placementConflictPenalty - baselineConflictPenalty) > 0.001) {
            return placementConflictPenalty < baselineConflictPenalty;
          }
          return placement.score < baseline.score;
        };
        const evaluatePlacement = (candidate) => {
          const baseRect = labelBoundsRect(candidate.anchor, candidate.x, candidate.centerY);
          const effectiveRibbonClearance =
            candidate.variant === "branch-follow" &&
            candidate.type === "below" &&
            positiveAbove &&
            positiveAdjustments.length > 1
              ? positiveLabelRibbonClearance * safeNumber(snapshot.layout?.positiveLabelBelowSplitClearanceFactor, 0.45)
              : positiveLabelRibbonClearance;
          const hardUpperBoundary = upperObstacleBottomForRect(baseRect) + effectiveRibbonClearance;
          const hardLowerBoundaryTop = lowerObstacleTopForRect(baseRect);
          const minCenterY = hardUpperBoundary - labelTopOffset;
          const maxCenterY = Number.isFinite(hardLowerBoundaryTop)
            ? hardLowerBoundaryTop - effectiveRibbonClearance - labelBottomOffset
            : chartBottomLimit - scaleY(6) - labelBottomOffset;
          if (!(maxCenterY >= minCenterY)) return null;
          const resolvedCenterY = clamp(candidate.centerY, minCenterY, maxCenterY);
          const rect = labelBoundsRect(candidate.anchor, candidate.x, resolvedCenterY);
          if (!labelRectIsValid(rect)) return null;
          if (rect.top < hardUpperBoundary) return null;
          if (Number.isFinite(hardLowerBoundaryTop) && rect.bottom > hardLowerBoundaryTop - effectiveRibbonClearance) return null;
          const collision = collisionPenalty(rect);
          const ambiguity = associationAmbiguityPenalty(candidate, rect);
          const requiredVerticalSpace = labelBlockHeight + labelTopGapY + scaleY(4);
          const verticalAvailabilityPenalty =
            candidate.type === "above"
              ? Math.max(requiredVerticalSpace - availableAbove, 0) * 0.42
              : candidate.type === "below"
                ? Math.max(requiredVerticalSpace - availableBelow, 0) * 0.42
                : 0;
          const sourceMovePenalty = Math.abs(positiveSourceTop - (positiveTop + positiveSourceDropY)) * 0.06;
          const leftPlacementPenalty =
            candidate.type === "left"
              ? 0.9 +
                Math.max(
                  mergeRunway - scaleY(safeNumber(snapshot.layout?.positiveLabelPreferredLeftRunwayX, 46)),
                  0
                ) *
                  safeNumber(snapshot.layout?.positiveLabelLeftRunwayPenaltyFactor, 0.03)
              : 0;
          const score =
            candidate.priority +
            collision.penalty +
            ambiguity.penalty +
            branchClearanceScore.penalty * 0.32 +
            mergeDeltaShortfall * 0.42 +
            mergeRunway * 0.022 +
            verticalAvailabilityPenalty +
            leftPlacementPenalty +
            Math.abs(resolvedCenterY - candidate.centerY) * safeNumber(snapshot.layout?.positiveLabelCenterAdjustmentPenaltyFactor, 0.22) +
            sourceMovePenalty -
            Math.max(branchClearanceScore.minGap, 0) * 0.08;
          const hardViolationCount = collision.hardCollisionCount + ambiguity.hardAmbiguityCount;
          return {
            ...candidate,
            centerY: resolvedCenterY,
            rect,
            score,
            collisionPenalty: collision.penalty,
            ambiguityPenalty: ambiguity.penalty,
            hardAmbiguityCount: ambiguity.hardAmbiguityCount,
            hardViolationCount,
            hardCollisionCount: collision.hardCollisionCount,
            collisionFree: hardViolationCount === 0,
          };
        };
        let bestPlacement = null;
        candidatePlacements.forEach((candidate) => {
          const placement = evaluatePlacement(candidate);
          if (!placement) return;
          if (comparePlacement(placement, bestPlacement)) bestPlacement = placement;
        });
        if (positiveAbove && positiveAdjustments.length === 2) {
          const forcedNodeCenteredCandidate =
            index === 0
              ? {
                  priority: -0.6,
                  type: "above",
                  anchor: "middle",
                  x: positiveNodeCenterX,
                  centerY: abovePlacementBaseCenterY,
                  variant: "node-centered",
                }
              : {
                  priority: -0.6,
                  type: "below",
                  anchor: "middle",
                  x: positiveNodeCenterX,
                  centerY: belowPlacementBaseCenterY,
                  variant: "node-centered",
                };
          const forcedNodeCenteredPlacement = evaluatePlacement(forcedNodeCenteredCandidate);
          if (
            forcedNodeCenteredPlacement &&
            (!bestPlacement ||
              forcedNodeCenteredPlacement.hardViolationCount === 0 ||
              bestPlacement.hardViolationCount > 0 ||
              bestPlacement.type !== forcedNodeCenteredCandidate.type ||
              bestPlacement.anchor !== "middle")
          ) {
            bestPlacement = forcedNodeCenteredPlacement;
          } else if (!forcedNodeCenteredPlacement) {
            const fallbackCenterY =
              index === 0
                ? clamp(
                    positiveSourceTop -
                      Math.max(
                        labelBlockHeight * safeNumber(snapshot.layout?.positiveLabelSplitFallbackOffsetFactor, 0.58),
                        scaleY(34)
                      ),
                    upperMetricFloor + scaleY(12) - labelTopOffset,
                    positiveSourceTop - scaleY(8) - labelBottomOffset
                  )
                : clamp(
                    positiveSourceBottom +
                      Math.max(
                        labelBlockHeight * safeNumber(snapshot.layout?.positiveLabelSplitFallbackOffsetFactor, 0.58),
                        scaleY(34)
                      ),
                    positiveSourceBottom + scaleY(10) - labelTopOffset,
                    chartBottomLimit - scaleY(6) - labelBottomOffset
                  );
            bestPlacement = {
              ...(bestPlacement || {}),
              type: forcedNodeCenteredCandidate.type,
              anchor: "middle",
              x: positiveNodeCenterX,
              centerY: fallbackCenterY,
            };
          }
        }
        if (!bestPlacement) {
          const fallbackCandidates = [
            {
              type: "above",
              anchor: "middle",
              x: positiveNodeCenterX,
              centerY: abovePlacementBaseCenterY,
            },
            {
              type: "below",
              anchor: "middle",
              x: positiveNodeCenterX,
              centerY: belowPlacementBaseCenterY,
            },
            {
              type: "left",
              anchor: "end",
              x: positiveNodeX - labelGapX - 24,
              centerY: positiveSourceTop + gainHeight / 2 - labelCenterBias,
            },
          ];
          const resolvedFallback = fallbackCandidates
            .map((candidate) => {
              const rect = labelBoundsRect(candidate.anchor, candidate.x, candidate.centerY);
              if (!labelRectIsValid(rect)) return null;
              const hardUpperBoundary = upperObstacleBottomForRect(rect) + positiveLabelRibbonClearance;
              if (rect.top < hardUpperBoundary) return null;
              const hardLowerBoundaryTop = lowerObstacleTopForRect(rect);
              if (Number.isFinite(hardLowerBoundaryTop) && rect.bottom > hardLowerBoundaryTop - positiveLabelRibbonClearance) return null;
              return {
                ...candidate,
                rect,
              };
            })
            .find(Boolean);
          const fallbackPlacement = resolvedFallback || {
            type: "above",
            anchor: "middle",
            x: positiveNodeCenterX,
            centerY: abovePlacementBaseCenterY,
            rect: labelBoundsRect("middle", positiveNodeCenterX, abovePlacementBaseCenterY),
          };
          bestPlacement = {
            ...fallbackPlacement,
            score: 9_999_999,
            collisionPenalty: 0,
            ambiguityPenalty: 0,
            hardAmbiguityCount: 0,
            hardViolationCount: 0,
            hardCollisionCount: 0,
            collisionFree: true,
          };
        }
        return {
          sourceTop: positiveSourceTop,
          sourceBottom: positiveSourceBottom,
          branchPenalty: branchClearanceScore.penalty,
          branchMinGap: branchClearanceScore.minGap,
          mergeDeltaShortfall,
          mergeDeltaY,
          placement: bestPlacement,
        };
      };
      const lockedSourceTop = clamp(positiveTop + positiveSourceDropY, sourceTopSearchMin, sourceTopSearchMax);
      const chosenLayout = resolvePositivePlacement(lockedSourceTop);
      const finalSourceTop = chosenLayout?.sourceTop ?? lockedSourceTop;
      const finalSourceBottom = chosenLayout?.sourceBottom ?? finalSourceTop + gainHeight;
      const chosenPlacement = chosenLayout?.placement || {
        anchor: "middle",
        x: positiveNodeX + positiveNodeWidth / 2,
        centerY: finalSourceTop - labelTopGapY - labelBottomOffset,
      };
      const positiveNodeId = `positive-${index}`;
      const positiveFrame = editableNodeFrame(positiveNodeId, positiveNodeX, finalSourceTop, positiveNodeWidth, gainHeight);
      const positiveShift = editorOffsetForNode(positiveNodeId);
      positiveMarkup += `<path d="${flowPath(
        positiveFrame.right,
        positiveFrame.top,
        positiveFrame.bottom,
        netFrame.x + positiveTargetInsetX,
        adjustedTargetTop,
        adjustedTargetTop + adjustedTargetHeight,
        positiveBranchPathOptions
      )}" fill="${greenFlow}" opacity="0.97"></path>`;
      positiveMarkup += renderEditableNodeRect(positiveFrame, greenNode);
      const labelAnchor = chosenPlacement.anchor;
      const labelX = chosenPlacement.x + positiveShift.dx;
      const labelCenterY = chosenPlacement.centerY + positiveShift.dy;
      const chosenLabelRect = labelBoundsRect(labelAnchor, labelX, labelCenterY);
      placedPositiveLabelRects.push(chosenLabelRect);
      positiveMarkup += `<text x="${labelX}" y="${labelCenterY - twoLineGap}" text-anchor="${labelAnchor}" font-size="${positiveNameSize}" font-weight="700" fill="${greenText}" paint-order="stroke fill" stroke="${background}" stroke-width="7" stroke-linejoin="round">${escapeHtml(localizeChartPhrase(item.name))}</text>`;
      positiveMarkup += `<text x="${labelX}" y="${labelCenterY + valueYOffset}" text-anchor="${labelAnchor}" font-size="${positiveValueSize}" font-weight="700" fill="${greenText}" paint-order="stroke fill" stroke="${background}" stroke-width="6" stroke-linejoin="round">${escapeHtml(labelValue)}</text>`;
      positiveTop = finalSourceTop + gainHeight + positiveGap;
      netPositiveCursor += mergeHeight;
    });
  }

  if (coreNetHeight > 0 && coreNetTargetHeight > 0) {
    svg += `<path d="${netBridgePath(
      operatingFrame.right,
      opNetBand.top,
      opNetBand.bottom,
      netFrame.x,
      netDisplayBand.top,
      netDisplayBand.bottom
    )}" fill="${netLoss ? redFlow : greenFlow}" opacity="0.97"></path>`;
  }
  svg += positiveMarkup;
  svg += `
      ${renderEditableNodeRect(netFrame, netLoss ? redNode : greenNode)}
      ${renderRightSummaryLabel(netSummaryLines, netFrame.x + nodeWidth + rightPrimaryLabelGapX, netFrame.centerY)}
  `;

  deductionSlices.forEach((slice, index) => {
    const box = deductionBoxes[index];
    const sourceSlice = deductionSourceSlices[index] || slice;
    const deductionSourceSlice = resolveDeductionTerminalSourceSlice(index, sourceSlice);
    const bridge = constantThicknessBridge(
      deductionSourceSlice,
      box.center,
      slice.item.name === "Other" ? 6 : 12,
      opDeductionSourceBand.top,
      opDeductionSourceBand.bottom
    );
    const deductionFrame = editableNodeFrame(`deduction-${index}`, rightTerminalNodeX, bridge.targetTop, nodeWidth, bridge.targetHeight);
    const operatingShift = editorOffsetForNode("operating");
    const deductionBranchOptions = resolveAdaptiveNegativeTerminalBranchOptions(
      resolveDeductionTerminalBranchOptions(index),
      bridge.sourceTop + operatingShift.dy,
      bridge.sourceBottom + operatingShift.dy,
      deductionFrame.y,
      deductionFrame.height,
      {
        index,
        count: Math.max(deductionSlices.length + opexSlices.length, 1),
        laneBias: index === 0 ? 0.1 : 0.06,
      }
    );
    svg += renderTerminalCapRibbon({
      sourceX: operatingFrame.right,
      sourceTop: bridge.sourceTop + operatingShift.dy,
      sourceBottom: bridge.sourceBottom + operatingShift.dy,
      capX: deductionFrame.x,
      capWidth: nodeWidth,
      targetTop: deductionFrame.y,
      targetHeight: deductionFrame.height,
      flowColor: redFlow,
      capColor: redNode,
      branchOptions: deductionBranchOptions,
    });
    svg += renderEditableNodeRect(deductionFrame, redNode);
    svg += renderRightBranchLabel(slice.item, box, deductionFrame.x, nodeWidth, redText, {
      density: deductionSlices.length >= 3 ? "dense" : "regular",
      defaultMode: "negative-parentheses",
      labelX: negativeTerminalLabelX,
      lockLabelCenterY: true,
      labelCenterY: deductionFrame.centerY,
      avoidFlowModel: {
        x0: operatingFrame.right - Math.max(safeNumber(deductionBranchOptions.sourceCoverInsetX, safeNumber(snapshot.layout?.branchSourceCoverInsetX, 1.5)), 0),
        x1: deductionFrame.x + safeNumber(deductionBranchOptions.targetCoverInsetX, safeNumber(snapshot.layout?.branchTargetCoverInsetX, 14)),
        sourceTop: bridge.sourceTop + operatingShift.dy,
        sourceBottom: bridge.sourceBottom + operatingShift.dy,
        targetTop: deductionFrame.y,
        targetHeight: deductionFrame.height,
        options: mergeOutflowRibbonOptions(deductionBranchOptions),
      },
    });
  });
  const costBreakdownBlocks = costBreakdownSlices.map((slice, index) => {
    const box = costBreakdownBoxes[index];
    const sourceSlice = costBreakdownSourceSlices[index] || slice;
    const bridge = constantThicknessBridge(sourceSlice, box.center, 10, costTop, costBottom);
    return {
      ...sourceSlice,
      box,
      bridge,
    };
  });
  if (costBreakdownBlocks.length === 2 && costBreakdownBlocks.every(Boolean)) {
    svg += renderSharedTrunkCostBreakdownPair(costBreakdownBlocks[0], costBreakdownBlocks[1]);
  } else {
    costBreakdownBlocks.forEach((block, index) => {
      svg += renderCostBreakdownBlock(block, block.bridge.targetTop, block.bridge.targetHeight, index);
    });
  }
  opexSlices.forEach((slice, index) => {
    const box = opexBoxes[index];
    const sourceSlice = opexSourceSlices[index] || slice;
    const bridge = constantThicknessBridge(sourceSlice, box.center, 14, opexTop, opexBottom);
    svg += renderRightExpenseBlock(
      opexTargetX,
      nodeWidth,
      {
        ...sourceSlice,
        box,
        bridge,
      },
      bridge.targetTop,
      bridge.targetHeight,
      opexLabelX,
      redFlow,
      index
    );
  });

  svg += renderOperatingProfitBreakdownCallout();

  svg += `
    ${revenueLabelMarkup}
    ${renderOpexSummaryMarkup()}
    ${renderReplicaFooter(snapshot)}
  `;

  svg += `</g></svg>`;
  return svg;
}
