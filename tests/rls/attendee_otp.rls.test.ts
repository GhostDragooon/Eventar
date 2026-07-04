// CPD Sprint 2 / §3 — attendee native email-OTP capability + post-signup
// audited consent. Exercises real Supabase Auth infra (admin generateLink
// -> verifyOtp) against the live dev project, plus the §1 grant_consent
// definer function. Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

describe.skipIf(!process.env.RLS_TESTS)('attendee OTP + consent RLS', () => {
  it('attendee OTP capability: generateLink -> verifyOtp mints a session + populates public.users', async () => {
    const email = `otp-attendee-${Date.now()}@rls-test.invalid`;
    // A4: admin generateLink returns the token in-band — no dev-sender hit, no real email sent.
    const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: 'signup', email, password: 'rls-test-otp-Password-1234!' });
    expect(glErr).toBeNull();
    const otp = gl!.properties!.email_otp;
    expect(typeof otp).toBe('string');

    const client = createAnonClient();
    const { data: v, error: vErr } = await client.auth.verifyOtp({ email, token: otp, type: 'email' });
    expect(vErr).toBeNull();
    expect(v.session).toBeTruthy();

    // handle_new_user mirror populated public.users
    const uid = v.user!.id;
    const { data: mirror } = await admin.from('users').select('id').eq('id', uid);
    expect(mirror?.length).toBe(1);

    // consent-grant exercises the §1 definer pattern against a real session
    const { error: cErr } = await client.rpc('grant_consent', {
      p_consent_type: 'terms_of_service', p_version: 'tos-0.1-draft',
    });
    expect(cErr).toBeNull();

    await admin.auth.admin.deleteUser(uid); // cascades public.users + consent_records
  }, 30_000);

  it('consent audit event was actually written for the granting user', async () => {
    const email = `otp-audit-${Date.now()}@rls-test.invalid`;
    const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: 'signup', email, password: 'rls-test-otp-Password-1234!' });
    expect(glErr).toBeNull();
    const otp = gl!.properties!.email_otp;

    const client = createAnonClient();
    const { data: v, error: vErr } = await client.auth.verifyOtp({ email, token: otp, type: 'email' });
    expect(vErr).toBeNull();
    const uid = v.user!.id;

    const { data: consentId, error: cErr } = await client.rpc('grant_consent', {
      p_consent_type: 'terms_of_service', p_version: 'tos-0.1-draft',
    });
    expect(cErr).toBeNull();
    expect(typeof consentId).toBe('string');

    // Proves the whole signup -> OTP -> consent chain is genuinely audited
    // end-to-end, not just that the RPC returned no error.
    const { data: auditRows, error: auditErr } = await admin
      .from('audit_events')
      .select('event_type, subject_id')
      .eq('event_type', 'consent_granted')
      .eq('subject_id', consentId);
    expect(auditErr).toBeNull();
    expect(auditRows?.length).toBe(1);

    await admin.auth.admin.deleteUser(uid); // cascades public.users + consent_records + no audit cascade (audit is immutable)
  }, 30_000);

  it('a second, unrelated user cannot read the first user’s consent record (RLS-silent-fail)', async () => {
    const email = `otp-rls-${Date.now()}@rls-test.invalid`;
    const { data: gl, error: glErr } = await admin.auth.admin.generateLink({ type: 'signup', email, password: 'rls-test-otp-Password-1234!' });
    expect(glErr).toBeNull();
    const otp = gl!.properties!.email_otp;

    const client = createAnonClient();
    const { data: v, error: vErr } = await client.auth.verifyOtp({ email, token: otp, type: 'email' });
    expect(vErr).toBeNull();
    const uid = v.user!.id;

    const { data: consentId, error: cErr } = await client.rpc('grant_consent', {
      p_consent_type: 'terms_of_service', p_version: 'tos-0.1-draft',
    });
    expect(cErr).toBeNull();
    expect(typeof consentId).toBe('string');

    let stranger: TestUser | undefined;
    try {
      stranger = await createTestUser(`otp-stranger-${Date.now()}`);
      const { data: strangerSees, error: readErr } = await stranger.client
        .from('consent_records')
        .select('id')
        .eq('id', consentId);
      expect(readErr).toBeNull();
      expect(strangerSees).toHaveLength(0);
    } finally {
      if (stranger) await deleteTestUser(stranger);
      await admin.auth.admin.deleteUser(uid);
    }
  }, 30_000);
});
