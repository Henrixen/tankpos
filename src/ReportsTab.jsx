import React, { useState, useEffect, useRef, useMemo } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { classifyRegion, fmtDateShort } from "./utils";
import { calcTCE, lookupDist, BENCHMARK_ROUTES, loadTCEDefaults } from "./TCECalculator";

const STEEM_LOGO = "data:image/png;base64,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";

const MARKET_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter"];
const SEG_ORDER = ["Sub 10k", "City", "Inter", "J19", "Flexi", "Handy", "MR"];
const DRAFT_KEY = "tankpos_poslist_v4";
const DRAFT_META_KEY = "tankpos_poslist_meta_v4";

// Compact column pixel widths — no wrapping, comment truncates with hover
const CW = { vessel:148, dwt:62, built:48, coating:66, open:54, port:86, comment:104, operator:122, del:28 };
const HEADS = ["VESSEL","DWT","BUILT","COATING","OPEN","PORT","COMMENT","OPERATOR",""];
// fr units instead of fixed px — always fills 100% of the row exactly,
// regardless of padding/gap math, instead of needing to hand-tune pixel
// sums every time a wrapper's padding changes.
const GRID = Object.values(CW).map(w=>w+"fr").join(" ");

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

// Segment tags that aren't numbered (e.g. "FLEXI", "J19", "MR") but are still
// genuine segments — these are the exact same values used as group headers
// in the Position List table itself. Used both for AND/OR filter logic and
// for the tag-list grouping display, so the two stay consistent.
const SEGMENT_ALIASES = new Set(["small","cityclass","city","intermediate","inter","j19","flexi","handy","mr","liftert","liftert2","sub10k"]);
function isSegmentTag(t) {
  if (/^\d+\.\s/.test(t)) return true;
  const n = String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
  return SEGMENT_ALIASES.has(n);
}

function fmtUSD(val) {
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) || !n ? "" : "USD " + Math.round(n).toLocaleString("nb-NO");
}
function fmtOpen(d) { if (!d) return ""; try { return fmtDateShort(d); } catch { return d; } }
function parseTags(v) {
  if (!v?.tag) return [];
  const r = Array.isArray(v.tag) ? v.tag : String(v.tag).split(",");
  return r.map(t => String(t).toUpperCase().trim()).filter(Boolean);
}
const MN_SORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function dateSortKey(str) {
  if (!str) return 9999;
  const m = String(str).toUpperCase().match(/(\d{1,2})\s*([A-Z]{3})/);
  if (!m) return 9999;
  const day = parseInt(m[1]), mon = MN_SORT.indexOf(m[2]);
  return mon === -1 ? 9999 : mon * 31 + day;
}

function groupVessels(list, by, sortByDate) {
  const fn = by === "region"
    ? v => v.superRegion || classifyRegion(v.openPort) || "Other"
    : v => v.segment || "Other";
  const out = {};
  list.forEach(v => { const k = fn(v); if (!out[k]) out[k] = []; out[k].push(v); });
  if (sortByDate) {
    Object.keys(out).forEach(k => out[k].sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date)));
  }
  if (by === "segment") {
    const s = {};
    SEG_ORDER.forEach(k => { if (out[k]) s[k] = out[k]; });
    Object.keys(out).forEach(k => { if (!s[k]) s[k] = out[k]; });
    return s;
  }
  return out;
}

