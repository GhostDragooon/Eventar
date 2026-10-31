# Email stub-vs-real switch: hand-over (2026-10-25)

Branch `claude/distracted-haibt-18a25a` (worktree `/Users/ivan/Eventar/.claude/worktrees/distracted-haibt-18a25a`). Based on main `20710ed`. **Not pushed.**

| SHA | What |
|---|---|
| `04fdc9c` | `d746d6c` cherry-picked unchanged (diff vs original is index hashes and line offsets only, checked by the dev lens). 13 files, +152/-55. |
| `fb49ac1` | Retry-budget fix on top (my addition, droppable on its own): `lib/email/eventEmails.ts` + new `lib/email/eventEmails.bulk.test.ts`. |

Full evidence: `email-switch-backtest.md` (gates, backtest), `email-switch-dev-lens.md`, `email-switch-user-lens.md` (same folder).

## 0. Ivan's action list

### Decide (recommendation first)
1. **Land `04fdc9c` alone, or with `fb49ac1`?** Recommend both. `04fdc9c` alone has a trap: with no key in production the scheduler writes a `failed` row per recipient per tick; `MAX_SEND_ATTEMPTS` is 3, so after 3 ticks (about 3 minutes at a 1-minute trigger) every recipient is `gaveUp` and adding the key later does not recover the scheduler (only the manual button does). Seen by execution on a production build against the local stack. `fb49ac1` makes the missing key a whole-batch error that writes no ledger rows; next tick with the key sends everyone. Cost: it departs slightly from your 2026-10-14 wording ("callers mark the row failed") for the bulk path; the confirmation path still gets a `failed` row.
2. **The false "stub" copy in production (frontend, I did NOT change any of it).** Root cause: `emailLive()` is a boolean but the switch now has three states (live / dev stub / production-not-configured). Every reader maps "not live" to "development stub". Options: (a) add `emailMode(): 'live'|'stub'|'unconfigured'` and branch each reader (recommended; table below); (b) only hide the dev strip from public attendees and fix the staff strips; (c) leave it until Stage 8, because no deployment exists yet and only `next start` or a Vercel Preview without a key can reach it.
3. **`NODE_ENV === 'production'` as the signal.** It is also true for local `next start` and (per the brief, not checked against vendor docs) Vercel Preview. A Preview with no key used to stub; now it errors. Options: keep (Stage 8 env matrix must put the key on Preview too; `docs/plans/2026-06-04-phase-8-vercel-deploy.md:328` says "Production only"); key on `VERCEL_ENV`; or an explicit opt-in env var.
4. **A failed confirmation email is never re-sent** (only reminder and survey are dispatched, `app/api/cron/dispatch/route.ts:215-217`). In production without a key every registration's confirmation is lost, visibly. The commit message's "retryable" is wrong for it (comment fixed in `fb49ac1`). Do confirmations need a retry path? Stage 8 call.
5. **CLAUDE.md Hard Rule 7 edit (not made).** Line 145 says "Currently unset, so sends are stubbed (console.log) regardless of stage." That is false for any production build. Proposed replacement for the last two sentences: "The stub-vs-real email switch is `emailLive()` + `sendEmail` in `lib/email/eventEmails.ts`, keyed on whether `RESEND_API_KEY` is set, not a phase gate. Key set: real send. Key unset: the dev stub (console.log, row stays `queued`) unless `NODE_ENV=production` (every `next build`/`next start`, Vercel Preview included), where `sendEmail` returns a `resend_not_configured` error, a bulk send returns a whole-batch error, and the caller reports it. `.env.local` has no key, so `next dev` sends stay stubbed."

### Execute (only Ivan)
- Push approval, if wanted, for the exact SHAs above. None was given to this session.

### Queued for Claude (not done, not in scope of "land and review")
- Caller-level tests for the production branch (dev lens Q5): `registerForEvent` with `NODE_ENV=production` and no key gives `emailDelivery:'failed'` and a failed row; cron route `delivery`/`ok` for the unconfigured state. Today only the switch and the bulk guard are pinned; deleting the production branch in `sendEmail` leaves 60 caller tests green.
- Stale text (no behaviour): `.env.example:15-18`, `docs/plans/2026-07-12-execution-plans-index.md:13` (also `2026-07-11-poc-engagement-plan.md:22`, `2026-08-03-post-m2-execution-map.md:70`), `docs/plans/2026-06-04-phase-8-vercel-deploy.md` Task 4 (removal steps for lines that no longer exist), `2026-06-04-phase-7-resend-design.md:54` (no back-link), test header comments in `actions.test.ts:4-7` and `emailActions.test.ts:4`, prop comments in `RegisterCard.tsx:19-22`, `EmailDeliveryStrip.tsx:62-67`, `PassDeliveryPanel.tsx:64-70`, `schema.ts:17-22`. Stage 8 checklist should say "set the key in every NODE_ENV=production environment or sends fail".
- Sweep result for the two remaining `TEMP:` markers (`actions.ts:313`, `eventEmails.ts:342`): legitimate, the stub branch still exists; they stay until the stub is removed.

