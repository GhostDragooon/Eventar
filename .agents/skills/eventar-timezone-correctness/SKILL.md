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
- Live checks: follow `eventar-live-verify-worktree` for the TZ=UTC server and the Playwright zone context.
- Vault reference: `10 — Architecture/Timezone Handling.md`.
