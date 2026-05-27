import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { C, OP_COLORS, isMobile } from "./constants";
import { toTCase, fmtN, isOpenPPT, classifyRegion, daysBetween, normaliseQty, fmtDateShort, fmtFreight, calcVoyage, calcEuEts } from "./utils";
import EC from "./EC";
import ParsePanel from "./ParsePanel";
import { AskAIStrip } from "./AIAsk";
import { RateMatrix, RateMatrixBunkerInput } from "./RateMatrix";
import FixingTab from "./FixingTab";
import ProjectsTab from "./ProjectsTab";
import { TCECalculator } from "./TCECalculator";
import Dashboard from "./Dashboard";
import { loadHistory } from "./supabaseHelpers";
import { OpeningBreakdown, FixingWindow, ExportPanel } from "./PositionsHelpers";
import IntelVault, { IntelVaultStrip } from "./IntelVault";
import AISMap from "./AISMap";
import MatrixTable from "./components/ui/MatrixTable";
import NotesTab from "./NotesTab";
import CalendarTab from "./CalendarTab";
import SettingsTab from "./SettingsTab";
import ReportsTab from "./ReportsTab";
import FreightMapTab from "./FreightMapTab";
import VesselPopout from "./VesselPopout";



// TagCell helpers
const PRESET_TAGS=["AG","CPP","DPP","ex Asia","Med","Parcel","TA","UKC","WAF"];
function getTagList(){try{const c=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");return[...new Set([...PRESET_TAGS,...c])].sort();}catch{return PRESET_TAGS.slice();}}
function addCustomTag(t){try{const c=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");if(!c.includes(t))localStorage.setItem("signal_custom_tags",JSON.stringify([...c,t]));}catch{}}
function removeCustomTag(t){try{const c=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");localStorage.setItem("signal_custom_tags",JSON.stringify(c.filter(x=>x!==t)));}catch{}}

// TagCell — proper component so useState works in renderRow
function TagCell({cargoId,tag,onUpdateC}){
  const [open,setOpen]=useState(false);
  const [editMode,setEditMode]=useState(null);
  const btnRef=React.useRef(null);
  const [pos,setPos]=useState({top:0,left:0});
  const [tagList,setTagList]=useState(getTagList);

  function openPick(e){
    e.stopPropagation();
    setTagList(getTagList());
    if(btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      const top=window.innerHeight-r.bottom>200?r.bottom+2:r.top-224;
      const popW=150;
      // Clamp left so popup stays inside viewport, prefer left-aligned to button
      const left=Math.max(4,Math.min(r.left,window.innerWidth-popW-4));
      setPos({top,left});
    }
    setOpen(v=>!v);
    setEditMode(null);
  }
  function pick(t){onUpdateC(cargoId,"tag",t);setOpen(false);}
  function addNew(val){const t=val.trim();if(!t)return;addCustomTag(t);onUpdateC(cargoId,"tag",t);setOpen(false);}
  function delTag(t,e){e.stopPropagation();removeCustomTag(t);setTagList(getTagList());if(tag===t)onUpdateC(cargoId,"tag","");}
  function renameTag(old,nw){if(!nw.trim()||nw===old)return;removeCustomTag(old);addCustomTag(nw.trim());setTagList(getTagList());if(tag===old)onUpdateC(cargoId,"tag",nw.trim());setEditMode(null);}
  const cur=tag||"";
  return(
    <td style={{padding:"2px 4px",verticalAlign:"middle",borderBottom:"1px solid rgba(255,255,255,0.035)"}} onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} onClick={openPick}
        style={{background:cur?"rgba(88,166,255,0.15)":"transparent",border:"1px solid "+(cur?"rgba(88,166,255,0.4)":"rgba(88,166,255,0.12)"),borderRadius:3,color:cur?"#79c0ff":"rgba(120,160,220,0.25)",fontSize:10,fontWeight:cur?700:400,padding:"1px 5px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",maxWidth:76,overflow:"hidden",textOverflow:"ellipsis"}}>
        {cur||"＋"}
      </button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setOpen(false)}/>
          <div style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:6,padding:"6px",boxShadow:"0 8px 28px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",gap:2,minWidth:140}}>
            {cur&&<button onClick={()=>{onUpdateC(cargoId,"tag","");setOpen(false);}} style={{fontSize:10,padding:"2px 6px",borderRadius:3,border:"1px solid rgba(255,107,107,0.3)",background:"transparent",color:"rgba(255,107,107,0.6)",cursor:"pointer",fontFamily:"inherit",textAlign:"left",marginBottom:2}}>✕ clear tag</button>}
            {tagList.map(t=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:2}}>
                {editMode===t?(
                  <input autoFocus defaultValue={t}
                    onBlur={e=>renameTag(t,e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")renameTag(t,e.target.value);if(e.key==="Escape")setEditMode(null);}}
                    style={{flex:1,fontSize:10,padding:"2px 5px",borderRadius:3,border:"1px solid rgba(88,166,255,0.4)",background:"rgba(8,16,32,0.9)",color:"#cde",fontFamily:"inherit",outline:"none"}}/>
                ):(
                  <button onClick={()=>pick(t)}
                    style={{flex:1,fontSize:10,padding:"2px 6px",borderRadius:3,border:"1px solid "+(cur===t?"rgba(88,166,255,0.5)":"rgba(88,166,255,0.10)"),background:cur===t?"rgba(88,166,255,0.2)":"transparent",color:cur===t?"#79c0ff":"rgba(160,200,255,0.65)",cursor:"pointer",fontFamily:"inherit",textAlign:"left",fontWeight:cur===t?700:400}}>
                    {t}
                  </button>
                )}
                {!PRESET_TAGS.includes(t)&&editMode!==t&&(
                  <>
                    <button onClick={e=>{e.stopPropagation();setEditMode(t);}} style={{background:"none",border:"none",color:"rgba(120,160,220,0.3)",fontSize:9,cursor:"pointer",padding:"0 2px",lineHeight:1}} title="Rename">✎</button>
                    <button onClick={e=>delTag(t,e)} style={{background:"none",border:"none",color:"rgba(255,107,107,0.35)",fontSize:9,cursor:"pointer",padding:"0 2px",lineHeight:1}} title="Delete">✕</button>
                  </>
                )}
              </div>
            ))}
            <input placeholder="New tag + Enter"
              onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addNew(e.target.value);e.target.value="";}if(e.key==="Escape")setOpen(false);}}
              style={{fontSize:10,padding:"3px 5px",borderRadius:3,border:"1px solid rgba(88,166,255,0.2)",background:"rgba(8,16,32,0.9)",color:"#cde",fontFamily:"inherit",outline:"none",marginTop:4}}/>
          </div>
        </>
      )}
    </td>
  );
}

