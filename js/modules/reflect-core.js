// Lebensreflektor: gemeinsame Logik für App und scripts/send-reminders.js.
// Datenmodell (users/{uid}/…):
//   cards/{id}           { title, text, category, source, favorite, notes: [{ id, date, text }], starter, createdAt }
//   journal/{YYYY-MM-DD} { date, gratitude: [3 Texte], moment, mood (1–5), updatedAt }   – täglicher Check-in
//   complaints/{id}      { date, text, question, cardId, reframe, createdAt }               – Meckern umdrehen
//   people/{id}          { name, relation, entries: [{ id, type, text, date }], createdAt }  – Menschen
//   reflections/week-YYYY-Www { type: "week", period, date, answers: [{ q, a }] }          – Rauszoomen
//   wheel/{YYYY-MM}      { month, scores: { areaId: 1–10 }, note }                          – Lebensrad
//   settings/reflect     { questions: { week }, areas: [{ id, name }], reminders, moodEnabled, wheelEnabled,
//                          weeksEnabled, birthday, cardsSeeded, today: { date, cardId },
//                          tabs: { order: [abschnittId], place: { abschnittId: "bar"|"more"|"off" } } }
import { weekday, weekKey, monthKey, lastDayOfMonth, isoWeek, addDays } from "../core/dates.js";

export const DEFAULT_QUESTIONS = {
  week: [
    "Was war diese Woche wirklich wichtig, und was hat nur Energie gekostet?",
    "Mit wem habe ich Zeit verbracht, die mir gutgetan hat?",
    "Welche Kleinigkeit habe ich diese Woche für selbstverständlich gehalten?",
    "Worauf will ich mit 80 zurückblicken?",
    "Wann war ich diese Woche ganz im Moment?",
    "Wem möchte ich sagen, dass ich ihn schätze – und warum habe ich es noch nicht getan?",
    "Was habe ich aufgeschoben, und warum?",
    "Lebe ich gerade nach dem, was mir wirklich wichtig ist?",
    "Wofür bin ich diese Woche besonders dankbar?",
    "Was möchte ich nächste Woche bewusster erleben?"
  ]
};
export const DEFAULT_AREAS = [
  { id: "gesundheit", name: "Gesundheit" }, { id: "familie", name: "Familie & Beziehungen" },
  { id: "studium", name: "Studium & Karriere" }, { id: "finanzen", name: "Finanzen" },
  { id: "entwicklung", name: "Persönliche Entwicklung" }, { id: "freizeit", name: "Freizeit" }
];
export const DEFAULT_REMINDERS = {
  daily: { enabled: false, time: "21:00" },               // Check-in
  card: { enabled: false, time: "08:00" },                // Gedanke des Tages
  week: { enabled: false, time: "18:00", weekday: 0 },    // Rauszoomen, 0 = Sonntag
  month: { enabled: false, time: "18:00", day: 0 }        // Lebensrad, 0 = letzter Tag im Monat
};
export const REFRAME_QUESTIONS = [
  "Wie würde jemand das sehen, der diese Möglichkeit nicht hat?",
  "Wofür ist das eigentlich ein Zeichen, dass ich es habe?",
  "Wird das in einem Jahr noch wichtig sein?",
  "Was müsste ich verloren haben, damit mir genau das fehlt?",
  "Wem verdanke ich, dass ich mich überhaupt darüber ärgern kann?",
  "Was würde ich jemandem raten, der sich gerade genau darüber aufregt?"
];
export const ENTRY_TYPES = ["Geschichte", "Spruch", "Eigenart"];

export const QUESTIONS_PER_WEEK = 3;
export const periodKey = (type, date) => (type === "week" ? weekKey(date) : monthKey(date));
export const reflectionId = (type, key) => `${type}-${key}`;
export const questionsOf = cfg => ({ week: cfg?.questions?.week?.length ? cfg.questions.week : DEFAULT_QUESTIONS.week });
export const areasOf = cfg => (cfg?.areas?.length ? cfg.areas : DEFAULT_AREAS);
export const remindersOf = cfg => Object.fromEntries(Object.keys(DEFAULT_REMINDERS).map(k => [k, { ...DEFAULT_REMINDERS[k], ...(cfg?.reminders?.[k] || {}) }]));
export const optionsOf = cfg => ({ mood: cfg?.moodEnabled !== false, wheel: cfg?.wheelEnabled !== false, weeks: cfg?.weeksEnabled !== false, birthday: cfg?.birthday || "" });

