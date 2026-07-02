"use strict";

function runConfidenceTrustEngine(state, context = {}) {
  const phase = context.phase || "post_execution";
  const tickContext = context.tickContext || {};
  const simulatedDays = Math.max(1, Number(tickContext.simulatedDays || 1));

  const previousSystemicTrust = state.confidence.systemicTrust;

  const difficultyParams = getDifficultyParams(state);
  const scenarioEffects = aggregateScenarioTrustEffects(state);

  const targets = calculateTrustTargets({
    state,
    phase,
    scenarioEffects
  });

  updateTrustScores({
    state,
    targets,
    phase,
    simulatedDays,
    difficultyParams
  });

  updateRunAndPanicRisk({
    state,
    scenarioEffects,
    difficultyParams
  });

  updateTrustRegime(state);
  updateTrustDriversAndRisks(state);
  updateTrustTrend(state, previousSystemicTrust);
  addTrustChartPoint(state);

  return state;
}

function calculateTrustTargets({ state, phase, scenarioEffects }) {
  const monoTarget = calculateMonoStabilityTrustTarget(state, scenarioEffects);
  const divTarget = calculateDivDividendTrustTarget(state, scenarioEffects);
  const inventoryTarget = calculateTreasuryInventoryTrustTarget(state, scenarioEffects);
  const fiatTarget = calculateTreasuryFiatTrustTarget(state, scenarioEffects);
  const policyTarget = calculatePolicyConsistencyTrustTarget(state, scenarioEffects);
  const liquidityTarget = calculateLiquidityTrustTarget(state, scenarioEffects);
  const adoptionTarget = calculateAdoptionTrustTarget(state, scenarioEffects);
  const regulatoryTarget = calculateRegulatorySurvivalTrustTarget(state, scenarioEffects);

  const systemicTarget = calculateSystemicTrustTarget({
    state,
    monoTarget,
    divTarget,
    inventoryTarget,
    fiatTarget,
    policyTarget,
    liquidityTarget,
    adoptionTarget,
    regulatoryTarget,
    phase
  });

  return {
    systemicTrust: systemicTarget,
    monoStabilityTrust: monoTarget,
    divDividendTrust: divTarget,
    treasuryInventoryTrust: inventoryTarget,
    treasuryFiatTrust: fiatTarget,
    policyConsistencyTrust: policyTarget,
    liquidityTrust: liquidityTarget,
    adoptionTrust: adoptionTarget,
    regulatorySurvivalTrust: regulatoryTarget
  };
}

function calculateMonoStabilityTrustTarget(state, scenarioEffects) {
  const price = Math.max(0.000001, state.prices.mono.market);
  const midpoint = Math.max(0.000001, state.prices.mono.policyMidpoint || 1);
  const buyPoint = Math.max(0.000001, state.policy.mono.buyPoint);
  const sellPoint = Math.max(0.000001, state.policy.mono.sellPoint);

  const midpointDeviation = Math.abs(price - midpoint) / midpoint;
  const bandWidth = Math.max(0.000001, sellPoint - buyPoint);
  const bandWidthRatio = bandWidth / midpoint;

  const belowBuyPointPressure =
    price < buyPoint
      ? clamp((buyPoint - price) / buyPoint, 0, 1)
      : 0;

  const aboveSellPointPressure =
    price > sellPoint
      ? clamp((price - sellPoint) / sellPoint, 0, 1)
      : 0;

  const volatilityPenalty = clamp(state.market.mono.volatility * 180, 0, 45);
  const deviationPenalty = clamp(midpointDeviation * 160, 0, 35);
  const supportPenalty = belowBuyPointPressure * 35;
  const excessivePremiumPenalty = aboveSellPointPressure * 10;

  const liquidityBonus = percentToUnit(state.market.mono.liquidity) * 12;
  const inventoryBonus = percentToUnit(state.treasury.mono.controlScore) * 15;
  const executionBonus = percentToUnit(state.treasury.executionQuality) * 10;
  const adoptionQualityBonus = percentToUnit(state.adoption.mono.adoptionQuality) * 10;

  const spreadCredibilityBonus =
    bandWidthRatio >= state.market.mono.volatility * 1.25
      ? 5
      : -8;

  return clamp(
    55 +
      liquidityBonus +
      inventoryBonus +
      executionBonus +
      adoptionQualityBonus +
      spreadCredibilityBonus -
      volatilityPenalty -
      deviationPenalty -
      supportPenalty -
      excessivePremiumPenalty +
      scenarioEffects.monoTrustImpact,
    0,
    100
  );
}

