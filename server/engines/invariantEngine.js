"use strict";

const VALID_DIFFICULTIES = new Set([
  "sandbox",
  "normal",
  "hard",
  "brutal",
  "historical_chaos"
]);

const VALID_ADOPTION_MODES = new Set([
  "low",
  "normal",
  "high",
  "hyper"
]);

const VALID_MODEL_PRESETS = new Set([
  "balanced_realism",
  "market_heavy_realism",
  "macro_heavy_realism",
  "sandbox_debug"
]);

const VALID_OFFLINE_MODES = new Set([
  "unlimited",
  "capped",
  "paused"
]);

const VALID_TREASURY_ALLOCATION_MODES = new Set([
  "balanced",
  "safety_first",
  "yield_seeking",
  "liquidity_first"
]);

function runInvariantEngine(state, context = {}) {
  const phase = context.phase || "unknown";

  const warnings = [];

  clampCoreBalances(state, warnings);
  enforcePolicyRules(state, warnings);
  updatePolicyDerivedValues(state);
  updateInventoryZones(state, warnings);
  updateTreasuryControlScore(state);
  updateCirculationUsdValues(state);
  updateMeta(state);

  if (warnings.length > 0) {
    state.warnings = dedupeWarnings([
      ...(state.warnings || []),
      ...warnings
    ]);

    state.history.events.push({
      tick: state.runtime.tick,
      type: "invariant_warning",
      phase,
      messages: warnings.map((warning) => warning.message),
      createdAt: Date.now()
    });
  }

  return state;
}

function validatePlayerPolicyPatch(policyPatch, state) {
  if (!policyPatch || typeof policyPatch !== "object" || Array.isArray(policyPatch)) {
    return {
      ok: false,
      error: "Policy patch must be an object."
    };
  }

  const patch = {};

  if (policyPatch.mono !== undefined) {
    const result = validateAssetPolicyPatch({
      assetName: "mono",
      patch: policyPatch.mono,
      current: state.policy.mono
    });

    if (!result.ok) return result;
    patch.mono = result.patch;
  }

  if (policyPatch.div !== undefined) {
    const result = validateDivPolicyPatch({
      patch: policyPatch.div,
      current: state.policy.div
    });

    if (!result.ok) return result;
    patch.div = result.patch;
  }

  if (policyPatch.dividends !== undefined) {
    const result = validateDividendPolicyPatch(policyPatch.dividends);

    if (!result.ok) return result;
    patch.dividends = result.patch;
  }

  if (policyPatch.treasury !== undefined) {
    const result = validateTreasuryPolicyPatch(policyPatch.treasury);

    if (!result.ok) return result;
    patch.treasury = result.patch;
  }

  return {
    ok: true,
    patch
  };
}

function validateDefaultsPatch(defaultsPatch) {
  if (!defaultsPatch || typeof defaultsPatch !== "object" || Array.isArray(defaultsPatch)) {
    return {
      ok: false,
      error: "Defaults patch must be an object."
    };
  }

  const patch = {};

  if (defaultsPatch.difficulty !== undefined) {
    if (!VALID_DIFFICULTIES.has(defaultsPatch.difficulty)) {
      return {
        ok: false,
        error: `Invalid difficulty: ${String(defaultsPatch.difficulty)}`
      };
    }

    patch.difficulty = defaultsPatch.difficulty;
  }

  if (defaultsPatch.adoptionMode !== undefined) {
    if (!VALID_ADOPTION_MODES.has(defaultsPatch.adoptionMode)) {
      return {
        ok: false,
        error: `Invalid adoption mode: ${String(defaultsPatch.adoptionMode)}`
      };
    }

    patch.adoptionMode = defaultsPatch.adoptionMode;
  }

  if (defaultsPatch.modelPreset !== undefined) {
    if (!VALID_MODEL_PRESETS.has(defaultsPatch.modelPreset)) {
      return {
        ok: false,
        error: `Invalid model preset: ${String(defaultsPatch.modelPreset)}`
      };
    }

    patch.modelPreset = defaultsPatch.modelPreset;
  }

  if (defaultsPatch.treasuryFiatCapUsd !== undefined) {
    const value = toFiniteNumber(defaultsPatch.treasuryFiatCapUsd);

    if (value === null || value <= 0) {
      return {
        ok: false,
        error: "Treasury fiat cap must be a positive number."
      };
    }

    patch.treasuryFiatCapUsd = value;
  }

  if (defaultsPatch.offlineSimulation !== undefined) {
    const result = validateOfflineSimulationPatch(defaultsPatch.offlineSimulation);

    if (!result.ok) return result;
    patch.offlineSimulation = result.patch;
  }

  if (defaultsPatch.tickSpeed !== undefined) {
    const result = validateTickSpeedPatch(defaultsPatch.tickSpeed);

    if (!result.ok) return result;
    patch.tickSpeed = result.patch;
  }

  if (defaultsPatch.scenarios !== undefined) {
    const result = validateScenarioDefaultsPatch(defaultsPatch.scenarios);

    if (!result.ok) return result;
    patch.scenarios = result.patch;
  }

  return {
    ok: true,
    patch
  };
}

