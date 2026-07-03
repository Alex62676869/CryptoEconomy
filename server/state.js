"use strict";

function createInitialState() {
  const now = Date.now();

  return {
    meta: {
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
      name: "Mono & DIV Economy Game"
    },

    runtime: {
      tick: 0,
      simulatedDay: 0,
      lastTickAt: now,
      lastPlayerActionAt: null,
      lastDefaultsUpdateAt: null,
      lastConnectionChangeAt: null,
      isPlayerOnline: false
    },

    defaults: createDefaultSettings(),

    policy: createInitialPolicy(),

    prices: {
      mono: {
        market: 1.0,
        previousMarket: 1.0,
        fundamental: 1.0,
        policyMidpoint: 1.0,
        returnThisTick: 0,
        momentum: 0,
        overheatingScore: 0
      },

      div: {
        market: 1.0,
        previousMarket: 1.0,
        fundamental: 1.0,
        policyMidpoint: 1.0,
        returnThisTick: 0,
        momentum: 0,
        overheatingScore: 0,
        topPointPressure: 0
      }
    },

    treasury: {
      fiat: {
        totalUsdNominal: 1_000_000,
        totalUsdReal: 1_000_000,
        liquidSupportUsd: 1_000_000,
        blendedNominalYield: 0.035,
        blendedUsdAdjustedReturn: 0.025,
        blendedRealReturn: 0.015,
        fiatUsefulnessScore: 100,
        globalM2Share: 0,
        allocationMode: "balanced"
      },

      mono: {
        balance: 100_000_000_000_000,
        strategicReserveTarget: 30_000_000_000_000,
        controlScore: 100,
        inventoryZone: "excellent"
      },

      div: {
        balance: 100_000_000_000_000,
        strategicReserveTarget: 30_000_000_000_000,
        controlScore: 100,
        inventoryZone: "excellent"
      },

      controlScore: 100,
      supportCapacityScore: 100,
      absorptionCapacityScore: 100,
      executionQuality: 100
    },

    circulation: {
      mono: {
        supply: 300_000,
        usdValue: 300_000
      },

      div: {
        supply: 300_000,
        usdValue: 300_000
      }
    },

    fiatCurrencies: createInitialCurrencyAccounts(),

    market: {
      mono: {
        desiredBuyUsd: 0,
        desiredSellCoins: 0,
        executedBuyUsd: 0,
        executedSellCoins: 0,
        publicDemand: 0,
        publicSellPressure: 0,
        orderFlowImbalance: 0,
        liquidity: 75,
        volatility: 0.02,
        marketDepthUsd: 1_000_000,
        arbitragePressure: 0,
        supportPressure: 0
      },

      div: {
        desiredBuyUsd: 0,
        desiredSellCoins: 0,
        executedBuyUsd: 0,
        executedSellCoins: 0,
        publicDemand: 0,
        publicSellPressure: 0,
        orderFlowImbalance: 0,
        liquidity: 65,
        volatility: 0.04,
        marketDepthUsd: 750_000,
        arbitragePressure: 0,
        topPointPressure: 0
      },

      regime: {
        name: "calm_expansion",
        riskMood: "neutral",
        recessionRisk: 0.05,
        inflationFear: 0.1,
        cryptoSentiment: 0.5,
        regulationPressure: 0.05,
        mediaAttention: 0.05,
        bankingStress: 0.03
      }
    },

    adoption: {
      mono: {
        potentialUsers: 1_000_000_000,
        awareUsers: 10_000,
        trialUsers: 1_000,
        activeUsers: 300,
        stickyUsers: 100,
        merchants: 10,
        businesses: 1,
        institutions: 0,
        paymentAdoption: 0,
        savingsAdoption: 0,
        settlementAdoption: 0,
        reserveAdoption: 0,
        unitOfAccountAdoption: 0,
        churnRate: 0.01,
        adoptionQuality: 50
      },

      div: {
        awareUsers: 10_000,
        holders: 300,
        stickyHolders: 50,
        dividendSeekers: 50,
        speculators: 200,
        institutions: 0,
        speculativeDemandShare: 0.6,
        churnRate: 0.02,
        adoptionQuality: 40
      },

      flows: {
        awarenessGrowth: 0,
        trialGrowth: 0,
        activeGrowth: 0,
        stickyGrowth: 0,
        merchantGrowth: 0,
        businessGrowth: 0,
        institutionalGrowth: 0,
        churn: 0
      }
    },

    confidence: {
      systemicTrust: 75,
      monoStabilityTrust: 80,
      divDividendTrust: 65,
      treasuryInventoryTrust: 100,
      treasuryFiatTrust: 80,
      policyConsistencyTrust: 80,
      liquidityTrust: 75,
      adoptionTrust: 55,
      regulatorySurvivalTrust: 70,
      runRisk: 0,
      panicRisk: 0,
      trustRegime: "normal",
      trend: "stable",
      mainDrivers: [],
      mainRisks: []
    },

    dividends: {
      enabled: true,
      automationEnabled: false,
      targetAnnualDivDistribution: 0,
      distributedLast365Days: 0,
      sustainabilityScore: 100,
      expectationScore: 25,
      lastDistributionTick: null,
      nextScheduledDistributionTick: null
    },

    fiatDisplacement: {
      index: 0,
      stage: "fiat_dominant",
      fiatUsefulnessScore: 100,
      savingsAdoption: 0,
      paymentAdoption: 0,
      merchantAdoption: 0,
      businessSettlementAdoption: 0,
      unitOfAccountAdoption: 0,
      reserveAdoption: 0,
      treasuryFiatDependence: 100,
      governmentResistanceLevel: 0,
      bankingFrictionLevel: 0,
      realFiatPurchasingPower: 100,
      globalM2Share: 0
    },

    scenarios: {
      active: [],
      history: [],
      lastRolledAtTick: null,
      currentRegime: "calm_expansion",
      scenarioPressure: 0,
      aftershockPressure: 0,
      clusteringPressure: 0
    },

    warnings: [],

    explanations: {
      latest: [],
      history: []
    },

    charts: {
      monoPrice: [],
      divPrice: [],
      treasuryFiat: [],
      treasuryMono: [],
      treasuryDiv: [],
      systemicTrust: [],
      fiatDisplacement: []
    },

    history: {
      events: [],
      snapshots: []
    },

    journal: {
      entries: []
    }
  };
}

