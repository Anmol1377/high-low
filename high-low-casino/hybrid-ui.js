/* =============================================================================
   hybrid-ui.js - screens, hub, gestures, Byte, share canvas, challenge UI.
   GDD v2.3 sections 7, 11.3, 14.3, 15.3, 15.4, 17, 19, 21.
   ============================================================================= */
(function (w, d) {
"use strict";
const C = w.CONFIG, G = w.Game, H = w.Hybrid;
const $ = id => d.getElementById(id);
const el = (tag, cls, txt) => { const e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fmt = n => (n || 0).toLocaleString();
let save = G.load();
let modalOpen = false;

/* ---------------------------------------------------------------- screens -- */
const SCREENS = ["menu","custom","game","over","hub","profile","board"];
let current = "menu";
function show(name) {
  // Leaving an active run mid-flight ends it; the entry stays spent and any
  // rewards already granted stay granted. GDD 22.2.
  if (current === "game" && name !== "game" && name !== "over" && G.run()) G.abandon();
  current = name;
  SCREENS.forEach(s => $("s-" + s).hidden = (s !== name));
  if (name === "menu")    paintMenu();
  if (name === "custom")  paintCustom();
  if (name === "hub")     paintHub();
  if (name === "profile") paintProfile();
  if (name === "board")   paintBoard();
  w.scrollTo(0, 0);
}
function say(t) { $("say").textContent = t; }
function toast(text, kind) {
  const t = el("div", "toast " + (kind || ""), text);
  $("toaster").appendChild(t);
  setTimeout(() => t.remove(), 1700);
  say(text);
}
function openModal(id) { $(id).hidden = false; modalOpen = true; }
function closeModal(id) { $(id).hidden = true; modalOpen = false; }
d.addEventListener("click", e => {
  if (e.target.matches("[data-close]")) closeModal(e.target.closest(".modal").id);
});
d.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = d.querySelector(".modal:not([hidden])");
  if (open) closeModal(open.id);
});

/* ------------------------------------------------------------- top bar ----- */
function paintBar() {
  $("bar-chips").textContent = fmt(save.chips);
  $("bar-level").textContent = save.level;
  $("bar-rank").textContent  = G.rankName(save.level);
  $("bar-ava").textContent   = H.equipped(save, "avatar").art;
  $("bar-title").textContent = H.equipped(save, "title").name;
  // The in-game emote button shows whatever is equipped, not the default.
  const emote = H.equipped(save, "emote");
  $("btn-emote").textContent = emote.art;
  $("btn-emote").setAttribute("aria-label", "Send emote: " + emote.name);
  $("bar-ava").parentElement.querySelector(".ava").className =
    "ava " + H.equipped(save, "frame").css;
  const pct = save.level >= C.MAX_LEVEL ? 100 : (save.xp / C.xpToNext(save.level)) * 100;
  $("bar-xp").style.width = pct + "%";
}

/* ------------------------------------------------------------- the menu ---- */
function paintMenu() {
  paintBar();
  const broke = save.chips < C.WAGERS[0];
  $("btn-quick").disabled = broke;
  $("btn-quick").textContent = broke ? "Not enough chips" : "Quick Play · " + C.MODES[G.quickMode()].label;
  $("btn-weekend").hidden = !H.isWeekend();

  // Pending claims: login journey, daily drop, comeback, pass tiers.
  const box = $("claims"); box.innerHTML = "";
  const login = H.loginState(save);
  if (!login.claimed) {
    addClaim(box, "🎁", "Day " + (login.day + 1) + " reward",
      "+" + fmt(login.reward.chips) + " chips · " + login.reward.keys + " key", "Claim",
      () => { H.claimLogin(save); paintMenu(); });
  }
  if (H.dropReady(save)) {
    addClaim(box, "💰", "Daily drop", "+" + fmt(C.DAILY_DROP) + " chips", "Claim",
      () => { H.claimDrop(save); paintMenu(); });
  }
  const pass = H.seasonState(save);
  if (pass.claimable.length) {
    addClaim(box, "🎟", pass.season.name + " pass",
      pass.claimable.length + " tier" + (pass.claimable.length > 1 ? "s" : "") + " ready", "Open",
      () => { show("hub"); selectTab("pass"); });
  }

  const box2 = $("menu-missions"); box2.innerHTML = "";
  H.missionList(save).forEach(m => box2.appendChild(missionRow(m)));
}
function addClaim(box, icon, title, sub, label, fn) {
  const row = el("div", "claim");
  row.appendChild(el("div", "ic", icon));
  const tx = el("div", "tx"); tx.appendChild(el("b", null, title));
  tx.appendChild(el("small", null, sub)); row.appendChild(tx);
  const b = el("button", null, label); b.onclick = fn; row.appendChild(b);
  box.appendChild(row);
}
function missionRow(m) {
  const row = el("div", "mission" + (m.done ? " done" : ""));
  const top = el("div", "top");
  top.appendChild(el("span", null, m.text));
  top.appendChild(el("span", "rw", m.done ? "✓ paid" : "+" + fmt(m.chips)));
  row.appendChild(top);
  const track = el("div", "track");
  const i = el("i"); i.style.width = Math.min(100, m.at / m.target * 100) + "%";
  track.appendChild(i); row.appendChild(track);
  row.appendChild(el("div", "note", m.at + " / " + m.target));
  return row;
}

/* --------------------------------------------------------- custom play ----- */
function paintCustom() {
  const modes = $("pick-mode"); modes.innerHTML = "";
  Object.keys(C.MODES).forEach(k => {
    const m = C.MODES[k];
    if (k === "friend") return;                         // entered through a code
    if (k === "weekend" && !H.isWeekend()) return;
    const b = el("button", null, m.label);
    b.type = "button"; b.setAttribute("aria-pressed", save.mode === k);
    b.onclick = () => { save.mode = k; G.persist(); paintCustom(); };
    modes.appendChild(b);
  });

  const wag = $("pick-wager"); wag.innerHTML = "";
  C.WAGERS.forEach(v => {
    const b = el("button", null, fmt(v));
    b.type = "button"; b.disabled = v > save.chips;
    b.setAttribute("aria-pressed", save.wager === v);
    b.onclick = () => { save.wager = v; G.persist(); paintCustom(); };
    wag.appendChild(b);
  });

  const sk = $("pick-skin"); sk.innerHTML = "";
  C.SKINS.forEach(s => {
    const owned = !!save.skins[s.id];
    const b = el("button", null, s.name + (owned ? "" : " 🔒"));
    b.type = "button"; b.disabled = !owned;
    b.setAttribute("aria-pressed", save.skin === s.id);
    b.onclick = () => { save.skin = s.id; G.persist(); paintCustom(); };
    sk.appendChild(b);
  });

  const bo = $("pick-boost"); bo.innerHTML = "";
  const wagered = C.MODES[save.mode].boosters;
  Object.keys(C.BOOSTERS).forEach(k => {
    if (k === "key") return;                            // keys are spent in the album
    const def = C.BOOSTERS[k], have = save.inventory[k] || 0;
    const b = el("button", "boost");
    b.type = "button"; b.disabled = !have || !wagered;
    b.setAttribute("aria-pressed", !!save.loadout[k]);
    b.appendChild(el("span", "ic", def.icon));
    const tx = el("div", "tx"); tx.appendChild(el("b", null, def.name));
    tx.appendChild(el("small", null, def.desc)); b.appendChild(tx);
    b.appendChild(el("span", "ct", "×" + have));
    b.onclick = () => {
      if (save.loadout[k]) delete save.loadout[k]; else save.loadout[k] = true;
      G.persist(); paintCustom();
    };
    bo.appendChild(b);
  });
  $("btn-deal").disabled = C.MODES[save.mode].wagered && save.chips < C.WAGERS[0];
}

/* ------------------------------------------------------------- gameplay ---- */
const BYTE = {
  start:   ["Let's go","Deal me in","Your call"],
  correct: ["Nice read","Called it","Clean"],
  perfect: ["Against the odds!","Bold. Correct.","That was brave"],
  tie:     ["Push — streak safe","Dead heat"],
  shield:  ["Shield ate that one","Saved you"],
  chest:   ["Chest unlocked!","Milestone!"],
  record:  ["New record!","Personal best!"],
  cash:    ["Banked it","Smart stop"],
  loss:    ["Ouch","Run's over","So close"],
  legend:  ["LEGENDARY","Unreal streak"]
};
function byte(kind) {
  const list = BYTE[kind] || BYTE.start;
  $("byte-face").textContent = kind === "loss" ? "😵" : kind === "legend" ? "🤩" :
                               kind === "perfect" || kind === "chest" ? "🤩" : "🤖";
  $("byte-say").textContent = list[Math.floor(Math.random() * list.length)];
  const b = $("byte");
  b.className = "byte pop" + (kind === "loss" ? " sad" : kind === "legend" || kind === "chest" ? " hot" : "");
  setTimeout(() => b.classList.remove("pop"), 460);
}

function paintCard(node, card, faceDown) {
  if (faceDown) { node.className = "card back skin-" + save.skin; node.innerHTML = ""; return; }
  node.className = "card" + (G.isRed(card) ? " red" : "");
  node.innerHTML = "";
  node.appendChild(el("div", "r", G.FACE[card.rank] || card.rank));
  node.appendChild(el("div", "s", G.SUITS[card.suit]));
}

function paintGame() {
  const s = G.snapshot();
  if (!s) return;
  $("h-wager").textContent  = s.wager ? fmt(s.wager) : "Free";
  $("h-streak").textContent = s.streak;
  $("h-mult").textContent   = s.streak ? s.mult.toFixed(2) + "x" : "—";
  $("h-out").textContent    = s.fixed ? s.correct : fmt(s.cashout);
  $("h-out").parentElement.querySelector("span").textContent = s.fixed ? "Correct" : "Cash out";

  $("btn-hi").disabled = !s.canHigher;
  $("btn-lo").disabled = !s.canLower;
  $("btn-cash").disabled = !s.canCash;
  $("btn-cash").textContent = s.fixed ? "End Challenge" : "Cash Out";
  if (s.fixed) $("btn-cash").disabled = s.busy;
  $("btn-insure").disabled = !s.canInsure;
  $("btn-insure").textContent = s.shield ? "Protected ✓"
    : s.streak < 1 ? "Protect" : "Protect · " + fmt(s.insurance);
  $("btn-time").hidden = !(s.boosters.time && !s.extraUsed);

  $("o-hi").textContent  = Math.round(s.pHigher * 100) + "%";
  $("o-lo").textContent  = Math.round(s.pLower * 100) + "%";
  $("o-tie").textContent = Math.round(s.pTie * 100) + "%";

  // Fairness label always states which regime the player is in. GDD 5.4 / 5.5.
  $("fairlabel").textContent = s.capped
    ? "Multiplier is capped — another call can only lose your bank"
    : ghostLabel(s) || (s.fixed ? "Fixed replay · same cards for everyone, no chips at risk"
                                : "Independent draw · 13 ranks, replaced every deal");

  const heat = s.streak >= 11 ? 4 : s.streak >= 8 ? 3 : s.streak >= 5 ? 2 : s.streak >= 3 ? 1 : 0;
  d.querySelector(".wrap").dataset.heat = heat;
  paintBar();
}

/* ------------------------------------------------------- game event wiring - */
G.on("runstart", () => {
  const s = G.snapshot();
  paintCard($("card-now"), s.card);
  paintCard($("card-next"), null, true);
  byte("start");
  show("game"); paintGame();
  say("Run started. Current card " + G.cardLabel(s.card));
});
G.on("reveal", data => {
  const node = $("card-next");
  paintCard(node, data.next);
  node.classList.add("flip");
  paintGame();
  setTimeout(() => node.classList.remove("flip"), 440);
});
G.on("resolved", data => {
  const now = $("card-now");
  paintCard(now, data.next);
  paintCard($("card-next"), null, true);
  const good = data.outcome === "correct" || data.outcome === "perfect" || data.outcome === "tie";
  now.classList.add(good ? "win" : "bad");
  setTimeout(() => now.classList.remove("win", "bad"), 460);

  if (data.outcome === "perfect") byte("perfect");
  else if (data.outcome === "tie") byte("tie");
  else if (data.outcome === "protected") byte("shield");
  else if (data.outcome === "loss" || data.outcome === "reset") byte("loss");
  else if (data.streak >= 15) byte("legend");
  else byte("correct");

  if (data.outcome === "tie") toast("Tie · streak safe");
  if (data.outcome === "protected") toast("Protected · streak held", "good");
  if (data.outcome === "reset") toast("Streak reset · keep going", "bad");
  paintGame();
  say(data.outcome + ". Card " + G.cardLabel(data.next) + ". Streak " + data.streak);
});
/* The ghost: how many correct calls the friend had made by this point in
   THEIR run, against yours now. */
let elapsedMs = 0;
function ghostLabel(s) {
  const r = G.run();
  if (!s || s.mode !== "friend" || !r || !r.target) return "";
  const them = r.target.ghost.filter(t => t <= elapsedMs).length;
  const lead = s.correct - them;
  return r.target.name + " had " + them + " by now \u00b7 you " + s.correct +
         (lead > 0 ? " \u00b7 ahead" : lead < 0 ? " \u00b7 behind" : " \u00b7 level");
}
G.on("timer", t => {
  $("timerwrap").hidden = !t.span;
  if (!t.span) return;
  elapsedMs = (t.span - t.left) * 1000;
  const label = ghostLabel(G.snapshot());
  if (label) $("fairlabel").textContent = label;
  $("timerfill").style.width = (t.left / t.span * 100) + "%";
  $("timerwrap").classList.toggle("low", t.left <= 5);
});
G.on("chest", data => {
  byte("chest");
  // A modal would pause a timed run's decision clock, so timed modes get a
  // non-blocking notice instead. GDD 11.1.
  if (!data.blocking) return toast("Streak " + data.streak + " chest · +" + data.chest.xp + " XP", "gold");
  $("chest-icon").textContent = data.streak >= 15 ? "👑" : data.streak >= 8 ? "🏆" : "🎁";
  $("chest-h").textContent = "Streak " + data.streak;
  $("chest-xp").textContent = "+" + data.chest.xp + " XP";
  $("chest-note").textContent = data.chest.label;
  openModal("m-chest");
});
$("chest-ok").onclick = () => closeModal("m-chest");

G.on("levelup", d2 => toast("Level " + d2.level + " · " + d2.rank, "gold"));
G.on("unlock", u => toast(u.name + " unlocked", "gold"));
G.on("achievement", a => toast("🏅 " + a.name, "gold"));
G.on("toast", t => toast(t.text, t.kind));
G.on("pack", item => toast("Unlocked " + item.name, "gold"));

let lastResult = null;
G.on("runend", r => {
  lastResult = r;
  $("r-tag").textContent = r.tag;
  $("r-amt").textContent = r.fixed ? r.correct : fmt(r.banked);
  $("r-sub").textContent = r.fixed ? "correct calls" : "chips banked";
  if (r.mode === "friend" && r.target) {
    const t = r.target;
    $("r-tag").textContent = r.correct > t.score ? "You beat " + t.name + "!"
                           : r.correct < t.score ? t.name + " wins" : "Dead heat with " + t.name;
    $("r-sub").textContent = "correct calls \u00b7 " + t.name + " scored " + t.score;
  }
  $("r-streak").textContent = r.streak;
  $("r-mult").textContent = r.endStreak ? r.mult.toFixed(2) + "x" : "—";
  $("r-xp").textContent = r.xp;
  $("r-net").textContent = (r.net > 0 ? "+" : "") + fmt(r.net);
  $("r-net").style.color = r.net > 0 ? "var(--win)" : r.net < 0 ? "var(--lose)" : "";
  if (r.banked > 0) byte("cash");
  d.querySelector(".wrap").dataset.heat = 0;
  current = "over";
  SCREENS.forEach(s => $("s-" + s).hidden = (s !== "over"));
  paintBar();
  say(r.tag + ". Streak " + r.streak + ". " + fmt(r.banked) + " chips banked.");
});

/* ------------------------------------------------------------- the hub ----- */
const TABS = [
  ["challenges","Challenges"], ["locker","Locker"], ["collection","Collection"],
  ["pass","Pass"], ["league","League"], ["journey","Journey"], ["settings","Settings"]
];
let tab = "challenges";
function selectTab(id) { tab = id; paintHub(); }
function paintHub() {
  const nav = $("hub-tabs"); nav.innerHTML = "";
  TABS.forEach(([id, label]) => {
    const b = el("button", null, label);
    b.type = "button"; b.role = "tab"; b.setAttribute("aria-selected", tab === id);
    b.onclick = () => selectTab(id);
    nav.appendChild(b);
  });
  const body = $("hub-body"); body.innerHTML = "";
  ({challenges: hubChallenges, locker: hubLocker, collection: hubCollection,
    pass: hubPass, league: hubLeague, journey: hubJourney, settings: hubSettings}[tab])(body);
  paintBar();
}

function panel(body, title) {
  const p = el("div", "panel");
  if (title) p.appendChild(el("label", "h", title));
  body.appendChild(p); return p;
}
function hubChallenges(body) {
  const p = panel(body, "Today's missions");
  const box = el("div", "missions");
  H.missionList(save).forEach(m => box.appendChild(missionRow(m)));
  p.appendChild(box);

  const p2 = panel(body, "Daily 60s challenge");
  p2.appendChild(el("p", "note", "Same cards for every player today · free practice"));
  const best = save.challengeBest["daily-" + G.utcDay()] || 0;
  p2.appendChild(el("p", "note", "Your best today: " + best));
  const b = el("button", "ghost", "Play Daily"); b.onclick = () => startDaily();
  p2.appendChild(b);

  const p3 = panel(body, "Friend challenge");
  const b2 = el("button", "ghost", "Open challenge panel");
  b2.onclick = () => openChallenge(lastResult);
  p3.appendChild(b2);
}
function hubLocker(body) {
  // Locked items give no hint on their own, so say where they come from.
  const keys = save.inventory.key || 0, left = H.unowned(save).length;
  if (left) {
    const tip = panel(body, "Unlock more");
    tip.appendChild(el("p", "note", "Locked items come from Collection packs \u00b7 1 key each, random, never a duplicate. " +
      "Keys come from the login journey, season pass, weekly badge and personal bests."));
    const go = el("button", "ghost", keys ? "Open a pack \u00b7 " + keys + " key" + (keys > 1 ? "s" : "") : "No keys yet");
    go.disabled = !keys;
    go.onclick = () => selectTab("collection");
    tip.appendChild(go);
  }
  ["avatar","frame","title","emote"].forEach(slot => {
    const p = panel(body, slot);
    const grid = el("div", "grid");
    C.COSMETICS[slot].forEach(item => {
      const owned = !!save.owned[slot + ":" + item.id];
      const cell = el("button", "cell" + (owned ? "" : " locked"));
      cell.type = "button"; cell.disabled = !owned;
      cell.setAttribute("aria-pressed", save.equipped[slot] === item.id);
      if (item.art) cell.appendChild(el("div", "art", item.art));
      else if (item.css) { const s = el("div", "swatch " + item.css); cell.appendChild(s); }
      else cell.appendChild(el("div", "art", "🏷"));
      cell.appendChild(el("span", null, item.name));
      cell.onclick = () => { H.equip(save, slot, item.id); paintHub(); };
      grid.appendChild(cell);
    });
    p.appendChild(grid);
  });
}
function hubCollection(body) {
  const p = panel(body, "Collection album");
  const items = H.albumItems(), have = items.filter(i => save.owned[i.slot + ":" + i.id]).length;
  p.appendChild(el("p", "note", have + " of " + items.length + " collected · keys: " + (save.inventory.key || 0)));
  const grid = el("div", "grid");
  items.forEach(i => {
    const owned = !!save.owned[i.slot + ":" + i.id];
    const cell = el("div", "cell" + (owned ? "" : " locked"));
    // Frames have no emoji art - show their ring, as the Locker does.
    if (owned && i.css) cell.appendChild(el("div", "swatch " + i.css));
    else cell.appendChild(el("div", "art", owned ? (i.art || "🏷") : "❔"));
    cell.appendChild(el("span", null, owned ? i.name : "Locked"));
    grid.appendChild(cell);
  });
  p.appendChild(grid);
  const b = el("button", "big", "Open pack · 1 key");
  b.disabled = (save.inventory.key || 0) < 1;
  b.onclick = () => { H.openPack(save); paintHub(); };
  p.appendChild(b);
  p.appendChild(el("p", "note", "Cosmetic only · packs never change card outcomes or odds"));
}
function hubPass(body) {
  const st = H.seasonState(save);
  const p = panel(body, st.season.name + " · free pass");
  p.appendChild(el("p", "note", st.points + " points · tier " + st.tier + " of " + C.PASS.tiers));
  const grid = el("div", "pass");
  for (let t = 1; t <= C.PASS.tiers; t++) {
    const taken = st.claimed.indexOf(t) >= 0, open = t <= st.tier && !taken;
    const cell = el("div", "tier" + (taken ? " taken" : open ? " open" : "") + (t === C.PASS.tiers ? " final" : ""));
    cell.appendChild(el("b", null, String(t)));
    cell.appendChild(el("span", null, t === C.PASS.tiers ? "Skin" : "Key"));
    if (open) { cell.style.cursor = "pointer"; cell.onclick = () => { H.claimTier(save, t); paintHub(); }; }
    grid.appendChild(cell);
  }
  p.appendChild(grid);
  if (st.claimable.length) {
    const b = el("button", "big", "Claim " + st.claimable.length + " tier(s)");
    b.onclick = () => { st.claimable.forEach(t => H.claimTier(save, t)); paintHub(); };
    p.appendChild(b);
  }
}
function hubLeague(body) {
  const wk = H.weekState(save), lg = H.leagueOf(wk.calls);
  const p = panel(body, "This week");
  const pill = el("span", "leaguepill " + lg.id, lg.name + " · " + wk.calls + " correct calls");
  p.appendChild(pill);
  p.appendChild(el("p", "note", wk.badge ? "✓ " + C.WEEKLY_BADGE.name
    : (C.WEEKLY_BADGE.calls - wk.calls) + " more clean calls for the weekly badge"));
  const rows = (save.league || []).slice(0, 10);
  if (rows.length) {
    const list = el("ol", "board");
    rows.forEach(e => {
      const li = el("li", e.you ? "you" : "");
      li.appendChild(el("span", "nm", e.name));
      li.appendChild(el("span", "sc", e.score));
      list.appendChild(li);
    });
    p.appendChild(list);
  } else {
    p.appendChild(el("p", "note", "Finish a run to get on this week's board"));
  }
}
function hubJourney(body) {
  const st = H.loginState(save);
  const p = panel(body, "Seven day journey");
  const grid = el("div", "journey");
  C.LOGIN_JOURNEY.forEach((r, i) => {
    const cell = el("div", "jday" + (i < st.day ? " done" : i === st.day && !st.claimed ? " now" : ""));
    cell.appendChild(el("span", null, "D" + (i + 1)));
    cell.appendChild(el("b", null, fmt(r.chips)));
    cell.appendChild(el("span", null, r.keys + "🔑"));
    grid.appendChild(cell);
  });
  p.appendChild(grid);
  if (!st.claimed) {
    const b = el("button", "big", "Claim day " + (st.day + 1));
    b.onclick = () => { H.claimLogin(save); paintHub(); };
    p.appendChild(b);
  } else p.appendChild(el("p", "note", "Claimed today · come back tomorrow"));

  const p2 = panel(body, "Boosters");
  const box = el("div", "boosters");
  Object.keys(C.BOOSTERS).forEach(k => {
    const def = C.BOOSTERS[k];
    const row = el("div", "boost");
    row.appendChild(el("span", "ic", def.icon));
    const tx = el("div", "tx"); tx.appendChild(el("b", null, def.name));
    tx.appendChild(el("small", null, def.desc)); row.appendChild(tx);
    row.appendChild(el("span", "ct", "×" + (save.inventory[k] || 0)));
    box.appendChild(row);
  });
  p2.appendChild(box);
  p2.appendChild(el("p", "note", "No booster changes card probability · GDD 9.2"));
}
function hubSettings(body) {
  const p = panel(body, "Settings");
  [["sound","Sound"],["motion","Motion effects"],["haptics","Haptics"]].forEach(([k, label]) => {
    const b = el("button", "boost");
    b.type = "button"; b.setAttribute("aria-pressed", !!save.settings[k]);
    b.appendChild(el("span", "ic", save.settings[k] ? "✅" : "⬜"));
    const tx = el("div", "tx"); tx.appendChild(el("b", null, label)); b.appendChild(tx);
    b.onclick = () => {
      save.settings[k] = !save.settings[k]; G.persist();
      d.body.classList.toggle("nomotion", !save.settings.motion);
      paintHub();
    };
    p.appendChild(b);
  });

  const p2 = panel(body, "Data");
  const st = el("p", "note", "Telemetry queue: loading…");
  p2.appendChild(st);
  w.Telemetry.pending().then(n => st.textContent =
    "Telemetry queued: " + n + " records · storage " + w.Telemetry.mode() +
    (C.TELEMETRY.endpoint ? "" : " · no endpoint configured, export only"));

  const bx = el("button", "ghost", "Export save + logs");
  bx.onclick = async () => {
    const blob = new Blob([JSON.stringify({save, logs: JSON.parse(await w.Telemetry.exportJson())}, null, 2)],
      {type: "application/json"});
    const a = el("a"); a.href = URL.createObjectURL(blob);
    a.download = "high-low-casino-export.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  p2.appendChild(bx);

  const inp = el("input"); inp.type = "file"; inp.accept = "application/json"; inp.className = "input";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (parsed.save) { w.localStorage.setItem(C.SAVE_KEY, JSON.stringify(parsed.save)); }
      if (parsed.logs) await w.Telemetry.importJson(JSON.stringify(parsed.logs));
      save = G.load(); toast("Import complete", "good"); paintHub();
    } catch (e) { toast("Import failed", "bad"); }
  };
  p2.appendChild(el("label", "h", "Import"));
  p2.appendChild(inp);
  p2.appendChild(el("p", "note", "Progress lives in this browser · export before clearing site data"));
}

