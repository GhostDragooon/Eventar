// Task 10.8/10.9, sub-task C1 — Hard Rule 11 negative test for the two new
// tables (20260815000000_event_occurrences_and_checkins.sql). Follows the
// exact pattern of tests/rls/audited_table_writes.rls.test.ts: both tables
// are definer-only (C2 will build the writer RPCs), so no role — including
// service_role, which has BYPASSRLS and gets no protection from RLS at all —
// may write to them directly. Unlike practitioner_licences, no role retains
// a DELETE grant here (no cleanup/erasure need exists yet for these tables),
// so this file asserts a full REVOKE on all three DML verbs for all three
// app roles, on both tables.
//
// NON-VACUOUSNESS: every denial asserts the specific SQLSTATE 42501
// (permission denied), not merely "an error occurred" — see
// audited_table_writes.rls.test.ts's header comment for why a bare
// not-null check would also pass against an open grant.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const BOGUS = '00000000-0000-0000-0000-0000000000ff';
const PERMISSION_DENIED = '42501';

describe.skipIf(!process.env.RLS_TESTS)('event_occurrences / registration_checkins RLS + write guard', () => {
  let staffId: string;
  let eventId: string;
  let occurrenceId: string;

  beforeAll(async () => {
    const { data: staff, error: staffErr } = await admin
      .from('staff')
      .insert({
        email: `rls-occ-guard-${Date.now()}@example.com`,
        role: 'organiser_admin',
        full_name: 'RLS Test Occurrence Guard Staff',
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
        title: 'RLS Test Event (occurrence guard)',
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 86_400_000 + 3 * 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        venue_name: 'RLS Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.1,
        created_by: staffId,
        organisation_id: DEFAULT_ORG,
        status: 'published',
      })
      .select('id')
      .single();
    if (eventErr || !event) throw new Error(`event fixture: ${eventErr?.message}`);
    eventId = event.id as string;

    // The AFTER INSERT trigger auto-creates ordinal=1 for us.
    const { data: occ, error: occErr } = await admin
      .from('event_occurrences')
      .select('id')
      .eq('event_id', eventId)
      .single();
    if (occErr || !occ) throw new Error(`occurrence lookup: ${occErr?.message}`);
    occurrenceId = occ.id as string;
  }, 60_000);

  afterAll(async () => {
    if (eventId) {
      // Cascades event_occurrences (and registration_checkins via any
      // registrations, though this file creates none).
      await mustDelete(admin.from('events').delete().eq('id', eventId), 'events fixture');
    }
    if (staffId) {
      await mustDelete(admin.from('staff').delete().eq('id', staffId), 'staff fixture');
    }
  }, 60_000);

  describe('event_occurrences — definer-only, no retained writer for any role', () => {
    it('anon and authenticated can SELECT (published-event read policy applies)', async () => {
      const anon = createAnonClient();
      const { data: anonRows, error: anonErr } = await anon
        .from('event_occurrences')
        .select('id')
        .eq('event_id', eventId);
      expect(anonErr).toBeNull();
      expect(anonRows).toHaveLength(1);
    });

    it('service_role is denied INSERT/UPDATE/DELETE with 42501 (BYPASSRLS: only the grant blocks it)', async () => {
      const ins = await admin
        .from('event_occurrences')
        .insert({ event_id: eventId, ordinal: 99, occurrence_type: 'session', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3_600_000).toISOString() });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin.from('event_occurrences').update({ name: 'x' }).eq('id', occurrenceId);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);

      const del = await admin.from('event_occurrences').delete().eq('id', occurrenceId);
      expect(del.error?.code, 'service_role DELETE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('event_occurrences').insert({ event_id: eventId, ordinal: 98, occurrence_type: 'session', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3_600_000).toISOString() })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-eventocc-write');
      try {
        expect(
          (await user.client.from('event_occurrences').insert({ event_id: eventId, ordinal: 97, occurrence_type: 'session', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3_600_000).toISOString() })).error?.code,
          'authenticated INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });

  describe('registration_checkins — definer-only, no retained writer for any role', () => {
    it('service_role is denied INSERT/UPDATE/DELETE with 42501 (BYPASSRLS: only the grant blocks it)', async () => {
      const ins = await admin
        .from('registration_checkins')
        .insert({ registration_id: BOGUS, occurrence_id: occurrenceId, checked_in_at: new Date().toISOString() });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin
        .from('registration_checkins')
        .update({ check_in_method: 'manual' })
        .eq('id', BOGUS);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);

      const del = await admin.from('registration_checkins').delete().eq('id', BOGUS);
      expect(del.error?.code, 'service_role DELETE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('registration_checkins').insert({ registration_id: BOGUS, occurrence_id: occurrenceId, checked_in_at: new Date().toISOString() })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user: TestUser = await createTestUser('guard-regcheckin-write');
      try {
        expect(
          (await user.client.from('registration_checkins').insert({ registration_id: BOGUS, occurrence_id: occurrenceId, checked_in_at: new Date().toISOString() })).error?.code,
          'authenticated INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });
});
