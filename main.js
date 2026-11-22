import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import "./styles.css";

const appWindow = getCurrentWindow();
const $ = (id) => document.getElementById(id);
const petRoot = $("pet-root");
const petImage = $("pet-image");
const fallback = $("fallback-character");
const menu = $("context-menu");
const speech = $("speech-bubble");
const toast = $("toast");

const DEFAULTS = {
  mode: "free",
  scale: 1,
  alwaysOnTop: true,
  x: null,
  y: null
};

let settings = { ...DEFAULTS, ...loadSettings() };
let dragging = false;
let walkDirection = 1;
let walkTimer = null;
let speechTimer = null;
let toastTimer = null;
let currentAnimation = "idle";

function loadSettings() {
  try { return JSON.parse(localStorage.getItem("benpet-settings") || "{}"); }
  catch { return {}; }
}
function saveSettings() {
  localStorage.setItem("benpet-settings", JSON.stringify(settings));
}
function notify(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1900);
}
function speakBubble(message, duration = 2200) {
  speech.textContent = message;
  speech.classList.remove("hidden");
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => speech.classList.add("hidden"), duration);
}
function setAnimation(name) {
  if (currentAnimation === name) return;
  currentAnimation = name;
  const path = `/assets/character/${name}.gif`;
  petImage.src = path;
  fallback.classList.remove("hidden");
  petImage.classList.add("loading");
}
petImage.addEventListener("load", () => {
  petImage.classList.remove("loading");
  fallback.classList.add("hidden");
});
petImage.addEventListener("error", () => {
  petImage.classList.add("hidden");
  fallback.classList.remove("hidden");
});
function applyScale() {
  petRoot.style.setProperty("--pet-scale", String(settings.scale));
  $("size-value").textContent = `${Math.round(settings.scale * 100)}%`;
}
function hideMenu() { menu.classList.add("hidden"); }
function showMenu(x, y) {
  menu.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 310)}px`;
  menu.classList.remove("hidden");
}
async function saveWindowPosition() {
  try {
    const p = await appWindow.outerPosition();
    settings.x = p.x;
    settings.y = p.y;
    saveSettings();
  } catch { /* Browser preview: native window APIs are unavailable. */ }
}
async function restoreWindow() {
  try {
    if (settings.x !== null && settings.y !== null) {
      await appWindow.setPosition(new PhysicalPosition(settings.x, settings.y));
    }
    await appWindow.setAlwaysOnTop(settings.alwaysOnTop);
  } catch { /* Browser preview. */ }
}
async function resizeWindowForScale() {
  try {
    const baseWidth = 220;
    const baseHeight = 260;
    await appWindow.setSize(new PhysicalSize(
      Math.round(baseWidth * settings.scale),
      Math.round(baseHeight * settings.scale)
    ));
  } catch { /* Browser preview. */ }
}
async function setMode(mode) {
  settings.mode = mode;
  saveSettings();
  hideMenu();
  stopWalking();
  if (mode === "edge") {
    try {
      const size = await appWindow.outerSize();
      const screen = await appWindow.currentMonitor();
      if (screen) {
        // Tauri Monitor exposes the monitor bounds; taskbar/work-area insets
        // are not consistently available across desktop environments.
        const bounds = screen;
        const rightX = bounds.position.x + bounds.size.width - size.width;
        const leftX = bounds.position.x;
        const current = await appWindow.outerPosition();
        const targetX = Math.abs(current.x - leftX) < Math.abs(current.x - rightX) ? leftX : rightX;
        await appWindow.setPosition(new PhysicalPosition(targetX, bounds.position.y + bounds.size.height - size.height));
      }
    } catch { notify("โหมดเกาะขอบจอใช้ได้ใน Desktop App"); }
    speakBubble("เกาะขอบจอแล้วพี่");
  } else if (mode === "walk") {
    speakBubble("เตรียมเดินละนะ");
    startWalking();
  } else {
    speakBubble("กลับมาโหมดลอยอิสระแล้ว");
  }
  await saveWindowPosition();
}
function startWalking() {
  stopWalking();
  walkTimer = setInterval(async () => {
    if (document.hidden || dragging || settings.mode !== "walk") return;
    try {
      const pos = await appWindow.outerPosition();
      const size = await appWindow.outerSize();
      const monitor = await appWindow.currentMonitor();
      if (!monitor) return;
      const area = monitor.workArea;
      const minX = area.position.x;
      const maxX = area.position.x + area.size.width - size.width;
      let nextX = pos.x + (7 * walkDirection);
      if (nextX >= maxX) { nextX = maxX; walkDirection = -1; }
      if (nextX <= minX) { nextX = minX; walkDirection = 1; }
      await appWindow.setPosition(new PhysicalPosition(nextX, pos.y));
    } catch { /* Native-only feature. */ }
  }, 120);
}
function stopWalking() {
  if (walkTimer) clearInterval(walkTimer);
  walkTimer = null;
}
async function startDrag(event) {
  if (event.button !== 0 || event.target.closest("#context-menu")) return;
  hideMenu();
  dragging = true;
  stopWalking();
  try { await appWindow.startDragging(); }
  catch { /* Native window drag is unavailable in browser preview. */ }
  setTimeout(() => { dragging = false; if (settings.mode === "walk") startWalking(); }, 250);
  setTimeout(saveWindowPosition, 350);
}
petRoot.addEventListener("mousedown", startDrag);
petRoot.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  showMenu(event.clientX, event.clientY);
});
document.addEventListener("mousedown", (event) => {
  if (!menu.contains(event.target) && event.target !== petRoot && !petRoot.contains(event.target)) hideMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideMenu();
});
petRoot.addEventListener("click", (event) => {
  if (event.button !== 0 || menu.contains(event.target)) return;
  setAnimation("happy");
  speakBubble(["โอ๊ยพี่ จิ้มทำไม 555", "มีไรค้าบ", "อย่ากวนดิ กำลังยืนเท่ ๆ"][Math.floor(Math.random() * 3)]);
  setTimeout(() => setAnimation("idle"), 1200);
});
menu.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, value } = button.dataset;
  if (action === "mode") await setMode(value);
  if (action === "size") {
    settings.scale = Math.max(0.5, Math.min(2, settings.scale + Number(value) / 100));
    applyScale();
    await resizeWindowForScale();
    saveSettings();
  }
  if (action === "top") {
    settings.alwaysOnTop = !settings.alwaysOnTop;
    try { await appWindow.setAlwaysOnTop(settings.alwaysOnTop); } catch {}
    saveSettings();
    notify(settings.alwaysOnTop ? "เปิด Always on Top" : "ปิด Always on Top");
  }
  if (action === "say") speakBubble("ว่าไงพี่ มีอะไรให้ช่วยปั่นไหม");
  if (action === "reset") {
    settings.x = null; settings.y = null; settings.mode = "free";
    saveSettings();
    try { await appWindow.center(); } catch {}
    stopWalking();
    notify("รีเซ็ตตำแหน่งแล้ว");
  }
  if (action === "quit") {
    try { await appWindow.close(); } catch { notify("ปิดได้เมื่อรันเป็น Desktop App"); }
  }
  hideMenu();
});

applyScale();
restoreWindow();
if (settings.mode === "walk") startWalking();
setAnimation("idle");
