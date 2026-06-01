-- Phase R1: per-IP rate limits for public Server Actions + read endpoints.
--
-- Closes the brute-force velocity component of the predict-then-impersonate
-- attack chain. CSPRNG + 6-char codes (see lib/registrationCode.ts) closed
-- the prediction side; this closes the velocity side.
--
-- Design: fixed-window per (scope:ip) key, atomic check-and-increment via
-- a SECURITY DEFINER RPC. Public schema (matches the existing
-- create_event_with_blocks RPC pattern) with EXECUTE revoked from anon +
-- authenticated; service-role retains EXECUTE. RLS enabled on the table
-- with no policies = anon + authenticated denied by default.
--
-- Cleanup: rows are not auto-pruned. At ~200 registrations/event the
-- working set stays small; a later cron `DELETE FROM rate_limits WHERE
-- window_start < now() - interval '1 hour'` is a P3 follow-up.

create table public.rate_limits (
  key          text        primary key,
  count        int         not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies. Service-role bypasses RLS; anon + authenticated denied.

-- Atomic check-and-increment. Same window_start: increment. Different
-- window_start: reset to 1 (window rolled over). Returns jsonb so the JS
-- helper can compute retry-after info from a single round-trip.
create function public.rate_limit_check(
  p_key          text,
  p_window_start timestamptz,
  p_max          int
)
returns jsonb
language plpgsql
security definer
-- search_path pinned per the Phase-4.6 RPC fix lesson — SECURITY DEFINER
-- functions must pin search_path or they're vulnerable to injection.
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (key, count, window_start)
  values (p_key, 1, p_window_start)
  on conflict (key) do update
    set count = case
                  when rate_limits.window_start = excluded.window_start
                  then rate_limits.count + 1
                  else 1
                end,
        window_start = excluded.window_start
  returning count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_max,
    'count',   v_count
  );
end
$$;

-- Strict permissions: only service-role can call. The RPC endpoint exists
-- at /rest/v1/rpc/rate_limit_check but returns 403 to non-service-role.
revoke execute on function public.rate_limit_check(text, timestamptz, int) from public;
revoke execute on function public.rate_limit_check(text, timestamptz, int) from anon, authenticated;
grant  execute on function public.rate_limit_check(text, timestamptz, int) to service_role;
