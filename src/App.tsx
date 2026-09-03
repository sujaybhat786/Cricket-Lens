import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Meta, MatchIndexEntry, PlayerIndexEntry } from "./data/types";
import { loadMeta, loadMatchIndex, loadPlayerIndex } from "./data/api";
import { buildLookup } from "./data/analytics";
import { useStore } from "./state/store";
import { RailNav, ContextHeader, CountUp } from "./components/Shell";
import { TooltipHost } from "./components/Tooltip";
import { DeliveryDrawer } from "./components/DeliveryDrawer";
import { Badge } from "./components/Badge";
import { MatchLab } from "./labs/MatchLab";
import { PlayerLab } from "./labs/PlayerLab";
import { TeamLab } from "./labs/TeamLab";

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [matches, setMatches] = useState<MatchIndexEntry[]>([]);
  const [players, setPlayers] = useState<PlayerIndexEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const { matchId, playerId, teamId } = useStore();

  useEffect(() => {
    Promise.all([loadMeta(), loadMatchIndex(), loadPlayerIndex()])
      .then(([m, mi, pi]) => {
        setMeta(m);
        setMatches(mi);
        setPlayers(pi);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  const lookup = useMemo(() => buildLookup(players), [players]);
  const matchLabel = useMemo(() => {
    const m = matches.find((x) => x.id === matchId);
    return m ? `${m.short[0]} v ${m.short[1]} · ${m.date}` : null;
  }, [matches, matchId]);
  const playerLabel = useMemo(() => players.find((p) => p.id === playerId)?.name ?? null, [players, playerId]);
  const teamLabel = useMemo(() => meta?.teams.find((t) => t.id === teamId)?.name ?? null, [meta, teamId]);

  if (err)
    return (
      <div style={{ padding: 60, fontFamily: "var(--font-mono)" }}>
        <h2 style={{ color: "var(--wicket)" }}>Data not found</h2>
        <p style={{ marginTop: 12, color: "var(--ink-2)" }}>
          {err}
          <br />
          Run <code style={{ color: "var(--accent)" }}>npm run data</code> first to fetch and process Cricsheet matches.
        </p>
      </div>
    );

  if (!meta)
    return (
      <div className="boot">
        <div className="boot-mark">CRIC<em>LENS</em></div>
        <div className="boot-bar"><i /></div>
        <div className="boot-note">loading ball-by-ball data</div>
      </div>
    );

  return (
    <>
      <ContextHeader matchLabel={matchLabel} playerLabel={playerLabel} teamLabel={teamLabel} />
      <RailNav />
      <TooltipHost />
      <DeliveryDrawer />

      {/* HERO */}
      <section id="hero" style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "80px calc(var(--rail-w) + 40px) 60px 44px", maxWidth: 1560, margin: "0 auto",
      }}>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <div className="lab-kicker">Every fan, their own analyst</div>
          <h1 style={{ fontSize: "clamp(56px, 9vw, 132px)", lineHeight: 0.92, textTransform: "uppercase", letterSpacing: "-0.03em" }}>
            Cric<span style={{ color: "var(--accent)", textShadow: "0 0 40px var(--accent-glow)" }}>Lens</span>
          </h1>
          <p style={{ maxWidth: 640, color: "var(--ink-2)", fontSize: 16.5, margin: "22px 0 34px" }}>
            Interrogate real ball-by-ball data — filter it, slice it by phase, drill from a season to a
            single delivery. Broadcast-grade visuals, honest provenance: what's{" "}
            <Badge tier="RECORDED" />, what's <Badge tier="DERIVED" /> and what's <Badge tier="MODELED" /> is always labelled.
          </p>
          <div style={{ display: "flex", gap: 46, flexWrap: "wrap", marginBottom: 40 }}>
            {[
              [meta.matchCount, "matches"],
              [players.length, "players"],
              [meta.teams.length, "teams"],
              [matches.reduce((s, m) => s + m.scores.reduce((x, sc) => x + sc.balls, 0), 0), "deliveries"],
            ].map(([v, l]) => (
              <div key={l as string}>
                <CountUp value={v as number} className="stat-hero" />
                <div className="stat-label" style={{ marginTop: 6 }}>{l}</div>
              </div>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {meta.events.join(" · ")} · {meta.dateRange[0]} → {meta.dateRange[1]} · data: Cricsheet (open)
          </div>
          <div className="chip-row" style={{ marginTop: 34 }}>
            {[
              ["match-lab", "01 · Match Lab"],
              ["player-lab", "02 · Player Lab"],
              ["team-lab", "03 · Team Lab"],
            ].map(([id, l]) => (
              <button key={id} className="chip" style={{ padding: "10px 22px", fontSize: 12 }}
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}>
                {l} ↓
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      <MatchLab index={matches} lookup={lookup} />
      <PlayerLab players={players} meta={meta} lookup={lookup} />
      <TeamLab meta={meta} index={matches} />

      <footer className="site-footer">
        <strong>Data:</strong> <a href="https://cricsheet.org" target="_blank" rel="noreferrer">Cricsheet</a> (open data).{" "}
        {meta.provenance.license}
        <br />
        Wagon wheels &amp; pitch maps are statistical reconstructions, not ball-tracking — directions and pitch
        coordinates are modeled from priors (handedness × bowler type × outcome × phase), seeded per delivery;
        run values, outcomes and dismissals are real. Win probability: {meta.provenance.winProbMethod}{" "}
        Player handedness/bowler types are hand-curated (uncertain entries marked "?") — corrections welcome in{" "}
        <code>scripts/players_meta.json</code>.
        <br />
        CricLens is an independent fan project, not affiliated with any league or board.
      </footer>
    </>
  );
}
