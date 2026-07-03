"use strict";

const {
  createTradeJournalEntry,
  createDividendJournalEntry
} = require("../journal");

createTradeJournalEntry({
  state,
  category: "treasury",
  source: "Treasury",
  asset,
  action: "treasury_sold",
  amount: coinsSold,
  usd: executedBuyUsd
});

createTradeJournalEntry({
  state,
  category: "treasury",
  source: "Treasury",
  asset,
  action: "treasury_bought",
  amount: executedSellCoins,
  usd: fiatSpent
});

createDividendJournalEntry({
  state,
  divAmount: distributedDiv,
  monoSupply: state.circulation.mono.supply
});

function runTreasuryExecutionEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const simulatedDays = Number(tickContext.simulatedDays || 1);

  resetExecutionMetrics(state);

  executeAssetTreasuryPolicy({
    state,
    asset: "mono",
    simulatedDays
  });

  executeAssetTreasuryPolicy({
    state,
    asset: "div",
    simulatedDays
  });

  executeDividends({
    state,
    simulatedDays
  });

  updateTreasuryExecutionScores(state);
  addExecutionChartPoints(state);

  return state;
}

function executeAssetTreasuryPolicy({ state, asset, simulatedDays }) {
  const policy = state.policy[asset];
  const treasuryAsset = state.treasury[asset];
  const circulationAsset = state.circulation[asset];
  const marketAsset = state.market[asset];
  const priceAsset = state.prices[asset];

  const marketPrice = Math.max(0.000001, priceAsset.market);
  const desiredBuyUsd = Math.max(0, marketAsset.desiredBuyUsd || 0);
  const desiredSellCoins = Math.max(0, marketAsset.desiredSellCoins || 0);

  const sellPoint = Math.max(0.000001, policy.sellPoint);
  const buyPoint = Math.max(0.000001, policy.buyPoint);

  const marketAboveSellPoint = marketPrice >= sellPoint;
  const marketBelowBuyPoint = marketPrice <= buyPoint;

  let executedTreasurySaleCoins = 0;
  let executedPublicSaleCoins = 0;

  if (marketAboveSellPoint) {
    executedTreasurySaleCoins = executeTreasurySale({
      state,
      asset,
      desiredBuyUsd,
      sellPoint,
      marketPrice,
      listedSupply: policy.listedSupply,
      treasuryBalance: treasuryAsset.balance,
      absorptionCapacityUsd: calculateAbsorptionCapacityUsd({
        state,
        asset,
        simulatedDays
      })
    });
  }

  if (marketBelowBuyPoint || shouldAutoBuyback({ state, asset })) {
    executedPublicSaleCoins = executeTreasuryBuyback({
      state,
      asset,
      desiredSellCoins,
      buyPoint,
      marketPrice,
      buybackBudgetUsd: policy.buybackBudgetUsd,
      treasuryFiatUsd: state.treasury.fiat.liquidSupportUsd,
      supportCapacityUsd: calculateSupportCapacityUsd({
        state,
        asset,
        simulatedDays
      })
    });
  }

  if (asset === "mono") {
    marketAsset.executedBuyUsd = executedTreasurySaleCoins * sellPoint;
    marketAsset.executedSellCoins = executedPublicSaleCoins;
  } else {
    marketAsset.executedBuyUsd = executedTreasurySaleCoins * sellPoint;
    marketAsset.executedSellCoins = executedPublicSaleCoins;
  }

  circulationAsset.usdValue = circulationAsset.supply * marketPrice;
}

function executeTreasurySale({
  state,
  asset,
  desiredBuyUsd,
  sellPoint,
  listedSupply,
  treasuryBalance,
  absorptionCapacityUsd
}) {
  const treasuryAsset = state.treasury[asset];
  const circulationAsset = state.circulation[asset];

  const maxByDemandCoins = desiredBuyUsd / sellPoint;
  const maxByListedSupplyCoins = Math.max(0, listedSupply || 0);
  const maxByTreasuryCoins = Math.max(0, treasuryBalance || 0);
  const maxByAbsorptionCoins = Math.max(0, absorptionCapacityUsd || 0) / sellPoint;

  const executedCoins = Math.max(
    0,
    Math.min(
      maxByDemandCoins,
      maxByListedSupplyCoins,
      maxByTreasuryCoins,
      maxByAbsorptionCoins
    )
  );

  if (executedCoins <= 0) {
    return 0;
  }

  const fiatReceived = executedCoins * sellPoint;

  treasuryAsset.balance -= executedCoins;
  circulationAsset.supply += executedCoins;

  state.treasury.fiat.totalUsdNominal += fiatReceived;
  state.treasury.fiat.totalUsdReal += fiatReceived;
  state.treasury.fiat.liquidSupportUsd += fiatReceived;

  state.history.events.push({
    tick: state.runtime.tick,
    type: "treasury_sale",
    asset,
    executedCoins,
    fiatReceived,
    price: sellPoint,
    createdAt: Date.now()
  });

  return executedCoins;
}

