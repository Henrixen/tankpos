import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseclient";
import { C, SEGMENTS } from "./constants";
import { classifyRegion, daysBetween } from "./utils";
import { loadFixingJobs, saveFixingJob, deleteFixingJob, loadClients, saveClient, deleteClient } from "./supabaseHelpers";
import { isMobile } from "./constants";

const JOB_STATUS = ["OPEN","WORKING","SUBS","FIXED","FAILED"];

// Signal Ocean-inspired theme colors
const THEME = {
  bg: "#0a1628",
  bg2: "#0f1d2e", 
  bg3: "#1a2942",
  bd: "#2a3f5f",
  bd2: "#1e3048",
  tx: "#e3e8ef",
  dim: "#8b9cb5",
  faint: "#6b7f9a",
  blue: "#00d4ff",
  cyan: "#0ea5e9",
  orange: "#ff6b35",
  green: "#43e97b",
  amber: "#ffb020",
  purple: "#a78bfa",
  red: "#f87171"
};

const JOB_STATUS_COL = {
  OPEN: THEME.blue,
  WORKING: THEME.amber,
  SUBS: THEME.purple,
  FIXED: THEME.green,
  FAILED: THEME.red
};

const TRADES = ["UKC","Med","EU Feast","AG","TA West","Ex US","Asia"];

