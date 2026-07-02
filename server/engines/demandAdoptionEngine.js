"use strict";

function runDemandAdoptionEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const simulatedDays = Math.max(1, Number(tickContext.simulatedDays || 1));

  resetDemandOutputs(state);

  const adoptionParams = getAdoptionParams(state);
  const scenarioEffects = aggregateScenarioDemandEffects(state);

  updateMonoAdoption({
    state,
    simulatedDays,
    adoptionParams,
    scenarioEffects
  });

  updateDivAdoption({
    state,
    simulatedDays,
    adoptionParams,
    scenarioEffects
  });

  updateMonoDemand({
    state,
    simulatedDays,
    scenarioEffects
  });

  updateDivDemand({
    state,
    simulatedDays,
    scenarioEffects
  });

  updateAdoptionQuality(state);
  updateDemandChartEvents(state);

  return state;
}

function resetDemandOutputs(state) {
  state.adoption.flows = {
    awarenessGrowth: 0,
    trialGrowth: 0,
    activeGrowth: 0,
    stickyGrowth: 0,
    merchantGrowth: 0,
    businessGrowth: 0,
    institutionalGrowth: 0,
    churn: 0
  };

  for (const asset of ["mono", "div"]) {
    state.market[asset].desiredBuyUsd = 0;
    state.market[asset].desiredSellCoins = 0;
    state.market[asset].publicDemand = 0;
    state.market[asset].publicSellPressure = 0;
  }
}

