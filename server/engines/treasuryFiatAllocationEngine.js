"use strict";

function runTreasuryFiatAllocationEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const simulatedDays = Math.max(1, Number(tickContext.simulatedDays || 1));

  const scenarioEffects = aggregateScenarioFiatEffects(state);

  updateCurrencyAccountMetrics({
    state,
    scenarioEffects
  });

  reconcileTreasuryFiatWithCurrencyAccounts({
    state,
    scenarioEffects
  });

  applyCurrencyReturns({
    state,
    simulatedDays,
    scenarioEffects
  });

  rebalanceCurrencyBasket({
    state,
    simulatedDays,
    scenarioEffects
  });

  updateTreasuryFiatAggregates({
    state,
    scenarioEffects
  });

  updateFiatUsefulnessScore({
    state,
    scenarioEffects
  });

  updateReserveWarnings(state);

  return state;
}

function updateCurrencyAccountMetrics({ state, scenarioEffects }) {
  const accounts = Object.values(state.fiatCurrencies || {});
  const totalUsd = sumUsd(accounts);

  for (const account of accounts) {
    const usd = Math.max(0, account.usdEquivalent || 0);
    const weight = totalUsd > 0 ? usd / totalUsd : 0;

    const capacity = calculateCurrencyCapacityUsd(account);
    const saturation = capacity.softCapacityUsd > 0
      ? usd / capacity.softCapacityUsd
      : 0;

    const stressAdjustedFxDecay =
      Number(account.expectedFxDecay || 0) +
      scenarioEffects.fxDecayImpact +
      scenarioEffects.currencyRiskImpact * 0.002 +
      calculateCapitalControlFxPenalty(account);

    const liquidityHaircut =
      (1 - percentToUnit(account.liquidityScore)) * 0.015 +
      percentToUnit(account.capitalControlPenalty) * 0.025 +
      clamp(saturation - 1, 0, 5) * 0.01;

    account.expectedFxDecay = clamp(stressAdjustedFxDecay, -0.05, 0.35);

    account.effectiveUsdReturn =
      Number(account.nominalYield || 0) -
      account.expectedFxDecay -
      liquidityHaircut;

    account.realReturn =
      Number(account.nominalYield || 0) -
      Number(account.inflation || 0) -
      account.expectedFxDecay -
      liquidityHaircut;

    account.saturationLevel = clamp(saturation * 100, 0, 500);

    account.localM2Share = capacity.estimatedM2Usd > 0
      ? clamp((usd / capacity.estimatedM2Usd) * 100, 0, 100)
      : 0;

    account.portfolioWeight = weight;

    account.marginalAllocationScore = calculateMarginalAllocationScore({
      account,
      state,
      scenarioEffects,
      portfolioWeight: weight
    });

    account.riskWarning = calculateCurrencyRiskWarning(account);
  }
}

function reconcileTreasuryFiatWithCurrencyAccounts({ state, scenarioEffects }) {
  const accounts = Object.values(state.fiatCurrencies || {});
  const accountTotalUsd = sumUsd(accounts);
  const treasuryTotalUsd = Math.max(0, state.treasury.fiat.totalUsdNominal || 0);

  const delta = treasuryTotalUsd - accountTotalUsd;

  if (Math.abs(delta) < 0.01) {
    return;
  }

  if (delta > 0) {
    allocateNewFiatUsd({
      state,
      amountUsd: delta,
      scenarioEffects
    });
  } else {
    withdrawFiatUsd({
      state,
      amountUsd: Math.abs(delta)
    });
  }
}

