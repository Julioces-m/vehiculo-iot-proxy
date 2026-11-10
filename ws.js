
const { createServer } = require("node:http");
const { WebSocketServer, WebSocket } = require("ws");

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    service: "vehicle-websocket-bridge",
    status: "ready"
  }));
});

const wss = new WebSocketServer({
  server,
  path: "/api/ws"
});

wss.on("connection", (client, req) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  if (
    allowedOrigin &&
    req.headers.origin !== allowedOrigin
  ) {
    client.close(1008, "Origin no permitido");
    return;
  }

  const upstreamUrl =
    process.env.UPSTREAM_WS_URL ||
    "ws://54.198.67.99:8000/ws/vehiculos/1";

  const upstream = new WebSocket(upstreamUrl);

  let closed = false;

  const closeBoth = (code, reason) => {
    if (closed) return;
    closed = true;

    if (
      upstream.readyState === WebSocket.OPEN ||
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.close(code, reason);
    }

    if (
      client.readyState === WebSocket.OPEN ||
      client.readyState === WebSocket.CONNECTING
    ) {
      client.close(code, reason);
    }
  };

  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  upstream.on("open", () => {
    console.log("Conectado al WebSocket FastAPI");
  });

  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  client.on("close", () => closeBoth(1000, "Cliente desconectado"));
  upstream.on("close", () => closeBoth(1011, "Backend desconectado"));

  client.on("error", () => closeBoth(1011, "Error del cliente"));
  upstream.on("error", () => closeBoth(1011, "Error del backend"));
});

module.exports = server;
