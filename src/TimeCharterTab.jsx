import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { apiCall, ocrImage } from "./api";
import { loadImg } from "./utils";

const TAGS = ["UKC","MED","ASIA","J19","INTER","C18","MR","CPP","CHEM","BIO","RUMOUR","DONE"];
const COLS = ["vessel_name","owner","commercial_operator","tc_charterer","rate","period","done_date","tags","comment"];
const blank = () => ({ vessel_name:"", owner:"", commercial_operator:"", tc_charterer:"", rate:"", period:"", done_date:new Date().toISOString().slice(0,10), comment:"", tags:[] });
const usd = n => n ? "$" + Number(String(n).replace(/[^0-9.\-]/g,"")).toLocaleString("en-US") + "/d" : "";

function parseRate(v){ const n=parseFloat(String(v||"").replace(/[^0-9.\-]/g,"")); return isNaN(n)?null:n; }
function monthKey(d){ if(!d)return "Unknown"; const dt=new Date(d); if(isNaN(dt))return "Unknown"; return dt.toLocaleDateString("en-GB",{month:"short",year:"2-digit"}); }

async function loadTCVessels(){
  const {data,error}=await supabase.from("time_charter_vessels").select("*").order("done_date",{ascending:false}).order("created_at",{ascending:false});
  if(error){console.error("loadTCVessels",error);return [];} return data||[];
}
async function saveTCVessel(row){
  const clean={...row, updated_at:new Date().toISOString()};
  if(!clean.id) clean.id="tc_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
  const {data,error}=await supabase.from("time_charter_vessels").upsert(clean,{onConflict:"id"}).select().single();
  if(error){console.error("saveTCVessel",error);throw error;} return data;
}
async function deleteTCVessel(id){ const {error}=await supabase.from("time_charter_vessels").delete().eq("id",id); if(error)throw error; }

