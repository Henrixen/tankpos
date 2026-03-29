import { supabase } from "./supabaseclient";

const SK       = "tankpos-v5";
const CK       = "tankpos-cargo-v2";
const HK       = "tankpos-history-v1";
const RATE_KEY = "rates";
export const WS_STORE = "ws-data";

// ─── loadAll ───
async function loadAll() {
  let vessels = [], cargoes = [];
  // 1. Fetch your vessel database from Supabase
  let allRows = [];
let from = 0;
const pageSize = 1000;
while(true){
  const {data, error} = await supabase.from("vessels_db").select("*").range(from, from+pageSize-1);
  if(error || !data || data.length === 0) break;
  allRows = [...allRows, ...data];
  if(data.length < pageSize) break;
  from += pageSize;
}
const vDB = {};
allRows.forEach(row => {
  if(row.vessel) vDB[row.vessel.toLowerCase().trim()] = row;
});

  try {
    const rv = await window.storage.get(SK, true);
    const rc = await window.storage.get(CK, true);
    vessels = rv ? JSON.parse(rv.value) : [];
    cargoes = rc ? JSON.parse(rc.value) : [];
  } catch (_) {
    vessels = JSON.parse(localStorage.getItem(SK) || "[]");
    cargoes = JSON.parse(localStorage.getItem(CK) || "[]");
  }

  // 2. Pass the fetched database (vDB) instead of an empty object
  vessels = vessels.map(v => enrichV(v, vDB)); 
  return { vessels, cargoes };
}

// ─── saveV ───
async function saveV(v){try{await window.storage.set(SK,JSON.stringify(v),true);}catch(_){}try{localStorage.setItem(SK,JSON.stringify(v));}catch(_){}}
async function saveC(c){try{await window.storage.set(CK,JSON.stringify(c),true);}catch(_){}try{localStorage.setItem(CK,JSON.stringify(c));}catch(_){}}

