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

// Both the display state and the editing input share identical box-sizing/
// height/padding so swapping between them doesn't shift the row height —
// that was causing the table to jump around when tapping a cell.
const CELL_COMMON = { fontSize:12, fontFamily:"inherit", boxSizing:"border-box", height:22, lineHeight:"16px", padding:"2px 4px", borderRadius:3 };

function EditCell({ value, onSave, placeholder="—", width=140, bold=false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = React.useRef(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
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
      style={{ ...CELL_COMMON, cursor:"pointer", color: value?(bold?C.tx:C.dim):C.faint, fontWeight: bold?600:400, minWidth:width, border:"1px solid transparent" }}
      title="Click to edit">
      {value || placeholder}
    </div>
  );
}

// Strict dropdown — only allows picking from already-known values (used for
// Current Area so it can't drift into free-text variants of the same place).
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

export default function OutsidersTab({ compact=false }) {
  const [rows, setRows] = useState([]);
  const [positions, setPositions] = useState({}); // imo -> position row
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState(() => new Set());
  const [reportedOnly, setReportedOnly] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vessel:"", imo:"", dwt:"", built:"", source_operator:"" });
  const [addStatus, setAddStatus] = useState(null);
  const [sort, setSort] = useState({ key:"vessel", dir:"asc" });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data: oData, error: oErr } = await supabase.from("outsider_vessels").select("*").order("vessel");
    if (oErr) { console.error(oErr); setLoadError(oErr.message); setLoading(false); return; }
    setRows(oData || []);

    const imos = (oData||[]).map(r=>r.imo).filter(Boolean);
    if (imos.length) {
      const { data: pData, error: pErr } = await supabase
        .from("positions_latest")
        .select("imo_no,vessel_name,port_name,open_date,updated_at,super_region")
        .in("imo_no", imos);
      if (pErr) { console.error(pErr); }
      const map = {};
      (pData||[]).forEach(p => { if (p.imo_no) map[p.imo_no] = p; });
      setPositions(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge each roster row with its live position match once, so every other
  // computation (search, filter, sort, display) works off one clean shape.
  const enriched = useMemo(() => rows.map(r => {
    const pos = positions[r.imo];
    return {
      ...r,
      area: r.manual_area || pos?.super_region || null,
      port: r.manual_port || pos?.port_name || null,
      openDate: pos?.open_date || null,
      lastReported: pos?.updated_at || null,
      reporting: !!pos,
    };
  }), [rows, positions]);

  const areaOptions = useMemo(() => [...new Set(enriched.map(r=>r.area).filter(Boolean))].sort(), [enriched]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enriched.filter(r => {
      if (areaFilter.size && !areaFilter.has(r.area)) return false;
      if (reportedOnly && !r.reporting && !r.area && !r.port) return false;
      if (!term) return true;
      const hay = [r.vessel, r.imo, r.source_operator, r.pic, r.notes, r.port, r.area]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [enriched, search, areaFilter, reportedOnly]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mul = dir==="asc" ? 1 : -1;
    return [...filtered].sort((a,b) => {
      let av = a[key], bv = b[key];
      if (typeof av === "string" || typeof bv === "string") {
        av = (av||"").toString().toLowerCase(); bv = (bv||"").toString().toLowerCase();
        return av < bv ? -mul : av > bv ? mul : 0;
      }
      av = av ?? -Infinity; bv = bv ?? -Infinity;
      return (av-bv)*mul;
    });
  }, [filtered, sort]);

  useEffect(() => { setPage(1); }, [search, areaFilter, reportedOnly, sort]);
  const pageRows = useMemo(() => sorted.slice(0, page*PAGE_SIZE), [sorted, page]);

  function toggleSort(key) {
    setSort(s => s.key===key ? { key, dir: s.dir==="asc"?"desc":"asc" } : { key, dir:"asc" });
  }
  function toggleArea(a) {
    setAreaFilter(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  }

  async function updateField(imo, field, value) {
    setRows(prev => prev.map(r => r.imo===imo ? { ...r, [field]: value } : r));
    const { error } = await supabase.from("outsider_vessels").update({ [field]: value, updated_at: new Date().toISOString() }).eq("imo", imo);
    if (error) console.error("update error:", error);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { imo } = pendingDelete;
    setRows(prev => prev.filter(r => r.imo !== imo));
    setPendingDelete(null);
    const { error } = await supabase.from("outsider_vessels").delete().eq("imo", imo);
    if (error) console.error("delete error:", error);
  }

  async function submitAdd() {
    const imo = addForm.imo.trim();
    const vessel = addForm.vessel.trim();
    if (!imo || !vessel) { setAddStatus("Vessel name and IMO are required"); return; }
    setAddStatus("Adding…");
    const payload = {
      imo, vessel,
      dwt: addForm.dwt ? Number(addForm.dwt) : null,
      built: addForm.built ? Number(addForm.built) : null,
      source_operator: addForm.source_operator.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("outsider_vessels").upsert(payload, { onConflict:"imo" });
    if (error) { setAddStatus("Failed: "+error.message); return; }
    setAddStatus(null);
    setAddForm({ vessel:"", imo:"", dwt:"", built:"", source_operator:"" });
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

  function SortTH({ label, k, align }) {
    const active = sort.key === k;
    return (
      <th style={{ ...TH_, textAlign: align||"left" }} onClick={()=>toggleSort(k)}>
        {label}{active ? (sort.dir==="asc" ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {pendingDelete && (
        <ConfirmModal
          message={`Remove "${pendingDelete.vessel}" from the outsider list? This can't be undone.`}
          onConfirm={confirmDelete}
          onCancel={()=>setPendingDelete(null)}
        />
      )}

      <div style={{ ...CARD, display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10 }}>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 Search outsiders…"
            style={{ ...INPUT, minWidth:220, flex:"0 1 300px" }}
          />
          {loading && <span style={{ fontSize:11, color:C.faint }}>Loading…</span>}
          {loadError && <span style={{ fontSize:11, color:"#ff6b6b" }}>⚠ {loadError}</span>}
          <span style={{ fontSize:12, color:C.faint }}>Total <b style={{ color:C.tx }}>{rows.length}</b></span>
          <span style={{ fontSize:12, color:C.faint }}>Showing <b style={{ color:C.tx }}>{pageRows.length}</b></span>
          <span style={{ fontSize:12, color:C.faint }}>
            Currently reporting <b style={{ color:"#4ade80" }}>{rows.filter(r=>positions[r.imo]).length}</b>
          </span>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button style={BTN(showAdd,"#4ade80")} onClick={()=>setShowAdd(v=>!v)}>+ Add vessel</button>
            <button style={BTN(false)} onClick={load}>↻ Refresh</button>
          </div>
        </div>

        {areaOptions.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:10, fontWeight:800, color:"#f5a623", textTransform:"uppercase", letterSpacing:"0.05em" }}>Current Area</span>
            {areaOptions.map(a => (
              <button key={a} style={CHIP(areaFilter.has(a))} onClick={()=>toggleArea(a)}>{a}</button>
            ))}
            <div style={{ width:1, height:20, background:C.bd, margin:"0 4px", flexShrink:0 }}/>
            <button
              onClick={()=>setReportedOnly(v=>!v)}
              style={{
                fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:5, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap",
                border:"1.5px solid #4ade80", background: reportedOnly?"#4ade80":"rgba(74,222,128,0.12)",
                color: reportedOnly?"#0a1a10":"#4ade80",
              }}>
              ● Reported only
            </button>
            {(areaFilter.size>0||reportedOnly) && (
              <button style={CHIP(true,"#ff6b6b")} onClick={()=>{setAreaFilter(new Set());setReportedOnly(false);}}>✕ Clear</button>
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <div style={{ ...CARD, display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
          <input placeholder="Vessel name *" value={addForm.vessel} onChange={e=>setAddForm(f=>({...f,vessel:e.target.value}))} style={{...INPUT,width:180}}/>
          <input placeholder="IMO *" value={addForm.imo} onChange={e=>setAddForm(f=>({...f,imo:e.target.value.replace(/[^0-9]/g,"")}))} style={{...INPUT,width:110}}/>
          <input placeholder="DWT" value={addForm.dwt} onChange={e=>setAddForm(f=>({...f,dwt:e.target.value.replace(/[^0-9]/g,"")}))} style={{...INPUT,width:90}}/>
          <input placeholder="Built" value={addForm.built} onChange={e=>setAddForm(f=>({...f,built:e.target.value.replace(/[^0-9]/g,"")}))} style={{...INPUT,width:80}}/>
          <input placeholder="Source operator" value={addForm.source_operator} onChange={e=>setAddForm(f=>({...f,source_operator:e.target.value}))} style={{...INPUT,width:160}}/>
          <button style={BTN(true,"#4ade80")} onClick={submitAdd}>Save</button>
          <button style={BTN(false)} onClick={()=>{setShowAdd(false);setAddStatus(null);}}>Cancel</button>
          {addStatus && <span style={{ fontSize:11, color: addStatus.startsWith("Failed")?"#ff6b6b":C.faint }}>{addStatus}</span>}
        </div>
      )}

      <div style={{ ...CARD, padding:0, overflow:"hidden" }}>
        <div style={{ overflowX:"auto", maxHeight: compact?420:3200, overflowY:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead style={{ position:"sticky", top:0, background:C.bg2, zIndex:1 }}>
              <tr>
                <SortTH label="Vessel" k="vessel"/>
                <SortTH label="IMO" k="imo"/>
                <SortTH label="DWT" k="dwt" align="right"/>
                <SortTH label="Built" k="built" align="right"/>
                <SortTH label="Source Operator" k="source_operator"/>
                <SortTH label="Controlled By" k="pic"/>
                <th style={TH_}>Notes</th>
                <SortTH label="Current Area" k="area"/>
                <SortTH label="Open Port" k="port"/>
                <SortTH label="Open Date" k="openDate"/>
                <SortTH label="Last Reported" k="lastReported"/>
                <th style={TH_}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => (
                <tr key={r.imo}>
                  <td style={TD_}><EditCell value={r.vessel} onSave={v=>updateField(r.imo,"vessel",v)} bold width={140}/></td>
                  <td style={TD_}>{r.imo}</td>
                  <td style={{ ...TD_, textAlign:"right" }}>{r.dwt?fmtN(r.dwt):"—"}</td>
                  <td style={{ ...TD_, textAlign:"right" }}>{r.built||"—"}</td>
                  <td style={TD_}><EditCell value={r.source_operator} onSave={v=>updateField(r.imo,"source_operator",v)} width={160}/></td>
                  <td style={TD_}><EditCell value={r.pic} onSave={v=>updateField(r.imo,"pic",v)} placeholder="click to set"/></td>
                  <td style={TD_}><EditCell value={r.notes} onSave={v=>updateField(r.imo,"notes",v)} placeholder="—" width={160}/></td>
                  <td style={TD_}><SelectCell value={r.area} options={areaOptions} onSave={v=>updateField(r.imo,"manual_area",v)}/></td>
                  <td style={TD_}><EditCell value={r.port} onSave={v=>updateField(r.imo,"manual_port",v)} width={140}/></td>
                  <td style={TD_}>{fmtOpenDate(r.openDate)}</td>
                  <td style={TD_}>{r.reporting ? fmtUpdated(r.lastReported) : "—"}</td>
                  <td style={{ ...TD_, textAlign:"center" }}>
                    <button onClick={()=>setPendingDelete({imo:r.imo,vessel:r.vessel})}
                      style={{ background:"none", border:"none", color:"#ff6b6b", cursor:"pointer", fontSize:13, padding:"2px 6px" }}>✕</button>
                  </td>
                </tr>
              ))}
              {!pageRows.length && !loading && (
                <tr><td style={TD_} colSpan={12}>No vessels match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > pageRows.length && (
          <div style={{ padding:"10px 16px", borderTop:"1px solid "+C.bd, textAlign:"center" }}>
            <button onClick={()=>setPage(p=>p+1)} style={BTN(false)}>
              Show more ({sorted.length - pageRows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
