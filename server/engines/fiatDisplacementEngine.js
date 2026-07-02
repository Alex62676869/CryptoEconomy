"use strict";

function runFiatDisplacementEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const simulatedDays = Math.max(1, Number(tickContext.simulatedDays || 1));

  const scenarioEffects = aggregateScenarioDisplacementEffects(state);

  updateMonetaryFunctionAdoption({
    state,
    simulatedDays,
    scenarioEffects
  });

  updateFiatUsefulnessFromDisplacement({
    state,
    simulatedDays,
    scenarioEffects
  });

  updateGovernmentResistance({
    state,
    simulatedDays,
    scenarioEffects
  });

  updateFiatDisplacementIndex(state);
  updateFiatDisplacementStage(state);
  updateTreasuryFiatDependence(state);
  updateRealFiatPurchasingPower(state, simulatedDays);
  addFiatDisplacementWarnings(state);
  addFiatDisplacementChartPoint(state);

  return state;
}

function updateMonetaryFunctionAdoption({
  state,
  simulatedDays,
  scenarioEffects
}) {
  const mono = state.adoption.mono;
  const displacement = state.fiatDisplacement;

  const systemicTrust = percentToUnit(state.confidence.systemicTrust);
  const monoTrust = percentToUnit(state.confidence.monoStabilityTrust);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const adoptionTrust = percentToUnit(state.confidence.adoptionTrust);
  const regulatoryTrust = percentToUnit(state.confidence.regulatorySurvivalTrust);

  const fiatWeakness = 1 - percentToUnit(displacement.fiatUsefulnessScore);
  const paymentBase = percentToUnit(mono.paymentAdoption);
  const savingsBase = percentToUnit(mono.savingsAdoption);
  const settlementBase = percentToUnit(mono.settlementAdoption);
  const reserveBase = percentToUnit(mono.reserveAdoption);
  const unitOfAccountBase = percentToUnit(mono.unitOfAccountAdoption);

  const merchantCoverage = calculateMerchantCoverage(state);
  const businessCoverage = calculateBusinessCoverage(state);
  const institutionCoverage = calculateInstitutionCoverage(state);

  const resistancePenalty =
    percentToUnit(displacement.governmentResistanceLevel) * 0.35 +
    percentToUnit(displacement.bankingFrictionLevel) * 0.25;

  const trustGate =
    systemicTrust * 0.25 +
    monoTrust * 0.3 +
    liquidityTrust * 0.2 +
    adoptionTrust * 0.15 +
    regulatoryTrust * 0.1;

  const paymentTarget = clamp(
    paymentBase * 65 +
      merchantCoverage * 25 +
      businessCoverage * 10 +
      fiatWeakness * 8 +
      scenarioEffects.paymentAdoptionImpact -
      resistancePenalty * 35,
    0,
    100
  );

  const savingsTarget = clamp(
    savingsBase * 60 +
      reserveBase * 18 +
      fiatWeakness * 22 +
      monoTrust * 12 +
      scenarioEffects.savingsAdoptionImpact -
      resistancePenalty * 25,
    0,
    100
  );

  const businessSettlementTarget = clamp(
    settlementBase * 55 +
      businessCoverage * 28 +
      merchantCoverage * 8 +
      liquidityTrust * 8 +
      scenarioEffects.businessSettlementImpact -
      resistancePenalty * 30,
    0,
    100
  );

  const reserveTarget = clamp(
    reserveBase * 50 +
      institutionCoverage * 30 +
      savingsTarget * 0.08 +
      fiatWeakness * 12 +
      scenarioEffects.reserveAdoptionImpact -
      resistancePenalty * 25,
    0,
    100
  );

  /*
    Unit-of-account adoption is intentionally the hardest monetary function.
    It requires stable Mono, broad merchant coverage, business settlement,
    and existing payment usage.
  */
  const unitOfAccountGate =
    trustGate *
    percentToUnit(paymentTarget) *
    percentToUnit(businessSettlementTarget) *
    percentToUnit(savingsTarget);

  const unitOfAccountTarget = clamp(
    unitOfAccountBase * 45 +
      unitOfAccountGate * 55 +
      fiatWeakness * 10 +
      scenarioEffects.unitOfAccountImpact -
      resistancePenalty * 40,
    0,
    100
  );

  displacement.paymentAdoption = moveSlowly({
    current: displacement.paymentAdoption,
    target: paymentTarget,
    simulatedDays,
    riseSpeed: 0.012,
    fallSpeed: 0.025
  });

  displacement.savingsAdoption = moveSlowly({
    current: displacement.savingsAdoption,
    target: savingsTarget,
    simulatedDays,
    riseSpeed: 0.01,
    fallSpeed: 0.022
  });

  displacement.businessSettlementAdoption = moveSlowly({
    current: displacement.businessSettlementAdoption,
    target: businessSettlementTarget,
    simulatedDays,
    riseSpeed: 0.008,
    fallSpeed: 0.02
  });

  displacement.reserveAdoption = moveSlowly({
    current: displacement.reserveAdoption,
    target: reserveTarget,
    simulatedDays,
    riseSpeed: 0.006,
    fallSpeed: 0.018
  });

  displacement.unitOfAccountAdoption = moveSlowly({
    current: displacement.unitOfAccountAdoption,
    target: unitOfAccountTarget,
    simulatedDays,
    riseSpeed: 0.003,
    fallSpeed: 0.015
  });

  displacement.merchantAdoption = clamp(
    merchantCoverage * 100,
    0,
    100
  );

  /*
    Keep adoption.mono's monetary-function fields aligned with the
    displacement engine's slower, more conservative interpretation.
  */
  mono.paymentAdoption = Math.max(mono.paymentAdoption, displacement.paymentAdoption * 0.65);
  mono.savingsAdoption = Math.max(mono.savingsAdoption, displacement.savingsAdoption * 0.65);
  mono.settlementAdoption = Math.max(mono.settlementAdoption, displacement.businessSettlementAdoption * 0.65);
  mono.reserveAdoption = Math.max(mono.reserveAdoption, displacement.reserveAdoption * 0.65);
  mono.unitOfAccountAdoption = Math.max(mono.unitOfAccountAdoption, displacement.unitOfAccountAdoption * 0.65);
}

