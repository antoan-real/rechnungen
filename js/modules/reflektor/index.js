// Lebensreflektor: sich im Alltag bewusst bleiben, wie wertvoll die gewöhnlichen Dinge, die Menschen und die
// eigenen Möglichkeiten sind. Rahmen mit Unterbereichen, „Heute“ (Gedanke des Tages + Check-in), Einstellungen
// und Startseiten-Kacheln. Logik und Datenmodell: ../reflect-core.js
import { icon } from "../../core/icons.js";
import { $, $$, esc, openSheet, toast } from "../../core/ui.js";
import { merge } from "../../core/data.js";
import { today, addDays, parseDay, weekday, WD_ORDER } from "../../core/dates.js";
import { questionsOf, areasOf, remindersOf, optionsOf, periodKey, reflectionId, DEFAULT_QUESTIONS, DEFAULT_AREAS } from "../reflect-core.js";
import { openStore, pickToday, saveJournal, cardHtml, lookbacks, randomMemory, autoGrow, isTyping, fail, shortDay, monthName } from "./shared.js";
import { renderCards, renderComplaints, renderPeople, renderZoom, openCard } from "./views.js";
import { renderWheel, renderWeeks, renderReview } from "./views2.js";

function ensureCss() {
  if (document.getElementById("rf-css")) return;
  const l = document.createElement("link"); l.id = "rf-css"; l.rel = "stylesheet";
  l.href = new URL("./reflektor.css", import.meta.url).href;
  document.head.appendChild(l);
}

const MOODS = [[1, "schwer"], [2, "mäßig"], [3, "okay"], [4, "gut"], [5, "sehr gut"]];
const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Abschnitte: in der Leiste, im „Mehr“-Menü oder ausgeblendet; Reihenfolge frei (settings/reflect.tabs).
const SECTIONS = [["heute", "Heute"], ["karten", "Perspektiv-Karten"], ["meckern", "Meckern umdrehen"], ["menschen", "Menschen"],
  ["rauszoomen", "Rauszoomen"], ["lebensrad", "Lebensrad"], ["wochen", "Leben in Wochen"], ["rueckblick", "Rückblick"]];
const DEFAULT_PLACE = { heute: "bar", karten: "bar", meckern: "bar", rauszoomen: "bar", menschen: "more", lebensrad: "more", wochen: "more", rueckblick: "more" };
const sectionTitle = id => SECTIONS.find(x => x[0] === id)?.[1] || id;
export function sectionLayout(cfg) {
  const ids = SECTIONS.map(x => x[0]), saved = (cfg?.tabs?.order || []).filter(id => ids.includes(id));
  const order = [...saved, ...ids.filter(id => !saved.includes(id))];
  const place = Object.fromEntries(ids.map(id => [id, cfg?.tabs?.place?.[id] || DEFAULT_PLACE[id]]));
  if (cfg?.wheelEnabled === false) place.lebensrad = "off";
  if (cfg?.weeksEnabled === false) place.wochen = "off";
  if (place.heute === "off") place.heute = "bar"; // „Heute“ bleibt immer erreichbar
  return { order, place, bar: order.filter(id => place[id] === "bar"), more: order.filter(id => place[id] === "more") };
}

