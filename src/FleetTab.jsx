import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { fmtN } from "./utils";

// ─── DWT → segment breakpoints — matches Barton's own classification as used
// in NewbuildsTab.jsx (NB_SEGMENTS), not the unrelated Fixing Window buckets ──
const FLEET_SEGMENTS = [
  { key:"small", label:"Small (<14)",   color:"#58a6ff", dwt:[0,      14000] },
  { key:"inter", label:"Inter (14-19)", color:"#4ade80", dwt:[14001,  19000] },
  { key:"j19",   label:"J19 (19-23)",   color:"#f778ba", dwt:[19001,  23000] },
  { key:"flexi", label:"Flexi (23-30)", color:"#ea9a00", dwt:[23001,  30000] },
  { key:"handy", label:"Handy (30-40)", color:"#a78bfa", dwt:[30001,  40000] },
  { key:"mr",    label:"MR (>40)",      color:"#22d3ee", dwt:[40001,  999999] },
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

function fmtUpdatedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

const SELECT_COLS = "vessel,imo,dwt,loa,beam,draft,cbm,coating,built,flag,imo_type,operator,owner,ice_class,fuel_type,tanks,segs,other_data,tier_name,comments,last_ex_name,country_build";

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

function Bar({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
      <div style={{ width:96, fontSize:11, color:C.dim, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={label}>{label}</div>
      <div style={{ flex:1, height:14, background:C.bg3, borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:pct+"%", height:"100%", background:color, borderRadius:3 }}/>
      </div>
      <div style={{ width:46, fontSize:11, fontWeight:700, color:C.tx, textAlign:"right" }}>{sub || value}</div>
    </div>
  );
}

function Donut({ segments, size=140 }) {
  const total = segments.reduce((a,s)=>a+s.value,0) || 1;
  const r = size/2 - 12, cx = size/2, cy = size/2, circ = 2*Math.PI*r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.bg3} strokeWidth={20}/>
      {segments.map((s,i) => {
        const frac = s.value/total;
        const dash = frac*circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={20}
            strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset}
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

function YearHistogram({ rows, height=140 }) {
  const byYear = {};
  rows.forEach(r => { if (r.built) byYear[r.built] = (byYear[r.built]||0)+1; });
  const years = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
  if (!years.length) return <div style={{ fontSize:12, color:C.faint }}>No built-year data</div>;
  const minY = years[0], maxY = years[years.length-1];
  const full = []; for (let y=minY; y<=maxY; y++) full.push(y);
  const max = Math.max(...full.map(y=>byYear[y]||0));
  const w = Math.max(360, full.length*14);
  return (
    <div style={{ overflowX:"auto" }}>
      <svg width={w} height={height+24} viewBox={`0 0 ${w} ${height+24}`}>
        {full.map((y,i) => {
          const v = byYear[y]||0;
          const barH = max>0 ? (v/max)*height : 0;
          const x = i*14;
          return (
            <g key={y}>
              <rect x={x+2} y={height-barH} width={10} height={barH} fill="#58a6ff" rx={1}/>
              {v>0 && <text x={x+7} y={height-barH-3} fontSize={8} fill={C.dim} textAnchor="middle">{v}</text>}
              {(y%5===0) && <text x={x+7} y={height+14} fontSize={8} fill={C.faint} textAnchor="middle">{y}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────
export default function FleetTab() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null); // {file_name, uploaded_at, row_count}

  const [search, setSearch] = useState("");
  const [scopes, setScopes] = useState(() => new Set(["vessel"]));
  const [coatingFilter, setCoatingFilter] = useState(() => new Set());
  const [segmentFilter, setSegmentFilter] = useState(() => new Set());
  const [iceFilter, setIceFilter] = useState(() => new Set());

  const [sort, setSort] = useState({ key:"vessel", dir:"asc" });
  const [expandedSeg, setExpandedSeg] = useState(() => new Set());
  const [expandedOwner, setExpandedOwner] = useState(null);
  const [ownerSort, setOwnerSort] = useState({ key:"ships", dir:"desc" });
  const [operatorSort, setOperatorSort] = useState({ key:"ships", dir:"desc" });

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
    async function fetchMeta() {
      const { data, error } = await supabase.from("upload_meta").select("*").eq("table_name","vessels_db").maybeSingle();
      if (error) { console.error("upload_meta fetch error:", error); return; }
      setLastUpdated(data || null);
    }
    fetchMeta();
  }, []);

  const enriched = useMemo(() => rows.map(r => ({
    ...r,
    age: ageOf(r.built),
    segment: segmentOf(r.dwt),
  })), [rows]);

  const coatingList = useMemo(() => [...new Set(enriched.map(r=>r.coating).filter(Boolean))].sort(), [enriched]);
  const iceList = useMemo(() => [...new Set(enriched.map(r=>r.ice_class).filter(Boolean))].sort(), [enriched]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return enriched.filter(r => {
      if (coatingFilter.size && !coatingFilter.has(r.coating)) return false;
      if (segmentFilter.size && !(r.segment && segmentFilter.has(r.segment.key))) return false;
      if (iceFilter.size && !iceFilter.has(r.ice_class)) return false;
      if (!term) return true;
      const fields = [];
      if (scopes.has("vessel"))   fields.push(r.vessel);
      if (scopes.has("operator")) fields.push(r.operator);
      if (scopes.has("owner"))    fields.push(r.owner);
      if (scopes.has("country"))  fields.push(r.country_build);
      if (scopes.has("notes"))    fields.push(r.comments, r.other_data);
      if (!fields.length) fields.push(r.vessel, r.operator, r.owner);
      return fields.some(f => f && String(f).toLowerCase().includes(term));
    });
  }, [enriched, search, scopes, coatingFilter, segmentFilter, iceFilter]);

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

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir==="asc"?"desc":"asc" } : { key, dir:"asc" });
  }
  function toggleSet(setter, val) {
    setter(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  }

  // ── stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const ages = filtered.map(r=>r.age).filter(a=>a!=null);
    const avgAge = ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null;
    return { count: filtered.length, avgAge };
  }, [filtered]);

  const coatingDonut = useMemo(() => {
    const m = {};
    filtered.forEach(r => { if (r.coating) m[r.coating] = (m[r.coating]||0)+1; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([label,value]) => ({ label, value, color: COATING_COLORS[label] || "#94a3b8" }));
  }, [filtered]);

  const imoBars = useMemo(() => {
    const m = { "IMO 1":0, "IMO 2":0, "IMO 3":0 };
    filtered.forEach(r => { if (r.imo_type && m[r.imo_type] != null) m[r.imo_type]++; });
    const max = Math.max(1, ...Object.values(m));
    return Object.entries(m).map(([label,value]) => ({ label, value, max, color: IMO_COLORS[label] }));
  }, [filtered]);

  const countryBars = useMemo(() => {
    const m = {};
    filtered.forEach(r => { if (r.country_build) m[r.country_build] = (m[r.country_build]||0)+1; });
    const top = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const max = Math.max(1, ...top.map(([,v])=>v));
    return top.map(([label,value]) => ({ label, value, max }));
  }, [filtered]);

  // ── segment / age-profile table ───────────────────────────────────────
  const segStats = useMemo(() => {
    return FLEET_SEGMENTS.map(seg => {
      const segRows = filtered.filter(r => r.segment?.key === seg.key);
      const ages = segRows.map(r=>r.age).filter(a=>a!=null);
      const avgAge = ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : null;
      const n15 = ages.filter(a=>a>15).length, n20 = ages.filter(a=>a>20).length, n25 = ages.filter(a=>a>25).length;
      const byCoating = {};
      segRows.forEach(r => { if (r.coating) byCoating[r.coating] = (byCoating[r.coating]||0)+1; });
      return {
        ...seg, ships: segRows.length, avgAge, n15, n20, n25,
        r15: segRows.length ? n15/segRows.length : 0,
        r20: segRows.length ? n20/segRows.length : 0,
        r25: segRows.length ? n25/segRows.length : 0,
        coatings: Object.entries(byCoating).sort((a,b)=>b[1]-a[1]),
      };
    }).filter(s => s.ships > 0);
  }, [filtered]);

  // ── owner / operator roll-ups ─────────────────────────────────────────
  function rollUp(rows, keyField) {
    const m = {};
    rows.forEach(r => {
      const k = r[keyField]; if (!k) return;
      if (!m[k]) m[k] = { name:k, ships:0, dwt:0, ages:[], n15:0, n20:0, n25:0 };
      const g = m[k];
      g.ships++; g.dwt += r.dwt||0;
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
  }
  const ownerRollup = useMemo(() => rollUp(filtered, "owner"), [filtered]);
  const operatorRollup = useMemo(() => rollUp(filtered, "operator"), [filtered]);

  function sortRollup(list, { key, dir }) {
    const mul = dir==="asc"?1:-1;
    return [...list].sort((a,b) => {
      let av=a[key], bv=b[key];
      if (typeof av === "string") return (av||"").localeCompare(bv||"") * mul;
      av = av ?? -Infinity; bv = bv ?? -Infinity;
      return (av-bv)*mul;
    });
  }
  const ownerSorted = useMemo(() => sortRollup(ownerRollup, ownerSort), [ownerRollup, ownerSort]);
  const operatorSorted = useMemo(() => sortRollup(operatorRollup, operatorSort), [operatorRollup, operatorSort]);

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

      {/* ── search + filters ── */}
      <div style={{ ...CARD, display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="🔍 Search fleet…"
            style={{ background:C.bg3, border:"1px solid "+C.bd, borderRadius:6, color:C.tx, fontFamily:"inherit",
              fontSize:13, padding:"8px 12px", outline:"none", minWidth:240, flex:"0 1 320px" }}
          />
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
                Updated {fmtUpdatedAt(lastUpdated.uploaded_at)} · {lastUpdated.file_name||"—"}
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
          {(coatingFilter.size||segmentFilter.size||iceFilter.size) > 0 && (
            <button style={{ ...CHIP(true,"#ff6b6b"), marginLeft:"auto" }}
              onClick={()=>{ setCoatingFilter(new Set()); setSegmentFilter(new Set()); setIceFilter(new Set()); }}>
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── charts row ── */}
      <div style={{ display:"grid", gridTemplateColumns:"minmax(220px,280px) minmax(220px,280px) 1fr", gap:16 }}>
        <div style={CARD}>
          <div style={LABEL}>Coating</div>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:8 }}>
            <Donut segments={coatingDonut}/>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {coatingDonut.map(s => (
                <div key={s.label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.dim }}>
                  <span style={{ width:9, height:9, borderRadius:2, background:s.color, display:"inline-block" }}/>
                  {s.label} <b style={{ color:C.tx }}>{s.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>IMO Type</div>
          <div style={{ marginTop:12 }}>
            {imoBars.map(b => <Bar key={b.label} label={b.label} value={b.value} max={b.max} color={b.color}/>)}
          </div>
          <div style={{ ...LABEL, marginTop:14 }}>Country Built</div>
          <div style={{ marginTop:8 }}>
            {countryBars.map(b => <Bar key={b.label} label={b.label} value={b.value} max={b.max} color="#4fc3f7"/>)}
            {!countryBars.length && <div style={{ fontSize:11, color:C.faint }}>No data</div>}
          </div>
        </div>

        <div style={CARD}>
          <div style={LABEL}>Built Year</div>
          <div style={{ marginTop:8 }}><YearHistogram rows={filtered}/></div>
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
                {expandedSeg.has(s.key) && s.coatings.map(([cname,cval]) => (
                  <tr key={cname}>
                    <td style={{ ...TD_, paddingLeft:26, color:COATING_COLORS[cname]||C.faint }}>{cname}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{cval}</td>
                    <td colSpan={7} style={TD_}/>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {!segStats.length && <tr><td style={TD_} colSpan={9}>No vessels match current filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── owner / operator roll-ups ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {[
          ["Owner / Manager", ownerSorted, ownerSort, setOwnerSort],
          ["Operator", operatorSorted, operatorSort, setOperatorSort],
        ].map(([title, list, sState, sSet]) => (
          <div key={title} style={{ ...CARD, maxHeight:420, overflow:"auto" }}>
            <div style={{ ...LABEL, marginBottom:8 }}>{title}</div>
            <table style={{ borderCollapse:"collapse", width:"100%" }}>
              <thead><tr>
                <SortTH label={title==="Owner / Manager"?"Owner":"Operator"} k="name" sortState={sState} onSort={k=>sSet(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"})}/>
                <SortTH label="Ships" k="ships" align="right" sortState={sState} onSort={k=>sSet(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
                <SortTH label="DWT" k="dwt" align="right" sortState={sState} onSort={k=>sSet(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
                <SortTH label="Avg age" k="avgAge" align="right" sortState={sState} onSort={k=>sSet(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"})}/>
                <SortTH label=">15yrs" k="r15" align="right" sortState={sState} onSort={k=>sSet(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
                <SortTH label=">20yrs" k="r20" align="right" sortState={sState} onSort={k=>sSet(s=>s.key===k?{key:k,dir:s.dir==="asc"?"desc":"asc"}:{key:k,dir:"desc"})}/>
              </tr></thead>
              <tbody>
                {list.map(g => (
                  <tr key={g.name}>
                    <td style={{ ...TD_, color:C.tx, fontWeight:600, maxWidth:150 }} title={g.name}>{g.name}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{g.ships}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{fmtN(g.dwt)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{g.avgAge!=null?g.avgAge.toFixed(1):"—"}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{RATIO_CELL(g.r15)}</td>
                    <td style={{ ...TD_, textAlign:"right" }}>{RATIO_CELL(g.r20)}</td>
                  </tr>
                ))}
                {!list.length && <tr><td style={TD_} colSpan={6}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ── full vessel table ── */}
      <div style={{ ...CARD, padding:0, overflow:"hidden" }}>
        <div style={{ padding:"10px 16px", borderBottom:"1px solid "+C.bd, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={LABEL}>Vessels ({sorted.length})</span>
        </div>
        <div style={{ overflowX:"auto", maxHeight:600, overflowY:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead style={{ position:"sticky", top:0, background:C.bg2, zIndex:1 }}>
              <tr>
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
              {sorted.map(r => (
                <tr key={r.imo || r.vessel} style={{ height:30 }}>
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
              ))}
              {!sorted.length && !loading && (
                <tr><td style={TD_} colSpan={17}>No vessels match current search/filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