function calculateDivDividendTrustTarget(state, scenarioEffects) {
  const divInventoryScore = percentToUnit(state.treasury.div.controlScore);
  const sustainability = percentToUnit(state.dividends.sustainabilityScore);
  const expectation = percentToUnit(state.dividends.expectationScore);
  const overheating = percentToUnit(state.prices.div.overheatingScore);
  const adoptionQuality = percentToUnit(state.adoption.div.adoptionQuality);
  const liquidity = percentToUnit(state.market.div.liquidity);
  const executionQuality = percentToUnit(state.treasury.executionQuality);

  const targetAnnualDistribution = Math.max(
    0,
    state.policy.dividends.targetAnnualDivDistribution || 0
  );

  const dividendPressure =
    targetAnnualDistribution > 0
      ? clamp(
          targetAnnualDistribution /
            Math.max(1, state.treasury.div.balance + state.circulation.div.supply),
          0,
          1
        )
      : 0;

  const expectationMismatchPenalty =
    expectation > sustainability
      ? (expectation - sustainability) * 35
      : 0;

  const inventoryPenalty = (1 - divInventoryScore) * 35;
  const overheatingPenalty = overheating * 30;
  const volatilityPenalty = clamp(state.market.div.volatility * 90, 0, 35);
  const dividendPressurePenalty = dividendPressure * 45;

  const dividendEnabledBonus =
    state.policy.dividends.enabled ? 4 : -5;

  return clamp(
    45 +
      sustainability * 20 +
      adoptionQuality * 12 +
      liquidity * 8 +
      executionQuality * 8 +
      divInventoryScore * 15 +
      dividendEnabledBonus -
      expectationMismatchPenalty -
      inventoryPenalty -
      overheatingPenalty -
      volatilityPenalty -
      dividendPressurePenalty +
      scenarioEffects.divTrustImpact,
    0,
    100
  );
}

function calculateTreasuryInventoryTrustTarget(state, scenarioEffects) {
  const monoScore = state.treasury.mono.controlScore;
  const divScore = state.treasury.div.controlScore;

  const weakerInventory = Math.min(monoScore, divScore);
  const averageInventory = (monoScore + divScore) / 2;

  const monoDangerPenalty = getInventoryZonePenalty(state.treasury.mono.inventoryZone);
  const divDangerPenalty = getInventoryZonePenalty(state.treasury.div.inventoryZone);

  return clamp(
    averageInventory * 0.45 +
      weakerInventory * 0.45 +
      10 -
      monoDangerPenalty -
      divDangerPenalty +
      scenarioEffects.inventoryTrustImpact,
    0,
    100
  );
}

