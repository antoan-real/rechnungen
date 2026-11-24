// Prüft schach.html ohne Browser: Perft-Test der Zuggenerierung und Legalität aller Varianten und Musterpartien.
// Aufruf: node scripts/schach-check.js
import { readFileSync } from "fs";
const html = readFileSync(new URL("../schach.html", import.meta.url), "utf8");
const part = (a, b) => html.slice(html.indexOf(a), html.indexOf(b) + b.length);
const code = part("/*ENGINE-START*/", "/*ENGINE-END*/") + "\n" + part("/*CONTENT-START*/", "/*CONTENT-END*/") + "\nreturn { Chess, COURSES, MUSTERPARTIEN };";
const { Chess, COURSES, MUSTERPARTIEN } = new Function(code)();

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
for (const c of COURSES) for (const l of c.lines) {
  lines++;
  const r = Chess.parsePgn(l.pgn);
  if (r.error || !r.moves.length) { fails++; console.log(`FEHLER ${c.id}/${l.key}:`, r.error || "keine Züge"); }
}
for (const [k, g] of Object.entries(MUSTERPARTIEN)) { const r = Chess.parsePgn(g.pgn); if (r.error) { fails++; console.log(`FEHLER Partie ${k}:`, r.error); } }
console.log(`${lines} Varianten, ${Object.keys(MUSTERPARTIEN).length} Musterpartien geprüft – ${fails ? fails + " Fehler" : "alles legal, Perft korrekt"}`);
process.exit(fails ? 1 : 0);
