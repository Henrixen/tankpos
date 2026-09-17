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

const POS_TH={
  background:C.bg2,
  color:C.dim,
  fontSize:12,
  fontWeight:700,
  textTransform:"uppercase",
  letterSpacing:"0.07em",
  padding:"7px 8px",
  borderBottom:"1px solid "+C.bd2,
  textAlign:"left",
  whiteSpace:"nowrap",
  verticalAlign:"middle",
  fontFamily:"sans-serif"
};
const POS_TD={
  padding:"6px 8px",
  color:"#d9e8ff",
  fontWeight:500,
  fontSize:12,
  borderBottom:"1px solid rgba(255,255,255,0.025)",
  verticalAlign:"middle",
  whiteSpace:"nowrap",
  overflow:"hidden",
  textOverflow:"ellipsis",
  textTransform:"uppercase",
  fontFamily:"sans-serif",
  lineHeight:"16px"
};
const POS_ROW=i=>i%2===0?"rgba(11,25,45,0.96)":"rgba(18,34,57,0.96)";
const POS_TABLE={width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:12,tableLayout:"fixed",fontFamily:"sans-serif"};
const POS_WRAP={border:"1px solid "+C.bd,borderRadius:8,overflow:"auto",minWidth:0,background:C.bg2,boxShadow:"inset 0 1px 0 rgba(88,166,255,0.06)"};

