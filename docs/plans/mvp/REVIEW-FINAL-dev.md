# RV-FINAL, dev lens

- Date: 2026-11-01
- HEAD: 4ca0bbe. Base: 00e2b07 (scope: `git diff 00e2b07..HEAD` limited to app/, components/, lib/, proxy.ts, supabase/migrations; 222 files, 9 migrations).
- Lens: dev (code quality, security, races, regressions, hard-rule compliance). Frontend observations are proposals only.
- Tool calls: 65 of the 100 cap. Status: COMPLETE for the migrations, write actions and auth plumbing; PARTIAL for the pure-UI files (see "Not reviewed").
- Evidence tags: [X] executed (gate or read-only psql), [R] read in code or SQL, [I] inferred.
- Disclosure: one of my greps (`grep -rn consent_records docs/plans/mvp/*.md`) printed two lines from `REVIEW-CX01-DB01-CX03-backtest.md` and `REVIEW-CX07-backtest.md` by accident. I did not open those files and did not use the lines. Every finding below comes from the code and from read-only psql.

## Gates (run by me, sequentially, after the code was at HEAD)

| Command | Result | Numbers |
|---|---|---|
| `pnpm exec tsc --noEmit` | PASS [X] | exit 0, no output |
| `pnpm exec eslint .` | PASS [X] | 0 errors, 10 warnings (5 `<img>` / unused-var warnings in files outside this diff or untouched by it; 5 "unused eslint-disable" in `lib/devEmailStub.ts` and `lib/devEmailStub.test.ts`, which this diff did touch) |
| `pnpm exec vitest run` | PASS [X] | 218 files passed, 51 skipped (269); 1948 tests passed, 545 skipped, 0 failed. Matches the handoff. The 545 skipped are the DB-backed (RLS / `tests/cpd`) tests; I was forbidden to run those, so they are unverified by me. |
| `pnpm run check:ui-colours` | PASS [X] | "UI colour contract check passed." |
| `pnpm run check:ui-primitives` | FAIL, exit 1 [X] | 4 hits, not the 3 claimed: `app/account/profile/ProfileClient.tsx:510`, `app/settings/OrgOnboardingClient.tsx:120` and `:142`, `components/details/MultiBodyAccreditationWizard.tsx:245`. All four predate base (raw `<button>` count is identical at 00e2b07 for ProfileClient and the Wizard, and the script is unchanged since `2a64e18`) [R]. See N1. |

No BLOCKER. Two MAJOR (both about who may write to a row after the fact), five MINOR, five NIT.

---

## MAJOR

### M1. `consent_records`: any signed-in user can forge or rewrite their own consent rows through PostgREST, bypassing the audited functions [X for grants and policies, I for exploit]

- Where: live local DB; grants never narrowed by any of the 9 migrations. SEC-01 (`20261023150000`) says "Narrowing those is a separate review of every table where authenticated holds full DML" and that review has not happened.
- Evidence [X, read-only psql]:
  - `authenticated` holds INSERT and UPDATE on every column of `consent_records` (id, user_id, consent_type, version, granted_at, withdrawn_at, context) and DELETE at table level.
  - Policies: `consent_self_insert` (`with check user_id = auth.uid()`) and `consent_self_withdraw` (`using/with check user_id = auth.uid()`). No column restriction, no trigger on the table.
  - `20260704170748_consent_audited_fns.sql` exists, so the intended write path is the audited `grant_consent` / withdraw functions (Hard Rule 11 class).
- Failure scenario: a signed-in attendee sends `PATCH /rest/v1/consent_records?user_id=eq.<self>` with `{"granted_at":"2026-01-01T00:00:00Z","version":"v9"}` or `POST`s a row for a policy version they never saw. It lands with no audit row. The consent evidence the platform would show a regulator for that person is now self-authored.
- Not exploited: I may not write. The exposure follows from the grant and policy text; the table has no trigger, and `consent_records` has no row in `tests/rls/audited_table_writes.rls.test.ts`.
- Fix: new migration `revoke insert, update, delete on public.consent_records from public, anon, authenticated` (service_role and the definer functions are unaffected), add the table to the audited-writes matrix with a 42501 negative test. Check `acceptRequiredConsents` (`app/account/complete/actions.ts`) goes through `grant_consent`, which the diff context shows it does.
- Scope note: pre-existing and outside the diff, but it is the same class SEC-01/02/03 and DB-05 were opened for, and the MVP closes the other tables while leaving this one.

