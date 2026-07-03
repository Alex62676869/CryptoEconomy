"use strict";

const {
  createTradeJournalEntry
} = require("../journal");

createTradeJournalEntry({
  state,
  category: "peer",
  source: "Peer",
  asset,
  action: "peer_sold",
  amount: peerCoins,
  usd: peerUsd
});

function runPriceMarketEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const simulatedDays = Number(tickContext.simulatedDays || 1);

  updateAssetPrice({
    state,
    asset: "mono",
    simulatedDays
  });

  updateAssetPrice({
    state,
    asset: "div",
    simulatedDays
  });

  updateDivTopPointPressure(state);
  addPriceChartPoints(state);

  return state;
}

function updateAssetPrice({ state, asset, simulatedDays }) {
  const priceState = state.prices[asset];
  const marketState = state.market[asset];

  const previousPrice = Math.max(0.000001, Number(priceState.market || 1));
  const fundamental = calculateFundamentalPrice({ state, asset });

  priceState.previousMarket = previousPrice;
  priceState.fundamental = fundamental;

  const scenarioImpact = getScenarioPriceImpact({ state, asset });
  const difficultyParams = getDifficultyParams(state);

  const fundamentalPull = calculateFundamentalPull({
    price: previousPrice,
    fundamental,
    asset
  });

  const orderFlowPressure = calculateOrderFlowPressure({
    state,
    asset,
    price: previousPrice
  });

  const momentumPressure = calculateMomentumPressure({
    state,
    asset
  });

  const volatilityShock = calculateVolatilityShock({
    volatility: marketState.volatility,
    difficultyMultiplier: difficultyParams.volatilityMultiplier
  });

  const scenarioShock = scenarioImpact.priceShock;

  const rawReturn =
    fundamentalPull +
    orderFlowPressure +
    momentumPressure +
    scenarioShock +
    volatilityShock;

  const maxReturn = asset === "mono" ? 0.08 : 0.18;
  const boundedReturn = clamp(rawReturn, -maxReturn, maxReturn);

  const nextPrice = Math.max(
    0.000001,
    previousPrice * Math.exp(boundedReturn)
  );

  priceState.market = nextPrice;
  priceState.returnThisTick = boundedReturn;
  priceState.momentum = updateMomentum({
    previousMomentum: priceState.momentum,
    latestReturn: boundedReturn
  });

  updateMarketMicrostructure({
    state,
    asset,
    price: nextPrice,
    returnThisTick: boundedReturn,
    scenarioImpact,
    simulatedDays,
    difficultyParams
  });
}

function calculateFundamentalPrice({ state, asset }) {
  if (asset === "mono") {
    return calculateMonoFundamental(state);
  }

  return calculateDivFundamental(state);
}

function calculateMonoFundamental(state) {
  const policyMidpoint = Math.max(0.000001, state.prices.mono.policyMidpoint || 1);

  const paymentAdoption = percentToUnit(state.adoption.mono.paymentAdoption);
  const savingsAdoption = percentToUnit(state.adoption.mono.savingsAdoption);
  const unitOfAccountAdoption = percentToUnit(state.adoption.mono.unitOfAccountAdoption);
  const fiatDisplacement = percentToUnit(state.fiatDisplacement.index);
  const stabilityTrust = percentToUnit(state.confidence.monoStabilityTrust);
  const treasuryTrust = percentToUnit(state.confidence.treasuryInventoryTrust);
  const fiatTrust = percentToUnit(state.confidence.treasuryFiatTrust);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const dividendExpectation = percentToUnit(state.dividends.expectationScore);

  const volatilityPenalty = clamp(state.market.mono.volatility * 3, 0, 0.5);
  const regulationPenalty = clamp(state.market.regime.regulationPressure * 0.3, 0, 0.4);
  const reservePenalty = 1 - percentToUnit(state.treasury.mono.controlScore);

  const premium =
    paymentAdoption * 0.12 +
    savingsAdoption * 0.12 +
    unitOfAccountAdoption * 0.18 +
    fiatDisplacement * 0.18 +
    stabilityTrust * 0.08 +
    treasuryTrust * 0.06 +
    fiatTrust * 0.04 +
    liquidityTrust * 0.04 +
    dividendExpectation * 0.04;

  const penalty =
    volatilityPenalty +
    regulationPenalty +
    reservePenalty * 0.25;

  return Math.max(
    0.000001,
    policyMidpoint * (1 + premium - penalty)
  );
}

