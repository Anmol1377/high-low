# High Low Casino — Project Context

Everything needed to pick this project up cold: what the game is, how it works,
where the data lives, what was changed from the original design, and why.

Last updated: 17 September 2026 · Build `2.3.3` · GDD `v2.3`

---

## 1. Folder map

```
chip-game/
├── High_Low_Casino_Updated_GDD_v2.2.docx   original design doc (untouched)
├── High_Low_Casino_Updated_GDD_v2.3.docx   corrected design doc (current spec)
├── ev_check.py                             economy verification script
├── high-low-casino/                        the playable HTML5 game
└── context/
    ├── CONTEXT.md                          this file
    ├── export-data.js                      regenerates data/ from the game code
    └── data/                               generated from the live game code
        ├── config.json                     every tunable value
        ├── default-save.json               exactly what a new player starts with
        ├── economy-curve.csv               streak odds, multipliers, EV per stopping point
        └── levels.csv                      all 50 levels with XP and rank
```

The files in `data/` are exported from `high-low-casino/config.js` and
`game.js`, not hand-typed. If the code changes, regenerate them instead of
editing them directly: `node context/export-data.js`.

---

## 2. What the game is

A one-thumb card prediction game. A card is shown; the player calls whether the
next card will be **Higher** or **Lower**.

- A correct call builds a **streak**, which raises a **cash-out multiplier**.
- A **tie** (same rank) keeps the streak and the run continues.
- A **wrong** call ends a normal run and the wager is lost.
- After any correct call the player can **Cash Out** to bank
  `floor(wager × multiplier)`.

The core decision is when to stop. Currency is **virtual chips only** — no
real-money value, no redemption, no purchases.

**Status:** fully playable offline in a browser. All systems in the GDD are
implemented client-side. There is no backend.

---

## 3. Core rules

| Rule | Value |
|---|---|
| Rank order | 2 → 10, J, Q, K, A (Ace high). Suits never matter. |
| Card draw | Independent, uniform, with replacement. 13 ranks × 4 suits. |
| RNG | `crypto.getRandomValues` with rejection sampling; `Math.random` fallback only. |
| P(Higher) from rank r | (14 − r) / 13 |
| P(Lower) from rank r | (r − 2) / 13 |
| P(Tie) | 1 / 13 |
| Edge restrictions | Higher disabled on an Ace, Lower disabled on a 2 |
| Perfect Call | Winning a call whose probability was below 6/13 → +5 XP |
| Insurance | Cost `max(5, ceil(15% of cash-out))`; protects the next prediction only |
| Multiplier cap | Streak 15 (85×). Past 15 the UI warns that continuing can only lose. |

**Fairness guarantee:** card generation reads nothing but the RNG — not balance,
wager, history, cosmetics, boosters or spending.

---

## 4. Economy — the most important section

### 4.1 The multiplier curve

| Streak | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Multiplier | 1.23 | 1.67 | 2.26 | 3.06 | 4.15 | 5.60 | 7.60 | 10.30 | 13.90 | 18.85 | 25.50 | 34.50 | 46.70 | 63.25 | 85.00 |

Full table with probabilities and EV: [`data/economy-curve.csv`](data/economy-curve.csv).

**Design target:** every stopping point returns **0.945–0.952** of the wager —
about a **5% house edge everywhere**. Because no streak is better than any other,
cash-out timing is a genuine risk preference, not a solved problem.

### 4.2 The trap to avoid when retuning

**P(streak advances) is 10/13 only on the first call.**

- A tie repeats the same rank, so it's a self-loop and conditions out. From rank
  r there are 12 non-tie outcomes; `max(14−r, r−2)` of them advance.
- Winning from an extreme card (2 or Ace) lands you in the **middle ranks**,
  where odds are worst.
- So the chain **settles at 0.7389** from the second call onward.

Solving the curve against 10/13 costs about **14 points of RTP**. This mistake
was made once in this project (see §9) and caught only by simulation.

Fair multiplier at streak n = `1 / P(reach n)`. At streak 15 that is ≈ 90×,
not the ≈ 51× that 10/13 would suggest.

### 4.3 Milestone chests pay XP only

