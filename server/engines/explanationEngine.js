"use strict";

const MAX_LATEST_EXPLANATIONS = 14;
const MAX_HISTORY_EXPLANATIONS = 500;

function runExplanationEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const currentTick = state.runtime.tick;

  ensureExplanationState(state);

  const carriedExplanations = collectCurrentTickCarriedExplanations({
    state,
    currentTick
  });

  const generatedExplanations = [];

  addPriceExplanations({
    state,
    explanations: generatedExplanations
  });

  addTreasuryExecutionExplanations({
    state,
    explanations: generatedExplanations
  });

  addTrustExplanations({
    state,
    explanations: generatedExplanations
  });

  addAdoptionExplanations({
    state,
    explanations: generatedExplanations
  });

  addScenarioExplanations({
    state,
    explanations: generatedExplanations
  });

  addFiatDisplacementExplanations({
    state,
    explanations: generatedExplanations
  });

  addWarningExplanations({
    state,
    explanations: generatedExplanations
  });

  const latest = dedupeExplanations([
    ...carriedExplanations,
    ...generatedExplanations
  ])
    .map((explanation) => normalizeExplanation({
      explanation,
      state,
      tickContext
    }))
    .slice(0, MAX_LATEST_EXPLANATIONS);

  state.explanations.latest = latest;

  if (latest.length > 0) {
    state.explanations.history.push(
      ...latest.map((explanation) => ({
        ...explanation,
        archivedAt: Date.now()
      }))
    );
  }

  state.explanations.history = state.explanations.history.slice(
    -MAX_HISTORY_EXPLANATIONS
  );

  return state;
}

function addPriceExplanations({ state, explanations }) {
  addSinglePriceExplanation({
    state,
    asset: "mono",
    label: "Mono",
    threshold: 0.0015,
    explanations
  });

  addSinglePriceExplanation({
    state,
    asset: "div",
    label: "DIV",
    threshold: 0.0035,
    explanations
  });
}

function addSinglePriceExplanation({
  state,
  asset,
  label,
  threshold,
  explanations
}) {
  const priceState = state.prices[asset];
  const marketState = state.market[asset];

  const previousPrice = Math.max(0.000001, priceState.previousMarket || priceState.market || 1);
  const currentPrice = Math.max(0.000001, priceState.market || 1);
  const change = (currentPrice - previousPrice) / previousPrice;

  if (Math.abs(change) < threshold) {
    return;
  }

  const direction = change > 0 ? "rose" : "fell";
  const severity = getPriceMoveSeverity({
    asset,
    absoluteChange: Math.abs(change)
  });

  const reasons = buildPriceMoveReasons({
    state,
    asset,
    currentPrice,
    change
  });

  explanations.push({
    type: "price",
    asset,
    severity,
    message: `${label} ${direction} ${formatPercent(Math.abs(change))} to ${formatUsd(currentPrice)} because ${joinReasons(reasons)}.`,
    data: {
      previousPrice,
      currentPrice,
      change,
      returnThisTick: priceState.returnThisTick,
      desiredBuyUsd: marketState.desiredBuyUsd,
      desiredSellCoins: marketState.desiredSellCoins,
      executedBuyUsd: marketState.executedBuyUsd,
      executedSellCoins: marketState.executedSellCoins
    }
  });
}

