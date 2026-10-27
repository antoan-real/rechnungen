// Einstellungen: Name, Design, Navigation, Dashboard-Kacheln, Benachrichtigungen, Installation, Konto.
import { $, $$, esc } from "../core/ui.js";
import { navLayout, dashboardLayout, applyTheme, getView, applyView, ZOOM, FONT } from "../core/settings.js";
import { icon } from "../core/icons.js";
import { moduleById } from "./registry.js";
import { auth, sendPasswordResetEmail } from "../firebase.js";
import { pushConfigured, pushSupported, pushOnHere, enablePush, disablePush } from "../core/push.js";

export function mount(el, ctx) {
  const s = ctx.settings();
  el.innerHTML = `
    <div class="page-head"><div><h1>Einstellungen</h1><p>Änderungen werden sofort gespeichert.</p></div></div>
    <div class="grid-2">
      <section class="card stack">
        <h2>Allgemein</h2>
        <label class="field"><span>Dein Name (für „Hey …“ oben)</span><input class="input" type="text" id="st-name" autocomplete="given-name"></label>
        <div class="field"><span>Design</span>
          <div class="seg" id="st-theme" role="group" aria-label="Design">
            <button type="button" data-v="light">Hell</button><button type="button" data-v="dark">Dunkel</button><button type="button" data-v="system">Automatisch</button>
          </div></div>
        <div class="field"><span>Anzeigegröße (wie Strg + Mausrad: kleiner = mehr passt auf den Bildschirm)</span>
          <div class="scale-row"><button type="button" class="btn icon small" data-step="zoom:-1" aria-label="Anzeige verkleinern">${icon("minus")}</button>
          <input type="range" id="st-zoom" min="${ZOOM.min}" max="${ZOOM.max}" step="${ZOOM.step}" aria-label="Anzeigegröße">
          <button type="button" class="btn icon small" data-step="zoom:1" aria-label="Anzeige vergrößern">${icon("plus")}</button><b class="num" id="st-zoom-v"></b></div></div>
        <div class="field"><span>Schriftgröße</span>
          <div class="scale-row"><button type="button" class="btn icon small" data-step="font:-1" aria-label="Schrift verkleinern">${icon("minus")}</button>
          <input type="range" id="st-font" min="${FONT.min}" max="${FONT.max}" step="${FONT.step}" aria-label="Schriftgröße">
          <button type="button" class="btn icon small" data-step="font:1" aria-label="Schrift vergrößern">${icon("plus")}</button><b class="num" id="st-font-v"></b></div></div>
        <div class="row" style="justify-content:space-between"><p class="note">Gilt nur für dieses Gerät – Handy und PC getrennt.</p><button type="button" class="linkbtn" id="st-view-reset">Zurücksetzen</button></div>
      </section>

      <section class="card stack" id="notif">
        <h2>Benachrichtigungen</h2>
        <p class="note" id="nt-state"></p>
        <div class="row"><button type="button" class="btn" id="nt-ask">Benachrichtigungen erlauben</button><button type="button" class="btn" id="nt-test">Test senden</button></div>
        <p class="note">Erinnerungen stellst du bei jeder Gewohnheit ein.</p>
        <div class="stack" style="border-top:1px solid var(--line);padding-top:12px">
          <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><b>Push auch bei geschlossener App</b><p class="note" id="push-state" style="margin-top:2px"></p></div>
          <label class="switch"><input type="checkbox" id="push-on" aria-label="Push auf diesem Gerät"><span></span></label></div>
          <p class="note">Ein Dienst prüft etwa alle 15 Minuten, ob Erinnerungen fällig sind. Sie kommen deshalb bis zu ca. 15 Minuten nach der eingestellten Uhrzeit. Jedes Gerät wird einzeln eingeschaltet.</p>
        </div>
      </section>

      <section class="card stack">
        <div><h2>Navigation</h2><p class="note" style="margin-top:6px">Reihenfolge mit den Pfeilen ändern. Eingeschaltete Bereiche stehen in der Leiste, die anderen im „Mehr“-Menü.</p></div>
        <ul class="sortlist" id="st-nav"></ul>
      </section>

      <section class="card stack" id="dashboard">
        <div><h2>Startseite</h2><p class="note" style="margin-top:6px">Welche Kacheln erscheinen und in welcher Reihenfolge.</p></div>
        <ul class="sortlist" id="st-dash"></ul>
      </section>

      <section class="card stack">
        <h2>App installieren</h2>
        <p class="note" id="inst-text"></p>
        <button type="button" class="btn" id="inst-btn" hidden>Auf diesem Gerät installieren</button>
      </section>

      <section class="card stack">
        <h2>Konto</h2>
        <p style="margin:0">Angemeldet als <b id="acc-mail"></b></p>
        <div class="row"><button type="button" class="btn" id="acc-pw">Passwort ändern</button><button type="button" class="btn danger" id="acc-out">Abmelden</button></div>
      </section>
    </div>`;

  /* Allgemein */
  const name = $("#st-name", el);
  name.value = s.name || "";
  name.addEventListener("change", () => ctx.saveSettings({ name: name.value.trim() }));
  const drawTheme = th => $$("#st-theme button", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === (th || "system"))));
  drawTheme(s.theme);
  $("#st-theme", el).addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    drawTheme(b.dataset.v); applyTheme(b.dataset.v); ctx.saveSettings({ theme: b.dataset.v });
  });
  // Umschalten über die Kopfleiste spiegeln
  const onTheme = () => drawTheme(document.documentElement.dataset.theme || "system");
  document.addEventListener("db-theme", onTheme);

  /* Anzeigegröße und Schriftgröße (pro Gerät) */
  const pct = v => Math.round(v * 100) + " %";
  function drawView() {
    const v = getView();
    $("#st-zoom", el).value = v.zoom; $("#st-zoom-v", el).textContent = pct(v.zoom);
    $("#st-font", el).value = v.font; $("#st-font-v", el).textContent = pct(v.font);
  }
  const setView = patch => { applyView({ ...getView(), ...patch }); drawView(); };
  // Anzeigegröße erst beim Loslassen anwenden, sonst springt der Regler unter dem Finger weg
  $("#st-zoom", el).addEventListener("input", e => { $("#st-zoom-v", el).textContent = pct(+e.target.value); });
  $("#st-zoom", el).addEventListener("change", e => setView({ zoom: +e.target.value }));
  $("#st-font", el).addEventListener("input", e => setView({ font: +e.target.value }));
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-step]"); if (!b) return;
    const [k, d] = b.dataset.step.split(":"), lim = k === "zoom" ? ZOOM : FONT, v = getView()[k];
    setView({ [k]: Math.min(lim.max, Math.max(lim.min, v + Number(d) * lim.step)) });
  });
  $("#st-view-reset", el).onclick = () => setView({ zoom: 1, font: 1 });
  drawView();

  /* Navigation */
  function drawNav() {
    const { order, bar } = navLayout(ctx.settings());
    $("#st-nav", el).innerHTML = order.map((id, i) => {
      const m = moduleById(id);
      return `<li data-id="${id}">
        <span class="name">${esc(m.title)}${m.soon ? `<small>kommt in ${esc(m.soon)}</small>` : ""}</span>
        <button type="button" class="btn icon small" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(m.title)} nach oben">${icon("arrow-up")}</button>
        <button type="button" class="btn icon small" data-mv="1" ${i === order.length - 1 ? "disabled" : ""} aria-label="${esc(m.title)} nach unten">${icon("arrow-down")}</button>
        <label class="switch" title="In der Leiste"><input type="checkbox" ${bar.includes(id) ? "checked" : ""} aria-label="${esc(m.title)} in der Leiste"><span></span></label>
      </li>`;
    }).join("");
  }
  $("#st-nav", el).addEventListener("click", e => {
    const b = e.target.closest("button[data-mv]"); if (!b) return;
    const { order, bar } = navLayout(ctx.settings());
    const i = order.indexOf(b.closest("li").dataset.id), j = i + Number(b.dataset.mv);
    [order[i], order[j]] = [order[j], order[i]];
    ctx.saveSettings({ nav: { order, bar } });
  });
  $("#st-nav", el).addEventListener("change", e => {
    const id = e.target.closest("li").dataset.id;
    const { order, bar } = navLayout(ctx.settings());
    const next = e.target.checked ? [...bar, id] : bar.filter(x => x !== id);
    ctx.saveSettings({ nav: { order, bar: next } });
  });

  /* Startseite */
  function drawDash() {
    const list = dashboardLayout(ctx.settings());
    $("#st-dash", el).innerHTML = list.map((w, i) => `<li data-id="${w.id}">
        <span class="name">${esc(w.title)}${w.soon ? `<small>kommt in ${esc(w.soon)}</small>` : ""}</span>
        <button type="button" class="btn icon small" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(w.title)} nach oben">${icon("arrow-up")}</button>
        <button type="button" class="btn icon small" data-mv="1" ${i === list.length - 1 ? "disabled" : ""} aria-label="${esc(w.title)} nach unten">${icon("arrow-down")}</button>
        <label class="switch"><input type="checkbox" ${w.visible ? "checked" : ""} ${w.soon ? "disabled" : ""} aria-label="${esc(w.title)} anzeigen"><span></span></label>
      </li>`).join("");
  }
  const dashState = () => { const l = dashboardLayout(ctx.settings()); return { order: l.map(w => w.id), hidden: ctx.settings().dashboard?.hidden || [] }; };
  $("#st-dash", el).addEventListener("click", e => {
    const b = e.target.closest("button[data-mv]"); if (!b) return;
    const st = dashState();
    const i = st.order.indexOf(b.closest("li").dataset.id), j = i + Number(b.dataset.mv);
    [st.order[i], st.order[j]] = [st.order[j], st.order[i]];
    ctx.saveSettings({ dashboard: st });
  });
  $("#st-dash", el).addEventListener("change", e => {
    const id = e.target.closest("li").dataset.id, st = dashState();
    st.hidden = e.target.checked ? st.hidden.filter(x => x !== id) : [...new Set([...st.hidden, id])];
    ctx.saveSettings({ dashboard: st });
  });

  /* Benachrichtigungen */
  function drawNotif() {
    const p = "Notification" in window ? Notification.permission : "unsupported";
    $("#nt-state", el).textContent = {
      granted: "Erlaubt auf diesem Gerät.",
      denied: "Blockiert. Du kannst sie in den Browser- bzw. Systemeinstellungen für diese Seite wieder erlauben.",
      default: "Noch nicht erlaubt.",
      unsupported: "Dieser Browser kann keine Benachrichtigungen anzeigen. Auf dem iPhone geht das erst, wenn die App auf dem Home-Bildschirm installiert ist."
    }[p];
    $("#nt-ask", el).hidden = p !== "default";
    $("#nt-test", el).hidden = p !== "granted";
  }
  $("#nt-ask", el).onclick = async () => { await Notification.requestPermission(); drawNotif(); };
  $("#nt-test", el).onclick = async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opt = { body: "So sehen deine Erinnerungen aus.", icon: "icons/icon-192.png" };
    if (reg) reg.showNotification("Daily Begleiter", opt); else new Notification("Daily Begleiter", opt);
  };

  /* Push */
  function drawPush() {
    const box = $("#push-on", el), state = $("#push-state", el);
    box.checked = pushOnHere();
    box.disabled = !pushConfigured() || !pushSupported();
    state.textContent = !pushConfigured() ? "Noch nicht eingerichtet: Der Web-Push-Schlüssel fehlt in js/firebase.js."
      : !pushSupported() ? "Dieser Browser kann keine Push-Nachrichten empfangen. Auf dem iPhone zuerst die App zum Home-Bildschirm hinzufügen."
      : pushOnHere() ? "Auf diesem Gerät eingeschaltet." : "Auf diesem Gerät aus.";
  }
  $("#push-on", el).addEventListener("change", async e => {
    const on = e.target.checked; e.target.disabled = true;
    try { on ? await enablePush() : await disablePush(); ctx.toast(on ? "Push-Erinnerungen eingeschaltet." : "Push-Erinnerungen ausgeschaltet."); }
    catch (ex) { ctx.toast(ex.message, { error: true }); }
    drawPush(); drawNotif();
  });

  /* Installation */
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("#inst-text", el).textContent = standalone ? "Die App ist installiert und läuft im eigenen Fenster."
    : ios ? "Auf dem iPhone: In Safari unten auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen."
    : "Auf Android und am PC: Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.";
  const prompt = window.__installPrompt;
  if (prompt && !standalone) {
    $("#inst-btn", el).hidden = false;
    $("#inst-btn", el).onclick = async () => { prompt.prompt(); await prompt.userChoice; window.__installPrompt = null; $("#inst-btn", el).hidden = true; };
  }

  /* Konto */
  $("#acc-mail", el).textContent = ctx.user?.email || "";
  $("#acc-pw", el).onclick = async () => {
    try { await sendPasswordResetEmail(auth, ctx.user.email); ctx.toast(`Link zum Ändern des Passworts an ${ctx.user.email} gesendet.`); }
    catch (e) { ctx.toast(e.message, { error: true }); }
  };
  $("#acc-out", el).onclick = () => ctx.confirmBox("Wirklich abmelden?", "Abmelden", ctx.logout);

  drawNav(); drawDash(); drawNotif(); drawPush();
  if (location.hash === "#einstellungen" && sessionStorage.getItem("db-scroll") === "dashboard") { sessionStorage.removeItem("db-scroll"); $("#dashboard", el).scrollIntoView(); }
  const stop = ctx.onSettings(() => { drawNav(); drawDash(); });
  return () => { stop(); document.removeEventListener("db-theme", onTheme); };
}
