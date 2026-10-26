// Alle Bereiche der App. Ein neuer Bereich = ein Eintrag hier + eine Datei mit mount(el, ctx).
// "soon" markiert Bereiche, die erst in einer späteren Phase kommen.
export const MODULES = [
  { id: "dashboard", title: "Start", load: () => import("./dashboard.js") },
  { id: "gewohnheiten", title: "Gewohnheiten", load: () => import("./gewohnheiten.js") },
  { id: "rechnungen", title: "Rechnungen", wide: true, load: () => import("./rechnungen/index.js") },
  { id: "training", title: "Training", load: () => import("./training.js") },
  { id: "uni", title: "Uni", wide: true, load: () => import("./uni.js") },
  { id: "rezepte", title: "Rezepte", wide: true, load: () => import("./rezepte.js") },
  { id: "reflektor", title: "Lebensreflektor", wide: true, load: () => import("./reflektor/index.js") },
  { id: "news", title: "News", load: () => import("./news.js") },
  { id: "video", title: "Video zu Text", load: () => import("./video.js") },
  { id: "englisch", title: "Englisch", soon: "Phase 5", text: "Englisch lernen." },
  { id: "trading", title: "Trading", soon: "Phase 5", text: "Trading." }
];

export const SETTINGS_MODULE = { id: "einstellungen", title: "Einstellungen", load: () => import("./einstellungen.js") };

export const DEFAULT_BAR = ["dashboard", "gewohnheiten", "rechnungen"];

// Dashboard-Kacheln. "module" lädt die Datei, die die Kachel zeichnet (export widgets = { id: render }).
export const WIDGETS = [
  { id: "greeting", title: "Begrüßung mit Datum", module: "dashboard", span: 2 },
  { id: "thought", title: "Gedanke des Tages", module: "reflektor", span: 2 },
  { id: "habits-today", title: "Gewohnheiten heute", module: "gewohnheiten" },
  { id: "next-exam", title: "Nächste Uni-Prüfung", module: "uni" },
  { id: "last-training", title: "Letztes Training", module: "training" },
  { id: "gratitude", title: "Check-in heute (Dankbarkeit)", module: "reflektor" },
  { id: "memory", title: "Erinnerung (gelegentlich)", module: "reflektor" },
  { id: "open-invoices", title: "Offene Rechnungen", module: "rechnungen" }
];

export const moduleById = id => id === SETTINGS_MODULE.id ? SETTINGS_MODULE : MODULES.find(m => m.id === id);
