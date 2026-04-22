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
  if (el) {
    el.focus();
    if (el.select) el.select();
  }
}

function cycleJobField(jobId, currentField, backwards=false){
  const idx = EDIT_FIELDS.indexOf(currentField);
  if (idx === -1) return;
  const nextIdx = backwards
    ? (idx - 1 + EDIT_FIELDS.length) % EDIT_FIELDS.length
    : (idx + 1) % EDIT_FIELDS.length;
  focusJobField(jobId, EDIT_FIELDS[nextIdx]);
}

function RichEditor({
  jobId,
  field,
  title,
  titleRight,
  value,
  onChange,
  onResizeSave,
  height = 120,
  placeholder = "",
  color = C.tx
}){
  const editorRef = React.useRef(null);
  const wrapRef = React.useRef(null);

  React.useEffect(()=>{
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  function exec(cmd){
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    onChange(editorRef.current?.innerHTML || "");
  }

  function handleInput(){
    onChange(editorRef.current?.innerHTML || "");
  }

  function handleKeyDown(e){
    if (e.key === "Tab") {
      e.preventDefault();
      cycleJobField(jobId, field, e.shiftKey);
    }
  }

  function saveHeight(){
  const h = wrapRef.current?.offsetHeight;
  if (h) onResizeSave?.(Math.round(h));
}

React.useEffect(()=>{
  const el = wrapRef.current;
  if (!el || !window.ResizeObserver) return;

  let t = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const h = el.offsetHeight;
      if (h) onResizeSave?.(Math.round(h));
    }, 180);
  });

  ro.observe(el);
  return () => {
    clearTimeout(t);
    ro.disconnect();
  };
}, [jobId, field, onResizeSave]);

  return (
    <div
      ref={wrapRef}
      style={{
        background:C.bg3,
        border:"1px solid "+C.bd,
        borderRadius:6,
        minHeight:height,
        height:height,
        resize:"vertical",
        overflow:"auto",
        boxSizing:"border-box"
      }}
      onMouseUp={saveHeight}
      onTouchEnd={saveHeight}
    >
      <div style={{
  display:"flex",
  alignItems:"center",
  justifyContent:"space-between",
  padding:"6px 10px",
  borderBottom:"1px solid "+C.bd2,
  background:C.bg4,
  position:"sticky",
  top:0,
  zIndex:1
}}>
  <span style={{
    fontSize:11,
    color:C.faint,
    textTransform:"uppercase",
    letterSpacing:"0.06em",
    fontWeight:700
  }}>
    {title}
  </span>

  <div style={{display:"flex",alignItems:"center",gap:6}}>
    {titleRight}
    <button
      type="button"
      onMouseDown={e=>e.preventDefault()}
      onClick={()=>exec("insertUnorderedList")}
      style={{
        fontSize:11,
        padding:"2px 8px",
        borderRadius:4,
        border:"1px solid "+C.bd,
        background:C.bg3,
        color:C.tx,
        cursor:"pointer"
      }}
    >
      List
    </button>
  </div>
</div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-job-field={`${jobId}-${field}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        style={{
          padding:"10px 12px",
          minHeight:Math.max(60, height - 38),
          color,
          fontFamily:"Inter, system-ui, -apple-system, Segoe UI, sans-serif",
          fontSize:12,
          lineHeight:1.6,
          outline:"none",
          whiteSpace:"pre-wrap"
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
  const [owners,setOwners]=useState([]); // owner directory
  const [expandedJob,setExpandedJob]=useState(null);
  const [editingClient,setEditingClient]=useState(null);
  const [showNewJob,setShowNewJob]=useState(false);
  const [showNewClient,setShowNewClient]=useState(false);
  const [showOwnerDir,setShowOwnerDir]=useState(false);
  const [statusFilter,setStatusFilter]=useState("ALL");
  const [clientFilter,setClientFilter]=useState("ALL");
  const [newJob,setNewJob]=useState({id:"",charterer:"",product:"",qty:"",load:"",disch:"",laycan:"",status:"OPEN",guidance:"",outcome:"",owners:[],fixed_owner:"",fixed_vessel:"",fixed_rate:"",added_date:new Date().toLocaleDateString('nb-NO',{day:'2-digit',month:'short',year:'numeric'}).replace(/\./g,'')});
  const [newClient,setNewClient]=useState({id:"",name:"",coverage:"",notes:""});
  const [newOwnerEntry,setNewOwnerEntry]=useState({id:"",company:"",segment:"",pic:"",trade:"",comment:""});
  const [jobSearch,setJobSearch]=useState("");
  const [pendingDelJob,setPendingDelJob]=useState(null);
  const [pendingDelOwner,setPendingDelOwner]=useState(null);
  const [ownerDirSearch,setOwnerDirSearch]=useState("");
  const [ownerSegFilter,setOwnerSegFilter]=useState(null);
  const [ownerTradeFilter,setOwnerTradeFilter]=useState(null);

  useEffect(()=>{
    loadFixingJobs().then(setJobs);
    loadClients().then(setClients);
    // Load owner directory from dashboard table
    supabase.from("dashboard").select("value").eq("key","owner-directory").single()
      .then(({data})=>{if(data)try{setOwners(JSON.parse(data.value));}catch(_){}});
  },[]);

  async function saveOwnerDir(dir){
    setOwners(dir);
    await supabase.from("dashboard").upsert({key:"owner-directory",value:JSON.stringify(dir)},{onConflict:"key"});
  }

  function addOwnerEntry(){
    const id="od_"+Date.now()+"_"+Math.random().toString(36).slice(2,5);
    const entry={...newOwnerEntry,id};
    saveOwnerDir([...owners,entry]);
    setNewOwnerEntry({id:"",company:"",segment:"",pic:"",trade:"",comment:""});
  }

  function updateOwnerEntry(id,field,val){
    saveOwnerDir(owners.map(o=>o.id===id?{...o,[field]:val}:o));
  }

  function removeOwnerEntry(id){
    setPendingDelOwner(id);
  }
  function confirmRemoveOwnerEntry(){
    if(!pendingDelOwner)return;
    saveOwnerDir(owners.filter(o=>o.id!==pendingDelOwner));
    setPendingDelOwner(null);
  }
  // Grouped owner directory by segment
  const ownersBySegment=SEGMENTS.reduce((acc,seg)=>{acc[seg]=owners.filter(o=>o.segment===seg);return acc;},{});

  function fmtDateInput(input){
    if(!input)return input;
    const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const currentYear=new Date().getFullYear();
    // Match DD/MM or DD/M format
    const m=input.match(/^(\d{1,2})\/(\d{1,2})$/);
    if(m){
      const day=m[1].padStart(2,'0');
      const month=parseInt(m[2])-1;
      if(month>=0&&month<12)return `${parseInt(m[1])} ${MON[month]} ${currentYear}`;
    }
    return input;
  }

  function fmtLaycanText(s){
    if(!s)return s;
    const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m1=s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:\s*[-–]\s*(\d{1,2})[\/\-](\d{1,2}))?$/);
    if(m1){const d1=m1[1],mo1=parseInt(m1[2])-1;if(m1[3]&&m1[4]){return d1+" "+MON[mo1]+" - "+m1[3]+" "+MON[parseInt(m1[4])-1];}return d1+" "+MON[mo1];}
    const m2=s.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+([A-Za-z]{3})/);
    if(m2){const mo=MON.find(m=>m.toLowerCase()===m2[3].toLowerCase().slice(0,3));if(mo)return m2[2]?m2[1]+" "+mo+" - "+m2[2]+" "+mo:m2[1]+" "+mo;}
    return s;
  }

  const filteredJobs=useMemo(()=>jobs.filter(j=>{
    if(statusFilter!=="ALL"&&j.status!==statusFilter)return false;
    if(clientFilter!=="ALL"&&j.charterer!==clientFilter)return false;
    if(jobSearch.trim()){const t=jobSearch.trim().toLowerCase();const hay=[j.charterer,j.product,j.qty,j.load,j.disch,j.laycan,j.outcome,j.fixed_owner,j.fixed_vessel].filter(Boolean).join(" ").toLowerCase();if(!hay.includes(t))return false;}
    return true;
  }),[jobs,statusFilter,clientFilter,jobSearch]);

  const charterersList=useMemo(()=>
    clientFilter==="ALL"?[...new Set(jobs.map(j=>j.charterer||""))]:[ clientFilter]
  ,[jobs,clientFilter]);

  const inpS=useMemo(()=>({
  background:C.bg3,
  border:"1px solid "+C.bd,
  borderRadius:6,
  color:C.tx,
  fontFamily:"Inter, system-ui, -apple-system, Segoe UI, sans-serif",
  fontSize:14,
  lineHeight:1.5,
  padding:"7px 10px",
  outline:"none",
  boxSizing:"border-box"
}),[]);
  const fb2=useCallback((on,col)=>({fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(on?col||C.blue:C.bd),background:on?(col||C.blue)+"22":"transparent",color:on?col||C.blue:C.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}),[]);

  function suggestVessels(job){
    if(!vessels||!vessels.length)return[];
    const loadRegion=classifyRegion(job.load);
    const layfrom=job.laycan?new Date():null;
    return vessels.filter(v=>{
      if(v.openPort==="EMPLOYED")return false;
      const vRegion=classifyRegion(v.openPort);
      const regionMatch=loadRegion&&vRegion&&(loadRegion===vRegion||(loadRegion==="ECUK"&&vRegion==="CANAL")||(loadRegion==="CANAL"&&vRegion==="ECUK")||(loadRegion==="BISCAY"&&vRegion==="CANAL"));
      const portMatch=v.openPort&&job.load&&(v.openPort.toLowerCase().includes(job.load.toLowerCase().slice(0,4))||job.load.toLowerCase().includes(v.openPort.toLowerCase().slice(0,4)));
      return(regionMatch||portMatch);
    }).slice(0,8);
  }

  async function createJob(charterer = "") {
  const id = "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
  const today = new Date();
  const formattedDate = `${today.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]} ${today.getFullYear()}`;
  const job = {
  id,
  charterer,
  status: "OPEN",
  laycan: "",
  laytime: "",
  notes: "",
  indications: "",
  cargo_details: "",
  subs_fixed: "",
  owners: [],
  added_date: formattedDate,
  segment: "",
  trade: "",
  ui_heights: {
  cargo_details: 150,
  notes: 150,
  indications: 150,
  subs_fixed: 100
},
  created_at: new Date().toISOString(),
};
  await saveFixingJob(job);
  setJobs(prev => [job, ...prev]);
  setExpandedJob(id);
}

  const jobsRef=React.useRef(jobs);
 React.useEffect(()=>{jobsRef.current=jobs;},[jobs]);
  const saveTimer=React.useRef({});
  const updateJob=useCallback((id,changes)=>{
  setJobs(prev=>prev.map(j=>j.id===id?{...j,...changes}:j));
  clearTimeout(saveTimer.current[id]);
  saveTimer.current[id]=setTimeout(()=>{
    const job=jobsRef.current.find(j=>j.id===id);
    if(job)saveFixingJob({...job,...changes});
  },800);
},[]);

  function updateJobHeight(jobId, field, height){
  const job = jobsRef.current.find(j => j.id === jobId);
  if (!job) return;

  const nextHeights = {...(job.ui_heights || {})};

  if (field === "cargo_details" || field === "notes" || field === "indications") {
    nextHeights.cargo_details = height;
    nextHeights.notes = height;
    nextHeights.indications = height;
  } else {
    nextHeights[field] = height;
  }

  updateJob(jobId, { ui_heights: nextHeights });
}

  async function removeJob(id){
    setJobs(prev=>prev.filter(j=>j.id!==id));
    await deleteFixingJob(id);
  }

  async function addOwnerRow(jobId){
    const row={id:"or_"+Date.now(),owner:"",pic:"",vessel:"",indication:"",comment:""};
    const job=jobs.find(j=>j.id===jobId);
    if(!job)return;
    await updateJob(jobId,{owners:[...(job.owners||[]),row]});
  }

  async function updateOwnerRow(jobId,rowId,field,val){
    const job=jobs.find(j=>j.id===jobId);
    if(!job)return;
    await updateJob(jobId,{owners:(job.owners||[]).map(r=>r.id===rowId?{...r,[field]:val}:r)});
  }

  async function removeOwnerRow(jobId,rowId){
    const job=jobs.find(j=>j.id===jobId);
    if(!job)return;
    await updateJob(jobId,{owners:(job.owners||[]).filter(r=>r.id!==rowId)});
  }

  async function createClient(){
    const id="cl_"+Date.now()+"_"+Math.random().toString(36).slice(2,5);
    const client={...newClient,id,last_updated:new Date().toISOString()};
    await saveClient(client);
    setClients(prev=>[...prev,client]);
    setNewClient({id:"",name:"",coverage:"",notes:""});
    setShowNewClient(false);
  }

  async function updateClient(id,changes){
    setClients(prev=>prev.map(c=>c.id===id?{...c,...changes}:c));
    const client=clients.find(c=>c.id===id);
    if(client)await saveClient({...client,...changes});
  }

  function clientFreshness(last_updated){
    if(!last_updated)return C.red;
    const days=(new Date()-new Date(last_updated))/86400000;
    if(days<2)return C.green;
    if(days<5)return C.amber;
    return C.red;
  }

  function daysSince(ts){
    if(!ts)return null;
    return Math.floor((new Date()-new Date(ts))/86400000);
  }

  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:"column"}}>
      {/* Delete confirmations */}
      {pendingDelJob&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong>{pendingDelJob.label}</strong>?</span>
          <button onClick={()=>{removeJob(pendingDelJob.id);setPendingDelJob(null);}} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDelJob(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      {/* TOP: Client chips */}
      <div style={{width:"100%",marginBottom:8,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={()=>setClientFilter("ALL")} style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,border:"1px solid "+(clientFilter==="ALL"?C.blue:C.bd),background:clientFilter==="ALL"?"rgba(88,166,255,.15)":"transparent",color:clientFilter==="ALL"?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>ALL</button>
        {clients.map(client=>{
          const isActive=clientFilter===client.name;
          const clientJobs=jobs.filter(j=>j.charterer===client.name);
          const total=clientJobs.length;
          const statusCounts=["OPEN","SUBS","FIXED","FAILED"].reduce((a,s)=>{const n=clientJobs.filter(j=>j.status===s).length;if(n)a.push({s,n});return a;},[]);
          const isExpanded=editingClient===client.id;
          return(
            <div key={client.id} style={{display:"flex",flexDirection:"column",background:isActive?"rgba(88,166,255,.12)":C.bg2,border:"1px solid "+(isActive?C.blue:C.bd),borderRadius:12,overflow:"hidden",minWidth:140}}>
  <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 16px",cursor:"pointer"}} onClick={()=>setClientFilter(f=>f===client.name?"ALL":client.name)}>
    <span style={{fontSize:13,fontWeight:700,color:isActive?C.blue:C.tx,whiteSpace:"nowrap"}}>{client.name}</span>
    {statusCounts.map(({s,n})=>(
      <span key={s} style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:8,background:JOB_STATUS_COL[s]+"22",color:JOB_STATUS_COL[s]}}>{n}{s}</span>
    ))}
    {total>0&&<span style={{fontSize:11,color:C.faint}}>{total}</span>}
    <span onClick={e=>{e.stopPropagation();setEditingClient(isExpanded?null:client.id);}} style={{fontSize:14,color:C.faint,cursor:"pointer",marginLeft:4,lineHeight:1}}>{isExpanded?"▲":"▼"}</span>
  </div>
              {isExpanded&&(
                <div style={{padding:"6px 10px",borderTop:"1px solid "+C.bd2}} onClick={e=>e.stopPropagation()}>
                  <textarea value={client.notes||""} onChange={e=>updateClient(client.id,{notes:e.target.value})}
                    placeholder="Client notes…"
                    style={{...inpS,width:"100%",minHeight:120,resize:"vertical",fontSize:11,boxSizing:"border-box"}}/>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={()=>setShowNewClient(s=>!s)} style={{fontSize:11,background:C.bg3,border:"1px solid "+C.bd,borderRadius:20,color:C.blue,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Add</button>
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

      {/* MAIN: Jobs + Owner Directory */}
      <div style={{display:"flex",gap:12,alignItems:"flex-start",width:"100%"}}>
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
  {/* New cargo button with client selector */}
  <div style={{display:"flex",gap:0,alignItems:"center",border:"1px solid "+C.blue,borderRadius:5,overflow:"hidden"}}>
    <select id="new_job_client_sel"
      defaultValue={clientFilter!=="ALL"?clientFilter:""}
      style={{background:C.bg3,border:"none",borderRight:"1px solid "+C.bd,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"4px 8px",outline:"none",cursor:"pointer",maxWidth:130}}>
      <option value="">Client…</option>
      {clients.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
    </select>
    <button onClick={()=>{
      const sel=document.getElementById("new_job_client_sel");
      const chosen=sel?.value||(clientFilter!=="ALL"?clientFilter:"");
      createJob(chosen);
      if(chosen)setClientFilter(chosen);
    }} style={{background:"rgba(88,166,255,.15)",border:"none",color:C.blue,fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"4px 12px",cursor:"pointer",whiteSpace:"nowrap"}}>+ New Cargo</button>
  </div>

  <div style={{display:"flex",gap:4}}>
    {["ALL",...JOB_STATUS].map(s=>(
      <button key={s} onClick={()=>setStatusFilter(s)} style={fb2(statusFilter===s,JOB_STATUS_COL[s])}>{s}</button>
    ))}
  </div>
  {clientFilter!=="ALL"&&(
    <button onClick={()=>setClientFilter("ALL")} style={{fontSize:11,background:"rgba(88,166,255,.1)",border:"1px solid rgba(88,166,255,.3)",borderRadius:4,color:C.blue,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>🔍 {clientFilter} ✕</button>
  )}
  <span style={{marginLeft:"auto",fontSize:11,color:C.faint}}>{filteredJobs.length} job{filteredJobs.length!==1?"s":""}</span>
</div>
        <div style={{position:"relative",maxWidth:300}}>
          <input value={jobSearch} onChange={e=>setJobSearch(e.target.value)} placeholder="🔍 Search jobs…" style={{...inpS,width:"100%",padding:"5px 28px 5px 10px"}}/>
          {jobSearch&&<button onClick={()=>setJobSearch("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:11}}>✕</button>}
        </div>

        {filteredJobs.length===0&&<div style={{color:C.faint,fontSize:12,padding:"40px",textAlign:"center"}}>No fixing jobs. Click + New to start.</div>}
        {charterersList.map(charterer=>{
          const chartererJobs=filteredJobs.filter(j=>{
            if(clientFilter==="ALL") return (j.charterer||"")===charterer;
            return (j.charterer||"")===clientFilter;
          });
          if(chartererJobs.length===0)return null;
          const isChartererOpen=expandedJob===charterer;
          return(
  <div key={charterer} style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",marginBottom:6}}>
    {/* Charterer header - click to expand/collapse */}
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer",background:C.bg1}} onClick={()=>setExpandedJob(isChartererOpen?null:charterer)}>
      <span style={{fontWeight:700,fontSize:13,color:C.blue,flex:1}}>{charterer||"—"}</span>
      <span style={{fontSize:11,color:C.faint}}>{chartererJobs.length} cargo{chartererJobs.length!==1?"es":""}</span>
      <span style={{fontSize:11,color:C.faint}}>{isChartererOpen?"▲":"▼"}</span>
    </div>
    
    {/* All jobs for this charterer */}
    {isChartererOpen&&chartererJobs.map(job=>{
          const scol=JOB_STATUS_COL[job.status]||C.dim;
          const summary=[job.qty,job.product,job.load&&job.disch?`${job.load} → ${job.disch}`:job.load||job.disch,job.laycan].filter(Boolean).join("  ");
const titleText = summary || stripHtml(job.cargo_details||"") || "New cargo";

          return(
            <div key={job.id} style={{borderTop:"1px solid "+C.bd2,padding:"10px 12px"}}>
              {/* Job summary line */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
  <input
  type="date"
  value={jobDateToISO(job.added_date)}
  onChange={e=>updateJob(job.id,{added_date:isoToJobDate(e.target.value)})}
  style={{
    ...inpS,
    minWidth:128,
    width:128,
    padding:"3px 8px",
    fontSize:12,
    color:C.faint,
    background:C.bg3,
    border:"1px solid "+C.bd,
    borderRadius:5
  }}
/>

  <span style={{
    fontSize:12,
    color:C.tx,
    flex:1,
    fontWeight:700,
    whiteSpace:"nowrap",
    overflow:"hidden",
    textOverflow:"ellipsis"
  }}>
    {titleText}
  </span>

  <div style={{display:"flex",gap:3,flexShrink:0}}>
    {JOB_STATUS.map(s=>(
      <button
        key={s}
        onClick={()=>updateJob(job.id,{status:s})}
        style={{
          fontSize:10,
          fontWeight:700,
          padding:"1px 6px",
          borderRadius:3,
          border:"1px solid "+(job.status===s?JOB_STATUS_COL[s]:C.bd),
          background:job.status===s?JOB_STATUS_COL[s]+"33":"transparent",
          color:job.status===s?JOB_STATUS_COL[s]:C.faint,
          cursor:"pointer",
          fontFamily:"inherit"
        }}
      >
        {s}
      </button>
    ))}
  </div>

  <button
    onClick={e=>{
      e.stopPropagation();
      setPendingDelJob({id:job.id,label:titleText || job.charterer || "job"});
    }}
    style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.4,padding:"0 2px"}}
  >
    ✕
  </button>
</div>

                            {/* Job details */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Row 1: 3 columns */}
                <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
                  {/* Cargo details 10% */}
                  <div style={{flex:"0 0 10%",minWidth:120,display:"flex",flexDirection:"column",gap:4,alignSelf:"stretch"}}>
                    <RichEditor
                      jobId={job.id}
                      field="cargo_details"
                      title="Cargo"
                      value={job.cargo_details || ""}
                      placeholder="Cargo details…"
                      height={job.ui_heights?.cargo_details || 150}
                      onChange={val => updateJob(job.id,{cargo_details:val})}
                      onResizeSave={h => updateJobHeight(job.id,"cargo_details",h)}
                    />
                  </div>

                  {/* Notes 30% */}
                  <div style={{flex:"0 0 30%",minWidth:0,display:"flex",flexDirection:"column",gap:4,alignSelf:"stretch"}}>
                    <RichEditor
                      jobId={job.id}
                      field="notes"
                      title="Notes & Guidance"
                      value={job.notes || ""}
                      placeholder="Notes & guidance…"
                      height={job.ui_heights?.notes || 150}
                      onChange={val => updateJob(job.id,{notes:val})}
                      onResizeSave={h => updateJobHeight(job.id,"notes",h)}
                    />
                  </div>

                  {/* Indications 60% */}
                  <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4}}>
                    <RichEditor
                      jobId={job.id}
                      field="indications"
                      title="Indications"
                      titleRight={
                        <>
                          <select
                            tabIndex={-1}
                            value={job.segment||""}
                            onChange={e=>updateJob(job.id,{segment:e.target.value})}
                            style={{
                              ...inpS,
                              padding:"2px 8px",
                              fontSize:11,
                              height:26,
                              background:C.bg3,
                              border:"1px solid "+C.bd,
                              borderRadius:5,
                              color:C.tx,
                              appearance:"none"
                            }}
                          >
                            <option value="">Seg...</option>
                            {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                          </select>

                          <select
                            tabIndex={-1}
                            value={job.trade||""}
                            onChange={e=>updateJob(job.id,{trade:e.target.value})}
                            style={{
                              ...inpS,
                              padding:"2px 8px",
                              fontSize:11,
                              height:26,
                              background:C.bg3,
                              border:"1px solid "+C.bd,
                              borderRadius:5,
                              color:C.tx,
                              appearance:"none"
                            }}
                          >
                            <option value="">Trade...</option>
                            {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>

                          <button
                            tabIndex={-1}
                            onClick={()=>{
                              const matches=owners.filter(o=>(job.segment?o.segment===job.segment:true)&&(job.trade?o.trade===job.trade:true));
                              if(!matches.length)return;
                              const lines=matches.map(o=>`${o.company} /`).join("\n");
                              updateJob(job.id,{indications:(job.indications?job.indications+"\n":"")+lines});
                            }}
                            style={{
                              fontSize:11,
                              fontWeight:700,
                              height:26,
                              padding:"0 10px",
                              background:"rgba(88,166,255,.15)",
                              border:"1px solid "+C.blue+"44",
                              borderRadius:5,
                              color:C.blue,
                              cursor:"pointer",
                              fontFamily:"inherit",
                              whiteSpace:"nowrap"
                            }}
                          >
                            Import owners
                          </button>
                        </>
                      }
                      value={job.indications || ""}
                      placeholder="Indications…"
                      height={job.ui_heights?.indications || 150}
                      onChange={val => updateJob(job.id,{indications:val})}
                      onResizeSave={h => updateJobHeight(job.id,"indications",h)}
                    />
                  </div>
                </div>

                {/* Row 2: Subs / Fixed */}
                <div style={{borderTop:"1px solid "+C.bd2,paddingTop:8}}>
                  <RichEditor
                    jobId={job.id}
                    field="subs_fixed"
                    title={job.status==="FIXED" ? "✓ Fixed" : job.status==="SUBS" ? "On Subs" : "Subs / Fixed"}
                    value={job.subs_fixed || ""}
                    placeholder="Subs / fixed…"
                    height={job.ui_heights?.subs_fixed || 100}
                    onChange={val => updateJob(job.id,{subs_fixed:val})}
                    onResizeSave={h => updateJobHeight(job.id,"subs_fixed",h)}
                  />
                </div>
              </div>
                </div>
              );
            })}
          </div>
        );
      })}
</div>
      {/* Owner Directory */}
      <div style={{flex:"0 0 260px",width:260,display:"flex",flexDirection:"column",gap:6}}>
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
            <input value={ownerDirSearch||""} onChange={e=>setOwnerDirSearch(e.target.value)} placeholder="🔍 Search owners…" style={{...inpS,width:"100%",padding:"3px 7px",fontSize:11}}/>
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
            <div style={{display:"grid",gridTemplateColumns:"80px 50px 52px 52px auto",gap:3,alignItems:"center"}}>
              <input value={newOwnerEntry.company} onChange={e=>setNewOwnerEntry(p=>({...p,company:e.target.value}))} placeholder="Company" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
              <input value={newOwnerEntry.pic} onChange={e=>setNewOwnerEntry(p=>({...p,pic:e.target.value}))} placeholder="PIC" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
              <select value={newOwnerEntry.segment} onChange={e=>setNewOwnerEntry(p=>({...p,segment:e.target.value}))} style={{...inpS,padding:"2px 3px",fontSize:11,background:C.bg3,appearance:"none"}}>
                <option value="">Seg…</option>
                {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={newOwnerEntry.trade} onChange={e=>setNewOwnerEntry(p=>({...p,trade:e.target.value}))} style={{...inpS,padding:"2px 3px",fontSize:11,background:C.bg3,appearance:"none"}}>
                <option value="">Trade…</option>
                {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={addOwnerEntry} style={{background:"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:11,padding:"3px 7px",cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
            </div>
            {(()=>{
              const dSel={...inpS,padding:"1px 3px",background:C.bg3,border:"none",borderBottom:"1px solid "+C.bd2+"55",fontSize:11,appearance:"none"};
              const filtered=owners.filter(o=>{
                if(ownerSegFilter&&o.segment!==ownerSegFilter)return false;
                if(ownerTradeFilter&&o.trade!==ownerTradeFilter)return false;
                if(ownerDirSearch){const t=ownerDirSearch.toLowerCase();if(![o.company,o.pic,o.segment,o.trade,o.comment].filter(Boolean).join(" ").toLowerCase().includes(t))return false;}
                return true;
              });
              if(!filtered.length)return <div style={{fontSize:11,color:C.faint,fontStyle:"italic"}}>No entries.</div>;
              return(
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:C.bg3}}>
                      {["Company","PIC","Seg","Trade",""].map(h=>(
                        <th key={h} style={{padding:"3px 4px",textAlign:"left",fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid "+C.bd2,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o,ri)=>(
                      <tr key={o.id} style={{background:ri%2===0?C.bg:C.bg2}}>
                        <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:75}}>
                          <input value={o.company||""} onChange={e=>updateOwnerEntry(o.id,"company",e.target.value)} style={{...inpS,width:"100%",padding:"1px 3px",background:"transparent",border:"none",borderBottom:"1px solid "+C.bd2+"55",fontSize:11,color:C.purple}}/>
                        </td>
                        <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:45}}>
                          <input value={o.pic||""} onChange={e=>updateOwnerEntry(o.id,"pic",e.target.value)} style={{...inpS,width:"100%",padding:"1px 3px",background:"transparent",border:"none",borderBottom:"1px solid "+C.bd2+"55",fontSize:11}}/>
                        </td>
                        <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:48}}>
                          <select value={o.segment||""} onChange={e=>updateOwnerEntry(o.id,"segment",e.target.value)} style={{...dSel,color:C.blue,width:"100%"}}>
                            <option value="">—</option>
                            {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:54}}>
                          <select value={o.trade||""} onChange={e=>updateOwnerEntry(o.id,"trade",e.target.value)} style={{...dSel,color:C.amber,width:"100%"}}>
                            <option value="">—</option>
                            {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"1px 3px",width:16}}>
                          <button onClick={()=>removeOwnerEntry(o.id)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11,opacity:0.5,padding:0}}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  </div>
  </div>
  </div>
  );
}

export default FixingTab;
