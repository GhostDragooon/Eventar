-- CPD Sprint 3a / Task 6 follow-up — code-quality review found two gaps
-- in supersede_licence:
--   I1: no from-state guard — a self-actor could supersede a 'revoked'
--       licence (a terminal staff/disciplinary action), minting a fresh
--       'declared' licence at the body that revoked them, routing around
--       the revocation. Ivan's decision: allow supersession only from
--       'declared', 'verified', or 'lapsed' (lapsed→renew is a legitimate
--       path); block 'revoked' (disciplinary finality) and 'superseded'
--       (already chained). Matches pseudonymise_user's from-state-guard
--       precedent for this audited-mutation family.
--   M2: superseding a *primary* licence stranded is_primary=true on the
--       now-dead row and left the fresh licence non-primary. A renewal
--       should carry the primary flag forward: demote the old row, set
--       the new row's is_primary to the old row's value.
-- Only supersede_licence changes; the other five functions are untouched.

create or replace function public.supersede_licence(
  p_old_licence_id uuid,
  p_new_licence_number text
) returns public.practitioner_licences
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old public.practitioner_licences;
  v_new public.practitioner_licences;
begin
  select * into v_old from public.practitioner_licences where id = p_old_licence_id;
  if v_old.id is null or v_old.user_id <> auth.uid() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- from-state guard (I1): a revoked licence is a terminal staff action;
  -- a superseded one is already chained. Neither is self-supersedable.
  if v_old.status not in ('declared', 'verified', 'lapsed') then
    raise exception 'supersede_licence: cannot supersede a % licence', v_old.status
      using errcode = '22023';
  end if;

  -- Carry is_primary forward (M2): demote the old row first so the partial
  -- unique index never sees two is_primary=true rows for this user at once,
  -- then mint the new row with the old row's is_primary value.
  update public.practitioner_licences
     set is_primary = false
   where id = p_old_licence_id and v_old.is_primary;

  insert into public.practitioner_licences (user_id, body_id, licence_number, licence_type, is_primary)
  values (v_old.user_id, v_old.body_id, p_new_licence_number, v_old.licence_type, v_old.is_primary)
  returning * into v_new;

  update public.practitioner_licences
     set status = 'superseded', superseded_by = v_new.id
   where id = p_old_licence_id;

  perform pg_advisory_xact_lock(hashtext('audit_events_chain'));
  perform public.write_audit_event(
    p_event_type   := 'licence_superseded',
    p_actor_user_id:= auth.uid(),
    p_actor_role   := 'self',
    p_subject_type := 'practitioner_licence',
    p_subject_id   := v_new.id,
    p_payload      := jsonb_build_object('old_licence_id', p_old_licence_id, 'new_licence_id', v_new.id)
  );

  return v_new;
end;
$$;

revoke all on function public.supersede_licence(uuid, text) from public, anon, authenticated;
grant execute on function public.supersede_licence(uuid, text) to authenticated;
