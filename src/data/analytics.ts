import type { BattingAgg, BowlingAgg, Delivery, PlayerIndexEntry } from "./types";
import { PACE_TYPES, SPIN_TYPES } from "./types";

/** Lookup built from players/index.json — bowler types & handedness. */
export type PlayerLookup = Map<string, PlayerIndexEntry>;

export function buildLookup(players: PlayerIndexEntry[]): PlayerLookup {
  return new Map(players.map((p) => [p.name, p]));
}

export function bowlKindOf(name: string, lk: PlayerLookup): "pace" | "spin" | null {
  const b = lk.get(name)?.bowl;
  if (!b) return null;
  if (PACE_TYPES.includes(b)) return "pace";
  if (SPIN_TYPES.includes(b)) return "spin";
  return null;
}

// ---------------------------------------------------------------- filters

export interface BallFilters {
  phase: 0 | 1 | 2 | 3; // 0 = all
  overRange: [number, number] | null; // custom, overrides phase when set
  bowlKind: "all" | "pace" | "spin";
  bowlType: string | null;
  batHand: "all" | "R" | "L";
  batter: string | null; // cross-filter
  bowler: string | null; // cross-filter
}

export const DEFAULT_FILTERS: BallFilters = {
  phase: 0,
  overRange: null,
  bowlKind: "all",
  bowlType: null,
  batHand: "all",
  batter: null,
  bowler: null,
};

export function isFiltering(f: BallFilters): boolean {
  return (
    f.phase !== 0 || f.overRange !== null || f.bowlKind !== "all" ||
    f.bowlType !== null || f.batHand !== "all" || f.batter !== null || f.bowler !== null
  );
}

export function filterBalls(balls: Delivery[], f: BallFilters, lk: PlayerLookup): Delivery[] {
  return balls.filter((d) => {
    if (f.overRange) {
      if (d.ov < f.overRange[0] || d.ov > f.overRange[1]) return false;
    } else if (f.phase !== 0 && d.ph !== f.phase) return false;
    if (f.bowlKind !== "all" && bowlKindOf(d.bwl, lk) !== f.bowlKind) return false;
    if (f.bowlType && lk.get(d.bwl)?.bowl !== f.bowlType) return false;
    if (f.batHand !== "all" && (lk.get(d.bat)?.bat ?? "R") !== f.batHand) return false;
    if (f.batter && d.bat !== f.batter) return false;
    if (f.bowler && d.bwl !== f.bowler) return false;
    return true;
  });
}

// ---------------------------------------------------------------- aggregates

const NON_BOWLER_WICKETS = ["run out", "retired hurt", "retired out", "obstructing the field"];

export function aggBatting(balls: Delivery[], batter?: string): BattingAgg {
  const faced = balls.filter((b) => b.ek !== "wides");
  const runs = balls.reduce((s, b) => s + b.rb, 0);
  const isOut = (b: Delivery) =>
    b.wk && (!batter || b.wk.out === batter) && b.wk.kind !== "retired hurt";
  const outsAll = balls.filter((b) => isOut(b)).length;
  const fours = balls.filter((b) => b.rb >= 4 && b.rb < 6).length;
  const sixes = balls.filter((b) => b.rb >= 6).length;
  const dots = faced.filter((b) => b.rt === 0).length;
  const n = faced.length;
  return {
    runs,
    balls: n,
    outs: outsAll,
    bowlerOuts: balls.filter((b) => isOut(b) && !NON_BOWLER_WICKETS.includes(b.wk!.kind)).length,
    sr: n ? +(100 * (runs / n)).toFixed(1) : null,
    avg: outsAll ? +(runs / outsAll).toFixed(1) : null,
    boundaryPct: n ? +((100 * (fours + sixes)) / n).toFixed(1) : null,
    dotPct: n ? +((100 * dots) / n).toFixed(1) : null,
    fours,
    sixes,
  };
}

