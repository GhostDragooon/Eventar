---
name: eventar-timezone-correctness
description: Use when editing Eventar date, timezone, or "today" logic.
category: verification
---

# Eventar timezone: "today" follows the organiser, never HKT or the server

Eventar is not Hong Kong only. Day boundaries, "today" counts and day headings use the organiser's location (Ivan, 2026-10-16). Never hard-code HKT. Never use server-local time: Vercel runs UTC.

- Zone source is the `eventar-tz` cookie. Validate it with `Intl.DateTimeFormat`, fall back to UTC on an invalid value. A cold request renders in UTC, then the client refreshes once.
- Pass an explicit `timeZone` to every `Intl` or `toLocale*` call. On the server, `getDate()`, `setHours()` or `new Date(y, m, d)` for day boundaries is a bug on a UTC host.
- Group agenda rows by each event's own local date (`dayKey`). Sort by `dayKey`, then start time, in both Upcoming and Past. Sorting by absolute start time alone puts a later day above an earlier one when events sit in different zones.
- When rows mix zones, the caption must say times are each event's local time.
- Tests set the zone inside the test with `vi.stubEnv('TZ', ...)`; vitest's forks pool honours it. Prove the test fails on the old logic first (see `regression-test-must-fail-first`).
- A test whose fixture uses the real "today" at a fixed hour flips once the suite runs past that hour. Example: a 09:00 start turns a check-in sentence from "opens at" to "is open now" after 08:00. Pin only the Date: `vi.useFakeTimers({ toFake: ['Date'], now: new Date(y, m, d, 6) })` in `beforeEach`, `vi.useRealTimers()` in `afterEach`. Leave timers real so `waitFor` still works. Keep the exact regex. Do not loosen it to accept both branches.
- Live checks: follow `eventar-live-verify-worktree` for the TZ=UTC server and the Playwright zone context.
- `fetchDecoratedEvents(supabase, nowMs, staff, tz)` takes the organiser zone as its 4th argument. `app/dashboard/page.tsx` and `app/dashboard/manage/page.tsx` pass it (`organiserTz(eventar-tz cookie)`). Batch tests in `app/dashboard/data.test.ts` must pass it too. Find every caller with `git grep -n "fetchDecoratedEvents(" -- app components lib tests`, not `rtk rg`. A ported commit that adds this arg is incomplete until all callers and tests pass it.
- Verify a zone fix on a TZ=UTC server, one organiser zone per browser run (CDP `Emulation.setTimezoneOverride`, reset to `''` after). Seed check-ins at several hours of one local day, for example 02:00, 10:00 and 15:00 HKT, and write each organiser's expected count down before you look. A count that is identical across zones means the boundary is still server-anchored: main showed 2 for both Hong Kong and New York because it counted from 00:00 UTC, which is 08:00 HKT.
- A copy change (header label, caption) goes in its own commit on top of the root-cause fix, so Ivan can drop or rewrite the copy without touching the fix.
- Vault reference: `10 — Architecture/Timezone Handling.md`.
