/* =============================================================================
   config.js - every tunable value in one place (GDD v2.3 section 24.1).
   Nothing here reads player state. Card generation never sees any of it.
   The multiplier curve is solved against the run's ACTUAL Markov chain, not a
   flat per-card probability. P(advance) is 10/13 only on the first call; after
   that, winning from an extreme card lands you back in the middle where the
   odds are worst, so it settles at 0.7389. Solving against 10/13 costs ~14
   points of RTP. Every cash-out point returns 0.945-0.952 (~5% house edge).
   ev_check.py re-derives the chain from these rules and asserts the band, so
   run it after any retune or the code and the maths drift apart.
   ============================================================================= */
window.CONFIG = {
  BUILD: "2.3.3",
  SAVE_KEY: "high-low-casino-save-v1",

  /* ---- 8.1 wager tiers / 8.2 streak multipliers ---- */
  WAGERS: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000],
  MULTIPLIERS: [1.23,1.67,2.26,3.06,4.15,5.6,7.6,10.3,13.9,18.85,25.5,34.5,46.7,63.25,85],
  QUICKPLAY_MAX_WAGER: 100,

  /* ---- 11.1 streak chests: XP + celebration only ----
     Not chips (a flat reward is worth 14x the entry at tier 1 and nothing at
     tier 10), not keys (a per-run trigger cannot feed a content-gated album). */
  CHESTS: {
    3:  {xp: 12,  tier: "basic",     label: "Combo pulse"},
    5:  {xp: 25,  tier: "milestone", label: "Milestone reaction"},
    8:  {xp: 45,  tier: "gold",      label: "Gold effect"},
    10: {xp: 70,  tier: "high",      label: "High intensity"},
    15: {xp: 150, tier: "legendary", label: "Legendary"}
  },

  /* ---- 10.1 experience ---- */
  XP: {correct: 3, perfect: 5, finish: 5, cashout: 8},
  MAX_LEVEL: 50,
  xpToNext: L => 80 + 28 * (L - 1),

  /* ---- 10.2 ranks ---- */
  RANKS: [
    {min: 50, name: "Prediction Legend"}, {min: 38, name: "Casino Master"},
    {min: 27, name: "High Roller"},       {min: 18, name: "Card Expert"},
    {min: 10, name: "Risk Taker"},        {min: 5,  name: "Player"},
    {min: 1,  name: "Beginner"}
  ],

  /* ---- 10.3 card skins ---- */
  SKINS: [
    {id:"neon",    name:"Neon",    level:1},
    {id:"classic", name:"Classic", level:5},
    {id:"royal",   name:"Royal",   level:12},
    {id:"cyber",   name:"Cyber",   level:20},
    {id:"emerald", name:"Emerald", level:30},
    {id:"aurora",  name:"Aurora",  season:"aurora"},
    {id:"sunset",  name:"Sunset",  season:"sunset"},
    {id:"cosmic",  name:"Cosmic",  season:"cosmic"}
  ],

  /* ---- 6 game modes ---- */
  MODES: {
    classic:  {label:"Classic",  total:0,  perCall:0, wagered:true,  boosters:true,  fixed:false},
    quick:    {label:"Quick 5s", total:0,  perCall:5, wagered:true,  boosters:true,  fixed:false},
    rush:     {label:"Rush 30s", total:30, perCall:0, wagered:true,  boosters:true,  fixed:false},
    daily:    {label:"Daily 60s",total:60, perCall:0, wagered:false, boosters:false, fixed:true},
    friend:   {label:"Friend",   total:60, perCall:0, wagered:false, boosters:false, fixed:true},
    personal: {label:"Personal Best", total:0, perCall:0, wagered:true, boosters:true, fixed:false},
    weekend:  {label:"Weekend Sprint", total:30, perCall:0, wagered:true, boosters:true, fixed:false}
  },

  /* ---- 9 insurance + boosters ---- */
  INSURANCE: {min: 5, rate: 0.15},
  BOOSTERS: {
    time:    {name:"Extra Time",     desc:"Adds 3 seconds once",             icon:"⏱"},
    shield:  {name:"Shield",         desc:"Protects the first prediction",   icon:"🛡"},
    auto:    {name:"Auto Cash Out",  desc:"Secures value at streak 3",       icon:"↻"},
    xp2:     {name:"Double XP",      desc:"Doubles XP for the run",          icon:"✨"},
    mission: {name:"Mission Booster",desc:"Doubles additive mission progress",icon:"◎"},
    key:     {name:"Cosmetic Key",   desc:"Opens one collection pack",       icon:"⚿"}
  },
  /* Reveal/settle timings. Config values rather than magic numbers so live
     tuning and headless tests can both set them (0 resolves inline). */
  REVEAL_MS: 430,
  SETTLE_MS: 460,

  EXTRA_TIME: 3,
  AUTO_CASHOUT_STREAK: 3,

  /* ---- 12.1 daily mission pool (three chosen per UTC day) ---- */
  MISSIONS: [
    {id:"streak5",  text:"Reach a five-card streak",     target:5,    metric:"maxStreak", chips:300, xp:35},
    {id:"runs3",    text:"Complete three runs",          target:3,    metric:"runs",      chips:200, xp:25},
    {id:"bank1000", text:"Cash out 1,000 chips",         target:1000, metric:"banked",    chips:400, xp:40},
    {id:"calls12",  text:"Make twelve correct calls",    target:12,   metric:"correct",   chips:300, xp:35},
    {id:"perfect2", text:"Make two Perfect Calls",       target:2,    metric:"perfect",   chips:250, xp:40},
    {id:"lower5",   text:"Call Lower correctly five times", target:5,  metric:"lower",    chips:200, xp:30}
  ],
  MISSIONS_PER_DAY: 3,

  /* ---- 12.2 achievements ---- */
  ACHIEVEMENTS: [
    {id:"first",   name:"First Fortune", desc:"Cash out your first run"},
    {id:"hot",     name:"Hot Hand",      desc:"Reach streak 5"},
    {id:"untouch", name:"Untouchable",   desc:"Reach streak 10"},
    {id:"big",     name:"Big Winner",    desc:"Cash out 5,000 chips"},
    {id:"regular", name:"Table Regular", desc:"Complete 25 runs"},
    {id:"risk",    name:"Risk Taker",    desc:"Reach level 10"},
    {id:"skins",   name:"Skin Collector",desc:"Level 30 and all standard skins"},
    {id:"reader",  name:"Card Reader",   desc:"Make 100 predictions"}
  ],

  /* ---- 13.1 seven day login journey ---- */
  LOGIN_JOURNEY: [
    {chips:100, keys:1, booster:"time"},
    {chips:150, keys:1, booster:"shield"},
    {chips:200, keys:1, booster:"auto"},
    {chips:250, keys:1, booster:"xp2"},
    {chips:300, keys:1, booster:"mission"},
    {chips:400, keys:2, booster:null},
    {chips:700, keys:2, booster:null}
  ],
  DAILY_DROP: 500,
  DAILY_DROP_MS: 864e5,
  COMEBACK: {days: 3, chips: 300, keys: 1},
  WEEKLY_BADGE: {calls: 20, keys: 1, name: "Twenty Clean Calls"},

  /* ---- 14.1 identity slots / 14.2 collection album (18 items) ---- */
  COSMETICS: {
    avatar: [
      {id:"fox",    name:"Neon Fox",  art:"🦊", default:true},
      {id:"byte",   name:"Byte Bot",  art:"🤖"},
      {id:"cat",    name:"Cosmic Cat",art:"🐱"},
      {id:"ghost",  name:"Ghost",     art:"👻"},
      {id:"visitor",name:"Visitor",   art:"👽"},
      {id:"panda",  name:"Panda",     art:"🐼"}
    ],
    frame: [
      {id:"electric",name:"Electric", css:"electric", default:true},
      {id:"golden",  name:"Golden",   css:"golden"},
      {id:"candy",   name:"Candy",    css:"candy"},
      {id:"orbit",   name:"Orbit",    css:"orbit"}
    ],
    title: [
      {id:"fresh", name:"Fresh Deck",     default:true},
      {id:"reader",name:"Card Reader"},
      {id:"main",  name:"Main Character"},
      {id:"chill", name:"Chill Dealer"}
    ],
    emote: [
      {id:"gg",  name:"Good Game", art:"👏", default:true},
      {id:"fire",name:"On Fire",   art:"🔥"},
      {id:"wow", name:"Wow",       art:"😳"},
      {id:"cool",name:"Cool",      art:"😎"}
    ]
  },

  /* ---- 16 seasons + free cosmetic pass ----
     Each season adds its own pack table so recurring key income always has a
     sink; without that the 18-item album is exhausted inside week one. */
  SEASONS: [
    {id:"aurora", name:"Aurora Nights", skin:"aurora", accent:"#5eead4"},
    {id:"sunset", name:"Sunset Arcade", skin:"sunset", accent:"#fb923c"},
    {id:"cosmic", name:"Cosmic Club",   skin:"cosmic", accent:"#c084fc"}
  ],
  PASS: {tiers: 10, pointsPerTier: 15, perCorrect: 1, perCashout: 3, perRun: 1},
  WEEKEND_SPRINT: {streak: 5, keys: 1},

  /* ---- 15.2 weekly league ---- */
  LEAGUES: [
    {id:"diamond", name:"Diamond", min:100},
    {id:"gold",    name:"Gold",    min:50},
    {id:"silver",  name:"Silver",  min:20},
    {id:"bronze",  name:"Bronze",  min:0}
  ],
  PLACEMENT_REWARDS: [
    {chips:1500, xp:200}, {chips:750, xp:100}, {chips:400, xp:50}
  ],
  LEADERBOARD_SIZE: 10,

  /* ---- 20.2 economy defaults ---- */
  START_CHIPS: 2500,
  START_BOOSTERS: {time:2, shield:2, auto:2, xp2:2, mission:2, key:2},

  /* ---- 15.3 friend challenge codec ---- */
  CHALLENGE: {version: "HL1", maxCards: 1001, nameMax: 16},

  /* ---- 23 telemetry ---- */
  TELEMETRY: {
    chunkChars: 20000,
    batchSize: 20,
    endpoint: "",              // Apps Script web-app URL; empty = queue + export only
    retryBaseMs: 2000,
    retryMaxMs: 300000
  }
};