function allocateNewFiatUsd({ state, amountUsd, scenarioEffects }) {
  const accounts = Object.values(state.fiatCurrencies || {});
  const amount = Math.max(0, Number(amountUsd || 0));

  if (amount <= 0 || accounts.length === 0) {
    return;
  }

  const scoredAccounts = accounts
    .map((account) => ({
      account,
      score: Math.max(
        0.01,
        calculateMarginalAllocationScore({
          account,
          state,
          scenarioEffects,
          portfolioWeight: account.portfolioWeight || 0
        })
      )
    }))
    .sort((a, b) => b.score - a.score);

  const topAccounts = scoredAccounts.slice(0, Math.min(8, scoredAccounts.length));
  const scoreTotal = topAccounts.reduce((sum, item) => sum + item.score, 0);

  if (scoreTotal <= 0) {
    const usd = getAccount(state, "USD");
    usd.usdEquivalent += amount;
    usd.localBalance += amount;
    return;
  }

  for (const item of topAccounts) {
    const share = item.score / scoreTotal;
    const allocationUsd = amount * share;

    item.account.usdEquivalent += allocationUsd;
    item.account.localBalance += convertUsdToLocal({
      account: item.account,
      usdAmount: allocationUsd
    });
  }
}

function withdrawFiatUsd({ state, amountUsd }) {
  const accounts = Object.values(state.fiatCurrencies || {});
  let remaining = Math.max(0, Number(amountUsd || 0));

  if (remaining <= 0 || accounts.length === 0) {
    return;
  }

  /*
    Withdrawals should come from the most liquid and safest accounts first.
    This mirrors the treasury using support liquidity during buybacks.
  */
  const withdrawalOrder = accounts
    .filter((account) => account.usdEquivalent > 0)
    .map((account) => ({
      account,
      score:
        percentToUnit(account.liquidityScore) * 0.45 +
        percentToUnit(account.trustScore) * 0.3 +
        (1 - percentToUnit(account.capitalControlPenalty)) * 0.15 +
        (account.code === "USD" ? 0.1 : 0)
    }))
    .sort((a, b) => b.score - a.score);

  for (const item of withdrawalOrder) {
    if (remaining <= 0) break;

    const available = Math.max(0, item.account.usdEquivalent || 0);
    const withdrawal = Math.min(available, remaining);

    item.account.usdEquivalent -= withdrawal;
    item.account.localBalance = Math.max(
      0,
      item.account.localBalance -
        convertUsdToLocal({
          account: item.account,
          usdAmount: withdrawal
        })
    );

    remaining -= withdrawal;
  }
}

function applyCurrencyReturns({ state, simulatedDays, scenarioEffects }) {
  const accounts = Object.values(state.fiatCurrencies || {});
  const yearFraction = simulatedDays / 365;

  for (const account of accounts) {
    const usd = Math.max(0, account.usdEquivalent || 0);

    if (usd <= 0) {
      continue;
    }

    const nominalYield = Number(account.nominalYield || 0);
    const effectiveUsdReturn = Number(account.effectiveUsdReturn || 0);
    const realReturn = Number(account.realReturn || 0);

    const nominalLocalGrowth = clamp(nominalYield * yearFraction, -0.5, 0.5);
    const usdGrowth = clamp(effectiveUsdReturn * yearFraction, -0.5, 0.5);
    const realGrowth = clamp(realReturn * yearFraction, -0.5, 0.5);

    account.localBalance = Math.max(
      0,
      account.localBalance * (1 + nominalLocalGrowth)
    );

    account.usdEquivalent = Math.max(
      0,
      account.usdEquivalent * (1 + usdGrowth)
    );

    account.realUsdEquivalent = Math.max(
      0,
      (account.realUsdEquivalent || usd) * (1 + realGrowth + scenarioEffects.realFiatImpact * 0.0001)
    );
  }
}

