import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

// ─── SettingsTab ───────────────────────────────────────────────────────────────
// Manages cargo filter groups stored in localStorage (no DB needed).
// A filter group has: { id, label, aliases: string[] }
// When active, filtC matches cargo if cargo grade matches ANY alias in the group.

const STORAGE_KEY = "signal_cargo_filter_groups";

function loadGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultGroups();
  } catch { return defaultGroups(); }
}

function defaultGroups() {
  return [
    { id: "naphtha",  label: "Naphtha",  aliases: ["Naphtha","NAPHTHA"] },
    { id: "gasoline", label: "Gasoline", aliases: ["Gasoline","GASOLINE","Petrol"] },
    { id: "cpp",      label: "CPP",      aliases: ["CPP","DPP","Jet","Kero","Kerosene","Gasoil","ULSD","HVO"] },
    { id: "benz",     label: "Benz",     aliases: ["Benzene","BTX","Xylene","Toluene","Styrene","MX","PX"] },
    { id: "veg",      label: "Veg/Bio",  aliases: ["UCO","FAME","Palm","Soya","Canola","HVO/SAF","HVO","SAF"] },
    { id: "hfo",      label: "HFO/Fuel", aliases: ["HFO","HSFO","LSFO","MGO","Fuel Oil","Bunker"] },
  ];
}

function saveGroups(groups) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function useCargoFilterGroups() {
  const [groups, setGroups] = useState(loadGroups);
  useEffect(() => { saveGroups(groups); }, [groups]);
  return [groups, setGroups];
}

export default function SettingsTab({ groups, setGroups }) {
  const [editing, setEditing] = useState(null); // group id being edited
  const [editLabel, setEditLabel] = useState("");
  const [editAliases, setEditAliases] = useState(""); // comma-separated
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAliases, setNewAliases] = useState("");

  const th = { padding: "5px 10px", fontSize: 10, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(14,22,40,0.98)", borderBottom: "1px solid rgba(58,130,246,0.12)", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "7px 10px", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle" };
  const inp = { background: "rgba(10,18,34,0.95)", border: "1px solid rgba(88,166,255,0.4)", borderRadius: 4, color: "#cde", fontFamily: "inherit", fontSize: 12, padding: "4px 8px", outline: "none", width: "100%" };
  const btn = (active) => ({ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (active ? "rgba(88,166,255,0.6)" : "rgba(120,160,220,0.25)"), background: active ? "rgba(88,166,255,0.18)" : "rgba(15,25,50,0.8)", color: active ? "#d9ecff" : "#7aa0c8" });

  function startEdit(g) {
    setEditing(g.id);
    setEditLabel(g.label);
    setEditAliases(g.aliases.join(", "));
  }

  function saveEdit() {
    setGroups(prev => prev.map(g => g.id === editing
      ? { ...g, label: editLabel.trim(), aliases: editAliases.split(",").map(s => s.trim()).filter(Boolean) }
      : g
    ));
    setEditing(null);
  }

  function deleteGroup(id) {
    setGroups(prev => prev.filter(g => g.id !== id));
  }

  function addGroup() {
    if (!newLabel.trim()) return;
    const id = "grp_" + Date.now();
    setGroups(prev => [...prev, { id, label: newLabel.trim(), aliases: newAliases.split(",").map(s => s.trim()).filter(Boolean) }]);
    setNewLabel(""); setNewAliases(""); setAdding(false);
  }

  function resetDefaults() {
    setGroups(defaultGroups());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>

      {/* Section header */}
      <div style={{ borderBottom: "1px solid rgba(58,130,246,0.14)", paddingBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.09em" }}>Cargo Filter Groups</div>
        <div style={{ fontSize: 12, color: "rgba(180,200,230,0.45)", marginTop: 4 }}>
          Each group is a labelled button in the Cargoes filter panel. Clicking it filters cargo grades matching any of the listed aliases. AND logic applies across groups.
        </div>
      </div>

      {/* Groups table */}
      <div style={{ border: "1px solid rgba(58,130,246,0.18)", borderRadius: 7, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 110 }}>Button label</th>
              <th style={th}>Aliases (cargo grades that match)</th>
              <th style={{ ...th, width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g.id} style={{ background: i % 2 === 0 ? "rgba(10,18,34,0.95)" : "rgba(16,28,52,0.85)" }}>
                {editing === g.id ? (
                  <>
                    <td style={td}>
                      <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={inp} placeholder="Button label" />
                    </td>
                    <td style={td}>
                      <input value={editAliases} onChange={e => setEditAliases(e.target.value)} style={inp} placeholder="Benzene, BTX, Xylene, Toluene" />
                      <div style={{ fontSize: 10, color: "rgba(120,160,220,0.4)", marginTop: 3 }}>Comma-separated. Case-sensitive matching against cargo grade field.</div>
                    </td>
                    <td style={{ ...td, display: "flex", gap: 5 }}>
                      <button onClick={saveEdit} style={{ ...btn(true), color: "#6ee7b7" }}>✓ Save</button>
                      <button onClick={() => setEditing(null)} style={btn(false)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...td, fontWeight: 600, color: "rgba(210,225,245,0.85)" }}>{g.label}</td>
                    <td style={{ ...td, color: "rgba(160,185,215,0.65)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {g.aliases.map(a => (
                          <span key={a} style={{ background: "rgba(88,166,255,0.10)", border: "1px solid rgba(88,166,255,0.2)", borderRadius: 3, padding: "1px 6px", fontSize: 11, color: "rgba(180,210,250,0.7)" }}>{a}</span>
                        ))}
                        {g.aliases.length === 0 && <span style={{ color: "rgba(120,160,220,0.3)", fontStyle: "italic" }}>no aliases</span>}
                      </div>
                    </td>
                    <td style={{ ...td }}>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => startEdit(g)} style={btn(false)}>✏ Edit</button>
                        <button onClick={() => deleteGroup(g.id)} style={{ ...btn(false), color: "#f87171", borderColor: "rgba(248,113,113,0.35)" }}>✕ Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {/* Add new row */}
            {adding && (
              <tr style={{ background: "rgba(88,166,255,0.06)", outline: "1px solid rgba(88,166,255,0.2)" }}>
                <td style={td}>
                  <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)} style={inp} placeholder="e.g. Benz" onKeyDown={e => e.key === "Enter" && addGroup()} />
                </td>
                <td style={td}>
                  <input value={newAliases} onChange={e => setNewAliases(e.target.value)} style={inp} placeholder="Benzene, BTX, Xylene, Toluene" onKeyDown={e => e.key === "Enter" && addGroup()} />
                </td>
                <td style={{ ...td }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={addGroup} style={{ ...btn(true), color: "#6ee7b7" }}>✓ Add</button>
                    <button onClick={() => { setAdding(false); setNewLabel(""); setNewAliases(""); }} style={btn(false)}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {!adding && <button onClick={() => setAdding(true)} style={{ ...btn(true), padding: "5px 14px", fontSize: 12 }}>+ Add filter group</button>}
        <button onClick={resetDefaults} style={{ ...btn(false), padding: "5px 14px", fontSize: 12, color: "rgba(248,113,113,0.7)", borderColor: "rgba(248,113,113,0.3)" }}>Reset to defaults</button>
      </div>

      {/* Preview */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(120,160,220,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Preview — buttons in cargo filter panel</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {groups.map(g => (
            <span key={g.id} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, border: "1px solid rgba(88,166,255,0.3)", background: "rgba(88,166,255,0.1)", color: "#c8deff", fontFamily: "inherit" }}>{g.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
