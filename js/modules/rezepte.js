// Rezepte: Sammlung mit Nährwerten und Kosten aus der Zutaten-Datenbank, Alternativen je Zutat,
// Filter/Sortierung (v. a. Eiweiß pro € und pro 100 g) und Schnellerfassung per Textzeilen.
import { $, $$, esc, openSheet, toast } from "../core/ui.js";
import { watchCollection, watchDoc, put, merge, remove, newId } from "../core/data.js";
import { effectiveIngredients, effectiveRecipes, resolveLine, analyze, norm, proteinPerEuroIng } from "./rezepte-core.js";

const fmt = (n, d = 0) => Number(n || 0).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const euro = n => Number(n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const DIET = { vegan: "vegan", vegetarisch: "vegetarisch", fisch: "Fisch", fleisch: "Fleisch" };
const SORTS = {
  ppe: { label: "Eiweiß pro €", key: a => a.proteinPerEuro, desc: true, show: a => [fmt(a.proteinPerEuro, 1) + " g", "Eiweiß pro €"] },
  p100: { label: "Eiweiß pro 100 g", key: a => a.proteinPer100g, desc: true, show: a => [fmt(a.proteinPer100g, 1) + " g", "Eiweiß pro 100 g"] },
  pp: { label: "Eiweiß pro Portion", key: a => a.per.protein, desc: true, show: a => [fmt(a.per.protein) + " g", "Eiweiß pro Portion"] },
  cost: { label: "Günstigste zuerst", key: a => a.per.cost, desc: false, show: a => [euro(a.per.cost), "pro Portion"] },
  kcal: { label: "Wenigste Kalorien", key: a => a.per.kcal, desc: false, show: a => [fmt(a.per.kcal) + " kcal", "pro Portion"] },
  time: { label: "Schnellste zuerst", key: (a, r) => r.minutes || 999, desc: false, show: (a, r) => [(r.minutes || "–") + " Min.", "Zubereitung"] },
  name: { label: "Name", key: null, desc: false, show: a => [fmt(a.per.protein) + " g", "Eiweiß pro Portion"] }
};
const FILTERS = [
  ["veg", "Vegetarisch", (a) => a.diet === "vegetarisch" || a.diet === "vegan"],
  ["vegan", "Vegan", a => a.diet === "vegan"],
  ["p30", "≥ 30 g Eiweiß", a => a.per.protein >= 30],
  ["c2", "≤ 2 € pro Portion", a => a.per.cost <= 2],
  ["t20", "≤ 20 Min.", (a, r) => (r.minutes || 999) <= 20]
];

function subscribe(onChange) {
  const st = { prefs: null, userRecipes: null };
  const a = watchDoc("food", "prefs", d => { st.prefs = d || {}; onChange(st); });
  const b = watchCollection("recipes", l => { st.userRecipes = l; onChange(st); });
  return { st, stop: () => { a(); b(); } };
}
const isReady = st => st.prefs !== null && st.userRecipes !== null;
const ingsOf = st => effectiveIngredients(st.prefs);
const fail = e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true });

function saveRecipe(r) {
  const { id, builtin, lines, ...data } = r;
  return put("recipes", id, { ...data, updatedAt: new Date().toISOString() }).catch(fail);
}

