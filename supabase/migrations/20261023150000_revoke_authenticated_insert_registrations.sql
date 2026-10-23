-- SEC-01 (second part, 2026-10-23): `authenticated` loses INSERT on public.registrations.
--
-- Found by the SEC-01 backtest [X]: the INSERT policy registrations_anon_insert_when_event_published is
-- `TO {anon, authenticated}` and only checks that the event is published, status 'registered' and no check-in.
-- Anyone can obtain an authenticated JWT (the attendee magic link creates the user), so a signed-in visitor could
-- POST /rest/v1/registrations directly and land a row for a full event (an event capped at 2 held 3), outside the
-- registration window, after the event ended, past the per-IP rate limit, with no email_log row, and under
-- anyone's email. Capacity, windows, the rate limit and the email_log row all live in the registerForEvent
-- Server Action, which inserts with the service-role client. 20261023140000 closed this for anon; this closes
-- it for authenticated.
--
-- Nothing needs it: no app, lib or script path inserts registrations as a signed-in user (registerForEvent and
-- the staff walk-in use service_role or a definer function; claiming past registrations is an UPDATE through a
-- definer function). authenticated keeps SELECT (own rows, own organisation's) and the UPDATE and DELETE grants
-- it has today (RLS limits UPDATE to organisation members; there is no DELETE policy). Narrowing those is a
-- separate review of every table where authenticated holds full DML.
--
-- The policy stays as defence in depth: it applies if a grant is ever restored, and the regression guard
-- tests/rls/registrations_insert_forgery.rls.test.ts exercises it inside a rolled-back transaction that grants
-- the privilege back on purpose.
--
-- Operations. REVOKE takes no lock on the table. `supabase db push` runs this file in one transaction. Idempotent.
-- Rollback: grant insert on public.registrations to authenticated;

revoke insert on public.registrations from public, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.registrations', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.registrations', 'INSERT') then
    raise exception 'SEC-01: authenticated still holds INSERT on public.registrations';
  end if;
  if not has_table_privilege('service_role', 'public.registrations', 'INSERT') then
    raise exception 'SEC-01: service_role lost INSERT on public.registrations (registerForEvent needs it)';
  end if;
end $$;
