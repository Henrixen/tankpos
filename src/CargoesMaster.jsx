import React,{useEffect,useMemo,useRef,useState,Suspense} from "react";
import { createPortal } from "react-dom";
import { C } from "./constants";
import { toTCase,normaliseQty,fmtDateShort,fmtFreight } from "./utils";
import { supabase } from "./supabaseclient";
import { tagsForScope, tagColor } from "./TagManagement";
import { readCargoExportFormat, readCargoExportSecondFormat, formatCargoExportRow, formatCargoWhatsAppRow, formatCargoWhatsAppTable } from "./cargoExportConfig";

const EC=React.lazy(()=>import("./EC"));
const ParsePanel=React.lazy(()=>import("./ParsePanel"));
const RateMatrixCard=React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrix})));
const RateMatrixBunkerInput=React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrixBunkerInput})));

const REGIONS=["ECI","ECSAM-NEB","Med","MED-BSEA","NEA","NWE-BALTIC","RSEA","SEA","USAC-GLAKES","USG-CARIBS","WAF-SAF","WC AMERICAS","WCI-AG"];
const PRESET_TAGS=["AG","BASF","CPP","DPP","EX ASIA","MED","OUTSIDER EUROPE","PARCEL","PNC","SPACE ASIA-EUROPE","SUB 10","TA","TAE","TAW","UKC","WAF"];
function tagList(){try{return tagsForScope("cargoes");}catch{return PRESET_TAGS;}}
const card={background:C.bg2,border:"1px solid "+C.bd,borderRadius:7};

