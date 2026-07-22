import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStore } from "../state/store";
import type { Delivery } from "../data/types";

function ballLine(d: Delivery): string {
  if (d.wk) return `WICKET — ${d.wk.out} ${d.wk.kind}${d.wk.fielders.length ? ` (${d.wk.fielders.join(", ")})` : ""}`;
  if (d.ek === "wides") return `wide${d.re > 1 ? ` +${d.re - 1} ran` : ""}`;
  if (d.ek === "noballs") return `no-ball, ${d.rb} off the bat`;
  if (d.ek) return `${d.re} ${d.ek}`;
  if (d.rb >= 6) return "SIX";
  if (d.rb >= 4) return "FOUR";
  if (d.rt === 0) return "dot ball";
  return `${d.rb} run${d.rb > 1 ? "s" : ""}`;
}

function runColor(d: Delivery): string {
  if (d.wk) return "var(--wicket)";
  if (d.rb >= 6) return "var(--accent)";
  if (d.rb >= 4) return "var(--c2)";
  if (d.rt === 0) return "var(--ink-3)";
  return "var(--ink-2)";
}

/** "Show me the balls" — every aggregate one click from its raw deliveries. */
export function DeliveryDrawer() {
  const { drawer, closeDrawer } = useStore();
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {drawer && (
        <>
          <motion.div
            className="drawer-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
          />
          <motion.aside
            className="drawer"
            initial={reduced ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--line-strong)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="stat-label" style={{ color: "var(--accent)", marginBottom: 4 }}>
                    Show me the balls
                  </div>
                  <h3 style={{ fontSize: 17 }}>{drawer.title}</h3>
                  {drawer.subtitle && (
                    <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 2 }}>{drawer.subtitle}</div>
                  )}
                </div>
                <button className="chip" onClick={closeDrawer}>✕</button>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
                {drawer.balls.length} deliveries · RECORDED
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {drawer.balls.map((d, i) => (
                <div className="ball-row" key={i}>
                  <span className="mono" style={{ color: "var(--ink-3)" }}>
                    {d.ov}.{d.b}
                  </span>
                  <span>
                    <span style={{ color: "var(--ink-2)" }}>{d.bwl}</span>
                    <span style={{ color: "var(--ink-3)" }}> to </span>
                    <span style={{ color: "var(--ink)" }}>{d.bat}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: runColor(d) }}>{ballLine(d)}</span>
                  </span>
                  <span className="mono stat-big" style={{ fontSize: 18, color: runColor(d), textAlign: "right" }}>
                    {d.wk ? "W" : d.rt}
                  </span>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