export function mount(el, ctx) {
  ensureCss();
  let tab = sessionStorage.getItem("rf-tab") || "heute", pending = false;
  const ui = { heute: {}, karten: {}, meckern: {}, menschen: {}, rauszoomen: {}, lebensrad: {}, wochen: {}, rueckblick: {} };
  el.innerHTML = `<div class="rf">
    <div class="page-head"><div><h1>Lebensreflektor</h1><p>Das Gewöhnliche wertschätzen, bevor es fehlt.</p></div>
      <button type="button" class="round-btn" id="rf-settings" aria-label="Einstellungen Lebensreflektor" title="Einstellungen">${icon("settings", { size: 20 })}</button></div>
    <div class="rf-nav">
      <nav class="rf-tabs uline-tabs" id="rf-tabs" role="tablist" aria-label="Bereiche des Lebensreflektors"></nav>
      <div class="more" id="rf-more">
        <button type="button" class="more-btn" id="rf-more-btn" aria-haspopup="menu" aria-expanded="false"></button>
        <div class="more-menu" id="rf-more-menu" role="menu" hidden></div>
      </div>
    </div>
    <div id="rf-body"><div class="empty">Lade …</div></div></div>`;
  const body = $("#rf-body", el);
  const store = openStore(() => render());
  const st = store.st;
  const views = {
    heute: renderToday, karten: renderCards, meckern: renderComplaints, menschen: renderPeople,
    rauszoomen: renderZoom, lebensrad: renderWheel, wochen: renderWeeks, rueckblick: renderReview
  };
  let cleanup = null;

  function render(force) {
    if (!st.cfg) return;
    if (!force && isTyping(body)) { pending = true; return; }
    pending = false;
    const lay = sectionLayout(st.cfg);
    if (lay.place[tab] === "off") tab = "heute";
    $("#rf-tabs", el).innerHTML = lay.bar.map(id => `<button type="button" role="tab" data-t="${id}" aria-selected="${id === tab}">${esc(sectionTitle(id))}</button>`).join("");
    const inMore = lay.more.includes(tab);
    $("#rf-more-btn", el).innerHTML = `${inMore ? esc(sectionTitle(tab)) : "Mehr"} ${icon("chevron-down", { size: 16 })}`;
    $("#rf-more-btn", el).classList.toggle("active", inMore);
    $("#rf-more-menu", el).innerHTML = lay.more.map(id => `<button type="button" role="menuitem" data-t="${id}" ${id === tab ? 'aria-current="true"' : ""}>${esc(sectionTitle(id))}</button>`).join("")
      + `${lay.more.length ? "<hr>" : ""}<button type="button" role="menuitem" data-cfg>Abschnitte anpassen</button>`;
    if (cleanup) { cleanup(); cleanup = null; }
    body.onclick = body.oninput = body.onchange = body.onkeydown = null;
    cleanup = views[tab](body, st, ctx, ui[tab], { go, rerender: () => render(true) }) || null;
  }
  function go(t, opts = {}) { tab = t; sessionStorage.setItem("rf-tab", t); Object.assign(ui[t], opts); render(true); window.scrollTo({ top: 0 }); }
  $("#rf-tabs", el).onclick = e => { const b = e.target.closest("[data-t]"); if (b) go(b.dataset.t); };
  const menu = $("#rf-more-menu", el), mbtn = $("#rf-more-btn", el);
  const closeMenu = () => { menu.hidden = true; mbtn.setAttribute("aria-expanded", "false"); };
  mbtn.onclick = () => { const open = menu.hidden; menu.hidden = !open; mbtn.setAttribute("aria-expanded", String(open)); if (open) menu.querySelector("button")?.focus(); };
  menu.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    closeMenu();
    if (b.dataset.t) go(b.dataset.t);
    if (b.hasAttribute("data-cfg") && st.cfg) openSettings(st, ctx, { sections: true });
  };
  const onDocClick = e => { if (!e.target.closest("#rf-more")) closeMenu(); };
  const onKey = e => { if (e.key === "Escape" && !menu.hidden) { closeMenu(); mbtn.focus(); } };
  document.addEventListener("click", onDocClick); document.addEventListener("keydown", onKey);
  const onOut = () => setTimeout(() => { if (pending && !isTyping(body)) render(true); }, 0);
  el.addEventListener("focusout", onOut);
  $("#rf-settings", el).onclick = () => st.cfg && openSettings(st, ctx);
  return () => { el.removeEventListener("focusout", onOut); document.removeEventListener("click", onDocClick); document.removeEventListener("keydown", onKey); if (cleanup) cleanup(); store.stop(); };
}

