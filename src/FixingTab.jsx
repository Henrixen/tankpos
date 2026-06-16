import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseclient";
import { C, SEGMENTS } from "./constants";
import { classifyRegion, daysBetween, stripHtml } from "./utils";
import { loadFixingJobs, saveFixingJob, deleteFixingJob, loadClients, saveClient, deleteClient } from "./supabaseHelpers";
import { isMobile } from "./constants";

const JOB_STATUS = ["OPEN","WORKING","SUBS","FIXED","FAILED"];
const JOB_STATUS_COL = {OPEN:C.blue,WORKING:C.amber,SUBS:C.purple,FIXED:C.green,FAILED:C.red};
const TRADES = ["UKC","Med","EU Feast","AG","TA West","Ex US","Asia"];
const EDIT_FIELDS = ["cargo_details","notes","indications","subs_fixed"];

function focusJobField(jobId, field){
  const el = document.querySelector(`[data-job-field="${jobId}-${field}"]`);
  if (el) { el.focus(); if (el.select) el.select(); }
}
function cycleJobField(jobId, currentField, backwards=false){
  const idx = EDIT_FIELDS.indexOf(currentField);
  if (idx === -1) return;
  const nextIdx = backwards ? (idx-1+EDIT_FIELDS.length)%EDIT_FIELDS.length : (idx+1)%EDIT_FIELDS.length;
  focusJobField(jobId, EDIT_FIELDS[nextIdx]);
}

// RichEditor — each instance resizes INDEPENDENTLY; ↕ toggles expand/collapse
function RichEditor({ jobId, field, title, titleRight, value, onChange, onResizeSave, height=120, placeholder="", color=C.tx }){
  const editorRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const savedHeightRef = React.useRef(height); // track the collapsed height
  const progResizing = React.useRef(false); // suppress observer during programmatic resize

  React.useEffect(()=>{
    // Keep savedHeightRef in sync with incoming height prop (from drag saves)
    if (!isExpanded) savedHeightRef.current = height;
  }, [height, isExpanded]);

  React.useEffect(()=>{
    const el = editorRef.current;
    if (!el || document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  function exec(cmd){ editorRef.current?.focus(); document.execCommand(cmd,false,null); onChange(editorRef.current?.innerHTML||""); }
  function handleInput(){ onChange(editorRef.current?.innerHTML||""); }
  function handlePaste(e){
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (document.queryCommandSupported && document.queryCommandSupported("insertText")) {
      document.execCommand("insertText", false, text);
    } else {
      // Fallback: insert at cursor manually
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      }
    }
    onChange(editorRef.current?.innerHTML||"");
  }
  function handleKeyDown(e){
    if(e.key==="Tab"){ e.preventDefault(); cycleJobField(jobId,field,e.shiftKey); }
  }

  function toggleExpand(){
    const el = editorRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    progResizing.current = true;
    if (isExpanded) {
      const h = savedHeightRef.current || height;
      wrap.style.height = h + "px";
      wrap.style.minHeight = h + "px";
      setIsExpanded(false);
    } else {
      savedHeightRef.current = wrap.offsetHeight || height;
      const newH = Math.max(80, el.scrollHeight + 44);
      wrap.style.height = newH + "px";
      wrap.style.minHeight = newH + "px";
      setIsExpanded(true);
    }
    setTimeout(()=>{ progResizing.current = false; }, 300);
  }

  // Save height on manual drag only (not programmatic)
  React.useEffect(()=>{
    const el = wrapRef.current;
    if (!el || !window.ResizeObserver) return;
    let t = null;
    const ro = new ResizeObserver(()=>{
      if (progResizing.current) return;
      clearTimeout(t);
      t = setTimeout(()=>{
        const h = el.offsetHeight;
        if (h && !isExpanded) {
          savedHeightRef.current = h;
          onResizeSave?.(Math.round(h));
        }
      }, 250);
    });
    ro.observe(el);
    return ()=>{ clearTimeout(t); ro.disconnect(); };
  }, [jobId, field, onResizeSave, isExpanded]);

  const btnSt = {fontSize:10,padding:"1px 6px",borderRadius:3,border:"1px solid "+C.bd,background:C.bg3,color:C.faint,cursor:"pointer",lineHeight:1.4,fontFamily:"inherit"};
  return (
    <div ref={wrapRef} style={{
      background:C.bg3, border:"1px solid "+C.bd, borderRadius:6,
      height:height, minHeight:height, resize:"vertical", overflow:"auto",
      boxSizing:"border-box", transition:"none"
    }}>
      <style>{`
        [data-richwrap="${jobId}-${field}"]::-webkit-resizer{background:transparent;border-bottom:2px solid rgba(120,160,220,0.3);border-right:2px solid rgba(120,160,220,0.3);}
        [data-job-field="${jobId}-${field}"]:empty:before{content:attr(data-placeholder);color:${C.faint};pointer-events:none;}
        [data-job-field="${jobId}-${field}"] ul{margin:0;padding-left:16px;}
        [data-job-field="${jobId}-${field}"] ol{margin:0;padding-left:16px;list-style-type:decimal;}
        [data-job-field="${jobId}-${field}"] ol ol{list-style-type:lower-alpha;}
        [data-job-field="${jobId}-${field}"] li{margin:0;padding:0;}
        [data-job-field="${jobId}-${field}"] p{margin:0;}
        [data-job-field="${jobId}-${field}"] *{color:inherit !important;font-family:inherit !important;font-size:inherit !important;background:transparent !important;}
      `}</style>
      <div data-richwrap={`${jobId}-${field}`} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"4px 6px", borderBottom:"1px solid "+C.bd2,
        background:C.bg4, position:"sticky", top:0, zIndex:1
      }}>
        <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{title}</span>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          {titleRight}
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={toggleExpand}
            title={isExpanded?"Collapse to saved height":"Expand to fit all content"}
            style={{...btnSt,color:isExpanded?"#58a6ff":C.faint,fontWeight:isExpanded?700:400}}>
            {isExpanded?"↑":"↕"}
          </button>
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>exec("insertUnorderedList")} title="Bullet list" style={btnSt}>•</button>
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>exec("insertOrderedList")} title="Numbered list" style={btnSt}>1.</button>
        </div>
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        data-job-field={`${jobId}-${field}`}
        onInput={handleInput} onKeyDown={handleKeyDown} onPaste={handlePaste}
        style={{
          padding:"8px 10px", minHeight:Math.max(50,height-36),
          color, fontFamily:"Inter,system-ui,-apple-system,Segoe UI,sans-serif",
          fontSize:12, lineHeight:1.6, outline:"none", whiteSpace:"pre-wrap"
        }}
        data-placeholder={placeholder}
      />
    </div>
  );
}