### M2. `update_registration_contact` can re-point an attended registration's email, which re-routes the held credit to whoever owns the new email [R, with the claim function read via psql]

- Where: `supabase/migrations/20261025100000_audited_roster_edit_and_registrations_update_closed.sql` (the function body), reached from `app/events/[id]/registrations/actions.ts:updateRegistrationContact` and the Edit dialog in `RegistrationsClient.tsx`.
- What is wrong: the function refuses an email change only when `v_reg.user_id is not null` (linked). It does not look at `status`, event state, or whether a held credit exists. `claim_registrations_for_user` (read via psql) links by `lower(trim(email)) = <caller's confirmed email> and user_id is null`, for any status. The check-in pass page tells an attendee "Link this attendance to your account to release points, reception can't do this for you".
- Failure scenario: an `organiser_member` of the organisation opens Registrations for a finished event, edits an attended, unlinked registrant's email to an address they control, then signs up with that address and claims. The audit row says `fields:["email"]` only, so nobody can later see the old or new value (by design, no PII in the chain), so the trail cannot show where the credit went.
- Compare: the sibling lock added in `20261101100000` refuses a role change once `status = 'attended'` because "the credit is already posted". The same reasoning applies here and is not applied.
- Fix (proposal, Ivan decides, it narrows a deliberate UX-04 capability): refuse the email change (name still allowed) when `status = 'attended'`, with a `22023 / email_locked_attended` and a copy line; or, if the edit must stay open, write a short salted hash of old and new email into the audit payload so the move is attributable. Add a case to `tests/rls` for the attended + unlinked path.

---

## MINOR

### m1. The remaining `authenticated` write grants rest on RLS alone (defence in depth, currently inert) [X]

Read-only psql, tables where `authenticated` still holds write privileges and how many write policies each has: `staff` (INSERT incl. `role`, `organisation_id`; UPDATE of organisation_id, status, email, full_name; DELETE) 0 policies; `organisations` 0; `organisers` 0; `accrediting_bodies` 0; `survey_responses` 0; `users` 1 (self update); `agenda_blocks` 1; `speaker_checkins` 2; `additional_appointments`, `society_memberships`, `professional_profiles` 2 to 3. With zero policies the grant is dead today, so `staff` cannot be written by a signed-in user right now [X]. It is one permissive policy away from a role-escalation write, which is the shape Hard Rule 11 lists as having failed four times. Fix: the same revoke sweep as M1 for the zero-policy tables (`staff`, `organisations`, `organisers`, `accrediting_bodies`, `survey_responses`), proven with a `has_table_privilege` assertion in `seed_grant_posture`.

### m2. Silent truncation at PostgREST's 1000-row cap on three read paths (Rule 12) [R, cap confirmed in `supabase/config.toml` max_rows = 1000]

- `app/dashboard/data.ts:fetchDecoratedEvents`: registrations are read per batch of 100 events. A batch holding more than 1000 registrations returns 1000 arbitrary rows, so `registered`, `attended` and `delta7` on the Events home are undercounted with no error. The `ponytail:` comment names it. Scenario: 100 events averaging 11 registrations; some events show 0 registered.
- `app/events/[id]/registrations/page.tsx`: the roster `select(...)` and the `registration_roles` embed have no `.range()` or count check. An event with more than 1000 registrants shows a truncated list and the counts "All (1000)". `app/events/[id]/checkin/page.tsx` has the same shape (pre-existing).
- Fix: a `count: 'exact'` head request, or compare `data.length` to `MAX_ROWS` (already exported from `lib/supabase/inBatches.ts`) and show a visible "list is cut at 1000" banner; paginate with `.range()` when an event can really exceed that.

### m3. Saving an edited draft twice after a failed read-back inserts duplicate agenda blocks [R, producer and consumer both read]

