// Video zu Text: Link einfügen → passende kostenlose Transkript-Seite öffnen (Link wird kopiert,
// bei YouTube wo möglich vorausgefüllt) → Transkript mit Titel, Link und Notiz speichern; Verlauf mit Suche.
// Datenmodell: users/{uid}/transcripts/{id} { title, url, platform, transcript, note, createdAt, updatedAt }
import { $, esc, openSheet, toast } from "../core/ui.js";
import { watchCollection, put, merge, remove, newId } from "../core/data.js";

const PLATFORMS = {
  youtube: { name: "YouTube", test: /(^|\.)(youtube\.com|youtu\.be)$/ },
  tiktok: { name: "TikTok", test: /(^|\.)tiktok\.com$/ },
  instagram: { name: "Instagram", test: /(^|\.)instagram\.com$/ }
};
// Kostenlose Transkript-Seiten ohne Anmeldung (Stand Oktober 2026). prefill: Adresse mit eingesetztem Link,
// sofern die Seite das unterstützt; der Link wird immer zusätzlich in die Zwischenablage kopiert.
const SITES = {
  youtube: [
    { name: "YouTube to Transcript", url: "https://youtubetotranscript.com/", prefill: (u, id) => id && `https://youtubetotranscript.com/transcript?v=${id}`, note: "Untertitel als Text, mit Kopieren und Übersetzen" },
    { name: "DownSub", url: "https://downsub.com/", prefill: u => `https://downsub.com/?url=${encodeURIComponent(u)}`, note: "Untertitel als TXT/SRT herunterladen" },
    { name: "NoteGPT", url: "https://notegpt.io/youtube-transcript-generator", note: "Transkript, auch für lange Videos" },
    { name: "Direkt bei YouTube", url: null, prefill: u => u, note: "Unter dem Video: „…mehr“ → „Transkript anzeigen“" }
  ],
  tiktok: [
    { name: "Supadata", url: "https://supadata.ai/tiktok-transcript", note: "Auch Kurzlinks (vm.tiktok.com), erkennt Sprache ohne Untertitel" },
    { name: "YouTube to Transcript (TikTok)", url: "https://youtubetotranscript.com/tiktok-transcript", note: "Aus TikTok-Untertiteln, TXT/SRT" },
    { name: "Choppity", url: "https://www.choppity.com/tools/tiktok-video-to-transcript/", note: "Link oder Datei hochladen" }
  ],
  instagram: [
    { name: "Supadata", url: "https://supadata.ai/instagram-transcript", note: "Nur öffentliche Reels" },
    { name: "Eden", url: "https://eden.so/tools/instagram-transcript-generator/", note: "Reels, kurze Videos" },
    { name: "SocialCrawl", url: "https://www.socialcrawl.dev/tools/instagram-transcript-generator", note: "Reel-Link einfügen" }
  ]
};

export function detect(link) {
  let u; try { u = new URL(link.trim()); } catch (e) { return null; }
  const p = Object.entries(PLATFORMS).find(([, x]) => x.test.test(u.hostname.replace(/^www\.|^m\./, "")));
  if (!p) return null;
  let id = null;
  if (p[0] === "youtube") id = u.hostname.includes("youtu.be") ? u.pathname.slice(1).split("/")[0] : u.searchParams.get("v") || (u.pathname.match(/\/(shorts|live|embed)\/([\w-]{6,})/) || [])[2] || null;
  return { platform: p[0], name: p[1].name, id, url: u.href };
}

async function fetchTitle(url) {
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json(); return j.title || "";
  } catch (e) { return ""; }
}
async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } }

