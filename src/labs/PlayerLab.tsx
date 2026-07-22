import { useEffect, useMemo, useState } from "react";
import type { Meta, Player, PlayerIndexEntry, BattingAgg } from "../data/types";
import { BOWL_TYPE_LABELS, PHASE_NAMES } from "../data/types";
import { loadPlayer } from "../data/api";
import { filterBalls, aggBatting, aggBowling, oversStr } from "../data/analytics";
import type { PlayerLookup } from "../data/analytics";
import { useStore } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/Shell";
import { WagonWheel } from "../viz/WagonWheel";
import { PitchMap } from "../viz/PitchMap";
import { Radar, AccelCurve, InningsStrip, Donut } from "../viz/SmallCharts";
import type { RadarAxis } from "../viz/SmallCharts";

const norm = (v: number | null, lo: number, hi: number) =>
  v == null ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

function batterRadar(p: Player): RadarAxis[] {
  const b = p.batting;
  const srPP = b.phase["1"]?.sr ?? null;
  const srDeath = b.phase["3"]?.sr ?? null;
  const srPace = b.vsKind["pace"]?.sr ?? null;
  const srSpin = b.vsKind["spin"]?.sr ?? null;
  const early = b.acceleration[0]?.sr ?? null;
  const late = b.acceleration[2]?.sr ?? b.acceleration[1]?.sr ?? null;
  const accel = early && late ? late / early : null;
  const resist = b.overall.outs ? b.overall.balls / b.overall.outs : b.overall.balls;
  return [
    { label: "PP\nSR", value: norm(srPP, 80, 200), raw: `powerplay SR ${srPP ?? "–"} (${b.phase["1"]?.balls ?? 0} balls)` },
    { label: "Death\nSR", value: norm(srDeath, 100, 240), raw: `death SR ${srDeath ?? "–"} (${b.phase["3"]?.balls ?? 0} balls)` },
    { label: "vs\nPace", value: norm(srPace, 80, 200), raw: `SR vs pace ${srPace ?? "–"} (${b.vsKind["pace"]?.balls ?? 0} balls)` },
    { label: "vs\nSpin", value: norm(srSpin, 80, 200), raw: `SR vs spin ${srSpin ?? "–"} (${b.vsKind["spin"]?.balls ?? 0} balls)` },
    { label: "Accel", value: norm(accel, 0.8, 1.8), raw: `late/early SR ratio ${accel?.toFixed(2) ?? "–"}` },
    { label: "Resist", value: norm(resist, 8, 45), raw: `${resist.toFixed(0)} balls per dismissal` },
  ];
}

function bowlerRadar(p: Player): RadarAxis[] {
  const w = p.bowling;
  const inv = (v: number | null, lo: number, hi: number) => (v == null ? 0 : 1 - norm(v, lo, hi));
  return [
    { label: "PP\nEcon", value: inv(w.phase["1"]?.econ ?? null, 5, 12), raw: `powerplay econ ${w.phase["1"]?.econ ?? "–"}` },
    { label: "Mid\nEcon", value: inv(w.phase["2"]?.econ ?? null, 5, 12), raw: `middle econ ${w.phase["2"]?.econ ?? "–"}` },
    { label: "Death\nEcon", value: inv(w.phase["3"]?.econ ?? null, 6, 14), raw: `death econ ${w.phase["3"]?.econ ?? "–"}` },
    { label: "Strike", value: inv(w.overall.sr, 10, 40), raw: `wicket every ${w.overall.sr ?? "–"} balls` },
    { label: "Dots", value: norm(w.overall.dotPct, 20, 55), raw: `dot ball ${w.overall.dotPct ?? "–"}%` },
    { label: "vs L/R", value: 1 - Math.abs(norm(w.vsHand["R"]?.econ ?? null, 5, 12) - norm(w.vsHand["L"]?.econ ?? null, 5, 12)), raw: `econ vs RHB ${w.vsHand["R"]?.econ ?? "–"} / LHB ${w.vsHand["L"]?.econ ?? "–"}` },
  ];
}