// ─── Generic bar+line SVG chart ───────────────────────────────────────────────
function BarLineChart({ data, barKey, lineKey, barLabel, lineLabel, title, accent = "#3a82f6", loading = false }) {
  if (!data?.length) return (
    <div style={{ padding: 20, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 11 }}>
      {title} · {loading ? "loading..." : "no data in this window"}
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

// ─── Small TCE trend chart: Last month vs Spot, with a dashed YTD reference line ──
function TCETrendMini({ lastMonth, current, ytd }) {
  const lm = parseFloat(lastMonth) || null;
  const cur = parseFloat(current) || null;
  const y = parseFloat(ytd) || null;
  if (lm == null && cur == null) return (
    <div style={{ padding: 20, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 11 }}>Enter TCE figures below to see the trend</div>
  );
  const W = 300, H = 150, P = { t: 20, r: 20, b: 26, l: 34 };
  const w = W - P.l - P.r, h = H - P.t - P.b;
  const vals = [lm, cur, y].filter(v => v != null);
  const maxV = Math.max(...vals, 1) * 1.15, minV = Math.min(...vals, 0) * 0.9;
  const yFor = v => P.t + h - ((v - minV) / (maxV - minV || 1)) * h;
  const bw = w * 0.18;
  const x1 = P.l + w * 0.28, x2 = P.l + w * 0.72;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {y != null && <>
        <line x1={P.l} y1={yFor(y)} x2={W - P.r} y2={yFor(y)} stroke="#a3a3a3" strokeWidth="1.3" strokeDasharray="5,4" />
        <text x={W - P.r} y={yFor(y) - 5} fill="rgba(219,230,245,0.5)" fontSize="9" textAnchor="end">YTD avg ${y.toLocaleString("nb-NO")}/d</text>
      </>}
      {lm != null && <>
        <rect x={x1 - bw / 2} y={yFor(lm)} width={bw} height={h - (yFor(lm) - P.t)} fill="rgba(219,230,245,0.35)" rx="2" />
        <text x={x1} y={yFor(lm) - 6} fill="#dbe6f5" fontSize="10" textAnchor="middle">${lm.toLocaleString("nb-NO")}/d</text>
        <text x={x1} y={H - 8} fill="rgba(219,230,245,0.5)" fontSize="9" textAnchor="middle">Last month</text>
      </>}
      {cur != null && <>
        <rect x={x2 - bw / 2} y={yFor(cur)} width={bw} height={h - (yFor(cur) - P.t)} fill="#3a82f6" rx="2" />
        <text x={x2} y={yFor(cur) - 6} fill="#dbe6f5" fontSize="10" textAnchor="middle">${cur.toLocaleString("nb-NO")}/d</text>
        <text x={x2} y={H - 8} fill="rgba(219,230,245,0.5)" fontSize="9" textAnchor="middle">Spot</text>
      </>}
    </svg>
  );
}

// ─── Tiny inline sparkline for Handy FFA Aug/Sep/Oct trend ──
function FfaSparkline({ aug, sep, oct }) {
  const vals = [aug, sep, oct].map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (vals.length < 2) return <span style={{ fontSize: 10, color: C.faint }}>—</span>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = [aug, sep, oct].map((v, i) => {
    const n = parseFloat(v);
    const x = 4 + i * 31;
    const y = isNaN(n) ? 11 : 18 - ((n - min) / range) * 14;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="70" height="22" viewBox="0 0 70 22">
      <polyline points={pts} fill="none" stroke="#79c0ff" strokeWidth="1.6" />
      <circle cx="66" cy={pts.split(" ")[2]?.split(",")[1] || 11} r="2" fill="#79c0ff" />
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
  // Alternate: even rows slightly lighter — subtle, not the harsh navy/black split
  const rowBg = isDragOver
    ? "rgba(58,130,246,0.18)"
    : localIdx % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent";

  if (editing) return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, width: "100%", boxSizing: "border-box", background: "rgba(58,130,246,0.1)", color: "#dbe6f5", fontSize: 11, padding: "5px 8px", borderTop: "1px solid rgba(58,130,246,0.16)", alignItems: "center", gap: 2 }}>
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
      style={{ display: "grid", gridTemplateColumns: GRID, width: "100%", boxSizing: "border-box", background: rowBg, color: "#dbe6f5", fontSize: 11, padding: "4px 8px", borderTop: "1px solid rgba(58,130,246,0.1)", cursor: "pointer", alignItems: "center", gap: 2, userSelect: "none" }}
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
  const [sortByDate, setSortByDate] = useState(false);
  const [posDate, setPosDate] = useState(new Date().toISOString().split("T")[0]);
  const [exportStatus, setExportStatus] = useState("");
  const [editingRid, setEditingRid] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const dragFrom = useRef(null);
  const dragTo = useRef(null);
  const previewRef = useRef(null);
  const marketPreviewRef = useRef(null);

  // Pool filters
  const [tagFilter, setTagFilter] = useState(new Set());
  const [regionFilter, setRegionFilter] = useState(new Set());       // WCUK/ECUK/Canal/Biscay/Skaw/Baltic/Med — derived from openPort
  const [superRegionFilter, setSuperRegionFilter] = useState(new Set()); // Africa/Atlantic/Med/NWE/etc — v.superRegion
  const [segmentFilter, setSegmentFilter] = useState(new Set());     // Sub 10k/City/Inter/J19/Flexi/Handy/MR — v.segment
  const [dwtFilter, setDwtFilter] = useState(new Set());
  const [dwtRange, setDwtRange] = useState({ min: "", max: "" });
  const [builtFilter, setBuiltFilter] = useState(new Set());
  const [builtRange, setBuiltRange] = useState({ min: "", max: "" });
  const [dateFilter, setDateFilter] = useState("all");
  const [poolSearch, setPoolSearch] = useState("");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [posPasteText, setPosPasteText] = useState("");
  const [posPasteOpen, setPosPasteOpen] = useState(false);
  const [posPasting, setPosPasting] = useState(false);
  const [posPasteMsg, setPosPasteMsg] = useState("");

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

  // ── Intermediate report rebuild: drivers, benchmark rates, Handy, TCE stats ──
  const [driverBullets, setDriverBullets] = useState([""]);
  const [benchmarkRows, setBenchmarkRows] = useState(
    BENCHMARK_ROUTES.map(r => ({ ...r, freight: "", lastWeek: "", tce: null, tceLastWeek: null, override: false }))
  );
  const [tceDefaults, setTceDefaults] = useState(null); // vessel profile shared with TCECalculator
  const [tceStats, setTceStats] = useState({ current: "", lastMonth: "", ytd: "" });
  const [handy, setHandy] = useState({
    tc23: { spotWS: "", ffaAug: "", ffaSep: "", ffaOct: "" },
    tc6:  { spotWS: "", ffaAug: "", ffaSep: "", ffaOct: "" },
  });
  const [benchmarkRefreshStatus, setBenchmarkRefreshStatus] = useState(null);
  const [pendingDriverDelete, setPendingDriverDelete] = useState(null);
  const [pendingFixtureDelete, setPendingFixtureDelete] = useState(null);
  const [handyParseMsg, setHandyParseMsg] = useState("");
  const importedCargoIds = useRef(new Set());

  const importedNames = useRef(new Set(reportVessels.map(v => v.vessel)));
  // Quick positions state
  const [quickRows, setQuickRows] = useState([]);
  const [quickTitle, setQuickTitle] = useState("Available tonnage");
  const [quickPaste, setQuickPaste] = useState("");
  const [quickCopied, setQuickCopied] = useState(false);
  const [quickParseMsg, setQuickParseMsg] = useState("");
  const [vesselOpDb, setVesselOpDb] = useState({}); // vessel name → operator lookup

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

  const [fixHistoryLoading, setFixHistoryLoading] = useState(true);

  useEffect(() => {
    async function fetchFixHistory() {
      setFixHistoryLoading(true);
      try {
        const since = new Date(); since.setDate(since.getDate() - 84);
        // positions_latest is the unified view (manual + external feed) — the
        // plain "positions" table alone misses almost all feed-sourced rows.
        // Filtered to Intermediate segment, UKC/NWE region, matching this report's scope.
        const { data, error } = await supabase
          .from("positions_latest")
          .select("updated_at, open_date, segment, super_region")
          .gte("updated_at", since.toISOString())
          .ilike("segment", "%intermediate%")
          .or("super_region.ilike.%ukc%,super_region.ilike.%nwe%")
          .not("open_date", "is", null);
        if (error) { console.error("fixHistory:", error); setFixHistoryLoading(false); return; }
        if (!data?.length) { setFixHistoryLoading(false); return; }
        const weeks = {};
        data.forEach(row => {
          if (!row.updated_at) return;
          const d = new Date(row.updated_at);
          const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
          const key = ws.toISOString().slice(0, 10);
          if (!weeks[key]) weeks[key] = { ships: 0, totalDays: 0, cnt: 0 };
          weeks[key].ships++;
          if (row.open_date) {
            const days = Math.round((new Date(row.open_date) - d) / 86400000);
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
      setFixHistoryLoading(false);
    }
    fetchFixHistory();
  }, []);

  // Load the shared vessel profile (same one used in TCECalculator) so
  // benchmark-route TCE figures stay consistent across the app.
  useEffect(() => { loadTCEDefaults().then(d => setTceDefaults(d)); }, []);

  // Load saved benchmark route freight/TCE from Supabase for the Intermediate report
  useEffect(() => {
    if (reportType !== "Intermediate") return;
    (async () => {
      const { data, error } = await supabase.from("tce_routes").select("*");
      if (error || !data) return;
      setBenchmarkRows(prev => prev.map(r => {
        const saved = data.find(d => d.route_key === r.key);
        return saved ? { ...r, freight: String(saved.freight ?? ""), tce: saved.tce ?? null, override: false } : r;
      }));
    })();
  }, [reportType]);

  // Seed Recent Fixtures from Cargoes tab selections — one-way import, doesn't
  // overwrite fields the user has already amended by hand in the report.
  useEffect(() => {
    if (!selectedCargoes?.length) return;
    const toAdd = selectedCargoes
      .filter(c => !importedCargoIds.current.has(c.id))
      .map(c => ({
        vessel: c.vessel || "",
        charterer: c.charterer || "",
        cargo: c.cargo || "",
        load: c.load || c.loadPort || "",
        disch: c.disch || c.dischPort || "",
        laycanFrom: c.from || c.laycanFrom || "",
        laycanTo: c.to || c.laycanTo || "",
        freight: c.freight || "",
      }));
    if (toAdd.length) {
      selectedCargoes.forEach(c => importedCargoIds.current.add(c.id));
      setFixtures(prev => [...prev, ...toAdd]);
      setSection("market");
      setReportType(prev => prev || "Intermediate");
    }
  }, [selectedCargoes]);

  // Recalculate a benchmark row's TCE from its freight input, using the
  // shared vessel profile and the route's single-leg laden distance.
  function recalcBenchmarkTCE(row, freightVal) {
    if (!tceDefaults || !row.dist) return null;
    const f = parseFloat(String(freightVal).replace(/[^0-9.\-]/g, ""));
    if (!f) return null;
    const r = calcTCE({ freight: f, ballastNm: 0, ladenNm: row.dist, repoNm: 0, ...tceDefaults });
    return r ? r.tce : null;
  }

  function updateBenchmarkFreight(key, val) {
    setBenchmarkRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const dist = r.dist ?? lookupDist(r.from, r.to);
      const tce = recalcBenchmarkTCE({ ...r, dist }, val);
      // Marked as override — this only affects the current report and does
      // not write back to tce_routes, so refreshing pulls the saved value again.
      return { ...r, dist, freight: val, tce, override: true };
    }));
  }

  function refreshBenchmarkFromSaved() {
    setBenchmarkRefreshStatus("Refreshing…");
    (async () => {
      const { data, error } = await supabase.from("tce_routes").select("*");
      if (error) { setBenchmarkRefreshStatus("Refresh failed"); setTimeout(() => setBenchmarkRefreshStatus(null), 2500); return; }
      if (!data || !data.length) { setBenchmarkRefreshStatus("No saved routes found — save some in the TCE tab first"); setTimeout(() => setBenchmarkRefreshStatus(null), 3500); return; }
      setBenchmarkRows(prev => {
        const updated = prev.map(r => {
          const saved = data.find(d => d.route_key === r.key);
          return saved ? { ...r, freight: String(saved.freight ?? ""), tce: saved.tce ?? null, override: false } : r;
        });
        // Pick up any custom routes ("+ Add leg") saved in the TCE tab that aren't in this report's list yet
        const existingKeys = new Set(updated.map(r => r.key));
        const extras = data.filter(d => !existingKeys.has(d.route_key)).map(d => ({
          key: d.route_key, label: d.label || d.route_key, from: "", to: "", dist: d.nm_laden || null,
          freight: String(d.freight ?? ""), lastWeek: "", tce: d.tce ?? null, tceLastWeek: null, override: false,
        }));
        return [...updated, ...extras];
      });
      setBenchmarkRefreshStatus("Refreshed ✓");
      setTimeout(() => setBenchmarkRefreshStatus(null), 2000);
    })();
  }

  async function handleHandyImagePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith("image/"));
    if (!imgItem) return;
    e.preventDefault();
    setHandyParsing(true);
    setHandyParseMsg("Reading image...");
    try {
      const file = imgItem.getAsFile();
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      setHandyParseMsg("Extracting Handy WS/FFA levels...");
      const resp = await fetch("/api/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: file.type || "image/png" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${resp.status}`);
      }
      const json = await resp.json();
      const raw = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Could not parse API response — try pasting text instead"); }
      // Expected shape: { tc23: {spotWS,ffaAug,ffaSep,ffaOct}, tc6: {...} } — merge
      // whatever fields came back, leaving anything not found untouched.
      setHandy(prev => ({
        tc23: { ...prev.tc23, ...(parsed.tc23 || {}) },
        tc6:  { ...prev.tc6,  ...(parsed.tc6  || {}) },
      }));
      setHandyParseMsg("✓ Handy levels extracted from image.");
    } catch (err) {
      console.error("handyImagePaste:", err);
      setHandyParseMsg("Image parse failed: " + err.message);
    } finally {
      setHandyParsing(false);
    }
  }

  // Plain-text fallback (no AI call) — matches lines like "TC23 WS 160" or
  // "FFA Aug TC6 158" so a pasted broker note can populate Handy without a screenshot.
  function parseHandyText(text) {
    const next = { tc23: { ...handy.tc23 }, tc6: { ...handy.tc6 } };
    const lines = text.split("\n");
    lines.forEach(line => {
      const seg = /tc\s*23/i.test(line) ? "tc23" : /tc\s*6\b/i.test(line) ? "tc6" : null;
      if (!seg) return;
      const wsMatch = line.match(/ws\s*(\d+)/i);
      if (!wsMatch) return;
      const monthMatch = line.match(/\b(aug|sep|oct)\b/i);
      if (monthMatch) {
        const key = "ffa" + monthMatch[1][0].toUpperCase() + monthMatch[1].slice(1).toLowerCase();
        next[seg][key] = wsMatch[1];
      } else if (/spot/i.test(line)) {
        next[seg].spotWS = wsMatch[1];
      }
    });
    setHandy(next);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const posGrouped = useMemo(() => groupVessels(reportVessels, posGroupBy, sortByDate), [reportVessels, posGroupBy, sortByDate]);
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

  const [dbTags, setDbTags] = useState([]);

  // Load all known filter values (tags + regions + segments) from Supabase
  useEffect(() => {
    if (section !== "poslist") return;
    async function fetchTags() {
      try {
        const { data } = await supabase
          .from("positions_latest")
          .select("tag, super_region, segment");
        if (!data) return;
        const s = new Set();
        data.forEach(r => {
          if (r.tag) {
            const raw = Array.isArray(r.tag) ? r.tag : String(r.tag).split(",");
            raw.forEach(t => { const v = t.trim().toUpperCase(); if (v) s.add(v); });
          }
          if (r.super_region) s.add(String(r.super_region).toUpperCase().trim());
          if (r.segment) s.add(String(r.segment).toUpperCase().trim());
        });
        setDbTags([...s].sort());
      } catch (e) { console.error("fetchTags:", e); }
    }
    fetchTags();
  }, [section]);

  const allTags = useMemo(() => {
    const s = new Set([...dbTags]);
    allVessels.forEach(v => {
      parseTags(v).forEach(t => s.add(t));
      if (v.superRegion) s.add(v.superRegion.toUpperCase().trim());
      if (v.segment) s.add(v.segment.toUpperCase().trim());
    });
    return [...s].sort();
  }, [allVessels, dbTags]);

  const vesselPool = useMemo(() => {
    const now = new Date();
    const inRange = (val, range) => {
      const n = parseFloat(val);
      if (isNaN(n)) return false;
      if (range.min !== "" && n < parseFloat(range.min)) return false;
      if (range.max !== "" && n > parseFloat(range.max)) return false;
      return true;
    };
    const DWT_BUCKETS = { "<10": [0,10000], "10-15": [10000,15000], "15-20": [15000,20000], "20-30": [20000,30000], "30-40": [30000,40000], ">40": [40000,Infinity] };
    const BUILT_BUCKETS = { "<2005": [0,2004], "2005-10": [2005,2010], "2010-15": [2010,2015], "2015-20": [2015,2020], ">2020": [2021,9999] };

    return allVessels.filter(v => {
      if (reportedNames.has(v.vessel)) return false;
      if (poolSearch && !(
        v.vessel?.toLowerCase().includes(poolSearch.toLowerCase()) ||
        v.operator?.toLowerCase().includes(poolSearch.toLowerCase())
      )) return false;

      if (tagFilter.size > 0) {
        const vTags = parseTags(v).map(t => t.toUpperCase());
        if (![...tagFilter].some(t => vTags.includes(t.toUpperCase()))) return false;
      }
      if (segmentFilter.size > 0 && !segmentFilter.has(v.segment)) return false;
      if (superRegionFilter.size > 0 && !superRegionFilter.has(v.superRegion)) return false;
      if (regionFilter.size > 0) {
        const r = classifyRegion(v.openPort);
        if (![...regionFilter].includes(r)) return false;
      }
      if (dwtFilter.size > 0 || dwtRange.min !== "" || dwtRange.max !== "") {
        const dwt = parseFloat(v.dwt);
        const inBucket = [...dwtFilter].some(b => { const [lo,hi] = DWT_BUCKETS[b]; return dwt >= lo && dwt < hi; });
        const inCustomRange = (dwtRange.min !== "" || dwtRange.max !== "") ? inRange(v.dwt, dwtRange) : false;
        if (!inBucket && !inCustomRange) return false;
      }
      if (builtFilter.size > 0 || builtRange.min !== "" || builtRange.max !== "") {
        const built = parseFloat(v.built);
        const inBucket = [...builtFilter].some(b => { const [lo,hi] = BUILT_BUCKETS[b]; return built >= lo && built <= hi; });
        const inCustomRange = (builtRange.min !== "" || builtRange.max !== "") ? inRange(v.built, builtRange) : false;
        if (!inBucket && !inCustomRange) return false;
      }
      if (dateFilter !== "all" && v.updated_at) {
        const diff = (now - new Date(v.updated_at)) / 86400000;
        if (dateFilter === "today" && diff > 1) return false;
        if (dateFilter === "2d" && diff > 2) return false;
        if (dateFilter === "7d" && diff > 7) return false;
      }
      return true;
    });
  }, [allVessels, reportedNames, tagFilter, segmentFilter, superRegionFilter, regionFilter, dwtFilter, dwtRange, builtFilter, builtRange, poolSearch, dateFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function addFromPool(v) {
    if (reportedNames.has(v.vessel)) return;
    importedNames.current.add(v.vessel);
    setReportVessels(p => [...p, { ...v, _rid: v.vessel + "_" + Date.now() }]);
  }

  // Paste positions straight into this list — tries the two most common
  // quick patterns first, falls back to the same AI text endpoint Quick
  // Positions uses for anything messier. Vessels found in allVessels get
  // added with their real DWT/segment/etc; anything not recognized is added
  // as a lightweight manual entry so it still shows up in the list.
  async function parsePositionListPaste() {
    if (!posPasteText.trim()) { setPosPasteMsg("Paste some positions first."); return; }
    const raw = posPasteText
      .replace(/\r\n?/g, "\n")
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
    const nonEmpty = raw.split("\n").map(l => l.trim()).filter(Boolean);
    let parsedRows = [];

    // Quick pattern 1: dash-separated "VESSEL – PORT – DATE"
    nonEmpty.forEach(line => {
      const parts = line.split(/\s*[\u2013\u2014]\s*|\s+-\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) parsedRows.push({ vessel: parts[0].toUpperCase(), port: (parts[1]||"").toUpperCase(), date: parts[2]||"", direction: parts.slice(3).join(" ") });
    });
    // Quick pattern 2: space-separated "VESSEL (multi-word) PORT DAY"
    if (!parsedRows.length) {
      const LINE_RE = /^(.+?)\s+([A-Za-z]{2,})\s+(\d{1,2})$/;
      const MN2 = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const curMonth = MN2[new Date().getMonth()];
      nonEmpty.forEach(line => {
        const m = line.match(LINE_RE);
        if (m) parsedRows.push({ vessel: m[1].toUpperCase(), port: m[2].toUpperCase(), date: `${parseInt(m[3])} ${curMonth}`, direction: "" });
      });
    }

    // Fallback: AI text parsing for anything messier
    if (!parsedRows.length) {
      setPosPasting(true); setPosPasteMsg("No fixed pattern matched — trying AI parsing...");
      try {
        const resp = await fetch("/api/parse-positions-text", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw }),
        });
        if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || `Server error ${resp.status}`); }
        const json = await resp.json();
        const rawText = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(rawText);
        parsedRows = (Array.isArray(parsed) ? parsed : []).filter(r => r.vessel).map(r => ({
          vessel: (r.vessel || "").toUpperCase(), port: (r.port || "").toUpperCase(), date: r.date || "", direction: r.direction || "",
        }));
      } catch (err) {
        console.error("Position list AI parse:", err);
        setPosPasting(false); setPosPasteMsg("Parsing failed: " + err.message);
        return;
      }
      setPosPasting(false);
    }

    if (!parsedRows.length) { setPosPasteMsg("No positions detected in this text."); return; }

    let matched = 0;
    parsedRows.forEach(r => {
      const found = allVessels.find(v => v.vessel?.toUpperCase() === r.vessel);
      if (found && !reportedNames.has(found.vessel)) {
        // Use the vessel's real DWT/segment/etc data, but the freshly-parsed
        // port/date/comment — the whole point of pasting is to report a new
        // position, not silently re-add the vessel's old cached position.
        addFromPool({ ...found, openPort: r.port || found.openPort, date: r.date || found.date, comment: r.direction || found.comment });
        matched++;
      }
      else if (!found) {
        importedNames.current.add(r.vessel);
        setReportVessels(p => [...p, {
          vessel: r.vessel, openPort: r.port, date: r.date, comment: r.direction,
          operator: lookupOp ? lookupOp(r.vessel) : "", segment: "", dwt: null, superRegion: "",
          _rid: r.vessel + "_" + Date.now() + Math.random().toString(36).slice(2),
        }]);
      }
    });
    setPosPasteMsg(`✓ ${parsedRows.length} position${parsedRows.length!==1?"s":""} added (${matched} matched from your vessel database, ${parsedRows.length-matched} added manually).`);
    setPosPasteText("");
  }

  function deleteRow(rid) {
    setReportVessels(p => { const rem = p.find(x => x._rid === rid); if (rem) importedNames.current.delete(rem.vessel); return p.filter(x => x._rid !== rid); });
    if (editingRid === rid) setEditingRid(null);
  }
  function saveEdit(rid, vals) { setReportVessels(p => p.map(v => v._rid === rid ? { ...v, ...vals } : v)); setEditingRid(null); }
  function addManualVessel(bucket) {
    const rid = "manual_" + Date.now();
    const preset = bucket
      ? (posGroupBy === "region" ? { superRegion: bucket } : { segment: bucket })
      : {};
    setReportVessels(p => [...p, { vessel: "", dwt: "", built: "", coating: "", date: "", openPort: "", comment: "", operator: "", segment: "", superRegion: "", ...preset, _rid: rid }]);
    setEditingRid(rid);
  }
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

  // ── Market report export — same html-to-image pattern as Position List ──
  const [marketExportStatus, setMarketExportStatus] = useState("");
  const lightExportRef = useRef(null);
  async function captureMarketPng() {
    const lib = await loadHTI();
    return lib.toPng(lightExportRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
  }
  async function handleMarketCopyEmail() {
    setMarketExportStatus("Copying...");
    try {
      const lib = await loadHTI();
      const blob = await lib.toBlob(lightExportRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setMarketExportStatus("Copied — paste into your email body.");
    } catch (e) { setMarketExportStatus("Copy failed: " + e.message); }
    setTimeout(() => setMarketExportStatus(""), 3000);
  }
  async function handleMarketDownloadPng() {
    setMarketExportStatus("Rendering...");
    try { const url = await captureMarketPng(); const a = document.createElement("a"); a.download = `${reportType || "market"}-report-${reportDate}.png`; a.href = url; a.click(); setMarketExportStatus("Downloaded."); }
    catch (e) { setMarketExportStatus("Failed: " + e.message); }
    setTimeout(() => setMarketExportStatus(""), 3000);
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
  // Position List save/load — the Position List had a "Saved" display but no
  // actual way to create a save; saveReport()/loadReport() above only ever
  // handled Market report fields (commentary/rates/fixtures), never the
  // vessel list itself.
  const [posSaveStatus, setPosSaveStatus] = useState("");
  async function savePositionList() {
    setPosSaveStatus("Saving...");
    try {
      await supabase.from("reports").insert([{
        report_type: "Position List",
        report_date: posDate,
        pos_title: posTitle,
        pos_subtitle: posSubtitle,
        pos_vessels: reportVessels,
      }]);
      setPosSaveStatus("Saved ✓");
      loadSavedReports();
    } catch (e) { console.error("savePositionList:", e); setPosSaveStatus("Save failed"); }
    setTimeout(() => setPosSaveStatus(""), 2500);
  }
  async function loadPositionList(id) {
    try {
      const { data } = await supabase.from("reports").select("*").eq("id", id).single();
      if (!data) return;
      setPosTitle(data.pos_title || "CHEMS & SPECIALIZED POSITION LIST");
      setPosSubtitle(data.pos_subtitle || "");
      setPosDate(data.report_date || posDate);
      const vessels = data.pos_vessels || [];
      importedNames.current = new Set(vessels.map(v => v.vessel));
      setReportVessels(vessels);
      setSection("poslist");
    } catch (e) { console.error("loadPositionList:", e); }
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

  // ── Quick Positions save/load — same "reports" table, so drafts pick up
  // instantly on any device you're signed into, not just localStorage.
  const [quickSaveStatus, setQuickSaveStatus] = useState("");
  async function saveQuickPositions() {
    setQuickSaveStatus("Saving...");
    try {
      await supabase.from("reports").insert([{
        report_type: "Quick Positions",
        report_date: new Date().toISOString().split("T")[0],
        quick_title: quickTitle,
        quick_rows: quickRows,
      }]);
      setQuickSaveStatus("Saved ✓");
      loadSavedReports();
    } catch (e) { console.error("saveQuickPositions:", e); setQuickSaveStatus("Save failed"); }
    setTimeout(() => setQuickSaveStatus(""), 2500);
  }
  async function loadQuickPositions(id) {
    try {
      const { data } = await supabase.from("reports").select("*").eq("id", id).single();
      if (!data) return;
      setQuickTitle(data.quick_title || "Available tonnage");
      setQuickRows(data.quick_rows || []);
      setSection("quick");
    } catch (e) { console.error("loadQuickPositions:", e); }
  }

  const SB = { fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 5, cursor: "pointer", border: "none", fontFamily: "inherit", whiteSpace: "nowrap" };
  const IS = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 11, padding: "5px 8px", outline: "none", fontFamily: "inherit" };
  const avgRate = Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).length) || 0;
  const avgTCE = Object.values(tceEarnings).filter(v => v).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(tceEarnings).filter(v => v).length) || 0;

  // Load vessel→operator lookup when Quick tab opens
  useEffect(() => {
    if (section !== "quick" || Object.keys(vesselOpDb).length > 0) return;
    async function fetchVesselOps() {
      try {
        // Try vessels_db first, fallback to positions_latest
        const { data: dbData } = await supabase
          .from("vessels_db").select("vessel_name, operator").not("operator", "is", null);
        const { data: posData } = await supabase
          .from("positions_latest").select("vessel, operator").not("operator", "is", null);
        const lookup = {};
        (posData || []).forEach(r => { if (r.vessel && r.operator) lookup[r.vessel.toUpperCase().trim()] = r.operator; });
        (dbData || []).forEach(r => { if (r.vessel_name && r.operator) lookup[r.vessel_name.toUpperCase().trim()] = r.operator; });
        setVesselOpDb(lookup);
      } catch (e) { console.error("vesselOpDb:", e); }
    }
    fetchVesselOps();
  }, [section]);
  // ── Quick Positions helpers ───────────────────────────────────────────────
  function lookupOp(vesselName) {
    if (!vesselName || !Object.keys(vesselOpDb).length) return "";
    const key = vesselName.toUpperCase().trim();
    if (vesselOpDb[key]) return vesselOpDb[key];
    const match = Object.keys(vesselOpDb).find(k => k.startsWith(key) || key.startsWith(k));
    return match ? vesselOpDb[match] : "";
  }

  async function parsePaste() {
    if (!quickPaste.trim()) { setQuickParseMsg("Paste some positions first."); return; }
    // Normalize invisible/non-standard characters that different sources
    // (PDF exports, Numbers/Excel, WhatsApp) sometimes embed — these look
    // identical to a normal space/newline but silently break regex matching.
    const raw = quickPaste
      .replace(/\r\n?/g, "\n")                          // CRLF/CR -> LF
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")  // NBSP + various Unicode spaces -> regular space
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");        // zero-width chars/BOM -> remove
    const lines = raw.split("\n").map(l => l.trim());
    const nonEmpty = lines.filter(Boolean);

    // ── Format A: Tab-separated (TSV from Excel/email tables) ─────────────────
    const tabLines = lines.filter(l => (l.match(/\t/g) || []).length >= 2);
    if (tabLines.length >= 2) {
      const hdrIdx = lines.findIndex(l => /vessel/i.test(l) || /position/i.test(l));
      let ci = { vessel: 0, port: 5, date: 6, comment: 7 };
      if (hdrIdx >= 0) {
        const hdrs = lines[hdrIdx].toLowerCase().split("\t").map(h => h.trim());
        ci = {
          vessel:  hdrs.findIndex(h => h === "vessel"),
          port:    hdrs.findIndex(h => h === "position" || h === "port" || h === "open port"),
          date:    hdrs.findIndex(h => h === "date"),
          comment: hdrs.findIndex(h => h === "comment"),
        };
      }
      const rows = []; let curRegion = "";
      lines.forEach(line => {
        if (!line.trim()) return;
        const cols = line.split("\t").map(c => c.trim());
        if (cols.length <= 1) { curRegion = cols[0].toUpperCase(); return; }
        const vessel = (cols[ci.vessel >= 0 ? ci.vessel : 0] || "").toUpperCase();
        if (!vessel) return;
        const port = (cols[ci.port >= 0 ? ci.port : 5] || "").toUpperCase();
        const date = (cols[ci.date >= 0 ? ci.date : 6] || "").toUpperCase();
        const dir  = ci.comment >= 0 ? (cols[ci.comment] || "") : "";
        rows.push({ id:"q"+Date.now()+Math.random().toString(36).slice(2), operator: lookupOp(vessel), vessel, port, date, direction: dir || curRegion });
      });
      if (rows.length) {
        setQuickRows(p => [...p, ...rows]); setQuickPaste("");
        const m = rows.filter(r=>!r.operator).length;
        setQuickParseMsg("✓ "+rows.length+" position"+(rows.length!==1?"s":"")+" parsed from table"+(m?" — "+m+" operators not found.":"."));
        return;
      }
    }

    // ── Format B: Column-per-line (each cell on its own line, from PDF/email copy) ─
    // Detect: several of the first lines are single known column-header words
    const KNOWN_HDRS = ["vessel","dwt","cbm","built","last cargo","position","date","comment","loa","beam"];
    const firstFew = nonEmpty.slice(0, 12).map(l => l.toLowerCase().trim());
    const hdrCount = firstFew.filter(l => KNOWN_HDRS.some(h => l === h || l.startsWith(h))).length;
    if (hdrCount >= 3) {
      // Find how many header columns there are (consecutive known-header lines at start)
      let colCount = 0;
      for (const l of nonEmpty) {
        if (KNOWN_HDRS.some(h => l.toLowerCase() === h || l.toLowerCase().startsWith(h))) colCount++;
        else break;
      }
      colCount = colCount || 8;
      // Build column name → index map
      const headers = nonEmpty.slice(0, colCount).map(l => l.toLowerCase().trim());
      const ci2 = {
        vessel:  headers.findIndex(h => h === "vessel"),
        port:    headers.findIndex(h => h === "position" || h === "port"),
        date:    headers.findIndex(h => h === "date"),
        comment: headers.findIndex(h => h === "comment"),
      };
      const dataLines = nonEmpty.slice(colCount);
      const rows = []; let curRegion = "";
      for (let i = 0; i < dataLines.length; i += colCount) {
        const group = dataLines.slice(i, i + colCount);
        while (group.length < colCount) group.push("");
        // Single value + rest empty = region header
        if (group[0] && group.slice(1).every(f => !f.trim())) {
          curRegion = group[0].toUpperCase(); continue;
        }
        const vessel = (group[ci2.vessel >= 0 ? ci2.vessel : 0] || "").toUpperCase();
        if (!vessel) continue;
        const port    = (group[ci2.port    >= 0 ? ci2.port    : 5] || "").toUpperCase();
        const date    = (group[ci2.date    >= 0 ? ci2.date    : 6] || "").toUpperCase();
        const comment = ci2.comment >= 0 ? (group[ci2.comment] || "") : "";
        rows.push({ id:"q"+Date.now()+Math.random().toString(36).slice(2), operator: lookupOp(vessel), vessel, port, date, direction: comment || curRegion });
      }
      if (rows.length) {
        setQuickRows(p => [...p, ...rows]); setQuickPaste("");
        const m = rows.filter(r=>!r.operator).length;
        setQuickParseMsg("✓ "+rows.length+" position"+(rows.length!==1?"s":"")+" parsed"+(m?" — "+m+" operators not found.":"."));
        return;
      }
    }

    // ── Format C: Dash-separated (WhatsApp/email, original format) ─────────────
    const MN = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    function fmtDate(str) {
      // DD.MM. → "D MMM"
      const dot = str.match(/(\d{1,2})\.(\d{1,2})\.?/);
      if (dot) { const d=parseInt(dot[1]),m=parseInt(dot[2])-1; return `${d} ${MN[m]||dot[2]}`; }
      // DD MMM already
      const txt = str.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (txt) return `${parseInt(txt[1])} ${txt[2].toUpperCase()}`;
      return str.toUpperCase();
    }
    function extractFromText(text) {
      // Date: try DD.MM. first, then D MMM
      let date = "", port = "";
      const dotM = text.match(/(\d{1,2})\.(\d{1,2})\.?\s*(?:\d{2,4})?/);
      const txtM = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (dotM) { date = fmtDate(dotM[0]); text = text.replace(dotM[0], " ").trim(); }
      else if (txtM) { date = fmtDate(txtM[0]); text = text.replace(txtM[0], " ").trim(); }
      // Port: word after "open" keyword OR last uppercase word(s) remaining
      const openM = text.match(/\bopen\s+([A-Z]{2,})/i);
      if (openM) { port = openM[1].toUpperCase(); }
      else {
        // Take the last non-comment word (skip "CII", "rating", single letters)
        const words = text.split(/\s+/).filter(w => w.length >= 2 && !/^(CII|RATING|OPEN|THE|AND|OR|WITH|CLEAN|DIRTY|ANY|DIRECTION|ALL|OPTION|!!+)$/i.test(w));
        if (words.length) port = words[words.length-1].toUpperCase();
      }
      return { port, date };
    }

    const rows = []; let curOp = "";
    nonEmpty.forEach(line => {
      if (/^\*[^*]+\*$/.test(line) || /^_[^_]+_$/.test(line)) {
        curOp = line.replace(/[*_]/g, "").trim(); return;
      }
      const parts = line.split(/\s*[\u2013\u2014]\s*|\s+-\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const vessel = parts[0].toUpperCase();
        const rest = parts.slice(1).join(" ");
        const { port, date } = extractFromText(rest);
        const op = curOp || lookupOp(vessel);
        rows.push({ id:"q"+Date.now()+Math.random().toString(36).slice(2), operator: op, vessel, port, date, direction: "" });
      } else if (line.length > 1 && !line.startsWith("||")) {
        curOp = line.replace(/[*_]/g, "").trim();
      }
    });
    if (!rows.length) {
      // ── Format D: one field per line, grouped per vessel (e.g. gas/chem
      // position lists) — no header row, variable blank-line spacing between
      // blocks. Anchor on the DWT-range line ("17.999 / 19.844"), since it's
      // the one line pattern that reliably appears exactly once per vessel.
      const DWT_RE = /^\d[\d.,]*\s*\/\s*\d[\d.,]*$/;
      const YEAR_RE = /^(19|20)\d{2}$/;
      const ICE_RE = /^[1-3][A-C]$/i;
      const DATE_RE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

      const anchors = [];
      lines.forEach((l, i) => { if (DWT_RE.test(l)) anchors.push(i); });

      if (anchors.length) {
        const dRows = [];
        anchors.forEach((idx, ai) => {
          // Walk backward for built year, then vessel name
          let year = "", vessel = "";
          for (let j = idx - 1; j >= 0 && j >= idx - 6; j--) {
            const l = lines[j];
            if (!l.trim()) continue;
            if (!year && YEAR_RE.test(l.trim())) { year = l.trim(); continue; }
            if (year && l.trim() && !YEAR_RE.test(l.trim())) { vessel = l.trim().toUpperCase(); break; }
          }
          if (!vessel) return;

          // Walk forward (until the next anchor) for ice class, cargo types, port, date, destination
          const forwardEnd = ai + 1 < anchors.length ? anchors[ai + 1] : Math.min(lines.length, idx + 8);
          const rest = lines.slice(idx + 1, forwardEnd).map(l => l.trim()).filter(Boolean);
          let ri = 0;
          let iceClass = "", cargoTypes = "", port = "", dateStr = "", destination = "";
          if (rest[ri] && ICE_RE.test(rest[ri])) { iceClass = rest[ri]; ri++; }
          if (rest[ri]) { cargoTypes = rest[ri]; ri++; }
          if (rest[ri]) { port = rest[ri].toUpperCase(); ri++; }
          if (rest[ri]) {
            const m = rest[ri].match(DATE_RE);
            dateStr = m ? fmtDate(m[0]) : rest[ri].toUpperCase();
            ri++;
          }
          if (rest[ri]) { destination = rest[ri].replace(/\s{2,}/g, " ").toUpperCase(); ri++; }

          dRows.push({
            id: "q" + Date.now() + Math.random().toString(36).slice(2),
            operator: lookupOp(vessel), vessel, port, date: dateStr,
            direction: destination,
            comment: [year && "built " + year, iceClass, cargoTypes].filter(Boolean).join(" · "),
          });
        });
        if (dRows.length) {
          setQuickRows(p => [...p, ...dRows]); setQuickPaste("");
          const m = dRows.filter(r => !r.operator).length;
          setQuickParseMsg("✓ " + dRows.length + " position" + (dRows.length !== 1 ? "s" : "") + " parsed" + (m ? " — " + m + " operators not found." : "."));
          return;
        }
      }
    }

    if (!rows.length) {
      // ── Format E: single line per vessel, space-separated —
      // "VESSEL (multi-word) PORT DAY", no dashes, no month (day-of-month
      // only, assumed to mean the current month). A standalone short line
      // right before or after the block (e.g. "stenersen") is treated as a
      // shared operator applying to every vessel in the block.
      const LINE_RE = /^(.+?)\s+([A-Za-z]{2,})\s+(\d{1,2})$/;
      const MN2 = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const curMonth = MN2[new Date().getMonth()];
      const matchIdx = [];
      nonEmpty.forEach((line, i) => { if (LINE_RE.test(line)) matchIdx.push(i); });

      let sharedOperator = "";
      const looksLikeOperatorLine = (line) => line && line.split(/\s+/).length <= 3 && !/\d/.test(line) && !LINE_RE.test(line);
      if (matchIdx.length) {
        const before = nonEmpty[matchIdx[0] - 1];
        const after = nonEmpty[matchIdx[matchIdx.length - 1] + 1];
        if (looksLikeOperatorLine(after)) sharedOperator = after.toUpperCase();
        else if (looksLikeOperatorLine(before)) sharedOperator = before.toUpperCase();
      }

      const eRows = [];
      matchIdx.forEach(i => {
        const line = nonEmpty[i];
        const m = line.match(LINE_RE);
        const vessel = m[1].toUpperCase();
        const port = m[2].toUpperCase();
        const day = parseInt(m[3]);
        if (day < 1 || day > 31) return;
        eRows.push({
          id: "q" + Date.now() + Math.random().toString(36).slice(2),
          operator: sharedOperator || lookupOp(vessel), vessel, port, date: `${day} ${curMonth}`, direction: "",
        });
      });
      if (eRows.length) {
        setQuickRows(p => [...p, ...eRows]); setQuickPaste("");
        const m = eRows.filter(r => !r.operator).length;
        setQuickParseMsg("✓ " + eRows.length + " position" + (eRows.length !== 1 ? "s" : "") + " parsed" + (sharedOperator ? " — operator \"" + sharedOperator + "\" applied to all" : "") + " — date assumed current month (" + curMonth + "), check before sending" + (m ? "; " + m + " operators not found." : "."));
        return;
      }
    }

    if (!rows.length) {
      // ── Format F: AI fallback — none of the deterministic formats above
      // confidently matched. Send the raw text to Claude, which handles
      // headers, region markers, optional/missing fields, and arbitrary
      // layouts without needing a bespoke parser for every new source.
      setQuickImgParsing(true);
      setQuickParseMsg("No fixed pattern matched — trying AI parsing...");
      try {
        const resp = await fetch("/api/parse-positions-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: raw }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${resp.status}`);
        }
        const json = await resp.json();
        const rawText = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
        let parsed;
        try { parsed = JSON.parse(rawText); } catch { throw new Error("Could not parse AI response"); }
        const aiRows = (Array.isArray(parsed) ? parsed : []).filter(r => r.vessel).map(r => ({
          id: "q" + Date.now() + Math.random().toString(36).slice(2),
          operator: r.operator || lookupOp(r.vessel), vessel: (r.vessel || "").toUpperCase(),
          port: (r.port || "").toUpperCase(), date: r.date || "", direction: r.direction || "",
        }));
        setQuickImgParsing(false);
        if (aiRows.length) {
          setQuickRows(p => [...p, ...aiRows]); setQuickPaste("");
          const m = aiRows.filter(r => !r.operator).length;
          setQuickParseMsg("✓ " + aiRows.length + " position" + (aiRows.length !== 1 ? "s" : "") + " parsed by AI — check dates/fields before sending" + (m ? "; " + m + " operators not found." : "."));
        } else {
          setQuickParseMsg("AI couldn't find any positions in this text either. Try a screenshot instead, or check the format.");
        }
      } catch (err) {
        console.error("AI positions parse:", err);
        setQuickImgParsing(false);
        setQuickParseMsg("AI parsing failed: " + err.message);
      }
      return;
    }
    rows.forEach(r => { if (!r.operator) r.operator = lookupOp(r.vessel); });
    setQuickRows(p => [...p, ...rows]); setQuickPaste("");
    const missing = rows.filter(r => !r.operator).length;
    setQuickParseMsg("\u2713 "+rows.length+" position"+(rows.length!==1?"s":"")+" added"+(missing?" \u2014 "+missing+" operator(s) not found, fill in manually.":"."));
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
    const lines = ["|| " + quickTitle + " ||", ""];
    opOrder.forEach(op => {
      lines.push("*" + op + "*");
      // Only vessel – port – date, NO comments or direction
      byOp[op].forEach(r => lines.push([r.vessel, r.port, r.date].filter(Boolean).join(" \u2013 ")));
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function buildQuickTextByDate() {
    if (!quickRows.length) return "";
    const MN = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
    function sortKey(dateStr) {
      if (!dateStr) return 99999;
      const m1 = dateStr.match(/(\d{1,2})\s+([A-Z]{3})/i);
      if (m1) return (MN[m1[2].toUpperCase()]||0)*100 + parseInt(m1[1]);
      const m2 = dateStr.match(/(\d{1,2})\.(\d{1,2})/);
      if (m2) return parseInt(m2[2])*100 + parseInt(m2[1]);
      return 99999;
    }
    const sorted = [...quickRows].sort((a,b) => sortKey(a.date) - sortKey(b.date));
    const lines = ["|| " + quickTitle + " ||", ""];
    sorted.forEach(r => lines.push([r.date, r.vessel, r.port].filter(Boolean).join(" \u2013 ")));
    return lines.join("\n").trim();
  }

  const [quickCopiedDate, setQuickCopiedDate] = useState(false);
  async function copyQuickByDate() {
    const text = buildQuickTextByDate(); if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const ta=document.createElement("textarea"); ta.value=text; ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;background:transparent;"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    setQuickCopiedDate(true); setTimeout(()=>setQuickCopiedDate(false), 2500);
  }

  const [quickImgParsing, setQuickImgParsing] = useState(false);

  async function handleImagePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith("image/"));
    if (!imgItem) return; // no image — let default text paste through
    e.preventDefault();
    setQuickImgParsing(true);
    setQuickParseMsg("Reading image...");
    try {
      const file = imgItem.getAsFile();
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      setQuickParseMsg("Extracting positions from image...");
      const resp = await fetch("/api/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: file.type || "image/png" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${resp.status}`);
      }
      const json = await resp.json();
      const raw = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Could not parse API response — try text paste instead"); }
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("No positions found in image");
      const rows = parsed.map(r => ({
        id: "q" + Date.now() + Math.random().toString(36).slice(2),
        operator: r.operator || lookupOp((r.vessel || "").toUpperCase()) || "",
        vessel: (r.vessel || "").toUpperCase(),
        port: (r.port || "").toUpperCase(),
        date: (r.date || "").toUpperCase(),
        direction: r.direction || ""
      }));
      setQuickRows(p => [...p, ...rows]);
      const missing = rows.filter(r => !r.operator).length;
      setQuickParseMsg(`✓ ${rows.length} position${rows.length !== 1 ? "s" : ""} extracted from image${missing ? ` — ${missing} operator(s) not matched, fill manually` : "."}`);
    } catch (err) {
      console.error("imagePaste:", err);
      setQuickParseMsg("Image parse failed: " + err.message);
    } finally {
      setQuickImgParsing(false);
    }
  }

  async function copyQuick() {
    const text = buildQuickText(); if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const ta=document.createElement("textarea"); ta.value=text; ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;background:transparent;"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    setQuickCopied(true); setTimeout(()=>setQuickCopied(false), 2500);
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: C.bg, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`@media print{body>*{visibility:hidden;}.pos-print,.pos-print *{visibility:visible;}.pos-print{position:absolute;left:0;top:0;width:100%;}.pos-print-wrap{height:auto!important;overflow:visible!important;}.no-export{display:none!important;}}.pool-row:hover{background:rgba(58,130,246,0.14)!important;}`}</style>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div style={{ width: 170, minWidth: 170, display: "flex", flexDirection: "column", background: C.bg2, borderRight: "1px solid " + C.bd, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
          {[["poslist", "Positions"], ["market", "Market"]].map(([k, l]) => (
            <button key={k} onClick={() => setSection(k === "poslist" && section === "quick" ? "quick" : k)}
              style={{ flex: 1, padding: "10px 4px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                borderBottom: (section === k || (k === "poslist" && section === "quick")) ? `2px solid ${ACCENT}` : "2px solid transparent",
                background: "transparent", color: (section === k || (k === "poslist" && section === "quick")) ? ACCENT : C.dim, fontFamily: "inherit" }}>
              {l}
            </button>
          ))}
        </div>
        {(section === "poslist" || section === "quick") && (
          <div style={{ padding: "8px 10px", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            {[["poslist", "Position List"], ["quick", "Quick"]].map(([k, l]) => (
              <button key={k} onClick={() => setSection(k)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: section === k ? 700 : 400,
                  border: `1px solid ${section === k ? ACCENT : C.bd}`, background: section === k ? "rgba(58,130,246,0.1)" : "transparent", color: section === k ? ACCENT : C.dim, fontFamily: "inherit" }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {section === "poslist" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{reportVessels.length} vessel{reportVessels.length !== 1 ? "s" : ""} in report</div>
            <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>Draft auto-saved · persists across tabs</div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Saved list — Save/Clear buttons now live in the top toolbar */}
          {savedReports.filter(r => r.report_type === "Position List").length > 0 && (
            <div style={{ flexShrink: 0, borderTop: "1px solid " + C.bd, padding: "8px 10px", maxHeight: 160, overflowY: "auto" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saved</div>
              {savedReports.filter(r => r.report_type === "Position List").map(r => (
                <div key={r.id} onClick={() => loadPositionList(r.id)} style={{ padding: "4px 7px", borderRadius: 3, background: C.bg3, cursor: "pointer", marginBottom: 3 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.pos_title || "Position List"}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{(r.pos_vessels || []).length} vessels · {new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                </div>
              ))}
            </div>
          )}
          </div>
        )}

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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 10px", gap: 8, overflow: "hidden" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Quick daily positions</div>
            <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
              Build a position list before Supabase data arrives. Paste WhatsApp or email positions, edit, then copy.
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>How it works</div>
            {[["1","Paste raw positions from WhatsApp or email"],
              ["2","Hit Parse — operators auto-matched from your vessel database"],
              ["3","Fix any missing fields in the editable table"],
              ["4","Copy for WhatsApp — paste straight into chat or email"]
            ].map(([n,t]) => (
              <div key={n} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <div style={{ width: 16, height: 16, minWidth: 16, borderRadius: "50%", background: ACCENT, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{n}</div>
                <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.5 }}>{t}</div>
              </div>
            ))}
            {savedReports.filter(r => r.report_type === "Quick Positions").length > 0 && (
              <div style={{ borderTop: "1px solid " + C.bd, paddingTop: 8, maxHeight: 160, overflowY: "auto" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saved</div>
                {savedReports.filter(r => r.report_type === "Quick Positions").map(r => (
                  <div key={r.id} onClick={() => loadQuickPositions(r.id)}
                    style={{ padding: "5px 7px", borderRadius: 3, background: C.bg3, cursor: "pointer", marginBottom: 3 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.quick_title || "Available tonnage"}</div>
                    <div style={{ fontSize: 9, color: C.dim }}>{(r.quick_rows || []).length} rows · {new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ paddingTop: 8, borderTop: "1px solid " + C.bd }}>
              <div style={{ fontSize: 9, color: C.faint, marginBottom: 4 }}>Output format:</div>
              <pre style={{ margin: 0, fontSize: 9, color: C.dim, fontFamily: "monospace", lineHeight: 1.7, background: C.bg3, padding: "6px 8px", borderRadius: 4 }}>{`|| Available tonnage ||
*Operator*
VESSEL – PORT – DATE
Any direction`}</pre>
            </div>
          </div>
        )}
      </div>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

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
              <button onClick={() => setSortByDate(s => !s)}
                style={{ ...SB, border: `1px solid ${sortByDate ? ACCENT : C.bd}`, background: sortByDate ? ACCENT : "transparent", color: sortByDate ? "#fff" : C.dim }}>
                {sortByDate ? "✓ " : ""}Sort by date ↑
              </button>
              <button onClick={addManualVessel} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: ACCENT }}>+ Add manual row</button>
            </div>
            <div style={{ flex: 1 }} />
            {posSaveStatus && <span style={{ fontSize: 10, color: posSaveStatus === "Saved ✓" ? "#43e97b" : C.dim }}>{posSaveStatus}</span>}
            {exportStatus && <span style={{ fontSize: 10, color: C.dim, maxWidth: 220 }}>{exportStatus}</span>}
            {reportVessels.length > 0 && (
              <button onClick={() => { if (window.confirm(`Remove all ${reportVessels.length} vessels from this position list?`)) clearAll(); }}
                style={{ ...SB, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.45)", color: "#ef4444" }}>Clear all</button>
            )}
            <button onClick={savePositionList} style={{ ...SB, background: "rgba(63,185,80,0.1)", border: "1px solid rgba(63,185,80,0.45)", color: "#3fb950" }}>Save</button>
            <button onClick={handleCopyEmail} style={{ ...SB, background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.45)", color: "#f5a623" }}>Copy for Email</button>
            <button onClick={handleDownloadPng} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Download PNG</button>
            <button onClick={() => window.print()} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Print / PDF</button>
          </div>
          {/* Editable title strip */}
          <div style={{ display: "flex", gap: 8, padding: "5px 12px", background: C.bg3, borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            <input value={posTitle} onChange={e => setPosTitle(e.target.value)} style={{ ...IS, flex: 2 }} placeholder="Report title" />
            <input value={posSubtitle} onChange={e => setPosSubtitle(e.target.value)} style={{ ...IS, flex: 3 }} placeholder="Subtitle" />
          </div>

          {/* Report preview (left) + Add Vessels panel (right) */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

          {/* Scrollable report area */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto", padding: 12 }}>
            {/* Captured node — entire report */}
            <div ref={previewRef} className="pos-print" style={{ background: "#070f1c", fontFamily: "Inter,system-ui,sans-serif", width: 750, border: "1px solid rgba(88,166,255,0.2)", borderRadius: 8, overflow: "hidden" }}>
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
              <div style={{ padding: "8px 0 4px" }}>
                {reportVessels.length === 0 ? (
                  <div style={{ padding: 28, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 12 }}>
                    No vessels — add from the left panel.
                  </div>
                ) : <>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: GRID, width: "100%", boxSizing: "border-box", background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 700, padding: "5px 8px", gap: 2 }}>
                    {HEADS.map((h, i) => <div key={i} style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{h}</div>)}
                  </div>
                  {/* Rows grouped */}
                  {Object.entries(posGrouped).map(([bucket, rows]) => (
                    <div key={bucket}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(88,166,255,0.14)", borderTop: "1px solid rgba(88,166,255,0.25)", borderBottom: "1px solid rgba(88,166,255,0.25)" }}>
                        <span style={{ color: "#9fc4f0", fontSize: 11, fontWeight: 700, padding: "5px 8px", letterSpacing: 0.5, textTransform: "uppercase" }}>{bucket}</span>
                        <button onClick={() => addManualVessel(bucket)} className="no-export" title={`Add a vessel to ${bucket}`}
                          style={{ background: "none", border: "none", color: "#9fc4f0", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: "0 8px", lineHeight: 1 }}>+</button>
                      </div>
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
                    <BarLineChart data={fixHistory} barKey="ships" lineKey="avgWindow" title="Fixing window history" barLabel="Ships" lineLabel="Avg days" accent={ACCENT} loading={fixHistoryLoading} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Vessel pool table — fills the space between the report preview and the controls sidebar ── */}
          <div style={{ flex: "0 1 480px", maxWidth: 480, minWidth: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid " + C.bd, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.bd, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {vesselPool.length} vessel{vesselPool.length !== 1 ? "s" : ""} match{vesselPool.length === 1 ? "es" : ""}
              </span>
              {vesselPool.length > 0 && (
                <button onClick={() => { vesselPool.forEach(v => addFromPool(v)); }}
                  style={{ fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 4, cursor: "pointer", border: `1px solid ${ACCENT}`, background: `${ACCENT}22`, color: ACCENT, fontFamily: "inherit" }}>
                  Import all ({vesselPool.length})
                </button>
              )}
            </div>
            <div key={poolSearch + "|" + [...tagFilter].sort().join(",") + "|" + dateFilter} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {vesselPool.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: C.faint, fontSize: 11 }}>
                  {allVessels.length === 0 ? "Select vessels on Positions tab" : "No vessels match your search/tags"}
                </div>
              ) : (
                <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 10 }}>
                  <colgroup>
                    <col style={{ width: "32%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /><col style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: "4%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: C.bg2 }}>
                      {["Vessel", "DWT", "Open date", "Open port", "Updated", ""].map(h => (
                        <th key={h} style={{ padding: "5px 6px", textAlign: "left", fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase", borderBottom: "1px solid " + C.bd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vesselPool.map((v, i) => (
                      <tr key={(v.imo_no || v.vessel) + "_" + i} onClick={() => addFromPool(v)} className="pool-row"
                        style={{ cursor: "pointer", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                        <td style={{ padding: "5px 6px", fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.vessel}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.dwt ? fmtDwt(v.dwt) : ""}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.date || ""}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.openPort || ""}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.updated_at ? new Date(v.updated_at).toLocaleDateString("en-GB") : ""}</td>
                        <td style={{ padding: "5px 6px" }}><span style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>+</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Controls — paste, then the same category structure as the Positions tab filter panel ── */}
          <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid " + C.bd, display: "flex", flexDirection: "column", overflowY: "auto", padding: "10px 12px", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add vessels</div>

            <button onClick={() => setPosPasteOpen(o => !o)}
              style={{ fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 4, cursor: "pointer", border: "1px solid " + C.bd, background: "transparent", color: ACCENT, fontFamily: "inherit", textAlign: "left" }}>
              {posPasteOpen ? "▾" : "▸"} Paste positions
            </button>
            {posPasteOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <textarea value={posPasteText} onChange={e => setPosPasteText(e.target.value)}
                  placeholder="Paste positions — any format, e.g. VESSEL – PORT – DATE"
                  style={{ ...IS, width: "100%", minHeight: 60, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
                <button onClick={parsePositionListPaste} disabled={posPasting}
                  style={{ fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 4, cursor: posPasting ? "default" : "pointer", border: "none", background: ACCENT, color: "#fff", fontFamily: "inherit", opacity: posPasting ? 0.6 : 1 }}>
                  {posPasting ? "Parsing..." : "Parse & add"}
                </button>
                {posPasteMsg && <div style={{ fontSize: 9, color: posPasteMsg.startsWith("✓") ? "#43e97b" : "#f5a623" }}>{posPasteMsg}</div>}
              </div>
            )}

            <input value={poolSearch} onChange={e => setPoolSearch(e.target.value)} placeholder="Search vessel or operator..."
              style={{ ...IS, width: "100%", boxSizing: "border-box" }} />

            <div style={{ borderTop: "1px solid " + C.bd, margin: "2px 0" }} />

            {/* Same category structure/colors as the Positions tab filter panel — stacked vertically here since this sidebar is narrower than that full-width grid */}
            {(() => {
              const RCOL = ({ label, col, children }) => (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: "0.1em", paddingBottom: 3, borderBottom: "1px solid " + C.bd, marginBottom: 4 }}>{label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{children}</div>
                </div>
              );
              const RB = ({ active, onClick, children }) => (
                <button onClick={onClick} style={{ fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  border: "1px solid " + (active ? C.blue : "rgba(120,160,220,0.35)"), background: active ? "rgba(88,166,255,.22)" : C.bg3, color: active ? "#d9ecff" : "#9fc3f5" }}>
                  {children}
                </button>
              );
              const toggleIn = (setter) => (val) => setter(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });

              const usedTags = [...new Set(allVessels.map(v => (v.tag || "").trim()).filter(Boolean))].sort();
              const usedSegments = [...new Set(allVessels.map(v => v.segment).filter(Boolean))]
                .sort((a, b) => ["Sub 10k","City","Inter","J19","Flexi","Handy","MR"].indexOf(a) - ["Sub 10k","City","Inter","J19","Flexi","Handy","MR"].indexOf(b));
              const usedSuperRegions = [...new Set(allVessels.map(v => v.superRegion).filter(Boolean))].sort();

              return (
                <>
                  {usedTags.length > 0 && (
                    <RCOL label="Tags" col="#79c0ff">
                      {usedTags.map(t => (<RB key={t} active={tagFilter.has(t)} onClick={() => toggleIn(setTagFilter)(t)}>{t.toUpperCase()}</RB>))}
                      {tagFilter.size > 0 && <RB active={false} onClick={() => setTagFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  <RCOL label="Updated" col={C.blue}>
                    {[["all","All"],["today","Today"],["2d","2d"],["7d","7d"]].map(([v,l]) => (
                      <RB key={v} active={dateFilter===v} onClick={() => setDateFilter(v)}>{l}</RB>
                    ))}
                  </RCOL>
                  <RCOL label="Region" col="#7dd3fc">
                    {["WCUK","ECUK","Canal","Biscay","Skaw","Baltic","Med"].map(r => (
                      <RB key={r} active={regionFilter.has(r)} onClick={() => toggleIn(setRegionFilter)(r)}>{r}</RB>
                    ))}
                    {regionFilter.size > 0 && <RB active={false} onClick={() => setRegionFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                  </RCOL>
                  {usedSuperRegions.length > 0 && (
                    <RCOL label="S.Region" col={C.purple || "#c792ea"}>
                      {usedSuperRegions.map(r => (<RB key={r} active={superRegionFilter.has(r)} onClick={() => toggleIn(setSuperRegionFilter)(r)}>{r}</RB>))}
                      {superRegionFilter.size > 0 && <RB active={false} onClick={() => setSuperRegionFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  {usedSegments.length > 0 && (
                    <RCOL label="Segment" col={C.green}>
                      {usedSegments.map(s => (<RB key={s} active={segmentFilter.has(s)} onClick={() => toggleIn(setSegmentFilter)(s)}>{s}</RB>))}
                      {segmentFilter.size > 0 && <RB active={false} onClick={() => setSegmentFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  <RCOL label="DWT" col="#f59e0b">
                    {[["<10","<10k"],["10-15","10-15k"],["15-20","15-20k"],["20-30","20-30k"],["30-40","30-40k"],[">40",">40k"]].map(([v,l]) => (
                      <RB key={v} active={dwtFilter.has(v)} onClick={() => toggleIn(setDwtFilter)(v)}>{l}</RB>
                    ))}
                    {(dwtFilter.size > 0) && <RB active={false} onClick={() => { setDwtFilter(new Set()); setDwtRange({min:"",max:""}); }}><span style={{ color: C.red }}>✕</span></RB>}
                  </RCOL>
                  <RCOL label="Built" col="#94a3b8">
                    {[["<2005","<2005"],["2005-10","2005-10"],["2010-15","2010-15"],["2015-20","2015-20"],[">2020",">2020"]].map(([v,l]) => (
                      <RB key={v} active={builtFilter.has(v)} onClick={() => toggleIn(setBuiltFilter)(v)}>{l}</RB>
                    ))}
                    {(builtFilter.size > 0) && <RB active={false} onClick={() => { setBuiltFilter(new Set()); setBuiltRange({min:"",max:""}); }}><span style={{ color: C.red }}>✕</span></RB>}
                  </RCOL>
                </>
              );
            })()}
          </div>

          </div>
        </>}

        {section === "market" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {!reportType ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <div style={{ textAlign: "center", color: C.dim }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Select a report type from the left panel</div>
                </div>
              </div>
            ) : reportType === "Intermediate" ? <>
              <style>{`.driver-list{margin:0;padding-left:16px;font-size:12px;line-height:1.7;color:${C.tx}}.driver-list:has(li:nth-child(5)){column-count:2;column-gap:24px}
                .rpt-edit{background:transparent;border:none;border-bottom:1px dashed transparent;color:inherit;font-family:inherit;font-size:inherit;outline:none;padding:2px 3px;border-radius:2px;transition:border-color .15s,background .15s;box-sizing:border-box}
                .rpt-edit:hover{border-bottom-color:rgba(74,144,226,0.4)}
                .rpt-edit:focus{border-bottom-color:#4a90e2;background:rgba(74,144,226,0.08)}
              `}</style>

              {/* ── Toolbar (not captured in export/print) ── */}
              <div className="no-export" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                {marketExportStatus && <span style={{ fontSize: 11, color: C.dim }}>{marketExportStatus}</span>}
                <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={IS} />
                <button onClick={saveReport} style={{ ...SB, background: "rgba(63,185,80,0.15)", border: "1px solid rgba(63,185,80,0.45)", color: "#3fb950" }}>Save</button>
                <button onClick={() => window.print()} style={{ ...SB, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.45)", color: "#a5b4fc" }}>Print</button>
                <button onClick={handleMarketCopyEmail} style={{ ...SB, background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.45)", color: "#f5a623" }}>Copy for email</button>
                <button onClick={handleMarketDownloadPng} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Download PNG</button>
              </div>

              {/* ── Printable/exportable report content ── */}
              <div ref={marketPreviewRef} style={{ display: "flex", flexDirection: "column", gap: 12, background: "#0b1f3f", padding: 10, borderRadius: 8 }}>

              {/* ── Header ── */}
              <div style={{ background: "#0b1f3f", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: "#4a90e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#0b1f3f" }}>S1</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Steem1960 Shipbrokers</div>
                    <div style={{ fontSize: 11, color: "#9fc4f0" }}>Intermediate summary</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#9fc4f0" }}>{new Date(reportDate).toLocaleDateString("en-GB")}</div>
              </div>

              {/* ── Market drivers / What to watch ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, textTransform: "uppercase", letterSpacing: "0.05em" }}>Market drivers / What to watch</div>
                  <span className="no-export" style={{ fontSize: 10, color: C.faint }}>Press Enter to add a line</span>
                </div>
                <ul className="driver-list">
                  {driverBullets.map((b, i) => (
                    <li key={i} style={{ marginBottom: 4, display: "flex", alignItems: "flex-start", gap: 6, listStyle: "none", marginLeft: -16 }}>
                      <span style={{ marginTop: 2 }}>•</span>
                      <input value={b} onChange={e => setDriverBullets(p => { const n = [...p]; n[i] = e.target.value; return n; })}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setDriverBullets(p => { const n = [...p]; n.splice(i + 1, 0, ""); return n; });
                            setTimeout(() => {
                              const els = document.querySelectorAll(".driver-list input");
                              els[i + 1]?.focus();
                            }, 0);
                          } else if (e.key === "Backspace" && b === "" && driverBullets.length > 1) {
                            e.preventDefault();
                            setDriverBullets(p => p.filter((_, j) => j !== i));
                          }
                        }}
                        placeholder="e.g. general weather delays" className="rpt-edit"
                        style={{ flex: 1, fontSize: 12 }} />
                      {pendingDriverDelete === i ? (
                        <span className="no-export" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => { setDriverBullets(p => p.filter((_, j) => j !== i)); setPendingDriverDelete(null); }}
                            style={{ background: C.red, border: "none", borderRadius: 3, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", cursor: "pointer" }}>Delete</button>
                          <button onClick={() => setPendingDriverDelete(null)} style={{ background: "none", border: "1px solid " + C.bd, borderRadius: 3, color: C.dim, fontSize: 9, padding: "2px 7px", cursor: "pointer" }}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setPendingDriverDelete(i)} className="no-export" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11 }}>✕</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Benchmark rates ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 13px", background: "rgba(74,144,226,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#79c0ff", textTransform: "uppercase", letterSpacing: "0.05em" }}>Benchmark rates</div>
                  <div className="no-export" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {benchmarkRefreshStatus && <span style={{ fontSize: 10, color: C.dim }}>{benchmarkRefreshStatus}</span>}
                    <button onClick={refreshBenchmarkFromSaved} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim, fontSize: 10 }}>↻ Refresh from saved</button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Intermediate routes</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Spot</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Last week</th>
                    </tr></thead>
                    <tbody>
                      {benchmarkRows.map((r, i) => (
                        <tr key={r.key} style={{ borderTop: "1px solid " + C.bd, background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 700, color: C.tx }}>{r.label}</td>
                          <td style={{ padding: "6px 10px" }}>
                            {/* Imported from the TCE tab only — not editable here; use "Refresh from saved" to pull the latest value */}
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{r.freight ? fmtUSD(r.freight) : "—"}</span>
                            {r.tce != null && <span style={{ fontSize: 10, color: C.faint, marginLeft: 6 }}>(USD {Math.round(r.tce / 1000)}k pd)</span>}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input value={r.lastWeek} onChange={e => setBenchmarkRows(p => p.map(x => x.key === r.key ? { ...x, lastWeek: e.target.value, tceLastWeek: recalcBenchmarkTCE({ ...x, dist: x.dist ?? lookupDist(x.from, x.to) }, e.target.value) } : x))}
                                onFocus={e => { e.target.value = String(r.lastWeek).replace(/[^0-9.\-]/g, ""); }}
                                onBlur={e => { const n = parseFloat(e.target.value.replace(/[^0-9.\-]/g, "")); if (!isNaN(n)) e.target.value = n.toLocaleString("nb-NO"); }}
                                placeholder="USD" className="rpt-edit"
                                style={{ width: 90, fontSize: 12, color: C.faint }} />
                              <span style={{ fontSize: 10, color: C.faint }}>{r.tceLastWeek != null ? `(USD ${Math.round(r.tceLastWeek / 1000)}k pd)` : ""}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── TCE earnings ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>TCE earnings</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[["current", "Current"], ["lastMonth", "Last month avg"], ["ytd", "YTD avg"]].map(([k, label]) => (
                    <div key={k}>
                      <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>{label}</label>
                      <input value={tceStats[k]} onChange={e => setTceStats(p => ({ ...p, [k]: e.target.value }))} placeholder="e.g. 31000" className="rpt-edit"
                        style={{ width: "100%", fontSize: 18, fontWeight: 700 }} />
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 3 }}>{tceStats[k] ? `USD ${Math.round(parseFloat(tceStats[k]) / 1000)}k pd` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Handy ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 13px", background: "rgba(74,144,226,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#79c0ff", textTransform: "uppercase", letterSpacing: "0.05em" }}>Handy</div>
                  <div className="no-export" style={{ fontSize: 10, color: C.faint }}>Paste a screenshot or text with WS/FFA levels below</div>
                </div>
                <div className="no-export" style={{ padding: "8px 13px" }}>
                  <textarea
                    onPaste={handleHandyImagePaste}
                    onChange={e => { if (e.target.value.trim()) { parseHandyText(e.target.value); e.target.value = ""; } }}
                    placeholder="Paste screenshot (Ctrl+V) or type e.g. 'TC23 spot WS 160, FFA Aug WS 163' then click away…"
                    style={{ width: "100%", minHeight: 44, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: 7, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                  {handyParseMsg && <div style={{ fontSize: 10, color: handyParsing ? C.dim : "#3fb950", marginTop: 4 }}>{handyParseMsg}</div>}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Segment</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Spot WS</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>FFA trend (Aug–Oct)</th>
                    </tr></thead>
                    <tbody>
                      {["tc23", "tc6"].map((seg, i) => (
                        <tr key={seg} style={{ borderTop: "1px solid " + C.bd, background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 700, color: C.tx }}>{seg === "tc23" ? "TC23" : "TC6"}</td>
                          <td style={{ padding: "6px 10px" }}>
                            <input value={handy[seg].spotWS} onChange={e => setHandy(p => ({ ...p, [seg]: { ...p[seg], spotWS: e.target.value } }))} placeholder="WS" className="rpt-edit"
                              style={{ width: 55, fontSize: 12, fontWeight: 600 }} />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <FfaSparkline aug={handy[seg].ffaAug} sep={handy[seg].ffaSep} oct={handy[seg].ffaOct} />
                              <div style={{ display: "flex", gap: 4 }}>
                                {["ffaAug", "ffaSep", "ffaOct"].map(f => (
                                  <input key={f} value={handy[seg][f]} onChange={e => setHandy(p => ({ ...p, [seg]: { ...p[seg], [f]: e.target.value } }))}
                                    placeholder={f.slice(3)} className="rpt-edit"
                                    style={{ width: 40, fontSize: 10, color: C.faint }} />
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Recent fixtures — seeded from Cargoes tab selections, amendable here ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, textTransform: "uppercase", letterSpacing: "0.05em" }}>Recent fixtures</div>
                  <button onClick={() => setFixtures(p => [...p, { vessel: "", charterer: "", cargo: "", load: "", disch: "", laycanFrom: "", laycanTo: "", freight: "" }])} className="no-export"
                    style={{ background: ACCENT, border: "none", borderRadius: 3, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}>+ Add</button>
                </div>
                {fixtures.length === 0 ? <div style={{ padding: 10, textAlign: "center", color: C.faint, fontSize: 10 }}>None yet — select cargoes in the Cargoes tab to import, or add manually</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 640 }}>
                      <thead><tr>
                        {["Vessel", "Charterer", "Cargo", "Load", "Disch", "From", "To", "Freight", ""].map(h => (
                          <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {fixtures.map((f, i) => (
                          <tr key={i} style={{ borderTop: "1px solid " + C.bd }}>
                            {["vessel", "charterer", "cargo", "load", "disch", "laycanFrom", "laycanTo", "freight"].map(field => (
                              <td key={field} style={{ padding: "3px 5px" }}>
                                {field === "freight" ? (
                                  <input value={f.freight || ""} onChange={e => setFixtures(p => { const n = [...p]; n[i] = { ...n[i], freight: e.target.value }; return n; })}
                                    onFocus={e => { e.target.value = String(f.freight || "").replace(/[^0-9.\-]/g, ""); }}
                                    onBlur={e => { const num = parseFloat(e.target.value.replace(/[^0-9.\-]/g, "")); if (!isNaN(num)) e.target.value = num.toLocaleString("nb-NO"); }}
                                    className="rpt-edit" style={{ width: 90, fontSize: 11 }} placeholder="USD" />
                                ) : (
                                  <input value={f[field] || ""} onChange={e => setFixtures(p => { const n = [...p]; n[i] = { ...n[i], [field]: e.target.value }; return n; })}
                                    className="rpt-edit" style={{ width: field === "vessel" ? 100 : 68, fontSize: 11 }} />
                                )}
                              </td>
                            ))}
                            <td style={{ padding: "3px 5px" }}>
                              {pendingFixtureDelete === i ? (
                                <span className="no-export" style={{ display: "flex", gap: 4 }}>
                                  <button onClick={() => { setFixtures(p => p.filter((_, j) => j !== i)); setPendingFixtureDelete(null); }}
                                    style={{ background: C.red, border: "none", borderRadius: 3, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>Delete</button>
                                  <button onClick={() => setPendingFixtureDelete(null)} style={{ background: "none", border: "1px solid " + C.bd, borderRadius: 3, color: C.dim, fontSize: 9, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                                </span>
                              ) : (
                                <button onClick={() => setPendingFixtureDelete(i)} className="no-export" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── TCE trend (50%) + Fixing window (50%) ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.tx, marginBottom: 6 }}>TCE trend</div>
                  <TCETrendMini lastMonth={tceStats.lastMonth} current={tceStats.current} ytd={tceStats.ytd} />
                </div>
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 10 }}>
                  <BarLineChart data={fixHistory} barKey="ships" lineKey="avgWindow" barLabel="No. of ships" lineLabel="Avg. fix window" title="Fixing window (days)" accent="#4a90e2" loading={fixHistoryLoading} />
                </div>
              </div>

              </div>{/* /marketPreviewRef */}

              {/* ── Hidden light-themed export node — captured for PNG/print instead of the dark editor above ── */}
              <div className="pos-print-wrap" style={{ height: 0, overflow: "hidden" }}>
              <div ref={lightExportRef} className="pos-print" style={{ width: 700, background: "#ffffff", color: "#16233f", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" }}>
                <div style={{ background: "#0b1f3f", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 7, background: "#4a90e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#0b1f3f" }}>S1</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Steem1960 Shipbrokers</div>
                      <div style={{ fontSize: 11, color: "#9fc4f0" }}>Intermediate summary</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#c9d8ee" }}>{new Date(reportDate).toLocaleDateString("en-GB")}</div>
                </div>

                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: "#eaf2fc", borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0b1f3f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Market drivers / What to watch</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
                      {driverBullets.filter(b => b.trim()).map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0b1f3f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Benchmark rates</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#eaf2fc" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Intermediate routes</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Spot</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Last week</th>
                      </tr></thead>
                      <tbody>
                        {benchmarkRows.map((r, i) => (
                          <tr key={r.key} style={{ borderTop: "1px solid #d9e2ef" }}>
                            <td style={{ padding: "5px 8px", fontWeight: 700 }}>{r.label}</td>
                            <td style={{ padding: "5px 8px" }}>{r.freight ? fmtUSD(r.freight) : "—"} {r.tce != null && <span style={{ color: "#6b7280" }}>(USD {Math.round(r.tce / 1000)}k pd)</span>}</td>
                            <td style={{ padding: "5px 8px", color: "#6b7280" }}>{r.lastWeek ? fmtUSD(r.lastWeek) : "—"} {r.tceLastWeek != null && `(USD ${Math.round(r.tceLastWeek / 1000)}k pd)`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0b1f3f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Handy</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#eaf2fc" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Segment</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Spot WS</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>FFA Aug / Sep / Oct</th>
                      </tr></thead>
                      <tbody>
                        {["tc23", "tc6"].map((seg, i) => (
                          <tr key={seg} style={{ borderTop: "1px solid #d9e2ef" }}>
                            <td style={{ padding: "5px 8px", fontWeight: 700 }}>{seg === "tc23" ? "TC23" : "TC6"}</td>
                            <td style={{ padding: "5px 8px" }}>{handy[seg].spotWS ? "WS " + handy[seg].spotWS : "—"}</td>
                            <td style={{ padding: "5px 8px", color: "#6b7280" }}>{[handy[seg].ffaAug, handy[seg].ffaSep, handy[seg].ffaOct].filter(Boolean).map(v => "WS " + v).join(" / ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0b1f3f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Recent fixtures</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                      <thead><tr style={{ background: "#eaf2fc" }}>
                        {["Vessel", "Charterer", "Cargo", "Load", "Disch", "From", "To", "Freight"].map(h => (
                          <th key={h} style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {fixtures.map((f, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #d9e2ef" }}>
                            <td style={{ padding: "4px 6px" }}>{f.vessel}</td>
                            <td style={{ padding: "4px 6px" }}>{f.charterer}</td>
                            <td style={{ padding: "4px 6px" }}>{f.cargo}</td>
                            <td style={{ padding: "4px 6px" }}>{f.load}</td>
                            <td style={{ padding: "4px 6px" }}>{f.disch}</td>
                            <td style={{ padding: "4px 6px" }}>{f.laycanFrom}</td>
                            <td style={{ padding: "4px 6px" }}>{f.laycanTo}</td>
                            <td style={{ padding: "4px 6px" }}>{f.freight ? fmtUSD(f.freight) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0b1f3f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>TCE earnings</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {[["current", "Current"], ["lastMonth", "Last month avg"], ["ytd", "YTD avg"]].map(([k, label]) => (
                        <div key={k} style={{ background: "#eaf2fc", borderRadius: 6, padding: "6px 9px" }}>
                          <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{tceStats[k] ? `USD ${Math.round(parseFloat(tceStats[k]) / 1000)}k pd` : "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </> : <>
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", background: C.bg2, borderBottom: "1px solid " + C.bd, flexWrap: "wrap", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Quick Positions</span>
              <input value={quickTitle} onChange={e => setQuickTitle(e.target.value)} style={{ ...IS, minWidth: 160 }} placeholder="Available tonnage" />
              <div style={{ flex: 1 }} />
              {quickSaveStatus && <span style={{ fontSize: 11, color: quickSaveStatus === "Saved ✓" ? "#43e97b" : C.dim }}>{quickSaveStatus}</span>}
              <button onClick={saveQuickPositions} disabled={!quickRows.length}
                style={{ ...SB, opacity: quickRows.length ? 1 : 0.4, background: "rgba(63,185,80,0.15)", border: "1px solid rgba(63,185,80,0.45)", color: "#3fb950" }}>
                Save
              </button>
              {quickRows.length > 0 && (
                <button onClick={() => { if (window.confirm("Clear all " + quickRows.length + " rows?")) { setQuickRows([]); setQuickParseMsg(""); } }}
                  style={{ ...SB, background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Clear all</button>
              )}
              <button onClick={copyQuick} disabled={!quickRows.length}
                style={{ ...SB, opacity: quickRows.length ? 1 : 0.4, background: quickCopied ? "rgba(67,233,123,0.15)" : "rgba(245,166,35,0.12)", border: "1px solid " + (quickCopied ? "rgba(67,233,123,0.5)" : "rgba(245,166,35,0.45)"), color: quickCopied ? "#43e97b" : "#f5a623" }}>
                {quickCopied ? "✓ Copied!" : "Copy for WhatsApp"}
              </button>
              <button onClick={copyQuickByDate} disabled={!quickRows.length}
                style={{ ...SB, opacity: quickRows.length ? 1 : 0.4, background: quickCopiedDate ? "rgba(67,233,123,0.15)" : "rgba(99,102,241,0.12)", border: "1px solid " + (quickCopiedDate ? "rgba(67,233,123,0.5)" : "rgba(99,102,241,0.45)"), color: quickCopiedDate ? "#43e97b" : "#a5b4fc" }}>
                {quickCopiedDate ? "✓ Copied!" : "Copy by date ↑"}
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Step 1 */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>Step 1 — Paste positions</div>
                <textarea value={quickPaste}
                  onChange={e => { setQuickPaste(e.target.value); setQuickParseMsg(""); }}
                  onPaste={handleImagePaste}
                  placeholder="Paste text from WhatsApp or email, OR paste a screenshot directly (Ctrl/Cmd+V).\n\nText example:\n*MAERSK TANKERS*\nERIKA SCHULTE - GRANGEMOUTH - 6 JUL\nFURE VEN - THAMES - 6 JUL\n\nOperators auto-matched from your vessel database."
                  style={{ width: "100%", minHeight: 120, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 11, padding: 9, outline: "none", resize: "vertical", fontFamily: "monospace", lineHeight: 1.6, boxSizing: "border-box", opacity: quickImgParsing ? 0.5 : 1 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={parsePaste} disabled={quickImgParsing} style={{ ...SB, background: ACCENT, color: "#fff", border: "none", opacity: quickImgParsing ? 0.5 : 1 }}>Parse &amp; add rows</button>
                  {quickPaste.trim() && <button onClick={() => { setQuickPaste(""); setQuickParseMsg(""); }} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Clear paste</button>}
                  <button onClick={addQuickRow} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }} title="Add a blank row to fill in manually">+ Add row manually</button>
                  {quickImgParsing && <span style={{ fontSize: 11, color: ACCENT }}>⏳ {quickParseMsg}</span>}
                  {!quickImgParsing && quickParseMsg && <span style={{ fontSize: 11, color: quickParseMsg.startsWith("✓") ? "#43e97b" : "#f5a623" }}>{quickParseMsg}</span>}
                </div>
                <div style={{ fontSize: 9, color: C.faint, marginTop: 5 }}>
                  💡 Works with text paste AND screenshot paste — just Ctrl/Cmd+V with an image in clipboard
                </div>
              </div>

              {/* Step 2: Edit */}
              {quickRows.length > 0 && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid " + C.bd }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT }}>Step 2 — Check &amp; edit ({quickRows.length} row{quickRows.length !== 1 ? "s" : ""}) — <span style={{ fontWeight: 400, color: C.faint }}>orange = operator not yet matched</span></div>
                    <button onClick={addQuickRow} style={{ fontSize: 10, color: ACCENT, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>+ Add row</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.85fr 0.65fr 1fr 22px", background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 700, padding: "5px 10px", gap: 6 }}>
                    <div>OPERATOR</div><div>VESSEL</div><div>PORT</div><div>DATE</div><div>DIRECTION (optional)</div><div></div>
                  </div>
                  {quickRows.map((r, i) => {
                    const iOp = r.operator ? C.tx : "#f5a623";
                    const INP = (col) => ({ background: "transparent", border: "none", borderBottom: "1px solid rgba(58,130,246,0.28)", color: col || C.tx, fontSize: 11, outline: "none", padding: "1px 2px", width: "100%", fontFamily: "inherit", minWidth: 0 });
                    // Enter jumps to the same column, next row down — same field index across the grid
                    const jumpDown = (fieldIdx) => (e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const cells = document.querySelectorAll(".quick-row-input");
                      const cols = 5; // operator, vessel, port, date, direction
                      const target = cells[(i + 1) * cols + fieldIdx];
                      target?.focus();
                    };
                    return (
                      <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.85fr 0.65fr 1fr 22px", background: i%2===0?"rgba(255,255,255,0.025)":"transparent", padding: "5px 10px", gap: 6, borderTop: "1px solid rgba(58,130,246,0.1)", alignItems: "center" }}>
                        <input className="quick-row-input" style={INP(iOp)} value={r.operator} onChange={e => updateQuickRow(r.id, "operator", e.target.value)} onKeyDown={jumpDown(0)} placeholder="Type operator..." title={r.operator ? r.operator : "Not found in DB — type it here"} />
                        <input className="quick-row-input" style={{ ...INP(), fontWeight: 600 }} value={r.vessel} onChange={e => updateQuickRow(r.id, "vessel", e.target.value.toUpperCase())} onKeyDown={jumpDown(1)} placeholder="VESSEL" />
                        <input className="quick-row-input" style={INP()} value={r.port} onChange={e => updateQuickRow(r.id, "port", e.target.value.toUpperCase())} onKeyDown={jumpDown(2)} placeholder="PORT" />
                        <input className="quick-row-input" style={INP()} value={r.date} onChange={e => updateQuickRow(r.id, "date", e.target.value.toUpperCase())} onKeyDown={jumpDown(3)} placeholder="DATE" />
                        <input className="quick-row-input" style={{ ...INP(C.dim) }} value={r.direction} onChange={e => updateQuickRow(r.id, "direction", e.target.value)} onKeyDown={jumpDown(4)} placeholder="Any direction / options..." />
                        <button onClick={() => deleteQuickRow(r.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.55)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Step 3: Preview + Copy */}
              {quickRows.length > 0 && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT }}>Step 3 — Copy &amp; send</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={copyQuick} style={{ ...SB, background: quickCopied ? "rgba(67,233,123,0.15)" : "rgba(245,166,35,0.12)", border: "1px solid " + (quickCopied ? "rgba(67,233,123,0.5)" : "rgba(245,166,35,0.45)"), color: quickCopied ? "#43e97b" : "#f5a623" }}>
                        {quickCopied ? "✓ Copied!" : "Copy by operator"}
                      </button>
                      <button onClick={copyQuickByDate} style={{ ...SB, background: quickCopiedDate ? "rgba(67,233,123,0.15)" : "rgba(99,102,241,0.12)", border: "1px solid " + (quickCopiedDate ? "rgba(67,233,123,0.5)" : "rgba(99,102,241,0.45)"), color: quickCopiedDate ? "#43e97b" : "#a5b4fc" }}>
                        {quickCopiedDate ? "✓ Copied!" : "Copy by date ↑"}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: C.faint, marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>By operator</div>
                      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: C.tx, lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.bg3, padding: "10px 12px", borderRadius: 5 }}>
                        {buildQuickText()}
                      </pre>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: C.faint, marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>By date (ascending)</div>
                      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: C.tx, lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.bg3, padding: "10px 12px", borderRadius: 5 }}>
                        {buildQuickTextByDate()}
                      </pre>
                    </div>
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
