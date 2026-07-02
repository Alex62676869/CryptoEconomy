"use strict";

const SEVERITY_WEIGHTS = {
  minor: 1,
  moderate: 2,
  serious: 3,
  severe: 4,
  crisis: 5
};

const BASE_ANNUAL_SCENARIO_RATES = {
  sandbox: {
    minor: 6,
    moderate: 2,
    serious: 0.25,
    severe: 0,
    crisis: 0
  },

  normal: {
    minor: 18,
    moderate: 6,
    serious: 1.5,
    severe: 0.25,
    crisis: 0.075
  },

  hard: {
    minor: 30,
    moderate: 10,
    serious: 4,
    severe: 1,
    crisis: 0.15
  },

  brutal: {
    minor: 48,
    moderate: 18,
    serious: 8,
    severe: 3,
    crisis: 0.35
  },

  historical_chaos: {
    minor: 72,
    moderate: 30,
    serious: 14,
    severe: 6,
    crisis: 1.25
  }
};

const SCENARIO_LIBRARY = [
  {
    id: "viral_promotion",
    name: "Viral promotion wave",
    category: "promotion_attention",
    source: "exogenous",
    severity: "minor",
    durationDays: [3, 12],
    rarityWeight: 12,
    minDifficulty: "sandbox",
    effects: {
      awarenessImpact: 0.8,
      monoDemandImpact: 8,
      divDemandImpact: 12,
      volatilityImpact: 5,
      mediaAttentionImpact: 0.12,
      cryptoSentimentImpact: 0.06,
      adoptionQualityImpact: -1
    },
    explanation: "A viral attention wave increased public interest, but not all of the demand is high quality."
  },

  {
    id: "major_creator_endorsement",
    name: "Major creator endorsement",
    category: "promotion_attention",
    source: "exogenous",
    severity: "moderate",
    durationDays: [5, 20],
    rarityWeight: 6,
    minDifficulty: "sandbox",
    effects: {
      awarenessImpact: 1.8,
      monoDemandImpact: 18,
      divDemandImpact: 28,
      volatilityImpact: 10,
      mediaAttentionImpact: 0.25,
      cryptoSentimentImpact: 0.12,
      divTrustImpact: 2,
      adoptionQualityImpact: -3
    },
    explanation: "A major endorsement increased attention and demand, especially for DIV."
  },

  {
    id: "payment_adoption_breakthrough",
    name: "Payment adoption breakthrough",
    category: "adoption",
    source: "exogenous",
    severity: "moderate",
    durationDays: [14, 60],
    rarityWeight: 7,
    minDifficulty: "sandbox",
    effects: {
      monoDemandImpact: 16,
      merchantAdoptionImpact: 6,
      businessAdoptionImpact: 2,
      stickyAdoptionImpact: 4,
      monoTrustImpact: 4,
      adoptionTrustImpact: 6,
      volatilityImpact: -2
    },
    explanation: "A payment-use breakthrough improved durable Mono adoption."
  },

  {
    id: "merchant_integration_delay",
    name: "Merchant integration delay",
    category: "adoption",
    source: "exogenous",
    severity: "minor",
    durationDays: [10, 35],
    rarityWeight: 8,
    minDifficulty: "normal",
    effects: {
      merchantAdoptionImpact: -3,
      businessAdoptionImpact: -1,
      monoDemandImpact: -5,
      adoptionTrustImpact: -5,
      churnImpact: 4
    },
    explanation: "Merchant integration delays slowed high-quality adoption."
  },

  {
    id: "dividend_hype_cycle",
    name: "DIV dividend hype cycle",
    category: "dividend",
    source: "exogenous",
    severity: "moderate",
    durationDays: [7, 30],
    rarityWeight: 9,
    minDifficulty: "sandbox",
    effects: {
      divDemandImpact: 30,
      monoDemandImpact: 6,
      volatilityImpact: 14,
      awarenessImpact: 0.7,
      divTrustImpact: 3,
      adoptionQualityImpact: -5,
      cryptoSentimentImpact: 0.1
    },
    explanation: "Dividend expectations created a demand cycle for DIV."
  },

  {
    id: "dividend_skepticism",
    name: "Dividend sustainability skepticism",
    category: "dividend",
    source: "exogenous",
    severity: "serious",
    durationDays: [14, 50],
    rarityWeight: 5,
    minDifficulty: "normal",
    effects: {
      divDemandImpact: -18,
      divSellPressureImpact: 24,
      divTrustImpact: -12,
      policyTrustImpact: -5,
      volatilityImpact: 15,
      panicRiskImpact: 4
    },
    explanation: "The market questioned whether DIV dividends are sustainable."
  },

  {
    id: "liquidity_provider_arrival",
    name: "Liquidity provider arrival",
    category: "market_structure",
    source: "exogenous",
    severity: "minor",
    durationDays: [20, 80],
    rarityWeight: 7,
    minDifficulty: "sandbox",
    effects: {
      liquidityImpact: 10,
      liquidityTrustImpact: 8,
      volatilityImpact: -5,
      monoDemandImpact: 4,
      divDemandImpact: 4
    },
    explanation: "New liquidity providers improved market depth and reduced volatility."
  },

  {
    id: "whale_sell_event",
    name: "Whale sell event",
    category: "market_structure",
    source: "exogenous",
    severity: "serious",
    durationDays: [2, 10],
    rarityWeight: 5,
    minDifficulty: "normal",
    effects: {
      monoSellPressureImpact: 16,
      divSellPressureImpact: 28,
      liquidityImpact: -12,
      liquidityTrustImpact: -10,
      volatilityImpact: 22,
      panicRiskImpact: 8
    },
    explanation: "A large holder created sudden sell pressure and tested treasury support."
  },

  {
    id: "exchange_outage",
    name: "Exchange outage",
    category: "market_structure",
    source: "exogenous",
    severity: "serious",
    durationDays: [1, 7],
    rarityWeight: 4,
    minDifficulty: "normal",
    effects: {
      liquidityImpact: -25,
      liquidityTrustImpact: -16,
      monoDemandImpact: -10,
      divDemandImpact: -16,
      monoSellPressureImpact: 8,
      divSellPressureImpact: 18,
      volatilityImpact: 30,
      panicRiskImpact: 10
    },
    explanation: "An exchange outage reduced liquidity and made price discovery unstable."
  },

  {
    id: "risk_on_macro",
    name: "Risk-on macro environment",
    category: "macro",
    source: "exogenous",
    severity: "minor",
    durationDays: [20, 90],
    rarityWeight: 8,
    minDifficulty: "sandbox",
    effects: {
      divDemandImpact: 16,
      monoDemandImpact: 6,
      cryptoSentimentImpact: 0.14,
      volatilityImpact: 4,
      fiatUsefulnessImpact: -1
    },
    explanation: "A risk-on environment increased appetite for growth and speculative assets."
  },

  {
    id: "recession_fear",
    name: "Recession fear",
    category: "macro",
    source: "exogenous",
    severity: "serious",
    durationDays: [30, 160],
    rarityWeight: 5,
    minDifficulty: "normal",
    effects: {
      monoDemandImpact: 8,
      divDemandImpact: -15,
      divSellPressureImpact: 20,
      volatilityImpact: 18,
      liquidityImpact: -8,
      recessionRiskImpact: 0.18,
      cryptoSentimentImpact: -0.1,
      panicRiskImpact: 5
    },
    explanation: "Recession fear pushed the market away from risky assets and tested DIV."
  },

  {
    id: "banking_stress",
    name: "Banking stress",
    category: "banking_financial",
    source: "exogenous",
    severity: "severe",
    durationDays: [10, 90],
    rarityWeight: 3,
    minDifficulty: "normal",
    effects: {
      monoDemandImpact: 24,
      divDemandImpact: -8,
      monoTrustImpact: 5,
      fiatUsefulnessImpact: -12,
      bankingStressImpact: 22,
      liquidityImpact: -10,
      volatilityImpact: 20,
      regulatoryPressureImpact: 4
    },
    explanation: "Banking stress increased interest in Mono but reduced normal fiat liquidity."
  },

  {
    id: "inflation_spike",
    name: "Inflation spike",
    category: "fiat_inflation",
    source: "exogenous",
    severity: "serious",
    durationDays: [45, 220],
    rarityWeight: 4,
    minDifficulty: "normal",
    effects: {
      monoDemandImpact: 18,
      divDemandImpact: 8,
      fiatUsefulnessImpact: -14,
      realFiatImpact: -8,
      fxDecayImpact: 0.005,
      inflationFearImpact: 0.18,
      volatilityImpact: 8
    },
    explanation: "Inflation fear weakened fiat usefulness and increased monetary-alternative demand."
  },

  {
    id: "regulatory_warning",
    name: "Regulatory warning",
    category: "regulation_political",
    source: "exogenous",
    severity: "serious",
    durationDays: [10, 70],
    rarityWeight: 5,
    minDifficulty: "normal",
    effects: {
      monoDemandImpact: -10,
      divDemandImpact: -18,
      monoSellPressureImpact: 10,
      divSellPressureImpact: 22,
      regulatoryPressureImpact: 18,
      regulatoryTrustImpact: -14,
      liquidityTrustImpact: -8,
      volatilityImpact: 20,
      panicRiskImpact: 8
    },
    explanation: "Regulatory warnings reduced confidence and increased sell pressure."
  },

  {
    id: "competitor_launch",
    name: "Strong competitor launch",
    category: "competition_technology",
    source: "exogenous",
    severity: "moderate",
    durationDays: [20, 120],
    rarityWeight: 5,
    minDifficulty: "normal",
    effects: {
      monoDemandImpact: -8,
      divDemandImpact: -14,
      adoptionTrustImpact: -8,
      awarenessImpact: -0.3,
      churnImpact: 6,
      cryptoSentimentImpact: -0.05
    },
    explanation: "A competing system reduced attention and increased churn."
  },

  {
    id: "technology_upgrade",
    name: "Technology upgrade success",
    category: "competition_technology",
    source: "exogenous",
    severity: "moderate",
    durationDays: [20, 100],
    rarityWeight: 6,
    minDifficulty: "sandbox",
    effects: {
      monoDemandImpact: 10,
      divDemandImpact: 12,
      adoptionTrustImpact: 10,
      liquidityTrustImpact: 4,
      businessAdoptionImpact: 3,
      merchantAdoptionImpact: 4,
      volatilityImpact: -4
    },
    explanation: "A successful technology upgrade improved trust and adoption quality."
  }
];

