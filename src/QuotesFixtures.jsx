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

const btn=(active=false)=>({fontSize:11,fontWeight:700,padding:"3px 7px",borderRadius:3,border:"1px solid "+(active?C.blue:C.bd),background:active?"rgba(88,166,255,.18)":C.bg3,color:active?"#d9ecff":"#9fc3f5",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});
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

  const MONTHS=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
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
        <div style={{fontSize:12,fontWeight:700,color:C.dim,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"inherit"}}>Cargoes entered by month</div>
        <div style={{fontSize:10,color:"rgba(88,166,255,0.7)",fontWeight:700,fontFamily:"inherit"}}>{total.toLocaleString()} total</div>
      </div>
      <div ref={wrapRef} style={{flex:1,minHeight:0,width:"100%"}}>
        <svg fontFamily="inherit" width="100%" height="100%" viewBox={"0 0 "+SVG_W+" "+SVG_H} preserveAspectRatio="xMidYMid meet" style={{display:"block",overflow:"visible"}}>
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
