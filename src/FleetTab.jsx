import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { fmtN } from "./utils";

const OutsidersTab = React.lazy(()=>import("./OutsidersTab"));

// ─── DWT → segment breakpoints — matches Barton's own classification as used
// in NewbuildsTab.jsx, extended with Sub 10k/City split per the app's
// standard Sub 10k → City → Inter → J19 → Flexi → Handy → MR convention ──
const FLEET_SEGMENTS = [
  { key:"sub10", label:"Sub 10k (<10)",  color:"#38bdf8", dwt:[0,      9999]  },
  { key:"city",  label:"City (10-14)",   color:"#58a6ff", dwt:[10000,  14000] },
  { key:"inter", label:"Inter (14-19)",  color:"#4ade80", dwt:[14001,  19000] },
  { key:"j19",   label:"J19 (19-23)",    color:"#f778ba", dwt:[19001,  23000] },
  { key:"flexi", label:"Flexi (23-30)",  color:"#ea9a00", dwt:[23001,  30000] },
  { key:"handy", label:"Handy (30-40)",  color:"#a78bfa", dwt:[30001,  40000] },
  { key:"mr",    label:"MR (>40)",       color:"#22d3ee", dwt:[40001,  999999]},
];
function segmentOf(dwt) {
  if (!dwt || dwt < 500) return null;
  return FLEET_SEGMENTS.find(s => dwt >= s.dwt[0] && dwt <= s.dwt[1]) || null;
}

const COATING_COLORS = {
  Stainless:  "#58a6ff",
  Epoxy:      "#43e97b",
  MarineLine: "#f5a623",
  Interline:  "#a78bfa",
  Zinc:       "#ff6b6b",
};
const IMO_COLORS = { "IMO 1":"#ff6b6b", "IMO 2":"#58a6ff", "IMO 3":"#4ade80" };

const CUR_YEAR = new Date().getFullYear();
const ageOf = built => built ? CUR_YEAR - built : null;

// Postgres `numeric` columns come back from PostgREST as strings (to avoid
// float precision loss), which silently breaks `+=` (string concatenation
// instead of addition) anywhere we sum/compare them.
const NUM_FIELDS = ["dwt","cbm","loa","beam","draft","tanks","segs","built"];
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function fmtUpdatedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

function vesselKey(r) { return r.imo || r.vessel; }

// Debounces a fast-changing value (typing) so expensive downstream recompute
// (filtering/sorting/re-rendering thousands of rows) only runs once typing pauses.
function useDebounced(value, delay=250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const SELECT_COLS = "vessel,imo,dwt,loa,beam,draft,cbm,coating,built,flag,imo_type,operator,owner,ice_class,fuel_type,tanks,segs,other_data,tier_name,comments,last_ex_name,country_build";
const PAGE_SIZE = 100;

// ─── small UI atoms ─────────────────────────────────────────────────────────
const CARD = { background:C.bg2, border:"1px solid "+C.bd, borderRadius:10, padding:"14px 16px" };
const CHIP = (active, col="#58a6ff") => ({
  fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:6, cursor:"pointer",
  border:`1px solid ${active?col+"88":C.bd}`,
  background: active?col+"22":"transparent",
  color: active?col:C.faint,
  fontFamily:"inherit", whiteSpace:"nowrap",
});
const LABEL = { fontSize:10, color:C.faint, textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700 };
const SUBLABEL = { fontWeight:400, textTransform:"none", letterSpacing:0, color:C.faint };
// type=text + inputMode avoids the browser's number-input spinner arrows entirely.
const NUM_INPUT = { width:80, background:C.bg3, border:"1px solid "+C.bd, borderRadius:5, color:C.tx,
  fontFamily:"inherit", fontSize:12, padding:"5px 8px", outline:"none" };

function numericOnChange(setter) {
  return e => {
    const v = e.target.value.replace(/[^0-9]/g, "");
    setter(v);
  };
}

function Bar({ label, value, max, color, sub, active, onClick }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div
      style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, cursor: onClick?"pointer":"default" }}
      onClick={onClick}
    >
      <div style={{ width:100, fontSize:11, color: active?color:C.tx, fontWeight: active?700:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={label}>{label}</div>
      <div style={{ flex:1, height:14, background:C.bg3, borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:pct+"%", height:"100%", background:color, borderRadius:3 }}/>
      </div>
      <div style={{ width:46, fontSize:11, fontWeight:700, color:C.tx, textAlign:"right" }}>{sub || value}</div>
    </div>
  );
}

function Donut({ segments, size=190, onSliceClick, activeSet }) {
  const total = segments.reduce((a,s)=>a+s.value,0) || 1;
  const r = size/2 - 12, cx = size/2, cy = size/2, circ = 2*Math.PI*r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.bg3} strokeWidth={20}/>
      {segments.map((s,i) => {
        const frac = s.value/total;
        const dash = frac*circ;
        const dimmed = activeSet && activeSet.size>0 && !activeSet.has(s.label);
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={20}
            strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset}
            strokeOpacity={dimmed?0.3:1}
            style={{ cursor: onSliceClick?"pointer":"default" }}
            onClick={onSliceClick ? ()=>onSliceClick(s.label) : undefined}
            transform={`rotate(-90 ${cx} ${cy})`}/>
        );
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy-3} textAnchor="middle" fontSize={20} fontWeight={800} fill={C.tx}>{total}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize={9} fill={C.faint}>SHIPS</text>
    </svg>
  );
}

