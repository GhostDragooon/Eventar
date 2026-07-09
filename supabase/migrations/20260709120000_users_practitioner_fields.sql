-- CPD Sprint 3a — practitioner-facing identity fields, merged into users
-- per Decisions Log Q23 item 6 (no practitioners table; per-table notes in
-- Data Model.md). text + CHECK per Rule 2 above, not the drafted enum.

alter table public.users
  add column preferred_name   text,
  add column display_language text not null default 'en'
    check (display_language in ('en','zh-Hant','zh-Hans'));
