// Erinnerungen, solange die App geöffnet ist (auch im Hintergrund-Tab).
// Bei geschlossener App verschickt scripts/send-reminders.js Push-Nachrichten (siehe push.js).
// Beide Wege tragen versendete Erinnerungen in users/{uid}/reminderState/{Tag} ein,
// damit keine Erinnerung doppelt kommt.
import { watchCollection, watchDoc, merge } from "./data.js";
import { today } from "./dates.js";
import { dueReminders } from "../modules/habits-core.js";

async function notify(title, body, tag, ctx) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: "./#gewohnheiten" } };
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return; }
      new Notification(title, opts); return;
    } catch (e) { /* fällt auf Hinweis in der App zurück */ }
  }
  ctx.toast(`${title}: ${body}`, { action: { label: "Öffnen", run: () => ctx.navigate("gewohnheiten") }, duration: 12000 });
}

export function startReminders(ctx) {
  let habits = [], log = null, sent = null, day = today();
  const stopHabits = watchCollection("habits", list => { habits = list; check(); });
  let stopLog = () => {}, stopSent = () => {};
  function watchDay() {
    stopLog(); stopSent(); log = null; sent = null;
    stopLog = watchDoc("habitLogs", day, d => { log = d || {}; check(); });
    stopSent = watchDoc("reminderState", day, d => { sent = d?.sent || {}; check(); });
  }
  watchDay();

  function check() {
    const d = today();
    if (d !== day) { day = d; watchDay(); return; }
    if (log === null || sent === null || !habits.length) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const due = dueReminders(habits, log, d, hhmm, sent);
    if (!due.length) return;
    const mark = Object.fromEntries(due.map(h => [h.id, true]));
    Object.assign(sent, mark);
    merge("reminderState", d, { date: d, sent: mark }).catch(() => {});
    const names = due.map(h => (h.emoji ? h.emoji + " " : "") + h.name);
    notify(due.length === 1 ? "Erinnerung" : `${due.length} Gewohnheiten offen`, names.join(", "), `habits-${d}-${due.map(h => h.id).join("-")}`, ctx);
  }
  const timer = setInterval(check, 30000);
  const onVis = () => { if (document.visibilityState === "visible") check(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { clearInterval(timer); stopHabits(); stopLog(); stopSent(); document.removeEventListener("visibilitychange", onVis); };
}