function rebalanceCurrencyBasket({ state, simulatedDays, scenarioEffects }) {
  const mode = state.policy.treasury.allocationMode || state.treasury.fiat.allocationMode || "balanced";

  if (mode === "manual") {
    return;
  }

  const accounts = Object.values(state.fiatCurrencies || {});
  const totalUsd = sumUsd(accounts);

  if (totalUsd <= 0) {
    return;
  }

  const targetWeights = calculateTargetCurrencyWeights({
    state,
    mode,
    scenarioEffects
  });

  const rebalanceRate = getRebalanceRate(mode) * Math.min(simulatedDays, 30);

  if (rebalanceRate <= 0) {
    return;
  }

  const desiredMovements = [];

  for (const account of accounts) {
    const currentUsd = Math.max(0, account.usdEquivalent || 0);
    const targetWeight = targetWeights[account.code] || 0;
    const targetUsd = totalUsd * targetWeight;
    const gapUsd = targetUsd - currentUsd;

    desiredMovements.push({
      account,
      gapUsd
    });
  }

  const sources = desiredMovements
    .filter((item) => item.gapUsd < -1)
    .sort((a, b) => a.gapUsd - b.gapUsd);

  const destinations = desiredMovements
    .filter((item) => item.gapUsd > 1)
    .sort((a, b) => b.gapUsd - a.gapUsd);

  let movableUsd = totalUsd * rebalanceRate;

  for (const source of sources) {
    if (movableUsd <= 0) break;

    const sourceAvailableUsd = Math.min(
      Math.abs(source.gapUsd),
      source.account.usdEquivalent,
      movableUsd
    );

    if (sourceAvailableUsd <= 0) continue;

    let remainingFromSource = sourceAvailableUsd;

    for (const destination of destinations) {
      if (remainingFromSource <= 0) break;
      if (destination.gapUsd <= 0) continue;

      const moveUsd = Math.min(
        remainingFromSource,
        destination.gapUsd
      );

      source.account.usdEquivalent -= moveUsd;
      source.account.localBalance = Math.max(
        0,
        source.account.localBalance -
          convertUsdToLocal({
            account: source.account,
            usdAmount: moveUsd
          })
      );

      destination.account.usdEquivalent += moveUsd;
      destination.account.localBalance += convertUsdToLocal({
        account: destination.account,
        usdAmount: moveUsd
      });

      destination.gapUsd -= moveUsd;
      remainingFromSource -= moveUsd;
      movableUsd -= moveUsd;
    }
  }
}

function calculateTargetCurrencyWeights({ state, mode, scenarioEffects }) {
  const accounts = Object.values(state.fiatCurrencies || {});
  const scores = {};
  let scoreTotal = 0;

  for (const account of accounts) {
    const currentWeight = account.portfolioWeight || 0;

    let score = calculateMarginalAllocationScore({
      account,
      state,
      scenarioEffects,
      portfolioWeight: currentWeight
    });

    if (mode === "safety_first") {
      score += percentToUnit(account.trustScore) * 30;
      score += percentToUnit(account.liquidityScore) * 20;
      score -= percentToUnit(account.capitalControlPenalty) * 30;
    }

    if (mode === "yield_seeking") {
      score += clamp(account.effectiveUsdReturn * 400, -30, 30);
      score += clamp(account.realReturn * 300, -25, 25);
    }

    if (mode === "liquidity_first") {
      score += percentToUnit(account.liquidityScore) * 35;
      score += account.code === "USD" ? 20 : 0;
    }

    score = Math.max(0.01, score);

    scores[account.code] = score;
    scoreTotal += score;
  }

  const targetWeights = {};

  if (scoreTotal <= 0) {
    const equalWeight = accounts.length > 0 ? 1 / accounts.length : 0;

    for (const account of accounts) {
      targetWeights[account.code] = equalWeight;
    }

    return targetWeights;
  }

  for (const account of accounts) {
    targetWeights[account.code] = scores[account.code] / scoreTotal;
  }

  return enforceTargetWeightCaps({
    targetWeights,
    accounts,
    mode
  });
}

function enforceTargetWeightCaps({ targetWeights, accounts, mode }) {
  const capped = {};
  let excess = 0;
  let uncappedWeightTotal = 0;

  for (const account of accounts) {
    const cap = getCurrencyWeightCap(account, mode);
    const rawWeight = targetWeights[account.code] || 0;

    if (rawWeight > cap) {
      capped[account.code] = cap;
      excess += rawWeight - cap;
    } else {
      capped[account.code] = rawWeight;
      uncappedWeightTotal += rawWeight;
    }
  }

  if (excess <= 0 || uncappedWeightTotal <= 0) {
    return normaliseWeights(capped);
  }

  for (const account of accounts) {
    const cap = getCurrencyWeightCap(account, mode);

    if (capped[account.code] >= cap) {
      continue;
    }

    const additional = excess * ((capped[account.code] || 0) / uncappedWeightTotal);
    capped[account.code] = Math.min(cap, capped[account.code] + additional);
  }

  return normaliseWeights(capped);
}