const POS_TH={
  background:"rgba(20,30,50,0.92)",color:"rgba(120,160,220,0.58)",fontSize:11,fontWeight:700,
  textTransform:"uppercase",letterSpacing:"0.08em",padding:"7px 10px",
  borderBottom:"1px solid rgba(58,130,246,0.14)",textAlign:"left",
  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",verticalAlign:"middle"
};
const POS_TD={
  padding:"6px 10px",color:"#d9e8ff",fontWeight:500,fontSize:12,
  borderBottom:"1px solid rgba(255,255,255,0.035)",verticalAlign:"middle",
  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
  textTransform:"uppercase",lineHeight:"18px"
};
const POS_ROW=i=>i%2?"rgba(255,255,255,0.02)":"transparent";
const POS_TABLE={width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"};
const POS_WRAP={border:"1px solid "+C.bd,borderRadius:8,overflow:"auto",minWidth:0,background:C.bg2,boxShadow:"inset 0 1px 0 rgba(88,166,255,0.06)"};

const btn=(active=false)=>({fontSize:11,fontWeight:700,padding:"3px 7px",borderRadius:3,border:"1px solid "+(active?C.blue:C.bd),background:active?"rgba(88,166,255,.18)":C.bg3,color:active?"#d9ecff":"#9fc3f5",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
const input={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"6px 7px",outline:"none",boxSizing:"border-box"};
// Laycan range filter: supports ISO dates and short broker dates (e.g. "08 Oct").
function cargoLaycanDate(value, referenceDate = new Date()) {
  if (!value) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return d.getFullYear() === +iso[1] && d.getMonth() === +iso[2] - 1 && d.getDate() === +iso[3] ? d : null;
  }
  const short = text.match(/^(\d{1,2})[\s/.-]+([a-z]{3,9})(?:[\s/.-]+(\d{2,4}))?$/i);
  if (!short) return null;
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const month = months.indexOf(short[2].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const day = +short[1];
  const ref = referenceDate instanceof Date && !isNaN(referenceDate) ? referenceDate : new Date();
  const year = short[3] ? (+short[3] < 100 ? 2000 + +short[3] : +short[3]) : ref.getFullYear();
  const years = short[3] ? [year] : [year - 1, year, year + 1];
  const dates = years.map(y => new Date(y, month, day)).filter(d => d.getMonth() === month && d.getDate() === day);
  return dates.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0] || null;
}
function weekBounds(offset=0){const n=new Date();n.setHours(0,0,0,0);const dow=(n.getDay()+6)%7;const m=new Date(n);m.setDate(n.getDate()-dow+offset*7);const s=new Date(m);s.setDate(m.getDate()+6);return[m,s];}
function CargoMonthChart({ data, total }){
  const wrapRef = React.useRef(null);
  const [size, setSize] = React.useState({ w:520, h:180 });
  const [hovered,setHovered]=React.useState(null);
  React.useEffect(()=>{
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries=>{
      const box = entries[0]?.contentRect;
      if (box && box.width>0 && box.height>0) setSize({ w: box.width, h: box.height });
    });
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);

  const MONTHS=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const counts=(data||[]).filter(b=>Number(b.year)>=2018);
  if(!counts.length) return null;
  const W=Math.max(counts.length,2);
  const maxC=Math.max(1,...counts.map(b=>b.count));
  const SVG_W=size.w, SVG_H=size.h;
  const PAD={t:12,r:12,b:23,l:36};
  const iW=Math.max(1,SVG_W-PAD.l-PAD.r);
  const iH=Math.max(1,SVG_H-PAD.t-PAD.b);
  const pts=counts.map((bkt,i)=>({
    x:PAD.l+(W<=1?0:i*(iW/(W-1))),
    y:PAD.t+iH-(bkt.count/maxC)*iH,
    ...bkt
  }));
  const pathD=pts.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
  const areaD=pathD+" L"+pts[pts.length-1].x.toFixed(1)+","+(PAD.t+iH)+" L"+pts[0].x.toFixed(1)+","+(PAD.t+iH)+" Z";
  const lineLen=pts.reduce((a,p,i)=>i===0?0:a+Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y),0);
  const step=Math.max(1,Math.ceil(W/8));
  const yearStarts=pts.filter((p,i)=>i===0||p.year!==pts[i-1].year);
  const peakIdx=counts.reduce((mx,b,i)=>b.count>counts[mx].count?i:mx,0);

  return(
    <div style={{flex:1,background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,padding:"8px 10px 6px",display:"flex",flexDirection:"column",gap:4,minWidth:0,boxSizing:"border-box",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{fontSize:12,fontWeight:700,color:C.dim,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"inherit"}}>Cargoes entered by month</div>
        <div style={{fontSize:10,color:"rgba(88,166,255,0.7)",fontWeight:700,fontFamily:"inherit"}}>{total.toLocaleString()} total</div>
      </div>
      <div ref={wrapRef} style={{flex:1,minHeight:0,width:"100%"}}>
        <svg fontFamily="inherit" width="100%" height="100%" viewBox={"0 0 "+SVG_W+" "+SVG_H} preserveAspectRatio="xMidYMid meet" style={{display:"block",overflow:"hidden"}}>
          <defs>
            <linearGradient id="cgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#58a6ff" stopOpacity="0.02"/>
            </linearGradient>
            <style>{`
    .qf-actions-main button{transition:transform .09s ease,background .12s ease,box-shadow .12s ease;}


              @keyframes cgDraw{from{stroke-dashoffset:${lineLen.toFixed(0)}}to{stroke-dashoffset:0}}
              .cgLine{stroke-dasharray:${lineLen.toFixed(0)};stroke-dashoffset:${lineLen.toFixed(0)};animation:cgDraw 1.6s ease-out forwards;}
            `}</style>
          </defs>
          {[0,0.25,0.5,0.75,1].map(f=>(
            <g key={f}>
              <line x1={PAD.l} y1={PAD.t+iH*(1-f)} x2={PAD.l+iW} y2={PAD.t+iH*(1-f)} stroke="rgba(88,130,200,0.1)" strokeWidth="1" strokeDasharray={f===0?"0":"3,4"}/>
              <text x={PAD.l-5} y={PAD.t+iH*(1-f)+4} textAnchor="end" fontSize="10" fill="rgba(120,160,200,0.45)">{Math.round(maxC*f)}</text>
            </g>
          ))}
          {yearStarts.map(p=>(
            <g key={p.year}>
              <line x1={p.x} y1={PAD.t-4} x2={p.x} y2={PAD.t+iH+4} stroke="rgba(88,166,255,0.22)" strokeWidth="1.5" strokeDasharray="4,3"/>
              <text x={p.x+3} y={PAD.t+iH+17} fontSize="10" fill="rgba(88,166,255,0.5)" fontWeight="700">{p.year}</text>
            </g>
          ))}
          <path d={areaD} fill="url(#cgGrad)"/>
          <path d={pathD} fill="none" stroke="#58a6ff" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className="cgLine"/>
          {pts.map((p,i)=>{
            return(
              <g key={i}>
                {p.count>0&&<circle cx={p.x} cy={p.y} r={i===peakIdx?4:2.5} fill={i===peakIdx?"#79c0ff":"#58a6ff"} stroke="#0c1729" strokeWidth="1.5"/>}
                <circle cx={p.x} cy={p.y} r="8" fill="transparent" onMouseEnter={()=>setHovered(p)} onMouseLeave={()=>setHovered(null)}><title>{`${MONTHS[p.month]} ${p.year}: ${p.count.toLocaleString()} cargoes`}</title></circle>
              </g>
            );
          })}
          {hovered&&<text x={PAD.l+8} y={PAD.t+8} fill="#b9dcff" fontSize="11">{hovered.year} / {MONTHS[hovered.month]}: {hovered.count.toLocaleString()}</text>}
        </svg>
      </div>
    </div>
  );
}

function BunkerHeader(){
 const [b,setB]=useState(null);
 useEffect(()=>{supabase.from("dashboard").select("value").eq("key","last-bunker-prices").maybeSingle().then(({data})=>setB(data?.value||null));},[]);
 return <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.faint}}><Suspense fallback={null}><RateMatrixBunkerInput/></Suspense></div>;
}
function useMonthly(cargoes=[]){
 return useMemo(()=>{
  const now=new Date(),[tm,ts]=weekBounds(0),[lm,ls]=weekBounds(-1);
  ts.setHours(23,59,59,999);ls.setHours(23,59,59,999);
  const monthMap=new Map();
  for(let i=119;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);monthMap.set(`${d.getFullYear()}-${d.getMonth()}`,{year:d.getFullYear(),month:d.getMonth(),count:0})}
  let thisWk=0,lastWk=0;
  for(const c of cargoes){const raw=c.updated||c.added;if(!raw)continue;const d=new Date(raw);if(Number.isNaN(d.getTime()))continue;if(d>=tm&&d<=ts)thisWk++;if(d>=lm&&d<=ls)lastWk++;const k=`${d.getFullYear()}-${d.getMonth()}`;if(monthMap.has(k))monthMap.get(k).count++;}
  return {week:{thisWk,lastWk},monthly:[...monthMap.values()]};
 },[cargoes]);
}
function TagCell({id,value,onUpdate}){
 const [open,setOpen]=useState(false),[pos,setPos]=useState({top:0,left:0}),[newTag,setNewTag]=useState(""),ref=useRef(null);
 const list=tagList();
 function show(){if(ref.current){const r=ref.current.getBoundingClientRect(),z=parseFloat(getComputedStyle(document.body).zoom||"1")||1,w=170*z,h=(110+list.length*27)*z,m=12;let l=r.left-w-6;if(l<m)l=r.right+6;l=Math.max(m,Math.min(l,innerWidth-w-m));let t=Math.max(m,Math.min(r.top-8,innerHeight-h-m));setPos({left:l/z,top:t/z});}setOpen(true);}
 function addAndPick(){const t=newTag.trim().toUpperCase();if(!t)return;try{const custom=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");if(!custom.includes(t)&&!PRESET_TAGS.includes(t))localStorage.setItem("signal_custom_tags",JSON.stringify([...custom,t]));}catch{}onUpdate(id,"tag",t);setNewTag("");setOpen(false);}
 const activeColor=value?tagColor(value):null;
 return <><td style={{...POS_TD,textAlign:"center",padding:0}}><button ref={ref} onClick={show} style={{width:"100%",height:32,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",padding:"0 4px",background:value?(activeColor?activeColor+"2b":"rgba(88,166,255,.14)"):"transparent",border:"none",borderRadius:0,color:value?(activeColor||C.blue):C.faint,fontSize:11,fontWeight:value?800:600,cursor:"pointer",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value?String(value).toUpperCase():<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,border:"1px solid rgba(159,195,245,.45)",borderRadius:3,color:"rgba(159,195,245,.8)",fontSize:15,fontWeight:500,lineHeight:1}}>+</span>}</button></td>
 {open&&createPortal(<><div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:19990}}/><div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:19999,width:170,background:"#071223",border:"1px solid "+C.blue,borderRadius:7,padding:6,boxShadow:"0 12px 30px rgba(0,0,0,.7)"}}>
 {list.map(t=>{const tc=tagColor(t);return <button key={t} onClick={()=>{onUpdate(id,"tag",value===t?"":t);setOpen(false)}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",textAlign:"left",padding:"6px 7px",marginBottom:2,background:value===t?"rgba(88,166,255,.16)":"transparent",border:"1px solid "+(value===t?C.blue:C.bd2),borderRadius:3,color:tc||(value===t?"#fff":"#9fc3f5"),fontSize:11,fontWeight:700,cursor:"pointer"}}>{tc&&<span style={{width:6,height:6,borderRadius:"50%",background:tc,flexShrink:0}}/>}{t}</button>;})}
 <input value={newTag} onChange={e=>setNewTag(e.target.value)} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.key==="Enter"&&addAndPick()} placeholder="New tag + Enter"
   style={{width:"100%",marginTop:3,background:"#0a1526",border:"1px solid "+C.bd2,borderRadius:3,color:C.tx,fontFamily:"inherit",fontSize:9,fontWeight:600,padding:"6px 7px",outline:"none",boxSizing:"border-box"}}/>
 </div></>,document.body)}</>;
}
function RegionFilterInput({label,value,setter}){
 const [open,setOpen]=useState(false),[q,setQ]=useState("");
 const opts=REGIONS.filter(x=>!q||x.toLowerCase().includes(q.toLowerCase()));
 function typeRegion(v){
   setQ(v);
   setOpen(true);
   const term=v.trim().toLowerCase();
   if(!term){setter("");return}
   const exact=REGIONS.find(x=>x.toLowerCase()===term);
   const starts=REGIONS.find(x=>x.toLowerCase().startsWith(term));
   const contains=REGIONS.find(x=>x.toLowerCase().includes(term));
   const hit=exact||starts||contains;
   if(hit)setter(hit);
 }
 return <div style={{minWidth:0,position:"relative"}}><b style={{fontSize:9,color:C.blue}}>{label}</b><input value={q||value} onFocus={()=>setOpen(true)} onChange={e=>typeRegion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&opts[0]){setter(opts[0]);setQ("");setOpen(false)}else if(e.key==="Escape"){setOpen(false);setQ("")}}} placeholder="Type to filter..." style={{...input,marginTop:4,width:"100%",boxSizing:"border-box"}}/>{open&&<><div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:1000}}/><div style={{position:"absolute",zIndex:1001,top:42,left:0,right:0,background:C.bg2,border:"1px solid "+C.bd2,borderRadius:4,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 20px #0008"}}><button onMouseDown={e=>e.preventDefault()} onClick={()=>{setter("");setQ("");setOpen(false)}} style={{...btn(!value),display:"block",width:"100%",textAlign:"left"}}>ALL</button>{opts.map(x=><button key={x} onMouseDown={e=>e.preventDefault()} onClick={()=>{setter(x);setQ("");setOpen(false)}} style={{...btn(value===x),display:"block",width:"100%",textAlign:"left"}}>{x}</button>)}</div></>}</div>
}
function RegionCell({value,onSave,row,col,maxCol}){
 const [edit,setEdit]=useState(false),[draft,setDraft]=useState(value||""),[activeIdx,setActiveIdx]=useState(0),ref=useRef(null);
 const matches=REGIONS.filter(r=>!draft.trim()||r.toLowerCase().includes(draft.trim().toLowerCase()));
 function bestMatch(raw=draft){const q=String(raw||"").trim().toLowerCase();if(!q)return null;return REGIONS.find(r=>r.toLowerCase()===q)||REGIONS.find(r=>r.toLowerCase().startsWith(q))||REGIONS.find(r=>r.toLowerCase().includes(q))||null}
 function open(e){e?.stopPropagation();setDraft(value||"");setActiveIdx(0);setEdit(true);setTimeout(()=>{ref.current?.focus();ref.current?.select()},0)}
 function commit(raw=draft){const q=String(raw||"").trim(),hit=bestMatch(raw);if(!q)onSave("");else if(hit)onSave(hit);setEdit(false)}
 return <td tabIndex={0} data-grid-row={row} data-grid-col={col} style={{...POS_TD,padding:edit?"1px 2px":POS_TD.padding,fontWeight:500,color:C.tx,position:"relative",overflow:"visible"}} onClick={open}>
   {!edit?value||"":<input ref={ref} value={draft} onClick={e=>e.stopPropagation()} onChange={e=>{setDraft(e.target.value);setActiveIdx(0)}} onBlur={()=>setTimeout(()=>commit(),150)} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();setActiveIdx(i=>Math.min(i+1,Math.max(0,matches.length-1)))}else if(e.key==="ArrowUp"){e.preventDefault();setActiveIdx(i=>Math.max(i-1,0))}else if(e.key==="Enter"){e.preventDefault();const raw=draft.trim()?(matches[activeIdx]||draft):"";commit(raw);focusGrid(row+1,col)}else if(e.key==="Tab"){gridMove(e,()=>commit(draft.trim()?(matches[activeIdx]||draft):""),row,col,maxCol)}else if(e.key==="Escape")setEdit(false)}} style={{width:"100%",height:27,lineHeight:"25px",padding:"0 5px",margin:0,border:"1px solid rgba(58,130,246,.32)",borderRadius:4,outline:"none",boxShadow:"none",background:"rgba(20,39,66,.78)",color:C.tx,fontFamily:"inherit",fontSize:12,fontWeight:500,textTransform:"uppercase",boxSizing:"border-box"}}/>}
   {edit&&<div onMouseDown={e=>e.preventDefault()} onClick={e=>e.stopPropagation()} style={{position:"absolute",left:8,top:"calc(100% - 1px)",zIndex:99999,minWidth:"calc(100% - 16px)",width:180,background:"#071223",border:"1px solid "+C.bd,borderRadius:5,padding:3,boxShadow:"0 8px 25px rgba(0,0,0,.65)",overflow:"visible"}}>{matches.map((r,i)=><div key={r} onMouseEnter={()=>setActiveIdx(i)} onMouseDown={e=>{e.preventDefault();e.stopPropagation();commit(r)}} style={{padding:"5px 7px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",background:i===activeIdx?"rgba(58,130,246,.18)":r===value?"rgba(58,130,246,.12)":"transparent",color:i===activeIdx?"#79c0ff":r===value?"#79c0ff":C.tx}}>{r}</div>)}</div>}
 </td>;
}
function editorInitials(v){
 const x=String(v??"").trim().toUpperCase();
 if(!x)return "";
 if(x==="H")return "HH";
 if(x==="L")return "HL";
 // Keep complete contributor codes. Truncating "ADO/HLO" to "AD"
 // made the dropdown ambiguous and broke filtering.
 return x;
}


