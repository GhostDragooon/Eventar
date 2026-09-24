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
import {
  getMyAccountAndProfile,
  getUnlinkedRegistrationCount,
  listMyAppointments,
  listMyLicences,
  listMySocietyMemberships,
} from '../actions';
import { ProfileClient } from './ProfileClient';
import { SiteShell } from '@/components/shell/SiteShell';
import type { AccreditingBodyView } from '../schema';
import { isAccountComplete } from '@/lib/accountCompleteness';
import type { ControlledListOption } from '../complete/schema';

export const metadata = {
  title: 'Professional profile',
};

export default async function ProfilePage() {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) {
    redirect(`/account/sign-in?next=${encodeURIComponent('/account/profile')}`);
  }

  // Same completion guard as /account — plan Phase 4.
  const completeness = await isAccountComplete(authRes.user.id, authRes.user.email_confirmed_at != null);
  if (!completeness.complete) {
    redirect('/account/complete');
  }

  const [
    result,
    licencesResult,
    bodiesResult,
    appointmentsResult,
    membershipsResult,
    professionsResult,
    positionsResult,
    specialtiesResult,
    degreesResult,
    societiesResult,
    unlinkedResult,
  ] = await Promise.all([
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
    listMyAppointments(),
    listMySocietyMemberships(),
    supabase.from('professions').select('code, label_en').order('display_order', { ascending: true }),
    supabase.from('positions').select('code, label_en').order('display_order', { ascending: true }),
    supabase.from('specialties').select('code, profession_code, label_en').order('display_order', { ascending: true }),
    supabase.from('degrees').select('code, label_en').order('display_order', { ascending: true }),
    supabase.from('societies').select('code, label_en').order('display_order', { ascending: true }),
    getUnlinkedRegistrationCount(),
  ]);
  if (!result.ok) {
    const errorParam =
      result.error === 'not_authorized' ? 'not_authorized' : 'unavailable';
    redirect(`/account/sign-in?error=${errorParam}&next=${encodeURIComponent('/account/profile')}`);
  }

  // Licences + bodies + enrichment lists degrade gracefully — a failure
  // hides that section rather than blocking profile edit. Consistent with
  // the account page's `initialUnlinkedCount` fallback.
  const initialLicences = licencesResult.ok ? licencesResult.data.licences : [];
  const bodies: AccreditingBodyView[] = (bodiesResult.data ?? []) as AccreditingBodyView[];
  const initialAppointments = appointmentsResult.ok ? appointmentsResult.data.appointments : [];
  const initialMemberships = membershipsResult.ok ? membershipsResult.data.memberships : [];
  const professions: ControlledListOption[] = professionsResult.data ?? [];
  const positions: ControlledListOption[] = positionsResult.data ?? [];
  const specialties: (ControlledListOption & { profession_code: string | null })[] = specialtiesResult.data ?? [];
  const degrees: ControlledListOption[] = degreesResult.data ?? [];
  const societies: ControlledListOption[] = societiesResult.data ?? [];
  const unlinkedCount = unlinkedResult.ok ? unlinkedResult.data.count : 0;

  return (
    <SiteShell active="account" signedIn accountComplete unlinkedCount={unlinkedCount}>
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <ProfileClient
          initialProfile={result.data.profile}
          initialLicences={initialLicences}
          activeBodies={bodies}
          initialAppointments={initialAppointments}
          initialMemberships={initialMemberships}
          professions={professions}
          positions={positions}
          specialties={specialties}
          degrees={degrees}
          societies={societies}
        />
      </div>
    </SiteShell>
  );
}
