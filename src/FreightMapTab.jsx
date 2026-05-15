import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

// Port coordinates (percentage-based positioning on map image)
const MAJOR_PORTS = {
  ara: { x: 50.5, y: 31, label: "ARA" },
  thames: { x: 50, y: 31.5, label: "Thames" },
  mongstad: { x: 51, y: 26, label: "Mongstad" },
  gothenburg: { x: 52, y: 28, label: "Gothenburg" },
  porvoo: { x: 56, y: 26, label: "Porvoo" },
  klaipeda: { x: 55, y: 29, label: "Klaipeda" },
  lehavre: { x: 50, y: 32, label: "Le Havre" },
  bordeaux: { x: 49.5, y: 33, label: "Bordeaux" },
  wmed: { x: 51.5, y: 36, label: "W.Med" },
  cmed: { x: 53.5, y: 37, label: "C.Med" },
  emed: { x: 56.5, y: 38, label: "E.Med" },
  bsea: { x: 58.5, y: 33, label: "B.Sea" },
  redsea: { x: 60, y: 48, label: "Red Sea" },
  usg: { x: 20, y: 42, label: "US Gulf" },
  caribs: { x: 27, y: 48, label: "Caribs" },
  wci: { x: 48, y: 52, label: "WCI" },
  singapore: { x: 78, y: 54, label: "Singapore" },
  china: { x: 82, y: 40, label: "China" },
  fareast: { x: 85, y: 38, label: "Far East" },
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

  const ratesByRegion = rateHistory.reduce((acc, rate) => {
    if (!acc[rate.region]) acc[rate.region] = [];
    acc[rate.region].push(rate);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, overflow: "hidden", background: C.bg, padding: 12 }}>
      {/* HEADER */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Map</span>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none", cursor: "pointer" }}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setScale(s => Math.min(s + 0.2, 2))} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 14, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>+</button>
          <span style={{ fontSize: 11, color: C.dim }}>Zoom: {scale.toFixed(1)}x</span>
          <button onClick={() => setScale(s => Math.max(s - 0.2, 0.7))} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 14, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>−</button>
          <button onClick={() => setScale(1)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Reset</button>
          <span style={{ fontSize: 11, color: C.faint, marginLeft: 8 }}>{rateHistory.length} rates tracked</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* MAP */}
        <div style={{ flex: 2, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, position: "relative", overflow: "hidden" }}>
          {/* Background: Dark ocean-style world map using public domain image */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.15,
            filter: "brightness(0.4) contrast(1.2)"
          }} />

          {/* Routes overlay */}
          <svg viewBox="0 0 100 60" style={{ width: "100%", height: "100%", position: "absolute", transform: `scale(${scale})`, transition: "transform 0.2s" }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="0.3" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

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
                <g key={route.id} onClick={() => setSelectedRoute(route)} style={{ cursor: "pointer" }}>
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
                        fill="rgba(10, 22, 40, 0.95)"
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
            Click route to add rate · Use +/− buttons to zoom
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
              <div style={{ fontSize: 10, color: C.faint }}>Use +/− buttons to zoom</div>
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
