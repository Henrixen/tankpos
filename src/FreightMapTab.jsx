import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

mapboxgl.accessToken = "pk.eyJ1IjoiaGhlbnJpa3NlbiIsImEiOiJjbXBhcWMyczMwMDVnMnNzaHd6emI4ampuIn0.u98OZhtN61S6IK23gV6ZYg";

// Sea routes with proper maritime waypoints
const ROUTES = [
  // INTERMEDIATE (NWE - show at high zoom)
  { id: "ara-thames", name: "ARA → Thames", region: "Intermediate", 
    coords: [[4.13, 51.95], [3.5, 51.7], [1.5, 51.5], [0.70, 51.45]], color: "#58a6ff", minZoom: 5 },
  { id: "mongstad-ara", name: "Mongstad → ARA", region: "Intermediate", 
    coords: [[5.03, 60.82], [4.5, 58], [4, 54], [4.13, 51.95]], color: "#58a6ff", minZoom: 5 },
  { id: "ara-gothenburg", name: "ARA → Gothenburg", region: "Intermediate", 
    coords: [[4.13, 51.95], [6, 54], [9, 56], [11.97, 57.70]], color: "#58a6ff", minZoom: 5 },
  { id: "gothenburg-ara", name: "Gothenburg → ARA", region: "Intermediate", 
    coords: [[11.97, 57.70], [9, 56], [6, 54], [4.13, 51.95]], color: "#58a6ff", minZoom: 5 },
  { id: "klaipeda-ara", name: "Klaipeda → ARA", region: "Intermediate", 
    coords: [[21.13, 55.71], [18, 55.5], [12, 56], [8, 56], [6, 54], [4.13, 51.95]], color: "#58a6ff", minZoom: 5 },
  { id: "ara-porvoo", name: "ARA → Porvoo", region: "Intermediate", 
    coords: [[4.13, 51.95], [6, 54], [10, 56], [18, 58], [25.66, 60.28]], color: "#58a6ff", minZoom: 5 },
  { id: "ara-dublin", name: "ARA → Dublin", region: "Intermediate", 
    coords: [[4.13, 51.95], [2, 52], [-2, 52.5], [-6.27, 53.35]], color: "#58a6ff", minZoom: 5 },
  { id: "tees-ara", name: "Tees → ARA", region: "Intermediate", 
    coords: [[-1.21, 54.57], [1, 53], [3, 52], [4.13, 51.95]], color: "#58a6ff", minZoom: 5 },
  
  // TRANSATLANTIC (show at medium zoom) - Around UK/Spain, across Atlantic
  { id: "ara-usg", name: "ARA → USG", region: "Transatlantic", 
    coords: [[4.13, 51.95], [-5, 50], [-15, 48], [-30, 45], [-50, 40], [-70, 35], [-90, 30], [-95.37, 29.76]], color: "#f5a623", minZoom: 3 },
  { id: "usg-ara", name: "USG → ARA", region: "Transatlantic", 
    coords: [[-95.37, 29.76], [-85, 32], [-65, 38], [-40, 43], [-20, 47], [-5, 49], [4.13, 51.95]], color: "#f5a623", minZoom: 3 },
  
  // MED (show at medium zoom) - Through Channel, around Spain/France
  { id: "ara-wmed", name: "ARA → W.Med", region: "Med", 
    coords: [[4.13, 51.95], [0, 50], [-5, 48], [-8, 44], [-5, 42], [2, 42], [5.37, 43.30]], color: "#3fb950", minZoom: 4 },
  { id: "ara-cmed", name: "ARA → C.Med", region: "Med", 
    coords: [[4.13, 51.95], [0, 50], [-5, 48], [-3, 43], [3, 41], [8, 40], [14.27, 40.85]], color: "#3fb950", minZoom: 4 },
  { id: "ara-emed", name: "ARA → E.Med", region: "Med", 
    coords: [[4.13, 51.95], [0, 50], [-5, 48], [-3, 43], [5, 40], [12, 38], [20, 37], [23.73, 37.98]], color: "#3fb950", minZoom: 4 },
  { id: "bsea-ara", name: "Black Sea → ARA", region: "Med", 
    coords: [[33.55, 44.48], [28, 41], [24, 39], [18, 38], [12, 40], [5, 42], [0, 46], [2, 49], [4.13, 51.95]], color: "#3fb950", minZoom: 4 },
  
  // LONG HAUL (show at all zooms) - Through Suez/Malacca
  { id: "ara-fareast", name: "ARA → Far East", region: "Long Haul", 
    coords: [[4.13, 51.95], [-5, 48], [-8, 40], [0, 36], [15, 33], [32, 30], [50, 25], [70, 20], [90, 10], [105, 5], [120, 15], [130, 25], [139.69, 35.68]], color: "#ff6b6b", minZoom: 2 },
  { id: "singapore-ara", name: "Singapore → ARA", region: "Long Haul", 
    coords: [[103.82, 1.35], [95, 5], [75, 12], [60, 18], [45, 20], [30, 25], [15, 32], [0, 38], [-5, 45], [0, 49], [4.13, 51.95]], color: "#ff6b6b", minZoom: 2 },
  { id: "china-ara", name: "China → ARA", region: "Long Haul", 
    coords: [[121.47, 31.23], [110, 20], [100, 8], [85, 10], [70, 15], [50, 20], [35, 25], [20, 30], [5, 38], [0, 46], [4.13, 51.95]], color: "#ff6b6b", minZoom: 2 },
];

