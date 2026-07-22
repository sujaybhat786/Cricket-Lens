import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Delivery } from "../data/types";
import { heat } from "./common";
import { useTip } from "../components/Tooltip";
import { useStore } from "../state/store";

// top-down strip: batter's stumps at bottom, bowler runs in from top
const W = 300;
const H = 420;
const PX = 60; // strip left
const PW = 180; // strip width
const PT = 30; // strip top
const PH = 350; // strip height (maps 0..12 m from batting stumps, inverted)

const lineX = (line: number) => PX + PW / 2 + (line / 1.4) * (PW / 2) * 0.92;
const lenY = (len: number) => PT + PH - (len / 12) * PH;

const LEN_BANDS = [
  { from: 0, to: 2, label: "yorker" },
  { from: 2, to: 5, label: "full" },
  { from: 5, to: 8, label: "good" },
  { from: 8, to: 10, label: "short of gd" },
  { from: 10, to: 12, label: "short" },
];

/** Hero visual: bowler pitch map. MODELED coordinates · REAL outcomes. */
export function PitchMap({ balls, title, batHand = "R" }: { balls: Delivery[]; title?: string; batHand?: "R" | "L" }) {
  const { show, hide } = useTip();
  const openDrawer = useStore((s) => s.openDrawer);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"balls" | "runs" | "threat">("balls");

  // 5 (line) x 6 (length) heat grid
  const grid = useMemo(() => {
    const nl = 5, nn = 6;
    const cells = Array.from({ length: nl * nn }, () => ({ runs: 0, balls: 0, wkts: 0, list: [] as Delivery[] }));
    for (const d of balls) {
      const li = Math.max(0, Math.min(nl - 1, Math.floor(((d.pm[0] + 1.4) / 2.8) * nl)));
      const ni = Math.max(0, Math.min(nn - 1, Math.floor((d.pm[1] / 12) * nn)));
      const c = cells[ni * nl + li];
      c.runs += d.rt;
      c.balls += 1;
      if (d.wk && !["run out", "retired hurt", "retired out"].includes(d.wk.kind)) c.wkts += 1;
      c.list.push(d);
    }
    return { cells, nl, nn };
  }, [balls]);

  const maxVal = Math.max(
    0.001,
    ...grid.cells.map((c) => (mode === "runs" ? c.runs : mode === "threat" ? c.wkts : c.balls)),
  );

  return (
    <div>
      <div className="chip-row" style={{ marginBottom: 10 }} data-noexport="1">
        {(["balls", "runs", "threat"] as const).map((m) => (
          <button key={m} className={`chip ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
            {m === "balls" ? "Density" : m === "runs" ? "Runs heat" : "Threat heat"}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto" }}
        role="img" aria-label={`Pitch map${title ? ` for ${title}` : ""}`}>
        <defs>
          <linearGradient id="pitchgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8a744a" />
            <stop offset="50%" stopColor="#a08654" />
            <stop offset="100%" stopColor="#b39a63" />
          </linearGradient>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        {/* surround turf */}
        <rect x={0} y={0} width={W} height={H} rx={12} fill="#0e2016" />
        {/* pitch strip */}
        <rect x={PX} y={PT - 14} width={PW} height={PH + 34} rx={4} fill="url(#pitchgrad)" opacity={0.32} />
        {/* creases (batting end, bottom) */}
        <line x1={PX} x2={PX + PW} y1={lenY(0)} y2={lenY(0)} stroke="#e8ecf2" strokeWidth={1.6} opacity={0.75} />
        <line x1={PX} x2={PX + PW} y1={lenY(1.22)} y2={lenY(1.22)} stroke="#e8ecf2" strokeWidth={1} opacity={0.5} />
        {/* stumps */}
        {[-0.045, 0, 0.045].map((o) => (
          <rect key={o} x={PX + PW / 2 + o * PW - 1.2} y={lenY(0) + 3} width={2.4} height={12} fill="#e8ecf2" opacity={0.9} />
        ))}
        {/* length band labels */}
        {LEN_BANDS.map((b) => (
          <g key={b.label}>
            <line x1={PX - 4} x2={PX + PW + 4} y1={lenY(b.to)} y2={lenY(b.to)} stroke="#9fb0c3" strokeWidth={0.5} opacity={0.2} strokeDasharray="3 5" />
            <text x={PX - 8} y={(lenY(b.from) + lenY(b.to)) / 2 + 3} textAnchor="end" fontSize={8.5}
              fill="var(--ink-3)" fontFamily="var(--font-mono)">
              {b.label}
            </text>
          </g>
        ))}
        {/* off/leg labels */}
        <text x={PX + PW - 6} y={H - 8} textAnchor="end" fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
          {batHand === "R" ? "OFF →" : "LEG →"}
        </text>
        <text x={PX + 6} y={H - 8} fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
          {batHand === "R" ? "← LEG" : "← OFF"}
        </text>
        {/* heat cells (soft blur) */}
        {mode !== "balls" &&
          grid.cells.map((c, i) => {
            const v = mode === "runs" ? c.runs : c.wkts;
            if (!c.balls || !v) return null;
            const li = i % grid.nl;
            const ni = Math.floor(i / grid.nl);
            const x = PX + (li / grid.nl) * PW;
            const y = PT + PH - ((ni + 1) / grid.nn) * PH;
            return (
              <rect key={i} x={x} y={y} width={PW / grid.nl} height={PH / grid.nn}
                fill={heat(v / maxVal)} opacity={0.55} filter="url(#soft)" />
            );
          })}
        {/* individual balls */}
        {balls.map((d, i) => {
          const x = lineX(batHand === "R" ? d.pm[0] : -d.pm[0]);
          const y = lenY(d.pm[1]);
          const isWkt = !!d.wk && !["run out", "retired hurt"].includes(d.wk.kind);
          const color = isWkt ? "#ff5470" : d.rb >= 4 ? "#4d8be8" : d.rt === 0 ? "#e8ecf2" : "#9fb0c3";
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={isWkt ? 5 : 3.4}
              fill={color}
              opacity={isWkt ? 0.95 : mode === "balls" ? 0.65 : 0.35}
              stroke={isWkt ? "#0a0e14" : "none"}
              strokeWidth={1}
              initial={reduced ? undefined : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: Math.min(1.2, i * 0.01), duration: 0.3 }}
              style={{ cursor: "pointer" }}
              onMouseMove={(e) =>
                show(e.clientX, e.clientY, (
                  <div>
                    <div className="tt-head">over {d.ov}.{d.b}</div>
                    {d.bwl} to {d.bat} — {d.wk ? `WICKET (${d.wk.kind})` : d.rt === 0 ? "dot" : `${d.rt} run${d.rt > 1 ? "s" : ""}`}
                    <div style={{ color: "var(--gold)", fontSize: 10.5, marginTop: 3 }}>pitch location modeled · outcome real</div>
                  </div>
                ))
              }
              onMouseLeave={hide}
              onClick={() =>
                openDrawer({
                  title: `Ball ${d.ov}.${d.b}${title ? ` — ${title}` : ""}`,
                  subtitle: "Pitch location is MODELED from bowler type & outcome",
                  balls: [d],
                })
              }
            />
          );
        })}
      </svg>
      <div className="chip-row" style={{ justifyContent: "center", marginTop: 8, gap: 14 }}>
        {[["#ff5470", "Wicket"], ["#4d8be8", "Boundary"], ["#e8ecf2", "Dot"], ["#9fb0c3", "Runs"]].map(([c, l]) => (
          <span key={l} className="mono" style={{ fontSize: 10, color: "var(--ink-2)" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: c, verticalAlign: "middle", marginRight: 6 }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