function runScenarioShockEngine(state, context = {}) {
  const tickContext = context.tickContext || {};
  const simulatedDays = Math.max(1, Number(tickContext.simulatedDays || 1));

  decayAndExpireActiveScenarios({
    state,
    simulatedDays
  });

  updateScenarioPressure({
    state,
    simulatedDays
  });

  triggerEndogenousScenarios({
    state,
    simulatedDays
  });

  rollExogenousScenarios({
    state,
    simulatedDays
  });

  updateMacroRegimeFromScenarios({
    state,
    simulatedDays
  });

  return state;
}

function decayAndExpireActiveScenarios({ state, simulatedDays }) {
  const stillActive = [];

  for (const scenario of state.scenarios.active || []) {
    scenario.remainingDays = Math.max(
      0,
      Number(scenario.remainingDays || 0) - simulatedDays
    );

    scenario.ageDays = Math.max(
      0,
      Number(scenario.ageDays || 0) + simulatedDays
    );

    scenario.progress = scenario.totalDurationDays > 0
      ? clamp(scenario.ageDays / scenario.totalDurationDays, 0, 1)
      : 1;

    scenario.currentIntensity = calculateScenarioCurrentIntensity(scenario);

    if (scenario.remainingDays > 0) {
      stillActive.push(scenario);
    } else {
      state.scenarios.history.push({
        ...scenario,
        endedAtTick: state.runtime.tick,
        endedAtSimulatedDay: state.runtime.simulatedDay,
        endedAt: Date.now()
      });

      state.history.events.push({
        tick: state.runtime.tick,
        type: "scenario_ended",
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        createdAt: Date.now()
      });
    }
  }

  state.scenarios.active = stillActive;
}

