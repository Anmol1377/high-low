/** High Low Google Sheets collector. Uses built-in SpreadsheetApp; no advanced service setup required.
 * Public RPC surface: ingest only. Admin helpers end in _ and cannot be called by the game.
 */
const SPREADSHEET_ID_='1U_flthuVDd1r54G_2hK8UMXPBkrt9mlD-8p3WMKawus';
const BASE_=['record_id','event_id','client_time_utc','received_time_utc','player_id','session_id','run_id','event_type','part_index','part_count','payload_json','sequence','build'];
const TABS_={
  Events:[],Sessions:['elapsedMs','visibleMs'],Runs:['name','mode','streak','reward','xp','elapsedMs'],
  Predictions:['mode','direction','result','fromRank','toRank','streak'],
  Economy:['currency','amount','before','after','reason'],Snapshots:['name','chips','xp','level','rank','streak','skin'],
  Progression:['level','rank','xp','amount'],Missions:[],Achievements:[],Cosmetics:[],UI:[],Errors:[]
};
const PLAYER_HEADERS_=['player_id','client_time_utc','session_id','display_name','chips','total_xp','level','rank','best_streak','skin','snapshot_event_id','snapshot_parts'];
// Latest projection and append-only history. Raw, chunked full saves still live in Snapshots and Events.
const PROGRESS_HEADERS_=['snapshot_id','player_id','revision','client_time_utc','received_time_utc','session_id','display_name','chips','total_xp','level','rank','best_streak','skin','runs_played','last_daily_reward_ms','total_runs','correct','incorrect','ties','total_predictions','cashouts','highest_reward','total_rewards','average_streak','win_rate','mission_day','mission_1_id','mission_1_progress','mission_1_claimed','mission_2_id','mission_2_progress','mission_2_claimed','mission_3_id','mission_3_progress','mission_3_claimed','achievements_json','owned_cosmetics_json','inventory_json','identity_json','season_skins_json','weekly_badges_json','season_id','season_points','season_claimed_json','week_id','week_correct','league','login_date','login_count','daily_best_json','last_mode','last_wager','perfect_calls','last_seen_ms','settings_json','source_event_id','projection_json'];
function setup_(){
  const props=PropertiesService.getScriptProperties();let id=props.getProperty('SPREADSHEET_ID')||SPREADSHEET_ID_;
  const book=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('High Low Casino — Game Data');
  const blank=!id?book.getSheets()[0]:null;
  props.setProperty('SPREADSHEET_ID',book.getId());
  Object.keys(TABS_).forEach(name=>prepareTab_(book,name,BASE_.concat(TABS_[name])));
  prepareTab_(book,'Players',PLAYER_HEADERS_);
  prepareTab_(book,'Player_Progress',PROGRESS_HEADERS_);
  prepareTab_(book,'Progress_History',PROGRESS_HEADERS_);
  if(blank&&!blank.getLastRow()&&!TABS_[blank.getName()]&&!['Players','Player_Progress','Progress_History'].includes(blank.getName()))book.deleteSheet(blank);
  console.log('Spreadsheet: '+book.getUrl());return book.getUrl();
}
function prepareTab_(book,name,headers){
  let s=book.getSheetByName(name);if(!s)s=book.insertSheet(name);
  if(s.getMaxColumns()<headers.length)s.insertColumnsAfter(s.getMaxColumns(),headers.length-s.getMaxColumns());
  if(s.getLastRow()>0){const existing=s.getRange(1,1,1,headers.length).getValues()[0];if(JSON.stringify(existing)!==JSON.stringify(headers))throw Error('Unexpected headers in '+name+'. Use a fresh spreadsheet or restore these headers.');return;}
  s.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#eeeeee').setFontColor('#111111');s.setFrozenRows(1);
}
function doGet(e){
  if(!(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||SPREADSHEET_ID_))return HtmlService.createHtmlOutput('Owner setup required: run setup_ in the Apps Script editor first.');
  const t=HtmlService.createTemplateFromFile('Game');
  t.boot=JSON.stringify({url:ScriptApp.getService().getUrl(),challenge:String(e?.parameter?.challenge||'').slice(0,100000)}).replace(/</g,'\\u003c');
  return t.evaluate().setTitle('High Low Casino').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function route_(type){
  if(type==='player_snapshot')return 'Snapshots';
  if(type.startsWith('session_')||type.startsWith('network_'))return 'Sessions';
  if(type.startsWith('run_'))return 'Runs';
  if(type.startsWith('prediction_'))return 'Predictions';
  if(type==='economy_transaction')return 'Economy';
  if(type.startsWith('mission_'))return 'Missions';
  if(type.startsWith('achievement_'))return 'Achievements';
  if(/pack|cosmetic|skin|pass/.test(type))return 'Cosmetics';
  if(/error/.test(type))return 'Errors';
  if(type==='ui_click'||type==='gesture_action')return 'UI';
  return 'Progression';
}
function progressPayload_(r){
  if(r.parts!==1||r.part!==0)throw Error('Progress projection must fit one chunk.');
  let d;try{d=JSON.parse(r.json);}catch(_){throw Error('Invalid progress JSON.');}
  if(!d||typeof d!=='object'||Array.isArray(d)||!Number.isSafeInteger(d.revision)||d.revision<1||d.saveVersion!==2||typeof d.name!=='string'||d.name.length>100||!Number.isSafeInteger(d.chips)||d.chips<0||!Number.isSafeInteger(d.totalXp)||d.totalXp<0||!Number.isInteger(d.level)||d.level<1||d.level>50||!Array.isArray(d.missions)||d.missions.length>3||typeof d.stats!=='object'||!d.stats||Array.isArray(d.stats))throw Error('Invalid progress projection.');
  return d;
}
function progressLine_(r,received){
  const d=progressPayload_(r),s=d.stats||{},m=d.missions||[],h=i=>m[i]||{},n=v=>Number.isFinite(v)&&v>=0?v:0,j=v=>JSON.stringify(v??null);
  const answered=n(s.correct)+n(s.incorrect),runs=n(s.totalRuns);
  return [r.playerId+':'+d.revision,r.playerId,d.revision,r.at,received,r.sessionId,d.name,d.chips,d.totalXp,d.level,d.rank||'',n(d.bestStreak),d.cardSkin||'',n(d.runsPlayed),n(d.lastDailyReward),runs,n(s.correct),n(s.incorrect),n(s.ties),n(s.totalPredictions),n(s.cashouts),n(s.highestReward),n(s.totalRewards),runs?n(s.totalStreak)/runs:0,answered?n(s.correct)/answered:0,d.missionDay||'',h(0).id||'',n(h(0).progress),Boolean(h(0).claimed),h(1).id||'',n(h(1).progress),Boolean(h(1).claimed),h(2).id||'',n(h(2).progress),Boolean(h(2).claimed),j(d.achievements),j(d.owned),j(d.inventory),j(d.identity),j(d.seasonSkins),j(d.weeklyBadges),d.season?.id||'',n(d.season?.points),j(d.season?.claimed),d.week?.id||'',n(d.week?.correct),d.week?.league||'',d.login?.date||'',n(d.login?.count),j(d.dailyBest),d.lastMode||'',n(d.lastWager),n(d.perfectCalls),n(d.lastSeen),j(d.settings),r.eventId,r.json];
}
function validate_(packet){
  if(!packet||packet.version!==1||!Array.isArray(packet.records)||packet.records.length<1||packet.records.length>20)throw Error('Invalid batch: expected 1–20 records.');
  if(JSON.stringify(packet).length>500000)throw Error('Batch is too large.');
  packet.records.forEach(r=>{
    if(!r||typeof r.json!=='string'||r.json.length>20000||!Number.isInteger(r.part)||!Number.isInteger(r.parts)||r.part<0||r.part>=r.parts||r.parts>10000)throw Error('Invalid payload chunk.');
    for(const k of ['id','eventId','playerId','sessionId','runId','type','at'])if(typeof r[k]!=='string'||r[k].length>200)throw Error('Invalid '+k);
    if(!/^[a-z][a-z0-9_]{0,63}$/.test(r.type)||!Number.isInteger(r.sequence)||r.sequence<1||r.eventId!==r.sessionId+'-'+r.sequence||r.id!==r.eventId+'.'+r.part||!r.playerId||!r.sessionId||!Number.isFinite(Date.parse(r.at)))throw Error('Invalid event identity or timestamp.');
    if(!r.summary||typeof r.summary!=='object'||Array.isArray(r.summary)||JSON.stringify(r.summary).length>5000)throw Error('Invalid event summary.');
    Object.values(r.summary).forEach(v=>{if(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean'&&v!==null)throw Error('Summary values must be scalar.');if(typeof v==='string'&&v.length>500)throw Error('Summary value too long.');if(typeof v==='number'&&!Number.isFinite(v))throw Error('Invalid number.');});
    if(r.type==='progress_snapshot')progressPayload_(r);
  });return packet.records;
}
function row_(r,received,fields){return [r.id,r.eventId,r.at,received,r.playerId,r.sessionId,r.runId,r.type,r.part,r.parts,r.json,r.sequence,r.build||""].concat(fields.map(k=>r.summary[k]??''));}
function textCell_(v){const s=String(v??'');return s.startsWith("'")?s.slice(1):s;}
function sheetIds_(sheet){return new Set(sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().map(r=>textCell_(r[0])));}
function safeValue_(v){return typeof v==='number'&&Number.isFinite(v)?v:"'"+String(v??'');}
function writeRows_(sheet,start,rows){
  if(!rows.length)return;
  const last=start+rows.length-1;if(last>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),Math.max(100,last-sheet.getMaxRows()));
  sheet.getRange(start,1,rows.length,rows[0].length).setValues(rows.map(r=>r.map(safeValue_)));
  SpreadsheetApp.flush();
}
function ingest(packet){
  const records=validate_(packet),id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')||SPREADSHEET_ID_;
  if(!id)throw Error('Spreadsheet not configured.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw Error('Collector busy. Retry this batch.');
  try{
    const book=SpreadsheetApp.openById(id),tabs={};for(const name of Object.keys(TABS_).concat(['Players','Player_Progress','Progress_History'])){tabs[name]=book.getSheetByName(name);if(!tabs[name])throw Error('Missing '+name+' tab. Run setup_ from the editor.');}
    const canonical=sheetIds_(tabs.Events),unique=new Map(records.map(r=>[r.id,r])),fresh=[...unique.values()].filter(r=>!canonical.has(r.id));
    if(!fresh.length)return {ok:true,acked:records.map(r=>r.id),inserted:0};
    const received=new Date().toISOString(),groups={};
    for(const r of fresh){const dest=route_(r.type);(groups[dest]||(groups[dest]=[])).push(r);}
    // Every destination has its own row IDs. A partial write is safely completed on retry.
    for(const [name,items] of Object.entries(groups)){
      const seen=sheetIds_(tabs[name]),missing=items.filter(r=>!seen.has(r.id));
      writeRows_(tabs[name],tabs[name].getLastRow()+1,missing.map(r=>row_(r,received,TABS_[name])));
    }
    const snapshotBest=new Map();for(const r of fresh.filter(r=>r.type==='player_snapshot'&&r.part===0)){const prev=snapshotBest.get(r.playerId);if(!prev||Date.parse(r.at)>=Date.parse(prev.at))snapshotBest.set(r.playerId,r);}
    if(snapshotBest.size){const sheet=tabs.Players,rows=sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,PLAYER_HEADERS_.length).getValues(),index=new Map(rows.map((r,i)=>[textCell_(r[0]),{row:i+2,at:Date.parse(textCell_(r[1]))||0}]));
      for(const r of snapshotBest.values()){const old=index.get(r.playerId);if(old&&Date.parse(r.at)<old.at)continue;const s=r.summary,line=[r.playerId,r.at,r.sessionId,s.name,s.chips,s.xp,s.level,s.rank,s.streak,s.skin,r.eventId,r.parts];writeRows_(sheet,old?old.row:sheet.getLastRow()+1,[line]);}
    }
    const progress=fresh.filter(r=>r.type==='progress_snapshot').sort((a,b)=>progressPayload_(a).revision-progressPayload_(b).revision);
    if(progress.length){
      const history=tabs.Progress_History,latest=tabs.Player_Progress;
      const historyRows=history.getLastRow()<2?[]:history.getRange(2,1,history.getLastRow()-1,PROGRESS_HEADERS_.length).getValues();
      const historyIndex=new Map(historyRows.map(row=>[textCell_(row[0]),textCell_(row[PROGRESS_HEADERS_.length-1])]));
      const latestRows=latest.getLastRow()<2?[]:latest.getRange(2,1,latest.getLastRow()-1,PROGRESS_HEADERS_.length).getValues();
      const latestIndex=new Map(latestRows.map((row,i)=>[textCell_(row[1]),{row:i+2,revision:Number(row[2])||0}]));
      for(const r of progress){
        const line=progressLine_(r,received),snapshotId=line[0],prior=historyIndex.get(snapshotId);
        if(prior!==undefined&&prior!==r.json)throw Error('Conflicting progress revision '+snapshotId);
        if(prior===undefined){writeRows_(history,history.getLastRow()+1,[line]);historyIndex.set(snapshotId,r.json);}
        const old=latestIndex.get(r.playerId);
        if(!old||line[2]>old.revision){const row=old?.row||latest.getLastRow()+1;writeRows_(latest,row,[line]);latestIndex.set(r.playerId,{row,revision:line[2]});}
      }
    }
    // Canonical receipts are committed last, after all categorized data has been flushed.
    writeRows_(tabs.Events,tabs.Events.getLastRow()+1,fresh.map(r=>row_(r,received,[])));
    return {ok:true,acked:records.map(r=>r.id),inserted:fresh.length};
  }finally{lock.releaseLock();}
}