function gridMove(e,save,row,col,maxCol){
 const k=e.key;
 if(!["Tab","Enter","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(k))return;
 e.preventDefault();e.stopPropagation();
 save?.();
 let r=row,c=col;
 if(k==="Tab"){c+=e.shiftKey?-1:1;if(c<0){r--;c=maxCol}else if(c>maxCol){r++;c=0}}
 else if(k==="ArrowRight")c=Math.min(maxCol,col+1);
 else if(k==="ArrowLeft")c=Math.max(0,col-1);
 else if(k==="ArrowUp")r=Math.max(0,row-1);
 else r=row+1;
 focusGrid(r,c);
}
function focusGrid(row,col){
 const selector=`[data-grid-row="${row}"][data-grid-col="${col}"]`;
 const target=document.querySelector(selector);
 if(target)target.focus({preventScroll:true});
 else requestAnimationFrame(()=>document.querySelector(selector)?.focus({preventScroll:true}));
}

function Editable({value,onSave,color,bold,align="left",row,col,maxCol}){
 const[e,setE]=useState(false),[v,setV]=useState(value??"");useEffect(()=>setV(value??""),[value]);
 return <td tabIndex={0} data-grid-row={row} data-grid-col={col} onDoubleClick={()=>setE(true)} onClick={()=>setE(true)} onKeyDown={x=>{if(!e){if(x.key==="Enter"){x.preventDefault();setE(true)}else if(x.key==="Tab"||x.key.startsWith("Arrow")){gridMove(x,null,row,col,maxCol)}else if(x.key.length===1&&!x.ctrlKey&&!x.metaKey&&!x.altKey){x.preventDefault();setV(x.key);setE(true)}}}} style={{...POS_TD,padding:e?"1px 2px":POS_TD.padding,color:color||C.tx,fontWeight:bold?700:500,textAlign:align}}>
 {e?<input autoFocus value={v} onChange={x=>setV(x.target.value)} onBlur={()=>{setE(false);if(v!==value)onSave(v)}} onKeyDown={x=>{if(x.key==="Enter"||x.key==="Tab"){gridMove(x,()=>{if(v!==value)onSave(v);setE(false)},row,col,maxCol)}else if(x.key==="Escape"){setV(value??"");setE(false)}}} style={{width:"100%",height:27,lineHeight:"25px",padding:"0 5px",margin:0,border:"1px solid rgba(58,130,246,.32)",borderRadius:4,outline:"none",boxShadow:"none",background:"rgba(20,39,66,.78)",color:color||C.tx,fontFamily:"inherit",fontSize:12,fontWeight:bold?700:500,textTransform:"uppercase",boxSizing:"border-box",textAlign:align}}/>:<span title={String(value||"")}>{value||""}</span>}</td>;
}
function AddRow({onSave,onClose,quotes=false}){
 const [r,setR]=useState({});const f=(k,p)=><input value={r[k]||""} onChange={e=>setR(x=>({...x,[k]:e.target.value}))} placeholder={p} style={{...input,width:"100%",height:22,padding:"0 6px"}}/>;
 const save=async()=>{if(!r.charterer&&!r.cargo)return onClose();await onSave({...r,updated:new Date().toISOString(),intelligence:quotes?(r.intelligence||""):undefined});onClose();};
 return <div style={{...card,padding:"4px 6px",display:"grid",gridTemplateColumns:quotes?"90px 90px 50px 70px 120px 120px 70px 90px 100px 120px 75px 75px 110px 1fr 50px":"100px 120px 70px 90px 100px 120px 75px 75px 110px 1fr 50px",gap:4,alignItems:"center"}}>
 {quotes&&<>{f("ex_region","Ex region")}{f("to_region","To region")}{f("p_and_c","P&C")}{f("intelligence","Intel")}</>}
 {f("vessel","Vessel")}{f("charterer","Charterer")}{f("qty","Qty")}{f("cargo","Cargo")}{f("load","Load")}{f("disch","Disch")}{f("from","From")}{f("to","To")}{f("freight","Freight")}{f("comment","Comment")}<button onClick={save} style={{...btn(true),height:22,padding:"0 8px"}}>Save</button>
 </div>;
}

export default function QuotesFixtures({vessels=[],cargoes=[],cargoTotal=0,onUpdateC,onAddCargoes,onAddC,onDelC,onAddVessels,onCargoSearch}){
 const [copyFeedback,setCopyFeedback]=useState("");
 const copiedTimer=useRef(null);
 const markCopied=(name)=>{clearTimeout(copiedTimer.current);setCopyFeedback(name);copiedTimer.current=setTimeout(()=>setCopyFeedback(""),1800);};
 const copyButtonStyle=(name)=>copyFeedback===name?{...btn(true),background:"rgba(16,185,129,.23)",borderColor:"#10b981",color:"#6ee7b7"}:btn();
 const [hideIntermediate,setHideIntermediate]=useState(false);
 const [panelWidths,setPanelWidths]=useState(()=>{try{return JSON.parse(localStorage.getItem("cargo_panel_widths_v1"))||[25,40,35]}catch{return [25,40,35]}});
 const resizeRef=useRef(null);
 const beginPanelResize=(index,e)=>{e.preventDefault();const container=e.currentTarget.parentElement;const rect=container.getBoundingClientRect();const initial=[...panelWidths];const start=e.clientX;const onMove=ev=>{const delta=(ev.clientX-start)/rect.width*100;const pair=initial[index]+initial[index+1];const first=Math.max(index===0?12:16,Math.min(pair-(index===0?16:20),initial[index]+delta));setPanelWidths(prev=>{const next=[...prev];next[index]=first;next[index+1]=pair-first;return next;});};const onUp=()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);document.body.style.cursor="";};document.body.style.cursor="col-resize";window.addEventListener("pointermove",onMove);window.addEventListener("pointerup",onUp);};
 useEffect(()=>{try{localStorage.setItem("cargo_panel_widths_v1",JSON.stringify(panelWidths))}catch{}},[panelWidths]);
 useEffect(()=>()=>clearTimeout(copiedTimer.current),[]);
 const [pressedAction,setPressedAction]=useState("");
 const [copyToast,setCopyToast]=useState("");
 const toastTimer=useRef(null);
 const showCopyToast=(message)=>{setCopyToast(message);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setCopyToast(""),1800);};
 useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
 const pressAction=(name)=>{setPressedAction(name);setTimeout(()=>setPressedAction(v=>v===name?"":v),450);};
 const [search,setSearch]=useState(""),[status,setStatus]=useState("ALL"),[time,setTime]=useState(""),[grade,setGrade]=useState(""),[tag,setTag]=useState(""),[ex,setEx]=useState(""),[toR,setToR]=useState(""),[parseTag,setParseTag]=useState(""),[showAdd,setShowAdd]=useState(false),[sort,setSort]=useState("updated"),[dir,setDir]=useState(-1);
 const [laycanStart,setLaycanStart]=useState("");
  const [laycanEnd,setLaycanEnd]=useState("");
  const [section,setSection]=useState("all");
 const [contributorFilter,setContributorFilter]=useState("");
 const [extraTags,setExtraTags]=useState([]);
 const activeTags=tag?[tag,...extraTags]:extraTags;
 const chooseTag=(value,ctrl)=>{if(ctrl){const next=new Set(activeTags);next.has(value)?next.delete(value):next.add(value);const a=[...next];setTag(a[0]||"");setExtraTags(a.slice(1));}else{setTag(tag===value&&extraTags.length===0?"":value);setExtraTags([]);}};
 const clearFilters=()=>{setSearch("");setStatus("ALL");setTime("");setGrade("");setTag("");setExtraTags([]);setEx("");setToR("");setContributorFilter("");setLaycanStart("");setLaycanEnd("");};
  const [visualTab,setVisualTab]=useState("chart");
 // Intermediate is a segment in the same cargoes master table.
 const addInter=async c=>onAddC({...c,market_segment:"INTERMEDIATE"});
 const parseInter=async rows=>onAddCargoes(rows.map(r=>({...r,market_segment:"INTERMEDIATE"})));
 const [page,setPage]=useState(1);
 const PAGE_SIZE=200;
 const qfUser=localStorage.getItem("signal_user")||"H";
 const defaults=["status","ex_region","to_region","p_and_c","intelligence","vessel","charterer","qty","cargo","load","disch","from","to","freight","comment","tag","updated"];
 const colsKeyFor=part=>"signal_qf_visible_columns_"+qfUser+"_"+part;
 const readCols=part=>{
   try{
     const raw=localStorage.getItem(colsKeyFor(part))
       || (part==="all"?(localStorage.getItem("signal_qf_visible_columns_"+qfUser)||localStorage.getItem("signal_qf_visible_columns")):null);
     const parsed=raw?JSON.parse(raw):null;
     if(Array.isArray(parsed))return new Set(parsed);
   }catch{}
   return new Set(defaults);
 };
 const [visibleBySection,setVisibleBySection]=useState(()=>({all:readCols("all"),inter:readCols("inter")}));
 const visible=visibleBySection[section];
 const setVisible=change=>setVisibleBySection(prev=>{
   const current=prev[section];
   const next=typeof change==="function"?change(current):change;
   return {...prev,[section]:new Set(next)};
 });
 useEffect(()=>{
   try{localStorage.setItem(colsKeyFor("all"),JSON.stringify([...visibleBySection.all]));}catch{}
 },[qfUser,visibleBySection.all]);
 useEffect(()=>{
   try{localStorage.setItem(colsKeyFor("inter"),JSON.stringify([...visibleBySection.inter]));}catch{}
 },[qfUser,visibleBySection.inter]);
 // Saved views are local to the signed-in PIN on this device.
 const viewKey="signal_qf_views_"+qfUser;
 const [savedViews,setSavedViews]=useState(()=>{try{const v=JSON.parse(localStorage.getItem(viewKey)||"[]");return Array.isArray(v)?v:[]}catch{return[]}});
 const [selectedView,setSelectedView]=useState("");
 const saveView=()=>{
   const name=window.prompt("Name this Cargoes view:")?.trim();
   if(!name)return;
   const view={name,search,status,time,grade,tag,ex,toR,contributorFilter,laycanStart,laycanEnd,sort,dir,columns:[...visible]};
   const next=[...savedViews.filter(v=>v.name!==name),view];
   setSavedViews(next);localStorage.setItem(viewKey,JSON.stringify(next));setSelectedView(name);
 };
 const applyView=name=>{
   setSelectedView(name);
   const v=savedViews.find(x=>x.name===name);
   if(!v)return;
   setSearch(v.search||"");setStatus(v.status||"ALL");setTime(v.time||"");
   setLaycanStart(v.laycanStart||"");setLaycanEnd(v.laycanEnd||"");
    setGrade(v.grade||"");setTag(v.tag||"");setEx(v.ex||"");setToR(v.toR||"");setContributorFilter(v.contributorFilter||"");
   setSort(v.sort||"updated");setDir(v.dir??-1);
   if(Array.isArray(v.columns))setVisible(new Set(v.columns));
 };
 const resetView=()=>{
   setSelectedView("");setSearch("");setStatus("ALL");setTime("");setLaycanStart("");setLaycanEnd("");setGrade("");setTag("");setEx("");setToR("");setSort("updated");setDir(-1);
 };
 const deleteView=()=>{
   if(!selectedView||!window.confirm(`Delete view "${selectedView}"?`))return;
   const next=savedViews.filter(v=>v.name!==selectedView);
   setSavedViews(next);localStorage.setItem(viewKey,JSON.stringify(next));setSelectedView("");
 };
 const [colsOpen,setColsOpen]=useState(false),[colsPos,setColsPos]=useState({top:0,left:0});
 const [deleteCargo,setDeleteCargo]=useState(null);
 const [deletingCargo,setDeletingCargo]=useState(false);
 const [deleteError,setDeleteError]=useState("");
 const [selected,setSelected]=useState(()=>new Set());
 const [bulkTagOpen,setBulkTagOpen]=useState(false);
 const [hoverRowId,setHoverRowId]=useState(null);
  const [auditRows,setAuditRows]=useState({});
  const [auditError,setAuditError]=useState(false);
  const auditLoaded=useRef(new Set());
  async function showAudit(id){
    setHoverRowId(id);
    if(auditLoaded.current.has(id))return;
    const {data,error}=await supabase.from("cargoes_audit").select("editor,field,old_value,new_value,changed_at").eq("cargo_id",String(id)).order("changed_at",{ascending:false}).limit(12);
    if(error){setAuditError(true);return;}
    auditLoaded.current.add(id);setAuditRows(p=>({...p,[id]:data||[]}));
  }
  const updateWithAudit=async(id,field,value)=>{
    const before=cargoes.find(c=>String(c.id)===String(id));
    if(!before||String(before[field]??"")===String(value??""))return;
    const result=await onUpdateC(id,field,value);
    const editor=String(localStorage.getItem("signal_user")||"H").trim();
    const {error}=await supabase.from("cargoes_audit").insert({cargo_id:String(id),editor,field,old_value:String(before[field]??""),new_value:String(value??"")});
    if(error){console.error("Cargo audit save failed",error);setAuditError(true)}
    else{auditLoaded.current.delete(id);setAuditRows(p=>({...p,[id]:[{editor,field,old_value:String(before[field]??""),new_value:String(value??""),changed_at:new Date().toISOString()},...(p[id]||[])].slice(0,12)}));}
    return result;
  };
 const {week,monthly}=useMonthly(cargoes);
  const [allMonthly,setAllMonthly]=useState(null);
  useEffect(()=>{
    let active=true;
    supabase.rpc("cargoes_monthly_counts").then(({data,error})=>{
      if(error){console.warn("Monthly counts unavailable",error);return;}
      if(!active)return;
      const m=new Map((data||[]).map(r=>[`${r.year}-${Number(r.month)-1}`,Number(r.count)]));
      setAllMonthly(Array.from({length:(new Date().getFullYear()-2018+1)*12},(_,i)=>({year:2018+Math.floor(i/12),month:i%12,count:m.get(`${2018+Math.floor(i/12)}-${i%12}`)||0})).filter(b=>b.year<new Date().getFullYear()||b.month<=new Date().getMonth()));
    });
    return ()=>{active=false};
  },[cargoTotal]);
 const groups=useMemo(()=>{try{return JSON.parse(localStorage.getItem("signal_cargo_filter_groups")||"[]")}catch{return[]}},[cargoes.length]),grades=groups.filter(g=>(g.category||"grade")==="grade"),tags=[...new Set(cargoes.map(c=>c.tag).filter(Boolean))].sort();
 const filtered=useMemo(()=>{let a=cargoes.filter(c=>{if(section==="inter"&&c.market_segment!=="INTERMEDIATE")return false;if(section==="all"&&hideIntermediate&&String(c.market_segment||"").trim().toUpperCase()==="INTERMEDIATE")return false;if(contributorFilter&&editorInitials(c.entered_by)!==contributorFilter)return false;if(ex&&c.ex_region!==ex)return false;if(toR&&c.to_region!==toR)return false;if(status!=="ALL"&&c.status!==status)return false;if(activeTags.length&&!activeTags.some(t=>String(c.tag||"").split(/[,;|]/).map(s=>s.trim()).includes(t)))return false;if(laycanStart||laycanEnd){
  // The two small inputs define a strict range in the current calendar month.
  // Both laycan endpoints must be within it (inclusive).
  const now=new Date();
  const year=now.getFullYear(),month=now.getMonth();
  const firstDay=laycanStart?Number(laycanStart):1;
  const lastDay=laycanEnd?Number(laycanEnd):new Date(year,month+1,0).getDate();
  if(firstDay>lastDay)return false;
  const periodStart=new Date(year,month,firstDay);
  const periodEnd=new Date(year,month,lastDay);
  if(periodStart.getMonth()!==month||periodEnd.getMonth()!==month)return false;
  const laycanFrom=cargoLaycanDate(c.from,periodStart);
  const laycanTo=cargoLaycanDate(c.to,laycanFrom||periodEnd);
  if(!laycanFrom||!laycanTo)return false;
  if(laycanFrom<periodStart||laycanTo>periodEnd||laycanTo<laycanFrom)return false;
}if(time){const d=new Date(c.updated||c.added||0),now=new Date(),[tw0,tw1]=weekBounds(0),[lw0,lw1]=weekBounds(-1);tw1.setHours(23,59,59,999);lw1.setHours(23,59,59,999);if(time==="tw"&&!(d>=tw0&&d<=tw1))return false;if(time==="lw"&&!(d>=lw0&&d<=lw1))return false;if(time==="ytd"&&d<new Date(now.getFullYear(),0,1))return false;}if(grade&&!String(c.cargo||"").toLowerCase().includes(grade.toLowerCase()))return false;if(search&&!JSON.stringify(c).toLowerCase().includes(search.toLowerCase()))return false;return true});const f=sort==="added"?"added":sort;return [...a].sort((x,y)=>{let A=x[f]||x.updated||"",B=y[f]||y.updated||"";if(f==="added"||f==="updated"){A=new Date(A||0).getTime();B=new Date(B||0).getTime()}const primary=(A<B?-1:A>B?1:0)*dir;if(primary)return primary;
// Stable tie-breakers: editing Intel/regions/etc must never change row position.
const xa=new Date(x.added||0).getTime()||0,ya=new Date(y.added||0).getTime()||0;if(xa!==ya)return ya-xa;
return String(x.id||"").localeCompare(String(y.id||""));})},[cargoes,section,hideIntermediate,search,status,time,tag,extraTags,grade,ex,toR,contributorFilter,laycanStart,laycanEnd,sort,dir]);
 useEffect(()=>{setPage(1);},[section,hideIntermediate,search,status,time,tag,extraTags,grade,ex,toR,contributorFilter,laycanStart,laycanEnd,sort,dir]);
 const pageRows=useMemo(()=>filtered.slice(0,page*PAGE_SIZE),[filtered,page]);
 const allCols=[["status","Status",3.5],["ex_region","Ex Region",5.5],["to_region","To Region",5.5],["p_and_c","P&C",3],["intelligence","Intel",4],["vessel","Vessel",7],["charterer","Charterer",6.5],["qty","Qty",4],["cargo","Cargo",6],["load","Load",8],["disch","Disch",7.5],["from","From",4.5],["to","To",4.5],["freight","Freight",7],["comment","Comment",9],["tag","Tag",5],["source","Source",5],["updated","Updated",6.5]];
 const shown=allCols.filter(([k])=>visible.has(k));
 // Normalize visible widths so hiding columns never lets the trailing delete column expand.
 const shownWidthTotal=shown.reduce((sum,[, ,width])=>sum+width,0)||1;
 const copyFields=["vessel","charterer","qty","cargo","load","disch","from","to","freight","comment"];
 async function copyCargoRows(rows,csv=false){
   const escapeCsv=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
   const text=csv?[copyFields.join(","),...rows.map(r=>copyFields.map(k=>escapeCsv(r[k])).join(","))].join("\n")
     :rows.map(r=>formatCargoExportRow(r,readCargoExportFormat())).join("\n");
   try{await navigator.clipboard.writeText(text);markCopied(csv?"csv":"all");}catch(e){window.prompt("Copy cargoes",text)}
 }

 return <div style={{display:"flex",flexDirection:"column",gap:8}}>
  <style>{`
    .cargo-panel-handle{position:absolute;top:0;bottom:0;width:11px;transform:translateX(-50%);cursor:col-resize;z-index:80;touch-action:none;background:transparent;}
    .cargo-panel-handle:after{content:"";position:absolute;top:12%;bottom:12%;left:4px;width:3px;border-radius:3px;background:rgba(88,166,255,.32);}
    .cargo-panel-handle:hover:after{background:#58a6ff;}
    @media (max-width: 700px){
      .cargo-panel-handle{display:none!important;}
      .qf-top{height:auto!important;display:block!important;}
      .qf-panel-header{display:flex!important;flex-wrap:wrap!important;gap:6px!important;}
      .qf-panel-header > div{grid-column:auto!important;}
      .qf-header-chart-tabs{width:auto!important;margin-left:0!important;}
      .qf-mobile-fold{display:block!important;margin-bottom:6px;background:${C.bg2};border:1px solid ${C.bd};border-radius:7px;overflow:hidden;}
      .qf-mobile-fold > summary{display:flex!important;align-items:center;justify-content:space-between;list-style:none;padding:10px 12px;color:#79c0ff;font-size:12px;font-weight:800;cursor:pointer;}
      .qf-mobile-fold > summary::-webkit-details-marker{display:none;}
      .qf-mobile-fold > summary::after{content:"▸";color:#6f86a8;}
      .qf-mobile-fold[open] > summary::after{content:"▾";}
      .qf-mobile-fold > div{width:100%!important;height:auto!important;box-sizing:border-box;}
      .qf-mobile-fold .qf-parse{height:300px!important;}
      .qf-mobile-fold .qf-filters{display:flex!important;flex-wrap:wrap!important;overflow:visible!important;min-height:0!important;}
      
      .qf-mobile-fold .qf-chart{height:260px!important;min-height:260px!important;}
      .qf-actions{display:block!important;padding:7px!important;}
      .qf-actions-main{display:flex!important;gap:5px!important;align-items:center!important;overflow-x:auto!important;padding-bottom:6px!important;}
      .qf-actions-search{display:flex!important;width:100%!important;gap:5px!important;align-items:center!important;}
      .qf-actions-search input{flex:1!important;width:auto!important;min-width:0!important;}
      .qf-mobile-controls{display:block!important;margin-top:6px!important;background:${C.bg2};border:1px solid ${C.bd};border-radius:7px;overflow:hidden;}
      .qf-mobile-controls > summary{display:flex!important;align-items:center;justify-content:space-between;list-style:none;padding:9px 11px;color:#79c0ff;font-size:11px;font-weight:800;cursor:pointer;}
      .qf-mobile-controls > summary::-webkit-details-marker{display:none;}
      .qf-mobile-controls > summary::after{content:"▸";color:#6f86a8;}
      .qf-mobile-controls[open] > summary::after{content:"▾";}
      .qf-mobile-controls-body{display:flex!important;gap:5px!important;flex-wrap:wrap!important;padding:0 8px 8px!important;}
      .qf-table{min-width:1450px!important;width:1450px!important;table-layout:fixed!important;}
      .qf-table-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;}
    }
    @media (min-width: 701px){
      .qf-top{display:grid!important;grid-template-columns:var(--cargo-panel-cols)!important;gap:10px!important;}
      .qf-mobile-fold{display:block!important;position:relative!important;height:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:hidden!important;}
      .qf-parse-fold{grid-column:1!important;flex:none!important;}
      .qf-filter-fold{grid-column:2!important;flex:none!important;}
      .qf-chart-fold{grid-column:3!important;flex:none!important;}
      .qf-mobile-fold > summary{display:none!important;}
      .qf-mobile-fold > div{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;box-sizing:border-box!important;overflow:hidden!important;}
      .qf-mobile-fold .qf-parse,.qf-mobile-fold .qf-filters,.qf-mobile-fold .qf-chart{flex:none!important;width:100%!important;height:100%!important;min-height:0!important;overflow:hidden!important;}
      .qf-mobile-fold .qf-filters{align-items:flex-start!important;align-content:start!important;overflow:auto!important;}
      .cargo-panel-handle{display:block!important;}
      .qf-mobile-fold .qf-filters > div{height:auto!important;min-height:0!important;flex:0 0 auto!important;display:flex!important;flex-direction:column!important;}
      .qf-mobile-fold .qf-filters > div > div{flex:0 0 auto!important;align-content:flex-start!important;}
      .qf-mobile-fold .qf-parse-tags{padding:5px 8px!important;gap:3px!important;}
      .qf-mobile-fold .qf-parse textarea{min-height:48px!important;height:48px!important;padding-top:5px!important;padding-bottom:5px!important;}
      .qf-mobile-fold .qf-parse > div:last-child > div{height:100%!important;display:flex!important;flex-direction:column!important;}
      .qf-mobile-fold .qf-parse > div:last-child > div > textarea{flex:1 1 auto!important;}
      .qf-mobile-controls{display:contents!important;}
      .qf-mobile-controls > summary{display:none!important;}
      .qf-mobile-controls-body{display:contents!important;}
      .qf-actions{display:flex!important;}
      .qf-actions-main,.qf-actions-search{display:contents!important;}
    }
  `}</style>
     <div className="qf-panel-header" style={{display:"grid",gridTemplateColumns:panelWidths.map(x=>`minmax(0,${x}fr)`).join(" "),alignItems:"center",gap:10}}><div style={{gridColumn:"1 / span 2",display:"flex",gap:6}}><button onClick={()=>{setSection("all");setVisualTab("chart")}} style={btn(section==="all")}>Cargoes · All</button><button onClick={()=>{setSection("inter");setVisualTab("rates")}} style={btn(section==="inter")}>Intermediate</button></div><div className="qf-header-chart-tabs" style={{gridColumn:"3",width:"100%",display:"flex",alignItems:"center",gap:5,boxSizing:"border-box",paddingLeft:0}}><button style={btn(visualTab==="rates")} onClick={()=>setVisualTab("rates")}>Rate Matrix</button><button style={btn(visualTab==="chart")} onClick={()=>setVisualTab("chart")}>Cargo Count</button><span style={{marginLeft:"auto"}}>{visualTab==="rates"&&<BunkerHeader/>}</span></div></div>