/* ---------- Heute ---------- */
function renderToday(box, st, ctx, ui, nav) {
  const d = today();
  ui.day = ui.day || d;
  const card = pickToday(st, d), opt = optionsOf(st.cfg);
  const j = st.journal[ui.day] || {}, g = j.gratitude || [];
  const weekDone = !!st.reflections[reflectionId("week", periodKey("week", d))];
  const r = remindersOf(st.cfg);
  const showZoom = sectionLayout(st.cfg).place.rauszoomen !== "off" && !weekDone && ((weekday(d) - Number(r.week.weekday) + 7) % 7 <= 2);
  const showWheel = opt.wheel && !st.wheel[periodKey("month", d)] && Number(d.slice(8)) >= 25;
  const looks = lookbacks(st, d);
  box.innerHTML = `<div class="rf-cols">
    <div class="stack">
      ${card ? cardHtml(card, { label: "Gedanke des Tages", actions: `
        <button type="button" class="fav" data-fav="${esc(card.id)}" aria-pressed="${!!card.favorite}" aria-label="${card.favorite ? "Favorit entfernen" : "Als Favorit markieren"}">${icon("heart", { size: 22, fill: !!card.favorite })}</button>
        <button type="button" class="btn small" id="td-note">Wo ist mir das heute begegnet?</button>
        <button type="button" class="btn small ghost" data-open="${esc(card.id)}">Karte öffnen</button>` }) : `<div class="card empty">Die Perspektiv-Karten werden eingerichtet …</div>`}
      <form class="card stack" id="td-noteform" hidden><label class="field"><span>Wo ist dir der Gedanke heute im Alltag begegnet?</span><textarea class="input" id="td-notetext" rows="3"></textarea></label>
        <div class="row"><button type="submit" class="btn primary small">Notiz speichern</button><button type="button" class="btn small" id="td-notecancel">Abbrechen</button></div></form>
      ${looks.map(l => `<div class="lookback"><small>${esc(l.label)} · ${esc(shortDay(l.date))}</small>${l.lines.map(x => `<p class="serif"><span class="muted small">${esc(x.kind)}:</span> ${esc(x.text)}</p>`).join("")}</div>`).join("")}
      ${showZoom ? `<button type="button" class="card row rf-link" data-go="rauszoomen"><span><b>Diese Woche rauszoomen</b><br><span class="muted small">Ein paar Minuten für die größeren Fragen.</span></span>${icon("chevron-right")}</button>` : ""}
      ${showWheel ? `<button type="button" class="card row rf-link" data-go="lebensrad"><span><b>Lebensrad für ${esc(monthName(d.slice(0, 7)))}</b><br><span class="muted small">Wie zufrieden bist du gerade mit deinen Lebensbereichen?</span></span>${icon("chevron-right")}</button>` : ""}
    </div>
    <section class="card stack" id="checkin">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>Check-in</h2>
        <div class="row" style="flex-wrap:nowrap;gap:4px"><button type="button" class="btn icon small" id="ci-prev" aria-label="Vorheriger Tag">${icon("chevron-left")}</button>
        <span class="small" style="min-width:104px;text-align:center">${ui.day === d ? "Heute" : ui.day === addDays(d, -1) ? "Gestern" : esc(parseDay(ui.day).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }))}</span>
        <button type="button" class="btn icon small" id="ci-next" ${ui.day >= d ? "disabled" : ""} aria-label="Nächster Tag">${icon("chevron-right")}</button></div></div>
      <p class="muted small" style="margin:0">Drei Dinge, für die du dankbar bist – gern auch Kleinigkeiten.</p>
      ${[0, 1, 2].map(i => `<label class="grat"><b aria-hidden="true">${i + 1}</b><textarea class="input" rows="1" data-g="${i}" aria-label="Dankbar für ${i + 1}" placeholder="${["Ich bin dankbar für …", "Und für …", "Und für …"][i]}">${esc(g[i] || "")}</textarea></label>`).join("")}
      <label class="field"><span>Ein Alltagsmoment, den du festhalten willst (optional)</span>
        <textarea class="input" id="ci-moment" rows="2" placeholder="z. B. Papa saß wieder in seinem Sessel und hat Nachrichten geschaut">${esc(j.moment || "")}</textarea></label>
      ${opt.mood ? `<div class="field"><span>Wie geht es dir heute? (optional)</span><div class="mood" id="ci-mood">${MOODS.map(([v, l]) => `<button type="button" data-m="${v}" aria-pressed="${j.mood === v}" aria-label="Stimmung ${v}: ${l}"><span>${v}</span>${l}</button>`).join("")}</div></div>` : ""}
      <p class="note saved-note" id="ci-saved" aria-live="polite"></p>
    </section></div>`;
  $$("textarea", box).forEach(autoGrow);

  let t = 0, dirty = false;
  const day = ui.day;
  const save = async () => {
    clearTimeout(t);
    if (!dirty) return; // nur speichern, was wirklich eingegeben wurde
    dirty = false;
    const gratitude = $$("[data-g]", box).map(x => x.value), moment = $("#ci-moment", box).value;
    await saveJournal(day, { gratitude, moment });
    const s = $("#ci-saved", box); if (s) s.textContent = "Gespeichert.";
  };
  $("#checkin", box).oninput = e => { if (e.target.tagName === "TEXTAREA") { dirty = true; autoGrow(e.target); clearTimeout(t); t = setTimeout(save, 900); $("#ci-saved", box).textContent = ""; } };
  $("#checkin", box).addEventListener("focusout", () => save());
  const mood = $("#ci-mood", box);
  if (mood) mood.onclick = async e => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    await save();
    const v = +b.dataset.m;
    saveJournal(day, { mood: (st.journal[day] || {}).mood === v ? null : v });
  };
  $("#ci-prev", box).onclick = async () => { await save(); ui.day = addDays(ui.day, -1); nav.rerender(); };
  $("#ci-next", box).onclick = async () => { await save(); if (ui.day < d) ui.day = addDays(ui.day, 1); nav.rerender(); };

  box.onclick = e => {
    const f = e.target.closest("[data-fav]");
    if (f) { const c = st.cards.find(x => x.id === f.dataset.fav); merge("cards", c.id, { favorite: !c.favorite }).catch(fail); return; }
    const o = e.target.closest("[data-open]"); if (o) { openCard(st, o.dataset.open, ctx); return; }
    const gt = e.target.closest("[data-go]"); if (gt) { nav.go(gt.dataset.go); return; }
    if (e.target.id === "td-note") { $("#td-noteform", box).hidden = false; $("#td-notetext", box).focus(); }
    if (e.target.id === "td-notecancel") { $("#td-noteform", box).hidden = true; }
  };
  const nf = $("#td-noteform", box);
  if (nf) nf.onsubmit = async e => {
    e.preventDefault();
    const text = $("#td-notetext", box).value.trim(); if (!text || !card) return;
    document.activeElement?.blur();
    await merge("cards", card.id, { notes: [...(card.notes || []), { id: Date.now().toString(36), date: today(), text }] }).catch(fail);
    toast("Notiz gespeichert – du findest sie unter der Karte.");
  };
  return () => { clearTimeout(t); save(); };
}

