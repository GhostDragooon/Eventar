// Stage D / D1 — claim_registrations_for_user() invariants.
//
// Plan §8.6 bullet 2 (only owner email can link; cannot steal another
// email's rows) + §5.4 (claim happy path + snapshot-once-if-null +
// registration_claimed audit).
//
// Whitelisted in test:rls despite living under tests/cpd because it emits
// audit_events rows (append-only per HR11) — same accepted residue posture
// as tests/cpd/roster_eligibility.rls.test.ts. No credit_ledger writes.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin, createAnonClient, createTestUser, deleteTestUser, sqlSuperuser, type TestUser,
} from '../helpers/clients';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const ts = Date.now();

describe.skipIf(!process.env.RLS_TESTS)('claim_registrations_for_user', () => {
  let staffId: string;
  let owner: TestUser;
  let userAlpha: TestUser;
  let userBeta: TestUser;
  let unverifiedUser: TestUser;
  // Two events because (event_id, email) is unique — the pre-linked and
  // no-overwrite paths need alpha to have separate registrations on
  // separate events.
  let eventClaimId: string;
  let eventPrelinkedId: string;
  let eventNoOverwriteId: string;
  const codes = {
    alpha:      `WK-CA${String(ts).slice(-4)}`,
    beta:       `WK-CC${String(ts).slice(-4)}`,
    unverified: `WK-CD${String(ts).slice(-4)}`,
    prelinked:  `WK-CE${String(ts).slice(-4)}`,
    postProfile: `WK-CF${String(ts).slice(-4)}`,
  };

  beforeAll(async () => {
    owner = await createTestUser(`claim-owner-${ts}`);
    userAlpha = await createTestUser(`claim-alpha-${ts}`);
    userBeta = await createTestUser(`claim-beta-${ts}`);
    unverifiedUser = await createTestUser(`claim-unverified-${ts}`);

    // Strip email_confirmed_at from unverifiedUser so the definer's own F1
    // gate raises. createTestUser sets it true; the reset must be
    // superuser-level because auth.users is not editable through PostgREST.
    await sqlSuperuser(
      `update auth.users set email_confirmed_at = null where id = '${unverifiedUser.id}';`,
    );

    const { data: s } = await admin
      .from('staff')
      .insert({
        email: owner.email,
        role: 'organiser_admin',
        full_name: 'Claim Owner',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    staffId = s!.id as string;

    async function makeEvent(title: string): Promise<string> {
      const { data } = await admin
        .from('events')
        .insert({
          title,
          start_time: new Date(Date.now() + 3_600_000).toISOString(),
          end_time: new Date(Date.now() + 7_200_000).toISOString(),
          timezone: 'Asia/Hong_Kong',
          created_by: staffId,
          venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
          status: 'published',
          organisation_id: DEFAULT_ORG,
        })
        .select('id')
        .single();
      return data!.id as string;
    }

    eventClaimId       = await makeEvent(`Claim Fixture ${ts} — DELETE ME`);
    eventPrelinkedId   = await makeEvent(`Claim Prelinked Fixture ${ts} — DELETE ME`);
    eventNoOverwriteId = await makeEvent(`Claim NoOverwrite Fixture ${ts} — DELETE ME`);

    // Event 1: one unlinked reg per user (alpha, beta, unverified).
    // Alpha's email is stored uppercased on insert to prove the trigger's
    // lowercase normalisation + the definer's lower(trim()) match agree.
    await admin.from('registrations').insert([
      { event_id: eventClaimId, email: userAlpha.email.toUpperCase(),
        full_name: 'A', registration_code: codes.alpha },
      { event_id: eventClaimId, email: userBeta.email,
        full_name: 'B', registration_code: codes.beta },
      { event_id: eventClaimId, email: unverifiedUser.email,
        full_name: 'U', registration_code: codes.unverified },
    ]);

    // Event 2: alpha already linked with an existing snapshot. Claim must
    // never overwrite this snapshot even after alpha gets a real profile.
    await admin.from('registrations').insert({
      event_id: eventPrelinkedId,
      email: userAlpha.email,
      full_name: 'pre-linked',
      registration_code: codes.prelinked,
      user_id: userAlpha.id,
      profile_snapshot: { pre: 'existing' },
    });

    // Event 3's alpha row is inserted INSIDE the "never overwrites" test,
    // after alpha has a profile. Inserting it here would let the happy-
    // path claim pick it up too and make the row count assertion wrong.
  }, 90_000);

  afterAll(async () => {
    for (const evId of [eventClaimId, eventPrelinkedId, eventNoOverwriteId]) {
      await admin.from('registrations').delete().eq('event_id', evId);
      await admin.from('events').delete().eq('id', evId);
    }
    await admin.from('staff').delete().eq('email', owner.email);
    await deleteTestUser(owner);
    await deleteTestUser(userAlpha);
    await deleteTestUser(userBeta);
    await deleteTestUser(unverifiedUser);
    // audit_events append-only — registration_claimed rows retained.
  });

  it('no session: raises 42501 insufficient_privilege', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('claim_registrations_for_user');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('unverified email: raises 42501 email_unverified', async () => {
    const { error } = await unverifiedUser.client.rpc('claim_registrations_for_user');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toContain('email_unverified');
  });

  it('happy path: alpha claims their 1 unlinked row (case-insensitive email match works via the insert trigger)', async () => {
    // The registration was inserted with alpha's email uppercased; the
    // registrations_lowercase_email trigger normalises on write, and the
    // definer's own lower(trim()) matches lowercase. This test proves the
    // two normalisations agree.
    const { data, error } = await userAlpha.client.rpc('claim_registrations_for_user');
    expect(error).toBeNull();
    expect(data).toBe(1);

    // Alpha's row on event 1 now linked; snapshot null (no profile yet).
    const { data: row } = await admin
      .from('registrations')
      .select('user_id, profile_snapshot')
      .eq('registration_code', codes.alpha)
      .single();
    expect(row?.user_id).toBe(userAlpha.id);
    expect(row?.profile_snapshot).toBeNull();

    // Audit row emitted for the claimed registration.
    const { data: audit } = await admin
      .from('audit_events')
      .select('subject_id')
      .eq('event_type', 'registration_claimed')
      .eq('actor_user_id', userAlpha.id);
    expect((audit ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('idempotent: second call returns 0 (nothing else to claim yet)', async () => {
    const { data, error } = await userAlpha.client.rpc('claim_registrations_for_user');
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it('beta cannot claim alpha rows: only own email matches', async () => {
    const { data, error } = await userBeta.client.rpc('claim_registrations_for_user');
    expect(error).toBeNull();
    expect(data).toBe(1);
    const { data: row } = await admin
      .from('registrations')
      .select('user_id')
      .eq('registration_code', codes.alpha)
      .single();
    // Alpha's row must still be owned by alpha, not beta.
    expect(row?.user_id).toBe(userAlpha.id);
  });

  it('never overwrites a non-null profile_snapshot on re-claim after profile arrives', async () => {
    // Give alpha a professional profile so build_profile_snapshot would
    // now return non-null. The pre-linked row (event 2) already carries
    // a snapshot; claim must NOT touch it. Then insert a fresh unlinked
    // reg for alpha on event 3 and re-run claim — event 3's row gets the
    // fresh snapshot, event 2's row keeps its pre-existing one.
    await userAlpha.client.from('professional_profiles').insert({
      user_id: userAlpha.id,
      workplace_text: 'Post-claim workplace',
      position_code: 'doctor',
      profession_code: 'medicine',
    });

    await admin.from('registrations').insert({
      event_id: eventNoOverwriteId,
      email: userAlpha.email,
      full_name: 'post-profile',
      registration_code: codes.postProfile,
    });

    const { data, error } = await userAlpha.client.rpc('claim_registrations_for_user');
    expect(error).toBeNull();
    expect(data).toBe(1); // just the event-3 post-profile row

    const { data: pre } = await admin
      .from('registrations')
      .select('profile_snapshot')
      .eq('registration_code', codes.prelinked)
      .single();
    expect((pre?.profile_snapshot as Record<string, unknown>)?.pre).toBe('existing');

    const { data: post } = await admin
      .from('registrations')
      .select('profile_snapshot, user_id')
      .eq('registration_code', codes.postProfile)
      .single();
    expect(post?.user_id).toBe(userAlpha.id);
    expect(post?.profile_snapshot).not.toBeNull();
    expect((post?.profile_snapshot as Record<string, unknown>)?.workplace_text).toBe('Post-claim workplace');
  });
}, 120_000);
