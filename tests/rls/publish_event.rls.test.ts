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
      await admin.from('audit_events').delete().in('subject_id', eventIds);
      await admin.from('events').delete().in('id', eventIds);
      eventIds.length = 0;
    }
  }, 60_000);

  afterAll(async () => {
    // Belt-and-braces in case any single test's afterEach didn't run.
    if (eventIds.length > 0) {
      await admin.from('audit_events').delete().in('subject_id', eventIds);
      await admin.from('events').delete().in('id', eventIds);
    }
    if (staffEmails.length > 0) await admin.from('staff').delete().in('email', staffEmails);
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

  // ---- 5. audit chain stays valid after all the above ----
  it('verify_audit_chain reports zero broken links after fixture inserts', async () => {
    const { data, error } = await admin.rpc('verify_audit_chain');
    expect(error).toBeNull();
    const rows = data as ChainRow[];
    const invalid = rows.filter((r) => !r.link_valid || !r.content_valid);
    expect(invalid).toHaveLength(0);
  }, 60_000);
});
