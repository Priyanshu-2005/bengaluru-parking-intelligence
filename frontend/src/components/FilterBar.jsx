// Filter controls. Every change rebuilds the filter object passed up to App, which refetches.
// Multi-select chips for hours / days / vehicle / violation types; date inputs for the range.

import StationFilter from "./StationFilter";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ChipGroup({ label, options, selected, onToggle, fmt = (v) => v }) {
  return (
    <div className="filter-group">
      <div className="filter-label">{label}</div>
      <div className="chips">
        {options.map((opt) => (
          <button
            key={opt}
            className={`chip ${selected.includes(opt) ? "chip-on" : ""}`}
            onClick={() => onToggle(opt)}
          >
            {fmt(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FilterBar({ meta, filters, onChange, onReset }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  const presetWeekdayMorning = () =>
    set({
      days_of_week: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      hours: [8, 9, 10, 11],
    });
  const presetWeekendEvening = () =>
    set({ days_of_week: ["Saturday", "Sunday"], hours: meta?.peak_hours?.filter((h) => h >= 17) ?? [17, 18, 19, 20] });

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <div className="filter-group">
          <div className="filter-label">Date range</div>
          <div className="date-inputs">
            <input
              type="date"
              min={meta?.date_range?.[0]}
              max={meta?.date_range?.[1]}
              value={filters.start_date ?? ""}
              onChange={(e) => set({ start_date: e.target.value || null })}
            />
            <span>→</span>
            <input
              type="date"
              min={meta?.date_range?.[0]}
              max={meta?.date_range?.[1]}
              value={filters.end_date ?? ""}
              onChange={(e) => set({ end_date: e.target.value || null })}
            />
          </div>
        </div>
        <div className="filter-group">
          <div className="filter-label">Presets</div>
          <div className="chips">
            <button className="chip chip-preset" onClick={presetWeekdayMorning}>Weekday AM peak</button>
            <button className="chip chip-preset" onClick={presetWeekendEvening}>Weekend PM peak</button>
            <button className="chip chip-reset" onClick={onReset}>Reset all</button>
          </div>
        </div>
      </div>

      <ChipGroup
        label="Hour of day"
        options={HOURS}
        selected={filters.hours}
        onToggle={(h) => set({ hours: toggle(filters.hours, h) })}
        fmt={(h) => String(h).padStart(2, "0")}
      />
      <ChipGroup
        label="Day of week"
        options={DAYS}
        selected={filters.days_of_week}
        onToggle={(d) => set({ days_of_week: toggle(filters.days_of_week, d) })}
        fmt={(d) => d.slice(0, 3)}
      />
      {meta && (
        <div className="filter-row">
          <ChipGroup
            label="Vehicle type"
            options={meta.vehicle_types.slice(0, 8)}
            selected={filters.vehicle_types}
            onToggle={(v) => set({ vehicle_types: toggle(filters.vehicle_types, v) })}
          />
          <ChipGroup
            label="Violation type"
            options={meta.violation_types.slice(0, 6)}
            selected={filters.violation_types}
            onToggle={(v) => set({ violation_types: toggle(filters.violation_types, v) })}
          />
          <StationFilter
            options={meta.police_stations}
            selected={filters.police_stations}
            onChange={(stations) => set({ police_stations: stations })}
          />
        </div>
      )}
    </div>
  );
}
