import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { C, OP_COLORS, isMobile } from "./constants";
import { toTCase, fmtN, isOpenPPT, classifyRegion, daysBetween, normaliseQty, fmtDateShort, fmtFreight, calcVoyage, calcEuEts } from "./utils";
import EC from "./EC";
import ParsePanel from "./ParsePanel";
import RightPanel from "./AIAsk";
import { RateMatrix, RateMatrixBunkerInput } from "./RateMatrix";
import FixingTab from "./FixingTab";
import ProjectsTab from "./ProjectsTab";
import { TCECalculator } from "./TCECalculator";
import Dashboard from "./Dashboard";
import { loadHistory } from "./supabaseHelpers";
import { OpeningBreakdown, FixingWindow, ExportPanel } from "./PositionsHelpers";
import IntelVault from "./IntelVault";
import AISMap from "./AISMap";

function DesktopApp({vessels,cargoes,cargoTotal,onUpdateV,onRenameV,onUpdateC,onAddVessels,onAddCargoes,onAddV,onAddC,onDelV,onDelC,hasMore,onLoadMore,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB}){
  const [tab,setTab]=useState("pos");
  const [search,setSearch]=useState("");
  const [filters,setFilters]=useState(new Set());
  const [sortK,setSortK]=useState("fileDate");
  const [sortD,setSortD]=useState(-1);
  const [sel,setSel]=useState(null);
  const [opFilter,setOpFilter]=useState(null);
  const [updFilter,setUpdFilter]=useState(""); // "" | "today" | "week"
  const [bucketFilters,setBucketFilters]=useState(new Set()); // set of active bucket keys
 const [posFileDaysBack,setPosFileDaysBack]=useState(90);
const [posPage,setPosPage]=useState(1);
const POS_PAGE_SIZE=100;
const [superRegionFilter,setSuperRegionFilter]=useState("ALL");
const [segmentFilter,setSegmentFilter]=useState("");
  const [cSearch,setCSearch]=useState("");const [cFilter,setCFilter]=useState("ALL");const [cDateFilter,setCDateFilter]=useState("");
  const [cTimeFilter,setCTimeFilter]=useState("");
  const [mxSearch,setMxSearch]=useState("");
  const [cSortK,setCsortK]=useState("updated");
  const [selCargoes,setSelCargoes]=useState(()=>new Set());const [cSortD,setCsortD]=useState(-1);
  const [selVessels,setSelVessels]=useState(()=>new Set());
  const [history,setHistory]=useState([]);
  useEffect(()=>{loadHistory().then(setHistory);},[vessels]);
  const [pendingDel,setPendingDel]=useState(null);
  const [restoreMsg,setRestoreMsg]=useState("");
  const restoreRef=useRef(null); // {type:'vessel'|'cargo'|'all', id, label}
  const [colWidthsV,setColWidthsV]=useState({Operator:120,Vessel:120,Built:48,DWT:55,LOA:48,Beam:46,CBM:55,Date:68,OpenPort:100,Comment:200,FileDate:60,Spec:72});
  const [colWidthsC,setColWidthsC]=useState({Status:60,Vessel:130,Charterer:110,Cargo:80,Qty:60,Load:100,Disch:100,LaycanStart:90,LaycanEnd:90,Freight:90,Comment:120,Updated:88});
  const [askAiExpanded,setAskAiExpanded]=useState(false);
  const [intelVaultExpanded,setIntelVaultExpanded]=useState(false);
  const [selectedAISVessels,setSelectedAISVessels]=useState([]);

  const mobile=isMobile();
  const th={background:C.bg2,color:C.dim,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",padding:"6px 8px",borderBottom:"1px solid "+C.bd2,textAlign:"left",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"};
  const td={padding:"4px 7px",borderBottom:"1px solid "+C.bg2,verticalAlign:"middle",fontSize:12};
  const fb=on=>({fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:4,border:"1px solid "+(on?C.blue:C.bd),background:on?"rgba(88,166,255,.12)":"transparent",color:on?C.blue:C.dim,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"});

  // Tag component for vessel specs
  const Tag=({col,children})=><span style={{fontSize:11,fontWeight:600,padding:"2px 6px",borderRadius:3,background:col+"18",border:"1px solid "+col+"44",color:col}}>{children}</span>;

  function toggleFilter(f){setFilters(prev=>{const n=new Set(prev);n.has(f)?n.delete(f):n.add(f);return n;});}
  function srt(k){setSortD(sortK===k?sortD*-1:1);setSortK(k);}

  // Multi-token search across all text fields
  const tokens=search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  function matchesSearch(v){
  if(!tokens.length)return true;
  const hay=JSON.stringify(v).toLowerCase();
  return tokens.every(t=>hay.includes(t));
}

const superRegionOptions=["ALL", ...Array.from(new Set(
  vessels.map(v=>String(v.superRegion||"").trim()).filter(Boolean)
)).sort((a,b)=>a.localeCompare(b))];

function daysAgoDate(days){
  const d=new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()-days);
  return d;
}

function fmtShortDate(d){
  if(!d) return "";
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
}

const filtV=useMemo(()=>{
  let list=vessels;

  if(filters.size>0){
    list=list.filter(v=>{
      if(filters.has("PPT") && !isOpenPPT(v.date)) return false;
      if(filters.has("HIDE_EMP") && v.openPort==="EMPLOYED") return false;
      if(filters.has("NAP") && !(v.comment?.toLowerCase().includes("naph") || v.spec?.lastCargo?.toLowerCase().includes("naph"))) return false;
      if(filters.has("SUBS") && v.openPort!=="EMPLOYED") return false;

      const reg=classifyRegion(v.openPort);
      for(const r of ["WCUK","ECUK","CANAL","BISCAY","BALTIC","SKAW","MED"]){
        if(filters.has(r) && reg!==r) return false;
      }
      return true;
    });
  }

  if(bucketFilters.size>0){
    list=list.filter(v=>{
      if(v.openPort==="EMPLOYED") return false;
      const d=daysBetween(v.date);
      const inPPT=d!==null && d>=0 && d<=1;
      const in24=d!==null && d>=2 && d<=4;
      const in48=d!==null && d>=5 && d<=8;
      const in8p=d!==null && d>8;
      return (bucketFilters.has("PPT") && inPPT)
        || (bucketFilters.has("2-4d") && in24)
        || (bucketFilters.has("4-8d") && in48)
        || (bucketFilters.has(">8d") && in8p);
    });
  }

  const normOp=s=>(s||"Unknown").trim().toLowerCase();
  if(opFilter) list=list.filter(v=>normOp(v.operator)===normOp(opFilter));

  if(superRegionFilter!=="ALL"){
    list=list.filter(v=>String(v.superRegion||"").trim()===superRegionFilter);
  }
  if(segmentFilter){
    list=list.filter(v=>String(v.segment||"").trim()===segmentFilter);
  }

  list=list.filter(matchesSearch);

   if(updFilter){
    const now=new Date();
    const todayStart=new Date(now);
    todayStart.setHours(0,0,0,0);

    const weekStart=new Date(now);
    weekStart.setHours(0,0,0,0);
    weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));

    list=list.filter(v=>{
      const ts=v.updatedAt||v.addedAt;
      if(!ts) return true; // keep vessels without timestamp
      const d=new Date(ts);
      if(isNaN(d)) return true;
      if(updFilter==="today") return d>=todayStart;
      if(updFilter==="week") return d>=weekStart;
      return true;
    });
  }

  if(sortK){
    list=[...list].sort((a,b)=>{
      if(sortK==="date"){
        const MON=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
        const toNum=s=>{
          if(!s) return 9999;
          const m=String(s).toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})/);
          if(!m) return 9999;
          return MON.indexOf(m[2])*100 + parseInt(m[1]);
        };
        return (toNum(a.date)-toNum(b.date))*sortD;
      }

      const av=String(a[sortK]||"").toLowerCase();
      const bv=String(b[sortK]||"").toLowerCase();
      return av<bv ? -sortD : av>bv ? sortD : 0;
    });
  }

  return list;
},[
  vessels,
  filters,
  search,
  sortK,
  sortD,
  opFilter,
  bucketFilters,
  updFilter,
  posFileDaysBack,
  superRegionFilter,
  segmentFilter
]);
  // Reset page when filters change
  useEffect(()=>{setPosPage(1);},[vessels,filters,search,sortK,opFilter,bucketFilters,updFilter,posFileDaysBack,superRegionFilter]);

  const stats={total:vessels.length,ppt:filtV.filter(v=>isOpenPPT(v.date)).length,subs:filtV.filter(v=>v.openPort==="EMPLOYED").length};
  const selV=sel?vessels.find(v=>v.vessel===sel):null;
  const selFixes=sel?cargoes.filter(c=>c.vessel&&c.vessel.toLowerCase()===sel.toLowerCase()):[];
  const cTokens=cSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtC=useMemo(()=>{
    const now=new Date();
    const startOfWeek=(d)=>{const r=new Date(d);r.setHours(0,0,0,0);r.setDate(r.getDate()-r.getDay()+1);return r;};
    const thisWeekStart=startOfWeek(now);
    const lastWeekStart=new Date(thisWeekStart);lastWeekStart.setDate(lastWeekStart.getDate()-7);
    const lastWeekEnd=new Date(thisWeekStart);
    const ytdStart=new Date(now.getFullYear(),0,1);
    let list=cargoes.filter(c=>{
      if(cTimeFilter){
        const d=new Date(c.updated||0);
        if(cTimeFilter==="tw"&&(d<thisWeekStart||d>now))return false;
        if(cTimeFilter==="lw"&&(d<lastWeekStart||d>=lastWeekEnd))return false;
        if(cTimeFilter==="ytd"&&d<ytdStart)return false;
      }
      if(cFilter==="FIXED"&&c.status!=="FIXED")return false;
      if(cFilter==="SUBS"&&c.status!=="SUBS")return false;
      if(cFilter==="FAILED"&&c.status!=="FAILED")return false;
      
      if(cDateFilter){const hay=(c.from||" ")+" "+(c.to||"");if(!hay.toLowerCase().includes(cDateFilter.toLowerCase()))return false;}
      if(!cTokens.length)return true;
      return cTokens.every(t=>JSON.stringify(c).toLowerCase().includes(t));
    });
    if(cSortK){
      list=[...list].sort((a,b)=>{
        const colToField={Status:"status",Vessel:"vessel",Charterer:"charterer",Cargo:"cargo",Qty:"qty",Load:"load",Disch:"disch",LaycanStart:"from",LaycanEnd:"to",Freight:"freight",Comment:"comment",Updated:"updated"};
        const fld=colToField[cSortK]||cSortK;
        let av=a[fld]||"",bv=b[fld]||"";
        if(fld==="updated"){av=av?new Date(av).getTime():0;bv=bv?new Date(bv).getTime():0;return(av-bv)*cSortD;}
        return String(av).toLowerCase()<String(bv).toLowerCase()?-cSortD:String(av).toLowerCase()>String(bv).toLowerCase()?cSortD:0;
      });
    }
    return list;
  },[cargoes,cFilter,cSearch,cDateFilter,cSortK,cSortD,cTimeFilter]);

  const FILTER_GROUPS=[
    {label:"Status",items:[["PPT","Open PPT"],["SUBS","On Subs"],["HIDE_EMP","Hide Employed"]]},
    {label:"Region",items:[["WCUK","WCUK"],["ECUK","ECUK"],["CANAL","Canal"],["BISCAY","Biscay"],["SKAW","Skaw"],["BALTIC","Baltic"],["MED","Med"]]},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.tx,fontFamily:"Inter,sans-serif"}}>
      {/* ── Delete confirmation ── */}
      {pendingDel&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:C.bg2,border:"1px solid "+C.red,borderRadius:8,padding:"12px 20px",
          zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",
          fontFamily:"sans-serif",fontSize:12,minWidth:300}}>
          <span style={{color:C.tx,flex:1}}>Delete <strong>{pendingDel.label}</strong>?</span>
          <button onClick={()=>{
            if(pendingDel.id==="__SELECTED__"){[...selVessels].forEach(v=>onDelV(v));setSelVessels(new Set());}
            else if(pendingDel.type==="vessel"||pendingDel.type==="all") onDelV(pendingDel.id);
            else if(pendingDel.type==="cargo") onDelC(pendingDel.id);
            else if(pendingDel.type==="allcargo"){
              if(pendingDel.id==="__SELCARGO__"){[...selCargoes].forEach(id=>onDelC(id));setSelCargoes(new Set());}
              else onDelC("__ALLCARGO__");
            }
            setPendingDel(null);
          }} style={{background:C.red,border:"none",borderRadius:5,color:"#fff",padding:"5px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>Delete</button>
          <button onClick={()=>setPendingDel(null)} style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,padding:"5px 14px",cursor:"pointer",fontSize:12}}>Cancel</button>
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 18px",background:C.bg2,borderBottom:"1px solid "+C.bd,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"sans-serif",fontWeight:800,fontSize:17}}>⚓ Tank<span style={{color:C.green}}>Pos</span></div>
        <div style={{display:"flex",gap:4,alignItems:"center",marginLeft:"auto",marginRight:12}}>
          {[70,80,90,100,110,120,130].map(z=>(
            <button key={z} onClick={()=>document.body.style.zoom=z+"%"}
              style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:3,border:"1px solid "+C.bd,background:C.bg3,color:C.faint,cursor:"pointer",fontFamily:"inherit"}}>
              {z}%
            </button>
          ))}
          <button
            onClick={onLoadVesselDB}
            disabled={vesselDBLoaded||vesselDBLoading}
            title={vesselDBLoaded?"Vessel DB loaded — specs auto-enriched on upload":vesselDBLoading?"Loading vessel DB…":"Click to load vessel spec DB (DWT, built, LOA etc.) — only needed when uploading positions"}
            style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,border:"1px solid "+(vesselDBLoaded?C.green:C.bd),background:vesselDBLoaded?"rgba(67,233,123,0.12)":C.bg3,color:vesselDBLoaded?C.green:vesselDBLoading?C.amber:C.faint,cursor:vesselDBLoaded||vesselDBLoading?"default":"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            {vesselDBLoaded?"✓ Ship DB":vesselDBLoading?"⟳ Loading…":"⚓ Load Ship DB"}
          </button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {tab==="pos"&&vessels.length>0&&(<button onClick={()=>setPendingDel({type:"all",id:"__ALL__",label:"ALL "+vessels.length+" vessels"})} style={{background:"none",border:"1px solid "+C.bd,borderRadius:4,padding:"2px 10px",color:C.dim,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✕ Clear Positions</button>)}
        </div>
      </div>
      <div style={{padding:"12px 16px",maxWidth:1900,margin:"0 auto"}}>
        <div style={{display:"flex",flexWrap:"wrap",borderBottom:"1px solid "+C.bd2,marginBottom:12,gap:mobile?"2px 0":0}}>
          {[["pos","⚓ Pos",vessels.length],["cargo","📦 Cargo",cargoTotal||cargoes.length],["fix","🎯 Fix",0],["projects","🧮 Projects",0],["matrix","🔗 Matrix",0],["tce","⚡ TCE",0],["dash","📊 Dash",0]].map(([id,label,cnt])=>(
            <button key={id} onClick={()=>{setTab(id);setBucketFilters(new Set());}} style={{fontFamily:"sans-serif",fontWeight:700,fontSize:mobile?11:12,padding:mobile?"6px 10px":"7px 16px",border:"none",background:"transparent",color:tab===id?C.blue:C.dim,borderBottom:"2px solid "+(tab===id?C.blue:"transparent"),cursor:"pointer",whiteSpace:"nowrap"}}>
              {label}{cnt>0?(<span style={{fontSize:11,marginLeft:3,background:C.bg3,padding:"1px 5px",borderRadius:8}}>{cnt}</span>):null}
            </button>
          ))}
        </div>

        {/* ── POSITIONS ── */}
        {tab==="pos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
          
            {/* ── Top row: Perfect grid ── */}
            <div style={{display:"flex",gap:10,flexDirection:mobile?"column":"row"}}>
              
              {/* LEFT: Parse + Fixing (32%) */}
              <div style={{width:mobile?"100%":"32%",display:"flex",flexDirection:"column",gap:10}}>
  <div><ParsePanel vessels={vessels} onAddVessels={onAddVessels} onAddCargoes={onAddCargoes} lockedMode="pos" vesselDB={{}}/></div>
  <div><FixingWindow vessels={filtV} opFilter={opFilter} onOpFilter={op=>setOpFilter(o=>o===op?null:op)} /></div>
</div>
 
              {/* CENTER: Rate Matrix (34%) */}
              {!mobile&&(
                <div style={{width:"34%",background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",alignSelf:"flex-start"}}>
                  <div style={{padding:"6px 12px",borderBottom:"1px solid "+C.bd2,background:C.bg,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.tx}}>📊 Rate Matrix</span>
                    <span style={{flex:1}}/>
                    <span style={{fontSize:11,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Bunker</span>
                    <RateMatrixBunkerInput/>
                    <span style={{fontSize:10,color:C.faint}}>$/mt</span>
                  </div>
                  <div style={{padding:"8px 10px",height:424,overflowY:"hidden"}}>
                    <RateMatrix/>
                  </div>
                </div>
              )}
 
              {/* RIGHT: Ask AI + AIS Map (34%) */}
              {!mobile&&(
                <div style={{width:"34%",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                    <div style={{padding:"6px 10px",borderBottom:"1px solid "+C.bd2,background:C.bg}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.tx}}>🤖 Ask AI</span>
                    </div>
                    <div style={{padding:"10px",height:200,overflowY:"auto"}}>
                      <RightPanel vessels={vessels} cargoes={cargoes}/>
                    </div>
                  </div>
                {/* AIS Map - fills remaining space */}
    <div style={{flex:1,minHeight:400}}>
      <AISMap selectedVessels={selectedAISVessels} vessels={vessels}/>
    </div>
  </div>
)}
</div>

            {vessels.length > 0 && (
              <>
                {/* Second row: PPT + Filters (grid aligned) */}
<div style={{display:"flex",gap:10,flexDirection:mobile?"column":"row",marginTop:-5}}>
                  
                  {/* LEFT: PPT Timeline (32%) */}
                  {!mobile&&(
                    <div style={{width:"32%",height:200}}>
                      <OpeningBreakdown
                        vessels={vessels}
                        filteredVessels={filtV}
                        bucketFilters={bucketFilters}
                        onBucketFilter={k=>setBucketFilters(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n;})}
                        fillHeight={false}
                      />
                    </div>
                  )}

                  {/* CENTER: File Date + Filters (34%) */}
                  <div style={{width:mobile?"100%":"34%",display:"flex",flexDirection:"column",gap:6}}>

                    {selVessels.size>0&&(
                      <button
                        onClick={()=>setPendingDel({type:"all",id:"__SELECTED__",label:selVessels.size+" vessel"+(selVessels.size!==1?"s":"")})}
                        style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:5,border:"1px solid "+C.red+"55",background:"rgba(255,107,107,.12)",color:C.red,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}
                      >
                        🗑 Delete ({selVessels.size})
                      </button>
                    )}

                    {opFilter&&(
                      <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:"rgba(79,195,247,0.08)",border:"1px solid rgba(79,195,247,0.25)",borderRadius:5}}>
                        <span style={{fontSize:12,color:C.blue,fontWeight:700}}>🔍 Filtered: {opFilter}</span>
                        <button onClick={()=>setOpFilter(null)} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:12,padding:"0 2px"}}>✕ Clear</button>
                      </div>
                    )}

                    {bucketFilters.size>0&&(
                      <div style={{fontSize:12,color:C.blue,cursor:"pointer"}} onClick={()=>setBucketFilters(new Set())}>
                        ✕ Clear segment filter ({[...bucketFilters].join(", ")})
                      </div>
                    )}

                    {/* FILE DATE WINDOW */}
                    <div style={{display:"flex",flexDirection:"column",gap:8,padding:"8px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>
                          File Date Window
                        </span>
                        <span style={{fontSize:12,color:C.tx,fontWeight:700}}>
                          {posFileDaysBack>=90
                            ? "Showing all positions"
                            : `${fmtShortDate(new Date(new Date().setDate(new Date().getDate()-posFileDaysBack)))} → ${fmtShortDate(new Date())}`}
                        </span>
                      </div>

                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:C.dim,width:70}}>From</span>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          step="1"
                          value={posFileDaysBack}
                          onChange={e=>{setPosFileDaysBack(Number(e.target.value));setPosPage(1);}}
                          style={{flex:1}}
                        />
                        <span style={{fontSize:11,color:C.dim,width:80,textAlign:"right"}}>
                          {posFileDaysBack===90?"All":posFileDaysBack===0?"Today only":posFileDaysBack+"d"}
                        </span>
                      </div>

                      <span style={{fontSize:11,color:C.faint}}>Right edge is always today</span>
                    </div>

                    {/* STATUS, REGION, UPDATED filters */}
                    <div style={{display:"flex",flexDirection:"column",gap:6,padding:"8px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6}}>
                      {FILTER_GROUPS.map(({label,items})=>(
                        <div key={label} style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:12,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:40}}>{label}</span>
                          {items.map(([f,l])=>(
                            <button key={f} onClick={()=>toggleFilter(f)} style={fb(filters.has(f))}>{l}</button>
                          ))}
                          {filters.size?(<button onClick={()=>setFilters(new Set())} style={{...fb(false),color:C.red,borderColor:C.red+"55",marginLeft:4}}>✕ Clear</button>):null}
                        </div>
                      ))}

                      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:40}}>Updated</span>
                        {[["","All"],["today","Today"],["week","This week"]].map(([v,l])=>(
                          <button key={v} onClick={()=>setUpdFilter(v)} style={fb(updFilter===v&&v!=="")}>{l}</button>
                        ))}
                      </div>

                      {/* SEGMENT and SUPER REGION */}
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Segment</span>
                        <select
                          value={segmentFilter}
                          onChange={e=>{setSegmentFilter(e.target.value);setPosPage(1);}}
                          style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"3px 8px",outline:"none"}}
                        >
                          <option value="">All</option>
                          {[...new Set(vessels.map(v=>v.segment).filter(Boolean))].sort().map(s=><option key={s} value={s}>{s}</option>)}
                        </select>

                        <span style={{fontSize:12,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",marginLeft:8}}>
                          Super Region
                        </span>
                        <select
                          value={superRegionFilter}
                          onChange={e=>setSuperRegionFilter(e.target.value)}
                          style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"3px 8px",outline:"none"}}
                        >
                          {superRegionOptions.map(r=>(
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>

                        {superRegionFilter!=="ALL" && (
                          <button
                            onClick={()=>setSuperRegionFilter("ALL")}
                            style={{background:"none",border:"1px solid "+C.bd,borderRadius:4,color:C.dim,fontSize:12,padding:"2px 6px",cursor:"pointer",fontFamily:"inherit"}}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Spacer to match first row layout (34%) */}
                  {!mobile&&(
                    <div style={{width:"34%"}}></div>
                  )}
                </div>

                {/* MOVED: Fleet count + Export + Search to same row */}
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,fontSize:12,flexWrap:"wrap"}}>
                  <ExportPanel vessels={filtV} cargoes={cargoes} mode="pos" selVessels={selVessels}/>
                  <span style={{color:C.faint}}>Total <span style={{color:C.tx,fontWeight:700}}>{vessels.length}</span></span>
                  <span style={{color:C.faint}}>Showing <span style={{color:C.blue,fontWeight:700}}>{filtV.length}</span></span>
                  <span style={{color:C.faint}}>Selected <span style={{color:"#4fc3f7",fontWeight:700}}>{selVessels.size}</span></span>
                  
                  {/* MOVED SEARCH FIELD HERE */}
                  <div style={{position:"relative",marginLeft:"auto",minWidth:300}}>
                    <input
                      value={search}
                      onChange={e=>setSearch(e.target.value)}
                      placeholder="🔍 Multi-search: e.g. belfast ulsd 1A"
                      style={{background:C.bg,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"5px 28px 5px 10px",outline:"none",width:"100%",boxSizing:"border-box"}}
                    />
                    {search&&(
                      <button onClick={()=>setSearch("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:C.bd,border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",color:C.faint,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Vessel Table */}
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"auto",flex:1,minWidth:0}}>
                    <table style={{width:mobile?"max-content":"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed",fontFamily:"sans-serif"}}>
                      <colgroup>
                        <col style={{width:28}}/>
                        <col style={{width:colWidthsV.Operator||130}}/>
                        <col style={{width:colWidthsV.Vessel||130}}/>
                        <col style={{width:colWidthsV.Built||50}}/>
                        <col style={{width:colWidthsV.DWT||58}}/>
                        <col style={{width:colWidthsV.LOA||50}}/>
                        <col style={{width:colWidthsV.Beam||50}}/>
                        <col style={{width:colWidthsV.CBM||58}}/>
                        <col style={{width:colWidthsV.Date||72}}/>
                        <col style={{width:colWidthsV.OpenPort||110}}/>
                        <col style={{width:colWidthsV.Comment||130}}/>
                        <col style={{width:colWidthsV.FileDate||60}}/>
                        <col style={{width:18}}/>
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={{...th,width:28,minWidth:28,padding:"4px 2px",cursor:"pointer",textAlign:"center"}} onClick={()=>{if(selVessels.size===filtV.length)setSelVessels(new Set());else setSelVessels(new Set(filtV.map(v=>v.vessel)));}} title={selVessels.size>0?"Deselect all":"Select all"}><span style={{color:selVessels.size>0?"#4fc3f7":C.faint,fontSize:12}}>{selVessels.size>0?"[✓]":"[ ]"}</span></th>
                          <th style={{...th,width:colWidthsV["Operator"]||120,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("operator")}><span style={{userSelect:"none",paddingRight:6}}>Operator{sortK==="operator"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Operator"]||120;const mv=m=>setColWidthsV(p=>({...p,"Operator":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["Vessel"]||120,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("vessel")}><span style={{userSelect:"none",paddingRight:6}}>Vessel{sortK==="vessel"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Vessel"]||120;const mv=m=>setColWidthsV(p=>({...p,"Vessel":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["Built"]||48,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("built")}><span style={{userSelect:"none",paddingRight:6}}>Built{sortK==="built"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Built"]||48;const mv=m=>setColWidthsV(p=>({...p,"Built":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["DWT"]||55,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("dwt")}><span style={{userSelect:"none",paddingRight:6}}>DWT{sortK==="dwt"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["DWT"]||55;const mv=m=>setColWidthsV(p=>({...p,"DWT":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["LOA"]||48,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("loa")}><span style={{userSelect:"none",paddingRight:6}}>LOA{sortK==="loa"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["LOA"]||48;const mv=m=>setColWidthsV(p=>({...p,"LOA":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["Beam"]||46,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("beam")}><span style={{userSelect:"none",paddingRight:6}}>Beam{sortK==="beam"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Beam"]||46;const mv=m=>setColWidthsV(p=>({...p,"Beam":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["CBM"]||55,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("cbm")}><span style={{userSelect:"none",paddingRight:6}}>CBM{sortK==="cbm"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["CBM"]||55;const mv=m=>setColWidthsV(p=>({...p,"CBM":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["Date"]||68,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("date")}><span style={{userSelect:"none",paddingRight:6}}>Date{sortK==="date"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Date"]||68;const mv=m=>setColWidthsV(p=>({...p,"Date":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["OpenPort"]||100,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("openPort")}><span style={{userSelect:"none",paddingRight:6}}>Open Port{sortK==="openPort"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["OpenPort"]||100;const mv=m=>setColWidthsV(p=>({...p,"OpenPort":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["Comment"]||120,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("comment")}><span style={{userSelect:"none",paddingRight:6}}>Comment{sortK==="comment"?(sortD>0?" ↑":" ↓"):""}</span><span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["Comment"]||120;const mv=m=>setColWidthsV(p=>({...p,"Comment":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                          <th style={{...th,width:colWidthsV["FileDate"]||90,minWidth:30,position:"relative",overflow:"hidden"}} onClick={()=>srt("fileDate")}>
                            <span style={{userSelect:"none",paddingRight:6}}>FILE DATE{sortK==="fileDate"?(sortD>0?" ↑":" ↓"):""}</span>
                            <span onMouseDown={e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX;const sw=colWidthsV["FileDate"]||90;const mv=m=>setColWidthsV(p=>({...p,"FileDate":Math.max(30,sw+(m.clientX-sx))}));const up=()=>{{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);}};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/>
                          </th>
                          <th style={{...th,width:18,minWidth:18,maxWidth:18,textAlign:"right",paddingRight:2}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtV.slice(0, posPage*POS_PAGE_SIZE).map((v,i)=>{
                          const isSel=sel===v.vessel;
                          const ppt=isOpenPPT(v.date);
                          const bg=isSel?"rgba(88,166,255,.07)":i%2===0?C.bg:C.bg2;
                          return(
                            <tr key={v.vessel} style={{background:bg,outline:isSel?"1px solid rgba(88,166,255,.2)":"1px solid transparent",cursor:"pointer"}} onClick={()=>{setSel(sel===v.vessel?null:v.vessel);setSelectedAISVessels([v.vessel]);}}>
                              <td style={{...td,width:28,padding:"0 2px",textAlign:"center",cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelVessels(p=>{const n=new Set(p);n.has(v.vessel)?n.delete(v.vessel):n.add(v.vessel);return n;})}}><span style={{fontSize:12,color:selVessels.has(v.vessel)?"#4fc3f7":C.faint}}>{selVessels.has(v.vessel)?"[✓]":"[ ]"}</span></td>
                              <EC value={v.operator} color={C.purple} placeholder="Operator" onSave={val=>onUpdateV(v.vessel,"operator",val)} data-vid={v.vessel+"-op"} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-vessel"]`)?.click()} onShiftTab={()=>{const prev=filtV[i-1];if(prev)document.querySelector(`[data-vid="${prev.vessel}-comment"]`)?.click();}} onEnter={()=>{const next=filtV[i+1];if(next)document.querySelector(`[data-vid="${next.vessel}-op"]`)?.click();}}/>
                              <EC value={toTCase(v.vessel)} color={C.blue} bold={true} placeholder="Vessel" onSave={val=>onRenameV&&onRenameV(v.vessel,val?.toUpperCase()||v.vessel)} data-vid={v.vessel+"-vessel"} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-date"]`)?.click()} onShiftTab={()=>document.querySelector(`[data-vid="${v.vessel}-op"]`)?.click()} onEnter={()=>{const next=filtV[i+1];if(next)document.querySelector(`[data-vid="${next.vessel}-vessel"]`)?.click();}}/>
                              <td style={{...td,color:C.dim,whiteSpace:"nowrap",cursor:"default",overflow:"hidden",maxWidth:0}} title={v.built||""}>{v.built||""}</td>
                              <td style={{...td,color:C.amber,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={fmtN(v.dwt)}>{fmtN(v.dwt)}</td>
                              <td style={{...td,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={v.loa||""}>{v.loa||""}</td>
                              <td style={{...td,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={v.beam||""}>{v.beam||""}</td>
                              <td style={{...td,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",maxWidth:0}} title={fmtN(v.cbm)}>{fmtN(v.cbm)}</td>
                              <EC value={v.date} color={ppt?C.green:"#58a6ff"} placeholder="Date" onSave={val=>{const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];let fmt=val.trim();const m1=fmt.match(/^(\d{1,2})[\/\-](\d{1,2})$/);if(m1){const mo=parseInt(m1[2])-1;if(mo>=0&&mo<12)fmt=parseInt(m1[1])+" "+MON[mo];}else{const m2=fmt.match(/^(\d{1,2})\s+([A-Za-z]{3})/i);if(m2){const mi=MON.findIndex(m=>m.toLowerCase()===m2[2].toLowerCase().slice(0,3));if(mi>=0)fmt=parseInt(m2[1])+" "+MON[mi];}}onUpdateV(v.vessel,"date",fmt);}} data-vid={v.vessel+"-date"} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-port"]`)?.click()} onShiftTab={()=>document.querySelector(`[data-vid="${v.vessel}-vessel"]`)?.click()} onEnter={()=>{const next=filtV[i+1];if(next)document.querySelector(`[data-vid="${next.vessel}-date"]`)?.click();}}/>
                              <EC value={v.openPort} color={v.openPort==="EMPLOYED"?C.purple:C.amber} placeholder="Port" onSave={val=>onUpdateV(v.vessel,"openPort",val)} data-vid={v.vessel+"-port"} onTab={()=>document.querySelector(`[data-vid="${v.vessel}-comment"]`)?.click()} onShiftTab={()=>document.querySelector(`[data-vid="${v.vessel}-date"]`)?.click()} onEnter={()=>{const next=filtV[i+1];if(next)document.querySelector(`[data-vid="${next.vessel}-port"]`)?.click();}}/>
                              <EC value={v.comment} color={C.dim} placeholder="Comment" onSave={val=>onUpdateV(v.vessel,"comment",val)} data-vid={v.vessel+"-comment"} onTab={()=>{const next=filtV[i+1];if(next)document.querySelector(`[data-vid="${next.vessel}-op"]`)?.click();}} onShiftTab={()=>document.querySelector(`[data-vid="${v.vessel}-port"]`)?.click()} onEnter={()=>{const next=filtV[i+1];if(next)document.querySelector(`[data-vid="${next.vessel}-comment"]`)?.click();}}/>
                              <td style={{...td,fontSize:12,color:C.faint,whiteSpace:"nowrap",overflow:"hidden",width:colWidthsV.FileDate||60,textAlign:"center"}}>{v.fileDate?new Date(v.fileDate).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>
                              <td style={{...td,width:18,minWidth:18,maxWidth:18,textAlign:"center",padding:0}} onClick={e=>e.stopPropagation()}>
                                <button onClick={(e)=>{e.stopPropagation();setPendingDel({type:"vessel",id:v.vessel,label:v.vessel});}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:10,padding:"0 2px",opacity:0.7}} title="Delete">✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Side panel */}
                  {selV&&(
                    <div style={{width:240,flexShrink:0,background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",position:"sticky",top:56,alignSelf:"flex-start",maxHeight:"calc(100vh - 70px)",display:"flex",flexDirection:"column"}}>
                      <div style={{padding:"8px 12px",background:C.bg,borderBottom:"1px solid "+C.bd2,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0}}>
                        <div>
                          <div style={{fontFamily:"sans-serif",fontWeight:800,fontSize:12,color:C.blue}}>{toTCase(selV.vessel)}</div>
                          <div style={{fontSize:12,color:C.purple}}>{selV.operator||""}</div>
                        </div>
                        <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:C.dim,fontSize:14,cursor:"pointer"}}>✕</button>
                      </div>

                      <div style={{padding:"8px 12px",overflowY:"auto",flex:1}}>
                        {[["Open Port","openPort",C.amber],["Date","date",C.blue],["Comment","comment",C.dim],["Operator","operator",C.purple],["Built","built",C.dim],["DWT","dwt",C.amber],["LOA","loa",C.dim],["Beam","beam",C.dim],["CBM","cbm",C.dim]].map(([l,f,col])=>(
                          <div key={f} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid "+C.bg,gap:4}}>
                            <span style={{fontSize:12,color:C.faint,minWidth:55,flexShrink:0}}>{l}</span>
                            <EC value={selV[f]} color={col} placeholder="—" onSave={v2=>onUpdateV(selV.vessel,f,v2)}/>
                          </div>
                        ))}

                        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2}}>Spec</div>
                        {[["Fuel","spec.fuel",C.purple],["Ice Class","spec.iceClass",C.blue],["Last Cargo","spec.lastCargo",C.dim]].map(([l,f,col])=>{
                          const val=f.startsWith("spec.")?(selV.spec||{})[f.split(".")[1]]:selV[f];
                          return(
                            <div key={f} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid "+C.bg,gap:4}}>
                              <span style={{fontSize:12,color:C.faint,minWidth:55,flexShrink:0}}>{l}</span>
                              <EC value={val} color={col} placeholder="—" onSave={v2=>onUpdateV(selV.vessel,f,v2)}/>
                            </div>
                          );
                        })}

                        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2,marginTop:4}}>Notes</div>
                        <EC value={selV.notes} color={C.dim} placeholder="Add vessel notes…" onSave={v2=>onUpdateV(selV.vessel,"notes",v2)}/>

                        {selFixes.length > 0 && (
                          <>
                            <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2}}>
                              Fixtures ({selFixes.length})
                            </div>
                            {selFixes.map((f) => {
                              const col =
                                f.status === "FIXED" ? C.green :
                                f.status === "SUBS" ? C.purple :
                                f.status === "FAILED" ? C.red : C.blue;

                              return (
                                <div
                                  key={f.id}
                                  style={{
                                    background:C.bg,
                                    border:"1px solid "+col+"33",
                                    borderRadius:4,
                                    padding:"5px 8px",
                                    marginBottom:4,
                                    marginTop:3
                                  }}
                                >
                                  <div style={{fontFamily:"sans-serif",fontWeight:700,fontSize:12,color:col}}>
                                    {f.status}{f.from ? ` · ${f.from}` : ""}{f.to ? ` - ${f.to}` : ""}
                                  </div>
                                  <div style={{fontSize:12,fontWeight:600}}>
                                    {f.load || "?"} → {f.disch || "?"}
                                  </div>
                                  {f.freight && <div style={{fontSize:12,color:C.purple}}>{f.freight}</div>}
                                </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {filtV.length > posPage * POS_PAGE_SIZE && (
                  <div style={{textAlign:"center",padding:"12px 0"}}>
                    <button
                      onClick={() => setPosPage(p => p + 1)}
                      style={{
                        background:"none",
                        border:"1px solid " + C.blue,
                        borderRadius:4,
                        padding:"5px 18px",
                        color:C.blue,
                        cursor:"pointer",
                        fontFamily:"inherit",
                        fontSize:12,
                        fontWeight:700
                      }}
                    >
                      Show more ({filtV.length - posPage * POS_PAGE_SIZE} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {/* ── CARGOES ── */}
        {tab==="cargo"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Top row: Parse 50% | Ask AI 25% | Intel Vault 25% — same height */}
            <div style={{display:"flex",gap:10,alignItems:"flex-start",flexDirection:mobile?"column":"row"}}>
              {/* Parse */}
              <div style={{flex:mobile?"1 1 auto":"0 0 50%",display:"flex",flexDirection:"column"}}>
                <ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels} onAddCargoes={onAddCargoes} lockedMode="cargo" vesselDB={{}}/>
              </div>
              {/* Ask AI */}
              <div style={{flex:mobile?"1 1 auto":"0 0 calc(25% - 7px)",background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",height:askAiExpanded?600:142,transition:"height 0.3s ease"}}>
                <div style={{padding:"6px 10px",borderBottom:"1px solid "+C.bd2,background:C.bg,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.tx}}>🤖 Ask AI</span>
                  <button onClick={()=>setAskAiExpanded(!askAiExpanded)} style={{background:"none",border:"1px solid "+C.bd,borderRadius:4,padding:"2px 8px",fontSize:11,color:C.blue,cursor:"pointer",fontFamily:"inherit"}} title={askAiExpanded?"Collapse":"Expand"}>
                    {askAiExpanded?"▲":"▼"}
                  </button>
                </div>
                <div style={{flex:1,padding:"10px",overflowY:"auto"}} className="custom-scrollbar">
                  <RightPanel vessels={vessels} cargoes={cargoes}/>
                </div>
              </div>
              {/* Intel Vault */}
              <div style={{flex:mobile?"1 1 auto":"0 0 calc(25% - 7px)",background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column",height:intelVaultExpanded?600:142,transition:"height 0.3s ease"}}>
                <div style={{padding:"6px 10px",borderBottom:"1px solid "+C.bd2,background:C.bg,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:700,color:C.tx}}>📡 Intel Vault</span>
                  <button onClick={()=>setIntelVaultExpanded(!intelVaultExpanded)} style={{background:"none",border:"1px solid "+C.bd,borderRadius:4,padding:"2px 8px",fontSize:11,color:C.blue,cursor:"pointer",fontFamily:"inherit"}} title={intelVaultExpanded?"Collapse":"Expand"}>
                    {intelVaultExpanded?"▲":"▼"}
                  </button>
                </div>
                <div style={{flex:1,padding:"10px",overflowY:"auto"}} className="custom-scrollbar">
                  <IntelVault onVaultUpdate={()=>{}}/>
                </div>
              </div>
            </div>
            <style>{`
              .custom-scrollbar::-webkit-scrollbar {
                width: 8px;
              }
              .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb {
                background: ${C.bd};
                border-radius: 4px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: ${C.dim};
              }
              .custom-scrollbar {
                scrollbar-width: thin;
                scrollbar-color: ${C.bd} transparent;
              }
            `}</style>
            {/* Search + Export + Filters — wrap on mobile */}
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1}}>
                <input value={cSearch} onChange={e=>{const v=e.target.value;setCSearch(v);clearTimeout(window._csTimer);window._csTimer=setTimeout(()=>onCargoSearch(v),350);}} placeholder="🔍 Search cargoes…"
                  style={{width:"100%",background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"5px 28px 5px 10px",outline:"none",boxSizing:"border-box"}}/>
                {cSearch&&<button onClick={()=>{setCSearch("");clearTimeout(window._csTimer);onCargoSearch("");}} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:C.bd,border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",color:C.faint,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>✕</button>}
              </div>
              <ExportPanel vessels={vessels} cargoes={filtC} mode="cargo" selCargoes={selCargoes}/>
              {selCargoes.size>0&&(
                <button onClick={()=>setPendingDel({type:"allcargo",id:"__SELCARGO__",label:selCargoes.size+" cargo"+(selCargoes.size!==1?"es":"")})}
                  style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:5,border:"1px solid "+C.red+"55",background:"rgba(255,107,107,.12)",color:C.red,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  🗑 Delete ({selCargoes.size})
                </button>
              )}
              {[["ALL","All"],["FIXED","Fixed"],["SUBS","On Subs"],["FAILED","Failed"]].map(([f,l])=>(
                <button key={f} onClick={()=>setCFilter(f)} style={fb(cFilter===f)}>{l}</button>
              ))}
              {[["","All time"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].map(([v,label])=>(
                <button key={v} onClick={()=>setCTimeFilter(v)} style={{...fb(cTimeFilter===v),whiteSpace:"nowrap"}}>{label}</button>
              ))}
              <input value={cDateFilter} onChange={e=>setCDateFilter(e.target.value)} placeholder="🔍 Filter…"
                style={{width:80,background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"3px 7px",outline:"none"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,fontSize:12}}>
              <span style={{color:C.faint}}>Total <span style={{color:C.tx,fontWeight:700}}>{cargoTotal||cargoes.length}</span></span>
              <span style={{color:C.faint}}>Showing <span style={{color:C.blue,fontWeight:700}}>{filtC.length}</span></span>
              <span style={{color:C.faint}}>Fixed <span style={{color:C.green,fontWeight:700}}>{cargoes.filter(c=>c.status==="FIXED").length}</span></span>
              <span style={{color:C.faint}}>Subs <span style={{color:C.purple,fontWeight:700}}>{cargoes.filter(c=>c.status==="SUBS").length}</span></span>
              <span style={{color:C.faint}}>Failed <span style={{color:C.red,fontWeight:700}}>{cargoes.filter(c=>c.status==="FAILED").length}</span></span>
              <span style={{flex:1}}/>
            </div>
            <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"hidden",overflowX:"auto"}}>
              {filtC.length===0
                ?<div style={{padding:"40px",textAlign:"center",color:C.faint}}><div style={{fontSize:28,marginBottom:8}}>📦</div>No fixtures yet</div>
                :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed",fontFamily:"sans-serif"}}>
                  <thead><tr>
                    <th style={{...th,width:28,minWidth:28,padding:"4px 2px",cursor:"pointer",textAlign:"center"}} onClick={()=>{if(selCargoes.size===filtC.length)setSelCargoes(new Set());else setSelCargoes(new Set(filtC.map(c=>c.id)));}} title={selCargoes.size>0?"Deselect all":"Select all"}><span style={{color:selCargoes.size>0?"#4fc3f7":C.faint,fontSize:12}}>{selCargoes.size>0?"[✓]":"[ ]"}</span></th>
                    <th style={{...th,width:colWidthsC["Status"]||60,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Status"){setCsortD(d=>d*-1);}else{setCsortK("Status");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Status{cSortK==="Status"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Status"]||60;const mv=m=>setColWidthsC(p=>({...p,"Status":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Vessel"]||130,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Vessel"){setCsortD(d=>d*-1);}else{setCsortK("Vessel");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Vessel{cSortK==="Vessel"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Vessel"]||130;const mv=m=>setColWidthsC(p=>({...p,"Vessel":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Charterer"]||110,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Charterer"){setCsortD(d=>d*-1);}else{setCsortK("Charterer");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Charterer{cSortK==="Charterer"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Charterer"]||110;const mv=m=>setColWidthsC(p=>({...p,"Charterer":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Qty"]||55,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Qty"){setCsortD(d=>d*-1);}else{setCsortK("Qty");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Qty{cSortK==="Qty"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Qty"]||55;const mv=m=>setColWidthsC(p=>({...p,"Qty":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Cargo"]||80,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Cargo"){setCsortD(d=>d*-1);}else{setCsortK("Cargo");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Cargo{cSortK==="Cargo"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Cargo"]||80;const mv=m=>setColWidthsC(p=>({...p,"Cargo":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Load"]||100,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Load"){setCsortD(d=>d*-1);}else{setCsortK("Load");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Load{cSortK==="Load"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Load"]||100;const mv=m=>setColWidthsC(p=>({...p,"Load":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Disch"]||100,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Disch"){setCsortD(d=>d*-1);}else{setCsortK("Disch");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Disch{cSortK==="Disch"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Disch"]||100;const mv=m=>setColWidthsC(p=>({...p,"Disch":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["LaycanStart"]||90,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="LaycanStart"){setCsortD(d=>d*-1);}else{setCsortK("LaycanStart");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>From{cSortK==="LaycanStart"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["LaycanStart"]||90;const mv=m=>setColWidthsC(p=>({...p,"LaycanStart":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["LaycanEnd"]||90,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="LaycanEnd"){setCsortD(d=>d*-1);}else{setCsortK("LaycanEnd");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>To{cSortK==="LaycanEnd"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["LaycanEnd"]||90;const mv=m=>setColWidthsC(p=>({...p,"LaycanEnd":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Freight"]||90,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Freight"){setCsortD(d=>d*-1);}else{setCsortK("Freight");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Freight{cSortK==="Freight"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Freight"]||90;const mv=m=>setColWidthsC(p=>({...p,"Freight":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Comment"]||130,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Comment"){setCsortD(d=>d*-1);}else{setCsortK("Comment");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Comment{cSortK==="Comment"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Comment"]||130;const mv=m=>setColWidthsC(p=>({...p,"Comment":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:colWidthsC["Updated"]||88,minWidth:40,position:"relative",overflow:"hidden"}}><span onClick={()=>{if(cSortK==="Updated"){setCsortD(d=>d*-1);}else{setCsortK("Updated");setCsortD(-1);}}} style={{cursor:"pointer",userSelect:"none",paddingRight:8}}>Updated{cSortK==="Updated"?(cSortD===1?" ▲":" ▼"):""}</span><span onMouseDown={e=>{e.preventDefault();const sx=e.clientX;const sw=colWidthsC["Updated"]||88;const mv=m=>setColWidthsC(p=>({...p,"Updated":Math.max(40,sw+(m.clientX-sx))}));const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);}} style={{position:"absolute",right:0,top:"15%",bottom:"15%",width:3,cursor:"col-resize",zIndex:1,background:"rgba(100,150,200,0.4)",borderRadius:2}}/></th>
                    <th style={{...th,width:26,minWidth:26,padding:"4px 2px"}}></th>
                  </tr></thead>
                  <tbody>{filtC.map((f,ri)=>{
                    const sc=f.status==="FIXED"?C.green:f.status==="SUBS"?C.purple:f.status==="FAILED"?C.red:C.faint;
                    const fmtLC=s=>{
                      if(!s)return"";
                      // Strip year first
                      let v=s.replace(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}\b/gi,(m,d,mo)=>d+" "+mo);
                      // Compact: "04 Apr - 05 Apr" -> "04-05 Apr", "04 Apr - 05 May" stays as "04 Apr - 05 May"
                      v=v.replace(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*-\s*(\d{1,2})\s+\2/gi,(m,d1,mo,d2)=>d1+"-"+d2+" "+mo);
                      return v;
                    };
                    return <tr key={f.id} style={{background:ri%2===0?C.bg:C.bg2}}>
                      <td style={{...td,width:28,padding:"0 2px",textAlign:"center",cursor:"pointer"}} onClick={e=>{e.stopPropagation();setSelCargoes(p=>{const n=new Set(p);n.has(f.id)?n.delete(f.id):n.add(f.id);return n;})}}><span style={{fontSize:12,color:selCargoes.has(f.id)?"#4fc3f7":C.faint}}>{selCargoes.has(f.id)?"[✓]":"[ ]"}</span></td>
                      <td style={{...td,width:colWidthsC.Status||60,cursor:"pointer",overflow:"hidden"}} onClick={e=>{e.stopPropagation();const opts=["SUBS","FIXED","FAILED",""];const cur=opts.indexOf(f.status||"");onUpdateC(f.id,"status",opts[(cur+1)%opts.length]);}} title="Click to cycle status">
                        <span style={{color:sc,fontWeight:700}}>{f.status||""}</span>
                      </td>
                      <EC value={f.vessel} color={C.blue} bold placeholder="TBN" onSave={v2=>onUpdateC(f.id,"vessel",v2)} width={colWidthsC.Vessel||130} data-cid={f.id+"-vessel"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-chtr"]`)?.click()}
                        onShiftTab={()=>{const prev=filtC[ri-1];if(prev)document.querySelector(`[data-cid="${prev.id}-cmnt"]`)?.click();else document.querySelector(`[data-cid="${f.id}-vessel"]`)?.blur();}}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-vessel"]`)?.click();}}/>
                      <EC value={toTCase(f.charterer)} color={"#79c0ff"} placeholder="" onSave={v2=>onUpdateC(f.id,"charterer",toTCase(v2))} width={colWidthsC.Charterer||110} data-cid={f.id+"-chtr"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-qty"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-vessel"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-chtr"]`)?.click();}}/>
                      <EC value={normaliseQty(f.qty)} color={C.amber} placeholder="" onSave={v2=>onUpdateC(f.id,"qty",normaliseQty(v2))} width={colWidthsC.Qty||55} data-cid={f.id+"-qty"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-cargo"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-chtr"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-qty"]`)?.click();}}/>
                      <EC value={f.cargo||""} placeholder="" onSave={v2=>onUpdateC(f.id,"cargo",v2)} width={colWidthsC.Cargo||80} data-cid={f.id+"-cargo"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-load"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-qty"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-cargo"]`)?.click();}}/>
                      <EC value={toTCase(f.load||"")} placeholder="" onSave={v2=>onUpdateC(f.id,"load",v2)} width={colWidthsC.Load||100} data-cid={f.id+"-load"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-disch"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-cargo"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-load"]`)?.click();}}/>
                      <EC value={toTCase(f.disch||"")} placeholder="" onSave={v2=>onUpdateC(f.id,"disch",v2)} width={colWidthsC.Disch||100} data-cid={f.id+"-disch"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-lcstart"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-load"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-disch"]`)?.click();}}/>
                      <EC value={fmtDateShort(f.from)} placeholder="" onSave={v2=>onUpdateC(f.id,"from",v2)} width={colWidthsC.LaycanStart||90} data-cid={f.id+"-lcstart"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-lcend"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-disch"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-lcstart"]`)?.click();}}/>
                      <EC value={fmtDateShort(f.to)} placeholder="" onSave={v2=>onUpdateC(f.id,"to",v2)} width={colWidthsC.LaycanEnd||90} data-cid={f.id+"-lcend"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-fr"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-lcstart"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-lcend"]`)?.click();}}/>
                      <EC value={fmtFreight(f.freight)||f.freight} color={"#a8e6a3"} placeholder="" onSave={v2=>onUpdateC(f.id,"freight",fmtFreight(v2)||v2)} width={colWidthsC.Freight||90} data-cid={f.id+"-fr"}
                        onTab={()=>document.querySelector(`[data-cid="${f.id}-cmnt"]`)?.click()}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-lcend"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-fr"]`)?.click();}}/>
                      <EC value={f.comment||""} color={C.dim} placeholder="" onSave={v2=>onUpdateC(f.id,"comment",v2)} width={colWidthsC.Comment||130} data-cid={f.id+"-cmnt"}
                        onTab={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-vessel"]`)?.click();}}
                        onShiftTab={()=>document.querySelector(`[data-cid="${f.id}-fr"]`)?.click()}
                        onEnter={()=>{const next=filtC[ri+1];if(next)document.querySelector(`[data-cid="${next.id}-vessel"]`)?.click();}}/>
                      <td style={{...td,width:colWidthsC.Updated||88,fontSize:12,color:C.faint,whiteSpace:"nowrap",overflow:"hidden"}}>{f.updated?new Date(f.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):""}</td>
                      <td style={{...td,width:26,padding:"0 2px"}}><button onClick={(e)=>{e.stopPropagation();setPendingDel({type:"cargo",id:f.id,label:f.vessel||"cargo"});}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.7}} title="Delete">✕</button></td>
                    </tr>
                  })}</tbody>
                </table>}
              {hasMore&&
              <div style={{textAlign:"center",padding:"12px"}}>
                <button onClick={onLoadMore} style={{background:"none",border:"1px solid "+C.blue,borderRadius:4,padding:"4px 16px",color:C.blue,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Load more</button>
              </div>}
            </div>
          </div>
        )}

        {/* ── FIXING ── */}
        {tab==="fix"&&(
          <div style={{overflowX:mobile?"hidden":"visible"}}>
            <FixingTab vessels={vessels}/>
          </div>
        )}

        {/* ── PROJECTS ── */}
        {tab==="projects"&&(
          <div style={{overflowX:mobile?"hidden":"visible"}}>
            <ProjectsTab/>
          </div>
        )}

        {/* ── MATRIX ── */}
        {tab==="matrix"&&(
          <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"hidden"}}>
            <div style={{background:C.bg2,padding:"6px 14px",borderBottom:"1px solid "+C.bd2,display:"flex",gap:16,fontSize:12,color:C.dim,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontWeight:700,color:C.tx}}>🔗 Voyage Matrix</span>
              <span>12.5 kts · 1d load · 18h disch</span>
              <input value={mxSearch||""} onChange={e=>setMxSearch(e.target.value)} placeholder="🔍 Search vessel…"
                style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"2px 8px",outline:"none",width:160,marginLeft:"auto"}}/>
            </div>
            {vessels.length===0
              ?<div style={{padding:"40px",textAlign:"center",color:C.faint}}><div style={{fontSize:28,marginBottom:8}}>🔗</div>Add vessels and cargoes</div>
              :vessels.filter(v=>!mxSearch||v.vessel?.toLowerCase().includes(mxSearch.toLowerCase())||v.operator?.toLowerCase().includes(mxSearch.toLowerCase())).map((v,i)=>{
                const fixes=cargoes.filter(c=>c.vessel&&c.vessel.toLowerCase()===v.vessel.toLowerCase()).sort((a,b)=>(b.updated||"").localeCompare(a.updated||""));
                const cargo=fixes[0];const calc=cargo?calcVoyage(v,cargo):null;
                const bg=i%2===0?C.bg:C.bg2;
                const sc=cargo?(cargo.status==="FIXED"?C.green:cargo.status==="SUBS"?C.purple:cargo.status==="FAILED"?C.red:C.amber):C.faint;
                return(
                  <div key={v.vessel} style={{background:bg,borderBottom:"1px solid "+C.bd2,padding:"9px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <div style={{minWidth:150,marginRight:4}}>
                        <div style={{fontWeight:700,fontSize:12,color:C.blue}}>{toTCase(v.vessel)}</div>
                        <div style={{fontSize:12,color:C.dim}}>{v.operator||""}</div>
                      </div>
                      <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                        <div style={{fontSize:12,color:C.faint,textTransform:"uppercase"}}>Now open</div>
                        <div style={{fontSize:12,fontWeight:700,color:v.openPort==="EMPLOYED"?C.purple:C.amber}}>{v.openPort||"?"}</div>
                        {v.date&&<div style={{fontSize:12,color:C.blue}}>{v.date}</div>}
                      </div>
                      {cargo&&<>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ballastNm&&<div style={{fontSize:12,color:C.faint}}>{calc.ballastNm}nm</div>}
                          <div style={{fontSize:14,color:C.faint}}>──▶</div>
                          {calc?.ballastDays&&<div style={{fontSize:12,color:C.faint}}>{calc.ballastDays}d</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+sc+"55",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:12,color:C.faint,textTransform:"uppercase"}}>Load</div>
                          <div style={{fontSize:12,fontWeight:700}}>{cargo.load||"?"}</div>
                          <div style={{fontSize:12,color:C.blue}}>{calc?.loadDate||cargo.from||"—"}</div>
                        </div>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ladenNm&&<div style={{fontSize:12,color:C.faint}}>{calc.ladenNm}nm</div>}
                          <div style={{fontSize:14,color:sc}}>──▶</div>
                          {cargo.cargo&&<div style={{fontSize:12,color:C.purple}}>{cargo.cargo}</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+(calc?.openDate?C.green:C.bd)+"88",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:12,color:C.faint,textTransform:"uppercase"}}>Next open</div>
                          <div style={{fontSize:12,fontWeight:700,color:calc?.openDate?C.green:C.dim}}>{cargo.disch||"?"}</div>
                          {calc?.openDate?(<div style={{fontSize:12,color:C.green}}>~{calc.openDate}</div>):(<div style={{fontSize:12,color:C.faint}}>—</div>)}
                        </div>
                        <div style={{marginLeft:6,display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{fontSize:12,fontWeight:700,color:sc,background:sc+"18",border:"1px solid "+sc+"44",borderRadius:3,padding:"1px 7px"}}>{cargo.status}</span>
                          {cargo.freight&&<span style={{fontSize:12,color:C.purple,fontWeight:700}}>{cargo.freight}</span>}
                          {(()=>{
                            const b=calc?.ballastNm||0;const l=calc?.ladenNm||0;
                            if(!l)return null;
                            const ets=calcEuEts(b,l,13,15,3,8,2,1,0.25,1,0.25,0,12.5,false);
                            return ets>0?<span style={{fontSize:11,color:"#fd79a8",fontWeight:600,background:"rgba(253,121,168,0.08)",border:"1px solid rgba(253,121,168,0.25)",borderRadius:3,padding:"1px 5px",whiteSpace:"nowrap"}} title="Indicative EU ETS cost (50% scope, deep-sea)">ETS ~${ets.toLocaleString()}</span>:null;
                          })()}
                        </div>
                      </>}
                      {!cargo&&<div style={{marginLeft:8,fontSize:12,color:C.faint,fontStyle:"italic"}}>No fixture - vessel open</div>}
                    </div>
                    {v.spec?.fuel||v.spec?.iceClass?(<div style={{display:"flex",gap:3,marginTop:4}}>{v.spec?.fuel&&<Tag col={v.spec.fuel==="LNG"?C.green:C.purple}>{v.spec.fuel}</Tag>}{v.spec?.iceClass&&<Tag col={C.blue}>{v.spec.iceClass}</Tag>}</div>):null}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab==="tce"&&(
          <div style={{padding:"14px 0"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
              ⚡ TCE Calculator — enter voyage variables to compute TCE or required freight
            </div>
            <TCECalculator/>
          </div>
        )}
        {tab==="dash"&&(
          <Dashboard vessels={vessels} cargoes={cargoes} history={history||[]}/>
        )}
      </div>
    </div>
  );
}

export default DesktopApp;