function validateAssetPolicyPatch({ assetName, patch, current }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      ok: false,
      error: `${assetName} policy patch must be an object.`
    };
  }

  const output = {};

  if (patch.buyPoint !== undefined) {
    const value = toFiniteNumber(patch.buyPoint);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: `${assetName} buy point must be a non-negative number.`
      };
    }

    output.buyPoint = value;
  }

  if (patch.sellPoint !== undefined) {
    const value = toFiniteNumber(patch.sellPoint);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: `${assetName} sell point must be a non-negative number.`
      };
    }

    output.sellPoint = value;
  }

  const nextBuy = output.buyPoint ?? current.buyPoint;
  const nextSell = output.sellPoint ?? current.sellPoint;

  if (nextBuy > nextSell) {
    return {
      ok: false,
      error: `${assetName} buy point cannot be higher than sell point.`
    };
  }

  if (patch.listedSupply !== undefined) {
    const value = toFiniteNumber(patch.listedSupply);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: `${assetName} listed supply must be a non-negative number.`
      };
    }

    output.listedSupply = value;
  }

  if (patch.buybackBudgetUsd !== undefined) {
    const value = toFiniteNumber(patch.buybackBudgetUsd);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: `${assetName} buyback budget must be a non-negative number.`
      };
    }

    output.buybackBudgetUsd = value;
  }

  if (patch.autoBuybackEnabled !== undefined) {
    output.autoBuybackEnabled = Boolean(patch.autoBuybackEnabled);
  }

  return {
    ok: true,
    patch: output
  };
}

function validateDivPolicyPatch({ patch, current }) {
  const base = validateAssetPolicyPatch({
    assetName: "div",
    patch,
    current
  });

  if (!base.ok) return base;

  const output = { ...base.patch };

  if (patch.floor !== undefined) {
    const value = toFiniteNumber(patch.floor);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "DIV floor must be a non-negative number."
      };
    }

    output.floor = value;
  }

  if (patch.topPoint !== undefined) {
    const value = toFiniteNumber(patch.topPoint);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "DIV top point must be a non-negative number."
      };
    }

    output.topPoint = value;
  }

  const nextFloor = output.floor ?? current.floor;
  const nextTopPoint = output.topPoint ?? current.topPoint;

  if (nextFloor > nextTopPoint) {
    return {
      ok: false,
      error: "DIV floor cannot be higher than DIV top point."
    };
  }

  if (patch.annualGrowthTarget !== undefined) {
    const value = toFiniteNumber(patch.annualGrowthTarget);

    if (value === null || value < -0.99 || value > 10) {
      return {
        ok: false,
        error: "DIV annual growth target must be between -99% and 1000%."
      };
    }

    output.annualGrowthTarget = value;
  }

  return {
    ok: true,
    patch: output
  };
}

function validateDividendPolicyPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      ok: false,
      error: "Dividend policy patch must be an object."
    };
  }

  const output = {};

  if (patch.enabled !== undefined) {
    output.enabled = Boolean(patch.enabled);
  }

  if (patch.automationEnabled !== undefined) {
    output.automationEnabled = Boolean(patch.automationEnabled);
  }

  if (patch.targetAnnualDivDistribution !== undefined) {
    const value = toFiniteNumber(patch.targetAnnualDivDistribution);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "Target annual DIV distribution must be a non-negative number."
      };
    }

    output.targetAnnualDivDistribution = value;
  }

  if (patch.maxDistributionPerTick !== undefined) {
    const value = toFiniteNumber(patch.maxDistributionPerTick);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "Max distribution per tick must be a non-negative number."
      };
    }

    output.maxDistributionPerTick = value;
  }

  return {
    ok: true,
    patch: output
  };
}

function validateTreasuryPolicyPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      ok: false,
      error: "Treasury policy patch must be an object."
    };
  }

  const output = {};

  if (patch.allocationMode !== undefined) {
    if (!VALID_TREASURY_ALLOCATION_MODES.has(patch.allocationMode)) {
      return {
        ok: false,
        error: `Invalid treasury allocation mode: ${String(patch.allocationMode)}`
      };
    }

    output.allocationMode = patch.allocationMode;
  }

  if (patch.preserveStrategicReserves !== undefined) {
    output.preserveStrategicReserves = Boolean(patch.preserveStrategicReserves);
  }

  if (patch.minMonoReserve !== undefined) {
    const value = toFiniteNumber(patch.minMonoReserve);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "Minimum Mono reserve must be a non-negative number."
      };
    }

    output.minMonoReserve = value;
  }

  if (patch.minDivReserve !== undefined) {
    const value = toFiniteNumber(patch.minDivReserve);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "Minimum DIV reserve must be a non-negative number."
      };
    }

    output.minDivReserve = value;
  }

  return {
    ok: true,
    patch: output
  };
}

function validateOfflineSimulationPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      ok: false,
      error: "Offline simulation patch must be an object."
    };
  }

  const output = {};

  if (patch.mode !== undefined) {
    if (!VALID_OFFLINE_MODES.has(patch.mode)) {
      return {
        ok: false,
        error: `Invalid offline simulation mode: ${String(patch.mode)}`
      };
    }

    output.mode = patch.mode;
  }

  if (patch.maxCatchupTicks !== undefined) {
    const value = toFiniteNumber(patch.maxCatchupTicks);

    if (value === null || value < 0) {
      return {
        ok: false,
        error: "Max catch-up ticks must be a non-negative number."
      };
    }

    output.maxCatchupTicks = Math.floor(value);
  }

  return {
    ok: true,
    patch: output
  };
}

function validateTickSpeedPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      ok: false,
      error: "Tick speed patch must be an object."
    };
  }

  const output = {};

  if (patch.tickMs !== undefined) {
    const value = toFiniteNumber(patch.tickMs);

    if (value === null || value < 100) {
      return {
        ok: false,
        error: "Tick interval must be at least 100ms."
      };
    }

    output.tickMs = Math.floor(value);
  }

  if (patch.simulatedDaysPerTick !== undefined) {
    const value = toFiniteNumber(patch.simulatedDaysPerTick);

    if (value === null || value <= 0) {
      return {
        ok: false,
        error: "Simulated days per tick must be a positive number."
      };
    }

    output.simulatedDaysPerTick = value;
  }

  return {
    ok: true,
    patch: output
  };
}

function validateScenarioDefaultsPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {
      ok: false,
      error: "Scenario defaults patch must be an object."
    };
  }

  const output = {};

  if (patch.frequency !== undefined) {
    if (!["low", "normal", "high"].includes(patch.frequency)) {
      return {
        ok: false,
        error: "Scenario frequency must be low, normal, or high."
      };
    }

    output.frequency = patch.frequency;
  }

  if (patch.intensity !== undefined) {
    if (!["low", "normal", "high"].includes(patch.intensity)) {
      return {
        ok: false,
        error: "Scenario intensity must be low, normal, or high."
      };
    }

    output.intensity = patch.intensity;
  }

  return {
    ok: true,
    patch: output
  };
}

function clampCoreBalances(state, warnings) {
  clampPath(state, ["treasury", "fiat", "totalUsdNominal"], 0, warnings);
  clampPath(state, ["treasury", "fiat", "totalUsdReal"], 0, warnings);
  clampPath(state, ["treasury", "fiat", "liquidSupportUsd"], 0, warnings);

  clampPath(state, ["treasury", "mono", "balance"], 0, warnings);
  clampPath(state, ["treasury", "div", "balance"], 0, warnings);

  clampPath(state, ["circulation", "mono", "supply"], 0, warnings);
  clampPath(state, ["circulation", "div", "supply"], 0, warnings);

  clampPath(state, ["prices", "mono", "market"], 0.000001, warnings);
  clampPath(state, ["prices", "div", "market"], 0.000001, warnings);
  clampPath(state, ["prices", "mono", "fundamental"], 0.000001, warnings);
  clampPath(state, ["prices", "div", "fundamental"], 0.000001, warnings);
}