function updateTreasuryFiatAggregates({ state }) {
  const accounts = Object.values(state.fiatCurrencies || {});

  let nominalUsd = 0;
  let realUsd = 0;
  let liquidSupportUsd = 0;
  let weightedNominalYield = 0;
  let weightedUsdReturn = 0;
  let weightedRealReturn = 0;
  let globalM2ShareWeighted = 0;

  for (const account of accounts) {
    const usd = Math.max(0, account.usdEquivalent || 0);
    const real = Math.max(0, account.realUsdEquivalent || usd);
    const weightBase = usd;

    nominalUsd += usd;
    realUsd += real;

    const liquidShare = calculateLiquidShare(account);
    liquidSupportUsd += usd * liquidShare;

    weightedNominalYield += weightBase * Number(account.nominalYield || 0);
    weightedUsdReturn += weightBase * Number(account.effectiveUsdReturn || 0);
    weightedRealReturn += weightBase * Number(account.realReturn || 0);
    globalM2ShareWeighted += weightBase * Number(account.localM2Share || 0);
  }

  const denominator = Math.max(1, nominalUsd);

  state.treasury.fiat.totalUsdNominal = nominalUsd;
  state.treasury.fiat.totalUsdReal = realUsd;
  state.treasury.fiat.liquidSupportUsd = Math.min(nominalUsd, liquidSupportUsd);

  state.treasury.fiat.blendedNominalYield = weightedNominalYield / denominator;
  state.treasury.fiat.blendedUsdAdjustedReturn = weightedUsdReturn / denominator;
  state.treasury.fiat.blendedRealReturn = weightedRealReturn / denominator;
  state.treasury.fiat.globalM2Share = globalM2ShareWeighted / denominator;

  state.treasury.fiat.allocationMode =
    state.policy.treasury.allocationMode ||
    state.treasury.fiat.allocationMode ||
    "balanced";

  state.treasury.fiat.marginalNextDollarDestination =
    findBestMarginalCurrency(state);

  state.treasury.fiat.mostSaturatedCurrency =
    findMaxBy(accounts, (account) => account.saturationLevel || 0)?.code || null;

  state.treasury.fiat.largestFxRisk =
    findMaxBy(accounts, (account) => account.expectedFxDecay || 0)?.code || null;

  state.treasury.fiat.strongestLiquidityReserve =
    findMaxBy(
      accounts,
      (account) => (account.usdEquivalent || 0) * percentToUnit(account.liquidityScore)
    )?.code || null;
}

function updateFiatUsefulnessScore({ state, scenarioEffects }) {
  const fiat = state.treasury.fiat;

  const realRatio =
    fiat.totalUsdNominal > 0
      ? clamp(fiat.totalUsdReal / fiat.totalUsdNominal, 0, 1.1)
      : 0;

  const liquidRatio =
    fiat.totalUsdNominal > 0
      ? clamp(fiat.liquidSupportUsd / fiat.totalUsdNominal, 0, 1)
      : 0;

  const blendedRealReturn = clamp((fiat.blendedRealReturn || 0) / 0.05, -1, 1);
  const blendedUsdReturn = clamp((fiat.blendedUsdAdjustedReturn || 0) / 0.06, -1, 1);
  const currencyQuality = calculateCurrencyBasketQuality(state);
  const saturationPenalty = clamp((fiat.globalM2Share || 0) * 0.35, 0, 35);
  const displacementPenalty = clamp(state.fiatDisplacement.index * 0.35, 0, 35);
  const bankingFrictionPenalty = clamp(state.fiatDisplacement.bankingFrictionLevel * 0.2, 0, 20);
  const scenarioPenalty = Math.max(0, -scenarioEffects.fiatUsefulnessImpact);

  const score = clamp(
    35 +
      realRatio * 18 +
      liquidRatio * 16 +
      currencyQuality * 18 +
      Math.max(0, blendedRealReturn) * 7 +
      Math.max(0, blendedUsdReturn) * 6 -
      saturationPenalty -
      displacementPenalty -
      bankingFrictionPenalty +
      scenarioEffects.fiatUsefulnessImpact -
      scenarioPenalty,
    0,
    100
  );

  fiat.fiatUsefulnessScore = score;

  /*
    The fiat displacement engine also stores a fiat usefulness score.
    Keep the high-level score in sync here. The displacement engine may later
    apply additional social/adoption effects to the same value.
  */
  state.fiatDisplacement.fiatUsefulnessScore = score;
}

