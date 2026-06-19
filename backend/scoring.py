"""
Phase 2 — on-demand scoring. Given a user-selected filter window (date range, hours,
days of week, vehicle types, violation types), score every zone for enforcement targeting.

Why this is separate from data_pipeline.py: spatial clustering is stable and expensive, so it
is precomputed once. But "which hotspots matter right now" depends entirely on the window the
operator picks in the dashboard (e.g. weekday mornings near metro stations), so the scores must
be recomputed per request. This module reads the two parquet artifacts (loaded + cached once per
process) and turns a filtered slice of violations into a ranked zone table.

Three scores, all 0-100 and recomputed relative to the current filtered set of zones:

  hotspot_score      How concentrated illegal parking is here — volume + spatial density.
                     Answers "is this a real, repeated hotspot or just a one-off?".

  congestion_impact  How much this parking actually chokes traffic flow. Built from three
                     traffic-flow signals we can derive from the data:
                       - junction proximity   (parking at/near a junction blocks more flow)
                       - obstruction severity  (a vehicle on a main road / road crossing /
                                                 footpath obstructs flow far more than a quiet
                                                 side street; weighted per violation type)
                       - peak-hour share       (the same violation during rush hour costs more)

  priority_score     The enforcement ranking the dashboard sorts on: a hotspot only deserves a
                     patrol if it ALSO impacts traffic, so this blends the two above. High volume
                     with low congestion impact (e.g. an empty lot) ranks below a smaller hotspot
                     sitting on a main-road junction at rush hour.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

ARTIFACT_DIR = Path(__file__).parent / "artifacts"

# How much each violation type obstructs traffic flow, 0 (no flow impact) .. 1 (severe).
# Parking that sits in the live carriageway or blocks a conflict point chokes flow the most;
# administrative offences (number plate, mirror, fare) have no parking-flow impact at all.
OBSTRUCTION_WEIGHTS = {
    "PARKING IN A MAIN ROAD": 1.00,
    "DOUBLE PARKING": 1.00,
    "PARKING NEAR ROAD CROSSING": 0.95,
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 0.95,
    "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE": 0.85,
    "WRONG PARKING": 0.70,
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 0.70,
    "PARKING OTHER THAN BUS STOP": 0.60,
    "NO PARKING": 0.55,
    "PARKING ON FOOTPATH": 0.40,  # blocks pedestrians more than carriageway, but pushes them onto road
    # Non-parking / administrative offences — no traffic-flow obstruction.
    "DEFECTIVE NUMBER PLATE": 0.0,
    "USING BLACK FILM/OTHER MATERIALS": 0.0,
    "WITHOUT SIDE MIRROR": 0.0,
    "REFUSE TO GO FOR HIRE": 0.0,
    "DEMANDING EXCESS FARE": 0.0,
}
DEFAULT_OBSTRUCTION_WEIGHT = 0.5  # unknown / unmapped violation type

# Typical Bengaluru traffic rush windows (IST, hour-of-day). A parking violation occurring inside
# these hours obstructs a far busier carriageway than the same violation at 3am.
PEAK_HOURS = frozenset({8, 9, 10, 11, 17, 18, 19, 20})

# priority_score = w_hotspot * hotspot + w_congestion * congestion, then rescaled 0-100.
PRIORITY_W_HOTSPOT = 0.45
PRIORITY_W_CONGESTION = 0.55


@dataclass
class ScoreFilters:
    """A dashboard filter window. All fields optional; None/empty means 'no filter on this axis'."""
    start_date: Optional[str] = None          # inclusive, 'YYYY-MM-DD'
    end_date: Optional[str] = None            # inclusive, 'YYYY-MM-DD'
    hours: Optional[list[int]] = None         # keep only these hours-of-day (IST)
    days_of_week: Optional[list[str]] = None  # e.g. ['Monday', ...]
    vehicle_types: Optional[list[str]] = None
    violation_types: Optional[list[str]] = None
    police_stations: Optional[list[str]] = None

    def is_empty(self) -> bool:
        return all(
            v is None or (isinstance(v, list) and len(v) == 0)
            for v in vars(self).values()
        )


EARTH_RADIUS_M = 6_371_000


def _haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(a))


@lru_cache(maxsize=1)
def _load_artifacts() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load violations + zones + stations once per process. Cached; call _reset_cache() after rebuilding."""
    violations = pd.read_parquet(ARTIFACT_DIR / "violations.parquet")
    zones = pd.read_parquet(ARTIFACT_DIR / "zones.parquet")
    stations = pd.read_parquet(ARTIFACT_DIR / "stations.parquet")
    # Pre-decode the violation list and the dominant obstruction weight per row so per-request
    # filtering/scoring stays vectorized rather than re-parsing JSON on every call.
    violations = violations[violations["zone_id"] != -1].copy()
    parsed = violations["violation_list_json"].apply(json.loads)
    violations["violation_list"] = parsed
    violations["obstruction_weight"] = parsed.apply(_row_obstruction_weight)
    violations["is_peak"] = violations["hour_ist"].isin(PEAK_HOURS)

    # Each zone's recorded police_station is a label, not a coordinate; join in that station's
    # approximate location (see data_pipeline.build_station_table) and the distance from the
    # zone's centroid to it, so the dashboard can show how far a hotspot sits from its station.
    zones = zones.merge(stations, on="police_station", how="left")
    zones["station_distance_m"] = _haversine_m(
        zones["centroid_lat"], zones["centroid_lon"], zones["station_lat"], zones["station_lon"]
    ).round(0)

    return violations, zones, stations


