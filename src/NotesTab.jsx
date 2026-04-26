import React, { useState, useEffect, useRef } from “react”;
import { supabase } from “./supabaseclient”;
import { C } from “./constants”;

const TOPICS = [“UKC”,“Med”,“Asia”,“J19”,“Inter”,“C18”,“TA”,“Parcel”,“TCE”,“SnP”,“TC”];
const TOPIC_COLORS = {
UKC:”#58a6ff”, Med:”#fb923c”, Asia:”#a78bfa”, J19:”#3fb950”,
Inter:”#38bdf8”, C18:”#fbbf24”, TA:”#f472b6”, Parcel:”#34d399”,
TCE:”#e2e8f0”, SnP:”#ff6b6b”, TC:”#c084fc”
};
const DATE_FILTERS = [
{label:“All time”,value:“all”},{label:“Today”,value:“today”},
{label:“This week”,value:“week”},{label:“This month”,value:“month”},
];

function fmtTs(iso){
if(!iso)return””;
const d=new Date(iso);
return d.toLocaleDateString(“en-GB”,{day:“2-digit”,month:“short”,year:“numeric”})
+” “+d.toLocaleTimeString(“en-GB”,{hour:“2-digit”,minute:“2-digit”});
}

function passesDate(iso,filter){
if(filter===“all”)return true;
const d=new Date(iso),now=new Date();
if(filter===“today”)return d.toDateString()===now.toDateString();
if(filter===“week”){const s=new Date(now);s.setDate(now.getDate()-now.getDay());return d>=s;}
if(filter===“month”)return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
return true;
}

function applyFmt(cmd){document.execCommand(cmd,false,null);}

function Toolbar(){
const btn=(label,action)=>(
<button key={action} onMouseDown={e=>{e.preventDefault();applyFmt(action);}} style={{
background:“transparent”,border:“1px solid rgba(58,130,246,0.10)”,borderRadius:3,
color:“rgba(160,200,255,0.65)”,padding:“2px 7px”,fontFamily:“inherit”,fontSize:11,cursor:“pointer”,
fontWeight:action===“bold”?700:400,fontStyle:action===“italic”?“italic”:“normal”,
textDecoration:action===“underline”?“underline”:“none”,
}}>{label}</button>
);
return(
<div style={{display:“flex”,gap:4,padding:“5px 10px”,borderBottom:“1px solid rgba(58,130,246,0.10)”,background:“rgba(4,10,22,0.4)”,flexWrap:“wrap”}}>
{btn(“B”,“bold”)}{btn(“U”,“underline”)}{btn(“I”,“italic”)}
<div style={{width:1,background:“rgba(58,130,246,0.10)”,margin:“0 2px”}}/>
{btn(”\u2022 List”,“insertUnorderedList”)}{btn(“1. List”,“insertOrderedList”)}
</div>
);
}

export default function NotesTab(){
const [notes,setNotes]=useState([]);
const [loading,setLoading]=useState(true);
const [search,setSearch]=useState(””);
const [topicFilter,setTopicFilter]=useState(null);
const [dateFilter,setDateFilter]=useState(“all”);
const [viewMode,setViewMode]=useState(“list”);
const [selTopics,setSelTopics]=useState([]);
const [title,setTitle]=useState(””);
const [saving,setSaving]=useState(false);
const [editingId,setEditingId]=useState(null);
const [expandedId,setExpandedId]=useState(null);
const [confirmDel,setConfirmDel]=useState(null);
const [images,setImages]=useState([]);
const editorRef=useRef(null);
const fileRef=useRef(null);

async function load(){
setLoading(true);
const{data}=await supabase.from(“notes”).select(”*”)
.order(“pinned”,{ascending:false}).order(“created_at”,{ascending:false});
setNotes(data||[]);setLoading(false);
}
useEffect(()=>{load();},[]);

function handlePaste(e){
for(const item of Array.from(e.clipboardData?.items||[])){
if(item.type.startsWith(“image/”)){
e.preventDefault();
const r=new FileReader();
r.onload=ev=>setImages(p=>[…p,{dataUrl:ev.target.result}]);
r.readAsDataURL(item.getAsFile());return;
}
}
}

function handleDrop(e){
e.preventDefault();
for(const file of Array.from(e.dataTransfer?.files||[])){
if(file.type.startsWith(“image/”)){
const r=new FileReader();
r.onload=ev=>setImages(p=>[…p,{dataUrl:ev.target.result,name:file.name}]);
r.readAsDataURL(file);
}
}
}

async function save(){
const html=editorRef.current?.innerHTML?.trim();
if(!html||html===”<br>”)return;
setSaving(true);
await supabase.from(“notes”).insert({
title:title.trim()||null,body:html,topics:selTopics,
images:images.map(i=>i.dataUrl),pinned:false,
created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
});
if(editorRef.current)editorRef.current.innerHTML=””;
setTitle(””);setSelTopics([]);setImages([]);
await load();setSaving(false);
}

async function saveEdit(id,body,editTitle,editTopics){
await supabase.from(“notes”).update({
body,title:editTitle,topics:editTopics,updated_at:new Date().toISOString(),
}).eq(“id”,id);
setEditingId(null);await load();
}

async function togglePin(note){
const next=!note.pinned;
await supabase.from(“notes”).update({pinned:next}).eq(“id”,note.id);
setNotes(prev=>prev.map(n=>n.id===note.id?{…n,pinned:next}:n)
.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||new Date(b.created_at)-new Date(a.created_at)));
}

