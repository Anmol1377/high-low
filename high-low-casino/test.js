/* test.js - headless checks for the rules and economy. Run: node test.js
   No framework: loads the real config/game/model against a stub browser and
   asserts the things that would silently rot if the curve or rules drifted. */
const fs = require("fs"), assert = require("assert");

const store = {};
global.window = {
  localStorage: {getItem: k => (k in store ? store[k] : null),
                 setItem: (k, v) => store[k] = String(v),
                 removeItem: k => delete store[k]},
  crypto: global.crypto, addEventListener(){}, setTimeout, clearTimeout
};
global.self = global.window;
for (const f of ["config.js","game.js","hybrid-model.js"]) new Function(fs.readFileSync(f,"utf8")).call(global.window);
const {CONFIG: C, Game: G, Hybrid: H} = global.window;
C.REVEAL_MS = C.SETTLE_MS = 0;      // resolve reveals inline so runs can be stepped

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log("  ✓ " + name); };

console.log("\nRULES");
ok("higher/lower/tie probabilities match GDD 5.2", () => {
  assert.strictEqual(G.pHigher(2), 12/13);  assert.strictEqual(G.pLower(2), 0);
  assert.strictEqual(G.pHigher(14), 0);     assert.strictEqual(G.pLower(14), 12/13);
  assert.strictEqual(G.pHigher(8), 6/13);   assert.strictEqual(G.pLower(8), 6/13);
});
ok("multiplier caps at streak 15 and holds past it", () => {
  const cap = C.MULTIPLIERS[C.MULTIPLIERS.length - 1];
  assert.strictEqual(G.multFor(15), cap);
  assert.strictEqual(G.multFor(40), cap);
  assert.strictEqual(G.multFor(0), 0);
});
ok("cash-out floors wager x multiplier", () => {
  assert.strictEqual(G.cashFor(10, 1), Math.floor(10 * C.MULTIPLIERS[0]));
  assert.strictEqual(G.cashFor(250, 5), Math.floor(250 * C.MULTIPLIERS[4]));
});
ok("insurance is max(5, ceil(15% of cash-out))", () => {
  assert.strictEqual(G.insureCost(12), 5);
  assert.strictEqual(G.insureCost(1000), 150);
});
ok("rank boundaries match GDD 10.2", () => {
  assert.strictEqual(G.rankName(1), "Beginner");   assert.strictEqual(G.rankName(4), "Beginner");
  assert.strictEqual(G.rankName(5), "Player");     assert.strictEqual(G.rankName(38), "Casino Master");
  assert.strictEqual(G.rankName(50), "Prediction Legend");
});
ok("level 50 needs 36,848 total XP (Appendix A)", () => {
  let t = 0; for (let L = 1; L < 50; L++) t += C.xpToNext(L);
  assert.strictEqual(t, 36848);
});
ok("RNG only ever yields legal cards", () => {
  for (let i = 0; i < 4000; i++) { const n = G.randInt(13) + 2; assert(n >= 2 && n <= 14); }
});
ok("fixed decks are deterministic per seed, and differ across seeds", () => {
  const a = G.fixedDeck("daily-2026-09-17", 40), b = G.fixedDeck("daily-2026-09-17", 40);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, G.fixedDeck("daily-2026-09-18", 40));
});

console.log("\nECONOMY (the thing that was broken in v2.2)");
/* Reach probability from the run's real Markov chain. A tie repeats the same
   rank, so it is a self-loop and conditions out: from rank r there are 12
   non-tie outcomes, max(14-r, r-2) of which advance. Winning from an extreme
   card lands back in the middle, so P(advance) is 10/13 on the FIRST call only
   and settles at ~0.7389 - which is what the curve must be solved against. */
