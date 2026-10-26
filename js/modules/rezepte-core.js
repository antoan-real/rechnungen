// Rezepte: Zutatenzeilen erkennen („200 g Hähnchenbrust“), der Datenbank zuordnen, Nährwerte und Kosten rechnen.
// Datenmodell:
//   users/{uid}/food/prefs   { ingredients: { [id]: Zutat (geändert oder neu) }, deletedIngredients: [id], hiddenRecipes: [id] }
//   users/{uid}/recipes/{id} { name, servings, minutes, tags, items: [{ text, ingId, grams }], steps, note }
// Eingebaute Zutaten und Rezepte (rezepte-data.js) gelten, solange der Nutzer sie nicht ändert oder ausblendet.
import { INGREDIENTS, RECIPES } from "./rezepte-data.js";

const UNIT_ALIASES = {
  g: "g", gr: "g", gramm: "g", kg: "kg", ml: "ml", l: "l", liter: "l", cl: "cl",
  el: "EL", esslöffel: "EL", tl: "TL", teelöffel: "TL", prise: "Prise", prisen: "Prise",
  stück: "Stück", stk: "Stück", st: "Stück", dose: "Dose", dosen: "Dose", becher: "Becher",
  packung: "Packung", packungen: "Packung", pck: "Packung", päckchen: "Packung", pack: "Packung",
  scheibe: "Scheibe", scheiben: "Scheibe", tasse: "Tasse", tassen: "Tasse", handvoll: "Handvoll",
  zehe: "Zehe", zehen: "Zehe", bund: "Bund", messlöffel: "Messlöffel", scoop: "Messlöffel"
};
const DEFAULT_UNIT_G = { EL: 15, TL: 5, Prise: 0.5, Stück: 100, Dose: 400, Becher: 250, Packung: 250, Scheibe: 30, Tasse: 200, Handvoll: 30, Zehe: 4, Bund: 50, Messlöffel: 30 };
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
export const UNITS = ["g", "kg", "ml", "l", "EL", "TL", "Stück", "Dose", "Becher", "Packung", "Scheibe", "Tasse", "Handvoll", "Prise"];

export const norm = s => String(s || "").toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
  .replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const stem = w => (w.length > 4 ? w.replace(/(en|n|e|s)$/, "") : w);
const stemAll = s => s.split(" ").map(stem).join(" ");