function batterScoutNotes(p: Player): { good: string | null; bad: string | null } {
  const rows = Object.entries(p.batting.vsType)
    .filter(([t, a]) => t !== "unknown" && a.balls >= 18)
    .map(([t, a]) => ({
      t, ...a,
      danger: (a.sr ?? 0) / 100 - (a.outs ? (3 * a.outs) / (a.balls / 6) : 0),
    }));
  if (!rows.length) return { good: null, bad: null };
  // a cash zone needs survival too — prefer matchups he isn't regularly dismissed in
  const safe = rows.filter((r) => !r.outs || r.balls / r.outs >= 14);
  const best = (safe.length ? safe : rows).reduce((a, b) => ((a.sr ?? 0) > (b.sr ?? 0) ? a : b));
  const worst = rows.reduce((a, b) => (a.danger < b.danger ? a : b));
  const good = `Cash zone: ${BOWL_TYPE_LABELS[best.t] ?? best.t} — SR ${best.sr}, out every ${best.outs ? Math.round(best.balls / best.outs) : "∞"} balls (${best.balls}-ball sample).`;
  const bad = worst.t !== best.t
    ? `Vulnerable vs ${BOWL_TYPE_LABELS[worst.t] ?? worst.t}: SR ${worst.sr}, dismissed ${worst.outs}× in ${worst.balls} balls.`
    : null;
  return { good, bad };
}

function bowlerCaptainNote(p: Player): string | null {
  const phases = Object.entries(p.bowling.phase).filter(([, a]) => a.balls >= 18);
  if (!phases.length) return null;
  const best = phases.reduce((a, b) => ((a[1].econ ?? 99) < (b[1].econ ?? 99) ? a : b));
  const hands = Object.entries(p.bowling.vsHand).filter(([, a]) => a.balls >= 18);
  const prey = hands.length
    ? hands.reduce((a, b) => ((a[1].econ ?? 99) < (b[1].econ ?? 99) ? a : b))
    : null;
  let s = `Captain's note: best used in the ${PHASE_NAMES[+best[0]].toLowerCase()} (econ ${best[1].econ}, ${best[1].wkts} wkts).`;
  if (prey) s += ` Prefers bowling to ${prey[0] === "R" ? "right" : "left"}-handers (econ ${prey[1].econ} vs ${(prey[0] === "R" ? hands.find(h => h[0] === "L") : hands.find(h => h[0] === "R"))?.[1].econ ?? "–"}).`;
  return s;
}

