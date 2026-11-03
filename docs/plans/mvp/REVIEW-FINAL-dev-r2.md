# REVIEW-FINAL dev-lens r2 (2026-11-03)

Scope: `git diff 00e2b07..HEAD -- app lib components proxy.ts supabase/migrations`, write paths only. Read-only review.
Legend: [EXEC] = verified by read-only SQL on the local DB (:54322). [READ] = read in code only.
Known, not re-reported: speaker check-in has no check-in window rule.

Counts: BLOCKER 0, MAJOR 1, MINOR 6, NIT 6. Partial: tool cap hit (44 calls). Not reached: dashboard/data.ts, exports, account/claim, AccountShell, VenueSearchBox, the dev-preview-uiport pages.

## MAJOR

### M1. Agenda: "Fix the highlighted agenda blocks" can show with no block highlighted, and it names the wrong cause [READ]
- Files: `components/event-form/AgendaSection.tsx:184` (`touched` starts empty and only interaction fills it), `:440-441,558,697` (every error display needs `touched`), `app/events/new/NewEventForm.tsx:333,382-384` (the gate runs `agendaValid` over every block).
- Input 1: edit a draft that has a block 09:00-10:00. Change only the event start to 09:30 and save. Output: the banner says "Fix the highlighted agenda blocks (each needs a valid time inside the event window, plus a title)." No block is red, because the block was never touched. Dead end.
- Input 2: click Add block, then save. Output: the same banner and no highlight.
- Input 3: a topic with a title but no speaker name. Output: the banner names time and title only. The real cause (`topicIndices`) is not named.
- The one sentence covers end-before-start, out-of-window, a missing time, a missing title and a missing speaker.
- Fix: on a failed submit, force errors visible. Either lift `touched` into the form, or add a `showAllErrors` prop that the submit sets. Then build the banner from the first failing `blockErrors()` reason and name the block: "'Keynote' ends before it starts." / "'Keynote' starts at 09:00, before the event's 09:30 start." / "A topic in 'Keynote' needs a speaker name."

## MINOR

### m1. A role can land after the credit has posted [READ]
- File: `supabase/migrations/20261101100000_registration_roles_locked_after_attendance.sql:26-39` and `:74-87`.
- Cause: the status is read without a row lock, and the function does not check `registration_checkins`.
- Race: set_registration_role reads 'registered'. mark_attended commits. award_attendance_credit reads the roles. The role INSERT then commits. Output: the call succeeds, the credit stays attendee and no message is shown. This is the case the migration was written to stop; the window is narrow.
- Fix: add `for no key update of r` to the select. Mirror update_registration_contact (20261102100000:60,75-77): `status = 'attended' or exists(registration_checkins)`. mark_attended's `update registrations` then serialises behind the lock.

### m2. The new Registrations page cuts the roster at 1000 rows without saying so [READ]
- Files: `supabase/config.toml:18` (`max_rows = 1000`), `app/events/[id]/registrations/page.tsx:43-47`.
- Input: an event with 1001 or more registrations. Output: the page lists 1000 and shows "All (1000)". The chip and search counts are wrong. This breaks rule 12.
- The check-in roster has the same cap (pre-existing).
- Fix: page through with `.range()`, or read `count: 'exact'` and show a banner when the count is larger than the rows read.

### m3. Registrations on a soft-deleted event: the edit error names the wrong cause [READ]
- File: `app/events/[id]/registrations/page.tsx:31-38`. The event read has no `deleted_at` filter.
- Input: open the page of a deleted event and edit a name. Output: "Registration not found." (update_registration_contact joins `e.deleted_at is null` and raises P0002).
- Fix: add `.is('deleted_at', null)` and call `notFound()` when no row comes back.

### m4. updateEvent can map block ids wrongly when two saves run together [READ]
- File: `app/events/[id]/edit/updateAction.ts:172-181`.
- Cause: the ids are read back by `display_order` in a separate statement after the RPC commits.
- Input: another tab saves an agenda with the same block count in between. Output: the count check passes, the wrong ids are mapped, and the next save from this tab updates the wrong rows. Titles and times move onto another block id, and the survey answers on that id now point at different content. Nothing is reported.
- Fix: return the block ids from `update_event_with_blocks` inside its own transaction (`uuid[]` in payload order).

