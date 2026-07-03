import React, { useState, useEffect, useRef, useMemo } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { classifyRegion, fmtDateShort } from "./utils";

const STEEM_LOGO = "data:image/png;base64,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";

const MARKET_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter"];
const SEG_ORDER = ["Sub 10k", "City", "Inter", "J19", "Flexi", "Handy", "MR"];
const DRAFT_KEY = "tankpos_poslist_v4";
const DRAFT_META_KEY = "tankpos_poslist_meta_v4";

// Compact column pixel widths — no wrapping, comment truncates with hover
const CW = { vessel:148, dwt:62, built:48, coating:66, open:54, port:86, comment:108, operator:128, del:22 };
const HEADS = ["VESSEL","DWT","BUILT","COATING","OPEN","PORT","COMMENT","OPERATOR",""];
const GRID = Object.values(CW).map(w=>w+"px").join(" ");

// UMD script-tag loader — avoids Vite URL import failures
let _htiP = null;
function loadHTI() {
  if (_htiP) return _htiP;
  _htiP = new Promise((res, rej) => {
    if (window.htmlToImage) { res(window.htmlToImage); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html-to-image/dist/html-to-image.js";
    s.onload = () => res(window.htmlToImage);
    s.onerror = () => { _htiP = null; rej(new Error("CDN unavailable — try Download PNG after reconnecting.")); };
    document.head.appendChild(s);
  });
  return _htiP;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDwt(n) {
  if (n == null || n === "") return "";
  return Number(n).toLocaleString("en-US").replace(/,/g, "\u2009");
}
function fmtCoating(s) { return s ? String(s).toUpperCase() : ""; }
function fmtOpen(d) { if (!d) return ""; try { return fmtDateShort(d); } catch { return d; } }
function parseTags(v) {
  if (!v?.tag) return [];
  const r = Array.isArray(v.tag) ? v.tag : String(v.tag).split(",");
  return r.map(t => String(t).toUpperCase().trim()).filter(Boolean);
}
function groupVessels(list, by) {
  const fn = by === "region"
    ? v => v.superRegion || classifyRegion(v.openPort) || "Other"
    : v => v.segment || "Other";
  const out = {};
  list.forEach(v => { const k = fn(v); if (!out[k]) out[k] = []; out[k].push(v); });
  if (by === "segment") {
    const s = {};
    SEG_ORDER.forEach(k => { if (out[k]) s[k] = out[k]; });
    Object.keys(out).forEach(k => { if (!s[k]) s[k] = out[k]; });
    return s;
  }
  return out;
}

// ─── Generic bar+line SVG chart ───────────────────────────────────────────────
function BarLineChart({ data, barKey, lineKey, barLabel, lineLabel, title, accent = "#3a82f6" }) {
  if (!data?.length) return (
    <div style={{ padding: 20, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 11 }}>
      {title} · loading...
    </div>
  );
  const W = 440, H = 170;
  const P = { t: 26, r: 44, b: 28, l: 26 };
  const w = W - P.l - P.r, h = H - P.t - P.b;
  const maxB = Math.max(...data.map(d => d[barKey] || 0), 1);
  const maxL = lineKey ? Math.max(...data.map(d => d[lineKey] || 0), 1) : 1;
  const bw = (w / data.length) * 0.58;
  const xc = i => P.l + (i + 0.5) * (w / data.length);
  const yB = v => P.t + h - (v / maxB) * h;
  const yL = v => P.t + h - (v / maxL) * h;
  const hasLine = lineKey && data.some(d => d[lineKey] > 0);
  const pts = hasLine ? data.map((d, i) => `${xc(i)},${yL(d[lineKey] || 0)}`).join(" ") : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <text x={P.l} y={14} fill="#dbe6f5" fontSize="11" fontWeight="700">{title}</text>
      <rect x={P.l} y={5} width={9} height={9} fill={accent} opacity="0.55" rx="1" />
      <text x={P.l + 12} y={13} fill="rgba(219,230,245,0.65)" fontSize="9">{barLabel}</text>
      {hasLine && <>
        <line x1={P.l + 58} y1={10} x2={P.l + 72} y2={10} stroke="#9fd0ff" strokeWidth="2" />
        <text x={P.l + 75} y={13} fill="rgba(219,230,245,0.65)" fontSize="9">{lineLabel}</text>
      </>}
      {data.map((d, i) => (
        <g key={i}>
          <rect x={xc(i) - bw / 2} y={yB(d[barKey] || 0)} width={bw}
            height={h - (yB(d[barKey] || 0) - P.t)} fill={accent} opacity="0.58" rx="2" />
          {data.length <= 10 && d[barKey] > 0 && (
            <text x={xc(i)} y={yB(d[barKey] || 0) - 4} fill="#dbe6f5" fontSize="10" textAnchor="middle">{d[barKey]}</text>
          )}
          <text x={xc(i)} y={H - 7} fill="rgba(219,230,245,0.5)" fontSize="9" textAnchor="middle">
            {String(d.label || "").slice(0, 7)}
          </text>
        </g>
      ))}
      {hasLine && <>
        <polyline points={pts} fill="none" stroke="#9fd0ff" strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={xc(i)} cy={yL(d[lineKey] || 0)} r="2.5" fill="#9fd0ff" />
        ))}
        {/* Right axis max label */}
        <text x={W - P.r + 3} y={P.t} fill="rgba(219,230,245,0.35)" fontSize="8" textAnchor="start">{maxL}d</text>
        <text x={W - P.r + 3} y={P.t + h} fill="rgba(219,230,245,0.35)" fontSize="8" textAnchor="start">0d</text>
      </>}
    </svg>
  );
}