function reachProbs(depth) {
  const R = [], win = r => (14 - r >= r - 2) ? range(r + 1, 14) : range(2, r - 1);
  function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
  let d = {}; for (let r = 2; r <= 14; r++) d[r] = 1 / 13;
  let cum = 1;
  for (let n = 0; n < depth; n++) {
    let a = 0;
    for (let r = 2; r <= 14; r++) a += d[r] * Math.max(14 - r, r - 2) / 12;
    cum *= a; R.push(cum);
    const nd = {}; for (let s = 2; s <= 14; s++) nd[s] = 0;
    for (let r = 2; r <= 14; r++) win(r).forEach(s => nd[s] += d[r] / 12);
    const tot = Object.values(nd).reduce((x, y) => x + y, 0);
    for (let s = 2; s <= 14; s++) d[s] = nd[s] / tot;
  }
  return R;
}
const REACH = reachProbs(C.MULTIPLIERS.length);
ok("P(advance) is 10/13 on the first call, then settles near 0.7389", () => {
  assert(Math.abs(REACH[0] - 10/13) < 1e-12);
  assert(Math.abs(REACH[14] / REACH[13] - 0.738930) < 1e-5);
});
ok("every stopping point keeps a house edge (EV < 1.0)", () => {
  C.MULTIPLIERS.forEach((m, i) => {
    const ev = REACH[i] * m;
    assert(ev < 1.0, `streak ${i+1} is player-positive at ${ev.toFixed(3)}`);
  });
});
ok("no stopping point dominates (EV spread within 4 points)", () => {
  const evs = C.MULTIPLIERS.map((m, i) => REACH[i] * m);
  assert(Math.max(...evs) - Math.min(...evs) <= 0.04,
    `spread ${(Math.max(...evs) - Math.min(...evs)).toFixed(3)}`);
});
ok("curve is strictly increasing", () => {
  for (let i = 1; i < C.MULTIPLIERS.length; i++) assert(C.MULTIPLIERS[i] > C.MULTIPLIERS[i-1]);
});
ok("chests pay XP only - no chips, no keys", () => {
  Object.values(C.CHESTS).forEach(c => {
    assert(c.xp > 0); assert(c.chips === undefined); assert(c.keys === undefined);
  });
});

