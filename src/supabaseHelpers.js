import { supabase } from "./supabaseclient";
import { enrichV } from "./utils";

const SK  = "tankpos-v5";
const CK  = "tankpos-cargo-v2";
const HK  = "tankpos-history-v1";
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

// ─── Backup / Restore ─────────────────────────────────────────────────────────
function backupData(vessels, cargoes){
  const blob=new Blob([JSON.stringify({vessels,cargoes,exportedAt:new Date().toISOString(),v:2},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="tankpos-backup-"+new Date().toLocaleDateString("en-GB").replace(/\//g,"-")+".json";
  a.click();URL.revokeObjectURL(a.href);
}
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


// ─── History snapshots ────────────────────────────────────────────────────────
const HK = "tankpos-history-v1";
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
async function apiCall(sys,msgs){
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514",
      max_tokens:4000,
      system:sys,
      messages:msgs
    })
  });

  const d = await res.json();
  if(!res.ok) throw new Error("API "+res.status+": "+(d?.error?.message||"?"));
  return d.content.map(b=>b.text||"").join("");
}
async function ocrImage(img){return apiCall("OCR engine. Transcribe all text faithfully row by row. Plain text only.",[{role:"user",content:[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}},{type:"text",text:"Transcribe all text: vessel names, ports, dates, numbers, freight."}]}]);}
async function parsePos(text,img,known){
  let t=text;if(img){const o=await ocrImage(img);t=o+(text&&text!=="(img)"?"\n\n"+text:"");}
  const kv=known.length?"Known vessels: "+known.join(", "):"";
  const isEdit=/^(update|change|set)\b/i.test(t.trim());
  const sys=isEdit
    ?"Maritime vessel editor. Output ONLY a raw JSON array. No markdown, no explanation, no code fences."
    :"Maritime vessel position parser. Output ONLY a raw JSON array. No markdown, no explanation, no code fences.";
  const prompt=isEdit
    ?"Extract the field update from this instruction into a JSON array with ONE vessel object. Include vessel name and ONLY the fields being changed, set everything else to null. Fields: {vessel,operator,dwt,built,loa,beam,cbm,date,openPort,comment,spec:{iceClass,fuel}}. Never put the instruction text in comment. Output ONLY the JSON array.\n\nInstruction:\n"+t
    :"Parse vessel positions into a JSON array.\n"+kv+"\n\nEach item must have these fields (null if unknown):\n{\n  vessel: string (ship name - the vessel name comes before words like 'open'/'avail'/'dely'/'eta'/'space', e.g. 'fure viken open thames' means vessel='Fure Viken', 'fure viken space ara 15th' means vessel='Fure Viken' with openPort=ARA. Capitalise each word. NEVER leave vessel null if a name is present.),\n  operator: string (commercial operator/manager - NOT the owner, NOT 'TBN'. Extract from phrases like 'opr: X', 'managed by X', company names),\n  built: string (year e.g. '2007'),\n  dwt: string (deadweight tons),\n  cbm: string,\n  date: string (open date ALWAYS in 'DD Mon' format e.g. '05 Mar'. If only a day number given like '25th' or '25' use current month Mar. If 'ppt', 'prompt', or 'spot' use today's date "+new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+". Never leave as bare number.),\n  openPort: string (port where vessel opens, e.g. 'Rotterdam', 'ARA', 'Humber'. Use EMPLOYED if fixed/on subs/in program),\n  comment: string,\n  spec: { fuel: string, iceClass: string }\n}\n\nOutput ONLY the JSON array.\n\nData:\n"+t;
  const raw=await apiCall(sys,[{role:"user",content:prompt}]);
  return xJSON(raw);
}

async function parseCargo(text,img,known){
  let t=text;if(img){const o=await ocrImage(img);t=o+(text&&text!=="(img)"?"\n\n"+text:"");}
  const kv=known.length?"Known vessels: "+known.join(", "):"";
  const sys308="Maritime cargo fixture parser. Output ONLY raw JSON array, no markdown, no explanation.";
  const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][new Date().getMonth()];
  const prompt308="Parse cargo fixtures to JSON. "+kv+"\n\nFields: {vessel,charterer,cargo,qty,load,disch,from,to,freight,status,comment}\n\nRules:\n- qty: kt e.g. '15kt' or '7-10kt'. 12000mt->12kt.\n- from/to: laycan dates. ALWAYS expand to 'DD Mon'. If only day numbers like '13-15' use current month ("+mo+") -> from:'13 "+mo+"' to:'15 "+mo+"'. Never leave as bare numbers.\n- Ports: 'X - Y' or 'X to Y' means load=X disch=Y. The port AFTER the dash/to is the DISCHARGE port.\n- charterer: 'acct X' or 'a/c X' means charterer=X. Capitalise each word: eni->Eni, bp->BP, exxon->Exxon.\n- cargo: expand abbreviations: nap->Naphtha, go->Gasoil, hvo->HVO, lco->LCO, jet->Jet, gtl->GTL, fo->Fuel Oil.\n- status: FIXED, SUBS, or FAILED only, blank if unknown.\n- vessel: blank if TBN or not named.\n- Only include fields present in input.\n\nData:\n"+t;
  const raw=await apiCall(sys308,[{role:"user",content:prompt308}]);
  return xJSON(raw);
}

