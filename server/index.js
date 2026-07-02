"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");

const { createGameLoop } = require("./gameLoop");
const { attachWebSocketServer } = require("./websocket");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const frontendPath = path.join(__dirname, "..", "frontend");
const pagesPath = path.join(frontendPath, "pages");

app.use(express.static(frontendPath));

const gameLoop = createGameLoop({
  tickMs: Number(process.env.TICK_MS || 1000)
});

attachWebSocketServer({
  server,
  gameLoop
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.get("/economy", (_req, res) => {
  res.sendFile(path.join(pagesPath, "economy.html"));
});

app.get("/treasury", (_req, res) => {
  res.sendFile(path.join(pagesPath, "treasury.html"));
});

app.get("/defaults", (_req, res) => {
  res.sendFile(path.join(pagesPath, "defaults.html"));
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mono-div-economy-game",
    environment: NODE_ENV,
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get("/api/state", (_req, res) => {
  res.json(gameLoop.getPublicState());
});

app.post("/api/policy", (req, res) => {
  const result = gameLoop.applyPlayerPolicy(req.body);

  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

app.post("/api/defaults", (req, res) => {
  const result = gameLoop.applyDefaults(req.body);

  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

app.post("/api/reset", (_req, res) => {
  const result = gameLoop.reset();
  return res.json(result);
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);

  res.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Mono & DIV Economy Game running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);

  gameLoop.start();
});

function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  gameLoop.stop();

  server.close((err) => {
    if (err) {
      console.error("Error during server shutdown:", err);
      process.exit(1);
    }

    console.log("Server stopped.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
