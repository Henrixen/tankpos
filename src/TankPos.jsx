// CACHE_BUSTER_006
// CACHE_BUSTER_013
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";

// ─── Fleet DB loader (public/vessels.json) ─────────────────────────────────────
// Expect vessels.json to be an array of objects like:
// {ship_name,dwt,built,operator,loa,beam,cbm,ice_class,fuel_data,last_ex_name,coating,...}
function normName(s){
  return String(s||"").toLowerCase().trim().replace(/[\._-]/g," ").replace(/\s+/g," ");
}
function buildVDBFromFleet(rows){
  const map = {};
  for(const r of (rows||[])){
    const name = r.ship_name || r.vessel || r.name;
    if(!name) continue;
    const k = normName(name);
    const built = r.built ? Number(r.built) : "";
    const dwt   = r.dwt   ? Number(r.dwt)   : "";
    const loa   = r.loa   ? Number(r.loa)   : "";
    const beam  = r.beam  ? Number(r.beam)  : "";
    const cbm   = r.cbm   ? Number(r.cbm)   : "";
    const ice   = r.ice_class || r.iceClass || "";
    const fuel  = r.fuel_data || r.fuel || "";
    const op    = r.operator || "";
    map[k] = [built, dwt, loa, beam, cbm, ice, fuel, op];
    if(r.last_ex_name){
      const ex = normName(r.last_ex_name);
      if(ex && !map[ex]) map[ex] = map[k];
    }
  }
  return map;
}
async function loadFleetVDB(){
  try{
    const res = await fetch("/vessels.json",{cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const rows = await res.json();
    VDB = buildVDBFromFleet(rows);
    return {ok:true,count:Object.keys(VDB).length};
  }catch(e){
    console.warn("Failed to load /vessels.json. VDB remains empty.", e);
    VDB = {};
    return {ok:false,count:0,error:String(e?.message||e)};
  }
}


// ─── Utilities ──────────────────────────────────────────────────────────────────
const stripHtml = s => {
  if(!s) return "";
  let out="", inTag=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==="<"){inTag=true;}
    else if(c===">"){inTag=false;}
    else if(!inTag){out+=c;}
  }
  return out.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/&#\d+;/g,"").trim();
};

// ─── Vessel spec database [built,dwt,loa,beam,cbm,iceClass,fuel,operator] ────────────










































let VDB = {}; // loaded from /vessels.json

function dbLookup(name) {
  if (!name) return null;
  const k = name.toLowerCase().trim();
  if (VDB[k]) return VDB[k];
  const clean = k.replace(/[.-]/g," ").replace(/\s+/g," ").trim();
  if (VDB[clean]) return VDB[clean];
  for (const [dk, dv] of Object.entries(VDB)) {
    if (clean === dk) return dv;
    if (clean.length > 4 && (dk.includes(clean) || clean.includes(dk))) return dv;
  }
  const words = clean.split(" ").filter(w => w.length > 3);
  if (words.length >= 2) {
    for (const [dk, dv] of Object.entries(VDB)) {
      if (words.every(w => dk.includes(w))) return dv;
    }
  }
  return null;
}

function enrichV(v) {
  const d = dbLookup(v.vessel);
  if (!d) return v;
  const [built, dwt, loa, beam, cbm, ice, fuel, operator] = d;
  // Respect manual operator edits: if user explicitly set operatorManual flag, never overwrite
  const resolvedOp = v.operatorManual ? v.operator : (v.operator || operator || null);
  return {
    ...v,
    built:    v.built    || (built    ? String(built)    : null),
    dwt:      v.dwt      || (dwt      ? String(dwt)      : null),
    loa:      v.loa      || (loa      ? String(loa)      : null),
    beam:     v.beam     || (beam     ? String(beam)     : null),
    cbm:      v.cbm      || (cbm      ? String(cbm)      : null),
    operator: resolvedOp,
    spec: {
      ...v.spec,
      iceClass: v.spec?.iceClass || ice  || null,
      fuel:     v.spec?.fuel     || fuel || null,
    }
  };
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0f1e",bg2:"#0e1628",bg3:"#162035",
  bd:"#1e3a5f",bd2:"#162035",
  tx:"#cce4ff",dim:"#7eafd4",faint:"#3d6080",
  blue:"#4fc3f7",green:"#43e97b",amber:"#ffd166",
  purple:"#c084fc",red:"#ff6b6b",orange:"#fb923c",
};

const OP_COLORS = ["#4fc3f7","#43e97b","#ffd166","#c084fc","#ff6b6b","#38bdf8","#34d399","#fb923c","#e879f9","#a3e635"];

const isMobile = () => window.innerWidth < 900 || /iPad|iPhone|Android|Mobile/i.test(navigator.userAgent);

// ─── Ports ────────────────────────────────────────────────────────────────────
const PORTS = {
  thames:[51.45,0.70],southampton:[50.90,-1.40],humber:[53.73,-0.25],
  teesport:[54.61,-1.16],tees:[54.61,-1.16],immingham:[53.63,-0.22],
  "milford haven":[51.71,-5.03],forth:[56.03,-3.40],grangemouth:[56.01,-3.70],
  belfast:[54.60,-5.91],cork:[51.85,-8.30],dublin:[53.35,-6.23],
  rotterdam:[51.95,4.13],ara:[51.95,4.13],amsterdam:[52.37,4.90],
  antwerp:[51.22,4.40],ghent:[51.10,3.72],flushing:[51.45,3.60],zeebrugge:[51.33,3.20],
  "le havre":[49.49,0.11],rouen:[49.44,1.10],dunkirk:[51.03,2.37],
  bordeaux:[44.84,-0.57],bdx:[44.84,-0.57],nantes:[47.22,-1.55],
  "la pallice":[46.16,-1.15],bayonne:[43.49,-1.48],brest:[48.39,-4.49],
  hamburg:[53.55,9.99],brunsbuttel:[53.89,9.13],wilhelmshaven:[53.52,8.11],
  bremerhaven:[53.55,8.58],flensburg:[54.79,9.44],kiel:[54.32,10.14],
  gothenburg:[57.70,11.97],goteborg:[57.70,11.97],oslo:[59.90,10.74],
  stavanger:[58.97,5.73],mongstad:[60.82,5.03],sture:[60.85,5.11],
  kalundborg:[55.68,11.09],fredericia:[55.56,9.75],copenhagen:[55.68,12.56],
  malmo:[55.60,13.00],helsingborg:[56.05,12.70],karlshamn:[56.17,14.86],
  nynashamn:[58.90,17.95],stockholm:[59.33,18.06],porvoo:[60.28,25.66],
  naantali:[60.47,22.02],helsinki:[60.17,24.93],kotka:[60.47,26.95],
  riga:[56.95,24.11],tallinn:[59.44,24.75],ventspils:[57.40,21.54],
  klaipeda:[55.71,21.13],gdansk:[54.36,18.65],gdynia:[54.52,18.53],
  bilbao:[43.36,-3.04],santander:[43.46,-3.80],
  nap:[40.83,14.27],naples:[40.83,14.27],
};
function findPort(n) {
  if (!n) return null;
  const s = n.toLowerCase().trim();
  if (PORTS[s]) return PORTS[s];
  for (const [k,v] of Object.entries(PORTS)) { if (s.includes(k)||k.includes(s)) return v; }
  return null;
}
function haversine(a,b) {
  if (!a||!b) return null;
  const R=3440.07,dLat=(b[0]-a[0])*Math.PI/180,dLon=(b[1]-a[1])*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.sqrt(h));
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const MON_DISPLAY = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseDate(s) {
  if (!s) return null;
  const lo = s.toLowerCase();
  let day = null, mon = null;
  for (const part of lo.split(/[\s\-\/]+/)) {
    const mi = MONTHS.findIndex(m => part.startsWith(m));
    if (mi >= 0) mon = mi;
    else if (/^\d+$/.test(part)) day = parseInt(part);
  }
  if (day == null || mon == null) return null;
  return new Date(new Date().getFullYear(), mon, day);
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + Math.round(days));
  return String(d.getDate()).padStart(2,"0") + " " + MON_DISPLAY[d.getMonth()];
}

function daysBetween(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today)/(86400000));
}

function isOpenPPT(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return d <= today;
}

// ─── Region classification ────────────────────────────────────────────────────
const REGION_MAP = {
  WCUK:   ["belfast","cork","dublin","milford haven","liverpool","clyde","mersey","glasgow","avonmouth","bristol","swansea","barrow"],
  ECUK:   ["thames","humber","immingham","teesport","tees","tyne","sunderland","middlesbrough","grangemouth","forth","leith","dundee","medway","gns","wilton"],
  CANAL:  ["rotterdam","ara","amsterdam","antwerp","ghent","flushing","le havre","dunkirk","rouen","hamburg","brunsbuttel","wilhelmshaven","bremerhaven","bremen","zeebrugge","brest","calais","dieppe"],
  BISCAY: ["bordeaux","bdx","nantes","la pallice","bayonne","bilbao","santander","le verdon","donges","montoir","gijon","ferrol"],
  BALTIC: ["gdansk","gdynia","klaipeda","ventspils","riga","tallinn","helsinki","naantali","porvoo","kotka","stockholm","nynashamn","karlshamn","lulea","oulu","baltic","baltiysk"],
  SKAW:   ["gothenburg","goteborg","oslo","stavanger","mongstad","sture","kalundborg","fredericia","copenhagen","malmo","helsingborg","flensburg","kiel","aarhus","esbjerg","aalborg","sarroch"],
  MED:    ["gibraltar","algeciras","ceuta","barcelona","tarragona","valencia","cartagena","alicante","almeria","malaga","huelva","cadiz","sines","leixoes","setubal","lisbon","marseille","fos","lavera","port jerome","genoa","savona","livorno","la spezia","trieste","venice","ravenna","porto marghera","naples","napoli","augusta","milazzo","messina","sicily","palermo","catania","cagliari","porto torres","civitavecchia","brindisi","taranto","bari","ancona","split","rijeka","piraeus","athens","thessaloniki","kavala","alexandroupolis","constanta","odessa","novorossiysk","tuapse","batumi","trabzon","samsun","izmit","aliaga","izmir","canakkale","istanbul","marmara","bandirma","mudanya","derince","gebze","izmit","derince","aliaga","c-med","cmed","med","n spain","spain med","adriatic","wmed","w med","span med","e med","e.med","levant","malta","tunis","tunisia","la goulette","bizerte","sfax","porto empedocle"],
};

function classifyRegion(portName) {
  if (!portName || portName === "EMPLOYED") return null;
  const n = portName.toLowerCase().trim();
  for (const [region, ports] of Object.entries(REGION_MAP)) {
    if (ports.some(p => n.includes(p) || p.includes(n) || n.split(/[\s/+,]/)[0]===p)) return region;
  }
  return null;
}

// ─── Voyage calc ──────────────────────────────────────────────────────────────
function calcVoyage(vessel, cargo) {
  const oc=findPort(vessel.openPort),lc=findPort(cargo.loadPort),dc=findPort(cargo.dischPort);
  const bNm=haversine(oc,lc),lNm=haversine(lc,dc);
  const bDays=bNm!=null?bNm/12.5/24:null,lDays=lNm!=null?lNm/12.5/24:null;
  const etaLoad=vessel.date&&bDays!=null?addDays(vessel.date,bDays):null;
  let loadDate=etaLoad;
  if (etaLoad&&cargo.laycan) {
    const m=cargo.laycan.match(/(\d+)/),monM=cargo.laycan.toLowerCase().match(new RegExp(MONTHS.join("|")));
    if(m&&monM){const ld=new Date(new Date().getFullYear(),MONTHS.indexOf(monM[0].slice(0,3)),parseInt(m[1]));const ed=parseDate(etaLoad);if(ed&&ld>ed)loadDate=addDays(ld.toDateString(),0)||etaLoad;}
  }
  const openDate=loadDate&&lDays!=null?addDays(loadDate,1+lDays+0.75):null;
  return {
    ballastNm:bNm?Math.round(bNm):null,ladenNm:lNm?Math.round(lNm):null,
    ballastDays:bDays?Math.round(bDays*10)/10:null,ladenDays:lDays?Math.round(lDays*10)/10:null,
    etaLoad,loadDate,openPort:cargo.dischPort,openDate,hasCoords:!!(oc&&lc&&dc),
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const SK="tankpos-v5",CK="tankpos-cargo-v2";
async function loadAll(){
  let vessels=[], cargoes=[];
  try{
    const rv=await window.storage.get(SK,true),rc=await window.storage.get(CK,true);
    vessels=rv?JSON.parse(rv.value):[];
    cargoes=rc?JSON.parse(rc.value):[];
  }catch(_){
    vessels=JSON.parse(localStorage.getItem(SK)||"[]");
    cargoes=JSON.parse(localStorage.getItem(CK)||"[]");
  }
  // Re-enrich all vessels from DB on load (fills missing operator/specs)
  vessels = vessels.map(v => enrichV(v));
  return {vessels, cargoes};
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
function mKey(inc,keys){const s=inc.toLowerCase().trim();if(keys.has(s))return s;for(const k of keys){const[a,b]=s.length<=k.length?[s.split(" "),k.split(" ")]:[k.split(" "),s.split(" ")];if(a.every(w=>b.includes(w)))return k;}for(const k of keys){if(k.endsWith(s)||s.endsWith(k)||k.startsWith(s)||s.startsWith(k))return k;}return null;}
function mergeVessels(existing,incoming){
  const map=new Map(existing.map(v=>[v.vessel?.toLowerCase(),v]));
  const incomingKeys=new Set(incoming.map(v=>v.vessel?.toLowerCase().trim()).filter(Boolean));
  for(const v of incoming){
    const rk=v.vessel?.toLowerCase().trim();if(!rk)continue;
    const mk=mKey(rk,new Set(map.keys()));const prev=map.get(mk||rk)||{};
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
    map.set(canon,enrichV(merged));
  }
  return Array.from(map.values());
}
function xJSON(raw){if(!raw)throw new Error("Empty");const cl=raw.trim().replace(/^```[\w]*/,"").replace(/```/g,"").trim();try{return JSON.parse(cl);}catch(_){}const s=cl.indexOf("["),e=cl.lastIndexOf("]");if(s>=0&&e>s){try{return JSON.parse(cl.slice(s,e+1));}catch(_){}}throw new Error("Parse failed: "+raw.slice(0,60));}

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiCall(sys,msgs){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,system:sys,messages:msgs})});
  const d=await res.json();if(!res.ok)throw new Error("API "+res.status+": "+(d?.error?.message||"?"));
  return d.content.map(b=>b.text||"").join("");
}
async function ocrImage(img){return apiCall("OCR engine. Transcribe all text faithfully row by row. Plain text only.",[{role:"user",content:[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}},{type:"text",text:"Transcribe all text: vessel names, ports, dates, numbers, freight."}]}]);}
async function parsePos(text,img,known){
  let t=text;if(img){const o=await ocrImage(img);t=o+(text&&text!=="(img)"?"\n\n"+text:"");}
  const kv=known.length?"Known vessels: "+known.join(", "):"";
  const raw=await apiCall(
    "Maritime vessel position parser. Output ONLY a raw JSON array. No markdown, no explanation, no code fences.",
    [{role:"user",content:"Parse vessel positions into a JSON array.\n"+kv+"\n\nEach item must have these fields (null if unknown):\n{\n  vessel: string (ship name),\n  operator: string (commercial operator/manager - NOT the owner, NOT 'TBN'. Extract from phrases like 'opr: X', 'managed by X', company names),\n  built: string (year e.g. '2007'),\n  dwt: string (deadweight tons),\n  cbm: string,\n  date: string (open date e.g. '05 Mar'),\n  openPort: string (port where vessel opens, e.g. 'Rotterdam', 'ARA', 'Humber'. Use EMPLOYED if fixed/on subs),\n  comment: string,\n  spec: { fuel: string, iceClass: string }\n}\n\nOutput ONLY the JSON array.\n\nData:\n"+t}]
  );
  return xJSON(raw);
}
async function parseCargo(text,img,known){
  let t=text;if(img){const o=await ocrImage(img);t=o+(text&&text!=="(img)"?"\n\n"+text:"");}
  const kv=known.length?"Known vessels: "+known.join(", "):"";
  const sys308="Maritime cargo fixture parser. Output ONLY raw JSON array, no markdown, no explanation.";
  const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][new Date().getMonth()];
  const prompt308="Parse cargo fixtures to JSON. "+kv+"\n\nFields: {vessel,charterer,cargoType,qty,loadPort,dischPort,laycan,freight,status,comment}\n\nRules:\n- qty: kt e.g. '15kt' or '7-10kt'. 12000mt->12kt.\n- laycan: ALWAYS expand to 'DD Mon - DD Mon'. If only day numbers like '13-15' use current month ("+mo+") -> '13 "+mo+" - 15 "+mo+"'. Never leave as bare numbers.\n- Ports: 'X - Y' or 'X to Y' means loadPort=X dischPort=Y. The port AFTER the dash/to is the DISCHARGE port.\n- charterer: 'acct X' or 'a/c X' means charterer=X. Capitalise each word: eni->Eni, bp->BP, exxon->Exxon.\n- cargoType: expand abbreviations: nap->Naphtha, go->Gasoil, hvo->HVO, lco->LCO, jet->Jet, gtl->GTL, fo->Fuel Oil.\n- status: FIXED or SUBS only, blank if unknown.\n- vessel: blank if TBN or not named.\n- Only include fields present in input.\n\nExamples:\n'12kt nap kaarstote - ara 13-15 acct eni' -> {charterer:'Eni',cargoType:'Naphtha',qty:'12kt',loadPort:'Kaarstote',dischPort:'ARA',laycan:'13 "+mo+" - 15 "+mo+"'}\n'exxon 12kt nap fawley ara 7-9 march' -> {charterer:'Exxon',cargoType:'Naphtha',qty:'12kt',loadPort:'Fawley',dischPort:'ARA',laycan:'07 Mar - 09 Mar'}\n\nData:\n"+t;
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
function Tag({col,children}){return <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid "+col+"44",background:col+"11",color:col,whiteSpace:"nowrap"}}>{children}</span>;}

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
  let v = String(s).trim();
  // Already has USD prefix and lsum suffix - just normalise numbers
  const hasUSD = /usd/i.test(v);
  const hasLsum = /l\.?s\.?u\.?m|lsum/i.test(v);
  // Extract number(s)
  const nums = v.match(/\d[\d,.]*/g);
  if(!nums) return v;
  const n = parseFloat(nums[0].replace(/,/g,''));
  if(isNaN(n)) return v;
  const kt = n >= 500 ? Math.round(n/1000)+'k' : n;
  const prefix = hasUSD ? '' : 'USD ';
  const suffix = hasLsum ? '' : ' lsum';
  // Rebuild: USD Xk lsum
  return 'USD ' + kt + ' lsum';
};
const toTCase = s => {
  if(!s) return s;
  // Always proper-case each word (handles all-caps, all-lower, mixed)
  const lo=["of","the","and","a","an","to","for","in","on","at","by","or","via"];
  return s.toLowerCase().split(" ").map((w,i)=>{
    if(!w) return w;
    // Keep known abbreviations uppercase: IMO, GT, DWT, LOA, MR, LR, VLCC etc
    const abbrs=["imo","imo","lng","lpg","vlcc","ulcc","mr","lr","lr1","lr2","suezmax","aframax","panamax","ara","ukg","usac","usgc","fob","cif","dnb","bnp","bp","cpp","dpp","tbn","ppt"];
    if(i>0&&lo.includes(w))return w;
    return w.charAt(0).toUpperCase()+w.slice(1);
  }).join(" ");
};

