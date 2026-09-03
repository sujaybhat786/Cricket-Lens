import { motion, useReducedMotion } from "framer-motion";
import type { KeyMoment } from "../data/types";
import { useTip } from "../components/Tooltip";

/**
 * Key Moments Reel (DERIVED) — the deliveries that moved the win probability
 * most. The swings come from the same per-ball model the worm renders; this
 * only adds the top-N extraction and the card UI.
 */
export function KeyMomentsReel({ moments, onJump, activeIdx }: {
  moments: KeyMoment[];
  onJump: (m: KeyMoment, i: number) => void;
  activeIdx: number | null;
}) {
  const { show, hide } = useTip();
  const reduced = useReducedMotion();
  const max = Math.max(0.01, ...moments.map((m) => m.swing));

  if (!moments.length)
    return <div style={{ color: "var(--ink-3)", padding: 20 }}>No moments available for this match.</div>;

  return (
    <div className="reel">
      {moments.map((m, i) => {
        const kind = m.wk ? "is-wicket" : m.rb >= 4 ? "is-boundary" : "";
        const color = m.wk ? "var(--wicket)" : m.rb >= 4 ? "var(--accent)" : "var(--ink)";
        return (
          <motion.button
            key={`${m.inn}-${m.ov}-${m.b}`}
            className={`moment ${kind} ${activeIdx === i ? "active" : ""}`}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: Math.min(0.5, i * 0.05), ease: "easeOut" }}
            onClick={() => onJump(m, i)}
            onMouseMove={(e) =>
              show(e.clientX, e.clientY, (
                <div>
                  <div className="tt-head">{m.team} · over {m.ov}.{m.b}</div>
                  {m.bwl} to {m.bat} — {m.desc}
                  <div style={{ color: "var(--ink-3)", marginTop: 3 }}>
                    win probability {Math.round(m.wpFrom * 100)}% → {Math.round(m.wpTo * 100)}%
                  </div>
                  <div style={{ color: "var(--gold)", fontSize: 10.5, marginTop: 3 }}>
                    click to move the replay to this ball
                  </div>
                </div>
              ))
            }
            onMouseLeave={hide}
          >
            <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.12em" }}>
              #{i + 1} · {m.team.split(" ").map((w) => w[0]).join("")} · OVER {m.ov}.{m.b}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, margin: "6px 0 2px", color }}>
              {m.desc}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>{m.bwl} → {m.bat}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
              {m.score} · {Math.round(m.wpFrom * 100)}→{Math.round(m.wpTo * 100)}%
            </div>
            <div className="swingbar"><i style={{ width: `${(m.swing / max) * 100}%` }} /></div>
            <div className="mono" style={{ fontSize: 10, color: "var(--accent)", marginTop: 5 }}>
              {(m.swing * 100).toFixed(0)} pt swing
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
