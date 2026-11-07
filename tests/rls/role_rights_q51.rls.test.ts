// Q51 role rights (Ivan, 2026-11-06/07): organiser_admin acts on every event in its organisation, organiser_member
// only on events it created, body_admin and auditor are read-only, eventar_staff acts on every event.
// Enforced at the write by app_private.enforce_event_writer() on every event-owned table, plus the RPCs whose own
// checks disagreed (role chips, multi-body accreditation, mark_attended, bulk_update_event_status) and the hero-image
// storage policies.
//
// One DO block that ends in RAISE, so every fixture rolls back and nothing leaks. Each attempt runs in its own
// sub-block, so an allowed write is undone before the next attempt. Refusals must be SQLSTATE 42501 (Hard rule 11:
// a bare error could be a NOT NULL or a constraint). Gated on RLS_TESTS; local stack only.
import { describe, it, expect } from 'vitest';
import { sqlSuperuserQuery } from '../helpers/clients';

const PROBE = `
do $$
declare
  org uuid; org_b uuid;
  ev_m uuid; ev_a uuid; reg_m uuid; reg_a uuid; ev_live uuid; sp_a uuid; uid_m uuid; n_claim integer;
  r record; t record;
  res jsonb := '{}';
  sq text; n integer; k text;
begin
  insert into public.organisations (name, slug) values ('Q51 probe', 'q51-probe-' || gen_random_uuid()) returning id into org;
  insert into public.organisations (name, slug) values ('Q51 probe B', 'q51-probe-b-' || gen_random_uuid()) returning id into org_b;
  create temp table p (who text, id uuid, email text, uid uuid) on commit drop;
  grant all on p to public;
  for r in select * from (values ('admin','organiser_admin',org), ('member','organiser_member',org), ('member2','organiser_member',org),
                                 ('body','body_admin',org), ('auditor','auditor',org), ('eventar','eventar_staff',org),
                                 ('admin_b','organiser_admin',org_b), ('eventar_b','eventar_staff',org_b)) v(who, role, o) loop
    k := 'zz-q51-' || r.who || '-' || gen_random_uuid() || '@example.test';
    insert into public.staff (email, full_name, role, status, organisation_id) values (k, 'Q51 probe', r.role, 'active', r.o);
    insert into p select r.who, s.id, k, gen_random_uuid() from public.staff s where s.email = k;
  end loop;

  insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude)
    values ('ZZ-Q51 member event', now() + interval '10 days', now() + interval '10 days 3 hours', 'Asia/Hong_Kong',
            (select id from p where who = 'member'), 'V', 'Hong Kong', 'HK', 22.3, 114.2) returning id into ev_m;
  insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude)
    values ('ZZ-Q51 admin event', now() + interval '10 days', now() + interval '10 days 3 hours', 'Asia/Hong_Kong',
            (select id from p where who = 'admin'), 'V', 'Hong Kong', 'HK', 22.3, 114.2) returning id into ev_a;
  insert into public.registrations (event_id, email, full_name, registration_code)
    values (ev_m, 'zz-q51-a@example.test', 'A', 'Q51M' || substr(gen_random_uuid()::text, 1, 6)) returning id into reg_m;
  insert into public.registrations (event_id, email, full_name, registration_code)
    values (ev_a, 'zz-q51-b@example.test', 'B', 'Q51A' || substr(gen_random_uuid()::text, 1, 6)) returning id into reg_a;

  for r in select * from p loop
    perform set_config('request.jwt.claims',
      jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
    set local role authenticated;
    for t in select * from (values ('own', ev_m, reg_m), ('other', ev_a, reg_a)) v(tag, ev, reg) loop
      begin
        update public.events set title = title where id = t.ev;
        get diagnostics n = row_count;
        res := res || jsonb_build_object(r.who || ':edit:' || t.tag, case when n > 0 then 'ok' else 'none' end);
        raise exception 'undo' using errcode = 'P0099';
      exception when others then
        get stacked diagnostics sq = returned_sqlstate;
        if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':edit:' || t.tag, sq); end if;
      end;
      begin
        perform public.publish_event(t.ev, null);
        res := res || jsonb_build_object(r.who || ':publish:' || t.tag, 'ok');
        raise exception 'undo' using errcode = 'P0099';
      exception when others then
        get stacked diagnostics sq = returned_sqlstate;
        if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':publish:' || t.tag, sq); end if;
      end;
      begin
        perform public.set_registration_role(t.reg, 'chair', null);
        res := res || jsonb_build_object(r.who || ':role:' || t.tag, 'ok');
        raise exception 'undo' using errcode = 'P0099';
      exception when others then
        get stacked diagnostics sq = returned_sqlstate;
        if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':role:' || t.tag, sq); end if;
      end;
      begin
        insert into storage.objects (bucket_id, name) values ('event-hero-images', t.ev || '/q51.png');
        res := res || jsonb_build_object(r.who || ':hero:' || t.tag, 'ok');
        raise exception 'undo' using errcode = 'P0099';
      exception when others then
        get stacked diagnostics sq = returned_sqlstate;
        if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':hero:' || t.tag, sq); end if;
      end;
    end loop;
    begin
      insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude)
        values ('ZZ-Q51 new', now() + interval '20 days', now() + interval '20 days 1 hour', 'Asia/Hong_Kong', r.id, 'V', 'Hong Kong', 'HK', 22.3, 114.2);
      res := res || jsonb_build_object(r.who || ':create', 'ok');
      raise exception 'undo' using errcode = 'P0099';
    exception when others then
      get stacked diagnostics sq = returned_sqlstate;
      if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':create', sq); end if;
    end;
    begin
      insert into storage.objects (bucket_id, name) values ('event-hero-images', 'pending/' || r.uid || '/q51.png');
      res := res || jsonb_build_object(r.who || ':hero:pending_self', 'ok');
      raise exception 'undo' using errcode = 'P0099';
    exception when others then
      get stacked diagnostics sq = returned_sqlstate;
      if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':hero:pending_self', sq); end if;
    end;
    reset role;
  end loop;

  -- A member who spoofs created_by to a colleague.
  select * into r from p where who = 'member';
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
  set local role authenticated;
  begin
    insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude)
      values ('ZZ-Q51 spoof', now() + interval '20 days', now() + interval '20 days 1 hour', 'Asia/Hong_Kong',
              (select id from p where who = 'admin'), 'V', 'Hong Kong', 'HK', 22.3, 114.2);
    res := res || jsonb_build_object('member:create_spoofed', 'ok');
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:create_spoofed', sq); end if;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('event-hero-images', 'pending/' || gen_random_uuid() || '/q51.png');
    res := res || jsonb_build_object('member:hero:pending_other', 'ok');
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:hero:pending_other', sq); end if;
  end;
  reset role;

  -- Check-in on a live event the admin created; a speaker row on the admin's draft (for the move case).
  perform set_config('request.jwt.claims', '{}', true);   -- fixtures below are written as the superuser, not as the last actor
  insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude, status)
    values ('ZZ-Q51 live', now() + interval '30 minutes', now() + interval '3 hours', 'Asia/Hong_Kong',
            (select id from p where who = 'admin'), 'V', 'Hong Kong', 'HK', 22.3, 114.2, 'published') returning id into ev_live;
  insert into public.speaker_checkins (event_id, speaker_name) values (ev_a, 'Q51 Speaker') returning id into sp_a;
  for r in select * from p where who in ('admin', 'member', 'eventar_b') loop
    perform set_config('request.jwt.claims', '{}', true);
    insert into public.registrations (event_id, email, full_name, registration_code)
      values (ev_live, 'zz-q51-live-' || r.who || '@example.test', 'L', 'Q51L' || substr(md5(r.who), 1, 6));
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
    set local role authenticated;
    begin
      select m.result into k from public.mark_attended('Q51L' || substr(md5(r.who), 1, 6), 'manual', null) m;
      res := res || jsonb_build_object(r.who || ':checkin:admin_event', k);
      raise exception 'undo' using errcode = 'P0099';
    exception when others then
      get stacked diagnostics sq = returned_sqlstate;
      if sq <> 'P0099' then res := res || jsonb_build_object(r.who || ':checkin:admin_event', sq); end if;
    end;
    reset role;
  end loop;

  select * into r from p where who = 'member';
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
  set local role authenticated;
  -- M1: moving a colleague's row onto your own event is checked against the event it leaves.
  begin
    update public.speaker_checkins set event_id = ev_m where id = sp_a;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('member:move_speaker_row', case when n > 0 then 'ok' else 'none' end);
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:move_speaker_row', sq); end if;
  end;
  begin
    insert into public.speaker_checkins (event_id, speaker_name) values (ev_a, 'Q51 New');
    res := res || jsonb_build_object('member:speaker:other', 'ok');
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:speaker:other', sq); end if;
  end;
  begin
    perform public.update_registration_contact(reg_a, 'Renamed', 'zz-q51-b@example.test', null);
    res := res || jsonb_build_object('member:contact:other', 'ok');
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:contact:other', sq); end if;
  end;
  reset role;

  -- M2: a staff account is also a practitioner account; claiming its own registration on a colleague's event works.
  uid_m := r.uid;
  perform set_config('request.jwt.claims', '{}', true);
  insert into auth.users (id, email, email_confirmed_at, aud, role) values (uid_m, r.email, now(), 'authenticated', 'authenticated');
  insert into public.users (id, full_name) values (uid_m, 'Q51 member') on conflict do nothing;
  insert into public.registrations (event_id, email, full_name, registration_code) values (ev_a, r.email, 'Self', 'Q51C' || substr(gen_random_uuid()::text, 1, 6));
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'email', r.email, 'sub', r.uid)::text, true);
  set local role authenticated;
  begin
    n_claim := public.claim_registrations_for_user();
    res := res || jsonb_build_object('member:claim_own_registration', n_claim);
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:claim_own_registration', sq, 'claim_msg', sqlerrm); end if;
  end;
  reset role;

  -- bulk_update_event_status runs on the admin client: a batch with an event the member did not create is refused whole.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  begin
    perform * from public.bulk_update_event_status(array[ev_m, ev_a], 'cancel', (select id from p where who = 'member'), null);
    res := res || jsonb_build_object('member:bulk:mixed', 'ok');
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    res := res || jsonb_build_object('member:bulk:mixed', sq);
  end;
  res := res || jsonb_build_object('member:bulk:mixed_changed',
    (select count(*) from public.events where id in (ev_m, ev_a) and status = 'cancelled'));
  begin
    perform * from public.bulk_update_event_status(array[ev_m], 'cancel', (select id from p where who = 'member'), null);
    res := res || jsonb_build_object('member:bulk:own', 'ok');
    raise exception 'undo' using errcode = 'P0099';
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    if sq <> 'P0099' then res := res || jsonb_build_object('member:bulk:own', sq); end if;
  end;
  reset role;

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

describe.skipIf(!process.env.RLS_TESTS)('Q51 role rights', () => {
  it('admin acts on every org event, member on its own, body_admin and auditor on none, eventar on all', async () => {
    const res = await runProbe();
    const DENY = '42501';
    expect(res).toMatchObject({
      'admin:edit:own': 'ok', 'admin:edit:other': 'ok',
      'member:edit:own': 'ok', 'member:edit:other': DENY,
      'member2:edit:own': DENY, 'member2:edit:other': DENY,
      'body:edit:own': DENY, 'body:edit:other': DENY,
      'auditor:edit:own': DENY, 'auditor:edit:other': DENY,
      'eventar:edit:own': 'ok', 'eventar:edit:other': 'ok',
      'admin_b:edit:own': 'none', 'admin_b:edit:other': 'none',

      'admin:publish:own': 'ok', 'admin:publish:other': 'ok',
      'member:publish:own': 'ok', 'member:publish:other': DENY,
      'member2:publish:own': DENY,
      'body:publish:own': DENY, 'auditor:publish:own': DENY,

      'admin:role:own': 'ok', 'admin:role:other': 'ok',
      'member:role:own': 'ok', 'member:role:other': DENY,
      'member2:role:own': DENY, 'body:role:own': DENY, 'auditor:role:own': DENY,
      'eventar:role:own': 'ok',

      'admin:hero:own': 'ok', 'admin:hero:other': 'ok',
      'member:hero:own': 'ok', 'member:hero:other': DENY,
      'member2:hero:own': DENY, 'body:hero:own': DENY, 'auditor:hero:own': DENY,
      'admin_b:hero:own': DENY,
      'member:hero:pending_self': 'ok', 'body:hero:pending_self': DENY, 'auditor:hero:pending_self': DENY,
      'member:hero:pending_other': DENY,

      'admin:create': 'ok', 'member:create': 'ok', 'eventar:create': 'ok',
      'body:create': DENY, 'auditor:create': DENY,
      'member:create_spoofed': DENY,

      'member:bulk:mixed': DENY, 'member:bulk:mixed_changed': 0,
      'admin:checkin:admin_event': 'ok', 'member:checkin:admin_event': 'not_recognised', 'eventar_b:checkin:admin_event': 'ok',
      // Pre-existing, not changed by Q51: the events UPDATE policy is organisation-scoped, so eventar_staff of another
      // organisation edits nothing through PostgREST (0 rows), while the definer RPCs (publish, check-in) let it act.
      'eventar_b:edit:own': 'none', 'eventar_b:publish:other': 'ok',
      'member:move_speaker_row': DENY, 'member:speaker:other': DENY, 'member:contact:other': DENY,
      'member:claim_own_registration': 1,
      'member:bulk:own': 'ok',
    });
  });
});
