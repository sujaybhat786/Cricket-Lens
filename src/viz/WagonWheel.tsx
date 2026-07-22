import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Delivery } from "../data/types";
import { runColor, describeBall } from "./common";
import { useTip } from "../components/Tooltip";
import { useStore } from "../state/store";

const R = 190; // rope radius
const CX = 210;
const CY = 210;

function pt(angleDeg: number, dist: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + R * dist * Math.sin(a), CY - R * dist * Math.cos(a)];
}

const SECTORS_RHB = ["Straight", "Cover", "Point", "Third", "Fine", "Square leg", "Midwicket", "Long-on"];

/** Hero visual: wagon wheel. MODELED directions · REAL runs. */
export function WagonWheel({ balls, title, batHand = "R" }: { balls: Delivery[]; title?: string; batHand?: "R" | "L" }) {
  const { show, hide } = useTip();
  const openDrawer = useStore((s) => s.openDrawer);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"all" | "boundaries">("all");

  const shots = useMemo(
    () => balls.filter((d) => d.wh && d.rb > 0 && (mode === "all" || d.rb >= 4)),
    [balls, mode],
  );

  const sectorRuns = useMemo(() => {
    const runs = new Array(8).fill(0);
    for (const d of shots) {
      const sector = Math.floor((((d.wh![0] + 22.5) % 360) / 45)) % 8;
      runs[sector] += d.rb;
    }
    return runs;
  }, [shots]);
  const maxSector = Math.max(1, ...sectorRuns);

  return (
    <div>
      <div className="chip-row" style={{ marginBottom: 10 }} data-noexport="1">
        {(["all", "boundaries"] as const).map((m) => (
          <button key={m} className={`chip ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
            {m === "all" ? "All runs" : "Boundaries only"}
          </button>
        ))}
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {batHand === "R" ? "RHB — off side right" : "LHB — off side left"}
        </span>
      </div>
      <svg viewBox="0 0 420 420" style={{ width: "100%", maxWidth: 460, display: "block", margin: "0 auto" }}
        role="img" aria-label={`Wagon wheel${title ? ` for ${title}` : ""}`}>
        <defs>
          <radialGradient id="turf" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#12281c" />
            <stop offset="55%" stopColor="#0e2016" />
            <stop offset="92%" stopColor="#0a1810" />
            <stop offset="100%" stopColor="#081209" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* turf + rope */}
        <circle cx={CX} cy={CY} r={R + 8} fill="url(#turf)" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e8ecf2" strokeWidth={2.4} opacity={0.85} />
        <circle cx={CX} cy={CY} r={R * 0.55} fill="none" stroke="#9fb0c3" strokeWidth={0.8} strokeDasharray="5 6" opacity={0.35} />
        {/* mowing rings */}
        {[0.25, 0.4, 0.7, 0.85].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={R * r} fill="none" stroke="#1c3526" strokeWidth={7} opacity={0.35} />
        ))}
        {/* sector wedges — translucent, scaled by runs */}
        {sectorRuns.map((runs, i) => {
          if (!runs) return null;
          const a0 = i * 45 - 22.5;
          const a1 = i * 45 + 22.5;
          const rr = R * (0.28 + 0.68 * (runs / maxSector));
          const [x0, y0] = pt(a0, rr / R);
          const [x1, y1] = pt(a1, rr / R);
          const sectorBalls = shots.filter((d) => Math.floor((((d.wh![0] + 22.5) % 360) / 45)) % 8 === i);
          return (
            <motion.path
              key={i}
              d={`M ${CX} ${CY} L ${x0} ${y0} A ${rr} ${rr} 0 0 1 ${x1} ${y1} Z`}
              fill="#00ff88"
              opacity={0.05 + 0.1 * (runs / maxSector)}
              stroke="#00ff8830"
              initial={reduced ? undefined : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
              style={{ transformOrigin: `${CX}px ${CY}px`, cursor: "pointer" }}
              onMouseMove={(e) =>
                show(e.clientX, e.clientY, (
                  <div>
                    <div className="tt-head">{sectorLabel(i, batHand)}</div>
                    {runs} runs off {sectorBalls.length} scoring shots (modeled directions)
                  </div>
                ))
              }
              onMouseLeave={hide}
              onClick={() =>
                openDrawer({
                  title: `${sectorLabel(i, batHand)} sector${title ? ` — ${title}` : ""}`,
                  subtitle: "Directions are MODELED; runs & bowlers are real",
                  balls: sectorBalls,
                })
              }
            />
          );
        })}
        {/* pitch */}
        <rect x={CX - 7} y={CY - 30} width={14} height={60} rx={2} fill="#c2a76b" opacity={0.8} />
        {/* shot tracers */}
        {shots.map((d, i) => {
          const [x, y] = pt(d.wh![0], Math.min(1.0, d.wh![1]));
          const color = runColor(d);
          const boundary = d.rb >= 4;
          return (
            <motion.line
              key={i}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke={color}
              strokeWidth={boundary ? 1.8 : 1}
              opacity={boundary ? 0.9 : 0.45}
              filter={d.rb >= 6 ? "url(#glow)" : undefined}
              initial={reduced ? undefined : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: boundary ? 0.9 : 0.45 }}
              transition={{ duration: 0.5, delay: Math.min(1.6, i * 0.012), ease: "easeOut" }}
              style={{ cursor: "pointer" }}
              onMouseMove={(e) =>
                show(e.clientX, e.clientY, (
                  <div>
                    <div className="tt-head">over {d.ov}.{d.b} · {d.rb} run{d.rb > 1 ? "s" : ""}</div>
                    {describeBall(d)}
                    <div style={{ color: "var(--gold)", fontSize: 10.5, marginTop: 3 }}>direction modeled · runs real</div>
                  </div>
                ))
              }
              onMouseLeave={hide}
            />
          );
        })}
        {/* batter dot */}
        <circle cx={CX} cy={CY} r={4} fill="#eef2f7" stroke="#0a0e14" strokeWidth={1.5} />
      </svg>
      <div className="chip-row" style={{ justifyContent: "center", marginTop: 8, gap: 14 }}>
        {[["#00ff88", "Six"], ["#4d8be8", "Four"], ["#9fb0c3", "1s–3s"]].map(([c, l]) => (
          <span key={l} className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>
            <span style={{ display: "inline-block", width: 14, height: 2.5, background: c, verticalAlign: "middle", marginRight: 6 }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function sectorLabel(i: number, hand: "R" | "L"): string {
  if (hand === "R") return SECTORS_RHB[i];
  // mirror for LHB
  const mirrored = [0, 7, 6, 5, 4, 3, 2, 1][i];
  return SECTORS_RHB[mirrored];
}
