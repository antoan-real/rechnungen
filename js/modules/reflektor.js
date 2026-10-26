// Lebensreflektor: täglich drei Dinge, für die ich dankbar bin; wöchentliches/monatliches „Rauszoomen“
// mit rotierenden Fragen; Rückblick „Heute vor einem Monat/Jahr“; Erinnerungen. Logik: reflect-core.js
import { $, $$, esc, openSheet, toast } from "../core/ui.js";
import { watchCollection, watchDoc, put, merge, remove } from "../core/data.js";
import { today, addDays, parseDay, shortDate, isoWeek, WD_ORDER } from "../core/dates.js";
import { questionsFor, questionsOf, remindersOf, periodKey, reflectionId, gratitudeDone, DEFAULT_QUESTIONS } from "./reflect-core.js";

const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const longDay = iso => parseDay(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monthName = iso => parseDay(iso.slice(0, 7) + "-01").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
function sameDayMonthsAgo(iso, n) {
  const d = parseDay(iso), t = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d.getDate(), last)).padStart(2, "0")}`;
}
function periodLabel(type, date) {
  if (type === "month") return monthName(date);
  const mon = addDays(date, -((parseDay(date).getDay() + 6) % 7));
  return `KW ${isoWeek(date).week} · ${shortDate(mon).slice(0, 6)}–${shortDate(addDays(mon, 6)).slice(0, 6)}`;
}

function subscribe(onChange) {
  const st = { journal: {}, reflections: {}, cfg: null, ready: { j: false, r: false, c: false } };
  const stops = [
    watchCollection("journal", l => { st.journal = Object.fromEntries(l.map(d => [d.id, d])); st.ready.j = true; onChange(st); }),
    watchCollection("reflections", l => { st.reflections = Object.fromEntries(l.map(d => [d.id, d])); st.ready.r = true; onChange(st); }),
    watchDoc("settings", "reflect", d => { st.cfg = d || {}; st.ready.c = true; onChange(st); })
  ];
  return { st, stop: () => stops.forEach(f => f()) };
}
const ready = st => st.ready.j && st.ready.r && st.ready.c;

function saveGratitude(date, list) {
  const clean = list.map(t => String(t || "").trim());
  if (!clean.some(Boolean)) return remove("journal", date);
  return put("journal", date, { date, gratitude: clean, updatedAt: new Date().toISOString() });
}

function lookbacks(st, date) {
  const out = [];
  for (const [label, d] of [["vor einem Jahr", sameDayMonthsAgo(date, 12)], ["vor einem Monat", sameDayMonthsAgo(date, 1)]]) {
    const j = st.journal[d]; if (gratitudeDone(j)) out.push({ label, date: d, items: j.gratitude.filter(Boolean) });
  }
  if (!out.length) {
    const old = Object.values(st.journal).filter(j => j.date <= addDays(date, -14) && gratitudeDone(j));
    if (old.length) { const j = old[Math.abs(hash(date)) % old.length]; out.push({ label: "Zufälliger Rückblick", date: j.date, items: j.gratitude.filter(Boolean) }); }
  }
  return out;
}
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

export function mount(el, ctx) {
  let day = today(), zoom = sessionStorage.getItem("rf-zoom") || "week", search = "", timer = 0;
  el.innerHTML = `
    <div class="page-head"><div><h1>Lebensreflektor</h1><p>Dankbar sein, rauszoomen, zurückblicken.</p></div>
      <button type="button" class="btn" id="rf-cfg">Fragen &amp; Erinnerungen</button></div>
    <div class="grid-2">
      <section class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2>Dankbarkeit</h2>
          <div class="row" style="flex-wrap:nowrap;gap:4px"><button type="button" class="btn icon small" id="rf-prev" aria-label="Vorheriger Tag">‹</button>
          <span id="rf-day" class="small" style="min-width:110px;text-align:center"></span>
          <button type="button" class="btn icon small" id="rf-next" aria-label="Nächster Tag">›</button></div></div>
        <div class="stack" id="rf-grat"></div>
        <p class="note" id="rf-saved" aria-live="polite"></p>
      </section>
      <section class="card stack" id="rf-look"></section>
      <section class="card stack" id="rf-zoom" style="grid-column:1/-1"></section>
      <section class="card stack" style="grid-column:1/-1">
        <div class="row" style="justify-content:space-between"><h2>Verlauf</h2><input class="input" type="text" id="rf-search" placeholder="Suchen …" style="max-width:240px" aria-label="Verlauf durchsuchen"></div>
        <div id="rf-hist"></div>
      </section>
    </div>`;
  const sub = subscribe(() => render()), st = sub.st;

  function render() {
    if (!ready(st)) return;
    renderGratitude(); renderLook(); renderZoom(); renderHistory();
  }
  function renderGratitude() {
    if ($("#rf-grat", el).contains(document.activeElement)) return; // nicht beim Tippen überschreiben
    const items = st.journal[day]?.gratitude || [];
    $("#rf-day", el).textContent = day === today() ? "Heute" : day === addDays(today(), -1) ? "Gestern" : parseDay(day).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
    $("#rf-next", el).disabled = day >= today();
    $("#rf-grat", el).innerHTML = [0, 1, 2].map(i => `<label class="row" style="flex-wrap:nowrap"><b class="num muted" style="width:16px">${i + 1}</b>
      <input class="input" type="text" data-i="${i}" value="${esc(items[i] || "")}" placeholder="${["Ich bin dankbar für …", "Außerdem für …", "Und für …"][i]}" aria-label="Dankbarkeit ${i + 1}"></label>`).join("");
  }
  function renderLook() {
    const list = lookbacks(st, today());
    $("#rf-look", el).innerHTML = `<h2>Rückblick</h2>` + (list.length ? list.map(l => `<div class="stack" style="gap:4px">
        <span class="small muted">${esc(l.label)} · ${esc(shortDate(l.date))} hast du geschrieben:</span>
        <ul style="margin:0;padding-left:18px">${l.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")
      : `<p class="muted" style="margin:0">Hier erscheint, was du heute vor einem Monat und vor einem Jahr geschrieben hast.</p>`);
  }
  function renderZoom() {
    const box = $("#rf-zoom", el);
    if (box.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") return;
    const key = periodKey(zoom, today()), id = reflectionId(zoom, key), saved = st.reflections[id];
    const qs = saved ? saved.answers.map(a => a.q) : questionsFor(zoom, today(), st.cfg);
    box.innerHTML = `<div class="row" style="justify-content:space-between"><h2>Rauszoomen</h2>
        <div class="seg" id="rf-type"><button type="button" data-t="week" aria-pressed="${zoom === "week"}">Woche</button><button type="button" data-t="month" aria-pressed="${zoom === "month"}">Monat</button></div></div>
      <b>${esc(periodLabel(zoom, today()))}</b>
      ${qs.map((q, i) => `<label class="field"><span style="color:var(--ink);font-size:15px">${esc(q)}</span>
        <textarea class="input" rows="3" data-q="${i}">${esc(saved?.answers[i]?.a || "")}</textarea></label>`).join("")}
      <div class="row"><button type="button" class="btn primary" id="rf-zsave">${saved ? "Änderungen speichern" : "Rückblick speichern"}</button>
        ${saved ? `<span class="note">Gespeichert am ${esc(shortDate(saved.date))}</span>` : `<span class="note">Die Fragen wechseln jede ${zoom === "week" ? "Woche" : "Monat"}.</span>`}</div>`;
    $("#rf-type", box).onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; zoom = b.dataset.t; sessionStorage.setItem("rf-zoom", zoom); renderZoom(); };
    $("#rf-zsave", box).onclick = async () => {
      const answers = qs.map((q, i) => ({ q, a: box.querySelector(`[data-q="${i}"]`).value.trim() }));
      if (!answers.some(a => a.a)) { toast("Beantworte mindestens eine Frage."); return; }
      try {
        document.activeElement?.blur();
        await put("reflections", id, { type: zoom, period: key, date: saved?.date || today(), answers, updatedAt: new Date().toISOString() });
        toast("Rückblick gespeichert.");
      } catch (e) { toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }); }
    };
  }
  function renderHistory() {
    const q = search.toLowerCase();
    const items = [
      ...Object.values(st.journal).filter(gratitudeDone).map(j => ({ date: j.date, kind: "Dankbarkeit", lines: j.gratitude.filter(Boolean) })),
      ...Object.values(st.reflections).map(r => ({ date: r.date, kind: r.type === "week" ? `Wochenrückblick ${r.period.replace("-W", " · KW ")}` : `Monatsrückblick ${monthName(r.period + "-01")}`, lines: r.answers.filter(a => a.a).map(a => `${a.q} — ${a.a}`) }))
    ].filter(x => !q || (x.kind + " " + x.lines.join(" ")).toLowerCase().includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
    $("#rf-hist", el).innerHTML = items.length ? `<ul class="sortlist">${items.map(x => `<li style="align-items:flex-start"><span class="name"><b style="font-weight:500">${esc(x.kind)}</b> <span class="muted small">· ${esc(longDay(x.date))}</span>
        <small style="white-space:pre-line;color:var(--ink);font-size:14px;margin-top:4px">${x.lines.map(esc).join("\n")}</small></span></li>`).join("")}</ul>`
      : `<p class="muted" style="margin:0">${q ? "Nichts gefunden." : "Noch keine Einträge."}</p>`;
  }

  $("#rf-grat", el).addEventListener("input", () => {
    clearTimeout(timer);
    $("#rf-saved", el).textContent = "";
    timer = setTimeout(save, 700);
  });
  $("#rf-grat", el).addEventListener("focusout", () => { clearTimeout(timer); save(); });
  async function save() {
    const vals = $$("#rf-grat input", el).map(i => i.value);
    const old = (st.journal[day]?.gratitude || []).map(t => t || "");
    if (vals.every((v, i) => v.trim() === (old[i] || "").trim())) return;
    try { await saveGratitude(day, vals); $("#rf-saved", el).textContent = "Gespeichert."; }
    catch (e) { toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }); }
  }
  $("#rf-prev", el).onclick = async () => { await save(); day = addDays(day, -1); renderGratitude(); };
  $("#rf-next", el).onclick = async () => { await save(); if (day < today()) day = addDays(day, 1); renderGratitude(); };
  $("#rf-search", el).addEventListener("input", e => { search = e.target.value; renderHistory(); });
  $("#rf-cfg", el).onclick = () => ready(st) && openConfig(st.cfg, ctx);
  return () => { clearTimeout(timer); save(); sub.stop(); };
}

