
import { CONFIG } from "./config.js";

const REFRESH_KEY = "vehiculo_iot_refresh_token";

let accessToken = null;
let refreshPromise = null;


class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}


// ==========================================================
// PETICIÓN HTTP
// ==========================================================

async function sendRequest(path, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${CONFIG.API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const raw = await response.text();

    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!response.ok) {
      const detail =
        data?.detail ||
        data?.mensaje ||
        `HTTP ${response.status}`;

      throw new ApiError(detail, response.status);
    }

    return data;

  } finally {
    clearTimeout(timeout);
  }
}


// ==========================================================
// ADMINISTRACIÓN DE TOKENS
// ==========================================================

function saveTokens(data) {
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error("La API no devolvió los tokens de sesión.");
  }

  accessToken = data.access_token;

  sessionStorage.setItem(
    REFRESH_KEY,
    data.refresh_token
  );
}


function clearSession() {
  accessToken = null;

  sessionStorage.removeItem(REFRESH_KEY);
}


// ==========================================================
// RENOVACIÓN DE SESIÓN
// ==========================================================

async function refreshSession() {

  // Evitar renovaciones simultáneas.
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = sessionStorage.getItem(REFRESH_KEY);

  if (!refreshToken) {
    clearSession();
    throw new Error("No existe una sesión para renovar.");
  }

  refreshPromise = (async () => {

    try {
      const data = await sendRequest(
        "/api/v1/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            refresh_token: refreshToken
          })
        }
      );

      // El backend rota ambos tokens.
      saveTokens(data);

      return data.access_token;

    } catch (error) {
      clearSession();
      throw error;

    } finally {
      refreshPromise = null;
    }

  })();

  return refreshPromise;
}


// ==========================================================
// PETICIONES PROTEGIDAS
// ==========================================================

async function request(path, options = {}, authenticated = true) {

  if (!authenticated) {
    return sendRequest(path, options);
  }

  if (!accessToken) {
    if (!sessionStorage.getItem(REFRESH_KEY)) {
      throw new Error("Debes iniciar sesión.");
    }

    await refreshSession();
  }

  const execute = () => sendRequest(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`
    }
  });

  try {
    return await execute();

  } catch (error) {

    if (error.status !== 401) {
      throw error;
    }

    // Renovar una sola vez y reintentar.
    await refreshSession();

    return execute();
  }
}


// ==========================================================
// AUTENTICACIÓN
// ==========================================================

async function login(correo, password) {

  const data = await request(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        correo,
        password
      })
    },
    false
  );

  saveTokens(data);

  return data;
}


async function getCurrentUser() {
  return request("/api/v1/auth/me");
}


async function restoreSession() {

  if (!sessionStorage.getItem(REFRESH_KEY)) {
    clearSession();
    return null;
  }

  await refreshSession();

  return getCurrentUser();
}


async function logout() {

  const refreshToken = sessionStorage.getItem(REFRESH_KEY);

  try {

    if (refreshToken) {
      await sendRequest(
        "/api/v1/auth/logout",
        {
          method: "POST",
          body: JSON.stringify({
            refresh_token: refreshToken
          })
        }
      );
    }

  } finally {
    clearSession();
  }
}


// ==========================================================
// API DEL VEHÍCULO
// ==========================================================

export const api = {

  // Autenticación
  login,
  getCurrentUser,
  restoreSession,
  logout,

  // Estado general
  health: () => request("/health", {}, false),

  // Comandos
  commands: (vehicleId) =>
    request(`/api/v1/comandos/vehiculo/${vehicleId}`),

  // DEMOS
  demos: (vehicleId) =>
    request(`/api/v1/demos/vehiculo/${vehicleId}`),

  // Movimiento individual
  move: (vehicleId, command) =>
    request(
      `/api/v1/estado/vehiculos/${vehicleId}/movimiento`,
      {
        method: "POST",
        body: JSON.stringify({
          comando: Number(command),
          origen: "Frontend"
        })
      }
    ),

  // Ejecutar DEMO
  runDemo: (demoId) =>
    request(
      `/api/v1/demos/${demoId}/ejecutar`,
      {
        method: "POST"
      }
    ),

  // Cancelar DEMO
  cancelDemo: (vehicleId) =>
    request(
      `/api/v1/demos/vehiculo/${vehicleId}/cancelar`,
      {
        method: "POST"
      }
    )
};
