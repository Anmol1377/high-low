# High Low Casino

HTML5 implementation of the GDD v2.3 spec. No build step, no dependencies, no
server — serve the folder and it runs.

**Live:** https://anmol1377.github.io/high-low/high-low-casino/ ·
Project overview: [`../README.md`](../README.md) ·
Full context: [`../context/CONTEXT.md`](../context/CONTEXT.md)

```sh
python3 -m http.server 8765   # then open http://localhost:8765
```

## Files

Matches the architecture in GDD §24.1.

| File | Responsibility |
|---|---|
| `index.html` | Screens, hub tabs and modals |
| `styles.css` | Core presentation (§18.1) |
| `hybrid.css` | Hub, mascot, streak atmosphere, season, social |
| `config.js` | Every tunable value — economy, XP, ranks, skins, missions, seasons |
| `game.js` | Run state, RNG, prediction resolution, transactions, save |
| `hybrid-model.js` | Calendars, missions, league, cosmetics, HL1 challenge codec |
| `hybrid-ui.js` | Screens, gestures, Byte, share canvas, challenge UI |
| `telemetry.js` | Chunked idempotent outbox (IndexedDB → localStorage → memory) |
| `service-worker.js` | Versioned offline cache |
| `test.js` | 29 headless checks — `node test.js` |
| `manifest.webmanifest`, `icon.svg` | Web app manifest and icon |

`../ev_check.py` re-derives the economy from first principles and reads the live
table out of `config.js`.

## The one thing to know before retuning

`P(streak advances)` is **10/13 only on the first call.** A tie repeats the same
rank (a self-loop, so it conditions out), and winning from an extreme card lands
you back in the middle ranks where the odds are worst — so the chain settles at
**0.7389**. Solving the multiplier curve against 10/13 instead costs about 14
points of RTP.

The curve is solved so every cash-out point returns 0.945–0.952 of the wager.
That flatness is the design: no streak dominates, so cash-out timing stays a
genuine choice rather than a solved one.

After any change to `MULTIPLIERS`, run both:

```sh
node test.js          # rules, economy, meta systems, 20,000 seeded simulated runs
python3 ../ev_check.py
```

Milestone chests pay **XP only** — not chips (a flat reward is worth 14× the
entry at the 10-chip tier and nothing at 25,000) and not keys (a per-run trigger
cannot feed a content-gated album). See GDD §11.1.

## Publishing (GitHub Pages)

Static files with relative paths, so it runs from any subpath. Pushing to
`main` publishes it. With **Settings → Pages → Source: GitHub Actions**, the
workflow in `.github/workflows/deploy-pages.yml` runs `test.js` and
`ev_check.py` first and deploys only this folder when both pass. HTTPS is what
makes Copy link and native image sharing work.

**Things to know once it's live**

- **Bump the version on every update** — any file, not just `config.js`.
  Change `CACHE` in `service-worker.js` and `BUILD` in `config.js`.
  The service worker serves cached files first, so without a bump returning
  players keep the old game indefinitely. Even after a bump the first visit
  still loads the old copy while the new worker installs and clears the old
  cache; the update shows on the next reload. The localhost cache bypass does
  not apply on Pages.
- **Leaderboards and leagues stay per-browser.** Hosting does not make them
  shared, and league placement payouts stay off until real rivals exist.
- **The casino theme is fine while it stays virtual chips only.** Before adding
  purchases or anything with real-world value, check GitHub's terms and the
  rules where it's played.
- **Anyone can read and edit their save** in browser DevTools. Fine for a free
  game; not safe for prizes or anything competitive.

## Not included

Server-side anything. Scores, the economy and challenge codes are all
client-authoritative and trivially editable — fine offline, but leagues,
verified challenges and any competitive reward need the Phase 3 backend first.
Telemetry queues and exports locally; automatic upload needs the Apps Script
web-app URL in `CONFIG.TELEMETRY.endpoint` (GDD §23.5). The sound and haptics
toggles in Settings exist, but no audio or vibration is implemented yet.