function updateMonoAdoption({
  state,
  simulatedDays,
  adoptionParams,
  scenarioEffects
}) {
  const mono = state.adoption.mono;
  const flows = state.adoption.flows;

  const trust = percentToUnit(state.confidence.systemicTrust);
  const monoTrust = percentToUnit(state.confidence.monoStabilityTrust);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const adoptionTrust = percentToUnit(state.confidence.adoptionTrust);
  const regulatoryComfort = 1 - percentToUnit(state.market.regime.regulationPressure * 100);
  const mediaAttention = clamp(state.market.regime.mediaAttention || 0, 0, 1);
  const fiatPressure = percentToUnit(state.fiatDisplacement.index);
  const fiatUsefulnessWeakness = 1 - percentToUnit(state.fiatDisplacement.fiatUsefulnessScore);

  const awarenessRate =
    0.0000015 *
    adoptionParams.awarenessMultiplier *
    (1 + mediaAttention * 6) *
    (1 + scenarioEffects.awarenessImpact) *
    simulatedDays;

  const potentialRemaining = Math.max(0, mono.potentialUsers - mono.awareUsers);

  const awarenessGrowth = Math.min(
    potentialRemaining,
    potentialRemaining * awarenessRate
  );

  mono.awareUsers += awarenessGrowth;
  flows.awarenessGrowth += awarenessGrowth;

  const trialUtility =
    0.2 +
    trust * 0.2 +
    monoTrust * 0.2 +
    liquidityTrust * 0.1 +
    fiatPressure * 0.1 +
    fiatUsefulnessWeakness * 0.1 +
    mediaAttention * 0.1 +
    scenarioEffects.monoDemandImpact * 0.01 -
    state.market.mono.volatility * 2 -
    state.market.regime.regulationPressure * 0.35;

  const trialRate =
    0.00004 *
    adoptionParams.trialMultiplier *
    clamp(trialUtility, 0, 2) *
    simulatedDays;

  const awareNonTrial = Math.max(0, mono.awareUsers - mono.trialUsers);
  const trialGrowth = Math.min(awareNonTrial, awareNonTrial * trialRate);

  mono.trialUsers += trialGrowth;
  flows.trialGrowth += trialGrowth;

  const activeUtility =
    0.15 +
    monoTrust * 0.25 +
    liquidityTrust * 0.2 +
    adoptionTrust * 0.15 +
    regulatoryComfort * 0.1 +
    fiatPressure * 0.1 +
    scenarioEffects.monoDemandImpact * 0.01 -
    state.market.mono.volatility * 2.2;

  const activeRate =
    0.006 *
    adoptionParams.stickyAdoptionMultiplier *
    clamp(activeUtility, 0, 2) *
    simulatedDays;

  const trialNonActive = Math.max(0, mono.trialUsers - mono.activeUsers);
  const activeGrowth = Math.min(trialNonActive, trialNonActive * activeRate);

  mono.activeUsers += activeGrowth;
  flows.activeGrowth += activeGrowth;

  const stickyUtility =
    0.1 +
    monoTrust * 0.3 +
    liquidityTrust * 0.2 +
    adoptionTrust * 0.2 +
    fiatPressure * 0.1 +
    scenarioEffects.stickyAdoptionImpact * 0.01 -
    state.market.mono.volatility * 2.5 -
    state.confidence.panicRisk * 0.5;

  const stickyRate =
    0.002 *
    adoptionParams.stickyAdoptionMultiplier *
    clamp(stickyUtility, 0, 2) *
    simulatedDays;

  const activeNonSticky = Math.max(0, mono.activeUsers - mono.stickyUsers);
  const stickyGrowth = Math.min(activeNonSticky, activeNonSticky * stickyRate);

  mono.stickyUsers += stickyGrowth;
  flows.stickyGrowth += stickyGrowth;

  const merchantUtility =
    calculateMerchantUtility(state, scenarioEffects);

  const merchantGrowth = Math.max(
    0,
    mono.merchants *
      0.002 *
      merchantUtility *
      adoptionParams.stickyAdoptionMultiplier *
      simulatedDays +
      scenarioEffects.merchantAdoptionImpact
  );

  mono.merchants += merchantGrowth;
  flows.merchantGrowth += merchantGrowth;

  const businessUtility =
    calculateBusinessUtility(state, scenarioEffects);

  const businessGrowth = Math.max(
    0,
    mono.businesses *
      0.001 *
      businessUtility *
      adoptionParams.stickyAdoptionMultiplier *
      simulatedDays +
      scenarioEffects.businessAdoptionImpact
  );

  mono.businesses += businessGrowth;
  flows.businessGrowth += businessGrowth;

  const institutionalUtility =
    calculateInstitutionalUtility(state, scenarioEffects);

  const institutionalGrowth = Math.max(
    0,
    mono.institutions *
      0.0008 *
      institutionalUtility *
      simulatedDays +
      scenarioEffects.institutionalAdoptionImpact
  );

  mono.institutions += institutionalGrowth;
  flows.institutionalGrowth += institutionalGrowth;

  const churnPressure =
    state.market.mono.volatility * 1.8 +
    state.confidence.panicRisk * 0.5 +
    state.market.regime.regulationPressure * 0.3 +
    scenarioEffects.churnImpact * 0.01 -
    monoTrust * 0.25 -
    liquidityTrust * 0.15;

  const churnRate = clamp(
    mono.churnRate + churnPressure * 0.01,
    0.001,
    0.25
  );

  const churn = Math.min(
    mono.activeUsers,
    mono.activeUsers * churnRate * simulatedDays
  );

  mono.activeUsers -= churn;
  mono.stickyUsers = Math.max(
    0,
    mono.stickyUsers - churn * 0.15
  );

  flows.churn += churn;

  updateMonoAdoptionLayers(state);
}

