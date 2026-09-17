/* =============================================================================
   game.js - run state, RNG, prediction resolution, transactions, save bridge.
   GDD v2.3 sections 4, 5, 8, 9, 10, 22, 24.2.
   ============================================================================= */
(function (w) {
"use strict";
const C = w.CONFIG;
const SUITS = ["♠", "♥", "♦", "♣"];
const FACE = {11:"J", 12:"Q", 13:"K", 14:"A"};

/* ---------------------------------------------------------------- random ---
   Rejection sampling so the modulo cannot skew the low ranks. Card generation
   reads the RNG and nothing else - not balance, not history, not the wager,
   not cosmetics, not boosters. GDD 5.1. */
function randInt(n) {
  const c = w.crypto || w.msCrypto;
  if (c && c.getRandomValues) {
    const limit = Math.floor(256 / n) * n, b = new Uint8Array(1);
    for (let guard = 0; guard < 64; guard++) {
      c.getRandomValues(b);
      if (b[0] < limit) return b[0] % n;
    }
  }
  return Math.floor(Math.random() * n);            // compatibility fallback
}

/* Deterministic PRNG for fixed replays (Daily / Friend). GDD 5.4. */
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fixedDeck(seed, count) {
  const rnd = mulberry32(hashSeed(String(seed))), out = [];
  for (let i = 0; i < count; i++) {
    out.push({rank: Math.floor(rnd() * 13) + 2, suit: Math.floor(rnd() * 4)});
  }
  return out;
}

/* A 0ms delay resolves inline instead of queueing a task, so the run loop can
   be stepped synchronously by the headless tests. */
function defer(fn, ms) { return ms > 0 ? setTimeout(fn, ms) : fn(); }

/* ------------------------------------------------------------- pure rules -- */
const pHigher = r => (14 - r) / 13;
const pLower  = r => (r - 2) / 13;
const multFor = s => s < 1 ? 0 : C.MULTIPLIERS[Math.min(s, C.MULTIPLIERS.length) - 1];
/* Round to the nearest micro-unit before flooring: 100 * 2.26 is 225.99999...
   in binary floating point, so a naive floor silently underpays a chip on 6 of
   the 150 wager/streak combinations. GDD 8.2 specifies floor(wager x mult). */
const cashFor = (wager, s) => Math.floor(Math.round(wager * multFor(s) * 1e6) / 1e6);
const rankName = L => (C.RANKS.find(r => L >= r.min) || {name:"Beginner"}).name;
const insureCost = out => Math.max(C.INSURANCE.min, Math.ceil(out * C.INSURANCE.rate));
const cardLabel = c => (FACE[c.rank] || c.rank) + SUITS[c.suit];
const isRed = c => c.suit === 1 || c.suit === 2;
const utcDay = (d) => (d || new Date()).toISOString().slice(0, 10);
function utcWeek(d) {                                    // ISO-ish week key, resets Monday
  const t = new Date(d || Date.now());
  const day = (t.getUTCDay() + 6) % 7;                   // Monday = 0
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
}
const utcMonth = () => new Date().toISOString().slice(0, 7);

/* ------------------------------------------------------------------ save --- */
function defaults() {
  return {
    v: 1, build: C.BUILD,
    chips: C.START_CHIPS, xp: 0, level: 1,
    name: "Player", skin: "neon",
    wager: C.WAGERS[0], mode: "rush",
    stats: {best:0, runs:0, correct:0, wrong:0, ties:0, predictions:0, maxBank:0, banked:0},
    achievements: {},
    inventory: Object.assign({}, C.START_BOOSTERS),
    loadout: {},                                   // boosters armed for the next run
    owned: {},                                     // cosmetics owned
    equipped: {},                                  // cosmetics equipped
    skins: {neon: true},
    missions: {day: "", picks: [], progress: {}, claimed: {}},
    login: {day: 0, last: ""},
    drop: 0, comeback: "", lastSeen: "",
    weekly: {week: "", calls: 0, badge: false, best: 0, settled: ""},
    season: {month: "", points: 0, claimed: []},
    board: null, league: null,
    personalBest: {}, challengeBest: {},
    settings: {sound: true, motion: true, haptics: true},
    history: []
  };
}
let save = defaults();

function load() {
  const base = defaults();
  try {
    const raw = JSON.parse(w.localStorage.getItem(C.SAVE_KEY) || "{}");
    save = Object.assign(base, raw);
    // Merge nested objects field-by-field so an old save gains new keys
    // instead of losing them to a shallow overwrite. GDD 22.2.
    ["stats","missions","login","weekly","season","settings"].forEach(k => {
      save[k] = Object.assign({}, base[k], raw[k] || {});
    });
    save.inventory = Object.assign({}, base.inventory, raw.inventory || {});
  } catch (e) { save = defaults(); }
  // Defaults are owned from the start, and every earned skin stays earned.
  for (const slot in C.COSMETICS) {
    C.COSMETICS[slot].forEach(item => {
      if (item.default) save.owned[slot + ":" + item.id] = true;
    });
    if (!save.equipped[slot]) {
      const d = C.COSMETICS[slot].find(i => i.default);
      if (d) save.equipped[slot] = d.id;
    }
  }
  C.SKINS.forEach(s => { if (s.level && save.level >= s.level) save.skins[s.id] = true; });
  // Older saves carry demo leaderboard rows; strip them so they never reappear.
  if (Array.isArray(save.board))  save.board  = save.board.filter(e => !e.demo);
  if (Array.isArray(save.league)) save.league = save.league.filter(e => !e.demo);
  return save;
}

let saveFailed = false;
function persist() {
  try { w.localStorage.setItem(C.SAVE_KEY, JSON.stringify(save)); saveFailed = false; }
  catch (e) {
    if (!saveFailed) { saveFailed = true; Game.emit("save_error", {message: String(e)}); }
  }
}

/* ---------------------------------------------------- chip transactions ----
   Every chip movement goes through here so telemetry sees a single ledger and
   nothing can move chips without a stated reason. GDD 20.1. */
function transact(amount, reason) {
  const before = save.chips;
  save.chips = Math.max(0, save.chips + amount);
  Game.emit("economy_transaction", {reason, amount, before, after: save.chips});
  return save.chips - before;
}

function grantXp(amount, reason) {
  if (run && run.boosters && run.boosters.xp2) amount *= 2;
  if (save.level >= C.MAX_LEVEL) return 0;
  save.xp += amount;
  Game.emit("xp_granted", {amount, reason, total: save.xp});
  while (save.level < C.MAX_LEVEL && save.xp >= C.xpToNext(save.level)) {
    save.xp -= C.xpToNext(save.level);
    save.level++;
    C.SKINS.forEach(s => {
      if (s.level && save.level >= s.level && !save.skins[s.id]) {
        save.skins[s.id] = true;
        Game.fire("unlock", {kind: "skin", name: s.name});
      }
    });
    Game.emit("level_up", {level: save.level, rank: rankName(save.level)});
    Game.fire("levelup", {level: save.level, rank: rankName(save.level)});
  }
  if (save.level >= C.MAX_LEVEL) save.xp = 0;
  checkAchievements();
  return amount;
}

/* --------------------------------------------------------- achievements ---- */
function unlock(id) {
  if (save.achievements[id]) return;
  const a = C.ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  save.achievements[id] = Date.now();
  Game.emit("achievement_unlocked", {id, name: a.name});
  Game.fire("achievement", a);
}
function checkAchievements() {
  const s = save.stats;
  if (s.runs && s.maxBank > 0) unlock("first");
  if (s.best >= 5) unlock("hot");
  if (s.best >= 10) unlock("untouch");
  if (s.maxBank >= 5000) unlock("big");
  if (s.runs >= 25) unlock("regular");
  if (save.level >= 10) unlock("risk");
  if (save.level >= 30 && C.SKINS.filter(x => x.level).every(x => save.skins[x.id])) unlock("skins");
  if (s.predictions >= 100) unlock("reader");
}

/* ------------------------------------------------------------- run state --- */
let run = null, busy = false, ticker = null, expired = false;

function modeOf(id) { return C.MODES[id] || C.MODES.classic; }

function start(modeId, wager, opts) {
  opts = opts || {};
  const mode = modeOf(modeId);
  wager = mode.wagered ? Math.min(wager || save.wager, save.chips) : 0;
  if (mode.wagered && wager < C.WAGERS[0]) { Game.fire("toast", {text:"Not enough chips", kind:"bad"}); return false; }

  // Fixed replays get a deterministic deck; normal runs draw live. GDD 5.4.
  let deck = null, seed = null;
  if (mode.fixed) {
    seed = opts.seed || ("daily-" + utcDay());
    // A friend's code only holds the cards THEY saw before their run ended.
    // Looping those (A,3,A,3...) makes the challenge trivially predictable, so
    // continue past them with the seed's own sequence - identical for everyone
    // who plays the same code.
    deck = (opts.cards || []).concat(fixedDeck(seed, C.CHALLENGE.maxCards))
                             .slice(0, C.CHALLENGE.maxCards);
  }

  const boosters = mode.boosters ? Object.assign({}, save.loadout) : {};
  if (mode.boosters) {
    for (const k in boosters) {
      if (boosters[k] && (save.inventory[k] || 0) > 0) save.inventory[k]--;
      else delete boosters[k];
    }
    save.loadout = {};
    if (Object.keys(boosters).length) Game.emit("boosters_consumed", {boosters: Object.keys(boosters)});
  }

  if (mode.wagered) { save.wager = wager; transact(-wager, "run_entry"); }
  if (!mode.fixed) save.mode = modeId;      // a challenge is not a remembered mode

  run = {
    mode: modeId, wager, seed, deck, deckAt: 0,
    card: deck ? deck[0] : drawLive(), streak: 0, best: 0, correct: 0, perfect: 0,
    lower: 0, ties: 0, banked: 0, spent: wager, xp: 0,
    shield: !!boosters.shield, boosters, chests: {}, trace: [], cards: [],
    extraUsed: false, startedAt: Date.now(), settled: false,
    target: opts.target || null           // the friend being chased, if any
  };
  if (deck) run.deckAt = 1;
  run.cards.push(run.card);

  busy = false; expired = false;
  Game.emit("run_started", {mode: modeId, wager, seed, card: cardLabel(run.card), boosters: Object.keys(boosters)});
  Game.fire("runstart", snapshot());
  startTimer(mode.total || mode.perCall);
  persist();
  return true;
}

function drawLive() { return {rank: randInt(13) + 2, suit: randInt(4)}; }
function nextCard() {
  if (run.deck) {
    return run.deck[run.deckAt++] || null;  // null = deck exhausted, never wraps
  }
  return drawLive();
}

/* ------------------------------------------------------------- timers ------ */
function startTimer(span) {
  clearInterval(ticker);
  if (!span) { Game.fire("timer", {span: 0}); return; }
  run.span = span; run.left = span;
  ticker = setInterval(() => {
    run.left -= 0.1;
    Game.fire("timer", {span: run.span, left: Math.max(0, run.left)});
    if (run.left <= 0) {
      clearInterval(ticker);
      // An accepted reveal always finishes before the clock settles, so a
      // submitted decision is never discarded mid-animation. GDD 6.2.
      if (busy) expired = true; else timeUp();
    }
  }, 100);
}
function restartPerCall() {
  const m = modeOf(run.mode);
  if (m.perCall) startTimer(m.perCall);
}
function timeUp() {
  const m = modeOf(run.mode);
  if (m.fixed) return finish("Challenge complete");
  if (run.streak >= 1) return cashOut(true);
  finish("Time up");
}
function addTime() {
  if (!run || !run.boosters.time || run.extraUsed || !run.span) return false;
  run.extraUsed = true;
  run.left += C.EXTRA_TIME;
  run.span += C.EXTRA_TIME;
  Game.emit("booster_used", {booster: "time", seconds: C.EXTRA_TIME});
  Game.fire("toast", {text: "+" + C.EXTRA_TIME + "s", kind: "good"});
  return true;
}

/* --------------------------------------------------------- the prediction -- */
function predict(dir) {
  if (!run || busy || run.settled) return false;
  const r = run.card.rank;
  if (dir === "hi" && pHigher(r) === 0) return false;     // Higher disabled on an Ace
  if (dir === "lo" && pLower(r) === 0) return false;      // Lower disabled on a 2
  busy = true;
  if (modeOf(run.mode).perCall) clearInterval(ticker);   // total clocks keep running

  const chance = dir === "hi" ? pHigher(r) : pLower(r);
  const perfect = chance < 6 / 13;                        // judged before the card exists
  const next = nextCard();                                // generated, then revealed
  if (!next) { busy = false; return finish("Challenge complete"); }
  run.trace.push({dir, t: Date.now() - run.startedAt});
  run.cards.push(next);

  Game.emit("prediction_selected", {dir, card: cardLabel(run.card), streak: run.streak, chance});
  Game.fire("reveal", {next, dir, skin: save.skin});
  defer(() => resolve(dir, next, perfect, r), C.REVEAL_MS);
  return true;
}

function resolve(dir, next, perfect, prevRank) {
  const m = modeOf(run.mode);
  run.card = next;
  save.stats.predictions++;
  let outcome;

  if (next.rank === prevRank) {                           // tie keeps the streak
    outcome = "tie";
    run.ties++; save.stats.ties++;
  } else if ((dir === "hi") === (next.rank > prevRank)) { // correct
    outcome = perfect ? "perfect" : "correct";
    run.streak++; run.correct++;
    if (dir === "lo") run.lower++;
    save.stats.correct++;
    if (run.streak > run.best) run.best = run.streak;
    if (run.streak > save.stats.best) save.stats.best = run.streak;

    let gain = C.XP.correct + (perfect ? C.XP.perfect : 0);
    if (perfect) run.perfect++;
    run.xp += grantXp(gain, "correct_call");

    const chest = C.CHESTS[run.streak];
    if (chest && !run.chests[run.streak]) {
      run.chests[run.streak] = true;
      run.xp += grantXp(chest.xp, "chest");
      Game.emit("chest_claimed", {streak: run.streak, xp: chest.xp});
      // Timed modes use a non-blocking notice so a modal cannot pause the clock.
      Game.fire("chest", {streak: run.streak, chest, blocking: !m.total && !m.perCall});
    }
  } else if (run.shield) {                                // protection absorbs it
    outcome = "protected";
    run.shield = false;
  } else if (m.fixed) {                                   // practice: reset, keep playing
    outcome = "reset";
    run.streak = 0;
    save.stats.wrong++;
  } else {                                                // normal run ends
    outcome = "loss";
    save.stats.wrong++;
    busy = false;                   // same ordering as the surviving branches
    Game.emit("prediction_resolved", {outcome, card: cardLabel(next), streak: run.streak});
    Game.fire("resolved", {outcome, next, streak: run.streak});
    persist();
    return defer(() => finish("Wrong call"), C.SETTLE_MS);
  }

  busy = false;                     // clear BEFORE notifying, or the UI repaints
  Game.emit("prediction_resolved", {outcome, card: cardLabel(next), streak: run.streak, perfect});
  Game.fire("resolved", {outcome, next, streak: run.streak, perfect});   // the controls as disabled
  persist();

  if (expired) return timeUp();
  // Auto Cash Out secures the run the moment it reaches the configured streak.
  if (run.boosters.auto && run.streak >= C.AUTO_CASHOUT_STREAK && m.wagered) return cashOut(true);
  restartPerCall();
}

/* ------------------------------------------------------------- insurance --- */
function buyInsurance() {
  if (!run || busy || run.settled) return false;
  const m = modeOf(run.mode);
  if (!m.wagered || run.shield || run.streak < 1) return false;
  const cost = insureCost(cashFor(run.wager, run.streak));
  if (save.chips < cost) { Game.fire("toast", {text:"Not enough chips", kind:"bad"}); return false; }
  transact(-cost, "insurance");
  run.spent += cost;
  run.shield = true;
  Game.emit("insurance_activated", {cost, streak: run.streak});
  Game.fire("toast", {text: "Protected for " + cost, kind: "good"});
  persist();
  return true;
}

/* ------------------------------------------------------- settle the run ---- */
function cashOut(auto) {
  if (!run || busy || run.settled || run.streak < 1) return false;
  const m = modeOf(run.mode);
  if (!m.wagered) return finish("Challenge complete");
  busy = true;
  clearInterval(ticker);
  const won = cashFor(run.wager, run.streak);
  run.banked = won;
  transact(won, "cash_out");
  save.stats.banked += won;
  if (won > save.stats.maxBank) save.stats.maxBank = won;
  run.xp += grantXp(C.XP.cashout, "cash_out");
  finish(auto ? "Time up · banked" : "Banked");
  return true;
}

function finish(tag) {
  if (!run || run.settled) return false;
  run.settled = true;
  busy = false;
  clearInterval(ticker);
  run.xp += grantXp(C.XP.finish, "run_finished");
  save.stats.runs++;

  const m = modeOf(run.mode);
  const result = {
    tag, mode: run.mode, wager: run.wager, streak: run.best, endStreak: run.streak,
    banked: run.banked, spent: run.spent, net: run.banked - run.spent, xp: run.xp,
    correct: run.correct, perfect: run.perfect, lower: run.lower, ties: run.ties,
    mult: multFor(run.streak), duration: Date.now() - run.startedAt,
    seed: run.seed, cards: run.cards, trace: run.trace, fixed: m.fixed, target: run.target
  };

  // Meta systems settle off the finished run: missions, pass, league, records.
  if (w.Hybrid) w.Hybrid.onRunComplete(result, save);
  checkAchievements();

  save.history.unshift({at: Date.now(), mode: run.mode, streak: result.streak, banked: run.banked});
  save.history = save.history.slice(0, 50);

  Game.emit("run_completed", result);
  Game.fire("runend", result);
  persist();
  run = null;
  return result;
}

function abandon() {
  if (!run || run.settled) return;
  Game.emit("run_abandoned", {mode: run.mode, streak: run.streak});
  run.settled = true;
  clearInterval(ticker);
  save.stats.runs++;
  if (w.Hybrid) w.Hybrid.onRunComplete({mode: run.mode, streak: run.best, banked: 0, spent: run.spent,
    correct: run.correct, perfect: run.perfect, lower: run.lower, xp: run.xp, abandoned: true}, save);
  persist();
  run = null;
}

/* ---------------------------------------------------------------- view ----- */
function snapshot() {
  if (!run) return null;
  const out = cashFor(run.wager, run.streak);
  const r = run.card.rank;
  return {
    mode: run.mode, wager: run.wager, streak: run.streak, card: run.card,
    mult: multFor(run.streak), cashout: out, shield: run.shield,
    insurance: insureCost(out), canInsure: modeOf(run.mode).wagered && !run.shield && run.streak >= 1
                && save.chips >= insureCost(out) && !busy,
    canCash: run.streak >= 1 && !busy && modeOf(run.mode).wagered,
    pHigher: pHigher(r), pLower: pLower(r), pTie: 1 / 13,
    canHigher: pHigher(r) > 0 && !busy, canLower: pLower(r) > 0 && !busy,
    capped: run.streak >= C.MULTIPLIERS.length,
    fixed: modeOf(run.mode).fixed, busy,
    boosters: run.boosters, extraUsed: run.extraUsed,
    correct: run.correct, best: run.best
  };
}

/* Quick Play: highest configured tier that is both within the cap and
   affordable; below the minimum wager it must not start a wagered run. GDD 6.1 */
function quickWager() {
  const fits = C.WAGERS.filter(x => x <= C.QUICKPLAY_MAX_WAGER && x <= save.chips);
  return fits.length ? Math.max.apply(null, fits) : C.WAGERS[0];
}
function quickMode() {
  const day = new Date().getUTCDay();
  const weekend = day === 0 || day === 6;
  let m = save.mode;
  if (m === "weekend" && !weekend) m = "rush";            // falls back off-weekend
  if (!C.MODES[m] || C.MODES[m].fixed) m = "rush";
  return m;
}

/* -------------------------------------------------------------- listeners -- */
const listeners = {};
const Game = {
  CONFIG: C, SUITS, FACE,
  load, persist, save: () => save, run: () => run, snapshot, busy: () => busy,
  start, predict, cashOut, buyInsurance, finish, abandon, addTime,
  transact, grantXp, unlock, checkAchievements,
  pHigher, pLower, multFor, cashFor, insureCost, rankName, cardLabel, isRed,
  utcDay, utcWeek, utcMonth, fixedDeck, hashSeed, mulberry32, randInt,
  quickWager, quickMode, modeOf,

  on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
  fire(evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) {} }); },
  emit(evt, data) { if (w.Telemetry) w.Telemetry.log(evt, data); }
};
w.Game = Game;
})(window);
