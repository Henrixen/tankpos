import React, { useState, useRef } from "react";
import { C } from "./constants";

// ─── Inline edit cell ────────────────────────────────────────────────────────
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

export default EC;
