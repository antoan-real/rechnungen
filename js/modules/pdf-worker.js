// Hintergrund-Thread für „PDF komprimieren“: lädt Ghostscript (WebAssembly) und schreibt die PDF neu.
// Alles bleibt im Browser. Der Thread wird nach jedem Durchlauf beendet, damit der Speicher frei wird.
// Nachrichten: rein { input: Uint8Array, dpi } – raus { type: "load", loaded, total } | { type: "page", n } | { type: "done", out } | { type: "error", message }
const BASE = new URL("../../vendor/ghostpdl-1.1.0/", import.meta.url);

async function fetchWasm() {
  const res = await fetch(new URL("gs.wasm", BASE));
  if (!res.ok) throw new Error("Komprimierer konnte nicht geladen werden (" + res.status + ")");
  const total = Number(res.headers.get("content-length")) || 15533045;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(), parts = [];
  let loaded = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    if (loaded - last > 300000) { last = loaded; self.postMessage({ type: "load", loaded, total }); }
  }
  const buf = new Uint8Array(loaded); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  self.postMessage({ type: "load", loaded, total: loaded });
  return buf;
}

self.onmessage = async e => {
  const { input, dpi } = e.data;
  try {
    const [wasmBinary, { default: load }] = await Promise.all([fetchWasm(), import(new URL("gs.js", BASE).href)]);
    const M = await load({
      wasmBinary,
      print: t => { const m = /^Page (\d+)/.exec(t); if (m) self.postMessage({ type: "page", n: +m[1] }); },
      printErr: () => {}
    });
    M.FS.writeFile("in.pdf", input);
    // pdfwrite behält Text als Text (markier- und durchsuchbar); nur Bilder werden auf die gewählte Auflösung verkleinert
    const args = ["-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dNOPAUSE", "-dBATCH", "-dSAFER",
      "-dPDFSETTINGS=/ebook", "-dAutoRotatePages=/None", "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dSubsetFonts=true",
      "-dDownsampleColorImages=true", "-dColorImageDownsampleType=/Bicubic", `-dColorImageResolution=${dpi}`,
      "-dDownsampleGrayImages=true", "-dGrayImageDownsampleType=/Bicubic", `-dGrayImageResolution=${dpi}`,
      "-dDownsampleMonoImages=true", `-dMonoImageResolution=${Math.max(150, dpi * 2)}`,
      "-sOutputFile=out.pdf", "in.pdf"];
    try { M.callMain(args); } catch (err) { if (!/ExitStatus|exit\(0\)|unwind/i.test(String(err?.name || err))) throw err; }
    let out;
    try { out = M.FS.readFile("out.pdf"); } catch (err) { out = null; }
    if (!out || out.length < 100) throw new Error("Ghostscript konnte die Datei nicht verarbeiten.");
    self.postMessage({ type: "done", out }, [out.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message || err) });
  }
};
