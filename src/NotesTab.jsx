import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";

const TOPICS = ["UKC","Med","Asia","J19","Inter","C18","TA","Parcel","TCE","SnP","TC"];

const TOPIC_COLORS = {
  UKC:"#58a6ff", Med:"#fb923c", Asia:"#a78bfa", J19:"#3fb950",
  Inter:"#38bdf8", C18:"#fbbf24", TA:"#f472b6", Parcel:"#34d399",
  TCE:"#e2e8f0", SnP:"#ff6b6b", TC:"#c084fc"
};

function fmtTs(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})
    + " " + d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

// Minimal rich-text toolbar actions
function applyFmt(cmd) { document.execCommand(cmd, false, null); }

export default function NotesTab() {
  const [notes, setNotes]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [topicFilter, setTopicFilter] = useState(null);
  const [selTopics, setSelTopics] = useState([]);
  const [title, setTitle]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const editorRef = useRef(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false });
    setNotes(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    const html = editorRef.current?.innerHTML?.trim();
    if (!html || html === "<br>") return;
    setSaving(true);
    await supabase.from("notes").insert({
      title: title.trim() || null,
      body: html,
      topics: selTopics,
      created_at: new Date().toISOString(),
    });
    if (editorRef.current) editorRef.current.innerHTML = "";
    setTitle("");
    setSelTopics([]);
    await load();
    setSaving(false);
  }

  async function del(id) {
    await supabase.from("notes").delete().eq("id", id);
    setNotes(n => n.filter(x => x.id !== id));
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = notes.filter(n => {
    if (topicFilter && !(n.topics || []).includes(topicFilter)) return false;
    if (search) {
      const s = search.toLowerCase();
      const inBody = (n.body || "").replace(/<[^>]+>/g,"").toLowerCase().includes(s);
      const inTitle = (n.title || "").toLowerCase().includes(s);
      if (!inBody && !inTitle) return false;
    }
    return true;
  });

  // ── Styles ────────────────────────────────────────────────────────────────
  const topicBtn = (t, active, onClick) => {
    const col = TOPIC_COLORS[t] || C.blue;
    return (
      <button key={t} onClick={onClick} style={{
        fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:3,
        border:"1px solid "+(active ? col : col+"55"),
        background: active ? col+"22" : "transparent",
        color: active ? col : col+"99",
        cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.03em",
        transition:"all 0.12s",
      }}>{t}</button>
    );
  };

  const tbBtn = (label, action, title2) => (
    <button
      onMouseDown={e => { e.preventDefault(); applyFmt(action); }}
      title={title2}
      style={{
        background:"transparent", border:"1px solid "+C.bd2,
        borderRadius:3, color:C.dim, padding:"2px 7px",
        fontFamily:"inherit", fontSize:11, cursor:"pointer",
        fontWeight: action==="bold" ? 700 : 400,
        fontStyle: action==="italic" ? "italic" : "normal",
        textDecoration: action==="underline" ? "underline" : "none",
      }}
    >{label}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, height:"100%" }}>

      {/* ── Compose panel ── */}
      <div style={{
        background:C.bg2, border:"1px solid "+C.bd,
        borderRadius:8, overflow:"hidden",
      }}>
        {/* Title row */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderBottom:"1px solid "+C.bd2 }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (optional)…"
            style={{
              flex:1, background:"transparent", border:"none",
              color:C.tx, fontFamily:"inherit", fontSize:13, fontWeight:600,
              outline:"none", letterSpacing:"0.01em",
            }}
          />
          {/* Topic selector */}
          <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
            {TOPICS.map(t => topicBtn(t, selTopics.includes(t), () =>
              setSelTopics(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev,t])
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display:"flex", gap:4, padding:"5px 10px", borderBottom:"1px solid "+C.bd2, background:"rgba(4,10,22,0.4)" }}>
          {tbBtn("B","bold","Bold")}
          {tbBtn("U","underline","Underline")}
          {tbBtn("I","italic","Italic")}
          <div style={{ width:1, background:C.bd2, margin:"0 2px" }}/>
          {tbBtn("• List","insertUnorderedList","Bullet list")}
          {tbBtn("1. List","insertOrderedList","Numbered list")}
          <div style={{ flex:1 }}/>
          <button onClick={save} disabled={saving} style={{
            background: saving ? "rgba(31,111,235,0.4)" : "transparent",
            border:"1px solid rgba(88,166,255,0.55)",
            borderRadius:4, color:"rgba(140,200,255,0.9)",
            fontFamily:"inherit", fontWeight:600, fontSize:11,
            padding:"3px 14px", cursor: saving ? "default" : "pointer",
            letterSpacing:"0.07em", textTransform:"uppercase",
          }}>
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>

        {/* Editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={e => { if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) save(); }}
          data-placeholder="Write your note… (Ctrl+Enter to save)"
          style={{
            minHeight:90, padding:"10px 14px",
            color:C.tx, fontFamily:"inherit", fontSize:12,
            outline:"none", lineHeight:1.65,
          }}
        />
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        {/* Search */}
        <div style={{ position:"relative", flex:"0 0 220px" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes…"
            style={{
              width:"100%", background:C.bg2, border:"1px solid "+C.bd,
              borderRadius:5, color:C.tx, fontFamily:"inherit", fontSize:12,
              padding:"5px 28px 5px 10px", outline:"none", boxSizing:"border-box",
            }}
          />
          {search && (
            <button onClick={()=>setSearch("")} style={{
              position:"absolute", right:6, top:"50%", transform:"translateY(-50%)",
              background:"none", border:"none", color:C.faint, cursor:"pointer", fontSize:11,
            }}>✕</button>
          )}
        </div>

        {/* Topic filters */}
        <button
          onClick={() => setTopicFilter(null)}
          style={{
            fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:3,
            border:"1px solid "+(topicFilter===null ? C.blue : C.bd),
            background: topicFilter===null ? "rgba(88,166,255,0.15)" : "transparent",
            color: topicFilter===null ? C.blue : C.dim,
            cursor:"pointer", fontFamily:"inherit",
          }}>All</button>

        {TOPICS.map(t => topicBtn(t, topicFilter===t, () =>
          setTopicFilter(prev => prev===t ? null : t)
        ))}

        <span style={{ marginLeft:"auto", fontSize:11, color:C.faint }}>
          {filtered.length} note{filtered.length!==1?"s":""}
        </span>
      </div>

      {/* ── Notes list ── */}
      <div style={{ display:"flex", flexDirection:"column", gap:6, overflowY:"auto", flex:1 }}>
        {loading && (
          <div style={{ fontSize:12, color:C.faint, padding:"20px", textAlign:"center" }}>Loading…</div>
        )}
        {!loading && filtered.length===0 && (
          <div style={{ fontSize:12, color:C.faint, padding:"20px", textAlign:"center", fontStyle:"italic" }}>
            {search || topicFilter ? "No notes match your filter." : "No notes yet. Write one above."}
          </div>
        )}
        {filtered.map(note => {
          const isOpen = expandedId === note.id;
          const preview = (note.body||"").replace(/<[^>]+>/g,"").slice(0,120);
          return (
            <div key={note.id} style={{
              background:C.bg2, border:"1px solid "+C.bd,
              borderRadius:7, overflow:"hidden",
              transition:"border-color 0.15s",
            }}>
              {/* Note header */}
              <div
                onClick={() => setExpandedId(isOpen ? null : note.id)}
                style={{
                  display:"flex", alignItems:"flex-start", gap:8,
                  padding:"8px 12px", cursor:"pointer",
                  background: isOpen ? C.bg3 : "transparent",
                  borderBottom: isOpen ? "1px solid "+C.bd2 : "none",
                }}
              >
                {/* Topic tags */}
                {(note.topics||[]).length > 0 && (
                  <div style={{ display:"flex", gap:3, flexWrap:"wrap", flexShrink:0, paddingTop:1 }}>
                    {(note.topics||[]).map(t => {
                      const col = TOPIC_COLORS[t]||C.blue;
                      return (
                        <span key={t} style={{
                          fontSize:10, fontWeight:700, padding:"1px 5px",
                          borderRadius:2, background:col+"18",
                          border:"1px solid "+col+"44", color:col,
                          letterSpacing:"0.03em",
                        }}>{t}</span>
                      );
                    })}
                  </div>
                )}

                {/* Title / preview */}
                <div style={{ flex:1, minWidth:0 }}>
                  {note.title && (
                    <div style={{ fontSize:13, fontWeight:700, color:C.tx, marginBottom:2 }}>
                      {note.title}
                    </div>
                  )}
                  {!isOpen && (
                    <div style={{
                      fontSize:12, color:C.dim,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    }}>{preview || "—"}</div>
                  )}
                </div>

                {/* Timestamp + actions */}
                <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                  <span style={{ fontSize:11, color:C.faint }}>
                    {fmtTs(note.created_at)}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); del(note.id); }}
                    style={{
                      background:"none", border:"none", color:C.red,
                      cursor:"pointer", fontSize:11, opacity:0.5,
                      padding:"0 2px", lineHeight:1,
                    }}>✕</button>
                  <span style={{ fontSize:11, color:C.faint }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded body */}
              {isOpen && (
                <div
                  dangerouslySetInnerHTML={{ __html: note.body }}
                  style={{
                    padding:"12px 16px", fontSize:13, color:C.tx,
                    lineHeight:1.7, fontFamily:"inherit",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Editor placeholder CSS */}
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: rgba(110,155,215,0.35);
          pointer-events: none;
        }
        [contenteditable] ul { padding-left: 18px; margin: 4px 0; }
        [contenteditable] ol { padding-left: 18px; margin: 4px 0; }
        [contenteditable] li { margin: 2px 0; }
      `}</style>
    </div>
  );
}
