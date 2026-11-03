# REVIEW R2, waves 2-3: dev lens

Date: 2026-11-02. Base: HEAD 4c04977 plus the uncommitted working tree. Lens: DEV (separate from user-lens and backtest).
Tool calls: 36 of the 80 cap (stop line 70). Status: COMPLETE for the listed scope.
Scope: attendee portal (app/account/**, app/(public)/events/[id]/**, lib/tz.ts, AccountMenu, auth components, RegisterCard), organiser shell (StaffShell, lib/roleLabels.ts, SettingsClient, app/checkin/page.tsx, events/[id]/{registrations,checkin}/page.tsx), package.json test:rls, registration_contact_edit RLS test, plus a re-check of the wave-1 fix round (DateTimeSection, VenueSearchBox, AgendaSection, checkin/actions.ts).
Evidence tags: [X] executed, [R] read, [I] inferred.

Executed:
- `pnpm exec vitest run` over app/account, app/(public)/events/[id], lib/tz, lib/auth, components/shell, AccountMenu, RegisterCard, app/login, app/checkin, events/[id]/checkin, events/[id]/registrations: 48 files, 651 tests passed [X].
- `pnpm exec tsc --noEmit`: no errors, exit 0 [X].
- `vitest list --filesOnly` for the two test:rls stages vs the old single invocation (no test is executed by `list`): see check 6 [X].
- Read-only psql: `staff_role_check` definition, `events.timezone` nullability [X].
NOT run: test:rls (so the new RLS race tests are read-only, not proven), next build, any browser, any state-changing command.

Counts: BLOCKER 0, MAJOR 0, MINOR 6, NIT 8.

---

## Findings

### MINOR

**m1. Hydration mismatch on the new venue-time line (and the time pickers beside it) in edit mode, invisible on a developer machine.** components/event-form/DateTimeSection.tsx:128-146 (`VenueTimeLine`), fed by app/events/new/NewEventForm.tsx:191-196 (`initialDateTimeFrom` -> `parseLocalDateTime`). [R + I, not executed]
- `browserTz()` and `new Date(\`${date}T..\`)` read the zone of whoever runs the code. In edit mode the form is rendered on the server (NewEventForm is a client component, edit/page.tsx imports it directly, no `ssr:false`) and then hydrated in the browser.
- Scenario: Hong Kong organiser edits a Hong Kong draft. Prod server runs in UTC. Server render: browser zone "UTC", start 01:00, venue clock 09:00, they differ, so the paragraph "You entered 01:00 in your time (UTC, UTC). This event will show 09:00 (Asia/Hong_Kong, GMT+8)" is in the HTML. Client render: zone Asia/Hong_Kong, same clock, `VenueTimeLine` returns null. Element present on one side and absent on the other: React 19 logs a recoverable hydration error and re-renders on the client. Until JS loads, the user sees the wrong sentence.
- On a dev machine whose zone equals the browser zone there is no mismatch, so nobody sees it. The time pickers already have the same cause (server-zone minutes vs browser-zone minutes), so the new line adds a visible instance of an existing class rather than a new class. It will first show up at the Stage 8 deploy.
- Fix options: render the zone-dependent parts after mount (a `mounted` flag or `useSyncExternalStore` for `browserTz`) and make the edit page pass the stored instant so initial state is computed once on the client; or `suppressHydrationWarning` on the line only (hides the error, not the wrong server HTML). Needs a decision with the M1 residual below.

**m2. Wave-1 M1 is only half closed: the form still encodes typed times in the browser zone.** [R] The new `VenueTimeLine` names both zones and shows the result ("You entered 09:00 in your time (Asia/Hong_Kong, GMT+8). This event will show 01:00 (Europe/London, GMT)"), which is the cheap fix proposed in the first round, and the old banner (NewEventForm.tsx:633-640) still sits above it. Two stacked messages say the same thing in different words. On edit, a London organiser opening a Hong Kong event reads "You entered 01:00..." although they entered nothing (the line is derived from the stored instant). The real fix (encode/decode in the venue zone) remains Ivan's call, as recorded in the wave-1 file.

**m3. AgendaSection `held` release fires on `mousedown` outside the held card, so the list can reorder between mousedown and mouseup of the next click.** components/event-form/AgendaSection.tsx (the `release` effect). [I]
- After a start time is picked in block A, A keeps its slot (`held`). The user's next action is usually a mousedown on block B's time control. The document `mousedown` listener sees a target outside A and calls `setHeld(null)`; A jumps to its sorted position, B moves up or down under the pointer, and the click (mouseup) lands on whatever is there now. This is the F50 hazard again for blocks.
- Fix: release on `mouseup`/`click` (or on `focusout` leaving the card) instead of `mousedown`, or release in a `requestAnimationFrame` after the click. The user lens should try it in a browser; I could not.

**m4. CompleteClient lead states a fact it does not know.** app/account/complete/CompleteClient.tsx:283-285. [R] "Your registrations are saved. Finish this and you will see them under Registrations..." is shown to every incomplete account at steps 1 and 4, including a person who signed up directly with nothing registered, and a person whose guest registration is not linked yet (it is saved under their email, not their account). The RegisterCard comment states the repo's own rule: a sentence about a database row keys on what the server reports, never on a guess. The test (`step 1, 4`) pins the sentence with no registrations in play, so it cannot catch this. Fix: say "Any registrations you made are kept" or branch on the unlinked/registration count the wizard page already has the means to read.

**m5. Check-in header says "edit a person's details or roles" to a role that cannot edit roles.** app/events/[id]/checkin/page.tsx:153-157. [R] The Registrations subtitle in the same change is careful: `canEditRoles` is `canEdit && (eventar_staff || event.created_by === staff.id)`, and a non-creator `organiser_member` is told only "Edit contact details here." The Check-in line uses `canCheckIn(staff.role)` alone and tells that member "edit ... roles" in Registrations, where the role chips are read-only for them. The card-D role sentence (RosterClient `CHECKIN_ROLE_MESSAGE`: "Your role cannot check people in. Ask an organiser admin or member.") is NOT contradictory with the header line for body_admin/auditor ("this desk is read-only for your role"); the two are redundant but consistent. Fix: drop "or roles" or compute `canEditRoles` here too (the page already loads the event with `created_by`? confirm; the registrations page selects it). `page.test.tsx` has no non-creator-member case, so it cannot catch this.

**m6. `readUnlinkedCount` swallows every failure with no log, and its rate bucket is shared with four other callers.** app/account/readUnlinkedCount.ts:6-12. [R]
- By design (Ivan pick 5a: no false banner, never break the page) and the tests pin it. But Rule 12 (fail visibly): `ok:false` (db_error, rate_limited, session_revoked) and a throw all become 0 with nothing in the logs, so a persistently failing count is indistinguishable from "nothing to claim". At minimum log the error code (no PII) on `ok:false` with `db_error` and on a throw.
- `getUnlinkedRegistrationCount` uses bucket `account.unlinked_count`, 30 per 60 s per user, abuseTier false (actions.ts:264-270). Callers now: the three portal pages (via `loadMyRegistrations`/History), the public event page, `getAccountMenuState` (events list, login, landing pill, confirm page). A fast browse across those can reach 30 and the banner silently disappears (`rate_limited` -> 0). Low odds, but the same silence applies. No change to the bucket needed; log it.

### NIT

- **n1.** StaffShell sign-out (components/shell/StaffShell.tsx:147-155): `setSigningOut(false)` runs after a SUCCESSFUL `signOutAndLeave`, which has just set `window.location.href`. Between the assignment and the unload the button re-enables and the label flips back to "Sign out" (the test "release -> button enabled" pins this). A second click calls `auth.signOut` again, which is idempotent (401/403/404 count as ended), so no harm. Same pattern as AccountShell `useSignOut`, so consistent; fix both together (keep `pending` true when the result is null) if desired. Also the button is `disabled` while pending, which drops keyboard focus; after a failure the user lands on `body`. `aria-disabled` + ignore-click keeps focus. [R/I]
- **n2.** `BackToRegistrations` guard `signedInUser && !isStaff && accountComplete`: `!isStaff` is redundant because `accountComplete` is only ever computed when `!isStaff` (page.tsx:156-157), so the "staff session: no strip" test passes for either reason. Harmless belt and braces. A staff user whose `isStaffSession` read fails open gets `isStaff=false`, then `isAccountComplete` for a staff id (no practitioner profile) returns incomplete, so no strip. [R]
- **n3.** Naming drift for one action: banner "Link past registrations" (ClaimBanner), AccountClient's own banner "We found N unlinked registrations for your email" with the same link text (AccountClient.tsx:307, 479), AccountMenu "Claim past events", the claim page. Landing/marketing still says "Eventar record" (exempt by the noRecordLabel test, a stated decision). [R]
- **n4.** app/login/page.tsx:252: the `!hasRecord` branch ("Go to my account") still links to `/account/record` (the History URL), which redirects an incomplete account to the wizard. It is unchanged from before, so not a regression, but `/account` is the natural target for that label. The `hasRecord` branch href `/account/registrations` is right (an unlinked-only session reaches the wizard through the loader redirect). [R]
- **n5.** app/account/sign-up/page.tsx:105: "so that registration can be added to your Registrations" (capital R mid-sentence, noun repeated). [R]
- **n6.** `noRecordLabel.test.ts` scans only `.tsx` files under app/ and components/ with comments stripped. It would fail without the sweep (the old `label: 'Record'`, "View your record", "Create your Eventar record" all match), but it cannot see `.ts` strings. I grepped `.ts`/`.tsx` in app, components, lib, lib/email by hand for "your record", "my record", "Eventar record": only marketing copy (app/page.tsx, HowItWorks, LedgerWindow), code comments, and "On record" credit chips remain [X grep]. No e-mail template says Record. [R]
- **n7.** package.json `test:rls`: the serial stage is chained with `&&`, so a failure in the parallel stage hides the four serial files until it is green. Use `;` plus an exit-code merge if both results are wanted in one run. [R]
- **n8.** app/checkin/page.tsx:80-87: two adjacent `<p>` lines with the same style (explainer then counts), and the empty state "Publish an event and its check-in desk appears here" is also shown when published events exist but none is live/upcoming/registering. Not wrong, slightly off. [R]

---

## Specific checks requested

**(1) ClaimBanner / readUnlinkedCount / loader / record page.** [R + X tests]
- A failed count read shows no banner and the page still renders: `ok:false` and a throw both return 0 (readUnlinkedCount.test, loadMyRegistrations.test, record/page.test, all three exercise both) [X pass]. The page's own read failure is not swallowed (`failed:true` still, test present).
- The integer is the caller's own confirmed-email count only: `requireAuthenticatedSelf` -> `auth.email` from `getUser()`, returns 0 without a confirmed email, `ilike` on the escaped session email, `head:true` count, bare integer returned (actions.ts:243-292). No enumeration path: you cannot make someone else's address your confirmed address, and the number never depends on input. A throwing read leaks nothing (swallowed to 0, no message passed on). No PII in logs (nothing logged).
- Not shown on the redirect paths: in both `loadMyRegistrations` and History the incomplete-account `redirect('/account/complete')` and the signed-out `redirect` happen BEFORE `readUnlinkedCount()` runs (loader line ~25; record/page.tsx before the `Promise.all`). The wizard page has no banner. In History the count runs in parallel with the page's reads and is ignored if the read bounces to sign-in. Clean.
- Do the new tests fail without the fix? ClaimBanner tests: yes (component absent). Page tests assert the singular/plural text, the claim href and count 0 on each of the three pages; History's test asserts the banner next to the mocked RecordClient. The `server-only` mock in portalShell.test is the right minimal change. One test-quality note: the mocks replace `./actions`, so none of these tests touches `getUnlinkedRegistrationCount` itself; its own behaviour (unconfirmed email, escaping) is covered by pre-existing tests, not re-checked by me.

**(2) BackToRegistrations.** Guard triple correct ([R], and 5 page tests pass [X]); the incomplete-account case and a throwing completeness check both give no strip. Link target `/account/registrations` is a static path, no user input, no open redirect. Rendered on the server inside `PublicShell`, so there is no client-side flash for staff or signed-out visitors. The component is a quiet link with `min-h-11`, fine. See n2.

**(3) formatInTzWithZone.** [R + X tests]
- Invalid zone or invalid ISO: `Intl.DateTimeFormat` throws `RangeError`, exactly as `formatInTz` already did on the same inputs; no new exposure. `events.timezone` is NOT NULL [X psql], and the Row falls back with `?? 'UTC'` (null only; an empty string would throw, same as before).
- `zone` could be `undefined` only if the formatter returned no `timeZoneName` part; with `timeZoneName:'short'` it always does.
- DST: label is per instant; the tests cover New York winter (GMT-5) and summer (GMT-4) and London GMT/BST at dated instants. No test sits on the exact transition instant or on a half-hour zone; `splitClock`'s `(.+)` handles "GMT+5:30".
- Output stability: en-GB short names are ICU/CLDR data. Node's "GMT+8"/"GMT-5" is what the tests pin; it can differ between ICU versions (e.g. a zone gaining or losing an abbreviation). The runtime is pinned (eventar-node-runtime-pin), so a Node bump would surface as a failing test rather than a silent change. Browsers use their own CLDR; for the DateTimeSection line (client only) that is acceptable.
- Server vs client equality: the Registrations/Check-in rows (RegistrationRows.tsx) have no `'use client'` and are rendered by server pages only, so there is no hydration pair [R]. The only client use is DateTimeSection, see m1.

**(4) StaffShell and the role map.** [R + X]
- Sign out: uses `signOutAndLeave('/login')` (lib/signOut.ts), the single revoke path; failure text from `SIGN_OUT_FAILED`; `role="alert"` for the error; disabled while pending; nothing else in the shell calls `auth.signOut`. Other direct `auth.signOut` call sites (invite page, login page, doorSession) pre-date this change. See n1 for the success-path re-enable and focus.
- Role labels: `staff_role_check` in the local DB allows exactly organiser_admin, organiser_member, body_admin, auditor, eventar_staff [X psql]; `ROLE_LABELS` is typed `Record` over those five literals and `Staff['role']` indexes it (tsc clean [X]); the StaffShell test iterates all five [X pass]. SettingsClient now imports the shared map; the removed local copy was identical. The Team page keeps its own shorter invite labels on purpose (comment in the file).

**(5) Label sweep.** Login `hasRecord` branch href `/account/registrations` correct; the other branch is unchanged (n4). Remaining "record" wording: marketing/landing, code comments, the credit chip "On record" (a credit state, not the page). No e-mail template or server message found [X grep]. `revalidatePath('/account/record')` in claim still targets the History route; Registrations and Check-in are `force-dynamic`, so nothing stale.

**(6) test:rls split.** [X, `vitest list --filesOnly`, same positional args and `--exclude` flags the script uses]
- Old single invocation: 47 files. Stage 1 (parallel, four `--exclude`): 43 files. Stage 2 (`--no-file-parallelism`, four named files): 4 files. Stage 1 + Stage 2 = exactly the old 47; intersection empty; nothing missing, nothing run twice. The four serial files all exist in tests/rls.
- Caveat: stage 2 only runs if stage 1 passes (`&&`), see n7. The comment in the RLS test says the serial files "deadlock in parallel with the main stage": the new race tests hold row locks across transactions and the other three run DDL in a transaction; the split is the right shape, but I did not run it, so the claim that it removes the deadlock is [R], not proven.

**(7) Role-aware Registrations subtitle.** The page now computes `canEdit` and `canEditRoles` once and passes the SAME variables to `RegistrationsClient` (`canEdit={canEdit}`, `canEditRoles={canEditRoles}`) and to the subtitle, so the predicates cannot diverge [R]. `canCheckIn` gates the check-in sentence. Tests cover admin, non-creator member, and the read-only roles [X pass].

**(8) Check-in page line vs card D.** See m5. For body_admin/auditor the header ("this desk is read-only for your role") and the RosterClient notice (`CHECKIN_ROLE_MESSAGE`) agree; the wave-1 fix also makes `markAttended` return `CHECKIN_ROLE_MESSAGE` only when `canCheckIn(staff.role)` is false and a neutral "You cannot check people in on this event." otherwise (a suspended row is no longer told its role is wrong) [R], and the walk-in check-in leg now logs `code` and `name` on a throw [R].

---

## Wave-1 fix round: final state re-check

- `components/VenueSearchBox.tsx`: the reopen-after-pick bug is fixed with `picked` (the effect skips `q === picked`; `onChange` clears it; `searching` excludes it). Blur no longer aborts the request and `focusedRef` stops a late answer reopening the list. A request failure is stored as `failed` and worded "Venue search is not responding", no longer "No matches". ArrowUp with nothing active goes to the last row. Late answers for older queries are still dropped twice (abort + `forQuery`). Clean. [R; the component test file passes, X]
- `lib/agenda.ts` / `AgendaSection.tsx`: sort by start with `localeCompare` on zero-padded HH:MM (still a NIT from round 1, exact for that format); the code comment now states the Components/Breaks split and the `held` exception. New issue: m3.
- `components/event-form/DateTimeSection.tsx`: M1 mitigation present (m2), hydration caveat (m1). Invalid venue zone cannot reach it: `safeTzFromVenue` returns null on a `tz-lookup` throw.
- `app/events/[id]/checkin/actions.ts`: m3/m4 from round 1 are fixed as described above. The migration and RLS test additions were not re-reviewed beyond the race-test read below.
- Read of the new RLS race test (registration_contact_edit.rls.test.ts:403-552) [R]: the first test proves the lock by asserting the edit session is in `wait_event_type='Lock'` before committing the check-in (so it cannot pass vacuously); the 15-trial test accepts only 22023 / 40P01 failures, ties DB state to each side's reported outcome, and checks audit `chain_seq` order for the forbidden "email changed after check-in committed" outcome. It cleans up evidence, registrations and the event. Not executed, so whether it is stable across 15 trials is unproven.

## Hard rules / contract

- Rule 10 (no PII in logs): nothing new logs PII; the new log lines carry ids/codes only.
- Rule 12 (fail visibly): the count banner is the one deliberate silent degrade (m6). Sign-out failure is surfaced. Check-in refusals are surfaced.
- Three-layer auth: the organiser pages call `requireStaff` + `canManageEvent` first; the role copy follows the same predicate functions as the controls and the database remains the authority.
- Rules 1-9, 11: no schema or grant change in waves 2-3; the sign-out remains the single client path. Hard rule 3 unaffected.

## Reviewed and clean

ClaimBanner component and its three placements; loadMyRegistrations ordering and return shape (all callers updated: registrations, check-in; History reads its own count); readUnlinkedCount contract; BackToRegistrations; formatInTzWithZone and RegistrationRows (including the "Check-in opens at ..." fallback, which cannot print `null`: when `event_start` is null `open` is always true); lib/roleLabels.ts; StaffShell chip (static, no hover/pointer, role line) and sign-out wiring; AccountMenu "History" label; RegisterCard success sentence (still keyed on `state.linked`); login door wording and href; AuthBackdropCard copy; app/checkin/page.tsx role-neutral copy; Registrations subtitle; test:rls file coverage; tsc.

## Not reviewed / gaps

- Anything needing a browser: focus behaviour of the disabled sign-out button (n1), the live reorder under the pointer (m3), the actual SSR/hydration behaviour of the edit form (m1), mobile layout of the sign-out row in the stacked aside.
- test:rls, next build, the new RLS tests and the migration were not executed. The race test's stability and the "deadlock in parallel" claim are read, not run.
- The vault Decisions Log was not checked for a recorded decision on the unsalted sha256 in the audit payload (wave-1 m2) or on the browser-zone encoding (m2 above).
- app/account/actions.ts `getUnlinkedRegistrationCount` internals were read for the claim-count question only; its pre-existing tests were not re-run individually beyond the folder run (they passed in the 48 files).
- No docs/plans/mvp/REVIEW-*.md or INVESTIGATION-*.md other than REVIEW-R2-wave1-dev.md was read.
