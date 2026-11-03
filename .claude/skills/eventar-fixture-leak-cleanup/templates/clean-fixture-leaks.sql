-- Fixture-leak cleanup for the LOCAL Supabase stack only (127.0.0.1:54322).
-- Run: psql <local-url> -v cutoff='2026-11-02 14:30+00' -v prefix='ZZ-%' -v email_like='%@final.invalid' -f clean-fixture-leaks.sql
-- Dry run: this file ends in ROLLBACK. To commit, copy it and change the last line to COMMIT.
\set ON_ERROR_STOP on
begin;

create temp table le as
  select id from public.events where created_at > :'cutoff'::timestamptz and title like :'prefix';
create temp table lr as
  select id from public.registrations where event_id in (select id from le);
create temp table lu as
  select id from auth.users where email like :'email_like' and created_at > :'cutoff'::timestamptz;

select 'planned events' as k, count(*) from le union all
select 'planned registrations', count(*) from lr union all
select 'planned users', count(*) from lu;

do $$
declare t record;
begin
  for t in select table_schema s, table_name n from information_schema.columns
           where table_schema = 'public' and column_name = 'registration_id'
             and table_name not in ('audit_events', 'credit_ledger') loop
    execute format('delete from %I.%I where registration_id in (select id from lr)', t.s, t.n);
  end loop;
  for t in select table_schema s, table_name n from information_schema.columns
           where table_schema = 'public' and column_name = 'event_id'
             and table_name not in ('audit_events', 'credit_ledger') loop
    execute format('delete from %I.%I where event_id::text in (select id::text from le)', t.s, t.n);
  end loop;
  for t in select table_schema s, table_name n from information_schema.columns
           where table_schema in ('public', 'auth') and column_name = 'user_id'
             and table_name not in ('audit_events', 'credit_ledger') loop
    execute format('delete from %I.%I where user_id::text in (select id::text from lu)', t.s, t.n);
  end loop;
end $$;

delete from public.registrations where id in (select id from lr);
delete from public.events where id in (select id from le);
delete from auth.users where id in (select id from lu);

select 'left events with prefix' as k, count(*) from public.events where title like :'prefix' union all
select 'left users in window', count(*) from auth.users where created_at > :'cutoff'::timestamptz;

rollback;
