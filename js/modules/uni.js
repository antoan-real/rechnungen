// Uni-Modulübersicht: Raster nach Quartalsblöcken (3 Module je Block), Prüfungsformen mit Farben,
// bestanden/Note/Notiz pro Modul, Fortschritt, Notenschnitt und „Meine nächsten Prüfungen“ (sortierbar).
// Datenmodell: ein Dokument users/{uid}/uni/plan
//   { start: "2024-10", modules: [{ id, block, slot, name, examType, passed, grade, note }],
//     examTypes: [{ id, name, color }], upcoming: [{ moduleId, date }] }
import { icon } from "../core/icons.js";
import { $, $$, esc, openSheet, toast } from "../core/ui.js";
import { watchDoc, put, newId } from "../core/data.js";
import { today, daysBetween, shortDate } from "../core/dates.js";

const PLAN = [
  ["BWL", "Statistik", "Projektmanagement"],
  ["Managerial Economics", "Einführung in das wissenschaftliche Arbeiten für Wirtschaft, Management und Kommunikation", "Projekt: Agiles Projektmanagement"],
  ["Wirtschaftsmathematik", "Leadership 4.0", "Gesprächsführung und Verhandlungstechniken"],
  ["Buchführung und Bilanzierung", "Grundlagen der Immobilienwirtschaft", "Projekt: New Work"],
  ["Management von Wohn- und Gewerbeimmobilien", "Bautechnische Grundlagen", "Onlinemarketing"],
  ["Immobilieneigentum", "Kosten- und Leistungsrechnung", "Projekt: Megatrends in der Immobilienwirtschaft"],
  ["Privates und öffentliches Baurecht", "Immobilienprojektentwicklung", "Interaktion und Kommunikation in Organisationen"],
  ["Vermietung und Mietrecht", "Seminar Internationales Immobilienmanagement", "Projekt: Immobilienmarketing"],
  ["Wahlpflichtbereich A", "Wahlpflichtbereich A", "Digital Skills"],
  ["Wahlpflichtbereich B", "Wahlpflichtbereich B", "Projekt: Nachhaltigkeit in der Immobilienwirtschaft"],
  ["Wahlpflichtbereich C", "Wahlpflichtbereich C", "Konfliktmanagement und Mediation"],
  ["Bachelorarbeit", "Bachelorarbeit", "Projekt: Digitale Strategien in der Immobilienwirtschaft"]
];
const DEFAULT_TYPES = [
  ["Klausur", "#2a78d6"], ["Hausarbeit", "#eb6834"], ["Präsentation", "#6250d6"],
  ["Projektbericht", "#1baf7a"], ["Fallstudie", "#e87ba4"], ["Mündliche Prüfung", "#eda100"]
];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function seedPlan() {
  return {
    start: "2024-10",
    modules: PLAN.flatMap((row, b) => row.map((name, slot) => ({ id: `m${b}-${slot}`, block: b, slot, name, examType: null, passed: false, grade: null, note: "" }))),
    examTypes: DEFAULT_TYPES.map(([name, color], i) => ({ id: "t" + i, name, color })),
    upcoming: []
  };
}
function blockRange(plan, b) {
  const [y, m] = (plan.start || "2024-10").split("-").map(Number);
  const s = new Date(y, m - 1 + b * 3, 1), e = new Date(y, m - 1 + b * 3 + 2, 1);
  return { label: `${MONTHS[s.getMonth()]}–${MONTHS[e.getMonth()]} ${e.getFullYear()}`, from: s, to: new Date(e.getFullYear(), e.getMonth() + 1, 0) };
}
const parseGrade = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null; };
const fmtGrade = n => n == null ? "" : n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const typeOf = (plan, id) => plan.examTypes.find(t => t.id === id) || null;

function stats(plan) {
  const passed = plan.modules.filter(m => m.passed);
  const grades = passed.map(m => m.grade).filter(g => g != null);
  return { total: plan.modules.length, passed: passed.length, avg: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null, gradeN: grades.length };
}