| Streak | 3 | 5 | 8 | 10 | 15 |
|---|---|---|---|---|---|
| XP | 12 | 25 | 45 | 70 | 150 |

- **Not chips:** a flat chip reward across a 2,500:1 wager range is worth
  **14× the entry** at the 10-chip tier and **0.006×** at 25,000. Players would
  farm the lowest tier forever.
- **Not keys:** chests fire several times a session, but the cosmetic album is
  finite. A high-frequency faucet into a finite sink leaves keys worthless
  within a week.

### 4.4 Verified numbers

| Check | Result |
|---|---|
| Designed return at streak 5 | 95.05% |
| Simulated (10,000 runs, optimal play) | 93–97% across repeated runs (sampling noise ±2%) |
| EV band, all 15 stopping points | 0.9449–0.9519 |

### 4.5 Economy defaults

| Parameter | Value |
|---|---|
| Starting chips | 2,500 |
| Wager tiers | 10, 50, 100, 250, 500, 1,000, 2,500, 5,000, 10,000, 25,000 |
| Quick Play wager | Highest tier ≤ 100 and ≤ balance |
| Daily drop | 500 chips / 24h — also unlocks instantly below 10 chips so a player can never be stuck |
| Comeback (3+ days away) | 300 chips + 1 key |
| Starting inventory | 2 of each booster, 2 cosmetic keys |

---

## 5. Game modes

| Mode | Timer | Entry | On a wrong call | Boosters |
|---|---|---|---|---|
| Classic | Untimed | Wager | Run ends | Yes |
| Quick 5s | 5s per decision | Wager | Run ends; timeout also ends | Yes |
| Rush 30s | 30s total | Wager | Run ends; timeout auto-cashes if streak ≥ 1 | Yes |
| Daily 60s | 60s total | Free | Streak resets, play continues | No |
| Friend | 60s total | Free | Streak resets, play continues | No |
| Personal Best | Untimed | Wager | Run ends | Yes |
| Weekend Sprint | 30s total (Sat/Sun UTC) | Wager | As Rush; +1 key at streak 5 | Yes |

Daily and Friend use a **fixed card sequence** (seeded PRNG) and are labeled as
fixed replays. Daily's seed is the UTC date, so everyone gets the same cards.

**Timer rule:** a total clock keeps running during a card reveal. If it expires
mid-reveal, the reveal finishes first, then the run settles.

---

## 6. Progression and meta systems

| System | How it works |
|---|---|
| **XP** | Correct call 3, Perfect Call +5, run finished 5, cash-out +8, chests, missions |
| **Levels** | 1–50. XP to next = `80 + 28 × (level − 1)`. Level 50 is the cap. See [`data/levels.csv`](data/levels.csv). |
| **Ranks** | Beginner 1 · Player 5 · Risk Taker 10 · Card Expert 18 · High Roller 27 · Casino Master 38 · Prediction Legend 50 |
| **Card skins** | Neon 1 · Classic 5 · Royal 12 · Cyber 20 · Emerald 30 · plus 3 seasonal (pass tier 10) |
| **Daily missions** | 3 per UTC day from a pool of 6, picked deterministically. Pay chips + XP once. Mission Booster doubles additive progress but not max-streak goals. |
| **Achievements** | 8 badges: First Fortune, Hot Hand, Untouchable, Big Winner, Table Regular, Risk Taker, Skin Collector, Card Reader |
| **Login journey** | 7 days: 100/150/200/250/300/400/700 chips, keys, boosters. A missed day restarts it. |
| **Boosters** | Extra Time, Shield, Auto Cash Out (streak 3), Double XP, Mission Booster. None affect card odds. |
| **Cosmetics** | 4 slots — Avatar (6), Frame (4), Title (4), Emote (4) = **18-item album**. 4 defaults owned. |
| **Packs** | 1 key → random unowned item. Duplicates impossible. A key is kept if the album is complete. |
| **Key sources** | Login journey, pass tiers 1–9, weekly badge, Weekend Sprint, beating a personal best, comeback. **Not chests.** |
| **Season pass** | 10 tiers, 15 points each, resets monthly. Correct call 1 pt; cash-out run 3 pts; other finished run 1 pt. Tiers 1–9 = key, tier 10 = seasonal skin. Seasons rotate Aurora / Sunset / Cosmic. |
| **Weekly league** | Bronze 0–19 · Silver 20–49 · Gold 50–99 · Diamond 100+ correct calls. Tier is a badge; payouts rank the single combined board: 1,500 / 750 / 400 chips — **only when other real players are on the board**, so a local save never pays (otherwise you would win 1st alone every week). |
| **Weekly badge** | 20 correct calls in a UTC week (resets Monday) → 1 key |
| **Leaderboard** | Local Top 10 of your own banked runs, ranked by streak → banked → earliest. Starts empty. |
| **Friend challenges** | `HL1.<base64>` code = seed, name, the cards the sender saw, and their timed calls. The friend plays those exact cards first, then the seed's own sequence (never a loop), for 60s. Score = correct calls, **rebuilt from the recorded calls** rather than trusted from the code. A live "ghost" line shows how many the sender had at the same moment; the result screen says who won. Play Again replays the same challenge. Links only work when the game is hosted online. Practice only — never touches chips. |
| **Share card** | 1080×1920 PNG. Native share, download, copy caption, WhatsApp / Telegram / X links. |

