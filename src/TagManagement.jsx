import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

// Canonical preset list — matches PRESET_TAGS already hardcoded in
// Cargoes.jsx/QuotesFixtures.jsx exactly, so nothing that currently shows up
// there disappears when this renders.
const PRESET_TAGS = ["AG","BASF","CPP","DPP","EX ASIA","MED","OUTSIDER EUROPE","PARCEL","PNC","SPACE ASIA-EUROPE","SUB 10","TA","TAE","TAW","UKC","WAF"];

const CUSTOM_KEY = "signal_custom_tags";   // array of custom tag names (existing key, unchanged)
const SCOPE_KEY = "signal_tag_scopes";     // { TAGNAME: "both"|"cargoes"|"positions" }
const COLOR_KEY = "signal_tag_colors";     // { TAGNAME: "#hex" } — optional, only set ones get a colored dot

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; }
}

// Every tag currently in use anywhere (presets + whatever's been added).
export function allTagNames() {
  const custom = loadJSON(CUSTOM_KEY, []);
  return [...new Set([...PRESET_TAGS, ...custom].map(t => String(t || "").toUpperCase()).filter(Boolean))].sort();
}

// Scope-aware tag list — this is what Cargoes.jsx / QuotesFixtures.jsx /
// Positions should call instead of building their own tagList().
export function tagsForScope(scope) { // scope: "cargoes" | "positions"
  const scopes = loadJSON(SCOPE_KEY, {});
  return allTagNames().filter(t => {
    const s = scopes[t] || "both";
    return s === "both" || s === scope;
  });
}

export function tagColor(name) {
  const colors = loadJSON(COLOR_KEY, {});
  return colors[String(name || "").toUpperCase()] || null;
}

const PALETTE = ["#58a6ff","#ff5b5b","#43e97b","#ffad33","#c792ea","#4fc3f7","#e3b341","#9fc3f5"];

const rowBtn = (active, color) => ({
  fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 4, cursor: "pointer",
  border: "1px solid " + (active ? color : C.bd2),
  background: active ? color + "22" : "transparent",
  color: active ? color : "rgba(160,190,230,0.5)",
  fontFamily: "inherit",
});

