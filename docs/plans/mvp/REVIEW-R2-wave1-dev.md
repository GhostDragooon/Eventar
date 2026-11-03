# REVIEW R2, wave 1: dev lens

Date: 2026-11-02. Base: HEAD 4c04977 plus the uncommitted working tree. Lens: DEV (separate from user-lens and backtest).
Tool calls: about 36 of the 60 cap (status COMPLETE, nothing left unread in scope).
Scope: cards B (email lock), D (check-in role gate, walk-in), G (agenda sort), H (venue search + timezone notice), I (copy), plus callers of changed signatures.
Evidence tags: [X] executed, [R] read, [I] inferred.

Executed: `pnpm exec vitest run` on lib/agenda, lib/auth, VenueSearchBox, app/events/[id]/checkin, app/events/[id]/registrations, edit/page.test, NewEventForm.test: 17 files, 250 tests passed [X]. `pnpm exec tsc --noEmit`: clean, exit 0 [X]. Read-only psql against the local stack for grants, trigger bodies, function bodies, constraint definitions, row counts [X]. NOT run: test:rls, next build, any state-changing git/DB command. The new RLS tests (B) were not executed by me, so "would fail without the fix" for them is [R].

Counts: BLOCKER 0, MAJOR 1, MINOR 7, NIT 5.

---

## Findings

### MAJOR

**M1. Typed times are read in the browser's zone and stored against the venue's zone; the new notice does not say so. A non-HK venue can silently shift the stored instant relative to what the organiser typed.** [R, whole path traced; not executed]

Path:
1. Form (components/event-form/DateTimeSection.tsx): organiser types 09:00 on 2026-12-01.
2. Payload (app/events/new/NewEventForm.tsx:434-435, 454-455, 696-698): `new Date('2026-12-01T09:00:00').toISOString()`. A no-offset ISO string is parsed in the BROWSER's zone. There is no use of the venue zone anywhere in the encode (grep for timezone in the file finds only the hint, the notice and the `publishFacts` argument).
3. Server (app/events/new/actions.ts:124, app/events/[id]/edit/updateAction.ts:143): `timezone = tzFromCoords(lat, lon)`; `start_time` is stored untouched as the instant from step 2.
4. Display: `formatInTz(start_time, events.timezone)` (venue zone).

Concrete example: organiser's laptop is in Hong Kong (UTC+8), venue is in London (Europe/London, UTC+0 in December), organiser types 09:00 meaning 09:00 London. Stored instant = 09:00 HKT = 01:00Z. Event page, check-in window, reminders and the CPD window all derive from that instant and display 01:00 London. Eight hours off, no error anywhere. The new notice (NewEventForm.tsx:633-640) reads "This venue is outside Hong Kong, so the event time will be shown in Europe/London time." That reassures the organiser and does not say the 09:00 they typed was read as Hong Kong time. The one line that does say it ("Times are in your local timezone. The event page will display them in the venue's local time.", DateTimeSection.tsx:111) is 12px helper text further down and names no zone.

Same hazard on edit: `parseLocalDateTime` (NewEventForm.tsx:152-199) shows the stored instant in the editor's browser zone, so a London organiser opening an HK event sees shifted wall-clock times. A save with no change round-trips the same instant, so it is not corrupting. Agenda blocks are rebuilt on `datetime.date` (the browser-local date of the event start), so if the browser zone puts the event window across local midnight, blocks after midnight are rebuilt on the wrong day [I].

Mitigation that exists: the publish confirm dialog (lib/publishFacts.ts) formats the start in the venue zone with the zone name [R]. A careful organiser catches the 8-hour shift there, at publish, not when typing. Drafts and the preview carry the shifted time until then.

Proposed fix, smallest first:
- Copy only (cheap, same card): replace the notice with one that names both zones and shows the result: "You are entering times in your browser's zone (Asia/Hong_Kong). This venue is in Europe/London, so 09:00 here will show as 01:00 there." Compute with `formatInTz`.
- Real fix: encode and decode form times in `venueTz` (`fromZonedTime`-style on submit, `formatInTz` on load) for start, end, block times and registration bounds. Touches all encode sites above. Needs Ivan's decision (it changes what "local" means in the form).

---

### MINOR

**m1. The email lock holds against a concurrent check-in, but only through a trigger side effect, with no test and no explicit lock in `mark_attended`.** [R + X for the trigger body; the race itself NOT executed]