/** Plan beobachten; legt beim ersten Mal den Studienplan an (erst wenn der Server bestätigt, dass nichts existiert). */
function watchPlan(cb) {
  let seeded = false;
  return watchDoc("uni", "plan", (data, meta) => {
    if (data) {
      // Design-System: Hausarbeit ist orange. Nur umstellen, wenn die alten Standardfarben noch unverändert sind.
      const h = data.examTypes?.find(t => t.id === "t1"), p = data.examTypes?.find(t => t.id === "t2");
      if (!meta.fromCache && !data.colorsV2 && h?.name === "Hausarbeit" && h.color === "#6250d6" && p?.color === "#eb6834") {
        put("uni", "plan", { ...data, colorsV2: true, examTypes: data.examTypes.map(t => t.id === "t1" ? { ...t, color: "#eb6834" } : t.id === "t2" ? { ...t, color: "#6250d6" } : t) }).catch(() => {});
      }
      cb(data); return;
    }
    if (meta.fromCache || seeded) return;
    seeded = true;
    const p = seedPlan(); cb(p);
    put("uni", "plan", p).catch(e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }));
  }, { includeMeta: true });
}

export function mount(el, ctx) {
  let plan = null;
  el.innerHTML = `<div class="page-head"><div><h1>Uni</h1><p>Studienplan ab Oktober 2024</p></div>
      <button type="button" class="btn" id="un-types">Prüfungsformen</button></div>
    <div class="stack" id="un-body"><div class="empty">Lade …</div></div>`;
  const save = next => { plan = next; render(); return put("uni", "plan", next).catch(e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true })); };
  let dragging = false, pendingPlan = null;
  const stop = watchPlan(p => { if (dragging) { pendingPlan = p; return; } plan = p; render(); });

  function render() {
    if (!plan) return;
    const body = $("#un-body", el), st = stats(plan), now = new Date();
    const blocks = [...new Set(plan.modules.map(m => m.block))].sort((a, b) => a - b);
    body.innerHTML = `
      <section class="card stack uni-progress">
        <div class="row" style="justify-content:space-between"><b style="font-size:17px">${st.passed} von ${st.total} Modulen bestanden</b>
          <span class="muted">${st.avg == null ? "Noch keine Noten" : `Notenschnitt <b class="num" style="color:var(--ink)">${fmtGrade(Math.round(st.avg * 100) / 100)}</b> · aus ${st.gradeN} Note${st.gradeN === 1 ? "" : "n"}, ungewichtet`}</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${st.total}" aria-valuenow="${st.passed}"><i style="width:${st.total ? st.passed / st.total * 100 : 0}%"></i></div>
        <div class="legend">${plan.examTypes.map(t => `<span><i style="background:${esc(t.color)}"></i>${esc(t.name)}</span>`).join("")}<span><i style="background:var(--line)"></i>noch offen</span><span><i style="background:var(--ok)"></i>bestanden</span></div>
      </section>
      <section class="card"><div class="uni-grid" id="un-grid">${blocks.map(b => {
        const r = blockRange(plan, b), isNow = now >= r.from && now <= r.to;
        const mods = plan.modules.filter(m => m.block === b).sort((x, y) => x.slot - y.slot);
        return `<div class="blk ${isNow ? "now" : ""}">${esc(r.label)}${isNow ? "<small>aktuell</small>" : ""}</div>` + mods.map(m => {
          const t = typeOf(plan, m.examType);
          return `<div class="mod ${m.passed ? "passed" : ""}" data-id="${esc(m.id)}" role="button" tabindex="0" style="${t ? `--mod:${esc(t.color)}` : ""}" aria-label="${esc(m.name)}${m.passed ? ", bestanden" : ""}">
            <span class="m-name">${esc(m.name)}</span>
            <span class="m-foot"><span>${t ? esc(t.name) : ""}${m.grade != null ? ` <span class="m-grade">${fmtGrade(m.grade)}</span>` : ""}</span>
            <button type="button" class="m-check" data-check aria-pressed="${m.passed}" aria-label="${esc(m.name)} ${m.passed ? "nicht mehr als bestanden markieren" : "als bestanden abhaken"}"></button></span></div>`;
        }).join("");
      }).join("")}</div></section>
      <section class="card stack"><div><h2>Meine nächsten Prüfungen</h2><p class="note" style="margin-top:6px">Reihenfolge am Griff links ziehen. Die oberste Prüfung erscheint auf der Startseite.</p></div>
        <ul class="exams" id="un-exams">${plan.upcoming.map((u, i) => {
          const m = plan.modules.find(x => x.id === u.moduleId); if (!m) return "";
          const t = typeOf(plan, m.examType), days = u.date ? daysBetween(today(), u.date) : null;
          return `<li class="exam ${i === 0 ? "first" : ""}" data-id="${esc(m.id)}">
            <button type="button" class="handle" aria-label="${esc(m.name)} verschieben (Pfeiltasten)">${icon("grip")}</button>
            <div class="e-main"><b>${esc(m.name)}</b><small>${t ? `<i style="background:${esc(t.color)}"></i>${esc(t.name)}` : "Prüfungsform offen"}${days != null ? ` · ${days === 0 ? "heute" : days > 0 ? `in ${days} Tagen` : `vor ${-days} Tagen`}` : ""}</small></div>
            <input type="date" class="input" value="${esc(u.date || "")}" aria-label="Geplantes Datum für ${esc(m.name)}">
            <button type="button" class="btn icon small ghost" data-rm aria-label="${esc(m.name)} aus der Liste nehmen">${icon("x")}</button></li>`;
        }).join("")}</ul>
        ${plan.upcoming.length ? "" : `<p class="muted" style="margin:0">Noch keine Prüfungen geplant.</p>`}
        <div class="row" style="flex-wrap:nowrap"><select class="input" id="un-add" aria-label="Offenes Modul wählen"><option value="">Offenes Modul hinzufügen …</option>${plan.modules.filter(m => !m.passed && !plan.upcoming.some(u => u.moduleId === m.id)).map(m => `<option value="${esc(m.id)}">${esc(blockRange(plan, m.block).label)} · ${esc(m.name)}</option>`).join("")}</select>
          <button type="button" class="btn" id="un-add-btn">Hinzufügen</button></div>
      </section>`;
    bind(body);
  }

  function bind(body) {
    $("#un-grid", body).addEventListener("click", e => {
      const card = e.target.closest(".mod"); if (!card) return;
      const m = plan.modules.find(x => x.id === card.dataset.id);
      if (e.target.closest("[data-check]")) togglePassed(m); else editModule(m);
    });
    $("#un-grid", body).addEventListener("keydown", e => {
      const card = e.target.closest(".mod"); if (!card || e.target !== card || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault(); editModule(plan.modules.find(x => x.id === card.dataset.id));
    });
    $("#un-add-btn", body).onclick = () => {
      const id = $("#un-add", body).value; if (!id) return;
      save({ ...plan, upcoming: [...plan.upcoming, { moduleId: id, date: "" }] });
    };
    const list = $("#un-exams", body);
    list.addEventListener("change", e => {
      if (e.target.type !== "date") return;
      const id = e.target.closest(".exam").dataset.id;
      save({ ...plan, upcoming: plan.upcoming.map(u => u.moduleId === id ? { ...u, date: e.target.value } : u) });
    });
    list.addEventListener("click", e => {
      if (!e.target.closest("[data-rm]")) return;
      const id = e.target.closest(".exam").dataset.id;
      save({ ...plan, upcoming: plan.upcoming.filter(u => u.moduleId !== id) });
    });
    list.addEventListener("keydown", e => {
      if (!e.target.classList.contains("handle") || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const id = e.target.closest(".exam").dataset.id, i = plan.upcoming.findIndex(u => u.moduleId === id), j = i + (e.key === "ArrowUp" ? -1 : 1);
      if (j < 0 || j >= plan.upcoming.length) return;
      const up = plan.upcoming.slice(); [up[i], up[j]] = [up[j], up[i]];
      save({ ...plan, upcoming: up }).then(() => $(`#un-exams [data-id="${CSS.escape(id)}"] .handle`, el)?.focus());
    });
    // Ziehen mit Finger oder Maus
    list.addEventListener("pointerdown", e => {
      const handle = e.target.closest(".handle"); if (!handle) return;
      e.preventDefault();
      const item = handle.closest(".exam"), items = [...list.children];
      const startY = e.clientY, h = item.getBoundingClientRect().height + 8;
      let from = items.indexOf(item), to = from;
      dragging = true; item.classList.add("dragging"); handle.setPointerCapture(e.pointerId);
      const move = ev => {
        const dy = ev.clientY - startY;
        item.style.transform = `translateY(${dy}px)`;
        to = Math.max(0, Math.min(items.length - 1, from + Math.round(dy / h)));
        items.forEach((n, k) => {
          if (n === item) return;
          const shift = from < to && k > from && k <= to ? -h : from > to && k < from && k >= to ? h : 0;
          n.style.transform = shift ? `translateY(${shift}px)` : "";
          n.style.transition = "transform .12s";
        });
      };
      const up = () => {
        handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
        items.forEach(n => { n.style.transform = ""; n.style.transition = ""; });
        item.classList.remove("dragging"); dragging = false;
        if (pendingPlan) { plan = pendingPlan; pendingPlan = null; }
        if (to !== from) {
          const upc = plan.upcoming.slice(); const [x] = upc.splice(from, 1); upc.splice(to, 0, x);
          save({ ...plan, upcoming: upc });
        } else render();
      };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
    });
  }

  function togglePassed(m) {
    const passed = !m.passed;
    const inList = plan.upcoming.some(u => u.moduleId === m.id);
    save({ ...plan, modules: plan.modules.map(x => x.id === m.id ? { ...x, passed } : x), upcoming: passed ? plan.upcoming.filter(u => u.moduleId !== m.id) : plan.upcoming });
    if (passed) toast(`„${m.name}“ bestanden.${inList ? " Aus deinen nächsten Prüfungen entfernt." : ""}`, { action: { label: "Note eintragen", run: () => editModule(plan.modules.find(x => x.id === m.id)) } });
  }

  function editModule(m) {
    openSheet((s, close) => {
      const inList = plan.upcoming.some(u => u.moduleId === m.id);
      s.innerHTML = `<div class="sheet-head"><h3>Modul bearbeiten</h3><span class="muted small">${esc(blockRange(plan, m.block).label)}</span></div>
        <label class="field"><span>Name</span><textarea class="input" id="md-name" rows="2">${esc(m.name)}</textarea></label>
        <label class="field"><span>Prüfungsform</span><select class="input" id="md-type"><option value="">– noch offen –</option>${plan.examTypes.map(t => `<option value="${esc(t.id)}" ${t.id === m.examType ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
        <div class="row" style="justify-content:space-between"><span>Bestanden</span><label class="switch"><input type="checkbox" id="md-passed" ${m.passed ? "checked" : ""} aria-label="Bestanden"><span></span></label></div>
        <label class="field" style="max-width:140px"><span>Note (optional)</span><input class="input num" type="text" inputmode="decimal" id="md-grade" placeholder="z. B. 1,7" value="${esc(fmtGrade(m.grade))}"></label>
        <label class="field"><span>Notiz (optional)</span><textarea class="input" id="md-note" rows="3">${esc(m.note || "")}</textarea></label>
        ${m.passed ? "" : `<button type="button" class="btn" id="md-plan" ${inList ? "disabled" : ""}>${inList ? "Steht in deinen nächsten Prüfungen" : "Zu meinen nächsten Prüfungen"}</button>`}
        <p class="err" id="md-err" hidden></p>
        <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
      $("[data-x]", s).onclick = close;
      const plan_ = $("#md-plan", s);
      if (plan_) plan_.onclick = () => { save({ ...plan, upcoming: [...plan.upcoming, { moduleId: m.id, date: "" }] }); plan_.disabled = true; plan_.textContent = "Steht in deinen nächsten Prüfungen"; };
      $("[data-save]", s).onclick = () => {
        const name = $("#md-name", s).value.trim().replace(/\s+/g, " ");
        const gRaw = $("#md-grade", s).value.trim(), grade = parseGrade(gRaw);
        const err = t => { $("#md-err", s).textContent = t; $("#md-err", s).hidden = !t; };
        if (!name) { err("Bitte einen Namen eingeben."); return; }
        if (gRaw && (grade == null || grade > 6)) { err("Die Note sieht nicht gültig aus (z. B. 1,7)."); return; }
        const passed = $("#md-passed", s).checked;
        save({ ...plan,
          modules: plan.modules.map(x => x.id === m.id ? { ...x, name, examType: $("#md-type", s).value || null, passed, grade, note: $("#md-note", s).value.trim() } : x),
          upcoming: passed ? plan.upcoming.filter(u => u.moduleId !== m.id) : plan.upcoming });
        close();
      };
    }, { label: "Modul bearbeiten" });
  }

  function editTypes() {
    let types = plan.examTypes.map(t => ({ ...t }));
    openSheet((s, close) => {
      const draw = () => {
        s.innerHTML = `<div class="sheet-head"><h3>Prüfungsformen</h3></div>
          <p class="note">Name und Farbe ändern. Wird eine Prüfungsform gelöscht, sind die betroffenen Module danach „noch offen“.</p>
          <div class="stack" id="ty-list">${types.map((t, i) => `<div class="type-row" data-i="${i}"><input type="color" value="${esc(t.color)}" aria-label="Farbe für ${esc(t.name)}"><input class="input" type="text" value="${esc(t.name)}" aria-label="Name der Prüfungsform"><button type="button" class="btn icon small danger" data-del aria-label="${esc(t.name)} löschen">${icon("x")}</button></div>`).join("")}</div>
          <button type="button" class="btn" id="ty-add">+ Prüfungsform</button>
          <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
        $("[data-x]", s).onclick = close;
        $("#ty-add", s).onclick = () => { read(); types.push({ id: newId("t"), name: "Neue Prüfungsform", color: "#6b7a8c" }); draw(); };
        $("#ty-list", s).onclick = e => { if (!e.target.closest("[data-del]")) return; read(); types.splice(+e.target.closest(".type-row").dataset.i, 1); draw(); };
        $("[data-save]", s).onclick = () => {
          read();
          const keep = types.filter(t => t.name.trim());
          const ids = new Set(keep.map(t => t.id));
          save({ ...plan, examTypes: keep, modules: plan.modules.map(m => ids.has(m.examType) ? m : { ...m, examType: null }) });
          close();
        };
      };
      const read = () => $$("#ty-list .type-row", s).forEach(r => { const t = types[+r.dataset.i]; t.color = r.querySelector("[type=color]").value; t.name = r.querySelector("[type=text]").value; });
      draw();
    }, { label: "Prüfungsformen", noFocus: true });
  }
  $("#un-types", el).onclick = () => plan && editTypes();
  return stop;
}

/* ---------- Kachel für die Startseite ---------- */
export const widgets = {
  "next-exam"(el) {
    el.innerHTML = `<div class="tile-head"><h2>Nächste Prüfung</h2></div><div class="empty">Lade …</div>`;
    return watchPlan(plan => {
      const u = plan.upcoming[0], m = u && plan.modules.find(x => x.id === u.moduleId);
      const st = stats(plan);
      if (!m) { el.innerHTML = `<div class="tile-head"><h2>Nächste Prüfung</h2></div><p class="t-title">Keine geplant</p><p class="t-sub"><a href="#uni">Jetzt planen</a> · ${st.passed}/${st.total} bestanden</p>`; return; }
      const t = typeOf(plan, m.examType), days = u.date ? daysBetween(today(), u.date) : null;
      el.innerHTML = `<div class="tile-head"><h2>Nächste Prüfung</h2></div>
        <a href="#uni" style="color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:6px">
        <p class="t-title" style="overflow-wrap:anywhere">${esc(m.name)}</p>
        ${t ? `<span class="small" style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:color-mix(in srgb, ${esc(t.color)} 78%, var(--ink))"><i style="width:9px;height:9px;border-radius:50%;background:${esc(t.color)};flex:none"></i>${esc(t.name)}</span>` : ""}
        <p class="t-sub">${u.date ? `${days === 0 ? "heute" : days > 0 ? `in ${days} Tagen` : `vor ${-days} Tagen`} · ${shortDate(u.date)}` : "Datum noch offen"}</p></a>`;
    });
  }
};
