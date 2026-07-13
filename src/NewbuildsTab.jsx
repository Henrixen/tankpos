import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const ParsePanel = React.lazy(()=>import("./ParsePanel"));

// DWT segment buckets matching the Barton "Segs" convention
const NB_SEGMENTS = [
  { key:"small",  label:"1. Small (<14)",     color:"#58a6ff", dwt:[0,      14000] },
  { key:"inter",  label:"2. Inter (14-19)",    color:"#4ade80", dwt:[14001,  19000] },
  { key:"j19",    label:"3. J19 (19-23)",      color:"#f778ba", dwt:[19001,  23000] },
  { key:"flexi",  label:"4. Flexi (21-30)",    color:"#ea9a00", dwt:[23001,  30000] },
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

// Quick free-text date parser for manually pasted newbuild positions (DD Mon / DD Mon YYYY / Mon YYYY)
function parseFlexibleDate(s){
  if(!s) return null;
  const t=s.trim();
  const d=new Date(t);
  if(!isNaN(d.getTime())) return d;
  return null;
}

const inp={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"4px 7px",outline:"none",boxSizing:"border-box"};
const BTN_SM={fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",
  border:"1px solid rgba(88,166,255,0.3)",background:"rgba(88,166,255,0.08)",color:"#79c0ff"};

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

export default function NewbuildsTab(){
  const [newbuilds,setNewbuilds]=useState([]);
  const [loading,setLoading]=useState(true);
  const [positions,setPositions]=useState([]); // manually pasted newbuild positions
  const [segFilter,setSegFilter]=useState(null);
  const [countryFilter,setCountryFilter]=useState(null);
  const [coatingFilter,setCoatingFilter]=useState(null);
  const [monthFilter,setMonthFilter]=useState(null); // 'YYYY-MM'
  const [search,setSearch]=useState("");
  const [monthsAhead,setMonthsAhead]=useState(3);
  const [pendingDel,setPendingDel]=useState(null);
  const [editingVessel,setEditingVessel]=useState(null); // {imo, vessel, note, tag}
  const [copyStatus,setCopyStatus]=useState(null);

  useEffect(()=>{
    async function fetchNB(){
      setLoading(true);
      const { data, error } = await supabase.from("vessels_newbuilds").select("*").limit(5000);
      if(error){ console.error("newbuilds fetch error:", error); setLoading(false); return; }
      setNewbuilds(data||[]);
      setLoading(false);
    }
    fetchNB();
  },[]);

  useEffect(()=>{
    fetchPositions();
  },[]);

  async function fetchPositions(){
    const { data, error } = await supabase.from("newbuilds_positions").select("*").order("created_at",{ascending:false});
    if(error){ console.error("newbuilds_positions fetch error:", error); return; }
    setPositions(data||[]);
  }

  // Wrapper passed to ParsePanel — writes parsed rows into newbuilds_positions instead of the main positions table
  const addNewbuildPositions = useCallback(async (parsed)=>{
    const nowIso=new Date().toISOString();
    const rows=parsed.map(p=>({
      vessel_name: (p.vessel||"").trim(),
      operator: (p.operator||"").trim()||null,
      port_name: (p.openPort||"").trim()||null,
      open_date: (p.date||"").trim()||null,
      comment: (p.comment||"").trim()||null,
      updated_at: nowIso,
    })).filter(r=>r.vessel_name);

    if(!rows.length) return {added:0,updated:0,total:positions.length};

    const { error } = await supabase.from("newbuilds_positions").insert(rows);
    if(error){ console.error("newbuilds_positions insert error:", error); return {added:0,updated:0,total:positions.length}; }
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
    const { error } = await supabase.from("vessels_newbuilds").update({ starred: next }).eq("imo", n.imo);
    if(error) console.error("star update error:", error);
  }

  function openEditor(n){
    setEditingVessel({ imo:n.imo, vessel:n.vessel, note:n.note||"", tag:n.tag||"" });
  }

  async function saveEditor(){
    if(!editingVessel) return;
    const { imo, note, tag } = editingVessel;
    setNewbuilds(prev=>prev.map(x=>x.imo===imo?{...x,note,tag}:x));
    const { error } = await supabase.from("vessels_newbuilds").update({ note, tag }).eq("imo", imo);
    if(error) console.error("note/tag update error:", error);
    setEditingVessel(null);
  }

  // Cross-browser clipboard copy (execCommand works reliably on iOS Safari
  // where navigator.clipboard often silently fails)
  function copyToClipboard(text){
    const ta=document.createElement("textarea");
    ta.value=text;
    ta.style.position="fixed"; ta.style.width="2px"; ta.style.height="2px";
    ta.style.background="transparent"; ta.style.opacity="0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok=false;
    try{ ok=document.execCommand("copy"); } catch{ ok=false; }
    document.body.removeChild(ta);
    return ok;
  }

  function handleCopy(list){
    if(!list.length) return;
    const lines=list.map(n=>{
      const seg=n._seg?.label?.replace(/^\d+\.\s*/,"")||"—";
      return `*${dispName(n.vessel).toUpperCase()}* — ${n.dwt?fmtN(n.dwt):"—"} dwt — ${n.coating||"—"} — ${seg}\nOperator: ${n.operator||"—"}   Owner: ${n.owner||"—"}`;
    });
    const ok=copyToClipboard(lines.join("\n\n"));
    setCopyStatus(ok?`Copied ${list.length} vessel(s)`:"Copy failed");
    setTimeout(()=>setCopyStatus(null),2500);
  }

  function handleExportCSV(list){
    if(!list.length) return;
    const headers=["Vessel","DWT","Coating","Segment","Operator","Owner"];
    const rows=list.map(n=>{
      const seg=n._seg?.label?.replace(/^\d+\.\s*/,"")||"";
      return [dispName(n.vessel), n.dwt||"", n.coating||"", seg, n.operator||"", n.owner||""];
    });
    const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`newbuild_orderbook_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Derived data ──────────────────────────────────────────────────────
  const enriched=useMemo(()=>newbuilds.map(n=>({
    ...n,
    _seg: segmentFor(n.dwt),
  })),[newbuilds]);

  const filtered=useMemo(()=>enriched.filter(n=>{
    if(segFilter && n._seg?.key!==segFilter) return false;
    if(countryFilter && n.country_build!==countryFilter) return false;
    if(coatingFilter && n.coating!==coatingFilter) return false;
    if(monthFilter){
      if(!n.delivery_date) return false;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())||monthKey(d)!==monthFilter) return false;
    }
    if(search.trim()){
      const t=search.trim().toLowerCase();
      const hay=[n.vessel,n.operator,n.owner,n.yard,n.country_build].filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(t)) return false;
    }
    return true;
  }),[enriched,segFilter,countryFilter,coatingFilter,monthFilter,search]);

  const countries=useMemo(()=>{
    const counts={};
    enriched.forEach(n=>{ if(n.country_build) counts[n.country_build]=(counts[n.country_build]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  },[enriched]);

  const coatings=useMemo(()=>{
    const counts={};
    enriched.forEach(n=>{ if(n.coating) counts[n.coating]=(counts[n.coating]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  },[enriched]);

  const monthOptions=useMemo(()=>{
    const map=new Map();
    enriched.forEach(n=>{
      if(!n.delivery_date) return;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())) return;
      const key=monthKey(d);
      if(!map.has(key)) map.set(key, fmtMonth(d));
    });
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  },[enriched]);

  const filtersActive = !!(segFilter||countryFilter||coatingFilter||monthFilter||search);
  function resetFilters(){
    setSegFilter(null); setCountryFilter(null); setCoatingFilter(null); setMonthFilter(null); setSearch("");
  }

  const segCounts=useMemo(()=>{
    const counts={};
    NB_SEGMENTS.forEach(s=>{ counts[s.key]={ships:0,dwt:0}; });
    enriched.forEach(n=>{
      if(!n._seg) return;
      counts[n._seg.key].ships++;
      counts[n._seg.key].dwt+=Number(n.dwt)||0;
    });
    return counts;
  },[enriched]);

  // Next N months delivery window — Barton deliveries + manually pasted positions, merged.
  // Barton side respects the shared filters (segment/coating/country/month/search);
  // manually pasted broker chatter always shows regardless, since it has no
  // coating/country/segment data of its own.
  const cutoff=useMemo(()=>monthsFromNow(monthsAhead),[monthsAhead]);
  const upcoming=useMemo(()=>{
    const fromBarton=filtered.filter(n=>{
      if(!n.delivery_date) return false;
      const d=new Date(n.delivery_date);
      return d>=new Date() && d<=cutoff;
    }).map(n=>({
      source:"barton",
      vessel:n.vessel, operator:n.operator, dwt:n.dwt,
      coating:n.coating, delivery:n.delivery_date,
    }));
    const fromManual=positions.map(p=>({
      source:"manual",
      vessel:p.vessel_name, operator:p.operator, dwt:null,
      coating:null, delivery:p.open_date, id:p.id,
    }));
    return [...fromBarton,...fromManual].sort((a,b)=>{
      const da=a.delivery?new Date(a.delivery).getTime():0;
      const db=b.delivery?new Date(b.delivery).getTime():0;
      return da-db;
    });
  },[filtered,positions,cutoff]);

  const totalShips=enriched.length;
  const totalDWT=enriched.reduce((a,n)=>a+(Number(n.dwt)||0),0);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {pendingDel&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"sans-serif",fontSize:12}}>
          <span style={{color:C.tx}}>Delete <strong>{pendingDel.vessel_name}</strong> from newbuild positions?</span>
          <button onClick={()=>deletePosition(pendingDel.id)} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDel(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
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
      </div>

      <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>

        {/* ── Left: Paste positions (broker chatter) ── */}
        <div style={{flex:"0 0 320px",minWidth:280,display:"flex",flexDirection:"column",gap:8}}>
          <SectionCard title="Paste Newbuild Positions" subtitle="Broker chatter on newbuilds open in Asia — feeds the delivery list below">
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
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 7px",background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,fontSize:11}}>
                    <span style={{fontWeight:700,color:"#79c0ff",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.vessel_name}</span>
                    <span style={{color:C.faint,whiteSpace:"nowrap"}}>{p.open_date||"—"}</span>
                    <span style={{color:"rgba(160,200,255,0.5)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:80}}>{p.port_name||""}</span>
                    <button onClick={()=>setPendingDel(p)} style={{background:"none",border:"none",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontSize:11,padding:0,flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Right: Segment breakdown + filters + delivery window + orderbook ── */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10}}>

          <SectionCard title="Segment Breakdown" subtitle="Across full Barton newbuild orderbook — click a row to filter">
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"rgba(8,18,38,0.9)"}}>
                    {["Segment","Ships","Sum DWT"].map(h=>(
                      <th key={h} style={{padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NB_SEGMENTS.map(s=>(
                    <tr key={s.key} onClick={()=>setSegFilter(f=>f===s.key?null:s.key)}
                      style={{cursor:"pointer",background:segFilter===s.key?"rgba(88,166,255,0.1)":"transparent"}}>
                      <td style={{padding:"5px 9px",fontWeight:700,color:s.color}}>{s.label}</td>
                      <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.8)"}}>{segCounts[s.key]?.ships||0}</td>
                      <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.8)"}}>{fmtN(segCounts[s.key]?.dwt||0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── Shared filter bar — narrows both Upcoming Deliveries and Full Orderbook ── */}
          <SectionCard title="Filters" subtitle="Applies to Upcoming Deliveries and Full Orderbook below">
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vessel/operator/yard…" style={{...inp,width:200}}/>
              <select value={coatingFilter||""} onChange={e=>setCoatingFilter(e.target.value||null)} style={{...inp,width:150}}>
                <option value="">All coatings</option>
                {coatings.map(([c,n])=>(<option key={c} value={c}>{c} ({n})</option>))}
              </select>
              <select value={countryFilter||""} onChange={e=>setCountryFilter(e.target.value||null)} style={{...inp,width:170}}>
                <option value="">All countries</option>
                {countries.map(([c,n])=>(<option key={c} value={c}>{c} ({n})</option>))}
              </select>
              <select value={monthFilter||""} onChange={e=>setMonthFilter(e.target.value||null)} style={{...inp,width:150}}>
                <option value="">All delivery months</option>
                {monthOptions.map(([k,label])=>(<option key={k} value={k}>{label}</option>))}
              </select>
              {filtersActive&&(
                <button onClick={resetFilters}
                  style={{fontSize:10,background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:4,color:"rgba(255,107,107,0.7)",padding:"6px 10px",cursor:"pointer",fontFamily:"inherit"}}>✕ Reset filters</button>
              )}
              <div style={{marginLeft:"auto",fontSize:11,color:C.faint}}>{filtered.length} of {totalShips} vessels match</div>
            </div>
          </SectionCard>

          <SectionCard
            title="Upcoming Deliveries"
            subtitle="Barton schedule + manually pasted positions, merged by date"
            right={
              <div style={{display:"flex",gap:4}}>
                {[1,3,6,12].map(m=>(
                  <button key={m} onClick={()=>setMonthsAhead(m)}
                    style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",
                      border:"1px solid "+(monthsAhead===m?"rgba(88,166,255,0.5)":C.bd),
                      background:monthsAhead===m?"rgba(88,166,255,0.15)":"transparent",
                      color:monthsAhead===m?"#79c0ff":C.faint}}>
                    {m}mo
                  </button>
                ))}
              </div>
            }>
            {upcoming.length===0?(
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>No deliveries in this window.</div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"rgba(8,18,38,0.9)"}}>
                      {["Vessel","DWT","Coating","Delivery","Operator",""].map(h=>(
                        <th key={h} style={{padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((u,i)=>(
                      <tr key={i} style={{background:u.source==="manual"?"rgba(167,139,250,0.06)":i%2===0?"rgba(7,15,28,0.5)":"transparent"}}>
                        <td style={{padding:"5px 9px",fontWeight:700,color:u.source==="manual"?"#a78bfa":"#79c0ff",whiteSpace:"nowrap"}}>
                          {dispName(u.vessel)}
                          {u.source==="manual"&&<span style={{fontSize:9,marginLeft:5,color:"rgba(167,139,250,0.6)",fontWeight:400}}>manual</span>}
                        </td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.dwt?fmtN(u.dwt):"—"}</td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.coating||"—"}</td>
                        <td style={{padding:"5px 9px",color:"rgba(160,200,255,0.7)",whiteSpace:"nowrap"}}>{u.delivery?(parseFlexibleDate(u.delivery)?fmtMonth(parseFlexibleDate(u.delivery)):u.delivery):"—"}</td>
                        <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>{u.operator||"—"}</td>
                        <td style={{padding:"5px 9px"}}>
                          {u.source==="manual"&&<button onClick={()=>setPendingDel({id:u.id,vessel_name:u.vessel})} style={{background:"none",border:"none",color:"rgba(255,107,107,0.4)",cursor:"pointer",fontSize:11,padding:0}}>✕</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

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
            {loading?(
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>Loading newbuild orderbook…</div>
            ):filtered.length===0?(
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>No vessels match this filter.</div>
            ):(
              <div style={{overflowX:"auto",maxHeight:460,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"rgba(8,18,38,0.9)",position:"sticky",top:0}}>
                      {["★","Vessel","DWT","CBM","Coating","Delivery","Operator","Owner","LOA","Beam","Tanks","Segs","Yard","Fuel Data","Other Data","Comments","Note"].map(h=>(
                        <th key={h} style={{padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((n,i)=>(
                      <tr key={n.imo||n.vessel||i} style={{background:i%2===0?"rgba(7,15,28,0.5)":"transparent"}}>
                        <td style={{padding:"4px 9px"}}>
                          <button onClick={()=>toggleStar(n)} disabled={!n.imo} style={{background:"none",border:"none",cursor:n.imo?"pointer":"default",fontSize:13,padding:0,color:n.starred?"#f5c518":"rgba(120,160,200,0.25)"}}>★</button>
                        </td>
                        <td style={{padding:"4px 9px",fontWeight:700,color:"#79c0ff",whiteSpace:"nowrap"}}>
                          {n.tag&&<span title={tagLabel(n.tag)} style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:tagColor(n.tag),marginRight:6}}/>}
                          {dispName(n.vessel)}
                        </td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.dwt)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.cbm)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{n.coating||"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(160,200,255,0.6)",whiteSpace:"nowrap"}}>{n.delivery_date?fmtMonth(new Date(n.delivery_date)):"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>{n.operator||"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(200,220,255,0.6)",whiteSpace:"nowrap"}}>{n.owner||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.loa)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.beam)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.tanks)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.segs)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{n.yard||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{n.fuel_type||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.other_data||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.comments||"—"}</td>
                        <td style={{padding:"4px 9px"}}>
                          <button onClick={()=>openEditor(n)} disabled={!n.imo} style={{background:"none",border:"none",cursor:n.imo?"pointer":"default",fontSize:12,padding:0,color:n.note?"#79c0ff":"rgba(120,160,200,0.35)"}}>
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
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setEditingVessel(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:10,padding:20,width:380,maxWidth:"90vw",fontFamily:"sans-serif"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.tx,marginBottom:12}}>{dispName(editingVessel.vessel)}</div>
            <div style={{fontSize:11,color:C.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tag</div>
            <select value={editingVessel.tag} onChange={e=>setEditingVessel(v=>({...v,tag:e.target.value}))} style={{...inp,width:"100%",marginBottom:12}}>
              {TAG_OPTIONS.map(t=>(<option key={t.key} value={t.key}>{t.label}</option>))}
            </select>
            <div style={{fontSize:11,color:C.faint,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Note</div>
            <textarea value={editingVessel.note} onChange={e=>setEditingVessel(v=>({...v,note:e.target.value}))} rows={4}
              style={{...inp,width:"100%",resize:"vertical",marginBottom:14,boxSizing:"border-box"}} placeholder="e.g. client interest, follow up next month…"/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setEditingVessel(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"6px 16px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Cancel</button>
              <button onClick={saveEditor} style={{background:"#43e97b",border:"none",borderRadius:5,color:"#06281a",padding:"6px 16px",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