export function mount(el, ctx) {
  let tab = sessionStorage.getItem("rz-tab") || "recipes";
  let ui; try { ui = JSON.parse(sessionStorage.getItem("rz-ui") || "null"); } catch (e) { ui = null; }
  ui = ui || { q: "", flags: [], sort: "ppe", iq: "" };
  const keep = () => sessionStorage.setItem("rz-ui", JSON.stringify(ui));
  el.innerHTML = `<div class="page-head"><div><h1>Rezepte</h1><p>Nährwerte und Kosten werden aus der Zutaten-Datenbank berechnet.</p></div>
      <button type="button" class="btn primary" id="rz-new">+ Rezept</button></div>
    <div class="seg" id="rz-tabs" style="margin-bottom:14px"><button type="button" data-t="recipes">Rezepte</button><button type="button" data-t="ings">Zutaten</button></div>
    <div id="rz-body"><div class="empty">Lade …</div></div>`;
  const sub = subscribe(() => render()), st = sub.st;

  function render() {
    if (!isReady(st)) return;
    const a = document.activeElement;
    if (a && a.matches("#rz-body input[data-price]")) return; // Preis wird gerade bearbeitet
    $$("#rz-tabs button", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === tab)));
    tab === "recipes" ? renderRecipes() : renderIngredients();
  }

  function renderRecipes() {
    const ings = ingsOf(st), sort = SORTS[ui.sort] || SORTS.ppe;
    let rows = effectiveRecipes(st.userRecipes, st.prefs).map(r => ({ r, a: analyze(r, ings) }));
    const q = norm(ui.q);
    if (q) rows = rows.filter(({ r }) => norm(r.name + " " + (r.tags || []).join(" ") + " " + (r.items || []).map(i => i.text).join(" ")).includes(q));
    for (const [id, , fn] of FILTERS) if (ui.flags.includes(id)) rows = rows.filter(({ r, a }) => fn(a, r));
    rows.sort(sort.key ? (x, y) => (sort.key(x.a, x.r) - sort.key(y.a, y.r)) * (sort.desc ? -1 : 1) : (x, y) => x.r.name.localeCompare(y.r.name, "de"));
    $("#rz-body", el).innerHTML = `<div class="stack">
      <div class="card stack">
        <div class="row"><input class="input" type="search" id="rz-q" placeholder="Rezept oder Zutat suchen …" value="${esc(ui.q)}" aria-label="Suchen" style="flex:1 1 220px;width:auto">
          <select class="input" id="rz-sort" style="flex:1 1 160px;width:auto;max-width:240px" aria-label="Sortierung">${Object.entries(SORTS).map(([k, s]) => `<option value="${k}" ${k === ui.sort ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></div>
        <div class="chips" id="rz-flags">${FILTERS.map(([id, label]) => `<button type="button" class="chip" data-f="${id}" aria-pressed="${ui.flags.includes(id)}">${esc(label)}</button>`).join("")}</div>
      </div>
      <div class="rgrid">${rows.map(({ r, a }) => { const [big, small] = sort.show(a, r); return `<button type="button" class="rcard card" data-id="${esc(r.id)}">
          <span class="r-top"><b>${esc(r.name)}</b><span class="tag diet-${a.diet}">${DIET[a.diet]}</span></span>
          <span class="r-key"><b class="num">${esc(big)}</b><span>${esc(small)}</span></span>
          <span class="r-meta">${fmt(a.per.protein)} g Eiweiß · ${fmt(a.per.kcal)} kcal · ${euro(a.per.cost)} pro Portion${r.minutes ? ` · ${r.minutes} Min.` : ""}${a.unknown ? ` · <span style="color:var(--warn)">${a.unknown} Zutat${a.unknown === 1 ? "" : "en"} ohne Werte</span>` : ""}</span>
        </button>`; }).join("") || `<div class="card empty" style="grid-column:1/-1">Keine Rezepte passen zu den Filtern.</div>`}</div></div>`;
    const body = $("#rz-body", el);
    $("#rz-q", body).addEventListener("input", e => { ui.q = e.target.value; keep(); const pos = e.target.selectionStart; renderRecipes(); const n = $("#rz-q", el); n.focus(); n.setSelectionRange(pos, pos); });
    $("#rz-sort", body).onchange = e => { ui.sort = e.target.value; keep(); renderRecipes(); };
    $("#rz-flags", body).onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return; const f = b.dataset.f; ui.flags = ui.flags.includes(f) ? ui.flags.filter(x => x !== f) : [...ui.flags, f]; keep(); renderRecipes(); };
    $(".rgrid", body).onclick = e => { const c = e.target.closest(".rcard"); if (c) openRecipe(st, c.dataset.id, ctx); };
  }

  function renderIngredients() {
    const q = norm(ui.iq);
    const list = ingsOf(st).filter(i => !q || norm(i.name + " " + (i.aliases || []).join(" ") + " " + (i.group || "")).includes(q));
    $("#rz-body", el).innerHTML = `<div class="stack"><div class="card stack">
        <div class="row" style="flex-wrap:nowrap"><input class="input" type="search" id="rz-iq" placeholder="Zutat suchen …" value="${esc(ui.iq)}" aria-label="Zutat suchen"><button type="button" class="btn" id="rz-inew">+ Zutat</button></div>
        <p class="note">Nährwerte pro 100 g, Preise in € pro kg. Die Startwerte sind Schätzungen – trag deine echten Preise ein, dann stimmen die Kosten der Rezepte.</p></div>
      <div class="card tbl-wrap"><table class="data ingtable"><thead><tr><th>Zutat</th><th>kcal</th><th>Eiweiß</th><th>€/kg</th><th>Eiweiß/€</th><th>Art</th></tr></thead>
      <tbody>${list.map(i => `<tr data-id="${esc(i.id)}"><td><button type="button" class="linkbtn" data-edit>${esc(i.name)}</button></td><td class="num">${fmt(i.kcal)}</td><td class="num">${fmt(i.protein, 1)} g</td>
        <td><input class="input num" type="text" inputmode="decimal" data-price value="${fmt(i.price, 2)}" aria-label="Preis pro kg für ${esc(i.name)}"></td>
        <td class="num">${fmt(proteinPerEuroIng(i), 1)} g</td><td>${esc(DIET[i.diet] || "")}</td></tr>`).join("")}</tbody></table></div></div>`;
    const body = $("#rz-body", el);
    $("#rz-iq", body).addEventListener("input", e => { ui.iq = e.target.value; keep(); const pos = e.target.selectionStart; renderIngredients(); const n = $("#rz-iq", el); n.focus(); n.setSelectionRange(pos, pos); });
    $("#rz-inew", body).onclick = () => openIngredient(st, null, {}, ctx);
    body.querySelector("tbody").addEventListener("click", e => { if (e.target.closest("[data-edit]")) openIngredient(st, e.target.closest("tr").dataset.id, {}, ctx); });
    body.querySelector("tbody").addEventListener("change", e => {
      if (!e.target.matches("[data-price]")) return;
      const id = e.target.closest("tr").dataset.id, price = parseFloat(e.target.value.replace(/\./g, "").replace(",", "."));
      if (!(price >= 0)) { toast("Bitte einen Preis wie 3,49 eingeben.", { error: true }); return; }
      const ing = ingsOf(st).find(i => i.id === id);
      const { builtin, ...rec } = ing;
      merge("food", "prefs", { ingredients: { [id]: { ...rec, price } } }).then(() => { e.target.blur(); render(); }).catch(fail);
    });
  }

  $("#rz-tabs", el).onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; sessionStorage.setItem("rz-tab", tab); render(); };
  $("#rz-new", el).onclick = () => isReady(st) && openForm(st, null, ctx);
  return sub.stop;
}

/* ---------- Rezept ansehen ---------- */
function openRecipe(st, id, ctx) {
  let servings = null;
  openSheet((s, close) => {
    const draw = () => {
      const ings = ingsOf(st), r = effectiveRecipes(st.userRecipes, st.prefs).find(x => x.id === id);
      if (!r) { close(); return; }
      servings = servings || r.servings || 1;
      const a = analyze(r, ings), f = servings / (r.servings || 1);
      s.innerHTML = `<div class="sheet-head"><h3>${esc(r.name)}</h3><span class="tag diet-${a.diet}">${DIET[a.diet]}</span></div>
        <div class="row small muted">${r.minutes ? `<span>${r.minutes} Min.</span>` : ""}${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <div class="tiles">
          <div class="stat"><span>Eiweiß pro Portion</span><b>${fmt(a.per.protein)} g</b><small>${fmt(a.per.kcal)} kcal · ${fmt(a.per.carbs)} g KH · ${fmt(a.per.fat)} g Fett</small></div>
          <div class="stat"><span>Kosten pro Portion</span><b>${euro(a.per.cost)}</b><small>${fmt(a.proteinPerEuro, 1)} g Eiweiß pro €</small></div>
          <div class="stat"><span>Eiweiß pro 100 g</span><b>${fmt(a.proteinPer100g, 1)} g</b><small>${fmt(a.total.grams)} g Zutaten gesamt</small></div>
        </div>
        ${a.unknown ? `<p class="err" style="background:var(--warn-soft);color:var(--ink)">${a.unknown} Zutat${a.unknown === 1 ? " ist" : "en sind"} nicht in der Datenbank – die Werte sind unvollständig. Unter „Bearbeiten“ kannst du sie zuordnen oder anlegen.</p>` : ""}
        <div class="row" style="justify-content:space-between"><h2>Zutaten</h2>
          <div class="row" style="flex-wrap:nowrap;gap:6px"><button type="button" class="btn icon small" data-sv="-1" aria-label="Weniger Portionen">−</button><span class="small">${servings} Portion${servings === 1 ? "" : "en"}</span><button type="button" class="btn icon small" data-sv="1" aria-label="Mehr Portionen">+</button></div></div>
        <ul class="sortlist ilist">${a.items.map((it, i) => `<li><button type="button" class="ibtn" data-i="${i}" ${it.ing ? "" : "disabled"}>
            <span class="name">${esc(it.ing ? it.ing.name : it.text)}<small>${esc(it.text)}${it.ing ? "" : " · nicht berechnet"}</small></span>
            <span class="num small">${it.grams ? fmt(it.grams * f) + " g" : ""}</span>${it.ing ? `<span class="muted small" aria-hidden="true">›</span>` : ""}</button></li>`).join("")}</ul>
        <p class="note">Tippe auf eine Zutat für Alternativen.</p>
        ${r.steps ? `<div><h2 style="margin-bottom:6px">Zubereitung</h2><ol class="steps">${r.steps.split("\n").filter(x => x.trim()).map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
        ${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}
        <div class="sheet-foot"><button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button><button type="button" class="btn" data-x>Schließen</button><button type="button" class="btn primary" data-edit>Bearbeiten</button></div>`;
      $$("[data-sv]", s).forEach(b => b.onclick = () => { servings = Math.max(1, servings + Number(b.dataset.sv)); draw(); });
      $(".ilist", s).onclick = e => { const b = e.target.closest(".ibtn"); if (b && !b.disabled) openAlternatives(st, r, a.items[+b.dataset.i], ctx, draw); };
      $("[data-x]", s).onclick = close;
      $("[data-edit]", s).onclick = () => { close(); openForm(st, r, ctx); };
      $("[data-del]", s).onclick = () => ctx.confirmBox(`Rezept „${r.name}“ löschen?`, "Löschen", async () => {
        close();
        if (!r.builtin) await remove("recipes", r.id).catch(fail);
        if (RECIPE_IDS().has(r.id)) await merge("food", "prefs", { hiddenRecipes: [...new Set([...(st.prefs.hiddenRecipes || []), r.id])] }).catch(fail);
        toast("Rezept gelöscht.");
      }, { danger: true });
    };
    draw();
  }, { label: "Rezept", noFocus: true });
}
const RECIPE_IDS = () => new Set(effectiveRecipes([], {}).map(r => r.id));

