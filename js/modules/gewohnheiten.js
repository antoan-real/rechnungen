// Gewohnheiten: täglich abhaken oder Menge erfassen, Serien, Statistik, Erinnerungen.
// Datenmodell und Rechenlogik: siehe habits-core.js
import { $, $$, esc, openSheet, toast } from "../core/ui.js";
import { watchCollection, put, merge, remove, newId } from "../core/data.js";
import { today, addDays, parseDay, weekday, WD_SHORT, WD_ORDER } from "../core/dates.js";
import {
  ALL_DAYS, habitDays, target, valueOf, isDone, isScheduled, sortHabits,
  currentStreak, bestStreak, dayStreak, rate, fmtNum
} from "./habits-core.js";
import { icon, HABIT_ICONS } from "../core/icons.js";

const SUGGESTIONS = [
  { name: "Wasser trinken", icon: "droplet", type: "qty", target: 2, unit: "Liter", step: 0.25 },
  { name: "Lesen", icon: "book", type: "qty", target: 20, unit: "Seiten", step: 5 },
  { name: "Dehnen", icon: "activity", type: "check" },
  { name: "Spazieren gehen", icon: "leaf", type: "check" }
];
// Symbol einer Gewohnheit als Linien-Icon (früher gespeicherte Emojis werden nicht mehr angezeigt)
const hIcon = (h, size = 18) => icon(h.icon || "circle", { size });

/* ---------- gemeinsame Daten-Abos ---------- */
function subscribe(onChange) {
  const state = { habits: [], logs: {}, ready: { h: false, l: false } };
  const since = addDays(today(), -400);
  const s1 = watchCollection("habits", list => { state.habits = sortHabits(list); state.ready.h = true; onChange(state); });
  const s2 = watchCollection("habitLogs", list => {
    state.logs = Object.fromEntries(list.map(d => [d.id, d])); state.ready.l = true; onChange(state);
  }, { where: ["date", ">=", since] });
  return { state, stop: () => { s1(); s2(); } };
}

/* ---------- Abhaken / Menge ändern ---------- */
function setValue(h, day, val) {
  return merge("habitLogs", day, { date: day, v: { [h.id]: Math.max(0, Math.round(val * 1000) / 1000) } })
    .catch(e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }));
}
function toggle(h, day, logs) {
  const v = valueOf(logs, day, h.id);
  if (h.type === "qty") return setValue(h, day, v + (Number(h.step) || 1));
  return setValue(h, day, v >= 1 ? 0 : 1);
}

function editAmount(h, day, logs) {
  openSheet((s, close) => {
    s.innerHTML = `<div class="sheet-head"><h3>${esc(h.name)}</h3></div>
      <label class="field"><span>Menge am ${esc(dayLabel(day))} (${esc(h.unit || "")}, Ziel ${fmtNum(target(h))})</span>
      <input class="input num" type="text" inputmode="decimal" id="amt" value="${fmtNum(valueOf(logs, day, h.id))}"></label>
      <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-ok>Übernehmen</button></div>`;
    const ok = () => { const n = parseFloat($("#amt", s).value.replace(",", ".")); if (isFinite(n)) setValue(h, day, n); close(); };
    $("[data-x]", s).onclick = close; $("[data-ok]", s).onclick = ok;
    $("#amt", s).addEventListener("keydown", e => { if (e.key === "Enter") ok(); });
    setTimeout(() => $("#amt", s).select(), 50);
  }, { label: "Menge eintragen" });
}

function dayLabel(day) {
  if (day === today()) return "heute";
  if (day === addDays(today(), -1)) return "gestern";
  return parseDay(day).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" });
}

