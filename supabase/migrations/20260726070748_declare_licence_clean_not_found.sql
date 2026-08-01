-- DEFERRED.md item 27 — declare_licence(p_body_id, ...) let a bad body id
-- bubble up the raw Postgres FK-violation dump ("violates foreign key
-- constraint practitioner_licences_body_id_fkey DETAIL: Key (body_id)=(...)
-- is not present in table accrediting_bodies") straight to the caller.
-- Same not-found shape already used by verify_licence/lapse_licence/
-- revoke_licence for a missing licence id — P0002, no raw constraint text.
create or replace function public.declare_licence(
  p_body_id uuid,
  p_licence_number text,
  p_licence_type text default null
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.practitioner_licences;
begin
  if auth.uid() is null then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if not exists (select 1 from public.accrediting_bodies where id = p_body_id) then
    raise exception 'declare_licence: accrediting body % not found', p_body_id using errcode = 'P0002';
  end if;

  insert into public.practitioner_licences (user_id, body_id, licence_number, licence_type)
  values (auth.uid(), p_body_id, p_licence_number, p_licence_type)
  returning * into v_row;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_declared',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_row.id,
    p_payload      := jsonb_build_object('body_id', p_body_id, 'licence_id', v_row.id)
  );

  return v_row;
end;
$$;

revoke all on function public.declare_licence(uuid, text, text) from public, anon, authenticated;
grant execute on function public.declare_licence(uuid, text, text) to authenticated;