function updateDivAdoption({
  state,
  simulatedDays,
  adoptionParams,
  scenarioEffects
}) {
  const div = state.adoption.div;

  const systemicTrust = percentToUnit(state.confidence.systemicTrust);
  const dividendTrust = percentToUnit(state.confidence.divDividendTrust);
  const dividendExpectation = percentToUnit(state.dividends.expectationScore);
  const speculativeMood = clamp(state.market.regime.cryptoSentiment || 0.5, 0, 1);
  const mediaAttention = clamp(state.market.regime.mediaAttention || 0, 0, 1);
  const volatilityPenalty = clamp(state.market.div.volatility * 1.5, 0, 1);
  const overheatingPenalty = percentToUnit(state.prices.div.overheatingScore);
  const scenarioDemand = scenarioEffects.divDemandImpact * 0.01;

  const awarenessGrowth =
    Math.max(
      0,
      state.adoption.mono.awareUsers * 0.0005 * adoptionParams.awarenessMultiplier
    ) *
    (1 + mediaAttention * 2 + scenarioEffects.awarenessImpact) *
    simulatedDays;

  div.awareUsers += awarenessGrowth;

  const holderUtility =
    0.15 +
    systemicTrust * 0.15 +
    dividendTrust * 0.2 +
    dividendExpectation * 0.25 +
    speculativeMood * 0.2 +
    mediaAttention * 0.1 +
    scenarioDemand -
    volatilityPenalty * 0.2 -
    overheatingPenalty * 0.25 -
    state.market.regime.regulationPressure * 0.25;

  const holderGrowth = Math.max(
    0,
    (div.awareUsers - div.holders) *
      0.00005 *
      adoptionParams.trialMultiplier *
      clamp(holderUtility, 0, 2) *
      simulatedDays
  );

  div.holders += holderGrowth;

  const stickyHolderUtility =
    0.1 +
    dividendTrust * 0.3 +
    systemicTrust * 0.2 +
    dividendExpectation * 0.15 -
    overheatingPenalty * 0.25 -
    volatilityPenalty * 0.25;

  const stickyHolderGrowth = Math.max(
    0,
    (div.holders - div.stickyHolders) *
      0.002 *
      adoptionParams.stickyAdoptionMultiplier *
      clamp(stickyHolderUtility, 0, 2) *
      simulatedDays
  );

  div.stickyHolders += stickyHolderGrowth;

  const dividendSeekerGrowth = Math.max(
    0,
    div.holders *
      0.0015 *
      dividendExpectation *
      dividendTrust *
      simulatedDays
  );

  div.dividendSeekers += dividendSeekerGrowth;

  const speculativeGrowth = Math.max(
    0,
    div.awareUsers *
      0.00003 *
      adoptionParams.speculationMultiplier *
      (speculativeMood + mediaAttention + scenarioDemand) *
      simulatedDays
  );

  div.speculators += speculativeGrowth;

  const institutionalUtility =
    dividendTrust * 0.35 +
    systemicTrust * 0.25 +
    percentToUnit(state.confidence.regulatorySurvivalTrust) * 0.2 +
    percentToUnit(state.confidence.liquidityTrust) * 0.2 -
    overheatingPenalty * 0.3 -
    volatilityPenalty * 0.2;

  const institutionalGrowth = Math.max(
    0,
    div.institutions *
      0.0005 *
      clamp(institutionalUtility, 0, 2) *
      simulatedDays +
      scenarioEffects.institutionalAdoptionImpact * 0.35
  );

  div.institutions += institutionalGrowth;

  const churnPressure =
    state.market.div.volatility * 2 +
    overheatingPenalty * 0.4 +
    state.confidence.panicRisk * 0.5 +
    state.market.regime.regulationPressure * 0.25 +
    scenarioEffects.churnImpact * 0.01 -
    dividendTrust * 0.2;

  const churnRate = clamp(
    div.churnRate + churnPressure * 0.015,
    0.002,
    0.4
  );

  const holderChurn = Math.min(
    div.holders,
    div.holders * churnRate * simulatedDays
  );

  div.holders -= holderChurn;
  div.stickyHolders = Math.max(0, div.stickyHolders - holderChurn * 0.1);
  div.dividendSeekers = Math.max(0, div.dividendSeekers - holderChurn * 0.2);
  div.speculators = Math.max(0, div.speculators - holderChurn * 0.6);

  const totalActiveDivParticipants =
    div.stickyHolders + div.dividendSeekers + div.speculators + div.institutions;

  div.speculativeDemandShare =
    totalActiveDivParticipants > 0
      ? clamp(div.speculators / totalActiveDivParticipants, 0, 1)
      : 0.6;
}