/* ---------- Zeilen (Bereich und Startseite) ---------- */
function rowHtml(h, day, logs, opts = {}) {
  const v = valueOf(logs, day, h.id), done = isDone(h, v), streak = currentStreak(h, logs);
  const meta = [];
  if (streak > 0) meta.push(`<span class="streak">${icon("flame", { size: 14 })} ${streak} ${streak === 1 ? "Tag" : "Tage"} in Folge</span>`);
  if (h.type === "qty") meta.push(`<span class="num">${fmtNum(v)} / ${fmtNum(target(h))} ${esc(h.unit || "")}</span>`);
  if (!opts.compact && h.reminder?.time) meta.push(`<button type="button" class="bell ${h.reminder.enabled ? "on" : ""}" data-act="bell" aria-pressed="${!!h.reminder.enabled}" title="Erinnerung ein/aus">${icon(h.reminder.enabled ? "bell" : "bell-off", { size: 15 })} ${esc(h.reminder.time)}</button>`);
  const action = h.type === "qty"
    ? `<div class="qty"><button type="button" class="btn" data-act="minus" aria-label="${esc(h.name)} weniger">${icon("minus")}</button>
        <button type="button" class="btn ${done ? "done" : ""}" data-act="plus" aria-label="${esc(h.name)} plus ${fmtNum(h.step || 1)}">${icon("plus")}</button></div>`
    : `<button type="button" class="check" data-act="toggle" aria-pressed="${done}" aria-label="${esc(h.name)} ${done ? "erledigt" : "abhaken"}"></button>`;
  const bar = h.type === "qty" ? `<div class="bar" aria-hidden="true"><i style="width:${Math.min(100, (v / target(h)) * 100)}%"></i></div>` : "";
  return `<div class="habit" data-id="${esc(h.id)}">
    <div class="hmain">
      <button type="button" class="hname" data-act="${opts.compact ? "goto" : "detail"}"><span class="hicon" aria-hidden="true">${hIcon(h)}</span><span>${esc(h.name)}</span></button>
      ${bar}${meta.length ? `<div class="hmeta">${meta.join("")}</div>` : ""}
    </div>${action}</div>`;
}

function handleRowClick(e, st, day, ctx, extra = {}) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const h = st.habits.find(x => x.id === b.closest(".habit").dataset.id); if (!h) return;
  const act = b.dataset.act;
  if (act === "toggle" || act === "plus") toggle(h, day, st.logs);
  if (act === "minus") setValue(h, day, valueOf(st.logs, day, h.id) - (Number(h.step) || 1));
  if (act === "bell") merge("habits", h.id, { reminder: { ...h.reminder, enabled: !h.reminder?.enabled } });
  if (act === "goto") ctx.navigate("gewohnheiten");
  if (act === "detail") extra.detail?.(h);
}

