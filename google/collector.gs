/**
 * High Low Casino — Google Sheets collector (Apps Script).
 * Adapted from google-sheets/Code.gs, trimmed to what this build actually sends.
 *
 * The game is served BY this script so the page can call ingest() through
 * google.script.run, which avoids CORS entirely. A copy on ordinary hosting
 * reaches the same spreadsheet through doPost instead — see the note there.
 *
 * Setup: paste INSTALL.gs into a new Apps Script project, run setup once,
 * then Deploy → New deployment → Web app (Execute as: Me).
 *
 * setup and debugInfo carry no trailing underscore because Apps Script hides
 * such functions from the editor's Run menu, and the owner must run both by
 * hand. That also makes them reachable from the page, so debugInfo prints the
 * owner email and spreadsheet URL - delete both before opening the web app to
 * anyone beyond people you trust. Everything else stays private (_) so the
 * page's only callable entry point is ingest.
 */

// Leave empty to create a new spreadsheet on first setup_; it is then remembered.
const SPREADSHEET_ID_ = '';

// Row shape written to every tab. Matches the records telemetry.js queues.
const HEADERS_ = ['record_id', 'event_id', 'client_time_utc', 'received_time_utc',
                  'player_id', 'session_id', 'event_type', 'part_index', 'part_count',
                  'payload_json', 'build'];

// One tab per category telemetry.js routes to, plus Events for canonical receipts.
const TABS_ = ['Events', 'session', 'runs', 'predictions', 'economy', 'progression',
               'missions', 'achievements', 'cosmetics', 'ui', 'errors', 'snapshots'];

function setup() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID') || SPREADSHEET_ID_;
  const book = id ? SpreadsheetApp.openById(id)
                  : SpreadsheetApp.create('High Low Casino — Game Data');
  props.setProperty('SPREADSHEET_ID', book.getId());
  TABS_.forEach(function (name) {
    let sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.insertSheet(name);
    if (sheet.getLastRow() > 0) {
      // Never overwrite a table that is not ours.
      const found = sheet.getRange(1, 1, 1, HEADERS_.length).getValues()[0];
      if (JSON.stringify(found) !== JSON.stringify(HEADERS_)) {
        throw new Error('Unexpected headers in ' + name + '. Use a fresh spreadsheet.');
      }
      return;
    }
    sheet.getRange(1, 1, 1, HEADERS_.length).setValues([HEADERS_])
         .setFontWeight('bold').setBackground('#eeeeee');
    sheet.setFrozenRows(1);
  });
  console.log('Spreadsheet: ' + book.getUrl());
  return book.getUrl();
}

function doGet(e) {
  // Any throw in here surfaces as Google's unhelpful generic page, so failures
  // are caught and rendered as readable text instead.
  try {
    if (typeof GAME_B64_ === 'undefined' || !GAME_B64_) {
      return HtmlService.createHtmlOutput(
        '<h2>Paste incomplete</h2><p>GAME_B64_ is missing. The last line of the ' +
        'script must be <code>const GAME_B64_ = \'…\';</code> — re-paste all of ' +
        'google/INSTALL.gs, then Deploy &rarr; Manage deployments &rarr; New version.</p>');
    }
    const code = String((e && e.parameter && e.parameter.c) || '').slice(0, 100000);
    let html = Utilities.newBlob(Utilities.base64Decode(GAME_B64_)).getDataAsString();
    // A challenge link arrives as ?c=… ; hand it to the page, which reads this.
    if (code) html = html.replace('</head>', '<script>window.__HLC_CHALLENGE__=' +
                                  JSON.stringify(code) + ';</script></head>');
    return HtmlService.createHtmlOutput(html)
      .setTitle('High Low Casino')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput('<h2>Web app error</h2><pre>' +
      String(err && err.stack || err).replace(/</g, '&lt;') + '</pre>');
  }
}

/**
 * Run this from the editor when the web app will not open. It prints
 * everything needed to tell an account problem from a code problem.
 */
function debugInfo() {
  const out = [];
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID') || SPREADSHEET_ID_;
  out.push('Signed in as: ' + Session.getEffectiveUser().getEmail());
  out.push('Game bundle: ' + (typeof GAME_B64_ === 'undefined' ? 'MISSING - paste was cut off'
           : Math.round(GAME_B64_.length / 1024) + ' KB'));
  out.push('Spreadsheet id: ' + (id || 'NOT SET - run setup from the editor'));
  if (id) {
    try {
      const book = SpreadsheetApp.openById(id);
      out.push('Spreadsheet: ' + book.getUrl());
      const missing = TABS_.filter(function (n) { return !book.getSheetByName(n); });
      out.push('Tabs: ' + (missing.length ? 'MISSING ' + missing.join(', ') : 'all ' + TABS_.length + ' present'));
    } catch (err) { out.push('Spreadsheet ERROR: ' + err); }
  }
  // Run from the editor this returns the HEAD /dev URL, NOT the deployed /exec
  // one, so it confirms the script is reachable but says nothing about whether
  // a deployment exists. Take the /exec URL from Deploy - Manage deployments.
  let url = null;
  try { url = ScriptApp.getService().getUrl(); } catch (err) {}
  out.push('Editor (/dev) URL: ' + (url || 'none'));
  if (url) {
    // The /u/N/ form pins a URL to one account; the plain form breaks when
    // several Google accounts are signed in ("unable to open the file").
    out.push('Same URL pinned to this account: ' + url.replace('/macros/', '/macros/u/0/'));
    out.push('Apply the same /u/0/ to your /exec URL when sharing or opening it.');
  }
  const report = out.join('\n');
  console.log(report);
  return report;
}

