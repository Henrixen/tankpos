import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { fmtN } from "./utils";

const CARD = { background:C.bg2, border:"1px solid "+C.bd, borderRadius:10, padding:"14px 16px" };
const TH_ = { fontSize:10, fontWeight:700, color:C.faint, textTransform:"uppercase", letterSpacing:"0.06em",
  padding:"6px 10px", borderBottom:"1px solid "+C.bd, textAlign:"left", whiteSpace:"nowrap", cursor:"pointer", userSelect:"none" };
const TD_ = { fontSize:12, padding:"6px 10px", borderBottom:"1px solid "+C.bd2, color:C.dim, whiteSpace:"nowrap",
  overflow:"hidden", textOverflow:"ellipsis", maxWidth:200 };
const BTN = (active,col="#58a6ff") => ({
  fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:6, cursor:"pointer",
  border:`1px solid ${active?col+"88":C.bd}`, background:active?col+"22":"transparent",
  color:active?col:C.faint, fontFamily:"inherit", whiteSpace:"nowrap",
});
const CHIP = (active,col="#f5a623") => ({
  fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:5, cursor:"pointer",
  border:`1px solid ${active?col+"88":C.bd}`, background:active?col+"22":"transparent",
  color:active?col:C.faint, fontFamily:"inherit", whiteSpace:"nowrap",
});
const INPUT = { background:C.bg3, border:"1px solid "+C.bd, borderRadius:5, color:C.tx, fontFamily:"inherit",
  fontSize:12, padding:"5px 8px", outline:"none" };

const CELL_COMMON = { fontSize:12, fontFamily:"inherit", boxSizing:"border-box", height:22, lineHeight:"16px", padding:"2px 4px", borderRadius:3 };

const normName = s => String(s||"").trim().replace(/\s+/g," ").toUpperCase();
const normIMO  = v => {
  const s = String(v??"").replace(/\D/g,"");
  return s || "";
};
const newer = (a,b) => {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta >= tb;
};

function EditCell({ value, onSave, placeholder="—", width=140, bold=false, color=null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = React.useRef(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(value||""); }, [value, editing]);

  function commit() {
    setEditing(false);
    const t = (draft||"").trim();
    if (t !== (value||"")) onSave(t);
  }
  if (editing) {
    return (
      <input ref={ref} value={draft} onChange={e=>setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(); } if(e.key==="Escape"){ setDraft(value||""); setEditing(false); } }}
        style={{ ...CELL_COMMON, width, background:C.bg3, border:"1px solid "+C.bd, color:C.tx, outline:"none" }}/>
    );
  }
  return (
    <div onClick={()=>{ setDraft(value||""); setEditing(true); }}
      style={{ ...CELL_COMMON, cursor:"pointer", color: value?(color||(bold?C.tx:C.dim)):C.faint, fontWeight:bold?600:400, minWidth:width, border:"1px solid transparent" }}
      title="Click to edit">
      {value || placeholder}
    </div>
  );
}

function SelectCell({ value, options, onSave, width=140 }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select autoFocus value={value||""}
        onChange={e=>{ onSave(e.target.value); setEditing(false); }}
        onBlur={()=>setEditing(false)}
        style={{ ...CELL_COMMON, width, background:C.bg3, border:"1px solid "+C.bd, color:C.tx, outline:"none" }}>
        <option value="">—</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <div onClick={()=>setEditing(true)}
      style={{ ...CELL_COMMON, cursor:"pointer", color: value?"#4ade80":C.faint, minWidth:width, border:"1px solid transparent" }}
      title="Click to edit">
      {value || "—"}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={onCancel}>
      <div style={{ ...CARD, maxWidth:380, padding:20 }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:13, color:C.tx, marginBottom:16 }}>{message}</div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={BTN(false)}>Cancel</button>
          <button onClick={onConfirm} style={BTN(true,"#ff6b6b")}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// Supabase .in() URLs become unwieldy with a large roster.