What I established:
- `update_registration_contact` takes `SELECT ... FOR NO KEY UPDATE` on the registration row, then checks `status = 'attended' OR exists(registration_checkins)`, then writes. [R]
- `mark_attended` (20261023170000, lines 41-140) reads the registration with a plain SELECT (no lock) and inserts into `registration_checkins`. The FK check on that insert takes only `FOR KEY SHARE` on the registrations row, which does NOT conflict with `FOR NO KEY UPDATE`. [R]
- The row lock that actually serialises them is the AFTER INSERT trigger `registration_checkins_sync_summary` -> `sync_registration_checkin_summary()`, which runs `update public.registrations set check_in_at, check_in_method ... where id = new.registration_id` at checkin-insert time. I read the live function body from the local DB. [X read of live definition]
- So the two orders are: (a) check-in inserts first: its trigger holds the row lock until commit; the edit's `FOR NO KEY UPDATE` blocks, then re-reads the committed row (status attended, check-in row visible) and refuses. (b) The edit locks first: the check-in's trigger update blocks until the edit commits; the check-in then commits after the email change. Serial order is "edit, then check-in", which the rule allows (the email changed before attendance). No path commits an email change after the attendance commit. Audit lock order is row first then advisory in both functions, so no deadlock [R].
- Latent coupling: if that trigger is ever made conditional, moved, or dropped, the guarantee silently disappears and nothing fails (the existing "linked while an edit waits" test covers `claim`, not check-in).

Fix: add `select 1 from registrations where id = v_reg.id for no key update` in `mark_attended` before the checkin insert (one line), and/or an RLS concurrency test modelled on the existing "linked while an edit waits" test: connection A inserts a checkin row inside an open transaction, connection B edits the email, A commits, assert B is refused.

Other paths that change `registrations.email`: none found. Only `service_role`/`postgres` hold UPDATE on the table (authenticated and anon have none) [X], the only SECURITY DEFINER functions matching `update registrations` are `sync_registration_checkin_summary`, `self_check_in`, `claim_registrations_for_user`, `mark_attended`, `update_registration_contact` and only the last writes `email` [X + R]; no app/lib code does `.update({... email ...})` on registrations [R, grep]. `service_role` can still write email directly; that is by design for the admin client and not reachable from a staff action.

Data check: 713 attended rows all have a checkin row; 0 rows have `check_in_at` set without a checkin row and non-attended status [X]. So the two-part predicate has no legacy hole in local data.

**m2. The audit payload carries an UNSALTED sha256 of each email.** [R]
20261102100000 lines ~96-99. The raw address is kept out of the append-only chain, which meets Rule 10. But anyone who can read `audit_events` can test a guessed address against `email_before_sha256` / `email_after_sha256`, and a data-subject erasure cannot remove it from the chain. Acceptable if the audit table is staff-only; it should be a recorded decision (vault Decisions Log) rather than an implicit one. Alternative: store only a keyed hash (secret in a Postgres setting) or a truncated prefix. Not a blocker for MVP.

**m3. `markAttended` maps EVERY 42501 to "Your role cannot check people in."** (app/events/[id]/checkin/actions.ts:163-164) [R]
`resolve_actor` and `require_active_staff` raise 42501 for a wrong role AND for a suspended/removed staff row, and any grant regression inside the definer would also surface as 42501. The scan path (hot path at the door) then tells a staff member their role is wrong when the real cause is different, and a broken grant is reported as a role message instead of a 500 that someone investigates (Rule 12). Fix: match the role case only, e.g. `error.message.includes('not active staff')`, and let other 42501s throw. The unit test (`maps 42501 to a plain message`) uses message "permission denied", so it would still pass with a stricter match only if the fixture message is changed; update it with the fix.

**m4. Walk-in check-in leg: `catch {}` drops the cause.** (checkin/actions.ts:375-384) [R]
Logs `regId` only (good, no PII) but not the error code or name, so a timeout vs a TypeError are indistinguishable in logs. Add `code`/`name` to the log object. The user-facing message is correct and complete: person named, code, "Use Enter code with X to finish". If the RPC actually committed and only the response was lost, Enter code answers "Already attended" with the timestamp, which is the right outcome. No insert happens for a refused role: the `canCheckIn` check (line 295) sits before the capacity count and the insert, and the unit test asserts `mockFrom` was called once (event read only) [R].

**m5. VenueSearchBox reopens the dropdown after a pick (pre-existing, adjacent to F50).** [R, not executed]
`pick()` sets the query to the venue name and closes the list; the changed query re-runs the effect, 350 ms later a new Nominatim request is made (an extra request per pick against the 1 req/s policy) and its answer calls `setOpen(true)` (line 58). Result: rows for the picked name reappear under the pointer, the exact hazard F50 describes. The new test asserts the list is gone immediately after Enter, not 400 ms later, so it does not catch this. Fix: remember the picked text (`pickedRef`) and skip the search while `query === pickedRef.current`.