function FreightMapTab() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(2.5);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [latestRates, setLatestRates] = useState({});
  const [newRate, setNewRate] = useState("");
  const [unit, setUnit] = useState("WS");
  const [comment, setComment] = useState("");
  const [filterRegion, setFilterRegion] = useState("All");
  const [editingRate, setEditingRate] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const regions = ["All", "Intermediate", "Transatlantic", "Med", "Long Haul"];

  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [15, 35],
      zoom: 2.5,
      projection: "mercator",
      renderWorldCopies: false
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      addRoutesToMap();
    });

    map.current.on("zoom", () => {
      setCurrentZoom(map.current.getZoom());
    });

    return () => {
      if (map.current) map.current.remove();
    };
  }, []);

  useEffect(() => {
    loadRateHistory();
  }, []);

  useEffect(() => {
    if (mapLoaded) {
      updateRoutes();
    }
  }, [latestRates, filterRegion, currentZoom, mapLoaded]);

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

  const addRoutesToMap = () => {
    if (!map.current) return;

    map.current.addSource("routes", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      }
    });

    map.current.addLayer({
      id: "route-lines",
      type: "line",
      source: "routes",
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "width"],
        "line-opacity": 0.8
      },
      layout: {
        "line-join": "round",
        "line-cap": "round"
      }
    });

    map.current.on("click", "route-lines", (e) => {
      const routeId = e.features[0].properties.id;
      const route = ROUTES.find(r => r.id === routeId);
      if (route) setSelectedRoute(route);
    });

    map.current.on("mouseenter", "route-lines", () => {
      map.current.getCanvas().style.cursor = "pointer";
    });

    map.current.on("mouseleave", "route-lines", () => {
      map.current.getCanvas().style.cursor = "";
    });
  };

  const updateRoutes = () => {
    if (!map.current || !map.current.getSource("routes")) return;

    const zoom = map.current.getZoom();
    let filteredRoutes = filterRegion === "All" ? ROUTES : ROUTES.filter(r => r.region === filterRegion);
    filteredRoutes = filteredRoutes.filter(r => zoom >= r.minZoom);

    const features = filteredRoutes.map(route => {
      const latestRate = latestRates[route.id];
      return {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: route.coords
        },
        properties: {
          id: route.id,
          name: route.name,
          region: route.region,
          color: route.color,
          width: latestRate ? 4 : 2,
          rate: latestRate?.rate || null
        }
      };
    });

    map.current.getSource("routes").setData({
      type: "FeatureCollection",
      features: features
    });

    // Add labels
    document.querySelectorAll(".route-label").forEach(el => el.remove());

    filteredRoutes.forEach(route => {
      const latestRate = latestRates[route.id];
      if (latestRate) {
        const midIdx = Math.floor(route.coords.length / 2);
        const midpoint = route.coords[midIdx];

        const el = document.createElement("div");
        el.className = "route-label";
        el.style.cssText = `
          background: rgba(10, 22, 40, 0.95);
          border: 2px solid ${route.color};
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 11px;
          color: ${route.color};
          white-space: nowrap;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
        `;
        
        const formattedRate = latestRate.unit === "WS" 
          ? `WS ${latestRate.rate}`
          : `USD ${parseFloat(latestRate.rate).toLocaleString('en-US').replace(/,/g, ' ')}`;
        
        el.innerHTML = `
          <div style="font-size: 9px; opacity: 0.8; margin-bottom: 2px;">${route.name}</div>
          <div style="font-size: 14px; font-weight: 700;">${formattedRate}</div>
        `;
        el.onclick = () => setSelectedRoute(route);

        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(midpoint)
          .addTo(map.current);
      }
    });
  };

  const formatRateInput = (value, unit) => {
    if (unit === "WS") {
      return `WS ${value}`;
    } else {
      const num = parseFloat(value);
      return `USD ${num.toLocaleString('en-US').replace(/,/g, ' ')}`;
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

  const updateRate = async (id, newRateValue, newComment) => {
    try {
      const { error } = await supabase
        .from("freight_route_rates")
        .update({ rate: parseFloat(newRateValue), comment: newComment || null })
        .eq("id", id);

      if (error) throw error;
      setEditingRate(null);
      loadRateHistory();
    } catch (err) {
      console.error("Error updating rate:", err);
    }
  };

  const deleteRate = async (id) => {
    try {
      const { error } = await supabase.from("freight_route_rates").delete().eq("id", id);
      if (error) throw error;
      setShowDeleteConfirm(null);
      loadRateHistory();
    } catch (err) {
      console.error("Error deleting rate:", err);
    }
  };

  const filteredHistory = filterRegion === "All" ? rateHistory : rateHistory.filter(r => r.region === filterRegion);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Map</span>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none", cursor: "pointer" }}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.faint }}>Zoom: {currentZoom.toFixed(1)}x · {rateHistory.length} rates</span>
        </div>
      </div>

      <div ref={mapContainer} style={{ flex: 1, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow: "hidden", minHeight: 600 }} />

      {/* Add/Edit Rate Modal */}
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
                  placeholder="150 or 550000"
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
              {newRate && <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>Will display as: {formatRateInput(newRate, unit)}</div>}
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

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998 }} onClick={() => setShowDeleteConfirm(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 9999, background: C.bg2, border: "1px solid rgba(248,113,113,0.4)", borderRadius: 12, width: 400, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Delete this rate?</div>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, background: "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: C.dim, fontSize: 12, fontWeight: 600, padding: "8px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => deleteRate(showDeleteConfirm)} style={{ flex: 1, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", borderRadius: 6, color: "#f87171", fontSize: 12, fontWeight: 700, padding: "8px", cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Rate History Table */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16, maxHeight: 250, overflowY: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 12 }}>📊 Rate History</div>
        {filteredHistory.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
            <div>No rates recorded yet</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Click a route on the map to add your first rate</div>
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
                const isEditing = editingRate === rate.id;
                const formattedRate = rate.unit === "WS" 
                  ? `WS ${rate.rate}`
                  : `USD ${parseFloat(rate.rate).toLocaleString('en-US').replace(/,/g, ' ')}`;

                return (
                  <tr key={rate.id} style={{ background: i % 2 === 0 ? C.bg3 : C.bg }}>
                    <td style={{ padding: "10px 8px", fontSize: 12, color: C.tx, fontWeight: 600 }}>{rate.route_name}</td>
                    <td style={{ padding: "10px 8px", fontSize: 11, color: C.dim }}>{rate.region}</td>
                    <td style={{ padding: "10px 8px", fontSize: 14, fontWeight: 700, color: route?.color || C.blue, textAlign: "center" }}>
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={rate.rate}
                          onBlur={e => updateRate(rate.id, e.target.value, rate.comment)}
                          autoFocus
                          style={{ width: 80, background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: "4px 6px", textAlign: "center" }}
                        />
                      ) : (
                        <span onDoubleClick={() => setEditingRate(rate.id)} style={{ cursor: "pointer" }}>{formattedRate}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 11, color: C.dim, fontStyle: rate.comment ? "normal" : "italic", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rate.comment || "—"}
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center" }}>
                      {new Date(rate.entry_date).toLocaleDateString("en-GB")}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <button onClick={() => setShowDeleteConfirm(rate.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, opacity: 0.7, padding: 4 }}>
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