function FixingTab({vessels}){
  const mobile=isMobile();
  const [jobs,setJobs]=useState([]);
  const [clients,setClients]=useState([{id:"c1",name:"Aramco"},{id:"c2",name:"Trafigura"},{id:"c3",name:"Circle K"},{id:"c4",name:"Equinor"},{id:"c5",name:"CSS SA"},{id:"c6",name:"BASF"},{id:"c7",name:"Essar"},{id:"c8",name:"Exxon"},{id:"c9",name:"ENI"}]);
  const [owners,setOwners]=useState([]);
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

  const ownersBySegment=SEGMENTS.reduce((acc,seg)=>{acc[seg]=owners.filter(o=>o.segment===seg);return acc;},{});

  function fmtDateInput(input){
    if(!input)return input;
    const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const currentYear=new Date().getFullYear();
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

  const inpS=useMemo(()=>({background:THEME.bg3,border:"1px solid "+THEME.bd,borderRadius:4,color:THEME.tx,fontFamily:"inherit",fontSize:12,padding:"4px 7px",outline:"none",boxSizing:"border-box"}),[]);
  const fb2=useCallback((on,col)=>({fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,border:"1px solid "+(on?col||THEME.blue:THEME.bd),background:on?(col||THEME.blue)+"22":"transparent",color:on?col||THEME.blue:THEME.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}),[]);

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
    const today=new Date();
    const formattedDate=`${today.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]} ${today.getFullYear()}`;
    const job={id,charterer,product:"",qty:"",load:"",disch:"",laycan:"",laytime:"",status:"OPEN",guidance:"",outcome:"",notes:"",indications:"",subs_fixed:"",cargo_details:"",owners:[],fixed_owner:"",fixed_vessel:"",fixed_rate:"",added_date:formattedDate,created_at:new Date().toISOString()};
    await saveFixingJob(job);
    setJobs(prev=>[job,...prev]);
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
    if(!last_updated)return THEME.red;
    const days=(new Date()-new Date(last_updated))/86400000;
    if(days<2)return THEME.green;
    if(days<5)return THEME.amber;
    return THEME.red;
  }

  function daysSince(ts){
    if(!ts)return null;
    return Math.floor((new Date()-new Date(ts))/86400000);
  }

  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:"column",background:THEME.bg,minHeight:"calc(100vh - 100px)",padding:"16px 0"}}>
      {/* Delete confirmations */}
      {pendingDelJob&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:THEME.bg2,border:"1px solid "+THEME.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",fontSize:12,minWidth:300}}>
          <span style={{color:THEME.tx,flex:1}}>Delete <strong>{pendingDelJob.label}</strong>?</span>
          <button onClick={()=>{removeJob(pendingDelJob.id);setPendingDelJob(null);}} style={{background:THEME.red,border:"none",borderRadius:5,color:"#fff",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDelJob(null)} style={{background:THEME.bg3,border:"1px solid "+THEME.bd,borderRadius:5,color:THEME.tx,padding:"6px 16px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      {pendingDelOwner&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:THEME.bg2,border:"1px solid "+THEME.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",fontSize:12,minWidth:300}}>
          <span style={{color:THEME.tx,flex:1}}>Delete this owner?</span>
          <button onClick={confirmRemoveOwnerEntry} style={{background:THEME.red,border:"none",borderRadius:5,color:"#fff",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDelOwner(null)} style={{background:THEME.bg3,border:"1px solid "+THEME.bd,borderRadius:5,color:THEME.tx,padding:"6px 16px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      {/* TOP: Client chips */}
      <div style={{width:"100%",marginBottom:8,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <button onClick={()=>setClientFilter("ALL")} style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:20,border:"1px solid "+(clientFilter==="ALL"?THEME.blue:THEME.bd2),background:clientFilter==="ALL"?THEME.blue+"22":THEME.bg2,color:clientFilter==="ALL"?THEME.blue:THEME.faint,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>ALL</button>
        {clients.map(client=>{
          const isActive=clientFilter===client.name;
          const clientJobs=jobs.filter(j=>j.charterer===client.name);
          const total=clientJobs.length;
          const statusCounts=["OPEN","SUBS","FIXED","FAILED"].reduce((a,s)=>{const n=clientJobs.filter(j=>j.status===s).length;if(n)a.push({s,n});return a;},[]);
          const isExpanded=editingClient===client.id;
          return(
            <div key={client.id} style={{display:"flex",flexDirection:"column",background:isActive?THEME.blue+"15":THEME.bg2,border:"1px solid "+(isActive?THEME.blue:THEME.bd2),borderRadius:12,overflow:"hidden",minWidth:120,transition:"all 0.2s"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",cursor:"pointer"}} onClick={()=>setClientFilter(f=>f===client.name?"ALL":client.name)}>
                <span style={{fontSize:12,fontWeight:700,color:isActive?THEME.blue:THEME.tx,whiteSpace:"nowrap"}}>{client.name}</span>
                {statusCounts.map(({s,n})=>(
                  <span key={s} style={{fontSize:9,fontWeight:700,padding:"2px 5px",borderRadius:10,background:JOB_STATUS_COL[s]+"22",color:JOB_STATUS_COL[s]}}>{n}{s.slice(0,1)}</span>
                ))}
                {total>0&&<span style={{fontSize:10,color:THEME.faint}}>{total}</span>}
                <span onClick={e=>{e.stopPropagation();setEditingClient(isExpanded?null:client.id);}} style={{fontSize:10,color:THEME.faint,cursor:"pointer",marginLeft:2}}>{isExpanded?"▲":"▼"}</span>
                <span onClick={e=>{e.stopPropagation();createJob(client.name);setClientFilter(client.name);}} style={{fontSize:10,color:THEME.blue,cursor:"pointer",marginLeft:4,fontWeight:700}}>+</span>
              </div>
              {isExpanded&&(
                <div style={{padding:"8px 12px",borderTop:"1px solid "+THEME.bd2,background:THEME.bg3}} onClick={e=>e.stopPropagation()}>
                  <textarea value={client.notes||""} onChange={e=>updateClient(client.id,{notes:e.target.value})}
                    placeholder="Client notes…"
                    style={{...inpS,width:"100%",minHeight:100,resize:"vertical",fontSize:11,boxSizing:"border-box"}}/>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={()=>setShowNewClient(!showNewClient)} style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:20,border:"1px solid "+THEME.bd2,background:THEME.bg2,color:THEME.cyan,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>+ Client</button>
      </div>

      {showNewClient&&(
        <div style={{background:THEME.bg2,border:"1px solid "+THEME.bd,borderRadius:8,padding:16,marginBottom:8}}>
          <div style={{fontSize:14,fontWeight:700,color:THEME.tx,marginBottom:12}}>New Client</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input placeholder="Name" value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} style={{...inpS,flex:1,minWidth:120}}/>
            <input placeholder="Coverage" value={newClient.coverage} onChange={e=>setNewClient({...newClient,coverage:e.target.value})} style={{...inpS,flex:1,minWidth:120}}/>
            <button onClick={createClient} style={{background:THEME.green,border:"none",borderRadius:5,color:"#fff",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>Create</button>
            <button onClick={()=>setShowNewClient(false)} style={{background:THEME.bg3,border:"1px solid "+THEME.bd,borderRadius:5,color:THEME.dim,padding:"6px 16px",cursor:"pointer",fontSize:12}}>Cancel</button>
          </div>
        </div>
      )}

      {/* FILTERS & SEARCH */}
      <div style={{width:"100%",background:THEME.bg2,border:"1px solid "+THEME.bd2,borderRadius:8,padding:"12px 16px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:11,color:THEME.faint,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Status</span>
          {["ALL",...JOB_STATUS].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)} style={fb2(statusFilter===s,JOB_STATUS_COL[s]||THEME.blue)}>{s}</button>
          ))}
        </div>
        <div style={{flex:1,minWidth:200}}>
          <input value={jobSearch} onChange={e=>setJobSearch(e.target.value)} placeholder="🔍 Search jobs..." style={{...inpS,width:"100%"}}/>
        </div>
        <button onClick={()=>setShowOwnerDir(!showOwnerDir)} style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:6,border:"1px solid "+THEME.bd,background:showOwnerDir?THEME.purple+"22":"transparent",color:showOwnerDir?THEME.purple:THEME.dim,cursor:"pointer",fontFamily:"inherit"}}>
          Owner Directory
        </button>
        <button onClick={()=>createJob()} style={{background:THEME.blue,border:"none",borderRadius:6,color:"#fff",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ New Job</button>
      </div>

      {/* Owner Directory Panel */}
      {showOwnerDir&&(
        <div style={{width:"100%",background:THEME.bg2,border:"1px solid "+THEME.bd,borderRadius:8,padding:16,marginTop:-4}}>
          <div style={{fontSize:14,fontWeight:700,color:THEME.tx,marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
            📋 Owner Directory
            <select value={ownerSegFilter||""} onChange={e=>setOwnerSegFilter(e.target.value||null)} style={{...inpS,fontSize:11,padding:"3px 8px"}}>
              <option value="">All Segments</option>
              {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select value={ownerTradeFilter||""} onChange={e=>setOwnerTradeFilter(e.target.value||null)} style={{...inpS,fontSize:11,padding:"3px 8px"}}>
              <option value="">All Trades</option>
              {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Search..." value={ownerDirSearch} onChange={e=>setOwnerDirSearch(e.target.value)} style={{...inpS,fontSize:11,padding:"3px 8px",width:150}}/>
          </div>
          
          <div style={{marginBottom:12,display:"flex",gap:6}}>
            <input placeholder="Company" value={newOwnerEntry.company} onChange={e=>setNewOwnerEntry({...newOwnerEntry,company:e.target.value})} style={{...inpS,flex:1}}/>
            <select value={newOwnerEntry.segment} onChange={e=>setNewOwnerEntry({...newOwnerEntry,segment:e.target.value})} style={{...inpS,width:100}}>
              <option value="">Segment</option>
              {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="PIC" value={newOwnerEntry.pic} onChange={e=>setNewOwnerEntry({...newOwnerEntry,pic:e.target.value})} style={{...inpS,width:120}}/>
            <select value={newOwnerEntry.trade} onChange={e=>setNewOwnerEntry({...newOwnerEntry,trade:e.target.value})} style={{...inpS,width:100}}>
              <option value="">Trade</option>
              {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Comment" value={newOwnerEntry.comment} onChange={e=>setNewOwnerEntry({...newOwnerEntry,comment:e.target.value})} style={{...inpS,flex:1}}/>
            <button onClick={addOwnerEntry} disabled={!newOwnerEntry.company} style={{background:THEME.green,border:"none",borderRadius:5,color:"#fff",padding:"6px 16px",cursor:newOwnerEntry.company?"pointer":"not-allowed",fontWeight:700,fontSize:12,opacity:newOwnerEntry.company?1:0.5}}>Add</button>
          </div>

          <div style={{maxHeight:400,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:THEME.bg3,position:"sticky",top:0}}>
                  <th style={{padding:"6px 8px",textAlign:"left",color:THEME.faint,fontWeight:700,textTransform:"uppercase",fontSize:10,letterSpacing:"0.07em"}}>Company</th>
                  <th style={{padding:"6px 8px",textAlign:"left",color:THEME.faint,fontWeight:700,textTransform:"uppercase",fontSize:10,letterSpacing:"0.07em"}}>Segment</th>
                  <th style={{padding:"6px 8px",textAlign:"left",color:THEME.faint,fontWeight:700,textTransform:"uppercase",fontSize:10,letterSpacing:"0.07em"}}>PIC</th>
                  <th style={{padding:"6px 8px",textAlign:"left",color:THEME.faint,fontWeight:700,textTransform:"uppercase",fontSize:10,letterSpacing:"0.07em"}}>Trade</th>
                  <th style={{padding:"6px 8px",textAlign:"left",color:THEME.faint,fontWeight:700,textTransform:"uppercase",fontSize:10,letterSpacing:"0.07em"}}>Comment</th>
                  <th style={{padding:"6px 8px",width:30}}></th>
                </tr>
              </thead>
              <tbody>
                {owners
                  .filter(o=>!ownerSegFilter||o.segment===ownerSegFilter)
                  .filter(o=>!ownerTradeFilter||o.trade===ownerTradeFilter)
                  .filter(o=>!ownerDirSearch||JSON.stringify(o).toLowerCase().includes(ownerDirSearch.toLowerCase()))
                  .map((o,i)=>(
                    <tr key={o.id} style={{background:i%2===0?THEME.bg:THEME.bg2,borderBottom:"1px solid "+THEME.bd2}}>
                      <td style={{padding:"4px 8px"}}><input value={o.company||""} onChange={e=>updateOwnerEntry(o.id,"company",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                      <td style={{padding:"4px 8px"}}>
                        <select value={o.segment||""} onChange={e=>updateOwnerEntry(o.id,"segment",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}>
                          <option value="">—</option>
                          {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"4px 8px"}}><input value={o.pic||""} onChange={e=>updateOwnerEntry(o.id,"pic",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                      <td style={{padding:"4px 8px"}}>
                        <select value={o.trade||""} onChange={e=>updateOwnerEntry(o.id,"trade",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}>
                          <option value="">—</option>
                          {TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"4px 8px"}}><input value={o.comment||""} onChange={e=>updateOwnerEntry(o.id,"comment",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                      <td style={{padding:"4px 8px",textAlign:"center"}}>
                        <button onClick={()=>removeOwnerEntry(o.id)} style={{background:"none",border:"none",color:THEME.red,cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JOBS LIST */}
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
        {filteredJobs.map(job=>{
          const isExpanded=expandedJob===job.id;
          const statusCol=JOB_STATUS_COL[job.status]||THEME.blue;
          const suggested=suggestVessels(job);
          
          return(
            <div key={job.id} style={{background:THEME.bg2,border:"1px solid "+(isExpanded?statusCol:THEME.bd2),borderRadius:8,overflow:"hidden",transition:"all 0.2s"}}>
              <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",background:isExpanded?THEME.bg3:THEME.bg2}} onClick={()=>setExpandedJob(isExpanded?null:job.id)}>
                <div style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:16,background:statusCol+"22",color:statusCol,textTransform:"uppercase",letterSpacing:"0.05em"}}>{job.status}</div>
                <div style={{flex:1,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,color:THEME.tx}}>{job.charterer||"—"}</span>
                  <span style={{fontSize:12,color:THEME.cyan}}>{job.product||"—"}</span>
                  <span style={{fontSize:12,color:THEME.amber}}>{job.qty||"—"}</span>
                  <span style={{fontSize:12,color:THEME.dim}}>{job.load||"—"} → {job.disch||"—"}</span>
                  {job.laycan&&<span style={{fontSize:11,color:THEME.faint}}>{fmtLaycanText(job.laycan)}</span>}
                  {job.fixed_vessel&&<span style={{fontSize:11,color:THEME.green,fontWeight:700}}>✓ {job.fixed_vessel}</span>}
                </div>
                <span style={{fontSize:11,color:THEME.faint}}>{job.added_date}</span>
                <span style={{fontSize:12,color:THEME.dim}}>{isExpanded?"▲":"▼"}</span>
              </div>

              {isExpanded&&(
                <div style={{padding:"16px",background:THEME.bg,borderTop:"1px solid "+THEME.bd2}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12,marginBottom:16}}>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Charterer</div>
                      <input value={job.charterer||""} onChange={e=>updateJob(job.id,{charterer:e.target.value})} style={inpS}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Product</div>
                      <input value={job.product||""} onChange={e=>updateJob(job.id,{product:e.target.value})} style={inpS}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Qty</div>
                      <input value={job.qty||""} onChange={e=>updateJob(job.id,{qty:e.target.value})} style={inpS}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Load</div>
                      <input value={job.load||""} onChange={e=>updateJob(job.id,{load:e.target.value})} style={inpS}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Disch</div>
                      <input value={job.disch||""} onChange={e=>updateJob(job.id,{disch:e.target.value})} style={inpS}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Laycan</div>
                      <input value={job.laycan||""} onChange={e=>updateJob(job.id,{laycan:e.target.value})} onBlur={e=>updateJob(job.id,{laycan:fmtLaycanText(e.target.value)})} style={inpS}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Status</div>
                      <select value={job.status} onChange={e=>updateJob(job.id,{status:e.target.value})} style={{...inpS,fontWeight:700,color:JOB_STATUS_COL[job.status]}}>
                        {JOB_STATUS.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {suggested.length>0&&(
                    <div style={{marginBottom:12,padding:12,background:THEME.bg3,border:"1px solid "+THEME.bd,borderRadius:6}}>
                      <div style={{fontSize:11,color:THEME.faint,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Suggested Vessels ({suggested.length})</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {suggested.map(v=>(
                          <span key={v.vessel} style={{fontSize:11,padding:"3px 8px",borderRadius:4,background:THEME.blue+"22",border:"1px solid "+THEME.blue+"44",color:THEME.blue,cursor:"pointer"}} onClick={()=>updateJob(job.id,{fixed_vessel:v.vessel})}>
                            {v.vessel}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Guidance / Notes</div>
                    <textarea value={job.guidance||""} onChange={e=>updateJob(job.id,{guidance:e.target.value})} placeholder="Rate guidance, cargo details, special requirements..." style={{...inpS,width:"100%",minHeight:80,resize:"vertical"}}/>
                  </div>

                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:THEME.faint,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
                      Owners Approached
                      <button onClick={()=>addOwnerRow(job.id)} style={{background:THEME.blue,border:"none",borderRadius:4,color:"#fff",padding:"3px 10px",cursor:"pointer",fontWeight:700,fontSize:10}}>+ Add</button>
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead>
                        <tr style={{background:THEME.bg3}}>
                          <th style={{padding:"4px 8px",textAlign:"left",color:THEME.faint,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Owner</th>
                          <th style={{padding:"4px 8px",textAlign:"left",color:THEME.faint,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>PIC</th>
                          <th style={{padding:"4px 8px",textAlign:"left",color:THEME.faint,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Vessel</th>
                          <th style={{padding:"4px 8px",textAlign:"left",color:THEME.faint,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Indication</th>
                          <th style={{padding:"4px 8px",textAlign:"left",color:THEME.faint,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Comment</th>
                          <th style={{padding:"4px 8px",width:30}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(job.owners||[]).map((row,i)=>(
                          <tr key={row.id} style={{background:i%2===0?THEME.bg2:THEME.bg,borderBottom:"1px solid "+THEME.bd2}}>
                            <td style={{padding:"4px 8px"}}><input value={row.owner||""} onChange={e=>updateOwnerRow(job.id,row.id,"owner",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                            <td style={{padding:"4px 8px"}}><input value={row.pic||""} onChange={e=>updateOwnerRow(job.id,row.id,"pic",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                            <td style={{padding:"4px 8px"}}><input value={row.vessel||""} onChange={e=>updateOwnerRow(job.id,row.id,"vessel",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                            <td style={{padding:"4px 8px"}}><input value={row.indication||""} onChange={e=>updateOwnerRow(job.id,row.id,"indication",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                            <td style={{padding:"4px 8px"}}><input value={row.comment||""} onChange={e=>updateOwnerRow(job.id,row.id,"comment",e.target.value)} style={{...inpS,width:"100%",fontSize:11}}/></td>
                            <td style={{padding:"4px 8px",textAlign:"center"}}>
                              <button onClick={()=>removeOwnerRow(job.id,row.id)} style={{background:"none",border:"none",color:THEME.red,cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {job.status==="FIXED"&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12,padding:12,background:THEME.green+"11",border:"1px solid "+THEME.green+"44",borderRadius:6}}>
                      <div>
                        <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Fixed Owner</div>
                        <input value={job.fixed_owner||""} onChange={e=>updateJob(job.id,{fixed_owner:e.target.value})} style={inpS}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Fixed Vessel</div>
                        <input value={job.fixed_vessel||""} onChange={e=>updateJob(job.id,{fixed_vessel:e.target.value})} style={inpS}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Fixed Rate</div>
                        <input value={job.fixed_rate||""} onChange={e=>updateJob(job.id,{fixed_rate:e.target.value})} style={inpS}/>
                      </div>
                    </div>
                  )}

                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:THEME.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Outcome</div>
                    <textarea value={job.outcome||""} onChange={e=>updateJob(job.id,{outcome:e.target.value})} placeholder="Final outcome, lessons learned..." style={{...inpS,width:"100%",minHeight:60,resize:"vertical"}}/>
                  </div>

                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={()=>setPendingDelJob({id:job.id,label:job.charterer+" — "+job.product})} style={{background:THEME.red+"22",border:"1px solid "+THEME.red,borderRadius:5,color:THEME.red,padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:11}}>Delete Job</button>
                    <button onClick={()=>setExpandedJob(null)} style={{background:THEME.bg3,border:"1px solid "+THEME.bd,borderRadius:5,color:THEME.dim,padding:"6px 14px",cursor:"pointer",fontSize:11}}>Close</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredJobs.length===0&&(
          <div style={{padding:40,textAlign:"center",color:THEME.faint,fontSize:13}}>
            No jobs match current filters
          </div>
        )}
      </div>
    </div>
  );
}

export default FixingTab;
