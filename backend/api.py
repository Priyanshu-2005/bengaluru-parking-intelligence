"""
Phase 3 — HTTP API. Serves the parking-intelligence dashboard from the precomputed artifacts
(backend/data_pipeline.py) via the on-demand scoring layer (backend/scoring.py).

Run:  uvicorn backend.api:app --reload    (from the project root)
Docs: http://127.0.0.1:8000/docs

Every analytics endpoint accepts the same filter query params so the whole dashboard stays in
sync with one window:
    start_date, end_date            'YYYY-MM-DD' (inclusive)
    hours                           repeatable, hour-of-day 0-23 (e.g. ?hours=8&hours=9)
    days_of_week                    repeatable, 'Monday'..'Sunday'
    vehicle_types                   repeatable
    violation_types                 repeatable
    police_stations                 repeatable
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend import scoring
from backend.scoring import ScoreFilters

app = FastAPI(
    title="Parking Intelligence API",
    description="Illegal-parking hotspot detection and traffic-congestion impact scoring for targeted enforcement.",
    version="1.0.0",
)

# The dashboard is a separate static/dev-server origin; allow it to call the API in the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _filters(
    start_date: Optional[str],
    end_date: Optional[str],
    hours: Optional[list[int]],
    days_of_week: Optional[list[str]],
    vehicle_types: Optional[list[str]],
    violation_types: Optional[list[str]],
    police_stations: Optional[list[str]],
) -> ScoreFilters:
    return ScoreFilters(
        start_date=start_date,
        end_date=end_date,
        hours=hours,
        days_of_week=days_of_week,
        vehicle_types=vehicle_types,
        violation_types=violation_types,
        police_stations=police_stations,
    )


# A single Depends-free signature reused across endpoints would need a Pydantic model; for clarity
# in a hackathon codebase we just repeat the query params per route via this helper-builder.
def _common_query(
    start_date: Optional[str] = Query(None, description="Inclusive start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Inclusive end date YYYY-MM-DD"),
    hours: Optional[list[int]] = Query(None, description="Hours-of-day 0-23 (repeatable)"),
    days_of_week: Optional[list[str]] = Query(None, description="Day names (repeatable)"),
    vehicle_types: Optional[list[str]] = Query(None),
    violation_types: Optional[list[str]] = Query(None),
    police_stations: Optional[list[str]] = Query(None),
) -> ScoreFilters:
    return _filters(start_date, end_date, hours, days_of_week, vehicle_types, violation_types, police_stations)


from fastapi import Depends  # noqa: E402  (kept near use for readability)


@app.get("/api/health")
def health() -> dict:
    z = scoring.get_zones()
    v = scoring.get_violations()
    return {"status": "ok", "zones": int(len(z)), "violations": int(len(v))}


@app.get("/api/meta")
def meta() -> dict:
    """Filter option lists + data bounds, so the frontend can build its controls dynamically."""
    v = scoring.get_violations()
    viol_types: dict[str, int] = {}
    for lst in v["violation_list"]:
        for x in lst:
            viol_types[x] = viol_types.get(x, 0) + 1
    return {
        "date_range": [v["date_ist"].min(), v["date_ist"].max()],
        "vehicle_types": v["vehicle_type"].value_counts().index.tolist(),
        "violation_types": [k for k, _ in sorted(viol_types.items(), key=lambda kv: -kv[1])],
        "police_stations": sorted(v["police_station"].dropna().unique().tolist()),
        "days_of_week": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "peak_hours": sorted(scoring.PEAK_HOURS),
    }


@app.get("/api/summary")
def summary(f: ScoreFilters = Depends(_common_query)) -> dict:
    return scoring.summary(f)


@app.get("/api/zones")
def zones(
    f: ScoreFilters = Depends(_common_query),
    limit: int = Query(200, ge=1, le=2000, description="Max zones to return (ranked by priority)"),
) -> dict:
    """Ranked zones for the map + table. Returns the top `limit` by enforcement priority."""
    df = scoring.compute_zone_scores(f)
    total = len(df)
    df = df.head(limit)
    return {"count": int(total), "returned": int(len(df)), "zones": df.to_dict(orient="records")}


@app.get("/api/zones/{zone_id}")
def zone_detail(zone_id: int, f: ScoreFilters = Depends(_common_query)) -> dict:
    detail = scoring.zone_detail(zone_id, f)
    if not detail:
        raise HTTPException(status_code=404, detail=f"zone {zone_id} not found")
    return detail


@app.get("/api/heatmap")
def heatmap(
    f: ScoreFilters = Depends(_common_query),
    weight_by: str = Query("priority_score", description="priority_score | congestion_impact | hotspot_score | violations"),
) -> dict:
    """Lightweight points for a map heat layer: one weighted point per active zone centroid."""
    df = scoring.compute_zone_scores(f)
    if weight_by not in {"priority_score", "congestion_impact", "hotspot_score", "violations"}:
        raise HTTPException(status_code=400, detail=f"invalid weight_by: {weight_by}")
    points = [
        [float(r["centroid_lat"]), float(r["centroid_lon"]), float(r[weight_by])]
        for _, r in df.iterrows()
    ]
    return {"weight_by": weight_by, "count": len(points), "points": points}
