import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseclient";
import { C, OP_COLORS } from "./constants";
import { stripHtml, classifyRegion, daysBetween } from "./utils";
import { apiCall, ocrImage } from "./api";

const WS_STORE = "ws-data";
const ROUTES = [
  {id:"TC2",  name:"TC2",  desc:"ARA→USAC 37kt",    unit:"WS"},
  {id:"TC6",  name:"TC6",  desc:"Cross-Med 30kt",   unit:"WS"},
  {id:"TC14", name:"TC14", desc:"US Gulf→UKC 38kt", unit:"WS"},
  {id:"TC23", name:"TC23", desc:"UKC→USAC 30kt",    unit:"WS"},
];

const FFA_PERIODS = ["Feb/26","Mar/26","Apr/26","Q1/26","Q2/26","AVE/25"];

const REGION_ORDER = ["NWE / UKC","Baltic","Med / Black Sea","USG / USEC / USAC","Caribs","MEG / WCI / Red Sea","SEA / FEA","Africa","South America","Other"];
const REGION_COLORS = {
  "NWE / UKC":"#58a6ff","Baltic":"#ff6b6b","Med / Black Sea":"#fd79a8",
  "USG / USEC / USAC":"#f5a623","Caribs":"#a78bfa","MEG / WCI / Red Sea":"#22d3ee",
  "SEA / FEA":"#3fb950","Africa":"#bc8cff","South America":"#ff9f43","Other":"rgba(160,200,255,.45)"
};

const SEGMENT_ORDER = ["All","Sub 10","City","Inter","J19","Flexi","Handy","MR"];
const SEGMENT_COLORS = {
  "Sub 10":"#8b949e","City":"#58a6ff","Inter":"#22d3ee","J19":"#a78bfa",
  "Flexi":"#fd79a8","Handy":"#3fb950","MR":"#f5a623"
};
function parseDashboardDate(s, reference=new Date()){
  if(!s)return null;
  const raw=String(s).trim();
  const m=raw.match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?$/i);
  if(m){
    const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    let year=m[3]?Number(m[3]):reference.getFullYear(); if(year<100)year+=2000;
    return new Date(year,months[m[2].toLowerCase()],Number(m[1]));
  }
  const d=new Date(raw); return isNaN(d)?null:d;
}
function fmtDwtCompact(n){
  const x=Number(n||0); if(!x)return "—";
  if(x>=1000000)return (x/1000000).toFixed(x>=10000000?1:2).replace(/\.?0+$/,"")+"m";
  if(x>=1000)return Math.round(x/1000).toLocaleString("en-US")+"k";
  return Math.round(x).toLocaleString("en-US");
}
function fmtSigned(n,fmt=x=>String(x)){
  if(n==null||!Number.isFinite(Number(n)))return "—";
  const x=Number(n); return (x>0?"+":"")+fmt(x);
}


// ── Chart quality helpers ─────────────────────────────────────────────────────
function chartDate(v){ const d=parseDashboardDate(v); return d&&!isNaN(d)?d:null; }
function horizonRows(rows,period,dateKey="date"){
  const a=[...(rows||[])].filter(Boolean); if(!a.length||period==="ALL")return a;
  const dates=a.map(x=>chartDate(x?.[dateKey])).filter(Boolean); if(!dates.length)return a;
  const end=new Date(Math.max(...dates.map(Number))); const start=new Date(end);
  if(period==="7D")start.setDate(start.getDate()-7); else if(period==="14D")start.setDate(start.getDate()-14);
  else if(period==="1M")start.setMonth(start.getMonth()-1); else if(period==="3M")start.setMonth(start.getMonth()-3);
  else if(period==="6M")start.setMonth(start.getMonth()-6); else if(period==="1Y")start.setFullYear(start.getFullYear()-1);
  return a.filter(x=>{const d=chartDate(x?.[dateKey]);return !d||d>=start;});
}
function cleanIsolatedValues(values){
  const out=values.map(v=>Number.isFinite(Number(v))?Number(v):null);
  if(out.length<3)return out;
  for(let i=1;i<out.length-1;i++){
    const a=out[i-1],b=out[i],c=out[i+1]; if(a==null||b==null||c==null)continue;
    const neighbour=(a+c)/2, scale=Math.max(Math.abs(neighbour),1);
    const neighboursAgree=Math.abs(a-c)/scale<0.22;
    const isolated=Math.abs(b-neighbour)/scale>0.38;
    if(neighboursAgree&&isolated)out[i]=neighbour; // only suppress one-off spikes; sustained moves remain
  }
  return out;
}
function cleanPresentationValues(values){
  const raw=values.map(v=>Number.isFinite(Number(v))?Number(v):null);
  if(raw.length<5)return cleanIsolatedValues(raw);
  const out=[...raw];
  for(let i=0;i<raw.length;i++){
    if(raw[i]==null)continue;
    const neighbours=[];
    for(let j=Math.max(0,i-2);j<=Math.min(raw.length-1,i+2);j++){
      if(j!==i&&raw[j]!=null)neighbours.push(raw[j]);
    }
    if(neighbours.length<3)continue;
    const sorted=[...neighbours].sort((a,b)=>a-b);
    const median=sorted[Math.floor(sorted.length/2)];
    const scale=Math.max(Math.abs(median),1);
    const deviation=Math.abs(raw[i]-median)/scale;
    const prev=raw[i-1], next=raw[i+1];
    // Only replace an isolated point. If an adjacent observation confirms the
    // same move, keep it as a genuine market change.
    const prevSupports=prev!=null&&Math.abs(prev-raw[i])/scale<0.22;
    const nextSupports=next!=null&&Math.abs(next-raw[i])/scale<0.22;
    if(deviation>0.42&&!prevSupports&&!nextSupports)out[i]=median;
  }
  return cleanIsolatedValues(out);
}
function smoothPath(points){
  const p=points.filter(Boolean); if(!p.length)return ""; if(p.length===1)return `M${p[0][0]},${p[0][1]}`;
  // Catmull-Rom -> cubic Bezier. Unlike the old midpoint quadratic curve,
  // this smooth curve passes THROUGH every observation, so hover dots sit
  // exactly on the displayed line.
  let d=`M${p[0][0]},${p[0][1]}`;
  for(let i=0;i<p.length-1;i++){
    const p0=p[i-1]||p[i], p1=p[i], p2=p[i+1], p3=p[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function HorizonButtons({value,onChange,options=["7D","14D","1M","3M","ALL"]}){
  return <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{options.map(x=><button key={x} onClick={()=>onChange(x)} style={{fontSize:8.5,fontWeight:800,padding:"2px 6px",borderRadius:4,border:"1px solid "+(value===x?C.blue:C.bd),background:value===x?"rgba(88,166,255,.14)":"transparent",color:value===x?C.blue:C.faint,cursor:"pointer",fontFamily:"inherit"}}>{x}</button>)}</div>;
}

function WSTracker() {
  const [data,    setData]    = useState(null);
  const [pasteText, setPaste] = useState("");
  const [img,       setImg]    = useState(null);
  const [parsing,  setParsing] = useState(false);
  const [status,   setStatus]  = useState(null);
  const [wsView,setWsView] = useState("graph");
  const [wsPeriod,setWsPeriod] = useState("3M");
  const [expandedWS,setExpandedWS] = useState(null);
  const [editWSDate,setEditWSDate] = useState(new Date().toISOString().slice(0,10));
  const [wsDraftRows,setWsDraftRows] = useState([]);
  const [wsNote,   setWsNote]  = useState("");
