# Activate the working Google Sheets game

The source is preconfigured for the spreadsheet used in this project:

**[High Low Casino — Game Data](https://docs.google.com/spreadsheets/d/1U_flthuVDd1r54G_2hK8UMXPBkrt9mlD-8p3WMKawus/edit)**

The game and collector are combined in **`INSTALL.gs`**. Google requires the spreadsheet owner to authorize and deploy an Apps Script web app once; a Drive connection cannot grant that permission on the owner's behalf.

## One-time activation

1. Open [Google Apps Script](https://script.google.com), choose **New project**, and name it **High Low Casino**.
2. If you own a different destination spreadsheet, change `SPREADSHEET_ID_` in `google-sheets/Code.gs` and run `npm run build:google` first. Open the default Apps Script `Code.gs`, select all, paste this package's **`google-sheets/INSTALL.gs`**, and save.
3. Choose **`setup_`** in the function list and press **Run**. Approve the spreadsheet permission for your script. Setup validates existing tabs and adds `Player_Progress` and `Progress_History` without deleting old records. Run it again when upgrading an earlier install; it will not rewrite matching existing headers.
4. Choose **Deploy → New deployment → Web app**. Set **Execute as: Me**. For private testing, choose **Only myself**. To share the game, choose the audience your Google account permits. Press **Deploy**.
5. Open the deployment's **`/exec`** URL. Play a run and press **Sync now** in **Game data & Google Sheets**. The panel should show **Google Sheets up to date**.
6. Open the spreadsheet and confirm rows in **Sessions**, **Predictions**, **Economy**, **Runs**, **Snapshots**, **Player_Progress**, **Progress_History**, **Players**, and **Events**. Check that `progressRevision` increments after a saved change and that the latest row reflects the correct player ID.

No HTML file, manifest edit, API key, service account, Google Sheets advanced service, or paid SDK is required. Automatic uploading works from the deployed `/exec` game. The ordinary `index.html` remains an offline-capable game and log exporter, but it cannot access `google.script.run` from unrelated hosting.

If you update the game later, run `npm run build:google`, replace the Apps Script editor contents with the new `INSTALL.gs`, then choose **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the existing project and deployment so the URL and spreadsheet destination remain stable.

## Moving existing browser progress

Apps Script and an ordinary web host have separate browser storage.

1. Open the previous game in the same browser and origin where its progress exists.
2. Choose **Export progress** and **Export unsent logs**.
3. Open the Apps Script game, choose **Import progress**, select the progress JSON, and confirm.
4. Choose **Import log backup**, select the log JSON, then press **Sync now**.

Imported event IDs remain unchanged, so acknowledged records are not duplicated. An initial snapshot contains the current saved state, but old individual predictions that an earlier build never logged cannot be reconstructed. The integration pushes data to Sheets; it does not download a cloud save back into a browser. A restored older save may have a lower revision than a previously uploaded progress row; its new history rows are kept but cannot replace the newer `Player_Progress` row. Do not treat export/import as two-way cloud sync.

## Spreadsheet tabs

| Tab | Stored data |
| --- | --- |
| Players | Legacy lightweight latest snapshot summary, retained for earlier clients |
| Player_Progress | Latest complete flattened progress projection per browser player ID, selected by revision |
| Progress_History | Append-only revisioned progress projections; retries cannot create a duplicate revision |
| Events | Canonical receipts for every event chunk and durable duplicate detection |
| Sessions | Start, heartbeat, visibility, online/offline, resume, and page-hide checkpoints |
| Runs | Starts, results, abandonments, wager, mode, boosters, cards, trace, duration, rewards, and XP |
| Predictions | Accepted direction and resolution, previous/next rank, result, streak, and shield state |
| Economy | Every chip credit/debit with before/after balances and reason, including test coins |
| Snapshots | Chunked complete saved game and current-run state after gameplay changes |
| Progression | Configuration, XP, levels, login/comeback rewards, resets, and booster use |
| Missions | Mission progress and reward completions |
| Achievements | Badge unlocks |
| Cosmetics | Packs, equipped identity items, skins, and pass claims |
| UI | Button actions and recognized swipe/hold gestures |
| Errors | Browser errors, rejected promises, and save failures |

Common event columns contain record ID, event ID, client time, server receipt time, player ID, session ID, run ID, type, chunk position, JSON payload, sequence, and build. Transmitted ISO event timestamps remain UTC text for stable ordering, regardless of the spreadsheet's display time zone.

The two new progress tabs are described column-by-column in [docs/GOOGLE_PROGRESS_SCHEMA.md](../docs/GOOGLE_PROGRESS_SCHEMA.md). `progress_snapshot` is deliberately limited to one <20,000-character event chunk; raw full saves can be split across multiple chunks. If a progress projection is unusually large, the telemetry logs a `progress_sync_error` and keeps the full save in Snapshots, but the latest progress table may lag until the payload is reduced.

## Delivery guarantees and limits

- New records queue in IndexedDB, with browser storage and in-memory fallbacks. Failed calls remain queued and retry with increasing delays.
- Batches contain at most 20 bounded records. Payloads longer than 20,000 characters are split into ordered chunks.
- Acknowledgements are returned only after Google confirms every required write. Each destination deduplicates by `record_id`; if a multi-tab write stops halfway, retry completes the missing rows.
- `Progress_History` deduplicates by `player_id:revision`. Conflicting values for the same revision are rejected, and an older revision cannot overwrite `Player_Progress`.
- Formula-looking strings are stored as text, preventing spreadsheet formula injection.
- The client records a browser installation ID, not a verified Google identity. It logs a chosen display name, local time zone, language, game actions and saved progress. It does not ask for email, contacts, payment details or raw keystrokes. Before sharing a Google-hosted deployment, disclose the collector and provide players a privacy notice.
- Page closure and crashes are not perfectly observable in browsers. A later visit recovers a best-effort page-hide checkpoint, but it cannot prove an exact end time.
- This is suitable for testing and a small audience. Apps Script and Sheets quotas apply. For a high-traffic release, use a server database as the event store and export reporting data to Sheets.
- Scores and currencies remain client supplied. Logging does not make the economy or leaderboard server authoritative.
- A publicly accessible web app executing as the owner can receive untrusted submissions and consume owner quotas. This prototype has input-size checks and locking, **not** authentication or rate limiting. Keep access to yourself for private tests; use a proper authenticated backend for public competition.

## Reconstructing large events

Filter **Events** by `event_id`, order by zero-based `part_index`, concatenate `payload_json` with no separator, confirm every `part_count` chunk exists, then parse the JSON. Or export Events as CSV and run:

```bash
python scripts/reconstruct-logs.py Events.csv --output full-events.json
```

The tool reports incomplete events instead of inventing missing data.

## Troubleshooting

- **Authorization error:** return to the editor, run `setup_`, and approve access using the spreadsheet owner's Google account.
- **Collector busy:** wait a few seconds and press **Sync now**; the local queue is preserved.
- **Missing tab/header error:** restore the spreadsheet's original tab names and header row. The collector refuses to overwrite an incompatible table.
- **No automatic upload:** confirm you opened the Apps Script `/exec` URL rather than `index.html`.
- **Updated code not visible:** create a new deployment version; saving the editor alone does not update an existing deployment.

Official documentation: [Apps Script web apps](https://developers.google.com/apps-script/guides/web), [HTML service communication](https://developers.google.com/apps-script/guides/html/communication), and [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