**m6. VenueSearchBox: blur-abort leaves the box in a permanent "searching" state, and search failures read as "No matches".** [R]
- `onBlur` aborts the in-flight request. `found.forQuery` then stays stale, so `searching` is true for that text indefinitely; refocusing shows nothing (list needs `displayResults.length > 0`) and nothing retries until the text changes. Fix: on abort-by-blur, record `forQuery: q` with the old rows, or retry on focus.
- A non-OK Nominatim response (`lib/nominatim.ts:96` throws `Nominatim error 429`) is caught and stored as `{forQuery: q, venues: []}`, so the dropdown says "No matches. Try a more specific name". A rate limit or network error is presented as a content answer (Rule 12). Fix: keep an `error` state and say "Search is unavailable, try again".

**m7. ArrowUp with nothing highlighted selects the second-to-last row.** (VenueSearchBox.tsx:87-91) [R, arithmetic]
`(-1 + -1 + n) % n = n-2`. Convention is the last row (`n-1`). Fix: `a < 0 ? n-1 : (a + step + n) % n` for ArrowUp.

**m8. Agenda re-sorts live while a start time is edited, and the code comment overstates the match with what is stored.** (components/event-form/AgendaSection.tsx:158-161) [R/I]
- Components and Breaks render in two separate lists but are stored as one interleaved list sorted by start, so "what the person sees is what is stored" holds within each list, not across. The comment should say that; the on-screen sentence "Blocks are ordered by start time." is accurate.
- Picking a start time moves the card as soon as the value changes. React keeps state by `key`, but moving a DOM node that holds the open time picker can drop focus/popover [I]; the user-lens should look at it.

---

### NIT

- **n1.** `sortBlocksByStart` uses `localeCompare` on HH:MM strings (lib/agenda.ts:25). ICU collation can order punctuation unexpectedly in some locales; plain `<` comparison is exact for zero-padded 24h strings. Ties are by entry order only (end time not considered): two blocks starting together keep entry order, stable [X, the test shows it].
- **n2.** Hash expression: before-hash uses `lower(btrim(v_reg.email))` (trims spaces only), after-hash uses the `\s` trim already applied to `v_email`. For a stored address with a tab/newline the two differ in normalisation; the JS test helper uses `.trim()` (all whitespace). Stored emails are trimmed at entry, so no practical effect.
- **n3.** `canCheckIn` is the third identical function (with `canPublishEvents`, `canEditRegistrations`). Matches the project's one-function-per-RPC convention (Rule 11 of the behaviour contract), so I do not recommend merging. `walkIn.test.ts` mocks `@/lib/auth` with a hand-copied role list, so drift between the mock and the real function is invisible there; the real function is pinned in `lib/auth.test.ts` with all 5 roles [R].
- **n4.** edit/page.tsx copy: "Details are locked after publishing" also renders for a draft that was cancelled before ever being published (any `status !== 'draft'`). Cancelled branch otherwise handled correctly (no "cancel it" or "registration close" offered) and pinned by a test.
- **n5.** VenueSearchBox a11y: "Searching…" and "No matches" are not in a live region, so a screen-reader user hears nothing when results change. `aria-controls` points at an id that does not exist while the list is closed (tolerated). `<li role="option">` wraps a `<button>`; option children are presentational, mouse works, keyboard path is via `aria-activedescendant` (tested).

---

## Card D claims verified

- `canCheckIn(role)` matches `mark_attended` exactly: the function (20261023170000, line 51) calls `app_private.resolve_actor(p_actor_override, 'organiser_admin','organiser_member','eventar_staff')`; `canCheckIn` returns true for exactly those three. The role check constraint on `staff.role` has five values; body_admin and auditor are the two refused [X read of constraint + R]. No later migration redefines `mark_attended` (grep of migrations) [R].
- No insert for a refused role: yes, the check precedes capacity and insert; the role is checked after `canManageEvent`, so a role from another org still gets "no access" first (no information leak). Test asserts one `from()` call [R].
- Partial-failure message when the check-in leg fails after the insert: "`<name> was registered (code X) but not checked in. <reason>`", where reason is the mapped 42501 text, the RPC's own `error`, or "Use Enter code with X to finish." for a throw. All three covered by tests that would fail without the change [R].
- `markAttended` 42501 mapping: works for the role case (see m3 for over-breadth). Other codes still throw (test `57014`).
- `RosterClient` new required prop `canCheckIn`: only callers are `page.tsx:167` (passes `canCheckIn(staff.role)`) and the test [R, grep]. Controls disabled: scan, enter-code (via `closedMessage`), row button, walk-in; the aria-describedby target `checkin-closed-note` is rendered by ScanAndManual whenever the message is set [R].

