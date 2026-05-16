import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

const ROUTES = [
  { id: "ara-usg", name: "ARA → US Gulf", region: "Transatlantic", color: "#f5a623" },
  { id: "usg-ara", name: "US Gulf → ARA", region: "Transatlantic", color: "#f5a623" },
  { id: "ara-thames", name: "ARA → Thames", region: "Intermediate", color: "#58a6ff" },
  { id: "mongstad-ara", name: "Mongstad → ARA", region: "Intermediate", color: "#58a6ff" },
  { id: "ara-gothenburg", name: "ARA → Gothenburg", region: "Intermediate", color: "#58a6ff" },
  { id: "gothenburg-ara", name: "Gothenburg → ARA", region: "Intermediate", color: "#58a6ff" },
  { id: "klaipeda-ara", name: "Klaipeda → ARA", region: "Intermediate", color: "#58a6ff" },
  { id: "ara-porvoo", name: "ARA → Porvoo", region: "Intermediate", color: "#58a6ff" },
  { id: "ara-wmed", name: "ARA → W.Med", region: "Med", color: "#3fb950" },
  { id: "ara-cmed", name: "ARA → C.Med", region: "Med", color: "#3fb950" },
  { id: "ara-emed", name: "ARA → E.Med", region: "Med", color: "#3fb950" },
  { id: "bsea-ara", name: "Black Sea → ARA", region: "Med", color: "#3fb950" },
  { id: "ara-fareast", name: "ARA → Far East", region: "Long Haul", color: "#ff6b6b" },
  { id: "singapore-ara", name: "Singapore → ARA", region: "Long Haul", color: "#ff6b6b" },
  { id: "china-ara", name: "China → ARA", region: "Long Haul", color: "#ff6b6b" },
];

