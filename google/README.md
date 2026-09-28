# Google Sheets logging (Apps Script)

Runs this build (2.3.3) inside Google Apps Script and writes gameplay events to
a Google Sheet. Adapted from `../google-sheets/`, trimmed to what this game
actually sends.

| File | What it is |
|---|---|
| `collector.gs` | The collector: `setup`, `doGet`, `debugInfo`, validation, `ingest` |
| `build.js` | Bundles the game + collector into `INSTALL.gs` |
| `INSTALL.gs` | **Generated.** The single file you paste into Apps Script |
| `collector.test.js` | 8 checks with stubbed Google services — `node google/collector.test.js` |

The game is served **by** the script so the page can call `ingest` through
`google.script.run`. That avoids CORS: a browser on ordinary hosting cannot post
to Apps Script at all (GDD §23.5), so there it queues and exports instead.

Only `setup`, `doGet`, `debugInfo` and `ingest` are public; everything else ends
in `_`, which Apps Script both hides from the Run menu and blocks from
`google.script.run`. `debugInfo` reports the owner email and spreadsheet URL, so
delete it and `setup` before widening access beyond people you trust.

## Setup (once, ~5 minutes)

1. Go to **https://script.google.com** → **New project** → name it
   `High Low Casino`.
2. In the editor, open the default `Code.gs`, select all, and **paste the entire
   contents of `google/INSTALL.gs`**. Save (⌘S).
3. In the function dropdown pick **`setup`** → **Run**. Approve the permission
   prompt (it asks for spreadsheet access only). This creates a spreadsheet
   named *High Low Casino — Game Data* with 12 tabs. The Execution log prints
   its URL — open it once to confirm.
4. **Deploy → New deployment → ⚙ → Web app**
   - Execute as: **Me**
   - Who has access: **Only myself** to test, or wider to share
   - **Deploy**, then approve access.
5. Open the deployment's **`/exec`** URL. Play a run.
6. Open the spreadsheet. Rows should appear in `Events`, `session`, `runs`,
   `predictions` and `economy` within a few seconds.

Nothing else is needed: no API key, no service account, no spreadsheet ID to
copy. `setup` creates the sheet and remembers its ID in script properties.

## If the web app will not open

Run **`debugInfo`** from the editor (function dropdown → Run) and read the
Execution log. It prints the signed-in account, whether the game bundle pasted
completely, the spreadsheet URL, which tabs exist, and the deployed URL.

| Symptom | Cause | Fix |
|---|---|---|
| "Sorry, unable to open the file at present" | Several Google accounts signed in; the plain `/exec` URL cannot tell which one owns the script | Use the account-pinned URL `debugInfo` prints (`/macros/u/0/s/…`), trying `u/1`, `u/2` … — or open `/exec` in an Incognito window signed into only that account |
| "Paste incomplete" page | The last line `const GAME_B64_ = '…';` is missing | Re-paste all of `INSTALL.gs`, then Deploy → Manage deployments → ✏️ → New version |
| "Web app error" page with a stack trace | A real script error | Send the trace; it names the failing line |
| `debugInfo` prints "Deployed URL: none" | Never deployed, or the deployment was deleted | Deploy → New deployment → Web app |

`doGet` now catches its own errors, so a failure shows a readable message
instead of Google's generic page. **Any change needs a new deployment version** —
saving the editor alone does not update a live `/exec` URL.

## Updating the game later

```sh
node google/build.js     # rebuild INSTALL.gs from high-low-casino/
```

Then paste the new `INSTALL.gs` over the editor contents and
**Deploy → Manage deployments → ✏️ → New version → Deploy**. Keep the same
deployment so the URL and spreadsheet stay stable. Saving the editor alone does
**not** update a live deployment.

## Tabs

`Events` holds a canonical receipt for every chunk. The rest hold the same rows
grouped by category: `session`, `runs`, `predictions`, `economy`, `progression`,
`missions`, `achievements`, `cosmetics`, `ui`, `errors`, `snapshots`.

Columns: `record_id`, `event_id`, `client_time_utc`, `received_time_utc`,
`player_id`, `session_id`, `event_type`, `part_index`, `part_count`,
`payload_json`, `build`.

Events larger than 20,000 characters are split: filter `Events` by `event_id`,
sort by `part_index`, and concatenate `payload_json`.

## Guarantees

- Batches are at most 20 records and 500 KB; every field is type-checked and a
  malformed batch is rejected before anything is written.
- Each row carries its own `record_id`. A retry re-checks each tab, so a batch
  that died half-written is completed rather than duplicated.
- Receipts in `Events` are written **last**, so a crash leaves the batch
  retryable.
- A script lock serialises writes; the client retries on "Collector busy".
- Text starting with `= + - @` is stored with a leading apostrophe, so it cannot
  execute as a spreadsheet formula.
- Only acknowledged ids leave the client's outbox.

## Limits

- **Not authenticated and not rate limited.** A web app open to "anyone" runs as
  you and consumes your Google quota. Keep access to yourself or people you
  trust.
- **Apps Script and Sheets quotas apply.** Fine for testing and a small
  audience; a real launch needs a database with Sheets used for reporting only.
- **The data is client-supplied.** Logging does not make chips, scores or
  leaderboards server-authoritative — anyone can edit their own save.
- **It is one-way.** Progress is pushed to Sheets; nothing is read back into the
  browser. Apps Script and ordinary hosting also have separate browser storage,
  so progress does not follow a player between them (use Hub → Settings →
  Export / Import).
- **Privacy:** a generated browser id, chosen display name and gameplay events
  are recorded — no email, contacts or payment data. Tell players before sharing
  a deployment.
