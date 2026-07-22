import { useTip } from "./Tooltip";

const EXPLAIN: Record<string, string> = {
  RECORDED: "Straight from Cricsheet ball-by-ball data — every value here is an observed fact of the match.",
  DERIVED: "Computed from recorded balls (rates, splits, indices, win probability). Fully factual, method documented.",
  MODELED:
    "Statistical reconstruction. Open data has no ball-tracking, so directions/coordinates are drawn from priors conditioned on handedness, bowler type, run value, phase and dismissal kind, seeded per delivery. Run values and outcomes are real.",
};

export function Badge({ tier, label }: { tier: "RECORDED" | "DERIVED" | "MODELED"; label?: string }) {
  const { show, hide } = useTip();
  return (
    <span
      className={`badge badge-${tier.toLowerCase()}`}
      onMouseMove={(e) => show(e.clientX, e.clientY, <span>{EXPLAIN[tier]}</span>)}
      onMouseLeave={hide}
    >
      {label ?? tier}
    </span>
  );
}

export function SampleBadge({ n, unit = "balls" }: { n: number; unit?: string }) {
  const { show, hide } = useTip();
  const small = n < 30;
  return (
    <span
      className="badge badge-sample"
      style={small ? { color: "var(--gold)", borderColor: "rgba(255,184,0,0.4)" } : undefined}
      onMouseMove={(e) =>
        show(
          e.clientX,
          e.clientY,
          <span>
            Sample size: {n} {unit}.{small ? " Small sample — treat with caution." : ""}
          </span>,
        )
      }
      onMouseLeave={hide}
    >
      n={n}{small ? " ⚠" : ""}
    </span>
  );
}
