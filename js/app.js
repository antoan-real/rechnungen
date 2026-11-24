// Einstieg: Anmeldung, Kopfleiste mit Tabs und „Mehr“-Menü, Router über #bereich.
import { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "./firebase.js";
import { setUser, onDataError } from "./core/data.js";
import { startSettings, getSettings, onSettings, saveSettings, navLayout, applyTheme, effectiveTheme, onSystemTheme } from "./core/settings.js";
import { icon, moduleIcon } from "./core/icons.js";
import { $, esc, toast, openSheet, confirmBox } from "./core/ui.js";
import { moduleById } from "./modules/registry.js";
import { startReminders } from "./core/reminders.js";
import { refreshPush } from "./core/push.js";

const view = $("#view");
let user = null, cleanup = null, routeToken = 0, stopSettings = null, stopReminders = null, stopNav = null;

const ctx = {
  get user() { return user; },
  toast, openSheet, confirmBox,
  settings: getSettings, saveSettings, onSettings,
  navigate: id => { location.hash = id; },
  logout: async () => { try { localStorage.removeItem("rb-draft-" + user?.uid); } catch (e) {} await signOut(auth); }
};

/* ---------- Anmeldung ---------- */
const AUTH_ERR = {
  "auth/invalid-credential": "E-Mail oder Passwort ist falsch.",
  "auth/invalid-login-credentials": "E-Mail oder Passwort ist falsch.",
  "auth/wrong-password": "E-Mail oder Passwort ist falsch.",
  "auth/user-not-found": "E-Mail oder Passwort ist falsch.",
  "auth/invalid-email": "Diese E-Mail-Adresse ist nicht gültig.",
  "auth/email-already-in-use": "Für diese E-Mail gibt es schon ein Konto. Melde dich an.",
  "auth/weak-password": "Das Passwort braucht mindestens 6 Zeichen.",
  "auth/too-many-requests": "Zu viele Versuche. Bitte kurz warten.",
  "auth/network-request-failed": "Keine Internetverbindung.",
  "auth/operation-not-allowed": "Registrierung ist in Firebase ausgeschaltet (Authentication → Einstellungen).",
  "auth/unauthorized-domain": "Diese Adresse ist in Firebase nicht freigegeben (Authentication → Einstellungen → Autorisierte Domains)."
};
const authMsg = e => AUTH_ERR[e.code] || e.message || String(e);

function renderLogin() {
  const box = $("#login");
  let mode = "login";
  const draw = () => {
    box.innerHTML = `<form class="card" id="lf" novalidate>
      <div class="brandline"><span class="splash-logo" aria-hidden="true"></span><div><b>Daily Begleiter</b><small>${mode === "login" ? "Anmelden" : "Neues Konto anlegen"}</small></div></div>
      <label class="field"><span>E-Mail</span><input class="input" type="email" id="l-email" autocomplete="username" inputmode="email" required></label>
      <label class="field"><span>Passwort</span><input class="input" type="password" id="l-pass" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required minlength="6"></label>
      <p class="err" id="l-err" role="alert" hidden></p>
      <button type="submit" class="btn primary" id="l-go">${mode === "login" ? "Anmelden" : "Konto anlegen"}</button>
      <div class="row" style="justify-content:space-between">
        <button type="button" class="linkbtn" id="l-mode">${mode === "login" ? "Neues Konto anlegen" : "Ich habe schon ein Konto"}</button>
        ${mode === "login" ? `<button type="button" class="linkbtn" id="l-reset">Passwort vergessen</button>` : ""}
      </div>
    </form>`;
    const err = m => { $("#l-err").textContent = m; $("#l-err").hidden = !m; };
    $("#lf").onsubmit = async e => {
      e.preventDefault(); err("");
      const email = $("#l-email").value.trim(), pass = $("#l-pass").value;
      if (!email || !pass) { err("Bitte E-Mail und Passwort eingeben."); return; }
      $("#l-go").disabled = true;
      try { mode === "login" ? await signInWithEmailAndPassword(auth, email, pass) : await createUserWithEmailAndPassword(auth, email, pass); }
      catch (ex) { err(authMsg(ex)); $("#l-go").disabled = false; }
    };
    $("#l-mode").onclick = () => { mode = mode === "login" ? "register" : "login"; draw(); $("#l-email").focus(); };
    $("#l-reset") && ($("#l-reset").onclick = async () => {
      const email = $("#l-email").value.trim();
      if (!email) { err("Bitte zuerst die E-Mail-Adresse eingeben."); $("#l-email").focus(); return; }
      try { await sendPasswordResetEmail(auth, email); err(""); toast(`E-Mail zum Zurücksetzen an ${email} gesendet.`); }
      catch (ex) { err(authMsg(ex)); }
    });
  };
  draw();
  box.hidden = false;
  $("#l-email").focus();
}

/* ---------- Hell/Dunkel-Umschalter (oben rechts bzw. in der Seitenleiste) ---------- */
function renderThemeBtns() {
  const dark = effectiveTheme() === "dark";
  document.querySelectorAll(".theme-btn").forEach(b => {
    b.innerHTML = icon(dark ? "sun" : "moon", { size: 19 });
    b.setAttribute("aria-label", dark ? "Helles Design" : "Dunkles Design");
    b.title = dark ? "Helles Design" : "Dunkles Design";
  });
}
document.querySelectorAll(".theme-btn").forEach(b => b.onclick = () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  if (user) saveSettings({ theme: next }).catch(() => {});
});
document.addEventListener("db-theme", renderThemeBtns);
onSystemTheme(renderThemeBtns);