- `app/events/[id]/edit/updateAction.ts` (last lines) returns `{ error: 'Your changes were saved, but the agenda could not be read back. Reload this page before saving again.' }` with no `blockIds` when the read-back fails or the count differs. `NewEventForm.tsx` only updates `savedBlockIds` on `res.blockIds`, so a block added in that save keeps no id in the form. Nothing forces the reload the message asks for.
- Scenario: add agenda block B, Save (DB insert succeeds, read-back errors), change a title, Save again: B is sent without `id` and is inserted a second time. The RPC cannot dedupe a no-id block.
- Fix: on that error, disable Save (or auto `router.refresh()` and remount the form from the server) instead of relying on the sentence.

### m4. Role chips and statuses on the per-event Registrations page are a load-time snapshot [R]

`RegistrationsClient.tsx` seeds `useState(initialRows)` and `useState(initialRoles)` and never resyncs, so `revalidatePath` after an action does not refresh them. Someone who checks in while the page is open keeps unlocked chips. The database refuses (`role_locked_attended`, mapped by `translateCpdRpcError`), so no wrong data is written and the message says to reload; the cost is a failed click, not a defect in data. Proposal (visual/behavioural, not applied): subscribe to the same `registrations` realtime channel the check-in desk uses, or key the client on a server `updated` stamp.

### m5. `events_draft_only_detail_edits` also lets `registration_close_at` change on cancelled and completed events, and `updateRegistrationClose` does not compare close to open [R]

`supabase/migrations/20261024110000_*.sql` exempts only `registration_close_at` from the trigger, regardless of status; `app/events/[id]/details/actions.ts:updateRegistrationClose` checks only close < start. Harmless to credits, but a closed event's window can be edited and a close earlier than `registration_open_at` is accepted. Fix: add `status = 'published'` to the exemption and a close > open check in the action.

---

## NIT

- N1. `check:ui-primitives` is red with 4 hits and the handoff says 3 [X]. All four predate base. Either add the ProfileClient degree chip (`ProfileClient.tsx:510`) to ALLOWED with a reason, or fix the claim.
- N2. `lib/devEmailStub.ts:35` and `lib/devEmailStub.test.ts:13-19` carry "unused eslint-disable" warnings; this diff rewrote the header of that file [X].
- N3. `app/events/[id]/details/actions.ts` and `rpcErrorMessage` in `updateAction.ts` return raw `error.message` text to the browser for unmapped failures (no PII seen in the producers, but constraint and function names leak) [R].
- N4. `update_registration_contact`: the DB raises `invalid_name:` / `invalid_email:` (22023) that `updateRegistrationContact` does not map, so a case where Zod accepts and the SQL regex refuses lands on the generic "Could not save" [R]. Also `translateCpdRpcError`'s 22023 fallthrough says "Credits have already been issued..." for any unrecognised 22023 [R].
- N5. Comment drift: `lib/lifecycle/eventLifecycle.ts` says the SQL window end is exclusive, but the single-occurrence path in `mark_attended` / `self_check_in` is `now() > end_time` (end inclusive); only the multi-occurrence branch uses `[)` [R]. One instant, no practical effect.

---

## Reviewed and clean

