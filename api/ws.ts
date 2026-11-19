import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const server = createServer();
const wss = new WebSocketServer({
  server,
  path: "/api/ws"
});

wss.on("connection", (client) => {
  const upstreamUrl =
    process.env.UPSTREAM_WS_URL ||
    "ws://54.198.67.99:8000/ws/vehiculos/1";

  const upstream = new WebSocket(upstreamUrl);
  let closed = false;

  const closeBoth = (code: number, reason: string) => {
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
    console.log("Puente Vercel conectado al WebSocket FastAPI");
  });

  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on("error", (error) => {
    console.error("Error conectando con FastAPI WebSocket:", error.message);
    closeBoth(1011, "No se pudo conectar con el backend");
  });

  client.on("close", () => closeBoth(1000, "Cliente desconectado"));
  upstream.on("close", () => closeBoth(1011, "Backend desconectado"));
  client.on("error", () => closeBoth(1011, "Error del cliente"));
});

export default server;