function buildPriceMoveReasons({
  state,
  asset,
  currentPrice,
  change
}) {
  const marketState = state.market[asset];
  const priceState = state.prices[asset];

  const reasons = [];

  const sellPressureUsd =
    Math.max(0, marketState.desiredSellCoins || 0) *
    Math.max(0.000001, currentPrice);

  const buyDemandUsd = Math.max(0, marketState.desiredBuyUsd || 0);
  const unfilledBuyUsd = Math.max(0, marketState.unfilledBuyDemandUsd || 0);
  const unfilledSellUsd =
    Math.max(0, marketState.unfilledSellPressureCoins || 0) *
    Math.max(0.000001, currentPrice);

  if (buyDemandUsd > sellPressureUsd * 1.25 && change > 0) {
    reasons.push("public buy demand was stronger than sell pressure");
  }

  if (sellPressureUsd > buyDemandUsd * 1.25 && change < 0) {
    reasons.push("sell pressure was stronger than public buy demand");
  }

  if (unfilledBuyUsd > marketState.marketDepthUsd * 0.05 && change > 0) {
    reasons.push("unfilled buy demand pushed the market upward");
  }

  if (unfilledSellUsd > marketState.marketDepthUsd * 0.05 && change < 0) {
    reasons.push("unfilled sell pressure pushed the market downward");
  }

  const fundamentalGap =
    (Math.max(0.000001, priceState.fundamental || 1) - currentPrice) /
    currentPrice;

  if (fundamentalGap > 0.03 && change > 0) {
    reasons.push("server-calculated fair value was above the market price");
  }

  if (fundamentalGap < -0.03 && change < 0) {
    reasons.push("server-calculated fair value was below the market price");
  }

  if (marketState.executedBuyUsd > 0 && change > 0) {
    reasons.push("treasury sales confirmed demand at the sell point");
  }

  if (marketState.executedSellCoins > 0 && change < 0) {
    reasons.push("treasury buybacks absorbed some selling but did not remove all pressure");
  }

  if (marketState.liquidity < 40) {
    reasons.push("liquidity was thin");
  }

  if (marketState.volatility > (asset === "mono" ? 0.06 : 0.12)) {
    reasons.push("volatility was elevated");
  }

  if (asset === "mono" && state.confidence.monoStabilityTrust < 50) {
    reasons.push("Mono stability trust was weak");
  }

  if (asset === "div" && state.confidence.divDividendTrust < 50) {
    reasons.push("DIV dividend trust was weak");
  }

  if (asset === "div" && state.prices.div.overheatingScore > 60) {
    reasons.push("DIV overheating made the price fragile");
  }

  const scenarioReason = getScenarioReasonForAsset({
    state,
    asset,
    direction: change > 0 ? "up" : "down"
  });

  if (scenarioReason) {
    reasons.push(scenarioReason);
  }

  if (reasons.length === 0) {
    reasons.push("market microstructure, liquidity, and volatility moved the price");
  }

  return reasons;
}

function addTreasuryExecutionExplanations({ state, explanations }) {
  addSingleTreasuryExecutionExplanation({
    state,
    asset: "mono",
    label: "Mono",
    explanations
  });

  addSingleTreasuryExecutionExplanation({
    state,
    asset: "div",
    label: "DIV",
    explanations
  });

  if (state.treasury.executionQuality < 45) {
    explanations.push({
      type: "treasury",
      severity: "high",
      message: `Treasury execution quality is weak at ${formatScore(state.treasury.executionQuality)} because demand or sell pressure is exceeding realistic execution capacity.`
    });
  }

  if (state.treasury.controlScore < 45) {
    explanations.push({
      type: "treasury",
      severity: "high",
      message: `Treasury control is fragile at ${formatScore(state.treasury.controlScore)} because fiat usefulness, execution capacity, or coin inventory is weakening.`
    });
  }
}

function addSingleTreasuryExecutionExplanation({
  state,
  asset,
  label,
  explanations
}) {
  const marketState = state.market[asset];

  if (marketState.executedBuyUsd > 0) {
    const coinsSold =
      marketState.executedBuyUsd /
      Math.max(0.000001, state.policy[asset].sellPoint);

    explanations.push({
      type: "treasury_execution",
      asset,
      severity: "info",
      message: `Treasury sold ${formatCoins(coinsSold)} ${label} to the public and received ${formatUsd(marketState.executedBuyUsd)} in fiat reserves.`
    });
  }

  if (marketState.executedSellCoins > 0) {
    const fiatSpent =
      marketState.executedSellCoins *
      Math.max(0.000001, state.policy[asset].buyPoint);

    explanations.push({
      type: "treasury_execution",
      asset,
      severity: "info",
      message: `Treasury bought back ${formatCoins(marketState.executedSellCoins)} ${label}, spending about ${formatUsd(fiatSpent)} to absorb sell pressure.`
    });
  }

  const unfilledBuy = Math.max(0, marketState.unfilledBuyDemandUsd || 0);
  const unfilledSell = Math.max(0, marketState.unfilledSellPressureCoins || 0);

  if (unfilledBuy > Math.max(50_000, marketState.marketDepthUsd * 0.1)) {
    explanations.push({
      type: "treasury_execution",
      asset,
      severity: "medium",
      message: `${label} had ${formatUsd(unfilledBuy)} of unfilled buy demand, which means public demand exceeded the treasury and market's absorption capacity.`
    });
  }

  if (unfilledSell > Math.max(10_000, state.circulation[asset].supply * 0.01)) {
    explanations.push({
      type: "treasury_execution",
      asset,
      severity: "medium",
      message: `${label} had ${formatCoins(unfilledSell)} of unfilled sell pressure, which means support capacity was not enough to absorb all sellers.`
    });
  }
}

