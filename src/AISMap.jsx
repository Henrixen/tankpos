import React, { useState, useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

mapboxgl.accessToken = "pk.eyJ1IjoiaGhlbnJpa3NlbiIsImEiOiJjbXBhcWMyczMwMDVnMnNzaHd6emI4ampuIn0.u98OZhtN61S6IK23gV6ZYg";

const COLORS = [
  "#58a6ff","#f778ba","#4ade80","#ea9a00","#a78bfa",
  "#fb923c","#22d3ee","#e879f9","#fbbf24","#60a5fa",
  "#f472b6","#86efac","#34d399","#f87171","#818cf8"
];

function bearing(p1, p2) {
  const toR = d => d * Math.PI / 180;
  const dLng = toR(p2[0] - p1[0]);
  const lat1 = toR(p1[1]), lat2 = toR(p2[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export default function AISMap({ selectedVessels = [], vessels = [], onAisVesselsChange }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [aisData, setAisData] = useState([]);
  const [hoveredVessel, setHoveredVessel] = useState(null);
  const popup = useRef(null);
  const colorMapRef = useRef({});
  const colorIdx = useRef(0);

  function getColor(name) {
    if (!colorMapRef.current[name]) {
      colorMapRef.current[name] = COLORS[colorIdx.current % COLORS.length];
      colorIdx.current++;
    }
    return colorMapRef.current[name];
  }

  // Fetch AIS data
  useEffect(() => {
    async function fetchAIS() {
      const { data, error } = await supabase
        .from("positions_ais")
        .select("*")
        .order("datetime", { ascending: true })
        .limit(2000);
      if (error) { console.error("AIS fetch error:", error); return; }
      setAisData(data || []);
      if (onAisVesselsChange) {
        const names = new Set((data||[]).map(d=>(d.vessel_name||"").toUpperCase().trim()).filter(Boolean));
        onAisVesselsChange(names);
      }
    }
    fetchAIS();
    const iv = setInterval(fetchAIS, 60000);
    return () => clearInterval(iv);
  }, []);

  // Init map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [15, 35],
      zoom: 2,
      projection: "mercator",
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.current.on("load", () => setMapLoaded(true));
    popup.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 12,
      className: "ais-popup" });
    return () => {
      if (map.current) { map.current.remove(); map.current = null; }
    };
  }, []);

  // Build GeoJSON and update layers whenever data/selection changes
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Group by vessel (normalized uppercase)
    const routes = {};
    aisData.forEach(p => {
      const name = (p.vessel_name || "Unknown").toUpperCase().trim();
      if (!routes[name]) routes[name] = [];
      routes[name].push(p);
    });
    // Already sorted ascending from fetch, but re-sort to be safe
    Object.values(routes).forEach(pts =>
      pts.sort((a,b) => new Date(a.datetime) - new Date(b.datetime))
    );

    const selectedUp = selectedVessels.map(s => s.toUpperCase().trim());
    const hasSelection = selectedUp.length > 0;

    // Build GeoJSON
    const dotsFeatures = [];
    const trailFeatures = [];
    const arrowFeatures = [];
    const latestFeatures = [];

    Object.entries(routes).forEach(([name, pts]) => {
      const validPts = pts.filter(p => p.latitude && p.longitude);
      if (!validPts.length) return;
      const color = getColor(name);
      const isSelected = selectedUp.some(s => s === name.toUpperCase().trim());
      const dimmed = hasSelection && !isSelected;
      if (hasSelection) console.log("AIS route:", name, "isSelected:", isSelected, "pts:", validPts.length, "selectedUp:", selectedUp);
      const latest = validPts[validPts.length - 1];

      // Latest dot for every vessel
      latestFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [latest.longitude, latest.latitude] },
        properties: {
          name, color,
          opacity: dimmed ? 0.25 : 1,
          radius: isSelected ? 7 : 5,
          destination: latest.destination || "",
          eta: latest.eta ? latest.eta.slice(0,10) : "",
          datetime: latest.datetime,
        }
      });

      // Trail + arrows for selected/hovered
      if (isSelected && validPts.length > 1) {
        // Trail line
        trailFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: validPts.map(p => [p.longitude, p.latitude]) },
          properties: { color, opacity: 0.8 }
        });

        // Historical dots
        validPts.slice(0, -1).forEach((p, i) => {
          dotsFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: { color, opacity: 0.5, radius: 3,
              datetime: p.datetime, name }
          });
        });

        // Arrow markers at midpoints between consecutive points
        for (let i = 0; i < validPts.length - 1; i++) {
          const p1 = validPts[i], p2 = validPts[i+1];
          const midLng = (p1.longitude + p2.longitude) / 2;
          const midLat = (p1.latitude + p2.latitude) / 2;
          const br = bearing([p1.longitude, p1.latitude], [p2.longitude, p2.latitude]);
          arrowFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [midLng, midLat] },
            properties: { color, bearing: br, name }
          });
        }
      }
    });

    const dotsGJ   = { type:"FeatureCollection", features: dotsFeatures };
    const trailsGJ = { type:"FeatureCollection", features: trailFeatures };
    const arrowsGJ = { type:"FeatureCollection", features: arrowFeatures };
    const latestGJ = { type:"FeatureCollection", features: latestFeatures };

    function setOrAdd(id, data, type, paint, layout={}) {
      if (map.current.getSource(id)) {
        map.current.getSource(id).setData(data);
      } else {
        map.current.addSource(id, { type: "geojson", data });
        map.current.addLayer({ id, type, source: id, paint, layout });
      }
    }

    // Trails
    setOrAdd("ais-trails", trailsGJ, "line", {
      "line-color": ["get","color"],
      "line-width": 2,
      "line-opacity": ["get","opacity"],
    }, { "line-join":"round","line-cap":"round" });

    // Historical dots
    setOrAdd("ais-dots", dotsGJ, "circle", {
      "circle-radius": ["get","radius"],
      "circle-color": ["get","color"],
      "circle-opacity": ["get","opacity"],
    });

    // Arrow symbols — uses built-in Mapbox arrow image
    if (!map.current.getLayer("ais-arrows")) {
      map.current.addSource("ais-arrows", { type:"geojson", data: arrowsGJ });
      map.current.addLayer({
        id: "ais-arrows", type: "symbol", source: "ais-arrows",
        layout: {
          "icon-image": "triangle-11",
          "icon-rotate": ["get","bearing"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-size": 0.8,
        },
        paint: { "icon-color": ["get","color"], "icon-opacity": 0.9 }
      });
    } else {
      map.current.getSource("ais-arrows").setData(arrowsGJ);
    }

    // Latest position dots (all vessels)
    setOrAdd("ais-latest", latestGJ, "circle", {
      "circle-radius": ["get","radius"],
      "circle-color": ["get","color"],
      "circle-opacity": ["get","opacity"],
      "circle-stroke-width": hasSelection ? ["case",["==",["get","opacity"],1],2,0] : 0,
      "circle-stroke-color": "#fff",
    });

    // Vessel name labels for selected
    if (!map.current.getLayer("ais-labels")) {
      map.current.addSource("ais-labels", { type:"geojson", data: latestGJ });
      map.current.addLayer({
        id: "ais-labels", type:"symbol", source:"ais-labels",
        filter: hasSelection
          ? ["in", ["get","name"], ["literal", selectedUp]]
          : ["literal", false],
        layout: {
          "text-field": ["get","name"],
          "text-size": 11,
          "text-font": ["DIN Offc Pro Bold","Arial Unicode MS Bold"],
          "text-offset": [0,-1.5],
          "text-anchor": "bottom",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": ["get","color"],
          "text-halo-color":"rgba(0,0,0,0.8)",
          "text-halo-width":1.5,
        }
      });
    } else {
      map.current.getSource("ais-labels").setData(latestGJ);
      map.current.setFilter("ais-labels", hasSelection
        ? ["in", ["get","name"], ["literal", selectedUp]]
        : ["literal", false]);
    }

    // Hover popup on latest dots
    map.current.off("mouseenter","ais-latest");
    map.current.off("mouseleave","ais-latest");
    map.current.on("mouseenter","ais-latest", e => {
      map.current.getCanvas().style.cursor = "pointer";
      const p = e.features[0].properties;
      const html = `<div style="font-family:Inter,sans-serif;font-size:11px;color:#cde;background:#0a1628;border:1px solid rgba(88,166,255,0.3);border-radius:6px;padding:7px 10px;min-width:120px">
        <div style="font-weight:700;color:${p.color};margin-bottom:3px">${p.name}</div>
        ${p.destination?`<div style="color:rgba(180,210,255,0.7)">→ ${p.destination}</div>`:""}
        ${p.eta?`<div style="color:rgba(140,170,210,0.5);font-size:10px">ETA ${p.eta}</div>`:""}
        <div style="color:rgba(100,130,180,0.4);font-size:9px;margin-top:3px">${p.datetime?p.datetime.slice(0,16).replace("T"," ")+" UTC":""}</div>
      </div>`;
      popup.current.setLngLat(e.features[0].geometry.coordinates).setHTML(html).addTo(map.current);
    });
    map.current.on("mouseleave","ais-latest", () => {
      map.current.getCanvas().style.cursor = "";
      popup.current.remove();
    });

  }, [mapLoaded, aisData, selectedVessels]);

  // Fly to selected vessel — or reset to world view
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const selectedUp = selectedVessels.map(s => s.toUpperCase().trim());

    if (!selectedUp.length) {
      map.current.flyTo({ center: [15, 30], zoom: 2, duration: 1000 });
      return;
    }

    const routes = {};
    aisData.forEach(p => {
      const name = (p.vessel_name||"Unknown").toUpperCase().trim();
      if (!routes[name]) routes[name]=[];
      routes[name].push(p);
    });

    const pts = selectedUp.flatMap(n => (routes[n]||[]).filter(p=>p.latitude&&p.longitude));
    if (!pts.length) return;

    if (pts.length === 1) {
      map.current.flyTo({ center:[pts[0].longitude, pts[0].latitude], zoom:7, duration:1200 });
    } else {
      const lngs = pts.map(p=>p.longitude), lats = pts.map(p=>p.latitude);
      map.current.fitBounds(
        [[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],
        { padding:80, duration:1200, maxZoom:9 }
      );
    }
  }, [JSON.stringify(selectedVessels), mapLoaded, aisData]);

  const vesselCount = [...new Set(aisData.map(p=>(p.vessel_name||"").toUpperCase()).filter(Boolean))].length;

  return (
    <div style={{background:C.bg2, border:"1px solid "+C.bd, borderRadius:7,
      overflow:"hidden", display:"flex", flexDirection:"column", height:"100%", position:"relative"}}>

      {/* Header */}
      <div style={{padding:"6px 10px", borderBottom:"1px solid "+C.bd2, background:C.bg,
        display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0}}>
        <span style={{fontSize:12, fontWeight:700, color:C.tx}}>🗺️ AIS Live Map</span>
        <span style={{fontSize:11, color:C.faint}}>
          {selectedVessels.length > 0
            ? selectedVessels.map(s=>s.charAt(0)+s.slice(1).toLowerCase()).join(", ")
            : `${vesselCount} vessels`}
        </span>
        {selectedVessels.length > 0 && (
          <span style={{fontSize:9,color:"rgba(255,200,0,0.7)",marginLeft:8}}>
            sel:{selectedVessels[0]} aisRows:{aisData.filter(p=>(p.vessel_name||"").toUpperCase().trim()===selectedVessels[0].toUpperCase().trim()).length}
          </span>
        )}
      </div>

      {/* Mapbox container */}
      <div ref={mapContainer} style={{flex:1, minHeight:0}}/>

      {/* Hint */}
      {selectedVessels.length === 0 && (
        <div style={{position:"absolute", bottom:18, left:"50%", transform:"translateX(-50%)",
          fontSize:10, color:C.faint, pointerEvents:"none",
          background:"rgba(8,14,26,0.7)", padding:"3px 10px", borderRadius:10}}>
          Click a vessel in the positions table to see its route
        </div>
      )}

      <style>{`
        .mapboxgl-popup-content { background:transparent !important; padding:0 !important; box-shadow:none !important; }
        .mapboxgl-popup-tip { display:none !important; }
      `}</style>
    </div>
  );
}
