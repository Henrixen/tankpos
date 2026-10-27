import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {supabase} from './supabaseclient';

// Session tokens stay in memory; caches contain only personal view preferences.
let session=null,view='',peers=[],liveState='Connecting',preferenceError='',conflict=null,pendingWrites=0;
let activityChannel=null,activityCleanup=null,conflictResolve=null;
const listeners=new Set(),sessionListeners=new Set(),flushListeners=new Set();
let snapshot={session,peers,liveState,preferenceError,conflict};
const emit=()=>{snapshot={session,peers,liveState,preferenceError,conflict};listeners.forEach(fn=>fn());};
const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
const getSnapshot=()=>snapshot;
export const getBrokerSession=()=>session;
export const subscribeBrokerSession=fn=>{sessionListeners.add(fn);return()=>sessionListeners.delete(fn);};
export const useBrokerSession=()=>useSyncExternalStore(subscribeBrokerSession,getBrokerSession,getBrokerSession);
export const brokerRpc=async(name,args)=>{
 const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message||'Database request failed');return data;
};
export async function brokerLogin(pin){
 await flushPreferences();
 const data=await brokerRpc('broker_pin_login',{p_pin:pin});
 if(!data?.token||!data?.user?.id)throw new Error(data?.error||'PIN login failed. Run broker_workspace.sql first.');
 if(conflictResolve){conflictResolve(false);conflictResolve=null;conflict=null;}
 session={user:data.user,token:data.token,settings:data.settings||{}};
 try{localStorage.setItem('signal_user',String(data.user.initials||'').toUpperCase());}catch{}
 sessionListeners.forEach(fn=>fn());emit();return data.user;
}
export function isBrokerEditing(){
 const el=typeof document!=='undefined'?document.activeElement:null;
 return !!(el&&el.closest?.('[data-broker-scope]')&&el.matches?.('input,textarea,select,[contenteditable="true"]'));
}
export const liveCanApply=()=>!isBrokerEditing()&&pendingWrites===0&&!conflict;
export function beginBrokerWrite(){pendingWrites++;return()=>{pendingWrites=Math.max(0,pendingWrites-1);flushListeners.forEach(fn=>fn());};}
export function chooseBrokerConflict(detail){
 // Serialize conflicts rather than replacing another user's unresolved choice.
 return new Promise(resolve=>{
  const open=()=>{if(conflict){setTimeout(open,150);return;}conflict=detail;conflictResolve=resolve;emit();};open();
 });
}
function answerConflict(overwrite){const resolve=conflictResolve;conflictResolve=null;conflict=null;emit();resolve?.(overwrite);flushListeners.forEach(fn=>fn());}
export function BrokerConflictDialog(){
 const state=useSyncExternalStore(subscribe,getSnapshot,getSnapshot);if(!state.conflict)return null;
 const c=state.conflict;
 return <div role="dialog" aria-modal="true" aria-label="Another user changed this cell" style={{position:'fixed',inset:0,zIndex:999999,background:'#0008',display:'grid',placeItems:'center'}}>
  <div style={{background:'#0b172a',color:'#e8f2ff',padding:20,border:'1px solid #e6a854',borderRadius:8,width:460,maxWidth:'92vw'}}>
   <b>Another user changed this cell</b><div style={{margin:'10px 0'}}>{c.record} · {c.field}</div>
   <div>Current saved value:</div><pre style={{whiteSpace:'pre-wrap',userSelect:'text',maxHeight:130,overflow:'auto'}}>{String(c.theirs??'(blank)')}</pre>
   <div>Your edit:</div><pre style={{whiteSpace:'pre-wrap',userSelect:'text',maxHeight:130,overflow:'auto'}}>{String(c.mine??'(blank)')}</pre>
   <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button onClick={()=>answerConflict(false)}>Use saved value</button><button onClick={()=>answerConflict(true)}>Save my edit instead</button></div>
  </div>
 </div>;
}

