# Handoff, 2026-11-01: CX-04R built to your picks (1f + 2a), reviews and live backtest done; a few frontend proposals wait on you; main not pushed

**Date:** 2026-11-01
**Status:** DONE for the build; OPEN proposals in §0 Decide
**Bead(s):** none (`bd` is not installed here)
**Epic:** MVP execution plan, `docs/plans/2026-10-11-mvp-execution-plan.md`
**Chain:** `mvp-execution` seq `7`
**Parent:** `handoff_20261031-mvp-execution-6.md`
**Prior chain:** `handoff_20261023-mvp-execution.md` > `-2` > `-3` > `handoff_20261031-mvp-execution-4.md` > `-5` > `-6` > this

Evidence tags: [X] executed this session, [R] read in code or docs, [I] inferred.

---

## 0. Ivan's action list

**Decide** (items 1 to 6 below were shown and APPLIED on 2026-11-01 at your word, in `cf9a2e1` (1 to 4, 6) and `f587bf6` (5); only item 7 is still open. Side finding: the `eventar-tz` cookie lost its only writer when DashboardWorkstation stopped rendering in `3e94ee6`, so `organiserTz` in `lib/tz.ts` now has no caller and `lib/tz.test.ts` pins dead code. Left for your call.)
1. **Tab semantics** (dev review M3). The tabs have `role="tab"` and `aria-selected` but no `tabpanel`, arrow keys or roving focus, and read as "Active2" to a screen reader. Options: complete the pattern; or make them plain filter buttons (`aria-pressed`); either way add a hidden ", " before the count. Recommend plain filter buttons: smaller, and a list filter is not a tab panel.
2. **Honest caps.** (a) History silently stops at 100 completed events: add "Showing the newest 100." when it hits 100 (rule 12). (b) The Events footer "Showing your newest 300 events" appears even when 16 rows show, because completed events use fetch slots but have no tab. Best fix: leave completed rows out of that fetch; else reword to "Only the newest 300 events by date were loaded, finished ones included." Recommend both, one small change each.
3. **Small copy** from the user-lens walk: "Finished events are in History." becomes a link; the empty search says which tab it searched; the Cancel dialog says whether registrants are emailed; the Delete dialog names the event. The last two dialogs predate this card; recommend doing all four together.
4. **Check-in on cancelled events** is refused the same way as on drafts [R: `checkInGateMessage`]; you removed it for drafts only. Recommend removing it there too.
5. **`DashboardWorkstation.tsx` is unused** (nothing renders it since the Events home). It holds all 5 `check:ui-colours` hits outside the auth backdrop and 2 of the 7 `check:ui-primitives` hits, plus the old "Programme" copy and a link to `/dashboard/manage`. Dead helpers behind it: `countCreditsIssued`, and `registered7d` and `checkedInToday` still computed per render. Proposal: replace it with nothing, in one cleanup commit with its test. Not deleted without your word.
6. **CSV export** writes titles as typed, so a title starting with `=`, `+`, `-` or `@` opens as a formula in Excel. Predates this card. Recommend prefixing such cells with `'`.
7. **Carried:** seq 6 Decide 3 and 4 (em-dash copy and hex gradient in `AuthBackdropCard`, desktop card position), the "Admin" caption above Settings, phone navigation (the strip clips Settings at 375 px; own round), seq 5 Decide 3, 4 and 6.

**Execute** (only Ivan can)
1. Push: reply "push main up to <sha>" with the SHA in this session's last message. Nothing is pushed.
2. Hosted migrations and the dev-3100 lock: unchanged.

**Queued for Claude:** UX-02 re-cut, then the remaining door copy. Item 5 above after your word.

**Other sessions:** none running. The dev and user-lens reviewers were subagents of this session and are finished.

---

## What was built [X unless tagged]

- **Sidebar:** Check-in, Events, History, Settings (`components/shell/StaffShell.tsx`). Test asserts exactly four links, none to the public `/events`, and lights History on `/events/<id>/analytics` and Settings on `/settings/team`.
- **Events home** (`components/dashboard/EventsHome.tsx`, from ManageWorkstation): tabs Active, Drafts, Cancelled, Deleted with counts (Deleted hidden at 0); completed events belong to History; search and sort; 1f cards with the tick box outside the card on every event in the organisation; bulk Export, Delete, Cancel (Active only), Restore with the existing 7-second cancel undo; the bulk bar rises in 180 ms (2a), nothing else moves. After the user-lens walk: `?tab=` opens that tab and clicks keep the address in step; Needs attention shows 3 rows and folds the rest; the date block shows the month (year when not this year); a draft has Details and Edit only.
- **`/dashboard/manage`** redirects to `/dashboard` and carries the query string.
- **History** (`/analytics`): renamed; the completed cut is now in the query ahead of the limit. The new test passes with the old code too (the fake ignores limits), so it does not prove the bug fix; the fix is by reading.
- **Programme to Events** in 4 breadcrumbs, 5 back labels, `error.tsx`, the public-shell pill, the publish dialog; listed tests updated.
- **Removed from the card, per the 1f specimen:** per-card Delete and the per-card Analytics link.
- **Kept, not in your picks:** the Needs attention feed (failing sends, live now, registration closing). The stat row, calendar and org-name header went.

## Corrections

- **My CX-04R card said the bulk RPC only changes events the actor created. That was wrong:** the live function is org-scoped (`20260910000000_authority_sweep_org_scope.sql` section 13d; `pg_get_functiondef` on the local DB [X]). Your 2026-10-31 pick "tick only on events you created" rested on it, so you replaced it on 2026-11-01: every org event has a tick box. The card and `PICKS.md` are corrected.
- A first live check crashed `/dashboard?tab=drafts`: a constant exported from a client component is a client reference in a server component. Fixed by moving it to `components/dashboard/eventTabs.ts`. Unit tests and tsc did not catch it; only the live page did.

## Checks

| Check | Result |
|---|---|
| Tip gate on `b78190b` | tsc 0; eslint 0 errors, 11 warnings; next build 0; vitest 259 of 260 files, 2410 of 2411 tests |
| The one failure | `tests/rls/registrations_link_immutability.rls.test.ts`: `deadlock detected` in a grant and policy probe. Rerun alone twice: 10 of 10 each time. Treated as a flake under peer DB load, not a pass |
| `check:ui-colours` | 3 hits, all in `AuthBackdropCard` (the 2 in the deleted `DashboardWorkstation` are gone, `f587bf6`) |
| `check:ui-primitives` | 7 hits, unchanged |
| Dev review | one HIGH (the RPC premise, now fixed), M1 and M2 fixed, M3 to M5 and L1 proposed above |
| User-lens walk | 14 findings; 4 answered by you, 1 not a finding (the tick box is 44 px), the rest in Decide |
| Backtest, real write [X] | Ticked fixture draft `UX-03 Body Draft`, bulk Delete: `deleted_at` set, audit `event_soft_deleted` (chain 83970). Restore from the Deleted tab: `deleted_at` null again, audit `event_restored` (83972). Fixture back to its original state |
| Not checked | Dark mode of the new cards and phone frames of the built page; a non-`eventar_staff` viewer live (review mode is `eventar_staff`); the History query against `status = completed` rows with a future end (none exist) |

## Commits (local, not pushed)

`3e94ee6` build, `1ffec16` follow-ups, `b78190b` tick rule; this handoff on top.
