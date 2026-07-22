import type { Match, MatchIndexEntry, Meta, Player, PlayerIndexEntry, Team } from "./types";

const cache = new Map<string, Promise<unknown>>();

function get<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${import.meta.env.BASE_URL}data/processed/${path}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

export const loadMeta = () => get<Meta>("meta.json");
export const loadMatchIndex = () => get<MatchIndexEntry[]>("matches/index.json");
export const loadMatch = (id: string) => get<Match>(`matches/${id}.json`);
export const loadPlayerIndex = () => get<PlayerIndexEntry[]>("players/index.json");
export const loadPlayer = (id: string) => get<Player>(`players/${id}.json`);
export const loadTeam = (id: string) => get<Team>(`teams/${id}.json`);
