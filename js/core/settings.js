// App-Einstellungen (Navigation, Dashboard, Design, Name) in users/{uid}/settings/app.
import { watchDoc, merge } from "./data.js";
import { MODULES, WIDGETS, DEFAULT_BAR } from "../modules/registry.js";

let current = null;
const listeners = new Set();

export function startSettings() {
  return new Promise(resolve => {
    let first = true;
    const stop = watchDoc("settings", "app", data => {
      current = data || {};
      applyTheme(current.theme);
      listeners.forEach(fn => fn(current));
      if (first) { first = false; resolve(stop); }
    });
  });
}
export const getSettings = () => current || {};
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const saveSettings = patch => merge("settings", "app", patch);

const THEME_BG = { light: "#F3F4F0", dark: "#0F1113" };
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
/** Tatsächlich sichtbares Design: "light" oder "dark" */
export const effectiveTheme = () => document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light");
export function onSystemTheme(fn) { darkQuery.addEventListener("change", fn); return () => darkQuery.removeEventListener("change", fn); }

/** theme: "light" | "dark" | "" (Automatisch = wie das System). Merkt es sich lokal, damit beim Start nichts aufblitzt. */
export function applyTheme(theme) {
  const t = theme === "light" || theme === "dark" ? theme : "";
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { if (t) localStorage.setItem("db-theme", t); else localStorage.removeItem("db-theme"); } catch (e) {}
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.content = t ? THEME_BG[t] : THEME_BG[m.media.includes("dark") ? "dark" : "light"];
  });
  document.dispatchEvent(new CustomEvent("db-theme"));
}

/** Reihenfolge aller Bereiche und welche davon in der Leiste stehen (neue Bereiche werden angehängt). */
export function navLayout(s = getSettings()) {
  const ids = MODULES.map(m => m.id);
  const order = [...(s.nav?.order || []).filter(id => ids.includes(id)), ...ids.filter(id => !(s.nav?.order || []).includes(id))];
  const barSet = new Set((s.nav?.bar || DEFAULT_BAR).filter(id => ids.includes(id)));
  return { order, bar: order.filter(id => barSet.has(id)), more: order.filter(id => !barSet.has(id)) };
}

/** Kacheln in Reihenfolge mit Sichtbarkeit. Noch nicht gebaute Kacheln sind nie sichtbar. */
export function dashboardLayout(s = getSettings()) {
  const ids = WIDGETS.map(w => w.id);
  const saved = (s.dashboard?.order || []).filter(id => ids.includes(id));
  const order = [...saved, ...ids.filter(id => !saved.includes(id))];
  const hidden = new Set(s.dashboard?.hidden || []);
  return order.map(id => { const w = WIDGETS.find(x => x.id === id); return { ...w, visible: !w.soon && !hidden.has(id) }; });
}

/* ---------- Anzeigegröße (wie Strg + Mausrad) und Schriftgröße, gespeichert pro Gerät ---------- */
export const ZOOM = { min: 0.6, max: 1.5, step: 0.05 };
export const FONT = { min: 0.8, max: 1.4, step: 0.05 };
const readNum = (k, d) => { try { const n = parseFloat(localStorage.getItem(k)); return n > 0 ? n : d; } catch (e) { return d; } };
export const getView = () => ({ zoom: readNum("db-zoom", 1), font: readNum("db-fs", 1) });
export function applyView({ zoom, font } = getView()) {
  const r = document.documentElement;
  const z = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(zoom * 100) / 100));
  const f = Math.min(FONT.max, Math.max(FONT.min, Math.round(font * 100) / 100));
  r.style.zoom = z === 1 ? "" : z;
  if (f === 1) r.style.removeProperty("--fs"); else r.style.setProperty("--fs", f);
  try {
    z === 1 ? localStorage.removeItem("db-zoom") : localStorage.setItem("db-zoom", z);
    f === 1 ? localStorage.removeItem("db-fs") : localStorage.setItem("db-fs", f);
  } catch (e) {}
  window.dispatchEvent(new Event("resize")); // Diagramme passen sich an
}
