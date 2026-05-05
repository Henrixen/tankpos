import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { loadIntel } from "./supabaseHelpers";
import IntelVault from "./IntelVault";

function AIAsk({vessels,cargoes,intelItems}){
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);
  const [convHistory,setConvHistory]=useState([]);

  function buildContext(){
    const cargoSummary=cargoes.map(c=>[c.status||"",c.charterer,c.cargo,c.qty,c.load,c.disch,c.from&&c.to?c.from+" - "+c.to:c.from||c.to,c.freight,c.vessel].filter(Boolean).join("|")).join("\n");
    const vesselSummary=vessels.map(v=>[v.vessel,v.operator,v.openPort,v.date,v.dwt&&v.dwt+"dwt",v.built&&"built:"+v.built,v.spec?.iceClass,v.spec?.lastCargo&&"lastcargo:"+v.spec.lastCargo].filter(Boolean).join("|")).join("\n");
    const vault=(intelItems||[]).map(i=>i.extracted).join("\n---\n");
    return `Today: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}\nCARGO FIXTURES (${cargoes.length}):\n${cargoSummary||"none"}\nVESSEL POSITIONS (${vessels.length}):\n${vesselSummary||"none"}\nMARKET INTEL VAULT (${(intelItems||[]).length} items):\n${vault||"none"}`;
  }

  async function ask(){
    const q=question.trim();if(!q||busy)return;
    setBusy(true);setAnswer("");
    try{
      const msgs=convHistory.slice(-6).flatMap(h=>[{role:"user",content:h.q},{role:"assistant",content:h.a}]);
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:500,
        system:"Maritime freight analyst. Short direct answers: facts and numbers only, max 4 sentences. No preamble.\n\n"+buildContext(),
        messages:[...msgs,{role:"user",content:q}]
      })});
      const d=await res.json();
      const a=(d.content||[]).map(b=>b.text||"").join("").trim()
        .replace(/\*\*(.*?)\*\*/g,"$1")
        .replace(/\*(.*?)\*/g,"$1")
        .replace(/^#{1,3}\s+/gm,"")
        .replace(/`([^`]+)`/g,"$1");
      setAnswer(a);setConvHistory(h=>[...h,{q,a}].slice(-10));setQuestion("");
    }catch(e){setAnswer("Error: "+e.message);}finally{setBusy(false);}
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <div style={{display:"flex",gap:5}}>
        <input value={question} onChange={e=>setQuestion(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")ask();}}
          placeholder="Ask about your data…"
          style={{flex:1,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"5px 9px",outline:"none"}}/>
        <button onClick={ask} disabled={busy||!question.trim()}
          style={{background:busy||!question.trim()?"#1a3a5f":"#1f6feb",border:"none",borderRadius:5,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px 14px",cursor:busy||!question.trim()?"default":"pointer",flexShrink:0}}>
          {busy?"…":"Ask"}
        </button>
      </div>
      {busy&&<div style={{fontSize:12,color:C.faint,padding:"2px 0"}}>thinking…</div>}
      {answer&&(
        <div style={{background:"rgba(80,200,120,0.06)",border:"1px solid rgba(80,200,120,0.25)",borderRadius:5,padding:"8px 10px",fontSize:12,color:C.tx,lineHeight:1.5,whiteSpace:"pre-wrap",fontFamily:"sans-serif"}}>
          {answer}
        </div>
      )}
      {convHistory.length>=1&&(
        <div style={{borderTop:"1px solid "+C.bd2,paddingTop:5,display:"flex",flexDirection:"column",gap:3,maxHeight:140,overflowY:"auto"}}>
          <div style={{fontSize:12,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Previous questions</div>
          {[...convHistory].reverse().slice(1).map((h,i)=>(
            <div key={i} onClick={()=>setQuestion(h.q)} style={{fontSize:12,color:C.dim,cursor:"pointer",padding:"2px 4px",borderRadius:3,background:C.bg3}}
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
  const [intelItems,setIntelItems]=useState([]);
  useEffect(()=>{loadIntel().then(d=>{setIntelItems(d);});},[]);

  return <AIAsk vessels={vessels} cargoes={cargoes} intelItems={intelItems}/>;
}


// ─── ParsePanel ───────────────────────────────────────────────────────────────

// ─── AskAIStrip — compact inline strip for nav bar ───────────────────────────
export function AskAIStrip({vessels,cargoes,intelItems}){
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);
  const [showAnswer,setShowAnswer]=useState(false);

  function buildContext(){
    const cargoSummary=cargoes.slice(0,30).map(c=>[c.status,c.charterer,c.cargo,c.qty,c.load,c.disch,c.from,c.to,c.freight,c.vessel].filter(Boolean).join("|")).join("\n");
    const vesselSummary=vessels.slice(0,30).map(v=>[v.vessel,v.operator,v.openPort,v.date,v.dwt&&v.dwt+"dwt"].filter(Boolean).join("|")).join("\n");
    const vault=(intelItems||[]).slice(0,10).map(i=>i.extracted).join("\n---\n");
    return `Today: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}\nCARGOES:\n${cargoSummary||"none"}\nPOSITIONS:\n${vesselSummary||"none"}\nINTEL:\n${vault||"none"}`;
  }

  async function ask(){
    const q=question.trim();if(!q||busy)return;
    setBusy(true);setAnswer("");setShowAnswer(true);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,
          system:"Maritime freight analyst. Max 3 sentences, facts only. No preamble.\n\n"+buildContext(),
          messages:[{role:"user",content:q}]})});
      const d=await res.json();
      const a=(d.content||[]).map(b=>b.text||"").join("").trim().replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1");
      setAnswer(a);setQuestion("");
    }catch(e){setAnswer("Error: "+e.message);}finally{setBusy(false);}
  }

  return(
    <div style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"0 10px",position:"relative"}}>
      <span style={{fontSize:10,fontWeight:700,color:"rgba(88,166,255,0.45)",textTransform:"uppercase",letterSpacing:"0.08em",flexShrink:0}}>Ask AI</span>
      <input value={question} onChange={e=>setQuestion(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")ask();if(e.key==="Escape"){setShowAnswer(false);setAnswer("");}}}
        placeholder="Ask about positions, cargoes, market…"
        style={{flex:1,background:"transparent",border:"none",borderBottom:"1px solid rgba(58,130,246,0.18)",
          color:"rgba(180,210,255,0.75)",fontFamily:"inherit",fontSize:12,padding:"2px 0",outline:"none",
          caretColor:"#58a6ff",minWidth:0}}/>
      <button onClick={ask} disabled={busy||!question.trim()}
        style={{background:"transparent",border:"1px solid rgba(88,166,255,0.3)",borderRadius:3,
          color:busy?"rgba(88,166,255,0.3)":"rgba(88,166,255,0.75)",fontFamily:"inherit",fontWeight:600,
          fontSize:10,padding:"2px 8px",cursor:busy||!question.trim()?"default":"pointer",flexShrink:0,
          textTransform:"uppercase",letterSpacing:"0.06em"}}>
        {busy?"…":"Ask"}
      </button>
      {/* Answer dropdown */}
      {showAnswer&&answer&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:500,marginTop:2,
          background:"rgba(7,15,32,0.98)",border:"1px solid rgba(58,130,246,0.25)",borderRadius:5,
          padding:"10px 12px",fontSize:12,color:"rgba(200,220,255,0.85)",lineHeight:1.6,
          boxShadow:"0 8px 24px rgba(0,0,0,0.6)",whiteSpace:"pre-wrap"}}>
          {answer}
          <button onClick={()=>{setShowAnswer(false);setAnswer("");}}
            style={{display:"block",marginTop:6,background:"none",border:"none",color:"rgba(120,160,220,0.4)",
              fontSize:10,cursor:"pointer",fontFamily:"inherit",padding:0}}>✕ close</button>
        </div>
      )}
    </div>
  );
}

export { AIAsk, RightPanel };
export default RightPanel;
