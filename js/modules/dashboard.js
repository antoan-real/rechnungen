// Startseite: Kacheln aus allen Bereichen, Reihenfolge und Sichtbarkeit aus den Einstellungen.
import { esc } from "../core/ui.js";
import { longDate } from "../core/dates.js";
import { dashboardLayout } from "../core/settings.js";
import { moduleById } from "./registry.js";

function greetingWord(h = new Date().getHours()) {
  if (h < 5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

export const widgets = {
  greeting(el, ctx) {
    const draw = () => {
      const s = ctx.settings();
      const name = s.name || (ctx.user?.email || "").split("@")[0];
      el.innerHTML = `<div class="greet"><div><h1>${esc(greetingWord())}${name ? ", " + esc(name) : ""}</h1><p>${esc(longDate())}</p></div>
        <button type="button" class="btn small" id="dash-edit">Startseite anpassen</button></div>`;
      el.querySelector("#dash-edit").onclick = () => { sessionStorage.setItem("db-scroll", "dashboard"); ctx.navigate("einstellungen"); };
    };
    draw();
    const t = setInterval(draw, 5 * 60000);
    return () => clearInterval(t);
  }
};

export function mount(el, ctx) {
  let cleanups = [], drawn = "";
  el.innerHTML = `<div class="dash" id="dash"></div>`;
  const box = el.querySelector("#dash");

  async function draw() {
    const tiles = dashboardLayout(ctx.settings()).filter(w => w.visible);
    const sig = tiles.map(w => w.id).join(",") + "|" + (ctx.settings().name || "");
    if (sig === drawn) return;
    drawn = sig;
    cleanups.forEach(fn => fn && fn()); cleanups = [];
    box.innerHTML = tiles.map(w => `<section class="card tile ${w.span === 2 ? "span-2" : ""}" data-w="${w.id}" aria-label="${esc(w.title)}"></section>`).join("")
      || `<div class="card empty span-2">Alle Kacheln sind ausgeblendet. <a href="#einstellungen">In den Einstellungen</a> kannst du sie wieder einschalten.</div>`;
    for (const w of tiles) {
      const tileEl = box.querySelector(`[data-w="${w.id}"]`);
      try {
        const mod = w.module === "dashboard" ? { widgets } : await moduleById(w.module).load();
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