function calculateTreasuryFiatTrustTarget(state, scenarioEffects) {
  const fiat = state.treasury.fiat;

  const nominal = Math.max(0, fiat.totalUsdNominal || 0);
  const real = Math.max(0, fiat.totalUsdReal || 0);
  const liquid = Math.max(0, fiat.liquidSupportUsd || 0);

  const realRatio = nominal > 0 ? clamp(real / nominal, 0, 1.2) : 0;
  const liquidRatio = nominal > 0 ? clamp(liquid / nominal, 0, 1) : 0;

  const fiatUsefulness = percentToUnit(fiat.fiatUsefulnessScore);
  const blendedReturn = clamp((fiat.blendedUsdAdjustedReturn || 0.02) / 0.08, -1, 1);
  const realReturn = clamp((fiat.blendedRealReturn || 0.01) / 0.06, -1, 1);

  const currencyQuality = calculateCurrencyBasketQuality(state);
  const saturationPenalty = clamp((fiat.globalM2Share || 0) * 200, 0, 30);
  const negativeRealReturnPenalty = realReturn < 0 ? Math.abs(realReturn) * 20 : 0;

  return clamp(
    35 +
      realRatio * 18 +
      liquidRatio * 18 +
      fiatUsefulness * 20 +
      currencyQuality * 18 +
      Math.max(0, blendedReturn) * 6 +
      Math.max(0, realReturn) * 8 -
      saturationPenalty -
      negativeRealReturnPenalty +
      scenarioEffects.fiatTrustImpact,
    0,
    100
  );
}

function calculatePolicyConsistencyTrustTarget(state, scenarioEffects) {
  const monoSpreadScore = calculateSpreadCredibilityScore({
    buyPoint: state.policy.mono.buyPoint,
    sellPoint: state.policy.mono.sellPoint,
    volatility: state.market.mono.volatility
  });

  const divSpreadScore = calculateSpreadCredibilityScore({
    buyPoint: state.policy.div.buyPoint,
    sellPoint: state.policy.div.sellPoint,
    volatility: state.market.div.volatility
  });

  const arbitragePenalty =
    state.market.mono.arbitragePressure * 22 +
    state.market.div.arbitragePressure * 28;

  const executionPenalty =
    (1 - percentToUnit(state.treasury.executionQuality)) * 25;

  const dividendSustainability =
    percentToUnit(state.dividends.sustainabilityScore);

  const dividendPolicyPenalty =
    state.policy.dividends.enabled && dividendSustainability < 0.45
      ? (0.45 - dividendSustainability) * 35
      : 0;

  const strategicReserveRespectBonus =
    state.policy.treasury.preserveStrategicReserves ? 6 : -8;

  return clamp(
    55 +
      monoSpreadScore * 0.18 +
      divSpreadScore * 0.18 +
      percentToUnit(state.treasury.executionQuality) * 18 +
      strategicReserveRespectBonus -
      arbitragePenalty -
      executionPenalty -
      dividendPolicyPenalty +
      scenarioEffects.policyTrustImpact,
    0,
    100
  );
}

function calculateLiquidityTrustTarget(state, scenarioEffects) {
  const monoLiquidity = percentToUnit(state.market.mono.liquidity);
  const divLiquidity = percentToUnit(state.market.div.liquidity);

  const monoDepthRatio = calculateDepthRatio({
    depthUsd: state.market.mono.marketDepthUsd,
    circulationUsd: state.circulation.mono.usdValue
  });

  const divDepthRatio = calculateDepthRatio({
    depthUsd: state.market.div.marketDepthUsd,
    circulationUsd: state.circulation.div.usdValue
  });

  const supportCapacity = percentToUnit(state.treasury.supportCapacityScore);
  const absorptionCapacity = percentToUnit(state.treasury.absorptionCapacityScore);

  const volatilityPenalty =
    clamp(state.market.mono.volatility * 80, 0, 25) +
    clamp(state.market.div.volatility * 55, 0, 30);

  const unfilledPressurePenalty = calculateUnfilledPressurePenalty(state);

  return clamp(
    35 +
      monoLiquidity * 18 +
      divLiquidity * 14 +
      monoDepthRatio * 12 +
      divDepthRatio * 10 +
      supportCapacity * 10 +
      absorptionCapacity * 8 -
      volatilityPenalty -
      unfilledPressurePenalty +
      scenarioEffects.liquidityTrustImpact,
    0,
    100
  );
}