export function aggBowling(balls: Delivery[]): BowlingAgg {
  const legal = balls.filter((b) => b.ek !== "wides" && b.ek !== "noballs");
  const runs = balls.reduce(
    (s, b) => s + b.rb + (b.ek === "wides" || b.ek === "noballs" ? b.re : 0),
    0,
  );
  const wkts = balls.filter((b) => b.wk && !NON_BOWLER_WICKETS.includes(b.wk.kind)).length;
  const dots = legal.filter((b) => b.rt === 0).length;
  const bnd = balls.filter((b) => b.rb >= 4).length;
  const n = legal.length;
  return {
    balls: n,
    runs,
    wkts,
    econ: n ? +((6 * runs) / n).toFixed(2) : null,
    sr: wkts ? +(n / wkts).toFixed(1) : null,
    avg: wkts ? +(runs / wkts).toFixed(1) : null,
    dotPct: n ? +((100 * dots) / n).toFixed(1) : null,
    boundaryPct: n ? +((100 * bnd) / n).toFixed(1) : null,
  };
}

// ---------------------------------------------------------------- match structures

export interface OverSummary {
  over: number;
  runs: number;
  wickets: number;
  balls: Delivery[];
}

export function byOver(balls: Delivery[]): OverSummary[] {
  const map = new Map<number, OverSummary>();
  for (const d of balls) {
    let o = map.get(d.ov);
    if (!o) {
      o = { over: d.ov, runs: 0, wickets: 0, balls: [] };
      map.set(d.ov, o);
    }
    o.runs += d.rt;
    if (d.wk && d.wk.kind !== "retired hurt") o.wickets += 1;
    o.balls.push(d);
  }
  return [...map.values()].sort((a, b) => a.over - b.over);
}

export interface Partnership {
  pair: [string, string];
  runs: number;
  balls: number;
  wicketNo: number; // stand for wicket N (1-based); last stand may be unbroken
  unbroken: boolean;
  contrib: Record<string, number>;
}

export function partnerships(balls: Delivery[]): Partnership[] {
  const out: Partnership[] = [];
  let cur: Partnership | null = null;
  let wktNo = 1;
  for (const d of balls) {
    const key: [string, string] = [d.bat, d.ns].sort() as [string, string];
    if (!cur || cur.pair[0] !== key[0] || cur.pair[1] !== key[1]) {
      if (cur) out.push(cur);
      cur = { pair: key, runs: 0, balls: 0, wicketNo: wktNo, unbroken: true, contrib: {} };
    }
    cur.runs += d.rt;
    if (d.ek !== "wides") cur.balls += 1;
    cur.contrib[d.bat] = (cur.contrib[d.bat] ?? 0) + d.rb;
    if (d.wk && d.wk.kind !== "retired hurt") {
      cur.unbroken = false;
      out.push(cur);
      cur = null;
      wktNo += 1;
    }
  }
  if (cur && cur.balls > 0) out.push(cur);
  return out;
}

export interface MatchupCell {
  batter: string;
  bowler: string;
  runs: number;
  balls: number;
  outs: number;
  sr: number | null;
  balls_: Delivery[];
}

export function matchupMatrix(balls: Delivery[]): {
  batters: string[];
  bowlers: string[];
  cells: Map<string, MatchupCell>;
} {
  const cells = new Map<string, MatchupCell>();
  const batOrder: string[] = [];
  const bowlOrder: string[] = [];
  for (const d of balls) {
    if (!batOrder.includes(d.bat)) batOrder.push(d.bat);
    if (!bowlOrder.includes(d.bwl)) bowlOrder.push(d.bwl);
    const k = `${d.bat}|${d.bwl}`;
    let c = cells.get(k);
    if (!c) {
      c = { batter: d.bat, bowler: d.bwl, runs: 0, balls: 0, outs: 0, sr: null, balls_: [] };
      cells.set(k, c);
    }
    c.runs += d.rb;
    if (d.ek !== "wides") c.balls += 1;
    if (d.wk && d.wk.out === d.bat && !NON_BOWLER_WICKETS.includes(d.wk.kind)) c.outs += 1;
    c.balls_.push(d);
  }
  for (const c of cells.values()) c.sr = c.balls ? +(100 * (c.runs / c.balls)).toFixed(0) : null;
  return { batters: batOrder, bowlers: bowlOrder, cells };
}

