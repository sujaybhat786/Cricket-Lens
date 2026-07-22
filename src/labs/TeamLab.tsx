import { useEffect, useMemo, useState } from "react";
import type { Meta, Team, MatchIndexEntry } from "../data/types";
import { PACE_TYPES, SPIN_TYPES, PHASE_NAMES } from "../data/types";
import { loadTeam } from "../data/api";
import { useStore } from "../state/store";
import { Panel } from "../components/Panel";
import { StatTile } from "../components/Shell";
import { Radar } from "../viz/SmallCharts";
import type { RadarAxis } from "../viz/SmallCharts";
import { useTip } from "../components/Tooltip";

interface SquadCard {
  name: string; bat: string; bowl: string | null; wk: boolean; uncertain: boolean;
  runs: number; sr: number | null; ballsFaced: number; ppSR: number | null; deathSR: number | null;
  wkts: number; econ: number | null; ballsBowled: number;
  ppEcon: number | null; ppBalls: number; deathEcon: number | null; deathBalls: number;
}
type TeamFull = Team & { squadCards: SquadCard[] };

const norm = (v: number | null, lo: number, hi: number) =>
  v == null ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

function teamRadar(t: TeamFull, meta: Meta): RadarAxis[] {
  const cards = t.squadCards;
  const depth = cards.filter((c) => c.ballsFaced >= 60 && (c.sr ?? 0) >= 120).length;
  const ppRR = t.batPhase["1"]?.rr ?? null;
  const compPP = meta.competition.phase["1"]?.rr ?? 9;
  const deathEcon = t.bowlPhase["3"]?.rr ?? null;
  const spinBalls = cards.filter((c) => c.bowl && SPIN_TYPES.includes(c.bowl)).reduce((s, c) => s + c.ballsBowled, 0);
  const paceBalls = cards.filter((c) => c.bowl && PACE_TYPES.includes(c.bowl)).reduce((s, c) => s + c.ballsBowled, 0);
  const fielding = (t.catches + 2 * t.runOuts) / Math.max(1, t.played);
  return [
    { label: "Bat\ndepth", value: norm(depth, 2, 8), raw: `${depth} batters with ≥60 balls @ SR 120+` },
    { label: "PP\nattack", value: norm(ppRR, compPP - 2, compPP + 2), raw: `powerplay RR ${ppRR ?? "–"} (comp avg ${compPP})` },
    { label: "Death\nbowl", value: 1 - norm(deathEcon, 8, 13), raw: `death-overs economy ${deathEcon ?? "–"}` },
    { label: "Spin", value: norm(spinBalls, 100, 900), raw: `${Math.round(spinBalls / 6)} overs of spin in dataset` },
    { label: "Pace", value: norm(paceBalls, 200, 1200), raw: `${Math.round(paceBalls / 6)} overs of pace in dataset` },
    { label: "Field", value: norm(fielding, 3, 8), raw: `${fielding.toFixed(1)} (catches + 2×run-outs) per match — soft proxy` },
  ];
}