function addTrustExplanations({ state, explanations }) {
  const confidence = state.confidence;

  if (confidence.trend === "rising") {
    const driver = confidence.mainDrivers[0] || "the system performed consistently under current conditions";

    explanations.push({
      type: "trust",
      severity: "info",
      message: `Systemic trust rose to ${formatScore(confidence.systemicTrust)} because ${lowerFirst(driver)}`
    });
  }

  if (confidence.trend === "falling") {
    const risk = confidence.mainRisks[0] || "market confidence weakened";

    explanations.push({
      type: "trust",
      severity: confidence.systemicTrust < 40 ? "high" : "medium",
      message: `Systemic trust fell to ${formatScore(confidence.systemicTrust)} because ${lowerFirst(risk)}`
    });
  }

  if (confidence.runRisk > 0.25) {
    explanations.push({
      type: "trust",
      severity: confidence.runRisk > 0.5 ? "critical" : "high",
      message: `Run risk is elevated at ${formatPercent(confidence.runRisk)} because trust, liquidity, inventory, or support capacity is under pressure.`
    });
  }

  if (confidence.panicRisk > 0.25) {
    explanations.push({
      type: "trust",
      severity: confidence.panicRisk > 0.5 ? "critical" : "high",
      message: `Panic risk is elevated at ${formatPercent(confidence.panicRisk)} because shocks and visible stress are compounding.`
    });
  }

  if (confidence.treasuryInventoryTrust < 45) {
    explanations.push({
      type: "trust",
      severity: "high",
      message: `Treasury inventory trust is weak at ${formatScore(confidence.treasuryInventoryTrust)} because one or both coin reserves are below safe control levels.`
    });
  }

  if (confidence.treasuryFiatTrust < 45) {
    explanations.push({
      type: "trust",
      severity: "high",
      message: `Treasury fiat trust is weak at ${formatScore(confidence.treasuryFiatTrust)} because fiat reserves are less liquid, less useful, or losing real value.`
    });
  }
}

function addAdoptionExplanations({ state, explanations }) {
  const flows = state.adoption.flows;

  if (flows.activeGrowth > 0) {
    explanations.push({
      type: "adoption",
      severity: "info",
      message: `Mono active users increased by about ${formatWhole(flows.activeGrowth)} as awareness, trust, and utility converted into use.`
    });
  }

  if (flows.merchantGrowth > 0) {
    explanations.push({
      type: "adoption",
      severity: "info",
      message: `Merchant coverage increased by about ${formatWhole(flows.merchantGrowth)}, improving Mono's payment usefulness.`
    });
  }

  if (flows.churn > 0 && flows.churn > Math.max(10, state.adoption.mono.activeUsers * 0.01)) {
    explanations.push({
      type: "adoption",
      severity: "medium",
      message: `Mono lost about ${formatWhole(flows.churn)} active users to churn, usually caused by volatility, weak liquidity, or weaker trust.`
    });
  }

  if (state.adoption.mono.adoptionQuality < 35) {
    explanations.push({
      type: "adoption",
      severity: "medium",
      message: `Mono adoption quality is low at ${formatScore(state.adoption.mono.adoptionQuality)} because usage is not yet sticky enough, merchant support is thin, or churn is too high.`
    });
  }

  if (state.adoption.div.adoptionQuality < 35) {
    explanations.push({
      type: "adoption",
      severity: "medium",
      message: `DIV adoption quality is low at ${formatScore(state.adoption.div.adoptionQuality)} because demand is too speculative or dividend trust is weak.`
    });
  }
}

function addScenarioExplanations({ state, explanations }) {
  const activeScenarios = state.scenarios.active || [];

  if (activeScenarios.length === 0) {
    return;
  }

  const mostImportant = [...activeScenarios]
    .sort((a, b) => {
      const aWeight = getScenarioImportance(a);
      const bWeight = getScenarioImportance(b);
      return bWeight - aWeight;
    })
    .slice(0, 2);

  for (const scenario of mostImportant) {
    if (!scenario.explanation) continue;

    explanations.push({
      type: "scenario",
      severity: scenario.severity || "medium",
      message: `${scenario.name}: ${scenario.explanation}`
    });
  }

  if (activeScenarios.length >= 3) {
    explanations.push({
      type: "scenario",
      severity: "medium",
      message: `${activeScenarios.length} scenarios are active at once, increasing volatility clustering and making the economy harder to control.`
    });
  }
}

