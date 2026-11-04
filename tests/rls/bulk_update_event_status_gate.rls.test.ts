// bulk_update_event_status() role gate and ACL (security audit 2026-11-04, M1; migration 20261104100000).
//
// It named no roles, so an auditor or body_admin could cancel or delete every event in their organisation, and
// `authenticated` could call it directly with any p_actor_user_id and have that user recorded as the audit actor.
// Now: organiser_admin, organiser_member and eventar_staff pass resolve_actor; body_admin and auditor raise 42501;
// only service_role holds EXECUTE (the one caller is app/dashboard/actions.ts, on the admin client).
//
// The probe is ONE DO block that ends in RAISE, so its organisation and staff fixtures roll back with the statement
// and nothing leaks. Every call passes an empty id array, so even an allowed role changes no event and writes no
// audit row. Gated on RLS_TESTS; local stack only (tests/helpers/clients.ts).
import { describe, it, expect } from 'vitest';
import { sqlSuperuserQuery } from '../helpers/clients';

const FN = 'public.bulk_update_event_status(uuid[], text, uuid, uuid)';

const PROBE = `
do $$
declare
  org uuid;
  sid uuid;
  r record;
  res jsonb := '{}';
  sq text;
  audit_before bigint := (select count(*) from public.audit_events where event_type in ('event_cancelled', 'event_soft_deleted', 'event_restored'));
begin
  insert into public.organisations (name, slug)
    values ('Bulk gate probe', 'bulk-gate-probe-' || gen_random_uuid()) returning id into org;
  create temp table probe_staff (role text, id uuid) on commit drop;
  grant all on probe_staff to public;
  for r in select x as role from unnest(array['organiser_admin','organiser_member','eventar_staff','body_admin','auditor']) x loop
    insert into public.staff (email, full_name, role, status, organisation_id)
      values ('zz-bulk-gate-' || r.role || '-' || gen_random_uuid() || '@example.test', 'Bulk gate probe', r.role, 'active', org)
      returning id into sid;
    insert into probe_staff values (r.role, sid);
  end loop;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  for r in select role, id from probe_staff loop
    begin
      perform * from public.bulk_update_event_status(array[]::uuid[], 'cancel', r.id, null);
      res := res || jsonb_build_object(r.role, 'ok');
    exception when others then
      get stacked diagnostics sq = returned_sqlstate;
      res := res || jsonb_build_object(r.role, sq);
    end;
  end loop;
  reset role;

  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);
  set local role authenticated;
  begin
    perform * from public.bulk_update_event_status(array[]::uuid[], 'cancel', null, '00000000-0000-0000-0000-000000000009');
    res := res || jsonb_build_object('authenticated', 'ok');
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    res := res || jsonb_build_object('authenticated', sq, 'authenticated_msg', sqlerrm);
  end;
  reset role;

  set local role anon;
  begin
    perform * from public.bulk_update_event_status(array[]::uuid[], 'cancel', null, null);
    res := res || jsonb_build_object('anon', 'ok');
  exception when others then
    get stacked diagnostics sq = returned_sqlstate;
    res := res || jsonb_build_object('anon', sq, 'anon_msg', sqlerrm);
  end;
  reset role;

  res := res || jsonb_build_object('audit_delta', (select count(*) from public.audit_events where event_type in ('event_cancelled', 'event_soft_deleted', 'event_restored')) - audit_before);
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

describe.skipIf(!process.env.RLS_TESTS)('bulk_update_event_status: role gate and ACL', () => {
  it('admits the three organiser roles and refuses body_admin and auditor with 42501', async () => {
    const res = await runProbe();
    expect(res).toMatchObject({
      organiser_admin: 'ok',
      organiser_member: 'ok',
      eventar_staff: 'ok',
      body_admin: '42501',
      auditor: '42501',
    });
  });

  it('refuses a signed-in or anonymous caller before the function runs, and writes no event-status audit row', async () => {
    const res = await runProbe();
    // 42501 alone also comes from resolve_actor ("not active staff"); the message proves it is the grant.
    expect(res.authenticated).toBe('42501');
    expect(res.authenticated_msg).toMatch(/permission denied for function bulk_update_event_status/);
    expect(res.anon).toBe('42501');
    expect(res.anon_msg).toMatch(/permission denied for function bulk_update_event_status/);
    expect(res.audit_delta).toBe(0);
  });

  it('holds EXECUTE for service_role only (PUBLIC, anon and authenticated all lack it)', async () => {
    const [row] = await sqlSuperuserQuery<{ anon: boolean; authenticated: boolean; service_role: boolean; public_acl: boolean }>(
      `select has_function_privilege('anon', '${FN}', 'EXECUTE') as anon,
              has_function_privilege('authenticated', '${FN}', 'EXECUTE') as authenticated,
              has_function_privilege('service_role', '${FN}', 'EXECUTE') as service_role,
              coalesce((select proacl::text ~ '(^|[{,])=' from pg_proc where oid = '${FN}'::regprocedure), false) as public_acl`,
    );
    expect(row).toEqual({ anon: false, authenticated: false, service_role: true, public_acl: false });
  });
});
