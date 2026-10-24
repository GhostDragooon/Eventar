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
import { randomUUID } from 'node:crypto';
import { admin, createTestUser, deleteTestUser, sqlSuperuser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('event_registration_eligibility', () => {
  let owner: TestUser;
  let ownerStaffId: string;
  let bodyAdmin: TestUser;
  let teammate: TestUser; // same organisation, did not create the event (DB-03)
  let otherOrgAdmin: TestUser; // a DIFFERENT organisation's admin
  let otherOrgMember: TestUser; // ... and its member, so the gate is not proven for one role only
  let platformStaff: TestUser; // eventar_staff rows live in some organisation; the gate must not care which
  let otherOrgId: string;
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
    teammate = await createTestUser(`elig-teammate-${ts}`);
    otherOrgAdmin = await createTestUser(`elig-otherorg-${ts}`);
    otherOrgMember = await createTestUser(`elig-otherorgmember-${ts}`);
    platformStaff = await createTestUser(`elig-platform-${ts}`);
    const { data: org2, error: org2Err } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org (eligibility other)', slug: `rls-elig-other-${ts}` })
      .select('id')
      .single();
    if (org2Err || !org2) throw new Error(`other org fixture: ${org2Err?.message}`);
    otherOrgId = org2.id as string;
    licensed = await createTestUser(`elig-licensed-${ts}`);
    unlicensed = await createTestUser(`elig-unlicensed-${ts}`);

    for (const [u, role] of [
      [owner, 'organiser_admin'],
      [bodyAdmin, 'body_admin'],
      [teammate, 'organiser_member'],
      [otherOrgAdmin, 'organiser_admin'],
      [otherOrgMember, 'organiser_member'],
      [platformStaff, 'eventar_staff'],
    ] as const) {
      const { error } = await admin.from('staff').insert({
        email: u.email, role, full_name: 'Eligibility Fixture Staff',
        organisation_id: [otherOrgAdmin, otherOrgMember, platformStaff].includes(u) ? otherOrgId : DEFAULT_ORG, status: 'active',
      });
      if (error) throw new Error(`staff fixture: ${error.message}`);
    }
    const { data: s } = await admin.from('staff').select('id').eq('email', owner.email).single();
    ownerStaffId = s!.id as string;

    // SENTINEL, not a per-run body. This used to be `ELIG-${ts}`, which minted a
    // new row every run — and because credit_ledger.body_id is a NO ACTION FK,
    // any body that ever earns a credit is undeletable forever. Seoul accumulated
    // 19 fixture bodies that way, 8 of them status='active' and therefore visible
    // in the production organiser picker. Status has to stay 'active' (the CPD
    // config gate requires it), so the fix is one row reused, not one per run.
    const { data: body, error: bodyErr } = await admin.from('accrediting_bodies').upsert({
      organisation_id: DEFAULT_ORG, short_name: 'ELIG-FIXTURE', full_name: 'Eligibility Test Body',
      status: 'active', cycle_config: {}, category_taxonomy: {},
    }, { onConflict: 'organisation_id,short_name' }).select('id').single();
    if (bodyErr) throw new Error(`body fixture: ${bodyErr.message}`);
    bodyId = body!.id as string;

    await admin.from('organisation_body_authorisations')
      .upsert({ organisation_id: DEFAULT_ORG, body_id: bodyId, status: 'active' },
              { onConflict: 'organisation_id,body_id' });

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

    // Task 10.8/10.9 C4: award_attendance_credit() now iterates
    // event_accreditation_groups, not events.accrediting_body_id/cpd_hours
    // above (kept for event_registration_eligibility, which still reads the
    // legacy columns directly — see the drift note on the last test below).
    // Mirrors set_event_cpd_config's compatibility bridge: one group, one
    // accreditation row, linked to the event's auto-created occurrence.
    // event_accreditation_groups is definer-only (Hard Rule 11) — sqlSuperuser
    // is the only way a test can write it directly.
    await sqlSuperuser(`
      with grp as (
        insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
        values ('${eventId}', '${bodyId}', null, null, 'proportional')
        returning id
      ), acc as (
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select id, 2 from grp
        returning id
      )
      insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
      select acc.id, eo.id from acc, public.event_occurrences eo where eo.event_id = '${eventId}';
    `);

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
    for (const u of [teammate, otherOrgAdmin, otherOrgMember, platformStaff, bodyAdmin, unlicensed]) {
      if (!u) continue; // beforeAll failed before this user was created
      await admin.from('staff').delete().eq('email', u.email);
      await deleteTestUser(u);
    }
    if (otherOrgId) await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'other organisation fixture');
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

  // DB-03 (2026-10-24): the roster told a teammate "CPD eligibility couldn't be checked just now" because this
  // function gated on created_by. It is a READ of the event's own roster, so any active staff member of the
  // event's ORGANISATION may call it (the writes that touch accreditation stay creator-only, ruling 2).
  it('a teammate (same organisation, did not create the event) gets the same answer as the creator', async () => {
    const asOwner = await eligibilityFor(owner.client);
    const asTeammate = await eligibilityFor(teammate.client);
    expect(asTeammate.error).toBeNull();
    expect(asTeammate.rows.length).toBeGreaterThan(0);
    expect(Object.fromEntries(asTeammate.rows.map((r) => [r.registration_id, r.eligibility])))
      .toEqual(Object.fromEntries(asOwner.rows.map((r) => [r.registration_id, r.eligibility])));
  });

  it("refuses another organisation's admin and member (42501) — a definer bypasses RLS, so the gate is in the body", async () => {
    for (const caller of [otherOrgAdmin, otherOrgMember]) {
      const { error } = await eligibilityFor(caller.client);
      expect(error?.code).toBe('42501');
      expect(error?.message ?? '').toMatch(/not in your organisation/i);
    }
  });

  it('platform staff (eventar_staff) may read any organisation\'s roster, whatever organisation their own row sits in', async () => {
    const asOwner = await eligibilityFor(owner.client);
    const asPlatform = await eligibilityFor(platformStaff.client);
    expect(asPlatform.error).toBeNull();
    expect(asPlatform.rows).toHaveLength(asOwner.rows.length);
    expect(asPlatform.rows.length).toBeGreaterThan(0);
  });

  it('an unknown event id is not found (P0002), not a permission error', async () => {
    const { error } = await eligibilityFor(teammate.client, randomUUID());
    expect(error?.code).toBe('P0002');
  });

  it('the prediction matches what award_attendance_credit actually does', async () => {
    // The whole point. Two functions carry independently editable copies of the
    // same identity chain; only this holds them together.
    //
    // KNOWN DRIFT (Task 10.8/10.9 C4, not fixed here — out of this task's scope,
    // see the migration report): event_registration_eligibility still reads
    // events.accrediting_body_id/cpd_hours directly and has no concept of
    // event_accreditation_groups at all. This test only still passes because
    // the fixture event above carries BOTH the legacy scalar columns AND a
    // matching single compat-bridge group with the same body/value — the two
    // functions agree here only because this fixture keeps them in sync by
    // hand. A real multi-body event (several groups, or a group whose body
    // differs from the legacy columns) would make this function's prediction
    // wrong without anything here catching it. Flagged, not fixed.
    const before = await eligibilityFor(owner.client);
    const predicted = Object.fromEntries(
      before.rows.map((r) => [r.registration_id, r.eligibility]),
    );

    const { data: okRes } = await admin.rpc('self_check_in', {
      p_code: codes.licensed, p_ip: '203.0.113.77',
    });
    expect((Array.isArray(okRes) ? okRes[0] : okRes).result).toBe('ok');
    // p_enforce_full_setup: false — this test asserts the engine/prediction
    // agreement, not the F1-F5 gate (Stage B4, 20260829120000). The gate is
    // covered by its own tests in Stage D. Without the opt-out the guest
    // fixture (user_id null on the registration) would return
    // 'skipped:registration_unlinked' before the engine ever ran, and the
    // prediction ↔ actual invariant this test exists to hold would be moot.
    const { data: award } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.licensed,
      p_enforce_full_setup: false,
    });
    expect(predicted[ids.licensed]).toBe('eligible');
    expect(award).toEqual([{ body_id: bodyId, outcome: 'issued' }]);

    // And the negative direction: predicted no_licence really does skip, with
    // the matching reason.
    await admin.rpc('self_check_in', { p_code: codes.unlicensed, p_ip: '203.0.113.78' });
    const { data: skip } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId, p_registration_code: codes.unlicensed,
      p_enforce_full_setup: false,
    });
    expect(predicted[ids.unlicensed]).toBe('no_licence');
    expect(skip).toEqual([{ body_id: bodyId, outcome: 'skipped:no_licence' }]);
  }, 120_000);
});
