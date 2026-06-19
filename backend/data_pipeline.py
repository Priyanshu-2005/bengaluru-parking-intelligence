"""
Phase 1 — offline pipeline. Run once (or whenever the source CSV changes) to:
  1. Clean and filter the raw violation CSV.
  2. Spatially cluster violations into geographic "zones" (DBSCAN, haversine).
  3. Persist:
       backend/artifacts/violations.parquet  -> one row per violation, with zone_id + IST time fields
       backend/artifacts/zones.parquet       -> one row per zone, static geography (centroid, hull, point count)

Per-zone congestion/hotspot/priority SCORES are intentionally NOT computed here — those depend on the
time-window filter a user picks in the dashboard, so they're computed on demand by backend/scoring.py
from these two artifacts. This script only does the part that's safe to precompute once: cleaning and
spatial clustering.
"""
import ast
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

RAW_CSV = Path(__file__).parent.parent / "jan to may police violation_anonymized791b166 (1).csv"
ARTIFACT_DIR = Path(__file__).parent / "artifacts"

EARTH_RADIUS_M = 6_371_000
DBSCAN_START_EPS_METERS = 150    # initial DBSCAN search radius
DBSCAN_MIN_EPS_METERS = 30       # stop shrinking eps below this even if a cluster is still oversized
DBSCAN_MIN_SAMPLES = 12          # a zone must have at least this many violation events to count as a hotspot
MAX_ZONE_RADIUS_M = 200          # a zone must be small enough that a single patrol can cover it


def _bounding_radius_m(lat, lon):
    if len(lat) < 2:
        return 0
    lat_span_m = (lat.max() - lat.min()) * 111_000
    lon_span_m = (lon.max() - lon.min()) * 96_000
    return np.hypot(lat_span_m, lon_span_m) / 2


def parse_str_list(s):
    if not isinstance(s, str):
        return []
    try:
        v = ast.literal_eval(s)
        return v if isinstance(v, list) else []
    except (ValueError, SyntaxError):
        return []


def load_and_clean() -> pd.DataFrame:
    df = pd.read_csv(RAW_CSV, low_memory=False)

    # Drop violations that were reviewed and rejected (confirmed false positives / bad detections).
    # Keep 'approved' and not-yet-reviewed (NaN/'created1'/'processing') rows — excluding only confirmed bad ones.
    df = df[df["validation_status"] != "rejected"].copy()

    df["violation_list"] = df["violation_type"].apply(parse_str_list)

    # Source timestamps are UTC; Bengaluru is UTC+5:30. Convert for correct time-of-day analysis.
    dt_utc = pd.to_datetime(df["created_datetime"], errors="coerce", utc=True)
    df = df[dt_utc.notna()].copy()
    dt_utc = dt_utc[df.index]
    df["datetime_ist"] = dt_utc + pd.Timedelta(hours=5, minutes=30)
    df["date_ist"] = df["datetime_ist"].dt.date.astype(str)
    df["hour_ist"] = df["datetime_ist"].dt.hour
    df["dow_ist"] = df["datetime_ist"].dt.day_name()

    df = df[(df["latitude"].between(12.5, 13.5)) & (df["longitude"].between(77.0, 78.2))].copy()

    keep_cols = [
        "id", "latitude", "longitude", "location", "vehicle_type",
        "violation_list", "police_station", "junction_name",
        "datetime_ist", "date_ist", "hour_ist", "dow_ist", "validation_status",
    ]
    df = df[keep_cols].reset_index(drop=True)
    return df


