import { useMemo, useRef, useState } from "react";

// Searchable multi-select for police stations. Enforcement is organized by station, so this lets
// an officer narrow the whole dashboard to their jurisdiction. There are ~50 stations — too many
// for chips — so it's a type-to-filter combobox with the current picks shown as removable chips.

export default function StationFilter({ options = [], selected = [], onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((s) => !selected.includes(s) && (q === "" || s.toLowerCase().includes(q)));
  }, [options, selected, query]);

  const add = (s) => {
    onChange([...selected, s]);
    setQuery("");
  };
  const remove = (s) => onChange(selected.filter((x) => x !== s));

  return (
    <div className="filter-group station-filter">
      <div className="filter-label">
        Police station {selected.length > 0 && <span className="muted">({selected.length})</span>}
      </div>
      {selected.length > 0 && (
        <div className="chips">
          {selected.map((s) => (
            <button key={s} className="chip chip-on" onClick={() => remove(s)} title="Remove">
              {s} ✕
            </button>
          ))}
        </div>
      )}
      <div className="station-combo">
        <input
          type="text"
          placeholder="Search station…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => (blurTimer.current = setTimeout(() => setOpen(false), 150))}
        />
        {open && matches.length > 0 && (
          <ul className="station-list">
            {matches.map((s) => (
              <li key={s}>
                {/* mousedown + preventDefault (not onClick) so the browser never shifts focus
                    off the input — that blur is what raced against the click in Chrome, and
                    whether blur or click won the race was timing-dependent (visibly different
                    with DevTools open vs closed), sometimes closing the list before the click
                    that should have added the chip ever fired. */}
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearTimeout(blurTimer.current);
                    add(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
