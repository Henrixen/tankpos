import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseclient";
import { C, OP_COLORS } from "./constants";
import { stripHtml, classifyRegion, daysBetween } from "./utils";
import { apiCall, ocrImage } from "./api";

const WS_STORE = "ws-data";
const ROUTES = [
  {id:"TC2",  name:"TC2",  desc:"ARA→USAC 37kt",    unit:"WS"},
  {id:"TC6",  name:"TC6",  desc:"Cross-Med 30kt",   unit:"WS"},
  {id:"TC14", name:"TC14", desc:"US Gulf→UKC 38kt", unit:"WS"},
  {id:"TC23", name:"TC23", desc:"UKC→USAC 30kt",    unit:"WS"},
];

const FFA_PERIODS = ["Feb/26","Mar/26","Apr/26","Q1/26","Q2/26","AVE/25"];

const REGION_ORDER = ["NWE / UKC","Baltic","Med / Black Sea","USG / USEC / USAC","Caribs","MEG / WCI / Red Sea","SEA / FEA","Africa","South America","Other"];
const REGION_COLORS = {
  "NWE / UKC":"#58a6ff","Baltic":"#ff6b6b","Med / Black Sea":"#fd79a8",
  "USG / USEC / USAC":"#f5a623","Caribs":"#a78bfa","MEG / WCI / Red Sea":"#22d3ee",
  "SEA / FEA":"#3fb950","Africa":"#bc8cff","South America":"#ff9f43","Other":"rgba(160,200,255,.45)"
};

const SEGMENT_ORDER = ["All","Sub 10","City","Inter","J19","Flexi","Handy","MR"];
const SEGMENT_COLORS = {
  "Sub 10":"#8b949e","City":"#58a6ff","Inter":"#22d3ee","J19":"#a78bfa",
  "Flexi":"#fd79a8","Handy":"#3fb950","MR":"#f5a623"
};
function parseDashboardDate(s, reference=new Date()){
  if(!s)return null;
  const raw=String(s).trim();
  const m=raw.match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?$/i);
  if(m){
    const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    let year=m[3]?Number(m[3]):reference.getFullYear(); if(year<100)year+=2000;
    return new Date(year,months[m[2].toLowerCase()],Number(m[1]));
  }
  const d=new Date(raw); return isNaN(d)?null:d;
}
function fmtDwtCompact(n){
  const x=Number(n||0); if(!x)return "—";
  if(x>=1000000)return (x/1000000).toFixed(x>=10000000?1:2).replace(/\.?0+$/,"")+"m";
  if(x>=1000)return Math.round(x/1000).toLocaleString("en-US")+"k";
  return Math.round(x).toLocaleString("en-US");
}
function fmtSigned(n,fmt=x=>String(x)){
  if(n==null||!Number.isFinite(Number(n)))return "—";
  const x=Number(n); return (x>0?"+":"")+fmt(x);
}

function WSTracker() {
  const [data,    setData]    = useState(null);
  const [pasteText, setPaste] = useState("");
  const [img,       setImg]    = useState(null);
  const [parsing,  setParsing] = useState(false);
  const [status,   setStatus]  = useState(null);
  const [wsNote,   setWsNote]  = useState("");
  const wsFileRef = useRef(null);

  // Load wsNote from Supabase
  useEffect(()=>{
    supabase.from("dashboard").select("value").eq("key","ws-note").single()
      .then(({data:row})=>{if(row)setWsNote(row.value||"");});
  },[]);

  // Load from Supabase
  useEffect(()=>{
    (async()=>{
      try{
        const{data:row,error}=await supabase.from("dashboard").select("value").eq("key",WS_STORE).single();
        if(!error&&row) setData(JSON.parse(row.value));
      }catch(_){}
    })();
  },[]);

  function normalisePeriodKeys(ffa){
    if(!ffa) return ffa;
    const keyMap={'Feb26':'Feb26','Mar26':'Mar26','Apr26':'Apr26','May26':'May26','Jun26':'Jun26',
      'FEB26':'Feb26','MAR26':'Mar26','APR26':'Apr26','MAY26':'May26','JUN26':'Jun26',
      'Q126':'Q126','Q226':'Q226','Q326':'Q326','Q426':'Q426',
      '1Q26':'Q126','2Q26':'Q226','3Q26':'Q326','4Q26':'Q426',
      'AVE25':'AVE25','AVE26':'AVE26','ave25':'AVE25','ave26':'AVE26'};
    const result={};
    for(const[rid,periods] of Object.entries(ffa)){
      result[rid]={};
      for(const[k,v] of Object.entries(periods)){
        const norm=keyMap[k]||k;
        result[rid][norm]=v;
      }
    }
    return result;
  }
  async function saveWS(d) {
    const clean={...d,ffa:normalisePeriodKeys(d.ffa)};
    try{await supabase.from("dashboard").upsert({key:WS_STORE,value:JSON.stringify(clean)},{onConflict:"key"});}catch(_){}
    setData(clean);
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
    "TC2":  {"ws": 218.75, "change": -1.25},
    "TC6":  {"ws": 310.56, "change": -14.44}
  },
  "ffa": {
    "TC2":  {"Mar26": 247.50, "Apr26": 227.50, "May26": 165.50, "Q126": 167.50, "Q226": 179.50, "AVE25": 134.50},
    "TC14": {"Mar26": 394.50, "Apr26": 329.50, "May26": 243.50, "Q126": 277.50, "Q226": 255.50, "AVE25": 147.50}
  }
}

