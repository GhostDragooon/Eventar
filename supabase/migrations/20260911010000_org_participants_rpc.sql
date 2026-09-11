-- WP-C: Org-scoped participant aggregation for the CRM surface.
-- Returns one row per unique (email, full_name) across all non-deleted
-- events in the given org, with event counts and attendance counts.

create function public.get_org_participants(p_org_id uuid)
returns table (
  email text,
  full_name text,
  events_count bigint,
  attended_count bigint,
  last_registration timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    r.email,
    r.full_name,
    count(distinct r.event_id) as events_count,
    count(distinct r.event_id) filter (where r.status = 'attended') as attended_count,
    max(r.registered_at) as last_registration
  from public.registrations r
  join public.events e on e.id = r.event_id
  where e.organisation_id = p_org_id
    and e.deleted_at is null
  group by r.email, r.full_name
  order by max(r.registered_at) desc
$$;

revoke execute on function public.get_org_participants(uuid) from public, anon;
grant execute on function public.get_org_participants(uuid) to authenticated, service_role;