function calculateAdoptionTrustTarget(state, scenarioEffects) {
  const mono = state.adoption.mono;
  const div = state.adoption.div;

  const monoQuality = percentToUnit(mono.adoptionQuality);
  const divQuality = percentToUnit(div.adoptionQuality);

  const stickyShare =
    mono.activeUsers > 0
      ? clamp(mono.stickyUsers / Math.max(1, mono.activeUsers), 0, 1)
      : 0;

  const merchantSupport = clamp(mono.merchants / Math.max(1, mono.activeUsers / 100), 0, 1);
  const businessSupport = clamp(mono.businesses / Math.max(1, mono.merchants / 50), 0, 1);

  const churnPenalty = clamp(mono.churnRate * 70, 0, 25);
  const speculativePenalty = clamp(div.speculativeDemandShare * 22, 0, 22);
  const adoptionOverloadPenalty = calculateAdoptionOverloadPenalty(state);

  return clamp(
    35 +
      monoQuality * 20 +
      divQuality * 10 +
      stickyShare * 14 +
      merchantSupport * 12 +
      businessSupport * 10 +
      percentToUnit(state.confidence.liquidityTrust) * 8 -
      churnPenalty -
      speculativePenalty -
      adoptionOverloadPenalty +
      scenarioEffects.adoptionTrustImpact,
    0,
    100
  );
}

function calculateRegulatorySurvivalTrustTarget(state, scenarioEffects) {
  const regulationPressure = clamp(state.market.regime.regulationPressure || 0, 0, 1);
  const governmentResistance = percentToUnit(state.fiatDisplacement.governmentResistanceLevel);
  const bankingFriction = percentToUnit(state.fiatDisplacement.bankingFrictionLevel);
  const fiatDisplacement = percentToUnit(state.fiatDisplacement.index);

  const treasuryControl = percentToUnit(state.treasury.controlScore);
  const fiatTrust = percentToUnit(state.confidence.treasuryFiatTrust);
  const policyConsistency = percentToUnit(state.confidence.policyConsistencyTrust);

  const displacementRiskPenalty =
    fiatDisplacement > 0.45
      ? (fiatDisplacement - 0.45) * 45
      : 0;

  return clamp(
    75 +
      treasuryControl * 8 +
      fiatTrust * 7 +
      policyConsistency * 5 -
      regulationPressure * 45 -
      governmentResistance * 25 -
      bankingFriction * 20 -
      displacementRiskPenalty +
      scenarioEffects.regulatoryTrustImpact,
    0,
    100
  );
}

function calculateSystemicTrustTarget({
  state,
  monoTarget,
  divTarget,
  inventoryTarget,
  fiatTarget,
  policyTarget,
  liquidityTarget,
  adoptionTarget,
  regulatoryTarget,
  phase
}) {
  const fiatDisplacement = percentToUnit(state.fiatDisplacement.index);
  const crisisMode = state.confidence.panicRisk > 0.35 || state.confidence.runRisk > 0.35;

  let weights;

  if (crisisMode) {
    weights = {
      mono: 0.25,
      div: 0.08,
      inventory: 0.22,
      fiat: 0.18,
      policy: 0.08,
      liquidity: 0.13,
      adoption: 0.03,
      regulatory: 0.03
    };
  } else if (fiatDisplacement > 0.55) {
    weights = {
      mono: 0.22,
      div: 0.12,
      inventory: 0.16,
      fiat: 0.1,
      policy: 0.08,
      liquidity: 0.12,
      adoption: 0.14,
      regulatory: 0.06
    };
  } else {
    weights = {
      mono: 0.25,
      div: 0.15,
      inventory: 0.15,
      fiat: 0.15,
      policy: 0.05,
      liquidity: 0.1,
      adoption: 0.1,
      regulatory: 0.05
    };
  }

  const weighted =
    monoTarget * weights.mono +
    divTarget * weights.div +
    inventoryTarget * weights.inventory +
    fiatTarget * weights.fiat +
    policyTarget * weights.policy +
    liquidityTarget * weights.liquidity +
    adoptionTarget * weights.adoption +
    regulatoryTarget * weights.regulatory;

  const phasePenalty =
    phase === "pre_execution"
      ? 0
      : calculateVisibleFailurePenalty(state);

  return clamp(weighted - phasePenalty, 0, 100);
}

