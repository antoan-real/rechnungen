// Lebensreflektor: gemeinsame Datenquelle und Bausteine für alle Unterbereiche.
import { esc, toast } from "../../core/ui.js";
import { watchCollection, watchDoc, put, merge } from "../../core/data.js";
import { parseDay, addDays } from "../../core/dates.js";
import { STARTER_CARDS } from "./cards-data.js";
import { todaysCard } from "../reflect-core.js";

export const fail = e => toast("Speichern fehlgeschlagen: " + (e.code || e.message), { error: true });
export const longDay = iso => parseDay(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const shortDay = iso => parseDay(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
export const monthName = ym => parseDay(ym + "-01").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
export function sameDayMonthsAgo(iso, n) {
  const d = parseDay(iso), t = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d.getDate(), last)).padStart(2, "0")}`;
}
export const autoGrow = ta => { ta.style.height = "auto"; ta.style.height = Math.max(44, ta.scrollHeight + 2) + "px"; };
export const isTyping = box => { const a = document.activeElement; return !!a && box.contains(a) && a.matches("input[type=text], textarea, input:not([type])"); };
export const cardId = n => "card-" + String(n).padStart(2, "0");

/** Alle Daten des Lebensreflektors live; legt beim ersten Mal die 30 Startkarten an. */
export function openStore(onChange) {
  const st = { cards: null, journal: null, complaints: null, people: null, reflections: null, wheel: null, cfg: null };
  let seeding = false, cfgConfirmed = false;
  const emit = () => { if (Object.values(st).every(v => v !== null)) onChange(st); };
  const seed = () => {
    if (seeding || !cfgConfirmed || st.cards === null || st.cfg.cardsSeeded) return;
    seeding = true;
    const have = new Set(st.cards.map(c => c.id)), now = new Date().toISOString();
    Promise.all(STARTER_CARDS.filter(c => !have.has(cardId(c.n))).map(c =>
      put("cards", cardId(c.n), { title: c.title, text: c.text, category: c.category, source: "", favorite: false, notes: [], starter: c.n, createdAt: now })))
      .then(() => merge("settings", "reflect", { cardsSeeded: true })).catch(fail);
  };
  const stops = [
    watchCollection("cards", l => { st.cards = l.sort((a, b) => String(a.id).localeCompare(String(b.id))); seed(); emit(); }),
    watchCollection("journal", l => { st.journal = Object.fromEntries(l.map(d => [d.id, d])); emit(); }),
    watchCollection("complaints", l => { st.complaints = l.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); emit(); }),
    watchCollection("people", l => { st.people = l.sort((a, b) => String(a.name).localeCompare(String(b.name), "de")); emit(); }),
    watchCollection("reflections", l => { st.reflections = Object.fromEntries(l.map(d => [d.id, d])); emit(); }),
    watchCollection("wheel", l => { st.wheel = Object.fromEntries(l.map(d => [d.id, d])); emit(); }),
    // includeMeta: erst seeden, wenn der Server bestätigt hat, dass noch keine Karten angelegt wurden
    watchDoc("settings", "reflect", (d, meta) => { st.cfg = d || {}; if (!meta.fromCache) { cfgConfirmed = true; seed(); } emit(); }, { includeMeta: true })
  ];
  return { st, stop: () => stops.forEach(f => f()) };
}

/** Nur die geänderten Felder schreiben, damit sich Dankbarkeit, Moment und Stimmung nicht gegenseitig überschreiben */
let persistedFor = "";
/** Gedanke des Tages für die Anzeige; merkt sich die gezogene Karte für den Tag */
export function pickToday(st, date) {
  const { card, stored } = todaysCard(st.cards, st.cfg, date);
  if (card && !stored && persistedFor !== date) { persistedFor = date; merge("settings", "reflect", { today: { date, cardId: card.id } }).catch(() => { persistedFor = ""; }); }
  return card;
}

export function saveJournal(date, patch) {
  return merge("journal", date, { ...patch, date, updatedAt: new Date().toISOString() }).catch(fail);
}

/** Perspektiv-Karte als HTML. opts.compact = für Listen/Startseite */
export function cardHtml(c, opts = {}) {
  return `<article class="card thought ${opts.compact ? "compact" : ""}" ${opts.button ? `role="button" tabindex="0" data-card="${esc(c.id)}"` : ""}>
    ${opts.label || c.category ? `<span class="t-cat">${esc(opts.label || c.category)}</span>` : ""}
    <h3>${esc(c.title)}</h3>
    <p class="t-text">${esc(c.text)}</p>
    ${opts.actions ? `<div class="t-actions">${opts.actions}</div>` : ""}
  </article>`;
}

/** „Heute vor einem Monat / Jahr“: Dankbarkeit, Alltagsmomente, Karten-Notizen */
export function lookbacks(st, date) {
  const out = [];
  for (const [label, d] of [["Heute vor einem Jahr", sameDayMonthsAgo(date, 12)], ["Heute vor einem Monat", sameDayMonthsAgo(date, 1)]]) {
    const j = st.journal[d], lines = [];
    for (const g of j?.gratitude || []) if (String(g || "").trim()) lines.push({ kind: "Dankbar für", text: g });
    if (j?.moment?.trim()) lines.push({ kind: "Alltagsmoment", text: j.moment });
    for (const c of st.cards) for (const n of c.notes || []) if (n.date === d) lines.push({ kind: `Notiz zu „${c.title}“`, text: n.text });
    if (lines.length) out.push({ label, date: d, lines });
  }
  return out;
}

/** Zufällige ältere Erinnerung (Dankbarkeit oder Alltagsmoment, älter als 30 Tage), fest pro Tag */
export function randomMemory(st, date) {
  const pool = [];
  for (const j of Object.values(st.journal)) {
    if (j.date > addDays(date, -30)) continue;
    for (const g of j.gratitude || []) if (String(g || "").trim()) pool.push({ date: j.date, kind: "Dankbar für", text: g });
    if (j.moment?.trim()) pool.push({ date: j.date, kind: "Alltagsmoment", text: j.moment });
  }
  if (!pool.length) return null;
  pool.sort((a, b) => (a.date + a.text).localeCompare(b.date + b.text));
  let h = 7; for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}
