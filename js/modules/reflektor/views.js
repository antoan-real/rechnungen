// Lebensreflektor: Perspektiv-Karten, Meckern umdrehen, Menschen und ihre Geschichten, Rauszoomen.
import { icon } from "../../core/icons.js";
import { $, $$, esc, openSheet, toast } from "../../core/ui.js";
import { put, merge, remove, newId } from "../../core/data.js";
import { today, addDays, isoWeek, shortDate } from "../../core/dates.js";
import { matchCard, REFRAME_QUESTIONS, ENTRY_TYPES, terms, questionsFor, periodKey, reflectionId } from "../reflect-core.js";
import { cardHtml, autoGrow, fail, shortDay } from "./shared.js";

/* ---------- a) Perspektiv-Karten ---------- */
export function renderCards(box, st, ctx, ui) {
  ui.filter = ui.filter || "alle";
  const cats = [...new Set(st.cards.map(c => c.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  const q = (ui.q || "").toLowerCase();
  const list = st.cards.filter(c => (ui.filter === "alle" || (ui.filter === "fav" ? c.favorite : c.category === ui.filter))
    && (!q || (c.title + " " + c.text + " " + (c.notes || []).map(n => n.text).join(" ")).toLowerCase().includes(q)));
  box.innerHTML = `<div class="stack">
    <div class="row"><input class="input" type="search" id="ck-q" placeholder="In Karten und Notizen suchen …" value="${esc(ui.q || "")}" style="flex:1 1 220px;width:auto" aria-label="Karten durchsuchen">
      <button type="button" class="btn primary" id="ck-new">+ Karte</button></div>
    <div class="chips" id="ck-filter">${[["alle", `Alle (${st.cards.length})`], ["fav", `Favoriten (${st.cards.filter(c => c.favorite).length})`], ...cats.map(c => [c, c])].map(([v, l]) => `<button type="button" class="chip" data-f="${esc(v)}" aria-pressed="${ui.filter === v}">${esc(l)}</button>`).join("")}</div>
    <div class="cardlist">${list.map(c => cardHtml(c, { compact: true, button: true, actions: `${c.favorite ? `<span class="fav-mark">${icon("heart", { size: 14, fill: true })} Favorit</span>` : ""}${c.notes?.length ? `<span class="small muted">${c.notes.length} Notiz${c.notes.length === 1 ? "" : "en"}</span>` : ""}` })).join("")
      || `<div class="card empty">${st.cards.length ? "Keine Karte passt zur Auswahl." : "Noch keine Karten."}</div>`}</div></div>`;
  $("#ck-q", box).oninput = e => { ui.q = e.target.value; const p = e.target.selectionStart; renderCards(box, st, ctx, ui); const n = $("#ck-q", box); n.focus(); n.setSelectionRange(p, p); };
  $("#ck-filter", box).onclick = e => { const b = e.target.closest("[data-f]"); if (b) { ui.filter = b.dataset.f; renderCards(box, st, ctx, ui); } };
  $("#ck-new", box).onclick = () => editCard(st, null);
  box.onclick = e => { const c = e.target.closest("[data-card]"); if (c) openCard(st, c.dataset.card, ctx); };
  box.onkeydown = e => { const c = e.target.closest("[data-card]"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCard(st, c.dataset.card, ctx); } };
}

/** Karte groß ansehen: Favorit, Quelle, Notizen „wo ist mir das begegnet“, bearbeiten/löschen */
export function openCard(st, id, ctx) {
  openSheet((s, close) => {
    s.classList.add("rf");
    const draw = () => {
      const c = st.cards.find(x => x.id === id); if (!c) { close(); return; }
      const notes = (c.notes || []).slice().sort((a, b) => b.date.localeCompare(a.date));
      const src = c.source ? (/^https?:\/\//.test(c.source) ? `<a href="${esc(c.source)}" target="_blank" rel="noopener" style="overflow-wrap:anywhere">${esc(c.source)}</a>` : esc(c.source)) : "";
      s.innerHTML = `${cardHtml(c, { actions: `<button type="button" class="fav" data-fav aria-pressed="${!!c.favorite}" aria-label="${c.favorite ? "Favorit entfernen" : "Als Favorit markieren"}">${icon("heart", { size: 22, fill: !!c.favorite })}</button>${src ? `<span class="small muted">Quelle: ${src}</span>` : ""}` })}
        <div class="stack"><h2>Wo ist mir das begegnet?</h2>
          <form class="stack" id="cn-form" style="gap:8px"><textarea class="input" id="cn-text" rows="2" placeholder="z. B. Heute stand ich im Stau, als ein Rettungswagen vorbeifuhr …" aria-label="Neue Notiz"></textarea>
            <div><button type="submit" class="btn small primary">Notiz hinzufügen</button></div></form>
          ${notes.length ? `<ul class="notes">${notes.map(n => `<li><small>${esc(shortDay(n.date))} <button type="button" class="linkbtn small" data-delnote="${esc(n.id)}" aria-label="Notiz löschen">löschen</button></small><p>${esc(n.text)}</p></li>`).join("")}</ul>` : `<p class="muted small" style="margin:0">Noch keine Notizen zu dieser Karte.</p>`}</div>
        <div class="sheet-foot"><button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button><button type="button" class="btn" data-edit>Bearbeiten</button><button type="button" class="btn primary" data-x>Schließen</button></div>`;
      $("#cn-text", s).oninput = e => autoGrow(e.target);
      $("[data-fav]", s).onclick = async () => { await merge("cards", c.id, { favorite: !c.favorite }).catch(fail); draw(); };
      $("#cn-form", s).onsubmit = async e => {
        e.preventDefault(); const text = $("#cn-text", s).value.trim(); if (!text) return;
        await merge("cards", c.id, { notes: [...(c.notes || []), { id: Date.now().toString(36), date: today(), text }] }).catch(fail);
        setTimeout(draw, 50);
      };
      s.querySelectorAll("[data-delnote]").forEach(b => b.onclick = () => ctx.confirmBox("Diese Notiz löschen?", "Löschen", async () => {
        await merge("cards", c.id, { notes: (c.notes || []).filter(n => n.id !== b.dataset.delnote) }).catch(fail); setTimeout(draw, 50);
      }, { danger: true }));
      $("[data-x]", s).onclick = close;
      $("[data-edit]", s).onclick = () => { close(); editCard(st, c); };
      $("[data-del]", s).onclick = () => ctx.confirmBox(`Karte „${c.title}“ mit allen Notizen löschen?`, "Löschen", () => { close(); remove("cards", c.id).then(() => toast("Karte gelöscht.")).catch(fail); }, { danger: true });
    };
    draw();
  }, { label: "Perspektiv-Karte", noFocus: true });
}

function editCard(st, c) {
  openSheet((s, close) => {
    s.classList.add("rf");
    const cats = [...new Set(st.cards.map(x => x.category).filter(Boolean))];
    s.innerHTML = `<div class="sheet-head"><h3>${c ? "Karte bearbeiten" : "Neue Perspektiv-Karte"}</h3></div>
      <label class="field"><span>Titel</span><input class="input" type="text" id="ce-title" value="${esc(c?.title || "")}"></label>
      <label class="field"><span>Gedanke – so lang, wie er sein muss</span><textarea class="input" id="ce-text" rows="8">${esc(c?.text || "")}</textarea></label>
      <div class="row" style="flex-wrap:nowrap"><label class="field" style="flex:1"><span>Kategorie (optional)</span><input class="input" type="text" id="ce-cat" list="ce-cats" value="${esc(c?.category || "")}"></label></div>
      <datalist id="ce-cats">${cats.map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      <label class="field"><span>Quelle (optional, z. B. Link zu einem Video)</span><input class="input" type="text" id="ce-src" value="${esc(c?.source || "")}"></label>
      <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
    autoGrow($("#ce-text", s)); $("#ce-text", s).oninput = e => autoGrow(e.target);
    $("[data-x]", s).onclick = close;
    $("[data-save]", s).onclick = async () => {
      const title = $("#ce-title", s).value.trim(), text = $("#ce-text", s).value.trim();
      if (!title || !text) { toast("Bitte Titel und Gedanken eingeben.", { error: true }); return; }
      const data = { title, text, category: $("#ce-cat", s).value.trim(), source: $("#ce-src", s).value.trim() };
      try {
        if (c) await merge("cards", c.id, data);
        else await put("cards", newId("card"), { ...data, favorite: false, notes: [], createdAt: new Date().toISOString() });
        close(); toast("Karte gespeichert.");
      } catch (e) { fail(e); }
    };
  }, { label: "Karte bearbeiten" });
}

/* ---------- c) Meckern umdrehen ---------- */
export function renderComplaints(box, st, ctx, ui) {
  const counts = new Map();
  for (const c of st.complaints) for (const w of new Set(terms(c.text))) counts.set(w, (counts.get(w) || 0) + 1);
  const top = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const card = ui.cardId ? st.cards.find(c => c.id === ui.cardId) : null;
  box.innerHTML = `<div class="rf-cols">
    <section class="card stack">
      <h2>Was regt dich gerade auf?</h2>
      ${!ui.step ? `<form class="stack" id="mk-form"><textarea class="input" id="mk-text" rows="3" placeholder="z. B. Die Bahn ist schon wieder zu spät" aria-label="Worüber du dich ärgerst">${esc(ui.text || "")}</textarea>
          <div><button type="submit" class="btn primary">Umdrehen</button></div></form>
          <p class="note">Schreib es kurz auf. Danach bekommst du eine Frage und eine passende Perspektiv-Karte.</p>`
      : `<p class="serif" style="font-size:calc(17px * var(--fs))">„${esc(ui.text)}“</p>
         <div class="lookback"><small>Frag dich:</small><p class="serif" style="font-size:calc(19px * var(--fs))">${esc(ui.question)}</p></div>
         ${card ? cardHtml(card, { compact: true, label: "Perspektive", actions: `<button type="button" class="btn small ghost" id="mk-other">Andere Karte</button>` }) : ""}
         <label class="field"><span>Meine Umdeutung</span><textarea class="input" id="mk-reframe" rows="3" placeholder="Eigentlich ist das ein Zeichen, dass …">${esc(ui.reframe || "")}</textarea></label>
         <div class="row"><button type="button" class="btn primary" id="mk-save">Speichern</button><button type="button" class="btn" id="mk-cancel">Verwerfen</button></div>`}
    </section>
    <section class="card stack"><h2>Worüber ich mich oft ärgere</h2>
      ${top.length ? `<div class="chips">${top.map(([w, n]) => `<span class="chip" aria-pressed="false">${esc(w)} · ${n}×</span>`).join("")}</div>` : `<p class="muted small" style="margin:0">Sobald sich Themen wiederholen, siehst du sie hier.</p>`}
      ${st.complaints.length ? `<ul class="notes">${st.complaints.slice(0, 60).map(c => { const k = st.cards.find(x => x.id === c.cardId); return `<li><small>${esc(shortDay(c.date))}${k ? ` · Karte: ${esc(k.title)}` : ""} <button type="button" class="linkbtn small" data-del="${esc(c.id)}">löschen</button></small>
          <p><span class="muted">Ärger:</span> ${esc(c.text)}</p>${c.reframe ? `<p><span class="muted">Umgedeutet:</span> ${esc(c.reframe)}</p>` : ""}</li>`; }).join("")}</ul>` : ""}
    </section></div>`;
  $$("textarea", box).forEach(autoGrow);
  box.oninput = e => { if (e.target.tagName === "TEXTAREA") { autoGrow(e.target); if (e.target.id === "mk-reframe") ui.reframe = e.target.value; if (e.target.id === "mk-text") ui.text = e.target.value; } };
  const f = $("#mk-form", box);
  if (f) f.onsubmit = e => {
    e.preventDefault(); const text = $("#mk-text", box).value.trim(); if (!text) return;
    const seed = String(Date.now());
    Object.assign(ui, { step: 1, text, question: REFRAME_QUESTIONS[Math.floor(Math.random() * REFRAME_QUESTIONS.length)], cardId: matchCard(text, st.cards, seed)?.id, reframe: "", seen: [] });
    document.activeElement?.blur(); renderComplaints(box, st, ctx, ui);
  };
  const other = $("#mk-other", box);
  if (other) other.onclick = () => {
    ui.seen = [...(ui.seen || []), ui.cardId];
    const rest = st.cards.filter(c => !ui.seen.includes(c.id));
    ui.cardId = (matchCard(ui.text, rest.length ? rest : st.cards, String(Date.now())) || {}).id;
    renderComplaints(box, st, ctx, ui);
  };
  const reset = () => { Object.assign(ui, { step: 0, text: "", reframe: "", cardId: null }); renderComplaints(box, st, ctx, ui); };
  if ($("#mk-cancel", box)) $("#mk-cancel", box).onclick = reset;
  if ($("#mk-save", box)) $("#mk-save", box).onclick = async () => {
    const reframe = $("#mk-reframe", box).value.trim();
    await put("complaints", newId("mk"), { date: today(), text: ui.text, question: ui.question, cardId: ui.cardId || null, reframe, createdAt: new Date().toISOString() }).catch(fail);
    document.activeElement?.blur(); toast("Gespeichert."); reset();
  };
  box.onclick = e => { const b = e.target.closest("[data-del]"); if (b) ctx.confirmBox("Eintrag löschen?", "Löschen", () => remove("complaints", b.dataset.del).catch(fail), { danger: true }); };
}

/* ---------- d) Menschen und ihre Geschichten ---------- */
export function renderPeople(box, st, ctx, ui) {
  const p = ui.personId ? st.people.find(x => x.id === ui.personId) : null;
  if (!p && ui.personId && ui.personId === ui.creating) { box.innerHTML = `<div class="empty">Lade …</div>`; return; }
  if (!p) {
    ui.personId = null;
    box.innerHTML = `<div class="stack"><p class="muted" style="margin:0">Halte fest, was heute nervt oder selbstverständlich ist und später unbezahlbar wird: Geschichten, Sprüche, Eigenarten.</p>
      <form class="row" id="pp-new" style="flex-wrap:nowrap"><input class="input" type="text" id="pp-name" placeholder="Name, z. B. Papa" aria-label="Name"><button type="submit" class="btn primary">Hinzufügen</button></form>
      <div class="people">${st.people.map(x => `<button type="button" class="card person" data-p="${esc(x.id)}"><b>${esc(x.name)}</b><span class="small muted">${esc(x.relation || "")}${x.relation ? " · " : ""}${(x.entries || []).length} Einträge</span></button>`).join("")}</div></div>`;
    $("#pp-new", box).onsubmit = async e => {
      e.preventDefault(); const name = $("#pp-name", box).value.trim(); if (!name) return;
      const id = newId("p"); document.activeElement?.blur();
      ui.personId = ui.creating = id; renderPeople(box, st, ctx, ui);
      await put("people", id, { name, relation: "", entries: [], createdAt: new Date().toISOString() }).catch(e => { ui.personId = ui.creating = null; fail(e); });
    };
    box.onclick = e => { const b = e.target.closest("[data-p]"); if (b) { ui.personId = b.dataset.p; renderPeople(box, st, ctx, ui); } };
    return;
  }
  const by = t => (p.entries || []).filter(x => x.type === t).sort((a, b) => b.date.localeCompare(a.date));
  box.innerHTML = `<div class="stack">
    <div><button type="button" class="btn small ghost" id="pp-back">${icon("chevron-left", { size: 16 })} Alle Menschen</button></div>
    <section class="card stack">
      <div class="row" style="flex-wrap:nowrap"><input class="input" type="text" id="pp-ename" value="${esc(p.name)}" aria-label="Name" style="font-size:calc(20px * var(--fs));font-weight:700"></div>
      <input class="input" type="text" id="pp-rel" value="${esc(p.relation || "")}" placeholder="Beziehung, z. B. mein Vater" aria-label="Beziehung">
      <form class="stack" id="pp-add" style="gap:8px;margin-top:6px">
        <div class="seg" id="pp-type">${ENTRY_TYPES.map(t => `<button type="button" data-t="${t}" aria-pressed="${(ui.type || "Geschichte") === t}">${t}</button>`).join("")}</div>
        <textarea class="input" id="pp-text" rows="3" placeholder="${(ui.type || "Geschichte") === "Spruch" ? "Was sagt er/sie immer?" : (ui.type || "Geschichte") === "Eigenart" ? "Was macht er/sie typischerweise?" : "Welche Geschichte erzählt er/sie?"}" aria-label="Neuer Eintrag"></textarea>
        <div><button type="submit" class="btn primary small">Festhalten</button></div></form>
    </section>
    ${ENTRY_TYPES.map(t => by(t).length ? `<section class="card stack"><h2>${t === "Geschichte" ? "Geschichten" : t === "Spruch" ? "Sprüche" : "Eigenarten"}</h2>
      <ul class="notes">${by(t).map(x => `<li><small>${esc(shortDay(x.date))} <button type="button" class="linkbtn small" data-edit="${esc(x.id)}">bearbeiten</button> <button type="button" class="linkbtn small" data-del="${esc(x.id)}">löschen</button></small><p>${esc(x.text)}</p></li>`).join("")}</ul></section>` : "").join("")}
    <div><button type="button" class="btn danger small" id="pp-delete">Person löschen</button></div></div>`;
  const savePerson = patch => merge("people", p.id, patch).catch(fail);
  $("#pp-back", box).onclick = () => { ui.personId = null; renderPeople(box, st, ctx, ui); };
  $("#pp-ename", box).onchange = e => e.target.value.trim() && savePerson({ name: e.target.value.trim() });
  $("#pp-rel", box).onchange = e => savePerson({ relation: e.target.value.trim() });
  $("#pp-type", box).onclick = e => { const b = e.target.closest("[data-t]"); if (b) { ui.type = b.dataset.t; renderPeople(box, st, ctx, ui); $("#pp-text", box).focus(); } };
  $("#pp-text", box).oninput = e => autoGrow(e.target);
  $("#pp-add", box).onsubmit = async e => {
    e.preventDefault(); const text = $("#pp-text", box).value.trim(); if (!text) return;
    document.activeElement?.blur();
    await savePerson({ entries: [...(p.entries || []), { id: Date.now().toString(36), type: ui.type || "Geschichte", text, date: today() }] });
  };
  $("#pp-delete", box).onclick = () => ctx.confirmBox(`${p.name} mit allen Einträgen löschen?`, "Löschen", () => { ui.personId = null; remove("people", p.id).catch(fail); }, { danger: true });
  box.onclick = e => {
    const del = e.target.closest("[data-del]");
    if (del) ctx.confirmBox("Eintrag löschen?", "Löschen", () => savePerson({ entries: p.entries.filter(x => x.id !== del.dataset.del) }), { danger: true });
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      const x = p.entries.find(y => y.id === ed.dataset.edit);
      openSheet((s, close) => {
        s.classList.add("rf");
        s.innerHTML = `<div class="sheet-head"><h3>${esc(x.type)} bearbeiten</h3></div><textarea class="input" id="pe-text" rows="6">${esc(x.text)}</textarea>
          <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
        autoGrow($("#pe-text", s));
        $("[data-x]", s).onclick = close;
        $("[data-save]", s).onclick = () => { const text = $("#pe-text", s).value.trim(); if (!text) return; savePerson({ entries: p.entries.map(y => y.id === x.id ? { ...y, text } : y) }); close(); };
      }, { label: "Eintrag bearbeiten" });
    }
  };
}

/* ---------- e) Rauszoomen (wöchentlich) ---------- */
export function renderZoom(box, st, ctx, ui) {
  const d = today(), key = periodKey("week", d), id = reflectionId("week", key), saved = st.reflections[id];
  const qs = saved ? saved.answers.map(a => a.q) : questionsFor("week", d, st.cfg);
  const mon = addDays(d, -((new Date().getDay() + 6) % 7));
  const past = Object.values(st.reflections).filter(r => r.id !== id).sort((a, b) => String(b.period).localeCompare(String(a.period)));
  box.innerHTML = `<div class="stack">
    <section class="card stack">
      <h2>Rauszoomen · KW ${isoWeek(d).week} · ${esc(shortDate(mon).slice(0, 6))}–${esc(shortDate(addDays(mon, 6)).slice(0, 6))}</h2>
      ${qs.map((q, i) => `<label class="field"><span style="font-size:calc(18px * var(--fs));line-height:1.45;color:var(--ink);font-weight:500">${esc(q)}</span>
        <textarea class="input" rows="3" data-q="${i}">${esc(saved?.answers[i]?.a || "")}</textarea></label>`).join("")}
      <div class="row"><button type="button" class="btn primary" id="rz-save">${saved ? "Änderungen speichern" : "Speichern"}</button>
        <span class="note">${saved ? `Gespeichert am ${esc(shortDay(saved.date))}` : "Jede Woche drei wechselnde Fragen. Den Katalog änderst du in den Einstellungen."}</span></div>
    </section>
    ${past.length ? `<section class="card stack"><h2>Frühere Wochen</h2>${past.slice(0, 30).map(r => `<details><summary style="cursor:pointer">${r.type === "month" ? "Monatsrückblick " : "KW "}${esc(r.type === "month" ? r.period : r.period.split("-W")[1] + " / " + r.period.split("-W")[0])} <span class="muted small">· ${esc(shortDay(r.date))}</span></summary>
      <ul class="notes" style="margin-top:10px">${r.answers.filter(a => a.a).map(a => `<li><small>${esc(a.q)}</small><p>${esc(a.a)}</p></li>`).join("")}</ul></details>`).join("")}</section>` : ""}
  </div>`;
  $$("textarea", box).forEach(autoGrow);
  box.oninput = e => { if (e.target.tagName === "TEXTAREA") autoGrow(e.target); };
  $("#rz-save", box).onclick = async () => {
    const answers = qs.map((q, i) => ({ q, a: box.querySelector(`[data-q="${i}"]`).value.trim() }));
    if (!answers.some(a => a.a)) { toast("Beantworte mindestens eine Frage."); return; }
    document.activeElement?.blur();
    await put("reflections", id, { type: "week", period: key, date: saved?.date || d, answers, updatedAt: new Date().toISOString() }).catch(fail);
    toast("Gespeichert.");
  };
}
