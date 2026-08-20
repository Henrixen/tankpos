import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { fmtN } from "./utils";

const CARD = { background:C.bg2, border:"1px solid "+C.bd, borderRadius:10, padding:"14px 16px" };
const TH_ = { fontSize:10, fontWeight:700, color:C.faint, textTransform:"uppercase", letterSpacing:"0.06em",
  padding:"6px 10px", borderBottom:"1px solid "+C.bd, textAlign:"left", whiteSpace:"nowrap" };
const TD_ = { fontSize:12, padding:"6px 10px", borderBottom:"1px solid "+C.bd2, color:C.dim, whiteSpace:"nowrap",
  overflow:"hidden", textOverflow:"ellipsis", maxWidth:200 };
const BTN = (active,col="#58a6ff") => ({
  fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:6, cursor:"pointer",
  border:`1px solid ${active?col+"88":C.bd}`, background:active?col+"22":"transparent",
  color:active?col:C.faint, fontFamily:"inherit", whiteSpace:"nowrap",
});
const INPUT = { background:C.bg3, border:"1px solid "+C.bd, borderRadius:5, color:C.tx, fontFamily:"inherit",
  fontSize:12, padding:"5px 8px", outline:"none" };

// Small inline click-to-edit cell (used for Controlled By / Notes)
function EditCell({ value, onSave, placeholder="—", width=140 }) {
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
        style={{ ...INPUT, width, fontSize:12 }}/>
    );
  }
  return (
    <div onClick={()=>{ setDraft(value||""); setEditing(true); }}
      style={{ cursor:"pointer", color: value?C.tx:C.faint, minWidth:width, padding:"2px 4px", borderRadius:3 }}
      title="Click to edit">
      {value || placeholder}
    </div>
  );
}

// Simple centered confirm modal — self-contained, no dependency on the host app's modal system.
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
  const [pendingDelete, setPendingDelete] = useState(null); // {imo, vessel}
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vessel:"", imo:"", dwt:"", built:"", source_operator:"" });
  const [addStatus, setAddStatus] = useState(null);

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => {
      const pos = positions[r.imo];
      const hay = [r.vessel, r.imo, r.source_operator, r.pic, r.notes, pos?.port_name, pos?.super_region]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [rows, positions, search]);

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

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {pendingDelete && (
        <ConfirmModal
          message={`Remove "${pendingDelete.vessel}" from the outsider list? This can't be undone.`}
          onConfirm={confirmDelete}
          onCancel={()=>setPendingDelete(null)}
        />
      )}

      <div style={{ ...CARD, display:"flex", flexWrap:"wrap", alignItems:"center", gap:10 }}>
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Search outsiders…"
          style={{ ...INPUT, minWidth:220, flex:"0 1 300px" }}
        />
        {loading && <span style={{ fontSize:11, color:C.faint }}>Loading…</span>}
        {loadError && <span style={{ fontSize:11, color:"#ff6b6b" }}>⚠ {loadError}</span>}
        <span style={{ fontSize:12, color:C.faint }}>Total <b style={{ color:C.tx }}>{rows.length}</b></span>
        <span style={{ fontSize:12, color:C.faint }}>Showing <b style={{ color:C.tx }}>{filtered.length}</b></span>
        <span style={{ fontSize:12, color:C.faint }}>
          Currently reporting <b style={{ color:"#4ade80" }}>{rows.filter(r=>positions[r.imo]).length}</b>
        </span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button style={BTN(showAdd,"#4ade80")} onClick={()=>setShowAdd(v=>!v)}>+ Add vessel</button>
          <button style={BTN(false)} onClick={load}>↻ Refresh</button>
        </div>
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
        <div style={{ overflowX:"auto", maxHeight: compact?420:600, overflowY:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead style={{ position:"sticky", top:0, background:C.bg2, zIndex:1 }}>
              <tr>
                <th style={TH_}>Vessel</th>
                <th style={TH_}>IMO</th>
                <th style={{...TH_,textAlign:"right"}}>DWT</th>
                <th style={{...TH_,textAlign:"right"}}>Built</th>
                <th style={TH_}>Source Operator</th>
                <th style={TH_}>Controlled By</th>
                <th style={TH_}>Notes</th>
                <th style={TH_}>Current Area</th>
                <th style={TH_}>Open Port</th>
                <th style={TH_}>Last Reported</th>
                <th style={TH_}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const pos = positions[r.imo];
                return (
                  <tr key={r.imo}>
                    <td style={{ ...TD_, color:C.tx, fontWeight:600 }}>{r.vessel}</td>
                    <td style={TD_}>{r.imo}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.dwt?fmtN(r.dwt):"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.built||"—"}</td>
                    <td style={TD_} title={r.source_operator||""}>{r.source_operator||"—"}</td>
                    <td style={TD_}><EditCell value={r.pic} onSave={v=>updateField(r.imo,"pic",v)} placeholder="click to set"/></td>
                    <td style={TD_}><EditCell value={r.notes} onSave={v=>updateField(r.imo,"notes",v)} placeholder="—" width={160}/></td>
                    <td style={{ ...TD_, color: pos?"#4ade80":C.faint }}>{pos?.super_region || "—"}</td>
                    <td style={{ ...TD_, color: pos?C.tx:C.faint }}>{pos?.port_name || "—"}</td>
                    <td style={TD_}>{pos ? fmtUpdated(pos.updated_at) : "—"}</td>
                    <td style={{ ...TD_, textAlign:"center" }}>
                      <button onClick={()=>setPendingDelete({imo:r.imo,vessel:r.vessel})}
                        style={{ background:"none", border:"none", color:"#ff6b6b", cursor:"pointer", fontSize:13, padding:"2px 6px" }}>✕</button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && !loading && (
                <tr><td style={TD_} colSpan={11}>No vessels match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