export default function TagManagement() {
  const [names, setNames] = useState(allTagNames());
  const [scopes, setScopes] = useState(() => loadJSON(SCOPE_KEY, {}));
  const [colors, setColors] = useState(() => loadJSON(COLOR_KEY, {}));
  const [renaming, setRenaming] = useState(null); // tag name currently being renamed
  const [renameVal, setRenameVal] = useState("");
  const [newTag, setNewTag] = useState("");
  const [colorPickFor, setColorPickFor] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  function persistScopes(next) { setScopes(next); localStorage.setItem(SCOPE_KEY, JSON.stringify(next)); }
  function persistColors(next) { setColors(next); localStorage.setItem(COLOR_KEY, JSON.stringify(next)); }
  function persistCustom(next) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    setNames(allTagNames());
  }

  function setScope(tag, scope) { persistScopes({ ...scopes, [tag]: scope }); }
  function setColor(tag, hex) { persistColors({ ...colors, [tag]: hex }); setColorPickFor(null); }

  function isPreset(tag) { return PRESET_TAGS.includes(tag); }

  function addTag() {
    const t = newTag.trim().toUpperCase();
    if (!t) return;
    const custom = loadJSON(CUSTOM_KEY, []);
    if (!custom.includes(t) && !PRESET_TAGS.includes(t)) persistCustom([...custom, t]);
    setNewTag("");
  }
  function deleteTag(tag) {
    if (isPreset(tag)) return; // presets aren't deletable
    if (!window.confirm(`Delete tag "${tag}"? This won't remove it from cargoes/positions already tagged with it.`)) return;
    const custom = loadJSON(CUSTOM_KEY, []).filter(t => String(t).toUpperCase() !== tag);
    persistCustom(custom);
    const s = { ...scopes }; delete s[tag]; persistScopes(s);
    const c = { ...colors }; delete c[tag]; persistColors(c);
  }
  function startRename(tag) { setRenaming(tag); setRenameVal(tag); }
  function commitRename() {
    const oldName = renaming, newName = renameVal.trim().toUpperCase();
    setRenaming(null);
    if (!newName || newName === oldName || isPreset(oldName)) return;
    const custom = loadJSON(CUSTOM_KEY, []).map(t => String(t).toUpperCase() === oldName ? newName : t);
    persistCustom(custom);
    if (scopes[oldName]) { const s = { ...scopes }; s[newName] = s[oldName]; delete s[oldName]; persistScopes(s); }
    if (colors[oldName]) { const c = { ...colors }; c[newName] = c[oldName]; delete c[oldName]; persistColors(c); }
  }

  async function syncToCloud() {
    setSyncStatus("Syncing…");
    const payload = { scopes, colors, custom: loadJSON(CUSTOM_KEY, []) };
    const { error } = await supabase.from("dashboard").upsert({ key: "tag-management", value: JSON.stringify(payload) }, { onConflict: "key" });
    setSyncStatus(error ? "Sync failed: " + error.message : "✓ Synced");
    setTimeout(() => setSyncStatus(null), 3000);
  }

  // Pull from cloud once on mount (so a second device picks up changes made elsewhere)
  useEffect(() => {
    supabase.from("dashboard").select("value").eq("key", "tag-management").maybeSingle().then(({ data }) => {
      if (!data?.value) return;
      try {
        const payload = JSON.parse(data.value);
        if (payload.scopes) persistScopes(payload.scopes);
        if (payload.colors) persistColors(payload.colors);
        if (Array.isArray(payload.custom)) persistCustom(payload.custom);
      } catch {}
    });
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.faint }}>Set whether each tag applies to Cargoes, Positions, or Both.</div>
        <button onClick={syncToCloud} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 5, border: "1px solid rgba(88,166,255,0.4)", background: "rgba(88,166,255,0.12)", color: "#9ec5ff", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          ☁ Sync to cloud now
        </button>
      </div>
      {syncStatus && <div style={{ fontSize: 11, color: syncStatus.startsWith("Sync failed") ? "#ff8080" : "#43e97b", marginBottom: 8 }}>{syncStatus}</div>}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {names.map((tag, i) => {
          const preset = isPreset(tag);
          const scope = scopes[tag] || "both";
          const color = colors[tag];
          return (
            <div key={tag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 4px", borderTop: i ? "1px solid rgba(58,130,246,0.08)" : "none" }}>
              <button onClick={() => setColorPickFor(colorPickFor === tag ? null : tag)} title="Set tag colour"
                style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, cursor: "pointer", padding: 0,
                  border: "1.5px solid " + (color || "rgba(140,180,230,0.4)"), background: color || "transparent" }} />
              {colorPickFor === tag && (
                <div style={{ position: "absolute", zIndex: 500, marginTop: 60, background: "#071223", border: "1px solid " + C.bd, borderRadius: 6, padding: 6, display: "flex", gap: 4 }}>
                  {PALETTE.map(p => <button key={p} onClick={() => setColor(tag, p)} style={{ width: 16, height: 16, borderRadius: "50%", background: p, border: "none", cursor: "pointer" }} />)}
                  <button onClick={() => setColor(tag, null)} style={{ fontSize: 9, color: C.faint, background: "none", border: "none", cursor: "pointer" }}>clear</button>
                </div>
              )}

              {renaming === tag ? (
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onBlur={commitRename} onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                  style={{ background: "#081425", border: "1px solid " + C.blue, borderRadius: 4, color: C.tx, fontFamily: "inherit", fontSize: 12, fontWeight: 700, padding: "2px 6px", width: 140 }} />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, minWidth: 140 }}>
                  {tag} {preset && <span style={{ fontSize: 10, fontWeight: 400, color: "rgba(160,190,230,0.4)" }}>preset</span>}
                </span>
              )}

              <div style={{ display: "flex", gap: 4 }}>
                {["both", "cargoes", "positions"].map(s => (
                  <button key={s} onClick={() => setScope(tag, s)} style={rowBtn(scope === s, C.blue)}>
                    {s === "both" ? "Both" : s === "cargoes" ? "Cargoes" : "Positions"}
                  </button>
                ))}
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {!preset && (
                  <>
                    <button onClick={() => startRename(tag)} title="Rename" style={{ background: "none", border: "none", color: "rgba(120,160,220,0.5)", cursor: "pointer", fontSize: 11 }}>✎</button>
                    <button onClick={() => deleteTag(tag)} title="Delete" style={{ background: "none", border: "none", color: "rgba(255,107,107,0.5)", cursor: "pointer", fontSize: 12 }}>✕</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.bd2 }}>
        <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Add new tag…"
          onKeyDown={e => e.key === "Enter" && addTag()}
          style={{ flex: 1, background: "rgba(10,18,34,0.95)", border: "1px solid " + C.bd2, borderRadius: 5, color: "#cde", fontFamily: "inherit", fontSize: 12, padding: "6px 8px", outline: "none" }} />
        <button onClick={addTag} style={{ fontSize: 12, fontWeight: 700, padding: "6px 16px", borderRadius: 5, border: "1px solid rgba(88,166,255,0.5)", background: "rgba(88,166,255,0.15)", color: "#9ec5ff", cursor: "pointer", fontFamily: "inherit" }}>+ Add</button>
      </div>
    </div>
  );
}
