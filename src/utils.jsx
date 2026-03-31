import React from "react";
import { C, PORTS, REGION_MAP } from "./constants";

// ─── Re-export for convenience ────────────────────────────────────────────────
export const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
export const MON_DISPLAY_LIST = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function toISODate(d){
  if(!d) return null;
  const months={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const s=String(d).trim();
  const m1=s.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  if(m1){
    const dt=new Date(new Date().getFullYear(),months[m1[2].charAt(0).toUpperCase()+m1[2].slice(1,3).toLowerCase()],parseInt(m1[1]));
    if(isNaN(dt)) return null;
    return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
  }
  const m2=s.match(/^(\d{1,2})[\/\-](\d{1,2})/);
  if(m2){
    const day=parseInt(m2[1]);
    const month=parseInt(m2[2])-1;
    const dt=new Date(new Date().getFullYear(),month,day);
    if(isNaN(dt)) return null;
    return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export function qtyToNum(q){
  if(!q) return null;
  const s=String(q).replace(/\s/g,"").toLowerCase();
  if(/^\d+$/.test(s)) return parseInt(s);
  const m=s.match(/([\d,]+\.?\d*)\s*(k|kt|kmt|mt)?/);
  if(!m) return null;
  const n=parseFloat(m[1].replace(/,/g,""));
  return m[2]&&m[2].startsWith("k")?Math.round(n*1000):Math.round(n);
}

export function numToQty(n){
  if(!n&&n!==0) return "";
  return n>=1000?Math.round(n/1000)+"kt":n+"t";
}

export const stripHtml = s => {
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

export function dbLookup(name, vesselDB) {
  if (!name || !vesselDB) return null;
  const k = name.toLowerCase().trim();
  const clean = k.replace(/[.-]/g," ").replace(/\s+/g," ").trim();
  if (vesselDB[clean]) return vesselDB[clean];
  if (vesselDB[k]) return vesselDB[k];
  const exactKey = Object.keys(vesselDB).find(dk => dk === clean || dk === k);
  if (exactKey) return vesselDB[exactKey];
  const words = clean.split(" ").filter(w => w.length > 1);
  if (words.length >= 2) {
    for (const [dk, dv] of Object.entries(vesselDB)) {
      if (words.every(w => dk.includes(w))) return dv;
    }
  }
  let bestKey=null, bestScore=0;
  for(const dk of Object.keys(vesselDB)){
    const shorter=Math.min(clean.length,dk.length);
    let matches=0;
    for(let i=0;i<shorter;i++) if(clean[i]===dk[i]) matches++;
    const score=matches/Math.max(clean.length,dk.length);
    if(score>0.850&&score>bestScore){bestScore=score;bestKey=dk;}
  }
  if(bestKey) return vesselDB[bestKey];
  return null;
}

export function enrichV(v, vesselDB) {
  const d = dbLookup(v.vessel, vesselDB);
  if (!d) return v;
  const resolvedOp = v.operatorManual ? v.operator : (v.operator || d.operator || null);
  return {
    ...v,
    built:    v.built    || d.built    || null,
    dwt:      (v.dwt&&parseInt(String(v.dwt).replace(/[^0-9]/g,""))>=1000?v.dwt:null) || d.dwt || v.dwt || null,
    loa:      v.loa      || d.loa      || null,
    beam:     v.beam     || d.beam     || null,
    cbm:      v.cbm      || d.cbm      || null,
    operator: resolvedOp,
    spec: {
      ...v.spec,
      iceClass: v.spec?.iceClass || d.ice_class || null,
      fuel:     v.spec?.fuel     || d.fuel      || null,
    }
  };
}

// ─── Geo helpers ──────────────────────────────────────────────────────────────
export function findPort(n) {
  if (!n) return null;
  const s = n.toLowerCase().trim();
  if (PORTS[s]) return PORTS[s];
  for (const [k,v] of Object.entries(PORTS)) { if (s.includes(k)||k.includes(s)) return v; }
  return null;
}

export function haversine(a,b) {
  if (!a||!b) return null;
  const R=3440.07,dLat=(b[0]-a[0])*Math.PI/180,dLon=(b[1]-a[1])*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.sqrt(h));
}

// ─── Date utilities ───────────────────────────────────────────────────────────
const _MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const _MON_D  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function rollOpenDateForward(dateStr, baseDate = null) {
  if (!dateStr) return dateStr;

  const ref = baseDate ? new Date(baseDate) : new Date();
  ref.setHours(0, 0, 0, 0);

  const s = String(dateStr).trim();
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})$/);
  if (!m) return dateStr;

  const day = parseInt(m[1], 10);
  const mon = _MONTHS.findIndex(x => x === m[2].slice(0, 3).toLowerCase());
  if (mon < 0) return dateStr;

  const d = new Date(ref.getFullYear(), mon, day);
  d.setHours(0, 0, 0, 0);

  // reject impossible dates like 31 Feb
  if (d.getMonth() !== mon || d.getDate() !== day) return dateStr;

  if (d < ref) d.setMonth(d.getMonth() + 1);

  return String(d.getDate()).padStart(2, "0") + " " + _MON_D[d.getMonth()];
}

