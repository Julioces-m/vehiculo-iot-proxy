import { CONFIG } from "./config.js";

export class VehicleSocket {
  constructor({ onStatus, onMessage }) {
    this.onStatus = onStatus;
    this.onMessage = onMessage;
    this.socket = null;
    this.retry = 0;
    this.closedByUser = false;
    this.retryTimer = null;
  }
  connect() {
    this.closedByUser = false;
    const url = `${CONFIG.API_BASE.replace(/^http/, "ws")}${CONFIG.WS_PATH}`;
    this.onStatus("connecting");
    try {
      this.socket = new WebSocket(url);
      this.socket.onopen = () => { this.retry = 0; this.onStatus("connected"); };
      this.socket.onmessage = (event) => {
        let payload = event.data;
        try { payload = JSON.parse(event.data); } catch {}
        this.onMessage(payload);
      };
      this.socket.onerror = () => this.onStatus("error");
      this.socket.onclose = () => {
        this.onStatus("disconnected");
        if (!this.closedByUser) this.scheduleReconnect();
      };
    } catch {
      this.onStatus("error");
      this.scheduleReconnect();
    }
  }
  scheduleReconnect() {
    clearTimeout(this.retryTimer);
    const delay = Math.min(CONFIG.RECONNECT_BASE_MS * (2 ** this.retry), CONFIG.RECONNECT_MAX_MS);
    this.retry = Math.min(this.retry + 1, 8);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
  disconnect() {
    this.closedByUser = true;
    clearTimeout(this.retryTimer);
    this.socket?.close();
  }
}