function YearHistogram({ rows, height=220, onYearClick, activeYears }) {
  const byYear = {};
  rows.forEach(r => { if (r.built) byYear[r.built] = (byYear[r.built]||0)+1; });
  const years = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
  if (!years.length) return <div style={{ fontSize:12, color:C.faint }}>No built-year data</div>;
  const minY = years[0], maxY = years[years.length-1];
  const full = []; for (let y=minY; y<=maxY; y++) full.push(y);
  const max = Math.max(...full.map(y=>byYear[y]||0));
  return (
    <div style={{ width:"100%" }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:2, height }}>
        {full.map(y => {
          const v = byYear[y]||0;
          const barH = max>0 ? Math.max(v>0?3:0, (v/max)*height) : 0;
          const active = activeYears && activeYears.has(y);
          const dimmed = activeYears && activeYears.size>0 && !active;
          return (
            <div key={y}
              onClick={v>0 && onYearClick ? ()=>onYearClick(y) : undefined}
              style={{ flex:"1 1 0", minWidth:2, height:"100%", display:"flex", flexDirection:"column",
                justifyContent:"flex-end", alignItems:"center", cursor: onYearClick && v>0 ? "pointer":"default" }}>
              {v>0 && <div style={{ fontSize:9, color:C.dim, marginBottom:2, whiteSpace:"nowrap" }}>{v}</div>}
              <div style={{ width:"100%", height:barH, background: active?"#f5a623":"#58a6ff", opacity: dimmed?0.35:1, borderRadius:1 }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:2, marginTop:5 }}>
        {full.map(y => (
          <div key={y} style={{ flex:"1 1 0", minWidth:2, textAlign:"center", fontSize:9, color:C.faint }}>
            {y%5===0 ? y : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── main component ─────────────────────────────────────────────────────────
export default function FleetTab() {
  const [viewMode, setViewMode] = useState("fleet"); // "fleet" | "outsiders"
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null); // {file_name, uploaded_at, row_count}

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 200);

  const [scopes, setScopes] = useState(() => new Set(["vessel"]));
  const [coatingFilter, setCoatingFilter] = useState(() => new Set());
  const [segmentFilter, setSegmentFilter] = useState(() => new Set());
  const [iceFilter, setIceFilter] = useState(() => new Set());
  const [imoTypeFilter, setImoTypeFilter] = useState(() => new Set());
  const [countryFilter, setCountryFilter] = useState(() => new Set());
  const [outsiderImos, setOutsiderImos] = useState(() => new Set());
  const [outsiderOnly, setOutsiderOnly] = useState(false);
  const [yearFilter, setYearFilter] = useState(() => new Set());
  const [ownerFilter, setOwnerFilter] = useState(() => new Set());

  const [dwtFromInput, setDwtFromInput] = useState("");
  const [dwtToInput, setDwtToInput] = useState("");
  // Vessels built before 1995 aren't relevant to day-to-day work — filtered
  // out by default, but still adjustable/clearable via the range controls.
  const [builtFromInput, setBuiltFromInput] = useState("1995");
  const [builtToInput, setBuiltToInput] = useState("");
  const dwtFrom = useDebounced(dwtFromInput, 300);
  const dwtTo = useDebounced(dwtToInput, 300);
  const builtFrom = useDebounced(builtFromInput, 300);
  const builtTo = useDebounced(builtToInput, 300);

  const [sort, setSort] = useState({ key:"vessel", dir:"asc" });
  const [expandedSeg, setExpandedSeg] = useState(() => new Set());
  const [ownerSort, setOwnerSort] = useState({ key:"ships", dir:"desc" });
  const [page, setPage] = useState(1);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [includeStatsInCSV, setIncludeStatsInCSV] = useState(true);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setLoadError(null);
    let all = [], from = 0; const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.from("vessels_db").select(SELECT_COLS).range(from, from+pageSize-1);
      if (error) {
        console.error("FleetTab load error:", error);
        setLoadError(error.message || "Failed to load fleet data.");
        break;
      }
      if (!data || !data.length) break;
      all = [...all, ...data];
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
    setLoaded(true);
    setLoading(false);
  }, [loaded, loading]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    async function fetchOutsiderImos() {
      const { data, error } = await supabase.from("outsider_vessels").select("imo");
      if (error) { console.error("outsider_vessels fetch error:", error); return; }
      setOutsiderImos(new Set((data||[]).map(r=>r.imo)));
    }
    fetchOutsiderImos();
  }, []);

  useEffect(() => {
    async function fetchMeta() {
      const { data, error } = await supabase.from("upload_meta").select("*").eq("table_name","vessels_db").maybeSingle();
      if (error) { console.error("upload_meta fetch error:", error); return; }
      setLastUpdated(data || null);
    }
    fetchMeta();
  }, []);

  const enriched = useMemo(() => rows.map(r => {
    const norm = { ...r };
    NUM_FIELDS.forEach(f => { norm[f] = toNum(r[f]); });
    return { ...norm, age: ageOf(norm.built), segment: segmentOf(norm.dwt) };
  }), [rows]);

  const coatingList = useMemo(() => [...new Set(enriched.map(r=>r.coating).filter(Boolean))].sort(), [enriched]);
  const iceList = useMemo(() => [...new Set(enriched.map(r=>r.ice_class).filter(Boolean))].sort(), [enriched]);

  const searchTerms = useMemo(() => search.split(",").map(t=>t.trim().toLowerCase()).filter(Boolean), [search]);

  const filtered = useMemo(() => {
    const dFrom = dwtFrom !== "" ? Number(dwtFrom) : null;
    const dTo   = dwtTo   !== "" ? Number(dwtTo)   : null;
    const bFrom = builtFrom !== "" ? Number(builtFrom) : null;
    const bTo   = builtTo   !== "" ? Number(builtTo)   : null;
    return enriched.filter(r => {
      if (coatingFilter.size && !coatingFilter.has(r.coating)) return false;
      if (segmentFilter.size && !(r.segment && segmentFilter.has(r.segment.key))) return false;
      if (iceFilter.size && !iceFilter.has(r.ice_class)) return false;
      if (imoTypeFilter.size && !imoTypeFilter.has(r.imo_type)) return false;
      if (countryFilter.size && !countryFilter.has(r.country_build)) return false;
      if (outsiderOnly && !outsiderImos.has(r.imo)) return false;
      if (yearFilter.size && !yearFilter.has(r.built)) return false;
      if (ownerFilter.size && !ownerFilter.has(r.owner+"||"+(r.operator||""))) return false;
      if (dFrom != null && (r.dwt == null || r.dwt < dFrom)) return false;
      if (dTo   != null && (r.dwt == null || r.dwt > dTo))   return false;
      if (bFrom != null && (r.built == null || r.built < bFrom)) return false;
      if (bTo   != null && (r.built == null || r.built > bTo))   return false;
      if (!searchTerms.length) return true;
      const fields = [];
      if (scopes.has("vessel"))   fields.push(r.vessel);
      if (scopes.has("operator")) fields.push(r.operator);
      if (scopes.has("owner"))    fields.push(r.owner);
      if (scopes.has("country"))  fields.push(r.country_build);
      if (scopes.has("notes"))    fields.push(r.comments, r.other_data);
      if (!fields.length) fields.push(r.vessel, r.operator, r.owner);
      const lowerFields = fields.filter(Boolean).map(f=>String(f).toLowerCase());
      return searchTerms.some(term => lowerFields.some(f => f.includes(term)));
    });
  }, [enriched, searchTerms, scopes, coatingFilter, segmentFilter, iceFilter, imoTypeFilter, countryFilter, yearFilter, ownerFilter, dwtFrom, dwtTo, builtFrom, builtTo, outsiderOnly, outsiderImos]);

  useEffect(() => { setPage(1); }, [searchTerms, coatingFilter, segmentFilter, iceFilter, imoTypeFilter, countryFilter, yearFilter, ownerFilter, dwtFrom, dwtTo, builtFrom, builtTo, sort]);

  // Selection mode: default-selects everything currently in view, then you deselect.
  function enterSelectMode() {
    setSelectedKeys(new Set(filtered.map(vesselKey)));
    setSelectMode(true);
  }
  function exitSelectMode() { setSelectMode(false); }
  function toggleVesselSelected(key) {
    setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function selectAllVisible() { setSelectedKeys(new Set(filtered.map(vesselKey))); }
  function deselectAllVisible() { setSelectedKeys(new Set()); }
  function toggleGroupSelected(groupRows, allSelected) {
    setSelectedKeys(prev => {
      const n = new Set(prev);
      groupRows.forEach(r => { const k = vesselKey(r); allSelected ? n.delete(k) : n.add(k); });
      return n;
    });
  }

  // Everything downstream (stats, charts, roll-ups, CSV export) reflects this —
  // the full filtered set normally, or just what's ticked while in select mode.
  const effectiveRows = useMemo(() => {
    if (!selectMode) return filtered;
    return filtered.filter(r => selectedKeys.has(vesselKey(r)));
  }, [filtered, selectMode, selectedKeys]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a,b) => {
      let av = a[key], bv = b[key];
      if (key === "segment") { av = a.segment?.label||""; bv = b.segment?.label||""; }
      if (typeof av === "string" || typeof bv === "string") {
        av = (av||"").toString().toLowerCase(); bv = (bv||"").toString().toLowerCase();
        return av < bv ? -mul : av > bv ? mul : 0;
      }
      av = av ?? -Infinity; bv = bv ?? -Infinity;
      return (av - bv) * mul;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page-1)*PAGE_SIZE;
    return sorted.slice(start, start+PAGE_SIZE);
  }, [sorted, page]);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir==="asc"?"desc":"asc" } : { key, dir:"asc" });
  }
  function toggleSet(setter, val) {
    setter(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  }

  const anyFilterActive = coatingFilter.size||segmentFilter.size||iceFilter.size||imoTypeFilter.size||countryFilter.size||yearFilter.size||ownerFilter.size||outsiderOnly;
  function clearAllFilters() {
    setCoatingFilter(new Set()); setSegmentFilter(new Set()); setIceFilter(new Set());
    setImoTypeFilter(new Set()); setCountryFilter(new Set()); setYearFilter(new Set()); setOwnerFilter(new Set());
    setOutsiderOnly(false);
  }

  // ── stats (all derived from effectiveRows, so selection mode narrows everything) ──
  const stats = useMemo(() => {
    const ages = effectiveRows.map(r=>r.age).filter(a=>a!=null);
    const avgAge = ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null;
    return { count: effectiveRows.length, avgAge };
  }, [effectiveRows]);

  const coatingDonut = useMemo(() => {
    const m = {};
    effectiveRows.forEach(r => { if (r.coating) m[r.coating] = (m[r.coating]||0)+1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, color: COATING_COLORS[label] || "#94a3b8" }));
  }, [effectiveRows]);

  const imoBars = useMemo(() => {
    const m = { "IMO 1":0, "IMO 2":0, "IMO 3":0 };
    effectiveRows.forEach(r => { if (r.imo_type && m[r.imo_type] != null) m[r.imo_type]++; });
    const max = Math.max(1, ...Object.values(m));
    return Object.entries(m).map(([label,value]) => ({ label, value, max, color: IMO_COLORS[label] }));
  }, [effectiveRows]);

  const iceBars = useMemo(() => {
    const m = {};
    effectiveRows.forEach(r => { if (r.ice_class) m[r.ice_class] = (m[r.ice_class]||0)+1; });
    const top = Object.entries(m).sort((a,b)=>b[1]-a[1]);
    const max = Math.max(1, ...top.map(([,v])=>v));
    return top.map(([label,value]) => ({ label, value, max }));
  }, [effectiveRows]);

  const countryBars = useMemo(() => {
    const m = {};
    effectiveRows.forEach(r => { if (r.country_build) m[r.country_build] = (m[r.country_build]||0)+1; });
    const top = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const max = Math.max(1, ...top.map(([,v])=>v));
    return top.map(([label,value]) => ({ label, value, max }));
  }, [effectiveRows]);

  function statBlock(ages) {
    const avgAge = ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null;
    const n15 = ages.filter(a=>a>15).length, n20 = ages.filter(a=>a>20).length, n25 = ages.filter(a=>a>25).length;
    const n = ages.length || 0;
    return { avgAge, n15, n20, n25, r15: n?n15/n:0, r20: n?n20/n:0, r25: n?n25/n:0 };
  }

  const segStats = useMemo(() => {
    return FLEET_SEGMENTS.map(seg => {
      const segRows = effectiveRows.filter(r => r.segment?.key === seg.key);
      const base = statBlock(segRows.map(r=>r.age).filter(a=>a!=null));
      const byCoating = {};
      segRows.forEach(r => { if (r.coating) (byCoating[r.coating] ||= []).push(r); });
      const coatings = Object.entries(byCoating)
        .map(([name, crows]) => ({ name, ships: crows.length, ...statBlock(crows.map(r=>r.age).filter(a=>a!=null)) }))
        .sort((a,b)=>b.ships-a.ships);
      return { ...seg, ships: segRows.length, ...base, coatings };
    }).filter(s => s.ships > 0);
  }, [effectiveRows]);

  // ── fleet stats summary card ──────────────────────────────────────────
  const fleetStats = useMemo(() => {
    const n = effectiveRows.length;
    const ages = effectiveRows.map(r=>r.age).filter(a=>a!=null);
    const avgAge = ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null;
    function breakdown(resolver) {
      const m = {};
      effectiveRows.forEach(r => { const v = resolver(r); if (!v) return; m[v] = (m[v]||0)+1; });
      return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, share: n?value/n:0 }));
    }
    return {
      count: n, avgAge,
      imoBreakdown: breakdown(r=>r.imo_type),
      coatingBreakdown: breakdown(r=>r.coating),
      iceBreakdown: breakdown(r=>r.ice_class),
      segmentBreakdown: breakdown(r=>r.segment?.label),
    };
  }, [effectiveRows]);

  // ── combined owner+operator roll-up ─────────────────────────────────────
  function ownerOperatorKey(r) { return (r.owner||"—")+"||"+(r.operator||""); }
  const combinedRollup = useMemo(() => {
    const m = {};
    filtered.forEach(r => {
      if (!r.owner && !r.operator) return;
      const key = ownerOperatorKey(r);
      if (!m[key]) m[key] = { key, owner: r.owner||"—", operator: r.operator||"—", ships:0, dwt:0, ages:[], n15:0, n20:0, n25:0, rows:[] };
      const g = m[key];
      g.ships++; g.dwt += r.dwt||0; g.rows.push(r);
      if (r.age != null) {
        g.ages.push(r.age);
        if (r.age>15) g.n15++;
        if (r.age>20) g.n20++;
        if (r.age>25) g.n25++;
      }
    });
    return Object.values(m).map(g => ({
      ...g,
      avgAge: g.ages.length ? g.ages.reduce((a,b)=>a+b,0)/g.ages.length : null,
      r15: g.ships ? g.n15/g.ships : 0, r20: g.ships ? g.n20/g.ships : 0, r25: g.ships ? g.n25/g.ships : 0,
    }));
  }, [filtered]);

  const ownerSorted = useMemo(() => {
    const { key, dir } = ownerSort;
    const mul = dir==="asc"?1:-1;
    return [...combinedRollup].sort((a,b) => {
      let av=a[key], bv=b[key];
      if (typeof av === "string") return (av||"").localeCompare(bv||"") * mul;
      av = av ?? -Infinity; bv = bv ?? -Infinity;
      return (av-bv)*mul;
    });
  }, [combinedRollup, ownerSort]);

  // ── CSV export ───────────────────────────────────────────────────────
  function exportCSV() {
    const cols = [
      ["vessel","Vessel"],["coating","Coating"],["segment","Segment"],["built","Built"],["age","Age"],
      ["dwt","DWT"],["cbm","CBM"],["loa","LOA"],["beam","Beam"],["draft","Draft"],["segs","Segs"],
      ["flag","Flag"],["ice_class","Ice"],["imo_type","IMO Type"],["last_ex_name","Last Ex Name"],
      ["comments","Notes"],["operator","Operator"],["owner","Owner/Manager"],
    ];
    const header = cols.map(([,label])=>csvEscape(label)).join(",");
    const lines = effectiveRows.map(r => cols.map(([key]) => {
      const v = key==="segment" ? (r.segment?.label||"") : r[key];
      return csvEscape(v);
    }).join(","));
    let csv = [header, ...lines].join("\n");

    if (includeStatsInCSV) {
      csv += "\n\nFLEET STATS SUMMARY\n";
      csv += `Ships,${fleetStats.count}\n`;
      csv += `Average Age,${fleetStats.avgAge!=null?fleetStats.avgAge.toFixed(1):""}\n`;
      const section = (title, items) => {
        csv += `\n${title},Count,Share\n`;
        items.forEach(b => { csv += `${csvEscape(b.label)},${b.value},${(b.share*100).toFixed(1)}%\n`; });
      };
      section("IMO Type", fleetStats.imoBreakdown);
      section("Coating", fleetStats.coatingBreakdown);
      section("Ice Class", fleetStats.iceBreakdown);
      section("Segment", fleetStats.segmentBreakdown);
    }
    downloadText(`fleet_export_${new Date().toISOString().slice(0,10)}.csv`, csv);
  }

  // ── render ──────────────────────────────────────────────────────────────
  const SCOPE_OPTS = [["vessel","Vessel"],["operator","Operator"],["owner","Owner"],["country","Country Built"],["notes","Notes"]];

  const TH_ = { fontSize:10, fontWeight:700, color:C.faint, textTransform:"uppercase", letterSpacing:"0.06em",
    padding:"6px 10px", borderBottom:"1px solid "+C.bd, textAlign:"left", whiteSpace:"nowrap", cursor:"pointer", userSelect:"none" };
  const TD_ = { fontSize:12, padding:"6px 10px", borderBottom:"1px solid "+C.bd2, color:C.dim, whiteSpace:"nowrap",
    overflow:"hidden", textOverflow:"ellipsis", maxWidth:180 };

  function SortTH({ label, k, sortState, onSort, align }) {
    const active = sortState.key === k;
    return (
      <th style={{ ...TH_, textAlign: align||"left" }} onClick={() => onSort(k)}>
        {label}{active ? (sortState.dir==="asc" ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  const RATIO_CELL = r => r == null ? "—" : (r*100).toFixed(0)+"%";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, padding:"14px 0 30px" }}>

      {/* ── Fleet / Outsiders toggle ── */}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={()=>React.startTransition(()=>setViewMode("fleet"))}
          style={{ fontSize:12, fontWeight:700, padding:"6px 16px", borderRadius:6, cursor:"pointer", fontFamily:"inherit",
            border:"1px solid "+(viewMode==="fleet"?"#58a6ff88":C.bd), background:viewMode==="fleet"?"#58a6ff22":"transparent",
            color:viewMode==="fleet"?"#58a6ff":C.faint }}>
          Fleet
        </button>
        <button onClick={()=>React.startTransition(()=>setViewMode("outsiders"))}
          style={{ fontSize:12, fontWeight:700, padding:"6px 16px", borderRadius:6, cursor:"pointer", fontFamily:"inherit",
            border:"1px solid "+(viewMode==="outsiders"?"#f5a62388":C.bd), background:viewMode==="outsiders"?"#f5a62322":"transparent",
            color:viewMode==="outsiders"?"#f5a623":C.faint }}>
          Outsiders
        </button>
      </div>

      {viewMode==="outsiders" ? (
        <Suspense fallback={<div style={{fontSize:12,color:C.faint}}>Loading…</div>}><OutsidersTab/></Suspense>
      ) : (
      <>

      {/* ── search + filters ── */}
      <div style={{ ...CARD, display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ position:"relative", flex:"0 1 380px", minWidth:280 }}>
            <input
              value={searchInput} onChange={e=>setSearchInput(e.target.value)}
              placeholder="🔍 Search fleet… (comma-separate: stena, maersk, hafnia)"
              style={{ width:"100%", boxSizing:"border-box", background:C.bg3, border:"1px solid "+C.bd, borderRadius:6, color:C.tx, fontFamily:"inherit",
                fontSize:13, padding:"8px 30px 8px 12px", outline:"none" }}
            />
            {searchInput && (
              <button onClick={()=>setSearchInput("")}
                style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", background:"none", border:"none",
                  color:C.faint, cursor:"pointer", fontSize:14, padding:"2px 6px", lineHeight:1 }}>✕</button>
            )}
          </div>
          {SCOPE_OPTS.map(([k,label]) => (
            <button key={k} style={CHIP(scopes.has(k))} onClick={()=>toggleSet(setScopes,k)}>{label}</button>
          ))}
          {loading && <span style={{ fontSize:11, color:C.faint }}>Loading fleet…</span>}
          {loadError && (
            <span style={{ fontSize:11, color:C.red, display:"flex", alignItems:"center", gap:8 }}>
              ⚠ {loadError}
              <button style={CHIP(true,"#ff6b6b")} onClick={()=>{ setLoaded(false); load(); }}>Retry</button>
            </span>
          )}
          <div style={{ marginLeft:"auto", display:"flex", gap:14, alignItems:"center" }}>
            {lastUpdated && (
              <span style={{ fontSize:11, color:C.faint, borderRight:"1px solid "+C.bd, paddingRight:14 }} title={lastUpdated.file_name||""}>
                {lastUpdated.source_modified_at && (
                  <>File dated {fmtUpdatedAt(lastUpdated.source_modified_at)} · </>
                )}
                Uploaded {fmtUpdatedAt(lastUpdated.uploaded_at)} · {lastUpdated.file_name||"—"}
              </span>
            )}
            <span style={{ fontSize:12, color:C.faint }}>Ships <b style={{ color:C.tx, fontSize:15 }}>{stats.count}</b></span>
            <span style={{ fontSize:12, color:C.faint }}>Avg age <b style={{ color:C.amber, fontSize:15 }}>{stats.avgAge!=null?stats.avgAge.toFixed(1):"—"}</b></span>
          </div>
        </div>

        <div style={{ display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
          <span style={LABEL}>Coating</span>
          {coatingList.map(c => (
            <button key={c} style={CHIP(coatingFilter.has(c), COATING_COLORS[c]||"#94a3b8")} onClick={()=>toggleSet(setCoatingFilter,c)}>{c}</button>
          ))}
          <span style={{ ...LABEL, marginLeft:10 }}>Segment</span>
          {FLEET_SEGMENTS.map(s => (
            <button key={s.key} style={CHIP(segmentFilter.has(s.key), s.color)} onClick={()=>toggleSet(setSegmentFilter,s.key)}>{s.label}</button>
          ))}
          {iceList.length > 0 && <>
            <span style={{ ...LABEL, marginLeft:10 }}>Ice</span>
            {iceList.map(i => (
              <button key={i} style={CHIP(iceFilter.has(i))} onClick={()=>toggleSet(setIceFilter,i)}>{i}</button>
            ))}
          </>}
          {outsiderImos.size>0 && (
            <button style={CHIP(outsiderOnly,"#f5a623")} onClick={()=>setOutsiderOnly(v=>!v)} title="Only show fleet vessels that are also on the outsider list">
              🌏 Outsider only
            </button>
          )}
          {anyFilterActive > 0 && (
            <button style={{ ...CHIP(true,"#ff6b6b"), marginLeft:"auto" }} onClick={clearAllFilters}>✕ Clear filters</button>
          )}
        </div>

        <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
          <span style={LABEL}>DWT</span>
          <input type="text" inputMode="numeric" placeholder="From" value={dwtFromInput} onChange={numericOnChange(setDwtFromInput)} style={NUM_INPUT}/>
          <span style={{ color:C.faint, fontSize:11 }}>–</span>
          <input type="text" inputMode="numeric" placeholder="To" value={dwtToInput} onChange={numericOnChange(setDwtToInput)} style={NUM_INPUT}/>
          <span style={{ ...LABEL, marginLeft:14 }}>Built</span>
          <input type="text" inputMode="numeric" placeholder="From" value={builtFromInput} onChange={numericOnChange(setBuiltFromInput)} style={NUM_INPUT}/>
          <span style={{ color:C.faint, fontSize:11 }}>–</span>
          <input type="text" inputMode="numeric" placeholder="To" value={builtToInput} onChange={numericOnChange(setBuiltToInput)} style={NUM_INPUT}/>
          {(dwtFromInput||dwtToInput||builtFromInput||builtToInput) && (
            <button style={CHIP(true,"#ff6b6b")} onClick={()=>{ setDwtFromInput(""); setDwtToInput(""); setBuiltFromInput(""); setBuiltToInput(""); }}>✕ Clear range</button>
          )}

          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            {selectMode ? (
              <>
                <span style={{ fontSize:11, color:"#58a6ff", fontWeight:700 }}>{selectedKeys.size} / {filtered.length} selected</span>
                <button style={CHIP(false)} onClick={selectAllVisible}>Select all</button>
                <button style={CHIP(false)} onClick={deselectAllVisible}>Deselect all</button>
                <button style={CHIP(true,"#4ade80")} onClick={exitSelectMode}>✓ Done</button>
              </>
            ) : (
              <button style={CHIP(false,"#58a6ff")} onClick={enterSelectMode}>☑ Select mode</button>
            )}
            <button style={CHIP(false,"#4fc3f7")} onClick={exportCSV}>⬇ Export CSV</button>
            <label style={{ fontSize:11, color:C.faint, display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
              <input type="checkbox" checked={includeStatsInCSV} onChange={e=>setIncludeStatsInCSV(e.target.checked)}/>
              incl. stats
            </label>
          </div>
        </div>
      </div>

      {/* ── charts row: coating / imo type / country built / built year ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 2fr", gap:16 }}>
        <div style={CARD}>
          <div style={LABEL}>Coating <span style={SUBLABEL}>(click to filter)</span></div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, marginTop:8 }}>
            <Donut segments={coatingDonut} onSliceClick={label=>toggleSet(setCoatingFilter,label)} activeSet={coatingFilter}/>
            <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:"4px 12px" }}>
              {coatingDonut.map(s => (
                <div key={s.label} onClick={()=>toggleSet(setCoatingFilter,s.label)}
                  style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, cursor:"pointer",
                    color: coatingFilter.has(s.label)?s.color:C.tx, fontWeight: coatingFilter.has(s.label)?700:500 }}>
                  <span style={{ width:9, height:9, borderRadius:2, background:s.color, display:"inline-block" }}/>
                  {s.label} <b style={{ color:C.tx }}>{s.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>IMO Type <span style={SUBLABEL}>(click to filter)</span></div>
          <div style={{ marginTop:12 }}>
            {imoBars.map(b => (
              <Bar key={b.label} label={b.label} value={b.value} max={b.max} color={b.color}
                active={imoTypeFilter.has(b.label)} onClick={()=>toggleSet(setImoTypeFilter,b.label)}/>
            ))}
          </div>
          <div style={{ ...LABEL, marginTop:16 }}>Ice Class <span style={SUBLABEL}>(click to filter)</span></div>
          <div style={{ marginTop:10 }}>
            {iceBars.map(b => (
              <Bar key={b.label} label={b.label} value={b.value} max={b.max} color="#a78bfa"
                active={iceFilter.has(b.label)} onClick={()=>toggleSet(setIceFilter,b.label)}/>
            ))}
            {!iceBars.length && <div style={{ fontSize:11, color:C.faint }}>No data</div>}
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>Country Built <span style={SUBLABEL}>(click to filter)</span></div>
          <div style={{ marginTop:12 }}>
            {countryBars.map(b => (
              <Bar key={b.label} label={b.label} value={b.value} max={b.max} color="#4fc3f7"
                active={countryFilter.has(b.label)} onClick={()=>toggleSet(setCountryFilter,b.label)}/>
            ))}
            {!countryBars.length && <div style={{ fontSize:11, color:C.faint }}>No data</div>}
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>Built Year <span style={SUBLABEL}>(click a bar to filter)</span></div>
          <div style={{ marginTop:10, width:"100%" }}>
            <YearHistogram rows={effectiveRows} height={220} onYearClick={y=>toggleSet(setYearFilter,y)} activeYears={yearFilter}/>
          </div>
        </div>
      </div>

      {/* ── segment / age profile table ── */}
      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom:8 }}>Segment — Age profile</div>
        <table style={{ borderCollapse:"collapse", width:"100%" }}>
          <thead><tr>
            <th style={TH_}>Segment</th>
            <th style={{...TH_,textAlign:"right"}}>Ships</th>
            <th style={{...TH_,textAlign:"right"}}>Avg age</th>
            <th style={{...TH_,textAlign:"right"}}>&gt;15yrs</th>
            <th style={{...TH_,textAlign:"right"}}>Ratio</th>
            <th style={{...TH_,textAlign:"right"}}>&gt;20yrs</th>
            <th style={{...TH_,textAlign:"right"}}>Ratio</th>
            <th style={{...TH_,textAlign:"right"}}>&gt;25yrs</th>
            <th style={{...TH_,textAlign:"right"}}>Ratio</th>
          </tr></thead>
          <tbody>
            {segStats.map(s => (
              <React.Fragment key={s.key}>
                <tr style={{ cursor:"pointer" }} onClick={()=>toggleSet(setExpandedSeg,s.key)}>
                  <td style={{ ...TD_, color:s.color, fontWeight:700 }}>{expandedSeg.has(s.key)?"▾":"▸"} {s.label}</td>
                  <td style={{ ...TD_, textAlign:"right", color:C.tx, fontWeight:700 }}>{s.ships}</td>
                  <td style={{ ...TD_, textAlign:"right" }}>{s.avgAge!=null?s.avgAge.toFixed(1):"—"}</td>
                  <td style={{ ...TD_, textAlign:"right" }}>{s.n15}</td>
                  <td style={{ ...TD_, textAlign:"right", color: s.r15>0.5?C.red:C.dim }}>{RATIO_CELL(s.r15)}</td>
                  <td style={{ ...TD_, textAlign:"right" }}>{s.n20}</td>
                  <td style={{ ...TD_, textAlign:"right", color: s.r20>0.3?C.red:C.dim }}>{RATIO_CELL(s.r20)}</td>
                  <td style={{ ...TD_, textAlign:"right" }}>{s.n25}</td>
                  <td style={{ ...TD_, textAlign:"right", color: s.r25>0.15?C.red:C.dim }}>{RATIO_CELL(s.r25)}</td>
                </tr>
                {expandedSeg.has(s.key) && s.coatings.map(c => (
                  <tr key={c.name}>
                    <td style={{ ...TD_, paddingLeft:26, color:COATING_COLORS[c.name]||C.faint }}>{c.name}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{c.ships}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{c.avgAge!=null?c.avgAge.toFixed(1):"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{c.n15}</td>
                    <td style={{ ...TD_, textAlign:"right", color: c.r15>0.5?C.red:C.dim }}>{RATIO_CELL(c.r15)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{c.n20}</td>
                    <td style={{ ...TD_, textAlign:"right", color: c.r20>0.3?C.red:C.dim }}>{RATIO_CELL(c.r20)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{c.n25}</td>
                    <td style={{ ...TD_, textAlign:"right", color: c.r25>0.15?C.red:C.dim }}>{RATIO_CELL(c.r25)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {!segStats.length && <tr><td style={TD_} colSpan={9}>No vessels match current filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── owner/operator combined roll-up + fleet stats summary ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div style={{ ...CARD, maxHeight:440, overflow:"auto" }}>
          <div style={{ ...LABEL, marginBottom:8 }}>Owner / Operator <span style={SUBLABEL}>(click a row to filter{selectMode?", checkbox to include/exclude in selection":""})</span></div>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead><tr>
              {selectMode && <th style={TH_}></th>}
              <SortTH label="Owner" k="owner" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"})}/>
              <SortTH label="Operator" k="operator" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"})}/>
              <SortTH label="Ships" k="ships" align="right" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
              <SortTH label="DWT" k="dwt" align="right" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
              <SortTH label="Avg age" k="avgAge" align="right" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"})}/>
              <SortTH label=">15yrs" k="r15" align="right" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
              <SortTH label=">20yrs" k="r20" align="right" sortState={ownerSort} onSort={k=>setOwnerSort(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
            </tr></thead>
            <tbody>
              {ownerSorted.map(g => {
                const active = ownerFilter.has(g.key);
                const groupSelected = g.rows.every(r => selectedKeys.has(vesselKey(r)));
                return (
                  <tr key={g.key} style={{ background: active ? "rgba(88,166,255,0.10)" : "transparent" }}>
                    {selectMode && (
                      <td style={{ ...TD_, width:24, cursor:"pointer" }} onClick={()=>toggleGroupSelected(g.rows, groupSelected)}>
                        <input type="checkbox" checked={groupSelected} onChange={()=>toggleGroupSelected(g.rows, groupSelected)}/>
                      </td>
                    )}
                    <td style={{ ...TD_, color: active?"#58a6ff":C.tx, fontWeight:600, maxWidth:140, cursor:"pointer" }} title={g.owner} onClick={()=>toggleSet(setOwnerFilter,g.key)}>{active?"✓ ":""}{g.owner}</td>
                    <td style={{ ...TD_, maxWidth:140, cursor:"pointer" }} title={g.operator} onClick={()=>toggleSet(setOwnerFilter,g.key)}>{g.operator}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{g.ships}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{fmtN(g.dwt)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{g.avgAge!=null?g.avgAge.toFixed(1):"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{RATIO_CELL(g.r15)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{RATIO_CELL(g.r20)}</td>
                  </tr>
                );
              })}
              {!ownerSorted.length && <tr><td style={TD_} colSpan={7}>No data</td></tr>}
            </tbody>
          </table>
        </div>

        {/* ── fleet stats summary (replaces the old separate operator card) ── */}
        <div style={{ ...CARD, maxHeight:440, overflow:"auto" }}>
          <div style={{ ...LABEL, marginBottom:10 }}>Fleet Stats {selectMode && <span style={SUBLABEL}>(reflects current selection)</span>}</div>
          <div style={{ display:"flex", gap:20, marginBottom:14 }}>
            <div><div style={{ fontSize:22, fontWeight:800, color:C.tx }}>{fleetStats.count}</div><div style={LABEL}>Ships</div></div>
            <div><div style={{ fontSize:22, fontWeight:800, color:C.amber }}>{fleetStats.avgAge!=null?fleetStats.avgAge.toFixed(1):"—"}</div><div style={LABEL}>Avg Age</div></div>
          </div>

          {[
            ["IMO Type", fleetStats.imoBreakdown, IMO_COLORS],
            ["Coating", fleetStats.coatingBreakdown, COATING_COLORS],
            ["Ice Class", fleetStats.iceBreakdown, {}],
            ["Segment", fleetStats.segmentBreakdown, {}],
          ].map(([title, items, colors]) => (
            <div key={title} style={{ marginBottom:12 }}>
              <div style={{ ...LABEL, marginBottom:5 }}>{title}</div>
              {items.length ? items.map(it => (
                <div key={it.label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, marginBottom:3 }}>
                  <span style={{ width:110, color: colors[it.label]||C.tx, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={it.label}>{it.label}</span>
                  <div style={{ flex:1, height:10, background:C.bg3, borderRadius:3, overflow:"hidden" }}>
                    <div style={{ width:(it.share*100)+"%", height:"100%", background:colors[it.label]||"#58a6ff", borderRadius:3 }}/>
                  </div>
                  <span style={{ width:70, textAlign:"right", color:C.dim }}>{it.value} ({(it.share*100).toFixed(0)}%)</span>
                </div>
              )) : <div style={{ fontSize:11, color:C.faint }}>No data</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── full vessel table ── */}
      <div style={{ ...CARD, padding:0, overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid "+C.bd, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={LABEL}>Vessels ({sorted.length})</span>
          {totalPages > 1 && (
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button style={CHIP(false)} disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>‹ Prev</button>
              <span style={{ fontSize:11, color:C.faint }}>Page {page} / {totalPages}</span>
              <button style={CHIP(false)} disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next ›</button>
            </div>
          )}
        </div>
        <div style={{ overflowX:"auto", maxHeight:600, overflowY:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead style={{ position:"sticky", top:0, background:C.bg2, zIndex:1 }}>
              <tr>
                {selectMode && <th style={TH_}></th>}
                <SortTH label="Vessel" k="vessel" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Coating" k="coating" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Segment" k="segment" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Built" k="built" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Age" k="age" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="DWT" k="dwt" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="CBM" k="cbm" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="LOA" k="loa" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Beam" k="beam" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Draft" k="draft" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Segs" k="segs" align="right" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Flag" k="flag" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Ice" k="ice_class" sortState={sort} onSort={toggleSort}/>
                <SortTH label="IMO Type" k="imo_type" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Last Ex Name" k="last_ex_name" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Notes" k="comments" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Operator" k="operator" sortState={sort} onSort={toggleSort}/>
                <SortTH label="Owner/Manager" k="owner" sortState={sort} onSort={toggleSort}/>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r => {
                const key = vesselKey(r);
                const checked = selectedKeys.has(key);
                return (
                  <tr key={key} style={{ height:30, opacity: selectMode && !checked ? 0.4 : 1 }}>
                    {selectMode && (
                      <td style={{ ...TD_, width:24, cursor:"pointer" }} onClick={()=>toggleVesselSelected(key)}>
                        <input type="checkbox" checked={checked} onChange={()=>toggleVesselSelected(key)}/>
                      </td>
                    )}
                    <td style={{ ...TD_, color:C.tx, fontWeight:600 }} title={r.vessel}>{r.vessel}</td>
                    <td style={{ ...TD_, color:COATING_COLORS[r.coating]||C.dim }}>{r.coating||"—"}</td>
                    <td style={{ ...TD_, color:r.segment?.color||C.faint }}>{r.segment?.label||"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.built||"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.age??"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{fmtN(r.dwt)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{fmtN(r.cbm)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.loa||"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.beam||"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.draft??"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{r.segs||"—"}</td>
                    <td style={TD_}>{r.flag||"—"}</td>
                    <td style={TD_}>{r.ice_class||"—"}</td>
                    <td style={{ ...TD_, color:IMO_COLORS[r.imo_type]||C.dim }}>{r.imo_type||"—"}</td>
                    <td style={TD_} title={r.last_ex_name||""}>{r.last_ex_name||"—"}</td>
                    <td style={TD_} title={r.comments||""}>{r.comments||"—"}</td>
                    <td style={TD_} title={r.operator||""}>{r.operator||"—"}</td>
                    <td style={TD_} title={r.owner||""}>{r.owner||"—"}</td>
                  </tr>
                );
              })}
              {!pageRows.length && !loading && (
                <tr><td style={TD_} colSpan={18}>No vessels match current search/filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