function FreightMapTab() {
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [latestRates, setLatestRates] = useState({});
  const [newRate, setNewRate] = useState("");
  const [unit, setUnit] = useState("WS");
  const [comment, setComment] = useState("");
  const [filterRegion, setFilterRegion] = useState("All");

  const regions = ["All", "Intermediate", "Transatlantic", "Med", "Long Haul"];

  useEffect(() => {
    loadRateHistory();
  }, []);

  const loadRateHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("freight_route_rates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRateHistory(data || []);

      const latest = {};
      (data || []).forEach(rate => {
        if (!latest[rate.route_id]) {
          latest[rate.route_id] = rate;
        }
      });
      setLatestRates(latest);
    } catch (err) {
      console.error("Error loading rate history:", err);
    }
  };

  const addRate = async () => {
    if (!selectedRoute || !newRate) return;

    try {
      const { error } = await supabase.from("freight_route_rates").insert([{
        route_id: selectedRoute.id,
        route_name: selectedRoute.name,
        region: selectedRoute.region,
        from_port: selectedRoute.name.split(" → ")[0],
        to_port: selectedRoute.name.split(" → ")[1],
        rate: parseFloat(newRate),
        unit: unit,
        comment: comment || null,
        entry_date: new Date().toISOString().split("T")[0]
      }]);

      if (error) throw error;

      setNewRate("");
      setComment("");
      setSelectedRoute(null);
      loadRateHistory();
    } catch (err) {
      console.error("Error adding rate:", err);
      alert("Error adding rate: " + err.message);
    }
  };

  const deleteRate = async (id) => {
    if (!confirm("Delete this rate?")) return;
    try {
      const { error } = await supabase.from("freight_route_rates").delete().eq("id", id);
      if (error) throw error;
      loadRateHistory();
    } catch (err) {
      console.error("Error deleting rate:", err);
    }
  };

  const filteredRoutes = filterRegion === "All" ? ROUTES : ROUTES.filter(r => r.region === filterRegion);
  const filteredHistory = filterRegion === "All" ? rateHistory : rateHistory.filter(r => r.region === filterRegion);

  // Group routes by region for display
  const routesByRegion = filteredRoutes.reduce((acc, route) => {
    if (!acc[route.region]) acc[route.region] = [];
    acc[route.region].push(route);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
      {/* Header */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Routes</span>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none", cursor: "pointer" }}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 11, color: C.faint }}>Click any route to add rates · {rateHistory.length} rates tracked</span>
      </div>

      {/* Routes Grid by Region */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.entries(routesByRegion).map(([region, routes]) => (
          <div key={region} style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: routes[0].color, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {region}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {routes.map(route => {
                const latestRate = latestRates[route.id];
                const isSelected = selectedRoute?.id === route.id;

                return (
                  <div
                    key={route.id}
                    onClick={() => setSelectedRoute(route)}
                    style={{
                      background: isSelected ? `linear-gradient(135deg, ${route.color}15 0%, ${route.color}08 100%)` : C.bg3,
                      border: `1px solid ${isSelected ? route.color : C.bd}`,
                      borderRadius: 8,
                      padding: 14,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      position: "relative"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{route.name}</div>
                      </div>
                      {latestRate && (
                        <div style={{ background: route.color + "22", border: `1px solid ${route.color}`, borderRadius: 6, padding: "6px 10px", marginLeft: 8 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: route.color, textAlign: "center" }}>{latestRate.rate}</div>
                          <div style={{ fontSize: 9, color: C.dim, textAlign: "center" }}>{latestRate.unit}</div>
                        </div>
                      )}
                    </div>
                    {latestRate ? (
                      <div style={{ fontSize: 10, color: C.faint }}>
                        Updated {new Date(latestRate.entry_date).toLocaleDateString("en-GB")}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: C.faint, fontStyle: "italic" }}>No rate added yet</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Rate Editor Modal */}
      {selectedRoute && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998, backdropFilter: "blur(2px)" }} onClick={() => setSelectedRoute(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 9999, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 12, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.8)", padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: selectedRoute.color, marginBottom: 4 }}>{selectedRoute.name}</div>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>{selectedRoute.region}</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 4, fontWeight: 600 }}>Rate</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  step="0.01"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="150"
                  autoFocus
                  style={{ flex: 1, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 12px", outline: "none" }}
                  onKeyDown={e => e.key === "Enter" && addRate()}
                />
                <select value={unit} onChange={e => setUnit(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 12px", outline: "none", cursor: "pointer" }}>
                  <option value="WS">WS</option>
                  <option value="USD LS">USD LS</option>
                  <option value="USD PMT">USD PMT</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 4, fontWeight: 600 }}>Comment (optional)</label>
              <input
                type="text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Market notes..."
                style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "8px 12px", outline: "none" }}
                onKeyDown={e => e.key === "Enter" && addRate()}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setSelectedRoute(null)} style={{ background: "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: C.dim, fontSize: 12, fontWeight: 600, padding: "8px 16px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={addRate} disabled={!newRate} style={{ background: newRate ? "linear-gradient(135deg, #3fb950 0%, #2ecc71 100%)" : C.bg3, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: newRate ? "pointer" : "not-allowed", boxShadow: newRate ? "0 2px 8px rgba(63,185,80,0.3)" : "none", opacity: newRate ? 1 : 0.5 }}>
                Save Rate
              </button>
            </div>
          </div>
        </>
      )}

      {/* Rate History Table */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16, maxHeight: 320, overflowY: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 12 }}>📊 Rate History</div>
        {filteredHistory.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
            <div>No rates recorded yet</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Click a route above to add your first rate</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
            <thead>
              <tr style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Route</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Region</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700 }}>Rate</th>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700 }}>Comment</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700 }}>Date</th>
                <th style={{ textAlign: "center", padding: "6px 8px", width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((rate, i) => {
                const route = ROUTES.find(r => r.id === rate.route_id);
                return (
                  <tr key={rate.id} style={{ background: i % 2 === 0 ? C.bg3 : C.bg }}>
                    <td style={{ padding: "10px 8px", fontSize: 12, color: C.tx, fontWeight: 600 }}>{rate.route_name}</td>
                    <td style={{ padding: "10px 8px", fontSize: 11, color: C.dim }}>{rate.region}</td>
                    <td style={{ padding: "10px 8px", fontSize: 14, fontWeight: 700, color: route?.color || C.blue, textAlign: "center" }}>
                      {rate.rate} <span style={{ fontSize: 10, fontWeight: 400 }}>{rate.unit}</span>
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 11, color: C.dim, fontStyle: rate.comment ? "normal" : "italic", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rate.comment || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center" }}>
                      {new Date(rate.entry_date).toLocaleDateString("en-GB")}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <button onClick={() => deleteRate(rate.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, opacity: 0.7, padding: 4 }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default FreightMapTab;
