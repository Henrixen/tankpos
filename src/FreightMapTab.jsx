import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

// Major ports with coordinates for visualization
const MAJOR_PORTS = {
  // Europe
  ara: { lat: 51.95, lng: 4.13, label: "ARA" },
  thames: { lat: 51.45, lng: 0.70, label: "Thames" },
  mongstad: { lat: 60.82, lng: 5.03, label: "Mongstad" },
  gothenburg: { lat: 57.70, lng: 11.97, label: "Gothenburg" },
  porvoo: { lat: 60.28, lng: 25.66, label: "Porvoo" },
  klaipeda: { lat: 55.71, lng: 21.13, label: "Klaipeda" },
  lehavre: { lat: 49.49, lng: 0.11, label: "Le Havre" },
  bordeaux: { lat: 44.84, lng: -0.57, label: "Bordeaux" },
  
  // Mediterranean
  wmed: { lat: 43.30, lng: 5.37, label: "W.Med" },
  cmed: { lat: 40.85, lng: 14.27, label: "C.Med" },
  emed: { lat: 37.98, lng: 23.73, label: "E.Med" },
  bsea: { lat: 44.48, lng: 33.55, label: "B.Sea" },
  redsea: { lat: 20.00, lng: 38.00, label: "Red Sea" },
  
  // Americas
  usg: { lat: 29.76, lng: -95.37, label: "US Gulf" },
  caribs: { lat: 10.66, lng: -61.52, label: "Caribs" },
  
  // Africa
  wci: { lat: 5.00, lng: -4.00, label: "WCI" },
  
  // Asia
  singapore: { lat: 1.35, lng: 103.82, label: "Singapore" },
  china: { lat: 31.23, lng: 121.47, label: "China" },
  fareast: { lat: 35.68, lng: 139.69, label: "Far East" },
};

// Default routes configuration
const DEFAULT_ROUTES = [
  { id: "ara-us", from: "ara", to: "usg", label: "ARA → US", region: "Transatlantic" },
  { id: "us-ara", from: "usg", to: "ara", label: "US → ARA", region: "Transatlantic" },
  { id: "ara-thames", from: "ara", to: "thames", label: "ARA → Thames", region: "Intermediate" },
  { id: "mongstad-ara", from: "mongstad", to: "ara", label: "Mongstad → ARA", region: "Intermediate" },
  { id: "ara-gothenburg", from: "ara", to: "gothenburg", label: "ARA → Gothenburg", region: "Intermediate" },
  { id: "gothenburg-ara", from: "gothenburg", to: "ara", label: "Gothenburg → ARA", region: "Intermediate" },
  { id: "klaipeda-ara", from: "klaipeda", to: "ara", label: "Klaipeda → ARA", region: "Intermediate" },
  { id: "ara-porvoo", from: "ara", to: "porvoo", label: "ARA → Porvoo", region: "Intermediate" },
  { id: "lehavre-ara", from: "lehavre", to: "ara", label: "Le Havre → ARA", region: "Intermediate" },
  { id: "bordeaux-ara", from: "bordeaux", to: "ara", label: "Bordeaux → ARA", region: "Intermediate" },
  { id: "ara-wmed", from: "ara", to: "wmed", label: "ARA → W.Med", region: "Med" },
  { id: "ara-cmed", from: "ara", to: "cmed", label: "ARA → C.Med", region: "Med" },
  { id: "ara-emed", from: "ara", to: "emed", label: "ARA → E.Med", region: "Med" },
  { id: "bsea-ara", from: "bsea", to: "ara", label: "Black Sea → ARA", region: "Med" },
  { id: "cmed-wmed", from: "cmed", to: "wmed", label: "C.Med → W.Med", region: "Med" },
  { id: "bsea-emed", from: "bsea", to: "emed", label: "Black Sea → E.Med", region: "Med" },
  { id: "ara-redsea", from: "ara", to: "redsea", label: "ARA → Red Sea", region: "Long Haul" },
  { id: "ara-wci", from: "ara", to: "wci", label: "ARA → WCI", region: "Long Haul" },
  { id: "ara-fareast", from: "ara", to: "fareast", label: "ARA → Far East", region: "Long Haul" },
  { id: "singapore-ara", from: "singapore", to: "ara", label: "Singapore → ARA", region: "Long Haul" },
  { id: "china-ara", from: "china", to: "ara", label: "China → ARA", region: "Long Haul" },
  { id: "ara-caribs", from: "ara", to: "caribs", label: "ARA → Caribs", region: "Transatlantic" },
  { id: "wci-ara", from: "wci", to: "ara", label: "WCI → ARA", region: "Long Haul" },
];