function updateFiatUsefulnessFromDisplacement({
  state,
  simulatedDays,
  scenarioEffects
}) {
  const displacement = state.fiatDisplacement;
  const treasuryFiat = state.treasury.fiat;

  const purchasingPower = percentToUnit(displacement.realFiatPurchasingPower);
  const reserveQuality = percentToUnit(treasuryFiat.fiatUsefulnessScore);
  const liquidityQuality =
    treasuryFiat.totalUsdNominal > 0
      ? clamp(treasuryFiat.liquidSupportUsd / treasuryFiat.totalUsdNominal, 0, 1)
      : 0;

  const bankingReliability =
    1 - percentToUnit(displacement.bankingFrictionLevel);

  const governmentEnforceability =
    1 - percentToUnit(displacement.governmentResistanceLevel) * 0.35;

  const merchantFiatDependence =
    1 - percentToUnit(displacement.merchantAdoption);

  const unitOfAccountFiatDependence =
    1 - percentToUnit(displacement.unitOfAccountAdoption);

  const settlementFiatDependence =
    1 - percentToUnit(displacement.businessSettlementAdoption);

  const reserveFiatDependence =
    1 - percentToUnit(displacement.reserveAdoption);

  const interestAttractiveness = clamp(
    0.5 +
      Number(treasuryFiat.blendedRealReturn || 0) * 8 +
      Number(treasuryFiat.blendedUsdAdjustedReturn || 0) * 5,
    0,
    1
  );

  const target = clamp(
    purchasingPower * 18 +
      reserveQuality * 16 +
      liquidityQuality * 14 +
      bankingReliability * 12 +
      governmentEnforceability * 10 +
      merchantFiatDependence * 8 +
      unitOfAccountFiatDependence * 10 +
      settlementFiatDependence * 6 +
      reserveFiatDependence * 4 +
      interestAttractiveness * 8 +
      scenarioEffects.fiatUsefulnessImpact,
    0,
    100
  );

  displacement.fiatUsefulnessScore = moveSlowly({
    current: displacement.fiatUsefulnessScore,
    target,
    simulatedDays,
    riseSpeed: 0.008,
    fallSpeed: 0.018
  });

  /*
    Treasury fiat usefulness should not instantly equal social fiat usefulness,
    but the two should influence each other.
  */
  treasuryFiat.fiatUsefulnessScore = clamp(
    treasuryFiat.fiatUsefulnessScore * 0.75 +
      displacement.fiatUsefulnessScore * 0.25,
    0,
    100
  );
}