---

## 7. Data storage

**Everything lives in the browser. Nothing is sent to a server** —
`CONFIG.TELEMETRY.endpoint` is empty.

| What | Where | Key |
|---|---|---|
| Player save | `localStorage` | `high-low-casino-save-v1` |
| Anonymous player ID | `localStorage` | `hlc-player-id` |
| Analytics queue | IndexedDB → `localStorage` (500 cap) → memory | DB `hlc-telemetry`, store `outbox` / key `hlc-outbox-v1` |
| Offline app files | Service worker cache | `hlc-v2.3.3` |

### 7.1 The save

One JSON object — a fresh one is in [`data/default-save.json`](data/default-save.json).

| Field | Contents |
|---|---|
| `chips`, `xp`, `level` | Wallet and progression |
| `name`, `skin`, `wager`, `mode` | Player choices, remembered for Quick Play |
| `stats` | best, runs, correct, wrong, ties, predictions, maxBank, banked |
| `achievements` | badge id → unlock timestamp |
| `inventory` | booster and key counts |
| `loadout` | boosters armed for the next run |
| `owned`, `equipped`, `skins` | Cosmetics (`"slot:id"` keys) and unlocked skins |
| `missions` | day, picks, progress, claimed |
| `login`, `drop`, `comeback`, `lastSeen` | Return-system timestamps |
| `weekly`, `league` | Week key, calls, badge, standings |
| `season` | Month, points, claimed tiers |
| `board` | Local all-time leaderboard |
| `personalBest`, `challengeBest` | Per mode+wager and per seed |
| `settings` | sound, motion, haptics |
| `history` | Last 50 runs |

- **Written** after every chip transaction, prediction, reward, equip change and
  settled run.
- **Migrated on load** by merging stored fields over defaults, so older saves
  gain new fields instead of breaking.
- **Every chip movement** goes through `transact(amount, reason)`, producing one
  auditable `economy_transaction` event.

### 7.2 Telemetry

- Record id = `session:sequence:chunk`, so a retried send can't duplicate a row.
- Payloads over 20,000 characters are split into ordered chunks; max 20 records
  per request.
- Only ids the server acknowledges are removed; failures retry with exponential
  backoff (2s → 5 min).
- Strings starting with `= + - @` are prefixed with `'` to block spreadsheet
  formula injection.
- Events are routed to tabs: session, runs, predictions, economy, progression,
  missions, achievements, cosmetics, ui, errors, snapshots.

**Events emitted (32):** `achievement_unlocked` `booster_used` `boosters_consumed`
`browser_error` `chest_claimed` `comeback_reward` `cosmetic_equipped`
`economy_transaction` `game_loaded` `gesture_action` `insurance_activated`
`level_up` `login_reward` `mission_completed` `mission_progress` `network_offline`
`network_online` `pack_opened` `pass_claimed` `prediction_resolved`
`prediction_selected` `run_abandoned` `run_completed` `run_started` `save_error`
`season_reset` `session_heartbeat` `session_pagehide` `session_start`
`session_visibility` `weekly_reset` `xp_granted`

