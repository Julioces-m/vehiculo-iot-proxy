export function setIndicator(id, state, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("ok", state === "ok");
  el.classList.toggle("bad", state === "bad");
  el.querySelector("b").textContent = label;
}
export function toast(message, type = "ok") {
  const region = document.getElementById("toast-region");
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "error" : ""}`;
  node.textContent = message;
  region.append(node);
  setTimeout(() => node.remove(), 4000);
}
export function addEvent(payload) {
  const log = document.getElementById("event-log");
  log.querySelector(".empty-log")?.remove();
  const item = document.createElement("div");
  item.className = "event-item";
  const time = document.createElement("span");
  time.className = "event-time";
  time.textContent = new Date().toLocaleTimeString("es-MX", { hour12: false });
  const body = document.createElement("div");
  body.className = "event-body";
  const title = document.createElement("strong");
  title.textContent = payload?.tipo_evento || "MENSAJE WEBSOCKET";
  const detail = document.createElement("p");
  detail.textContent = typeof payload === "string" ? payload : JSON.stringify(payload);
  body.append(title, detail);
  item.append(time, body);
  log.prepend(item);
}