console.log("\nMETA SYSTEMS");
const save = G.load();
ok("a fresh save starts with the configured chips and defaults owned", () => {
  assert.strictEqual(save.chips, C.START_CHIPS);
  assert.strictEqual(save.owned["avatar:fox"], true);
  assert.strictEqual(save.equipped.avatar, "fox");
});
ok("daily missions are deterministic per UTC day and distinct", () => {
  const a = H.missionList(save).map(m => m.id);
  save.missions.day = "";
  const b = H.missionList(save).map(m => m.id);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(new Set(a).size, C.MISSIONS_PER_DAY);
});
ok("packs never grant a duplicate and stop when the album is done", () => {
  save.inventory.key = 99;
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const item = H.openPack(save);
    if (!item) break;
    const k = item.slot + ":" + item.id;
    assert(!seen.has(k), "duplicate " + k); seen.add(k);
  }
  assert.strictEqual(H.unowned(save).length, 0);
  assert(save.inventory.key > 0, "leftover key must be retained");
});
ok("HL1 challenge codes round-trip", () => {
  const cards = G.fixedDeck("seed-x", 30);
  const code = H.encodeChallenge(save, {seed:"seed-x", correct:0, cards,
                                        trace:[{dir:"hi",t:100},{dir:"lo",t:400}]});
  const back = H.decodeChallenge(code);
  assert.strictEqual(back.seed, "seed-x");
  assert.deepStrictEqual(back.cards, cards);
  assert.strictEqual(back.trace[1].dir, "lo");
});
ok("challenge score is rebuilt from the calls, not trusted from the code", () => {
  // A(14) -> 3 lower = correct; 3 -> 3 tie = not counted; 3 -> 9 higher = correct
  const cards = [{rank:14,suit:0},{rank:3,suit:1},{rank:3,suit:2},{rank:9,suit:0}];
  const trace = [{dir:"lo",t:500},{dir:"hi",t:900},{dir:"hi",t:1400}];
  const back = H.decodeChallenge(H.encodeChallenge(save, {seed:"s", correct:99, cards, trace}));
  assert.strictEqual(back.score, 2, "claimed 99, the calls only earn 2");
  assert.deepStrictEqual(back.ghost, [500, 1400]);
});
ok("a short challenge deck continues instead of looping, identically for everyone", () => {
  C.REVEAL_MS = C.SETTLE_MS = 0;
  const recorded = [{rank:14,suit:1},{rank:3,suit:1}];      // the A,3 code that looped
  const deal = () => {
    G.start("friend", 0, {seed:"run-1", cards: recorded});
    const seen = [G.snapshot().card];
    for (let i = 0; i < 12; i++) {
      const s = G.snapshot(); if (!s) break;
      G.predict(s.pHigher >= s.pLower ? "hi" : "lo");      // friend mode never ends on a miss
      if (G.snapshot()) seen.push(G.snapshot().card);
    }
    G.finish("t");
    return seen.map(G.cardLabel);
  };
  const a = deal(), b = deal();
  assert.deepStrictEqual(a.slice(0, 2), ["A\u2665", "3\u2665"], "recorded cards come first");
  assert.deepStrictEqual(a, b, "two players on one code must get the same cards");
  const expected = G.fixedDeck("run-1", 11).map(G.cardLabel);
  assert.deepStrictEqual(a.slice(2), expected, "continuation is the seed's own sequence");
});
ok("a finished challenge is not remembered as the next mode", () => {
  save.mode = "rush";
  G.start("friend", 0, {seed:"x"}); G.finish("t");
  G.start("daily", 0, {}); G.finish("t");
  assert.strictEqual(save.mode, "rush");
});
ok("malformed or tampered challenge codes are rejected", () => {
  ["", "nope", "HL2.abc", "HL1.!!!!", "HL1." + Buffer.from('{"v":"HL1","k":[999]}').toString("base64")]
    .forEach(bad => assert.strictEqual(H.decodeChallenge(bad), null, "accepted " + bad));
});
ok("league tier thresholds match GDD 15.2", () => {
  assert.strictEqual(H.leagueOf(0).name,   "Bronze");
  assert.strictEqual(H.leagueOf(19).name,  "Bronze");
  assert.strictEqual(H.leagueOf(20).name,  "Silver");
  assert.strictEqual(H.leagueOf(50).name,  "Gold");
  assert.strictEqual(H.leagueOf(100).name, "Diamond");
});

console.log("\nLIVE RUNS (10,000 simulated, optimal play, cash out at streak 5)");
let banked = 0, staked = 0, runs = 0;
for (let i = 0; i < 10000; i++) {
  save.chips = 1e9;
  if (!G.start("classic", 100)) break;
  staked += 100; runs++;
  let guard = 0;
  while (G.run() && !G.run().settled && guard++ < 200) {
    const s = G.snapshot();
    if (!s) break;
    if (s.streak >= 5) { const before = save.chips; G.cashOut(false); banked += save.chips - before; break; }
    G.predict(s.pHigher >= s.pLower ? "hi" : "lo");
  }
  if (G.run()) G.finish("test");
}
ok(runs === 10000 && `${runs} runs completed without a stuck state`, () => assert.strictEqual(runs, 10000));
const rtp = banked / staked;
console.log(`  → return to player: ${(rtp * 100).toFixed(1)}%  (designed ~95%, chance ±2%)`);
ok("measured RTP lands near the designed house edge", () => {
  assert(rtp > 0.92 && rtp < 0.98, "RTP " + rtp.toFixed(3) + " is off the designed curve");
});


/* ---- regressions found by actually playing the build ---- */
console.log("REGRESSIONS");
C.REVEAL_MS = C.SETTLE_MS = 0;

