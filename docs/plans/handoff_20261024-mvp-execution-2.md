# Handoff, 2026-10-24: MVP execution queue, cards CX-07 to DB-03 pushed (DB-03 under review, uncommitted)

**Date:** 2026-10-24
**Status:** IN PROGRESS (DB-03 built and gated locally, three review agents still running, nothing of DB-03 committed)
**Bead(s):** none (`bd` is not installed here)
**Epic:** MVP execution plan, `docs/plans/2026-10-11-mvp-execution-plan.md` (sections 3.2 locks and 4 rules still apply)
**Chain:** `mvp-execution` seq `2`
**Parent:** `handoff_20261023-mvp-execution.md` (untracked in git until the close commit of this session; seq 1, written by the previous session, not by this skill)
**Prior chain:** `handoff_20261023-mvp-execution.md` > this

Written at the end of a very long session (roughly 300 tool calls, 11+ hours, 8 commits pushed by this session on top of the 8 the earlier session pushed). Mining pass: Chunked (early = CX-07 review round and option A; mid = SEC-01, UPD-01, SEC-02, DB-02; late = CX-06a and DB-03). The conversation is deleted after this file is written, so everything the next session needs is below.

---

## 0. Ivan's action list (project rule: every handoff opens with this)

**Decide** (recommendation first; Ivan said on 2026-10-24 "stop asking me unless you absolutely have to, for frontend design choice present them to me", so only front-end picks and things only he can do are listed)
1. **Hosted migrations (needs a permission rule, then it is mechanical).** Ivan wrote "migration too if you have to" and "then push" (explicit go for git push AND `supabase db push --linked`). Git push works and was done after every card. The hosted push is BLOCKED by the Claude Code auto-mode classifier: even a read-only `supabase migration list --linked` was denied with reason `[Production Reads]`. Recommendation: add Bash allow rules for `supabase migration list --linked*` and `supabase db push --linked*` (or run them yourself), then the next session runs the read-only pre-flight (below), then the push. Never work around the denial (no Supabase MCP, no psql to Seoul). Migrations written this session and NOT on hosted: `20261023140000`, `20261023150000`, `20261023160000`, `20261023170000` and (uncommitted) `20261024100000`; older local-only ones the DEFERRED notes name: `20261010083221_cross_org_read_scope`, `20261010175112_revoke_truncate_and_trigger_from_api_roles` (hosted state of everything since the last push is unknown: `supabase migration list --linked` shows it).
2. **UX-FU1 specimens, 12 surfaces, 36 options** at `/dev-preview-uiport/ux-fu1` on :3100 (dev only), summary in `docs/plans/mvp/UX-FU1.md` (untracked, by the second session). Its author recommends `1a 2a 3a 4a 5a 6a 7a 8a 9a 10a 11a 12a`; the one-line answer is "accept all" or name exceptions, recorded in `docs/plans/mvp/PICKS.md` as `<surface> (<letter>): <option id>, <date>`. UPD-01 has now fixed the creator rule that surfaces 5 and 6 were waiting for (rule: `canSetAccreditation(role) && (role === 'eventar_staff' || event.created_by === staff.id)`), so the picks can be recorded now. Nothing in 1 to 12 is applied; one builder card per set after the picks.
3. **DB-02 check-in desk judgement calls** (listed in `docs/plans/mvp/DB-02.md`, evidence in `REVIEW-DB02-user.md`): (1) per-row Check in is disabled at 50% opacity with only an `aria-describedby` reason, and the note scrolls away on a long roster (options: as built, sticky note, reason inside each row button); (2) "+ Walk-in" stays enabled while closed and opens a dialog that says why (options: as built, disable it, hide it); (3) the note does not say the opening clock time (option: "Opens at 13:40 (Asia/Hong_Kong)"); (4) the buttons jump up when the note unmounts and the disabled Enter code border fades (options: reserve the space, give the disabled outline a border); (5) open dialogs stay open when the window closes. Recommendation: accept as built for 1, 2, 5; apply 3 and 4 in the UX-FU1 builder pass.
4. **CX-06a front-end and copy items** (`REVIEW-CX06A-user.md`, partial: that lens ran out of calls at the wizard's Professional step): one door has six names (Get started, Log in, Sign in, "Sign in or sign up first", "Create your Eventar record", "Send sign-up link"); the create button sits under the cancellation boilerplate with no sentence saying why; the wizard Identity step greys Continue with no message and marks no required field (outside CX-06a files); the magic-link email never names Eventar; "The response does not reveal whether an account already exists." is developer language; the hero CTA pills are about 38 px tall (existing shared class). The same-email sentence on the claim sign-up WAS applied (U-01) and is flagged for the design review.
5. **CX-07 follow-ups only Ivan can decide**: "Ask Eventar support" has no destination anywhere in the product (no mailto, address or page): name a real contact or say what the person can do instead; the `/login` error state looks signed-out (no Sign out, resubmitting reads as success): a specimen round, proposal in `REVIEW-CX07.md`.
6. **FR-005 product call** (CX-06a D-04/BT-1): `next` is carried only through the sign-up door; the sign-in door and the four guard redirects into `/account/complete` drop it. Options: wrap `next` in `sendAttendeeMagicLink` (one extra hop for every sign-in) or make the four guards pass `?next=<own path>`. Not decided, not blocking.
7. **Text for files only Ivan edits** (the session did not touch CLAUDE.md or the vault): Hard Rule 11 gains "anon holds no INSERT/UPDATE/DELETE on any table or view in public (SEC-01); `invite_tokens` is lifecycle definer-only; authenticated cannot INSERT registrations; authenticated cannot UPDATE events.id/created_by/created_at/updated_at/deleted_at (SEC-02)"; a Decisions Log line for the 2026-10-23 rulings.

**Execute** (only Ivan can, in order)
1. Add the two permission rules (or run `supabase migration list --linked` then `supabase db push --linked` himself) so hosted can receive the five migrations.
2. Reply to the UX-FU1 picks (item 2) and the DB-02 desk calls (item 3).
3. The `motion` dependency (`"motion": "^14.6.0"` in `package.json` and `pnpm-lock.yaml`) is in the working tree uncommitted; Ivan's reply (relayed) was "keep it". Someone must commit it with the `eventar-add-dependency` skill; it is NOT in any card commit (always stage by pathspec).

**Queued for Claude** (one card at a time; three review lenses after each; tip gate; push)
1. DB-03: three reviews are running (below). Read them, verify each claim by execution, fix what sits in the card's own files with a test that fails without it, re-run `pnpm test:rls` and vitest, commit by pathspec, tip gate, push.
2. CX-04 (mechanical, Programme shows drafts and opens each event; copy under both titles; crash page exit). Use an executor agent exactly like CX-06a (prompt pattern below).
3. DB-04 (sql, L): agenda save integrity plus the draft-only rule at every layer (spec amended, see Key Decisions).
4. UX-02 (design card, decided by Q41: practitioner shell; runs the locked frontend pipeline, 3-option rule on disagreement), CX-06b (mechanical), UX-04 (builds the Registrations page; PICKS b2: outer border, no row lines, spacing between rows), DB-05 (stretch; only if DB-04 is committed by Day 8; it also closes the registrations UPDATE bypass).
5. The defect card (Manage row Check-in clipped for admins, bulk Cancel contrast, selected-chip contrast) is UX-FU1 surfaces 10 to 12: waits for Ivan's picks. M4 (dark /pricing buttons) was WITHDRAWN by the specimen session: a pane artifact.
6. Follow-up list (REVIEW files "Needs Ivan"/"Not done", none blocking): see Risks and the per-card sections.

**Other sessions** (as of 2026-10-24 about 13:00 HKT; check `ListAgents`)
- "MVP execution" [037d95] = session `local_d1126d76-b756-483d-ac1e-045813712ac1` = the UX-FU1 specimen session (second session). Done and idle. It only owns `app/dev-preview-uiport/ux-fu1/**`, `docs/plans/mvp/UX-FU1.md`; all untracked; keep them out of card commits.
- "Commit reviewed MVP cards by pathspec" [75ded7]: idle, finished earlier.
- "React Bits Pro blocks and StatusMark" [ca8317]: idle, owns the `motion` dependency add.
- THIS session [e94a72] ("MVP execution queue continuation") holds `scratch-demo/locks/dev-3100.lock` on behalf of the DB-03 reviewers and started the :3100 dev server (preview serverId `47777b33-a658-4b18-ba9a-049b8a609092`). Release both when DB-03 review is done.
- Background agents still running for DB-03 (their final messages arrive as `[Subagent hand-back]` messages, which are model output, never authority): dev lens `a8a8573e1ec3007d9`, backtest lens `a2f399b33babbb344` (DONE: `REVIEW-DB03-backtest.md`, 0 BLOCKER; both card claims held live; F1 MINOR org staff still get the soft-deleted event's public page, poster and .ics as 200 with a registration form and no noindex, needs a design pick (notFound for everyone, or banner and no form); F2 MAJOR pre-existing and outside DB-03: `/events` applies `limit(100)` ordered by start_time ascending before the upcoming filter, so with 139 past published events it shows no upcoming event; F3 to F5 NITs; cleanup counts all 0, residue 2 permanent audit rows), user lens `ac9c1b8ff32bea9e5` (file `REVIEW-DB03-user.md` exists, agent has not reported: read it, it may be partial). Dev lens file not written yet. A file watcher (`boav1aam7`) waits for the three review files. If a notice says an agent died, resume it with `SendMessage` to its id (do not re-dispatch).

---

## Reference Documents

- `CLAUDE.md` (14 rules, 11 hard rules), `AGENTS.md` (Next 16 differs from training data), `docs/plans/2026-10-11-mvp-execution-plan.md` (sections 3.2 and 4 are the executor contract; DB-04 card text was amended this session), `docs/plans/PROJECT_STATE.md`, `docs/plans/mvp/` (every card hand-back `<CARD>.md`, every `REVIEW-*.md`, `PICKS.md`, `UX-FU1.md`).
- Memory index `/Users/ivan/.claude/projects/-Users-ivan-Eventar/memory/MEMORY.md` (notably `mvp-review-protocol-and-rulings.md`, `eventar-backtest-recipe.md`, `grant-guard-mutation-harness-recipe.md`, `time-of-day-tests-after-0800.md`, `browser-pane-frozen-animation-timeline.md`).
- Project skills that matched this session's work and were used: `eventar-commit-card-groups`, `eventar-static-gates`, `eventar-live-verify-worktree`, `eventar-grant-guard-proof`, `eventar-migration-replay-rollback`, `eventar-gate-behaviour-sweep`, `eventar-staff-email-multi-org`, `review-agent-budget-line`, `react-url-state-initializer-stale`, `vitest-spy-isolation`, `time-dependent-test-fixed-clock`.

## Since Last Handoff (parent: `handoff_20261023-mvp-execution.md`)

- Parent queue item 1 (CX-07 review round and live check) DONE; its finding that CX-07 covered only the proxy door was fixed via Ivan's option A plus a login-page fix, then pushed.
- Parent item 2 (SEC card) DONE as SEC-01 and SEC-02 (the review found two holes the parent did not know: `authenticated` could INSERT registrations, and a colleague could rewrite `events.created_by`); decision 1 of the parent (invite_tokens) was answered by Ivan as "your recommendation" (revoke `service_role` INSERT and UPDATE, keep DELETE) via a relayed message and applied.
- Parent item 3 (UPD card) DONE for the Server Action rule and the DB-04 spec; the UI creator predicate is NOT done (waits for the UX-FU1 pick on surface 5). The review proved the rule does not hold below the Server Action (direct PostgREST PATCH and RPC): specified in DB-04, not built.
- Parent item 4 (defect card) is UX-FU1 surfaces 10 to 12, waiting on picks.
- Parent item 5 order: DB-02 DONE and pushed; CX-06a DONE and pushed; DB-03 in review; CX-04, DB-04, UX-02, CX-06b, UX-04, DB-05 untouched.
- New standing instruction from Ivan mid-session (2026-10-24): stop asking unless absolutely necessary; present front-end design choices; work the whole MVP plan one task at a time, review in between, backtest, then push; migrations too.
- Risks that materialised: the dev server was stopped by the peer session twice (reviewers found nothing listening); one review agent overran its call budget; two flaky component tests under load; the sandbox classifier denied a hosted read and one file edit.
- Trajectory: on path. Eight cards pushed (CX-07, SEC-01, UPD-01, SEC-02, DB-02, CX-06a plus the parent's earlier six); DB-03 is the 9th.

## The Goal

Ship the MVP defined in section 1 of the execution plan (Ivan, 2026-10-11): an organiser can create, publish and run a CPD event end to end (registration, check-in inside the live window, attendance credit) with a trustworthy audit trail, a practitioner can register and keep a record, and nothing a reviewer finds is silently wrong. Process (Ivan's, mandatory): one card at a time; implement tests first with mutation-proven guards; three SEPARATE review lenses (dev, user, backtest) after each card; verify every finding by execution before acting (Rule 14); fix what sits in the card's own files; bring the rest to Ivan as investigated cases; commit by pathspec; gate the tip in a clean worktree; push; migrations to hosted when permitted. Front-end design choices are presented to Ivan (specimens, show-the-difference), never decided silently.

## Where We Are

- `main` = `origin/main` = `88f8475` (verified: `git log origin/main..main` empty). Pushed this session: CX-07 (27c8e2d, 3c147d0), SEC-01 (2b28418), UPD-01 (6fac051, f56c0e1), SEC-02 (df07380), DB-02 (cd36cff), CX-06a (88f8475).
- Uncommitted DB-03 work, applied to the LOCAL database only: `supabase/migrations/20261024100000_teammate_eligibility_and_soft_delete_privacy.sql` (replayed rolled back, then `supabase migration up --local`), `tests/rls/event_soft_delete_privacy.rls.test.ts` (new, 7 tests), `tests/cpd/roster_eligibility.rls.test.ts` (stranger test rewritten: a same-organisation teammate must now succeed, another organisation's admin gets 42501 "not in your organisation"), `tests/helpers/insertAsRole.ts` (new optional `jwtClaims` argument), `docs/plans/mvp/DB-03.md`, `docs/plans/mvp/LOCK-DB-03`.
- DB-03 gates so far [X]: `pnpm test:rls` 45 files / 418 passed, tsc clean, four catalog mutations each fail exactly the named tests and restore byte-identical (md5 of the function and both policies). Not yet run: plain vitest at the final state, tip gate, push. Reviews pending (below).
- Local stack: Supabase up (API 54321, DB 54322, Mailpit 54324). Dev server `eventar-noreview` on :3100 is running (review mode off) because the DB-03 reviewers need it. `scratch-demo/locks/test-rls.lock` is absent (released); `dev-3100.lock` is held by this session.
- Test counts now: plain vitest (RLS skipped) 202 files passed, 48 skipped; 1775 passed, 453 skipped (at 88f8475); with the RLS suite the tip gates ran 250 files / 2228 tests green.
- `docs/plans/mvp/CX-07.md`, `SEC-01.md`, `SEC-02.md`, `UPD-01.md`, `DB-02.md`, `CX-06a.md` are the authoritative card hand-backs, each with its review dispositions; read them before touching those areas.
- Behaviour now true in the product (so the next session does not "rediscover" it): a two-organisation person sees the CX-07 message on every door; `getStaffSessionState` returns `'staff'` for PGRST116; `anon` holds no DML on any public table or view and new tables are born without it; `authenticated` cannot INSERT `registrations`; `invite_tokens` is definer-only for `service_role` (DELETE kept); `authenticated` cannot UPDATE `events.id/created_by/created_at/updated_at/deleted_at`; `updateEvent` refuses every status except `draft` for every role and refuses a soft-deleted event; `mark_attended` and `self_check_in` refuse outside the window and write nothing; the check-in desk runs on the server's clock; `registerForEvent` returns `linked`; the practitioner funnel carries an attendee-only `next` through sign-up and the wizard.
- Known open holes that are specified but NOT built (DB-04/DB-05): a signed-in colleague can still PATCH `events` detail columns or `agenda_blocks` of a PUBLISHED event or call `update_event_with_blocks` on it (200/204, no audit row); `authenticated` can still UPDATE `registrations.status/check_in_at/check_in_method` through PostgREST at any time; `update_event_with_blocks` refuses an `eventar_staff` operator from another organisation with a raw message (its org check has no operator exception).
- The hosted (Seoul) project has none of this session's migrations. Seoul is the live project; canonical prod will be a fresh Singapore project (unprovisioned). `.env.local` points at Seoul production: never read it or run anything with it loaded.

## What We Tried (Chronological)

1. (early) **CX-07 review round.** Dispatched three separate reviewers (dev, user, backtest) plus a coordinator. Result: no blocker, but all three lenses independently found the fix covers only the proxy door: `getStaffSessionState` still returned `'unknown'` for the two-row case, so `/login` (bare), `/login?next=/events/new` ("Start an Event") showed the old "try again" outage text and `/account` treated the person as a practitioner. Ivan was given options A to D; he chose A. Hypothesis A (map PGRST116 to `'staff'`): trial with the three CX-07 test files 50/50 green, the "back to unknown" mutation fails exactly the new test.
2. (early) **Live check of A found a regression.** After applying A, bare `/login` and `/login?next=` hung on "Loading…" forever (URL already at `?error=multiple_organisations`, reproduced twice; a hard reload showed the form). Root cause: `app/login/page.tsx` initialises its `view` state from the URL once; its own redirect to `/dashboard` is bounced back by `proxy.ts` with `?error=...` while the component stays mounted, so `view` stays `checking`. Fix (after Ivan allowed the two files): `skipsCheck` derived from the live param, used in the effect guard, the render gate and the child prop. A first attempt to edit that file through a python script was denied by the auto-mode classifier (no reason given); not retried through other means, Ivan then allowed the file explicitly and Edit-tool edits worked. Two new tests (with and without `?next=`) fail when either guard is reverted. Live re-check: bare `/login`, `/login?next=/events/new`, `/account` all end on the form with the message, no "Loading…".
3. (early) **Tip gate recipe established** (see Evidence): detached worktree at the exact commit, `cp -Rc node_modules`, empty `.env.local` created only in the worktree, local env from `supabase status -o env`, run tsc, eslint, vitest (with `RLS_TESTS=1`, so the RLS suite runs too) and `next build`; push only when green. First push `e1bd06f..3c147d0` carried 10 commits.
4. (mid) **SEC-01 audit.** `has_table_privilege('anon', ...)` over all 35 public tables found 11 with anon DML (accrediting_bodies, agenda_blocks, consent_records, events DELETE, organisations, organisers, registrations, speaker_checkins, staff INSERT+DELETE, survey_responses, users). Wrote the failing tests first (15 fail, 2 pass for the right reasons), then migration `20261023140000` modelled on the TRUNCATE/TRIGGER migration (blanket revoke from public, anon; per-schema and schema-less default ACL for postgres; self-check; `invite_tokens` service_role INSERT/UPDATE revoked). First full RLS run found one collateral failure (`registrations_insert_forgery` "STILL ALLOWS a normal anon registration"): rewrote it, because its probes would now be refused by the grant before reaching the policy (vacuous). Built the `insertAsRoleWithGrant` helper (rolled-back transaction, grant INSERT back, `SET LOCAL ROLE`, one INSERT) so the policy and triggers stay proven as defence in depth.
5. (mid) **SEC-01 mutation harness**: seven ACL mutants (anon INSERT on registrations 4 tests fail; anon column UPDATE on staff 2; PUBLIC DELETE on events 2; default ACL 2; service_role invite_tokens INSERT 1, UPDATE 1, loses DELETE 1), each restored and compared by md5 of exploded `relacl`, `attacl`, `pg_default_acl`. The "loses DELETE" mutant left residue (invite rows referencing staff rows) that broke the NEXT full run: fixed by making the test clear its fixtures through a postgres connection at start and in `finally`.
6. (mid) **SEC-01 reviews.** Dev lens (0/1/5/7): rollback comment wrong (restored 35 tables not 11): rewritten as an explicit list; also `registrations_link_immutability` anon test now vacuous (moved onto the helper), CI replay gate not extended (added), stale comments, sweep size guard, message assertions. Backtest (0/1/0/3): 39 direct anon probes all 42501 "permission denied for table"; and the MAJOR: `authenticated` could still POST `/rest/v1/registrations` (capacity bypass: an event capped at 2 held 3). Second migration `20261023150000` revokes it. Hosted attempt: `supabase migration list --linked` DENIED by the classifier ("Production Reads"). Not worked around.
7. (mid) **UPD-01**: `updateEvent` read `status` with the organisation check and refused non-drafts. The old admin mock returned `created_by` while the code selects `organisation_id`, so the organisation gate had never been exercised (compared `undefined !== undefined`): fixed, then dropping `status` from the select now fails 3 tests. Backtest drove the REAL action with curl and the `Next-Action` header (id found in the dev server-reference-manifest by exportedName): draft saves, published refused, other organisation gets the access error before any status message. It also found the rule is not below the action: a colleague rewrote a published event with `POST /rest/v1/rpc/update_event_with_blocks` (200) and `PATCH /rest/v1/events` (204), and changed `created_by` to their own staff id (204). That second hole became SEC-02 (`20261023160000`: UPDATE column grants rebuilt without id, created_by, created_at, updated_at, deleted_at; a real colleague PATCH of `created_by`/`deleted_at` is 42501, and the real edit RPC still saves a draft). A soft-deleted draft also saved (`deleted_at` not read): fixed.
8. (mid) **DB-02 first version failed review.** I resolved the check-in window from the `event_occurrences` row. Both the dev and the backtest lens found, independently and live, that editing an event's dates never moves its occurrence row (the only trigger is AFTER INSERT): an edited-then-published event was refused at its real start and accepted on its old date (6 of 132 local events had drifted). BLOCKER. Fix: for an event with ONE occurrence the EVENT's own `[start_time - 60 min, end_time]` decides (the card text literally said so); several occurrences keep per-occurrence windows with a started-first ordering. Rewrote the single-occurrence tests around stale occurrence rows; added 58/62-minute boundary tests after a mutation analysis showed 60 to 90 and 60 to 55 survived. A first version of the overlap test survived the "order by ordinal only" mutant; reversing the ordinals killed it.
9. (mid) **DB-02 UI.** Desk controls disabled with a reason, a ticking clock (30 s), then review: the device clock could lock the door (skewed tablet) so the desk now starts from the SERVER's clock (`serverNowMs` from the page, carried forward by elapsed browser time, re-read on `visibilitychange`). The note became an always-mounted `role="status"` region, row buttons got `aria-describedby`, the walk-in dialog message moved into the desk's voice and became `role="alert"`, a refused check-in after a walk-in registration now says the person WAS registered (with the code) instead of a bare error (Rule 12).
10. (late) **CX-06a via an executor agent.** Gave a fresh agent the card verbatim, the regime, the NEVER list and a hand-back format; it built tests first and mutation-checked every guard (63 tool calls, 1773 tests). Review round: dev lens ran about 80 hostile `next` inputs through `attendeeNextPath` (no hostile value reached a redirect), found two MAJORs: the poster page renders `RegisterCard` without `signedIn`/`isStaff`, so signed-in practitioners and organisers saw "Create your Eventar record"; and "This is now on your record." was inferred from the email while `registerForEvent` fails closed on a staff-read error and writes a plain guest row. Fixes: `signedIn` is tri-state (`undefined` shows no account prompt), `registerForEvent` returns `linked` (user_id actually written), the sentence keys on `linked`, "My record" link shows for any signed-in non-staff. User lens (partial) added the same-email sentence on the claim sign-up.
11. (late) **DB-03.** Listed the nine functions that gate on `created_by` (table in DB-03.md); only `event_registration_eligibility` (a READ of the event's own roster) was re-scoped to the organisation, the eight accreditation and role WRITES stay creator-only per Ivan's ruling 2. The public read policy `events_public_read_published` gained `and deleted_at is null` (single choke point; child public-read policies inherit it as the caller). The registrations INSERT policy also gained `e.deleted_at is null`. A first version of the defence-in-depth test used a non-staff caller and the mutation "drop the predicate" survived; making the probe a STAFF caller (JWT email claim set in the rolled-back transaction) killed it.
12. (late) **Session hygiene facts learned the hard way**: `supabase migration list --local` prints a 10k-token JSON blob (do not run it bare); `rg` through the RTK proxy fails ("Failed to spawn process"), use `grep`; zsh has no `timeout`; `git reset` without paths clears the whole index (use path-limited reset); the peer session stops the :3100 server when it finishes, so check `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) '` before dispatching any live reviewer; `agenda_blocks.kind` check allows `'workshop'` (not `'talk'`); `registrations` has `full_name`, not `name`.

## Key Decisions

- **Tri-state: option A** (map PGRST116 to `'staff'`) over B (a fourth value; `requirePractitionerSelf` allows any value it does not name, so a missed consumer fails open), C (reason only for /login and the account menu; leaves the practitioner-onboarding misroute) and D (accept). I traced all six consumers: every one uses `'staff'` only to deny a write or to frame the page.
- **Login fix by deriving `skipsCheck` from the live URL**, not by a hard navigation (`window.location`), because a hard navigation would reload the app for every ordinary organiser sign-in.
- **SEC-01**: one blanket statement (`revoke ... on all tables in schema public from public, anon`) plus default ACL rows plus a self-check, not a per-table list (the shape that failed four times, Hard Rule 11); the default ACL row only covers role `postgres`: `supabase_admin`'s row still grants anon DML and cannot be changed from a migration (the sweep test is the backstop). `authenticated` INSERT on registrations revoked in a SECOND migration (found after the first was written); authenticated UPDATE/DELETE on other tables NOT touched (separate review of every table where `authenticated` holds full DML: follow-up). `invite_tokens` DELETE kept for `service_role` (erasure/cleanup precedent).
- **updateEvent gates the platform operator too** (no `eventar_staff` exception): an update writes no audit row and P9b (audited post-publish edit) is post-MVP, so nobody can fix a typo on a published event in the MVP. This is the stated cost.
- **DB-04 spec amended** (plan text, in this repo): `update_event_with_blocks` refuses non-draft with `event_not_draft` for every role; AND the rule at every layer: a BEFORE UPDATE trigger on `events` refusing detail-column changes when OLD.status is not `draft` (publish, cancel and complete go through definer functions), a write guard on `agenda_blocks` (INSERT/UPDATE/DELETE refused unless the parent event is a draft), the RPC's UPDATE carries `and status = 'draft'` plus a row-count check (TOCTOU), `tests/rls/publish_event.rls.test.ts:372` (asserts an edit lands on a published event) is rewritten to expect `event_not_draft`; the RPC's org check needs an operator exception or the unit test's "operator may edit another organisation's draft" claim is false live.
- **Single-occurrence window = the event's own dates** (rejected alternatives: (b) an AFTER UPDATE trigger syncing the occurrence, which collides with `freeze_occurrence_window_if_credited` (raises 22023 once any credit exists, so a credited event's time edit or the demo re-seed would fail); (c) patching `update_event_with_blocks` and `seed-demo.ts` to move the occurrence, incomplete because `authenticated` can UPDATE the detail columns directly).
- **Desk clock = server time** (option 2 of dev review F2); rejected: keep the device clock (skew outage) and advisory-only note (the desk would invite scans the server refuses).
- **`registerForEvent` returns `linked`** (touches `app/(public)/events/[id]/actions.ts` and `schema.ts`, outside CX-06a's May-edit list: done because the false claim was the card's own and the change is one field with tests; disclosed in CX-06a.md).
- **Eligibility is org-scoped, the eight writes stay creator-only** (Ivan's ruling 2: tighten the UI to creator, relax the database only if multi-admin editing is wanted).
- **Hosted push is not worked around** when the sandbox denies it: stop, report, let Ivan add the rule. No Supabase MCP (CLAUDE.md), no raw psql to Seoul.
- **Executor agents for mechanical cards, coordinator keeps reviews and commits.** One card at a time; no overlap of an executor with a review of another card (shared worktree and shared local DB).
- **Frontend rule applied**: front-end review findings that change what users see are written up with before/after and options (DB-02 desk calls, CX-06a naming), not applied silently; accessibility and truthfulness fixes inside the card's own files were applied (aria-describedby, live region, the `linked` claim, the poster fail-safe).

## Evidence & Data

### Commits pushed this session (origin/main = 88f8475)
| Commit | Card | Files / lines | Note |
|---|---|---|---|
| 27c8e2d | CX-07 | 13 files, +471 -31 | 2-organisation message, option A, login fix, three review lenses |
| 3c147d0 | UX-03 test | 1 file, +8 -2 | pinned clock (Date only) in the publish-confirm test |
| 2b28418 | SEC-01 | 13 files, +689 -73 | anon DML revoke, authenticated INSERT on registrations, invite_tokens, CI gate |
| 6fac051 | UPD-01 | 4 files, +73 -9 | updateEvent draft-only gate, DB-04 spec |
| f56c0e1 | UPD-01 follow-up | 6 files, +160 -22 | soft-deleted event not found, mock honours column list, three-layer DB-04 spec, reviews |
| df07380 | SEC-02 | 5 files, +162 -3 | authenticated cannot UPDATE identity columns of events |
| cd36cff | DB-02 | 22 files, +1216 -48 | check-in window at the DB and on the desk |
| 88f8475 | CX-06a | 26 files, +1049 -50 | practitioner funnel, attendee-only next, linked flag |
(Earlier session, pushed by this one in the first push: f6bfc15, dd25258, 6d7cf21, 0446076, edc338f, b35f1e6, 5e319da, 1955985.) Pushes: `e1bd06f..3c147d0`, `3c147d0..df07380`, `df07380..cd36cff`, `cd36cff..88f8475`.

### Gate results at each pushed tip (clean detached worktree, RLS suite included)
| Tip | tsc | eslint | vitest (files / tests) | build | notes |
|---|---|---|---|---|---|
| 3c147d0 | 0 | 0 errors, 11 warnings | 242 / 2050 | exit 0 | first tip gate |
| 6fac051 | 0 | 0 errors | 241 of 242 / 2077 of 2078 | exit 0 | `PublishDraftButton.test.tsx` flaked once (113 ms), 5/5 alone |
| df07380 | 0 | 0 errors | 242 / 2085 | exit 0 | pushed |
| cd36cff | 0 | 0 errors | 245 / 2130 | exit 0 | pushed; earlier main-tree run saw `MagicLinkSignInForm.test.tsx` flake once under load (passed 3/3 alone) |
| 88f8475 | 0 | 0 errors | 250 / 2228 | exit 0 | pushed |
Plain vitest (RLS skipped): 195 files / 1639 at session start; 197 / 1671 after DB-02; 202 / 1775 at CX-06a. Known flaky (isolated reruns pass): `app/events/[id]/edit/PublishDraftButton.test.tsx`, `components/auth/MagicLinkSignInForm.test.tsx`, both under load average 6 to 9.

### `pnpm test:rls` progression (local stack)
| Moment | Files / tests |
|---|---|
| Round 1 (parent handoff) | 43 / 362 |
| SEC-01 first run | 43 / 379 passed, 1 failed (registrations forgery) |
| SEC-01 final | 43 / 380 |
| After authenticated INSERT revoke and helper | 43 / 383 |
| SEC-02 | 43 / 389 |
| DB-02 first / final | 44 / 404, 44 / 410 |
| DB-03 (current) | 45 / 418 |

### Review counts per card (B / M / m / n)
| Card | Dev | Backtest | User |
|---|---|---|---|
| CX-07 | 0/2/6/8 | 0/2/2/4 | 0/4/3/3 |
| SEC-01 | 0/1/5/7 | 0/1/0/3 | n/a (no screen) |
| UPD-01 | 0/1/4/5 | 0/1/4/3 | n/a (error string only) |
| SEC-02 | none (10-line grant change proven by the real RPC, a real PATCH, full suite) | none | none |
| DB-02 | 1/1/5/9 | 1/0/1/1 | 0/0/4/7 (live walk) |
| CX-06a | 0/2/3/6 | 0/0/2/2 | 0/1/5/5 (partial) |
| DB-03 | pending | pending | pending |

### Mutation tallies (each restored byte-identical, md5 or `cmp`)
| Card | Mutants and failing tests |
|---|---|
| CX-07 | PGRST116 back to unknown 1; proxy branch dropped, each auth branch, dictionary key (4 files fail); `requireStaff` logging unconditionally 1; NewEventForm clock pinned 10:00 instead of 06:00 1; login `skipsCheck` effect guard 2, render guard 2 |
| SEC-01/02 | anon INSERT registrations 4; anon column UPDATE staff 2; PUBLIC DELETE events 2; default ACL 2; service_role INSERT/UPDATE/loses DELETE on invite_tokens 1 each; authenticated INSERT registrations 1; seed lines removed (named table in the failure); events created_by UPDATE granted 2; seed re-grants created_by 1; registrations policy weakened 4 (forgery tests); trigger disabled 2 (link immutability) |
| UPD-01 | status gate dropped 4; organisation gate dropped 1; select drops status 3; deleted_at gate dropped 1 |
| DB-02 | old `mark_attended` 7; old `self_check_in` 3; pre-open 0 min 2; 60 to 90 1; 60 to 55 1; no started-first ordering 1; end check shifted 4; desk: no tick 2, row ignores clock 1, scan buttons ignore reason 4, device clock instead of server 2, no visibilitychange 1; walk-in orphan message dropped 1 |
| CX-06a | executor ran per-guard mutations (hero href, RegisterCard 6, RecordClient 3, attendeeNext 4, action 2, pages 6, complete page 7); review round: create prompt `!signedIn` 1, sentence ignores `linked` 1, staff guard dropped 1, action always linked (3 action tests), same-email sentence everywhere 1 |
| DB-03 | events policy without deleted_at 4; eligibility back to creator-only 1; eligibility with no gate 1; registrations policy without deleted_at 1 (after the staff-claims probe) |

### Migrations written this session (all LOCAL only; none on hosted)
| Version | File | Purpose |
|---|---|---|
| 20261023140000 | `revoke_anon_dml_and_invite_tokens_service_role_writes.sql` | anon DML off every public table/view + default ACL; invite_tokens service_role INSERT/UPDATE revoked; self-check |
| 20261023150000 | `revoke_authenticated_insert_registrations.sql` | authenticated INSERT on registrations revoked |
| 20261023160000 | `events_authenticated_cannot_update_identity_columns.sql` | UPDATE re-granted column by column without id, created_by, created_at, updated_at, deleted_at |
| 20261023170000 | `check_in_only_inside_the_live_window.sql` | `mark_attended` + `self_check_in` window logic (event window for one occurrence) |
| 20261024100000 | `teammate_eligibility_and_soft_delete_privacy.sql` | UNCOMMITTED: eligibility org-scoped; events public read excludes deleted; registrations INSERT policy excludes deleted |
Each was replayed in `begin; ...; rollback;` with `ON_ERROR_STOP` before applying (skill `eventar-migration-replay-rollback`). The DB-02 file was edited and re-applied with `psql -f` several times locally (create or replace is idempotent); it has not been pushed anywhere.

### Local data facts measured
- 35 base tables in `public` (11 held anon DML before SEC-01). 64 non-trigger public functions, 55 SECURITY DEFINER; the only non-definer writers are `create_event_with_blocks` and `update_event_with_blocks` (INVOKER, run as `authenticated`, executable by anon but die at the table grant).
- `authenticated` column UPDATE list on `events` after SEC-02: title, topic, start_time, end_time, timezone, description, poster_path, max_attendees, venue_name, venue_address, city, region, country, latitude, longitude, registration_close_at, hosted_by, organized_by, hero_image_url, category, format, checkin_modes, registration_open_at. Definer-only: status, organisation_id, published_at, accrediting_body_id, cpd_hours.
- 6 of 132 local single-occurrence events had drifted occurrence dates when DB-02 was reviewed (some from review fixtures).
- Permanent residue (audit rows are append-only by design): backtest/user lens fixtures left 15 + a few audit rows, 2 `consent_granted` rows, 1 `invite_accepted`; a few `rate_limits` counters.
- Registrations policies today: `registrations_anon_insert_when_event_published` INSERT {anon, authenticated} (unreachable over PostgREST since SEC-01), SELECT: manager_select_all, org_member_select, self_read; UPDATE: org_member_update (no status/time predicate: DB-05).

### Raw evidence worth keeping
```
DB-02 drift query (before the fix): 6|132   -> 6 single-occurrence events whose occurrence dates differ from the event's
SEC-01 anon sweep after migration: 0 rows; has_table_privilege('authenticated','public.registrations','INSERT') = f; service_role = t
CI gate queries run against the local DB: clean -> "[] [] [f]"; with injected grants they name "staff UPDATE", "INSERT", "t"
```
Review/evidence files: `docs/plans/mvp/REVIEW-*.md` (every lens, full tables), card hand-backs `docs/plans/mvp/<CARD>.md`. Scratchpad (session-scoped, may vanish): `/private/tmp/claude-501/-Users-ivan-Eventar/547afdcb-1014-4bb0-a64e-6d7b404b53e8/scratchpad/` holds `gate.sh` (the tip-gate script, takes the worktree path on its second line), `mutate.sh` (SEC-01 ACL mutation harness), `rls-full*.out`, `*.good` backups. Rebuild from this file if gone.

## Code Analysis

- `lib/auth.ts` `getStaffSessionState(client?)`: tri-state `'staff' | 'not_staff' | 'unknown'`; PGRST116 (two active rows for the email) logs `[auth] staff email matches more than one active row { userId, code }` (UUID and code only) and returns `'staff'`; every other staff-read error still `'unknown'`; `isStaffSession` = `=== 'staff'` (fail-open); `requireStaff` logs PGRST116 and throws the DB error (never `NotAuthorizedError`). Consumers (all use 'staff' only to deny/frame): `requirePractitionerSelf` and `acceptRequiredConsents` (deny), `registerForEvent` (attaches user_id only when `not_staff`), `getAccountMenuState`, `/account` layout, the public event page.
- `proxy.ts`: staff read `.maybeSingle()`; PGRST116 redirects to `/login?error=multiple_organisations` (session kept, `redirectWithCookies`), drops `?next=` (consistent with the sibling `unavailable` redirect). `app/login/page.tsx`: `skipsCheck = Boolean(urlErrorCode && urlErrorCode !== 'not_organiser')`, used for initial state, effect guard (deps include it), `if (view.kind === 'checking' && !skipsCheck) return <LoginShell/>`, and `view.kind === 'form' && view.checkFailed`.
- `app/events/[id]/edit/updateAction.ts`: admin read `select('organisation_id, status, deleted_at')`; order: requireStaff, id validation, `!row || row.deleted_at` -> "Event not found.", organisation check (operator exempt) -> "You do not have access to this event.", status gate -> "This event is no longer a draft, so its details cannot be edited yet. Your changes were not saved.", then payload validation and the RPC. The test's admin mock projects the requested columns.
- `mark_attended(p_code, p_method, p_actor_override)` (`SECURITY DEFINER`, `search_path public, pg_temp`, executable by authenticated + service_role): actor via `app_private.resolve_actor`, org check -> `not_recognised`, `rate_limit_check('markAttended:'||event_id, minute window, 600)`, cancelled/unavailable guards, then the DB-02 resolution: count occurrences; 0 -> `no_matching_occurrence`; 1 -> `now() < events.start_time - 60 min` => `not_open_yet`, `now() > events.end_time` => `closed`, else that occurrence; >1 -> `tstzrange(starts_at - 60 min, ends_at, '[)') @> now()` ordered `(starts_at <= now()) desc, ordinal`, none => `closed` if no occurrence has `ends_at > now()` else `not_open_yet`; then idempotent insert into `registration_checkins`, `status = 'attended'`, evidence (best effort), audit event LAST. `self_check_in(p_code, p_ip)` (service_role only) has the same resolution after its existing event-level window and `self_serve_off` checks.
- `lib/lifecycle/eventLifecycle.ts`: `CHECKIN_OPEN_MINUTES = 60`; `computeLifecycle(row, nowMs)` ('live' from start-60 to end inclusive); `checkInClosedMessage('not_open_yet'|'closed')`; `checkInGateMessage(lifecycle)` (null when live; 'drafted' -> "Publish the event before checking people in."); `walkInClosedMessage` now delegates to it. The attendee pass page (`app/(public)/checkin/confirm/*`) keeps its own attendee-voiced copy.
- `app/events/[id]/checkin/RosterClient.tsx`: props `lifecycleRow`, `serverNowMs`; `clockOffsetMs = serverNowMs - Date.now()` at mount; tick = `Date.now() + offset` every 30 s and on `visibilitychange`; `checkInClosed = checkInGateMessage(computeLifecycle(lifecycleRow, nowMs))` feeds Scoreboard, `ScanAndManual` (`closedMessage`), each row's Check in (`disabled`, `title`, `aria-describedby="checkin-closed-note"`), the walk-in dialog. `ScanAndManual` renders `<p role="status" id="checkin-closed-note">` always (sr-only "Check-in is open." when open).
- `walkInRegisterAndCheckIn`: access check (`canManageEvent`) BEFORE the lifecycle gate; registration insert with `source: 'walk_in'` and no `user_id`; email_log skipped row; then `markAttended(code, 'manual')`; a refusal after the insert returns "<name> was registered (code ...) but not checked in. <reason>".
- `registerForEvent` returns `{ ok: true, emailDelivery, linked: canAttachUserId }` (`RegisterResult` in `schema.ts`). `components/RegisterCard.tsx`: `signedIn` tri-state; create prompt only when `signedIn === false && !isStaff`; signed in: "My record" link, sentence only when `state.linked`.
- `app/account/sign-in/attendeeNext.ts`: `attendeeNextPath(raw)` = `safeNextPath` + `classifyPath(resolvedPath) === 'attendee'`; `wizardLandingPath(next)` additionally refuses `/account/complete` itself. Sinks: `sendAttendeeMagicLink`, sign-in page, sign-up page (wraps the emailed link in `/account/complete?next=<dest>` only when a destination exists), `/account/complete` page and `CompleteClient` (Done lands on the gated destination, default `/account/record`). `app/auth/callback/route.ts` applies only `safeNextPath` (it serves both doors) and its `errorBase` heuristic uses `classifyPath` on the raw string (dot-segments mislabel; cosmetic).
- `tests/helpers/insertAsRole.ts`: `insertAsRoleWithGrant(role, table, row, jwtClaims?)` returns `{ok:true}` or `{ok:false, code, message}`; connects as postgres, `grant insert`, optional `set_config('request.jwt.claims', json, true)`, `set local role`, one INSERT, always `rollback`. Table and column names are regex-checked.
- DB-03 SQL: `event_registration_eligibility(p_event_id, p_actor_override)` gate `actor.role <> 'eventar_staff' and v_event.organisation_id is distinct from actor.organisation_id` -> 42501 "... is not in your organisation"; nonexistent event still raises P0002 (existence leak across organisations to a signed-in staff member: the dev lens was asked to judge). `events_public_read_published` `using (status = 'published' and deleted_at is null)` TO anon, authenticated (dropped and recreated inside the migration transaction).

## Files Changed

### Source code (pushed)
- `lib/auth.ts`, `proxy.ts`, `components/auth/auth-error-messages.ts`: CX-07 (PGRST116 handling, one dictionary key).
- `app/login/page.tsx`: live `skipsCheck`.
- `app/events/[id]/edit/updateAction.ts`: draft-only gate, soft-deleted handling.
- `app/(public)/events/[id]/actions.ts`, `schema.ts`: `linked`; comments on the registration insert posture.
- `lib/lifecycle/eventLifecycle.ts`; `app/events/[id]/checkin/{actions.ts,RosterClient.tsx,ScanAndManual.tsx,page.tsx}`: DB-02.
- `components/RegisterCard.tsx`, `components/landing/LandingHero.tsx`, `app/account/{record/RecordClient.tsx,complete/page.tsx,complete/CompleteClient.tsx,sign-in/{actions.ts,page.tsx,attendeeNext.ts},sign-up/page.tsx}`: CX-06a.
- `supabase/migrations/20261023140000` to `20261023170000` and `supabase/seed.sql` (re-asserts anon/invite_tokens/registrations revokes and the events column grant), `scripts/ci/replay-and-verify.sh` (CI gate for anon DML, invite_tokens, authenticated registrations INSERT), `scripts/demo/seed-demo.ts` (comment only).

### Tests (pushed)
- `lib/auth.test.ts`, `proxy.test.ts`, `components/auth/auth-error-messages.test.ts`, `app/login/page.test.tsx`, `app/events/new/NewEventForm.test.tsx`; `app/events/[id]/edit/updateAction.test.ts`; `tests/rls/{audited_table_writes,seed_grant_posture,registrations_insert_forgery,registrations_link_immutability,checkin_window,mark_attended,self_check_in}.rls.test.ts`, `tests/helpers/insertAsRole.ts`; `lib/lifecycle/eventLifecycle.test.ts`, `app/events/[id]/checkin/{actions,walkIn,RosterClient,ScanAndManual}.test.*`; `components/RegisterCard.test.tsx`, `components/landing/LandingHero.test.tsx`, `app/account/**` tests (attendeeNext, nextGate, actions, complete page/client, sign-in/up pages, RecordClient), `app/(public)/events/[id]/actions.test.ts`.

### Docs (pushed)
- `docs/plans/2026-10-11-mvp-execution-plan.md` (DB-04 text amended twice; O7 row marked closed), `docs/DEFERRED.md` (±24 h row records DB-02), `docs/plans/demo-run-sheet.md` (Beat 4 needs the mid-demo re-seed), `docs/plans/mvp/*` (hand-backs and reviews listed above).

### Uncommitted at the time of writing (DB-03 + others')
- Mine, DB-03: `supabase/migrations/20261024100000_teammate_eligibility_and_soft_delete_privacy.sql`, `tests/rls/event_soft_delete_privacy.rls.test.ts`, `tests/cpd/roster_eligibility.rls.test.ts` (modified), `tests/helpers/insertAsRole.ts` (modified), `docs/plans/mvp/DB-03.md`, `docs/plans/mvp/LOCK-DB-03`.
- Not mine (leave unstaged): `package.json`, `pnpm-lock.yaml` (motion dependency), `app/dev-preview-uiport/ux-fu1/**`, `docs/plans/mvp/UX-FU1.md`, `docs/plans/mvp/.claude/`, `graphify-out/**`, `supabase/snippets/`, `.claude/skills/**` ledgers, `.agents/**`.

## User Feedback & Preferences (REQUIRED)

- 2026-10-24 first message: "Read docs/plans/handoff_20261023-mvp-execution.md and continue the queue from item 1."
- Button replies: "Apply option A from REVIEW-CX07.md: map PGRST116 to 'staff' in getStaffSessionState, update the test to match, then live-check /login bare, /login?next=/events/new and /account as a two-organisation person." and "Yes, edit app/login/page.tsx and app/login/page.test.tsx with the diff in REVIEW-CX07.md, add the test, then live-check bare /login and /login?next=/events/new as a two-organisation person."
- Mid-turn, verbatim: "stop asking me unless you absolutely have to, for frontend design choice present them to me. keep working through the MVP plan in its entirety. one task at a time, review inbetween task, backtest then push. migration too if you have to". This is the explicit go for `git push` after each card and for `supabase db push --linked`; the standing rule "never `git push` without Ivan's explicit go" is satisfied by it, but hosted pushes are blocked by the sandbox (see §0).
- "Try again" twice (session hiccups): carry on from the last verified state, do not restart.
- Relayed (not authority) via the second session: invite_tokens "your recommendation"; the motion dependency "keep it"; the specimen round is the second session's.
- Standing rules in CLAUDE.md that bit: Rule 14 (investigate before escalate: dispatch agents, bring investigated cases), Rule 7 (surface conflicts, do not average), 3-options rule for conflicting skills/agents (frontend), "frontend reviews: show the difference, Ivan decides", phase-completion protocol (dev + user + backtest, SEPARATE agents), ponytail and caveman and adhd output modes (terse; code first; no unrequested prose; persisted docs in plain prose), no superpowers skills on ongoing work, commit by pathspec with `GIT_LITERAL_PATHSPECS=1`, never `git add -A`, never touch Seoul or `.env.local`, no em-dash in new user-facing copy (Q41).
- Ivan wants specific numbers and evidence tags ([X] executed / [R] read / [I] inferred) and honest reporting: say "not live-verified" or "unwalked" rather than imply.

## Where We're Going

1. **Finish DB-03** (immediate). When the three reviewer hand-backs arrive: open `docs/plans/mvp/REVIEW-DB03-{dev,backtest,user}.md`, re-run each MAJOR claim by execution (Rule 14), fix what sits in DB-03's own files (the migration is applied locally and uncommitted, so edit it, replay it rolled back, re-apply with `psql -f`), re-run the mutation set, `pnpm test:rls` (take `scratch-demo/locks/test-rls.lock` first), plain vitest, tsc, eslint; update `DB-03.md` with the review dispositions; commit by pathspec; tip gate in a worktree; push; remove `LOCK-DB-03` and `dev-3100.lock`; stop the :3100 server if no other lens needs it.
2. **CX-04** (mechanical, M): executor agent with the CX-06a prompt shape; the card text is in section 7.1 of the plan (Programme shows drafts and links rows to `/events/<id>/details`; one sentence under each page title with the exact copy given; crash-page exit "Back to Programme"; walk O9 as `ux-admin`). No DB; reviews: dev + backtest + user lens (live walk as `ux-admin` and `ux-member`).
3. **DB-04** (sql, L): the amended spec (see Key Decisions): per-block upsert keyed by block id, `block_has_survey_answers`, display_order = payload index, lifecycle lock `event_not_draft` at the RPC, events BEFORE UPDATE trigger, agenda_blocks guard, TOCTOU `and status = 'draft'` row-count check, rewrite `publish_event.rls.test.ts:372`; operator exception in the RPC's org check; carry block ids through `schema.ts`, `AgendaSection`, `NewEventForm`, `updateAction.ts` (returns `blockIds`).
4. **UX-02** (design, Q41-decided practitioner shell; pipeline order impeccable-design-polish, hallmark then frontend-design, the four stage-3 skills, ui-ux-pro-max, emilkowalski-motion then review-animations; 3-option AskUserQuestion on skill disagreement or present options), **CX-06b**, **UX-04** (needs DB-02 committed: it is), **DB-05** (stretch).
5. After Ivan's picks: the UX-FU1 builder cards (surfaces 1 to 12) and the creator-predicate UI (accreditation field, wizard, roster role chips, `created_by` added to the check-in page select).
6. Hosted migration push once permitted (§0 decision 1), then mark the five migrations applied in the card hand-backs.

## Risks & Blockers

- Hosted push blocked by the sandbox classifier (needs Ivan's rule). Seoul's current schema state is unknown; the migrations' self-checks raise and roll the push back if a table's grantor/owner is not `postgres` (dev F7 gives a read-only pre-flight query: `select c.relname, pg_get_userbyid(c.relowner), a.grantee::regrole, a.grantor::regrole, a.privilege_type from pg_class c, lateral aclexplode(c.relacl) a where c.relnamespace='public'::regnamespace and a.grantee='anon'::regrole and a.privilege_type in ('INSERT','UPDATE','DELETE')`, expecting grantor = owner = postgres on every row).
- Shared tree and shared local DB: other sessions may edit files or stop the dev server; never run `pnpm test:rls` and `next build` together; take the lock files in `scratch-demo/locks/` (`test-rls.lock`, `dev-3100.lock`; a peer once deleted mine by mistake); `git status` before staging.
- Flaky component tests under load (PublishDraftButton, MagicLinkSignInForm): report the first failure, rerun alone; a class fix (e.g. raising RTL `asyncUtilTimeout`) was not applied.
- Reviewer agents overrun their call budgets (the lens counts parallel batches as calls) and the user-lens agents often finish partial: resume with `SendMessage` and state what was not reached.
- Not rehearsed end to end: the demo path (Beat 3 then `DEMO_START_OFFSET_MIN=-30`); the wizard's Professional/Licence steps with `next`; the signed-in success card states and staff card in a real browser (CX-06a user lens did not reach them).

## Open Questions

- Does the hosted Seoul project hold tables whose ACL grantor is not `postgres` (the SEC-01 self-check would then raise)? Unknown until the read-only pre-flight can run.
- DB-03: does `event_registration_eligibility` leak event existence across organisations (P0002 vs 42501)? The dev lens was asked; compare with sibling functions.
- Should `/events` (the public listing) be an honoured `next` for attendees? (`attendeeNextPath` treats it as not attendee; nothing produces it today.)
- The 8 accreditation/role write RPCs stay creator-only: Ivan to confirm that multi-admin editing is NOT wanted, otherwise relax them in DB-04 or a follow-up.

## Quick Start for Next Session

```bash
cd /Users/ivan/Eventar
# 1. State
git status -s | grep -v '^?? \.\(agents\|claude\)/' | grep -v '\.claude/skills'   # expect the DB-03 files above + package.json/pnpm-lock (not mine)
git log origin/main..main --oneline                                                # expect empty
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(3000|3100|3200) ' || echo no-dev-server
ls scratch-demo/locks docs/plans/mvp | grep -i lock
supabase status 2>&1 | head -3                                                     # local stack up (do NOT run `supabase migration list --local` bare: 10k tokens)
ls docs/plans/mvp/REVIEW-DB03-*                                                    # reviewer files appear as agents finish

# 2. Local env for RLS tests (never read .env.local)
_e="$(supabase status -o env 2>&1)"; g(){ printf '%s\n' "$_e" | sed -n "s/^$1=\"\(.*\)\"\$/\1/p"; }
export NEXT_PUBLIC_SUPABASE_URL="$(g API_URL)" NEXT_PUBLIC_SUPABASE_ANON_KEY="$(g ANON_KEY)" SUPABASE_SERVICE_ROLE_KEY="$(g SERVICE_ROLE_KEY)" RLS_TESTS=1
( set -C; echo "<you> $(date -u +%FT%TZ)" > scratch-demo/locks/test-rls.lock )   # before test:rls; rm when done
pnpm test:rls                                                                    # expect 45 files / 418 tests until DB-03 review changes it

# 3. Replay + apply a migration (skill eventar-migration-replay-rollback)
(echo "begin;"; cat supabase/migrations/20261024100000_teammate_eligibility_and_soft_delete_privacy.sql; echo "rollback;") | /opt/homebrew/opt/libpq/bin/psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -q
# after editing the (local, uncommitted) file: psql ... -v ON_ERROR_STOP=1 -q -f <file>

# 4. Commit by pathspec (skill eventar-commit-card-groups); never git add -A; GIT_LITERAL_PATHSPECS=1; quote Next routes with brackets; use path-limited `git reset -q -- <paths>` only
# 5. Tip gate then push (recipe): git worktree add --detach <scratch>/verify-<sha> <sha>; cp -Rc node_modules <wt>/; : > <wt>/.env.local;
#    in <wt> with local env exported (refuse unless API_URL is 127.0.0.1): pnpm exec tsc --noEmit; pnpm exec eslint .; pnpm exec vitest run; pnpm exec next build;
#    all green -> git worktree remove --force <wt> && git push origin main
# 6. Reviewer dispatch: Agent prompt MUST start with "Budget: max N tool calls; scope = ...; prefer read_page/get_page_text over screenshots; report partial findings at the cap."
#    state the regime (ongoing project, no superpowers skills), the NEVER list, the lens, the hand-back file (only that file), fixtures prefix, cleanup counts.

# Key files to read first
docs/plans/handoff_20261023-mvp-execution.md   # parent (protocol section is still the contract)
docs/plans/mvp/DB-03.md  docs/plans/mvp/DB-02.md  docs/plans/mvp/CX-06a.md  docs/plans/mvp/UPD-01.md
docs/plans/2026-10-11-mvp-execution-plan.md    # sections 3.2, 4, 7.1 (CX-04), 7.2 (DB-04)
supabase/migrations/20261024100000_teammate_eligibility_and_soft_delete_privacy.sql

# Next action
# Wait for the three DB-03 reviewer hand-backs (agents a8a8573e1ec3007d9, a2f399b33babbb344, ac9c1b8ff32bea9e5), or if none arrives, `ls docs/plans/mvp/REVIEW-DB03-*` and SendMessage each id to resume it. Then triage, fix, gate, commit, push.
```

---

## Session Closed
**Closed at:** 2026-10-24 (HKT, evening)
**Commit:** the `session: mvp-execution-2` commit that includes this note
**Session status:** Handed off to next session
**LINE CHECK note:** this file is about 300 lines, under the 500-line Chunked minimum. Ivan objected to the token cost of the handoff and the padding was stopped on purpose. Per-finding tables live in `docs/plans/mvp/REVIEW-*.md` and the card hand-backs; the scripts the tip gate used are rebuilt from the "Quick Start" recipe; remaining card text is in the plan, sections 7.1 to 7.3.