/** Die Fragen einer Woche: rotieren mit der Kalenderwoche durch den Fragenkatalog. */
export function questionsFor(type, date, cfg) {
  const pool = questionsOf(cfg).week;
  const n = Math.min(QUESTIONS_PER_WEEK, pool.length);
  const start = (isoWeek(date).week * n) % pool.length;
  return Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]);
}

export const gratitudeDone = journal => (journal?.gratitude || []).some(t => String(t || "").trim());

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Gedanke des Tages: fest für einen Tag, Favoriten dreimal so oft, nicht zweimal hintereinander dieselbe Karte. */
export function cardOfDay(cards, date) {
  const list = (cards || []).filter(c => c.title || c.text).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!list.length) return null;
  const total = list.reduce((a, c) => a + (c.favorite ? 3 : 1), 0);
  const raw = (d, salt = "") => {
    let r = hash(d + salt) % total;
    for (const c of list) { r -= c.favorite ? 3 : 1; if (r < 0) return c; }
    return list[0];
  };
  // von einer Woche vorher aus vorwärts rechnen, damit jeder Tag denselben Vorgänger sieht
  let prev = raw(addDays(date, -7));
  for (let i = 6; i >= 0; i--) {
    const d = addDays(date, -i);
    let c = raw(d);
    if (list.length > 1 && c.id === prev.id) { const alt = raw(d, "#"); c = alt.id !== prev.id ? alt : list[(list.indexOf(prev) + 1) % list.length]; }
    prev = c;
  }
  return prev;
}

/** Karte des Tages: einmal gezogen, wird sie in settings/reflect.today gespeichert, damit App, Startseite und
 *  Push-Dienst denselben Gedanken zeigen (auch wenn sich Favoriten im Lauf des Tages ändern). */
export function todaysCard(cards, cfg, date) {
  if (cfg?.today?.date === date) { const c = (cards || []).find(x => x.id === cfg.today.cardId); if (c) return { card: c, stored: true }; }
  return { card: cardOfDay(cards, date), stored: false };
}