function updateReserveWarnings(state) {
  const warnings = [];

  const fiat = state.treasury.fiat;

  if (fiat.totalUsdNominal <= 0) {
    warnings.push(createWarning({
      code: "fiat_reserves_empty",
      severity: "critical",
      message: "Treasury fiat reserves are empty."
    }));
  }

  if (fiat.liquidSupportUsd < fiat.totalUsdNominal * 0.1) {
    warnings.push(createWarning({
      code: "low_liquid_support",
      severity: "high",
      message: "Less than 10% of fiat reserves are immediately useful for support."
    }));
  }

  if (fiat.blendedRealReturn < -0.03) {
    warnings.push(createWarning({
      code: "negative_real_fiat_return",
      severity: "medium",
      message: "The fiat basket is losing real purchasing power quickly."
    }));
  }

  if (fiat.fiatUsefulnessScore < 40) {
    warnings.push(createWarning({
      code: "fiat_usefulness_weak",
      severity: "high",
      message: "Fiat reserves are becoming less useful as a support asset."
    }));
  }

  for (const account of Object.values(state.fiatCurrencies || {})) {
    if ((account.saturationLevel || 0) > 150 && (account.usdEquivalent || 0) > 0) {
      warnings.push(createWarning({
        code: `currency_saturation_${account.code}`,
        severity: "medium",
        message: `${account.code} reserve exposure is becoming saturated.`
      }));
    }

    if ((account.capitalControlPenalty || 0) > 30 && (account.usdEquivalent || 0) > 0) {
      warnings.push(createWarning({
        code: `capital_control_risk_${account.code}`,
        severity: "medium",
        message: `${account.code} reserves carry meaningful capital-control risk.`
      }));
    }
  }

  if (warnings.length > 0) {
    state.warnings = dedupeWarnings([
      ...(state.warnings || []),
      ...warnings
    ]);
  }
}

function calculateMarginalAllocationScore({
  account,
  state,
  scenarioEffects,
  portfolioWeight
}) {
  const trust = percentToUnit(account.trustScore);
  const liquidity = percentToUnit(account.liquidityScore);
  const bankingDepth = percentToUnit(account.bankingDepthScore);
  const gdpDepth = percentToUnit(account.gdpDepthScore);
  const capitalControlSafety = 1 - percentToUnit(account.capitalControlPenalty);
  const saturationPenalty = clamp((account.saturationLevel || 0) / 100, 0, 5);
  const concentrationPenalty = clamp(portfolioWeight * 2.5, 0, 1.5);

  const effectiveReturnScore = clamp(Number(account.effectiveUsdReturn || 0) / 0.08, -1, 1);
  const realReturnScore = clamp(Number(account.realReturn || 0) / 0.06, -1, 1);

  const supportNeedBonus =
    state.confidence.runRisk > 0.2 || state.confidence.panicRisk > 0.2
      ? liquidity * 15 + trust * 10
      : 0;

  const score =
    trust * 28 +
    liquidity * 20 +
    bankingDepth * 15 +
    gdpDepth * 12 +
    capitalControlSafety * 10 +
    Math.max(0, effectiveReturnScore) * 8 +
    Math.max(0, realReturnScore) * 7 +
    supportNeedBonus -
    saturationPenalty * 22 -
    concentrationPenalty * 12 +
    scenarioEffects.allocationScoreImpact;

  return clamp(score, 0, 100);
}