function calculateDivFundamental(state) {
  const policyMidpoint = Math.max(0.000001, state.prices.div.policyMidpoint || 1);

  const dividendExpectation = percentToUnit(state.dividends.expectationScore);
  const dividendTrust = percentToUnit(state.confidence.divDividendTrust);
  const adoptionGrowth = calculateAdoptionGrowthSignal(state);
  const fiatDisplacement = percentToUnit(state.fiatDisplacement.index);
  const treasuryTrust = percentToUnit(state.confidence.treasuryInventoryTrust);
  const scarcityValue = calculateDivScarcityValue(state);
  const speculativeShare = clamp(state.adoption.div.speculativeDemandShare || 0, 0, 1);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);

  const volatilityPenalty = clamp(state.market.div.volatility * 2.5, 0, 0.7);
  const overheatingPenalty = percentToUnit(state.prices.div.overheatingScore) * 0.45;
  const inventoryPenalty = 1 - percentToUnit(state.treasury.div.controlScore);
  const regulationPenalty = clamp(state.market.regime.regulationPressure * 0.35, 0, 0.5);

  const premium =
    dividendExpectation * 0.24 +
    dividendTrust * 0.12 +
    adoptionGrowth * 0.2 +
    fiatDisplacement * 0.18 +
    treasuryTrust * 0.06 +
    scarcityValue * 0.1 +
    speculativeShare * 0.08 +
    liquidityTrust * 0.04;

  const penalty =
    volatilityPenalty +
    overheatingPenalty +
    inventoryPenalty * 0.3 +
    regulationPenalty;

  return Math.max(
    0.000001,
    policyMidpoint * (1 + premium - penalty)
  );
}

function calculateFundamentalPull({ price, fundamental, asset }) {
  const speed = asset === "mono" ? 0.025 : 0.04;

  const logGap = Math.log(Math.max(0.000001, fundamental) / Math.max(0.000001, price));

  return clamp(logGap * speed, -0.04, 0.04);
}

function calculateOrderFlowPressure({ state, asset, price }) {
  const marketState = state.market[asset];

  const unfilledBuyUsd = Math.max(
    0,
    (marketState.desiredBuyUsd || 0) - (marketState.executedBuyUsd || 0)
  );

  const unfilledSellCoins = Math.max(
    0,
    (marketState.desiredSellCoins || 0) - (marketState.executedSellCoins || 0)
  );

  const unfilledSellUsd = unfilledSellCoins * price;

  const executedBuyUsd = Math.max(0, marketState.executedBuyUsd || 0);
  const executedSellUsd = Math.max(0, marketState.executedSellCoins || 0) * price;

  /*
    Unfilled order flow moves price strongly.
    Successfully executed treasury flow still matters, but less strongly,
    because the treasury absorbed some pressure.
  */
  const netPressureUsd =
    unfilledBuyUsd -
    unfilledSellUsd +
    (executedBuyUsd - executedSellUsd) * 0.25;

  const marketDepth = Math.max(1, marketState.marketDepthUsd || 1);

  marketState.orderFlowImbalance = netPressureUsd;

  const impactCoefficient = asset === "mono" ? 0.035 : 0.075;

  return clamp(
    impactCoefficient * (netPressureUsd / marketDepth),
    asset === "mono" ? -0.05 : -0.12,
    asset === "mono" ? 0.05 : 0.12
  );
}

function calculateMomentumPressure({ state, asset }) {
  const momentum = Number(state.prices[asset].momentum || 0);
  const speculativeWeight =
    asset === "div"
      ? 0.04 + clamp(state.adoption.div.speculativeDemandShare || 0, 0, 1) * 0.04
      : 0.015;

  return clamp(momentum * speculativeWeight, -0.04, 0.06);
}

function calculateVolatilityShock({ volatility, difficultyMultiplier }) {
  const sigma = Math.max(0, Number(volatility || 0)) * Math.max(0, difficultyMultiplier || 1);

  /*
    Uses a bounded pseudo-normal shock by summing uniforms.
    This avoids extreme nonsense moves while still allowing noise.
  */
  const pseudoNormal =
    Math.random() +
    Math.random() +
    Math.random() +
    Math.random() -
    2;

  return clamp(pseudoNormal * sigma * 0.18, -0.08, 0.08);
}

function updateMomentum({ previousMomentum, latestReturn }) {
  return clamp(
    Number(previousMomentum || 0) * 0.88 + Number(latestReturn || 0) * 0.12,
    -1,
    1
  );
}

