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

function WSTracker() {
  const [data,    setData]    = useState(null);
  const [pasteText, setPaste] = useState("");
  const [img,       setImg]    = useState(null);
  const [parsing,  setParsing] = useState(false);
  const [status,   setStatus]  = useState(null);
  const [view,     setView]    = useState("table");
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
      const newHistory = [...prevHistory, snap].sort((a,b)=>{
        function pd(s){try{const m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);if(m)return new Date(`${m[2]} ${m[1]} ${m[3].length===2?"20"+m[3]:m[3]}`).getTime();return new Date(s).getTime()||0;}catch{return 0;}}
        return pd(a.date)-pd(b.date);
      }).slice(-90);

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
      // "07 May 26" or "07 May 2026"
      const m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
      if(m) return new Date(`${m[2]} ${m[1]} ${m[3].length===2?"20"+m[3]:m[3]}`).getTime();
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
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,color:C.dim,marginBottom:4}}>
          Paste data from broker recap, Baltic Exchange, or the FFA screenshot - any format works
        </div>
        {img?.dataUrl&&<div style={{position:"relative",marginBottom:4}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",borderRadius:4,display:"block"}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer"}}>✕</button></div>}
        {img&&!img.dataUrl&&<div style={{padding:"3px 10px",background:"rgba(188,140,255,.07)",borderRadius:4,fontSize:12,color:C.purple,display:"flex",justifyContent:"space-between",marginBottom:4}}><span>📷 Image attached</span><button onClick={()=>setImg(null)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:12}}>✕</button></div>}
        <textarea value={pasteText} onChange={e=>setPaste(e.target.value)}
          onPaste={e=>{for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}}
          placeholder={"TC2 (CONT/TA-37)  127.81(+1.87)  FEB/26: 130.50  MAR/26: 142.50  Q1: 135.50\nTC14 (USG/UKC-38)  270.71(+8.57)\nTC23 220.50  TC6 140.00\n\n- or Ctrl+V a screenshot -"}
          style={{width:"100%",minHeight:180,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"6px 10px",resize:"none",outline:"none",boxSizing:"border-box"}}/>
        <input ref={wsFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
        <div style={{display:"flex",gap:6,marginTop:5,alignItems:"center"}}>
          <button onClick={parseWS} disabled={parsing} style={{background:parsing?"#1a4a8f":"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px 18px",cursor:parsing?"default":"pointer"}}>
            {parsing?"⟳ "+(img?"Reading image…":"Parsing…"):"▶ Parse & Save"}
          </button>
          <button onClick={()=>wsFileRef.current?.click()} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"4px 8px",fontFamily:"inherit",fontSize:12,cursor:"pointer",flexShrink:0}}>📷</button>
          {status&&<div style={{fontSize:12,color:sc,padding:"3px 10px",background:sc+"18",borderRadius:4,border:"1px solid "+sc+"44"}}>{status.m}</div>}
        </div>
      </div>

      {/* Comment / Market Notes */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,color:C.dim,marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>📝 Market notes / commentary</span>
          <span style={{fontSize:12,color:C.faint}}>Auto-saved</span>
        </div>
        <textarea value={wsNote} onChange={e=>{setWsNote(e.target.value);supabase.from("dashboard").upsert({key:"ws-note",value:e.target.value},{onConflict:"key"});}}
          placeholder="e.g. TC2 firming on back of USAC demand, FFA contango widening, Baltic tightening..."
          style={{width:"100%",minHeight:54,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,
            fontFamily:"inherit",fontSize:12,padding:"6px 8px",resize:"vertical",boxSizing:"border-box"}}/>
      </div>

      {data&&<>
        {/* View toggle */}
        <div style={{display:"flex",gap:5,marginBottom:10}}>
          {[["table","📋 Table"],["chart","📈 Chart"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"4px 12px",border:"1px solid "+(view===v?C.blue:C.bd),borderRadius:4,background:view===v?"rgba(88,166,255,.12)":"transparent",color:view===v?C.blue:C.dim,fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
          ))}
          <span style={{marginLeft:"auto",fontSize:12,color:C.faint,alignSelf:"center"}}>Last update: {data.lastUpdate||"—"}</span>
        </div>

        {/* TABLE VIEW */}
        {view==="table"&&<>
          {/* Spot table */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Current Spot</div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:12,minWidth:400}}>
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
                        <td style={{...td2,fontWeight:800,color:C.tx,fontSize:12}}>{s?.ws!=null?s.ws.toFixed(2):"—"}</td>
                        <td style={{...td2,color:chgCol,fontWeight:700}}>{chg!=null?(chg>=0?"+":"")+chg.toFixed(2):"—"}</td>
                        <td style={{...td2,color:C.faint,fontSize:12}}>{r.desc}</td>
                        <td style={{...td2,color:C.faint,fontSize:12}}>{s?.updatedAt||"—"}</td>
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
              <div style={{fontSize:12,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>FFA Forward Curve (WS)</div>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr>
                      <th style={{...th2,textAlign:"left",minWidth:60}}>Route</th>
                      {(()=>{
                        const allKeys=new Set();
                        Object.values(data.ffa||{}).forEach(f=>Object.keys(f).filter(k=>k!=="updatedAt").forEach(k=>allKeys.add(k)));
                        const periodOrder=['Jan26','Feb26','Mar26','Apr26','May26','Jun26','Jul26','Aug26','Sep26','Oct26','Nov26','Dec26','Q126','Q226','Q326','Q426','AVE25','AVE26'];
                        const sorted=[...allKeys].sort((a,b)=>{const ai=periodOrder.indexOf(a),bi=periodOrder.indexOf(b);return(ai===-1?99:ai)-(bi===-1?99:bi);});
                        return sorted.map(p=>(<th key={p} style={th2}>{p}</th>));
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {ROUTES.filter(r=>data.ffa?.[r.id]).map(r=>{
                      const f=data.ffa[r.id]||{};
                      const spot=data.spot?.[r.id]?.ws;
                      const allKeys=new Set();
                      Object.values(data.ffa||{}).forEach(fx=>Object.keys(fx).filter(k=>k!=="updatedAt").forEach(k=>allKeys.add(k)));
                      const periodOrder=['Jan26','Feb26','Mar26','Apr26','May26','Jun26','Jul26','Aug26','Sep26','Oct26','Nov26','Dec26','Q126','Q226','Q326','Q426','AVE25','AVE26'];
                      const sorted=[...allKeys].sort((a,b)=>{const ai=periodOrder.indexOf(a),bi=periodOrder.indexOf(b);return(ai===-1?99:ai)-(bi===-1?99:bi);});
                      return(
                        <tr key={r.id}>
                          <td style={{...td2,textAlign:"left",fontWeight:700,color:routeColors[r.id]||C.blue}}>{r.name}</td>
                          {sorted.map(p=>{
                            const v=f[p];
                            const diff=v!=null&&spot!=null?v-spot:null;
                            const col=diff==null?C.dim:diff>0?C.red:C.green;
                            return(
                              <td key={p} style={{...td2}}>
                                {v!=null
                                  ? <div>
                                      <div style={{color:C.tx,fontWeight:600}}>{v.toFixed(1)}</div>
                                      {diff!=null&&<div style={{fontSize:12,color:col}}>{diff>=0?"+":""}{diff.toFixed(1)}</div>}
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
              <div style={{fontSize:12,color:C.faint,marginTop:4}}>Small number = diff vs spot. Green = backwardation (below spot). Red = contango (above spot).</div>
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
        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em"}}>
          📰 TradeWinds - Tanker News
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
      <div style={{display:"flex",flexDirection:"column",gap:0}}>
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

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({vessels, cargoes, history}) {
  const [bunkers, setBunkers] = useState(null);
  const [bLoading, setBLoading] = useState(false);
  const [bError, setBError] = useState(null);
  const [bFetched, setBFetched] = useState(false);
  const [bunkerHistory, setBunkerHistory] = useState([]); // New state for graph

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
    if (!v.fileDate || !v.date) return null;
    
    // Parse fileDate (should be ISO format like "2026-03-30")
    const fileDt = new Date(v.updatedAt || v.fileDate);
    if (isNaN(fileDt)) {
      console.warn('Invalid fileDate:', v.fileDate, 'for vessel:', v.vessel);
      return null;
    }
    
    // Parse openDate - try ISO first, then "DD Mon" format
    let openDt = new Date(v.date);
    if (isNaN(openDt)) {
      // Try "DD Mon" format like "1 Apr"
      const match = String(v.date).match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (match) {
        const day = parseInt(match[1]);
        const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
        const month = months[match[2].toLowerCase()];
        const year = fileDt.getFullYear(); // Use same year as fileDate
        openDt = new Date(year, month, day);
      }
    }
    
    if (isNaN(openDt)) {
      console.warn('Invalid openDate:', v.date, 'for vessel:', v.vessel);
      return null;
    }
    
    const diffMs = openDt - fileDt;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    console.log('Vessel:', v.vessel, 'FileDate:', fileDt.toISOString().slice(0,10), 'OpenDate:', openDt.toISOString().slice(0,10), 'Diff:', diffDays);
    
    return diffDays;
  };
  
  const withDays = openVessels.map(v => ({ ...v, days: calcFixingWindow(v) })).filter(v => v.days !== null);
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
    
    for(const v of openVessels){
      const d = calcFixingWindow(v);
      if(d === null) continue;
      const op = (v.operator||"Unknown").trim();
      todayByOp[op] = (todayByOp[op]||[]).concat(d);
    }
    
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

      {/* ── KPI row ── */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {card("Fleet vessels",     vessels.length,                                          null,       D.blue)}
        {card("Open / fixing",     openVessels.length,                                     null,       D.amber)}
        {card("Fixing window",     fleetAvg!=null?(fleetAvg>=0?"+"+fleetAvg+"d":fleetAvg+"d"):null, "avg days until open", fleetAvg<0?D.green:fleetAvg<=7?D.amber:D.blue)}
        {card("Fixed / subs",      vessels.filter(v=>v.openPort==="EMPLOYED").length,       null,       D.purple)}
        {card("History snapshots", history.length,                                          "data points",D.faint)}
      </div>

      {/* ── Charts row ── */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {panel(
          <>
            {secHead("Fixing window trend — fleet avg")}
            {chartData.length<=1
              ? <div style={{color:D.faint,fontSize:12,padding:"24px 0",textAlign:"center"}}>Parse positions to build trend data.</div>
              : <FWChart data={chartData}/>}
          </>,
          {flex:"1 1 340px",minWidth:280}
        )}
        {panel(
          <>
            {secHead("Fixing window by operator")}
            {allOps.length===0
              ? <div style={{color:D.faint,fontSize:12,padding:"24px 0",textAlign:"center"}}>Parse positions to build operator data.</div>
              : <OpChart data={opChartData} ops={allOps} colors={OP_COLORS}/>}
          </>,
          {flex:"1 1 340px",minWidth:280}
        )}
      </div>

      {/* ── Region + Bunkers row ── */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>

        {/* Region breakdown */}
        {panel(
          <>
            {secHead("Open fleet by region")}
            {Object.keys(regionCounts).length===0
              ? <div style={{color:D.faint,fontSize:12}}>No open vessels</div>
              : Object.entries(regionCounts).sort((a,b)=>b[1]-a[1]).map(([r,n])=>{
                  const pct=Math.round(n/openVessels.length*100);
                  const col={WCUK:D.blue,ECUK:D.green,CANAL:D.amber,BISCAY:D.purple,SKAW:"#ff9f43",BALTIC:D.red,Other:D.faint,MED:D.pink}[r]||D.dim;
                  return(
                    <div key={r} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:12,fontWeight:700,color:col}}>{r}</span>
                        <span style={{fontSize:11,color:D.faint}}>{n} vessel{n!==1?"s":""}</span>
                      </div>
                      <div style={{height:5,background:D.bg4,borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:pct+"%",background:col,borderRadius:3,transition:"width .4s",boxShadow:"0 0 6px "+col+"66"}}/>
                      </div>
                    </div>
                  );
                })
            }
          </>,
          {flex:"1 1 260px"}
        )}

        {/* Bunker prices */}
        {panel(
          <>
            {secHead("Bunker prices USD/mt — PBT International")}
            {!bFetched&&!bLoading&&(
              <div style={{textAlign:"center",padding:"14px 0"}}>
                <div style={{fontSize:12,color:D.faint,marginBottom:10}}>Source: pbt-international.com · updated 3×/week</div>
                <button onClick={fetchBunkersPBT} style={{background:"rgba(88,166,255,0.15)",border:"1px solid rgba(88,166,255,0.35)",borderRadius:6,color:D.blue,fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"7px 20px",cursor:"pointer"}}>
                  Fetch live from PBT
                </button>
              </div>
            )}
            {bLoading&&<div style={{color:D.blue,fontSize:12,padding:"14px 0",textAlign:"center"}}>⟳ Fetching pbt-international.com…</div>}
            {bError&&<div style={{color:D.red,fontSize:12,padding:"6px 0"}}>{bError}<br/><button onClick={fetchBunkersPBT} style={{marginTop:4,background:"none",border:"1px solid "+D.border,borderRadius:4,color:D.dim,fontSize:12,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>Retry</button></div>}
            {bunkers&&(
              <div>
                <div style={{fontSize:11,color:D.faint,marginBottom:10}}>
                  Updated: {bunkers.date} · <a href="https://pbt-international.com/price-quotes" target="_blank" style={{color:D.blue,textDecoration:"none"}}>pbt-international.com</a>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:D.bg4}}>
                      <th style={{padding:"6px 10px",color:D.faint,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.07em",textAlign:"left"}}>Port</th>
                      <th style={{padding:"6px 10px",color:D.amber,fontWeight:700,fontSize:11,textTransform:"uppercase",textAlign:"right"}}>HSFO 380</th>
                      <th style={{padding:"6px 10px",color:D.green,fontWeight:700,fontSize:11,textTransform:"uppercase",textAlign:"right"}}>VLSFO 0.5%</th>
                      <th style={{padding:"6px 10px",color:D.blue,fontWeight:700,fontSize:11,textTransform:"uppercase",textAlign:"right"}}>MGO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["ARA (Rotterdam)", bunkers.ARA_HSFO, bunkers.ARA_VLSFO, bunkers.ARA_MGO],
                      ["Fujairah",        bunkers.FUJ_HSFO, bunkers.FUJ_VLSFO, bunkers.FUJ_MGO],
                      ["Singapore",       bunkers.SIN_HSFO, bunkers.SIN_VLSFO, bunkers.SIN_MGO],
                    ].map(([port,hsfo,vlsfo,mgo],i)=>(
                      <tr key={port} style={{background:i%2===0?"transparent":D.bg4,borderBottom:"1px solid "+D.border}}>
                        <td style={{padding:"7px 10px",color:D.dim,fontWeight:600}}>{port}</td>
                        <td style={{padding:"7px 10px",color:D.amber,fontWeight:700,textAlign:"right"}}>{hsfo?"$"+hsfo:"—"}</td>
                        <td style={{padding:"7px 10px",color:D.green,fontWeight:700,textAlign:"right"}}>{vlsfo?"$"+vlsfo:"—"}</td>
                        <td style={{padding:"7px 10px",color:D.blue,fontWeight:700,textAlign:"right"}}>{mgo?"$"+mgo:"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={fetchBunkersPBT} style={{marginTop:8,background:"none",border:"1px solid "+D.border,borderRadius:4,color:D.faint,fontSize:11,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>↻ Refresh from PBT</button>
              </div>
            )}
          </>,
          {flex:"1 1 380px"}
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
