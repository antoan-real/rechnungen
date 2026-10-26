// Verschickt fällige Gewohnheits-Erinnerungen als Push-Nachricht (Firebase Cloud Messaging).
// Läuft über GitHub Actions alle 15 Minuten (.github/workflows/reminders.yml).
// Braucht das Secret FIREBASE_SERVICE_ACCOUNT (JSON des Firebase-Dienstkontos).
import admin from "firebase-admin";
import { dueReminders } from "../js/modules/habits-core.js";

const CATCH_UP_MINUTES = 120; // ältere, verpasste Erinnerungen werden nicht mehr verschickt

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log("Secret FIREBASE_SERVICE_ACCOUNT fehlt – nichts zu tun.");
  process.exit(0);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

const tokenDocs = await db.collectionGroup("pushTokens").get();
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
    const due = dueReminders(habits, log, date, hhmm, sent, CATCH_UP_MINUTES);
    if (!due.length) continue;

    const names = due.map(h => (h.emoji ? h.emoji + " " : "") + h.name);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: tokens.map(t => t.get("token")),
      data: {
        title: due.length === 1 ? "Erinnerung" : `${due.length} Gewohnheiten offen`,
        body: names.join(", "),
        tag: `habits-${date}-${due.map(h => h.id).join("-")}`,
        url: "./#gewohnheiten"
      },
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
    if (res.successCount > 0) {
      await stateRef.set({ date, sent: Object.fromEntries(due.map(h => [h.id, true])) }, { merge: true });
      sentTotal += due.length;
    }
  } catch (e) {
    console.error(`Nutzer ${uid}:`, e.message);
  }
}
console.log(`${sentTotal} Erinnerung(en) verschickt`);