function updateTrustScores({
  state,
  targets,
  phase,
  simulatedDays,
  difficultyParams
}) {
  const recoveryMultiplier = difficultyParams.trustRecoveryMultiplier || 1;

  for (const [key, target] of Object.entries(targets)) {
    const current = Number(state.confidence[key] || 0);

    const next = moveTrust({
      current,
      target,
      phase,
      simulatedDays,
      recoveryMultiplier
    });

    state.confidence[key] = next;
  }
}

function moveTrust({
  current,
  target,
  phase,
  simulatedDays,
  recoveryMultiplier
}) {
  const gap = target - current;

  if (Math.abs(gap) < 0.001) {
    return clamp(target, 0, 100);
  }

  /*
    Trust should rise slowly and fall quickly.
    Post-execution updates are allowed to move more because the market has
    seen whether treasury policy actually worked.
  */
  const baseRiseSpeed = phase === "pre_execution" ? 0.012 : 0.018;
  const baseFallSpeed = phase === "pre_execution" ? 0.04 : 0.075;

  const speed =
    gap > 0
      ? baseRiseSpeed * recoveryMultiplier
      : baseFallSpeed;

  const adjustedSpeed = clamp(speed * simulatedDays, 0.001, gap > 0 ? 0.12 : 0.35);

  return clamp(current + gap * adjustedSpeed, 0, 100);
}

function updateRunAndPanicRisk({
  state,
  scenarioEffects,
  difficultyParams
}) {
  const systemicTrust = percentToUnit(state.confidence.systemicTrust);
  const monoTrust = percentToUnit(state.confidence.monoStabilityTrust);
  const inventoryTrust = percentToUnit(state.confidence.treasuryInventoryTrust);
  const fiatTrust = percentToUnit(state.confidence.treasuryFiatTrust);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const regulatoryTrust = percentToUnit(state.confidence.regulatorySurvivalTrust);

  const monoBelowBuyPoint =
    state.prices.mono.market < state.policy.mono.buyPoint
      ? clamp(
          (state.policy.mono.buyPoint - state.prices.mono.market) /
            Math.max(0.000001, state.policy.mono.buyPoint),
          0,
          1
        )
      : 0;

  const divOverheating = percentToUnit(state.prices.div.overheatingScore);

  const unfilledPressure = clamp(calculateUnfilledPressurePenalty(state) / 60, 0, 1);

  const runRiskTarget = clamp(
    (1 - systemicTrust) * 0.22 +
      (1 - monoTrust) * 0.18 +
      (1 - inventoryTrust) * 0.18 +
      (1 - fiatTrust) * 0.12 +
      (1 - liquidityTrust) * 0.16 +
      monoBelowBuyPoint * 0.22 +
      unfilledPressure * 0.18 +
      scenarioEffects.runRiskImpact * 0.01,
    0,
    1
  );

  const panicRiskTarget = clamp(
    runRiskTarget * 0.45 +
      (1 - systemicTrust) * 0.18 +
      (1 - regulatoryTrust) * 0.12 +
      divOverheating * 0.1 +
      state.market.regime.bankingStress * 0.08 +
      state.market.regime.regulationPressure * 0.08 +
      scenarioEffects.panicRiskImpact * 0.01,
    0,
    1
  );

  const panicMultiplier = difficultyParams.panicMultiplier || 1;

  state.confidence.runRisk = smoothRisk({
    current: state.confidence.runRisk,
    target: runRiskTarget,
    multiplier: panicMultiplier
  });

  state.confidence.panicRisk = smoothRisk({
    current: state.confidence.panicRisk,
    target: panicRiskTarget,
    multiplier: panicMultiplier
  });
}

