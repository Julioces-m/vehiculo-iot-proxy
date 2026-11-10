import { CONFIG } from "./config.js";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${CONFIG.API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    if (!response.ok) {
      const detail = data?.detail || data?.mensaje || `HTTP ${response.status}`;
      throw new Error(detail);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  health: () => request("/health"),
  commands: (vehicleId) => request(`/api/v1/comandos/vehiculo/${vehicleId}`),
  demos: (vehicleId) => request(`/api/v1/demos/vehiculo/${vehicleId}`),
  history: (vehicleId) => request(`/api/v1/historial/vehiculos/${vehicleId}`),
  move: (vehicleId, command) => request(`/api/v1/estado/vehiculos/${vehicleId}/movimiento`, {
    method: "POST", body: JSON.stringify({ comando: Number(command), origen: "Frontend" })
  }),
  runDemo: (demoId) => request(`/api/v1/demos/${demoId}/ejecutar`, { method: "POST" }),
  cancelDemo: (vehicleId) => request(`/api/v1/demos/vehiculo/${vehicleId}/cancelar`, { method: "POST" })
};