/* ---------- Navigation: Tab-Leiste unten (Handy, 4 Bereiche + Mehr), Seitenleiste (Desktop, alle Bereiche) ---------- */
function renderNav(activeId) {
  const { order, bar, more } = navLayout();
  const cur = id => id === activeId ? 'aria-current="page"' : "";
  const moreActive = activeId === "mehr" || more.includes(activeId) || activeId === "einstellungen";
  $("#tabbar").innerHTML = bar.map(id => {
    const m = moduleById(id);
    return `<a href="#${id}" ${cur(id)}>${icon(m.icon, { size: 25, stroke: 1.8 })}<span>${esc(m.title)}</span></a>`;
  }).join("") + `<a href="#mehr" ${moreActive ? 'aria-current="page"' : ""}>${icon("more", { size: 25, stroke: 1.8 })}<span>Mehr</span></a>`;
  $("#side-nav").innerHTML = order.map(id => {
    const m = moduleById(id);
    return `<a href="#${id}" ${cur(id)}>${moduleIcon(m, "sm")}<span style="flex:1">${esc(m.title)}</span>${m.soon ? `<span class="soon">bald</span>` : ""}</a>`;
  }).join("");
  $("#side-foot").innerHTML = `<a href="#einstellungen" ${cur("einstellungen")}>${moduleIcon(moduleById("einstellungen"), "sm")}<span>Einstellungen</span></a>`;
}

/* ---------- Router ---------- */
async function route() {
  if (!user) return;
  const id = decodeURIComponent(location.hash.slice(1)) || "dashboard";
  const m = moduleById(id) || moduleById("dashboard");
  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  view.innerHTML = "";
  view.classList.toggle("wide", !!m.wide);
  $("#main").classList.toggle("wide", !!m.wide);
  view.classList.toggle("bleed", !!m.bleed); $("#main").classList.toggle("bleed", !!m.bleed);
  renderNav(m.id);
  document.title = m.id === "dashboard" ? "Daily Begleiter" : `${m.title} · Daily Begleiter`;
  if (m.soon) {
    view.innerHTML = `<div class="soon-page"><span class="badge">Kommt in ${esc(m.soon)}</span><h1>${esc(m.title)}</h1><p class="muted">${esc(m.text || "")}</p><a class="btn" href="#dashboard">Zur Startseite</a></div>`;
    return;
  }
  try {
    const mod = await m.load();
    if (token !== routeToken) return;
    cleanup = mod.mount(view, ctx) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><p class="err">Dieser Bereich konnte nicht geladen werden: ${esc(e.message)}</p></div>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- Start ---------- */
onDataError(e => {
  console.error(e);
  const b = $("#banner");
  if (e.code === "permission-denied") {
    b.innerHTML = `<span><b>Keine Berechtigung für deine Daten.</b> Die Firestore-Regeln in Firebase lassen den Zugriff nicht zu. Anleitung: README, Abschnitt „Firestore-Regeln“.</span>`;
  } else {
    b.textContent = `Fehler beim Laden der Daten: ${e.code || e.message}`;
  }
  b.hidden = false;
});

onAuthStateChanged(auth, async u => {
  $("#splash").hidden = true;
  if (stopSettings) { stopSettings(); stopSettings = null; }
  if (stopReminders) { stopReminders(); stopReminders = null; }
  if (stopNav) { stopNav(); stopNav = null; }
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  user = u;
  if (!u) { $("#shell").hidden = true; renderLogin(); return; }
  $("#login").hidden = true; $("#login").innerHTML = "";
  setUser(u.uid);
  $("#shell").hidden = false;
  view.innerHTML = `<div class="empty">Lade …</div>`;
  stopSettings = await startSettings();
  // Einmalig: neuer Hauptbereich „Schach“ an Platz 2 der Tab-Leiste (der bisher letzte Platz rückt unter „Mehr“)
  { const st = getSettings();
    if (st.nav?.bar && !st.nav.schachAdded && !st.nav.bar.includes("schach")) {
      const { order, bar } = navLayout(st);
      const nb = [...bar.slice(0, 1), "schach", ...bar.slice(1)].slice(0, 4);
      saveSettings({ nav: { ...st.nav, order, bar: nb, schachAdded: true } }).catch(() => {});
    } }
  stopNav = onSettings(() => renderNav((decodeURIComponent(location.hash.slice(1)) || "dashboard")));
  renderThemeBtns();
  stopReminders = startReminders(ctx);
  refreshPush();
  route();
});

/* ---------- PWA ---------- */
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; });
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          toast("Neue Version verfügbar.", { action: { label: "Neu laden", run: () => nw.postMessage("skipWaiting") }, duration: 20000 });
        }
      });
    });
  }).catch(e => console.warn("Service Worker:", e));
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
}