Rules:
- Only include routes and fields where you actually found a value — omit nulls entirely
- spot: include ws and change (as signed number e.g. -1.25) if present
- ffa period key format MUST be exactly: Mar26 Apr26 May26 Jun26 Q126 Q226 Q326 Q426 AVE25 AVE26 (no slash, no space)
- If input has "MAR/26" use "Mar26", "1Q/26" use "Q126", "AVE/25" use "AVE25"
- Spot change: extract from parentheses e.g. "218.75(-1.25)" → ws:218.75 change:-1.25
- TC178 uses $/mt not WS — still put the number in "ws" field

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
        spot: (()=>{
          const es=existing.spot||{};
          const ns={...es};
          for(const[rid,val] of Object.entries(stampedSpot)){
            if(!val) continue;
            const prev=es[rid]||{};
            // Only overwrite fields that are non-null in the new parse
            ns[rid]={...prev};
            if(val.ws!=null) ns[rid].ws=val.ws;
            if(val.change!=null) ns[rid].change=val.change;
            ns[rid].updatedAt=today;
          }
          return ns;
        })(),
        ffa: (()=>{
          const ef=existing.ffa||{};
          const pf=parsed.ffa||{};
          // If new paste has FFA data, replace entirely so columns always match latest paste
          if(Object.keys(pf).length>0){
            const nf={};
            for(const[rid,val] of Object.entries(pf)){
              if(!val) continue;
              nf[rid]={...val,updatedAt:today};
            }
            return nf;
          }
          // No FFA in this paste — keep existing
          return ef;
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

  // Chart data: last 30 history snapshots sorted chronologically
  function parseChartDate(s){
    if(!s)return 0;
    try{
      const m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
      if(m){const yr=m[3].length===2?"20"+m[3]:m[3];return new Date(`${m[2]} ${m[1]} ${yr}`).getTime();}
      return new Date(s).getTime()||0;
    }catch{return 0;}
  }
  const histData = [...(data?.history||[])]
    .sort((a,b)=>parseChartDate(a.date)-parseChartDate(b.date))
    .slice(-30);
  const routeColors = {TC2:C.blue,TC6:C.green,TC14:C.amber,TC23:C.purple,TC178:"#ff9f43"};

  const secHead = t=>(<div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>{t}</div>);
  const th2 = {padding:"5px 8px",background:C.bg3,color:C.faint,fontWeight:700,fontSize:12,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"};
  const td2 = {padding:"5px 8px",fontSize:12,textAlign:"right",whiteSpace:"nowrap",borderBottom:"1px solid "+C.bg2};

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px"}}>
      {secHead("📊 Worldscale Spot + FFA Tracker")}

      {/* Paste input */}
      <div style={{marginBottom:5}}>
        <div style={{fontSize:11,color:C.dim,marginBottom:3}}>
          Paste data from broker recap, Baltic Exchange, or the FFA screenshot - any format works
        </div>
        {img?.dataUrl&&<div style={{position:"relative",marginBottom:4}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:4,display:"block"}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer"}}>✕</button></div>}
        {img&&!img.dataUrl&&<div style={{padding:"3px 10px",background:"rgba(188,140,255,.07)",borderRadius:4,fontSize:12,color:C.purple,display:"flex",justifyContent:"space-between",marginBottom:4}}><span>📷 Image attached</span><button onClick={()=>setImg(null)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:12}}>✕</button></div>}
        <textarea value={pasteText} onChange={e=>setPaste(e.target.value)}
          onPaste={e=>{for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}}
          placeholder={"TC2 (CONT/TA-37)  127.81(+1.87)  FEB/26: 130.50  MAR/26: 142.50  Q1: 135.50\nTC14 (USG/UKC-38)  270.71(+8.57)\nTC23 220.50  TC6 140.00\n\n- or Ctrl+V a screenshot -"}
          style={{width:"100%",height:34,minHeight:34,maxHeight:34,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"6px 10px",resize:"none",outline:"none",boxSizing:"border-box"}}/>
        <input ref={wsFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
        <div style={{display:"flex",gap:6,marginTop:5,alignItems:"center"}}>
          <button onClick={parseWS} disabled={parsing} style={{background:parsing?"rgba(88,166,255,.06)":"rgba(88,166,255,.11)",border:"1px solid rgba(88,166,255,.36)",borderRadius:4,color:C.blue,fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px 16px",cursor:parsing?"default":"pointer"}}>
            {parsing?"⟳ "+(img?"Reading image…":"Parsing…"):"▶ Parse & Save"}
          </button>
          <button onClick={()=>wsFileRef.current?.click()} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"4px 8px",fontFamily:"inherit",fontSize:12,cursor:"pointer",flexShrink:0}}>📷</button>
          {status&&<div style={{fontSize:12,color:sc,padding:"3px 10px",background:sc+"18",borderRadius:4,border:"1px solid "+sc+"44"}}>{status.m}</div>}
        </div>
      </div>

      {/* Comment / Market Notes */}
      <div style={{marginBottom:6}}>
        <div style={{fontSize:12,color:C.dim,marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>📝 Market notes / commentary</span>
          <span style={{fontSize:12,color:C.faint}}>Auto-saved</span>
        </div>
        <textarea value={wsNote} onChange={e=>{setWsNote(e.target.value);supabase.from("dashboard").upsert({key:"ws-note",value:e.target.value},{onConflict:"key"});}}
          placeholder="e.g. TC2 firming on back of USAC demand, FFA contango widening, Baltic tightening..."
          style={{width:"100%",height:30,minHeight:30,maxHeight:30,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,
            fontFamily:"inherit",fontSize:12,padding:"6px 8px",resize:"vertical",boxSizing:"border-box"}}/>
      </div>

      {data&&<>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <span style={{fontSize:11,color:C.faint}}>Last update: {data.lastUpdate||"—"}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"minmax(150px,.16fr) minmax(0,1.84fr)",gap:12}}>
          <div>
            <div style={{fontSize:11,color:C.faint,fontWeight:700,textTransform:"uppercase",marginBottom:5}}>Current spot + FFA</div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
                <thead><tr><th style={{...th2,textAlign:"left"}}>Route</th><th style={th2}>Spot</th><th style={th2}>Day</th></tr></thead>
                <tbody>{ROUTES.map(r=>{const q=data.spot?.[r.id],chg=q?.change,cc=chg>0?C.green:chg<0?C.red:C.dim,cls=(r.id==="TC6"||r.id==="TC23")?"Handy":"MR";return <tr key={r.id}>
                  <td style={{...td2,textAlign:"left",fontWeight:800,color:routeColors[r.id]||C.blue}}>{r.id}</td>
                  <td style={{...td2,fontWeight:800,color:C.tx}}>{q?.ws!=null?q.ws.toFixed(2):"—"}</td>
                  <td style={{...td2,color:cc,fontWeight:700}}>{chg!=null?(chg>=0?"+":"")+chg.toFixed(2):"—"}</td></tr>})}</tbody>
              </table>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateRows:"1fr 1fr",gap:8}}>
            <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:800,color:C.green,textTransform:"uppercase",marginBottom:3}}>Handy Worldscale · TC6 / TC23</div>
              {histData.length>=2?<WSChart data={histData} routes={ROUTES.filter(r=>["TC6","TC23"].includes(r.id))} colors={routeColors} compact/>:<div style={{fontSize:11,color:C.faint,padding:12}}>Paste updates to build history.</div>}
            </div>
            <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:800,color:C.blue,textTransform:"uppercase",marginBottom:3}}>MR Worldscale · TC2 / TC14</div>
              {histData.length>=2?<WSChart data={histData} routes={ROUTES.filter(r=>["TC2","TC14"].includes(r.id))} colors={routeColors} compact/>:<div style={{fontSize:11,color:C.faint,padding:12}}>Paste updates to build history.</div>}
            </div>
          </div>
        </div>
      </>}

    </div>
  );
}

