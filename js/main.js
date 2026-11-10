import { CONFIG } from "./config.js";
import { api } from "./api.js";
import { VehicleSocket } from "./websocket.js";
import { setIndicator, toast } from "./ui.js";

const $ = (id) => document.getElementById(id);
let commandCodes = new Map();
let demos = [];

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) { button.dataset.originalLabel = button.textContent; button.textContent = "PROCESANDO..."; }
  else if (button.dataset.originalLabel) { button.textContent = button.dataset.originalLabel; delete button.dataset.originalLabel; }
  if (label) button.textContent = label;
}

function formatHistoryDate(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" });
}

function renderHistory(rows) {
  const log = $("event-log");
  log.replaceChildren();

  if (!Array.isArray(rows) || rows.length === 0) {
    log.append(Object.assign(document.createElement("div"), {
      className: "empty-log",
      textContent: "Todavía no hay movimientos registrados para este vehículo."
    }));
    return;
  }

  rows.slice(0, 10).forEach((record) => {
    const item = document.createElement("div");
    item.className = "event-item";

    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = formatHistoryDate(record.fecha_hora);

    const body = document.createElement("div");
    body.className = "event-body";

    const title = document.createElement("strong");
    title.textContent = `MOVIMIENTO #${record.id_historial ?? "—"}`;

    const detail = document.createElement("p");
    const command = record.nombre_comando || record.comando || `Comando ID ${record.id_comando ?? "—"}`;
    detail.textContent = `${command} · Origen: ${record.origen || "No especificado"}`;

    body.append(title, detail);
    item.append(time, body);
    log.append(item);
  });
}

async function loadHistory(showError = false) {
  try {
    const rows = await api.history(CONFIG.VEHICLE_ID);
    renderHistory(rows);
  } catch (error) {
    if (showError) {
      $("event-log").replaceChildren(Object.assign(document.createElement("div"), {
        className: "empty-log",
        textContent: `No se pudo cargar el historial: ${error.message}`
      }));
      toast(`Error al consultar historial: ${error.message}`, "error");
    }
  }
}

async function sendCommand(code, name) {
  const buttons = [...document.querySelectorAll("[data-command]")];
  const stop = code === 11;
  if (stop) buttons.forEach((button) => button.disabled = true);
  $("last-command").textContent = name;
  $("command-feedback").textContent = `Enviando comando ${code}...`;
  try {
    const result = await api.move(CONFIG.VEHICLE_ID, code);
    $("command-feedback").textContent = result?.mensaje || `Comando ${code} enviado.`;
    toast(result?.mensaje || `${name}: solicitud aceptada.`);
    await loadHistory(false);
  } catch (error) {
    $("command-feedback").textContent = `Error: ${error.message}`;
    toast(`No se pudo enviar ${name}: ${error.message}`, "error");
  } finally {
    if (stop) buttons.forEach((button) => button.disabled = false);
  }
}

async function loadCommands() {
  const rows = await api.commands(CONFIG.VEHICLE_ID);
  if (!Array.isArray(rows)) throw new Error("El catálogo de comandos no devolvió una lista.");
  commandCodes = new Map(rows.filter((row) => Number(row.activo) === 1).map((row) => [Number(row.codigo), row.nombre]));
  document.querySelectorAll("[data-command]").forEach((button) => {
    const code = Number(button.dataset.command);
    if (!commandCodes.has(code)) {
      button.disabled = true;
      button.title = "Comando no disponible en el catálogo activo";
    }
  });
}

async function loadDemos() {
  demos = await api.demos(CONFIG.VEHICLE_ID);
  if (!Array.isArray(demos)) throw new Error("El catálogo de demos no devolvió una lista.");
  const select = $("demo-select");
  select.replaceChildren();
  if (!demos.length) {
    select.add(new Option("No hay demos activas", ""));
    $("run-demo").disabled = true;
    return;
  }
  demos.filter((demo) => Number(demo.activo) === 1).forEach((demo) => {
    const option = new Option(`${demo.nombre} — ID ${demo.id_demo}`, String(demo.id_demo));
    option.dataset.description = demo.descripcion || "";
    select.add(option);
  });
  updateDemoDescription();
}
function updateDemoDescription() {
  const option = $("demo-select").selectedOptions[0];
  $("demo-description").textContent = option?.dataset.description || "Selecciona una secuencia disponible.";
}
async function runDemo() {
  const id = $("demo-select").value;
  if (!id) return toast("Selecciona una demo.", "error");
  const button = $("run-demo");
  setBusy(button, true);
  try {
    const result = await api.runDemo(id);
    $("demo-status").textContent = (result?.status || "en_proceso").toUpperCase().replaceAll("_", " ");
    $("demo-status").parentElement.parentElement.className = "demo-status running";
    $("demo-feedback").textContent = result?.mensaje || "Solicitud de ejecución enviada.";
    toast(result?.mensaje || "Demo iniciada.");
    await loadHistory(false);
  } catch (error) {
    $("demo-feedback").textContent = `Error: ${error.message}`;
    toast(`No se pudo iniciar la demo: ${error.message}`, "error");
  } finally { setBusy(button, false); }
}
async function cancelDemo() {
  const button = $("cancel-demo");
  setBusy(button, true);
  try {
    const result = await api.cancelDemo(CONFIG.VEHICLE_ID);
    $("demo-status").textContent = (result?.status || "cancelada").toUpperCase();
    $("demo-status").parentElement.parentElement.className = "demo-status cancelled";
    $("demo-feedback").textContent = result?.mensaje || "Solicitud de cancelación enviada.";
    toast(result?.mensaje || "Demo cancelada.");
  } catch (error) {
    $("demo-feedback").textContent = `Error: ${error.message}`;
    toast(`No se pudo cancelar la demo: ${error.message}`, "error");
  } finally { setBusy(button, false); }
}

function initSocket() {
  const socket = new VehicleSocket({
    onStatus: (state) => {
      const labels = { connected: "Conectado", connecting: "Conectando...", disconnected: "Desconectado", error: "Error" };
      setIndicator("ws-indicator", state === "connected" ? "ok" : state === "error" ? "bad" : "pending", labels[state] || state);
    },
    onMessage: (payload) => {
      if (payload?.tipo_evento === "movimiento_individual") loadHistory(false);
    }
  });
  socket.connect();
  window.addEventListener("beforeunload", () => socket.disconnect(), { once: true });
}

async function init() {
  $("clock").textContent = new Date().toLocaleTimeString("es-MX", { hour12: false });
  setInterval(() => $("clock").textContent = new Date().toLocaleTimeString("es-MX", { hour12: false }), 1000);

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => sendCommand(Number(button.dataset.command), button.dataset.name));
  });
  $("demo-select").addEventListener("change", updateDemoDescription);
  $("run-demo").addEventListener("click", runDemo);
  $("cancel-demo").addEventListener("click", cancelDemo);
  $("refresh-history")?.addEventListener("click", () => loadHistory());

  try {
    await api.health();
    setIndicator("api-indicator", "ok", "Disponible");
  } catch {
    setIndicator("api-indicator", "bad", "Sin conexión");
  }
  setIndicator("db-indicator", "pending", "Sin verificar");

  try { await loadCommands(); }
  catch (error) { toast(`No se pudo cargar el catálogo: ${error.message}`, "error"); }
  try { await loadDemos(); }
  catch (error) { $("demo-select").replaceChildren(new Option("Error al cargar demos", "")); toast(error.message, "error"); }

  await loadHistory(true);
  setInterval(() => loadHistory(false), 10000);
  initSocket();
}
init();
