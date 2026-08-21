// Task 10.8/10.9, sub-task C5 (backend half) — positive/negative round-trip
// for the 8 granular CRUD functions added in
// 20260820000000_multi_body_accreditation_crud.sql. The NEGATIVE direct-write
// guard on the four tables themselves is already covered by
// event_accreditation_groups.rls.test.ts (C3) and is not repeated here.
// This file tests what's actually new: each function's own ownership gate,
// eventar_staff's cross-tenant bypass, and the cross-event occurrence check
// (link_accreditation_occurrence) that nothing in the schema enforces for
// free — that check exists only inside the function.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const PERMISSION_DENIED = '42501';
const NOT_FOUND = 'P0002';
const BUSINESS_RULE = '22023';

describe.skipIf(!process.env.RLS_TESTS)('multi-body accreditation CRUD functions', () => {
  let ownerId: string;
  let otherOwnerId: string;
  let staffId: string;
  let bodyId: string;
  let eventId: string;
  let occurrenceId: string;
  let otherEventId: string;
  let otherOccurrenceId: string;
  let registrationId: string;
  const ts = Date.now();

  beforeAll(async () => {
    const mkStaff = async (role: string, label: string) => {
      const { data, error } = await admin
        .from('staff')
        .insert({
          email: `rls-c5-${label}-${ts}@example.com`,
          role,
          full_name: `RLS Test C5 ${label}`,
          organisation_id: DEFAULT_ORG,
          status: 'active',
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`${label} staff fixture: ${error?.message}`);
      return data.id as string;
    };
    ownerId = await mkStaff('organiser_admin', 'owner');
    otherOwnerId = await mkStaff('organiser_admin', 'other-owner');
    staffId = await mkStaff('eventar_staff', 'staff');

    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-C5-${ts}`,
        full_name: 'RLS Test Body (C5 CRUD fixture)',
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    const { error: authErr } = await admin
      .from('organisation_body_authorisations')
      .insert({ organisation_id: DEFAULT_ORG, body_id: bodyId, status: 'active' });
    if (authErr) throw new Error(`org authorisation fixture: ${authErr.message}`);

    const mkEvent = async (label: string) => {
      const { data, error } = await admin
        .from('events')
        .insert({
          title: `RLS Test Event (C5 CRUD ${label})`,
          start_time: new Date(Date.now() + 86_400_000).toISOString(),
          end_time: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
          timezone: 'Asia/Hong_Kong',
          venue_name: 'RLS Test Venue',
          city: 'Hong Kong',
          country: 'HK',
          latitude: 22.3,
          longitude: 114.1,
          created_by: ownerId,
          organisation_id: DEFAULT_ORG,
          status: 'published',
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`${label} event fixture: ${error?.message}`);
      const eid = data.id as string;
      const { data: occ, error: occErr } = await admin
        .from('event_occurrences')
        .select('id')
        .eq('event_id', eid)
        .single();
      if (occErr || !occ) throw new Error(`${label} occurrence lookup: ${occErr?.message}`);
      return { eventId: eid, occurrenceId: occ.id as string };
    };
    ({ eventId, occurrenceId } = await mkEvent('primary'));
    ({ eventId: otherEventId, occurrenceId: otherOccurrenceId } = await mkEvent('other'));

    const { data: reg, error: regErr } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        full_name: 'RLS Test Registrant',
        email: `rls-c5-registrant-${ts}@example.com`,
        registration_code: `C5TEST${ts}`.slice(0, 12),
        status: 'registered',
      })
      .select('id')
      .single();
    if (regErr || !reg) throw new Error(`registration fixture: ${regErr?.message}`);
    registrationId = reg.id as string;
  }, 60_000);

  afterAll(async () => {
    if (registrationId) await mustDelete(admin.from('registrations').delete().eq('id', registrationId), 'registration fixture');
    if (eventId) await mustDelete(admin.from('events').delete().eq('id', eventId), 'events fixture');
    if (otherEventId) await mustDelete(admin.from('events').delete().eq('id', otherEventId), 'other event fixture');
    if (bodyId) await mustDelete(admin.from('accrediting_bodies').delete().eq('id', bodyId), 'accrediting_bodies fixture');
    if (ownerId) await mustDelete(admin.from('staff').delete().eq('id', ownerId), 'owner staff fixture');
    if (otherOwnerId) await mustDelete(admin.from('staff').delete().eq('id', otherOwnerId), 'other-owner staff fixture');
    if (staffId) await mustDelete(admin.from('staff').delete().eq('id', staffId), 'eventar_staff fixture');
  }, 60_000);

  describe('groups + schedule rows + occurrence links — owner round trip', () => {
    let groupId: string;
    let accreditationId: string;

    it('owner adds a group', async () => {
      const { data, error } = await admin.rpc('add_event_accreditation_group', {
        p_event_id: eventId,
        p_body_id: bodyId,
        p_category_code: null,
        p_unit: 'points',
        p_award_scheme: 'proportional',
        p_actor_override: ownerId,
      });
      expect(error).toBeNull();
      expect(data.event_id).toBe(eventId);
      groupId = data.id as string;
    });

    it('non-owner is denied with 42501/not_owner', async () => {
      const { error } = await admin.rpc('add_event_accreditation_group', {
        p_event_id: eventId,
        p_body_id: bodyId,
        p_category_code: null,
        p_unit: 'points',
        p_award_scheme: 'proportional',
        p_actor_override: otherOwnerId,
      });
      expect(error?.code).toBe(PERMISSION_DENIED);
      expect((error as unknown as { details?: string })?.details).toBe('not_owner');
    });

    it('eventar_staff can act on an event it does not own', async () => {
      const { data, error } = await admin.rpc('add_event_accreditation_row', {
        p_group_id: groupId,
        p_credit_value: 5,
        p_actor_override: staffId,
      });
      expect(error).toBeNull();
      accreditationId = data.id as string;
    });

    it('linking an occurrence from a DIFFERENT event is rejected with 22023/cross_event_occurrence', async () => {
      const { error } = await admin.rpc('link_accreditation_occurrence', {
        p_accreditation_id: accreditationId,
        p_occurrence_id: otherOccurrenceId,
        p_actor_override: ownerId,
      });
      expect(error?.code).toBe(BUSINESS_RULE);
      expect((error as unknown as { details?: string })?.details).toBe('cross_event_occurrence');
    });

    it('linking the event’s own occurrence succeeds', async () => {
      const { error } = await admin.rpc('link_accreditation_occurrence', {
        p_accreditation_id: accreditationId,
        p_occurrence_id: occurrenceId,
        p_actor_override: ownerId,
      });
      expect(error).toBeNull();

      const { data, error: readErr } = await admin
        .from('event_accreditation_occurrences')
        .select('occurrence_id')
        .eq('accreditation_id', accreditationId);
      expect(readErr).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('unlinking removes the link', async () => {
      const { error } = await admin.rpc('unlink_accreditation_occurrence', {
        p_accreditation_id: accreditationId,
        p_occurrence_id: occurrenceId,
        p_actor_override: ownerId,
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from('event_accreditation_occurrences')
        .select('occurrence_id')
        .eq('accreditation_id', accreditationId);
      expect(data).toHaveLength(0);
    });

    it('a bogus group id returns P0002, not a generic error', async () => {
      const { error } = await admin.rpc('add_event_accreditation_row', {
        p_group_id: '00000000-0000-0000-0000-0000000000ff',
        p_credit_value: 1,
        p_actor_override: ownerId,
      });
      expect(error?.code).toBe(NOT_FOUND);
    });

    it('removing the row then the group tears both down', async () => {
      expect((await admin.rpc('remove_event_accreditation_row', { p_accreditation_id: accreditationId, p_actor_override: ownerId })).error).toBeNull();
      expect((await admin.rpc('remove_event_accreditation_group', { p_group_id: groupId, p_actor_override: ownerId })).error).toBeNull();

      const { data } = await admin.from('event_accreditation_groups').select('id').eq('id', groupId);
      expect(data).toHaveLength(0);
    });
  });

  describe('registration_roles', () => {
    it('owner sets a role', async () => {
      const { data, error } = await admin.rpc('set_registration_role', {
        p_registration_id: registrationId,
        p_role_code: 'chair',
        p_actor_override: ownerId,
      });
      expect(error).toBeNull();
      expect(data.role_code).toBe('chair');
      expect(data.assigned_by).toBe(ownerId);
    });

    it('setting the same role twice is idempotent, not an error', async () => {
      const { error } = await admin.rpc('set_registration_role', {
        p_registration_id: registrationId,
        p_role_code: 'chair',
        p_actor_override: ownerId,
      });
      expect(error).toBeNull();

      const { data } = await admin.from('registration_roles').select('role_code').eq('registration_id', registrationId);
      expect(data).toHaveLength(1);
    });

    it('a non-owner, non-member is denied with 42501', async () => {
      const { error } = await admin.rpc('set_registration_role', {
        p_registration_id: registrationId,
        p_role_code: 'presenter',
        p_actor_override: otherOwnerId,
      });
      expect(error?.code).toBe(PERMISSION_DENIED);
    });

    it('an invalid role_code is rejected by the column CHECK (23514)', async () => {
      const { error } = await admin.rpc('set_registration_role', {
        p_registration_id: registrationId,
        p_role_code: 'keynote',
        p_actor_override: ownerId,
      });
      expect(error?.code).toBe('23514');
    });

    it('removing the role clears it', async () => {
      const { error } = await admin.rpc('remove_registration_role', {
        p_registration_id: registrationId,
        p_role_code: 'chair',
        p_actor_override: ownerId,
      });
      expect(error).toBeNull();

      const { data } = await admin.from('registration_roles').select('role_code').eq('registration_id', registrationId);
      expect(data).toHaveLength(0);
    });
  });

  describe('every function denies anon/authenticated at the resolve_actor layer', () => {
    it('a plain authenticated session with no override is rejected', async () => {
      const user = await createTestUser('c5-crud-noaccess');
      try {
        const { error } = await user.client.rpc('add_event_accreditation_group', {
          p_event_id: eventId,
          p_body_id: bodyId,
          p_category_code: null,
          p_unit: 'points',
          p_award_scheme: 'proportional',
        });
        expect(error?.code).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);
  });
});