function smoothRisk({ current, target, multiplier }) {
  const gap = target - current;
  const speed = gap > 0 ? 0.12 * multiplier : 0.045;

  return clamp(current + gap * clamp(speed, 0.01, 0.35), 0, 1);
}

function updateTrustRegime(state) {
  const trust = state.confidence.systemicTrust;

  if (trust >= 80) {
    state.confidence.trustRegime = "calm";
  } else if (trust >= 60) {
    state.confidence.trustRegime = "normal";
  } else if (trust >= 40) {
    state.confidence.trustRegime = "fragile";
  } else if (trust >= 20) {
    state.confidence.trustRegime = "run_risk";
  } else {
    state.confidence.trustRegime = "panic";
  }
}

function updateTrustDriversAndRisks(state) {
  const drivers = [];
  const risks = [];

  addDriverOrRisk({
    score: state.confidence.monoStabilityTrust,
    goodThreshold: 75,
    badThreshold: 45,
    goodMessage: "Mono stability is supporting trust.",
    badMessage: "Mono stability is weakening trust.",
    drivers,
    risks
  });

  addDriverOrRisk({
    score: state.confidence.divDividendTrust,
    goodThreshold: 75,
    badThreshold: 45,
    goodMessage: "DIV dividend credibility is supporting trust.",
    badMessage: "DIV dividend credibility is weak.",
    drivers,
    risks
  });

  addDriverOrRisk({
    score: state.confidence.treasuryInventoryTrust,
    goodThreshold: 75,
    badThreshold: 50,
    goodMessage: "Treasury coin inventory remains credible.",
    badMessage: "Treasury coin inventory is becoming a trust risk.",
    drivers,
    risks
  });

  addDriverOrRisk({
    score: state.confidence.treasuryFiatTrust,
    goodThreshold: 75,
    badThreshold: 50,
    goodMessage: "Treasury fiat reserves remain useful and liquid.",
    badMessage: "Treasury fiat quality is weakening.",
    drivers,
    risks
  });

  addDriverOrRisk({
    score: state.confidence.liquidityTrust,
    goodThreshold: 72,
    badThreshold: 45,
    goodMessage: "Liquidity conditions are healthy.",
    badMessage: "Liquidity conditions are fragile.",
    drivers,
    risks
  });

  addDriverOrRisk({
    score: state.confidence.policyConsistencyTrust,
    goodThreshold: 75,
    badThreshold: 50,
    goodMessage: "Treasury policy looks consistent.",
    badMessage: "Treasury policy is creating credibility concerns.",
    drivers,
    risks
  });

  if (state.confidence.runRisk > 0.25) {
    risks.push("Run risk is elevated.");
  }

  if (state.confidence.panicRisk > 0.25) {
    risks.push("Panic risk is elevated.");
  }

  if (state.prices.div.overheatingScore > 60) {
    risks.push("DIV overheating is damaging confidence.");
  }

  if (state.treasury.mono.inventoryZone === "danger" || state.treasury.mono.inventoryZone === "critical") {
    risks.push("Mono treasury inventory is below a safe control zone.");
  }

  if (state.treasury.div.inventoryZone === "danger" || state.treasury.div.inventoryZone === "critical") {
    risks.push("DIV treasury inventory is below a safe control zone.");
  }

  state.confidence.mainDrivers = drivers.slice(0, 5);
  state.confidence.mainRisks = risks.slice(0, 5);
}

function addDriverOrRisk({
  score,
  goodThreshold,
  badThreshold,
  goodMessage,
  badMessage,
  drivers,
  risks
}) {
  if (score >= goodThreshold) {
    drivers.push(goodMessage);
  } else if (score <= badThreshold) {
    risks.push(badMessage);
  }
}

function updateTrustTrend(state, previousSystemicTrust) {
  const change = state.confidence.systemicTrust - previousSystemicTrust;

  if (change > 0.15) {
    state.confidence.trend = "rising";
  } else if (change < -0.15) {
    state.confidence.trend = "falling";
  } else {
    state.confidence.trend = "stable";
  }
}

