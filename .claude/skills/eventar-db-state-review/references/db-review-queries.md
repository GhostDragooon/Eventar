# Eventar DB review: query set and last measured baseline

## Column check first

    select table_name, string_agg(column_name, ', ' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name in ('organisations', 'events', 'staff')
    group by 1;

## Legacy accreditation vs groups (drift)

    select
      count(*) filter (where e.accrediting_body_id is not null and not exists (
        select 1 from event_accreditation_groups g where g.event_id = e.id and g.body_id = e.accrediting_body_id)) legacy_without_group,
      count(*) filter (where e.accrediting_body_id is null and exists (
        select 1 from event_accreditation_groups g where g.event_id = e.id)) group_without_legacy
    from events e;

## Orphan public users (no auth row)

    select count(*) from users u left join auth.users a on a.id = u.id where a.id is null;

## Baseline, local stack, measured 2026-11-03

- Schema: 35 public tables, all RLS; 65 public functions (56 SECURITY DEFINER); 12 in `app_private`.
- Migrations: 160 files (about 960 KB). Most redefined functions: `create_event_with_blocks` 13, `update_event_with_blocks` 13, `mark_attended` 11, `award_attendance_credit` 11, `set_event_cpd_config` 10, `self_check_in` 9.
- `accrediting_bodies` 334 (MCHK plus 15 Colleges real; `A2-*` and `MB-*` are fixtures).
- `events` 466; 212 carry legacy `accrediting_body_id`; 237 have accreditation groups; 24 published events have a legacy body and no group (6 inspected, all `freeze-trigger CREDITED fixture`; 18 not inspected).
- `users` 1380; `auth.users` 1140; 240 `users` rows without an auth row (cause unverified).
- `registrations` 957; check-in drift 0 vs 0.
- `audit_events` 70272 (38 MB); `attendee_checked_in` 20246; `registration_checkins` 745.
- `credit_ledger` 795; `practitioner_licences` 994; `staff` 265 (keyed on email, no `user_id`).
- `organisers` 0 rows, referenced by 25 files in `app`/`lib`/`components`. `events.poster_path`: 0 rows, 0 source references.
