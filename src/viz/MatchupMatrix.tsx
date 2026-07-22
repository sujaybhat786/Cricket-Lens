import { useMemo } from "react";
import type { Delivery } from "../data/types";
import { matchupMatrix } from "../data/analytics";
import { diverge } from "./common";
import { useTip } from "../components/Tooltip";
import { useStore } from "../state/store";

/** Batters × bowlers grid. Color = SR vs expectation. Click a cell → cross-filter everything. */
export function MatchupMatrix({ balls, expectedSR = 135 }: { balls: Delivery[]; expectedSR?: number }) {
  const { show, hide } = useTip();
  const { filters, setFilters, openDrawer } = useStore();

  const { batters, bowlers, cells } = useMemo(() => matchupMatrix(balls), [balls]);

  if (!batters.length) return <div style={{ color: "var(--ink-3)", padding: 20 }}>No balls match the current filters.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 560 }}>
        <thead>
          <tr>
            <th />
            {bowlers.map((b) => (
              <th key={b} style={{ padding: "4px 2px", verticalAlign: "bottom", height: 92 }}>
                <div className="mono" style={{
                  fontSize: 9.5, color: "var(--ink-2)", writingMode: "vertical-rl",
                  transform: "rotate(180deg)", margin: "0 auto", letterSpacing: "0.05em", maxHeight: 88,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {b}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batters.map((bat) => (
            <tr key={bat}>
              <td className="mono" style={{
                fontSize: 10.5, color: "var(--ink-2)", paddingRight: 8, whiteSpace: "nowrap",
                maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {bat}
              </td>
              {bowlers.map((bwl) => {
                const c = cells.get(`${bat}|${bwl}`);
                if (!c || !c.balls)
                  return <td key={bwl} style={{ width: 44, height: 36, background: "rgba(148,170,200,0.03)", borderRadius: 6 }} />;
                const rel = c.sr != null ? Math.max(-1, Math.min(1, (c.sr - expectedSR) / expectedSR)) : 0;
                const active = filters.batter === bat && filters.bowler === bwl;
                return (
                  <td
                    key={bwl}
                    style={{
                      width: 44, height: 36, borderRadius: 6, textAlign: "center", cursor: "pointer",
                      background: `${diverge(rel)}${c.outs ? "" : ""}`,
                      opacity: 0.28 + 0.6 * Math.min(1, c.balls / 15),
                      outline: active ? "2px solid var(--gold)" : c.outs ? "1.5px solid #ff5470" : "none",
                      transition: "opacity 0.15s",
                    }}
                    onMouseMove={(e) =>
                      show(e.clientX, e.clientY, (
                        <div>
                          <div className="tt-head">{bat} vs {bwl}</div>
                          {c.runs} off {c.balls} (SR {c.sr}){c.outs ? ` · out ${c.outs}×` : ""}
                          <div style={{ color: "var(--ink-3)", marginTop: 3, fontSize: 11 }}>
                            click: cross-filter every chart · dbl-click: show the balls
                          </div>
                        </div>
                      ))
                    }
                    onMouseLeave={hide}
                    onClick={() =>
                      active
                        ? setFilters({ batter: null, bowler: null })
                        : setFilters({ batter: bat, bowler: bwl })
                    }
                    onDoubleClick={() =>
                      openDrawer({ title: `${bat} vs ${bwl}`, subtitle: `${c.runs} runs off ${c.balls} balls`, balls: c.balls_ })
                    }
                  >
                    <span className="mono" style={{ fontSize: 10.5, color: "#eef2f7", fontWeight: 600 }}>
                      {c.runs}
                      <span style={{ color: "rgba(238,242,247,0.55)", fontSize: 9 }}>/{c.balls}</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 8 }}>
        green = scoring above expected SR {expectedSR} · red = below · red ring = dismissal(s) · cell text: runs/balls
      </div>
    </div>
  );
}
