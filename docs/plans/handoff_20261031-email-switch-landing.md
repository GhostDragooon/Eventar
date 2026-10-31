# Handoff 2026-10-31: landing the email stub-vs-real switch

Session "Land the email stub-vs-real switch" (work 2026-10-25, push 2026-10-31). Takes the unlanded `d746d6c` from `claude/competent-shannon-e8517e`, brings it onto current main, reviews it with separate dev and user lenses, backtests it on the local stack, and fixes the one backend defect the reviews confirmed. Evidence tables and before/after copy are in [mvp/EMAIL-SWITCH-HANDOVER.md](mvp/EMAIL-SWITCH-HANDOVER.md); this file is the current state and the action list.

## State

| Item | Value |
|---|---|
| Branch | `claude/distracted-haibt-18a25a`, **pushed to origin 2026-10-31** (Ivan: "Push both"). Remote head `fb49ac1`. Not merged into main. |
| `04fdc9c` | `d746d6c` cherry-picked unchanged (13 files, +152/-55). |
| `fb49ac1` | Retry-budget fix on top, droppable on its own: `lib/email/eventEmails.ts` plus `lib/email/eventEmails.bulk.test.ts`. |
| Merge with main | `git merge-tree` against main `757a7e8` (5 commits ahead of the branch base `20710ed`): clean. |
| Gates on the merged tree (unreferenced temp merge commit `06c287a`) | tsc exit 0; eslint 0 errors, 11 warnings; vitest 209 files passed, 1855 passed, 544 skipped; `next build` exit 0. Run with the local stack DOWN (Docker was not running) and placeholder env, so nothing here touched a database; every non-RLS test passed without one. |
| Gates on the branch alone (`fb49ac1`, 2026-10-25, stack up) | tsc 0; eslint 0 errors, 11 warnings; vitest 1842 passed, 544 skipped; build exit 0. |

`mvp/EMAIL-SWITCH-HANDOVER.md` on main still says "Not pushed" and "None was given to this session". Both are stale as of today.

## §0 Ivan's action list

### Decide (recommendation first)
1. **Merge both commits into main.** Recommend yes, both. `04fdc9c` alone leaves a trap: with no key in production the scheduler spends its 3-attempt budget in 3 ticks and never recovers after the key is set (seen by execution). `fb49ac1` removes it. The alternative is `04fdc9c` only.
2. **False "development stub" copy in production** (frontend, untouched; before/after table in `mvp/EMAIL-SWITCH-HANDOVER.md`). Options: (a) add `emailMode(): 'live' | 'stub' | 'unconfigured'` and branch each reader (recommended); (b) hide the dev strip from public attendees only and fix the staff strips; (c) leave it until Stage 8, since no deployment exists and only `next start` or a Vercel Preview without a key reaches it.
3. **`NODE_ENV === 'production'` as the signal.** It also fires for local `next start` and, per the original brief (not checked against vendor docs), Vercel Preview. Keep, key on `VERCEL_ENV`, or use an explicit opt-in variable. If kept, the Stage 8 env matrix must put the key on Preview (`docs/plans/2026-06-04-phase-8-vercel-deploy.md:328` says "Production only").
4. **A failed confirmation email is never re-sent.** Only reminder and survey are re-dispatched. In production without a key every registration's confirmation is lost, visibly. Do confirmations need a retry path? Stage 8 call.
5. **CLAUDE.md Hard Rule 7.** Line 145 says "Currently unset, so sends are stubbed (console.log) regardless of stage." False for any production build. Not edited. Proposed replacement for the last two sentences: "The stub-vs-real email switch is `emailLive()` + `sendEmail` in `lib/email/eventEmails.ts`, keyed on whether `RESEND_API_KEY` is set, not a phase gate. Key set: real send. Key unset: the dev stub (console.log, row stays `queued`) unless `NODE_ENV=production` (every `next build`/`next start`, Vercel Preview included), where `sendEmail` returns a `resend_not_configured` error, a bulk send returns a whole-batch error, and the caller reports it. `.env.local` has no key, so `next dev` sends stay stubbed."

### Execute (only Ivan)
- After decision 1: merge the branch into main and push, or open the PR at https://github.com/GhostDragooon/Eventar/pull/new/claude/distracted-haibt-18a25a. No push approval carries to another session.
- Before Stage 8: put `RESEND_API_KEY` in every `NODE_ENV=production` environment that must send (Preview included, if decision 3 keeps the signal).

### Queued for Claude (not done)
- Caller-level tests for the production branch: `registerForEvent` with `NODE_ENV=production` and no key gives `emailDelivery:'failed'` and a failed row; cron route `delivery` and `ok` for the unconfigured state. Today only the switch and the bulk guard are pinned.
- Stale text, no behaviour: `.env.example:15-18`; `docs/plans/2026-07-12-execution-plans-index.md:13`, `2026-07-11-poc-engagement-plan.md:22`, `2026-08-03-post-m2-execution-map.md:70`; Task 4 of `2026-06-04-phase-8-vercel-deploy.md`; no back-link in `2026-06-04-phase-7-resend-design.md:54`; header comments in `actions.test.ts` and `emailActions.test.ts`; prop comments in `RegisterCard.tsx`, `EmailDeliveryStrip.tsx`, `PassDeliveryPanel.tsx`, `schema.ts`.
- Link this handoff from `docs/plans/PROJECT_STATE.md` when the branch merges (not done here: main edited the same spot on 2026-10-31 and the edit would conflict). Fix the two stale lines in `mvp/EMAIL-SWITCH-HANDOVER.md`.
- The two remaining `TEMP:` markers (`actions.ts:313`, `eventEmails.ts:342`) are legitimate until the stub is removed.

### Other sessions
- The parent session "UX-02 portal shell options" copied the earlier hand-over into `mvp/EMAIL-SWITCH-HANDOVER.md` on main. `app/dev-preview-uiport/ux-02/` was never touched here.

## Verified by execution, inference, and gaps
- **Execution:** the gates above; rule 2 order (database read-back); production build with no key against the local DB (confirmation row `failed` with `resend_not_configured`, action returned `"emailDelivery":"failed"`, cron ticks 1-3 `failed:3`, tick 4 `gaveUp:3`); the same ticks on `fb49ac1` write no rows and return `ok:false`; "Send reminders now" with a real click shows a confirm dialog, then the batch error; the regression test fails 2 of 3 on the unguarded code and passes with the guard.
- **Inference only:** behaviour with a real key (mocked senders only, no real send); Vercel Preview `NODE_ENV`.
- **Gaps:** the user-lens review ended partial (50 of 50 calls: event A details page and mobile not reached); the merged-tree gate ran without a database.

## Non-obvious things learned
- A production-mode cron tick is not scoped to a fixture. It wrote 138 failed rows for 18 unrelated local events in one run. Check `select count(*) from email_log` before and after.
- "Send reminders now" opens a confirm dialog ("Send to N") before sending. A scripted click that stops at the dialog looks like a dead button.
- Local stack was down on 2026-10-31 (Docker not running); the session scratchpad had also been partly cleaned. Keep gate scripts in the repo's `scripts/` if they are meant to survive days.
