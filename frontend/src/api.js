// Thin client over the FastAPI backend. All analytics endpoints share the same filter object,
// which we serialize into repeatable query params (?hours=8&hours=9&...).

function toQuery(filters = {}) {
  const p = new URLSearchParams();
  const add = (key, val) => {
    if (val === null || val === undefined || val === "") return;
    if (Array.isArray(val)) val.forEach((v) => p.append(key, v));
    else p.append(key, val);
  };
  add("start_date", filters.start_date);
  add("end_date", filters.end_date);
  add("hours", filters.hours);
  add("days_of_week", filters.days_of_week);
  add("vehicle_types", filters.vehicle_types);
  add("violation_types", filters.violation_types);
  add("police_stations", filters.police_stations);
  return p.toString();
}

// In dev this is empty, so calls go to "/api/..." and Vite's proxy forwards them to localhost:8000.
// In production (Vercel) set VITE_API_BASE to the Render backend URL, e.g. https://xxx.onrender.com
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function get(path, filters, extra = {}) {
  const qs = new URLSearchParams(toQuery(filters));
  Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
  const q = qs.toString();
  const res = await fetch(`${API_BASE}/api${path}${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export const api = {
  meta: () => get("/meta"),
  summary: (filters) => get("/summary", filters),
  zones: (filters, limit = 300) => get("/zones", filters, { limit }),
  zoneDetail: (id, filters) => get(`/zones/${id}`, filters),
  heatmap: (filters, weight_by = "priority_score") => get("/heatmap", filters, { weight_by }),
};