ok("controls are re-enabled by the time 'resolved' fires, on every outcome", () => {
  const seen = {};
  G.on("resolved", e => {
    const s = G.snapshot();
    seen[e.outcome] = (seen[e.outcome] || 0) + 1;
    // On a terminal loss the run is already gone, so there is nothing to repaint.
    assert(!s || s.busy === false, "UI repainted while still busy on " + e.outcome);
  });
  for (let i = 0; i < 400; i++) {
    save.chips = 1e6;
    G.start("classic", 100);
    let guard = 0;
    while (G.run() && !G.run().settled && guard++ < 30) {
      const s = G.snapshot(); if (!s) break;
      G.predict(s.pHigher >= s.pLower ? "hi" : "lo");
    }
    if (G.run()) G.finish("t");
  }
  assert(seen.correct > 0 && seen.loss > 0, "did not exercise both outcomes");
});

ok("cash-out never loses a chip to floating point", () => {
  C.WAGERS.forEach(w => C.MULTIPLIERS.forEach((m, i) => {
    const exact = Math.floor(Math.round(w * m * 1e6) / 1e6);
    assert.strictEqual(G.cashFor(w, i + 1), exact, `${w} x ${m}`);
  }));
  assert.strictEqual(G.cashFor(100, 3), 226);      // the case that was underpaying
});

ok("no demo rows: fresh boards start empty, old saves are cleaned on load", () => {
  store[C.SAVE_KEY] = JSON.stringify({board: [{name:"Vega", streak:12, banked:22000, at:1, demo:true},
                                              {name:"Me", streak:3, banked:200, at:5, you:true}],
                                      league: [{name:"Koi", score:31, demo:true}]});
  const s = G.load();
  assert.deepStrictEqual(s.board.map(e => e.name), ["Me"]);
  assert.strictEqual(s.league.length, 0);
  delete store[C.SAVE_KEY];
  assert.deepStrictEqual(H.board(G.load()), []);
  assert.strictEqual(C.TEST_CHIPS, undefined);
});

ok("weekly placement pays only against real rivals, and only once", () => {
  const s = G.load();
  const settle = league => {
    s.weekly = {week: "2020-01-06", calls: 30, badge: false, best: 4, settled: ""};
    s.league = league;
    const before = s.chips;
    H.weekState(s);                               // new week -> settles the old one
    return s.chips - before;
  };
  assert.strictEqual(settle([{name: s.name, score: 30, you: true}]), 0, "paid first place with no rivals");
  const paid = settle([{name: s.name, score: 30, you: true}, {name: "Rival", score: 10}]);
  assert.strictEqual(paid, C.PLACEMENT_REWARDS[0].chips, "did not pay first place against a rival");
  const again = s.chips; H.weekState(s);
  assert.strictEqual(s.chips, again, "same week settled twice");
});

/* This last one needs real elapsed time. The bug was that predict() cleared the
   interval outright, so the proof is that ticks keep arriving AFTER a
   prediction. A losing call ends the run, so retry until one survives -
   otherwise the test passes or fails on the RNG rather than on the clock. */
(async function timerTest() {
  let ticks = 0;
  G.on("timer", () => ticks++);
  let live = false;
  for (let attempt = 0; attempt < 60 && !live; attempt++) {
    save.chips = 1e6;
    G.start("rush", 100);                          // 30s TOTAL, not per call
    const s = G.snapshot();
    G.predict(s.pHigher >= s.pLower ? "hi" : "lo");
    const r = G.run();
    if (r && !r.settled) live = true;              // survived - now watch the clock
    else if (r) G.finish("t");
  }
  assert(live, "no surviving prediction in 60 attempts");
  assert.strictEqual(C.MODES.rush.perCall, 0, "rush must be a total clock");

  const before = ticks, left = G.run().left;
  await new Promise(r => setTimeout(r, 350));
  assert(ticks > before, "clock stopped after a prediction (interval was cleared)");
  assert(G.run().left < left, "clock is firing but not counting down");
  G.finish("t");
  pass++;
  console.log("  \u2713 a total-mode clock keeps running across a prediction");
  console.log(`\n${pass} checks passed.\n`);
  process.exit(0);                                  // stop the 30s interval
})();