/* ---------- Fragen & Erinnerungen ---------- */
function openConfig(cfg, ctx) {
  const qs = questionsOf(cfg), r = remindersOf(cfg);
  openSheet((s, close) => {
    const timeIn = (id, v) => `<input class="input" type="time" id="${id}" value="${esc(v)}" style="max-width:130px">`;
    s.innerHTML = `<div class="sheet-head"><h3>Fragen &amp; Erinnerungen</h3></div>
      <label class="field"><span>Fragen für den Wochenrückblick (eine pro Zeile)</span><textarea class="input" id="cf-week" rows="6">${esc(qs.week.join("\n"))}</textarea></label>
      <label class="field"><span>Fragen für den Monatsrückblick (eine pro Zeile)</span><textarea class="input" id="cf-month" rows="6">${esc(qs.month.join("\n"))}</textarea></label>
      <button type="button" class="linkbtn" id="cf-reset" style="align-self:flex-start">Standardfragen wiederherstellen</button>
      <div class="card stack" style="background:var(--surface-2);box-shadow:none">
        <b>Erinnerungen</b>
        <div class="row" style="justify-content:space-between"><span>Dankbarkeit täglich</span><div class="row" style="flex-wrap:nowrap">${timeIn("cf-d-time", r.daily.time)}<label class="switch"><input type="checkbox" id="cf-d-on" ${r.daily.enabled ? "checked" : ""} aria-label="Tägliche Erinnerung"><span></span></label></div></div>
        <div class="row" style="justify-content:space-between"><span>Wochenrückblick</span><div class="row" style="flex-wrap:nowrap">
          <select class="input" id="cf-w-day" style="max-width:140px" aria-label="Wochentag">${WD_ORDER.map(d => `<option value="${d}" ${Number(r.week.weekday) === d ? "selected" : ""}>${WD_LONG[d]}</option>`).join("")}</select>
          ${timeIn("cf-w-time", r.week.time)}<label class="switch"><input type="checkbox" id="cf-w-on" ${r.week.enabled ? "checked" : ""} aria-label="Wöchentliche Erinnerung"><span></span></label></div></div>
        <div class="row" style="justify-content:space-between"><span>Monatsrückblick</span><div class="row" style="flex-wrap:nowrap">
          <select class="input" id="cf-m-day" style="max-width:140px" aria-label="Tag im Monat"><option value="0" ${!Number(r.month.day) ? "selected" : ""}>letzter Tag</option>${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${Number(r.month.day) === i + 1 ? "selected" : ""}>${i + 1}.</option>`).join("")}</select>
          ${timeIn("cf-m-time", r.month.time)}<label class="switch"><input type="checkbox" id="cf-m-on" ${r.month.enabled ? "checked" : ""} aria-label="Monatliche Erinnerung"><span></span></label></div></div>
        <p class="note">Die Erinnerung kommt nur, wenn der Eintrag noch fehlt. Bei geschlossener App über Push (Einstellungen → „Push auch bei geschlossener App“).</p>
      </div>
      <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
    $("[data-x]", s).onclick = close;
    $("#cf-reset", s).onclick = () => { $("#cf-week", s).value = DEFAULT_QUESTIONS.week.join("\n"); $("#cf-month", s).value = DEFAULT_QUESTIONS.month.join("\n"); };
    $("[data-save]", s).onclick = async () => {
      const lines = id => $(id, s).value.split("\n").map(x => x.trim()).filter(Boolean);
      const data = {
        questions: { week: lines("#cf-week"), month: lines("#cf-month") },
        reminders: {
          daily: { enabled: $("#cf-d-on", s).checked, time: $("#cf-d-time", s).value || "21:00" },
          week: { enabled: $("#cf-w-on", s).checked, time: $("#cf-w-time", s).value || "18:00", weekday: Number($("#cf-w-day", s).value) },
          month: { enabled: $("#cf-m-on", s).checked, time: $("#cf-m-time", s).value || "18:00", day: Number($("#cf-m-day", s).value) }
        }
      };
      if (!data.questions.week.length || !data.questions.month.length) { toast("Bitte mindestens eine Frage je Rückblick behalten.", { error: true }); return; }
      try { await merge("settings", "reflect", data); close(); toast("Gespeichert."); }
      catch (e) { toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }); }
    };
  }, { label: "Fragen und Erinnerungen", noFocus: true });
}

