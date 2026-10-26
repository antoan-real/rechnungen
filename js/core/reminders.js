// Erinnerungen, solange die App geöffnet ist (auch im Hintergrund-Tab): Gewohnheiten und Lebensreflektor.
// Bei geschlossener App verschickt scripts/send-reminders.js Push-Nachrichten (siehe push.js).
// Beide Wege tragen versendete Erinnerungen in users/{uid}/reminderState/{Tag} ein,
// damit keine Erinnerung doppelt kommt.
import { watchCollection, watchDoc, merge } from "./data.js";
import { today } from "./dates.js";
import { dueReminders } from "../modules/habits-core.js";
import { dueReflect, periodKey, reflectionId, todaysCard } from "../modules/reflect-core.js";

async function notify(title, body, tag, url, ctx) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url } };
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return; }
      new Notification(title, opts); return;
    } catch (e) { /* fällt auf Hinweis in der App zurück */ }
  }
  // Hinweis in der App nur als Vorschau; die vollständige Karte öffnet „Öffnen“
  const preview = body.length > 120 ? body.slice(0, body.lastIndexOf(" ", 120)) + " …" : body;
  ctx.toast(`${title}: ${preview}`, { action: { label: "Öffnen", run: () => ctx.navigate(url.split("#")[1]) }, duration: 12000 });
}

export function startReminders(ctx) {
  let habits = null, reflectCfg = null, cards = null, day = today();
  const s = { log: null, sent: null, journal: null, hasWeek: null, hasWheel: null };
  const stops = [
    watchCollection("habits", list => { habits = list; check(); }),
    watchCollection("cards", list => { cards = list; check(); }),
    watchDoc("settings", "reflect", d => { reflectCfg = d || {}; check(); })
  ];
  let dayStops = [];
  function watchDay() {
    dayStops.forEach(f => f());
    Object.keys(s).forEach(k => { s[k] = null; });
    dayStops = [
      watchDoc("habitLogs", day, d => { s.log = d || {}; check(); }),
      watchDoc("reminderState", day, d => { s.sent = d?.sent || {}; check(); }),
      watchDoc("journal", day, d => { s.journal = d || {}; check(); }),
      watchDoc("reflections", reflectionId("week", periodKey("week", day)), d => { s.hasWeek = !!d; check(); }),
      watchDoc("wheel", periodKey("month", day), d => { s.hasWheel = !!d; check(); })
    ];
  }
  watchDay();

  function check() {
    const d = today();
    if (d !== day) { day = d; watchDay(); return; }
    if (habits === null || reflectCfg === null || cards === null || Object.values(s).some(v => v === null)) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const messages = [];
    const due = dueReminders(habits, s.log, d, hhmm, s.sent);
    if (due.length) messages.push({
      keys: due.map(h => h.id), url: "./#gewohnheiten", tag: `habits-${d}-${due.map(h => h.id).join("-")}`,
      title: due.length === 1 ? "Erinnerung" : `${due.length} Gewohnheiten offen`,
      body: due.map(h => (h.emoji ? h.emoji + " " : "") + h.name).join(", ")
    });
    for (const r of dueReflect(reflectCfg, { ...s, card: todaysCard(cards, reflectCfg, d).card }, d, hhmm, s.sent)) messages.push({ keys: [r.key], url: "./#reflektor", tag: `${r.key}-${d}`, title: r.title, body: r.body });
    if (!messages.length) return;
    const mark = Object.fromEntries(messages.flatMap(m => m.keys).map(k => [k, true]));
    Object.assign(s.sent, mark);
    merge("reminderState", d, { date: d, sent: mark }).catch(() => {});
    messages.forEach(m => notify(m.title, m.body, m.tag, m.url, ctx));
  }
  const timer = setInterval(check, 30000);
  const onVis = () => { if (document.visibilityState === "visible") check(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { clearInterval(timer); stops.forEach(f => f()); dayStops.forEach(f => f()); document.removeEventListener("visibilitychange", onVis); };
}
