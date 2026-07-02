"use strict";

const WebSocket = require("ws");

function attachWebSocketServer({ server, gameLoop }) {
  if (!server) {
    throw new Error("attachWebSocketServer requires an HTTP server.");
  }

  if (!gameLoop) {
    throw new Error("attachWebSocketServer requires a gameLoop instance.");
  }

  const wss = new WebSocket.Server({
    server,
    path: "/ws"
  });

  const clients = new Set();

  wss.on("connection", (socket) => {
    clients.add(socket);
    gameLoop.setPlayerOnline(true);

    sendJson(socket, {
      type: "state",
      payload: gameLoop.getPublicState()
    });

    socket.on("message", (rawMessage) => {
      handleClientMessage({
        socket,
        rawMessage,
        gameLoop
      });
    });

    socket.on("close", () => {
      clients.delete(socket);

      if (clients.size === 0) {
        gameLoop.setPlayerOnline(false);
      }
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(socket);

      if (clients.size === 0) {
        gameLoop.setPlayerOnline(false);
      }
    });
  });

  const unsubscribe = gameLoop.onBroadcast((publicState) => {
    broadcastJson(clients, {
      type: "state",
      payload: publicState
    });
  });

  wss.on("close", () => {
    unsubscribe();
  });

  return {
    wss,
    clients
  };
}

function handleClientMessage({ socket, rawMessage, gameLoop }) {
  let message;

  try {
    message = JSON.parse(rawMessage.toString());
  } catch (_error) {
    return sendJson(socket, {
      type: "error",
      payload: {
        ok: false,
        error: "Invalid JSON message."
      }
    });
  }

  if (!message || typeof message !== "object") {
    return sendJson(socket, {
      type: "error",
      payload: {
        ok: false,
        error: "Message must be an object."
      }
    });
  }

  switch (message.type) {
    case "ping": {
      return sendJson(socket, {
        type: "pong",
        payload: {
          now: Date.now()
        }
      });
    }

    case "get_state": {
      return sendJson(socket, {
        type: "state",
        payload: gameLoop.getPublicState()
      });
    }

    case "policy_update": {
      const result = gameLoop.applyPlayerPolicy(message.payload || {});

      return sendJson(socket, {
        type: result.ok ? "policy_updated" : "error",
        payload: result
      });
    }

    case "defaults_update": {
      const result = gameLoop.applyDefaults(message.payload || {});

      return sendJson(socket, {
        type: result.ok ? "defaults_updated" : "error",
        payload: result
      });
    }

    case "reset": {
      const result = gameLoop.reset();

      return sendJson(socket, {
        type: "reset_complete",
        payload: result
      });
    }

    default: {
      return sendJson(socket, {
        type: "error",
        payload: {
          ok: false,
          error: `Unknown message type: ${String(message.type)}`
        }
      });
    }
  }
}

function broadcastJson(clients, message) {
  const json = JSON.stringify(message);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function sendJson(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

module.exports = {
  attachWebSocketServer
};
