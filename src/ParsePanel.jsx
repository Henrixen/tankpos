import {normalizeCargoEntry} from "./cargoNormalization";
import React, { useState, useRef, useEffect } from "react";
import {createPortal} from "react-dom";
import {getUsageEntries,getUsageCache,subscribeUsage,downloadUsageCSV} from "./aiUsage";
import * as XLSX from "xlsx";
import { C } from "./constants";
import { loadImg, normaliseQty, rollOpenDateForward, dbLookup, resolveVesselName } from "./utils";
import { apiCall, ocrImage, parsePos, parseCargo } from "./api";

// Explicit cargo-batch metadata. Only a standalone final non-empty line is a directive.
// Fail closed on malformed/duplicate directives so no source is silently misassigned.
function extractCargoBatchSource(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  let end = lines.length - 1;
  while (end >= 0 && !lines[end].trim()) end--;
  const directive = /^\s*source\s+all\s*:\s*(.*?)\s*$/i;
  const candidate = end >= 0 ? lines[end].trim() : "";
  const match = candidate.match(directive);
  const earlier = lines.slice(0, match ? end : end + 1).filter(line => /^\s*source\s+all\s*:/i.test(line));
  if (earlier.length) throw new Error("SOURCE ALL must appear once, on the final line of the cargo list.");
  if (!match) {
    if (/^\s*source\s+all\b/i.test(candidate)) throw new Error("Use SOURCE ALL: Stenersen (with a colon and a source name).");
    return { text: rawText, source: null };
  }
  const source = match[1].trim();
  if (!source || source.length > 100 || /[\t\r\n]/.test(source)) throw new Error("SOURCE ALL needs a source name of 1–100 characters.");
  return { text: lines.slice(0, end).join("\n"), source };
}

