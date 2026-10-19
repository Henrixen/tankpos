// CACHE_BUSTER_030
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseclient";
import { isMobile } from "./constants";
import { enrichV, normaliseCargo, mergeVessels, toISODate } from "./utils";
import { saveV, saveSnapshot, loadHistory } from "./supabaseHelpers";
import { v4 as uuidv4 } from 'uuid';
import DesktopApp from "./DesktopApp";


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
  const vesselsRef=useRef([]);
  const saveQueueRef=useRef(new Map());
  useEffect(()=>{vesselsRef.current=vessels;},[vessels]);
  const [mobile,setMobile]=useState(()=>isMobile());
  const [fileDate, setFileDate] = useState(() => new Date().toISOString().slice(0,10));

  async function loadVesselDB(){
    if(vesselDBLoaded||vesselDBLoading) return;
    setVesselDBLoading(true);
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while(true){
      const {data, error} = await supabase.from("vessels_db").select("*").range(from, from+pageSize-1);
      if(error || !data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if(data.length < pageSize) break;
      from += pageSize;
    }
    const map = {};
    allRows.forEach(r => { if(r.vessel) map[r.vessel.toLowerCase().trim()] = r; });
    // Fill missing coating from vessel master without replacing manual values.
    // The vessel master can expose coating under several column names.
    setVessels(prev => prev.map(v => {
      if (String(v.coating || "").trim()) return v;
      const master = map[String(v.vessel || "").toLowerCase().trim()];
      const coating = master?.coating_type_2 || master?.coating || master?.coated || master?.coating_type || "";
      return coating ? {...v, coating} : v;
    }));
    setVesselDB(map);
    window.vesselDB = map;
    setVesselDBLoaded(true);
    setVesselDBLoading(false);
    console.log("vesselDB loaded on demand:", allRows.length);
  }

  function onCargoSearch(term){
    clearTimeout(searchTimer.current);
    // CargoesMaster filters the fully loaded dataset locally.
    // Never replace it with a truncated server search result.
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

  // Supabase/PostgREST returns at most 1,000 rows per request. Fetch every
  // batch so searches, initials and other filters operate on the full dataset.
  const cargoLoadToken=useRef(0);
  async function fetchCargoes(searchTerm=""){
    const token=++cargoLoadToken.current;
    const batchSize=1000;
    let offset=0;
    let all=[];
    setHasMore(true);
    while(true){
      const {data,error}=await supabase.from("cargoes").select("*")
        .order("updated",{ascending:false})
        .order("id",{ascending:true})
        .range(offset,offset+batchSize-1);
      if(token!==cargoLoadToken.current)return;
      if(error){console.error("Cargo loading failed",error);setHasMore(false);return;}
      const rows=data||[];
      all.push(...rows.map(normaliseCargo));
      setCargoes([...all]);
      offset+=rows.length;
      if(rows.length<batchSize)break;
    }
    if(token===cargoLoadToken.current){setHasMore(false);setCargoTotal(all.length);}
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
  // The positions_latest view can fail transiently during startup (for example
  // while the database is waking up). Retry here rather than requiring a full
  // browser refresh and another dashboard login.
  let data=null, error=null;
  for(let attempt=1;attempt<=4;attempt++){
    try {
      const result=await supabase.from("positions_latest").select("*").limit(10000);
      data=result.data;
      error=result.error;
    } catch(e){error=e;data=null;}
    if(!error && Array.isArray(data)) break;
    console.warn("fetchPositions attempt",attempt,"failed:",
      error?.message||String(error),"code:",error?.code,
      "details:",error?.details,"hint:",error?.hint);
    if(attempt<4) await new Promise(resolve=>setTimeout(resolve,750*attempt));
  }
  if(error || !Array.isArray(data)){
    console.error("fetchPositions failed after retries:",{
      message:error?.message,code:error?.code,details:error?.details,hint:error?.hint
    });
    return;
  }
  console.log("fetchPositions:",data.length,"rows");
  const mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  setVessels((data||[]).map(r=>{
    const rawDate=String(r.open_date||"");
    let fmtDate=rawDate;
    if(rawDate&&!/^\d{1,2}\s[A-Za-z]/.test(rawDate)){
      const d=new Date(rawDate);
      if(!isNaN(d))fmtDate=d.getDate()+" "+mn[d.getMonth()];
    }
    return{
      id:          String(r.id||""),
      vessel:      String(r.vessel_name||"").toUpperCase(),
      imoNo:       r.imo_no!=null?String(r.imo_no):null,
      operator:    r.operator||"",
      openPort:    r.port_name||"",
      date:        fmtDate,
      dwt:         r.dwt||null,
      built:       r.build_year||null,
      loa:         r.overall_length||null,
      beam:        r.beam||null,
      cbm:         r.cbm||null,
      coating:     r.coating_type_2||r.coating||r.coated||"",
      tag:         r.tag||"",
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
        iceClass: r.ice_class||null,
        lastCargo: r.last_3_cargoes||null,
        segment: r.segment||null,
        coated: r.coating_type_2||r.coating||r.coated||null,
      }
    };
  }));

  // Restore vessel-specific manual overrides, including tags and coating.
  // The positions_latest feed does not necessarily carry these fields.
  try {
    const {data: overrides, error: overrideError} = await supabase
      .from("vessel_overrides")
      .select("imo_no,vessel_name,operator,note,coating,ice_class,fuel,loa,beam,cbm,dwt,built,last_cargo,tag,tags,open_date,open_port,comment");
    if (overrideError) console.warn("vessel_overrides load:", overrideError);
    if (overrides?.length) {
      const byImo = {}, byName = {};
      overrides.forEach(o => {
        if (o.imo_no != null) byImo[String(o.imo_no)] = o;
        if (o.vessel_name) byName[String(o.vessel_name).trim().toUpperCase()] = o;
      });
      setVessels(prev => prev.map(v => {
        const o = (v.imoNo && byImo[v.imoNo]) || byName[v.vessel];
        if (!o) return v;
        const merged = {...v, spec:{...(v.spec||{})}};
        if (o.operator != null) merged.operator = o.operator;
        if (o.note != null) merged.notes = o.note;
        if (o.coating != null) merged.coating = o.coating;
        if (o.loa != null) merged.loa = o.loa;
        if (o.beam != null) merged.beam = o.beam;
        if (o.cbm != null) merged.cbm = o.cbm;
        if (o.dwt != null) merged.dwt = o.dwt;
        if (o.built != null) merged.built = o.built;
        if (o.tag != null || o.tags != null) merged.tag = o.tag ?? o.tags;
        if (o.open_date != null) {
          const dt = new Date(o.open_date + "T12:00:00");
          merged.date = Number.isNaN(dt.getTime()) ? o.open_date : `${dt.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()]}`;
        }
        if (o.open_port != null) merged.openPort = o.open_port;
        if (o.comment != null) merged.comment = o.comment;
        if (o.fuel != null) merged.spec.fuel = o.fuel;
        if (o.ice_class != null) merged.spec.iceClass = o.ice_class;
        if (o.last_cargo != null) merged.spec.lastCargo = o.last_cargo;
        return merged;
      }));
    }
  } catch(e) { console.error("vessel_overrides load:",e); }
}
  async function loadMoreCargoes(){
    // All pages are loaded by fetchCargoes; kept for legacy callers.
    return;
  }

  const renameV=useCallback((oldName,newName)=>{
    if(!newName||!newName.trim()||newName.trim().toUpperCase()===oldName)return;
    const n=newName.trim().toUpperCase();
    setVessels(prev=>{const next=prev.map(v=>v.vessel===oldName?{...v,vessel:n,updatedAt:new Date().toISOString()}:v);saveV(next);return next;});
    setCargoes(prev=>prev.map(c=>c.vessel===oldName?{...c,vessel:n}:c));
    setSel(n);
  },[]);

  // Persist ALL manual vessel edits independently of the external positions feed.
  // Serialize edits per vessel so rapid field changes cannot create duplicate rows.
  const updateV = useCallback(async (name, field, value) => {
    const vessel = vesselsRef.current.find(v => v.vessel === name);
    if (!vessel) { alert(`Cannot save ${name}: vessel not found`); return; }
    const now = new Date().toISOString();
    const cleanValue = value === "" || value === undefined ? null : value;
    setVessels(prev => {
      const next = prev.map(v => v.vessel !== name ? v : field.includes(".")
        ? {...v, updatedAt:now, [field.split(".")[0]]:{...(v[field.split(".")[0]]||{}),[field.split(".")[1]]:cleanValue}}
        : {...v, updatedAt:now, [field]:cleanValue, ...(field === "operator" ? {operatorManual:true} : {})});
      saveV(next);
      return next;
    });

    const fields = {
      operator:"operator", tag:"tag", tags:"tags", notes:"note",
      coating:"coating", loa:"loa", beam:"beam", cbm:"cbm",
      dwt:"dwt", built:"built", comment:"comment", openPort:"open_port",
      date:"open_date", "spec.iceClass":"ice_class", "spec.fuel":"fuel",
      "spec.lastCargo":"last_cargo"
    };
    const dbField = fields[field];
    if (!dbField) {
      console.error("No persistent override mapping for",field);
      alert(`The ${field} field cannot be saved yet. Please report this.`);
      return;
    }
    let dbValue = cleanValue;
    if (field === "date" && cleanValue != null) {
      const raw = String(cleanValue).trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
      if (iso) dbValue = iso;
      else {
        const m = raw.match(/^(\d{1,2})\s+([a-z]{3})(?:\s+(\d{4}))?$/i);
        const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
        const month = m ? months.indexOf(m[2].toLowerCase()) : -1;
        if (month < 0) { alert(`Invalid date: ${raw}. Change not saved.`); return; }
        const year = m[3] ? Number(m[3]) : Number(String(vessel.fileDate || now).slice(0,4));
        const d = new Date(Date.UTC(year,month,Number(m[1])));
        dbValue = d.toISOString().slice(0,10);
      }
    }
    const key = vessel.imoNo ? `imo:${vessel.imoNo}` : `name:${name}`;
    const prior = saveQueueRef.current.get(key) || Promise.resolve();
    const task = prior.catch(()=>{}).then(async () => {
      const table = supabase.from("vessel_overrides");
      const query = vessel.imoNo ? table.select("id").eq("imo_no",String(vessel.imoNo)) : table.select("id").ilike("vessel_name",name);
      const {data:existing,error:readError} = await query.limit(1);
      if (readError) throw readError;
      const patch = {[dbField]:dbValue,updated_at:new Date().toISOString()};
      let result;
      if (existing?.length) {
        result = await supabase.from("vessel_overrides").update(patch).eq("id",existing[0].id).select("id");
      } else {
        result = await supabase.from("vessel_overrides").insert({vessel_name:name,imo_no:vessel.imoNo||null,...patch}).select("id");
      }
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error("Supabase returned zero saved rows (check RLS permissions)");
      console.info("Vessel amendment saved",name,field,dbValue);
    });
    saveQueueRef.current.set(key,task);
    try { await task; }
    catch (e) {
      console.error("CRITICAL: vessel amendment NOT saved",name,field,e);
      alert(`SAVE FAILED for ${name} / ${field}: ${e.message || e}. Do not refresh; copy your changes before leaving.`);
    } finally { if (saveQueueRef.current.get(key) === task) saveQueueRef.current.delete(key); }
  }, []);

  // Cargo edits: confirm the database write before showing the new value.
  const updateC=useCallback(async(id,field,value)=>{
    const dbValue=(field==="from"||field==="to")?toISODate(value):value;
    const {data,error}=await supabase.from("cargoes").update({[field]:dbValue}).eq("id",id).select("id");
    if(error||!data?.length){
      const message=error?.message||"No row was updated (check Supabase RLS permissions).";
      console.error("Cargo save FAILED",{id,field,value,error});
      alert(`Cargo NOT saved (${field}): ${message}`);
      throw error||new Error(message);
    }
    const displayValue=(field==="from"||field==="to")?(() => {
      if(!dbValue)return "";
      const dt=new Date(dbValue+"T12:00:00");
      return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
    })():value;
    setCargoes(prev=>prev.map(c=>String(c.id)===String(id)?{...c,[field]:displayValue}:c));
    return true;
  },[]);

  const addVessels = useCallback(async (parsed) => {
    const vdb = window.vesselDB || vesselDB;
    const nowIso = new Date().toISOString();
    let r = { added: 0, updated: 0, total: 0 };

    function extractCoating(text){
      if(!text) return "";
      const t=text.toLowerCase();
      if(t.includes("phenolic")) return "Phenolic";
      if(t.includes("epoxy")) return "Epoxy";
      if(t.includes("zinc silicate")||t.includes("zinc sil")) return "Zinc Silicate";
      if(t.includes("marineline")||t.includes("marine line")) return "Marineline";
      if(t.includes("interline")) return "Interline";
      if(t.includes("coated")) return "Coated";
      if(t.includes("uncoated")) return "Uncoated";
      return "";
    }

    setVessels(prev => {
      const before = prev.length;
      // We pass nowIso into the local state so the UI updates immediately
      const next = mergeVessels(prev, parsed.map(p => {
        const master = vdb[String(p.vessel || "").toLowerCase().trim()];
        return {...p, coating: p.coating || master?.coating_type_2 || master?.coating || master?.coated || master?.coating_type || "", fileDate: nowIso};
      }), vdb);
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
      const base = enrichV(v, vdb);
      const master = vdb[String(v.vessel || "").toLowerCase().trim()];
      const ev = {...base, coating: base.coating || master?.coating_type_2 || master?.coating || master?.coated || master?.coating_type || ""};
      
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
    else console.log("positions saved ok:", rows.length, "rows");
    
    return r;
  }, [vesselDB, saveV, saveSnapshot]);

  // Bridge Fleet's batch import to the existing Positions save handler.
  useEffect(() => {
    window.steemAddFleetPositions = addVessels;
    return () => { if (window.steemAddFleetPositions === addVessels) delete window.steemAddFleetPositions; };
  }, [addVessels]);

  const addCargoes=useCallback(async(parsed)=>{
    const stamped=parsed.map((f,i)=>({
      ...f,
      entered_by:f.entered_by||(localStorage.getItem("signal_user")||"H"),
      id:f.id||("c_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6)),
      updated:new Date().toISOString(),
    }));
    if(!stamped.length)return 0;
    const rows=stamped.map(c=>({...c,intelligence:c.intelligence||null,from:toISODate(c.from),to:toISODate(c.to)}));
    const {data,error}=await supabase.from("cargoes").upsert(rows,{onConflict:"id"}).select("*");
    if(error||!data?.length){
      const message=error?.message||"Supabase did not confirm any saved cargo rows.";
      console.error("Cargo import NOT saved",error,rows);
      alert("Cargo import NOT saved: "+message);
      throw error||new Error(message);
    }
    const saved=data.map(normaliseCargo);
    setCargoes(prev=>{
      const byId=new Map(prev.map(c=>[String(c.id),c]));
      for(const c of saved)byId.set(String(c.id),c);
      return [...byId.values()];
    });
    setCargoTotal(prev=>prev+saved.filter(c=>!cargoes.some(old=>String(old.id)===String(c.id))).length);
    return saved.length;
  },[cargoes]);

  const addV=useCallback(async(v)=>{
    const imo = String(v.imoNo || v.imo_no || "").trim();
    if(imo && !/^\d{7}$/.test(imo)) { alert("IMO number must contain 7 digits."); return; }
    const vessel = String(v.vessel || "").trim();
    if(!vessel) return;
    const localV = enrichV({...v,imoNo:imo || null},vesselDB);
    setVessels(prev=>{
      const idx=prev.findIndex(x=>x.vessel?.toLowerCase()===vessel.toLowerCase());
      const next=idx>=0?prev.map((x,i)=>i===idx?{...x,...localV}:x):[...prev,localV];
      saveV(next);return next;
    });
    const now = new Date().toISOString();
    const row = {
      vessel_name:vessel,
      imo_no:imo || null,
      operator:v.operator || null,
      port_name:v.openPort || null,
      open_date:v.date || null,
      dwt:v.dwt || null,
      coating:v.coating || null,
      details:v.comment || null,
      updated_at:now,
      updated_at_manual:now
    };
    const {error}=await supabase.from("positions").upsert([row],{onConflict:"vessel_name"});
    if(error) console.error("Add vessel error:",error);
  },[vesselDB]);
  const addC=useCallback(async(c)=>{
    const row={...c,
      entered_by:c.entered_by||(localStorage.getItem("signal_user")||"H"),
      id:c.id||("c_"+Date.now()+"_"+Math.random().toString(36).slice(2,6)),
      updated:c.updated||new Date().toISOString(),
      intelligence:c.intelligence||null,
      from:toISODate(c.from),to:toISODate(c.to)
    };
    const {data,error}=await supabase.from("cargoes").upsert([row],{onConflict:"id"}).select("*");
    if(error||!data?.length){
      const message=error?.message||"Supabase did not confirm the new cargo.";
      console.error("New cargo NOT saved",error,row);
      alert("Cargo NOT saved: "+message);
      throw error||new Error(message);
    }
    const saved=normaliseCargo(data[0]);
    setCargoes(prev=>[saved,...prev.filter(x=>String(x.id)!==String(saved.id))]);
    setCargoTotal(prev=>prev+1);
    if(saved.status==="FIXED"&&saved.vessel&&saved.disch){setVessels(prev=>{const next=prev.map(v=>v.vessel?.toLowerCase()!==saved.vessel.toLowerCase()?v:{...v,openPort:saved.disch});saveV(next);return next;});}
    return saved;
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
  return <DesktopApp {...props}/>;
}