export function parseDate(s) {
  if (!s) return null;
  const lo = s.toLowerCase();
  let day = null, mon = null;
  for (const part of lo.split(/[\s\-\/]+/)) {
    const mi = _MONTHS.findIndex(m => part.startsWith(m));
    if (mi >= 0) mon = mi;
    else if (/^\d+$/.test(part)) day = parseInt(part);
  }
  if (day == null || mon == null) return null;
  return new Date(new Date().getFullYear(), mon, day);
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + Math.round(days));
  return String(d.getDate()).padStart(2,"0") + " " + _MON_D[d.getMonth()];
}

export function daysBetween(dateStr, baseDate = null) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const ref = baseDate ? new Date(baseDate) : new Date();
  ref.setHours(0,0,0,0);
  return Math.round((d - ref) / 86400000);
}

export function isOpenPPT(dateStr) {
  if(!dateStr)return false;
  if(dateStr.toLowerCase().trim()==="ppt")return true;
  const d = parseDate(dateStr);
  if (!d) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(23,59,59,999);
  return d >= today && d <= tomorrow;
}

export function fmtDateShort(d){
  if(!d) return "";
  const s=String(d).trim();
  if(/^\d{1,2}\s[A-Za-z]{3}/.test(s)) return s.slice(0,6);
  const x = new Date(s);
  if(isNaN(x)) return s;
  return x.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
}

// ─── Region ───────────────────────────────────────────────────────────────────
export function classifyRegion(portName) {
  if (!portName || portName === "EMPLOYED") return null;
  const n = portName.toLowerCase().trim();
  if (!n) return null;
  const direct = Object.keys(REGION_MAP).find(r => r.toLowerCase() === n);
  if (direct) return direct;
  for (const [region, ports] of Object.entries(REGION_MAP)) {
    if (ports.some(p => p && (n.includes(p) || p.includes(n) || n.split(/[\s/+,]/)[0]===p))) return region;
  }
  return null;
}

