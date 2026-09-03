import type { Battle, Match } from "../data/types";
import { BOWL_TYPE_LABELS } from "../data/types";
import { Panel, } from "../components/Panel";
import { SampleBadge } from "../components/Badge";
import { StatTile } from "../components/Shell";
import { useTip } from "../components/Tooltip";

const initials = (t: string) => t.split(" ").map((w) => w[0]).join("");

/**
 * Pre-Match Report — head-to-head, venue history and player battles, all
 * computed at build time from the OTHER loaded matches. The match being
 * previewed is excluded from its own head-to-head and battle records, so this
 * reads as it would have before the toss rather than retrospectively.
 */
export function PreMatchReport({ match }: { match: Match }) {
  const { h2h, venue, battles } = match.preMatch;
  const [a, b] = match.info.teams;
  const small = (venue?.matches ?? 0) < 5;

  return (
    <Panel
      title="Pre-Match Report"
      tier="RECORDED"
      wide
      sub={`Head-to-head and player battles are drawn only from the other loaded matches — this ${match.info.stage ?? "match"} is excluded from its own record, so the read is genuinely pre-toss.`}
    >
      <div className="grid grid-3" style={{ gap: 22 }}>
        {/* ---------------- head to head ---------------- */}
        <div>
          <div className="stat-label" style={{ marginBottom: 10 }}>Head to head · loaded matches</div>
          {h2h.played === 0 ? (
            <div className="scout-note warn">
              <span className="sn-kicker">No prior meeting</span>
              These two have not met before in the {match.info.event} matches loaded here, so there is no
              head-to-head record to show.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 24, alignItems: "baseline", marginBottom: 12, flexWrap: "wrap" }}>
                <StatTile label={initials(a)} value={h2h.wins[a] ?? 0} accent={(h2h.wins[a] ?? 0) > (h2h.wins[b] ?? 0)} />
                <span style={{ color: "var(--ink-3)" }}>vs</span>
                <StatTile label={initials(b)} value={h2h.wins[b] ?? 0} accent={(h2h.wins[b] ?? 0) > (h2h.wins[a] ?? 0)} />
                <SampleBadge n={h2h.played} unit="prior meetings" />
              </div>
              {h2h.matches.map((m) => (
                <div key={m.id} style={{ fontSize: 12, color: "var(--ink-2)", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="mono" style={{ color: "var(--ink-3)" }}>{m.date}</span>
                  {m.stage ? ` · ${m.stage}` : ""} — {m.result}
                </div>
              ))}
            </>
          )}
        </div>

        {/* ---------------- venue history ---------------- */}
        <div>
          <div className="stat-label" style={{ marginBottom: 10 }}>This venue · historical scoring</div>
          {!venue ? (
            <div style={{ color: "var(--ink-3)", fontSize: 12.5 }}>No venue profile available.</div>
          ) : (
            <>
              <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)", marginBottom: 12 }}>{venue.name}</div>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                <StatTile label="Avg 1st inns" value={venue.avgFirstInnings ?? "–"} accent />
                <StatTile label="Chase win %" value={venue.chaseWinPct != null ? `${venue.chaseWinPct}%` : "–"} />
                <StatTile label="Spin econ" value={venue.spinEcon ?? "–"} sub={venue.spinBalls ? `${venue.spinBalls} balls` : undefined} />
                <StatTile label="Pace econ" value={venue.paceEcon ?? "–"} sub={venue.paceBalls ? `${venue.paceBalls} balls` : undefined} />
              </div>
              <div className={`scout-note ${small ? "warn" : ""}`} style={{ marginTop: 14 }}>
                <span className="sn-kicker">{small ? "Small sample" : "Historical pattern"}</span>
                {small
                  ? `Only ${venue.matches} match${venue.matches === 1 ? "" : "es"} at this ground in the loaded data — read these as leans, not a venue verdict.`
                  : `Based on ${venue.matches} matches at this ground in the loaded data.`}{" "}
                These are historical scoring patterns, not a live pitch inspection or groundstaff report.
              </div>
            </>
          )}
        </div>

        {/* ---------------- battles to watch ---------------- */}
        <div>
          <div className="stat-label" style={{ marginBottom: 10 }}>Player battles to watch</div>
          {battles.length === 0 ? (
            <div className="scout-note warn">
              <span className="sn-kicker">No prior matchups</span>
              None of these players have faced each other in the other loaded matches, so there is no prior
              batter-vs-bowler record to surface. Nothing has been invented to fill the gap.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {battles.map((bt, i) => <BattleCard key={i} b={bt} />)}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function BattleCard({ b }: { b: Battle }) {
  const { show, hide } = useTip();
  const edge = b.outs > 0 ? "bowler" : (b.sr ?? 0) >= 150 ? "batter" : "even";
  const verdict =
    edge === "bowler"
      ? `${b.bowler} has dismissed ${b.batter} ${b.outs}× in ${b.balls} balls.`
      : edge === "batter"
        ? `${b.batter} has scored at SR ${b.sr} against ${b.bowler} without being dismissed.`
        : `Evenly matched so far — SR ${b.sr}, no dismissal.`;
  const accent = edge === "bowler" ? "var(--wicket)" : edge === "batter" ? "var(--accent)" : "var(--ink-3)";
  return (
    <div
      style={{
        border: "1px solid var(--line)", borderLeft: `3px solid ${accent}`,
        borderRadius: "0 var(--radius-sm) var(--radius-sm) 0", padding: "10px 14px",
      }}
      onMouseMove={(e) => show(e.clientX, e.clientY, (
        <span>Across {b.matches} earlier match{b.matches === 1 ? "" : "es"} in the loaded data, excluding this one.</span>
      ))}
      onMouseLeave={hide}
    >
      <div style={{ fontSize: 13.5, fontWeight: 650 }}>
        {b.batter} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>vs</span> {b.bowler}
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", margin: "3px 0 6px" }}>
        {b.batHand}HB vs {b.bowlType ? BOWL_TYPE_LABELS[b.bowlType] ?? b.bowlType : "unknown type"}
        {" · "}{b.matches} prior match{b.matches === 1 ? "" : "es"}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{verdict}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 11 }}>{b.runs} off {b.balls}</span>
        <SampleBadge n={b.balls} />
      </div>
    </div>
  );
}
