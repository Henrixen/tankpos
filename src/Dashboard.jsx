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


// ── Chart quality helpers ─────────────────────────────────────────────────────
function chartDate(v){ const d=parseDashboardDate(v); return d&&!isNaN(d)?d:null; }
function horizonRows(rows,period,dateKey="date"){
  const a=[...(rows||[])].filter(Boolean); if(!a.length||period==="ALL")return a;
  const dates=a.map(x=>chartDate(x?.[dateKey])).filter(Boolean); if(!dates.length)return a;
  const end=new Date(Math.max(...dates.map(Number))); const start=new Date(end);
  if(period==="7D")start.setDate(start.getDate()-7); else if(period==="14D")start.setDate(start.getDate()-14);
  else if(period==="1M")start.setMonth(start.getMonth()-1); else if(period==="3M")start.setMonth(start.getMonth()-3);
  else if(period==="6M")start.setMonth(start.getMonth()-6); else if(period==="1Y")start.setFullYear(start.getFullYear()-1);
  return a.filter(x=>{const d=chartDate(x?.[dateKey]);return !d||d>=start;});
}
function cleanIsolatedValues(values){
  const out=values.map(v=>Number.isFinite(Number(v))?Number(v):null);
  if(out.length<3)return out;
  for(let i=1;i<out.length-1;i++){
    const a=out[i-1],b=out[i],c=out[i+1]; if(a==null||b==null||c==null)continue;
    const neighbour=(a+c)/2, scale=Math.max(Math.abs(neighbour),1);
    const neighboursAgree=Math.abs(a-c)/scale<0.22;
    const isolated=Math.abs(b-neighbour)/scale>0.38;
    if(neighboursAgree&&isolated)out[i]=neighbour; // only suppress one-off spikes; sustained moves remain
  }
  return out;
}
function cleanPresentationValues(values){
  const raw=values.map(v=>Number.isFinite(Number(v))?Number(v):null);
  if(raw.length<5)return cleanIsolatedValues(raw);
  const out=[...raw];
  for(let i=0;i<raw.length;i++){
    if(raw[i]==null)continue;
    const neighbours=[];
    for(let j=Math.max(0,i-2);j<=Math.min(raw.length-1,i+2);j++){
      if(j!==i&&raw[j]!=null)neighbours.push(raw[j]);
    }
    if(neighbours.length<3)continue;
    const sorted=[...neighbours].sort((a,b)=>a-b);
    const median=sorted[Math.floor(sorted.length/2)];
    const scale=Math.max(Math.abs(median),1);
    const deviation=Math.abs(raw[i]-median)/scale;
    const prev=raw[i-1], next=raw[i+1];
    // Only replace an isolated point. If an adjacent observation confirms the
    // same move, keep it as a genuine market change.
    const prevSupports=prev!=null&&Math.abs(prev-raw[i])/scale<0.22;
    const nextSupports=next!=null&&Math.abs(next-raw[i])/scale<0.22;
    if(deviation>0.42&&!prevSupports&&!nextSupports)out[i]=median;
  }
  return cleanIsolatedValues(out);
}
function smoothPath(points){
  const p=points.filter(Boolean); if(!p.length)return ""; if(p.length===1)return `M${p[0][0]},${p[0][1]}`;
  // Catmull-Rom -> cubic Bezier. Unlike the old midpoint quadratic curve,
  // this smooth curve passes THROUGH every observation, so hover dots sit
  // exactly on the displayed line.
  let d=`M${p[0][0]},${p[0][1]}`;
  for(let i=0;i<p.length-1;i++){
    const p0=p[i-1]||p[i], p1=p[i], p2=p[i+1], p3=p[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function HorizonButtons({value,onChange,options=["7D","14D","1M","3M","ALL"]}){
  return <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{options.map(x=><button key={x} onClick={()=>onChange(x)} style={{fontSize:8.5,fontWeight:800,padding:"2px 6px",borderRadius:4,border:"1px solid "+(value===x?C.blue:C.bd),background:value===x?"rgba(88,166,255,.14)":"transparent",color:value===x?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>{x}</button>)}</div>;
}

function WSTracker() {
  const [data,    setData]    = useState(null);
  const [pasteText, setPaste] = useState("");
  const [img,       setImg]    = useState(null);
  const [parsing,  setParsing] = useState(false);
  const [status,   setStatus]  = useState(null);
  const [wsView,setWsView] = useState("graph");
  const [wsPeriod,setWsPeriod] = useState("3M");
  const [wsNote,   setWsNote]  = useState("");
  const [wsNoteImg,setWsNoteImg] = useState(null);
  const [wsNoteSavedAt,setWsNoteSavedAt] = useState(null);
  const [wsNoteSaveState,setWsNoteSaveState] = useState("loading");
  const wsNoteLoadedRef = useRef(false);
  const wsFileRef = useRef(null);

  function compressNoteImage(file){
    return new Promise((resolve,reject)=>{
      if(!file){resolve(null);return;}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("Could not read image"));
      reader.onload=e=>{
        const im=new Image();
        im.onerror=()=>reject(new Error("Could not decode image"));
        im.onload=()=>{
          const maxW=520,maxH=320;
          const scale=Math.min(1,maxW/im.width,maxH/im.height);
          const w=Math.max(1,Math.round(im.width*scale));
          const h=Math.max(1,Math.round(im.height*scale));
          const canvas=document.createElement("canvas");
          canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext("2d");
          ctx.drawImage(im,0,0,w,h);
          resolve(canvas.toDataURL("image/jpeg",0.72));
        };
        im.src=e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function setNoteImageFile(file){
    if(!file)return;
    try{
      const dataUrl=await compressNoteImage(file);
      setWsNoteImg(dataUrl);
    }catch(e){
      console.error("WS note image:",e);
      setWsNoteSaveState("error");
    }
  }

  // Load latest market note from Supabase. Supports both the old plain-text row
  // and the new JSON payload with an optional compressed thumbnail.
  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const {data:row,error}=await supabase.from("dashboard").select("value").eq("key","ws-note").maybeSingle();
        if(error) throw error;
        if(!alive)return;
        const raw=row?.value;
        if(raw){
          try{
            const parsed=typeof raw==="string"?JSON.parse(raw):raw;
            if(parsed && typeof parsed==="object"){
              setWsNote(parsed.text||"");
              setWsNoteImg(parsed.imageDataUrl||null);
              setWsNoteSavedAt(parsed.updatedAt||null);
            }else{
              setWsNote(String(raw||""));
            }
          }catch{
            setWsNote(String(raw||""));
          }
        }
        setWsNoteSaveState("saved");
      }catch(e){
        console.error("Load WS note:",e);
        if(alive)setWsNoteSaveState("error");
      }finally{
        wsNoteLoadedRef.current=true;
      }
    })();
    return()=>{alive=false;};
  },[]);

  // Debounced cloud save so typing does not fire one Supabase request per keypress.
  useEffect(()=>{
    if(!wsNoteLoadedRef.current)return;
    setWsNoteSaveState("saving");
    const timer=setTimeout(async()=>{
      const updatedAt=new Date().toISOString();
      const payload={text:wsNote||"",imageDataUrl:wsNoteImg||null,updatedAt};
      const {error}=await supabase.from("dashboard").upsert(
        {key:"ws-note",value:JSON.stringify(payload)},
        {onConflict:"key"}
      );
      if(error){
        console.error("Save WS note:",error);
        setWsNoteSaveState("error");
      }else{
        setWsNoteSavedAt(updatedAt);
        setWsNoteSaveState("saved");
      }
    },700);
    return()=>clearTimeout(timer);
  },[wsNote,wsNoteImg]);

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
      const prevHistory = (Array.isArray(existing.history)?existing.history:[]).filter(h=>h.date!==today);
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
  const histRows = Array.isArray(data?.history) ? data.history : [];
  const histData = [...histRows]
    .sort((a,b)=>parseChartDate(a.date)-parseChartDate(b.date))
    .slice(-30);
  const routeColors = {TC2:C.blue,TC6:C.green,TC14:C.amber,TC23:C.purple,TC178:"#ff9f43"};

  const secHead = t=>(<div style={{fontSize:12.5,fontWeight:900,color:"rgba(130,180,245,.82)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:9,display:"flex",alignItems:"center",gap:7}}><span style={{display:"inline-block",width:2,height:14,background:C.blue,borderRadius:2}}/>{t}</div>);
  const th2 = {padding:"5px 8px",background:C.bg3,color:C.faint,fontWeight:700,fontSize:12,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"};
  const td2 = {padding:"5px 8px",fontSize:12,textAlign:"right",whiteSpace:"nowrap",borderBottom:"1px solid "+C.bg2};

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"12px 14px",height:"100%",boxSizing:"border-box",display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8}}>
        {secHead("Worldscale Spot + FFA")}
        <div style={{display:"flex",gap:4}}>
          {[["graph","Graph"],["table","Table"],["parse","Parse"]].map(([v,l])=><button key={v} onClick={()=>setWsView(v)} style={{
            fontSize:9.5,fontWeight:800,padding:"4px 9px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",
            border:"1px solid "+(wsView===v?C.blue:C.bd),
            background:wsView===v?"rgba(88,166,255,.14)":C.bg3,
            color:wsView===v?C.tx:C.dim
          }}>{l}</button>)}
        </div>
      </div>

      <div style={{flex:1,minHeight:0}}>
        {wsView==="graph"&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}><HorizonButtons value={wsPeriod} onChange={setWsPeriod}/></div>
          <div style={{display:"grid",gridTemplateRows:"1fr 1fr",gap:8,flex:1,minHeight:0}}>
            <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"8px 10px",minHeight:0,display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:11.5,fontWeight:900,color:C.green,textTransform:"uppercase",marginBottom:3,textAlign:"center",letterSpacing:".06em"}}>Handy</div>
              <div style={{flex:1,minHeight:0}}>
                {histData.length>=2
                  ? <WSChart data={histData} routes={ROUTES.filter(r=>["TC6","TC23"].includes(r.id))} colors={routeColors} fill/>
                  : <div style={{fontSize:11,color:C.faint,padding:12}}>Paste updates to build history.</div>}
              </div>
            </div>
            <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"8px 10px",minHeight:0,display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:11.5,fontWeight:900,color:C.blue,textTransform:"uppercase",marginBottom:3,textAlign:"center",letterSpacing:".06em"}}>MR</div>
              <div style={{flex:1,minHeight:0}}>
                {histData.length>=2
                  ? <WSChart data={histData} routes={ROUTES.filter(r=>["TC2","TC14"].includes(r.id))} colors={routeColors} fill/>
                  : <div style={{fontSize:11,color:C.faint,padding:12}}>Paste updates to build history.</div>}
              </div>
            </div>
          </div>
          </div>
        )}

        {wsView==="table"&&(
          <div style={{display:"grid",gridTemplateRows:"auto minmax(0,1fr)",gap:8,height:"100%",minHeight:0}}>
            <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"8px 10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontSize:10,color:C.faint,fontWeight:900,textTransform:"uppercase",letterSpacing:".06em"}}>Current spot + FFA</div>
                <span style={{fontSize:9,color:C.faint,whiteSpace:"nowrap"}}>{data?.lastUpdate||"—"}</span>
              </div>
              {data ? <table style={{borderCollapse:"collapse",fontSize:11.5,width:"100%"}}>
                <thead><tr>
                  <th style={{...th2,textAlign:"left"}}>Route</th>
                  <th style={th2}>Spot</th>
                  <th style={th2}>Day</th>
                </tr></thead>
                <tbody>{ROUTES.map(r=>{
                  const q=data.spot?.[r.id],chg=q?.change,cc=chg>0?C.green:chg<0?C.red:C.dim;
                  return <tr key={r.id}>
                    <td style={{...td2,textAlign:"left",fontWeight:800,color:routeColors[r.id]||C.blue}}>{r.id}</td>
                    <td style={{...td2,fontWeight:800,color:C.tx}}>{q?.ws!=null?q.ws.toFixed(2):"—"}</td>
                    <td style={{...td2,color:cc,fontWeight:700}}>{chg!=null?(chg>=0?"+":"")+chg.toFixed(2):"—"}</td>
                  </tr>;
                })}</tbody>
              </table> : <div style={{fontSize:11,color:C.faint,padding:"14px 4px"}}>No parsed market data yet.</div>}
            </div>

            <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"9px 10px",minHeight:0,display:"flex",flexDirection:"column"}}>
              <div style={{fontSize:10,color:C.dim,marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center",fontWeight:800,textTransform:"uppercase",letterSpacing:".05em",gap:8}}>
                <span>Daily market notes / gossip</span>
                <span style={{fontSize:9,textTransform:"none",letterSpacing:0,fontWeight:500,color:wsNoteSaveState==="error"?C.red:wsNoteSaveState==="saving"?C.amber:C.faint,whiteSpace:"nowrap"}}>
                  {wsNoteSaveState==="saving"?"Saving…":wsNoteSaveState==="error"?"Save failed":wsNoteSavedAt?"Saved "+new Date(wsNoteSavedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"Saved in Supabase"}
                </span>
              </div>
              <textarea value={wsNote} onChange={e=>setWsNote(e.target.value)}
                onPaste={e=>{const imageItem=Array.from(e.clipboardData?.items||[]).find(it=>it.type?.startsWith("image/"));if(imageItem){e.preventDefault();setNoteImageFile(imageItem.getAsFile());}}}
                placeholder="Latest gossip, broker colour, market direction, cargo rumours, owner sentiment… paste a screenshot directly if useful."
                style={{width:"100%",flex:1,minHeight:92,background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:10.5,padding:"7px 8px",resize:"none",boxSizing:"border-box",outline:"none"}}/>
              {wsNoteImg&&<div style={{display:"flex",alignItems:"center",gap:7,marginTop:6}}>
                <div style={{position:"relative",height:40,width:68,borderRadius:4,overflow:"hidden",border:"1px solid "+C.bd,background:C.bg2}}>
                  <img src={wsNoteImg} alt="Market note" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                  <button onClick={()=>setWsNoteImg(null)} title="Remove image" style={{position:"absolute",top:1,right:1,width:15,height:15,borderRadius:"50%",border:"none",background:"rgba(0,0,0,.72)",color:"#fff",fontSize:9,lineHeight:"15px",padding:0,cursor:"pointer"}}>×</button>
                </div>
                <span style={{fontSize:9,color:C.faint}}>pasted thumbnail stored with note</span>
              </div>}
            </div>
          </div>
        )}

        {wsView==="parse"&&(
          <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:6,padding:"10px",height:"100%",minHeight:0,boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
            <div style={{fontSize:10,color:C.dim,marginBottom:5,fontWeight:800,textTransform:"uppercase",letterSpacing:".05em"}}>Paste WS / FFA</div>
            {img?.dataUrl&&<div style={{position:"relative",marginBottom:5}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:58,objectFit:"cover",borderRadius:3,display:"block"}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:"50%",width:18,height:18,fontSize:10,cursor:"pointer"}}>✕</button></div>}
            <textarea value={pasteText} onChange={e=>setPaste(e.target.value)}
              onPaste={e=>{for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}}
              placeholder={"TC2 127.81(+1.87)  FEB/26 130.50 · TC14 270.71(+8.57) · or paste screenshot"}
              style={{width:"100%",flex:1,minHeight:140,background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:10.5,padding:"8px",resize:"none",outline:"none",boxSizing:"border-box",overflowY:"hidden"}}/>
            <input ref={wsFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
            <div style={{display:"flex",gap:5,marginTop:7,alignItems:"center",flexShrink:0}}>
              <button onClick={parseWS} disabled={parsing} style={{background:parsing?"rgba(88,166,255,.06)":"rgba(88,166,255,.11)",border:"1px solid rgba(88,166,255,.36)",borderRadius:4,color:C.blue,fontFamily:"inherit",fontWeight:700,fontSize:10.5,padding:"5px 11px",cursor:parsing?"default":"pointer",whiteSpace:"nowrap"}}>{parsing?"⟳ Parsing…":"▶ Parse & Save"}</button>
              <button onClick={()=>wsFileRef.current?.click()} style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"4px 7px",fontFamily:"inherit",fontSize:10.5,cursor:"pointer"}}>📷</button>
              {status&&<div style={{fontSize:9.5,color:sc,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{status.m}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WSChart({data,routes,colors,fill=false}) {
  const [hover,setHover]=useState(null);
  const W=1120,H=260,PL=68,PR=68,PT=10,PB=30,iW=W-PL-PR,iH=H-PT-PB;
  const series={};
  routes.forEach(r=>series[r.id]=cleanIsolatedValues(data.map(d=>d.spot?.[r.id]?.ws)));
  const allVals=routes.flatMap(r=>series[r.id]).filter(v=>v!=null);
  if(!allVals.length)return null;
  const mn=Math.min(...allVals)*0.95,mx=Math.max(...allVals)*1.05,range=mx-mn||1;
  const xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);
  const onMove=e=>{const box=e.currentTarget.getBoundingClientRect();const x=(e.clientX-box.left)/box.width*W;let idx=0,best=Infinity;xs.forEach((v,i)=>{const d=Math.abs(v-x);if(d<best){best=d;idx=i;}});setHover(idx);};
  const hi=hover!=null?hover:null;
  return <div style={{height:fill?"100%":"auto",display:"flex",flexDirection:"column",minHeight:0,position:"relative"}}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={()=>setHover(null)} style={{width:"100%",height:fill?"100%":260,minHeight:0,display:"block",flex:fill?1:"0 0 auto",cursor:"crosshair"}}>
      {[0,.5,1].map(t=>{const y=PT+t*iH,v=Math.round(mx-t*range);return <g key={t}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke={C.bd2}/><text x={PL-4} y={y+4} fill="#fff" fontSize="12" fontWeight="700" textAnchor="end">{v}</text></g>})}
      {routes.map(r=>{const pts=series[r.id].map((v,i)=>v!=null?[xs[i],PT+iH-(v-mn)/range*iH]:null);const valid=pts.filter(Boolean);if(valid.length<2)return null;const last=valid.at(-1);return <g key={r.id}><path d={smoothPath(valid)} fill="none" stroke={colors[r.id]||C.dim} strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>{last&&<text x={Math.min(W-PR+8,last[0]+7)} y={last[1]+4} fill={colors[r.id]||C.dim} fontSize="11" fontWeight="800">{r.id}</text>}{hi!=null&&pts[hi]&&<circle cx={pts[hi][0]} cy={pts[hi][1]} r="4.5" fill={colors[r.id]||C.dim} stroke="#fff" strokeWidth="1.5"/>}</g>})}
      {hi!=null&&<line x1={xs[hi]} x2={xs[hi]} y1={PT} y2={PT+iH} stroke="rgba(255,255,255,.45)" strokeDasharray="4 4"/>}
      {data.map((d,i)=>(i===0||i===data.length-1||data.length<9)&&<text key={i} x={xs[i]} y={H-PB+15} fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">{(d.date||"").split(" ").slice(0,2).join(" ")}</text>)}
    </svg>
    {hi!=null&&<div style={{position:"absolute",top:10,left:`${Math.min(78,Math.max(8,xs[hi]/W*100))}%`,transform:"translateX(-50%)",background:"rgba(5,14,30,.94)",border:"1px solid rgba(88,166,255,.35)",borderRadius:6,padding:"6px 8px",pointerEvents:"none",zIndex:4,boxShadow:"0 6px 18px rgba(0,0,0,.28)"}}><div style={{fontSize:9,color:C.faint,marginBottom:3}}>{data[hi]?.date}</div>{routes.map(r=>series[r.id][hi]!=null?<div key={r.id} style={{fontSize:10,fontWeight:800,color:colors[r.id]||C.tx}}>{r.id}: {series[r.id][hi].toFixed(1)}</div>:null)}</div>}
    <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center",marginTop:3}}>{routes.map(r=><span key={r.id} style={{fontSize:11,color:colors[r.id]||C.dim,fontWeight:700}}>● {r.name}</span>)}</div>
  </div>;
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
        <div style={{fontSize:12.5,fontWeight:900,color:"rgba(130,180,245,.82)",textTransform:"uppercase",letterSpacing:".08em",display:"flex",alignItems:"center",gap:7}}>
          <span style={{display:"inline-block",width:2,height:14,background:C.blue,borderRadius:2}}/> Shipping News · Tankers / Maritime
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
      .then(j=>{if(alive)setItems(Array.isArray(j?.items)?j.items.slice(0,12):[]);})
      .catch(()=>{});
    return()=>{alive=false;};
  },[]);
  const safeItems=Array.isArray(items)?items:[];
  if(!safeItems.length)return null;
  const loop=safeItems.concat(safeItems);
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


const COMMODITY_ACCENTS={
  "brent":"#58a6ff","crude":"#4fc3f7","eu-gas":"#a78bfa","natgas":"#22d3ee",
  "gasoline":"#f5a623","heating-oil":"#fb923c","ethanol":"#3fb950","naphtha":"#eab308",
  "methanol":"#c084fc","urea":"#34d399","eu-carbon":"#94a3b8","mgo-ara":"#2563eb"
};

function commodityWindowRows(history,id,period){
  const rows=(Array.isArray(history)?history:[])
    .map(s=>({date:s.date,price:Number(s.items?.[id]?.price)}))
    .filter(x=>Number.isFinite(x.price) && x.date)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
  if(!rows.length)return [];
  const now=new Date(rows[rows.length-1].date);
  let cutoff;
  if(period==="7D"){cutoff=new Date(now);cutoff.setDate(cutoff.getDate()-7);}
  else if(period==="1M"){cutoff=new Date(now);cutoff.setMonth(cutoff.getMonth()-1);}
  else {cutoff=new Date(now.getFullYear(),0,1);}
  return rows.filter(x=>new Date(x.date)>=cutoff);
}

function MiniCommoditySpark({rows,color,height=28}){
  if(!rows?.length)return <div style={{height,display:"flex",alignItems:"center",color:"rgba(130,160,205,.25)",fontSize:8}}>history builds daily</div>;
  const vals=rows.map(x=>x.price).filter(Number.isFinite);
  if(vals.length===1){
    return <div style={{height,display:"flex",alignItems:"center",gap:5}}>
      <svg viewBox="0 0 120 28" preserveAspectRatio="none" style={{width:"100%",height,display:"block"}}>
        <line x1="3" y1="14" x2="117" y2="14" stroke={color} strokeWidth="1.5" opacity=".35"/>
        <circle cx="114" cy="14" r="2.5" fill={color}/>
      </svg>
      <span style={{fontSize:7.5,color:"rgba(140,175,220,.38)",whiteSpace:"nowrap"}}>1 obs</span>
    </div>;
  }
  const W=120,H=28,P=3,mn=Math.min(...vals),mx=Math.max(...vals),range=mx-mn||1;
  const pts=rows.map((r,i)=>[
    P+i/(rows.length-1)*(W-P*2),
    P+(mx-r.price)/range*(H-P*2)
  ]);
  const d="M"+pts.map(p=>p.join(",")).join(" L");
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:"100%",height,display:"block"}}>
    <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function CommodityBigChart({item,history,period}){
  const [hover,setHover]=useState(null); if(!item)return null;
  const raw=commodityWindowRows(history,item.id,period); const cleaned=cleanIsolatedValues(raw.map(x=>x.price));
  const rows=raw.map((x,i)=>({...x,price:cleaned[i]})); const color=COMMODITY_ACCENTS[item.id]||"#58a6ff";
  const vals=rows.map(x=>x.price).filter(Number.isFinite); if(vals.length<2)return <div style={{height:150,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"rgba(130,160,205,.45)"}}>Historical chart will build automatically as daily snapshots are saved/backfilled.</div>;
  const W=800,H=180,PL=52,PR=18,PT=12,PB=28,mn=Math.min(...vals),mx=Math.max(...vals),pad=(mx-mn||Math.abs(mx)*.02||1)*.12,lo=mn-pad,hi=mx+pad,range=hi-lo||1;
  const pts=rows.map((r,i)=>[PL+i/(rows.length-1)*(W-PL-PR),PT+(hi-r.price)/range*(H-PT-PB)]);
  const move=e=>{const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*W;let idx=0,best=1e9;pts.forEach((p,i)=>{const d=Math.abs(p[0]-x);if(d<best){best=d;idx=i}});setHover(idx)};
  return <div style={{position:"relative"}}><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={move} onMouseLeave={()=>setHover(null)} style={{width:"100%",height:180,display:"block",cursor:"crosshair"}}>
    {[0,.5,1].map(t=>{const y=PT+t*(H-PT-PB),v=hi-t*range;return <g key={t}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke="rgba(88,130,200,.12)"/><text x={PL-7} y={y+4} fill="#e8f2ff" fontSize="10" fontWeight="700" textAnchor="end">{v.toLocaleString("en-US",{maximumFractionDigits:2})}</text></g>})}
    <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    {hover!=null&&<><line x1={pts[hover][0]} x2={pts[hover][0]} y1={PT} y2={H-PB} stroke="rgba(255,255,255,.45)" strokeDasharray="4 4"/><circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill={color} stroke="#fff" strokeWidth="1.5"/></>}
    <text x={PL} y={H-6} fill="#e8f2ff" fontSize="9.5" fontWeight="700">{new Date(rows[0].date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</text><text x={W-PR} y={H-6} fill="#e8f2ff" fontSize="9.5" fontWeight="700" textAnchor="end">{new Date(rows.at(-1).date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</text>
  </svg>{hover!=null&&<div style={{position:"absolute",top:8,left:`${Math.min(82,Math.max(12,pts[hover][0]/W*100))}%`,transform:"translateX(-50%)",background:"rgba(5,14,30,.95)",border:`1px solid ${color}88`,borderRadius:6,padding:"6px 8px",pointerEvents:"none"}}><div style={{fontSize:9,color:C.faint}}>{new Date(rows[hover].date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div><div style={{fontSize:11,fontWeight:900,color}}>{rows[hover].price.toLocaleString("en-US",{maximumFractionDigits:2})} {item.unit||""}</div></div>}</div>;
}

function CommodityTape({data,history,period,selectedId,onSelect}){
  const items=Array.isArray(data?.items)?data.items:[];
  if(!items.length)return null;
  return(
    <div style={{
      display:"flex",flexWrap:"wrap",gap:8,width:"100%",height:"100%",alignContent:"stretch"
    }}>
      {items.map(x=>{
        const accent=COMMODITY_ACCENTS[x.id]||"#58a6ff";
        const rows=commodityWindowRows(history,x.id,period);
        const first=rows[0]?.price,last=rows.at(-1)?.price;
        const pct=(Number.isFinite(first)&&Number.isFinite(last)&&first!==0)?((last-first)/first*100):null;
        const selected=selectedId===x.id;
        return <button key={x.id} onClick={()=>onSelect?.(x.id)} style={{
          flex:"1 1 155px",minWidth:145,minHeight:108,
          background:selected?accent+"16":"#111f35",
          border:"1px solid "+(selected?accent:accent+"55"),
          borderTop:"3px solid "+accent,
          borderRadius:7,padding:"10px 12px 8px",
          display:"flex",flexDirection:"column",boxSizing:"border-box",
          cursor:"pointer",fontFamily:"inherit",textAlign:"left",overflow:"hidden"
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div style={{fontSize:11,fontWeight:900,color:accent,textTransform:"uppercase",letterSpacing:".045em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.label}</div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:19,fontWeight:900,color:"#f4f8ff",lineHeight:1}}>
                {x.price!=null?Number(x.price).toLocaleString("en-US",{maximumFractionDigits:2}):"—"}
              </div>
              <div style={{fontSize:8.5,fontWeight:700,color:"rgba(145,180,225,.58)",marginTop:2}}>{x.unit||""}</div>
            </div>
          </div>
          <div style={{marginTop:"auto",paddingTop:6}}>
            <MiniCommoditySpark rows={rows} color={accent} height={30}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:8.5,marginTop:2}}>
              <span style={{color:"rgba(140,175,220,.48)"}}>{period}</span>
              <span style={{fontWeight:800,color:pct==null?"rgba(140,175,220,.34)":pct>=0?"#3fb950":"#ff6b6b"}}>
                {pct==null?"—":(pct>0?"+":"")+pct.toFixed(1)+"%"}
              </span>
            </div>
          </div>
        </button>;
      })}
    </div>
  );
}
function VlccSparkline({history}) {
  const [hover,setHover]=useState(null),[period,setPeriod]=useState("1Y");
  let rows=(Array.isArray(history)?history:[]).map(x=>({...x,tce:Number(x.tce)})).filter(x=>Number.isFinite(x.tce)).sort((a,b)=>(a.year||0)-(b.year||0)||(a.week||0)-(b.week||0));
  const n=period==="3M"?13:period==="6M"?26:period==="1Y"?52:rows.length; rows=rows.slice(-n);
  if(!rows.length)return null; const clean=cleanIsolatedValues(rows.map(x=>x.tce));rows=rows.map((x,i)=>({...x,tce:clean[i]}));
  const W=760,H=170,PL=54,PR=18,PT=12,PB=30,vals=rows.map(x=>x.tce/1000),mn=Math.min(...vals),mx=Math.max(...vals),pad=Math.max(25,(mx-mn)*.14),lo=Math.max(0,mn-pad),hi=mx+pad,range=hi-lo||1;
  const pts=rows.map((x,i)=>[PL+i/(rows.length-1||1)*(W-PL-PR),PT+(hi-x.tce/1000)/range*(H-PT-PB)]),ticks=[hi,(hi+lo)/2,lo],labels=[0,Math.floor((rows.length-1)/2),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  const move=e=>{const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*W;let idx=0,best=1e9;pts.forEach((p,i)=>{const d=Math.abs(p[0]-x);if(d<best){best=d;idx=i}});setHover(idx)};
  return <div style={{height:"100%",position:"relative",display:"flex",flexDirection:"column"}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:2}}><HorizonButtons value={period} onChange={setPeriod} options={["3M","6M","1Y","ALL"]}/></div><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={move} onMouseLeave={()=>setHover(null)} style={{width:"100%",height:"100%",minHeight:125,display:"block",cursor:"crosshair"}}>
    {ticks.map((v,i)=>{const y=PT+i/2*(H-PT-PB);return <g key={i}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke="rgba(88,130,200,.14)"/><text x={PL-8} y={y+4} fill="#e8f2ff" fontSize="10.5" fontWeight="700" textAnchor="end">${Math.round(v)}k</text></g>})}
    {pts.length>1&&<path d={smoothPath(pts)} fill="none" stroke="#58a6ff" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>}
    {hover!=null&&<><line x1={pts[hover][0]} x2={pts[hover][0]} y1={PT} y2={H-PB} stroke="rgba(255,255,255,.45)" strokeDasharray="4 4"/><circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill="#58a6ff" stroke="#fff" strokeWidth="1.5"/></>}
    {labels.map(i=><text key={i} x={pts[i][0]} y={H-8} fill="#e8f2ff" fontSize="9.5" fontWeight="700" textAnchor={i===0?"start":i===rows.length-1?"end":"middle"}>{rows[i].date||(`W${rows[i].week||""}`)}</text>)}
  </svg>{hover!=null&&<div style={{position:"absolute",top:26,left:`${Math.min(82,Math.max(12,pts[hover][0]/W*100))}%`,transform:"translateX(-50%)",background:"rgba(5,14,30,.95)",border:"1px solid rgba(88,166,255,.45)",borderRadius:6,padding:"6px 8px",pointerEvents:"none"}}><div style={{fontSize:9,color:C.faint}}>{rows[hover].date||`Week ${rows[hover].week||""}`}</div><div style={{fontSize:11,fontWeight:900,color:C.blue}}>${Math.round(rows[hover].tce/1000)}k/day</div>{rows[hover].ws!=null&&<div style={{fontSize:9.5,color:C.tx}}>WS {rows[hover].ws}</div>}</div>}</div>;
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
  const [commodityHistory,setCommodityHistory]=useState([]);
  const [commodityView,setCommodityView]=useState("overview");
  const [commodityPeriod,setCommodityPeriod]=useState("1M");
  const [selectedCommodity,setSelectedCommodity]=useState("brent");
  const [vlcc,setVlcc]=useState(null);
  const [shippingPriceTab,setShippingPriceTab]=useState("vlcc");
  const [vlccError,setVlccError]=useState(null);
  const [wsSummaryData,setWsSummaryData]=useState(null);

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
    fetch("/api/commodities",{cache:"no-store"})
      .then(r=>r.ok?r.json():Promise.reject())
      .then(async j=>{
        if(!alive)return;
        setCommodities(j);
        if(j?.history && typeof j.history==="object"){
          setCommodityHistory(prev=>{
            const byDate=new Map((Array.isArray(prev)?prev:[]).filter(x=>x?.date).map(x=>[x.date,{...x,items:{...(x.items||{})}}]));
            for(const [id,rows] of Object.entries(j.history)){
              for(const r of Array.isArray(rows)?rows:[]){ if(!r?.date||!Number.isFinite(Number(r.price)))continue; const snap=byDate.get(r.date)||{date:r.date,items:{}}; snap.items={...(snap.items||{}),[id]:{...(snap.items?.[id]||{}),price:Number(r.price)}}; byDate.set(r.date,snap); }
            }
            return [...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
          });
        }
        const itemsObj={};
        for(const x of Array.isArray(j?.items)?j.items:[])itemsObj[x.id]={price:x.price,unit:x.unit,label:x.label};
        const day=new Date().toISOString().slice(0,10);
        const snap={date:day,items:itemsObj};
        setCommodityHistory(prev=>{
          const rows=(Array.isArray(prev)?prev:[]).filter(x=>x.date!==day);
          return [...rows,snap].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        });
        try{
          await supabase.from("dashboard").upsert({key:"commodity-hist-"+day,value:JSON.stringify(snap)},{onConflict:"key"});
        }catch(e){console.warn("commodity snapshot save:",e);}
      }).catch(()=>{});
    fetch("/api/vlcc-earnings",{cache:"no-store"})
      .then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status)))
      .then(j=>{if(alive){setVlcc(j);setVlccError(j?.latest?null:"No VLCC data returned");}})
      .catch(e=>{if(alive)setVlccError(e?.message||"VLCC fetch failed");});
    return()=>{alive=false;};
  },[]);


  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const {data,error}=await supabase.from("dashboard").select("value").eq("key",WS_STORE).maybeSingle();
        if(error)throw error;
        if(!alive||!data?.value)return;
        try{setWsSummaryData(typeof data.value==="string"?JSON.parse(data.value):data.value);}catch(_){}
      }catch(_){}
    })();
    return()=>{alive=false;};
  },[]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const {data,error}=await supabase.from("dashboard").select("key,value").ilike("key","commodity-hist-%");
        if(error)throw error;
        const rows=(data||[]).map(r=>{
          try{return typeof r.value==="string"?JSON.parse(r.value):r.value;}catch{return null;}
        }).filter(Boolean).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        if(alive)setCommodityHistory(prev=>{
          const byDate=new Map();
          for(const x of [...rows,...(Array.isArray(prev)?prev:[])]) if(x?.date) byDate.set(x.date,x);
          return [...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        });
      }catch(e){console.warn("commodity history load:",e);}
    })();
    return()=>{alive=false;};
  },[]);

  const [regionHistory,setRegionHistory]=useState([]);
  const [regionHistoryLoading,setRegionHistoryLoading]=useState(true);
  const [regionHistoryError,setRegionHistoryError]=useState(null);
  useEffect(()=>{let alive=true;(async()=>{try{const {data,error}=await supabase.rpc("dashboard_region_history");if(error)throw error;if(alive)setRegionHistory(data||[]);}catch(e){if(alive)setRegionHistoryError(e.message||"RPC failed");}finally{if(alive)setRegionHistoryLoading(false);}})();return()=>{alive=false;};},[]);
  const [segmentFilter,setSegmentFilter]=useState("All");
  const [fixingRegionFilter,setFixingRegionFilter]=useState("All");
  const [fixingPeriod,setFixingPeriod]=useState("1M");
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
  const safeRegionHistory=Array.isArray(regionHistory)?regionHistory:[];
  for(const row of safeRegionHistory){
    const lab=String(row.snapshot_label||"").toUpperCase(), region=row.region, seg=row.segment||"Unknown";
    regionByLabel[lab]||={};
    regionByLabel[lab][region]||={ships:0,segments:{}};
    regionByLabel[lab][region].ships+=Number(row.ships||0);
    regionByLabel[lab][region].segments[seg]=(regionByLabel[lab][region].segments[seg]||0)+Number(row.ships||0);
  }
  const getRegionCount=(label,region)=>{
    const r=regionByLabel[label]?.[region];
    if(!r)return 0;
    return segmentFilter==="All" ? Number(r.ships||0) : Number(r.segments?.[segmentFilter]||0);
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
  const safeHistory=Array.isArray(history)?history:[];
  const chartSnaps = [...safeHistory];
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
    const rows=(Array.isArray(fixingSegmentHistory)?fixingSegmentHistory:[])
      .filter(r=>fixingRegionFilter==="All" || r.region===fixingRegionFilter);
    for(const r of rows){
      const d=r.snapshot_date; if(!d)continue;
      byDate[d]||={date:d};
      // RPC returns one row per date / region / segment. When All geographies are
      // selected, combine regional averages weighted by vessel observations.
      const seg=r.segment;
      const ships=Math.max(1,Number(r.ships||1));
      const avg=Number(r.avg_days);
      if(!Number.isFinite(avg))continue;
      byDate[d]["__"+seg]||={sum:0,ships:0};
      byDate[d]["__"+seg].sum+=avg*ships;
      byDate[d]["__"+seg].ships+=ships;
    }
    for(const row of Object.values(byDate)){
      for(const seg of SEGMENT_ORDER.filter(s=>s!=="All")){
        const a=row["__"+seg];
        if(a?.ships){
          row[seg]=a.sum/a.ships;
          row[seg+"__ships"]=a.ships;
        }
        delete row["__"+seg];
      }
    }
    return Object.values(byDate).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  })();
  const activeFixingSegments=(segmentFilter==="All"?SEGMENT_ORDER.filter(s=>s!=="All"): [segmentFilter]).filter(s=>fixingSegmentChartData.some(d=>d[s]!=null));
  const fixingSegmentDisplayData=horizonRows(fixingSegmentChartData,fixingPeriod);

  const marketSummary=(()=>{
    const bits=[];

    if(fixingSegmentChartData.length>=2){
      const latest=fixingSegmentChartData[fixingSegmentChartData.length-1];
      const target=new Date(latest.date); target.setDate(target.getDate()-14);
      const past=[...fixingSegmentChartData].sort((a,b)=>Math.abs(new Date(a.date)-target)-Math.abs(new Date(b.date)-target))[0];
      const moves=["MR","Handy","Inter","City","Flexi","J19","Sub 10"].map(seg=>{
        const a=Number(latest?.[seg]),b=Number(past?.[seg]);
        return Number.isFinite(a)&&Number.isFinite(b)?{seg,delta:a-b}:null;
      }).filter(Boolean);
      if(moves.length){
        const strongest=[...moves].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];
        bits.push(Math.abs(strongest.delta)<0.6
          ? `${strongest.seg} fixing window broadly flat`
          : `${strongest.seg} fixing window ${strongest.delta<0?"down":"up"} ${Math.abs(strongest.delta).toFixed(1)}d vs ~2 weeks ago`);
        const flat=moves.find(x=>x.seg!==strongest.seg&&Math.abs(x.delta)<0.6);
        if(flat) bits.push(`${flat.seg} stays broadly flat`);
      }
    }

    const regional=currentRegionRows.map(r=>{
      const pct=r.d14>0?((r.now-r.d14)/r.d14*100):null;
      return pct!=null?{region:r.region,pct}:null;
    }).filter(Boolean).sort((a,b)=>b.pct-a.pct);
    if(regional[0]&&regional[0].pct>=5) bits.push(`${Math.round(regional[0].pct)}% more ships in ${regional[0].region} vs 14d`);

    const spot=wsSummaryData?.spot||{};
    const mean=ids=>{
      const vals=ids.map(id=>Number(spot?.[id]?.change)).filter(Number.isFinite);
      return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
    };
    const describe=v=>v==null?null:Math.abs(v)<1?"flat":v>0?"improving":"softening";
    const mr=describe(mean(["TC2","TC14"]));
    const handy=describe(mean(["TC6","TC23"]));
    if(mr&&handy) bits.push(`MR ${mr}; Handy ${handy}`);
    else if(mr) bits.push(`MR ${mr}`);
    else if(handy) bits.push(`Handy ${handy}`);

    return bits.slice(0,4);
  })();

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
    <div style={{fontSize:12.5,fontWeight:900,color:"rgba(130,180,245,.82)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:9,display:"flex",alignItems:"center",gap:7}}>
      <span style={{display:"inline-block",width:2,height:14,background:D.blue,borderRadius:2,opacity:0.95}}/>
      {t}
    </div>
  );

  const panel = (children, extraStyle={}) => (
    <div style={{background:D.bg2,border:"1px solid "+D.border,borderRadius:10,padding:"16px 18px",position:"relative",overflow:"hidden",...extraStyle}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(30,100,200,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(30,100,200,0.03) 1px,transparent 1px)",backgroundSize:"40px 40px",pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1,height:extraStyle?.height?"100%":undefined}}>{children}</div>
    </div>
  );

  const commodityDisplayData=(()=>{
    if(!commodities)return null;
    const base=Array.isArray(commodities.items)?commodities.items.filter(x=>x.id!=="mgo-ara"):[];
    const mgoVal=Number(bunkers?.ARA_MGO);
    const mgo={id:"mgo-ara",label:"MGO ARA",unit:"USD/t",price:Number.isFinite(mgoVal)?mgoVal:null,changePct:null};
    return {...commodities,items:[...base,mgo]};
  })();

  const commodityDisplayHistory=(()=>{
    const byDate=new Map();
    for(const s of Array.isArray(commodityHistory)?commodityHistory:[]){
      if(!s?.date)continue;
      byDate.set(s.date,{...s,items:{...(s.items||{})}});
    }
    for(const b of Array.isArray(bunkerHistory)?bunkerHistory:[]){
      if(!b?.date)continue;
      const parsed=new Date(b.date);
      const d=!isNaN(parsed)?parsed.toISOString().slice(0,10):String(b.date);
      const row=byDate.get(d)||{date:d,items:{}};
      const px=Number(b.ARA_MGO);
      if(Number.isFinite(px))row.items["mgo-ara"]={price:px,unit:"USD/t",label:"MGO ARA"};
      byDate.set(d,row);
    }
    const today=new Date().toISOString().slice(0,10);
    if(Number.isFinite(Number(bunkers?.ARA_MGO))){
      const row=byDate.get(today)||{date:today,items:{}};
      row.items["mgo-ara"]={price:Number(bunkers.ARA_MGO),unit:"USD/t",label:"MGO ARA"};
      byDate.set(today,row);
    }
    return [...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  })();

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
        <div style={{position:"absolute",right:22,top:16,zIndex:3,minWidth:205,padding:"9px 13px",borderRadius:8,background:"rgba(12,29,53,.82)",border:"1px solid rgba(88,166,255,.22)",backdropFilter:"blur(6px)",textAlign:"right"}}>
          <div style={{fontSize:8.5,fontWeight:800,letterSpacing:".10em",textTransform:"uppercase",color:D.faint}}>Positions latest</div>
          <div style={{fontSize:22,fontWeight:900,color:D.blue,lineHeight:1.05,marginTop:2}}>{positionMeta.count??vessels.length}</div>
          <div style={{fontSize:9,color:D.faint,marginTop:2}}>
            {positionMeta.updatedAt
              ? "ships · "+new Date(positionMeta.updatedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+" "+new Date(positionMeta.updatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})
              : `${openVessels.length} currently open`}
          </div>
        </div>
        <div style={{position:"relative",zIndex:2,padding:"22px 270px 18px 26px"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:"rgba(120,180,255,0.55)",marginBottom:6}}>Signal — Tanker Intelligence</div>
          <div style={{fontSize:22,fontWeight:800,color:"#e8f2ff",lineHeight:1.2,marginBottom:4}}>Market Dashboard</div>
          <div style={{fontSize:12,color:"rgba(140,190,255,0.5)"}}>
            Clean products · UKC / Med / TA ·&nbsp;
            {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
          </div>
          <div style={{marginTop:8,maxWidth:920,fontSize:11.5,lineHeight:1.45,fontWeight:650,color:"rgba(218,233,250,.82)"}}>
            {marketSummary.length
              ? marketSummary.map((x,i)=><React.Fragment key={i}>{i>0&&<span style={{color:D.blue,opacity:.72}}> · </span>}<span>{x}</span></React.Fragment>)
              : <span style={{color:D.faint,fontWeight:500}}>Market summary will populate as recent fixing-window, regional and Worldscale updates accumulate.</span>}
          </div>
        </div>
      </div>

      <NewsTicker/>

      {/* ── Tanker market tape ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,62fr) minmax(360px,38fr)",gap:12}}>
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              {secHead("Energy & Commodities")}
              <span style={{fontSize:9,color:D.faint}}>{commodities?.updatedAt?new Date(commodities.updatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):""}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,margin:"-2px 0 9px"}}>
              <div style={{display:"flex",gap:4}}>
                {[["overview","Overview"],["chart","Chart"]].map(([v,l])=><button key={v} onClick={()=>setCommodityView(v)} style={{fontSize:9.5,fontWeight:800,padding:"4px 9px",borderRadius:5,border:"1px solid "+(commodityView===v?D.blue:D.border2),background:commodityView===v?"rgba(88,166,255,.14)":D.bg3,color:commodityView===v?D.tx:D.dim,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}
              </div>
              <div style={{display:"flex",gap:3}}>
                {["7D","1M","YTD"].map(p=><button key={p} onClick={()=>setCommodityPeriod(p)} style={{fontSize:9,fontWeight:800,padding:"3px 7px",borderRadius:4,border:"1px solid "+(commodityPeriod===p?D.blue:D.border2),background:commodityPeriod===p?"rgba(88,166,255,.12)":"transparent",color:commodityPeriod===p?D.blue:D.faint,cursor:"pointer",fontFamily:"inherit"}}>{p}</button>)}
              </div>
            </div>
            {commodityDisplayData ? commodityView==="overview" ? (
              <CommodityTape data={commodityDisplayData} history={commodityDisplayHistory} period={commodityPeriod} selectedId={selectedCommodity} onSelect={id=>setSelectedCommodity(id)}/>
            ) : (
              <div style={{background:D.bg3,border:"1px solid "+D.border2,borderRadius:7,padding:"10px 12px"}}>
                {(()=>{
                  const item=(commodityDisplayData.items||[]).find(x=>x.id===selectedCommodity)||commodityDisplayData.items?.[0];
                  if(!item)return null;
                  const accent=COMMODITY_ACCENTS[item.id]||D.blue;
                  return <>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,marginBottom:5}}>
                      <div style={{fontSize:13,fontWeight:900,color:accent,textTransform:"uppercase",letterSpacing:".05em"}}>{item.label}</div>
                      <div style={{textAlign:"right"}}><span style={{fontSize:22,fontWeight:900,color:D.tx}}>{item.price!=null?Number(item.price).toLocaleString("en-US",{maximumFractionDigits:2}):"—"}</span><span style={{fontSize:9,color:D.faint,marginLeft:5}}>{item.unit||""}</span></div>
                    </div>
                    <CommodityBigChart item={item} history={commodityDisplayHistory} period={commodityPeriod}/>
                  </>;
                })()}
              </div>
            ) : <div style={{fontSize:11,color:D.faint,padding:"8px 0"}}>Loading commodity prices…</div>}
          </>,
          {minWidth:0}
        )}
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              {secHead("Shipping Prices")}
              <div style={{display:"flex",gap:4}}>
                {[["vlcc","VLCC"],["bunkers","Bunkers"]].map(([v,l])=><button key={v} onClick={()=>setShippingPriceTab(v)} style={{
                  fontSize:9.5,fontWeight:800,padding:"4px 8px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",
                  border:"1px solid "+(shippingPriceTab===v?D.blue:D.border2),
                  background:shippingPriceTab===v?"rgba(88,166,255,.14)":D.bg3,
                  color:shippingPriceTab===v?D.tx:D.dim
                }}>{l}</button>)}
              </div>
            </div>
            {shippingPriceTab==="vlcc" ? (
              vlcc?.latest ? <div style={{display:"flex",flexDirection:"column",height:205,minHeight:205}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:4}}>
                  <div>
                    <div style={{fontSize:9,fontWeight:800,color:D.faint,textTransform:"uppercase",letterSpacing:".05em"}}>TD3C MEG → China</div>
                    <div style={{fontSize:25,fontWeight:900,color:D.tx,marginTop:3}}>${Math.round(Number(vlcc.latest.tce)/1000)}k<span style={{fontSize:10,color:D.faint,fontWeight:600}}>/day</span></div>
                    <div style={{fontSize:9,color:D.faint,marginTop:2}}>{vlcc.latest.date||""} · {vlcc.latest.ws!=null?"WS "+vlcc.latest.ws:"Baltic weekly"}</div>
                  </div>
                  <div style={{fontSize:9,color:D.faint,textAlign:"right"}}>Baltic weekly<br/>{(vlcc.history||[]).length} observations</div>
                </div>
                <div style={{flex:1,minHeight:0}}><VlccSparkline history={vlcc.history||[]}/></div>
              </div> : <div style={{fontSize:11,color:vlccError?D.red:D.faint,padding:"10px 0"}}>
                {vlccError?"VLCC unavailable · "+vlccError:"Loading VLCC earnings…"}
              </div>
            ) : (
              <>
                {!bFetched&&!bLoading&&<div style={{textAlign:"center",padding:"8px 0"}}><button onClick={fetchBunkersPBT} style={{background:"rgba(88,166,255,.12)",border:"1px solid rgba(88,166,255,.32)",borderRadius:5,color:D.blue,fontWeight:700,fontSize:10,padding:"5px 10px",cursor:"pointer"}}>Fetch bunker prices</button></div>}
                {bLoading&&<div style={{color:D.blue,fontSize:11,padding:"8px",textAlign:"center"}}>⟳ Fetching…</div>}
                {bError&&<div style={{color:D.red,fontSize:10,padding:"4px 0"}}>{bError}</div>}
                {bunkers&&<>
                  <div style={{fontSize:9,color:D.faint,marginBottom:5}}>Updated {bunkers.date}</div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:10.5}}>
                    <thead><tr style={{background:D.bg4}}><th style={{padding:"4px 6px",textAlign:"left",color:D.faint}}>PORT</th><th style={{padding:"4px 6px",textAlign:"right",color:D.amber}}>HSFO</th><th style={{padding:"4px 6px",textAlign:"right",color:D.green}}>VLSFO</th><th style={{padding:"4px 6px",textAlign:"right",color:D.blue}}>MGO</th></tr></thead>
                    <tbody>{[["ARA",bunkers.ARA_HSFO,bunkers.ARA_VLSFO,bunkers.ARA_MGO],["Fujairah",bunkers.FUJ_HSFO,bunkers.FUJ_VLSFO,bunkers.FUJ_MGO],["Singapore",bunkers.SIN_HSFO,bunkers.SIN_VLSFO,bunkers.SIN_MGO]].map(([port,a,v,m],i)=><tr key={port} style={{background:i%2?D.bg4:"transparent",borderBottom:"1px solid "+D.border}}><td style={{padding:"5px 6px",color:D.dim,fontWeight:700}}>{port}</td><td style={{padding:"5px 6px",textAlign:"right",color:D.amber,fontWeight:800}}>{a?"$"+a:"—"}</td><td style={{padding:"5px 6px",textAlign:"right",color:D.green,fontWeight:800}}>{v?"$"+v:"—"}</td><td style={{padding:"5px 6px",textAlign:"right",color:D.blue,fontWeight:800}}>{m?"$"+m:"—"}</td></tr>)}</tbody>
                  </table>
                  <button onClick={fetchBunkersPBT} style={{marginTop:5,background:"none",border:"1px solid "+D.border,borderRadius:4,color:D.faint,fontSize:9.5,padding:"2px 7px",cursor:"pointer"}}>↻ Refresh</button>
                </>}
              </>
            )}
          </>,
          {minWidth:0}
        )}
      </div>

      {/* ── Fixing window + Worldscale ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12,alignItems:"stretch",height:520}}>
{panel(
          <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              {secHead(`Fixing window by vessel size · days until open${fixingRegionFilter!=="All"?" · "+fixingRegionFilter:""}`)}
              <span style={{fontSize:9,color:D.faint}}>past positions · negative values excluded</span>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"-2px 0 8px"}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",flex:1}}>{SEGMENT_ORDER.map(seg=>{const active=segmentFilter===seg;return <button key={seg} onClick={()=>setSegmentFilter(seg)} style={{background:active?"rgba(88,166,255,.18)":D.bg3,border:"1px solid "+(active?D.blue:D.border2),borderRadius:5,color:active?D.tx:D.dim,fontFamily:"inherit",fontSize:10,fontWeight:active?800:600,padding:"4px 8px",cursor:"pointer"}}>{seg}</button>})}</div><HorizonButtons value={fixingPeriod} onChange={setFixingPeriod}/>
            </div>
            {fixingSegmentError
              ? <div style={{fontSize:10,color:D.red,padding:"8px 0"}}>Fixing-window history unavailable: {fixingSegmentError}</div>
              : fixingSegmentDisplayData.length<2
                ? <div style={{color:D.faint,fontSize:12,padding:"24px 0",textAlign:"center"}}>Not enough observations in this period.</div>
                : <div style={{flex:1,minHeight:0}}><SegmentFWChart data={fixingSegmentDisplayData} segments={activeFixingSegments} colors={SEGMENT_COLORS}/></div>}
          </div>,
          {minWidth:0,height:"100%",boxSizing:"border-box"}
        )}
        <div style={{height:"100%",minHeight:0}}><WSTracker/></div>
      </div>

      {/* ── Regional fleet history ── */}
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              {secHead("Open fleet by main region · vessel count")}
              <span style={{fontSize:9,color:fixingRegionFilter!=="All"?D.blue:D.faint}}>
                {fixingRegionFilter!=="All" ? `Fixing filter: ${fixingRegionFilter} · click again to clear` : "click a region to filter fixing window"}
              </span>
            </div>
            {regionHistoryLoading?<div style={{fontSize:11,color:D.faint,padding:"12px 0"}}>Loading historical fleet…</div>:regionHistoryError?<div style={{fontSize:10,color:D.red,padding:"8px 0"}}>Run updated Supabase RPC SQL: {regionHistoryError}</div>:<>
              <div style={{display:"grid",gridTemplateColumns:"minmax(190px,1fr) 64px 64px 64px 64px",gap:8,padding:"1px 2px 7px",fontSize:10.5,fontWeight:900,color:D.dim,textTransform:"uppercase",letterSpacing:".04em"}}><span>Region</span><span style={{textAlign:"right",color:D.tx}}>NOW</span><span style={{textAlign:"right"}}>14D</span><span style={{textAlign:"right"}}>30D</span><span style={{textAlign:"right"}}>90D</span></div>
              {currentRegionRows.map(({region,now,d14,d30,d90})=>{
                const activeRegion=fixingRegionFilter===region;
                return <div key={region}
                  onClick={()=>setFixingRegionFilter(activeRegion?"All":region)}
                  title={activeRegion?"Click to clear geography filter":"Filter fixing window to "+region}
                  style={{
                    display:"grid",gridTemplateColumns:"minmax(190px,1fr) 64px 64px 64px 64px",
                    gap:8,alignItems:"center",padding:"6px 5px",
                    borderTop:"1px solid "+D.border,
                    borderLeft:"2px solid "+(activeRegion?(REGION_COLORS[region]||D.blue):"transparent"),
                    background:activeRegion?"rgba(88,166,255,.08)":"transparent",
                    borderRadius:activeRegion?4:0,
                    cursor:"pointer",transition:"background .14s,border-color .14s"
                  }}>
                  <span style={{fontSize:11,fontWeight:800,color:REGION_COLORS[region]||D.dim}}>{region}</span>
                  <span style={{fontSize:11,textAlign:"right",color:D.tx,fontWeight:850}}>{now}</span>
                  <span style={{fontSize:10,textAlign:"right",color:D.dim}}>{d14}</span>
                  <span style={{fontSize:10,textAlign:"right",color:D.dim}}>{d30}</span>
                  <span style={{fontSize:10,textAlign:"right",color:D.dim}}>{d90}</span>
                </div>;
              })}
              <div style={{display:"grid",gridTemplateColumns:"minmax(190px,1fr) 64px 64px 64px 64px",gap:8,padding:"7px 2px 0",borderTop:"1px solid "+D.border2,fontSize:10,fontWeight:850}}><span style={{color:D.faint}}>{segmentFilter==="All"?"TOTAL FLEET":"TOTAL · "+segmentFilter}</span><span style={{textAlign:"right",color:D.tx}}>{regionTotals.now}</span><span style={{textAlign:"right",color:D.dim}}>{regionTotals.d14}</span><span style={{textAlign:"right",color:D.dim}}>{regionTotals.d30}</span><span style={{textAlign:"right",color:D.dim}}>{regionTotals.d90}</span></div>
            </>}
          </>,
          {minWidth:0}
        )}
        {panel(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>{secHead("Regional tonnage supply · now vs 30d")}<span style={{fontSize:9,color:D.faint}}>{segmentFilter==="All"?"fleet totals":segmentFilter}</span></div>
            <RegionCompareChart rows={currentRegionRows} colors={REGION_COLORS}/>
            <div style={{display:"flex",gap:14,marginTop:8,fontSize:10,color:D.faint}}><span><b style={{color:"#1769d2"}}>■</b> Current</span><span><b style={{color:"rgba(190,202,220,.65)"}}>■</b> 30 days ago</span></div>
          </>,
          {minWidth:0}
        )}
      </div>

      {/* ── News Feed ── */}
      <NewsFeed/>

    </div>
  );
}


