import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Badge, SampleBadge } from "./Badge";
import { exportPanelPng } from "./exportChart";

interface PanelProps {
  title: string;
  sub?: string;
  tier?: "RECORDED" | "DERIVED" | "MODELED";
  tierLabel?: string;
  n?: number;
  nUnit?: string;
  children: ReactNode;
  insight?: string | null;
  wide?: boolean;
}

/** Chart panel: provenance badge, sample badge, PNG export, staggered reveal. */
export function Panel({ title, sub, tier, tierLabel, n, nUnit, children, insight, wide }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const [exporting, setExporting] = useState(false);
  const [hasChart, setHasChart] = useState(false);

  useEffect(() => {
    // only offer PNG export on panels that actually contain a chart SVG
    const svg = ref.current?.querySelector("svg");
    setHasChart(!!svg && svg.getBoundingClientRect().width > 40);
  });

  const exportPng = async () => {
    if (!ref.current || exporting) return;
    setExporting(true);
    try {
      await exportPanelPng(ref.current, title);
    } catch (e) {
      console.error("PNG export failed", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div
      ref={ref}
      className="panel"
      style={wide ? { gridColumn: "1 / -1" } : undefined}
      initial={reduced ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-title">
        <h3>{title}</h3>
        {tier && <Badge tier={tier} label={tierLabel} />}
        {n != null && <SampleBadge n={n} unit={nUnit} />}
        <span style={{ flex: 1 }} />
        {hasChart && (
          <button
            data-noexport="1"
            className="chip"
            style={{ padding: "3px 9px", fontSize: 9.5, opacity: exporting ? 0.5 : 1 }}
            onClick={exportPng}
            disabled={exporting}
            title="Export this chart as a branded PNG"
          >
            {exporting ? "…" : "⤓ PNG"}
          </button>
        )}
      </div>
      {sub && <div className="panel-sub">{sub}</div>}
      {children}
      {insight && (
        <div className="scout-note" style={{ marginTop: 14 }}>
          <span className="sn-kicker">Auto insight · rule-based</span>
          {insight}
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 8.5,
          letterSpacing: "0.12em",
          color: "var(--ink-3)",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        CricLens · Cricsheet open data
      </div>
    </motion.div>
  );
}
