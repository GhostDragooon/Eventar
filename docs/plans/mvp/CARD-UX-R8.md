# CARD UX-R8 — day-of check-in and walk-ins open to every org writer (reverses part of Q51)

Card type: role-model change (kernel K1). Raised 2026-11-22 by Ivan. Status: NOT STARTED, waiting for Ivan's go. Supersedes the open copy calls in `CARD-UX-R7.md` that concern an organiser member on a colleague's event.

## Ivan's ruling (2026-11-22)

"For check in at the gate on the day, everyone in the org should be able to check people in. Where the auth or RLS matter is the reg list, esp with deleting any info. Everyone should also be able to reg walk-ins." Asked who: "all org members".

Follow-up, same day: "not the auditor". Read as: `organiser_admin`, `organiser_member`, `body_admin` and `eventar_staff` of the event's organisation may check in, tick speakers and register walk-ins on ANY event of that organisation, whoever created it. `auditor` stays read-only. The registration list (edit, delete, roles) keeps the Q51 creator-or-admin rule for every role, `body_admin` included.

## Why today refuses it (investigated 2026-11-22)

1. Q51 (decided 2026-11-06/07) put check-in under "admin any, member own". [X] decision text read.
2. `mark_attended` calls `app_private.can_write_event` and answers `not_recognised` for an organiser_member scanning a colleague's event. [X] live definition read on the local DB; `can_write_event` admits eventar_staff, organiser_admin of the same org, and organiser_member only for events they created.
3. `event_writer_guard` triggers sit on `registrations`, `registration_checkins`, `speaker_checkins` (and six other event tables). [X] pg_trigger listing. Q51 says the trigger acts for a staff JWT only; service_role paths keep their own gates.
4. App gates: `checkin/actions.ts:177` and `:310-312` (`canWriteEvent` then `NOT_EVENT_WRITER`), `speakerActions.ts`, `checkin/page.tsx` (desk shows read-only unless `canCheckIn && canWriteEvent`), `registrations/page.tsx`. [I] the walk-in insert path; not executed.
5. Tests pinned to the old rule: `tests/rls/role_rights_q51.rls.test.ts`, the checkin page and action tests.

## Change (proposed, nothing edited)

- New migration: a second helper `app_private.can_run_door(event, actor)` = active staff of the event's organisation with role organiser_admin, organiser_member or body_admin (eventar_staff any org); not auditor. `mark_attended` and the three door tables' guards use it for check-in, speaker ticks and walk-in registration; every other guarded write (event edit, registration edit/delete/roles, accreditation) keeps `can_write_event`.
- The walk-in insert must be limited to the door path. A member may INSERT a walk-in registration for any org event but not UPDATE or DELETE a registration they did not create. Needs a guard split by operation on `registrations`; check it against `audited_table_writes.rls.test.ts` and Hard Rule 11.
- App: `canCheckIn(role)` gains `body_admin` (and its comment, which says body_admin cannot check in, is rewritten); the same edit covers the walk-in pre-check. The desk, walk-in action and speaker ticks drop their `canWriteEvent` clause. The desk's third branch ("You can view this desk but not check people in.") goes away; only `auditor` sees the read-only desk.
- Decisions Log: new entry that narrows Q51 (check-in, speaker ticks and walk-ins no longer follow the event-writer rule).
- UX-R7 follow-on: copy decisions 1 and 2 then apply to `auditor` only.

## Needs Ivan's sign-off before any edit

K1 change plus a migration. Local stack only; hosted apply is Stage 8 and needs his separate go.

## Open questions

1. `body_admin` can now write attendance, which feeds credit. Confirm that is wanted for a `body_admin` of the event's own organisation only (default here: yes).
2. Should a member's walk-in on a colleague's event record who added it? (`registered_by` or audit event; default: audit event only, as today.)

## Tests (must fail first)

- RLS: organiser_member checks in, ticks a speaker, adds a walk-in on a colleague's event: succeeds. Same member edits or deletes a registration on that event: refused with the writer-guard SQLSTATE. auditor on the same calls: refused. body_admin: check-in, speaker tick and walk-in succeed; registration edit or delete refused. Another organisation's member: refused.
- Update `canCheckIn` and `canChangeEventStatus` tests: only `canCheckIn` widens.
- Action and page tests: desk for a member on a colleague's event is the full desk; registrations page still read-only for them.
- Backtest on :3100 and :54322 as organiser_member on a colleague's event.

## Review

Dev lens, separate user lens, backtest, per `eventar-mvp-card-handback`.