/* ---------- Kachel für die Startseite ---------- */
export const widgets = {
  gratitude(el) {
    const d = today();
    const sub = subscribe(st => {
      if (!ready(st) || el.contains(document.activeElement)) return;
      const j = st.journal[d], look = lookbacks(st, d)[0];
      const lookHtml = look ? `<p class="note">${esc(look.label)}: „${esc(look.items[0])}“</p>` : "";
      if (gratitudeDone(j)) {
        el.innerHTML = `<div class="tile-head"><h2>Dankbarkeit heute</h2><a href="#reflektor">Öffnen</a></div>
          <ul style="margin:0;padding-left:18px">${j.gratitude.filter(Boolean).map(t => `<li>${esc(t)}</li>`).join("")}</ul>${lookHtml}`;
        return;
      }
      el.innerHTML = `<div class="tile-head"><h2>Dankbarkeit heute</h2><a href="#reflektor">Öffnen</a></div>
        <form class="stack" style="gap:8px">${[0, 1, 2].map(i => `<input class="input" type="text" data-i="${i}" placeholder="${i + 1}. Ich bin dankbar für …" aria-label="Dankbarkeit ${i + 1}">`).join("")}
        <div><button type="submit" class="btn small primary">Speichern</button></div></form>${lookHtml}`;
      el.querySelector("form").onsubmit = async e => {
        e.preventDefault();
        const vals = $$("input", el).map(i => i.value);
        if (!vals.some(v => v.trim())) return;
        document.activeElement?.blur();
        try { await saveGratitude(d, vals); } catch (err) { toast("Speichern fehlgeschlagen: " + (err.code || err.message), { error: true }); }
      };
    });
    el.innerHTML = `<div class="tile-head"><h2>Dankbarkeit heute</h2></div><div class="empty">Lade …</div>`;
    return sub.stop;
  }
};