function updateMonoDemand({
  state,
  simulatedDays,
  scenarioEffects
}) {
  const mono = state.adoption.mono;
  const market = state.market.mono;

  const price = Math.max(0.000001, state.prices.mono.market);
  const trust = percentToUnit(state.confidence.monoStabilityTrust);
  const systemicTrust = percentToUnit(state.confidence.systemicTrust);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const fiatWeakness = 1 - percentToUnit(state.fiatDisplacement.fiatUsefulnessScore);
  const fiatDisplacement = percentToUnit(state.fiatDisplacement.index);
  const dividendExpectation = percentToUnit(state.dividends.expectationScore);
  const scenarioDemandMultiplier = 1 + scenarioEffects.monoDemandImpact * 0.01;

  const transactionalDemandUsd =
    mono.activeUsers * 18 +
    mono.stickyUsers * 35 +
    mono.merchants * 300 +
    mono.businesses * 4_000;

  const savingsDemandUsd =
    (mono.stickyUsers * 55 + mono.businesses * 8_000 + mono.institutions * 250_000) *
    (0.25 + trust * 0.35 + fiatWeakness * 0.25 + fiatDisplacement * 0.15);

  const dividendLinkedDemandUsd =
    (mono.activeUsers * 4 + mono.stickyUsers * 12) *
    dividendExpectation *
    systemicTrust;

  const institutionalReserveDemandUsd =
    mono.institutions *
    500_000 *
    trust *
    liquidityTrust *
    percentToUnit(state.confidence.regulatorySurvivalTrust);

  const grossDemandUsd =
    (transactionalDemandUsd +
      savingsDemandUsd +
      dividendLinkedDemandUsd +
      institutionalReserveDemandUsd) *
    scenarioDemandMultiplier *
    simulatedDays;

  const volatilityPenalty = clamp(state.market.mono.volatility * 2.5, 0, 0.8);
  const regulationPenalty = clamp(state.market.regime.regulationPressure * 0.35, 0, 0.7);
  const executionPenalty = 1 - percentToUnit(state.treasury.executionQuality);

  const executableDemandUsd =
    grossDemandUsd *
    Math.max(0.05, systemicTrust) *
    Math.max(0.05, liquidityTrust) *
    (1 - volatilityPenalty) *
    (1 - regulationPenalty) *
    (1 - executionPenalty * 0.3);

  const sellPressureBase =
    state.circulation.mono.supply *
    (
      0.0005 +
      state.market.mono.volatility * 0.003 +
      state.confidence.panicRisk * 0.01 +
      state.confidence.runRisk * 0.02 +
      state.market.regime.regulationPressure * 0.002 +
      scenarioEffects.monoSellPressureImpact * 0.0001
    ) *
    simulatedDays;

  const trustRetention = trust * 0.55 + systemicTrust * 0.3 + liquidityTrust * 0.15;
  const desiredSellCoins =
    sellPressureBase *
    (1 - clamp(trustRetention * 0.65, 0, 0.65));

  market.desiredBuyUsd = Math.max(0, executableDemandUsd);
  market.desiredSellCoins = Math.max(0, desiredSellCoins);
  market.publicDemand = normaliseDemandScore(market.desiredBuyUsd, market.marketDepthUsd);
  market.publicSellPressure = normaliseSellPressureScore(
    market.desiredSellCoins * price,
    market.marketDepthUsd
  );
}

