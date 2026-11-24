
import { CONFIG } from "./config.js";
import { api } from "./api.js";
import { VehicleSocket } from "./websocket.js";
import { setIndicator, toast, addEvent } from "./ui.js";

const $ = (id) => document.getElementById(id);

let commandCodes = new Map();
let demos = [];
let socket = null;
let dashboardInitialized = false;


// ==========================================================
// INTERFAZ DE AUTENTICACIÃ“N
// ==========================================================

function showLogin() {
  $("login-screen").hidden = false;
  $("dashboard").hidden = true;

  $("login-password").value = "";
  $("login-error").hidden = true;
  $("login-submit").disabled = false;
  $("login-submit").textContent = "INICIAR SESIÃ“N";

  if (socket) {
    socket.disconnect();
    socket = null;
  }
}


function showDashboard(user) {
  $("login-screen").hidden = true;
  $("dashboard").hidden = false;

  $("user-name").textContent =
    `${user.nombre || ""} ${user.apellidos || ""}`.trim() ||
    user.correo;

  $("user-role").textContent =
    Array.isArray(user.roles) && user.roles.length
      ? user.roles.join(" / ")
      : "USUARIO";

  if (!dashboardInitialized) {
    dashboardInitialized = true;
    initDashboard();
  }
}


async function handleLogin(event) {
  event.preventDefault();

  const correo = $("login-email").value.trim();
  const password = $("login-password").value;

  const button = $("login-submit");
  const error = $("login-error");

  error.hidden = true;
  button.disabled = true;
  button.textContent = "AUTENTICANDO...";

  try {
    await api.login(correo, password);

    const user = await api.getCurrentUser();

    showDashboard(user);

    $("login-form").reset();

    toast("SesiÃ³n iniciada correctamente.");

  } catch (err) {
    error.textContent = err.message || "No fue posible iniciar sesiÃ³n.";
    error.hidden = false;

    button.disabled = false;
    button.textContent = "INICIAR SESIÃ“N";
  }
}


async function handleLogout() {
  const button = $("logout-button");

  button.disabled = true;
  button.textContent = "CERRANDO...";

  try {
    await api.logout();
    toast("SesiÃ³n cerrada correctamente.");
  } catch (error) {
    toast(`No se pudo confirmar el cierre de sesiÃ³n: ${error.message}`, "error");
  } finally {
    showLogin();
  }
}


// ==========================================================
// UTILIDADES
// ==========================================================

function setBusy(button, busy, label) {
  button.disabled = busy;

  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = "PROCESANDO...";
  } else if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
  }

  if (label) {
    button.textContent = label;
  }
}


// ==========================================================
// COMANDOS
// ==========================================================

async function sendCommand(code, name) {
  const buttons = [...document.querySelectorAll("[data-command]")];
  const stop = code === 11;

  if (stop) {
    buttons.forEach((button) => button.disabled = true);
  }

  $("last-command").textContent = name;
  $("command-feedback").textContent = `Enviando comando ${code}...`;

  try {
    const result = await api.move(CONFIG.VEHICLE_ID, code);

    $("command-feedback").textContent =
      result?.mensaje || `Comando ${code} enviado.`;

    toast(result?.mensaje || `${name}: solicitud aceptada.`);

  } catch (error) {
    $("command-feedback").textContent = `Error: ${error.message}`;
    toast(`No se pudo enviar ${name}: ${error.message}`, "error");

  } finally {
    if (stop) {
      buttons.forEach((button) => button.disabled = false);
    }
  }
}


async function loadCommands() {
  const rows = await api.commands(CONFIG.VEHICLE_ID);

  if (!Array.isArray(rows)) {
    throw new Error("El catÃ¡logo de comandos no devolviÃ³ una lista.");
  }

  commandCodes = new Map(
    rows
      .filter((row) => Number(row.activo) === 1)
      .map((row) => [Number(row.codigo), row.nombre])
  );

  document.querySelectorAll("[data-command]").forEach((button) => {
    const code = Number(button.dataset.command);

    if (!commandCodes.has(code)) {
      button.disabled = true;
      button.title = "Comando no disponible en el catÃ¡logo activo";
    } else {
      button.disabled = false;
      button.title = "";
    }
  });
}


// ==========================================================
// DEMOS
// ==========================================================

async function loadDemos() {
  demos = await api.demos(CONFIG.VEHICLE_ID);

  if (!Array.isArray(demos)) {
    throw new Error("El catÃ¡logo de demos no devolviÃ³ una lista.");
  }

  const select = $("demo-select");
  select.replaceChildren();

  const activeDemos = demos.filter(
    (demo) => Number(demo.activo) === 1
  );

  if (!activeDemos.length) {
    select.add(new Option("No hay demos activas", ""));
    $("run-demo").disabled = true;
    return;
  }

  activeDemos.forEach((demo) => {
    const option = new Option(
      `${demo.nombre} â€” ID ${demo.id_demo}`,
      String(demo.id_demo)
    );

    option.dataset.description = demo.descripcion || "";

    select.add(option);
  });

  $("run-demo").disabled = false;

  updateDemoDescription();
}


