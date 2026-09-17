/* =============================================================================
   hybrid-model.js - calendar systems, cosmetics, boosters, season, league,
   leaderboard and the HL1 challenge codec. GDD v2.3 sections 12-16, 20.
   Every date here comes from the device clock; that is fine offline and must
   move to server time before any reward carries competitive value (GDD 29).
   ============================================================================= */
(function (w) {
"use strict";
const C = w.CONFIG, G = () => w.Game;

function fire(evt, data) { if (w.Game) w.Game.fire(evt, data); }
function emit(evt, data) { if (w.Telemetry) w.Telemetry.log(evt, data); }

/* ------------------------------------------------------------- missions ----
   Three distinct missions per UTC day, chosen deterministically so every
   device shows the same set on the same date. GDD 12.1. */
function rollMissions(save) {
  const day = w.Game.utcDay();
  if (save.missions.day === day && save.missions.picks.length) return save.missions;
  const rnd = w.Game.mulberry32(w.Game.hashSeed("missions-" + day));
  const pool = C.MISSIONS.slice();
  const picks = [];
  while (picks.length < C.MISSIONS_PER_DAY && pool.length) {
    picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
  }
  save.missions = {day, picks, progress: {}, claimed: {}};
  return save.missions;
}
function missionList(save) {
  rollMissions(save);
  return save.missions.picks.map(id => {
    const def = C.MISSIONS.find(m => m.id === id);
    const at = save.missions.progress[id] || 0;
    return Object.assign({}, def, {
      at: Math.min(at, def.target),
      done: at >= def.target,
      claimed: !!save.missions.claimed[id]
    });
  });
}
function bumpMissions(save, result) {
  rollMissions(save);
  const doubled = result.boosters && result.boosters.mission;
  save.missions.picks.forEach(id => {
    const def = C.MISSIONS.find(m => m.id === id);
    if (!def || save.missions.claimed[id]) return;
    const cur = save.missions.progress[id] || 0;
    let add = 0, absolute = false;

    switch (def.metric) {
      case "runs":      add = 1; break;
      case "correct":   add = result.correct || 0; break;
      case "perfect":   add = result.perfect || 0; break;
      case "lower":     add = result.lower || 0; break;
      case "banked":    add = result.banked || 0; break;
      case "maxStreak": absolute = true; break;           // records a high-water mark
    }
    // The mission booster doubles additive progress only - a maximum-streak
    // objective records the highest value reached, so doubling is meaningless.
    if (!absolute) {
      if (doubled) add *= 2;
      save.missions.progress[id] = cur + add;
    } else {
      save.missions.progress[id] = Math.max(cur, result.streak || 0);
    }

    const now = save.missions.progress[id];
    if (add || absolute) emit("mission_progress", {id, at: now, target: def.target});
    if (now >= def.target && !save.missions.claimed[id]) {
      save.missions.claimed[id] = true;                   // pays once, automatically
      w.Game.transact(def.chips, "mission");
      w.Game.grantXp(def.xp, "mission");
      emit("mission_completed", {id, chips: def.chips, xp: def.xp});
      fire("toast", {text: "Mission complete · +" + def.chips, kind: "gold"});
    }
  });
}

/* --------------------------------------------------------- login journey ---
   One reward per UTC date. Consecutive days advance it; a gap restarts at
   day one. GDD 13.1. */
function loginState(save) {
  const today = w.Game.utcDay();
  const claimed = save.login.last === today;
  let day = save.login.day;
  if (!claimed) {
    const yday = w.Game.utcDay(new Date(Date.now() - 864e5));
    day = (save.login.last === yday) ? save.login.day : 0;   // gap restarts the journey
    if (day >= C.LOGIN_JOURNEY.length) day = 0;
  }
  return {claimed, day, reward: C.LOGIN_JOURNEY[Math.min(day, C.LOGIN_JOURNEY.length - 1)]};
}
function claimLogin(save) {
  const st = loginState(save);
  if (st.claimed) return false;
  const r = C.LOGIN_JOURNEY[st.day];
  w.Game.transact(r.chips, "login_reward");
  save.inventory.key = (save.inventory.key || 0) + r.keys;
  if (r.booster) save.inventory[r.booster] = (save.inventory[r.booster] || 0) + 1;
  save.login = {day: st.day + 1, last: w.Game.utcDay()};
  emit("login_reward", {day: st.day + 1, chips: r.chips, keys: r.keys});
  fire("toast", {text: "Day " + (st.day + 1) + " · +" + r.chips + " chips", kind: "gold"});
  w.Game.persist();
  return r;
}

/* ------------------------------------------------- daily drop + comeback --- */
function dropReady(save) {
  // Also unlocks under the minimum wager so the game can never dead-end with
  // an unplayable balance - the guard GDD 6.1 requires.
  return save.chips < C.WAGERS[0] || Date.now() - (save.drop || 0) > C.DAILY_DROP_MS;
}
function claimDrop(save) {
  if (!dropReady(save)) return false;
  save.drop = Date.now();
  w.Game.transact(C.DAILY_DROP, "daily_drop");
  fire("toast", {text: "+" + C.DAILY_DROP + " chips", kind: "gold"});
  w.Game.persist();
  return true;
}
function checkComeback(save) {
  const today = w.Game.utcDay();
  const last = save.lastSeen;
  save.lastSeen = today;
  if (!last || last === today) { w.Game.persist(); return false; }
  const gap = Math.round((Date.parse(today) - Date.parse(last)) / 864e5);
  if (gap < C.COMEBACK.days || save.comeback === today) { w.Game.persist(); return false; }
  save.comeback = today;
  w.Game.transact(C.COMEBACK.chips, "comeback");
  save.inventory.key = (save.inventory.key || 0) + C.COMEBACK.keys;
  emit("comeback_reward", {gap, chips: C.COMEBACK.chips});
  fire("toast", {text: "Welcome back · +" + C.COMEBACK.chips, kind: "gold"});
  w.Game.persist();
  return {gap, chips: C.COMEBACK.chips};
}

/* ------------------------------------------------------ weekly + league ---- */
function weekState(save) {
  const week = w.Game.utcWeek();
  if (save.weekly.week !== week) {
    settleWeek(save, week);
  }
  return save.weekly;
}
function settleWeek(save, week) {
  // Settles once on the first visit after a new UTC week begins. Placement is
  // ranked on the single combined board; the league tier is a display badge.
  const prev = save.weekly;
  if (prev.week && prev.settled !== prev.week && prev.best > 0) {
    const board = (save.league || []).slice().sort((a, b) => b.score - a.score);
    const place = board.findIndex(e => e.you);
    // Placement only means something against other players. A local save has
    // no one else on the board, so paying it would hand out first place every
    // week for free. It switches on once a backend supplies real opponents.
    const rivals = board.some(e => !e.you);
    if (rivals && place >= 0 && place < C.PLACEMENT_REWARDS.length) {
      const r = C.PLACEMENT_REWARDS[place];
      w.Game.transact(r.chips, "league_placement");
      w.Game.grantXp(r.xp, "league_placement");
      emit("weekly_reset", {place: place + 1, chips: r.chips});
      fire("toast", {text: "League #" + (place + 1) + " · +" + r.chips, kind: "gold"});
    }
    prev.settled = prev.week;
  }
  // settled starts empty: it marks a week as PAID, and pre-filling it with the
  // current week meant no week could ever be settled.
  save.weekly = {week, calls: 0, badge: false, best: 0, settled: ""};
  save.league = [];
}
function leagueOf(calls) {
  return C.LEAGUES.find(l => calls >= l.min) || C.LEAGUES[C.LEAGUES.length - 1];
}
function bumpWeekly(save, result) {
  const wk = weekState(save);
  wk.calls += result.correct || 0;
  if ((result.streak || 0) > wk.best) wk.best = result.streak;

  save.league = (save.league || []).filter(e => !e.you);
  save.league.push({name: save.name, score: wk.calls, you: true});
  save.league.sort((a, b) => b.score - a.score);

  if (!wk.badge && wk.calls >= C.WEEKLY_BADGE.calls) {
    wk.badge = true;
    save.inventory.key = (save.inventory.key || 0) + C.WEEKLY_BADGE.keys;
    fire("toast", {text: C.WEEKLY_BADGE.name + " · +1 key", kind: "gold"});
  }
}

/* --------------------------------------------------------- season + pass ---
   Ten tiers, resets on the first UTC day of the month. Tiers 1-9 pay a key,
   tier 10 the permanent seasonal skin. GDD 16.2. */
function seasonOf() {
  const idx = new Date().getUTCMonth() % C.SEASONS.length;
  return C.SEASONS[idx];
}
function seasonState(save) {
  const month = w.Game.utcMonth();
  if (save.season.month !== month) {
    emit("season_reset", {from: save.season.month, to: month});
    save.season = {month, points: 0, claimed: []};
  }
  const season = seasonOf();
  const tier = Math.min(C.PASS.tiers, Math.floor(save.season.points / C.PASS.pointsPerTier));
  return {
    season, tier, points: save.season.points,
    nextAt: (tier + 1) * C.PASS.pointsPerTier,
    claimed: save.season.claimed,
    claimable: []. concat(Array.from({length: tier}, (_, i) => i + 1))
                 .filter(t => save.season.claimed.indexOf(t) < 0)
  };
}
function bumpPass(save, result) {
  seasonState(save);
  let pts = (result.correct || 0) * C.PASS.perCorrect;
  // A run that ends in a cash-out scores three; any other completed run one.
  pts += result.banked > 0 ? C.PASS.perCashout : C.PASS.perRun;
  save.season.points += pts;
}
function claimTier(save, tier) {
  const st = seasonState(save);
  if (tier > st.tier || save.season.claimed.indexOf(tier) >= 0) return false;
  save.season.claimed.push(tier);
  if (tier >= C.PASS.tiers) {
    save.skins[st.season.skin] = true;                    // permanent seasonal skin
    fire("toast", {text: st.season.name + " skin unlocked", kind: "gold"});
    fire("unlock", {kind: "skin", name: st.season.skin});
  } else {
    save.inventory.key = (save.inventory.key || 0) + 1;
    fire("toast", {text: "Tier " + tier + " · +1 key", kind: "gold"});
  }
  emit("pass_claimed", {season: st.season.id, tier});
  w.Game.persist();
  return true;
}

/* ------------------------------------------------------ weekend sprint ----- */
function isWeekend() {
  const d = new Date().getUTCDay();
  return d === 0 || d === 6;
}

/* --------------------------------------------------- cosmetics + packs -----
   One key opens one pack and draws uniformly from unowned items, so duplicates
   are impossible. Each season adds its own table, which is what stops recurring
   key income from dead-ending against a finished album. GDD 14.2. */
function albumItems() {
  const out = [];
  for (const slot in C.COSMETICS) {
    C.COSMETICS[slot].forEach(item => out.push(Object.assign({slot}, item)));
  }
  return out;
}
function unowned(save) {
  return albumItems().filter(i => !save.owned[i.slot + ":" + i.id]);
}
function openPack(save) {
  if ((save.inventory.key || 0) < 1) return null;
  const pool = unowned(save);
  if (!pool.length) {
    // Album complete: the key is retained and applies to the next season.
    fire("toast", {text: "Album complete · key saved for next season", kind: "good"});
    return null;
  }
  save.inventory.key--;
  const item = pool[w.Game.randInt(pool.length)];
  save.owned[item.slot + ":" + item.id] = true;
  emit("pack_opened", {slot: item.slot, id: item.id, keysLeft: save.inventory.key});
  fire("pack", item);
  w.Game.persist();
  return item;
}
function equip(save, slot, id) {
  if (!save.owned[slot + ":" + id]) return false;
  save.equipped[slot] = id;
  emit("cosmetic_equipped", {slot, id});
  w.Game.persist();
  return true;
}
function equipped(save, slot) {
  const id = save.equipped[slot];
  return C.COSMETICS[slot].find(i => i.id === id) || C.COSMETICS[slot][0];
}

/* --------------------------------------------------------- leaderboard -----
   Local, all-time, ranked by streak then banked then earliest finish. Not a
   verified competition - the save is editable by anyone who wants to. */
function board(save) {
  if (!save.board) save.board = [];
  return save.board;
}
function submitScore(save, result) {
  if (!result.streak || result.banked <= 0) return null;
  const list = board(save);
  list.push({name: save.name, streak: result.streak, banked: result.banked, at: Date.now(), you: true});
  list.sort((a, b) => b.streak - a.streak || b.banked - a.banked || a.at - b.at);
  save.board = list.slice(0, C.LEADERBOARD_SIZE);
  const place = save.board.findIndex(e => e.you && e.at === result.at);
  return place;
}

/* ------------------------------------------------------- personal bests ---- */
function personalKey(mode, wager) { return mode + ":" + wager; }
function checkPersonal(save, result) {
  const k = personalKey(result.mode, result.wager);
  const prev = save.personalBest[k] || 0;
  if (result.streak > prev) {
    save.personalBest[k] = result.streak;
    if (prev > 0) {
      save.inventory.key = (save.inventory.key || 0) + 1;
      fire("toast", {text: "New personal best · +1 key", kind: "gold"});
    }
    return true;
  }
  return false;
}

/* -------------------------------------------------------- HL1 challenge ----
   version | seed | name | score | cards | timed trace. Imported runs are
   unverified practice comparisons and never touch the economy. GDD 15.3. */
function encodeChallenge(save, result) {
  const payload = {
    v: C.CHALLENGE.version,
    s: result.seed || ("run-" + Date.now()),
    n: String(save.name).slice(0, C.CHALLENGE.nameMax),
    c: result.correct || 0,
    k: (result.cards || []).slice(0, C.CHALLENGE.maxCards).map(x => x.rank * 4 + x.suit),
    t: (result.trace || []).map(x => [x.dir === "hi" ? 1 : 0, Math.round(x.t)])
  };
  try {
    return C.CHALLENGE.version + "." + btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) { return null; }
}
function decodeChallenge(code) {
  if (!code) return null;
  try {
    let body = String(code).trim();
    const dot = body.indexOf(".");
    if (dot < 0) return null;
    if (body.slice(0, dot) !== C.CHALLENGE.version) return null;
    body = body.slice(dot + 1).replace(/-/g, "+").replace(/_/g, "/");
    while (body.length % 4) body += "=";
    const p = JSON.parse(decodeURIComponent(escape(atob(body))));

    // Validate direction, order, duration and numeric range before play.
    if (p.v !== C.CHALLENGE.version) return null;
    if (!Array.isArray(p.k) || !p.k.length || p.k.length > C.CHALLENGE.maxCards) return null;
    const cards = [];
    for (const n of p.k) {
      if (typeof n !== "number" || n < 8 || n > 59) return null;
      const rank = Math.floor(n / 4), suit = n % 4;
      if (rank < 2 || rank > 14) return null;
      cards.push({rank, suit});
    }
    const trace = [];
    let last = -1;
    for (const t of (Array.isArray(p.t) ? p.t : [])) {
      if (!Array.isArray(t) || t.length !== 2) return null;
      if (t[0] !== 0 && t[0] !== 1) return null;                 // direction
      if (typeof t[1] !== "number" || t[1] < 0 || t[1] < last) return null;  // ordered time
      last = t[1];
      trace.push({dir: t[0] ? "hi" : "lo", t: t[1]});
    }
    if (trace.length >= cards.length) return null;          // every call needs a revealed card

    // Rebuild the ghost from the cards and calls themselves: call i was made on
    // cards[i] and revealed cards[i+1]. The score is what the run actually shows,
    // not whatever number the code claims, and each correct call keeps its time
    // so the friend can see how far ahead or behind they are.
    const ghost = [];
    trace.forEach((t, i) => {
      const a = cards[i].rank, b = cards[i + 1].rank;
      if (a !== b && (t.dir === "hi") === (b > a)) ghost.push(t.t);
    });
    return {seed: String(p.s || ""), name: String(p.n || "Friend").slice(0, C.CHALLENGE.nameMax),
            score: ghost.length, cards, trace, ghost};
  } catch (e) { return null; }
}

/* --------------------------------------------------- run completion hook --- */
function onRunComplete(result, save) {
  if (result.abandoned) { w.Game.persist(); return; }
  result.boosters = result.boosters || {};
  bumpMissions(save, result);
  bumpWeekly(save, result);
  bumpPass(save, result);
  checkPersonal(save, result);

  if (!result.fixed) {
    result.at = Date.now();
    submitScore(save, Object.assign({at: result.at}, result));
  } else if (result.seed) {
    const k = result.seed;
    if ((result.correct || 0) > (save.challengeBest[k] || 0)) save.challengeBest[k] = result.correct;
  }

  // Weekend Sprint pays an extra key at the configured streak. GDD 16.3.
  if (result.mode === "weekend" && (result.streak || 0) >= C.WEEKEND_SPRINT.streak) {
    save.inventory.key = (save.inventory.key || 0) + C.WEEKEND_SPRINT.keys;
    fire("toast", {text: "Weekend goal · +1 key", kind: "gold"});
  }
  w.Game.persist();
}

w.Hybrid = {
  rollMissions, missionList, loginState, claimLogin, dropReady, claimDrop, checkComeback,
  weekState, leagueOf, seasonOf, seasonState, claimTier, isWeekend,
  albumItems, unowned, openPack, equip, equipped, board, personalKey,
  encodeChallenge, decodeChallenge, onRunComplete
};
})(window);