function triggerEndogenousScenarios({ state }) {
  maybeTriggerEndogenousScenario({
    state,
    condition: state.treasury.mono.inventoryZone === "danger" ||
      state.treasury.mono.inventoryZone === "critical" ||
      state.treasury.mono.inventoryZone === "lost_sell_side_control",
    id: "mono_inventory_stress",
    name: "Mono inventory stress",
    category: "treasury_trust",
    severity: getInventorySeverity(state.treasury.mono.inventoryZone),
    cooldownTicks: 30,
    durationDays: [12, 45],
    effects: {
      monoTrustImpact: -14,
      inventoryTrustImpact: -16,
      policyTrustImpact: -8,
      liquidityTrustImpact: -6,
      monoSellPressureImpact: 12,
      volatilityImpact: 14,
      runRiskImpact: 8
    },
    explanation: "Mono treasury inventory fell below safe control levels."
  });

  maybeTriggerEndogenousScenario({
    state,
    condition: state.treasury.div.inventoryZone === "danger" ||
      state.treasury.div.inventoryZone === "critical" ||
      state.treasury.div.inventoryZone === "lost_sell_side_control",
    id: "div_inventory_stress",
    name: "DIV inventory stress",
    category: "treasury_trust",
    severity: getInventorySeverity(state.treasury.div.inventoryZone),
    cooldownTicks: 30,
    durationDays: [12, 45],
    effects: {
      divTrustImpact: -16,
      inventoryTrustImpact: -14,
      policyTrustImpact: -8,
      divSellPressureImpact: 18,
      divDemandImpact: -10,
      volatilityImpact: 18,
      runRiskImpact: 6
    },
    explanation: "DIV treasury inventory fell below safe control levels."
  });

  maybeTriggerEndogenousScenario({
    state,
    condition: state.prices.div.overheatingScore >= 70,
    id: "div_overheating",
    name: "DIV overheating",
    category: "dividend",
    severity: state.prices.div.overheatingScore >= 90 ? "severe" : "serious",
    cooldownTicks: 20,
    durationDays: [7, 35],
    effects: {
      divDemandImpact: -8,
      divSellPressureImpact: 24,
      divTrustImpact: -14,
      policyTrustImpact: -7,
      volatilityImpact: 26,
      liquidityTrustImpact: -8,
      panicRiskImpact: 8
    },
    explanation: "DIV rose faster than adoption and dividend credibility could justify."
  });

  maybeTriggerEndogenousScenario({
    state,
    condition: state.prices.mono.market < state.policy.mono.buyPoint * 0.985,
    id: "mono_support_test",
    name: "Mono support test",
    category: "treasury_trust",
    severity: state.prices.mono.market < state.policy.mono.buyPoint * 0.95 ? "severe" : "serious",
    cooldownTicks: 15,
    durationDays: [5, 25],
    effects: {
      monoSellPressureImpact: 20,
      monoTrustImpact: -18,
      liquidityTrustImpact: -10,
      policyTrustImpact: -10,
      volatilityImpact: 22,
      runRiskImpact: 12,
      panicRiskImpact: 6
    },
    explanation: "Mono traded below the treasury buy point, forcing the market to test support."
  });

  maybeTriggerEndogenousScenario({
    state,
    condition: state.dividends.sustainabilityScore < 35 &&
      state.policy.dividends.enabled &&
      state.dividends.expectationScore > 45,
    id: "unsustainable_dividend_expectations",
    name: "Unsustainable dividend expectations",
    category: "dividend",
    severity: "serious",
    cooldownTicks: 35,
    durationDays: [15, 60],
    effects: {
      divTrustImpact: -18,
      divSellPressureImpact: 20,
      divDemandImpact: -12,
      policyTrustImpact: -12,
      adoptionQualityImpact: -8,
      volatilityImpact: 20,
      panicRiskImpact: 6
    },
    explanation: "DIV dividend expectations became too high relative to treasury capacity."
  });

  maybeTriggerEndogenousScenario({
    state,
    condition: state.treasury.fiat.fiatUsefulnessScore < 35,
    id: "fiat_reserve_quality_stress",
    name: "Fiat reserve quality stress",
    category: "fiat_inflation",
    severity: state.treasury.fiat.fiatUsefulnessScore < 20 ? "severe" : "serious",
    cooldownTicks: 45,
    durationDays: [30, 120],
    effects: {
      fiatTrustImpact: -18,
      fiatUsefulnessImpact: -12,
      liquidityTrustImpact: -8,
      currencyRiskImpact: 8,
      runRiskImpact: 7,
      volatilityImpact: 8
    },
    explanation: "The fiat reserve basket became less useful for defending the system."
  });

  maybeTriggerEndogenousScenario({
    state,
    condition: calculateAdoptionOverloadScore(state) > 0.7,
    id: "adoption_overload",
    name: "Adoption overload",
    category: "adoption",
    severity: calculateAdoptionOverloadScore(state) > 0.9 ? "serious" : "moderate",
    cooldownTicks: 25,
    durationDays: [10, 50],
    effects: {
      adoptionTrustImpact: -10,
      liquidityTrustImpact: -8,
      churnImpact: 10,
      merchantAdoptionImpact: -2,
      volatilityImpact: 12,
      monoDemandImpact: -4,
      divDemandImpact: -6
    },
    explanation: "Adoption grew faster than liquidity, merchant coverage, and support infrastructure."
  });
}