function updateGovernmentResistance({
  state,
  simulatedDays,
  scenarioEffects
}) {
  const displacement = state.fiatDisplacement;

  const displacementIndex = percentToUnit(displacement.index);
  const unitOfAccount = percentToUnit(displacement.unitOfAccountAdoption);
  const payment = percentToUnit(displacement.paymentAdoption);
  const settlement = percentToUnit(displacement.businessSettlementAdoption);
  const reserve = percentToUnit(displacement.reserveAdoption);
  const mediaAttention = clamp(state.market.regime.mediaAttention || 0, 0, 1);
  const regulationPressure = clamp(state.market.regime.regulationPressure || 0, 0, 1);

  const resistanceTarget = clamp(
    displacementIndex * 45 +
      unitOfAccount * 22 +
      payment * 10 +
      settlement * 10 +
      reserve * 8 +
      mediaAttention * 8 +
      regulationPressure * 20 +
      scenarioEffects.governmentResistanceImpact,
    0,
    100
  );

  const bankingFrictionTarget = clamp(
    resistanceTarget * 0.55 +
      regulationPressure * 25 +
      percentToUnit(displacement.index) * 20 +
      scenarioEffects.bankingFrictionImpact,
    0,
    100
  );

  displacement.governmentResistanceLevel = moveSlowly({
    current: displacement.governmentResistanceLevel,
    target: resistanceTarget,
    simulatedDays,
    riseSpeed: 0.012,
    fallSpeed: 0.004
  });

  displacement.bankingFrictionLevel = moveSlowly({
    current: displacement.bankingFrictionLevel,
    target: bankingFrictionTarget,
    simulatedDays,
    riseSpeed: 0.014,
    fallSpeed: 0.006
  });

  /*
    Once fiat displacement becomes politically meaningful, regulation pressure
    should become somewhat endogenous.
  */
  const endogenousRegulationPressure =
    percentToUnit(displacement.governmentResistanceLevel) * 0.35 +
    percentToUnit(displacement.index) * 0.15;

  state.market.regime.regulationPressure = clamp(
    state.market.regime.regulationPressure * 0.85 +
      endogenousRegulationPressure * 0.15,
    0,
    1
  );
}

function updateFiatDisplacementIndex(state) {
  const displacement = state.fiatDisplacement;

  const savings = displacement.savingsAdoption;
  const payments = displacement.paymentAdoption;
  const unitOfAccount = displacement.unitOfAccountAdoption;
  const settlement = displacement.businessSettlementAdoption;
  const reserve = displacement.reserveAdoption;
  const fiatWeakness = 100 - displacement.fiatUsefulnessScore;

  const rawIndex =
    savings * 0.25 +
    payments * 0.25 +
    unitOfAccount * 0.2 +
    settlement * 0.1 +
    reserve * 0.1 +
    fiatWeakness * 0.1;

  /*
    Unit-of-account adoption is the main gate to late-game fiat displacement.
    Without it, the index can rise but should not imply fiat has lost its
    central measuring function.
  */
  const unitOfAccountGate = calculateUnitOfAccountGate(unitOfAccount);

  displacement.index = clamp(
    rawIndex * unitOfAccountGate,
    0,
    100
  );

  displacement.globalM2Share = calculateGlobalM2Share(state);
}

function updateFiatDisplacementStage(state) {
  const index = state.fiatDisplacement.index;

  if (index < 10) {
    state.fiatDisplacement.stage = "fiat_dominant";
  } else if (index < 25) {
    state.fiatDisplacement.stage = "crypto_alternative";
  } else if (index < 45) {
    state.fiatDisplacement.stage = "parallel_monetary_system";
  } else if (index < 65) {
    state.fiatDisplacement.stage = "monetary_competition";
  } else if (index < 80) {
    state.fiatDisplacement.stage = "strategically_weakened_fiat";
  } else if (index < 90) {
    state.fiatDisplacement.stage = "fiat_displacement_regime";
  } else {
    state.fiatDisplacement.stage = "fiat_meaning_collapse";
  }
}

