// Schlanke SVG-Diagramme (Linie, Säulen) mit Tooltip. Farben kommen aus --s1 … --s8 in app.css.
const NS = "http://www.w3.org/2000/svg";
const escH = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n, d = 1) => Number(n).toLocaleString("de-DE", { maximumFractionDigits: d });
const compact = n => Math.abs(n) >= 10000 ? fmt(n / 1000, 0) + " T" : Math.abs(n) >= 1000 ? fmt(n / 1000, 1) + " T" : fmt(n);
export const seriesColor = i => `var(--s${(i % 8) + 1})`;

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}
const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.appendChild(n); return n; };
const dayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const shortD = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

function frame(box, height) {
  box.innerHTML = "";
  box.classList.add("chart");
  const w = Math.max(260, box.clientWidth || 320);
  const svg = el("svg", { width: w, height, viewBox: `0 0 ${w} ${height}`, role: "img" }, box);
  const tip = document.createElement("div"); tip.className = "chart-tip"; tip.hidden = true; box.appendChild(tip);
  return { svg, tip, w };
}
function placeTip(box, tip, x, y) {
  tip.hidden = false;
  const bw = box.clientWidth, tw = tip.offsetWidth;
  tip.style.left = Math.min(Math.max(0, x - tw / 2), bw - tw) + "px";
  tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + "px";
}