function maybeTriggerEndogenousScenario({
  state,
  condition,
  id,
  name,
  category,
  severity,
  cooldownTicks,
  durationDays,
  effects,
  explanation
}) {
  if (!condition) {
    return;
  }

  if (hasActiveScenario(state, id)) {
    return;
  }

  const lastSimilar = [...state.scenarios.history]
    .reverse()
    .find((scenario) => scenario.id === id);

  if (
    lastSimilar &&
    state.runtime.tick - Number(lastSimilar.startedAtTick || 0) < cooldownTicks
  ) {
    return;
  }

  addScenario(state, {
    id,
    name,
    category,
    source: "endogenous",
    severity,
    durationDays,
    effects,
    explanation
  });
}

function rollExogenousScenarios({ state, simulatedDays }) {
  const difficulty = state.defaults.difficulty || "normal";
  const rates = BASE_ANNUAL_SCENARIO_RATES[difficulty] || BASE_ANNUAL_SCENARIO_RATES.normal;
  const difficultyParams = getDifficultyParams(state);

  const frequencyMultiplier =
    Number(difficultyParams.scenarioFrequencyMultiplier || 1) *
    getScenarioFrequencySettingMultiplier(state.defaults.scenarios.frequency);

  const intensityMultiplier =
    Number(difficultyParams.scenarioIntensityMultiplier || 1) *
    getScenarioIntensitySettingMultiplier(state.defaults.scenarios.intensity);

  const clusteringMultiplier = 1 + clamp(state.scenarios.clusteringPressure || 0, 0, 2) * 0.35;

  for (const severity of Object.keys(rates)) {
    const annualRate = rates[severity] * frequencyMultiplier * clusteringMultiplier;
    const probability = 1 - Math.exp(-(annualRate * simulatedDays) / 365);

    if (Math.random() < probability) {
      const template = pickScenarioTemplate({
        state,
        severity
      });

      if (!template) {
        continue;
      }

      addScenarioFromTemplate({
        state,
        template,
        intensityMultiplier
      });
    }
  }

  state.scenarios.lastRolledAtTick = state.runtime.tick;
}