function FreightMapTab() {
  const [routes] = useState(DEFAULT_ROUTES);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [newRate, setNewRate] = useState("");
  const [filterRegion, setFilterRegion] = useState("All");
  const mapRef = useRef(null);

  const regions = ["All", "Intermediate", "Transatlantic", "Med", "Long Haul"];

  useEffect(() => {
    loadRateHistory();
  }, []);

  const loadRateHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("freight_rates")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setRateHistory(data || []);
    } catch (err) {
      console.error("Error loading rate history:", err);
    }
  };

  const addRate = async () => {
    if (!selectedRoute || !newRate) return;

    try {
      const { error } = await supabase.from("freight_rates").insert([{
        route_id: selectedRoute.id,
        route_label: selectedRoute.label,
        rate: newRate,
        region: selectedRoute.region
      }]);
      
      if (error) throw error;
      
      setNewRate("");
      loadRateHistory();
    } catch (err) {
      console.error("Error adding rate:", err);
    }
  };

  const deleteRate = async (id) => {
    try {
      const { error } = await supabase.from("freight_rates").delete().eq("id", id);
      if (error) throw error;
      loadRateHistory();
    } catch (err) {
      console.error("Error deleting rate:", err);
    }
  };

  const filteredRoutes = filterRegion === "All" 
    ? routes 
    : routes.filter(r => r.region === filterRegion);

  const getLatestRate = (routeId) => {
    const rates = rateHistory.filter(r => r.route_id === routeId);
    return rates.length > 0 ? rates[0] : null;
  };

  const getMarketStrength = (routeId) => {
    const rates = rateHistory.filter(r => r.route_id === routeId).slice(0, 5);
    if (rates.length < 2) return "neutral";
    
    const latest = parseFloat(rates[0].rate) || 0;
    const avg = rates.slice(1).reduce((sum, r) => sum + (parseFloat(r.rate) || 0), 0) / (rates.length - 1);
    
    const change = ((latest - avg) / avg) * 100;
    if (change > 5) return "strong";
    if (change < -5) return "weak";
    return "neutral";
  };

  const strengthColors = {
    strong: "#3fb950",
    neutral: "#f5a623",
    weak: "#ff6b6b"
  };

  // Mercator projection
  const project = (lat, lng) => {
    const x = ((lng + 180) / 360) * 1400;
    const y = ((90 - lat) / 180) * 700;
    return [x, y];
  };

  // Create curved path between two points
  const getCurvePath = (from, to) => {
    const [x1, y1] = project(MAJOR_PORTS[from].lat, MAJOR_PORTS[from].lng);
    const [x2, y2] = project(MAJOR_PORTS[to].lat, MAJOR_PORTS[to].lng);
    
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Control point for bezier curve
    const offset = Math.min(dist * 0.2, 100);
    const angle = Math.atan2(dy, dx) - Math.PI / 2;
    const cx = midX + offset * Math.cos(angle);
    const cy = midY + offset * Math.sin(angle);
    
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  // Get arrow position at end of path
  const getArrowPosition = (from, to) => {
    const [x2, y2] = project(MAJOR_PORTS[to].lat, MAJOR_PORTS[to].lng);
    const [x1, y1] = project(MAJOR_PORTS[from].lat, MAJOR_PORTS[from].lng);
    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    return { x: x2, y: y2, angle };
  };

  const ratesByRegion = rateHistory.reduce((acc, rate) => {
    if (!acc[rate.region]) acc[rate.region] = [];
    acc[rate.region].push(rate);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, overflow: "hidden" }}>
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
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Map</span>
          
          <select
            value={filterRegion}
            onChange={e => setFilterRegion(e.target.value)}
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
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 11, color: C.dim }}>
          Click on route to add rate · {rateHistory.length} rates tracked
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP */}
        <div style={{ 
          flex: 2,
          background: C.bg,
          border: "1px solid " + C.bd,
          borderRadius: 8,
          padding: 0,
          position: "relative",
          overflow: "hidden"
        }}>
          <svg
            ref={mapRef}
            viewBox="0 0 1400 700"
            style={{ 
              width: "100%", 
              height: "100%",
              background: "linear-gradient(180deg, #0a1628 0%, #162540 100%)"
            }}
          >
            {/* World map simplified outline */}
            <g opacity="0.15" stroke="#58a6ff" strokeWidth="1.5" fill="none">
              {/* Continents outline approximation */}
              <path d="M 150,150 L 200,140 L 280,120 L 360,130 L 400,140 L 440,135 L 480,145 L 500,155 L 520,150 L 540,160 L 560,155 L 580,165 L 600,160 L 620,170" />
              <path d="M 800,240 L 820,235 L 850,245 L 880,240 L 910,250 L 930,245" />
              <path d="M 200,280 L 250,270 L 300,285 L 350,280 L 400,290 L 430,285" />
              <path d="M 220,450 L 270,440 L 320,455 L 360,450 L 400,460" />
              <ellipse cx="1150" cy="280" rx="120" ry="90" />
            </g>

            {/* Dot grid background */}
            <g opacity="0.08" fill="#58a6ff">
              {Array.from({ length: 70 }).map((_, i) => 
                Array.from({ length: 140 }).map((_, j) => (
                  <circle key={`${i}-${j}`} cx={j * 10} cy={i * 10} r="0.5" />
                ))
              )}
            </g>

            {/* Routes */}
            {filteredRoutes.map(route => {
              const latestRate = getLatestRate(route.id);
              const strength = getMarketStrength(route.id);
              const isSelected = selectedRoute?.id === route.id;
              const path = getCurvePath(route.from, route.to);
              const arrowPos = getArrowPosition(route.from, route.to);

              return (
                <g key={route.id} onClick={() => setSelectedRoute(route)} style={{ cursor: "pointer" }}>
                  {/* Route line */}
                  <path
                    d={path}
                    stroke={isSelected ? "#58a6ff" : strengthColors[strength]}
                    strokeWidth={isSelected ? 3 : 2}
                    fill="none"
                    opacity={isSelected ? 1 : 0.7}
                    strokeDasharray={isSelected ? "none" : "5,5"}
                    style={{ transition: "all 0.2s" }}
                  />
                  
                  {/* Arrow */}
                  <g transform={`translate(${arrowPos.x}, ${arrowPos.y}) rotate(${arrowPos.angle})`}>
                    <path
                      d="M 0,0 L -8,-5 L -8,5 Z"
                      fill={isSelected ? "#58a6ff" : strengthColors[strength]}
                      opacity={isSelected ? 1 : 0.7}
                    />
                  </g>
                  
                  {/* Rate badge */}
                  {latestRate && (
                    <g>
                      {(() => {
                        const [mx, my] = project(
                          (MAJOR_PORTS[route.from].lat + MAJOR_PORTS[route.to].lat) / 2,
                          (MAJOR_PORTS[route.from].lng + MAJOR_PORTS[route.to].lng) / 2
                        );
                        return (
                          <>
                            <rect
                              x={mx - 30}
                              y={my - 12}
                              width="60"
                              height="24"
                              fill={C.bg2}
                              stroke={strengthColors[strength]}
                              strokeWidth="1"
                              rx="4"
                              opacity="0.95"
                            />
                            <text
                              x={mx}
                              y={my + 5}
                              textAnchor="middle"
                              fill={strengthColors[strength]}
                              fontSize="11"
                              fontWeight="700"
                            >
                              {latestRate.rate}
                            </text>
                          </>
                        );
                      })()}
                    </g>
                  )}
                </g>
              );
            })}

            {/* Ports */}
            {Object.entries(MAJOR_PORTS).map(([key, port]) => {
              const [x, y] = project(port.lat, port.lng);
              return (
                <g key={key}>
                  <circle cx={x} cy={y} r="4" fill="#58a6ff" opacity="0.8" />
                  <circle cx={x} cy={y} r="2" fill="#fff" />
                  <text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    fill="#a0c8ff"
                    fontSize="9"
                    fontWeight="600"
                  >
                    {port.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: "rgba(12, 23, 41, 0.92)",
            border: "1px solid " + C.bd,
            borderRadius: 6,
            padding: 10,
            backdropFilter: "blur(8px)"
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Market Strength
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[["strong", "Strong (+5%)"], ["neutral", "Neutral"], ["weak", "Weak (-5%)"]].map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 3, background: strengthColors[k] }} />
                  <span style={{ fontSize: 10, color: C.dim }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RATE PANEL */}
        <div style={{ 
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}>
          {/* Selected Route */}
          {selectedRoute ? (
            <div style={{
              background: C.bg2,
              border: "1px solid " + C.bd,
              borderRadius: 8,
              padding: 12
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 8 }}>
                {selectedRoute.label}
              </div>
              
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
                {selectedRoute.region}
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="Rate (WS)"
                  style={{
                    flex: 1,
                    background: C.bg3,
                    border: "1px solid " + C.bd,
                    borderRadius: 6,
                    color: C.tx,
                    fontSize: 12,
                    padding: "6px 10px",
                    outline: "none"
                  }}
                  onKeyDown={e => e.key === "Enter" && addRate()}
                />
                <button
                  onClick={addRate}
                  style={{
                    background: C.green,
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "6px 12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  Add
                </button>
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Recent Rates
              </div>
              <div style={{ 
                maxHeight: 200, 
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}>
                {rateHistory
                  .filter(r => r.route_id === selectedRoute.id)
                  .slice(0, 10)
                  .map(rate => {
                    const strength = getMarketStrength(rate.route_id);
                    return (
                      <div
                        key={rate.id}
                        style={{
                          background: C.bg3,
                          border: "1px solid " + C.bd,
                          borderRadius: 4,
                          padding: "6px 8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: strengthColors[strength] }}>
                            {rate.rate}
                          </span>
                          <span style={{ fontSize: 10, color: C.dim, marginLeft: 8 }}>
                            {new Date(rate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteRate(rate.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: C.red,
                            cursor: "pointer",
                            fontSize: 11,
                            opacity: 0.7
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div style={{
              background: C.bg2,
              border: "1px solid " + C.bd,
              borderRadius: 8,
              padding: 20,
              textAlign: "center",
              color: C.dim
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🗺️</div>
              <div style={{ fontSize: 12 }}>Click a route to add rates</div>
            </div>
          )}
        </div>
      </div>

      {/* RATE HISTORY */}
      <div style={{ 
        background: C.bg2,
        border: "1px solid " + C.bd,
        borderRadius: 8,
        padding: 12,
        maxHeight: 250,
        overflowY: "auto"
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 12 }}>
          📊 Rate History by Region
        </div>

        {Object.keys(ratesByRegion).length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 12 }}>
            No rates recorded yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(ratesByRegion).map(([region, rates]) => (
              <div key={region}>
                <div style={{ 
                  fontSize: 11, 
                  fontWeight: 700, 
                  color: C.amber, 
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  {region}
                </div>
                
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: 8
                }}>
                  {rates.slice(0, 20).map(rate => {
                    const strength = getMarketStrength(rate.route_id);
                    return (
                      <div
                        key={rate.id}
                        style={{
                          background: C.bg3,
                          border: "1px solid " + strengthColors[strength] + "44",
                          borderRadius: 6,
                          padding: "8px 10px"
                        }}
                      >
                        <div style={{ 
                          fontSize: 10, 
                          color: C.dim, 
                          marginBottom: 4,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}>
                          {rate.route_label}
                        </div>
                        <div style={{ 
                          fontSize: 13, 
                          fontWeight: 700, 
                          color: strengthColors[strength],
                          marginBottom: 2
                        }}>
                          {rate.rate}
                        </div>
                        <div style={{ fontSize: 9, color: C.faint }}>
                          {new Date(rate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FreightMapTab;