function updateMarketMicrostructure({
  state,
  asset,
  price,
  returnThisTick,
  scenarioImpact,
  simulatedDays,
  difficultyParams
}) {
  const marketState = state.market[asset];

  const absoluteReturn = Math.abs(returnThisTick);
  const confidence = percentToUnit(state.confidence.systemicTrust);
  const liquidityTrust = percentToUnit(state.confidence.liquidityTrust);
  const inventoryControl = percentToUnit(state.treasury[asset].controlScore);
  const volatilityMultiplier = difficultyParams.volatilityMultiplier || 1;

  const baseVolatility = asset === "mono" ? 0.012 : 0.028;

  const volatilityFromReturn = absoluteReturn * 0.45;
  const volatilityFromScenario = Math.abs(scenarioImpact.volatilityShock || 0) * 0.25;
  const volatilityFromLowLiquidity = (1 - liquidityTrust) * 0.025;
  const volatilityFromLowConfidence = (1 - confidence) * 0.03;
  const volatilityFromInventoryDanger = (1 - inventoryControl) * 0.035;

  const targetVolatility =
    baseVolatility +
    volatilityFromReturn +
    volatilityFromScenario +
    volatilityFromLowLiquidity +
    volatilityFromLowConfidence +
    volatilityFromInventoryDanger;

  marketState.volatility = clamp(
    marketState.volatility * 0.88 +
      targetVolatility * 0.12 * volatilityMultiplier,
    asset === "mono" ? 0.002 : 0.005,
    asset === "mono" ? 0.25 : 0.6
  );

  const liquidityChange =
    confidence * 1.2 +
    liquidityTrust * 1.1 +
    inventoryControl * 1.1 -
    marketState.volatility * 80 -
    Math.abs(marketState.orderFlowImbalance || 0) / Math.max(1, marketState.marketDepthUsd) * 12 +
    (scenarioImpact.liquidityShock || 0) * 10;

  marketState.liquidity = clamp(
    marketState.liquidity + liquidityChange * 0.025 * Math.max(1, simulatedDays),
    1,
    100
  );

  const circulationUsd =
    asset === "mono"
      ? state.circulation.mono.supply * price
      : state.circulation.div.supply * price;

  const treasuryListedSupplyUsd = Math.max(0, state.policy[asset].listedSupply || 0) * price;
  const treasuryDepthSupport = treasuryListedSupplyUsd * (inventoryControl * 0.25);
  const liquidityDepth = Math.max(10_000, circulationUsd * 0.08 * (marketState.liquidity / 100));

  marketState.marketDepthUsd = Math.max(
    10_000,
    liquidityDepth + treasuryDepthSupport + state.treasury.fiat.liquidSupportUsd * 0.01
  );

  marketState.supportPressure = calculateSupportPressure({
    state,
    asset,
    price
  });

  marketState.arbitragePressure = calculateArbitragePressure({
    state,
    asset,
    price
  });
}

function calculateSupportPressure({ state, asset, price }) {
  const policy = state.policy[asset];
  const buyPoint = Math.max(0.000001, policy.buyPoint);

  if (price >= buyPoint) {
    return clamp((buyPoint / price - 0.98) * 5, 0, 1);
  }

  return clamp((buyPoint - price) / buyPoint, 0, 1);
}

function calculateArbitragePressure({ state, asset, price }) {
  const policy = state.policy[asset];

  const buyPoint = Math.max(0.000001, policy.buyPoint);
  const sellPoint = Math.max(0.000001, policy.sellPoint);
  const spread = Math.max(0, sellPoint - buyPoint);
  const midpoint = (buyPoint + sellPoint) / 2;

  const spreadRatio = midpoint > 0 ? spread / midpoint : 1;
  const volatility = state.market[asset].volatility;
  const confidencePenalty = 1 - percentToUnit(state.confidence.policyConsistencyTrust);

  const tooTightSpreadPressure = spreadRatio < volatility * 1.5
    ? 1 - spreadRatio / Math.max(0.000001, volatility * 1.5)
    : 0;

  const mispricingPressure =
    price < buyPoint
      ? clamp((buyPoint - price) / buyPoint, 0, 1)
      : price > sellPoint
        ? clamp((price - sellPoint) / sellPoint, 0, 1)
        : 0;

  return clamp(
    tooTightSpreadPressure * 0.45 +
      mispricingPressure * 0.4 +
      confidencePenalty * 0.15,
    0,
    1
  );
}