/** Zutatenliste: eingebaute Werte + Änderungen/eigene Zutaten des Nutzers, ohne gelöschte. */
export function effectiveIngredients(prefs = {}) {
  const own = prefs.ingredients || {}, del = new Set(prefs.deletedIngredients || []);
  const list = INGREDIENTS.filter(i => !del.has(i.id)).map(i => own[i.id] ? { ...i, ...own[i.id], id: i.id, builtin: true } : { ...i, builtin: true });
  for (const [id, i] of Object.entries(own)) if (!INGREDIENTS.some(b => b.id === id) && !del.has(id)) list.push({ ...i, id });
  return list.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Rezepte: eigene + eingebaute (sofern nicht geändert/ausgeblendet). */
export function effectiveRecipes(userRecipes = [], prefs = {}) {
  const hidden = new Set(prefs.hiddenRecipes || []), own = new Set(userRecipes.map(r => r.id));
  return [
    ...RECIPES.filter(r => !hidden.has(r.id) && !own.has(r.id)).map(r => ({ ...r, builtin: true, items: r.lines.map(text => ({ text })) })),
    ...userRecipes.filter(r => !hidden.has(r.id))
  ];
}

/** Beste passende Zutat für einen Namen; null wenn nichts Überzeugendes passt. */
export function matchIngredient(name, ings) {
  const q = norm(name); if (!q) return null;
  const qs = stemAll(q), qWords = new Set(qs.split(" "));
  let best = null, bestScore = 0;
  for (const ing of ings) {
    for (const cand of [ing.name, ...(ing.aliases || [])]) {
      const c = norm(cand), cs = stemAll(c);
      let score = 0;
      if (c === q) score = 100;
      else if (cs === qs) score = 95;
      else if ((" " + qs + " ").includes(" " + cs + " ")) score = 70 + Math.min(cs.length, 20);
      else if (qs.length >= 4 && (" " + cs + " ").includes(" " + qs + " ")) score = 65;
      else if (qs.includes(cs) && cs.length >= 4) score = 60 + Math.min(cs.length, 15) / 2;
      else {
        const cw = cs.split(" "), hit = cw.filter(w => w.length > 2 && qWords.has(w)).length;
        if (hit) score = 40 + 20 * hit / Math.max(cw.length, qWords.size);
      }
      if (score > bestScore) { bestScore = score; best = ing; }
    }
  }
  return bestScore >= 55 ? best : null;
}

function parseAmount(s) {
  if (FRACTIONS[s] != null) return FRACTIONS[s];
  if (s.includes("/")) { const [a, b] = s.split("/").map(x => parseFloat(x)); return b ? a / b : null; }
  return parseFloat(s.replace(",", "."));
}

/** Eine Zeile zerlegen: { text, amount, unit, name } */
export function parseLine(line) {
  let s = String(line || "").trim().replace(/^[-•*·]\s*/, "").replace(/^ca\.?\s*/i, "");
  const text = s;
  let amount = null, unit = null;
  const m = s.match(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*/);
  if (m) { amount = parseAmount(m[1].replace(/\s/g, "")); s = s.slice(m[0].length); }
  const u = s.match(/^([A-Za-zÄÖÜäöüß]+)\.?(?=\s|$)/);
  if (u && UNIT_ALIASES[u[1].toLowerCase()]) { unit = UNIT_ALIASES[u[1].toLowerCase()]; s = s.slice(u[0].length); }
  const name = s.replace(/^(von|vom|der|die|das)\s+/i, "").split(",")[0].trim();
  return { text, amount, unit, name };
}

/** Gramm für Menge + Einheit bei dieser Zutat */
export function toGrams(amount, unit, ing) {
  if (amount == null || !isFinite(amount)) return 0;
  const density = ing?.density || 1;
  switch (unit) {
    case "g": return amount;
    case "kg": return amount * 1000;
    case "ml": return amount * density;
    case "cl": return amount * 10 * density;
    case "l": return amount * 1000 * density;
    case null: case undefined: return amount * (ing?.units?.Stück ?? DEFAULT_UNIT_G.Stück);
    default: return amount * (ing?.units?.[unit] ?? DEFAULT_UNIT_G[unit] ?? 100);
  }
}

/** Zeile → Zutat + Gramm. forcedId: vom Nutzer gewählte Zutat */
export function resolveLine(line, ings, forcedId) {
  const p = parseLine(line);
  const ing = forcedId ? ings.find(i => i.id === forcedId) || null : matchIngredient(p.name, ings);
  return { ...p, ingId: ing?.id || null, ing, grams: ing ? Math.round(toGrams(p.amount, p.unit, ing) * 10) / 10 : 0 };
}

/** Nährwerte, Kosten und Kennzahlen eines Rezepts. servings überschreibt die Portionenzahl. */
export function analyze(recipe, ings) {
  const byId = Object.fromEntries(ings.map(i => [i.id, i]));
  const items = (recipe.items || []).map(it => {
    const r = it.ingId && byId[it.ingId] ? { ...parseLine(it.text), ingId: it.ingId, ing: byId[it.ingId], grams: it.grams ?? toGrams(parseLine(it.text).amount, parseLine(it.text).unit, byId[it.ingId]) }
      : resolveLine(it.text, ings);
    return { ...it, ...r };
  });
  const t = { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
  let unknown = 0;
  for (const it of items) {
    if (!it.ing) { if (it.amount != null) unknown++; continue; }
    const f = it.grams / 100;
    t.grams += it.grams; t.kcal += f * it.ing.kcal; t.protein += f * it.ing.protein; t.carbs += f * it.ing.carbs; t.fat += f * it.ing.fat;
    t.cost += it.grams / 1000 * (it.ing.price || 0);
  }
  const n = Math.max(1, Number(recipe.servings) || 1);
  const per = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / n]));
  const diets = items.filter(i => i.ing).map(i => i.ing.diet);
  const diet = diets.some(d => d === "fleisch") ? "fleisch" : diets.some(d => d === "fisch") ? "fisch" : diets.every(d => d === "vegan") ? "vegan" : "vegetarisch";
  return {
    items, total: t, per, unknown, diet,
    proteinPerEuro: t.cost > 0 ? t.protein / t.cost : 0,
    proteinPer100g: t.grams > 0 ? t.protein / t.grams * 100 : 0
  };
}

export const proteinPerEuroIng = ing => (ing.price > 0 ? ing.protein * 10 / ing.price : 0);