function updateDivDemand({
  state,
  simulatedDays,
  scenarioEffects
}) {
  const div = state.adoption.div;
  const market = state.market.div;

  const price = Math.max(0.000001, state.prices.div.market);
  const systemicTrust = percentToUnit(state.confidence.systemicTrust);
  const dividendTrust = percentToUnit(state.confidence.divDividendTrust);
  const dividendExpectation = percentToUnit(state.dividends.expectationScore);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const cryptoSentiment = clamp(state.market.regime.cryptoSentiment || 0.5, 0, 1);
  const mediaAttention = clamp(state.market.regime.mediaAttention || 0, 0, 1);
  const fiatDisplacement = percentToUnit(state.fiatDisplacement.index);
  const overheating = percentToUnit(state.prices.div.overheatingScore);

  const scenarioDemandMultiplier = 1 + scenarioEffects.divDemandImpact * 0.01;

  const dividendDemandUsd =
    div.dividendSeekers *
    35 *
    dividendExpectation *
    dividendTrust;

  const growthParticipationDemandUsd =
    (div.stickyHolders * 25 + div.institutions * 450_000) *
    (0.2 + fiatDisplacement * 0.4 + systemicTrust * 0.25);

  const speculativeDemandUsd =
    div.speculators *
    50 *
    (0.2 + cryptoSentiment * 0.4 + mediaAttention * 0.25 + state.prices.div.momentum * 0.15);

  const institutionalDemandUsd =
    div.institutions *
    350_000 *
    dividendTrust *
    liquidityTrust *
    percentToUnit(state.confidence.regulatorySurvivalTrust);

  const grossDemandUsd =
    (dividendDemandUsd +
      growthParticipationDemandUsd +
      speculativeDemandUsd +
      institutionalDemandUsd) *
    scenarioDemandMultiplier *
    simulatedDays;

  const volatilityPenalty = clamp(state.market.div.volatility * 1.5, 0, 0.85);
  const overheatingPenalty = overheating * 0.55;
  const regulationPenalty = clamp(state.market.regime.regulationPressure * 0.4, 0, 0.75);

  const executableDemandUsd =
    grossDemandUsd *
    Math.max(0.04, systemicTrust) *
    Math.max(0.04, liquidityTrust) *
    (1 - volatilityPenalty) *
    (1 - overheatingPenalty) *
    (1 - regulationPenalty);

  const speculativeExitPressure =
    div.speculators *
    (
      0.002 +
      state.market.div.volatility * 0.008 +
      overheating * 0.012 +
      state.confidence.panicRisk * 0.015 +
      scenarioEffects.divSellPressureImpact * 0.00015
    );

  const normalSellPressure =
    state.circulation.div.supply *
    (
      0.0008 +
      state.market.div.volatility * 0.004 +
      state.confidence.runRisk * 0.012 +
      state.market.regime.regulationPressure * 0.003
    );

  const desiredSellCoins =
    (speculativeExitPressure + normalSellPressure) *
    simulatedDays *
    (1 - clamp(dividendTrust * 0.25 + systemicTrust * 0.2, 0, 0.45));

  market.desiredBuyUsd = Math.max(0, executableDemandUsd);
  market.desiredSellCoins = Math.max(0, desiredSellCoins);
  market.publicDemand = normaliseDemandScore(market.desiredBuyUsd, market.marketDepthUsd);
  market.publicSellPressure = normaliseSellPressureScore(
    market.desiredSellCoins * price,
    market.marketDepthUsd
  );
}

