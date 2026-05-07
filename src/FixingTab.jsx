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

// RichEditor — each instance resizes INDEPENDENTLY; auto-expand button fits content
function RichEditor({ jobId, field, title, titleRight, value, onChange, onResizeSave, height=120, placeholder="", color=C.tx }){
  const editorRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const collapsedH = 36; // just the header

  React.useEffect(()=>{
    const el = editorRef.current;
    if (!el || document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  function exec(cmd){ editorRef.current?.focus(); document.execCommand(cmd,false,null); onChange(editorRef.current?.innerHTML||""); }
  function handleInput(){ onChange(editorRef.current?.innerHTML||""); }
  function handleKeyDown(e){
    if(e.key==="Tab"){ e.preventDefault(); cycleJobField(jobId,field,e.shiftKey); }
  }

  // Toggle: if currently showing normal height, expand to fit content; if expanded, collapse to saved height
  function toggleExpand(){
    const el = editorRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    if (isExpanded) {
      // Collapse back to saved height
      wrap.style.height = height + "px";
      setIsExpanded(false);
    } else {
      // Expand to fit all content
      const newH = Math.max(80, el.scrollHeight + 40);
      wrap.style.height = newH + "px";
      onResizeSave?.(newH);
      setIsExpanded(true);
    }
  }

  // Save height on manual resize (drag)
  React.useEffect(()=>{
    const el = wrapRef.current;
    if (!el || !window.ResizeObserver) return;
    let t = null;
    const ro = new ResizeObserver(()=>{
      clearTimeout(t);
      t = setTimeout(()=>{ const h = el.offsetHeight; if(h) onResizeSave?.(Math.round(h)); }, 200);
    });
    ro.observe(el);
    return ()=>{ clearTimeout(t); ro.disconnect(); };
  }, [jobId, field, onResizeSave]);

  const btnSt = {fontSize:10,padding:"1px 6px",borderRadius:3,border:"1px solid "+C.bd,background:C.bg3,color:C.faint,cursor:"pointer",lineHeight:1.4,fontFamily:"inherit"};
  return (
    <div ref={wrapRef} style={{
      background:C.bg3, border:"1px solid "+C.bd, borderRadius:6,
      minHeight:height, height:height, resize:"vertical", overflow:"auto",
      boxSizing:"border-box"
    }}>
      <style>{`
        [data-richwrap="${jobId}-${field}"]::-webkit-resizer{background:transparent;border-bottom:2px solid rgba(120,160,220,0.3);border-right:2px solid rgba(120,160,220,0.3);}
        [data-job-field="${jobId}-${field}"]:empty:before{content:attr(data-placeholder);color:${C.faint};pointer-events:none;}
        [data-job-field="${jobId}-${field}"] ul{margin:0;padding-left:16px;}
        [data-job-field="${jobId}-${field}"] ol{margin:0;padding-left:16px;list-style-type:decimal;}
        [data-job-field="${jobId}-${field}"] ol ol{list-style-type:lower-alpha;}
        [data-job-field="${jobId}-${field}"] li{margin:0;padding:0;}
        [data-job-field="${jobId}-${field}"] p{margin:0;}
      `}</style>
      <div data-richwrap={`${jobId}-${field}`} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"4px 6px", borderBottom:"1px solid "+C.bd2,
        background:C.bg4, position:"sticky", top:0, zIndex:1
      }}>
        <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:700}}>{title}</span>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          {titleRight}
          {/* Toggle expand/collapse */}
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={toggleExpand}
            title={isExpanded?"Collapse":"Expand to fit"}
            style={{...btnSt,color:isExpanded?C.blue:C.faint}}>
            {isExpanded?"↑":"↕"}
          </button>
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>exec("insertUnorderedList")}
            title="Bullet list" style={btnSt}>•</button>
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>exec("insertOrderedList")}
            title="Numbered list" style={btnSt}>1.</button>
        </div>
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        data-job-field={`${jobId}-${field}`}
        onInput={handleInput} onKeyDown={handleKeyDown}
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
  const [newOwnerEntry,setNewOwnerEntry]=useState({id:"",company:"",segment:"",pic:"",trade:"",comment:""});
  const [jobSearch,setJobSearch]=useState("");
  const [pendingDelJob,setPendingDelJob]=useState(null);
  const [pendingDelOwner,setPendingDelOwner]=useState(null);
  const [ownerDirSearch,setOwnerDirSearch]=useState("");
  const [ownerSegFilter,setOwnerSegFilter]=useState(null);
  const [ownerTradeFilter,setOwnerTradeFilter]=useState(null);
  const [clientViewMode,setClientViewMode]=useState("matrix"); // "matrix" | "list"

  useEffect(()=>{
    loadFixingJobs().then(setJobs);
    loadClients().then(setClients);
    supabase.from("dashboard").select("value").eq("key","owner-directory").single()
      .then(({data})=>{if(data)try{setOwners(JSON.parse(data.value));}catch(_){}});
  },[]);

  async function saveOwnerDir(dir){ setOwners(dir); await supabase.from("dashboard").upsert({key:"owner-directory",value:JSON.stringify(dir)},{onConflict:"key"}); }
  function addOwnerEntry(){ const id="od_"+Date.now()+"_"+Math.random().toString(36).slice(2,5); saveOwnerDir([...owners,{...newOwnerEntry,id}]); setNewOwnerEntry({id:"",company:"",segment:"",pic:"",trade:"",comment:""}); }
  function updateOwnerEntry(id,field,val){ saveOwnerDir(owners.map(o=>o.id===id?{...o,[field]:val}:o)); }
  function removeOwnerEntry(id){ setPendingDelOwner(id); }
  function confirmRemoveOwnerEntry(){ if(!pendingDelOwner)return; saveOwnerDir(owners.filter(o=>o.id!==pendingDelOwner)); setPendingDelOwner(null); }

  const filteredJobs=useMemo(()=>jobs.filter(j=>{
    if(statusFilter!=="ALL"&&j.status!==statusFilter)return false;
    if(clientFilter!=="ALL"&&j.charterer!==clientFilter)return false;
    if(jobSearch.trim()){const t=jobSearch.trim().toLowerCase();const hay=[j.charterer,j.product,j.qty,j.load,j.disch,j.laycan,j.outcome,j.fixed_owner,j.fixed_vessel].filter(Boolean).join(" ").toLowerCase();if(!hay.includes(t))return false;}
    return true;
  }),[jobs,statusFilter,clientFilter,jobSearch]);

  const charterersList=useMemo(()=>clientFilter==="ALL"?[...new Set(jobs.map(j=>j.charterer||""))]:[ clientFilter],[jobs,clientFilter]);

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

  function jobDateToISO(s){ if(!s)return""; const m=String(s).match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/); if(!m)return""; const mons={Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12"}; const dd=String(parseInt(m[1],10)).padStart(2,"0"); const mm=mons[m[2]]||""; const yyyy=m[3]; return mm?`${yyyy}-${mm}-${dd}`:""; }
  function isoToJobDate(s){ if(!s)return""; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m)return s; const mons=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${parseInt(m[3],10)} ${mons[parseInt(m[2],10)-1]} ${m[1]}`; }

  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:"column"}}>
      {pendingDelJob&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong>{pendingDelJob.label}</strong>?</span>
          <button onClick={()=>{removeJob(pendingDelJob.id);setPendingDelJob(null);}} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDelJob(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      {/* Client matrix/list view */}
      <div style={{width:"100%",marginBottom:8}}>
        {/* View toggle + Add client */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Charterers</span>
          <div style={{display:"flex",gap:2,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,overflow:"hidden",padding:2}}>
            <button onClick={()=>setClientViewMode("matrix")}
              style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:3,border:"none",background:clientViewMode==="matrix"?"rgba(88,166,255,.25)":"transparent",color:clientViewMode==="matrix"?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
              ⊞ Matrix
            </button>
            <button onClick={()=>setClientViewMode("list")}
              style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:3,border:"none",background:clientViewMode==="list"?"rgba(88,166,255,.25)":"transparent",color:clientViewMode==="list"?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
              ☰ List
            </button>
          </div>
          <button onClick={()=>setClientFilter("ALL")}
            style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(clientFilter==="ALL"?C.blue:C.bd),background:clientFilter==="ALL"?"rgba(88,166,255,.15)":"transparent",color:clientFilter==="ALL"?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>All</button>
          <button onClick={()=>setShowNewClient(s=>!s)}
            style={{fontSize:10,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.blue,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Client</button>
          {showNewClient&&(
            <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:C.bg2,border:"1px solid "+C.blue+"44",borderRadius:8,padding:16,zIndex:9999,minWidth:260}}>
              <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8}}>New Client</div>
              <input value={newClient.name} onChange={e=>setNewClient(p=>({...p,name:e.target.value}))} placeholder="Name" style={{...inpS,width:"100%",marginBottom:6}}/>
              <div style={{display:"flex",gap:6}}>
                <button onClick={createClient} style={{flex:1,background:"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px",cursor:"pointer"}}>Save</button>
                <button onClick={()=>setShowNewClient(false)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,fontFamily:"inherit",fontSize:12,padding:"5px 10px",cursor:"pointer"}}>✕</button>
              </div>
            </div>
          )}
        </div>

        {/* Matrix view */}
        {clientViewMode==="matrix"&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {clients.map(client=>{
              const isActive=clientFilter===client.name;
              const clientJobs=jobs.filter(j=>j.charterer===client.name);
              const total=clientJobs.length;
              // Status counts
              const counts=JOB_STATUS.reduce((a,s)=>{const n=clientJobs.filter(j=>j.status===s).length;if(n)a[s]=n;return a;},{});
              // Highlight: has OPEN or SUBS
              const hasActive=counts.OPEN||counts.WORKING||counts.SUBS;
              const glowCol=counts.SUBS?C.purple:counts.OPEN||counts.WORKING?C.amber:null;
              const isNoteExpanded=editingClient===client.id;
              return(
                <div key={client.id} style={{
                  display:"flex",flexDirection:"column",
                  background:isActive?"rgba(88,166,255,.10)":C.bg2,
                  border:"1px solid "+(isActive?C.blue:glowCol?glowCol+"55":C.bd),
                  borderRadius:8,overflow:"hidden",minWidth:130,maxWidth:160,
                  boxShadow:glowCol&&!isActive?"0 0 8px "+glowCol+"33":"none",
                  transition:"box-shadow 0.2s"
                }}>
                  <div style={{padding:"8px 10px",cursor:"pointer"}} onClick={()=>setClientFilter(f=>f===client.name?"ALL":client.name)}>
                    <div style={{fontSize:12,fontWeight:700,color:isActive?C.blue:C.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:4}}>{client.name}</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {total===0&&<span style={{fontSize:10,color:C.faint}}>—</span>}
                      {Object.entries(counts).map(([s,n])=>(
                        <span key={s} style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:6,background:JOB_STATUS_COL[s]+"22",color:JOB_STATUS_COL[s]}}>{n} {s}</span>
                      ))}
                    </div>
                  </div>
                  {/* Note toggle */}
                  <div style={{display:"flex",borderTop:"1px solid "+C.bd2}}>
                    <button onClick={e=>{e.stopPropagation();setEditingClient(isNoteExpanded?null:client.id);}}
                      style={{flex:1,background:"none",border:"none",color:C.faint,fontSize:10,padding:"3px 0",cursor:"pointer",fontFamily:"inherit"}}>
                      {isNoteExpanded?"▲ notes":"▼ notes"}
                    </button>
                  </div>
                  {isNoteExpanded&&(
                    <div style={{padding:"5px 8px",borderTop:"1px solid "+C.bd2}} onClick={e=>e.stopPropagation()}>
                      <textarea value={client.notes||""} onChange={e=>updateClient(client.id,{notes:e.target.value})}
                        placeholder="Client notes…" style={{...inpS,width:"100%",minHeight:80,resize:"vertical",fontSize:11,boxSizing:"border-box"}}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* List view */}
        {clientViewMode==="list"&&(
          <div style={{border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:"rgba(20,30,50,0.92)"}}>
                  {["Charterer","Open","Working","Subs","Fixed","Failed",""].map(h=>(
                    <th key={h} style={{padding:"5px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:"1px solid rgba(58,130,246,0.14)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((client,ri)=>{
                  const isActive=clientFilter===client.name;
                  const clientJobs=jobs.filter(j=>j.charterer===client.name);
                  const counts=JOB_STATUS.reduce((a,s)=>{a[s]=clientJobs.filter(j=>j.status===s).length;return a;},{});
                  const glowCol=counts.SUBS?C.purple:counts.OPEN||counts.WORKING?C.amber:null;
                  return(
                    <tr key={client.id}
                      onClick={()=>setClientFilter(f=>f===client.name?"ALL":client.name)}
                      style={{background:isActive?"rgba(88,166,255,.08)":ri%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)",cursor:"pointer",outline:glowCol&&!isActive?"1px inset "+glowCol+"33":"none"}}>
                      <td style={{padding:"5px 10px",fontWeight:700,color:isActive?C.blue:C.tx,borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                        {client.name}
                        {glowCol&&<span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:glowCol,marginLeft:5,verticalAlign:"middle"}}/>}
                      </td>
                      {["OPEN","WORKING","SUBS","FIXED","FAILED"].map(s=>(
                        <td key={s} style={{padding:"5px 10px",textAlign:"center",color:counts[s]>0?JOB_STATUS_COL[s]:C.faint+"55",fontWeight:counts[s]>0?700:400,borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                          {counts[s]>0?counts[s]:"—"}
                        </td>
                      ))}
                      <td style={{padding:"5px 6px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                        <button onClick={e=>{e.stopPropagation();setEditingClient(editingClient===client.id?null:client.id);}}
                          style={{background:"none",border:"none",color:C.faint,fontSize:11,cursor:"pointer",padding:0}}>
                          {editingClient===client.id?"▲":"▼"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main: Jobs + Owner Directory */}
      <div style={{display:"flex",gap:12,alignItems:"flex-start",width:"100%"}}>
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:0,alignItems:"center",border:"1px solid "+C.blue,borderRadius:5,overflow:"hidden"}}>
              <select id="new_job_client_sel" defaultValue={clientFilter!=="ALL"?clientFilter:""}
                style={{background:C.bg3,border:"none",borderRight:"1px solid "+C.bd,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"4px 8px",outline:"none",cursor:"pointer",maxWidth:130}}>
                <option value="">Client…</option>
                {clients.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={()=>{const sel=document.getElementById("new_job_client_sel");const chosen=sel?.value||(clientFilter!=="ALL"?clientFilter:"");createJob(chosen);if(chosen)setClientFilter(chosen);}}
                style={{background:"rgba(88,166,255,.15)",border:"none",color:C.blue,fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"4px 12px",cursor:"pointer",whiteSpace:"nowrap"}}>+ New Cargo</button>
            </div>
            <div style={{display:"flex",gap:4}}>
              {["ALL",...JOB_STATUS].map(s=>(
                <button key={s} onClick={()=>setStatusFilter(s)} style={fb2(statusFilter===s,JOB_STATUS_COL[s])}>{s}</button>
              ))}
            </div>
            {clientFilter!=="ALL"&&<button onClick={()=>setClientFilter("ALL")} style={{fontSize:11,background:"rgba(88,166,255,.1)",border:"1px solid rgba(88,166,255,.3)",borderRadius:4,color:C.blue,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>🔍 {clientFilter} ✕</button>}
            <span style={{marginLeft:"auto",fontSize:11,color:C.faint}}>{filteredJobs.length} job{filteredJobs.length!==1?"s":""}</span>
          </div>
          <div style={{position:"relative",maxWidth:300}}>
            <input value={jobSearch} onChange={e=>setJobSearch(e.target.value)} placeholder="🔍 Search jobs…" style={{...inpS,width:"100%",padding:"5px 28px 5px 10px"}}/>
            {jobSearch&&<button onClick={()=>setJobSearch("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:11}}>✕</button>}
          </div>

          {filteredJobs.length===0&&<div style={{color:C.faint,fontSize:12,padding:"40px",textAlign:"center"}}>No fixing jobs.</div>}
          {charterersList.map(charterer=>{
            const chartererJobs=filteredJobs.filter(j=>clientFilter==="ALL"?(j.charterer||"")===charterer:(j.charterer||"")===clientFilter);
            if(!chartererJobs.length)return null;
            const isOpen=expandedJob===charterer;
            return(
              <div key={charterer} style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer",background:C.bg2}} onClick={()=>setExpandedJob(isOpen?null:charterer)}>
                  <span style={{fontWeight:700,fontSize:13,color:C.blue,flex:1}}>{charterer||"—"}</span>
                  <span style={{fontSize:11,color:C.faint}}>{chartererJobs.length} cargo{chartererJobs.length!==1?"es":""}</span>
                  <span style={{fontSize:11,color:C.faint}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&chartererJobs.map(job=>{
                  const summary=[job.qty,job.product,job.load&&job.disch?`${job.load} → ${job.disch}`:job.load||job.disch,job.laycan].filter(Boolean).join("  ");
                  const titleText=summary||stripHtml(job.cargo_details||"")||"New cargo";
                  return(
                    <div key={job.id} style={{borderTop:"1px solid "+C.bd2,padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <input type="date" value={jobDateToISO(job.added_date)} onChange={e=>updateJob(job.id,{added_date:isoToJobDate(e.target.value)})}
                          style={{...inpS,minWidth:128,width:128,padding:"3px 8px",fontSize:12,color:C.faint}}/>
                        <span style={{fontSize:12,color:C.tx,flex:1,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{titleText}</span>
                        <div style={{display:"flex",gap:3,flexShrink:0}}>
                          {JOB_STATUS.map(s=>(
                            <button key={s} onClick={()=>updateJob(job.id,{status:s})}
                              style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,border:"1px solid "+(job.status===s?JOB_STATUS_COL[s]:C.bd),background:job.status===s?JOB_STATUS_COL[s]+"33":"transparent",color:job.status===s?JOB_STATUS_COL[s]:C.faint,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>
                          ))}
                        </div>
                        <button onClick={e=>{e.stopPropagation();setPendingDelJob({id:job.id,label:titleText||job.charterer||"job"});}}
                          style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.4,padding:"0 2px"}}>✕</button>
                      </div>

                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        <div style={{display:"flex",gap:8}}>
                          {/* Cargo — resizes independently */}
                          <div style={{flex:"0 0 18%",minWidth:120}}>
                            <RichEditor jobId={job.id} field="cargo_details" title="Cargo"
                              value={job.cargo_details||""} placeholder="Cargo details…"
                              height={job.ui_heights?.cargo_details||150}
                              onChange={val=>updateJob(job.id,{cargo_details:val})}
                              onResizeSave={h=>updateJobHeight(job.id,"cargo_details",h)}/>
                          </div>
                          {/* Notes — resizes independently */}
                          <div style={{flex:"0 0 28%",minWidth:0}}>
                            <RichEditor jobId={job.id} field="notes" title="Notes & Guidance"
                              value={job.notes||""} placeholder="Notes & guidance…"
                              height={job.ui_heights?.notes||150}
                              onChange={val=>updateJob(job.id,{notes:val})}
                              onResizeSave={h=>updateJobHeight(job.id,"notes",h)}/>
                          </div>
                          {/* Indications — resizes independently */}
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
                                      const matches=owners.filter(o=>(job.segment?o.segment===job.segment:true)&&(job.trade?o.trade===job.trade:true));
                                      if(!matches.length)return;
                                      const lines=matches.map(o=>`${o.company} /`).join("\n");
                                      updateJob(job.id,{indications:(job.indications?job.indications+"\n":"")+lines});
                                    }}
                                    style={{fontSize:10,fontWeight:700,height:22,padding:"0 8px",background:"rgba(88,166,255,.15)",border:"1px solid "+C.blue+"44",borderRadius:4,color:C.blue,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                                    Import owners
                                  </button>
                                </>
                              }
                              value={job.indications||""} placeholder="Indications…"
                              height={job.ui_heights?.indications||150}
                              onChange={val=>updateJob(job.id,{indications:val})}
                              onResizeSave={h=>updateJobHeight(job.id,"indications",h)}/>
                          </div>
                        </div>
                        {/* Subs / Fixed */}
                        <div style={{borderTop:"1px solid "+C.bd2,paddingTop:8}}>
                          <RichEditor jobId={job.id} field="subs_fixed"
                            title={job.status==="FIXED"?"✓ Fixed":job.status==="SUBS"?"On Subs":"Subs / Fixed"}
                            value={job.subs_fixed||""} placeholder="Subs / fixed…"
                            height={job.ui_heights?.subs_fixed||100}
                            onChange={val=>updateJob(job.id,{subs_fixed:val})}
                            onResizeSave={h=>updateJobHeight(job.id,"subs_fixed",h)}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Owner Directory — wider columns */}
        <div style={{flex:"0 0 340px",width:340,display:"flex",flexDirection:"column",gap:6}}>
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
              <div style={{display:"grid",gridTemplateColumns:"110px 56px 1fr 1fr auto",gap:3,alignItems:"center"}}>
                <input value={newOwnerEntry.company} onChange={e=>setNewOwnerEntry(p=>({...p,company:e.target.value}))} placeholder="Company" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
                <input value={newOwnerEntry.pic} onChange={e=>setNewOwnerEntry(p=>({...p,pic:e.target.value}))} placeholder="PIC" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
                <select value={newOwnerEntry.segment} onChange={e=>setNewOwnerEntry(p=>({...p,segment:e.target.value}))} className="own-sel">
                  <option value="">Seg…</option>
                  {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select value={newOwnerEntry.trade} onChange={e=>setNewOwnerEntry(p=>({...p,trade:e.target.value}))} className="own-sel">
                  <option value="">Trade…</option>
                  {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={addOwnerEntry} style={{background:"rgba(88,166,255,.18)",border:"1px solid rgba(88,166,255,.4)",borderRadius:4,color:C.blue,fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"3px 7px",cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
              </div>
              {(()=>{
                const filtered=owners.filter(o=>{
                  if(ownerSegFilter&&o.segment!==ownerSegFilter)return false;
                  if(ownerTradeFilter&&o.trade!==ownerTradeFilter)return false;
                  if(ownerDirSearch){const t=ownerDirSearch.toLowerCase();if(![o.company,o.pic,o.segment,o.trade,o.comment].filter(Boolean).join(" ").toLowerCase().includes(t))return false;}
                  return true;
                });
                if(!filtered.length)return <div style={{fontSize:11,color:C.faint,fontStyle:"italic"}}>No entries.</div>;
                return(
                  <div style={{border:"1px solid rgba(58,130,246,0.18)",borderRadius:6,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead>
                        <tr style={{background:"rgba(20,30,50,0.92)"}}>
                          {[["Company","34%"],["PIC","14%"],["Seg","20%"],["Trade","22%"],["","10%"]].map(([h,w])=>(
                            <th key={h} style={{padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.14)",width:w,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((o,ri)=>(
                          <tr key={o.id} style={{background:ri%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)"}}>
                            <td style={{padding:"2px 6px",borderBottom:"1px solid rgba(255,255,255,0.035)",whiteSpace:"nowrap",overflow:"hidden",maxWidth:1}}>
                              <input value={o.company||""} onChange={e=>updateOwnerEntry(o.id,"company",e.target.value)}
                                style={{background:"transparent",border:"none",outline:"none",color:"#79c0ff",fontFamily:"inherit",fontSize:11,width:"100%",minWidth:60}}/>
                            </td>
                            <td style={{padding:"2px 6px",borderBottom:"1px solid rgba(255,255,255,0.035)",whiteSpace:"nowrap",overflow:"hidden",maxWidth:1}}>
                              <input value={o.pic||""} onChange={e=>updateOwnerEntry(o.id,"pic",e.target.value)}
                                style={{background:"transparent",border:"none",outline:"none",color:"#43e97b",fontFamily:"inherit",fontSize:11,width:"100%",minWidth:30}}/>
                            </td>
                            <td style={{padding:"2px 4px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                              <select value={o.segment||""} onChange={e=>updateOwnerEntry(o.id,"segment",e.target.value)}
                                className="own-sel" style={{color:"rgba(88,166,255,0.8)",width:"100%"}}>
                                <option value="">—</option>
                                {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{padding:"2px 4px",borderBottom:"1px solid rgba(255,255,255,0.035)"}}>
                              <select value={o.trade||""} onChange={e=>updateOwnerEntry(o.id,"trade",e.target.value)}
                                className="own-sel" style={{color:"rgba(250,163,86,0.75)",width:"100%"}}>
                                <option value="">—</option>
                                {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td style={{padding:"2px 4px",borderBottom:"1px solid rgba(255,255,255,0.035)",textAlign:"center"}}>
                              <button onClick={()=>removeOwnerEntry(o.id)} style={{background:"none",border:"none",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontSize:11,padding:0}}>✕</button>
                            </td>
                          </tr>
                        ))}
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
