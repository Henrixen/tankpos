import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

function AISMap({ selectedVessels = [], vessels = [], onAisVesselsChange }) {
  const [aisData, setAisData] = useState([]);
  const [mapCenter, setMapCenter] = useState([51.5, -0.1]); // Default: London
  const [zoom, setZoom] = useState(4);
  const mapRef = useRef(null);

  // Fetch AIS data from Supabase
  useEffect(() => {
    async function fetchAIS() {
      const { data, error } = await supabase
        .from("positions_ais")
        .select("*")
        .order("datetime", { ascending: false })
        .limit(1000);

      if (error) {
        console.error("AIS fetch error:", error);
        return;
      }

      setAisData(data || []);
      if (onAisVesselsChange) {
        const names = new Set((data || []).map(d => (d.vessel_name || "").toUpperCase().trim()).filter(Boolean));
        onAisVesselsChange(names);
      }
    }

    fetchAIS();
    const interval = setInterval(fetchAIS, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Filter AIS data by selected vessels
  const filteredAIS = selectedVessels.length > 0
    ? aisData.filter(a => selectedVessels.some(v => 
        v.toLowerCase() === (a.vessel_name || "").toLowerCase()
      ))
    : aisData;

  // Group by vessel to show routes
  const vesselRoutes = {};
  filteredAIS.forEach(point => {
    const vessel = point.vessel_name || "Unknown";
    if (!vesselRoutes[vessel]) vesselRoutes[vessel] = [];
    vesselRoutes[vessel].push(point);
  });

  // Sort routes by datetime for proper line drawing
  Object.keys(vesselRoutes).forEach(vessel => {
    vesselRoutes[vessel].sort((a, b) => 
      new Date(a.datetime) - new Date(b.datetime)
    );
  });

  // Center map on selected vessel(s)
  useEffect(() => {
    if (filteredAIS.length > 0) {
      const lats = filteredAIS.map(p => p.latitude).filter(Boolean);
      const lngs = filteredAIS.map(p => p.longitude).filter(Boolean);
      
      if (lats.length > 0 && lngs.length > 0) {
        const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
        setMapCenter([centerLat, centerLng]);
        setZoom(selectedVessels.length > 0 ? 6 : 3);
      }
    }
  }, [selectedVessels, filteredAIS]);

  return (
    <div style={{ 
      background: C.bg2, 
      border: "1px solid " + C.bd, 
      borderRadius: 7, 
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative"
    }}>
      {/* Header */}
      <div style={{ 
        padding: "6px 10px", 
        borderBottom: "1px solid " + C.bd2, 
        background: C.bg,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>🗺️ AIS Live Map</span>
        <span style={{ fontSize: 11, color: C.faint }}>
          {filteredAIS.length} position{filteredAIS.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Map Container */}
      <div ref={mapRef} style={{ flex: 1, position: "relative", background: "#0d1117", minHeight: 400, overflow: "hidden" }}>
        <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%", display: "block" }}>
          {/* Map background */}
          <rect width="1000" height="600" fill="#0a0e16" />
          {/* Simplified world landmasses (equirectangular, low-poly) */}
          <g fill="#161f30" stroke="#1f2c44" strokeWidth="1">
            {/* North & South America */}
            <path d="M120,60 L260,55 L290,110 L270,160 L300,210 L280,260 L240,300 L230,360 L210,420 L195,470 L175,440 L165,380 L150,320 L140,260 L110,200 L95,150 L100,100 Z"/>
            {/* Greenland */}
            <path d="M330,40 L380,35 L400,70 L370,100 L335,85 Z"/>
            {/* Europe */}
            <path d="M460,90 L520,80 L545,110 L530,140 L560,160 L540,190 L500,200 L470,170 L450,140 Z"/>
            {/* Africa */}
            <path d="M470,200 L560,195 L580,260 L560,340 L530,420 L500,460 L480,400 L470,320 L460,260 Z"/>
            {/* Asia */}
            <path d="M560,60 L760,50 L850,90 L880,140 L820,180 L760,170 L700,200 L650,180 L600,150 L570,110 Z"/>
            {/* India */}
            <path d="M650,200 L700,195 L710,250 L680,290 L655,250 Z"/>
            {/* Australia */}
            <path d="M780,360 L880,350 L910,400 L870,440 L800,430 L770,400 Z"/>
            {/* UK/Ireland */}
            <path d="M448,118 L468,112 L475,130 L460,145 L445,135 Z"/>
          </g>
          {/* Graticule lines */}
          <g stroke="#1a2438" strokeWidth="0.5" opacity="0.5">
            {[0,100,200,300,400,500,600,700,800,900,1000].map(x=><line key={"v"+x} x1={x} y1="0" x2={x} y2="600"/>)}
            {[0,100,200,300,400,500,600].map(y=><line key={"h"+y} x1="0" y1={y} x2="1000" y2={y}/>)}
          </g>
          
          {/* Draw routes for each vessel */}
          {Object.entries(vesselRoutes).map(([vessel, points], idx) => {
            const color = ["#58a6ff", "#79c0ff", "#a5d6ff", "#f778ba", "#ea9a00", "#a8e6a3"][idx % 6];
            
            // Convert lat/lng to SVG coordinates (simple mercator-ish projection)
            const toX = (lng) => ((lng + 180) / 360) * 1000;
            const toY = (lat) => ((90 - lat) / 180) * 600;
            
            const pathPoints = points
              .filter(p => p.latitude && p.longitude)
              .map(p => `${toX(p.longitude)},${toY(p.latitude)}`)
              .join(" ");

            const lastPoint = points[points.length - 1];
            
            return (
              <g key={vessel}>
                {/* Route line */}
                {pathPoints && (
                  <polyline
                    points={pathPoints}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeOpacity="0.7"
                  />
                )}
                
                {/* Draw all points along route */}
                {points.filter(p => p.latitude && p.longitude).map((point, pidx) => (
                  <circle
                    key={pidx}
                    cx={toX(point.longitude)}
                    cy={toY(point.latitude)}
                    r="2"
                    fill={color}
                    fillOpacity="0.5"
                  />
                ))}
                
                {/* Current position marker (larger) */}
                {lastPoint && lastPoint.latitude && lastPoint.longitude && (
                  <>
                    <circle
                      cx={toX(lastPoint.longitude)}
                      cy={toY(lastPoint.latitude)}
                      r="7"
                      fill={color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    
                    {/* Vessel label */}
                    <text
                      x={toX(lastPoint.longitude) + 12}
                      y={toY(lastPoint.latitude) - 8}
                      fill={color}
                      fontSize="12"
                      fontWeight="700"
                    >
                      {vessel}
                    </text>
                    
                    {/* ETA and destination if available */}
                    {(lastPoint.eta || lastPoint.destination) && (
                      <text
                        x={toX(lastPoint.longitude) + 12}
                        y={toY(lastPoint.latitude) + 6}
                        fill={C.faint}
                        fontSize="10"
                      >
                        {lastPoint.destination || ""} {lastPoint.eta ? `ETA: ${lastPoint.eta}` : ""}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
          
          {/* If no data, show message */}
          {filteredAIS.length === 0 && (
            <text
              x="500"
              y="300"
              fill={C.faint}
              fontSize="14"
              textAnchor="middle"
            >
              {selectedVessels.length > 0 
                ? "No AIS data for selected vessel"
                : "Click a vessel to view AIS position"}
            </text>
          )}
        </svg>

        {/* Zoom controls - positioned on map */}
        <div style={{ 
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          <button
            onClick={() => setZoom(z => Math.min(z + 1, 10))}
            style={{
              background: C.bg2,
              border: "1px solid " + C.bd,
              borderRadius: 4,
              color: C.tx,
              fontSize: 14,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            +
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 1, 1))}
            style={{
              background: C.bg2,
              border: "1px solid " + C.bd,
              borderRadius: 4,
              color: C.tx,
              fontSize: 14,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}

export default AISMap;
