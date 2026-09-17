/* =============================================================================
   telemetry.js - event capture, chunking, outbox, retries, export and import.
   GDD v2.3 section 23.

   Records are idempotent by (session, sequence, chunk), so a retry after a lost
   acknowledgement cannot duplicate a row. Only acknowledged ids leave the
   outbox. IndexedDB is primary, localStorage then memory are fallbacks.

   No endpoint is configured by default: automatic upload only works from the
   Apps Script web-app URL because it needs the authenticated bridge (GDD 23.5),
   so on ordinary hosting this queues and exports instead of posting.
   ============================================================================= */
(function (w) {
"use strict";
const C = () => w.CONFIG.TELEMETRY;
const DB = "hlc-telemetry", STORE = "outbox", LS = "hlc-outbox-v1";

const sessionId = "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
let playerId = null, seq = 0, db = null, mem = [], mode = "memory", sending = false, backoff = 0;

function getPlayerId() {
  try {
    playerId = w.localStorage.getItem("hlc-player-id");
    if (!playerId) {
      playerId = "p-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      w.localStorage.setItem("hlc-player-id", playerId);
    }
  } catch (e) { playerId = playerId || "p-anon"; }
  return playerId;
}

/* ------------------------------------------------------------- storage ----- */
function openDb() {
  return new Promise(resolve => {
    if (!w.indexedDB) return resolve(null);
    let req;
    try { req = w.indexedDB.open(DB, 1); } catch (e) { return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, {keyPath: "id"});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
function tx(fn, write) {
  return new Promise(resolve => {
    if (!db) return resolve(null);
    let t;
    try { t = db.transaction(STORE, write ? "readwrite" : "readonly"); }
    catch (e) { return resolve(null); }
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : true);
    t.onerror = () => resolve(null);
  });
}
function lsRead()  { try { return JSON.parse(w.localStorage.getItem(LS) || "[]"); } catch (e) { return []; } }
function lsWrite(a){ try { w.localStorage.setItem(LS, JSON.stringify(a.slice(-500))); } catch (e) {} }

async function put(rec) {
  if (mode === "idb")   return tx(s => s.put(rec), true);
  if (mode === "local") { const a = lsRead(); a.push(rec); lsWrite(a); return; }
  mem.push(rec); if (mem.length > 500) mem.shift();
}
async function all() {
  if (mode === "idb")   return (await tx(s => s.getAll())) || [];
  if (mode === "local") return lsRead();
  return mem.slice();
}
async function drop(ids) {
  const set = new Set(ids);
  if (mode === "idb")   { await tx(s => { ids.forEach(id => s.delete(id)); }, true); return; }
  if (mode === "local") { lsWrite(lsRead().filter(r => !set.has(r.id))); return; }
  mem = mem.filter(r => !set.has(r.id));
}

/* ---- category routing: which sheet tab an event belongs to (GDD 23.2) ---- */
const TABS = {
  session: /^session_|^network_/, runs: /^run_/, predictions: /^prediction_/,
  economy: /^economy_|^insurance_|^chest_/, progression: /^xp_|^level_|^login_|^comeback_|^boosters_|^booster_/,
  missions: /^mission_/, achievements: /^achievement_/, cosmetics: /^pack_|^cosmetic_|^pass_/,
  ui: /^ui_|^gesture_/, errors: /^browser_error|^save_error/, snapshots: /^player_snapshot/
};
function tabFor(evt) {
  for (const tab in TABS) if (TABS[tab].test(evt)) return tab;
  return "events";
}

/* Formula-looking strings are stored as text so a collector cannot be tricked
   into evaluating them as a spreadsheet formula. GDD 23.3. */
function safe(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  if (v && typeof v === "object") {
    const out = Array.isArray(v) ? [] : {};
    for (const k in v) out[k] = safe(v[k]);
    return out;
  }
  return v;
}

/* --------------------------------------------------------------- capture --- */
async function log(evt, data) {
  const body = JSON.stringify(safe(data || {}));
  const chunks = [];
  for (let i = 0; i < Math.max(1, Math.ceil(body.length / C().chunkChars)); i++) {
    chunks.push(body.slice(i * C().chunkChars, (i + 1) * C().chunkChars));
  }
  const n = seq++;
  for (let i = 0; i < chunks.length; i++) {
    await put({
      id: sessionId + ":" + n + ":" + i,            // idempotent across retries
      session: sessionId, seq: n, chunk: i, chunks: chunks.length,
      player: playerId, tab: tabFor(evt), event: evt,
      at: new Date().toISOString(), body: chunks[i]
    });
  }
  schedule();
}

/* ---------------------------------------------------------------- deliver -- */
async function flush() {
  if (sending) return;
  const url = C().endpoint;
  if (!url) return;                                  // queue-only on plain hosting
  if (!w.navigator.onLine) return;
  sending = true;
  try {
    const batch = (await all()).slice(0, C().batchSize);
    if (!batch.length) { sending = false; return; }
    const res = await fetch(url, {
      method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({records: batch})
    });
    const ack = await res.json();
    // Only acknowledged ids leave the outbox; anything else is retried.
    const ids = (ack && Array.isArray(ack.accepted)) ? ack.accepted : [];
    if (ids.length) await drop(ids);
    backoff = ids.length ? 0 : Math.min((backoff || C().retryBaseMs) * 2, C().retryMaxMs);
  } catch (e) {
    backoff = Math.min((backoff || C().retryBaseMs) * 2, C().retryMaxMs);
  }
  sending = false;
  if (backoff) setTimeout(flush, backoff);
}
let timer = null;
function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 1200);
}

/* --------------------------------------------------------- export/import --- */
async function exportJson() {
  const rows = await all();
  return JSON.stringify({build: w.CONFIG.BUILD, player: playerId, session: sessionId,
                         exported: new Date().toISOString(), records: rows}, null, 2);
}
async function importJson(text) {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed.records) ? parsed.records : [];
  for (const r of rows) if (r && r.id) await put(r);
  return rows.length;
}
async function pending() { return (await all()).length; }
async function clear() {
  if (mode === "idb") await tx(s => s.clear(), true);
  else if (mode === "local") lsWrite([]);
  else mem = [];
}

/* ------------------------------------------------------------------ boot --- */
async function init() {
  getPlayerId();
  db = await openDb();
  mode = db ? "idb" : (function () {
    try { w.localStorage.setItem(LS, w.localStorage.getItem(LS) || "[]"); return "local"; }
    catch (e) { return "memory"; }
  })();

  log("game_loaded", {build: w.CONFIG.BUILD, storage: mode});
  log("session_start", {ua: navigator.userAgent.slice(0, 120), lang: navigator.language});

  setInterval(() => log("session_heartbeat", {elapsed: Math.round(performance.now() / 1000)}), 60000);
  document.addEventListener("visibilitychange", () =>
    log("session_visibility", {state: document.visibilityState}));
  w.addEventListener("online",  () => { backoff = 0; log("network_online", {}); flush(); });
  w.addEventListener("offline", () => log("network_offline", {}));
  w.addEventListener("pagehide", () => log("session_pagehide", {}));
  w.addEventListener("error", e =>
    log("browser_error", {message: String(e.message).slice(0, 300), src: e.filename}));
}

w.Telemetry = {log, flush, exportJson, importJson, pending, clear, init,
               ids: () => ({player: playerId, session: sessionId}), mode: () => mode};
})(window);
