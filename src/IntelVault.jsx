import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { loadImg } from "./utils";
import { loadIntel, saveIntelItem, deleteIntelItem } from "./supabaseHelpers";

function IntelVault({onVaultUpdate}){
  const [items,setItems]=useState([]);
  const [text,setText]=useState("");
  const [img,setImg]=useState(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState(null);
  const [activeTag,setActiveTag]=useState(null);
  const [intelDate,setIntelDate]=useState(()=>new Date().toISOString().slice(0,10));
  const fRef=useRef(null);

  const TAGS=["RATES","FIXTURE","QUOTE","MARKET","FM","RUMOUR","COUNTERPARTY","EVENT","TC","SALE"];
  const TAG_COLORS={"RATES":C.amber,"FIXTURE":C.green,"QUOTE":"#38bdf8","MARKET":C.blue,"FM":C.red,"RUMOUR":C.purple,"COUNTERPARTY":"#e879f9","EVENT":"#34d399","TC":"#fb923c","SALE":"#a3e635"};

  useEffect(()=>{loadIntel().then(d=>{setItems(d);onVaultUpdate&&onVaultUpdate(d);});},[]);

  async function ingest(){
    if(!text.trim()&&!img){setStatus({t:"error",m:"Paste text or attach image."});return;}
    setBusy(true);setStatus({t:"info",m:"Extracting…"});
    try{
      const imgBlock=img?[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}}]:[];
      const today=new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:2000,
          system:`You are a maritime market intelligence extractor. Today is ${today}.

Split the input into logical items grouped by LIFETIME and TYPE. Output as JSON array only, no markdown.

Each item: {"tag":"TAG","title":"short title max 6 words","content":"full intel text"}

Tag rules — use exactly one of:
- RATES: rate assessments, WS levels, $/mt, lumpsum valuations
- FIXTURE: confirmed fixtures or on-subs (named vessel OR named charterer with route+cargo)
- QUOTE: unconfirmed cargo enquiries, indications, requirements (no vessel fixed yet)
- MARKET: market commentary, supply/demand, tone, sentiment
- FM: force majeure declarations, refinery outages, operational disruptions
- RUMOUR: unconfirmed market talk, heard numbers, soft intel
- COUNTERPARTY: intel about specific companies, people, trading patterns
- EVENT: conferences, meetings, holidays, deadlines
- TC: time charter fixtures or renewals
- SALE: vessel sale candidates, S&P activity

Rules:
- Group ALL fixtures from same region/report into ONE item under FIXTURE
- Group ALL rate assessments into ONE item under RATES  
- Group ALL cargo quotes/enquiries into ONE item under QUOTE
- Keep FM, RUMOUR, COUNTERPARTY, EVENT, TC, SALE as separate items each
- Preserve all numbers, names, ports, dates exactly
- Content should be dense and factual, no filler words
- Output ONLY the JSON array, nothing else`,
          messages:[{role:"user",content:[...imgBlock,{type:"text",text:text||"Extract market intel from this image."}]}]
        })
      });
      const d=await res.json();
      const raw=(d.content||[]).map(b=>b.text||"").join("").trim();
      let parsed=[];
      try{
        const clean=raw.replace(/^```[\w]*/,"").replace(/```$/,"").trim();
        parsed=JSON.parse(clean);
      }catch(e){
        // fallback: store as single MARKET item
        parsed=[{tag:"MARKET",title:"Market intel",content:raw}];
      }
      const newItems=[];
      for(const item of parsed){
        const lineItem={
          id:"iv_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
          raw:text,
          extracted:item.content,
          title:item.title||item.content.slice(0,40),
          tag:item.tag||"MARKET",
          addedAt:intelDate?new Date(intelDate).toISOString():new Date().toISOString(),
          hasImg:!!img
        };
        const saved=await saveIntelItem({...lineItem,comment:JSON.stringify({tag:lineItem.tag,title:lineItem.title,content:lineItem.extracted})});
        newItems.push(saved?{...lineItem,id:saved.id}:lineItem);
      }
      const next=[...newItems,...items];
      setItems(next);onVaultUpdate&&onVaultUpdate(next);
      setText("");setImg(null);
      setStatus({t:"success",m:"✓ "+newItems.length+" item"+(newItems.length!==1?"s":"")+" stored"});
      setTimeout(()=>setStatus(null),3000);
    }catch(e){setStatus({t:"error",m:e.message});}finally{setBusy(false);}
  }

  function del(id){const next=items.filter(i=>i.id!==id);setItems(next);deleteIntelItem(id);onVaultUpdate&&onVaultUpdate(next);}

  // Parse stored items — handle both old format (plain string) and new format (JSON)
  function parseItem(item){
    if(item.tag&&item.title) return item;
    try{
      const p=JSON.parse(item.extracted||"{}");
      if(p.tag) return {...item,tag:p.tag,title:p.title,extracted:p.content};
    }catch(_){}
    // old format — guess tag from content
    const txt=(item.extracted||"").toUpperCase();
    const tag=txt.includes("W4")||txt.includes("PMT")||txt.includes("$/MT")?"RATES":txt.includes("FIXED")||txt.includes("SUBS")?"FIXTURE":txt.includes("FORCE MAJ")?"FM":"MARKET";
    return {...item,tag,title:item.extracted?.slice(0,40)||"—"};
  }

  const parsedItems=items.map(parseItem);
  const usedTags=[...new Set(parsedItems.map(i=>i.tag))].filter(Boolean);
  const filtered=activeTag?parsedItems.filter(i=>i.tag===activeTag):parsedItems;
  const sc=status?.t==="success"?C.green:status?.t==="error"?C.red:C.blue;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {/* Input area */}
      <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,overflow:"hidden"}}>
        <textarea value={text} onChange={e=>setText(e.target.value)}
          onPaste={e=>{for(const it of Array.from(e.clipboardData?.items||[])){if(it.type.startsWith("image/")){e.preventDefault();loadImg(it.getAsFile(),setImg);return;}}}}
          placeholder={"Paste rates, broker reports, news, market colour…\nor attach a screenshot below"}
          style={{width:"100%",minHeight:60,background:"transparent",border:"none",color:C.tx,fontFamily:"inherit",fontSize:12,padding:"6px 8px",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:5,padding:"4px 6px",borderTop:"1px solid "+C.bd2,alignItems:"center"}}>
          <button onClick={ingest} disabled={busy||(!text.trim()&&!img)}
            style={{flex:1,background:busy?"#1a4a8f":"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"4px 0",cursor:busy?"default":"pointer"}}>
            {busy?"⟳ Extracting…":"Save Intel"}
          </button>
          <input type="date" value={intelDate} onChange={e=>setIntelDate(e.target.value)} title="Date of this intel" style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:3,color:C.dim,fontFamily:"inherit",fontSize:12,padding:"2px 5px",outline:"none",width:118,flexShrink:0}}/>
          <button onClick={()=>fRef.current?.click()} title="Attach image/screenshot"
            style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"2px 8px",fontFamily:"inherit",fontSize:12,cursor:"pointer"}}>🖼</button>
          <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{loadImg(e.target.files?.[0],setImg);e.target.value="";}}/>
          {img&&<span style={{fontSize:12,color:C.purple}}>📷</span>}
        </div>
      </div>
      {status&&<div style={{fontSize:12,color:sc,padding:"2px 0"}}>{status.m}</div>}

      {/* Category filter buttons */}
      {usedTags.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          <button onClick={()=>setActiveTag(null)}
            style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(activeTag===null?C.blue:C.bd),background:activeTag===null?"rgba(88,166,255,.15)":"transparent",color:activeTag===null?C.blue:C.dim,cursor:"pointer",fontFamily:"inherit"}}>
            ALL {parsedItems.length}
          </button>
          {usedTags.map(tag=>{
            const col=TAG_COLORS[tag]||C.dim;
            const cnt=parsedItems.filter(i=>i.tag===tag).length;
            const isActive=activeTag===tag;
            return(
              <button key={tag} onClick={()=>setActiveTag(t=>t===tag?null:tag)}
                style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(isActive?col:col+"44"),background:isActive?col+"22":"transparent",color:isActive?col:col+"aa",cursor:"pointer",fontFamily:"inherit"}}>
                {tag} {cnt}
              </button>
            );
          })}
        </div>
      )}

      {/* Item list */}
      <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:200,overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:C.bd2+" transparent"}}>
        {filtered.length===0&&<div style={{fontSize:12,color:C.faint,fontStyle:"italic"}}>Nothing stored yet.</div>}
        {filtered.map(item=>{
          const col=TAG_COLORS[item.tag]||C.dim;
          return(
            <div key={item.id}
              style={{display:"flex",alignItems:"center",gap:6,background:C.bg3,border:"1px solid "+col+"33",borderRadius:4,padding:"4px 8px",cursor:"default"}}>
              <span style={{fontSize:10,fontWeight:700,color:col,flexShrink:0,minWidth:52,textAlign:"center",background:col+"18",borderRadius:3,padding:"1px 4px"}}>{item.tag}</span>
              <span style={{flex:1,fontSize:12,color:C.tx,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={item.extracted}>{item.title||item.extracted?.slice(0,50)||"—"}</span>
              <span style={{fontSize:10,color:C.faint,flexShrink:0}}>{new Date(item.addedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</span>
              <button onClick={()=>del(item.id)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11,opacity:0.5,padding:"0 2px",flexShrink:0}}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AI Ask ───────────────────────────────────────────────────────────────────

export default IntelVault;