/* ---------- Einstellungen ---------- */
function openSettings(st, ctx, opts = {}) {
  const cfg = st.cfg, r = remindersOf(cfg), opt = optionsOf(cfg);
  let areas = areasOf(cfg).map(a => ({ ...a }));
  const lay = sectionLayout(cfg), sec = { order: lay.order.slice(), place: { ...lay.place } };
  openSheet((s, close) => {
    const timeIn = (id, v) => `<input class="input" type="time" id="${id}" value="${esc(v)}" style="max-width:120px">`;
    const sw = (id, on, label) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} aria-label="${esc(label)}"><span></span></label>`;
    const draw = () => {
      s.innerHTML = `<div class="sheet-head"><h3>Lebensreflektor – Einstellungen</h3></div>
        <div class="stack" id="o-sections"><div><h2>Abschnitte</h2><p class="note" style="margin-top:4px">Leiste = immer sichtbar, Mehr = im Menü rechts, Aus = ausgeblendet. Reihenfolge mit den Pfeilen.</p></div>
          <ul class="sortlist sec-list" id="o-sec"></ul></div>
        <div class="stack"><h2>Check-in und Leben in Wochen</h2>
          <div class="row" style="justify-content:space-between"><span>Stimmung im Check-in (1–5)</span>${sw("o-mood", opt.mood, "Stimmung")}</div>
          <label class="field" style="max-width:220px"><span>Geburtsdatum (für „Leben in Wochen“)</span><input class="input" type="date" id="o-birth" value="${esc(opt.birthday)}"></label></div>
        <div class="stack"><h2>Erinnerungen</h2>
          <div class="row" style="justify-content:space-between"><span>Gedanke des Tages</span><div class="row" style="flex-wrap:nowrap">${timeIn("r-card", r.card.time)}${sw("r-card-on", r.card.enabled, "Gedanke des Tages")}</div></div>
          <div class="row" style="justify-content:space-between"><span>Check-in</span><div class="row" style="flex-wrap:nowrap">${timeIn("r-daily", r.daily.time)}${sw("r-daily-on", r.daily.enabled, "Check-in")}</div></div>
          <div class="row" style="justify-content:space-between"><span>Rauszoomen</span><div class="row" style="flex-wrap:nowrap">
            <select class="input" id="r-week-day" style="max-width:140px" aria-label="Wochentag">${WD_ORDER.map(x => `<option value="${x}" ${Number(r.week.weekday) === x ? "selected" : ""}>${WD_LONG[x]}</option>`).join("")}</select>${timeIn("r-week", r.week.time)}${sw("r-week-on", r.week.enabled, "Rauszoomen")}</div></div>
          <div class="row" style="justify-content:space-between"><span>Lebensrad</span><div class="row" style="flex-wrap:nowrap">
            <select class="input" id="r-month-day" style="max-width:140px" aria-label="Tag im Monat"><option value="0" ${!Number(r.month.day) ? "selected" : ""}>letzter Tag</option>${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${Number(r.month.day) === i + 1 ? "selected" : ""}>${i + 1}.</option>`).join("")}</select>${timeIn("r-month", r.month.time)}${sw("r-month-on", r.month.enabled, "Lebensrad")}</div></div>
          <p class="note">Erinnerungen kommen nur, wenn der Eintrag noch fehlt (der Gedanke des Tages kommt immer). Bei geschlossener App per Push – dafür unter App-Einstellungen „Push auch bei geschlossener App“ einschalten.</p></div>
        <div class="stack"><h2>Fragen fürs Rauszoomen</h2>
          <label class="field"><span>Eine Frage pro Zeile. Jede Woche erscheinen drei davon, wechselnd.</span><textarea class="input" id="o-questions" rows="8">${esc(questionsOf(cfg).week.join("\n"))}</textarea></label>
          <button type="button" class="linkbtn" id="o-qreset" style="align-self:flex-start">Standardfragen wiederherstellen</button></div>
        <div class="stack"><h2>Lebensbereiche (Lebensrad)</h2>
          <div class="stack" id="o-areas" style="gap:8px">${areas.map((a, i) => `<div class="row" style="flex-wrap:nowrap" data-i="${i}"><input class="input" type="text" value="${esc(a.name)}" aria-label="Lebensbereich ${i + 1}"><button type="button" class="btn icon small danger" data-del aria-label="${esc(a.name)} entfernen">${icon("x")}</button></div>`).join("")}</div>
          <div class="row"><button type="button" class="btn small" id="o-addarea">+ Bereich</button><button type="button" class="linkbtn" id="o-areareset">Standardbereiche</button></div></div>
        <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
      s.classList.add("rf");
      drawSec();
      $("#o-sec", s).onclick = e => {
        const li = e.target.closest("li"); if (!li) return;
        const id = li.dataset.id, p = e.target.closest("[data-p]"), mv = e.target.closest("[data-mv]");
        if (p) sec.place[id] = p.dataset.p;
        if (mv) { const i = sec.order.indexOf(id), j = i + Number(mv.dataset.mv); [sec.order[i], sec.order[j]] = [sec.order[j], sec.order[i]]; }
        if (p || mv) { drawSec(); (mv ? $(`#o-sec [data-id="${id}"] [data-mv="${mv.dataset.mv}"]`, s) : null)?.focus(); }
      };
      $("[data-x]", s).onclick = close;
      $("#o-qreset", s).onclick = () => { $("#o-questions", s).value = DEFAULT_QUESTIONS.week.join("\n"); };
      $("#o-addarea", s).onclick = () => { readAreas(); areas.push({ id: "a" + Date.now().toString(36), name: "" }); draw(); s.querySelector("#o-areas .row:last-child input").focus(); };
      $("#o-areareset", s).onclick = () => { areas = DEFAULT_AREAS.map(a => ({ ...a })); draw(); };
      $("#o-areas", s).onclick = e => { if (!e.target.closest("[data-del]")) return; readAreas(); areas.splice(+e.target.closest("[data-i]").dataset.i, 1); draw(); };
      $("[data-save]", s).onclick = save;
    };
    function drawSec() {
      $("#o-sec", s).innerHTML = sec.order.map((id, i) => `<li data-id="${id}"><span class="name">${esc(sectionTitle(id))}</span>
        <button type="button" class="btn icon small" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(sectionTitle(id))} nach oben">${icon("arrow-up")}</button>
        <button type="button" class="btn icon small" data-mv="1" ${i === sec.order.length - 1 ? "disabled" : ""} aria-label="${esc(sectionTitle(id))} nach unten">${icon("arrow-down")}</button>
        <div class="seg" role="group" aria-label="${esc(sectionTitle(id))} anzeigen">${[["bar", "Leiste"], ["more", "Mehr"], ...(id === "heute" ? [] : [["off", "Aus"]])].map(([v, l]) => `<button type="button" data-p="${v}" aria-pressed="${sec.place[id] === v}">${l}</button>`).join("")}</div></li>`).join("");
    }
    const readAreas = () => $$("#o-areas [data-i]", s).forEach(rw => { areas[+rw.dataset.i].name = rw.querySelector("input").value; });
    async function save() {
      readAreas();
      const qs = $("#o-questions", s).value.split("\n").map(x => x.trim()).filter(Boolean);
      const ar = areas.filter(a => a.name.trim()).map(a => ({ id: a.id, name: a.name.trim() }));
      if (!qs.length) { toast("Bitte mindestens eine Frage behalten.", { error: true }); return; }
      if (ar.length < 3) { toast("Das Lebensrad braucht mindestens drei Bereiche.", { error: true }); return; }
      const v = id => $(id, s).value, on = id => $(id, s).checked;
      try {
        await merge("settings", "reflect", {
          moodEnabled: on("#o-mood"), wheelEnabled: sec.place.lebensrad !== "off", weeksEnabled: sec.place.wochen !== "off", birthday: v("#o-birth"),
          tabs: { order: sec.order, place: sec.place },
          questions: { week: qs }, areas: ar,
          reminders: {
            card: { enabled: on("#r-card-on"), time: v("#r-card") || "08:00" },
            daily: { enabled: on("#r-daily-on"), time: v("#r-daily") || "21:00" },
            week: { enabled: on("#r-week-on"), time: v("#r-week") || "18:00", weekday: Number(v("#r-week-day")) },
            month: { enabled: on("#r-month-on"), time: v("#r-month") || "18:00", day: Number(v("#r-month-day")) }
          }
        });
        close(); toast("Einstellungen gespeichert.");
      } catch (e) { fail(e); }
    }
    draw();
    if (opts.sections) setTimeout(() => $("#o-sections", s)?.scrollIntoView({ block: "start" }), 0);
  }, { label: "Einstellungen Lebensreflektor", noFocus: true });
}