function WSChart({data,routes,colors,compact=false}) {
  const W=1120,H=compact?245:200,PL=38,PR=10,PT=8,PB=compact?22:28;
  const iW=W-PL-PR,iH=H-PT-PB;

  // Get all WS values to find scale
  const allVals=data.flatMap(d=>routes.map(r=>d.spot?.[r.id]?.ws)).filter(v=>v!=null);
  if(!allVals.length)return null;
  const mn=Math.min(...allVals)*0.95,mx=Math.max(...allVals)*1.05,range=mx-mn||1;
  const xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);

  return(
    <div>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:compact?245:H,display:"block"}}>
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
            <path d={path} fill="none" stroke={colors[r.id]||C.dim} strokeWidth="2" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
              <animate attributeName="stroke-dashoffset" from="1" to="0" dur=".9s" fill="freeze"/>
            </path>
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
        {routes.map(r=>(<span key={r.id} style={{fontSize:12,color:colors[r.id]||C.dim}}><span style={{fontWeight:700}}>●</span> {r.name} {r.desc}</span>))}
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

  // Load cached news from Supabase immediately on mount
  useEffect(()=>{
    supabase.from("dashboard").select("value").eq("key","news-cache").single()
      .then(({data})=>{
        if(data?.value){
          try{
            const cached=JSON.parse(data.value);
            if(cached.items?.length){setItems(cached.items);setLastFetch(cached.time||null);}
          }catch{}
        }
      });
    fetchNews();
  },[]);

  async function fetchNews() {
    setLoading(true); setErr(null);
    try {
      const r=await fetch("/api/shipping-news",{cache:"no-store"});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const j=await r.json();
      const fresh=(j.items||[]).slice(0,24);
      const time=new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
      setItems(fresh); setLastFetch(time);
      try{await supabase.from("dashboard").upsert({key:"news-cache",value:JSON.stringify({items:fresh,time})},{onConflict:"key"});}catch(_){}
    } catch(e) {
      setErr("Shipping news unavailable - "+String(e.message||e).slice(0,80));
    } finally { setLoading(false); }
  }

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
        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em"}}>
          📰 Shipping News · Tankers / Maritime
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {lastFetch&&<span style={{fontSize:12,color:C.faint}}>Fetched {lastFetch}</span>}
          <button onClick={fetchNews} disabled={loading} style={{fontSize:12,padding:"2px 8px",background:C.bg3,
            border:"1px solid "+C.bd,borderRadius:4,color:C.dim,cursor:"pointer"}}>
            {loading?"⟳":"↻ Refresh"}
          </button>
        </div>
      </div>
      {err&&<div style={{fontSize:12,color:C.amber,padding:"8px",background:C.bg3,borderRadius:4,marginBottom:8}}>{err}</div>}
      {loading&&items.length===0?(<div style={{color:C.faint,fontSize:12,padding:"16px 0",textAlign:"center"}}>Loading news…</div>):null}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",columnGap:18,rowGap:0}}>
        {items.map((it,i)=>(
          <a key={it.link+i} href={it.link} target="_blank" rel="noopener noreferrer"
            style={{display:"block",padding:"8px 6px",borderBottom:"1px solid "+C.bg3,textDecoration:"none",
              borderRadius:3,transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{fontSize:12,color:C.tx,fontWeight:500,lineHeight:1.4,flex:1}}>{it.title}</div>
              <div style={{fontSize:12,color:C.faint,whiteSpace:"nowrap",marginTop:2}}>{fmtAge(it.pubDate)}</div>
            </div>
            {it.desc&&<div style={{fontSize:12,color:C.dim,marginTop:3,lineHeight:1.4}}>{it.desc}…</div>}
          </a>
        ))}
        {!loading&&items.length===0&&!err&&<div style={{color:C.faint,fontSize:12,padding:"16px 0",textAlign:"center"}}>No articles loaded.</div>}
      </div>
    </div>
  );
}


function NewsTicker() {
  const [items,setItems]=useState([]);
  useEffect(()=>{
    let alive=true;
    fetch("/api/shipping-news",{cache:"no-store"})
      .then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)))
      .then(j=>{if(alive)setItems((j.items||[]).slice(0,12));})
      .catch(()=>{});
    return()=>{alive=false;};
  },[]);
  if(!items.length)return null;
  const loop=[...items,...items];
  return(
    <div style={{background:"#081423",border:"1px solid rgba(88,166,255,.20)",borderRadius:7,overflow:"hidden",height:31,display:"flex",alignItems:"center"}}>
      <div style={{flexShrink:0,padding:"0 10px",fontSize:9,fontWeight:850,letterSpacing:".09em",color:"#58a6ff",textTransform:"uppercase",borderRight:"1px solid rgba(88,166,255,.18)",height:"100%",display:"flex",alignItems:"center"}}>Shipping news</div>
      <div style={{overflow:"hidden",minWidth:0,flex:1}}>
        <div className="signal-news-ticker" style={{display:"flex",width:"max-content",alignItems:"center",gap:28,whiteSpace:"nowrap"}}>
          {loop.map((it,i)=><a key={(it.link||it.title)+i} href={it.link} target="_blank" rel="noopener noreferrer" style={{fontSize:10.5,color:"rgba(210,230,255,.78)",textDecoration:"none"}}><b style={{color:"rgba(120,190,255,.95)",fontWeight:800}}>{it.source||"News"}</b>&nbsp;·&nbsp;{it.title}</a>)}
        </div>
      </div>
      <style>{`@keyframes signalTickerMove{from{transform:translateX(0)}to{transform:translateX(-50%)}} .signal-news-ticker{animation:signalTickerMove 55s linear infinite}.signal-news-ticker:hover{animation-play-state:paused}`}</style>
    </div>
  );
}

