import React,{useEffect,useMemo,useRef,useState,Suspense} from "react";
import { C } from "./constants";
import { toTCase,normaliseQty,fmtDateShort,fmtFreight } from "./utils";
import { supabase } from "./supabaseclient";

const EC=React.lazy(()=>import("./EC"));
const ParsePanel=React.lazy(()=>import("./ParsePanel"));
const RateMatrixCard=React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrixCard})));
const RateMatrixBunkerInput=React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrixBunkerInput})));

const REGIONS=["ECI","ECSAM-NEB","Med","MED-BSEA","NEA","NWE-BALTIC","RSEA","SEA","USAC-GLAKES","USG-CARIBS","WAF-SAF","WC AMERICAS","WCI-AG"];
const PRESET_TAGS=["AG","BASF","CPP","DPP","EX ASIA","MED","OUTSIDER EUROPE","PARCEL","PNC","SPACE ASIA-EUROPE","SUB 10","TA","TAE","TAW","UKC","WAF"];
function tagList(){try{const x=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");return[...new Set([...PRESET_TAGS,...x].map(v=>String(v||"").toUpperCase()).filter(Boolean))].sort();}catch{return PRESET_TAGS;}}
const card={background:C.bg2,border:"1px solid "+C.bd,borderRadius:7};
const btn=(active=false)=>({fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:3,border:"1px solid "+(active?C.blue:C.bd),background:active?"rgba(88,166,255,.18)":C.bg3,color:active?"#d9ecff":"#9fc3f5",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
const input={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"4px 7px",outline:"none",boxSizing:"border-box"};
function weekBounds(offset=0){const n=new Date();n.setHours(0,0,0,0);const dow=(n.getDay()+6)%7;const m=new Date(n);m.setDate(n.getDate()-dow+offset*7);const s=new Date(m);s.setDate(m.getDate()+6);return[m,s];}
function CargoMonthChart({data,total}){
 const vals=data||[],max=Math.max(1,...vals.map(x=>x.count||0)); const W=520,H=190,L=28,R=10,T=20,B=25,iw=W-L-R,ih=H-T-B;
 const pts=vals.map((d,i)=>({x:L+(vals.length<2?0:i/(vals.length-1))*iw,y:T+ih-(d.count/max)*ih,...d}));
 const path=pts.map((p,i)=>(i?"L":"M")+p.x+" "+p.y).join(" ");
 return <div style={{...card,height:260,padding:"8px 10px",boxSizing:"border-box",minWidth:0,flex:1}}>
  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontWeight:800,color:C.dim,textTransform:"uppercase"}}><span>Cargoes entered by month</span><span style={{color:C.blue}}>{total||0} total</span></div>
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:"100%",height:215,display:"block"}}>
   {[0,.25,.5,.75,1].map(v=><line key={v} x1={L} x2={W-R} y1={T+ih*v} y2={T+ih*v} stroke={C.bd2} strokeDasharray="3 4"/>)}
   {pts.length>1&&<path d={path} fill="none" stroke={C.blue} strokeWidth="2" vectorEffect="non-scaling-stroke"/>}
   {pts.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="2.5" fill="#79c0ff"/>{(i===0||i===pts.length-1||i%3===0)&&<text x={p.x} y={H-5} textAnchor="middle" fontSize="9" fill={C.faint}>{new Date(p.year,p.month,1).toLocaleString("en",{month:"short"})}</text>}</g>)}
  </svg>
 </div>
}
function BunkerHeader(){
 const [b,setB]=useState(null);
 useEffect(()=>{supabase.from("dashboard").select("value").eq("key","last-bunker-prices").maybeSingle().then(({data})=>setB(data?.value||null));},[]);
 return <div style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:C.faint}}>BUNKER <Suspense fallback={null}><RateMatrixBunkerInput value={b?.ARA_MGO||b?.ara_mgo||null}/></Suspense></div>;
}
function useMonthly(){
 const [week,setWeek]=useState({thisWk:0,lastWk:0}),[monthly,setMonthly]=useState([]);
 useEffect(()=>{(async()=>{const [tm,ts]=weekBounds(0),[lm,ls]=weekBounds(-1),fmt=d=>d.toISOString().slice(0,10);
  const [{count:a},{count:b}]=await Promise.all([supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",fmt(tm)).lte("updated",fmt(ts)+"T23:59:59"),supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",fmt(lm)).lte("updated",fmt(ls)+"T23:59:59")]);setWeek({thisWk:a||0,lastWk:b||0});
  const now=new Date(),arr=[];for(let i=23;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),n=new Date(d.getFullYear(),d.getMonth()+1,1);const {count}=await supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",d.toISOString().slice(0,10)).lt("updated",n.toISOString().slice(0,10));arr.push({year:d.getFullYear(),month:d.getMonth(),count:count||0});}setMonthly(arr);
 })();},[]);
 return {week,monthly};
}
function TagCell({id,value,onUpdate}){
 const [open,setOpen]=useState(false),[pos,setPos]=useState({top:0,left:0}),ref=useRef(null);
 function show(){if(ref.current){const r=ref.current.getBoundingClientRect(),z=parseFloat(getComputedStyle(document.body).zoom||"1")||1,w=160*z,h=Math.min(360,72+tagList().length*27)*z,m=12;let l=r.left-w-6;if(l<m)l=r.right+6;l=Math.max(m,Math.min(l,innerWidth-w-m));let t=Math.max(m,Math.min(r.top-8,innerHeight-h-m));setPos({left:l/z,top:t/z});}setOpen(true);}
 return <><td style={{textAlign:"center",padding:"0 3px"}}><button ref={ref} onClick={show} style={{background:"transparent",border:"1px solid "+C.bd,borderRadius:3,color:value?C.blue:C.faint,fontSize:9,cursor:"pointer",minWidth:20}}>{value||"+"}</button></td>
 {open&&<><div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:19990}}/><div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:19999,width:160,maxHeight:360,overflowY:"auto",background:"#071223",border:"1px solid "+C.bd,borderRadius:7,padding:5,boxShadow:"0 12px 30px rgba(0,0,0,.7)"}}>
 {tagList().map(t=><button key={t} onClick={()=>{onUpdate(id,"tag",value===t?"":t);setOpen(false)}} style={{display:"block",width:"100%",textAlign:"left",padding:"4px 7px",marginBottom:2,background:value===t?"rgba(88,166,255,.16)":"transparent",border:"1px solid "+(value===t?C.blue:C.bd2),borderRadius:3,color:value===t?"#fff":"#9fc3f5",fontSize:9,fontWeight:700,cursor:"pointer"}}>{t}</button>)}</div></>}</>;
}
function RegionCell({value,onSave}){
 const [edit,setEdit]=useState(false),[draft,setDraft]=useState(value||""),ref=useRef(null);
 const matches=REGIONS.filter(r=>!draft||r.toLowerCase().startsWith(draft.toLowerCase())||r.toLowerCase().includes(draft.toLowerCase()));
 function commit(){const q=draft.trim(),hit=REGIONS.find(r=>r.toLowerCase()===q.toLowerCase())||REGIONS.find(r=>r.toLowerCase().startsWith(q.toLowerCase()));if(!q)onSave("");else if(hit)onSave(hit);setEdit(false);}
 return <td style={{padding:"0 6px",fontWeight:700,color:C.tx,position:"relative"}} onClick={()=>{setDraft(value||"");setEdit(true);setTimeout(()=>ref.current?.focus(),0)}}>
 {!edit?value||"":<input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>setTimeout(commit,80)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();commit()}if(e.key==="Escape")setEdit(false)}} style={{...input,width:"100%",height:24,fontWeight:700,textTransform:"uppercase",background:"#071223"}}/>}
 {edit&&matches.length>0&&<div style={{position:"absolute",left:4,top:29,zIndex:15000,minWidth:145,background:"#071223",border:"1px solid "+C.bd,borderRadius:5,padding:3,boxShadow:"0 8px 25px rgba(0,0,0,.65)"}}>{matches.slice(0,8).map(r=><div key={r} onMouseDown={e=>{e.preventDefault();onSave(r);setEdit(false)}} style={{padding:"4px 6px",fontSize:9,fontWeight:700,cursor:"pointer"}}>{r}</div>)}</div>}
 </td>;
}
function Editable({value,onSave,color,bold}){
 const [e,setE]=useState(false),[v,setV]=useState(value??"");useEffect(()=>setV(value??""),[value]);
 return <td onDoubleClick={()=>setE(true)} onClick={()=>setE(true)} style={{padding:"0 6px",color:color||C.tx,fontWeight:bold?700:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
 {e?<input autoFocus value={v} onChange={x=>setV(x.target.value)} onBlur={()=>{setE(false);if(v!==value)onSave(v)}} onKeyDown={x=>{if(x.key==="Enter"){x.currentTarget.blur()}if(x.key==="Escape"){setV(value??"");setE(false)}}} style={{...input,width:"100%",height:24,background:"#071223"}}/>:<span title={String(value||"")}>{value||""}</span>}</td>;
}
function AddRow({onSave,onClose,quotes=false}){
 const [r,setR]=useState({});const f=(k,p)=><input value={r[k]||""} onChange={e=>setR(x=>({...x,[k]:e.target.value}))} placeholder={p} style={{...input,width:"100%",height:25}}/>;
 const save=async()=>{if(!r.charterer&&!r.cargo)return onClose();await onSave({...r,updated:new Date().toISOString(),intelligence:quotes?(r.intelligence||""):undefined});onClose();};
 return <div style={{...card,padding:6,display:"grid",gridTemplateColumns:quotes?"90px 90px 50px 70px 120px 120px 70px 90px 100px 120px 75px 75px 110px 1fr 50px":"100px 120px 70px 90px 100px 120px 75px 75px 110px 1fr 50px",gap:4}}>
 {quotes&&<>{f("ex_region","Ex region")}{f("to_region","To region")}{f("p_and_c","P&C")}{f("intelligence","Intel")}</>}
 {f("vessel","Vessel")}{f("charterer","Charterer")}{f("qty","Qty")}{f("cargo","Cargo")}{f("load","Load")}{f("disch","Disch")}{f("from","From")}{f("to","To")}{f("freight","Freight")}{f("comment","Comment")}<button onClick={save} style={btn(true)}>Save</button>
 </div>;
}

export default function Cargoes({vessels=[],cargoes=[],cargoTotal=0,onUpdateC,onAddCargoes,onAddC,onDelC,onAddVessels,onCargoSearch}){
 const [search,setSearch]=useState(""),[status,setStatus]=useState("ALL"),[time,setTime]=useState(""),[grade,setGrade]=useState(""),[tag,setTag]=useState(""),[parseTag,setParseTag]=useState(""),[showAdd,setShowAdd]=useState(false),[sort,setSort]=useState("added"),[dir,setDir]=useState(-1);
 const {week,monthly}=useMonthly();
 const groups=useMemo(()=>{try{return JSON.parse(localStorage.getItem("signal_cargo_filter_groups")||"[]")}catch{return[]}},[cargoes.length]);
 const grades=groups.filter(g=>(g.category||"grade")==="grade");
 const tags=[...new Set(cargoes.map(c=>c.tag).filter(Boolean))].sort();
 const filtered=useMemo(()=>{const now=new Date(),[tw0]=weekBounds(0),[lw0,lw1]=weekBounds(-1);let a=cargoes.filter(c=>{
  if(status!=="ALL"&&c.status!==status)return false;if(tag&&c.tag!==tag)return false;
  if(time){const d=new Date(c.updated||0);if(time==="tw"&&d<tw0)return false;if(time==="lw"&&(d<lw0||d>lw1))return false;if(time==="ytd"&&d<new Date(now.getFullYear(),0,1))return false;}
  if(grade){const g=grades.find(x=>x.id===grade);if(g){if(!g.aliases?.some(x=>String(c.cargo||"").toLowerCase().includes(String(x).toLowerCase())))return false;}else if(!String(c.cargo||"").toLowerCase().includes(grade.toLowerCase()))return false;}
  if(search&&!JSON.stringify(c).toLowerCase().includes(search.toLowerCase()))return false;return true;});
  const field=sort==="added"?"added":sort;a=[...a].sort((x,y)=>{let A=x[field]||x.updated||"",B=y[field]||y.updated||"";if(field==="added"||field==="updated"){A=new Date(A||0).getTime();B=new Date(B||0).getTime();}return(A<B?-1:A>B?1:0)*dir});return a;
 },[cargoes,search,status,time,grade,tag,sort,dir]);
 useEffect(()=>{onCargoSearch?.(search)},[search]);
 const widths=["28px","64px","120px","135px","62px","90px","115px","150px","78px","78px","125px","1fr","70px","95px","24px","24px"];
 return <div style={{display:"flex",flexDirection:"column",gap:8}}>
  <div style={{display:"flex",gap:10,height:260}}>
   <div style={{flex:"0 0 25%",display:"flex",flexDirection:"column",gap:4}}>
    <div style={{...card,padding:"5px 8px",display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}><span style={{fontSize:9,color:C.faint,fontWeight:800}}>TAG ON PARSE</span>{tagList().map(t=><button key={t} onClick={()=>setParseTag(x=>x===t?"":t)} style={btn(parseTag===t)}>{t}</button>)}</div>
    <div style={{flex:1,minHeight:0}}><Suspense fallback={null}><ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels} onAddCargoes={async p=>{const u=localStorage.getItem("signal_user")||"H";const r=await onAddCargoes(p.map(c=>({...c,entered_by:u,tag:parseTag||c.tag||""})));setParseTag("");return r}} lockedMode="cargo" vesselDB={{}}/></Suspense></div>
   </div>
   <div style={{flex:"0 0 25%",...card,padding:8,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
    <div><b style={{fontSize:9,color:C.blue}}>GRADE</b>{grades.map(g=><button key={g.id} onClick={()=>setGrade(x=>x===g.id?"":g.id)} style={{...btn(grade===g.id),display:"block",width:"100%",marginTop:3,textAlign:"left"}}>{g.label}</button>)}</div>
    <div><b style={{fontSize:9,color:C.dim}}>PERIOD</b>{[["","All"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].map(([k,l])=><button key={l} onClick={()=>setTime(k)} style={{...btn(time===k),display:"block",width:"100%",marginTop:3,textAlign:"left"}}>{l}</button>)}</div>
    <div><b style={{fontSize:9,color:C.pink}}>TAG</b>{tags.map(t=><button key={t} onClick={()=>setTag(x=>x===t?"":t)} style={{...btn(tag===t),display:"block",width:"100%",marginTop:3,textAlign:"left"}}>{t}</button>)}</div>
   </div>
   <div style={{flex:"0 0 25%"}}><Suspense fallback={null}><RateMatrixCard collapsedHeight={260} bunkerHeader={<BunkerHeader/>}/></Suspense></div>
   <CargoMonthChart data={monthly} total={cargoTotal||cargoes.length}/>
  </div>
  <div style={{...card,padding:"5px 8px",display:"flex",gap:6,alignItems:"center"}}>
   <button onClick={()=>setShowAdd(true)} style={{...btn(),color:C.amber}}>+ Add cargo</button>
   <button onClick={()=>navigator.clipboard?.writeText(filtered.map(c=>[c.status,c.vessel,c.charterer,c.qty,c.cargo,c.load,c.disch,fmtDateShort(c.from),fmtDateShort(c.to),fmtFreight(c.freight)||c.freight,c.comment].join("\\t")).join("\\n"))} style={btn()}>Copy all</button>
   <button onClick={()=>{const csv=filtered.map(c=>[c.status,c.vessel,c.charterer,c.qty,c.cargo,c.load,c.disch,c.from,c.to,c.freight,c.comment,c.tag,c.updated].map(x=>`"${String(x||"").replaceAll('"','""')}"`).join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="cargoes.csv";a.click()}} style={btn()}>Copy CSV</button>
   <span style={{fontSize:10,color:C.faint}}>This wk <b style={{color:C.blue}}>{week.thisWk}</b>&nbsp;&nbsp; Last wk <b>{week.lastWk}</b></span>
   <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cargoes..." style={{...input,width:210}}/><span style={{fontSize:10,color:C.faint}}>Total <b style={{color:C.tx}}>{cargoTotal||cargoes.length}</b></span><select value={sort} onChange={e=>setSort(e.target.value)} style={input}><option value="added">Added</option><option value="updated">Updated</option><option value="charterer">Charterer</option><option value="from">Laycan</option></select><button onClick={()=>setDir(d=>-d)} style={btn()}>{dir>0?"▲":"▼"}</button></div>
  </div>
  {showAdd&&<AddRow onSave={onAddC} onClose={()=>setShowAdd(false)}/>}
  <div style={{...card,overflow:"hidden"}}>
   <table style={{width:"100%",tableLayout:"fixed",borderCollapse:"collapse",fontSize:11}}>
    <colgroup>{widths.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
    <thead><tr>{["","Status","Vessel","Charterer","Qty","Cargo","Load","Disch","From","To","Freight","Comment","Tag","Updated","",""].map((h,i)=><th key={i} style={{padding:"6px",textAlign:i===0||i>13?"center":"left",color:C.dim,fontSize:10,textTransform:"uppercase",borderBottom:"1px solid "+C.bd}}>{h}</th>)}</tr></thead>
    <tbody>{filtered.slice(0,200).map((c,i)=><tr key={c.id} style={{background:i%2?"rgba(18,34,57,.96)":"rgba(11,25,45,.96)"}}>
     <td style={{textAlign:"center",color:C.faint}}>[ ]</td>
     <td onClick={()=>{const o=["SUBS","FIXED","FAILED",""],n=o[(o.indexOf(c.status||"")+1)%o.length];onUpdateC(c.id,"status",n)}} style={{padding:"0 6px",fontWeight:800,cursor:"pointer",color:c.status==="FIXED"?C.green:c.status==="SUBS"?C.purple:c.status==="FAILED"?C.red:C.faint}}>{c.status||""}</td>
     <Editable value={c.vessel||""} color={C.blue} onSave={v=>onUpdateC(c.id,"vessel",v)}/>
     <Editable value={toTCase(c.charterer||"")} bold color="#79c0ff" onSave={v=>onUpdateC(c.id,"charterer",toTCase(v))}/>
     <Editable value={normaliseQty(c.qty)} color={C.amber} onSave={v=>onUpdateC(c.id,"qty",normaliseQty(v))}/>
     <Editable value={c.cargo||""} onSave={v=>onUpdateC(c.id,"cargo",v)}/>
     <Editable value={toTCase(c.load||"")} onSave={v=>onUpdateC(c.id,"load",toTCase(v))}/>
     <Editable value={toTCase(c.disch||"")} onSave={v=>onUpdateC(c.id,"disch",toTCase(v))}/>
     <Editable value={fmtDateShort(c.from)} onSave={v=>onUpdateC(c.id,"from",v)}/>
     <Editable value={fmtDateShort(c.to)} onSave={v=>onUpdateC(c.id,"to",v)}/>
     <Editable value={fmtFreight(c.freight)||c.freight||""} color="#a8e6a3" onSave={v=>onUpdateC(c.id,"freight",fmtFreight(v)||v)}/>
     <Editable value={c.comment||""} color={C.dim} onSave={v=>onUpdateC(c.id,"comment",v)}/>
     <TagCell id={c.id} value={c.tag} onUpdate={onUpdateC}/>
     <td style={{padding:"0 6px",color:C.faint,whiteSpace:"nowrap"}}>{c.updated?new Date(c.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>
     <td style={{textAlign:"center"}}>{(c.entered_by==="H"||c.entered_by==="L")&&<span style={{fontSize:8,color:c.entered_by==="H"?C.blue:C.green}}>{c.entered_by}</span>}</td>
     <td style={{textAlign:"center"}}><button onClick={()=>confirm("Delete cargo?")&&onDelC(c.id)} style={{border:0,background:"none",color:C.red,cursor:"pointer"}}>×</button></td>
    </tr>)}</tbody>
   </table>
  </div>
 </div>;
}
