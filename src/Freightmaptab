import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

// Default freight routes with coordinates
const DEFAULT_ROUTES = [
  { id: "ara-us", label: "ARA → US", from: [51.95, 4.13], to: [29.76, -95.37], region: "Transatlantic" },
  { id: "us-ara", label: "US → ARA", from: [29.76, -95.37], to: [51.95, 4.13], region: "Transatlantic" },
  { id: "ara-thames", label: "ARA → Thames", from: [51.95, 4.13], to: [51.45, 0.70], region: "Intermediate" },
  { id: "wcuk-ara", label: "WCUK → ARA", from: [51.71, -5.03], to: [51.95, 4.13], region: "Intermediate" },
  { id: "mongstad-ara", label: "Mongstad → ARA", from: [60.82, 5.03], to: [51.95, 4.13], region: "Intermediate" },
  { id: "ara-gothenburg", label: "ARA → Gothenburg", from: [51.95, 4.13], to: [57.70, 11.97], region: "Intermediate" },
  { id: "gothenburg-ara", label: "Gothenburg → ARA", from: [57.70, 11.97], to: [51.95, 4.13], region: "Intermediate" },
  { id: "klaipeda-ara", label: "Klaipeda → ARA", from: [55.71, 21.13], to: [51.95, 4.13], region: "Intermediate" },
  { id: "ara-porvoo", label: "ARA → Porvoo", from: [51.95, 4.13], to: [60.28, 25.66], region: "Intermediate" },
  { id: "lehavre-ara", label: "Le Havre → ARA", from: [49.49, 0.11], to: [51.95, 4.13], region: "Intermediate" },
  { id: "bordeaux-ara", label: "Bordeaux → ARA", from: [44.84, -0.57], to: [51.95, 4.13], region: "Intermediate" },
  { id: "ara-wmed", label: "ARA → WMed", from: [51.95, 4.13], to: [43.30, 5.37], region: "Med" },
  { id: "ara-cmed", label: "ARA → CMed", from: [51.95, 4.13], to: [40.85, 14.27], region: "Med" },
  { id: "ara-emed", label: "ARA → EMed", from: [51.95, 4.13], to: [37.98, 23.73], region: "Med" },
  { id: "bsea-ara", label: "Black Sea → ARA", from: [44.48, 33.55], to: [51.95, 4.13], region: "Med" },
  { id: "cmed-wmed", label: "CMed → WMed", from: [40.85, 14.27], to: [43.30, 5.37], region: "Med" },
  { id: "ara-redsea", label: "ARA → Red Sea", from: [51.95, 4.13], to: [20.00, 38.00], region: "Long Haul" },
  { id: "ara-wci", label: "ARA → WCI", from: [51.95, 4.13], to: [5.00, -4.00], region: "Long Haul" },
  { id: "ara-fareast", label: "ARA → Far East", from: [51.95, 4.13], to: [1.35, 103.82], region: "Long Haul" },
  { id: "singapore-ara", label: "Singapore → ARA", from: [1.35, 103.82], to: [51.95, 4.13], region: "Long Haul" },
  { id: "china-ara", label: "China → ARA", from: [31.23, 121.47], to: [51.95, 4.13], region: "Long Haul" },
  { id: "ara-caribs", label: "ARA → Caribs", from: [51.95, 4.13], to: [10.66, -61.52], region: "Transatlantic" },
  { id: "wci-ara", label: "WCI → ARA (Suez)", from: [5.00, -4.00], to: [51.95, 4.13], region: "Long Haul" },
  { id: "bsea-emed", label: "Black Sea → EMed", from: [44.48, 33.55], to: [37.98, 23.73], region: "Med" }
];

