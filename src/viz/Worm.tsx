import { useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";
import { motion, useReducedMotion } from "framer-motion";
import type { Innings } from "../data/types";
import { SERIES, describeBall } from "./common";
import { useTip } from "../components/Tooltip";
import { useStore } from "../state/store";

const W = 920;
const H = 340;
const M = { t: 18, r: 56, b: 30, l: 44 };

interface Pt {
  x: number; // over progress
  runs: number;
  wp: number;
  innIdx: number;
  d: import("../data/types").Delivery;
}

/** Dual worm + win-probability ribbon. Hover any ball for full detail. */
export function Worm({ innings, teams, target }: { innings: Innings[]; teams: string[]; target: number | null }) {
  const { show, hide } = useTip();
  const openDrawer = useStore((s) => s.openDrawer);
  const reduced = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Pt | null>(null);

  const series: Pt[][] = useMemo(
    () =>
      innings.map((inn, i) => {
        let legal = 0;
        return inn.deliveries.map((d) => {
          if (d.ek !== "wides" && d.ek !== "noballs") legal += 1;
          return { x: legal / 6, runs: d.cr, wp: d.wp, innIdx: i, d };
        });
      }),
    [innings],
  );

  const maxOv = Math.max(20, ...series.flat().map((p) => p.x));
  const maxRuns = Math.max(target ?? 0, ...series.flat().map((p) => p.runs)) * 1.06;
  const xs = scaleLinear([0, maxOv], [M.l, W - M.r]);
  const ys = scaleLinear([0, maxRuns], [H - M.b, M.t]);
  const yw = scaleLinear([0, 1], [H - M.b, M.t]); // win prob ribbon scale

  const mkLine = d3line<Pt>().x((p) => xs(p.x)).y((p) => ys(p.runs)).curve(curveMonotoneX);
  const wpArea = d3area<Pt>()
    .x((p) => xs(p.x))
    .y0(H - M.b)
    .y1((p) => yw(p.wp))
    .curve(curveMonotoneX);

  // win-prob path across both innings sequentially (2nd innings drawn after 1st ends)
  const wpPts: Pt[] = useMemo(() => {
    const first = series[0] ?? [];
    const second = (series[1] ?? []).map((p) => ({ ...p, x: p.x }));
    return [...first, ...second.map((p) => ({ ...p, x: p.x }))];
  }, [series]);
  void wpPts;

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best: Pt | null = null;
    let bd = Infinity;
    for (const s of series)
      for (const p of s) {
        const dist = Math.abs(xs(p.x) - px);
        if (dist < bd) {
          bd = dist;
          best = p;
        }
      }
    setHover(best);
    if (best) {
      const d = best.d;
      show(
        e.clientX,
        e.clientY,
        <div>
          <div className="tt-head">
            {teams[best.innIdx]} · over {d.ov}.{d.b}
          </div>
          {describeBall(d)}
          <div style={{ color: "var(--ink-3)", marginTop: 3 }}>
            {d.cr}/{d.cw} · win prob ({teams[0]}): {(d.wp * 100).toFixed(0)}%
          </div>
        </div>,
      );
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", cursor: "crosshair" }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setHover(null);
        hide();
      }}
      onClick={() => {
        if (hover) {
          const inn = innings[hover.innIdx];
          openDrawer({
            title: `${teams[hover.innIdx]} — over ${hover.d.ov + 1}`,
            balls: inn.deliveries.filter((b) => b.ov === hover.d.ov),
          });
        }
      }}
      role="img"
      aria-label="Cumulative runs worm with win probability ribbon"
    >
      {/* win-prob ribbon */}
      {series.map((s, i) => (
        <path key={`wp${i}`} d={wpArea(s) ?? ""} fill={SERIES[i]} opacity={0.09} />
      ))}
      {/* grid */}
      {ys.ticks(5).map((t) => (
        <g key={t}>
          <line className="grid-line" x1={M.l} x2={W - M.r} y1={ys(t)} y2={ys(t)} />
          <text x={M.l - 8} y={ys(t) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)" fontFamily="var(--font-mono)">
            {t}
          </text>
        </g>
      ))}
      {[0, 5, 10, 15, 20].map((t) => (
        <text key={t} x={xs(t)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--ink-3)" fontFamily="var(--font-mono)">
          {t}
        </text>
      ))}
      {target != null && (
        <g>
          <line x1={M.l} x2={W - M.r} y1={ys(target)} y2={ys(target)} stroke="var(--gold)" strokeDasharray="6 5" opacity={0.6} />
          <text x={W - M.r + 6} y={ys(target) + 3} fontSize={10} fill="var(--gold)" fontFamily="var(--font-mono)">
            target {target}
          </text>
        </g>
      )}
      {/* worms */}
      {series.map((s, i) => (
        <motion.path
          key={i}
          d={mkLine(s) ?? ""}
          fill="none"
          stroke={SERIES[i]}
          strokeWidth={2.4}
          strokeLinecap="round"
          initial={reduced ? undefined : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, delay: i * 0.5, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${SERIES[i]}66)` }}
        />
      ))}
      {/* wicket nodes — glowing */}
      {series.flat().filter((p) => p.d.wk).map((p, i) => (
        <g key={i}>
          <circle cx={xs(p.x)} cy={ys(p.runs)} r={7} fill="#ff5470" opacity={0.22}>
            {!reduced && <animate attributeName="r" values="5;9;5" dur="2.2s" repeatCount="indefinite" />}
          </circle>
          <circle cx={xs(p.x)} cy={ys(p.runs)} r={3.4} fill="#ff5470" stroke="#0a0e14" strokeWidth={1.4} />
        </g>
      ))}
      {/* series direct labels */}
      {series.map((s, i) => {
        const last = s[s.length - 1];
        return last ? (
          <text key={i} x={xs(last.x) + 6} y={ys(last.runs) + 4} fontSize={11} fill={SERIES[i]} fontFamily="var(--font-mono)">
            {teams[i]?.split(" ").map((w) => w[0]).join("")} {last.runs}
          </text>
        ) : null;
      })}
      {/* crosshair */}
      {hover && (
        <g pointerEvents="none">
          <line x1={xs(hover.x)} x2={xs(hover.x)} y1={M.t} y2={H - M.b} stroke="var(--ink-3)" strokeDasharray="3 3" />
          <circle cx={xs(hover.x)} cy={ys(hover.runs)} r={5} fill="none" stroke="#fff" strokeWidth={1.5} />
        </g>
      )}
      <text x={M.l} y={12} fontSize={9.5} fill="var(--ink-3)" fontFamily="var(--font-mono)" letterSpacing={1}>
        RUNS ─ · WIN-PROB RIBBON ▨ (shaded, {teams[0]} perspective) · click a ball → that over's deliveries
      </text>
    </svg>
  );
}
