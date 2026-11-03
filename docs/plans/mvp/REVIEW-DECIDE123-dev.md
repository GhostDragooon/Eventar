# Review Decide 1/2/3: dev lens, backtest, orchestrator walk (2026-11-04)

Scope: commit `6799639` (Decide 1, licence optional) plus the uncommitted speaker window (Decide 2, option A) and consent wording (Decide 3).
Tags: [X] executed, [R] read. Dev lens = `everything-claude-code:code-reviewer` (read-only; it could not write this file, so the orchestrator saved its table).

**Dev lens counts: 0 BLOCKER, 2 MAJOR, 6 MINOR, 6 NIT.** Its own gates [X]: vitest 31 files / 411 tests, tsc exit 0, eslint exit 0 on 17 files.

| # | Sev | Where | Finding | Status |
|---|---|---|---|---|
| M1 | MAJOR | `LicenceBanner.tsx`, `CompleteClient.tsx` step 4 hint | Copy says credit is released once a licence is declared. Credit is worked out only at check-in (`checkin/actions.ts`, `(public)/checkin/confirm/actions.ts` via `lib/cpd/awardAttendanceCredit.ts`); the only trigger on `practitioner_licences` is `touch_updated_at` [X orchestrator re-check]. An event attended before the licence gets `skipped:no_licence` and is never re-awarded. | OPEN, Ivan: (a) copy "only for events you check in to after you declare a licence" (recommended), (b) re-award on declare (kernel, Decisions Log), (c) gate the pass on a licence |
| M2 | MAJOR | `CompleteClient.tsx` Done | Done is always enabled, so a typed body and number are dropped without a message if the user clicks Done instead of Declare licence; Done also stays enabled while a declare is pending. [R] | OPEN, frontend: diff shown to Ivan |
| m1 | MINOR | `speakerActions.ts` | Window enforced only in the server action; `speaker_checkins` policies do not check the clock [X, DB]. Low impact (no credit). | OPEN, Ivan: DB trigger or accept (now documented in the doc comment) |
| m2 | MINOR | `speakerActions.ts` | Clearing a tick is refused outside the window, so a wrong tick cannot be corrected after the end. | OPEN, Ivan (same as user-lens MAJOR 2) |
| m3 | MINOR | `lib/accountCompleteness.ts` | Comment mis-numbered the gate (F4 is the per-body licence, F5 is registration linked). | FIXED (comment) |
| m4 | MINOR | `complete/page.tsx`, `page.test.tsx` | Stale "declaring the licence flips completeness" comments. | FIXED (comments) |
| m5 | MINOR | `complete/page.tsx` ladder | Step ladder ignores `emailConfirmed`; with email unconfirmed, Done now loops to the wizard for everyone (already did for licence holders). Local config has confirmations off, so not reproducible here; hosted setting unknown [inference]. | OPEN, Ivan |
| m6 | MINOR | `CompleteClient.tsx`, `legalVersions.ts` | Consent copy is tied to draft version strings; publishing the real documents must bump both and reword step 1. | FIXED (comment in `legalVersions.ts`) |
| n1 | NIT | `speakerActions.ts` | Multi-occurrence events use the whole span, not each occurrence window. | FIXED (doc note) |
| n2 to n6 | NIT | various | 30 s desk tick lag (fails visibly), "no licence is declared" reads wrong for a lapsed licence (n3, copy), banner role=status matches ClaimBanner, status cast, no end-instant speaker test. | n3 goes with M1 copy; rest left |

Checked and fine [R unless marked]: `requireStaff` first, role gate before reads, no PII in logs, no em-dashes in new copy; every `.complete` consumer agrees; speaker window equals `mark_attended` (end inclusive for single occurrence).

## Backtest, real `toggleSpeakerCheckin` over HTTP on :3100 [X]

Disposable ZZ-BT fixtures, session cookie via password sign-in, DB read-back after each call; all fixtures deleted (0 events, 0 staff, 0 auth users, 0 rows left).

| Case | Result | Row written |
|---|---|---|
| inside: tick then untick | ok, ok | yes then cleared |
| 59 min before start | ok | yes |
| 61 min before start | "Check-in has not opened yet. It opens 60 minutes before the event starts." | no |
| 31 days early | same | no |
| ended 1 h ago | "Check-in is closed. This event has ended." | no |
| ended, pre-ticked, try to clear | same closed message | unchanged |
| draft / cancelled | "Publish the event before checking people in." / "This event was cancelled. Check-in is closed." | no |
| other organisation's staff | "You do not have access to this event." (RLS 42501) | no |
| signed out | 307 | no |

## Orchestrator live walk of the Speakers card [X] (the user-lens agent stopped at its cap)

INSIDE: six buttons enabled; real click ticked Speaker B ("Checked in at 04 Nov 2026, 05:38", count 2/6, DB `updated_by` = ux-admin staff id). Stale page moved to AFTER by SQL, click: server refused "Check-in is closed. This event has ended.", button rolled back. AFTER, fresh load: six disabled, `aria-describedby` set. Not walked live: `body_admin` (role gate unchanged, unit-tested). Fixture restored (Speaker A only, window AFTER).
User-lens report: `REVIEW-DECIDE2-user.md` (MAJOR: the reason sentence sits above the Scan badge, about 150 px above the card; MAJOR: product consequence of option A, early speakers and post-event corrections have no path).
