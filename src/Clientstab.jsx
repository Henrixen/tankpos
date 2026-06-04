import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { v4 as uuidv4 } from 'uuid';

// ─── SQL to run in Supabase dashboard ────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS client_directory (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   type text NOT NULL DEFAULT 'charterer',  -- 'charterer' | 'owner'
//   company text NOT NULL DEFAULT '',
//   pic text DEFAULT '',
//   lead_broker text DEFAULT '',
//   comment text DEFAULT '',
//   last_contact date,
//   rating int DEFAULT 0,
//   created_at timestamptz DEFAULT now(),
//   updated_at timestamptz DEFAULT now()
// );
// ALTER TABLE client_directory ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "allow all" ON client_directory FOR ALL USING (true) WITH CHECK (true);
// GRANT ALL ON client_directory TO anon, authenticated;
// ─────────────────────────────────────────────────────────────────────────────

const BROKERS = ["Haakon", "Løken", "Both", ""];
const RATINGS = [0, 1, 2, 3, 4, 5];

const th = {
  fontSize: 10, fontWeight: 700, color: "rgba(120,160,220,0.5)",
  textTransform: "uppercase", letterSpacing: "0.08em",
  padding: "6px 10px", borderBottom: "1px solid rgba(58,130,246,0.15)",
  whiteSpace: "nowrap", userSelect: "none", background: "rgba(8,18,38,0.8)",
};
const td = {
  padding: "0", borderBottom: "1px solid rgba(22,37,64,0.7)",
  verticalAlign: "middle",
};
const inpSt = {
  width: "100%", background: "transparent", border: "none", outline: "none",
  color: "rgba(200,220,255,0.82)", fontFamily: "Inter,sans-serif",
  fontSize: 12, padding: "6px 10px", boxSizing: "border-box",
};
const btnSt = {
  fontSize: 11, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
  fontFamily: "inherit", border: "1px solid rgba(58,130,246,0.25)",
  background: "rgba(58,130,246,0.1)", color: "#79c0ff",
};

function StarRating({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, padding: "6px 8px" }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} onClick={() => onChange(value === s ? 0 : s)}
          style={{ cursor: "pointer", fontSize: 13, color: s <= value ? "#f59e0b" : "rgba(120,160,200,0.2)", lineHeight: 1 }}>
          ★
        </span>
      ))}
    </div>
  );
}

function InlineCell({ value, onChange, placeholder = "", multiline = false, select = null }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => { setVal(value || ""); }, [value]);

  function save() {
    setEditing(false);
    if (val !== (value || "")) onChange(val);
  }

  if (select) {
    return (
      <td style={td}>
        <select value={val} onChange={e => { setVal(e.target.value); onChange(e.target.value); }}
          style={{ ...inpSt, colorScheme: "dark", cursor: "pointer" }}>
          {select.map(o => <option key={o} value={o}>{o || "—"}</option>)}
        </select>
      </td>
    );
  }

  return (
    <td style={td} onClick={() => { setEditing(true); setTimeout(() => ref.current?.focus(), 10); }}>
      {editing ? (
        multiline
          ? <textarea ref={ref} value={val} onChange={e => setVal(e.target.value)}
              onBlur={save} autoFocus rows={2}
              style={{ ...inpSt, resize: "vertical", minHeight: 40 }} />
          : <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
              placeholder={placeholder}
              onBlur={save} onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(value || ""); setEditing(false); } }}
              autoFocus style={inpSt} />
      ) : (
        <div style={{ ...inpSt, color: val ? "rgba(200,220,255,0.82)" : "rgba(100,140,180,0.3)", cursor: "text", minHeight: 32, whiteSpace: "pre-wrap" }}>
          {val || placeholder}
        </div>
      )}
    </td>
  );
}

