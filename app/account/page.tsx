// Attendee-facing account landing. Redirects to /account/sign-in when the
// caller has no session (matches lib/auth.ts's fail-closed posture without
// dragging in requireStaff, which is for staff routes). Once signed in,
// hands off to AccountClient with the loaded users row.
//
// Plan Q1 (Stage C decision): /account is publicly routable (NOT gated by
// proxy.ts, which is staff-only); we check auth in this Server Component
// and redirect to /account/sign-in ourselves.

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { getMyAccountAndProfile, getUnlinkedRegistrationCount, listMyLicences } from './actions';
import { AccountClient } from './AccountClient';
import { SiteShell } from '@/components/shell/SiteShell';

export const metadata = {
  title: 'Account',
};

export default async function AccountPage() {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) {
    redirect('/account/sign-in');
  }

  const [result, unlinkedResult, licencesResult] = await Promise.all([
    getMyAccountAndProfile(),
    getUnlinkedRegistrationCount(),
    // WP3 R1 — needed to compute the readiness strip's licence signal.
    // Degrades silently (empty list) on failure; the strip just reads "not
    // yet" rather than blocking the page.
    listMyLicences(),
  ]);
  if (!result.ok) {
    // not_authorized / not_found / db_error — bounce back to sign-in with a
    // hint. `db_error` is a genuinely-transient path; the user can retry.
    const errorParam =
      result.error === 'not_authorized' ? 'not_authorized' : 'unavailable';
    redirect(`/account/sign-in?error=${errorParam}`);
  }
  // The banner is decorative — a failed count silently hides it rather than
  // blocking the account page. The count read is service-role-scoped, so the
  // failure modes here are transient (network / DB), not auth.
  const initialUnlinkedCount = unlinkedResult.ok ? unlinkedResult.data.count : 0;

  // WP3 R1 — readiness signal for the compact strip. "profile & membership
  // number" is one bundled step per Ivan's copy: workplace + position +
  // profession filled (F3) AND at least one non-terminal licence (F4).
  // Not a lying-green banner — just three done/not-yet lines with links.
  //
  // 2026-09-05 user-lens fix: `position_code === 'other'` alone is NOT F3-done —
  // the free-text `position_other` also has to be non-empty, or the CPD RPC
  // still fails F3 while the strip shows "complete". Same shape as the RPC's
  // own gate.
  //
  // 2026-09-05 dev-lens fix: distinguish "not yet" from "we couldn't check" so
  // a transient licence-fetch failure does not tell an F4-ready user their
  // profile is incomplete. Pass `null` when licences.ok === false; AccountClient
  // renders an "unknown — refresh" state on that row instead of "not yet".
  const p = result.data.profile;
  const positionFilled =
    (p?.position_code ?? '').trim() !== '' && (p?.position_code ?? '') !== 'other'
      ? true
      : (p?.position_other ?? '').trim() !== '';
  const profileReady =
    p != null &&
    (p.workplace_text ?? '').trim() !== '' &&
    positionFilled &&
    (p.profession_code ?? '').trim() !== '';
  const profileAndMembershipReady: boolean | null = licencesResult.ok
    ? profileReady && licencesResult.data.licences.some(
        (l) => l.status === 'declared' || l.status === 'verified',
      )
    : null;

  return (
    <SiteShell active="account" signedIn>
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <AccountClient
          initialAccount={result.data.account}
          initialProfile={result.data.profile}
          initialUnlinkedCount={initialUnlinkedCount}
          email={authRes.user.email ?? ''}
          emailConfirmed={authRes.user.email_confirmed_at != null}
          profileAndMembershipReady={profileAndMembershipReady}
        />
      </div>
    </SiteShell>
  );
}
