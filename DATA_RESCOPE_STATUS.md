# CricLens — Data Rescope Status (checkpoint)

**Date:** 2026-09-04 · **Branch:** `main` · **Live site:** unchanged and working (still the 45-match IPL dataset)

**Bottom line:** the fetch layer is done and verified. **The ETL was deliberately NOT run over the
full dataset** — measured projections show it would produce ~1.7 GB of static JSON and probably
exhaust memory. That is an architectural blocker, not a tuning problem, and it needs a decision from
you before Pass A proceeds. Details in §2.

---

## Step 0 — Starting state (confirmed before any change)

`git log` clean at `27b50fd`, working tree clean, 45 IPL matches processed, site building and serving.

---

## Step 1 — Fetches: DONE. Real numbers.

`scripts/fetch_data.py` replaced with the extended version. Two changes I made to the supplied file:

1. **Kept the `curl` fallback.** The supplied script is urllib-only; this machine's Python has no
   configured SSL trust store and **every** download fails with `CERTIFICATE_VERIFY_FAILED`. Without
   the fallback nothing would have fetched. (It fired on all four runs.)
2. **`tests`/`odis` URLs needed no fix** — both verified HTTP 200 before running. Your naming guess
   was correct.

| Fetch | Scanned | Kept | Filtered (non-full-member) | Filtered (pre-2015) |
|---|---:|---:|---:|---:|
| `tests --full-members-only --since 2015-01-01` | 918 | **484** | 1 | 433 |
| `odis --full-members-only --since 2015-01-01 --merge` | 3,178 | **1,364** | 571 | 1,243 |
| `t20is --full-members-only --since 2015-01-01 --merge` | 5,673 | **1,399** | 3,864 | 410 |
| `ipl --merge` | 1,243 | **1,243** | – | – |
| **Total in `data/raw`** | | **4,490** | | |

**739 MB on disk.** Composition: 2,642 T20 (1,399 T20I + 1,243 IPL), 1,364 ODI, 484 Test.
458 of these are pre-2015 (all IPL — the internationals were date-filtered at fetch, per plan).

Kept locally at `data/raw_all/` and **gitignored** so the next session doesn't re-download 65 MB × 4.
`data/raw/` was restored to the working 45-match set so the repo stays shippable.

### Hard source limit found: Afghanistan is unavailable
Cricsheet **withholds all Afghanistan matches** — 374 of them — as stated on their downloads page:
*"374 matches are currently being withheld… These matches either involve Afghanistan, or took place in
the Afghanistan Premier League."* The fetched data contains **0 Afghanistan matches**. Afghanistan
therefore cannot be curated from this source at all. Not a scoping choice, and not fixable by us
without violating the no-scraping boundary.

---

## Step 2 — ETL Pass A / Pass B: **BLOCKED, deliberately not run**

I ran the existing ETL over a stratified 30-match sample (10 Test / 10 ODI / 10 T20) and measured real
output rather than extrapolating a ratio.

| Format | Avg processed bundle |
|---|---:|
| T20 | 41 KB |
| ODI | 103 KB |
| Test | 317 KB |

Projected across the real 4,490-match population:

- **`matches/` ≈ 0.38 GB** — large but survivable; bundles are fetched one at a time (41–317 KB each).
- **`players/` ≈ 1.30 GB** — **this is the blocker.**

The player dossier schema embeds every delivery a player was involved in
(`dossier["balls"] = {"bat": [...], "bowl": [...]}`). At ~2.2 M deliveries in the full dataset, each
stored twice (once under the batter, once under the bowler), player files dominate everything else. In
the 30-match sample alone, `players/` was already **15.5 MB from 30 matches**, with individual files at
264 KB. Scaled up, a Kohli or Root dossier becomes multi-megabyte — downloaded on a single click.

There is also a **memory risk**: the ETL holds `bat_balls` and `bowl_balls` for the whole dataset in
RAM simultaneously. 2.2 M deliveries × 2 as Python dicts is several GB; a full run would likely swap or
OOM. The 30-match sample took 2.7 s, so runtime itself is fine (~7 min extrapolated) — it's memory and
output size that fail.

**This needs a decision before Pass A runs.** Cheapest high-impact fix, in order:

1. **Stop embedding raw balls in player dossiers** (removes ~1.3 GB on its own). Store aggregates plus
   a list of match IDs; fetch deliveries on demand from the match bundle the user drills into. The
   "show me the balls" drawer already works off match data, so this is mostly deletion.
2. **Tighten the full-detail window.** 2015+ full detail is still 380 MB of match bundles. A tighter
   window (e.g. 2023+ full detail, summary before that) would cut this sharply — this is really your
   Pass A/Pass B split, just with a later cutoff than 2015.
3. Optionally drop stored `wh`/`pm` MODELED coordinates and regenerate them client-side — they are
   deterministic from a per-delivery seed — or store them as compact arrays rather than objects.

I did not pick one of these unilaterally because it changes the product's data model.

**Pass B (pre-2015 summary-only, priority roster) was not started** — it depends on the Pass A schema
decision above, and the pre-2015 fetch (internationals without `--since`) has not been run yet.

---

## Step 3 — Player curation shortlist: PROPOSED, AWAITING YOUR APPROVAL

Derived from the actual fetched data (top run-scorers / wicket-takers per nation across 1,827 matches
involving these teams), not from memory. **Not written to `players_meta.json` yet.**

