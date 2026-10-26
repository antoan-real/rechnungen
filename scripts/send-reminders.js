// Verschickt fällige Gewohnheits-Erinnerungen als Push-Nachricht (Firebase Cloud Messaging).
// Läuft über GitHub Actions alle 15 Minuten (.github/workflows/reminders.yml).
// Braucht das Secret FIREBASE_SERVICE_ACCOUNT (JSON des Firebase-Dienstkontos).
import admin from "firebase-admin";
import { dueReminders } from "../js/modules/habits-core.js";
import { dueReflect, periodKey, reflectionId } from "../js/modules/reflect-core.js";

const CATCH_UP_MINUTES = 120; // ältere, verpasste Erinnerungen werden nicht mehr verschickt

// Zusammenfassung als Hinweis am GitHub-Lauf (sichtbar in der Übersicht des Laufs)
const notice = (level, msg) => console.log(process.env.GITHUB_ACTIONS ? `::${level} title=Erinnerungen::${msg}` : msg);

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  notice("error", "Secret FIREBASE_SERVICE_ACCOUNT fehlt (GitHub → Settings → Secrets and variables → Actions).");
  process.exit(1);
}
let account;
try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
catch { notice("error", "Secret FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON. Bitte den kompletten Inhalt der Datei einfügen."); process.exit(1); }
if (account.project_id !== "rechnungsbuch") notice("warning", `Dienstkonto gehört zu Projekt "${account.project_id}", erwartet "rechnungsbuch".`);
admin.initializeApp({ credential: admin.credential.cert(account) });
const db = admin.firestore();

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

let tokenDocs;
try { tokenDocs = await db.collectionGroup("pushTokens").get(); }
catch (e) { notice("error", `Zugriff auf Firestore fehlgeschlagen: ${e.message}`); process.exit(1); }
const byUser = new Map();
for (const d of tokenDocs.docs) {
  const uid = d.ref.parent.parent.id;
  if (!byUser.has(uid)) byUser.set(uid, []);
  byUser.get(uid).push(d);
}
console.log(`${byUser.size} Nutzer mit Push-Geräten`);

let sentTotal = 0;
for (const [uid, tokens] of byUser) {
  try {
    const base = db.collection("users").doc(uid);
    const settings = (await base.collection("settings").doc("app").get()).data() || {};
    let tz = settings.timezone || "Europe/Berlin";
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = "Europe/Berlin"; }
    const { date, hhmm } = localNow(tz);

    const habits = (await base.collection("habits").get()).docs.map(d => ({ id: d.id, ...d.data() }));
    const log = (await base.collection("habitLogs").doc(date).get()).data() || {};
    const stateRef = base.collection("reminderState").doc(date);
    const sent = (await stateRef.get()).data()?.sent || {};
    const reflectCfg = (await base.collection("settings").doc("reflect").get()).data() || {};
    const reflectState = {
      journal: (await base.collection("journal").doc(date).get()).data() || {},
      hasWeek: (await base.collection("reflections").doc(reflectionId("week", periodKey("week", date))).get()).exists,
      hasMonth: (await base.collection("reflections").doc(reflectionId("month", periodKey("month", date))).get()).exists
    };

    const messages = [];
    const due = dueReminders(habits, log, date, hhmm, sent, CATCH_UP_MINUTES);
    if (due.length) messages.push({
      keys: due.map(h => h.id), url: "./#gewohnheiten", tag: `habits-${date}-${due.map(h => h.id).join("-")}`,
      title: due.length === 1 ? "Erinnerung" : `${due.length} Gewohnheiten offen`,
      body: due.map(h => (h.emoji ? h.emoji + " " : "") + h.name).join(", ")
    });
    for (const r of dueReflect(reflectCfg, reflectState, date, hhmm, sent, CATCH_UP_MINUTES))
      messages.push({ keys: [r.key], url: "./#reflektor", tag: `${r.key}-${date}`, title: r.title, body: r.body });
    if (!messages.length) continue;

    const delivered = [];
    for (const m of messages) {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: tokens.map(t => t.get("token")),
        data: { title: m.title, body: m.body, tag: m.tag, url: m.url },
        webpush: { headers: { Urgency: "high", TTL: "7200" } }
      });
      // abgemeldete Geräte entfernen
      await Promise.all(res.responses.map((r, i) => {
        const code = r.error?.code || "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) {
          console.log(`Token entfernt (${code})`);
          return tokens[i].ref.delete();
        }
        if (r.error) console.warn("Fehler beim Senden:", code, r.error.message);
      }));
      if (res.successCount > 0) { delivered.push(...m.keys); sentTotal++; }
    }
    if (delivered.length) await stateRef.set({ date, sent: Object.fromEntries(delivered.map(k => [k, true])) }, { merge: true });
  } catch (e) {
    console.error(`Nutzer ${uid}:`, e.message);
  }
}
notice("notice", `Verbindung zu Firebase ok · ${byUser.size} Nutzer mit Push-Geräten (${tokenDocs.size} Geräte) · ${sentTotal} Nachricht(en) verschickt`);
