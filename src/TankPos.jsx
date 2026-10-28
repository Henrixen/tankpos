// CACHE_BUSTER_030
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseclient";
import { isMobile } from "./constants";
import { enrichV, normaliseCargo as normaliseCargoBase, mergeVessels, toISODate } from "./utils";
import { saveV, saveSnapshot, loadHistory } from "./supabaseHelpers";
import { v4 as uuidv4 } from 'uuid';
import DesktopApp from "./DesktopApp";


import {useBrokerLiveData,getBrokerSession,brokerRpc,beginBrokerWrite,chooseBrokerConflict,applyWhenIdle} from "./BrokerWorkspace";
import {mapBrokerPosition as mapPositionBase,applyBrokerOverride as applyOverrideBase} from "./brokerData";
import {dedupePositions,positionEditor,selectPositionOverrides} from "./PositionHistory";
const mapBrokerPosition=r=>({...mapPositionBase(r),entered_by:r.entered_by||null});
const applyBrokerOverride=(v,o)=>({...applyOverrideBase(v,o),entered_by:o?o.entered_by||null:v.entered_by||null});
const normaliseCargo=r=>({...normaliseCargoBase(r),_brokerRaw:{...r}});

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
  const cargoesRef=useRef([]);
  cargoesRef.current=cargoes;
  const initialRead=useRef(Promise.resolve());
  const positionRefreshVersion=useRef(new Map());
  const positionSyncSince=useRef(new Date(Date.now()-60000).toISOString());
  const saveQueueRef=useRef(new Map());
  const ownPositionAcks=useRef(new Map()),ownCargoAcks=useRef(new Map());
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
  initialRead.current=Promise.all([fetchPositions(),fetchCargoes()]);
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
  setVessels(dedupePositions((data||[]).map(mapBrokerPosition)));

  // Restore vessel-specific manual overrides, including tags and coating.
  // The positions_latest feed does not necessarily carry these fields.
  try {
    const {data: overrides, error: overrideError} = await supabase
      .from("vessel_overrides")
      .select("id,updated_at,entered_by,imo_no,vessel_name,operator,note,coating,ice_class,fuel,loa,beam,cbm,dwt,built,last_cargo,tag,tags,open_date,open_port,comment");
    if (overrideError) console.warn("vessel_overrides load:", overrideError);
    if (overrides?.length) {
      const byImo = {}, byName = {};
      selectPositionOverrides(overrides).forEach(o => {
        if (o.imo_no != null) byImo[String(o.imo_no)] = o;
        if (o.vessel_name) byName[String(o.vessel_name).trim().toUpperCase()] = o;
      });
      setVessels(prev => prev.map(v => {
        const o = (v.imoNo && byImo[v.imoNo]) || byName[v.vessel];
        if (!o) return v;
        return applyBrokerOverride(v,o);
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
    const actor=positionEditor(getBrokerSession()?.user?.initials);
    const now = new Date().toISOString();
    const cleanValue = value === "" || value === undefined ? null : value;
    setVessels(prev => {
      const next = prev.map(v => v.vessel !== name ? v : field.includes(".")
        ? {...v, entered_by:actor||v.entered_by, updatedAt:now, [field.split(".")[0]]:{...(v[field.split(".")[0]]||{}),[field.split(".")[1]]:cleanValue}}
        : {...v, entered_by:actor||v.entered_by, updatedAt:now, [field]:cleanValue, ...(field === "operator" ? {operatorManual:true} : {})});
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
    const queued=saveQueueRef.current.has(key);
    const prior = saveQueueRef.current.get(key) || Promise.resolve();
    const task = prior.catch(()=>{}).then(async () => {
      const currentSession=getBrokerSession();if(!currentSession)throw new Error("Please log in again before saving.");
      const endWrite=beginBrokerWrite();
      try{
        let expected=(queued&&ownPositionAcks.current.has(key+":"+dbField)?ownPositionAcks.current.get(key+":"+dbField):vessel._brokerOverrides?.[dbField])??null;
        let result=await brokerRpc("broker_position_patch",{p_token:currentSession.token,p_name:name,p_imo:vessel.imoNo||null,p_field:dbField,p_value:dbValue,p_expected:expected});
        while(result?.conflict){
          const overwrite=await chooseBrokerConflict({record:name,field,mine:value,theirs:result.current});
          if(!overwrite){
            ownPositionAcks.current.set(key+":"+dbField,result.current??null);
            const source=mapBrokerPosition(vessel._brokerSource||{});
            setVessels(prev=>prev.map(v=>{
              if(v.vessel!==name)return v;
              const restored=applyBrokerOverride({...v,...(field.includes('.')?{spec:{...v.spec,[field.split('.')[1]]:source.spec?.[field.split('.')[1]]}}:{[field]:source[field]})},result.row||{});
              return restored;
            }));
            return;
          }
          expected=result.current;
          result=await brokerRpc("broker_position_patch",{p_token:currentSession.token,p_name:name,p_imo:vessel.imoNo||null,p_field:dbField,p_value:dbValue,p_expected:expected});
        }
        ownPositionAcks.current.set(key+":"+dbField,result.row?.[dbField]??null);
        setVessels(prev=>dedupePositions(prev.map(v=>v.vessel===name?applyBrokerOverride(v,result.row||{}):v)));
        window.dispatchEvent(new CustomEvent("position-saved",{detail:{name,imo:vessel.imoNo}}));
      }finally{endWrite();}
      console.info("Vessel amendment saved",name,field,dbValue);
    });
    saveQueueRef.current.set(key,task);
    try { await task; }
    catch (e) {
      console.error("CRITICAL: vessel amendment NOT saved",name,field,e);
      alert(`SAVE FAILED for ${name} / ${field}: ${e.message || e}. Do not refresh; copy your changes before leaving.`);
    } finally { if (saveQueueRef.current.get(key) === task) saveQueueRef.current.delete(key); }
  }, []);

  // Cargo edits: optimistic rendering, serialized writes per cell, and safe rollback.
  // Supabase remains authoritative, but the editor never waits for the network to paint.
  const cargoCellQueueRef=useRef(new Map());
  const cargoCellVersionRef=useRef(new Map());
  const updateC=useCallback((id,field,value)=>{
    const key=String(id)+":"+field;
    // Clearing a cell is an intentional edit. Nullable typed columns need SQL NULL,
    // not an empty string (which Postgres rejects for dates / constrained fields).
    const cleared=value===null||value===undefined||String(value).trim()==="";
    const dbValue=(field==="from"||field==="to")?(cleared?null:toISODate(value))
      :(cleared&&["intelligence","p_and_c"].includes(field)?null:(cleared?"":value));
    const displayValue=(field==="from"||field==="to")?(() => {
      if(!dbValue)return "";
      const dt=new Date(dbValue+"T12:00:00");
      return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
    })():value;
    const baseRow=cargoesRef.current.find(c=>String(c.id)===String(id));
    const previous=baseRow?.[field];
    const version=(cargoCellVersionRef.current.get(key)||0)+1;
    cargoCellVersionRef.current.set(key,version);
    setCargoes(prev=>prev.map(c=>{
      if(String(c.id)!==String(id))return c;
      return {...c,[field]:displayValue};
    }));
    const queued=cargoCellQueueRef.current.has(key);
    const preceding=cargoCellQueueRef.current.get(key)||Promise.resolve();
    const task=preceding.catch(()=>{}).then(async()=>{
      const currentSession=getBrokerSession();if(!currentSession)throw new Error("Please log in again before saving.");
      const endWrite=beginBrokerWrite();
      try{
        let expected=(queued&&ownCargoAcks.current.has(key)?ownCargoAcks.current.get(key):baseRow?._brokerRaw?.[field])??null;
        let result=await brokerRpc("broker_cargo_patch",{p_token:currentSession.token,p_id:String(id),p_field:field,p_value:dbValue,p_expected:expected});
        while(result?.conflict){
          const overwrite=await chooseBrokerConflict({record:baseRow?.vessel||baseRow?.charterer||String(id),field,mine:value,theirs:result.current});
          if(!overwrite){ownCargoAcks.current.set(key,result.current??null);setCargoes(prev=>prev.map(c=>String(c.id)===String(id)?normaliseCargo(result.row):c));return false;}
          expected=result.current;
          result=await brokerRpc("broker_cargo_patch",{p_token:currentSession.token,p_id:String(id),p_field:field,p_value:dbValue,p_expected:expected});
        }
        ownCargoAcks.current.set(key,result.row?.[field]??null);
        setCargoes(prev=>prev.map(c=>String(c.id)===String(id)?{...c,_brokerRaw:result.row}:c));
      }catch(error){
        if(cargoCellVersionRef.current.get(key)===version)setCargoes(prev=>prev.map(c=>String(c.id)===String(id)&&c[field]===displayValue?{...c,[field]:previous}:c));
        alert(`Cargo NOT saved (${field}): ${error.message}`);throw error;
      }finally{endWrite();}
      return true;
    });
    cargoCellQueueRef.current.set(key,task);
    task.finally(()=>{if(cargoCellQueueRef.current.get(key)===task)cargoCellQueueRef.current.delete(key);}).catch(()=>{});
    return task;
  },[cargoes]);

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

  async function liveCargoEvents(events){
    await applyWhenIdle(()=>{
      const next=new Map(cargoesRef.current.map(c=>[String(c.id),c]));
      for(const event of events){
        const row=event.eventType==='DELETE'?event.old:event.new,key=String(row?.id);
        if(event.eventType==='DELETE')next.delete(key);else if(row?.id!=null){const old=next.get(key);if(!old||!(Date.parse(old._brokerRaw?.updated)>Date.parse(row.updated)))next.set(key,normaliseCargo(row));}
      }
      const rows=[...next.values()];cargoesRef.current=rows;setCargoes(rows);setCargoTotal(rows.length);
    });
  }
  async function livePositions(identities){
    const version=Symbol('position-refresh');
    const identityKeys=x=>[x.name&&'name:'+String(x.name).toUpperCase(),x.imo!=null&&'imo:'+String(x.imo)].filter(Boolean);
    const keys=identities.flatMap(identityKeys);keys.forEach(k=>positionRefreshVersion.current.set(k,version));
    const currentIdentity=x=>identityKeys(x).every(k=>!keys.includes(k)||positionRefreshVersion.current.get(k)===version);
    const direct=identities.filter(x=>x.overrideEvent&&vesselsRef.current.some(v=>(x.imo!=null&&String(x.imo)===v.imoNo)||String(x.name).toUpperCase()===v.vessel));
    if(direct.length)await applyWhenIdle(()=>{
      const next=vesselsRef.current.map(v=>{
        const event=direct.find(x=>(x.imo!=null&&String(x.imo)===v.imoNo)||String(x.name).toUpperCase()===v.vessel)?.overrideEvent;
        if(!event||!currentIdentity({name:v.vessel,imo:v.imoNo}))return v;
        const source=v._brokerSource?mapBrokerPosition(v._brokerSource):v;
        return applyBrokerOverride({...source,coating:source.coating||(!v._brokerOverrides?.coating?v.coating:source.coating),flag:v.flag},event.eventType==='DELETE'?null:event.new);
      });vesselsRef.current=dedupePositions(next);setVessels(vesselsRef.current);
    });
    identities=identities.filter(x=>!direct.includes(x));if(!identities.length)return;
    const names=[...new Set(identities.filter(x=>x.imo==null||x.imo==='').map(x=>x.name).filter(Boolean))];
    const imos=[...new Set(identities.map(x=>x.imo!=null?String(x.imo):null).filter(Boolean))];
    const base=[],overrides=[];
    for(let offset=0;offset<Math.max(names.length,imos.length);offset+=50){
      for(const [column,values]of [['vessel_name',names.slice(offset,offset+50)],['imo_no',imos.slice(offset,offset+50)]]){
        if(!values.length)continue;
        const [{data,error},{data:manual,error:manualError}]=await Promise.all([
          supabase.from('positions_latest').select('*').in(column,values).limit(1000),
          supabase.from('vessel_overrides').select('*').in(column,values).limit(1000)
        ]);
        if(error||manualError)throw new Error('Position refresh: '+(error||manualError).message);base.push(...(data||[]));overrides.push(...(manual||[]));
      }
    }
    const key=v=>v.imoNo?'imo:'+v.imoNo:'name:'+String(v.vessel||'').toUpperCase();
    const byImo=new Map(),byName=new Map();
    selectPositionOverrides(overrides).forEach(o=>{if(o.imo_no!=null)byImo.set(String(o.imo_no),o);if(o.vessel_name)byName.set(String(o.vessel_name).toUpperCase(),o);});
    const mapped=new Map(dedupePositions(base.map(mapBrokerPosition)).map(v=>{return [key(v),applyBrokerOverride(v,(v.imoNo&&byImo.get(v.imoNo))||byName.get(v.vessel))];}));
    await applyWhenIdle(()=>{
      const matching=v=>identities.some(x=>(x.imo!=null&&String(x.imo)===v.imoNo)||(x.name&&String(x.name).toUpperCase()===v.vessel));
      const next=[];
      for(const v of vesselsRef.current){if(!matching(v)||!currentIdentity({name:v.vessel,imo:v.imoNo})){next.push(v);mapped.delete(key(v));continue;}const replacement=mapped.get(key(v));if(replacement){next.push(replacement);mapped.delete(key(v));}}
      next.push(...[...mapped.values()].filter(v=>currentIdentity({name:v.vessel,imo:v.imoNo})));vesselsRef.current=dedupePositions(next);setVessels(vesselsRef.current);
    });
  }
  async function brokerReconcile(){
    await initialRead.current;
    const meta=async(table,columns)=>{
      const all=[];for(let from=0;;from+=1000){const {data,error}=await supabase.from(table).select(columns).order(table==='cargoes'?'id':'vessel_name',{ascending:true}).range(from,from+999);if(error)throw new Error(table+' metadata: '+error.message);all.push(...(data||[]));if(!data||data.length<1000)break;}return all;
    };
    // Metadata only after subscribing/reconnecting or returning to the page.
    // Normal live events do not re-download the full tables.
    const catchupStarted=new Date().toISOString();
    const currentCargo=new Map(cargoesRef.current.map(c=>[String(c.id),c]));
    const changed=async(table,column)=>{
      const all=[];for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from(table).select('vessel_name,'+column).gte(column,positionSyncSince.current).order(column,{ascending:true}).order('vessel_name',{ascending:true}).range(offset,offset+499);
        if(error)throw new Error(table+' catch-up: '+error.message);
        all.push(...(data||[]));if(!data||data.length<500)break;
      }return all;
    };
    // Query changed base records, never repeatedly sort/page the unified view.
    const [cm,manual,external,om]=await Promise.all([meta('cargoes','id,updated'),changed('positions','updated_at'),changed('positions_external','last_update_spotship'),changed('vessel_overrides','updated_at')]);
    const cargoIds=new Set(cm.map(c=>String(c.id))),cargoChanges=[];
    for(const c of cm){const old=currentCargo.get(String(c.id));if(!old||old._brokerRaw?.updated!==c.updated)cargoChanges.push(c.id);}
    const events=[...currentCargo.values()].filter(c=>!cargoIds.has(String(c.id))).map(c=>({eventType:'DELETE',old:{id:c.id}}));
    for(let i=0;i<cargoChanges.length;i+=100){const {data,error}=await supabase.from('cargoes').select('*').in('id',cargoChanges.slice(i,i+100));if(error)throw error;(data||[]).forEach(row=>events.push({eventType:'UPDATE',new:row}));}
    if(events.length)await liveCargoEvents(events);
    const changes=new Map();
    for(const row of [...manual,...external,...om])if(row.vessel_name)changes.set(row.vessel_name,{name:row.vessel_name});
    if(changes.size)await livePositions([...changes.values()]);
    positionSyncSince.current=new Date(Date.parse(catchupStarted)-60000).toISOString();
  }

  useBrokerLiveData(liveCargoEvents,livePositions,brokerReconcile);

  const props={vessels,cargoes,cargoTotal,onUpdateV:updateV,onRenameV:renameV,onUpdateC:updateC,onAddVessels:addVessels,onAddCargoes:addCargoes,onAddV:addV,onAddC:addC,onDelV:delV,onDelC:delC,hasMore,onLoadMore:loadMoreCargoes,onCargoSearch,vesselDBLoaded,vesselDBLoading,onLoadVesselDB:loadVesselDB};
  return <DesktopApp {...props}/>;
}

