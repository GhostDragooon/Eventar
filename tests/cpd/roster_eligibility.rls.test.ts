// Stage 7 — event_registration_eligibility: the read-time prediction of
// whether a registrant's attendance will post a CPD credit.
//
// The load-bearing test is the LAST one: it drives a real check-in and a real
// award, and asserts the prediction matched the outcome. A prediction that can
// drift from the decision it predicts is worse than no prediction, and the two
// live in different functions with independently editable copies of the same
// identity chain — nothing but this test holds them together.
//
// Also asserts the function leaks NO PII (Hard Rule 10): an organiser learns
// "this attendance won't earn a credit", never which body anyone is licensed
// with.
//
// Gated: named explicitly in `pnpm test:rls` alongside the DEFERRED-56 suite.
// Issues at most one credit, on its own disposable fixtures.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('event_registration_eligibility', () => {
  let owner: TestUser;
  let ownerStaffId: string;
  let bodyAdmin: TestUser;
  let stranger: TestUser;
  let bodyId: string;
  let eventId: string;
  let licensed: TestUser;
  let unlicensed: TestUser;
  const codes = { licensed: '', unlicensed: '', noAccount: '', cancelled: '' };
  const ts = Date.now();

  async function eligibilityFor(client: TestUser['client'], id = eventId) {
    const { data, error } = await client.rpc('event_registration_eligibility', { p_event_id: id });
    return { rows: (data ?? []) as { registration_id: string; eligibility: string }[], error };
  }

  async function register(code: string, email: string, status = 'registered') {
    const { data, error } = await admin
      .from('registrations')
      .insert({ event_id: eventId, email, full_name: 'Eligibility Fixture', status, registration_code: code })
      .select('id')
      .single();
    if (error) throw new Error(`registration fixture: ${error.message}`);
    return data.id as string;
  }

  const ids: Record<string, string> = {};

  beforeAll(async () => {
    owner = await createTestUser(`elig-owner-${ts}`);
    bodyAdmin = await createTestUser(`elig-bodyadmin-${ts}`);
    stranger = await createTestUser(`elig-stranger-${ts}`);
    licensed = await createTestUser(`elig-licensed-${ts}`);
    unlicensed = await createTestUser(`elig-unlicensed-${ts}`);

    for (const [u, role] of [
      [owner, 'organiser_admin'],
      [bodyAdmin, 'body_admin'],
      [stranger, 'organiser_admin'],
    ] as const) {
      const { error } = await admin.from('staff').insert({
        email: u.email, role, full_name: 'Eligibility Fixture Staff',
        organisation_id: DEFAULT_ORG, status: 'active',
      });
      if (error) throw new Error(`staff fixture: ${error.message}`);
    }
    const { data: s } = await admin.from('staff').select('id').eq('email', owner.email).single();
    ownerStaffId = s!.id as string;

    const { data: body, error: bodyErr } = await admin.from('accrediting_bodies').insert({
      organisation_id: DEFAULT_ORG, short_name: `ELIG-${ts}`, full_name: 'Eligibility Test Body',
      status: 'active', cycle_config: {}, category_taxonomy: {},
    }).select('id').single();
    if (bodyErr) throw new Error(`body fixture: ${bodyErr.message}`);
    bodyId = body!.id as string;

    await admin.from('organisation_body_authorisations')
      .insert({ organisation_id: DEFAULT_ORG, body_id: bodyId, status: 'active' });

    // Started 10 min ago, ends in 50 — inside its own check-in window, so the
    // real check-in at the end of this file is legitimate.
    const { data: ev, error: evErr } = await admin.from('events').insert({
      title: `Eligibility Fixture ${ts}`,
      start_time: new Date(Date.now() - 10 * 60_000).toISOString(),
      end_time: new Date(Date.now() + 50 * 60_000).toISOString(),
      timezone: 'Asia/Hong_Kong', created_by: ownerStaffId,
      venue_name: 'Test Venue', city: 'Hong Kong', country: 'HK',
      latitude: 22.3, longitude: 114.2, status: 'published',
      checkin_modes: { staff: true, self_serve: true },
      accrediting_body_id: bodyId, cpd_hours: 2,
    }).select('id').single();
    if (evErr) throw new Error(`event fixture: ${evErr.message}`);
    eventId = ev!.id as string;

    // A verified licence for exactly one of them, through the audited path —
    // service_role cannot write practitioner_licences (Hard Rule 11).
    const { error: decErr } = await licensed.client.rpc('declare_licence', {
      p_body_id: bodyId, p_licence_number: `ELIG-LIC-${ts}`, p_licence_type: 'full',
    });
    if (decErr) throw new Error(`declare_licence: ${decErr.message}`);
    const { data: lic } = await admin.from('practitioner_licences')
      .select('id').eq('user_id', licensed.id).single();
    const { error: verErr } = await bodyAdmin.client.rpc('verify_licence', { p_licence_id: lic!.id });
    if (verErr) throw new Error(`verify_licence: ${verErr.message}`);

    codes.licensed = `WK-EL${String(ts).slice(-4)}`;
    codes.unlicensed = `WK-EU${String(ts).slice(-4)}`;
    codes.noAccount = `WK-EN${String(ts).slice(-4)}`;
    codes.cancelled = `WK-EC${String(ts).slice(-4)}`;
    ids.licensed = await register(codes.licensed, licensed.email);
    ids.unlicensed = await register(codes.unlicensed, unlicensed.email);
    ids.noAccount = await register(codes.noAccount, `nobody-${ts}@nowhere.invalid`);
    // Its own address: registrations is unique on (event_id, email), so the
    // cancelled row cannot share the unlicensed practitioner's.
    ids.cancelled = await register(codes.cancelled, `cancelled-${ts}@nowhere.invalid`, 'cancelled');
  }, 120_000);

  afterAll(async () => {
    await admin.from('registrations').delete().eq('event_id', eventId);
    await admin.from('organisation_body_authorisations').delete().eq('body_id', bodyId);
    // The event and body are pinned by credit_ledger's NO ACTION FKs once the
    // final test issues a credit — same accepted residue as attendance_issuance.
    for (const u of [stranger, bodyAdmin, unlicensed]) {
      await admin.from('staff').delete().eq('email', u.email);
      await deleteTestUser(u);
    }
  }, 120_000);

  it('classifies every registrant by whether their credit will post', async () => {
    const { rows, error } = await eligibilityFor(owner.client);
    expect(error).toBeNull();
    const by = Object.fromEntries(rows.map((r) => [r.registration_id, r.eligibility]));
    expect(by[ids.licensed]).toBe('eligible');
    expect(by[ids.unlicensed]).toBe('no_licence');
    expect(by[ids.noAccount]).toBe('no_account');
    expect(by[ids.cancelled]).toBe('cancelled');
  });

  it('returns registration_id and an enum, and nothing else (no PII)', async () => {
    const { rows } = await eligibilityFor(owner.client);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['eligibility', 'registration_id']);
    }
  });

  it('refuses a non-owner (42501) — a definer bypasses RLS, so the gate is in the body', async () => {
    const { error } = await eligibilityFor(stranger.client);
    expect(error?.code).toBe('42501');
  });

  it('the prediction matches what award_attendance_credit actually does', async () => {
    // The whole point. Two functions carry independently editable copies of the
    // same identity chain; only this holds them together.
    const before = await eligibilityFor(owner.client);
    const predicted = Object.fromEntries(
      before.rows.map((r) => [r.registration_id, r.eligibility]),
    );

    const { data: okRes } = await admin.rpc('self_check_in', {
      p_code: codes.licensed, p_ip: '203.0.113.77',
    });
    expect((Array.isArray(okRes) ? okRes[0] : okRes).result).toBe('ok');
    const { data: award } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.licensed,
    });
    expect(predicted[ids.licensed]).toBe('eligible');
    expect(String(award)).toBe('issued');

    // And the negative direction: predicted no_licence really does skip, with
    // the matching reason.
    await admin.rpc('self_check_in', { p_code: codes.unlicensed, p_ip: '203.0.113.78' });
    const { data: skip } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.unlicensed,
    });
    expect(predicted[ids.unlicensed]).toBe('no_licence');
    expect(String(skip)).toBe('skipped:no_licence');
  }, 120_000);
});