function updateDemoDescription() {
  const option = $("demo-select").selectedOptions[0];

  $("demo-description").textContent =
    option?.dataset.description ||
    "Selecciona una secuencia disponible.";
}


let activeDemoId = null;
let demoEventVersion = 0;

function setDemoStatus(label, stateClass, feedback) {
  const status = $("demo-status");
  if (!status) return;

  status.textContent = label;

  const root = status.parentElement?.parentElement;
  if (root) {
    root.className = "demo-status";
    if (stateClass) root.classList.add(stateClass);
  }

  if (feedback !== undefined && $("demo-feedback")) {
    $("demo-feedback").textContent = feedback;
  }
}

function handleDemoEvent(payload) {
  if (!payload || typeof payload !== "object") return;
  if (Number(payload.vehiculo_id) !== Number(CONFIG.VEHICLE_ID)) return;

  const type = payload.tipo_evento;
  const eventDemoId = Number(payload.demo_id);
  const selectedDemoId = Number($("demo-select")?.value);

  if (!Number.isFinite(eventDemoId)) return;

  if (activeDemoId !== null) {
    if (eventDemoId !== Number(activeDemoId)) return;
  } else {
    if (!selectedDemoId || eventDemoId !== selectedDemoId) return;
  }

  const knownEvents = [
    "demo_inicio",
    "demo_movimiento",
    "demo_detener",
    "demo_cancelada",
    "demo_fin",
    "demo_error"
  ];

  if (!knownEvents.includes(type)) return;

  demoEventVersion++;

  switch (type) {
    case "demo_inicio":
      setDemoStatus(
        "EN EJECUCI?N",
        "running",
        `Demo ${eventDemoId} iniciada.`
      );
      break;

    case "demo_movimiento":
      setDemoStatus(
        "MOVIMIENTO EN CURSO",
        "running",
        `Orden ${payload.orden ?? "?"}: ${payload.comando || payload.codigo || "Movimiento"}`
      );
      break;

    case "demo_detener":
      if (Number(payload.codigo) === 11 && payload.estado === "ejecutado") {
        setDemoStatus(
          "DETENCI?N CONFIRMADA",
          "stopped",
          "El veh?culo confirm? la ejecuci?n de DETENER."
        );
      } else {
        setDemoStatus(
          "DETENCI?N NO CONFIRMADA",
          "unconfirmed",
          "No se recibi? una confirmaci?n v?lida de DETENER."
        );
      }
      break;

    case "demo_cancelada":
      if (payload.parada_confirmada === true) {
        setDemoStatus(
          "CANCELADA ? PARADA CONFIRMADA",
          "stopped",
          "La cancelaci?n termin? con parada confirmada."
        );
      } else {
        setDemoStatus(
          "CANCELADA ? PARADA NO CONFIRMADA",
          "unconfirmed",
          "La demo fue cancelada, pero no se confirm? la parada f?sica."
        );
      }
      activeDemoId = null;
      break;

    case "demo_fin":
      if (payload.parada_confirmada === true) {
        setDemoStatus(
          "FINALIZADA ? PARADA CONFIRMADA",
          "stopped",
          "La secuencia termin? y la parada fue confirmada."
        );
      } else {
        setDemoStatus(
          "FINALIZADA ? PARADA NO CONFIRMADA",
          "unconfirmed",
          "La secuencia termin? sin confirmar la parada f?sica."
        );
      }
      activeDemoId = null;
      break;

    case "demo_error":
      if (payload.parada_confirmada === true) {
        setDemoStatus(
          "ERROR ? VEH?CULO DETENIDO",
          "error",
          payload.error || "La demo present? un error; la parada fue confirmada."
        );
      } else {
        setDemoStatus(
          "ERROR ? PARADA NO CONFIRMADA",
          "unconfirmed",
          payload.error || "La demo present? un error y no se confirm? la parada."
        );
      }
      activeDemoId = null;
      break;
  }
}

