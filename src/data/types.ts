export interface Wicket {
  kind: string;
  out: string;
  fielders: string[];
}

/** Enriched delivery from the ETL. wh/pm are MODELED reconstructions. */
export interface Delivery {
  ov: number;
  b: number;
  bat: string;
  bwl: string;
  ns: string;
  rb: number;
  re: number;
  rt: number;
  ek: string | null;
  wk: Wicket | null;
  cr: number;
  cw: number;
  ph: 1 | 2 | 3;
  wp: number;
  wh: [number, number] | null; // [field angle deg, distance 0..1.15]
  pm: [number, number]; // [line -1..1 (leg->off), length m from stumps]
  // present on player-dossier balls only:
  m?: string;
  inn?: number;
  batTeam?: string;
}

export interface Innings {
  team: string;
  total: number;
  wickets: number;
  balls: number;
  deliveries: Delivery[];
}

export interface MatchInfo {
  teams: string[];
  short: string[];
  venue: string;
  city: string;
  date: string;
  event: string;
  matchNumber: number | null;
  stage?: string | null;
  toss: { winner?: string; decision?: string };
  outcome: Record<string, unknown>;
  result: string;
  winner?: string;
  pom: string | null;
  matchType: string;
  players: Record<string, string[]>;
  firstTotal: number | null;
  target: number | null;
  targetBalls: number;
}

/** Top win-probability-swing delivery, extracted at build time (DERIVED). */
export interface KeyMoment {
  inn: number;
  team: string;
  ov: number;
  b: number;
  swing: number;
  wpFrom: number;
  wpTo: number;
  bat: string;
  bwl: string;
  rb: number;
  rt: number;
  wk: Wicket | null;
  score: string;
  desc: string;
}

/** Prior batter-vs-bowler record, EXCLUDING the match being previewed. */
export interface Battle {
  batter: string;
  batTeam: string;
  bowler: string;
  bowlTeam: string;
  runs: number;
  balls: number;
  outs: number;
  sr: number | null;
  matches: number;
  batHand: string;
  bowlType: string | null;
}

export interface PreMatch {
  h2h: {
    played: number;
    wins: Record<string, number>;
    matches: { id: string; date: string; result: string; venue: string; stage?: string | null }[];
  };
  venue: Venue | null;
  battles: Battle[];
}

export interface Match {
  id: string;
  info: MatchInfo;
  innings: Innings[];
  keyMoments: KeyMoment[];
  preMatch: PreMatch;
}

export interface MatchIndexEntry {
  id: string;
  teams: string[];
  short: string[];
  venue: string;
  city: string;
  date: string;
  matchNumber: number | null;
  stage?: string | null;
  result: string;
  winner?: string;
  pom: string | null;
  scores: { team: string; runs: number; wkts: number; balls: number }[];
}

export interface BattingAgg {
  runs: number;
  balls: number;
  outs: number;
  bowlerOuts: number;
  sr: number | null;
  avg: number | null;
  boundaryPct: number | null;
  dotPct: number | null;
  fours: number;
  sixes: number;
}

export interface BowlingAgg {
  balls: number;
  runs: number;
  wkts: number;
  econ: number | null;
  sr: number | null;
  avg: number | null;
  dotPct: number | null;
  boundaryPct: number | null;
}

export interface PlayerMeta {
  bat: "R" | "L";
  bowl: string | null;
  wk: boolean;
  uncertain: boolean;
}

export interface AccelBucket {
  bucket: string;
  sr: number | null;
  balls: number;
}

export interface PlayerInningsEntry {
  m: string;
  inn: number;
  team: string;
  runs: number;
  balls: number;
  out: boolean;
  prog: number[];
}

export interface Player {
  id: string;
  name: string;
  teams: string[];
  meta: PlayerMeta;
  role: string;
  matches: number;
  batting: {
    overall: BattingAgg;
    phase: Record<string, BattingAgg>;
    vsKind: Record<string, BattingAgg>;
    vsType: Record<string, BattingAgg>;
    dismissals: Record<string, number>;
    dismissalPhase: Record<string, number>;
    acceleration: AccelBucket[];
    innings: PlayerInningsEntry[];
    vsBowlers: ({ name: string; type: string | null } & BattingAgg)[];
  };
  bowling: {
    overall: BowlingAgg;
    phase: Record<string, BowlingAgg>;
    vsHand: Record<string, BowlingAgg>;
    wicketKinds: Record<string, number>;
    vsBatters: ({ name: string; hand: string } & BowlingAgg)[];
  };
  balls: { bat: Delivery[]; bowl: Delivery[] };
}

export interface PlayerIndexEntry {
  id: string;
  name: string;
  teams: string[];
  role: string;
  bat: string;
  bowl: string | null;
  wk: boolean;
  uncertain: boolean;
  matches: number;
  runs: number;
  ballsFaced: number;
  sr: number | null;
  wkts: number;
  ballsBowled: number;
  econ: number | null;
}

export interface PhaseStat {
  rr: number | null;
  runs?: number;
  balls: number;
  wkts?: number;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  matches: string[];
  wins: number;
  played: number;
  squad: string[];
  batPhase: Record<string, PhaseStat>;
  bowlPhase: Record<string, PhaseStat>;
  catches: number;
  runOuts: number;
}

export interface Venue {
  name: string;
  city: string;
  matches: number;
  avgFirstInnings: number | null;
  chaseWinPct: number | null;
  spinEcon: number | null;
  paceEcon: number | null;
  spinBalls?: number;
  paceBalls?: number;
}

export interface Meta {
  matchCount: number;
  dateRange: [string, string];
  events: string[];
  formats: string[];
  teams: { id: string; name: string; short: string }[];
  venues: Venue[];
  competition: {
    bat: BattingAgg;
    phase: Record<string, { rr: number | null; balls: number }>;
    acceleration: AccelBucket[];
    par: number;
  };
  provenance: {
    source: string;
    license: string;
    note: string;
    winProbMethod: string;
  };
}

export const PHASE_NAMES: Record<number, string> = { 1: "Powerplay", 2: "Middle", 3: "Death" };
export const PACE_TYPES = ["RF", "RM", "LF", "LM"];
export const SPIN_TYPES = ["OB", "LB", "SLA", "LWS"];
export const BOWL_TYPE_LABELS: Record<string, string> = {
  RF: "Right-arm fast",
  RM: "Right-arm medium",
  LF: "Left-arm fast",
  LM: "Left-arm medium",
  OB: "Off-spin",
  LB: "Leg-spin",
  SLA: "Left-arm orthodox",
  LWS: "Left-arm wrist spin",
};
