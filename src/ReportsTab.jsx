import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

const REPORT_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter"];

function ReportsTab({ selectedVessels = [], selectedCargoes = [] }) {
  const [reportType, setReportType] = useState("");
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [commentary, setCommentary] = useState("");
  const [rateGrid, setRateGrid] = useState({});
  const [tceEarnings, setTceEarnings] = useState({});
  const [fixtures, setFixtures] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [savedReports, setSavedReports] = useState([]);

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    if (selectedVessels.length > 0 || selectedCargoes.length > 0) {
      setShowTypeSelector(true);
    }
  }, [selectedVessels, selectedCargoes]);

  const loadReports = async () => {
    try {
      const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setSavedReports(data || []);
    } catch (err) {
      console.error("Error loading reports:", err);
    }
  };

  const selectReportType = (type) => {
    setReportType(type);
    setShowTypeSelector(false);
    initializeRateGrid(type);
  };

  const initializeRateGrid = (type) => {
    let defaultGrid = {};
    if (type === "Intermediate") {
      defaultGrid = {
        "5kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" },
        "10kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" },
        "18kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" },
      };
    } else if (type === "Asia to Europe") {
      defaultGrid = {
        "25kt": { "Singapore-ARA": "", "China-ARA": "" },
        "35kt": { "Singapore-ARA": "", "China-ARA": "" },
        "45kt": { "Singapore-ARA": "", "China-ARA": "" },
      };
    } else if (type === "Transatlantic") {
      defaultGrid = {
        "30kt": { "ARA-USG": "", "USG-ARA": "" },
        "37kt": { "ARA-USG": "", "USG-ARA": "" },
      };
    } else if (type === "TimeCharter") {
      defaultGrid = {
        "12m": { "10k": "", "15k": "", "20k": "" },
        "24m": { "10k": "", "15k": "", "20k": "" },
      };
    }
    setRateGrid(defaultGrid);
  };

  const handleRateChange = (size, route, value) => {
    setRateGrid(prev => ({ ...prev, [size]: { ...prev[size], [route]: value } }));
  };

  const handleTCEChange = (segment, value) => {
    setTceEarnings(prev => ({ ...prev, [segment]: value }));
  };

  const addFixture = () => {
    setFixtures([...fixtures, { vessel: "", charterer: "", route: "", qty: "", rate: "", date: "" }]);
  };

  const updateFixture = (index, field, value) => {
    const updated = [...fixtures];
    updated[index][field] = value;
    setFixtures(updated);
  };

  const removeFixture = (index) => {
    setFixtures(fixtures.filter((_, i) => i !== index));
  };

  const addQuote = () => {
    setQuotes([...quotes, { route: "", size: "", rate: "", basis: "" }]);
  };

  const updateQuote = (index, field, value) => {
    const updated = [...quotes];
    updated[index][field] = value;
    setQuotes(updated);
  };

  const removeQuote = (index) => {
    setQuotes(quotes.filter((_, i) => i !== index));
  };

  const saveReport = async () => {
    try {
      const reportData = {
        report_type: reportType,
        report_date: reportDate,
        commentary,
        rate_grid: rateGrid,
        tce_earnings: tceEarnings,
        fixtures,
        quotes,
        selected_vessels: selectedVessels,
        selected_cargoes: selectedCargoes,
      };
      const { error } = await supabase.from("reports").insert([reportData]);
      if (error) throw error;
      alert("Report saved successfully");
      loadReports();
    } catch (err) {
      console.error("Error saving report:", err);
      alert("Error saving report");
    }
  };

  const loadReport = async (reportId) => {
    try {
      const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).single();
      if (error) throw error;
      setReportType(data.report_type);
      setReportDate(data.report_date);
      setCommentary(data.commentary || "");
      setRateGrid(data.rate_grid || {});
      setTceEarnings(data.tce_earnings || {});
      setFixtures(data.fixtures || []);
      setQuotes(data.quotes || []);
    } catch (err) {
      console.error("Error loading report:", err);
    }
  };

  const exportReport = () => {
    window.print();
  };

  const copyReport = async () => {
    try {
      const text = `${reportType} Market Report - ${reportDate}\n\n${commentary}`;
      await navigator.clipboard.writeText(text);
      alert("Report copied to clipboard");
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  if (showTypeSelector) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: C.bg }}>
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 12, padding: 32, maxWidth: 600, width: "100%" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.blue, marginBottom: 8, textAlign: "center" }}>
            Select Report Type
          </div>
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 24, textAlign: "center" }}>
            {selectedVessels.length > 0 && `${selectedVessels.length} vessel(s) selected`}
            {selectedCargoes.length > 0 && ` · ${selectedCargoes.length} cargo(es) selected`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {REPORT_TYPES.map(type => (
              <button
                key={type}
                onClick={() => selectReportType(type)}
                style={{
                  background: "linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)",
                  border: "1px solid " + C.bd,
                  borderRadius: 8,
                  padding: "20px 16px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)";
                  e.currentTarget.style.borderColor = C.blue;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)";
                  e.currentTarget.style.borderColor = C.bd;
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{type}</div>
                <div style={{ fontSize: 11, color: C.dim }}>Create {type.toLowerCase()} report</div>
              </button>
            ))}
          </div>
          <button onClick={() => setShowTypeSelector(false)} style={{ width: "100%", marginTop: 16, background: "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: C.dim, fontSize: 12, padding: "8px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!reportType) {
    return (
      <div style={{ display: "flex", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
        <div style={{ width: 240, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Saved Reports
          </div>
          <button onClick={() => setShowTypeSelector(true)} style={{ width: "100%", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 12px", cursor: "pointer", marginBottom: 12, boxShadow: "0 2px 8px rgba(102,126,234,0.3)" }}>
            + New Report
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {savedReports.map(r => (
              <div key={r.id} onClick={() => loadReport(r.id)} style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 6, padding: "8px 10px", cursor: "pointer", transition: "all 0.15s" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 2 }}>{r.report_type}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{new Date(r.created_at).toLocaleDateString("en-GB")}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Report Selected</div>
            <div style={{ fontSize: 13, color: C.faint }}>Create a new report or select one from the sidebar</div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate average rates for KPI cards
  const avgRate = Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).length) || 0;
  const avgTCE = Object.values(tceEarnings).filter(v => v).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(tceEarnings).filter(v => v).length) || 0;

  return (
    <div style={{ display: "flex", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
      {/* Sidebar */}
      <div style={{ width: 240, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Saved Reports
        </div>
        <button onClick={() => { setReportType(""); setCommentary(""); setFixtures([]); setQuotes([]); setTceEarnings({}); }} style={{ width: "100%", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 12px", cursor: "pointer", marginBottom: 12, boxShadow: "0 2px 8px rgba(102,126,234,0.3)" }}>
          + New Report
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {savedReports.map(r => (
            <div key={r.id} onClick={() => loadReport(r.id)} style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 6, padding: "8px 10px", cursor: "pointer" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 2 }}>{r.report_type}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{new Date(r.created_at).toLocaleDateString("en-GB")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content - MODERN DASHBOARD STYLE */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        {/* Header with buttons */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.blue }}>{reportType}</span>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveReport} style={{ background: "linear-gradient(135deg, #3fb950 0%, #2ecc71 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(63,185,80,0.3)" }}>Save Report</button>
            <button onClick={exportReport} style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(102,126,234,0.3)" }}>Print</button>
            <button onClick={copyReport} style={{ background: "linear-gradient(135deg, #f5a623 0%, #f39c12 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(245,166,35,0.3)" }}>Copy</button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div style={{ background: "linear-gradient(135deg, rgba(102,126,234,0.12) 0%, rgba(118,75,162,0.12) 100%)", border: "1px solid rgba(102,126,234,0.3)", borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Average Rate</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.blue }}>{avgRate > 0 ? avgRate.toFixed(0) : "—"}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>WS Points</div>
          </div>

          <div style={{ background: "linear-gradient(135deg, rgba(63,185,80,0.12) 0%, rgba(46,204,113,0.12) 100%)", border: "1px solid rgba(63,185,80,0.3)", borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Average TCE</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#3fb950" }}>{avgTCE > 0 ? `$${avgTCE.toFixed(0)}` : "—"}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>per day</div>
          </div>

          <div style={{ background: "linear-gradient(135deg, rgba(245,166,35,0.12) 0%, rgba(243,156,18,0.12) 100%)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Market Activity</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f5a623" }}>{fixtures.length + quotes.length}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>{fixtures.length} fixtures · {quotes.length} quotes</div>
          </div>
        </div>

        {/* Rate Grid */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Freight Rates</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Size</th>
                  {Object.keys(rateGrid).length > 0 && Object.keys(Object.values(rateGrid)[0] || {}).map(route => (
                    <th key={route} style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: "0.08em" }}>{route}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(rateGrid).map((size, i) => (
                  <tr key={size}>
                    <td style={{ padding: "8px 12px", background: C.bg3, borderRadius: "6px 0 0 6px", fontSize: 12, fontWeight: 700, color: C.tx }}>{size}</td>
                    {Object.keys(rateGrid[size]).map((route, j) => (
                      <td key={route} style={{ padding: "4px 8px", background: C.bg3, borderRadius: j === Object.keys(rateGrid[size]).length - 1 ? "0 6px 6px 0" : "0", textAlign: "center" }}>
                        <input
                          type="text"
                          value={rateGrid[size][route]}
                          onChange={e => handleRateChange(size, route, e.target.value)}
                          placeholder="WS"
                          style={{ width: "100%", background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: "6px 8px", textAlign: "center", outline: "none" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* TCE Earnings */}
        {reportType !== "TimeCharter" && (
          <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Indicative TCE Earnings ($/day)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {["10k", "15k", "20k"].map(seg => (
                <div key={seg}>
                  <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{seg}</label>
                  <input
                    type="text"
                    value={tceEarnings[seg] || ""}
                    onChange={e => handleTCEChange(seg, e.target.value)}
                    placeholder="$"
                    style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "10px 12px", outline: "none" }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commentary */}
        <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Market Commentary</div>
          <textarea
            value={commentary}
            onChange={e => setCommentary(e.target.value)}
            placeholder="Enter market analysis, trends, and outlook..."
            style={{ width: "100%", minHeight: 100, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: 12, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          />
        </div>

        {/* Fixtures & Quotes in grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Fixtures */}
          <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Recent Fixtures</div>
              <button onClick={addFixture} style={{ background: C.blue, border: "none", borderRadius: 4, color: C.bg, fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>+ Add</button>
            </div>
            {fixtures.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {fixtures.map((fix, i) => (
                  <div key={i} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 6 }}>
                      <input type="text" value={fix.vessel} onChange={e => updateFixture(i, "vessel", e.target.value)} placeholder="Vessel" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                      <button onClick={() => removeFixture(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                    <input type="text" value={fix.charterer} onChange={e => updateFixture(i, "charterer", e.target.value)} placeholder="Charterer" style={{ width: "100%", background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none", marginBottom: 6 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6 }}>
                      <input type="text" value={fix.route} onChange={e => updateFixture(i, "route", e.target.value)} placeholder="Route" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                      <input type="text" value={fix.qty} onChange={e => updateFixture(i, "qty", e.target.value)} placeholder="Qty" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                      <input type="text" value={fix.rate} onChange={e => updateFixture(i, "rate", e.target.value)} placeholder="Rate" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 11 }}>No fixtures added yet</div>
            )}
          </div>

          {/* Quotes */}
          <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>Market Quotes</div>
              <button onClick={addQuote} style={{ background: C.blue, border: "none", borderRadius: 4, color: C.bg, fontSize: 11, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>+ Add</button>
            </div>
            {quotes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {quotes.map((q, i) => (
                  <div key={i} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, padding: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginBottom: 6 }}>
                      <input type="text" value={q.route} onChange={e => updateQuote(i, "route", e.target.value)} placeholder="Route" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                      <button onClick={() => removeQuote(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14 }}>✕</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <input type="text" value={q.size} onChange={e => updateQuote(i, "size", e.target.value)} placeholder="Size" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                      <input type="text" value={q.rate} onChange={e => updateQuote(i, "rate", e.target.value)} placeholder="Rate" style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                    </div>
                    <input type="text" value={q.basis} onChange={e => updateQuote(i, "basis", e.target.value)} placeholder="Basis (ex-tank, FBG...)" style={{ width: "100%", background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 11 }}>No quotes added yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsTab;