function calculateCurrencyCapacityUsd(account) {
  const depth = percentToUnit(account.gdpDepthScore);
  const bankingDepth = percentToUnit(account.bankingDepthScore);
  const trust = percentToUnit(account.trustScore);
  const liquidity = percentToUnit(account.liquidityScore);

  const scale =
    depth * 0.35 +
    bankingDepth * 0.35 +
    trust * 0.2 +
    liquidity * 0.1;

  const tierMultiplier = getCurrencyTierMultiplier(account.code);

  const softCapacityUsd = Math.max(
    5_000_000_000,
    20_000_000_000_000 * scale * tierMultiplier
  );

  const hardCapacityUsd = softCapacityUsd * 3;

  const estimatedM2Usd = Math.max(
    50_000_000_000,
    60_000_000_000_000 * depth * tierMultiplier
  );

  return {
    softCapacityUsd,
    hardCapacityUsd,
    estimatedM2Usd
  };
}

function getCurrencyTierMultiplier(code) {
  const tierOne = new Set(["USD", "EUR", "CHF", "GBP", "JPY", "CAD", "AUD", "SGD"]);
  const tierTwo = new Set(["NOK", "SEK", "DKK", "NZD", "KRW", "PLN", "CZK", "ILS"]);
  const restrictedLarge = new Set(["CNY", "AED", "SAR", "HKD"]);

  if (code === "USD") return 2.5;
  if (tierOne.has(code)) return 1.25;
  if (tierTwo.has(code)) return 0.65;
  if (restrictedLarge.has(code)) return 0.45;

  return 0.35;
}

function getCurrencyWeightCap(account, mode) {
  if (account.code === "USD") {
    if (mode === "liquidity_first") return 0.45;
    if (mode === "safety_first") return 0.4;
    return 0.35;
  }

  if (["EUR", "JPY", "GBP", "CHF", "CAD", "AUD", "SGD"].includes(account.code)) {
    return mode === "safety_first" ? 0.22 : 0.18;
  }

  if ((account.capitalControlPenalty || 0) > 25) {
    return 0.04;
  }

  if ((account.trustScore || 0) < 55) {
    return 0.035;
  }

  return mode === "yield_seeking" ? 0.08 : 0.06;
}

function getRebalanceRate(mode) {
  switch (mode) {
    case "safety_first":
      return 0.012;
    case "yield_seeking":
      return 0.01;
    case "liquidity_first":
      return 0.015;
    case "balanced":
    default:
      return 0.008;
  }
}

function calculateLiquidShare(account) {
  const liquidity = percentToUnit(account.liquidityScore);
  const trust = percentToUnit(account.trustScore);
  const capitalControlPenalty = percentToUnit(account.capitalControlPenalty);
  const saturationPenalty = clamp((account.saturationLevel || 0) / 250, 0, 0.6);

  const share =
    liquidity * 0.55 +
    trust * 0.25 +
    (account.code === "USD" ? 0.15 : 0.05) -
    capitalControlPenalty * 0.35 -
    saturationPenalty;

  return clamp(share, 0.05, 0.95);
}

function calculateCurrencyBasketQuality(state) {
  const accounts = Object.values(state.fiatCurrencies || {});
  const totalUsd = sumUsd(accounts);

  if (totalUsd <= 0) {
    return 0;
  }

  let quality = 0;
  let concentration = 0;

  for (const account of accounts) {
    const weight = Math.max(0, account.usdEquivalent || 0) / totalUsd;

    const accountQuality =
      percentToUnit(account.trustScore) * 0.35 +
      percentToUnit(account.liquidityScore) * 0.25 +
      percentToUnit(account.bankingDepthScore) * 0.2 +
      percentToUnit(account.gdpDepthScore) * 0.1 +
      (1 - percentToUnit(account.capitalControlPenalty)) * 0.1;

    quality += weight * accountQuality;
    concentration += weight * weight;
  }

  const diversificationBonus = clamp(1 - concentration, 0, 1) * 0.15;

  return clamp(quality + diversificationBonus, 0, 1);
}

function calculateCapitalControlFxPenalty(account) {
  return percentToUnit(account.capitalControlPenalty) * 0.01;
}

