// Startseite: Kacheln aus allen Bereichen, Reihenfolge und Sichtbarkeit aus den Einstellungen.
// Die wichtigste Kachel (Gewohnheiten) ist als Hervorhebung gestaltet, kleine Kacheln stehen am Handy nebeneinander.
import { esc } from "../core/ui.js";
import { dashboardLayout } from "../core/settings.js";
import { moduleById } from "./registry.js";

export function mount(el, ctx) {
  let cleanups = [], drawn = "";
  el.innerHTML = `<h1 class="sr-only">Start</h1><div class="dash" id="dash"></div>`;
  const box = el.querySelector("#dash");

  async function draw() {
    const tiles = dashboardLayout(ctx.settings()).filter(w => w.visible);
    const sig = tiles.map(w => w.id).join(",");
    if (sig === drawn) return;
    drawn = sig;
    cleanups.forEach(fn => fn && fn()); cleanups = [];
    box.innerHTML = (tiles.map(w => `<section class="card tile ${w.size === "small" ? "w-small" : ""}" data-w="${w.id}" aria-label="${esc(w.title)}"></section>`).join("")
      || `<div class="card empty">Alle Kacheln sind ausgeblendet. <a href="#einstellungen">In den Einstellungen</a> kannst du sie wieder einschalten.</div>`)
      + `<div class="dash-foot"><button type="button" class="btn small ghost" id="dash-edit">Startseite anpassen</button></div>`;
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
  return () => { stop(); cleanups.forEach(fn => fn && fn()); };
}