/* ---------- Bereich ---------- */
export function mount(el, ctx) {
  let day = today();
  el.innerHTML = `
    <div class="page-head"><div><h1>Gewohnheiten</h1><p id="hb-date"></p></div>
      <button type="button" class="btn primary" id="hb-new">${icon("plus")} Neue Gewohnheit</button></div>
    <div class="stack">
      <section class="card stack">
        <div class="row" style="flex-wrap:nowrap;gap:14px"><div class="ring" id="hb-ring"><span></span></div><div class="days" id="hb-days" style="flex:1"></div></div>
        <div id="hb-list"></div>
        <details id="hb-free-wrap" hidden><summary class="muted small" style="cursor:pointer;padding:6px 0">Heute nicht geplant</summary><div id="hb-free"></div></details>
      </section>
      <section class="card stack" id="hb-all-wrap" hidden>
        <h2>Alle Gewohnheiten</h2>
        <ul class="sortlist manage" id="hb-all"></ul>
      </section>
    </div>`;

  const sub = subscribe(render);
  const st = sub.state;

  function render() {
    if (!st.ready.h || !st.ready.l) { $("#hb-list", el).innerHTML = `<div class="empty">Lade …</div>`; return; }
    $("#hb-date", el).textContent = parseDay(day).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) + (day === today() ? " · heute" : "");
    const planned = st.habits.filter(h => isScheduled(h, day));
    const free = st.habits.filter(h => !isScheduled(h, day));
    const doneN = planned.filter(h => isDone(h, valueOf(st.logs, day, h.id))).length;
    $("#hb-ring", el).style.setProperty("--p", planned.length ? Math.round(doneN / planned.length * 100) : 0);
    $("#hb-ring span", el).textContent = `${doneN}/${planned.length}`;
    $("#hb-ring", el).setAttribute("aria-label", `${doneN} von ${planned.length} erledigt`);

    // letzte 7 Tage zum Nachtragen
    $("#hb-days", el).innerHTML = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6)).map(d => {
      const pl = st.habits.filter(h => isScheduled(h, d));
      const dn = pl.filter(h => isDone(h, valueOf(st.logs, d, h.id))).length;
      const cls = !pl.length ? "" : dn === pl.length ? "full" : dn ? "part" : "";
      return `<button type="button" data-day="${d}" aria-pressed="${d === day}" aria-label="${esc(dayLabel(d))}"><small>${WD_SHORT[weekday(d)]}</small><b>${parseDay(d).getDate()}</b><i class="${cls}"></i></button>`;
    }).join("");

    if (!st.habits.length) {
      $("#hb-list", el).innerHTML = `<div class="stack"><p style="margin:0">Noch keine Gewohnheiten. Leg eine eigene an oder starte mit einem Vorschlag:</p>
        <div class="chips">${SUGGESTIONS.map((s, i) => `<button type="button" class="chip" data-sug="${i}">${icon(s.icon, { size: 16 })} ${esc(s.name)}${s.type === "qty" ? ` (${fmtNum(s.target)} ${esc(s.unit)})` : ""}</button>`).join("")}</div></div>`;
    } else {
      $("#hb-list", el).innerHTML = planned.map(h => rowHtml(h, day, st.logs)).join("") || `<p class="muted" style="margin:0">Für diesen Tag ist nichts geplant.</p>`;
    }
    $("#hb-free-wrap", el).hidden = !free.length;
    $("#hb-free", el).innerHTML = free.map(h => rowHtml(h, day, st.logs)).join("");

    $("#hb-all-wrap", el).hidden = !st.habits.length;
    $("#hb-all", el).innerHTML = st.habits.map((h, i) => {
      const r = rate(h, st.logs, 30);
      return `<li data-id="${esc(h.id)}"><span class="hicon" aria-hidden="true">${hIcon(h)}</span>
        <span class="name">${esc(h.name)}<small>${daysText(h)} · Serie ${currentStreak(h, st.logs)} · Rekord ${bestStreak(h, st.logs)}${r === null ? "" : ` · ${r} % in 30 Tagen`}${h.reminder?.enabled ? ` · Erinnerung ${esc(h.reminder.time)}` : ""}</small></span>
        <button type="button" class="btn icon small" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(h.name)} nach oben">${icon("arrow-up")}</button>
        <button type="button" class="btn icon small" data-mv="1" ${i === st.habits.length - 1 ? "disabled" : ""} aria-label="${esc(h.name)} nach unten">${icon("arrow-down")}</button>
        <button type="button" class="btn small" data-edit>Bearbeiten</button></li>`;
    }).join("");
  }

  $("#hb-days", el).addEventListener("click", e => { const b = e.target.closest("[data-day]"); if (b) { day = b.dataset.day; render(); } });
  const rowClick = e => {
    const v = e.target.closest(".hmeta .num");
    if (v) { const h = st.habits.find(x => x.id === v.closest(".habit").dataset.id); if (h) editAmount(h, day, st.logs); return; }
    const sug = e.target.closest("[data-sug]");
    if (sug) { createHabit(SUGGESTIONS[+sug.dataset.sug], st.habits); return; }
    handleRowClick(e, st, day, ctx, { detail: h => openDetail(h, st, ctx) });
  };
  $("#hb-list", el).addEventListener("click", rowClick);
  $("#hb-free", el).addEventListener("click", rowClick);
  $("#hb-all", el).addEventListener("click", e => {
    const li = e.target.closest("li"); if (!li) return;
    const i = st.habits.findIndex(h => h.id === li.dataset.id);
    if (e.target.closest("[data-edit]")) { openEditor(st.habits[i], st, ctx); return; }
    const mv = e.target.closest("[data-mv]"); if (!mv) return;
    const j = i + Number(mv.dataset.mv);
    const list = st.habits.slice(); [list[i], list[j]] = [list[j], list[i]];
    list.forEach((h, k) => { if ((h.order ?? -1) !== k) merge("habits", h.id, { order: k }); });
  });
  $("#hb-new", el).onclick = () => openEditor(null, st, ctx);

  // Tageswechsel um Mitternacht
  const t = setInterval(() => { if (day !== today() && day === addDays(today(), -1) && !document.hidden) { day = today(); render(); } }, 60000);
  render();
  return () => { clearInterval(t); sub.stop(); };
}

