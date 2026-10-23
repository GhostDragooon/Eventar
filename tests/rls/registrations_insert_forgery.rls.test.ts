// Security review 2026-08-06 — anonymous attendance forgery via direct INSERT.
//
// The registrations INSERT policy (registrations_anon_insert_when_event_published)
// only checked that the event is published. Its WITH CHECK did NOT constrain
// `status`, `check_in_at`, or `check_in_method`, so the anon role — the role
// behind the public NEXT_PUBLIC anon key — could POST /rest/v1/registrations
// with status='attended' and a self-chosen registration_code, forging an
// attendance record with no check-in, no self-serve gate, no window, no audit
// event. On a CPD platform attendance is the basis for credit
// (reconcile-event.ts re-awards every attended row), so a forged row becomes a
// forged credit. Proven live during the review, then closed by
// 20260806000000_registrations_insert_status_lock.sql.
//
// This file is the standing regression guard: it must stay RED before that
// migration and GREEN after. Gated on RLS_TESTS (runs under `pnpm test:rls`).
//
// SEC-01 (20261023140000 for anon, 20261023150000 for authenticated) took INSERT away from both API roles at the
// grant layer: registration is a Server Action with the service-role client, and a direct POST skipped capacity,
// the windows and the rate limit. The policy is now unreachable through PostgREST, but it stays as defence in
// depth, so these probes still run: inside a transaction that is always rolled back, they grant the privilege
// back on purpose, SET LOCAL ROLE to anon or authenticated, and insert. If a later migration restores a grant,
// the policy still has to hold. That the grants are gone is asserted in audited_table_writes.rls.test.ts.
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { admin } from '../helpers/clients';
import { insertAsRoleWithGrant } from '../helpers/insertAsRole';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const STAFF_EMAIL = `insert-forgery-fixture-${Date.now()}@rls-test.invalid`;

describe.skipIf(!process.env.RLS_TESTS)('registrations INSERT policy — nobody can forge attendance (defence in depth)', () => {
  let staffId: string;
  let eventId: string;

  beforeAll(async () => {
    const { data: staff, error: staffErr } = await admin
      .from('staff')
      .insert({
        email: STAFF_EMAIL,
        role: 'organiser_member',
        full_name: 'RLS Test Staff (insert-forgery fixture)',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    if (staffErr || !staff) throw new Error(`staff fixture: ${staffErr?.message}`);
    staffId = staff.id as string;

    const { data: event, error: eventErr } = await admin
      .from('events')
      .insert({
        title: 'insert-forgery RLS fixture — DELETE ME',
        start_time: new Date(Date.now() + 3_600_000).toISOString(),
        end_time: new Date(Date.now() + 7_200_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: staffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'published',
        organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (eventErr || !event) throw new Error(`event fixture: ${eventErr?.message}`);
    eventId = event.id as string;
  }, 60_000);

  // No .select() on the anon inserts: a raw attacker POST defaults to
  // Prefer: return=minimal, so this faithfully probes the INSERT WITH CHECK
  // rather than the (absent) anon SELECT policy that a RETURNING would trip.
  afterEach(async () => {
    await mustDelete(admin.from('registrations').delete().eq('event_id', eventId), 'registrations');
  });

  afterAll(async () => {
    await mustDelete(admin.from('events').delete().eq('id', eventId), 'event');
    await mustDelete(admin.from('staff').delete().eq('id', staffId), 'staff');
  });

  describe.each(['anon', 'authenticated'] as const)('as %s', (role) => {
    it('REJECTS an insert that sets status=attended', async () => {
      const r = await insertAsRoleWithGrant(role, 'registrations', {
        event_id: eventId,
        email: 'forge-attended@rls-test.invalid',
        full_name: 'Forged Attendee',
        status: 'attended',
        check_in_at: new Date().toISOString(),
        check_in_method: 'qr',
        registration_code: 'WK-FORGE1',
      });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.code).toBe('42501'); // RLS violation, not a constraint reject
      expect(r.ok === false && r.message).toMatch(/row-level security/i); // the policy, not the grant
    });

    it('REJECTS an insert that back-dates a check-in without changing status', async () => {
      const r = await insertAsRoleWithGrant(role, 'registrations', {
        event_id: eventId,
        email: 'forge-checkin@rls-test.invalid',
        full_name: 'Forged Checkin',
        check_in_at: new Date().toISOString(),
        check_in_method: 'manual',
        registration_code: 'WK-FORGE2',
      });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.code).toBe('42501');
      expect(r.ok === false && r.message).toMatch(/row-level security/i);
    });

    it('STILL ALLOWS a normal registration through the policy (status defaults to registered)', async () => {
      const r = await insertAsRoleWithGrant(role, 'registrations', {
        event_id: eventId,
        email: 'legit-registrant@rls-test.invalid',
        full_name: 'Legit Registrant',
        registration_code: 'WK-LEGIT1',
      });
      expect(r, r.ok ? '' : r.message).toEqual({ ok: true });
    });
  });
});
