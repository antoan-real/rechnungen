// Lebensreflektor: Lebensrad (monatlich), Leben in Wochen, Rückblick (Alltagsmomente, Jahresrückblick, Suche).
import { icon } from "../../core/icons.js";
import { $, $$, esc, toast } from "../../core/ui.js";
import { put, merge } from "../../core/data.js";
import { today, parseDay, daysBetween } from "../../core/dates.js";
import { lineChart, columnChart, seriesColor } from "../../core/chart.js";
import { areasOf, optionsOf, periodKey, gratitudeDone } from "../reflect-core.js";
import { lookbacks, randomMemory, fail, shortDay, monthName, autoGrow } from "./shared.js";

const fmt = (n, d = 1) => Number(n).toLocaleString("de-DE", { maximumFractionDigits: d });
const addMonths = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/* ---------- f) Lebensrad ---------- */
function radarSvg(areas, now, prev) {
  const S = 320, c = S / 2, R = 112, n = areas.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * v / 10, c + Math.sin(a) * R * v / 10]; };
  const poly = sc => areas.map((a, i) => pt(i, sc[a.id] || 0).map(x => x.toFixed(1)).join(",")).join(" ");
  const rings = [2, 4, 6, 8, 10].map(v => `<polygon class="ring" points="${areas.map((_, i) => pt(i, v).join(",")).join(" ")}"/>`).join("");
  const axes = areas.map((_, i) => { const [x, y] = pt(i, 10); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" class="ring"/>`; }).join("");
  const labels = areas.map((a, i) => {
    const [x, y] = pt(i, 12.2), anchor = Math.abs(x - c) < 8 ? "middle" : x > c ? "start" : "end";
    const words = a.name.split(" "), lines = words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [a.name];
    return `<text x="${x}" y="${y + 4 - (lines.length - 1) * 6}" text-anchor="${anchor}">${lines.map((l, k) => `<tspan x="${x}" dy="${k ? 12 : 0}">${esc(l)}</tspan>`).join("")}</text>`;
  }).join("");
  return `<svg class="radar" viewBox="-110 -24 ${S + 220} ${S + 48}" role="img" aria-label="Lebensrad">${rings}${axes}
    ${prev ? `<polygon class="prev" points="${poly(prev)}"/>` : ""}
    ${now ? `<polygon class="now" points="${poly(now)}"/>${areas.map((a, i) => { const [x, y] = pt(i, now[a.id] || 0); return `<circle class="dot" cx="${x}" cy="${y}" r="4"/>`; }).join("")}` : ""}
    ${labels}</svg>`;
}

export function renderWheel(box, st, ctx, ui, nav) {
  const areas = areasOf(st.cfg), cur = periodKey("month", today());
  ui.month = ui.month || cur;
  const entry = st.wheel[ui.month];
  ui.draft = ui.draftFor === ui.month && ui.draft ? ui.draft : { ...(entry?.scores || {}) };
  ui.draftFor = ui.month;
  for (const a of areas) if (ui.draft[a.id] == null) ui.draft[a.id] = 5;
  const prevKey = Object.keys(st.wheel).filter(k => k < ui.month).sort().pop();
  const prev = prevKey ? st.wheel[prevKey].scores : null;
  const months = Object.keys(st.wheel).sort();
  box.innerHTML = `<div class="stack"><div class="rf-cols">
    <section class="card stack" style="align-items:center">
      <div class="row" style="justify-content:space-between;width:100%"><h2>${esc(monthName(ui.month))}</h2>
        <div class="row" style="gap:4px"><button type="button" class="btn icon small" id="lr-prev" aria-label="Vorheriger Monat">${icon("chevron-left")}</button><button type="button" class="btn icon small" id="lr-next" ${ui.month >= cur ? "disabled" : ""} aria-label="Nächster Monat">${icon("chevron-right")}</button></div></div>
      <div id="lr-radar" style="width:100%;max-width:420px">${radarSvg(areas, ui.draft, prev)}</div>
      <div class="legend-row"><span><i style="background:var(--rf-accent)"></i>${esc(monthName(ui.month))}${entry ? "" : " (Entwurf)"}</span>${prev ? `<span><i style="background:var(--muted)"></i>${esc(monthName(prevKey))}</span>` : ""}</div>
    </section>
    <section class="card stack"><h2>Wie zufrieden bist du gerade?</h2>
      <div class="sliders" id="lr-sliders">${areas.map(a => `<label><span>${esc(a.name)}</span><b class="num" data-v="${esc(a.id)}">${ui.draft[a.id]}</b>
        <input type="range" min="1" max="10" step="1" value="${ui.draft[a.id]}" data-a="${esc(a.id)}" aria-label="${esc(a.name)}"></label>`).join("")}</div>
      <label class="field"><span>Gedanken dazu (optional)</span><textarea class="input" id="lr-note" rows="2">${esc(entry?.note || "")}</textarea></label>
      <div class="row"><button type="button" class="btn primary" id="lr-save">${entry ? "Änderungen speichern" : "Speichern"}</button>${entry ? `<span class="note">gespeichert</span>` : ""}</div>
    </section></div>
    <section class="card stack"><h2>Verlauf</h2>${months.length >= 2 ? `<div id="lr-line"></div>` : `<p class="muted small" style="margin:0">Ab dem zweiten Monat siehst du hier, wie sich deine Bereiche entwickeln.</p>`}</section></div>`;
  autoGrow($("#lr-note", box));
  box.oninput = e => {
    const r = e.target.closest("[data-a]");
    if (r) { ui.draft[r.dataset.a] = +r.value; $(`[data-v="${CSS.escape(r.dataset.a)}"]`, box).textContent = r.value; $("#lr-radar", box).innerHTML = radarSvg(areas, ui.draft, prev); }
    if (e.target.tagName === "TEXTAREA") autoGrow(e.target);
  };
  $("#lr-prev", box).onclick = () => { ui.month = addMonths(ui.month, -1); nav.rerender(); };
  $("#lr-next", box).onclick = () => { ui.month = addMonths(ui.month, 1); nav.rerender(); };
  $("#lr-save", box).onclick = async () => {
    const scores = Object.fromEntries(areas.map(a => [a.id, ui.draft[a.id]]));
    await put("wheel", ui.month, { month: ui.month, scores, note: $("#lr-note", box).value.trim(), updatedAt: new Date().toISOString() }).catch(fail);
    toast("Lebensrad gespeichert.");
  };
  if (months.length >= 2) return lineChart($("#lr-line", box), {
    series: areas.map((a, i) => ({ name: a.name, color: seriesColor(i), points: months.filter(m => st.wheel[m].scores?.[a.id] != null).map(m => ({ date: m + "-01", y: st.wheel[m].scores[a.id] })) })),
    label: "Lebensrad-Verlauf", height: 240
  });
}

/* ---------- g) Leben in Wochen ---------- */
export function renderWeeks(box, st, ctx) {
  const birth = optionsOf(st.cfg).birthday;
  if (!birth) {
    box.innerHTML = `<section class="card stack" style="max-width:520px"><h2>Leben in Wochen</h2>
      <p class="serif">Ein Kästchen für jede Woche eines 80-jährigen Lebens. Trag einmal dein Geburtsdatum ein.</p>
      <div class="row"><input class="input" type="date" id="lw-birth" style="max-width:200px" aria-label="Geburtsdatum"><button type="button" class="btn primary" id="lw-save">Speichern</button></div></section>`;
    $("#lw-save", box).onclick = () => { const v = $("#lw-birth", box).value; if (v) merge("settings", "reflect", { birthday: v }).catch(fail); };
    return;
  }
  const lived = Math.max(0, Math.floor(daysBetween(birth, today()) / 7)), TOTAL = 80 * 52;
  const years = Math.floor(lived / 52), weeks = lived % 52;
  box.innerHTML = `<section class="card stack">
    <h2>Leben in Wochen</h2>
    <p class="serif" style="font-size:18px">Du bist ${years} Jahre und ${weeks} Woche${weeks === 1 ? "" : "n"} alt – Woche ${fmt(lived + 1, 0)} von ${fmt(TOTAL, 0)}. Jedes Kästchen ist eine Woche. Mach die nächste zu einer, an die du dich gern erinnerst.</p>
    <div class="legend-row"><span><i style="background:var(--muted)"></i>gelebt (${fmt(Math.min(100, lived / TOTAL * 100))} %)</span><span><i style="background:var(--rf-accent)"></i>diese Woche</span><span><i style="background:transparent;border:1px solid var(--line)"></i>noch vor dir</span></div>
    <div class="weeks-wrap"><canvas id="lw-canvas" role="img" aria-label="${fmt(lived, 0)} von ${fmt(TOTAL, 0)} Lebenswochen gelebt"></canvas></div>
    <p class="note">Geburtsdatum ändern: Einstellungen des Lebensreflektors.</p></section>`;
  const canvas = $("#lw-canvas", box), wrap = canvas.parentElement;
  const draw = () => {
    const cs = getComputedStyle(box), col = n => cs.getPropertyValue(n).trim();
    const labelW = 26, avail = Math.max(260, wrap.clientWidth) - labelW;
    const cell = Math.max(4, Math.min(12, Math.floor(avail / 52))), gap = cell >= 7 ? 2 : 1, size = cell - gap;
    const top = 6, w = labelW + 52 * cell, h = 80 * cell + top + 4, dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const g = canvas.getContext("2d"); g.scale(dpr, dpr);
    g.font = "10px " + (cs.getPropertyValue("--f-ui") || "sans-serif"); g.textAlign = "right"; g.textBaseline = "middle"; g.translate(0, top);
    for (let y = 0; y < 80; y++) {
      if (y % 10 === 0) { g.fillStyle = col("--muted"); g.fillText(String(y), labelW - 5, y * cell + size / 2); }
      for (let x = 0; x < 52; x++) {
        const i = y * 52 + x, px = labelW + x * cell, py = y * cell;
        if (i < lived) { g.fillStyle = col("--muted"); g.globalAlpha = 0.55; g.fillRect(px, py, size, size); g.globalAlpha = 1; }
        else if (i === lived) { g.fillStyle = col("--rf-accent"); g.fillRect(px - 0.5, py - 0.5, size + 1, size + 1); }
        else { g.strokeStyle = col("--line"); g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1); }
      }
    }
  };
  draw();
  const ro = new ResizeObserver(() => draw()); ro.observe(wrap);
  return () => ro.disconnect();
}