/* ---------- Alternativen ---------- */
function openAlternatives(st, recipe, item, ctx, redraw) {
  openSheet((s, close) => {
    const ings = ingsOf(st), cur = item.ing;
    let alts = (cur.alts || []).map(id => ings.find(i => i.id === id)).filter(Boolean);
    // ergänzende Vorschläge aus derselben Gruppe mit mehr Eiweiß pro €
    const extra = ings.filter(i => i.id !== cur.id && i.group === cur.group && !alts.includes(i) && proteinPerEuroIng(i) > proteinPerEuroIng(cur)).sort((x, y) => proteinPerEuroIng(y) - proteinPerEuroIng(x)).slice(0, 3);
    const line = i => `${fmt(i.protein, 1)} g Eiweiß/100 g · ${fmt(i.price, 2)} €/kg · ${fmt(proteinPerEuroIng(i), 1)} g Eiweiß/€`;
    const badges = i => {
      const b = [];
      if (i.price < cur.price) b.push("günstiger");
      if (i.protein > cur.protein) b.push("mehr Eiweiß");
      if (proteinPerEuroIng(i) > proteinPerEuroIng(cur)) b.push("mehr Eiweiß pro €");
      if ((i.diet === "vegan" || i.diet === "vegetarisch") && (cur.diet === "fleisch" || cur.diet === "fisch")) b.push(i.diet);
      else if (i.diet === "vegan" && cur.diet !== "vegan") b.push("vegan");
      return b.map(x => `<span class="tag good">${esc(x)}</span>`).join("");
    };
    const row = i => `<li><span class="name"><b style="font-weight:500">${esc(i.name)}</b> <span class="tag diet-${i.diet}">${DIET[i.diet]}</span><small>${line(i)}</small><span class="row" style="gap:4px;margin-top:4px">${badges(i)}</span></span>
      <button type="button" class="btn small" data-use="${esc(i.id)}">Ersetzen</button></li>`;
    s.innerHTML = `<div class="sheet-head"><h3>Alternativen zu ${esc(cur.name)}</h3></div>
      <p class="muted small" style="margin:0">Aktuell: ${line(cur)} · ${fmt(item.grams)} g im Rezept</p>
      ${alts.length ? `<ul class="sortlist">${alts.map(row).join("")}</ul>` : `<p class="muted">Für diese Zutat sind noch keine Alternativen hinterlegt.</p>`}
      ${extra.length ? `<h2>Weitere Ideen aus „${esc(cur.group || "")}“</h2><ul class="sortlist">${extra.map(row).join("")}</ul>` : ""}
      <div class="sheet-foot"><button type="button" class="btn" data-map style="margin-right:auto">Alternativen bearbeiten</button><button type="button" class="btn" data-x>Schließen</button></div>`;
    $("[data-x]", s).onclick = close;
    $("[data-map]", s).onclick = () => { close(); openIngredient(st, cur.id, {}, ctx); };
    s.addEventListener("click", async e => {
      const b = e.target.closest("[data-use]"); if (!b) return;
      const alt = ings.find(i => i.id === b.dataset.use);
      const items = recipe.items.map(it => (it === item || it.text === item.text) ? { text: `${fmt(item.grams)} g ${alt.name}`, ingId: alt.id, grams: item.grams } : { text: it.text, ingId: it.ingId || null, grams: it.grams ?? null });
      const fixed = analyze({ ...recipe, items }, ings).items.map(it => ({ text: it.text, ingId: it.ingId, grams: it.grams }));
      await saveRecipe({ ...recipe, items: fixed });
      close(); toast(`${cur.name} durch ${alt.name} ersetzt.`); setTimeout(redraw, 50);
    });
  }, { label: "Alternativen", noFocus: true });
}

