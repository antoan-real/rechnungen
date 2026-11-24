// „Heute“: Kacheln aus allen Bereichen als gruppierte Listen, Reihenfolge und Sichtbarkeit aus den Einstellungen.
// Jede Kachel bekommt eine Abschnittsüberschrift (head) mit „Alle ›“; Listenzeilen (kind "row") werden gruppiert.
import { esc } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { dashboardLayout } from "../core/settings.js";
import { moduleById } from "./registry.js";

const dateLine = () => new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });

export function mount(el, ctx) {
  let cleanups = [], drawn = "";
  el.innerHTML = `<div class="page-head"><div><span class="page-date" id="dash-date"></span><h1>Heute</h1></div></div><div class="dash" id="dash"></div>`;
  const box = el.querySelector("#dash");
  const setDate = () => { el.querySelector("#dash-date").textContent = dateLine(); };
  setDate();
  const timer = setInterval(setDate, 60000);

  async function draw() {
    const tiles = dashboardLayout(ctx.settings()).filter(w => w.visible);
    const sig = tiles.map(w => w.id).join(",");
    if (sig === drawn) return;
    drawn = sig;
    cleanups.forEach(fn => fn && fn()); cleanups = [];
    // aufeinanderfolgende Listenzeilen zu einer Gruppe zusammenfassen
    const groups = [];
    for (const w of tiles) {
      const last = groups[groups.length - 1];
      if (w.kind === "row" && last?.rows) last.rows.push(w); else groups.push(w.kind === "row" ? { rows: [w] } : w);
    }
    const link = w => w.link ? `<a href="#${w.link}">Alle</a>` : "";
    box.innerHTML = (groups.map(g => g.rows
      ? `<section class="dw"><h2 class="sec-h">Überblick</h2><div class="list">${g.rows.map(w => `<div class="tile-row" data-w="${w.id}" aria-label="${esc(w.title)}"></div>`).join("")}</div></section>`
      : `<section class="dw ${g.wide ? "wide" : ""}"><h2 class="sec-h"><span>${esc(g.head || g.title)}</span>${link(g)}</h2><div class="card tile" data-w="${g.id}" aria-label="${esc(g.title)}"></div></section>`).join("")
      || `<div class="card empty">Alle Kacheln sind ausgeblendet. <a href="#einstellungen">In den Einstellungen</a> kannst du sie wieder einschalten.</div>`)
      + `<div class="dash-foot"><button type="button" class="btn ghost" id="dash-edit">„Heute“ anpassen</button></div>`;
    box.querySelector("#dash-edit").onclick = () => { sessionStorage.setItem("db-scroll", "dashboard"); ctx.navigate("einstellungen"); };
    for (const w of tiles) {
      const tileEl = box.querySelector(`[data-w="${w.id}"]`);
      try {
        const mod = await moduleById(w.module).load();
        if (sig !== drawn) return;
        cleanups.push(mod.widgets[w.id](tileEl, ctx));
      } catch (e) {
        console.error(e);
        tileEl.innerHTML = `<p class="err">${esc(w.title)} konnte nicht geladen werden.</p>`;
      }
    }
  }
  draw();
  const stop = ctx.onSettings(draw);
  return () => { clearInterval(timer); stop(); cleanups.forEach(fn => fn && fn()); };
}

/** Listenzeile für „Überblick“: farbiges Symbol, Titel, Untertitel, Wert rechts, Pfeil */
export function rowHtml(m, { href, title, sub = "", value = "" }) {
  return `<a class="cell has-ico" href="#${href}"><span class="ico" style="background:var(--c-${m.color})">${icon(m.icon, { size: 18 })}</span>
    <span class="c-main"><span>${title}</span>${sub ? `<small>${sub}</small>` : ""}</span>${value ? `<span class="c-val">${value}</span>` : ""}<span class="chev">${icon("chevron-right", { size: 18 })}</span></a>`;
}