// ─── SVG charts (no dependencies) ────────────────────────────────────────────
function SegmentFWChart({data,segments,colors}) {
  const [hover,setHover]=useState(null);
  const [presentationClean,setPresentationClean]=useState(false);
  const W=1000,H=400,PL=72,PR=28,PT=18,PB=42,iW=W-PL-PR,iH=H-PT-PB;
  const series={};
  segments.forEach(seg=>{
    const raw=data.map(d=>{
      const v=Number.isFinite(Number(d[seg]))?Number(d[seg]):null;
      if(!presentationClean)return v;
      const ships=Number(d?.[seg+"__ships"]||0);
      return ships<=1?null:v;
    });
    series[seg]=presentationClean?cleanPresentationValues(raw):raw;
  });
  const vals=segments.flatMap(s=>series[s]).filter(v=>v!=null&&v>=0); if(!vals.length)return null;
  const mn=0,mx=Math.max(7,Math.ceil(Math.max(...vals)+2)),range=mx||1,xs=data.map((_,i)=>PL+i/(data.length-1||1)*iW);
  const move=e=>{const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*W;let idx=0,best=1e9;xs.forEach((v,i)=>{const d=Math.abs(v-x);if(d<best){best=d;idx=i}});setHover(idx)};
  const hoverMarkers=hover==null?[]:segments.map(seg=>{
    const v=series[seg][hover]; if(v==null||v<0)return null;
    return {seg,x:xs[hover],y:PT+iH-v/range*iH,color:colors[seg]||C.blue};
  }).filter(Boolean);
  return <div style={{display:"flex",flexDirection:"column",height:"100%",minHeight:0,position:"relative"}}>
    <label style={{position:"absolute",right:8,top:5,zIndex:7,display:"flex",alignItems:"center",gap:6,fontSize:9,color:presentationClean?C.blue:C.faint,background:"rgba(5,14,30,.78)",border:"1px solid "+(presentationClean?"rgba(88,166,255,.42)":C.bd2),borderRadius:5,padding:"3px 7px",cursor:"pointer",userSelect:"none"}} title="Presentation mode: removes isolated outliers and observations based on only one ship">
      <input type="checkbox" checked={presentationClean} onChange={e=>setPresentationClean(e.target.checked)}
        style={{width:13,height:13,margin:0,accentColor:C.blue,cursor:"pointer"}}/>
      Clean chart <span style={{color:presentationClean?"#8fc5ff":C.faint,opacity:.85}}>· exclude 1-ship data</span>
    </label>
    <div style={{position:"relative",width:"100%",flex:1,minHeight:0}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={move} onMouseLeave={()=>setHover(null)} style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",cursor:"crosshair"}}>
        {[0,.5,1].map(fr=>{const v=Math.round(mx*(1-fr)),y=PT+fr*iH;return <g key={fr}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke={C.bd2}/><text x={PL-10} y={y+4} fill="#fff" fontSize="12" fontWeight="700" textAnchor="end">{v}d</text></g>})}
        {segments.map(seg=>{const pts=series[seg].map((v,i)=>v==null||v<0?null:[xs[i],PT+iH-v/range*iH]);const valid=pts.filter(Boolean);return valid.length>1?<g key={seg}><path d={smoothPath(valid)} fill="none" stroke={colors[seg]||C.blue} strokeWidth="2.2" strokeLinejoin="round" opacity=".95"/></g>:null})}
        {hover!=null&&<line x1={xs[hover]} x2={xs[hover]} y1={PT} y2={PT+iH} stroke="rgba(255,255,255,.45)" strokeDasharray="4 4"/>}
        {data.map((d,i)=>{const step=Math.max(1,Math.floor(data.length/8));return(i===0||i===data.length-1||i%step===0)?<text key={i} x={xs[i]} y={H-10} fill="#fff" fontSize="10.5" fontWeight="700" textAnchor="middle">{fmtDateShort(d.date)}</text>:null})}
      </svg>
      {/* Marker uses the exact same plot wrapper and coordinate percentages as the SVG. */}
      {hoverMarkers.map(m=><span key={m.seg} style={{position:"absolute",left:`${m.x/W*100}%`,top:`${m.y/H*100}%`,width:10,height:10,borderRadius:"50%",background:m.color,border:"1.5px solid #fff",boxSizing:"border-box",transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:6,boxShadow:"0 0 0 1px rgba(0,0,0,.22)"}}/>)}
      {hover!=null&&<div style={{position:"absolute",top:10,left:`${Math.min(82,Math.max(10,xs[hover]/W*100))}%`,transform:"translateX(-50%)",background:"rgba(5,14,30,.95)",border:"1px solid rgba(88,166,255,.35)",borderRadius:6,padding:"6px 8px",pointerEvents:"none",zIndex:8}}><div style={{fontSize:9,color:C.faint,marginBottom:3}}>{fmtDateShort(data[hover]?.date)}</div>{segments.map(seg=>series[seg][hover]!=null?<div key={seg} style={{fontSize:10,fontWeight:800,color:colors[seg]||C.tx}}>{seg}: {series[seg][hover].toFixed(1)}d <span style={{color:C.faint,fontWeight:600}}>· {Math.round(Number(data[hover]?.[seg+"__ships"]||0))} ships</span>{presentationClean&&Number(data[hover]?.[seg])!==series[seg][hover]?<span style={{color:"#fbbf24",fontWeight:700}}> · cleaned</span>:null}</div>:null)}</div>}
    </div>
    <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center",marginTop:5}}>{segments.map(s=>{const last=[...data].reverse().find(d=>d[s]!=null);const n=Math.round(Number(last?.[s+"__ships"]||0));return <span key={s} style={{fontSize:10.5,color:colors[s]||C.blue,fontWeight:700}}>● {s}{n?` · ${n} ships`:""}</span>})}</div>
  </div>;
}

function RegionCompareChart({rows,colors}) {
  if(!rows?.length)return <div style={{color:C.faint,fontSize:11,padding:20,textAlign:"center"}}>No regional data.</div>;
  const max=Math.max(1,...rows.flatMap(r=>[r.now||0,r.d30||0]));
  return <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:3}}>
    {rows.map(r=><div key={r.region} style={{display:"grid",gridTemplateColumns:"145px 1fr 38px",gap:8,alignItems:"center"}}>
      <span style={{fontSize:10,fontWeight:800,color:colors[r.region]||C.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.region}</span>
      <div style={{display:"grid",gap:3}}>
        <div title={`${r.region} · Current: ${r.now}`} style={{height:7,background:C.bg4,borderRadius:99,overflow:"hidden",cursor:"help"}}><div style={{height:"100%",width:Math.max(r.now?2:0,r.now/max*100)+"%",background:"#1769d2",borderRadius:99}}/></div>
        <div title={`${r.region} · 30d ago: ${r.d30}`} style={{height:7,background:C.bg4,borderRadius:99,overflow:"hidden",cursor:"help"}}><div style={{height:"100%",width:Math.max(r.d30?2:0,r.d30/max*100)+"%",background:"rgba(190,202,220,.62)",borderRadius:99}}/></div>
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
