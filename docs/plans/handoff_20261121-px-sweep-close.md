# Handoff 2026-11-21: px-to-relative-units sweep closed, phone bottom nav, `c6383eb`

Prior handoff: `handoff_20261121-px-sweep-form-fixes.md` (Batches 0 and 1, pushed as `12e9c79`). Plan: `docs/plans/2026-11-21-px-to-relative-units-sweep.md`.

## §0 Ivan's action list

**Decide (recommendation first)**
1. **Push `c6383eb`?** Local only, one commit (137 files). Recommend yes after you look at `/events` and `/` once. Say "push c6383eb".
2. **Mobile text-size findings** from the user-lens review (Live-chip and title wrapping, others). You said not to spend time on mobile; they stay unfixed. Recommend leave.
3. **Signed-in backtest and staff-page renders** were not run (local `supabase status` was unhealthy earlier; `test:rls` itself passes). Recommend run before deploy, not before push.

**Execute (only you):** open `/` and `/events` at phone width in your own browser; confirm the bottom nav and top logo.

**Queued for Claude**
1. `LandingNav.tsx:27` `calc(100%-30px)` to rem.
2. Poster page keeps px on purpose (print layout); no action unless you rule otherwise.
3. Unchanged: items in `PROJECT_STATE.md` "Waiting on Ivan"; deploy PAUSED.

**Other sessions:** none seen by `ListAgents`. Left unstaged: `graphify-out/`, `.claude/skills/` edits and deletions, `app/dev-preview-uiport/{styling,typography}/`, root `GATES.md`, `docs/plans/2026-11-05-db-cleanup-dependency-map.md`.

---

## What changed (measured)
- Radii: `--radius-card` 1.25rem, `--radius-control` 0.75rem; `cn()` registers both; zero computed-radius diffs on 8 route and width pairs.
- Batches 3 to 5: spacing, sizes, `globals.css` px to rem (exact px/16); zero visible diffs at a 16px root. Borders, 1px hairlines, blur, shadow stay px.
- Batch 4 needed no hero edit: full-screen sections already use `min-h-dvh`.
- Phone nav (Ivan's call): logo on top, nav in a fixed bottom pill (`SiteNav.tsx`); shells add `max-sm:pb-[5rem]`.
- Nav scrollbar line fixed (`overflow-y-hidden`, hidden scrollbar), reproduced by simulation.
- Audience toggle thumb `calc(50%-0.1875rem)`.
- Rule saved system-wide: every frontend edit ships with rendered before and after frames.
- Ratchet: `check:ui-units` baseline 346 to 157.

## Gates at `c6383eb`
tsc 0; eslint 0 errors, 11 warnings; `check:ui-colours` pass; `check:ui-units` 157 = baseline; vitest 2257 passed (664 skipped without `RLS_TESTS=1`); `test:rls` 52 files 564 tests + 5 files 57 tests; `next build` exit 0, 50 routes (run one after the other). Dev-lens and user-lens reviews ran. `SignOutAction` load flake now in `docs/DEFERRED.md`.

Closing: repo graph done (2026-11-21) · vault note done (20 — Roadmap/px-to-rem Sweep + Phone Bottom Nav (2026-11-21).md) · vault graph done (2026-11-21)