function aggregateScenarioTrustEffects(state) {
  const output = {
    monoTrustImpact: 0,
    divTrustImpact: 0,
    inventoryTrustImpact: 0,
    fiatTrustImpact: 0,
    policyTrustImpact: 0,
    liquidityTrustImpact: 0,
    adoptionTrustImpact: 0,
    regulatoryTrustImpact: 0,
    runRiskImpact: 0,
    panicRiskImpact: 0
  };

  for (const scenario of state.scenarios.active || []) {
    const effects = scenario.effects || {};

    output.monoTrustImpact += Number(effects.monoTrustImpact || 0);
    output.divTrustImpact += Number(effects.divTrustImpact || 0);
    output.inventoryTrustImpact += Number(effects.inventoryTrustImpact || 0);
    output.fiatTrustImpact += Number(effects.fiatTrustImpact || 0);
    output.policyTrustImpact += Number(effects.policyTrustImpact || 0);
    output.liquidityTrustImpact += Number(effects.liquidityTrustImpact || 0);
    output.adoptionTrustImpact += Number(effects.adoptionTrustImpact || 0);
    output.regulatoryTrustImpact += Number(effects.regulatoryTrustImpact || 0);
    output.runRiskImpact += Number(effects.runRiskImpact || 0);
    output.panicRiskImpact += Number(effects.panicRiskImpact || 0);

    output.liquidityTrustImpact += Number(effects.liquidityImpact || 0) * 0.35;
    output.regulatoryTrustImpact -= Number(effects.regulatoryPressureImpact || 0) * 0.3;
    output.fiatTrustImpact += Number(effects.fiatUsefulnessImpact || 0) * 0.25;
  }

  return output;
}

function addTrustChartPoint(state) {
  state.charts.systemicTrust.push({
    tick: state.runtime.tick,
    simulatedDay: state.runtime.simulatedDay,
    value: state.confidence.systemicTrust,
    createdAt: Date.now()
  });
}

function calculateCurrencyBasketQuality(state) {
  const accounts = Object.values(state.fiatCurrencies || {});

  if (accounts.length === 0) {
    return 0;
  }

  let weightedQuality = 0;
  let totalUsd = 0;
  let concentration = 0;

  for (const account of accounts) {
    const usd = Math.max(0, account.usdEquivalent || 0);
    totalUsd += usd;
  }

  if (totalUsd <= 0) {
    return 0.4;
  }

  for (const account of accounts) {
    const usd = Math.max(0, account.usdEquivalent || 0);
    const weight = usd / totalUsd;

    const quality =
      percentToUnit(account.trustScore) * 0.35 +
      percentToUnit(account.liquidityScore) * 0.25 +
      percentToUnit(account.bankingDepthScore) * 0.2 +
      percentToUnit(account.gdpDepthScore) * 0.1 +
      (1 - percentToUnit(account.capitalControlPenalty)) * 0.1;

    weightedQuality += weight * quality;
    concentration += weight * weight;
  }

  const diversificationBonus = clamp(1 - concentration, 0, 1) * 0.15;

  return clamp(weightedQuality + diversificationBonus, 0, 1);
}

function calculateSpreadCredibilityScore({ buyPoint, sellPoint, volatility }) {
  const buy = Math.max(0.000001, Number(buyPoint || 0));
  const sell = Math.max(0.000001, Number(sellPoint || 0));
  const midpoint = Math.max(0.000001, (buy + sell) / 2);

  if (buy > sell) {
    return 0;
  }

  const spreadRatio = (sell - buy) / midpoint;
  const volatilityNeeded = Math.max(0.000001, Number(volatility || 0) * 1.25);

  if (spreadRatio >= volatilityNeeded) {
    return clamp(75 + Math.min(spreadRatio / volatilityNeeded, 2) * 10, 0, 100);
  }

  return clamp((spreadRatio / volatilityNeeded) * 75, 0, 75);
}