function ParsePanel({vessels,cargoes,onAddVessels,onAddCargoes,lockedMode,vesselDB = {}}) {
  const [posDate, setPosDate] = useState(() => {const d=new Date();return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();});
  const [mode,setMode]=useState(lockedMode||"pos");
  const [text,setText]=useState("");const [img,setImg]=useState(null);
  const [busy,setBusy]=useState(false);const [status,setStatus]=useState(null);
  const fRef=useRef(null);const xlsRef=useRef(null);const parseLock=useRef(false);
  const [usageOpen,setUsageOpen]=useState(false);

  // Auto-load vesselDB if empty (for spec enrichment)
  useEffect(() => {
    if (mode === "pos" && Object.keys(vesselDB).length === 0 && window.vesselDB && Object.keys(window.vesselDB).length > 0) {
      console.log("Using window.vesselDB in ParsePanel");
    }
  }, [mode, vesselDB]);

  async function handleXls(file){
    if(!file||parseLock.current)return;
    parseLock.current=true;setBusy(true);setStatus({t:"info",m:"Reading spreadsheet…"});
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array",cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      if(!rows.length){setStatus({t:"error",m:"Empty file."});return;}
      const hdr=Object.keys(rows[0]);
      const fnd=keys=>{const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,"");return keys.map(k=>hdr.find(h=>norm(h)===norm(k))).find(Boolean)||keys.map(k=>hdr.find(h=>norm(h).includes(norm(k)))).find(Boolean)||null;};
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
          const status=rawSt==="FIXED"?"FIXED":rawSt==="SUBS"?"SUBS":rawSt==="FAILED"?"FAILED":"";
          const cUpdated=fnd(["updated date","updated","date updated","last updated"]);
          const rawUpd=r[cUpdated];
          const addedAt=rawUpd instanceof Date?rawUpd.toISOString():rawUpd?new Date(rawUpd).toISOString()||new Date().toISOString():new Date().toISOString();
          return {id:"xls-"+Date.now()+"-"+idx+"-"+Math.random().toString(36).slice(2,5),charterer:String(r[cCharterer]||"").trim(),vessel,qty:fmtQ(r[cQty]),cargo:String(r[cProduct]||"").trim().toUpperCase(),load:String(r[cLoad]||"").trim(),disch:String(r[cDisch]||"").trim(),from:ls,to:le,freight:String(r[cFreight]||"").trim(),comment:String(r[cComment]||"").trim(),status,updated:addedAt};
        }).filter(r=>r.charterer||r.vessel||r.load);
        if(!parsed.length){setStatus({t:"error",m:"No cargo rows found. Check column headers."});return;}
        const lk=onAddCargoes(parsed.map(row=>normalizeCargoEntry(row)));
        setStatus({t:"success",m:"✓ "+parsed.length+" fixtures imported from "+rows.length+" rows"+(lk?", "+lk+" pos updated":"")});
      }
    }catch(e){setStatus({t:"error",m:"Import error: "+e.message});}finally{parseLock.current=false;setBusy(false);}
  }

  function onPaste(e){for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}
  async function go(){
    if(parseLock.current)return;
    if(!text.trim()&&!img){setStatus({t:"error",m:"Paste text or attach image."});return;}
    parseLock.current=true;setBusy(true);setStatus({t:"info",m:img?"Reading image…":"Parsing…"});
    try{
      const knownVessels=vessels.map(v=>v.vessel).filter(Boolean);const knownCargo=[...new Set((cargoes||[]).map(c=>c.vessel).filter(Boolean))];const known=[...new Set([...knownVessels,...knownCargo])];
      if(mode==="pos"){
  const p=await parsePos(text||"(img)",img,known);
  if(!p?.length){setStatus({t:"error",m:"No vessel data found."});return;}

  console.log("parsed:", JSON.stringify(p));

  const [dd,mm,yyyy]=posDate.split("/");
  const baseDate=(dd&&mm&&yyyy)
    ? new Date(`${yyyy}-${mm}-${dd}T00:00:00`)
    : new Date();

  const ts=baseDate.toISOString();

  // Use vesselDB from props or fallback to window.vesselDB
  const vdb = Object.keys(vesselDB).length > 0 ? vesselDB : (window.vesselDB || {});
  
  console.log("vesselDB available:", Object.keys(vdb).length, "vessels");

  // Enrich with vesselDB spec data before saving
  const stamped=p.map(v=>{
    const vesselKey = v.vessel?.toUpperCase();
    const dbVessel = dbLookup(v.vessel, vdb);
    const canonicalVessel = resolveVesselName(v.vessel, vdb);
    
    if (dbVessel) {
      console.log("Found spec for", vesselKey, ":", dbVessel.ice_class, dbVessel.segment);
    }
    
    return {
      ...v,
      vessel: canonicalVessel,
      date: v.openPort==="EMPLOYED" ? v.date : rollOpenDateForward(v.date, baseDate),
      updatedAt: ts,
      // Keep coating at top level because Positions/Fleet UI reads v.coating.
      coating: v.coating || dbVessel?.coating || dbVessel?.coated || null,
      // Add spec data from vesselDB if available
      spec: dbVessel ? {
        iceClass: dbVessel.ice_class || null,
        lastCargo: dbVessel.last_cargo || null,
        coated: dbVessel.coating || dbVessel.coated || null,
        segment: dbVessel.segment || null,
      } : v.spec || null
    };
  });

  const r=onAddVessels(stamped);
  setText("");
  setImg(null);

  setStatus({
    t:"success",
    m:"✓ "+(r.added?r.added+" added":"")+(r.updated?", "+r.updated+" updated":"")+" - "+r.total+" total"
  });
      }else{
        const batch=extractCargoBatchSource(text);
        if (!batch.text.trim() && !img) throw new Error("No cargo rows before SOURCE ALL instruction.");
        const p=await parseCargo(batch.text||(img?"(img)":""),img,known);if(!p?.length){setStatus({t:"error",m:"No fixture data found."});return;}
        const [dd,mm,yyyy]=posDate.split("/");const ts=(dd&&mm&&yyyy)?new Date(`${yyyy}-${mm}-${dd}`).toISOString():new Date().toISOString();
        const stamped=p.map(v=>({...v,updated:ts,...(batch.source!==null?{source:batch.source}:{})}));
        await onAddCargoes(stamped);setText("");setImg(null);
        setStatus({t:"success",m:"✓ "+p.length+" fixture(s) submitted"+(batch.source?" · Source: "+batch.source:"")});
      }
    }catch(e){setStatus({t:"error",m:e.message});}finally{parseLock.current=false;setBusy(false);}
  }
  const sc=status?.t==="success"?C.green:status?.t==="error"?C.red:C.blue;
  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden"}}>
      {!lockedMode&&<div style={{display:"flex",borderBottom:"1px solid "+C.bd2}}>
        {[["pos","⚓ Positions"],["cargo","📦 Cargoes"]].map(([m,l])=>(
          <button key={m} onClick={()=>{setMode(m);setStatus(null);}} style={{flex:1,padding:"6px",border:"none",background:"transparent",color:mode===m?C.blue:C.dim,fontFamily:"inherit",fontSize:12,fontWeight:700,borderBottom:"2px solid "+(mode===m?C.blue:"transparent"),cursor:"pointer"}}>{l}</button>
        ))}
      </div>}
      {img?.dataUrl&&<div style={{position:"relative"}}><img src={img.dataUrl} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",display:"block"}}/><button onClick={()=>setImg(null)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:"50%",width:20,height:20,fontSize:12,cursor:"pointer"}}>✕</button></div>}
      {img&&!img.dataUrl&&<div style={{padding:"3px 10px",background:"rgba(188,140,255,.07)",fontSize:12,color:C.purple,display:"flex",justifyContent:"space-between"}}><span>📷 attached</span><button onClick={()=>setImg(null)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:12}}>✕</button></div>}
      <textarea value={text} onChange={e=>setText(e.target.value)} onPaste={onPaste}
        placeholder={mode==="pos"?"Paste positions or Ctrl+V screenshot…":"Paste cargoes and fixtures\nAdd SOURCE ALL: XXX at the end to designate source"}
        style={{width:"100%",minHeight:130,background:C.bg2,border:"none",color:C.tx,fontFamily:"inherit",fontSize:12,padding:lockedMode==="cargo"?"32px 10px 6px":"6px 10px",resize:"none",outline:"none",boxSizing:"border-box"}}/>
        <div style={{padding:"5px 8px",borderTop:"1px solid "+C.bd2,display:"flex",gap:5,alignItems:"center"}}>
        <button onClick={go} disabled={busy} style={{flex:1,background:busy?"rgba(31,111,235,.10)":"rgba(10,25,45,.72)",border:"1px solid "+(busy?"rgba(88,166,255,.30)":"#2f6fae"),borderRadius:4,color:busy?C.dim:"#79c0ff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px 0",cursor:busy?"default":"pointer"}}>
          {busy?"⟳ Processing…":"▶ Parse & Add"}
        </button>
        <button onClick={()=>fRef.current?.click()} title="Upload image / screenshot" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"3px 10px",fontFamily:"inherit",fontSize:12,cursor:"pointer",flexShrink:0}}>🖼</button>
        {(mode==="pos"||mode==="cargo")&&<input type="text" value={posDate} onChange={e=>setPosDate(e.target.value)} placeholder="DD/MM/YYYY" title={mode==="pos"?"Date of this position list":"Date of this cargo list"} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:3,color:C.dim,fontFamily:"inherit",fontSize:12,padding:"2px 5px",outline:"none",width:118,flexShrink:0}}/>}
        <button onClick={()=>xlsRef.current?.click()} title="Upload Excel / CSV" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"3px 8px",fontFamily:"inherit",fontSize:12,cursor:"pointer",flexShrink:0}}>📊</button>
        <button type="button" onClick={()=>setUsageOpen(true)} title="Actual token usage returned for requests in this browser" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:"#79c0ff",padding:"4px 7px",fontSize:11,cursor:"pointer"}}>Usage</button>
        <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
        <input ref={xlsRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>handleXls(e.target.files?.[0])}/>
      </div>
      {usageOpen&&createPortal(<ParsingUsageDialog onClose={()=>setUsageOpen(false)}/>,document.body)}
      {status&&<div style={{padding:"2px 8px 6px"}}><div style={{padding:"4px 10px",borderRadius:5,fontSize:12,background:sc+"18",color:sc,border:"1px solid "+sc+"44"}}>{status.m}</div></div>}
    </div>
  );
}

