// Training (Krafttraining): eigene Trainings mit Übungen, Einheiten mit Gewicht/Sätzen/Wiederholungen,
// Fortschritt pro Übung und Gesamtfortschritt.
// Datenmodell:
//   users/{uid}/workouts/{id}  { name, order, exercises: [{ id, name }], createdAt }
//   users/{uid}/sessions/{id}  { date, workoutId, workoutName, entries: [{ exId, name, weight }], note, createdAt }
//   (ältere Einheiten können noch sets/reps enthalten; sie werden nicht mehr erfasst oder angezeigt)
// Kennzahlen:
//   Ø Steigerung = mittlere Veränderung des Höchstgewichts je Übung, letzte 4 Wochen gegenüber den 4 Wochen davor
import { $, $$, esc, openSheet, toast } from "../core/ui.js";
import { watchCollection, put, merge, remove, newId } from "../core/data.js";
import { today, addDays, parseDay, weekday, daysBetween, isoWeek } from "../core/dates.js";
import { lineChart, columnChart, seriesColor } from "../core/chart.js";
import { icon } from "../core/icons.js";

const TEMPLATES = [
  { name: "Push", exercises: ["Bankdrücken", "Schulterdrücken", "Schrägbankdrücken Kurzhantel", "Trizepsdrücken am Kabel"] },
  { name: "Pull", exercises: ["Klimmzüge", "Langhantelrudern", "Latziehen", "Bizepscurls"] },
  { name: "Beine", exercises: ["Kniebeugen", "Rumänisches Kreuzheben", "Beinpresse", "Wadenheben"] }
];
const num = v => { const n = parseFloat(String(v ?? "").trim().replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
const fmt = (n, d = 1) => Number(n).toLocaleString("de-DE", { maximumFractionDigits: d });
const weekStart = iso => addDays(iso, -((weekday(iso) + 6) % 7));
const isoWeekNr = iso => isoWeek(iso).week;
const dateLabel = iso => parseDay(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const ago = iso => { const n = daysBetween(iso, today()); return n === 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`; };
const entryText = e => `${fmt(e.weight)} kg`;

function subscribe(onChange) {
  const st = { workouts: [], sessions: [], ready: { w: false, s: false } };
  const a = watchCollection("workouts", l => { st.workouts = l.sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || String(x.createdAt).localeCompare(String(y.createdAt))); st.ready.w = true; onChange(st); });
  const b = watchCollection("sessions", l => { st.sessions = l.sort((x, y) => y.date.localeCompare(x.date) || String(y.createdAt).localeCompare(String(x.createdAt))); st.ready.s = true; onChange(st); });
  return { st, stop: () => { a(); b(); } };
}

/** Alle Übungen in fester Reihenfolge (bestimmt die Farbe), inkl. gelöschter mit Daten */
function allExercises(st) {
  const list = st.workouts.flatMap(w => (w.exercises || []).map(e => ({ id: e.id, name: e.name, workout: w.name })));
  const known = new Set(list.map(e => e.id));
  for (const s of st.sessions) for (const e of s.entries || []) if (!known.has(e.exId)) { known.add(e.exId); list.push({ id: e.exId, name: e.name, workout: "gelöscht" }); }
  return list.map((e, i) => ({ ...e, color: seriesColor(i) }));
}
/** Letzter Wert einer Übung vor einem Datum; gleiche Übung auch in anderen Trainings (gleicher Name) zählt mit */
function lastEntry(st, exId, beforeDate, skipId, name) {
  const key = String(name || "").trim().toLowerCase();
  for (const s of st.sessions) {
    if (s.id === skipId || (beforeDate && s.date > beforeDate)) continue;
    const e = (s.entries || []).find(x => x.exId === exId || (key && String(x.name || "").trim().toLowerCase() === key));
    if (e) return { ...e, date: s.date };
  }
  return null;
}

function metrics(st) {
  const t = today(), ws = weekStart(t);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(ws, -7 * (11 - i)));
  const countByWeek = Object.fromEntries(weeks.map(w => [w, 0]));
  for (const s of st.sessions) {
    const w = weekStart(s.date);
    if (w in countByWeek) countByWeek[w]++;
  }
  const maxIn = (exId, from, to) => Math.max(0, ...st.sessions.filter(s => s.date >= from && s.date <= to).flatMap(s => (s.entries || []).filter(e => e.exId === exId).map(e => e.weight || 0)));
  const changes = [];
  for (const ex of allExercises(st)) {
    const now = maxIn(ex.id, addDays(t, -27), t), before = maxIn(ex.id, addDays(t, -55), addDays(t, -28));
    if (now > 0 && before > 0) changes.push((now - before) / before * 100);
  }
  return {
    weeks, countByWeek,
    avgChange: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null, changeN: changes.length
  };
}

/* ---------- Bereich ---------- */
export function mount(el, ctx) {
  let tab = sessionStorage.getItem("tr-tab") || "log";
  let cleanups = [];
  el.innerHTML = `
    <div class="page-head"><div><h1>Training</h1><p id="tr-sub"></p></div>
      <button type="button" class="btn primary" id="tr-new">${icon("plus")} Einheit eintragen</button></div>
    <div class="seg" id="tr-tabs" role="tablist" style="margin-bottom:14px">
      <button type="button" data-t="log">Verlauf</button><button type="button" data-t="progress">Fortschritt</button><button type="button" data-t="plans">Trainings</button>
    </div>
    <div id="tr-body"></div>`;
  const sub = subscribe(render);
  const st = sub.st;

  let pending = false;
  function render() {
    // Nicht neu zeichnen, während in einem Eingabefeld getippt wird (sonst geht der Text verloren)
    const a = document.activeElement;
    if (a && el.contains(a) && a.matches("#tr-body input")) { pending = true; return; }
    pending = false;
    cleanups.forEach(f => f()); cleanups = [];
    $$("#tr-tabs button", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === tab)));
    const body = $("#tr-body", el);
    if (!st.ready.w || !st.ready.s) { body.innerHTML = `<div class="empty">Lade …</div>`; return; }
    const last = st.sessions[0];
    $("#tr-sub", el).textContent = last ? `Letzte Einheit: ${last.workoutName || "Training"}, ${ago(last.date)}` : "Noch keine Einheit eingetragen";
    if (!st.workouts.length && tab !== "plans") {
      body.innerHTML = `<section class="card stack"><h3>Lege zuerst deine Trainings an</h3>
        <p class="muted" style="margin:0">Zum Beispiel „Push“, „Pull“ und „Beine“ mit ihren Übungen. Du kannst mit einer Vorlage starten und sie danach anpassen.</p>
        <div class="row"><button type="button" class="btn primary" id="tr-tpl">Mit Push / Pull / Beine starten</button><button type="button" class="btn" id="tr-own">Eigenes Training anlegen</button></div></section>`;
      $("#tr-tpl", el).onclick = () => TEMPLATES.forEach((t, i) => put("workouts", newId("wk"), { name: t.name, order: i, exercises: t.exercises.map(n => ({ id: newId("ex"), name: n })), createdAt: new Date().toISOString() }));
      $("#tr-own", el).onclick = () => { tab = "plans"; sessionStorage.setItem("tr-tab", tab); render(); };
      return;
    }
    if (tab === "log") renderLog(body);
    if (tab === "progress") renderProgress(body);
    if (tab === "plans") renderPlans(body);
  }

  function renderLog(body) {
    const list = st.sessions.slice(0, 60);
    body.innerHTML = `<section class="card">${list.length ? list.map(s => `<button type="button" class="session" data-id="${esc(s.id)}">
        <span class="s-head"><span>${esc(s.workoutName || "Training")}</span><small>${esc(dateLabel(s.date))} · ${ago(s.date)}</small></span>
        <ul>${(s.entries || []).map(e => `<li>${esc(e.name)} · <span class="num">${entryText(e)}</span></li>`).join("")}</ul>
        ${s.note ? `<small class="muted">${esc(s.note)}</small>` : ""}</button>`).join("")
      : `<div class="empty">Noch keine Einheiten. Tippe auf „+ Einheit eintragen“.</div>`}</section>`;
    body.querySelector(".card").addEventListener("click", e => {
      const b = e.target.closest(".session"); if (b) openSession(st, st.sessions.find(s => s.id === b.dataset.id));
    });
  }

  function renderProgress(body) {
    const m = metrics(st), exs = allExercises(st);
    const counts = Object.fromEntries(exs.map(e => [e.id, st.sessions.filter(s => (s.entries || []).some(x => x.exId === e.id)).length]));
    let sel; try { sel = JSON.parse(localStorage.getItem("tr-sel") || "null"); } catch (e) { sel = null; }
    sel = (sel || exs.slice().sort((a, b) => counts[b.id] - counts[a.id]).slice(0, 3).map(e => e.id)).filter(id => exs.some(e => e.id === id));
    const last4 = m.weeks.slice(8).reduce((a, w) => a + m.countByWeek[w], 0), prev4 = m.weeks.slice(4, 8).reduce((a, w) => a + m.countByWeek[w], 0);
    body.innerHTML = `<div class="stack">
      <section class="card stack"><h2>Gesamtfortschritt</h2>
        <div class="tiles">
          <div class="stat"><span>Ø Steigerung Höchstgewicht</span><b>${m.avgChange == null ? "–" : (m.avgChange >= 0 ? "+" : "") + fmt(m.avgChange) + " %"}</b><small>${m.avgChange == null ? "braucht Daten aus 8 Wochen" : `letzte 4 Wochen ggü. davor · ${m.changeN} Übung${m.changeN === 1 ? "" : "en"}`}</small></div>
          <div class="stat"><span>Einheiten diese Woche</span><b>${m.countByWeek[m.weeks[11]]}</b><small>Vorwoche: ${m.countByWeek[m.weeks[10]]}</small></div>
          <div class="stat"><span>Einheiten letzte 4 Wochen</span><b>${last4}</b><small>4 Wochen davor: ${prev4}</small></div>
        </div>
        <div><h3 style="font-size:calc(14px * var(--fs));margin-bottom:6px">Einheiten pro Woche</h3><div id="tr-vol"></div></div>
      </section>
      <section class="card stack"><h2>Fortschritt je Übung</h2>
        <div class="chips selchips" id="tr-sel">${exs.map(e => `<button type="button" class="chip" data-ex="${esc(e.id)}" aria-pressed="${sel.includes(e.id)}"><i style="background:${e.color}"></i>${esc(e.name)}</button>`).join("") || `<span class="muted">Noch keine Übungen.</span>`}</div>
        <div id="tr-line"></div>
        <details><summary class="muted small" style="cursor:pointer">Werte als Tabelle</summary><div class="tbl-wrap" id="tr-table" style="margin-top:8px"></div></details>
        <p class="note">Angezeigt wird das höchste Gewicht pro Einheit.</p>
      </section></div>`;
    cleanups.push(columnChart($("#tr-vol", body), {
      bars: m.weeks.map(w => ({ label: "KW " + isoWeekNr(w), value: m.countByWeek[w], tip: `KW ${isoWeekNr(w)} (ab ${dateLabel(w)})` })),
      unit: "Einheiten", label: "Einheiten pro Woche"
    }));
    const series = exs.filter(e => sel.includes(e.id)).map(e => {
      const byDate = {};
      for (const s of st.sessions) for (const x of s.entries || []) if (x.exId === e.id && x.weight) byDate[s.date] = Math.max(byDate[s.date] || 0, x.weight);
      return { name: e.name, color: e.color, points: Object.entries(byDate).map(([date, y]) => ({ date, y })) };
    });
    cleanups.push(lineChart($("#tr-line", body), { series, unit: "kg", label: "Gewicht je Übung" }));
    const dates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort().reverse();
    $("#tr-table", body).innerHTML = series.length ? `<table class="data"><thead><tr><th>Datum</th>${series.map(s => `<th>${esc(s.name)}</th>`).join("")}</tr></thead>
      <tbody>${dates.map(d => `<tr><td>${esc(dateLabel(d))}</td>${series.map(s => { const p = s.points.find(q => q.date === d); return `<td class="num">${p ? fmt(p.y) + " kg" : ""}</td>`; }).join("")}</tr>`).join("")}</tbody></table>` : "";
    $("#tr-sel", body).onclick = e => {
      const b = e.target.closest("[data-ex]"); if (!b) return;
      const id = b.dataset.ex, next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
      if (next.length > 8) { toast("Höchstens 8 Übungen gleichzeitig."); return; }
      try { localStorage.setItem("tr-sel", JSON.stringify(next)); } catch (err) {}
      render();
    };
  }

  function renderPlans(body) {
    body.innerHTML = `<div class="stack">
      <form class="card row" id="wk-add" style="flex-wrap:nowrap"><input class="input" type="text" id="wk-name" placeholder="Neues Training, z. B. Oberkörper" aria-label="Name des Trainings"><button type="submit" class="btn primary">Anlegen</button></form>
      ${st.workouts.map((w, i) => `<section class="card wk" data-id="${esc(w.id)}">
        <div class="wk-head"><div class="wk-title"><span class="wk-label">Training</span>
          <input type="text" value="${esc(w.name)}" data-f="wname" aria-label="Name des Trainings"></div>
          <button type="button" class="btn icon small ghost" data-wmv="-1" ${i === 0 ? "disabled" : ""} aria-label="Training nach oben">${icon("arrow-up")}</button>
          <button type="button" class="btn icon small ghost" data-wmv="1" ${i === st.workouts.length - 1 ? "disabled" : ""} aria-label="Training nach unten">${icon("arrow-down")}</button>
          <button type="button" class="btn small ghost danger" data-wdel aria-label="Training ${esc(w.name)} löschen">Löschen</button></div>
        <h2 class="wk-sub">${(w.exercises || []).length} Übung${(w.exercises || []).length === 1 ? "" : "en"}</h2>
        ${(w.exercises || []).map((x, j) => `<div class="wk-ex" data-ex="${esc(x.id)}"><span class="wk-nr">${j + 1}</span><input class="input" type="text" value="${esc(x.name)}" data-f="exname" aria-label="Übung">
          <button type="button" class="btn icon small" data-emv="-1" ${j === 0 ? "disabled" : ""} aria-label="Übung nach oben">${icon("arrow-up")}</button>
          <button type="button" class="btn icon small" data-emv="1" ${j === w.exercises.length - 1 ? "disabled" : ""} aria-label="Übung nach unten">${icon("arrow-down")}</button>
          <button type="button" class="btn icon small danger" data-edel aria-label="Übung löschen">${icon("x")}</button></div>`).join("")}
        <div class="wk-ex wk-new"><span class="wk-nr">${icon("plus", { size: 16 })}</span><input class="input" type="text" data-f="newex" placeholder="Übung hinzufügen" aria-label="Neue Übung"><button type="button" class="btn small" data-eadd>Hinzufügen</button></div>
      </section>`).join("")}</div>`;
    const root = body.firstElementChild;
    const W = id => st.workouts.find(w => w.id === id);
    const save = (w, patch) => merge("workouts", w.id, patch).catch(e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }));
    $("#wk-add", body).onsubmit = e => {
      e.preventDefault(); const name = $("#wk-name", body).value.trim(); if (!name) return;
      put("workouts", newId("wk"), { name, order: st.workouts.length, exercises: [], createdAt: new Date().toISOString() });
    };
    root.addEventListener("change", e => {
      const card = e.target.closest(".wk"); if (!card) return; const w = W(card.dataset.id);
      if (e.target.dataset.f === "wname" && e.target.value.trim()) save(w, { name: e.target.value.trim() });
      if (e.target.dataset.f === "exname" && e.target.value.trim()) {
        const id = e.target.closest(".wk-ex").dataset.ex;
        save(w, { exercises: w.exercises.map(x => x.id === id ? { ...x, name: e.target.value.trim() } : x) });
      }
    });
    const addEx = card => {
      const w = W(card.dataset.id), inp = card.querySelector("[data-f=newex]"), name = inp.value.trim(); if (!name) return;
      save(w, { exercises: [...(w.exercises || []), { id: newId("ex"), name }] });
    };
    root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.f === "newex") { e.preventDefault(); addEx(e.target.closest(".wk")); } });
    root.addEventListener("click", e => {
      const card = e.target.closest(".wk"); if (!card) return; const w = W(card.dataset.id), b = e.target.closest("button"); if (!b) return;
      if (b.hasAttribute("data-eadd")) addEx(card);
      if (b.dataset.wmv) {
        const list = st.workouts.slice(), i = list.indexOf(w), j = i + Number(b.dataset.wmv);
        [list[i], list[j]] = [list[j], list[i]]; list.forEach((x, k) => { if (x.order !== k) merge("workouts", x.id, { order: k }); });
      }
      if (b.hasAttribute("data-wdel")) ctx.confirmBox(`Training „${w.name}“ löschen? Eingetragene Einheiten bleiben erhalten.`, "Löschen", () => remove("workouts", w.id), { danger: true });
      const exEl = b.closest(".wk-ex[data-ex]");
      if (exEl && b.dataset.emv) {
        const list = w.exercises.slice(), i = list.findIndex(x => x.id === exEl.dataset.ex), j = i + Number(b.dataset.emv);
        [list[i], list[j]] = [list[j], list[i]]; save(w, { exercises: list });
      }
      if (exEl && b.hasAttribute("data-edel")) {
        const x = w.exercises.find(y => y.id === exEl.dataset.ex);
        ctx.confirmBox(`Übung „${x.name}“ aus „${w.name}“ entfernen? Bisherige Werte bleiben im Verlauf.`, "Entfernen", () => save(w, { exercises: w.exercises.filter(y => y.id !== x.id) }), { danger: true });
      }
    });
  }

  const onFocusOut = () => setTimeout(() => { if (pending) render(); }, 0);
  el.addEventListener("focusout", onFocusOut);
  $("#tr-tabs", el).onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; sessionStorage.setItem("tr-tab", tab); render(); };
  $("#tr-new", el).onclick = () => { if (!st.workouts.length) { toast("Lege zuerst ein Training an."); return; } openSession(st, null); };
  if (sessionStorage.getItem("tr-open-new")) { sessionStorage.removeItem("tr-open-new"); const t = setInterval(() => { if (st.ready.w && st.ready.s) { clearInterval(t); if (st.workouts.length) openSession(st, null); } }, 100); cleanups.push(() => clearInterval(t)); }
  render();
  return () => { el.removeEventListener("focusout", onFocusOut); cleanups.forEach(f => f()); sub.stop(); };
}

/* ---------- Einheit eintragen / bearbeiten ---------- */
function openSession(st, session) {
  const isNew = !session;
  const lastWk = st.sessions[0]?.workoutId;
  // Vorschlag: das Training, das am längsten nicht dran war
  const suggest = st.workouts.slice().sort((a, b) => {
    const la = st.sessions.find(s => s.workoutId === a.id)?.date || "", lb = st.sessions.find(s => s.workoutId === b.id)?.date || "";
    return la.localeCompare(lb);
  })[0];
  const d = {
    workoutId: session?.workoutId || (suggest?.id !== lastWk ? suggest?.id : st.workouts[0]?.id) || st.workouts[0]?.id,
    date: session?.date || today(), note: session?.note || "",
    values: Object.fromEntries((session?.entries || []).map(e => [e.exId, { weight: e.weight, name: e.name }]))
  };
  openSheet((s, close) => {
    const exercisesFor = () => {
      const w = st.workouts.find(x => x.id === d.workoutId);
      const list = (w?.exercises || []).map(x => ({ id: x.id, name: x.name }));
      for (const [id, v] of Object.entries(d.values)) if (!list.some(x => x.id === id)) list.push({ id, name: v.name });
      return list;
    };
    const valStr = v => v == null || v === "" ? "" : String(v).replace(".", ",");
    function draw() {
      s.innerHTML = `<div class="sheet-head"><h3>${isNew ? "Einheit eintragen" : "Einheit bearbeiten"}</h3></div>
        <div class="chips" id="ss-wk">${st.workouts.map(w => `<button type="button" class="chip" data-w="${esc(w.id)}" aria-pressed="${w.id === d.workoutId}">${esc(w.name)}</button>`).join("")}</div>
        <label class="field" style="max-width:180px"><span>Datum</span><input class="input" type="date" id="ss-date" value="${esc(d.date)}"></label>
        <div id="ss-ex">${exercisesFor().map(x => {
          const v = d.values[x.id] || {}, last = lastEntry(st, x.id, d.date, session?.id, x.name);
          return `<div class="ex-row" data-ex="${esc(x.id)}" data-name="${esc(x.name)}">
            <div class="ex-name">${esc(x.name)}${last ? `<small>zuletzt ${esc(dateLabel(last.date))}</small>` : `<small>noch kein Wert</small>`}</div>
            <label class="field ex-kg"><input class="input num" type="text" inputmode="decimal" data-f="weight" value="${valStr(v.weight)}" placeholder="${last ? valStr(last.weight) : "–"}" aria-label="${esc(x.name)} in kg${last ? `, letztes Mal ${valStr(last.weight)}` : ""}"><span>kg</span></label></div>`;
        }).join("") || `<p class="muted">Dieses Training hat noch keine Übungen. Füge sie unter „Trainings“ hinzu.</p>`}</div>
        <label class="field"><span>Notiz (optional)</span><textarea class="input" id="ss-note" rows="2">${esc(d.note)}</textarea></label>
        <p class="err" id="ss-err" hidden></p>
        <div class="sheet-foot">${isNew ? "" : `<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>`}<button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
      $("#ss-wk", s).onclick = e => { const b = e.target.closest("[data-w]"); if (!b) return; collect(); d.workoutId = b.dataset.w; draw(); };
      $("#ss-date", s).onchange = e => { collect(); d.date = e.target.value || today(); draw(); };
      $("[data-x]", s).onclick = close;
      if (!isNew) $("[data-del]", s).onclick = () => { close(); remove("sessions", session.id).then(() => toast("Einheit gelöscht.")); };
      $("[data-save]", s).onclick = save;
    }
    function collect() {
      $$("#ss-ex .ex-row", s).forEach(r => {
        const v = { name: r.dataset.name };
        v.weight = r.querySelector("[data-f=weight]").value.trim();
        if (v.weight) d.values[r.dataset.ex] = v; else delete d.values[r.dataset.ex];
      });
      d.note = $("#ss-note", s)?.value ?? d.note;
    }
    async function save() {
      collect();
      const err = m => { $("#ss-err", s).textContent = m; $("#ss-err", s).hidden = !m; };
      const entries = [];
      for (const x of exercisesFor()) {
        const v = d.values[x.id]; if (!v) continue;
        const weight = num(v.weight);
        if (weight == null) { err(`Bitte bei „${x.name}“ ein Gewicht eintragen (0 für Körpergewicht).`); return; }
        entries.push({ exId: x.id, name: x.name, weight });
      }
      if (!entries.length) { err("Bitte mindestens eine Übung ausfüllen."); return; }
      const w = st.workouts.find(x => x.id === d.workoutId);
      const data = { date: d.date, workoutId: d.workoutId, workoutName: w?.name || session?.workoutName || "Training", entries, note: d.note.trim(), createdAt: session?.createdAt || new Date().toISOString() };
      try { await put("sessions", session?.id || newId("ss"), data); close(); toast(isNew ? "Einheit gespeichert." : "Änderungen gespeichert."); }
      catch (e) { err("Speichern fehlgeschlagen: " + (e.code || e.message)); }
    }
    draw();
  }, { label: "Einheit eintragen", noFocus: true });
}

