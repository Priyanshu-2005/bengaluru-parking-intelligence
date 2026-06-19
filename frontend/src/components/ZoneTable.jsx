// Ranked enforcement table — the operational worklist. Sorted by priority (backend order).

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function bar(score) {
  const color = score >= 80 ? "#d7263d" : score >= 60 ? "#f46036" : score >= 40 ? "#f4b740" : "#3f88c5";
  return (
    <div className="score-bar">
      <div className="score-fill" style={{ width: `${score}%`, background: color }} />
      <span className="score-num">{score}</span>
    </div>
  );
}

export default function ZoneTable({ zones, total, selectedId, onSelect }) {
  return (
    <div className="zone-table">
      <div className="zone-table-head">
        <h2>Enforcement priority</h2>
        <span className="muted">
          {zones.length} of {total.toLocaleString()} zones
        </span>
      </div>
      <div className="zone-list">
        {zones.length === 0 && <div className="empty">No zones match this filter window.</div>}
        {zones.map((z) => (
          <button
            key={z.zone_id}
            className={`zone-row ${z.zone_id === selectedId ? "zone-row-sel" : ""}`}
            onClick={() => onSelect(z.zone_id)}
          >
            <div className="zone-rank">#{z.rank}</div>
            <div className="zone-main">
              <div className="zone-name">{z.police_station ?? "—"}</div>
              <div className="zone-sub">
                {z.junction_name !== "No Junction" ? z.junction_name : `${z.violations.toLocaleString()} violations`}
                {z.station_distance_m != null && ` · ~${formatDistance(z.station_distance_m)} away`}
              </div>
            </div>
            <div className="zone-scores">
              {bar(z.priority_score)}
              <div className="zone-score-meta">
                <span title="Congestion impact">⛔ {z.congestion_impact}</span>
                <span title="Hotspot intensity">🔥 {z.hotspot_score}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
