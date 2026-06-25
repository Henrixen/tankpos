import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { C, OP_COLORS, isMobile } from "./constants";
import { toTCase, fmtN, isOpenPPT, classifyRegion, daysBetween, normaliseQty, fmtDateShort, fmtFreight, calcVoyage, calcEuEts } from "./utils";
import { loadHistory } from "./supabaseHelpers";
import { supabase } from "./supabaseclient";
import { getUsageCache, fetchUsageTotals } from "./aiUsage";

// Every component lazy-loaded to fully break circular dependency chains
const EC             = React.lazy(()=>import("./EC"));
const ParsePanel     = React.lazy(()=>import("./ParsePanel"));
const AskAIStrip     = React.lazy(()=>import("./AIAsk").then(m=>({default:m.AskAIStrip})));
const RateMatrix     = React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrix})));
const RateMatrixBunkerInput = React.lazy(()=>import("./RateMatrix").then(m=>({default:m.RateMatrixBunkerInput})));
const FixingTab      = React.lazy(()=>import("./FixingTab"));
const TimeCharterTab = React.lazy(()=>import("./TimeCharterTab"));
const ProjectsTab    = React.lazy(()=>import("./ProjectsTab"));
const TCECalculator  = React.lazy(()=>import("./TCECalculator").then(m=>({default:m.TCECalculator})));
const Dashboard      = React.lazy(()=>import("./Dashboard"));
const OpeningBreakdown = React.lazy(()=>import("./PositionsHelpers").then(m=>({default:m.OpeningBreakdown})));
const FixingWindow   = React.lazy(()=>import("./PositionsHelpers").then(m=>({default:m.FixingWindow})));
const FixingWindowChart = React.lazy(()=>import("./PositionsHelpers").then(m=>({default:m.FixingWindowChart})));
const ExportPanel    = React.lazy(()=>import("./PositionsHelpers").then(m=>({default:m.ExportPanel})));
const IntelVault     = React.lazy(()=>import("./IntelVault"));
const IntelVaultStrip = React.lazy(()=>import("./IntelVault").then(m=>({default:m.IntelVaultStrip})));
const AISMap         = React.lazy(()=>import("./AISMap"));
const MatrixTable    = React.lazy(()=>import("./components/ui/MatrixTable"));
const NotesTab       = React.lazy(()=>import("./NotesTab"));
const CalendarTab    = React.lazy(()=>import("./CalendarTab"));
const SettingsTab    = React.lazy(()=>import("./SettingsTab"));
const ReportsTab     = React.lazy(()=>import("./ReportsTab"));
const FreightMapTab  = React.lazy(()=>import("./FreightMapTab"));
const VesselPopout   = React.lazy(()=>import("./VesselPopout"));
const ClientsTab     = React.lazy(()=>import("./ClientsTab"));
const VesselUploader = React.lazy(()=>import("./VesselUploader"));
const NewbuildsTab   = React.lazy(()=>import("./NewbuildsTab"));

const TabFallback = ()=>null;



// PanelEC — div-based click-to-edit cell for the vessel popout (EC is <td>-only, breaks in flex)
function PanelEC({value,color,placeholder,onSave}){
  const [editing,setEditing]=React.useState(false);
  const [draft,setDraft]=React.useState("");
  const ref=React.useRef(null);
  function start(){setDraft(value||"");setEditing(true);setTimeout(()=>{ref.current?.focus();ref.current?.select?.();},15);}
  function commit(){setEditing(false);const t=(draft||"").trim();if(t!==(value||""))onSave?.(t);}
  if(editing)return(
    <input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e=>{e.stopPropagation();if(e.key==="Enter"){e.preventDefault();commit();}if(e.key==="Escape"){e.preventDefault();setEditing(false);}}}
      placeholder={placeholder||""}
      style={{width:140,background:"#0f1d33",border:"1px solid #2a4a7f",borderRadius:4,color:"#e6edf7",fontSize:12,padding:"2px 6px",outline:"none",fontFamily:"inherit",textAlign:"right"}}/>
  );
  return(
    <span onClick={start} title="Click to edit"
      style={{fontSize:12,color:value?(color||"#e6edf7"):"#4a5a78",cursor:"text",textAlign:"right",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
      {value||placeholder||"—"}
    </span>
  );
}

// TagCell helpers
const PRESET_TAGS=["AG","CPP","DPP","EX ASIA","MED","PARCEL","TA","UKC","WAF","OUTSIDER EUROPE","SPACE ASIA-EUROPE"];

// DWT display: always full number with space thousands (e.g. 15 212), handling
// raw numbers (15212) and feed "8K"/"26K" strings alike.
function fmtDwtFull(raw){
  if(raw==null||raw==="")return "";
  let n;
  if(typeof raw==="number")n=raw;
  else{
    const s=String(raw).trim().toUpperCase().replace(/\s/g,"");
    if(/^\d+(\.\d+)?K$/.test(s))n=parseFloat(s)*1000;
    else n=parseFloat(s.replace(/[^\d.]/g,""));
  }
  if(!isFinite(n)||n<=0)return String(raw);
  return Math.round(n).toLocaleString("en-US").replace(/,/g," ");
}

// Coating display map — keep full value in DB, show short code in UI
const COATING_DISPLAY={"STAINLESS STEEL":"STST","MARINELINE":"MARINE","EPOXY":"EPOXY","ZINC":"ZINC"};
function fmtCoating(c){if(!c)return "";const k=String(c).trim().toUpperCase();return COATING_DISPLAY[k]||c;}
function getTagList(){try{const c=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");return[...new Set([...PRESET_TAGS,...c].map(t=>(t||"").toUpperCase()))].sort();}catch{return PRESET_TAGS.slice();}}
function addCustomTag(t){try{t=(t||"").toUpperCase();const c=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");if(!c.includes(t))localStorage.setItem("signal_custom_tags",JSON.stringify([...c,t]));}catch{}}
function getTagScopes(){try{return JSON.parse(localStorage.getItem("signal_tag_scopes")||"{}");}catch{return{};}}
function setTagScope(t,scope){try{const s=getTagScopes();if(scope==="both")delete s[t];else s[t]=scope;localStorage.setItem("signal_tag_scopes",JSON.stringify(s));}catch{}}
function getTagScope(t){return getTagScopes()[t]||"both";}
function getTagListFor(view){ // view: "cargo" | "position"
  const all=getTagList();
  const scopes=getTagScopes();
  return all.filter(t=>{const s=scopes[t]||"both";return s==="both"||s===view;});
}
function removeCustomTag(t){try{const c=JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");localStorage.setItem("signal_custom_tags",JSON.stringify(c.filter(x=>x!==t)));}catch{}}
function getTagColors(){try{return JSON.parse(localStorage.getItem("signal_tag_colors")||"{}");} catch{return {};}}
function setTagColor(t,col){try{const c=getTagColors();c[t]=col;localStorage.setItem("signal_tag_colors",JSON.stringify(c));}catch{}}
function getTagColor(t){const c=getTagColors();return c[t]||null;}

// TagCell — proper component so useState works in renderRow
const TAG_PALETTE=["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#f43f5e","#06b6d4"];
function TagCell({cargoId,tag,onUpdateC}){
  const [open,setOpen]=useState(false);
  const [editMode,setEditMode]=useState(null);
  const [colorPick,setColorPick]=useState(null); // tag name being color-edited
  const btnRef=React.useRef(null);
  const [pos,setPos]=useState({top:0,left:0});
  const [tagList,setTagList]=useState(()=>getTagListFor("cargo"));
  const [tagColors,setTagColors]=useState(getTagColors);

  function openPick(e){
    e.stopPropagation();
    setTagList(getTagListFor("cargo"));
    setTagColors(getTagColors());
    if(btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      const popW=160; const popH=240;
      // Prefer opening directly below the button, left-aligned
      let left=r.left;
      if(left+popW>window.innerWidth-8) left=Math.max(4,window.innerWidth-popW-8);
      let top=r.bottom+4;
      if(top+popH>window.innerHeight-8) top=Math.max(4,r.top-popH-4);
      setPos({top,left});
    }
    setOpen(v=>!v);
    setEditMode(null); setColorPick(null);
  }
  function pick(t){onUpdateC(cargoId,"tag",t);setOpen(false);}
  function addNew(val){const t=val.trim();if(!t)return;addCustomTag(t);onUpdateC(cargoId,"tag",t);setTagList(getTagListFor("cargo"));setOpen(false);}
  function delTag(t,e){e.stopPropagation();removeCustomTag(t);setTagList(getTagListFor("cargo"));if(tag===t)onUpdateC(cargoId,"tag","");}
  function renameTag(o,nw){if(!nw.trim()||nw===o)return;removeCustomTag(o);addCustomTag(nw.trim());setTagList(getTagListFor("cargo"));if(tag===o)onUpdateC(cargoId,"tag",nw.trim());setEditMode(null);}
  const cur=tag||"";
  const curCol=cur?getTagColor(cur):null;
  return(
    <td style={{padding:"2px 4px",verticalAlign:"middle",borderBottom:"1px solid rgba(255,255,255,0.035)"}} onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} onClick={openPick}
        style={{background:curCol?curCol+"22":cur?"rgba(88,166,255,0.15)":"transparent",
          border:"1px solid "+(curCol||( cur?"rgba(88,166,255,0.4)":"rgba(88,166,255,0.12)")),
          borderRadius:3,color:curCol||( cur?"#79c0ff":"rgba(120,160,220,0.25)"),
          fontSize:10,fontWeight:cur?700:400,padding:"1px 5px",cursor:"pointer",
          fontFamily:"inherit",whiteSpace:"nowrap",maxWidth:76,overflow:"hidden",textOverflow:"ellipsis"}}>
        {cur||"＋"}
      </button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setOpen(false)}/>
          <div style={{position:"fixed",top:pos.top,left:pos.left,zIndex:9999,background:"#0a1628",
            border:"1px solid rgba(88,166,255,0.3)",borderRadius:7,padding:"6px",
            boxShadow:"0 8px 28px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",gap:2,minWidth:150}}>
            {cur&&<button onClick={()=>{onUpdateC(cargoId,"tag","");setOpen(false);}}
              style={{fontSize:10,padding:"2px 6px",borderRadius:3,border:"1px solid rgba(255,107,107,0.3)",
                background:"transparent",color:"rgba(255,107,107,0.6)",cursor:"pointer",
                fontFamily:"inherit",textAlign:"left",marginBottom:2}}>✕ clear</button>}
            {tagList.map(t=>{
              const tCol=tagColors[t]||null;
              return(
                <button key={t} onClick={()=>pick(t)}
                  style={{fontSize:11,padding:"3px 8px",borderRadius:3,textAlign:"left",cursor:"pointer",fontFamily:"inherit",
                    border:"1px solid "+(cur===t?(tCol||"rgba(88,166,255,0.5)"):(tCol?tCol+"55":"rgba(88,166,255,0.12)")),
                    background:cur===t?(tCol?tCol+"33":"rgba(88,166,255,0.2)"):"transparent",
                    color:cur===t?(tCol||"#79c0ff"):(tCol||"rgba(160,200,255,0.7)"),
                    fontWeight:cur===t?700:400}}>
                  {tCol&&<span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:tCol,marginRight:5,verticalAlign:"middle"}}/>}
                  {t}
                </button>
              );
            })}
            <input placeholder="New tag + Enter"
              onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addNew(e.target.value);e.target.value="";}if(e.key==="Escape")setOpen(false);}}
              style={{fontSize:10,padding:"3px 5px",borderRadius:3,border:"1px solid rgba(88,166,255,0.2)",background:"rgba(8,16,32,0.9)",color:"#cde",fontFamily:"inherit",outline:"none",marginTop:4}}/>
            <div style={{fontSize:9,color:"rgba(88,166,255,0.3)",marginTop:3,textAlign:"center",cursor:"pointer"}}
              onClick={()=>setOpen(false)}>
              Manage tags in Settings →
            </div>
          </div>
        </>
      )}
    </td>
  );
}

