# Handoff 2026-11-21: coherence plan Batches 3-5, one landing login pill, sign-out option 3, Step 6 IDOR checks

Prior handoffs: `handoff_20261121-px-sweep-form-fixes.md`, `handoff_20261121-px-sweep-close.md`. Plan: `docs/plans/2026-11-19-coherence-and-ui-guides-plan.md`.

## §0 Ivan's action list

**STATUS 2026-11-21:** pushed `a47b860`, `0af48cd`, `84dd2dd`, `96488b1`. The close edits below (text-trim merge fix, tests, comments, specimen deletion, this handoff) are committed after `96488b1` in the close commit.

**Decide (recommendation first)**
1. **Roster error toast dwell.** You chose the shared toast (option B). It dismisses errors at 4.5 s, with no shake and the dark pill; the old desk toast held errors 8 s and shook. Recommend: add an optional duration to `toast()` and keep errors at 8 s on the check-in desk. Say "keep 4.5 s" to accept the change as is. Needs before and after renders.
2. **Organiser hero card on `/`.** In Organiser mode the hero card still shows the practitioner record ("Your Eventar record", "SAMPLE") and the hero has no organiser action. User-lens finding, not from these commits. Recommend: an organiser card (events, attendance, points issued).
3. **375 px tap targets under 44 px** (user-lens): "Log in" pill 33 px, bottom-nav items 34 px, landing toggle 38 px, "Sign up" CTA 38 px, footer links 19 px, inline sign-in/sign-up links 18 px. Pre-existing. Recommend: one tap-44 pass with renders.
4. **`/login` dead end:** "No access? Contact an admin." gives no contact route.
5. **Other public pages** (`/events`, `/account/sign-in`, `/login`, 404) still show both "Organiser log in" and the "Log in" pill. Locked rule covers the landing only. Say if you want one pill there too.
6. **Local fixture titles** on `/events` ("F1-F5 Fixture ...", "DELETE ME"): local data only. Clean the local DB before any demo.

**Execute (only you):** nothing blocks Claude. Push of the close commit is done only with your go.

**Queued for Claude**
1. Duplicate "See how it works" links in both landing tab panels: check the hidden panel is out of the tab order (user-lens finding 5).
2. Landing `AudienceExperience.tsx` and `LandingHero.tsx:26` comments still say they hold the toggle; they read `AudienceContext` now.
3. Unchanged: px baseline is 152 (limit 156); the plan's later batches and `PROJECT_STATE.md` "Waiting on Ivan".

**Other sessions:** peer "pick up from handoff and continue" idle. Their files stay unstaged: `docs/plans/2026-11-05-db-cleanup-dependency-map.md`, repo-root `GATES.md`, `app/dev-preview-uiport/{...}` leftovers, `.claude/skills/*` edits, `graphify-out/` scratch.

---

## What shipped (all gated)

- Row 3 status colours (OKLCH-matched containers); stepped heading tokens in rem (`--text-hero-step`, `--text-headline-lg-step`); `.text-trim` on buttons, status pills, event chips.
- Landing: one login pill follows the Attendee/Organiser toggle (`AudienceContext`, `LandingNav`, `SiteNav loginLabel`); the hero repeats no login.
- Batch 3: rows 3, 4 and 5 were already in code (edit dialog, error and 404 buttons, "+ More" menu). Row 6: check-in desk uses the shared toast; a toast with a Log in action persists.
- Batch 4: eight outlier page headings now `headline-lg`; card outliers now `rounded-card` (20 px); `shadow-sm` is the rule for 20 px cards (the majority already had it; Ivan did not pick, recommend kept).
- Batch 5: `EmptyState` on Registrations, roster, Participants; one inline-error recipe on Team, Participants, invite; breadcrumb, stepper and events-nav gaps to spacing tokens.
- Sign-out option 3: `lib/signOut.ts` gains `revokeSession()`; `signOutAndLeave` accepts `/login?next=…`; `/login` keeps its in-page swap; the invite page hard-navigates.
- Close fix: `lib/utils.ts` registers `text-trim` as its own tailwind-merge group. Before this, `cn()` evicted `text-trim` from Button whenever a text colour followed it (default, link, destructive variants), found by the dev-lens review and proven by execution; the live "Next" button now carries the class.
- Specimen routes `app/dev-preview-uiport/{styling,typography,motion,batch3}` deleted.

## Phase-completion checks

| Check | Result |
|---|---|
| Static gates | tsc 0 errors; eslint 0 errors, 11 old warnings; vitest 2261 pass, 61 skipped; `next build` compiled; `check:ui-units` 152 of 156; `check:ui-colours` pass |
| `pnpm test:rls` (local stack, env exported from `supabase status`) | 52 files, 564 tests pass; second command 5 files, 57 tests pass. First two runs failed on timeouts only (hook 10 s, P99 2.9 s, chain statement timeout) while two review agents ran; rerun alone was clean |
| Dev-lens review (separate agent) | 1 HIGH (text-trim eviction, fixed), 2 MEDIUM (toast dwell: decision 1; pill width at 375 px: measured 127 px in a 345 px nav, no overflow), 4 LOW (spacing values changed: approved in the artifact; test cleanup, stale comments, signOut tests: fixed). No open redirect: `/login` cleans `next` through `safeNextPath` |
| User-lens review (separate agent) | no blockers; findings 1, 2, 5, 6, 8 are not from these commits (decisions 2, 3, 4, 6; queued 1). Finding 3 (plural label) is a false positive: the visible text holds both short and long labels |
| Backtest, Step 6 IDOR, local stack, real sessions | `exportRegistrantsCsv` cross-org refused, own org returns CSV; `updateEvent` cross-org refused and victim draft unchanged, own org passes the gate; `deleteMyAppointment` another user's row survives, own row deleted. Fixtures removed, `audit_events` unchanged at 101463. Script: scratchpad `idor.cjs` |

Not verified: a signed-in organiser walk of the new empty states and the roster toast in the live app; dark mode at 1280 px for Batches 4 and 5. The roster toast and empty states are covered by vitest and typecheck only.

## Sign-off

Vault graph note: a plain `graphify update` on the vault rebuilt it from markdown structure alone and dropped the curated semantic edges (1579 to 1058, god nodes changed). I restored the backup and merged the new note by `build_merge` plus `graphify cluster-only` instead (920 nodes, 1585 edges, 67 communities). Do not run bare `graphify update` on the vault; use `/graphify <vault> --update`.


Closing: repo graph done (2026-11-21) · vault note done (/Users/ivan/Desktop/Eventar/20 — Roadmap/Coherence Batches 3-5 + Landing Pill + Sign-out (2026-11-21).md) · vault graph done (2026-11-21)
