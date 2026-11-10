// Configura aquí la URL pública de tu proyecto Vercel, sin barra final.
// Ejemplo: https://vehiculo-iot-proxy.vercel.app
export const CONFIG = {
  API_BASE: "https://excavadora-iot-backend-bridge.vercel.app",
  VEHICLE_ID: 1,
  WS_PATH: "/api/ws",
  REQUEST_TIMEOUT_MS: 10000,
  RECONNECT_BASE_MS: 1000,
  RECONNECT_MAX_MS: 15000
};
