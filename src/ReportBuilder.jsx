import React, { useRef, useState, useMemo } from "react";
// Loaded straight from CDN so no package.json / npm install is needed —
// just this one file, same as your other jsx replacements.
import { toPng, toBlob } from "https://esm.sh/html-to-image@1.11.13";
import { jsPDF } from "https://esm.sh/jspdf@4.2.1";

/* ============================================================
   THEME — matches TankPos dark navy palette
   ============================================================ */
const THEME = {
  bg: "#070f1c",
  bg2: "#0c1729",
  headerBg: "#0c1e3d",
  accent: "#3a82f6",
  border: "rgba(58,130,246,0.14)",
  rowAlt: "rgba(255,255,255,0.02)",
  rowBase: "transparent",
  headText: "rgba(120,160,220,0.45)",
  text: "#dbe6f5",
  textDim: "rgba(219,230,245,0.6)",
};

/* ============================================================
   HELPERS
   ============================================================ */

// TODO: confirm actual column names against Supabase (per your rule —
// in-memory field names often differ from DB columns). Adjust here.
function groupVessels(vessels, groupBy) {
  const key = groupBy === "region" ? "region" : "segment";
  const buckets = {};
  vessels.forEach((v) => {
    const bucketKey = v[key] || "UNASSIGNED";
    if (!buckets[bucketKey]) buckets[bucketKey] = [];
    buckets[bucketKey].push(v);
  });
  return buckets;
}

function fmtDwt(n) {
  if (n == null) return "";
  return Number(n).toLocaleString("en-US").replace(/,/g, " ");
}

/* ============================================================
   MINI FIXING WINDOW CHART (bars = ship count, line = avg window)
   data: [{ label: 'oktober', ships: 12, avgWindow: 13 }, ...]
   ============================================================ */
function FixingWindowMini({ data, width = 420, height = 180 }) {
  if (!data || data.length === 0) return null;
  const padding = { top: 20, right: 10, bottom: 24, left: 24 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  const maxShips = Math.max(...data.map((d) => d.ships), 1);
  const maxWindow = Math.max(...data.map((d) => d.avgWindow), 1);
  const barW = w / data.length / 1.8;

  const xFor = (i) => padding.left + (i + 0.5) * (w / data.length);
  const yBar = (v) => padding.top + h - (v / maxShips) * h;
  const yLine = (v) => padding.top + h - (v / maxWindow) * h;

  const linePoints = data.map((d, i) => `${xFor(i)},${yLine(d.avgWindow)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <text x={padding.left} y={12} fill={THEME.text} fontSize="12" fontWeight="600">
        No. of ships · Avg. fix window
      </text>
      {data.map((d, i) => (
        <g key={d.label}>
          <rect
            x={xFor(i) - barW / 2}
            y={yBar(d.ships)}
            width={barW}
            height={h - (yBar(d.ships) - padding.top)}
            fill={THEME.accent}
            opacity="0.55"
            rx="2"
          />
          <text
            x={xFor(i)}
            y={yBar(d.ships) - 6}
            fill={THEME.text}
            fontSize="11"
            textAnchor="middle"
          >
            {d.ships}
          </text>
          <text
            x={xFor(i)}
            y={height - 6}
            fill={THEME.textDim}
            fontSize="10"
            textAnchor="middle"
          >
            {d.label}
          </text>
        </g>
      ))}
      <polyline points={linePoints} fill="none" stroke="#9fd0ff" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={`pt-${d.label}`} cx={xFor(i)} cy={yLine(d.avgWindow)} r="3" fill="#9fd0ff" />
      ))}
    </svg>
  );
}

/* ============================================================
   MINI REGION TREND CHART (simple line over weeks)
   data: [{ week: '42', count: 13 }, ...]
   ============================================================ */
function RegionTrendMini({ data, title = "By Region", width = 420, height = 180 }) {
  if (!data || data.length === 0) return null;
  const padding = { top: 20, right: 10, bottom: 24, left: 24 };
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((d) => d.count), 1);

  const xFor = (i) => padding.left + (i / (data.length - 1 || 1)) * w;
  const yFor = (v) => padding.top + h - (v / maxVal) * h;
  const points = data.map((d, i) => `${xFor(i)},${yFor(d.count)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <text x={padding.left} y={12} fill={THEME.text} fontSize="12" fontWeight="600">
        {title}
      </text>
      <polyline points={points} fill="none" stroke={THEME.accent} strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={`rt-${d.week}-${i}`} cx={xFor(i)} cy={yFor(d.count)} r="2.5" fill={THEME.accent} />
      ))}
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text
            key={`lbl-${d.week}-${i}`}
            x={xFor(i)}
            y={height - 6}
            fill={THEME.textDim}
            fontSize="9"
            textAnchor="middle"
          >
            {d.week}
          </text>
        ) : null
      )}
    </svg>
  );
}

