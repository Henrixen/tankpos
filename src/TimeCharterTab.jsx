import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { apiCall, ocrImage } from "./api";
import { loadImg } from "./utils";

// Uses the same localStorage tag system as Cargoes/Positions.
// PNC is added as a preset for TC purchase option / purchase-and-charter intel.
const PRESET_TAGS = ["PNC","AG","CPP","DPP","ex Asia","Med","Parcel","TA","UKC","WAF","ASIA","J19","INTER","C18","MR","CHEM","BIO","RUMOUR","DONE"];

function getTagList(){
  try{
    const custom = JSON.parse(localStorage.getItem("signal_custom_tags") || "[]");
    return [...new Set([...PRESET_TAGS, ...custom].map(t => String(t).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }catch{
    return PRESET_TAGS.slice();
  }
}
function addCustomTag(t){
  const tag = String(t || "").trim();
  if(!tag) return;
  try{
    const custom = JSON.parse(localStorage.getItem("signal_custom_tags") || "[]");
    if(!custom.some(x => String(x).toLowerCase() === tag.toLowerCase())){
      localStorage.setItem("signal_custom_tags", JSON.stringify([...custom, tag]));
    }
  }catch{
    localStorage.setItem("signal_custom_tags", JSON.stringify([tag]));
  }
}
function getTagColors(){
  try{return JSON.parse(localStorage.getItem("signal_tag_colors") || "{}");}
  catch{return {};}
}
function tagColor(t){
  const colors=getTagColors();
  return colors[t] || (String(t).toUpperCase()==="PNC" ? C.green : C.amber);
}

const COLS = [
  "vessel_name",
  "dwt",
  "built",
  "coating",
  "vessel_spec",
  "owner",
  "commercial_operator",
  "tc_charterer",
  "rate",
  "period",
  "delivered",
  "entry_date",
  "tags",
  "comment"
];

const blank = () => ({
  vessel_name:"",
  dwt:"",
  built:"",
  coating:"",
  vessel_spec:"",
  owner:"",
  commercial_operator:"",
  tc_charterer:"",
  rate:"",
  period:"",
  delivered:"",
  entry_date:new Date().toISOString().slice(0,10),
  comment:"",
  tags:[]
});

const label = k => ({
  vessel_name:"Vessel",
  tc_charterer:"TC Charterer",
  commercial_operator:"Commercial Operator",
  vessel_spec:"Vessel Spec",
  entry_date:"Date",
  delivered:"Delivered",
  dwt:"DWT",
  built:"Built"
}[k] || k.replaceAll("_"," ").replace(/\b\w/g, m=>m.toUpperCase()));

const usd = n => {
  if(!n) return "";
  const x=Number(String(n).replace(/[^0-9.\-]/g,""));
  return Number.isFinite(x) ? "$" + x.toLocaleString("en-US") + "/d" : "";
};
function parseRate(v){
  const n=parseFloat(String(v||"").replace(/[^0-9.\-]/g,""));
  return isNaN(n)?null:n;
}
// Always normalises rate input ("usd 15k","15k","15000","USD 15,000"...) to "USD 15 000".
function formatRateUSD(v){
  const raw=String(v||"").trim();
  if(!raw) return "";
  let s=raw.toLowerCase().replace(/usd|us\$|\$|,/g,"").trim();
  let mult=1;
  if(/k$/.test(s)){ mult=1000; s=s.slice(0,-1); }
  else if(/m$/.test(s)){ mult=1000000; s=s.slice(0,-1); }
  s=s.replace(/[^0-9.\-]/g,"").trim();
  const num=parseFloat(s);
  if(!Number.isFinite(num)) return raw;
  return "USD "+Math.round(num*mult).toLocaleString("en-US").replace(/,/g," ");
}
function dwtBucket(dwt){
  const n=parseRate(dwt);
  if(n==null) return "Unknown";
  if(n<10000) return "<10k";
  if(n<25000) return "10-25k";
  if(n<40000) return "25-40k (MR)";
  if(n<60000) return "40-60k (LR1)";
  if(n<100000) return "60-100k (LR2)";
  return "100k+";
}
const SIZE_ORDER=["<10k","10-25k","25-40k (MR)","40-60k (LR1)","60-100k (LR2)","100k+","Unknown"];
function monthKey(d){
  if(!d) return "Unknown";
  const dt=new Date(d);
  if(isNaN(dt)) return "Unknown";
  return dt.toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
}

function cleanVal(v){
  const s=String(v ?? "").trim();
  if(!s || s.toLowerCase()==="nan" || s.toLowerCase()==="null" || s.toLowerCase()==="undefined") return "";
  return s;
}

function toISODateOrNull(v){
  const s=String(v ?? "").trim();
  if(!s || s.toLowerCase()==="null" || s.toLowerCase()==="undefined") return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m=s.match(/^(\d{1,2})[\/. -](\d{1,2})[\/. -](\d{2,4})$/);
  if(m){
    const dd=m[1].padStart(2,"0");
    const mm=m[2].padStart(2,"0");
    const yyyy=m[3].length===2 ? "20"+m[3] : m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const d=new Date(s);
  if(!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}

function prepareForSave(row){
  const clean={...row};
  clean.delivered=toISODateOrNull(clean.delivered);
  clean.entry_date=toISODateOrNull(clean.entry_date) || new Date().toISOString().slice(0,10);
  if(!Array.isArray(clean.tags)) clean.tags=[];
  return clean;
}

function clearVesselDetails(row){
  return {
    ...row,
    vessel_name:"",
    dwt:"",
    built:"",
    coating:"",
    vessel_spec:"",
    commercial_operator:""
  };
}

function normName(s){
  return String(s||"").toLowerCase().replace(/[._-]/g," ").replace(/\s+/g," ").trim();
}

async function loadVesselDBMap(){
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while(true){
    const {data,error} = await supabase.from("vessels_db").select("*").range(from, from + pageSize - 1);
    if(error || !data || data.length === 0) break;
    all = [...all, ...data];
    if(data.length < pageSize) break;
    from += pageSize;
  }
  const map = {};
  all.forEach(r => {
    if(r.vessel) map[normName(r.vessel)] = r;
  });
  return map;
}

function findVesselSpec(name, vesselDB){
  const key = normName(name);
  if(!key || !vesselDB) return null;
  if(vesselDB[key]) return vesselDB[key];

  const words = key.split(" ").filter(w => w.length > 1);
  if(words.length >= 2){
    for(const [k,v] of Object.entries(vesselDB)){
      if(words.every(w => k.includes(w))) return v;
    }
  }

  let best=null, score=0;
  for(const [k,v] of Object.entries(vesselDB)){
    if(k.includes(key) || key.includes(k)){
      const s = Math.min(key.length,k.length) / Math.max(key.length,k.length);
      if(s > score){ score=s; best=v; }
    }
  }
  return score > 0.55 ? best : null;
}

function enrichWithVesselDB(row, vesselDB){
  const spec = findVesselSpec(row.vessel_name, vesselDB);
  if(!spec) return row;

  const specParts = [
    cleanVal(spec.loa) ? `LOA ${cleanVal(spec.loa)}` : "",
    cleanVal(spec.beam) ? `Beam ${cleanVal(spec.beam)}` : "",
    cleanVal(spec.cbm) ? `${cleanVal(spec.cbm)} cbm` : "",
    cleanVal(spec.ice_class) ? `Ice ${cleanVal(spec.ice_class)}` : "",
    cleanVal(spec.fuel) ? `Fuel ${cleanVal(spec.fuel)}` : "",
  ].filter(Boolean).join(" · ");

  return {
    ...row,
    dwt: row.dwt || cleanVal(spec.dwt),
    built: row.built || cleanVal(spec.built) || cleanVal(spec.build_year),
    // Coating is manual only because some vessel_db rows have a default/generic MarineLine value.
    coating: row.coating || "",
    commercial_operator: row.commercial_operator || cleanVal(spec.operator),
    vessel_spec: row.vessel_spec || specParts || "",
  };
}

async function loadTCVessels(){
  const {data,error}=await supabase
    .from("time_charter_vessels")
    .select("*")
    .order("entry_date",{ascending:false})
    .order("created_at",{ascending:false});
  if(error){
    console.error("loadTCVessels",error);
    return [];
  }
  return (data||[]).map(r => ({...r, tags:Array.isArray(r.tags) ? r.tags : []}));
}

async function saveTCVessel(row){
  const clean={...prepareForSave(row), updated_at:new Date().toISOString()};
  if(!clean.id) clean.id="tc_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
  const {data,error}=await supabase
    .from("time_charter_vessels")
    .upsert(clean,{onConflict:"id"})
    .select()
    .single();
  if(error){
    console.error("saveTCVessel",error);
    throw error;
  }
  return {...data, tags:Array.isArray(data.tags) ? data.tags : []};
}

async function deleteTCVessel(id){
  const {error}=await supabase.from("time_charter_vessels").delete().eq("id",id);
  if(error) throw error;
}

async function parseTC(text,img){
  let t=text;
  if(img){
    const o=await ocrImage(img);
    t=o+(text?.trim() ? "\n\n"+text : "");
  }

  const raw=await apiCall(
    "Maritime time charter fixture parser. Output ONLY raw JSON array, no markdown, no explanation.",
    [{role:"user",content:`Parse time charter vessel entries into JSON array.

Fields exactly:
{vessel_name, dwt, built, coating, vessel_spec, owner, commercial_operator, tc_charterer, rate, period, delivered, entry_date, comment, tags}

Rules:
- vessel_name: ship name, uppercase if clear.
- tc_charterer: company that has/takes vessel on time charter.
- commercial_operator: current commercial operator/manager if mentioned.
- rate: daily hire, preserve as USD/day string or number. Examples: 18500, "$18,500 pd", "USD 18k pd" -> "18500".
- dwt: deadweight / size if mentioned, e.g. "18500", "18.5k", "19k dwt".
- built: build year if mentioned, e.g. "2010". Do NOT output age in years unless no built year exists.
- coating: coating if mentioned, e.g. "MarineLine", "Epoxy", "Stainless".
- vessel_spec: other vessel specs such as IMO, cbm, ice class, pumps, segregations, eco, IMO II/III.
- period: e.g. "6 months", "1 year", "3+3 months", "30-45 days".
- delivered: delivery date / when vessel is delivered into TC. Use YYYY-MM-DD if possible. If only month/year, use first day of month. If unknown, null.
- entry_date: date the information was entered/received. Use today if unknown.
- tags: choose relevant tags from PNC, AG, CPP, DPP, ex Asia, Med, Parcel, TA, UKC, WAF, ASIA, J19, INTER, C18, MR, CHEM, BIO, RUMOUR, DONE.
- Use PNC for purchase option / purchase-and-charter / purchase discussions.
- comment: all extra details, options, redelivery, broker notes, uncertainty.
- Only include rows where a TC fixture/TC candidate is present.

Today is ${new Date().toISOString().slice(0,10)}.

Input:
${t}`}]
  );

  const cl=raw.trim().replace(/^```[\w]*/,"").replace(/```/g,"").trim();
  const s=cl.indexOf("["), e=cl.lastIndexOf("]");
  if(s<0||e<=s) throw new Error("No JSON array found");
  return JSON.parse(cl.slice(s,e+1));
}

function MiniBar({label,value,max,color=C.blue}){
  const pct=max?Math.max(4,Math.round(value/max*100)):0;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <div style={{width:72,color:C.faint,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
      <div style={{flex:1,height:8,background:C.bg3,borderRadius:99,overflow:"hidden"}}>
        <div style={{height:"100%",width:pct+"%",background:color+"cc"}}/>
      </div>
      <div style={{width:42,textAlign:"right",color:C.tx,fontVariantNumeric:"tabular-nums"}}>{value}</div>
    </div>
  );
}

function TagPicker({value=[],onChange,compact=false}){
  const [tags,setTags]=useState(getTagList);
  const [newTag,setNewTag]=useState("");
  const [open,setOpen]=useState(false);
  const active=new Set(value||[]);
  const btn=(on,col=C.amber)=>({
    fontSize:compact?10:11,
    fontWeight:700,
    padding:compact?"2px 6px":"4px 9px",
    borderRadius:5,
    border:"1px solid "+(on?col:C.bd),
    background:on?col+"22":"transparent",
    color:on?col:C.dim,
    cursor:"pointer",
    fontFamily:"inherit",
    whiteSpace:"nowrap"
  });

  function toggle(t){
    const s=new Set(value||[]);
    s.has(t) ? s.delete(t) : s.add(t);
    onChange([...s]);
  }

  function add(){
    const t=newTag.trim();
    if(!t) return;
    addCustomTag(t);
    setTags(getTagList());
    setNewTag("");
    if(!active.has(t)) onChange([...(value||[]),t]);
  }

  // Compact mode is used inside table rows:
  // show only selected tags + plus button. Click plus to choose more.
  if(compact){
    const shown=(value||[]).slice(0,2);
    const extra=(value||[]).length-shown.length;
    return (
      <div style={{display:"flex",gap:4,alignItems:"center",position:"relative",height:22,overflow:"hidden",whiteSpace:"nowrap"}} title={(value||[]).join(", ")}>
        {shown.map(t=>(
          <button key={t} style={btn(true,tagColor(t))} onClick={()=>toggle(t)} title="Click to remove tag">
            {t} ×
          </button>
        ))}
        {extra>0&&(
          <button style={btn(false,C.dim)} onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} title={(value||[]).slice(2).join(", ")}>+{extra}</button>
        )}
        <button style={btn(false,C.blue)} onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} title="Add tag">＋</button>
        {open&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setOpen(false)}/>
            <div style={{position:"absolute",top:24,left:0,zIndex:9999,minWidth:210,maxWidth:360,background:"#0a1628",border:"1px solid "+C.bd,borderRadius:8,padding:8,boxShadow:"0 10px 30px rgba(0,0,0,.6)",display:"flex",gap:5,flexWrap:"wrap"}}>
              {tags.map(t=>(
                <button key={t} style={btn(active.has(t),tagColor(t))} onClick={e=>{e.stopPropagation();toggle(t);}}>
                  {t}
                </button>
              ))}
              <input
                value={newTag}
                onChange={e=>setNewTag(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();} if(e.key==="Escape")setOpen(false);}}
                placeholder="+ tag"
                style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:10,padding:"2px 6px",outline:"none",width:70}}
              />
              <button style={btn(false,C.blue)} onClick={add}>Add</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Full mode is used in manual entry / parse selection:
  // show all tags so you can preselect tags before saving/parsing.
  return (
    <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
      {tags.map(t=>(
        <button key={t} style={btn(active.has(t),tagColor(t))} onClick={()=>toggle(t)}>
          {t}
        </button>
      ))}
      <input
        value={newTag}
        onChange={e=>setNewTag(e.target.value)}
        onKeyDown={e=>{
          if(e.key==="Enter"){e.preventDefault();add();}
          if(e.key==="Escape")setNewTag("");
        }}
        placeholder="+ tag"
        style={{
          background:C.bg3,
          border:"1px solid "+C.bd,
          borderRadius:5,
          color:C.tx,
          fontFamily:"inherit",
          fontSize:11,
          padding:"4px 7px",
          outline:"none",
          width:80
        }}
      />
      <button style={btn(false,C.blue)} onClick={add}>Add</button>
    </div>
  );
}

const DEFAULT_W={vessel_name:130,dwt:64,built:60,coating:90,vessel_spec:170,owner:110,commercial_operator:150,tc_charterer:130,rate:110,period:90,delivered:100,entry_date:92,tags:170,comment:220};

export default function TimeCharterTab(){
  const [rows,setRows]=useState([]);
  const [draft,setDraft]=useState(blank());
  const [text,setText]=useState("");
  const [img,setImg]=useState(null);
  const [parseDate,setParseDate]=useState("");
  const [entryMode,setEntryMode]=useState("parse");
  const fRef=useRef(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState(null);
  const [search,setSearch]=useState("");
  const [tagFilter,setTagFilter]=useState(()=>new Set());
  const [sortKey,setSortKey]=useState(null);
  const [sortDir,setSortDir]=useState("asc");
  const [tagList,setTagList]=useState(getTagList);
  const [vesselDB,setVesselDB]=useState({});
  const [colWidths,setColWidths]=useState(DEFAULT_W);
  const [pendingDel,setPendingDel]=useState(null);

  function toggleTagFilter(t){
    setTagFilter(prev=>{
      const s=new Set(prev);
      s.has(t)?s.delete(t):s.add(t);
      return s;
    });
  }
  function headerSort(c){
    if(sortKey===c){ setSortDir(d=>d==="asc"?"desc":"asc"); }
    else { setSortKey(c); setSortDir("asc"); }
  }
  function startResize(e,c){
    e.preventDefault(); e.stopPropagation();
    const startX=e.clientX;
    const startW=colWidths[c]||DEFAULT_W[c]||100;
    function onMove(ev){
      const w=Math.max(40,startW+(ev.clientX-startX));
      setColWidths(cw=>({...cw,[c]:w}));
    }
    function onUp(){
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("mouseup",onUp);
    }
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  }
  async function confirmDelete(){
    if(!pendingDel) return;
    try{
      await deleteTCVessel(pendingDel.id);
      setRows(rs=>rs.filter(x=>x.id!==pendingDel.id));
    }catch(e){
      setStatus({t:"error",m:e.message});
    }
    setPendingDel(null);
  }

  useEffect(()=>{
    loadTCVessels().then(setRows);
    loadVesselDBMap().then(setVesselDB);
  },[]);

  function onPaste(e){
    for(const it of Array.from(e.clipboardData?.items||[])){
      if(it.type.startsWith("image/")){
        e.preventDefault();
        loadImg(it.getAsFile(),setImg);
        return;
      }
    }
  }

  function enrichDraftByName(name){
    setDraft(d => enrichWithVesselDB({...d, vessel_name:name}, vesselDB));
  }

  async function addManual(){
    try{
      const enriched=enrichWithVesselDB({...draft,rate:formatRateUSD(draft.rate),tags:draft.tags||[]}, vesselDB);
      const saved=await saveTCVessel(enriched);
      setRows(r=>[saved,...r.filter(x=>x.id!==saved.id)]);
      setDraft(blank());
      setStatus({t:"success",m:"✓ TC entry saved"});
    }catch(e){
      setStatus({t:"error",m:e.message});
    }
  }

  async function update(id,k,v){
    const old=rows.find(r=>r.id===id);
    if(!old) return;
    let next={...old,[k]:v};

    if(k==="vessel_name"){
      next = !String(v||"").trim() ? clearVesselDetails(next) : enrichWithVesselDB(next, vesselDB);
    }

    setRows(rs=>rs.map(r=>r.id===id?next:r));
    try{ await saveTCVessel(next); }
    catch(e){ setStatus({t:"error",m:e.message}); }
  }

  async function ingest(){
    if(!text.trim()&&!img){
      setStatus({t:"error",m:"Paste TC text or image first."});
      return;
    }
    setBusy(true);
    setStatus({t:"info",m:"Parsing TC entries…"});
    try{
      const parsed=await parseTC(text,img);
      const saved=[];
      for(const p of parsed){
        const row=enrichWithVesselDB({
          ...blank(),
          ...p,
          rate:formatRateUSD(p.rate),
          entry_date:parseDate||p.entry_date,
          tags:Array.isArray(p.tags)?p.tags:[]
        }, vesselDB);
        saved.push(await saveTCVessel(row));
      }
      setRows(r=>[...saved,...r]);
      setText("");
      setImg(null);
      setStatus({t:"success",m:`✓ Added ${saved.length} TC entr${saved.length===1?"y":"ies"}`});
    }catch(e){
      setStatus({t:"error",m:e.message});
    }finally{
      setBusy(false);
    }
  }

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    let out=rows.filter(r=>{
      if(tagFilter.size && !(r.tags||[]).some(t=>tagFilter.has(t))) return false;
      if(!q) return true;
      return [
        r.vessel_name,r.owner,r.commercial_operator,r.tc_charterer,r.rate,r.period,r.delivered,
        r.entry_date,r.dwt,r.built,r.coating,r.vessel_spec,r.comment,(r.tags||[]).join(" ")
      ].join(" ").toLowerCase().includes(q);
    });
    // No explicit sort chosen -> preserve natural row order so editing a cell
    // (e.g. clicking into the date field) never reshuffles the table.
    if(!sortKey) return out;
    const dir=sortDir==="asc"?1:-1;
    return [...out].sort((a,b)=>{
      if(sortKey==="rate"||sortKey==="dwt"){
        const av=parseRate(a[sortKey]),bv=parseRate(b[sortKey]);
        if(av==null&&bv==null) return 0;
        if(av==null) return 1;
        if(bv==null) return -1;
        return (av-bv)*dir;
      }
      return String(a[sortKey]||"").localeCompare(String(b[sortKey]||""))*dir;
    });
  },[rows,search,tagFilter,sortKey,sortDir]);

  const stats=useMemo(()=>{
    const rates=filtered.map(r=>parseRate(r.rate)).filter(n=>n!=null);
    const byChar={};
    const bySize={};
    filtered.forEach(r=>{
      const c=r.tc_charterer||"Unknown";
      byChar[c]=(byChar[c]||0)+1;
      const seg=dwtBucket(r.dwt);
      bySize[seg]=(bySize[seg]||0)+1;
    });
    const sizeEntries=SIZE_ORDER.filter(s=>bySize[s]).map(s=>[s,bySize[s]]);
    return {
      count:filtered.length,
      avg:rates.length?Math.round(rates.reduce((a,b)=>a+b,0)/rates.length):null,
      maxChar:Math.max(1,...Object.values(byChar)),
      byChar:Object.entries(byChar).sort((a,b)=>b[1]-a[1]).slice(0,6),
      maxSize:Math.max(1,...sizeEntries.map(x=>x[1])),
      bySize:sizeEntries
    };
  },[filtered]);

  const inp={
    background:C.bg3,
    border:"1px solid "+C.bd,
    borderRadius:5,
    color:C.tx,
    fontFamily:"inherit",
    fontSize:12,
    padding:"6px 8px",
    outline:"none",
    width:"100%"
  };
  const btn=(on,col=C.blue)=>({
    fontSize:11,
    fontWeight:700,
    padding:"4px 9px",
    borderRadius:5,
    border:"1px solid "+(on?col:C.bd),
    background:on?col+"22":"transparent",
    color:on?col:C.dim,
    cursor:"pointer",
    fontFamily:"inherit",
    whiteSpace:"nowrap"
  });
  const th={
    padding:"7px 8px",
    background:C.bg4,
    color:C.faint,
    fontSize:11,
    fontWeight:800,
    textTransform:"uppercase",
    letterSpacing:"0.07em",
    textAlign:"left",
    whiteSpace:"nowrap",
    cursor:"pointer"
  };
  const td={
    padding:"5px 8px",
    borderBottom:"1px solid "+C.bd2,
    fontSize:12,
    verticalAlign:"middle"
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {pendingDel&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",fontSize:12,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete "{pendingDel.label||"this entry"}"?</span>
          <button onClick={confirmDelete} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDel(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"6px 16px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:800,color:C.tx}}>{entryMode==="parse"?"Parse TC fixtures / screenshot":"Manual TC entry"}</div>
          <div style={{display:"flex",gap:6}}>
            <button style={btn(entryMode==="parse",C.blue)} onClick={()=>setEntryMode("parse")}>Parse</button>
            <button style={btn(entryMode==="manual",C.green)} onClick={()=>setEntryMode("manual")}>Manual</button>
          </div>
        </div>

        {entryMode==="parse"?(
          <>
            {img?.dataUrl&&(
              <div style={{position:"relative",marginBottom:6}}>
                <img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:110,objectFit:"cover",borderRadius:6}}/>
                <button onClick={()=>setImg(null)} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.65)",border:"none",borderRadius:"50%",color:"#fff",width:22,height:22,cursor:"pointer"}}>×</button>
              </div>
            )}
            <textarea
              value={text}
              onPaste={onPaste}
              onChange={e=>setText(e.target.value)}
              placeholder="Paste TC recap or screenshot here…"
              style={{...inp,minHeight:120,resize:"vertical",lineHeight:1.45}}
            />
            <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
              <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>loadImg(e.target.files?.[0],setImg)}/>
              <button style={btn(false,C.purple)} onClick={()=>fRef.current?.click()}>Image</button>
              <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.dim}}>
                Date added:
                <input type="date" value={parseDate} onChange={e=>setParseDate(e.target.value)} style={{...inp,width:140}} title="Leave blank to use today / AI-detected date"/>
              </label>
              <button style={btn(true,C.green)} disabled={busy} onClick={ingest}>{busy?"Parsing…":"Parse + Insert"}</button>
              {status&&<span style={{fontSize:12,color:status.t==="error"?C.red:status.t==="success"?C.green:C.blue}}>{status.m}</span>}
            </div>
          </>
        ):(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {COLS.filter(c=>c!=="tags"&&c!=="comment").map(k=>(
                <input
                  key={k}
                  style={inp}
                  value={draft[k]||""}
                  onChange={e=>{
                    const val=e.target.value;
                    if(k==="vessel_name" && !val.trim()){
                      setDraft(d=>clearVesselDetails(d));
                      return;
                    }
                    setDraft(d=>({...d,[k]:val}));
                  }}
                  onBlur={e=>{
                    if(k==="vessel_name" && e.target.value.trim()) enrichDraftByName(e.target.value);
                    if(k==="rate") setDraft(d=>({...d,rate:formatRateUSD(e.target.value)}));
                  }}
                  placeholder={label(k)}
                />
              ))}
            </div>
            <textarea
              style={{...inp,minHeight:50,marginTop:7}}
              value={draft.comment||""}
              onChange={e=>setDraft(d=>({...d,comment:e.target.value}))}
              placeholder="Comment"
            />
            <div style={{marginTop:7}}>
              <TagPicker value={draft.tags||[]} onChange={tags=>{setDraft(d=>({...d,tags}));setTagList(getTagList());}} />
            </div>
            <button style={{...btn(true,C.green),marginTop:9}} onClick={addManual}>Save manual entry</button>
          </>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"220px 1fr 1fr",gap:12}}>
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}>
          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase",fontWeight:800}}>Stats</div>
          <div style={{fontSize:26,color:C.tx,fontWeight:800}}>{stats.count}</div>
          <div style={{fontSize:12,color:C.dim}}>TC vessels shown</div>
          <div style={{marginTop:8,fontSize:20,color:C.amber,fontWeight:800}}>{stats.avg?usd(stats.avg):"—"}</div>
          <div style={{fontSize:12,color:C.dim}}>Average rate</div>
        </div>
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}>
          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase",fontWeight:800,marginBottom:8}}>Top TC charterers</div>
          {stats.byChar.map(([k,v])=><MiniBar key={k} label={k} value={v} max={stats.maxChar} color={C.blue}/>)}
        </div>
        <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}>
          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase",fontWeight:800,marginBottom:8}}>Size / segment mix</div>
          {stats.bySize.map(([k,v])=><MiniBar key={k} label={k} value={v} max={stats.maxSize} color={C.purple}/>)}
        </div>
      </div>

      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,overflow:"hidden"}}>
        <div style={{display:"flex",gap:8,padding:10,borderBottom:"1px solid "+C.bd2,alignItems:"center",flexWrap:"wrap"}}>
          <input style={{...inp,width:230}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vessel, owner, TC, rate…"/>
          <select
            value={sortKey||""}
            onChange={e=>{ if(e.target.value){setSortKey(e.target.value);setSortDir("asc");} else {setSortKey(null);} }}
            style={{...inp,width:170}}
            title="Sort by"
          >
            <option value="">Default order (as added)</option>
            {COLS.filter(c=>c!=="tags"&&c!=="comment").map(c=><option key={c} value={c}>{label(c)}</option>)}
          </select>
          {sortKey&&(
            <button style={btn(false,C.blue)} onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")}>{sortDir==="asc"?"↑ Asc":"↓ Desc"}</button>
          )}
          <div style={{width:1,height:20,background:C.bd2}}/>
          <button style={btn(tagFilter.size===0)} onClick={()=>setTagFilter(new Set())}>ALL</button>
          {tagList.map(t=>(
            <button key={t} style={btn(tagFilter.has(t),tagColor(t))} onClick={()=>toggleTagFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1400}}>
            <thead>
              <tr>
                {COLS.map(c=>(
                  <th key={c} style={{...th,width:colWidths[c]||DEFAULT_W[c]||100,position:"relative",overflow:"hidden"}} onClick={()=>headerSort(c)}>
                    <span style={{userSelect:"none",paddingRight:6}}>{label(c)}{sortKey===c?(sortDir==="asc"?" ↑":" ↓"):""}</span>
                    <span
                      onMouseDown={e=>startResize(e,c)}
                      onClick={e=>e.stopPropagation()}
                      style={{position:"absolute",right:0,top:0,bottom:0,width:6,cursor:"col-resize"}}
                    />
                  </th>
                ))}
                <th style={{...th,width:26}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r,i)=>(
                <tr key={r.id} style={{background:i%2?C.bg2:C.bg,height:34}}>
                  {COLS.map(c=>c==="tags" ? (
                    <td key={c} style={{...td,width:colWidths[c]||DEFAULT_W[c]||100,overflow:"hidden"}}>
                      <TagPicker compact value={r.tags||[]} onChange={tags=>{update(r.id,"tags",tags);setTagList(getTagList());}} />
                    </td>
                  ) : (
                    <td key={c} style={{...td,width:colWidths[c]||DEFAULT_W[c]||100,overflow:"hidden"}} title={r[c]||""}>
                      <input
                        value={r[c]||""}
                        onChange={e=>update(r.id,c,e.target.value)}
                        onBlur={e=>{ if(c==="rate") update(r.id,"rate",formatRateUSD(e.target.value)); }}
                        style={{...inp,border:"none",background:"transparent",padding:"3px 2px",color:c==="rate"?C.amber:C.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}
                      />
                    </td>
                  ))}
                  <td style={{...td,width:26,padding:"0 2px"}}>
                    <button onClick={()=>setPendingDel({id:r.id,label:r.vessel_name})} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}} title="Delete">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
