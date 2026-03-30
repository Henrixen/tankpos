import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseclient";
import { C, SEGMENTS } from "./constants";
import { classifyRegion, daysBetween } from "./utils";
import { loadFixingJobs, saveFixingJob, deleteFixingJob, loadClients, saveClient, deleteClient } from "./supabaseHelpers";
import { isMobile } from "./constants";

const JOB_STATUS = ["OPEN","WORKING","SUBS","FIXED","FAILED"];
const JOB_STATUS_COL = {OPEN:C.blue,WORKING:C.amber,SUBS:C.purple,FIXED:C.green,FAILED:C.red};
const TRADES = ["UKC","Med","EU Feast","AG","TA West","Ex US","Asia"];

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
  const [newJob,setNewJob]=useState({id:"",charterer:"",product:"",qty:"",load:"",disch:"",laycan:"",status:"OPEN",guidance:"",outcome:"",owners:[],fixed_owner:"",fixed_vessel:"",fixed_rate:"",added_date:new Date().toISOString().slice(0,10)});
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

  function fmtLaycanText(s){
    if(!s)return s;
    const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const m1=s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:\s*[-–]\s*(\d{1,2})[\/\-](\d{1,2}))?$/);
    if(m1){const d1=m1[1],mo1=parseInt(m1[2])-1;if(m1[3]&&m1[4]){return d1+" "+MON[mo1]+" - "+m1[3]+" "+MON[parseInt(m1[4])-1];}return d1+" "+MON[mo1];}
    const m2=s.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+([A-Za-z]{3})/);
    if(m2){const mo=MON.find(m=>m.toLowerCase()===m2[3].toLowerCase().slice(0,3));if(mo)return m2[2]?m2[1]+" "+mo+" - "+m2[2]+" "+mo:m2[1]+" "+mo;}
    return s;
  }

  const filteredJobs=jobs.filter(j=>{
    if(statusFilter!=="ALL"&&j.status!==statusFilter)return false;
    if(clientFilter!=="ALL"&&j.charterer!==clientFilter)return false;
    if(jobSearch.trim()){const t=jobSearch.trim().toLowerCase();const hay=[j.charterer,j.product,j.qty,j.load,j.disch,j.laycan,j.outcome,j.fixed_owner,j.fixed_vessel].filter(Boolean).join(" ").toLowerCase();if(!hay.includes(t))return false;}
    return true;
  });

  const inpS={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"4px 7px",outline:"none",boxSizing:"border-box"};
  const fb2=(on,col)=>({fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(on?col||C.blue:C.bd),background:on?(col||C.blue)+"22":"transparent",color:on?col||C.blue:C.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});

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

  async function createJob(charterer=""){
  const id="job_"+Date.now()+"_"+Math.random().toString(36).slice(2,5);
  const job={id,charterer,product:"",qty:"",load:"",disch:"",laycan:"",laytime:"",status:"OPEN",guidance:"",outcome:"",notes:"",indications:"",subs_fixed:"",cargo_details:"",owners:[],fixed_owner:"",fixed_vessel:"",fixed_rate:"",added_date:new Date().toISOString().slice(0,10),created_at:new Date().toISOString()};
  await saveFixingJob(job);
  setJobs(prev=>[job,...prev]);
  setExpandedJob(id);
}

  const jobsRef=React.useRef(jobs);
 React.useEffect(()=>{jobsRef.current=jobs;},[jobs]);
  const saveTimer=React.useRef({});
  async function updateJob(id,changes){
  setJobs(prev=>prev.map(j=>j.id===id?{...j,...changes}:j));
  clearTimeout(saveTimer.current[id]);
  saveTimer.current[id]=setTimeout(()=>{
    const job=jobsRef.current.find(j=>j.id===id);
    if(job)saveFixingJob({...job,...changes});
  },1200);
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
            <div key={client.id} style={{display:"flex",flexDirection:"column",background:isActive?"rgba(88,166,255,.12)":C.bg2,border:"1px solid "+(isActive?C.blue:C.bd),borderRadius:12,overflow:"hidden",minWidth:120}}>
  <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",cursor:"pointer"}} onClick={()=>setClientFilter(f=>f===client.name?"ALL":client.name)}>
                <span style={{fontSize:12,fontWeight:700,color:isActive?C.blue:C.tx,whiteSpace:"nowrap"}}>{client.name}</span>
                {statusCounts.map(({s,n})=>(
                  <span key={s} style={{fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:8,background:JOB_STATUS_COL[s]+"22",color:JOB_STATUS_COL[s]}}>{n}{s}</span>
                ))}
                {total>0&&<span style={{fontSize:10,color:C.faint}}>{total}</span>}
                <span onClick={e=>{e.stopPropagation();setEditingClient(isExpanded?null:client.id);}} style={{fontSize:10,color:C.faint,cursor:"pointer",marginLeft:2}}>{isExpanded?"▲":"▼"}</span>
<span onClick={e=>{e.stopPropagation();createJob(client.name);setClientFilter(client.name);}} style={{fontSize:10,color:C.blue,cursor:"pointer",marginLeft:4,fontWeight:700}}>+</span>
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
        {(clientFilter==="ALL"?[...new Set(jobs.map(j=>j.charterer||""))]:[ clientFilter]).map(charterer=>(
  <div key={charterer} style={{display:"flex",flexDirection:"column",gap:0}}>
    {clientFilter==="ALL"&&<div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",padding:"6px 2px 3px"}}>{charterer}</div>}
    {filteredJobs.filter(j=>{
      if(clientFilter==="ALL") return (j.charterer||"")===charterer;
      return (j.charterer||"")===clientFilter;
    }).map(job=>{
          const isOpen=expandedJob===job.id;
          const scol=JOB_STATUS_COL[job.status]||C.dim;
          const suggested=suggestVessels(job);
          const summary=[job.qty,job.product,job.load&&job.disch?`${job.load} → ${job.disch}`:job.load||job.disch,job.laycan].filter(Boolean).join("  ");

          return(
            <div key={job.id} style={{background:C.bg2,border:"1px solid "+scol+"44",borderRadius:7,overflow:"hidden"}}>
              {/* Collapsed header */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer"}} onClick={()=>setExpandedJob(isOpen?null:job.id)}>
                <span style={{fontWeight:700,fontSize:12,color:C.blue,flexShrink:0,minWidth:60}}>{job.charterer||"—"}</span>
<input type="text" value={job.added_date||""} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();updateJob(job.id,{added_date:e.target.value});}} placeholder="DD/MM/YYYY" style={{background:"transparent",border:"none",borderBottom:"1px solid "+C.bd,color:C.faint,fontFamily:"inherit",fontSize:11,width:80,outline:"none",flexShrink:0}}/>
<div style={{display:"flex",gap:3,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                  {JOB_STATUS.map(s=>(
                    <button key={s} onClick={()=>updateJob(job.id,{status:s})}
                      style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,border:"1px solid "+(job.status===s?JOB_STATUS_COL[s]:C.bd),background:job.status===s?JOB_STATUS_COL[s]+"33":"transparent",color:job.status===s?JOB_STATUS_COL[s]:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
                      {s}
                    </button>
                  ))}
                </div>
                <span style={{fontSize:11,color:C.faint}}>{isOpen?"▲":"▼"}</span>
                <button onClick={e=>{e.stopPropagation();setPendingDelJob({id:job.id,label:summary||job.charterer||"job"});}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.4,padding:"0 2px"}}>✕</button>
              </div>

              {/* Expanded body */}
              {isOpen&&(
  <div style={{borderTop:"1px solid "+C.bd2,padding:10,display:"flex",flexDirection:"column",gap:8}}>
    {/* Row 1: 3 columns */}
    <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
      {/* Cargo details 10% */}
      <div style={{flex:"0 0 10%",minWidth:120,display:"flex",flexDirection:"column",gap:4,alignSelf:"stretch"}}>
        <div style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Cargo</div>
        <textarea value={job.cargo_details||""} onChange={e=>updateJob(job.id,{cargo_details:e.target.value})}
          placeholder={`Client\nQty\nProduct\nLoad → Disch\nLaycan`}
          style={{...inpS,width:"100%",flex:1,resize:"none",fontSize:11,boxSizing:"border-box"}}/>
      </div>
      {/* Notes 30% */}
      <div style={{flex:"0 0 30%",minWidth:0,display:"flex",flexDirection:"column",gap:4,alignSelf:"stretch"}}>
        <div style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Notes & Guidance</div>
        <textarea value={job.notes||""} onChange={e=>updateJob(job.id,{notes:e.target.value})}
          placeholder="Rate guidance, charterer feedback, market context…"
          style={{...inpS,width:"100%",flex:1,resize:"none",fontSize:11,boxSizing:"border-box"}}/>
      </div>
      {/* Indications 60% */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
          <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>Indications</span>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <select id={"seg_"+job.id} defaultValue="" style={{...inpS,padding:"1px 4px",fontSize:10,background:C.bg3,appearance:"none"}}>
              <option value="">Seg…</option>
              {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select id={"trd_"+job.id} defaultValue="" style={{...inpS,padding:"1px 4px",fontSize:10,background:C.bg3,appearance:"none"}}>
              <option value="">Trade…</option>
              {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={()=>{
              const seg=document.getElementById("seg_"+job.id)?.value;
              const trd=document.getElementById("trd_"+job.id)?.value;
              const matches=owners.filter(o=>(seg?o.segment===seg:true)&&(trd?o.trade===trd:true));
              if(!matches.length)return;
              const lines=matches.map(o=>`${o.company} /`).join("\n");
              updateJob(job.id,{indications:(job.indications?job.indications+"\n":"")+lines});
            }} style={{fontSize:10,fontWeight:700,background:"rgba(88,166,255,.15)",border:"1px solid "+C.blue+"44",borderRadius:4,color:C.blue,padding:"2px 7px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              Import owners
            </button>
          </div>
        </div>
        <textarea value={job.indications||""} onChange={e=>updateJob(job.id,{indications:e.target.value})}
          placeholder={`Odfjell /\nFuretank /\n…`}
          style={{...inpS,width:"100%",minHeight:120,resize:"vertical",fontSize:11,boxSizing:"border-box",fontFamily:"monospace"}}/>
      </div>
    </div>
   {/* Row 2: Subs / Fixed */}
    <div style={{borderTop:"1px solid "+C.bd2,paddingTop:8}}>
      <div style={{fontSize:10,color:job.status==="FIXED"?C.green:job.status==="SUBS"?C.purple:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,fontWeight:700}}>
        {job.status==="FIXED"?`✓ Fixed`:job.status==="SUBS"?`On Subs`:`Subs / Fixed`}
      </div>
      <textarea value={job.subs_fixed||""} onChange={e=>updateJob(job.id,{subs_fixed:e.target.value})}
        placeholder={`Owner / Vessel / Rate / Terms...`}
        style={{...inpS,width:"100%",minHeight:36,resize:"vertical",fontSize:11,boxSizing:"border-box"}}/>
    </div>
  </div>
)}
            </div>
          );
        })}
  </div>
))}
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
  );
}

export default FixingTab;
