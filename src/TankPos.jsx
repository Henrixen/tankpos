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
  const [mobile,setMobile]=useState(()=>isMobile());
  const [fileDate, setFileDate] = useState(() => new Date().toISOString().slice(0,10));

  async function loadVesselDB(){
    if(vesselDBLoaded||vesselDBLoading) return;
    setVesselDBLoading(true);
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while(true){
      const {data, error} = await supabase.from("vessels_db").select("vessel,dwt,built,loa,beam,cbm,ice_class,fuel,operator").range(from, from+pageSize-1);
      if(error || !data || data.length === 0) break;
      allRows = [...allRows, ...data];
      if(data.length < pageSize) break;
      from += pageSize;
    }
    const map = {};
    allRows.forEach(r => { if(r.vessel) map[r.vessel.toLowerCase().trim()] = r; });
    setVesselDB(map);
    window.vesselDB = map;
    setVesselDBLoaded(true);
    setVesselDBLoading(false);
    console.log("vesselDB loaded on demand:", allRows.length);
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
      const t=searchTerm.trim();
      const{data,error}=await supabase.from("cargoes").select("*")
        .or(`charterer.ilike.%${t}%,vessel.ilike.%${t}%,load.ilike.%${t}%,disch.ilike.%${t}%,cargo.ilike.%${t}%,status.ilike.%${t}%`)
        .range(0,499).order("updated",{ascending:false});
      if(error){console.error(error);return;}
      setCargoes(data.map(normaliseCargo));
    } else {
      const[{data,error},{count}]=await Promise.all([
        supabase.from("cargoes").select("*").range(0,199).order("updated",{ascending:false}),
        supabase.from("cargoes").select("*",{count:"exact",head:true})
      ]);
      if(error){console.error(error);return;}
      setCargoes(data.map(normaliseCargo));
      setHasMore(data.length===200);
      if(count!=null)setCargoTotal(count);
    }
  }

  async function fetchPositions(){
  const{data,error}=await supabase.from("positions_latest").select("*").limit(10000);
  if(error){console.error("fetchPositions error:",error);return;}
  console.log("fetchPositions:",data?.length,"rows");
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
      operator:    r.operator||"",
      openPort:    r.port_name||"",
      date:        fmtDate,
      dwt:         r.dwt||null,
      built:       r.build_year||null,
      loa:         r.overall_length||null,
      beam:        r.beam||null,
      cbm:         r.cbm||null,
      comment:     r.details||"",
      last3:       r.last_3_cargoes||"",
      dirtyClean:  r.dirty_clean||"",
      iceClass:    r.ice_class||"",
      segment:     r.segment||"",
      superRegion: r.super_region||"",
      updatedAt:   r.updated_at||"",
      fileDate:    r.file_date||null,
      source:      r.source||"external",
      // ✅ CREATE SPEC OBJECT FROM VIEW COLUMNS
      spec: {
        iceClass: r.ice_class||null,
        lastCargo: r.last_3_cargoes||null,
        segment: r.segment||null,
        coated: null,  // Not in view, could add if needed
      }
    };
  }));
}
  async function loadMoreCargoes(){
    const{data,error}=await supabase.from("cargoes").select("*")
      .range(cargoes.length,cargoes.length+199).order("updated",{ascending:false});
    if(error){console.error(error);return;}
    if(data.length<200) setHasMore(false);
    setCargoes(prev=>[...prev,...data.map(normaliseCargo)]);
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
    operator: "operator",
    dwt: "dwt",
    beam: "beam",
    cbm: "cbm"
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
}, []);

  // Universal cargo updater — optimistic local update + Supabase write
  const updateC=useCallback(async(id,field,value)=>{
    const displayValue=(field==="from"||field==="to")?(() => {
      const iso=toISODate(value);
      if(!iso) return value;
      const dt=new Date(iso);
      return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
    })():value;
    setCargoes(prev=>prev.map(c=>c.id===id?{...c,[field]:displayValue}:c));
    const dbValue=(field==="from"||field==="to")?toISODate(value):value;
    const{error}=await supabase.from("cargoes").update({[field]:dbValue}).eq("id",id);
    if(error)console.error(error);
  },[]);

  const addVessels = useCallback(async (parsed) => {
    const vdb = window.vesselDB || vesselDB;
    const nowIso = new Date().toISOString(); // The "Current Time" for the file upload
    let r = { added: 0, updated: 0, total: 0 };

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

  const addCargoes=useCallback(async(parsed)=>{
    const stamped=parsed.map((f,i)=>normaliseCargo({
      ...f,
      id: f.id||("c_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6)),
      updated: new Date().toISOString(),
    }));
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

  const props={vessels,cargoes,cargoTotal,onUpdateV:updateV,onRenameV:renameV,onUpdateC:updateC,onAddVessels:addVessels,onAddCargoes:addCargoes,onAddV:addV,onAddC:addC,onDelV:delV,onDelC:delC,hasMore,onLoadMore:loadMoreCargoes,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB:loadVesselDB};
  return <DesktopApp {...props}/>;
}