const btn=(active=false)=>({fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:3,border:"1px solid "+(active?C.blue:C.bd),background:active?"rgba(88,166,255,.18)":C.bg3,color:active?"#d9ecff":"#9fc3f5",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
const input={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:11,padding:"6px 7px",outline:"none",boxSizing:"border-box"};
function weekBounds(offset=0){const n=new Date();n.setHours(0,0,0,0);const dow=(n.getDay()+6)%7;const m=new Date(n);m.setDate(n.getDate()-dow+offset*7);const s=new Date(m);s.setDate(m.getDate()+6);return[m,s];}
function CargoMonthChart({ data, total }){
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
  if(!counts.length) return null;
  const W=Math.max(counts.length,2);
  const maxC=Math.max(1,...counts.map(b=>b.count));
  const SVG_W=size.w, SVG_H=size.h;
  const PAD={t:20,r:12,b:28,l:36};
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
    <div style={{flex:1,background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,padding:"8px 10px 6px",display:"flex",flexDirection:"column",gap:4,minWidth:0,boxSizing:"border-box",height:260}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{fontSize:12,fontWeight:700,color:C.dim,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"sans-serif"}}>Cargoes entered by month</div>
        <div style={{fontSize:12,color:"rgba(88,166,255,0.7)",fontWeight:700,fontFamily:"sans-serif"}}>{total.toLocaleString()} total</div>
      </div>
      <div ref={wrapRef} style={{flex:1,minHeight:0,width:"100%"}}>
        <svg width={SVG_W} height={SVG_H} viewBox={"0 0 "+SVG_W+" "+SVG_H} style={{display:"block",overflow:"visible"}}>
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
 return <><td style={{...POS_TD,textAlign:"center",padding:"0 3px"}}><button ref={ref} onClick={show} style={{background:"transparent",border:"1px solid "+C.bd,borderRadius:3,color:value?C.blue:C.faint,fontSize:11,fontWeight:700,cursor:"pointer",minWidth:24,lineHeight:"15px"}}>{value||"+"}</button></td>
 {open&&<><div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:19990}}/><div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:19999,width:160,maxHeight:360,overflowY:"auto",background:"#071223",border:"1px solid "+C.bd,borderRadius:7,padding:5,boxShadow:"0 12px 30px rgba(0,0,0,.7)"}}>
 {tagList().map(t=><button key={t} onClick={()=>{onUpdate(id,"tag",value===t?"":t);setOpen(false)}} style={{display:"block",width:"100%",textAlign:"left",padding:"6px 7px",marginBottom:2,background:value===t?"rgba(88,166,255,.16)":"transparent",border:"1px solid "+(value===t?C.blue:C.bd2),borderRadius:3,color:value===t?"#fff":"#9fc3f5",fontSize:11,fontWeight:700,cursor:"pointer"}}>{t}</button>)}</div></>}</>;
}
function RegionCell({value,onSave}){
 const [edit,setEdit]=useState(false),[draft,setDraft]=useState(value||""),ref=useRef(null);
 const matches=REGIONS.filter(r=>!draft||r.toLowerCase().startsWith(draft.toLowerCase())||r.toLowerCase().includes(draft.toLowerCase()));
 function commit(){const q=draft.trim(),hit=REGIONS.find(r=>r.toLowerCase()===q.toLowerCase())||REGIONS.find(r=>r.toLowerCase().startsWith(q.toLowerCase()));if(!q)onSave("");else if(hit)onSave(hit);setEdit(false);}
 return <td style={{padding:"6px 7px",fontWeight:700,color:C.tx,position:"relative"}} onClick={()=>{setDraft(value||"");setEdit(true);setTimeout(()=>ref.current?.focus(),0)}}>
 {!edit?value||"":<input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>setTimeout(commit,80)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();commit()}if(e.key==="Escape")setEdit(false)}} style={{width:"100%",height:"16px",lineHeight:"16px",padding:0,margin:0,border:0,outline:"none",boxShadow:"none",background:"transparent",color:C.tx,fontFamily:"sans-serif",fontSize:12,fontWeight:500,textTransform:"uppercase",boxSizing:"border-box"}}/>}
 {edit&&matches.length>0&&<div style={{position:"absolute",left:4,top:29,zIndex:15000,minWidth:145,background:"#071223",border:"1px solid "+C.bd,borderRadius:5,padding:3,boxShadow:"0 8px 25px rgba(0,0,0,.65)"}}>{matches.slice(0,8).map(r=><div key={r} onMouseDown={e=>{e.preventDefault();onSave(r);setEdit(false)}} style={{padding:"4px 6px",fontSize:9,fontWeight:700,cursor:"pointer"}}>{r}</div>)}</div>}
 </td>;
}
function Editable({value,onSave,color,bold}){
 const [e,setE]=useState(false),[v,setV]=useState(value??"");useEffect(()=>setV(value??""),[value]);
 return <td onDoubleClick={()=>setE(true)} onClick={()=>setE(true)} style={{...POS_TD,color:color||C.tx,fontWeight:bold?700:500}}>
 {e?<input autoFocus value={v} onChange={x=>setV(x.target.value)} onBlur={()=>{setE(false);if(v!==value)onSave(v)}} onKeyDown={x=>{if(x.key==="Enter"){x.currentTarget.blur()}if(x.key==="Escape"){setV(value??"");setE(false)}}} style={{width:"100%",height:"16px",lineHeight:"16px",padding:0,margin:0,border:0,outline:"none",boxShadow:"none",background:"transparent",color:color||C.tx,fontFamily:"sans-serif",fontSize:12,fontWeight:bold?700:500,textTransform:"uppercase",boxSizing:"border-box"}}/>:<span title={String(value||"")}>{value||""}</span>}</td>;
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
 const widths=["1.5%","4.5%","8%","8%","4%","6%","7%","8%","4.5%","4.5%","6.5%","15%","4%","6%","1%","1.5%"];
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
  <div style={POS_WRAP}>
   <table style={POS_TABLE}>
    <colgroup>{widths.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
    <thead><tr>{["","Status","Vessel","Charterer","Qty","Cargo","Load","Disch","From","To","Freight","Comment","Tag","Updated","",""].map((h,i)=><th key={i} style={{...POS_TH,textAlign:i===0||i>13?"center":(["Qty","From","To","Freight"].includes(h)?"right":"left")}}>{h}</th>)}</tr></thead>
    <tbody>{filtered.slice(0,200).map((c,i)=><tr key={c.id} style={{background:POS_ROW(i),height:32}}>
     <td style={{...POS_TD,textAlign:"center",color:C.faint,padding:"0 2px"}}>[ ]</td>
     <td onClick={()=>{const o=["SUBS","FIXED","FAILED",""],n=o[(o.indexOf(c.status||"")+1)%o.length];onUpdateC(c.id,"status",n)}} style={{...POS_TD,textAlign:"center",fontWeight:800,cursor:"pointer",color:c.status==="FIXED"?C.green:c.status==="SUBS"?C.purple:c.status==="FAILED"?C.red:C.faint}}>{c.status||""}</td>
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
     <td style={{...POS_TD,textAlign:"center",color:C.faint}}>{c.updated?new Date(c.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>
     <td style={{...POS_TD,textAlign:"center",padding:"0 2px"}}>{(c.entered_by==="H"||c.entered_by==="L")&&<span style={{fontSize:8,color:c.entered_by==="H"?C.blue:C.green}}>{c.entered_by}</span>}</td>
     <td style={{...POS_TD,textAlign:"center",padding:"0 2px"}}><button onClick={()=>confirm("Delete cargo?")&&onDelC(c.id)} style={{border:0,background:"none",color:C.red,cursor:"pointer"}}>×</button></td>
    </tr>)}</tbody>
   </table>
  </div>
 </div>;
}