**Pakistan** — Babar Azam, Mohammad Rizwan, Fakhar Zaman, Azhar Ali, Imam-ul-Haq, Sarfraz Ahmed,
Shaheen Shah Afridi, Hasan Ali, Yasir Shah, Haris Rauf
**Sri Lanka** — Kusal Mendis, Dinesh Chandimal, Angelo Mathews, Dimuth Karunaratne, Dhananjaya de Silva,
Pathum Nissanka, Wanindu Hasaranga, Suranga Lakmal, Rangana Herath, Dushmantha Chameera
**Bangladesh** — Mushfiqur Rahim, Liton Das, Tamim Iqbal, Shakib Al Hasan, Mahmudullah,
Najmul Hossain Shanto, Mehidy Hasan Miraz, Mustafizur Rahman, Taijul Islam
**Zimbabwe** — Sikandar Raza, Sean Williams, Craig Ervine, Brendan Taylor, Hamilton Masakadza,
Blessing Muzarabani, Richard Ngarava, Graeme Cremer
**Ireland** — Paul Stirling, Andrew Balbirnie, Harry Tector, Lorcan Tucker, Gareth Delany,
Mark Adair, Josh Little, Craig Young, Andy McBrine
**Afghanistan** — **cannot be included.** See §1: Cricsheet withholds all Afghanistan data.

India / Australia / England / South Africa / New Zealand / West Indies curation can proceed without
waiting, per your instruction.

---

## Step 4 — Schema check for partial rendering: **DOES NOT SUPPORT IT**

Checked concretely rather than assumed. **The schema assumes complete records.**

- `src/data/types.ts` has **13 optional fields against 199 required** ones.
- The entire `Player` interface is required — including `balls: { bat: Delivery[]; bowl: Delivery[] }`,
  `acceleration`, `innings`, `vsBowlers`.
- `PlayerLab.tsx:158-159` reads `p.balls.bat` / `p.balls.bowl` **unguarded**. A Pass B summary-only
  player — which by definition has no ball detail — would throw
  `Cannot read properties of undefined (reading 'bat')` and blank the entire dossier.
- Several panels call `Object.entries(p.batting.vsType)` / `p.bowling.phase` directly, which throw on
  `undefined` rather than rendering empty.

This is exactly the all-or-nothing failure the partial-render principle forbids. Flagging rather than
patching, because the fix is a schema change plus a guard at every render site:

1. Mark detail-only fields optional (`balls?`, `acceleration?`, `innings?`, `vsBowlers?`).
2. Add an explicit `detail: "full" | "summary"` discriminator per player record.
3. Guard each panel so it renders independently, with an honest "not available for this period" state
   rather than absence-as-blank.

---

## Step 5 — Tests in Match Lab: **DO NOT RENDER SENSIBLY** (confirmed, not assumed)

Loaded a real Test (South Africa v Bangladesh, 2022, won by 332 runs) into Match Lab from the sample
build. Your suspicion was right on every count:

| Problem | Detail |
|---|---|
| **Innings 3 & 4 labelled "(Super Over)"** | My own bug from last session. **FIXED** this session (`0e49123`). |
| **Worm x-axis capped at 20 overs** | Tick labels are hardcoded `[0,5,10,15,20]` while innings ran to 74+ overs. |
| **Only 2 of 4 innings drawn** | The worm is scoped to `innings.slice(0,2)` — silently hides half a Test. |
| **Powerplay / Middle / Death bands on a Test** | Manhattan renders T20 phase bands; meaningless for Tests. |
| **Win probability is nonsense** | Drew a "target 454" line and the replay reported *"NEED 237 off 0 out of balls"* — the model assumes a 120-ball innings. |

Only the Super Over mislabel was fixed here; it was an outright regression and cheap. The rest is
**format-aware feature work**, not a QA patch: the worm, phase bands, win-probability model and replay
scrubber were all built on T20 assumptions (fixed over limit, 2 innings, death overs) and Tests break
every one. **Tests should not be shipped into Match Lab until that is built.**

Practical implication for sequencing: ODIs are a much smaller lift than Tests (2 innings, fixed 300
balls — the model mostly holds with a parameter change), so ODIs could land before Test support exists.

---

## No regressions

Rebuilt and clicked through after all changes: 45 match cards, Match Lab 15 panels / 8 key moments /
scrubber, Player Lab and Team Lab intact, Super Over labels now appear **only** on the actual Super Over
match (0 on the Final), no horizontal overflow at 1280px across all three labs.

## Commits this session

| Commit | Change |
|---|---|
| `3d7fb28` | Extend fetch_data.py: tests/odis, full-member and date filters, merge, curl fallback |
| `0e49123` | Only tag Super Over innings on limited-overs matches |

## ▶️ Next recommended step

**Decide the Pass A storage model before running any full ETL** — specifically item 1 in §2 (stop
embedding raw deliveries in player dossiers). It removes ~1.3 GB of the projected ~1.7 GB on its own,
is mostly deletion rather than new code, and unblocks everything else. Until that lands, a full-dataset
ETL run will either fill the disk or exhaust memory.

Suggested order after that: (a) schema optionality + partial-render guards from §4, (b) ODIs into
Match Lab, (c) Test format support, (d) Pass B pre-2015 fetch and summary rollups.
