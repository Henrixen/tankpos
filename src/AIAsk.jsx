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

// ─── Ask AI Strip — lives in the global tab bar ───────────────────────────────
export function AskAIStrip({vessels,cargoes,intelItems}){
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [convHistory,setConvHistory]=useState([]);
  const inputRef=React.useRef(null);

  function buildContext(){
    const cargoSummary=cargoes.map(c=>[c.status||"",c.charterer,c.cargo,c.qty,c.load,c.disch,c.from&&c.to?c.from+" - "+c.to:c.from||c.to,c.freight,c.vessel].filter(Boolean).join("|")).join("\n");
    const vesselSummary=vessels.map(v=>[v.vessel,v.operator,v.openPort,v.date,v.dwt&&v.dwt+"dwt",v.built&&"built:"+v.built,v.spec?.iceClass,v.spec?.lastCargo&&"lastcargo:"+v.spec.lastCargo].filter(Boolean).join("|")).join("\n");
    const vault=(intelItems||[]).map(i=>i.extracted).join("\n---\n");
    return `Today: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}\nCARGO FIXTURES (${cargoes.length}):\n${cargoSummary||"none"}\nVESSEL POSITIONS (${vessels.length}):\n${vesselSummary||"none"}\nMARKET INTEL VAULT (${(intelItems||[]).length} items):\n${vault||"none"}`;
  }

  async function ask(){
    const q=question.trim();if(!q||busy)return;
    setBusy(true);setAnswer("");setExpanded(true);
    try{
      const msgs=convHistory.slice(-6).flatMap(h=>[{role:"user",content:h.q},{role:"assistant",content:h.a}]);
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({
        model:"claude-sonnet-4-20250514",max_tokens:600,
        system:"Maritime freight analyst. Short direct answers: facts and numbers only, max 5 sentences. No preamble.\n\n"+buildContext(),
        messages:[...msgs,{role:"user",content:q}]
      })});
      const d=await res.json();
      const a=(d.content||[]).map(b=>b.text||"").join("").trim()
        .replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1")
        .replace(/^#{1,3}\s+/gm,"").replace(/`([^`]+)`/g,"$1");
      setAnswer(a);setConvHistory(h=>[...h,{q,a}].slice(-10));setQuestion("");
    }catch(e){setAnswer("Error: "+e.message);}finally{setBusy(false);}
  }

  return(
    <div style={{position:"relative",display:"flex",flexDirection:"column",minWidth:0}}>
      {/* Strip — same height/style as IntelVaultStrip */}
      <div style={{
        display:"flex",alignItems:"stretch",
        background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,
        overflow:"hidden",height:78,minWidth:480
      }}>
        {/* Input area */}
        <div style={{flex:1,display:"flex",alignItems:"center",padding:"0 12px",minWidth:0}}>
          <input
            ref={inputRef}
            value={question}
            onChange={e=>setQuestion(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")ask();if(e.key==="Escape")setExpanded(false);}}
            placeholder="Ask about positions, cargoes, market intel…"
            style={{
              width:"100%",background:"transparent",border:"none",
              color:"rgba(180,210,255,0.85)",fontFamily:"inherit",fontSize:12,
              outline:"none",letterSpacing:"0.01em"
            }}
          />
        </div>
        {/* Right controls */}
        <div style={{
          display:"flex",flexDirection:"column",gap:5,
          padding:"8px 10px",
          background:"rgba(4,10,22,0.55)",
          borderLeft:"1px solid rgba(58,130,246,0.12)",
          flexShrink:0,width:140,justifyContent:"center"
        }}>
          <button onClick={ask} disabled={busy||!question.trim()}
            style={{
              background:"transparent",
              border:"1px solid "+(busy||!question.trim()?"rgba(88,166,255,0.2)":"rgba(88,166,255,0.55)"),
              borderRadius:4,
              color:busy||!question.trim()?"rgba(88,166,255,0.3)":"rgba(140,200,255,0.9)",
              fontFamily:"inherit",fontWeight:600,fontSize:11,
              padding:"5px 0",cursor:busy||!question.trim()?"default":"pointer",
              letterSpacing:"0.08em",textTransform:"uppercase",
              transition:"border-color 0.15s,color 0.15s"
            }}>
            {busy?"thinking…":"Ask"}
          </button>
          {(answer||convHistory.length>0)&&(
            <button onClick={()=>setExpanded(v=>!v)}
              style={{
                background:expanded?"rgba(88,166,255,0.1)":"transparent",
                border:"1px solid "+(expanded?"rgba(88,166,255,0.45)":"rgba(88,166,255,0.2)"),
                borderRadius:4,color:expanded?"rgba(140,200,255,0.9)":"rgba(88,166,255,0.45)",
                padding:"5px 0",fontFamily:"inherit",fontSize:11,cursor:"pointer",
                fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",
                transition:"all 0.15s"
              }}>
              {expanded?"hide":"show"}
            </button>
          )}
        </div>
      </div>

      {/* Dropdown answer panel */}
      {expanded&&(
        <div style={{
          position:"absolute",top:"calc(100% + 4px)",left:0,
          width:"100%",minWidth:360,
          background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,
          zIndex:200,padding:"12px 14px",
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          display:"flex",flexDirection:"column",gap:8
        }}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em"}}>Answer</span>
            <span style={{flex:1}}/>
            <button onClick={()=>setExpanded(false)} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:13,padding:"0 2px"}}>✕</button>
          </div>
          {busy&&<div style={{fontSize:12,color:C.faint,letterSpacing:"0.03em"}}>thinking…</div>}
          {answer&&(
            <div style={{fontSize:12,color:"rgba(200,225,255,0.88)",lineHeight:1.65,whiteSpace:"pre-wrap",fontFamily:"inherit",borderLeft:"2px solid rgba(88,166,255,0.35)",paddingLeft:10}}>
              {answer}
            </div>
          )}
          {convHistory.length>1&&(
            <div style={{borderTop:"1px solid "+C.bd2,paddingTop:6,display:"flex",flexDirection:"column",gap:3,maxHeight:120,overflowY:"auto"}}>
              <div style={{fontSize:10,color:C.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Previous</div>
              {[...convHistory].reverse().slice(1).map((h,i)=>(
                <div key={i} onClick={()=>{setQuestion(h.q);inputRef.current?.focus();}}
                  style={{fontSize:12,color:C.dim,cursor:"pointer",padding:"2px 5px",borderRadius:3,background:C.bg3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                  title={h.a}>
                  {h.q}
                </div>
              ))}
            </div>
          )}
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

export { AIAsk, RightPanel };
export default RightPanel;
