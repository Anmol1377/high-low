// Regenerates context/data from the live game code. Run: node context/export-data.js
const fs = require("fs"), path = require("path");
const GAME = path.join(__dirname, "..", "high-low-casino");
const OUT = path.join(__dirname, "data");
const store = {};
global.window = {localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v},
                 crypto: global.crypto, addEventListener() {}};
for (const f of ["config.js", "game.js", "hybrid-model.js"])
  new Function(fs.readFileSync(path.join(GAME, f), "utf8")).call(global.window);
const {CONFIG: C, Game: G} = global.window;

// config.json - functions don't serialize, so xpToNext becomes a formula string
const cfg = JSON.parse(JSON.stringify(C));
cfg.xpToNext = "80 + 28 * (level - 1)";
fs.writeFileSync(`${OUT}/config.json`, JSON.stringify(cfg, null, 2) + "\n");

// default-save.json - exactly what a brand-new player gets
fs.writeFileSync(`${OUT}/default-save.json`, JSON.stringify(G.load(), null, 2) + "\n");

// levels.csv
let total = 0, rows = ["level,total_xp,xp_to_next,rank"];
for (let L = 1; L <= C.MAX_LEVEL; L++) {
  rows.push(`${L},${total},${L < C.MAX_LEVEL ? C.xpToNext(L) : "max"},${G.rankName(L)}`);
  total += C.xpToNext(L);
}
fs.writeFileSync(`${OUT}/levels.csv`, rows.join("\n") + "\n");

// economy-curve.csv - reach probability from the real Markov chain
let d = {}; for (let r = 2; r <= 14; r++) d[r] = 1 / 13;
const win = r => { const o = []; if (14 - r >= r - 2) for (let s = r + 1; s <= 14; s++) o.push(s);
                   else for (let s = 2; s < r; s++) o.push(s); return o; };
let cum = 1; rows = ["streak,p_advance_this_call,p_reach,fair_multiplier,multiplier,ev_per_chip,chest_xp"];
C.MULTIPLIERS.forEach((m, i) => {
  let a = 0; for (let r = 2; r <= 14; r++) a += d[r] * Math.max(14 - r, r - 2) / 12;
  cum *= a;
  const nd = {}; for (let s = 2; s <= 14; s++) nd[s] = 0;
  for (let r = 2; r <= 14; r++) win(r).forEach(s => nd[s] += d[r] / 12);
  const t = Object.values(nd).reduce((x, y) => x + y); for (let s = 2; s <= 14; s++) d[s] = nd[s] / t;
  const n = i + 1;
  rows.push([n, a.toFixed(6), cum.toFixed(6), (1 / cum).toFixed(3), m.toFixed(2), (cum * m).toFixed(4),
             C.CHESTS[n] ? C.CHESTS[n].xp : ""].join(","));
});
fs.writeFileSync(`${OUT}/economy-curve.csv`, rows.join("\n") + "\n");
console.log("exported:", fs.readdirSync(OUT).join(", "));