function TagCellV({vesselName,tag,onUpdateV}){
  const [open,setOpen]=useState(false);
  const [tagList,setTagList]=useState(()=>getTagListFor("position"));
  const [tagColors,setTagColors]=useState(getTagColors);

  function openPick(e){
    e.stopPropagation();
    setTagList(getTagListFor("position"));
    setTagColors(getTagColors());
    setOpen(v=>!v);
  }
  function pick(t){onUpdateV(vesselName,"tag",t);setOpen(false);}
  function addNew(val){const t=val.trim();if(!t)return;addCustomTag(t);onUpdateV(vesselName,"tag",t);setTagList(getTagListFor("position"));setOpen(false);}
  const cur=tag||"";
  const curCol=cur?getTagColor(cur):null;
  return(
    <td style={{padding:"2px 4px",verticalAlign:"middle",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.035)",position:"relative"}} onClick={e=>e.stopPropagation()}>
      <button onClick={openPick}
        style={{background:curCol?curCol+"22":cur?"rgba(88,166,255,0.15)":"transparent",
          border:"1px solid "+(curCol||( cur?"rgba(88,166,255,0.4)":"rgba(88,166,255,0.12)")),
          borderRadius:3,color:curCol||( cur?"#79c0ff":"rgba(120,160,220,0.25)"),
          fontSize:10,fontWeight:cur?700:400,padding:"1px 5px",cursor:"pointer",
          fontFamily:"inherit",whiteSpace:"nowrap",maxWidth:76,overflow:"hidden",textOverflow:"ellipsis"}}>
        {cur?cur.toUpperCase():"＋"}
      </button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setOpen(false)}/>
          <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,zIndex:9999,background:"#0a1628",
            border:"1px solid rgba(88,166,255,0.3)",borderRadius:7,padding:"6px",
            boxShadow:"0 8px 28px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",gap:2,minWidth:150}}>
            {cur&&<button onClick={()=>{onUpdateV(vesselName,"tag","");setOpen(false);}}
              style={{fontSize:10,padding:"2px 6px",borderRadius:3,border:"1px solid rgba(255,107,107,0.3)",
                background:"transparent",color:"rgba(255,107,107,0.6)",cursor:"pointer",
                fontFamily:"inherit",textAlign:"left",marginBottom:2}}>✕ clear</button>}
            {tagList.map(t=>{
              const tCol=tagColors[t]||null;
              return(
                <button key={t} onClick={()=>pick(t)}
                  style={{fontSize:11,padding:"3px 8px",borderRadius:3,textAlign:"left",cursor:"pointer",fontFamily:"inherit",
                    border:"1px solid "+(cur===t?(tCol||"rgba(88,166,255,0.5)"):(tCol?tCol+"55":"rgba(88,166,255,0.12)")),
                    background:cur===t?(tCol?tCol+"33":"rgba(88,166,255,0.2)"):"transparent",
                    color:cur===t?(tCol||"#79c0ff"):(tCol||"rgba(160,200,255,0.7)"),
                    fontWeight:cur===t?700:400}}>
                  {tCol&&<span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:tCol,marginRight:5,verticalAlign:"middle"}}/>}
                  {t}
                </button>
              );
            })}
            <input placeholder="New tag + Enter"
              onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addNew(e.target.value);e.target.value="";}if(e.key==="Escape")setOpen(false);}}
              style={{fontSize:10,padding:"3px 5px",borderRadius:3,border:"1px solid rgba(88,166,255,0.2)",background:"rgba(8,16,32,0.9)",color:"#cde",fontFamily:"inherit",outline:"none",marginTop:4}}/>
            <div style={{fontSize:9,color:"rgba(88,166,255,0.3)",marginTop:3,textAlign:"center",cursor:"pointer"}}
              onClick={()=>setOpen(false)}>
              Manage tags in Settings →
            </div>
          </div>
        </>
      )}
    </td>
  );
}

// BunkerHeader — bunker input + refresh button for MGO ARA price
// Pre-initialize bunker state from localStorage so RateMatrixBunkerInput gets it on mount
if(!window._bunkerState){
  const stored=localStorage.getItem("signal_bunker_price");
  const p=stored?parseInt(stored):1100;
  window._bunkerState={val:p>0?p:1100,listeners:[]};
}