function updateMonoAdoptionLayers(state) {
  const mono = state.adoption.mono;

  const potentialUsers = Math.max(1, mono.potentialUsers);
  const activeUsers = Math.max(0, mono.activeUsers);
  const stickyUsers = Math.max(0, mono.stickyUsers);

  const merchantCoverage = clamp(mono.merchants / 1_000_000, 0, 1);
  const businessCoverage = clamp(mono.businesses / 100_000, 0, 1);
  const institutionalCoverage = clamp(mono.institutions / 10_000, 0, 1);

  mono.paymentAdoption = clamp(
    (activeUsers / potentialUsers) * 100 * 0.35 +
      merchantCoverage * 100 * 0.45 +
      businessCoverage * 100 * 0.2,
    0,
    100
  );

  mono.savingsAdoption = clamp(
    (stickyUsers / potentialUsers) * 100 * 0.5 +
      businessCoverage * 100 * 0.25 +
      institutionalCoverage * 100 * 0.25,
    0,
    100
  );

  mono.settlementAdoption = clamp(
    businessCoverage * 100 * 0.65 +
      institutionalCoverage * 100 * 0.35,
    0,
    100
  );

  mono.reserveAdoption = clamp(
    institutionalCoverage * 100 * 0.6 +
      mono.savingsAdoption * 0.4,
    0,
    100
  );

  const stabilityGate = percentToUnit(state.confidence.monoStabilityTrust);
  const merchantGate = percentToUnit(mono.paymentAdoption);
  const settlementGate = percentToUnit(mono.settlementAdoption);

  mono.unitOfAccountAdoption = clamp(
    mono.unitOfAccountAdoption +
      (
        stabilityGate *
        merchantGate *
        settlementGate *
        0.015
      ),
    0,
    100
  );
}

function updateAdoptionQuality(state) {
  const mono = state.adoption.mono;
  const div = state.adoption.div;

  const monoStickyShare =
    mono.activeUsers > 0
      ? mono.stickyUsers / Math.max(1, mono.activeUsers)
      : 0;

  const monoMerchantSupport = clamp(mono.merchants / Math.max(1, mono.activeUsers / 100), 0, 1);
  const monoBusinessSupport = clamp(mono.businesses / Math.max(1, mono.merchants / 50), 0, 1);
  const monoStabilityTrust = percentToUnit(state.confidence.monoStabilityTrust);
  const monoChurnPenalty = clamp(mono.churnRate * 5, 0, 1);

  mono.adoptionQuality = clamp(
    monoStickyShare * 30 +
      monoMerchantSupport * 20 +
      monoBusinessSupport * 15 +
      monoStabilityTrust * 25 +
      percentToUnit(state.confidence.liquidityTrust) * 10 -
      monoChurnPenalty * 20,
    0,
    100
  );

  const divStickyShare =
    div.holders > 0
      ? div.stickyHolders / Math.max(1, div.holders)
      : 0;

  const speculativePenalty = clamp(div.speculativeDemandShare || 0, 0, 1);
  const dividendTrust = percentToUnit(state.confidence.divDividendTrust);
  const overheatingPenalty = percentToUnit(state.prices.div.overheatingScore);

  div.adoptionQuality = clamp(
    divStickyShare * 30 +
      dividendTrust * 25 +
      percentToUnit(state.confidence.systemicTrust) * 15 +
      percentToUnit(state.confidence.liquidityTrust) * 10 +
      (1 - speculativePenalty) * 15 -
      overheatingPenalty * 25,
    0,
    100
  );
}

function calculateMerchantUtility(state, scenarioEffects) {
  const userDemand = percentToUnit(state.adoption.mono.paymentAdoption);
  const stability = percentToUnit(state.confidence.monoStabilityTrust);
  const liquidity = percentToUnit(state.confidence.liquidityTrust);
  const regulatoryComfort = 1 - percentToUnit(state.market.regime.regulationPressure * 100);
  const frictionPenalty = clamp(state.market.mono.volatility * 2, 0, 1);

  return clamp(
    userDemand * 0.25 +
      stability * 0.25 +
      liquidity * 0.2 +
      regulatoryComfort * 0.15 +
      scenarioEffects.merchantAdoptionImpact * 0.01 -
      frictionPenalty * 0.25,
    0,
    2
  );
}

function calculateBusinessUtility(state, scenarioEffects) {
  const paymentAdoption = percentToUnit(state.adoption.mono.paymentAdoption);
  const settlementAdoption = percentToUnit(state.adoption.mono.settlementAdoption);
  const trust = percentToUnit(state.confidence.systemicTrust);
  const liquidity = percentToUnit(state.confidence.liquidityTrust);
  const regulatorySurvival = percentToUnit(state.confidence.regulatorySurvivalTrust);

  return clamp(
    paymentAdoption * 0.2 +
      settlementAdoption * 0.2 +
      trust * 0.25 +
      liquidity * 0.2 +
      regulatorySurvival * 0.15 +
      scenarioEffects.businessAdoptionImpact * 0.01 -
      state.market.mono.volatility * 1.5,
    0,
    2
  );
}