def cluster_zones(df: pd.DataFrame) -> pd.DataFrame:
    """
    DBSCAN finds density-based clusters, but in a city, dense violation corridors let it
    "chain" through intersections into one elongated mega-cluster spanning kilometers and
    many unrelated streets/police-stations — not something a patrol can be sent to.

    Fix: run DBSCAN, then for any resulting cluster whose bounding radius exceeds
    MAX_ZONE_RADIUS_M, re-run DBSCAN on just those points with a smaller eps, recursively,
    until every zone is patrol-sized or eps bottoms out at DBSCAN_MIN_EPS_METERS (at which
    point we accept the cluster as-is rather than discard real hotspot data).
    """
    lat = df["latitude"].to_numpy()
    lon = df["longitude"].to_numpy()
    all_idx = np.arange(len(df))

    zone_labels = np.full(len(df), -1, dtype=int)
    next_zone_id = 0

    queue = [(all_idx, DBSCAN_START_EPS_METERS)]
    while queue:
        idx, eps_m = queue.pop()
        if len(idx) < DBSCAN_MIN_SAMPLES:
            continue

        coords_rad = np.radians(np.column_stack([lat[idx], lon[idx]]))
        eps_rad = eps_m / EARTH_RADIUS_M
        db = DBSCAN(eps=eps_rad, min_samples=DBSCAN_MIN_SAMPLES, metric="haversine", algorithm="ball_tree")
        sub_labels = db.fit_predict(coords_rad)

        for sub_id in set(sub_labels):
            if sub_id == -1:
                continue
            member_mask = sub_labels == sub_id
            member_idx = idx[member_mask]
            radius = _bounding_radius_m(lat[member_idx], lon[member_idx])

            if radius <= MAX_ZONE_RADIUS_M or eps_m <= DBSCAN_MIN_EPS_METERS:
                zone_labels[member_idx] = next_zone_id
                next_zone_id += 1
            else:
                queue.append((member_idx, eps_m / 2))

    df["zone_id"] = zone_labels
    return df


def build_station_table(df: pd.DataFrame) -> pd.DataFrame:
    """
    Approximate location for each named police station: the centroid of every violation
    (clustered or not) recorded under that station, citywide. There's no geocoded station
    address in the source data, so this is a data-driven proxy for "where this station's
    jurisdiction is centered" — used to show how far a hotspot sits from its station's area.
    """
    g = df.groupby("police_station")
    stations = g.agg(
        station_lat=("latitude", "mean"),
        station_lon=("longitude", "mean"),
        n_violations=("police_station", "size"),
    ).reset_index()
    return stations


def build_zone_table(df: pd.DataFrame) -> pd.DataFrame:
    clustered = df[df["zone_id"] != -1].copy()
    rows = []
    for zid, g in clustered.groupby("zone_id"):
        lat_c, lon_c = g["latitude"].mean(), g["longitude"].mean()
        # representative human-readable label: most common police_station + most common junction (if any)
        station = g["police_station"].mode().iat[0] if not g["police_station"].mode().empty else None
        junctions = g.loc[g["junction_name"] != "No Junction", "junction_name"]
        junction = junctions.mode().iat[0] if not junctions.empty else "No Junction"
        radius_m = max(DBSCAN_MIN_EPS_METERS, int(_bounding_radius_m(g["latitude"], g["longitude"])))
        rows.append({
            "zone_id": int(zid),
            "centroid_lat": lat_c,
            "centroid_lon": lon_c,
            "police_station": station,
            "junction_name": junction,
            "junction_share": float((g["junction_name"] != "No Junction").mean()),
            "radius_m": radius_m,
            "total_violations": int(len(g)),
        })
    zones = pd.DataFrame(rows).sort_values("total_violations", ascending=False).reset_index(drop=True)
    return zones


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading + cleaning raw CSV...")
    df = load_and_clean()
    print(f"  -> {len(df):,} usable violation rows after cleaning")

    print(f"Clustering into zones (DBSCAN start_eps={DBSCAN_START_EPS_METERS}m, min_samples={DBSCAN_MIN_SAMPLES}, max_radius={MAX_ZONE_RADIUS_M}m)...")
    df = cluster_zones(df)
    n_zones = (df["zone_id"] != -1).sum()
    n_noise = (df["zone_id"] == -1).sum()
    print(f"  -> {df['zone_id'].nunique() - (1 if -1 in df['zone_id'].values else 0)} zones found")
    print(f"  -> {n_zones:,} rows assigned to a zone, {n_noise:,} rows are sparse/noise (no zone)")

    zones = build_zone_table(df)
    print(f"  -> top 10 zones by violation count:")
    print(zones[["zone_id", "police_station", "junction_name", "total_violations"]].head(10).to_string(index=False))

    stations = build_station_table(df)
    print(f"  -> {len(stations)} police stations with an approximate location")

    df["violation_list_json"] = df["violation_list"].apply(json.dumps)
    df = df.drop(columns=["violation_list"])

    df.to_parquet(ARTIFACT_DIR / "violations.parquet", index=False)
    zones.to_parquet(ARTIFACT_DIR / "zones.parquet", index=False)
    stations.to_parquet(ARTIFACT_DIR / "stations.parquet", index=False)
    print(f"\nSaved artifacts to {ARTIFACT_DIR}/")


if __name__ == "__main__":
    main()