// Query in modest chunks while still keeping the number of requests low.
async function fetchInChunks(table, select, column, values, chunkSize=120) {
  const clean = [...new Set(values.filter(Boolean))];
  if (!clean.length) return [];
  const out = [];
  for (let i=0; i<clean.length; i+=chunkSize) {
    const chunk = clean.slice(i,i+chunkSize);
    const {data,error} = await supabase.from(table).select(select).in(column,chunk);
    if (error) throw error;
    if (data?.length) out.push(...data);
  }
  return out;
}

export default function OutsidersTab({ compact=false }) {
  const [rows, setRows] = useState([]);
  const [positionsByIMO, setPositionsByIMO] = useState({});
  const [positionsByName, setPositionsByName] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState(() => new Set());
  const [reportedOnly, setReportedOnly] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vessel:"", imo:"", dwt:"", built:"", source_operator:"" });
  const [addStatus, setAddStatus] = useState(null);
  const [page, setPage] = useState(1);
  const [linkStatus, setLinkStatus] = useState(null);
  const PAGE_SIZE = 100;

  // Collapse duplicate static rows before React ever sees them.
  // The vessel name is the roster identity; IMO is the preferred live-data identity.
  function canonicaliseRoster(input) {
    const byName = new Map();

    for (const raw of input||[]) {
      const nameKey = normName(raw.vessel);
      const imo = normIMO(raw.imo);
      // IMO is the real vessel identity. Name is only a fallback when IMO is absent,
      // so two ships with the same name but different IMO remain separate.
      const key = imo ? `IMO:${imo}` : `NAME:${nameKey||JSON.stringify(raw)}`;

      const row = {
        ...raw,
        imo: imo || null,
        _nameKey: nameKey,
      };

      const prev = byName.get(key);
      if (!prev) {
        byName.set(key,row);
        continue;
      }

      // Prefer the record that has an IMO; otherwise prefer newest static edit.
      const primary =
        (!prev.imo && row.imo) ? row :
        (prev.imo && !row.imo) ? prev :
        newer(row.updated_at,prev.updated_at) ? row : prev;
      const secondary = primary===row ? prev : row;

      byName.set(key,{
        ...secondary,
        ...primary,
        imo: primary.imo || secondary.imo || null,
        dwt: primary.dwt || secondary.dwt || null,
        built: primary.built || secondary.built || null,
        coating: primary.coating || secondary.coating || null,
        source_operator: primary.source_operator || secondary.source_operator || null,
        controlled_by: primary.controlled_by || secondary.controlled_by || null,
        pic: primary.pic || secondary.pic || null,
        notes: primary.notes || secondary.notes || null,
        manual_area: primary.manual_area || secondary.manual_area || null,
        manual_port: primary.manual_port || secondary.manual_port || null,
        manual_open_date: primary.manual_open_date || secondary.manual_open_date || null,
        _nameKey: nameKey,
      });
    }

    return [...byName.values()];
  }

  // Resolve missing IMO/spec details from vessels_db by vessel name.
  async function resolveRoster(roster) {
    const names = roster.map(r=>r.vessel).filter(Boolean);
    let dbRows = [];
    try {
      dbRows = await fetchInChunks(
        "vessels_db",
        "*",
        "vessel",
        names
      );
    } catch (e) {
      console.warn("outsiders vessels_db lookup:",e);
    }

    const dbByName = {};
    dbRows.forEach(v=>{
      const k=normName(v.vessel);
      if(k && !dbByName[k]) dbByName[k]=v;
    });

    function fleetOwner(db){
      if(!db) return null;
      return db.owner
        || db.registered_owner
        || db.owner_name
        || db.commercial_owner
        || db.group_owner
        || db.shipowner
        || null;
    }

    return roster.map(r=>{
      const db = dbByName[normName(r.vessel)];
      return {
        ...r,
        imo: normIMO(r.imo) || normIMO(db?.imo) || null,
        dwt: r.dwt || db?.dwt || null,
        built: r.built || db?.built || null,
        source_operator: r.source_operator || db?.operator || null,
        owner: fleetOwner(db),
      };
    });
  }

  // Repair the static roster quietly:
  // - null-IMO duplicate rows for a vessel are removed
  // - the canonical record is upserted by IMO
  // This means a vessel only needs to be added to outsider_vessels once.
  async function persistResolvedLinks(before, after) {
    const oldByName = {};
    before.forEach(r=>{ oldByName[normName(r.vessel)] = r; });

    const repaired = after.filter(r=>{
      const old = oldByName[normName(r.vessel)];
      return r.imo && (!old?.imo || normIMO(old.imo)!==normIMO(r.imo));
    });

    if (!repaired.length) return 0;

    let count = 0;
    for (const r of repaired) {
      try {
        // Remove obsolete null-IMO duplicates for the same named vessel first.
        await supabase.from("outsider_vessels")
          .delete()
          .is("imo",null)
          .ilike("vessel",r.vessel);

        const payload = {
          imo: r.imo,
          vessel: r.vessel,
          dwt: r.dwt||null,
          built: r.built||null,
          source_operator: r.source_operator||null,
          controlled_by: r.controlled_by||null,
          pic: r.pic||null,
          notes: r.notes||null,
          manual_area: r.manual_area||null,
          manual_port: r.manual_port||null,
          manual_open_date: r.manual_open_date||null,
          updated_at: r.updated_at || new Date().toISOString(),
        };
        // Do not rely on an IMO UNIQUE constraint: older outsider_vessels
        // tables may not have one. Update if the IMO exists, otherwise insert.
        const {data:existingByImo,error:findErr} = await supabase
          .from("outsider_vessels")
          .select("imo")
          .eq("imo",r.imo)
          .limit(1);

        let error = findErr;
        if(!error){
          if(existingByImo?.length){
            ({error} = await supabase.from("outsider_vessels")
              .update(payload)
              .eq("imo",r.imo));
          } else {
            ({error} = await supabase.from("outsider_vessels")
              .insert(payload));
          }
        }

        if (!error) count++;
        else console.warn("outsider auto-link save:",error);
      } catch(e) {
        console.warn("outsider auto-link:",e);
      }
    }
    return count;
  }

  async function fetchLivePositions(roster) {
    const imos = roster.map(r=>normIMO(r.imo)).filter(Boolean);
    const names = roster.map(r=>r.vessel).filter(Boolean);

    let pData = [];
    try {
      const [byImo,byName] = await Promise.all([
        fetchInChunks(
          "positions_latest",
          "imo_no,vessel_name,port_name,open_date,updated_at,super_region",
          "imo_no",
          imos
        ),
        // Name fallback is essential for roster rows whose IMO cannot yet be resolved.
        fetchInChunks(
          "positions_latest",
          "imo_no,vessel_name,port_name,open_date,updated_at,super_region",
          "vessel_name",
          names
        )
      ]);
      pData = [...byImo,...byName];
    } catch(e) {
      console.error("outsider live positions:",e);
      throw e;
    }

    const byIMO = {};
    const byName = {};

    for (const p of pData) {
      const imo = normIMO(p.imo_no);
      const name = normName(p.vessel_name);

      if (imo && (!byIMO[imo] || newer(p.updated_at,byIMO[imo].updated_at))) byIMO[imo]=p;
      if (name && (!byName[name] || newer(p.updated_at,byName[name].updated_at))) byName[name]=p;
    }

    setPositionsByIMO(byIMO);
    setPositionsByName(byName);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLinkStatus(null);

    try {
      const { data:oData, error:oErr } = await supabase
        .from("outsider_vessels")
        .select("*")
        .order("vessel");

      if (oErr) throw oErr;

      const canonical = canonicaliseRoster(oData||[]);
      const resolved = await resolveRoster(canonical);

      setRows(resolved);
      await fetchLivePositions(resolved);

      // Auto-persist any IMO found in vessels_db for formerly name-only rows.
      persistResolvedLinks(canonical,resolved).then(n=>{
        if(n>0) setLinkStatus(`Linked ${n} missing IMO${n===1?"":"s"}`);
      });
    } catch(e) {
      console.error(e);
      setLoadError(e.message||String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() => rows.map((r,index) => {
    const imo = normIMO(r.imo);
    const nameKey = normName(r.vessel);
    const pos = (imo && positionsByIMO[imo]) || positionsByName[nameKey] || null;

    // If live data contains the IMO and the roster didn't, use it immediately
    // in the UI even before the background repair finishes.
    const liveIMO = normIMO(pos?.imo_no);

    return {
      ...r,
      imo: imo || liveIMO || null,
      _rowKey: `${imo||liveIMO||"NOIMO"}:${nameKey||index}`,
      area: r.manual_area || pos?.super_region || null,
      port: r.manual_port || pos?.port_name || null,
      // A manual Open Date is allowed for static outsiders, but as soon as
      // positions_latest has an Open Date it automatically takes precedence.
      openDate: pos?.open_date || r.manual_open_date || null,
      openDateIsLive: !!pos?.open_date,
      lastReported: pos?.updated_at || null,
      reporting: !!pos,
    };
  }), [rows, positionsByIMO, positionsByName]);

  const areaOptions = useMemo(() => [...new Set(enriched.map(r=>r.area).filter(Boolean))].sort(), [enriched]);

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return enriched.filter(r => {
      if (areaFilter.size && !areaFilter.has(r.area)) return false;
      if (reportedOnly && !r.reporting) return false;
      if (!terms.length) return true;

      const hay = [
        r.vessel, r.imo, r.coating, r.source_operator, r.owner, r.controlled_by, r.pic, r.notes,
        r.port, r.area, r.openDate, r.manual_open_date, r.lastReported
      ].filter(Boolean).join(" ").toLowerCase();

      // Multiple words are ANDed, so "lisbo med" must match both.
      return terms.every(t=>hay.includes(t));
    });
  }, [enriched, search, areaFilter, reportedOnly]);

  // Always sort by newest live report first. Unreported vessels follow,
  // with vessel name as a stable secondary sort.
  const sorted = useMemo(() => {
    return [...filtered].sort((a,b) => {
      const at = a.lastReported ? new Date(a.lastReported).getTime() : 0;
      const bt = b.lastReported ? new Date(b.lastReported).getTime() : 0;
      if (bt !== at) return bt - at;
      return String(a.vessel||"").localeCompare(String(b.vessel||""));
    });
  }, [filtered]);

  useEffect(() => { setPage(1); }, [search, areaFilter, reportedOnly]);
  const pageRows = useMemo(() => sorted.slice(0, page*PAGE_SIZE), [sorted, page]);
  function toggleArea(a) {
    setAreaFilter(prev => {
      const n = new Set(prev);
      n.has(a) ? n.delete(a) : n.add(a);
      return n;
    });
  }

  // Updates/deletes work with or without IMO.
  function rowTarget(r) {
    const imo = normIMO(r.imo);
    if (imo) return {type:"imo",value:imo};
    return {type:"name",value:r.vessel};
  }

  async function updateField(row, field, value) {
    const target = rowTarget(row);

    setRows(prev=>prev.map(r=>{
      const same = target.type==="imo"
        ? normIMO(r.imo)===target.value
        : normName(r.vessel)===normName(target.value);
      return same ? {...r,[field]:value} : r;
    }));

    let q = supabase.from("outsider_vessels")
      .update({[field]:value||null,updated_at:new Date().toISOString()});

    q = target.type==="imo"
      ? q.eq("imo",target.value)
      : q.is("imo",null).ilike("vessel",target.value);

    const {error}=await q;
    if(error){
      console.error("outsider update:",error);
      load();
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = rowTarget(pendingDelete);

    setRows(prev=>prev.filter(r=>{
      return target.type==="imo"
        ? normIMO(r.imo)!==target.value
        : normName(r.vessel)!==normName(target.value);
    }));
    setPendingDelete(null);

    let q = supabase.from("outsider_vessels").delete();
    q = target.type==="imo"
      ? q.eq("imo",target.value)
      : q.is("imo",null).ilike("vessel",target.value);

    const {error}=await q;
    if(error){
      console.error("outsider delete:",error);
      load();
    }
  }

  // Name is the only required field. If IMO is blank, try to resolve it
  // from vessels_db and positions_latest automatically.
  async function resolveOneByName(vessel) {
    const name = vessel.trim();
    if(!name) return null;

    const {data:dbData} = await supabase.from("vessels_db")
      .select("imo,vessel,dwt,built,operator")
      .ilike("vessel",name)
      .limit(1);

    const db = dbData?.[0];
    if (db) return {
      imo:normIMO(db.imo)||null,
      dwt:db.dwt||null,
      built:db.built||null,
      source_operator:db.operator||null,
    };

    const {data:pData} = await supabase.from("positions_latest")
      .select("imo_no,vessel_name")
      .ilike("vessel_name",name)
      .limit(1);

    const p = pData?.[0];
    return p ? {imo:normIMO(p.imo_no)||null} : null;
  }

  async function submitAdd() {
    const vessel = addForm.vessel.trim();
    if (!vessel) {
      setAddStatus("Vessel name is required");
      return;
    }

    setAddStatus("Checking vessel…");

    let lookup = null;
    try { lookup = await resolveOneByName(vessel); } catch(e) { console.warn(e); }

    const imo = normIMO(addForm.imo) || normIMO(lookup?.imo) || null;
    const payload = {
      vessel,
      imo,
      dwt:addForm.dwt ? Number(addForm.dwt) : lookup?.dwt || null,
      built:addForm.built ? Number(addForm.built) : lookup?.built || null,
      source_operator:addForm.source_operator.trim() || lookup?.source_operator || null,
      updated_at:new Date().toISOString(),
    };

    let error = null;

    if (imo) {
      // Older outsider_vessels schemas do not necessarily have a UNIQUE
      // constraint on IMO. Therefore use explicit find -> update/insert
      // instead of upsert(...,{onConflict:"imo"}).
      const {data:existingByImo,error:findErr} = await supabase
        .from("outsider_vessels")
        .select("imo")
        .eq("imo",imo)
        .limit(1);

      if(findErr) {
        error=findErr;
      } else if(existingByImo?.length) {
        ({error} = await supabase.from("outsider_vessels")
          .update(payload)
          .eq("imo",imo));
      } else {
        ({error} = await supabase.from("outsider_vessels")
          .insert(payload));
      }

      if(!error) {
        // Remove any old name-only copy.
        await supabase.from("outsider_vessels")
          .delete()
          .is("imo",null)
          .ilike("vessel",vessel);
      }
    } else {
      // Prevent duplicate static name-only rows.
      const {data:existing,error:findErr} = await supabase.from("outsider_vessels")
        .select("vessel,imo")
        .ilike("vessel",vessel)
        .limit(1);

      if(findErr) error=findErr;
      else if(existing?.length) {
        setAddStatus("Already in outsider list");
        return;
      } else {
        ({error}=await supabase.from("outsider_vessels").insert(payload));
      }
    }

    if(error) {
      setAddStatus("Failed: "+error.message);
      return;
    }

    setAddStatus(null);
    setAddForm({vessel:"",imo:"",dwt:"",built:"",source_operator:""});
    setShowAdd(false);
    load();
  }

  function fmtUpdated(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  }
  function fmtOpenDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  }

  function SortTH({label,align}) {
    return (
      <th style={{...TH_,textAlign:align||"left",cursor:"default"}}>
        {label}
      </th>
    );
  }

  const reportingCount = enriched.filter(r=>r.reporting).length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {pendingDelete&&(
        <ConfirmModal
          message={`Remove "${pendingDelete.vessel}" from the outsider list?`}
          onConfirm={confirmDelete}
          onCancel={()=>setPendingDelete(null)}
        />
      )}

      <div style={{...CARD,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10}}>
          <div style={{position:"relative",minWidth:220,flex:"0 1 300px"}}>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Search outsiders…"
              style={{...INPUT,width:"100%",boxSizing:"border-box",paddingRight:30}}
            />
            {search&&(
              <button onClick={()=>setSearch("")} title="Clear search"
                style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",
                  width:17,height:17,borderRadius:"50%",border:"none",background:"rgba(120,160,220,0.16)",
                  color:C.faint,cursor:"pointer",fontSize:10,lineHeight:1,padding:0,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            )}
          </div>

          {loading&&<span style={{fontSize:11,color:C.faint}}>Refreshing…</span>}
          {loadError&&<span style={{fontSize:11,color:"#ff6b6b"}}>{loadError}</span>}
          {linkStatus&&<span style={{fontSize:11,color:"#4ade80"}}>{linkStatus}</span>}

          <span style={{fontSize:12,color:C.faint}}>
            Total <b style={{color:C.tx}}>{enriched.length}</b>
          </span>
          <span style={{fontSize:12,color:C.faint}}>
            Showing <b style={{color:C.tx}}>{pageRows.length}</b>
          </span>
          <span style={{fontSize:12,color:C.faint}}>
            Currently reporting <b style={{color:"#4ade80"}}>{reportingCount}</b>
          </span>

          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button style={BTN(showAdd,"#4ade80")} onClick={()=>setShowAdd(v=>!v)}>+ Add vessel</button>
            <button style={BTN(false)} onClick={load}>Refresh</button>
          </div>
        </div>

        {areaOptions.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,fontWeight:800,color:"#f5a623",textTransform:"uppercase",letterSpacing:"0.05em"}}>
              Current Area
            </span>

            {areaOptions.map(a=>(
              <button key={a} style={CHIP(areaFilter.has(a))} onClick={()=>toggleArea(a)}>{a}</button>
            ))}

            <div style={{width:1,height:20,background:C.bd,margin:"0 4px",flexShrink:0}}/>

            <button
              onClick={()=>setReportedOnly(v=>!v)}
              style={{
                fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:5,cursor:"pointer",
                fontFamily:"inherit",whiteSpace:"nowrap",
                border:"1.5px solid #4ade80",
                background:reportedOnly?"#4ade80":"rgba(74,222,128,0.12)",
                color:reportedOnly?"#0a1a10":"#4ade80",
              }}>
              ● Show Reported
            </button>

            {(areaFilter.size>0||reportedOnly)&&(
              <button style={CHIP(true,"#ff6b6b")}
                onClick={()=>{setAreaFilter(new Set());setReportedOnly(false);}}>
                ✕ Clear
              </button>
            )}
          </div>
        )}
      </div>

      {showAdd&&(
        <div style={{...CARD,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
          <input placeholder="Vessel name *" value={addForm.vessel}
            onChange={e=>setAddForm(f=>({...f,vessel:e.target.value}))}
            style={{...INPUT,width:180}}/>
          <input placeholder="IMO (auto if blank)" value={addForm.imo}
            onChange={e=>setAddForm(f=>({...f,imo:e.target.value.replace(/[^0-9]/g,"")}))}
            style={{...INPUT,width:135}}/>
          <input placeholder="DWT" value={addForm.dwt}
            onChange={e=>setAddForm(f=>({...f,dwt:e.target.value.replace(/[^0-9]/g,"")}))}
            style={{...INPUT,width:90}}/>
          <input placeholder="Built" value={addForm.built}
            onChange={e=>setAddForm(f=>({...f,built:e.target.value.replace(/[^0-9]/g,"")}))}
            style={{...INPUT,width:80}}/>
          <input placeholder="Source" value={addForm.source_operator}
            onChange={e=>setAddForm(f=>({...f,source_operator:e.target.value}))}
            style={{...INPUT,width:160}}/>

          <button style={BTN(true,"#4ade80")} onClick={submitAdd}>Save</button>
          <button style={BTN(false)} onClick={()=>{setShowAdd(false);setAddStatus(null);}}>Cancel</button>

          {addStatus&&(
            <span style={{fontSize:11,color:addStatus.startsWith("Failed")?"#ff6b6b":C.faint}}>
              {addStatus}
            </span>
          )}
        </div>
      )}

      <div style={{...CARD,padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto",...(compact?{maxHeight:420,overflowY:"auto"}:{})}}>
          <table style={{borderCollapse:"collapse",width:"100%"}}>
            <thead style={{position:"sticky",top:0,background:C.bg2,zIndex:1}}>
              <tr>
                <SortTH label="Vessel" k="vessel"/>
                <SortTH label="IMO" k="imo"/>
                <SortTH label="DWT" k="dwt" align="right"/>
                <SortTH label="Built" align="right"/>
                <SortTH label="Coating"/>
                <SortTH label="Source"/>
                <SortTH label="Owner"/>
                <th style={{...TH_,width:88,minWidth:88,maxWidth:88}}>Controlled By</th>
                <th style={{...TH_,width:68,minWidth:68,maxWidth:68}}>PIC</th>
                <th style={TH_}>Notes</th>
                <SortTH label="Current Area" k="area"/>
                <SortTH label="Open Port" k="port"/>
                <SortTH label="Open Date" k="openDate"/>
                <SortTH label="Last Reported" k="lastReported"/>
                <th style={TH_}></th>
              </tr>
            </thead>

            <tbody>
              {pageRows.map(r=>(
                <tr key={r._rowKey}>
                  <td style={TD_}>
                    <EditCell value={r.vessel} onSave={v=>updateField(r,"vessel",v)} bold width={140}/>
                  </td>
                  <td style={{...TD_,color:r.imo?C.dim:"rgba(245,166,35,0.75)"}}>
                    {r.imo||"—"}
                  </td>
                  <td style={{...TD_,textAlign:"right"}}>{r.dwt?fmtN(r.dwt):"—"}</td>
                  <td style={{...TD_,textAlign:"right"}}>{r.built||"—"}</td>
                  <td style={TD_}>
                    <EditCell value={r.coating} onSave={v=>updateField(r,"coating",v)} placeholder="—" width={90}/>
                  </td>
                  <td style={TD_}>
                    <EditCell value={r.source_operator} onSave={v=>updateField(r,"source_operator",v)} width={112}/>
                  </td>
                  <td style={{...TD_,color:"rgba(190,215,245,0.78)"}}>{r.owner||"—"}</td>
                  <td style={{...TD_,width:88,minWidth:88,maxWidth:88,overflow:"hidden"}}>
                    <EditCell value={r.controlled_by} onSave={v=>updateField(r,"controlled_by",v)} placeholder="set" width={82}/>
                  </td>
                  <td style={{...TD_,width:68,minWidth:68,maxWidth:68,overflow:"hidden"}}>
                    <EditCell value={r.pic} onSave={v=>updateField(r,"pic",v)} placeholder="set" width={62}/>
                  </td>
                  <td style={TD_}>
                    <EditCell value={r.notes} onSave={v=>updateField(r,"notes",v)} placeholder="—" width={160}/>
                  </td>
                  <td style={TD_}>
                    <SelectCell value={r.area} options={areaOptions} onSave={v=>updateField(r,"manual_area",v)}/>
                  </td>
                  <td style={{...TD_,color:"#79c0ff"}}>
                    <EditCell value={r.port} onSave={v=>updateField(r,"manual_port",v)} width={140} color="#79c0ff"/>
                  </td>
                  <td style={{...TD_,color:"#79c0ff",fontWeight:600}}
                    title={r.openDateIsLive ? "Live Open Date from Positions — overrides manual date" : "Manual Open Date — click to edit"}>
                    <EditCell
                      value={r.openDateIsLive ? fmtOpenDate(r.openDate) : (r.manual_open_date || "")}
                      onSave={v=>updateField(r,"manual_open_date",v)}
                      placeholder="click to set"
                      width={90}
                      color="#79c0ff"
                    />
                  </td>
                  <td style={{...TD_,color:r.reporting?"#4ade80":C.faint}}>
                    {r.reporting?fmtUpdated(r.lastReported):"—"}
                  </td>
                  <td style={{...TD_,textAlign:"center"}}>
                    <button
                      onClick={()=>setPendingDelete(r)}
                      style={{background:"none",border:"none",color:"#ff6b6b",cursor:"pointer",fontSize:13,padding:"2px 6px"}}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}

              {!pageRows.length&&!loading&&(
                <tr><td style={TD_} colSpan={15}>No vessels match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {sorted.length>pageRows.length&&(
          <div style={{padding:"10px 16px",borderTop:"1px solid "+C.bd,textAlign:"center"}}>
            <button onClick={()=>setPage(p=>p+1)} style={BTN(false)}>
              Show more ({sorted.length-pageRows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