### 7.3 Storage consequences

- **One save per browser per origin.** `http://localhost:8765` and opening the
  file directly are different saves.
- **Clearing site data erases progress.** Hub → Settings → Export / Import is the
  backup path.
- **Fully client-editable.** Chips, level and scores can be changed in DevTools.
- **Device clock** drives daily, weekly, monthly and comeback timing — not
  tamper-resistant.

---

## 8. Code architecture

Plain HTML/CSS/JS. No build step, no dependencies, no framework. ~2,900 lines.

| File | Responsibility |
|---|---|
| `index.html` | All screens, hub tabs, modals |
| `styles.css` | Core look: dark navy, cyan/violet/pink/gold, cards, HUD |
| `hybrid.css` | Hub, Byte mascot, streak heat, skins, pass, league |
| `config.js` | **Every tunable value.** Change numbers here. |
| `game.js` | RNG, run state machine, resolution, insurance, XP, save |
| `hybrid-model.js` | Missions, calendars, league, season, packs, leaderboard, HL1 codec |
| `hybrid-ui.js` | Screens, hub tabs, gestures, share canvas, event wiring |
| `telemetry.js` | Analytics outbox |
| `service-worker.js` | Offline cache (bypassed on localhost) |
| `manifest.webmanifest`, `icon.svg` | Installable web app |
| `test.js` | 29 headless checks |

**Load order:** `config → telemetry → game → hybrid-model → hybrid-ui`.

**Communication:**
- `Game.emit(event, data)` → telemetry.
- `Game.fire(event, data)` → UI listeners registered with `Game.on`.
- UI events: `runstart`, `reveal`, `resolved`, `timer`, `chest`, `runend`,
  `levelup`, `unlock`, `achievement`, `toast`, `pack`.

**Run states:** Menu → Waiting for prediction → Revealing (input locked, 430 ms)
→ Resolving → Waiting for continuation → Settled. Open modals also block
gameplay input.

**Controls:** buttons; swipe up/down = Higher/Lower, swipe right = Cash Out,
600 ms hold = insurance (45 px swipe threshold); keys ↑ ↓ C, Esc closes modals.

---

## 9. Decision and change log

### Design doc: v2.2 → v2.3

| Change | Why |
|---|---|
| Multiplier curve replaced | v2.2 table was player-positive, peaking at **+35%** per run. Now a flat ~5% edge. |
| Chests: chips → XP only | Flat chips returned 14× the wager at tier 1 (~15× total run EV). |
| Keys removed from chests | Would exhaust the 18-item album inside a week. |
| Albums get a seasonal pack table | Recurring keys always have a sink. |
| Casino Master XP 21,756 → 21,608 | §10.2 contradicted Appendix A. |
| Quick Play guard under 10 chips | Previously undefined; could dead-end a player. |
| League scope defined | Tiers are badges; payouts rank one combined board. |
| Pass points disambiguated | Cash-out run 3 pts, other finished run 1 pt. |
| Streak-15 warning | Continuing past the cap can only lose; it was silent. |

### Mistakes caught during the build