/**
 * Cross-origin entry point, so the GitHub Pages copy of the game can log to the
 * same spreadsheet. The page posts text/plain, which is a "simple" request and
 * therefore skips the CORS preflight Apps Script cannot answer.
 *
 * This only works when the deployment's access is "Anyone", which makes the URL
 * a public write endpoint running as the owner, with validation but no
 * authentication and no rate limiting. Keep it to a test audience.
 */
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = ingest(body);
  } catch (err) {
    out = {accepted: [], error: String(err && err.message || err)};
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Reject anything malformed before it can reach a sheet. */
function validate_(records) {
  if (!Array.isArray(records) || !records.length || records.length > 20) {
    throw new Error('Expected 1–20 records.');
  }
  if (JSON.stringify(records).length > 500000) throw new Error('Batch too large.');
  records.forEach(function (r) {
    if (!r || typeof r !== 'object') throw new Error('Invalid record.');
    ['id', 'session', 'player', 'event', 'at', 'tab', 'body'].forEach(function (k) {
      if (typeof r[k] !== 'string') throw new Error('Invalid ' + k);
    });
    if (r.body.length > 20000) throw new Error('Payload chunk too long.');
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(r.event)) throw new Error('Invalid event type.');
    if (TABS_.indexOf(r.tab) < 1) throw new Error('Unknown tab ' + r.tab);
    if (!Number.isInteger(r.seq) || !Number.isInteger(r.chunk) || !Number.isInteger(r.chunks) ||
        r.chunk < 0 || r.chunk >= r.chunks || r.chunks > 10000) throw new Error('Invalid chunking.');
    if (r.id !== r.session + ':' + r.seq + ':' + r.chunk) throw new Error('Invalid record id.');
    if (!isFinite(Date.parse(r.at))) throw new Error('Invalid timestamp.');
  });
  return records;
}

/** Numbers stay numbers; everything else is forced to text so a leading
 *  = + - @ cannot be evaluated as a spreadsheet formula. */
function cell_(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : "'" + String(v == null ? '' : v);
}
function text_(v) {
  const s = String(v == null ? '' : v);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}
function ids_(sheet) {
  if (sheet.getLastRow() < 2) return {};
  const seen = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
       .forEach(function (row) { seen[text_(row[0])] = true; });
  return seen;
}
function append_(sheet, rows) {
  if (!rows.length) return;
  const start = sheet.getLastRow() + 1, last = start + rows.length - 1;
  if (last > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, last - sheet.getMaxRows()));
  }
  sheet.getRange(start, 1, rows.length, HEADERS_.length)
       .setValues(rows.map(function (r) { return r.map(cell_); }));
  SpreadsheetApp.flush();
}
function row_(r, received) {
  return [r.id, r.session + ':' + r.seq, r.at, received, r.player, r.session,
          r.event, r.chunk, r.chunks, r.body, r.build || ''];
}

/**
 * The only function the page can call. Returns the ids actually stored, so the
 * client drops exactly those from its outbox and retries the rest.
 */
function ingest(packet) {
  const records = validate_(packet && packet.records);
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || SPREADSHEET_ID_;
  if (!id) throw new Error('Not configured. Run setup_ from the editor.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Collector busy. Retry this batch.');
  try {
    const book = SpreadsheetApp.openById(id);
    const sheet = function (name) {
      const s = book.getSheetByName(name);
      if (!s) throw new Error('Missing ' + name + ' tab. Run setup from the editor.');
      return s;
    };
    const events = sheet('Events'), done = ids_(events), received = new Date().toISOString();

    // Events holds the canonical receipt: anything already there is a retry.
    const unique = {}, fresh = [];
    records.forEach(function (r) {
      if (unique[r.id] || done[r.id]) return;
      unique[r.id] = true;
      fresh.push(r);
    });
    if (!fresh.length) {
      return {accepted: records.map(function (r) { return r.id; }), inserted: 0};
    }

    // Category rows first, each de-duplicated on its own tab, so a batch that
    // died half-written last time is completed rather than duplicated.
    const groups = {};
    fresh.forEach(function (r) { (groups[r.tab] || (groups[r.tab] = [])).push(r); });
    Object.keys(groups).forEach(function (tab) {
      const target = sheet(tab), seen = ids_(target);
      append_(target, groups[tab].filter(function (r) { return !seen[r.id]; })
                                 .map(function (r) { return row_(r, received); }));
    });

    // Receipts last: a crash before this point leaves the batch retryable.
    append_(events, fresh.map(function (r) { return row_(r, received); }));
    return {accepted: records.map(function (r) { return r.id; }), inserted: fresh.length};
  } finally {
    lock.releaseLock();
  }
}