export function mount(el, ctx) {
  let list = [], q = "", found = null, autoTitle = "";
  el.innerHTML = `<div class="page-head"><div><h1>Video zu Text</h1><p>YouTube, TikTok und Instagram Reels als Text sichern.</p></div></div>
    <div class="grid-2">
      <section class="card stack">
        <h2>1 · Link einfügen</h2>
        <div class="row" style="flex-wrap:nowrap"><input class="input" type="url" id="vd-link" placeholder="https://www.youtube.com/watch?v=…" aria-label="Video-Link" inputmode="url">
          <button type="button" class="btn" id="vd-paste">Einfügen</button></div>
        <div id="vd-sites" class="stack"></div>
      </section>
      <section class="card stack">
        <h2>2 · Transkript speichern</h2>
        <label class="field"><span>Titel</span><input class="input" type="text" id="vd-title" placeholder="wird bei YouTube automatisch ergänzt"></label>
        <label class="field"><span>Transkript (hier einfügen)</span><textarea class="input" id="vd-text" rows="8"></textarea></label>
        <label class="field"><span>Eigene Notiz (optional)</span><textarea class="input" id="vd-note" rows="2"></textarea></label>
        <div><button type="button" class="btn primary" id="vd-save">Speichern</button></div>
      </section>
      <section class="card stack" style="grid-column:1/-1">
        <div class="row" style="justify-content:space-between"><h2>Verlauf</h2><input class="input" type="search" id="vd-q" placeholder="In Titeln, Notizen und Transkripten suchen …" style="flex:0 1 320px;width:auto" aria-label="Verlauf durchsuchen"></div>
        <div id="vd-list"></div>
      </section>
    </div>`;

  function drawSites() {
    const box = $("#vd-sites", el), v = $("#vd-link", el).value.trim();
    found = v ? detect(v) : null;
    if (!v) { box.innerHTML = `<p class="note">Füge einen Link von YouTube, TikTok oder Instagram ein. Dann erscheinen passende kostenlose Transkript-Seiten.</p>`; return; }
    if (!found) { box.innerHTML = `<p class="err">Das ist kein YouTube-, TikTok- oder Instagram-Link.</p>`; return; }
    box.innerHTML = `<p class="small" style="margin:0"><span class="tag">${esc(found.name)}</span> erkannt. Tippe auf eine Seite – der Link wird kopiert, du musst ihn dort nur noch einfügen.</p>
      <ul class="sortlist">${SITES[found.platform].map((s, i) => `<li><span class="name">${esc(s.name)}<small>${esc(s.note)}${s.prefill && s.url ? " · Link wird vorausgefüllt, wenn die Seite es unterstützt" : ""}</small></span>
        <a class="btn small" href="${esc((s.prefill && s.prefill(found.url, found.id)) || s.url)}" data-site="${i}" target="_blank" rel="noopener">Öffnen ↗</a></li>`).join("")}</ul>`;
  }
  $("#vd-sites", el).addEventListener("click", async e => {
    const a = e.target.closest("[data-site]"); if (!a || !found) return;
    const ok = await copy(found.url);
    toast(ok ? "Link kopiert – auf der Seite einfügen, Transkript kopieren und hier speichern." : "Seite geöffnet. Kopiere den Link oben und füge ihn dort ein.");
  });
  let t = 0;
  $("#vd-link", el).addEventListener("input", () => {
    drawSites(); clearTimeout(t);
    // automatisch gesetzten Titel des vorherigen Links entfernen
    if (autoTitle && $("#vd-title", el).value === autoTitle) { $("#vd-title", el).value = ""; autoTitle = ""; }
    t = setTimeout(async () => {
      if (found?.platform === "youtube" || found?.platform === "tiktok") {
        const title = await fetchTitle(found.url);
        if (title && !$("#vd-title", el).value.trim()) { $("#vd-title", el).value = title; autoTitle = title; }
      }
    }, 500);
  });
  $("#vd-paste", el).onclick = async () => {
    try { const txt = await navigator.clipboard.readText(); $("#vd-link", el).value = txt.trim(); $("#vd-link", el).dispatchEvent(new Event("input")); }
    catch (e) { $("#vd-link", el).focus(); toast("Einfügen ist hier nicht erlaubt – bitte lange ins Feld tippen und „Einfügen“ wählen."); }
  };
  $("#vd-save", el).onclick = async () => {
    const link = $("#vd-link", el).value.trim(), transcript = $("#vd-text", el).value.trim();
    if (!transcript) { toast("Bitte zuerst das Transkript einfügen.", { error: true }); $("#vd-text", el).focus(); return; }
    if (transcript.length > 800000) { toast("Das Transkript ist zu lang (max. 800.000 Zeichen).", { error: true }); return; }
    const d = link ? detect(link) : null;
    const data = { title: $("#vd-title", el).value.trim() || (d ? `${d.name}-Video` : "Transkript"), url: link, platform: d?.platform || "", transcript, note: $("#vd-note", el).value.trim(), createdAt: new Date().toISOString() };
    try {
      await put("transcripts", newId("tr"), data);
      ["#vd-link", "#vd-title", "#vd-text", "#vd-note"].forEach(s => { $(s, el).value = ""; });
      drawSites(); toast("Transkript gespeichert.");
    } catch (e) { toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }); }
  };

  function drawList() {
    const nq = q.trim().toLowerCase();
    const rows = list.filter(x => !nq || (x.title + " " + x.note + " " + x.transcript).toLowerCase().includes(nq)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const snip = x => {
      if (!nq) return x.transcript.slice(0, 160);
      const i = x.transcript.toLowerCase().indexOf(nq);
      return i < 0 ? x.transcript.slice(0, 160) : (i > 40 ? "… " : "") + x.transcript.slice(Math.max(0, i - 40), i + 120);
    };
    $("#vd-list", el).innerHTML = rows.length ? `<ul class="sortlist">${rows.map(x => `<li><button type="button" class="ibtn" data-id="${esc(x.id)}">
        <span class="name"><b style="font-weight:500">${esc(x.title)}</b> ${x.platform ? `<span class="tag">${esc(PLATFORMS[x.platform]?.name || "")}</span>` : ""}
        <small>${esc(new Date(x.createdAt).toLocaleDateString("de-DE"))}${x.note ? " · " + esc(x.note) : ""}</small>
        <small style="color:var(--ink)">${esc(snip(x))}${x.transcript.length > 160 ? " …" : ""}</small></span></button></li>`).join("")}</ul>`
      : `<p class="muted" style="margin:0">${nq ? "Nichts gefunden." : "Noch keine Transkripte gespeichert."}</p>`;
  }
  $("#vd-q", el).addEventListener("input", e => { q = e.target.value; drawList(); });
  $("#vd-list", el).addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) openTranscript(list.find(x => x.id === b.dataset.id), ctx); });
  const stop = watchCollection("transcripts", l => { list = l; drawList(); });
  drawSites();
  return () => { stop(); clearTimeout(t); };
}