async function parseTC(text,img){
  let t=text;
  if(img){ const o=await ocrImage(img); t=o+(text?.trim()?"\n\n"+text:""); }
  const raw=await apiCall(
    "Maritime time charter fixture parser. Output ONLY raw JSON array, no markdown, no explanation.",
    [{role:"user",content:`Parse time charter vessel entries into JSON array.
Fields exactly: {vessel_name, owner, commercial_operator, tc_charterer, rate, period, done_date, comment, tags}
Rules:
- vessel_name: ship name, uppercase if clear.
- tc_charterer: company that has/takes vessel on time charter.
- commercial_operator: current commercial operator/manager if mentioned.
- rate: daily hire, preserve as USD/day string or number. Examples: 18500, "$18,500 pd", "USD 18k pd" -> "18500".
- period: e.g. "6 months", "1 year", "3+3 months", "30-45 days".
- done_date: date fixture was done. Use YYYY-MM-DD if possible. If only month/year, use first day of month. If unknown, null.
- tags: choose relevant uppercase tags from UKC, MED, ASIA, J19, INTER, C18, MR, CPP, CHEM, BIO, RUMOUR, DONE.
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
  return <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><div style={{width:72,color:C.faint,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div><div style={{flex:1,height:8,background:C.bg3,borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:color+"cc"}}/></div><div style={{width:42,textAlign:"right",color:C.tx,fontVariantNumeric:"tabular-nums"}}>{value}</div></div>;
}

export default function TimeCharterTab(){
  const [rows,setRows]=useState([]); const [draft,setDraft]=useState(blank());
  const [text,setText]=useState(""); const [img,setImg]=useState(null); const fRef=useRef(null);
  const [busy,setBusy]=useState(false); const [status,setStatus]=useState(null);
  const [search,setSearch]=useState(""); const [tag,setTag]=useState("ALL"); const [sort,setSort]=useState("done_date");
  useEffect(()=>{loadTCVessels().then(setRows);},[]);
  function onPaste(e){ for(const it of Array.from(e.clipboardData?.items||[])){ if(it.type.startsWith("image/")){ e.preventDefault(); loadImg(it.getAsFile(),setImg); return; } } }
  async function addManual(){ try{ const saved=await saveTCVessel({...draft,tags:draft.tags||[]}); setRows(r=>[saved,...r.filter(x=>x.id!==saved.id)]); setDraft(blank()); }catch(e){setStatus({t:"error",m:e.message});} }
  async function update(id,k,v){ const old=rows.find(r=>r.id===id); if(!old)return; const next={...old,[k]:v}; setRows(rs=>rs.map(r=>r.id===id?next:r)); try{await saveTCVessel(next);}catch(e){setStatus({t:"error",m:e.message});} }
  async function ingest(){
    if(!text.trim()&&!img){setStatus({t:"error",m:"Paste TC text or image first."});return;}
    setBusy(true); setStatus({t:"info",m:"Parsing TC entries…"});
    try{ const parsed=await parseTC(text,img); const saved=[]; for(const p of parsed){ saved.push(await saveTCVessel({...blank(),...p,tags:Array.isArray(p.tags)?p.tags:[]})); } setRows(r=>[...saved,...r]); setText(""); setImg(null); setStatus({t:"success",m:`✓ Added ${saved.length} TC entr${saved.length===1?"y":"ies"}`}); }
    catch(e){setStatus({t:"error",m:e.message});} finally{setBusy(false);}
  }
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    let out=rows.filter(r=>{
      if(tag!=="ALL" && !(r.tags||[]).includes(tag)) return false;
      if(!q)return true;
      return [r.vessel_name,r.owner,r.commercial_operator,r.tc_charterer,r.rate,r.period,r.comment,(r.tags||[]).join(" ")].join(" ").toLowerCase().includes(q);
    });
    return [...out].sort((a,b)=>String(b[sort]||"").localeCompare(String(a[sort]||"")));
  },[rows,search,tag,sort]);
  const stats=useMemo(()=>{
    const rates=filtered.map(r=>parseRate(r.rate)).filter(n=>n!=null);
    const byChar={}; const byMonth={}; const byTag={};
    filtered.forEach(r=>{ const c=r.tc_charterer||"Unknown"; byChar[c]=(byChar[c]||0)+1; byMonth[monthKey(r.done_date)]=(byMonth[monthKey(r.done_date)]||0)+1; (r.tags||[]).forEach(t=>byTag[t]=(byTag[t]||0)+1); });
    return {count:filtered.length,avg:rates.length?Math.round(rates.reduce((a,b)=>a+b,0)/rates.length):null,maxChar:Math.max(1,...Object.values(byChar)), byChar:Object.entries(byChar).sort((a,b)=>b[1]-a[1]).slice(0,6), byMonth:Object.entries(byMonth).slice(0,8), byTag:Object.entries(byTag).sort((a,b)=>b[1]-a[1]).slice(0,8)};
  },[filtered]);
  const inp={background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"6px 8px",outline:"none",width:"100%"};
  const btn=(on,col=C.blue)=>({fontSize:11,fontWeight:700,padding:"4px 9px",borderRadius:5,border:"1px solid "+(on?col:C.bd),background:on?col+"22":"transparent",color:on?col:C.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
  const th={padding:"7px 8px",background:C.bg4,color:C.faint,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left",whiteSpace:"nowrap",cursor:"pointer"};
  const td={padding:"5px 8px",borderBottom:"1px solid "+C.bd2,fontSize:12,verticalAlign:"middle"};
  return <div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{display:"grid",gridTemplateColumns:"minmax(320px,1.1fr) minmax(320px,1fr)",gap:12}}>
      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}>
        <div style={{fontSize:12,fontWeight:800,color:C.tx,marginBottom:8}}>⏱️ Parse TC fixtures / screenshot</div>
        {img?.dataUrl&&<div style={{position:"relative",marginBottom:6}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:110,objectFit:"cover",borderRadius:6}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.65)",border:"none",borderRadius:"50%",color:"#fff",width:22,height:22,cursor:"pointer"}}>×</button></div>}
        <textarea value={text} onPaste={onPaste} onChange={e=>setText(e.target.value)} placeholder="Paste TC recap or screenshot here…" style={{...inp,minHeight:120,resize:"vertical",lineHeight:1.45}} />
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}><input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>loadImg(e.target.files?.[0],setImg)}/><button style={btn(false,C.purple)} onClick={()=>fRef.current?.click()}>📷 Image</button><button style={btn(true,C.green)} disabled={busy} onClick={ingest}>{busy?"Parsing…":"Parse + Insert"}</button>{status&&<span style={{fontSize:12,color:status.t==="error"?C.red:status.t==="success"?C.green:C.blue}}>{status.m}</span>}</div>
      </div>
      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}>
        <div style={{fontSize:12,fontWeight:800,color:C.tx,marginBottom:8}}>➕ Manual TC entry</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>{COLS.filter(c=>c!=="tags"&&c!=="comment").map(k=><input key={k} style={inp} value={draft[k]||""} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))} placeholder={k.replaceAll("_"," ")} />)}</div>
        <textarea style={{...inp,minHeight:50,marginTop:7}} value={draft.comment||""} onChange={e=>setDraft(d=>({...d,comment:e.target.value}))} placeholder="Comment" />
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:7}}>{TAGS.map(t=><button key={t} style={btn((draft.tags||[]).includes(t),C.amber)} onClick={()=>setDraft(d=>{const s=new Set(d.tags||[]);s.has(t)?s.delete(t):s.add(t);return {...d,tags:[...s]};})}>{t}</button>)}</div>
        <button style={{...btn(true,C.green),marginTop:9}} onClick={addManual}>Save manual entry</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"220px 1fr 1fr",gap:12}}>
      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}><div style={{fontSize:11,color:C.faint,textTransform:"uppercase",fontWeight:800}}>Stats</div><div style={{fontSize:26,color:C.tx,fontWeight:800}}>{stats.count}</div><div style={{fontSize:12,color:C.dim}}>TC vessels shown</div><div style={{marginTop:8,fontSize:20,color:C.amber,fontWeight:800}}>{stats.avg?usd(stats.avg):"—"}</div><div style={{fontSize:12,color:C.dim}}>Average rate</div></div>
      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}><div style={{fontSize:11,color:C.faint,textTransform:"uppercase",fontWeight:800,marginBottom:8}}>Top TC charterers</div>{stats.byChar.map(([k,v])=><MiniBar key={k} label={k} value={v} max={stats.maxChar} color={C.blue}/>)}</div>
      <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:12}}><div style={{fontSize:11,color:C.faint,textTransform:"uppercase",fontWeight:800,marginBottom:8}}>Tag mix</div>{stats.byTag.map(([k,v])=><MiniBar key={k} label={k} value={v} max={Math.max(1,...stats.byTag.map(x=>x[1]))} color={C.purple}/>)}</div>
    </div>
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,overflow:"hidden"}}>
      <div style={{display:"flex",gap:8,padding:10,borderBottom:"1px solid "+C.bd2,alignItems:"center",flexWrap:"wrap"}}><input style={{...inp,width:230}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search vessel, owner, TC, rate…"/><button style={btn(tag==="ALL")} onClick={()=>setTag("ALL")}>ALL</button>{TAGS.map(t=><button key={t} style={btn(tag===t,C.amber)} onClick={()=>setTag(tag===t?"ALL":t)}>{t}</button>)}</div>
      <div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1180}}><thead><tr>{COLS.map(c=><th key={c} style={th} onClick={()=>setSort(c)}>{c.replaceAll("_"," ")}</th>)}<th style={th}></th></tr></thead><tbody>{filtered.map((r,i)=><tr key={r.id} style={{background:i%2?C.bg2:C.bg}}>{COLS.map(c=>c==="tags"?<td key={c} style={td}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(r.tags||[]).map(t=><span key={t} style={{fontSize:10,color:C.amber,border:"1px solid "+C.amber+"55",background:C.amber+"18",borderRadius:4,padding:"1px 5px"}}>{t}</span>)}</div></td>:<td key={c} style={td}><input value={r[c]||""} onChange={e=>update(r.id,c,e.target.value)} style={{...inp,border:"none",background:"transparent",padding:"3px 2px",color:c==="rate"?C.amber:C.tx}} /></td>)}<td style={td}><button onClick={async()=>{await deleteTCVessel(r.id);setRows(rs=>rs.filter(x=>x.id!==r.id));}} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button></td></tr>)}</tbody></table></div>
    </div>
  </div>;
}
