import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const TOPICS = ["UKC","Med","Asia","J19","Inter","C18","TA","Parcel","TCE","SnP","TC"];
const TOPIC_COLORS = {
  UKC:"#58a6ff",Med:"#fb923c",Asia:"#a78bfa",J19:"#3fb950",
  Inter:"#38bdf8",C18:"#fbbf24",TA:"#f472b6",Parcel:"#34d399",
  TCE:"#e2e8f0",SnP:"#ff6b6b",TC:"#c084fc"
};
const DATE_FILTERS = [
  {label:"All time",value:"all"},{label:"Today",value:"today"},
  {label:"This week",value:"week"},{label:"This month",value:"month"},
];
const VM_KEY = "notes_viewMode";

function fmtTs(iso){
  if(!iso)return"";
  const d=new Date(iso);
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
    +" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}
function passesDate(iso,filter){
  if(filter==="all")return true;
  const d=new Date(iso),now=new Date();
  if(filter==="today")return d.toDateString()===now.toDateString();
  if(filter==="week"){const s=new Date(now);s.setDate(now.getDate()-now.getDay());return d>=s;}
  if(filter==="month")return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  return true;
}
function applyFmt(cmd){document.execCommand(cmd,false,null);}
function stripHtml(h){return(h||"").replace(/<[^>]+>/g,"");}

// ── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({onInsertTable}){
  const btn=(label,action)=>(
    <button key={action+label} onMouseDown={e=>{e.preventDefault();applyFmt(action);}} style={{
      background:"transparent",border:"1px solid rgba(58,130,246,0.12)",borderRadius:3,
      color:"rgba(160,200,255,0.65)",padding:"2px 7px",fontFamily:"inherit",fontSize:11,cursor:"pointer",
      fontWeight:action==="bold"?700:400,fontStyle:action==="italic"?"italic":"normal",
      textDecoration:action==="underline"?"underline":"none",
    }}>{label}</button>
  );
  return(
    <div style={{display:"flex",gap:4,padding:"5px 10px",borderBottom:"1px solid rgba(58,130,246,0.08)",
      background:"rgba(4,10,22,0.4)",flexWrap:"wrap",alignItems:"center"}}>
      {btn("B","bold")}{btn("U","underline")}{btn("I","italic")}
      <div style={{width:1,background:"rgba(58,130,246,0.10)",margin:"0 2px",height:14}}/>
      {btn("\u2022 List","insertUnorderedList")}{btn("1. List","insertOrderedList")}
      <div style={{width:1,background:"rgba(58,130,246,0.10)",margin:"0 2px",height:14}}/>
      <button onMouseDown={e=>{e.preventDefault();onInsertTable&&onInsertTable();}} style={{
        background:"transparent",border:"1px solid rgba(58,130,246,0.12)",borderRadius:3,
        color:"rgba(160,200,255,0.65)",padding:"2px 7px",fontFamily:"inherit",fontSize:11,cursor:"pointer",
      }}>&#x229e; Table</button>
    </div>
  );
}