// ─── Single interactive+capturable vessel row ─────────────────────────────────
function VesselRow({ v, localIdx, globalIdx, editing, onEdit, onSave, onDelete,
  onDragStart, onDragEnter, onDragEnd, isDragOver }) {
  const [vals, setVals] = useState({ ...v });
  useEffect(() => { if (editing) setVals({ ...v }); }, [editing]);
  const upd = (k, val) => setVals(p => ({ ...p, [k]: val }));
  const CELL = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };
  const INP = {
    background: "transparent", border: "none",
    borderBottom: "1px solid rgba(58,130,246,0.45)",
    color: "#dbe6f5", fontSize: 11, width: "100%", outline: "none",
    padding: "1px 2px", fontFamily: "inherit", minWidth: 0
  };
  // Alternate: even rows slightly lighter — matches positions tab
  const rowBg = isDragOver
    ? "rgba(58,130,246,0.18)"
    : localIdx % 2 === 0 ? "rgba(255,255,255,0.028)" : "transparent";

  if (editing) return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, background: "rgba(58,130,246,0.1)", color: "#dbe6f5", fontSize: 11, padding: "5px 8px", borderTop: "1px solid rgba(58,130,246,0.16)", alignItems: "center", gap: 2 }}>
      <input style={INP} value={vals.vessel || ""} onChange={e => upd("vessel", e.target.value)} autoFocus />
      <input style={INP} value={vals.dwt || ""} onChange={e => upd("dwt", e.target.value)} />
      <input style={INP} value={vals.built || ""} onChange={e => upd("built", e.target.value)} />
      <input style={INP} value={vals.coating || ""} onChange={e => upd("coating", e.target.value)} />
      <input style={INP} value={vals.date || ""} onChange={e => upd("date", e.target.value)} />
      <input style={INP} value={vals.openPort || ""} onChange={e => upd("openPort", e.target.value)} />
      <input style={INP} value={vals.comment || ""} onChange={e => upd("comment", e.target.value)} />
      <input style={INP} value={vals.operator || ""} onChange={e => upd("operator", e.target.value)} onKeyDown={e => e.key === "Enter" && onSave(vals)} />
      <button onClick={() => onSave(vals)} className="no-export"
        style={{ background: "none", border: "none", color: "#43e97b", cursor: "pointer", fontSize: 14, padding: 0 }}>✓</button>
    </div>
  );

  return (
    <div
      draggable onDragStart={onDragStart} onDragEnter={onDragEnter} onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()} onClick={onEdit} title="Click to edit · drag to reorder"
      style={{ display: "grid", gridTemplateColumns: GRID, background: rowBg, color: "#dbe6f5", fontSize: 11, padding: "4px 8px", borderTop: "1px solid rgba(58,130,246,0.1)", cursor: "pointer", alignItems: "center", gap: 2, userSelect: "none" }}
    >
      <div style={{ ...CELL, fontWeight: 600 }}>{v.vessel}</div>
      <div style={CELL}>{fmtDwt(v.dwt)}</div>
      <div style={CELL}>{v.built || ""}</div>
      <div style={CELL}>{fmtCoating(v.coating)}</div>
      <div style={CELL}>{fmtOpen(v.date)}</div>
      <div style={CELL}>{v.openPort || ""}</div>
      <div style={{ ...CELL, color: "rgba(219,230,245,0.6)" }} title={v.comment || ""}>{v.comment || ""}</div>
      <div style={CELL}>{v.operator || ""}</div>
      <button onClick={e => { e.stopPropagation(); onDelete(); }} className="no-export"
        style={{ background: "none", border: "none", color: "rgba(239,68,68,0.55)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function ReportsTab({ selectedVessels = [], allVessels = [], selectedCargoes = [] }) {
  const [section, setSection] = useState("poslist");

  // Position list
  const [reportVessels, setReportVessels] = useState(() => {
    try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [posTitle, setPosTitle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_META_KEY))?.title || "CHEMS & SPECIALIZED POSITION LIST"; } catch { return "CHEMS & SPECIALIZED POSITION LIST"; }
  });
  const [posSubtitle, setPosSubtitle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_META_KEY))?.subtitle || "10-22,000 DWT · COATED AND STST"; } catch { return "10-22,000 DWT · COATED AND STST"; }
  });
  const [posGroupBy, setPosGroupBy] = useState("segment");
  const [posDate, setPosDate] = useState(new Date().toISOString().split("T")[0]);
  const [exportStatus, setExportStatus] = useState("");
  const [editingRid, setEditingRid] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const dragFrom = useRef(null);
  const dragTo = useRef(null);
  const previewRef = useRef(null);

  // Pool filters
  const [tagFilter, setTagFilter] = useState(new Set());
  const [dateFilter, setDateFilter] = useState("all");
  const [poolSearch, setPoolSearch] = useState("");

  // Fixing window history (Supabase)
  const [fixHistory, setFixHistory] = useState([]);

  // Market report
  const [reportType, setReportType] = useState("");
  const [commentary, setCommentary] = useState("");
  const [rateGrid, setRateGrid] = useState({});
  const [tceEarnings, setTceEarnings] = useState({});
  const [fixtures, setFixtures] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [savedReports, setSavedReports] = useState([]);

  const importedNames = useRef(new Set(reportVessels.map(v => v.vessel)));
  // Quick positions state
  const [quickRows, setQuickRows] = useState([]);
  const [quickTitle, setQuickTitle] = useState("Available tonnage");
  const [quickPaste, setQuickPaste] = useState("");
  const [showPaste, setShowPaste] = useState(true);
  const [quickCopied, setQuickCopied] = useState(false);

  const ACCENT = C.blue || "#3a82f6";

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { loadHTI().catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedVessels?.length) return;
    const toAdd = selectedVessels
      .filter(v => !importedNames.current.has(v.vessel))
      .map(v => ({ ...v, _rid: v.vessel + "_" + Date.now() + "_" + Math.random().toString(36).slice(2) }));
    if (toAdd.length) {
      toAdd.forEach(v => importedNames.current.add(v.vessel));
      setReportVessels(p => [...p, ...toAdd]);
      setSection("poslist");
    }
  }, [selectedVessels]);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(reportVessels)); } catch {}
  }, [reportVessels]);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_META_KEY, JSON.stringify({ title: posTitle, subtitle: posSubtitle })); } catch {}
  }, [posTitle, posSubtitle]);

  useEffect(() => { loadSavedReports(); }, []);

  useEffect(() => {
    async function fetchFixHistory() {
      try {
        const since = new Date(); since.setDate(since.getDate() - 84);
        const { data } = await supabase
          .from("positions")
          .select("updated_at, date")
          .gte("updated_at", since.toISOString())
          .not("date", "is", null);
        if (!data?.length) return;
        const weeks = {};
        data.forEach(row => {
          if (!row.updated_at) return;
          const d = new Date(row.updated_at);
          const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
          const key = ws.toISOString().slice(0, 10);
          if (!weeks[key]) weeks[key] = { ships: 0, totalDays: 0, cnt: 0 };
          weeks[key].ships++;
          if (row.date) {
            const days = Math.round((new Date(row.date) - d) / 86400000);
            if (days >= 0 && days <= 60) { weeks[key].totalDays += days; weeks[key].cnt++; }
          }
        });
        setFixHistory(Object.entries(weeks)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, v]) => ({
            label: new Date(key).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
            ships: v.ships,
            avgWindow: v.cnt > 0 ? Math.round(v.totalDays / v.cnt) : 0
          })));
      } catch (e) { console.error("fixHistory:", e); }
    }
    fetchFixHistory();
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const posGrouped = useMemo(() => groupVessels(reportVessels, posGroupBy), [reportVessels, posGroupBy]);
  const reportedNames = useMemo(() => new Set(reportVessels.map(v => v.vessel)), [reportVessels]);

  const openTimingData = useMemo(() => {
    const B = {}; const today = new Date();
    const ORDER = ["PPT", "1-7d", "7-14d", "14-21d", "21-30d", "30d+"];
    reportVessels.forEach(v => {
      const days = v.date ? Math.round((new Date(v.date) - today) / 86400000) : null;
      const k = days === null || days < 1 ? "PPT" : days <= 7 ? "1-7d" : days <= 14 ? "7-14d" : days <= 21 ? "14-21d" : days <= 30 ? "21-30d" : "30d+";
      B[k] = (B[k] || 0) + 1;
    });
    return ORDER.filter(k => B[k]).map(k => ({ label: k, count: B[k] }));
  }, [reportVessels]);

  const allTags = useMemo(() => {
    const s = new Set(); allVessels.forEach(v => parseTags(v).forEach(t => s.add(t))); return [...s].sort();
  }, [allVessels]);

  const vesselPool = useMemo(() => {
    const now = new Date();
    return allVessels.filter(v => {
      if (reportedNames.has(v.vessel)) return false;
      if (poolSearch && !v.vessel?.toLowerCase().includes(poolSearch.toLowerCase())) return false;
      if (tagFilter.size > 0 && ![...tagFilter].some(t => parseTags(v).includes(t))) return false;
      if (dateFilter !== "all" && v.updated_at) {
        const diff = (now - new Date(v.updated_at)) / 86400000;
        if (dateFilter === "today" && diff > 1) return false;
        if (dateFilter === "2d" && diff > 2) return false;
        if (dateFilter === "7d" && diff > 7) return false;
      }
      return true;
    });
  }, [allVessels, reportedNames, tagFilter, poolSearch, dateFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function addFromPool(v) {
    if (reportedNames.has(v.vessel)) return;
    importedNames.current.add(v.vessel);
    setReportVessels(p => [...p, { ...v, _rid: v.vessel + "_" + Date.now() }]);
  }
  function deleteRow(rid) {
    setReportVessels(p => { const rem = p.find(x => x._rid === rid); if (rem) importedNames.current.delete(rem.vessel); return p.filter(x => x._rid !== rid); });
    if (editingRid === rid) setEditingRid(null);
  }
  function saveEdit(rid, vals) { setReportVessels(p => p.map(v => v._rid === rid ? { ...v, ...vals } : v)); setEditingRid(null); }
  function clearAll() {
    if (!window.confirm(`Remove all ${reportVessels.length} vessels from this position list?`)) return;
    importedNames.current = new Set(); setReportVessels([]);
  }
  function dragStart(i) { dragFrom.current = i; }
  function dragEnter(i) { dragTo.current = i; setDragOver(i); }
  function dragEnd() {
    if (dragFrom.current !== null && dragTo.current !== null && dragFrom.current !== dragTo.current) {
      setReportVessels(p => { const a = [...p], [item] = a.splice(dragFrom.current, 1); a.splice(dragTo.current, 0, item); return a; });
    }
    dragFrom.current = null; dragTo.current = null; setDragOver(null);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const exportFilter = node => !node.classList?.contains("no-export");
  async function capturePng() {
    setEditingRid(null);
    await new Promise(r => setTimeout(r, 70));
    const lib = await loadHTI();
    return lib.toPng(previewRef.current, { backgroundColor: "#070f1c", pixelRatio: 2, filter: exportFilter });
  }
  async function handleCopyEmail() {
    setExportStatus("Copying...");
    try {
      setEditingRid(null); await new Promise(r => setTimeout(r, 70));
      const lib = await loadHTI();
      const blob = await lib.toBlob(previewRef.current, { backgroundColor: "#070f1c", pixelRatio: 2, filter: exportFilter });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setExportStatus("Copied — paste into your email body.");
    } catch (e) { setExportStatus("Copy failed: " + e.message); }
  }
  async function handleDownloadPng() {
    setExportStatus("Rendering...");
    try { const url = await capturePng(); const a = document.createElement("a"); a.download = `positions-${posDate}.png`; a.href = url; a.click(); setExportStatus("Downloaded."); }
    catch (e) { setExportStatus("Failed: " + e.message); }
  }

  // ── Market report ─────────────────────────────────────────────────────────
  async function loadSavedReports() {
    try { const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }); if (data) setSavedReports(data); } catch {}
  }
  function initRateGrid(type) {
    const G = {
      "Intermediate": { "5kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" }, "10kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" }, "18kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" } },
      "Asia to Europe": { "25kt": { "Sing-ARA": "", "China-ARA": "" }, "35kt": { "Sing-ARA": "", "China-ARA": "" }, "45kt": { "Sing-ARA": "", "China-ARA": "" } },
      "Transatlantic": { "30kt": { "ARA-USG": "", "USG-ARA": "" }, "37kt": { "ARA-USG": "", "USG-ARA": "" } },
      "TimeCharter": { "12m": { "10k": "", "15k": "", "20k": "" }, "24m": { "10k": "", "15k": "", "20k": "" } },
    };
    setRateGrid(G[type] || {});
  }
  async function saveReport() {
    try { await supabase.from("reports").insert([{ report_type: reportType, report_date: reportDate, commentary, rate_grid: rateGrid, tce_earnings: tceEarnings, fixtures, quotes }]); alert("Saved."); loadSavedReports(); } catch { alert("Save failed."); }
  }
  async function loadReport(id) {
    try {
      const { data } = await supabase.from("reports").select("*").eq("id", id).single(); if (!data) return;
      setReportType(data.report_type); setReportDate(data.report_date || reportDate);
      setCommentary(data.commentary || ""); setRateGrid(data.rate_grid || {});
      setTceEarnings(data.tce_earnings || {}); setFixtures(data.fixtures || []); setQuotes(data.quotes || []);
      setSection("market");
    } catch {}
  }

  const SB = { fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 5, cursor: "pointer", border: "none", fontFamily: "inherit", whiteSpace: "nowrap" };
  const IS = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 11, padding: "5px 8px", outline: "none", fontFamily: "inherit" };
  const avgRate = Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).length) || 0;
  const avgTCE = Object.values(tceEarnings).filter(v => v).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(tceEarnings).filter(v => v).length) || 0;

  // ── Quick Positions helpers ───────────────────────────────────────────────
  function parsePaste() {
    const lines = quickPaste.split("\n").map(l => l.trim()).filter(Boolean);
    const rows = []; let curOp = "";
    lines.forEach(line => {
      if (/^\*[^*]+\*$/.test(line) || /^_[^_]+_$/.test(line)) {
        curOp = line.replace(/[*_]/g, "").trim(); return;
      }
      const parts = line.split(/\s*[–—\-]\s*/);
      if (parts.length >= 2 && parts[0].trim().length > 0) {
        rows.push({ id: "q"+Date.now()+Math.random().toString(36).slice(2), operator: curOp, vessel: parts[0].trim().toUpperCase(), port: (parts[1]||"").trim().toUpperCase(), date: (parts[2]||"").trim().toUpperCase(), direction: parts.slice(3).join(" – ").trim() });
      } else if (rows.length > 0 && !rows[rows.length-1].direction && !/\d/.test(line.slice(0,3))) {
        rows[rows.length-1].direction = line;
      } else if (parts.length < 2) {
        curOp = line;
      }
    });
    setQuickRows(rows);
    if (rows.length) setShowPaste(false);
  }

  function addQuickRow() {
    setQuickRows(p => [...p, { id: "q"+Date.now(), operator: "", vessel: "", port: "", date: "", direction: "" }]);
  }
  function updateQuickRow(id, field, val) { setQuickRows(p => p.map(r => r.id===id ? {...r,[field]:val} : r)); }
  function deleteQuickRow(id) { setQuickRows(p => p.filter(r => r.id!==id)); }

  function buildQuickText() {
    if (!quickRows.length) return "";
    const byOp = {}; const opOrder = [];
    quickRows.forEach(r => { const op=r.operator||"Unknown"; if(!byOp[op]){byOp[op]=[];opOrder.push(op);} byOp[op].push(r); });
    const lines = [`|| ${quickTitle} ||`, ""];
    opOrder.forEach(op => {
      lines.push(`*${op}*`);
      byOp[op].forEach(r => {
        lines.push([r.vessel,r.port,r.date].filter(Boolean).join(" – "));
        if (r.direction) lines.push(r.direction);
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  async function copyQuick() {
    const text = buildQuickText(); if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const ta=document.createElement("textarea"); ta.value=text; ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;background:transparent;"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    setQuickCopied(true); setTimeout(()=>setQuickCopied(false), 2500);
  }

  return (
    <div style={{ display: "flex", height: "100%", background: C.bg, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`@media print{body>*{visibility:hidden;}.pos-print,.pos-print *{visibility:visible;}.pos-print{position:absolute;left:0;top:0;width:100%;}.no-export{display:none!important;}}`}</style>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div style={{ width: 220, minWidth: 220, display: "flex", flexDirection: "column", background: C.bg2, borderRight: "1px solid " + C.bd, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
          {[["poslist", "Positions"], ["market", "Market"], ["quick", "Quick"]].map(([k, l]) => (
            <button key={k} onClick={() => setSection(k)} style={{ flex: 1, padding: "10px 4px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", borderBottom: section === k ? `2px solid ${ACCENT}` : "2px solid transparent", background: "transparent", color: section === k ? ACCENT : C.dim, fontFamily: "inherit" }}>{l}</button>
          ))}
        </div>

        {section === "poslist" && <>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{reportVessels.length} vessel{reportVessels.length !== 1 ? "s" : ""} in report</div>
            <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>Draft auto-saved · persists across tabs</div>
          </div>

          {/* ADD VESSELS — fills all space between stats and bottom */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "8px 10px", gap: 5 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>Add vessels</div>
            {/* Date filter */}
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
              {[["all", "All"], ["today", "Today"], ["2d", "2d"], ["7d", "7d"]].map(([k, l]) => (
                <button key={k} onClick={() => setDateFilter(k)}
                  style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, cursor: "pointer", border: `1px solid ${dateFilter === k ? ACCENT : C.bd}`, background: dateFilter === k ? ACCENT : "transparent", color: dateFilter === k ? "#fff" : C.dim, fontFamily: "inherit" }}>{l}</button>
              ))}
            </div>
            <input value={poolSearch} onChange={e => setPoolSearch(e.target.value)} placeholder="Search vessel..."
              style={{ ...IS, width: "100%", boxSizing: "border-box", flexShrink: 0 }} />
            {allTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, flexShrink: 0 }}>
                {allTags.map(t => (
                  <button key={t} onClick={() => setTagFilter(p => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                    style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, cursor: "pointer", border: `1px solid ${tagFilter.has(t) ? ACCENT : C.bd}`, background: tagFilter.has(t) ? ACCENT : "transparent", color: tagFilter.has(t) ? "#fff" : C.dim, fontFamily: "inherit" }}>{t}</button>
                ))}
                {tagFilter.size > 0 && <button onClick={() => setTagFilter(new Set())} style={{ fontSize: 9, color: C.red, background: "none", border: "none", cursor: "pointer" }}>✕</button>}
              </div>
            )}
            {/* Pool list — fills remaining height */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {vesselPool.length === 0 ? (
                <div style={{ padding: "12px 0", textAlign: "center", color: C.faint, fontSize: 10 }}>
                  {allVessels.length === 0 ? "Select vessels on Positions tab" : "No vessels match filters"}
                </div>
              ) : vesselPool.map(v => (
                <div key={v.vessel} onClick={() => addFromPool(v)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 7px", borderRadius: 4, background: C.bg3, cursor: "pointer", border: "1px solid transparent" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>{v.vessel}</div>
                    <div style={{ fontSize: 9, color: C.faint }}>{v.segment || ""}{v.dwt ? ` · ${fmtDwt(v.dwt)}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 15, color: ACCENT, fontWeight: 700, lineHeight: 1 }}>+</span>
                </div>
              ))}
            </div>
          </div>

          {/* Saved + Clear at bottom */}
          <div style={{ flexShrink: 0, borderTop: "1px solid " + C.bd }}>
            {savedReports.filter(r => r.report_type === "Position List").length > 0 && (
              <div style={{ padding: "8px 10px", maxHeight: 110, overflowY: "auto" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saved</div>
                {savedReports.filter(r => r.report_type === "Position List").map(r => (
                  <div key={r.id} onClick={() => loadReport(r.id)} style={{ padding: "4px 7px", borderRadius: 3, background: C.bg3, cursor: "pointer", marginBottom: 3 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>Position List</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                  </div>
                ))}
              </div>
            )}
            {reportVessels.length > 0 && (
              <div style={{ padding: "8px 10px" }}>
                <button onClick={clearAll}
                  style={{ width: "100%", padding: "7px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 5, border: "1px solid rgba(239,68,68,0.45)", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontFamily: "inherit" }}>
                  Clear all vessels
                </button>
              </div>
            )}
          </div>
        </>}

        {section === "market" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Report type</div>
            {MARKET_TYPES.map(t => (
              <button key={t} onClick={() => { setReportType(t); initRateGrid(t); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: reportType === t ? 700 : 400, border: `1px solid ${reportType === t ? ACCENT : C.bd}`, background: reportType === t ? "rgba(58,130,246,0.1)" : "transparent", color: reportType === t ? ACCENT : C.dim, fontFamily: "inherit" }}>{t}</button>
            ))}
            {savedReports.filter(r => r.report_type !== "Position List").length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.bd }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Saved</div>
                {savedReports.filter(r => r.report_type !== "Position List").map(r => (
                  <div key={r.id} onClick={() => loadReport(r.id)} style={{ padding: "5px 7px", borderRadius: 4, background: C.bg3, cursor: "pointer", marginBottom: 3 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{r.report_type}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === "quick" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 10px", gap: 6, overflow: "hidden" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Quick daily positions</div>
            <div style={{ fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
              Paste raw positions from WhatsApp or email, parse into rows, then copy in broker format.
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ paddingTop: 8, borderTop: "1px solid " + C.bd }}>
              <div style={{ fontSize: 9, color: C.faint, marginBottom: 4 }}>Format used in copy:</div>
              <div style={{ fontSize: 9, color: C.dim, fontFamily: "monospace", lineHeight: 1.6, background: C.bg3, padding: "6px 8px", borderRadius: 4 }}>
                {"|| Available tonnage ||\n*Operator*\nVESSEL – PORT – DATE\nDirection"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {section === "poslist" && <>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", background: C.bg2, borderBottom: "1px solid " + C.bd, flexWrap: "wrap", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Position List</span>
            <input type="date" value={posDate} onChange={e => setPosDate(e.target.value)} style={{ ...IS }} />
            <div style={{ display: "flex", gap: 3 }}>
              {[["segment", "By Segment"], ["region", "By Region"]].map(([k, l]) => (
                <button key={k} onClick={() => setPosGroupBy(k)}
                  style={{ ...SB, border: `1px solid ${posGroupBy === k ? ACCENT : C.bd}`, background: posGroupBy === k ? ACCENT : "transparent", color: posGroupBy === k ? "#fff" : C.dim }}>{l}</button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {exportStatus && <span style={{ fontSize: 10, color: C.dim, maxWidth: 220 }}>{exportStatus}</span>}
            <button onClick={handleCopyEmail} style={{ ...SB, background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.45)", color: "#f5a623" }}>Copy for Email</button>
            <button onClick={handleDownloadPng} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Download PNG</button>
            <button onClick={() => window.print()} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Print / PDF</button>
          </div>
          {/* Editable title strip */}
          <div style={{ display: "flex", gap: 8, padding: "5px 12px", background: C.bg3, borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            <input value={posTitle} onChange={e => setPosTitle(e.target.value)} style={{ ...IS, flex: 2 }} placeholder="Report title" />
            <input value={posSubtitle} onChange={e => setPosSubtitle(e.target.value)} style={{ ...IS, flex: 3 }} placeholder="Subtitle" />
          </div>

          {/* Scrollable report area */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: 12 }}>
            {/* Captured node — entire report */}
            <div ref={previewRef} className="pos-print" style={{ background: "#070f1c", fontFamily: "Inter,system-ui,sans-serif", width: 750 }}>
              {/* Date bar */}
              <div style={{ background: "#0c1e3d", padding: "7px 14px", textAlign: "right" }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{new Date(posDate).toLocaleDateString("en-GB")}</span>
              </div>
              {/* Logo */}
              <div style={{ background: "#fff", padding: "11px 0", textAlign: "center" }}>
                <img src={STEEM_LOGO} alt="Steem1960 Shipbrokers" style={{ height: 38 }} />
              </div>
              {/* Title — styled inputs look like text in PNG capture */}
              <div style={{ background: "#0c1e3d", padding: "12px 14px 10px", textAlign: "center", color: "#fff" }}>
                <input value={posTitle} onChange={e => setPosTitle(e.target.value)}
                  style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, textAlign: "center", outline: "none", letterSpacing: 0.5, fontFamily: "inherit" }} />
                <input value={posSubtitle} onChange={e => setPosSubtitle(e.target.value)}
                  style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 11, textAlign: "center", outline: "none", marginTop: 2, fontFamily: "inherit" }} />
              </div>

              {/* Table */}
              <div style={{ padding: "8px 6px 2px" }}>
                {reportVessels.length === 0 ? (
                  <div style={{ padding: 28, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 12 }}>
                    No vessels — add from the left panel.
                  </div>
                ) : <>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: GRID, background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 700, padding: "5px 8px", gap: 2 }}>
                    {HEADS.map((h, i) => <div key={i} style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{h}</div>)}
                  </div>
                  {/* Rows grouped */}
                  {Object.entries(posGrouped).map(([bucket, rows]) => (
                    <div key={bucket}>
                      <div style={{ background: "#0c1e3d", color: "#dbe6f5", fontSize: 11, fontWeight: 700, padding: "4px 8px", letterSpacing: 0.3 }}>{bucket}</div>
                      {rows.map((v, localIdx) => {
                        const globalIdx = reportVessels.findIndex(r => r._rid === v._rid);
                        return (
                          <VesselRow key={v._rid || v.vessel}
                            v={v} localIdx={localIdx} globalIdx={globalIdx}
                            editing={editingRid === (v._rid || v.vessel)}
                            onEdit={() => setEditingRid(editingRid === (v._rid || v.vessel) ? null : (v._rid || v.vessel))}
                            onSave={vals => saveEdit(v._rid || v.vessel, vals)}
                            onDelete={() => deleteRow(v._rid || v.vessel)}
                            onDragStart={() => dragStart(globalIdx)}
                            onDragEnter={() => dragEnter(globalIdx)}
                            onDragEnd={dragEnd}
                            isDragOver={dragOver === globalIdx}
                          />
                        );
                      })}
                    </div>
                  ))}
                </>}
              </div>

              {/* Charts */}
              {reportVessels.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "6px 6px 12px" }}>
                  <div style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.12)", padding: "8px 10px" }}>
                    <BarLineChart data={openTimingData} barKey="count" title="Open timing" barLabel="Ships" accent={ACCENT} />
                  </div>
                  <div style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.12)", padding: "8px 10px" }}>
                    <BarLineChart data={fixHistory} barKey="ships" lineKey="avgWindow" title="Fixing window history" barLabel="Ships" lineLabel="Avg days" accent={ACCENT} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>}

        {section === "market" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {!reportType ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <div style={{ textAlign: "center", color: C.dim }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Select a report type from the left panel</div>
                </div>
              </div>
            ) : <>
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>{reportType}</span>
                  <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={IS} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveReport} style={{ ...SB, background: "rgba(63,185,80,0.12)", border: "1px solid rgba(63,185,80,0.45)", color: "#3fb950" }}>Save</button>
                  <button onClick={() => window.print()} style={{ ...SB, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.45)", color: "#6366f1" }}>Print</button>
                  <button onClick={async () => { try { await navigator.clipboard.writeText(`${reportType} · ${reportDate}\n\n${commentary}`); } catch {} }} style={{ ...SB, background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.45)", color: "#f5a623" }}>Copy</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 11 }}>
                {[[avgRate > 0 ? avgRate.toFixed(0) : "—", "Average Rate", "WS Points", "rgba(102,126,234,0.12)", "rgba(102,126,234,0.3)", ACCENT],
                  [avgTCE > 0 ? `$${avgTCE.toFixed(0)}` : "—", "Average TCE", "per day", "rgba(63,185,80,0.12)", "rgba(63,185,80,0.3)", "#3fb950"],
                  [fixtures.length + quotes.length, "Market Activity", `${fixtures.length} fix · ${quotes.length} quotes`, "rgba(245,166,35,0.12)", "rgba(245,166,35,0.3)", "#f5a623"]
                ].map(([val, label, sub, bg, bdr, col]) => (
                  <div key={label} style={{ background: `linear-gradient(135deg,${bg},${bg})`, border: `1px solid ${bdr}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: col }}>{val}</div>
                    <div style={{ fontSize: 10, color: C.faint, marginTop: 3 }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10 }}>Freight Rates</div>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                  <thead><tr>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Size</th>
                    {Object.keys(rateGrid).length > 0 && Object.keys(Object.values(rateGrid)[0] || {}).map(r => (
                      <th key={r} style={{ padding: "5px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>{r}</th>
                    ))}
                  </tr></thead>
                  <tbody>{Object.keys(rateGrid).map(size => (
                    <tr key={size}>
                      <td style={{ padding: "5px 10px", background: C.bg3, borderRadius: "4px 0 0 4px", fontSize: 11, fontWeight: 700, color: C.tx }}>{size}</td>
                      {Object.keys(rateGrid[size]).map((route, j, arr) => (
                        <td key={route} style={{ padding: "3px 5px", background: C.bg3, borderRadius: j === arr.length - 1 ? "0 4px 4px 0" : 0, textAlign: "center" }}>
                          <input type="text" value={rateGrid[size][route]} onChange={e => setRateGrid(p => ({ ...p, [size]: { ...p[size], [route]: e.target.value } }))} placeholder="WS"
                            style={{ width: "100%", background: C.bg, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, fontSize: 11, padding: "4px 7px", textAlign: "center", outline: "none" }} />
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {reportType !== "TimeCharter" && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10 }}>Indicative TCE ($/day)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {["10k", "15k", "20k"].map(seg => (
                      <div key={seg}>
                        <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>{seg}</label>
                        <input type="text" value={tceEarnings[seg] || ""} onChange={e => setTceEarnings(p => ({ ...p, [seg]: e.target.value }))} placeholder="$"
                          style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: "7px 9px", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10 }}>Market Commentary</div>
                <textarea value={commentary} onChange={e => setCommentary(e.target.value)} placeholder="Market analysis, trends, outlook..."
                  style={{ width: "100%", minHeight: 80, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: 9, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                {[["Recent Fixtures", fixtures, setFixtures, ["vessel", "charterer", "route", "qty", "rate"]],
                  ["Market Quotes", quotes, setQuotes, ["route", "size", "rate", "basis"]]].map(([label, list, setList, fields]) => (
                  <div key={label} style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{label}</div>
                      <button onClick={() => setList(p => [...p, Object.fromEntries(fields.map(f => [f, ""]))])}
                        style={{ background: ACCENT, border: "none", borderRadius: 3, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}>+ Add</button>
                    </div>
                    {list.length === 0 ? <div style={{ padding: 10, textAlign: "center", color: C.faint, fontSize: 10 }}>None added</div> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {list.map((item, i) => (
                          <div key={i} style={{ background: C.bg3, borderRadius: 4, padding: 7, border: "1px solid " + C.bd }}>
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                              <button onClick={() => setList(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: fields.length > 3 ? "1fr 1fr" : "1fr", gap: 4 }}>
                              {fields.map(f => (
                                <input key={f} type="text" value={item[f] || ""} onChange={e => setList(p => { const n = [...p]; n[i] = { ...n[i], [f]: e.target.value }; return n; })}
                                  placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                                  style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, fontSize: 10, padding: "3px 5px", outline: "none" }} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>}
          </div>
        )}

        {/* ── QUICK POSITIONS ──────────────────────────────────────────────── */}
        {section === "quick" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", background: C.bg2, borderBottom: "1px solid " + C.bd, flexWrap: "wrap", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Quick Positions</span>
              <input value={quickTitle} onChange={e => setQuickTitle(e.target.value)}
                style={{ ...IS, minWidth: 160 }} placeholder="Available tonnage" />
              <div style={{ flex: 1 }} />
              <button onClick={addQuickRow} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>+ Add row</button>
              {quickRows.length > 0 && (
                <button onClick={() => { if (window.confirm("Clear all rows?")) setQuickRows([]); }}
                  style={{ ...SB, background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Clear</button>
              )}
              <button onClick={copyQuick} style={{ ...SB, background: quickCopied ? "rgba(67,233,123,0.15)" : "rgba(245,166,35,0.12)", border: `1px solid ${quickCopied ? "rgba(67,233,123,0.5)" : "rgba(245,166,35,0.45)"}`, color: quickCopied ? "#43e97b" : "#f5a623" }}>
                {quickCopied ? "✓ Copied!" : "Copy for WhatsApp"}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Paste zone */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7 }}>
                <button onClick={() => setShowPaste(p => !p)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 6, padding: "8px 12px", background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>
                  <span style={{ fontSize: 10 }}>{showPaste ? "▲" : "▼"}</span>
                  Paste from WhatsApp / email
                </button>
                {showPaste && (
                  <div style={{ padding: "0 12px 12px" }}>
                    <textarea value={quickPaste} onChange={e => setQuickPaste(e.target.value)}
                      placeholder={"Paste positions here, e.g.:\n*MAERSK TANKERS*\nERIKA SCHULTE - GRANGEMOUTH - 6 JUL\n*FureBear*\nFURE VEN - THAMES - 6 JUL"}
                      style={{ width: "100%", minHeight: 130, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 11, padding: 9, outline: "none", resize: "vertical", fontFamily: "monospace", lineHeight: 1.6, boxSizing: "border-box" }} />
                    <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
                      <button onClick={parsePaste}
                        style={{ ...SB, background: ACCENT, color: "#fff", border: "none" }}>
                        Parse positions
                      </button>
                      <button onClick={() => setQuickPaste("")}
                        style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Row editor */}
              {quickRows.length > 0 && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.9fr 0.7fr 1.1fr 22px", background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 700, padding: "5px 10px", gap: 6 }}>
                    <div>OPERATOR</div><div>VESSEL</div><div>PORT</div><div>DATE</div><div>DIRECTION</div><div></div>
                  </div>
                  {quickRows.map((r, i) => {
                    const INP = { background: "transparent", border: "none", borderBottom: "1px solid rgba(58,130,246,0.3)", color: C.tx, fontSize: 11, outline: "none", padding: "1px 2px", width: "100%", fontFamily: "inherit", minWidth: 0 };
                    const rowBg = i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent";
                    return (
                      <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.9fr 0.7fr 1.1fr 22px", background: rowBg, padding: "5px 10px", gap: 6, borderTop: "1px solid rgba(58,130,246,0.1)", alignItems: "center" }}>
                        <input style={INP} value={r.operator} onChange={e => updateQuickRow(r.id, "operator", e.target.value)} placeholder="Operator" />
                        <input style={{ ...INP, fontWeight: 600 }} value={r.vessel} onChange={e => updateQuickRow(r.id, "vessel", e.target.value.toUpperCase())} placeholder="VESSEL" />
                        <input style={INP} value={r.port} onChange={e => updateQuickRow(r.id, "port", e.target.value.toUpperCase())} placeholder="PORT" />
                        <input style={INP} value={r.date} onChange={e => updateQuickRow(r.id, "date", e.target.value.toUpperCase())} placeholder="DATE" />
                        <input style={{ ...INP, color: C.dim }} value={r.direction} onChange={e => updateQuickRow(r.id, "direction", e.target.value)} placeholder="Any direction..." />
                        <button onClick={() => deleteQuickRow(r.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.55)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live preview */}
              {quickRows.length > 0 && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, padding: "10px 14px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Preview</div>
                  <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: C.tx, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {buildQuickText()}
                  </pre>
                </div>
              )}

              {quickRows.length === 0 && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ textAlign: "center", color: C.faint }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Paste positions above or click + Add row</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Formats WhatsApp/email positions for quick sending</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsTab;
