// CACHE_BUSTER_030
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseclient";
import { isMobile } from "./constants";
import { enrichV, normaliseCargo, mergeVessels, toISODate } from "./utils";
import { saveV, saveSnapshot, loadHistory } from "./supabaseHelpers";
import { v4 as uuidv4 } from 'uuid';
import DesktopApp from "./DesktopApp";
import { fetchWithCache } from "./offlineCache";
import OfflineIndicator from "./OfflineIndicator";


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
  const [mobile,setMobile]=useState(()=>isMobile());
  const [fileDate, setFileDate] = useState(() => new Date().toISOString().slice(0,10));

  async function loadVesselDB(){
    if(vesselDBLoaded||vesselDBLoading) return;
    setVesselDBLoading(true);
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while(true){
      const {data, error} = await supabase.from("vessels_db").select("vessel,imo,dwt,built,loa,beam,cbm,coating,ice_class,fuel,operator").range(from, from+pageSize-1);
      if(error || !data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if(data.length < pageSize) break;
      from += pageSize;
    }
    const map = {};
    const imoMap = {};
    allRows.forEach(r => {
      if(r.vessel) map[r.vessel.toLowerCase().trim()] = r;
      if(r.imo) imoMap[String(r.imo).trim()] = r;
    });
    setVesselDB(map);
    window.vesselDB = map;
    window.vesselDBByIMO = imoMap;
    setVesselDBLoaded(true);
    setVesselDBLoading(false);
    console.log("vesselDB loaded on demand:", allRows.length);
  }

  function onCargoSearch(term){
    clearTimeout(searchTimer.current);
    // Multi-term search: comma=OR groups, space=AND within each group.
    // Server query fetches a broad result set for each OR group, then
    // client-side filter (cTokens in DesktopApp) applies the exact AND logic.
    // If the full dataset is already loaded we skip the server call entirely.
    const trimmed = term.trim();
    if (!trimmed) {
      // Empty search — reload the default first page
      searchTimer.current = setTimeout(() => fetchCargoes(""), 300);
      return;
    }
    // Build per OR-group queries: for each comma-separated group take the
    // first meaningful word and do a broad server-side OR filter.
    searchTimer.current = setTimeout(async () => {
      const orGroups = trimmed.toLowerCase()
        .split(",")
        .map(g => g.trim().split(/\s+/).filter(Boolean))
        .filter(g => g.length);
      // Collect all unique first-words across OR groups for a broad fetch
      const keywords = [...new Set(orGroups.map(g => g[0]))];
      try {
        const orClauses = keywords.flatMap(kw =>
          ["charterer","vessel","load","disch","cargo","status"].map(col => `${col}.ilike.%${kw}%`)
        ).join(",");
        const { data, error } = await supabase.from("cargoes").select("*")
          .or(orClauses)
          .range(0, 999)
          .order("updated", { ascending: false });
        if (error) { console.error(error); return; }
        setCargoes(data.map(r => ({ ...normaliseCargo(r), entered_by: r.entered_by, added: r.added, changed: r.changed })));
      } catch (e) { console.error("cargoSearch:", e); }
    }, 350);
  }
  // Load vessels from local storage, cargoes from Supabase.
  // Sequenced (not simultaneous) to reduce the initial Supabase connection
  // burst — positions_latest is the heaviest query, so it goes first while
  // the pool is least contended.
  useEffect(()=>{
  (async () => {
    await fetchPositions();
    await fetchCargoes();
  })();
},[]);

  // vesselDB is no longer auto-loaded on startup — it's large (paginated,
  // ~5-6 requests) and only needed for Parse/vessel-detail lookups.
  // loadVesselDB() is still called on-demand via onLoadVesselDB in DesktopApp.

  useEffect(()=>{const fn=()=>setMobile(isMobile());window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);

  async function fetchCargoes(searchTerm=""){
    if(searchTerm.trim()){
      // Search queries always go to network (no cache for search)
      const t=searchTerm.trim();
      const{data,error}=await supabase.from("cargoes").select("*")
        .or(`charterer.ilike.%${t}%,vessel.ilike.%${t}%,load.ilike.%${t}%,disch.ilike.%${t}%,cargo.ilike.%${t}%,status.ilike.%${t}%`)
        .range(0,499).order("updated",{ascending:false});
      if(error){console.error(error);return;}
      setCargoes(data.map(r=>({...normaliseCargo(r),entered_by:r.entered_by,added:r.added,changed:r.changed})));
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
      setCargoes((data.cargoes || []).map(r=>({...normaliseCargo(r),entered_by:r.entered_by,added:r.added,changed:r.changed})));
      setHasMore((data.cargoes || []).length === 200);
      if(data.total != null) setCargoTotal(data.total);
    }
  }

  // Retry wrapper for transient Supabase pool-timeout / gateway errors
  // (PGRST003, connection pool exhaustion, 504s). Retries with backoff;
  // returns the last result/error if all attempts fail.
  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

  async function withSupabaseRetry(requestFn, label, attempts=3){
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++){
      try {
        const result = await requestFn();
        if (!result.error) return result;
        lastError = result.error;
        const msg = String(result.error.message || "");
        const retryable = result.error.code === "PGRST003" || msg.includes("connection pool") || msg.includes("timeout") || msg.includes("504");
        if (!retryable || attempt === attempts - 1) return result;
      } catch (error) {
        lastError = error;
        if (attempt === attempts - 1) throw error;
      }
      const delays = [1000, 3000, 7000];
      console.warn(`${label}: retrying after failure (attempt ${attempt + 1})`);
      await sleep(delays[attempt] || 7000);
    }
    return { data: null, error: lastError };
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
  
  // Only request the columns the dashboard actually maps below — the full
  // view is wide (40+ cols incl. spec/comment/AIS fields) and returning "*"
  // adds unnecessary sort/transfer weight on top of the view's own
  // DISTINCT ON dedup cost, which was contributing to pool-timeout 504s.
  const POSITION_FIELDS = [
    "vessel_name","operator","open_date","port_name","dwt","build_year",
    "overall_length","beam","cbm","details","file_date","imo_no",
    "dirty_clean","segment","ice_class","last_3_cargoes",
    "coating_type_2","super_region","updated_at","source"
  ].join(",");

  // Fetch with offline fallback + retry on transient pool-timeout errors
  const { data, source } = await fetchWithCache('positions', async () => {
    const { data, error } = await withSupabaseRetry(
      () => supabase.from("positions_latest").select(POSITION_FIELDS).limit(5000),
      "fetchPositions"
    );
    if (error) throw error;
    return data;
  });
  
  if (!data) {
    console.error('No positions data available (offline + no cache)');
    return;
  }
  
  console.log(`📍 Loaded ${data.length} positions from ${source}`);
  
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
    const imoRec = imoKey ? dbByIMO[imoKey] : null;
    const nameRec = (window.vesselDB||{})[String(r.vessel_name||"").toLowerCase().trim()];
    const vrec = imoRec || nameRec || null;
    return{
      id:          String(r.id||""),
      vessel:      String(r.vessel_name||"").toUpperCase(),
      imoNo:       r.imo_no!=null?String(r.imo_no):null,
      operator:    r.operator||"",
      openPort:    r.port_name||"",
      date:        fmtDate,
      dwt:         r.dwt||null,
      built:       r.build_year||null,
      loa:         r.overall_length!=null?Math.round(Number(r.overall_length))||null:null,
      beam:        r.beam!=null?Math.round(Number(r.beam))||null:null,
      cbm:         r.cbm||imoRec?.cbm||null,
      coating:     r.coating_type_2||r.coating||r.coated||"",
      comment:     r.details||"",
      notes:       r.notes||"",
      last3:       r.last_3_cargoes||"",
      dirtyClean:  r.dirty_clean||"",
      iceClass:    r.ice_class||"",
      segment:     SEGMENT_RENAME[r.segment]||r.segment||"",
      superRegion: REGION_RENAME[r.super_region]||r.super_region||"",
      updatedAt:   r.updated_at||"",
      fileDate:    r.file_date||null,
      source:      r.source||"external",
      spec: {
        fuel: vrec?.fuel||null,
        iceClass: r.ice_class||vrec?.ice_class||null,
        lastCargo: r.last_3_cargoes||vrec?.last_cargo||null,
        segment: r.segment||vrec?.segment||null,
        coated: r.coating||r.coated||vrec?.coating||null,
      }
    };
  }));

  // Merge in vessel_overrides — manual edits (notes + spec) win over CSV/feed, per field
  try {
    const { data: ovRows } = await supabase.from("vessel_overrides")
      .select("imo_no,vessel_name,note,coating,ice_class,fuel,loa,beam,cbm,dwt,built,last_cargo,tag");
    if (ovRows && ovRows.length) {
      const byImo = {}, byName = {};
      ovRows.forEach(o => {
        if (o.imo_no) byImo[String(o.imo_no)] = o;
        if (o.vessel_name) byName[String(o.vessel_name).toUpperCase()] = o;
      });
      setVessels(prev => prev.map(v => {
        const o = (v.imoNo && byImo[v.imoNo]) || byName[v.vessel];
        if (!o) return v;
        const merged = { ...v };
        // top-level fields: only apply override when non-null (manual wins)
        if (o.note != null)    merged.notes   = o.note;
        if (o.coating != null) merged.coating = o.coating;
        if (o.loa != null)     merged.loa     = o.loa;
        if (o.beam != null)    merged.beam    = o.beam;
        if (o.cbm != null)     merged.cbm     = o.cbm;
        if (o.dwt != null)     merged.dwt     = o.dwt;
        if (o.built != null)   merged.built   = o.built;
        if (o.tag != null)     merged.tag     = o.tag;
        // spec sub-object
        merged.spec = { ...(v.spec || {}) };
        if (o.fuel != null)      merged.spec.fuel      = o.fuel;
        if (o.ice_class != null) merged.spec.iceClass  = o.ice_class;
        if (o.last_cargo != null)merged.spec.lastCargo = o.last_cargo;
        return merged;
      }));
    }
  } catch (e) { console.error("vessel_overrides load:", e); }
}
  async function loadMoreCargoes(){
    const{data,error}=await supabase.from("cargoes").select("*")
      .range(cargoes.length,cargoes.length+199).order("updated",{ascending:false});
    if(error){console.error(error);return;}
    if(data.length<200) setHasMore(false);
    setCargoes(prev=>[...prev,...data.map(r=>({...normaliseCargo(r),entered_by:r.entered_by,added:r.added,changed:r.changed}))]);
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

  // Vessel-spec + notes persist in vessel_overrides (manual wins, survives CSV/feed updates).
  // Map popout field -> override column.
  const OVERRIDE_COLS = {
    notes: "note",
    coating: "coating",
    loa: "loa",
    beam: "beam",
    cbm: "cbm",
    dwt: "dwt",
    built: "built",
    tag: "tag",
    "spec.fuel": "fuel",
    "spec.iceClass": "ice_class",
    "spec.lastCargo": "last_cargo",
  };
  if (OVERRIDE_COLS[field]) {
    const vobj = vessels.find(v => v.vessel === name);
    const editor = localStorage.getItem("signal_user") || "H";
    const payload = {
      vessel_name: name,
      imo_no: vobj?.imoNo || null,
      [OVERRIDE_COLS[field]]: value || null,
      entered_by: editor,
      updated_at: new Date().toISOString(),
    };
    const onConflict = vobj?.imoNo ? "imo_no" : "vessel_name";
    const { error } = await supabase.from("vessel_overrides").upsert([payload], { onConflict });
    if (error) console.error("vessel_overrides upsert:", error);
    return;
  }

  const fieldMap = {
    openPort: "port_name",
    date: "open_date",
    comment: "details",
    operator: "operator",
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
}, [vessels]);

  // Universal cargo updater — optimistic local update + Supabase write
  const updateC=useCallback(async(id,field,value)=>{
    const displayValue=(field==="from"||field==="to")?(() => {
      const iso=toISODate(value);
      if(!iso) return value;
      const dt=new Date(iso);
      return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
    })():value;
    const editor=localStorage.getItem("signal_user")||"H";
    const nowIso=new Date().toISOString();
    // Edits stamp 'changed' only — 'added' (creation time, the sort anchor) is never touched
    setCargoes(prev=>prev.map(c=>c.id===id?{...c,[field]:displayValue,entered_by:editor,changed:nowIso}:c));
    const dbValue=(field==="from"||field==="to")?toISODate(value):value;
    const{error}=await supabase.from("cargoes").update({[field]:dbValue,entered_by:editor,changed:nowIso}).eq("id",id);
    if(error)console.error(error);
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
      const editorInit = localStorage.getItem("signal_user")||"H";
      const next = mergeVessels(prev, parsed.map(p => ({ ...p, fileDate: nowIso, entered_by: editorInit })), vdb);
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
  coating: ev.coating || dbVessel?.coating || extractCoating(ev.comment||"") || null,
  details: ev.comment || null,
  file_date: nowIso,
  updated_at_manual: nowIso,
  updated_at: nowIso,
  entered_by: localStorage.getItem("signal_user")||"H",
  spec: spec,
};
    });

    const { error } = await supabase
  .from("positions")
  .upsert(rows, { onConflict: 'vessel_name' });
    if (error) console.error("positions insert error:", error);
    else console.log("positions saved ok:", rows.length, "rows");
    
    return r;
  }, [vesselDB, saveV, saveSnapshot]);

  const addCargoes=useCallback(async(parsed)=>{
    const editorC=localStorage.getItem("signal_user")||"H";
    const stamped=parsed.map((f,i)=>({...normaliseCargo({
      ...f,
      id: f.id||("c_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6)),
      updated: new Date().toISOString(),
    }),entered_by:editorC,added:f.added||new Date().toISOString(),changed:null}));
    // Dedup by id and by charterer+load+disch+from
    let added=0;
    setCargoes(prev=>{
      const existingIds=new Set(prev.map(c=>c.id));
      const toAdd=stamped.filter(f=>{
        if(existingIds.has(f.id))return false;
        if(f.charterer&&f.load&&f.from){
  const dupIdx=prev.findIndex(e=>
    (e.charterer||"").toLowerCase()===(f.charterer||"").toLowerCase()&&
    (e.load||"").toLowerCase()===(f.load||"").toLowerCase()&&
    (e.from||"")===(f.from||"")
  );
  if(dupIdx>=0){
    // Update existing record instead of adding new
    prev[dupIdx]={...prev[dupIdx],...f};
    return false;
  }
}
        return true;
      });
      added=toAdd.length;
      return [...prev,...toAdd];
    });
    // Write new rows to Supabase
    if(stamped.length>0){
      const rows=stamped.map(c=>({...c,from:toISODate(c.from),to:toISODate(c.to)}));
      console.log("upserting cargo ids:", rows.map(r=>r.id));
      const{error}=await supabase.from("cargoes").upsert(rows,{onConflict:"id"});
      if(error)console.error("cargo upsert error:",error);
    }
    setVessels(prev=>{const next=prev.map(v=>{const fix=stamped.find(f=>f.vessel&&f.vessel.toLowerCase()===v.vessel.toLowerCase());if(fix&&fix.status==="FIXED"){return{...v,openPort:"EMPLOYED"};}return v;});saveV(next);return next;});
    return added;
  },[]);

  const addV=useCallback(async(v)=>{
  setVessels(prev=>{const idx=prev.findIndex(x=>x.vessel?.toLowerCase()===v.vessel.toLowerCase());const next=idx>=0?prev.map((x,i)=>i===idx?enrichV(v,vesselDB):x):[...prev,enrichV(v,vesselDB)];saveV(next);return next;});
  const{error}=await supabase.from("positions").upsert([{...v,updated_at:new Date().toISOString()}],{onConflict:"vessel_name"});
  if(error)console.error(error);
},[vesselDB]);
  const addC=useCallback(async(c)=>{
    const norm={...normaliseCargo({...c,id:c.id||("c_"+Date.now()+"_"+Math.random().toString(36).slice(2,6)),updated:c.updated||new Date().toISOString()}),added:c.added||new Date().toISOString(),changed:null};
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

  const props={vessels,cargoes,cargoTotal,onUpdateV:updateV,onRenameV:renameV,onUpdateC:updateC,onAddVessels:addVessels,onAddCargoes:addCargoes,onAddV:addV,onAddC:addC,onDelV:delV,onDelC:delC,hasMore,onLoadMore:loadMoreCargoes,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB:loadVesselDB};
  return (
    <>
      <OfflineIndicator cacheKey="positions" />
      <DesktopApp {...props}/>
    </>
  );
}
