// Stage D / D1-D3 — award_attendance_credit F1-F5 gate + end-to-end
// backtests (guest → claim → complete → award; walk-in → hold → reconcile
// → release once).
//
// Plan §8.6 bullet 4 (award skips when F1-F5 fail; awards when pass) +
// §9 D2/D3 live backtests. Whitelisted in test:rls despite living under
// tests/cpd because it emits audit_events and credit_ledger rows
// (append-only per HR11) — same accepted residue posture as roster_
// eligibility and attendance_issuance.
//
// Fixture shape mirrors tests/cpd/roster_eligibility.rls.test.ts: real
// staff owner, real body via seed data, real event with a single
// accreditation group and one attendance-linked occurrence.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin, createTestUser, deleteTestUser, sqlSuperuser, type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const ts = Date.now();

type AwardRow = { body_id: string | null; outcome: string };

// Version literals pinned in 20260829120000 / lib/legalVersions.ts.
const PP_VERSION = 'pp-0.2-draft';
const TOS_VERSION = 'tos-0.1-draft';

describe.skipIf(!process.env.RLS_TESTS)('award_attendance_credit — F1-F5 gate', () => {
  let staffId: string;
  let owner: TestUser;
  let bodyAdmin: TestUser;
  let bodyId: string;
  let eventId: string;

  // Sink users for the F-fail matrix. Each is created + kept minimal; the
  // per-test flow satisfies or omits specific F stages.
  let sinkF5: TestUser;
  let sinkF1: TestUser;
  let sinkF2: TestUser;
  let sinkF3: TestUser;
  let sinkHappy: TestUser;

  const codes: Record<string, string> = {};

  async function grantF2Consents(userId: string): Promise<void> {
    await admin.from('consent_records').insert([
      { user_id: userId, consent_type: 'privacy_policy',   version: PP_VERSION },
      { user_id: userId, consent_type: 'terms_of_service', version: TOS_VERSION },
    ]);
  }

  async function grantF3Profile(userId: string, workplace = 'Test Hospital'): Promise<void> {
    // Insert directly via admin so RLS with_check does not gate the fixture.
    await admin.from('professional_profiles').insert({
      user_id: userId,
      workplace_text: workplace,
      position_code: 'doctor',
      profession_code: 'medicine',
    });
  }

  async function grantF4Licence(user: TestUser): Promise<void> {
    // Definer-only mutation path.
    await user.client.rpc('declare_licence', {
      p_body_id: bodyId,
      p_licence_number: `F1F5-${user.id.slice(0, 8)}`,
      p_licence_type: 'full',
    });
  }

  async function registerLinked(user: TestUser, code: string): Promise<string> {
    const { data } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: user.email,
        full_name: 'F1-F5 fixture',
        registration_code: code,
        user_id: user.id, // F5 satisfied
      })
      .select('id')
      .single();
    return data!.id as string;
  }

  async function registerGuest(email: string, code: string): Promise<string> {
    const { data } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email,
        full_name: 'guest',
        registration_code: code,
      })
      .select('id')
      .single();
    return data!.id as string;
  }

  async function checkIn(code: string): Promise<void> {
    const { error } = await admin.rpc('self_check_in', {
      p_code: code, p_ip: '127.0.0.1',
    });
    if (error) throw new Error(`self_check_in ${code}: ${error.message}`);
  }

  beforeAll(async () => {
    owner = await createTestUser(`f1f5-owner-${ts}`);
    bodyAdmin = await createTestUser(`f1f5-bodyadmin-${ts}`);
    sinkF5 = await createTestUser(`f1f5-sinkf5-${ts}`);
    sinkF1 = await createTestUser(`f1f5-sinkf1-${ts}`);
    sinkF2 = await createTestUser(`f1f5-sinkf2-${ts}`);
    sinkF3 = await createTestUser(`f1f5-sinkf3-${ts}`);
    sinkHappy = await createTestUser(`f1f5-happy-${ts}`);

    for (const [u, role] of [
      [owner, 'organiser_admin'],
      [bodyAdmin, 'body_admin'],
    ] as const) {
      await admin.from('staff').insert({
        email: u.email, role, full_name: 'F1-F5 fixture staff',
        organisation_id: DEFAULT_ORG, status: 'active',
      });
    }

    // Existing seeded body — reuses HKCP-or-similar so declare_licence has
    // a real target. Fall back to inserting one under the fixture org if the
    // seed set is somehow empty.
    const { data: bodies } = await admin
      .from('accrediting_bodies')
      .select('id')
      .eq('status', 'active')
      .limit(1);
    if ((bodies ?? []).length === 0) throw new Error('no active accrediting_body seeded');
    bodyId = bodies![0].id as string;

    // Body admin needs binding to the body.
    await admin.from('accrediting_body_admins').upsert(
      { user_id: bodyAdmin.id, body_id: bodyId },
      { onConflict: 'user_id,body_id' },
    ).select();
    // Organisation authorised for the body.
    await admin.from('organisation_body_authorisations').upsert(
      { organisation_id: DEFAULT_ORG, body_id: bodyId, status: 'active' },
      { onConflict: 'organisation_id,body_id' },
    );

    // Event inside its own check-in window.
    const { data: staffRow } = await admin
      .from('staff').select('id').eq('email', owner.email).single();
    staffId = staffRow!.id as string;

    const { data: ev } = await admin.from('events').insert({
      title: `F1-F5 Fixture ${ts}`,
      start_time: new Date(Date.now() - 10 * 60_000).toISOString(),
      end_time: new Date(Date.now() + 50 * 60_000).toISOString(),
      timezone: 'Asia/Hong_Kong',
      created_by: staffId,
      venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
      status: 'published',
      checkin_modes: { staff: true, self_serve: true },
      accrediting_body_id: bodyId, cpd_hours: 2,
      organisation_id: DEFAULT_ORG,
    }).select('id').single();
    eventId = ev!.id as string;

    // One accreditation group + accreditation row + occurrence link. Same
    // shape roster_eligibility uses.
    await sqlSuperuser(`
      with grp as (
        insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
        values ('${eventId}', '${bodyId}', null, 'points', 'proportional')
        returning id
      ), acc as (
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select id, 2 from grp
        returning id
      )
      insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
      select acc.id, eo.id from acc, public.event_occurrences eo where eo.event_id = '${eventId}';
    `);

    // Per-sink minimal setup (each intentionally missing exactly one F).
    codes.f5 = `WK-F5${String(ts).slice(-4)}`;
    codes.f1 = `WK-F1${String(ts).slice(-4)}`;
    codes.f2 = `WK-F2${String(ts).slice(-4)}`;
    codes.f3 = `WK-F3${String(ts).slice(-4)}`;
    codes.happy = `WK-HP${String(ts).slice(-4)}`;
    codes.walkin = `WK-WI${String(ts).slice(-4)}`;

    // sinkF5 — guest registration (no user_id) — fails F5.
    await registerGuest(sinkF5.email, codes.f5);
    // Otherwise fully set up so if the client passed enforce=false it would
    // pass everything else.
    await grantF2Consents(sinkF5.id);
    await grantF3Profile(sinkF5.id);
    await grantF4Licence(sinkF5);

    // sinkF1 — email confirmation flipped to null. Everything else satisfied.
    await sqlSuperuser(`update auth.users set email_confirmed_at = null where id = '${sinkF1.id}';`);
    await registerLinked(sinkF1, codes.f1);
    await grantF2Consents(sinkF1.id);
    await grantF3Profile(sinkF1.id);
    await grantF4Licence(sinkF1);

    // sinkF2 — no consents. Everything else satisfied.
    await registerLinked(sinkF2, codes.f2);
    await grantF3Profile(sinkF2.id);
    await grantF4Licence(sinkF2);

    // sinkF3 — no professional_profiles row. Everything else satisfied.
    await registerLinked(sinkF3, codes.f3);
    await grantF2Consents(sinkF3.id);
    await grantF4Licence(sinkF3);

    // sinkHappy — every F satisfied.
    await registerLinked(sinkHappy, codes.happy);
    await grantF2Consents(sinkHappy.id);
    await grantF3Profile(sinkHappy.id);
    await grantF4Licence(sinkHappy);

    // Check every sink in so the engine sees attendance.
    for (const c of [codes.f5, codes.f1, codes.f2, codes.f3, codes.happy]) {
      await checkIn(c);
    }
  }, 180_000);

  afterAll(async () => {
    // Full cleanup: registrations FIRST (before events / staff / users).
    await admin.from('registrations').delete().eq('event_id', eventId);
    // credit_ledger rows for this event pin the event via NO ACTION FK —
    // same accepted residue as roster_eligibility. Event stays.
    await admin.from('organisation_body_authorisations').delete().eq('body_id', bodyId);
    for (const u of [owner, bodyAdmin, sinkF5, sinkF1, sinkF2, sinkF3, sinkHappy]) {
      await admin.from('staff').delete().eq('email', u.email);
      await deleteTestUser(u);
    }
  });

  it('F5 fail: guest registration → skipped:registration_unlinked', async () => {
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.f5,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:registration_unlinked' }]);
  });

  it('F1 fail: email not confirmed → skipped:email_unverified', async () => {
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.f1,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:email_unverified' }]);
  });

  it('F2 fail: no consent rows → skipped:missing_consents', async () => {
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.f2,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:missing_consents' }]);
  });

  it('F3 fail: no professional_profiles row → skipped:profile_incomplete', async () => {
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.f3,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:profile_incomplete' }]);
  });

  it('happy path: all F1-F5 satisfied → issued (single body, single ledger row)', async () => {
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.happy,
    });
    expect(error).toBeNull();
    const rows = (data as AwardRow[]) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].outcome).toBe('issued');
    expect(rows[0].body_id).toBe(bodyId);
    // Ledger row exists.
    const { data: ledger } = await admin
      .from('credit_ledger')
      .select('id, entry_type')
      .eq('user_id', sinkHappy.id)
      .eq('event_id', eventId)
      .eq('body_id', bodyId);
    expect(ledger).toHaveLength(1);
    expect(ledger![0].entry_type).toBe('credit_earned');
  });

  it('D3 walk-in: check-in first with no user → award holds → complete setup → award releases once', async () => {
    // Fresh guest registration under a fresh email (this test WALKS the D3
    // flow, so the sink cannot re-use one of the F-matrix registrations).
    const walkInUser = await createTestUser(`f1f5-walkin-${ts}`);
    try {
      await registerGuest(walkInUser.email, codes.walkin);
      await checkIn(codes.walkin);

      // Award while still a guest → held.
      const held = await admin.rpc('award_attendance_credit', {
        p_event_id: eventId, p_registration_code: codes.walkin,
      });
      expect(held.data).toEqual([{ body_id: null, outcome: 'skipped:registration_unlinked' }]);

      // No ledger row yet.
      const { data: before } = await admin
        .from('credit_ledger')
        .select('id')
        .eq('user_id', walkInUser.id)
        .eq('event_id', eventId);
      expect(before ?? []).toHaveLength(0);

      // Claim + complete F1-F5 for walkInUser.
      await walkInUser.client.rpc('claim_registrations_for_user');
      await grantF2Consents(walkInUser.id);
      await grantF3Profile(walkInUser.id, 'Walk-in Hospital');
      await grantF4Licence(walkInUser);

      // Reconcile: re-run award — now releases.
      const released = await admin.rpc('award_attendance_credit', {
        p_event_id: eventId, p_registration_code: codes.walkin,
      });
      const rows = (released.data as AwardRow[]) ?? [];
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].outcome).toBe('issued');

      // Second reconcile — idempotent 'already', no duplicate row.
      const again = await admin.rpc('award_attendance_credit', {
        p_event_id: eventId, p_registration_code: codes.walkin,
      });
      const againRows = (again.data as AwardRow[]) ?? [];
      expect(againRows[0].outcome).toBe('already');

      const { data: after } = await admin
        .from('credit_ledger')
        .select('id, entry_type')
        .eq('user_id', walkInUser.id)
        .eq('event_id', eventId)
        .eq('entry_type', 'credit_earned');
      expect(after).toHaveLength(1);
    } finally {
      // walkInUser's staff row (if any) — none created for this test.
      // Registrations swept in afterAll.
      await deleteTestUser(walkInUser);
    }
  });
}, 240_000);
