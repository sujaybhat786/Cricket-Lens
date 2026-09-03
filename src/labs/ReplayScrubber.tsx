import { useMemo } from "react";
import type { Delivery, Match } from "../data/types";
import { oversStr } from "../data/analytics";
import { StatTile } from "../components/Shell";
import { Badge } from "../components/Badge";

const initials = (t: string) => t.split(" ").map((w) => w[0]).join("");

export interface FlatBall { d: Delivery; innIdx: number; legal: number; within: number }

/** Chronological ball list across both innings, with a per-innings legal-ball count. */
export function flattenBalls(match: Match): FlatBall[] {
  const out: FlatBall[] = [];
  // Main innings only — a Super Over is a separate shootout and its balls would
  // otherwise become the "end" of the replay with a nonsensical run rate.
  match.innings.slice(0, 2).forEach((inn, innIdx) => {
    let legal = 0;
    inn.deliveries.forEach((d, within) => {
      if (d.ek !== "wides" && d.ek !== "noballs") legal += 1;
      out.push({ d, innIdx, legal, within });
    });
  });
  return out;
}

/** Runs/wickets over the last N legal balls up to and including `within`. */
function recentForm(ds: Delivery[], within: number, n = 30) {
  const upto = ds.slice(0, within + 1);
  const legalIdx: number[] = [];
  upto.forEach((d, i) => {
    if (d.ek !== "wides" && d.ek !== "noballs") legalIdx.push(i);
  });
  const start = legalIdx.length > n ? legalIdx[legalIdx.length - n] : 0;
  const seg = upto.slice(start);
  const balls = seg.filter((d) => d.ek !== "wides" && d.ek !== "noballs").length || 1;
  const runs = seg.reduce((s, d) => s + d.rt, 0);
  return { runs, balls, wkts: seg.filter((d) => d.wk).length, rr: (6 * runs) / balls };
}

/**
 * Replay Scrubber — drags a cursor through the match ball by ball and
 * reflects the score state at that exact point. This is a replay of recorded
 * historical data, not a live feed.
 */
export function ReplayScrubber({ match, balls, idx, setIdx }: {
  match: Match; balls: FlatBall[]; idx: number; setIdx: (i: number) => void;
}) {
  const cur = balls[Math.min(idx, balls.length - 1)];
  const inn = match.innings[cur.innIdx];
  const form = useMemo(() => recentForm(inn.deliveries, cur.within, 30), [inn, cur.within]);

  const rr = cur.legal ? (6 * cur.d.cr) / cur.legal : 0;
  const chasing = cur.innIdx === 1 && match.info.target != null;
  const need = chasing ? match.info.target! - cur.d.cr : null;
  const ballsLeft = chasing ? match.info.targetBalls - cur.legal : 120 - cur.legal;
  const pct = (idx / Math.max(1, balls.length - 1)) * 100;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Badge tier="DERIVED" label="REPLAY · NOT A LIVE FEED" />
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          drag to move through the match — the marker on the worm follows
        </span>
        <span style={{ flex: 1 }} />
        <button className="chip" onClick={() => setIdx(0)}>⏮</button>
        <button className="chip" onClick={() => setIdx(Math.max(0, idx - 1))}>◀ ball</button>
        <button className="chip" onClick={() => setIdx(Math.min(balls.length - 1, idx + 1))}>ball ▶</button>
        <button className="chip" onClick={() => setIdx(balls.length - 1)}>⏭</button>
      </div>

      <input
        className="scrub"
        type="range"
        min={0}
        max={balls.length - 1}
        value={Math.min(idx, balls.length - 1)}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => setIdx(+e.target.value)}
        aria-label="Replay position"
      />

      <div className="replay-strip">
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>
            {initials(inn.team)} · after {cur.d.ov}.{cur.d.b}
          </div>
          <div className="stat-big" style={{ fontSize: 36 }}>
            {cur.d.cr}<span style={{ fontSize: "0.5em", color: "var(--ink-2)" }}>/{cur.d.cw}</span>
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{oversStr(cur.legal)} ov</div>
        </div>
        <StatTile label="Run rate" value={rr.toFixed(2)} />
        <StatTile label="Last 5 ov" value={`${form.runs}/${form.wkts}`} sub={`RR ${form.rr.toFixed(1)} · ${form.balls} balls`} />
        {need != null && need > 0 && (
          <StatTile
            label="Need"
            value={`${need} off ${Math.max(0, ballsLeft)}`}
            accent
            sub={ballsLeft > 0 ? `req ${((6 * need) / ballsLeft).toFixed(2)} rpo` : "out of balls"}
          />
        )}
        {need != null && need <= 0 && <StatTile label="Result" value="Target reached" accent />}
        <div style={{ minWidth: 190, flex: 1 }}>
          <div className="stat-label" style={{ marginBottom: 4 }}>This ball</div>
          <div style={{ fontSize: 13.5, color: cur.d.wk ? "var(--wicket)" : "var(--ink)" }}>
            {cur.d.bwl} → {cur.d.bat}
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            win prob ({initials(match.info.teams[0])}) {Math.round(cur.d.wp * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
