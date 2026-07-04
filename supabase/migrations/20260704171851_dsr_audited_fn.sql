-- CPD Sprint 2 / §1 — DSR lifecycle transitions are staff-gated + audited.
-- Self-submission stays on the existing RLS insert policy (subject's own
-- request, lower tamper-sensitivity); staff status transitions are the
-- compliance-sensitive surface and become audited here.
create function public.transition_dsr(p_id uuid, p_status text, p_notes text default null)
returns void
  language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  actor public.staff%rowtype;
begin
  actor := app_private.require_active_staff('manager','eventar_staff');  -- gate: 42501 otherwise
  if p_status not in ('pending','in_progress','completed','rejected','escalated') then
    raise exception 'transition_dsr: invalid status %', p_status;
  end if;

  update public.data_subject_requests
     set status = p_status,
         resolver_staff_id = actor.id,
         resolution_notes = coalesce(p_notes, resolution_notes),
         resolved_at = case when p_status in ('completed','rejected') then now() else resolved_at end
   where id = p_id;
  if not found then
    raise exception 'transition_dsr: request % not found', p_id;
  end if;

  perform public.write_audit_event(
    'dsr_transitioned', auth.uid(), actor.role, actor.organisation_id,
    'data_subject_request', p_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;
revoke execute on function public.transition_dsr(uuid, text, text) from public, anon;
grant execute on function public.transition_dsr(uuid, text, text) to authenticated, service_role;