// BunkerHeader — bunker input + refresh button for MGO ARA price
function BunkerHeader(){
  const [fetching,setFetching]=useState(false);
  const [lastPrice,setLastPrice]=useState(null);
  const [fetchErr,setFetchErr]=useState(null);

  async function fetchMGO(){
    setFetching(true); setFetchErr(null);
    try{
      // Try Bunker Index via rss2json
      const res=await fetch("https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.bunkerindex.com%2Frss%2Fprices.php");
      const json=await res.json();
      if(json?.items?.length){
        // Look for ARA MGO or VLSFO price in title
        for(const item of json.items){
          const t=(item.title||"").toLowerCase();
          if(t.includes("ams")||t.includes("ara")||t.includes("rotterdam")){
            // Extract number from title like "Rotterdam MGO: 1235"
            const nums=(item.title||"").match(/\d{3,4}/g);
            if(nums){
              const price=parseInt(nums[nums.length-1]);
              if(price>400&&price<3000){
                setLastPrice(price);
                if(window._bunkerState){
                  window._bunkerState.val=price;
                  window._bunkerState.listeners.forEach(cb=>cb(price));
                }
                setFetching(false);
                return;
              }
            }
          }
        }
        // Try any item with a 4-digit number between 400-3000
        for(const item of json.items){
          const nums=(item.title||"").match(/\d{3,4}/g);
          if(nums){
            const price=parseInt(nums[0]);
            if(price>400&&price<3000){
              setLastPrice(price);
              if(window._bunkerState){
                window._bunkerState.val=price;
                window._bunkerState.listeners.forEach(cb=>cb(price));
              }
              setFetching(false);
              return;
            }
          }
        }
      }
      setFetchErr("No price found in feed");
    }catch(e){setFetchErr(e.message?.slice(0,40)||"Error");}
    setFetching(false);
  }

  return(
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <span style={{fontSize:10,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Bunker</span>
      <RateMatrixBunkerInput/>
      <span style={{fontSize:10,color:"rgba(120,160,220,0.4)"}}>$/mt</span>
      <button onClick={fetchMGO} disabled={fetching} title="Fetch latest MGO ARA price"
        style={{fontSize:10,padding:"1px 6px",borderRadius:3,border:"1px solid rgba(88,166,255,0.25)",background:"rgba(88,166,255,0.08)",color:fetching?"rgba(120,160,220,0.4)":"rgba(88,166,255,0.7)",cursor:fetching?"default":"pointer",fontFamily:"inherit",flexShrink:0}}>
        {fetching?"⟳…":"⟳ MGO"}
      </button>
      {lastPrice&&<span style={{fontSize:10,color:"#43e97b",fontWeight:600}}>{lastPrice}</span>}
      {fetchErr&&<span style={{fontSize:9,color:"rgba(255,107,107,0.6)"}} title={fetchErr}>⚠</span>}
    </div>
  );
}

function DesktopApp({vessels,cargoes,cargoTotal,onUpdateV,onRenameV,onUpdateC,onAddVessels,onAddCargoes,onAddV,onAddC,onDelV,onDelC,hasMore,onLoadMore,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB}){
  // ── PIN config ───────────────────────────────────────────────────────────
  const MASTER_PIN = "4524"; // ← your PIN → full access
  const GUEST_PIN  = "0250"; // ← colleague's PIN → positions + cargoes only
  const GUEST_TABS = ["pos","cargo"];

  const [unlocked, setUnlocked] = React.useState(false); // always ask on load
  const [pinInput, setPinInput] = React.useState("");
  const [pinError, setPinError] = React.useState(false);
  const [guestMode, setGuestMode] = React.useState(false);

  // No sessionStorage — PIN required on every load/refresh/new tab

  function submitPin(p){
    if(p===MASTER_PIN){
      setGuestMode(false);
      setUnlocked(true);
      setPinInput("");
    } else if(p===GUEST_PIN){
      setGuestMode(true);
      setUnlocked(true);
      setPinInput("");
    } else {
      setPinError(true);
      setPinInput("");
      setTimeout(()=>setPinError(false),1200);
    }
  }

  React.useEffect(()=>{
    if(unlocked) return;
    function onKey(e){
      if(e.key>="0"&&e.key<="9"){
        setPinInput(p=>{
          const next=p+e.key;
          if(next.length===4) setTimeout(()=>submitPin(next),0);
          return next.length<=4?next:p;
        });
      } else if(e.key==="Backspace"){
        setPinInput(p=>p.slice(0,-1));
      }
    }
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[unlocked]);
  // ────────────────────────────────────────────────────────────────────────
  const [tab,setTab]=useState(()=>guestMode?"pos":"pos");
  const [search,setSearch]=useState("");
  const [filters,setFilters]=useState(new Set());
  const [sortK,setSortK]=useState("fileDate");
  const [sortD,setSortD]=useState(-1);
  const [sel,setSel]=useState(null);
  const [showVesselPopout,setShowVesselPopout]=useState(false);
  const [popoutVessel,setPopoutVessel]=useState(null);
  const [contextMenu,setContextMenu]=useState(null);
  const [opFilter,setOpFilter]=useState(null);
  const [updFilter,setUpdFilter]=useState(""); // "" | "today" | "week"
  const [bucketFilters,setBucketFilters]=useState(new Set()); // set of active bucket keys
 const [posFileDaysBack,setPosFileDaysBack]=useState(90);
const [posPage,setPosPage]=useState(1);
const POS_PAGE_SIZE=100;
const [superRegionFilter,setSuperRegionFilter]=useState(new Set());
const [segmentFilter,setSegmentFilter]=useState(new Set());
const [dwtFilter,setDwtFilter]=useState("");   // "" | "<10" | "10-15" | "15-20" | "20-30" | "30-40" | ">40"
const [builtFilter,setBuiltFilter]=useState(""); // "" | "<2005" | "2005-2010" | "2010-2015" | "2015-2020" | ">2020"
  const [cSearch,setCSearch]=useState("");const [cFilter,setCFilter]=useState("ALL");const [cDateFilter,setCDateFilter]=useState("");
  const [cTimeFilter,setCTimeFilter]=useState("");
  const [cGradeFilter,setCGradeFilter]=useState("");
  const [cLaycanMonthFilter,setCLaycanMonthFilter]=useState("");
  const [cLaycanYearFilter,setCLaycanYearFilter]=useState("");
  const [cTagFilter,setCTagFilter]=useState("");
  const [pendingParseTag,setPendingParseTag]=useState("");
  const [customParseTag,setCustomParseTag]=useState("");

  function getWeekBounds(offset=0){
    const now=new Date();now.setHours(0,0,0,0);
    const dow=(now.getDay()+6)%7;
    const mon=new Date(now);mon.setDate(now.getDate()-dow+offset*7);
    const sun=new Date(mon);sun.setDate(mon.getDate()+6);
    return[mon,sun];
  }
  const [thisWeekMon,thisWeekSun]=getWeekBounds(0);
  const [lastWeekMon,lastWeekSun]=getWeekBounds(-1);
  function inRange(dateStr,from,to){if(!dateStr)return false;const d=new Date(dateStr);d.setHours(0,0,0,0);return d>=from&&d<=to;}
  const [mxSearch,setMxSearch]=useState("");
  const [cSortK,setCsortK]=useState("updated");
  const [selCargoes,setSelCargoes]=useState(()=>new Set());const [cSortD,setCsortD]=useState(-1);
  const [selVessels,setSelVessels]=useState(()=>new Set());
  const [history,setHistory]=useState([]);
  useEffect(()=>{loadHistory().then(setHistory);},[vessels]);
  const [intelItems,setIntelItems]=useState([]);
  const [pendingDel,setPendingDel]=useState(null);
  const [restoreMsg,setRestoreMsg]=useState("");
  const restoreRef=useRef(null); // {type:'vessel'|'cargo'|'all', id, label}
  const [colWidthsV,setColWidthsV]=useState({
  Operator:190,
  Vessel:155,
  Built:60,
  DWT:72,
  Coating:78,
  LOA:62,
  Beam:56,
  CBM:78,
  Date:74,
  OpenPort:150,
  Comment:220,
  FileDate:96,
  Spec:72
});
  const [colWidthsC,setColWidthsC]=useState({
  Status:68,
  Vessel:150,
  Charterer:150,
  Cargo:95,
  Qty:68,
  Load:120,
  Disch:120,
  LaycanStart:82,
  LaycanEnd:82,
  Freight:96,
  Comment:180,
  Updated:96
});
  const [askAiExpanded,setAskAiExpanded]=useState(false);
  const [intelVaultExpanded,setIntelVaultExpanded]=useState(false);
  const [selectedAISVessels,setSelectedAISVessels]=useState([]);

  const mobile=isMobile();
  
  // Dashboard / bunker-matrix theme styles
  const th2={
  padding:"7px 10px",
  color:"rgba(120,160,220,0.55)",
  fontWeight:700,
  fontSize:11,
  textTransform:"uppercase",
  letterSpacing:"0.08em",
  textAlign:"left",
  background:C.bg4,
  borderBottom:"1px solid rgba(58,130,246,0.14)",
  whiteSpace:"nowrap",
  verticalAlign:"middle"
};
  const td2={
  padding:"6px 10px",
  color:"#d9e8ff",
  fontWeight:500,
  fontSize:12,
  borderBottom:"1px solid rgba(255,255,255,0.035)",
  verticalAlign:"middle",
  whiteSpace:"nowrap",
  overflow:"hidden",
  textOverflow:"ellipsis"
};
  const tdNum = {...td2, textAlign:"right", fontVariantNumeric:"tabular-nums", textTransform:"uppercase"};
const tdCtr = {...td2, textAlign:"center", fontVariantNumeric:"tabular-nums", textTransform:"uppercase"};
const tdTxt = {...td2, textAlign:"left", textTransform:"uppercase"};
  const tableWrap={
    border:"1px solid "+C.bd,
    borderRadius:8,
    overflow:"auto",
    flex:1,
    minWidth:0,
    background:C.bg2,
    boxShadow:"inset 0 1px 0 rgba(88,166,255,0.06)"
  };
  const tableStyle={width:mobile?"max-content":"100%",borderCollapse:"separate",borderSpacing:0,fontSize:12,tableLayout:"fixed",fontFamily:"sans-serif"};
  const rowBg=i=>i%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)";
  const posColumns = [
  { 
    key: "select", 
    label: (
      <div 
        onClick={() => {
          if (selVessels.size === filtV.length && filtV.length > 0) {
            setSelVessels(new Set());
          } else {
            setSelVessels(new Set(filtV.map(v => v.vessel)));
          }
        }}
        style={{ cursor: "pointer", userSelect: "none" }}
        title="Click to toggle all"
      >
        <div style={{ fontSize: 11, color: selVessels.size > 0 && selVessels.size === filtV.length ? "#4fc3f7" : C.faint }}>
          {selVessels.size > 0 && selVessels.size === filtV.length ? "[✓]" : "[ ]"}
        </div>
        <div style={{ fontSize: 8, color: C.faint, marginTop: 2 }}>All</div>
      </div>
    ), 
    align: "center", 
    width: 32 
  },
  { key: "operator", label: "Operator", width: colWidthsV.Operator },
  { key: "vessel", label: "Vessel", width: colWidthsV.Vessel },
  { key: "built", label: "Built", align: "right", width: colWidthsV.Built },
  { key: "dwt", label: "DWT", align: "right", width: colWidthsV.DWT },
  { key: "coating", label: "Coating", width: colWidthsV.Coating },
  { key: "loa", label: "LOA", align: "right", width: colWidthsV.LOA },
  { key: "beam", label: "Beam", align: "right", width: colWidthsV.Beam },
  { key: "cbm", label: "CBM", align: "right", width: colWidthsV.CBM },
  { key: "date", label: "Date", align: "center", width: colWidthsV.Date },
  { key: "openPort", label: "Open Port", width: colWidthsV.OpenPort },
  { key: "comment", label: "Comment", width: colWidthsV.Comment },
  { key: "updatedAt", label: "Updated", align: "center", width: colWidthsV.FileDate },
  { key: "delete", label: "", align: "center", width: 24 },
];

const cargoColumns = [
  { key: "select", label: "", align: "center", width: 28 },
  { key: "status", label: "Status", align: "left", width: colWidthsC.Status },
  { key: "vessel", label: "Vessel", align: "left", width: colWidthsC.Vessel },
  { key: "charterer", label: "Charterer", align: "left", width: colWidthsC.Charterer },
  { key: "qty", label: "Qty", align: "left", width: colWidthsC.Qty },
  { key: "cargo", label: "Cargo", align: "left", width: colWidthsC.Cargo },
  { key: "load", label: "Load", align: "left", width: colWidthsC.Load },
  { key: "disch", label: "Disch", align: "left", width: colWidthsC.Disch },
  { key: "from", label: "From", align: "left", width: colWidthsC.LaycanStart },
  { key: "to", label: "To", align: "left", width: colWidthsC.LaycanEnd },
  { key: "freight", label: "Freight", align: "left", width: colWidthsC.Freight },
  { key: "comment", label: "Comment", align: "left", width: colWidthsC.Comment },
  { key: "tag", label: "Tag", align: "left", width: 80 },
  { key: "updated", label: "Updated", align: "left", width: colWidthsC.Updated },
  { key: "delete", label: "", align: "center", width: 26 },
];
  const th={background:C.bg2,color:C.dim,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",padding:"6px 8px",borderBottom:"1px solid "+C.bd2,textAlign:"left",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"};
  const td={padding:"4px 7px",borderBottom:"1px solid "+C.bg2,verticalAlign:"middle",fontSize:12};
  const fb=on=>({
  fontSize:11,
  fontWeight:600,
  padding:"2px 7px",
  borderRadius:3,
  border:"1px solid "+(on ? C.blue : "rgba(120,160,220,0.35)"),
  background:on ? "rgba(88,166,255,.22)" : C.bg4,
  color:on ? "#d9ecff" : "#9fc3f5",
  cursor:"pointer",
  fontFamily:"inherit",
  whiteSpace:"nowrap",
  boxShadow:on ? "0 0 0 1px rgba(88,166,255,.18) inset" : "none"
});

  // Tag component for vessel specs
  const Tag=({col,children})=><span style={{fontSize:11,fontWeight:600,padding:"2px 6px",borderRadius:3,background:col+"18",border:"1px solid "+col+"44",color:col}}>{children}</span>;

  function toggleFilter(f){setFilters(prev=>{const n=new Set(prev);n.has(f)?n.delete(f):n.add(f);return n;});}
  function srt(k){setSortD(sortK===k?sortD*-1:1);setSortK(k);}

  function focusCell(row, key){
  const el = document.querySelector(`[data-cell="${row}-${key}"]`);
  el?.click();
}

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

const vesselsTodayUpdated=useMemo(()=>{
    const todayStart=new Date();
    todayStart.setHours(0,0,0,0);
    return new Set(vessels.filter(v=>{
      if(!v.updatedAt) return false;
      const d=new Date(v.updatedAt);
      return !isNaN(d) && d>=todayStart;
    }).map(v=>v.vessel));
  },[vessels]);

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
      const inPPT=d!==null && d>=0 && d<=1 && vesselsTodayUpdated.has(v.vessel);
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

  if(superRegionFilter.size>0){
    list=list.filter(v=>superRegionFilter.has(String(v.superRegion||"").trim()));
  }
  if(segmentFilter.size>0){
    list=list.filter(v=>segmentFilter.has(String(v.segment||"").trim()));
  }

  if(dwtFilter){
    list=list.filter(v=>{
      const d=parseFloat(v.dwt)||0;
      if(dwtFilter==="<10") return d<10000;
      if(dwtFilter==="10-15") return d>=10000&&d<15000;
      if(dwtFilter==="15-20") return d>=15000&&d<20000;
      if(dwtFilter==="20-30") return d>=20000&&d<30000;
      if(dwtFilter==="30-40") return d>=30000&&d<40000;
      if(dwtFilter===">40") return d>=40000;
      return true;
    });
  }

  if(builtFilter){
    list=list.filter(v=>{
      const b=parseInt(v.built)||0;
      if(builtFilter==="<2005") return b>0&&b<2005;
      if(builtFilter==="2005-10") return b>=2005&&b<2010;
      if(builtFilter==="2010-15") return b>=2010&&b<2015;
      if(builtFilter==="2015-20") return b>=2015&&b<2020;
      if(builtFilter===">2020") return b>=2020;
      return true;
    });
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
  segmentFilter,
  dwtFilter,
  builtFilter
]);
  // Reset page when filters change
  useEffect(()=>{setPosPage(1);},[vessels,filters,search,sortK,opFilter,bucketFilters,updFilter,posFileDaysBack,superRegionFilter]);

  const stats={total:vessels.length,ppt:filtV.filter(v=>isOpenPPT(v.date)).length,subs:filtV.filter(v=>v.openPort==="EMPLOYED").length};
  const vessels14d=useMemo(()=>{
    const cutoff=new Date();
    cutoff.setDate(cutoff.getDate()-14);
    cutoff.setHours(0,0,0,0);
    return vessels.filter(v=>{
      if(!v.updatedAt) return false;
      const d=new Date(v.updatedAt);
      return !isNaN(d) && d>=cutoff;
    });
  },[vessels]);
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
    if(cTagFilter) list=list.filter(c=>(c.tag||"").toLowerCase()===cTagFilter.toLowerCase());
    if(cGradeFilter){
      let allGroups=[];try{const raw=localStorage.getItem("signal_cargo_filter_groups");allGroups=raw?JSON.parse(raw):[];}catch{}
      const grp=allGroups.find(g=>g.id===cGradeFilter);
      if(grp){
        const fieldMap={grade:"cargo",load:"load",disch:"disch",charterer:"charterer",laycan:"from",tag:"tag"};
        const field=fieldMap[grp.category||"grade"]||"cargo";
        list=list.filter(c=>{const val=(c[field]||"").toLowerCase();return grp.aliases.some(a=>val.includes(a.toLowerCase()));});
      } else {
        list=list.filter(c=>(c.cargo||"").toLowerCase().includes(cGradeFilter.toLowerCase()));
      }
    }
    return list;
  },[cargoes,cFilter,cSearch,cDateFilter,cSortK,cSortD,cTimeFilter,cTagFilter,cGradeFilter]);

  const FILTER_GROUPS=[
    {label:"Status",items:[["PPT","Open PPT"],["SUBS","On Subs"],["HIDE_EMP","Hide Employed"]]},
    {label:"Region",items:[["WCUK","WCUK"],["ECUK","ECUK"],["CANAL","Canal"],["BISCAY","Biscay"],["SKAW","Skaw"],["BALTIC","Baltic"],["MED","Med"]]},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.tx,fontFamily:"Inter,sans-serif"}}>
      {/* ── PIN overlay — rendered on top, app loads underneath ── */}
      {!unlocked&&(
        <div style={{position:"fixed",inset:0,zIndex:99999,background:"#060e1c",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Inter,system-ui,sans-serif"}}>
          <div style={{background:"rgba(10,20,42,0.95)",border:"1px solid rgba(58,130,246,0.25)",borderRadius:14,padding:"44px 48px",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.6)",minWidth:300}}>
            <div style={{fontSize:20,fontWeight:800,color:"#e8f2ff",letterSpacing:"0.02em",marginBottom:6}}>
              <span>Broker </span><span style={{color:"#43e97b"}}>Dashboard</span>
            </div>
            <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:32,letterSpacing:"0.08em",textTransform:"uppercase"}}>
              {guestMode?"Guest access":"Enter PIN"}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:24}}>
              {[0,1,2,3].map(i=>(
                <div key={i} style={{
                  width:44,height:54,borderRadius:8,
                  background:pinInput.length>i?"rgba(88,166,255,0.18)":"rgba(8,18,38,0.8)",
                  border:"1px solid "+(pinError?"rgba(255,107,107,0.6)":pinInput.length>i?"rgba(88,166,255,0.5)":"rgba(58,130,246,0.2)"),
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:24,color:"#79c0ff",transition:"all 0.15s",
                  transform:pinError?"translateX(4px)":"none",
                  boxShadow:pinInput.length>i?"0 0 12px rgba(88,166,255,0.2)":"none"
                }}>
                  {pinInput.length>i?"●":""}
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,maxWidth:200,margin:"0 auto"}}>
              {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
                <button key={i} disabled={d===""}
                  onClick={()=>{
                    if(d==="⌫"){setPinInput(p=>p.slice(0,-1));return;}
                    if(d===""||typeof d!=="number")return;
                    const next=pinInput+String(d);
                    setPinInput(next);
                    if(next.length===4) submitPin(next);
                  }}
                  style={{
                    height:48,borderRadius:8,border:"1px solid rgba(58,130,246,0.18)",
                    background:d===""?"transparent":"rgba(14,28,58,0.8)",
                    color:d===""?"transparent":"rgba(160,200,255,0.85)",
                    fontSize:18,fontWeight:600,cursor:d===""?"default":"pointer",
                    fontFamily:"inherit",transition:"background 0.1s",
                    visibility:d===""?"hidden":"visible"
                  }}>
                  {d}
                </button>
              ))}
            </div>
            {pinError&&<div style={{marginTop:16,fontSize:11,color:"rgba(255,107,107,0.8)",letterSpacing:"0.06em"}}>Incorrect code</div>}
          </div>
        </div>
      )}
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
      {/* ── APP HEADER ── */}
      <div style={{
        background:"linear-gradient(135deg, #070f1c 0%, #0c1a32 50%, #081426 100%)",
        borderBottom:"1px solid rgba(58,130,246,0.18)",
        position:"sticky",top:0,zIndex:200,
      }}>
        {/* Top bar: brand + Ask AI + Intel Vault + utilities */}
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 20px 0",borderBottom:"1px solid rgba(58,130,246,0.08)"}}>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",gap:1,paddingBottom:10}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:"rgba(120,180,255,0.45)"}}>Tanker Intel Platform</div>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:18,fontWeight:800,color:"#e8f2ff",letterSpacing:"0.02em"}}>Broker</span>
              <span style={{fontSize:18,fontWeight:800,color:"#43e97b",letterSpacing:"0.02em"}}>Dashboard</span>
              <span style={{fontSize:10,color:"rgba(140,190,255,0.35)",marginLeft:2}}>
                {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
              </span>
              {guestMode&&(
                <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,
                  background:"rgba(250,163,86,0.12)",border:"1px solid rgba(250,163,86,0.3)",
                  color:"rgba(250,163,86,0.8)",letterSpacing:"0.1em",textTransform:"uppercase",marginLeft:4}}>
                  Guest
                </span>
              )}
            </div>
          </div>
          <div style={{width:1,background:"rgba(58,130,246,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>
          {!mobile&&(
            <div style={{flex:1,minWidth:0,position:"relative",paddingBottom:10}}>
              <AskAIStrip vessels={vessels} cargoes={cargoes} intelItems={intelItems}/>
            </div>
          )}
          {!mobile&&<div style={{width:1,background:"rgba(58,130,246,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>}
          {!mobile&&(
            <div style={{flexShrink:0,paddingBottom:10}}>
              <IntelVaultStrip onVaultUpdate={setIntelItems}/>
            </div>
          )}
          <div style={{width:1,background:"rgba(58,130,246,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>
          <div style={{display:"flex",gap:3,alignItems:"center",flexShrink:0,paddingBottom:10}}>
            {[70,80,90,100,110,120,130].map(z=>(
              <button key={z} onClick={()=>document.body.style.zoom=z+"%"}
                style={{fontSize:9,padding:"1px 4px",borderRadius:2,border:"1px solid rgba(58,130,246,0.12)",background:"transparent",color:"rgba(100,140,200,0.3)",cursor:"pointer",fontFamily:"inherit"}}>{z}%</button>
            ))}
            <button onClick={onLoadVesselDB} disabled={vesselDBLoaded||vesselDBLoading}
              style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:3,marginLeft:4,
                border:"1px solid "+(vesselDBLoaded?"rgba(67,233,123,0.4)":"rgba(58,130,246,0.18)"),
                background:vesselDBLoaded?"rgba(67,233,123,0.08)":"transparent",
                color:vesselDBLoaded?"#43e97b":vesselDBLoading?"#faa356":"rgba(100,140,200,0.4)",
                cursor:vesselDBLoaded||vesselDBLoading?"default":"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {vesselDBLoaded?"✓ DB":vesselDBLoading?"⟳…":"Ship DB"}
            </button>
            {tab==="pos"&&vessels.length>0&&(
              <button onClick={()=>setPendingDel({type:"all",id:"__ALL__",label:"ALL "+vessels.length+" vessels"})}
                style={{fontSize:10,padding:"2px 8px",borderRadius:3,border:"1px solid rgba(255,107,107,0.25)",background:"transparent",color:"rgba(255,107,107,0.4)",cursor:"pointer",fontFamily:"inherit"}}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>
        {/* Tab navigation row */}
        <div style={{display:"flex",alignItems:"stretch",padding:"0 20px",gap:0,overflowX:"visible"}}>
          {[
            ["pos","Positions",vessels.length,"#58a6ff"],
            ["cargo","Cargoes",cargoTotal||cargoes.length,"#faa356"],
            ["fix","Fixing",0,"#c792ea"],
            ["matrix","Matrix",0,"#43e97b"],
            ["projects","Projects",0,"#4fc3f7"],
            ["tce","TCE",0,"#faa356"],
            ["dash","Dashboard",0,"#43e97b"],
            ["notes","Notes",0,"#f472b6"],
            ["reports","Reports",0,"#6366f1"],
            ["map","Freight Map",0,"#10b981"],
            ["cal","Calendar",0,"#4fc3f7"],
            ["settings","Settings",0,"#94a3b8"],
          ].filter(([id])=>!guestMode||GUEST_TABS.includes(id)).map(([id,label,count,col])=>{
            const active=tab===id;
            return(
              <button key={id} onClick={()=>{setTab(id);setBucketFilters(new Set());}}
                style={{position:"relative",display:"flex",alignItems:"center",gap:6,
                  padding:"10px 16px",background:"transparent",border:"none",
                  borderBottom:"2px solid "+(active?col:"transparent"),
                  cursor:"pointer",fontFamily:"inherit",flexShrink:0,
                  transition:"border-color 0.15s,color 0.15s",marginBottom:-1}}>
                <span style={{fontSize:12,fontWeight:active?700:500,
                  color:active?col:"rgba(120,155,210,0.5)",
                  textTransform:"uppercase",letterSpacing:"0.07em",whiteSpace:"nowrap"}}>
                  {label}
                </span>
                {count>0&&(
                  <span style={{fontSize:10,fontWeight:700,
                    color:active?col:"rgba(100,140,200,0.35)",
                    background:active?col+"18":"transparent",
                    padding:"0 5px",borderRadius:8,lineHeight:"16px",
                    border:active?"1px solid "+col+"33":"none"}}>
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{padding:"12px 20px",maxWidth:1900,margin:"0 auto"}}>

        {/* ── POSITIONS ── */}
        {tab==="pos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
          
            {/* ── Top row: Perfect grid ── */}
            <div style={{display:"flex",gap:10,flexDirection:mobile?"column":"row"}}>
              
              {/* LEFT: Parse + Fixing (32%) */}
              <div
  style={{
    width: mobile ? "100%" : "32%",
    height: mobile ? "auto" : 460,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflow: "hidden"
  }}
>
  <div style={{ flex: "0 0 auto" }}>
    <ParsePanel
      vessels={vessels}
      onAddVessels={onAddVessels}
      onAddCargoes={onAddCargoes}
      lockedMode="pos"
      vesselDB={{}}
    />
  </div>

  <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
    <FixingWindow
      vessels={vessels14d}
      opFilter={opFilter}
      onOpFilter={op => setOpFilter(o => o === op ? null : op)}
    />
  </div>
</div>
 
              {/* CENTER: Rate Matrix (34%) */}
              {!mobile&&(
                <div style={{width:"34%",height:460,background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  <div style={{padding:"8px 10px",flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                    <RateMatrix bunkerHeader={<BunkerHeader/>}/>
                  </div>
                </div>
              )}
 
              {/* RIGHT: AIS Map (34%) - matches Rate Matrix height */}
{!mobile&&(
  <div style={{width:"34%",height:460}}>
    <AISMap selectedVessels={selectedAISVessels} vessels={vessels}/>
  </div>
)}
 </div>
            {vessels.length > 0 && (
              <>
                {/* Second row: PPT + Filters (grid aligned) */}
<div style={{display:"flex",gap:10,flexDirection:mobile?"column":"row",marginTop:-5}}>
                  
  {/* LEFT: PPT Timeline (32%) */}
  {!mobile&&(
    <div style={{width:"32%",height:260}}>
      <OpeningBreakdown
        vessels={vessels14d.filter(v=>vesselsTodayUpdated.has(v.vessel))}
        filteredVessels={filtV.filter(v=>vesselsTodayUpdated.has(v.vessel))}
        bucketFilters={bucketFilters}
        onBucketFilter={k=>setBucketFilters(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n;})}
        fillHeight={false}
      />
    </div>
  )}

  {/* CENTER: Filters (34%) - same height as PPT */}
  <div style={{flex:1,minWidth:0,height:mobile?"auto":260,display:"flex",flexDirection:"column",gap:8}}>

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

                    {/* UNIFIED FILTER PANEL */}
{(()=>{
  const FR=({label,col,children})=>(
    <div style={{display:"flex",alignItems:"center",gap:6,borderBottom:"1px solid "+C.bd2,paddingBottom:3}}>
      <div style={{width:54,fontSize:10,fontWeight:700,color:col,textTransform:"uppercase",flexShrink:0}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:3,flex:1}}>{children}</div>
    </div>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"7px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,boxSizing:"border-box",flex:1}}>
      <FR label="Status" col={C.amber}>
        {[["PPT","PPT"],["SUBS","Subs"],["HIDE_EMP","Hide Emp"]].map(([f,l])=>(<button key={f} onClick={()=>toggleFilter(f)} style={fb(filters.has(f))}>{l}</button>))}
        {filters.size>0&&<button onClick={()=>setFilters(new Set())} style={{...fb(false),color:C.red,borderColor:C.red+"55"}}>✕</button>}
      </FR>
      <FR label="Updated" col={C.blue}>
        {[["","All"],["today","Today"],["week","This wk"]].map(([v,l])=>(<button key={v||"all"} onClick={()=>setUpdFilter(v)} style={fb(updFilter===v&&(v!==""||updFilter===""))}>{l}</button>))}
      </FR>
      <FR label="Region" col="#7dd3fc">
        {[["WCUK","WCUK"],["ECUK","ECUK"],["CANAL","Canal"],["BISCAY","Biscay"],["SKAW","Skaw"],["BALTIC","Baltic"],["MED","Med"]].map(([f,l])=>(<button key={f} onClick={()=>toggleFilter(f)} style={fb(filters.has(f))}>{l}</button>))}
      </FR>
      <FR label="S.Region" col={C.purple}>
        {superRegionOptions.filter(r=>r!=="ALL").map(r=>{
          const toggle=e=>{
            if(e.ctrlKey||e.metaKey){setSuperRegionFilter(prev=>{const n=new Set(prev);n.has(r)?n.delete(r):n.add(r);return n;});}
            else{setSuperRegionFilter(prev=>prev.size===1&&prev.has(r)?new Set():new Set([r]));}
          };
          return <button key={r} onClick={toggle} style={fb(superRegionFilter.has(r))}>{r}</button>;
        })}
        {superRegionFilter.size>0&&<button onClick={()=>setSuperRegionFilter(new Set())} style={{...fb(false),color:C.red,borderColor:C.red+"55"}}>✕</button>}
      </FR>
      <FR label="Segment" col={C.green}>
        {(()=>{const ORDER=["Sub 10k","City","Inter","J19","Flexi","Handy","MR"];return[...new Set(vessels.map(v=>v.segment).filter(Boolean))].sort((a,b)=>(ORDER.indexOf(a)===-1?99:ORDER.indexOf(a))-(ORDER.indexOf(b)===-1?99:ORDER.indexOf(b))).map(s=>(<button key={s} onClick={e=>{if(e.ctrlKey||e.metaKey){setSegmentFilter(prev=>{const n=new Set(prev);n.has(s)?n.delete(s):n.add(s);return n;});}else{setSegmentFilter(prev=>prev.size===1&&prev.has(s)?new Set():new Set([s]));}setPosPage(1);}} style={fb(segmentFilter.has(s))}>{s}</button>));})()}
        {segmentFilter.size>0&&<button onClick={()=>{setSegmentFilter(new Set());setPosPage(1);}} style={{...fb(false),color:C.red,borderColor:C.red+"55"}}>✕</button>}
      </FR>
      <FR label="DWT" col="#f59e0b">
        {[["<10","<10k"],["10-15","10-15k"],["15-20","15-20k"],["20-30","20-30k"],["30-40","30-40k"],[">40",">40k"]].map(([v,l])=>(<button key={v} onClick={()=>{setDwtFilter(dwtFilter===v?"":v);setPosPage(1);}} style={fb(dwtFilter===v)}>{l}</button>))}
        {dwtFilter&&<button onClick={()=>{setDwtFilter("");setPosPage(1);}} style={{...fb(false),color:C.red,borderColor:C.red+"55"}}>✕</button>}
      </FR>
      <FR label="Built" col="#94a3b8">
        {[["<2005","<2005"],["2005-10","2005-10"],["2010-15","2010-15"],["2015-20","2015-20"],[">2020",">2020"]].map(([v,l])=>(<button key={v} onClick={()=>{setBuiltFilter(builtFilter===v?"":v);setPosPage(1);}} style={fb(builtFilter===v)}>{l}</button>))}
        {builtFilter&&<button onClick={()=>{setBuiltFilter("");setPosPage(1);}} style={{...fb(false),color:C.red,borderColor:C.red+"55"}}>✕</button>}
      </FR>
    </div>
  );
})()}</div>

</div>

                {/* MOVED: Fleet count + Export + Search to same row */}
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,fontSize:12,flexWrap:"wrap"}}>
                  <ExportPanel vessels={filtV} cargoes={cargoes} mode="pos" selVessels={selVessels}/>
                  {selVessels.size>0&&(
                    <button onClick={()=>setTab("reports")} style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,border:"1px solid #6366f1",background:"rgba(99,102,241,.12)",color:"#6366f1",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      📋 To Report ({selVessels.size})
                    </button>
                  )}
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
                  <div style={tableWrap}>
                    <MatrixTable
  columns={posColumns}
  data={filtV.slice(0, posPage * POS_PAGE_SIZE)}
  keyField="vessel"
  selectedKey={sel}
  onRowClick={(row) => {
    setSel(sel === row.vessel ? null : row.vessel);
    setSelectedAISVessels([row.vessel]);
  }}
  onRowContextMenu={(row, e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      vessel: row
    });
  }}
  renderRow={(v, td, i) => {
  const isSel = sel === v.vessel;
  const ppt = isOpenPPT(v.date);

  return (
    <>
      {/* SELECT */}
      <td
        style={{ ...tdCtr, width: 28, padding: "0 2px" }}
        onClick={e => {
          e.stopPropagation();
          setSelVessels(p => {
            const n = new Set(p);
            n.has(v.vessel) ? n.delete(v.vessel) : n.add(v.vessel);
            return n;
          });
        }}
      >
        <span style={{ fontSize: 12, color: selVessels.has(v.vessel) ? "#4fc3f7" : C.faint }}>
          {selVessels.has(v.vessel) ? "[✓]" : "[ ]"}
        </span>
      </td>

      {/* OPERATOR */}
      <EC
  value={v.operator}
  color={C.dim}
  placeholder="Operator"
  onSave={val=>onUpdateV(v.vessel,"operator",val)}
  data-cell={`${i}-operator`}
  onTab={() => focusCell(i, "vessel")}
  onShiftTab={() => focusCell(i-1, "comment")}
  onDown={() => focusCell(i+1, "operator")}
  onUp={() => focusCell(i-1, "operator")}
/>

      {/* VESSEL */}
      <EC
        value={toTCase(v.vessel)}
        color={ppt ? "#a8e6a3" : "#79c0ff"}
        bold={true}
        placeholder="Vessel"
        onSave={val=>onRenameV&&onRenameV(v.vessel,val?.toUpperCase()||v.vessel)}
        data-cell={`${i}-vessel`}
        onTab={() => focusCell(i, "date")}
        onShiftTab={() => focusCell(i, "operator")}
        onDown={() => focusCell(i+1, "vessel")}
        onUp={() => focusCell(i-1, "vessel")}
      />

      <td style={{ ...tdNum, color: C.dim }}>{v.built || ""}</td>
      <td style={{ ...tdNum, color: C.dim }}>{fmtN(v.dwt)}</td>
      <td style={{ ...tdTxt, color: C.dim }}>{v.coating || ""}</td>
      <td style={{ ...tdNum, color: C.dim }}>{v.loa || ""}</td>
      <td style={{ ...tdNum, color: C.dim }}>{v.beam || ""}</td>
      <td style={{ ...tdNum, color: C.dim }}>{fmtN(v.cbm)}</td>

      {/* DATE */}
      <EC
  value={v.date}
  color={ppt ? "#a8e6a3" : "#79c0ff"}
  placeholder="Date"
  onSave={val => {
    const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let fmt=val.trim();
    const m1=fmt.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if(m1){
      const mo=parseInt(m1[2])-1;
      if(mo>=0&&mo<12) fmt=parseInt(m1[1])+" "+MON[mo];
    } else {
      const m2=fmt.match(/^(\d{1,2})\s+([A-Za-z]{3})/i);
      if(m2){
        const mi=MON.findIndex(m=>m.toLowerCase()===m2[2].toLowerCase().slice(0,3));
        if(mi>=0) fmt=parseInt(m2[1])+" "+MON[mi];
      }
    }
    onUpdateV(v.vessel,"date",fmt);
  }}
  data-cell={`${i}-date`}
  onTab={() => focusCell(i, "port")}
  onShiftTab={() => focusCell(i, "vessel")}
  onDown={() => focusCell(i+1, "date")}
  onUp={() => focusCell(i-1, "date")}
/>
      {/* PORT */}
      <EC
  value={v.openPort}
  color={v.openPort==="EMPLOYED"?C.purple:"#79c0ff"}
  placeholder="Port"
  onSave={val=>onUpdateV(v.vessel,"openPort",val)}
  data-cell={`${i}-port`}
  onTab={() => focusCell(i, "comment")}
  onShiftTab={() => focusCell(i, "date")}
  onDown={() => focusCell(i+1, "port")}
  onUp={() => focusCell(i-1, "port")}
/>

      {/* COMMENT */}
      <EC
  value={v.comment}
  color={C.dim}
  placeholder="Comment"
  onSave={val=>onUpdateV(v.vessel,"comment",val)}
  data-cell={`${i}-comment`}
  onTab={() => focusCell(i+1, "vessel")}
  onShiftTab={() => focusCell(i, "port")}
  onDown={() => focusCell(i+1, "comment")}
  onUp={() => focusCell(i-1, "comment")}
/>

      {/* UPDATED */}
      <td style={{ ...tdCtr, color: C.faint }}>
        {v.updatedAt ? new Date(v.updatedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : ""}
      </td>

      {/* DELETE */}
      <td style={{ ...tdCtr, width: 24, minWidth: 24, maxWidth: 24, padding: "0 2px" }} onClick={e=>e.stopPropagation()}>
        <button
          onClick={(e)=>{
            e.stopPropagation();
            setPendingDel({type:"vessel",id:v.vessel,label:v.vessel});
          }}
          style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:10,padding:"0 2px",opacity:0.7}}
          title="Delete"
        >
          ✕
        </button>
      </td>
    </>
  );
}}
/>
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
                        {[["Open Port","openPort",C.amber],["Date","date",C.blue],["Comment","comment",C.dim],["Operator","operator",C.purple],["Built","built",C.dim],["DWT","dwt",C.amber],["Coating","coating",C.green],["LOA","loa",C.dim],["Beam","beam",C.dim],["CBM","cbm",C.dim]].map(([l,f,col])=>(
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
                        <textarea 
                          defaultValue={selV.notes||""}
                          key={selV.vessel}
                          onBlur={e => {
                            if (e.target.value !== (selV.notes||"")) {
                              onUpdateV(selV.vessel,"notes",e.target.value);
                            }
                          }}
                          placeholder="Add vessel notes…"
                          style={{
                            width:"100%",
                            minHeight:80,
                            background:C.bg3,
                            border:"1px solid "+C.bd,
                            borderRadius:4,
                            color:C.dim,
                            fontSize:12,
                            padding:"6px 8px",
                            fontFamily:"inherit",
                            resize:"vertical",
                            outline:"none",
                            marginTop:4
                          }}
                        />

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
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {/* Parse + filter panel side by side */}
            <div style={{display:"flex",gap:10,alignItems:"flex-start",flexDirection:mobile?"column":"row"}}>
              <div style={{flex:mobile?"1 1 auto":"0 0 60%",display:"flex",flexDirection:"column",gap:4}}>
                <ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels}
                  onAddCargoes={async(parsed)=>{
                    const withTag=pendingParseTag?parsed.map(c=>({...c,tag:pendingParseTag})):parsed;
                    const result=await onAddCargoes(withTag);
                    if(pendingParseTag)setPendingParseTag(""); // reset after parse
                    return result;
                  }}
                  lockedMode="cargo" vesselDB={{}}/>
              </div>
              {(()=>{
                const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                let allGroups=[];
                try{const raw=localStorage.getItem("signal_cargo_filter_groups");allGroups=raw?JSON.parse(raw):[];}catch{}
                // Grade groups (default category)
                const gradeGroups=allGroups.filter(g=>(g.category||"grade")==="grade");
                const showRaw=gradeGroups.length===0;
                const rawGrades=showRaw?[...new Set(cargoes.map(c=>(c.cargo||"").trim()).filter(Boolean))].sort().slice(0,20):[];
                const FR2=({label,col,children})=>(
                  <div style={{display:"flex",alignItems:"flex-start",gap:5,padding:"2px 0 3px",borderBottom:"1px solid "+C.bd2}}>
                    <div style={{width:52,fontSize:10,fontWeight:700,color:col,textTransform:"uppercase",flexShrink:0,paddingTop:2}}>{label}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3,flex:1}}>{children}</div>
                  </div>
                );
                // Build filter rows for each category that has groups
                const catRows=[
                  {id:"grade",label:"Grade",col:C.purple},
                  {id:"load",label:"Load",col:"#7dd3fc"},
                  {id:"disch",label:"Disch",col:"#7dd3fc"},
                  {id:"charterer",label:"Charterer",col:"#faa356"},
                  {id:"laycan",label:"Laycan",col:"#94a3b8"},
                  {id:"tag",label:"Tag",col:"#f472b6"},
                ];
                return(
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:3,padding:"6px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6}}>
                    {/* Grade row — always shown */}
                    <FR2 label="Grade" col={C.purple}>
                      {showRaw
                        ?rawGrades.map(g=><button key={g} onClick={()=>setCGradeFilter(v=>v===g?"":g)} style={fb(cGradeFilter===g)}>{g}</button>)
                        :gradeGroups.map(grp=><button key={grp.id} onClick={()=>setCGradeFilter(v=>v===grp.id?"":grp.id)} style={fb(cGradeFilter===grp.id)} title={grp.aliases.join(", ")}>{grp.label}</button>)
                      }
                      {cGradeFilter&&<button onClick={()=>setCGradeFilter("")} style={{...fb(false),color:C.red,borderColor:C.red+"55",fontSize:10}}>✕</button>}
                      <button onClick={()=>setTab("settings")} style={{...fb(false),fontSize:9,color:"rgba(120,160,220,0.35)",padding:"1px 5px"}} title="Edit groups in Settings">⚙</button>
                    </FR2>
                    {/* Dynamic rows for other categories */}
                    {catRows.filter(cr=>cr.id!=="grade").map(cr=>{
                      const catGroups=allGroups.filter(g=>g.category===cr.id);
                      if(!catGroups.length)return null;
                      return(
                        <FR2 key={cr.id} label={cr.label} col={cr.col}>
                          {catGroups.map(grp=>(
                            <button key={grp.id} onClick={()=>setCGradeFilter(v=>v===grp.id?"":grp.id)} style={fb(cGradeFilter===grp.id)} title={grp.aliases.join(", ")}>{grp.label}</button>
                          ))}
                          {cGradeFilter&&catGroups.some(g=>g.id===cGradeFilter)&&<button onClick={()=>setCGradeFilter("")} style={{...fb(false),color:C.red,borderColor:C.red+"55",fontSize:10}}>✕</button>}
                        </FR2>
                      );
                    })}
                    <FR2 label="Period" col="#94a3b8">
                      {[["","All"],["tw","This wk"],["lw","Last wk"],["ytd","YTD"]].map(([v,l])=>(
                        <button key={v||"all"} onClick={()=>setCTimeFilter(v)} style={fb(cTimeFilter===v)}>{l}</button>
                      ))}
                      {(cGradeFilter||cFilter!=="ALL"||cTimeFilter||cTagFilter)&&<button onClick={()=>{setCGradeFilter("");setCFilter("ALL");setCTimeFilter("");setCTagFilter("");}} style={{...fb(false),color:C.red,borderColor:C.red+"55",marginLeft:4,fontSize:10}}>✕ Clear</button>}
                    </FR2>
                    {/* Tag filter row */}
                    {(()=>{
                      const usedTags=[...new Set(cargoes.map(c=>c.tag).filter(Boolean))].sort();
                      if(!usedTags.length)return null;
                      return(
                        <FR2 label="Tag" col="#f472b6">
                          {usedTags.map(t=>(
                            <button key={t} onClick={()=>setCTagFilter(v=>v===t?"":t)} style={fb(cTagFilter===t)}>{t}</button>
                          ))}
                          {cTagFilter&&<button onClick={()=>setCTagFilter("")} style={{...fb(false),color:C.red,borderColor:C.red+"55",fontSize:10}}>✕</button>}
                        </FR2>
                      );
                    })()}
                    {/* small divider */}
                    <div style={{borderTop:"1px solid rgba(88,166,255,0.08)",margin:"1px 0"}}/>
                    {/* Tag on parse */}
                    <FR2 label="On parse" col="#94a3b8">
                      {getTagList().map(t=>(
                        <button key={t} onClick={()=>setPendingParseTag(v=>v===t?"":t)} style={fb(pendingParseTag===t)}>{t}</button>
                      ))}
                      {pendingParseTag&&<button onClick={()=>setPendingParseTag("")} style={{...fb(false),color:C.red,borderColor:C.red+"55",fontSize:10}}>✕ {pendingParseTag}</button>}
                    </FR2>
                  </div>
                );
              })()}
            </div>
            {/* Search */}
            <div style={{position:"relative"}}>
              <input value={cSearch} onChange={e=>{const v=e.target.value;setCSearch(v);clearTimeout(window._csTimer);window._csTimer=setTimeout(()=>onCargoSearch(v),350);}} placeholder="Search cargoes…"
                style={{width:"100%",background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"5px 28px 5px 10px",outline:"none",boxSizing:"border-box"}}/>
              {cSearch&&<button onClick={()=>{setCSearch("");onCargoSearch("");}} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:C.bd,border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",color:C.faint,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>✕</button>}
            </div>
            {/* Stats + Copy/CSV/Delete */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,flexWrap:"wrap"}}>
              <ExportPanel vessels={vessels} cargoes={filtC} mode="cargo" selCargoes={selCargoes}/>
              {selCargoes.size>0&&(
                <button onClick={()=>setTab("reports")} style={{fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:4,border:"1px solid #6366f1",background:"rgba(99,102,241,.12)",color:"#6366f1",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  📋 To Report ({selCargoes.size})
                </button>
              )}
              {selCargoes.size>0&&(
                <button onClick={()=>setPendingDel({type:"allcargo",id:"__SELCARGO__",label:selCargoes.size+" cargo"+(selCargoes.size!==1?"es":"")})}
                  style={{fontSize:11,fontWeight:600,padding:"2px 9px",borderRadius:4,border:"1px solid rgba(255,107,107,0.4)",background:"rgba(255,107,107,0.1)",color:"#ff6b6b",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  Delete ({selCargoes.size})
                </button>
              )}
              {selCargoes.size>0&&(
                <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                  <span style={{fontSize:10,color:"rgba(120,160,220,0.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Tag {selCargoes.size}</span>
                  {getTagList().map(t=>(
                    <button key={t} onClick={()=>{[...selCargoes].forEach(id=>onUpdateC(id,"tag",t));}}
                      style={{...fb(false),fontSize:10,padding:"1px 6px"}}>{t}</button>
                  ))}
                  <button onClick={()=>{[...selCargoes].forEach(id=>onUpdateC(id,"tag",""));}}
                    style={{...fb(false),fontSize:10,color:C.red,borderColor:C.red+"55",padding:"1px 6px"}}>✕ clear</button>
                </div>
              )}
              <div style={{width:1,height:14,background:C.bd2}}/>
              <span style={{fontSize:12,color:C.faint}}>This wk <span style={{color:"#4fc3f7",fontWeight:700}}>{cargoes.filter(c=>inRange(c.updated||c.created_at,thisWeekMon,thisWeekSun)).length}</span></span>
              <span style={{fontSize:12,color:C.faint}}>Last wk <span style={{color:"rgba(120,160,220,0.6)",fontWeight:700}}>{cargoes.filter(c=>inRange(c.updated||c.created_at,lastWeekMon,lastWeekSun)).length}</span></span>
              <span style={{flex:1}}/>
              <span style={{fontSize:12,color:C.faint}}>Total <span style={{color:C.tx,fontWeight:700}}>{cargoTotal||cargoes.length}</span></span>
              <span style={{fontSize:12,color:C.faint}}>Showing <span style={{color:C.blue,fontWeight:700}}>{filtC.length}</span></span>
            </div>
            <div style={tableWrap}>
              {filtC.length===0
                ?<div style={{padding:"40px",textAlign:"center",color:C.faint}}><div style={{fontSize:28,marginBottom:8}}>📦</div>No fixtures yet</div>
                : <MatrixTable
    columns={(()=>{const allTicked=filtC.length>0&&filtC.every(c=>selCargoes.has(c.id));return cargoColumns.map(col=>col.key==="select"?{...col,label:<span style={{fontSize:11,color:allTicked?"#4fc3f7":C.faint,cursor:"pointer",userSelect:"none"}} onClick={e=>{e.stopPropagation();setSelCargoes(allTicked?new Set():new Set(filtC.map(c=>c.id)));}}>{allTicked?"[✓]":"[ ]"}</span>}:col);})()}
    data={filtC}
    keyField="id"
    getRowStyle={(row,i)=>selCargoes.has(row.id)?"rgba(88,166,255,0.12)":i%2?"rgba(255,255,255,0.02)":"transparent"}
    renderRow={(f, td) => {
  const i = filtC.findIndex(x => x.id === f.id);
  const sc = f.status==="FIXED" ? C.green : f.status==="SUBS" ? C.purple : f.status==="FAILED" ? C.red : C.faint;

  return (
    <>
      {/* SELECT */}
      <td
        style={{ ...tdCtr, width: 28, padding: "0 2px" }}
        onClick={e => {
          e.stopPropagation();
          setSelCargoes(p => {
            const n = new Set(p);
            n.has(f.id) ? n.delete(f.id) : n.add(f.id);
            return n;
          });
        }}
      >
        <span style={{ fontSize: 12, color: selCargoes.has(f.id) ? "#4fc3f7" : C.faint }}>
          {selCargoes.has(f.id) ? "[✓]" : "[ ]"}
        </span>
      </td>

      {/* STATUS */}
      <td
        style={{ ...tdCtr, color: sc, fontWeight: 700, cursor: "pointer" }}
        onClick={e => {
          e.stopPropagation();
          const opts = ["SUBS","FIXED","FAILED",""];
          const cur = opts.indexOf(f.status || "");
          onUpdateC(f.id, "status", opts[(cur + 1) % opts.length]);
        }}
      >
        {f.status || ""}
      </td>

      <EC
  value={f.vessel}
  color={C.blue}
  placeholder="TBN"
  onSave={v2 => onUpdateC(f.id, "vessel", v2)}
  data-cell={`${i}-cvessel`}
  onTab={() => focusCell(i, "charterer")}
  onShiftTab={() => focusCell(i, "status")}
  onDown={() => focusCell(i + 1, "cvessel")}
  onUp={() => focusCell(i - 1, "cvessel")}
/>

<EC
  value={toTCase(f.charterer)}
  color={"#79c0ff"}
  bold
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "charterer", toTCase(v2))}
  data-cell={`${i}-charterer`}
  onTab={() => focusCell(i, "qty")}
  onShiftTab={() => focusCell(i, "cvessel")}
  onDown={() => focusCell(i + 1, "charterer")}
  onUp={() => focusCell(i - 1, "charterer")}
/>

<EC
  value={normaliseQty(f.qty)}
  color={C.amber}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "qty", normaliseQty(v2))}
  data-cell={`${i}-qty`}
  onTab={() => focusCell(i, "cargo")}
  onShiftTab={() => focusCell(i, "charterer")}
  onDown={() => focusCell(i + 1, "qty")}
  onUp={() => focusCell(i - 1, "qty")}
/>

<EC
  value={f.cargo || ""}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "cargo", v2)}
  data-cell={`${i}-cargo`}
  onTab={() => focusCell(i, "load")}
  onShiftTab={() => focusCell(i, "qty")}
  onDown={() => focusCell(i + 1, "cargo")}
  onUp={() => focusCell(i - 1, "cargo")}
/>

<EC
  value={toTCase(f.load || "")}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "load", toTCase(v2))}
  data-cell={`${i}-load`}
  onTab={() => focusCell(i, "disch")}
  onShiftTab={() => focusCell(i, "cargo")}
  onDown={() => focusCell(i + 1, "load")}
  onUp={() => focusCell(i - 1, "load")}
/>

<EC
  value={toTCase(f.disch || "")}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "disch", toTCase(v2))}
  data-cell={`${i}-disch`}
  onTab={() => focusCell(i, "from")}
  onShiftTab={() => focusCell(i, "load")}
  onDown={() => focusCell(i + 1, "disch")}
  onUp={() => focusCell(i - 1, "disch")}
/>

<EC
  value={fmtDateShort(f.from)}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "from", v2)}
  data-cell={`${i}-from`}
  onTab={() => focusCell(i, "to")}
  onShiftTab={() => focusCell(i, "disch")}
  onDown={() => focusCell(i + 1, "from")}
  onUp={() => focusCell(i - 1, "from")}
/>

<EC
  value={fmtDateShort(f.to)}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "to", v2)}
  data-cell={`${i}-to`}
  onTab={() => focusCell(i, "freight")}
  onShiftTab={() => focusCell(i, "from")}
  onDown={() => focusCell(i + 1, "to")}
  onUp={() => focusCell(i - 1, "to")}
/>

<EC
  value={fmtFreight(f.freight) || f.freight}
  color={"#a8e6a3"}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "freight", fmtFreight(v2) || v2)}
  data-cell={`${i}-freight`}
  onTab={() => focusCell(i, "comment")}
  onShiftTab={() => focusCell(i, "to")}
  onDown={() => focusCell(i + 1, "freight")}
  onUp={() => focusCell(i - 1, "freight")}
/>

<EC
  value={f.comment || ""}
  color={C.dim}
  placeholder=""
  onSave={v2 => onUpdateC(f.id, "comment", v2)}
  data-cell={`${i}-comment`}
  onTab={() => focusCell(i + 1, "cvessel")}
  onShiftTab={() => focusCell(i, "freight")}
  onDown={() => focusCell(i + 1, "comment")}
  onUp={() => focusCell(i - 1, "comment")}
/>

      {/* TAG */}
      <TagCell cargoId={f.id} tag={f.tag} onUpdateC={onUpdateC}/>

      {/* UPDATED */}
      <td style={{ ...td2, color: C.faint, textAlign:"left" }}>
        {f.updated ? new Date(f.updated).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : ""}
      </td>

      {/* DELETE */}
      <td
        style={{ ...tdCtr, width: 26, minWidth: 26, maxWidth: 26, padding: "0 2px" }}
        onClick={e=>e.stopPropagation()}
      >
        <button
          onClick={(e)=>{
            e.stopPropagation();
            setPendingDel({type:"cargo",id:f.id,label:f.vessel||"cargo"});
          }}
          style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12,opacity:0.7}}
          title="Delete"
        >
          ✕
        </button>
      </td>
    </>
  );
}}
  />}
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
            <div style={{background:C.bg2,padding:"6px 14px",borderBottom:"1px solid "+C.bd2,display:"flex",gap:16,fontSize:13,color:C.dim,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontWeight:700,color:C.tx}}>🔗 Voyage Matrix</span>
              <span>12.5 kts · 1d load · 18h disch</span>
              <input value={mxSearch||""} onChange={e=>setMxSearch(e.target.value)} placeholder="🔍 Search vessel…"
                style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:13,padding:"2px 8px",outline:"none",width:160,marginLeft:"auto"}}/>
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
                        <div style={{fontWeight:700,fontSize:13,color:C.blue}}>{toTCase(v.vessel)}</div>
                        <div style={{fontSize:13,color:C.dim}}>{v.operator||""}</div>
                      </div>
                      <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                        <div style={{fontSize:11,color:C.faint,textTransform:"uppercase"}}>Now open</div>
                        <div style={{fontSize:13,fontWeight:700,color:v.openPort==="EMPLOYED"?C.purple:C.amber}}>{v.openPort||"?"}</div>
                        {v.date&&<div style={{fontSize:13,color:C.blue}}>{v.date}</div>}
                      </div>
                      {cargo&&<>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ballastNm&&<div style={{fontSize:13,color:C.faint}}>{calc.ballastNm}nm</div>}
                          <div style={{fontSize:15,color:C.faint}}>──▶</div>
                          {calc?.ballastDays&&<div style={{fontSize:13,color:C.faint}}>{calc.ballastDays}d</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+sc+"55",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase"}}>Load</div>
                          <div style={{fontSize:13,fontWeight:700}}>{cargo.load||"?"}</div>
                          <div style={{fontSize:13,color:C.blue}}>{calc?.loadDate||cargo.from||"—"}</div>
                        </div>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ladenNm&&<div style={{fontSize:13,color:C.faint}}>{calc.ladenNm}nm</div>}
                          <div style={{fontSize:15,color:sc}}>──▶</div>
                          {cargo.cargo&&<div style={{fontSize:13,color:C.purple}}>{cargo.cargo}</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+(calc?.openDate?C.green:C.bd)+"88",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase"}}>Next open</div>
                          <div style={{fontSize:13,fontWeight:700,color:calc?.openDate?C.green:C.dim}}>{cargo.disch||"?"}</div>
                          {calc?.openDate?(<div style={{fontSize:13,color:C.green}}>~{calc.openDate}</div>):(<div style={{fontSize:13,color:C.faint}}>—</div>)}
                        </div>
                        <div style={{marginLeft:6,display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{fontSize:13,fontWeight:700,color:sc,background:sc+"18",border:"1px solid "+sc+"44",borderRadius:3,padding:"1px 7px"}}>{cargo.status}</span>
                          {cargo.freight&&<span style={{fontSize:13,color:C.purple,fontWeight:700}}>{cargo.freight}</span>}
                          {(()=>{
                            const b=calc?.ballastNm||0;const l=calc?.ladenNm||0;
                            if(!l)return null;
                            const ets=calcEuEts(b,l,13,15,3,8,2,1,0.25,1,0.25,0,12.5,false);
                            return ets>0?<span style={{fontSize:12,color:"#fd79a8",fontWeight:600,background:"rgba(253,121,168,0.08)",border:"1px solid rgba(253,121,168,0.25)",borderRadius:3,padding:"1px 5px",whiteSpace:"nowrap"}} title="Indicative EU ETS cost (50% scope, deep-sea)">ETS ~${ets.toLocaleString()}</span>:null;
                          })()}
                        </div>
                      </>}
                      {!cargo&&<div style={{marginLeft:8,fontSize:13,color:C.faint,fontStyle:"italic"}}>No fixture - vessel open</div>}
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
        {tab==="notes"&&(
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
            <NotesTab/>
          </div>
        )}
        {tab==="cal"&&<CalendarTab/>}
        {tab==="settings"&&<SettingsTab/>}
        {tab==="reports"&&<ReportsTab selectedVessels={Array.from(selVessels)} selectedCargoes={Array.from(selCargoes)}/>}
        {tab==="map"&&<FreightMapTab/>}
      </div>

      {/* Vessel Popout */}
      {showVesselPopout && popoutVessel && (
        <VesselPopout
          vessel={popoutVessel}
          onClose={() => {
            setShowVesselPopout(false);
            setPopoutVessel(null);
          }}
          onUpdate={() => {
            // Refresh vessels list to show updated tags
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Context Menu for Right-Click */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            background: C.bg2,
            border: "1px solid " + C.bd,
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            zIndex: 10000,
            minWidth: 180
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div
            onClick={() => {
              setPopoutVessel(contextMenu.vessel);
              setShowVesselPopout(true);
              setContextMenu(null);
            }}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              color: C.tx,
              cursor: "pointer",
              borderBottom: "1px solid " + C.bd
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.bg3}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            📋 View Details & Notes
          </div>
          <div
            onClick={() => {
              // Quick copy vessel name
              navigator.clipboard.writeText(contextMenu.vessel.vessel);
              setContextMenu(null);
            }}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              color: C.tx,
              cursor: "pointer"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.bg3}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            📝 Copy Vessel Name
          </div>
        </div>
      )}

      {/* Vessel Popout Modal */}
      {showVesselPopout && popoutVessel && (
        <VesselPopout
          vessel={popoutVessel}
          onClose={() => {
            setShowVesselPopout(false);
            setPopoutVessel(null);
          }}
          onUpdate={(updatedVessel) => {
            // Refresh will happen automatically via Supabase realtime
            // or trigger a manual refresh here if needed
            setShowVesselPopout(false);
            setPopoutVessel(null);
          }}
        />
      )}
    </div>
  );
}

export default DesktopApp;
