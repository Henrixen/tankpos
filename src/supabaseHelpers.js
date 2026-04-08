import { supabase } from "./supabaseclient";
import { daysBetween } from "./utils";

const SK       = "tankpos-v5";
const CK       = "tankpos-cargo-v2";
const HK       = "tankpos-history-v1";
const RATE_KEY = "rates";
export const WS_STORE = "ws-data";

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

async function saveV(v){try{await window.storage.set(SK,JSON.stringify(v),true);}catch(_){}try{localStorage.setItem(SK,JSON.stringify(v));}catch(_){}}
async function saveC(c){try{await window.storage.set(CK,JSON.stringify(c),true);}catch(_){}try{localStorage.setItem(CK,JSON.stringify(c));}catch(_){}}

async function loadHistory() {
  try { const r = await window.storage.get(HK,true); return r ? JSON.parse(r.value) : []; }
  catch(_) { return JSON.parse(localStorage.getItem(HK)||"[]"); }
}

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


// ─── Vessel merge ─────────────────────────────────────────────────────────────
function mKey(inc,keys){if(!inc)return null;const s=inc.toLowerCase().trim();if(keys.has(s))return s;for(const k of keys){const[a,b]=s.length<=k.length?[s.split(" "),k.split(" ")]:[k.split(" "),s.split(" ")];if(a.every(w=>b.includes(w)))return k;}for(const k of keys){if(k.endsWith(s)||s.endsWith(k)||k.startsWith(s)||s.startsWith(k))return k;}return null;}
function mergeVessels(existing,incoming,vesselDB){
  const map=new Map(existing.filter(v=>v.vessel).map(v=>[v.vessel.toLowerCase(),v]));
  const incomingKeys=new Set(incoming.map(v=>v.vessel?.toLowerCase().trim()).filter(Boolean));
  for(const v of incoming){
    const rk=v.vessel?.toLowerCase().trim();if(!rk)continue;
    const mk=mKey(rk,new Set([...map.keys()].filter(Boolean)));const prev=map.get(mk||rk)||{};
    let merged={...prev};
    if(!mk||v.vessel.length>(prev.vessel||"").length)merged.vessel=v.vessel;
    // Check if this is a genuine position update (openPort or date changed) or just a spec match
    const positionChanged=(v.openPort&&v.openPort!==prev.openPort)||(v.date&&v.date!==prev.date);
    for(const[k,val]of Object.entries(v)){
      if(k==="vessel"||val==null||val==="")continue;
      if(k==="operator"&&prev.operatorManual)continue;
      // Only update updatedAt if the position data actually changed
      if(k==="updatedAt"){if(positionChanged||!prev.updatedAt)merged[k]=val;continue;}
      if(k==="spec"&&typeof val==="object"){merged.spec={...(prev.spec||{})};for(const[sk,sv]of Object.entries(val)){if(sv!=null&&sv!=="")merged.spec[sk]=sv;}}
      else merged[k]=val;
    }
    const canon=(merged.vessel||"").toLowerCase();if(mk&&mk!==canon)map.delete(mk);
    map.set(canon,enrichV(merged,vesselDB));
  }
  return Array.from(map.values());
}
function xJSON(raw){if(!raw)throw new Error("Empty");const cl=raw.trim().replace(/^```[\w]*/,"").replace(/```/g,"").trim();try{return JSON.parse(cl);}catch(_){}const s=cl.indexOf("["),e=cl.lastIndexOf("]");if(s>=0&&e>s){try{return JSON.parse(cl.slice(s,e+1));}catch(_){}}throw new Error("Parse failed: "+raw.slice(0,60));}

// ─── API ──────────────────────────────────────────────────────────────────────

async function loadIntel(){
  const {data,error}=await supabase.from("intelvault").select("*").order("created_at",{ascending:false});
  if(error){console.error("loadIntel error:",error);return [];}
  if(!data) return [];
  return data.map(r=>({id:r.id,extracted:r.comment,addedAt:r.created_at,raw:"",hasImg:false}));
}
async function saveIntelItem(item){
  const {data,error}=await supabase.from("intelvault").insert({comment:item.extracted}).select().single();
  if(error){console.error("saveIntelItem error:",error);return null;}
  return data;
}
async function deleteIntelItem(id){
  const {error}=await supabase.from("intelvault").delete().eq("id",id);
  if(error)console.error("deleteIntelItem error:",error);
}
// ─── Fixing tab storage ───────────────────────────────────────────────────────
async function loadFixingJobs(){
  const{data,error}=await supabase.from("fixing_jobs").select("*").order("created_at",{ascending:false});
  if(error){console.error(error);return[];}
  return(data||[]).map(r=>({...r,owners:r.owners||[],tags:r.tags||[]}));
}
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
    notes:job.notes||null,
    indications:job.indications||null,
    cargo_details: job.cargo_details || null,
    subs_fixed:job.subs_fixed||null,
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
async function deleteFixingJob(id){
  const{error}=await supabase.from("fixing_jobs").delete().eq("id",id);
  if(error)console.error(error);
}
async function loadClients(){
  const{data,error}=await supabase.from("fixing_clients").select("*").order("name");
  if(error){console.error(error);return[];}
  return data||[];
}
async function saveClient(client){
  const row={id:client.id,name:client.name||"",coverage:client.coverage||"",notes:client.notes||"",last_updated:client.last_updated||new Date().toISOString()};
  const{error}=await supabase.from("fixing_clients").upsert([row],{onConflict:"id"});
  if(error)console.error(error);
}
async function deleteClient(id){
  const{error}=await supabase.from("fixing_clients").delete().eq("id",id);
  if(error)console.error(error);
}

async function loadRates(){
  try{
    const {data,error}=await supabase.from("ratematrix").select("value").eq("key",RATE_KEY).single();
    if(error||!data) return null;
    return JSON.parse(data.value);
  }catch(_){return null;}
}
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