function enforcePolicyRules(state, warnings) {
  for (const asset of ["mono", "div"]) {
    const policy = state.policy[asset];

    if (policy.buyPoint > policy.sellPoint) {
      const midpoint = (policy.buyPoint + policy.sellPoint) / 2;
      policy.buyPoint = midpoint;
      policy.sellPoint = midpoint;

      warnings.push(createWarning({
        code: `${asset}_spread_invalid`,
        severity: "high",
        message: `${asset.toUpperCase()} buy point exceeded sell point. Spread was repaired.`
      }));
    }

    policy.buyPoint = Math.max(0, policy.buyPoint);
    policy.sellPoint = Math.max(0, policy.sellPoint);
    policy.listedSupply = Math.max(0, policy.listedSupply);
    policy.buybackBudgetUsd = Math.max(0, policy.buybackBudgetUsd);
  }

  if (state.policy.div.floor > state.policy.div.topPoint) {
    state.policy.div.floor = state.policy.div.topPoint;

    warnings.push(createWarning({
      code: "div_floor_above_top_point",
      severity: "high",
      message: "DIV floor exceeded DIV top point. Floor was repaired."
    }));
  }

  state.policy.div.floor = Math.max(0, state.policy.div.floor);
  state.policy.div.topPoint = Math.max(0, state.policy.div.topPoint);

  state.policy.dividends.targetAnnualDivDistribution = Math.max(
    0,
    state.policy.dividends.targetAnnualDivDistribution
  );

  state.policy.dividends.maxDistributionPerTick = Math.max(
    0,
    state.policy.dividends.maxDistributionPerTick
  );
}

function updatePolicyDerivedValues(state) {
  state.prices.mono.policyMidpoint =
    (state.policy.mono.buyPoint + state.policy.mono.sellPoint) / 2;

  state.prices.div.policyMidpoint =
    (state.policy.div.buyPoint + state.policy.div.sellPoint) / 2;
}

function updateInventoryZones(state, warnings) {
  updateSingleInventoryZone({
    state,
    asset: "mono",
    warnings
  });

  updateSingleInventoryZone({
    state,
    asset: "div",
    warnings
  });
}

function updateSingleInventoryZone({ state, asset, warnings }) {
  const inventory = state.treasury[asset];
  const balance = Number(inventory.balance || 0);
  const target = Number(inventory.strategicReserveTarget || 30_000_000_000_000);
  const trillion = 1_000_000_000_000;

  let zone;
  let controlScore;

  if (balance >= 70 * trillion) {
    zone = "excellent";
    controlScore = 100;
  } else if (balance >= 50 * trillion) {
    zone = "strong";
    controlScore = 85;
  } else if (balance >= 30 * trillion) {
    zone = "weakening";
    controlScore = 65;
  } else if (balance >= 10 * trillion) {
    zone = "danger";
    controlScore = 35;
  } else if (balance > 0) {
    zone = "critical";
    controlScore = 10;
  } else {
    zone = "lost_sell_side_control";
    controlScore = 0;
  }

  inventory.inventoryZone = zone;
  inventory.controlScore = controlScore;

  if (balance < target) {
    warnings.push(createWarning({
      code: `${asset}_below_strategic_reserve`,
      severity: balance <= 10 * trillion ? "critical" : "high",
      message: `${asset.toUpperCase()} treasury inventory is below the strategic reserve target.`
    }));
  }
}

function updateTreasuryControlScore(state) {
  const monoScore = state.treasury.mono.controlScore;
  const divScore = state.treasury.div.controlScore;
  const fiatScore = clamp(state.treasury.fiat.fiatUsefulnessScore, 0, 100);
  const supportScore = clamp(state.treasury.supportCapacityScore, 0, 100);
  const executionScore = clamp(state.treasury.executionQuality, 0, 100);

  state.treasury.controlScore = clamp(
    monoScore * 0.25 +
      divScore * 0.25 +
      fiatScore * 0.2 +
      supportScore * 0.15 +
      executionScore * 0.15,
    0,
    100
  );
}

function updateCirculationUsdValues(state) {
  state.circulation.mono.usdValue =
    state.circulation.mono.supply * state.prices.mono.market;

  state.circulation.div.usdValue =
    state.circulation.div.supply * state.prices.div.market;
}

function updateMeta(state) {
  state.meta.updatedAt = Date.now();
}

function clampPath(state, path, min, warnings) {
  let target = state;

  for (let i = 0; i < path.length - 1; i += 1) {
    target = target[path[i]];
  }

  const key = path[path.length - 1];
  const value = Number(target[key]);

  if (!Number.isFinite(value) || value < min) {
    target[key] = min;

    warnings.push(createWarning({
      code: `clamped_${path.join("_")}`,
      severity: "medium",
      message: `Invariant repaired ${path.join(".")} to minimum value ${min}.`
    }));
  }
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

  for (const warning of warnings.slice(-100)) {
    const key = warning.code;

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(warning);
  }

  return output;
}

function toFiniteNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

module.exports = {
  runInvariantEngine,
  validatePlayerPolicyPatch,
  validateDefaultsPatch
};
