// CPD Sprint 2 / Task 12 — publish_event RLS + audit probes against the
// live dev project. Converts the staff-facing publishEvent Server Action
// into an atomic, audited SECURITY DEFINER DB function. Owner-exclusive
// publish (same discipline as Q19's check-in owner-exclusivity) is now
// enforced in-function since the definer bypasses RLS entirely.
//
// Unlike mark_attended, publish_event returns void (no OUT params / no
// RETURNS TABLE) — no ambiguous-column hazard (that was specific to
// self_check_in's own named OUT parameters). It also never calls
// rate_limit_check, so there is no rate_limits fixture key to track here.
//
// All fixtures (events, staff, auth users) are disposable and cleaned up
// in afterEach/afterAll. Never touches the real live events/staff.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type ChainRow = {
  chain_seq: number;
  link_valid: boolean;
  content_valid: boolean;
};

describe.skipIf(!process.env.RLS_TESTS)('publish_event RLS + audit', () => {
  let owner: TestUser;
  let nonOwner: TestUser;
  let plainUser: TestUser; // authenticated but NOT staff — for the gate-denial case
  let ownerStaffId: string;
  const eventIds: string[] = [];
  const staffEmails: string[] = [];

  async function makeEventFixture(status: 'draft' | 'published' = 'draft'): Promise<string> {
    const { data, error } = await admin
      .from('events')
      .insert({
        title: 'publish_event RLS fixture — DELETE ME',
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 90_000_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: ownerStaffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status,
        organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (error) throw new Error(`event fixture: ${error.message}`);
    eventIds.push(data.id as string);
    return data.id as string;
  }

  beforeAll(async () => {
    owner = await createTestUser('publishevent-owner');
    nonOwner = await createTestUser('publishevent-nonowner');
    plainUser = await createTestUser('publishevent-plain');

    const { error } = await admin.from('staff').insert([
      {
        email: owner.email,
        role: 'organiser_member',
        full_name: 'RLS Test Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
      {
        email: nonOwner.email,
        role: 'organiser_member',
        full_name: 'RLS Test Non-Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
    ]);
    if (error) throw new Error(`staff fixture: ${error.message}`);
    staffEmails.push(owner.email, nonOwner.email);

    const { data: ownerStaff, error: ownerLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', owner.email)
      .single();
    if (ownerLookupErr || !ownerStaff) throw new Error(`owner staff lookup: ${ownerLookupErr?.message}`);
    ownerStaffId = ownerStaff.id as string;
  }, 60_000);

  afterEach(async () => {
    if (eventIds.length > 0) {
      // audit_events is append-only (Hard Rule 11) — service_role DELETE is
      // denied by design, so this cleanup attempt is expected to no-op/error
      // and is intentionally NOT wrapped in mustDelete.
      await admin.from('audit_events').delete().in('subject_id', eventIds);
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
      eventIds.length = 0;
    }
  }, 60_000);

  afterAll(async () => {
    // Belt-and-braces in case any single test's afterEach didn't run.
    if (eventIds.length > 0) {
      await admin.from('audit_events').delete().in('subject_id', eventIds); // see note above
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
    }
    if (staffEmails.length > 0) await mustDelete(admin.from('staff').delete().in('email', staffEmails), 'staff fixture');
    for (const u of [owner, nonOwner, plainUser]) if (u) await deleteTestUser(u);
  }, 60_000);

  // ---- 1. owner publishes their own draft event ----
  it('owner publishes their own draft event: status + published_at set, audited', async () => {
    const eventId = await makeEventFixture('draft');

    const { error } = await owner.client.rpc('publish_event', { p_event_id: eventId });
    expect(error).toBeNull();

    const { data: event } = await admin
      .from('events')
      .select('status, published_at')
      .eq('id', eventId)
      .single();
    expect(event?.status).toBe('published');
    expect(event?.published_at).not.toBeNull();
    const publishedAtMs = new Date(event!.published_at as string).getTime();
    expect(Date.now() - publishedAtMs).toBeLessThan(60_000);

    const { data: auditRow } = await admin
      .from('audit_events')
      .select('event_type, actor_role, payload')
      .eq('event_type', 'event_published')
      .eq('subject_id', eventId)
      .maybeSingle();
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actor_role).toBe('organiser_member');
    expect((auditRow?.payload as { attestation_status?: string })?.attestation_status).toBe(
      'organiser_attested',
    );
  });

  // ---- 2. a different staff member (not the owner) is rejected ----
  it('a different staff member attempting the owner\'s event errors with 42501', async () => {
    const eventId = await makeEventFixture('draft');

    const { error } = await nonOwner.client.rpc('publish_event', { p_event_id: eventId });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');

    // event must remain untouched
    const { data: event } = await admin
      .from('events')
      .select('status, published_at')
      .eq('id', eventId)
      .single();
    expect(event?.status).toBe('draft');
    expect(event?.published_at).toBeNull();
  });

  // ---- 3. a non-staff authenticated user is denied by the DB-level gate ----
  it('a non-staff authenticated user is denied by require_active_staff (42501)', async () => {
    const eventId = await makeEventFixture('draft');

    const { error } = await plainUser.client.rpc('publish_event', { p_event_id: eventId });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // ---- 4. publishing a non-existent event id (as valid staff) ----
  it('publishing a non-existent event id still errors 42501 (same not-found/not-owned path)', async () => {
    const { error } = await owner.client.rpc('publish_event', {
      p_event_id: '00000000-0000-0000-0000-000099999999',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  // ---- 5. create-time publish routes through the same audited path ----
  //
  // The create form's "Publish Event" button reaches create_event_with_blocks
  // with status='published', NOT publish_event(). Before 2026-08-03 that wrote
  // status='published' with published_at NULL and zero audit rows — a second,
  // unaudited publish path into the regulator-facing chain. These two tests
  // pin the invariant that matters: a published event is an audited event, no
  // matter which entry point created it.
  async function createViaRpc(status: 'draft' | 'published'): Promise<string> {
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(Date.now() + 90_000_000);
    const { data, error } = await owner.client.rpc('create_event_with_blocks', {
      event_input: {
        title: 'create_event_with_blocks RLS fixture — DELETE ME',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        timezone: 'Asia/Hong_Kong',
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status,
      },
      blocks_input: [],
    });
    if (error) throw new Error(`create_event_with_blocks(${status}): ${error.message}`);
    eventIds.push(data as string);
    return data as string;
  }

  it('creating an event as published sets published_at and writes the audit row', async () => {
    const eventId = await createViaRpc('published');

    const { data: event } = await admin
      .from('events')
      .select('status, published_at, created_by')
      .eq('id', eventId)
      .single();
    expect(event?.status).toBe('published');
    expect(event?.created_by).toBe(ownerStaffId);
    expect(event?.published_at).not.toBeNull();

    const { data: auditRows } = await admin
      .from('audit_events')
      .select('event_type, actor_role, payload')
      .eq('subject_id', eventId)
      .eq('event_type', 'event_published');
    expect(auditRows).toHaveLength(1);
    expect(auditRows?.[0]?.actor_role).toBe('organiser_member');
    expect((auditRows?.[0]?.payload as { attestation_status?: string })?.attestation_status).toBe(
      'organiser_attested',
    );
  });

  it('creating an event as a draft publishes nothing and audits nothing', async () => {
    const eventId = await createViaRpc('draft');

    const { data: event } = await admin
      .from('events')
      .select('status, published_at')
      .eq('id', eventId)
      .single();
    expect(event?.status).toBe('draft');
    expect(event?.published_at).toBeNull();

    const { data: auditRows } = await admin
      .from('audit_events')
      .select('id')
      .eq('subject_id', eventId)
      .eq('event_type', 'event_published');
    expect(auditRows).toHaveLength(0);
  });

  // ---- 6. status/published_at are definer-only (migration 20260802182411) ----
  //
  // Routing the create form through publish_event() only closes the audit hole
  // if `status` stops being a plain writable column: events_organizer_update_own
  // is `for update to authenticated using (created_by = current_staff_id())`
  // with no column restriction, so a table-level grant let an organiser publish
  // their own event straight through PostgREST with no audit row and no
  // published_at. Closed at the GRANT layer, same logic as the CPD config
  // columns (Hard Rule 11: RLS is not the control here).
  //
  // Every denial asserts 42501 specifically — a bare "an error occurred" would
  // also match an RLS no-op or a NOT NULL rejection, which prove nothing about
  // the grant.
  it('denies an authenticated organiser a direct write to status or published_at', async () => {
    const eventId = await makeEventFixture('draft');

    const { error: statusErr } = await owner.client
      .from('events')
      .update({ status: 'published' })
      .eq('id', eventId);
    expect(statusErr?.code).toBe('42501');

    const { error: publishedAtErr } = await owner.client
      .from('events')
      .update({ published_at: new Date().toISOString() })
      .eq('id', eventId);
    expect(publishedAtErr?.code).toBe('42501');

    const { data: event } = await admin
      .from('events')
      .select('status, published_at')
      .eq('id', eventId)
      .single();
    expect(event?.status).toBe('draft');
    expect(event?.published_at).toBeNull();
  });

  it('denies a direct INSERT that names status, but still allows a plain draft INSERT', async () => {
    const base = {
      title: 'publish_event RLS fixture — DELETE ME',
      start_time: new Date(Date.now() + 86_400_000).toISOString(),
      end_time: new Date(Date.now() + 90_000_000).toISOString(),
      timezone: 'Asia/Hong_Kong',
      created_by: ownerStaffId,
      venue_name: 'Test Venue',
      city: 'Hong Kong',
      country: 'HK',
      latitude: 22.3,
      longitude: 114.2,
      // organisation_id is deliberately absent: 20260804030000 revoked it from
      // authenticated (naming it here now returns 42501 for the wrong reason)
      // and the set_event_organisation trigger derives it instead. Asserted
      // below rather than supplied.
    };

    const { error: withStatus } = await owner.client
      .from('events')
      .insert({ ...base, status: 'published' });
    expect(withStatus?.code).toBe('42501');

    const { error: withOrg } = await owner.client
      .from('events')
      .insert({ ...base, organisation_id: DEFAULT_ORG });
    expect(withOrg?.code).toBe('42501');

    // No over-revoke: the same row without either locked column inserts fine and
    // lands as a draft (the column default), which is what
    // create_event_with_blocks relies on.
    const { data, error } = await owner.client
      .from('events').insert(base).select('id, status, organisation_id').single();
    expect(error).toBeNull();
    expect(data?.status).toBe('draft');
    // The trigger, not the caller, decided the tenancy — derived from the
    // creating staff row.
    expect(data?.organisation_id).toBe(DEFAULT_ORG);
    eventIds.push(data!.id as string);
  });

  it('update_event_with_blocks edits the event but cannot change its lifecycle', async () => {
    const eventId = await makeEventFixture('draft');
    const { error: publishErr } = await owner.client.rpc('publish_event', { p_event_id: eventId });
    expect(publishErr).toBeNull();

    // A `status` key in the payload used to reach `status = coalesce(...)` in the
    // RPC's SET list. Sending 'draft' here would have silently DEMOTED a
    // published event with no audit trace; it is now ignored.
    const { error } = await owner.client.rpc('update_event_with_blocks', {
      event_id_input: eventId,
      event_input: {
        title: 'publish_event RLS fixture — DELETE ME (edited)',
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 90_000_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        venue_name: 'Edited Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'draft',
      },
      blocks_input: [],
    });
    expect(error).toBeNull();

    const { data: event } = await admin
      .from('events')
      .select('status, published_at, venue_name')
      .eq('id', eventId)
      .single();
    expect(event?.venue_name).toBe('Edited Venue'); // the edit itself landed
    expect(event?.status).toBe('published');        // lifecycle untouched
    expect(event?.published_at).not.toBeNull();
  });

  // ---- 7. audit chain stays valid after all the above ----
  it('verify_audit_chain reports zero broken links after fixture inserts', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);
  }, 60_000);
});
