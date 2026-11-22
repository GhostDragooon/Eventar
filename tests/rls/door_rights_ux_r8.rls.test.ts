// UX-R8 (Ivan, 2026-11-22): on the day, every org writer works the gate on ANY event of their organisation:
// check-in, speaker ticks and walk-ins. organiser_admin, organiser_member and body_admin of the event's
// organisation, and eventar_staff on every event. auditor stays read-only. The registration list (edit, delete,
// roles) keeps the Q51 creator-or-admin rule for everyone. Narrows Q51 for the door tables only.
//
// One DO block that ends in RAISE, so every fixture rolls back and nothing leaks. Each attempt runs in its own
// sub-block, so an allowed write is undone before the next one. Refusals must be SQLSTATE 42501 (Hard rule 11).
// Gated on RLS_TESTS; local stack only.
import { describe, it, expect } from 'vitest';
import { sqlSuperuserQuery } from '../helpers/clients';

const PROBE = `
do $$
declare
  org uuid; org_b uuid; ev uuid; reg_x uuid; sp uuid; occ uuid; adm uuid;
  r record; t record;
  res jsonb := '{}';
  sq text; n integer; k text;
begin
  insert into public.organisations (name, slug) values ('R8 probe', 'r8-probe-' || gen_random_uuid()) returning id into org;
  insert into public.organisations (name, slug) values ('R8 probe B', 'r8-probe-b-' || gen_random_uuid()) returning id into org_b;
  create temp table p (who text, id uuid, email text, uid uuid) on commit drop;
  grant all on p to public;
  for r in select * from (values ('admin','organiser_admin',org), ('member','organiser_member',org),
                                 ('body','body_admin',org), ('auditor','auditor',org),
                                 ('eventar_b','eventar_staff',org_b), ('body_b','body_admin',org_b)) v(who, role, o) loop
    k := 'zz-r8-' || r.who || '-' || gen_random_uuid() || '@example.test';
    insert into public.staff (email, full_name, role, status, organisation_id) values (k, 'R8 probe', r.role, 'active', r.o);
    insert into p select r.who, s.id, k, gen_random_uuid() from public.staff s where s.email = k;
    insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id)
      select uid, email, now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000' from p where email = k;
  end loop;

  -- A live event created by the ADMIN: "a colleague's event" for the member, and the body_admin's own organisation.
  insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude, status)
    values ('ZZ-R8 live', now() + interval '30 minutes', now() + interval '3 hours', 'Asia/Hong_Kong',
            (select id from p where who = 'admin'), 'V', 'Hong Kong', 'HK', 22.3, 114.2, 'published') returning id into ev;
  select id into occ from public.event_occurrences where event_id = ev;
  insert into public.registrations (event_id, email, full_name, registration_code)
    values (ev, 'zz-r8-x@example.test', 'X', 'R8X' || substr(gen_random_uuid()::text, 1, 6)) returning id into reg_x;
  insert into public.speaker_checkins (event_id, speaker_name) values (ev, 'R8 Speaker') returning id into sp;
  select id into adm from p where who = 'admin';
  for r in select * from p loop
    insert into public.registrations (event_id, email, full_name, registration_code)
      values (ev, 'zz-r8-live-' || r.who || '@example.test', 'L', 'R8L' || substr(md5(r.who), 1, 6));
  end loop;

  for r in select * from p loop
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
    set local role authenticated;

    -- Door actions: each attempt is undone.
    begin
      select m.result into k from public.mark_attended('R8L' || substr(md5(r.who), 1, 6), 'manual', null) m;
      res := res || jsonb_build_object(r.who || ':checkin', k);
      raise exception 'undo' using errcode = 'P0099';
    exception when others then
      get stacked diagnostics sq = returned_sqlstate;
      if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':checkin', sq); end if;
    end;
    for t in select * from (values
      -- The door stamps itself and the present time, as the app's toggleSpeakerCheckin does.
      ('speaker_ins',  format($q$insert into public.speaker_checkins (event_id, speaker_name, checked_in_at, updated_by) values (%L, 'R8 New', now(), %L)$q$, ev, r.id)),
      ('speaker_tick', format($q$update public.speaker_checkins set checked_in_at = now(), updated_by = %L where id = %L$q$, r.id, sp)),
      -- Review: another staff id, or a back-dated time, is not the door. The event's writer (admin) may still do either.
      ('speaker_forge_by',  format($q$update public.speaker_checkins set checked_in_at = now(), updated_by = %L where id = %L$q$, adm, sp)),
      ('speaker_backdate',  format($q$update public.speaker_checkins set checked_in_at = now() - interval '1 day', updated_by = %L where id = %L$q$, r.id, sp)),
      -- Everything below is NOT the door: the registration list and the speaker row itself stay writer-only.
      ('speaker_rename', format($q$update public.speaker_checkins set speaker_name = 'Renamed' where id = %L$q$, sp)),
      ('speaker_delete', format($q$delete from public.speaker_checkins where id = %L$q$, sp)),
      ('reg_edit',      format($q$select public.update_registration_contact(%L, 'Renamed', 'zz-r8-x@example.test', null)$q$, reg_x)),
      ('reg_role',      format($q$select public.set_registration_role(%L, 'chair', null)$q$, reg_x)),
      -- No role writes these tables directly (grants), the admin included: only mark_attended does.
      ('reg_delete',    format($q$delete from public.registrations where id = %L$q$, reg_x)),
      ('reg_status',    format($q$update public.registrations set status = 'attended' where id = %L$q$, reg_x)),
      ('checkin_row',   format($q$insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method) values (%L, %L, now(), 'manual')$q$, reg_x, occ))
    ) v(tag, stmt) loop
      begin
        execute t.stmt;
        get diagnostics n = row_count;
        res := res || jsonb_build_object(r.who || ':' || t.tag, case when n > 0 or t.tag in ('reg_edit', 'reg_role') then 'ok' else 'none' end);
        raise exception 'undo' using errcode = 'P0099';
      exception when others then
        get stacked diagnostics sq = returned_sqlstate;
        if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':' || t.tag, sq); end if;
      end;
    end loop;
    reset role;
  end loop;

  -- A kept check-in by the member on the colleague's event: the whole chain must land, not only the status.
  select * into r from p where who = 'member';
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
  set local role authenticated;
  select m.result into k from public.mark_attended('R8L' || substr(md5('member'), 1, 6), 'manual', null) m;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  res := res || jsonb_build_object('member:kept:result', k);
  res := res || jsonb_build_object('member:kept:status',
    (select status from public.registrations where registration_code = 'R8L' || substr(md5('member'), 1, 6)));
  res := res || jsonb_build_object('member:kept:checkin_rows',
    (select count(*) from public.registration_checkins c join public.registrations g on g.id = c.registration_id
      where g.registration_code = 'R8L' || substr(md5('member'), 1, 6)));
  res := res || jsonb_build_object('member:kept:evidence',
    (select count(*) from public.participation_evidence e join public.registrations g on g.id = e.registration_id
      where g.registration_code = 'R8L' || substr(md5('member'), 1, 6)));
  res := res || jsonb_build_object('member:kept:audit',
    (select count(*) from public.audit_events a join public.registrations g on g.id = a.subject_id
      where a.event_type = 'attendee_checked_in' and g.registration_code = 'R8L' || substr(md5('member'), 1, 6)));

  raise exception 'PROBE:%', res::text using errcode = 'P0001';
end
$$`;