| Issue | Found by | Fix |
|---|---|---|
| Curve solved against 10/13 → **80.7% RTP** instead of 95% | 10,000-run simulation | Re-solved against the real Markov chain (§4.2) |
| Higher/Lower buttons stayed disabled after every call | Playing it in Chrome | Clear `busy` **before** firing `resolved`, in all branches |
| Rush/Daily 30s/60s clock stopped after the first call | Playing it in Chrome | Only per-call clocks are cleared on prediction |
| Cash-out underpaid a chip (`100 × 2.26 = 225.999…`) | Playing it in Chrome | Round to 1e-6 before `floor` |
| Profile title ran into rank line | User screenshot | Block-level lines in the ID card |
| CSS fixes invisible after editing | User screenshot | Service worker bypasses cache on localhost |
| Hub buttons touching grids | User screenshot | Flex gap on hub panels |
| Locked cosmetics gave no unlock hint | User question | "Unlock more" note in Locker |
| Weekly placement could never pay (`settled` pre-set to the current week) | Removing demo data | `settled` starts empty; payout requires real rivals |
| Test buttons and demo leaderboard/league rows | User request | Removed; old saves have demo rows stripped on load |
| Friend challenge dealt a looping 2-card deck (A,3,A,3…) | User question | Recorded cards continue into the seed's sequence; deck never wraps |
| Challenge had no ghost or winner; score was trusted from the code | User question | Ghost timeline and score rebuilt from calls; head-to-head result |
| Play Again after a challenge switched to the Daily deck | User question | Play Again replays the exact last start; fixed modes aren't remembered |
| Copy link produced `null/...` on a local file | User question | Uses the page URL; on `file://` it says to send the code instead |
| RTP simulation test failed ~1 run in 10 and blocked the first Pages deploy | GitHub Actions failure | Seeded simulation (identical every run); pass band = designed return ±4 standard errors |
| Flaky timer regression test | Re-verification | Retry until a call survives; assert real elapsed ticks |

---

## 10. Known limitations and open issues

| Item | Status |
|---|---|
| **Chip faucet vs sink** | **Open, deliberately deferred.** Dailies give ~1,650 chips/day; burning that at a 5% edge takes ~33,000 chips wagered/day. Low-tier players inflate. Needs real player data — GDD Phase 2. |
| No backend | Scores, leagues, challenges and the wallet are client-authoritative. Nothing competitive can carry value until Phase 3. |
| Device clock | All time-based rewards can be gamed by changing the clock. |
| No run resume | Closing mid-run abandons it; the wager stays spent. |
| Telemetry upload | Needs the Apps Script web-app URL in `CONFIG.TELEMETRY.endpoint`. |
| Sound / haptics | Settings toggles exist; no audio or haptic output is implemented. |

---

## 11. How to run and verify

```sh
# play
cd high-low-casino && python3 -m http.server 8765
# open http://localhost:8765

# test rules, economy, meta systems, 10k simulated runs, regressions
node test.js

# verify the multiplier curve against the real Markov chain
python3 ../ev_check.py
```

**After changing any value in `config.js`:**
1. `node test.js` and `python3 ev_check.py` must both pass.
2. Bump `BUILD` in `config.js` and `CACHE` in `service-worker.js`.
3. `node context/export-data.js` to regenerate `context/data/`, and update this
   file if behavior changed.

**Any change to any file** (not only `config.js`) needs step 2 before it is
published, or players keep the cached old version — see §12.

---

## 12. Publishing to GitHub Pages

The game is static with relative paths, so it runs unchanged from
`https://<user>.github.io/<repo>/`. HTTPS enables Copy link for challenges,
native image sharing, and install-to-home-screen.

### What to publish

- **Publish only the contents of `high-low-casino/`.**
- **Keep out** both `.docx` design documents, `ev_check.py` and `context/`.
  The GDD is marked *"Prepared for Busy Gamers Studios"* — confirm it may be
  made public before it goes near a public repo.
- GitHub Free serves Pages only from **public** repositories; a private repo
  needs a paid plan. Assume everything pushed is visible to anyone.

### Things to know once it's live

| Item | Detail |
|---|---|
| **Bump the version on every update** | Change `CACHE` in `service-worker.js` and `BUILD` in `config.js` for any file change. Cache-first means that without a bump returning players keep the old game. After a bump, the first visit still shows the old copy while the new worker installs and deletes the old cache; the update appears on the next reload. The localhost bypass does not apply on Pages. |
| **Leaderboards and leagues stay per-browser** | Hosting does not make them shared. League placement payouts stay off because there are no real rivals on a local board. |
| **Casino theme** | Fine while it is virtual chips only. Before adding purchases or anything with real-world value, check GitHub's terms and local rules. |
| **Saves are editable** | Anyone can read and change their save in browser DevTools. Fine for a free game; not for prizes or anything competitive. |
| **No data collection** | `CONFIG.TELEMETRY.endpoint` is empty, so nothing is sent anywhere. Setting it later means adding a privacy notice first. |
