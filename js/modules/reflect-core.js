// Lebensreflektor: Fragen-Rotation und Erinnerungsregeln (genutzt von App und scripts/send-reminders.js).
// Datenmodell:
//   users/{uid}/journal/{YYYY-MM-DD}       { date, gratitude: [3 Texte], updatedAt }
//   users/{uid}/reflections/{week-2026-W44 | month-2026-10}
//                                          { type: "week"|"month", period, date, answers: [{ q, a }], updatedAt }
//   users/{uid}/settings/reflect           { questions: { week: [...], month: [...] },
//                                            reminders: { daily: { enabled, time },
//                                                         week: { enabled, time, weekday },   // 0 = Sonntag
//                                                         month: { enabled, time, day } } }   // day 0 = letzter Tag
import { weekday, weekKey, monthKey, lastDayOfMonth, isoWeek } from "../core/dates.js";

export const DEFAULT_QUESTIONS = {
  week: [
    "Was war diese Woche wirklich wichtig?",
    "Was hat mir Energie gegeben – und was hat sie mir genommen?",
    "Worauf bin ich diese Woche stolz?",
    "Was habe ich gelernt?",
    "Was würde ich nächste Woche anders machen?",
    "Mit wem möchte ich mehr Zeit verbringen?",
    "Was habe ich aufgeschoben – und warum?",
    "Wofür will ich nächste Woche bewusst Zeit freihalten?"
  ],
  month: [
    "Worauf will ich mit 80 zurückblicken?",
    "Lebe ich nach meinen Werten?",
    "Was war der schönste Moment dieses Monats?",
    "Bringen mich meine Gewohnheiten dahin, wo ich hinwill?",
    "Was sollte ich loslassen?",
    "Wenn dieser Monat ein Kapitel meines Lebens wäre: Wie hieße es?",
    "Was ist mir wirklich wichtig – und wie viel Zeit habe ich dafür verwendet?",
    "Wofür möchte ich im nächsten Monat mehr Raum schaffen?"
  ]
};
export const DEFAULT_REMINDERS = {
  daily: { enabled: false, time: "21:00" },
  week: { enabled: false, time: "18:00", weekday: 0 },
  month: { enabled: false, time: "18:00", day: 0 }
};
export const QUESTIONS_PER_REFLECTION = 3;

export const periodKey = (type, date) => (type === "week" ? weekKey(date) : monthKey(date));
export const reflectionId = (type, key) => `${type}-${key}`;
export const questionsOf = cfg => ({
  week: cfg?.questions?.week?.length ? cfg.questions.week : DEFAULT_QUESTIONS.week,
  month: cfg?.questions?.month?.length ? cfg.questions.month : DEFAULT_QUESTIONS.month
});
export const remindersOf = cfg => ({
  daily: { ...DEFAULT_REMINDERS.daily, ...(cfg?.reminders?.daily || {}) },
  week: { ...DEFAULT_REMINDERS.week, ...(cfg?.reminders?.week || {}) },
  month: { ...DEFAULT_REMINDERS.month, ...(cfg?.reminders?.month || {}) }
});

/** Die Fragen eines Zeitraums: rotieren mit der Kalenderwoche bzw. dem Monat durch den Fragenpool. */
export function questionsFor(type, date, cfg) {
  const pool = questionsOf(cfg)[type];
  const n = Math.min(QUESTIONS_PER_REFLECTION, pool.length);
  const idx = type === "week" ? isoWeek(date).week : Number(date.slice(5, 7)) + Number(date.slice(0, 4)) * 12;
  const start = (idx * n) % pool.length;
  return Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]);
}

export const gratitudeDone = journal => (journal?.gratitude || []).some(t => String(t || "").trim());

/** Fällige Reflektor-Erinnerungen. state: { journal, hasWeek, hasMonth } für den Tag. */
export function dueReflect(cfg, state, date, hhmm, sent = {}, catchUp = Infinity) {
  const r = remindersOf(cfg);
  const min = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const timeOk = t => t && t <= hhmm && min(hhmm) - min(t) <= catchUp;
  const due = [];
  if (r.daily.enabled && timeOk(r.daily.time) && !gratitudeDone(state.journal) && !sent["reflect-daily"])
    due.push({ key: "reflect-daily", title: "Dankbarkeit", body: "Wofür bist du heute dankbar? Drei Dinge reichen." });
  if (r.week.enabled && weekday(date) === Number(r.week.weekday) && timeOk(r.week.time) && !state.hasWeek && !sent["reflect-week"])
    due.push({ key: "reflect-week", title: "Wochenrückblick", body: questionsFor("week", date, cfg)[0] });
  const day = Number(r.month.day) || lastDayOfMonth(date);
  if (r.month.enabled && Number(date.slice(8, 10)) === Math.min(day, lastDayOfMonth(date)) && timeOk(r.month.time) && !state.hasMonth && !sent["reflect-month"])
    due.push({ key: "reflect-month", title: "Monatsrückblick", body: questionsFor("month", date, cfg)[0] });
  return due;
}