async function runDemo() {
  const id = $("demo-select").value;
  if (!id) return toast("Selecciona una demo.", "error");

  const requestedDemoId = Number(id);
  const eventVersionAtRequest = demoEventVersion;
  const button = $("run-demo");

  activeDemoId = requestedDemoId;

  setDemoStatus(
    "SOLICITANDO EJECUCI?N",
    "running",
    "Enviando solicitud al backend..."
  );

  setBusy(button, true);

  try {
    const result = await api.runDemo(id);

    if (demoEventVersion === eventVersionAtRequest) {
      setDemoStatus(
        "SOLICITUD ACEPTADA ? ESPERANDO EVENTOS",
        "running",
        result?.mensaje || "Solicitud aceptada. Esperando confirmaci?n de ejecuci?n."
      );
    }

    toast(result?.mensaje || "Solicitud de ejecuci?n enviada.");
  } catch (error) {
    if (activeDemoId === requestedDemoId) {
      activeDemoId = null;
      setDemoStatus("ERROR AL INICIAR", "error", `Error: ${error.message}`);
    }

    toast(`No se pudo iniciar la demo: ${error.message}`, "error");
  } finally {
    setBusy(button, false);
  }
}


async function cancelDemo() {
  const button = $("cancel-demo");
  const demoIdAtCancel = activeDemoId;
  const eventVersionAtRequest = demoEventVersion;

  setBusy(button, true);

  try {
    const result = await api.cancelDemo(CONFIG.VEHICLE_ID);

    if (demoEventVersion === eventVersionAtRequest) {
      setDemoStatus(
        "CANCELACI?N SOLICITADA",
        "running",
        result?.mensaje || "Solicitud enviada. Esperando confirmaci?n de parada."
      );
    }

    toast(result?.mensaje || "Solicitud de cancelaci?n enviada.");
  } catch (error) {
    if (activeDemoId === demoIdAtCancel) {
      setDemoStatus(
        "ERROR AL SOLICITAR CANCELACI?N",
        "error",
        `No se pudo solicitar la cancelaci?n: ${error.message}`
      );
    }

    toast(`No se pudo cancelar la demo: ${error.message}`, "error");
  } finally {
    setBusy(button, false);
  }
}


// ==========================================================
// WEBSOCKET
// ==========================================================

function initSocket() {
  socket = new VehicleSocket({
    getAccessToken: () => api.getWebSocketAccessToken(),

    onStatus: (state) => {
      const labels = {
        connected: "Autenticado",
        connecting: "Conectando...",
        authenticating: "Autenticando...",
        disconnected: "Desconectado",
        unauthorized: "AutenticaciÃ³n rechazada",
        error: "Error"
      };

      setIndicator(
        "ws-indicator",
        state === "connected"
          ? "ok"
          : state === "error" || state === "unauthorized"
            ? "bad"
            : "pending",
        labels[state] || state
      );
    },

    onMessage: (payload) => {
      addEvent(payload);
      handleDemoEvent(payload);
    }
  });

  socket.connect();

  window.addEventListener(
    "beforeunload",
    () => socket?.disconnect(),
    { once: true }
  );
}


// ==========================================================
// INICIALIZACIÃ“N DEL DASHBOARD
// ==========================================================

async function initDashboard() {
  $("clock").textContent = new Date().toLocaleTimeString(
    "es-MX",
    { hour12: false }
  );

  setInterval(() => {
    $("clock").textContent = new Date().toLocaleTimeString(
      "es-MX",
      { hour12: false }
    );
  }, 1000);


  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      sendCommand(
        Number(button.dataset.command),
        button.dataset.name
      );
    });
  });


  $("demo-select").addEventListener(
    "change",
    updateDemoDescription
  );

  $("run-demo").addEventListener("click", runDemo);
  $("cancel-demo").addEventListener("click", cancelDemo);


  $("clear-events").addEventListener("click", () => {
    $("event-log").replaceChildren(
      Object.assign(document.createElement("div"), {
        className: "empty-log",
        textContent: "Sin eventos recibidos todavÃ­a."
      })
    );
  });


  try {
    const health = await api.health();

    setIndicator("api-indicator", "ok", "Disponible");

    const databaseConnected = health?.database === "conectado";

    setIndicator(
      "db-indicator",
      databaseConnected ? "ok" : "bad",
      databaseConnected ? "Conectado" : "Sin conexión"
    );

  } catch {
    setIndicator("api-indicator", "bad", "Sin conexión");
    setIndicator("db-indicator", "bad", "Sin conexión");
  }
  try {
    await loadCommands();

  } catch (error) {
    toast(
      `No se pudo cargar el catÃ¡logo: ${error.message}`,
      "error"
    );
  }


  try {
    await loadDemos();

  } catch (error) {
    $("demo-select").replaceChildren(
      new Option("Error al cargar demos", "")
    );

    toast(error.message, "error");
  }


  initSocket();
}


// ==========================================================
// ARRANQUE DE LA APLICACIÃ“N
// ==========================================================

async function init() {

  $("login-form").addEventListener("submit", handleLogin);

  $("logout-button").addEventListener("click", handleLogout);

  showLogin();

  try {
    const user = await api.restoreSession();

    if (user) {
      showDashboard(user);
    }

  } catch (error) {
    showLogin();

    console.warn(
      "No se pudo recuperar la sesiÃ³n:",
      error.message
    );
  }
}

init();