async function confirmDelete(){
if(!confirmDel)return;
await supabase.from(“notes”).delete().eq(“id”,confirmDel);
setNotes(n=>n.filter(x=>x.id!==confirmDel));setConfirmDel(null);
}

const filtered=notes.filter(n=>{
if(topicFilter&&!(n.topics||[]).includes(topicFilter))return false;
if(!n.pinned&&!passesDate(n.created_at,dateFilter))return false;
if(search){
const s=search.toLowerCase();
if(!(n.body||””).replace(/<[^>]+>/g,””).toLowerCase().includes(s)&&
!(n.title||””).toLowerCase().includes(s))return false;
}
return true;
});
const pinned=filtered.filter(n=>n.pinned);
const unpinned=filtered.filter(n=>!n.pinned);

const pill=(t,active,onClick)=>{
const col=TOPIC_COLORS[t]||”#58a6ff”;
return(
<button key={t} onClick={onClick} style={{
fontSize:10,fontWeight:700,padding:“2px 7px”,borderRadius:3,
border:“1px solid “+(active?col:col+“44”),
background:active?col+“22”:“transparent”,color:active?col:col+“66”,
cursor:“pointer”,fontFamily:“inherit”,letterSpacing:“0.03em”,whiteSpace:“nowrap”,
}}>{t}</button>
);
};

