import { useState } from "react";
import { useStore } from "../state/store";
import { BOWL_TYPE_LABELS } from "../data/types";

/** Analyst Mode global filter bar — every chart recomputes live. */
export function FilterBar({ showInnings = false }: { showInnings?: boolean }) {
  const { filters, setFilters, resetFilters, innings, setInnings, clearCrossFilter } = useStore();
  const [customOvers, setCustomOvers] = useState(false);
  const xf = filters.batter || filters.bowler;

  return (
    <div className="filter-bar">
      {showInnings && (
        <div className="filter-group">
          <span className="fg-label">Innings</span>
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              className={`chip ${innings === i ? "active" : ""}`}
              onClick={() => setInnings(i)}
            >
              {i === 0 ? "Both" : `${i === 1 ? "1st" : "2nd"}`}
            </button>
          ))}
        </div>
      )}
      <div className="filter-group">
        <span className="fg-label">Phase</span>
        {[
          [0, "All"],
          [1, "PP 1–6"],
          [2, "Mid 7–16"],
          [3, "Death 17–20"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={`chip ${filters.phase === v && !filters.overRange ? "active" : ""}`}
            onClick={() => {
              setCustomOvers(false);
              setFilters({ phase: v as 0 | 1 | 2 | 3, overRange: null });
            }}
          >
            {l}
          </button>
        ))}
        <button
          className={`chip ${customOvers || filters.overRange ? "active" : ""}`}
          onClick={() => setCustomOvers((c) => !c)}
        >
          Custom
        </button>
        {(customOvers || filters.overRange) && (
          <span className="mono" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11 }}>
            <input
              className="input"
              style={{ width: 52, padding: "5px 8px" }}
              type="number"
              min={1}
              max={20}
              value={(filters.overRange?.[0] ?? 0) + 1}
              onChange={(e) =>
                setFilters({
                  overRange: [
                    Math.max(0, +e.target.value - 1),
                    filters.overRange?.[1] ?? 19,
                  ],
                })
              }
            />
            –
            <input
              className="input"
              style={{ width: 52, padding: "5px 8px" }}
              type="number"
              min={1}
              max={20}
              value={(filters.overRange?.[1] ?? 19) + 1}
              onChange={(e) =>
                setFilters({
                  overRange: [filters.overRange?.[0] ?? 0, Math.min(19, +e.target.value - 1)],
                })
              }
            />
          </span>
        )}
      </div>
      <div className="filter-group">
        <span className="fg-label">Bowling</span>
        {(["all", "pace", "spin"] as const).map((k) => (
          <button
            key={k}
            className={`chip ${filters.bowlKind === k && !filters.bowlType ? "active" : ""}`}
            onClick={() => setFilters({ bowlKind: k, bowlType: null })}
          >
            {k}
          </button>
        ))}
        <select
          className="select"
          value={filters.bowlType ?? ""}
          onChange={(e) => setFilters({ bowlType: e.target.value || null, bowlKind: "all" })}
        >
          <option value="">type…</option>
          {Object.entries(BOWL_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <span className="fg-label">Bat hand</span>
        {(["all", "R", "L"] as const).map((h) => (
          <button
            key={h}
            className={`chip ${filters.batHand === h ? "active" : ""}`}
            onClick={() => setFilters({ batHand: h })}
          >
            {h === "all" ? "All" : h === "R" ? "RHB" : "LHB"}
          </button>
        ))}
      </div>
      {xf && (
        <span className="xf-chip">
          ⊕ {filters.batter && `bat: ${filters.batter}`}
          {filters.batter && filters.bowler && " × "}
          {filters.bowler && `bowl: ${filters.bowler}`}
          <button onClick={clearCrossFilter}>✕</button>
        </span>
      )}
      <span style={{ flex: 1 }} />
      <button className="chip danger" onClick={resetFilters}>
        Reset
      </button>
    </div>
  );
}