// ── Table size picker ─────────────────────────────────────────────────────────
function TablePicker({onPick,onClose}){
  const [hov,setHov]=useState([0,0]);
  const MAX=8;
  return(
    <div style={{position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0c1729",border:"1px solid rgba(58,130,246,0.3)",
        borderRadius:8,padding:16,boxShadow:"0 8px 32px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:12,color:"rgba(160,200,255,0.65)",marginBottom:10,textAlign:"center"}}>
          {hov[0]>0?`${hov[1]} \xd7 ${hov[0]} table`:"Hover to select size"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:`repeat(${MAX},22px)`,gap:3}}>
          {Array.from({length:MAX*MAX},(_,i)=>{
            const r=Math.floor(i/MAX)+1,c=(i%MAX)+1;
            const on=r<=hov[0]&&c<=hov[1];
            return(
              <div key={i} onMouseEnter={()=>setHov([r,c])}
                onClick={()=>onPick(hov[0]||1,hov[1]||1)}
                style={{width:18,height:18,borderRadius:2,cursor:"pointer",
                  background:on?"rgba(88,166,255,0.3)":"rgba(58,130,246,0.08)",
                  border:"1px solid "+(on?"rgba(88,166,255,0.5)":"rgba(58,130,246,0.15)")}}/>
            );
          })}
        </div>
        <div style={{fontSize:11,color:"rgba(110,155,215,0.4)",textAlign:"center",marginTop:8}}>
          Click to insert
        </div>
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({src,onClose}){
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[onClose]);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
      <img src={src} onClick={e=>e.stopPropagation()}
        style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:6,objectFit:"contain",cursor:"default"}}/>
      <button onClick={onClose} style={{position:"absolute",top:16,right:20,background:"rgba(255,255,255,0.1)",
        border:"none",borderRadius:"50%",width:36,height:36,color:"#fff",fontSize:18,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center"}}>&#x2715;</button>
    </div>
  );
}

// ── Alert time picker popout ─────────────────────────────────────────────────
function AlertPicker({value, onChange, onClear}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);

  // Close on outside click
  useEffect(()=>{
    if(!open)return;
    function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[open]);

  // Format a Date to local datetime-local string (no UTC shift)
  function toLocalInput(d){
    const pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Parse the stored value (already local string) back to a Date
  function fromInput(v){return v?new Date(v):null;}

  function fmtLabel(v){
    if(!v)return null;
    const d=fromInput(v);
    return d.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short"})
      +" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  }

  function setDay(dayIndex){
    // dayIndex: 0=Mon … 6=Sun → convert to JS getDay() where Sun=0,Mon=1
    const now=new Date();
    const todayDow=now.getDay();
    const targetDow=dayIndex===6?0:dayIndex+1;
    let diff=targetDow-todayDow;
    if(diff<=0)diff+=7;
    const d=new Date(now);
    d.setDate(now.getDate()+diff);
    d.setSeconds(0,0);
    onChange(toLocalInput(d));
    setOpen(false);
  }

  function offset(ms){
    // base: parse existing value as local time, or use now
    const base=value?fromInput(value):new Date();
    const d=new Date(base.getTime()+ms);
    d.setSeconds(0,0);
    onChange(toLocalInput(d));
  }

  const chip=(label,ms,col)=>(
    <button onMouseDown={e=>{e.preventDefault();offset(ms);}} style={{
      background:col+"18",border:"1px solid "+col+"55",borderRadius:4,
      color:col,fontSize:11,fontWeight:700,padding:"3px 9px",cursor:"pointer",
      fontFamily:"inherit",whiteSpace:"nowrap",lineHeight:1.4,
    }}>{label}</button>
  );

  const dayBtn=(d,i)=>(
    <button key={d} onMouseDown={e=>{e.preventDefault();setDay(i);}} style={{
      background:"rgba(88,166,255,0.08)",border:"1px solid rgba(88,166,255,0.2)",
      borderRadius:4,color:"rgba(160,200,255,0.8)",fontSize:11,fontWeight:700,
      padding:"5px 0",cursor:"pointer",fontFamily:"inherit",flex:1,lineHeight:1.3,
    }}>{d}</button>
  );

  // Detect if popout should open upward (fixed position to escape any overflow:hidden)
  const btnRef=useRef(null);
  function getPopoutStyle(){
    if(!btnRef.current)return{position:"fixed",top:40,left:0};
    const r=btnRef.current.getBoundingClientRect();
    const spaceBelow=window.innerHeight-r.bottom;
    const popH=210; // approx popout height
    if(spaceBelow<popH){
      return{position:"fixed",bottom:window.innerHeight-r.top+6,left:Math.min(r.left,window.innerWidth-260)};
    }
    return{position:"fixed",top:r.bottom+6,left:Math.min(r.left,window.innerWidth-260)};
  }

  return(
    <div ref={ref} style={{position:"relative",display:"inline-flex",alignItems:"center",gap:6}}>
      {/* Trigger */}
      <button ref={btnRef} onMouseDown={e=>{e.preventDefault();setOpen(o=>!o);}} style={{
        display:"flex",alignItems:"center",gap:5,
        background:value?"rgba(88,166,255,0.1)":"transparent",
        border:"1px solid "+(value?"rgba(88,166,255,0.45)":"rgba(58,130,246,0.2)"),
        borderRadius:5,padding:"3px 9px",cursor:"pointer",fontFamily:"inherit",
        color:value?"#58a6ff":"rgba(110,155,215,0.5)",fontSize:11,fontWeight:600,
      }}>
        <span>&#x23F0;</span>
        <span>{fmtLabel(value)||"Set reminder"}</span>
      </button>
      {value&&(
        <button onMouseDown={e=>{e.preventDefault();onClear();}} style={{
          background:"none",border:"none",color:"rgba(110,155,215,0.4)",
          cursor:"pointer",fontSize:12,padding:0,lineHeight:1,
        }}>&#x2715;</button>
      )}

      {/* Popout — rendered via portal-style fixed positioning to escape overflow:hidden */}
      {open&&(
        <div style={{...getPopoutStyle(),zIndex:9999,
          background:"#0c1729",border:"1px solid rgba(88,166,255,0.28)",
          borderRadius:8,boxShadow:"0 8px 32px rgba(0,0,0,0.7)",padding:"12px",
          minWidth:248,display:"flex",flexDirection:"column",gap:10}}>

          {/* Weekday row */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(110,155,215,0.4)",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Next weekday</div>
            <div style={{display:"flex",gap:3}}>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=>dayBtn(d,i))}
            </div>
          </div>

          {/* Separator */}
          <div style={{height:1,background:"rgba(58,130,246,0.1)"}}/>

          {/* Quick offsets */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(110,155,215,0.4)",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>From {value?"selected":"now"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <div style={{display:"flex",gap:4}}>
                {chip("+5 min", 5*60*1000,"#3fb950")}
                {chip("+1 hr",  60*60*1000,"#3fb950")}
                {chip("+1 day", 24*60*60*1000,"#3fb950")}
              </div>
              <div style={{display:"flex",gap:4}}>
                {chip("−5 min",-5*60*1000,"#ff6b6b")}
                {chip("−1 hr", -60*60*1000,"#ff6b6b")}
                {chip("−1 day",-24*60*60*1000,"#ff6b6b")}
              </div>
            </div>
          </div>

          {/* Current value display */}
          {value&&(
            <div style={{fontSize:11,color:"rgba(110,155,215,0.5)",textAlign:"center",
              borderTop:"1px solid rgba(58,130,246,0.1)",paddingTop:8}}>
              {fmtLabel(value)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Alert banner — export so Dashboard can also use it ───────────────────────
export function NotesAlertBanner(){
  const [alerts,setAlerts]=useState([]);
  const [dismissed,setDismissed]=useState(()=>{
    try{return new Set(JSON.parse(localStorage.getItem("notes_dismissed_alerts")||"[]"));}
    catch{return new Set();}
  });

  useEffect(()=>{
    async function check(){
      const{data}=await supabase.from("notes").select("id,title,body,alert_at")
        .not("alert_at","is",null);
      const now=new Date();
      // show if within 5 min future or up to 24h past and not dismissed
      const due=(data||[]).filter(n=>{
        if(dismissed.has(String(n.id)))return false;
        const t=new Date(n.alert_at);
        return t<=new Date(now.getTime()+5*60*1000)&&t>new Date(now.getTime()-24*60*60*1000);
      });
      setAlerts(due);
    }
    check();
    const iv=setInterval(check,60*1000);
    return()=>clearInterval(iv);
  },[dismissed]);

  function dismiss(id){
    const next=new Set([...dismissed,String(id)]);
    setDismissed(next);
    localStorage.setItem("notes_dismissed_alerts",JSON.stringify([...next]));
  }

  if(alerts.length===0)return null;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {alerts.map(n=>(
        <div key={n.id} style={{background:"rgba(245,166,35,0.12)",border:"1px solid rgba(245,166,35,0.5)",
          borderRadius:6,padding:"8px 12px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:15}}>&#x23F0;</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:"#f5a623"}}>{n.title||"Note reminder"}</div>
            <div style={{fontSize:11,color:"rgba(160,200,255,0.65)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {stripHtml(n.body).slice(0,100)}
            </div>
          </div>
          <span style={{fontSize:11,color:"rgba(160,200,255,0.5)",whiteSpace:"nowrap"}}>
            {fmtTs(n.alert_at)}
          </span>
          <button onClick={()=>dismiss(n.id)} style={{background:"none",border:"none",
            color:"rgba(110,155,215,0.45)",cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>&#x2715;</button>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// ── Topic filter row with smart visibility + "+ N more" popout ──────────────
// ── Compose header: title + active topic tags + "+" for more ────────────────
function ComposeHeader({title,setTitle,selTopics,setSelTopics,pill}){
  const [showPicker,setShowPicker]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    if(!showPicker)return;
    function h(e){if(ref.current&&!ref.current.contains(e.target))setShowPicker(false);}
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[showPicker]);
  const btnRef=useRef(null);
  function getPos(){
    if(!btnRef.current)return{position:"fixed",top:60,left:0};
    const r=btnRef.current.getBoundingClientRect();
    return{position:"fixed",top:r.bottom+4,left:Math.min(r.left,window.innerWidth-270),zIndex:9999};
  }
  const inactive=TOPICS.filter(t=>!selTopics.includes(t));
  return(
    <div ref={ref} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
      borderBottom:"1px solid rgba(58,130,246,0.08)",flexWrap:"wrap"}}>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional)..."
        style={{flex:"1 1 140px",minWidth:100,background:"transparent",border:"none",color:"#e8f2ff",
          fontFamily:"inherit",fontSize:13,fontWeight:600,outline:"none"}}/>
      {/* Active tags inline next to title */}
      {selTopics.length>0&&(
        <div style={{display:"flex",gap:3,flexWrap:"nowrap",alignItems:"center"}}>
          {selTopics.map(t=>pill(t,true,()=>setSelTopics(p=>p.filter(x=>x!==t))))}
        </div>
      )}
      {/* + button to add more */}
      {inactive.length>0&&(
        <div style={{position:"relative",display:"inline-block"}}>
          <button ref={btnRef} onClick={()=>setShowPicker(o=>!o)} style={{
            fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:3,
            border:"1px solid rgba(58,130,246,0.25)",
            background:showPicker?"rgba(88,166,255,0.1)":"transparent",
            color:"rgba(110,155,215,0.55)",cursor:"pointer",fontFamily:"inherit",
            display:"flex",alignItems:"center",gap:2,lineHeight:1.4,
          }}>+ tag</button>
          {showPicker&&(
            <div style={{...getPos(),background:"#0c1729",border:"1px solid rgba(88,166,255,0.28)",
              borderRadius:7,padding:"10px",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",
              display:"flex",flexWrap:"wrap",gap:4,maxWidth:280}}>
              {inactive.map(t=>pill(t,false,()=>{setSelTopics(p=>[...p,t]);setShowPicker(false);}))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopicFilterRow({visibleTopics,hiddenTopics,topicFilter,setTopicFilter,pill}){
  const [showMore,setShowMore]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    if(!showMore)return;
    function h(e){if(ref.current&&!ref.current.contains(e.target))setShowMore(false);}
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[showMore]);
  function getPos(){
    if(!ref.current)return{position:"fixed",top:60,left:0};
    const r=ref.current.getBoundingClientRect();
    return{position:"fixed",top:r.bottom+4,left:Math.min(r.left,window.innerWidth-270),zIndex:9999};
  }
  return(
    <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <button onClick={()=>setTopicFilter(null)} style={{
        fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:3,
        border:"1px solid "+(topicFilter===null?"rgba(88,166,255,0.5)":"rgba(58,130,246,0.18)"),
        background:topicFilter===null?"rgba(88,166,255,0.12)":"transparent",
        color:topicFilter===null?"rgba(140,200,255,0.9)":"rgba(110,155,215,0.45)",
        cursor:"pointer",fontFamily:"inherit",
      }}>All</button>
      {visibleTopics.map(t=>pill(t,topicFilter===t,()=>setTopicFilter(p=>p===t?null:t)))}
      {hiddenTopics.length>0&&(
        <div ref={ref} style={{position:"relative",display:"inline-block"}}>
          <button onClick={()=>setShowMore(o=>!o)} style={{
            fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:3,
            border:"1px solid rgba(58,130,246,0.2)",
            background:showMore?"rgba(88,166,255,0.1)":"transparent",
            color:"rgba(110,155,215,0.5)",cursor:"pointer",fontFamily:"inherit",
          }}>+ {hiddenTopics.length} more</button>
          {showMore&&(
            <div style={{...getPos(),background:"#0c1729",border:"1px solid rgba(88,166,255,0.28)",
              borderRadius:7,padding:"10px",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",
              display:"flex",flexWrap:"wrap",gap:4,maxWidth:260}}>
              {hiddenTopics.map(t=>pill(t,topicFilter===t,()=>{setTopicFilter(p=>p===t?null:t);setShowMore(false);}))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotesTab(){
  const [notes,setNotes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [topicFilter,setTopicFilter]=useState(null);
  const [dateFilter,setDateFilter]=useState("all");
  const [viewMode,setViewMode]=useState(()=>localStorage.getItem(VM_KEY)||"list");
  const [selTopics,setSelTopics]=useState([]);
  const [title,setTitle]=useState("");
  const [alertAt,setAlertAt]=useState("");
  const [saving,setSaving]=useState(false);
  const [expandedId,setExpandedId]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [confirmDelImg,setConfirmDelImg]=useState(null);
  const [images,setImages]=useState([]);
  const [lightbox,setLightbox]=useState(null);
  const [showTablePicker,setShowTablePicker]=useState(false);
  const editorRef=useRef(null);
  const fileRef=useRef(null);

  const setView=v=>{setViewMode(v);localStorage.setItem(VM_KEY,v);};

  async function load(){
    setLoading(true);
    const{data}=await supabase.from("notes").select("*")
      .order("pinned",{ascending:false}).order("created_at",{ascending:false});
    setNotes(data||[]);setLoading(false);
  }
  useEffect(()=>{load();},[]);
  useEffect(()=>{window.__notesData=notes;},[notes]);

  function buildTableHtml(rows,cols){
    const td=(h)=>`<${h?"th":"td"} style="border:1px solid rgba(88,166,255,0.3);padding:4px 8px;min-width:60px;background:${h?"rgba(88,166,255,0.1)":"transparent"};color:#e8f2ff;font-size:12px;">&nbsp;</${h?"th":"td"}>`;
    return `<table style="border-collapse:collapse;margin:8px 0;">`
      +`<tr>${Array(cols).fill(td(true)).join("")}</tr>`
      +Array(rows-1).fill(null).map(()=>`<tr>${Array(cols).fill(td(false)).join("")}</tr>`).join("")
      +`</table><p></p>`;
  }

  function handlePaste(e){
    for(const item of Array.from(e.clipboardData?.items||[])){
      if(item.type.startsWith("image/")){
        e.preventDefault();
        const r=new FileReader();
        r.onload=ev=>setImages(p=>[...p,{dataUrl:ev.target.result}]);
        r.readAsDataURL(item.getAsFile());return;
      }
    }
    const html=e.clipboardData?.getData("text/html");
    if(html){
      e.preventDefault();
      const tmp=document.createElement("div");
      tmp.innerHTML=html;
      tmp.querySelectorAll("*").forEach(el=>{
        el.removeAttribute("style");el.removeAttribute("color");
        el.removeAttribute("face");el.removeAttribute("size");
        el.removeAttribute("bgcolor");el.removeAttribute("class");
      });
      tmp.querySelectorAll("font").forEach(el=>{
        const span=document.createElement("span");span.innerHTML=el.innerHTML;el.replaceWith(span);
      });
      ["h1","h2","h3","h4","h5","h6"].forEach(tag=>{
        tmp.querySelectorAll(tag).forEach(el=>{
          const b=document.createElement("b");b.innerHTML=el.innerHTML;el.replaceWith(b);
        });
      });
      document.execCommand("insertHTML",false,tmp.innerHTML);
    }
  }

  function handleDrop(e){
    e.preventDefault();
    for(const file of Array.from(e.dataTransfer?.files||[])){
      if(file.type.startsWith("image/")){
        const r=new FileReader();
        r.onload=ev=>setImages(p=>[...p,{dataUrl:ev.target.result,name:file.name}]);
        r.readAsDataURL(file);
      }
    }
  }

  async function save(){
    const html=editorRef.current?.innerHTML?.trim();
    if(!html||html==="<br>")return;
    setSaving(true);
    await supabase.from("notes").insert({
      title:title.trim()||null,body:html,topics:selTopics,
      images:images.map(i=>i.dataUrl),pinned:false,
      alert_at:alertAt||null,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    });
    if(editorRef.current)editorRef.current.innerHTML="";
    setTitle("");setSelTopics([]);setImages([]);setAlertAt("");
    await load();setSaving(false);
  }

  async function saveEdit(id,body,editTitle,editTopics,editImages,editAlertAt){
    const updated_at=new Date().toISOString();
    await supabase.from("notes").update({
      body,title:editTitle||null,topics:editTopics,
      images:editImages,updated_at,alert_at:editAlertAt||null,
    }).eq("id",id);
    setNotes(prev=>prev.map(n=>n.id===id
      ?{...n,body,title:editTitle||null,topics:editTopics,images:editImages,updated_at,alert_at:editAlertAt||null}
      :n));
  }

  async function togglePin(note){
    const next=!note.pinned;
    await supabase.from("notes").update({pinned:next}).eq("id",note.id);
    setNotes(prev=>prev.map(n=>n.id===note.id?{...n,pinned:next}:n)
      .sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||new Date(b.created_at)-new Date(a.created_at)));
  }

  async function confirmDelete(){
    if(!confirmDel)return;
    await supabase.from("notes").delete().eq("id",confirmDel);
    setNotes(n=>n.filter(x=>x.id!==confirmDel));setConfirmDel(null);
  }

  async function confirmDeleteImage(){
    if(!confirmDelImg)return;
    const{noteId,imgIndex,onConfirm}=confirmDelImg;
    if(noteId==="__compose__"&&onConfirm){onConfirm();}
    else{
      const note=notes.find(n=>n.id===noteId);
      if(note){
        const newImgs=(note.images||[]).filter((_,i)=>i!==imgIndex);
        await supabase.from("notes").update({images:newImgs,updated_at:new Date().toISOString()}).eq("id",noteId);
        setNotes(prev=>prev.map(n=>n.id===noteId?{...n,images:newImgs}:n));
      }
    }
    setConfirmDelImg(null);
  }

  const filtered=notes.filter(n=>{
    if(topicFilter&&!(n.topics||[]).includes(topicFilter))return false;
    if(!n.pinned&&!passesDate(n.created_at,dateFilter))return false;
    if(search){
      const s=search.toLowerCase();
      if(!stripHtml(n.body).toLowerCase().includes(s)&&!(n.title||"").toLowerCase().includes(s))return false;
    }
    return true;
  });
  const pinned=filtered.filter(n=>n.pinned);
  const unpinned=filtered.filter(n=>!n.pinned);

  const pill=(t,active,onClick)=>{
    const col=TOPIC_COLORS[t]||"#58a6ff";
    return(
      <button key={t} onClick={onClick} style={{
        fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,
        border:"1px solid "+(active?col:col+"44"),
        background:active?col+"22":"transparent",color:active?col:col+"66",
        cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.03em",whiteSpace:"nowrap",
      }}>{t}</button>
    );
  };

  // ── ImageStrip (72px thumbnails) ──
  function ImageStrip({imgs,noteId,editMode,onEditRemove}){
    if(!imgs||imgs.length===0)return null;
    return(
      <div style={{display:"flex",gap:8,padding:"6px 12px 10px",flexWrap:"wrap",alignItems:"flex-start"}}>
        {imgs.map((src,i)=>(
          <div key={i} style={{position:"relative",display:"inline-block",flexShrink:0}}>
            <img src={src}
              onClick={e=>{e.stopPropagation();setLightbox(src);}}
              style={{width:72,height:72,borderRadius:5,border:"1px solid rgba(58,130,246,0.25)",
                objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
            <button
              onClick={e=>{
                e.stopPropagation();
                if(noteId&&!editMode) setConfirmDelImg({noteId,imgIndex:i});
                else if(editMode&&onEditRemove) setConfirmDelImg({noteId:"__compose__",imgIndex:i,onConfirm:()=>onEditRemove(i)});
              }}
              style={{position:"absolute",top:-5,right:-5,background:"rgba(10,18,35,0.95)",
                border:"1px solid #ff6b6b",borderRadius:"50%",width:16,height:16,color:"#ff6b6b",
                fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",
                justifyContent:"center",fontWeight:700,lineHeight:1}}>&#x2715;</button>
          </div>
        ))}
      </div>
    );
  }

  // ── NoteCard (list view) ──
  function NoteCard({note}){
    const hasContent=note.body&&note.body!=="<br>";
    const imgs=note.images||[];
    return(
      <div style={{background:note.pinned?"rgba(88,166,255,0.05)":"#0c1729",
        border:"1px solid "+(note.pinned?"rgba(88,166,255,0.28)":"rgba(58,130,246,0.18)"),
        borderRadius:7,overflow:"hidden",cursor:"pointer",
        height:100,display:"flex",flexDirection:"column"}}
        onClick={()=>setExpandedId(note.id)}>
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",padding:"8px 12px",gap:4}}>

          {/* Row 1: pin + title | date | tags | delete — all in one line */}
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={e=>{e.stopPropagation();togglePin(note);}} title={note.pinned?"Unpin":"Pin"}
              style={{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:0,
                color:note.pinned?"#f5a623":"rgba(110,155,215,0.3)",
                opacity:note.pinned?1:0.5,flexShrink:0,lineHeight:1}}>&#x1F4CC;</button>
            <span style={{fontSize:13,fontWeight:700,color:"#e8f2ff",flex:1,minWidth:0,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {note.title||<span style={{color:"rgba(110,155,215,0.3)",fontWeight:400,fontStyle:"italic"}}>No title</span>}
            </span>
            <span style={{fontSize:10,color:"rgba(110,155,215,0.38)",whiteSpace:"nowrap",flexShrink:0}}>
              {fmtTs(note.updated_at||note.created_at)}
            </span>
            {note.alert_at&&<span title={"Alert: "+fmtTs(note.alert_at)} style={{fontSize:11,opacity:0.55,flexShrink:0}}>&#x23F0;</span>}
            {(note.topics||[]).length>0&&(
              <div style={{display:"flex",gap:3,flexWrap:"nowrap",flexShrink:0}}>
                {(note.topics||[]).slice(0,4).map(t=>{const col=TOPIC_COLORS[t]||"#58a6ff";return(
                  <span key={t} style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:2,
                    background:col+"18",border:"1px solid "+col+"44",color:col,whiteSpace:"nowrap"}}>{t}</span>
                );})}
              </div>
            )}
            <button onClick={e=>{e.stopPropagation();setConfirmDel(note.id);}}
              style={{background:"none",border:"none",color:"#ff6b6b",cursor:"pointer",
                fontSize:11,opacity:0.4,padding:"0 2px",lineHeight:1,flexShrink:0}}>&#x2715;</button>
          </div>

          {/* Row 2: body — fills all remaining height, thumbnail absolutely at bottom-right */}
          <div style={{flex:1,minHeight:0,overflow:"hidden",position:"relative"}}>
            {hasContent&&(
              <div className="note-preview-html"
                style={{fontSize:12,color:"rgba(160,200,255,0.65)",lineHeight:1.5,
                  height:"100%",overflow:"hidden",pointerEvents:"none"}}
                dangerouslySetInnerHTML={{__html:note.body}}/>
            )}
            {imgs.length>0&&(
              <div style={{position:"absolute",bottom:0,right:0}} onClick={e=>e.stopPropagation()}>
                <div style={{position:"relative"}}>
                  <img src={imgs[0]} onClick={()=>setLightbox(imgs[0])}
                    style={{width:30,height:30,borderRadius:4,border:"1px solid rgba(58,130,246,0.25)",
                      objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
                  {imgs.length>1&&(
                    <div style={{position:"absolute",bottom:1,right:1,background:"rgba(0,0,0,0.7)",
                      borderRadius:2,fontSize:8,color:"#e8f2ff",padding:"0 2px",lineHeight:"12px",fontWeight:700}}>
                      +{imgs.length-1}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ── NoteThumb (grid view) ──
  function NoteThumb({note}){
    const imgs=note.images||[];
    const hasContent=note.body&&note.body!=="<br>";
    return(
      <div onClick={()=>setExpandedId(note.id)}
        style={{background:note.pinned?"rgba(88,166,255,0.06)":"#0c1729",
          border:"1px solid "+(note.pinned?"rgba(88,166,255,0.28)":"rgba(58,130,246,0.18)"),
          borderRadius:7,overflow:"hidden",cursor:"pointer",
          height:200,display:"flex",flexDirection:"column",
          transition:"border-color 0.15s,box-shadow 0.15s",
          boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"8px 10px",flex:1,minHeight:0,display:"flex",flexDirection:"column",gap:4}}>

          {/* 1: title + tags */}
          <div style={{display:"flex",alignItems:"flex-start",gap:4,flexShrink:0}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                {note.pinned&&<span style={{fontSize:10,color:"#f5a623",flexShrink:0}}>&#x1F4CC;</span>}
                {note.alert_at&&<span style={{fontSize:10,flexShrink:0}}>&#x23F0;</span>}
                {note.title&&<span style={{fontSize:13,fontWeight:700,color:"#e8f2ff"}}>{note.title}</span>}
              </div>
            </div>
            {(note.topics||[]).length>0&&(
              <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"flex-end",flexShrink:0}}>
                {(note.topics||[]).slice(0,3).map(t=>{const col=TOPIC_COLORS[t]||"#58a6ff";return(
                  <span key={t} style={{fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:2,
                    background:col+"18",color:col,whiteSpace:"nowrap"}}>{t}</span>
                );})}
              </div>
            )}
          </div>

          {/* 2: body — fills all middle space, clipped */}
          <div style={{flex:1,minHeight:0,overflow:"hidden"}}>
            {hasContent&&(
              <div className="note-preview-html"
                style={{fontSize:12,color:"rgba(160,200,255,0.65)",lineHeight:1.45,
                  height:"100%",overflow:"hidden",pointerEvents:"none"}}
                dangerouslySetInnerHTML={{__html:note.body}}/>
            )}
          </div>

          {/* 3: bottom bar — date always bottom-left, thumbnail absolutely bottom-right */}
          <div style={{position:"relative",flexShrink:0,height:32}}>
            <span style={{position:"absolute",bottom:0,left:0,fontSize:10,color:"rgba(110,155,215,0.45)"}}>
              {fmtTs(note.created_at)}
            </span>
            {imgs.length>0&&(
              <div style={{position:"absolute",bottom:0,right:0}} onClick={e=>e.stopPropagation()}>
                <div style={{position:"relative"}}>
                  <img src={imgs[0]} onClick={e=>{e.stopPropagation();setLightbox(imgs[0]);}}
                    style={{width:30,height:30,borderRadius:4,border:"1px solid rgba(58,130,246,0.25)",
                      objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
                  {imgs.length>1&&(
                    <div style={{position:"absolute",bottom:1,right:1,background:"rgba(0,0,0,0.7)",
                      borderRadius:2,fontSize:8,color:"#e8f2ff",padding:"0 2px",lineHeight:"12px",fontWeight:700}}>
                      +{imgs.length-1}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ── NoteModal ─────────────────────────────────────────────────────────────
  function NoteModal({note}){
    const titleRef=React.useRef(null);
    const bodyRef=React.useRef(null);
    const alertValueRef=React.useRef(note.alert_at?note.alert_at.slice(0,16):"");
    const topicsRef=React.useRef(note.topics||[]);
    const imgsRef=React.useRef(note.images||[]);
    const [topicsDisplay,setTopicsDisplay]=React.useState(note.topics||[]);
    const [imgsDisplay,setImgsDisplay]=React.useState(note.images||[]);
    const [alertDisplay,setAlertDisplay]=React.useState(note.alert_at?note.alert_at.slice(0,16):"");
    const [showTblPicker,setShowTblPicker]=React.useState(false);
    const saveTimer=React.useRef(null);
    const savedOnce=React.useRef(false);

    React.useEffect(()=>{
      if(bodyRef.current&&!savedOnce.current){
        bodyRef.current.innerHTML=note.body||"";
      }
    },[]);

    function setAlert(v){alertValueRef.current=v;setAlertDisplay(v);}

    function doSave(){
      clearTimeout(saveTimer.current);
      const t=titleRef.current?.value||"";
      const b=bodyRef.current?.innerHTML||"";
      const a=alertValueRef.current||"";
      if(!b&&!t.trim())return;
      savedOnce.current=true;
      saveEdit(note.id,b,t.trim()||null,topicsRef.current,imgsRef.current,a||null);
    }
    function scheduleSave(){clearTimeout(saveTimer.current);saveTimer.current=setTimeout(doSave,2000);}
    function closeModal(){clearTimeout(saveTimer.current);doSave();setExpandedId(null);}
    React.useEffect(()=>()=>{clearTimeout(saveTimer.current);doSave();},[]);

    function modalPaste(e){
      for(const item of Array.from(e.clipboardData?.items||[])){
        if(item.type.startsWith("image/")){
          e.preventDefault();
          const r=new FileReader();
          r.onload=ev=>{const next=[...imgsRef.current,ev.target.result];imgsRef.current=next;setImgsDisplay(next);scheduleSave();};
          r.readAsDataURL(item.getAsFile());return;
        }
      }
    }

    function insertModalTable(rows,cols){
      const html=buildTableHtml(rows,cols);
      if(bodyRef.current){bodyRef.current.focus();document.execCommand("insertHTML",false,html);}
      scheduleSave();setShowTblPicker(false);
    }

    return(
      <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
        style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:500,
          display:"flex",alignItems:"flex-start",justifyContent:"center",
          paddingTop:"clamp(16px,5vh,60px)",paddingLeft:16,paddingRight:16,paddingBottom:16,
          overflowY:"auto"}}>
        {showTblPicker&&<TablePicker onPick={insertModalTable} onClose={()=>setShowTblPicker(false)}/>}
        <div style={{width:"100%",maxWidth:720,background:"#0c1729",
          border:"1px solid "+(note.pinned?"rgba(88,166,255,0.4)":"rgba(58,130,246,0.28)"),
          borderRadius:10,overflow:"hidden",boxShadow:"0 16px 48px rgba(0,0,0,0.7)",
          maxHeight:"calc(100dvh - 80px)",display:"flex",flexDirection:"column"}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
            borderBottom:"1px solid rgba(58,130,246,0.10)",background:"#111f35",flexShrink:0,flexWrap:"wrap"}}>
            <button onClick={()=>togglePin(note)} style={{background:"none",border:"none",
              cursor:"pointer",fontSize:13,color:note.pinned?"#f5a623":"rgba(110,155,215,0.45)",
              opacity:note.pinned?1:0.4}}>&#x1F4CC;</button>
            <input ref={titleRef} defaultValue={note.title||""} onChange={scheduleSave}
              placeholder="Title..."
              style={{flex:1,minWidth:100,background:"transparent",border:"none",color:"#e8f2ff",
                fontFamily:"inherit",fontSize:14,fontWeight:700,outline:"none"}}/>
            <span style={{fontSize:11,color:"rgba(110,155,215,0.45)",whiteSpace:"nowrap"}}>{fmtTs(note.updated_at||note.created_at)}</span>
            <button onClick={()=>setConfirmDel(note.id)} style={{background:"none",border:"none",
              color:"#ff6b6b",cursor:"pointer",fontSize:12,opacity:0.6}}>&#x2715;</button>
            <button onClick={closeModal}
              style={{background:"none",border:"1px solid rgba(58,130,246,0.25)",borderRadius:4,
                color:"rgba(160,200,255,0.7)",cursor:"pointer",fontSize:11,padding:"4px 12px",
                fontFamily:"inherit"}}>Close</button>
          </div>

          {/* Topics */}
          <div style={{display:"flex",gap:3,flexWrap:"wrap",padding:"6px 14px",
            borderBottom:"1px solid rgba(58,130,246,0.08)",flexShrink:0}}>
            {TOPICS.map(t=>{
              const col=TOPIC_COLORS[t]||"#58a6ff";const active=topicsDisplay.includes(t);
              return(
                <button key={t} onClick={()=>{
                  const next=active?topicsDisplay.filter(x=>x!==t):[...topicsDisplay,t];
                  topicsRef.current=next;setTopicsDisplay(next);scheduleSave();
                }} style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,
                  border:"1px solid "+(active?col:col+"44"),
                  background:active?col+"22":"transparent",color:active?col:col+"66",
                  cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.03em",whiteSpace:"nowrap"}}>{t}</button>
              );
            })}
          </div>

          {/* Alert/Timeline row */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",
            borderBottom:"1px solid rgba(58,130,246,0.08)",flexShrink:0,flexWrap:"wrap"}}>
            <AlertPicker
              value={alertDisplay}
              onChange={v=>{setAlert(v);scheduleSave();}}
              onClear={()=>{setAlert("");scheduleSave();}}
            />
          </div>

          {/* Toolbar */}
          <Toolbar onInsertTable={()=>setShowTblPicker(true)}/>

          {/* Body */}
          <div ref={bodyRef} contentEditable suppressContentEditableWarning
            onInput={scheduleSave}
            onPaste={modalPaste}
            style={{flex:1,overflowY:"auto",padding:"12px 16px",color:"#e8f2ff",
              fontFamily:"inherit",fontSize:13,outline:"none",lineHeight:1.7,caretColor:"#58a6ff",
              minHeight:120}}/>

          {/* Images in modal */}
          {imgsDisplay.length>0&&(
            <div style={{display:"flex",gap:8,padding:"6px 12px 10px",flexWrap:"wrap",alignItems:"flex-start",
              borderTop:"1px solid rgba(58,130,246,0.08)",flexShrink:0}}>
              {imgsDisplay.map((src,i)=>(
                <div key={i} style={{position:"relative",flexShrink:0}}>
                  <img src={src} onClick={()=>setLightbox(src)}
                    style={{width:72,height:72,borderRadius:5,border:"1px solid rgba(58,130,246,0.25)",
                      objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
                  <button onClick={()=>setConfirmDelImg({noteId:note.id,imgIndex:i,onConfirm:()=>{
                    const next=imgsDisplay.filter((_,j)=>j!==i);
                    imgsRef.current=next;setImgsDisplay(next);scheduleSave();
                  }})}
                    style={{position:"absolute",top:-5,right:-5,background:"rgba(10,18,35,0.95)",
                      border:"1px solid #ff6b6b",borderRadius:"50%",width:16,height:16,
                      color:"#ff6b6b",fontSize:9,cursor:"pointer",display:"flex",
                      alignItems:"center",justifyContent:"center",fontWeight:700,lineHeight:1}}>&#x2715;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function NoteList({items}){
    if(viewMode==="list")return(
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {items.map(n=><NoteCard key={n.id} note={n}/>)}
      </div>
    );
    return(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>
        {items.map(n=><NoteThumb key={n.id} note={n}/>)}
      </div>
    );
  }

  function buildTableHtml(rows,cols){
    const td=(h)=>`<${h?"th":"td"} style="border:1px solid rgba(88,166,255,0.3);padding:4px 8px;min-width:60px;background:${h?"rgba(88,166,255,0.1)":"transparent"};color:#e8f2ff;font-size:12px;">&nbsp;</${h?"th":"td"}>`;
    return `<table style="border-collapse:collapse;margin:8px 0;">`
      +`<tr>${Array(cols).fill(td(true)).join("")}</tr>`
      +Array(rows-1).fill(null).map(()=>`<tr>${Array(cols).fill(td(false)).join("")}</tr>`).join("")
      +`</table><p></p>`;
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10,height:"100%",minHeight:0}}>
      {showTablePicker&&(
        <TablePicker
          onPick={(r,c)=>{
            const html=buildTableHtml(r,c);
            if(editorRef.current){editorRef.current.focus();document.execCommand("insertHTML",false,html);}
            setShowTablePicker(false);
          }}
          onClose={()=>setShowTablePicker(false)}/>
      )}

      {lightbox&&<Lightbox src={lightbox} onClose={()=>setLightbox(null)}/>}

      {expandedId&&(()=>{
        const n=notes.find(x=>x.id===expandedId);
        return n?<NoteModal key={expandedId} note={Object.freeze({...n})}/>:null;
      })()}

      {/* Alert banner — shows when notes have due alerts */}
      <NotesAlertBanner/>

      {/* Delete note confirm */}
      {confirmDel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,
          display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}}>
          <div style={{background:"#0c1729",border:"1px solid #ff6b6b",borderRadius:8,
            padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,
            boxShadow:"0 8px 32px rgba(0,0,0,0.6)",minWidth:"min(280px,90vw)"}}>
            <div style={{fontSize:13,color:"#e8f2ff"}}>Delete this note permanently?</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmDel(null)} style={{background:"#111f35",
                border:"1px solid rgba(58,130,246,0.18)",borderRadius:5,color:"rgba(160,200,255,0.65)",
                padding:"6px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Cancel</button>
              <button onClick={confirmDelete} style={{background:"#ff6b6b",border:"none",
                borderRadius:5,color:"#fff",padding:"6px 16px",cursor:"pointer",
                fontFamily:"inherit",fontWeight:700,fontSize:12}}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete image confirm */}
      {confirmDelImg&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,
          display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px"}}>
          <div style={{background:"#0c1729",border:"1px solid #ff6b6b",borderRadius:8,
            padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,
            boxShadow:"0 8px 32px rgba(0,0,0,0.6)",minWidth:"min(260px,90vw)"}}>
            <div style={{fontSize:13,color:"#e8f2ff"}}>Remove this image?</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setConfirmDelImg(null)} style={{background:"#111f35",
                border:"1px solid rgba(58,130,246,0.18)",borderRadius:5,color:"rgba(160,200,255,0.65)",
                padding:"6px 16px",cursor:"pointer",fontFamily:"inherit",fontSize:12}}>Cancel</button>
              <button onClick={confirmDeleteImage} style={{background:"#ff6b6b",border:"none",
                borderRadius:5,color:"#fff",padding:"6px 16px",cursor:"pointer",
                fontFamily:"inherit",fontWeight:700,fontSize:12}}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Compose panel */}
      <div style={{background:"#0c1729",border:"1px solid rgba(58,130,246,0.18)",borderRadius:8,overflow:"hidden",flexShrink:0}}
        onDrop={handleDrop} onDragOver={e=>e.preventDefault()}>
        <ComposeHeader
          title={title} setTitle={setTitle}
          selTopics={selTopics} setSelTopics={setSelTopics}
          pill={pill}/>
        {/* Alert row in compose */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",
          borderBottom:"1px solid rgba(58,130,246,0.08)",background:"rgba(4,10,22,0.25)",flexWrap:"wrap"}}>
          <AlertPicker value={alertAt} onChange={setAlertAt} onClear={()=>setAlertAt("")}/>
        </div>
        <Toolbar onInsertTable={()=>setShowTablePicker(true)}/>
        <div ref={editorRef} contentEditable suppressContentEditableWarning
          onPaste={handlePaste}
          onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))save();}}
          data-placeholder="Write your note\u2026 (Ctrl+Enter to save, paste screenshots)"
          style={{minHeight:80,padding:"10px 14px",color:"#e8f2ff",
            fontFamily:"inherit",fontSize:12,outline:"none",lineHeight:1.65,caretColor:"#58a6ff"}}/>
        {images.length>0&&(
          <div style={{display:"flex",gap:8,padding:"6px 12px",borderTop:"1px solid rgba(58,130,246,0.08)",flexWrap:"wrap",alignItems:"flex-start"}}>
            {images.map((img,i)=>(
              <div key={i} style={{position:"relative",flexShrink:0}}>
                <img src={img.dataUrl} onClick={()=>setLightbox(img.dataUrl)}
                  style={{width:72,height:72,borderRadius:5,border:"1px solid rgba(58,130,246,0.25)",objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
                <button onClick={()=>setConfirmDelImg({noteId:"__compose__",imgIndex:i,onConfirm:()=>setImages(p=>p.filter((_,j)=>j!==i))})}
                  style={{position:"absolute",top:-5,right:-5,background:"rgba(10,18,35,0.95)",
                    border:"1px solid #ff6b6b",borderRadius:"50%",width:16,height:16,color:"#ff6b6b",
                    fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",
                    justifyContent:"center",fontWeight:700,lineHeight:1}}>&#x2715;</button>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",
          borderTop:"1px solid rgba(58,130,246,0.08)",background:"rgba(4,10,22,0.4)"}}>
          <button onClick={()=>fileRef.current?.click()}
            style={{background:"transparent",border:"1px solid rgba(58,130,246,0.12)",borderRadius:3,
              color:"rgba(110,155,215,0.45)",padding:"3px 9px",fontFamily:"inherit",fontSize:11,cursor:"pointer"}}>
            + Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}}
            onChange={e=>{Array.from(e.target.files||[]).forEach(f=>{
              const r=new FileReader();r.onload=ev=>setImages(p=>[...p,{dataUrl:ev.target.result,name:f.name}]);
              r.readAsDataURL(f);});e.target.value="";}}/>
          <span style={{flex:1}}/>
          <button onClick={save} disabled={saving} style={{
            background:"transparent",
            border:"1px solid "+(saving?"rgba(88,166,255,0.2)":"rgba(88,166,255,0.55)"),
            borderRadius:4,color:saving?"rgba(88,166,255,0.3)":"rgba(140,200,255,0.9)",
            fontFamily:"inherit",fontWeight:600,fontSize:11,padding:"4px 16px",
            cursor:saving?"default":"pointer",letterSpacing:"0.07em",textTransform:"uppercase",
          }}>{saving?"Saving...":"Save Note"}</button>
        </div>
      </div>

      {/* Filter bar */}
      {(()=>{
        const usedTopics=TOPICS.filter(t=>notes.some(n=>(n.topics||[]).includes(t)));
        const visibleTopics=TOPICS.filter(t=>t===topicFilter||usedTopics.includes(t));
        const hiddenTopics=TOPICS.filter(t=>t!==topicFilter&&!usedTopics.includes(t));
        return(
          <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
            {/* Row 1: search + date filters + count + view toggle */}
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:"0 0 150px",minWidth:100}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notes..."
                  style={{width:"100%",background:"#0c1729",border:"1px solid rgba(58,130,246,0.18)",
                    borderRadius:5,color:"#e8f2ff",fontFamily:"inherit",fontSize:12,
                    padding:"5px 28px 5px 10px",outline:"none",boxSizing:"border-box"}}/>
                {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:6,
                  top:"50%",transform:"translateY(-50%)",background:"none",border:"none",
                  color:"rgba(110,155,215,0.45)",cursor:"pointer",fontSize:11}}>&#x2715;</button>}
              </div>
              {DATE_FILTERS.map(f=>(
                <button key={f.value} onClick={()=>setDateFilter(f.value)} style={{
                  fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:3,
                  border:"1px solid "+(dateFilter===f.value?"rgba(88,166,255,0.5)":"rgba(58,130,246,0.18)"),
                  background:dateFilter===f.value?"rgba(88,166,255,0.12)":"transparent",
                  color:dateFilter===f.value?"rgba(140,200,255,0.9)":"rgba(110,155,215,0.45)",
                  cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
                }}>{f.label}</button>
              ))}
              <span style={{marginLeft:"auto",fontSize:11,color:"rgba(110,155,215,0.45)"}}>
                {filtered.length} note{filtered.length!==1?"s":""}
              </span>
              <div style={{display:"flex",gap:0,border:"1px solid rgba(58,130,246,0.18)",borderRadius:4,overflow:"hidden"}}>
                {[["list","☰"],["grid","⊞"]].map(([v,icon])=>(
                  <button key={v} onClick={()=>setView(v)} style={{
                    background:viewMode===v?"rgba(88,166,255,0.15)":"transparent",
                    border:"none",borderRight:v==="list"?"1px solid rgba(58,130,246,0.18)":"none",
                    color:viewMode===v?"#58a6ff":"rgba(110,155,215,0.45)",
                    padding:"3px 10px",cursor:"pointer",fontSize:13,lineHeight:1,
                  }}>{icon}</button>
                ))}
              </div>
            </div>
            {/* Row 2: All + visible topics + "+ N more" popout */}
            <TopicFilterRow
              visibleTopics={visibleTopics}
              hiddenTopics={hiddenTopics}
              topicFilter={topicFilter}
              setTopicFilter={setTopicFilter}
              pill={pill}/>
          </div>
        );
      })()}
            }}>{icon}</button>
          ))}
        </div>
      </div>

      {/* Notes list/grid */}
      <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
        {loading&&<div style={{fontSize:12,color:"rgba(110,155,215,0.45)",padding:"20px",textAlign:"center"}}>Loading...</div>}
        {!loading&&filtered.length===0&&(
          <div style={{fontSize:12,color:"rgba(110,155,215,0.45)",padding:"20px",textAlign:"center",fontStyle:"italic"}}>
            {search||topicFilter||dateFilter!=="all"?"No notes match your filter.":"No notes yet. Write one above."}
          </div>
        )}
        {pinned.length>0&&(
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"#f5a623",letterSpacing:"0.08em",
              textTransform:"uppercase",marginBottom:6,padding:"0 2px"}}>
              &#x1F4CC; Pinned
            </div>
            <NoteList items={pinned}/>
          </div>
        )}
        {unpinned.length>0&&(
          <div>
            {pinned.length>0&&<div style={{fontSize:10,fontWeight:700,color:"rgba(110,155,215,0.45)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,padding:"0 2px"}}>Notes</div>}
            <NoteList items={unpinned}/>
          </div>
        )}
      </div>

      <style>{`
        [data-placeholder]:empty:before{content:attr(data-placeholder);color:rgba(110,155,215,0.35);pointer-events:none;}
        [contenteditable] ul{padding-left:18px;margin:4px 0;}
        [contenteditable] ol{padding-left:18px;margin:4px 0;}
        [contenteditable] li{margin:2px 0;}
        [contenteditable]{caret-color:#58a6ff;}
        [contenteditable] table{border-collapse:collapse;margin:6px 0;}
        [contenteditable] td,[contenteditable] th{border:1px solid rgba(88,166,255,0.3);padding:4px 8px;min-width:50px;color:#e8f2ff;font-size:12px;}
        [contenteditable] th{background:rgba(88,166,255,0.1);font-weight:700;}
        .note-preview-html ul{padding-left:16px;margin:2px 0;}
        .note-preview-html ol{padding-left:16px;margin:2px 0;}
        .note-preview-html li{margin:1px 0;}
        .note-preview-html table{border-collapse:collapse;font-size:11px;margin:2px 0;}
        .note-preview-html td,.note-preview-html th{border:1px solid rgba(88,166,255,0.2);padding:2px 5px;color:rgba(160,200,255,0.7);}
        .note-preview-html b,.note-preview-html strong{color:#e8f2ff;}
        /* iOS / mobile touch targets */
        @media (max-width:640px){
          [contenteditable]{font-size:16px!important;} /* prevent iOS zoom */
          input[type="text"],input[type="datetime-local"]{font-size:16px!important;}
        }
      `}</style>
    </div>
  );
}