## Card G claims verified

- Id mapping on a second save: payload built from `sortedBlocks` with `display_order: i`; the action returns ids ordered by `display_order`, so ids come back in payload order; write-back maps through `sortedBlocks.map(localId)` (NewEventForm.tsx:489, 507-508). Consistent with DB-04's invariant. The new test `saves blocks in start-time order ...` would fail if the write-back used the unsorted `blocks` (b2 would inherit `new-uuid`) [R].
- No duplicate blocks: ids are keyed by `localId`, not index, so reordering cannot cross-assign; removal case already pinned by the DB-04 test.
- Blocks with no start time: cannot reach the payload (`agendaValid`, NewEventForm.tsx:333/383, blocks submission); `'99:99'` fallback only affects render order, new blocks sort last [R].
- Timezone of the comparison: all `start` values are HH:MM strings in the browser's wall clock on one `datetime.date`, so the comparison is internally consistent; the zone issue is M1, not a sort bug.
- The "shows the blocks in the order they will be saved" test only exercises the Breaks list.

## Card H: abort / late response / dedupe / notice

- Late answer for an old query: dropped twice (the effect cleanup aborts the controller, and `found.forQuery !== q` hides rows). Both tests use a mock that ignores the signal; the `ctrl.signal.aborted` guard is what drops the answer in them, the `forQuery` guard is the second line. OK [R].
- Dedupe: key `venue_name\0venue_address`, first occurrence wins. Two distinct coordinates with the same name+address collapse; acceptable.
- Notice logic: `venueTz && venueTz !== 'Asia/Hong_Kong'`. Fires for Shenzhen/Macau (same UTC+8, zone name differs) where nothing shifts; harmless. Covered by tests for both branches. Substance: see M1.

## Hard rules / contract checks

- Rule 11 (grants): function-only change, `CREATE OR REPLACE` keeps grants, restated, asserted in the DO block. `search_path` public, pg_temp as before. No table touched. Replay-safe; rollback comment points to the right earlier file [R].
- Audit LAST: unchanged position in the new function; the refusal is raised before UPDATE and before the audit write, so a refused edit leaves no audit row (RLS test asserts `auditCount` unchanged) [R].
- Three-layer validation/auth: unchanged (Zod/actions -> `resolve_actor` -> row checks). The UI disabling is a convenience; the DB is the authority.
- No PII in logs: new `console.error` lines carry `regId` only [R].
- Rule 12: refusals are surfaced with explicit messages in all new paths except m3/m6 (over-broad or misleading mapping).

## Reviewed and clean

- Migration SQL: signature, SECURITY DEFINER, search_path, lock-then-compare, `linked_registration` rule precedence (linked check fires before the attended check), unique-violation mapping, name-only change and identical-email no-op unaffected (tested).
- `lib/auth.ts` `canCheckIn`, `CHECKIN_ROLE_MESSAGE`, `RosterClient`/`page.tsx` plumbing, `SpeakersCard` copy, `registrations/actions.ts` mapping (`startsWith('email_locked_attended:')` is consistent with the neighbours), `RegistrationsClient` lock (a cancelled-after-check-in row is not locked in the UI, but the DB refusal is mapped to a plain message, so no dead end).
- RLS test additions: first test fails without the status check, second without the `exists` check (both hand-set via `attend` / `checkinRowOnly`); third pins name-only edit and no-op [R].
- edit/page.tsx copy is true to the code: update RPC refuses non-draft (`event_not_draft`, 20261024110000), accreditation gated by `canSetAccreditation`, registration close action exists in details/actions.ts [R].

## Not reviewed / gaps

- test:rls, next build, live browser behaviour: forbidden for this lens. The race in m1 is analysed from the live trigger body and the lock-conflict matrix, not run. A real two-connection test is the recommended proof.
- Focus/popover behaviour on live re-sort (m8) and the dropdown reopen (m5) are read-level; backtest or user-lens should confirm in the browser.
- Cross-midnight block reconstruction under a differing browser zone (M1 tail) is inferred.
- `lib/tz.ts`, `components/shell/**`, `app/account/**`, `app/(public)/**`, `app/checkin/page.tsx` and the headers of registrations/checkin pages: other builders' files, not reviewed. tsc was clean at the time of the run.
- No docs/plans/mvp/REVIEW-*.md or INVESTIGATION-*.md file was read.
