// Professional profile edit page. Same server-side auth-check pattern as
// /account/page.tsx — redirects to /account/sign-in on no session.
//
// Plan §7.2 fields: workplace, position, profession, specialty, department,
// biography, speaker_discovery_opt_in. Plus (added 2026-09-04, unblocks F4
// for real signups) a minimal licence declare/list surface — reads
// practitioner_licences + accrediting_bodies inline, calls the existing
// declare_licence RPC via app/account/actions.ts.

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { getMyAccountAndProfile, listMyLicences } from '../actions';
import { ProfileClient } from './ProfileClient';
import { SiteShell } from '@/components/shell/SiteShell';
import type { AccreditingBodyView } from '../schema';

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

  const [result, licencesResult, bodiesResult] = await Promise.all([
    getMyAccountAndProfile(),
    listMyLicences(),
    // Direct read: accrediting_bodies has a public-read-active RLS policy
    // (migration 20260709160000). Filter to active bodies for the declare
    // picker; a licence already declared against a since-inactivated body
    // still shows in the caller's list (listMyLicences reads the union).
    // The picker degrades to empty on failure — the list still renders.
    supabase
      .from('accrediting_bodies')
      .select('id, short_name, full_name, jurisdiction')
      .eq('status', 'active')
      .order('short_name', { ascending: true }),
  ]);
  if (!result.ok) {
    const errorParam =
      result.error === 'not_authorized' ? 'not_authorized' : 'unavailable';
    redirect(`/account/sign-in?error=${errorParam}`);
  }

  // Licences + bodies degrade gracefully — a failure hides the licence
  // section rather than blocking profile edit. Consistent with the account
  // page's `initialUnlinkedCount` fallback.
  const initialLicences = licencesResult.ok ? licencesResult.data.licences : [];
  const bodies: AccreditingBodyView[] = (bodiesResult.data ?? []) as AccreditingBodyView[];

  return (
    <SiteShell active="account">
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <ProfileClient
          initialProfile={result.data.profile}
          initialLicences={initialLicences}
          activeBodies={bodies}
        />
      </div>
    </SiteShell>
  );
}
