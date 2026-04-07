import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

function AISMap({ selectedVessels = [], vessels = [] }) {
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

  // Center map on selected vessel(s)
  useEffect(() => {
    if (filteredAIS.length > 0) {
      const lats = filteredAIS.map(p => p.latitude).filter(Boolean);
      const lngs = filteredAIS.map(p => p.longitude).filter(Boolean);
      
      if (lats.length > 0 && lngs.length > 0) {
        const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
        setMapCenter([centerLat, centerLng]);
        setZoom(selectedVessels.length > 0 ? 6 : 4);
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
      height: "100%"
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
      <div ref={mapRef} style={{ flex: 1, position: "relative", background: "#1a2332", minHeight: 400 }}>
        <svg viewBox="0 0 800 600" style={{ width: "100%", height: "100%" }}>
          {/* Simple world map background */}
          <rect width="800" height="600" fill="#0d1117" />
          
          {/* Draw routes for each vessel */}
          {Object.entries(vesselRoutes).map(([vessel, points], idx) => {
            const color = ["#58a6ff", "#79c0ff", "#a5d6ff", "#f778ba", "#ea9a00"][idx % 5];
            
            // Convert lat/lng to SVG coordinates (simple mercator-ish projection)
            const toX = (lng) => ((lng + 180) / 360) * 800;
            const toY = (lat) => ((90 - lat) / 180) * 600;
            
            const pathPoints = points
              .filter(p => p.latitude && p.longitude)
              .map(p => `${toX(p.longitude)},${toY(p.latitude)}`)
              .join(" ");

            const lastPoint = points[0];
            
            return (
              <g key={vessel}>
                {/* Route line */}
                {pathPoints && (
                  <polyline
                    points={pathPoints}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeOpacity="0.6"
                  />
                )}
                
                {/* Current position marker */}
                {lastPoint && lastPoint.latitude && lastPoint.longitude && (
                  <>
                    <circle
                      cx={toX(lastPoint.longitude)}
                      cy={toY(lastPoint.latitude)}
                      r="6"
                      fill={color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    
                    {/* Vessel label */}
                    <text
                      x={toX(lastPoint.longitude) + 10}
                      y={toY(lastPoint.latitude) - 10}
                      fill={color}
                      fontSize="11"
                      fontWeight="600"
                    >
                      {vessel}
                    </text>
                    
                    {/* ETA and destination if available */}
                    {(lastPoint.eta || lastPoint.destination) && (
                      <text
                        x={toX(lastPoint.longitude) + 10}
                        y={toY(lastPoint.latitude) + 5}
                        fill={C.faint}
                        fontSize="9"
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
              x="400"
              y="300"
              fill={C.faint}
              fontSize="14"
              textAnchor="middle"
            >
              {selectedVessels.length > 0 
                ? "No AIS data for selected vessel(s)"
                : "Click a vessel to view AIS position"}
            </text>
          )}
        </svg>
      </div>

      {/* Zoom controls */}
      <div style={{ 
        padding: "6px 10px", 
        borderTop: "1px solid " + C.bd2,
        display: "flex",
        gap: 6,
        alignItems: "center"
      }}>
        <button
          onClick={() => setZoom(z => Math.min(z + 1, 10))}
          style={{
            background: C.bg3,
            border: "1px solid " + C.bd,
            borderRadius: 4,
            color: C.tx,
            fontSize: 12,
            padding: "2px 8px",
            cursor: "pointer"
          }}
        >
          +
        </button>
        <button
          onClick={() => setZoom(z => Math.max(z - 1, 1))}
          style={{
            background: C.bg3,
            border: "1px solid " + C.bd,
            borderRadius: 4,
            color: C.tx,
            fontSize: 12,
            padding: "2px 8px",
            cursor: "pointer"
          }}
        >
          −
        </button>
        <span style={{ fontSize: 11, color: C.faint, marginLeft: "auto" }}>
          Zoom: {zoom}x
        </span>
      </div>
    </div>
  );
}

export default AISMap;