function BunkerHeader(){
  const [fetching,setFetching]=useState(false);
  const [lastPrice,setLastPrice]=useState(null);
  const [fetchErr,setFetchErr]=useState(null);

  // Load persisted bunker price on mount and push into RateMatrix state
  React.useEffect(()=>{
    const stored=localStorage.getItem("signal_bunker_price");
    if(stored){
      const p=parseInt(stored);
      if(p>0){
        if(!window._bunkerState) window._bunkerState={val:p,listeners:[]};
        window._bunkerState.val=p;
        window._bunkerState.listeners.forEach(cb=>cb(p));
      }
    }
  },[]);

  function pushPrice(price){
    setLastPrice(price);
    localStorage.setItem("signal_bunker_price",String(price));
    if(!window._bunkerState) window._bunkerState={val:price,listeners:[]};
    window._bunkerState.val=price;
    window._bunkerState.listeners.forEach(cb=>cb(price));
  }

  async function fetchMGO(){
    setFetching(true); setFetchErr(null);
    try{
      // Fetch via allorigins proxy to avoid CORS
      const url=encodeURIComponent("https://www.bunkerindex.com/rss/prices.php");
      const res=await fetch(`https://api.allorigins.win/get?url=${url}`);
      const data=await res.json();
      const xml=data.contents||"";
      // Parse titles from RSS XML
      const titles=[...xml.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g)].map(m=>m[1]);
      const json={items:titles.map(t=>({title:t}))};
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
                pushPrice(price);
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
              pushPrice(price);
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
      <Suspense fallback={null}><RateMatrixBunkerInput/></Suspense>
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

function TagManager(){
  const [tags,setTags]=React.useState(getTagList);
  const [colors,setColors]=React.useState(getTagColors);
  const [scopes,setScopes]=React.useState(getTagScopes);
  const [editTag,setEditTag]=React.useState(null);
  const [colorPick,setColorPick]=React.useState(null);
  function refresh(){setTags(getTagList());setColors(getTagColors());setScopes(getTagScopes());}
  const isPreset=t=>PRESET_TAGS.includes(t);
  const scopeOpts=[{v:"both",label:"Both"},{v:"cargo",label:"Cargoes"},{v:"position",label:"Positions"}];
  return(
    <div style={{background:C.bg3,border:"1px solid "+C.bd2,borderRadius:8,padding:"14px 16px",maxWidth:680}}>
      <div style={{borderBottom:"1px solid rgba(58,130,246,0.14)",paddingBottom:10,marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"rgba(120,160,220,0.7)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:4}}>Tag Management</div>
        <div style={{fontSize:12,color:"rgba(180,200,230,0.45)"}}>Set whether each tag applies to Cargoes, Positions, or Both.</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {tags.map(t=>{
          const tCol=colors[t]||null;
          const scope=scopes[t]||"both";
          return(
            <div key={t} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:C.bg2,borderRadius:6,border:"1px solid "+C.bd2}}>
              <div style={{position:"relative"}}>
                <button onClick={()=>setColorPick(colorPick===t?null:t)}
                  style={{width:16,height:16,borderRadius:"50%",background:tCol||"rgba(88,166,255,0.2)",border:"2px solid "+(tCol||"rgba(88,166,255,0.3)"),cursor:"pointer",padding:0,flexShrink:0}} title="Set colour"/>
                {colorPick===t&&(
                  <>
                    <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setColorPick(null)}/>
                    <div style={{position:"absolute",left:22,top:0,zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:7,padding:"8px",display:"flex",flexWrap:"wrap",gap:5,width:136,boxShadow:"0 4px 20px rgba(0,0,0,0.7)"}}>
                      {TAG_PALETTE.map(col=>(
                        <button key={col} onClick={()=>{setTagColor(t,col);setColorPick(null);refresh();}}
                          style={{width:22,height:22,borderRadius:"50%",background:col,border:tCol===col?"2.5px solid white":"2px solid transparent",cursor:"pointer",padding:0}}/>
                      ))}
                      {tCol&&<button onClick={()=>{const c=getTagColors();delete c[t];localStorage.setItem("signal_tag_colors",JSON.stringify(c));setColorPick(null);refresh();}}
                        style={{fontSize:9,padding:"2px 6px",borderRadius:4,border:"1px solid rgba(255,107,107,0.4)",background:"transparent",color:"rgba(255,107,107,0.6)",cursor:"pointer",fontFamily:"inherit",width:"100%"}}>reset colour</button>}
                    </div>
                  </>
                )}
              </div>
              {editTag===t?(
                <input autoFocus defaultValue={t}
                  style={{width:160,fontSize:12,padding:"2px 6px",borderRadius:4,border:"1px solid rgba(88,166,255,0.4)",background:"rgba(8,16,32,0.9)",color:"#cde",fontFamily:"inherit",outline:"none"}}
                  onBlur={e=>{if(e.target.value.trim()&&e.target.value!==t){removeCustomTag(t);addCustomTag(e.target.value.trim());}setEditTag(null);refresh();}}
                  onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditTag(null);}}/>
              ):(
                <span style={{width:160,fontSize:12,color:tCol||"rgba(160,200,255,0.7)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} onClick={()=>!isPreset(t)&&setEditTag(t)}>
                  {tCol&&<span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:tCol,marginRight:6,verticalAlign:"middle"}}/>}
                  {t}{isPreset(t)&&<span style={{fontSize:9,color:C.faint,marginLeft:6}}>preset</span>}
                </span>
              )}
              <div style={{width:1,height:18,background:C.bd2,flexShrink:0}}/>
              <div style={{display:"flex",gap:2,background:"rgba(8,16,32,0.6)",borderRadius:5,padding:2}}>
                {scopeOpts.map(o=>(
                  <button key={o.v} onClick={()=>{setTagScope(t,o.v);refresh();}}
                    style={{fontSize:10,padding:"2px 7px",borderRadius:4,border:"none",cursor:"pointer",fontFamily:"inherit",
                      background:scope===o.v?"rgba(88,166,255,0.25)":"transparent",
                      color:scope===o.v?"#79c0ff":C.faint,fontWeight:scope===o.v?700:400}}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div style={{width:1,height:18,background:C.bd2,flexShrink:0}}/>
              <div style={{width:44,display:"flex",flexShrink:0}}>
                {!isPreset(t)&&editTag!==t&&(
                  <>
                    <button onClick={()=>setEditTag(t)} style={{background:"none",border:"none",color:"rgba(120,160,220,0.4)",fontSize:11,cursor:"pointer",padding:"0 4px"}} title="Rename">✎</button>
                    <button onClick={()=>{if(window.confirm(`Delete tag "${t}"? This removes it from the tag list (existing items keep the tag text until changed).`)){removeCustomTag(t);refresh();}}} style={{background:"none",border:"none",color:"rgba(255,107,107,0.4)",fontSize:11,cursor:"pointer",padding:"0 4px"}} title="Delete">✕</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div style={{display:"flex",gap:6,marginTop:4}}>
          <input placeholder="Add new tag…" id="newTagInput"
            style={{flex:1,fontSize:12,padding:"5px 8px",borderRadius:5,border:"1px solid rgba(88,166,255,0.2)",background:"rgba(8,16,32,0.8)",color:"#cde",fontFamily:"inherit",outline:"none"}}
            onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addCustomTag(e.target.value.trim());e.target.value="";refresh();}}}/>
          <button onClick={()=>{const i=document.getElementById("newTagInput");if(i&&i.value.trim()){addCustomTag(i.value.trim());i.value="";refresh();}}}
            style={{fontSize:12,padding:"5px 12px",borderRadius:5,border:"1px solid rgba(88,166,255,0.3)",background:"rgba(88,166,255,0.1)",color:"#79c0ff",cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

// AI Credit tracker — shows estimated remaining balance
const STARTING_BALANCE_KEY = "signal_ai_starting_balance";
function AICreditWidget(){
  const [usage,setUsage]=React.useState(getUsageCache);
  const [starting,setStarting]=React.useState(()=>{
    const s=localStorage.getItem(STARTING_BALANCE_KEY);
    return s?parseFloat(s):9.38; // default to current known balance
  });
  const [editing,setEditing]=React.useState(false);
  const [editVal,setEditVal]=React.useState("");

  // Refresh from Supabase every 60s
  React.useEffect(()=>{
    fetchUsageTotals().then(t=>setUsage(t));
    const interval=setInterval(()=>fetchUsageTotals().then(t=>setUsage(t)),60000);
    return()=>clearInterval(interval);
  },[]);

  const remaining=Math.max(0,starting-usage.total);
  const pct=starting>0?Math.min(100,remaining/starting*100):100;
  const barCol=pct>50?"#43e97b":pct>20?"#faa356":"#ef4444";

  function saveBalance(v){
    const n=parseFloat(v);
    if(!isNaN(n)&&n>=0){
      setStarting(n);
      localStorage.setItem(STARTING_BALANCE_KEY,String(n));
    }
    setEditing(false);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:2,padding:"4px 10px",
      background:"rgba(8,16,32,0.6)",border:"1px solid rgba(58,130,246,0.15)",
      borderRadius:7,minWidth:150,cursor:"pointer"}}
      title="Click balance to update starting amount">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <span style={{fontSize:9,fontWeight:700,color:"rgba(120,160,220,0.45)",textTransform:"uppercase",letterSpacing:"0.08em"}}>API Credits</span>
        {editing?(
          <input autoFocus defaultValue={starting.toFixed(2)}
            onBlur={e=>saveBalance(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")saveBalance(e.target.value);if(e.key==="Escape")setEditing(false);}}
            style={{width:60,fontSize:11,background:"rgba(8,16,32,0.9)",border:"1px solid rgba(88,166,255,0.4)",
              borderRadius:3,color:"#cde",padding:"1px 5px",fontFamily:"inherit",outline:"none",textAlign:"right"}}/>
        ):(
          <span style={{fontSize:11,fontWeight:700,color:barCol,cursor:"pointer"}}
            onClick={()=>{setEditVal(starting.toFixed(2));setEditing(true);}}>
            ${remaining.toFixed(2)} left
          </span>
        )}
      </div>
      {/* Progress bar */}
      <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2}}>
        <div style={{height:"100%",borderRadius:2,background:barCol,width:pct+"%",transition:"width 0.5s"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(100,140,180,0.4)"}}>
        <span>Today ${usage.today.toFixed(3)}</span>
        <span>Month ${usage.month.toFixed(3)}</span>
      </div>
    </div>
  );
}

const INP_INLINE={background:"rgba(8,16,32,0.85)",border:"1px solid rgba(88,166,255,0.25)",borderRadius:4,color:"rgba(200,220,255,0.9)",fontFamily:"Inter,sans-serif",fontSize:11,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"};

function AddVesselInlineRow({onSave,onClose}){
  const now=new Date();
  const today=now.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const [vals,setVals]=useState({vessel:"",openPort:"",date:today,operator:"",dwt:"",coating:"",comment:""});
  const firstRef=useRef(null);
  useEffect(()=>{firstRef.current?.focus();},[]);
  function upd(k,v){setVals(p=>({...p,[k]:v}));}
  async function save(){
    if(!vals.vessel.trim()||!vals.openPort.trim()) return;
    await onSave({vessel:vals.vessel.trim().toUpperCase(),openPort:vals.openPort.trim().toUpperCase(),date:vals.date||today,operator:vals.operator||null,dwt:vals.dwt?parseInt(vals.dwt):null,coating:vals.coating||null,comment:vals.comment||null,entered_by:localStorage.getItem("signal_user")||"H"});
    onClose();
  }
  const TC={borderBottom:"2px solid rgba(67,233,123,0.35)",padding:"2px 3px",background:"rgba(10,24,52,0.9)"};
  return(
    <table style={{width:"100%",borderCollapse:"collapse",background:"rgba(22,45,88,0.5)",borderTop:"2px solid rgba(67,233,123,0.4)"}}>
      <tbody>
        <tr>
          <td style={{...TC,width:32,textAlign:"center"}}><span style={{color:"#43e97b",fontSize:12,fontWeight:700}}>+</span></td>
          <td style={{...TC,width:140}}><input ref={firstRef} value={vals.operator} onChange={e=>upd("operator",e.target.value)} placeholder="Operator" onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:140}}><input value={vals.vessel} onChange={e=>upd("vessel",e.target.value)} placeholder="Vessel *" onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={{...INP_INLINE,color:"#79c0ff",fontWeight:700}}/></td>
          <td style={{...TC,width:55}}><input value={vals.dwt} onChange={e=>upd("dwt",e.target.value)} placeholder="DWT" onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:80}}><input value={vals.coating} onChange={e=>upd("coating",e.target.value)} placeholder="Coating" onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:96}}><input value={vals.date} onChange={e=>upd("date",e.target.value)} onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={{...INP_INLINE,color:"#a8e6a3"}}/></td>
          <td style={{...TC,width:140}}><input value={vals.openPort} onChange={e=>upd("openPort",e.target.value)} placeholder="Open port *" onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={{...INP_INLINE,color:"#79c0ff"}}/></td>
          <td style={{...TC}}><input value={vals.comment} onChange={e=>upd("comment",e.target.value)} placeholder="Comment" onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:86,textAlign:"center"}}>
            <button onClick={save} style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:3,border:"1px solid rgba(67,233,123,0.5)",background:"rgba(67,233,123,0.12)",color:"#43e97b",cursor:"pointer",fontFamily:"inherit"}}>Save</button>
            {" "}
            <button onClick={onClose} style={{fontSize:10,padding:"3px 5px",borderRadius:3,border:"1px solid rgba(255,107,107,0.3)",background:"transparent",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function AddCargoInlineRow({onSave,onClose}){
  const now=new Date();
  const valsRef=useRef({charterer:"",cargo:"",qty:"",load:"",disch:"",from:"",to:"",freight:"",vessel:"",status:""});
  const firstRef=useRef(null);
  useEffect(()=>{firstRef.current?.focus();},[]);

  async function trySave(){
    const v=valsRef.current;
    if(!v.charterer?.trim()&&!v.cargo?.trim()) return; // empty row — just close
    if(v.charterer?.trim()||v.cargo?.trim()){
      await onSave({charterer:v.charterer?.trim()||"",cargo:v.cargo?.trim()||"",qty:v.qty||null,load:v.load||null,disch:v.disch||null,from:v.from||null,to:v.to||null,freight:v.freight||null,vessel:v.vessel||null,status:v.status?.toUpperCase()||null,updated:now.toISOString(),entered_by:localStorage.getItem("signal_user")||"H"});
    }
    onClose();
  }

  const TC={borderBottom:"1px solid rgba(250,163,86,0.25)",padding:"0",background:"rgba(35,20,5,0.85)"};
  const inp=(k,ph,w,extra)=>(
    <td key={k} style={{...TC,width:w||undefined}}>
      <input ref={k==="charterer"?firstRef:undefined}
        defaultValue=""
        placeholder={ph}
        onChange={e=>{valsRef.current[k]=e.target.value;}}
        onKeyDown={e=>{if(e.key==="Escape")onClose();}}
        onBlur={e=>{
          // Save when focus leaves the entire row (check if new focus is still in row)
          setTimeout(()=>{
            const active=document.activeElement;
            if(!active||!active.closest(".cargo-new-row")) trysave_ref.current?.();
          },80);
        }}
        style={{...INP_INLINE,...(extra||{})}}/>
    </td>
  );
  const tryave_ref=useRef(tryave);
  function tryave(){trySave();}
  const tryave_refObj=useRef(null);
  tryave_refObj.current=trySave;

  // Simpler: just save on blur with a delay check
  const rowRef=useRef(null);

  return(
    <table ref={rowRef} style={{width:"100%",borderCollapse:"collapse",borderBottom:"2px solid rgba(250,163,86,0.3)"}} className="cargo-new-row">
      <tbody>
        <tr style={{background:"rgba(40,22,4,0.9)"}}>
          <td style={{...TC,width:28,textAlign:"center",paddingLeft:4}}><span style={{color:"#faa356",fontSize:11}}>✦</span></td>
          <td style={{...TC,width:56}}><input defaultValue="" placeholder="Status" onChange={e=>{valsRef.current.status=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:110}}><input defaultValue="" placeholder="Vessel" onChange={e=>{valsRef.current.vessel=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:120}}><input ref={firstRef} defaultValue="" placeholder="Charterer" onChange={e=>{valsRef.current.charterer=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={{...INP_INLINE,fontWeight:700}}/></td>
          <td style={{...TC,width:60}}><input defaultValue="" placeholder="Qty" onChange={e=>{valsRef.current.qty=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:80}}><input defaultValue="" placeholder="Cargo" onChange={e=>{valsRef.current.cargo=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={{...INP_INLINE,color:"#faa356"}}/></td>
          <td style={{...TC,width:100}}><input defaultValue="" placeholder="Load" onChange={e=>{valsRef.current.load=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:100}}><input defaultValue="" placeholder="Disch" onChange={e=>{valsRef.current.disch=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:78}}><input defaultValue="" placeholder="From" onChange={e=>{valsRef.current.from=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:78}}><input defaultValue="" placeholder="To" onChange={e=>{valsRef.current.to=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC}}><input defaultValue="" placeholder="Freight" onChange={e=>{valsRef.current.freight=e.target.value;}} onKeyDown={e=>{if(e.key==="Escape")onClose();}} style={INP_INLINE}/></td>
          <td style={{...TC,width:26,textAlign:"center"}}>
            <button onMouseDown={e=>{e.preventDefault();trySave();}}
              style={{background:"none",border:"none",color:"#43e97b",cursor:"pointer",fontSize:11,padding:"2px 4px"}} title="Save (Enter)">✓</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function AddVesselModal({onSave,onClose}){
  const vals=useRef({});
  const fields=[
    {k:"vessel",label:"Vessel name",req:true},
    {k:"openPort",label:"Open port",req:true},
    {k:"date",label:"Open date (e.g. 15 Jun 2026)",req:false},
    {k:"operator",label:"Operator",req:false},
    {k:"dwt",label:"DWT",req:false,type:"number"},
    {k:"coating",label:"Coating (Epoxy / MarineLine / Stainless…)",req:false},
    {k:"comment",label:"Comment",req:false},
  ];
  async function save(){
    const v=vals.current;
    if(!v.vessel?.trim()||!v.openPort?.trim()){alert("Vessel name and open port are required.");return;}
    await onSave({vessel:v.vessel.trim(),openPort:v.openPort.trim(),date:v.date||null,operator:v.operator||null,dwt:v.dwt?parseInt(v.dwt):null,coating:v.coating||null,comment:v.comment||null});
    onClose();
  }
  const INP={width:"100%",background:"rgba(8,16,32,0.8)",border:"1px solid rgba(88,166,255,0.2)",borderRadius:5,color:"rgba(200,220,255,0.9)",fontFamily:"Inter,sans-serif",fontSize:12,padding:"7px 10px",outline:"none",boxSizing:"border-box"};
  return(
    <>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9998}} onClick={onClose}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:10,padding:"20px 24px",width:420,maxWidth:"95vw",boxShadow:"0 12px 40px rgba(0,0,0,0.7)",fontFamily:"Inter,sans-serif"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#79c0ff",marginBottom:16}}>+ Add Vessel</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {fields.map(({k,label,req,type})=>(
            <div key={k}>
              <div style={{fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{label}{req&&<span style={{color:"#ef4444",marginLeft:3}}>*</span>}</div>
              <input type={type||"text"} onChange={e=>vals.current[k]=e.target.value} style={INP}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{fontSize:12,padding:"6px 16px",borderRadius:5,border:"1px solid rgba(58,130,246,0.2)",background:"transparent",color:"rgba(120,160,220,0.6)",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={save} style={{fontSize:12,fontWeight:700,padding:"6px 18px",borderRadius:5,border:"1px solid rgba(67,233,123,0.4)",background:"rgba(67,233,123,0.1)",color:"#43e97b",cursor:"pointer",fontFamily:"inherit"}}>Save Vessel</button>
        </div>
      </div>
    </>
  );
}

function AddCargoModal({onSave,onClose}){
  const vals=useRef({});
  const fields=[
    {k:"charterer",label:"Charterer",req:true},
    {k:"cargo",label:"Cargo / grade",req:true},
    {k:"qty",label:"Quantity (e.g. 15kt)",req:false},
    {k:"load",label:"Load port",req:false},
    {k:"disch",label:"Discharge port",req:false},
    {k:"from",label:"Laycan from (dd Mon yyyy)",req:false},
    {k:"to",label:"Laycan to (dd Mon yyyy)",req:false},
    {k:"freight",label:"Freight (e.g. USD 450k ls)",req:false},
    {k:"vessel",label:"Vessel (if fixed)",req:false},
    {k:"status",label:"Status (FIXED / SUBS / OPEN)",req:false},
    {k:"comment",label:"Comment",req:false},
  ];
  async function save(){
    const v=vals.current;
    if(!v.charterer?.trim()||!v.cargo?.trim()){alert("Charterer and cargo are required.");return;}
    await onSave({charterer:v.charterer.trim(),cargo:v.cargo.trim(),qty:v.qty||null,load:v.load||null,disch:v.disch||null,from:v.from||null,to:v.to||null,freight:v.freight||null,vessel:v.vessel||null,status:v.status?.toUpperCase()||null,comment:v.comment||null});
    onClose();
  }
  const INP={width:"100%",background:"rgba(8,16,32,0.8)",border:"1px solid rgba(88,166,255,0.2)",borderRadius:5,color:"rgba(200,220,255,0.9)",fontFamily:"Inter,sans-serif",fontSize:12,padding:"7px 10px",outline:"none",boxSizing:"border-box"};
  return(
    <>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9998}} onClick={onClose}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:10,padding:"20px 24px",width:420,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 12px 40px rgba(0,0,0,0.7)",fontFamily:"Inter,sans-serif"}}>
        <div style={{fontSize:14,fontWeight:700,color:"#faa356",marginBottom:16}}>+ Add Cargo</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {fields.map(({k,label,req})=>(
            <div key={k}>
              <div style={{fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{label}{req&&<span style={{color:"#ef4444",marginLeft:3}}>*</span>}</div>
              <input onChange={e=>vals.current[k]=e.target.value} style={INP}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{fontSize:12,padding:"6px 16px",borderRadius:5,border:"1px solid rgba(58,130,246,0.2)",background:"transparent",color:"rgba(120,160,220,0.6)",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={save} style={{fontSize:12,fontWeight:700,padding:"6px 18px",borderRadius:5,border:"1px solid rgba(250,163,86,0.4)",background:"rgba(250,163,86,0.1)",color:"#faa356",cursor:"pointer",fontFamily:"inherit"}}>Save Cargo</button>
        </div>
      </div>
    </>
  );
}

function CopyPositionsButton({filtV,fmtDateShort}){
  const [copied,setCopied]=React.useState(false);
  const [fallbackText,setFallbackText]=React.useState(null);
  function buildText(){
    if(!filtV.length) return "";
    const byOp={};
    filtV.forEach(v=>{const op=v.operator||"Unknown";if(!byOp[op])byOp[op]=[];byOp[op].push(v);});
    const lines=["|| Positions ||",""];
    Object.entries(byOp).sort(([a],[b])=>a.localeCompare(b)).forEach(([op,vs])=>{
      lines.push("*"+op+"*");
      vs.forEach(v=>{const p=[v.vessel,v.openPort,fmtDateShort?fmtDateShort(v.date):v.date];if(v.comment)p.push(v.comment);lines.push(p.filter(Boolean).join(" – "));});
      lines.push("");
    });
    return lines.join("\n").trim();
  }
  function copyPositions(){
    const text=buildText();if(!text)return;
    const ta=document.createElement("textarea");
    ta.value=text;ta.setAttribute("readonly","");
    ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:none;outline:none;background:transparent;";
    document.body.appendChild(ta);ta.focus();ta.select();
    let ok=false;try{ok=document.execCommand("copy");}catch(e){}
    document.body.removeChild(ta);
    if(ok){setCopied(true);setTimeout(()=>setCopied(false),2500);return;}
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);}).catch(()=>setFallbackText(text));return;}
    setFallbackText(text);
  }
  return(<>
    <button onClick={copyPositions} style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",border:copied?"1px solid rgba(67,233,123,0.5)":"1px solid rgba(58,130,246,0.25)",background:copied?"rgba(67,233,123,0.1)":"rgba(58,130,246,0.08)",color:copied?"#43e97b":"#79c0ff"}}>
      {copied?"✓ Copied!":filtV.length>0?`Copy (${filtV.length})`:"Copy positions"}
    </button>
    {fallbackText&&(<>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9998}} onClick={()=>setFallbackText(null)}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:10,padding:"20px",width:520,maxWidth:"95vw",boxShadow:"0 12px 40px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#79c0ff",marginBottom:8}}>Select all (Ctrl+A) → Copy (Ctrl+C)</div>
        <textarea readOnly autoFocus value={fallbackText} onFocus={e=>e.target.select()} style={{width:"100%",height:280,background:"rgba(8,16,32,0.9)",border:"1px solid rgba(88,166,255,0.2)",borderRadius:5,color:"rgba(200,220,255,0.9)",fontFamily:"monospace",fontSize:11,padding:"8px",resize:"none",outline:"none",boxSizing:"border-box"}}/>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
          <button onClick={()=>setFallbackText(null)} style={{fontSize:12,padding:"5px 16px",borderRadius:5,border:"1px solid rgba(58,130,246,0.3)",background:"rgba(58,130,246,0.1)",color:"#79c0ff",cursor:"pointer",fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </>)}
  </>);
}

function SettingsMenu({mobile,onToggleLayout,layoutOverride}){
  const [open,setOpen]=React.useState(false);
  const [menuPos,setMenuPos]=React.useState({top:60,right:8});
  const btnRef=React.useRef(null);

  function handleTap(e){
    e.preventDefault();
    e.stopPropagation();
    if(btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      setMenuPos({top:r.bottom+6, right:Math.max(6,window.innerWidth-r.right)});
    }
    setOpen(v=>!v);
  }

  return(
    <>
      <button ref={btnRef}
        onPointerUp={handleTap}
        style={{
          fontSize:16,lineHeight:1,cursor:"pointer",
          padding:mobile?"8px 10px":"4px 8px",
          borderRadius:6,
          border:"1px solid rgba(58,130,246,0.25)",
          background:"transparent",
          color:"rgba(140,190,255,0.7)",
          flexShrink:0,
          WebkitTapHighlightColor:"transparent",
          touchAction:"manipulation",
          userSelect:"none",
        }}>⚙</button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:9990}} onPointerUp={()=>setOpen(false)}/>
          <div style={{
            position:"fixed",top:menuPos.top,right:menuPos.right,
            zIndex:9999,width:230,maxWidth:"calc(100vw - 16px)",
            background:"#0a1628",border:"1px solid rgba(88,166,255,0.25)",
            borderRadius:10,padding:"14px 16px",
            boxShadow:"0 12px 40px rgba(0,0,0,0.8)",
            display:"flex",flexDirection:"column",gap:14,
          }}>
            {onToggleLayout&&(
              <div>
                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>Layout</div>
                <button
                  onPointerUp={e=>{e.stopPropagation();onToggleLayout();setOpen(false);}}
                  style={{fontSize:13,fontWeight:600,padding:"10px 12px",borderRadius:7,width:"100%",
                    border:"1px solid rgba(58,130,246,0.3)",background:"rgba(58,130,246,0.1)",
                    color:"rgba(160,200,255,0.9)",cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                    WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
                  {mobile?"🖥  Switch to Desktop":"📱  Switch to Mobile"}
                  {layoutOverride&&<span style={{fontSize:9,opacity:0.45,marginLeft:8}}>override</span>}
                </button>
              </div>
            )}
            <div>
              <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>Font size</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[80,90,100,110,120].map(z=>(
                  <button key={z}
                    onPointerUp={e=>{e.stopPropagation();document.body.style.zoom=z+"%";}}
                    style={{fontSize:13,padding:"6px 10px",borderRadius:6,
                      border:"1px solid rgba(58,130,246,0.2)",background:"rgba(14,28,58,0.8)",
                      color:"rgba(160,200,255,0.8)",cursor:"pointer",fontFamily:"inherit",
                      WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
                    {z}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DesktopApp({vessels,cargoes,cargoTotal,onUpdateV,onRenameV,onUpdateC,onAddVessels,onAddCargoes,onAddV,onAddC,onDelV,onDelC,hasMore,onLoadMore,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB,offlineIndicator,mobile:mobileProp,onToggleLayout,layoutOverride}){
  // ── PIN config ───────────────────────────────────────────────────────────
  const MASTER_PIN = "4524"; // ← your PIN → full access
  const GUEST_PIN  = "0250"; // ← colleague's PIN → positions + cargoes only
  const GUEST_TABS = ["pos","cargo","clients"];

  const [unlocked, setUnlocked] = React.useState(false); // always ask on load
  const [pinInput, setPinInput] = React.useState("");
  const [pinError, setPinError] = React.useState(false);
  const [guestMode, setGuestMode] = React.useState(false);

  // No sessionStorage — PIN required on every load/refresh/new tab

  function submitPin(p){
    if(p===MASTER_PIN){
      localStorage.setItem("signal_user","H");
      setGuestMode(false);
      setUnlocked(true);
      setPinInput("");
    } else if(p===GUEST_PIN){
      localStorage.setItem("signal_user","L");
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
  const [posTagFilter,setPosTagFilter]=useState(new Set());
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
const [dwtFilter,setDwtFilter]=useState(new Set()); // multi-select Set
const [builtFilter,setBuiltFilter]=useState(new Set()); // multi-select Set
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
  const [thisWeekMon,thisWeekSun]=useMemo(()=>getWeekBounds(0),[]);
  const [lastWeekMon,lastWeekSun]=useMemo(()=>getWeekBounds(-1),[]);
  // Accurate week counts from DB (not just the first 200 loaded)
  const [weekCounts,setWeekCounts]=useState({thisWk:0,lastWk:0});
  const [graphMonthlyData,setGraphMonthlyData]=useState([]); // [{year,month,count}] from DB

  useEffect(()=>{
    async function fetchWeekCounts(){
      const fmt=d=>d.toISOString().slice(0,10);
      const[{count:tw},{count:lw}]=await Promise.all([
        supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",fmt(thisWeekMon)).lte("updated",fmt(thisWeekSun)+"T23:59:59"),
        supabase.from("cargoes").select("*",{count:"exact",head:true}).gte("updated",fmt(lastWeekMon)).lte("updated",fmt(lastWeekSun)+"T23:59:59"),
      ]);
      setWeekCounts({thisWk:tw||0,lastWk:lw||0});
    }
    fetchWeekCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Fetch monthly cargo counts — query month-by-month using date ranges (avoids field-level RLS issues)
  useEffect(()=>{
    async function fetchMonthly(){
      const now=new Date();
      const buckets=[];
      // Go back 24 months from now
      for(let i=23;i>=0;i--){
        const d=new Date(now.getFullYear(),now.getMonth()-i,1);
        const nextD=new Date(d.getFullYear(),d.getMonth()+1,1);
        const from=d.toISOString().slice(0,10);
        const to=nextD.toISOString().slice(0,10);
        const{count,error}=await supabase.from("cargoes")
          .select("*",{count:"exact",head:true})
          .gte("updated",from)
          .lt("updated",to);
        if(!error) buckets.push({year:d.getFullYear(),month:d.getMonth(),count:count||0});
      }
      const nonZero=buckets.filter(b=>b.count>0);
      console.log("fetchMonthly: buckets=",buckets.length,"nonZero=",nonZero.length,"sample=",nonZero.slice(-3));
      if(nonZero.length>0) setGraphMonthlyData(buckets.filter((_,i)=>i>=buckets.findIndex(b=>b.count>0)));
    }
    fetchMonthly();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  function inRange(dateStr,from,to){if(!dateStr)return false;const d=new Date(dateStr);d.setHours(0,0,0,0);return d>=from&&d<=to;}
  const [mxSearch,setMxSearch]=useState("");
  const [cSortK,setCsortK]=useState("updated");
  const [selCargoes,setSelCargoes]=useState(()=>new Set());const [cSortD,setCsortD]=useState(-1);
  const [selVessels,setSelVessels]=useState(()=>new Set());
  const [history,setHistory]=useState([]);
  useEffect(()=>{loadHistory().then(setHistory);},[vessels]);
  const [intelItems,setIntelItems]=useState([]);
  const [pendingDel,setPendingDel]=useState(null);
  const [showAddVessel,setShowAddVessel]=useState(false);
  const [showAddCargo,setShowAddCargo]=useState(false);
  // "Save for later" vessel set — persists in localStorage per session
  const [savedVessels,setSavedVessels]=useState(()=>{
    try{return new Set(JSON.parse(localStorage.getItem("signal_saved_vessels")||"[]"));}catch{return new Set();}
  });
  function toggleSavedVessel(name){
    setSavedVessels(prev=>{
      const next=new Set(prev);
      next.has(name)?next.delete(name):next.add(name);
      localStorage.setItem("signal_saved_vessels",JSON.stringify([...next]));
      return next;
    });
  }
  function clearSavedVessels(){setSavedVessels(new Set());localStorage.removeItem("signal_saved_vessels");}
  // Inter UKC config — loaded from localStorage (editable in Settings)
  const [showSavedOnly,setShowSavedOnly]=useState(false);
  function getInterUKCConfig(){
    try{return JSON.parse(localStorage.getItem("signal_interukc_config")||"null");}catch{return null;}
  }
  const defaultInterUKCConfig={
    dwtMin:15,dwtMax:21,
    owners:["Stenersen","Furetank","Carl F","Maersk","Harren","Navix","Donso","Relet"],
    reletsFrom:["Exxon","Shell","Circle K","Essar","Total","CSS SA"],
  };
  function applyInterUKCFilter(){
    const cfg=getInterUKCConfig()||defaultInterUKCConfig;
    setDwtFilter("15-20");
    setInterUKCActive(true);
    setShowSavedOnly(false);
    setPosPage(1);
  }
  const [interUKCActive,setInterUKCActive]=useState(false);
  const [restoreMsg,setRestoreMsg]=useState("");
  const restoreRef=useRef(null); // {type:'vessel'|'cargo'|'all', id, label}
  // Use mobile state from TankPos (reactive, with manual override) — must be before colWidths
  const mobile = mobileProp !== undefined ? mobileProp : isMobile();

  const [colWidthsV,setColWidthsV]=useState(()=>mobile?{
  Operator:null,Vessel:null,Built:null,DWT:null,Coating:null,LOA:null,Beam:null,CBM:null,Date:null,OpenPort:null,Comment:null,FileDate:null,Spec:null
  }:{
  Operator:190,Vessel:175,Built:60,DWT:72,Coating:78,LOA:62,Beam:56,CBM:78,Date:88,OpenPort:155,Comment:140,FileDate:88,Spec:72
  });
  const [colWidthsC,setColWidthsC]=useState(()=>mobile?{
  Status:55,Vessel:null,Charterer:null,Cargo:null,Qty:null,Load:null,Disch:null,LaycanStart:null,LaycanEnd:null,Freight:null,Comment:null,Updated:null
  }:{
  Status:68,Vessel:165,Charterer:165,Cargo:95,Qty:75,Load:148,Disch:148,LaycanStart:82,LaycanEnd:82,Freight:115,Comment:180,Updated:96
  });
  const [askAiExpanded,setAskAiExpanded]=useState(false);
  const [intelVaultExpanded,setIntelVaultExpanded]=useState(false);
  const [selectedAISVessels,setSelectedAISVessels]=useState([]);
  const [aisVesselSet,setAisVesselSet]=useState(new Set());
  
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
};
  const tdNum = {...td2, textAlign:"right", fontVariantNumeric:"tabular-nums", textTransform:"uppercase"};
const tdCtr = {...td2, textAlign:"center", fontVariantNumeric:"tabular-nums", textTransform:"uppercase"};
const tdTxt = {...td2, textAlign:"left", textTransform:"uppercase"};
  const tableWrap={
    border:"1px solid "+C.bd,
    borderRadius:8,
    overflow:"auto",
    WebkitOverflowScrolling:"touch",
    width:"100%",
    display:"block",
    background:C.bg2,
    boxShadow:"inset 0 1px 0 rgba(88,166,255,0.06)",
  };
  const tableStyle={width:"max-content",minWidth:mobile?"1400px":"max-content",borderCollapse:"separate",borderSpacing:0,fontSize:mobile?10:11,tableLayout:mobile?"auto":"fixed",fontFamily:"sans-serif"};
  const rowBg=i=>i%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)";
const cargoColumns = [
  { key: "select", label: "", align: "center", width: 28 },
  { key:"status",    sortKey:"Status",    label:"Status",    align:"left", width:colWidthsC.Status },
  { key:"vessel",    sortKey:"Vessel",    label:"Vessel",    align:"left", width:colWidthsC.Vessel },
  { key:"charterer", sortKey:"Charterer", label:"Charterer", align:"left", width:colWidthsC.Charterer },
  { key:"qty",       sortKey:"Qty",       label:"Qty",             align:"left", width:colWidthsC.Qty },
  { key:"cargo",     sortKey:"Cargo",     label:"Cargo",       align:"left", width:colWidthsC.Cargo },
  { key:"load",      sortKey:"Load",      label:"Load",          align:"left", width:colWidthsC.Load },
  { key:"disch",     sortKey:"Disch",     label:"Disch",       align:"left", width:colWidthsC.Disch },
  { key:"from",      sortKey:"LaycanStart",label:"From", align:"left", width:colWidthsC.LaycanStart },
  { key:"to",        sortKey:"LaycanEnd",  label:"To",   align:"left", width:colWidthsC.LaycanEnd },
  { key:"freight",   sortKey:"Freight",   label:"Freight",  align:"left", width:colWidthsC.Freight },
  { key:"comment",   sortKey:"Comment",   label:"Comment",  align:"left", width:colWidthsC.Comment },
  { key:"tag",       sortKey:"tag",       label:"Tag",            align:"left", width:80 },
  { key:"updated",   sortKey:"Updated",   label:"Updated", align:"left", width:colWidthsC.Updated },
  { key:"badge", label:"", align:"center", width:20 },
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
      // Hardcoded overrides for ports that classifyRegion gets wrong
      const port=(v.openPort||"").toUpperCase();
      const asiaports=["SINGAPORE","MALAYSIA","THAILAND","VIETNAM","CHINA","JAPAN","KOREA","INDIA","PAKISTAN","INDONESIA","PHILIPPINES","TAIWAN","HONGKONG","HONG KONG","FUJAIRAH","UAE","BAHRAIN","KUWAIT","SAUDI","JEDDAH","YANBU","JUBAIL","OMAN","MUSCAT"];
      const isAsia=asiaports.some(p=>port.includes(p));
      const hasRegionFilter=["WCUK","ECUK","CANAL","BISCAY","BALTIC","SKAW","MED"].some(r=>filters.has(r));
      if(hasRegionFilter){
        if(isAsia) return false; // Asian ports never match European region filters
        if(!reg) return false;
        for(const r of ["WCUK","ECUK","CANAL","BISCAY","BALTIC","SKAW","MED"]){
          if(filters.has(r) && reg!==r) return false;
        }
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
  if(posTagFilter.size>0){
    list=list.filter(v=>posTagFilter.has((v.tag||"").trim()));
  }

  // Inter UKC filter
  if(interUKCActive){
    const cfg=getInterUKCConfig()||defaultInterUKCConfig;
    list=list.filter(v=>{
      const dwt=parseFloat(v.dwt)||0;
      if(dwt>0&&(dwt<cfg.dwtMin*1000||dwt>cfg.dwtMax*1000)) return false;
      const op=(v.operator||"").toLowerCase();
      const isOwner=cfg.owners.some(o=>op.includes(o.toLowerCase()));
      const isRelet=cfg.reletsFrom.some(r=>op.includes(r.toLowerCase()));
      return isOwner||isRelet;
    });
  }

  // Saved filter — OR with interUKC means: show if saved OR matches interUKC
  if(showSavedOnly){
    if(interUKCActive){
      // Already have interUKC results; add any saved vessels not yet in list
      const inList=new Set(list.map(v=>v.vessel));
      const extra=vessels.filter(v=>savedVessels.has(v.vessel)&&!inList.has(v.vessel));
      list=[...list,...extra];
    } else {
      list=list.filter(v=>savedVessels.has(v.vessel));
    }
  }

  if(dwtFilter.size>0){
    list=list.filter(v=>{
      const d=parseFloat(v.dwt)||0;
      const match=v=>{
        if(v==="<10") return d<10000;
        if(v==="10-15") return d>=10000&&d<15000;
        if(v==="15-20") return d>=15000&&d<20000;
        if(v==="20-30") return d>=20000&&d<30000;
        if(v==="30-40") return d>=30000&&d<40000;
        if(v===">40") return d>=40000;
        return false;
      };
      return [...dwtFilter].some(match);
    });
  }

  if(builtFilter.size>0){
    list=list.filter(v=>{
      const b=parseInt(v.built)||0;
      const match=val=>{
        if(val==="<2005") return b>0&&b<2005;
        if(val==="2005-10") return b>=2005&&b<2010;
        if(val==="2010-15") return b>=2010&&b<2015;
        if(val==="2015-20") return b>=2015&&b<2020;
        if(val===">2020") return b>=2020;
        return false;
      };
      return [...builtFilter].some(match);
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
      if(updFilter==="7d"){const x=new Date();x.setDate(x.getDate()-7);return d>=x;}
      if(updFilter==="14d"){const x=new Date();x.setDate(x.getDate()-14);return d>=x;}
      if(updFilter==="30d"){const x=new Date();x.setDate(x.getDate()-30);return d>=x;}
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
  [...posTagFilter].join(),
  [...dwtFilter].join(),
  [...builtFilter].join(),
  interUKCActive,
  showSavedOnly,
  savedVessels,
]);

  const posColumns = [
  { 
    key: "select", 
    label: (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          const allSelected = filtV.length > 0 && filtV.every(v => selVessels.has(v.vessel));
          if (allSelected) {
            setSelVessels(new Set());
          } else {
            setSelVessels(new Set(filtV.map(v => v.vessel)));
          }
        }}
        style={{ cursor: "pointer", userSelect: "none" }}
        title="Click to toggle all"
      >
        <div style={{ fontSize: 11, color: filtV.length > 0 && filtV.every(v => selVessels.has(v.vessel)) ? "#4fc3f7" : C.faint }}>
          {filtV.length > 0 && filtV.every(v => selVessels.has(v.vessel)) ? "[✓]" : "[ ]"}
        </div>
        <div style={{ fontSize: 8, color: C.faint, marginTop: 2 }}>All</div>
      </div>
    ), 
    align: "center", 
    width: 32 
  },
  { key: "operator",  sortKey:"operator",  label: "Operator",  width: colWidthsV.Operator },
  { key: "vessel",    sortKey:"vessel",    label: "Vessel",    width: colWidthsV.Vessel },
  { key: "ais",       label: "",           align:"center",     width: 18 },
  { key: "built",     sortKey:"built",     label: "Built",     align:"left", width: colWidthsV.Built },
  { key: "dwt",       sortKey:"dwt",       label: "DWT",           align:"left", width: colWidthsV.DWT },
  { key: "coating",   sortKey:"coating",   label: "Coating", width: colWidthsV.Coating },
  { key: "loa",       sortKey:"loa",       label: "LOA",           align:"left", width: colWidthsV.LOA },
  { key: "beam",      sortKey:"beam",      label: "Beam",        align:"right", width: colWidthsV.Beam },
  { key: "cbm",       sortKey:"cbm",       label: "CBM",           align:"left", width: colWidthsV.CBM },
  { key: "date",      sortKey:"date",      label: "Date",        align:"center", width: colWidthsV.Date },
  { key: "openPort",  sortKey:"openPort",  label: "Open Port", width: colWidthsV.OpenPort },
  { key: "comment",   sortKey:"comment",   label: "Comment",  width: colWidthsV.Comment },
  { key: "updatedAt", sortKey:"fileDate",  label: "Updated", align:"center", width: colWidthsV.FileDate },
  { key: "badge", label: "", align: "center", width: 32 },
  { key: "tag", label: "Tag", align: "center", width: 70 },
  { key: "delete", label: "", align: "center", width: 24 },
];

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
  const [panelBox,setPanelBox]=useState({left:0,top:120});
  useEffect(()=>{
    if(!selV)return;
    let raf=null;
    const update=()=>{
      raf=null;
      const row=window.__posRow;
      if(!row)return;
      const tbl=row.querySelector("table");
      const rect=(tbl||row).getBoundingClientRect();
      const left=Math.min(rect.right+12, window.innerWidth-272);
      const top=Math.max(70, Math.min(rect.top, window.innerHeight-200));
      setPanelBox({left:Math.max(8,left),top});
    };
    const onScrollResize=()=>{ if(raf==null) raf=requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll",onScrollResize,true);
    window.addEventListener("resize",onScrollResize);
    return()=>{window.removeEventListener("scroll",onScrollResize,true);window.removeEventListener("resize",onScrollResize);if(raf)cancelAnimationFrame(raf);};
  },[selV]);
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
    <div style={{minHeight:"100vh",background:C.bg,color:C.tx,fontFamily:"Inter,sans-serif",fontSize:mobile?11:13}}>
      {/* Mobile globals */}
      {mobile&&<style>{`
        * { -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        html { overflow-x: hidden; }
      `}</style>}
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
        <div style={{display:"flex",alignItems:"center",gap:mobile?6:12,padding:mobile?"8px 12px 0":"10px 20px 0"}}>
          <div style={{flexShrink:0,display:"flex",flexDirection:"column",gap:1,paddingBottom:mobile?8:10}}>
            {!mobile&&<div style={{fontSize:9,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:"rgba(120,180,255,0.45)"}}>Tanker Intel Platform</div>}
            <div style={{display:"flex",alignItems:"baseline",gap:mobile?4:6}}>
              <span style={{fontSize:mobile?14:18,fontWeight:800,color:"#e8f2ff",letterSpacing:"0.02em"}}>Broker</span>
              <span style={{fontSize:mobile?14:18,fontWeight:800,color:"#43e97b",letterSpacing:"0.02em"}}>Dashboard</span>
              {!mobile&&<span style={{fontSize:10,color:"rgba(140,190,255,0.35)",marginLeft:2}}>
                {new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
              </span>}
              {guestMode&&(
                <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,
                  background:"rgba(250,163,86,0.12)",border:"1px solid rgba(250,163,86,0.3)",
                  color:"rgba(250,163,86,0.8)",letterSpacing:"0.1em",textTransform:"uppercase",marginLeft:4}}>
                  Guest
                </span>
              )}
            </div>
            {/* Inline sync status */}
            {offlineIndicator&&!mobile&&(
              <div style={{fontSize:9,color:"rgba(100,140,200,0.4)",marginTop:2,letterSpacing:"0.04em"}}>
                {offlineIndicator}
              </div>
            )}
          </div>
          {!mobile&&<div style={{width:1,background:"rgba(58,130,246,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>}
          {/* ASK AI — hidden on mobile (too small) */}
          {!mobile&&(
            <div style={{flex:1,minWidth:0,position:"relative",paddingBottom:10}}>
              <Suspense fallback={null}><AskAIStrip vessels={vessels} cargoes={cargoes} intelItems={intelItems}/></Suspense>
            </div>
          )}
          {!mobile&&<div style={{width:1,background:"rgba(58,130,246,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>}
          {/* INTEL VAULT — hidden on mobile */}
          {!mobile&&(
            <div style={{flex:1,minWidth:0,paddingBottom:10}}
              onFocusCapture={e=>{e.currentTarget.style.flex="2";e.currentTarget.style.zIndex="10";}}
              onBlurCapture={e=>{e.currentTarget.style.flex="1";e.currentTarget.style.zIndex="";}}
            >
              <Suspense fallback={null}><IntelVaultStrip onVaultUpdate={setIntelItems}/></Suspense>
            </div>
          )}
          {!mobile&&<div style={{width:1,background:"rgba(58,130,246,0.15)",alignSelf:"stretch",margin:"0 4px"}}/>}          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0,paddingBottom:10}}>
            {!mobile&&<AICreditWidget/>}
            {/* ⚙ Settings dropdown */}
            <SettingsMenu mobile={mobile} onToggleLayout={onToggleLayout} layoutOverride={layoutOverride}/>
          </div>
        </div>
        {/* Tab navigation row */}
        <div style={{
          display:"flex",alignItems:"stretch",
          padding:mobile?"0 8px":"0 20px",
          gap:0,
          overflowX:mobile?"auto":"visible",
          overflowY:"visible",
          WebkitOverflowScrolling:"touch",
          scrollbarWidth:"none",
          msOverflowStyle:"none",
          touchAction:mobile?"pan-x":"auto",
        }}>
          {[
            ["pos","Positions",vessels.length,"#58a6ff"],
            ["cargo","Cargoes",cargoTotal||cargoes.length,"#faa356"],
            ["fix","Fixing",0,"#c792ea"],
            ["tcv","Time Charter",0,"#fb923c"],
            ["clients","Clients",0,"#a8e6a3"],
            ["matrix","Matrix",0,"#43e97b"],
            ["projects","Projects",0,"#4fc3f7"],
            ["tce","TCE",0,"#faa356"],
            ["dash","Dashboard",0,"#43e97b"],
            ["notes","Notes",0,"#f472b6"],
            ["reports","Reports",0,"#6366f1"],
            ["map","Freight Map",0,"#10b981"],
            ["cal","Calendar",0,"#4fc3f7"],
            ["settings","Settings",0,"#94a3b8"],
            ["vessels","Fleet DB",0,"#38bdf8"],
            ["newbuilds","Newbuilds",0,"#fbbf24"],
          ].filter(([id])=>!guestMode||GUEST_TABS.includes(id)).map(([id,label,count,col])=>{
            const active=tab===id;
            return(
              <button key={id} onClick={()=>{setTab(id);setBucketFilters(new Set());}}
                style={{position:"relative",display:"flex",alignItems:"center",gap:6,
                  padding:mobile?"12px 12px":"10px 16px",
                  background:"transparent",border:"none",
                  borderBottom:"2px solid "+(active?col:"transparent"),
                  cursor:"pointer",fontFamily:"inherit",flexShrink:0,
                  transition:"border-color 0.15s,color 0.15s",marginBottom:-1,
                  minHeight:mobile?44:undefined,
                  WebkitTapHighlightColor:"transparent",
                }}>
                <span style={{fontSize:mobile?13:12,fontWeight:active?700:500,
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
      <div style={{padding:mobile?"8px 8px":"12px 20px",maxWidth:1900,margin:"0 auto"}}>

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
    overflow: "hidden",
    minHeight: 0
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

  <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position:"relative" }}>
    {/* CSS overrides: vivid opaque bar colours for FixingWindow */}
    <style>{`
      /* Kill transparency on all bars inside the fixing window container */
      div[class*="fix"] div[style*="height"][style*="background"],
      div[class*="Fix"] div[style*="height"][style*="background"],
      div[class*="window"] div[style*="height"][style*="background"],
      div[class*="Window"] div[style*="height"][style*="background"] {
        filter: saturate(2) brightness(1.3) !important;
        opacity: 1 !important;
      }
    `}</style>
    <Suspense fallback={null}><FixingWindowChart
      vessels={filtV}
      filterActive={filtV.length !== vessels.length}
      tagFilter={cTagFilter||null}
    /></Suspense>
  </div>
</div>
 
              {/* CENTER: Rate Matrix (34%) */}
              {!mobile&&(
                <div style={{width:"34%",height:460,background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  <div style={{padding:"8px 10px",flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
                    <Suspense fallback={null}><RateMatrix bunkerHeader={<Suspense fallback={null}><BunkerHeader/></Suspense>}/></Suspense>
                  </div>
                </div>
              )}
 
              {/* RIGHT: AIS Map (34%) - matches Rate Matrix height */}
{!mobile&&(
  <div style={{width:"34%",height:460}}>
    <Suspense fallback={null}><AISMap selectedVessels={selectedAISVessels} vessels={vessels} onAisVesselsChange={setAisVesselSet}/></Suspense>
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
      <Suspense fallback={null}><OpeningBreakdown
        vessels={vessels14d.filter(v=>vesselsTodayUpdated.has(v.vessel))}
        filteredVessels={filtV.filter(v=>vesselsTodayUpdated.has(v.vessel))}
        bucketFilters={bucketFilters}
        onBucketFilter={k=>setBucketFilters(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n;})}
        fillHeight={false}
      /></Suspense>
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

                    {/* UNIFIED FILTER PANEL — 8 scrollable columns */}
{(()=>{
  const COL=({label,col,children})=>(
    <div style={{display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden",height:"100%"}}>
      <div style={{fontSize:9,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:"0.1em",padding:"0 0 4px 0",borderBottom:"1px solid "+C.bd2,marginBottom:4,whiteSpace:"nowrap",flexShrink:0}}>{label}</div>
      <div style={{display:"flex",flexDirection:"column",gap:1,overflowY:"auto",flex:1,minHeight:0}}>{children}</div>
    </div>
  );
  const B=({active,onClick,children})=>(
    <button onClick={onClick} style={{...fb(active),display:"block",width:"100%",textAlign:"left",padding:"3px 8px",fontSize:11,whiteSpace:"nowrap",flexShrink:0}}>{children}</button>
  );
  return(
    <div style={{display:"grid",gridTemplateColumns:mobile?"repeat(9,minmax(88px,1fr))":"repeat(9,minmax(0,1fr))",gap:mobile?6:10,padding:"8px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,boxSizing:"border-box",flex:1,overflow:mobile?"auto":"hidden",minHeight:0,overflowX:mobile?"auto":"hidden"}}>
      {/* Tags — manually applied tags on positions (capitalized) */}
      <COL label="Tags" col="#79c0ff">
        {(()=>{const used=[...new Set(vessels.map(v=>(v.tag||"").trim()).filter(Boolean))].sort();return used.length?used.map(t=>(<B key={t} active={posTagFilter.has(t)} onClick={()=>{setPosTagFilter(prev=>{const n=new Set(prev);n.has(t)?n.delete(t):n.add(t);return n;});setPosPage(1);}}>{t.toUpperCase()}</B>)):<span style={{fontSize:10,color:"rgba(140,170,210,0.35)"}}>none</span>;})()}
        {posTagFilter.size>0&&<B active={false} onClick={()=>{setPosTagFilter(new Set());setPosPage(1);}}><span style={{color:C.red}}>✕</span></B>}
      </COL>
      {/* Status */}
      <COL label="Status" col={C.amber}>
        {[["PPT","PPT"],["SUBS","Subs"],["HIDE_EMP","Employed"]].map(([f,l])=>(<B key={f} active={filters.has(f)} onClick={()=>toggleFilter(f)}>{l}</B>))}
        {filters.size>0&&<B active={false} onClick={()=>setFilters(new Set())}><span style={{color:C.red}}>✕ Clear</span></B>}
      </COL>
      {/* Inter UKC */}
      <COL label="Inter UKC" col="#4fc3f7">
        <B active={interUKCActive} onClick={()=>{setInterUKCActive(v=>!v);setPosPage(1);}}>
          <span style={{color:interUKCActive?"#4fc3f7":"rgba(79,195,247,0.65)"}}>Inter UKC</span>
        </B>
        <B active={showSavedOnly} onClick={()=>setShowSavedOnly(v=>!v)}>
          Saved ({savedVessels.size}) <span style={{color:"#fbbf24"}}>★</span>
          {savedVessels.size>0&&<span onClick={e=>{e.stopPropagation();if(window.confirm("Clear all saved vessels?"))clearSavedVessels();}} style={{marginLeft:5,color:C.red,cursor:"pointer"}}>✕</span>}
        </B>
        {interUKCActive&&<B active={false} onClick={()=>{setInterUKCActive(false);}}><span style={{color:C.red}}>✕ Clear</span></B>}
      </COL>
      {/* Updated */}
      <COL label="Updated" col={C.blue}>
        {[["","All"],["today","Today"],["week","This week"],["7d","7 days"],["14d","14 days"],["30d","30 days"]].map(([v,l])=>(<B key={v||"all"} active={updFilter===v&&(v!==""||updFilter==="")} onClick={()=>setUpdFilter(v)}>{l}</B>))}
      </COL>
      {/* Region */}
      <COL label="Region" col="#7dd3fc">
        {[["WCUK","WCUK"],["ECUK","ECUK"],["CANAL","Canal"],["BISCAY","Biscay"],["SKAW","Skaw"],["BALTIC","Baltic"],["MED","Med"]].map(([f,l])=>(<B key={f} active={filters.has(f)} onClick={()=>toggleFilter(f)}>{l}</B>))}
      </COL>
      {/* S.Region */}
      <COL label="S.Region" col={C.purple}>
        {superRegionOptions.filter(r=>r!=="ALL").map(r=>{
          const toggle=e=>{
            if(e.ctrlKey||e.metaKey){setSuperRegionFilter(prev=>{const n=new Set(prev);n.has(r)?n.delete(r):n.add(r);return n;});}
            else{setSuperRegionFilter(prev=>prev.size===1&&prev.has(r)?new Set():new Set([r]));}
          };
          return <B key={r} active={superRegionFilter.has(r)} onClick={toggle}>{r}</B>;
        })}
        {superRegionFilter.size>0&&<B active={false} onClick={()=>setSuperRegionFilter(new Set())}><span style={{color:C.red}}>✕</span></B>}
      </COL>
      {/* Segment */}
      <COL label="Segment" col={C.green}>
        {(()=>{const ORDER=["Sub 10k","City","Inter","J19","Flexi","Handy","MR"];return[...new Set(vessels.map(v=>v.segment).filter(Boolean))].sort((a,b)=>(ORDER.indexOf(a)===-1?99:ORDER.indexOf(a))-(ORDER.indexOf(b)===-1?99:ORDER.indexOf(b))).map(s=>(<B key={s} active={segmentFilter.has(s)} onClick={e=>{if(e.ctrlKey||e.metaKey){setSegmentFilter(prev=>{const n=new Set(prev);n.has(s)?n.delete(s):n.add(s);return n;});}else{setSegmentFilter(prev=>prev.size===1&&prev.has(s)?new Set():new Set([s]));setPosPage(1);}}}>{s}</B>));})()}
        {segmentFilter.size>0&&<B active={false} onClick={()=>{setSegmentFilter(new Set());setPosPage(1);}}><span style={{color:C.red}}>✕</span></B>}
      </COL>
      {/* DWT */}
      <COL label="DWT" col="#f59e0b">
        {[["<10","<10k"],["10-15","10-15k"],["15-20","15-20k"],["20-30","20-30k"],["30-40","30-40k"],[">40",">40k"]].map(([v,l])=>(<B key={v} active={dwtFilter.has(v)} onClick={e=>{setDwtFilter(prev=>{const n=new Set(prev);n.has(v)?n.delete(v):n.add(v);return n;});setPosPage(1);}}>{l}</B>))}
        {dwtFilter.size>0&&<B active={false} onClick={()=>{setDwtFilter(new Set());setPosPage(1);}}><span style={{color:C.red}}>✕</span></B>}
      </COL>
      {/* Built */}
      <COL label="Built" col="#94a3b8">
        {[["<2005","<2005"],["2005-10","2005-10"],["2010-15","2010-15"],["2015-20","2015-20"],[">2020",">2020"]].map(([v,l])=>(<B key={v} active={builtFilter.has(v)} onClick={()=>{setBuiltFilter(prev=>{const n=new Set(prev);n.has(v)?n.delete(v):n.add(v);return n;});setPosPage(1);}}>{l}</B>))}
        {builtFilter.size>0&&<B active={false} onClick={()=>{setBuiltFilter(new Set());setPosPage(1);}}><span style={{color:C.red}}>✕</span></B>}
      </COL>
    </div>
  );
})()}</div>

</div>

                {/* MOVED: Fleet count + Export + Search to same row */}
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,fontSize:12,flexWrap:"wrap"}}>
                  <Suspense fallback={null}><ExportPanel vessels={filtV} cargoes={cargoes} mode="pos" selVessels={selVessels}/></Suspense>
                  {/* Copy positions in formatted style */}
                  <CopyPositionsButton filtV={filtV} fmtDateShort={fmtDateShort}/>
                  <button onClick={()=>{setFilters(new Set());setDwtFilter(new Set());setBuiltFilter(new Set());setUpdFilter("");setSuperRegionFilter(new Set());setSegmentFilter(new Set());setPosTagFilter(new Set());setInterUKCActive(false);setShowSavedOnly(false);setPosPage(1);setSearch("");setBucketFilters(new Set());}}
                    style={{fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",border:"1px solid rgba(255,107,107,0.3)",background:"rgba(255,107,107,0.06)",color:"rgba(255,107,107,0.65)"}}>
                    ✕ Clear filters
                  </button>
                  {/* Inline add vessel */}
                  <button onClick={()=>setShowAddVessel(v=>!v)}
                    style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
                      border:showAddVessel?"1px solid rgba(67,233,123,0.5)":"1px solid rgba(67,233,123,0.25)",
                      background:showAddVessel?"rgba(67,233,123,0.12)":"rgba(67,233,123,0.06)",color:"#43e97b"}}>
                    {showAddVessel?"✕ Cancel":"+ Add vessel"}
                  </button>
                  {selVessels.size>0&&(
                    <button onClick={()=>setTab("reports")} style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,border:"1px solid #6366f1",background:"rgba(99,102,241,.12)",color:"#6366f1",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      📋 To Report ({selVessels.size})
                    </button>
                  )}
                  <span style={{color:C.faint}}>Total <span style={{color:C.tx,fontWeight:700}}>{vessels.length}</span></span>
                  <span style={{color:C.faint}}>Showing <span style={{color:C.blue,fontWeight:700}}>{filtV.length}</span></span>
                  <span style={{color:C.faint}}>Selected <span style={{color:"#4fc3f7",fontWeight:700}}>{selVessels.size}</span></span>
                  
                  {/* MOVED SEARCH FIELD HERE */}
                  <div style={{position:"relative",marginLeft:"auto",display:"flex",alignItems:"center",gap:4,minWidth:300}}>
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
                  <span style={{fontSize:11,color:C.faint,whiteSpace:"nowrap",flexShrink:0}}>Sort</span>
                  <select value={sortK} onChange={e=>srt(e.target.value)}
                    style={{fontSize:11,background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,padding:"2px 6px",cursor:"pointer",fontFamily:"inherit",colorScheme:"dark",flexShrink:0}}>
                    <option value="operator">Operator</option>
                    <option value="vessel">Vessel</option>
                    <option value="built">Built</option>
                    <option value="dwt">DWT</option>
                    <option value="coating">Coating</option>
                    <option value="date">Date</option>
                    <option value="openPort">Open Port</option>
                    <option value="fileDate">Updated</option>
                  </select>
                  <button onClick={()=>setSortD(d=>d*-1)}
                    style={{fontSize:11,background:C.bg,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,padding:"2px 6px",cursor:"pointer",fontFamily:"inherit",minWidth:28,flexShrink:0}}>
                    {sortD>0?"▲":"▼"}
                  </button>
                </div>

                {/* Vessel Table + Side panel row */}
                <div ref={(el)=>{window.__posRow=el;}} style={{display:"flex",gap:10,alignItems:"flex-start",position:"relative"}}>
                {/* Vessel Table */}
                <div style={{width:"100%",flex:1,minWidth:0,overflowX:"auto",WebkitOverflowScrolling:"touch"}}
                  onClick={e=>{
                    const th=e.target.closest("th");
                    if(!th) return;
                    // Find th index in header row, map to posColumns sortKey
                    const row=th.parentElement;
                    if(!row) return;
                    const idx=Array.from(row.children).indexOf(th);
                    const col=posColumns[idx];
                    if(col?.sortKey) srt(col.sortKey);
                  }}>
                    {showAddVessel&&<AddVesselInlineRow onSave={onAddV} onClose={()=>setShowAddVessel(false)}/>}
                  <div style={{...tableWrap,minWidth:mobile?"1400px":undefined}} className={mobile?"pos-table":undefined}>
                    {mobile&&<style>{`
                      .pos-table td, .pos-table td>*{overflow:visible!important;text-overflow:unset!important;white-space:nowrap!important;max-width:none!important;}
                    `}</style>}
                    <MatrixTable
  columns={posColumns}
  data={filtV.slice(0, posPage * POS_PAGE_SIZE)}
  keyField="vessel"
  selectedKey={sel}
  onRowClick={(row) => {
    const deselecting = sel === row.vessel;
    setSel(deselecting ? null : row.vessel);
    setSelectedAISVessels(deselecting ? [] : [row.vessel]);
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
  color="rgba(160,200,255,0.65)"
  placeholder="Operator"
  onSave={val=>onUpdateV(v.vessel,"operator",val)}
  data-cell={`${i}-operator`}
  onTab={() => focusCell(i, "vessel")}
  onShiftTab={() => focusCell(i-1, "comment")}
  onDown={() => focusCell(i+1, "operator")}
  onUp={() => focusCell(i-1, "operator")}
  style={mobile?{minWidth:120,whiteSpace:"nowrap"}:undefined}
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
        style={mobile?{minWidth:130,whiteSpace:"nowrap"}:undefined}
      />

      <td style={{padding:"2px 3px",textAlign:"center",verticalAlign:"middle",borderBottom:"1px solid rgba(255,255,255,0.035)"}} title={aisVesselSet.has((v.vessel||"").toUpperCase().trim())?"AIS data available":"No AIS data"}>
        <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",
          background:aisVesselSet.has((v.vessel||"").toUpperCase().trim())?"#4ade80":"rgba(120,160,220,0.15)"}}/>
      </td>

      <td style={{ ...tdNum, textAlign:"left", color: C.dim }}>{v.built || ""}</td>
      <td style={{ ...tdNum, textAlign:"left", color: C.dim }}>{fmtDwtFull(v.dwt)}</td>
      <td style={{ ...tdTxt, color: C.dim }} title={v.coating||""}>{fmtCoating(v.coating)}</td>
      <td style={{ ...tdNum, textAlign:"left", color: C.dim }}>{v.loa || ""}</td>
      <td style={{ ...tdNum, color: C.dim }}>{v.beam || ""}</td>
      <td style={{ ...tdNum, textAlign:"left", color: C.dim }}>{fmtN(v.cbm)}</td>

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

      {/* WHO ENTERED badge + SAVE star */}
      <td style={{...tdCtr,width:32,padding:"0 2px"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:2}}>
        <button onClick={()=>toggleSavedVessel(v.vessel)}
          title={savedVessels.has(v.vessel)?"Remove from saved":"Save for later"}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:11,padding:"1px",
            color:savedVessels.has(v.vessel)?"#fbbf24":"rgba(120,160,200,0.15)",lineHeight:1}}>
          {savedVessels.has(v.vessel)?"⭐":"☆"}
        </button>
        {(v.entered_by==="H"||v.entered_by==="L")&&(
          <span title={v.entered_by==="H"?"Entered by Henriksen":"Entered by Løken"}
            style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:14,height:14,borderRadius:"50%",fontSize:8,fontWeight:700,lineHeight:1,
              background:v.entered_by==="H"?"rgba(88,166,255,0.25)":"rgba(74,222,128,0.25)",
              color:v.entered_by==="H"?"#79c0ff":"#4ade80",
              border:"1px solid "+(v.entered_by==="H"?"rgba(88,166,255,0.5)":"rgba(74,222,128,0.5)")}}>
            {v.entered_by}
          </span>
        )}
        </div>
      </td>
      <TagCellV vesselName={v.vessel} tag={v.tag} onUpdateV={onUpdateV}/>
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

                  {/* Side panel — fixed, tracks table right-edge via rAF (smooth, no drift) */}
                  {selV&&(
                    <div style={{width:260,background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,overflow:"hidden",position:"fixed",left:panelBox.left,top:panelBox.top,zIndex:1000,maxHeight:"calc(100vh - 90px)",display:"flex",flexDirection:"column",boxShadow:"0 16px 50px rgba(0,0,0,0.7)"}}>
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
                            <PanelEC value={selV[f]} color={col} placeholder="—" onSave={v2=>onUpdateV(selV.vessel,f,v2)}/>
                          </div>
                        ))}

                        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em",padding:"6px 0 3px",borderBottom:"1px solid "+C.bd2}}>Spec</div>
                        {[["Fuel","spec.fuel",C.purple],["Ice Class","spec.iceClass",C.blue],["Last Cargo","spec.lastCargo",C.dim]].map(([l,f,col])=>{
                          const val=f.startsWith("spec.")?(selV.spec||{})[f.split(".")[1]]:selV[f];
                          return(
                            <div key={f} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:"1px solid "+C.bg,gap:4}}>
                              <span style={{fontSize:12,color:C.faint,minWidth:55,flexShrink:0}}>{l}</span>
                              <PanelEC value={val} color={col} placeholder="—" onSave={v2=>onUpdateV(selV.vessel,f,v2)}/>
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
            {/* Parse + filter panel + graph */}
            <div style={{display:"flex",gap:10,alignItems:"stretch",flexDirection:mobile?"column":"row"}}>
              {/* Left: OnParse tag selector + ParsePanel */}
              <div style={{flex:mobile?"1 1 auto":"0 0 50%",display:"flex",flexDirection:"column",gap:4}}>
                {/* ON PARSE tag selector — above Parse & Add */}
                {(()=>{
                  const usedTags=getTagList();
                  return(
                    <div style={{background:C.bg3,border:"1px solid "+C.bd2,borderRadius:5,padding:"5px 8px",display:"flex",alignItems:"center",flexWrap:"wrap",gap:4}}>
                      <span style={{fontSize:9,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.1em",marginRight:2}}>Tag on parse</span>
                      {usedTags.map(t=>(
                        <button key={t} onClick={()=>setPendingParseTag(v=>v===t?"":t)} style={fb(pendingParseTag===t)}>{t}</button>
                      ))}
                      {pendingParseTag&&<button onClick={()=>setPendingParseTag("")} style={{...fb(false),color:C.red,borderColor:C.red+"55",fontSize:10}}>✕ {pendingParseTag}</button>}
                    </div>
                  );
                })()}
                <ParsePanel vessels={vessels} cargoes={cargoes} onAddVessels={onAddVessels}
                  onAddCargoes={async(parsed)=>{
                    const user=localStorage.getItem("signal_user")||"H";
                    const withMeta=parsed.map(c=>({...c,entered_by:user,tag:pendingParseTag?pendingParseTag:c.tag||""}));
                    const result=await onAddCargoes(withMeta);
                    if(pendingParseTag)setPendingParseTag(""); // reset after parse
                    return result;
                  }}
                  lockedMode="cargo" vesselDB={{}}/>
              </div>
              {/* Centre: Grade | Period | Tag filter grid — same height as parse section */}
              {(()=>{
                let allGroups=[];
                try{const raw=localStorage.getItem("signal_cargo_filter_groups");allGroups=raw?JSON.parse(raw):[];}catch{}
                const gradeGroups=allGroups.filter(g=>(g.category||"grade")==="grade");
                const showRaw=gradeGroups.length===0;
                const rawGrades=showRaw?[...new Set(cargoes.map(c=>(c.cargo||"").trim()).filter(Boolean))].sort().slice(0,20):[];
                const usedTags=[...new Set(cargoes.map(c=>c.tag).filter(Boolean))].sort();
                const COL=({label,col,children})=>(
                  <div style={{display:"flex",flexDirection:"column",gap:0,minWidth:0,flex:1}}>
                    <div style={{fontSize:9,fontWeight:700,color:col,textTransform:"uppercase",letterSpacing:"0.1em",padding:"0 0 4px 0",borderBottom:"1px solid "+C.bd2,marginBottom:4,whiteSpace:"nowrap"}}>{label}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:1}}>{children}</div>
                  </div>
                );
                const B=({active,onClick,children,red})=>(
                  <button onClick={onClick} style={{...fb(active),display:"block",width:"100%",textAlign:"left",padding:"3px 7px",fontSize:11,whiteSpace:"nowrap",color:red?C.red:active?"#d9ecff":"#9fc3f5",borderColor:red?C.red+"55":undefined}}>{children}</button>
                );
                return(
                  <div style={{flex:"0 0 auto",width:mobile?"100%":"25%",display:"flex",flexDirection:"column",gap:0,minHeight:0}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,padding:"8px 8px",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,overflowY:"auto",flex:1,boxSizing:"border-box"}}>
                      {/* Grade column */}
                      <COL label="Grade" col={C.purple}>
                        {showRaw
                          ?rawGrades.map(g=><B key={g} active={cGradeFilter===g} onClick={()=>setCGradeFilter(v=>v===g?"":g)}>{g}</B>)
                          :gradeGroups.map(grp=><B key={grp.id} active={cGradeFilter===grp.id} onClick={()=>setCGradeFilter(v=>v===grp.id?"":grp.id)}>{grp.label}</B>)
                        }
                        {cGradeFilter&&gradeGroups.some(g=>g.id===cGradeFilter)&&<B active={false} red onClick={()=>setCGradeFilter("")}>✕ Clear</B>}
                      </COL>
                      {/* Period column */}
                      <COL label="Period" col="#94a3b8">
                        {[["","All"],["tw","This week"],["lw","Last week"],["ytd","YTD"]].map(([v,l])=>(
                          <B key={v||"all"} active={cTimeFilter===v} onClick={()=>setCTimeFilter(v)}>{l}</B>
                        ))}
                        {(cGradeFilter||cFilter!=="ALL"||cTimeFilter||cTagFilter)&&<B active={false} red onClick={()=>{setCGradeFilter("");setCFilter("ALL");setCTimeFilter("");setCTagFilter("");}}>✕ Clear all</B>}
                      </COL>
                      {/* Tag column */}
                      <COL label="Tag" col="#f472b6">
                        {usedTags.map(t=>(
                          <B key={t} active={cTagFilter===t} onClick={()=>setCTagFilter(v=>v===t?"":t)}>{t}</B>
                        ))}
                        {cTagFilter&&<B active={false} red onClick={()=>setCTagFilter("")}>✕ Clear</B>}
                      </COL>
                    </div>
                  </div>
                );
              })()}

              {/* Right: Cargo count by month — animated, full history */}
              {!mobile&&(()=>{
                const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const now=new Date();
                // Use updated date (entry date) for all cargoes
                // Use DB-fetched monthly data (full dataset, not just loaded 200)
                const counts=graphMonthlyData.length>0?graphMonthlyData:[...Array.from({length:3},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-2+i,1);return{year:d.getFullYear(),month:d.getMonth(),count:0};})];
                if(!counts.length) return null;
                const W=Math.max(counts.length,2);
                const maxC=Math.max(1,...counts.map(b=>b.count));
                const SVG_W=520; const SVG_H=180;
                const PAD={t:20,r:12,b:28,l:36};
                const iW=SVG_W-PAD.l-PAD.r;
                const iH=SVG_H-PAD.t-PAD.b;
                const pts=counts.map((bkt,i)=>({
                  x:PAD.l+(W<=1?0:i*(iW/(W-1))),
                  y:PAD.t+iH-(bkt.count/maxC)*iH,
                  ...bkt
                }));
                const pathD=pts.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
                const areaD=pathD+" L"+pts[pts.length-1].x.toFixed(1)+","+(PAD.t+iH)+" L"+pts[0].x.toFixed(1)+","+(PAD.t+iH)+" Z";
                const lineLen=pts.reduce((a,p,i)=>i===0?0:a+Math.hypot(p.x-pts[i-1].x,p.y-pts[i-1].y),0);
                // Label step — show ~8 labels max across x-axis
                const step=Math.max(1,Math.ceil(W/8));
                // Year separators
                const yearStarts=pts.filter((p,i)=>i>0&&p.year!==pts[i-1].year);
                // Peak point
                const peakIdx=counts.reduce((mx,b,i)=>b.count>counts[mx].count?i:mx,0);
                return(
                  <div style={{flex:1,background:C.bg3,border:"1px solid "+C.bd2,borderRadius:6,padding:"10px 12px 8px",display:"flex",flexDirection:"column",gap:4,minWidth:0,boxSizing:"border-box"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.09em"}}>Cargoes entered by month</div>
                      <div style={{fontSize:11,color:"rgba(88,166,255,0.7)",fontWeight:700}}>{(cargoTotal||cargoes.length).toLocaleString()} total</div>
                    </div>
                    <svg viewBox={"0 0 "+SVG_W+" "+SVG_H} style={{width:"100%",flex:1,minHeight:0,overflow:"visible"}}>
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
                      {/* Horizontal grid lines + Y labels */}
                      {[0,0.25,0.5,0.75,1].map(f=>(
                        <g key={f}>
                          <line x1={PAD.l} y1={PAD.t+iH*(1-f)} x2={PAD.l+iW} y2={PAD.t+iH*(1-f)} stroke="rgba(88,130,200,0.1)" strokeWidth="1" strokeDasharray={f===0?"0":"3,4"}/>
                          <text x={PAD.l-5} y={PAD.t+iH*(1-f)+4} textAnchor="end" fontSize="10" fill="rgba(120,160,200,0.45)">{Math.round(maxC*f)}</text>
                        </g>
                      ))}
                      {/* Year separator lines — bold vertical dividers */}
                      {yearStarts.map(p=>(
                        <g key={p.year}>
                          <line x1={p.x} y1={PAD.t-4} x2={p.x} y2={PAD.t+iH+20} stroke="rgba(88,166,255,0.22)" strokeWidth="1.5" strokeDasharray="4,3"/>
                          <text x={p.x+3} y={PAD.t-6} fontSize="10" fill="rgba(88,166,255,0.5)" fontWeight="700">{p.year}</text>
                        </g>
                      ))}
                      {/* Area fill */}
                      <path d={areaD} fill="url(#cgGrad)"/>
                      {/* Animated line */}
                      <path d={pathD} fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="cgLine"/>
                      {/* Dots, peak label, x-axis month labels */}
                      {pts.map((p,i)=>{
                        const showLabel=i===0||i===pts.length-1||i%step===0;
                        return(
                          <g key={i}>
                            {p.count>0&&<circle cx={p.x} cy={p.y} r={i===peakIdx?4:2.5} fill={i===peakIdx?"#79c0ff":"#58a6ff"} stroke="#0c1729" strokeWidth="1.5"/>}
                            {i===peakIdx&&(
                              <text x={p.x} y={p.y-9} textAnchor="middle" fontSize="10" fill="#79c0ff" fontWeight="700">{p.count}</text>
                            )}
                            {showLabel&&(
                              <text x={p.x} y={PAD.t+iH+16} textAnchor="middle" fontSize="10"
                                fill="rgba(120,160,200,0.5)">
                                {MONTHS[p.month]}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
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
              <button onClick={()=>setShowAddCargo(v=>!v)}
                style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
                  border:showAddCargo?"1px solid rgba(250,163,86,0.5)":"1px solid rgba(250,163,86,0.3)",
                  background:showAddCargo?"rgba(250,163,86,0.12)":"rgba(250,163,86,0.07)",color:"#faa356"}}>
                {showAddCargo?"✕ Cancel":"+ Add cargo"}
              </button>
              <Suspense fallback={null}><ExportPanel vessels={vessels} cargoes={filtC} mode="cargo" selCargoes={selCargoes} allFilteredCargoes={filtC}
                onExportAll={async()=>{
                  // Fetch ALL matching cargoes from DB with current search
                  const term=cSearch.trim();
                  let query=supabase.from("cargoes").select("*").order("updated",{ascending:false});
                  if(term) query=query.or(`charterer.ilike.%${term}%,vessel.ilike.%${term}%,load.ilike.%${term}%,disch.ilike.%${term}%,cargo.ilike.%${term}%`);
                  // Fetch in batches to get all
                  let all=[];let from=0;const BATCH=1000;
                  while(true){
                    const{data,error}=await query.range(from,from+BATCH-1);
                    if(error||!data)break;
                    all=[...all,...data.map(normaliseCargo)];
                    if(data.length<BATCH)break;
                    from+=BATCH;
                  }
                  // Apply in-memory filters
                  let list=all;
                  if(cTagFilter)list=list.filter(c=>(c.tag||"").toLowerCase()===cTagFilter.toLowerCase());
                  if(cGradeFilter){
                    let allGroups=[];try{const raw=localStorage.getItem("signal_cargo_filter_groups");allGroups=raw?JSON.parse(raw):[];}catch{}
                    const grp=allGroups.find(g=>g.id===cGradeFilter);
                    if(grp){const fm={grade:"cargo",load:"load",disch:"disch",charterer:"charterer",tag:"tag"};const f=fm[grp.category||"grade"]||"cargo";list=list.filter(c=>grp.aliases.some(a=>(c[f]||"").toLowerCase().includes(a.toLowerCase())));}
                    else list=list.filter(c=>(c.cargo||"").toLowerCase().includes(cGradeFilter.toLowerCase()));
                  }
                  return list;
                }}
              /></Suspense>
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
              <span style={{fontSize:12,color:C.faint}}>This wk <span style={{color:"#4fc3f7",fontWeight:700}}>{weekCounts.thisWk}</span></span>
              <span style={{fontSize:12,color:C.faint}}>Last wk <span style={{color:"rgba(120,160,220,0.6)",fontWeight:700}}>{weekCounts.lastWk}</span></span>
              <span style={{flex:1}}/>
              <span style={{fontSize:12,color:C.faint}}>Total <span style={{color:C.tx,fontWeight:700}}>{cargoTotal||cargoes.length}</span></span>
              <span style={{fontSize:12,color:C.faint}}>Showing <span style={{color:C.blue,fontWeight:700}}>{filtC.length}</span></span>
              {/* Sort dropdown */}
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:11,color:C.faint,whiteSpace:"nowrap"}}>Sort</span>
                <select value={cSortK} onChange={e=>{setCsortK(e.target.value);setCsortD(-1);}}
                  style={{fontSize:11,background:C.bg2,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,padding:"2px 6px",cursor:"pointer",fontFamily:"inherit",colorScheme:"dark"}}>
                  <option value="Updated">Updated</option>
                  <option value="Status">Status</option>
                  <option value="Vessel">Vessel</option>
                  <option value="Charterer">Charterer</option>
                  <option value="Cargo">Cargo</option>
                  <option value="Load">Load</option>
                  <option value="Disch">Disch</option>
                  <option value="LaycanStart">From</option>
                  <option value="Freight">Freight</option>
                </select>
                <button onClick={()=>setCsortD(d=>d*-1)}
                  style={{fontSize:11,background:C.bg,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,padding:"2px 6px",cursor:"pointer",fontFamily:"inherit",minWidth:28}}>
                  {cSortD>0?"▲":"▼"}
                </button>
              </div>
            </div>
            {/* Row hover highlight + mobile no-truncation */}
            <style>{`
              .cargo-table tr:hover td{background:rgba(58,130,246,0.06)!important;}
              @media(max-width:900px){
                .cargo-table td, .cargo-table td>*{overflow:visible!important;text-overflow:unset!important;white-space:nowrap!important;max-width:none!important;}
              }
            `}</style>
            <div style={{width:"100%",overflowX:"auto",WebkitOverflowScrolling:"touch"}}
              onClick={e=>{
                const th=e.target.closest("th");
                if(!th) return;
                const row=th.parentElement;
                if(!row) return;
                const idx=Array.from(row.children).indexOf(th);
                const col=cargoColumns[idx];
                if(col?.sortKey){const d=cSortK===col.sortKey?cSortD*-1:-1;setCsortK(col.sortKey);setCsortD(d);}
              }}>
            <div style={{...tableWrap,minWidth:mobile?"1200px":undefined}} className="cargo-table">
              {showAddCargo&&<AddCargoInlineRow onSave={onAddC} onClose={()=>setShowAddCargo(false)}/>}
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
  style={mobile?{minWidth:'auto',overflow:'visible',whiteSpace:'nowrap'}:undefined}
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
  style={mobile?{minWidth:'auto',overflow:'visible',whiteSpace:'nowrap'}:undefined}
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
  style={mobile?{minWidth:'auto',overflow:'visible',whiteSpace:'nowrap'}:undefined}
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
  style={mobile?{minWidth:'auto',overflow:'visible',whiteSpace:'nowrap'}:undefined}
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
  style={mobile?{minWidth:'auto',overflow:'visible',whiteSpace:'nowrap'}:undefined}
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

      {/* WHO ENTERED — H (blue) or L (green) badge */}
      <td style={{...tdCtr,width:20,padding:"0 2px"}} onClick={e=>e.stopPropagation()}>
        {(f.entered_by==="H"||f.entered_by==="L")&&(
          <span title={f.entered_by==="H"?"Entered by Henriksen":"Entered by Løken"}
            style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
              width:14,height:14,borderRadius:"50%",fontSize:8,fontWeight:700,lineHeight:1,
              background:f.entered_by==="H"?"rgba(88,166,255,0.25)":"rgba(74,222,128,0.25)",
              color:f.entered_by==="H"?"#79c0ff":"#4ade80",
              border:"1px solid "+(f.entered_by==="H"?"rgba(88,166,255,0.5)":"rgba(74,222,128,0.5)")}}>
            {f.entered_by}
          </span>
        )}
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
            </div>{/* end cargo scroll wrapper */}
          </div>
        )}

        {/* ── FIXING ── */}
        {tab==="clients"&&(
          <Suspense fallback={<TabFallback/>}><ClientsTab/></Suspense>
        )}
        {tab==="fix"&&(
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <Suspense fallback={<TabFallback/>}><FixingTab vessels={vessels}/></Suspense>
          </div>
        )}

        {/* ── TIME CHARTER ── */}
{tab==="tcv"&&(
  <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
    <Suspense fallback={<TabFallback/>}>
      <TimeCharterTab/>
    </Suspense>
  </div>
)}

        {/* ── PROJECTS ── */}
        {tab==="projects"&&(
          <div style={{overflowX:mobile?"hidden":"visible"}}>
            <Suspense fallback={<TabFallback/>}><ProjectsTab/></Suspense>
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
            <Suspense fallback={<TabFallback/>}><TCECalculator/></Suspense>
          </div>
        )}
        {tab==="dash"&&(
          <Suspense fallback={<TabFallback/>}><Dashboard vessels={vessels} cargoes={cargoes} history={history||[]}/></Suspense>
        )}
        {tab==="notes"&&(
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
            <Suspense fallback={<TabFallback/>}><NotesTab/></Suspense>
          </div>
        )}
        {tab==="cal"&&<Suspense fallback={<TabFallback/>}><CalendarTab/></Suspense>}
        {tab==="vessels"&&(
          <Suspense fallback={<TabFallback/>}><VesselUploader/></Suspense>
        )}
        {tab==="newbuilds"&&(
          <Suspense fallback={<TabFallback/>}><NewbuildsTab/></Suspense>
        )}
        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,padding:"0 0 20px"}}>
            <TagManager/>
            <div style={{height:1,background:C.bd2,margin:"4px 0"}}/>
            {/* Original settings component */}
            <Suspense fallback={<TabFallback/>}><SettingsTab/></Suspense>
          </div>
        )}
        {tab==="reports"&&<Suspense fallback={<TabFallback/>}><ReportsTab selectedVessels={Array.from(selVessels)} selectedCargoes={Array.from(selCargoes)}/></Suspense>}
        {tab==="map"&&<Suspense fallback={<TabFallback/>}><FreightMapTab/></Suspense>}
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

      {/* ── Add Vessel Modal ── */}


    </div>
  );
}

export default DesktopApp;