// ─── Voyage calc ──────────────────────────────────────────────────────────────
export function calcVoyage(vessel, cargo) {
  const oc=findPort(vessel.openPort),lc=findPort(cargo.load),dc=findPort(cargo.disch);
  const bNm=haversine(oc,lc),lNm=haversine(lc,dc);
  const bDays=bNm!=null?bNm/12.5/24:null,lDays=lNm!=null?lNm/12.5/24:null;
  const etaLoad=vessel.date&&bDays!=null?addDays(vessel.date,bDays):null;
  let loadDate=etaLoad;
  if (etaLoad&&cargo.from) {
    const m=cargo.from.match(/(\d+)/),monM=cargo.from.toLowerCase().match(new RegExp(_MONTHS.join("|")));
    if(m&&monM){const ld=new Date(new Date().getFullYear(),_MONTHS.indexOf(monM[0].slice(0,3)),parseInt(m[1]));const ed=parseDate(etaLoad);if(ed&&ld>ed)loadDate=addDays(ld.toDateString(),0)||etaLoad;}
  }
  const openDate=loadDate&&lDays!=null?addDays(loadDate,1+lDays+0.75):null;
  return {
    ballastNm:bNm?Math.round(bNm):null,ladenNm:lNm?Math.round(lNm):null,
    ballastDays:bDays?Math.round(bDays*10)/10:null,ladenDays:lDays?Math.round(lDays*10)/10:null,
    etaLoad,loadDate,openPort:cargo.disch,openDate,hasCoords:!!(oc&&lc&&dc),
  };
}

// ─── Vessel merge ─────────────────────────────────────────────────────────────
function mKey(inc,keys){if(!inc)return null;const s=inc.toLowerCase().trim();if(keys.has(s))return s;for(const k of keys){const[a,b]=s.length<=k.length?[s.split(" "),k.split(" ")]:[k.split(" "),s.split(" ")];if(a.every(w=>b.includes(w)))return k;}for(const k of keys){if(k.endsWith(s)||s.endsWith(k)||k.startsWith(s)||s.startsWith(k))return k;}return null;}

export function mergeVessels(existing,incoming,vesselDB){
  const map=new Map(existing.filter(v=>v.vessel).map(v=>[v.vessel.toLowerCase(),v]));
  for(const v of incoming){
    const rk=v.vessel?.toLowerCase().trim();if(!rk)continue;
    const mk=mKey(rk,new Set([...map.keys()].filter(Boolean)));const prev=map.get(mk||rk)||{};
    let merged={...prev};
    if(!mk||v.vessel.length>(prev.vessel||"").length)merged.vessel=v.vessel;
    const positionChanged=(v.openPort&&v.openPort!==prev.openPort)||(v.date&&v.date!==prev.date);
    for(const[k,val]of Object.entries(v)){
      if(k==="vessel"||val==null||val==="")continue;
      if(k==="operator"&&prev.operatorManual)continue;
      if(k==="updatedAt"){if(positionChanged||!prev.updatedAt)merged[k]=val;continue;}
      if(k==="spec"&&typeof val==="object"){merged.spec={...(prev.spec||{})};for(const[sk,sv]of Object.entries(val)){if(sv!=null&&sv!=="")merged.spec[sk]=sv;}}
      else merged[k]=val;
    }
    const canon=(merged.vessel||"").toLowerCase();if(mk&&mk!==canon)map.delete(mk);
    map.set(canon,enrichV(merged,vesselDB));
  }
  return Array.from(map.values());
}

export function xJSON(raw){if(!raw)throw new Error("Empty");const cl=raw.trim().replace(/^```[\w]*/,"").replace(/```/g,"").trim();try{return JSON.parse(cl);}catch(_){}const s=cl.indexOf("["),e=cl.lastIndexOf("]");if(s>=0&&e>s){try{return JSON.parse(cl.slice(s,e+1));}catch(_){}}throw new Error("Parse failed: "+raw.slice(0,60));}

// ─── Formatting ───────────────────────────────────────────────────────────────
export const normaliseQty = q => {
  if(!q && q!==0) return q;
  const s = String(q).replace(/\s+/g,"").toUpperCase();
  if(/^[\d.\-]+KT$/i.test(s)) return s.replace(/KT$/i,"kt");
  if(/^[\d.]+-[\d.]+KT$/i.test(s)) return s.toLowerCase();
  const num = parseFloat(s.replace(/[^0-9.]/g,""));
  if(isNaN(num)||num===0) return q;
  const kt = num >= 500 ? Math.round(num/1000) : num;
  return kt+"kt";
};