<div className="qf-top" style={{"--cargo-panel-cols":panelWidths.map(x=>`minmax(0,${x}fr)`).join(" "),display:"flex",gap:10,height:215,minHeight:0,overflow:"hidden",position:"relative"}}>
   <details className="qf-mobile-fold qf-parse-fold" open={typeof window!=="undefined"&&window.innerWidth>700}><summary>Paste / Parse</summary><div className="qf-parse" style={{flex:"0 0 25%",minWidth:0,height:"100%",display:"flex",flexDirection:"column",gap:4,overflow:"hidden"}}><div className="qf-parse-tags" style={{...card,padding:"6px 8px",display:"flex",gap:4,flexWrap:"wrap",alignContent:"flex-start",flex:"0 0 auto",overflow:"visible"}}>{tagList().map(t=>{const tc=tagColor(t);return <button key={t} onClick={()=>setParseTag(x=>x===t?"":t)} style={{...btn(parseTag===t),color:tc||"#9fc3f5",borderColor:parseTag===t?(tc||C.blue):C.bd,background:parseTag===t?(tc?tc+"22":"rgba(88,166,255,.18)"):C.bg3}}>{t}</button>})}</div><div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden"}}><Suspense fallback={null}><ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels} onAddCargoes={async p=>{const r=await (section==="inter"?parseInter:onAddCargoes)(p.map(c=>({...c,tag:parseTag||c.tag||""})));setParseTag("");return r}} lockedMode="cargo" vesselDB={{}}/></Suspense></div></div></details>
   <div className="cargo-panel-handle" title="Drag to resize Parse and Filters" onPointerDown={e=>beginPanelResize(0,e)} style={{left:`calc(${panelWidths[0]}% - 5px)`}}/>
   <details className="qf-mobile-fold qf-filter-fold" open={typeof window!=="undefined"&&window.innerWidth>700}><summary>Filters</summary><div className="qf-filters" style={{flex:"0 0 40%",minWidth:0,...card,padding:"8px 8px 34px",display:"flex",flexWrap:"nowrap",gap:12,overflowY:"auto",overflowX:"auto",position:"relative",zIndex:20,alignContent:"start"}}>
         <div className="qf-views" style={{minWidth:0,display:"flex",flexDirection:"column",gap:5}}><b style={{fontSize:11,color:C.blue}}>VIEW</b><select aria-label="Saved view" value={selectedView} onChange={e=>applyView(e.target.value)} style={{...input,width:"100%",minWidth:0}}><option value="">Current filters</option>{savedViews.map(v=><option key={v.name} value={v.name}>{v.name}</option>)}</select>{section==="all"&&<button onClick={()=>setHideIntermediate(v=>!v)} style={{...btn(hideIntermediate),textAlign:"left",whiteSpace:"normal",color:hideIntermediate?"#6ee7b7":C.dim}}>{hideIntermediate?"✓ Hide Intermediate":"Hide Intermediate"}</button>}<div style={{display:"flex",flexWrap:"wrap",gap:4}}><button onClick={saveView} style={btn()}>+ Save view</button>{selectedView&&<><button onClick={resetView} style={btn()}>Reset view</button><button onClick={deleteView} style={btn()}>Delete</button></>}</div></div>