function ParsingUsageDialog({onClose}){
 const [,setVersion]=useState(0);
 useEffect(()=>subscribeUsage(()=>setVersion(x=>x+1)),[]);
 const rows=getUsageEntries(),totals=getUsageCache();
 const td={padding:"7px 8px",borderBottom:"1px solid #29405b",textAlign:"left",whiteSpace:"nowrap",fontSize:11};
 const button={background:"#183956",color:"#cce8ff",border:"1px solid #46749c",borderRadius:4,padding:"7px 11px",cursor:"pointer"};
 return <div onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:60000,background:"#000a",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div role="dialog" aria-modal="true" aria-label="Parsing token usage" style={{width:"min(1100px,96vw)",maxHeight:"85vh",overflow:"auto",padding:18,borderRadius:8,border:"1px solid #46749c",background:"#0b1b30",color:"#d8eaff",fontFamily:"Arial,sans-serif"}}>
 <div style={{display:"flex",alignItems:"center",gap:10}}><b style={{fontSize:17}}>Parsing usage · this browser</b><button style={{...button,marginLeft:"auto"}} onClick={downloadUsageCSV}>Export CSV</button><button style={button} onClick={onClose}>Close</button></div>
 <p style={{fontSize:12,color:"#9bb9d8",lineHeight:1.6}}>Actual token counts when returned by /api/claude. Estimated standard API cost, not an Anthropic invoice or organisation total. Includes only instrumented requests in this browser (last 3,000). Other devices and separate report/image endpoints are not included. No usage-log database polling.</p>
 <div style={{display:"flex",flexWrap:"wrap",gap:20,fontSize:13,marginBottom:12}}><span>Requests: <b>{totals.requests}</b></span><span>Input tokens: <b>{totals.input_tokens.toLocaleString()}</b></span><span>Output tokens: <b>{totals.output_tokens.toLocaleString()}</b></span><span>Today's recorded estimate: <b>${totals.today.toFixed(4)}</b>{totals.incomplete?" · incomplete":""}</span></div>
 {(totals.usage_missing>0||totals.unpriced>0)&&<div style={{fontSize:12,color:"#f2c27d",paddingBottom:12}}>Missing usage: {totals.usage_missing} request(s). Unpriced: {totals.unpriced}. The server must forward Claude's usage and actual model to price those requests. They are not assumed to be free.</div>}
 {totals.storage_failed&&<p>History could not be saved to browser storage. Export it before closing this page.</p>}
 <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%"}}><thead><tr>{["Time (Oslo)","User","Action","Actual model","Input","Output","Est. USD","Status"].map(h=><th style={td} key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,100).map(r=><tr key={r.id} title={`Request: ${r.request_id||r.id} · ${r.duration_ms||0} ms · ${r.input_chars||0} prompt characters${r.error?" · "+r.error:""}`}><td style={td}>{new Date(r.timestamp).toLocaleString("en-GB",{timeZone:"Europe/Oslo"})}</td><td style={td}>{r.user}</td><td style={td}>{r.action}</td><td style={td}>{r.model||"Not returned"}</td><td style={td}>{r.input_tokens??"Unknown"}</td><td style={td}>{r.output_tokens??"Unknown"}</td><td style={td}>{r.cost_usd==null?"Unknown":r.cost_usd.toFixed(6)}</td><td style={{...td,color:Number(r.status)>=400?"#fca5a5":"#a9d3ee"}}>{r.status}</td></tr>)}</tbody></table></div>
 {!rows.length&&<div style={{padding:20,fontSize:12}}>No requests recorded yet. Parse something, then open Usage again. Identical cached parses do not make a new AI request.</div>}
 </div></div>;
}

// ─── Inline edit cell ─────────────────────────────────────────────────────────
function EC({value,color,placeholder,onSave,bold,onTab,onShiftTab,onEnter,...rest}){
  const [ed,setEd]=useState(false);const [draft,setDraft]=useState("");const [hov,setHov]=useState(false);const ref=useRef(null);
  function start(e){e.stopPropagation();setDraft(value||"");setEd(true);setTimeout(()=>{if(ref.current){ref.current.focus();ref.current.select?.();}},15);}
  function commit(){setEd(false);const t=draft.trim();if(t!==(value||""))onSave(t);}
  function onKey(e){
    e.stopPropagation();
    if(e.key==="Enter"){e.preventDefault();commit();if(onEnter)setTimeout(onEnter,30);}
    if(e.key==="Escape"){e.preventDefault();setEd(false);}
    if(e.key==="Tab"){e.preventDefault();commit();
      if(e.shiftKey){if(onShiftTab)setTimeout(onShiftTab,30);}
      else{if(onTab)setTimeout(onTab,30);}
    }
  }
  if(ed)return(
    <td onClick={e=>e.stopPropagation()} style={{padding:"3px 5px",background:"rgba(88,166,255,.06)",outline:"1px solid rgba(88,166,255,.4)",verticalAlign:"middle"}}>
      <input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={onKey} placeholder={placeholder||""}
        style={{background:C.bg,border:"1px solid "+C.blue,borderRadius:3,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"1px 4px",width:"100%",outline:"none",boxSizing:"border-box"}}/>
    </td>
  );
  return(
    <td onClick={start} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} title={value||(placeholder||"Click to edit")}
      style={{padding:"4px 7px",cursor:"text",outline:hov?"1px solid rgba(79,195,247,.3)":"1px solid transparent",outlineOffset:"-1px",verticalAlign:"middle",transition:"background .1s",whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} {...rest}>
      <div style={{display:"flex",alignItems:"center",gap:2,overflow:"hidden"}}>
        <span style={{color:value?(color||C.tx):C.faint,fontWeight:bold?700:400,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",minWidth:0}}>{value||""}</span>
        <span style={{color:C.faint,fontSize:12,opacity:hov?1:0}}>✎</span>
      </div>
    </td>
  );
}

// ─── Fixing Window Stats ──────────────────────────────────────────────────────
// ─── Opening Breakdown bar chart ──────────────────────────────────────────────

export default ParsePanel;