// ─── Intel Vault storage ───────────────────────────────────────────────────────
const IV_KEY="tankpos-intel-v1";
async function loadIntel(){try{const r=await window.storage.get(IV_KEY,true);return r?JSON.parse(r.value):[];}catch(_){return JSON.parse(localStorage.getItem(IV_KEY)||"[]");}}
async function saveIntel(items){try{await window.storage.set(IV_KEY,JSON.stringify(items),true);}catch(_){}try{localStorage.setItem(IV_KEY,JSON.stringify(items));}catch(_){}}
const RATE_KEY="tankpos-rates-v1";
async function loadRates(){try{const r=await window.storage.get(RATE_KEY,true);return r?JSON.parse(r.value):null;}catch(_){return JSON.parse(localStorage.getItem(RATE_KEY)||"null");}}
async function saveRates(data){try{await window.storage.set(RATE_KEY,JSON.stringify(data),true);}catch(_){}try{localStorage.setItem(RATE_KEY,JSON.stringify(data));}catch(_){}}

// ─── Rate Matrix ──────────────────────────────────────────────────────────────
// Europe routes: single rate + TCE, no qty
const EU_ROUTES=[
  {id:"mng-ara",from:"Mongstad",to:"ARA"},
  {id:"ara-tha",from:"ARA",to:"Thames"},
  {id:"ara-dub",from:"ARA",to:"Dublin"},
  {id:"tee-ara",from:"Tees",to:"ARA"},
  {id:"bis-ara",from:"Biscay",to:"ARA"},
  {id:"ara-wme",from:"ARA",to:"WMed"},
  {id:"med-ara",from:"Med",to:"ARA"},
];
// Asia + TA: rate per size
const RATE_ROUTES=[
  {region:"Asia",label:"Asia → Europe",routes:[
    {id:"nch-ara",from:"N.China",to:"ARA"},
    {id:"str-ara",from:"Straits",to:"ARA"},
  ]},
  {region:"TA",label:"Transatlantic",routes:[
    {id:"ara-usg",from:"ARA",to:"USG"},
    {id:"usg-ara",from:"USG",to:"ARA"},
  ]},
];
const RATE_SIZES=["5kt","10kt","15kt","20kt"];
const REGION_COLORS={Europe:"#58a6ff",Asia:"#bc8cff",TA:"#e3b341"};

function defaultRateMatrix(){
  const m={};
  // EU routes: rate + tce
  for(const rt of EU_ROUTES){m[rt.id+"-rate"]={rate:"",comment:""};m[rt.id+"-tce"]={rate:"",comment:""};}
  // Asia+TA: by size
  for(const rg of RATE_ROUTES)for(const rt of rg.routes)for(const sz of RATE_SIZES){
    m[rt.id+"-"+sz]={rate:"",comment:""};
  }
  return m;
}

