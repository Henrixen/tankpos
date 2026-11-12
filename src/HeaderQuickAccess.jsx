import React,{useEffect,useRef,useState} from 'react';
import {supabase} from './supabaseclient';

const blue='#8fc9ff';
const FullFleet=React.lazy(()=>import('./FleetTab'));
const field={width:'100%',boxSizing:'border-box',background:'#081425',border:'1px solid #29425e',borderRadius:5,color:'#e0eeff',fontFamily:'inherit',fontSize:12,padding:'6px 8px'};
const btn={...field,width:'auto',cursor:'pointer',whiteSpace:'nowrap',color:blue};
const INTERUKC_KEY='signal_interukc_config';
const INTERUKC_DEFAULT={dwtMin:15,dwtMax:21,owners:['Stenersen','Furetank','Carl F','Maersk','Harren','Navix','Donso','Relet'],reletsFrom:['Exxon','Shell','Circle K','Essar','Total','CSS SA']};
const readInter=()=>{try{return {...INTERUKC_DEFAULT,...JSON.parse(localStorage.getItem(INTERUKC_KEY)||'null')}}catch{return INTERUKC_DEFAULT}};
const matchInter=(value,names)=>names.some(n=>n&&String(value||'').toLowerCase().includes(String(n).toLowerCase()));
const fmt=n=>n==null?'—':Number(n).toLocaleString('en-US');
const isOperator=(r,cfg)=>matchInter(r.operator,cfg.owners)||matchInter(r.owner,cfg.owners);
const isRelet=(r,cfg)=>matchInter(r.operator,cfg.reletsFrom)||matchInter(r.owner,cfg.reletsFrom);
export default function HeaderQuickAccess({showFleet=true,showWorklist=true}){
 const [fullFleet,setFullFleet]=useState(false);
 const [interMode,setInterMode]=useState(false),[interCfg,setInterCfg]=useState(readInter);
 useEffect(()=>{let alive=true;const sync=()=>{supabase.from('tag_settings').select('value').eq('key',INTERUKC_KEY).maybeSingle().then(({data,error})=>{if(!alive||error)return;if(data?.value){const cfg={...INTERUKC_DEFAULT,...data.value};setInterCfg(cfg);localStorage.setItem(INTERUKC_KEY,JSON.stringify(cfg))}})};sync();const local=e=>setInterCfg({...INTERUKC_DEFAULT,...e.detail});window.addEventListener('signal-interukc-updated',local);return()=>{alive=false;window.removeEventListener('signal-interukc-updated',local)}},[open]);
 const [open,setOpen]=useState(null),[query,setQuery]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [work,setWork]=useState(''),[workLoaded,setWorkLoaded]=useState(false),[workStatus,setWorkStatus]=useState('');
 const root=useRef(null),editor=useRef(null),saveTimer=useRef(null);
 useEffect(()=>{const outside=e=>{if(root.current&&!root.current.contains(e.target))setOpen(null)};const esc=e=>{if(e.key==='Escape')setOpen(null)};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',esc);clearTimeout(saveTimer.current)}},[]);
 useEffect(()=>{if(open!=='fleet'||fullFleet)return;let alive=true;const t=setTimeout(async()=>{
  setBusy(true);setError('');try{
   const q=query.trim().replace(/[%_,()]/g,' ').trim();
   const columns='vessel,imo,dwt,built,cbm,coating,operator,owner,flag,ice_class';
   let result=[];
   if(interMode){
    const names=[...(interCfg.owners||[]),...(interCfg.reletsFrom||[])].map(x=>String(x).trim()).filter(Boolean);
    if(names.length){
     const min=Number(interCfg.dwtMin)*1000,max=Number(interCfg.dwtMax)*1000;
     const clauses=names.flatMap(n=>{const safe=n.replace(/[%,().]/g,' ').trim();return safe?[`operator.ilike.%${safe}%`,`owner.ilike.%${safe}%`]:[]});
     let req=supabase.from('vessels_db').select(columns).gte('dwt',min).lte('dwt',max).or(clauses.join(',')).order('operator').order('vessel').limit(1000);
     const {data,error}=await req;if(error)throw error;
     result=(data||[]).filter(r=>!q||[r.vessel,r.imo,r.operator,r.owner].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))).slice(0,500);
    }
   }else{
    let req=supabase.from('vessels_db').select(columns).order('vessel').limit(80);
    if(q)req=/^\d+$/.test(q)?req.eq('imo',q):req.or(`vessel.ilike.%${q}%,operator.ilike.%${q}%,owner.ilike.%${q}%`);
    const {data,error}=await req;if(error)throw error;result=data||[];
   }
   if(alive)setRows(result);
  }catch(e){if(alive)setError(e.message)}finally{if(alive)setBusy(false)}
 },200);return()=>{alive=false;clearTimeout(t)}},[open,query,interMode,interCfg,fullFleet]);
 useEffect(()=>{if(open!=='work'||workLoaded)return;let alive=true;supabase.from('dashboard').select('value').eq('key','worklist').maybeSingle().then(({data,error})=>{if(!alive)return;if(error)setWorkStatus(error.message);else{const html=data?.value||localStorage.getItem('signal_worklist')||'';setWork(html);if(editor.current)editor.current.innerHTML=html;setWorkLoaded(true)}});return()=>{alive=false}},[open,workLoaded]);
 async function saveWork(){const value=editor.current?.innerHTML||'';try{const {error}=await supabase.from('dashboard').upsert({key:'worklist',value},{onConflict:'key'});if(error)throw error;localStorage.setItem('signal_worklist',value);setWorkStatus('Saved')}catch(e){setWorkStatus('Save failed: '+e.message)}}
 const displayRows=interMode?[...rows].sort((a,b)=>Number(isOperator(b,interCfg))-Number(isOperator(a,interCfg))||String(a.operator||'').localeCompare(String(b.operator||''))||String(a.vessel||'').localeCompare(String(b.vessel||''))):rows;
 const pop={position:'absolute',top:'calc(100% + 11px)',right:0,zIndex:9999,width:'min(740px,85vw)',maxHeight:'min(75vh,650px)',overflow:'auto',background:'#091629',border:'1px solid #345477',borderRadius:8,boxShadow:'0 15px 45px #000b',padding:14,color:'#dcecff'};
 return <div ref={root} style={{display:'flex',alignItems:'center',gap:7,position:'relative',minWidth:0,height:'100%'}}>
 {showFleet&&<div style={{display:'flex',alignItems:'center',gap:5,minWidth:0}}><span style={{fontSize:10,fontWeight:800,color:blue,letterSpacing:'.07em',whiteSpace:'nowrap'}}>FLEET</span><input aria-label="Quick fleet search" value={query} onFocus={()=>setOpen('fleet')} onChange={e=>{setQuery(e.target.value);setOpen('fleet')}} placeholder="Vessel / IMO / Operator / Owner…" style={{...field,width:145,minWidth:80}}/><button title="Open fleet database" style={btn} onClick={()=>setOpen(o=>o==='fleet'?null:'fleet')}>▾</button></div>}
 {showWorklist&&<button style={{...btn,fontSize:10,fontWeight:800,letterSpacing:'.05em'}} onClick={()=>setOpen(o=>o==='work'?null:'work')}>WORKLIST ▾</button>}
 {open==='fleet'&&showFleet&&<div style={{...pop,...(fullFleet?{width:'min(1250px,92vw)',maxHeight:'80vh'}:{})}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}><b style={{color:blue,fontSize:13}}>Fleet database · quick lookup</b><div style={{display:'flex',gap:6}}><button style={{...btn,background:interMode?'rgba(88,166,255,.22)':btn.background,borderColor:interMode?'#58a6ff':'#29425e'}} onClick={()=>{setInterMode(v=>!v);setFullFleet(false)}}>INTER UKC {interMode?'✓':'▾'}</button><button style={btn} onClick={()=>setFullFleet(v=>!v)}>{fullFleet?'Quick lookup':'Full Fleet / Filters'}</button><button style={btn} onClick={()=>setOpen(null)}>✕</button></div></div>{fullFleet?<React.Suspense fallback={<div>Loading Fleet…</div>}><FullFleet/></React.Suspense>:<><input autoFocus placeholder="Search vessel, IMO, operator or owner" value={query} onChange={e=>setQuery(e.target.value)} style={{...field,marginBottom:10}}/>{interMode&&<div style={{background:'#0c1d32',border:'1px solid #29425e',borderRadius:6,padding:10,marginBottom:10,fontSize:11}}>
 <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:6}}><b style={{color:blue}}>INTER UKC POOL</b><span style={{color:'#91a9c5'}}>{interCfg.dwtMin}–{interCfg.dwtMax}k DWT · sorted by operator</span></div>
 <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>{[['Operators',interCfg.owners],['Relets',interCfg.reletsFrom]].map(([label,names])=><div key={label}><b style={{color:'#cde6ff'}}>{label}</b><div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>{[...(names||[])].sort((a,b)=>a.localeCompare(b)).map(n=><span key={n} style={{padding:'3px 7px',background:'#142c48',border:'1px solid #2b4d70',borderRadius:4,color:'#bcd9f5'}}>{n}</span>)}</div></div>)}</div>
 </div>}{busy&&<span aria-live="polite" style={{position:'absolute',right:20,top:76,fontSize:10,color:'#91a9c5',pointerEvents:'none',background:'#091629',padding:'2px 5px',borderRadius:3}}>Searching…</span>}{error&&<div style={{fontSize:11,color:'#ff9999'}}>{error}</div>}<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr>{['Vessel','IMO','DWT','Built','CBM','Coating','Operator','Owner'].map(h=><th key={h} style={{textAlign:'left',padding:7,borderBottom:'1px solid #345477',color:blue}}>{h}</th>)}</tr></thead><tbody>{displayRows.map((r,i)=><React.Fragment key={`${r.imo}-${i}`}>{interMode&&(i===0||isOperator(r,interCfg)!==isOperator(displayRows[i-1],interCfg))&&<tr><td colSpan={8} style={{padding:'9px 7px',background:'#102640',color:blue,fontWeight:700}}>{isOperator(r,interCfg)?'OPERATORS':'RELETS'}</td></tr>}<tr>{[r.vessel,r.imo,fmt(r.dwt),r.built,fmt(r.cbm),r.coating,r.operator,r.owner].map((v,j)=><td key={j} title={String(v||'')} style={{padding:7,borderBottom:'1px solid #20344d',whiteSpace:'nowrap'}}>{v||'—'}</td>)}</tr></React.Fragment>)}</tbody></table></div>{!busy&&rows.length===0&&<div style={{padding:10,fontSize:11}}>No matching vessels</div>}{!interMode&&rows.length===80&&<div style={{fontSize:10,marginTop:8,color:'#91a9c5'}}>Showing first 80 matches. Refine your search for more.</div>}</>}</div>}
 {open==='work'&&showWorklist&&<div style={{...pop,width:'min(470px,85vw)'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}><b style={{color:blue,fontSize:13}}>Worklist</b><button style={btn} onClick={()=>setOpen(null)}>✕</button></div><div ref={editor} contentEditable suppressContentEditableWarning onInput={()=>{setWorkStatus('Unsaved');clearTimeout(saveTimer.current);saveTimer.current=setTimeout(saveWork,900)}} onBlur={saveWork} data-placeholder="Tasks, reminders, to-do…" style={{minHeight:200,maxHeight:450,overflowY:'auto',whiteSpace:'pre-wrap',outline:'none',background:'#081425',border:'1px solid #29425e',borderRadius:5,padding:12,fontSize:12,color:'#fff'}}/><div style={{fontSize:10,color:'#91a9c5',marginTop:7}}>{workStatus||'Synced with Notes worklist via Supabase'}</div></div>}
 </div>;
}
