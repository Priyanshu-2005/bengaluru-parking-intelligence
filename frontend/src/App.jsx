import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import FilterBar from "./components/FilterBar";
import SummaryBar from "./components/SummaryBar";
import HotspotMap from "./components/HotspotMap";
import ZoneTable from "./components/ZoneTable";
import ZoneDetail from "./components/ZoneDetail";

const EMPTY_FILTERS = {
  start_date: null,
  end_date: null,
  hours: [],
  days_of_week: [],
  vehicle_types: [],
  violation_types: [],
  police_stations: [],
};

export default function App() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [summary, setSummary] = useState(null);
  const [zones, setZones] = useState([]);
  const [zoneTotal, setZoneTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [weightBy, setWeightBy] = useState("priority_score");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  // Refetch summary + zones whenever the filter window changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.summary(filters), api.zones(filters, 300)])
      .then(([s, z]) => {
        if (cancelled) return;
        setSummary(s);
        setZones(z.zones);
        setZoneTotal(z.count);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.zone_id === selectedId) || null,
    [zones, selectedId]
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <div>
            <h1>Parking Intelligence</h1>
            <p>Illegal-parking hotspots &amp; traffic-congestion impact — Bengaluru</p>
          </div>
        </div>
        {loading && <span className="loading-pill">updating…</span>}
        {error && <span className="error-pill">⚠ {error}</span>}
      </header>

      <SummaryBar summary={summary} />

      <FilterBar
        meta={meta}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      <div className="main-grid">
        <div className="map-pane">
          <HotspotMap
            zones={zones}
            selectedId={selectedId}
            onSelect={setSelectedId}
            weightBy={weightBy}
            onWeightChange={setWeightBy}
          />
        </div>
        <div className="side-pane">
          <ZoneTable
            zones={zones}
            total={zoneTotal}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      {selectedId != null && (
        <ZoneDetail
          zoneId={selectedId}
          baseZone={selectedZone}
          filters={filters}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
