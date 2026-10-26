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

export function applyTheme(theme) {
  const t = theme === "light" || theme === "dark" ? theme : "";
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { if (t) localStorage.setItem("db-theme", t); else localStorage.removeItem("db-theme"); } catch (e) {}
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
