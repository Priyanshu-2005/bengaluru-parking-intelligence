// KPI strip across the top of the dashboard, driven by /api/summary for the current window.

function fmt(n) {
  if (n == null) return "—";
  return n.toLocaleString();
}

export default function SummaryBar({ summary }) {
  const cards = [
    { label: "Violations in window", value: fmt(summary?.total_violations), accent: "blue" },
    { label: "Active hotspot zones", value: fmt(summary?.active_zones), accent: "teal" },
    { label: "High-priority zones", value: fmt(summary?.high_priority_zones), accent: "red", hint: "priority ≥ 70" },
    {
      label: "Avg congestion impact",
      value: summary ? `${summary.avg_congestion_impact.toFixed(1)}` : "—",
      accent: "amber",
      hint: "0–100",
    },
  ];
  return (
    <div className="summary-bar">
      {cards.map((c) => (
        <div key={c.label} className={`kpi kpi-${c.accent}`}>
          <div className="kpi-value">{c.value}</div>
          <div className="kpi-label">
            {c.label}
            {c.hint && <span className="kpi-hint"> ({c.hint})</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