function addFiatDisplacementExplanations({ state, explanations }) {
  const displacement = state.fiatDisplacement;

  if (displacement.index >= 10) {
    explanations.push({
      type: "fiat_displacement",
      severity: displacement.index >= 65 ? "high" : "info",
      message: `Fiat displacement is at ${formatScore(displacement.index)} in the "${formatStage(displacement.stage)}" stage, driven by savings, payments, settlement, reserve use, and unit-of-account adoption.`
    });
  }

  if (displacement.fiatUsefulnessScore < 45) {
    explanations.push({
      type: "fiat_displacement",
      severity: "high",
      message: `Fiat usefulness is weak at ${formatScore(displacement.fiatUsefulnessScore)}, which helps Mono demand but makes fiat-based treasury support less reliable.`
    });
  }

  if (displacement.governmentResistanceLevel > 45) {
    explanations.push({
      type: "fiat_displacement",
      severity: "high",
      message: `Government resistance is rising at ${formatScore(displacement.governmentResistanceLevel)} because Mono and DIV are becoming more meaningful competitors to fiat functions.`
    });
  }

  if (displacement.unitOfAccountAdoption < 10 && displacement.index > 25) {
    explanations.push({
      type: "fiat_displacement",
      severity: "medium",
      message: "Fiat displacement remains limited because Mono is not yet widely used as a unit of account."
    });
  }
}

function addWarningExplanations({ state, explanations }) {
  const importantWarnings = (state.warnings || [])
    .filter((warning) => ["high", "critical"].includes(warning.severity))
    .slice(-4);

  for (const warning of importantWarnings) {
    explanations.push({
      type: "warning",
      severity: warning.severity,
      message: warning.message,
      code: warning.code
    });
  }
}

function collectCurrentTickCarriedExplanations({ state, currentTick }) {
  return (state.explanations.latest || [])
    .filter((explanation) => {
      /*
        Other engines may push explanations before this engine runs.
        Once this engine has normalized an explanation with a tick, old ones
        should not be carried into future ticks again.
      */
      return explanation.tick === currentTick || explanation.tick === undefined;
    })
    .map((explanation) => ({
      ...explanation
    }));
}

function normalizeExplanation({
  explanation,
  state,
  tickContext
}) {
  const severity = normalizeSeverity(explanation.severity);

  return {
    id: explanation.id || createExplanationId({
      state,
      explanation
    }),
    tick: state.runtime.tick,
    simulatedDay: state.runtime.simulatedDay,
    type: explanation.type || "general",
    asset: explanation.asset || null,
    severity,
    message: cleanMessage(explanation.message || "The economy changed because market conditions changed."),
    data: explanation.data || null,
    createdAt: explanation.createdAt || Date.now(),
    simulatedDaysThisTick: tickContext.simulatedDays || null
  };
}

function createExplanationId({ state, explanation }) {
  const base = [
    state.runtime.tick,
    explanation.type || "general",
    explanation.asset || "system",
    explanation.message || ""
  ].join("|");

  return hashString(base);
}

