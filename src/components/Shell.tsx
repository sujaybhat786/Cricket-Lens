import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";
import { useStore } from "../state/store";

const SECTIONS = [
  { id: "hero", label: "CricLens" },
  { id: "match-lab", label: "Match Lab" },
  { id: "player-lab", label: "Player Lab" },
  { id: "team-lab", label: "Team Lab" },
];

export function RailNav() {
  const [active, setActive] = useState("hero");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);
  return (
    <nav className="rail" aria-label="Section navigation">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          className={`rail-dot ${active === s.id ? "active" : ""}`}
          onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })}
          aria-label={s.label}
        >
          <span className="rail-label">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ContextHeader({ matchLabel, playerLabel, teamLabel }: {
  matchLabel?: string | null;
  playerLabel?: string | null;
  teamLabel?: string | null;
}) {
  const parts = [
    matchLabel && `⚡ ${matchLabel}`,
    playerLabel && `◉ ${playerLabel}`,
    teamLabel && `▲ ${teamLabel}`,
  ].filter(Boolean);
  return (
    <header className="ctx-header">
      <button
        className="ctx-brand"
        onClick={() => document.getElementById("hero")?.scrollIntoView({ behavior: "smooth" })}
      >
        CRIC<em>LENS</em>
      </button>
      <span className="ctx-sel">{parts.length ? parts.join("  ·  ") : "no selection — scroll to a Lab and pick"}</span>
    </header>
  );
}

/** Animated count-up number that respects prefers-reduced-motion. */
export function CountUp({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  const reduced = useReducedMotion();
  const spring = useSpring(0, { stiffness: 60, damping: 18 });
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.textContent = value.toFixed(decimals);
      return;
    }
    spring.set(value);
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = v.toFixed(decimals);
    });
  }, [value, reduced, spring, decimals]);
  return (
    <motion.span
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
    >
      {reduced ? value.toFixed(decimals) : "0"}
    </motion.span>
  );
}

export function StatTile({ label, value, accent, sub, decimals }: {
  label: string;
  value: number | string | null;
  accent?: boolean;
  sub?: string;
  decimals?: number;
}) {
  return (
    <div style={{ minWidth: 90 }}>
      <div className="stat-label" style={{ marginBottom: 4 }}>{label}</div>
      {typeof value === "number" ? (
        <span style={accent ? { color: "var(--accent)" } : undefined}>
          <CountUp
            value={value}
            decimals={decimals ?? (Number.isInteger(value) ? 0 : 1)}
            className="stat-big"
          />
        </span>
      ) : (
        <span className="stat-big" style={accent ? { color: "var(--accent)" } : undefined}>{value ?? "–"}</span>
      )}
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function useStickyLabels() {
  return useStore((s) => ({ matchId: s.matchId, playerId: s.playerId, teamId: s.teamId }));
}
