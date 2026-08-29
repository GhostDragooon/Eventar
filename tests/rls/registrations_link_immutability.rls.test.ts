// Stage D / D1 — registrations link-column immutability + guest-INSERT
// user_id block regression suite.
//
// Plan §8.6 bullet 3 (snapshot immutable from client) + §8.2 (user_id set
// only via definer/Server Action). Migrations under test:
//   20260829090000 (columns) + 20260829100000 (triggers).
//
// current_user check inside the trigger is what lets service_role writes
// through (Server Actions) while blocking direct authenticated/anon
// writes — this file asserts both directions.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin, createAnonClient, createTestUser, deleteTestUser, sqlSuperuser, type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const ts = Date.now();
const STAFF_EMAIL = `link-immut-staff-${ts}@rls-test.invalid`;

describe.skipIf(!process.env.RLS_TESTS)('registrations link-columns immutability', () => {
  let ownerStaffId: string;
  let owner: TestUser;
  let eventId: string;
  let guestRegId: string;
  let linkedRegId: string;
  let linkedUser: TestUser;

  beforeAll(async () => {
    // Staff owner drives the event.
    owner = await createTestUser(`link-immut-owner-${ts}`);
    const { data: s, error: sErr } = await admin
      .from('staff')
      .insert({
        email: owner.email,
        role: 'organiser_admin',
        full_name: 'Link Immut Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    if (sErr || !s) throw new Error(`staff fixture: ${sErr?.message}`);
    ownerStaffId = s.id as string;

    linkedUser = await createTestUser(`link-immut-user-${ts}`);

    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        title: 'Link Immutability Fixture — DELETE ME',
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

    // Two registrations: one guest (user_id null), one linked (user_id set).
    const { data: g } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `guest-${ts}@rls-test.invalid`,
        full_name: 'Guest',
        registration_code: `WK-LI${String(ts).slice(-4)}`,
      })
      .select('id')
      .single();
    guestRegId = g!.id as string;

    const { data: l } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: linkedUser.email,
        full_name: 'Linked',
        registration_code: `WK-LK${String(ts).slice(-4)}`,
        user_id: linkedUser.id,
        profile_snapshot: { existing: 'snap' },
      })
      .select('id')
      .single();
    linkedRegId = l!.id as string;
  }, 60_000);

  afterAll(async () => {
    await admin.from('registrations').delete().eq('event_id', eventId);
    await admin.from('events').delete().eq('id', eventId);
    await admin.from('staff').delete().eq('email', owner.email);
    await admin.from('staff').delete().eq('email', STAFF_EMAIL);
    await deleteTestUser(owner);
    await deleteTestUser(linkedUser);
  });

  // ---------------------------------------------------------------------------
  // INSERT-side guard: registrations_guest_insert_no_user_id_trg
  // ---------------------------------------------------------------------------

  it('anon INSERT with user_id set is blocked (42501)', async () => {
    const anon = createAnonClient();
    const { error } = await anon
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `anon-forge-${ts}@rls-test.invalid`,
        full_name: 'Anon Forge',
        registration_code: `WK-AF${String(ts).slice(-4)}`,
        user_id: linkedUser.id,
      });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('authenticated organiser INSERT with user_id set is blocked (42501)', async () => {
    // owner is a staff user with organiser_update_own RLS on this event's
    // registrations, so RLS itself would allow the insert. The trigger is
    // what blocks user_id-carrying inserts from authenticated.
    const { error } = await owner.client
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `staff-forge-${ts}@rls-test.invalid`,
        full_name: 'Staff Forge',
        registration_code: `WK-SF${String(ts).slice(-4)}`,
        user_id: linkedUser.id,
      });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('service_role INSERT with user_id set succeeds (Server Action path)', async () => {
    // The Server Action for register-while-logged-in runs as service_role,
    // which passes the trigger (current_user='service_role').
    const { data, error } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `svc-${ts}@rls-test.invalid`,
        full_name: 'Service Role Insert',
        registration_code: `WK-SR${String(ts).slice(-4)}`,
        user_id: linkedUser.id,
        profile_snapshot: { built: 'by service_role' },
      })
      .select('id, user_id')
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(linkedUser.id);
    // Cleanup so afterAll's blanket delete doesn't leave residue.
    await admin.from('registrations').delete().eq('id', data!.id);
  });

  // ---------------------------------------------------------------------------
  // UPDATE-side guard: registrations_link_columns_immutable_from_client_trg
  // ---------------------------------------------------------------------------

  it('authenticated organiser UPDATE that changes profile_snapshot is blocked (42501)', async () => {
    const { error } = await owner.client
      .from('registrations')
      .update({ profile_snapshot: { forged: 'by organiser' } })
      .eq('id', linkedRegId);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('authenticated organiser UPDATE that changes user_id is blocked (42501)', async () => {
    const { error } = await owner.client
      .from('registrations')
      .update({ user_id: owner.id })
      .eq('id', linkedRegId);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('authenticated organiser UPDATE that changes source is blocked (42501)', async () => {
    const { error } = await owner.client
      .from('registrations')
      .update({ source: 'staff_walk_in' })
      .eq('id', linkedRegId);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('authenticated organiser UPDATE that changes an unrelated column succeeds', async () => {
    // Sanity: the trigger only blocks user_id / profile_snapshot / source.
    // status='attended' is a legitimate organiser update path.
    const { error } = await owner.client
      .from('registrations')
      .update({ status: 'attended' })
      .eq('id', linkedRegId);
    expect(error).toBeNull();
    // Restore for later tests.
    await admin.from('registrations').update({ status: 'registered' }).eq('id', linkedRegId);
  });

  it('service_role UPDATE that changes profile_snapshot succeeds (Server Action / definer path)', async () => {
    const { error } = await admin
      .from('registrations')
      .update({ profile_snapshot: { updated: 'by service_role' } })
      .eq('id', linkedRegId);
    expect(error).toBeNull();
    const { data } = await admin
      .from('registrations')
      .select('profile_snapshot')
      .eq('id', linkedRegId)
      .single();
    expect((data?.profile_snapshot as Record<string, unknown>)?.updated).toBe('by service_role');
  });

  it('definer function bypasses the trigger (current_user = postgres inside body)', async () => {
    // Simulates what claim_registrations_for_user does internally — a
    // SECURITY DEFINER function updates user_id + profile_snapshot on a
    // guest registration. Run as postgres via sqlSuperuser to prove the
    // trigger's current_user check is what makes this legitimate write
    // possible.
    await sqlSuperuser(`
      update public.registrations
        set user_id = '${linkedUser.id}',
            profile_snapshot = '{"claimed":"by definer"}'::jsonb
        where id = '${guestRegId}';
    `);
    const { data } = await admin
      .from('registrations')
      .select('user_id, profile_snapshot')
      .eq('id', guestRegId)
      .single();
    expect(data?.user_id).toBe(linkedUser.id);
    expect((data?.profile_snapshot as Record<string, unknown>)?.claimed).toBe('by definer');
  });
}, 90_000);
