import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Innings, Match, MatchIndexEntry } from "../data/types";
import { loadMatch } from "../data/api";
import {
  filterBalls, isFiltering, extrasBreakdown, dismissalKinds, aggBatting, aggBowling, oversStr,
} from "../data/analytics";
import type { PlayerLookup } from "../data/analytics";
import { useStore } from "../state/store";
import { FilterBar } from "../components/FilterBar";
import { Panel } from "../components/Panel";
import { CountUp, StatTile } from "../components/Shell";
import { Worm } from "../viz/Worm";
import { Manhattan } from "../viz/Manhattan";
import { WagonWheel } from "../viz/WagonWheel";
import { PitchMap } from "../viz/PitchMap";
import { MatchupMatrix } from "../viz/MatchupMatrix";
import { PartnershipFlow, MomentumChart, SpellsTimeline, Donut } from "../viz/SmallCharts";
import { KeyMomentsReel } from "../viz/KeyMoments";
import { PreMatchReport } from "./PreMatchReport";
import { ReplayScrubber, flattenBalls } from "./ReplayScrubber";

export function MatchLab({ index, lookup }: { index: MatchIndexEntry[]; lookup: PlayerLookup }) {
  const { matchId, setMatch, filters, innings } = useStore();
  const [match, setMatchData] = useState<Match | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let live = true;
    loadMatch(matchId).then((m) => live && setMatchData(m));
    return () => {
      live = false;
    };
  }, [matchId]);

  const active = matchId ? match : null;

  return (
    <section id="match-lab" className="lab-section">
      <div className="lab-header">
        <div className="lab-kicker">Analysis universe 01</div>
        <h2 className="lab-title">Match Lab</h2>
        <p className="lab-blurb">
          Pick any match for a full autopsy — worm & win probability, Manhattan, modeled wagon wheels
          and pitch maps, matchups, momentum. Click anything to drill to the raw deliveries.
        </p>
      </div>

      {/* match picker */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, marginBottom: 20 }}>
        {index.map((m) => (
          <button
            key={m.id}
            className={`picker-card ${matchId === m.id ? "selected" : ""}`}
            style={{ minWidth: 230, flexShrink: 0 }}
            onClick={() => setMatch(m.id)}
          >
            <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.1em" }}>
              {m.date} · {m.stage ?? (m.matchNumber ? `MATCH ${m.matchNumber}` : "")}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, margin: "4px 0" }}>
              {m.short[0]} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>vs</span> {m.short[1]}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
              {m.scores.map((s) => `${s.runs}/${s.wkts}`).join(" · ") || "—"}
            </div>
            <div style={{ fontSize: 11, color: m.winner ? "var(--accent-dim)" : "var(--ink-3)", marginTop: 3 }}>
              {m.result}
            </div>
          </button>
        ))}
      </div>

      {!active ? (
        <div className="panel" style={{ textAlign: "center", padding: 60, color: "var(--ink-3)" }}>
          ↑ Select a match to open the autopsy
        </div>
      ) : (
        <MatchAutopsy match={active} lookup={lookup} filtered={isFiltering(filters)} innings={innings} />
      )}
    </section>
  );
}

