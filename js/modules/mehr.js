// „Mehr“ (Handy): alle Bereiche, die nicht in der Tab-Leiste stehen, als gruppierte Liste; dazu Einstellungen und Abmelden.
import { esc } from "../core/ui.js";
import { icon, moduleIcon } from "../core/icons.js";
import { navLayout } from "../core/settings.js";
import { moduleById } from "./registry.js";

export function mount(el, ctx) {
  const draw = () => {
    const { more } = navLayout(ctx.settings());
    const row = (m, extra = "") => `<a class="cell has-ico" href="#${m.id}">${moduleIcon(m)}<span class="c-main">${esc(m.title)}</span>${extra}<span class="chev">${icon("chevron-right", { size: 18 })}</span></a>`;
    el.innerHTML = `<div class="page-head"><h1>Mehr</h1></div>
      ${more.length ? `<div class="list">${more.map(id => { const m = moduleById(id); return row(m, m.soon ? `<span class="c-val">bald</span>` : ""); }).join("")}</div>` : ""}
      <div class="sec-h" style="margin-top:28px"></div>
      <div class="list">${row(moduleById("einstellungen"))}
        <button type="button" class="cell danger" id="mh-out"><span class="c-main">Abmelden</span></button></div>
      <p class="sec-f">Welche vier Bereiche unten in der Leiste stehen, legst du in den Einstellungen fest.</p>`;
    el.querySelector("#mh-out").onclick = () => ctx.confirmBox("Wirklich abmelden?", "Abmelden", ctx.logout);
  };
  draw();
  return ctx.onSettings(draw);
}