function calculateCurrencyRiskWarning(account) {
  if ((account.capitalControlPenalty || 0) >= 40) {
    return "High capital-control risk";
  }

  if ((account.saturationLevel || 0) >= 150) {
    return "Saturated reserve exposure";
  }

  if ((account.expectedFxDecay || 0) >= 0.08) {
    return "High expected FX decay";
  }

  if ((account.realReturn || 0) <= -0.04) {
    return "Negative real USD-adjusted return";
  }

  if ((account.liquidityScore || 0) <= 45) {
    return "Weak support liquidity";
  }

  return null;
}

function aggregateScenarioFiatEffects(state) {
  const output = {
    fiatUsefulnessImpact: 0,
    allocationScoreImpact: 0,
    fxDecayImpact: 0,
    currencyRiskImpact: 0,
    realFiatImpact: 0
  };

  for (const scenario of state.scenarios.active || []) {
    const effects = scenario.effects || {};

    output.fiatUsefulnessImpact += Number(effects.fiatUsefulnessImpact || 0);
    output.allocationScoreImpact += Number(effects.allocationScoreImpact || 0);
    output.fxDecayImpact += Number(effects.fxDecayImpact || 0);
    output.currencyRiskImpact += Number(effects.currencyRiskImpact || 0);
    output.realFiatImpact += Number(effects.realFiatImpact || 0);

    if (effects.bankingStressImpact) {
      output.fiatUsefulnessImpact -= Number(effects.bankingStressImpact || 0) * 0.25;
      output.currencyRiskImpact += Number(effects.bankingStressImpact || 0) * 0.15;
    }

    if (effects.regulatoryPressureImpact) {
      output.fiatUsefulnessImpact -= Number(effects.regulatoryPressureImpact || 0) * 0.2;
      output.currencyRiskImpact += Number(effects.regulatoryPressureImpact || 0) * 0.1;
    }
  }

  return output;
}

function findBestMarginalCurrency(state) {
  const accounts = Object.values(state.fiatCurrencies || {});

  if (accounts.length === 0) {
    return null;
  }

  const best = findMaxBy(accounts, (account) => account.marginalAllocationScore || 0);

  return best
    ? {
        code: best.code,
        region: best.region,
        score: best.marginalAllocationScore
      }
    : null;
}

function convertUsdToLocal({ account, usdAmount }) {
  /*
    v1 does not yet model live FX rates.
    Local balance is therefore a display/control proxy equal to USD-equivalent
    units. Later, currencyModel.json can add actual FX rates.
  */
  return Math.max(0, Number(usdAmount || 0));
}

function getAccount(state, code) {
  if (!state.fiatCurrencies[code]) {
    state.fiatCurrencies[code] = {
      code,
      region: code,
      localBalance: 0,
      usdEquivalent: 0,
      realUsdEquivalent: 0,
      nominalYield: 0.02,
      inflation: 0.02,
      expectedFxDecay: 0,
      effectiveUsdReturn: 0.02,
      realReturn: 0,
      trustScore: 60,
      bankingDepthScore: 50,
      gdpDepthScore: 50,
      liquidityScore: 60,
      capitalControlPenalty: 0,
      saturationLevel: 0,
      localM2Share: 0,
      riskWarning: null
    };
  }

  return state.fiatCurrencies[code];
}

function sumUsd(accounts) {
  return accounts.reduce(
    (sum, account) => sum + Math.max(0, Number(account.usdEquivalent || 0)),
    0
  );
}

function normaliseWeights(weights) {
  const total = Object.values(weights).reduce(
    (sum, value) => sum + Math.max(0, Number(value || 0)),
    0
  );

  if (total <= 0) {
    return weights;
  }

  const output = {};

  for (const [key, value] of Object.entries(weights)) {
    output[key] = Math.max(0, Number(value || 0)) / total;
  }

  return output;
}

function findMaxBy(items, selector) {
  let best = null;
  let bestValue = -Infinity;

  for (const item of items) {
    const value = selector(item);

    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }

  return best;
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
  runTreasuryFiatAllocationEngine
};