def _row_obstruction_weight(violation_list) -> float:
    """A row's flow impact is driven by its single worst (most obstructive) violation type."""
    if not violation_list:
        return DEFAULT_OBSTRUCTION_WEIGHT
    return max(OBSTRUCTION_WEIGHTS.get(v, DEFAULT_OBSTRUCTION_WEIGHT) for v in violation_list)


def _reset_cache() -> None:
    _load_artifacts.cache_clear()


def get_violations() -> pd.DataFrame:
    return _load_artifacts()[0]


def get_zones() -> pd.DataFrame:
    return _load_artifacts()[1]


def _apply_filters(violations: pd.DataFrame, f: ScoreFilters) -> pd.DataFrame:
    if f.is_empty():
        return violations
    mask = pd.Series(True, index=violations.index)
    if f.start_date:
        mask &= violations["date_ist"] >= f.start_date
    if f.end_date:
        mask &= violations["date_ist"] <= f.end_date
    if f.hours:
        mask &= violations["hour_ist"].isin(f.hours)
    if f.days_of_week:
        mask &= violations["dow_ist"].isin(f.days_of_week)
    if f.vehicle_types:
        mask &= violations["vehicle_type"].isin(f.vehicle_types)
    # NB: police_stations is intentionally NOT applied here. A zone is a spatial cluster that can
    # straddle station boundaries, so filtering individual violation rows by station would keep
    # cross-boundary fragments of zones that are actually labeled (dominated) by a neighbour.
    # Station is a jurisdiction filter, applied at the zone level in compute_zone_scores instead.
    sub = violations[mask]
    if f.violation_types:
        wanted = set(f.violation_types)
        keep = sub["violation_list"].apply(lambda lst: bool(wanted.intersection(lst)))
        sub = sub[keep]
    return sub


def _minmax_0_100(s: pd.Series) -> pd.Series:
    """Rescale to 0-100 relative to the current set. Constant series -> all 50 (neutral)."""
    lo, hi = s.min(), s.max()
    if not np.isfinite(lo) or hi <= lo:
        return pd.Series(50.0, index=s.index)
    return (s - lo) / (hi - lo) * 100.0