function executeTreasuryBuyback({
  state,
  asset,
  desiredSellCoins,
  buyPoint,
  buybackBudgetUsd,
  treasuryFiatUsd,
  supportCapacityUsd
}) {
  const treasuryAsset = state.treasury[asset];
  const circulationAsset = state.circulation[asset];

  const autoBudgetUsd = calculateAutoBuybackBudgetUsd({
    state,
    asset,
    buyPoint,
    desiredSellCoins,
    supportCapacityUsd
  });

  const totalBudgetUsd = Math.max(0, buybackBudgetUsd || 0) + autoBudgetUsd;

  const maxBySellPressureCoins = Math.max(0, desiredSellCoins || 0);
  const maxByBudgetCoins = totalBudgetUsd / buyPoint;
  const maxByFiatCoins = Math.max(0, treasuryFiatUsd || 0) / buyPoint;
  const maxBySupportCoins = Math.max(0, supportCapacityUsd || 0) / buyPoint;
  const maxByCirculatingCoins = Math.max(0, circulationAsset.supply || 0);

  const executedCoins = Math.max(
    0,
    Math.min(
      maxBySellPressureCoins,
      maxByBudgetCoins,
      maxByFiatCoins,
      maxBySupportCoins,
      maxByCirculatingCoins
    )
  );

  if (executedCoins <= 0) {
    return 0;
  }

  const fiatSpent = executedCoins * buyPoint;

  treasuryAsset.balance += executedCoins;
  circulationAsset.supply -= executedCoins;

  state.treasury.fiat.totalUsdNominal -= fiatSpent;
  state.treasury.fiat.totalUsdReal -= fiatSpent;
  state.treasury.fiat.liquidSupportUsd -= fiatSpent;

  state.history.events.push({
    tick: state.runtime.tick,
    type: "treasury_buyback",
    asset,
    executedCoins,
    fiatSpent,
    price: buyPoint,
    createdAt: Date.now()
  });

  return executedCoins;
}

function executeDividends({ state, simulatedDays }) {
  const policy = state.policy.dividends;

  if (!policy.enabled || !policy.automationEnabled) {
    return;
  }

  const targetAnnualDistribution = Math.max(0, policy.targetAnnualDivDistribution || 0);

  if (targetAnnualDistribution <= 0) {
    return;
  }

  const remainingAnnualTarget = Math.max(
    0,
    targetAnnualDistribution - state.dividends.distributedLast365Days
  );

  if (remainingAnnualTarget <= 0) {
    return;
  }

  const dailyTarget = targetAnnualDistribution / 365;
  const desiredDistribution = dailyTarget * Math.max(1, simulatedDays);

  const maxDistributionPerTick = Math.max(
    0,
    policy.maxDistributionPerTick || desiredDistribution
  );

  const distribution = Math.max(
    0,
    Math.min(
      desiredDistribution,
      maxDistributionPerTick,
      remainingAnnualTarget,
      state.treasury.div.balance
    )
  );

  if (distribution <= 0) {
    return;
  }

  state.treasury.div.balance -= distribution;
  state.circulation.div.supply += distribution;

  state.dividends.distributedLast365Days += distribution;
  state.dividends.lastDistributionTick = state.runtime.tick;

  state.market.mono.publicDemand += distribution * state.prices.div.market * 0.000001;
  state.dividends.expectationScore = clamp(
    state.dividends.expectationScore + 0.15,
    0,
    100
  );

  state.history.events.push({
    tick: state.runtime.tick,
    type: "dividend_distribution",
    asset: "div",
    distributedCoins: distribution,
    createdAt: Date.now()
  });
}

function calculateAbsorptionCapacityUsd({ state, asset, simulatedDays }) {
  const marketAsset = state.market[asset];
  const confidence = state.confidence.systemicTrust / 100;
  const liquidity = marketAsset.liquidity / 100;
  const adoptionQuality = getAssetAdoptionQuality(state, asset) / 100;
  const inventoryHealth = state.treasury[asset].controlScore / 100;
  const regulatoryPenalty = 1 - state.market.regime.regulationPressure;
  const volatilityPenalty = 1 - clamp(marketAsset.volatility * 5, 0, 0.9);

  const baseCapacity = Math.max(10_000, marketAsset.marketDepthUsd || 0);

  return (
    baseCapacity *
    Math.max(0.05, confidence) *
    Math.max(0.05, liquidity) *
    Math.max(0.05, adoptionQuality) *
    Math.max(0.05, inventoryHealth) *
    Math.max(0.05, regulatoryPenalty) *
    Math.max(0.05, volatilityPenalty) *
    Math.max(1, simulatedDays)
  );
}

