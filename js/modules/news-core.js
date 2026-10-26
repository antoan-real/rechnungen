// News: Quellen und Gruppierung ähnlicher Meldungen zu Themen (genutzt von App und scripts/fetch-news.js).
// Die Feeds holt GitHub Actions alle 30 Minuten (.github/workflows/news.yml) und legt sie als
// news.json im Branch "news-data" ab. Die App liest sie von raw.githubusercontent.com (erlaubt CORS).
export const NEWS_URL = "https://raw.githubusercontent.com/antoan-real/rechnungen/news-data/news.json";

export const SOURCES = [
  { id: "tagesschau", name: "Tagesschau", url: "https://www.tagesschau.de/index~rss2.xml" },
  { id: "spiegel", name: "Spiegel", url: "https://www.spiegel.de/schlagzeilen/index.rss" },
  { id: "zeit", name: "Zeit", url: "https://newsfeed.zeit.de/index" },
  { id: "faz", name: "FAZ", url: "https://www.faz.net/rss/aktuell/" },
  { id: "sz", name: "Süddeutsche", url: "https://rss.sueddeutsche.de/rss/Topthemen" },
  { id: "handelsblatt", name: "Handelsblatt", url: "https://www.handelsblatt.com/contentexport/feed/schlagzeilen" },
  { id: "welt", name: "Welt", url: "https://www.welt.de/feeds/latest.rss" },
  { id: "ntv", name: "n-tv", url: "https://www.n-tv.de/rss" },
  { id: "dlf", name: "Deutschlandfunk", url: "https://www.deutschlandfunk.de/nachrichten-100.rss" },
  { id: "zdf", name: "ZDF heute", url: "https://www.zdf.de/rss/zdf/nachrichten" },
  { id: "taz", name: "taz", url: "https://taz.de/!p4608;rss/" }
];
export const DEFAULT_SOURCES = ["tagesschau", "spiegel", "zeit", "faz", "sz", "handelsblatt"];
export const sourceName = id => SOURCES.find(s => s.id === id)?.name || id;

const STOP = new Set(("aber alle allem allen aller alles als also am an ander andere anderen anders auch auf aus bei beim bereits bin bis bisher bitte da dabei dadurch daher damit dann darf darum das dass dein deine dem den denen denn der deren des deshalb dessen dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein eine einem einen einer eines einige er es etwa euch für gegen geht gibt hab habe haben hat hatte hätte hier hin hinter ich ihm ihn ihnen ihr ihre im immer in ins ist ja jahr jahre jahren jetzt kann kein keine können könnte machen man mehr mein mit muss müssen nach neue neuen nicht nichts noch nun nur ob oder ohne schon sein seine seit sich sie sind so soll sollen sollte sondern sowie über um und uns unter viel viele vom von vor war waren warum was weil weiter weitere wenn wer werden wie wieder will wir wird wo worden wurde wurden zu zum zur zwei drei vier fünf zwischen heute gestern morgen laut sagt sagte erst ersten neu mal ab rund prozent millionen milliarden euro deutschland deutschen deutsche news live ticker liveblog video podcast kommentar analyse interview newsblog überblick").split(" "));

export function terms(text) {
  const out = [];
  for (let w of String(text || "").toLowerCase().replace(/ß/g, "ss").split(/[^a-zäöü0-9-]+/)) {
    w = w.replace(/^-+|-+$/g, "");
    if (w.length < 3 || STOP.has(w) || /^[\d-]+$/.test(w)) continue;
    if (w.length > 6) w = w.replace(/(ern|en|er|es|em|e|n|s)$/, "");
    out.push(w);
    // Wortanfang für zusammengesetzte Wörter (Gaza ↔ Gazastreifen, Rentenpaket ↔ Rentenniveau)
    if (w.length >= 8) out.push("~" + w.slice(0, 5));
  }
  return out;
}

/** Meldungen zu Themen gruppieren. items: [{ s, t, d, u, p }] → [{ items, sources, keywords, latest }] */
export function groupArticles(items, { threshold = 0.3 } = {}) {
  const docs = items.map(it => {
    const tf = new Map();
    const add = (w, c) => tf.set(w, (tf.get(w) || 0) + (w[0] === "~" ? c / 2 : c));
    for (const w of terms(it.t)) add(w, 2);
    for (const w of terms(it.d)) add(w, 1);
    return { it, tf };
  });
  const df = new Map();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const N = Math.max(docs.length, 1);
  for (const d of docs) {
    d.vec = new Map(); let norm = 0;
    for (const [w, c] of d.tf) {
      if ((df.get(w) || 0) > Math.max(12, N * 0.12)) continue; // zu allgemein
      const v = c * Math.log(1 + N / df.get(w)); d.vec.set(w, v); norm += v * v;
    }
    d.norm = Math.sqrt(norm) || 1;
  }
  const clusters = [];
  const sorted = docs.slice().sort((a, b) => String(b.it.p).localeCompare(String(a.it.p)));
  for (const d of sorted) {
    let best = null, bestSim = 0;
    for (const c of clusters) {
      let dot = 0, shared = 0;
      for (const [w, v] of d.vec) { const cv = c.vec.get(w); if (cv) { dot += v * cv; shared++; } }
      const sim = dot / (d.norm * c.norm);
      if (shared >= 2 && sim > bestSim) { bestSim = sim; best = c; }
    }
    if (best && bestSim >= threshold) {
      best.docs.push(d);
      for (const [w, v] of d.vec) best.vec.set(w, (best.vec.get(w) || 0) + v / d.norm);
      best.norm = Math.sqrt([...best.vec.values()].reduce((a, v) => a + v * v, 0)) || 1;
    } else {
      const vec = new Map([...d.vec].map(([w, v]) => [w, v / d.norm]));
      clusters.push({ docs: [d], vec, norm: 1 });
    }
  }
  return clusters.map(c => {
    const its = c.docs.map(d => d.it);
    const kw = [...c.vec].filter(([w]) => w[0] !== "~").filter(([w]) => c.docs.filter(d => d.tf.has(w)).length >= Math.min(2, c.docs.length)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
    return { items: its, sources: [...new Set(its.map(i => i.s))], keywords: kw, latest: its.map(i => i.p).sort().pop() };
  }).sort((a, b) => b.sources.length - a.sources.length || String(b.latest).localeCompare(String(a.latest)));
}
