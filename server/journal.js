"use strict";

function addJournalEntry(state, entry) {
  if (!state.journal) {
    state.journal = {
      entries: []
    };
  }

  if (!Array.isArray(state.journal.entries)) {
    state.journal.entries = [];
  }

  const normalized = normalizeJournalEntry({
    state,
    entry
  });

  state.journal.entries.push(normalized);
  state.journal.entries = state.journal.entries.slice(-2000);
}

function normalizeJournalEntry({ state, entry }) {
  const source = entry.source || sourceFromCategory(entry.category);
  const marker = entry.marker || createMarker(entry);

  return {
    id: entry.id || createJournalId({ state, entry }),
    tick: state.runtime.tick,
    simulatedDay: state.runtime.simulatedDay,
    category: entry.category || "system",
    source,
    asset: entry.asset || null,
    action: entry.action || null,
    amount: Number(entry.amount || 0),
    usd: Number(entry.usd || 0),
    unitPrice: Number(entry.unitPrice || 0),
    marker,
    priceColumn: entry.priceColumn || formatPriceColumn({
      marker,
      value: entry.unitPrice
    }),
    message: entry.message || "",
    createdAt: Date.now()
  };
}

function createTradeJournalEntry({
  state,
  category,
  source,
  asset,
  action,
  amount,
  usd
}) {
  const safeAmount = Number(amount || 0);
  const safeUsd = Number(usd || 0);
  const unitPrice = safeAmount > 0 ? safeUsd / safeAmount : 0;

  const assetLabel = asset === "div" ? "DIV" : "Mono";
  const verb = action.includes("bought") ? "bought" : "sold";
  const marker = createMarker({
    category,
    asset,
    action
  });

  addJournalEntry(state, {
    category,
    source,
    asset,
    action,
    amount: safeAmount,
    usd: safeUsd,
    unitPrice,
    marker,
    message: `${formatCoins(safeAmount)} ${assetLabel} ${verb} for ${formatUsd(safeUsd)}`
  });
}

function createDividendJournalEntry({
  state,
  divAmount,
  monoSupply
}) {
  const safeDivAmount = Number(divAmount || 0);
  const safeMonoSupply = Number(monoSupply || 0);
  const divPerMono = safeMonoSupply > 0 ? safeDivAmount / safeMonoSupply : 0;

  addJournalEntry(state, {
    category: "dividend",
    source: "Treasury",
    asset: "div",
    action: "dividend_paid",
    amount: safeDivAmount,
    usd: 0,
    unitPrice: divPerMono,
    marker: "TDi",
    message: `${formatCoins(safeDivAmount)} DIV given to ${formatCoins(safeMonoSupply)} Mono holders`
  });
}

function createInterestJournalEntry({
  state,
  interestUsd,
  treasuryFiatUsd
}) {
  const safeInterestUsd = Number(interestUsd || 0);
  const safeTreasuryFiatUsd = Number(treasuryFiatUsd || 0);
  const interestRate = safeTreasuryFiatUsd > 0
    ? safeInterestUsd / safeTreasuryFiatUsd
    : 0;

  addJournalEntry(state, {
    category: "interest",
    source: "Treasury",
    asset: "fiat",
    action: "interest_received",
    amount: 0,
    usd: safeInterestUsd,
    unitPrice: interestRate,
    marker: "TIn",
    message: `${formatUsd(safeInterestUsd)} in interest received for treasury`
  });
}

function createMarker(entry) {
  const asset = entry.asset;
  const category = entry.category;

  if (category === "dividend") return "TDi";
  if (category === "interest") return "TIn";

  if (category === "peer") {
    return asset === "div" ? "PD$" : "PM$";
  }

  if (category === "treasury") {
    return asset === "div" ? "TD$" : "TM$";
  }

  return "SYS";
}

function sourceFromCategory(category) {
  if (category === "peer") return "Peer";
  if (category === "treasury") return "Treasury";
  if (category === "dividend") return "Treasury";
  if (category === "interest") return "Treasury";
  return "System";
}

/*
  This creates a 6-significant-figure-style display.

  Examples:
  1.0019      -> 1.00190
  10          -> 10.0000
  100         -> 100.000
  1000        -> 1000.00
  10000       -> 10000.0
  100000      -> 100000
  1000000     -> 1.000e6

  Note:
  True scientific notation for 1,000,000 is 1.000e6.
  If you literally want 10.00e6 for one million, change the exponent formatter,
  but that would no longer represent the value mathematically.
*/
function formatSixFigureValue(value) {
  const number = Math.abs(Number(value || 0));

  if (!Number.isFinite(number)) {
    return "0.00000";
  }

  if (number === 0) {
    return "0.00000";
  }

  if (number >= 1_000_000) {
    const exponent = Math.floor(Math.log10(number));
    const mantissa = number / Math.pow(10, exponent);

    return `${mantissa.toFixed(3)}e${exponent}`;
  }

  if (number >= 100_000) return number.toFixed(0);
  if (number >= 10_000) return number.toFixed(1);
  if (number >= 1_000) return number.toFixed(2);
  if (number >= 100) return number.toFixed(3);
  if (number >= 10) return number.toFixed(4);

  return number.toFixed(5);
}

function formatPriceColumn({
  marker,
  value
}) {
  return `${marker} ${formatSixFigureValue(value)}`;
}

function formatCoins(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return Math.round(number).toLocaleString("en-US");
}

function formatUsd(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "$0";
  }

  return `$${Math.round(number).toLocaleString("en-US")}`;
}

function createJournalId({ state, entry }) {
  return [
    state.runtime.tick,
    entry.category || "system",
    entry.asset || "system",
    entry.action || "event",
    Math.random().toString(36).slice(2, 10)
  ].join("_");
}

module.exports = {
  addJournalEntry,
  createTradeJournalEntry,
  createDividendJournalEntry,
  createInterestJournalEntry,
  formatSixFigureValue,
  formatPriceColumn
};