/** Liniendiagramm. series: [{ name, color, points: [{ date: "YYYY-MM-DD", y }] }] */
export function lineChart(box, { series, unit = "", height = 240, label = "" }) {
  const draw = () => {
    const pts = series.flatMap(s => s.points);
    const { svg, tip, w } = frame(box, height);
    svg.setAttribute("aria-label", label);
    if (!pts.length) { box.insertAdjacentHTML("afterbegin", `<p class="muted chart-empty">Noch keine Daten.</p>`); return; }
    const m = { l: 44, r: 14, t: 12, b: 26 };
    let x0 = Math.min(...pts.map(p => dayNum(p.date))), x1 = Math.max(...pts.map(p => dayNum(p.date)));
    if (x0 === x1) { x0 -= 3; x1 += 3; }
    const ys = pts.map(p => p.y), pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 2;
    const ticks = niceTicks(Math.max(0, Math.min(...ys) - pad), Math.max(...ys) + pad);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = d => m.l + (dayNum(d) - x0) / (x1 - x0) * (w - m.l - m.r);
    const Y = v => height - m.b - (v - y0) / (y1 - y0) * (height - m.t - m.b);
    const g = el("g", { class: "axis" }, svg);
    ticks.forEach(t => {
      el("line", { x1: m.l, x2: w - m.r, y1: Y(t), y2: Y(t), class: "grid" }, g);
      el("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, g).textContent = compact(t);
    });
    const dates = [...new Set(pts.map(p => p.date))].sort();
    const nX = Math.max(2, Math.floor((w - m.l - m.r) / 70));
    const step = Math.max(1, Math.ceil(dates.length / nX));
    dates.filter((_, i) => i % step === 0).forEach(d => { el("text", { x: X(d), y: height - 8, "text-anchor": "middle" }, g).textContent = shortD(d); });
    if (unit) el("text", { x: 4, y: 10 }, g).textContent = unit;
    series.forEach(s => {
      const p = s.points.slice().sort((a, b) => a.date.localeCompare(b.date));
      if (!p.length) return;
      el("path", { d: p.map((q, i) => `${i ? "L" : "M"}${X(q.date).toFixed(1)},${Y(q.y).toFixed(1)}`).join(""), class: "line", style: `stroke:${s.color}` }, svg);
      const dots = p.length <= 24 ? p : [p[p.length - 1]];
      dots.forEach(q => el("circle", { cx: X(q.date), cy: Y(q.y), r: 4, class: "dot", style: `fill:${s.color}` }, svg));
    });
    // Fadenkreuz + Tooltip
    const cross = el("line", { y1: m.t, y2: height - m.b, class: "cross", visibility: "hidden" }, svg);
    const hit = el("rect", { x: m.l, y: 0, width: w - m.l - m.r, height, fill: "transparent" }, svg);
    const move = e => {
      const r = svg.getBoundingClientRect(), z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1, px = (e.clientX - r.left) / z;
      const d = dates.reduce((a, b) => Math.abs(X(b) - px) < Math.abs(X(a) - px) ? b : a);
      cross.setAttribute("x1", X(d)); cross.setAttribute("x2", X(d)); cross.setAttribute("visibility", "visible");
      const rows = series.map(s => { const q = s.points.find(p => p.date === d); return q ? `<div><i style="background:${s.color}"></i>${escH(s.name)}<b>${fmt(q.y)}${unit ? " " + unit : ""}</b></div>` : ""; }).join("");
      tip.innerHTML = `<div class="t-head">${shortD(d)}${d.slice(0, 4)}</div>${rows}`;
      const top = Math.min(...series.map(s => s.points.find(p => p.date === d)).filter(Boolean).map(q => Y(q.y)));
      placeTip(box, tip, X(d), top);
    };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
    if (series.length >= 2) {
      const lg = document.createElement("div"); lg.className = "chart-legend";
      lg.innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${escH(s.name)}</span>`).join("");
      box.appendChild(lg);
    }
  };
  draw();
  const ro = new ResizeObserver(() => { if (Math.abs((box.clientWidth || 0) - (box.querySelector("svg")?.width.baseVal.value || 0)) > 4) draw(); });
  ro.observe(box);
  return () => ro.disconnect();
}

/** Säulendiagramm mit einer Reihe. bars: [{ label, value, tip }]. Ohne color: graue Säulen, die letzte (aktuelle) im Akzent. */
export function columnChart(box, { bars, unit = "", height = 200, color = "", label = "" }) {
  const draw = () => {
    const { svg, tip, w } = frame(box, height);
    svg.setAttribute("aria-label", label);
    const m = { l: 44, r: 8, t: 18, b: 26 };
    const max = Math.max(0, ...bars.map(b => b.value));
    const ticks = niceTicks(0, max || 1, 3), top = ticks[ticks.length - 1];
    const Y = v => height - m.b - v / top * (height - m.t - m.b);
    const g = el("g", { class: "axis" }, svg);
    ticks.forEach(t => { el("line", { x1: m.l, x2: w - m.r, y1: Y(t), y2: Y(t), class: "grid" }, g); el("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end" }, g).textContent = compact(t); });
    const band = (w - m.l - m.r) / bars.length, bw = Math.min(24, band * 0.6);
    const every = Math.ceil(bars.length / Math.max(2, Math.floor((w - m.l - m.r) / 46)));
    bars.forEach((b, i) => {
      const cx = m.l + band * (i + 0.5), x = cx - bw / 2, y = Y(b.value), h = height - m.b - y;
      if (b.value > 0) {
        const r = Math.min(bw / 2, h / 2);
        el("rect", { x, y, width: bw, height: h, rx: r, ry: r, class: "bar" + (i === bars.length - 1 ? " on" : ""), ...(color ? { style: `fill:${color}` } : {}) }, svg);
      }
      if (i % every === 0 || i === bars.length - 1) el("text", { x: cx, y: height - 8, "text-anchor": "middle", class: "axis-t" }, svg).textContent = b.label;
      if (i === bars.length - 1 && b.value > 0) el("text", { x: cx, y: y - 5, "text-anchor": "middle", class: "val" }, svg).textContent = compact(b.value);
      const hit = el("rect", { x: cx - band / 2, y: m.t, width: band, height: height - m.t - m.b, fill: "transparent" }, svg);
      const show = () => { tip.innerHTML = `<div class="t-head">${escH(b.tip || b.label)}</div><div><b>${fmt(b.value, 0)}${unit ? " " + unit : ""}</b></div>`; placeTip(box, tip, cx, y); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => { tip.hidden = true; });
    });
  };
  draw();
  const ro = new ResizeObserver(() => { if (Math.abs((box.clientWidth || 0) - (box.querySelector("svg")?.width.baseVal.value || 0)) > 4) draw(); });
  ro.observe(box);
  return () => ro.disconnect();
}