function updateTreasuryFiatDependence(state) {
  const displacement = state.fiatDisplacement;

  const fiatSupportNeed =
    100 -
    (
      displacement.reserveAdoption * 0.3 +
      displacement.businessSettlementAdoption * 0.25 +
      displacement.paymentAdoption * 0.2 +
      displacement.unitOfAccountAdoption * 0.15 +
      displacement.savingsAdoption * 0.1
    );

  const treasuryCoinControl =
    (state.treasury.mono.controlScore + state.treasury.div.controlScore) / 2;

  const coinControlReduction =
    percentToUnit(treasuryCoinControl) * 18;

  displacement.treasuryFiatDependence = clamp(
    fiatSupportNeed - coinControlReduction,
    0,
    100
  );
}

function updateRealFiatPurchasingPower(state, simulatedDays) {
  const displacement = state.fiatDisplacement;
  const blendedRealReturn = Number(state.treasury.fiat.blendedRealReturn || 0);
  const inflationFear = clamp(state.market.regime.inflationFear || 0, 0, 1);
  const bankingStress = clamp(state.market.regime.bankingStress || 0, 0, 1);

  const annualPurchasingPowerDrift =
    blendedRealReturn -
    inflationFear * 0.035 -
    bankingStress * 0.02 -
    percentToUnit(displacement.index) * 0.015;

  const drift = annualPurchasingPowerDrift * (simulatedDays / 365);

  displacement.realFiatPurchasingPower = clamp(
    displacement.realFiatPurchasingPower * (1 + drift),
    0,
    120
  );
}

function addFiatDisplacementWarnings(state) {
  const warnings = [];
  const displacement = state.fiatDisplacement;

  if (displacement.index >= 45 && displacement.governmentResistanceLevel >= 45) {
    warnings.push(createWarning({
      code: "government_resistance_rising",
      severity: "high",
      message: "Fiat displacement is now high enough to attract serious government resistance."
    }));
  }

  if (displacement.unitOfAccountAdoption < 10 && displacement.index > 35) {
    warnings.push(createWarning({
      code: "weak_unit_of_account_adoption",
      severity: "medium",
      message: "Fiat displacement is limited because Mono is not yet widely used as a unit of account."
    }));
  }

  if (displacement.paymentAdoption > 40 && displacement.merchantAdoption < 20) {
    warnings.push(createWarning({
      code: "payment_adoption_unbalanced",
      severity: "medium",
      message: "Payment demand is growing faster than merchant coverage."
    }));
  }

  if (displacement.fiatUsefulnessScore < 30 && displacement.treasuryFiatDependence > 55) {
    warnings.push(createWarning({
      code: "dangerous_fiat_dependence",
      severity: "high",
      message: "The system still depends heavily on fiat even though fiat usefulness is weakening."
    }));
  }

  if (warnings.length > 0) {
    state.warnings = dedupeWarnings([
      ...(state.warnings || []),
      ...warnings
    ]);
  }
}

function addFiatDisplacementChartPoint(state) {
  state.charts.fiatDisplacement.push({
    tick: state.runtime.tick,
    simulatedDay: state.runtime.simulatedDay,
    value: state.fiatDisplacement.index,
    stage: state.fiatDisplacement.stage,
    fiatUsefulnessScore: state.fiatDisplacement.fiatUsefulnessScore,
    createdAt: Date.now()
  });
}