function calculateSupportCapacityUsd({ state, asset, simulatedDays }) {
  const marketAsset = state.market[asset];
  const confidence = state.confidence.systemicTrust / 100;
  const liquidity = marketAsset.liquidity / 100;
  const fiatTrust = state.confidence.treasuryFiatTrust / 100;
  const supportCapacity = state.treasury.supportCapacityScore / 100;
  const panicPenalty = 1 - state.confidence.panicRisk;
  const volatilityPenalty = 1 - clamp(marketAsset.volatility * 4, 0, 0.85);

  const liquidFiat = Math.max(0, state.treasury.fiat.liquidSupportUsd || 0);
  const maxDeployableShare = asset === "mono" ? 0.04 : 0.025;

  return (
    liquidFiat *
    maxDeployableShare *
    Math.max(0.05, confidence) *
    Math.max(0.05, liquidity) *
    Math.max(0.05, fiatTrust) *
    Math.max(0.05, supportCapacity) *
    Math.max(0.05, panicPenalty) *
    Math.max(0.05, volatilityPenalty) *
    Math.max(1, simulatedDays)
  );
}

function calculateAutoBuybackBudgetUsd({
  state,
  asset,
  buyPoint,
  desiredSellCoins,
  supportCapacityUsd
}) {
  const policy = state.policy[asset];

  if (!policy.autoBuybackEnabled) {
    return 0;
  }

  const marketAsset = state.market[asset];
  const desiredSellUsd = desiredSellCoins * buyPoint;
  const pressure = clamp(marketAsset.supportPressure || 0, 0, 1);
  const trustMultiplier = clamp(state.confidence.systemicTrust / 100, 0.05, 1);

  return Math.min(
    desiredSellUsd,
    supportCapacityUsd,
    desiredSellUsd * pressure * trustMultiplier
  );
}

function shouldAutoBuyback({ state, asset }) {
  const policy = state.policy[asset];

  if (!policy.autoBuybackEnabled) {
    return false;
  }

  const marketAsset = state.market[asset];

  return (
    marketAsset.supportPressure > 0.1 ||
    state.confidence.panicRisk > 0.25 ||
    state.confidence.runRisk > 0.2
  );
}

function updateTreasuryExecutionScores(state) {
  const mono = state.market.mono;
  const div = state.market.div;

  const totalDesiredBuyUsd = mono.desiredBuyUsd + div.desiredBuyUsd;
  const totalExecutedBuyUsd = mono.executedBuyUsd + div.executedBuyUsd;

  const totalDesiredSellCoins = mono.desiredSellCoins + div.desiredSellCoins;
  const totalExecutedSellCoins = mono.executedSellCoins + div.executedSellCoins;

  const absorptionFillRate =
    totalDesiredBuyUsd > 0 ? totalExecutedBuyUsd / totalDesiredBuyUsd : 1;

  const supportFillRate =
    totalDesiredSellCoins > 0 ? totalExecutedSellCoins / totalDesiredSellCoins : 1;

  state.treasury.absorptionCapacityScore = clamp(absorptionFillRate * 100, 0, 100);
  state.treasury.supportCapacityScore = clamp(
    supportFillRate * 100 * (state.treasury.fiat.fiatUsefulnessScore / 100),
    0,
    100
  );

  const inventoryAverage =
    (state.treasury.mono.controlScore + state.treasury.div.controlScore) / 2;

  const executionQuality =
    absorptionFillRate * 35 +
    supportFillRate * 35 +
    (inventoryAverage / 100) * 20 +
    (state.confidence.systemicTrust / 100) * 10;

  state.treasury.executionQuality = clamp(executionQuality, 0, 100);

  mono.unfilledBuyDemandUsd = Math.max(0, mono.desiredBuyUsd - mono.executedBuyUsd);
  div.unfilledBuyDemandUsd = Math.max(0, div.desiredBuyUsd - div.executedBuyUsd);

  mono.unfilledSellPressureCoins = Math.max(0, mono.desiredSellCoins - mono.executedSellCoins);
  div.unfilledSellPressureCoins = Math.max(0, div.desiredSellCoins - div.executedSellCoins);
}

function addExecutionChartPoints(state) {
  const point = {
    tick: state.runtime.tick,
    simulatedDay: state.runtime.simulatedDay,
    createdAt: Date.now()
  };

  state.charts.treasuryFiat.push({
    ...point,
    value: state.treasury.fiat.totalUsdNominal
  });

  state.charts.treasuryMono.push({
    ...point,
    value: state.treasury.mono.balance
  });

  state.charts.treasuryDiv.push({
    ...point,
    value: state.treasury.div.balance
  });
}

function resetExecutionMetrics(state) {
  for (const asset of ["mono", "div"]) {
    state.market[asset].executedBuyUsd = 0;
    state.market[asset].executedSellCoins = 0;
    state.market[asset].unfilledBuyDemandUsd = 0;
    state.market[asset].unfilledSellPressureCoins = 0;
  }
}

function getAssetAdoptionQuality(state, asset) {
  if (asset === "mono") {
    return state.adoption.mono.adoptionQuality;
  }

  return state.adoption.div.adoptionQuality;
}

function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

module.exports = {
  runTreasuryExecutionEngine
};