function FreightMapTab() {
  const [routes, setRoutes] = useState(DEFAULT_ROUTES);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [newRate, setNewRate] = useState("");
  const [filterRegion, setFilterRegion] = useState("All");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
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

  const addCustomRoute = () => {
    const newRoute = {
      id: `custom-${Date.now()}`,
      label: "New Route",
      from: [51.95, 4.13],
      to: [40.85, 14.27],
      region: "Custom"
    };
    setRoutes([...routes, newRoute]);
    setEditingRoute(newRoute);
  };

  const updateRoute = (routeId, updates) => {
    setRoutes(routes.map(r => r.id === routeId ? { ...r, ...updates } : r));
  };

  const deleteRoute = async (routeId) => {
    // Delete associated rates first
    try {
      await supabase.from("freight_rates").delete().eq("route_id", routeId);
    } catch (err) {
      console.error("Error deleting route rates:", err);
    }
    setRoutes(routes.filter(r => r.id !== routeId));
    if (selectedRoute?.id === routeId) setSelectedRoute(null);
  };

  const filteredRoutes = filterRegion === "All" 
    ? routes 
    : routes.filter(r => r.region === filterRegion);

  // Get latest rate for a route
  const getLatestRate = (routeId) => {
    const rates = rateHistory.filter(r => r.route_id === routeId);
    return rates.length > 0 ? rates[0] : null;
  };

  // Calculate market strength (simple version based on rate changes)
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

  // Convert lat/lng to SVG coordinates
  const projectPoint = (lat, lng) => {
    const x = ((lng + 180) / 360) * 1000;
    const y = ((90 - lat) / 180) * 500;
    return [x * zoom + pan.x, y * zoom + pan.y];
  };

  const handleMapClick = (e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicking near a route
    filteredRoutes.forEach(route => {
      const [x1, y1] = projectPoint(route.from[0], route.from[1]);
      const [x2, y2] = projectPoint(route.to[0], route.to[1]);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      
      const dist = Math.sqrt((x - midX) ** 2 + (y - midY) ** 2);
      if (dist < 20) {
        setSelectedRoute(route);
      }
    });
  };

  // Group rate history by region
  const ratesByRegion = rateHistory.reduce((acc, rate) => {
    if (!acc[rate.region]) acc[rate.region] = [];
    acc[rate.region].push(rate);
    return acc;
  }, {});

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100%", 
      gap: 12,
      overflow: "hidden"
    }}>
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.blue }}>🌍 Freight Map</span>
          
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
              cursor: "pointer",
              marginLeft: 12
            }}
          >
            {regions.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setZoom(z => Math.min(z + 0.2, 3))}
            style={{
              background: C.bg3,
              border: "1px solid " + C.bd,
              borderRadius: 6,
              color: C.tx,
              fontSize: 12,
              padding: "6px 12px",
              cursor: "pointer"
            }}
          >
            🔍 Zoom In
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))}
            style={{
              background: C.bg3,
              border: "1px solid " + C.bd,
              borderRadius: 6,
              color: C.tx,
              fontSize: 12,
              padding: "6px 12px",
              cursor: "pointer"
            }}
          >
            🔍 Zoom Out
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            style={{
              background: C.bg3,
              border: "1px solid " + C.bd,
              borderRadius: 6,
              color: C.tx,
              fontSize: 12,
              padding: "6px 12px",
              cursor: "pointer"
            }}
          >
            Reset
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: showSettings ? C.blue : C.bg3,
              border: "1px solid " + C.bd,
              borderRadius: 6,
              color: showSettings ? C.bg : C.tx,
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 12px",
              cursor: "pointer"
            }}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP */}
        <div style={{ 
          flex: 2,
          background: C.bg2,
          border: "1px solid " + C.bd,
          borderRadius: 8,
          padding: 16,
          position: "relative",
          overflow: "hidden"
        }}>
          <svg
            ref={mapRef}
            viewBox="0 0 1000 500"
            style={{ 
              width: "100%", 
              height: "100%", 
              background: "#0a1628",
              cursor: "grab"
            }}
            onClick={handleMapClick}
          >
            {/* World map outline (simplified) */}
            <g opacity="0.2" stroke="#58a6ff" strokeWidth="0.5" fill="none">
              <path d="M 200,250 L 300,200 L 400,220 L 500,240 L 600,230 L 700,250 L 800,260" />
              <path d="M 150,300 L 200,280 L 250,290 L 300,280 L 350,300" />
              <circle cx="515" cy="420" r="40" />
            </g>

            {/* Routes */}
            {filteredRoutes.map(route => {
              const [x1, y1] = projectPoint(route.from[0], route.from[1]);
              const [x2, y2] = projectPoint(route.to[0], route.to[1]);
              const latestRate = getLatestRate(route.id);
              const strength = getMarketStrength(route.id);
              const isSelected = selectedRoute?.id === route.id;

              return (
                <g key={route.id}>
                  {/* Route line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isSelected ? C.blue : strengthColors[strength]}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray="5,5"
                    opacity={isSelected ? 1 : 0.6}
                  />
                  
                  {/* Arrow */}
                  <polygon
                    points={`${x2},${y2} ${x2-8},${y2-4} ${x2-8},${y2+4}`}
                    fill={isSelected ? C.blue : strengthColors[strength]}
                    opacity={isSelected ? 1 : 0.6}
                  />
                  
                  {/* Rate label */}
                  {latestRate && (
                    <g>
                      <rect
                        x={(x1 + x2) / 2 - 25}
                        y={(y1 + y2) / 2 - 12}
                        width="50"
                        height="24"
                        fill={C.bg3}
                        stroke={strengthColors[strength]}
                        strokeWidth="1"
                        rx="4"
                      />
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 + 4}
                        textAnchor="middle"
                        fill={strengthColors[strength]}
                        fontSize="11"
                        fontWeight="700"
                      >
                        {latestRate.rate}
                      </text>
                    </g>
                  )}
                  
                  {/* From/To markers */}
                  <circle cx={x1} cy={y1} r="3" fill="#58a6ff" />
                  <circle cx={x2} cy={y2} r="3" fill="#3fb950" />
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            background: C.bg3,
            border: "1px solid " + C.bd,
            borderRadius: 6,
            padding: 10
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 6 }}>
              Market Strength
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 3, background: strengthColors.strong }} />
                <span style={{ fontSize: 11, color: C.dim }}>Strong (+5%)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 3, background: strengthColors.neutral }} />
                <span style={{ fontSize: 11, color: C.dim }}>Neutral</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 3, background: strengthColors.weak }} />
                <span style={{ fontSize: 11, color: C.dim }}>Weak (-5%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* RATE PANEL */}
        <div style={{ 
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}>
          {/* Selected Route Info */}
          {selectedRoute && (
            <div style={{
              background: C.bg2,
              border: "1px solid " + C.bd,
              borderRadius: 8,
              padding: 12
            }}>
              <div style={{ 
                fontSize: 14, 
                fontWeight: 700, 
                color: C.blue, 
                marginBottom: 8 
              }}>
                {selectedRoute.label}
              </div>
              
              <div style={{ 
                fontSize: 11, 
                color: C.dim, 
                marginBottom: 12 
              }}>
                Region: {selectedRoute.region}
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="Enter rate (WS)"
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
                />
                <button
                  onClick={addRate}
                  style={{
                    background: C.green,
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "6px 14px",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  Add Rate
                </button>
              </div>

              {/* Latest rates for this route */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 6 }}>
                Recent Rates
              </div>
              <div style={{ 
                maxHeight: 150, 
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}>
                {rateHistory
                  .filter(r => r.route_id === selectedRoute.id)
                  .slice(0, 10)
                  .map(rate => (
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>
                          {rate.rate}
                        </span>
                        <span style={{ fontSize: 11, color: C.dim, marginLeft: 8 }}>
                          {new Date(rate.created_at).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteRate(rate.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: C.red,
                          cursor: "pointer",
                          fontSize: 12,
                          opacity: 0.7
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {showSettings && (
            <div style={{
              background: C.bg2,
              border: "1px solid " + C.bd,
              borderRadius: 8,
              padding: 12
            }}>
              <div style={{ 
                fontSize: 13, 
                fontWeight: 700, 
                color: C.blue, 
                marginBottom: 12 
              }}>
                Route Settings
              </div>
              
              <button
                onClick={addCustomRoute}
                style={{
                  width: "100%",
                  background: C.green,
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "8px 12px",
                  cursor: "pointer",
                  marginBottom: 12
                }}
              >
                + Add Custom Route
              </button>

              <div style={{ 
                maxHeight: 300, 
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}>
                {routes.map(route => (
                  <div
                    key={route.id}
                    style={{
                      background: C.bg3,
                      border: "1px solid " + C.bd,
                      borderRadius: 6,
                      padding: "8px 10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>
                        {route.label}
                      </div>
                      <div style={{ fontSize: 10, color: C.dim }}>
                        {route.region}
                      </div>
                    </div>
                    {route.id.startsWith("custom-") && (
                      <button
                        onClick={() => deleteRoute(route.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: C.red,
                          cursor: "pointer",
                          fontSize: 12,
                          opacity: 0.7
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RATE HISTORY TABLE */}
      <div style={{ 
        background: C.bg2,
        border: "1px solid " + C.bd,
        borderRadius: 8,
        padding: 12,
        maxHeight: 300,
        overflowY: "auto"
      }}>
        <div style={{ 
          fontSize: 13, 
          fontWeight: 700, 
          color: C.blue, 
          marginBottom: 12 
        }}>
          📊 Rate History by Region
        </div>

        {Object.keys(ratesByRegion).length === 0 ? (
          <div style={{ 
            padding: 20, 
            textAlign: "center", 
            color: C.faint 
          }}>
            No rates recorded yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(ratesByRegion).map(([region, rates]) => (
              <div key={region}>
                <div style={{ 
                  fontSize: 12, 
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
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
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
                          fontSize: 11, 
                          color: C.dim, 
                          marginBottom: 4,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}>
                          {rate.route_label}
                        </div>
                        <div style={{ 
                          fontSize: 14, 
                          fontWeight: 700, 
                          color: strengthColors[strength],
                          marginBottom: 2
                        }}>
                          {rate.rate}
                        </div>
                        <div style={{ fontSize: 10, color: C.faint }}>
                          {new Date(rate.created_at).toLocaleDateString("en-GB")}
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