function ClientTable({ type, clients, onUpdate, onAdd, onDelete, search }) {
  const label = type === "charterer" ? "Charterers" : "Owners";
  const rows = clients
    .filter(c => c.type === type)
    .filter(c => !search || [c.company, c.pic, c.lead_broker, c.comment].some(f => (f || "").toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => a.company.localeCompare(b.company));

  return (
    <div style={{ background: C.bg2, border: "1px solid rgba(58,130,246,0.14)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(8,18,38,0.9)", borderBottom: "1px solid rgba(58,130,246,0.14)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#79c0ff", letterSpacing: "0.04em" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "rgba(120,160,220,0.4)" }}>{rows.length} {label.toLowerCase()}</span>
          <button onClick={() => onAdd(type)} style={btnSt}>+ Add {type === "charterer" ? "Charterer" : "Owner"}</button>
        </div>
      </div>
      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 160 }}>Company</th>
              <th style={{ ...th, width: 130 }}>PIC</th>
              <th style={{ ...th, width: 110 }}>Lead Broker</th>
              <th style={{ ...th, width: 90 }}>Rating</th>
              <th style={{ ...th, width: 110 }}>Last Contact</th>
              <th style={{ ...th }}>Comment / Notes</th>
              <th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id}
                style={{ background: i % 2 === 0 ? "rgba(7,15,28,0.96)" : "rgba(22,37,64,0.82)" }}>
                <InlineCell value={c.company} placeholder="Company name"
                  onChange={v => onUpdate(c.id, "company", v)} />
                <InlineCell value={c.pic} placeholder="Contact name(s)"
                  onChange={v => onUpdate(c.id, "pic", v)} />
                <InlineCell value={c.lead_broker} select={BROKERS}
                  onChange={v => onUpdate(c.id, "lead_broker", v)} />
                <td style={td}>
                  <StarRating value={c.rating || 0} onChange={v => onUpdate(c.id, "rating", v)} />
                </td>
                <InlineCell value={c.last_contact || ""} placeholder="dd Mon yyyy"
                  onChange={v => onUpdate(c.id, "last_contact", v || null)} />
                <InlineCell value={c.comment} placeholder="Notes on relationship, business…" multiline
                  onChange={v => onUpdate(c.id, "comment", v)} />
                <td style={{ ...td, textAlign: "center", padding: "0 6px" }}>
                  <button onClick={() => onDelete(c.id)}
                    style={{ background: "none", border: "none", color: "rgba(255,107,107,0.3)", fontSize: 13, cursor: "pointer", padding: "4px", lineHeight: 1 }}
                    title="Delete">✕</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "rgba(120,160,200,0.3)", fontSize: 12 }}>
                No {label.toLowerCase()} yet — click "+ Add" to get started
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ClientsTab() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pendingDel, setPendingDel] = useState(null);
  const saveTimer = useRef({});

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("client_directory").select("*").order("company");
      if (error) { console.error(error); setLoading(false); return; }
      setClients(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const onUpdate = useCallback((id, field, value) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    clearTimeout(saveTimer.current[id]);
    saveTimer.current[id] = setTimeout(async () => {
      await supabase.from("client_directory").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    }, 600);
  }, []);

  const onAdd = useCallback(async (type) => {
    const id = uuidv4();
    const row = { id, type, company: "", pic: "", lead_broker: "", comment: "", rating: 0, last_contact: null };
    const { error } = await supabase.from("client_directory").insert(row);
    if (!error) setClients(prev => [...prev, row]);
  }, []);

  const onDelete = useCallback((id) => {
    setPendingDel(id);
  }, []);

  async function confirmDelete() {
    await supabase.from("client_directory").delete().eq("id", pendingDel);
    setClients(prev => prev.filter(c => c.id !== pendingDel));
    setPendingDel(null);
  }

  // Stats
  const charterers = clients.filter(c => c.type === "charterer");
  const owners = clients.filter(c => c.type === "owner");
  const haakon = clients.filter(c => c.lead_broker === "Haakon" || c.lead_broker === "Both");
  const loken = clients.filter(c => c.lead_broker === "Løken" || c.lead_broker === "Both");

  return (
    <div style={{ padding: "16px 20px", maxWidth: 1600, margin: "0 auto" }}>
      {/* Delete confirm */}
      {pendingDel && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: C.bg2, border: "1px solid rgba(255,107,107,0.4)", borderRadius: 8, padding: "12px 20px", zIndex: 9999, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.5)", fontFamily: "sans-serif", fontSize: 12 }}>
          <span style={{ color: "rgba(200,220,255,0.8)" }}>Delete this client?</span>
          <button onClick={confirmDelete} style={{ ...btnSt, borderColor: "rgba(255,107,107,0.4)", color: "#f87171" }}>Delete</button>
          <button onClick={() => setPendingDel(null)} style={btnSt}>Cancel</button>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            style={{ width: "100%", background: C.bg3, border: "1px solid rgba(58,130,246,0.2)", borderRadius: 6, color: "rgba(200,220,255,0.8)", fontSize: 12, padding: "7px 12px 7px 32px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "rgba(88,130,200,0.4)" }}>🔍</span>
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(120,160,220,0.4)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>}
        </div>
        {/* Stats pills */}
        {[
          { label: "Charterers", val: charterers.length, col: "#79c0ff" },
          { label: "Owners", val: owners.length, col: "#a8e6a3" },
          { label: "Haakon lead", val: haakon.length, col: "#f59e0b" },
          { label: "Løken lead", val: loken.length, col: "#c792ea" },
        ].map(s => (
          <div key={s.label} style={{ background: C.bg3, border: "1px solid rgba(58,130,246,0.15)", borderRadius: 6, padding: "6px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.col, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 9, color: "rgba(120,160,200,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading
        ? <div style={{ padding: 40, textAlign: "center", color: "rgba(120,160,200,0.4)", fontSize: 13 }}>Loading…</div>
        : <>
            <ClientTable type="charterer" clients={clients} onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} search={search} />
            <ClientTable type="owner" clients={clients} onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} search={search} />
          </>
      }
    </div>
  );
}