const daysText = h => {
  const d = habitDays(h);
  if (d.length === 7) return "täglich";
  if (d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x))) return "Mo–Fr";
  return WD_ORDER.filter(x => d.includes(x)).map(x => WD_SHORT[x]).join(", ");
};

function createHabit(data, habits) {
  const id = newId("hb");
  return put("habits", id, {
    name: data.name, icon: data.icon || "circle", type: data.type || "check",
    target: data.type === "qty" ? data.target : null, unit: data.unit || "", step: data.step || 1,
    days: ALL_DAYS, reminder: { enabled: false, time: "", mode: "daily", days: [] },
    order: habits.length, startDate: today(), createdAt: new Date().toISOString()
  }).catch(e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }));
}

/* ---------- Detail mit Statistik ---------- */
function openDetail(h, st, ctx) {
  openSheet((s, close) => {
    const weeks = 16, end = today();
    // Raster: Spalten = Wochen (Mo–So), letzte Spalte = aktuelle Woche
    const lastMonday = addDays(end, -((weekday(end) + 6) % 7));
    const start = addDays(lastMonday, -7 * (weeks - 1));
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      if (d > end) { cells.push(`<i class="off"></i>`); continue; }
      if (!isScheduled(h, d)) { cells.push(`<i class="off" title="${d}"></i>`); continue; }
      const v = valueOf(st.logs, d, h.id);
      const cls = isDone(h, v) ? "done" : v > 0 ? "part" : "miss";
      cells.push(`<i class="${cls}" title="${d}: ${h.type === "qty" ? fmtNum(v) + " " + esc(h.unit || "") : isDone(h, v) ? "erledigt" : "offen"}"></i>`);
    }
    const r = rate(h, st.logs, 30);
    s.innerHTML = `<div class="sheet-head"><h3 class="row" style="gap:8px">${hIcon(h, 20)}${esc(h.name)}</h3><button type="button" class="btn icon ghost" data-x aria-label="Schließen">${icon("x")}</button></div>
      <p class="muted" style="margin:0">${daysText(h)}${h.type === "qty" ? ` · Ziel ${fmtNum(target(h))} ${esc(h.unit || "")}` : ""}${h.reminder?.enabled ? ` · Erinnerung ${esc(h.reminder.time)}` : ""}</p>
      <div class="stats"><div><b>${currentStreak(h, st.logs)}</b><span>aktuelle Serie</span></div><div><b>${bestStreak(h, st.logs)}</b><span>beste Serie</span></div><div><b>${r === null ? "–" : r + " %"}</b><span>letzte 30 Tage</span></div></div>
      <div><h2 style="margin-bottom:8px">Letzte ${weeks} Wochen</h2><div class="heat" aria-label="Verlauf">${cells.join("")}</div></div>
      <div class="sheet-foot"><button type="button" class="btn" data-x>Schließen</button><button type="button" class="btn primary" data-edit>Bearbeiten</button></div>`;
    $$("[data-x]", s).forEach(b => b.onclick = close);
    $("[data-edit]", s).onclick = () => { close(); openEditor(h, st, ctx); };
  }, { label: h.name, noFocus: true });
}

