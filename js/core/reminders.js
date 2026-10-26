// Erinnerungen, solange die App geöffnet ist (auch im Hintergrund-Tab).
// Für Erinnerungen bei geschlossener App braucht es einen Server – siehe README „Erinnerungen“.
import { watchCollection, watchDoc } from "./data.js";
import { today, weekday } from "./dates.js";
import { isDone, isScheduled, valueOf, reminderDays } from "../modules/habits-core.js";

const FIRED_KEY = "db-reminders-fired";

function firedToday() {
  try { const o = JSON.parse(localStorage.getItem(FIRED_KEY) || "{}"); return o.date === today() ? o : { date: today(), ids: [] }; }
  catch (e) { return { date: today(), ids: [] }; }
}
function markFired(ids) {
  const o = firedToday(); o.ids.push(...ids);
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(o)); } catch (e) {}
}

async function notify(title, body, ctx) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, { body, tag: "habits-" + today(), icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: "./#gewohnheiten" } }); return; }
      new Notification(title, { body, icon: "icons/icon-192.png" }); return;
    } catch (e) { /* fällt auf Hinweis in der App zurück */ }
  }
  ctx.toast(`${title}: ${body}`, { action: { label: "Öffnen", run: () => ctx.navigate("gewohnheiten") }, duration: 12000 });
}

export function startReminders(ctx) {
  let habits = [], log = null, day = today();
  const stopHabits = watchCollection("habits", list => { habits = list; check(); });
  let stopLog = watchDoc("habitLogs", day, d => { log = d; check(); });

  function check() {
    if (log === null && !habits.length) return;
    const now = new Date(), d = today();
    if (d !== day) { day = d; stopLog(); log = null; stopLog = watchDoc("habitLogs", day, x => { log = x; check(); }); return; }
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const fired = firedToday().ids;
    const logs = { [d]: log || {} };
    const due = habits.filter(h => h.reminder?.enabled && h.reminder.time && h.reminder.time <= hhmm
      && reminderDays(h).includes(weekday(d)) && isScheduled(h, d)
      && !isDone(h, valueOf(logs, d, h.id)) && !fired.includes(h.id));
    if (!due.length) return;
    markFired(due.map(h => h.id));
    const names = due.map(h => (h.emoji ? h.emoji + " " : "") + h.name);
    notify(due.length === 1 ? "Erinnerung" : `${due.length} Gewohnheiten offen`, names.join(", "), ctx);
  }
  const timer = setInterval(check, 30000);
  const onVis = () => { if (document.visibilityState === "visible") check(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { clearInterval(timer); stopHabits(); stopLog(); document.removeEventListener("visibilitychange", onVis); };
}
