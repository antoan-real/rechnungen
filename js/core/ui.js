// Kleine UI-Helfer, die alle Module teilen.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function toast(msg, opts = {}) {
  const root = $("#toast-root");
  const n = document.createElement("div");
  n.className = "toast" + (opts.error ? " err" : "");
  n.setAttribute("role", "status");
  const span = document.createElement("span"); span.textContent = msg; n.appendChild(span);
  if (opts.action) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = opts.action.label;
    b.onclick = () => { n.remove(); opts.action.run(); };
    n.appendChild(b);
  }
  root.appendChild(n);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => n.remove(), opts.duration ?? (opts.error ? 6000 : opts.action ? 8000 : 2800));
}

/** Dialog/Sheet öffnen. build(sheet, close) füllt den Inhalt; gibt close zurück. */
export function openSheet(build, opts = {}) {
  const root = $("#overlay-root");
  const ov = document.createElement("div");
  ov.className = "overlay";
  const sheet = document.createElement("div");
  sheet.className = "dlg"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  if (opts.label) sheet.setAttribute("aria-label", opts.label);
  ov.appendChild(sheet); root.appendChild(ov);
  const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === "Escape") close(); };
  function close() {
    document.removeEventListener("keydown", onKey);
    ov.remove();
    opts.onClose?.();
    if (prevFocus?.focus) prevFocus.focus();
  }
  ov.addEventListener("mousedown", e => { if (e.target === ov) close(); });
  document.addEventListener("keydown", onKey);
  build(sheet, close);
  const f = sheet.querySelector("[autofocus], input, select, textarea, button");
  if (f && !opts.noFocus) setTimeout(() => f.focus(), 30);
  return close;
}

export function confirmBox(msg, yesLabel, onYes, opts = {}) {
  openSheet((s, close) => {
    s.innerHTML = `<p style="margin:0;font-size:16px"></p><div class="sheet-foot"><button type="button" class="btn" data-no>Abbrechen</button><button type="button" class="btn ${opts.danger ? "danger" : "primary"}" data-yes></button></div>`;
    s.querySelector("p").textContent = msg;
    s.querySelector("[data-yes]").textContent = yesLabel;
    s.querySelector("[data-no]").onclick = close;
    s.querySelector("[data-yes]").onclick = () => { close(); onYes(); };
  }, { noFocus: true });
}

/** Datei an den Nutzer geben: am Handy über das Teilen-Menü (wenn möglich), sonst als Download. */
export async function deliverFile(filename, blob) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (coarse && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
    } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => { loaded.delete(src); rej(new Error("Bibliothek konnte nicht geladen werden (Internet?)")); };
    document.head.appendChild(s);
  }));
  return loaded.get(src);
}
