# Handoff, 2026-10-23: MVP execution, cards CX-01..CX-07 and review round 1

Written when Ivan closed the session. Plan: `docs/plans/2026-10-11-mvp-execution-plan.md` (sections 3.2 locks and 4 rules still apply). Nothing pushed, nothing in Seoul.

## 0. Ivan's action list

**Decide** (recommendation first)
1. `invite_tokens` for the SEC card: revoke `service_role` INSERT and UPDATE and keep DELETE (the `practitioner_licences` / `participation_evidence` precedent for erasure), or revoke all three? Recommend keep DELETE.
2. The `motion` dependency (`"motion": "^14.6.0"` in `package.json` and `pnpm-lock.yaml`, uncommitted) was added by a session other than mine; Q41 says no new dependency unless you ask. Keep or revert?
3. The user-lens design findings I did not apply (REVIEW-ROUND-1.md item 5: unsaved state on the Publish card, duplicate lock note, banner placement, body-admin route, naming). They need a before and after from you; say when you want a specimen round.
4. Your 2026-10-23 rulings are recorded below under "Rulings". Say if any is wrong.

**Execute** (only you or a commit session)
1. Commit the uncommitted diff: CX-07 (proxy.ts, lib/auth.ts, components/auth/auth-error-messages.ts and three tests) plus the one-line test fix in `app/events/new/NewEventForm.test.tsx`, plus `docs/plans/mvp/CX-07.md`. Leave `package.json`, `pnpm-lock.yaml` and `.claude/skills/**` out.
2. Hosted: nothing is pushed. The migrations from the SEC card go to hosted only with your explicit go (`supabase db push --linked`, Stage 8), after a read-only pre-flight query against hosted.

**Queued for Claude** (one card at a time, in this order; run the three review lenses after each, see "Protocol")
1. CX-07: run review round (dev, user, backtest) and the live check listed in its hand-back.
2. SEC card (`sql`, new): (a) audit and narrow `anon` INSERT/UPDATE/DELETE on every table that does not need it (11 never-narrowed tables found, including `registrations`, `users`, `consent_records`, `staff`; public writes go through service-role server actions, so anon writes should be removable everywhere, anon SELECT stays where public pages read); (b) `invite_tokens`: revoke `service_role` writes per decision 1, extend `seed.sql`, add the row to `tests/rls/audited_table_writes.rls.test.ts` with the SQLSTATE 42501 negative test, extend `tests/rls/seed_grant_posture.rls.test.ts`. Use the skill `eventar-grant-guard-proof` and the grant-guard mutation recipe. Anon first: its blast radius (public key in the browser) is larger than service_role's.
3. UPD card: gate `updateEvent` on `status = 'draft'` in `app/events/[id]/edit/updateAction.ts` now, and put the same rule in `update_event_with_blocks` (refuse non-draft with a specific code until P9b) by amending DB-04's lifecycle-lock spec; add the creator predicate for the UI (role allowed AND creator or eventar_staff) to the accreditation field, the wizard and the roster role chips, with a second lock-copy state shown to Ivan first (front-end review rule).
4. Defect card (small, front-end): Manage row Check-in button clipped for admins (`ManageWorkstation.tsx`, fixed 116 px column), bulk Cancel contrast 3.74:1, dark `/pricing` "Choose" buttons illegible (pre-existing, identical with the old `cn()`).
5. Plan order after that: DB-02 (P3 check-in window; CX-01 and DB-01 are committed), CX-06a, CX-04, DB-03, DB-04 (with the draft-only rule), UX-02, CX-06b, UX-04, DB-05 (stretch). UX-04 builds the Registrations page; the Registrations list keeps its outer border with no row lines (PICKS.md note).
6. Follow-up list (not blocking): REVIEW-ROUND-1.md "Deferred".

**Other sessions**
- "Commit reviewed MVP cards by pathspec" (idle, finished): seven commits f6bfc15, dd25258, 6d7cf21, 0446076, edc338f, b35f1e6, 5e319da and a SHA-recording commit 1955985. Nothing pushed.
- "React Bits Pro blocks and StatusMark" (idle): unrelated front-end work; it shares this tree, so check `git status` before staging.

## State

- HEAD `1955985` on `main`. Cards: CX-01, DB-01, UX-01, CX-03, CX-05, UX-03 committed and reviewed (round 1, no BLOCKER). CX-07 code done, tests green, uncommitted, review and live check pending. Hand-backs and every REVIEW file are in `docs/plans/mvp/`; the disposition is `REVIEW-ROUND-1.md`.
- Gates on the working tree: tsc clean, eslint 0 errors / 11 warnings, vitest 195 files / 1639 passed (405 skipped). `next build` and `test:rls` last green at the round 1 review (43 files, 362 tests) and not re-run after CX-07 (no route or database change).
- `check:ui-colours` (2, `DashboardWorkstation`) and `check:ui-primitives` (ProfileClient, RosterClient, OrgOnboardingClient x2, DashboardWorkstation x2, MultiBodyAccreditationWizard) fail at HEAD on files none of these cards own.
- Known flaky test: `app/events/[id]/edit/PublishDraftButton.test.tsx` failed once in a full run and passes alone (5 of 5).

## Rulings (Ivan, 2026-10-23, in reply to REVIEW-ROUND-1.md)
1. `updateEvent` must be gated on draft (or at least non-published) status; fold into DB-04 only if that card is about publish/edit invariants, otherwise harden now. Not just reword.
2. Tighten the UI to also require creator; relaxing the database rule only if multi-admin editing is wanted; leaving the mismatch is worst.
3. The `invite_tokens` / `service_role` card is the highest priority, and touches hosted.
4. Narrow the anon grants, in the same security pass as 3.
5. Allow the extra file for CX-07.
6. The frontend polish items may wait; capture them as a short follow-up list.

## Protocol that worked (carry it forward)
- **Review after each card:** three separate agents (dev-lens, user-lens, backtest), never two lenses in one agent; at most two heavy agents at once; each prompt opens with a `Budget:` line and states the regime (ongoing-project, no superpowers skills); background with `run_in_background`; a dead agent is resumed with `SendMessage` to its id, not re-dispatched. Reviewers write only `docs/plans/mvp/REVIEW-<scope>-<lens>.md`. Verify every claim before acting (Rule 14); fix what sits in the reviewed card's own files with a test that fails without it; bring the rest to Ivan.
- **Locks:** `docs/plans/mvp/LOCK-<CARD>` (atomic create), `scratch-demo/locks/dev-3100.lock` and `test-rls.lock`. Dev server: Browser pane `preview_start` name `eventar-noreview` (port 3100), stop it and release the lock when done.
- **Browser quirks:** wait about 5 s after navigate (first hit compiles), script `.click()` before hydration does nothing (use real clicks via `find` refs), `document.body.innerText` sometimes returns empty (use `get_page_text`), the cookie jar is shared (switch role via /settings Sign out), screenshots sometimes omit the fixed dialog overlay (read the DOM).
- **Magic link without a browser click:** Mailpit `curl -s 'http://127.0.0.1:54324/api/v1/search?query=to:<email>&limit=1'` then `/api/v1/message/<ID>`, first `auth/v1/verify` link, `&amp;` to `&`.
- **zsh:** quote paths with brackets (`"app/events/[id]/details"`); `grep --include=*.ts` fails unquoted.
- **Test hygiene:** a test that picks "today at 09:00" changes meaning after 08:00; use a fixed clock for time-of-day behaviour.
