import { useEffect, useMemo, useRef, useState } from "react";
import { mappls } from "mappls-web-maps";

// Mappls (MapmyIndia) Web SDK. Needs a token/REST key from apps.mappls.com with the Map SDK
// product enabled, and the serving domain (localhost + your Vercel URL) whitelisted on the key.
const MAPPLS_KEY = import.meta.env.VITE_MAPPLS_KEY;

// Mappls Map property center uses [lat, lng].
const BENGALURU_CENTER = [12.9716, 77.5946];

const mapplsClassObject = new mappls();

const SRC_ID = "zones-src";
const CIRCLE_LAYER = "zones-circles";
const HEAT_LAYER = "zones-heat";

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Color a zone by its priority band (shared by markers + legend).
function scoreColor(score) {
  if (score >= 80) return "#d7263d"; // critical
  if (score >= 60) return "#f46036"; // high
  if (score >= 40) return "#f4b740"; // medium
  return "#3f88c5"; // low
}

// Build the GeoJSON the GL circle + heatmap layers render from. GeoJSON coords are [lng, lat].
function zonesToGeoJSON(zones, weightBy, maxViol, maxWeight, selectedId) {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      properties: {
        zone_id: z.zone_id,
        color: scoreColor(z.priority_score),
        // sqrt so high-volume zones don't dominate the canvas
        radius: 5 + 16 * Math.sqrt((z.violations || 0) / maxViol),
        weight: (z[weightBy] || 0) / maxWeight,
        selected: z.zone_id === selectedId ? 1 : 0,
        rank: z.rank,
        police_station: z.police_station,
        junction_name: z.junction_name,
        station_distance_m: z.station_distance_m ?? null,
        priority_score: z.priority_score,
        congestion_impact: z.congestion_impact,
        violations: z.violations,
      },
      geometry: { type: "Point", coordinates: [z.centroid_lon, z.centroid_lat] },
    })),
  };
}

export default function HotspotMap({ zones, selectedId, onSelect, weightBy, onWeightChange }) {
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(null);
  const fittedRef = useRef(false);
  // keep latest onSelect without re-binding the map click handler
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const maxViol = useMemo(() => Math.max(...zones.map((z) => z.violations || 0), 1), [zones]);

  // --- Initialize the Mappls map once ---
  useEffect(() => {
    if (!MAPPLS_KEY) return;
    let cancelled = false;
    mapplsClassObject.initialize(MAPPLS_KEY, { map: true }, () => {
      if (cancelled) return;
      const map = mapplsClassObject.Map({
        id: "mappls-map",
        properties: { center: BENGALURU_CENTER, zoom: 11, zoomControl: true, scaleControl: false },
      });
      map.on("load", () => {
        if (cancelled) return;
        mapRef.current = map;
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      try {
        mapRef.current?.remove();
      } catch {
        /* noop */
      }
      mapRef.current = null;
      setReady(false);
      fittedRef.current = false;
    };
  }, []);

  // --- Push zone data into the GL source + layers (re-runs on filter/selection change) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !zones.length) return;

    const maxWeight = Math.max(...zones.map((z) => z[weightBy] || 0), 1);
    const data = zonesToGeoJSON(zones, weightBy, maxViol, maxWeight, selectedId);

    const existing = map.getSource(SRC_ID);
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource(SRC_ID, { type: "geojson", data });

      map.addLayer({
        id: HEAT_LAYER,
        type: "heatmap",
        source: SRC_ID,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": 1,
          "heatmap-radius": 28,
          "heatmap-opacity": 0.7,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.3, "#3f88c5",
            0.5, "#f4b740",
            0.7, "#f46036",
            0.9, "#d7263d",
          ],
        },
      });

      map.addLayer({
        id: CIRCLE_LAYER,
        type: "circle",
        source: SRC_ID,
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.65,
          "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "#ffffff", ["get", "color"]],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 3, 1],
        },
      });

      map.on("click", CIRCLE_LAYER, (e) => {
        const f = e.features?.[0];
        if (f) onSelectRef.current(f.properties.zone_id);
      });
      map.on("mousemove", CIRCLE_LAYER, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = "pointer";
        setHover({ x: e.point.x, y: e.point.y, p: f.properties });
      });
      map.on("mouseleave", CIRCLE_LAYER, () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
    }

    // First time we have data, frame the city to the actual zone spread.
    if (!fittedRef.current) {
      let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
      zones.forEach((z) => {
        minLng = Math.min(minLng, z.centroid_lon);
        maxLng = Math.max(maxLng, z.centroid_lon);
        minLat = Math.min(minLat, z.centroid_lat);
        maxLat = Math.max(maxLat, z.centroid_lat);
      });
      try {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, duration: 0 });
      } catch {
        /* noop */
      }
      fittedRef.current = true;
    }
  }, [ready, zones, weightBy, selectedId, maxViol]);

  // --- Fly to the selected zone ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || selectedId == null) return;
    const z = zones.find((x) => x.zone_id === selectedId);
    if (z) {
      try {
        map.flyTo({ center: [z.centroid_lon, z.centroid_lat], zoom: 16, duration: 800 });
      } catch {
        /* noop */
      }
    }
  }, [ready, selectedId, zones]);

  return (
    <div className="map-wrap">
      <div className="map-controls">
        <label>Heat by</label>
        <select value={weightBy} onChange={(e) => onWeightChange(e.target.value)}>
          <option value="priority_score">Enforcement priority</option>
          <option value="congestion_impact">Congestion impact</option>
          <option value="hotspot_score">Hotspot intensity</option>
          <option value="violations">Raw violations</option>
        </select>
        <div className="legend">
          <span><i style={{ background: "#d7263d" }} />80+</span>
          <span><i style={{ background: "#f46036" }} />60+</span>
          <span><i style={{ background: "#f4b740" }} />40+</span>
          <span><i style={{ background: "#3f88c5" }} />&lt;40</span>
        </div>
      </div>

      {MAPPLS_KEY ? (
        <div id="mappls-map" className="mappls-map" />
      ) : (
        <div className="mappls-map map-fallback">
          Set <code>VITE_MAPPLS_KEY</code> in <code>frontend/.env</code> to load the Mappls map.
        </div>
      )}

      {hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}>
          <strong>#{hover.p.rank} · {hover.p.police_station}</strong>
          {hover.p.station_distance_m != null &&
            ` (~${formatDistance(hover.p.station_distance_m)} from station)`}
          <br />
          {hover.p.junction_name && hover.p.junction_name !== "No Junction" ? hover.p.junction_name : "—"}
          <br />
          Priority {hover.p.priority_score} · Congestion {hover.p.congestion_impact}
          <br />
          {Number(hover.p.violations).toLocaleString()} violations
        </div>
      )}
    </div>
  );
}
