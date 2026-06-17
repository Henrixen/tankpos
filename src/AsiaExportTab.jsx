import React, { useState, useEffect, useMemo } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

/* ============================================================
   Asia Export  —  Palms & Bio  Asia → Europe  one-pager
   Mirrors the Steem bi-weekly structure, condensed to a single
   print page. Inline SVG charts (no deps). Dark-navy tokens.
   Cargoes can be imported from the live cargo list.
   ============================================================ */

// Supabase table:  asia_export_reports
//   id, report_date, week_label, commentary,
//   assessment (jsonb), curve (jsonb), bunkers (jsonb),
//   fixtures (jsonb), quotes (jsonb), created_at

const DEFAULT_ASSESSMENT = [
  { seg: "Parcel cargoes", cur: "", prior: "", unit: "pmt" },
  { seg: "Inter-J19 size", cur: "", prior: "", unit: "pmt" },
  { seg: "MR size", cur: "", prior: "", unit: "pmt" },
  { seg: "TCT (MR)", cur: "", prior: "", unit: "pd" },
];

// Freight-curve points: label + value (USD pmt). Editable.
const DEFAULT_CURVE = [
  { k: "Parcel", v: 140 },
  { k: "Inter-J19", v: 110 },
  { k: "MR", v: 75 },
];

const DEFAULT_BUNKERS = [
  { port: "Singapore", vlsfo: "", mgo: "" },
  { port: "Rotterdam", vlsfo: "", mgo: "" },
  { port: "Fujairah", vlsfo: "", mgo: "" },
];

const FIX_GROUPS = ["Sub 20k", "MR", "TCT", "Quoted"];

const blankFixture = (group = "Sub 20k") => ({
  group, charterer: "", vessel: "", qty: "", cargo: "",
  load: "", disch: "", laycan: "", rate: "",
});