// ─── Backup / Restore ─────────────────────────────────────────────────────────
function backupData(vessels, cargoes){
  const blob=new Blob([JSON.stringify({vessels,cargoes,exportedAt:new Date().toISOString(),v:2},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="tankpos-backup-"+new Date().toLocaleDateString("en-GB").replace(/\//g,"-")+".json";
  a.click();URL.revokeObjectURL(a.href);
}

// ─── saveC ───
async function saveC(c){try{await window.storage.set(CK,JSON.stringify(c),true);}catch(_){}try{localStorage.setItem(CK,JSON.stringify(c));}catch(_){}}

// ─── Backup / Restore ─────────────────────────────────────────────────────────
function backupData(vessels, cargoes){
  const blob=new Blob([JSON.stringify({vessels,cargoes,exportedAt:new Date().toISOString(),v:2},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="tankpos-backup-"+new Date().toLocaleDateString("en-GB").replace(/\//g,"-")+".json";
  a.click();URL.revokeObjectURL(a.href);
}

// ─── backupData ───
function backupData(vessels, cargoes){
  const blob=new Blob([JSON.stringify({vessels,cargoes,exportedAt:new Date().toISOString(),v:2},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="tankpos-backup-"+new Date().toLocaleDateString("en-GB").replace(/\//g,"-")+".json";
  a.click();URL.revokeObjectURL(a.href);
}

// ─── restoreData ───
function restoreData(file,onVessels,onCargoes){
  const r=new FileReader();
  r.onload=e=>{
    try{
      const d=JSON.parse(e.target.result);
      if(d.vessels)onVessels(d.vessels);
      if(d.cargoes)onCargoes(d.cargoes);
    }catch(err){alert("Invalid backup file: "+err.message);}
  };
  r.readAsText(file);
}

// ─── loadHistory ───
async function loadHistory() {
  try { const r = await window.storage.get(HK,true); return r ? JSON.parse(r.value) : []; }
  catch(_) { return JSON.parse(localStorage.getItem(HK)||"[]"); }
}

// ─── saveSnapshot ───
async function saveSnapshot(vessels) {
  // Calculate fixing window avg for this snapshot
  const today = new Date(); today.setHours(0,0,0,0);
  const open = vessels.filter(v => v.date && v.openPort && v.openPort !== "EMPLOYED");
  const withDays = open.map(v => daysBetween(v.date)).filter(d => d !== null);
  const avg = withDays.length ? Math.round(withDays.reduce((a,b)=>a+b,0)/withDays.length) : null;
  // Per operator
  const byOp = {};
  for (const v of open) {
    const d = daysBetween(v.date);
    if (d === null) continue;
    const op = v.operator || "Unknown";
    if (!byOp[op]) byOp[op] = [];
    byOp[op].push(d);
  }
  const opAvgs = {};
  for (const [op,days] of Object.entries(byOp)) {
    opAvgs[op] = Math.round(days.reduce((a,b)=>a+b,0)/days.length);
  }
  const snap = {
    ts: new Date().toISOString(),
    date: new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}),
    total: vessels.length,
    openCount: open.length,
    fixingAvg: avg,
    byOp: opAvgs,
  };
  try {
    const history = await loadHistory();
    // Don't duplicate if same day
    const today2 = snap.date;
    const filtered = history.filter(h => h.date !== today2);
    const next = [...filtered, snap].slice(-90); // keep 90 days
    try { await window.storage.set(HK, JSON.stringify(next), true); } catch(_) {}
    try { localStorage.setItem(HK, JSON.stringify(next)); } catch(_) {}
  } catch(_) {}
}

// ─── loadIntel ───
async function loadIntel(){
  const {data,error}=await supabase.from("intelvault").select("*").order("created_at",{ascending:false});
  if(error){console.error("loadIntel error:",error);return [];}
  if(!data) return [];
  return data.map(r=>({id:r.id,extracted:r.comment,addedAt:r.created_at,raw:"",hasImg:false}));
}

// ─── saveIntelItem ───
async function saveIntelItem(item){
  const {data,error}=await supabase.from("intelvault").insert({comment:item.extracted}).select().single();
  if(error){console.error("saveIntelItem error:",error);return null;}
  return data;
}

// ─── deleteIntelItem ───
async function deleteIntelItem(id){
  const {error}=await supabase.from("intelvault").delete().eq("id",id);
  if(error)console.error("deleteIntelItem error:",error);
}

// ─── loadFixingJobs ───
async function loadFixingJobs(){
  const{data,error}=await supabase.from("fixing_jobs").select("*").order("created_at",{ascending:false});
  if(error){console.error(error);return[];}
  return(data||[]).map(r=>({...r,owners:r.owners||[],tags:r.tags||[]}));
}

// ─── saveFixingJob ───
async function saveFixingJob(job){
  const row={
    id:job.id,
    charterer:job.charterer||null,
    product:job.product||null,
    qty:job.qty||null,
    load:job.load||null,
    disch:job.disch||null,
    laycan:job.laycan||null,
    laytime:job.laytime||null,
    status:job.status||"OPEN",
    guidance:job.guidance||null,
    outcome:job.outcome||null,
    owners:job.owners||[],
    fixed_owner:job.fixed_owner||null,
    fixed_vessel:job.fixed_vessel||null,
    fixed_rate:job.fixed_rate||null,
    fixed_comment:job.fixed_comment||null,
    added_date:job.added_date||null,
    updated_at:new Date().toISOString(),
  };
  const{error}=await supabase.from("fixing_jobs").upsert([row],{onConflict:"id"});
  if(error)console.error(error);
}

// ─── deleteFixingJob ───
async function deleteFixingJob(id){
  const{error}=await supabase.from("fixing_jobs").delete().eq("id",id);
  if(error)console.error(error);
}

// ─── loadClients ───
async function loadClients(){
  const{data,error}=await supabase.from("fixing_clients").select("*").order("name");
  if(error){console.error(error);return[];}
  return data||[];
}

// ─── saveClient ───
async function saveClient(client){
  const row={id:client.id,name:client.name||"",coverage:client.coverage||"",notes:client.notes||"",last_updated:client.last_updated||new Date().toISOString()};
  const{error}=await supabase.from("fixing_clients").upsert([row],{onConflict:"id"});
  if(error)console.error(error);
}

// ─── deleteClient ───
async function deleteClient(id){
  const{error}=await supabase.from("fixing_clients").delete().eq("id",id);
  if(error)console.error(error);
}

// ─── loadRates ───
async function loadRates(){
  try{
    const {data,error}=await supabase.from("ratematrix").select("value").eq("key",RATE_KEY).single();
    if(error||!data) return null;
    return JSON.parse(data.value);
  }catch(_){return null;}
}

// ─── saveRates ───
async function saveRates(data){
  try{
    await supabase.from("ratematrix").upsert({key:RATE_KEY,value:JSON.stringify(data)},{onConflict:"key"});
  }catch(_){}
}

export {
  loadAll, saveV, saveC, loadHistory, saveSnapshot,
  loadIntel, saveIntelItem, deleteIntelItem,
  loadFixingJobs, saveFixingJob, deleteFixingJob,
  loadClients, saveClient, deleteClient,
  loadRates, saveRates,
};