const preferenceJobs=new Map(),preferenceFlights=new Map();
function queuePreferences(scope,patch){
 if(!session)return;const key=session.user.id+':'+scope,prior=preferenceJobs.get(key);
 clearTimeout(prior?.timer);
 const job={session,scope,patch:{...(prior?.patch||{}),...patch},timer:null};
 preferenceJobs.set(key,job);job.timer=setTimeout(()=>sendPreferences(key,job),850);
}
async function sendPreferences(key,job){
 if(job.sending)return job.sending;
 if(preferenceJobs.get(key)!==job)return;
 clearTimeout(job.timer);
 const prior=preferenceFlights.get(key);
 job.sending=(async()=>{
 await prior?.catch(()=>{});
 try{
  const value=await brokerRpc('broker_workspace_save',{p_token:job.session.token,p_scope:job.scope,p_patch:job.patch});
  if(session?.user.id===job.session.user.id){session.settings[job.scope]=value;preferenceError='';emit();}
  if(preferenceJobs.get(key)===job)preferenceJobs.delete(key);
 }catch(error){
  if(session?.user.id===job.session.user.id){preferenceError='View settings not saved: '+error.message;emit();}
  // Retain the job for explicit retry / the next setting change.
 }
 })();
 preferenceFlights.set(key,job.sending);
 try{await job.sending;}finally{if(preferenceFlights.get(key)===job.sending)preferenceFlights.delete(key);job.sending=null;}
}
export async function flushPreferences(){await Promise.all([...preferenceJobs].map(([key,job])=>sendPreferences(key,job)));}
if(typeof window!=='undefined'){
 // Keepalive writes are small, user-owned settings patches; never vessel tables.
 window.addEventListener('pagehide',()=>{
  const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  for(const job of preferenceJobs.values()){
   try{fetch(url+'/rest/v1/rpc/broker_workspace_save',{method:'POST',keepalive:true,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_token:job.session.token,p_scope:job.scope,p_patch:job.patch})}).catch(()=>{});}catch{}
  }
 });
}
export function useWorkspacePreferences(scope,state,apply,defaults){
 const current=useBrokerSession(),applyRef=useRef(apply),last=useRef(''),[hydrated,setHydrated]=useState(null);
 applyRef.current=apply;const serialized=JSON.stringify(state);
 useEffect(()=>{
  setHydrated(null);if(!current)return;
  const saved={...defaults,...(current.settings[scope]||{})};last.current=JSON.stringify(saved);
  applyRef.current(saved);setHydrated(current.user.id);
 },[current?.user.id,scope]);
 useEffect(()=>{
  if(!current||hydrated!==current.user.id||serialized===last.current)return;
  let previous={};try{previous=JSON.parse(last.current);}catch{}
  const patch={};Object.keys(state).forEach(key=>{if(JSON.stringify(state[key])!==JSON.stringify(previous[key]))patch[key]=state[key];});
  last.current=serialized;if(!Object.keys(patch).length)return;
  try{localStorage.setItem('broker:workspace:'+current.user.id+':'+scope,serialized);}catch{}
  queuePreferences(scope,patch);
 },[serialized,hydrated,current?.user.id,scope]);
 useEffect(()=>()=>{flushPreferences();},[]);
 return !!current&&hydrated===current.user.id;
}