def compute_zone_scores(filters: Optional[ScoreFilters] = None) -> pd.DataFrame:
    """
    Return one row per zone that has >=1 violation in the filtered window, with the three scores
    plus the geometry/labels needed to render it on a map. Sorted by priority_score descending.
    """
    filters = filters or ScoreFilters()
    violations, zones, _ = _load_artifacts()
    sub = _apply_filters(violations, filters)
    if sub.empty:
        return _empty_scores_frame()

    g = sub.groupby("zone_id")
    agg = g.agg(
        violations=("id", "size"),
        obstruction=("obstruction_weight", "mean"),
        peak_share=("is_peak", "mean"),
        junction_share=("junction_name", lambda s: float((s != "No Junction").mean())),
        last_seen=("datetime_ist", "max"),
        unique_vehicles=("id", "size"),  # placeholder; refined below if vehicle col present
    )

    z = zones.set_index("zone_id")
    agg = agg.join(
        z[["centroid_lat", "centroid_lon", "police_station", "junction_name", "radius_m", "station_distance_m"]]
    )

    # Jurisdiction filter: keep only zones that BELONG to the selected stations (by the zone's
    # dominant-station label), so the returned set matches the station labels the operator sees.
    # Applied before scoring so the 0-100 normalization is relative to the selected jurisdiction.
    if filters.police_stations:
        agg = agg[agg["police_station"].isin(filters.police_stations)]
        if agg.empty:
            return _empty_scores_frame()

    # Spatial density: violations per patrol-sized footprint. Density distinguishes a tight,
    # repeated hotspot from the same count spread thinly over a large zone.
    area_units = np.maximum(np.pi * (agg["radius_m"] / 100.0) ** 2, 1.0)  # ~ per (100m radius) disc
    density = agg["violations"] / area_units

    # hotspot: blend log-scaled volume and log-scaled density (logs tame the long tail where a
    # handful of mega-zones would otherwise flatten everything else to ~0).
    vol_score = _minmax_0_100(np.log1p(agg["violations"]))
    den_score = _minmax_0_100(np.log1p(density))
    agg["hotspot_score"] = (0.6 * vol_score + 0.4 * den_score).round(1)

    # congestion impact: junction proximity x obstruction severity x peak concentration.
    congestion_raw = (
        0.45 * agg["junction_share"]
        + 0.40 * agg["obstruction"]
        + 0.15 * agg["peak_share"]
    )
    agg["congestion_impact"] = (congestion_raw * 100.0).round(1)

    # priority: a hotspot is only worth a patrol if it also chokes traffic.
    priority_raw = (
        PRIORITY_W_HOTSPOT * agg["hotspot_score"]
        + PRIORITY_W_CONGESTION * agg["congestion_impact"]
    )
    agg["priority_score"] = _minmax_0_100(priority_raw).round(1)

    agg["peak_share"] = (agg["peak_share"] * 100).round(1)
    agg["junction_share"] = (agg["junction_share"] * 100).round(1)
    agg = agg.drop(columns=["obstruction", "unique_vehicles"])

    out = agg.reset_index().sort_values("priority_score", ascending=False)
    out["rank"] = np.arange(1, len(out) + 1)
    out["last_seen"] = out["last_seen"].astype(str)
    return out.reset_index(drop=True)


def _empty_scores_frame() -> pd.DataFrame:
    cols = [
        "zone_id", "violations", "peak_share", "junction_share", "last_seen",
        "centroid_lat", "centroid_lon", "police_station", "junction_name", "radius_m", "station_distance_m",
        "hotspot_score", "congestion_impact", "priority_score", "rank",
    ]
    return pd.DataFrame(columns=cols)


def zone_detail(zone_id: int, filters: Optional[ScoreFilters] = None) -> dict:
    """Drill-down for a single zone within the current window: breakdowns for the detail panel."""
    filters = filters or ScoreFilters()
    violations, zones, _ = _load_artifacts()
    sub = _apply_filters(violations, filters)
    sub = sub[sub["zone_id"] == zone_id]

    zrow = zones[zones["zone_id"] == zone_id]
    if zrow.empty:
        return {}
    zrow = zrow.iloc[0]

    by_hour = sub["hour_ist"].value_counts().reindex(range(24), fill_value=0)
    dow_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    by_dow = sub["dow_ist"].value_counts().reindex(dow_order, fill_value=0)

    viol_counts: dict[str, int] = {}
    for lst in sub["violation_list"]:
        for v in lst:
            viol_counts[v] = viol_counts.get(v, 0) + 1

    return {
        "zone_id": int(zone_id),
        "centroid_lat": float(zrow["centroid_lat"]),
        "centroid_lon": float(zrow["centroid_lon"]),
        "police_station": zrow["police_station"],
        "junction_name": zrow["junction_name"],
        "radius_m": int(zrow["radius_m"]),
        "station_distance_m": float(zrow["station_distance_m"]) if pd.notna(zrow["station_distance_m"]) else None,
        "violations_in_window": int(len(sub)),
        "by_hour": {int(h): int(c) for h, c in by_hour.items()},
        "by_dow": {d: int(c) for d, c in by_dow.items()},
        "by_violation_type": dict(sorted(viol_counts.items(), key=lambda kv: -kv[1])),
        "by_vehicle_type": sub["vehicle_type"].value_counts().head(10).astype(int).to_dict(),
    }


def summary(filters: Optional[ScoreFilters] = None) -> dict:
    """Top-line KPIs for the current window, for the dashboard header."""
    scores = compute_zone_scores(filters)
    violations, _, _ = _load_artifacts()
    # Derive the violation count from the scored zones so it honours the zone-level station filter
    # (summing per-zone counts == counting in-zone violations in the window).
    total_violations = int(scores["violations"].sum()) if not scores.empty else 0
    return {
        "total_violations": total_violations,
        "active_zones": int(len(scores)),
        "high_priority_zones": int((scores["priority_score"] >= 70).sum()) if not scores.empty else 0,
        "avg_congestion_impact": float(scores["congestion_impact"].mean()) if not scores.empty else 0.0,
        "date_range": [violations["date_ist"].min(), violations["date_ist"].max()],
    }
