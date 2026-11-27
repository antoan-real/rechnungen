// Prüft schach.html ohne Browser: Perft-Test der Zuggenerierung und Legalität aller Varianten und Musterpartien.
// Aufruf: node scripts/schach-check.js
import { readFileSync } from "fs";
const html = readFileSync(new URL("../schach.html", import.meta.url), "utf8");
const part = (a, b) => html.slice(html.indexOf(a), html.indexOf(b) + b.length);
const code = [part("/*ENGINE-START*/", "/*ENGINE-END*/"), part("/*CONTENT-START*/", "/*CONTENT-END*/"),
  html.slice(html.indexOf("function tbSolve("), html.indexOf("/* ---------- Endspieltrainer")),
  "return { Chess, Engine, COURSES, MUSTERPARTIEN, TAKTIK, ENDSPIEL_KURS, tbSolve };"].join("\n");
const { Chess, Engine, COURSES, MUSTERPARTIEN, TAKTIK, ENDSPIEL_KURS, tbSolve } = new Function(code)();

let fails = 0;
const perft = (p, d) => d ? Chess.legalMoves(p).reduce((n, m) => n + perft(Chess.make(p, m), d - 1), 0) : 1;
for (const [fen, exp] of [
  [Chess.START, [20, 400, 8902]],
  ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039]],
  ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812]],
  ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467]],
  ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486]]
]) exp.forEach((e, i) => { const n = perft(Chess.fromFEN(fen), i + 1); if (n !== e) { fails++; console.log(`Perft FEHLER ${fen} Tiefe ${i + 1}: ${n} statt ${e}`); } });

let lines = 0;
for (const c of [...COURSES, ENDSPIEL_KURS]) for (const l of c.lines) {
  lines++;
  const r = Chess.parsePgn(l.pgn);
  if (r.error || !r.moves.length) { fails++; console.log(`FEHLER ${c.id}/${l.key}:`, r.error || "keine Züge"); }
}
for (const [k, g] of Object.entries(MUSTERPARTIEN)) { const r = Chess.parsePgn(g.pgn); if (r.error) { fails++; console.log(`FEHLER Partie ${k}:`, r.error); } }
// Taktikaufgaben: Lösung und Alternativen legal, Mattaufgaben enden wirklich mit Matt, keine doppelten Stellungen
const fens = new Set();
for (const t of TAKTIK) {
  let p; try { p = Chess.fromFEN(t.fen); } catch (e) { fails++; console.log(`FEHLER Aufgabe ${t.id}: FEN`, e.message); continue; }
  if (fens.has(t.fen)) { fails++; console.log(`FEHLER Aufgabe ${t.id}: doppelt`); } fens.add(t.fen);
  const start = p;
  for (const [i, u] of t.line.entries()) {
    const m = Chess.legalMoves(p).find(x => Chess.uci(x) === u);
    if (!m) { fails++; console.log(`FEHLER Aufgabe ${t.id}: Zug ${i + 1} (${u}) nicht legal`); break; }
    for (const a of t.alts.filter(a => a.ply === i)) if (!Chess.legalMoves(p).some(x => Chess.uci(x) === a.uci)) { fails++; console.log(`FEHLER Aufgabe ${t.id}: Alternative ${a.uci} nicht legal`); }
    p = Chess.make(p, m);
  }
  if (t.san[t.san.length - 1].endsWith("#") && (Chess.legalMoves(p).length || !Chess.inCheck(p))) { fails++; console.log(`FEHLER Aufgabe ${t.id}: kein Matt am Ende`); }
  if (t.line.length % 2 === 0) { fails++; console.log(`FEHLER Aufgabe ${t.id}: Lösung muss mit eigenem Zug enden`); }
}
console.log(`${TAKTIK.length} Taktikaufgaben geprüft`);
// Endspiel-Datenbanken gegen bekannte Werte prüfen: KDK längstes Matt 10 Züge, KTK 16 Züge, KBK 124 960 Gewinnstellungen (Weiß am Zug)
{
  const stat = V => { let mx = 0, w = 0; for (let i = 0; i < V.length; i += 2) if (V[i] > 0) { w++; mx = Math.max(mx, V[i]); } return { mx: Math.ceil((mx - 1) / 2), w }; };
  const Q = tbSolve("Q"), R = tbSolve("R"), P = tbSolve("P", [Q, R]);
  const q = stat(Q), r = stat(R), p = stat(P);
  if (q.mx !== 10) { fails++; console.log("FEHLER KDK: längstes Matt", q.mx); }
  if (r.mx !== 16) { fails++; console.log("FEHLER KTK: längstes Matt", r.mx); }
  if (p.w !== 124960) { fails++; console.log("FEHLER KBK: Gewinnstellungen", p.w); }
  console.log(`Endspiel-Datenbanken: KDK max. ${q.mx} Züge, KTK max. ${r.mx} Züge, KBK ${p.w} Gewinnstellungen`);
}
console.log(`${lines} Varianten, ${Object.keys(MUSTERPARTIEN).length} Musterpartien geprüft – ${fails ? fails + " Fehler" : "alles legal, Perft korrekt"}`);
process.exit(fails ? 1 : 0);
