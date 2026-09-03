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
import { getMyAccountAndProfile } from './actions';
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

  const result = await getMyAccountAndProfile();
  if (!result.ok) {
    // not_authorized / not_found / db_error — bounce back to sign-in with a
    // hint. `db_error` is a genuinely-transient path; the user can retry.
    const errorParam =
      result.error === 'not_authorized' ? 'not_authorized' : 'unavailable';
    redirect(`/account/sign-in?error=${errorParam}`);
  }

  return (
    <SiteShell active="account">
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <AccountClient
          initialAccount={result.data.account}
          initialProfile={result.data.profile}
        />
      </div>
    </SiteShell>
  );
}