### Other sessions
- Nothing of theirs touched. `app/dev-preview-uiport/ux-02/` untouched; `:3100` and the main checkout untouched; used `127.0.0.1:3200` (own production build), now stopped.

## Frontend copy: before -> after (proposal only, Ivan decides)
Observed on a production build, no key, signed-in organiser (user lens + my curl). All need the three-state mode to be correct.

| Where | Before (production, no key) | Proposed after |
|---|---|---|
| Attendee success card (`RegisterCard.tsx:167`, `DevEmailStubStrip.tsx`) | Under "We couldn't send email; show this screen to staff.": "Email delivery: development stub (no inbox)." | No strip in `unconfigured` (the failed sentence is already true). |
| Staff dashboard banner (`DevEmailStubBanner.tsx`) | "Email delivery: development stub (no inbox)." beside red "Sends failing ... 9 messages failed" cards | "Email isn't set up on this server (RESEND_API_KEY is unset), so no attendee emails are being sent." |
| Email delivery strip badge + note (`EmailDeliveryStrip.tsx:103-111`) | Badge "stubbed"; "RESEND_API_KEY is unset — new sends will record as stalled. Any sent rows above are historic..." while its table shows `failed 9`, `stalled 0` | Badge "not configured"; "RESEND_API_KEY is unset. New sends fail and are recorded as failed." |
| Pass delivery panel stub branch (`PassDeliveryPanel.tsx:98-112`) | "No email provider is configured, so passes were recorded but never sent. Nothing is wrong with this event." | Only in `stub` mode; in `unconfigured` fall through to the flagged list. |
| Cron response (`route.ts:258`) | `delivery: "stubbed"` next to `ok:false` | `delivery: "unconfigured"` |
| Operator message after "Send reminders now" | With `04fdc9c` only: "Reminders: 3 failed — retrying automatically" (inference from `emailSendSummary.ts`) | With `fb49ac1`, verified by a real click: "Email is not configured on this server (RESEND_API_KEY is unset). Nothing was sent." |

User lens also found things outside this commit, for your product view: the success card still promises "Closer to the event we'll email your personal check-in pass" after a failed confirmation; the "show this screen to staff" proof carries no name or email; the duplicate-email error has no next step; dashboard card says "retry from Details" which cannot work until the key is set; "9 messages failed" is 3 attendees x 3 attempts and is not labelled. Those were not in the diff and are not changed.

## Verified by execution vs inference
Verified by execution: tsc / eslint / vitest / build at `04fdc9c` and again at `fb49ac1` (below); rule 2 order (DB read-back of the confirmation row); production-no-key behaviour on `next start` against the local DB (row `failed`, `resend_not_configured`, action returned `"emailDelivery":"failed"`, cron ticks 1-3 `failed:3`, tick 4 `gaveUp:3`); the same ticks after `fb49ac1` write 0 rows and return the batch error (`ok:false`); manual send returns the error string both over HTTP and via a real pointer click (confirm dialog "Send to 3", then the message); regression test fails 2 of 3 on the unguarded code and passes with the guard; the user lens's "Send reminders now shows nothing" was my tooling: the button opens a confirm dialog first.
Gates `fb49ac1`: tsc exit 0; eslint 0 errors, 11 warnings; vitest 209 files passed + 51 skipped, 1842 passed + 544 skipped (the 544 are RLS-gated, `RLS_TESTS` unset, no SQL in this change); `next build` exit 0.
Inference only: behaviour with a real key (unit tests with mocked senders; no real send was attempted); the DB partial dedup index in the dev lens's repro (modelled from comments, but my backtest hit the real index and agrees); Vercel Preview `NODE_ENV`.
Coverage gaps: user lens did not reach the event A details page, mobile, or its own sign-out (PARTIAL, 50 of 50 calls); I retested its one open item. The staff shell offered no Sign out control for this fixture, so the session was ended by deleting the disposable auth user.

## Side effects and cleanup (local stack only)
- The cron tick is not scoped to fixtures: first backtest run wrote 138 `failed` survey rows for 18 unrelated local seed events. Deleted. `email_log` is back to its original 27 rows; fixtures (`ZZ-EMAILSW` org, staff, 2 events, 5 registrations, auth user) deleted; leftover count events/staff/orgs/auth/registrations = 0; audit rows mentioning the fixture = 0.
- Scratch credentials and cookie files deleted; gate and backtest worktrees removed; test-rls lock released by trap; `:3200` stopped.
- A real production-mode run of the cron against a shared local DB is a trap for any peer testing survey sends; the guard in `fb49ac1` removes the write side of it.