/* ---------- Anlegen / Bearbeiten ---------- */
function openEditor(h, st, ctx) {
  const isNew = !h;
  const d = h ? structuredClone(h) : { name: "", icon: "circle", type: "check", target: 1, unit: "", step: 1, days: ALL_DAYS.slice(), reminder: { enabled: false, time: "08:00", mode: "daily", days: [1, 2, 3, 4, 5] } };
  d.days = habitDays(d).slice();
  d.reminder = { enabled: false, time: "08:00", mode: "daily", days: [], ...(d.reminder || {}) };
  if (!d.reminder.time) d.reminder.time = "08:00";
  if (!d.reminder.days?.length) d.reminder.days = d.days.slice();

  openSheet((s, close) => {
    const dayChips = (sel, attr) => WD_ORDER.map(x => `<button type="button" class="chip" ${attr}="${x}" aria-pressed="${sel.includes(x)}">${WD_SHORT[x]}</button>`).join("");
    s.innerHTML = `<div class="sheet-head"><h3>${isNew ? "Neue Gewohnheit" : "Gewohnheit bearbeiten"}</h3></div>
      <label class="field"><span>Name</span><input class="input" type="text" id="e-name" placeholder="z. B. Wasser trinken" value="${esc(d.name)}" autofocus></label>
      <div class="field"><span>Symbol</span><div class="chips icon-pick" id="e-icon">${HABIT_ICONS.map(n => `<button type="button" class="chip" data-ic="${n}" aria-pressed="${(d.icon || "circle") === n}" aria-label="Symbol ${n}">${icon(n)}</button>`).join("")}</div></div>
      <div class="field"><span>Art</span><div class="seg" id="e-type"><button type="button" data-v="check">Abhaken</button><button type="button" data-v="qty">Menge mit Ziel</button></div></div>
      <div class="row" id="e-qty" style="flex-wrap:nowrap">
        <label class="field" style="flex:1"><span>Ziel pro Tag</span><input class="input num" type="text" inputmode="decimal" id="e-target" value="${fmtNum(d.target || 1)}"></label>
        <label class="field" style="flex:1"><span>Einheit</span><input class="input" type="text" id="e-unit" placeholder="Liter, Seiten …" value="${esc(d.unit || "")}"></label>
        <label class="field" style="flex:1"><span>Pro Tipp auf +</span><input class="input num" type="text" inputmode="decimal" id="e-step" value="${fmtNum(d.step || 1)}"></label>
      </div>
      <div class="field"><span>An welchen Tagen?</span><div class="chips" id="e-days">${dayChips(d.days, "data-d")}</div></div>
      <div class="card stack" style="background:var(--surface-2);box-shadow:none">
        <div class="row" style="justify-content:space-between"><b>Erinnerung</b><label class="switch"><input type="checkbox" id="e-rem" ${d.reminder.enabled ? "checked" : ""} aria-label="Erinnerung"><span></span></label></div>
        <div class="stack" id="e-rem-box">
          <label class="field" style="max-width:160px"><span>Uhrzeit</span><input class="input" type="time" id="e-time" value="${esc(d.reminder.time)}"></label>
          <div class="field"><span>Häufigkeit</span><div class="seg" id="e-mode"><button type="button" data-v="daily">Täglich</button><button type="button" data-v="days">Bestimmte Tage</button></div></div>
          <div class="chips" id="e-rdays">${dayChips(d.reminder.days, "data-r")}</div>
          <p class="note" id="e-perm"></p>
        </div>
      </div>
      <p class="err" id="e-err" hidden></p>
      <div class="sheet-foot">${isNew ? "" : `<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>`}
        <button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;

    const sync = () => {
      $$("#e-type button", s).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === d.type)));
      $("#e-qty", s).hidden = d.type !== "qty";
      $$("#e-mode button", s).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === d.reminder.mode)));
      $("#e-rem-box", s).hidden = !$("#e-rem", s).checked;
      $("#e-rdays", s).hidden = d.reminder.mode !== "days";
      const p = "Notification" in window ? Notification.permission : "unsupported";
      $("#e-perm", s).innerHTML = p === "granted" ? "Die Erinnerung kommt, solange die App geöffnet oder im Hintergrund aktiv ist."
        : p === "unsupported" ? "Dieser Browser zeigt keine Benachrichtigungen. Die Erinnerung erscheint dann als Hinweis in der App."
        : `Benachrichtigungen sind auf diesem Gerät noch nicht erlaubt. <button type="button" class="linkbtn" id="e-ask">Jetzt erlauben</button>`;
      const ask = $("#e-ask", s); if (ask) ask.onclick = async () => { await Notification.requestPermission(); sync(); };
    };
    $("#e-icon", s).onclick = e => { const b = e.target.closest("[data-ic]"); if (!b) return; d.icon = b.dataset.ic; $$("#e-icon [data-ic]", s).forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
    $("#e-type", s).onclick = e => { const b = e.target.closest("button"); if (b) { d.type = b.dataset.v; sync(); } };
    $("#e-mode", s).onclick = e => { const b = e.target.closest("button"); if (b) { d.reminder.mode = b.dataset.v; sync(); } };
    $("#e-rem", s).onchange = sync;
    const chipToggle = (list, x, btn) => { const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); else list.push(x); btn.setAttribute("aria-pressed", String(i < 0)); };
    $("#e-days", s).onclick = e => { const b = e.target.closest("[data-d]"); if (b) chipToggle(d.days, +b.dataset.d, b); };
    $("#e-rdays", s).onclick = e => { const b = e.target.closest("[data-r]"); if (b) chipToggle(d.reminder.days, +b.dataset.r, b); };
    $("[data-x]", s).onclick = close;
    const num = v => parseFloat(String(v).replace(/\./g, "").replace(",", "."));
    $("[data-save]", s).onclick = async () => {
      const err = m => { $("#e-err", s).textContent = m; $("#e-err", s).hidden = !m; };
      const name = $("#e-name", s).value.trim();
      if (!name) { err("Bitte einen Namen eingeben."); $("#e-name", s).focus(); return; }
      if (!d.days.length) { err("Bitte mindestens einen Tag wählen."); return; }
      const tgt = num($("#e-target", s).value), step = num($("#e-step", s).value);
      if (d.type === "qty" && !(tgt > 0)) { err("Bitte ein Ziel größer als 0 eingeben."); return; }
      const remOn = $("#e-rem", s).checked, time = $("#e-time", s).value;
      if (remOn && !time) { err("Bitte eine Uhrzeit für die Erinnerung wählen."); return; }
      if (remOn && d.reminder.mode === "days" && !d.reminder.days.length) { err("Bitte mindestens einen Erinnerungstag wählen."); return; }
      const data = {
        name, icon: d.icon || "circle", type: d.type,
        target: d.type === "qty" ? tgt : null, unit: d.type === "qty" ? $("#e-unit", s).value.trim() : "",
        step: d.type === "qty" && step > 0 ? step : 1,
        days: d.days.slice().sort(),
        reminder: { enabled: remOn, time: remOn || h?.reminder?.time ? time || "" : "", mode: d.reminder.mode, days: d.reminder.days.slice().sort() }
      };
      try {
        if (isNew) await put("habits", newId("hb"), { ...data, order: st.habits.length, startDate: today(), createdAt: new Date().toISOString() });
        else await merge("habits", h.id, data);
        close();
        if (remOn && "Notification" in window && Notification.permission === "default") ctx.toast("Tipp: Erlaube Benachrichtigungen, damit Erinnerungen erscheinen.", { action: { label: "Erlauben", run: () => Notification.requestPermission() } });
      } catch (e) { err("Speichern fehlgeschlagen: " + (e.code || e.message)); }
    };
    if (!isNew) $("[data-del]", s).onclick = () => { close(); ctx.confirmBox(`„${h.name}“ löschen? Der Verlauf geht dabei verloren.`, "Löschen", () => remove("habits", h.id), { danger: true }); };
    sync();
  }, { label: isNew ? "Neue Gewohnheit" : "Gewohnheit bearbeiten" });
}

/* ---------- Kachel für die Startseite (Hervorhebung) ---------- */
export const widgets = {
  "habits-today"(el, ctx) {
    el.classList.add("hl");
    el.innerHTML = `<div class="tile-head"><h2>Gewohnheiten heute</h2></div><div class="empty" style="color:inherit">Lade …</div>`;
    const sub = subscribe(st => {
      if (!st.ready.h || !st.ready.l) return;
      const d = today();
      const planned = st.habits.filter(h => isScheduled(h, d));
      const doneN = planned.filter(h => isDone(h, valueOf(st.logs, d, h.id))).length;
      const streak = dayStreak(st.habits, st.logs, d);
      if (!planned.length) {
        el.innerHTML = `<div class="tile-head"><h2>Gewohnheiten heute</h2><a href="#gewohnheiten">Alle ${icon("chevron-right", { size: 14 })}</a></div>
          <p style="margin:0;font-weight:500">${st.habits.length ? "Heute ist nichts geplant." : `Noch keine Gewohnheiten. <a href="#gewohnheiten">Jetzt anlegen</a>`}</p>`;
        return;
      }
      el.innerHTML = `<div class="tile-head"><h2>Gewohnheiten heute</h2><a href="#gewohnheiten">Alle ${icon("chevron-right", { size: 14 })}</a></div>
        <div class="hl-row"><div class="big-num" aria-label="${doneN} von ${planned.length} erledigt">${doneN}/${planned.length}<small>erledigt</small></div>
          ${streak ? `<span class="streak-pill">${icon("flame", { size: 16 })}${streak} ${streak === 1 ? "Tag" : "Tage"} Serie</span>` : ""}</div>
        <div class="segbar" aria-hidden="true">${planned.map(h => `<i class="${isDone(h, valueOf(st.logs, d, h.id)) ? "on" : ""}"></i>`).join("")}</div>
        <div class="hl-habits">${planned.map(h => {
          const v = valueOf(st.logs, d, h.id), done = isDone(h, v);
          return `<button type="button" data-id="${esc(h.id)}" aria-pressed="${done}" aria-label="${esc(h.name)}${h.type === "qty" ? ` plus ${fmtNum(h.step || 1)} ${esc(h.unit || "")}` : done ? " erledigt" : " abhaken"}">
            <span class="dot">${icon(done ? "check" : h.type === "qty" ? "plus" : (h.icon || "circle"), { size: 14 })}</span>${esc(h.name)}${h.type === "qty" ? ` <span class="num" style="opacity:.75">${fmtNum(v)}/${fmtNum(target(h))}</span>` : ""}</button>`;
        }).join("")}</div>`;
    });
    const onClick = e => {
      const b = e.target.closest(".hl-habits [data-id]"); if (!b) return;
      const h = sub.state.habits.find(x => x.id === b.dataset.id); if (h) toggle(h, today(), sub.state.logs);
    };
    el.addEventListener("click", onClick);
    return () => { sub.stop(); el.removeEventListener("click", onClick); el.classList.remove("hl"); };
  }
};
