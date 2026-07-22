import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { arc as d3arc, pie as d3pie, area as d3area, curveMonotoneX, line as d3line } from "d3-shape";
import type { Delivery } from "../data/types";
import type { AccelBucket } from "../data/types";
import { partnerships, bowlingSpells, momentum } from "../data/analytics";
import { SERIES, heat } from "./common";
import { useTip } from "../components/Tooltip";
import { useStore } from "../state/store";

/* ---------------------------------------------------------------- Partnerships */
export function PartnershipFlow({ balls, team }: { balls: Delivery[]; team: string }) {
  const { show, hide } = useTip();
  const openDrawer = useStore((s) => s.openDrawer);
  const stands = useMemo(() => partnerships(balls), [balls]);
  const max = Math.max(1, ...stands.map((s) => s.runs));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {stands.map((s, i) => {
        const rr = s.balls ? ((6 * s.runs) / s.balls).toFixed(1) : "0";
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "170px 1fr 70px", gap: 10, alignItems: "center", cursor: "pointer" }}
            onMouseMove={(e) => show(e.clientX, e.clientY, (
              <div>
                <div className="tt-head">{s.wicketNo}{ord(s.wicketNo)} wicket stand{s.unbroken ? " (unbroken)" : ""}</div>
                {s.pair.join(" & ")} — {s.runs} off {s.balls} (RR {rr})
                <div style={{ color: "var(--ink-3)", fontSize: 11, marginTop: 2 }}>
                  {Object.entries(s.contrib).map(([p, r]) => `${p} ${r}`).join(" · ")}
                </div>
              </div>
            ))}
            onMouseLeave={hide}
            onClick={() => openDrawer({ title: `${s.pair.join(" & ")} stand`, subtitle: `${team}`, balls: ballsOfStand(balls, s.pair, s.wicketNo) })}
          >
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.pair[0].split(" ").pop()} · {s.pair[1].split(" ").pop()}
            </span>
            <div style={{ background: "rgba(148,170,200,0.07)", borderRadius: 5, height: 18, position: "relative" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(s.runs / max) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: "easeOut" }}
                style={{
                  height: "100%", borderRadius: 5,
                  background: s.unbroken ? "var(--accent-dim)" : SERIES[i % 6],
                  opacity: 0.8, minWidth: 2,
                }}
              />
            </div>
            <span className="mono" style={{ fontSize: 11, textAlign: "right" }}>
              {s.runs} <span style={{ color: "var(--ink-3)" }}>({s.balls})</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ballsOfStand(balls: Delivery[], pair: [string, string], wicketNo: number): Delivery[] {
  const stands = partnerships(balls);
  const idx = stands.findIndex((s) => s.wicketNo === wicketNo && s.pair[0] === pair[0] && s.pair[1] === pair[1]);
  // reconstruct by walking deliveries again
  let count = 0;
  const out: Delivery[] = [];
  let cur: string | null = null;
  for (const d of balls) {
    const key = [d.bat, d.ns].sort().join("|");
    if (key !== cur) {
      cur = key;
      count++;
    }
    if (count - 1 === idx) out.push(d);
    if (d.wk && d.wk.kind !== "retired hurt") cur = null;
  }
  return out;
}

const ord = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

/* ---------------------------------------------------------------- Momentum */
export function MomentumChart({ balls, target, targetBalls, label }: {
  balls: Delivery[]; target: number | null; targetBalls: number; label: string;
}) {
  const { show, hide } = useTip();
  const pts = useMemo(() => momentum(balls, target, targetBalls), [balls, target, targetBalls]);
  const W = 880, H = 200, M = { t: 14, r: 14, b: 22, l: 36 };
  const xs = scaleLinear([0, Math.max(1, pts.length - 1)], [M.l, W - M.r]);
  const ext = Math.max(4, ...pts.map((p) => Math.abs(p.diff)));
  const ys = scaleLinear([-ext, ext], [H - M.b, M.t]);
  const areaPos = d3area<(typeof pts)[0]>().x((_, i) => xs(i)).y0(ys(0)).y1((p) => ys(Math.max(0, p.diff))).curve(curveMonotoneX);
  const areaNeg = d3area<(typeof pts)[0]>().x((_, i) => xs(i)).y0(ys(0)).y1((p) => ys(Math.min(0, p.diff))).curve(curveMonotoneX);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={`Momentum chart ${label}`}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const i = Math.round(xs.invert(((e.clientX - rect.left) / rect.width) * W));
        const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
        if (p) show(e.clientX, e.clientY, (
          <div>
            <div className="tt-head">over {p.d.ov}.{p.d.b}</div>
            rolling 12-ball RR {p.diff >= 0 ? "+" : ""}{p.diff.toFixed(1)} vs {target ? "required" : "innings avg"}
            <div style={{ color: "var(--ink-3)" }}>{p.d.cr}/{p.d.cw}</div>
          </div>
        ));
      }}
      onMouseLeave={hide}
    >
      <line x1={M.l} x2={W - M.r} y1={ys(0)} y2={ys(0)} stroke="var(--line-strong)" />
      <path d={areaPos(pts) ?? ""} fill="#00ad5e" opacity={0.5} />
      <path d={areaNeg(pts) ?? ""} fill="#e0476b" opacity={0.5} />
      {pts.filter((p) => p.d.wk).map((p, i) => (
        <circle key={i} cx={xs(pts.indexOf(p))} cy={ys(p.diff)} r={3.5} fill="#ff5470" stroke="#0a0e14" strokeWidth={1} />
      ))}
      {[0, 5, 10, 15, 20].map((o) => {
        const idx = pts.findIndex((p) => p.d.ov >= o);
        if (idx < 0) return null;
        return <text key={o} x={xs(idx)} y={H - 6} fontSize={9.5} fill="var(--ink-3)" fontFamily="var(--font-mono)" textAnchor="middle">{o}</text>;
      })}
      <text x={M.l} y={M.t - 2} fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
        ▲ scoring ahead · ▼ pressure building · dots = wickets
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------- Spells Gantt */
export function SpellsTimeline({ balls }: { balls: Delivery[] }) {
  const { show, hide } = useTip();
  const openDrawer = useStore((s) => s.openDrawer);
  const spells = useMemo(() => bowlingSpells(balls), [balls]);
  const bowlers = [...new Set(spells.map((s) => s.bowler))];
  const W = 880, rowH = 30, M = { t: 8, r: 14, b: 24, l: 150 };
  const H = M.t + bowlers.length * rowH + M.b;
  const xs = scaleLinear([0, 20], [M.l, W - M.r]);
  const maxEcon = Math.max(8, ...spells.map((s) => s.econ));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Bowling spells timeline">
      {bowlers.map((b, i) => (
        <text key={b} x={M.l - 10} y={M.t + i * rowH + rowH / 2 + 3} textAnchor="end" fontSize={11}
          fill="var(--ink-2)" fontFamily="var(--font-mono)">{b}</text>
      ))}
      {[0, 5, 10, 15, 20].map((o) => (
        <g key={o}>
          <line x1={xs(o)} x2={xs(o)} y1={M.t} y2={H - M.b} className="grid-line" />
          <text x={xs(o)} y={H - 8} fontSize={9.5} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--font-mono)">{o}</text>
        </g>
      ))}
      {spells.map((s, i) => {
        const y = M.t + bowlers.indexOf(s.bowler) * rowH + 5;
        const x0 = xs(s.startOver);
        const x1 = xs(s.endOver + 1);
        return (
          <g key={i} style={{ cursor: "pointer" }}
            onMouseMove={(e) => show(e.clientX, e.clientY, (
              <div>
                <div className="tt-head">{s.bowler} · overs {s.startOver + 1}–{s.endOver + 1}</div>
                {s.runs} runs off {s.balls} · econ {s.econ}{s.wkts ? ` · ${s.wkts} wkt${s.wkts > 1 ? "s" : ""}` : ""}
              </div>
            ))}
            onMouseLeave={hide}
            onClick={() => openDrawer({
              title: `${s.bowler} spell (ov ${s.startOver + 1}–${s.endOver + 1})`,
              balls: balls.filter((d) => d.bwl === s.bowler && d.ov >= s.startOver && d.ov <= s.endOver),
            })}
          >
            <rect x={x0} y={y} width={Math.max(6, x1 - x0 - 3)} height={rowH - 12} rx={5}
              fill={heat(1 - Math.min(1, s.econ / maxEcon))} opacity={0.85} />
            <text x={x0 + 6} y={y + rowH - 18} fontSize={9.5} fill="#04140c" fontFamily="var(--font-mono)" fontWeight={700}>
              {s.econ}
            </text>
            {Array.from({ length: s.wkts }).map((_, wi) => (
              <circle key={wi} cx={x1 - 8 - wi * 9} cy={y + (rowH - 12) / 2} r={3.2} fill="#ff5470" stroke="#0a0e14" strokeWidth={1} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- Donut */
export function Donut({ data, title }: { data: Record<string, number>; title: string }) {
  const { show, hide } = useTip();
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const pie = d3pie<[string, number]>().value((d) => d[1]).sort(null);
  const arc = d3arc<ReturnType<typeof pie>[0]>().innerRadius(46).outerRadius(72).cornerRadius(3).padAngle(0.02);
  if (!total) return <div style={{ color: "var(--ink-3)", padding: 12 }}>none</div>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg viewBox="0 0 160 160" style={{ width: 140 }} role="img" aria-label={title}>
        <g transform="translate(80 80)">
          {pie(entries).map((a, i) => (
            <path key={i} d={arc(a) ?? ""} fill={SERIES[i % 6]} opacity={0.85}
              onMouseMove={(e) => show(e.clientX, e.clientY, <span>{a.data[0]}: {a.data[1]} ({((100 * a.data[1]) / total).toFixed(0)}%)</span>)}
              onMouseLeave={hide} />
          ))}
          <text textAnchor="middle" y={-2} fontSize={22} fill="var(--ink)" fontFamily="var(--font-display)" fontWeight={700}>{total}</text>
          <text textAnchor="middle" y={14} fontSize={8} fill="var(--ink-3)" fontFamily="var(--font-mono)" letterSpacing={1}>{title.toUpperCase()}</text>
        </g>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map(([k, v], i) => (
          <span key={k} className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: SERIES[i % 6], marginRight: 7 }} />
            {k} — {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Radar */
export interface RadarAxis {
  label: string;
  value: number; // 0..1 normalized
  raw: string;
}

export function Radar({ axes, ghost, name, ghostName }: {
  axes: RadarAxis[]; ghost?: RadarAxis[] | null; name: string; ghostName?: string;
}) {
  const { show, hide } = useTip();
  const reduced = useReducedMotion();
  const R = 105, C = 140;
  const n = axes.length;
  const pt = (i: number, v: number): [number, number] => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return [C + R * v * Math.cos(a), C + R * v * Math.sin(a)];
  };
  const poly = (vals: RadarAxis[]) => vals.map((a, i) => pt(i, Math.max(0.04, a.value)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 280 280" style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto" }} role="img" aria-label={`Skill radar for ${name}`}>
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={axes.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="var(--line)" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text key={a.label} x={x} y={y} textAnchor="middle" fontSize={9.5} fill="var(--ink-2)" fontFamily="var(--font-mono)"
            onMouseMove={(e) => show(e.clientX, e.clientY, <span>{a.label}: {a.raw}</span>)} onMouseLeave={hide}
            style={{ cursor: "help" }}>
            {a.label.split("\n").map((l, li) => <tspan key={li} x={x} dy={li ? 11 : 0}>{l}</tspan>)}
          </text>
        );
      })}
      {ghost && (
        <polygon points={poly(ghost)} fill="#9c7be8" opacity={0.14} stroke="#9c7be8" strokeWidth={1.4} strokeDasharray="4 4" />
      )}
      <motion.polygon
        points={poly(axes)}
        fill="#00ff88" opacity={0.15} stroke="#00ff88" strokeWidth={1.8}
        initial={reduced ? undefined : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.15 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        style={{ transformOrigin: "140px 140px" }}
      />
      {axes.map((a, i) => {
        const [x, y] = pt(i, Math.max(0.04, a.value));
        return <circle key={i} cx={x} cy={y} r={3} fill="#00ff88"
          onMouseMove={(e) => show(e.clientX, e.clientY, <span>{a.label}: {a.raw}</span>)} onMouseLeave={hide} />;
      })}
      {ghostName && (
        <text x={12} y={270} fontSize={9} fill="#9c7be8" fontFamily="var(--font-mono)">▨ {ghostName}</text>
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------- Acceleration curve */
export function AccelCurve({ own, ghost, ownName, ghostName, compAvg }: {
  own: AccelBucket[]; ghost?: AccelBucket[] | null; ownName: string; ghostName?: string;
  compAvg: AccelBucket[];
}) {
  const { show, hide } = useTip();
  const W = 440, H = 210, M = { t: 16, r: 12, b: 28, l: 38 };
  const all = [...own, ...(ghost ?? []), ...compAvg].filter((b) => b.sr != null);
  const maxSR = Math.max(180, ...all.map((b) => b.sr!)) * 1.08;
  const xs = scaleLinear([0, own.length - 1], [M.l, W - M.r]);
  const ys = scaleLinear([0, maxSR], [H - M.b, M.t]);
  const mk = (rows: AccelBucket[]) =>
    d3line<AccelBucket>().defined((b) => b.sr != null).x((_, i) => xs(i)).y((b) => ys(b.sr ?? 0)).curve(curveMonotoneX)(rows) ?? "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={`Acceleration curve for ${ownName}`}>
      {ys.ticks(4).map((t) => (
        <g key={t}>
          <line className="grid-line" x1={M.l} x2={W - M.r} y1={ys(t)} y2={ys(t)} />
          <text x={M.l - 6} y={ys(t) + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">{t}</text>
        </g>
      ))}
      {own.map((b, i) => (
        <text key={i} x={xs(i)} y={H - 10} textAnchor="middle" fontSize={8.5} fill="var(--ink-3)" fontFamily="var(--font-mono)">{b.bucket}</text>
      ))}
      <path d={mk(compAvg)} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="3 4" opacity={0.7} />
      {ghost && <path d={mk(ghost)} fill="none" stroke="#9c7be8" strokeWidth={1.8} strokeDasharray="5 4" />}
      <path d={mk(own)} fill="none" stroke="#00ff88" strokeWidth={2.2} style={{ filter: "drop-shadow(0 0 5px rgba(0,255,136,0.4))" }} />
      {own.map((b, i) =>
        b.sr != null ? (
          <circle key={i} cx={xs(i)} cy={ys(b.sr)} r={3.4} fill="#00ff88"
            onMouseMove={(e) => show(e.clientX, e.clientY, <span>{ownName} balls {b.bucket}: SR {b.sr} ({b.balls} balls)</span>)}
            onMouseLeave={hide} />
        ) : null,
      )}
      <text x={W - M.r} y={M.t} textAnchor="end" fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
        ▪ {ownName} {ghostName ? `· ▨ ${ghostName} ` : ""}· ┄ competition avg
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------- Innings sparkline strip */
export function InningsStrip({ innings }: { innings: { m: string; runs: number; balls: number; out: boolean; prog: number[] }[] }) {
  const { show, hide } = useTip();
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {innings.map((inn, i) => {
        const W = 86, H = 44;
        let cum = 0;
        const pts = inn.prog.map((r, bi) => {
          cum += r;
          return [(bi / Math.max(1, inn.prog.length - 1)) * (W - 8) + 4, H - 6 - (cum / Math.max(1, inn.runs)) * (H - 14)] as [number, number];
        });
        return (
          <div key={i} style={{
            background: "var(--panel-solid)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px",
            cursor: "help",
          }}
            onMouseMove={(e) => show(e.clientX, e.clientY, (
              <span>{inn.runs} ({inn.balls}) {inn.out ? "— dismissed" : "— not out"}</span>
            ))}
            onMouseLeave={hide}
          >
            <svg width={W} height={H}>
              {pts.length > 1 && (
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none"
                  stroke={inn.out ? "#9fb0c3" : "#00ff88"} strokeWidth={1.6} />
              )}
              {inn.out && pts.length > 0 && (
                <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill="#ff5470" />
              )}
            </svg>
            <div className="mono" style={{ fontSize: 10, color: inn.out ? "var(--ink-2)" : "var(--accent)", textAlign: "center" }}>
              {inn.runs}{inn.out ? "" : "*"} <span style={{ color: "var(--ink-3)" }}>({inn.balls})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