/* ------------------------------------------------------------- profile ----- */
function paintProfile() {
  paintBar();
  const card = $("idcard"); card.innerHTML = "";
  const av = el("div", "ava " + H.equipped(save, "frame").css, H.equipped(save, "avatar").art);
  card.appendChild(av);
  const meta = el("div", "meta");
  meta.appendChild(el("b", null, save.name));
  meta.appendChild(el("span", "ttl", H.equipped(save, "title").name));
  meta.appendChild(el("span", null, G.rankName(save.level) + " · Level " + save.level));
  card.appendChild(meta);

  const s = save.stats, calls = s.correct + s.wrong;
  const rows = [
    ["Win rate", calls ? Math.round(s.correct / calls * 100) + "%" : "–"],
    ["Best streak", s.best],
    ["Runs played", s.runs],
    ["Total predictions", s.predictions],
    ["Highest reward", fmt(s.maxBank)],
    ["Total banked", fmt(s.banked)]
  ];
  const box = $("prof-stats"); box.innerHTML = "";
  rows.forEach(([k, v]) => {
    const r = el("div"); r.appendChild(el("span", null, k)); r.appendChild(el("b", null, String(v)));
    box.appendChild(r);
  });

  const bg = $("prof-badges"); bg.innerHTML = "";
  C.ACHIEVEMENTS.forEach(a => {
    const got = !!save.achievements[a.id];
    const cell = el("div", "badge " + (got ? "got" : "locked"));
    cell.appendChild(el("span", "ic", got ? "🏅" : "🔒"));
    cell.appendChild(el("span", null, a.name));
    cell.title = a.desc;
    bg.appendChild(cell);
  });
}

