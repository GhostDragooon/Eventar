// Practitioner Eventar record (2026-09-18 product decision) — R0.
// registrations had no self-read RLS policy before
// 20260919000000_registrations_self_read.sql; this asserts the fix and its
// boundary: linked rows are visible to their own user, guest (unlinked) rows
// stay invisible to everyone but staff/anon-insert, and cross-user reads are
// filtered (not errored) — same shape as tests/rls/practitioner_licences.rls.test.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const ts = Date.now();

describe.skipIf(!process.env.RLS_TESTS)('registrations self-read RLS', () => {
  let ownerStaffId: string;
  let owner: TestUser;
  let userA: TestUser;
  let userB: TestUser;
  let eventId: string;
  let linkedRegId: string;
  let guestRegId: string;

  beforeAll(async () => {
    owner = await createTestUser(`reg-self-read-owner-${ts}`);
    const { data: s, error: sErr } = await admin
      .from('staff')
      .insert({
        email: owner.email,
        role: 'organiser_admin',
        full_name: 'Reg Self-Read Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    if (sErr || !s) throw new Error(`staff fixture: ${sErr?.message}`);
    ownerStaffId = s.id as string;

    userA = await createTestUser(`reg-self-read-a-${ts}`);
    userB = await createTestUser(`reg-self-read-b-${ts}`);

    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        title: 'Registrations Self-Read Fixture — DELETE ME',
        start_time: new Date(Date.now() + 3_600_000).toISOString(),
        end_time: new Date(Date.now() + 7_200_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: ownerStaffId,
        venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
        status: 'published',
        organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event fixture: ${evErr?.message}`);
    eventId = ev.id as string;

    // userA's own, claimed registration — the row the self-read policy must expose.
    const { data: l, error: lErr } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: userA.email,
        full_name: 'User A',
        registration_code: `WK-SR${String(ts).slice(-4)}A`,
        user_id: userA.id,
      })
      .select('id')
      .single();
    if (lErr || !l) throw new Error(`linked reg fixture: ${lErr?.message}`);
    linkedRegId = l.id as string;

    // Unclaimed guest registration (user_id null) — must stay invisible to everyone below.
    const { data: g, error: gErr } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `guest-${ts}@rls-test.invalid`,
        full_name: 'Guest',
        registration_code: `WK-SR${String(ts).slice(-4)}G`,
      })
      .select('id')
      .single();
    if (gErr || !g) throw new Error(`guest reg fixture: ${gErr?.message}`);
    guestRegId = g.id as string;
  }, 60_000);

  afterAll(async () => {
    await admin.from('registrations').delete().eq('event_id', eventId);
    await admin.from('events').delete().eq('id', eventId);
    await admin.from('staff').delete().eq('email', owner.email);
    await deleteTestUser(owner);
    await deleteTestUser(userA);
    await deleteTestUser(userB);
  });

  it('self user can read their own linked registration (self-read RLS)', async () => {
    const { data, error } = await userA.client
      .from('registrations')
      .select('id')
      .eq('id', linkedRegId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("another user cannot read this user's registration (filtered, not errored)", async () => {
    const { data, error } = await userB.client
      .from('registrations')
      .select('id')
      .eq('id', linkedRegId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anon cannot read the linked registration (filtered, not errored)', async () => {
    const anon = createAnonClient();
    const { data, error } = await anon
      .from('registrations')
      .select('id')
      .eq('id', linkedRegId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('unclaimed guest registration is invisible to every authenticated user (user_id null never matches auth.uid())', async () => {
    const { data: aData, error: aErr } = await userA.client
      .from('registrations')
      .select('id')
      .eq('id', guestRegId);
    expect(aErr).toBeNull();
    expect(aData).toHaveLength(0);

    const { data: bData, error: bErr } = await userB.client
      .from('registrations')
      .select('id')
      .eq('id', guestRegId);
    expect(bErr).toBeNull();
    expect(bData).toHaveLength(0);
  });

  it('organiser staff read of the same org keeps working alongside the new self-read policy (no regression)', async () => {
    const { data, error } = await owner.client
      .from('registrations')
      .select('id')
      .eq('event_id', eventId);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
}, 90_000);
