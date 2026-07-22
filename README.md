# CricLens 🏏

**Every fan, their own analyst.** A single-page, scroll-driven cricket analytics site built on
real [Cricsheet](https://cricsheet.org) ball-by-ball data — broadcast night-match aesthetic,
honest provenance, and drill-to-delivery everywhere.

## Setup

### Run locally

```bash
npm install
npm run dev        # site on http://localhost:5173 (data is pre-processed & committed)
```

Requires Node 20.19+ (Node 22 recommended — Vite 8). The processed data is committed, so
`npm run dev` works immediately with no data step.

To refresh the dataset (downloads the latest Cricsheet zip, keeps the 45 most recent matches,
rebuilds every aggregate):

```bash
npm run data       # = python3 scripts/fetch_data.py && python3 scripts/etl.py
```

`scripts/fetch_data.py --league ipl|bbl|psl|t20is|recent --count N` picks the source.
The data step additionally requires Python 3.9+ (standard library only).

### Deployment (Netlify)

Static build, hosted on Netlify. Configuration lives in [`netlify.toml`](netlify.toml):

| Setting | Value |
|---|---|
| Build command | `npm run build` (`tsc -b && vite build`) |
| Publish directory | `dist` |
| Node version | `22` (pinned via `NODE_VERSION`) |

`npm run build` type-checks and bundles into `dist/`, and Vite copies `public/` — including the
pre-processed Cricsheet JSON under `public/data/processed/` — into `dist/`, so the deployed site
is fully self-contained with **no runtime API calls or backend**. There is no data step in the
Netlify build; the committed processed JSON ships as-is. To deploy, connect the repo to Netlify
(it reads `netlify.toml` automatically) or run `npx netlify deploy --prod` from a local build.

## What's inside

| Universe | What you get |
|---|---|
| **Match Lab** | Full match autopsy: worm + win-probability ribbon, Manhattan, modeled wagon wheels & pitch maps, matchup matrix (click a cell → cross-filters every chart), partnerships, momentum, bowling-spell Gantt, extras/control panel |
| **Player Lab** | Scouting dossiers: 6-axis skill radar, "how he gets out" vulnerability panel, danger/comfort matchup tables with threshold-based scouting notes, composite wagon wheel / pitch map, acceleration curve vs competition, innings sparklines, pin-any-player comparison with ghost overlays |
| **Team Lab** | Squad DNA radar, phase dominance vs competition average, live Best-XI combination builder with coverage flags, venue conditions-fit scoring, head-to-head |
| **Analyst Mode** | Persistent global filters (phase / custom overs / bowler type / handedness / innings), cross-filtering, "show me the balls" drawer under every aggregate, per-chart PNG export, rule-based insight cards |

## Honesty about inference (read this)

Open data has **no ball-tracking**. Every visual is badged with its provenance tier:

- `RECORDED` — straight from Cricsheet: runs, extras, dismissals, matchups, progressions.
- `DERIVED` — computed but factual: phase splits, indices, and the win-probability worm
  (logistic model over a DLS-style resource fraction of balls remaining × wickets in hand, par 175).
- `MODELED` — **wagon-wheel directions and pitch-map coordinates are statistical
  reconstructions**, drawn from priors conditioned on (batter handedness × bowler type ×
  run value × phase × dismissal kind) and seeded per delivery ID so they are stable across
  builds. The run values, outcomes and dismissals they display are real. They are labelled
  `MODELED DIRECTIONS · REAL RUNS` / `MODELED PITCH MAP · REAL OUTCOMES` and are **not**
  Hawk-Eye data.

Player handedness and bowler types are hand-curated in `scripts/players_meta.json`
(uncertain entries carry `"uncertain": true` and show a "?" in the UI) — corrections welcome;
re-run `npm run etl` after editing.

Sample-size badges (`n=…`, ⚠ under 30 balls) appear on every aggregate panel; venue cards
flag small samples explicitly.

## Architecture

```
scripts/fetch_data.py     Cricsheet downloader (league/date args)
scripts/etl.py            raw JSON → pre-aggregated static bundles (all modeling happens here)
scripts/players_meta.json curated handedness + bowler types (188 players)
data/raw/                 Cricsheet originals, kept for provenance
public/data/processed/    matches/{id}, players/{id}, teams/{id}, meta.json — the site's only "API"
src/viz/                  custom D3/SVG charts (worm, wheel, pitch map, matrix, …)
src/labs/                 the three analysis universes
src/data/analytics.ts     client-side filter/aggregation engine (powers cross-filtering)
src/state/store.ts        zustand: selections, filters, cross-filter, drawer
```

No backend, no external calls at runtime — the browser only renders static JSON.
Stack: Vite + React + TypeScript, D3 (scales/shapes), Framer Motion (respects
`prefers-reduced-motion`), Zustand, self-hosted fonts.

An optional AI narrative layer (Anthropic API behind a small proxy) is a documented
extension point; the shipped insight cards are rule-based so the site runs fully offline.

## Data licence & attribution

Data: **Cricsheet** (Stephen Rushe). *"This dataset is made available under the Open Data
Commons Attribution License: http://opendatacommons.org/licenses/by/1.0/"* — reproduced from
cricsheet.org. Wagon wheels & pitch maps are statistical reconstructions, not ball-tracking.
CricLens is an independent fan project, not affiliated with any league or board.