function ClientCard({charterer,jobs,expandedJob,setExpandedJob,clients,editingClientName,setEditingClientName,renameClient,setPendingDelClient,createJob,inpS,JOB_STATUS_COL}){
  const [showPencilMenu,setShowPencilMenu]=useState(false);
  const [logoOk,setLogoOk]=useState(true);
  const allCJobs=jobs.filter(j=>(j.charterer||"")===charterer);
  const total=allCJobs.length;
  const isActive=expandedJob===charterer;
  const client=clients.find(c=>c.name===charterer);
  const isEditingName=editingClientName===client?.id;
  // Guess a domain from the company name for the logo lookup (best-effort, silently hidden on failure)
  const domainGuess=(charterer||"").toLowerCase().replace(/[^a-z0-9\s]/g,"").trim().split(/\s+/)[0];
  const logoUrl=domainGuess?`https://logo.clearbit.com/${domainGuess}.com`:null;
  return(
    <div style={{
      display:"flex",flexDirection:"column",position:"relative",
      background:isActive?"rgba(30,60,120,0.5)":"rgba(8,18,38,0.85)",
      border:"1px solid "+(isActive?"rgba(88,166,255,0.6)":"rgba(58,130,246,0.15)"),
      borderRadius:8,overflow:"visible",minWidth:150,
      boxShadow:isActive?"0 0 16px rgba(88,166,255,0.22)":"none",
      transition:"all 0.15s",cursor:"pointer"}}
      onClick={()=>setExpandedJob(isActive?null:charterer)}>
      {logoUrl&&logoOk&&(
        <img src={logoUrl} alt="" onError={()=>setLogoOk(false)}
          style={{position:"absolute",top:8,right:8,width:18,height:18,borderRadius:4,
            objectFit:"contain",background:"rgba(255,255,255,0.92)",padding:2,
            border:"1px solid rgba(88,166,255,0.2)",pointerEvents:"none"}}/>
      )}
      <div style={{padding:"12px 14px 10px"}}>
        {isEditingName&&client?(
          <input autoFocus defaultValue={client.name}
            onBlur={e=>renameClient(client.id,e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")renameClient(client.id,e.target.value);if(e.key==="Escape")setEditingClientName(null);}}
            onClick={e=>e.stopPropagation()}
            style={{...inpS,width:"100%",fontSize:13,fontWeight:700,padding:"2px 6px"}}/>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:13,fontWeight:700,color:isActive?"#79c0ff":"rgba(200,220,255,0.85)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,paddingRight:logoUrl&&logoOk?22:0}}>{charterer||"—"}</span>
            {client&&(
              <div style={{position:"relative",flexShrink:0}} onClick={e=>e.stopPropagation()}>
                <button onClick={e=>{e.stopPropagation();setShowPencilMenu(v=>!v);}}
                  style={{background:"none",border:"none",color:"rgba(120,160,220,0.3)",fontSize:11,cursor:"pointer",padding:"0 2px",lineHeight:1}}>✎</button>
                {showPencilMenu&&(
                  <>
                    <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setShowPencilMenu(false)}/>
                    <div style={{position:"absolute",right:0,top:"100%",zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.25)",borderRadius:5,padding:4,minWidth:110,boxShadow:"0 6px 20px rgba(0,0,0,0.6)"}}>
                      <button onClick={()=>{setEditingClientName(client.id);setShowPencilMenu(false);}}
                        style={{display:"block",width:"100%",background:"none",border:"none",color:"rgba(160,200,255,0.7)",fontSize:11,padding:"4px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>✎ Rename</button>
                      <button onClick={()=>{setPendingDelClient(client);setShowPencilMenu(false);}}
                        style={{display:"block",width:"100%",background:"none",border:"none",color:"rgba(255,107,107,0.6)",fontSize:11,padding:"4px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>✕ Delete client</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {/* Total cargo count — always shown */}
        <div style={{fontSize:11,color:isActive?"rgba(140,190,255,0.6)":"rgba(120,160,220,0.3)",marginTop:4,fontWeight:400}}>
          {total} cargo{total!==1?"es":""}
        </div>
      </div>
    </div>
  );
}

// Multi-select dropdown with checkboxes
function MultiSelectDropdown({options,selected,onChange,placeholder,color}){
  const [open,setOpen]=useState(false);
  const ref=React.useRef(null);
  const sel=Array.isArray(selected)?selected:(selected?[selected]:[]);
  React.useEffect(()=>{
    if(!open)return;
    function close(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[open]);
  function toggle(v){onChange(sel.includes(v)?sel.filter(x=>x!==v):[...sel,v]);}
  return(
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <div onClick={()=>setOpen(v=>!v)} style={{
        background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:sel.length?color:"rgba(120,160,220,0.35)",
        fontFamily:"inherit",fontSize:11,padding:"2px 5px",cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
        display:"flex",alignItems:"center",justifyContent:"space-between",gap:3,minHeight:22}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{sel.length?sel.join(", "):placeholder}</span>
        <span style={{fontSize:9,flexShrink:0,color:"rgba(120,160,220,0.4)"}}>▾</span>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"100%",left:0,zIndex:9999,background:C.bg2,border:"1px solid rgba(88,166,255,0.3)",borderRadius:5,padding:"4px 0",minWidth:"100%",boxShadow:"0 6px 20px rgba(0,0,0,0.6)",maxHeight:200,overflowY:"auto"}}>
          {options.map(o=>(
            <label key={o} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 8px",cursor:"pointer",color:sel.includes(o)?color:"rgba(180,210,255,0.65)",fontSize:11,userSelect:"none"}}
              onClick={e=>e.stopPropagation()}>
              <input type="checkbox" checked={sel.includes(o)} onChange={()=>toggle(o)}
                style={{accentColor:color||"#58a6ff",cursor:"pointer"}}/>
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Owner note popout
function OwnerNoteButton({ownerId,note,onSave}){
  const [open,setOpen]=useState(false);
  const [val,setVal]=useState(note||"");
  const btnRef=React.useRef(null);
  const [pos,setPos]=useState({top:0,left:0});
  function openPopout(e){
    e.stopPropagation();
    setVal(note||"");
    if(btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      setPos({top:r.bottom+4,left:Math.max(4,r.left-160)});
    }
    setOpen(v=>!v);
  }
  function save(){onSave(val);setOpen(false);}
  return(
    <>
      <button ref={btnRef} onClick={openPopout}
        style={{background:"none",border:"none",color:note?"rgba(250,200,100,0.7)":"rgba(120,160,220,0.25)",cursor:"pointer",fontSize:11,padding:"0 2px",lineHeight:1}} title="Add note">
        {note?"✎":"✎"}
      </button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>{save();}}/>
          <div style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:6,padding:"8px",boxShadow:"0 8px 24px rgba(0,0,0,0.7)",width:220}} onClick={e=>e.stopPropagation()}>
            <textarea value={val} onChange={e=>setVal(e.target.value)} autoFocus
              placeholder="Note about this owner…"
              style={{width:"100%",background:"rgba(6,12,28,0.9)",border:"1px solid rgba(88,166,255,0.2)",borderRadius:4,color:"#cde",fontFamily:"inherit",fontSize:11,padding:"5px 7px",outline:"none",resize:"vertical",minHeight:70,boxSizing:"border-box",lineHeight:1.5}}/>
            <div style={{display:"flex",gap:5,marginTop:5}}>
              <button onClick={save} style={{flex:1,background:"rgba(88,166,255,0.18)",border:"1px solid rgba(88,166,255,0.35)",borderRadius:3,color:"#79c0ff",fontFamily:"inherit",fontSize:11,padding:"3px",cursor:"pointer",fontWeight:600}}>Save</button>
              <button onClick={()=>setOpen(false)} style={{background:"none",border:"1px solid rgba(120,160,220,0.2)",borderRadius:3,color:"rgba(120,160,220,0.4)",fontFamily:"inherit",fontSize:11,padding:"3px 8px",cursor:"pointer"}}>✕</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function FixingTab({vessels}){
  const mobile=isMobile();
  const [jobs,setJobs]=useState([]);
  const [clients,setClients]=useState([{id:"c1",name:"Aramco"},{id:"c2",name:"Trafigura"},{id:"c3",name:"Circle K"},{id:"c4",name:"Equinor"},{id:"c5",name:"CSS SA"},{id:"c6",name:"BASF"},{id:"c7",name:"Essar"},{id:"c8",name:"Exxon"},{id:"c9",name:"ENI"}]);
  const [owners,setOwners]=useState([]);
  const [expandedJob,setExpandedJob]=useState(null);
  const [editingClient,setEditingClient]=useState(null);
  const [showNewClient,setShowNewClient]=useState(false);
  const [showOwnerDir,setShowOwnerDir]=useState(false);
  const [statusFilter,setStatusFilter]=useState("ALL");
  const [clientFilter,setClientFilter]=useState("ALL");
  const [newClient,setNewClient]=useState({id:"",name:"",coverage:"",notes:""});
  const [newOwnerEntry,setNewOwnerEntry]=useState({id:"",company:"",segments:[],trades:[],pic:"",comment:""});
  const [jobSearch,setJobSearch]=useState("");
  const [pendingDelJob,setPendingDelJob]=useState(null);
  const [pendingDelOwner,setPendingDelOwner]=useState(null);
  const [pendingDelClient,setPendingDelClient]=useState(null);
  const [ownerDirSearch,setOwnerDirSearch]=useState("");
  const [ownerSegFilter,setOwnerSegFilter]=useState(null);
  const [ownerTradeFilter,setOwnerTradeFilter]=useState(null);
  const [clientViewMode,setClientViewMode]=useState("matrix");
  const [clientSort,setClientSort]=useState("name"); // "name"|"open"|"subs"|"working"|"fixed"
  const [editingClientName,setEditingClientName]=useState(null); // id of client being renamed
  const [notePopout,setNotePopout]=useState(null); // charterer name for popout // "matrix" | "list"

  useEffect(()=>{
    loadFixingJobs().then(setJobs);
    loadClients().then(setClients);
    supabase.from("dashboard").select("value").eq("key","owner-directory").single()
      .then(({data})=>{if(data)try{setOwners(JSON.parse(data.value));}catch(_){}});
  },[]);

  async function saveOwnerDir(dir){ setOwners(dir); await supabase.from("dashboard").upsert({key:"owner-directory",value:JSON.stringify(dir)},{onConflict:"key"}); }
  function addOwnerEntry(){ const id="od_"+Date.now()+"_"+Math.random().toString(36).slice(2,5); saveOwnerDir([...owners,{...newOwnerEntry,id}]); setNewOwnerEntry({id:"",company:"",segments:[],trades:[],pic:"",comment:""}); }
  function updateOwnerEntry(id,field,val){ saveOwnerDir(owners.map(o=>o.id===id?{...o,[field]:val}:o)); }
  function removeOwnerEntry(id){ setPendingDelOwner(id); }
  function confirmRemoveOwnerEntry(){ if(!pendingDelOwner)return; saveOwnerDir(owners.filter(o=>o.id!==pendingDelOwner)); setPendingDelOwner(null); }

  const filteredJobs=useMemo(()=>jobs.filter(j=>{
    if(statusFilter!=="ALL"&&j.status!==statusFilter)return false;
    if(clientFilter!=="ALL"&&j.charterer!==clientFilter)return false;
    if(jobSearch.trim()){const t=jobSearch.trim().toLowerCase();const hay=[j.charterer,j.product,j.qty,j.load,j.disch,j.laycan,j.outcome,j.fixed_owner,j.fixed_vessel].filter(Boolean).join(" ").toLowerCase();if(!hay.includes(t))return false;}
    return true;
  }),[jobs,statusFilter,clientFilter,jobSearch]);

  const charterersList=useMemo(()=>{
    // All client names + any job charterers not in clients list
    const clientNames=clients.map(c=>c.name).filter(Boolean);
    const jobCharterers=[...new Set(jobs.map(j=>j.charterer||"").filter(Boolean))];
    const allNames=[...new Set([...clientNames,...jobCharterers])];
    // Filter by clientFilter if set
    const source=clientFilter==="ALL"?allNames:[clientFilter];
    // Filter by search/status — remove names with no matching filtered jobs (only if search/status active)
    const filtered= (jobSearch.trim()||statusFilter!=="ALL")
      ? source.filter(name=>filteredJobs.some(j=>(j.charterer||"")===name)||clients.some(c=>c.name===name&&!jobs.some(j=>j.charterer===name)))
      : source;
    if(clientSort==="name") return filtered.sort((a,b)=>a.localeCompare(b));
    return filtered.sort((a,b)=>{
      const cntA=jobs.filter(j=>(j.charterer||"")===a&&j.status===clientSort.toUpperCase()).length;
      const cntB=jobs.filter(j=>(j.charterer||"")===b&&j.status===clientSort.toUpperCase()).length;
      return cntB-cntA;
    });
  },[jobs,filteredJobs,clients,clientFilter,clientSort,jobSearch,statusFilter]);

  const inpS=useMemo(()=>({background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"4px 7px",outline:"none",boxSizing:"border-box"}),[]);
  const fb2=useCallback((on,col)=>({fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(on?col||C.blue:C.bd),background:on?(col||C.blue)+"22":"transparent",color:on?col||C.blue:C.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}),[]);

  const jobsRef=React.useRef(jobs);
  React.useEffect(()=>{jobsRef.current=jobs;},[jobs]);
  const saveTimer=React.useRef({});
  const updateJob=useCallback((id,changes)=>{
    setJobs(prev=>prev.map(j=>j.id===id?{...j,...changes}:j));
    clearTimeout(saveTimer.current[id]);
    saveTimer.current[id]=setTimeout(()=>{ const job=jobsRef.current.find(j=>j.id===id); if(job)saveFixingJob({...job,...changes}); },800);
  },[]);

  // Each field resizes INDEPENDENTLY — no sync between cargo/notes/indications
  function updateJobHeight(jobId, field, height){
    const job=jobsRef.current.find(j=>j.id===jobId); if(!job)return;
    updateJob(jobId,{ui_heights:{...(job.ui_heights||{}),[field]:height}});
  }

  async function createJob(charterer=""){
    const id="job_"+Date.now()+"_"+Math.random().toString(36).slice(2,5);
    const today=new Date();
    const formattedDate=`${today.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]} ${today.getFullYear()}`;
    const job={id,charterer,status:"OPEN",laycan:"",laytime:"",notes:"",indications:"",cargo_details:"",subs_fixed:"",owners:[],added_date:formattedDate,segment:"",trade:"",ui_heights:{cargo_details:150,notes:150,indications:150,subs_fixed:100},created_at:new Date().toISOString()};
    await saveFixingJob(job); setJobs(prev=>[job,...prev]); setExpandedJob(id);
  }

  async function deleteClientAndJobs(client){
    // Delete all jobs for this client
    const clientJobs=jobs.filter(j=>j.charterer===client.name);
    for(const job of clientJobs){ await deleteFixingJob(job.id); }
    setJobs(prev=>prev.filter(j=>j.charterer!==client.name));
    // Delete the client
    await deleteClient(client.id);
    setClients(prev=>prev.filter(c=>c.id!==client.id));
    if(clientFilter===client.name)setClientFilter("ALL");
    setPendingDelClient(null);
  }

  async function removeJob(id){ setJobs(prev=>prev.filter(j=>j.id!==id)); await deleteFixingJob(id); }

  async function createClient(){
    const id="cl_"+Date.now()+"_"+Math.random().toString(36).slice(2,5);
    const client={...newClient,id,last_updated:new Date().toISOString()};
    await saveClient(client); setClients(prev=>[...prev,client]); setNewClient({id:"",name:"",coverage:"",notes:""}); setShowNewClient(false);
  }
  async function updateClient(id,changes){
    setClients(prev=>prev.map(c=>c.id===id?{...c,...changes}:c));
    const client=clients.find(c=>c.id===id); if(client)await saveClient({...client,...changes});
  }
  async function renameClient(id, newName){
    if(!newName.trim())return;
    // Also update all jobs with old name
    const client=clients.find(c=>c.id===id);
    if(!client)return;
    const oldName=client.name;
    setClients(prev=>prev.map(c=>c.id===id?{...c,name:newName.trim()}:c));
    await saveClient({...client,name:newName.trim()});
    // Update job charterer references
    const affected=jobs.filter(j=>j.charterer===oldName);
    for(const job of affected){
      const updated={...job,charterer:newName.trim()};
      setJobs(prev=>prev.map(j=>j.id===job.id?updated:j));
      await saveFixingJob(updated);
    }
    if(clientFilter===oldName) setClientFilter(newName.trim());
    setEditingClientName(null);
  }

  function jobDateToISO(s){ if(!s)return""; const m=String(s).match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/); if(!m)return""; const mons={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"}; const dd=String(parseInt(m[1],10)).padStart(2,"0"); const mm=mons[m[2]]||""; const yyyy=m[3]; return mm?`${yyyy}-${mm}-${dd}`:""; }
  function isoToJobDate(s){ if(!s)return""; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m)return s; const mons=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${parseInt(m[3],10)} ${mons[parseInt(m[2],10)-1]} ${m[1]}`; }


  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:"column"}}>
      {pendingDelClient&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"14px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.6)",fontFamily:"sans-serif",fontSize:12,minWidth:340}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong style={{color:"#ff6b6b"}}>{pendingDelClient.name}</strong> and all {jobs.filter(j=>j.charterer===pendingDelClient.name).length} cargo(es)?</span>
          <button onClick={()=>deleteClientAndJobs(pendingDelClient)} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete all</button>
          <button onClick={()=>setPendingDelClient(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}
      {pendingDelJob&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong>{pendingDelJob.label}</strong>?</span>
          <button onClick={()=>{removeJob(pendingDelJob.id);setPendingDelJob(null);}} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDelJob(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      {/* ── MAIN LAYOUT ── */}
      <div style={{display:"flex",gap:12,alignItems:"flex-start",width:"100%"}}>
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8}}>

          {/* Toolbar row */}
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {/* Matrix / List toggle */}
            <div style={{display:"flex",gap:0,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,overflow:"hidden",padding:2,flexShrink:0}}>
              <button onClick={()=>setClientViewMode("matrix")}
                style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:3,border:"none",background:clientViewMode==="matrix"?"rgba(88,166,255,.25)":"transparent",color:clientViewMode==="matrix"?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
                ⊞ Matrix
              </button>
              <button onClick={()=>setClientViewMode("list")}
                style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:3,border:"none",background:clientViewMode==="list"?"rgba(88,166,255,.25)":"transparent",color:clientViewMode==="list"?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
                ☰ List
              </button>
            </div>
            {/* + Client */}
            <button onClick={()=>setShowNewClient(s=>!s)}
              style={{fontSize:10,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.blue,padding:"3px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Client</button>
            {showNewClient&&(
              <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:C.bg2,border:"1px solid "+C.blue+"44",borderRadius:8,padding:16,zIndex:9999,minWidth:260}}>
                <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8}}>New Client</div>
                <input value={newClient.name} onChange={e=>setNewClient(p=>({...p,name:e.target.value}))} placeholder="Name"
                  onKeyDown={e=>e.key==="Enter"&&createClient()}
                  style={{...inpS,width:"100%",marginBottom:6}}/>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={createClient} style={{flex:1,background:"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px",cursor:"pointer"}}>Save</button>
                  <button onClick={()=>setShowNewClient(false)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,fontFamily:"inherit",fontSize:12,padding:"5px 10px",cursor:"pointer"}}>✕</button>
                </div>
              </div>
            )}
            {/* Status filter */}
            <div style={{display:"flex",gap:3}}>
              {["ALL",...JOB_STATUS].map(s=>(
                <button key={s} onClick={()=>setStatusFilter(s)} style={fb2(statusFilter===s,JOB_STATUS_COL[s])}>{s}</button>
              ))}
            </div>
            {clientFilter!=="ALL"&&<button onClick={()=>setClientFilter("ALL")} style={{fontSize:10,background:"rgba(88,166,255,.1)",border:"1px solid rgba(88,166,255,.3)",borderRadius:4,color:C.blue,padding:"2px 7px",cursor:"pointer",fontFamily:"inherit"}}>🔍 {clientFilter} ✕</button>}
            <span style={{marginLeft:"auto",fontSize:11,color:C.faint}}>{filteredJobs.length} job{filteredJobs.length!==1?"s":""}</span>
          </div>

          {/* Search */}
          <div style={{position:"relative",maxWidth:300}}>
            <input value={jobSearch} onChange={e=>setJobSearch(e.target.value)} placeholder="Search jobs…" style={{...inpS,width:"100%",padding:"5px 28px 5px 10px"}}/>
            {jobSearch&&<button onClick={()=>setJobSearch("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:11}}>✕</button>}
          </div>

          {/* ── MATRIX VIEW: full-width, notes as popout ── */}
          {clientViewMode==="matrix"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:6,marginBottom:2,width:"100%",position:"relative"}}>
              {/* Notes popout overlay */}
              {notePopout&&(()=>{
                const charterer=notePopout;
                const client=clients.find(c=>c.name===charterer);
                if(!client)return null;
                return(
                  <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:800}} onClick={()=>setNotePopout(null)}>
                    <div onClick={e=>e.stopPropagation()} style={{
                      position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
                      background:C.bg2,border:"1px solid rgba(88,166,255,0.35)",borderRadius:10,
                      padding:16,zIndex:801,width:360,boxShadow:"0 12px 40px rgba(0,0,0,0.7)"
                    }}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.blue}}>{charterer} — Notes</span>
                        <button onClick={()=>setNotePopout(null)} style={{background:"none",border:"none",color:C.faint,fontSize:14,cursor:"pointer",padding:0}}>✕</button>
                      </div>
                      <textarea value={client.notes||""} onChange={e=>updateClient(client.id,{notes:e.target.value})}
                        placeholder="Client notes…" autoFocus
                        style={{...inpS,width:"100%",minHeight:160,resize:"vertical",fontSize:12,boxSizing:"border-box",lineHeight:1.6}}/>
                    </div>
                  </div>
                );
              })()}
              {charterersList.map(charterer=>(
                <ClientCard key={charterer}
                  charterer={charterer} jobs={jobs}
                  expandedJob={expandedJob} setExpandedJob={setExpandedJob}
                  clients={clients} editingClientName={editingClientName}
                  setEditingClientName={setEditingClientName} renameClient={renameClient}
                  setPendingDelClient={setPendingDelClient} createJob={createJob}
                  inpS={inpS} JOB_STATUS_COL={JOB_STATUS_COL}/>
              ))}
            </div>
          )}

          {/* ── LIST VIEW: sortable headers, matched positions/cargoes style ── */}
          {clientViewMode==="list"&&(
            <div style={{border:"1px solid rgba(58,130,246,0.18)",borderRadius:7,overflow:"hidden",marginBottom:2,background:"rgba(7,15,28,0.96)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"rgba(14,22,40,0.98)"}}>
                    {[["Charterer","name"],["Open","open"],["Working","working"],["Subs","subs"],["Fixed","fixed"],["Failed","failed"],["",""]].map(([h,sk])=>(
                      <th key={h} onClick={sk?()=>setClientSort(sk):undefined}
                        style={{padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,
                          color:clientSort===sk?"rgba(200,220,255,0.9)":"rgba(120,160,220,0.55)",
                          textTransform:"uppercase",letterSpacing:"0.07em",
                          borderBottom:"1px solid rgba(58,130,246,0.14)",
                          cursor:sk?"pointer":"default",userSelect:"none",whiteSpace:"nowrap"}}>
                        {h}{sk&&clientSort===sk?" ▲":""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {charterersList.map((charterer,ri)=>{
                    const allCJobs=jobs.filter(j=>(j.charterer||"")===charterer);
                    const counts=JOB_STATUS.reduce((a,s)=>{a[s]=allCJobs.filter(j=>j.status===s).length;return a;},{});
                    const glowCol=counts.SUBS?C.purple:counts.OPEN||counts.WORKING?C.amber:null;
                    const isActive=clientFilter===charterer;
                    const isJobOpen=expandedJob===charterer;
                    const client=clients.find(c=>c.name===charterer);
                    const isEditingName=editingClientName===client?.id;
                    const rowBg=isActive?"rgba(88,166,255,.10)":ri%2===0?"transparent":"rgba(255,255,255,0.025)";
                    return(
                      <React.Fragment key={charterer}>
                        <tr onClick={()=>setClientFilter(f=>f===charterer?"ALL":charterer)}
                          style={{background:rowBg,cursor:"pointer",
                            borderLeft:glowCol&&!isActive?"3px solid "+glowCol+"99":"3px solid transparent",
                            transition:"background 0.1s"}}>
                          <td style={{padding:"8px 12px",fontWeight:600,color:isActive?"#79c0ff":"rgba(200,220,255,0.8)",borderBottom:"1px solid rgba(58,130,246,0.07)"}}>
                            {isEditingName&&client?(
                              <input autoFocus defaultValue={client.name}
                                onBlur={e=>renameClient(client.id,e.target.value)}
                                onKeyDown={e=>{if(e.key==="Enter")renameClient(client.id,e.target.value);if(e.key==="Escape")setEditingClientName(null);}}
                                onClick={e=>e.stopPropagation()}
                                style={{...inpS,fontSize:12,fontWeight:700,padding:"2px 6px"}}/>
                            ):(
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                {glowCol&&<span style={{width:6,height:6,borderRadius:"50%",background:glowCol,flexShrink:0,display:"inline-block"}}/>}
                                <span style={{flex:1}}>{charterer||"—"}</span>
                                {client&&<button onClick={e=>{e.stopPropagation();setEditingClientName(client.id);}}
                                  style={{background:"none",border:"none",color:"rgba(120,160,220,0.25)",fontSize:10,cursor:"pointer",padding:0}} title="Rename">✎</button>}
                                {client&&<button onClick={e=>{e.stopPropagation();setPendingDelClient(client);}}
                                  style={{background:"none",border:"none",color:"rgba(255,107,107,0.25)",fontSize:10,cursor:"pointer",padding:0}} title="Delete client">✕</button>}
                              </div>
                            )}
                          </td>
                          {["OPEN","WORKING","SUBS","FIXED","FAILED"].map(s=>(
                            <td key={s} style={{padding:"8px 12px",textAlign:"center",color:counts[s]>0?JOB_STATUS_COL[s]:"rgba(100,130,180,0.18)",fontWeight:counts[s]>0?700:400,borderBottom:"1px solid rgba(58,130,246,0.07)"}}>
                              {counts[s]>0?counts[s]:"—"}
                            </td>
                          ))}
                          <td style={{padding:"8px 10px",borderBottom:"1px solid rgba(58,130,246,0.07)",whiteSpace:"nowrap"}}>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <button onClick={e=>{e.stopPropagation();setExpandedJob(isJobOpen?null:charterer);}}
                                style={{background:"none",border:"none",color:isJobOpen?"#58a6ff":"rgba(120,160,220,0.4)",fontSize:10,cursor:"pointer",padding:0,fontFamily:"inherit",fontWeight:600}}>
                                {isJobOpen?"▲":"▼"} cargo
                              </button>
                              <button onClick={e=>{e.stopPropagation();createJob(charterer);setExpandedJob(charterer);}}
                                style={{background:"none",border:"none",color:"rgba(88,166,255,0.45)",fontSize:10,cursor:"pointer",padding:0,fontFamily:"inherit",fontWeight:600}}>
                                + cargo
                              </button>
                              {client&&<button onClick={e=>{e.stopPropagation();setNotePopout(charterer);}}
                                style={{background:"none",border:"none",color:"rgba(120,160,220,0.3)",fontSize:10,cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                                ✎
                              </button>}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── JOB DETAIL: only shown when a charterer is expanded ── */}
          {filteredJobs.length===0&&!charterersList.some(c=>expandedJob===c)&&(
            <div style={{color:C.faint,fontSize:12,padding:"32px",textAlign:"center"}}>No fixing jobs.</div>
          )}
          {charterersList.map(charterer=>{
            const chartererJobs=filteredJobs.filter(j=>(j.charterer||"")===charterer);
            if(!chartererJobs.length||expandedJob!==charterer)return null;
            return(
              <div key={charterer} style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(16,26,48,0.8)",borderBottom:"1px solid "+C.bd2}}>
                  {/* + cargo button top-left */}
                  <button onClick={e=>{e.stopPropagation();createJob(charterer);}}
                    style={{background:"rgba(88,166,255,0.15)",border:"1px solid rgba(88,166,255,0.3)",borderRadius:4,color:"#79c0ff",fontSize:12,padding:"2px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700,flexShrink:0}}>+ cargo</button>
                  <span style={{fontWeight:700,fontSize:13,color:C.blue,flex:1}}>{charterer||"—"}</span>
                  <span style={{fontSize:11,color:C.faint}}>{chartererJobs.length} cargo{chartererJobs.length!==1?"es":""}</span>
                  <button onClick={()=>setExpandedJob(null)}
                    style={{background:"none",border:"none",color:C.faint,fontSize:10,cursor:"pointer",padding:0,fontFamily:"inherit",fontWeight:600}}>▲ close</button>
                </div>
                <div style={{display:"flex",gap:0,alignItems:"flex-start"}}>
                  {/* Cargoes */}
                  <div style={{flex:1,minWidth:0}}>
                    {chartererJobs.map(job=>{
                  const summary=[job.qty,job.product,job.load&&job.disch?`${job.load} → ${job.disch}`:job.load||job.disch,job.laycan].filter(Boolean).join("  ");
                  // For cargo_details: strip HTML then join lines with " | "
                  const rawText=stripHtml(job.cargo_details||"").trim();
                  const cargoTitle=rawText.split(/\n+/).map(s=>s.trim()).filter(Boolean).join(" | ");
                  const titleText=summary||cargoTitle||"New cargo";
                  return(
                    <div key={job.id} style={{borderTop:"1px solid "+C.bd2,padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <input type="date" value={jobDateToISO(job.added_date)} onChange={e=>updateJob(job.id,{added_date:isoToJobDate(e.target.value)})}
                          style={{...inpS,minWidth:128,width:128,padding:"3px 8px",fontSize:12,color:C.faint}}/>
                        <span style={{fontSize:12,color:C.tx,flex:1,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{titleText}</span>
                        <button onClick={e=>{e.stopPropagation();setPendingDelJob({id:job.id,label:titleText||job.charterer||"job"});}}
                          style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.4,padding:"0 2px"}}>✕</button>
                      </div>
                      {/* 3 editors — sync height when any one resizes */}
                      {(()=>{
                        const syncH=Math.max(
                          job.ui_heights?.cargo_details||150,
                          job.ui_heights?.notes||150,
                          job.ui_heights?.indications||150
                        );
                        function onResizeSync(h){
                          const newH=Math.max(h,80);
                          updateJobHeight(job.id,"cargo_details",newH);
                          updateJobHeight(job.id,"notes",newH);
                          updateJobHeight(job.id,"indications",newH);
                        }
                        return(
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        <div style={{display:"flex",gap:8}}>
                          <div style={{flex:"0 0 18%",minWidth:120}}>
                            <RichEditor jobId={job.id} field="cargo_details" title="Cargo"
                              value={job.cargo_details||""} placeholder="Cargo details…"
                              height={syncH}
                              onChange={val=>updateJob(job.id,{cargo_details:val})}
                              onResizeSave={onResizeSync}/>
                          </div>
                          <div style={{flex:"0 0 28%",minWidth:0}}>
                            <RichEditor jobId={job.id} field="notes" title="Notes & Guidance"
                              value={job.notes||""} placeholder="Notes & guidance…"
                              height={syncH}
                              onChange={val=>updateJob(job.id,{notes:val})}
                              onResizeSave={onResizeSync}/>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <RichEditor jobId={job.id} field="indications" title="Indications"
                              titleRight={
                                <>
                                  <select tabIndex={-1} value={job.segment||""} onChange={e=>updateJob(job.id,{segment:e.target.value})}
                                    style={{...inpS,padding:"1px 6px",fontSize:10,height:22,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,appearance:"none"}}>
                                    <option value="">Seg...</option>
                                    {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <select tabIndex={-1} value={job.trade||""} onChange={e=>updateJob(job.id,{trade:e.target.value})}
                                    style={{...inpS,padding:"1px 6px",fontSize:10,height:22,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,appearance:"none"}}>
                                    <option value="">Trade...</option>
                                    {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <button tabIndex={-1}
                                    onClick={()=>{
                                      const matches=owners.filter(o=>{
                                        const segs=o.segments||(o.segment?[o.segment]:[]);
                                        const trs=o.trades||(o.trade?[o.trade]:[]);
                                        return(job.segment?segs.includes(job.segment):true)&&(job.trade?trs.includes(job.trade):true);
                                      });
                                      if(!matches.length)return;
                                      const lines=matches.map(o=>`${o.company} | `).join("\n");
                                      updateJob(job.id,{indications:(job.indications?job.indications+"\n":"")+lines});
                                    }}
                                    style={{fontSize:10,fontWeight:700,height:22,padding:"0 8px",background:"rgba(88,166,255,.15)",border:"1px solid "+C.blue+"44",borderRadius:4,color:C.blue,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                                    Import owners
                                  </button>
                                </>
                              }
                              value={job.indications||""} placeholder="Indications…"
                              height={syncH}
                              onChange={val=>updateJob(job.id,{indications:val})}
                              onResizeSave={onResizeSync}/>
                          </div>
                        </div>
                        {/* Subs/Fixed + status counts on right */}
                        <div style={{borderTop:"1px solid "+C.bd2,paddingTop:8}}>
                          <RichEditor jobId={job.id} field="subs_fixed"
                            title={job.status==="FIXED"?"✓ Fixed":job.status==="SUBS"?"On Subs":"Subs / Fixed"}
                            titleRight={
                              <div style={{display:"flex",alignItems:"center",gap:3}}>
                                {JOB_STATUS.map(s=>(
                                  <button key={s} onClick={()=>updateJob(job.id,{status:s})}
                                    style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:3,border:"1px solid "+(job.status===s?JOB_STATUS_COL[s]:C.bd),background:job.status===s?JOB_STATUS_COL[s]+"33":"transparent",color:job.status===s?JOB_STATUS_COL[s]:C.faint,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>
                                ))}
                              </div>
                            }
                            value={job.subs_fixed||""} placeholder="Subs / fixed…"
                            height={job.ui_heights?.subs_fixed||100}
                            onChange={val=>updateJob(job.id,{subs_fixed:val})}
                            onResizeSave={h=>updateJobHeight(job.id,"subs_fixed",h)}/>
                        </div>
                      </div>
                        );
                      })()}
                    </div>
                  );
                })}
                  </div>
                  {/* Client notes sidebar */}
                  {(()=>{
                    const client=clients.find(c=>c.name===charterer);
                    if(!client)return null;
                    return(
                      <div style={{width:220,flexShrink:0,borderLeft:"1px solid "+C.bd2,display:"flex",flexDirection:"column"}}>
                        <div style={{padding:"6px 10px",background:"rgba(16,26,48,0.7)",borderBottom:"1px solid "+C.bd2,fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Client notes</div>
                        <textarea value={client.notes||""} onChange={e=>{
                          updateClient(client.id,{notes:e.target.value});
                          // Auto-resize
                          e.target.style.height="auto";
                          e.target.style.height=Math.max(120,e.target.scrollHeight)+"px";
                        }}
                          onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.max(120,e.target.scrollHeight)+"px";}}
                          ref={el=>{if(el){el.style.height="auto";el.style.height=Math.max(120,el.scrollHeight)+"px";}}}
                          placeholder="Notes about this client…"
                          style={{...inpS,resize:"none",overflow:"hidden",fontSize:11,background:"rgba(8,16,32,0.5)",border:"none",borderRadius:0,lineHeight:1.6,padding:"8px 10px",minHeight:120,color:C.tx}}/>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Owner Directory — wider */}
        <div style={{flex:"0 0 460px",width:460,display:"flex",flexDirection:"column",gap:6}}>
          {pendingDelOwner&&(
            <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12,minWidth:280}}>
              <span style={{color:C.tx,flex:1}}>Remove <strong>{owners.find(o=>o.id===pendingDelOwner)?.company||"entry"}</strong>?</span>
              <button onClick={confirmRemoveOwnerEntry} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Remove</button>
              <button onClick={()=>setPendingDelOwner(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Owner Directory</span>
            <button onClick={()=>setShowOwnerDir(s=>!s)} style={{fontSize:11,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.blue,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{showOwnerDir?"▲":"▼"}</button>
          </div>
          {showOwnerDir&&(
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <style>{`
                .own-sel{background:${C.bg2};color:${C.tx};border:1px solid ${C.bd};border-radius:4px;font-family:inherit;font-size:11px;outline:none;padding:2px 3px;}
                .own-sel option{background:${C.bg2};color:${C.tx};}
              `}</style>
              <input value={ownerDirSearch||""} onChange={e=>setOwnerDirSearch(e.target.value)} placeholder="Search owners…" style={{...inpS,width:"100%",padding:"3px 7px",fontSize:11}}/>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {SEGMENTS.map(s=>(
                  <button key={s} onClick={()=>setOwnerSegFilter(f=>f===s?null:s)}
                    style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,border:"1px solid "+(ownerSegFilter===s?C.blue:C.bd),background:ownerSegFilter===s?"rgba(88,166,255,.2)":"transparent",color:ownerSegFilter===s?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {TRADES.map(t=>(
                  <button key={t} onClick={()=>setOwnerTradeFilter(f=>f===t?null:t)}
                    style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,border:"1px solid "+(ownerTradeFilter===t?C.amber:C.bd),background:ownerTradeFilter===t?"rgba(255,209,102,.2)":"transparent",color:ownerTradeFilter===t?C.amber:C.faint,cursor:"pointer",fontFamily:"inherit"}}>{t}</button>
                ))}
              </div>
              {/* Add row — with multi-select */}
              <div style={{display:"grid",gridTemplateColumns:"130px 56px 1fr 1fr auto",gap:3,alignItems:"center"}}>
                <input value={newOwnerEntry.company} onChange={e=>setNewOwnerEntry(p=>({...p,company:e.target.value}))} placeholder="Company" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
                <input value={newOwnerEntry.pic} onChange={e=>setNewOwnerEntry(p=>({...p,pic:e.target.value}))} placeholder="PIC" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
                <MultiSelectDropdown options={SEGMENTS} selected={newOwnerEntry.segments||[]} onChange={v=>setNewOwnerEntry(p=>({...p,segments:v}))} placeholder="Seg…" color="rgba(88,166,255,0.8)"/>
                <MultiSelectDropdown options={TRADES} selected={newOwnerEntry.trades||[]} onChange={v=>setNewOwnerEntry(p=>({...p,trades:v}))} placeholder="Trade…" color="rgba(250,163,86,0.75)"/>
                <button onClick={addOwnerEntry} style={{background:"rgba(88,166,255,.18)",border:"1px solid rgba(88,166,255,.4)",borderRadius:4,color:C.blue,fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"3px 7px",cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
              </div>
              {(()=>{
                const filtered=owners.filter(o=>{
                  const segs=o.segments||(o.segment?[o.segment]:[]);
                  const trs=o.trades||(o.trade?[o.trade]:[]);
                  if(ownerSegFilter&&!segs.includes(ownerSegFilter))return false;
                  if(ownerTradeFilter&&!trs.includes(ownerTradeFilter))return false;
                  if(ownerDirSearch){const t=ownerDirSearch.toLowerCase();if(![o.company,o.pic,...segs,...trs,o.comment].filter(Boolean).join(" ").toLowerCase().includes(t))return false;}
                  return true;
                }).sort((a,b)=>(a.company||"").localeCompare(b.company||""));
                if(!filtered.length)return <div style={{fontSize:11,color:C.faint,fontStyle:"italic"}}>No entries.</div>;
                return(
                  <div style={{border:"1px solid rgba(58,130,246,0.18)",borderRadius:6,overflow:"hidden",background:"rgba(7,15,28,0.96)"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,tableLayout:"fixed"}}>
                      <thead>
                        <tr style={{background:"rgba(20,30,50,0.92)"}}>
                          <th style={{padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.14)",width:"28%"}}>Company</th>
                          <th style={{padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.14)",width:"12%"}}>PIC</th>
                          <th style={{padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.14)",width:"25%"}}>Seg</th>
                          <th style={{padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.14)",width:"25%"}}>Trade</th>
                          <th style={{padding:"4px 4px",borderBottom:"1px solid rgba(58,130,246,0.14)",width:"10%"}}/>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((o,ri)=>{
                          const segs=o.segments||(o.segment?[o.segment]:[]);
                          const trs=o.trades||(o.trade?[o.trade]:[]);
                          return(
                            <tr key={o.id} style={{background:ri%2===0?"transparent":"rgba(255,255,255,0.02)"}}>
                              <td style={{padding:"2px 4px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                                <div style={{display:"flex",alignItems:"center",gap:2}}>
                                  <OwnerNoteButton ownerId={o.id} note={o.comment||""} onSave={v=>updateOwnerEntry(o.id,"comment",v)}/>
                                  <input value={o.company||""} onChange={e=>updateOwnerEntry(o.id,"company",e.target.value)}
                                    style={{background:"transparent",border:"none",outline:"none",color:"#79c0ff",fontFamily:"inherit",fontSize:11,width:"100%",minWidth:40}}/>
                                </div>
                              </td>
                              <td style={{padding:"2px 4px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                                <input value={o.pic||""} onChange={e=>updateOwnerEntry(o.id,"pic",e.target.value)}
                                  style={{background:"transparent",border:"none",outline:"none",color:"#43e97b",fontFamily:"inherit",fontSize:11,width:"100%"}}/>
                              </td>
                              <td style={{padding:"1px 3px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                                <MultiSelectDropdown options={SEGMENTS} selected={segs} onChange={v=>updateOwnerEntry(o.id,"segments",v)} placeholder="—" color="rgba(88,166,255,0.8)"/>
                              </td>
                              <td style={{padding:"1px 3px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                                <MultiSelectDropdown options={TRADES} selected={trs} onChange={v=>updateOwnerEntry(o.id,"trades",v)} placeholder="—" color="rgba(250,163,86,0.75)"/>
                              </td>
                              <td style={{padding:"2px 4px",borderBottom:"1px solid rgba(255,255,255,0.035)",textAlign:"center"}}>
                                <button onClick={()=>removeOwnerEntry(o.id)} style={{background:"none",border:"none",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontSize:11,padding:0}}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FixingTab;