function aggregateScenarioDisplacementEffects(state) {
  const output = {
    savingsAdoptionImpact: 0,
    paymentAdoptionImpact: 0,
    businessSettlementImpact: 0,
    unitOfAccountImpact: 0,
    reserveAdoptionImpact: 0,
    fiatUsefulnessImpact: 0,
    governmentResistanceImpact: 0,
    bankingFrictionImpact: 0
  };

  for (const scenario of state.scenarios.active || []) {
    const effects = scenario.effects || {};
    const intensity = Number(scenario.currentIntensity || 1);

    output.savingsAdoptionImpact += Number(effects.savingsAdoptionImpact || 0) * intensity;
    output.paymentAdoptionImpact += Number(effects.paymentAdoptionImpact || 0) * intensity;
    output.businessSettlementImpact += Number(effects.businessSettlementImpact || 0) * intensity;
    output.unitOfAccountImpact += Number(effects.unitOfAccountImpact || 0) * intensity;
    output.reserveAdoptionImpact += Number(effects.reserveAdoptionImpact || 0) * intensity;
    output.fiatUsefulnessImpact += Number(effects.fiatUsefulnessImpact || 0) * intensity;
    output.governmentResistanceImpact += Number(effects.governmentResistanceImpact || 0) * intensity;
    output.bankingFrictionImpact += Number(effects.bankingFrictionImpact || 0) * intensity;

    if (effects.monoDemandImpact > 0) {
      output.savingsAdoptionImpact += Number(effects.monoDemandImpact || 0) * 0.08 * intensity;
      output.paymentAdoptionImpact += Number(effects.monoDemandImpact || 0) * 0.05 * intensity;
    }

    if (effects.bankingStressImpact > 0) {
      output.fiatUsefulnessImpact -= Number(effects.bankingStressImpact || 0) * 0.25 * intensity;
      output.savingsAdoptionImpact += Number(effects.bankingStressImpact || 0) * 0.08 * intensity;
    }

    if (effects.regulatoryPressureImpact > 0) {
      output.governmentResistanceImpact += Number(effects.regulatoryPressureImpact || 0) * 0.45 * intensity;
      output.bankingFrictionImpact += Number(effects.regulatoryPressureImpact || 0) * 0.25 * intensity;
    }
  }

  return output;
}

function calculateMerchantCoverage(state) {
  const activeUsers = Math.max(1, state.adoption.mono.activeUsers || 1);
  const merchants = Math.max(0, state.adoption.mono.merchants || 0);

  /*
    A healthy payment economy needs roughly one merchant per 100 active users.
  */
  return clamp(merchants / Math.max(1, activeUsers / 100), 0, 1);
}

function calculateBusinessCoverage(state) {
  const merchants = Math.max(1, state.adoption.mono.merchants || 1);
  const businesses = Math.max(0, state.adoption.mono.businesses || 0);

  /*
    Business settlement is harder than basic merchant acceptance.
  */
  return clamp(businesses / Math.max(1, merchants / 50), 0, 1);
}

function calculateInstitutionCoverage(state) {
  const institutions = Math.max(0, state.adoption.mono.institutions || 0);

  /*
    This is intentionally conservative. Institutional reserve adoption should
    not explode early.
  */
  return clamp(institutions / 10_000, 0, 1);
}

function calculateUnitOfAccountGate(unitOfAccountAdoption) {
  const uoa = clamp(unitOfAccountAdoption, 0, 100);

  if (uoa < 5) return 0.55;
  if (uoa < 20) return 0.65;
  if (uoa < 40) return 0.78;
  if (uoa < 60) return 0.9;

  return 1;
}

function calculateGlobalM2Share(state) {
  const monoValue = Math.max(0, state.circulation.mono.usdValue || 0);
  const divValue = Math.max(0, state.circulation.div.usdValue || 0);
  const treasuryFiat = Math.max(0, state.treasury.fiat.totalUsdNominal || 0);

  /*
    Approximate global broad-money reference. This is not meant as a live data
    value; it is a game-scale reference for displacement pressure.
  */
  const globalM2ReferenceUsd = 120_000_000_000_000;

  return clamp(
    ((monoValue + divValue + treasuryFiat * 0.25) / globalM2ReferenceUsd) * 100,
    0,
    100
  );
}

function moveSlowly({
  current,
  target,
  simulatedDays,
  riseSpeed,
  fallSpeed
}) {
  const safeCurrent = Number(current || 0);
  const safeTarget = Number(target || 0);
  const gap = safeTarget - safeCurrent;

  if (Math.abs(gap) < 0.001) {
    return clamp(safeTarget, 0, 100);
  }

  const speed = gap > 0 ? riseSpeed : fallSpeed;

  return clamp(
    safeCurrent + gap * clamp(speed * simulatedDays, 0.001, 0.35),
    0,
    100
  );
}

function createWarning({ code, severity, message }) {
  return {
    code,
    severity,
    message,
    createdAt: Date.now()
  };
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  const output = [];

  for (const warning of warnings.slice(-120)) {
    if (seen.has(warning.code)) continue;

    seen.add(warning.code);
    output.push(warning);
  }

  return output;
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
  runFiatDisplacementEngine
};