function pickScenarioTemplate({ state, severity }) {
  const difficulty = state.defaults.difficulty || "normal";

  const candidates = SCENARIO_LIBRARY.filter((scenario) => {
    if (scenario.severity !== severity) return false;
    if (!isDifficultyAllowed(difficulty, scenario.minDifficulty)) return false;
    if (hasActiveScenario(state, scenario.id)) return false;

    return true;
  });

  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce(
    (sum, scenario) => sum + Math.max(0.01, scenario.rarityWeight || 1),
    0
  );

  let roll = Math.random() * totalWeight;

  for (const candidate of candidates) {
    roll -= Math.max(0.01, candidate.rarityWeight || 1);

    if (roll <= 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

function addScenarioFromTemplate({ state, template, intensityMultiplier }) {
  const effects = scaleEffects({
    effects: template.effects,
    severity: template.severity,
    multiplier: intensityMultiplier
  });

  addScenario(state, {
    ...template,
    effects
  });
}

function addScenario(state, template) {
  const duration = randomDurationDays(template.durationDays);
  const severityWeight = SEVERITY_WEIGHTS[template.severity] || 1;

  const scenario = {
    id: template.id,
    instanceId: `${template.id}_${state.runtime.tick}_${Math.random().toString(36).slice(2, 8)}`,
    name: template.name,
    category: template.category,
    source: template.source || "exogenous",
    severity: template.severity || "minor",
    severityWeight,
    totalDurationDays: duration,
    remainingDays: duration,
    ageDays: 0,
    progress: 0,
    currentIntensity: 1,
    effects: template.effects || {},
    explanation: template.explanation || null,
    startedAtTick: state.runtime.tick,
    startedAtSimulatedDay: state.runtime.simulatedDay,
    startedAt: Date.now()
  };

  state.scenarios.active.push(scenario);

  state.history.events.push({
    tick: state.runtime.tick,
    type: "scenario_started",
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    severity: scenario.severity,
    source: scenario.source,
    createdAt: Date.now()
  });

  state.explanations.latest.push({
    type: "scenario",
    severity: scenario.severity,
    message: scenario.explanation || `${scenario.name} started.`
  });
}

function updateScenarioPressure({ state, simulatedDays }) {
  const active = state.scenarios.active || [];

  let pressure = 0;
  let aftershockPressure = Number(state.scenarios.aftershockPressure || 0);
  let clusteringPressure = Number(state.scenarios.clusteringPressure || 0);

  for (const scenario of active) {
    const severityWeight = SEVERITY_WEIGHTS[scenario.severity] || 1;
    pressure += severityWeight * (scenario.currentIntensity || 1) * 0.1;

    if (severityWeight >= 3) {
      clusteringPressure += 0.015 * severityWeight * simulatedDays;
    }
  }

  aftershockPressure = Math.max(
    0,
    aftershockPressure * Math.pow(0.985, simulatedDays)
  );

  clusteringPressure = Math.max(
    0,
    clusteringPressure * Math.pow(0.99, simulatedDays)
  );

  if (active.length === 0) {
    pressure *= 0.92;
  }

  state.scenarios.scenarioPressure = clamp(pressure, 0, 5);
  state.scenarios.aftershockPressure = clamp(aftershockPressure, 0, 3);
  state.scenarios.clusteringPressure = clamp(clusteringPressure, 0, 3);
}

function updateMacroRegimeFromScenarios({ state, simulatedDays }) {
  const aggregate = aggregateActiveScenarioEffects(state);

  const regime = state.market.regime;

  regime.mediaAttention = smoothRegimeValue({
    current: regime.mediaAttention,
    target: clamp(
      regime.mediaAttention +
        aggregate.mediaAttentionImpact +
        aggregate.awarenessImpact * 0.03,
      0,
      1
    ),
    simulatedDays
  });

  regime.cryptoSentiment = smoothRegimeValue({
    current: regime.cryptoSentiment,
    target: clamp(
      regime.cryptoSentiment +
        aggregate.cryptoSentimentImpact +
        aggregate.divDemandImpact * 0.001 -
        aggregate.divSellPressureImpact * 0.001,
      0,
      1
    ),
    simulatedDays
  });

  regime.recessionRisk = smoothRegimeValue({
    current: regime.recessionRisk,
    target: clamp(
      regime.recessionRisk +
        aggregate.recessionRiskImpact,
      0,
      1
    ),
    simulatedDays
  });

  regime.inflationFear = smoothRegimeValue({
    current: regime.inflationFear,
    target: clamp(
      regime.inflationFear +
        aggregate.inflationFearImpact,
      0,
      1
    ),
    simulatedDays
  });

  regime.regulationPressure = smoothRegimeValue({
    current: regime.regulationPressure,
    target: clamp(
      regime.regulationPressure +
        aggregate.regulatoryPressureImpact * 0.01,
      0,
      1
    ),
    simulatedDays
  });

  regime.bankingStress = smoothRegimeValue({
    current: regime.bankingStress,
    target: clamp(
      regime.bankingStress +
        aggregate.bankingStressImpact * 0.01,
      0,
      1
    ),
    simulatedDays
  });

  decayMacroRegimeTowardBaseline({
    state,
    simulatedDays
  });

  regime.riskMood = calculateRiskMood(regime);
  regime.name = calculateRegimeName(regime);
  state.scenarios.currentRegime = regime.name;
}

function decayMacroRegimeTowardBaseline({ state, simulatedDays }) {
  const regime = state.market.regime;

  const baselines = {
    mediaAttention: 0.05,
    cryptoSentiment: 0.5,
    recessionRisk: 0.05,
    inflationFear: 0.1,
    regulationPressure: 0.05,
    bankingStress: 0.03
  };

  const decay = clamp(0.012 * simulatedDays, 0.001, 0.25);

  for (const [key, baseline] of Object.entries(baselines)) {
    regime[key] = clamp(
      regime[key] + (baseline - regime[key]) * decay,
      0,
      1
    );
  }
}

function aggregateActiveScenarioEffects(state) {
  const output = {
    monoDemandImpact: 0,
    divDemandImpact: 0,
    monoSellPressureImpact: 0,
    divSellPressureImpact: 0,
    liquidityImpact: 0,
    volatilityImpact: 0,
    mediaAttentionImpact: 0,
    cryptoSentimentImpact: 0,
    recessionRiskImpact: 0,
    inflationFearImpact: 0,
    regulatoryPressureImpact: 0,
    bankingStressImpact: 0,
    awarenessImpact: 0
  };

  for (const scenario of state.scenarios.active || []) {
    const effects = scenario.effects || {};
    const intensity = Number(scenario.currentIntensity || 1);

    for (const key of Object.keys(output)) {
      output[key] += Number(effects[key] || 0) * intensity;
    }
  }

  return output;
}

function aggregateScenarioDemandSignal(state) {
  const aggregate = aggregateActiveScenarioEffects(state);

  return (
    aggregate.monoDemandImpact +
    aggregate.divDemandImpact -
    aggregate.monoSellPressureImpact -
    aggregate.divSellPressureImpact
  );
}

function calculateScenarioCurrentIntensity(scenario) {
  const progress = clamp(Number(scenario.progress || 0), 0, 1);

  /*
    Most scenarios ramp up, peak, then fade.
    Crisis-style scenarios stay intense for longer.
  */
  const severityWeight = SEVERITY_WEIGHTS[scenario.severity] || 1;

  if (severityWeight >= 4) {
    if (progress < 0.2) return 0.5 + progress * 3;
    if (progress < 0.75) return 1;
    return clamp(1 - (progress - 0.75) * 3, 0.25, 1);
  }

  if (progress < 0.25) return 0.4 + progress * 2.4;
  if (progress < 0.65) return 1;
  return clamp(1 - (progress - 0.65) * 2.2, 0.2, 1);
}

function scaleEffects({ effects, severity, multiplier }) {
  const severityWeight = SEVERITY_WEIGHTS[severity] || 1;
  const scale = Math.max(0.1, Number(multiplier || 1)) * (0.75 + severityWeight * 0.12);

  const output = {};

  for (const [key, value] of Object.entries(effects || {})) {
    if (typeof value === "number") {
      output[key] = value * scale;
    } else {
      output[key] = value;
    }
  }

  return output;
}

function randomDurationDays(durationDays) {
  if (!Array.isArray(durationDays)) {
    return 7;
  }

  const min = Math.max(1, Number(durationDays[0] || 1));
  const max = Math.max(min, Number(durationDays[1] || min));

  return Math.round(min + Math.random() * (max - min));
}

function hasActiveScenario(state, id) {
  return (state.scenarios.active || []).some((scenario) => scenario.id === id);
}

function calculateRiskMood(regime) {
  const riskScore =
    regime.cryptoSentiment * 0.4 +
    regime.mediaAttention * 0.15 -
    regime.recessionRisk * 0.2 -
    regime.regulationPressure * 0.15 -
    regime.bankingStress * 0.1;

  if (riskScore >= 0.55) return "risk_on";
  if (riskScore <= 0.2) return "risk_off";
  return "neutral";
}

function calculateRegimeName(regime) {
  if (regime.bankingStress > 0.55) return "banking_stress";
  if (regime.regulationPressure > 0.55) return "regulatory_pressure";
  if (regime.recessionRisk > 0.55) return "recession_fear";
  if (regime.inflationFear > 0.6) return "inflation_fear";
  if (regime.cryptoSentiment > 0.7 && regime.mediaAttention > 0.4) return "crypto_euphoria";
  if (regime.cryptoSentiment > 0.6) return "risk_on_expansion";
  if (regime.cryptoSentiment < 0.35) return "risk_off";
  return "calm_expansion";
}

function smoothRegimeValue({ current, target, simulatedDays }) {
  const speed = clamp(0.08 * simulatedDays, 0.01, 0.5);

  return clamp(
    Number(current || 0) + (Number(target || 0) - Number(current || 0)) * speed,
    0,
    1
  );
}

function getScenarioFrequencySettingMultiplier(setting) {
  switch (setting) {
    case "low":
      return 0.6;
    case "high":
      return 1.5;
    case "normal":
    default:
      return 1;
  }
}

function getScenarioIntensitySettingMultiplier(setting) {
  switch (setting) {
    case "low":
      return 0.7;
    case "high":
      return 1.35;
    case "normal":
    default:
      return 1;
  }
}

function getDifficultyParams(state) {
  const difficulty = state.defaults.difficulty || "normal";
  const params = state.defaults.difficultyParams[difficulty];

  return params || state.defaults.difficultyParams.normal;
}

function isDifficultyAllowed(currentDifficulty, minDifficulty) {
  const order = {
    sandbox: 0,
    normal: 1,
    hard: 2,
    brutal: 3,
    historical_chaos: 4
  };

  return (order[currentDifficulty] || 0) >= (order[minDifficulty] || 0);
}

function getInventorySeverity(zone) {
  switch (zone) {
    case "lost_sell_side_control":
      return "crisis";
    case "critical":
      return "severe";
    case "danger":
      return "serious";
    default:
      return "moderate";
  }
}

function calculateAdoptionOverloadScore(state) {
  const flows = state.adoption.flows || {};
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
  const executionWeakness = 1 - percentToUnit(state.treasury.executionQuality);

  return clamp(
    activeGrowthRate * 4 +
      merchantGrowthRate * 3 +
      liquidityWeakness * 0.4 +
      executionWeakness * 0.3,
    0,
    1
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
  runScenarioShockEngine
};
