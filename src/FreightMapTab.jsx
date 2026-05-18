import React, { useState, useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

// Set Mapbox access token
mapboxgl.accessToken = "pk.eyJ1IjoiaGhlbnJpa3NlbiIsImEiOiJjbXBhcWMyczMwMDVnMnNzaHd6emI4ampuIn0.u98OZhtN61S6IK23gV6ZYg";

const ROUTES = [
  { id: "ara-usg", name: "ARA → US Gulf", region: "Transatlantic", coords: [[4.13, 51.95], [-95.37, 29.76]], color: "#f5a623" },
  { id: "usg-ara", name: "US Gulf → ARA", region: "Transatlantic", coords: [[-95.37, 29.76], [4.13, 51.95]], color: "#f5a623" },
  { id: "ara-thames", name: "ARA → Thames", region: "Intermediate", coords: [[4.13, 51.95], [0.70, 51.45]], color: "#58a6ff" },
  { id: "mongstad-ara", name: "Mongstad → ARA", region: "Intermediate", coords: [[5.03, 60.82], [4.13, 51.95]], color: "#58a6ff" },
  { id: "ara-gothenburg", name: "ARA → Gothenburg", region: "Intermediate", coords: [[4.13, 51.95], [11.97, 57.70]], color: "#58a6ff" },
  { id: "gothenburg-ara", name: "Gothenburg → ARA", region: "Intermediate", coords: [[11.97, 57.70], [4.13, 51.95]], color: "#58a6ff" },
  { id: "klaipeda-ara", name: "Klaipeda → ARA", region: "Intermediate", coords: [[21.13, 55.71], [4.13, 51.95]], color: "#58a6ff" },
  { id: "ara-porvoo", name: "ARA → Porvoo", region: "Intermediate", coords: [[4.13, 51.95], [25.66, 60.28]], color: "#58a6ff" },
  { id: "ara-wmed", name: "ARA → W.Med", region: "Med", coords: [[4.13, 51.95], [5.37, 43.30]], color: "#3fb950" },
  { id: "ara-cmed", name: "ARA → C.Med", region: "Med", coords: [[4.13, 51.95], [14.27, 40.85]], color: "#3fb950" },
  { id: "ara-emed", name: "ARA → E.Med", region: "Med", coords: [[4.13, 51.95], [23.73, 37.98]], color: "#3fb950" },
  { id: "bsea-ara", name: "Black Sea → ARA", region: "Med", coords: [[33.55, 44.48], [4.13, 51.95]], color: "#3fb950" },
  { id: "ara-fareast", name: "ARA → Far East", region: "Long Haul", coords: [[4.13, 51.95], [139.69, 35.68]], color: "#ff6b6b" },
  { id: "singapore-ara", name: "Singapore → ARA", region: "Long Haul", coords: [[103.82, 1.35], [4.13, 51.95]], color: "#ff6b6b" },
  { id: "china-ara", name: "China → ARA", region: "Long Haul", coords: [[121.47, 31.23], [4.13, 51.95]], color: "#ff6b6b" },
];

function FreightMapTab() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [rateHistory, setRateHistory] = useState([]);
  const [latestRates, setLatestRates] = useState({});
  const [newRate, setNewRate] = useState("");
  const [unit, setUnit] = useState("WS");
  const [comment, setComment] = useState("");
  const [filterRegion, setFilterRegion] = useState("All");

  const regions = ["All", "Intermediate", "Transatlantic", "Med", "Long Haul"];

  useEffect(() => {
    if (map.current) return; // Initialize map only once

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [15, 35],
      zoom: 2.5,
      projection: "mercator"
    });

    map.current.on("load", () => {
      setMapLoaded(true);
      addRoutesToMap();
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
  }, [latestRates, filterRegion, mapLoaded]);

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

    // Add source for all routes
    map.current.addSource("routes", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      }
    });

    // Add line layer
    map.current.addLayer({
      id: "route-lines",
      type: "line",
      source: "routes",
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "width"],
        "line-opacity": 0.8
      }
    });

    // Add click handler
    map.current.on("click", "route-lines", (e) => {
      const routeId = e.features[0].properties.id;
      const route = ROUTES.find(r => r.id === routeId);
      if (route) setSelectedRoute(route);
    });

    // Change cursor on hover
    map.current.on("mouseenter", "route-lines", () => {
      map.current.getCanvas().style.cursor = "pointer";
    });

    map.current.on("mouseleave", "route-lines", () => {
      map.current.getCanvas().style.cursor = "";
    });
  };

  const updateRoutes = () => {
    if (!map.current || !map.current.getSource("routes")) return;

    const filteredRoutes = filterRegion === "All" ? ROUTES : ROUTES.filter(r => r.region === filterRegion);

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

    // Add markers for rates
    document.querySelectorAll(".rate-marker").forEach(el => el.remove());

    filteredRoutes.forEach(route => {
      const latestRate = latestRates[route.id];
      if (latestRate) {
        const midpoint = [
          (route.coords[0][0] + route.coords[1][0]) / 2,
          (route.coords[0][1] + route.coords[1][1]) / 2
        ];

        const el = document.createElement("div");
        el.className = "rate-marker";
        el.style.cssText = `
          background: rgba(10, 22, 40, 0.95);
          border: 2px solid ${route.color};
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 700;
          color: ${route.color};
          white-space: nowrap;
          cursor: pointer;
        `;
        el.textContent = `${latestRate.rate} ${latestRate.unit}`;
        el.onclick = () => setSelectedRoute(route);

        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(midpoint)
          .addTo(map.current);
      }
    });
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

  const filteredHistory = filterRegion === "All" ? rateHistory : rateHistory.filter(r => r.region === filterRegion);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
      {/* Header */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>🌍 Global Freight Map</span>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "6px 10px", outline: "none", cursor: "pointer" }}>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 11, color: C.faint }}>Click any route to add rates · {rateHistory.length} rates tracked</span>
      </div>

      {/* Map */}
      <div ref={mapContainer} style={{ flex: 1, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow: "hidden", minHeight: 450 }} />

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
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16, maxHeight: 280, overflowY: "auto" }}>
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
