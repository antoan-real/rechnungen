// Datumshilfen. Tage werden als "YYYY-MM-DD" in Ortszeit gespeichert.
export const WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Anzeige Mo–So

export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseDay(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
export function addDays(iso, n) { const d = parseDay(iso); d.setDate(d.getDate() + n); return isoDay(d); }
export const today = () => isoDay();
export const weekday = iso => parseDay(iso).getDay();
export const longDate = (d = new Date()) => d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const shortDate = iso => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
export function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
/** ISO-Kalenderwoche (Montag als Wochenbeginn) */
export function isoWeek(iso) {
  const d = parseDay(iso); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return { year: d.getFullYear(), week: 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7) };
}
export const weekKey = iso => { const w = isoWeek(iso); return `${w.year}-W${String(w.week).padStart(2, "0")}`; };
export const monthKey = iso => iso.slice(0, 7);
export const lastDayOfMonth = iso => { const d = parseDay(iso); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
