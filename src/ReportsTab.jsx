import React, { useState, useEffect, useRef, useMemo } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { classifyRegion, fmtDateShort } from "./utils";
// Loaded from CDN so no package.json / npm install is required.
import { toPng, toBlob } from "https://esm.sh/html-to-image@1.11.13";

const REPORT_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter", "Position List"];

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

  // --- Position List specific state ---
  const [posGroupBy, setPosGroupBy] = useState("segment"); // 'segment' | 'region'
  const [posTitle, setPosTitle] = useState("CHEMS & SPECIALIZED POSITION LIST");
  const [posSubtitle, setPosSubtitle] = useState("10-22,000 DWT · COATED AND STST");
  const [posExportStatus, setPosExportStatus] = useState("");
  const posReportRef = useRef(null);

  function posRegionOf(v) {
    return v.superRegion || classifyRegion(v.openPort) || "Other";
  }

  const posGrouped = useMemo(() => {
    const key = posGroupBy === "region" ? posRegionOf : (v) => v.segment || "UNASSIGNED";
    const buckets = {};
    (selectedVessels || []).forEach((v) => {
      const k = key(v);
      if (!buckets[k]) buckets[k] = [];
      buckets[k].push(v);
    });
    return buckets;
  }, [selectedVessels, posGroupBy]);

  const posGroupCounts = useMemo(
    () => Object.entries(posGrouped).map(([label, rows]) => ({ label, count: rows.length })),
    [posGrouped]
  );

  async function copyPositionImage() {
    if (!posReportRef.current) return;
    setPosExportStatus("Copying...");
    try {
      const blob = await toBlob(posReportRef.current, { backgroundColor: C.bg, pixelRatio: 2 });
      if (!blob) throw new Error("No blob generated");
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      setPosExportStatus("Copied — paste directly into your email body.");
    } catch (e) {
      console.error(e);
      setPosExportStatus("Copy failed — try Download PNG instead.");
    }
  }

  async function downloadPositionPng() {
    if (!posReportRef.current) return;
    setPosExportStatus("Rendering PNG...");
    try {
      const dataUrl = await toPng(posReportRef.current, { backgroundColor: C.bg, pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `positions-report-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setPosExportStatus("PNG downloaded.");
    } catch (e) {
      console.error(e);
      setPosExportStatus("PNG export failed.");
    }
  }

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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {reportType === "Position List" && (
              <>
                <button onClick={() => setPosGroupBy("segment")} style={{ background: posGroupBy === "segment" ? C.blue : "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: posGroupBy === "segment" ? "#fff" : C.dim, fontSize: 11, fontWeight: 700, padding: "8px 12px", cursor: "pointer" }}>By Segment</button>
                <button onClick={() => setPosGroupBy("region")} style={{ background: posGroupBy === "region" ? C.blue : "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: posGroupBy === "region" ? "#fff" : C.dim, fontSize: 11, fontWeight: 700, padding: "8px 12px", cursor: "pointer" }}>By Region</button>
              </>
            )}
            <button onClick={saveReport} style={{ background: "linear-gradient(135deg, #3fb950 0%, #2ecc71 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(63,185,80,0.3)" }}>Save Report</button>
            <button onClick={exportReport} style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(102,126,234,0.3)" }}>Print / PDF</button>
            {reportType === "Position List" ? (
              <>
                <button onClick={copyPositionImage} style={{ background: "linear-gradient(135deg, #f5a623 0%, #f39c12 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(245,166,35,0.3)" }}>Copy for Email</button>
                <button onClick={downloadPositionPng} style={{ background: "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: C.dim, fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer" }}>Download PNG</button>
              </>
            ) : (
              <button onClick={copyReport} style={{ background: "linear-gradient(135deg, #f5a623 0%, #f39c12 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(245,166,35,0.3)" }}>Copy</button>
            )}
          </div>
        </div>
        {reportType === "Position List" && posExportStatus && (
          <div style={{ fontSize: 11, color: C.dim, padding: "0 4px" }}>{posExportStatus}</div>
        )}

        {reportType === "Position List" ? (
          <PositionListReport
            grouped={posGrouped}
            groupCounts={posGroupCounts}
            title={posTitle}
            setTitle={setPosTitle}
            subtitle={posSubtitle}
            setSubtitle={setPosSubtitle}
            reportDate={reportDate}
            reportRef={posReportRef}
          />
        ) : (
        <>
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
        </>
        )}
      </div>
    </div>
  );
}

function fmtDwtFull(n) {
  if (n == null || n === "") return "";
  return Number(n).toLocaleString("en-US").replace(/,/g, " ");
}

function GroupBarChart({ data, width = 460, height = 160 }) {
  if (!data || data.length === 0) return null;
  const padding = { top: 22, right: 10, bottom: 26, left: 10 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const max = Math.max(...data.map(d => d.count), 1);
  const barW = w / data.length / 1.6;
  const xFor = i => padding.left + (i + 0.5) * (w / data.length);
  const yFor = v => padding.top + h - (v / max) * h;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <text x={padding.left} y={12} fill={C.tx} fontSize="12" fontWeight="600">No. of ships</text>
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={xFor(i) - barW / 2} y={yFor(d.count)} width={barW} height={h - (yFor(d.count) - padding.top)} fill={C.blue} opacity="0.6" rx="2" />
          <text x={xFor(i)} y={yFor(d.count) - 6} fill={C.tx} fontSize="11" textAnchor="middle">{d.count}</text>
          <text x={xFor(i)} y={height - 8} fill={C.dim} fontSize="10" textAnchor="middle">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

function PositionListReport({ grouped, groupCounts, title, setTitle, subtitle, setSubtitle, reportDate, reportRef }) {
  const dateDisplay = new Date(reportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-print-area, .report-print-area * { visibility: visible; }
          .report-print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* Editable title/subtitle — not part of the exported image styling concerns, just content */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, display: "flex", gap: 8 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Report title" style={{ flex: 2, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "8px 10px", outline: "none" }} />
        <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle" style={{ flex: 3, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "8px 10px", outline: "none" }} />
      </div>

      <div ref={reportRef} className="report-print-area" style={{ background: "#070f1c", border: "1px solid rgba(58,130,246,0.14)", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Header */}
        <div style={{ background: "#0c1e3d", padding: "10px 16px", textAlign: "right" }}>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{dateDisplay}</span>
        </div>
        <div style={{ background: "#fff", padding: "16px 0", textAlign: "center" }}>
          <img src="/steem1960-logo.png" alt="Steem1960" style={{ height: 40 }} onError={e => { e.target.style.display = "none"; }} />
        </div>
        <div style={{ background: "#0c1e3d", padding: "14px 16px", textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{subtitle}</div>
        </div>

        {/* Table */}
        <div style={{ padding: 12 }}>
          {Object.keys(grouped).length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(219,230,245,0.5)", fontSize: 12 }}>
              No vessels selected — go to Positions, select vessels, then "To Report".
            </div>
          ) : (
            <div style={{ border: "1px solid rgba(58,130,246,0.14)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.8fr 0.7fr 0.8fr 1.2fr 0.8fr", background: C.blue, color: "#fff", fontSize: 11, fontWeight: 700, padding: "6px 8px" }}>
                <div>VESSEL</div><div>DWT</div><div>BUILT</div><div>COATING</div><div>OPEN</div><div>PORT</div><div>COMMENT</div><div>OPERATOR</div>
              </div>
              {Object.entries(grouped).map(([bucket, rows]) => (
                <div key={bucket}>
                  <div style={{ background: "#0c1e3d", color: "#dbe6f5", fontSize: 11, fontWeight: 700, padding: "4px 8px", letterSpacing: 0.5 }}>{bucket}</div>
                  {rows.map((v, i) => (
                    <div key={(v.vessel || "") + i} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.8fr 0.7fr 0.8fr 1.2fr 0.8fr", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", color: "#dbe6f5", fontSize: 11, padding: "4px 8px", borderTop: "1px solid rgba(58,130,246,0.14)" }}>
                      <div>{v.vessel}</div>
                      <div>{fmtDwtFull(v.dwt)}</div>
                      <div>{v.built || ""}</div>
                      <div>{v.coating || ""}</div>
                      <div>{v.date ? fmtDateShort(v.date) : ""}</div>
                      <div>{v.openPort || ""}</div>
                      <div style={{ color: "rgba(219,230,245,0.6)" }}>{v.comment || ""}</div>
                      <div>{v.operator || ""}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart */}
        {groupCounts.length > 0 && (
          <div style={{ padding: "0 12px 16px" }}>
            <div style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.14)", padding: 8 }}>
              <GroupBarChart data={groupCounts} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsTab;
