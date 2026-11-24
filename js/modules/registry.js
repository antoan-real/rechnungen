// Alle Bereiche der App. Ein neuer Bereich = ein Eintrag hier + eine Datei mit mount(el, ctx).
// "soon" markiert Bereiche, die erst in einer späteren Phase kommen.
export const MODULES = [
  { id: "dashboard", title: "Heute", icon: "home", color: "red", load: () => import("./dashboard.js") },
  { id: "schach", title: "Schach", icon: "crown", color: "chess", main: true, bleed: true, load: () => import("./schach.js") },
  { id: "gewohnheiten", title: "Gewohnheiten", icon: "check-circle", color: "teal", load: () => import("./gewohnheiten.js") },
  { id: "rechnungen", title: "Rechnungen", icon: "file-text", color: "green", wide: true, load: () => import("./rechnungen/index.js") },
  { id: "training", title: "Training", icon: "dumbbell", color: "orange", load: () => import("./training.js") },
  { id: "uni", title: "Uni", icon: "graduation-cap", color: "blue", wide: true, load: () => import("./uni.js") },
  { id: "rezepte", title: "Rezepte", icon: "utensils", color: "yellow", wide: true, load: () => import("./rezepte.js") },
  { id: "reflektor", title: "Lebensreflektor", icon: "sparkles", color: "purple", load: () => import("./reflektor/index.js") },
  { id: "news", title: "News", icon: "newspaper", color: "pink", load: () => import("./news.js") },
  { id: "video", title: "Video zu Text", icon: "video", color: "indigo", load: () => import("./video.js") },
  { id: "pdf", title: "PDF komprimieren", icon: "file-down", color: "brown", load: () => import("./pdf.js") },
  { id: "englisch", title: "Englisch", icon: "languages", color: "cyan", soon: "Phase 5", text: "Englisch lernen." },
  { id: "trading", title: "Trading", icon: "trending-up", color: "mint", soon: "Phase 5", text: "Trading." }
];

export const SETTINGS_MODULE = { id: "einstellungen", title: "Einstellungen", icon: "settings", color: "gray", load: () => import("./einstellungen.js") };
// „Mehr“: Liste aller Bereiche, die nicht in der Tab-Leiste stehen (am Handy)
export const MORE_MODULE = { id: "mehr", title: "Mehr", icon: "more", color: "gray", load: () => import("./mehr.js") };
/** Tab-Leiste unten am Handy: höchstens 4 Bereiche + „Mehr“ */
export const BAR_MAX = 4;

export const DEFAULT_BAR = ["dashboard", "schach", "gewohnheiten", "rechnungen"];

// Kacheln auf „Heute“. "module" lädt die Datei, die die Kachel zeichnet (export widgets = { id: render }).
// head = Abschnittsüberschrift über der Gruppe, link = „Alle ›“ rechts daneben.
// kind "row": eine Listenzeile; direkt aufeinanderfolgende Zeilen landen in einer gemeinsamen Gruppe „Überblick“.
export const WIDGETS = [
  { id: "habits-today", title: "Gewohnheiten heute", head: "Gewohnheiten", link: "gewohnheiten", module: "gewohnheiten" },
  { id: "last-training", title: "Training: Fortschritt", head: "Training", link: "training", module: "training" },
  { id: "next-exam", title: "Nächste Uni-Prüfung", module: "uni", kind: "row" },
  { id: "open-invoices", title: "Offene Rechnungen", module: "rechnungen", kind: "row" },
  { id: "thought", title: "Gedanke des Tages", head: "Gedanke des Tages", link: "reflektor", module: "reflektor", wide: true },
  { id: "gratitude", title: "Check-in heute (Dankbarkeit)", head: "Check-in", link: "reflektor", module: "reflektor" },
  { id: "memory", title: "Erinnerung (gelegentlich)", head: "Erinnerung", link: "reflektor", module: "reflektor" }
];

export const moduleById = id => id === SETTINGS_MODULE.id ? SETTINGS_MODULE : id === MORE_MODULE.id ? MORE_MODULE : MODULES.find(m => m.id === id);