function loadImg(file,cb){
  if(!file)return;const r=new FileReader();
  r.onload=ev=>{const du=ev.target.result;const el=new Image();
    el.onload=()=>{try{const c=document.createElement("canvas");c.width=el.naturalWidth||el.width;c.height=el.naturalHeight||el.height;c.getContext("2d").drawImage(el,0,0);const j=c.toDataURL("image/jpeg",.92);cb({base64:j.split(",")[1],mime:"image/jpeg",dataUrl:j});}catch(_){cb({base64:du.split(",")[1],mime:file.type||"image/jpeg",dataUrl:null});}};
    el.onerror=()=>cb({base64:du.split(",")[1],mime:file.type||"image/jpeg",dataUrl:null});
    try{el.src=du;}catch(_){el.onerror();}
  };r.readAsDataURL(file);
}

// ─── Small UI bits ────────────────────────────────────────────────────────────
function Tag({col,children}){return <span style={{fontSize:12,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid "+col+"44",background:col+"11",color:col,whiteSpace:"nowrap"}}>{children}</span>;}

const normaliseQty = q => {
  if(!q && q!==0) return q;
  const s = String(q).replace(/\s+/g,"").toUpperCase();
  // Already in kt format
  if(/^[\d.\-]+KT$/i.test(s)) return s.replace(/KT$/i,"kt");
  // e.g. "7-10KT"
  if(/^[\d.]+-[\d.]+KT$/i.test(s)) return s.toLowerCase();
  // Strip trailing MT/T/CBM and convert to kt
  const num = parseFloat(s.replace(/[^0-9.]/g,""));
  if(isNaN(num)||num===0) return q;
  const kt = num >= 500 ? Math.round(num/1000) : num;
  return kt+"kt";
};

const fmtN = n => { if(!n && n!==0) return ""; const v=Number(String(n).replace(/,/g,"")); if(isNaN(v)) return String(n); if(v>=1000) return Math.round(v/1000)+"k"; return String(v); };
const fmtFreight = s => {
  if(!s) return s;
  return String(s).trim().replace(/\s+/g," ");
};

const toTCase = s => {
  if(!s) return s;
  // Words that must always be fully uppercase
  const ALLCAPS=new Set(["ARA","ARA","USG","USGC","USAC","UKC","UKG","WMed","ECUK","WCUK","MED","MR","LR","LR1","LR2","VLCC","ULCC","LNG","LPG","IMO","DWT","LOA","CBM","GT","FOB","CIF","DNB","BNP","BP","CPP","DPP","TBN","PPT","ETA","ETC","AIS","ATA","ATD","TCE","FFA","WS","PJG","RTM","HAM","ANR","GBR","NWE","WAF","MEG","AG","SPORE","STS","FSU"]);
  const lo=["of","the","and","a","an","to","for","in","on","at","by","or","via"];
  return s.split(" ").map((w,i)=>{
    if(!w) return w;
    const up=w.toUpperCase();
    // Preserve if user typed ALL-CAPS and it's 2-6 chars (likely abbreviation)
    if(w===up&&w.length>=2&&w.length<=6)return up;
    // Known all-caps set
    if(ALLCAPS.has(up))return up;
    if(i>0&&lo.includes(w.toLowerCase()))return w.toLowerCase();
    return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
  }).join(" ");
};

// ─── Intel Vault storage ───────────────────────────────────────────────────────
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
const RATE_KEY="rates";
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

// ─── Rate Matrix ──────────────────────────────────────────────────────────────
// Shared bunker state — initialized lazily inside components

export {
  loadAll, saveV, saveC, loadHistory, saveSnapshot,
  loadIntel, saveIntelItem, deleteIntelItem,
  loadFixingJobs, saveFixingJob, deleteFixingJob,
  loadClients, saveClient, deleteClient,
  loadRates, saveRates,
};
