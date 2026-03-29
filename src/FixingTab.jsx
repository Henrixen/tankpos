import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseclient";
import { C, SEGMENTS } from "./constants";
import { classifyRegion, daysBetween } from "./utils";
import { loadFixingJobs, saveFixingJob, deleteFixingJob, loadClients, saveClient, deleteClient } from "./supabaseHelpers";

const JOB_STATUS = ["OPEN","WORKING","SUBS","FIXED","FAILED"];
const JOB_STATUS_COL = {OPEN:C.blue,WORKING:C.amber,SUBS:C.purple,FIXED:C.green,FAILED:C.red};
const TRADES = ["UKC","Med","EU Feast","AG","TA West","Ex US","Asia"];

function FixingTab({vessels}){
  const mobile=isMobile();
  const [jobs,setJobs]=useState([]);
  const [clients,setClients]=useState([]);
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

  async function createJob(){
    const id="job_"+Date.now()+"_"+Math.random().toString(36).slice(2,5);
    const job={id,charterer:"",product:"",qty:"",load:"",disch:"",laycan:"",laytime:"",status:"OPEN",guidance:"",outcome:"",owners:[],fixed_owner:"",fixed_vessel:"",fixed_rate:"",added_date:new Date().toISOString().slice(0,10),created_at:new Date().toISOString()};
    await saveFixingJob(job);
    setJobs(prev=>[job,...prev]);
    setExpandedJob(id);
  }

  async function updateJob(id,changes){
    setJobs(prev=>prev.map(j=>j.id===id?{...j,...changes}:j));
    const job=jobs.find(j=>j.id===id);
    if(job)await saveFixingJob({...job,...changes});
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
    <div style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:mobile?"column":"row"}}>
      {/* Delete confirmations */}
      {pendingDelJob&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong>{pendingDelJob.label}</strong>?</span>
          <button onClick={()=>{removeJob(pendingDelJob.id);setPendingDelJob(null);}} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDelJob(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}

      {/* LEFT: Clients + Owner Directory */}
      <div style={{flex:mobile?"1 1 auto":"0 0 290px",width:mobile?"100%":290,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Clients</span>
          <button onClick={()=>setShowNewClient(s=>!s)} style={{fontSize:11,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.blue,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Add</button>
        </div>
        {showNewClient&&(
          <div style={{background:C.bg2,border:"1px solid "+C.blue+"44",borderRadius:6,padding:"10px"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:6,textTransform:"uppercase"}}>New Client</div>
            {[["name","Name"],["coverage","Market coverage"],["notes","Notes"]].map(([f,l])=>(
              <div key={f} style={{marginBottom:5}}>
                <div style={{fontSize:11,color:C.faint,marginBottom:2}}>{l}</div>
                <input value={newClient[f]} onChange={e=>setNewClient(p=>({...p,[f]:e.target.value}))} style={{...inpS,width:"100%"}}/>
              </div>
            ))}
            <div style={{display:"flex",gap:5,marginTop:6}}>
              <button onClick={createClient} style={{flex:1,background:"#1f6feb",border:"none",borderRadius:4,color:"#fff",fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"5px",cursor:"pointer"}}>Save</button>
              <button onClick={()=>setShowNewClient(false)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,fontFamily:"inherit",fontSize:12,padding:"5px 10px",cursor:"pointer"}}>✕</button>
            </div>
          </div>
        )}
        {clients.map(client=>{
          const col=clientFreshness(client.last_updated);
          const isActive=clientFilter===client.name;
          const activeJobs=jobs.filter(j=>j.charterer===client.name&&(j.status==="OPEN"||j.status==="WORKING"||j.status==="SUBS"));
          const isEditing=editingClient===client.id;
          const ds=daysSince(client.last_updated);
          return(
            <div key={client.id} onClick={()=>setClientFilter(f=>f===client.name?"ALL":client.name)}
              style={{background:isActive?"rgba(88,166,255,.10)":C.bg2,border:"1px solid "+(isActive?C.blue:col+"44"),borderRadius:7,padding:"10px 12px",cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:col,flexShrink:0,display:"inline-block"}}/>
                <span style={{fontWeight:700,fontSize:12,color:isActive?C.blue:C.tx,flex:1}}>{client.name}</span>
                <span style={{fontSize:11,color:C.faint}}>{ds===0?"today":ds===1?"1d":ds+"d"}</span>
                <button onClick={e=>{e.stopPropagation();setEditingClient(isEditing?null:client.id);}} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:12,padding:"0 2px"}}>✎</button>
                <button onClick={e=>{e.stopPropagation();if(window.confirm("Delete "+client.name+"?"))deleteClient(client.id).then(()=>setClients(p=>p.filter(c=>c.id!==client.id)));}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11,padding:"0 2px",opacity:0.5}}>✕</button>
              </div>
              {client.coverage&&<div style={{fontSize:11,color:C.dim,marginBottom:4,lineHeight:1.4}}>{client.coverage}</div>}
              {activeJobs.length>0&&(
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {activeJobs.map(j=>(
                    <span key={j.id} style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:3,background:JOB_STATUS_COL[j.status]+"22",color:JOB_STATUS_COL[j.status],border:"1px solid "+JOB_STATUS_COL[j.status]+"33"}}>
                      {j.product||"cargo"} {j.load}{j.disch?"→"+j.disch:""}
                    </span>
                  ))}
                </div>
              )}
              {activeJobs.length===0&&<div style={{fontSize:11,color:C.faint,fontStyle:"italic"}}>No active requirements</div>}
              {isEditing&&(
                <div onClick={e=>e.stopPropagation()} style={{marginTop:8,borderTop:"1px solid "+C.bd2,paddingTop:8}}>
                  {[["name","Name"],["coverage","Coverage"],["notes","Notes"]].map(([f,l])=>(
                    <div key={f} style={{marginBottom:5}}>
                      <div style={{fontSize:11,color:C.faint,marginBottom:2}}>{l}</div>
                      <input value={client[f]||""} onChange={e=>updateClient(client.id,{[f]:e.target.value})} style={{...inpS,width:"100%"}}/>
                    </div>
                  ))}
                  <button onClick={()=>{updateClient(client.id,{last_updated:new Date().toISOString()});setEditingClient(null);}}
                    style={{fontSize:11,background:"rgba(67,233,123,.15)",border:"1px solid "+C.green+"44",borderRadius:4,color:C.green,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",marginRight:4}}>✓ Updated</button>
                  <button onClick={()=>setEditingClient(null)} style={{fontSize:11,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.dim,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>Done</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Owner Directory */}
        <div style={{marginTop:8,borderTop:"1px solid "+C.bd2,paddingTop:8}}>
          {pendingDelOwner&&(
            <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12,minWidth:280}}>
              <span style={{color:C.tx,flex:1}}>Remove <strong>{owners.find(o=>o.id===pendingDelOwner)?.company||"entry"}</strong>?</span>
              <button onClick={confirmRemoveOwnerEntry} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Remove</button>
              <button onClick={()=>setPendingDelOwner(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Owner Directory</span>
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
              <div style={{display:"grid",gridTemplateColumns:"80px 55px 70px 52px 52px auto",gap:3,alignItems:"center"}}>
                <input value={newOwnerEntry.company} onChange={e=>setNewOwnerEntry(p=>({...p,company:e.target.value}))} placeholder="Company" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
                <input value={newOwnerEntry.pic} onChange={e=>setNewOwnerEntry(p=>({...p,pic:e.target.value}))} placeholder="PIC" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
                <input value={newOwnerEntry.comment} onChange={e=>setNewOwnerEntry(p=>({...p,comment:e.target.value}))} placeholder="Comment" style={{...inpS,padding:"2px 4px",fontSize:11}}/>
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
                        {["Company","PIC","Comment","Seg","Trade",""].map(h=>(
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
                          <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:55}}>
                            <input value={o.pic||""} onChange={e=>updateOwnerEntry(o.id,"pic",e.target.value)} style={{...inpS,width:"100%",padding:"1px 3px",background:"transparent",border:"none",borderBottom:"1px solid "+C.bd2+"55",fontSize:11}}/>
                          </td>
                          <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3}}>
                            <input value={o.comment||""} onChange={e=>updateOwnerEntry(o.id,"comment",e.target.value)} style={{...inpS,width:"100%",padding:"1px 3px",background:"transparent",border:"none",borderBottom:"1px solid "+C.bd2+"55",fontSize:11}}/>
                          </td>
                          <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:52}}>
                            <select value={o.segment||""} onChange={e=>updateOwnerEntry(o.id,"segment",e.target.value)} style={{...dSel,color:C.blue,width:"100%"}}>
                              <option value="">—</option>
                              {SEGMENTS.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{padding:"1px 4px",borderBottom:"1px solid "+C.bg3,width:58}}>
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

      {/* RIGHT: Fixing Jobs */}
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={createJob} style={{fontSize:12,fontWeight:700,background:"#1f6feb",border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontFamily:"inherit"}}>+ New</button>
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
        {filteredJobs.map(job=>{
          const isOpen=expandedJob===job.id;
          const scol=JOB_STATUS_COL[job.status]||C.dim;
          const suggested=suggestVessels(job);
          const summary=[job.qty,job.product,job.load&&job.disch?job.load+" → "+job.disch:job.load||job.disch,job.laycan].filter(Boolean).join("  ");

          return(
            <div key={job.id} style={{background:C.bg2,border:"1px solid "+scol+"44",borderRadius:7,overflow:"hidden"}}>
              {/* Collapsed header */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer"}} onClick={()=>setExpandedJob(isOpen?null:job.id)}>
                <span style={{fontWeight:700,fontSize:12,color:C.blue,flexShrink:0,minWidth:60}}>{job.charterer||"—"}</span>
                <div style={{display:"flex",gap:3,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                  {JOB_STATUS.map(s=>(
                    <button key={s} onClick={()=>updateJob(job.id,{status:s})}
                      style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,border:"1px solid "+(job.status===s?JOB_STATUS_COL[s]:C.bd),background:job.status===s?JOB_STATUS_COL[s]+"33":"transparent",color:job.status===s?JOB_STATUS_COL[s]:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
                      {s}
                    </button>
                  ))}
                </div>
                <span style={{fontSize:12,color:C.tx,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{summary}</span>
                <span style={{fontSize:11,color:C.faint,flexShrink:0}}>{(job.owners||[]).length>0?(job.owners||[]).length+"o":""}</span>
                {job.added_date&&<span style={{fontSize:10,color:C.faint,flexShrink:0}}>{new Date(job.added_date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</span>}
                <span style={{fontSize:11,color:C.faint}}>{isOpen?"▲":"▼"}</span>
                <button onClick={e=>{e.stopPropagation();setPendingDelJob({id:job.id,label:summary||job.charterer||"job"});}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.4,padding:"0 2px"}}>✕</button>
              </div>

              {/* Expanded body */}
              {/* Expanded body */}
              {isOpen&&(
                <div style={{borderTop:"1px solid "+C.bd2,display:"flex",gap:0}}>
                  {/* LEFT panel */}
                  <div style={{flex:"0 0 20%",minWidth:160,borderRight:"1px solid "+C.bd2,padding:"10px",display:"flex",flexDirection:"column",gap:4}}>
                    {/* Client + added date on same row */}
                    <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                      <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.05em",width:52,flexShrink:0}}>Client</span>
                      <select value={job.charterer||""} onChange={e=>updateJob(job.id,{charterer:e.target.value})} style={{...inpS,flex:1,padding:"2px 5px",fontSize:11,background:C.bg3,appearance:"none"}}>
                        <option value="">—</option>
                        {clients.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}>
                      <input type="date" value={job.added_date||""} onChange={e=>updateJob(job.id,{added_date:e.target.value})} title="Date added"
                        style={{fontSize:10,color:C.faint,background:"transparent",border:"none",outline:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"right"}}/>
                    </div>
                    {[["qty","Qty"],["product","Product"],["load","Load"],["disch","Disch"]].map(([f,l])=>(
                      <div key={f} style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.05em",width:52,flexShrink:0}}>{l}</span>
                        <input value={job[f]||""} onChange={e=>updateJob(job.id,{[f]:e.target.value})} style={{...inpS,flex:1,padding:"2px 5px",fontSize:11}}/>
                      </div>
                    ))}
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.05em",width:52,flexShrink:0}}>Laycan</span>
                      <input value={job.laycan||""} onChange={e=>updateJob(job.id,{laycan:e.target.value})} onBlur={e=>updateJob(job.id,{laycan:fmtLaycanText(e.target.value)})} placeholder="13-15 Mar" style={{...inpS,flex:1,padding:"2px 5px",fontSize:11}}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.05em",width:52,flexShrink:0}}>Laytime</span>
                      <input value={job.laytime||""} onChange={e=>updateJob(job.id,{laytime:e.target.value})} placeholder="200mt/hr" style={{...inpS,flex:1,padding:"2px 5px",fontSize:11}}/>
                    </div>
                    {/* Guidance - 6 lines */}
                    <div>
                      <div style={{fontSize:10,color:C.faint,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Guidance</div>
                      <textarea value={job.guidance||""} onChange={e=>updateJob(job.id,{guidance:e.target.value})}
                        placeholder="Rate guidance, market context…"
                        ref={el=>{if(el){el.style.height="auto";el.style.height=el.scrollHeight+"px";}}}
                        onInput={e=>{e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                        style={{...inpS,width:"100%",minHeight:90,resize:"none",overflow:"hidden",fontSize:11}}/>
                    </div>
                    {/* Notes - bigger */}
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:C.faint,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Notes</div>
                      <textarea value={job.outcome||""} onChange={e=>updateJob(job.id,{outcome:e.target.value})}
                        placeholder="Market context, charterer feedback, outcome…"
                        ref={el=>{if(el){el.style.height="auto";el.style.height=el.scrollHeight+"px";}}}
                        onInput={e=>{e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                        style={{...inpS,width:"100%",minHeight:140,resize:"none",overflow:"hidden",fontSize:11}}/>
                    </div>
                  </div>

                  {/* RIGHT panel */}
                  <div style={{flex:1,padding:"10px",minWidth:0,display:"flex",flexDirection:"column",gap:10,overflow:"visible"}}>
                    {suggested.length>0&&(
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:11,color:C.faint}}>💡 Nearby:</span>
                        {suggested.map(v=>(
                          <button key={v.vessel} onClick={()=>{
                            const already=(job.owners||[]).some(r=>r.vessel&&r.vessel.toLowerCase()===v.vessel.toLowerCase());
                            if(!already)addOwnerRow(job.id).then(()=>{
                              const j2=jobs.find(j=>j.id===job.id);
                              if(j2){const last=(j2.owners||[]).slice(-1)[0];if(last)updateOwnerRow(job.id,last.id,"vessel",v.vessel);}
                            });
                          }} style={{fontSize:11,padding:"1px 7px",borderRadius:4,background:C.bg3,border:"1px solid "+C.bd,color:C.blue,cursor:"pointer",fontFamily:"inherit"}}>
                            +{v.vessel} <span style={{color:C.faint,fontSize:10}}>{v.openPort} {v.date}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Candidates table */}
                    <div style={{overflowX:"auto"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Candidates</span>
                        <button onClick={()=>addOwnerRow(job.id)} style={{fontSize:11,background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.blue,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Add</button>
                      </div>
                      {(job.owners||[]).length===0&&<div style={{fontSize:12,color:C.faint,fontStyle:"italic"}}>No candidates yet.</div>}
                      {(job.owners||[]).length>0&&(()=>{
                        const cols=["owner","pic","vessel","indication","comment"];
                        const colWidths=job._colWidths||{owner:120,pic:80,vessel:130,indication:100,comment:180};
                        return(
                          <table style={{borderCollapse:"collapse",fontSize:12,tableLayout:"fixed",width:"100%"}}>
                            <colgroup>
                              {cols.map(f=><col key={f} style={{width:colWidths[f]||120}}/>)}
                              <col style={{width:24}}/>
                            </colgroup>
                            <thead>
                              <tr style={{background:C.bg3}}>
                                {cols.map((f,ci)=>(
                                  <th key={f} style={{padding:"4px 8px",textAlign:"left",fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid "+C.bd2,whiteSpace:"nowrap",position:"relative",userSelect:"none"}}>
                                    {f==="owner"?"Owner":f==="pic"?"PIC":f==="vessel"?"Vessel":f==="indication"?"Indication":"Comment"}
                                    <span onMouseDown={e=>{
                                      e.preventDefault();
                                      const startX=e.clientX;
                                      const startW=colWidths[f]||120;
                                      const onMove=m=>{
                                        const newW=Math.max(50,startW+(m.clientX-startX));
                                        updateJob(job.id,{_colWidths:{...colWidths,[f]:newW}});
                                      };
                                      const onUp=()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);};
                                      document.addEventListener("mousemove",onMove);
                                      document.addEventListener("mouseup",onUp);
                                    }} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:4,cursor:"col-resize",background:"rgba(100,150,200,0.3)",borderRadius:2}}/>
                                  </th>
                                ))}
                                <th style={{padding:"4px 2px",borderBottom:"1px solid "+C.bd2,width:20,textAlign:"right"}}/>
                              </tr>
                            </thead>
                            <tbody>
                              {(job.owners||[]).map((row,ri)=>(
                                <tr key={row.id} style={{background:ri%2===0?C.bg:C.bg2}}>
                                  {cols.map((f,ci)=>(
                                  <td key={f} style={{padding:"1px 2px",borderBottom:"1px solid "+C.bg3,overflow:"hidden",textAlign:"left"}}>
                                      <input value={row[f]||""} onChange={e=>updateOwnerRow(job.id,row.id,f,e.target.value)}
                                        placeholder={f==="indication"?"e.g. $340k":f==="pic"?"Name":""}
                                        onKeyDown={e=>{
                                          if(e.key==="Tab"){
                                            e.preventDefault();
                                            if(e.shiftKey){
                                              // shift-tab: go left
                                              if(ci>0){const prevF=cols[ci-1];e.currentTarget.closest("tr").querySelectorAll("input")[ci-1]?.focus();}
                                            } else {
                                              if(ci<cols.length-1){
                                                e.currentTarget.closest("tr").querySelectorAll("input")[ci+1]?.focus();
                                              } else {
                                                // last column - add new row and focus first cell
                                                addOwnerRow(job.id).then(()=>{
                                                  setTimeout(()=>{
                                                    const rows=document.querySelectorAll(`[data-jobid="${job.id}"] tbody tr`);
                                                    if(rows.length)rows[rows.length-1].querySelectorAll("input")[0]?.focus();
                                                  },50);
                                                });
                                              }
                                            }
                                          }
                                        }}
                                        style={{...inpS,width:"100%",padding:"3px 5px",background:"transparent",border:"none",borderBottom:"1px solid "+C.bd2+"44",fontSize:12,boxSizing:"border-box"}}/>
                                    </td>
                                  ))}
                                  <td style={{padding:"1px 4px",textAlign:"right",width:20}}>
                                    <button onClick={()=>removeOwnerRow(job.id,row.id)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:11,opacity:0.5,padding:0}}>✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>

                    {/* Fixed section */}
                    <div style={{borderRadius:5,padding:8,background:job.status==="FIXED"?"rgba(67,233,123,0.06)":"rgba(255,255,255,0.02)",border:job.status==="FIXED"?"1px solid "+C.green+"44":"1px solid "+C.bd2,transition:"all 0.2s"}}>
                      <div style={{fontSize:11,fontWeight:700,color:job.status==="FIXED"?C.green:"#555",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>✓ Fixed</div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        {[["fixed_owner","Owner",100],["fixed_vessel","Vessel",130],["fixed_rate","Rate",130]].map(([f,l,w])=>(
                          <div key={f} style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:10,color:job.status==="FIXED"?C.faint:"#555",textTransform:"uppercase",letterSpacing:"0.05em",flexShrink:0}}>{l}</span>
                            <input value={job[f]||""} onChange={e=>updateJob(job.id,{[f]:e.target.value})}
                              placeholder={f==="fixed_rate"?"e.g. $340k lsum":""}
                              style={{...inpS,width:w,padding:"3px 6px",fontSize:11,opacity:job.status==="FIXED"?1:0.6}}/>
                          </div>
                        ))}
                        <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:150}}>
                          <span style={{fontSize:10,color:job.status==="FIXED"?C.faint:"#555",textTransform:"uppercase",letterSpacing:"0.05em",flexShrink:0}}>Comment</span>
                          <input value={job.fixed_comment||""} onChange={e=>updateJob(job.id,{fixed_comment:e.target.value})}
                            placeholder="e.g. direct, via broker X"
                            style={{...inpS,flex:1,padding:"3px 6px",fontSize:11,opacity:job.status==="FIXED"?1:0.6}}/>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



export default FixingTab;
