// CACHE_BUSTER_030
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseclient";
import { isMobile } from "./constants";
import { enrichV, normaliseCargo, mergeVessels, toISODate } from "./utils";
import { saveV, saveSnapshot, loadHistory } from "./supabaseHelpers";
import { v4 as uuidv4 } from 'uuid';
import { fetchWithCache } from "./offlineCache";
import OfflineIndicator from "./OfflineIndicator";

// Lazy-load DesktopApp to break the TankPos→DesktopApp→...→TankPos circular dep
const DesktopApp = React.lazy(()=>import("./DesktopApp"));


// ─── Root ─────────────────────────────────────────────────────────────────────
export default function TankPos(){

  const [vesselDB, setVesselDB] = useState({});
  const [vesselDBLoaded, setVesselDBLoaded] = useState(false);
  const [vesselDBLoading, setVesselDBLoading] = useState(false);
  const [vessels,setVessels]=useState([]);
  const [cargoes,setCargoes]=useState([]);
  const [cargoTotal,setCargoTotal]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const searchTimer=useRef(null);
  const refreshTimer=useRef(null); // debounced re-fetch after edits
  const [mobile,setMobile]=useState(()=>isMobile());
  // Manual layout override — stored in localStorage so it persists
  // URL param ?reset_layout=1 clears the override (escape hatch if stuck)
  const [layoutOverride,setLayoutOverride]=useState(()=>{
    if(new URLSearchParams(window.location.search).has("reset_layout")){
      localStorage.removeItem("signal_layout");
      return null;
    }
    const stored=localStorage.getItem("signal_layout");
    return stored||null; // null=auto, "mobile"=force mobile, "desktop"=force desktop
  });
  const effectiveMobile = layoutOverride==="mobile" ? true : layoutOverride==="desktop" ? false : mobile;

  function toggleLayout(){
    const next = effectiveMobile ? "desktop" : "mobile";
    setLayoutOverride(next);
    localStorage.setItem("signal_layout",next);
  }
  const [fileDate, setFileDate] = useState(() => new Date().toISOString().slice(0,10));

  async function loadVesselDB(){
    if(vesselDBLoaded||vesselDBLoading) return;
    setVesselDBLoading(true);
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while(true){
      const {data, error} = await supabase.from("vessels_db")
        .select("vessel,imo,dwt,built,loa,beam,cbm,coating,ice_class,fuel,operator")
        .range(from, from+pageSize-1);
      if(error){ console.error("vesselDB load error:", error); break; }
      if(!data?.length) break;
      allRows = [...allRows, ...data];
      if(data.length < pageSize) break;
      from += pageSize;
    }
    const map = {};
    const imoMap = {};
    allRows.forEach(r => {
      const enriched = {...r, coating: r.coating || ""};
      if(r.vessel) map[r.vessel.toLowerCase().trim()] = enriched;
      if(r.imo) imoMap[String(r.imo).trim()] = enriched;
    });
    setVesselDB(map);
    window.vesselDB = map;
    window.vesselDBByIMO = imoMap;
    setVesselDBLoaded(true);
    setVesselDBLoading(false);
    console.log("vesselDB loaded on demand:", allRows.length);

    // Re-enrich positions already in memory with fresh vesselDB data
    setVessels(prev => {
      if(!prev.length) return prev;
      let changed = false;
      const next = prev.map(v => {
        const dbRec = map[v.vessel?.toLowerCase().trim()];
        if(!dbRec) return v;
        // Only fill in fields that are missing (0, null, or empty)
        const newLoa  = (v.loa  && v.loa  > 0) ? v.loa  : (dbRec.loa  || null);
        const newBeam = (v.beam && v.beam > 0) ? v.beam : (dbRec.beam || null);
        const newDwt  = v.dwt  || dbRec.dwt  || null;
        const newBuilt= v.built|| dbRec.built || null;
        const newCbm  = v.cbm  || dbRec.cbm  || null;
        const newCoat = v.coating || dbRec.coating || "";
        if(newLoa!==v.loa||newBeam!==v.beam||newDwt!==v.dwt||newCoat!==v.coating){
          changed=true;
          return{...v,loa:newLoa,beam:newBeam,dwt:newDwt,built:newBuilt,cbm:newCbm,coating:newCoat};
        }
        return v;
      });
      return changed ? next : prev;
    });
  }

  function onCargoSearch(term){
    clearTimeout(searchTimer.current);
    searchTimer.current=setTimeout(()=>fetchCargoes(term),300);
  }
  // Load vessels from local storage, cargoes from Supabase
  useEffect(()=>{
  fetchPositions();
  fetchCargoes();
},[]);

  // Auto-load vesselDB on startup
  useEffect(() => {
    loadVesselDB();
  }, []);

  useEffect(()=>{const fn=()=>setMobile(isMobile());window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);

  async function fetchCargoes(searchTerm=""){
    if(searchTerm.trim()){
      // Search queries always go to network (no cache for search)
      const t=searchTerm.trim();
      const{data,error}=await supabase.from("cargoes").select("*")
        .or(`charterer.ilike.%${t}%,vessel.ilike.%${t}%,load.ilike.%${t}%,disch.ilike.%${t}%,cargo.ilike.%${t}%,status.ilike.%${t}%`)
        .range(0,499).order("updated",{ascending:false});
      if(error){console.error(error);return;}
      setCargoes(data.map(r=>({...normaliseCargo(r),entered_by:r.entered_by||""})));
    } else {
      // Fetch with offline fallback
      const { data, source } = await fetchWithCache('cargoes', async () => {
        const [{data,error},{count}] = await Promise.all([
          supabase.from("cargoes").select("*").range(0,199).order("updated",{ascending:false}),
          supabase.from("cargoes").select("*",{count:"exact",head:true})
        ]);
        if(error) throw error;
        return { cargoes: data, total: count };
      });
      
      if (!data) {
        console.error('No cargoes data available (offline + no cache)');
        return;
      }
      
      console.log(`🚢 Loaded ${data.cargoes?.length || 0} cargoes from ${source}`);
      setCargoes((data.cargoes || []).map(r=>({...normaliseCargo(r),entered_by:r.entered_by||""})));
      setHasMore((data.cargoes || []).length === 200);
      if(data.total != null) setCargoTotal(data.total);
    }
  }

  async function fetchPositions(){
  const REGION_RENAME={
    "East Coast South America":"EC SAM",
    "Europe (Mediterranean)":"Med",
    "South-East-Asia Far-East":"SEA-FEA",
    "West Africa":"WAF",
    "West Coast US":"WC US",
    "West Coast South America":"WC SAM",
    "North West Europe":"NWE",
    "Med-Black Sea":"Med",
    "Arabian Gulf":"Suez-AG-India",
    "AG":"Suez-AG-India",
    "AG-India-Red Sea":"Suez-AG-India",
    "Red Sea":"Suez-India",
    "India":"Suez-India",
    "West Pacific":"Pacific",
    "Southern Ocean":"Pacific",
  };
  const SEGMENT_RENAME={
    "1. Small (<10)":"Sub 10k",
    "2. Cityclass (10-15)":"City",
    "3. Intermediate (14-19)":"Inter",
    "4. J19 (19-22)":"J19",
    "5. Flexi (22-30)":"Flexi",
    "6. Handy (30-40)":"Handy",
    "7. MR (>40)":"MR",
  };
  
  // Fetch positions directly — skip localStorage cache for large datasets (quota guard)
  const { data: posData, error: posError } = await supabase
    .from("positions_latest").select("*").limit(10000);
  if (posError) { console.error('positions fetch error:', posError); return; }
  const data = posData;
  // Try to cache but silently skip if storage is full
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length < 3_000_000) { // only cache if < ~3MB
      localStorage.setItem('tankpos_positions_v1', serialized);
    }
  } catch(e) { /* quota exceeded — fine, data is in memory */ }
  console.log(`📍 Loaded ${data.length} positions from network`);
  
  const mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  setVessels((data||[]).map(r=>{
    const rawDate=String(r.open_date||"");
    let fmtDate=rawDate;
    if(rawDate&&!/^\d{1,2}\s[A-Za-z]/.test(rawDate)){
      const d=new Date(rawDate);
      if(!isNaN(d))fmtDate=d.getDate()+" "+mn[d.getMonth()];
    }
    const imoKey = String(r.imo_number||r.imo||"").trim();
    const dbByIMO = window.vesselDBByIMO||{};
    const dbByName = window.vesselDB||{};
    const imoRec = imoKey ? dbByIMO[imoKey] : null;
    const nameRec = dbByName[(r.vessel_name||"").toLowerCase().trim()] || null;
    // Use IMO match first, then name match for vessel specs
    const dbRec = imoRec || nameRec;
    return{
      id:          String(r.id||""),
      vessel:      String(r.vessel_name||"").toUpperCase(),
      operator:    r.operator||"",
      openPort:    r.port_name||"",
      date:        fmtDate,
      dwt:         r.dwt||dbRec?.dwt||null,
      built:       r.build_year||dbRec?.built||null,
      loa:         (r.overall_length&&Number(r.overall_length)>0)?Math.round(Number(r.overall_length)):(dbRec?.loa||null),
      beam:        (r.beam&&Number(r.beam)>0)?Math.round(Number(r.beam)):(dbRec?.beam||null),
      cbm:         r.cbm||dbRec?.cbm||null,
      coating:     r.coating_type_2||r.coating||r.coated||dbRec?.coating||"",
      comment:     r.details||"",
      notes:       r.notes||"",
      last3:       r.last_3_cargoes||"",
      dirtyClean:  r.dirty_clean||"",
      iceClass:    r.ice_class||dbRec?.ice_class||"",
      segment:     SEGMENT_RENAME[r.segment]||r.segment||"",
      superRegion: REGION_RENAME[r.super_region]||r.super_region||"",
      updatedAt:   r.updated_at||"",
      fileDate:    r.file_date||null,
      source:      r.source||"external",
      entered_by:  r.entered_by||"",
      spec: {
        iceClass: r.ice_class||dbRec?.ice_class||null,
        lastCargo: r.last_3_cargoes||null,
        segment: r.segment||null,
        coated: r.coating||r.coated||dbRec?.coating||null,
      }
    };
  }));
}
  async function loadMoreCargoes(){
    // Load ALL remaining cargoes, not just 200 at a time
    let allData=[];
    let from=cargoes.length;
    const BATCH=1000;
    while(true){
      const{data,error}=await supabase.from("cargoes").select("*")
        .range(from,from+BATCH-1).order("updated",{ascending:false});
      if(error){console.error(error);break;}
      allData=[...allData,...data];
      if(data.length<BATCH){setHasMore(false);break;}
      from+=BATCH;
    }
    if(allData.length>0) setCargoes(prev=>[...prev,...allData.map(r=>({...normaliseCargo(r),entered_by:r.entered_by||""}))]);
  }

  const renameV=useCallback((oldName,newName)=>{
    if(!newName||!newName.trim()||newName.trim().toUpperCase()===oldName)return;
    const n=newName.trim().toUpperCase();
    setVessels(prev=>{const next=prev.map(v=>v.vessel===oldName?{...v,vessel:n,updatedAt:new Date().toISOString()}:v);saveV(next);return next;});
    setCargoes(prev=>prev.map(c=>c.vessel===oldName?{...c,vessel:n}:c));
    setSel(n);
  },[]);

  const updateV = useCallback(async(name, field, value) => {
  setVessels(prev => {
    const now2 = new Date().toISOString();

    const next = prev.map(v => {
      if (v.vessel !== name) return v;

      if (field.includes(".")) {
        const [a, b] = field.split(".");
        return {
          ...v,
          updatedAt: now2,
          [a]: {
            ...(v[a] || {}),
            [b]: value || null
          }
        };
      }

      const extra = field === "operator" ? { operatorManual: true } : {};

      return {
        ...v,
        updatedAt: now2,
        [field]: value || null,
        ...extra
      };
    });

    saveV(next);
    return next;
  });

  const fieldMap = {
    openPort: "port_name",
    date: "open_date",
    built: "build_year",
    loa: "overall_length",
    comment: "details",
    notes: "notes",
    operator: "operator",
    dwt: "dwt",
    beam: "beam",
    cbm: "cbm",
    coating: "coating",
  };

  const dbField = fieldMap[field] || field;

  const { error } = await supabase
    .from("positions")
    .update({
      [dbField]: value || null,
      updated_at: new Date().toISOString()
    })
    .ilike("vessel_name", name);

  if (error) console.error("updateV error:", error);
  // No re-fetch — local state already updated optimistically, re-fetch reshuffles table
}, []);

  // Universal cargo updater — optimistic local update + Supabase write
  const updateC=useCallback(async(id,field,value)=>{
    // Normalise freight format on save
    const normValue=field==="freight"?normaliseFreight(value):value;
    const displayValue=(field==="from"||field==="to")?(() => {
      const iso=toISODate(normValue);
      if(!iso) return normValue;
      const dt=new Date(iso);
      return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
    })():normValue;
    setCargoes(prev=>prev.map(c=>c.id===id?{...c,[field]:displayValue}:c));
    const dbValue=(field==="from"||field==="to")?toISODate(normValue):normValue;
    const{error}=await supabase.from("cargoes").update({[field]:dbValue}).eq("id",id);
    if(error) console.error(error);
    // No re-fetch — local state already updated above, re-fetch reshuffles the table
  },[]);

  const addVessels = useCallback(async (parsed) => {
    const vdb = window.vesselDB || vesselDB;
    const nowIso = new Date().toISOString();
    let r = { added: 0, updated: 0, total: 0 };

    function extractCoating(text){
      if(!text) return "";
      const t=text.toLowerCase();
      if(t.includes("stainless")||t.includes("stst")||t.includes("ss ")) return "Stainless";
      if(t.includes("marineline")||t.includes("marine line")) return "Marineline";
      if(t.includes("interline")) return "Interline";
      if(t.includes("zinc")) return "Zinc";
      if(t.includes("epoxy")) return "Epoxy";
      if(t.includes("phenolic")) return "Epoxy";
      return "";
    }

    setVessels(prev => {
      const before = prev.length;
      // We pass nowIso into the local state so the UI updates immediately
      const next = mergeVessels(prev, parsed.map(p => ({ ...p, fileDate: nowIso })), vdb);
      r = { 
        added: next.length - before, 
        updated: parsed.length - Math.max(0, next.length - before), 
        total: next.length 
      };
      saveV(next);
      setTimeout(() => saveSnapshot(next), 100);
      return next;
    });

    const rows = parsed.map(v => {
      const ev = enrichV(v, vdb);
      
      // Spec data is already in v.spec from ParsePanel OR look it up in vesselDB
      const vesselKey = ev.vessel?.toUpperCase();
      const dbVessel = vdb[vesselKey?.toLowerCase()];
      
      // Priority: use spec from parsed object first, then fallback to vesselDB
      const spec = v.spec || (dbVessel ? {
        iceClass: dbVessel.ice_class,
        lastCargo: dbVessel.last_cargo,
        segment: dbVessel.segment,
      } : {});
      
      console.log("Saving to DB - vessel:", ev.vessel, "spec:", spec);
      
      return {
  id: uuidv4(),
  vessel_name: ev.vessel,
  operator: ev.operator || null,
  port_name: ev.openPort || null,
  open_date: ev.date || null,
  dwt: ev.dwt || null,
  build_year: ev.built || null,
  overall_length: ev.loa || null,
  beam: ev.beam || null,
  cbm: ev.cbm || null,
  coating: ev.coating || extractCoating(ev.comment||"") || null,
  details: ev.comment || null,
  file_date: nowIso,
  updated_at_manual: nowIso,
  updated_at: nowIso,
  spec: spec,
};
    });

    const { error } = await supabase
  .from("positions")
  .upsert(rows, { onConflict: 'vessel_name' });
    if (error) console.error("positions insert error:", error);
    else {
      console.log("positions saved ok:", rows.length, "rows");
      // Re-fetch so the table reflects what's now in DB (parse complete)
      fetchPositions();
    }
    
    return r;
  }, [vesselDB, saveV, saveSnapshot]);

  // Normalise freight to standard format: "USD 450k ls" or "USD 45 pmt"
  // Rules:
  //   explicit 'k' suffix (500k, 450K)  → always LS
  //   explicit 'pmt'/'per mt'           → always PMT
  //   explicit 'ls'/'lump sum'          → always LS
  //   raw number >= 1500 (e.g. 500000)  → LS (convert to k)
  //   raw number < 1500 (e.g. 35, 125)  → PMT
  //   freetext (USD 35 pmt, $500k ls)   → honour as typed, just normalise prefix
  function normaliseFreight(raw){
    if(!raw) return "";
    const s=String(raw).trim();
    if(!s) return "";
    const up=s.toUpperCase();
    if(up==="RNR"||up==="TBN"||up==="TBC") return s.toUpperCase();
    if(/^(USD|EUR)\s+.+/i.test(s)) return s;
    const isEur=/EUR|€/i.test(s);
    const cur=isEur?"EUR":"USD";
    // Strip trailing port ratio FIRST: "126 1/2", "4.15 M L/S 2/1", "95 2/1"
    const withoutRatio=s.replace(/\s+\d+\/\d+\s*$/,"").trim();
    // "M L/S" = million lump sum, e.g. "4.15 M L/S"
    const isMls=/\b\d+(\.\d+)?\s*M\s*(L\/S|ls)/i.test(withoutRatio);
    const kMatch=withoutRatio.match(/(\d+(?:\.\d+)?)\s*[kK]/);
    const hasK=!!kMatch;
    const isPmt=/pmt|per\s*mt|per\s*ton|\bpt\b/i.test(withoutRatio);
    const isLs=/\bls\b|lump\s*sum|L\/S/i.test(withoutRatio);
    const numStr=withoutRatio.replace(/EUR|USD|\$|€|[kK]\b|M\b|million|L\/S/gi,"").replace(/[,\s]/g,"");
    const num=parseFloat(numStr.replace(/[^0-9.]/g,""));
    if(isNaN(num)) return s;
    if(isMls){ return cur+" "+num.toFixed(2).replace(".",",")+"m ls"; }
    if(isPmt) return cur+" "+Math.round(num)+" pmt";
    if(isLs||hasK){ const k=hasK?Math.round(num):Math.round(num/1000); return cur+" "+k+"k ls"; }
    if(num>=1500){
      if(num>=1000000){ return cur+" "+(num/1000000).toFixed(2).replace(".",",")+"m ls"; }
      return cur+" "+Math.round(num/1000)+"k ls";
    }
    return cur+" "+Math.round(num)+" pmt";
  }

  const addCargoes=useCallback(async(parsed)=>{
    const nowIso=new Date().toISOString();
    const stamped=parsed.map((f,i)=>{
      // Extract port ratio from freight before normalising (e.g. "126 1/2" → comment: "bss 1:2")
      let freightRaw=f.freight||"";
      let portNote="";
      const ratioMatch=freightRaw.match(/\s+(\d+)\/(\d+)\s*$/);
      if(ratioMatch){
        portNote=`bss ${ratioMatch[1]}:${ratioMatch[2]}`;
      }
      const norm=normaliseCargo({
        ...f,
        freight: normaliseFreight(freightRaw),
        comment: [f.comment,portNote].filter(Boolean).join(" "),
        id: f.id||("c_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6)),
        updated: nowIso,
      });
      if(f.entered_by) norm.entered_by=f.entered_by;
      return norm;
    });

    // Fetch existing cargoes from Supabase for dedup check
    // Match on charterer + load + from (laycan start) — if all three match, treat as same fixture
    const {data:existing}=await supabase.from("cargoes")
      .select("id,charterer,load,from,status,freight,vessel")
      .gte("updated",new Date(Date.now()-90*24*60*60*1000).toISOString()); // last 90 days only

    const existingMap={};
    (existing||[]).forEach(e=>{
      const key=`${(e.charterer||"").toLowerCase()}|${(e.load||"").toLowerCase()}|${e.from||""}`;
      if(key.length>2) existingMap[key]=e;
    });

    const toInsert=[];
    const toUpdate=[];

    stamped.forEach(f=>{
      const key=`${(f.charterer||"").toLowerCase()}|${(f.load||"").toLowerCase()}|${toISODate(f.from)||""}`;
      const match=existingMap[key];
      if(match){
        toUpdate.push({...match,...f,id:match.id,updated:nowIso,from:toISODate(f.from),to:toISODate(f.to),entered_by:match.entered_by||f.entered_by||""});
      } else {
        toInsert.push({...f,from:toISODate(f.from),to:toISODate(f.to),entered_by:f.entered_by||""});
      }
    });

    // Update local state — preserve entered_by through normaliseCargo
    setCargoes(prev=>{
      const updMap={};
      toUpdate.forEach(u=>{
        const norm=normaliseCargo({...u,from:u.from,to:u.to});
        norm.entered_by=u.entered_by||"";
        updMap[u.id]=norm;
      });
      const updated=prev.map(c=>updMap[c.id]?{...c,...updMap[c.id]}:c);
      const newNormed=toInsert.map(f=>{
        const norm=normaliseCargo(f);
        norm.entered_by=f.entered_by||"";
        return norm;
      });
      return [...updated,...newNormed];
    });

    // Write to Supabase — ensure entered_by is in every row
    if(toUpdate.length>0){
      const rows=toUpdate.map(u=>({...u,entered_by:u.entered_by||""}));
      const{error}=await supabase.from("cargoes").upsert(rows,{onConflict:"id"});
      if(error) console.error("cargo update error:",error);
    }
    if(toInsert.length>0){
      const rows=toInsert.map(f=>({...f,entered_by:f.entered_by||""}));
      const{error}=await supabase.from("cargoes").insert(rows);
      if(error) console.error("cargo insert error:",error);
    }

    console.log(`Parse result: ${toInsert.length} new, ${toUpdate.length} updated`);
    // No re-fetch — preserves parse order in UI

    setVessels(prev=>{const next=prev.map(v=>{const fix=stamped.find(f=>f.vessel&&f.vessel.toLowerCase()===v.vessel.toLowerCase());if(fix&&fix.status==="FIXED"){return{...v,openPort:"EMPLOYED"};}return v;});saveV(next);return next;});
    return toInsert.length;
  },[]);

  const addV=useCallback(async(v)=>{
  setVessels(prev=>{const idx=prev.findIndex(x=>x.vessel?.toLowerCase()===v.vessel.toLowerCase());const next=idx>=0?prev.map((x,i)=>i===idx?enrichV(v,vesselDB):x):[...prev,enrichV(v,vesselDB)];saveV(next);return next;});
  const{error}=await supabase.from("positions").upsert([{...v,updated_at:new Date().toISOString(),entered_by:v.entered_by||""}],{onConflict:"vessel_name"});
  if(error)console.error(error);
},[vesselDB]);
  const addC=useCallback(async(c)=>{
    const norm=normaliseCargo({...c,id:c.id||("c_"+Date.now()+"_"+Math.random().toString(36).slice(2,6)),updated:c.updated||new Date().toISOString()});
    setCargoes(prev=>[...prev,norm]);
    const row={...norm,from:toISODate(norm.from),to:toISODate(norm.to)};
    const{error}=await supabase.from("cargoes").upsert([row],{onConflict:"id"});
    if(error)console.error(error);
    if(norm.status==="FIXED"&&norm.vessel&&norm.disch){setVessels(prev=>{const next=prev.map(v=>v.vessel?.toLowerCase()!==norm.vessel.toLowerCase()?v:{...v,openPort:norm.disch});saveV(next);return next;});}
  },[]);
  const delV = useCallback(async(name)=>{
  setVessels(prev=>{
    const next = name==="__ALL__" ? [] : prev.filter(v => v.vessel !== name);
    saveV(next);
    return next;
  });

  if(name==="__ALL__"){
    const { error } = await supabase
      .from("positions")
      .delete()
      .neq("vessel_name", "__none__");
    if(error) console.error("delV all error:", error);
  } else {
    const { error } = await supabase
      .from("positions")
      .delete()
      .ilike("vessel_name", name);
    if(error) console.error("delV error:", error, name);
  }
},[]);
  const delC=useCallback(async(id)=>{
    setCargoes(prev=>id==="__ALLCARGO__"?[]:prev.filter(c=>c.id!==id));
    setCargoTotal(prev=>id==="__ALLCARGO__"?0:Math.max(0,prev-1));
    if(id==="__ALLCARGO__"){
      const{error}=await supabase.from("cargoes").delete().neq("id","__none__");
      if(error)console.error("delC all error:",error);
    } else {
      const{error}=await supabase.from("cargoes").delete().eq("id",id);
      if(error){
        console.error("delC error:",error,id);
        alert("Delete failed: "+error.message+" (id: "+id+")");
      }
    }
  },[]);

  const props={vessels,cargoes,cargoTotal,onUpdateV:updateV,onRenameV:renameV,onUpdateC:updateC,onAddVessels:addVessels,onAddCargoes:addCargoes,onAddV:addV,onAddC:addC,onDelV:delV,onDelC:delC,hasMore,onLoadMore:loadMoreCargoes,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB:loadVesselDB,mobile:effectiveMobile,onToggleLayout:toggleLayout,layoutOverride};
  return (
    <>
      <React.Suspense fallback={null}>
        <DesktopApp {...props} offlineIndicator={<OfflineIndicator cacheKey="positions"/>}/>
      </React.Suspense>
    </>
  );
}
