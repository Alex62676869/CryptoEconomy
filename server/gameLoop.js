"use strict";

const EventEmitter = require("events");

const {
  createInitialState,
  createPublicState,
  cloneState
} = require("./state");

const {
  runScenarioShockEngine
} = require("./engines/scenarioShockEngine");

const {
  runTreasuryFiatAllocationEngine
} = require("./engines/treasuryFiatAllocationEngine");

const {
  runConfidenceTrustEngine
} = require("./engines/confidenceTrustEngine");

const {
  runDemandAdoptionEngine
} = require("./engines/demandAdoptionEngine");

const {
  runTreasuryExecutionEngine
} = require("./engines/treasuryExecutionEngine");

const {
  runPriceMarketEngine
} = require("./engines/priceMarketEngine");

const {
  runFiatDisplacementEngine
} = require("./engines/fiatDisplacementEngine");

const {
  runInvariantEngine,
  validatePlayerPolicyPatch,
  validateDefaultsPatch
} = require("./engines/invariantEngine");

const {
  runExplanationEngine
} = require("./engines/explanationEngine");

function createGameLoop(options = {}) {
  const tickMs = Number(options.tickMs || 1000);
  const emitter = new EventEmitter();

  let state = createInitialState();
  let interval = null;
  let lastTickAt = Date.now();

  function start() {
    if (interval) return;

    lastTickAt = Date.now();

    interval = setInterval(() => {
      try {
        tick();
      } catch (error) {
        console.error("Game loop tick failed:", error);
      }
    }, tickMs);

    interval.unref?.();
  }

  function stop() {
    if (!interval) return;

    clearInterval(interval);
    interval = null;
  }

  function reset() {
    state = createInitialState();
    lastTickAt = Date.now();

    broadcast();

    return {
      ok: true,
      state: getPublicState()
    };
  }

  function tick() {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - lastTickAt);
    lastTickAt = now;

    const offlineMode = state.defaults.offlineSimulation.mode;

    if (offlineMode === "paused" && !state.runtime.isPlayerOnline) {
      return;
    }

    const tickCount = calculateTickCount({
      elapsedMs,
      tickMs,
      offlineMode,
      maxCatchupTicks: state.defaults.offlineSimulation.maxCatchupTicks
    });

    if (tickCount <= 0) return;

    for (let i = 0; i < tickCount; i += 1) {
      state = runSingleEconomicTick({
        state,
        tickMs,
        isCatchup: tickCount > 1
      });
    }

    broadcast();
  }

  function runSingleEconomicTick({ state: inputState, tickMs, isCatchup }) {
    let nextState = cloneState(inputState);

    const tickContext = {
      tickMs,
      simulatedDays: tickMsToSimulatedDays(tickMs, nextState.defaults.tickSpeed.simulatedDaysPerTick),
      isCatchup,
      now: Date.now()
    };

    nextState.runtime.tick += 1;
    nextState.runtime.lastTickAt = tickContext.now;
    nextState.runtime.simulatedDay += tickContext.simulatedDays;

    /*
      Economic loop:

      1. Validate hard rules
      2. Update macro/scenario state
      3. Update fiat reserves
      4. Calculate pre-demand confidence
      5. Calculate demand and adoption
      6. Execute treasury policy
      7. Move market prices
      8. Recalculate trust after execution
      9. Update fiat displacement
      10. Check invariants again
      11. Generate explanations
    */

    nextState = runInvariantEngine(nextState, {
      phase: "pre_tick",
      tickContext
    });

    nextState = runScenarioShockEngine(nextState, {
      tickContext
    });

    nextState = runTreasuryFiatAllocationEngine(nextState, {
      tickContext
    });

    nextState = runConfidenceTrustEngine(nextState, {
      phase: "pre_execution",
      tickContext
    });

    nextState = runDemandAdoptionEngine(nextState, {
      tickContext
    });

    nextState = runTreasuryExecutionEngine(nextState, {
      tickContext
    });

    nextState = runPriceMarketEngine(nextState, {
      tickContext
    });

    nextState = runConfidenceTrustEngine(nextState, {
      phase: "post_execution",
      tickContext
    });

    nextState = runFiatDisplacementEngine(nextState, {
      tickContext
    });

    nextState = runInvariantEngine(nextState, {
      phase: "post_tick",
      tickContext
    });

    nextState = runExplanationEngine(nextState, {
      tickContext
    });

    trimHistory(nextState);

    return nextState;
  }

  function applyPlayerPolicy(policyPatch) {
    const validation = validatePlayerPolicyPatch(policyPatch, state);

    if (!validation.ok) {
      return validation;
    }

    state.policy = {
      ...state.policy,
      ...validation.patch
    };

    state.runtime.lastPlayerActionAt = Date.now();

    state.explanations.latest.push({
      type: "policy",
      severity: "info",
      message: "Player policy settings were updated."
    });

    broadcast();

    return {
      ok: true,
      policy: state.policy,
      state: getPublicState()
    };
  }

  function applyDefaults(defaultsPatch) {
    const validation = validateDefaultsPatch(defaultsPatch, state);

    if (!validation.ok) {
      return validation;
    }

    state.defaults = mergeDeep(state.defaults, validation.patch);

    state.runtime.lastDefaultsUpdateAt = Date.now();

    state.explanations.latest.push({
      type: "defaults",
      severity: "info",
      message: "Simulation defaults were updated."
    });

    broadcast();

    return {
      ok: true,
      defaults: state.defaults,
      state: getPublicState()
    };
  }

  function setPlayerOnline(isOnline) {
    state.runtime.isPlayerOnline = Boolean(isOnline);
    state.runtime.lastConnectionChangeAt = Date.now();
  }

  function getPublicState() {
    return createPublicState(state);
  }

  function getInternalState() {
    return cloneState(state);
  }

  function onBroadcast(listener) {
    emitter.on("broadcast", listener);

    return () => {
      emitter.off("broadcast", listener);
    };
  }

  function broadcast() {
    const publicState = getPublicState();
    emitter.emit("broadcast", publicState);
  }

  return {
    start,
    stop,
    reset,
    tick,
    applyPlayerPolicy,
    applyDefaults,
    setPlayerOnline,
    getPublicState,
    getInternalState,
    onBroadcast
  };
}

