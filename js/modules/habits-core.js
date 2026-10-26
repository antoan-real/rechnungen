// Gewohnheiten: Rechenlogik, die Bereich, Dashboard und Erinnerungen teilen.
// Datenmodell:
//   users/{uid}/habits/{id}     { name, emoji, type: "check"|"qty", target, unit, step, days: [0..6],
//                                 reminder: { enabled, time: "HH:MM", mode: "daily"|"days", days: [0..6] },
//                                 order, startDate: "YYYY-MM-DD", createdAt }
//   users/{uid}/habitLogs/{YYYY-MM-DD}  { date, v: { [habitId]: Zahl } }   (abgehakt = 1 bzw. erreichte Menge)
import { weekday, addDays, today } from "../core/dates.js";

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const habitDays = h => (h.days && h.days.length ? h.days : ALL_DAYS);
export const target = h => (h.type === "qty" ? Math.max(Number(h.target) || 1, 0.0001) : 1);
export const valueOf = (logs, iso, id) => Number(logs[iso]?.v?.[id] || 0);
export const isDone = (h, val) => (val || 0) >= target(h) - 1e-9;
export function isScheduled(h, iso) {
  if (h.startDate && iso < h.startDate) return false;
  return habitDays(h).includes(weekday(iso));
}
export const sortHabits = list => list.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));

/** Aktuelle Serie: heute zählt mit, wenn erledigt; ist heute noch offen, bricht die Serie nicht. */
export function currentStreak(h, logs, now = today()) {
  let d = now, n = 0;
  if (isScheduled(h, d) && !isDone(h, valueOf(logs, d, h.id))) d = addDays(d, -1);
  for (let i = 0; i < 2000; i++) {
    if (h.startDate && d < h.startDate) break;
    if (isScheduled(h, d)) {
      if (isDone(h, valueOf(logs, d, h.id))) n++; else break;
    }
    d = addDays(d, -1);
  }
  return n;
}

export function bestStreak(h, logs, now = today()) {
  if (!h.startDate) return currentStreak(h, logs, now);
  let best = 0, run = 0;
  for (let d = h.startDate, i = 0; d <= now && i < 3000; d = addDays(d, 1), i++) {
    if (!isScheduled(h, d)) continue;
    if (isDone(h, valueOf(logs, d, h.id))) { run++; best = Math.max(best, run); }
    else if (d !== now) run = 0;
  }
  return best;
}

/** Erfüllungsquote der letzten n Tage (nur geplante Tage, heute nur wenn erledigt). */
export function rate(h, logs, n = 30, now = today()) {
  let planned = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const d = addDays(now, -i);
    if (!isScheduled(h, d)) continue;
    const ok = isDone(h, valueOf(logs, d, h.id));
    if (d === now && !ok) continue;
    planned++; if (ok) done++;
  }
  return planned ? Math.round((done / planned) * 100) : null;
}

export function reminderDays(h) {
  const r = h.reminder || {};
  return r.mode === "days" && r.days?.length ? r.days : habitDays(h);
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/** Fällige Erinnerungen an einem Tag zur Uhrzeit hhmm ("HH:MM"). sent = { habitId: true } bereits verschickt.
 *  catchUp = wie viele Minuten nach der Uhrzeit eine verpasste Erinnerung noch kommt. Genutzt von App und Server. */
export function dueReminders(habits, log, date, hhmm, sent = {}, catchUp = Infinity) {
  const min = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const logs = { [date]: log || {} };
  return habits.filter(h => h.reminder?.enabled && h.reminder.time
    && h.reminder.time <= hhmm && min(hhmm) - min(h.reminder.time) <= catchUp
    && reminderDays(h).includes(weekday(date)) && isScheduled(h, date)
    && !isDone(h, valueOf(logs, date, h.id)) && !sent[h.id]);
}
