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

// Toolbar component - stable reference
function Toolbar(){
  const btn=(label,action)=>(
    <button key={action} onMouseDown={e=>{e.preventDefault();applyFmt(action);}} style={{
      background:"transparent",border:"1px solid rgba(58,130,246,0.12)",borderRadius:3,
      color:"rgba(160,200,255,0.65)",padding:"2px 7px",fontFamily:"inherit",fontSize:11,cursor:"pointer",
      fontWeight:action==="bold"?700:400,fontStyle:action==="italic"?"italic":"normal",
      textDecoration:action==="underline"?"underline":"none",
    }}>{label}</button>
  );
  return(
    <div style={{display:"flex",gap:4,padding:"5px 10px",borderBottom:"1px solid rgba(58,130,246,0.08)",background:"rgba(4,10,22,0.4)",flexWrap:"wrap"}}>
      {btn("B","bold")}{btn("U","underline")}{btn("I","italic")}
      <div style={{width:1,background:"rgba(58,130,246,0.10)",margin:"0 2px"}}/>
      {btn("\u2022 List","insertUnorderedList")}{btn("1. List","insertOrderedList")}
    </div>
  );
}

// Image lightbox
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

export default function NotesTab(){
  const [notes,setNotes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [topicFilter,setTopicFilter]=useState(null);
  const [dateFilter,setDateFilter]=useState("all");
  // Persist view mode in localStorage
  const [viewMode,setViewMode]=useState(()=>localStorage.getItem(VM_KEY)||"list");
  const [selTopics,setSelTopics]=useState([]);
  const [title,setTitle]=useState("");
  const [saving,setSaving]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [expandedId,setExpandedId]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [confirmDelImg,setConfirmDelImg]=useState(null); // {noteId, imgIndex}
  const [images,setImages]=useState([]);
  const [lightbox,setLightbox]=useState(null);
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

  // Expose notes globally so AskAI can access them
  useEffect(()=>{window.__notesData=notes;},[notes]);

  function handlePaste(e){
    // Intercept images
    for(const item of Array.from(e.clipboardData?.items||[])){
      if(item.type.startsWith("image/")){
        e.preventDefault();
        const r=new FileReader();
        r.onload=ev=>setImages(p=>[...p,{dataUrl:ev.target.result}]);
        r.readAsDataURL(item.getAsFile());return;
      }
    }
    // Strip colours/fonts but keep bold, italic, underline, lists
    const html=e.clipboardData?.getData("text/html");
    if(html){
      e.preventDefault();
      // Parse pasted HTML, strip style/color/font attrs, keep semantic tags
      const tmp=document.createElement("div");
      tmp.innerHTML=html;
      // Remove all style attributes and font/color tags
      tmp.querySelectorAll("*").forEach(el=>{
        el.removeAttribute("style");
        el.removeAttribute("color");
        el.removeAttribute("face");
        el.removeAttribute("size");
        el.removeAttribute("bgcolor");
        el.removeAttribute("class");
      });
      // Replace <font> with <span>, <h1-6> with <b>
      tmp.querySelectorAll("font").forEach(el=>{
        const span=document.createElement("span");
        span.innerHTML=el.innerHTML;
        el.replaceWith(span);
      });
      ["h1","h2","h3","h4","h5","h6"].forEach(tag=>{
        tmp.querySelectorAll(tag).forEach(el=>{
          const b=document.createElement("b");
          b.innerHTML=el.innerHTML;
          el.replaceWith(b);
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
      created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    });
    if(editorRef.current)editorRef.current.innerHTML="";
    setTitle("");setSelTopics([]);setImages([]);
    await load();setSaving(false);
  }

  async function saveEdit(id,body,editTitle,editTopics,editImages){
    const updated_at=new Date().toISOString();
    await supabase.from("notes").update({
      body,title:editTitle||null,topics:editTopics,
      images:editImages,updated_at,
    }).eq("id",id);
    // Update in-place — no full reload to prevent grid jump
    setNotes(prev=>prev.map(n=>n.id===id
      ?{...n,body,title:editTitle||null,topics:editTopics,images:editImages,updated_at}
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
    const {noteId,imgIndex,onConfirm}=confirmDelImg;
    if(noteId==="__compose__"&&onConfirm){
      onConfirm();
    } else {
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

  // Image strip used in both read and edit mode
  function ImageStrip({imgs,noteId,editMode,onEditRemove}){
    if(!imgs||imgs.length===0)return null;
    return(
      <div style={{display:"flex",gap:6,padding:"6px 12px 10px",flexWrap:"wrap",alignItems:"flex-start"}}>
        {imgs.map((src,i)=>(
          <div key={i} style={{position:"relative",display:"inline-block",flexShrink:0}}>
            {/* Small 48px thumbnail — click to expand in lightbox */}
            <img src={src}
              onClick={e=>{e.stopPropagation();setLightbox(src);}}
              style={{width:48,height:48,borderRadius:4,border:"1px solid rgba(58,130,246,0.25)",
                objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
            {/* X always shown — saved images ask confirm, compose images remove immediately */}
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

  // NoteCard — click to open modal, no inline edit
  function NoteCard({note}){
    const preview=stripHtml(note.body).slice(0,160);
    return(
      <div style={{background:note.pinned?"rgba(88,166,255,0.05)":"#0c1729",
        border:"1px solid "+(note.pinned?"rgba(88,166,255,0.28)":"rgba(58,130,246,0.18)"),
        borderRadius:7,overflow:"hidden",cursor:"pointer"}}
        onClick={()=>setExpandedId(note.id)}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 12px"}}>
          <button onClick={e=>{e.stopPropagation();togglePin(note);}} title={note.pinned?"Unpin":"Pin"}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:"0 2px",
              color:note.pinned?"#f5a623":"rgba(110,155,215,0.45)",
              opacity:note.pinned?1:0.4,flexShrink:0,lineHeight:1,paddingTop:2}}>&#x1F4CC;</button>
          {(note.topics||[]).length>0&&(
            <div style={{display:"flex",gap:3,flexWrap:"wrap",flexShrink:0,paddingTop:2}}>
              {(note.topics||[]).map(t=>{const col=TOPIC_COLORS[t]||"#58a6ff";return(
                <span key={t} style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:2,
                  background:col+"18",border:"1px solid "+col+"44",color:col}}>{t}</span>
              );})}
            </div>
          )}
          <div style={{flex:1,minWidth:0}}>
            {note.title&&<div style={{fontSize:13,fontWeight:700,color:"#e8f2ff",marginBottom:2}}>{note.title}</div>}
            <div style={{fontSize:13,color:"rgba(160,200,255,0.65)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{preview||"—"}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{fontSize:11,color:"rgba(110,155,215,0.45)"}}>{fmtTs(note.updated_at||note.created_at)}</span>
            <button onClick={e=>{e.stopPropagation();setConfirmDel(note.id);}}
              style={{background:"none",border:"none",color:"#ff6b6b",cursor:"pointer",fontSize:11,opacity:0.5,padding:"0 2px",lineHeight:1}}>&#x2715;</button>
          </div>
        </div>
        {(note.images||[]).length>0&&(
          <div style={{padding:"0 12px 8px",display:"flex",gap:6,flexWrap:"wrap"}}>
            {(note.images||[]).slice(0,3).map((src,i)=>(
              <img key={i} src={src} style={{height:50,borderRadius:4,border:"1px solid rgba(58,130,246,0.18)",objectFit:"cover"}}/>
            ))}
          </div>
        )}
      </div>
    );
  }


  // NoteThumb — tappable card, opens modal overlay
  function NoteThumb({note}){
    const preview=stripHtml(note.body).slice(0,100);
    const img=(note.images||[])[0];
    return(
      <div onClick={()=>setExpandedId(note.id)}
        style={{background:note.pinned?"rgba(88,166,255,0.06)":"#0c1729",
          border:"1px solid "+(note.pinned?"rgba(88,166,255,0.28)":"rgba(58,130,246,0.18)"),
          borderRadius:7,overflow:"hidden",cursor:"pointer",display:"flex",
          flexDirection:"column",minHeight:130,transition:"border-color 0.15s,box-shadow 0.15s",
          boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
        {img&&<img src={img} style={{width:"100%",height:80,objectFit:"cover"}}/>}
        <div style={{padding:"8px 10px",flex:1,display:"flex",flexDirection:"column",gap:4}}>
          {note.pinned&&<span style={{fontSize:10,color:"#f5a623"}}>&#x1F4CC;</span>}
          <div>{(note.topics||[]).slice(0,3).map(t=>{const col=TOPIC_COLORS[t]||"#58a6ff";return(
            <span key={t} style={{fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:2,
              background:col+"18",color:col,display:"inline-block",marginRight:3}}>{t}</span>
          );})}</div>
          {note.title&&<div style={{fontSize:13,fontWeight:700,color:"#e8f2ff"}}>{note.title}</div>}
          <div style={{fontSize:13,color:"rgba(160,200,255,0.65)",lineHeight:1.4,flex:1,
            overflow:"hidden",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical"}}>{preview}</div>
          <div style={{fontSize:10,color:"rgba(110,155,215,0.45)"}}>{fmtTs(note.created_at)}</div>
        </div>
      </div>
    );
  }

  // Modal overlay — fully isolated from parent re-renders
  // Uses a portal-style fixed overlay. All state is local refs only.
  // Parent saveEdit updates notes in-place (no reload) so modal never remounts.
  function NoteModal({note}){
    const titleRef=React.useRef(null);
    const bodyRef=React.useRef(null);
    const topicsRef=React.useRef(note.topics||[]);
    const imgsRef=React.useRef(note.images||[]);
    const [topicsDisplay,setTopicsDisplay]=React.useState(note.topics||[]);
    const [imgsDisplay,setImgsDisplay]=React.useState(note.images||[]);
    const saveTimer=React.useRef(null);
    const savedOnce=React.useRef(false);

    // Set body HTML once on mount only — never overwrite after that
    React.useEffect(()=>{
      if(bodyRef.current&&!savedOnce.current){
        bodyRef.current.innerHTML=note.body||"";
      }
    },[]);

    function doSave(){
      clearTimeout(saveTimer.current);
      const title=titleRef.current?.value||"";
      const body=bodyRef.current?.innerHTML||"";
      // Only save if something actually exists
      if(!body&&!title.trim())return;
      savedOnce.current=true;
      saveEdit(note.id,body,title.trim()||null,topicsRef.current,imgsRef.current);
    }

    function scheduleSave(){
      clearTimeout(saveTimer.current);
      saveTimer.current=setTimeout(doSave,2000);
    }

    function closeModal(){
      clearTimeout(saveTimer.current);
      doSave();
      setExpandedId(null);
    }

    // Save on unmount
    React.useEffect(()=>()=>{
      clearTimeout(saveTimer.current);
      doSave();
    },[]);

    return(
      <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
        style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:500,
          display:"flex",alignItems:"flex-start",justifyContent:"center",
          paddingTop:60,paddingLeft:16,paddingRight:16}}>
        <div style={{width:"100%",maxWidth:720,background:"#0c1729",
          border:"1px solid "+(note.pinned?"rgba(88,166,255,0.4)":"rgba(58,130,246,0.28)"),
          borderRadius:10,overflow:"hidden",boxShadow:"0 16px 48px rgba(0,0,0,0.7)",
          maxHeight:"80vh",display:"flex",flexDirection:"column"}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",
            borderBottom:"1px solid rgba(58,130,246,0.10)",background:"#111f35",flexShrink:0}}>
            <button onClick={()=>togglePin(note)} style={{background:"none",border:"none",
              cursor:"pointer",fontSize:13,color:note.pinned?"#f5a623":"rgba(110,155,215,0.45)",
              opacity:note.pinned?1:0.4}}>&#x1F4CC;</button>
            <input ref={titleRef} defaultValue={note.title||""} onChange={scheduleSave}
              placeholder="Title..."
              style={{flex:1,background:"transparent",border:"none",color:"#e8f2ff",
                fontFamily:"inherit",fontSize:14,fontWeight:700,outline:"none"}}/>
            <span style={{fontSize:11,color:"rgba(110,155,215,0.45)"}}>{fmtTs(note.updated_at||note.created_at)}</span>
            <button onClick={()=>setConfirmDel(note.id)} style={{background:"none",border:"none",
              color:"#ff6b6b",cursor:"pointer",fontSize:12,opacity:0.6}}>&#x2715;</button>
            <button onClick={closeModal}
              style={{background:"none",border:"1px solid rgba(58,130,246,0.25)",borderRadius:4,
                color:"rgba(160,200,255,0.7)",cursor:"pointer",fontSize:11,padding:"2px 10px",
                fontFamily:"inherit"}}>Close</button>
          </div>

          {/* Topics */}
          <div style={{display:"flex",gap:3,flexWrap:"wrap",padding:"6px 14px",
            borderBottom:"1px solid rgba(58,130,246,0.08)",flexShrink:0}}>
            {TOPICS.map(t=>{
              const col=TOPIC_COLORS[t]||"#58a6ff";
              const active=topicsDisplay.includes(t);
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

          {/* Toolbar */}
          <Toolbar/>

          {/* Body — innerHTML set once on mount via useEffect, never via prop after that */}
          <div ref={bodyRef} contentEditable suppressContentEditableWarning
            onInput={scheduleSave}
            style={{flex:1,overflowY:"auto",padding:"12px 16px",color:"#e8f2ff",
              fontFamily:"inherit",fontSize:13,outline:"none",lineHeight:1.7,caretColor:"#58a6ff"}}/>

          {/* Images */}
          <div style={{display:"flex",gap:6,padding:"6px 12px 10px",flexWrap:"wrap",alignItems:"flex-start"}}>
            {imgsDisplay.map((src,i)=>(
              <div key={i} style={{position:"relative",flexShrink:0}}>
                <img src={src} onClick={()=>setLightbox(src)}
                  style={{width:48,height:48,borderRadius:4,border:"1px solid rgba(58,130,246,0.25)",
                    objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
                <button onClick={()=>setConfirmDelImg({noteId:note.id,imgIndex:i,onConfirm:()=>{
                  const next=imgsDisplay.filter((_,j)=>j!==i);
                  imgsRef.current=next;setImgsDisplay(next);scheduleSave();
                }})}
                  style={{position:"absolute",top:-5,right:-5,background:"rgba(10,18,35,0.95)",
                    border:"1px solid #ff6b6b",borderRadius:"50%",width:16,height:16,
                    color:"#ff6b6b",fontSize:9,cursor:"pointer",display:"flex",
                    alignItems:"center",justifyContent:"center",fontWeight:700}}>&#x2715;</button>
              </div>
            ))}
          </div>
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

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10,height:"100%",minHeight:0}}>

      {/* Lightbox */}
      {lightbox&&<Lightbox src={lightbox} onClose={()=>setLightbox(null)}/>}

      {/* Note modal — fixed overlay. key=expandedId ensures single mount per open. */}
      {expandedId&&(()=>{
        const n=notes.find(x=>x.id===expandedId);
        // Pass a frozen snapshot so parent re-renders don't affect modal internals
        return n?<NoteModal key={expandedId} note={Object.freeze({...n})}/>:null;
      })()}

      {/* Delete note confirm */}
      {confirmDel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:999,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#0c1729",border:"1px solid #ff6b6b",borderRadius:8,
            padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,
            boxShadow:"0 8px 32px rgba(0,0,0,0.6)",minWidth:280}}>
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
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#0c1729",border:"1px solid #ff6b6b",borderRadius:8,
            padding:"20px 28px",display:"flex",flexDirection:"column",gap:14,
            boxShadow:"0 8px 32px rgba(0,0,0,0.6)",minWidth:260}}>
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
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
          borderBottom:"1px solid rgba(58,130,246,0.08)",flexWrap:"wrap"}}>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional)..."
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
          data-placeholder="Write your note... (Ctrl+Enter to save, paste screenshots)"
          style={{minHeight:80,padding:"10px 14px",color:"#e8f2ff",
            fontFamily:"inherit",fontSize:12,outline:"none",lineHeight:1.65,caretColor:"#58a6ff"}}/>
        {/* Compose image previews — small thumbnails */}
        {images.length>0&&(
          <div style={{display:"flex",gap:6,padding:"6px 12px",borderTop:"1px solid rgba(58,130,246,0.08)",flexWrap:"wrap",alignItems:"flex-start"}}>
            {images.map((img,i)=>(
              <div key={i} style={{position:"relative",flexShrink:0}}>
                <img src={img.dataUrl}
                  onClick={()=>setLightbox(img.dataUrl)}
                  style={{width:48,height:48,borderRadius:4,border:"1px solid rgba(58,130,246,0.25)",objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
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
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
        <div style={{position:"relative",flex:"0 0 180px"}}>
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
            <button key={v} onClick={()=>setView(v)} style={{
              background:viewMode===v?"rgba(88,166,255,0.15)":"transparent",
              border:"none",borderRight:v==="list"?"1px solid rgba(58,130,246,0.18)":"none",
              color:viewMode===v?"#58a6ff":"rgba(110,155,215,0.45)",
              padding:"3px 10px",cursor:"pointer",fontSize:13,lineHeight:1,
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
      `}</style>
    </div>
  );
}