export const fmtN = n => { if(!n && n!==0) return ""; const v=Number(String(n).replace(/,/g,"")); if(isNaN(v)) return String(n); if(v>=1000) return Math.round(v/1000)+"k"; return String(v); };
export const fmtFreight = s => { if(!s) return s; return String(s).trim().replace(/\s+/g," "); };

export const toTCase = s => {
  if(!s) return s;
  const ALLCAPS=new Set(["ARA","USG","USGC","USAC","UKC","UKG","WMed","ECUK","WCUK","MED","MR","LR","LR1","LR2","VLCC","ULCC","LNG","LPG","IMO","DWT","LOA","CBM","GT","FOB","CIF","DNB","BNP","BP","CPP","DPP","TBN","PPT","ETA","ETC","AIS","ATA","ATD","TCE","FFA","WS","PJG","RTM","HAM","ANR","GBR","NWE","WAF","MEG","AG","SPORE","STS","FSU"]);
  const lo=["of","the","and","a","an","to","for","in","on","at","by","or","via"];
  return s.split(" ").map((w,i)=>{
    if(!w) return w;
    const up=w.toUpperCase();
    if(w===up&&w.length>=2&&w.length<=6)return up;
    if(ALLCAPS.has(up))return up;
    if(i>0&&lo.includes(w.toLowerCase()))return w.toLowerCase();
    return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
  }).join(" ");
};

// ─── Cargo normaliser ─────────────────────────────────────────────────────────
export function normaliseCargo(c){
  function fmtDate(d){
    if(!d) return "";
    if(/^\d{1,2}\s[A-Za-z]{3}$/.test(String(d).trim())) return d;
    const dt=new Date(d);
    if(isNaN(dt)) return "";
    return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  }
  return {
    id:        c.id,
    status:    c.status    || "",
    vessel:    c.vessel    || "",
    charterer: c.charterer || "",
    cargo:     c.cargo     || "",
    qty:       c.qty       || "",
    load:      c.load      || "",
    disch:     c.disch     || "",
    from:      fmtDate(c.from),
    to:        fmtDate(c.to),
    freight:   c.freight   || "",
    comment:   c.comment   || "",
    updated:   c.updated   || "",
  };
}

// ─── Image loader ─────────────────────────────────────────────────────────────
export function loadImg(file,cb){
  if(!file)return;const r=new FileReader();
  r.onload=ev=>{const du=ev.target.result;const el=new Image();
    el.onload=()=>{try{const c=document.createElement("canvas");c.width=el.naturalWidth||el.width;c.height=el.naturalHeight||el.height;c.getContext("2d").drawImage(el,0,0);const j=c.toDataURL("image/jpeg",.92);cb({base64:j.split(",")[1],mime:"image/jpeg",dataUrl:j});}catch(_){cb({base64:du.split(",")[1],mime:file.type||"image/jpeg",dataUrl:null});}};
    el.onerror=()=>cb({base64:du.split(",")[1],mime:file.type||"image/jpeg",dataUrl:null});
    try{el.src=du;}catch(_){el.onerror();}
  };r.readAsDataURL(file);
}

// ─── Small UI components ──────────────────────────────────────────────────────
export function Tag({col,children}){return <span style={{fontSize:12,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid "+col+"44",background:col+"11",color:col,whiteSpace:"nowrap"}}>{children}</span>;}

export function calcEuEts(
  ballastNm,
  ladenNm,
  ballastCons,
  ladenCons,
  portDaysLoad,
  portDaysDisch,
  co2Factor,
  etsPrice,
  scopeEU,
  scopeUK,
  scopeExtra,
  idleDays,
  speed,
  ice
){
  const ballastDays = ballastNm / (speed * 24);
  const ladenDays = ladenNm / (speed * 24);

  const ballastFuel = ballastDays * ballastCons;
  const ladenFuel = ladenDays * ladenCons;

  const totalFuel = ballastFuel + ladenFuel;
  const emissions = totalFuel * co2Factor;
  const cost = emissions * etsPrice * scopeEU;

  return Math.round(cost || 0);
}
