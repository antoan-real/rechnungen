// PDF komprimieren: mehrere PDFs zusammenfügen (pdf-lib) und verkleinern (Ghostscript als WebAssembly, pdf-worker.js).
// Läuft vollständig im Browser: Dateien werden nicht hochgeladen und nirgends gespeichert. Beim Verlassen des Bereichs
// und nach dem Herunterladen wird alles verworfen.
import { $, $$, esc, toast, deliverFile, loadScript, uiZoom } from "../core/ui.js";
import { icon } from "../core/icons.js";

const LIBS = {
  pdflib: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"
};
const LEVELS = [
  { id: "none", label: "Nicht", dpi: 0, text: "Nur zusammenfügen, Qualität unverändert." },
  { id: "light", label: "Leicht", dpi: 150, text: "Gute Qualität, Bilder mit ca. 150 dpi." },
  { id: "strong", label: "Stark", dpi: 110, text: "Gut lesbar, Bilder mit ca. 110 dpi." },
  { id: "max", label: "Maximal", dpi: 72, text: "Kleinste Datei, Bilder mit ca. 72 dpi." }
];
const DEFAULT_NAME = "zusammengefuegt.pdf";
const fmtSize = n => n >= 1e6 ? (n / 1048576).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const fileName = v => { let s = String(v || "").trim().replace(/[\\/:*?"<>|]+/g, "-") || DEFAULT_NAME; if (!/\.pdf$/i.test(s)) s += ".pdf"; return s; };

let pdfjsPromise = null;
function pdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import(LIBS.pdfjs).then(m => { m.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker; return m; }).catch(e => { pdfjsPromise = null; throw e; });
  return pdfjsPromise;
}

export function mount(el) {
  let files = [], level = "strong", name = DEFAULT_NAME, busy = false, result = null, worker = null, seq = 0, alive = true;
  el.innerHTML = `
    <div class="page-head"><div><h1>PDF komprimieren</h1><p>Mehrere PDFs zu einer kleinen Datei zusammenfügen. Alles bleibt auf deinem Gerät.</p></div></div>
    <div class="pdf-grid">
      <div class="stack">
        <label class="card pdf-drop" id="pd-drop" tabindex="0" role="button" aria-label="PDFs auswählen">
          <input type="file" id="pd-input" accept="application/pdf,.pdf" multiple hidden>
          <span class="pdf-drop-ic">${icon("plus", { size: 26 })}</span>
          <b>PDFs auswählen</b><span class="muted small">oder hierher ziehen</span>
        </label>
        <section class="card stack" id="pd-list-card" hidden>
          <div class="tile-head"><h2 id="pd-count"></h2><button type="button" class="btn small ghost" id="pd-clear">Alle entfernen</button></div>
          <ul class="pdf-list" id="pd-list"></ul>
          <p class="note">Reihenfolge am Griff links ziehen.</p>
        </section>
      </div>
      <div class="stack">
        <section class="card stack">
          <label class="field"><span>Dateiname</span><input class="input" type="text" id="pd-name" value="${DEFAULT_NAME}" autocomplete="off" spellcheck="false"></label>
          <div class="field"><span>Komprimierung</span>
            <div class="seg" id="pd-level" role="group" aria-label="Komprimierung">${LEVELS.map(l => `<button type="button" data-l="${l.id}">${l.label}</button>`).join("")}</div>
            <p class="note" id="pd-level-text"></p></div>
          <button type="button" class="btn primary" id="pd-go" disabled></button>
          <div class="pdf-progress" id="pd-progress" hidden><div class="row" style="justify-content:space-between"><span id="pd-status"></span><span class="num muted" id="pd-pct"></span></div><div class="pdf-bar"><i id="pd-bar"></i></div></div>
        </section>
        <section class="card stack" id="pd-result" hidden></section>
        <p class="note">Die Dateien werden nicht hochgeladen und nicht gespeichert; nach dem Herunterladen und beim Verlassen dieses Bereichs wird alles verworfen.
          Komprimierung mit Ghostscript (<a href="vendor/ghostpdl-1.1.0/LICENSE" target="_blank" rel="noopener">AGPL-3.0</a>,
          <a href="https://github.com/okathira/ghostpdl-wasm" target="_blank" rel="noopener">Quellcode</a>), Zusammenfügen mit pdf-lib (MIT).</p>
      </div>
    </div>`;

  const list = $("#pd-list", el), input = $("#pd-input", el), drop = $("#pd-drop", el);

  /* ---------- Dateien hinzufügen ---------- */
  async function addFiles(fileList) {
    const pdfs = [...fileList].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    const skipped = fileList.length - pdfs.length;
    if (skipped) toast(`${skipped} Datei${skipped === 1 ? " ist" : "en sind"} keine PDF und wurde${skipped === 1 ? "" : "n"} übersprungen.`);
    if (!pdfs.length) return;
    clearResult();
    try { await loadScript(LIBS.pdflib); }
    catch (e) { toast("PDF-Bibliothek konnte nicht geladen werden. Bist du online?", { error: true }); return; }
    for (const f of pdfs) {
      const item = { id: ++seq, name: f.name, size: f.size, pages: null, bytes: null, error: "", thumb: null };
      files.push(item); renderList();
      try {
        item.bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await window.PDFLib.PDFDocument.load(item.bytes, { updateMetadata: false });
        item.pages = doc.getPageCount();
      } catch (e) {
        item.error = /encrypt/i.test(e?.message || "") ? "Passwortgeschützt – kann nicht verarbeitet werden. Bitte zuerst den Schutz entfernen."
          : "Beschädigt oder keine gültige PDF.";
        item.bytes = null;
      }
      if (!alive) return;
      renderList(); thumb(item);
    }
  }
  async function thumb(item) {
    if (!item.bytes) return;
    try {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: item.bytes.slice() }).promise;
      const page = await doc.getPage(1), vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 96 / vp0.width });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      doc.destroy();
      if (!alive || !files.includes(item)) return;
      item.thumb = c;
      const slot = $(`[data-id="${item.id}"] .pdf-thumb`, list);
      if (slot) { slot.innerHTML = ""; slot.appendChild(c); }
    } catch (e) { /* Vorschau ist optional */ }
  }
  drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  input.onchange = () => { addFiles(input.files); input.value = ""; };
  const prevent = e => { e.preventDefault(); e.stopPropagation(); };
  ["dragenter", "dragover"].forEach(t => el.addEventListener(t, e => { if (e.dataTransfer?.types?.includes("Files")) { prevent(e); drop.classList.add("over"); } }));
  el.addEventListener("dragleave", e => { if (!el.contains(e.relatedTarget)) drop.classList.remove("over"); });
  el.addEventListener("drop", e => { if (!e.dataTransfer?.files?.length) return; prevent(e); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });

  /* ---------- Liste ---------- */
  function renderList() {
    $("#pd-list-card", el).hidden = !files.length;
    const ok = files.filter(f => f.bytes);
    const pages = ok.reduce((a, f) => a + (f.pages || 0), 0), size = ok.reduce((a, f) => a + f.size, 0);
    $("#pd-count", el).textContent = `${files.length} Datei${files.length === 1 ? "" : "en"}${ok.length ? ` · ${pages} Seiten · ${fmtSize(size)}` : ""}`;
    list.innerHTML = files.map((f, i) => `<li class="pdf-item ${f.error ? "bad" : ""}" data-id="${f.id}">
      <button type="button" class="handle" aria-label="${esc(f.name)} verschieben">${icon("grip")}</button>
      <span class="pdf-thumb" aria-hidden="true"></span>
      <span class="pdf-main"><b>${esc(f.name)}</b><small>${f.error ? esc(f.error) : f.pages == null ? "wird gelesen …" : `${f.pages} Seite${f.pages === 1 ? "" : "n"} · ${fmtSize(f.size)}`}</small></span>
      <button type="button" class="btn icon small ghost" data-mv="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(f.name)} nach oben">${icon("arrow-up")}</button>
      <button type="button" class="btn icon small ghost" data-mv="1" ${i === files.length - 1 ? "disabled" : ""} aria-label="${esc(f.name)} nach unten">${icon("arrow-down")}</button>
      <button type="button" class="btn icon small ghost danger" data-rm aria-label="${esc(f.name)} entfernen">${icon("x")}</button></li>`).join("");
    for (const f of files) if (f.thumb) $(`[data-id="${f.id}"] .pdf-thumb`, list)?.appendChild(f.thumb);
    updateGo();
  }
  list.addEventListener("click", e => {
    const li = e.target.closest(".pdf-item"); if (!li || busy) return;
    const i = files.findIndex(f => f.id === +li.dataset.id);
    if (e.target.closest("[data-rm]")) { files.splice(i, 1); clearResult(); renderList(); return; }
    const mv = e.target.closest("[data-mv]");
    if (mv) { move(i, i + Number(mv.dataset.mv)); $(`[data-id="${li.dataset.id}"] [data-mv="${mv.dataset.mv}"]`, list)?.focus(); }
  });
  function move(i, j) {
    if (j < 0 || j >= files.length || i === j) return;
    const [x] = files.splice(i, 1); files.splice(j, 0, x); clearResult(); renderList();
  }
  // Ziehen mit Finger oder Maus am Griff
  list.addEventListener("pointerdown", e => {
    const handle = e.target.closest(".handle"); if (!handle || busy) return;
    e.preventDefault();
    const item = handle.closest(".pdf-item"), items = [...list.children], z = uiZoom();
    const startY = e.clientY, h = item.getBoundingClientRect().height / z + 8;
    const from = items.indexOf(item); let to = from;
    item.classList.add("dragging"); handle.setPointerCapture(e.pointerId);
    const onMove = ev => {
      const dy = (ev.clientY - startY) / z;
      item.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(items.length - 1, from + Math.round(dy / h)));
      items.forEach((n, k) => {
        if (n === item) return;
        const shift = from < to && k > from && k <= to ? -h : from > to && k < from && k >= to ? h : 0;
        n.style.transform = shift ? `translateY(${shift}px)` : ""; n.style.transition = "transform .12s";
      });
    };
    const up = () => {
      handle.removeEventListener("pointermove", onMove); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
      items.forEach(n => { n.style.transform = ""; n.style.transition = ""; }); item.classList.remove("dragging");
      move(from, to);
    };
    handle.addEventListener("pointermove", onMove); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
  });
  $("#pd-clear", el).onclick = () => { if (!busy) reset(); };

  /* ---------- Einstellungen ---------- */
  const drawLevel = () => {
    $$("#pd-level button", el).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.l === level)));
    $("#pd-level-text", el).textContent = LEVELS.find(l => l.id === level).text;
    updateGo();
  };
  $("#pd-level", el).onclick = e => { const b = e.target.closest("[data-l]"); if (b && !busy) { level = b.dataset.l; clearResult(); drawLevel(); } };
  $("#pd-name", el).oninput = e => { name = e.target.value; };
  $("#pd-name", el).onchange = e => { e.target.value = name = fileName(e.target.value); };
  function updateGo() {
    const ok = files.filter(f => f.bytes).length, go = $("#pd-go", el);
    go.disabled = busy || !ok || files.some(f => f.pages == null && !f.error);
    go.textContent = level === "none" ? (ok > 1 ? "Zusammenfügen" : "Als PDF speichern") : ok > 1 ? "Zusammenfügen & komprimieren" : "Komprimieren";
  }

  /* ---------- Verarbeiten ---------- */
  const progress = (status, pct) => {
    $("#pd-progress", el).hidden = false; $("#pd-status", el).textContent = status;
    $("#pd-pct", el).textContent = pct == null ? "" : Math.round(pct) + " %";
    $("#pd-bar", el).style.width = (pct == null ? 100 : pct) + "%";
    $("#pd-bar", el).classList.toggle("indet", pct == null);
  };
  $("#pd-go", el).onclick = async () => {
    const ok = files.filter(f => f.bytes);
    const bad = files.filter(f => f.error);
    if (!ok.length) return;
    if (bad.length) toast(`${bad.length} Datei${bad.length === 1 ? " wird" : "en werden"} übersprungen (passwortgeschützt oder beschädigt).`);
    busy = true; clearResult(); updateGo(); el.classList.add("pdf-busy");
    const before = ok.reduce((a, f) => a + f.size, 0), lvl = LEVELS.find(l => l.id === level);
    try {
      progress("Füge zusammen …", null);
      const { PDFDocument } = window.PDFLib;
      const out = await PDFDocument.create();
      for (const f of ok) {
        const src = await PDFDocument.load(f.bytes, { updateMetadata: false });
        (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
      }
      const merged = await out.save({ useObjectStreams: true });
      if (!alive) return;
      let final = merged, note = "";
      if (lvl.dpi) {
        try {
          const compressed = await compress(merged, lvl.dpi, ok.reduce((a, f) => a + f.pages, 0));
          if (!alive) return;
          if (compressed.length < merged.length) final = compressed;
          else note = "Komprimieren hätte die Datei nicht verkleinert – du bekommst deshalb die unkomprimierte, kleinere Version.";
        } catch (e) {
          if (!alive) return;
          note = "Komprimieren hat nicht geklappt (" + e.message + "). Du bekommst die zusammengefügte Datei ohne Komprimierung.";
        }
      }
      result = { bytes: final, before, after: final.length, note, name: fileName(name) };
      showResult();
    } catch (e) {
      console.error(e);
      toast("Verarbeitung fehlgeschlagen: " + (e.message || e), { error: true });
    } finally {
      busy = false; el.classList.remove("pdf-busy"); $("#pd-progress", el).hidden = true; updateGo();
    }
  };
  function compress(bytes, dpi, pages) {
    return new Promise((resolve, reject) => {
      worker = new Worker(new URL("./pdf-worker.js", import.meta.url), { type: "module" });
      progress("Lade Komprimierer …", 0);
      const stop = () => { worker?.terminate(); worker = null; };
      worker.onmessage = ({ data: m }) => {
        if (m.type === "load") progress(m.loaded >= m.total ? "Komprimiere …" : `Lade Komprimierer … ${fmtSize(m.loaded)} von ${fmtSize(m.total)}`, m.loaded >= m.total ? 0 : m.loaded / m.total * 100);
        if (m.type === "page") progress(`Komprimiere … Seite ${m.n} von ${pages}`, Math.min(99, m.n / pages * 100));
        if (m.type === "done") { stop(); resolve(m.out); }
        if (m.type === "error") { stop(); reject(new Error(m.message)); }
      };
      worker.onerror = e => { stop(); reject(new Error(e.message || "Komprimierer abgestürzt (zu wenig Speicher?)")); };
      worker.postMessage({ input: bytes, dpi });
    });
  }
  function showResult() {
    const r = result, box = $("#pd-result", el), saved = Math.round((1 - r.after / r.before) * 100);
    box.hidden = false;
    box.innerHTML = `<h2>Fertig</h2>
      <div class="pdf-sizes"><span class="num">${fmtSize(r.before)}</span>${icon("arrow-right", { size: 20 })}<b class="num">${fmtSize(r.after)}</b></div>
      <p style="margin:0;font-weight:600" class="${saved > 0 ? "tag-ok" : "muted"}">${saved > 0 ? `${saved} % kleiner` : saved < 0 ? `${-saved} % größer als die Einzeldateien zusammen` : "gleich groß"}</p>
      ${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}
      <div class="row"><button type="button" class="btn primary" id="pd-dl">${icon("arrow-down", { size: 18 })} ${esc(r.name)} herunterladen</button></div>`;
    $("#pd-dl", el).onclick = async () => {
      await deliverFile(r.name, new Blob([r.bytes], { type: "application/pdf" }));
      reset();
      toast("Heruntergeladen. Die Dateien wurden aus dem Speicher entfernt.");
    };
  }
  function clearResult() { result = null; const b = $("#pd-result", el); if (b) { b.hidden = true; b.innerHTML = ""; } }
  function reset() { files = []; clearResult(); renderList(); }

  drawLevel(); renderList();
  return () => { alive = false; worker?.terminate(); worker = null; files = []; result = null; };
}
