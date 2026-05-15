import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

const DEFAULT_ROUTES = [
  { id: "ara-us", from: "ARA", to: "US Gulf", label: "ARA → US", region: "Transatlantic", fromCoords: [51.95, 4.13], toCoords: [29.76, -95.37] },
  { id: "us-ara", from: "US Gulf", to: "ARA", label: "US → ARA", region: "Transatlantic", fromCoords: [29.76, -95.37], toCoords: [51.95, 4.13] },
  { id: "ara-thames", from: "ARA", to: "Thames", label: "ARA → Thames", region: "Intermediate", fromCoords: [51.95, 4.13], toCoords: [51.45, 0.70] },
  { id: "mongstad-ara", from: "Mongstad", to: "ARA", label: "Mongstad → ARA", region: "Intermediate", fromCoords: [60.82, 5.03], toCoords: [51.95, 4.13] },
  { id: "ara-gothenburg", from: "ARA", to: "Gothenburg", label: "ARA → Gothenburg", region: "Intermediate", fromCoords: [51.95, 4.13], toCoords: [57.70, 11.97] },
  { id: "ara-wmed", from: "ARA", to: "W.Med", label: "ARA → W.Med", region: "Med", fromCoords: [51.95, 4.13], toCoords: [43.30, 5.37] },
  { id: "ara-emed", from: "ARA", to: "E.Med", label: "ARA → E.Med", region: "Med", fromCoords: [51.95, 4.13], toCoords: [37.98, 23.73] },
  { id: "ara-fareast", from: "ARA", to: "Far East", label: "ARA → Far East", region: "Long Haul", fromCoords: [51.95, 4.13], toCoords: [35.68, 139.69] },
  { id: "singapore-ara", from: "Singapore", to: "ARA", label: "Singapore → ARA", region: "Long Haul", fromCoords: [1.35, 103.82], toCoords: [51.95, 4.13] },
  { id: "china-ara", from: "China", to: "ARA", label: "China → ARA", region: "Long Haul", fromCoords: [31.23, 121.47], toCoords: [51.95, 4.13] },
];

function FreightMapTab() {
  const [routes] = useState(DEFAULT_ROUTES);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [newRate, setNewRate] = useState("");
  const [filterRegion, setFilterRegion] = useState("All");

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
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Routes</span>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none", cursor: "pointer" }}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 11, color: C.faint }}>{rateHistory.length} rates tracked</span>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* ROUTES LIST - Replacing map with clear route cards */}
        <div style={{ flex: 1, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Shipping Routes</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filteredRoutes.map(route => {
              const latestRate = getLatestRate(route.id);
              const strength = latestRate ? getMarketStrength(route.id) : "neutral";
              const isSelected = selectedRoute?.id === route.id;

              return (
                <div
                  key={route.id}
                  onClick={() => setSelectedRoute(route)}
                  style={{
                    background: isSelected ? "linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.15) 100%)" : C.bg3,
                    border: "1px solid " + (isSelected ? C.blue : C.bd),
                    borderRadius: 8,
                    padding: 12,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    position: "relative"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 4 }}>{route.label}</div>
                      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>{route.region}</div>
                    </div>
                    {latestRate && (
                      <div style={{ background: strengthColors[strength] + "22", border: "1px solid " + strengthColors[strength], borderRadius: 4, padding: "4px 8px" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: strengthColors[strength] }}>{latestRate.rate}</div>
                        <div style={{ fontSize: 8, color: C.dim, textAlign: "center" }}>WS</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>{route.from}</span>
                    <span style={{ color: strengthColors[strength] }}>→</span>
                    <span>{route.to}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RATE PANEL */}
        <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 12 }}>
          {selectedRoute ? (
            <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.blue, marginBottom: 6 }}>{selectedRoute.label}</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>{selectedRoute.region}</div>
              
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <input
                  type="text"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="Rate (WS)"
                  style={{ flex: 1, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 12px", outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addRate()}
                />
                <button onClick={addRate} style={{ background: "linear-gradient(135deg, #3fb950 0%, #2ecc71 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(63,185,80,0.3)" }}>Add Rate</button>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Rate History</div>
              <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {rateHistory.filter(r => r.route_id === selectedRoute.id).slice(0, 15).map(rate => {
                  const strength = getMarketStrength(rate.route_id);
                  return (
                    <div key={rate.id} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: strengthColors[strength] }}>{rate.rate}</span>
                        <span style={{ fontSize: 9, color: C.dim, marginLeft: 6 }}>WS</span>
                        <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{new Date(rate.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      </div>
                      <button onClick={() => deleteRate(rate.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13, opacity: 0.7, padding: 4 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 24, textAlign: "center", color: C.dim }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Select a Route</div>
              <div style={{ fontSize: 11, color: C.faint }}>Click any route card to add rates and view history</div>
            </div>
          )}
        </div>
      </div>

      {/* RATE HISTORY BY REGION */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16, maxHeight: 280, overflowY: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 12 }}>📊 Recent Activity by Region</div>
        {Object.keys(ratesByRegion).length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 12 }}>No rates recorded yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(ratesByRegion).map(([region, rates]) => (
              <div key={region}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{region}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {rates.slice(0, 12).map(rate => {
                    const strength = getMarketStrength(rate.route_id);
                    return (
                      <div key={rate.id} style={{ background: C.bg3, border: "1px solid " + strengthColors[strength] + "44", borderRadius: 6, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, color: C.dim, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rate.route_label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: strengthColors[strength], marginBottom: 2 }}>{rate.rate}</div>
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
