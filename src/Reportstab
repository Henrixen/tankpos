import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { toTCase, fmtDateShort } from "./utils";

const REPORT_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter"];

function ReportsTab({ selectedVessels = [], selectedCargoes = [] }) {
  const [reportType, setReportType] = useState("Intermediate");
  const [commentary, setCommentary] = useState("");
  const [rateGrid, setRateGrid] = useState({});
  const [tceEarnings, setTceEarnings] = useState({});
  const [fixtures, setFixtures] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [savedReports, setSavedReports] = useState([]);
  const [loadingReport, setLoadingReport] = useState(null);
  const reportRef = useRef(null);

  // Load saved reports
  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setSavedReports(data || []);
    } catch (err) {
      console.error("Error loading reports:", err);
    }
  };

  // Initialize rate grid structure based on report type
  useEffect(() => {
    let defaultGrid = {};
    if (reportType === "Intermediate") {
      defaultGrid = {
        "5kt": { "ARA-Thames": "", "ARA-Dublin": "", "Mongstad-ARA": "" },
        "10kt": { "ARA-Thames": "", "ARA-Dublin": "", "Mongstad-ARA": "" },
        "18kt": { "ARA-Thames": "", "ARA-Dublin": "", "Mongstad-ARA": "" },
      };
    } else if (reportType === "Asia to Europe") {
      defaultGrid = {
        "25kt": { "Singapore-ARA": "", "China-ARA": "" },
        "35kt": { "Singapore-ARA": "", "China-ARA": "" },
        "45kt": { "Singapore-ARA": "", "China-ARA": "" },
      };
    } else if (reportType === "Transatlantic") {
      defaultGrid = {
        "30kt": { "ARA-USG": "", "USG-ARA": "" },
        "37kt": { "ARA-USG": "", "USG-ARA": "" },
      };
    } else if (reportType === "TimeCharter") {
      defaultGrid = {
        "12m": { "10k": "", "15k": "", "20k": "" },
        "24m": { "10k": "", "15k": "", "20k": "" },
      };
    }
    setRateGrid(defaultGrid);
  }, [reportType]);

  const handleRateChange = (size, route, value) => {
    setRateGrid(prev => ({
      ...prev,
      [size]: { ...prev[size], [route]: value }
    }));
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
    setLoadingReport(reportId);
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .single();
      
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
    } finally {
      setLoadingReport(null);
    }
  };

  const exportReport = () => {
    if (reportRef.current) {
      window.print();
    }
  };

  const copyToClipboard = async () => {
    if (reportRef.current) {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const reportEl = reportRef.current;
        
        canvas.width = reportEl.offsetWidth;
        canvas.height = reportEl.offsetHeight;
        
        // This is a simplified version - for production use html2canvas library
        alert("Screenshot copied to clipboard (requires html2canvas library for full implementation)");
      } catch (err) {
        console.error("Error copying to clipboard:", err);
      }
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", gap: 12 }}>
      {/* LEFT SIDEBAR - Saved Reports */}
      <div style={{ 
        width: 240, 
        background: C.bg2, 
        border: "1px solid " + C.bd, 
        borderRadius: 8, 
        padding: 12,
        overflowY: "auto"
      }}>
        <div style={{ 
          fontSize: 11, 
          fontWeight: 700, 
          color: C.faint, 
          textTransform: "uppercase", 
          letterSpacing: "0.08em",
          marginBottom: 12 
        }}>
          📋 Saved Reports
        </div>
        
        <button
          onClick={() => {
            setCommentary("");
            setFixtures([]);
            setQuotes([]);
            setTceEarnings({});
          }}
          style={{
            width: "100%",
            background: C.blue,
            border: "none",
            borderRadius: 6,
            color: C.bg,
            fontSize: 12,
            fontWeight: 700,
            padding: "8px 12px",
            cursor: "pointer",
            marginBottom: 12
          }}
        >
          + New Report
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {savedReports.map(r => (
            <div
              key={r.id}
              onClick={() => loadReport(r.id)}
              style={{
                background: loadingReport === r.id ? C.bg3 : C.bg,
                border: "1px solid " + C.bd,
                borderRadius: 6,
                padding: "8px 10px",
                cursor: "pointer",
                transition: "all 0.15s"
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 2 }}>
                {r.report_type}
              </div>
              <div style={{ fontSize: 11, color: C.dim }}>
                {new Date(r.report_date).toLocaleDateString("en-GB")}
              </div>
              <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>
                {new Date(r.created_at).toLocaleDateString("en-GB")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        {/* HEADER */}
        <div style={{ 
          background: C.bg2, 
          border: "1px solid " + C.bd, 
          borderRadius: 8, 
          padding: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: C.dim }}>Report Type:</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              style={{
                background: C.bg3,
                border: "1px solid " + C.bd,
                borderRadius: 6,
                color: C.tx,
                fontSize: 12,
                padding: "6px 10px",
                outline: "none",
                cursor: "pointer"
              }}
            >
              {REPORT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: C.dim, marginLeft: 12 }}>Date:</label>
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              style={{
                background: C.bg3,
                border: "1px solid " + C.bd,
                borderRadius: 6,
                color: C.tx,
                fontSize: 12,
                padding: "6px 10px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={saveReport}
              style={{
                background: C.green,
                border: "none",
                borderRadius: 6,
                color: C.bg,
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 14px",
                cursor: "pointer"
              }}
            >
              💾 Save
            </button>
            <button
              onClick={exportReport}
              style={{
                background: C.purple,
                border: "none",
                borderRadius: 6,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 14px",
                cursor: "pointer"
              }}
            >
              🖨️ Print
            </button>
            <button
              onClick={copyToClipboard}
              style={{
                background: C.amber,
                border: "none",
                borderRadius: 6,
                color: C.bg,
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 14px",
                cursor: "pointer"
              }}
            >
              📸 Copy
            </button>
          </div>
        </div>

        {/* REPORT CONTENT */}
        <div
          ref={reportRef}
          style={{
            background: "#fff",
            border: "1px solid " + C.bd,
            borderRadius: 8,
            padding: 24,
            color: "#000"
          }}
        >
          {/* REPORT HEADER */}
          <div style={{ borderBottom: "2px solid #1a4d7a", paddingBottom: 12, marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a4d7a", margin: 0 }}>
              {reportType} Market Report
            </h1>
            <div style={{ fontSize: 14, color: "#666", marginTop: 6 }}>
              {new Date(reportDate).toLocaleDateString("en-GB", { 
                weekday: "long", 
                year: "numeric", 
                month: "long", 
                day: "numeric" 
              })}
            </div>
          </div>

          {/* FREIGHT RATES */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a4d7a", marginBottom: 12 }}>
              Freight Rates
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#e8f4fd" }}>
                  <th style={{ 
                    border: "1px solid #c0d8eb", 
                    padding: "8px 10px", 
                    textAlign: "left",
                    fontWeight: 700,
                    color: "#1a4d7a"
                  }}>
                    Size
                  </th>
                  {Object.keys(rateGrid).length > 0 && 
                    Object.keys(Object.values(rateGrid)[0] || {}).map(route => (
                      <th key={route} style={{ 
                        border: "1px solid #c0d8eb", 
                        padding: "8px 10px", 
                        textAlign: "center",
                        fontWeight: 700,
                        color: "#1a4d7a"
                      }}>
                        {route}
                      </th>
                    ))
                  }
                </tr>
              </thead>
              <tbody>
                {Object.keys(rateGrid).map((size, i) => (
                  <tr key={size} style={{ background: i % 2 === 0 ? "#fff" : "#f8fbfe" }}>
                    <td style={{ 
                      border: "1px solid #c0d8eb", 
                      padding: "8px 10px",
                      fontWeight: 700,
                      color: "#333"
                    }}>
                      {size}
                    </td>
                    {Object.keys(rateGrid[size]).map(route => (
                      <td key={route} style={{ 
                        border: "1px solid #c0d8eb", 
                        padding: "4px 8px",
                        textAlign: "center"
                      }}>
                        <input
                          type="text"
                          value={rateGrid[size][route]}
                          onChange={e => handleRateChange(size, route, e.target.value)}
                          placeholder="WS"
                          style={{
                            width: "100%",
                            border: "1px solid #d0e0f0",
                            borderRadius: 4,
                            padding: "4px 6px",
                            fontSize: 13,
                            textAlign: "center",
                            outline: "none"
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TCE EARNINGS */}
          {reportType !== "TimeCharter" && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a4d7a", marginBottom: 12 }}>
                Indicative TCE Earnings ($/day)
              </h2>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {["10k", "15k", "20k"].map(seg => (
                  <div key={seg} style={{ flex: "1 1 120px" }}>
                    <label style={{ 
                      display: "block", 
                      fontSize: 12, 
                      color: "#666", 
                      marginBottom: 4,
                      fontWeight: 600
                    }}>
                      {seg}
                    </label>
                    <input
                      type="text"
                      value={tceEarnings[seg] || ""}
                      onChange={e => handleTCEChange(seg, e.target.value)}
                      placeholder="$"
                      style={{
                        width: "100%",
                        border: "1px solid #d0e0f0",
                        borderRadius: 4,
                        padding: "6px 8px",
                        fontSize: 13,
                        outline: "none"
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MARKET COMMENTARY */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a4d7a", marginBottom: 12 }}>
              Market Commentary
            </h2>
            <textarea
              value={commentary}
              onChange={e => setCommentary(e.target.value)}
              placeholder="Enter market analysis, trends, and outlook..."
              style={{
                width: "100%",
                minHeight: 120,
                border: "1px solid #d0e0f0",
                borderRadius: 6,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.6,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit"
              }}
            />
          </div>

          {/* FIXTURES */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a4d7a", margin: 0 }}>
                Recent Fixtures
              </h2>
              <button
                onClick={addFixture}
                style={{
                  background: "#1a4d7a",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  cursor: "pointer"
                }}
              >
                + Add
              </button>
            </div>
            
            {fixtures.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#e8f4fd" }}>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Vessel</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Charterer</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Route</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Qty</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Rate</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Date</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((fix, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fbfe" }}>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={fix.vessel}
                          onChange={e => updateFixture(i, "vessel", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={fix.charterer}
                          onChange={e => updateFixture(i, "charterer", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={fix.route}
                          onChange={e => updateFixture(i, "route", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={fix.qty}
                          onChange={e => updateFixture(i, "qty", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={fix.rate}
                          onChange={e => updateFixture(i, "rate", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={fix.date}
                          onChange={e => updateFixture(i, "date", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "2px", textAlign: "center" }}>
                        <button
                          onClick={() => removeFixture(i)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#e74c3c",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 700
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ 
                padding: 20, 
                textAlign: "center", 
                color: "#999", 
                border: "1px dashed #d0e0f0",
                borderRadius: 6
              }}>
                No fixtures added yet
              </div>
            )}
          </div>

          {/* QUOTES */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a4d7a", margin: 0 }}>
                Market Quotes
              </h2>
              <button
                onClick={addQuote}
                style={{
                  background: "#1a4d7a",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  cursor: "pointer"
                }}
              >
                + Add
              </button>
            </div>
            
            {quotes.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#e8f4fd" }}>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Route</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Size</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Rate</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", fontWeight: 700, color: "#1a4d7a" }}>Basis</th>
                    <th style={{ border: "1px solid #c0d8eb", padding: "6px 8px", width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fbfe" }}>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={q.route}
                          onChange={e => updateQuote(i, "route", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={q.size}
                          onChange={e => updateQuote(i, "size", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={q.rate}
                          onChange={e => updateQuote(i, "rate", e.target.value)}
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={q.basis}
                          onChange={e => updateQuote(i, "basis", e.target.value)}
                          placeholder="ex-tank, FBG..."
                          style={{ 
                            width: "100%", 
                            border: "none", 
                            outline: "none", 
                            fontSize: 12,
                            background: "transparent"
                          }}
                        />
                      </td>
                      <td style={{ border: "1px solid #c0d8eb", padding: "2px", textAlign: "center" }}>
                        <button
                          onClick={() => removeQuote(i)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#e74c3c",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 700
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ 
                padding: 20, 
                textAlign: "center", 
                color: "#999", 
                border: "1px dashed #d0e0f0",
                borderRadius: 6
              }}>
                No quotes added yet
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div style={{ 
            borderTop: "1px solid #c0d8eb", 
            paddingTop: 12, 
            marginTop: 24,
            fontSize: 11,
            color: "#999",
            textAlign: "center"
          }}>
            This report is for indicative purposes only. Rates and information subject to change.
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsTab;
