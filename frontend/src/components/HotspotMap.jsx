import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

const BENGALURU_CENTER = [12.9716, 77.5946];

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Color a zone by its score band (shared by markers + legend).
function scoreColor(score) {
  if (score >= 80) return "#d7263d"; // critical
  if (score >= 60) return "#f46036"; // high
  if (score >= 40) return "#f4b740"; // medium
  return "#3f88c5"; // low
}

// Heat layer driven by the chosen weight metric. leaflet.heat isn't a react-leaflet component,
// so we attach it imperatively to the map instance and rebuild it when inputs change.
function HeatLayer({ zones, weightBy }) {
  const map = useMap();
  useEffect(() => {
    if (!zones.length) return;
    const max = Math.max(...zones.map((z) => z[weightBy] || 0), 1);
    const points = zones.map((z) => [z.centroid_lat, z.centroid_lon, (z[weightBy] || 0) / max]);
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 16,
      gradient: { 0.3: "#3f88c5", 0.5: "#f4b740", 0.7: "#f46036", 0.9: "#d7263d" },
    }).addTo(map);
    return () => map.removeLayer(layer);
  }, [map, zones, weightBy]);
  return null;
}

// Pan/zoom to the selected zone when it changes.
function FlyToSelected({ zones, selectedId }) {
  const map = useMap();
  useEffect(() => {
    if (selectedId == null) return;
    const z = zones.find((x) => x.zone_id === selectedId);
    if (z) map.flyTo([z.centroid_lat, z.centroid_lon], 16, { duration: 0.6 });
  }, [map, zones, selectedId]);
  return null;
}

export default function HotspotMap({ zones, selectedId, onSelect, weightBy, onWeightChange }) {
  // Marker radius scales with violation volume (sqrt so big zones don't dominate the canvas).
  const maxViol = useMemo(() => Math.max(...zones.map((z) => z.violations || 0), 1), [zones]);

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
      <MapContainer center={BENGALURU_CENTER} zoom={12} className="leaflet-map" preferCanvas>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
        />
        <HeatLayer zones={zones} weightBy={weightBy} />
        <FlyToSelected zones={zones} selectedId={selectedId} />
        {zones.map((z) => {
          const r = 5 + 16 * Math.sqrt((z.violations || 0) / maxViol);
          const isSel = z.zone_id === selectedId;
          return (
            <CircleMarker
              key={z.zone_id}
              center={[z.centroid_lat, z.centroid_lon]}
              radius={isSel ? r + 4 : r}
              pathOptions={{
                color: isSel ? "#ffffff" : scoreColor(z.priority_score),
                weight: isSel ? 3 : 1,
                fillColor: scoreColor(z.priority_score),
                fillOpacity: 0.65,
              }}
              eventHandlers={{ click: () => onSelect(z.zone_id) }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <strong>#{z.rank} · {z.police_station}</strong>
                {z.station_distance_m != null && ` (~${formatDistance(z.station_distance_m)} from station)`}
                <br />
                {z.junction_name !== "No Junction" ? z.junction_name : "—"}
                <br />
                Priority {z.priority_score} · Congestion {z.congestion_impact}
                <br />
                {z.violations.toLocaleString()} violations
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