function dedupeExplanations(explanations) {
  const seen = new Set();
  const output = [];

  for (const explanation of explanations) {
    const key = `${explanation.type || "general"}|${explanation.asset || "system"}|${cleanMessage(explanation.message || "")}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(explanation);
  }

  return output
    .filter((explanation) => explanation.message && explanation.message.trim().length > 0)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function getScenarioReasonForAsset({ state, asset, direction }) {
  const activeScenarios = state.scenarios.active || [];

  if (activeScenarios.length === 0) {
    return null;
  }

  const relevant = activeScenarios
    .map((scenario) => {
      const effects = scenario.effects || {};
      let impact = 0;

      if (asset === "mono") {
        impact += Number(effects.monoDemandImpact || 0);
        impact -= Number(effects.monoSellPressureImpact || 0);
      }

      if (asset === "div") {
        impact += Number(effects.divDemandImpact || 0);
        impact -= Number(effects.divSellPressureImpact || 0);
      }

      impact += Number(effects.volatilityImpact || 0) * 0.2;
      impact *= Number(scenario.currentIntensity || 1);

      return {
        scenario,
        impact
      };
    })
    .filter((item) => {
      if (direction === "up") return item.impact > 0;
      return item.impact < 0;
    })
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  if (relevant.length === 0) {
    return null;
  }

  return `${relevant[0].scenario.name.toLowerCase()} affected demand, sell pressure, or volatility`;
}

function getScenarioImportance(scenario) {
  const severityWeight = {
    minor: 1,
    moderate: 2,
    serious: 3,
    severe: 4,
    crisis: 5
  }[scenario.severity] || 1;

  return severityWeight * Number(scenario.currentIntensity || 1);
}

function getPriceMoveSeverity({ asset, absoluteChange }) {
  if (asset === "mono") {
    if (absoluteChange >= 0.04) return "high";
    if (absoluteChange >= 0.015) return "medium";
    return "info";
  }

  if (absoluteChange >= 0.1) return "high";
  if (absoluteChange >= 0.04) return "medium";
  return "info";
}

function normalizeSeverity(severity) {
  if (["info", "medium", "high", "critical"].includes(severity)) {
    return severity;
  }

  if (severity === "minor") return "info";
  if (severity === "moderate") return "medium";
  if (severity === "serious") return "high";
  if (severity === "severe") return "critical";
  if (severity === "crisis") return "critical";

  return "info";
}

function severityRank(severity) {
  switch (normalizeSeverity(severity)) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "info":
    default:
      return 1;
  }
}

function joinReasons(reasons) {
  const cleanReasons = reasons
    .filter(Boolean)
    .map((reason) => reason.replace(/\.$/, ""));

  if (cleanReasons.length === 0) {
    return "market conditions changed";
  }

  if (cleanReasons.length === 1) {
    return cleanReasons[0];
  }

  if (cleanReasons.length === 2) {
    return `${cleanReasons[0]} and ${cleanReasons[1]}`;
  }

  return `${cleanReasons.slice(0, -1).join(", ")}, and ${cleanReasons[cleanReasons.length - 1]}`;
}

function cleanMessage(message) {
  return String(message)
    .replace(/\s+/g, " ")
    .trim();
}

function lowerFirst(text) {
  const value = cleanMessage(text);

  if (value.length === 0) return value;

  return value.charAt(0).toLowerCase() + value.slice(1);
}

function formatUsd(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "$0.00";
  }

  const abs = Math.abs(number);

  if (abs >= 1_000_000_000_000) {
    return `$${(number / 1_000_000_000_000).toFixed(2)}T`;
  }

  if (abs >= 1_000_000_000) {
    return `$${(number / 1_000_000_000).toFixed(2)}B`;
  }

  if (abs >= 1_000_000) {
    return `$${(number / 1_000_000).toFixed(2)}M`;
  }

  if (abs >= 1_000) {
    return `$${(number / 1_000).toFixed(2)}K`;
  }

  if (abs >= 1) {
    return `$${number.toFixed(2)}`;
  }

  return `$${number.toFixed(6)}`;
}

function formatCoins(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  const abs = Math.abs(number);

  if (abs >= 1_000_000_000_000) {
    return `${(number / 1_000_000_000_000).toFixed(2)}T`;
  }

  if (abs >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(2)}B`;
  }

  if (abs >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(2)}M`;
  }

  if (abs >= 1_000) {
    return `${(number / 1_000).toFixed(2)}K`;
  }

  return number.toFixed(2);
}

function formatWhole(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return Math.round(number).toLocaleString("en-US");
}

function formatPercent(unitValue) {
  const number = Number(unitValue || 0);

  if (!Number.isFinite(number)) {
    return "0.00%";
  }

  return `${(number * 100).toFixed(2)}%`;
}

function formatScore(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0/100";
  }

  return `${number.toFixed(1)}/100`;
}

function formatStage(stage) {
  return String(stage || "unknown")
    .replace(/_/g, " ");
}

function ensureExplanationState(state) {
  if (!state.explanations) {
    state.explanations = {
      latest: [],
      history: []
    };
  }

  if (!Array.isArray(state.explanations.latest)) {
    state.explanations.latest = [];
  }

  if (!Array.isArray(state.explanations.history)) {
    state.explanations.history = [];
  }
}

function hashString(value) {
  let hash = 0;
  const text = String(value);

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  return `exp_${Math.abs(hash).toString(36)}`;
}

module.exports = {
  runExplanationEngine
};
