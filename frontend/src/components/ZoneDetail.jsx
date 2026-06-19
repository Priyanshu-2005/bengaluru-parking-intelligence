import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { api } from "../api";

// Slide-over drill-down for one zone: hour-of-day profile, day-of-week profile, and the
// violation-type mix that drives its congestion-impact score. Fetched within the active window.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ZoneDetail({ zoneId, baseZone, filters, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    api.zoneDetail(zoneId, filters).then(setDetail).catch((e) => setError(e.message));
  }, [zoneId, filters]);

  const hourData = detail
    ? Object.entries(detail.by_hour).map(([h, c]) => ({ label: String(h).padStart(2, "0"), count: c }))
    : [];
  const dowData = detail
    ? DAYS.map((d) => ({ label: d.slice(0, 3), count: detail.by_dow[d] || 0 }))
    : [];
  const typeData = detail
    ? Object.entries(detail.by_violation_type).slice(0, 7).map(([t, c]) => ({ label: t, count: c }))
    : [];

  return (
    <>
      <div className="detail-scrim" onClick={onClose} />
      <aside className="detail-panel">
        <button className="detail-close" onClick={onClose}>✕</button>

        <div className="detail-header">
          <div className="detail-rank">#{baseZone?.rank}</div>
          <div>
            <h2>{baseZone?.police_station ?? `Zone ${zoneId}`}</h2>
            <p className="muted">
              {baseZone?.junction_name && baseZone.junction_name !== "No Junction"
                ? baseZone.junction_name
                : "No mapped junction"}
            </p>
            {baseZone?.station_distance_m != null && (
              <p className="muted">~{formatDistance(baseZone.station_distance_m)} from station area</p>
            )}
          </div>
        </div>

        {error && <div className="error-pill">⚠ {error}</div>}

        {baseZone && (
          <div className="detail-scores">
            <Metric label="Priority" value={baseZone.priority_score} />
            <Metric label="Congestion" value={baseZone.congestion_impact} />
            <Metric label="Hotspot" value={baseZone.hotspot_score} />
            <Metric label="At junction" value={`${baseZone.junction_share}%`} raw />
          </div>
        )}

        {!detail && !error && <div className="detail-loading">Loading zone profile…</div>}

        {detail && (
          <>
            <p className="detail-count">
              <strong>{detail.violations_in_window.toLocaleString()}</strong> violations in window ·
              radius ~{detail.radius_m} m
            </p>

            <Chart title="Violations by hour of day (IST)" data={hourData} highlightPeak />
            <Chart title="Violations by day of week" data={dowData} />
            <Chart title="Top violation types" data={typeData} horizontal />
          </>
        )}
      </aside>
    </>
  );
}

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function Metric({ label, value, raw }) {
  const color =
    !raw && value >= 80 ? "#d7263d" : !raw && value >= 60 ? "#f46036" : !raw && value >= 40 ? "#f4b740" : "#3f88c5";
  return (
    <div className="metric">
      <div className="metric-value" style={{ color: raw ? "#cbd5e1" : color }}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

const PEAK = new Set([8, 9, 10, 11, 17, 18, 19, 20]);

function Chart({ title, data, horizontal, highlightPeak }) {
  return (
    <div className="chart-block">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={horizontal ? data.length * 26 + 20 : 150}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 12, bottom: 4, left: horizontal ? 8 : 0 }}
        >
          {horizontal ? (
            <>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10, fill: "#94a3b8" }} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={0} />
              <YAxis hide />
            </>
          )}
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
          />
          <Bar dataKey="count" radius={2}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={highlightPeak && PEAK.has(Number(d.label)) ? "#f46036" : "#3f88c5"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