function updateDivTopPointPressure(state) {
  const divPrice = Math.max(0.000001, state.prices.div.market);
  const topPoint = Math.max(0.000001, state.policy.div.topPoint);

  const rawPressure = divPrice <= topPoint
    ? 0
    : (divPrice - topPoint) / topPoint;

  const adoptionGrowth = calculateAdoptionGrowthSignal(state);
  const speculativeShare = clamp(state.adoption.div.speculativeDemandShare || 0, 0, 1);
  const divInventoryDanger = 1 - percentToUnit(state.treasury.div.controlScore);
  const dividendExpectation = percentToUnit(state.dividends.expectationScore);

  const overheatingScore = clamp(
    rawPressure * 55 +
      speculativeShare * 20 +
      divInventoryDanger * 20 +
      dividendExpectation * 5 -
      adoptionGrowth * 10,
    0,
    100
  );

  state.prices.div.topPointPressure = clamp(rawPressure, 0, 10);
  state.market.div.topPointPressure = state.prices.div.topPointPressure;
  state.prices.div.overheatingScore = overheatingScore;
}

function calculateAdoptionGrowthSignal(state) {
  const mono = state.adoption.mono;
  const flows = state.adoption.flows;

  const activeGrowthRate =
    mono.activeUsers > 0
      ? flows.activeGrowth / Math.max(1, mono.activeUsers)
      : 0;

  const merchantGrowthRate =
    mono.merchants > 0
      ? flows.merchantGrowth / Math.max(1, mono.merchants)
      : 0;

  const businessGrowthRate =
    mono.businesses > 0
      ? flows.businessGrowth / Math.max(1, mono.businesses)
      : 0;

  return clamp(
    activeGrowthRate * 0.35 +
      merchantGrowthRate * 0.35 +
      businessGrowthRate * 0.3,
    0,
    1
  );
}

function calculateDivScarcityValue(state) {
  const divBalance = Math.max(0, state.treasury.div.balance || 0);
  const totalDiv =
    divBalance + Math.max(0, state.circulation.div.supply || 0);

  if (totalDiv <= 0) return 0;

  const treasuryShare = divBalance / totalDiv;

  /*
    Moderate scarcity can be positive.
    Extreme treasury depletion becomes a credibility problem and is handled
    separately as an inventory penalty.
  */
  if (treasuryShare > 0.7) return 0.05;
  if (treasuryShare > 0.5) return 0.1;
  if (treasuryShare > 0.3) return 0.18;
  if (treasuryShare > 0.1) return 0.08;

  return 0;
}

function getScenarioPriceImpact({ state, asset }) {
  const output = {
    priceShock: 0,
    volatilityShock: 0,
    liquidityShock: 0
  };

  for (const scenario of state.scenarios.active || []) {
    const effects = scenario.effects || {};
    const assetEffects = effects[asset] || {};

    output.priceShock += Number(assetEffects.priceShock || 0);
    output.volatilityShock += Number(assetEffects.volatilityShock || 0);
    output.liquidityShock += Number(assetEffects.liquidityShock || 0);

    if (asset === "mono") {
      output.priceShock += Number(effects.monoDemandImpact || 0) * 0.001;
      output.priceShock -= Number(effects.monoSellPressureImpact || 0) * 0.001;
    }

    if (asset === "div") {
      output.priceShock += Number(effects.divDemandImpact || 0) * 0.001;
      output.priceShock -= Number(effects.divSellPressureImpact || 0) * 0.001;
    }

    output.volatilityShock += Number(effects.volatilityImpact || 0) * 0.001;
    output.liquidityShock += Number(effects.liquidityImpact || 0) * 0.001;
  }

  return {
    priceShock: clamp(output.priceShock, -0.08, 0.08),
    volatilityShock: clamp(output.volatilityShock, -0.08, 0.12),
    liquidityShock: clamp(output.liquidityShock, -0.1, 0.1)
  };
}

function getDifficultyParams(state) {
  const difficulty = state.defaults.difficulty || "normal";
  const params = state.defaults.difficultyParams[difficulty];

  return params || state.defaults.difficultyParams.normal;
}

function addPriceChartPoints(state) {
  const point = {
    tick: state.runtime.tick,
    simulatedDay: state.runtime.simulatedDay,
    createdAt: Date.now()
  };

  state.charts.monoPrice.push({
    ...point,
    value: state.prices.mono.market
  });

  state.charts.divPrice.push({
    ...point,
    value: state.prices.div.market
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
  runPriceMarketEngine
};