function CommodityTape({data}) {
  const items=data?.items||[];
  if(!items.length)return null;
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(112px,1fr))",gap:6}}>
      {items.map(x=><div key={x.id} style={{background:"#111f35",border:"1px solid rgba(58,130,246,.14)",borderRadius:6,padding:"7px 9px",minWidth:0}}>
        <div style={{fontSize:8.5,fontWeight:800,color:"rgba(120,160,220,.55)",textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.label}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:5,marginTop:2}}>
          <span style={{fontSize:15,fontWeight:850,color:"#e8f2ff"}}>{x.price!=null?Number(x.price).toLocaleString("en-US",{maximumFractionDigits:2}):"—"}</span>
          <span style={{fontSize:8,color:"rgba(120,160,220,.45)"}}>{x.unit||""}</span>
        </div>
        {x.changePct!=null&&<div style={{fontSize:8.5,color:Number(x.changePct)>=0?"#3fb950":"#ff6b6b",marginTop:1}}>{Number(x.changePct)>0?"+":""}{Number(x.changePct).toFixed(2)}%</div>}
      </div>)}
    </div>
  );
}

function VlccSparkline({history}) {
  if(!history?.length)return null;
  const W=360,H=72,PL=4,PR=4,PT=8,PB=8;
  const vals=history.map(x=>Number(x.tce)).filter(Number.isFinite);
  if(vals.length<2)return null;
  const mn=Math.min(...vals),mx=Math.max(...vals),range=mx-mn||1;
  const pts=history.map((x,i)=>{
    const px=PL+i/(history.length-1||1)*(W-PL-PR);
    const py=PT+(mx-Number(x.tce))/range*(H-PT-PB);
    return [px,py];
  });
  const path="M"+pts.map(p=>p.join(",")).join(" L");
  return <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:72,display:"block"}}>
    <path d={path} fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1">
      <animate attributeName="stroke-dashoffset" from="1" to="0" dur=".9s" fill="freeze"/>
    </path>
  </svg>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({vessels, cargoes, history}) {
  const [bunkers, setBunkers] = useState(null);
  const [bLoading, setBLoading] = useState(false);
  const [bError, setBError] = useState(null);
  const [bFetched, setBFetched] = useState(false);
  const [bunkerHistory, setBunkerHistory] = useState([]); // New state for graph
  const [positionMeta,setPositionMeta]=useState({count:null,updatedAt:null});
  const [commodities,setCommodities]=useState(null);
  const [vlcc,setVlcc]=useState(null);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const [{count,error:countErr},{data:last,error:lastErr}]=await Promise.all([
          supabase.from("positions_latest").select("updated_at",{count:"exact",head:true}),
          supabase.from("positions_latest").select("updated_at").not("updated_at","is",null).order("updated_at",{ascending:false}).limit(1)
        ]);
        if(countErr)throw countErr;if(lastErr)throw lastErr;
        if(alive)setPositionMeta({count:count??null,updatedAt:last?.[0]?.updated_at||null});
      }catch(e){console.error("positions_latest meta:",e);}
    })();
    fetch("/api/commodities",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(alive)setCommodities(j)}).catch(()=>{});
    fetch("/api/vlcc-earnings",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(alive)setVlcc(j)}).catch(()=>{});
    return()=>{alive=false;};
  },[]);

  const [regionHistory,setRegionHistory]=useState([]);
  const [regionHistoryLoading,setRegionHistoryLoading]=useState(true);
  const [regionHistoryError,setRegionHistoryError]=useState(null);
  useEffect(()=>{let alive=true;(async()=>{try{const {data,error}=await supabase.rpc("dashboard_region_history");if(error)throw error;if(alive)setRegionHistory(data||[]);}catch(e){if(alive)setRegionHistoryError(e.message||"RPC failed");}finally{if(alive)setRegionHistoryLoading(false);}})();return()=>{alive=false;};},[]);
  const [segmentFilter,setSegmentFilter]=useState("All");
  const [fixingSegmentHistory,setFixingSegmentHistory]=useState([]);
  const [fixingSegmentError,setFixingSegmentError]=useState(null);
  useEffect(()=>{let alive=true;(async()=>{try{const {data,error}=await supabase.rpc("dashboard_fixing_window_segments");if(error)throw error;if(alive)setFixingSegmentHistory(data||[]);}catch(e){if(alive)setFixingSegmentError(e.message||"RPC failed");}})();return()=>{alive=false;};},[]);

  // Part 5: Fetch all history entries from Supabase
  useEffect(() => {
    async function getHistory() {
      const { data } = await supabase
        .from("dashboard")
        .select("value")
        .ilike("key", "bunker-hist-%");
      if (data) {
        // Sort by date so the graph flows left to right
        const parsed = data.map(d => JSON.parse(d.value));
        setBunkerHistory(parsed.sort((a,b) => new Date(a.date) - new Date(b.date)));
      }
    }
    getHistory();
  }, []);

  // Part 4: Load the "Last Known" prices so the screen isn't blank on refresh
  useEffect(() => {
    async function loadSaved() {
      const { data } = await supabase
        .from("dashboard")
        .select("value")
        .eq("key", "last-bunker-prices")
        .maybeSingle();
      if (data) {
        setBunkers(JSON.parse(data.value));
        setBFetched(true);
      }
    }
    loadSaved();
  }, []);

  // ── Bunker prices: fetch live from PBT via web_search, fallback to last known ──
  async function fetchBunkersPBT() {
  setBLoading(true); setBError(null);
  try {
    const res = await fetch("/api/bunkers");
    const p = await res.json();
    const newBunkers = {
      date: p.date || new Date().toLocaleDateString("en-GB"),
      ARA_HSFO: p.ARA_HSFO, ARA_VLSFO: p.ARA_VLSFO, ARA_MGO: p.ARA_MGO,
      FUJ_HSFO: p.FUJ_HSFO, FUJ_VLSFO: p.FUJ_VLSFO, FUJ_MGO: p.FUJ_MGO,
      SIN_HSFO: p.SIN_HSFO, SIN_VLSFO: p.SIN_VLSFO, SIN_MGO: p.SIN_MGO,
    };

    setBunkers(newBunkers);
    setBFetched(true);

    // PERSIST: Save latest so refresh doesn't wipe it
    await supabase.from("dashboard").upsert({ key: "last-bunker-prices", value: JSON.stringify(newBunkers) }, { onConflict: "key" });

    // HISTORY: Save a snapshot for the graph
    const histKey = `bunker-hist-${newBunkers.date.replaceAll("/", "-").replaceAll(" ", "-")}`;
    await supabase.from("dashboard").upsert({ key: histKey, value: JSON.stringify(newBunkers) }, { onConflict: "key" });

  } catch(e) {
    setBError("Fetch failed. Using fallback.");
  } finally { setBLoading(false); }
}

  function BunkerChart({ history }) {
  if (!history || history.length < 2) return null;
  
  const W = 400, H = 120, P = 20;
  // We will track ARA VLSFO as the primary trend line
  const vals = history.map(h => h.ARA_VLSFO || 0);
  const min = Math.min(...vals) * 0.98;
  const max = Math.max(...vals) * 1.02;
  const range = max - min || 1;

  const points = history.map((h, i) => {
    const x = P + (i / (history.length - 1)) * (W - P * 2);
    const y = H - P - ((h.ARA_VLSFO - min) / range) * (H - P * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8 }}>
      <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>ARA VLSFO Trend (Last {history.length} updates)</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        <polyline fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinejoin="round" points={points} />
        {/* Min/Max Labels */}
        <text x={W - 5} y={P} fill="#8b949e" fontSize="10" textAnchor="end">${Math.round(max)}</text>
        <text x={W - 5} y={H - 5} fill="#8b949e" fontSize="10" textAnchor="end">${Math.round(min)}</text>
      </svg>
    </div>
  );
}
  
  // Fleet stats
  const openVessels = vessels.filter(v=>v.date&&v.openPort&&v.openPort!=="EMPLOYED");
  
  // Helper to calculate days between fileDate and open date
  const calcFixingWindow = (v) => {
    if(!v?.date)return null;
    const fileDt=parseDashboardDate(v.updatedAt||v.fileDate||new Date()); if(!fileDt)return null;
    const openDt=parseDashboardDate(v.date,fileDt); if(!openDt)return null;
    if(!/\b\d{2,4}\b/.test(String(v.date))){
      const c=[new Date(fileDt.getFullYear()-1,openDt.getMonth(),openDt.getDate()),new Date(fileDt.getFullYear(),openDt.getMonth(),openDt.getDate()),new Date(fileDt.getFullYear()+1,openDt.getMonth(),openDt.getDate())];
      c.sort((a,b)=>Math.abs(a-fileDt)-Math.abs(b-fileDt)); openDt.setTime(c[0].getTime());
    }
    const diff=Math.round((openDt-fileDt)/86400000);
    return Math.abs(diff)<=120?diff:null;
  };

  const withDays = openVessels.map(v => ({ ...v, days: calcFixingWindow(v) })).filter(v => v.days !== null && v.days >= 0);
  const fleetAvg = withDays.length ? Math.round(withDays.reduce((a,b)=>a+b.days,0)/withDays.length) : null;

  const regionByLabel={};
  for(const row of regionHistory||[]){
    const lab=String(row.snapshot_label||"").toUpperCase(), region=row.region, seg=row.segment||"Unknown";
    regionByLabel[lab]||={};
    regionByLabel[lab][region]||={ships:0,segments:{}};
    regionByLabel[lab][region].ships+=Number(row.ships||0);
    regionByLabel[lab][region].segments[seg]=(regionByLabel[lab][region].segments[seg]||0)+Number(row.ships||0);
  }
  const getRegionCount=(label,region)=>{
    const r=regionByLabel[label]?.[region];
    return r?Number(r.ships||0):0;
  };
  const currentRegionRows=REGION_ORDER.map(region=>({
    region,now:getRegionCount("NOW",region),d14:getRegionCount("14D",region),d30:getRegionCount("30D",region),d90:getRegionCount("90D",region)
  })).filter(x=>x.now||x.d14||x.d30||x.d90);
  const regionTotals={
    now:currentRegionRows.reduce((a,x)=>a+x.now,0),
    d14:currentRegionRows.reduce((a,x)=>a+x.d14,0),
    d30:currentRegionRows.reduce((a,x)=>a+x.d30,0),
    d90:currentRegionRows.reduce((a,x)=>a+x.d90,0)
  };

  const latestPositionUpdate=(()=>{const ds=(vessels||[]).map(v=>parseDashboardDate(v.updatedAt||v.fileDate)).filter(Boolean);return ds.length?new Date(Math.max(...ds.map(d=>d.getTime()))):null;})();

  // Build chart data from history + today
  const today = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"});
  const chartSnaps = [...history];
  // Patch today's live data in
  if (fleetAvg !== null) {
    const todayIdx = chartSnaps.findIndex(h=>h.date===today);
    const todayByOp = {};
    
    for(const v of openVessels){
      const d = calcFixingWindow(v);
      if(d === null || d < 0) continue;
      const op = (v.operator||"Unknown").trim();
      todayByOp[op] = (todayByOp[op]||[]).concat(d);
    }
    
    const todayOpAvgs = Object.fromEntries(Object.entries(todayByOp).map(([op,ds])=>[op,Math.round(ds.reduce((a,b)=>a+b,0)/ds.length)]));
    const todaySnap = {date:today,fixingAvg:fleetAvg,total:vessels.length,openCount:openVessels.length,byOp:todayOpAvgs};
    if (todayIdx>=0) chartSnaps[todayIdx]=todaySnap;
    else chartSnaps.push(todaySnap);
  }
  const chartData = chartSnaps.slice(-30).map(h=>{
    const raw=Number(h.fixingAvg);
    const avg=Number.isFinite(raw)&&Math.abs(raw)<=120?Math.abs(raw):null;
    return {date:h.date,avg,open:h.openCount,total:h.total};
  }).filter(h=>h.avg!=null);

  const fixingSegmentChartData=(()=>{
    const byDate={};
    for(const r of fixingSegmentHistory||[]){
      const d=r.snapshot_date; if(!d)continue;
      byDate[d]||={date:d};
      byDate[d][r.segment]=Number(r.avg_days);
    }
    return Object.values(byDate).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  })();
  const activeFixingSegments=(segmentFilter==="All"?SEGMENT_ORDER.filter(s=>s!=="All"): [segmentFilter]).filter(s=>fixingSegmentChartData.some(d=>d[s]!=null));

  // ── Ocean theme tokens ──────────────────────────────────────────────────────
  const D = {
    bg:       "#070f1c",
    bg2:      "#0d1a2e",
    bg3:      "#111f35",
    bg4:      "#162540",
    border:   "rgba(58,130,246,0.14)",
    border2:  "rgba(58,130,246,0.22)",
    tx:       "#e8f2ff",
    dim:      "rgba(160,200,255,0.6)",
    faint:    "rgba(120,160,220,0.45)",
    blue:     "#58a6ff",
    green:    "#3fb950",
    amber:    "#f5a623",
    purple:   "#a78bfa",
    red:      "#ff6b6b",
    pink:     "#fd79a8",
  };

  const card = (label, val, sub, col) => (
    <div style={{background:D.bg3,border:"1px solid "+D.border2,borderRadius:8,padding:"12px 18px",flex:"1 1 120px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:col||D.blue,opacity:0.7,borderRadius:"8px 8px 0 0"}}/>
      <div style={{fontSize:10,fontWeight:700,color:D.faint,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>{label}</div>
      <div style={{fontSize:26,fontWeight:800,color:col||D.tx,lineHeight:1}}>{val??"—"}</div>
      {sub&&<div style={{fontSize:11,color:D.faint,marginTop:4}}>{sub}</div>}
    </div>
  );

  const secHead = t => (
    <div style={{fontSize:11,fontWeight:700,color:D.faint,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
      <span style={{display:"inline-block",width:2,height:12,background:D.blue,borderRadius:2,opacity:0.8}}/>
      {t}
    </div>
  );

  const panel = (children, extraStyle={}) => (
    <div style={{background:D.bg2,border:"1px solid "+D.border,borderRadius:10,padding:"16px 18px",position:"relative",overflow:"hidden",...extraStyle}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(30,100,200,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(30,100,200,0.03) 1px,transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1}}>{children}</div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,background:D.bg,borderRadius:10,padding:"16px",fontFamily:"Inter,sans-serif"}}>

      {/* ── Hero banner ── */}
      <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:"#070f1c",border:"1px solid "+D.border2}}>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 80% 100% at 75% 100%,#0d2a4a 0%,#070f1c 65%)"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(30,100,200,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(30,100,200,0.06) 1px,transparent 1px)",backgroundSize:"48px 48px"}}/>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 50% 60% at 80% 70%,rgba(30,90,180,0.25) 0%,transparent 70%)"}}/>
        {/* ship arcs */}
        <svg style={{position:"absolute",bottom:0,right:0,width:"55%",height:"100%",opacity:0.12}} viewBox="0 0 500 200" preserveAspectRatio="xMaxYMax slice">
          <ellipse cx="420" cy="220" rx="300" ry="160" fill="none" stroke="rgba(88,166,255,1)" strokeWidth="1"/>
          <ellipse cx="420" cy="220" rx="200" ry="105" fill="none" stroke="rgba(88,166,255,1)" strokeWidth="1"/>
          <ellipse cx="420" cy="220" rx="110" ry="58" fill="none" stroke="rgba(88,166,255,1)" strokeWidth="0.8"/>
          <circle cx="120" cy="160" r="2" fill="rgba(88,200,255,1)"/>
          <circle cx="260" cy="175" r="2" fill="rgba(20,200,120,1)"/>
          <circle cx="390" cy="168" r="2" fill="rgba(88,166,255,1)"/>
          <path d="M120,160 Q190,140 260,175" fill="none" stroke="rgba(88,200,255,0.8)" strokeWidth="0.8" strokeDasharray="4,3"/>
          <path d="M260,175 Q325,155 390,168" fill="none" stroke="rgba(20,200,120,0.8)" strokeWidth="0.8" strokeDasharray="4,3"/>
        </svg>
        <div style={{position:"relative",zIndex:2,padding:"22px 26px 18px"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:"rgba(120,180,255,0.55)",marginBottom:6}}>Signal — Tanker Intelligence</div>
          <div style={{fontSize:22,fontWeight:800,color:"#e8f2ff",lineHeight:1.2,marginBottom:4}}>Market Dashboard</div>
          <div style={{fontSize:12,color:"rgba(140,190,255,0.5)"}}>
            Clean products · UKC / Med / TA ·&nbsp;
            {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
          </div>
        </div>
      </div>

      <NewsTicker/>

      {/* ── KPI row ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(240px,360px)",gap:8}}>
        {card(
          "Positions latest",
          positionMeta.count??vessels.length,
          positionMeta.updatedAt
            ? "ships · updated "+new Date(positionMeta.updatedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+" "+new Date(positionMeta.updatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})
            : `${openVessels.length} currently open`,
          D.blue
        )}
      </div>

      {/* ── Tanker market tape ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.65fr) minmax(320px,.65fr)",gap:12}}>
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              {secHead("Energy / tanker-linked commodities")}
              <span style={{fontSize:9,color:D.faint}}>{commodities?.updatedAt?new Date(commodities.updatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):""}</span>
            </div>
            {commodities?<CommodityTape data={commodities}/>:<div style={{fontSize:11,color:D.faint,padding:"8px 0"}}>Loading commodity prices…</div>}
          </>,
          {minWidth:0}
        )}
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              {secHead("VLCC · TD3C MEG → China")}
              <span style={{fontSize:9,color:D.faint}}>Baltic weekly</span>
            </div>
            {vlcc?.latest?<div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:10,alignItems:"center"}}>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:D.tx}}>${Math.round(Number(vlcc.latest.tce)/1000)}k<span style={{fontSize:10,color:D.faint,fontWeight:600}}>/day</span></div>
                <div style={{fontSize:9,color:D.faint,marginTop:2}}>{vlcc.latest.date||""} · {vlcc.latest.ws!=null?"WS "+vlcc.latest.ws:"TD3C"}</div>
              </div>
              <VlccSparkline history={vlcc.history||[]}/>
            </div>:<div style={{fontSize:11,color:D.faint,padding:"8px 0"}}>Loading VLCC earnings…</div>}
          </>,
          {minWidth:0}
        )}
      </div>

      {/* ── Fixing window + bunker row ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(620px,1.45fr) minmax(430px,.85fr)",gap:12}}>
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              {secHead("Fixing window by vessel size · days until open")}
              <span style={{fontSize:9,color:D.faint}}>past positions · negative values excluded</span>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"-2px 0 8px"}}>
              {SEGMENT_ORDER.map(seg=>{const active=segmentFilter===seg;return <button key={seg} onClick={()=>setSegmentFilter(seg)} style={{background:active?"rgba(88,166,255,.18)":D.bg3,border:"1px solid "+(active?D.blue:D.border2),borderRadius:5,color:active?D.tx:D.dim,fontFamily:"inherit",fontSize:10,fontWeight:active?800:600,padding:"4px 8px",cursor:"pointer"}}>{seg}</button>})}
            </div>
            {fixingSegmentError
              ? <div style={{fontSize:10,color:D.red,padding:"8px 0"}}>Fixing-window history unavailable: {fixingSegmentError}</div>
              : fixingSegmentChartData.length<2
                ? <div style={{color:D.faint,fontSize:12,padding:"24px 0",textAlign:"center"}}>Loading segment fixing-window history…</div>
                : <SegmentFWChart data={fixingSegmentChartData} segments={activeFixingSegments} colors={SEGMENT_COLORS}/>}
          </>,
          {minWidth:0}
        )}
        {panel(
          <>
            {secHead("Bunker prices USD/mt — PBT International")}
            {!bFetched&&!bLoading&&<div style={{textAlign:"center",padding:"12px 0"}}><div style={{fontSize:11,color:D.faint,marginBottom:8}}>ARA · Fujairah · Singapore</div><button onClick={fetchBunkersPBT} style={{background:"rgba(88,166,255,.12)",border:"1px solid rgba(88,166,255,.32)",borderRadius:5,color:D.blue,fontWeight:700,fontSize:11,padding:"5px 12px",cursor:"pointer"}}>Fetch live from PBT</button></div>}
            {bLoading&&<div style={{color:D.blue,fontSize:11,padding:"12px",textAlign:"center"}}>⟳ Fetching…</div>}
            {bError&&<div style={{color:D.red,fontSize:11,padding:"6px 0"}}>{bError}</div>}
            {bunkers&&<>
              <div style={{fontSize:9,color:D.faint,marginBottom:6}}>Updated {bunkers.date}</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{background:D.bg4}}><th style={{padding:"5px 7px",textAlign:"left",color:D.faint}}>PORT</th><th style={{padding:"5px 7px",textAlign:"right",color:D.amber}}>HSFO</th><th style={{padding:"5px 7px",textAlign:"right",color:D.green}}>VLSFO</th><th style={{padding:"5px 7px",textAlign:"right",color:D.blue}}>MGO</th></tr></thead>
                <tbody>{[["ARA",bunkers.ARA_HSFO,bunkers.ARA_VLSFO,bunkers.ARA_MGO],["Fujairah",bunkers.FUJ_HSFO,bunkers.FUJ_VLSFO,bunkers.FUJ_MGO],["Singapore",bunkers.SIN_HSFO,bunkers.SIN_VLSFO,bunkers.SIN_MGO]].map(([port,a,v,m],i)=><tr key={port} style={{background:i%2?D.bg4:"transparent",borderBottom:"1px solid "+D.border}}><td style={{padding:"6px 7px",color:D.dim,fontWeight:700}}>{port}</td><td style={{padding:"6px 7px",textAlign:"right",color:D.amber,fontWeight:800}}>{a?"$"+a:"—"}</td><td style={{padding:"6px 7px",textAlign:"right",color:D.green,fontWeight:800}}>{v?"$"+v:"—"}</td><td style={{padding:"6px 7px",textAlign:"right",color:D.blue,fontWeight:800}}>{m?"$"+m:"—"}</td></tr>)}</tbody>
              </table>
              <button onClick={fetchBunkersPBT} style={{marginTop:6,background:"none",border:"1px solid "+D.border,borderRadius:4,color:D.faint,fontSize:10,padding:"2px 8px",cursor:"pointer"}}>↻ Refresh</button>
            </>}
          </>,
          {minWidth:0}
        )}
      </div>

      {/* ── Regional fleet history ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(640px,1.1fr) minmax(520px,.9fr)",gap:12}}>
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              {secHead("Open fleet by main region · vessel count")}
              <span style={{fontSize:9,color:D.faint}}>historical totals</span>
            </div>
            {regionHistoryLoading?<div style={{fontSize:11,color:D.faint,padding:"12px 0"}}>Loading historical fleet…</div>:regionHistoryError?<div style={{fontSize:10,color:D.red,padding:"8px 0"}}>Run updated Supabase RPC SQL: {regionHistoryError}</div>:<>
              <div style={{display:"grid",gridTemplateColumns:"minmax(190px,1fr) 64px 64px 64px 64px",gap:8,padding:"1px 2px 7px",fontSize:10.5,fontWeight:900,color:D.dim,textTransform:"uppercase",letterSpacing:".04em"}}><span>Region</span><span style={{textAlign:"right",color:D.tx}}>NOW</span><span style={{textAlign:"right"}}>14D</span><span style={{textAlign:"right"}}>30D</span><span style={{textAlign:"right"}}>90D</span></div>
              {currentRegionRows.map(({region,now,d14,d30,d90})=><div key={region} style={{display:"grid",gridTemplateColumns:"minmax(190px,1fr) 64px 64px 64px 64px",gap:8,alignItems:"center",padding:"6px 2px",borderTop:"1px solid "+D.border}}><span style={{fontSize:11,fontWeight:800,color:REGION_COLORS[region]||D.dim}}>{region}</span><span style={{fontSize:11,textAlign:"right",color:D.tx,fontWeight:850}}>{now}</span><span style={{fontSize:10,textAlign:"right",color:D.dim}}>{d14}</span><span style={{fontSize:10,textAlign:"right",color:D.dim}}>{d30}</span><span style={{fontSize:10,textAlign:"right",color:D.dim}}>{d90}</span></div>)}
              <div style={{display:"grid",gridTemplateColumns:"minmax(190px,1fr) 64px 64px 64px 64px",gap:8,padding:"7px 2px 0",borderTop:"1px solid "+D.border2,fontSize:10,fontWeight:850}}><span style={{color:D.faint}}>TOTAL FLEET</span><span style={{textAlign:"right",color:D.tx}}>{regionTotals.now}</span><span style={{textAlign:"right",color:D.dim}}>{regionTotals.d14}</span><span style={{textAlign:"right",color:D.dim}}>{regionTotals.d30}</span><span style={{textAlign:"right",color:D.dim}}>{regionTotals.d90}</span></div>
            </>}
          </>,
          {minWidth:0}
        )}
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>{secHead("Regional tonnage supply · now vs 30d")}<span style={{fontSize:9,color:D.faint}}>fleet totals</span></div>
            <RegionCompareChart rows={currentRegionRows} colors={REGION_COLORS}/>
            <div style={{display:"flex",gap:14,marginTop:8,fontSize:10,color:D.faint}}><span><b style={{color:"#73c7ff"}}>■</b> Current</span><span><b style={{color:"rgba(190,202,220,.65)"}}>■</b> 30 days ago</span></div>
          </>,
          {minWidth:0}
        )}
      </div>

      {/* ── News Feed ── */}
      <NewsFeed/>

      {/* ── WS / FFA tracker ── */}
      <WSTracker/>

    </div>
  );
}


// ─── SVG charts (no dependencies) ────────────────────────────────────────────
function SegmentFWChart({data,segments,colors}) {
  const W=760,H=220,PL=42,PR=22,PT=12,PB=28;
  const iW=W-PL-PR,iH=H-PT-PB;
  const vals=data.flatMap(d=>segments.map(s=>d[s])).filter(v=>v!=null&&v>=0);
  if(!vals.length)return null;
  const mn=0,mx=Math.max(7,Math.ceil(Math.max(...vals)+2)),range=mx||1;
  const xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);
  return <div>
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxHeight:H,display:"block"}}>
      {[0,.5,1].map(fr=>{const v=Math.round(mx*(1-fr)),y=PT+fr*iH;return <g key={fr}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke={C.bd2}/><text x={PL-5} y={y+4} fill={C.faint} fontSize="9" textAnchor="end">{v}d</text></g>})}
      {segments.map(seg=>{let path="";data.forEach((d,i)=>{const v=d[seg];if(v==null||v<0)return;const p=[xs[i],PT+iH-(v-mn)/range*iH];path+=(path?"L":"M")+p.join(",")});return path?<path key={seg} d={path} fill="none" stroke={colors[seg]||C.blue} strokeWidth="1.8" strokeLinejoin="round" opacity=".92" pathLength="1" strokeDasharray="1" strokeDashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" dur=".85s" fill="freeze"/></path>:null})}
      {data.map((d,i)=>(i===0||i===data.length-1||data.length<=8)?<text key={i} x={xs[i]} y={H-7} fill={C.faint} fontSize="8" textAnchor="middle">{fmtDateShort(d.date)}</text>:null)}
    </svg>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:2}}>{segments.map(s=><span key={s} style={{fontSize:10,color:colors[s]||C.blue}}>● {s}</span>)}</div>
  </div>;
}

