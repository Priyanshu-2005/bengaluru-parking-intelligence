# Parking Intelligence — Bengaluru

AI-driven parking intelligence that **detects illegal-parking hotspots** and **quantifies their
impact on traffic flow** so enforcement can be targeted instead of patrol-based and reactive.

> Problem (Flipkart Gridlock): On-street illegal parking near commercial areas, metro stations and
> events chokes carriageways. Enforcement is reactive, with no heatmap of violations vs. congestion
> impact, making it hard to prioritize zones.

## How it works

```
raw police violation CSV  (248k rows, Nov 2023 – Apr 2024, Bengaluru)
        │
        ▼  backend/data_pipeline.py   (run once — clean + DBSCAN spatial clustering)
  artifacts/violations.parquet  +  artifacts/zones.parquet   (1,323 patrol-sized zones)
        │
        ▼  backend/scoring.py         (per-request, filter-aware)
  hotspot_score · congestion_impact · priority_score  (each 0–100)
        │
        ▼  backend/api.py  (FastAPI)  ──HTTP──▶  frontend/  (React + Vite + Leaflet)
```

### The three scores
- **hotspot_score** — how concentrated illegal parking is (volume + spatial density).
- **congestion_impact** — how much it chokes traffic: junction proximity × obstruction severity
  (per violation type) × peak-hour share.
- **priority_score** — the enforcement ranking: a hotspot only earns a patrol if it *also* impacts
  flow, so this blends the two. All scores recompute against whatever filter window the operator
  picks (date range, hours, day of week, vehicle/violation type).

## Run it

**1. Backend** (Python 3.11+):
```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m backend.data_pipeline          # one-time: builds the parquet artifacts
uvicorn backend.api:app --reload         # serves http://127.0.0.1:8000  (docs at /docs)
```

**2. Frontend** (Node 18+):
```bash
cd frontend
npm install
npm run dev                              # http://localhost:5173  (proxies /api to :8000)
```

## API
| Endpoint | Purpose |
|---|---|
| `GET /api/zones` | Ranked zones for map + table (top `limit` by priority) |
| `GET /api/zones/{id}` | Zone drill-down: hour/day/type/vehicle breakdowns |
| `GET /api/summary` | KPI header for the current window |
| `GET /api/heatmap` | Weighted centroid points for the heat layer |
| `GET /api/meta` | Filter option lists + data bounds |
| `GET /api/health` | Liveness + artifact row counts |

All analytics endpoints accept the shared filter params: `start_date`, `end_date`, `hours`,
`days_of_week`, `vehicle_types`, `violation_types`, `police_stations` (repeatable where plural).
