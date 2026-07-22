import { create } from "zustand";
import type { BallFilters } from "../data/analytics";
import { DEFAULT_FILTERS } from "../data/analytics";
import type { Delivery } from "../data/types";

export interface DrawerPayload {
  title: string;
  subtitle?: string;
  balls: Delivery[];
}

interface AppState {
  matchId: string | null;
  playerId: string | null;
  comparePlayerId: string | null; // pinned ghost for Player Lab
  teamId: string | null;
  compareTeamId: string | null;

  filters: BallFilters;
  innings: number; // 0 = both, 1, 2 (Match Lab)

  drawer: DrawerPayload | null;

  setMatch: (id: string | null) => void;
  setPlayer: (id: string | null) => void;
  setComparePlayer: (id: string | null) => void;
  setTeam: (id: string | null) => void;
  setCompareTeam: (id: string | null) => void;
  setFilters: (f: Partial<BallFilters>) => void;
  clearCrossFilter: () => void;
  resetFilters: () => void;
  setInnings: (i: number) => void;
  openDrawer: (p: DrawerPayload) => void;
  closeDrawer: () => void;
}

export const useStore = create<AppState>((set) => ({
  matchId: null,
  playerId: null,
  comparePlayerId: null,
  teamId: null,
  compareTeamId: null,
  filters: { ...DEFAULT_FILTERS },
  innings: 0,
  drawer: null,

  setMatch: (id) =>
    set({ matchId: id, filters: { ...DEFAULT_FILTERS }, innings: 0 }),
  setPlayer: (id) => set({ playerId: id }),
  setComparePlayer: (id) => set({ comparePlayerId: id }),
  setTeam: (id) => set({ teamId: id }),
  setCompareTeam: (id) => set({ compareTeamId: id }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  clearCrossFilter: () =>
    set((s) => ({ filters: { ...s.filters, batter: null, bowler: null } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
  setInnings: (i) => set({ innings: i }),
  openDrawer: (p) => set({ drawer: p }),
  closeDrawer: () => set({ drawer: null }),
}));
