import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

const MAJOR_PORTS = {
  ara: { lat: 51.95, lng: 4.13, label: "ARA", x: 51, y: 25 },
  thames: { lat: 51.45, lng: 0.70, label: "Thames", x: 50, y: 26 },
  mongstad: { lat: 60.82, lng: 5.03, label: "Mongstad", x: 51, y: 18 },
  gothenburg: { lat: 57.70, lng: 11.97, label: "Gothenburg", x: 53, y: 20 },
  porvoo: { lat: 60.28, lng: 25.66, label: "Porvoo", x: 57, y: 18 },
  klaipeda: { lat: 55.71, lng: 21.13, label: "Klaipeda", x: 56, y: 21 },
  lehavre: { lat: 49.49, lng: 0.11, label: "Le Havre", x: 50, y: 28 },
  bordeaux: { lat: 44.84, lng: -0.57, label: "Bordeaux", x: 49.5, y: 31 },
  wmed: { lat: 43.30, lng: 5.37, label: "W.Med", x: 51.5, y: 32 },
  cmed: { lat: 40.85, lng: 14.27, label: "C.Med", x: 54, y: 35 },
  emed: { lat: 37.98, lng: 23.73, label: "E.Med", x: 57, y: 36 },
  bsea: { lat: 44.48, lng: 33.55, label: "B.Sea", x: 59, y: 31 },
  redsea: { lat: 20.00, lng: 38.00, label: "Red Sea", x: 60, y: 48 },
  usg: { lat: 29.76, lng: -95.37, label: "US Gulf", x: 20, y: 40 },
  caribs: { lat: 10.66, lng: -61.52, label: "Caribs", x: 27, y: 50 },
  wci: { lat: 5.00, lng: -4.00, label: "WCI", x: 48, y: 54 },
  singapore: { lat: 1.35, lng: 103.82, label: "Singapore", x: 78, y: 55 },
  china: { lat: 31.23, lng: 121.47, label: "China", x: 82, y: 40 },
  fareast: { lat: 35.68, lng: 139.69, label: "Far East", x: 85, y: 37 },
};

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
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef(null);

  const regions = ["All", "Intermediate", "Transatlantic", "Med", "Long Haul"];
  const strengthColors = { strong: "#3fb950", neutral: "#f5a623", weak: "#ff6b6b" };

  useEffect(() => {
    loadRateHistory();
  }, []);

  const loadRateHistory = async () => {
    try {
      const { data, error } = await supabase.from("freight_rates").select("*").order("created_at", { ascending: false });
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

  const filteredRoutes = filterRegion === "All" ? routes : routes.filter(r => r.region === filterRegion);

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

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.max(0.5, Math.min(3, s * delta)));
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleRouteClick = (route, e) => {
    e.stopPropagation();
    setSelectedRoute(route);
  };

  const ratesByRegion = rateHistory.reduce((acc, rate) => {
    if (!acc[rate.region]) acc[rate.region] = [];
    acc[rate.region].push(rate);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, overflow: "hidden", background: C.bg }}>
      {/* HEADER */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Map</span>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none", cursor: "pointer" }}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.dim }}>Zoom: {scale.toFixed(1)}x</span>
          <button onClick={() => setScale(s => Math.min(s + 0.3, 3))} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 14, fontWeight: 700, padding: "4px 10px", cursor: "pointer", lineHeight: 1 }}>+</button>
          <button onClick={() => setScale(s => Math.max(s - 0.3, 0.5))} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 14, fontWeight: 700, padding: "4px 10px", cursor: "pointer", lineHeight: 1 }}>−</button>
          <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Reset</button>
          <span style={{ fontSize: 11, color: C.faint, marginLeft: 8 }}>{rateHistory.length} rates tracked</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP */}
        <div 
          ref={mapContainerRef}
          style={{ 
            flex: 2, 
            background: "linear-gradient(180deg, #0a1628 0%, #0d1b2e 50%, #162540 100%)", 
            border: "1px solid " + C.bd, 
            borderRadius: 8, 
            position: "relative", 
            overflow: "hidden",
            cursor: isDragging ? "grabbing" : "grab"
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.1s ease-out"
          }}>
            {/* World Map Background */}
            <svg viewBox="0 0 100 60" style={{ width: "100%", height: "100%", position: "absolute" }}>
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              
              {/* Simplified world continents */}
              <g opacity="0.15" stroke="#58a6ff" strokeWidth="0.3" fill="none">
                <path d="M 10,15 L 15,12 L 20,14 L 25,13 L 28,16 L 26,22 L 23,26 L 20,28 L 17,27 L 14,24 L 11,20 Z" />
                <path d="M 22,32 L 25,30 L 28,31 L 30,34 L 29,38 L 27,41 L 24,42 L 22,40 L 21,36 Z" />
                <path d="M 45,12 L 50,11 L 56,13 L 60,15 L 58,19 L 55,20 L 51,19 L 47,17 Z" />
                <path d="M 47,24 L 52,23 L 56,25 L 59,29 L 58,34 L 55,38 L 51,40 L 47,39 L 44,35 L 45,30 Z" />
                <path d="M 60,11 L 70,10 L 78,12 L 83,15 L 85,20 L 83,24 L 78,25 L 70,23 L 63,20 L 60,16 Z" />
                <path d="M 72,43 L 77,42 L 82,44 L 85,47 L 84,51 L 81,53 L 76,52 L 72,49 Z" />
              </g>

              {/* Routes */}
              {filteredRoutes.map(route => {
                const from = MAJOR_PORTS[route.from];
                const to = MAJOR_PORTS[route.to];
                if (!from || !to) return null;

                const latestRate = getLatestRate(route.id);
                const strength = getMarketStrength(route.id);
                const isSelected = selectedRoute?.id === route.id;
                const color = isSelected ? "#58a6ff" : strengthColors[strength];

                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;

                return (
                  <g key={route.id} onClick={(e) => handleRouteClick(route, e)} style={{ cursor: "pointer" }}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={color}
                      strokeWidth={isSelected ? 0.4 : 0.25}
                      strokeDasharray="0.8,0.8"
                      opacity={isSelected ? 1 : 0.7}
                      filter={isSelected ? "url(#glow)" : ""}
                    />
                    <polygon
                      points={`${to.x},${to.y} ${to.x-0.6},${to.y-0.4} ${to.x-0.6},${to.y+0.4}`}
                      fill={color}
                      opacity={isSelected ? 1 : 0.7}
                    />
                    {latestRate && (
                      <g>
                        <rect
                          x={midX - 2.5}
                          y={midY - 0.8}
                          width="5"
                          height="1.6"
                          fill="rgba(12, 23, 41, 0.95)"
                          stroke={color}
                          strokeWidth="0.08"
                          rx="0.2"
                        />
                        <text
                          x={midX}
                          y={midY + 0.5}
                          textAnchor="middle"
                          fill={color}
                          fontSize="0.8"
                          fontWeight="700"
                        >
                          {latestRate.rate}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Ports */}
              {Object.entries(MAJOR_PORTS).map(([key, port]) => (
                <g key={key}>
                  <circle cx={port.x} cy={port.y} r="0.4" fill="#58a6ff" opacity="0.3" />
                  <circle cx={port.x} cy={port.y} r="0.25" fill="#58a6ff" />
                  <circle cx={port.x} cy={port.y} r="0.12" fill="#fff" />
                  <text
                    x={port.x}
                    y={port.y - 0.7}
                    textAnchor="middle"
                    fill="#a0c8ff"
                    fontSize="0.65"
                    fontWeight="600"
                  >
                    {port.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Legend */}
          <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(12, 23, 41, 0.92)", border: "1px solid " + C.bd, borderRadius: 6, padding: 10, backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Market Strength</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[["strong", "Strong (+5%)"], ["neutral", "Neutral"], ["weak", "Weak (-5%)"]].map(([k, label]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 16, height: 3, background: strengthColors[k] }} />
                  <span style={{ fontSize: 10, color: C.dim }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(12, 23, 41, 0.85)", border: "1px solid " + C.bd, borderRadius: 6, padding: "6px 10px", fontSize: 10, color: C.dim }}>
            Scroll to zoom · Drag to pan · Click route to add rate
          </div>
        </div>

        {/* RATE PANEL */}
        <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          {selectedRoute ? (
            <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 8 }}>{selectedRoute.label}</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>{selectedRoute.region}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="Rate (WS)"
                  style={{ flex: 1, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addRate()}
                />
                <button onClick={addRate} style={{ background: "linear-gradient(135deg, #3fb950 0%, #2ecc71 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, padding: "6px 12px", cursor: "pointer", boxShadow: "0 2px 8px rgba(63,185,80,0.3)" }}>Add</button>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Recent Rates</div>
              <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {rateHistory.filter(r => r.route_id === selectedRoute.id).slice(0, 10).map(rate => {
                  const strength = getMarketStrength(rate.route_id);
                  return (
                    <div key={rate.id} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: strengthColors[strength] }}>{rate.rate}</span>
                        <span style={{ fontSize: 10, color: C.dim, marginLeft: 8 }}>{new Date(rate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                      </div>
                      <button onClick={() => deleteRate(rate.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, opacity: 0.7 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 20, textAlign: "center", color: C.dim }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Click a route to add rates</div>
              <div style={{ fontSize: 10, color: C.faint }}>Scroll to zoom · Drag to pan</div>
            </div>
          )}
        </div>
      </div>

      {/* RATE HISTORY */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, maxHeight: 250, overflowY: "auto" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 12 }}>📊 Rate History by Region</div>
        {Object.keys(ratesByRegion).length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 12 }}>No rates recorded yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(ratesByRegion).map(([region, rates]) => (
              <div key={region}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{region}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                  {rates.slice(0, 20).map(rate => {
                    const strength = getMarketStrength(rate.route_id);
                    return (
                      <div key={rate.id} style={{ background: C.bg3, border: "1px solid " + strengthColors[strength] + "44", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rate.route_label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: strengthColors[strength], marginBottom: 2 }}>{rate.rate}</div>
                        <div style={{ fontSize: 9, color: C.faint }}>{new Date(rate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
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