function PhaseDominance({ team, meta }: { team: TeamFull; meta: Meta }) {
  const { show, hide } = useTip();
  const rows = ([1, 2, 3] as const).map((ph) => ({
    ph,
    bat: team.batPhase[`${ph}`]?.rr ?? null,
    bowl: team.bowlPhase[`${ph}`]?.rr ?? null,
    comp: meta.competition.phase[`${ph}`]?.rr ?? null,
  }));
  const max = 13;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.ph}>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            {PHASE_NAMES[r.ph]} <span style={{ color: "var(--ink-3)" }}>· comp avg {r.comp}</span>
          </div>
          {[
            ["batting RR", r.bat, "var(--accent-dim)"],
            ["bowling econ", r.bowl, "var(--c4)"],
          ].map(([label, v, color]) => (
            <div key={label as string} style={{ display: "grid", gridTemplateColumns: "90px 1fr 44px", gap: 10, alignItems: "center", marginBottom: 3 }}
              onMouseMove={(e) => show(e.clientX, e.clientY, <span>{label}: {v ?? "–"} vs competition {r.comp}</span>)}
              onMouseLeave={hide}>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>{label}</span>
              <div style={{ background: "rgba(148,170,200,0.07)", height: 12, borderRadius: 4, position: "relative" }}>
                <div style={{ width: `${((v as number ?? 0) / max) * 100}%`, height: "100%", background: color as string, borderRadius: 4, opacity: 0.85 }} />
                {r.comp != null && <div style={{ position: "absolute", left: `${(r.comp / max) * 100}%`, top: -2, bottom: -2, width: 1.6, background: "var(--ink-2)" }} />}
              </div>
              <span className="mono" style={{ fontSize: 11, textAlign: "right" }}>{v ?? "–"}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>│ marker = competition average (batting: higher is better · bowling: lower is better)</div>
    </div>
  );
}

function XIBuilder({ team }: { team: TeamFull }) {
  const [xi, setXi] = useState<string[]>([]);
  useEffect(() => setXi([]), [team.id]);
  const cards = team.squadCards;
  const picked = cards.filter((c) => xi.includes(c.name));

  const lefties = picked.filter((c) => c.bat === "L").length;
  const spinners = picked.filter((c) => c.bowl && SPIN_TYPES.includes(c.bowl) && c.ballsBowled >= 24);
  const pacers = picked.filter((c) => c.bowl && PACE_TYPES.includes(c.bowl) && c.ballsBowled >= 24);
  const deathSpecs = picked.filter((c) => c.deathBalls >= 18 && (c.deathEcon ?? 99) <= 10.5);
  const ppBowlers = picked.filter((c) => c.ppBalls >= 18);
  const keepers = picked.filter((c) => c.wk);
  const leftArm = picked.filter((c) => c.bowl && ["LF", "LM", "SLA", "LWS"].includes(c.bowl));

  const flags: { ok: boolean; text: string }[] = [
    { ok: keepers.length >= 1, text: keepers.length ? `keeper: ${keepers.map((k) => k.name).join(", ")}` : "no wicketkeeper picked" },
    { ok: spinners.length + pacers.length >= 5, text: `${spinners.length + pacers.length} frontline bowling options (need ≥5 to cover 20 overs)` },
    { ok: deathSpecs.length >= 2, text: deathSpecs.length ? `death overs: ${deathSpecs.map((d) => d.name).join(", ")}` : "nobody proven at the death (≥3 death overs, econ ≤10.5)" },
    { ok: ppBowlers.length >= 2, text: `${ppBowlers.length} bowler(s) with powerplay experience` },
    { ok: lefties >= 2 && lefties <= 6, text: `${lefties} left-hand batter(s) — ${lefties < 2 ? "matchup-vulnerable to a single spin type" : "healthy left-right mix"}` },
    { ok: leftArm.length >= 1, text: leftArm.length ? `left-arm angle: ${leftArm.map((l) => l.name).join(", ")}` : "no left-arm bowling option" },
    { ok: spinners.length >= 2, text: `${spinners.length} frontline spinner(s)` },
  ];

  return (
    <div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)", marginBottom: 10 }}>
        Tap players to build an XI ({xi.length}/11) — coverage recomputes live. Rule-based, from dataset aggregates.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {cards.sort((a, b) => (b.runs + b.wkts * 25) - (a.runs + a.wkts * 25)).map((c) => {
          const sel = xi.includes(c.name);
          return (
            <button key={c.name} className={`chip ${sel ? "active" : ""}`}
              style={{ textTransform: "none" }}
              onClick={() => setXi((x) => sel ? x.filter((n) => n !== c.name) : x.length < 11 ? [...x, c.name] : x)}>
              {c.name}
              <span style={{ color: "var(--ink-3)", marginLeft: 5, fontSize: 9 }}>
                {c.bat}HB{c.bowl ? `·${c.bowl}` : ""}{c.wk ? "·WK" : ""}
              </span>
            </button>
          );
        })}
      </div>
      {picked.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {flags.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
              <span style={{ color: f.ok ? "var(--accent)" : "var(--wicket)", fontFamily: "var(--font-mono)" }}>
                {f.ok ? "✓" : "✕"}
              </span>
              <span style={{ color: f.ok ? "var(--ink-2)" : "var(--ink)" }}>{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function venueFit(team: TeamFull, venue: Meta["venues"][0]): { score: number; why: string } {
  let score = 5;
  const why: string[] = [];
  const deathEcon = team.bowlPhase["3"]?.rr;
  const batRR = (["1", "2", "3"] as const).reduce((s, p) => s + (team.batPhase[p]?.rr ?? 0), 0) / 3;
  if (venue.avgFirstInnings != null) {
    if (venue.avgFirstInnings >= 185 && batRR >= 9.2) { score += 1.5; why.push("high-scoring ground suits their batting tempo"); }
    if (venue.avgFirstInnings >= 185 && (deathEcon ?? 99) <= 10) { score += 1; why.push("death bowling travels well to run-fests"); }
    if (venue.avgFirstInnings < 170 && (deathEcon ?? 0) >= 11) { score += 1; why.push("low-scoring ground hides a leaky death attack"); }
  }
  if (venue.spinEcon != null && venue.paceEcon != null) {
    const spinFriendly = venue.spinEcon < venue.paceEcon - 0.5;
    const spinOvers = team.squadCards.filter((c) => c.bowl && SPIN_TYPES.includes(c.bowl)).reduce((s, c) => s + c.ballsBowled, 0) / 6;
    if (spinFriendly && spinOvers >= 80) { score += 1.5; why.push("spin-friendly surface meets deep spin stocks"); }
    if (!spinFriendly && spinOvers < 60) { score += 0.5; why.push("pace-led attack fits a pace-friendly deck"); }
  }
  return { score: Math.min(10, +score.toFixed(1)), why: why.join("; ") || "neutral fit on available evidence" };
}

export function TeamLab({ meta, index }: { meta: Meta; index: MatchIndexEntry[] }) {
  const { teamId, setTeam, compareTeamId, setCompareTeam } = useStore();
  const [team, setTeamData] = useState<TeamFull | null>(null);
  const [rival, setRivalData] = useState<TeamFull | null>(null);

  useEffect(() => {
    if (teamId) loadTeam(teamId).then((t) => setTeamData(t as TeamFull));
  }, [teamId]);
  useEffect(() => {
    if (compareTeamId) loadTeam(compareTeamId).then((t) => setRivalData(t as TeamFull));
    else setRivalData(null);
  }, [compareTeamId]);

  const t = teamId ? team : null;
  const h2h = useMemo(() => {
    if (!t || !rival) return null;
    const ms = index.filter((m) => m.teams.includes(t.name) && m.teams.includes(rival.name));
    return {
      matches: ms,
      wins: ms.filter((m) => m.winner === t.name).length,
      rivalWins: ms.filter((m) => m.winner === rival.name).length,
    };
  }, [t, rival, index]);

  return (
    <section id="team-lab" className="lab-section">
      <div className="lab-header">
        <div className="lab-kicker">Analysis universe 03</div>
        <h2 className="lab-title">Team Lab</h2>
        <p className="lab-blurb">
          Squad DNA, phase dominance, a live combination builder, and venue-fit scoring — every number
          traceable to the loaded matches.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {meta.teams.map((tm) => (
          <button key={tm.id} className={`picker-card ${teamId === tm.id ? "selected" : ""}`}
            style={{ width: "auto", minWidth: 130, flex: "0 1 auto" }} onClick={() => setTeam(tm.id)}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20 }}>{tm.short}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{tm.name}</div>
          </button>
        ))}
      </div>

      {!t ? (
        <div className="panel" style={{ textAlign: "center", padding: 60, color: "var(--ink-3)" }}>
          ↑ Pick a team
        </div>
      ) : (
        <div>
          <div className="panel" style={{ marginBottom: 20, display: "flex", gap: 30, flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ fontSize: "clamp(24px,3vw,38px)" }}>{t.name}</h3>
            <div style={{ display: "flex", gap: 28, marginLeft: "auto" }}>
              <StatTile label="Matches" value={t.played} />
              <StatTile label="Wins" value={t.wins} accent />
              <StatTile label="Win %" value={t.played ? Math.round((100 * t.wins) / t.played) : null} />
              <StatTile label="Squad" value={t.squad.length} />
            </div>
          </div>

          <div className="grid grid-2">
            <Panel title="Squad DNA" tier="DERIVED" n={t.played} nUnit="matches"
              sub="Six squad dimensions normalized against the competition. Fielding is a soft proxy (catches + run-outs) — no chances data in open ball-by-ball.">
              <Radar axes={teamRadar(t, meta)} ghost={rival ? teamRadar(rival, meta) : null} name={t.name} ghostName={rival?.name} />
            </Panel>

            <Panel title="Phase Dominance" tier="DERIVED" sub="Run rate with bat and economy with ball, by phase, vs the competition average.">
              <PhaseDominance team={t} meta={meta} />
            </Panel>

            <Panel title="Best XI Combination Builder" tier="DERIVED" wide
              sub="The analyst toy — build an XI and watch coverage flags recompute. All rule-based from dataset aggregates; no projections invented.">
              <XIBuilder team={t} />
            </Panel>

            <Panel title="Conditions Fit" tier="DERIVED"
              sub="Venue profiles from the loaded matches, scored against this squad. Small samples — some venues have 2–3 games; read as leans, not verdicts.">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {meta.venues.slice(0, 6).map((v) => {
                  const fit = venueFit(t, v);
                  return (
                    <div key={v.name} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{v.name}</div>
                          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                            {v.matches} match{v.matches > 1 ? "es" : ""}{v.matches < 4 ? " ⚠ small sample" : ""} · 1st inn avg {v.avgFirstInnings ?? "–"} · chase wins {v.chaseWinPct ?? "–"}% · spin {v.spinEcon ?? "–"} / pace {v.paceEcon ?? "–"}
                          </div>
                        </div>
                        <div className="stat-big" style={{ fontSize: 22, color: fit.score >= 7 ? "var(--accent)" : fit.score < 5.5 ? "var(--ink-2)" : "var(--ink)" }}>
                          {fit.score}<span style={{ fontSize: 12, color: "var(--ink-3)" }}>/10</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 4 }}>{fit.why}</div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Head to Head" tier="RECORDED" sub="Pick a rival — also drawn as the purple ghost on the DNA radar.">
              <select className="select" value={compareTeamId ?? ""} onChange={(e) => setCompareTeam(e.target.value || null)} style={{ marginBottom: 14 }}>
                <option value="">— pick opponent —</option>
                {meta.teams.filter((x) => x.id !== teamId).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              {h2h && rival && (
                <div>
                  <div style={{ display: "flex", gap: 30, alignItems: "baseline", marginBottom: 12 }}>
                    <StatTile label={t.name.split(" ").map((w) => w[0]).join("")} value={h2h.wins} accent />
                    <span style={{ color: "var(--ink-3)" }}>vs</span>
                    <StatTile label={rival.name.split(" ").map((w) => w[0]).join("")} value={h2h.rivalWins} />
                  </div>
                  {h2h.matches.map((m) => (
                    <div key={m.id} style={{ fontSize: 12, color: "var(--ink-2)", padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className="mono" style={{ color: "var(--ink-3)" }}>{m.date}</span> · {m.result} <span style={{ color: "var(--ink-3)" }}>({m.venue})</span>
                    </div>
                  ))}
                  {!h2h.matches.length && <div style={{ color: "var(--ink-3)", fontSize: 12.5 }}>No meetings in the loaded {index.length} matches.</div>}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </section>
  );
}
