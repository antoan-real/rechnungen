// Push-Erinnerungen bei geschlossener App: Dieses Gerät meldet sich bei Firebase Cloud Messaging an
// und speichert seinen Token unter users/{uid}/pushTokens. Versendet werden die Nachrichten von
// scripts/send-reminders.js (GitHub Actions, alle 15 Minuten).
import { app, VAPID_KEY } from "../firebase.js";
import { put, merge, remove } from "./data.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
const FLAG = "db-push";

export const pushConfigured = () => !!VAPID_KEY;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushOnHere = () => { try { return localStorage.getItem(FLAG) === "on"; } catch (e) { return false; } };

function tokenId(token) {
  let h = 5381;
  for (let i = 0; i < token.length; i++) h = ((h << 5) + h + token.charCodeAt(i)) >>> 0;
  return "t" + h.toString(36) + token.length.toString(36);
}

async function currentToken() {
  const { getMessaging, getToken } = await import(SDK);
  const reg = await navigator.serviceWorker.ready;
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

async function saveToken(token) {
  const now = new Date().toISOString();
  await put("pushTokens", tokenId(token), { token, ua: navigator.userAgent.slice(0, 200), updatedAt: now });
  await merge("settings", "app", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin" });
  try { localStorage.setItem(FLAG, "on"); localStorage.setItem(FLAG + "-token", token); } catch (e) {}
}

/** Push auf diesem Gerät einschalten. Wirft einen Fehler mit verständlicher Meldung. */
export async function enablePush() {
  if (!pushConfigured()) throw new Error("Push ist noch nicht eingerichtet (Web-Push-Schlüssel fehlt).");
  if (!pushSupported()) throw new Error("Dieser Browser unterstützt keine Push-Nachrichten. Auf dem iPhone muss die App auf dem Home-Bildschirm installiert sein.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Benachrichtigungen wurden nicht erlaubt.");
  const token = await currentToken();
  if (!token) throw new Error("Kein Push-Token erhalten.");
  await saveToken(token);
}

export async function disablePush() {
  let token = null;
  try { token = localStorage.getItem(FLAG + "-token"); } catch (e) {}
  try {
    const { getMessaging, deleteToken } = await import(SDK);
    await deleteToken(getMessaging(app));
  } catch (e) { console.warn(e); }
  if (token) await remove("pushTokens", tokenId(token));
  try { localStorage.removeItem(FLAG); localStorage.removeItem(FLAG + "-token"); } catch (e) {}
}

/** Beim Start: Token auffrischen (Tokens ändern sich gelegentlich). */
export async function refreshPush() {
  if (!pushOnHere() || !pushConfigured() || !pushSupported() || Notification.permission !== "granted") return;
  try {
    const token = await currentToken();
    let old = null; try { old = localStorage.getItem(FLAG + "-token"); } catch (e) {}
    if (old && old !== token) await remove("pushTokens", tokenId(old));
    if (token) await saveToken(token);
  } catch (e) { console.warn("Push-Token:", e); }
}
