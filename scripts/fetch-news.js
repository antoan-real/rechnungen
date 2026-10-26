// Holt die RSS-Feeds der Nachrichtenquellen (js/modules/news-core.js) und schreibt out/news.json.
// Nur Überschrift, Anreißer (wie im Feed geliefert), Link und Zeit – keine Artikeltexte.
// Läuft über GitHub Actions alle 30 Minuten (.github/workflows/news.yml).
import { XMLParser } from "fast-xml-parser";
import { mkdirSync, writeFileSync } from "node:fs";
import { SOURCES } from "../js/modules/news-core.js";

const MAX_AGE_H = 48, MAX_PER_SOURCE = 40, TEASER = 300;
const notice = (level, msg) => console.log(process.env.GITHUB_ACTIONS ? `::${level} title=News::${msg}` : msg);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", processEntities: true, htmlEntities: true, trimValues: true });

const text = v => typeof v === "string" ? v : typeof v === "number" ? String(v) : v?.["#text"] ?? (Array.isArray(v) ? text(v[0]) : "");
function clean(html) {
  return text(html).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, " ").trim();
}
function shorten(s) {
  if (s.length <= TEASER) return s;
  const cut = s.slice(0, TEASER); return cut.slice(0, cut.lastIndexOf(" ")) + " …";
}
function linkOf(it) {
  if (typeof it.link === "string") return it.link;
  const links = [].concat(it.link || []);
  const alt = links.find(l => l["@rel"] === "alternate") || links[0];
  return alt?.["@href"] || text(alt) || it.guid?.["#text"] || (typeof it.guid === "string" ? it.guid : "");
}

const now = Date.now(), items = [], report = [];
await Promise.all(SOURCES.map(async src => {
  try {
    const res = await fetch(src.url, { headers: { "User-Agent": "DailyBegleiter/1.0 (+https://antoan-real.github.io/rechnungen/)", Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml = parser.parse(await res.text());
    const raw = [].concat(xml.rss?.channel?.item || xml.feed?.entry || xml["rdf:RDF"]?.item || []);
    let n = 0;
    for (const it of raw) {
      const t = clean(it.title), u = linkOf(it).trim();
      const p = new Date(text(it.pubDate || it.published || it.updated || it["dc:date"]) || now);
      if (!t || !u.startsWith("http") || isNaN(p) || now - p > MAX_AGE_H * 3600e3) continue;
      const d = shorten(clean(it.description || it.summary || it["content:encoded"] || ""));
      items.push({ s: src.id, t, d: d === t ? "" : d, u, p: p.toISOString() });
      if (++n >= MAX_PER_SOURCE) break;
    }
    report.push({ id: src.id, ok: true, count: n });
  } catch (e) {
    report.push({ id: src.id, ok: false, count: 0, error: String(e.message || e).slice(0, 120) });
  }
}));

items.sort((a, b) => b.p.localeCompare(a.p));
mkdirSync("out", { recursive: true });
writeFileSync("out/news.json", JSON.stringify({ generatedAt: new Date().toISOString(), sources: report, items }));
const failed = report.filter(r => !r.ok);
notice(failed.length === SOURCES.length ? "error" : "notice",
  `${items.length} Meldungen aus ${report.length - failed.length} von ${SOURCES.length} Quellen` + (failed.length ? ` · nicht erreichbar: ${failed.map(f => `${f.id} (${f.error})`).join(", ")}` : ""));
if (failed.length === SOURCES.length) process.exit(1);