function MatchAutopsy({ match, lookup, filtered, innings }: {
  match: Match; lookup: PlayerLookup; filtered: boolean; innings: number;
}) {
  const { filters, openDrawer } = useStore();
  const info = match.info;

  // ---- replay scrubber state (parks at the end of the match on load) ----
  const flatBalls = useMemo(() => flattenBalls(match), [match]);
  const [replayIdx, setReplayIdx] = useState(flatBalls.length - 1);
  const [activeMoment, setActiveMoment] = useState<number | null>(null);
  useEffect(() => {
    setReplayIdx(flatBalls.length - 1);
    setActiveMoment(null);
  }, [flatBalls]);
  const replayCur = flatBalls[Math.min(replayIdx, flatBalls.length - 1)];

  // A Super Over adds 3rd/4th innings; label them so panels are not ambiguous.
  // Only tag Super Over innings on limited-overs matches — a Test's 3rd and
  // 4th innings are normal, not a shootout.
  const inningsLabel = (inn: Innings) =>
    info.superOver && match.innings.indexOf(inn) > 1 ? `${inn.team} (Super Over)` : inn.team;

  const visibleInnings = useMemo(
    () => match.innings.filter((_, i) => innings === 0 || i === innings - 1),
    [match, innings],
  );
  const inningsBalls = useMemo(
    () => visibleInnings.map((inn) => filterBalls(inn.deliveries, filters, lookup)),
    [visibleInnings, filters, lookup],
  );
  const allBalls = useMemo(() => inningsBalls.flat(), [inningsBalls]);
  // matrix ignores its own batter/bowler cross-filter so you can pivot between cells
  const matrixBalls = useMemo(
    () =>
      visibleInnings
        .map((inn) => filterBalls(inn.deliveries, { ...filters, batter: null, bowler: null }, lookup))
        .flat(),
    [visibleInnings, filters, lookup],
  );

  const [wheelBatter, setWheelBatter] = useState<string>("");
  const [mapBowler, setMapBowler] = useState<string>("");

  const batters = useMemo(() => {
    const seen = new Map<string, number>();
    for (const b of allBalls) seen.set(b.bat, (seen.get(b.bat) ?? 0) + b.rb);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [allBalls]);
  const bowlers = useMemo(() => {
    const seen = new Set<string>();
    for (const b of allBalls) seen.add(b.bwl);
    return [...seen];
  }, [allBalls]);

  const wheelBalls = useMemo(
    () => (wheelBatter ? allBalls.filter((b) => b.bat === wheelBatter) : allBalls),
    [allBalls, wheelBatter],
  );
  const mapBalls = useMemo(
    () => (mapBowler ? allBalls.filter((b) => b.bwl === mapBowler) : allBalls),
    [allBalls, mapBowler],
  );

  const extras = useMemo(() => extrasBreakdown(allBalls), [allBalls]);
  const outs = useMemo(() => dismissalKinds(allBalls), [allBalls]);
  const batAgg = useMemo(() => aggBatting(allBalls), [allBalls]);
  const bowlAgg = useMemo(() => aggBowling(allBalls), [allBalls]);

  const wormInsight = useMemo(() => {
    if (match.innings.length < 2) return null;
    const chase = match.innings[1];
    const swing = chase.deliveries.reduce(
      (acc, d, i) => {
        if (i === 0) return acc;
        const delta = Math.abs(d.wp - chase.deliveries[i - 1].wp);
        return delta > acc.delta ? { delta, d } : acc;
      },
      { delta: 0, d: chase.deliveries[0] },
    );
    return swing.d
      ? `Biggest win-probability swing of the chase: over ${swing.d.ov}.${swing.d.b} (${swing.d.bwl} to ${swing.d.bat}) moved it ${(swing.delta * 100).toFixed(0)} points.`
      : null;
  }, [match]);

  return (
    <div>
      {/* header */}
      <motion.div
        className="panel"
        style={{ marginBottom: 20, overflow: "hidden" }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-end" }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              {info.event} · {info.stage ?? `Match ${info.matchNumber ?? ""}`} · {info.date} · {info.venue}{info.city ? `, ${info.city}` : ""} · {info.matchType}
            </div>
            <h3 style={{ fontSize: "clamp(24px, 3.4vw, 42px)", margin: "6px 0 2px" }}>
              {info.teams[0]} <span style={{ color: "var(--ink-3)" }}>vs</span> {info.teams[1]}
            </h3>
            <div style={{ color: "var(--accent)", fontSize: 14.5 }}>{info.result}</div>
            <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 4 }}>
              Toss: {info.toss.winner} ({info.toss.decision}){info.pom ? ` · Player of the match: ${info.pom}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 34, marginLeft: "auto" }}>
            {match.innings.map((inn, i) => (
              <div key={i} style={{ textAlign: "right" }}>
                <div className="stat-label">{inn.team.split(" ").map((w) => w[0]).join("")}</div>
                <div className="stat-hero" style={{ fontSize: "clamp(44px,5vw,84px)", color: info.winner === inn.team ? "var(--accent)" : "var(--ink)" }}>
                  <CountUp value={inn.total} />
                  <span style={{ fontSize: "0.42em", color: "var(--ink-2)" }}>/{inn.wickets}</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{oversStr(inn.balls)} ov</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <FilterBar showInnings />
      {filtered && (
        <div className="mono" style={{ fontSize: 11, color: "var(--gold)", margin: "-12px 0 16px 4px" }}>
          ⚡ filters active — every chart below is recomputed from {allBalls.length} matching balls
        </div>
      )}

      <div className="grid" style={{ marginBottom: 18 }}>
        <PreMatchReport match={match} />
      </div>

      <div className="grid grid-2">
        <Panel title="The Worm & Win Probability" tier="DERIVED" wide
          sub={`Cumulative runs with a ball-by-ball win-probability ribbon (logistic model over resources remaining). The green marker is the replay position. ${filtered ? "Note: worm always shows the full innings; filters apply to the other panels." : ""}`}
          insight={wormInsight}>
          <Worm innings={match.innings.slice(0, 2)} teams={info.teams} target={info.target}
            cursor={replayCur ? { innIdx: replayCur.innIdx, legal: replayCur.legal } : null} />
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <ReplayScrubber match={match} balls={flatBalls} idx={replayIdx}
              setIdx={(i) => { setReplayIdx(i); setActiveMoment(null); }} />
          </div>
        </Panel>

        <Panel title="Key Moments Reel" tier="DERIVED" wide n={match.keyMoments?.length ?? 0} nUnit="moments"
          sub="The deliveries that moved the win probability most, capped at one per over. Click any card to move the replay above to that ball."
          insight={match.keyMoments?.length
            ? `Biggest swing: over ${match.keyMoments[0].ov}.${match.keyMoments[0].b}, ${match.keyMoments[0].bwl} to ${match.keyMoments[0].bat} — ${match.keyMoments[0].desc.toLowerCase()}, worth ${(match.keyMoments[0].swing * 100).toFixed(0)} points of win probability.`
            : null}>
          <KeyMomentsReel moments={match.keyMoments ?? []} activeIdx={activeMoment}
            onJump={(mo, i) => {
              const target = flatBalls.findIndex(
                (fb) => fb.innIdx === mo.inn && fb.d.ov === mo.ov && fb.d.b === mo.b);
              if (target >= 0) { setReplayIdx(target); setActiveMoment(i); }
            }} />
        </Panel>

        <Panel title="Manhattan" tier="RECORDED" wide sub="Runs per over · dots mark wickets · phase bands shaded. Click an over to see its deliveries.">
          <Manhattan inningsBalls={inningsBalls} teams={visibleInnings.map((i) => i.team)} />
        </Panel>

        <Panel title="Wagon Wheel" tier="MODELED" tierLabel="MODELED DIRECTIONS · REAL RUNS" n={wheelBalls.filter((b) => b.rb > 0).length} nUnit="scoring shots"
          sub="Shot directions reconstructed from priors (handedness × bowler type × run value × phase), seeded per delivery. Click a sector for its balls.">
          <div className="chip-row" style={{ marginBottom: 8 }} data-noexport="1">
            <button className={`chip ${!wheelBatter ? "active" : ""}`} onClick={() => setWheelBatter("")}>All batters</button>
            <select className="select" value={wheelBatter} onChange={(e) => setWheelBatter(e.target.value)}>
              <option value="">batter…</option>
              {batters.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <WagonWheel balls={wheelBalls} title={wheelBatter || "all batters"}
            batHand={wheelBatter ? (lookup.get(wheelBatter)?.bat as "R" | "L") ?? "R" : "R"} />
        </Panel>

        <Panel title="Pitch Map" tier="MODELED" tierLabel="MODELED PITCH MAP · REAL OUTCOMES" n={mapBalls.length}
          sub="Line & length reconstructed from priors conditioned on bowler type and outcome (bowled/LBW pull toward the stumps; cut/pulled boundaries toward short).">
          <div className="chip-row" style={{ marginBottom: 8 }} data-noexport="1">
            <button className={`chip ${!mapBowler ? "active" : ""}`} onClick={() => setMapBowler("")}>All bowlers</button>
            <select className="select" value={mapBowler} onChange={(e) => setMapBowler(e.target.value)}>
              <option value="">bowler…</option>
              {bowlers.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <PitchMap balls={mapBalls} title={mapBowler || "all bowlers"} />
        </Panel>

        <Panel title="Matchup Matrix" tier="RECORDED" wide
          sub="Batters × bowlers. Click a cell to cross-filter every chart in the Lab (the soul of Analyst Mode); double-click for the balls.">
          <MatchupMatrix balls={matrixBalls} />
        </Panel>

        {visibleInnings.map((inn, i) => (
          <Panel key={i} title={`Partnerships — ${inningsLabel(inn)}`} tier="RECORDED" sub="Each stand's runs (balls). Unbroken stands in green. Click for the deliveries.">
            <PartnershipFlow balls={inningsBalls[i]} team={inn.team} />
          </Panel>
        ))}

        {visibleInnings.map((inn, i) => (
          <Panel key={`m${i}`} title={`Momentum — ${inningsLabel(inn)}`} tier="DERIVED"
            sub={i === 1 || (innings === 2 && match.innings.length > 1)
              ? "Rolling 12-ball run rate minus required rate."
              : "Rolling 12-ball run rate minus the innings' own average rate."}>
            <MomentumChart
              balls={inn.deliveries}
              target={match.innings.indexOf(inn) === 1 ? info.target : null}
              targetBalls={info.targetBalls}
              label={inn.team}
            />
          </Panel>
        ))}

        <Panel title="Bowling Spells" tier="DERIVED" wide sub="Gantt lanes per bowler — bar color = spell economy (brighter is cheaper), dots = wickets. Click a spell for its balls.">
          <SpellsTimeline balls={allBalls} />
        </Panel>

        <Panel title="Control Panel" tier="RECORDED" sub="How controlled was the cricket in the current filter slice?">
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 14 }}>
            <StatTile label="Dot %" value={batAgg.dotPct} />
            <StatTile label="Boundary %" value={batAgg.boundaryPct} accent />
            <StatTile label="Run rate" value={bowlAgg.econ} />
            <StatTile label="Fours" value={batAgg.fours} />
            <StatTile label="Sixes" value={batAgg.sixes} />
          </div>
          <button className="chip" onClick={() => openDrawer({ title: "All balls in current slice", balls: allBalls })}>
            Show all {allBalls.length} balls →
          </button>
        </Panel>

        <Panel title="Extras & Dismissals" tier="RECORDED" sub="Breakdown donuts for the current slice.">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Donut data={extras as unknown as Record<string, number>} title="extras" />
            <Donut data={outs} title="wickets" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