/* ---------- Kacheln für die Startseite ---------- */
function tile(el, render) {
  ensureCss();
  el.classList.add("rf");
  const store = openStore(st => { if (!isTyping(el)) render(st); });
  el.innerHTML = `<div class="empty">Lade …</div>`;
  return () => { el.classList.remove("rf"); store.stop(); };
}
export const widgets = {
  thought(el, ctx) {
    return tile(el, st => {
      const c = pickToday(st, today());
      if (!c) { el.innerHTML = `<div class="tile-head"><h2>Gedanke des Tages</h2></div><p class="muted" style="margin:0">Die Karten werden eingerichtet …</p>`; return; }
      el.innerHTML = `<div class="tile-head"><h2>Gedanke des Tages</h2><a href="#reflektor">Alle Karten</a></div>
        <div class="stack" style="gap:10px"><h3 style="font-size:calc(20px * var(--fs));margin:0;line-height:1.3">${esc(c.title)}</h3>
        <p class="serif" style="font-size:calc(17px * var(--fs));line-height:1.5">${esc(c.text)}</p>
        <div class="row"><button type="button" class="fav" aria-pressed="${!!c.favorite}" aria-label="${c.favorite ? "Favorit entfernen" : "Als Favorit markieren"}">${icon("heart", { size: 22, fill: !!c.favorite })}</button>
        <button type="button" class="btn small" data-open>Notiz dazu</button></div></div>`;
      el.querySelector(".fav").onclick = () => merge("cards", c.id, { favorite: !c.favorite }).catch(fail);
      el.querySelector("[data-open]").onclick = () => openCard(st, c.id, ctx);
    });
  },
  gratitude(el) {
    return tile(el, st => {
      const d = today(), j = st.journal[d] || {}, g = (j.gratitude || []).filter(x => String(x || "").trim());
      if (g.length) {
        el.innerHTML = `<div class="tile-head"><h2>Check-in heute</h2><a href="#reflektor">Öffnen</a></div>
          <ul style="margin:0;padding-left:18px" class="serif">${g.map(t => `<li>${esc(t)}</li>`).join("")}</ul>${j.moment ? `<p class="note">Alltagsmoment: ${esc(j.moment)}</p>` : ""}`;
        return;
      }
      el.innerHTML = `<div class="tile-head"><h2>Check-in heute</h2><a href="#reflektor">Öffnen</a></div>
        <form class="stack" style="gap:8px">${[0, 1, 2].map(i => `<textarea class="input" rows="1" data-i="${i}" placeholder="${i + 1}. Ich bin dankbar für …" aria-label="Dankbar für ${i + 1}" style="min-height:40px"></textarea>`).join("")}
        <div><button type="submit" class="btn small primary">Speichern</button></div></form>`;
      el.querySelector("form").oninput = e => autoGrow(e.target);
      el.querySelector("form").onsubmit = async e => {
        e.preventDefault();
        const vals = $$("textarea", el).map(x => x.value);
        if (!vals.some(v => v.trim())) return;
        document.activeElement?.blur();
        await saveJournal(d, { gratitude: vals });
      };
    });
  },
  memory(el) {
    return tile(el, st => {
      const d = today();
      let h = 3; for (const ch of d) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
      const m = h % 2 === 0 ? randomMemory(st, d) : null; // gelegentlich, nicht jeden Tag
      el.hidden = !m;
      if (!m) return;
      el.innerHTML = `<div class="tile-head"><h2>Erinnerung</h2><a href="#reflektor">Rückblick</a></div>
        <p class="small muted" style="margin:0">${esc(shortDay(m.date))} · ${esc(m.kind)}</p><p class="serif" style="font-size:calc(17px * var(--fs))">${esc(m.text)}</p>`;
    });
  }
};