/* ============================================================
   REPORT TABLE — grouped section renderer
   ============================================================ */
function ReportTable({ grouped }) {
  return (
    <div style={{ border: `1px solid ${THEME.border}` }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 0.7fr 0.5fr 0.8fr 0.6fr 0.8fr 1fr 0.8fr",
          background: THEME.accent,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          padding: "6px 8px",
        }}
      >
        <div>VESSEL</div>
        <div>DWT</div>
        <div>AGE</div>
        <div>COATING</div>
        <div>OPEN</div>
        <div>PORT</div>
        <div>COMMENTS</div>
        <div>OPERATOR</div>
      </div>

      {Object.entries(grouped).map(([bucket, rows]) => (
        <div key={bucket}>
          <div
            style={{
              background: THEME.headerBg,
              color: THEME.text,
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 8px",
              letterSpacing: 0.5,
            }}
          >
            {bucket}
          </div>
          {rows.map((v, i) => (
            <div
              key={v.imo_no || v.vessel_name || i}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 0.7fr 0.5fr 0.8fr 0.6fr 0.8fr 1fr 0.8fr",
                background: i % 2 === 0 ? THEME.rowAlt : THEME.rowBase,
                color: THEME.text,
                fontSize: 11,
                padding: "4px 8px",
                borderTop: `1px solid ${THEME.border}`,
              }}
            >
              <div>{v.vessel_name}</div>
              <div>{fmtDwt(v.dwt)}</div>
              <div>{v.age}</div>
              <div>{v.coating}</div>
              <div>{v.open}</div>
              <div>{v.port}</div>
              <div style={{ color: THEME.textDim }}>{v.comments}</div>
              <div>{v.operator}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MAIN REPORT BUILDER
   Props:
     vessels           — frozen snapshot array from Positions tab
     fixingWindowData  — [{ label, ships, avgWindow }]
     regionTrendData   — [{ week, count }]
     logoUrl           — path/URL to Steem1960 logo
     title, subtitle    — editable header text
   ============================================================ */
export default function ReportBuilder({
  vessels = [],
  fixingWindowData = [],
  regionTrendData = [],
  logoUrl = "/steem1960-logo.png",
  title = "CHEMS & SPECIALIZED POSITION LIST",
  subtitle = "10-22,000 DWT · COATED AND STST",
}) {
  const [groupBy, setGroupBy] = useState("segment"); // 'segment' | 'region'
  const [exportStatus, setExportStatus] = useState("");
  const reportRef = useRef(null);

  const grouped = useMemo(() => groupVessels(vessels, groupBy), [vessels, groupBy]);

  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  async function captureNode() {
    if (!reportRef.current) return null;
    return toPng(reportRef.current, {
      backgroundColor: THEME.bg,
      pixelRatio: 2, // sharper export for retina / print
    });
  }

  async function handleDownloadPng() {
    setExportStatus("Rendering PNG...");
    try {
      const dataUrl = await captureNode();
      const link = document.createElement("a");
      link.download = `positions-report-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setExportStatus("PNG downloaded.");
    } catch (e) {
      console.error(e);
      setExportStatus("PNG export failed.");
    }
  }

  async function handleDownloadPdf() {
    setExportStatus("Rendering PDF...");
    try {
      const dataUrl = await captureNode();
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => (img.onload = res));

      const pdf = new jsPDF({
        orientation: img.width > img.height ? "landscape" : "portrait",
        unit: "px",
        format: [img.width, img.height],
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
      pdf.save(`positions-report-${Date.now()}.pdf`);
      setExportStatus("PDF downloaded.");
    } catch (e) {
      console.error(e);
      setExportStatus("PDF export failed.");
    }
  }

  async function handleCopyToClipboard() {
    setExportStatus("Copying...");
    try {
      // toBlob avoids the base64 round trip, cleaner for ClipboardItem
      const blob = await toBlob(reportRef.current, {
        backgroundColor: THEME.bg,
        pixelRatio: 2,
      });
      if (!blob) throw new Error("No blob generated");

      // Requires user-gesture context (button click) — Safari/iPad included
      await navigator.clipboard.write([
        new window.ClipboardItem({ "image/png": blob }),
      ]);
      setExportStatus("Copied! Paste directly into your email body.");
    } catch (e) {
      console.error(e);
      setExportStatus(
        "Copy failed — your browser may need a permissions prompt, or use PNG download instead."
      );
    }
  }

  return (
    <div style={{ background: THEME.bg, minHeight: "100vh", padding: 24 }}>
      {/* CONTROLS — not included in export capture */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <button
          onClick={() => setGroupBy("segment")}
          style={toggleBtnStyle(groupBy === "segment")}
        >
          By Segment
        </button>
        <button
          onClick={() => setGroupBy("region")}
          style={toggleBtnStyle(groupBy === "region")}
        >
          By Region
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleCopyToClipboard} style={actionBtnStyle(true)}>
          Copy for Email
        </button>
        <button onClick={handleDownloadPng} style={actionBtnStyle()}>
          Download PNG
        </button>
        <button onClick={handleDownloadPdf} style={actionBtnStyle()}>
          Download PDF
        </button>
      </div>
      {exportStatus && (
        <div style={{ color: THEME.textDim, fontSize: 12, marginBottom: 12 }}>
          {exportStatus}
        </div>
      )}

      {/* CAPTURED REPORT NODE */}
      <div
        ref={reportRef}
        style={{
          background: THEME.bg,
          width: 920,
          fontFamily: "Inter, system-ui, sans-serif",
          border: `1px solid ${THEME.border}`,
        }}
      >
        {/* HEADER */}
        <div style={{ background: THEME.headerBg, padding: "10px 16px", textAlign: "right" }}>
          <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{today}</span>
        </div>
        <div style={{ background: "#fff", padding: "16px 0", textAlign: "center" }}>
          <img src={logoUrl} alt="Steem1960" style={{ height: 40 }} />
        </div>
        <div
          style={{
            background: THEME.headerBg,
            padding: "14px 16px",
            textAlign: "center",
            color: "#fff",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{subtitle}</div>
        </div>

        {/* TABLE */}
        <div style={{ padding: 12 }}>
          <ReportTable grouped={grouped} />
        </div>

        {/* CHARTS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "0 12px 16px",
          }}
        >
          <div style={{ background: THEME.bg2, border: `1px solid ${THEME.border}`, padding: 8 }}>
            <FixingWindowMini data={fixingWindowData} />
          </div>
          <div style={{ background: THEME.bg2, border: `1px solid ${THEME.border}`, padding: 8 }}>
            <RegionTrendMini data={regionTrendData} />
          </div>
        </div>
      </div>
    </div>
  );
}

function toggleBtnStyle(active) {
  return {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${THEME.border}`,
    background: active ? THEME.accent : "transparent",
    color: active ? "#fff" : THEME.textDim,
    cursor: "pointer",
  };
}

function actionBtnStyle(primary = false) {
  return {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${THEME.border}`,
    background: primary ? THEME.accent : THEME.bg2,
    color: "#fff",
    cursor: "pointer",
  };
}