/** Einfache Wortliste zum Vergleichen von Texten (Meckern ↔ Karten). */
export function terms(text) {
  const stop = new Set("aber alle auch auf aus bei bin bis das dass dem den der des die dich dir doch ein eine einem einen einer es für hab habe hat heute ich ihm ihn ihr im in ist ja jetzt kann mal man mich mir mit muss nach nicht noch nur oder schon sein sich sie so und uns vom von vor war was weil wenn wie wieder wir wird zu zum zur immer total echt einfach gerade schon wieder voll leer viel viele sehr ganz gar kein keine heute morgen".split(" "));
  return String(text || "").toLowerCase().replace(/ß/g, "ss").split(/[^a-zäöü]+/).filter(w => w.length > 2 && !stop.has(w)).map(w => (w.length > 5 ? w.replace(/(en|er|es|e|n|s)$/, "") : w));
}
// Ärger-Themen → passende Kategorien und Begriffe, die in den Karten vorkommen
const TOPICS = [
  [/\b(bahn|zug|bus|s-bahn|u-bahn)|verkehr|stau|verspät|rettungswagen|sirene|ampel|parkplatz/, ["Privilegien"], ["verkehr", "rettungswag", "bushaltestell", "busfahr"]],
  [/\buni|klausur|hausarbeit|prüfung|lernen|vorlesung|studium|\bnote|seminar/, ["Bildung & Arbeit", "Selbstwert"], ["hausarbeit", "klausur", "studi"]],
  [/arbeit|\bjob|chef|kolleg|stress|termin|montag|wecker|meeting/, ["Bildung & Arbeit"], ["stress", "montag", "job"]],
  [/mama|papa|eltern|mutter|vater|familie|bruder|schwester|\boma|\bopa/, ["Familie & Alltag"], ["mama", "papa", "eltern"]],
  [/wohnung|nachbar|küche|\bzimmer|miete/, ["Privilegien"], ["wohnung", "nachbarn", "küche"]],
  [/essen|kochen|kühlschrank|hunger|einkauf/, ["Privilegien", "Familie & Alltag"], ["kühlschrank", "essen"]],
  [/arzt|krank|wartezimmer|schmerz|erkält|apotheke/, ["Körper & Gesundheit"], ["arzt", "wartezimm", "krank"]],
  [/müde|aufstehen|\bbett|schlaf/, ["Körper & Gesundheit"], ["bett", "körp"]],
  [/handy|instagram|tiktok|social|vergleich/, ["Achtsamkeit", "Selbstwert"], ["handy", "instagram"]],
  [/freund|streit|\bwut|wütend|genervt|beziehung/, ["Beziehungen"], ["streit", "ärger"]],
  [/wetter|regen|kalt|warten|langeweil|duschen|wasser/, ["Achtsamkeit", "Privilegien"], ["wass", "langeweil"]]
];
/** Passende Perspektiv-Karte zu einem Ärger: Wortüberschneidung + Themen-Kategorie, sonst zufällig. */
export function matchCard(text, cards, seed = "") {
  if (!cards?.length) return null;
  const low = String(text).toLowerCase(), hit = TOPICS.filter(([re]) => re.test(low));
  const q = new Set([...terms(text), ...hit.flatMap(([, , extra]) => extra)]);
  const cats = new Set(hit.flatMap(([, c]) => c));
  let best = null, bestScore = 0;
  for (const c of cards) {
    const words = new Set(terms(c.title + " " + c.text));
    // lange, seltene Wörter zählen mehr als kurze
    let score = [...q].filter(w => words.has(w)).reduce((a, w) => a + (w.length >= 6 ? 3 : 1.5), 0) + (cats.has(c.category) ? 2 : 0) + (c.favorite ? 0.5 : 0);
    score += (hash(seed + c.id) % 100) / 1000; // gleichwertige Karten abwechseln
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 1 ? best : cards[hash(seed + text) % cards.length];
}

/** Fällige Erinnerungen. state: { journal, hasWeek, hasWheel, card } für den Tag (card = Gedanke des Tages). */
export function dueReflect(cfg, state, date, hhmm, sent = {}, catchUp = Infinity) {
  const r = remindersOf(cfg), opt = optionsOf(cfg);
  const min = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const timeOk = t => t && t <= hhmm && min(hhmm) - min(t) <= catchUp;
  const due = [];
  if (r.card.enabled && timeOk(r.card.time) && state.card && !sent["reflect-card"])
    due.push({ key: "reflect-card", title: `Gedanke des Tages: ${state.card.title}`, body: state.card.text });
  if (r.daily.enabled && timeOk(r.daily.time) && !gratitudeDone(state.journal) && !sent["reflect-daily"])
    due.push({ key: "reflect-daily", title: "Dein Check-in", body: "Drei Dinge, für die du heute dankbar bist – gern auch Kleinigkeiten." });
  if (r.week.enabled && weekday(date) === Number(r.week.weekday) && timeOk(r.week.time) && !state.hasWeek && !sent["reflect-week"])
    due.push({ key: "reflect-week", title: "Rauszoomen", body: questionsFor("week", date, cfg)[0] });
  const day = Number(r.month.day) || lastDayOfMonth(date);
  if (opt.wheel && r.month.enabled && Number(date.slice(8, 10)) === Math.min(day, lastDayOfMonth(date)) && timeOk(r.month.time) && !state.hasWheel && !sent["reflect-month"])
    due.push({ key: "reflect-month", title: "Lebensrad", body: "Wie zufrieden bist du gerade mit deinen Lebensbereichen?" });
  return due;
}