function createDefaultSettings() {
  return {
    difficulty: "normal",
    adoptionMode: "normal",
    modelPreset: "balanced_realism",

    treasuryCapMode: "global_scale",
    treasuryFiatCapUsd: 100_000_000_000_000,

    offlineSimulation: {
      mode: "unlimited",
      maxCatchupTicks: 10_000
    },

    tickSpeed: {
      tickMs: 1000,
      simulatedDaysPerTick: 1
    },

    scenarios: {
      frequency: "normal",
      intensity: "normal"
    },

    startingValues: {
      treasuryFiatUsd: 1_000_000,
      treasuryMono: 100_000_000_000_000,
      treasuryDiv: 100_000_000_000_000,
      circulatingMonoUsdValue: 300_000,
      circulatingDivUsdValue: 300_000
    },

    strategicReserveTargets: {
      mono: 30_000_000_000_000,
      div: 30_000_000_000_000
    },

    difficultyParams: {
      sandbox: {
        scenarioFrequencyMultiplier: 0.35,
        scenarioIntensityMultiplier: 0.4,
        volatilityMultiplier: 0.5,
        arbitrageAggression: 0.25,
        panicMultiplier: 0.25,
        trustRecoveryMultiplier: 1.6,
        regulatoryPressureMultiplier: 0.25
      },

      normal: {
        scenarioFrequencyMultiplier: 1,
        scenarioIntensityMultiplier: 1,
        volatilityMultiplier: 1,
        arbitrageAggression: 1,
        panicMultiplier: 1,
        trustRecoveryMultiplier: 1,
        regulatoryPressureMultiplier: 1
      },

      hard: {
        scenarioFrequencyMultiplier: 1.75,
        scenarioIntensityMultiplier: 1.35,
        volatilityMultiplier: 1.35,
        arbitrageAggression: 1.5,
        panicMultiplier: 1.4,
        trustRecoveryMultiplier: 0.8,
        regulatoryPressureMultiplier: 1.4
      },

      brutal: {
        scenarioFrequencyMultiplier: 2.75,
        scenarioIntensityMultiplier: 1.85,
        volatilityMultiplier: 1.8,
        arbitrageAggression: 2.2,
        panicMultiplier: 2,
        trustRecoveryMultiplier: 0.6,
        regulatoryPressureMultiplier: 2
      },

      historical_chaos: {
        scenarioFrequencyMultiplier: 4,
        scenarioIntensityMultiplier: 2.5,
        volatilityMultiplier: 2.5,
        arbitrageAggression: 3,
        panicMultiplier: 3,
        trustRecoveryMultiplier: 0.4,
        regulatoryPressureMultiplier: 3
      }
    },

    adoptionModes: {
      low: {
        awarenessMultiplier: 0.5,
        trialMultiplier: 0.5,
        stickyAdoptionMultiplier: 0.65,
        speculationMultiplier: 0.65,
        regulatoryAttentionMultiplier: 0.75
      },

      normal: {
        awarenessMultiplier: 1,
        trialMultiplier: 1,
        stickyAdoptionMultiplier: 1,
        speculationMultiplier: 1,
        regulatoryAttentionMultiplier: 1
      },

      high: {
        awarenessMultiplier: 1.8,
        trialMultiplier: 1.8,
        stickyAdoptionMultiplier: 1.35,
        speculationMultiplier: 1.8,
        regulatoryAttentionMultiplier: 1.4
      },

      hyper: {
        awarenessMultiplier: 3,
        trialMultiplier: 3,
        stickyAdoptionMultiplier: 1.8,
        speculationMultiplier: 3.5,
        regulatoryAttentionMultiplier: 2.2
      }
    }
  };
}

