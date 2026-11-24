import { createServer } from "node:http";
import {
  WebSocket,
  WebSocketServer,
  type RawData
} from "ws";

const server = createServer();

const wss = new WebSocketServer({
  server,
  path: "/api/ws"
});

const MAX_PENDING_MESSAGES = 16;
const MAX_PENDING_BYTES = 64 * 1024;

function getMessageSize(data: RawData): number {
  if (Buffer.isBuffer(data)) return data.length;
  if (Array.isArray(data)) {
    return data.reduce((total, item) => total + item.length, 0);
  }
  return data.byteLength;
}

wss.on("connection", (client) => {
  const upstreamUrl =
    process.env.UPSTREAM_WS_URL ||
    "ws://54.198.67.99:8000/ws/vehiculos/1";

  console.log("[WS] Cliente conectado");

  const upstream = new WebSocket(upstreamUrl, {
    handshakeTimeout: 10000
  });

  let closed = false;
  let pendingBytes = 0;

  const pending: Array<{
    data: RawData;
    isBinary: boolean;
  }> = [];

  const closeBoth = (code: number, reason: string) => {
    if (closed) return;
    closed = true;

    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close(code, reason);
    } else if (
      upstream.readyState === WebSocket.CONNECTING
    ) {
      upstream.terminate();
    }

    if (client.readyState === WebSocket.OPEN) {
      client.close(code, reason);
    } else if (
      client.readyState === WebSocket.CONNECTING
    ) {
      client.terminate();
    }
  };

  // Recibir mensajes del ESP8266 o del panel.
  client.on("message", (data, isBinary) => {
    if (closed) return;

    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }

    if (upstream.readyState !== WebSocket.CONNECTING) {
      closeBoth(1011, "Backend no disponible");
      return;
    }

    const size = getMessageSize(data);

    if (
      pending.length >= MAX_PENDING_MESSAGES ||
      pendingBytes + size > MAX_PENDING_BYTES
    ) {
      closeBoth(1013, "Cola de mensajes llena");
      return;
    }

    pending.push({ data, isBinary });
    pendingBytes += size;
  });

  // Cuando FastAPI esté listo, reenviar lo que estaba pendiente.
  upstream.on("open", () => {
    if (closed) {
      upstream.close();
      return;
    }

    console.log("[WS] Conectado a FastAPI");

    while (pending.length > 0) {
      if (client.readyState !== WebSocket.OPEN) {
        closeBoth(1000, "Cliente desconectado");
        return;
      }

      const message = pending.shift()!;
      pendingBytes -= getMessageSize(message.data);

      upstream.send(message.data, {
        binary: message.isBinary
      });
    }
  });

  // Reenviar respuestas de FastAPI al cliente.
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on("error", (error) => {
    console.error("[WS] Error FastAPI:", error.message);
    closeBoth(1011, "Error del backend");
  });

  client.on("error", (error) => {
    console.error("[WS] Error cliente:", error.message);
    closeBoth(1011, "Error del cliente");
  });

  client.on("close", () => {
    closeBoth(1000, "Cliente desconectado");
  });

  upstream.on("close", (code) => {
    console.log("[WS] FastAPI desconectado:", code);

    if (!closed) {
      closeBoth(1011, "Backend desconectado");
    }
  });
});

export default server;