function openTranscript(x, ctx) {
  openSheet((s, close) => {
    s.innerHTML = `<div class="sheet-head"><h3>${esc(x.title)}</h3></div>
      ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" class="small" style="overflow-wrap:anywhere">${esc(x.url)}</a>` : ""}
      <label class="field"><span>Titel</span><input class="input" type="text" id="tx-title" value="${esc(x.title)}"></label>
      <label class="field"><span>Notiz</span><textarea class="input" id="tx-note" rows="2">${esc(x.note || "")}</textarea></label>
      <label class="field"><span>Transkript</span><textarea class="input" id="tx-text" rows="12">${esc(x.transcript)}</textarea></label>
      <div class="sheet-foot"><button type="button" class="btn danger" data-del style="margin-right:auto">Löschen</button><button type="button" class="btn" data-copy>Text kopieren</button><button type="button" class="btn" data-x>Schließen</button><button type="button" class="btn primary" data-save>Speichern</button></div>`;
    $("[data-x]", s).onclick = close;
    $("[data-copy]", s).onclick = async () => toast(await copy($("#tx-text", s).value) ? "Text kopiert." : "Kopieren nicht möglich – bitte markieren und kopieren.");
    $("[data-save]", s).onclick = async () => {
      try { await merge("transcripts", x.id, { title: $("#tx-title", s).value.trim() || x.title, note: $("#tx-note", s).value.trim(), transcript: $("#tx-text", s).value, updatedAt: new Date().toISOString() }); close(); toast("Gespeichert."); }
      catch (e) { toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true }); }
    };
    $("[data-del]", s).onclick = () => ctx.confirmBox(`„${x.title}“ löschen?`, "Löschen", () => { close(); remove("transcripts", x.id); }, { danger: true });
  }, { label: "Transkript", noFocus: true });
}