export interface Spell {
  bowler: string;
  startOver: number;
  endOver: number;
  runs: number;
  balls: number;
  wkts: number;
  econ: number;
}

export function bowlingSpells(balls: Delivery[]): Spell[] {
  const overs = byOver(balls);
  const spells: Spell[] = [];
  const open = new Map<string, Spell>();
  for (const o of overs) {
    const bowler = o.balls[0]?.bwl;
    if (!bowler) continue;
    const runs = o.balls.reduce(
      (s, b) => s + b.rb + (b.ek === "wides" || b.ek === "noballs" ? b.re : 0),
      0,
    );
    const legal = o.balls.filter((b) => b.ek !== "wides" && b.ek !== "noballs").length;
    const wkts = o.balls.filter((b) => b.wk && !NON_BOWLER_WICKETS.includes(b.wk.kind)).length;
    const cur = open.get(bowler);
    // same spell if bowler bowled 2 overs ago (alternate-end continuation)
    if (cur && o.over - cur.endOver <= 2) {
      cur.endOver = o.over;
      cur.runs += runs;
      cur.balls += legal;
      cur.wkts += wkts;
    } else {
      const s: Spell = { bowler, startOver: o.over, endOver: o.over, runs, balls: legal, wkts, econ: 0 };
      spells.push(s);
      open.set(bowler, s);
    }
  }
  for (const s of spells) s.econ = s.balls ? +((6 * s.runs) / s.balls).toFixed(2) : 0;
  return spells;
}

/** Rolling 12-ball run-rate differential (vs required rate in a chase, vs own average otherwise). */
export function momentum(balls: Delivery[], target: number | null, targetBalls: number) {
  const win = 12;
  const out: { i: number; ov: number; diff: number; d: Delivery }[] = [];
  let legalCount = 0;
  const legalIdx: number[] = [];
  balls.forEach((d, i) => {
    if (d.ek !== "wides" && d.ek !== "noballs") {
      legalCount++;
      legalIdx.push(i);
    }
    const from = Math.max(0, i - win + 1);
    const seg = balls.slice(from, i + 1);
    const segLegal = seg.filter((b) => b.ek !== "wides" && b.ek !== "noballs").length || 1;
    const segRuns = seg.reduce((s, b) => s + b.rt, 0);
    const rr = (6 * segRuns) / segLegal;
    let ref: number;
    if (target != null) {
      const need = target - d.cr;
      const left = targetBalls - legalCount;
      ref = left > 0 ? Math.max(0, (6 * need) / left) : need > 0 ? 36 : 0;
    } else {
      ref = (6 * d.cr) / Math.max(1, legalCount); // vs own innings run rate
    }
    out.push({ i, ov: d.ov + d.b / 6, diff: rr - ref, d });
  });
  void legalIdx;
  return out;
}

export interface ExtrasBreakdown {
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
  penalty: number;
}

export function extrasBreakdown(balls: Delivery[]): ExtrasBreakdown {
  const e: ExtrasBreakdown = { wides: 0, noballs: 0, byes: 0, legbyes: 0, penalty: 0 };
  for (const d of balls) if (d.ek) e[d.ek as keyof ExtrasBreakdown] += d.re;
  return e;
}

export function dismissalKinds(balls: Delivery[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of balls)
    if (d.wk && d.wk.kind !== "retired hurt") out[d.wk.kind] = (out[d.wk.kind] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------- format helpers

export const oversStr = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
export const fmt = (v: number | null | undefined, dash = "–") =>
  v == null ? dash : `${v}`;
export const phaseLabel = (p: number) =>
  p === 1 ? "Powerplay (1–6)" : p === 2 ? "Middle (7–16)" : "Death (17–20)";
