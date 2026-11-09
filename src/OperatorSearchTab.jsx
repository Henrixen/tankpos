import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const normalize = value => String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const csvCell = value => { const s=String(value??""); return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
const headers = ["Vessel", "Operator", "Owner", "DWT", "Coating", "Built"];
function parseNames(input) {
  return input.split(/\r?\n/).map(line => {
    let s=line.trim();
    if (!s || /^\s*\|?\s*:?-{2,}/.test(s)) return "";
    if (s.includes("|")) s=s.split("|").map(v=>v.trim()).filter(Boolean)[0]||"";
    else if (s.includes("\t")) s=s.split("\t")[0].trim();
    else if (s.includes(",") && !/^[^,]+,\s*(?:jr|sr)\.?$/i.test(s)) s=s.split(",")[0].trim();
    s=s.replace(/^[-*•]\s*/,"").replace(/^\d+[.)]\s*/,"").replace(/^['"`]+|['"`]+$/g,"").trim();
    if (/^(vessel|vessel name|ship|ship name|name)$/i.test(s)) return "";
    return s;
  }).filter(Boolean);
}
function downloadCSV(rows) {
  const content="\uFEFF"+[headers,...rows.map(r=>[r.vessel,r.operator,r.owner,r.dwt,r.coating,r.built])].map(row=>row.map(csvCell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a"); a.href=url;a.download=`operator_search_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const button = {fontFamily:"inherit",fontSize:12,fontWeight:700,padding:"7px 13px",borderRadius:6,cursor:"pointer",background:"rgba(88,166,255,.13)",border:"1px solid rgba(88,166,255,.38)",color:"#79bdff"};
export default function OperatorSearchTab() {
  const [input,setInput]=useState("");
  const [fleet,setFleet]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [copyStatus,setCopyStatus]=useState("");
  const [query,setQuery]=useState("");
  useEffect(()=>{
    let active=true;
    (async()=>{
      try {
        const all=[];let from=0;
        for(;;){
          const {data,error}=await supabase.from("vessels_db").select("vessel,operator,owner,dwt,coating,built,last_ex_name").range(from,from+999);
          if(error) throw error;
          all.push(...(data||[]));
          if(!data || data.length<1000)break;
          from+=1000;
        }
        if(active)setFleet(all);
      } catch(e){if(active)setError(e.message||"Could not load Fleet DB");}
      finally{if(active)setLoading(false);}
    })();
    return ()=>{active=false;};
  },[]);
  const names=useMemo(()=>parseNames(query),[query]);
  const results=useMemo(()=>{
    const index=new Map();
    for(const ship of fleet){
      const key=normalize(ship.vessel);
      if(key && !index.has(key))index.set(key,ship);
      const ex=normalize(ship.last_ex_name);
      if(ex && !index.has(ex))index.set(ex,ship);
    }
    return names.map(vessel=>{
      const match=index.get(normalize(vessel));
      return {vessel,operator:match?.operator||"",owner:match?.owner||"",dwt:match?.dwt||"",coating:match?.coating||"",built:match?.built||"",found:!!match,matchedName:match?.vessel||""};
    });
  },[names,fleet]);
  const matched=results.filter(r=>r.found).length;
  const copy=async()=>{
    const tsv=[headers,...results.map(r=>[r.vessel,r.operator,r.owner,r.dwt,r.coating,r.built])].map(row=>row.map(v=>String(v??"").replace(/[\t\r\n]/g," ")).join("\t")).join("\n");
    try {await navigator.clipboard.writeText(tsv);setCopyStatus("Copied table");}
    catch(e){setCopyStatus("Clipboard blocked — use Export CSV");}
  };
  const th={fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:'.05em',padding:"10px 12px",textAlign:"left",borderBottom:`1px solid ${C.bd}`,whiteSpace:"nowrap"};
  const td={fontSize:12,color:C.tx,padding:"9px 12px",borderBottom:`1px solid ${C.bd}`,whiteSpace:"nowrap"};
  return <div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{background:C.bg2,border:`1px solid ${C.bd}`,borderRadius:9,padding:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.tx,marginBottom:5}}>Operator Search</div>
      <div style={{fontSize:12,color:C.faint,marginBottom:12}}>Paste vessel names, one per line, or paste a table from Excel / Markdown. The first column is used for vessel names. Matches Fleet DB by vessel name or former name.</div>
      <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={"Chemical Mariner\nNordic Ami\nNavig8 Estelle"} rows={6} style={{width:"100%",boxSizing:"border-box",resize:"vertical",background:C.bg3,border:`1px solid ${C.bd}`,borderRadius:6,color:C.tx,padding:12,fontSize:12,fontFamily:"inherit"}}/>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:10}}>
        <button style={button} onClick={()=>setQuery(input)}>Match vessels</button>
        <button style={{...button,background:"transparent",color:C.faint,border:`1px solid ${C.bd}`}} onClick={()=>{setInput("");setQuery("");setCopyStatus("");}}>Clear</button>
        {loading?<span style={{fontSize:11,color:C.faint}}>Loading Fleet DB…</span>:error?<span style={{fontSize:11,color:"#ff6b6b"}}>{error}</span>:<span style={{fontSize:11,color:C.faint}}>{fleet.length.toLocaleString()} fleet records available</span>}
      </div>
    </div>
    {results.length>0&&<div style={{background:C.bg2,border:`1px solid ${C.bd}`,borderRadius:9,overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"12px 14px",flexWrap:"wrap"}}>
        <div style={{fontSize:12,color:C.tx,fontWeight:700}}>Results <span style={{fontWeight:400,color:C.faint}}>· {matched}/{results.length} matched · {results.length-matched} not found</span></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button style={button} onClick={copy}>Copy table</button>
          <button style={button} onClick={()=>downloadCSV(results)}>Export CSV</button>
          {copyStatus&&<span style={{fontSize:11,color:C.faint}}>{copyStatus}</span>}
        </div>
      </div>
      <div style={{overflowX:"auto",maxHeight:620,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}><thead style={{position:"sticky",top:0,background:C.bg3,zIndex:1}}><tr>{headers.map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{results.map((r,i)=><tr key={`${i}-${r.vessel}`} style={{background:i%2?"rgba(88,166,255,.035)":"transparent"}}>
            <td style={{...td,fontWeight:700}}>{r.vessel}{!r.found&&<span style={{color:"#f5a623",fontSize:10,marginLeft:9}}>NOT FOUND</span>}{r.found&&normalize(r.vessel)!==normalize(r.matchedName)&&<span style={{fontSize:10,color:C.faint,marginLeft:8}} title="Matched former vessel name">→ {r.matchedName}</span>}</td>
            <td style={{...td,color:"#79bdff"}}>{r.operator||"—"}</td><td style={td}>{r.owner||"—"}</td>
            <td style={{...td,fontVariantNumeric:"tabular-nums"}}>{r.dwt?Number(String(r.dwt).replace(/\s/g,"")).toLocaleString("en-US").replace(/,/g," "):"—"}</td>
            <td style={td}>{r.coating||"—"}</td><td style={td}>{r.built||"—"}</td>
          </tr>)}</tbody></table>
      </div>
    </div>}
  </div>;
}