/* ---------------------------------------------------------- leaderboard ---- */
function paintBoard() {
  paintBar();
  $("name-in").value = save.name;
  const list = $("board-list"); list.innerHTML = "";
  const rows = H.board(save);
  if (!rows.length) list.appendChild(el("li", null, "No banked runs yet \u00b7 cash out to get on the board"));
  rows.forEach(e => {
    const li = el("li", e.you ? "you" : "");
    li.appendChild(el("span", "nm", e.name));
    li.appendChild(el("span", "sc", e.streak + " · " + fmt(e.banked)));
    list.appendChild(li);
  });
}
$("name-in").oninput = e => {
  // Sanitised and length-capped; it is shown on share cards and boards.
  save.name = e.target.value.replace(/[<>&"']/g, "").slice(0, C.CHALLENGE.nameMax) || "Player";
  G.persist(); paintBar();
};

/* ------------------------------------------------------- share card (15.4) - */
function drawShare() {
  const cv = $("share-canvas"), x = cv.getContext("2d");
  const r = lastResult || {streak: save.stats.best, banked: save.stats.maxBank, mode: "rush"};
  const g = x.createLinearGradient(0, 0, 1080, 1920);
  g.addColorStop(0, "#0e1435"); g.addColorStop(1, "#080b1d");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);

  const ring = x.createLinearGradient(0, 300, 1080, 1500);
  ring.addColorStop(0, "#22d3ee"); ring.addColorStop(.5, "#a78bfa"); ring.addColorStop(1, "#f472b6");
  x.strokeStyle = ring; x.lineWidth = 8;
  x.strokeRect(60, 60, 960, 1800);

  x.textAlign = "center"; x.fillStyle = "#eef1ff";
  x.font = "700 62px system-ui,sans-serif";
  x.fillText("HIGH LOW CASINO", 540, 260);

  x.font = "120px system-ui,sans-serif";
  x.fillText(H.equipped(save, "avatar").art, 540, 500);

  x.font = "700 68px system-ui,sans-serif";
  x.fillText(save.name, 540, 620);
  x.fillStyle = "#22d3ee"; x.font = "44px system-ui,sans-serif";
  x.fillText(H.equipped(save, "title").name + " · " + G.rankName(save.level) + " · Lv " + save.level, 540, 690);

  x.fillStyle = "#9aa3cc"; x.font = "46px system-ui,sans-serif";
  x.fillText("STREAK", 540, 900);
  x.fillStyle = "#fbbf24"; x.font = "800 260px system-ui,sans-serif";
  x.fillText(String(r.streak || 0), 540, 1140);

  x.fillStyle = "#9aa3cc"; x.font = "44px system-ui,sans-serif";
  x.fillText("BANKED", 540, 1280);
  x.fillStyle = "#eef1ff"; x.font = "700 96px system-ui,sans-serif";
  x.fillText(fmt(r.banked || 0) + " chips", 540, 1380);

  x.fillStyle = "#9aa3cc"; x.font = "40px system-ui,sans-serif";
  x.fillText((C.MODES[r.mode] || C.MODES.rush).label + " · " +
             (C.SKINS.find(s => s.id === save.skin) || {name:"Neon"}).name + " skin", 540, 1470);

  x.fillStyle = "#f472b6"; x.font = "700 58px system-ui,sans-serif";
  x.fillText("Can you beat my streak?", 540, 1650);
  x.fillStyle = "#9aa3cc"; x.font = "34px system-ui,sans-serif";
  x.fillText("Virtual chips · no real-money value", 540, 1740);
}
function shareText() {
  const r = lastResult || {streak: save.stats.best, banked: save.stats.maxBank};
  return "I hit a " + (r.streak || 0) + " streak on High Low Casino and banked " +
         fmt(r.banked || 0) + " chips. Can you beat my streak?";
}
$("btn-share").onclick = () => { drawShare(); openModal("m-share"); };
$("share-dl").onclick = () => {
  $("share-canvas").toBlob(b => {
    const a = el("a"); a.href = URL.createObjectURL(b);
    a.download = "high-low-streak.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
};
$("share-native").onclick = () => {
  $("share-canvas").toBlob(async b => {
    const file = new File([b], "high-low-streak.png", {type: "image/png"});
    // Instagram Stories and Discord go through the native sheet or a manual
    // upload of the downloaded PNG - neither takes a web intent URL. GDD 15.4.
    if (navigator.canShare && navigator.canShare({files: [file]})) {
      try { await navigator.share({files: [file], text: shareText()}); } catch (e) {}
    } else { toast("Sharing unavailable · use Download", "bad"); }
  }, "image/png");
};
$("share-copy").onclick = () => {
  navigator.clipboard.writeText(shareText()).then(() => toast("Caption copied", "good"),
                                                  () => toast("Copy failed", "bad"));
};
$("share-wa").onclick = () => w.open("https://wa.me/?text=" + encodeURIComponent(shareText()), "_blank");
$("share-tg").onclick = () => w.open("https://t.me/share/url?url=" + encodeURIComponent(location.href) +
                                     "&text=" + encodeURIComponent(shareText()), "_blank");
$("share-x").onclick  = () => w.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText()), "_blank");

/* ------------------------------------------------ friend challenges (15.3) - */
function openChallenge(result) {
  const code = result ? H.encodeChallenge(save, result) : null;
  $("ch-out").value = code || "Finish a run to generate a code";
  $("ch-copy").disabled = $("ch-link").disabled = !code;
  openModal("m-challenge");
}
$("btn-challenge").onclick = () => openChallenge(lastResult);
$("ch-copy").onclick = () => navigator.clipboard.writeText($("ch-out").value)
  .then(() => toast("Code copied", "good"), () => toast("Copy failed", "bad"));
$("ch-link").onclick = () => {
  // A link is only useful if the friend can open it. Opened as a local file
  // there is nothing to share, so say that instead of copying a dead link.
  if (location.protocol === "file:") return toast("Links need the game hosted online · send the code", "bad");
  const url = location.href.split(/[?#]/)[0] + "?c=" + encodeURIComponent($("ch-out").value);
  navigator.clipboard.writeText(url).then(() => toast("Link copied", "good"), () => toast("Copy failed", "bad"));
};
$("ch-play").onclick = () => {
  const parsed = H.decodeChallenge($("ch-in").value.trim());
  if (!parsed) { $("ch-msg").textContent = "That code is not a valid HL1 challenge."; return; }
  closeModal("m-challenge");
  toast("Facing " + parsed.name + " · beat " + parsed.score + " correct calls", "good");
  play("friend", 0, {seed: parsed.seed, cards: parsed.cards, target: parsed});
};
/* Play Again replays exactly what was last started - same mode, same challenge
   deck - instead of guessing from save.mode. */
let lastStart = null;
function play(mode, wager, opts) {
  lastStart = {mode, wager, opts};
  return G.start(mode, wager, opts);
}
function startDaily() { play("daily", 0, {seed: "daily-" + G.utcDay()}); }

/* ---------------------------------------------------------------- input ---- */
$("btn-quick").onclick  = () => play(G.quickMode(), G.quickWager());
$("btn-daily").onclick  = startDaily;
$("btn-weekend").onclick= () => play("weekend", G.quickWager());
$("btn-custom").onclick = () => show("custom");
$("custom-back").onclick= () => show("menu");
$("btn-deal").onclick   = () => play(save.mode, save.wager);
$("btn-hub").onclick    = () => show("hub");
$("hub-back").onclick   = () => show("menu");
$("btn-board").onclick  = () => show("board");
$("board-back").onclick = () => show("menu");
$("open-profile").onclick = () => show("profile");
$("profile-back").onclick = () => show("menu");
$("btn-home").onclick   = () => show("menu");
$("btn-again").onclick  = () => lastStart ? play(lastStart.mode, lastStart.wager, lastStart.opts)
                                          : play(save.mode, save.wager);
$("btn-quit").onclick   = () => { G.abandon(); show("menu"); };

$("btn-hi").onclick     = () => { G.emit("gesture_action", {kind:"button", dir:"hi"}); G.predict("hi"); };
$("btn-lo").onclick     = () => { G.emit("gesture_action", {kind:"button", dir:"lo"}); G.predict("lo"); };
$("btn-cash").onclick   = () => G.cashOut(false);
$("btn-insure").onclick = () => { G.buyInsurance(); paintGame(); };
$("btn-time").onclick   = () => { G.addTime(); paintGame(); };
$("btn-emote").onclick  = () => toast(H.equipped(save, "emote").art + " " + H.equipped(save, "emote").name);


/* Keyboard: the accessible equivalent of every gesture. GDD 7, 19. */
d.addEventListener("keydown", e => {
  if (current !== "game" || modalOpen) return;
  if (e.key === "ArrowUp")   { e.preventDefault(); G.predict("hi"); }
  if (e.key === "ArrowDown") { e.preventDefault(); G.predict("lo"); }
  if (e.key === "c" || e.key === "C") G.cashOut(false);
});

/* Gestures: up = higher, down = lower, right = cash out, hold = insurance.
   One action per pointer, so a drag cannot submit twice. Buttons stay the
   accessible alternative and the rest of the page keeps scrolling. GDD 7. */
let sx = 0, sy = 0, tracking = false, holdTimer = null, held = false;
const felt = $("felt");
felt.addEventListener("pointerdown", e => {
  if (modalOpen) return;
  sx = e.clientX; sy = e.clientY; tracking = true; held = false;
  holdTimer = setTimeout(() => {
    held = true;
    if (G.buyInsurance()) { G.emit("gesture_action", {kind:"hold", action:"insurance"}); paintGame(); }
  }, 600);
});
function endPointer(e) {
  clearTimeout(holdTimer);
  if (!tracking) return;
  tracking = false;
  if (held) return;                               // the hold already acted
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) {
    G.emit("gesture_action", {kind:"swipe", dir: dy < 0 ? "hi" : "lo"});
    G.predict(dy < 0 ? "hi" : "lo");
  } else if (dx > 45 && Math.abs(dx) > Math.abs(dy)) {
    G.emit("gesture_action", {kind:"swipe", action:"cashout"});
    G.cashOut(false);
  }
}
felt.addEventListener("pointerup", endPointer);
felt.addEventListener("pointercancel", () => { clearTimeout(holdTimer); tracking = false; });

/* ------------------------------------------------------------------ boot --- */
function boot() {
  w.Telemetry.init();
  d.body.classList.toggle("nomotion", !save.settings.motion);
  H.checkComeback(save);
  H.rollMissions(save);
  H.weekState(save);
  H.seasonState(save);

  // A hosted challenge link prefills the Friend panel. GDD 15.3.
  const code = new URLSearchParams(location.search).get("c");
  if (code) { $("ch-in").value = code; openChallenge(null); }

  show("menu");
  w.addEventListener("pagehide", () => { if (G.run()) G.abandon(); });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}
boot();
})(window, document);