function createInitialPolicy() {
  return {
    mono: {
      buyPoint: 0.99,
      sellPoint: 1.01,
      listedSupply: 1_000_000,
      buybackBudgetUsd: 0,
      autoBuybackEnabled: true
    },

    div: {
      buyPoint: 0.99,
      sellPoint: 1.01,
      floor: 0.99,
      topPoint: 1.25,
      listedSupply: 1_000_000,
      buybackBudgetUsd: 0,
      autoBuybackEnabled: false,
      annualGrowthTarget: 0.1
    },

    dividends: {
      enabled: true,
      automationEnabled: false,
      targetAnnualDivDistribution: 0,
      maxDistributionPerTick: 0
    },

    treasury: {
      allocationMode: "balanced",
      preserveStrategicReserves: true,
      minMonoReserve: 30_000_000_000_000,
      minDivReserve: 30_000_000_000_000
    }
  };
}

function createInitialCurrencyAccounts() {
  const currencies = [
    ["USD", "United States", 0.035, 0.025, 0.0, 95, 100, 100],
    ["EUR", "Euro Area", 0.025, 0.02, 0.005, 88, 90, 90],
    ["JPY", "Japan", 0.005, 0.015, 0.005, 90, 80, 85],
    ["GBP", "United Kingdom", 0.035, 0.025, 0.005, 88, 75, 85],
    ["CHF", "Switzerland", 0.01, 0.015, -0.002, 96, 45, 90],
    ["CAD", "Canada", 0.03, 0.02, 0.005, 88, 70, 85],
    ["AUD", "Australia", 0.035, 0.025, 0.006, 86, 65, 82],
    ["NZD", "New Zealand", 0.04, 0.025, 0.008, 84, 35, 78],
    ["SGD", "Singapore", 0.03, 0.02, 0.002, 92, 45, 88],
    ["HKD", "Hong Kong", 0.035, 0.025, 0.003, 76, 45, 78],
    ["NOK", "Norway", 0.035, 0.025, 0.008, 88, 35, 82],
    ["SEK", "Sweden", 0.03, 0.025, 0.008, 86, 45, 82],
    ["DKK", "Denmark", 0.025, 0.02, 0.004, 88, 35, 84],
    ["KRW", "South Korea", 0.035, 0.025, 0.012, 78, 60, 74],
    ["PLN", "Poland", 0.05, 0.035, 0.018, 74, 35, 68],
    ["CZK", "Czech Republic", 0.045, 0.03, 0.015, 76, 25, 68],
    ["ILS", "Israel", 0.035, 0.025, 0.012, 74, 25, 65],
    ["CNY", "China", 0.025, 0.02, 0.015, 55, 95, 40],
    ["INR", "India", 0.065, 0.045, 0.035, 58, 75, 48],
    ["MXN", "Mexico", 0.08, 0.045, 0.035, 56, 45, 50],
    ["BRL", "Brazil", 0.09, 0.055, 0.055, 50, 55, 45],
    ["ZAR", "South Africa", 0.08, 0.05, 0.045, 52, 25, 48],
    ["IDR", "Indonesia", 0.055, 0.035, 0.035, 52, 45, 42],
    ["MYR", "Malaysia", 0.035, 0.025, 0.02, 62, 30, 55],
    ["THB", "Thailand", 0.025, 0.02, 0.018, 62, 30, 55],
    ["PHP", "Philippines", 0.055, 0.04, 0.035, 50, 25, 42],
    ["CLP", "Chile", 0.065, 0.04, 0.035, 58, 20, 48],
    ["COP", "Colombia", 0.085, 0.055, 0.05, 46, 20, 38],
    ["AED", "United Arab Emirates", 0.035, 0.025, 0.003, 72, 35, 65],
    ["SAR", "Saudi Arabia", 0.035, 0.025, 0.004, 70, 45, 62]
  ];

  const accounts = {};

  for (const [
    code,
    region,
    nominalYield,
    inflation,
    expectedFxDecay,
    trustScore,
    depthScore,
    liquidityScore
  ] of currencies) {
    accounts[code] = {
      code,
      region,
      localBalance: code === "USD" ? 1_000_000 : 0,
      usdEquivalent: code === "USD" ? 1_000_000 : 0,
      realUsdEquivalent: code === "USD" ? 1_000_000 : 0,
      nominalYield,
      inflation,
      expectedFxDecay,
      effectiveUsdReturn: nominalYield - expectedFxDecay,
      realReturn: nominalYield - inflation - expectedFxDecay,
      trustScore,
      bankingDepthScore: depthScore,
      gdpDepthScore: depthScore,
      liquidityScore,
      capitalControlPenalty: code === "CNY" ? 35 : 0,
      saturationLevel: 0,
      localM2Share: 0,
      portfolioWeight: code === "USD" ? 1 : 0,
      marginalAllocationScore: 0,
      riskWarning: null
    };
  }

  return accounts;
}

function createPublicState(state) {
  return {
    meta: state.meta,
    runtime: state.runtime,
    defaults: state.defaults,
    policy: state.policy,
    prices: state.prices,
    treasury: state.treasury,
    circulation: state.circulation,
    fiatCurrencies: state.fiatCurrencies,
    market: state.market,
    adoption: state.adoption,
    confidence: state.confidence,
    dividends: state.dividends,
    fiatDisplacement: state.fiatDisplacement,
    scenarios: {
      active: state.scenarios.active,
      history: state.scenarios.history.slice(-50),
      currentRegime: state.scenarios.currentRegime,
      scenarioPressure: state.scenarios.scenarioPressure,
      aftershockPressure: state.scenarios.aftershockPressure,
      clusteringPressure: state.scenarios.clusteringPressure
    },
    warnings: state.warnings,
    explanations: {
      latest: state.explanations.latest,
      history: state.explanations.history.slice(-50)
    },
    charts: state.charts,
    journal: state.journal
  };
}

function cloneState(state) {
  return structuredCloneSafe(state);
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createInitialState,
  createPublicState,
  cloneState
};
