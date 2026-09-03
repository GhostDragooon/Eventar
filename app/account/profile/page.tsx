// Professional profile edit page. Same server-side auth-check pattern as
// /account/page.tsx — redirects to /account/sign-in on no session.
//
// Plan §7.2 fields: workplace, position, profession, specialty, department,
// biography, speaker_discovery_opt_in. Licence declare/list is deliberately
// NOT here — declare_licence is an existing definer function with its own
// mutation surface; wiring a form to it is a follow-up (Stage C ships
// profile fields only per plan §7.2 and Ivan's minimal-UI ask).

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { getMyAccountAndProfile } from '../actions';
import { ProfileClient } from './ProfileClient';
import { SiteShell } from '@/components/shell/SiteShell';

export const metadata = {
  title: 'Professional profile',
};

export default async function ProfilePage() {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) {
    redirect('/account/sign-in');
  }

  const result = await getMyAccountAndProfile();
  if (!result.ok) {
    const errorParam =
      result.error === 'not_authorized' ? 'not_authorized' : 'unavailable';
    redirect(`/account/sign-in?error=${errorParam}`);
  }

  return (
    <SiteShell active="account">
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <ProfileClient initialProfile={result.data.profile} />
      </div>
    </SiteShell>
  );
}
