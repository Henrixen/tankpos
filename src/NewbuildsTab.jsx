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

// Quick free-text date parser for manually pasted newbuild positions (DD Mon / DD Mon YYYY / Mon YYYY)
function parseFlexibleDate(s){
  if(!s) return null;
  const t=s.trim();
  const d=new Date(t);
  if(!isNaN(d.getTime())) return d;
  return null;
}

const inp={background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"4px 7px",outline:"none",boxSizing:"border-box"};

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
  const [search,setSearch]=useState("");
  const [monthsAhead,setMonthsAhead]=useState(3);
  const [pendingDel,setPendingDel]=useState(null);

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

  // ── Derived data ──────────────────────────────────────────────────────
  const enriched=useMemo(()=>newbuilds.map(n=>({
    ...n,
    _seg: segmentFor(n.dwt),
  })),[newbuilds]);

  const filtered=useMemo(()=>enriched.filter(n=>{
    if(segFilter && n._seg?.key!==segFilter) return false;
    if(countryFilter && n.country_build!==countryFilter) return false;
    if(search.trim()){
      const t=search.trim().toLowerCase();
      const hay=[n.vessel,n.operator,n.owner,n.yard,n.country_build].filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(t)) return false;
    }
    return true;
  }),[enriched,segFilter,countryFilter,search]);

  const countries=useMemo(()=>{
    const counts={};
    enriched.forEach(n=>{ if(n.country_build) counts[n.country_build]=(counts[n.country_build]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  },[enriched]);

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

  // Next N months delivery window — Barton deliveries + manually pasted positions, merged
  const cutoff=useMemo(()=>monthsFromNow(monthsAhead),[monthsAhead]);
  const upcoming=useMemo(()=>{
    const fromBarton=enriched.filter(n=>{
      if(!n.delivery_date) return false;
      const d=new Date(n.delivery_date);
      return d>=new Date() && d<=cutoff;
    }).map(n=>({
      source:"barton",
      vessel:n.vessel, operator:n.operator, owner:n.owner, dwt:n.dwt,
      coating:n.coating, delivery:n.delivery_date, country:n.country_build,
      yard:n.yard, seg:n._seg?.label||"", comment:n.comments||"",
    }));
    const fromManual=positions.map(p=>({
      source:"manual",
      vessel:p.vessel_name, operator:p.operator, owner:null, dwt:null,
      coating:null, delivery:p.open_date, country:null,
      yard:null, seg:"", comment:p.comment||"", id:p.id, port:p.port_name,
    }));
    return [...fromBarton,...fromManual].sort((a,b)=>{
      const da=a.delivery?new Date(a.delivery).getTime():0;
      const db=b.delivery?new Date(b.delivery).getTime():0;
      return da-db;
    });
  },[enriched,positions,cutoff]);

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

        {/* ── Right: Delivery window + filters + table ── */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10}}>

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
                      {["Vessel","Operator/Owner","DWT","Coating","Delivery","Country/Port","Yard","Seg","Comment",""].map(h=>(
                        <th key={h} style={{padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((u,i)=>(
                      <tr key={i} style={{background:u.source==="manual"?"rgba(167,139,250,0.06)":i%2===0?"rgba(7,15,28,0.5)":"transparent"}}>
                        <td style={{padding:"5px 9px",fontWeight:700,color:u.source==="manual"?"#a78bfa":"#79c0ff",whiteSpace:"nowrap"}}>
                          {u.vessel}
                          {u.source==="manual"&&<span style={{fontSize:9,marginLeft:5,color:"rgba(167,139,250,0.6)",fontWeight:400}}>manual</span>}
                        </td>
                        <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>{u.operator||u.owner||"—"}</td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.dwt?fmtN(u.dwt):"—"}</td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.coating||"—"}</td>
                        <td style={{padding:"5px 9px",color:"rgba(160,200,255,0.7)",whiteSpace:"nowrap"}}>{u.delivery?(parseFlexibleDate(u.delivery)?fmtMonth(parseFlexibleDate(u.delivery)):u.delivery):"—"}</td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.country||u.port||"—"}</td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.yard||"—"}</td>
                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>{u.seg||"—"}</td>
                        <td style={{padding:"5px 9px",color:"rgba(160,200,255,0.55)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.comment||""}</td>
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

          <SectionCard title="Segment Breakdown" subtitle="Across full Barton newbuild orderbook">
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

          <SectionCard
            title="Full Orderbook"
            subtitle={`${filtered.length} of ${totalShips} vessels`}
            right={
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vessel/operator/yard…" style={{...inp,width:180}}/>
                <select value={countryFilter||""} onChange={e=>setCountryFilter(e.target.value||null)} style={{...inp,width:160}}>
                  <option value="">All countries</option>
                  {countries.map(([c,n])=>(<option key={c} value={c}>{c} ({n})</option>))}
                </select>
                {(segFilter||countryFilter||search)&&(
                  <button onClick={()=>{setSegFilter(null);setCountryFilter(null);setSearch("");}}
                    style={{fontSize:10,background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:4,color:"rgba(255,107,107,0.7)",padding:"4px 8px",cursor:"pointer",fontFamily:"inherit"}}>✕ Clear</button>
                )}
              </div>
            }>
            {loading?(
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>Loading newbuild orderbook…</div>
            ):filtered.length===0?(
              <div style={{padding:"20px",textAlign:"center",color:C.faint,fontSize:12}}>No vessels match this filter.</div>
            ):(
              <div style={{overflowX:"auto",maxHeight:420,overflowY:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"rgba(8,18,38,0.9)",position:"sticky",top:0}}>
                      {["Vessel","DWT","Coating","Built/Delivery","Operator","Owner","Country","Yard","Seg"].map(h=>(
                        <th key={h} style={{padding:"5px 9px",textAlign:"left",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((n,i)=>(
                      <tr key={n.imo||n.vessel||i} style={{background:i%2===0?"rgba(7,15,28,0.5)":"transparent"}}>
                        <td style={{padding:"4px 9px",fontWeight:700,color:"#79c0ff",whiteSpace:"nowrap"}}>{n.vessel}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{fmtN(n.dwt)}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{n.coating||"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(160,200,255,0.6)",whiteSpace:"nowrap"}}>{n.delivery_date?fmtMonth(new Date(n.delivery_date)):"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>{n.operator||"—"}</td>
                        <td style={{padding:"4px 9px",color:"rgba(200,220,255,0.6)",whiteSpace:"nowrap"}}>{n.owner||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap"}}>{n.country_build||"—"}</td>
                        <td style={{padding:"4px 9px",color:C.faint,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{n.yard||"—"}</td>
                        <td style={{padding:"4px 9px",color:n._seg?.color||C.faint,whiteSpace:"nowrap",fontWeight:600}}>{n._seg?.label||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