function NoteCard({note}){
const isEdit=editingId===note.id;
const isOpen=expandedId===note.id;
const [eTitle,setETitle]=useState(note.title||””);
const [eTopics,setETopics]=useState(note.topics||[]);
const eRef=useRef(null);
const preview=(note.body||””).replace(/<[^>]+>/g,””).slice(0,140);
return(
<div style={{background:note.pinned?“rgba(88,166,255,0.05)”:”#0c1729”,
border:“1px solid “+(note.pinned?“rgba(88,166,255,0.28)”:“rgba(58,130,246,0.18)”),
borderRadius:7,overflow:“hidden”}}>
<div style={{display:“flex”,alignItems:“flex-start”,gap:8,padding:“8px 12px”,
borderBottom:(isEdit||isOpen)?“1px solid rgba(58,130,246,0.10)”:“none”,
background:(isEdit||isOpen)?”#111f35”:“transparent”}}>
<button onClick={()=>togglePin(note)} title={note.pinned?“Unpin”:“Pin”}
style={{background:“none”,border:“none”,cursor:“pointer”,fontSize:13,padding:“0 2px”,
color:note.pinned?”#f5a623”:“rgba(110,155,215,0.45)”,
opacity:note.pinned?1:0.4,flexShrink:0,lineHeight:1,paddingTop:2}}>📌</button>
{(note.topics||[]).length>0&&!isEdit&&(
<div style={{display:“flex”,gap:3,flexWrap:“wrap”,flexShrink:0,paddingTop:2}}>
{(note.topics||[]).map(t=>{const col=TOPIC_COLORS[t]||”#58a6ff”;return(
<span key={t} style={{fontSize:10,fontWeight:700,padding:“1px 5px”,borderRadius:2,
background:col+“18”,border:“1px solid “+col+“44”,color:col}}>{t}</span>
);})}
</div>
)}
<div style={{flex:1,minWidth:0,cursor:“pointer”}} onClick={()=>!isEdit&&setExpandedId(isOpen?null:note.id)}>
{!isEdit&&note.title&&<div style={{fontSize:13,fontWeight:700,color:”#e8f2ff”,marginBottom:2}}>{note.title}</div>}
{!isEdit&&!isOpen&&<div style={{fontSize:12,color:“rgba(160,200,255,0.65)”,overflow:“hidden”,textOverflow:“ellipsis”,whiteSpace:“nowrap”}}>{preview||”\u2014”}</div>}
</div>
<div style={{display:“flex”,alignItems:“center”,gap:6,flexShrink:0}}>
<span style={{fontSize:11,color:“rgba(110,155,215,0.45)”}}>{fmtTs(note.updated_at||note.created_at)}</span>
{!isEdit&&<button onClick={()=>{setEditingId(note.id);setExpandedId(note.id);}}
style={{background:“none”,border:“1px solid rgba(58,130,246,0.10)”,borderRadius:3,
color:“rgba(160,200,255,0.65)”,cursor:“pointer”,fontSize:10,padding:“1px 7px”,fontFamily:“inherit”,fontWeight:600}}>Edit</button>}
{isEdit&&<>
<button onClick={()=>saveEdit(note.id,eRef.current?.innerHTML||””,eTitle,eTopics)}
style={{background:“transparent”,border:“1px solid rgba(88,166,255,0.55)”,borderRadius:3,
color:“rgba(140,200,255,0.9)”,cursor:“pointer”,fontSize:10,padding:“2px 9px”,
fontFamily:“inherit”,fontWeight:700,letterSpacing:“0.05em”,textTransform:“uppercase”}}>Save</button>
<button onClick={()=>setEditingId(null)}
style={{background:“none”,border:“1px solid rgba(58,130,246,0.10)”,borderRadius:3,
color:“rgba(160,200,255,0.65)”,cursor:“pointer”,fontSize:10,padding:“1px 7px”,fontFamily:“inherit”}}>Cancel</button>
</>}
<button onClick={()=>setConfirmDel(note.id)}
style={{background:“none”,border:“none”,color:”#ff6b6b”,cursor:“pointer”,fontSize:11,opacity:0.5,padding:“0 2px”,lineHeight:1}}>✕</button>
{!isEdit&&<span onClick={()=>setExpandedId(isOpen?null:note.id)}
style={{fontSize:11,color:“rgba(110,155,215,0.45)”,cursor:“pointer”}}>{isOpen?”\u25b2”:”\u25bc”}</span>}
</div>
</div>
{isEdit&&(
<div>
<div style={{padding:“6px 12px”,borderBottom:“1px solid rgba(58,130,246,0.10)”,display:“flex”,gap:8,alignItems:“center”,flexWrap:“wrap”}}>
<input value={eTitle} onChange={e=>setETitle(e.target.value)} placeholder=“Title\u2026”
style={{flex:1,background:“transparent”,border:“none”,color:”#e8f2ff”,
fontFamily:“inherit”,fontSize:13,fontWeight:600,outline:“none”,minWidth:80}}/>
<div style={{display:“flex”,gap:3,flexWrap:“wrap”}}>
{TOPICS.map(t=>pill(t,eTopics.includes(t),()=>setETopics(p=>p.includes(t)?p.filter(x=>x!==t):[…p,t])))}
</div>
</div>
<Toolbar/>
<div ref={eRef} contentEditable suppressContentEditableWarning
dangerouslySetInnerHTML={{__html:note.body}}
style={{minHeight:80,padding:“10px 14px”,color:”#e8f2ff”,
fontFamily:“inherit”,fontSize:12,outline:“none”,lineHeight:1.65}}/>
{(note.images||[]).length>0&&(
<div style={{display:“flex”,gap:6,padding:“6px 12px”,flexWrap:“wrap”}}>
{(note.images||[]).map((src,i)=>(
<img key={i} src={src} style={{maxHeight:100,borderRadius:4,border:“1px solid rgba(58,130,246,0.18)”,cursor:“pointer”}}
onClick={()=>window.open(src,”_blank”)}/>
))}
</div>
)}
</div>
)}
{isOpen&&!isEdit&&(
<div>
<div dangerouslySetInnerHTML={{__html:note.body}}
style={{padding:“12px 16px”,fontSize:13,color:”#e8f2ff”,lineHeight:1.7,fontFamily:“inherit”}}/>
{(note.images||[]).length>0&&(
<div style={{display:“flex”,gap:8,padding:“0 16px 12px”,flexWrap:“wrap”}}>
{(note.images||[]).map((src,i)=>(
<img key={i} src={src} style={{maxHeight:160,borderRadius:5,border:“1px solid rgba(58,130,246,0.18)”,cursor:“pointer”,objectFit:“cover”}}
onClick={()=>window.open(src,”_blank”)}/>
))}
</div>
)}
</div>
)}
</div>
);
}

function NoteThumb({note}){
const preview=(note.body||””).replace(/<[^>]+>/g,””).slice(0,100);
const img=(note.images||[])[0];
return(
<div onClick={()=>{setExpandedId(note.id);setViewMode(“list”);}}
style={{background:note.pinned?“rgba(88,166,255,0.06)”:”#0c1729”,
border:“1px solid “+(note.pinned?“rgba(88,166,255,0.28)”:“rgba(58,130,246,0.18)”),
borderRadius:7,overflow:“hidden”,cursor:“pointer”,display:“flex”,
flexDirection:“column”,minHeight:130,transition:“border-color 0.15s”}}>
{img&&<img src={img} style={{width:“100%”,height:80,objectFit:“cover”}}/>}
<div style={{padding:“8px 10px”,flex:1,display:“flex”,flexDirection:“column”,gap:4}}>
{note.pinned&&<span style={{fontSize:10,color:”#f5a623”}}>📌</span>}
<div>{(note.topics||[]).slice(0,3).map(t=>{const col=TOPIC_COLORS[t]||”#58a6ff”;return(
<span key={t} style={{fontSize:9,fontWeight:700,padding:“1px 4px”,borderRadius:2,
background:col+“18”,color:col,display:“inline-block”,marginRight:3}}>{t}</span>
);})}</div>
{note.title&&<div style={{fontSize:12,fontWeight:700,color:”#e8f2ff”}}>{note.title}</div>}
<div style={{fontSize:11,color:“rgba(160,200,255,0.65)”,lineHeight:1.4,flex:1,
overflow:“hidden”,display:”-webkit-box”,WebkitLineClamp:3,WebkitBoxOrient:“vertical”}}>{preview}</div>
<div style={{fontSize:10,color:“rgba(110,155,215,0.45)”}}>{fmtTs(note.created_at)}</div>
</div>
</div>
);
}

return(
<div style={{display:“flex”,flexDirection:“column”,gap:10,height:“100%”,minHeight:0}}>
{confirmDel&&(
<div style={{position:“fixed”,inset:0,background:“rgba(0,0,0,0.55)”,zIndex:999,
display:“flex”,alignItems:“center”,justifyContent:“center”}}>
<div style={{background:”#0c1729”,border:“1px solid #ff6b6b”,borderRadius:8,
padding:“20px 28px”,display:“flex”,flexDirection:“column”,gap:14,
boxShadow:“0 8px 32px rgba(0,0,0,0.6)”,minWidth:280}}>
<div style={{fontSize:13,color:”#e8f2ff”}}>Delete this note permanently?</div>
<div style={{display:“flex”,gap:8,justifyContent:“flex-end”}}>
<button onClick={()=>setConfirmDel(null)} style={{background:”#111f35”,
border:“1px solid rgba(58,130,246,0.18)”,borderRadius:5,color:“rgba(160,200,255,0.65)”,
padding:“6px 16px”,cursor:“pointer”,fontFamily:“inherit”,fontSize:12}}>Cancel</button>
<button onClick={confirmDelete} style={{background:”#ff6b6b”,border:“none”,
borderRadius:5,color:”#fff”,padding:“6px 16px”,cursor:“pointer”,
fontFamily:“inherit”,fontWeight:700,fontSize:12}}>Delete</button>
</div>
</div>
</div>
)}

```
  <div style={{background:"#0c1729",border:"1px solid rgba(58,130,246,0.18)",borderRadius:8,overflow:"hidden",flexShrink:0}}
    onDrop={handleDrop} onDragOver={e=>e.preventDefault()}>
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
      borderBottom:"1px solid rgba(58,130,246,0.10)",flexWrap:"wrap"}}>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional)\u2026"
        style={{flex:"0 0 180px",background:"transparent",border:"none",color:"#e8f2ff",
          fontFamily:"inherit",fontSize:13,fontWeight:600,outline:"none",minWidth:0}}/>
      <div style={{display:"flex",gap:3,flexWrap:"wrap",flex:1}}>
        {TOPICS.map(t=>pill(t,selTopics.includes(t),()=>setSelTopics(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])))}
      </div>
    </div>
    <Toolbar/>
    <div ref={editorRef} contentEditable suppressContentEditableWarning
      onPaste={handlePaste}
      onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))save();}}
      data-placeholder="Write your note\u2026 (Ctrl+Enter to save, paste screenshots directly)"
      style={{minHeight:80,padding:"10px 14px",color:"#e8f2ff",
        fontFamily:"inherit",fontSize:12,outline:"none",lineHeight:1.65}}/>
    {images.length>0&&(
      <div style={{display:"flex",gap:6,padding:"6px 12px",borderTop:"1px solid rgba(58,130,246,0.10)",flexWrap:"wrap"}}>
        {images.map((img,i)=>(
          <div key={i} style={{position:"relative"}}>
            <img src={img.dataUrl} style={{height:70,borderRadius:4,border:"1px solid rgba(58,130,246,0.18)",objectFit:"cover"}}/>
            <button onClick={()=>setImages(p=>p.filter((_,j)=>j!==i))}
              style={{position:"absolute",top:-4,right:-4,background:"#ff6b6b",border:"none",
                borderRadius:"50%",width:16,height:16,color:"#fff",fontSize:9,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>&#x2715;</button>
          </div>
        ))}
      </div>
    )}
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",
      borderTop:"1px solid rgba(58,130,246,0.10)",background:"rgba(4,10,22,0.4)"}}>
      <button onClick={()=>fileRef.current?.click()}
        style={{background:"transparent",border:"1px solid rgba(58,130,246,0.10)",borderRadius:3,
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
      }}>{saving?"Saving\u2026":"Save Note"}</button>
    </div>
  </div>

  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
    <div style={{position:"relative",flex:"0 0 200px"}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notes\u2026"
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
    <div style={{width:1,background:"rgba(58,130,246,0.10)",height:18}}/>
    <button onClick={()=>setTopicFilter(null)} style={{
      fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:3,
      border:"1px solid "+(topicFilter===null?"rgba(88,166,255,0.5)":"rgba(58,130,246,0.18)"),
      background:topicFilter===null?"rgba(88,166,255,0.12)":"transparent",
      color:topicFilter===null?"rgba(140,200,255,0.9)":"rgba(110,155,215,0.45)",
      cursor:"pointer",fontFamily:"inherit",
    }}>All</button>
    {TOPICS.map(t=>pill(t,topicFilter===t,()=>setTopicFilter(p=>p===t?null:t)))}
    <span style={{marginLeft:"auto",fontSize:11,color:"rgba(110,155,215,0.45)"}}>
      {filtered.length} note{filtered.length!==1?"s":""}
    </span>
    <div style={{display:"flex",gap:0,border:"1px solid rgba(58,130,246,0.18)",borderRadius:4,overflow:"hidden"}}>
      {[["list","\u2630"],["grid","\u229e"]].map(([v,icon])=>(
        <button key={v} onClick={()=>setViewMode(v)} style={{
          background:viewMode===v?"rgba(88,166,255,0.15)":"transparent",
          border:"none",borderRight:v==="list"?"1px solid rgba(58,130,246,0.18)":"none",
          color:viewMode===v?"#58a6ff":"rgba(110,155,215,0.45)",
          padding:"3px 10px",cursor:"pointer",fontSize:13,lineHeight:1,
        }}>{icon}</button>
      ))}
    </div>
  </div>

  <div style={{flex:1,minHeight:0,overflowY:"auto"}}>
    {loading&&<div style={{fontSize:12,color:"rgba(110,155,215,0.45)",padding:"20px",textAlign:"center"}}>Loading\u2026</div>}
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
        {viewMode==="list"
          ?<div style={{display:"flex",flexDirection:"column",gap:5}}>{pinned.map(n=><NoteCard key={n.id} note={n}/>)}</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>{pinned.map(n=><NoteThumb key={n.id} note={n}/>)}</div>
        }
      </div>
    )}
    {unpinned.length>0&&(
      <div>
        {pinned.length>0&&<div style={{fontSize:10,fontWeight:700,color:"rgba(110,155,215,0.45)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6,padding:"0 2px"}}>Notes</div>}
        {viewMode==="list"
          ?<div style={{display:"flex",flexDirection:"column",gap:5}}>{unpinned.map(n=><NoteCard key={n.id} note={n}/>)}</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>{unpinned.map(n=><NoteThumb key={n.id} note={n}/>)}</div>
        }
      </div>
    )}
  </div>

  <style>{`
    [data-placeholder]:empty:before{content:attr(data-placeholder);color:rgba(110,155,215,0.35);pointer-events:none;}
    [contenteditable] ul{padding-left:18px;margin:4px 0;}
    [contenteditable] ol{padding-left:18px;margin:4px 0;}
    [contenteditable] li{margin:2px 0;}
  `}</style>
</div>
```

);
}
