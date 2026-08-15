// Task 10.8/10.9, sub-task C3 — Hard Rule 11 negative test for the four new
// multi-body accreditation tables (20260815020000_accreditation_groups_and_
// roles.sql). Follows the exact pattern of tests/rls/event_occurrences.rls.test.ts:
// all four tables are definer-only (the compatibility bridge inside
// set_event_cpd_config is the sole writer today; C4/C5 add more later), so no
// role — including service_role, which has BYPASSRLS and gets no protection
// from RLS at all — may write to them directly. No role retains a DELETE
// (no cleanup/erasure need identified for any of the four).
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
} from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const BOGUS = '00000000-0000-0000-0000-0000000000ff';
const PERMISSION_DENIED = '42501';

describe.skipIf(!process.env.RLS_TESTS)('event_accreditation_groups / event_accreditations / event_accreditation_occurrences / registration_roles RLS + write guard', () => {
  let staffId: string;
  let bodyId: string;
  let eventId: string;
  let groupId: string;
  let accreditationId: string;
  let occurrenceId: string;
  const ts = Date.now();

  beforeAll(async () => {
    const { data: staff, error: staffErr } = await admin
      .from('staff')
      .insert({
        email: `rls-accgrp-guard-${ts}@example.com`,
        role: 'organiser_admin',
        full_name: 'RLS Test Accreditation Group Guard Staff',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    if (staffErr || !staff) throw new Error(`staff fixture: ${staffErr?.message}`);
    staffId = staff.id as string;

    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-ACCGRP-${ts}`,
        full_name: 'RLS Test Body (accreditation_groups guard fixture)',
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    const { error: authErr } = await admin.from('organisation_body_authorisations').insert({
      organisation_id: DEFAULT_ORG,
      body_id: bodyId,
      status: 'active',
    });
    if (authErr) throw new Error(`org authorisation fixture: ${authErr.message}`);

    const { data: event, error: eventErr } = await admin
      .from('events')
      .insert({
        title: 'RLS Test Event (accreditation group guard)',
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
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

    // Real production write path — the compatibility bridge inside
    // set_event_cpd_config — builds the group/accreditation/occurrence-link
    // triple. p_actor_override is honoured here because `admin` carries a
    // real service_role JWT (auth.role() = 'service_role').
    const { error: rpcErr } = await admin.rpc('set_event_cpd_config', {
      p_event_id: eventId,
      p_body_id: bodyId,
      p_cpd_hours: 3,
      p_actor_override: staffId,
    });
    if (rpcErr) throw new Error(`set_event_cpd_config fixture: ${rpcErr.message}`);

    const { data: group, error: groupErr } = await admin
      .from('event_accreditation_groups')
      .select('id')
      .eq('event_id', eventId)
      .single();
    if (groupErr || !group) throw new Error(`group lookup: ${groupErr?.message}`);
    groupId = group.id as string;

    const { data: accreditation, error: accErr } = await admin
      .from('event_accreditations')
      .select('id')
      .eq('accreditation_group_id', groupId)
      .single();
    if (accErr || !accreditation) throw new Error(`accreditation lookup: ${accErr?.message}`);
    accreditationId = accreditation.id as string;

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
      // Cascades event_occurrences, event_accreditation_groups ->
      // event_accreditations -> event_accreditation_occurrences (the
      // occurrence_id FK is DEFERRABLE INITIALLY DEFERRED specifically so
      // this whole-event cascade delete succeeds — see the migration).
      await mustDelete(admin.from('events').delete().eq('id', eventId), 'events fixture');
    }
    if (bodyId) {
      // Cascades organisation_body_authorisations.
      await mustDelete(admin.from('accrediting_bodies').delete().eq('id', bodyId), 'accrediting_bodies fixture');
    }
    if (staffId) {
      await mustDelete(admin.from('staff').delete().eq('id', staffId), 'staff fixture');
    }
  }, 60_000);

  describe('event_accreditation_groups — definer-only, no retained writer for any role', () => {
    it('anon and authenticated can SELECT (published-event read policy applies)', async () => {
      const anon = createAnonClient();
      const { data, error } = await anon.from('event_accreditation_groups').select('id').eq('event_id', eventId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('service_role is denied INSERT/UPDATE/DELETE with 42501 (BYPASSRLS: only the grant blocks it)', async () => {
      const ins = await admin
        .from('event_accreditation_groups')
        .insert({ event_id: eventId, body_id: bodyId, award_scheme: 'proportional' });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin.from('event_accreditation_groups').update({ unit: 'points' }).eq('id', groupId);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);

      const del = await admin.from('event_accreditation_groups').delete().eq('id', groupId);
      expect(del.error?.code, 'service_role DELETE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('event_accreditation_groups').insert({ event_id: eventId, body_id: bodyId, award_scheme: 'proportional' })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-accgrp-write');
      try {
        expect(
          (await user.client.from('event_accreditation_groups').insert({ event_id: eventId, body_id: bodyId, award_scheme: 'proportional' })).error?.code,
          'authenticated INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });

  describe('event_accreditations — definer-only, no retained writer for any role', () => {
    it('anon and authenticated can SELECT (published-event read policy applies)', async () => {
      const anon = createAnonClient();
      const { data, error } = await anon.from('event_accreditations').select('id').eq('accreditation_group_id', groupId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('service_role is denied INSERT/UPDATE/DELETE with 42501', async () => {
      const ins = await admin
        .from('event_accreditations')
        .insert({ accreditation_group_id: groupId, credit_value: 1 });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin.from('event_accreditations').update({ credit_value: 9 }).eq('id', accreditationId);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);

      const del = await admin.from('event_accreditations').delete().eq('id', accreditationId);
      expect(del.error?.code, 'service_role DELETE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('event_accreditations').insert({ accreditation_group_id: groupId, credit_value: 1 })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-acc-write');
      try {
        expect(
          (await user.client.from('event_accreditations').insert({ accreditation_group_id: groupId, credit_value: 1 })).error?.code,
          'authenticated INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });

  describe('event_accreditation_occurrences — definer-only, no retained writer for any role', () => {
    it('anon and authenticated can SELECT (published-event read policy applies)', async () => {
      const anon = createAnonClient();
      const { data, error } = await anon
        .from('event_accreditation_occurrences')
        .select('accreditation_id')
        .eq('accreditation_id', accreditationId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('service_role is denied INSERT/UPDATE/DELETE with 42501', async () => {
      const ins = await admin
        .from('event_accreditation_occurrences')
        .insert({ accreditation_id: accreditationId, occurrence_id: BOGUS });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin
        .from('event_accreditation_occurrences')
        .update({ occurrence_id: BOGUS })
        .eq('accreditation_id', accreditationId)
        .eq('occurrence_id', occurrenceId);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);

      const del = await admin
        .from('event_accreditation_occurrences')
        .delete()
        .eq('accreditation_id', accreditationId)
        .eq('occurrence_id', occurrenceId);
      expect(del.error?.code, 'service_role DELETE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('event_accreditation_occurrences').insert({ accreditation_id: accreditationId, occurrence_id: BOGUS })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-accocc-write');
      try {
        expect(
          (await user.client.from('event_accreditation_occurrences').insert({ accreditation_id: accreditationId, occurrence_id: BOGUS })).error?.code,
          'authenticated INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });

  describe('registration_roles — definer-only, no retained writer for any role, no anon read', () => {
    it('anon cannot SELECT at all (attendee-linked, no public read policy)', async () => {
      const anon = createAnonClient();
      const { data, error } = await anon.from('registration_roles').select('registration_id').eq('registration_id', BOGUS);
      // RLS with no matching SELECT policy for anon returns an empty set,
      // not an error — assert emptiness, not error presence.
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('service_role is denied INSERT/UPDATE/DELETE with 42501', async () => {
      const ins = await admin.from('registration_roles').insert({ registration_id: BOGUS, role_code: 'attendee' });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin
        .from('registration_roles')
        .update({ role_code: 'chair' })
        .eq('registration_id', BOGUS)
        .eq('role_code', 'attendee');
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);

      const del = await admin
        .from('registration_roles')
        .delete()
        .eq('registration_id', BOGUS)
        .eq('role_code', 'attendee');
      expect(del.error?.code, 'service_role DELETE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('registration_roles').insert({ registration_id: BOGUS, role_code: 'attendee' })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-regroles-write');
      try {
        expect(
          (await user.client.from('registration_roles').insert({ registration_id: BOGUS, role_code: 'attendee' })).error?.code,
          'authenticated INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });
});