function RegionCompareChart({rows,colors}) {
  if(!rows?.length)return <div style={{color:C.faint,fontSize:11,padding:20,textAlign:"center"}}>No regional data.</div>;
  const max=Math.max(1,...rows.flatMap(r=>[r.now||0,r.d30||0]));
  return <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:3}}>
    {rows.map(r=><div key={r.region} style={{display:"grid",gridTemplateColumns:"145px 1fr 38px",gap:8,alignItems:"center"}}>
      <span style={{fontSize:10,fontWeight:800,color:colors[r.region]||C.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.region}</span>
      <div style={{display:"grid",gap:3}}>
        <div style={{height:7,background:C.bg4,borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:Math.max(r.now?2:0,r.now/max*100)+"%",background:"#73c7ff",borderRadius:99}}/></div>
        <div style={{height:7,background:C.bg4,borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:Math.max(r.d30?2:0,r.d30/max*100)+"%",background:"rgba(190,202,220,.62)",borderRadius:99}}/></div>
      </div>
      <div style={{fontSize:9,textAlign:"right",lineHeight:1.45}}><div style={{color:C.tx,fontWeight:800}}>{r.now}</div><div style={{color:C.faint}}>{r.d30}</div></div>
    </div>)}
  </div>;
}

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
          return <path key={op} d={path} fill="none" stroke={colors?.[op] || colors?.[oi] || C.blue} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85"/>;
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
        {ops.map((op,i)=>(<span key={op} style={{fontSize:12,color:colors?.[op] || colors?.[i] || C.blue}}><span style={{fontWeight:700}}>●</span> {op}</span>))}
      </div>
    </div>
  );
}
// --- Date formatter (21 Jan)
function fmtDateShort(d){
  if(!d) return "";
  const s=String(d).trim();
  // Already "13 Mar" or "13 Mar 26" — return as-is
  if(/^\d{1,2}\s[A-Za-z]{3}/.test(s)) return s.slice(0,6);
  // ISO date string
  const x = new Date(s);
  if(isNaN(x)) return s;
  return x.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
}
// ─── Cargo schema normaliser ──────────────────────────────────────────────────

export { WSTracker, NewsFeed, Dashboard, FWChart, OpChart };
export default Dashboard;
