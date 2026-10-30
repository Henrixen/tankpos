import React,{useEffect,useRef,useState,useLayoutEffect} from "react";
import {supabase} from "./supabaseclient";
import {useBrokerSession} from "./BrokerWorkspace";

export function useReportLive({id,label,draft,busy,onList,onLoad}){
 const session=useBrokerSession(),channel=useRef(null),latest=useRef(null),base=useRef(null),settle=useRef(false),mounted=useRef(true);
 const [,rerender]=useState(0);
 const [peers,setPeers]=useState([]),[status,setStatus]=useState("Connecting"),[pending,setPending]=useState(null),[notice,setNotice]=useState("");
 const stamp=JSON.stringify(draft),key=String(id||"");
 if(!base.current)base.current={key,stamp};
 else if(base.current.key!==key)base.current.key=key;
 const dirty=base.current.stamp!==stamp;
 latest.current={id:key,label,stamp,dirty,busy,onList,onLoad};
 useLayoutEffect(()=>{if(settle.current){settle.current=false;base.current={key,stamp};latest.current.dirty=false;rerender(n=>n+1);}});
 const loaded=()=>{settle.current=true;setPending(null);};
 const saved=(reportId)=>{
   if(latest.current.stamp===stamp)settle.current=true;
   const payload={id:String(reportId),label,by:session?.user?.name||session?.user?.initials||"Colleague"};
   channel.current?.send({type:"broadcast",event:"report-saved",payload});
 };
 async function refresh(event,force=false){
   const current=latest.current;if(!mounted.current)return;
   current.onList();
   if(!current.id||String(event.id)!==current.id)return;
   if((current.dirty||current.busy)&&!force){setPending(event);return;}
   const start=current.stamp,target=current.id;
   const safe=()=>mounted.current&&latest.current.id===target&&latest.current.stamp===start&&!latest.current.busy;
   await current.onLoad(target,safe);
   if(safe()){setPending(null);setNotice(event.by?`${event.by} saved this report · refreshed`:"Report refreshed");}
   else if(mounted.current&&latest.current.id===target)setPending(event);
 }
 const refreshRef=useRef(refresh);refreshRef.current=refresh;
 useEffect(()=>{
   mounted.current=true;if(!session?.user)return;
   const key=crypto.randomUUID(),ch=supabase.channel("broker-reports-live-v1",{config:{presence:{key}}});channel.current=ch;
   let active=true,ready=false;
   ch.on("presence",{event:"sync"},()=>{if(active)setPeers(Object.entries(ch.presenceState()).flatMap(([k,rows])=>k===key?[]:rows).filter(p=>String(p.userId)!==String(session.user.id)));});
   ch.on("broadcast",{event:"report-saved"},({payload})=>{if(active)refreshRef.current(payload);});
   const publish=()=>{if(ready&&active){const c=latest.current;ch.track({userId:session.user.id,name:session.user.name,initials:session.user.initials,color:session.user.color,reportId:c.id,label:c.label,dirty:c.dirty});}};
   ch._reportPublish=publish;
   ch.subscribe(s=>{if(!active)return;ready=s==="SUBSCRIBED";setStatus(ready?"Live":"Reconnecting");if(ready){publish();latest.current.onList();const c=latest.current;if(c.id)refreshRef.current({id:c.id});}});
   return()=>{active=false;ready=false;mounted.current=false;channel.current=null;supabase.removeChannel(ch);};
 },[session?.user?.id]);
 useEffect(()=>{const t=setTimeout(()=>channel.current?._reportPublish?.(),300);return()=>clearTimeout(t);},[key,label,dirty,stamp]);
 return {peers,status,pending,notice,dirty,loaded,saved,canSave:()=>{if(pending){setNotice("A colleague saved a newer version. Load it before saving over this report.");return false;}return true;},loadLatest:()=>refreshRef.current(pending,true)};
}
export function ReportLiveStatus({live}){
 return <div className="no-export" style={{padding:"6px 12px",background:"#10223a",borderBottom:"1px solid #294767",color:"#b7d9fa",fontSize:11,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
 <b style={{color:live.status==="Live"?"#6ee7b7":"#facc85"}}>● Reports · {live.status}</b>
 {!live.peers.length&&<span>No other users in Reports</span>}
 {live.peers.map((p,i)=><span key={p.userId+":"+i}><b style={{color:p.color||"#85caff"}}>{p.initials||p.name}</b> · {p.label}{p.dirty?" · unsaved changes":" · viewing"}</span>)}
 {live.pending?<span style={{color:"#cceaff"}}>{live.pending.by||"A colleague"} saved a newer version. Your edits are kept. <button type="button" onClick={live.loadLatest} style={{background:"#225b88",color:"white",border:"1px solid #6ba4ce",borderRadius:4,padding:"3px 8px",cursor:"pointer"}}>Load latest (replaces your edits)</button></span>:live.notice&&<span>{live.notice}</span>}
 </div>;
}