async function runProbe(): Promise<Record<string, string | number>> {
  try {
    await sqlSuperuserQuery(PROBE);
  } catch (e) {
    const m = /PROBE:(\{.*\})/.exec((e as Error).message);
    if (m) return JSON.parse(m[1]);
    throw e;
  }
  throw new Error('probe finished without raising its result');
}

describe.skipIf(!process.env.RLS_TESTS)('UX-R8 door rights', () => {
  it('every org writer works the door on any org event; the registration list keeps the Q51 rule', async () => {
    const res = await runProbe();
    const DENY = '42501';
    expect(res).toMatchObject({
      // Door: admin, the member on a colleague's event, and the body_admin of the same organisation.
      'admin:checkin': 'ok', 'member:checkin': 'ok', 'body:checkin': 'ok',
      'auditor:checkin': DENY,
      // eventar_staff acts on every event; a body_admin of another organisation sees no such registration.
      'eventar_b:checkin': 'ok', 'body_b:checkin': 'not_recognised',

      'admin:speaker_ins': 'ok', 'member:speaker_ins': 'ok', 'body:speaker_ins': 'ok', 'auditor:speaker_ins': DENY,
      'admin:speaker_tick': 'ok', 'member:speaker_tick': 'ok', 'body:speaker_tick': 'ok', 'auditor:speaker_tick': DENY,
      // eventar_staff of another organisation works the speaker card too (policies and guard say "every event").
      'eventar_b:speaker_ins': 'ok', 'eventar_b:speaker_tick': 'ok',
      'admin:speaker_forge_by': 'ok', 'member:speaker_forge_by': DENY, 'body:speaker_forge_by': DENY, 'auditor:speaker_forge_by': DENY,
      'admin:speaker_backdate': 'ok', 'member:speaker_backdate': DENY, 'body:speaker_backdate': DENY, 'auditor:speaker_backdate': DENY,

      // Not the door.
      'admin:speaker_rename': 'ok', 'member:speaker_rename': DENY, 'body:speaker_rename': DENY, 'auditor:speaker_rename': DENY,
      // No delete policy exists on speaker_checkins: zero rows for everyone, so nothing is deleted.
      'admin:speaker_delete': 'none', 'member:speaker_delete': 'none', 'body:speaker_delete': 'none',
      'admin:reg_edit': 'ok', 'member:reg_edit': DENY, 'body:reg_edit': DENY, 'auditor:reg_edit': DENY,
      'admin:reg_role': 'ok', 'member:reg_role': DENY, 'body:reg_role': DENY, 'auditor:reg_role': DENY,
      // Direct writes to the registration and check-in tables are not granted to any role, the admin included.
      'admin:reg_delete': DENY, 'member:reg_delete': DENY, 'body:reg_delete': DENY, 'auditor:reg_delete': DENY,
      'admin:reg_status': DENY, 'member:reg_status': DENY, 'body:reg_status': DENY,
      'admin:checkin_row': DENY, 'member:checkin_row': DENY, 'body:checkin_row': DENY,

      // The member's kept check-in carries the whole chain.
      'member:kept:result': 'ok', 'member:kept:status': 'attended',
      'member:kept:checkin_rows': 1, 'member:kept:evidence': 1, 'member:kept:audit': 1,
    });
    // Another organisation's body_admin gets nothing at the speaker table.
    expect(res['body_b:speaker_ins']).not.toBe('ok');
    expect(res['body_b:speaker_tick']).not.toBe('ok');
  });
});
