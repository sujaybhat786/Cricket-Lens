import type { Delivery } from "../data/types";

export const INK3 = "var(--ink-3)";

/** Color for a delivery outcome — accent reserved for sixes, wickets always red. */
export function runColor(d: Delivery): string {
  if (d.wk) return "#ff5470";
  if (d.rb >= 6) return "#00ff88";
  if (d.rb >= 4) return "#4d8be8";
  if (d.rb > 0 || d.re > 0) return "#9fb0c3";
  return "#3a4657";
}

export function runClassLabel(d: Delivery): string {
  if (d.wk) return "wicket";
  if (d.rb >= 6) return "six";
  if (d.rb >= 4) return "four";
  if (d.rt === 0) return "dot";
  return `${d.rt}`;
}

/** Innings series colors (validated categorical slots 1 & 2). */
export const SERIES = ["#00ad5e", "#4d8be8", "#b98600", "#e0476b", "#9c7be8", "#1e97ab"];

/** Sequential heat for runs (dark surface -> hot). */
export function heat(t: number): string {
  // one-hue green ramp, dark -> bright
  const stops = ["#0d1f18", "#0e3a28", "#0d5a3a", "#0a7d4d", "#00a862", "#00d377", "#00ff88"];
  const i = Math.max(0, Math.min(stops.length - 1, Math.floor(t * (stops.length - 1) + 0.5)));
  return stops[i];
}

/** Diverging: negative -> red, mid -> gray, positive -> green. t in [-1, 1]. */
export function diverge(t: number): string {
  const clamp = Math.max(-1, Math.min(1, t));
  if (Math.abs(clamp) < 0.08) return "#6b7280";
  return clamp > 0
    ? ["#3f8f68", "#1fa96b", "#00c46a"][Math.min(2, Math.floor(clamp * 3))]
    : ["#a05568", "#c44a66", "#e0476b"][Math.min(2, Math.floor(-clamp * 3))];
}

export function ballLabel(d: Delivery): string {
  return `${d.ov}.${d.b}`;
}

export function describeBall(d: Delivery): string {
  let s = `${d.bwl} to ${d.bat}`;
  if (d.wk) s += ` — WICKET (${d.wk.kind})`;
  else if (d.ek === "wides") s += " — wide";
  else if (d.ek === "noballs") s += ` — no-ball, ${d.rb} off the bat`;
  else if (d.ek) s += ` — ${d.re} ${d.ek}`;
  else s += ` — ${d.rb === 0 ? "dot" : d.rb === 4 ? "FOUR" : d.rb === 6 ? "SIX" : `${d.rb} run${d.rb > 1 ? "s" : ""}`}`;
  return s;
}
