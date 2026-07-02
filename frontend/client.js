"use strict";

(function attachClient() {
  const WS_RECONNECT_MS = 1400;
  const API_STATE_POLL_MS = 5000;

  const app = {
    ws: null,
    reconnectTimer: null,
    pollTimer: null,
    latestState: null,
    hasReceivedState: false
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    setupMoreMenu();
    setupForms();

    if (window.MonoDivCharts) {
      window.MonoDivCharts.initCharts();
    }

    connectWebSocket();
    fetchInitialState();
  });

  function cacheElements() {
    const ids = [
      "connectionStatus",

      "monoMarketPrice",
      "monoPolicyMidpoint",
      "monoBuyPoint",
      "monoSellPoint",
      "monoLiquidity",

      "divMarketPrice",
      "divPolicyMidpoint",
      "divFloor",
      "divTopPoint",
      "divOverheating",

      "treasuryFiat",
      "treasuryRealFiat",
      "treasuryControlScore",
      "treasuryMono",
      "treasuryDiv",

      "systemicTrust",
      "trustRegime",
      "runRisk",
      "panicRisk",
      "trustTrend",

      "monoBuyInput",
      "monoSellInput",
      "monoListedSupplyInput",
      "monoBuybackBudgetInput",
      "monoAutoBuybackInput",

      "divBuyInput",
      "divSellInput",
      "divFloorInput",
      "divTopPointInput",
      "divListedSupplyInput",
      "divGrowthTargetInput",

      "dividendsEnabledInput",
      "dividendAutomationInput",
      "targetAnnualDivDistributionInput",
      "maxDistributionPerTickInput",

      "dividendExpectation",
      "dividendSustainability",

      "circulatingMono",
      "circulatingDiv",
      "monoAdoptionQuality",
      "divAdoptionQuality",
      "fiatDisplacement",
      "fiatStage",

      "warningList",
      "explanationList",
      "scenarioList",

      "moreMenuButton",
      "moreMenuPanel"
    ];

    for (const id of ids) {
      elements[id] = document.getElementById(id);
    }
  }

  function connectWebSocket() {
    clearTimeout(app.reconnectTimer);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    setConnectionStatus("connecting", "Connecting");

    try {
      app.ws = new WebSocket(url);
    } catch (error) {
      console.error("WebSocket creation failed:", error);
      scheduleReconnect();
      return;
    }

    app.ws.addEventListener("open", () => {
      setConnectionStatus("online", "Live");
      sendWebSocketMessage({
        type: "get_state"
      });
    });

    app.ws.addEventListener("message", (event) => {
      handleWebSocketMessage(event);
    });

    app.ws.addEventListener("close", () => {
      setConnectionStatus("offline", "Offline");
      scheduleReconnect();
      startApiPolling();
    });

    app.ws.addEventListener("error", () => {
      setConnectionStatus("offline", "Connection issue");
    });
  }

  function scheduleReconnect() {
    clearTimeout(app.reconnectTimer);

    app.reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, WS_RECONNECT_MS);
  }

  function startApiPolling() {
    clearInterval(app.pollTimer);

    app.pollTimer = setInterval(() => {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) {
        clearInterval(app.pollTimer);
        return;
      }

      fetchInitialState();
    }, API_STATE_POLL_MS);
  }

  async function fetchInitialState() {
    try {
      const response = await fetch("/api/state", {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`State request failed with ${response.status}`);
      }

      const state = await response.json();
      receiveState(state);
    } catch (error) {
      console.warn("Could not fetch initial state:", error.message);
    }
  }

  function handleWebSocketMessage(event) {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.warn("Invalid WebSocket message:", event.data);
      return;
    }

    if (message.type === "state") {
      receiveState(message.payload || message.state || message);
      return;
    }

    if (message.type === "pong") {
      return;
    }

    if (message.type === "error") {
      console.warn("Server error:", message.message || message);
    }
  }

  function receiveState(state) {
    if (!state || typeof state !== "object") {
      return;
    }

    app.latestState = state;
    app.hasReceivedState = true;

    renderState(state);

    if (window.MonoDivCharts) {
      window.MonoDivCharts.updatePriceChart(state);
      window.MonoDivCharts.updateGauge({
        element: document.querySelector(".gauge"),
        value: state?.confidence?.systemicTrust || 0
      });
    }
  }

  function renderState(state) {
    renderMarketCards(state);
    renderTreasury(state);
    renderConfidence(state);
    renderPolicyInputs(state);
    renderDividends(state);
    renderEconomyState(state);
    renderWarnings(state);
    renderExplanations(state);
    renderScenarios(state);
  }

  function renderMarketCards(state) {
    setText(elements.monoMarketPrice, formatUsd(state?.prices?.mono?.market, 4));
    setText(elements.monoPolicyMidpoint, formatUsd(state?.prices?.mono?.policyMidpoint, 4));
    setText(elements.monoBuyPoint, formatUsd(state?.policy?.mono?.buyPoint, 4));
    setText(elements.monoSellPoint, formatUsd(state?.policy?.mono?.sellPoint, 4));
    setText(elements.monoLiquidity, formatScore(state?.market?.mono?.liquidity));

    setText(elements.divMarketPrice, formatUsd(state?.prices?.div?.market, 4));
    setText(elements.divPolicyMidpoint, formatUsd(state?.prices?.div?.policyMidpoint, 4));
    setText(elements.divFloor, formatUsd(state?.policy?.div?.floor, 4));
    setText(elements.divTopPoint, formatUsd(state?.policy?.div?.topPoint, 4));
    setText(elements.divOverheating, formatScore(state?.prices?.div?.overheatingScore));

    markPriceDirection({
      element: elements.monoMarketPrice,
      current: state?.prices?.mono?.market,
      previous: state?.prices?.mono?.previousMarket
    });

    markPriceDirection({
      element: elements.divMarketPrice,
      current: state?.prices?.div?.market,
      previous: state?.prices?.div?.previousMarket
    });
  }

  function renderTreasury(state) {
    setText(elements.treasuryFiat, formatUsdCompact(state?.treasury?.fiat?.totalUsdNominal));
    setText(elements.treasuryRealFiat, formatUsdCompact(state?.treasury?.fiat?.totalUsdReal));
    setText(elements.treasuryControlScore, formatScore(state?.treasury?.controlScore));
    setText(elements.treasuryMono, formatCoins(state?.treasury?.mono?.balance));
    setText(elements.treasuryDiv, formatCoins(state?.treasury?.div?.balance));

    applyScoreClass(elements.treasuryControlScore, state?.treasury?.controlScore);
  }

  function renderConfidence(state) {
    const confidence = state?.confidence || {};

    setText(elements.systemicTrust, formatNumber(confidence.systemicTrust, 0));
    setText(elements.trustRegime, formatLabel(confidence.trustRegime || "normal"));
    setText(elements.runRisk, formatPercent(confidence.runRisk));
    setText(elements.panicRisk, formatPercent(confidence.panicRisk));
    setText(elements.trustTrend, formatLabel(confidence.trend || "stable"));

    applyScoreClass(elements.systemicTrust, confidence.systemicTrust);
  }

  function renderPolicyInputs(state) {
    const mono = state?.policy?.mono || {};
    const div = state?.policy?.div || {};
    const dividends = state?.policy?.dividends || {};

    setInputValue(elements.monoBuyInput, mono.buyPoint);
    setInputValue(elements.monoSellInput, mono.sellPoint);
    setInputValue(elements.monoListedSupplyInput, mono.listedSupply);
    setInputValue(elements.monoBuybackBudgetInput, mono.buybackBudgetUsd);
    setCheckboxValue(elements.monoAutoBuybackInput, mono.autoBuybackEnabled);

    setInputValue(elements.divBuyInput, div.buyPoint);
    setInputValue(elements.divSellInput, div.sellPoint);
    setInputValue(elements.divFloorInput, div.floor);
    setInputValue(elements.divTopPointInput, div.topPoint);
    setInputValue(elements.divListedSupplyInput, div.listedSupply);
    setInputValue(elements.divGrowthTargetInput, div.annualGrowthTarget);

    setCheckboxValue(elements.dividendsEnabledInput, dividends.enabled);
    setCheckboxValue(elements.dividendAutomationInput, dividends.automationEnabled);
    setInputValue(elements.targetAnnualDivDistributionInput, dividends.targetAnnualDivDistribution);
    setInputValue(elements.maxDistributionPerTickInput, dividends.maxDistributionPerTick);
  }

  function renderDividends(state) {
    setText(elements.dividendExpectation, formatScore(state?.dividends?.expectationScore));
    setText(elements.dividendSustainability, formatScore(state?.dividends?.sustainabilityScore));

    applyScoreClass(elements.dividendSustainability, state?.dividends?.sustainabilityScore);
  }

  function renderEconomyState(state) {
    setText(elements.circulatingMono, formatCoins(state?.circulation?.mono?.supply));
    setText(elements.circulatingDiv, formatCoins(state?.circulation?.div?.supply));
    setText(elements.monoAdoptionQuality, formatScore(state?.adoption?.mono?.adoptionQuality));
    setText(elements.divAdoptionQuality, formatScore(state?.adoption?.div?.adoptionQuality));
    setText(elements.fiatDisplacement, formatScore(state?.fiatDisplacement?.index));
    setText(elements.fiatStage, formatLabel(state?.fiatDisplacement?.stage || "fiat_dominant"));

    applyScoreClass(elements.monoAdoptionQuality, state?.adoption?.mono?.adoptionQuality);
    applyScoreClass(elements.divAdoptionQuality, state?.adoption?.div?.adoptionQuality);
    applyScoreClass(elements.fiatDisplacement, state?.fiatDisplacement?.index);
  }

  function renderWarnings(state) {
    const warnings = Array.isArray(state?.warnings) ? state.warnings.slice(-8).reverse() : [];

    renderMessageList({
      element: elements.warningList,
      items: warnings,
      emptyText: "No warnings yet.",
      getMeta: (warning) => `${warning.severity || "info"} · ${warning.code || "warning"}`,
      getMessage: (warning) => warning.message || "Warning",
      getSeverity: (warning) => warning.severity || "info"
    });
  }

  function renderExplanations(state) {
    const explanations = Array.isArray(state?.explanations?.latest)
      ? state.explanations.latest.slice(0, 10)
      : [];

    renderMessageList({
      element: elements.explanationList,
      items: explanations,
      emptyText: "Waiting for server explanations.",
      getMeta: (explanation) => `${explanation.severity || "info"} · ${explanation.type || "economy"}`,
      getMessage: (explanation) => explanation.message || "The economy changed.",
      getSeverity: (explanation) => explanation.severity || "info"
    });
  }

  function renderScenarios(state) {
    const scenarios = Array.isArray(state?.scenarios?.active)
      ? state.scenarios.active.slice(0, 8)
      : [];

    renderMessageList({
      element: elements.scenarioList,
      items: scenarios,
      emptyText: "No active scenarios.",
      getMeta: (scenario) => {
        const remaining = Number(scenario.remainingDays || 0);
        return `${scenario.severity || "info"} · ${formatNumber(remaining, 0)} days left`;
      },
      getMessage: (scenario) => scenario.explanation || scenario.name || "Active scenario",
      getSeverity: (scenario) => normalizeScenarioSeverity(scenario.severity)
    });
  }

  function renderMessageList({
    element,
    items,
    emptyText,
    getMeta,
    getMessage,
    getSeverity
  }) {
    if (!element) {
      return;
    }

    element.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      element.appendChild(empty);
      return;
    }

    for (const item of items) {
      const card = document.createElement("article");
      const severity = normalizeSeverity(getSeverity(item));

      card.className = `message-card message-card--${severity}`;

      const meta = document.createElement("div");
      meta.className = "message-card__meta";
      meta.textContent = getMeta(item);

      const message = document.createElement("p");
      message.textContent = getMessage(item);

      card.appendChild(meta);
      card.appendChild(message);
      element.appendChild(card);
    }
  }

  function setupForms() {
    setupMonoPolicyForm();
    setupDivPolicyForm();
    setupDividendPolicyForm();
  }

  function setupMonoPolicyForm() {
    const form = document.getElementById("monoPolicyForm");

    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const patch = {
        mono: {
          buyPoint: readNumber(elements.monoBuyInput),
          sellPoint: readNumber(elements.monoSellInput),
          listedSupply: readNumber(elements.monoListedSupplyInput),
          buybackBudgetUsd: readNumber(elements.monoBuybackBudgetInput),
          autoBuybackEnabled: Boolean(elements.monoAutoBuybackInput?.checked)
        }
      };

      submitPolicyPatch(patch);
    });
  }

  function setupDivPolicyForm() {
    const form = document.getElementById("divPolicyForm");

    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const patch = {
        div: {
          buyPoint: readNumber(elements.divBuyInput),
          sellPoint: readNumber(elements.divSellInput),
          floor: readNumber(elements.divFloorInput),
          topPoint: readNumber(elements.divTopPointInput),
          listedSupply: readNumber(elements.divListedSupplyInput),
          annualGrowthTarget: readNumber(elements.divGrowthTargetInput)
        }
      };

      submitPolicyPatch(patch);
    });
  }

  function setupDividendPolicyForm() {
    const form = document.getElementById("dividendPolicyForm");

    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const patch = {
        dividends: {
          enabled: Boolean(elements.dividendsEnabledInput?.checked),
          automationEnabled: Boolean(elements.dividendAutomationInput?.checked),
          targetAnnualDivDistribution: readNumber(elements.targetAnnualDivDistributionInput),
          maxDistributionPerTick: readNumber(elements.maxDistributionPerTickInput)
        }
      };

      submitPolicyPatch(patch);
    });
  }

  async function submitPolicyPatch(patch) {
    if (!patch || typeof patch !== "object") {
      return;
    }

    if (app.ws && app.ws.readyState === WebSocket.OPEN) {
      sendWebSocketMessage({
        type: "policy_update",
        payload: patch
      });

      return;
    }

    try {
      const response = await fetch("/api/policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(patch)
      });

      if (!response.ok) {
        throw new Error(`Policy update failed with ${response.status}`);
      }

      const nextState = await response.json();
      receiveState(nextState);
    } catch (error) {
      console.error("Policy update failed:", error);
      addLocalExplanation({
        severity: "high",
        type: "client",
        message: "Policy update failed. Check the server console for details."
      });
    }
  }

  function sendWebSocketMessage(message) {
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    app.ws.send(JSON.stringify(message));
  }

  function setupMoreMenu() {
    const button = elements.moreMenuButton;
    const panel = elements.moreMenuPanel;

    if (!button || !panel) {
      return;
    }

    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const isOpen = panel.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(isOpen));
    });

    panel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", () => {
      panel.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        panel.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
      }
    });
  }

  function setConnectionStatus(status, text) {
    const element = elements.connectionStatus;

    if (!element) {
      return;
    }

    const dotClass = {
      online: "status-dot--online",
      offline: "status-dot--offline",
      connecting: "status-dot--connecting"
    }[status] || "status-dot--offline";

    element.innerHTML = "";

    const dot = document.createElement("span");
    dot.className = `status-dot ${dotClass}`;

    const label = document.createTextNode(text);

    element.appendChild(dot);
    element.appendChild(label);
  }

  function addLocalExplanation({
    severity,
    type,
    message
  }) {
    const current = app.latestState || {};
    const explanations = current.explanations || {
      latest: []
    };

    explanations.latest = [
      {
        severity,
        type,
        message,
        createdAt: Date.now()
      },
      ...(explanations.latest || [])
    ];

    current.explanations = explanations;

    renderExplanations(current);
  }

  function setText(element, value) {
    if (!element) {
      return;
    }

    element.textContent = value;
  }

  function setInputValue(input, value) {
    if (!input) {
      return;
    }

    if (document.activeElement === input) {
      return;
    }

    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return;
    }

    input.value = String(value);
  }

  function setCheckboxValue(input, value) {
    if (!input) {
      return;
    }

    if (document.activeElement === input) {
      return;
    }

    input.checked = Boolean(value);
  }

  function readNumber(input) {
    if (!input) {
      return 0;
    }

    const value = Number(input.value);

    if (!Number.isFinite(value)) {
      return 0;
    }

    return value;
  }

  function markPriceDirection({
    element,
    current,
    previous
  }) {
    if (!element) {
      return;
    }

    element.classList.remove("price-up", "price-down");

    const currentNumber = Number(current);
    const previousNumber = Number(previous);

    if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) {
      return;
    }

    if (currentNumber > previousNumber) {
      element.classList.add("price-up");
    }

    if (currentNumber < previousNumber) {
      element.classList.add("price-down");
    }
  }

  function applyScoreClass(element, value) {
    if (!element) {
      return;
    }

    element.classList.remove("score-good", "score-warn", "score-bad");

    const score = Number(value || 0);

    if (score >= 70) {
      element.classList.add("score-good");
    } else if (score >= 40) {
      element.classList.add("score-warn");
    } else {
      element.classList.add("score-bad");
    }
  }

  function normalizeScenarioSeverity(severity) {
    switch (severity) {
      case "crisis":
      case "severe":
        return "critical";
      case "serious":
        return "high";
      case "moderate":
        return "medium";
      case "minor":
      default:
        return "info";
    }
  }

  function normalizeSeverity(severity) {
    if (["info", "medium", "high", "critical"].includes(severity)) {
      return severity;
    }

    return normalizeScenarioSeverity(severity);
  }

  function formatUsd(value, decimals = 2) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "$0.00";
    }

    return `$${number.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}`;
  }

  function formatUsdCompact(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "$0";
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

    return `$${number.toFixed(2)}`;
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

    return number.toLocaleString("en-US", {
      maximumFractionDigits: 2
    });
  }

  function formatScore(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "0/100";
    }

    return `${number.toFixed(1)}/100`;
  }

  function formatPercent(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "0.00%";
    }

    return `${(number * 100).toFixed(2)}%`;
  }

  function formatNumber(value, decimals = 0) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return number.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatLabel(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
})();
