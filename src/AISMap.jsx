import React, { useState, useEffect, useRef, useCallback } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

const COLORS = ["#58a6ff","#f778ba","#ea9a00","#4ade80","#a78bfa","#fb923c","#22d3ee","#e879f9","#86efac","#fbbf24","#60a5fa","#f472b6"];

// Simple equirectangular projection
function toX(lng) { return ((lng + 180) / 360) * 1000; }
function toY(lat) { return ((90 - lat) / 180) * 500; }

// World landmasses — simplified polygons for clean ocean background
const LANDS = [
  // North America
  "M 185,60 L 235,55 L 265,75 L 280,110 L 265,150 L 290,175 L 280,210 L 255,245 L 240,290 L 220,340 L 205,390 L 190,420 L 175,400 L 165,360 L 155,310 L 145,260 L 130,210 L 115,170 L 105,130 L 110,90 Z",
  // Greenland
  "M 310,35 L 365,28 L 390,55 L 375,90 L 340,100 L 315,75 Z",
  // South America
  "M 225,340 L 265,330 L 285,370 L 290,420 L 275,470 L 250,490 L 228,460 L 215,420 L 210,380 Z",
  // Europe
  "M 460,85 L 510,75 L 540,95 L 535,125 L 555,140 L 545,165 L 510,175 L 485,155 L 462,130 Z",
  // UK
  "M 448,112 L 468,107 L 473,128 L 458,140 L 445,130 Z",
  // Scandinavia
  "M 490,68 L 530,60 L 545,90 L 525,110 L 500,105 L 488,85 Z",
  // Africa
  "M 465,175 L 555,170 L 575,220 L 570,290 L 545,360 L 520,415 L 495,425 L 478,380 L 465,310 L 458,240 Z",
  // Middle East
  "M 555,155 L 610,148 L 625,175 L 600,195 L 565,185 Z",
  // Asia main
  "M 545,65 L 760,50 L 850,75 L 870,110 L 840,150 L 780,160 L 720,170 L 670,165 L 620,145 L 575,120 L 558,95 Z",
  // India
  "M 640,175 L 685,170 L 700,210 L 690,255 L 665,270 L 645,235 L 638,200 Z",
  // SE Asia
  "M 760,175 L 810,165 L 825,195 L 800,215 L 770,205 Z",
  // Australia
  "M 770,340 L 870,330 L 905,370 L 900,415 L 860,440 L 795,430 L 765,395 Z",
  // Japan
  "M 840,120 L 865,115 L 870,140 L 848,150 L 838,135 Z",
];