function calculateDepthRatio({ depthUsd, circulationUsd }) {
  const depth = Math.max(0, Number(depthUsd || 0));
  const circulation = Math.max(1, Number(circulationUsd || 1));

  return clamp(depth / circulation, 0, 1);
}

function calculateUnfilledPressurePenalty(state) {
  const monoUnfilledBuy = Math.max(0, state.market.mono.unfilledBuyDemandUsd || 0);
  const divUnfilledBuy = Math.max(0, state.market.div.unfilledBuyDemandUsd || 0);

  const monoUnfilledSell =
    Math.max(0, state.market.mono.unfilledSellPressureCoins || 0) *
    Math.max(0.000001, state.prices.mono.market);

  const divUnfilledSell =
    Math.max(0, state.market.div.unfilledSellPressureCoins || 0) *
    Math.max(0.000001, state.prices.div.market);

  const totalUnfilled =
    monoUnfilledBuy +
    divUnfilledBuy +
    monoUnfilledSell +
    divUnfilledSell;

  const totalDepth =
    Math.max(1, state.market.mono.marketDepthUsd || 0) +
    Math.max(1, state.market.div.marketDepthUsd || 0);

  return clamp((totalUnfilled / totalDepth) * 40, 0, 60);
}

function calculateAdoptionOverloadPenalty(state) {
  const flows = state.adoption.flows;
  const mono = state.adoption.mono;

  const activeGrowthRate =
    mono.activeUsers > 0
      ? flows.activeGrowth / Math.max(1, mono.activeUsers)
      : 0;

  const merchantGrowthRate =
    mono.merchants > 0
      ? flows.merchantGrowth / Math.max(1, mono.merchants)
      : 0;

  const liquidityWeakness = 1 - percentToUnit(state.confidence.liquidityTrust);

  const overload =
    activeGrowthRate * 0.35 +
    merchantGrowthRate * 0.35 +
    liquidityWeakness * 0.3;

  return clamp((overload - 0.08) * 120, 0, 30);
}

function calculateVisibleFailurePenalty(state) {
  let penalty = 0;

  if (state.prices.mono.market < state.policy.mono.buyPoint) {
    const gap =
      (state.policy.mono.buyPoint - state.prices.mono.market) /
      Math.max(0.000001, state.policy.mono.buyPoint);

    penalty += clamp(gap * 25, 0, 20);
  }

  if (state.market.mono.unfilledSellPressureCoins > 0) {
    penalty += clamp(
      state.market.mono.unfilledSellPressureCoins /
        Math.max(1, state.circulation.mono.supply) *
        30,
      0,
      15
    );
  }

  if (state.market.div.unfilledSellPressureCoins > 0) {
    penalty += clamp(
      state.market.div.unfilledSellPressureCoins /
        Math.max(1, state.circulation.div.supply) *
        20,
      0,
      12
    );
  }

  if (state.treasury.mono.inventoryZone === "critical") {
    penalty += 8;
  }

  if (state.treasury.div.inventoryZone === "critical") {
    penalty += 8;
  }

  return clamp(penalty, 0, 35);
}

function getInventoryZonePenalty(zone) {
  switch (zone) {
    case "excellent":
      return 0;
    case "strong":
      return 0;
    case "weakening":
      return 4;
    case "danger":
      return 12;
    case "critical":
      return 25;
    case "lost_sell_side_control":
      return 45;
    default:
      return 8;
  }
}

function getDifficultyParams(state) {
  const difficulty = state.defaults.difficulty || "normal";
  const params = state.defaults.difficultyParams[difficulty];

  return params || state.defaults.difficultyParams.normal;
}

function percentToUnit(value) {
  return clamp(Number(value || 0) / 100, 0, 1);
}

function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

module.exports = {
  runConfidenceTrustEngine
};