function AsiaExportTab({ cargoes = [] }) {
  const [view, setView] = useState("list"); // list | edit
  const [reportId, setReportId] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [weekLabel, setWeekLabel] = useState("");
  const [commentary, setCommentary] = useState("");
  const [assessment, setAssessment] = useState(DEFAULT_ASSESSMENT);
  const [curve, setCurve] = useState(DEFAULT_CURVE);
  const [bunkers, setBunkers] = useState(DEFAULT_BUNKERS);
  const [fixtures, setFixtures] = useState([]);
  const [saved, setSaved] = useState([]);
  const [status, setStatus] = useState(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { loadList(); }, []);

  const flash = (t, type = "success") => {
    setStatus({ t, type });
    setTimeout(() => setStatus(null), 2500);
  };

  const loadList = async () => {
    try {
      const { data, error } = await supabase
        .from("asia_export_reports")
        .select("id, report_date, week_label, created_at")
        .order("report_date", { ascending: false });
      if (error) throw error;
      setSaved(data || []);
    } catch (e) { console.error("load list", e); }
  };

  const newReport = () => {
    setReportId(null);
    setReportDate(new Date().toISOString().split("T")[0]);
    setWeekLabel("");
    setCommentary("");
    setAssessment(DEFAULT_ASSESSMENT.map(a => ({ ...a })));
    setCurve(DEFAULT_CURVE.map(c => ({ ...c })));
    setBunkers(DEFAULT_BUNKERS.map(b => ({ ...b })));
    setFixtures([]);
    setView("edit");
  };

  const openReport = async (id) => {
    try {
      const { data, error } = await supabase
        .from("asia_export_reports").select("*").eq("id", id).single();
      if (error) throw error;
      setReportId(data.id);
      setReportDate(data.report_date);
      setWeekLabel(data.week_label || "");
      setCommentary(data.commentary || "");
      setAssessment(data.assessment?.length ? data.assessment : DEFAULT_ASSESSMENT.map(a => ({ ...a })));
      setCurve(data.curve?.length ? data.curve : DEFAULT_CURVE.map(c => ({ ...c })));
      setBunkers(data.bunkers?.length ? data.bunkers : DEFAULT_BUNKERS.map(b => ({ ...b })));
      setFixtures(data.fixtures || []);
      setView("edit");
    } catch (e) { console.error("open", e); flash("Could not open report", "error"); }
  };

  const save = async () => {
    const payload = {
      report_date: reportDate, week_label: weekLabel, commentary,
      assessment, curve, bunkers, fixtures,
    };
    try {
      if (reportId) {
        const { error } = await supabase.from("asia_export_reports").update(payload).eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("asia_export_reports").insert([payload]).select("id").single();
        if (error) throw error;
        setReportId(data.id);
      }
      flash("Saved");
      loadList();
    } catch (e) { console.error("save", e); flash("Save failed", "error"); }
  };

  const del = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this report?")) return;
    try {
      const { error } = await supabase.from("asia_export_reports").delete().eq("id", id);
      if (error) throw error;
      if (id === reportId) newReport();
      loadList();
      flash("Deleted");
    } catch (e2) { console.error("del", e2); flash("Delete failed", "error"); }
  };

  // ---- assessment helpers ----
  const setAss = (i, field, val) => setAssessment(p => p.map((r, j) => j === i ? { ...r, [field]: val } : r));

  // ---- curve helpers ----
  const setCurveVal = (i, field, val) => setCurve(p => p.map((c, j) => j === i ? { ...c, [field]: field === "v" ? (val === "" ? "" : Number(val)) : val } : c));
  const addCurve = () => setCurve(p => [...p, { k: "New", v: 0 }]);
  const rmCurve = (i) => setCurve(p => p.filter((_, j) => j !== i));

  // ---- bunkers ----
  const setBunk = (i, field, val) => setBunkers(p => p.map((b, j) => j === i ? { ...b, [field]: val } : b));

  // ---- fixtures ----
  const addFix = (group) => setFixtures(p => [...p, blankFixture(group)]);
  const setFix = (i, field, val) => setFixtures(p => p.map((f, j) => j === i ? { ...f, [field]: val } : f));
  const rmFix = (i) => setFixtures(p => p.filter((_, j) => j !== i));

  const importCargoes = (selected) => {
    const mapped = selected.map(cg => ({
      group: guessGroup(cg.qty),
      charterer: cg.charterer || "",
      vessel: cg.vessel || "TBN",
      qty: cg.qty || "",
      cargo: cg.cargo || cg.product || "",
      load: cg.load || "",
      disch: cg.disch || "",
      laycan: [cg.from, cg.to].filter(Boolean).join("–"),
      rate: cg.freight || "",
    }));
    setFixtures(p => [...p, ...mapped]);
    setShowImport(false);
    flash(`Imported ${mapped.length} cargo${mapped.length === 1 ? "" : "es"}`);
  };

  // ============================ LIST VIEW ============================
  if (view === "list") {
    return (
      <div style={{ display: "flex", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
        <div style={{ width: 260, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, overflowY: "auto" }}>
          <div style={head}>Asia Export Reports</div>
          <button onClick={newReport} style={primaryBtn}>+ New Report</button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {saved.map(r => (
              <div key={r.id} onClick={() => openReport(r.id)}
                style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 6, padding: "8px 10px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{r.week_label || "Asia → Europe"}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                </div>
                <button onClick={(e) => del(r.id, e)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            ))}
            {saved.length === 0 && <div style={{ fontSize: 11, color: C.faint, padding: 8 }}>No reports yet.</div>}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: C.tx }}>Palms &amp; Bio · Asia → Europe</div>
            <div style={{ fontSize: 12, color: C.faint }}>Create a new report or open one from the list.</div>
          </div>
        </div>
      </div>
    );
  }

  // ============================ EDIT VIEW ============================
  return (
    <div style={{ display: "flex", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
      {/* sidebar */}
      <div style={{ width: 220, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, overflowY: "auto", flexShrink: 0 }}>
        <div style={head}>Reports</div>
        <button onClick={newReport} style={primaryBtn}>+ New</button>
        <button onClick={() => setView("list")} style={{ ...ghostBtn, marginTop: 8 }}>← All reports</button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {saved.map(r => (
            <div key={r.id} onClick={() => openReport(r.id)}
              style={{ background: r.id === reportId ? "rgba(88,166,255,.12)" : C.bg, border: "1px solid " + (r.id === reportId ? C.blue : C.bd), borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{r.week_label || "Asia → Europe"}</div>
              <div style={{ fontSize: 10, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* main */}
      <div className="ae-page" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <PrintStyles />

        {/* header bar */}
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.blue }}>Palms &amp; Bio · Asia → Europe</span>
            <input value={weekLabel} onChange={e => setWeekLabel(e.target.value)} placeholder="Week 22 & 23"
              style={{ ...inp, width: 140 }} />
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{ ...inp, width: 150 }} />
          </div>
          <div className="ae-noprint" style={{ display: "flex", gap: 8 }}>
            {status && <span style={{ alignSelf: "center", fontSize: 11, fontWeight: 700, color: status.type === "error" ? C.red : C.green }}>{status.t}</span>}
            <button onClick={save} style={greenBtn}>Save</button>
            <button onClick={() => window.print()} style={blueBtn}>Print</button>
          </div>
        </div>

        {/* assessment + curve side by side */}
        <div className="ae-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* assessment */}
          <div style={card}>
            <div style={cardTitle}>Assessment Asia → Europe</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Segment</th>
                  <th style={{ ...th, textAlign: "right" }}>Current</th>
                  <th style={{ ...th, textAlign: "right" }}>Prior</th>
                  <th style={{ ...th, textAlign: "center", width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {assessment.map((r, i) => {
                  const trend = trendOf(r.cur, r.prior);
                  return (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 700, color: C.tx }}>{r.seg}</td>
                      <td style={{ ...td, textAlign: "right", padding: "3px 4px" }}>
                        <input value={r.cur} onChange={e => setAss(i, "cur", e.target.value)} placeholder="135-145"
                          style={{ ...inp, textAlign: "right", width: "100%" }} />
                      </td>
                      <td style={{ ...td, textAlign: "right", padding: "3px 4px" }}>
                        <input value={r.prior} onChange={e => setAss(i, "prior", e.target.value)} placeholder="155-165"
                          style={{ ...inp, textAlign: "right", width: "100%", color: C.faint }} />
                      </td>
                      <td style={{ ...td, textAlign: "center", color: trend.color, fontWeight: 800 }}>{trend.arrow}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>USD pmt unless noted · TCT in $/day · arrow vs prior</div>
          </div>

          {/* freight curve chart */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={cardTitle}>Freight Curve (USD pmt)</div>
              <button onClick={addCurve} className="ae-noprint" style={miniBtn}>+ pt</button>
            </div>
            <BarChart data={curve} unit="" />
            <div className="ae-noprint" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {curve.map((c, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 24px", gap: 6 }}>
                  <input value={c.k} onChange={e => setCurveVal(i, "k", e.target.value)} style={inp} />
                  <input type="number" value={c.v} onChange={e => setCurveVal(i, "v", e.target.value)} style={{ ...inp, textAlign: "right" }} />
                  <button onClick={() => rmCurve(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* bunkers */}
        <div style={card}>
          <div style={cardTitle}>Bunker Prices (USD pmt)</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={th}>Port</th><th style={{ ...th, textAlign: "right" }}>VLSFO</th><th style={{ ...th, textAlign: "right" }}>MGO</th></tr>
            </thead>
            <tbody>
              {bunkers.map((b, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 700, color: C.tx }}>{b.port}</td>
                  <td style={{ ...td, textAlign: "right", padding: "3px 4px" }}>
                    <input value={b.vlsfo} onChange={e => setBunk(i, "vlsfo", e.target.value)} placeholder="805" style={{ ...inp, textAlign: "right", width: 80 }} />
                  </td>
                  <td style={{ ...td, textAlign: "right", padding: "3px 4px" }}>
                    <input value={b.mgo} onChange={e => setBunk(i, "mgo", e.target.value)} placeholder="1182" style={{ ...inp, textAlign: "right", width: 80 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* fixtures & quotes */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={cardTitle}>Fixtures / Quotes</div>
            <button onClick={() => setShowImport(true)} className="ae-noprint" style={amberBtn}>Import from Cargoes</button>
          </div>
          {FIX_GROUPS.map(group => {
            const rows = fixtures.map((f, idx) => ({ f, idx })).filter(x => x.f.group === group);
            return (
              <div key={group} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: "0.06em" }}>{group}</div>
                  <button onClick={() => addFix(group)} className="ae-noprint" style={miniBtn}>+ row</button>
                </div>
                {rows.length === 0
                  ? <div style={{ fontSize: 10, color: C.faint, padding: "2px 0 6px" }}>—</div>
                  : rows.map(({ f, idx }) => (
                    <div key={idx} className="ae-fixrow" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 0.7fr 1fr 0.9fr 0.9fr 1fr 0.9fr 22px", gap: 4, marginBottom: 3, alignItems: "center" }}>
                      <input value={f.charterer} onChange={e => setFix(idx, "charterer", e.target.value)} placeholder="Charterer" style={inp} />
                      <input value={f.vessel} onChange={e => setFix(idx, "vessel", e.target.value)} placeholder="Vessel" style={inp} />
                      <input value={f.qty} onChange={e => setFix(idx, "qty", e.target.value)} placeholder="Qty" style={inp} />
                      <input value={f.cargo} onChange={e => setFix(idx, "cargo", e.target.value)} placeholder="Cargo" style={inp} />
                      <input value={f.load} onChange={e => setFix(idx, "load", e.target.value)} placeholder="Load" style={inp} />
                      <input value={f.disch} onChange={e => setFix(idx, "disch", e.target.value)} placeholder="Disch" style={inp} />
                      <input value={f.laycan} onChange={e => setFix(idx, "laycan", e.target.value)} placeholder="Laycan" style={inp} />
                      <input value={f.rate} onChange={e => setFix(idx, "rate", e.target.value)} placeholder="Rate" style={{ ...inp, fontWeight: 700 }} />
                      <button onClick={() => rmFix(idx)} className="ae-noprint" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>

        {/* commentary */}
        <div style={card}>
          <div style={cardTitle}>Market Commentary</div>
          <textarea value={commentary} onChange={e => setCommentary(e.target.value)}
            placeholder="Market tone, palm/bio flows, sentiment, outlook…"
            style={{ width: "100%", minHeight: 90, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: 10, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
        </div>
      </div>

      {/* import modal */}
      {showImport && <ImportModal cargoes={cargoes} onClose={() => setShowImport(false)} onImport={importCargoes} />}
    </div>
  );
}

/* ----------------- Import modal ----------------- */
function ImportModal({ cargoes, onClose, onImport }) {
  const [checked, setChecked] = useState({});
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cargoes.filter(c => !term ||
      [c.vessel, c.charterer, c.cargo, c.load, c.disch].some(v => (v || "").toLowerCase().includes(term)));
  }, [cargoes, q]);
  const toggle = (id) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const selected = list.filter(c => checked[c.id]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 10, padding: 16, width: 640, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Import from Cargoes</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter…" style={{ ...inp, marginBottom: 8 }} />
        <div style={{ overflowY: "auto", flex: 1, border: "1px solid " + C.bd, borderRadius: 6 }}>
          {list.map(c => (
            <div key={c.id} onClick={() => toggle(c.id)}
              style={{ display: "flex", gap: 8, padding: "6px 10px", cursor: "pointer", borderBottom: "1px solid " + C.bg2, background: checked[c.id] ? "rgba(88,166,255,.10)" : "transparent" }}>
              <input type="checkbox" readOnly checked={!!checked[c.id]} />
              <div style={{ fontSize: 11, color: C.tx }}>
                <span style={{ fontWeight: 700, color: C.amber }}>{c.charterer || "—"}</span>
                {" / "}{c.vessel || "TBN"}{" / "}{c.qty || "—"}{" / "}{c.cargo || "—"}
                {" / "}{c.load || "?"}→{c.disch || "?"}
                {c.freight && <span style={{ fontWeight: 700, color: C.tx }}>{" / " + c.freight}</span>}
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ padding: 16, textAlign: "center", color: C.faint, fontSize: 11 }}>No cargoes match.</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 11, color: C.dim }}>{selected.length} selected</span>
          <button onClick={() => onImport(selected)} disabled={!selected.length}
            style={{ ...blueBtn, opacity: selected.length ? 1 : 0.4, cursor: selected.length ? "pointer" : "default" }}>
            Import {selected.length || ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------- inline SVG bar chart (Dashboard style) ----------------- */
function BarChart({ data }) {
  const W = 360, H = 150, PL = 28, PR = 10, PT = 10, PB = 26;
  const vals = data.map(d => Number(d.v) || 0);
  const max = Math.max(10, ...vals) * 1.1;
  const bw = (W - PL - PR) / Math.max(1, data.length);
  const palette = [C.blue, C.green, C.amber, C.purple, "#ff9f43", "#4fc3f7"];
  const ticks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = (max / ticks) * i;
        const y = H - PB - (v / max) * (H - PT - PB);
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={C.bd2} strokeWidth="1" />
            <text x={PL - 4} y={y + 3} fill={C.faint} fontSize="8" textAnchor="end">{Math.round(v)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const v = Number(d.v) || 0;
        const h = (v / max) * (H - PT - PB);
        const x = PL + bw * i + bw * 0.18;
        const y = H - PB - h;
        const col = palette[i % palette.length];
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw * 0.64} height={h} rx="2" fill={col} opacity="0.85" />
            <text x={x + bw * 0.32} y={y - 3} fill={C.tx} fontSize="9" fontWeight="700" textAnchor="middle">{v}</text>
            <text x={x + bw * 0.32} y={H - PB + 12} fill={C.faint} fontSize="8" textAnchor="middle">{d.k}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ----------------- print styles ----------------- */
function PrintStyles() {
  return (
    <style>{`
      @media print {
        .ae-noprint { display: none !important; }
        .ae-split { grid-template-columns: 1fr 1fr !important; }
        body { background: #fff; }
      }
    `}</style>
  );
}

/* ----------------- helpers ----------------- */
function firstNum(s) {
  const m = String(s || "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function trendOf(cur, prior) {
  const a = firstNum(cur), b = firstNum(prior);
  if (a == null || b == null) return { arrow: "—", color: C.faint };
  if (a > b) return { arrow: "▲", color: C.green };
  if (a < b) return { arrow: "▼", color: C.red };
  return { arrow: "=", color: C.dim };
}
function guessGroup(qty) {
  const n = firstNum(qty);
  if (n == null) return "Sub 20k";
  if (n < 20000) return "Sub 20k";
  return "MR";
}

/* ----------------- shared styles ----------------- */
const card = { background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 14 };
const cardTitle = { fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 10 };
const head = { fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 };
const th = { padding: "5px 6px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.bd };
const td = { padding: "5px 6px", fontSize: 12, color: C.tx, borderBottom: "1px solid " + C.bg3 };
const inp = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "5px 7px", outline: "none", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const primaryBtn = { width: "100%", background: "linear-gradient(135deg,#667eea,#764ba2)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 12px", cursor: "pointer" };
const ghostBtn = { width: "100%", background: "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: C.dim, fontSize: 11, padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" };
const greenBtn = { background: "linear-gradient(135deg,#3fb950,#2ecc71)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer" };
const blueBtn = { background: "linear-gradient(135deg,#667eea,#764ba2)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer" };
const amberBtn = { background: "linear-gradient(135deg,#f5a623,#f39c12)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer" };
const miniBtn = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.dim, fontSize: 10, fontWeight: 700, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" };

export default AsiaExportTab;
