# CricLens — QA & Polish Pass

**Date:** 2026-09-04 · **Live:** https://cricastra.netlify.app/ · **Repo:** sujaybhat786/Cricket-Lens
**Scope:** hardening only. No new features were built. New-feature ideas are listed at the bottom.

**Final Lighthouse (desktop, live): Performance 99 · Accessibility 100 · Best Practices 100**
FCP 0.6s · LCP 0.6s · TBT 0ms · CLS 0.016 — the spec's bar was ≥85 performance.

---

## 1. Attribution — PASSED, no change needed

Verified rendering in the live DOM (not just the README). The footer carries:

- "Data: Cricsheet (open data)" with a working link to https://cricsheet.org/
- The ODC-By licence line verbatim
- "Wagon wheels & pitch maps are statistical reconstructions, not ball-tracking…"
- The win-probability method, and a note that handedness/bowler types are hand-curated

---

## 2. Responsive / mobile — 3 issues found, all fixed

Tested at 375 / 768 / desktop in both engines.

| Issue | Status |
|---|---|
| **Horizontal overflow at every viewport** — `.panel` is a grid item (default `min-width:auto`), so the Key Moments Reel's ~2000px of cards expanded its grid track to 2048px instead of scrolling. This stretched every sibling chart (worm SVG rendered at 2002px) and gave the whole page horizontal scroll. **A regression I introduced last session.** | Fixed `b56adba` |
| **Replay scrubber had a 4px-tall hit area** — unusable on touch. Now a 32px target with a 22px thumb on coarse pointers. | Fixed `b56adba` |
| **Wide charts unreadable on phones** — the 920px-viewBox worm/Manhattan/momentum scaled into 375px rendered axis labels at ~3px. They now hold a 540px minimum and the panel pans. | Fixed `b56adba` |

Tablet (768px) was clean throughout: single-column grid, rail nav present, matrix and reel scroll correctly.

---

## 3. Dataset edge cases — 1 real bug found and fixed

Scanned all 45 matches programmatically. 38 have some non-standard condition; almost all are ordinary
(a chase won early). The genuinely unusual ones:

**Super Over — KKR v LSG, 2026-04-26 (the only tied match).** Three separate problems, all fixed in `22fd0ab`:

1. It read as just **"Tie"** with no winner. Cricsheet records the Super Over winner under
   `outcome.eliminator`, not `outcome.winner`. Now reads *"Match tied — Kolkata Knight Riders won the
   Super Over."*
2. Its 3rd/4th innings produced **duplicate, ambiguous panel titles** ("Partnerships — Lucknow Super
   Giants" twice). Super Over innings are now labelled `(Super Over)`.
3. The innings win-probability model was being applied to a **1-over shootout** — the replay scrubber
   ended on a 1-ball "innings" reporting a run rate of **24.00**, and key moments could be drawn from
   it. The worm, scrubber and key-moment extraction are now scoped to the two main innings; the Super
   Over still appears in the header and in its own labelled panels.

**Verified as already correct (no change needed):**
- **D/L match** (LSG v RCB, revised to 19 overs): shows "won by 9 runs (D/L)"; replay terminates at the
  revised 19-over mark with the correct target maths.
- **Team all out / blowout** (DC 75 all out, chased in 6.3 overs): worm terminates correctly, replay
  ends at "Target reached".
- **Short matches still produce 8 key moments** — the cap is one per over, and even short innings have
  enough overs.
- No abandoned/no-result matches in the dataset other than the tie above.

---

## 4. Performance — passed comfortably, one fix

Performance was already 98 before this pass and is now **99**. No rework needed. The only remaining
opportunities are Netlify cold-start server response (~630ms, not in our control) and ~80KB of unused JS
(d3/framer tree-shaking) — both left alone deliberately as low-value/high-risk relative to a 99 score.

---

## 5. Visual critique against the "epic UI" bar — honest assessment

**Fixed:**
- **The loading state was genuinely unstyled** — raw mono text "loading CricLens…" on black. That
  undercut the whole first impression. Replaced with a branded mark and an animated progress bar (`b56adba`).
- **Small labels failed contrast** — `--ink-3` was 3.76:1, and after a first (insufficient) lift still
  4.35:1 on panel surfaces. Now `#78869c`: 5.24 on page, 4.96 on panel, 4.82 on panel-solid (`b56adba`, `d4b94ee`).
- Scrubber lacked a `grabbing` cursor while dragging (`b56adba`).

**Flagged, not fixed — these need design work, not a QA patch:**
- **Typography is competent-but-generic more than broadcast-grade.** Archivo 800 + the green glow gives
  the wordmark presence, but panel titles, body copy and stat labels are a conventional dark-dashboard
  hierarchy. A broadcast package would differentiate the hero numbers far more aggressively (unit
  treatment, baseline rules, per-metric weighting) rather than rendering 45 / 188 / 10 / 10278 at
  identical weight and colour. This is a type-system decision, not a spacing tweak.
- **Hero has a large empty band above the fold** (~250px on a 930px viewport). It looks like dead space
  rather than cinematic negative space. I did **not** change it because the original spec explicitly
  asked for "full-viewport section landings" — reducing it would violate a stated requirement. Worth an
  explicit design decision.
- **The "stadium light" background wash is so subtle it effectively doesn't read.** Near the top the
  page is flat black. Strengthening it is a design call.
- **Mobile charts pan rather than simplify.** The spec said "mobile gets stacked simplified charts". The
  cheap fix keeps them legible via horizontal panning; genuinely *simplified* mobile variants (fewer
  ticks, condensed axes, reduced series) are real chart rework.
- **The pitch map has no glow treatment on wicket markers** while the wagon wheel does on sixes —
  a small inconsistency in the hero-visual language.

---

## 6. Cross-browser — 1 Safari-only bug found and fixed

All prior verification in this project had been Chromium-only. Ran the live site through **WebKit
(Safari's engine)** via Playwright at all three breakpoints.

**Found:** the filter bar overflowed a 375px viewport (439px of content) **in Safari only** — WebKit gives
`<select>` a larger intrinsic minimum width than Blink, and `.filter-group` neither wrapped nor let its
children shrink. Fixed in `e6d9965`.

**Final WebKit result:** desktop / tablet / mobile all with `overflow=false`, 3 labs, 15 panels, 8 key
moments, 32px scrubber target, attribution present, **zero console errors**.

---

## Commits (all pushed, all deployed and verified live)

| Commit | Change |
|---|---|
| `22fd0ab` | Handle Super Over matches correctly |
| `b56adba` | QA polish: overflow regression, touch targets, contrast, loading state |
| `e6d9965` | Fix Safari-only filter-bar overflow on narrow screens |
| `d4b94ee` | Raise `--ink-3` again to clear WCAG AA on panel surfaces |

## Post-fix verification (live, final build)

- **Chromium:** Match Lab 15 panels / 8 moments / scrubber / Pre-Match Report; **cross-filtering still
  works**; Player Lab and Team Lab (Squad DNA, Phase Dominance, Best XI, Conditions Fit, Head to Head)
  all intact; no page overflow.
- **WebKit:** clean at 375 / 768 / desktop, zero console errors.
- **Lighthouse:** 99 / 100 / 100.

## Noted for later — NOT built this session (out of scope by instruction)

- Virtual XI builder and merch shelf (from the wider backlog).
- Genuinely simplified mobile chart variants (see §5).
- A typography/hero pass to push from "good dark dashboard" to "broadcast package" (see §5).
- `CountUp` renders `0` in local dev/preview but is correct in production — a latent StrictMode-ish
  quirk that makes local visual QA misleading. Harmless live; worth fixing for developer sanity.
