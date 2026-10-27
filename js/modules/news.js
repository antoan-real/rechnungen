// News: Meldungen großer deutscher Medien (RSS), nach Thema gruppiert. Nur Überschrift, Anreißer und Link.
// Quelle der Daten: news.json, alle 30 Minuten von GitHub Actions erzeugt (siehe news-core.js).
import { icon } from "../core/icons.js";
import { $, $$, esc, openSheet, toast } from "../core/ui.js";
import { SOURCES, DEFAULT_SOURCES, NEWS_URL, sourceName, groupArticles } from "./news-core.js";

const CACHE = "db-news";
function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 1) return "gerade eben"; if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60); if (h < 24) return `vor ${h} Std.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}
const cached = () => { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch (e) { return null; } };

export function mount(el, ctx) {
  let data = cached(), view = sessionStorage.getItem("nw-view") || "topics", q = "", loading = false, error = "";
  el.innerHTML = `<div class="page-head"><div><h1>News</h1><p id="nw-stand"></p></div>
      <div class="row"><button type="button" class="btn" id="nw-src">Quellen</button><button type="button" class="btn" id="nw-reload" aria-label="Aktualisieren">${icon("refresh", { size: 16 })} Aktualisieren</button></div></div>
    <div class="card stack" style="margin-bottom:14px">
      <div class="row"><div class="seg" id="nw-view"><button type="button" data-v="topics">Themen</button><button type="button" data-v="all">Alle Meldungen</button></div>
        <input class="input" type="search" id="nw-q" placeholder="Suchen …" aria-label="News durchsuchen" style="flex:1 1 180px;width:auto"></div>
      <p class="note" id="nw-hint"></p>
    </div>
    <div id="nw-list" class="stack"></div>`;

  const chosen = () => { const s = ctx.settings().newsSources; return (s && s.length ? s : DEFAULT_SOURCES).filter(id => SOURCES.some(x => x.id === id)); };

  async function load(force) {
    if (loading) return; loading = true; error = ""; render();
    try {
      const bucket = force ? Date.now() : Math.floor(Date.now() / 300000);
      const res = await fetch(`${NEWS_URL}?t=${bucket}`, { cache: force ? "reload" : "default" });
      if (!res.ok) throw new Error(res.status === 404 ? "noch keine Daten" : "HTTP " + res.status);
      data = await res.json();
      try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch (e) {}
    } catch (e) { error = e.message; }
    loading = false; render();
  }

  function render() {
    $$("#nw-view button", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === view)));
    $("#nw-stand", el).textContent = data ? `Stand: ${ago(data.generatedAt)}${loading ? " · lädt …" : ""}` : loading ? "Lädt …" : "";
    const src = chosen();
    const down = (data?.sources || []).filter(s => !s.ok && src.includes(s.id)).map(s => sourceName(s.id));
    $("#nw-hint", el).textContent = [
      `${src.length} Quelle${src.length === 1 ? "" : "n"}: ${src.map(sourceName).join(", ")}.`,
      down.length ? `Gerade nicht erreichbar: ${down.join(", ")}.` : "",
      error && data ? `Aktualisieren fehlgeschlagen (${error}), es werden die zuletzt geladenen Meldungen gezeigt.` : ""
    ].filter(Boolean).join(" ");
    const list = $("#nw-list", el);
    if (!data) {
      list.innerHTML = `<div class="card empty">${loading ? "Lade Nachrichten …" : `Die Nachrichten konnten nicht geladen werden${error ? ` (${esc(error)})` : ""}. Sie werden alle 30 Minuten abgerufen – beim allerersten Mal kann es so lange dauern.`}</div>`;
      return;
    }
    const nq = q.trim().toLowerCase();
    const items = data.items.filter(i => src.includes(i.s) && (!nq || (i.t + " " + i.d).toLowerCase().includes(nq)));
    let topics = groupArticles(items);
    if (view === "topics") topics = topics.filter(t => t.sources.length >= 2);
    const order = id => src.indexOf(id);
    list.innerHTML = topics.slice(0, 80).map(t => {
      const arts = t.items.slice().sort((a, b) => order(a.s) - order(b.s) || b.p.localeCompare(a.p));
      const lead = arts[0], rest = arts.slice(1);
      return `<article class="card topic">
        <div class="row small muted" style="justify-content:space-between"><span>${t.sources.length > 1 ? `<b style="color:var(--accent)">${t.sources.length} Quellen</b> · ` : ""}${esc(ago(t.latest))}</span>
          <span class="row" style="gap:4px">${t.sources.map(s => `<span class="tag">${esc(sourceName(s))}</span>`).join("")}</span></div>
        <a class="t-head" href="${esc(lead.u)}" target="_blank" rel="noopener">${esc(lead.t)}</a>
        ${lead.d ? `<p class="t-teaser">${esc(lead.d)}</p>` : ""}
        <span class="small muted">${esc(sourceName(lead.s))} · ${esc(ago(lead.p))}</span>
        ${rest.length ? `<details><summary class="small">${rest.length} weitere${rest.length === 1 ? "r Bericht" : " Berichte"} zum Thema</summary><ul class="t-more">${rest.map(a => `<li>
            <span class="tag">${esc(sourceName(a.s))}</span> <a href="${esc(a.u)}" target="_blank" rel="noopener">${esc(a.t)}</a>
            ${a.d ? `<p class="t-teaser small">${esc(a.d)}</p>` : ""}<span class="small muted">${esc(ago(a.p))}</span></li>`).join("")}</ul></details>` : ""}
      </article>`;
    }).join("") || `<div class="card empty">${view === "topics" ? "Gerade gibt es kein Thema, über das mehrere deiner Quellen berichten. Schau unter „Alle Meldungen“." : "Keine Meldungen gefunden."}</div>`;
  }

  $("#nw-view", el).onclick = e => { const b = e.target.closest("[data-v]"); if (!b) return; view = b.dataset.v; sessionStorage.setItem("nw-view", view); render(); };
  let t = 0;
  $("#nw-q", el).addEventListener("input", e => { q = e.target.value; clearTimeout(t); t = setTimeout(render, 200); });
  $("#nw-reload", el).onclick = () => load(true);
  $("#nw-src", el).onclick = () => openSources(ctx, chosen());
  const stop = ctx.onSettings(render);
  render(); load(false);
  const timer = setInterval(() => { if (!document.hidden) load(false); }, 10 * 60000);
  return () => { stop(); clearInterval(timer); clearTimeout(t); };
}

function openSources(ctx, current) {
  openSheet((s, close) => {
    s.innerHTML = `<div class="sheet-head"><h3>Quellen</h3></div>
      <p class="note">Welche Medien in deinen News erscheinen. Themen werden aus den gewählten Quellen gebildet.</p>
      <ul class="sortlist">${SOURCES.map(x => `<li><span class="name">${esc(x.name)}</span><label class="switch"><input type="checkbox" value="${x.id}" ${current.includes(x.id) ? "checked" : ""} aria-label="${esc(x.name)}"><span></span></label></li>`).join("")}</ul>
      <div class="sheet-foot"><button type="button" class="btn" data-x>Abbrechen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
    $("[data-x]", s).onclick = close;
    $("[data-save]", s).onclick = async () => {
      const ids = $$("input:checked", s).map(i => i.value);
      if (!ids.length) { toast("Bitte mindestens eine Quelle wählen.", { error: true }); return; }
      await ctx.saveSettings({ newsSources: ids }); close();
    };
  }, { label: "Quellen", noFocus: true });
}