<div className="qf-grade"><b style={{fontSize:11,color:C.blue}}>GRADE</b><div style={{display:"grid",gridAutoFlow:"column",gridTemplateRows:"repeat(7, 20px)",gridAutoColumns:"max-content",gap:3,marginTop:4,justifyContent:"start"}}>{[...grades].sort((a,b)=>String(a.label).localeCompare(String(b.label))).slice(0,6).map(g=><button key={g.id} onClick={()=>setGrade(x=>x===g.id?"":g.id)} style={btn(grade===g.id)}>{g.label}</button>)}</div></div>
    <div className="qf-period"><b style={{fontSize:11,color:C.dim}}>PERIOD</b>
  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,marginTop:4}}>
    {[["","All"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].sort((a,b)=>a[1].localeCompare(b[1])).map(([k,l])=><button key={l} onClick={()=>setTime(k)} style={btn(time===k)}>{l}</button>)}
    <b style={{fontSize:10,color:C.blue,marginTop:3}}>LAYCAN DAYS ({new Date().toLocaleDateString("en-GB",{month:"short"})})</b>
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <input aria-label="Laycan from day" type="text" inputMode="numeric" maxLength={2} placeholder="From" value={laycanStart} onChange={e=>{const v=e.target.value.replace(/\D/g,"");if(!v||(+v>=1&&+v<=31))setLaycanStart(v)}} style={{...input,width:43,padding:"5px 4px",textAlign:"center"}}/>
      <span style={{color:C.faint,fontSize:10}}>–</span>
      <input aria-label="Laycan to day" type="text" inputMode="numeric" maxLength={2} placeholder="To" value={laycanEnd} onChange={e=>{const v=e.target.value.replace(/\D/g,"");if(!v||(+v>=1&&+v<=31))setLaycanEnd(v)}} style={{...input,width:43,padding:"5px 4px",textAlign:"center"}}/>
    </div>
    {(laycanStart||laycanEnd)&&<button onClick={()=>{setLaycanStart("");setLaycanEnd("")}} style={btn()}>Clear days</button>}
  </div>
</div>
     <div className="qf-tags"><b style={{fontSize:11,color:C.pink}}>TAG</b><div style={{display:"grid",gridAutoFlow:"column",gridTemplateRows:"repeat(7, 20px)",gridAutoColumns:"max-content",gap:3,marginTop:4,justifyContent:"start"}}>{[...tags].sort((a,b)=>a.localeCompare(b)).slice(0,7).map(t=><button key={t} onClick={e=>chooseTag(t,e.ctrlKey||e.metaKey)} title="Ctrl+click to select multiple tags" style={btn(activeTags.includes(t))}>{t}</button>)}</div></div>
    {[["EX REGION",ex,setEx],["TO REGION",toR,setToR]].map(([lab,val,setter])=><div key={lab} className="qf-region" style={{minWidth:0}}><b style={{fontSize:11,color:C.blue}}>{lab}</b><div style={{display:"grid",gridAutoFlow:"column",gridTemplateRows:"repeat(7, 20px)",gridAutoColumns:"max-content",gap:3,marginTop:4,justifyContent:"start"}}><button onClick={()=>setter("")} style={btn(!val)}>ALL</button>{[...REGIONS].sort((a,b)=>a.localeCompare(b)).map(r=><button key={r} onClick={()=>setter(val===r?"":r)} style={btn(val===r)}>{r}</button>)}</div></div>)}
    {(search||status!=="ALL"||time||grade||activeTags.length||ex||toR||laycanStart||laycanEnd)&&<button onClick={clearFilters} title="Reset all cargo filters and tags" style={{...btn(),position:"absolute",left:8,bottom:6,color:"#ff7777",borderColor:"rgba(255,90,90,.6)",background:"#201c28",fontWeight:700,zIndex:5}}>Clear</button>}
   </div></details>
   <div className="cargo-panel-handle" title="Drag to resize Filters and Rate Matrix" onPointerDown={e=>beginPanelResize(1,e)} style={{left:`calc(${panelWidths[0]+panelWidths[1]}% - 1px)`}}/>
   <details className="qf-mobile-fold qf-chart-fold" open={typeof window!=="undefined"&&window.innerWidth>700}><summary>Rates / Cargo Graph</summary><div className="qf-chart" style={{flex:"1 1 35%",minWidth:0,height:"100%",display:"flex"}}><div style={{display:"flex",flexDirection:"column",width:"100%",minHeight:0}}><div style={{flex:1,minHeight:0,overflow:"auto"}}>{visualTab==="rates"?<Suspense fallback={null}><RateMatrixCard/></Suspense>:<CargoMonthChart data={allMonthly||monthly} total={allMonthly?cargoTotal||cargoes.length:cargoes.length}/>}</div></div></div></details>
  </div>
  <div className="qf-actions" style={{...card,padding:"5px 8px",display:"flex",gap:6,alignItems:"center",position:"sticky",top:0,zIndex:500,background:C.bg2}}>
   <div className="qf-actions-main"><button data-pressed={pressedAction==="add"} onClick={()=>{pressAction("add");setShowAdd(true)}} style={{...btn(),color:C.amber}}>+ Add cargo</button><button onClick={()=>copyCargoRows(filtered)} style={copyButtonStyle("all")}>{copyFeedback==="all"?"✓ Copied!":"Copy all"}</button><button onClick={()=>copyCargoRows(filtered,true)} style={copyButtonStyle("csv")}>{copyFeedback==="csv"?"✓ Copied!":"Copy CSV"}</button><button onClick={()=>{const rows=selected.size?cargoes.filter(c=>selected.has(c.id)):filtered; if(!rows.length)return;window.dispatchEvent(new CustomEvent("steem:send-cargoes-to-report",{detail:{cargoes:rows}}));}} style={{...btn(),color:"#a5b4fc",borderColor:"#6366f1"}} title="Send selected cargoes (or filtered cargoes if none selected) to Reports">↗ To Report{selected.size?` (${selected.size})`:""}</button><button onClick={async()=>{const rows=selected.size?cargoes.filter(c=>selected.has(c.id)):filtered;const txt=formatCargoWhatsAppTable(rows);try{await navigator.clipboard.writeText(txt);markCopied("wa");}catch(e){window.prompt("Copy WhatsApp cargoes:",txt)}}} style={copyFeedback==="wa"?copyButtonStyle("wa"):{...btn(),color:"#43e97b"}} title="Copy selected cargoes, or all filtered cargoes if none selected, formatted for WhatsApp">{copyFeedback==="wa"?"✓ Copied!":"Copy to WA"}</button>{selected.size>0&&<button style={copyButtonStyle("selected")} onClick={async()=>{const rows=cargoes.filter(c=>selected.has(c.id));const txt=rows.map(r=>formatCargoExportRow(r,readCargoExportFormat())).join("\n");try{await navigator.clipboard.writeText(txt);markCopied("selected");}catch(e){window.prompt("Copy selected cargoes:",txt)}}}>{copyFeedback==="selected"?"✓ Copied!":`Copy List (${selected.size})`}</button>}{selected.size>0&&<button style={copyButtonStyle("selected2")} onClick={async()=>{const rows=cargoes.filter(c=>selected.has(c.id));const txt=rows.map(r=>formatCargoExportRow(r,readCargoExportSecondFormat())).join("\n");try{await navigator.clipboard.writeText(txt);markCopied("selected2");}catch(e){window.prompt("Copy selected (format 2):",txt)}}}>{copyFeedback==="selected2"?"✓ Copied!":`Copy Text (${selected.size})`}</button>}{selected.size>0&&<div style={{position:"relative"}}><button onClick={()=>setBulkTagOpen(v=>!v)} style={{...btn(bulkTagOpen),color:C.blue}}>+ Add tag ({selected.size})</button>{bulkTagOpen&&<><div onClick={()=>setBulkTagOpen(false)} style={{position:"fixed",inset:0,zIndex:19990}}/><div style={{position:"absolute",left:0,top:"calc(100% + 4px)",zIndex:19999,width:180,maxHeight:300,overflowY:"auto",background:"#071223",border:"1px solid "+C.blue,borderRadius:6,padding:5,boxShadow:"0 12px 30px rgba(0,0,0,.7)"}}><button onClick={async()=>{await Promise.all([...selected].map(id=>Promise.resolve(updateWithAudit(id,"tag",""))));setBulkTagOpen(false)}} style={{display:"block",width:"100%",padding:"6px 7px",marginBottom:5,background:"rgba(255,255,255,.025)",border:"1px solid "+C.bd2,borderRadius:3,color:C.faint,fontSize:10,fontWeight:800,cursor:"pointer",textTransform:"uppercase",textAlign:"left"}}>× Clear tag(s)</button>{tagList().map(t=>{const tc=tagColor(t);return <button key={t} onClick={async()=>{await Promise.all([...selected].map(id=>Promise.resolve(updateWithAudit(id,"tag",t))));setBulkTagOpen(false)}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 7px",marginBottom:2,background:"transparent",border:"1px solid "+C.bd2,borderRadius:3,color:tc||"#9fc3f5",fontSize:11,fontWeight:800,cursor:"pointer",textTransform:"uppercase"}}>{tc&&<span style={{width:7,height:7,borderRadius:"50%",background:tc}}/>}{String(t).toUpperCase()}</button>})}</div></>}</div>}
   </div><select aria-label="Filter by contributor initials" title="Filter by original contributor initials" value={contributorFilter} onChange={e=>setContributorFilter(e.target.value)} style={{...btn(),maxWidth:130}}><option value="">All initials</option>{[...new Set(cargoes.map(c=>editorInitials(c.entered_by)).filter(Boolean))].sort().map(i=><option key={i} value={i}>{i}</option>)}</select><div className="qf-actions-search" style={{position:"relative"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cargoes..." style={{...input,background:"#07111f",borderColor:"#243953",width:210,paddingRight:search?34:8}}/>{search&&<button aria-label="Clear search" title="Clear search" onClick={()=>setSearch("")} style={{position:"absolute",right:5,top:"50%",transform:"translateY(-50%)",width:23,height:23,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(159,195,245,.3)",borderRadius:4,background:"rgba(88,166,255,.08)",color:"#9fc3f5",cursor:"pointer",fontSize:17,lineHeight:1,fontWeight:600}}>×</button>}</div><span style={{fontSize:12,color:C.faint}}>This wk <b style={{color:C.blue}}>{week.thisWk.toLocaleString("nb-NO")}</b>&nbsp; Last wk <b>{week.lastWk.toLocaleString("nb-NO")}</b>&nbsp;&nbsp; Total <b style={{color:C.tx}}>{(cargoTotal||cargoes.length).toLocaleString("nb-NO")}</b></span><div className="qf-column-control" style={{marginLeft:"auto",flexShrink:0}}>   <button onClick={e=>{const r=e.currentTarget.getBoundingClientRect(),z=parseFloat(getComputedStyle(document.body).zoom||"1")||1,w=205*z,h=Math.min(430,innerHeight/z-40)*z,m=12;let l=Math.max(m,Math.min(r.right-w,innerWidth-w-m)),t=r.bottom+5;if(t+h>innerHeight-m)t=Math.max(m,r.top-h-5);setColsPos({left:l/z,top:t/z});setColsOpen(v=>!v)}} style={{...btn(),position:"relative",height:27,width:105,padding:"3px 26px 3px 9px",textAlign:"left"}}>Columns<span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-52%)",fontSize:11}}>▼</span></button></div>
   {colsOpen&&<><div onClick={()=>setColsOpen(false)} style={{position:"fixed",inset:0,zIndex:29990}}/><div style={{position:"fixed",left:colsPos.left,top:colsPos.top,zIndex:29999,width:205,maxHeight:"calc(100vh - 32px)",overflowY:"auto",background:"#071223",border:"1px solid "+C.bd,borderRadius:7,padding:7,boxShadow:"0 12px 34px rgba(0,0,0,.7)"}}>{allCols.map(([k,l])=><label key={k} style={{display:"flex",gap:7,padding:5,fontSize:11,fontWeight:600}}><input type="checkbox" checked={visible.has(k)} onChange={()=>setVisible(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n})}/>{l}</label>)}</div></>}
  </div>
  {showAdd&&<AddRow quotes onSave={section==="inter"?addInter:onAddC} onClose={()=>setShowAdd(false)}/>}
  {deleteCargo&&<><div onClick={()=>{if(!deletingCargo){setDeleteCargo(null);setDeleteError("");}}} style={{position:"fixed",inset:0,zIndex:64990,background:"rgba(0,0,0,.08)"}}/><div style={{position:"fixed",left:"50%",bottom:28,transform:"translateX(-50%)",zIndex:65000,minWidth:330,maxWidth:"calc(100vw - 32px)",background:"#0b1728",border:"1px solid rgba(255,91,91,.65)",borderRadius:8,padding:"12px 14px",boxShadow:"0 14px 40px rgba(0,0,0,.55)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:700,color:C.tx,marginRight:4}}>Delete {(deleteCargo.vessel||deleteCargo.charterer||"cargo").toUpperCase()} from database?</span><button disabled={deletingCargo} onClick={async()=>{if(deletingCargo)return;setDeletingCargo(true);setDeleteError("");try{const result=await onDelC(deleteCargo.id);if(result?.error)throw result.error;setSelected(prev=>{const next=new Set(prev);next.delete(deleteCargo.id);return next;});setDeleteCargo(null);}catch(error){console.error("Cargo deletion failed",error);setDeleteError(error?.message||"Could not delete cargo. Please try again.");}finally{setDeletingCargo(false);}}} style={{...btn(),background:deletingCargo?"#743939":"#c93e43",borderColor:"#c93e43",color:"#fff",padding:"6px 16px",opacity:deletingCargo?.65:1}}>{deletingCargo?"Deleting…":"Delete cargo"}</button><button disabled={deletingCargo} onClick={()=>{setDeleteCargo(null);setDeleteError("");}} style={{...btn(),padding:"6px 16px"}}>Cancel</button>{deleteError&&<div role="alert" style={{width:"100%",fontSize:11,color:"#ff8585"}}>{deleteError}</div>}</div></>}
  <div style={POS_WRAP} className="pos-hover-rows qf-table-wrap">
   <style>{`.pos-hover-rows tr:hover{background:rgba(88,166,255,0.07)!important;}`}</style>
   <table className="qf-table" style={POS_TABLE}>
    <colgroup><col style={{width:"2%"}}/>{shown.map(([k,l,w])=><col key={k} style={{width:(94*w/shownWidthTotal)+"%"}}/>)}<col style={{width:"2%"}}/><col style={{width:"2%"}}/></colgroup>
    <thead><tr><th onClick={()=>{const ids=pageRows.map(x=>x.id);const all=ids.length>0&&ids.every(id=>selected.has(id));setSelected(p=>{const n=new Set(p);ids.forEach(id=>all?n.delete(id):n.add(id));return n})}} style={{...POS_TH,textAlign:"center",cursor:"pointer",padding:"3px 1px",lineHeight:"11px"}}><div style={{fontSize:11,color:pageRows.length>0&&pageRows.every(x=>selected.has(x.id))?"#4fc3f7":C.faint}}>{pageRows.length>0&&pageRows.every(x=>selected.has(x.id))?"[✓]":"[ ]"}</div><div style={{fontSize:7,color:C.faint}}>ALL</div></th>{shown.map(([k,l])=><th key={k} onClick={()=>{if(sort===k)setDir(d=>-d);else{setSort(k);setDir(-1)}}} title={`Sort by ${l}`} style={{...POS_TH,textAlign:["status","p_and_c","intelligence","from","to","tag","updated"].includes(k)?"center":"left",cursor:"pointer",userSelect:"none"}}>{l}{sort===k?(dir===-1?" ▼":" ▲"):""}</th>)}<th style={POS_TH}/><th style={POS_TH}/></tr></thead>
    <tbody>{pageRows.map((c,i)=>{
      const rowBg=POS_ROW(i);
      const navKeys=shown.map(x=>x[0]).filter(k=>!["tag","updated","source"].includes(k));
      const navCol=k=>navKeys.indexOf(k),navMax=navKeys.length-1;
      return <tr key={c.id} onClick={e=>{if(!(e.ctrlKey||e.metaKey))return; if(e.target.closest("button,input,select,textarea,[role=checkbox]"))return; e.preventDefault(); e.stopPropagation(); setSelected(prev=>{const next=new Set(prev);next.has(c.id)?next.delete(c.id):next.add(c.id);return next;});}} style={{background:selected.has(c.id)?"rgba(58,130,246,0.16)":rowBg,height:32,boxShadow:selected.has(c.id)?"inset 3px 0 0 rgba(88,166,255,.65)":undefined}}><td onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} style={{...POS_TD,textAlign:"center",padding:"0 2px",overflow:"visible"}}><span role="checkbox" aria-checked={selected.has(c.id)} tabIndex={0} onClick={e=>{e.stopPropagation();setSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n})}} onKeyDown={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();e.stopPropagation();setSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n})}}} style={{fontSize:12,fontWeight:500,color:selected.has(c.id)?"#4fc3f7":C.faint,cursor:"pointer",whiteSpace:"nowrap",userSelect:"none"}}>{selected.has(c.id)?"[✓]":"[ ]"}</span></td>
    {shown.map(([k])=>{
      if(k==="status")return <td key={k} tabIndex={0} data-grid-row={i} data-grid-col={navCol(k)} onKeyDown={e=>gridMove(e,null,i,navCol(k),navMax)} onClick={()=>{const o=["SUBS","FIXED","FAILED",""],n=o[(o.indexOf(c.status||"")+1)%o.length];updateWithAudit(c.id,"status",n)}} style={{...POS_TD,textAlign:"center",fontWeight:500,cursor:"pointer",color:c.status==="FIXED"?C.green:c.status==="SUBS"?C.purple:c.status==="FAILED"?C.red:C.faint}}>{c.status||""}</td>;
      if(k==="ex_region"||k==="to_region")return <RegionCell key={k} row={i} col={navCol(k)} maxCol={navMax} value={c[k]||""} onSave={v=>updateWithAudit(c.id,k,v)}/>;
      if(k==="p_and_c")return <td key={k} tabIndex={0} data-grid-row={i} data-grid-col={navCol(k)} onKeyDown={e=>gridMove(e,null,i,navCol(k),navMax)} onClick={()=>{const o=[null,1,2,3],x=o.findIndex(v=>String(v??"")===String(c.p_and_c??""));updateWithAudit(c.id,"p_and_c",o[(x+1)%o.length])}} style={{...POS_TD,textAlign:"center",fontWeight:500,cursor:"pointer",color:Number(c.p_and_c)===1?"#ff5b5b":Number(c.p_and_c)===2?"#ffad33":Number(c.p_and_c)===3?"#fff":C.faint}}>{c.p_and_c??""}</td>;
      if(k==="intelligence")return <td key={k} tabIndex={0} data-grid-row={i} data-grid-col={navCol(k)} onKeyDown={e=>gridMove(e,null,i,navCol(k),navMax)} onClick={()=>{const cur=String(c.intelligence||"").toUpperCase(),o=[null,"Quote","Fixture"],x=cur==="QUOTE"?1:cur==="FIXTURE"?2:0;updateWithAudit(c.id,"intelligence",o[(x+1)%o.length])}} style={{...POS_TD,textAlign:"center",cursor:"pointer",padding:"0 4px",height:32,lineHeight:"32px"}}>{c.intelligence&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",height:18,lineHeight:"16px",boxSizing:"border-box",padding:"0 5px",borderRadius:3,fontSize:9,fontWeight:800,color:String(c.intelligence).toUpperCase()==="FIXTURE"?C.green:C.blue,border:"1px solid "+(String(c.intelligence).toUpperCase()==="FIXTURE"?C.green+"88":C.blue+"88")}}>{c.intelligence.toUpperCase()}</span>}</td>;
      if(k==="tag")return <TagCell key={k} id={c.id} value={c.tag} onUpdate={updateWithAudit}/>;
      if(k==="updated")return <td key={k} style={{...POS_TD,textAlign:"center",color:C.faint}}>{c.updated?new Date(c.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>;
      const val=k==="charterer"?toTCase(c[k]||""):k==="qty"?normaliseQty(c[k]):k==="from"||k==="to"?fmtDateShort(c[k]):k==="freight"?(fmtFreight(c[k])||c[k]||""):c[k]||"";
      return <Editable key={k} row={i} col={navCol(k)} maxCol={navMax} value={val} align={["from","to"].includes(k)?"center":"left"} bold={k==="charterer"} color={k==="vessel"?C.blue:k==="charterer"?"#79c0ff":k==="qty"?C.amber:k==="freight"?"#a8e6a3":C.tx} onSave={v=>updateWithAudit(c.id,k,k==="charterer"||k==="load"||k==="disch"?toTCase(v):k==="qty"?normaliseQty(v):k==="freight"?(fmtFreight(v)||v):v)}/>;
    })}<td style={{...POS_TD,textAlign:"center",padding:0,verticalAlign:"middle",lineHeight:0,position:"relative",overflow:"visible"}} onMouseLeave={()=>setHoverRowId(null)}>{editorInitials(c.entered_by)&&<span onMouseEnter={()=>showAudit(c.id)} title={`Original: ${c.entered_by||"Unknown"}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,padding:0,margin:0,borderRadius:"50%",boxSizing:"border-box",fontSize:10,fontWeight:800,letterSpacing:"0.7px",lineHeight:"1",paddingTop:2,textAlign:"center",verticalAlign:"middle",color:(c.entered_by==="H"||editorInitials(c.entered_by)==="HH")?C.blue:C.green,border:"1px solid "+((c.entered_by==="H"||editorInitials(c.entered_by)==="HH")?"rgba(88,166,255,.55)":"rgba(67,233,123,.55)"),background:(c.entered_by==="H"||editorInitials(c.entered_by)==="HH")?"rgba(88,166,255,.08)":"rgba(67,233,123,.08)"}}>{editorInitials(c.entered_by)}</span>}{hoverRowId===c.id&&<div style={{position:"absolute",right:30,top:"100%",zIndex:30000,width:340,maxHeight:240,overflowY:"auto",padding:10,textAlign:"left",background:"#071223",border:"1px solid #3976b8",borderRadius:6,boxShadow:"0 12px 35px #000a",color:"#d9e8ff",fontSize:11,lineHeight:1.6}}><b>Original contributor: {c.entered_by||"—"}</b><div style={{color:"#79c0ff",marginTop:5}}>Edit history</div>{(auditRows[c.id]||[]).length?(auditRows[c.id]||[]).map((a,j)=><div key={j} style={{borderTop:"1px solid #26374c",padding:"5px 0"}}><b>{a.editor}</b> · {new Date(a.changed_at).toLocaleString("en-GB")}<div>{a.field}: {a.old_value||"—"} → {a.new_value||"—"}</div></div>):<div>{auditError?"Audit table unavailable — run supplied SQL":"No edits recorded yet"}</div>}</div>}</td><td style={{...POS_TD,textAlign:"center",padding:"0 2px"}}><button onClick={()=>setDeleteCargo(c)} style={{border:0,background:"none",color:C.red,cursor:"pointer"}}>×</button></td></tr>})}</tbody>
   </table>
  </div>
  {cargoTotal>cargoes.length&&<div style={{padding:"6px 10px",fontSize:11,color:C.faint}}>Loading cargo history: {cargoes.length.toLocaleString("nb-NO")} / {cargoTotal.toLocaleString("nb-NO")}…</div>}
  {filtered.length > pageRows.length && (
    <div style={{textAlign:"center",padding:"8px 0"}}>
      <button onClick={()=>setPage(p=>p+1)} style={{...btn(),padding:"6px 18px",fontSize:11}}>
        Show more ({filtered.length - pageRows.length} remaining)
      </button>
    </div>
  )}
 </div>;
}