/* ---------- Rezept anlegen / bearbeiten ---------- */
function openForm(st, recipe, ctx) {
  const isNew = !recipe;
  const chosen = {}; // Zeilentext → gewählte Zutat ("" = nicht berechnen)
  for (const it of recipe?.items || []) if (it.ingId) chosen[it.text] = it.ingId;
  openSheet((s, close) => {
    s.innerHTML = `<div class="sheet-head"><h3>${isNew ? "Neues Rezept" : "Rezept bearbeiten"}</h3></div>
      <label class="field"><span>Name</span><input class="input" type="text" id="rf-name" value="${esc(recipe?.name || "")}" placeholder="z. B. Hähnchen-Bowl"></label>
      <div class="row" style="flex-wrap:nowrap">
        <label class="field" style="flex:1"><span>Portionen</span><input class="input num" type="text" inputmode="numeric" id="rf-serv" value="${esc(recipe?.servings || 2)}"></label>
        <label class="field" style="flex:1"><span>Zeit (Min.)</span><input class="input num" type="text" inputmode="numeric" id="rf-min" value="${esc(recipe?.minutes || "")}"></label>
        <label class="field" style="flex:2"><span>Stichworte</span><input class="input" type="text" id="rf-tags" value="${esc((recipe?.tags || []).join(", "))}" placeholder="Frühstück, Meal Prep"></label></div>
      <label class="field"><span>Zutaten – eine pro Zeile, z. B. „200 g Hähnchenbrust“ oder „2 Eier“</span><textarea class="input" id="rf-lines" rows="6">${esc((recipe?.items || []).map(i => i.text).join("\n"))}</textarea></label>
      <div id="rf-preview" class="stack" style="gap:6px"></div>
      <label class="field"><span>Zubereitung (ein Schritt pro Zeile)</span><textarea class="input" id="rf-steps" rows="5">${esc(recipe?.steps || "")}</textarea></label>
      <p class="err" id="rf-err" hidden></p>
      <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
    const lines = () => $("#rf-lines", s).value.split("\n").map(l => l.trim()).filter(Boolean);
    const resolve = (l, ings) => (l in chosen) ? (chosen[l] ? resolveLine(l, ings, chosen[l]) : { ...resolveLine(l, []), ingId: null, ing: null, grams: 0 }) : resolveLine(l, ings);
    function preview() {
      const ings = ingsOf(st);
      const opts = sel => `<option value="">– nicht berechnen –</option>` + ings.map(i => `<option value="${esc(i.id)}" ${i.id === sel ? "selected" : ""}>${esc(i.name)}</option>`).join("");
      $("#rf-preview", s).innerHTML = lines().map((l, k) => {
        const r = resolve(l, ings), unknown = !r.ing && r.amount != null && !(l in chosen);
        return `<div class="pline ${r.ing ? "ok" : unknown ? "warn" : ""}" data-k="${k}"><span class="pl-text">${r.ing ? "✓" : unknown ? "?" : "–"} ${esc(l)}</span>
          <span class="row" style="flex-wrap:nowrap;gap:6px"><select class="input" data-line="${esc(l)}" aria-label="Zutat für ${esc(l)}">${opts(r.ingId)}</select>
          <span class="num small" style="min-width:56px;text-align:right">${r.ing ? fmt(r.grams) + " g" : ""}</span>
          ${unknown ? `<button type="button" class="btn small" data-new="${esc(r.name)}" data-line="${esc(l)}">Anlegen</button>` : ""}</span></div>`;
      }).join("") || `<p class="note">Die erkannten Zutaten erscheinen hier. Unbekannte kannst du direkt anlegen.</p>`;
    }
    let t = 0;
    $("#rf-lines", s).addEventListener("input", () => { clearTimeout(t); t = setTimeout(preview, 250); });
    $("#rf-preview", s).addEventListener("change", e => { if (e.target.matches("select[data-line]")) { chosen[e.target.dataset.line] = e.target.value; preview(); } });
    $("#rf-preview", s).addEventListener("click", e => {
      const b = e.target.closest("[data-new]"); if (!b) return;
      openIngredient(st, null, { name: b.dataset.new.replace(/^./, c => c.toUpperCase()), onSaved: id => { chosen[b.dataset.line] = id; setTimeout(preview, 300); } }, ctx);
    });
    $("[data-x]", s).onclick = close;
    $("[data-save]", s).onclick = async () => {
      const err = m => { $("#rf-err", s).textContent = m; $("#rf-err", s).hidden = !m; };
      const name = $("#rf-name", s).value.trim();
      if (!name) { err("Bitte einen Namen eingeben."); return; }
      if (!lines().length) { err("Bitte mindestens eine Zutat eingeben."); return; }
      const ings = ingsOf(st);
      const items = lines().map(l => { const r = resolve(l, ings); return { text: l, ingId: r.ingId || null, grams: r.ing ? r.grams : null }; });
      const data = {
        id: recipe?.id || newId("r"), name,
        servings: Math.max(1, parseInt($("#rf-serv", s).value, 10) || 1), minutes: parseInt($("#rf-min", s).value, 10) || null,
        tags: $("#rf-tags", s).value.split(",").map(x => x.trim()).filter(Boolean),
        items, steps: $("#rf-steps", s).value.trim(), note: recipe?.note || "", createdAt: recipe?.createdAt || new Date().toISOString()
      };
      await saveRecipe(data);
      close(); toast(isNew ? "Rezept gespeichert." : "Änderungen gespeichert.");
    };
    preview();
  }, { label: isNew ? "Neues Rezept" : "Rezept bearbeiten" });
}

/* ---------- Zutat anlegen / bearbeiten ---------- */
const UNIT_FIELDS = ["Stück", "EL", "TL", "Dose", "Becher", "Packung", "Scheibe"];
function openIngredient(st, id, opts, ctx) {
  const ings = ingsOf(st), cur = id ? ings.find(i => i.id === id) : null;
  const d = cur ? structuredClone(cur) : { name: opts.name || "", aliases: [], kcal: 0, protein: 0, carbs: 0, fat: 0, price: 0, diet: "vegan", units: {}, alts: [], group: "" };
  openSheet((s, close) => {
    const numIn = (k, label, step) => `<label class="field"><span>${label}</span><input class="input num" type="text" inputmode="decimal" data-n="${k}" value="${fmt(d[k], step)}"></label>`;
    const draw = () => {
      s.innerHTML = `<div class="sheet-head"><h3>${cur ? "Zutat bearbeiten" : "Neue Zutat"}</h3></div>
        <label class="field"><span>Name</span><input class="input" type="text" id="ig-name" value="${esc(d.name)}"></label>
        <label class="field"><span>Weitere Namen, unter denen sie erkannt wird (Komma-getrennt)</span><input class="input" type="text" id="ig-alias" value="${esc((d.aliases || []).join(", "))}"></label>
        <div class="row" style="flex-wrap:nowrap"><label class="field" style="flex:1"><span>Gruppe</span><input class="input" type="text" id="ig-group" list="ig-groups" value="${esc(d.group || "")}"></label>
          <label class="field" style="flex:1"><span>Art</span><select class="input" id="ig-diet">${Object.entries(DIET).map(([k, v]) => `<option value="${k}" ${k === d.diet ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
        <datalist id="ig-groups">${[...new Set(ings.map(i => i.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join("")}</datalist>
        <div><h2 style="margin-bottom:6px">Pro 100 g</h2><div class="nutri">${numIn("kcal", "kcal", 0)}${numIn("protein", "Eiweiß g", 1)}${numIn("carbs", "KH g", 1)}${numIn("fat", "Fett g", 1)}</div></div>
        <div class="nutri">${numIn("price", "Preis €/kg", 2)}</div>
        <div><h2 style="margin-bottom:6px">Gewicht einer Einheit (g)</h2><div class="nutri">${UNIT_FIELDS.map(u => `<label class="field"><span>${u}</span><input class="input num" type="text" inputmode="decimal" data-u="${u}" value="${d.units?.[u] != null ? fmt(d.units[u], 1) : ""}"></label>`).join("")}</div></div>
        <div class="stack" style="gap:8px"><h2>Alternativen</h2>
          <div class="chips" id="ig-alts">${(d.alts || []).map(a => ings.find(i => i.id === a)).filter(Boolean).map(i => `<button type="button" class="chip" data-rm="${esc(i.id)}" aria-label="${esc(i.name)} entfernen">${esc(i.name)} ×</button>`).join("") || `<span class="muted small">keine</span>`}</div>
          <div class="row" style="flex-wrap:nowrap"><select class="input" id="ig-addalt" aria-label="Alternative hinzufügen"><option value="">Alternative hinzufügen …</option>${ings.filter(i => i.id !== cur?.id && !(d.alts || []).includes(i.id)).map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("")}</select></div></div>
        <p class="err" id="ig-err" hidden></p>
        <div class="sheet-foot">${cur ? `<button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button>` : ""}<button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
      $("[data-x]", s).onclick = close;
      $("#ig-alts", s).onclick = e => { const b = e.target.closest("[data-rm]"); if (!b) return; read(); d.alts = d.alts.filter(x => x !== b.dataset.rm); draw(); };
      $("#ig-addalt", s).onchange = e => { if (!e.target.value) return; read(); d.alts = [...(d.alts || []), e.target.value]; draw(); };
      $("[data-save]", s).onclick = save;
      if (cur) $("[data-del]", s).onclick = () => ctx.confirmBox(`Zutat „${cur.name}“ löschen? Rezepte damit zeigen sie dann als „nicht berechnet“.`, "Löschen", () => {
        close();
        merge("food", "prefs", { deletedIngredients: [...new Set([...(st.prefs.deletedIngredients || []), cur.id])] }).then(() => toast("Zutat gelöscht.")).catch(fail);
      }, { danger: true });
    };
    const num = v => { const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };
    function read() {
      d.name = $("#ig-name", s).value.trim(); d.aliases = $("#ig-alias", s).value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
      d.group = $("#ig-group", s).value.trim(); d.diet = $("#ig-diet", s).value;
      $$("[data-n]", s).forEach(i => { d[i.dataset.n] = num(i.value) ?? 0; });
      d.units = {}; $$("[data-u]", s).forEach(i => { const v = num(i.value); if (v > 0) d.units[i.dataset.u] = v; });
    }
    async function save() {
      read();
      const err = m => { $("#ig-err", s).textContent = m; $("#ig-err", s).hidden = !m; };
      if (!d.name) { err("Bitte einen Namen eingeben."); return; }
      if (d.protein > 100 || d.carbs > 100 || d.fat > 100) { err("Werte pro 100 g können nicht über 100 g liegen."); return; }
      const iid = cur?.id || newId("ing");
      const { builtin, id: _, ...rec } = d;
      try {
        // units/aliases/alts komplett ersetzen statt zusammenführen
        await merge("food", "prefs", { ingredients: { [iid]: { ...rec, units: null, alts: null, aliases: null } } });
        await merge("food", "prefs", { ingredients: { [iid]: rec } });
        close(); toast("Zutat gespeichert."); opts.onSaved?.(iid);
      } catch (e) { fail(e); }
    }
    draw();
  }, { label: "Zutat", noFocus: true });
}
