import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const ParsePanel = React.lazy(()=>import("./ParsePanel"));

// DWT segment buckets matching the Barton "Segs" convention
const NB_SEGMENTS = [
  { key:"sub10", label:"Sub 10k (<10)", color:"#38bdf8", dwt:[0,      9999]   },
  { key:"city",  label:"City (10-14)",  color:"#58a6ff", dwt:[10000, 14000]  },
  { key:"inter", label:"Inter (14-19)", color:"#4ade80", dwt:[14001, 19000]  },
  { key:"j19",   label:"J19 (19-23)",   color:"#f778ba", dwt:[19001, 23000]  },
  { key:"flexi", label:"Flexi (23-30)", color:"#ea9a00", dwt:[23001, 30000]  },
  { key:"handy", label:"Handy (30-40)", color:"#a78bfa", dwt:[30001, 40000]  },
  { key:"mr",    label:"MR (>40)",      color:"#22d3ee", dwt:[40001, 999999] },
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

function PieCard({title,subtitle,data,onSliceClick,activeLabel}){
  const clean=(data||[]).filter(x=>Number(x.value)>0);
  const total=clean.reduce((a,x)=>a+Number(x.value||0),0);

  if(!total){
    return(
      <div style={{flex:"1 1 0",minWidth:0,height:"100%",background:C.bg3,border:"1px solid "+C.bd,borderRadius:7,padding:"8px 10px",boxSizing:"border-box"}}>
        <div style={{fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.75)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{title}</div>
        <div style={{fontSize:10,color:C.faint,marginTop:1}}>{subtitle}</div>
        <div style={{fontSize:11,color:C.faint,padding:"18px 0",textAlign:"center"}}>No data</div>
      </div>
    );
  }

  let acc=0;
  const slices=clean.map((x,i)=>{
    const from=acc/total*100;
    acc+=Number(x.value);
    const to=acc/total*100;
    return {...x,from,to,color:PIE_COLORS[i%PIE_COLORS.length]};
  });
  const stops=slices.map(x=>`${x.color} ${x.from}% ${x.to}%`).join(",");

  return(
    <div style={{flex:"1 1 0",minWidth:0,height:"100%",background:C.bg3,border:"1px solid "+C.bd,borderRadius:7,padding:"8px 10px",boxSizing:"border-box"}}>
      <div style={{fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.75)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{title}</div>
      <div style={{fontSize:10,color:C.faint,marginTop:1}}>{subtitle}</div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:4,minHeight:180}}>
        <div
          title="Click a colour/legend item to filter"
          style={{
            width:174,height:174,borderRadius:"50%",
            background:`conic-gradient(${stops})`,
            position:"relative",flexShrink:0
          }}>
          <div style={{
            position:"absolute",inset:38,borderRadius:"50%",background:C.bg3,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            pointerEvents:"none"
          }}>
            <div style={{fontSize:20,fontWeight:800,color:C.tx}}>{total}</div>
            <div style={{fontSize:8,color:C.faint,textTransform:"uppercase"}}>ships</div>
          </div>

          {/* Full-ring clickable overlay: any point on a coloured slice filters */}
          {onSliceClick&&(
            <svg viewBox="0 0 174 174" style={{position:"absolute",inset:0,width:"100%",height:"100%",transform:"rotate(-90deg)"}}>
              {(()=>{
                const total=clean.reduce((a,x)=>a+Number(x.value||0),0)||1;
                const r=68, cx=87, cy=87, circ=2*Math.PI*r;
                let offset=0;
                return slices.map((x,i)=>{
                  const dash=(Number(x.value)/total)*circ;
                  const el=(
                    <circle key={x.label} cx={cx} cy={cy} r={r} fill="none"
                      stroke="transparent" strokeWidth="34"
                      strokeDasharray={`${dash} ${circ-dash}`}
                      strokeDashoffset={-offset}
                      style={{cursor:"pointer"}}
                      onClick={()=>onSliceClick(x.label)}>
                      <title>{`${x.label}: ${x.value}`}</title>
                    </circle>
                  );
                  offset+=dash;
                  return el;
                });
              })()}
            </svg>
          )}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:3,minWidth:0,flex:1,maxWidth:175}}>
          {slices.slice(0,9).map((x,i)=>{
            const active=activeLabel===x.label;
            return(
              <button key={x.label+"_"+i} onClick={()=>onSliceClick?.(x.label)}
                style={{
                  display:"flex",alignItems:"center",gap:5,fontSize:11,minWidth:0,
                  border:"none",background:active?"rgba(88,166,255,0.10)":"transparent",
                  borderRadius:3,padding:"2px 2px",cursor:onSliceClick?"pointer":"default",
                  fontFamily:"inherit",textAlign:"left"
                }}>
                <span style={{width:7,height:7,borderRadius:"50%",background:x.color,flexShrink:0,opacity:activeLabel&&!active?0.35:1}}/>
                <span title={x.label} style={{color:active?"#79c0ff":"rgba(190,215,245,0.72)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,fontWeight:active?700:500}}>
                  {x.label}
                </span>
                <span style={{color:C.tx,fontWeight:700,flexShrink:0}}>{x.value}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditableCell({value,onSave,placeholder="—",width=100,color=null,displayValue=null}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState("");
  const editId=React.useRef(`nb-edit-${Math.random().toString(36).slice(2)}`);

  function commit(nextDraft=draft){
    const before=String(value??"");
    const after=String(nextDraft??"");
    setEditing(false);
    if(after!==before) onSave?.(after);
  }

  function moveCell(direction){
    const currentId=editId.current;
    setTimeout(()=>{
      const cells=Array.from(document.querySelectorAll('[data-nb-editable="1"]'));
      const idx=cells.findIndex(el=>el.getAttribute("data-nb-edit-id")===currentId);
      if(idx<0) return;
      const target=cells[idx+direction];
      if(target){
        target.click();
        target.scrollIntoView?.({block:"nearest",inline:"nearest"});
      }
    },25);
  }

  if(editing){
    return(
      <input autoFocus value={draft}
        onChange={e=>setDraft(e.target.value)}
        onBlur={()=>commit()}
        onKeyDown={e=>{
          if(e.key==="Enter"){e.preventDefault();commit();}
          if(e.key==="Escape"){e.preventDefault();setEditing(false);}
          if(e.key==="Tab"){
            e.preventDefault();
            const dir=e.shiftKey?-1:1;
            commit();
            moveCell(dir);
          }
        }}
        style={{...inp,width,background:C.bg,border:"1px solid rgba(88,166,255,0.45)",padding:"2px 5px"}}
      />
    );
  }

  const shown=displayValue!==null&&displayValue!==undefined ? displayValue : value;
  return(
    <span
      data-nb-editable="1"
      data-nb-edit-id={editId.current}
      onClick={()=>{setDraft(value??"");setEditing(true);}}
      title="Click to edit"
      style={{
        display:"inline-block",minWidth:width,color:color||(value?C.dim:C.faint),
        cursor:"text",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
        verticalAlign:"middle"
      }}>
      {shown||placeholder}
    </span>
  );
}

export default function NewbuildsTab(){
  const [newbuilds,setNewbuilds]=useState([]);
  const [loading,setLoading]=useState(true);
  const [positions,setPositions]=useState([]);
  const [segFilter,setSegFilter]=useState(null);
  const [expandedSeg,setExpandedSeg]=useState(()=>new Set());
  const [countryFilter,setCountryFilter]=useState(null);
  const [coatingFilter,setCoatingFilter]=useState(null);
  const [ownerFilter,setOwnerFilter]=useState(null);
  const [dwtMin,setDwtMin]=useState("");
  const [dwtMax,setDwtMax]=useState("");
  const [monthFilter,setMonthFilter]=useState(null);
  const [quarterFilter,setQuarterFilter]=useState(null);
  const [search,setSearch]=useState("");
  const [monthsAhead,setMonthsAhead]=useState(3);
  const [pendingDel,setPendingDel]=useState(null);
  const [editingVessel,setEditingVessel]=useState(null);
  const [copyStatus,setCopyStatus]=useState(null);
  const [lastUpdated,setLastUpdated]=useState(null);
  const [pasteTab,setPasteTab]=useState("paste"); // paste | list
  const [existingFleet,setExistingFleet]=useState([]);
  const [shipComments,setShipComments]=useState({}); // stableKey -> comment

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
    async function fetchExistingFleet(){
      let all=[], from=0, pageSize=1000;
      while(true){
        const {data,error}=await supabase.from("vessels_db")
          .select("imo,vessel,dwt,built,coating")
          .gt("built",2000)
          .range(from,from+pageSize-1);
        if(error){console.error("existing fleet ratio fetch error:",error);break;}
        if(!data?.length) break;
        all=[...all,...data];
        if(data.length<pageSize) break;
        from+=pageSize;
      }
      setExistingFleet(all);
    }
    fetchExistingFleet();
  },[]);

  useEffect(()=>{
    async function fetchShipComments(){
      const {data,error}=await supabase.from("newbuilds_notes").select("vessel_key,comment");
      if(error){
        // The page still works before the one-time SQL migration is run.
        console.warn("newbuilds_notes fetch:",error.message);
        return;
      }
      const map={};
      (data||[]).forEach(r=>{if(r.vessel_key)map[r.vessel_key]=r.comment||"";});
      setShipComments(map);
    }
    fetchShipComments();
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
      dwt:p.dwt?Number(p.dwt)||null:null,
      coating:(p.coating||"").trim()||null,
      yard:(p.yard||"").trim()||null,
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

  async function updateManualPosition(id,field,value){
    setPositions(prev=>prev.map(p=>p.id===id?{...p,[field]:value}:p));
    const {error}=await supabase.from("newbuilds_positions")
      .update({[field]:value||null,updated_at:new Date().toISOString()})
      .eq("id",id);
    if(error) console.error("manual newbuild update:",error);
  }

  function stableShipKey(n){
    if(n.imo) return `IMO:${String(n.imo).trim()}`;
    return `VESSEL:${String(n.vessel||"").trim().toUpperCase()}|DWT:${Number(n.dwt)||0}`;
  }

  async function saveShipComment(n,value){
    const vessel_key=stableShipKey(n);
    setShipComments(prev=>({...prev,[vessel_key]:value}));
    const payload={
      vessel_key,
      imo:n.imo||null,
      vessel:n.vessel||null,
      dwt:Number(n.dwt)||null,
      comment:value||null,
      updated_at:new Date().toISOString(),
    };
    const {error}=await supabase.from("newbuilds_notes").upsert(payload,{onConflict:"vessel_key"});
    if(error) console.error("newbuild comment save:",error);
  }

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
  function handleExportUpcomingCSV(list){
    if(!list.length) return;
    const headers=["Vessel","DWT","Coating","Delivery","Operator","Yard","Comment","Source"];
    const rows=list.map(u=>[
      dispName(u.vessel),u.dwt||"",u.coating||"",u.delivery||"",u.operator||"",u.yard||"",u.comment||"",u.source||""
    ]);
    const csv=[headers,...rows]
      .map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(","))
      .join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`newbuild_upcoming_deliveries_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  }


  // ── Derived data ──────────────────────────────────────────────────────
  const enriched=useMemo(()=>newbuilds.map(n=>({...n,_seg:segmentFor(Number(n.dwt)||0)})),[newbuilds]);

  const filtered=useMemo(()=>enriched.filter(n=>{
    if(segFilter && n._seg?.key!==segFilter) return false;
    if(countryFilter && n.country_build!==countryFilter) return false;
    if(coatingFilter && n.coating!==coatingFilter) return false;
    if(ownerFilter && (n.owner||"Unknown")!==ownerFilter) return false;

    const dwt=Number(n.dwt)||0;
    if(dwtMin!=="" && dwt<Number(dwtMin)) return false;
    if(dwtMax!=="" && dwt>Number(dwtMax)) return false;

    if(monthFilter){
      if(!n.delivery_date) return false;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())||monthKey(d)!==monthFilter) return false;
    }
    if(quarterFilter){
      if(!n.delivery_date) return false;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())) return false;
      const qKey=`${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;
      if(qKey!==quarterFilter) return false;
    }

    if(search.trim()){
      const t=search.trim().toLowerCase();
      const hay=[n.vessel,n.operator,n.owner,n.yard,n.country_build,n.coating]
        .filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(t)) return false;
    }
    return true;
  }),[enriched,segFilter,countryFilter,coatingFilter,ownerFilter,dwtMin,dwtMax,monthFilter,quarterFilter,search]);

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
    segFilter||countryFilter||coatingFilter||ownerFilter||
    dwtMin!==""||dwtMax!==""||monthFilter||quarterFilter||search
  );

  function resetFilters(){
    setSegFilter(null);
    setCountryFilter(null);
    setCoatingFilter(null);
    setOwnerFilter(null);
    setDwtMin("");
    setDwtMax("");
    setMonthFilter(null);
    setQuarterFilter(null);
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


  const existingSegCounts=useMemo(()=>{
    const counts={};
    NB_SEGMENTS.forEach(seg=>counts[seg.key]=0);
    existingFleet.forEach(r=>{
      if(Number(r.built)<=2000) return;
      const seg=segmentFor(Number(r.dwt)||0);
      if(seg) counts[seg.key]=(counts[seg.key]||0)+1;
    });
    return counts;
  },[existingFleet]);

  const segmentCoatingStats=useMemo(()=>{
    const result={};
    NB_SEGMENTS.forEach(seg=>{
      const nbRows=enriched.filter(n=>n._seg?.key===seg.key);
      const fleetRows=existingFleet.filter(r=>Number(r.built)>2000 && segmentFor(Number(r.dwt)||0)?.key===seg.key);
      const names=[...new Set([...nbRows.map(r=>r.coating||"Unknown"),...fleetRows.map(r=>r.coating||"Unknown")])];
      result[seg.key]=names.map(coating=>{
        const nb=nbRows.filter(r=>(r.coating||"Unknown")===coating);
        const fleet=fleetRows.filter(r=>(r.coating||"Unknown")===coating);
        return {
          coating,
          ships:nb.length,
          fleet:fleet.length,
          ratio:fleet.length ? nb.length/fleet.length : null,
          dwt:nb.reduce((a,r)=>a+(Number(r.dwt)||0),0),
        };
      }).filter(x=>x.ships||x.fleet).sort((a,b)=>b.ships-a.ships);
    });
    return result;
  },[enriched,existingFleet]);

  // Chart 1 = all segments by ship count.
  // Charts 2/3 = coating and owner for the clicked segment (or all segments if none clicked).
  const chartBase=useMemo(
    ()=>segFilter ? enriched.filter(n=>n._seg?.key===segFilter) : enriched,
    [enriched,segFilter]
  );

  const chartSegmentData=useMemo(
    ()=>NB_SEGMENTS.map(seg=>({
      label:seg.label,
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
    ? (NB_SEGMENTS.find(x=>x.key===segFilter)?.label||"Selected segment")
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
        imo:n.imo,
        vessel:n.vessel,
        operator:n.operator,
        yard:n.yard,
        dwt:n.dwt,
        coating:n.coating,
        delivery:n.delivery_date,
        comment:shipComments[stableShipKey(n)]||"",
      }));

    const fromManual=positions.map(p=>({
      source:"manual",
      vessel:p.vessel_name,
      operator:p.operator,
      yard:p.yard||null,
      dwt:p.dwt||null,
      coating:p.coating||null,
      delivery:p.open_date,
      comment:p.comment||"",
      port_name:p.port_name||null,
      id:p.id,
    }));

    return [...fromBarton,...fromManual].sort((a,b)=>{
      const da=a.delivery?new Date(a.delivery).getTime():0;
      const db=b.delivery?new Date(b.delivery).getTime():0;
      return da-db;
    });
  },[filtered,positions,cutoff]);

  const deliveryTimeline=useMemo(()=>{
    const now=new Date();
    const currentQuarter=Math.floor(now.getMonth()/3);
    const start=new Date(now.getFullYear(),currentQuarter*3,1);
    const quarters=[];
    for(let i=0;i<8;i++){
      const d=new Date(start.getFullYear(),start.getMonth()+i*3,1);
      const q=Math.floor(d.getMonth()/3)+1;
      const key=`${d.getFullYear()}-Q${q}`;
      const months=[];
      for(let m=0;m<3;m++){
        const md=new Date(d.getFullYear(),d.getMonth()+m,1);
        months.push(monthKey(md));
      }
      quarters.push({key,label:`Q${q}`,year:String(d.getFullYear()),count:0,months});
    }
    filtered.forEach(n=>{
      if(!n.delivery_date) return;
      const d=new Date(n.delivery_date);
      if(isNaN(d.getTime())) return;
      const mk=monthKey(d);
      const q=quarters.find(x=>x.months.includes(mk));
      if(q) q.count++;
    });
    return quarters;
  },[filtered]);
  const deliveryMax=Math.max(1,...deliveryTimeline.map(x=>x.count));

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
        <div style={{flex:"0 0 320px",minWidth:280,boxSizing:"border-box",display:"flex",gap:16,alignItems:"center",background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"10px 12px"}}>
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


      <div style={{display:"flex",gap:12,alignItems:"stretch",flexWrap:"wrap"}}>

        {/* ── Left: compact Paste / Pasted tabs ── */}
        <div style={{flex:"0 0 320px",minWidth:280,display:"flex"}}>
          <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,overflow:"hidden",width:"100%",height:"100%",display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",borderBottom:"1px solid "+C.bd}}>
              {[["paste","Paste"],["list",`Pasted (${positions.length})`]].map(([k,label])=>(
                <button key={k} onClick={()=>setPasteTab(k)}
                  style={{
                    flex:1,border:"none",borderBottom:"2px solid "+(pasteTab===k?"#58a6ff":"transparent"),
                    background:pasteTab===k?"rgba(88,166,255,0.08)":"transparent",
                    color:pasteTab===k?"#79c0ff":C.faint,fontSize:10,fontWeight:700,
                    padding:"7px 8px",cursor:"pointer",fontFamily:"inherit",textTransform:"uppercase",letterSpacing:"0.05em"
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {pasteTab==="paste" ? (
              <div style={{padding:"8px 10px",flex:1,display:"flex",flexDirection:"column"}}>
                <div style={{fontSize:9,color:C.faint,marginBottom:5}}>
                  Paste broker chatter / positions. Details can be edited later in the Pasted tab.
                </div>
                <div style={{flex:1,minHeight:0,overflow:"hidden"}}>
                  <React.Suspense fallback={<div style={{fontSize:11,color:C.faint}}>Loading…</div>}>
                    <ParsePanel
                      vessels={[]}
                      cargoes={[]}
                      onAddVessels={addNewbuildPositions}
                      lockedMode="pos"
                      compactToolbar
                      vesselDB={{}}
                    />
                  </React.Suspense>
                </div>
              </div>
            ) : (
              <div style={{padding:"7px 8px",maxHeight:235,overflow:"auto"}}>
                {positions.length===0 ? (
                  <div style={{padding:12,fontSize:11,color:C.faint,textAlign:"center"}}>No pasted positions.</div>
                ) : (
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                    <thead>
                      <tr>{["Vessel","DWT","Date","Port",""].map(h=><th key={h} style={{padding:"3px 4px",textAlign:"left",color:C.faint,fontSize:8,textTransform:"uppercase",borderBottom:"1px solid "+C.bd}}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {positions.map(p=>(
                        <tr key={p.id}>
                          <td style={{padding:"3px 4px",borderBottom:"1px solid "+C.bd2}}>
                            <EditableCell value={p.vessel_name} onSave={v=>updateManualPosition(p.id,"vessel_name",v)} width={82} color="#79c0ff"/>
                          </td>
                          <td style={{padding:"3px 4px",borderBottom:"1px solid "+C.bd2}}>
                            <EditableCell
                              value={p.dwt}
                              displayValue={p.dwt?fmtN(p.dwt):""}
                              onSave={v=>updateManualPosition(p.id,"dwt",v?Number(String(v).replace(/,/g,"")):null)}
                              width={52}
                            />
                          </td>
                          <td style={{padding:"3px 4px",borderBottom:"1px solid "+C.bd2}}>
                            <EditableCell value={p.open_date} onSave={v=>updateManualPosition(p.id,"open_date",v)} width={60}/>
                          </td>
                          <td style={{padding:"3px 4px",borderBottom:"1px solid "+C.bd2}}>
                            <EditableCell value={p.port_name} onSave={v=>updateManualPosition(p.id,"port_name",v)} width={55}/>
                          </td>
                          <td style={{padding:"3px 4px",borderBottom:"1px solid "+C.bd2}}>
                            <button onClick={()=>setPendingDel(p)} style={{background:"none",border:"none",color:"rgba(255,107,107,0.55)",cursor:"pointer",fontSize:10}}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right ── */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:10}}>

          <div style={{display:"grid",gridTemplateColumns:"minmax(0,3fr) minmax(300px,2fr)",gap:10,alignItems:"stretch"}}>
            <SectionCard title="Segment Breakdown" subtitle="Click segment to filter · expand to show coating">
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"rgba(8,18,38,0.9)"}}>
                      {[
                        ["Segment","left"],["Ships","right"],["Existing Fleet","right"],["NB Ratio","right"],["Sum DWT","right"]
                      ].map(([h,a])=>(
                        <th key={h} style={{padding:"5px 9px",textAlign:a,fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"1px solid rgba(58,130,246,0.12)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {NB_SEGMENTS.map(seg=>{
                      const open=expandedSeg.has(seg.key);
                      const nbShips=segCounts[seg.key]?.ships||0;
                      const fleetShips=existingSegCounts[seg.key]||0;
                      return <React.Fragment key={seg.key}>
                        <tr style={{background:segFilter===seg.key?"rgba(88,166,255,0.1)":"transparent"}}>
                          <td style={{padding:"5px 9px",fontWeight:700,color:seg.color,whiteSpace:"nowrap"}}>
                            <button onClick={e=>{e.stopPropagation();setExpandedSeg(prev=>{const n=new Set(prev);n.has(seg.key)?n.delete(seg.key):n.add(seg.key);return n;});}}
                              style={{background:"none",border:"none",color:seg.color,cursor:"pointer",padding:"0 5px 0 0",fontSize:13,lineHeight:1,fontWeight:700}}>{open?"▾":"▸"}</button>
                            <span onClick={()=>setSegFilter(f=>f===seg.key?null:seg.key)} style={{cursor:"pointer"}}>{seg.label}</span>
                          </td>
                          <td onClick={()=>setSegFilter(f=>f===seg.key?null:seg.key)} style={{padding:"5px 9px",textAlign:"right",color:"rgba(200,220,255,0.8)",cursor:"pointer"}}>{nbShips}</td>
                          <td style={{padding:"5px 9px",textAlign:"right",color:"rgba(200,220,255,0.7)"}}>{fleetShips}</td>
                          <td style={{padding:"5px 9px",textAlign:"right",color:"#79c0ff",fontWeight:700}}>{fleetShips?((nbShips/fleetShips)*100).toFixed(0)+"%":"—"}</td>
                          <td style={{padding:"5px 9px",textAlign:"right",color:"rgba(200,220,255,0.8)"}}>{fmtN(segCounts[seg.key]?.dwt||0)}</td>
                        </tr>
                        {open&&(segmentCoatingStats[seg.key]||[]).map(c=>(
                          <tr key={seg.key+"-"+c.coating} style={{background:"rgba(8,18,38,0.35)"}}>
                            <td style={{padding:"4px 9px 4px 28px",color:"rgba(232,238,246,0.86)",fontSize:11}}>{c.coating}</td>
                            <td style={{padding:"4px 9px",textAlign:"right",color:"rgba(232,238,246,0.80)",fontSize:11}}>{c.ships}</td>
                            <td style={{padding:"4px 9px",textAlign:"right",color:"rgba(232,238,246,0.76)",fontSize:11}}>{c.fleet}</td>
                            <td style={{padding:"4px 9px",textAlign:"right",color:"rgba(121,192,255,.75)",fontSize:11}}>{c.ratio!=null?(c.ratio*100).toFixed(0)+"%":"—"}</td>
                            <td style={{padding:"4px 9px",textAlign:"right",color:"rgba(232,238,246,0.76)",fontSize:11}}>{fmtN(c.dwt)}</td>
                          </tr>
                        ))}
                      </React.Fragment>;
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="Delivery Profile" subtitle="Next 8 quarters">
              <div style={{height:210,display:"flex",alignItems:"stretch",gap:8,padding:"8px 6px 0"}}>
                {deliveryTimeline.map(q=>(
                  <div key={q.key} title={`${q.label} ${q.year}: ${q.count} ship${q.count===1?"":"s"} · click to filter`}
                    onClick={()=>setQuarterFilter(prev=>prev===q.key?null:q.key)}
                    style={{flex:"1 1 0",minWidth:0,display:"flex",flexDirection:"column",justifyContent:"flex-end",alignItems:"center",cursor:"pointer",opacity:quarterFilter&&quarterFilter!==q.key?0.35:1}}>
                    {q.count>0&&<div style={{fontSize:10,color:"#ffffff",fontWeight:400,marginBottom:3}}>{q.count}</div>}
                    <div style={{width:"68%",minWidth:8,height:`${Math.max(q.count?8:2,(q.count/deliveryMax)*158)}px`,background:quarterFilter===q.key?"#79c0ff":q.count?"#58a6ff":"rgba(88,166,255,.10)",borderRadius:"3px 3px 0 0"}}/>
                    <div style={{height:30,paddingTop:5,fontSize:10,color:"#ffffff",fontWeight:400,whiteSpace:"nowrap",textAlign:"center",lineHeight:1.1}}>
                      <div>{q.label}</div>
                      <div style={{fontWeight:700,fontSize:10,marginTop:2}}>{q.year}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      <SectionCard title="Orderbook Mix">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,alignItems:"stretch"}}>
              <PieCard title="Segments" subtitle="Number of ships" data={chartSegmentData}
                activeLabel={segFilter ? NB_SEGMENTS.find(x=>x.key===segFilter)?.label : null}
                onSliceClick={label=>{const seg=NB_SEGMENTS.find(x=>x.label===label);setSegFilter(prev=>prev===seg?.key?null:(seg?.key||null));}}/>
              <PieCard title="Coating" subtitle={selectedSegLabel} data={chartCoatingData} activeLabel={coatingFilter}
                onSliceClick={label=>setCoatingFilter(prev=>prev===label?null:label)}/>
              <PieCard title="Owner" subtitle={`${selectedSegLabel} · top owners`} data={chartOwnerData} activeLabel={ownerFilter}
                onSliceClick={label=>setOwnerFilter(prev=>prev===label?null:label)}/>
            </div>
      </SectionCard>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* ── Shared filters ── */}
          <SectionCard title="Filters">
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",width:200}}>
                <input
                  value={search}
                  onChange={e=>setSearch(e.target.value)}
                  placeholder="Search vessel/operator/yard…"
                  style={{...inp,width:"100%",paddingRight:28}}
                />
                {search&&(
                  <button onClick={()=>setSearch("")} title="Clear search"
                    style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
                      width:16,height:16,border:"none",borderRadius:"50%",
                      background:"rgba(120,160,220,0.10)",color:C.faint,cursor:"pointer",
                      fontSize:10,lineHeight:1,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    ×
                  </button>
                )}
              </div>

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
                  type="text"
                  inputMode="numeric"
                  value={dwtMin}
                  onChange={e=>setDwtMin(e.target.value.replace(/[^0-9]/g,""))}
                  placeholder="From"
                  style={{...inp,width:82}}
                />
                <span style={{fontSize:10,color:C.faint}}>–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dwtMax}
                  onChange={e=>setDwtMax(e.target.value.replace(/[^0-9]/g,""))}
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

              {ownerFilter&&(
                <button onClick={()=>setOwnerFilter(null)}
                  style={{...inp,width:"auto",cursor:"pointer",color:"#79c0ff",background:"rgba(88,166,255,0.10)"}}>
                  Owner: {ownerFilter} ✕
                </button>
              )}

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
            right={
              <div style={{display:"flex",gap:7,alignItems:"center"}}>
                <button onClick={()=>handleExportUpcomingCSV(upcoming)} style={{...BTN_SM,padding:"3px 9px",fontSize:10}}>⬇ Export CSV</button>
                <div style={{width:1,height:20,background:C.bd,margin:"0 3px"}}/>
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
                      {["Vessel","DWT","Coating","Delivery","Operator","Yard","Comment",""].map(h=>(
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
                          {u.source==="manual"
                            ? <EditableCell value={u.vessel} onSave={v=>updateManualPosition(u.id,"vessel_name",v)} width={110} color="#a78bfa"/>
                            : dispName(u.vessel)}
                          {u.source==="manual"&&(
                            <span style={{fontSize:9,marginLeft:5,color:"rgba(167,139,250,0.6)",fontWeight:400}}>manual</span>
                          )}
                        </td>

                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>
                          {u.source==="manual"
                            ? <EditableCell
                              value={u.dwt}
                              displayValue={u.dwt?fmtN(u.dwt):""}
                              onSave={v=>updateManualPosition(u.id,"dwt",v?Number(String(v).replace(/,/g,"")):null)}
                              width={68}
                            />
                            : (u.dwt?fmtN(u.dwt):"—")}
                        </td>

                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap"}}>
                          {u.source==="manual"
                            ? <EditableCell value={u.coating} onSave={v=>updateManualPosition(u.id,"coating",v)} width={72}/>
                            : (u.coating||"—")}
                        </td>

                        <td style={{padding:"5px 9px",color:"rgba(160,200,255,0.7)",whiteSpace:"nowrap"}}>
                          {u.source==="manual"
                            ? <EditableCell value={u.delivery} onSave={v=>updateManualPosition(u.id,"open_date",v)} width={72} color="#79c0ff"/>
                            : (u.delivery?(parseFlexibleDate(u.delivery)?fmtMonth(parseFlexibleDate(u.delivery)):u.delivery):"—")}
                        </td>

                        <td style={{padding:"5px 9px",color:"rgba(200,220,255,0.7)",whiteSpace:"nowrap"}}>
                          {u.source==="manual"
                            ? <EditableCell value={u.operator} onSave={v=>updateManualPosition(u.id,"operator",v)} width={105}/>
                            : (u.operator||"—")}
                        </td>

                        <td style={{padding:"5px 9px",color:C.faint,whiteSpace:"nowrap",maxWidth:170,overflow:"hidden",textOverflow:"ellipsis"}}>
                          {u.source==="manual"
                            ? <EditableCell value={u.yard} onSave={v=>updateManualPosition(u.id,"yard",v)} width={105}/>
                            : (u.yard||"—")}
                        </td>

                        <td style={{padding:"5px 9px",whiteSpace:"nowrap"}}>
                          <EditableCell
                            value={u.comment}
                            onSave={v=>u.source==="manual"
                              ? updateManualPosition(u.id,"comment",v)
                              : saveShipComment(u,v)}
                            placeholder="add comment"
                            width={130}
                          />
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