function editingDetail(){
 const el=document.activeElement;if(!isBrokerEditing())return null;
 const scope=el.closest('[data-broker-scope]')?.dataset.brokerScope;
 const row=el.closest('[data-broker-record]'),td=el.closest('td');
 const header=td?.closest('table')?.querySelectorAll('thead th')?.[td.cellIndex]?.textContent?.trim();
 return {scope,record:row?.dataset.brokerLabel||row?.dataset.brokerRecord||'Filters / controls',field:el.dataset.brokerField||td?.dataset.brokerField||header||el.getAttribute('aria-label')||el.placeholder||'Editing'};
}
function publishActivity(){
 if(!activityChannel||!session)return;
 activityChannel.track({sessionId:activityChannel._brokerKey,userId:session.user.id,name:session.user.name,initials:session.user.initials,color:session.user.color,view,editing:editingDetail()}).catch(()=>{});
}
export function useBrokerActivity(scope){
 const current=useBrokerSession();
 useEffect(()=>{
  if(!current)return;view=scope||'';publishActivity();
  return()=>{view='';publishActivity();};
 },[scope,current?.user.id]);
 useEffect(()=>{
  if(!current)return;
  activityCleanup?.();
  const key=crypto.randomUUID();
  const channel=supabase.channel('broker-workspace-presence-v1',{config:{presence:{key}}});channel._brokerKey=key;activityChannel=channel;
  channel.on('presence',{event:'sync'},()=>{peers=Object.values(channel.presenceState()).flat().filter(p=>p.sessionId!==key);emit();}).subscribe(status=>{if(status==='SUBSCRIBED')publishActivity();});
  let blurTimer;
  const focus=()=>{clearTimeout(blurTimer);publishActivity();};
  const blur=()=>{clearTimeout(blurTimer);blurTimer=setTimeout(()=>{publishActivity();flushListeners.forEach(fn=>fn());},180);};
  document.addEventListener('focusin',focus,true);document.addEventListener('focusout',blur,true);
  const cleanup=()=>{clearTimeout(blurTimer);document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',blur,true);if(activityChannel===channel)activityChannel=null;supabase.removeChannel(channel);peers=[];emit();};
  activityCleanup=cleanup;return()=>{cleanup();if(activityCleanup===cleanup)activityCleanup=null;};
 },[current?.user.id]);
}
export function BrokerActivity({scope}){
 const state=useSyncExternalStore(subscribe,getSnapshot,getSnapshot),[open,setOpen]=useState(false);
 if(!state.session)return null;
 const relevant=state.peers.filter(p=>p.view===scope||p.editing?.scope===scope),editing=relevant.filter(p=>p.editing?.scope===scope);
 return <div style={{marginLeft:'auto',position:'relative',fontSize:11,color:'#a8c9ec',maxWidth:320,alignSelf:'center'}}>
  <button type="button" onClick={()=>setOpen(v=>!v)} style={{background:'#10223b',border:'1px solid #34577b',borderRadius:5,color:'#b7d9fa',padding:'5px 9px',font:'inherit',cursor:'pointer'}} title="See who is online and editing">
   <span style={{color:state.liveState==='Live'?'#4ade80':'#e6a854'}}>●</span> {state.liveState} · {editing.length?editing.map(p=>p.initials).join(', ')+' editing':relevant.length+' other online'} ▾
  </button>
  {open&&<div style={{position:'absolute',right:0,top:'100%',marginTop:5,width:310,maxWidth:'85vw',maxHeight:250,overflowY:'auto',zIndex:20000,background:'#0b172a',border:'1px solid #34577b',borderRadius:6,padding:10,boxShadow:'0 8px 24px #0008'}}>
   <div style={{marginBottom:7,fontWeight:700}}>Online / editing · {scope}</div>
   <div>{state.session.user.name} · you</div>
   {relevant.map((p,i)=><div key={p.sessionId||i} style={{padding:'6px 0',borderTop:'1px solid #203853',marginTop:5}}><b style={{color:p.color||'#79c0ff'}}>{p.name||p.initials}</b><div>{p.editing?`${p.editing.record} · ${p.editing.field}`:'Viewing '+scope}</div></div>)}
   {!relevant.length&&<div style={{marginTop:7}}>No other colleagues in this view.</div>}
   <div style={{fontSize:10,marginTop:8,color:'#849bb4'}}>Editing indicators are advisory; conflicting saves require a choice.</div>
  </div>}
  {state.preferenceError&&<div role="alert" style={{color:'#f8b36b',fontSize:10,maxWidth:310}}>{state.preferenceError} <button onClick={flushPreferences}>Retry</button></div>}
 </div>;
}

export function liveIdentity(row){
 return {imo:row?.imo_no??row?.imo??row?.imo_number??null,name:row?.vessel_name??row?.vessel??row?.ship_name??null};
}
export function useBrokerLiveData(onCargo,onPositions,onReconnect){
 const current=useBrokerSession(),callbacks=useRef({onCargo,onPositions,onReconnect});callbacks.current={onCargo,onPositions,onReconnect};
 useEffect(()=>{
  if(!current)return;
  let stopped=false,timer,retryTimer,catchupTimer,busy=false,catching=false,connected=false,needsReconcile=true,failures=0,catchupFailures=0,dataError='',catchupError='';
  const cargo=new Map(),positions=new Map();
  const status=()=>{if(stopped)return;liveState=!connected?'Reconnecting':dataError?'Sync retry: '+dataError:catchupError?'Live · catch-up retry':'Live';emit();};
  // A bounded batch window: more events do not keep postponing an existing batch.
  const schedule=()=>{if(stopped||timer)return;timer=setTimeout(()=>{timer=null;pump();},120);};
  const restore=(map,entries)=>{for(const [key,value]of entries)if(!map.has(key))map.set(key,value);};
  async function pump(){
   if(stopped||busy||retryTimer)return;
   if(!liveCanApply()){schedule();return;}
   busy=true;
   try{
    if(cargo.size){const batch=[...cargo];cargo.clear();try{await callbacks.current.onCargo(batch.map(x=>x[1]));}catch(error){restore(cargo,batch);throw error;}}
    if(positions.size){const batch=[...positions];positions.clear();try{await callbacks.current.onPositions(batch.map(x=>x[1]));}catch(error){restore(positions,batch);throw error;}}
    failures=0;dataError='';status();
   }catch(error){
    dataError=error.message||String(error);status();console.error('Broker live sync:',dataError,error);
    const delay=Math.min(30000,1000*2**Math.min(failures++,5));retryTimer=setTimeout(()=>{retryTimer=null;schedule();},delay);
   }finally{busy=false;if(!stopped&&!retryTimer&&(cargo.size||positions.size))schedule();}
  }
  function scheduleCatchup(delay=400){if(stopped||catchupTimer||catching)return;catchupTimer=setTimeout(()=>{catchupTimer=null;catchup();},delay);}
  async function catchup(){
   if(stopped||catching||!needsReconcile)return;
   if(!connected||!liveCanApply()){scheduleCatchup(500);return;}
   catching=true;needsReconcile=false;
   try{await callbacks.current.onReconnect();catchupFailures=0;catchupError='';status();}
   catch(error){needsReconcile=true;catchupError=error.message||String(error);status();console.error('Broker catch-up:',catchupError,error);}
   finally{catching=false;if(!stopped&&needsReconcile&&catchupFailures<3)scheduleCatchup(Math.min(30000,2000*2**catchupFailures++));}
  }
  const channel=supabase.channel('broker-data-'+crypto.randomUUID());
  channel.on('postgres_changes',{event:'*',schema:'public',table:'cargoes'},event=>{const id=event.new?.id??event.old?.id;if(id!=null)cargo.set(String(id),event);schedule();});
  for(const table of ['positions','positions_external','vessel_overrides'])channel.on('postgres_changes',{event:'*',schema:'public',table},event=>{
   const ident=liveIdentity(event.eventType==='DELETE'?event.old:event.new);
   if(ident.imo||ident.name){if(table==='vessel_overrides')ident.overrideEvent=event;positions.set(table+':'+String(ident.imo||ident.name),ident);}
   else{needsReconcile=true;scheduleCatchup();}schedule();
  });
  channel.subscribe(state=>{
   if(stopped)return;connected=state==='SUBSCRIBED';
   if(connected){needsReconcile=true;catchupFailures=0;schedule();scheduleCatchup();}status();
  });
  const visible=()=>{if(document.visibilityState==='visible'){needsReconcile=true;catchupFailures=0;scheduleCatchup();schedule();}};
  const flush=()=>{schedule();if(needsReconcile)scheduleCatchup();};
  document.addEventListener('visibilitychange',visible);flushListeners.add(flush);
  return()=>{stopped=true;clearTimeout(timer);clearTimeout(retryTimer);clearTimeout(catchupTimer);flushListeners.delete(flush);document.removeEventListener('visibilitychange',visible);supabase.removeChannel(channel);};
 },[current?.user.id]);
}

// A request may finish after typing begins: defer the React state merge too.
export function applyWhenIdle(callback){
 return new Promise((resolve,reject)=>{const apply=()=>{if(!liveCanApply()){setTimeout(apply,150);return;}try{resolve(callback());}catch(error){reject(error);}};apply();});
}
export function personalCacheGet(key){try{return session?localStorage.getItem('broker:'+session.user.id+':'+key):null;}catch{return null;}}
export function personalCacheSet(key,value){try{if(session)localStorage.setItem('broker:'+session.user.id+':'+key,value);}catch{}}
export function personalCacheRemove(key){try{if(session)localStorage.removeItem('broker:'+session.user.id+':'+key);}catch{}}