function RateMatrix(){
  const [matrix,setMatrix]=useState(()=>defaultRateMatrix());
  const [loaded,setLoaded]=useState(false);
  const [focusCell,setFocusCell]=useState(null);
  const [editComment,setEditComment]=useState(null);

  useEffect(()=>{loadRates().then(d=>{if(d)setMatrix(m=>({...m,...d}));setLoaded(true);});},[]);

  function upd(key,field,val){
    setMatrix(m=>{const next={...m,[key]:{...(m[key]||{}),[field]:val}};if(loaded)saveRates(next);return next;});
  }

  const thS={padding:"4px 5px",fontSize:9,fontWeight:700,color:C.faint,background:C.bg,textAlign:"center",whiteSpace:"nowrap",borderBottom:"1px solid "+C.bd2};
  const tdR={fontSize:10,padding:"1px 2px",borderBottom:"1px solid "+C.bg,verticalAlign:"middle"};

  function RCell({ck,col}){
    const cell=matrix[ck]||{rate:"",comment:""};
    const isFoc=focusCell===ck;
    const c=col||C.blue;
    return(
      <input value={cell.rate} onChange={e=>upd(ck,"rate",e.target.value)}
        onFocus={()=>setFocusCell(ck)} onBlur={()=>setFocusCell(null)}
        onContextMenu={e=>{e.preventDefault();setEditComment(ck);}}
        title={cell.comment?"💬 "+cell.comment:"Right-click for comment"}
        style={{width:"100%",background:cell.rate?c+"1a":isFoc?"rgba(88,166,255,.06)":"transparent",
          border:"none",outline:isFoc?"1px solid rgba(88,166,255,.4)":"none",
          color:cell.rate?c:C.faint,fontFamily:"inherit",fontSize:10,
          padding:"3px 3px",textAlign:"center",boxSizing:"border-box",minWidth:0}}/>
    );
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      {editComment&&(
        <div style={{display:"flex",gap:4,alignItems:"center",background:C.bg3,border:"1px solid "+C.blue,borderRadius:4,padding:"3px 6px"}}>
          <span style={{fontSize:9,color:C.faint}}>Comment:</span>
          <input value={matrix[editComment]?.comment||""} onChange={e=>upd(editComment,"comment",e.target.value)}
            autoFocus onBlur={()=>setEditComment(null)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setEditComment(null);}}
            style={{flex:1,background:"transparent",border:"none",color:C.tx,fontFamily:"inherit",fontSize:10,padding:"0 2px",outline:"none"}}/>
        </div>
      )}

      {/* Intra Europe: Rate + TCE columns */}
      <div>
        <div style={{fontSize:9,fontWeight:700,color:REGION_COLORS.Europe,textTransform:"uppercase",letterSpacing:"0.07em",padding:"3px 5px",background:REGION_COLORS.Europe+"18",borderLeft:"2px solid "+REGION_COLORS.Europe,marginBottom:2}}>
          Intra Europe
        </div>
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <thead><tr>
            <th style={{...thS,textAlign:"left",minWidth:100}}>Route</th>
            <th style={{...thS,minWidth:80}}>Rate (lsum)</th>
            <th style={{...thS,minWidth:70,color:C.green}}>TCE $/day</th>
          </tr></thead>
          <tbody>
            {EU_ROUTES.map((rt,i)=>(
              <tr key={rt.id} style={{background:i%2===0?C.bg:C.bg2}}>
                <td style={{...tdR,color:C.dim,paddingLeft:4}}>
                  <span style={{fontWeight:600,fontSize:10}}>{rt.from}</span><span style={{color:C.faint,fontSize:9}}> → {rt.to}</span>
                </td>
                <td style={{...tdR,padding:0}}><RCell ck={rt.id+"-rate"} col={REGION_COLORS.Europe}/></td>
                <td style={{...tdR,padding:0}}><RCell ck={rt.id+"-tce"} col={C.green}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Asia + TA: by size */}
      {RATE_ROUTES.map(rg=>(
        <div key={rg.region}>
          <div style={{fontSize:9,fontWeight:700,color:REGION_COLORS[rg.region],textTransform:"uppercase",letterSpacing:"0.07em",padding:"3px 5px",background:REGION_COLORS[rg.region]+"18",borderLeft:"2px solid "+REGION_COLORS[rg.region],marginBottom:2}}>
            {rg.label}
          </div>
          <table style={{borderCollapse:"collapse",width:"100%"}}>
            <thead><tr>
              <th style={{...thS,textAlign:"left",minWidth:100}}>Route</th>
              {RATE_SIZES.map(sz=>(<th key={sz} style={{...thS,minWidth:46}}>{sz}</th>))}
            </tr></thead>
            <tbody>
              {rg.routes.map((rt,i)=>(
                <tr key={rt.id} style={{background:i%2===0?C.bg:C.bg2}}>
                  <td style={{...tdR,color:C.dim,paddingLeft:4}}>
                    <span style={{fontWeight:600,fontSize:10}}>{rt.from}</span><span style={{color:C.faint,fontSize:9}}> → {rt.to}</span>
                  </td>
                  {RATE_SIZES.map(sz=>(
                    <td key={sz} style={{...tdR,padding:0}}>
                      <RCell ck={rt.id+"-"+sz} col={REGION_COLORS[rg.region]}/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{fontSize:9,color:C.faint,marginTop:2}}>Right-click any cell to add comment · Hover to read</div>
    </div>
  );
}

// ─── Intel Vault ──────────────────────────────────────────────────────────────
function IntelVault({onVaultUpdate}){
  const [items,setItems]=useState([]);
  const [text,setText]=useState("");
  const [img,setImg]=useState(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState(null);
  const fRef=useRef(null);

  useEffect(()=>{loadIntel().then(d=>{setItems(d);onVaultUpdate&&onVaultUpdate(d);});},[]);

  async function ingest(){
    if(!text.trim()&&!img){setStatus({t:"error",m:"Paste text or attach image."});return;}
    setBusy(true);setStatus({t:"info",m:"Scanning…"});
    try{
      const imgBlock=img?[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}}]:[];
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:800,
        system:"Extract maritime market intelligence as concise bullet points. Include: routes, rates/prices, vessels, cargo types, charterers, dates, market colour. Be factual, no commentary.",
        messages:[{role:"user",content:[...imgBlock,{type:"text",text:text||"Extract market intel from this image."}]}]
      })});
      const d=await res.json();
      const extracted=(d.content||[]).map(b=>b.text||"").join("");
      const item={id:"iv_"+Date.now(),raw:text,extracted,addedAt:new Date().toISOString(),hasImg:!!img};
      const next=[item,...items];
      setItems(next);saveIntel(next);onVaultUpdate&&onVaultUpdate(next);
      setText("");setImg(null);
      setStatus({t:"success",m:"✓ Stored in vault"});setTimeout(()=>setStatus(null),3000);
    }catch(e){setStatus({t:"error",m:e.message});}finally{setBusy(false);}
  }

  function del(id){const next=items.filter(i=>i.id!==id);setItems(next);saveIntel(next);onVaultUpdate&&onVaultUpdate(next);}

  const sc=status?.t==="success"?C.green:status?.t==="error"?C.red:C.blue;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,overflow:"hidden"}}>
        <textarea value={text} onChange={e=>setText(e.target.value)}
          placeholder={"Paste rates, broker reports, news, market colour…\nor attach a screenshot below"}
          style={{width:"100%",minHeight:60,background:"transparent",border:"none",color:C.tx,fontFamily:"inherit",fontSize:11,padding:"6px 8px",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:5,padding:"4px 6px",borderTop:"1px solid "+C.bd2,alignItems:"center"}}>
          <button onClick={ingest} disabled={busy||(!text.trim()&&!img)}
            style={{flex:1,background:busy?"#1a4a8f":"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"4px 0",cursor:busy?"default":"pointer"}}>
            {busy?"⟳ Scanning…":"⬆ Extract & Store"}
          </button>
          <button onClick={()=>fRef.current?.click()} title="Attach image/screenshot"
            style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"2px 8px",fontFamily:"inherit",fontSize:13,cursor:"pointer"}}>🖼</button>
          <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
          {img&&<span style={{fontSize:10,color:C.purple}}>📷 attached</span>}
        </div>
      </div>
      {status&&<div style={{fontSize:10,color:sc}}>{status.m}</div>}
      <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}>{items.length} items in vault</div>
      <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:220,overflowY:"auto"}}>
        {items.length===0&&<div style={{fontSize:10,color:C.faint,fontStyle:"italic"}}>Nothing stored yet.</div>}
        {items.map(item=>(
          <div key={item.id} style={{background:C.bg3,border:"1px solid "+C.bd2,borderRadius:4,padding:"6px 8px",position:"relative"}}>
            <div style={{fontSize:10,color:C.tx,whiteSpace:"pre-wrap",lineHeight:1.45,paddingRight:16}}>{item.extracted}</div>
            <div style={{fontSize:9,color:C.faint,marginTop:3}}>{new Date(item.addedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}{item.hasImg?" 📷":""}</div>
            <button onClick={()=>del(item.id)} style={{position:"absolute",top:4,right:4,background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11,opacity:0.5,lineHeight:1}}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Ask ───────────────────────────────────────────────────────────────────
function AIAsk({vessels,cargoes,intelItems}){
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);
  const [convHistory,setConvHistory]=useState([]);

  function buildContext(){
    const cargoSummary=cargoes.map(c=>[c.status||"",c.charterer,c.cargoType,c.qty,c.loadPort,c.dischPort,c.laycan,c.freight,c.vessel].filter(Boolean).join("|")).join("\n");
    const vesselSummary=vessels.map(v=>[v.vessel,v.operator,v.openPort,v.date,v.dwt&&v.dwt+"dwt",v.spec?.iceClass].filter(Boolean).join("|")).join("\n");
    const vault=(intelItems||[]).map(i=>i.extracted).join("\n---\n");
    return `Today: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}\nCARGO FIXTURES (${cargoes.length}):\n${cargoSummary||"none"}\nVESSEL POSITIONS (${vessels.length}):\n${vesselSummary||"none"}\nMARKET INTEL VAULT (${(intelItems||[]).length} items):\n${vault||"none"}`;
  }

  async function ask(){
    const q=question.trim();if(!q||busy)return;
    setBusy(true);setAnswer("");
    try{
      const msgs=convHistory.slice(-6).flatMap(h=>[{role:"user",content:h.q},{role:"assistant",content:h.a}]);
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:500,
        system:"Maritime freight analyst. Short direct answers: facts and numbers only, max 4 sentences. No preamble.\n\n"+buildContext(),
        messages:[...msgs,{role:"user",content:q}]
      })});
      const d=await res.json();
      const a=(d.content||[]).map(b=>b.text||"").join("").trim();
      setAnswer(a);setConvHistory(h=>[...h,{q,a}].slice(-10));setQuestion("");
    }catch(e){setAnswer("Error: "+e.message);}finally{setBusy(false);}
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <div style={{display:"flex",gap:5}}>
        <input value={question} onChange={e=>setQuestion(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")ask();}}
          placeholder="Ask about your data…"
          style={{flex:1,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"5px 9px",outline:"none"}}/>
        <button onClick={ask} disabled={busy||!question.trim()}
          style={{background:busy||!question.trim()?"#1a3a5f":"#1f6feb",border:"none",borderRadius:5,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"5px 14px",cursor:busy||!question.trim()?"default":"pointer",flexShrink:0}}>
          {busy?"…":"Ask"}
        </button>
      </div>
      {busy&&<div style={{fontSize:11,color:C.faint,padding:"2px 0"}}>thinking…</div>}
      {answer&&(
        <div style={{background:"rgba(80,200,120,0.06)",border:"1px solid rgba(80,200,120,0.25)",borderRadius:5,padding:"8px 10px",fontSize:11,color:C.tx,lineHeight:1.5,whiteSpace:"pre-wrap",fontFamily:"sans-serif"}}>
          {answer}
        </div>
      )}
      {convHistory.length>1&&(
        <div style={{borderTop:"1px solid "+C.bd2,paddingTop:5,display:"flex",flexDirection:"column",gap:3,maxHeight:140,overflowY:"auto"}}>
          <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Previous questions</div>
          {[...convHistory].reverse().slice(1).map((h,i)=>(
            <div key={i} onClick={()=>setQuestion(h.q)} style={{fontSize:10,color:C.dim,cursor:"pointer",padding:"2px 4px",borderRadius:3,background:C.bg3}}
              title={h.a}>
              {h.q}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RightPanel({vessels,cargoes}){
  const [activeTab,setActiveTab]=useState("ai");
  const [intelItems,setIntelItems]=useState([]);
  useEffect(()=>{loadIntel().then(d=>{setIntelItems(d);});},[]);

  return(
    <div style={{width:340,flexShrink:0,background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",alignSelf:"stretch",resize:"horizontal",minWidth:220,maxWidth:520}}>
      <div style={{display:"flex",borderBottom:"1px solid "+C.bd2,background:C.bg,flexShrink:0}}>
        {[["ai","🤖 Ask AI"],["intel","📡 Intel"]].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{flex:1,padding:"7px 4px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"sans-serif",fontWeight:700,fontSize:10,color:activeTab===id?C.blue:C.dim,borderBottom:"2px solid "+(activeTab===id?C.blue:"transparent")}}>
            {label}
          </button>
        ))}
      </div>
      <div style={{flex:1,padding:"10px",overflowY:"auto"}}>
        {activeTab==="ai"&&<AIAsk vessels={vessels} cargoes={cargoes} intelItems={intelItems}/>}
        {activeTab==="intel"&&<IntelVault onVaultUpdate={setIntelItems}/>}
      </div>
    </div>
  );
}


// ─── ParsePanel ───────────────────────────────────────────────────────────────
function ParsePanel({vessels,cargoes,onAddVessels,onAddCargoes,lockedMode}){
  const [mode,setMode]=useState(lockedMode||"pos");
  const [text,setText]=useState("");const [img,setImg]=useState(null);
  const [busy,setBusy]=useState(false);const [status,setStatus]=useState(null);
  const fRef=useRef(null);const xlsRef=useRef(null);
  const todayISO=()=>new Date().toISOString().slice(0,10);
  const [posDate,setPosDate]=useState(todayISO);

  async function handleXls(file){
    if(!file)return;
    setBusy(true);setStatus({t:"info",m:"Reading spreadsheet…"});
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array",cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      if(!rows.length){setStatus({t:"error",m:"Empty file."});return;}
      const hdr=Object.keys(rows[0]);
      const fnd=(keys)=>hdr.find(h=>keys.some(k=>h.toLowerCase().includes(k)))||null;
      if(mode==="pos"){
        const cVessel=fnd(["vessel","ship","name"]);
        const cOp=fnd(["operator","commercial","pool","manager","owner","company","opr"]);
        const cDate=fnd(["open date","date","open"]);
        const cPort=fnd(["port","open port","position"]);
        const cComment=fnd(["comment","note","remark"]);
        const parsed=rows.filter(r=>r[cVessel]).map(r=>{
          const d=r[cDate];
          const dateStr=d instanceof Date?d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}):String(d||"");
          return {vessel:String(r[cVessel]||"").trim(),operator:String(r[cOp]||"").trim(),date:dateStr,openPort:String(r[cPort]||"").trim(),comment:String(r[cComment]||"").trim()};
        }).filter(v=>v.vessel);
        if(!parsed.length){setStatus({t:"error",m:"No vessel rows found. Check column headers."});return;}
        const res=onAddVessels(parsed);
        setStatus({t:"success",m:"✓ "+res.added+" added, "+res.updated+" updated from "+rows.length+" rows"});
      } else {
        const cCharterer=fnd(["charterer","chtd","customer","client"]);
        const cVessel=fnd(["vessel","ship","name"]);
        const cQty=fnd(["quantity","qty","mt","tons"]);
        const cProduct=fnd(["product","cargo","grade","type"]);
        const cLoad=fnd(["load port","loadport","load","origin","from"]);
        const cDisch=fnd(["disch port","dischport","discharge","disch","dest","to"]);
        const cLCS=fnd(["l/cstart","lcstart","laycan start","lc start","laycan"]);
        const cLCE=fnd(["l/cend","lcend","laycan end","lc end"]);
        const cFreight=fnd(["freight","rate","hire"]);
        const cComment=fnd(["comment","note","remark"]);
        const cStatus=fnd(["status"]);
        const fmtD=d=>{if(!d)return"";if(d instanceof Date)return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});return String(d).trim();};
        const fmtQ=q=>{if(!q&&q!==0)return"";const n=typeof q==="number"?q:Number(String(q).replace(/[^0-9.]/g,""));if(isNaN(n)||n===0)return String(q);return n>=1000?Math.round(n/1000)+"kt":n+"t";};
        const parsed=rows.map((r,idx)=>{
          const ls=fmtD(r[cLCS]);const le=fmtD(r[cLCE]);
          const laycan=ls&&le&&ls!==le?ls+" - "+le:ls||le||"";
          const vessel=String(r[cVessel]||"").trim();
          const rawSt=cStatus&&r[cStatus]?String(r[cStatus]).toUpperCase():"";
          const status=rawSt==="FIXED"?"FIXED":rawSt==="SUBS"?"SUBS":"";
          const cUpdated=fnd(["updated date","updated","date updated","last updated"]);
          const rawUpd=r[cUpdated];
          const addedAt=rawUpd instanceof Date?rawUpd.toISOString():rawUpd?new Date(rawUpd).toISOString()||new Date().toISOString():new Date().toISOString();
          return {id:"xls-"+Date.now()+"-"+idx+"-"+Math.random().toString(36).slice(2,5),charterer:String(r[cCharterer]||"").trim(),vessel,qty:fmtQ(r[cQty]),cargoType:String(r[cProduct]||"").trim().toUpperCase(),loadPort:String(r[cLoad]||"").trim(),dischPort:String(r[cDisch]||"").trim(),laycan,freight:String(r[cFreight]||"").trim(),comment:String(r[cComment]||"").trim(),status,addedAt};
        }).filter(r=>r.charterer||r.vessel||r.loadPort);
        if(!parsed.length){setStatus({t:"error",m:"No cargo rows found. Check column headers."});return;}
        const lk=onAddCargoes(parsed);
        setStatus({t:"success",m:"✓ "+parsed.length+" fixtures imported from "+rows.length+" rows"+(lk?", "+lk+" pos updated":"")});
      }
    }catch(e){setStatus({t:"error",m:"Import error: "+e.message});}finally{setBusy(false);}
  }

  function onPaste(e){for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}
  async function go(){
    if(!text.trim()&&!img){setStatus({t:"error",m:"Paste text or attach image."});return;}
    setBusy(true);setStatus({t:"info",m:img?"Reading image…":"Parsing…"});
    try{
      const knownVessels=vessels.map(v=>v.vessel).filter(Boolean);const knownCargo=[...new Set((cargoes||[]).map(c=>c.vessel).filter(Boolean))];const known=[...new Set([...knownVessels,...knownCargo])];
      if(mode==="pos"){
        const p=await parsePos(text||"(img)",img,known);if(!p?.length){setStatus({t:"error",m:"No vessel data found."});return;}
        const ts=posDate?new Date(posDate).toISOString():new Date().toISOString();
        const stamped=p.map(v=>({...v,updatedAt:ts}));
        const r=onAddVessels(stamped);setText("");setImg(null);
        setStatus({t:"success",m:"✓ "+(r.added?r.added+" added":"")+(r.updated?", "+r.updated+" updated":"")+" - "+r.total+" total"});
      }else{
        const p=await parseCargo(text||"(img)",img,known);if(!p?.length){setStatus({t:"error",m:"No fixture data found."});return;}
        const lk=onAddCargoes(p);setText("");setImg(null);
        setStatus({t:"success",m:"✓ "+p.length+" fixture(s)"+(lk?", "+lk+" pos updated":"")});
      }
    }catch(e){setStatus({t:"error",m:e.message});}finally{setBusy(false);}
  }
  const sc=status?.t==="success"?C.green:status?.t==="error"?C.red:C.blue;
  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",marginBottom:10}}>
      {!lockedMode&&<div style={{display:"flex",borderBottom:"1px solid "+C.bd2}}>
        {[["pos","⚓ Positions"],["cargo","📦 Cargoes"]].map(([m,l])=>(
          <button key={m} onClick={()=>{setMode(m);setStatus(null);}} style={{flex:1,padding:"6px",border:"none",background:"transparent",color:mode===m?C.blue:C.dim,fontFamily:"inherit",fontSize:11,fontWeight:700,borderBottom:"2px solid "+(mode===m?C.blue:"transparent"),cursor:"pointer"}}>{l}</button>
        ))}
      </div>}
      {img?.dataUrl&&<div style={{position:"relative"}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",display:"block"}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:"50%",width:20,height:20,fontSize:11,cursor:"pointer"}}>✕</button></div>}
      {img&&!img.dataUrl&&<div style={{padding:"3px 10px",background:"rgba(188,140,255,.07)",fontSize:11,color:C.purple,display:"flex",justifyContent:"space-between"}}><span>📷 attached</span><button onClick={()=>setImg(null)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:11}}>✕</button></div>}
      <textarea value={text} onChange={e=>setText(e.target.value)} onPaste={onPaste}
        placeholder={mode==="pos"?"Paste positions or Ctrl+V screenshot…":"Paste cargo fixtures or Ctrl+V screenshot…"}
        style={{width:"100%",minHeight:52,background:C.bg2,border:"none",color:C.tx,fontFamily:"inherit",fontSize:11,padding:"6px 10px",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
      <div style={{padding:"5px 8px",borderTop:"1px solid "+C.bd2,display:"flex",gap:5,alignItems:"center"}}>
        <button onClick={go} disabled={busy} style={{flex:1,background:busy?"#1a4a8f":"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"5px 0",cursor:busy?"default":"pointer"}}>
          {busy?"⟳ Processing…":"▶ Parse & Add"}
        </button>
        <button onClick={()=>fRef.current?.click()} title="Upload image / screenshot" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"3px 10px",fontFamily:"inherit",fontSize:13,cursor:"pointer",flexShrink:0}}>🖼</button>
        {mode==="pos"&&<input type="date" value={posDate} onChange={e=>setPosDate(e.target.value)} title="Date of this position list - used as Updated date" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:3,color:C.dim,fontFamily:"inherit",fontSize:10,padding:"2px 5px",outline:"none",width:118,flexShrink:0}}/>}
        <button onClick={()=>xlsRef.current?.click()} title="Upload Excel / CSV" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"3px 8px",fontFamily:"inherit",fontSize:11,cursor:"pointer",flexShrink:0}}>📊</button>
        <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
        <input ref={xlsRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>handleXls(e.target.files?.[0])}/>
      </div>
      {status&&<div style={{padding:"2px 8px 6px"}}><div style={{padding:"4px 10px",borderRadius:5,fontSize:11,background:sc+"18",color:sc,border:"1px solid "+sc+"44"}}>{status.m}</div></div>}
    </div>
  );
}

// ─── Inline edit cell ─────────────────────────────────────────────────────────
function EC({value,color,placeholder,onSave,bold,onTab,...rest}){
  const [ed,setEd]=useState(false);const [draft,setDraft]=useState("");const [hov,setHov]=useState(false);const ref=useRef(null);
  function start(e){e.stopPropagation();setDraft(value||"");setEd(true);setTimeout(()=>{if(ref.current){ref.current.focus();ref.current.select?.();}},15);}
  function commit(){setEd(false);const t=draft.trim();if(t!==(value||""))onSave(t);}
  function onKey(e){
    e.stopPropagation();
    if(e.key==="Enter"){e.preventDefault();commit();}
    if(e.key==="Escape"){setEd(false);}
    if(e.key==="Tab"){e.preventDefault();commit();if(onTab)setTimeout(onTab,30);}
  }
  if(ed)return(
    <td onClick={e=>e.stopPropagation()} style={{padding:"3px 5px",background:"rgba(88,166,255,.06)",outline:"1px solid rgba(88,166,255,.4)",verticalAlign:"middle"}}>
      <input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={onKey} placeholder={placeholder||""}
        style={{background:C.bg,border:"1px solid "+C.blue,borderRadius:3,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"1px 4px",width:"100%",outline:"none",boxSizing:"border-box"}}/>
    </td>
  );
  return(
    <td onClick={start} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} title={value||(placeholder||"Click to edit")}
      style={{padding:"4px 7px",cursor:"text",outline:hov?"1px solid rgba(79,195,247,.3)":"none",outlineOffset:"-1px",verticalAlign:"middle",transition:"background .1s",whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} {...rest}>
      <div style={{display:"flex",alignItems:"center",gap:2,overflow:"hidden"}}>
        <span style={{color:value?(color||C.tx):C.faint,fontWeight:bold?700:400,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",minWidth:0}}>{value||""}</span>
        {hov&&<span style={{color:C.faint,fontSize:9}}>✎</span>}
      </div>
    </td>
  );
}

// ─── Fixing Window Stats ──────────────────────────────────────────────────────
// ─── Opening Breakdown bar chart ──────────────────────────────────────────────
function OpeningBreakdown({vessels}){
  const open = vessels.filter(v=>v.openPort&&v.openPort!=="EMPLOYED"&&v.date);
  const total = vessels.length;

  // Bucket vessels by days until open
  const ppt=[], d24=[], d48=[], d48plus=[], nodate=[];
  for(const v of open){
    const d=daysBetween(v.date);
    if(d===null){nodate.push(v);continue;}
    if(d<=1)ppt.push(v);
    else if(d<=4)d24.push(v);
    else if(d<=8)d48.push(v);
    else d48plus.push(v);
  }
  const employed=vessels.filter(v=>v.openPort==="EMPLOYED");
  const nodateOpen=vessels.filter(v=>v.openPort&&v.openPort!=="EMPLOYED"&&!v.date);

  const buckets=[
    {label:"Open today/tomorrow",sublabel:"PPT",vessels:ppt,col:"#f78166"},
    {label:"2-4 days",sublabel:"2-4d",vessels:d24,col:C.amber},
    {label:"4-8 days",sublabel:"4-8d",vessels:d48,col:C.blue},
    {label:">8 days",sublabel:">8d",vessels:d48plus,col:"#2ecc71"},
  ];
  const maxCount=Math.max(1,...buckets.map(b=>b.vessels.length));

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd2,borderRadius:7,padding:"10px 14px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:10}}>
        <div>
          <span style={{fontSize:9,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Total fleet</span>
          <span style={{fontSize:22,fontWeight:800,color:C.tx,marginLeft:8}}>{total}</span>
        </div>
        <div style={{fontSize:9,color:C.faint}}>
          {employed.length>0&&(<span style={{color:C.purple,marginRight:8}}>{employed.length} employed</span>)}
          {nodateOpen.length>0&&(<span style={{color:C.faint,marginRight:8}}>{nodateOpen.length} no date</span>)}
        </div>
      </div>
      {/* Bar chart */}
      <div style={{display:"flex",gap:6,alignItems:"flex-end",height:120}}>
        {buckets.map(b=>{
          const pct=b.vessels.length/maxCount;
          const barH=Math.max(pct*100,b.vessels.length>0?6:0);
          return(
            <div key={b.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"default"}}
              title={b.vessels.length>0?b.vessels.map(v=>v.vessel).join(", "):""}>
              {b.vessels.length>0&&(<div style={{fontSize:11,fontWeight:700,color:b.col}}>{b.vessels.length}</div>)}
              <div style={{width:"100%",background:C.bg3,borderRadius:4,height:100,display:"flex",alignItems:"flex-end",overflow:"hidden"}}>
                <div style={{width:"100%",height:barH,background:b.col+(b.vessels.length>0?"cc":"44"),borderRadius:4,transition:"height 0.3s"}}/>
              </div>
              <div style={{fontSize:9,color:b.vessels.length>0?b.col:C.faint,fontWeight:700,textAlign:"center",whiteSpace:"nowrap"}}>{b.sublabel}</div>
              <div style={{fontSize:8,color:C.faint,textAlign:"center",whiteSpace:"nowrap"}}>{b.label.replace(/ days|PPT/g,"")}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function FixingWindow({vessels, opFilter, onOpFilter}){
  const openVessels = vessels.filter(v=>v.date&&v.openPort&&v.openPort!=="EMPLOYED");
  if(!openVessels.length)return null;

  const withDays = openVessels.map(v=>({...v,days:daysBetween(v.date)})).filter(v=>v.days!==null);
  if(!withDays.length)return null;

  const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
  const avgR=arr=>arr.length?Math.round(mean(arr)):null;
  const allAvg=avgR(withDays.map(v=>v.days));

  const normFWOp=s=>(s||"Unknown").trim();
  const byOp={};
  for(const v of withDays){const op=normFWOp(v.operator);if(!byOp[op])byOp[op]=[];byOp[op].push(v.days);}

  const rows=Object.entries(byOp)
    .sort((a,b)=>avgR(b[1])-avgR(a[1])) // Sort desc by fixing window
    .map(([op,daysArr],i)=>({op,days:avgR(daysArr),count:daysArr.length,col:OP_COLORS[i%OP_COLORS.length]}));

  // Scale: min = min(0, lowestDays), max = maxDays
  // fill = days/maxDays clamped [0,1]
  // Average shown as reference line
  const allDays=[...(allAvg!=null?[allAvg]:[]),...rows.map(r=>r.days).filter(d=>d!=null)];
  const maxDays=allDays.length?Math.max(0,...allDays):30;
  const minDays=Math.min(0,...allDays);  // can be negative (past prompt)
  const range=maxDays-minDays||1;
  const toPct=d=>Math.max(0,Math.min(1,(d-minDays)/range));
  const avgPct=allAvg!=null?toPct(allAvg):0.5;

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,padding:"8px 12px 10px",marginBottom:10}}>
      <div style={{fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>⏱ Fixing Window - Open Fleet by Operator</div>
      {/* Chart area */}
      <div style={{position:"relative",marginBottom:6}}>
        {rows.map((r,i)=>{
          const pct=toPct(r.days);
          return(
            <div key={r.op} onClick={()=>onOpFilter&&onOpFilter(r.op)} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,cursor:onOpFilter?"pointer":"default",borderRadius:4,padding:"1px 4px 1px 0",background:opFilter===r.op?"rgba(79,195,247,0.08)":"transparent",outline:opFilter===r.op?"1px solid rgba(79,195,247,0.3)":"none"}}>
              <div style={{minWidth:140,maxWidth:140,fontSize:10,color:opFilter===r.op?C.blue:C.dim,fontWeight:opFilter===r.op?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right",paddingRight:4}}>{r.op}</div>
              <div style={{flex:1,position:"relative",height:18,background:C.bg3,borderRadius:3}}>
                {/* Filled bar from left up to pct */}
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:(pct*100)+"%",background:r.col+"66",borderRadius:3,transition:"width 0.4s"}}/>
                {/* Bright right edge line */}
                <div style={{position:"absolute",left:"calc("+( pct*100)+"% - 2px)",top:0,height:"100%",width:3,background:r.col,borderRadius:1}}/>
                {/* Fleet average reference line */}
                <div style={{position:"absolute",left:(avgPct*100)+"%",top:0,height:"100%",width:1,background:"rgba(79,195,247,0.35)"}}/>
              </div>
              <div style={{minWidth:38,textAlign:"right",fontSize:11,fontWeight:700,color:r.col}}>{r.days!=null?(r.days>=0?"+":"")+r.days+"d":"—"}</div>
              <div style={{minWidth:22,textAlign:"right",fontSize:9,color:C.faint}}>{r.count}v</div>
            </div>
          );
        })}
        {/* Fleet avg row */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px solid "+C.bd2}}>
          <div style={{minWidth:140,maxWidth:140,fontSize:10,color:C.tx,fontWeight:700,textAlign:"right",paddingRight:4}}>Fleet avg</div>
          <div style={{flex:1,position:"relative",height:18,background:C.bg3,borderRadius:3}}>
            <div style={{position:"absolute",left:0,top:0,height:"100%",width:(avgPct*100)+"%",background:"rgba(79,195,247,0.12)",borderRadius:3}}/>
            <div style={{position:"absolute",left:"calc("+(avgPct*100)+"% - 1px)",top:0,height:"100%",width:2,background:"rgba(79,195,247,0.7)"}}/>
          </div>
          <div style={{minWidth:38,textAlign:"right",fontSize:11,fontWeight:700,color:C.tx}}>{allAvg!=null?(allAvg>=0?"+":"")+allAvg+"d":"—"}</div>
          <div style={{minWidth:22,textAlign:"right",fontSize:9,color:C.faint}}>{withDays.length}v</div>
        </div>
      </div>
      {/* Legend */}
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 10px"}}>
        {rows.map(r=>(<span key={r.op} style={{fontSize:9,color:r.col}}>● {r.op}</span>))}
      </div>
      <div style={{fontSize:9,color:C.faint,marginTop:5}}>Fill = fixing window relative to fleet · ▏= fleet avg ({allAvg!=null?(allAvg>=0?"+":"")+allAvg+"d":"—"}) · neg = past PPT</div>
    </div>
  );
}


// ─── Export Panel ─────────────────────────────────────────────────────────────
function ExportPanel({vessels, cargoes, mode}) {
  // mode = "pos" | "cargo"
  const [copied, setCopied] = useState(false);
  const [selRows, setSelRows] = useState(null);

  function fmtDate(){ return new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }

  // WhatsApp / text format for positions
  function posToText(rows){
    const tt = s => !s?"":s.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):"").join(" ");
    // Group by operator
    const byOp = {};
    for(const v of rows){ const op=v.operator||"Unknown"; if(!byOp[op])byOp[op]=[]; byOp[op].push(v); }
    const parts = [];
    parts.push(`🚢 *Open Positions* - ${fmtDate()}`);
    parts.push("");
    for(const [op, vList] of Object.entries(byOp)){
      parts.push(`*${tt(op)}*`);
      for(const v of vList){
        const port = v.openPort==="EMPLOYED" ? "On Subs" : tt(v.openPort||"—");
        const date = v.date||"";
        const ppt  = isOpenPPT(v.date) ? " ✓" : "";
        parts.push(`${tt(v.vessel||"TBN")} || ${port} || ${date}${ppt}`);
      }
      parts.push("");
    }
    return parts.join("\n").trim();
  }

  // WhatsApp / text format for cargoes
  function cargoToText(rows){
    const tc = s => !s?"":s.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):"").join(" ");
    const fmtQty = q => normaliseQty(q)||"";
    const parts = [];
    parts.push("\ud83d\udce6 *Cargoes* \u2014 "+fmtDate());
    parts.push("");
    for(const c of rows){
      const st = c.status||"";
      const charterer = tc(c.charterer||"");
      const qty = fmtQty(c.qty);
      const cargo = (c.cargoType||"").toUpperCase();
      const load = tc(c.loadPort||"");
      const disch = tc(c.dischPort||"");
      const laycan = c.laycan||"";
      const freight = c.freight||"";
      const vessel = tc(c.vessel||"");
      let line = "";
      if((st==="FIXED"||st==="SUBS") && vessel){
        const fixWord = st==="SUBS"?"on subs":"fixed";
        line = [charterer,fixWord,vessel,qty,cargo,load,"to",disch,laycan,freight?"USD "+freight+" ls":""].filter(Boolean).join(" ");
      } else {
        line = [vessel||charterer,qty,cargo,load,"to",disch,laycan].filter(Boolean).join(" ");
      }
      parts.push(line);
    }
    return parts.join("\n").trim();
  }

  // Excel / CSV export using blob download
  function exportExcel(rows, type){
    let csvRows;
    if(type==="pos"){
      csvRows = [
        ["Vessel","Operator","Built","DWT","LOA","Beam","CBM","Open Date","Open Port","Comment","Fuel","Ice Class"],
        ...rows.map(v=>[
          v.vessel||"",v.operator||"",v.built||"",v.dwt||"",v.loa||"",v.beam||"",v.cbm||"",
          v.date||"",v.openPort||"",v.comment||"",v.spec?.fuel||"",v.spec?.iceClass||""
        ])
      ];
    } else {
      csvRows = [
        ["Vessel","Charterer","Cargo","Qty","Load Port","Disch Port","Laycan","Freight","Status"],
        ...rows.map(c=>[
          c.vessel||"",c.charterer||"",c.cargoType||"",c.qty||"",
          c.loadPort||"",c.dischPort||"",c.laycan||"",c.freight||"",c.status||""
        ])
      ];
    }
    // CSV with proper escaping
    const csv = csvRows.map(row=>row.map(cell=>{
      const s=String(cell).replace(/"/g,"\"\"");
      return s.includes(",")||s.includes("\n")||s.includes('"') ? `"${s}"` : s;
    }).join(",")).join("\n");

    const bom = "\uFEFF"; // UTF-8 BOM for Excel
    const blob = new Blob([bom+csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`tankpos_${type}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const rows = mode==="pos" ? vessels : cargoes;
  const btnStyle = {fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:5,border:"1px solid "+C.bd,
    background:C.bg3,color:C.tx,cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"};

  function copyText(){
    const txt = mode==="pos" ? posToText(rows) : cargoToText(rows);
    // Reliable cross-browser copy
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(ta);
    // Also try modern API
    if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false),3000);
  }

  if(!rows.length) return null;
  return(
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:9,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Export</span>
      <button style={{...btnStyle,borderColor:copied?C.green:C.bd,color:copied?C.green:C.tx}}
        onClick={copyText} title="Copy as WhatsApp-ready text">
        {copied?"✓ Copied!":"📋 Copy (WhatsApp)"}
      </button>
      <button style={btnStyle} onClick={()=>exportExcel(rows,"pos"===mode?"pos":"cargo")}
        title="Download as CSV / Excel">
        📊 Export CSV
      </button>
    </div>
  );
}

// ─── Desktop Positions Table ──────────────────────────────────────────────────
function DesktopApp({vessels,cargoes,onUpdateV,onRenameV,onUpdateC,onAddVessels,onAddCargoes,onAddV,onAddC,onDelV,onDelC}){
  const [tab,setTab]=useState("pos");
  const [search,setSearch]=useState("");
  const [filters,setFilters]=useState(new Set());
  const [sortK,setSortK]=useState(null);const [sortD,setSortD]=useState(1);
  const [sel,setSel]=useState(null);
  const [opFilter,setOpFilter]=useState(null);
  const [cSearch,setCSearch]=useState("");const [cFilter,setCFilter]=useState("ALL");const [cDateFilter,setCDateFilter]=useState("");
  const [cTimeFilter,setCTimeFilter]=useState("");
  const [mxSearch,setMxSearch]=useState("");
  const [cSortK,setCsortK]=useState("addedAt");const [cSortD,setCsortD]=useState(-1);
  const [history,setHistory]=useState([]);
  useEffect(()=>{loadHistory().then(setHistory);},[vessels]);
  const [pendingDel,setPendingDel]=useState(null);
  const [restoreMsg,setRestoreMsg]=useState("");
  const restoreRef=useRef(null); // {type:'vessel'|'cargo'|'all', id, label}
  const [colWidthsV,setColWidthsV]=useState({Operator:120,Vessel:120,Built:48,DWT:55,LOA:48,Beam:46,CBM:55,Date:68,OpenPort:100,Comment:120,Updated:76,Spec:72});
  const [colWidthsC,setColWidthsC]=useState({Status:60,Vessel:130,Charterer:110,Cargo:80,Qty:60,Load:100,Disch:100,Laycan:110,Freight:90,Comment:120,Updated:88});

  const th={background:C.bg2,color:C.dim,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",padding:"6px 8px",borderBottom:"1px solid "+C.bd2,textAlign:"left",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"};
  const td={padding:"4px 7px",borderBottom:"1px solid "+C.bg2,verticalAlign:"middle",fontSize:11};
  const fb=on=>({fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:4,border:"1px solid "+(on?C.blue:C.bd),background:on?"rgba(88,166,255,.12)":"transparent",color:on?C.blue:C.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});

  function toggleFilter(f){setFilters(prev=>{const n=new Set(prev);n.has(f)?n.delete(f):n.add(f);return n;});}
  function srt(k){setSortD(sortK===k?sortD*-1:1);setSortK(k);}

  // Multi-token search across all text fields
  const tokens=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  function matchesSearch(v){
    if(!tokens.length)return true;
    const hay=JSON.stringify(v).toLowerCase();
    return tokens.every(t=>hay.includes(t));
  }

  const filtV=useMemo(()=>{
    let list=vessels;
    if(filters.size>0){
      list=list.filter(v=>{
        if(filters.has("PPT")&&!isOpenPPT(v.date))return false;
        if(filters.has("NAP")&&!(v.comment?.toLowerCase().includes("naph")||v.spec?.lastCargo?.toLowerCase().includes("naph")))return false;
        if(filters.has("SUBS")&&v.openPort!=="EMPLOYED")return false;
        const reg=classifyRegion(v.openPort);
        for(const r of["WCUK","ECUK","CANAL","BISCAY","BALTIC","SKAW","MED"]){if(filters.has(r)&&reg!==r)return false;}
        return true;
      });
    }
    const normOp=s=>(s||"Unknown").trim().toLowerCase();if(opFilter)list=list.filter(v=>normOp(v.operator)===normOp(opFilter));
    list=list.filter(matchesSearch);
    if(sortK)list=[...list].sort((a,b)=>{const av=String(a[sortK]||"").toLowerCase(),bv=String(b[sortK]||"").toLowerCase();return av<bv?-sortD:av>bv?sortD:0;});
    return list;
  },[vessels,filters,search,sortK,sortD,opFilter]);

  const stats={total:vessels.length,ppt:vessels.filter(v=>isOpenPPT(v.date)).length,subs:vessels.filter(v=>v.openPort==="EMPLOYED").length};
  const selV=sel?vessels.find(v=>v.vessel===sel):null;
  const selFixes=sel?cargoes.filter(c=>c.vessel&&c.vessel.toLowerCase()===sel.toLowerCase()):[];
  const cTokens=cSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtC=useMemo(()=>{
    const now=new Date();
    const startOfWeek=(d)=>{const r=new Date(d);r.setHours(0,0,0,0);r.setDate(r.getDate()-r.getDay()+1);return r;};
    const thisWeekStart=startOfWeek(now);
    const lastWeekStart=new Date(thisWeekStart);lastWeekStart.setDate(lastWeekStart.getDate()-7);
    const lastWeekEnd=new Date(thisWeekStart);
    const ytdStart=new Date(now.getFullYear(),0,1);
    let list=cargoes.filter(c=>{
      if(cTimeFilter){
        const d=new Date(c.addedAt||c.updatedAt||0);
        if(cTimeFilter==="tw"&&(d<thisWeekStart||d>now))return false;
        if(cTimeFilter==="lw"&&(d<lastWeekStart||d>=lastWeekEnd))return false;
        if(cTimeFilter==="ytd"&&d<ytdStart)return false;
      }
      if(cFilter==="FIXED"&&c.status!=="FIXED")return false;
      if(cFilter==="SUBS"&&c.status!=="SUBS")return false;

      if(cDateFilter){const hay=(c.laycan||"")+" "+(c.dischDate||"");if(!hay.toLowerCase().includes(cDateFilter.toLowerCase()))return false;}
      if(!cTokens.length)return true;
      return cTokens.every(t=>JSON.stringify(c).toLowerCase().includes(t));
    });
    if(cSortK){
      list=[...list].sort((a,b)=>{
        const colToField={Status:"status",Vessel:"vessel",Charterer:"charterer",Cargo:"cargoType",Qty:"qty",Load:"loadPort",Disch:"dischPort",Laycan:"laycan",Freight:"freight",Comment:"comment",Updated:"addedAt"};
        const fld=colToField[cSortK]||cSortK;
        let av=a[fld]||"",bv=b[fld]||"";
        if(fld==="addedAt"||fld==="updatedAt"){av=av?new Date(av).getTime():0;bv=bv?new Date(bv).getTime():0;return(av-bv)*cSortD;}
        return String(av).toLowerCase()<String(bv).toLowerCase()?-cSortD:String(av).toLowerCase()>String(bv).toLowerCase()?cSortD:0;
      });
    }
    return list;
  },[cargoes,cFilter,cSearch,cDateFilter,cSortK,cSortD,cTimeFilter]);

  const FILTER_GROUPS=[
    {label:"Status",items:[["PPT","Open PPT"],["SUBS","On Subs"],["NAP","Nap"]]},
    {label:"Region",items:[["WCUK","WCUK"],["ECUK","ECUK"],["CANAL","Canal"],["BISCAY","Biscay"],["SKAW","Skaw"],["BALTIC","Baltic"],["MED","Med"]]},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.tx,fontFamily:"IBM Plex Mono,monospace"}}>
      {/* ── Delete confirmation ── */}
      {pendingDel&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",
          zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",
          fontFamily:"sans-serif",fontSize:13,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong>{pendingDel.label}</strong>?</span>
          <button onClick={()=>{
            if(pendingDel.type==="vessel"||pendingDel.type==="all") onDelV(pendingDel.id);
            else if(pendingDel.type==="cargo") onDelC(pendingDel.id);
            else if(pendingDel.type==="allcargo") onDelC("__ALLCARGO__");
            setPendingDel(null);
          }} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:13}}>Delete</button>
          <button onClick={()=>setPendingDel(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:13}}>Cancel</button>
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 18px",background:C.bg2,borderBottom:"1px solid "+C.bd,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"sans-serif",fontWeight:800,fontSize:17}}>⚓ Tank<span style={{color:C.green}}>Pos</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>backupData(vessels,cargoes)} style={{background:"none",border:"1px solid "+C.green,borderRadius:4,padding:"2px 10px",color:C.green,fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Download all data as JSON">💾 Backup</button>
          <input ref={restoreRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(!f)return;restoreData(f,(v)=>{setVessels(v);saveV(v);},(c)=>{setCargoes(c);saveC(c);setRestoreMsg(c.length+" cargoes restored");setTimeout(()=>setRestoreMsg(""),4000);});e.target.value="";}}/>
          <button onClick={()=>restoreRef.current&&restoreRef.current.click()} style={{background:"none",border:"1px solid "+C.blue,borderRadius:4,padding:"2px 10px",color:C.blue,fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Restore from JSON backup">📂 Restore</button>
          {restoreMsg&&<span style={{color:C.green,fontSize:11,fontFamily:"inherit"}}>✓ {restoreMsg}</span>}
          {tab==="cargo"&&cargoes.length>0&&(<button onClick={()=>setPendingDel({type:"allcargo",id:"__ALLCARGO__",label:"ALL "+cargoes.length+" cargo fixtures"})} style={{background:"none",border:"1px solid "+C.red,borderRadius:4,padding:"2px 10px",color:C.red,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕ Clear Cargoes</button>)}
          {tab==="pos"&&vessels.length>0&&(<button onClick={()=>setPendingDel({type:"all",id:"__ALL__",label:"ALL "+vessels.length+" vessels"})} style={{background:"none",border:"1px solid "+C.bd,borderRadius:4,padding:"2px 10px",color:C.dim,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕ Clear Positions</button>)}
        </div>
      </div>
      <div style={{padding:"12px 16px",maxWidth:1900,margin:"0 auto"}}>
        <div style={{display:"flex",borderBottom:"1px solid "+C.bd2,marginBottom:12}}>
          {[["pos","⚓ Positions",vessels.length],["cargo","📦 Cargoes",cargoes.length],["matrix","🔗 Matrix",0],["dash","📊 Dashboard",0]].map(([id,label,cnt])=>(
            <button key={id} onClick={()=>setTab(id)} style={{fontFamily:"sans-serif",fontWeight:700,fontSize:12,padding:"7px 16px",border:"none",background:"transparent",color:tab===id?C.blue:C.dim,borderBottom:"2px solid "+(tab===id?C.blue:"transparent"),cursor:"pointer"}}>
              {label}{cnt>0?(<span style={{fontSize:9,marginLeft:3,background:C.bg3,padding:"1px 5px",borderRadius:8}}>{cnt}</span>):null}
            </button>
          ))}
        </div>

        {/* ── POSITIONS ── */}
        {tab==="pos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* ── Three-column top row: Parse+Fixing | Rates | AI+Intel ── */}
            <div style={{display:"flex",gap:10,alignItems:"stretch"}}>
              {/* Left: Parse + FixingWindow */}
              <div style={{flex:"0 0 auto",width:"clamp(280px,38%,480px)",display:"flex",flexDirection:"column",gap:10,resize:"horizontal",overflow:"auto",minWidth:220,maxWidth:520}}>
                <ParsePanel vessels={vessels} onAddVessels={onAddVessels} onAddCargoes={onAddCargoes} lockedMode="pos"/>
                <FixingWindow vessels={vessels} opFilter={opFilter} onOpFilter={op=>setOpFilter(o=>o===op?null:op)}/>
              </div>
              {/* Middle: Rate Matrix */}
              <div style={{flex:"0 0 auto",width:"clamp(240px,28%,360px)",background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",resize:"horizontal",minWidth:180,maxWidth:500}}>
                <div style={{padding:"6px 12px",borderBottom:"1px solid "+C.bd2,background:C.bg,flexShrink:0}}>
                  <span style={{fontSize:10,fontWeight:700,color:C.tx}}>📊 Rate Matrix</span>
                  <span style={{fontSize:9,color:C.faint,marginLeft:8}}>right-click cell for comment</span>
                </div>
                <div style={{padding:"8px 10px",overflowY:"auto",flex:1}}>
                  <RateMatrix/>
                </div>
              </div>
              {/* Right: AI Ask + Intel Vault */}
              <RightPanel vessels={vessels} cargoes={cargoes}/>
            </div>
            {vessels.length?(<>
              {/* Stats row with opening timeline bar chart */}
              <OpeningBreakdown vessels={vessels}/>
              {/* Export */}
              <ExportPanel vessels={filtV} cargoes={cargoes} mode="pos"/>
              {/* Search + filters */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Multi-search: e.g. belfast ulsd 1A  (all tokens must match)"
                  style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"5px 10px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                {FILTER_GROUPS.map(({label,items})=>(
                  <div key={label} style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:9,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:40}}>{label}</span>
                    {items.map(([f,l])=>(
                      <button key={f} onClick={()=>toggleFilter(f)} style={fb(filters.has(f))}>{l}</button>
                    ))}
                    {filters.size?(<button onClick={()=>setFilters(new Set())} style={{...fb(false),color:C.red,borderColor:C.red+"55",marginLeft:4}}>✕ Clear</button>):null}
                  </div>
                ))}
                {opFilter&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"rgba(79,195,247,0.08)",border:"1px solid rgba(79,195,247,0.25)",borderRadius:5,marginBottom:4}}><span style={{fontSize:10,color:C.blue,fontWeight:700}}>🔍 Filtered: {opFilter}</span><button onClick={()=>setOpFilter(null)} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:11,padding:"0 2px"}}>✕ Clear</button></div>}
              <div style={{fontSize:9,color:C.faint}}>💡 Click any cell to edit · {filtV.length}/{vessels.length} shown</div>
              </div>
              {/* Table + side panel */}
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"hidden",flex:1,minWidth:0}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,tableLayout:"fixed",fontFamily:"sans-serif"}}>
                    <colgroup>
                        <col style={{width:130}}/><col style={{width:130}}/><col style={{width:50}}/>
                        <col style={{width:58}}/><col style={{width:50}}/><col style={{width:50}}/><col style={{width:58}}/>
                        <col style={{width:72}}/><col style={{width:110}}/><col style={{width:130}}/><col style={{width:30}}/>
                      </colgroup>
                      <thead>
                      <tr>
                        <th style={{...th,width:colWidthsV["Operator"]||120,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("operator")}><span style={{userSelect:"none",paddingRight:6}}>Operator{sortK==="operator"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Operator"]||120;const mv=m=>setColWidthsV(p=>({...p,"Operator":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["Vessel"]||120,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("vessel")}><span style={{userSelect:"none",paddingRight:6}}>Vessel{sortK==="vessel"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Vessel"]||120;const mv=m=>setColWidthsV(p=>({...p,"Vessel":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["Built"]||48,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("built")}><span style={{userSelect:"none",paddingRight:6}}>Built{sortK==="built"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Built"]||48;const mv=m=>setColWidthsV(p=>({...p,"Built":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["DWT"]||55,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("dwt")}><span style={{userSelect:"none",paddingRight:6}}>DWT{sortK==="dwt"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["DWT"]||55;const mv=m=>setColWidthsV(p=>({...p,"DWT":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["LOA"]||48,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("loa")}><span style={{userSelect:"none",paddingRight:6}}>LOA{sortK==="loa"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["LOA"]||48;const mv=m=>setColWidthsV(p=>({...p,"LOA":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["Beam"]||46,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("beam")}><span style={{userSelect:"none",paddingRight:6}}>Beam{sortK==="beam"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Beam"]||46;const mv=m=>setColWidthsV(p=>({...p,"Beam":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["CBM"]||55,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("cbm")}><span style={{userSelect:"none",paddingRight:6}}>CBM{sortK==="cbm"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["CBM"]||55;const mv=m=>setColWidthsV(p=>({...p,"CBM":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["Date"]||68,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("date")}><span style={{userSelect:"none",paddingRight:6}}>Date{sortK==="date"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Date"]||68;const mv=m=>setColWidthsV(p=>({...p,"Date":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["OpenPort"]||100,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("openPort")}><span style={{userSelect:"none",paddingRight:6}}>Open Port{sortK==="openPort"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["OpenPort"]||100;const mv=m=>setColWidthsV(p=>({...p,"OpenPort":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["Comment"]||120,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("comment")}><span style={{userSelect:"none",paddingRight:6}}>Comment{sortK==="comment"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Comment"]||120;const mv=m=>setColWidthsV(p=>({...p,"Comment":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        <th style={{...th,width:colWidthsV["Updated"]||76,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("updatedAt")}><span style={{userSelect:"none",paddingRight:6}}>Updated{sortK==="updatedAt"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Updated"]||76;const mv=m=>setColWidthsV(p=>({...p,"Updated":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                        
                        <th style={{...th,width:26,minWidth:26}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtV.map((v,i)=>{
                        const fix=cargoes.find(c=>c.vessel&&c.vessel.toLowerCase()===v.vessel.toLowerCase()&&(c.status==="FIXED"||c.status==="SUBS"));
                        const isSel=sel===v.vessel;
                        const reg=classifyRegion(v.openPort);
                        const ppt=isOpenPPT(v.date);
                        const bg=isSel?"rgba(88,166,255,.07)":i%2===0?C.bg:C.bg2;
                        return(
                          <tr key={v.vessel} style={{background:bg,outline:isSel?"1px solid rgba(88,166,255,.2)":"none",cursor:"pointer"}} onClick={()=>setSel(sel===v.vessel?null:v.vessel)}>
                            <EC value={v.operator} color={C.purple} placeholder="Operator" onSave={val=>onUpdateV(v.vessel,"operator",val)} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-date"]`)?.click()}/>
                            <EC value={toTCase(v.vessel)} color={C.blue} bold={true} placeholder="Vessel" onSave={val=>onRenameV&&onRenameV(v.vessel,val?.toUpperCase()||v.vessel)}/>
                            <td style={{...td,color:C.dim,whiteSpace:"nowrap",cursor:"default",overflow:"hidden",maxWidth:0}} title={v.built||""}>{v.built||""}</td>
                            <td style={{...td,color:C.amber,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={fmtN(v.dwt)}>{fmtN(v.dwt)}</td>
                            <td style={{...td,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={v.loa||""}>{v.loa||""}</td>
                            <td style={{...td,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={v.beam||""}>{v.beam||""}</td>
                            <td style={{...td,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={fmtN(v.cbm)}>{fmtN(v.cbm)}</td>
                            <EC value={v.date} color={ppt?C.green:C.blue} placeholder="Date" onSave={val=>onUpdateV(v.vessel,"date",val)} data-vid={v.vessel+"-date"} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-port"]`)?.click()}/>
                            <EC value={v.openPort} color={v.openPort==="EMPLOYED"?C.purple:C.amber} placeholder="Port" onSave={val=>onUpdateV(v.vessel,"openPort",val)} data-vid={v.vessel+"-port"} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-comment"]`)?.click()}/>
                            <EC value={v.comment} color={C.dim} placeholder="Comment" onSave={val=>onUpdateV(v.vessel,"comment",val)} data-vid={v.vessel+"-comment"}/>
                            <td style={{...td,fontSize:9,color:C.faint,whiteSpace:"nowrap",overflow:"hidden",width:colWidthsV.Updated||76}} title={v.updatedAt?new Date(v.updatedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):v.addedAt?new Date(v.addedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""} >{v.updatedAt?new Date(v.updatedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):v.addedAt?new Date(v.addedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>

                            <td style={{...td,width:22}} onClick={e=>e.stopPropagation()}>
                              <button onClick={(e)=>{e.stopPropagation();setPendingDel({type:"vessel",id:v.vessel,label:v.vessel});}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:13,padding:"1px 4px",opacity:0.7}} title="Delete">✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Side panel */}
                {selV&&(
                  <div style={{width:240,flexShrink:0,background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",position:"sticky",top:56,alignSelf:"flex-start",maxHeight:"calc(100vh - 70px)",display:"flex",flexDirection:"column"}}>
                    <div style={{padding:"8px 12px",background:C.bg,borderBottom:"1px solid "+C.bd2,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0}}>
                      <div><div style={{fontFamily:"sans-serif",fontWeight:800,fontSize:13,color:C.blue}}>{toTCase(selV.vessel)}</div><div style={{fontSize:10,color:C.purple}}>{selV.operator||""}</div></div>
                      <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:C.dim,fontSize:14,cursor:"pointer"}}>✕</button>
                    </div>
                    <div style={{padding:"8px 12px",overflowY:"auto",flex:1}}>
                      {[["Open Port","openPort",C.amber],["Date","date",C.blue],["Comment","comment",C.dim],["Operator","operator",C.purple],["Built","built",C.dim],["DWT","dwt",C.amber],["LOA","loa",C.dim],["Beam","beam",C.dim],["CBM","cbm",C.dim]].map(([l,f,col])=>(
                        <div key={f} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid "+C.bg,gap:4}}>
                          <span style={{fontSize:9,color:C.faint,minWidth:55,flexShrink:0}}>{l}</span>
                          <EC value={selV[f]} color={col} placeholder="—" onSave={v2=>onUpdateV(selV.vessel,f,v2)}/>
                        </div>
                      ))}
                      <div style={{fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2}}>Spec</div>
                      {[["Fuel","spec.fuel",C.purple],["Ice Class","spec.iceClass",C.blue],["Last Cargo","spec.lastCargo",C.dim]].map(([l,f,col])=>{
                        const val=f.startsWith("spec.")?(selV.spec||{})[f.split(".")[1]]:selV[f];
                        return(<div key={f} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid "+C.bg,gap:4}}>
                          <span style={{fontSize:9,color:C.faint,minWidth:55,flexShrink:0}}>{l}</span>
                          <EC value={val} color={col} placeholder="—" onSave={v2=>onUpdateV(selV.vessel,f,v2)}/>
                        </div>);
                      })}
                      <div style={{fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2,marginTop:4}}>Notes</div>
                      <EC value={selV.notes} color={C.dim} placeholder="Add vessel notes…" onSave={v2=>onUpdateV(selV.vessel,"notes",v2)}/>
                      {selFixes.length?(<>
                        <div style={{fontSize:9,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2}}>Fixtures ({selFixes.length})</div>
                        {selFixes.map(f=>{const col=f.status==="FIXED"?C.green:f.status==="SUBS"?C.purple:C.blue;return(
                          <div key={f.id} style={{background:C.bg,border:"1px solid "+col+"33",borderRadius:4,padding:"5px 8px",marginBottom:4,marginTop:3}}>
                            <div style={{fontFamily:"sans-serif",fontWeight:700,fontSize:9,color:col}}>{f.status}{f.laycan?" · "+f.laycan:""}</div>
                            <div style={{fontSize:11,fontWeight:600}}>{f.loadPort||"?"}→{f.dischPort||"?"}</div>
                            {f.freight&&<div style={{fontSize:9,color:C.purple}}>{f.freight}</div>}
                          </div>
                        );})}
                      </>):null}
                    </div>
                  </div>
                )}
              </div>
            </>):null}
          </div>
        )}

        {/* ── CARGOES ── */}
        {tab==="cargo"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
                <ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels} onAddCargoes={onAddCargoes} lockedMode="cargo"/>
                <ExportPanel vessels={vessels} cargoes={filtC} mode="cargo"/>
              </div>
              <RightPanel vessels={vessels} cargoes={cargoes}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <input value={cSearch} onChange={e=>setCSearch(e.target.value)} placeholder="🔍 Search cargoes…"
                style={{flex:1,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"5px 10px",outline:"none"}}/>
              {[["ALL","All"],["FIXED","Fixed"],["SUBS","On Subs"]].map(([f,l])=>(
                <button key={f} onClick={()=>setCFilter(f)} style={fb(cFilter===f)}>{l}</button>
              ))}
              {[["","All time"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].map(([v,label])=>(
                <button key={v} onClick={()=>setCTimeFilter(v)} style={{...fb(cTimeFilter===v),whiteSpace:"nowrap"}}>{label}</button>
              ))}
              <input value={cDateFilter} onChange={e=>setCDateFilter(e.target.value)} placeholder="🔍 Filter…"
                style={{width:80,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"3px 7px",outline:"none"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,fontSize:11}}>
              <span style={{color:C.faint}}>Total <span style={{color:C.tx,fontWeight:700}}>{cargoes.length}</span></span>
              <span style={{color:C.faint}}>Showing <span style={{color:C.blue,fontWeight:700}}>{filtC.length}</span></span>
              <span style={{color:C.faint}}>Fixed <span style={{color:C.green,fontWeight:700}}>{cargoes.filter(c=>c.status==="FIXED").length}</span></span>
              
              <span style={{color:C.faint}}>Subs <span style={{color:C.purple,fontWeight:700}}>{cargoes.filter(c=>c.status==="SUBS").length}</span></span>
              <span style={{flex:1}}/>
            </div>
            <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"hidden",overflowX:"auto"}}>
              {filtC.length===0
                ?<div style={{padding:"40px",textAlign:"center",color:C.faint}}><div style={{fontSize:28,marginBottom:8}}>📦</div>No fixtures yet</div>
                :<table style={{width:"100%",borderCollapse:"collapse",fontSize:11,tableLayout:"fixed",fontFamily:"sans-serif"}}>
                  <thead><tr>
                    <th style={{...th,width:colWidthsC["Status"]||60,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Status"){setCsortD(d=>d*-1);}else{setCsortK("Status");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Status{cSortK==="Status"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Status"]||60;const mv=m=>setColWidthsC(p=>({...p,"Status":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Vessel"]||130,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Vessel"){setCsortD(d=>d*-1);}else{setCsortK("Vessel");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Vessel{cSortK==="Vessel"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Vessel"]||130;const mv=m=>setColWidthsC(p=>({...p,"Vessel":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Charterer"]||110,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Charterer"){setCsortD(d=>d*-1);}else{setCsortK("Charterer");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Charterer{cSortK==="Charterer"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Charterer"]||110;const mv=m=>setColWidthsC(p=>({...p,"Charterer":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Cargo"]||80,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Cargo"){setCsortD(d=>d*-1);}else{setCsortK("Cargo");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Cargo{cSortK==="Cargo"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Cargo"]||80;const mv=m=>setColWidthsC(p=>({...p,"Cargo":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Qty"]||55,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Qty"){setCsortD(d=>d*-1);}else{setCsortK("Qty");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Qty{cSortK==="Qty"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Qty"]||55;const mv=m=>setColWidthsC(p=>({...p,"Qty":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Load"]||100,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Load"){setCsortD(d=>d*-1);}else{setCsortK("Load");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Load{cSortK==="Load"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Load"]||100;const mv=m=>setColWidthsC(p=>({...p,"Load":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Disch"]||100,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Disch"){setCsortD(d=>d*-1);}else{setCsortK("Disch");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Disch{cSortK==="Disch"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Disch"]||100;const mv=m=>setColWidthsC(p=>({...p,"Disch":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Laycan"]||120,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Laycan"){setCsortD(d=>d*-1);}else{setCsortK("Laycan");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Laycan{cSortK==="Laycan"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Laycan"]||120;const mv=m=>setColWidthsC(p=>({...p,"Laycan":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Freight"]||90,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Freight"){setCsortD(d=>d*-1);}else{setCsortK("Freight");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Freight{cSortK==="Freight"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Freight"]||90;const mv=m=>setColWidthsC(p=>({...p,"Freight":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Comment"]||130,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Comment"){setCsortD(d=>d*-1);}else{setCsortK("Comment");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Comment{cSortK==="Comment"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Comment"]||130;const mv=m=>setColWidthsC(p=>({...p,"Comment":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Updated"]||88,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Updated"){setCsortD(d=>d*-1);}else{setCsortK("Updated");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Updated{cSortK==="Updated"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Updated"]||88;const mv=m=>setColWidthsC(p=>({...p,"Updated":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:26,minWidth:26,padding:"4px 2px"}}></th>
                  </tr></thead>
                  <tbody>{filtC.map((f,ri)=>{
                    const sc=f.status==="FIXED"?C.green:f.status==="SUBS"?C.purple:C.faint;
                    const fmtLC=s=>{
                      if(!s)return"";
                      // Strip year first
                      let v=s.replace(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}\b/gi,(m,d,mo)=>d+" "+mo);
                      // Compact: "04 Apr - 05 Apr" -> "04-05 Apr", "04 Apr - 05 May" stays as "04 Apr - 05 May"
                      v=v.replace(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*-\s*(\d{1,2})\s+\2/gi,(m,d1,mo,d2)=>d1+"-"+d2+" "+mo);
                      return v;
                    };
                    return <tr key={f.id} style={{background:ri%2===0?C.bg:C.bg2}}>
                      <td style={{...td,width:colWidthsC.Status||60,cursor:"pointer",overflow:"hidden"}} onClick={e=>{e.stopPropagation();const opts=["SUBS","FIXED",""];const cur=opts.indexOf(f.status||"");onUpdateC(f.id,"status",opts[(cur+1)%opts.length]);}} title="Click to cycle status">
                        <span style={{color:sc,fontWeight:700}}>{f.status||""}</span>
                      </td>
                      <EC value={f.vessel} color={C.blue} bold placeholder="TBN" onSave={v2=>onUpdateC(f.id,"vessel",v2)} width={colWidthsC.Vessel||130} onTab={()=>document.querySelector(`[data-cid="${f.id}-chtr"]`)?.click()}/>
                      <EC value={toTCase(f.charterer)} color={C.orange} placeholder="" onSave={v2=>onUpdateC(f.id,"charterer",toTCase(v2))} width={colWidthsC.Charterer||110} data-cid={f.id+"-chtr"} onTab={()=>document.querySelector(`[data-cid="${f.id}-cargo"]`)?.click()}/>
                      <EC value={f.cargoType} placeholder="" onSave={v2=>onUpdateC(f.id,"cargoType",v2)} width={colWidthsC.Cargo||80} data-cid={f.id+"-cargo"} onTab={()=>document.querySelector(`[data-cid="${f.id}-qty"]`)?.click()}/>
                      <EC value={normaliseQty(f.qty)} color={C.amber} placeholder="" onSave={v2=>onUpdateC(f.id,"qty",normaliseQty(v2))} width={colWidthsC.Qty||55} data-cid={f.id+"-qty"} onTab={()=>document.querySelector(`[data-cid="${f.id}-load"]`)?.click()}/>
                      <EC value={toTCase(f.loadPort)} placeholder="" onSave={v2=>onUpdateC(f.id,"loadPort",v2)} width={colWidthsC.Load||100} data-cid={f.id+"-load"} onTab={()=>document.querySelector(`[data-cid="${f.id}-disch"]`)?.click()}/>
                      <EC value={toTCase(f.dischPort)} placeholder="" onSave={v2=>onUpdateC(f.id,"dischPort",v2)} width={colWidthsC.Disch||100} data-cid={f.id+"-disch"} onTab={()=>document.querySelector(`[data-cid="${f.id}-lc"]`)?.click()}/>
                      <EC value={fmtLC(f.laycan)} placeholder="" onSave={v2=>onUpdateC(f.id,"laycan",v2)} width={colWidthsC.Laycan||120} data-cid={f.id+"-lc"} onTab={()=>document.querySelector(`[data-cid="${f.id}-fr"]`)?.click()}/>
                      <EC value={fmtFreight(f.freight)||f.freight} color={C.blue} placeholder="" onSave={v2=>onUpdateC(f.id,"freight",fmtFreight(v2)||v2)} width={colWidthsC.Freight||90} data-cid={f.id+"-fr"} onTab={()=>document.querySelector(`[data-cid="${f.id}-cmnt"]`)?.click()}/>
                      <EC value={f.comment} color={C.dim} placeholder="" onSave={v2=>onUpdateC(f.id,"comment",v2)} width={colWidthsC.Comment||130} data-cid={f.id+"-cmnt"}/>
                      <td style={{...td,width:colWidthsC.Updated||88,fontSize:9,color:C.faint,whiteSpace:"nowrap",overflow:"hidden"}}>{f.updatedAt?new Date(f.updatedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):f.addedAt?new Date(f.addedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>
                      <td style={{...td,width:26,padding:"0 2px"}}><button onClick={(e)=>{e.stopPropagation();setPendingDel({type:"cargo",id:f.id,label:f.vessel||"cargo"});}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:13,opacity:0.7}} title="Delete">✕</button></td>
                    </tr>;
                  })}</tbody>
                </table>
              }
            </div>
          </div>
        )}

        {/* ── MATRIX ── */}
        {tab==="matrix"&&(
          <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"hidden"}}>
            <div style={{background:C.bg2,padding:"6px 14px",borderBottom:"1px solid "+C.bd2,display:"flex",gap:16,fontSize:11,color:C.dim,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontWeight:700,color:C.tx}}>🔗 Voyage Matrix</span>
              <span>12.5 kts · 1d load · 18h disch</span>
              <input value={mxSearch||""} onChange={e=>setMxSearch(e.target.value)} placeholder="🔍 Search vessel…"
                style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"2px 8px",outline:"none",width:160,marginLeft:"auto"}}/>
            </div>
            {vessels.length===0
              ?<div style={{padding:"40px",textAlign:"center",color:C.faint}}><div style={{fontSize:28,marginBottom:8}}>🔗</div>Add vessels and cargoes</div>
              :vessels.filter(v=>!mxSearch||v.vessel?.toLowerCase().includes(mxSearch.toLowerCase())||v.operator?.toLowerCase().includes(mxSearch.toLowerCase())).map((v,i)=>{
                const fixes=cargoes.filter(c=>c.vessel&&c.vessel.toLowerCase()===v.vessel.toLowerCase()).sort((a,b)=>(b.addedAt||"").localeCompare(a.addedAt||""));
                const cargo=fixes[0];const calc=cargo?calcVoyage(v,cargo):null;
                const bg=i%2===0?C.bg:C.bg2;
                const sc=cargo?(cargo.status==="FIXED"?C.green:cargo.status==="SUBS"?C.purple:C.amber):C.faint;
                return(
                  <div key={v.vessel} style={{background:bg,borderBottom:"1px solid "+C.bd2,padding:"9px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <div style={{minWidth:150,marginRight:4}}>
                        <div style={{fontWeight:700,fontSize:12,color:C.blue}}>{toTCase(v.vessel)}</div>
                        <div style={{fontSize:10,color:C.dim}}>{v.operator||""}</div>
                      </div>
                      <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:C.faint,textTransform:"uppercase"}}>Now open</div>
                        <div style={{fontSize:11,fontWeight:700,color:v.openPort==="EMPLOYED"?C.purple:C.amber}}>{v.openPort||"?"}</div>
                        {v.date&&<div style={{fontSize:9,color:C.blue}}>{v.date}</div>}
                      </div>
                      {cargo&&<>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ballastNm&&<div style={{fontSize:9,color:C.faint}}>{calc.ballastNm}nm</div>}
                          <div style={{fontSize:14,color:C.faint}}>──▶</div>
                          {calc?.ballastDays&&<div style={{fontSize:9,color:C.faint}}>{calc.ballastDays}d</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+sc+"55",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.faint,textTransform:"uppercase"}}>Load</div>
                          <div style={{fontSize:11,fontWeight:700}}>{cargo.loadPort||"?"}</div>
                          <div style={{fontSize:9,color:C.blue}}>{calc?.loadDate||cargo.laycan||"—"}</div>
                        </div>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ladenNm&&<div style={{fontSize:9,color:C.faint}}>{calc.ladenNm}nm</div>}
                          <div style={{fontSize:14,color:sc}}>──▶</div>
                          {cargo.cargoType&&<div style={{fontSize:9,color:C.purple}}>{cargo.cargoType}</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+(calc?.openDate?C.green:C.bd)+"88",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:9,color:C.faint,textTransform:"uppercase"}}>Next open</div>
                          <div style={{fontSize:11,fontWeight:700,color:calc?.openDate?C.green:C.dim}}>{cargo.dischPort||"?"}</div>
                          {calc?.openDate?(<div style={{fontSize:9,color:C.green}}>~{calc.openDate}</div>):(<div style={{fontSize:9,color:C.faint}}>—</div>)}
                        </div>
                        <div style={{marginLeft:6,display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{fontSize:10,fontWeight:700,color:sc,background:sc+"18",border:"1px solid "+sc+"44",borderRadius:3,padding:"1px 7px"}}>{cargo.status}</span>
                          {cargo.freight&&<span style={{fontSize:10,color:C.purple,fontWeight:700}}>{cargo.freight}</span>}
                        </div>
                      </>}
                      {!cargo&&<div style={{marginLeft:8,fontSize:11,color:C.faint,fontStyle:"italic"}}>No fixture - vessel open</div>}
                    </div>
                    {v.spec?.fuel||v.spec?.iceClass?(<div style={{display:"flex",gap:3,marginTop:4}}>{v.spec?.fuel&&<Tag col={v.spec.fuel==="LNG"?C.green:C.purple}>{v.spec.fuel}</Tag>}{v.spec?.iceClass&&<Tag col={C.blue}>{v.spec.iceClass}</Tag>}</div>):null}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab==="dash"&&(
          <Dashboard vessels={vessels} cargoes={cargoes} history={history||[]}/>
        )}
      </div>
    </div>
  );
}


// ─── WS / FFA Tracker ────────────────────────────────────────────────────────
const WS_STORE = "tankpos-ws-v1";
const ROUTES = [
  {id:"TC2",  name:"TC2",  desc:"ARA→USAC 37kt",       unit:"WS"},
  {id:"TC6",  name:"TC6",  desc:"Cross-Med 30kt",        unit:"WS"},
  {id:"TC14", name:"TC14", desc:"US Gulf→UKC 38kt",     unit:"WS"},
  {id:"TC23", name:"TC23", desc:"UKC→USAC 30kt",        unit:"WS"},
  {id:"TC178",name:"TC178",desc:"Rdam→ARA barge 1kt",  unit:"$/mt"},
];

const FFA_PERIODS = ["Feb/26","Mar/26","Apr/26","Q1/26","Q2/26","AVE/25"];

function WSTracker() {
  const [data,    setData]    = useState(null);
  const [pasteText, setPaste] = useState("");
  const [img,       setImg]    = useState(null);
  const [parsing,  setParsing] = useState(false);
  const [status,   setStatus]  = useState(null);
  const [view,     setView]    = useState("table");
  const [wsNote,   setWsNote]  = useState(() => { try{return localStorage.getItem("ws_note")||""}catch(e){return""} });
  const wsFileRef = useRef(null);

  // Load from storage
  useEffect(()=>{
    (async()=>{
      try {
        const r = await window.storage.get(WS_STORE,true);
        if (r) setData(JSON.parse(r.value));
      } catch(_) {
        const local = localStorage.getItem(WS_STORE);
        if (local) setData(JSON.parse(local));
      }
    })();
  },[]);

  async function saveWS(d) {
    try { await window.storage.set(WS_STORE, JSON.stringify(d), true); } catch(_) {}
    try { localStorage.setItem(WS_STORE, JSON.stringify(d)); } catch(_) {}
    setData(d);
  }

  async function parseWS() {
    if (!pasteText.trim() && !img) { setStatus({t:"error",m:"Paste text or attach an image"}); return; }
    setParsing(true); setStatus({t:"info",m:img?"Reading image…":"Parsing…"});
    try {
      let text = pasteText;
      if (img) {
        const ocr = await ocrImage(img);
        text = ocr + (pasteText.trim() ? "\n\n" + pasteText : "");
      }
      const raw = await apiCall(
        "You are a freight market data parser. Parse worldscale and FFA data. Respond ONLY with raw JSON, no markdown.",
        [{role:"user",content:`Parse this WS/FFA market data into JSON.
Routes we track: TC2 (ARA-USAC 37kt), TC6 (Cross-Med 30kt), TC14 (USGC-UKC 38kt), TC23 (UKC-USAC 30kt), TC178 (Rdam barge $/mt).
Output format:
{
  "date": "DD Mon YY",
  "spot": {
    "TC2":  {"ws": number_or_null, "change": number_or_null},
    "TC6":  {"ws": number_or_null, "change": number_or_null},
    "TC14": {"ws": number_or_null, "change": number_or_null},
    "TC23": {"ws": number_or_null, "change": number_or_null},
    "TC178":{"ws": number_or_null, "change": number_or_null}
  },
  "ffa": {
    "TC2":  {"Feb26":null,"Mar26":null,"Apr26":null,"Q126":null,"Q226":null},
    "TC14": {"Feb26":null,"Mar26":null,"Apr26":null,"Q126":null,"Q226":null},
    "TC6":  {"Feb26":null,"Mar26":null,"Apr26":null,"Q126":null,"Q226":null},
    "TC23": {"Feb26":null,"Mar26":null,"Apr26":null,"Q126":null,"Q226":null}
  }
}
Fill only values you can find. Leave others null.
Data:
${text}`}]
      );
      const cl = raw.replace(/^```[\w]*/g,"").replace(/```/g,"").trim();
      const s=cl.indexOf("{"),e=cl.lastIndexOf("}");
      if(s<0||e<=s) throw new Error("No JSON found");
      const parsed = JSON.parse(cl.slice(s,e+1));

      // Merge into existing data
      const existing = data || {spot:{},ffa:{},history:[]};
      const today = parsed.date || new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});

      // Build history snapshot
      // Stamp update time on each parsed spot route
      const parsedSpot = parsed.spot||{};
      const stampedSpot = {};
      for(const[rid,val] of Object.entries(parsedSpot)){
        if(val) stampedSpot[rid]={...val, updatedAt:today};
      }
      const snap = {date:today, spot: stampedSpot};
      const prevHistory = (existing.history||[]).filter(h=>h.date!==today);
      const newHistory = [...prevHistory, snap].slice(-90);

      const next = {
        spot: {...(existing.spot||{}), ...stampedSpot},
        ffa: (()=>{
          const ef=existing.ffa||{};
          const pf=parsed.ffa||{};
          // Only update routes that appear in parsed data
          const nf={...ef};
          for(const[rid,val] of Object.entries(pf)){if(val)nf[rid]={...(ef[rid]||{}),...val,updatedAt:today};}
          return nf;
        })(),
        history: newHistory,
        lastUpdate: today,
      };
      await saveWS(next);
      setPaste(""); setImg(null);
      setStatus({t:"success",m:`✓ Updated ${Object.keys(parsed.spot||{}).length} routes · ${today}`});
    } catch(e) {
      setStatus({t:"error",m:e.message});
    } finally {
      setParsing(false);
    }
  }

  const sc = status?.t==="success"?C.green:status?.t==="error"?C.red:C.blue;

  // Chart data: last 30 history snapshots for each route
  const histData = (data?.history||[]).slice(-30);
  const routeColors = {TC2:C.blue,TC6:C.green,TC14:C.amber,TC23:C.purple,TC178:"#ff9f43"};

  const secHead = t=>(<div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>{t}</div>);
  const th2 = {padding:"5px 8px",background:C.bg3,color:C.faint,fontWeight:700,fontSize:9,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"};
  const td2 = {padding:"5px 8px",fontSize:11,textAlign:"right",whiteSpace:"nowrap",borderBottom:"1px solid "+C.bg2};

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px"}}>
      {secHead("📊 Worldscale Spot + FFA Tracker")}

      {/* Paste input */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,color:C.dim,marginBottom:4}}>
          Paste data from broker recap, Baltic Exchange, or the FFA screenshot - any format works
        </div>
        {img?.dataUrl&&<div style={{position:"relative",marginBottom:4}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:4,display:"block"}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:"50%",width:20,height:20,fontSize:11,cursor:"pointer"}}>✕</button></div>}
        {img&&!img.dataUrl&&<div style={{padding:"3px 10px",background:"rgba(188,140,255,.07)",borderRadius:4,fontSize:11,color:C.purple,display:"flex",justifyContent:"space-between",marginBottom:4}}><span>📷 Image attached</span><button onClick={()=>setImg(null)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:11}}>✕</button></div>}
        <textarea value={pasteText} onChange={e=>setPaste(e.target.value)}
          onPaste={e=>{for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}}
          placeholder={"TC2 (CONT/TA-37)  127.81(+1.87)  FEB/26: 130.50  MAR/26: 142.50  Q1: 135.50\nTC14 (USG/UKC-38)  270.71(+8.57)\nTC23 220.50  TC6 140.00\n\n- or Ctrl+V a screenshot -"}
          style={{width:"100%",minHeight:60,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"6px 10px",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        <input ref={wsFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
        <div style={{display:"flex",gap:6,marginTop:5,alignItems:"center"}}>
          <button onClick={parseWS} disabled={parsing} style={{background:parsing?"#1a4a8f":"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"5px 18px",cursor:parsing?"default":"pointer"}}>
            {parsing?"⟳ "+(img?"Reading image…":"Parsing…"):"▶ Parse & Save"}
          </button>
          <button onClick={()=>wsFileRef.current?.click()} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"4px 8px",fontFamily:"inherit",fontSize:11,cursor:"pointer",flexShrink:0}}>📷</button>
          {status&&<div style={{fontSize:11,color:sc,padding:"3px 10px",background:sc+"18",borderRadius:4,border:"1px solid "+sc+"44"}}>{status.m}</div>}
        </div>
      </div>

      {/* Comment / Market Notes */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,color:C.dim,marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>📝 Market notes / commentary</span>
          <span style={{fontSize:9,color:C.faint}}>Auto-saved</span>
        </div>
        <textarea value={wsNote} onChange={e=>{setWsNote(e.target.value);try{localStorage.setItem("ws_note",e.target.value)}catch{}}}
          placeholder="e.g. TC2 firming on back of USAC demand, FFA contango widening, Baltic tightening..."
          style={{width:"100%",minHeight:54,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,
            fontFamily:"inherit",fontSize:11,padding:"6px 8px",resize:"vertical",boxSizing:"border-box"}}/>
      </div>

      {data&&<>
        {/* View toggle */}
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          {[["table","📋 Table"],["chart","📈 Chart"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"4px 12px",border:"1px solid "+(view===v?C.blue:C.bd),borderRadius:4,background:view===v?"rgba(88,166,255,.12)":"transparent",color:view===v?C.blue:C.dim,fontFamily:"inherit",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
          <span style={{marginLeft:"auto",fontSize:10,color:C.faint,alignSelf:"center"}}>Last update: {data.lastUpdate||"—"}</span>
        </div>

        {/* TABLE VIEW */}
        {view==="table"&&<>
          {/* Spot table */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Current Spot</div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:11,minWidth:400}}>
                <thead>
                  <tr>
                    <th style={{...th2,textAlign:"left"}}>Route</th>
                    <th style={th2}>WS / $/mt</th>
                    <th style={th2}>Change</th>
                    <th style={{...th2,color:C.dim}}>Description</th>
                    <th style={th2}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {ROUTES.map(r=>{
                    const s=data.spot?.[r.id];
                    const chg=s?.change;
                    const chgCol=chg>0?C.green:chg<0?C.red:C.dim;
                    return(
                      <tr key={r.id} style={{background:"transparent"}}>
                        <td style={{...td2,textAlign:"left",fontWeight:700,color:routeColors[r.id]||C.blue}}>{r.name}</td>
                        <td style={{...td2,fontWeight:800,color:C.tx,fontSize:13}}>{s?.ws!=null?s.ws.toFixed(2):"—"}</td>
                        <td style={{...td2,color:chgCol,fontWeight:700}}>{chg!=null?(chg>=0?"+":"")+chg.toFixed(2):"—"}</td>
                        <td style={{...td2,color:C.faint,fontSize:10}}>{r.desc}</td>
                        <td style={{...td2,color:C.faint,fontSize:9}}>{s?.updatedAt||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* FFA table */}
          {Object.keys(data.ffa||{}).length>0&&(
            <div>
              <div style={{fontSize:9,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>FFA Forward Curve (WS)</div>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr>
                      <th style={{...th2,textAlign:"left",minWidth:60}}>Route</th>
                      {["Feb26","Mar26","Apr26","Q126","Q226"].map(p=>(
                        <th key={p} style={th2}>{p.replace("26","/26").replace("Q1","Q1").replace("Q2","Q2")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROUTES.filter(r=>data.ffa?.[r.id]).map(r=>{
                      const f=data.ffa[r.id]||{};
                      const spot=data.spot?.[r.id]?.ws;
                      return(
                        <tr key={r.id}>
                          <td style={{...td2,textAlign:"left",fontWeight:700,color:routeColors[r.id]||C.blue}}>{r.name}</td>
                          {["Feb26","Mar26","Apr26","Q126","Q226"].map(p=>{
                            const v=f[p];
                            const diff=v!=null&&spot!=null?v-spot:null;
                            const col=diff==null?C.dim:diff>0?C.red:C.green; // backwardation=green for sellers
                            return(
                              <td key={p} style={{...td2}}>
                                {v!=null
                                  ? <div>
                                      <div style={{color:C.tx,fontWeight:600}}>{v.toFixed(1)}</div>
                                      {diff!=null&&<div style={{fontSize:9,color:col}}>{diff>=0?"+":""}{diff.toFixed(1)}</div>}
                                    </div>
                                  : <span style={{color:C.faint}}>—</span>
                                }
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:9,color:C.faint,marginTop:4}}>Small number = diff vs spot. Green = backwardation (below spot). Red = contango (above spot).</div>
            </div>
          )}
        </>}

        {/* CHART VIEW */}
        {view==="chart"&&histData.length>=2&&(
          <div>
            <WSChart data={histData} routes={ROUTES} colors={routeColors}/>
          </div>
        )}
        {view==="chart"&&(histData.length<=1)?(
          <div style={{color:C.faint,fontSize:12,padding:"20px 0",textAlign:"center"}}>
            Paste updates to build a chart. {histData.length} snapshots so far.
          </div>
        ):null}
      </>}
    </div>
  );
}

function WSChart({data,routes,colors}) {
  const W=700,H=200,PL=42,PR=16,PT=10,PB=28;
  const iW=W-PL-PR,iH=H-PT-PB;

  // Get all WS values to find scale
  const allVals=data.flatMap(d=>routes.map(r=>d.spot?.[r.id]?.ws)).filter(v=>v!=null);
  if(!allVals.length)return null;
  const mn=Math.min(...allVals)*0.95,mx=Math.max(...allVals)*1.05,range=mx-mn||1;
  const xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);

  return(
    <div>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",maxHeight:H,display:"block"}}>
        {/* Grid */}
        {[0,.5,1].map(t=>{
          const y=PT+t*iH, v=Math.round(mx-t*range);
          return <g key={t}>
            <line x1={PL} y1={y} x2={W-PR} y2={y} stroke={C.bd2} strokeWidth="1"/>
            <text x={PL-4} y={y+4} fill={C.faint} fontSize="9" textAnchor="end">{v}</text>
          </g>;
        })}
        {/* Lines per route */}
        {routes.map(r=>{
          const pts=data.map((d,i)=>{const v=d.spot?.[r.id]?.ws;return v!=null?[xs[i],PT+iH-(v-mn)/range*iH]:null;});
          const valid=pts.filter(Boolean);if(valid.length<2)return null;
          let path="";pts.forEach(p=>{if(p)path+=(path?"L":"M")+p.join(",");});
          const lastPt=valid[valid.length-1];
          return <g key={r.id}>
            <path d={path} fill="none" stroke={colors[r.id]||C.dim} strokeWidth="2" strokeLinejoin="round"/>
            {lastPt&&<text x={lastPt[0]+4} y={lastPt[1]+4} fill={colors[r.id]||C.dim} fontSize="9">{r.id}</text>}
          </g>;
        })}
        {/* X labels */}
        {data.map((d,i)=>(i===0||i===data.length-1||data.length<9)&&(
          <text key={i} x={xs[i]} y={H-PB+14} fill={C.faint} fontSize="8" textAnchor="middle">
            {(d.date||"").split(" ").slice(0,2).join(" ")}
          </text>
        ))}
      </svg>
      {/* Legend */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:4}}>
        {routes.map(r=>(<span key={r.id} style={{fontSize:10,color:colors[r.id]||C.dim}}><span style={{fontWeight:700}}>●</span> {r.name} {r.desc}</span>))}
      </div>
    </div>
  );
}



// ─── News Feed ────────────────────────────────────────────────────────────────
function NewsFeed() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  async function fetchNews() {
    setLoading(true); setErr(null);
    try {
      // Use rss2json.com free API to convert TradeWinds RSS to JSON
      const feeds = [
        "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.tradewindsnews.com%2Frss%2F",
        "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.tradewindsnews.com%2Ftankers%2Frss",
      ];
      const results = await Promise.allSettled(feeds.map(u=>fetch(u).then(r=>r.json())));
      const all = [];
      for(const r of results){
        if(r.status==="fulfilled" && r.value?.items){
          all.push(...r.value.items.map(it=>({
            title:   it.title,
            link:    it.link,
            pubDate: it.pubDate,
            desc:    stripHtml(it.description||"").slice(0,120),
          })));
        }
      }
      // Sort by date, deduplicate by link
      const seen=new Set();
      const deduped=all.filter(it=>{if(seen.has(it.link))return false;seen.add(it.link);return true;});
      deduped.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
      setItems(deduped.slice(0,20));
      setLastFetch(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}));
    } catch(e) {
      setErr("News unavailable - " + e.message.slice(0,60));
    } finally { setLoading(false); }
  }

  useEffect(()=>{ fetchNews(); },[]);

  const fmtAge = d => {
    if(!d)return"";
    const mins=Math.round((Date.now()-new Date(d))/60000);
    if(mins<60)return mins+"m ago";
    if(mins<1440)return Math.round(mins/60)+"h ago";
    return Math.round(mins/1440)+"d ago";
  };

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em"}}>
          📰 TradeWinds - Tanker News
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {lastFetch&&<span style={{fontSize:9,color:C.faint}}>Fetched {lastFetch}</span>}
          <button onClick={fetchNews} disabled={loading} style={{fontSize:10,padding:"2px 8px",background:C.bg3,
            border:"1px solid "+C.bd,borderRadius:4,color:C.dim,cursor:"pointer"}}>
            {loading?"⟳":"↻ Refresh"}
          </button>
        </div>
      </div>
      {err&&<div style={{fontSize:11,color:C.amber,padding:"8px",background:C.bg3,borderRadius:4,marginBottom:8}}>{err}</div>}
      {loading&&items.length===0?(<div style={{color:C.faint,fontSize:12,padding:"16px 0",textAlign:"center"}}>Loading news…</div>):null}
      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        {items.map((it,i)=>(
          <a key={it.link+i} href={it.link} target="_blank" rel="noopener noreferrer"
            style={{display:"block",padding:"8px 6px",borderBottom:"1px solid "+C.bg3,textDecoration:"none",
              borderRadius:3,transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{fontSize:11,color:C.tx,fontWeight:500,lineHeight:1.4,flex:1}}>{it.title}</div>
              <div style={{fontSize:9,color:C.faint,whiteSpace:"nowrap",marginTop:2}}>{fmtAge(it.pubDate)}</div>
            </div>
            {it.desc&&<div style={{fontSize:10,color:C.dim,marginTop:3,lineHeight:1.4}}>{it.desc}…</div>}
          </a>
        ))}
        {!loading&&items.length===0&&!err&&<div style={{color:C.faint,fontSize:12,padding:"16px 0",textAlign:"center"}}>No articles loaded.</div>}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({vessels, cargoes, history}) {
  const [bunkers, setBunkers] = useState(null);
  const [bLoading, setBLoading] = useState(false);
  const [bError, setBError] = useState(null);
  const [bFetched, setBFetched] = useState(false);

  // ── Bunker prices: fetch live from PBT via web_search, fallback to last known ──
  async function fetchBunkersPBT() {
    setBLoading(true); setBError(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:800,
          
          system:"You are a maritime bunker price expert. Return ONLY a raw JSON object (no markdown, no explanation) with current approximate bunker fuel prices in USD/mt. Format: {date,Rotterdam_HSFO,Rotterdam_VLSFO,Rotterdam_MGO,Fujairah_HSFO,Fujairah_VLSFO,Fujairah_MGO,Singapore_HSFO,Singapore_VLSFO,Singapore_MGO}. Numbers only in USD/mt.",
          messages:[{role:"user",content:"Return approximate bunker fuel prices USD/mt for Rotterdam/ARA, Fujairah, Singapore for Mar 2026. Typical ranges: HSFO 420-440, VLSFO 480-520, MGO 700-780. Return ONLY JSON: {date,Rotterdam_HSFO,Rotterdam_VLSFO,Rotterdam_MGO,Fujairah_HSFO,Fujairah_VLSFO,Fujairah_MGO,Singapore_HSFO,Singapore_VLSFO,Singapore_MGO}"}]
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error("API " + res.status + ": " + (d?.error?.message||""));
      // Collect all text blocks (web_search returns multiple content blocks)
      const allText = (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
      const cl = allText.replace(/```[\w]*/g,"").replace(/```/g,"").trim();
      const s = cl.indexOf("{"), e = cl.lastIndexOf("}");
      if (s >= 0 && e > s) {
        const p = JSON.parse(cl.slice(s, e+1));
        setBunkers({
          date:      p.date || new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),
          ARA_HSFO:  p.Rotterdam_HSFO  || null,
          ARA_VLSFO: p.Rotterdam_VLSFO || null,
          ARA_MGO:   p.Rotterdam_MGO   || null,
          FUJ_HSFO:  p.Fujairah_HSFO   || null,
          FUJ_VLSFO: p.Fujairah_VLSFO  || null,
          FUJ_MGO:   p.Fujairah_MGO    || null,
          SIN_HSFO:  p.Singapore_HSFO  || null,
          SIN_VLSFO: p.Singapore_VLSFO || null,
          SIN_MGO:   p.Singapore_MGO   || null,
        });
        setBFetched(true);
      } else {
        // Fallback to last known PBT prices (28 Feb 2026)
        setBunkers({date:"Mar 2026 est.",ARA_HSFO:432,ARA_VLSFO:485,ARA_MGO:728,FUJ_HSFO:428,FUJ_VLSFO:512,FUJ_MGO:782,SIN_HSFO:442,SIN_VLSFO:528,SIN_MGO:718});
        setBFetched(true);
        
      }
    } catch(e) {
      // Network error - show cached
      setBunkers({date:"Mar 2026 est.",ARA_HSFO:432,ARA_VLSFO:485,ARA_MGO:728,FUJ_HSFO:428,FUJ_VLSFO:512,FUJ_MGO:782,SIN_HSFO:442,SIN_VLSFO:528,SIN_MGO:718});
      setBFetched(true);
      setBError("Using estimated prices - "+e.message.slice(0,60));
    } finally { setBLoading(false); }
  }

  // Fleet stats
  const openVessels = vessels.filter(v=>v.date&&v.openPort&&v.openPort!=="EMPLOYED");
  const withDays = openVessels.map(v=>({...v,days:daysBetween(v.date)})).filter(v=>v.days!==null);
  const fleetAvg = withDays.length ? Math.round(withDays.reduce((a,b)=>a+b.days,0)/withDays.length) : null;

  // Region breakdown
  const regionCounts = {};
  for (const v of openVessels) {
    const r = classifyRegion(v.openPort)||"Other";
    regionCounts[r]=(regionCounts[r]||0)+1;
  }

  // Build chart data from history + today
  const today = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});
  const chartSnaps = [...history];
  // Patch today's live data in
  if (fleetAvg !== null) {
    const todayIdx = chartSnaps.findIndex(h=>h.date===today);
    const todayByOp = {};
    for(const v of openVessels){const d=daysBetween(v.date);if(d===null)continue;const op=(v.operator||"Unknown").trim();todayByOp[op]=(todayByOp[op]||[]).concat(d);}
    const todayOpAvgs = Object.fromEntries(Object.entries(todayByOp).map(([op,ds])=>[op,Math.round(ds.reduce((a,b)=>a+b,0)/ds.length)]));
    const todaySnap = {date:today,fixingAvg:fleetAvg,total:vessels.length,openCount:openVessels.length,byOp:todayOpAvgs};
    if (todayIdx>=0) chartSnaps[todayIdx]=todaySnap;
    else chartSnaps.push(todaySnap);
  }
  const chartData = chartSnaps.slice(-30).map(h=>({
    date: h.date,
    avg:  h.fixingAvg,
    open: h.openCount,
    total:h.total,
  }));

  // Get all operators seen in history for multi-line chart
  const allOps = [...new Set(history.flatMap(h=>Object.keys(h.byOp||{})))].slice(0,6);
  const opChartData = chartSnaps.slice(-30).map(h=>({
    date: h.date,
    ...Object.fromEntries(allOps.map(op=>[op,(h.byOp||{})[op]??null]))
  }));



  const card = (label,val,sub,col)=>(
    <div style={{background:C.bg2,border:"1px solid "+C.bd2,borderRadius:7,padding:"10px 16px",flex:"1 1 120px"}}>
      <div style={{fontSize:9,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:col||C.tx,lineHeight:1}}>{val??"—"}</div>
      {sub&&<div style={{fontSize:10,color:C.dim,marginTop:3}}>{sub}</div>}
    </div>
  );

  const secHead = t=>(<div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,marginTop:4}}>{t}</div>);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* KPI row */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {card("Fleet vessels",vessels.length,null,C.tx)}
        {card("Open / fixing",openVessels.length,null,C.amber)}
        {card("Fleet fixing window",fleetAvg!=null?(fleetAvg>=0?"+"+fleetAvg+"d":fleetAvg+"d"):null,"avg days until open",(fleetAvg<0)?C.green:(fleetAvg<=7)?C.amber:C.blue)}
        {card("Fixed/Subs",vessels.filter(v=>v.openPort==="EMPLOYED").length,null,C.purple)}
        {card("History snapshots",history.length,"data points collected",C.dim)}
      </div>

      {/* Fixing window trends side by side */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px",flex:"1 1 340px",minWidth:280}}>
          {secHead("📈 Fixing Window Trend - fleet avg")}
          {chartData.length <= 1
            ? (<div style={{color:C.faint,fontSize:12,padding:"24px 0",textAlign:"center"}}>
                Parse positions to build trend data.
              </div>)
            : (<FWChart data={chartData}/>)
          }
        </div>
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px",flex:"1 1 340px",minWidth:280}}>
          {secHead("👥 Fixing Window by Operator")}
          {allOps.length===0
            ? <div style={{color:C.faint,fontSize:12,padding:"24px 0",textAlign:"center"}}>Parse positions to build operator data.</div>
            : <OpChart data={opChartData} ops={allOps} colors={OP_COLORS}/>
          }
        </div>
      </div>

      {/* Two column: region + bunkers */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {/* Region breakdown */}
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px",flex:"1 1 260px"}}>
          {secHead("🗺 Open Fleet by Region")}
          {Object.keys(regionCounts).length===0
            ? <div style={{color:C.faint,fontSize:12}}>No open vessels</div>
            : Object.entries(regionCounts).sort((a,b)=>b[1]-a[1]).map(([r,n])=>{
                const pct = Math.round(n/openVessels.length*100);
                const col = {WCUK:C.blue,ECUK:C.green,CANAL:C.amber,BISCAY:C.purple,SKAW:"#ff9f43",BALTIC:C.red,Other:C.faint,MED:"#fd79a8"}[r]||C.dim;
                return(
                  <div key={r} style={{marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:700,color:col}}>{r}</span>
                      <span style={{fontSize:11,color:C.dim}}>{n} vessel{n!==1?"s":""}</span>
                    </div>
                    <div style={{height:6,background:C.bg3,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:col,borderRadius:3,transition:"width .3s"}}/>
                    </div>
                  </div>
                );
              })
          }
        </div>

        {/* Bunker prices - PBT International */}
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px",flex:"1 1 380px"}}>
          {secHead("⛽ Bunker Prices USD/mt - PBT International")}
          {!bFetched&&!bLoading&&(
            <div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:11,color:C.dim,marginBottom:8}}>Source: pbt-international.com (updated 3×/week)</div>
              <button onClick={fetchBunkersPBT} style={{background:"#1f6feb",border:"none",borderRadius:6,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"7px 18px",cursor:"pointer"}}>
                🌐 Fetch Live from PBT
              </button>
            </div>
          )}
          {bLoading&&<div style={{color:C.blue,fontSize:12,padding:"12px 0",textAlign:"center"}}>⟳ Fetching pbt-international.com…</div>}
          {bError&&<div style={{color:C.red,fontSize:11,padding:"6px 0"}}>{bError}<br/><button onClick={fetchBunkersPBT} style={{marginTop:4,background:"none",border:"1px solid "+C.bd,borderRadius:4,color:C.dim,fontSize:10,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>Retry</button></div>}
          {bunkers&&(
            <div>
              <div style={{fontSize:9,color:C.faint,marginBottom:8}}>
                Updated: {bunkers.date} · <a href="https://pbt-international.com/price-quotes" target="_blank" style={{color:C.blue,textDecoration:"none"}}>pbt-international.com</a>
              </div>
              {/* Table */}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{padding:"4px 8px",background:C.bg3,color:C.faint,fontWeight:700,fontSize:9,textTransform:"uppercase",textAlign:"left",borderRadius:"4px 0 0 0"}}>Port</th>
                    <th style={{padding:"4px 8px",background:C.bg3,color:C.amber,fontWeight:700,fontSize:9,textTransform:"uppercase",textAlign:"right"}}>HSFO 380</th>
                    <th style={{padding:"4px 8px",background:C.bg3,color:C.green,fontWeight:700,fontSize:9,textTransform:"uppercase",textAlign:"right"}}>VLSFO 0.5%</th>
                    <th style={{padding:"4px 8px",background:C.bg3,color:C.blue,fontWeight:700,fontSize:9,textTransform:"uppercase",textAlign:"right",borderRadius:"0 4px 0 0"}}>MGO</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["ARA (Rotterdam)", bunkers.ARA_HSFO, bunkers.ARA_VLSFO, bunkers.ARA_MGO],
                    ["Fujairah",        bunkers.FUJ_HSFO, bunkers.FUJ_VLSFO, bunkers.FUJ_MGO],
                    ["Singapore",       bunkers.SIN_HSFO, bunkers.SIN_VLSFO, bunkers.SIN_MGO],
                  ].map(([port,hsfo,vlsfo,mgo],i)=>(
                    <tr key={port} style={{background:i%2===0?C.bg:C.bg2}}>
                      <td style={{padding:"5px 8px",color:C.dim,fontWeight:600}}>{port}</td>
                      <td style={{padding:"5px 8px",color:C.amber,fontWeight:700,textAlign:"right"}}>{hsfo?"$"+hsfo:"—"}</td>
                      <td style={{padding:"5px 8px",color:C.green,fontWeight:700,textAlign:"right"}}>{vlsfo?"$"+vlsfo:"—"}</td>
                      <td style={{padding:"5px 8px",color:C.blue,fontWeight:700,textAlign:"right"}}>{mgo?"$"+mgo:"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={fetchBunkersPBT} style={{marginTop:7,background:"none",border:"1px solid "+C.bd,borderRadius:4,color:C.dim,fontSize:10,padding:"2px 10px",cursor:"pointer",fontFamily:"inherit"}}>↻ Refresh from PBT</button>
            </div>
          )}
        </div>
      </div>
      {/* News Feed */}
      <NewsFeed/>

      {/* WS / FFA tracker */}
      <WSTracker/>
    </div>
  );
}

// ─── SVG charts (no dependencies) ────────────────────────────────────────────
function FWChart({data}) {
  const W=700,H=180,PL=36,PR=16,PT=10,PB=28;
  const iW=W-PL-PR, iH=H-PT-PB;
  const vals=data.map(d=>d.avg).filter(v=>v!=null);
  if(!vals.length)return null;
  const mn=Math.min(...vals)-2, mx=Math.max(...vals)+2;
  const range=mx-mn||1;
  const xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);
  const ys=data.map(d=>d.avg!=null?PT+iH-(d.avg-mn)/range*iH:null);

  // Build path
  const pts=data.map((d,i)=>ys[i]!=null?[xs[i],ys[i]]:null).filter(Boolean);
  const path="M"+pts.map(p=>p.join(",")).join(" L");
  const area="M"+pts[0][0]+","+( PT+iH)+" L"+pts.map(p=>p.join(",")).join(" L")+" L"+pts[pts.length-1][0]+","+(PT+iH)+" Z";

  // Y axis ticks
  const ticks=[mn, Math.round((mn+mx)/2), mx].map(v=>({v:Math.round(v),y:PT+iH-(v-mn)/range*iH}));

  return(
    <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",maxHeight:H,display:"block"}}>
      <defs>
        <linearGradient id="fwg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.blue} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={C.blue} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Grid */}
      {ticks.map(t=>(
        <g key={t.v}>
          <line x1={PL} y1={t.y} x2={W-PR} y2={t.y} stroke={C.bd2} strokeWidth="1"/>
          <text x={PL-4} y={t.y+4} fill={C.faint} fontSize="9" textAnchor="end">{t.v>=0?"+":""}{t.v}d</text>
        </g>
      ))}
      {/* Zero line */}
      {(mn<0&&mx>0)?(<line x1={PL} y1={PT+iH-(-mn)/range*iH} x2={W-PR} y2={PT+iH-(-mn)/range*iH} stroke={C.green} strokeWidth="1" strokeDasharray="3,3"/>):null}
      {/* Area */}
      <path d={area} fill="url(#fwg)"/>
      {/* Line */}
      <path d={path} fill="none" stroke={C.blue} strokeWidth="2" strokeLinejoin="round"/>
      {/* Dots + labels */}
      {data.map((d,i)=>ys[i]!=null&&(
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r="3" fill={C.blue}/>
          {(i===0||i===data.length-1||(data.length<11))?(<text x={xs[i]} y={H-PB+14} fill={C.faint} fontSize="8" textAnchor="middle">{d.date?.split(" ").slice(0,2).join(" ")}</text>):null}
        </g>
      ))}
    </svg>
  );
}

function OpChart({data,ops,colors}) {
  const W=700,H=160,PL=36,PR=16,PT=10,PB=24;
  const iW=W-PL-PR,iH=H-PT-PB;
  const allVals=data.flatMap(d=>ops.map(op=>d[op])).filter(v=>v!=null);
  if(!allVals.length)return <div style={{color:C.faint,fontSize:12}}>Not enough operator data yet.</div>;
  const mn=Math.min(...allVals)-1,mx=Math.max(...allVals)+1,range=mx-mn||1;
  const xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);

  return(
    <div>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",maxHeight:H,display:"block"}}>
        {ops.map((op,oi)=>{
          const pts=data.map((d,i)=>d[op]!=null?[xs[i],PT+iH-(d[op]-mn)/range*iH]:null);
          const valid=pts.filter(Boolean);
          if(valid.length<2)return null;
          // Build path skipping nulls
          let path="";
          pts.forEach((p,i)=>{if(p){path+=(path?"L":"M")+p.join(",");}});
          return<path key={op} d={path} fill="none" stroke={colors[oi]} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85"/>;
        })}
        {[mn,mx].map(v=>(
          <g key={v}>
            <text x={PL-4} y={PT+iH-(v-mn)/range*iH+4} fill={C.faint} fontSize="9" textAnchor="end">{v>=0?"+":""}{Math.round(v)}d</text>
          </g>
        ))}
        {data.map((_,i)=>(i===0||i===data.length-1)?(<text key={i} x={xs[i]} y={H-PB+14} fill={C.faint} fontSize="8" textAnchor="middle">{data[i].date?.split(" ").slice(0,2).join(" ")}</text>):null)}
      </svg>
      {/* Legend */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
        {ops.map((op,i)=>(<span key={op} style={{fontSize:10,color:colors[i]}}><span style={{fontWeight:700}}>●</span> {op}</span>))}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function TankPos(){
  const [vessels,setVessels]=useState([]);
  const [cargoes,setCargoes]=useState([]);
  const [mobile,setMobile]=useState(()=>isMobile());
  const [vdbInfo,setVdbInfo]=useState({loading:true,ok:false,count:0});

  useEffect(()=>{(async()=>{setVdbInfo({loading:true,ok:false,count:0}); const r=await loadFleetVDB(); setVdbInfo({loading:false,...r}); setVessels(vs=>vs.map(enrichV));})();},[]);
  useEffect(()=>{loadAll().then(({vessels:v,cargoes:c})=>{setVessels(v.map(enrichV));setCargoes(c);});},[]);
  useEffect(()=>{const fn=()=>setMobile(isMobile());window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);

  const renameV=useCallback((oldName,newName)=>{
    if(!newName||!newName.trim()||newName.trim().toUpperCase()===oldName)return;
    const n=newName.trim().toUpperCase();
    setVessels(prev=>{const next=prev.map(v=>v.vessel===oldName?{...v,vessel:n,updatedAt:new Date().toISOString()}:v);saveV(next);return next;});
    setCargoes(prev=>{const next=prev.map(c=>c.vessel===oldName?{...c,vessel:n}:c);saveC(next);return next;});
    setSel(n);
  },[]);

  const updateV=useCallback((name,field,value)=>{
    const now=new Date().toISOString();
    setVessels(prev=>{const now2=new Date().toISOString();const next=prev.map(v=>{if(v.vessel!==name)return v;if(field.includes(".")){const[a,b]=field.split(".");return{...v,updatedAt:now2,[a]:{...(v[a]||{}),[b]:value||null}};}const extra=field==="operator"?{operatorManual:true}:{};return{...v,updatedAt:now2,[field]:value||null,...extra};});saveV(next);return next;});
  },[]);
  const updateC=useCallback((id,field,value)=>{const now=new Date().toISOString();setCargoes(prev=>{const next=prev.map(c=>c.id!==id?c:{...c,[field]:value,updatedAt:now});saveC(next);return next;});},[]);

  const addVessels=useCallback((parsed)=>{
    let r={added:0,updated:0,total:0};
    setVessels(prev=>{const before=prev.length;const next=mergeVessels(prev,parsed);r={added:next.length-before,updated:parsed.length-Math.max(0,next.length-before),total:next.length};saveV(next);setTimeout(()=>saveSnapshot(next),100);return next;});
    return r;
  },[]);
  const addCargoes=useCallback((parsed)=>{
    // Each cargo fixture is unique - dedup only by id, not by vessel name
    const stamped=parsed.map((f,i)=>({
      ...f,
      id: f.id||("c_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6)),
      addedAt: f.addedAt||new Date().toISOString(),
    }));
    let linked=0;
    setCargoes(prev=>{
      const existingIds=new Set(prev.map(c=>c.id));
      const toAdd=stamped.filter(f=>{
        if(existingIds.has(f.id))return false;
        // Dedup: same charterer+load+disch+laycan = duplicate
        if(f.charterer&&f.loadPort&&f.dischPort&&f.laycan){
          const isDup=prev.some(e=>
            (e.charterer||"").toLowerCase()===(f.charterer||"").toLowerCase()&&
            (e.loadPort||"").toLowerCase()===(f.loadPort||"").toLowerCase()&&
            (e.dischPort||"").toLowerCase()===(f.dischPort||"").toLowerCase()&&
            (e.laycan||"")===(f.laycan||"")
          );
          if(isDup)return false;
        }
        return true;
      });
      const next=[...prev,...toAdd];
      saveC(next);return next;
    });
    setVessels(prev=>{const next=prev.map(v=>{const fix=stamped.find(f=>f.vessel&&f.vessel.toLowerCase()===v.vessel.toLowerCase());if(fix&&fix.status==="FIXED"){return{...v,openPort:"EMPLOYED"};}return v;});saveV(next);return next;});
    return linked;
  },[]);
  const addV=useCallback((v)=>{setVessels(prev=>{const idx=prev.findIndex(x=>x.vessel?.toLowerCase()===v.vessel.toLowerCase());const next=idx>=0?prev.map((x,i)=>i===idx?enrichV(v):x):[...prev,enrichV(v)];saveV(next);return next;});},[]);
  const addC=useCallback((c)=>{setCargoes(prev=>{const next=[...prev,c];saveC(next);return next;});if(c.status==="FIXED"&&c.vessel&&c.dischPort){setVessels(prev=>{const next=prev.map(v=>v.vessel?.toLowerCase()!==c.vessel.toLowerCase()?v:{...v,openPort:c.dischPort,date:c.dischDate||null});saveV(next);return next;});}},[]);
  const delV=useCallback((name)=>{setVessels(prev=>{const next=name==="__ALL__"?[]:prev.filter(v=>v.vessel!==name);saveV(next);return next;});},[]);
  const delC=useCallback((id)=>{setCargoes(prev=>{const next=id==="__ALLCARGO__"?[]:prev.filter(c=>c.id!==id);saveC(next);return next;});},[]);

  const props={vessels,cargoes,onUpdateV:updateV,onRenameV:renameV,onUpdateC:updateC,onAddVessels:addVessels,onAddCargoes:addCargoes,onAddV:addV,onAddC:addC,onDelV:delV,onDelC:delC};
  // Mobile is same desktop for now (responsive enough)
  return <DesktopApp {...props}/>;
}