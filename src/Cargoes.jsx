import React,{useEffect,useMemo,useRef,useState,Suspense} from "react";
import { C } from "./constants";
import { toTCase,normaliseQty,fmtDateShort,fmtFreight } from "./utils";
import { supabase } from "./supabaseclient";
import { tagsForScope, tagColor } from "./TagManagement";

const EC=React.lazy(()=>import("./EC"));
const ParsePanel=React.lazy(()=>import("./ParsePanel"));
const RateMatrixCard=React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrixCard})));
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

const btn=(active=false)=>({fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:3,border:"1px solid "+(active?C.blue:C.bd),background:active?"rgba(88,166,255,.18)":C.bg3,color:active?"#d9ecff":"#9fc3f5",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
const input={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"6px 7px",outline:"none",boxSizing:"border-box"};
function weekBounds(offset=0){const n=new Date();n.setHours(0,0,0,0);const dow=(n.getDay()+6)%7;const m=new Date(n);m.setDate(n.getDate()-dow+offset*7);const s=new Date(m);s.setDate(m.getDate()+6);return[m,s];}
function CargoMonthChart({ data, total, loading }){
  const wrapRef = React.useRef(null);
  const [size, setSize] = React.useState({ w:520, h:180 });
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

  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const counts=data||[];
  if(!counts.length) return (
    <div style={{flex:1,background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,padding:"7px 7px 1px",display:"flex",alignItems:"center",justifyContent:"center",minWidth:0,boxSizing:"border-box",width:"100%",height:"100%"}}>
      <span style={{fontSize:11,color:C.faint}}>{loading?"Loading…":"No data"}</span>
    </div>
  );
  const W=Math.max(counts.length,2);
  const maxC=Math.max(1,...counts.map(b=>b.count));
  const SVG_W=size.w, SVG_H=size.h;
  const PAD={t:16,r:24,b:8,l:25};
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
  const yearStarts=pts.filter((p,i)=>i>0&&p.year!==pts[i-1].year);
  const peakIdx=counts.reduce((mx,b,i)=>b.count>counts[mx].count?i:mx,0);

  return(
    <div style={{flex:1,background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,padding:"7px 7px 1px",display:"flex",flexDirection:"column",gap:1,minWidth:0,boxSizing:"border-box",width:"100%",height:"100%"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em"}}>Cargoes entered by month</div>
        <div style={{fontSize:11,color:"rgba(88,166,255,0.7)",fontWeight:700}}>{total.toLocaleString()} total</div>
      </div>
      <div ref={wrapRef} style={{flex:1,minHeight:0,width:"100%",height:"100%",overflow:"hidden"}}>
        <svg width="100%" height="100%" viewBox={"0 0 "+SVG_W+" "+SVG_H} preserveAspectRatio="none" style={{display:"block",overflow:"visible",width:"100%",height:"100%"}}>
          <defs>
            <linearGradient id="cgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#58a6ff" stopOpacity="0.02"/>
            </linearGradient>
            <style>{`
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
              <line x1={p.x} y1={PAD.t-4} x2={p.x} y2={PAD.t+iH+20} stroke="rgba(88,166,255,0.22)" strokeWidth="1.5" strokeDasharray="4,3"/>
              <text x={p.x+3} y={PAD.t-6} fontSize="10" fill="rgba(88,166,255,0.5)" fontWeight="700">{p.year}</text>
            </g>
          ))}
          <path d={areaD} fill="url(#cgGrad)"/>
          <path d={pathD} fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="cgLine"/>
          {pts.map((p,i)=>{
            const showLabel=i===0||i===pts.length-1||i%step===0;
            return(
              <g key={i}>
                {p.count>0&&<circle cx={p.x} cy={p.y} r={i===peakIdx?4:2.5} fill={i===peakIdx?"#79c0ff":"#58a6ff"} stroke="#0c1729" strokeWidth="1.5"/>}
                {i===peakIdx&&(
                  <text x={p.x} y={p.y-9} textAnchor="middle" fontSize="10" fill="#79c0ff" fontWeight="700">{p.count}</text>
                )}
                {showLabel&&(
                  <text x={p.x} y={PAD.t+iH+16} textAnchor="middle" fontSize="10" fill="rgba(120,160,200,0.5)">{MONTHS[p.month]}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Stable filter column (module-level so children like RangeBox keep focus)
function COL({label,col,children}){
  return (
    <div style={{display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden",height:"100%"}}>
      <div style={{fontSize:9,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:"0.1em",padding:"0 0 4px 0",borderBottom:"1px solid "+C.bd2,marginBottom:4,whiteSpace:"nowrap",flexShrink:0}}>{label}</div>
      <div style={{display:"flex",flexDirection:"column",gap:1,overflowY:"auto",flex:1,minHeight:0}}>{children}</div>
    </div>
  );
}

// One-time global CSS to hide scrollbars on rows using the hscroll-hide class,
// while overflow-x:auto still scrolls (native touch drag on iPad/mobile,
// custom mouse-drag below for desktop).
function HScrollStyle(){
  return <style>{`
    .hscroll-hide{scrollbar-width:none;-ms-overflow-style:none;}
    .hscroll-hide::-webkit-scrollbar{display:none;}
  `}</style>;
}

// Horizontal row with iPhone-style "grab and drag" scrolling for desktop mouse
// users; touch devices (iPad) get native momentum scroll for free since
// overflow-x:auto already supports it — no extra code needed for touch.
function HScrollRow({children,style}){
  const ref = React.useRef(null);
  const drag = React.useRef({active:false,startX:0,startScroll:0,moved:false});
  function onDown(e){
    const el=ref.current; if(!el) return;
    drag.current={active:true,startX:e.pageX,startScroll:el.scrollLeft,moved:false};
  }
  function onMove(e){
    if(!drag.current.active) return;
    const el=ref.current; if(!el) return;
    const dx=e.pageX-drag.current.startX;
    if(Math.abs(dx)>3) drag.current.moved=true;
    el.scrollLeft=drag.current.startScroll-dx;
  }
  function endDrag(){ drag.current.active=false; }
  return (
    <div
      ref={ref}
      className="hscroll-hide"
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      // Suppress click-through on chips right after a drag, so dragging
      // doesn't accidentally toggle whatever chip the cursor lands on.
      onClickCapture={e=>{ if(drag.current.moved){ e.stopPropagation(); e.preventDefault(); drag.current.moved=false; } }}
      style={{display:"flex",gap:8,overflowX:"auto",overflowY:"hidden",flex:1,minWidth:0,cursor:"grab",userSelect:"none",WebkitOverflowScrolling:"touch",...style}}
    >
      {children}
    </div>
  );
}

// One filter category as a full-width horizontal row: label on the left,
// chips scrolling horizontally on the right (drag or touch-swipe if they
// overflow the width — no visible scrollbar).
function FilterRow({label,col,children}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"5px 2px",borderBottom:"1px solid "+C.bd2,minWidth:0}}>
      <div style={{width:80,flexShrink:0,fontSize:10,fontWeight:800,color:col,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>
      <HScrollRow style={{gap:6}}>{children}</HScrollRow>
    </div>
  );
}

// Wrapping variant (no horizontal scroll) — for rows with few enough items
// that wrapping onto a second line reads better than side-scrolling, like
// DWT/Built which pair a short chip list with two small range inputs.
function FilterRowWrap({label,col,children}){
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 2px",borderBottom:"1px solid "+C.bd2,minWidth:0}}>
      <div style={{width:80,flexShrink:0,fontSize:10,fontWeight:800,color:col,textTransform:"uppercase",letterSpacing:"0.04em",paddingTop:4}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,flex:1,minWidth:0,rowGap:6}}>{children}</div>
    </div>
  );
}

// Two-tab panel wrapper (used for Fixing Window History/Open-Segments and
// AIS Map/Regional Snapshot) — frees up horizontal space by combining what
// used to be two separate side-by-side boxes into one.
// One-line tappable header that expands to full content below it — used to
// give mobile access to sections (Parse, Filters, Fixing Window, Map) that
// are normally laid out side-by-side on desktop but don't fit that way on a
// phone/iPad width.
function MobileCollapse({ title, color="#58a6ff", defaultOpen=false, children }){
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ background:C.bg2, border:"1px solid "+C.bd, borderRadius:7, overflow:"hidden" }}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"10px 12px", background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit",
          minHeight:44, boxSizing:"border-box" }}>
        <span style={{ fontSize:13, fontWeight:700, color }}>{title}</span>
        <span style={{ fontSize:12, color:C.faint }}>{open?"▾":"▸"}</span>
      </button>
      {open && <div style={{ padding:"0 10px 10px" }}>{children}</div>}
    </div>
  );
}
function BunkerHeader(){
 const [b,setB]=useState(null);
 useEffect(()=>{supabase.from("dashboard").select("value").eq("key","last-bunker-prices").maybeSingle().then(({data})=>setB(data?.value||null));},[]);
 return <div style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:C.faint}}>BUNKER <Suspense fallback={null}><RateMatrixBunkerInput value={b?.ARA_MGO||b?.ara_mgo||null}/></Suspense></div>;
}
function useMonthly(){
 const [week,setWeek]=useState({thisWk:0,lastWk:0}),[monthly,setMonthly]=useState([]),[loading,setLoading]=useState(true);
 useEffect(()=>{(async()=>{const [tm,ts]=weekBounds(0),[lm,ls]=weekBounds(-1),fmt=d=>d.toISOString().slice(0,10);
  const [{count:a},{count:b}]=await Promise.all([supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",fmt(tm)).lte("updated",fmt(ts)+"T23:59:59"),supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",fmt(lm)).lte("updated",fmt(ls)+"T23:59:59")]);setWeek({thisWk:a||0,lastWk:b||0});
  const now=new Date(),months=[];for(let i=23;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(d);}
  const results=await Promise.all(months.map(d=>{const n=new Date(d.getFullYear(),d.getMonth()+1,1);return supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",d.toISOString().slice(0,10)).lt("updated",n.toISOString().slice(0,10)).then(({count})=>({year:d.getFullYear(),month:d.getMonth(),count:count||0}));}));
  setMonthly(results);setLoading(false);
 })();},[]);
 return {week,monthly,loading};
}
function TagCell({id,value,onUpdate}){
 const [open,setOpen]=useState(false),[pos,setPos]=useState({top:0,left:0}),[newTag,setNewTag]=useState(""),ref=useRef(null);
 const list=tagList();
 function show(){if(ref.current){const r=ref.current.getBoundingClientRect(),z=parseFloat(getComputedStyle(document.body).zoom||"1")||1,w=170*z,h=(110+list.length*27)*z,m=12;let l=r.left-w-6;if(l<m)l=r.right+6;l=Math.max(m,Math.min(l,innerWidth-w-m));let t=Math.max(m,Math.min(r.top-8,innerHeight-h-m));setPos({left:l/z,top:t/z});}setOpen(true);}
 function addAndPick(){const t=newTag.trim().toUpperCase();if(!t)return;try{const custom=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");if(!custom.includes(t)&&!PRESET_TAGS.includes(t))localStorage.setItem("signal_custom_tags",JSON.stringify([...custom,t]));}catch{}onUpdate(id,"tag",t);setNewTag("");setOpen(false);}
 return <><td style={{...POS_TD,textAlign:"center",padding:"0 3px"}}><button ref={ref} onClick={show} style={{background:"transparent",border:"1px solid "+C.bd,borderRadius:3,color:value?C.blue:C.faint,fontSize:9,cursor:"pointer",minWidth:20}}>{value||"+"}</button></td>
 {open&&<><div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:19990}}/><div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:19999,width:170,background:"#071223",border:"1px solid "+C.blue,borderRadius:7,padding:6,boxShadow:"0 12px 30px rgba(0,0,0,.7)"}}>
 {list.map(t=>{const tc=tagColor(t);return <button key={t} onClick={()=>{onUpdate(id,"tag",value===t?"":t);setOpen(false)}} style={{display:"flex",alignItems:"center",gap:6,width:"100%",textAlign:"left",padding:"6px 7px",marginBottom:2,background:value===t?"rgba(88,166,255,.16)":"transparent",border:"1px solid "+(value===t?C.blue:C.bd2),borderRadius:3,color:tc||(value===t?"#fff":"#9fc3f5"),fontSize:9,fontWeight:700,cursor:"pointer"}}>{tc&&<span style={{width:6,height:6,borderRadius:"50%",background:tc,flexShrink:0}}/>}{t}</button>;})}
 <input value={newTag} onChange={e=>setNewTag(e.target.value)} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.key==="Enter"&&addAndPick()} placeholder="New tag + Enter"
   style={{width:"100%",marginTop:3,background:"#0a1526",border:"1px solid "+C.bd2,borderRadius:3,color:C.tx,fontFamily:"inherit",fontSize:9,fontWeight:600,padding:"6px 7px",outline:"none",boxSizing:"border-box"}}/>
 </div></>}</>;
}
function RegionCell({value,onSave}){
 const [edit,setEdit]=useState(false),[draft,setDraft]=useState(value||""),ref=useRef(null);
 const matches=REGIONS.filter(r=>!draft||r.toLowerCase().startsWith(draft.toLowerCase())||r.toLowerCase().includes(draft.toLowerCase()));
 function commit(){const q=draft.trim(),hit=REGIONS.find(r=>r.toLowerCase()===q.toLowerCase())||REGIONS.find(r=>r.toLowerCase().startsWith(q.toLowerCase()));if(!q)onSave("");else if(hit)onSave(hit);setEdit(false);}
 return <td style={{padding:"6px 7px",fontWeight:700,color:C.tx,position:"relative"}} onClick={()=>{setDraft(value||"");setEdit(true);setTimeout(()=>ref.current?.focus(),0)}}>
 {!edit?value||"":<input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>setTimeout(commit,80)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();commit()}if(e.key==="Escape")setEdit(false)}} style={{...input,width:"100%",height:24,fontWeight:700,textTransform:"uppercase",background:"#071223"}}/>}
 {edit&&matches.length>0&&<div style={{position:"absolute",left:4,top:29,zIndex:15000,minWidth:145,background:"#071223",border:"1px solid "+C.bd,borderRadius:5,padding:3,boxShadow:"0 8px 25px rgba(0,0,0,.65)"}}>{matches.slice(0,8).map(r=><div key={r} onMouseDown={e=>{e.preventDefault();onSave(r);setEdit(false)}} style={{padding:"4px 6px",fontSize:9,fontWeight:700,cursor:"pointer"}}>{r}</div>)}</div>}
 </td>;
}
function editorInitials(v){
 const x=String(v||"").trim();
 if(!x)return "";
 if(x==="H")return "HH";
 if(x==="L")return "HL";
 const p=x.split(/\s+/).filter(Boolean);
 if(p.length>1)return (p[0][0]+p[p.length-1][0]).toUpperCase();
 return x.slice(0,2).toUpperCase();
}

function Editable({value,onSave,color,bold,align="left"}){
 const [e,setE]=useState(false),[v,setV]=useState(value??"");useEffect(()=>setV(value??""),[value]);
 return <td onDoubleClick={()=>setE(true)} onClick={()=>setE(true)} style={{...POS_TD,padding:e?"1px 2px":POS_TD.padding,color:color||C.tx,fontWeight:bold?700:500,textAlign:align}}>
 {e?<input autoFocus value={v} onChange={x=>setV(x.target.value)} onBlur={()=>{setE(false);if(v!==value)onSave(v)}} onKeyDown={x=>{if(x.key==="Enter"){x.currentTarget.blur()}if(x.key==="Escape"){setV(value??"");setE(false)}}} style={{width:"100%",height:27,lineHeight:"25px",padding:"0 5px",margin:0,border:"1px solid rgba(58,130,246,.32)",borderRadius:4,outline:"none",boxShadow:"none",background:"rgba(20,39,66,.78)",color:color||C.tx,fontFamily:"inherit",fontSize:12,fontWeight:bold?700:500,textTransform:"uppercase",boxSizing:"border-box",textAlign:align}}/>:<span title={String(value||"")}>{value||""}</span>}</td>;
}
function AddRow({onSave,onClose,quotes=false}){
 const [r,setR]=useState({});const f=(k,p)=><input value={r[k]||""} onChange={e=>setR(x=>({...x,[k]:e.target.value}))} placeholder={p} style={{...input,width:"100%",height:22,padding:"0 6px"}}/>;
 const save=async()=>{if(!r.charterer&&!r.cargo)return onClose();await onSave({...r,updated:new Date().toISOString(),intelligence:quotes?(r.intelligence||""):undefined});onClose();};
 return <div style={{...card,padding:"4px 6px",display:"grid",gridTemplateColumns:quotes?"90px 90px 50px 70px 120px 120px 70px 90px 100px 120px 75px 75px 110px 1fr 50px":"100px 120px 70px 90px 100px 120px 75px 75px 110px 1fr 50px",gap:4,alignItems:"center"}}>
 {quotes&&<>{f("ex_region","Ex region")}{f("to_region","To region")}{f("p_and_c","P&C")}{f("intelligence","Intel")}</>}
 {f("vessel","Vessel")}{f("charterer","Charterer")}{f("qty","Qty")}{f("cargo","Cargo")}{f("load","Load")}{f("disch","Disch")}{f("from","From")}{f("to","To")}{f("freight","Freight")}{f("comment","Comment")}<button onClick={save} style={{...btn(true),height:22,padding:"0 8px"}}>Save</button>
 </div>;
}

export default function Cargoes({vessels=[],cargoes=[],cargoTotal=0,onUpdateC,onAddCargoes,onAddC,onDelC,onAddVessels,onCargoSearch}){
 const [search,setSearch]=useState(""),[status,setStatus]=useState("ALL"),[time,setTime]=useState(""),[grade,setGrade]=useState(""),[tag,setTag]=useState(""),[parseTag,setParseTag]=useState(""),[showAdd,setShowAdd]=useState(false),[sort,setSort]=useState("added"),[dir,setDir]=useState(-1);
 const [page,setPage]=useState(1);
 const PAGE_SIZE=200;
 const [hoverRowId,setHoverRowId]=useState(null);
 const [selected,setSelected]=useState(()=>new Set());
 const {week,monthly,loading:monthlyLoading}=useMonthly();
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
 useEffect(()=>{setPage(1);},[search,status,time,grade,tag,sort,dir]);
 const pageRows=useMemo(()=>filtered.slice(0,page*PAGE_SIZE),[filtered,page]);
 const widths=["1.5%","4.5%","11%","10%","4%","6%","8%","11%","4.5%","4.5%","7%","14%","4%","7%","1.5%","1.5%"];
 return <div style={{display:"flex",flexDirection:"column",gap:8}}>
  <div style={{display:"flex",gap:10,height:260}}>
   <div style={{flex:"0 0 25%",minWidth:0,height:"100%",display:"flex",flexDirection:"column",gap:4,overflow:"hidden"}}>
    <div style={{...card,padding:"7px 8px",display:"flex",gap:4,flexWrap:"wrap",alignContent:"flex-start",flex:"0 0 auto",maxHeight:78,overflowY:"auto"}}><span style={{fontSize:9,color:C.faint,fontWeight:800,width:"100%",marginBottom:2}}>TAG ON PARSE</span>{tagList().map(t=><button key={t} onClick={()=>setParseTag(x=>x===t?"":t)} style={btn(parseTag===t)}>{t}</button>)}</div>
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",overflow:"hidden"}}><Suspense fallback={null}><ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels} onAddCargoes={async p=>{const u=localStorage.getItem("signal_user")||"H";const r=await onAddCargoes(p.map(c=>({...c,entered_by:u,tag:parseTag||c.tag||""})));setParseTag("");return r}} lockedMode="cargo" vesselDB={{}}/></Suspense></div>
   </div>
   <div style={{flex:"0 0 25%",minWidth:0,...card,padding:8,display:"flex",flexDirection:"column",gap:8,overflow:"hidden"}}>
    <div><b style={{fontSize:9,color:C.blue}}>GRADE</b><div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{grades.map(g=><button key={g.id} onClick={()=>setGrade(x=>x===g.id?"":g.id)} style={btn(grade===g.id)}>{g.label}</button>)}</div></div>
    <div><b style={{fontSize:9,color:C.dim}}>PERIOD</b><div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{[["","All"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].map(([k,l])=><button key={l} onClick={()=>setTime(k)} style={btn(time===k)}>{l}</button>)}</div></div>
    <div><b style={{fontSize:9,color:C.pink}}>TAG</b><div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>{tags.map(t=><button key={t} onClick={()=>setTag(x=>x===t?"":t)} style={btn(tag===t)}>{t}</button>)}</div></div>
   </div>
   <div style={{flex:"0 0 25%",minWidth:0,alignSelf:"flex-start",position:"relative",zIndex:30}}><Suspense fallback={null}><RateMatrixCard collapsedHeight={260} bunkerHeader={<BunkerHeader/>}/></Suspense></div>
   <div style={{flex:"1 1 25%",minWidth:0,height:"100%",display:"flex",alignSelf:"stretch"}}><CargoMonthChart data={monthly} total={cargoTotal||cargoes.length} loading={monthlyLoading}/></div>
  </div>
  <div style={{...card,padding:"5px 8px",display:"flex",gap:6,alignItems:"center"}}>
   <button onClick={()=>setShowAdd(true)} style={{...btn(),color:C.amber}}>+ Add cargo</button>
   <button onClick={()=>navigator.clipboard?.writeText(filtered.map(c=>[c.status,c.vessel,c.charterer,c.qty,c.cargo,c.load,c.disch,fmtDateShort(c.from),fmtDateShort(c.to),fmtFreight(c.freight)||c.freight,c.comment].join("\\t")).join("\\n"))} style={btn()}>Copy all</button>
   <button onClick={()=>{const csv=filtered.map(c=>[c.status,c.vessel,c.charterer,c.qty,c.cargo,c.load,c.disch,c.from,c.to,c.freight,c.comment,c.tag,c.updated].map(x=>`"${String(x||"").replaceAll('"','""')}"`).join(",")).join("\\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="cargoes.csv";a.click()}} style={btn()}>Copy CSV</button>
   <span style={{fontSize:10,color:C.faint}}>This wk <b style={{color:C.blue}}>{week.thisWk}</b>&nbsp;&nbsp; Last wk <b>{week.lastWk}</b></span>
   <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cargoes..." style={{...input,width:210}}/><span style={{fontSize:10,color:C.faint}}>Total <b style={{color:C.tx}}>{cargoTotal||cargoes.length}</b></span><select value={sort} onChange={e=>setSort(e.target.value)} style={input}><option value="added">Added</option><option value="updated">Updated</option><option value="charterer">Charterer</option><option value="from">Laycan</option></select><button onClick={()=>setDir(d=>-d)} style={btn()}>{dir>0?"▲":"▼"}</button></div>
  </div>
  {showAdd&&<AddRow onSave={onAddC} onClose={()=>setShowAdd(false)}/>}
  <div style={POS_WRAP} className="pos-hover-rows">
   <style>{`.pos-hover-rows tr:hover{background:rgba(88,166,255,0.07)!important;}`}</style>
   <table style={POS_TABLE}>
    <colgroup>{widths.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
    <thead><tr>{["","Status","Vessel","Charterer","Qty","Cargo","Load","Disch","From","To","Freight","Comment","Tag","Updated","",""].map((h,i)=>i===0?<th key={i} onClick={()=>{const ids=pageRows.map(x=>x.id);const all=ids.length>0&&ids.every(id=>selected.has(id));setSelected(p=>{const n=new Set(p);ids.forEach(id=>all?n.delete(id):n.add(id));return n})}} style={{...POS_TH,textAlign:"center",cursor:"pointer",padding:"3px 1px",lineHeight:"11px"}}><div style={{fontSize:11,color:pageRows.length>0&&pageRows.every(x=>selected.has(x.id))?"#4fc3f7":C.faint}}>{pageRows.length>0&&pageRows.every(x=>selected.has(x.id))?"[✓]":"[ ]"}</div><div style={{fontSize:7,color:C.faint}}>ALL</div></th>:<th key={i} style={{...POS_TH,textAlign:i>13||["Status","Qty","From","To","Freight","Tag","Updated"].includes(h)?"center":"left"}}>{h}</th>)}</tr></thead>
    <tbody>{pageRows.map((c,i)=>{const rowBg=POS_ROW(i);return <tr key={c.id} style={{background:rowBg,height:32}}>
     <td onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} style={{...POS_TD,textAlign:"center",padding:"0 2px",overflow:"visible"}}><span role="checkbox" aria-checked={selected.has(c.id)} tabIndex={0} onClick={e=>{e.stopPropagation();setSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n})}} onKeyDown={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();e.stopPropagation();setSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n})}}} style={{fontSize:12,fontWeight:500,color:selected.has(c.id)?"#4fc3f7":C.faint,cursor:"pointer",whiteSpace:"nowrap",userSelect:"none"}}>{selected.has(c.id)?"[✓]":"[ ]"}</span></td>
     <td onClick={()=>{const o=["SUBS","FIXED","FAILED",""],n=o[(o.indexOf(c.status||"")+1)%o.length];onUpdateC(c.id,"status",n)}} style={{...POS_TD,textAlign:"center",fontWeight:500,cursor:"pointer",color:c.status==="FIXED"?C.green:c.status==="SUBS"?C.purple:c.status==="FAILED"?C.red:C.faint}}>{c.status||""}</td>
     <Editable value={c.vessel||""} color={C.blue} onSave={v=>onUpdateC(c.id,"vessel",v)}/>
     <Editable value={toTCase(c.charterer||"")} bold color="#79c0ff" onSave={v=>onUpdateC(c.id,"charterer",toTCase(v))}/>
     <Editable value={normaliseQty(c.qty)} align="center" color={C.amber} onSave={v=>onUpdateC(c.id,"qty",normaliseQty(v))}/>
     <Editable value={c.cargo||""} onSave={v=>onUpdateC(c.id,"cargo",v)}/>
     <Editable value={toTCase(c.load||"")} onSave={v=>onUpdateC(c.id,"load",toTCase(v))}/>
     <Editable value={toTCase(c.disch||"")} onSave={v=>onUpdateC(c.id,"disch",toTCase(v))}/>
     <Editable value={fmtDateShort(c.from)} align="center" onSave={v=>onUpdateC(c.id,"from",v)}/>
     <Editable value={fmtDateShort(c.to)} align="center" onSave={v=>onUpdateC(c.id,"to",v)}/>
     <Editable value={fmtFreight(c.freight)||c.freight||""} align="center" color="#a8e6a3" onSave={v=>onUpdateC(c.id,"freight",fmtFreight(v)||v)}/>
     <Editable value={c.comment||""} color={C.dim} onSave={v=>onUpdateC(c.id,"comment",v)}/>
     <TagCell id={c.id} value={c.tag} onUpdate={onUpdateC}/>
     <td style={{...POS_TD,textAlign:"center",color:C.faint}}>{c.updated?new Date(c.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>
     <td style={{...POS_TD,textAlign:"center",padding:0,verticalAlign:"middle",lineHeight:0}}>{editorInitials(c.entered_by)&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,padding:0,margin:0,borderRadius:"50%",boxSizing:"border-box",fontSize:7,fontWeight:700,lineHeight:"18px",textAlign:"center",verticalAlign:"middle",color:(c.entered_by==="H"||editorInitials(c.entered_by)==="HH")?C.blue:C.green,border:"1px solid "+((c.entered_by==="H"||editorInitials(c.entered_by)==="HH")?"rgba(88,166,255,.55)":"rgba(67,233,123,.55)"),background:(c.entered_by==="H"||editorInitials(c.entered_by)==="HH")?"rgba(88,166,255,.08)":"rgba(67,233,123,.08)"}}>{editorInitials(c.entered_by)}</span>}</td>
     <td style={{...POS_TD,textAlign:"center",padding:"0 2px"}}><button onClick={()=>confirm("Delete cargo?")&&onDelC(c.id)} style={{border:0,background:"none",color:C.red,cursor:"pointer"}}>×</button></td>
    </tr>})}</tbody>
   </table>
  </div>
  {filtered.length > pageRows.length && (
    <div style={{textAlign:"center",padding:"8px 0"}}>
      <button onClick={()=>setPage(p=>p+1)} style={{...btn(),padding:"6px 18px",fontSize:11}}>
        Show more ({filtered.length - pageRows.length} remaining)
      </button>
    </div>
  )}
 </div>;
}