export default function AISMap({ selectedVessels = [], vessels = [], onAisVesselsChange }) {
  const [aisData, setAisData] = useState([]);
  const [pan, setPan] = useState({ x: 0, y: -50 });
  const [scale, setScale] = useState(1.2);
  const [hoveredVessel, setHoveredVessel] = useState(null);
  const svgRef = useRef(null);
  const dragging = useRef(false);
  const dragStart = useRef(null);
  const panStart = useRef(null);

  // Fetch ALL latest positions (one per vessel) for overview, plus full history for selected
  useEffect(() => {
    async function fetchAIS() {
      const { data, error } = await supabase
        .from("positions_ais")
        .select("*")
        .order("datetime", { ascending: false })
        .limit(2000);
      if (error) { console.error("AIS fetch error:", error); return; }
      setAisData(data || []);
      if (onAisVesselsChange) {
        const names = new Set((data || []).map(d => (d.vessel_name || "").toUpperCase().trim()).filter(Boolean));
        onAisVesselsChange(names);
      }
    }
    fetchAIS();
    const iv = setInterval(fetchAIS, 60000);
    return () => clearInterval(iv);
  }, []);

  // Group by vessel, sort by datetime asc (for route drawing)
  const vesselRoutes = {};
  aisData.forEach(p => {
    const name = (p.vessel_name || "Unknown").toUpperCase();
    if (!vesselRoutes[name]) vesselRoutes[name] = [];
    vesselRoutes[name].push(p);
  });
  Object.values(vesselRoutes).forEach(pts => pts.sort((a,b) => new Date(a.datetime) - new Date(b.datetime)));

  const vesselNames = Object.keys(vesselRoutes);
  const colorMap = {};
  vesselNames.forEach((n,i) => { colorMap[n] = COLORS[i % COLORS.length]; });

  const selectedUp = selectedVessels.map(s => s.toUpperCase().trim());
  const hasSelection = selectedUp.length > 0;

  // Pan/zoom
  const onWheel = useCallback(e => {
    e.preventDefault();
    setScale(s => Math.max(0.5, Math.min(8, s * (e.deltaY < 0 ? 1.12 : 0.89))));
  }, []);
  const onMouseDown = useCallback(e => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [pan]);
  const onMouseMove = useCallback(e => {
    if (!dragging.current) return;
    setPan({ x: panStart.current.x + (e.clientX - dragStart.current.x), y: panStart.current.y + (e.clientY - dragStart.current.y) });
  }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Center on selected vessel when selection changes
  useEffect(() => {
    if (selectedUp.length === 0) return;
    const pts = selectedUp.flatMap(n => vesselRoutes[n] || []).filter(p => p.latitude && p.longitude);
    if (!pts.length) return;
    const avgLat = pts.reduce((a,b) => a + b.latitude, 0) / pts.length;
    const avgLng = pts.reduce((a,b) => a + b.longitude, 0) / pts.length;
    const cx = toX(avgLng); const cy = toY(avgLat);
    setScale(4);
    setPan({ x: 500 - cx * 4, y: 250 - cy * 4 });
  }, [JSON.stringify(selectedVessels)]);

  const transform = `translate(${pan.x},${pan.y}) scale(${scale})`;

  // Count latest positions for header
  const latestCount = vesselNames.length;

  return (
    <div style={{ background: C.bg2, border: "1px solid "+C.bd, borderRadius: 7, overflow: "hidden",
      display: "flex", flexDirection: "column", height: "100%", position: "relative", userSelect: "none" }}>

      {/* Header */}
      <div style={{ padding: "6px 10px", borderBottom: "1px solid "+C.bd2, background: C.bg,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>🗺️ AIS Live Map</span>
        <span style={{ fontSize: 11, color: C.faint }}>
          {hasSelection ? selectedUp.join(", ").toLowerCase() : `${latestCount} vessels`}
        </span>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", cursor: dragging.current ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}>

        <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 1000 500"
          preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.7)"/>
            </marker>
          </defs>

          <g transform={transform}>
            {/* Ocean */}
            <rect x="-5000" y="-5000" width="11000" height="11000" fill="#08111e"/>

            {/* Land */}
            {LANDS.map((d,i) => (
              <path key={i} d={d} fill="#1a2540" stroke="#253656" strokeWidth={0.5/scale}/>
            ))}

            {/* Graticule */}
            <g stroke="#0e1c30" strokeWidth={0.4/scale}>
              {[-180,-120,-60,0,60,120,180].map(lng => (
                <line key={"v"+lng} x1={toX(lng)} y1={toY(-90)} x2={toX(lng)} y2={toY(90)}/>
              ))}
              {[-60,-30,0,30,60].map(lat => (
                <line key={"h"+lat} x1={toX(-180)} y1={toY(lat)} x2={toX(180)} y2={toY(lat)}/>
              ))}
            </g>

            {/* Render all vessels */}
            {vesselNames.map(name => {
              const pts = vesselRoutes[name].filter(p => p.latitude && p.longitude);
              if (!pts.length) return null;
              const color = colorMap[name];
              const isSelected = selectedUp.includes(name);
              const isHovered = hoveredVessel === name;
              const latest = pts[pts.length - 1];
              const lx = toX(latest.longitude);
              const ly = toY(latest.latitude);
              const dimmed = hasSelection && !isSelected;
              const r = isSelected ? 5/scale : 3/scale;

              return (
                <g key={name} style={{ cursor: "pointer" }}>
                  {/* Route trail — only for selected or hovered */}
                  {(isSelected || isHovered) && pts.length > 1 && (
                    <>
                      <polyline
                        points={pts.map(p => `${toX(p.longitude)},${toY(p.latitude)}`).join(" ")}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5/scale}
                        strokeOpacity={0.8}
                      />
                      {/* Historical dots */}
                      {pts.slice(0, -1).map((p,i) => (
                        <circle key={i} cx={toX(p.longitude)} cy={toY(p.latitude)}
                          r={1.5/scale} fill={color} fillOpacity={0.5}/>
                      ))}
                    </>
                  )}

                  {/* Current position dot */}
                  <circle
                    cx={lx} cy={ly}
                    r={r}
                    fill={color}
                    fillOpacity={dimmed ? 0.3 : 0.9}
                    stroke={isSelected ? "white" : "none"}
                    strokeWidth={1/scale}
                    onMouseEnter={() => setHoveredVessel(name)}
                    onMouseLeave={() => setHoveredVessel(null)}
                  />

                  {/* Label — only for selected or hovered */}
                  {(isSelected || isHovered) && (
                    <text x={lx + 6/scale} y={ly - 4/scale}
                      fill={color} fontSize={10/scale} fontWeight="700"
                      style={{ pointerEvents: "none" }}>
                      {name.charAt(0)+name.slice(1).toLowerCase()}
                    </text>
                  )}

                  {/* Destination tooltip on hover */}
                  {isHovered && (latest.destination || latest.eta) && (
                    <text x={lx + 6/scale} y={ly + 8/scale}
                      fill="rgba(180,210,255,0.7)" fontSize={8/scale}
                      style={{ pointerEvents: "none" }}>
                      {[latest.destination, latest.eta ? `ETA ${latest.eta.slice(0,10)}` : ""].filter(Boolean).join(" · ")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Zoom controls */}
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {["+","−"].map((lbl,i) => (
            <button key={lbl} onClick={() => setScale(s => Math.max(0.5, Math.min(8, i===0 ? s*1.4 : s/1.4)))}
              style={{ background: C.bg2, border: "1px solid "+C.bd, borderRadius: 4, color: C.tx,
                fontSize: 14, width: 28, height: 28, cursor: "pointer", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
              {lbl}
            </button>
          ))}
          <button onClick={() => { setScale(1.2); setPan({ x: 0, y: -50 }); }}
            style={{ background: C.bg2, border: "1px solid "+C.bd, borderRadius: 4, color: C.faint,
              fontSize: 10, width: 28, height: 28, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center" }} title="Reset view">
            ↺
          </button>
        </div>

        {/* Hint */}
        {!hasSelection && (
          <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
            fontSize: 10, color: C.faint, pointerEvents: "none" }}>
            Click a vessel to see route trail
          </div>
        )}
      </div>
    </div>
  );
}
