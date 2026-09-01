import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const ParsePanel = React.lazy(()=>import("./ParsePanel"));

// DWT segment buckets matching the Barton "Segs" convention
const NB_SEGMENTS = [
  { key:"small",  label:"1. Small (<14)",     color:"#58a6ff", dwt:[0,      14000] },
  { key:"inter",  label:"2. Inter (14-19)",    color:"#4ade80", dwt:[14001,  19000] },
  { key:"j19",    label:"3. J19 (19-23)",      color:"#f778ba", dwt:[19001,  23000] },
  { key:"flexi",  label:"4. Flexi (23-30)",    color:"#ea9a00", dwt:[23001,  30000] },
  { key:"handy",  label:"5. Handy (30-40)",    color:"#a78bfa", dwt:[30001,  40000] },
  { key:"mr",     label:"6. MR (>40)",         color:"#22d3ee", dwt:[40001,  999999] },
];

function segmentFor(dwt){
  if(!dwt) return null;
  return NB_SEGMENTS.find(s=>dwt>=s.dwt[0]&&dwt<=s.dwt[1])||null;
}

function fmtN(n){
  if(n===null||n===undefined||n==="") return "";
  const num=Number(n);
  if(isNaN(num)) return String(n);
  return num.toLocaleString("en-US");
}

function monthsFromNow(n){
  const d=new Date();
  d.setMonth(d.getMonth()+n);
  d.setDate(1);
  return d;
}

function fmtMonth(d){
  return d.toLocaleDateString("en-GB",{month:"short",year:"numeric"});
}

function fmtUpdatedAt(iso){
  if(!iso) return "";
  const d=new Date(iso);
  if(isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+" "+
    d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

// Extract Barton source date from the monthly filename when possible.
// Supports YYYY-MM-DD, DD-MM-YYYY, YYYYMMDD and "Aug 2026" style names.
function dateFromFileName(name){
  if(!name) return null;
  const base=String(name).replace(/\.[^.]+$/,"");

  let m=base.match(/\b(20\d{2})[-_. ](0?[1-9]|1[0-2])[-_. ](0?[1-9]|[12]\d|3[01])\b/);
  if(m) return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));

  m=base.match(/\b(0?[1-9]|[12]\d|3[01])[-_. ](0?[1-9]|1[0-2])[-_. ](20\d{2})\b/);
  if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));

  m=base.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if(m) return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));

  const monthNames={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  m=base.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\D+(20\d{2})\b/i);
  if(m) return new Date(Number(m[2]),monthNames[m[1].slice(0,3).toLowerCase()],1);

  return null;
}