function MatchupTable({ rows, kind }: {
  rows: ({ name: string } & Partial<BattingAgg> & { type?: string | null; hand?: string; econ?: number | null; wkts?: number })[];
  kind: "bat" | "bowl";
}) {
  const openDrawer = useStore((s) => s.openDrawer);
  void openDrawer;
  return (
    <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>{kind === "bat" ? "vs bowler" : "vs batter"}</th>
            <th>{kind === "bat" ? "type" : "hand"}</th>
            <th>runs</th><th>balls</th>
            <th>{kind === "bat" ? "SR" : "econ"}</th>
            <th>outs</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 14).map((r) => {
            const outs = kind === "bat" ? r.outs : r.wkts;
            const rate = kind === "bat" ? r.sr : r.econ;
            const good = kind === "bat" ? (rate ?? 0) >= 150 && !outs : (rate ?? 99) <= 7;
            const badR = kind === "bat" ? ((rate ?? 0) < 110 || (outs ?? 0) >= 2) : (rate ?? 0) >= 10;
            return (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="mono" style={{ color: "var(--ink-3)" }}>{kind === "bat" ? (r.type ?? "?") : (r.hand ?? "?")}</td>
                <td>{r.runs}</td>
                <td>{r.balls}</td>
                <td className="mono" style={{ color: good ? "var(--accent)" : badR ? "var(--wicket)" : "var(--ink)" }}>{rate ?? "–"}</td>
                <td style={{ color: outs ? "var(--wicket)" : "var(--ink-3)" }}>{outs || "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlayerLab({ players, meta, lookup }: { players: PlayerIndexEntry[]; meta: Meta; lookup: PlayerLookup }) {
  const { playerId, setPlayer, comparePlayerId, setComparePlayer, filters } = useStore();
  const [player, setPlayerData] = useState<Player | null>(null);
  const [compare, setCompareData] = useState<Player | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"bat" | "bowl">("bat");

  useEffect(() => {
    if (!playerId) return;
    loadPlayer(playerId).then(setPlayerData);
  }, [playerId]);
  useEffect(() => {
    if (!comparePlayerId) {
      setCompareData(null);
      return;
    }
    loadPlayer(comparePlayerId).then(setCompareData);
  }, [comparePlayerId]);

  const shortlist = useMemo(() => {
    const q = query.toLowerCase();
    return players
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.teams.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => (b.runs + b.wkts * 25) - (a.runs + a.wkts * 25))
      .slice(0, 24);
  }, [players, query]);

  const p = playerId ? player : null;
  const isBowlerish = p ? p.role === "bowler" : false;
  useEffect(() => {
    if (p) setView(isBowlerish ? "bowl" : "bat");
  }, [p, isBowlerish]);

  const filteredBat = useMemo(() => (p ? filterBalls(p.balls.bat, filters, lookup) : []), [p, filters, lookup]);
  const filteredBowl = useMemo(() => (p ? filterBalls(p.balls.bowl, filters, lookup) : []), [p, filters, lookup]);
  const fBatAgg = useMemo(() => (p ? aggBatting(filteredBat, p.name) : null), [filteredBat, p]);
  const fBowlAgg = useMemo(() => aggBowling(filteredBowl), [filteredBowl]);

  const notes = p ? batterScoutNotes(p) : { good: null, bad: null };
  const capNote = p ? bowlerCaptainNote(p) : null;

  return (
    <section id="player-lab" className="lab-section">
      <div className="lab-header">
        <div className="lab-kicker">Analysis universe 02</div>
        <h2 className="lab-title">Player Lab</h2>
        <p className="lab-blurb">
          Scouting dossiers built from every ball in the dataset — strengths, vulnerabilities, matchups,
          and a pin-to-compare mode with ghost overlays.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          placeholder="Search player or team…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 260 }}
        />
        {p && (
          <>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>compare with:</span>
            <select className="select" value={comparePlayerId ?? ""} onChange={(e) => setComparePlayer(e.target.value || null)}>
              <option value="">— none —</option>
              {players.filter((x) => x.id !== playerId && (view === "bowl" ? x.ballsBowled >= 60 : x.ballsFaced >= 60)).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10, marginBottom: 20 }}>
        {shortlist.map((pl) => (
          <button key={pl.id} className={`picker-card ${playerId === pl.id ? "selected" : ""}`}
            style={{ minWidth: 190, flexShrink: 0 }} onClick={() => setPlayer(pl.id)}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
              {pl.name} {pl.uncertain && <span title="metadata uncertain" style={{ color: "var(--gold)", fontSize: 11 }}>?</span>}
            </div>
            <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", margin: "3px 0" }}>
              {pl.role.toUpperCase()} · {pl.bat}HB{pl.bowl ? ` · ${pl.bowl}` : ""}{pl.wk ? " · WK" : ""}
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
              {pl.ballsFaced >= 12 && `${pl.runs} runs @ SR ${pl.sr}`}
              {pl.ballsFaced >= 12 && pl.ballsBowled >= 12 && " · "}
              {pl.ballsBowled >= 12 && `${pl.wkts} wkts @ ${pl.econ}`}
            </div>
          </button>
        ))}
      </div>

      {!p ? (
        <div className="panel" style={{ textAlign: "center", padding: 60, color: "var(--ink-3)" }}>
          ↑ Pick a player to open their dossier
        </div>
      ) : (
        <div>
          {/* identity card */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "clamp(26px,3vw,40px)" }}>{p.name}</h3>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 4 }}>
                  {p.meta.bat}HB{p.meta.bowl ? ` · ${BOWL_TYPE_LABELS[p.meta.bowl] ?? p.meta.bowl}` : ""}{p.meta.wk ? " · keeper" : ""} · {p.teams.join(", ")} · {p.matches} matches
                  {p.meta.uncertain && <span style={{ color: "var(--gold)" }}> · metadata uncertain — edit scripts/players_meta.json</span>}
                </div>
                <div className="chip-row" style={{ marginTop: 12 }}>
                  <button className={`chip ${view === "bat" ? "active" : ""}`} onClick={() => setView("bat")}>Batting dossier</button>
                  <button className={`chip ${view === "bowl" ? "active" : ""}`} onClick={() => setView("bowl")}>Bowling dossier</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 28, marginLeft: "auto", flexWrap: "wrap" }}>
                {view === "bat" ? (
                  <>
                    <StatTile label="Runs" value={p.batting.overall.runs} accent />
                    <StatTile label="SR" value={p.batting.overall.sr} />
                    <StatTile label="Avg" value={p.batting.overall.avg} />
                    <StatTile label="Boundary %" value={p.batting.overall.boundaryPct} />
                    <StatTile label="Dot %" value={p.batting.overall.dotPct} />
                  </>
                ) : (
                  <>
                    <StatTile label="Wickets" value={p.bowling.overall.wkts} accent />
                    <StatTile label="Econ" value={p.bowling.overall.econ} />
                    <StatTile label="Bowl SR" value={p.bowling.overall.sr} />
                    <StatTile label="Dot %" value={p.bowling.overall.dotPct} />
                    <StatTile label="Overs" value={oversStr(p.bowling.overall.balls)} />
                  </>
                )}
              </div>
            </div>
          </div>

          <FilterBar />

          <div className="grid grid-2">
            {view === "bat" ? (
              <>
                <Panel title="Skill Radar" tier="DERIVED" n={p.batting.overall.balls}
                  sub="Six normalized batting skills. Hover a vertex for the raw number. Purple ghost = pinned comparison.">
                  <Radar axes={batterRadar(p)} ghost={compare ? batterRadar(compare) : null}
                    name={p.name} ghostName={compare?.name} />
                </Panel>

                <Panel title="How He Gets Out" tier="RECORDED"
                  sub="Dismissal kinds across the dataset, plus phase distribution.">
                  <Donut data={p.batting.dismissals} title="dismissals" />
                  <div style={{ display: "flex", gap: 22, marginTop: 16 }}>
                    {Object.entries(p.batting.dismissalPhase).map(([ph, n]) => (
                      <StatTile key={ph} label={PHASE_NAMES[+ph]} value={n} />
                    ))}
                  </div>
                  {(notes.bad || notes.good) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                      {notes.bad && <div className="scout-note warn"><span className="sn-kicker">Vulnerability · threshold-based</span>{notes.bad}</div>}
                      {notes.good && <div className="scout-note"><span className="sn-kicker">Cash zone · threshold-based</span>{notes.good}</div>}
                    </div>
                  )}
                </Panel>

                <Panel title="Composite Wagon Wheel" tier="MODELED" tierLabel="MODELED DIRECTIONS · REAL RUNS"
                  n={filteredBat.filter((b) => b.rb > 0).length} nUnit="scoring shots"
                  sub="All innings combined — responds to the global filters (phase, bowler type…).">
                  <WagonWheel balls={filteredBat} title={p.name} batHand={p.meta.bat} />
                  {fBatAgg && (
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)", textAlign: "center", marginTop: 6 }}>
                      slice: {fBatAgg.runs} runs @ SR {fBatAgg.sr ?? "–"} ({fBatAgg.balls} balls)
                    </div>
                  )}
                </Panel>

                <Panel title="Danger & Comfort Zones" tier="DERIVED" sub="Matchups vs bowler types and specific bowlers (≥6 balls). Green = cashing, red = struggling.">
                  <table className="data-table" style={{ marginBottom: 14 }}>
                    <thead><tr><th>bowler type</th><th>runs</th><th>balls</th><th>SR</th><th>outs</th></tr></thead>
                    <tbody>
                      {Object.entries(p.batting.vsType).filter(([t, a]) => t !== "unknown" && a.balls >= 6).sort((a, b) => b[1].balls - a[1].balls).map(([t, a]) => (
                        <tr key={t}>
                          <td>{BOWL_TYPE_LABELS[t] ?? t}</td>
                          <td>{a.runs}</td><td>{a.balls}</td>
                          <td className="mono" style={{ color: (a.sr ?? 0) >= 150 ? "var(--accent)" : (a.sr ?? 0) < 110 ? "var(--wicket)" : "var(--ink)" }}>{a.sr}</td>
                          <td style={{ color: a.outs ? "var(--wicket)" : "var(--ink-3)" }}>{a.outs || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <MatchupTable rows={p.batting.vsBowlers} kind="bat" />
                </Panel>

                <Panel title="Acceleration Curve" tier="DERIVED" sub="Strike rate by ball-at-crease bucket vs the competition average (settling-in curve).">
                  <AccelCurve own={p.batting.acceleration} ghost={compare?.batting.acceleration}
                    ownName={p.name.split(" ").pop() ?? p.name} ghostName={compare?.name.split(" ").pop()}
                    compAvg={meta.competition.acceleration} />
                </Panel>

                <Panel title="Innings by Innings" tier="RECORDED" sub="Every knock in the dataset — sparkline of the innings, red dot = dismissal ball.">
                  <InningsStrip innings={p.batting.innings} />
                </Panel>
              </>
            ) : (
              <>
                <Panel title="Bowling Radar" tier="DERIVED" n={p.bowling.overall.balls}
                  sub="Six normalized bowling skills (economy axes inverted — bigger is better). Purple ghost = pinned comparison.">
                  <Radar axes={bowlerRadar(p)} ghost={compare ? bowlerRadar(compare) : null}
                    name={p.name} ghostName={compare?.name} />
                  {capNote && <div className="scout-note" style={{ marginTop: 14 }}><span className="sn-kicker">When to bowl him</span>{capNote}</div>}
                </Panel>

                <Panel title="How He Takes Wickets" tier="RECORDED" sub="Wicket kinds, plus economy split by phase.">
                  <Donut data={p.bowling.wicketKinds} title="wickets" />
                  <table className="data-table" style={{ marginTop: 14 }}>
                    <thead><tr><th>phase</th><th>overs</th><th>runs</th><th>wkts</th><th>econ</th><th>dot %</th></tr></thead>
                    <tbody>
                      {Object.entries(p.bowling.phase).sort().map(([ph, a]) => (
                        <tr key={ph}>
                          <td>{PHASE_NAMES[+ph]}</td>
                          <td>{oversStr(a.balls)}</td><td>{a.runs}</td><td>{a.wkts}</td>
                          <td className="mono" style={{ color: (a.econ ?? 99) <= 7.5 ? "var(--accent)" : (a.econ ?? 0) >= 10 ? "var(--wicket)" : "var(--ink)" }}>{a.econ}</td>
                          <td>{a.dotPct}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>

                <Panel title="Composite Pitch Map" tier="MODELED" tierLabel="MODELED PITCH MAP · REAL OUTCOMES" n={filteredBowl.length}
                  sub="Every ball bowled in the dataset — responds to the global filters.">
                  <PitchMap balls={filteredBowl} title={p.name} />
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)", textAlign: "center", marginTop: 6 }}>
                    slice: {fBowlAgg.wkts} wkts · econ {fBowlAgg.econ ?? "–"} ({oversStr(fBowlAgg.balls)} ov)
                  </div>
                </Panel>

                <Panel title="Matchups" tier="DERIVED" sub="Economy vs handedness, and every batter faced ≥6 balls.">
                  <table className="data-table" style={{ marginBottom: 14 }}>
                    <thead><tr><th>vs hand</th><th>overs</th><th>runs</th><th>wkts</th><th>econ</th></tr></thead>
                    <tbody>
                      {Object.entries(p.bowling.vsHand).map(([h, a]) => (
                        <tr key={h}>
                          <td>{h === "R" ? "Right-handers" : "Left-handers"}</td>
                          <td>{oversStr(a.balls)}</td><td>{a.runs}</td><td>{a.wkts}</td>
                          <td className="mono">{a.econ}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <MatchupTable rows={p.bowling.vsBatters} kind="bowl" />
                </Panel>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