/* ---------- Kachel für die Startseite: Höchstgewicht einer Übung, letzte 8 Wochen ---------- */
/** Wochenhöchstwerte einer Übung (8 Wochen bis heute) */
function liftWeeks(st, exId) {
  const ws = weekStart(today());
  return Array.from({ length: 8 }, (_, i) => {
    const from = addDays(ws, -7 * (7 - i)), to = addDays(from, 6);
    const vals = st.sessions.filter(s => s.date >= from && s.date <= to).flatMap(s => (s.entries || []).filter(e => e.exId === exId && e.weight > 0).map(e => ({ w: e.weight, date: s.date })));
    const best = vals.sort((a, b) => b.w - a.w || b.date.localeCompare(a.date))[0];
    return { from, value: best?.w || 0, date: vals.map(v => v.date).sort().pop() || "" };
  });
}
export const widgets = {
  "last-training"(el, ctx) {
    el.innerHTML = `<div class="tile-head"><h2>Training</h2></div><div class="empty">Lade …</div>`;
    let exIdx = 0, pick = null;
    const sub = subscribe(st => draw(st));
    function draw(st) {
      if (!st.ready.w || !st.ready.s) return;
      const since = addDays(today(), -56);
      // Übungen mit Gewicht der letzten 8 Wochen, die häufigste zuerst
      const counts = {};
      for (const s of st.sessions) if (s.date >= since) for (const e of s.entries || []) if (e.weight > 0) counts[e.exId] = (counts[e.exId] || 0) + 1;
      const exs = allExercises(st).filter(e => counts[e.id]).sort((a, b) => counts[b.id] - counts[a.id]);
      const last = st.sessions[0];
      const lastLine = last ? `<p class="t-sub">Zuletzt: ${esc(last.workoutName || "Training")}, ${ago(last.date)}</p>` : "";
      if (!exs.length) {
        el.innerHTML = `<div class="tile-head"><h2>Training</h2><a href="#training">Öffnen ${icon("chevron-right", { size: 14 })}</a></div>
          <p class="muted" style="margin:0">${last ? "In den letzten 8 Wochen gibt es keine Werte mit Gewicht." : "Noch keine Einheit eingetragen."}</p>${lastLine}
          <div><button type="button" class="btn small" data-new>${icon("plus", { size: 16 })} Einheit eintragen</button></div>`;
        el.querySelector("[data-new]").onclick = () => { sessionStorage.setItem("tr-open-new", "1"); ctx.navigate("training"); };
        return;
      }
      let saved = pick; try { saved = saved || localStorage.getItem("tr-dash-ex"); } catch (e) {}
      const savedIdx = exs.findIndex(e => e.id === saved);
      exIdx = savedIdx >= 0 ? savedIdx : 0;
      const ex = exs[exIdx], weeks = liftWeeks(st, ex.id), withVal = weeks.filter(w => w.value > 0);
      const first = withVal[0], cur = withVal[withVal.length - 1], diff = cur.value - first.value;
      const vals = withVal.map(w => w.value), lo = Math.min(...vals), hi = Math.max(...vals);
      const h = v => !v ? 8 : hi === lo ? 70 : 28 + 72 * (v - lo) / (hi - lo);
      const curIdx = weeks.lastIndexOf(cur);
      const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
      el.innerHTML = `<div class="tile-head"><h2>Höchstgewicht · 8 Wochen</h2>${exs.length > 1 ? `<button type="button" class="btn small ghost" data-next aria-label="Nächste Übung" style="margin:-8px -10px -8px 0">Übung ${icon("chevron-right", { size: 14 })}</button>` : `<a href="#training">Alle ${icon("chevron-right", { size: 14 })}</a>`}</div>
        <div><p class="t-title" style="font-size:calc(20px * var(--fs))">${esc(ex.name)}</p><p class="t-sub">${withVal.length > 1 ? `${sign}${fmt(Math.abs(diff))} kg in ${weeks.length - weeks.indexOf(first)} Wochen` : "erste Werte in diesem Zeitraum"}</p></div>
        <div class="minibars" role="img" aria-label="${esc(ex.name)}: ${weeks.map(w => w.value ? fmt(w.value) + " kg" : "keine Einheit").join(", ")}">${weeks.map((w, i) => `<i class="${i === curIdx ? "on" : ""}" style="height:${h(w.value)}%" title="ab ${esc(dateLabel(w.from))}: ${w.value ? fmt(w.value) + " kg" : "keine Einheit"}"></i>`).join("")}</div>
        <div class="minibars-foot"><span>${fmt(first.value)} kg</span><span>${cur.date === today() ? "heute" : esc(ago(cur.date))} <b>${fmt(cur.value)} kg</b></span></div>
        ${lastLine}`;
      el.querySelector("[data-next]")?.addEventListener("click", () => {
        pick = exs[(exIdx + 1) % exs.length].id;
        try { localStorage.setItem("tr-dash-ex", pick); } catch (e) {}
        draw(st);
      });
    }
    return sub.stop;
  }
};
