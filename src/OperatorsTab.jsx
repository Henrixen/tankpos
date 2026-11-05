import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const SEGMENTS = ["Sub 10k", "City", "Inter", "J19", "Flexi", "Handy", "MR", "Asia export"];
const inputStyle = { background:C.bg3, color:C.tx, border:`1px solid ${C.bd}`, borderRadius:6, padding:"8px 10px", fontSize:12, fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const btnStyle = { background:C.bg3, color:C.tx, border:`1px solid ${C.bd}`, borderRadius:6, padding:"7px 12px", cursor:"pointer", fontSize:12, fontFamily:"inherit" };
const normalize = row => ({...row, segments:Array.isArray(row.segments)?row.segments:[], tags:Array.isArray(row.tags)?row.tags:[],segment_details:row.segment_details&&typeof row.segment_details==="object"?row.segment_details:{}});

export default function OperatorsTab() {
  const [operators,setOperators] = useState([]);
  const [view,setView] = useState("columns");
  const [search,setSearch] = useState("");
  const [editing,setEditing] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [draft,setDraft] = useState({name:"",segments:[],tags:[],notes:"",segment_details:{}});

  const load = useCallback(async () => {
    const {data,error} = await supabase.from("fleet_operators").select("*").order("name",{ascending:true});
    if(error) {setError(error.message); return;}
    setOperators((data||[]).map(normalize)); setError("");
  },[]);
  useEffect(()=>{load(); const channel=supabase.channel("fleet-operators-updates").on("postgres_changes",{event:"*",schema:"public",table:"fleet_operators"},()=>load()).subscribe(); return ()=>{supabase.removeChannel(channel);};},[load]);
  const filtered=useMemo(()=>operators.filter(o=>[o.name,o.notes,...o.tags,...o.segments].join(" ").toLowerCase().includes(search.toLowerCase().trim())),[operators,search]);
  const openEditor = (o=null) => {setEditing(o?.id||"new");setDraft(o?{name:o.name,segments:[...o.segments],tags:[...o.tags],notes:o.notes||"",segment_details:{...o.segment_details}}:{name:"",segments:[],tags:[],notes:"",segment_details:{}});setError("");};
  const toggleSegment=s=>setDraft(d=>({...d,segments:d.segments.includes(s)?d.segments.filter(x=>x!==s):[...d.segments,s]}));
  const save=async()=>{
    if(!draft.name.trim()){setError("Operator / owner name is required.");return;}
    setBusy(true);setError("");
    const payload={name:draft.name.trim(),segments:draft.segments,tags:[...new Set(draft.tags.map(x=>x.trim()).filter(Boolean))],notes:draft.notes||"",segment_details:draft.segment_details||{},updated_at:new Date().toISOString()};
    const result=editing==="new"?await supabase.from("fleet_operators").insert(payload):await supabase.from("fleet_operators").update(payload).eq("id",editing);
    setBusy(false);
    if(result.error){setError(result.error.message);return;}
    setEditing(null);await load();
  };
  const remove=async()=>{if(!window.confirm("Delete this operator / owner?"))return;setBusy(true);const {error}=await supabase.from("fleet_operators").delete().eq("id",editing);setBusy(false);if(error){setError(error.message);return;}setEditing(null);await load();};
  return <div style={{display:"flex",flexDirection:"column",gap:14,color:C.tx}}>
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{fontSize:16,fontWeight:700,marginRight:"auto"}}>Operators & Owners <span style={{fontSize:12,fontWeight:400,color:C.faint}}>({operators.length})</span></div>
      <input aria-label="Search operators" style={{...inputStyle,width:230}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search owners, tags, notes…"/>
      <button style={{...btnStyle,background:view==="columns"?"#58a6ff22":C.bg3,color:view==="columns"?"#58a6ff":C.tx}} onClick={()=>setView("columns")}>Segment Columns</button>
      <button style={{...btnStyle,background:view==="matrix"?"#58a6ff22":C.bg3,color:view==="matrix"?"#58a6ff":C.tx}} onClick={()=>setView("matrix")}>Matrix</button>
      <button style={{...btnStyle,background:"#58a6ff22",color:"#58a6ff"}} onClick={()=>openEditor()}>+ Add Operator</button>
    </div>
    {error&&<div role="alert" style={{color:"#ff7878",fontSize:12}}>{error}</div>}
    {view==="columns"?<div style={{overflowX:"auto"}}>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${SEGMENTS.length}, minmax(155px, 1fr))`,gap:0,minWidth:1090,border:`1px solid ${C.bd}`,borderRadius:8,overflow:"hidden"}}>
        {SEGMENTS.map((segment,index)=>{
          const items=filtered.filter(o=>o.segments.includes(segment));
          return <div key={segment} style={{minWidth:0,background:C.bg2,borderRight:index<SEGMENTS.length-1?`1px solid ${C.bd}`:"none"}}>
            <div style={{height:40,boxSizing:"border-box",padding:"11px 9px",fontWeight:700,fontSize:12,borderBottom:`1px solid ${C.bd}`,background:C.bg3}}>
              {segment}<span style={{float:"right",color:C.faint,fontSize:11}}>{items.length}</span>
            </div>
            {items.map((o,i)=>{
              const details=o.segment_details?.[segment];
              const meta=[details?.pic&&`PIC: ${details.pic}`,details?.ships&&`Ships: ${details.ships}`,details?.note].filter(Boolean).join(" · ");
              return <button key={o.id} title={[o.name,meta,o.tags.length&&`Tags: ${o.tags.join(", ")}`,o.notes].filter(Boolean).join("\n")} onClick={()=>openEditor(o)}
                style={{display:"flex",flexDirection:"column",justifyContent:"center",width:"100%",height:78,boxSizing:"border-box",textAlign:"left",padding:"8px 9px",background:i%2===0?"transparent":"rgba(255,255,255,0.018)",color:C.tx,border:"none",borderBottom:`1px solid ${C.bd}`,cursor:"pointer",fontFamily:"inherit",overflow:"hidden"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"rgba(255,255,255,0.018)"}>
                <div style={{fontSize:11,fontWeight:650,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.name}</div>
                {meta&&<div style={{fontSize:10,color:C.faint,marginTop:4,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{meta}</div>}
                {o.tags.length>0&&<div style={{fontSize:10,color:"#58a6ff",marginTop:3,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.tags.join(" · ")}</div>}
                {o.notes&&<div style={{fontSize:10,color:C.faint,marginTop:3,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.notes}</div>}
              </button>;
            })}
            {items.length===0&&<div style={{height:78,boxSizing:"border-box",padding:"15px 9px",color:C.faint,fontSize:11,borderBottom:`1px solid ${C.bd}`}}>No owners</div>}
          </div>;
        })}
      </div>
    </div>:<div style={{overflowX:"auto",border:`1px solid ${C.bd}`,borderRadius:8}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{background:C.bg3}}>{["Operator / Owner",...SEGMENTS,"Tags","Notes"].map(h=><th key={h} style={{padding:10,textAlign:SEGMENTS.includes(h)?"center":"left",borderBottom:`1px solid ${C.bd}`,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{filtered.map(o=><tr key={o.id} onClick={()=>openEditor(o)} style={{cursor:"pointer",borderBottom:`1px solid ${C.bd}`}}><td style={{padding:10,fontWeight:600,whiteSpace:"nowrap"}}>{o.name}</td>{SEGMENTS.map(s=><td key={s} style={{textAlign:"center",color:"#4ade80"}}>{o.segments.includes(s)?"✓":""}</td>)}<td style={{padding:10,color:"#58a6ff"}}>{o.tags.join(", ")}</td><td style={{padding:10,color:C.faint,maxWidth:250}}>{o.notes}</td></tr>)}</tbody></table></div>}
    {editing!==null&&<div style={{position:"fixed",inset:0,zIndex:9999,background:"#0009",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null);}}><div style={{width:"min(520px, 100%)",background:C.bg2,border:`1px solid ${C.bd}`,borderRadius:12,padding:22,display:"flex",flexDirection:"column",gap:14,boxShadow:"0 18px 70px #0008"}}>
      <div style={{fontWeight:700,fontSize:16}}>{editing==="new"?"Add Operator / Owner":"Edit Operator / Owner"}</div>
      <label style={{fontSize:12}}>Name<input style={{...inputStyle,marginTop:5}} value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Company name"/></label>
      <div><div style={{fontSize:12,marginBottom:8}}>Segments (select all that apply)</div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{SEGMENTS.map(s=><button key={s} style={{...btnStyle,background:draft.segments.includes(s)?"#58a6ff33":C.bg3,color:draft.segments.includes(s)?"#58a6ff":C.tx}} onClick={()=>toggleSegment(s)}>{draft.segments.includes(s)?"✓ ":""}{s}</button>)}</div></div>
      <div style={{maxHeight:210,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>{draft.segments.map(s=><div key={s} style={{padding:9,border:`1px solid ${C.bd}`,borderRadius:6}}><div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{s} — Excel details</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>{["pic","ships","note"].map(field=><label key={field} style={{fontSize:10,gridColumn:field==="note"?"1 / -1":undefined}}>{field.toUpperCase()}<input style={{...inputStyle,marginTop:3}} value={draft.segment_details?.[s]?.[field]||""} onChange={e=>setDraft(d=>({...d,segment_details:{...d.segment_details,[s]:{...d.segment_details?.[s],[field]:e.target.value}}}))}/></label>)}</div></div>)}</div>
      <label style={{fontSize:12}}>Tags (comma-separated)<input style={{...inputStyle,marginTop:5}} value={draft.tags.join(", ")} onChange={e=>setDraft(d=>({...d,tags:e.target.value.split(",")}))} placeholder="e.g. NWE, Coated, TC"/></label>
      <label style={{fontSize:12}}>Notes<textarea rows={4} style={{...inputStyle,marginTop:5,resize:"vertical"}} value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Owner information, contacts, market notes…"/></label>
      {error&&<div role="alert" style={{fontSize:12,color:"#ff7878"}}>{error}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>{editing!=="new"&&<button disabled={busy} style={{...btnStyle,color:"#ff7878",marginRight:"auto"}} onClick={remove}>Delete</button>}<button style={btnStyle} onClick={()=>setEditing(null)}>Cancel</button><button disabled={busy} style={{...btnStyle,background:"#58a6ff22",color:"#58a6ff"}} onClick={save}>{busy?"Saving…":"Save"}</button></div>
    </div></div>}
  </div>;
}
