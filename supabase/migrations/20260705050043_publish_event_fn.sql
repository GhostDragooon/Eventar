-- CPD Sprint 2 / Task 12 — event publish becomes atomic + audited.
-- events.published_at did not exist on the live schema at planning time
-- (confirmed via list_tables) — added here as coupled work, the P3
-- checklist requires it be written on publish.
alter table public.events add column if not exists published_at timestamptz;

create function public.publish_event(p_event_id uuid)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare actor public.staff%rowtype; v_org uuid;
begin
  actor := app_private.require_active_staff('organizer','manager','eventar_staff');
  update public.events
     set status = 'published', published_at = now()
   where id = p_event_id and created_by = actor.id   -- owner-exclusive
   returning organisation_id into v_org;
  if not found then
    raise exception 'publish_event: event % not found or not owned by caller', p_event_id
      using errcode = '42501';
  end if;
  perform public.write_audit_event(
    'event_published', auth.uid(), actor.role, v_org, 'event', p_event_id,
    jsonb_build_object('attestation_status', 'organiser_attested')  -- Sprint 3 forward-compat
  );
end;
$$;
revoke execute on function public.publish_event(uuid) from public, anon;
grant execute on function public.publish_event(uuid) to authenticated, service_role;
