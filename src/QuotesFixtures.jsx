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
 return <td style={{...POS_TD,fontWeight:500,color:C.tx,position:"relative"}} onClick={()=>{setDraft(value||"");setEdit(true);setTimeout(()=>ref.current?.focus(),0)}}>
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

export default function QuotesFixtures({vessels=[],cargoes=[],cargoTotal=0,onUpdateC,onAddCargoes,onAddC,onDelC,onAddVessels,onCargoSearch}){
 const [search,setSearch]=useState(""),[status,setStatus]=useState("ALL"),[time,setTime]=useState(""),[grade,setGrade]=useState(""),[tag,setTag]=useState(""),[ex,setEx]=useState(""),[toR,setToR]=useState(""),[parseTag,setParseTag]=useState(""),[showAdd,setShowAdd]=useState(false),[sort,setSort]=useState("added"),[dir,setDir]=useState(-1);
 const [visible,setVisible]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem("signal_qf_visible_columns")||"[]"))}catch{return new Set()}});
 const defaults=["status","ex_region","to_region","p_and_c","intelligence","vessel","charterer","qty","cargo","load","disch","from","to","freight","comment"];
 useEffect(()=>{if(!visible.size)setVisible(new Set(defaults))},[]);
 useEffect(()=>{try{localStorage.setItem("signal_qf_visible_columns",JSON.stringify([...visible]))}catch{}},[visible]);
 const [colsOpen,setColsOpen]=useState(false),[colsPos,setColsPos]=useState({top:0,left:0});
 const {week,monthly}=useMonthly();
 const groups=useMemo(()=>{try{return JSON.parse(localStorage.getItem("signal_cargo_filter_groups")||"[]")}catch{return[]}},[cargoes.length]),grades=groups.filter(g=>(g.category||"grade")==="grade"),tags=[...new Set(cargoes.map(c=>c.tag).filter(Boolean))].sort();
 const filtered=useMemo(()=>{let a=cargoes.filter(c=>{if(ex&&c.ex_region!==ex)return false;if(toR&&c.to_region!==toR)return false;if(status!=="ALL"&&c.status!==status)return false;if(tag&&c.tag!==tag)return false;if(grade&&!String(c.cargo||"").toLowerCase().includes(grade.toLowerCase()))return false;if(search&&!JSON.stringify(c).toLowerCase().includes(search.toLowerCase()))return false;return true});const f=sort==="added"?"added":sort;return [...a].sort((x,y)=>{let A=x[f]||x.updated||"",B=y[f]||y.updated||"";if(f==="added"||f==="updated"){A=new Date(A||0).getTime();B=new Date(B||0).getTime()}return(A<B?-1:A>B?1:0)*dir})},[cargoes,search,status,tag,grade,ex,toR,sort,dir]);
 const allCols=[["status","Status",4],["ex_region","Ex Region",6],["to_region","To Region",6],["p_and_c","P&C",3],["intelligence","Intel",4],["vessel","Vessel",9],["charterer","Charterer",10],["qty","Qty",4],["cargo","Cargo",6],["load","Load",9],["disch","Disch",12],["from","From",4],["to","To",4],["freight","Freight",7],["comment","Comment",11],["tag","Tag",4],["source","Source",6],["updated","Updated",6]];
 const shown=allCols.filter(([k])=>visible.has(k));
 return <div style={{display:"flex",flexDirection:"column",gap:8}}>
  <div style={{display:"flex",gap:10,height:260}}>
   <div style={{flex:"0 0 25%",display:"flex",flexDirection:"column",gap:4}}><div style={{...card,padding:"5px 8px",display:"flex",gap:4,flexWrap:"wrap"}}><span style={{fontSize:9,color:C.faint,fontWeight:800}}>TAG ON PARSE</span>{tagList().map(t=><button key={t} onClick={()=>setParseTag(x=>x===t?"":t)} style={btn(parseTag===t)}>{t}</button>)}</div><div style={{flex:1}}><Suspense fallback={null}><ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels} onAddCargoes={async p=>{const r=await onAddCargoes(p.map(c=>({...c,tag:parseTag||c.tag||""})));setParseTag("");return r}} lockedMode="cargo" vesselDB={{}}/></Suspense></div></div>
   <div style={{flex:"0 0 40%",...card,padding:8,display:"grid",gridTemplateColumns:".8fr .8fr .8fr 1.6fr 1.6fr",gap:6,overflow:"hidden"}}>
    <div><b style={{fontSize:9,color:C.blue}}>GRADE</b>{grades.slice(0,6).map(g=><button key={g.id} onClick={()=>setGrade(x=>x===g.id?"":g.id)} style={{...btn(grade===g.id),display:"block",width:"100%",marginTop:3,textAlign:"left"}}>{g.label}</button>)}</div>
    <div><b style={{fontSize:9,color:C.dim}}>PERIOD</b>{[["","All"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].map(([k,l])=><button key={l} onClick={()=>setTime(k)} style={{...btn(time===k),display:"block",width:"100%",marginTop:3,textAlign:"left"}}>{l}</button>)}</div>
    <div><b style={{fontSize:9,color:C.pink}}>TAG</b>{tags.slice(0,7).map(t=><button key={t} onClick={()=>setTag(x=>x===t?"":t)} style={{...btn(tag===t),display:"block",width:"100%",marginTop:3,textAlign:"left"}}>{t}</button>)}</div>
    {[["EX REGION",ex,setEx],["TO REGION",toR,setToR]].map(([lab,val,setter])=><div key={lab}><b style={{fontSize:9,color:C.blue}}>{lab}</b><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:2,marginTop:3}}><button onClick={()=>setter("")} style={btn(!val)}>All</button>{REGIONS.map(r=><button key={r} onClick={()=>setter(x=>x===r?"":r)} style={btn(val===r)}>{r}</button>)}</div></div>)}
   </div>
   <CargoMonthChart data={monthly} total={cargoTotal||cargoes.length}/>
  </div>
  <div style={{...card,padding:"5px 8px",display:"flex",gap:6,alignItems:"center",position:"relative",zIndex:100}}>
   <button onClick={()=>setShowAdd(true)} style={{...btn(),color:C.amber}}>+ Add cargo</button><button style={btn()}>Copy all</button><button style={btn()}>Copy CSV</button><span style={{fontSize:10,color:C.faint}}>This wk <b style={{color:C.blue}}>{week.thisWk}</b>&nbsp; Last wk <b>{week.lastWk}</b></span>
   <div style={{marginLeft:"auto",display:"flex",gap:5,alignItems:"center"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cargoes..." style={{...input,width:210}}/><span style={{fontSize:10,color:C.faint}}>Total <b style={{color:C.tx}}>{cargoTotal||cargoes.length}</b></span><select value={sort} onChange={e=>setSort(e.target.value)} style={input}><option value="added">Added</option><option value="updated">Updated</option><option value="charterer">Charterer</option></select><button onClick={()=>setDir(d=>-d)} style={btn()}>{dir>0?"▲":"▼"}</button>
   <button onClick={e=>{const r=e.currentTarget.getBoundingClientRect(),z=parseFloat(getComputedStyle(document.body).zoom||"1")||1,w=205*z,h=390*z,m=12;let l=Math.max(m,Math.min(r.right-w,innerWidth-w-m)),t=r.bottom+5;if(t+h>innerHeight-m)t=Math.max(m,r.top-h-5);setColsPos({left:l/z,top:t/z});setColsOpen(v=>!v)}} style={btn()}>Columns⌄</button></div>
   {colsOpen&&<><div onClick={()=>setColsOpen(false)} style={{position:"fixed",inset:0,zIndex:29990}}/><div style={{position:"fixed",left:colsPos.left,top:colsPos.top,zIndex:29999,width:205,maxHeight:390,overflowY:"auto",background:"#071223",border:"1px solid "+C.bd,borderRadius:7,padding:7,boxShadow:"0 12px 34px rgba(0,0,0,.7)"}}>{allCols.map(([k,l])=><label key={k} style={{display:"flex",gap:7,padding:5,fontSize:10,fontWeight:700}}><input type="checkbox" checked={visible.has(k)} onChange={()=>setVisible(p=>{const n=new Set(p);n.has(k)?n.delete(k):n.add(k);return n})}/>{l}</label>)}</div></>}
  </div>
  {showAdd&&<AddRow quotes onSave={onAddC} onClose={()=>setShowAdd(false)}/>}
  <div style={POS_WRAP}>
   <table style={POS_TABLE}>
    <colgroup><col style={{width:"1.4%"}}/>{shown.map(([k,l,w])=><col key={k} style={{width:w+"%"}}/>)}<col style={{width:"1.4%"}}/><col style={{width:"1.4%"}}/></colgroup>
    <thead><tr><th style={{...POS_TH,textAlign:"center"}}></th>{shown.map(([k,l])=><th key={k} style={{...POS_TH,textAlign:["p_and_c","intelligence","from","to","freight"].includes(k)?"center":"left"}}>{l}</th>)}<th style={POS_TH}/><th style={POS_TH}/></tr></thead>
    <tbody>{filtered.slice(0,200).map((c,i)=><tr key={c.id} style={{background:POS_ROW(i),height:32}}><td style={{...POS_TD,textAlign:"center",color:C.faint,padding:"0 2px"}}>[ ]</td>
    {shown.map(([k])=>{
      if(k==="status")return <td key={k} onClick={()=>{const o=["SUBS","FIXED","FAILED",""],n=o[(o.indexOf(c.status||"")+1)%o.length];onUpdateC(c.id,"status",n)}} style={{...POS_TD,textAlign:"center",fontWeight:800,cursor:"pointer",color:c.status==="FIXED"?C.green:c.status==="SUBS"?C.purple:c.status==="FAILED"?C.red:C.faint}}>{c.status||""}</td>;
      if(k==="ex_region"||k==="to_region")return <RegionCell key={k} value={c[k]||""} onSave={v=>onUpdateC(c.id,k,v)}/>;
      if(k==="p_and_c")return <td key={k} onClick={()=>{const o=[null,1,2,3],x=o.findIndex(v=>String(v??"")===String(c.p_and_c??""));onUpdateC(c.id,"p_and_c",o[(x+1)%o.length])}} style={{...POS_TD,textAlign:"center",fontWeight:900,cursor:"pointer",color:Number(c.p_and_c)===1?"#ff5b5b":Number(c.p_and_c)===2?"#ffad33":Number(c.p_and_c)===3?"#fff":C.faint}}>{c.p_and_c??""}</td>;
      if(k==="intelligence")return <td key={k} onClick={()=>{const cur=String(c.intelligence||"").toUpperCase(),o=[null,"QUOTE","FIXTURE"],x=cur==="QUOTE"?1:cur==="FIXTURE"?2:0;onUpdateC(c.id,"intelligence",o[(x+1)%o.length])}} style={{...POS_TD,textAlign:"center",cursor:"pointer"}}>{c.intelligence&&<span style={{display:"inline-block",padding:"2px 5px",borderRadius:3,fontSize:9,fontWeight:800,color:String(c.intelligence).toUpperCase()==="FIXTURE"?C.green:C.blue,border:"1px solid "+(String(c.intelligence).toUpperCase()==="FIXTURE"?C.green+"88":C.blue+"88")}}>{c.intelligence.toUpperCase()}</span>}</td>;
      if(k==="tag")return <TagCell key={k} id={c.id} value={c.tag} onUpdate={onUpdateC}/>;
      if(k==="updated")return <td key={k} style={{...POS_TD,textAlign:"center",color:C.faint}}>{c.updated?new Date(c.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>;
      const val=k==="charterer"?toTCase(c[k]||""):k==="qty"?normaliseQty(c[k]):k==="from"||k==="to"?fmtDateShort(c[k]):k==="freight"?(fmtFreight(c[k])||c[k]||""):c[k]||"";
      return <Editable key={k} value={val} bold={["vessel","charterer","cargo","load","disch","from","to"].includes(k)} color={k==="vessel"?C.blue:k==="charterer"?"#79c0ff":k==="qty"?C.amber:k==="freight"?"#a8e6a3":C.tx} onSave={v=>onUpdateC(c.id,k,k==="charterer"||k==="load"||k==="disch"?toTCase(v):k==="qty"?normaliseQty(v):k==="freight"?(fmtFreight(v)||v):v)}/>;
    })}<td style={{...POS_TD,textAlign:"center",padding:"0 2px",fontSize:8,color:c.entered_by==="H"?C.blue:C.green}}>{c.entered_by||""}</td><td style={{...POS_TD,textAlign:"center",padding:"0 2px"}}><button onClick={()=>confirm("Delete cargo?")&&onDelC(c.id)} style={{border:0,background:"none",color:C.red,cursor:"pointer"}}>×</button></td></tr>)}</tbody>
   </table>
  </div>
 </div>;
}