- Migration `20261023140000` (anon DML sweep, invite_tokens service_role): idempotent revokes, self-check raises and rolls back; live DB shows anon holds no INSERT/UPDATE/DELETE on any public relation and service_role keeps invite_tokens DELETE only [X].
- Migration `20261023150000` (authenticated loses registrations INSERT): live ACL confirms; the only app insert paths use service_role (`registerForEvent`, walk-in) [R].
- Migration `20261023160000` (events column UPDATE narrowed) and `20261024120000` (events DELETE revoked): live column list matches; `updateRegistrationClose` is the only authenticated events write left and uses an allowed column [R, X].
- Migration `20261023170000` (check-in window): both functions are definers with `search_path public, pg_temp`, ACL restated (anon and authenticated have no `self_check_in`, `mark_attended` kept for authenticated and service_role) [X]; window resolved before any write; unique-violation idempotency kept; audit event is the last write; `mark_attended` actor resolution unchanged.
- Migration `20261024100000` (eligibility read for teammates, soft-deleted event private): org check present, `events_public_read_published` and the registrations policy now exclude deleted rows [X on text]; `registerForEvent` still re-checks `deleted_at` for staff readers.
- Migration `20261024110000` (agenda upsert, draft-only): invoker function with row lock `for no key update`, status read under the lock, `get diagnostics` row-count check, ids must belong to the event and be unique, survey-answered blocks refuse the whole save. Trigger names sort `events_draft_only_detail_edits` before `events_touch_updated_at`, so `updated_at` does not trip the diff [X]. No unique on `display_order`, so per-block updates cannot collide mid-loop [X]. `app_private` is not an exposed API schema, so the new definer helper is not callable over REST [R, config.toml].
- Migration `20261025100000` (registrations UPDATE/DELETE revoked, `update_registration_contact`): definer, actor via `resolve_actor` (override honoured only for `service_role`, read via psql [X]), org check, row lock, `unique_violation` mapped, audit written last, zero-field edits return without a write. Content issue is M2 only.
- Migration `20261101100000` (role lock after attendance): both functions guard on status inside the same statement that reads the owner; audit last; grants preserved [X].
- Auth plumbing: `lib/authDoor.ts` `safeNextPath` (resolves against a dummy origin, rejects `//` and backslash forms), `attendeeNextPath` (classifies the resolved path, so `/account/../dashboard` is refused), `/auth/callback` re-validates, `app/account/complete/page.tsx` gates `next` with `wizardLandingPath`, `app/dashboard/manage/page.tsx` redirects to a fixed path. `proxy.ts` adds `/events/:id/registrations` to the matcher and `authDoor` classifies it organiser; PGRST116 maps to a clear redirect without leaking email [R].
- `lib/abuseTier.ts` + `lib/rateLimit.ts`: `firstRejection = count == max + 1` is correct for `rate_limit_check` (read via psql: it counts every call) [X]; verified subject is the same token being revoked; no revoke row on a failed sign-out; abuse limiter does not recurse (`rateLimitByUser` calls `rateLimit`).
- Server Actions that write: `updateRegistrationContact`, `updateEvent`, `publishEvent`, walk-in, `markAttended`, dashboard bulk actions all call `requireStaff` first, Zod-validate, scope by organisation, and do no UI-only authorisation. `walkInRegisterAndCheckIn` now checks access before revealing lifecycle and reports "registered but not checked in" with the code.
- `components/dashboard/EventsHome.tsx` cancel/undo countdown: `sent` ref is reset when a new countdown starts and set synchronously, unmount and visibility paths send once.
- `PublishDraftButton`, `NewEventForm` publish confirm, `lib/draftDirty.ts`: pending guard prevents a double publish; dirty snapshot logic handles edits typed during a save.
- Email path: single `emailLive()` switch; production with no key returns a send error and the bulk path refuses before any per-row `failed` write (Rule 12). Insert-log-first order in `registerForEvent` unchanged.
- Time zones: no new hard-coded zone or server-local clock in non-test code (grep of added lines); `publishFacts` takes the event timezone explicitly. `components/details/PriorApprovalAdvisory.tsx` uses HKT on purpose (HKCP rule) and is outside the diff.
- `app/dev-preview-uiport/layout.tsx` returns `notFound()` when `NODE_ENV === 'production'`, covering every nested preview page.
- Seed (`supabase/seed.sql`) re-asserts the new revokes and is local-only.

## Not reviewed / coverage gaps

- I did not run, and was forbidden to run, any DB-backed test (`pnpm test:rls`, `tests/cpd`) or `next build`; the 545 skipped vitest tests and the whole RLS matrix are unverified by me.
- Every migration was read and its end state checked with read-only psql, but none was replayed from zero (`eventar-migration-replay-rollback` not run).
- Read lightly or not at all: `components/shell/*` (AccountShell, StaffShell visual structure), `components/landing/*`, `components/event-form/DraftSavedBanner` / `PublishConfirmDialog`, `NeedsAttention`, `app/analytics`, `app/participants`, `app/(public)/events/EventsListClient`, `components/ui/Dialog`/`ConfirmDialog` changes, the `app/dev-preview-uiport/**` pages, and the new test files (read only where they pinned a behaviour).
- `createEvent` / `create_event_with_blocks` was seen only through the 3-line diff; I did not read the RPC.
- Browser-timezone assumption: `NewEventForm` builds event and agenda instants with `new Date('<date>T<time>:00')`, which is the organiser's browser zone, not the venue zone. It predates this diff and I did not test it [I]; `eventar-timezone-correctness` should be run against it before Stage 8.
