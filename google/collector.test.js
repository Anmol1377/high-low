/* Collector checks with stubbed Google services. Run: node google/collector.test.js
   Apps Script itself cannot run here, so this exercises the parts that decide
   what gets written: validation, de-duplication, partial-write recovery and
   formula safety. */
const fs = require("fs"), assert = require("assert"), path = require("path");

function makeBook() {
  const sheets = {};
  const mk = name => {
    const rows = [];
    return {
      name, rows,
      getLastRow: () => rows.length,
      getMaxRows: () => Math.max(1000, rows.length),
      insertRowsAfter() {},
      setFrozenRows() {},
      getRange(r, c, nr, nc) {
        return {
          getValues: () => rows.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)),
          setValues(vals) { vals.forEach((v, i) => rows[r - 1 + i] = v.slice()); return this; },
          setFontWeight() { return this; }, setBackground() { return this; }
        };
      }
    };
  };
  return {
    getId: () => "book1", getUrl: () => "http://sheet",
    getSheetByName: n => sheets[n] || null,
    insertSheet(n) { return sheets[n] = mk(n); },
    _sheets: sheets
  };
}
const book = makeBook();
const props = {};
const ctx = {
  SpreadsheetApp: {openById: () => book, create: () => book, flush() {}},
  PropertiesService: {getScriptProperties: () => ({
    getProperty: k => props[k] || null, setProperty: (k, v) => props[k] = v})},
  LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
  HtmlService: {}, Utilities: {}, ScriptApp: {}, console,
  Array, JSON, Date, Number, String, Object, Error, isFinite, RegExp
};
const src = fs.readFileSync(path.join(__dirname, "collector.gs"), "utf8");
new Function(...Object.keys(ctx), src + "\nthis.__api = {setup, ingest, validate_, cell_};")
  .call(ctx, ...Object.values(ctx));
const {setup, ingest, validate_, cell_} = ctx.__api;

const idsOf = sheet => sheet.rows.slice(1).map(r => String(r[0]).replace(/^'/, ""));

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log("  ✓ " + name); };

const rec = (seq, over) => Object.assign({
  id: "s1:" + seq + ":0", session: "s1", seq, chunk: 0, chunks: 1, player: "p1",
  tab: "runs", event: "run_completed", at: "2026-09-28T10:00:00.000Z",
  body: '{"streak":5}', build: "2.3.3"
}, over);

setup();
ok("setup creates Events plus one tab per category", () => {
  assert.strictEqual(Object.keys(book._sheets).length, 12);
  assert(book._sheets.Events && book._sheets.runs && book._sheets.snapshots);
  assert.strictEqual(book._sheets.Events.rows[0][0], "record_id");
});
ok("setup is safe to re-run and refuses a foreign table", () => {
  setup();
  assert.strictEqual(book._sheets.Events.rows.length, 1, "header duplicated");
  book._sheets.runs.rows[0] = ["something", "else"];
  assert.throws(() => setup(), /Unexpected headers/);
  book._sheets.runs.rows[0] = book._sheets.Events.rows[0].slice();
});
ok("a batch writes one category row and one receipt", () => {
  const out = ingest({records: [rec(1)]});
  assert.deepStrictEqual(out.accepted, ["s1:1:0"]);
  assert.strictEqual(out.inserted, 1);
  assert.strictEqual(book._sheets.runs.rows.length, 2);
  assert.strictEqual(book._sheets.Events.rows.length, 2);
});
ok("a resend of the same record is acknowledged but not rewritten", () => {
  const out = ingest({records: [rec(1)]});
  assert.deepStrictEqual(out.accepted, ["s1:1:0"]);
  assert.strictEqual(out.inserted, 0);
  assert.strictEqual(book._sheets.runs.rows.length, 2);
  assert.strictEqual(book._sheets.Events.rows.length, 2);
});
ok("a half-written batch is completed, not duplicated, on retry", () => {
  // Simulate dying after the category row but before the receipt.
  const r = rec(2);
  book._sheets.runs.rows.push([r.id, "s1:2", r.at, "x", "p1", "s1", r.event, 0, 1, r.body, "2.3.3"]);
  const out = ingest({records: [r]});
  assert.strictEqual(out.inserted, 1, "receipt must still be written");
  assert.strictEqual(idsOf(book._sheets.runs).filter(x => x === r.id).length, 1, "duplicated row");
  assert.strictEqual(idsOf(book._sheets.Events).filter(x => x === r.id).length, 1, "receipt missing");
});
ok("formula-looking text is stored as text", () => {
  ingest({records: [rec(3, {body: '=HYPERLINK("http://evil","x")'})]});
  const row = book._sheets.runs.rows.find(r => String(r[0]).replace(/^'/, "") === "s1:3:0");
  assert.strictEqual(row[9][0], "'", "payload must be escaped to text");
  assert.strictEqual(cell_(42), 42, "numbers stay numbers");
});
ok("malformed batches are rejected before any write", () => {
  const before = book._sheets.Events.rows.length;
  [null, [], new Array(21).fill(rec(9)),
   [rec(4, {id: "wrong"})],
   [rec(5, {tab: "Events"})],          // receipts tab is not a destination
   [rec(6, {tab: "../etc"})],
   [rec(7, {event: "DROP TABLE"})],
   [rec(8, {at: "not a date"})],
   [rec(9, {chunk: 5})],               // chunk beyond chunks
   [rec(10, {body: "x".repeat(20001)})]
  ].forEach(bad => assert.throws(() => ingest({records: bad}), "accepted " + JSON.stringify(bad)));
  assert.strictEqual(book._sheets.Events.rows.length, before, "a rejected batch wrote rows");
});
ok("each event type lands on its own tab", () => {
  ingest({records: [rec(11, {tab: "economy", event: "economy_transaction"}),
                    rec(12, {tab: "errors", event: "save_error"})]});
  assert.strictEqual(book._sheets.economy.rows.length, 2);
  assert.strictEqual(book._sheets.errors.rows.length, 2);
});
console.log(`\n${pass} collector checks passed.\n`);
