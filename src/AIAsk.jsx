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

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10,height:"100%",maxHeight:480}}>
      {/* Ask AI */}
      <div style={{flex:"1 1 0",background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0,maxHeight:235}}>
        <div style={{padding:"6px 10px",borderBottom:"1px solid "+C.bd2,background:C.bg,flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:700,color:C.tx}}>🤖 Ask AI</span>
        </div>
        <div style={{flex:1,padding:"10px",overflowY:"auto",minHeight:0}}>
          <AIAsk vessels={vessels} cargoes={cargoes} intelItems={intelItems}/>
        </div>
      </div>

      {/* Intel Vault */}
      <div style={{flex:"1 1 0",background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",minHeight:0,maxHeight:235}}>
        <div style={{padding:"6px 10px",borderBottom:"1px solid "+C.bd2,background:C.bg,flexShrink:0}}>
          <span style={{fontSize:12,fontWeight:700,color:C.tx}}>📡 Intel Vault</span>
        </div>
        <div 
          style={{
            flex:1,
            padding:"10px",
            overflowY:"auto",
            minHeight:0
          }}
          className="intel-vault-scroll"
        >
          <IntelVault onVaultUpdate={setIntelItems}/>
        </div>
      </div>
      
      {/* Custom scrollbar styling for Intel Vault */}
      <style>{`
        .intel-vault-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .intel-vault-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .intel-vault-scroll::-webkit-scrollbar-thumb {
          background: ${C.bd};
          border-radius: 4px;
        }
        .intel-vault-scroll::-webkit-scrollbar-thumb:hover {
          background: ${C.dim};
        }
        /* Firefox */
        .intel-vault-scroll {
          scrollbar-width: thin;
          scrollbar-color: ${C.bd} transparent;
        }
      `}</style>
    </div>
  );
}


// ─── ParsePanel ───────────────────────────────────────────────────────────────

export { AIAsk, RightPanel };
export default RightPanel;