function calculateInstitutionalUtility(state, scenarioEffects) {
  const trust = percentToUnit(state.confidence.systemicTrust);
  const monoTrust = percentToUnit(state.confidence.monoStabilityTrust);
  const liquidity = percentToUnit(state.confidence.liquidityTrust);
  const regulatorySurvival = percentToUnit(state.confidence.regulatorySurvivalTrust);
  const reserveAdoption = percentToUnit(state.adoption.mono.reserveAdoption);

  return clamp(
    trust * 0.25 +
      monoTrust * 0.25 +
      liquidity * 0.2 +
      regulatorySurvival * 0.2 +
      reserveAdoption * 0.1 +
      scenarioEffects.institutionalAdoptionImpact * 0.01 -
      state.market.mono.volatility * 1.8,
    0,
    2
  );
}

function aggregateScenarioDemandEffects(state) {
  const output = {
    monoDemandImpact: 0,
    divDemandImpact: 0,
    monoSellPressureImpact: 0,
    divSellPressureImpact: 0,
    awarenessImpact: 0,
    stickyAdoptionImpact: 0,
    merchantAdoptionImpact: 0,
    businessAdoptionImpact: 0,
    institutionalAdoptionImpact: 0,
    churnImpact: 0
  };

  for (const scenario of state.scenarios.active || []) {
    const effects = scenario.effects || {};

    output.monoDemandImpact += Number(effects.monoDemandImpact || 0);
    output.divDemandImpact += Number(effects.divDemandImpact || 0);
    output.monoSellPressureImpact += Number(effects.monoSellPressureImpact || 0);
    output.divSellPressureImpact += Number(effects.divSellPressureImpact || 0);
    output.awarenessImpact += Number(effects.awarenessImpact || 0);
    output.stickyAdoptionImpact += Number(effects.stickyAdoptionImpact || 0);
    output.merchantAdoptionImpact += Number(effects.merchantAdoptionImpact || 0);
    output.businessAdoptionImpact += Number(effects.businessAdoptionImpact || 0);
    output.institutionalAdoptionImpact += Number(effects.institutionalAdoptionImpact || 0);
    output.churnImpact += Number(effects.churnImpact || 0);
    output.churnImpact += Number(effects.adoptionQualityImpact || 0) < 0
      ? Math.abs(Number(effects.adoptionQualityImpact || 0))
      : 0;
  }

  return output;
}

function getAdoptionParams(state) {
  const mode = state.defaults.adoptionMode || "normal";
  const params = state.defaults.adoptionModes[mode];

  return params || state.defaults.adoptionModes.normal;
}

function normaliseDemandScore(demandUsd, marketDepthUsd) {
  return clamp((demandUsd / Math.max(1, marketDepthUsd)) * 100, 0, 100);
}

function normaliseSellPressureScore(sellUsd, marketDepthUsd) {
  return clamp((sellUsd / Math.max(1, marketDepthUsd)) * 100, 0, 100);
}

function updateDemandChartEvents(state) {
  state.history.events.push({
    tick: state.runtime.tick,
    type: "demand_update",
    monoDesiredBuyUsd: state.market.mono.desiredBuyUsd,
    monoDesiredSellCoins: state.market.mono.desiredSellCoins,
    divDesiredBuyUsd: state.market.div.desiredBuyUsd,
    divDesiredSellCoins: state.market.div.desiredSellCoins,
    monoAdoptionQuality: state.adoption.mono.adoptionQuality,
    divAdoptionQuality: state.adoption.div.adoptionQuality,
    createdAt: Date.now()
  });
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
  runDemandAdoptionEngine
};