### m5. Speaker toggle: no event-state gate, and a throw on sign-out [READ]
- Files: `app/events/[id]/checkin/speakerActions.ts:49` (uses `requireStaff()`), `SpeakersCard.tsx:59` (no catch).
- Throw: a signed-out session makes `requireStaff()` throw NotAuthorizedError, and the transition rejects. This is the frozen-door failure that `staffOrSignedOut` fixed for markAttended (`actions.ts:105-118`).
- State gate (separate from the known window gap): the action and the `speaker_checkins_org_member_*` policies do not check status or `deleted_at`. A speaker can be checked in on a cancelled, soft-deleted or draft event.
- Fix: reuse `staffOrSignedOut`. Refuse when `deleted_at is not null` or `status <> 'published'`.

### m6. Agenda inside-the-event-window rule has no database layer [EXEC]
- Rule 8 needs three layers. The form and the server action (`blockFitsEnvelope`) check it.
- The database does not: `agenda_blocks` has only `end_time > start_time` and the kind check. Direct PostgREST writes by `authenticated` are still possible under RLS and the draft trigger.
- Fix: add a check in `agenda_blocks_draft_only_writes`, or a constraint trigger comparing against `events.start_time` and `end_time`.

## NIT

- n1 [EXEC]: `speakerActions.ts:27-33,58-60,107-110` say "Owner-only by RLS". The live policies are org-member. `agenda_blocks_public_read_when_event_published` lets any authenticated user read published blocks. The message "not owned by you" names the wrong cause.
- n2 [READ]: `lib/lifecycle/eventLifecycle.ts:61` says "the SQL end is exclusive". For a single occurrence, mark_attended and self_check_in use `now() > end_time`, which is inclusive (20261023170000:88,214,234). Only the multi-occurrence path uses `'[)'`.
- n3 [READ]: the server Zod block errors (`updateAction.ts:31-33,137`) say "block 2.end_time: …". The index is the position in the start-sorted payload. The screen splits blocks into Components and Breaks, so the number matches nothing the organiser sees.
- n4 [READ]: the `agenda_blocks_draft_only_writes` trigger reads `events.status` without a lock (20261024110000:233). A direct PostgREST write can race a publish. Use `for share`.
- n5 [READ]: set/remove_registration_role write the audit row with `actor.organisation_id`. For eventar_staff acting across organisations this is the wrong org; update_registration_contact uses `v_org`.
- n6 [READ]: a failed walk-in `email_log` insert is only logged to the console (`checkin/actions.ts:380-387`). The desk is told nothing.

## Checked and clean

- Hard Rule 11 [EXEC]: `has_table_privilege` over credit_ledger, audit_events, practitioner_licences, invite_tokens, registration_roles, registration_checkins and participation_evidence × public/anon/authenticated/service_role. Only the intended `service_role` DELETE remains, on practitioner_licences, invite_tokens and participation_evidence.
- Registrations writes [EXEC]: `authenticated` and `anon` hold no table-level or column-level INSERT, UPDATE or DELETE on registrations.
- Identity leakage [READ]: walk-in inserts through the admin client with no `user_id`. registerForEvent attaches `user_id` and the snapshot only when the email matches the session and `staffState === 'not_staff'` (`(public)/events/[id]/actions.ts:63-78,229-230`).
- Audit insert last [READ]: mark_attended, self_check_in, update_registration_contact and set/remove_registration_role all write the audit row last.
- Trigger order [EXEC]: `events_draft_only_detail_edits` fires before `events_touch_updated_at` (alphabetical). Closing registration on a published event therefore passes the jsonb diff.
- Races [READ]: publish is an atomic `update … where status = 'draft'`. A save and a publish serialise on `for no key update`. A double check-in is stopped by `unique(registration_id, occurrence_id)`.
- Time zones [READ]: wall times are read and written in the browser zone, by design, with the venue-zone line shown. The check-in window compares instants, and the desk uses the server clock offset.
- Auth gates [READ]: the proxy matcher, `authDoor` and the `requireStaff` on the registrations page agree.
- Pre-existing, not counted: capacity counts cancelled registrations, and capacity is check-then-insert (walk-in and registerForEvent).