function fmtSourceDate(d){
  if(!d||isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}

// Barton newbuild placeholder names are prefixed "ZZNB " until a real name
// is assigned — strip it for display only, underlying data stays intact.
function dispName(v){
  return String(v||"").replace(/^ZZNB\s*/i,"").trim();
}

function monthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

const TAG_OPTIONS = [
  { key:"",       label:"No tag",          color:"rgba(120,160,200,0.4)" },
  { key:"watch",  label:"Watch",           color:"#58a6ff" },
  { key:"hot",    label:"Hot",             color:"#ff6b6b" },
  { key:"client", label:"Client interest", color:"#4ade80" },
];
function tagColor(key){ return TAG_OPTIONS.find(t=>t.key===key)?.color || "rgba(120,160,200,0.4)"; }
function tagLabel(key){ return TAG_OPTIONS.find(t=>t.key===key)?.label || ""; }

// Quick free-text date parser for manually pasted newbuild positions
function parseFlexibleDate(s){
  if(!s) return null;
  const d=new Date(String(s).trim());
  return isNaN(d.getTime()) ? null : d;
}

const inp={
  background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,
  fontFamily:"inherit",fontSize:12,padding:"4px 7px",outline:"none",boxSizing:"border-box"
};

const BTN_SM={
  fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",
  border:"1px solid rgba(88,166,255,0.3)",background:"rgba(88,166,255,0.08)",color:"#79c0ff"
};

function SectionCard({title,subtitle,right,children}){
  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"rgba(120,160,220,0.75)",textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
          {subtitle&&<div style={{fontSize:11,color:C.faint,marginTop:2}}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const PIE_COLORS=["#58a6ff","#4ade80","#f778ba","#ea9a00","#a78bfa","#22d3ee","#f59e0b","#fb7185","#2dd4bf","#94a3b8"];

function PieCard({title,subtitle,data}){
  const clean=(data||[]).filter(x=>Number(x.value)>0);
  const total=clean.reduce((a,x)=>a+Number(x.value||0),0);

  if(!total){
    return(
      <div style={{flex:"1 1 230px",minWidth:220,background:C.bg3,border:"1px solid "+C.bd,borderRadius:7,padding:"10px 12px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.7)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{title}</div>
        <div style={{fontSize:10,color:C.faint,marginTop:2}}>{subtitle}</div>
        <div style={{fontSize:11,color:C.faint,padding:"24px 0",textAlign:"center"}}>No data</div>
      </div>
    );
  }

  let acc=0;
  const stops=clean.map((x,i)=>{
    const from=acc/total*100;
    acc+=Number(x.value);
    const to=acc/total*100;
    return `${PIE_COLORS[i%PIE_COLORS.length]} ${from}% ${to}%`;
  }).join(",");

  return(
    <div style={{flex:"1 1 250px",minWidth:230,background:C.bg3,border:"1px solid "+C.bd,borderRadius:7,padding:"10px 12px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.7)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{title}</div>
      <div style={{fontSize:10,color:C.faint,marginTop:2}}>{subtitle}</div>

      <div style={{display:"flex",alignItems:"center",gap:14,marginTop:10}}>
        <div style={{width:104,height:104,borderRadius:"50%",background:`conic-gradient(${stops})`,position:"relative",flexShrink:0}}>
          <div style={{position:"absolute",inset:23,borderRadius:"50%",background:C.bg3,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:17,fontWeight:800,color:C.tx}}>{total}</div>
            <div style={{fontSize:8,color:C.faint,textTransform:"uppercase"}}>ships</div>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:4,minWidth:0,flex:1}}>
          {clean.slice(0,9).map((x,i)=>(
            <div key={x.label+"_"+i} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,minWidth:0}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
              <span title={x.label} style={{color:"rgba(190,215,245,0.72)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                {x.label}
              </span>
              <span style={{color:C.tx,fontWeight:700,flexShrink:0}}>{x.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NewbuildsTab(){
  const [newbuilds,setNewbuilds]=useState([]);
  const [loading,setLoading]=useState(true);
  const [positions,setPositions]=useState([]);
  const [segFilter,setSegFilter]=useState(null);
  const [countryFilter,setCountryFilter]=useState(null);
  const [coatingFilter,setCoatingFilter]=useState(null);
  const [dwtMin,setDwtMin]=useState("");
  const [dwtMax,setDwtMax]=useState("");
  const [monthFilter,setMonthFilter]=useState(null);
  const [search,setSearch]=useState("");
  const [monthsAhead,setMonthsAhead]=useState(3);
  const [pendingDel,setPendingDel]=useState(null);
  const [editingVessel,setEditingVessel]=useState(null);
  const [copyStatus,setCopyStatus]=useState(null);
  const [lastUpdated,setLastUpdated]=useState(null);

  useEffect(()=>{
    async function fetchMeta(){
      const { data, error } = await supabase
        .from("upload_meta")
        .select("*")
        .eq("table_name","vessels_newbuilds")
        .maybeSingle();
      if(error){ console.error("upload_meta fetch error:", error); return; }
      setLastUpdated(data||null);
    }
    fetchMeta();
  },[]);

  useEffect(()=>{
    async function fetchNB(){
      setLoading(true);
      const { data, error } = await supabase.from("vessels_newbuilds").select("*").limit(5000);
      if(error){
        console.error("newbuilds fetch error:", error);
        setLoading(false);
        return;
      }
      setNewbuilds(data||[]);
      setLoading(false);
    }
    fetchNB();
  },[]);

  useEffect(()=>{ fetchPositions(); },[]);

  async function fetchPositions(){
    const { data, error } = await supabase
      .from("newbuilds_positions")
      .select("*")
      .order("created_at",{ascending:false});
    if(error){ console.error("newbuilds_positions fetch error:", error); return; }
    setPositions(data||[]);
  }

  const addNewbuildPositions = useCallback(async(parsed)=>{
    const nowIso=new Date().toISOString();
    const rows=parsed.map(p=>({
      vessel_name:(p.vessel||"").trim(),
      operator:(p.operator||"").trim()||null,
      port_name:(p.openPort||"").trim()||null,
      open_date:(p.date||"").trim()||null,
      comment:(p.comment||"").trim()||null,
      updated_at:nowIso,
    })).filter(r=>r.vessel_name);

    if(!rows.length) return {added:0,updated:0,total:positions.length};

    const { error } = await supabase.from("newbuilds_positions").insert(rows);
    if(error){
      console.error("newbuilds_positions insert error:", error);
      return {added:0,updated:0,total:positions.length};
    }
    await fetchPositions();
    return {added:rows.length,updated:0,total:positions.length+rows.length};
  },[positions.length]);

  async function deletePosition(id){
    await supabase.from("newbuilds_positions").delete().eq("id",id);
    setPositions(prev=>prev.filter(p=>p.id!==id));
    setPendingDel(null);
  }

  async function toggleStar(n){
    const next=!n.starred;
    setNewbuilds(prev=>prev.map(x=>x.imo===n.imo?{...x,starred:next}:x));
    const { error } = await supabase.from("vessels_newbuilds").update({starred:next}).eq("imo",n.imo);
    if(error) console.error("star update error:",error);
  }

  function openEditor(n){
    setEditingVessel({imo:n.imo,vessel:n.vessel,note:n.note||"",tag:n.tag||""});
  }

  async function saveEditor(){
    if(!editingVessel) return;
    const {imo,note,tag}=editingVessel;
    setNewbuilds(prev=>prev.map(x=>x.imo===imo?{...x,note,tag}:x));
    const {error}=await supabase.from("vessels_newbuilds").update({note,tag}).eq("imo",imo);
    if(error) console.error("note/tag update error:",error);
    setEditingVessel(null);
  }

  function copyToClipboard(text){
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.style.position="fixed";
    ta.style.width="2px";
    ta.style.height="2px";
    ta.style.background="transparent";
    ta.style.opacity="0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok=false;
    try{ ok=document.execCommand("copy"); }catch{ ok=false; }
    document.body.removeChild(ta);
    return ok;
  }

  function handleCopy(list){
    if(!list.length) return;
    const lines=list.map(n=>{
      const seg=n._seg?.label?.replace(/^\d+\.\s*/,"")||"—";
      return `*${dispName(n.vessel).toUpperCase()}* — ${n.dwt?fmtN(n.dwt):"—"} dwt — ${n.coating||"—"} — ${seg}\nOperator: ${n.operator||"—"}   Owner: ${n.owner||"—"}   Yard: ${n.yard||"—"}`;
    });
    const ok=copyToClipboard(lines.join("\n\n"));
    setCopyStatus(ok?`Copied ${list.length} vessel(s)`:"Copy failed");
    setTimeout(()=>setCopyStatus(null),2500);
  }

  function handleExportCSV(list){
    if(!list.length) return;
    const headers=["Vessel","DWT","Coating","Segment","Operator","Owner","Yard"];
    const rows=list.map(n=>{
      const seg=n._seg?.label?.replace(/^\d+\.\s*/,"")||"";
      return [dispName(n.vessel),n.dwt||"",n.coating||"",seg,n.operator||"",n.owner||"",n.yard||""];
    });
    const csv=[headers,...rows]
      .map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(","))
      .join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`newbuild_orderbook_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Derived data ──────────────────────────────────────────────────────
  const enriched=useMemo(()=>newbuilds.map(n=>({...n,_seg:segmentFor(Number(n.dwt)||0)})),[newbuilds]);

  const filtered=useMemo(()=>enriched.filter(n=>{
    if(segFilter && n._seg?.key!==segFilter) return false;
    if(countryFilter && n.country_build!==countryFilter) return false;
    if(coatingFilter && n.coating!==coatingFilter) return false;

    const dwt=Number(n.dwt)||0;
    if(dwtMin!=="" && dwt<Number(dwtMin)) return false;
    if(dwtMax!=="" && dwt>Number(dwtMax)) return false;

    if(monthFilter){
      if(!n.delivery_date) return false;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())||monthKey(d)!==monthFilter) return false;
    }

    if(search.trim()){
      const t=search.trim().toLowerCase();
      const hay=[n.vessel,n.operator,n.owner,n.yard,n.country_build,n.coating]
        .filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(t)) return false;
    }
    return true;
  }),[enriched,segFilter,countryFilter,coatingFilter,dwtMin,dwtMax,monthFilter,search]);

  const countries=useMemo(()=>{
    const counts={};
    enriched.forEach(n=>{if(n.country_build)counts[n.country_build]=(counts[n.country_build]||0)+1;});
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  },[enriched]);

  const coatings=useMemo(()=>{
    const counts={};
    enriched.forEach(n=>{if(n.coating)counts[n.coating]=(counts[n.coating]||0)+1;});
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  },[enriched]);

  const monthOptions=useMemo(()=>{
    const map=new Map();
    enriched.forEach(n=>{
      if(!n.delivery_date) return;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())) return;
      const key=monthKey(d);
      if(!map.has(key)) map.set(key,fmtMonth(d));
    });
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  },[enriched]);

  const filtersActive=!!(
    segFilter||countryFilter||coatingFilter||
    dwtMin!==""||dwtMax!==""||monthFilter||search
  );

  function resetFilters(){
    setSegFilter(null);
    setCountryFilter(null);
    setCoatingFilter(null);
    setDwtMin("");
    setDwtMax("");
    setMonthFilter(null);
    setSearch("");
  }

  const segCounts=useMemo(()=>{
    const counts={};
    NB_SEGMENTS.forEach(s=>{counts[s.key]={ships:0,dwt:0};});
    enriched.forEach(n=>{
      if(!n._seg) return;
      counts[n._seg.key].ships++;
      counts[n._seg.key].dwt+=Number(n.dwt)||0;
    });
    return counts;
  },[enriched]);

  // Chart 1 = all segments by ship count.
  // Charts 2/3 = coating and owner for the clicked segment (or all segments if none clicked).
  const chartBase=useMemo(
    ()=>segFilter ? enriched.filter(n=>n._seg?.key===segFilter) : enriched,
    [enriched,segFilter]
  );

  const chartSegmentData=useMemo(
    ()=>NB_SEGMENTS.map(seg=>({
      label:seg.label.replace(/^\d+\.\s*/,""),
      value:enriched.filter(n=>n._seg?.key===seg.key).length,
    })).filter(x=>x.value>0),
    [enriched]
  );

  const chartCoatingData=useMemo(()=>{
    const m={};
    chartBase.forEach(n=>{
      const k=n.coating||"Unknown";
      m[k]=(m[k]||0)+1;
    });
    return Object.entries(m)
      .sort((a,b)=>b[1]-a[1])
      .map(([label,value])=>({label,value}));
  },[chartBase]);

  const chartOwnerData=useMemo(()=>{
    const m={};
    chartBase.forEach(n=>{
      const k=n.owner||"Unknown";
      m[k]=(m[k]||0)+1;
    });
    const sorted=Object.entries(m).sort((a,b)=>b[1]-a[1]);
    const top=sorted.slice(0,8).map(([label,value])=>({label,value}));
    const other=sorted.slice(8).reduce((a,[,v])=>a+v,0);
    if(other) top.push({label:"Other",value:other});
    return top;
  },[chartBase]);

  const selectedSegLabel=segFilter
    ? (NB_SEGMENTS.find(x=>x.key===segFilter)?.label.replace(/^\d+\.\s*/,"")||"Selected segment")
    : "All segments";

  const cutoff=useMemo(()=>monthsFromNow(monthsAhead),[monthsAhead]);

  const upcoming=useMemo(()=>{
    const fromBarton=filtered
      .filter(n=>{
        if(!n.delivery_date) return false;
        const d=new Date(n.delivery_date);
        return d>=new Date() && d<=cutoff;
      })
      .map(n=>({
        source:"barton",
        vessel:n.vessel,
        operator:n.operator,
        yard:n.yard,
        dwt:n.dwt,
        coating:n.coating,
        delivery:n.delivery_date,
      }));

    const fromManual=positions.map(p=>({
      source:"manual",
      vessel:p.vessel_name,
      operator:p.operator,
      yard:null,
      dwt:null,
      coating:null,
      delivery:p.open_date,
      id:p.id,
    }));

    return [...fromBarton,...fromManual].sort((a,b)=>{
      const da=a.delivery?new Date(a.delivery).getTime():0;
      const db=b.delivery?new Date(b.delivery).getTime():0;
      return da-db;
    });
  },[filtered,positions,cutoff]);

  const totalShips=enriched.length;
  const totalDWT=enriched.reduce((a,n)=>a+(Number(n.dwt)||0),0);

  const bartonSourceDate=useMemo(()=>{
    if(!lastUpdated) return null;
    return dateFromFileName(lastUpdated.file_name) ||
      (lastUpdated.uploaded_at ? new Date(lastUpdated.uploaded_at) : null);
  },[lastUpdated]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {pendingDel&&(
        <div style={{
          position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",
          zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",
          fontFamily:"sans-serif",fontSize:12
        }}>
          <span style={{color:C.tx}}>Delete <strong>{pendingDel.vessel_name}</strong> from newbuild positions?</span>
          <button onClick={()=>deletePosition(pendingDel.id)}
            style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>
            Delete
          </button>
          <button onClick={()=>setPendingDel(null)}
            style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>
            Cancel
          </button>
        </div>
      )}

      {/* ── Top summary row ── */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:"0 0 auto",display:"flex",gap:16,alignItems:"center",background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"10px 16px"}}>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:"#79c0ff"}}>{totalShips}</div>
            <div style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>Ships on order</div>
          </div>
          <div style={{width:1,height:32,background:C.bd}}/>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:"#a8d4ff"}}>{fmtN(totalDWT)}</div>
            <div style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>Sum DWT</div>
          </div>
        </div>

        {lastUpdated&&(
          <div style={{
            flex:"0 0 auto",display:"flex",flexDirection:"column",justifyContent:"center",gap:2,
            background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"10px 16px"
          }}>
            <div style={{fontSize:10,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>Barton data as of</div>
            <div style={{fontSize:14,color:"#79c0ff",fontWeight:700}}>
              {bartonSourceDate?fmtSourceDate(bartonSourceDate):"—"}
            </div>
            <div style={{fontSize:10,color:C.faint}}>Uploaded {fmtUpdatedAt(lastUpdated.uploaded_at)}</div>
            <div
              title={lastUpdated.file_name}
              style={{fontSize:10,color:"rgba(120,160,220,0.68)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {lastUpdated.file_name||"—"}
            </div>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>

        {/* ── Left: Paste positions ── */}
        <div style={{flex:"0 0 320px",minWidth:280,display:"flex",flexDirection:"column",gap:8}}>
          <SectionCard
            title="Paste Newbuild Positions"
            subtitle="Broker chatter on newbuilds open in Asia — feeds the delivery list below">
            <React.Suspense fallback={<div style={{fontSize:11,color:C.faint}}>Loading…</div>}>
              <ParsePanel
                vessels={[]}
                cargoes={[]}
                onAddVessels={addNewbuildPositions}
                lockedMode="pos"
                vesselDB={{}}
              />
            </React.Suspense>
          </SectionCard>

          {positions.length>0&&(
            <SectionCard title="Pasted Positions" subtitle={`${positions.length} entries`}>
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:300,overflowY:"auto"}}>
                {positions.map(p=>(
                  <div key={p.id} style={{
                    display:"flex",alignItems:"center",gap:6,padding:"5px 7px",
                    background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,fontSize:11
                  }}>
                    <span style={{fontWeight:700,color:"#79c0ff",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {p.vessel_name}
                    </span>
                    <span style={{color:C.faint,whiteSpace:"nowrap"}}>{p.open_date||"—"}</span>
                    <span style={{color:"rgba(160,200,255,0.5)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:80}}>
                      {p.port_name||""}
                    </span>
                    <button
                      onClick={()=>setPendingDel(p)}
                      style={{background:"none",border:"none",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontSize:11,padding:0,flexShrink:0}}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Right ── */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10}}>

          <SectionCard title="Segment Breakdown" subtitle="Across full Barton newbuild orderbook — click a row to filter">
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"rgba(8,18,38,0.9)"}}>
                    {["Segment","Ships","Sum DWT"].map(h=>(
                      <th key={h} style={{
                        padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,
                        color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",
                        borderBottom:"1px solid rgba(58,130,246,0.12)"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NB_SEGMENTS.map(seg=>(
                    <tr
                      key={seg.key}
                      onClick={()=>setSegFilter(f=>f===seg.key?null:seg.key)}
                      style={{cursor:"pointer",background:segFilter===seg.key?"rgba(88,166,255,0.1)":"transparent"}}>
                      <td style={{padding:"5px 9px",fontWeight:700,color:seg.color}}>{seg.label}</td>
                      <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.8)"}}>{segCounts[seg.key]?.ships||0}</td>
                      <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.8)"}}>{fmtN(segCounts[seg.key]?.dwt||0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── Pie charts ── */}
          <SectionCard
            title="Orderbook Mix"
            subtitle={
              segFilter
                ? `${selectedSegLabel}: coating and owner breakdown · click another segment above to change`
                : "Segment share across full orderbook · coating and owner currently show all segments"
            }>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <PieCard title="Segments" subtitle="Number of ships" data={chartSegmentData}/>
              <PieCard title="Coating" subtitle={selectedSegLabel} data={chartCoatingData}/>
              <PieCard title="Owner" subtitle={`${selectedSegLabel} · top owners`} data={chartOwnerData}/>
            </div>
          </SectionCard>

          {/* ── Shared filters ── */}
          <SectionCard title="Filters" subtitle="Applies to Upcoming Deliveries and Full Orderbook below">
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder="Search vessel/operator/yard…"
                style={{...inp,width:200}}
              />

              <select
                value={coatingFilter||""}
                onChange={e=>setCoatingFilter(e.target.value||null)}
                style={{...inp,width:150}}>
                <option value="">All coatings</option>
                {coatings.map(([coating,n])=><option key={coating} value={coating}>{coating} ({n})</option>)}
              </select>

              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:10,color:C.faint,textTransform:"uppercase"}}>DWT</span>
                <input
                  type="number"
                  min="0"
                  value={dwtMin}
                  onChange={e=>setDwtMin(e.target.value)}
                  placeholder="From"
                  style={{...inp,width:82}}
                />
                <span style={{fontSize:10,color:C.faint}}>–</span>
                <input
                  type="number"
                  min="0"
                  value={dwtMax}
                  onChange={e=>setDwtMax(e.target.value)}
                  placeholder="To"
                  style={{...inp,width:82}}
                />
              </div>

              <select
                value={countryFilter||""}
                onChange={e=>setCountryFilter(e.target.value||null)}
                style={{...inp,width:170}}>
                <option value="">All countries</option>
                {countries.map(([country,n])=><option key={country} value={country}>{country} ({n})</option>)}
              </select>

              <select
                value={monthFilter||""}
                onChange={e=>setMonthFilter(e.target.value||null)}
                style={{...inp,width:150}}>
                <option value="">All delivery months</option>
                {monthOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}
              </select>

              {filtersActive&&(
                <button
                  onClick={resetFilters}
                  style={{
                    fontSize:10,background:"rgba(255,107,107,0.1)",
                    border:"1px solid rgba(255,107,107,0.3)",borderRadius:4,
                    color:"rgba(255,107,107,0.7)",padding:"6px 10px",
                    cursor:"pointer",fontFamily:"inherit"
                  }}>
                  ✕ Reset filters
                </button>
              )}

              <div style={{marginLeft:"auto",fontSize:11,color:C.faint}}>
                {filtered.length} of {totalShips} vessels match
              </div>
            </div>
          </SectionCard>

          {/* ── Upcoming Deliveries ── */}
          <SectionCard
            title="Upcoming Deliveries"
            subtitle="Barton schedule + manually pasted positions, merged by date"
            right={
              <div style={{display:"flex",gap:4}}>
                {[1,3,6,12].map(m=>(
                  <button
                    key={m}
                    onClick={()=>setMonthsAhead(m)}
                    style={{
                      fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:4,cursor:"pointer",
                      fontFamily:"inherit",
                      border:"1px solid "+(monthsAhead===m?"rgba(88,166,255,0.5)":C.bd),
                      background:monthsAhead===m?"rgba(88,166,255,0.15)":"transparent",
                      color:monthsAhead===m?"#79c0ff":C.faint
                    }}>
                    {m}mo
                  </button>
                ))}
              </div>
            }>

            {upcoming.length===0 ? (
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>
                No deliveries in this window.
              </div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"rgba(8,18,38,0.9)"}}>
                      {["Vessel","DWT","Coating","Delivery","Operator","Yard",""].map(h=>(
                        <th key={h} style={{
                          padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,
                          color:"rgba(120,160,220,0.5)",textTransform:"uppercase",
                          letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",
                          whiteSpace:"nowrap"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {upcoming.map((u,i)=>(
                      <tr
                        key={`${u.source}-${u.id||u.vessel}-${i}`}
                        style={{background:u.source==="manual"?"rgba(167,139,250,0.06)":i%2===0?"rgba(7,15,28,0.5)":"transparent"}}>

                        <td style={{padding:"5px 9px",fontWeight:700,color:u.source==="manual"?"#a78bfa":"#79c0ff",whiteSpace:"nowrap"}}>
                          {dispName(u.vessel)}
                          {u.source==="manual"&&(
                            <span style={{fontSize:9,marginLeft:5,color:"rgba(167,139,250,0.6)",fontWeight:400}}>manual</span>
                          )}
                        </td>

                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>
                          {u.dwt?fmtN(u.dwt):"—"}
                        </td>

                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>
                          {u.coating||"—"}
                        </td>

                        <td style={{padding:"5px 9px",color:"rgba(160,200,255,0.7)",whiteSpace:"nowrap"}}>
                          {u.delivery
                            ? (parseFlexibleDate(u.delivery)?fmtMonth(parseFlexibleDate(u.delivery)):u.delivery)
                            : "—"}
                        </td>

                        <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>
                          {u.operator||"—"}
                        </td>

                        <td
                          title={u.yard||""}
                          style={{
                            padding:"5px 9px",color:C.faint,whiteSpace:"nowrap",
                            maxWidth:170,overflow:"hidden",textOverflow:"ellipsis"
                          }}>
                          {u.yard||"—"}
                        </td>

                        <td style={{padding:"5px 9px"}}>
                          {u.source==="manual"&&(
                            <button
                              onClick={()=>setPendingDel({id:u.id,vessel_name:u.vessel})}
                              style={{background:"none",border:"none",color:"rgba(255,107,107,0.4)",cursor:"pointer",fontSize:11,padding:0}}>
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* ── Full Orderbook ── */}
          <SectionCard
            title="Full Orderbook"
            subtitle={`${filtered.length} of ${totalShips} vessels`}
            right={
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                {copyStatus&&<span style={{fontSize:11,color:"#4ade80",fontWeight:600}}>{copyStatus}</span>}
                <button onClick={()=>handleCopy(filtered)} style={{...BTN_SM}}>📋 Copy</button>
                <button onClick={()=>handleExportCSV(filtered)} style={{...BTN_SM}}>⬇ Export CSV</button>
              </div>
            }>

            {loading ? (
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>
                Loading newbuild orderbook…
              </div>
            ) : filtered.length===0 ? (
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>
                No vessels match this filter.
              </div>
            ) : (
              <div style={{overflowX:"auto",maxHeight:460,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"rgba(8,18,38,0.9)",position:"sticky",top:0}}>
                      {["★","Vessel","DWT","CBM","Coating","Delivery","Operator","Owner","LOA","Beam","Tanks","Segs","Yard","Fuel Data","Other Data","Comments","Note"].map(h=>(
                        <th key={h} style={{
                          padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,
                          color:"rgba(120,160,220,0.5)",textTransform:"uppercase",
                          letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",
                          whiteSpace:"nowrap"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map((n,i)=>(
                      <tr key={n.imo||n.vessel||i} style={{background:i%2===0?"rgba(7,15,28,0.5)":"transparent"}}>
                        <td style={{padding:"4px 9px"}}>
                          <button
                            onClick={()=>toggleStar(n)}
                            disabled={!n.imo}
                            style={{
                              background:"none",border:"none",cursor:n.imo?"pointer":"default",
                              fontSize:13,padding:0,color:n.starred?"#f5c518":"rgba(120,160,200,0.25)"
                            }}>
                            ★
                          </button>
                        </td>

                        <td style={{padding:"4px 9px",fontWeight:700,color:"#79c0ff",whiteSpace:"nowrap"}}>
                          {n.tag&&(
                            <span
                              title={tagLabel(n.tag)}
                              style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:tagColor(n.tag),marginRight:6}}
                            />
                          )}
                          {dispName(n.vessel)}
                        </td>

                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.dwt)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.cbm)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{n.coating||"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(160,200,255,0.6)",whiteSpace:"nowrap"}}>
                          {n.delivery_date?fmtMonth(new Date(n.delivery_date)):"—"}
                        </td>
                        <td style={{padding:"4px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>{n.operator||"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(200,220,255,0.6)",whiteSpace:"nowrap"}}>{n.owner||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.loa)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.beam)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.tanks)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.segs)}</td>
                        <td
                          title={n.yard||""}
                          style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>
                          {n.yard||"—"}
                        </td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{n.fuel_type||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {n.other_data||"—"}
                        </td>
                        <td style={{padding:"4px 9px",color:C.faint,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {n.comments||"—"}
                        </td>
                        <td style={{padding:"4px 9px"}}>
                          <button
                            onClick={()=>openEditor(n)}
                            disabled={!n.imo}
                            style={{
                              background:"none",border:"none",cursor:n.imo?"pointer":"default",
                              fontSize:12,padding:0,color:n.note?"#79c0ff":"rgba(120,160,200,0.35)"
                            }}>
                            {n.note?"📝":"✎"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Note/tag editor modal ── */}
      {editingVessel&&(
        <div
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setEditingVessel(null)}>

          <div
            onClick={e=>e.stopPropagation()}
            style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:10,padding:20,width:380,maxWidth:"90vw",fontFamily:"sans-serif"}}>

            <div style={{fontSize:13,fontWeight:700,color:C.tx,marginBottom:12}}>
              {dispName(editingVessel.vessel)}
            </div>

            <div style={{fontSize:11,color:C.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tag</div>
            <select
              value={editingVessel.tag}
              onChange={e=>setEditingVessel(v=>({...v,tag:e.target.value}))}
              style={{...inp,width:"100%",marginBottom:12}}>
              {TAG_OPTIONS.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
            </select>

            <div style={{fontSize:11,color:C.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Note</div>
            <textarea
              value={editingVessel.note}
              onChange={e=>setEditingVessel(v=>({...v,note:e.target.value}))}
              rows={4}
              style={{...inp,width:"100%",resize:"vertical",marginBottom:14,boxSizing:"border-box"}}
              placeholder="e.g. client interest, follow up next month…"
            />

            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button
                onClick={()=>setEditingVessel(null)}
                style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"6px 16px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>
                Cancel
              </button>
              <button
                onClick={saveEditor}
                style={{background:"#43e97b",border:"none",borderRadius:5,color:"#06281a",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