function calculateTickCount({ elapsedMs, tickMs, offlineMode, maxCatchupTicks }) {
  if (elapsedMs <= 0) return 0;

  if (offlineMode === "paused") {
    return 1;
  }

  const rawTicks = Math.max(1, Math.floor(elapsedMs / tickMs));

  if (offlineMode === "capped") {
    return Math.min(rawTicks, Number(maxCatchupTicks || 100));
  }

  if (offlineMode === "unlimited") {
    return Math.min(rawTicks, Number(maxCatchupTicks || 10_000));
  }

  return 1;
}

function tickMsToSimulatedDays(tickMs, simulatedDaysPerTick) {
  const value = Number(simulatedDaysPerTick);

  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  /*
    Default:
    one server tick = one simulated day.

    This can later be changed from /defaults.
  */
  return Math.max(1, tickMs / 1000);
}

function trimHistory(state) {
  const maxScenarioHistory = 500;
  const maxEventHistory = 500;
  const maxExplanationHistory = 200;
  const maxChartPoints = 2_000;

  if (Array.isArray(state.scenarios.history)) {
    state.scenarios.history = state.scenarios.history.slice(-maxScenarioHistory);
  }

  if (Array.isArray(state.history.events)) {
    state.history.events = state.history.events.slice(-maxEventHistory);
  }

  if (Array.isArray(state.explanations.history)) {
    state.explanations.history = state.explanations.history.slice(-maxExplanationHistory);
  }

  for (const key of Object.keys(state.charts || {})) {
    if (Array.isArray(state.charts[key])) {
      state.charts[key] = state.charts[key].slice(-maxChartPoints);
    }
  }
}

function mergeDeep(target, patch) {
  if (!patch || typeof patch !== "object") {
    return target;
  }

  const output = Array.isArray(target) ? [...target] : { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      output[key] = mergeDeep(target[key], value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

module.exports = {
  createGameLoop
};
