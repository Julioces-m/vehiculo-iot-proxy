
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
// INTERFAZ DE AUTENTICACIÓN
// ==========================================================

function showLogin() {
  $("login-screen").hidden = false;
  $("dashboard").hidden = true;

  $("login-password").value = "";
  $("login-error").hidden = true;
  $("login-submit").disabled = false;
  $("login-submit").textContent = "INICIAR SESIÓN";

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

    toast("Sesión iniciada correctamente.");

  } catch (err) {
    error.textContent = err.message || "No fue posible iniciar sesión.";
    error.hidden = false;

    button.disabled = false;
    button.textContent = "INICIAR SESIÓN";
  }
}


async function handleLogout() {
  const button = $("logout-button");

  button.disabled = true;
  button.textContent = "CERRANDO...";

  try {
    await api.logout();
    toast("Sesión cerrada correctamente.");
  } catch (error) {
    toast(`No se pudo confirmar el cierre de sesión: ${error.message}`, "error");
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
    throw new Error("El catálogo de comandos no devolvió una lista.");
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
      button.title = "Comando no disponible en el catálogo activo";
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
    throw new Error("El catálogo de demos no devolvió una lista.");
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
      `${demo.nombre} — ID ${demo.id_demo}`,
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


async function runDemo() {
  const id = $("demo-select").value;

  if (!id) {
    return toast("Selecciona una demo.", "error");
  }

  const button = $("run-demo");

  setBusy(button, true);

  try {
    const result = await api.runDemo(id);

    $("demo-status").textContent =
      (result?.status || "en_proceso")
        .toUpperCase()
        .replaceAll("_", " ");

    $("demo-status").parentElement.parentElement.className =
      "demo-status running";

    $("demo-feedback").textContent =
      result?.mensaje || "Solicitud de ejecución enviada.";

    toast(result?.mensaje || "Demo iniciada.");

  } catch (error) {
    $("demo-feedback").textContent = `Error: ${error.message}`;

    toast(
      `No se pudo iniciar la demo: ${error.message}`,
      "error"
    );

  } finally {
    setBusy(button, false);
  }
}


async function cancelDemo() {
  const button = $("cancel-demo");

  setBusy(button, true);

  try {
    const result = await api.cancelDemo(CONFIG.VEHICLE_ID);

    $("demo-status").textContent =
      (result?.status || "cancelada").toUpperCase();

    $("demo-status").parentElement.parentElement.className =
      "demo-status cancelled";

    $("demo-feedback").textContent =
      result?.mensaje || "Solicitud de cancelación enviada.";

    toast(result?.mensaje || "Demo cancelada.");

  } catch (error) {
    $("demo-feedback").textContent = `Error: ${error.message}`;

    toast(
      `No se pudo cancelar la demo: ${error.message}`,
      "error"
    );

  } finally {
    setBusy(button, false);
  }
}


// ==========================================================
// WEBSOCKET
// ==========================================================

function initSocket() {
  socket = new VehicleSocket({
    onStatus: (state) => {
      const labels = {
        connected: "Conectado",
        connecting: "Conectando...",
        disconnected: "Desconectado",
        error: "Error"
      };

      setIndicator(
        "ws-indicator",
        state === "connected"
          ? "ok"
          : state === "error"
            ? "bad"
            : "pending",
        labels[state] || state
      );
    },

    onMessage: (payload) => {
      addEvent(payload);
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
// INICIALIZACIÓN DEL DASHBOARD
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
        textContent: "Sin eventos recibidos todavía."
      })
    );
  });


  try {
    await api.health();

    setIndicator("api-indicator", "ok", "Disponible");

  } catch {
    setIndicator("api-indicator", "bad", "Sin conexión");
  }


  setIndicator("db-indicator", "pending", "Sin verificar");


  try {
    await loadCommands();

  } catch (error) {
    toast(
      `No se pudo cargar el catálogo: ${error.message}`,
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
// ARRANQUE DE LA APLICACIÓN
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
      "No se pudo recuperar la sesión:",
      error.message
    );
  }
}

init();
