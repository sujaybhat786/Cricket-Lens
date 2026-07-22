import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import type { Delivery } from "../data/types";
import { byOver } from "../data/analytics";
import { SERIES } from "./common";
import { useTip } from "../components/Tooltip";
import { useStore } from "../state/store";

const W = 920, H = 280, M = { t: 24, r: 16, b: 26, l: 36 };

/** Runs-per-over bars, wicket markers, phase bands. Click an over → its balls. */
export function Manhattan({ inningsBalls, teams }: { inningsBalls: Delivery[][]; teams: string[] }) {
  const { show, hide } = useTip();
  const openDrawer = useStore((s) => s.openDrawer);
  const reduced = useReducedMotion();

  const overs = useMemo(() => inningsBalls.map((b) => byOver(b)), [inningsBalls]);
  const maxRuns = Math.max(8, ...overs.flat().map((o) => o.runs));
  const ys = scaleLinear([0, maxRuns * 1.15], [H - M.b, M.t]);
  const n = 20;
  const groupW = (W - M.l - M.r) / n;
  const barW = Math.min(16, (groupW - 8) / Math.max(1, overs.length));

  const phaseBands = [
    { from: 0, to: 6, label: "POWERPLAY" },
    { from: 6, to: 16, label: "MIDDLE" },
    { from: 16, to: 20, label: "DEATH" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Manhattan runs per over">
      {phaseBands.map((p, i) => (
        <g key={p.label}>
          <rect x={M.l + p.from * groupW} y={M.t - 6} width={(p.to - p.from) * groupW} height={H - M.t - M.b + 6}
            fill={i === 1 ? "transparent" : "rgba(148,170,200,0.045)"} />
          <text x={M.l + ((p.from + p.to) / 2) * groupW} y={14} textAnchor="middle" fontSize={9}
            fill="var(--ink-3)" fontFamily="var(--font-mono)" letterSpacing={2}>
            {p.label}
          </text>
        </g>
      ))}
      {ys.ticks(4).map((t) => (
        <g key={t}>
          <line className="grid-line" x1={M.l} x2={W - M.r} y1={ys(t)} y2={ys(t)} />
          <text x={M.l - 6} y={ys(t) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)" fontFamily="var(--font-mono)">{t}</text>
        </g>
      ))}
      {overs.map((innOvers, inn) =>
        innOvers.map((o) => {
          const x = M.l + o.over * groupW + 4 + inn * (barW + 2);
          const y = ys(o.runs);
          return (
            <g key={`${inn}-${o.over}`}>
              <motion.rect
                x={x} width={barW} rx={3}
                initial={reduced ? { y, height: H - M.b - y } : { y: H - M.b, height: 0 }}
                animate={{ y, height: Math.max(2, H - M.b - y) }}
                transition={{ duration: 0.5, delay: o.over * 0.03, ease: "easeOut" }}
                fill={SERIES[inn]}
                opacity={0.85}
                style={{ cursor: "pointer" }}
                onMouseMove={(e) =>
                  show(e.clientX, e.clientY, (
                    <div>
                      <div className="tt-head">{teams[inn]} · over {o.over + 1}</div>
                      {o.runs} runs{o.wickets ? ` · ${o.wickets} wkt${o.wickets > 1 ? "s" : ""}` : ""} · {o.balls[0]?.bwl}
                    </div>
                  ))
                }
                onMouseLeave={hide}
                onClick={() => openDrawer({ title: `${teams[inn]} — over ${o.over + 1}`, balls: o.balls })}
              />
              {o.wickets > 0 &&
                Array.from({ length: o.wickets }).map((_, wi) => (
                  <circle key={wi} cx={x + barW / 2} cy={y - 8 - wi * 10} r={3.4} fill="#ff5470"
                    stroke="#0a0e14" strokeWidth={1} />
                ))}
            </g>
          );
        }),
      )}
      {[1, 5, 10, 15, 20].map((o) => (
        <text key={o} x={M.l + (o - 0.5) * groupW} y={H - 8} textAnchor="middle" fontSize={10}
          fill="var(--ink-3)" fontFamily="var(--font-mono)">{o}</text>
      ))}
      {/* legend */}
      {teams.map((t, i) => (
        <g key={t} transform={`translate(${W - M.r - 150 + i * 0}, ${M.t + i * 16})`}>
          <rect width={10} height={10} rx={2} fill={SERIES[i]} x={0} y={-8} />
          <text x={16} y={1} fontSize={10} fill="var(--ink-2)" fontFamily="var(--font-mono)">{t.split(" ").map((w) => w[0]).join("")}</text>
        </g>
      ))}
    </svg>
  );
}
