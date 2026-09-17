# High Low Casino

A one-thumb card prediction game. Call whether the next card is **higher** or
**lower**, build a streak, and cash out before it breaks.

**▶ Play:** https://anmol1377.github.io/high-low/high-low-casino/

Plain HTML, CSS and JavaScript — no build step, no dependencies, no server.
Works on phone and desktop, and offline after the first load.

> Virtual chips only. There is no real money, no purchases and no cash
> redemption.

---

## Features

- **7 modes** — Classic, Quick 5s, Rush 30s, Daily 60s, Friend challenge,
  Personal Best, Weekend Sprint
- **Live odds** on every card and a provably flat ~5% house edge at every
  cash-out point
- **Insurance** and 5 boosters, none of which change card odds
- **Levels 1–50**, 7 ranks, 8 card skins
- **Daily missions**, 8 achievements, 7-day login journey, streak chests
- **Cosmetics** — avatars, frames, titles and emotes from a duplicate-free
  collection album
- **Monthly season pass** and a weekly league
- **Friend challenges** — share a code; your friend plays your exact cards
  against a live ghost of your run
- **Share cards** — 1080×1920 image of your streak
- Swipe, button and keyboard controls; reduced-motion support

---

## Repository

```
.
├── high-low-casino/          the game (this is what's played)
│   ├── index.html            screens, hub and modals
│   ├── config.js             every tunable value
│   ├── game.js               RNG, run logic, save
│   ├── hybrid-model.js       missions, league, season, cosmetics, challenges
│   ├── hybrid-ui.js          screens, gestures, share card
│   ├── telemetry.js          local analytics queue
│   ├── styles.css, hybrid.css
│   ├── service-worker.js     offline cache
│   ├── test.js               automated checks
│   └── README.md             developer notes for the game
├── context/
│   ├── CONTEXT.md            full project context: rules, economy, data, decisions
│   ├── data/                 config, default save, level and economy tables
│   └── export-data.js        regenerates data/ from the game code
├── ev_check.py               verifies the multiplier curve
├── High_Low_Casino_Updated_GDD_v2.2.docx   original design document
├── High_Low_Casino_Updated_GDD_v2.3.docx   corrected design document
└── .github/workflows/deploy-pages.yml      test and deploy workflow
```

---

## Run locally

```sh
cd high-low-casino
python3 -m http.server 8765
```

Open http://localhost:8765. Serving it (rather than opening `index.html`
directly) is needed for the offline cache and challenge links.

## Test

```sh
cd high-low-casino && node test.js   # 29 checks: rules, economy, meta systems, 20,000 simulated runs
python3 ev_check.py                  # multiplier curve vs the real streak probabilities (run from repo root)
```

Both must pass after any change to `config.js`.

---

## Deployment

Pushing to `main` publishes the site through GitHub Pages.

**Releasing an update:** bump `BUILD` in `high-low-casino/config.js` and `CACHE`
in `high-low-casino/service-worker.js` for **every** change, or returning
players keep the old cached version. After a bump, the update appears on a
player's second visit.

The workflow in `.github/workflows/deploy-pages.yml` runs the tests and deploys
only the `high-low-casino/` folder if they pass. It applies when the repository's
**Settings → Pages → Source** is set to **GitHub Actions**; the game is then
served at `https://anmol1377.github.io/high-low/`.

---

## Good to know

- **Progress is saved in your browser.** Clearing site data erases it; use
  Player Hub → Settings → Export to back it up.
- **Leaderboards and leagues are per-browser**, not shared between players, and
  league placement pays nothing until real opponents exist.
- **Saves can be edited** in browser DevTools, so nothing here is suitable for
  prizes.
- **No data is collected.** Analytics are queued locally and never sent.

See [`context/CONTEXT.md`](context/CONTEXT.md) for the full rules, economy
maths, data format and change history.
