// Claim past registrations page. Same server-side auth-check pattern as
// /account/page.tsx. Plan §7.4 chose explicit-button UX (Q3, Stage C
// decision) — not silent auto-link on first login.

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { ClaimClient } from './ClaimClient';
import { SiteShell } from '@/components/shell/SiteShell';

export const metadata = {
  title: 'Link past registrations',
};

export default async function ClaimPage() {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) {
    redirect('/account/sign-in');
  }

  const emailVerified = authRes.user.email_confirmed_at != null;

  return (
    <SiteShell active="account">
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <ClaimClient
          email={authRes.user.email ?? ''}
          emailVerified={emailVerified}
        />
      </div>
    </SiteShell>
  );
}