/* ---------- h) Rückblick ---------- */
export function renderReview(box, st, ctx, ui, nav) {
  ui.view = ui.view || "rueckblick";
  const cleanups = [];
  const d = today();
  const views = [["rueckblick", "Rückblick"], ["momente", "Alltagsmomente"], ["jahr", "Jahresrückblick"], ["suche", "Suche"]];
  let html = `<div class="seg" id="rv-seg" style="margin-bottom:14px;flex-wrap:wrap">${views.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${ui.view === v}">${l}</button>`).join("")}</div>`;

  if (ui.view === "rueckblick") {
    const looks = lookbacks(st, d), mem = ui.memory || randomMemory(st, d);
    html += `<div class="rf-cols"><section class="card stack"><h2>Heute vor …</h2>
      ${looks.length ? looks.map(l => `<div class="lookback"><small>${esc(l.label)} · ${esc(shortDay(l.date))} hast du geschrieben:</small>${l.lines.map(x => `<p class="serif"><span class="muted small">${esc(x.kind)}:</span> ${esc(x.text)}</p>`).join("")}</div>`).join("")
        : `<p class="muted" style="margin:0">Hier erscheint, was du heute vor einem Monat und vor einem Jahr geschrieben hast.</p>`}</section>
      <section class="card stack"><h2>Zufällige Erinnerung</h2>
      ${mem ? `<p class="small muted" style="margin:0">${esc(shortDay(mem.date))} · ${esc(mem.kind)}</p><p class="serif" style="font-size:19px">${esc(mem.text)}</p><div><button type="button" class="btn small" id="rv-more">Noch eine</button></div>`
        : `<p class="muted" style="margin:0">Sobald deine Einträge älter als einen Monat sind, holt die App hier ab und zu einen zurück.</p>`}</section></div>`;
  }
  if (ui.view === "momente") {
    const ms = Object.values(st.journal).filter(j => j.moment?.trim()).sort((a, b) => b.date.localeCompare(a.date));
    let last = "";
    html += `<section class="card stack"><h2>Alltagsmomente</h2>${ms.length ? `<ul class="timeline">${ms.map(j => { const m = j.date.slice(0, 7), head = m !== last ? `<li class="tl-month" aria-hidden="true" style="list-style:none">${esc(monthName(m))}</li>` : ""; last = m; return head + `<li><small>${esc(shortDay(j.date))}</small><p class="serif" style="font-size:17px">${esc(j.moment)}</p></li>`; }).join("")}</ul>`
      : `<p class="muted" style="margin:0">Noch keine Alltagsmomente. Halte im Check-in fest, was heute ganz normal war – genau das wird später wertvoll.</p>`}</section>`;
  }
  if (ui.view === "jahr") {
    const years = [...new Set([...Object.keys(st.journal), ...Object.keys(st.wheel), ...st.complaints.map(c => c.date), d].map(x => x.slice(0, 4)))].sort().reverse();
    ui.year = ui.year || d.slice(0, 4);
    const y = ui.year, inY = x => String(x || "").startsWith(y);
    const js = Object.values(st.journal).filter(j => inY(j.date));
    const grat = js.flatMap(j => (j.gratitude || []).filter(g => String(g || "").trim()).map(text => ({ date: j.date, text })));
    const moments = js.filter(j => j.moment?.trim()).sort((a, b) => a.date.localeCompare(b.date));
    const moods = js.filter(j => j.mood);
    const notes = st.cards.flatMap(c => (c.notes || []).filter(n => inY(n.date)).map(n => ({ ...n, card: c.title })));
    const comps = st.complaints.filter(c => inY(c.date));
    const weeksDone = Object.values(st.reflections).filter(r => r.type === "week" && inY(r.period)).length;
    const wheelMonths = Object.keys(st.wheel).filter(inY).sort();
    const pick = grat.slice().sort((a, b) => (a.date + a.text).localeCompare(b.date + b.text)).filter((_, i, arr) => arr.length <= 6 || i % Math.ceil(arr.length / 6) === 0).slice(0, 6);
    html += `<div class="stack"><div class="row"><h2 style="margin-right:8px">Jahresrückblick</h2><select class="input" id="rv-year" style="max-width:120px" aria-label="Jahr">${years.map(x => `<option ${x === y ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="tiles">
        <div class="stat"><span>Check-in-Tage</span><b>${js.filter(gratitudeDone).length}</b></div>
        <div class="stat"><span>Dinge, für die du dankbar warst</span><b>${grat.length}</b></div>
        <div class="stat"><span>Alltagsmomente</span><b>${moments.length}</b></div>
        <div class="stat"><span>Notizen zu Karten</span><b>${notes.length}</b></div>
        <div class="stat"><span>Umgedeutete Ärgernisse</span><b>${comps.length}</b></div>
        <div class="stat"><span>Mal rausgezoomt</span><b>${weeksDone}</b></div>
        ${moods.length ? `<div class="stat"><span>Ø Stimmung</span><b>${fmt(moods.reduce((a, j) => a + j.mood, 0) / moods.length)}</b><small>aus ${moods.length} Tagen</small></div>` : ""}
      </div>
      ${moods.length ? `<section class="card stack"><h2>Stimmung pro Monat (Ø)</h2><div id="rv-mood"></div></section>` : ""}
      ${wheelMonths.length >= 2 ? `<section class="card stack"><h2>Lebensrad im Jahresverlauf</h2><div id="rv-wheel"></div></section>` : ""}
      ${pick.length ? `<section class="card stack"><h2>Wofür du dankbar warst</h2><ul class="notes">${pick.map(g => `<li><small>${esc(shortDay(g.date))}</small><p>${esc(g.text)}</p></li>`).join("")}</ul></section>` : ""}
      ${moments.length ? `<section class="card stack"><h2>Deine Alltagsmomente ${y}</h2><ul class="timeline">${moments.map(j => `<li><small>${esc(shortDay(j.date))}</small><p class="serif">${esc(j.moment)}</p></li>`).join("")}</ul></section>` : ""}
      ${notes.length ? `<section class="card stack"><h2>Wo dir die Gedanken begegnet sind</h2><ul class="notes">${notes.sort((a, b) => a.date.localeCompare(b.date)).map(n => `<li><small>${esc(shortDay(n.date))} · ${esc(n.card)}</small><p>${esc(n.text)}</p></li>`).join("")}</ul></section>` : ""}
      ${!js.length && !comps.length && !notes.length ? `<div class="card empty">Für ${y} gibt es noch keine Einträge.</div>` : ""}</div>`;
    ui._chart = { moods, wheelMonths, y };
  }
  if (ui.view === "suche") {
    const q = (ui.q || "").trim().toLowerCase(), hits = [];
    if (q.length >= 2) {
      for (const j of Object.values(st.journal)) {
        for (const g of j.gratitude || []) if (String(g).toLowerCase().includes(q)) hits.push({ date: j.date, kind: "Dankbar für", text: g });
        if (j.moment?.toLowerCase().includes(q)) hits.push({ date: j.date, kind: "Alltagsmoment", text: j.moment });
      }
      for (const r of Object.values(st.reflections)) for (const a of r.answers || []) if ((a.q + " " + a.a).toLowerCase().includes(q) && a.a) hits.push({ date: r.date, kind: a.q, text: a.a });
      for (const c of st.cards) for (const n of c.notes || []) if (n.text.toLowerCase().includes(q)) hits.push({ date: n.date, kind: `Notiz zu „${c.title}“`, text: n.text });
      for (const c of st.complaints) if ((c.text + " " + c.reframe).toLowerCase().includes(q)) hits.push({ date: c.date, kind: "Meckern umgedreht", text: `${c.text}${c.reframe ? " → " + c.reframe : ""}` });
      for (const p of st.people) for (const e of p.entries || []) if (e.text.toLowerCase().includes(q)) hits.push({ date: e.date, kind: `${p.name} · ${e.type}`, text: e.text });
      hits.sort((a, b) => b.date.localeCompare(a.date));
    }
    html += `<section class="card stack"><input class="input" type="search" id="rv-q" placeholder="In allen Einträgen suchen …" value="${esc(ui.q || "")}" aria-label="Suchen">
      ${q.length < 2 ? `<p class="muted small" style="margin:0">Durchsucht Dankbarkeit, Alltagsmomente, Rauszoomen, Karten-Notizen, Meckern und Menschen.</p>` : hits.length ? `<ul class="notes">${hits.slice(0, 100).map(h => `<li><small>${esc(shortDay(h.date))} · ${esc(h.kind)}</small><p>${esc(h.text)}</p></li>`).join("")}</ul>` : `<p class="muted" style="margin:0">Nichts gefunden.</p>`}</section>`;
  }
  box.innerHTML = html;

  $("#rv-seg", box).onclick = e => { const b = e.target.closest("[data-v]"); if (b) { ui.view = b.dataset.v; nav.rerender(); } };
  if ($("#rv-more", box)) $("#rv-more", box).onclick = () => {
    const pool = [];
    for (const j of Object.values(st.journal)) { if (j.date > today()) continue; for (const g of j.gratitude || []) if (String(g || "").trim()) pool.push({ date: j.date, kind: "Dankbar für", text: g }); if (j.moment?.trim()) pool.push({ date: j.date, kind: "Alltagsmoment", text: j.moment }); }
    const older = pool.filter(p => daysBetween(p.date, today()) >= 7);
    const from = older.length ? older : pool;
    ui.memory = from[Math.floor(Math.random() * from.length)]; nav.rerender();
  };
  if ($("#rv-year", box)) $("#rv-year", box).onchange = e => { ui.year = e.target.value; nav.rerender(); };
  if ($("#rv-q", box)) $("#rv-q", box).oninput = e => { ui.q = e.target.value; const p = e.target.selectionStart; nav.rerender(); const n = $("#rv-q", box); n.focus(); n.setSelectionRange(p, p); };
  if (ui.view === "jahr" && ui._chart) {
    const { moods, wheelMonths, y } = ui._chart;
    if (moods.length && $("#rv-mood", box)) {
      const by = {}; for (const j of moods) { const m = j.date.slice(0, 7); (by[m] ||= []).push(j.mood); }
      cleanups.push(columnChart($("#rv-mood", box), { bars: Array.from({ length: 12 }, (_, i) => { const m = `${y}-${String(i + 1).padStart(2, "0")}`, v = by[m]; return { label: parseDay(m + "-01").toLocaleDateString("de-DE", { month: "short" }), value: v ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : 0, tip: monthName(m) + (v ? ` · ${v.length} Tage` : " · keine Angabe") }; }), label: "Stimmung pro Monat", height: 180 }));
    }
    if (wheelMonths.length >= 2 && $("#rv-wheel", box)) {
      const areas = areasOf(st.cfg);
      cleanups.push(lineChart($("#rv-wheel", box), { series: areas.map((a, i) => ({ name: a.name, color: seriesColor(i), points: wheelMonths.filter(m => st.wheel[m].scores?.[a.id] != null).map(m => ({ date: m + "-01", y: st.wheel[m].scores[a.id] })) })), label: "Lebensrad im Jahresverlauf", height: 220 }));
    }
  }
  return () => cleanups.forEach(f => f && f());
}
