// Guided account-completion flow. Forced destination for any practitioner
// whose account is incomplete (redirect wired in /account, /account/profile,
// /account/claim via lib/accountCompleteness.ts).
//
// Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 5.
// Frontend pipeline run (impeccable-design-polish -> hallmark ->
// frontend-design -> stitch/design-taste/high-end/gpt-taste -> ui-ux-pro-max
// -> emilkowalski-motion): the four stage-3 taste skills and the two
// stage-2 skills all target landing/marketing pages (macrostructure, hero,
// nav/footer archetypes, AIDA) — none apply to a signed-in compliance-gate
// form using an already-locked design system (vault Q32). design-taste-
// frontend explicitly lists "multi-step forms / wizards" as out of scope.
// ui-ux-pro-max's Forms + Navigation categories are the one directly
// applicable stage: step indicator, back navigation, progressive
// disclosure — all in CompleteClient. Motion: emilkowalski-motion's
// restrained-transform-only guidance, no library (this app has none
// installed). review-animations could not run (disable-model-invocation —
// reserved for /review-animations).
//
// This page does NOT run the isAccountComplete redirect guard itself (that
// would infinite-loop). If the caller is ALREADY complete, it redirects
// to /account instead of showing the flow again.
//
// That guard must not fire on a Server Action's own re-render of this same
// route: declaring a licence is always the step that flips completeness to
// true (it's checked last in the initialStep ladder below), so the POST that
// declares it would otherwise trigger this page's redirect mid-action —
// skipping the wizard's own "Done" button entirely. `next-action` is Next's
// own request header identifying that a render is happening as a Server
// Action response, not a fresh navigation (confirmed against
// node_modules/next/dist/client/components/app-router-headers.js:
// ACTION_HEADER = 'next-action') — a real BROWSER navigation (bookmark, back
// button) never carries it, so the bounce-if-already-complete behavior is
// unchanged for them. (An arbitrary HTTP client could set this header on a
// plain GET; harmless here — this check is a routing convenience, not an
// authorization control, per lib/accountCompleteness.ts's own header, and
// every step it would let through is idempotent against the caller's own
// already-authenticated account.)

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { isAccountComplete } from '@/lib/accountCompleteness';
import { getMyAccountAndProfile, listMyLicences } from '../actions';
import { CompleteClient } from './CompleteClient';
import { SiteShell } from '@/components/shell/SiteShell';
import type { AccreditingBodyView } from '../schema';
import type { ControlledListOption } from './schema';

export const metadata = {
  title: 'Complete your account',
};

export default async function CompleteAccountPage() {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data: authRes } = await supabase.auth.getUser();
  if (!authRes?.user) {
    redirect(`/account/sign-in?next=${encodeURIComponent('/account/complete')}`);
  }

  const emailConfirmed = authRes.user.email_confirmed_at != null;
  const completeness = await isAccountComplete(authRes.user.id, emailConfirmed);
  const isActionRerender = (await headers()).has('next-action');
  if (completeness.complete && !isActionRerender) {
    redirect('/account');
  }

  const [accountResult, licencesResult, bodiesResult, professionsResult, positionsResult, specialtiesResult] =
    await Promise.all([
      getMyAccountAndProfile(),
      listMyLicences(),
      supabase
        .from('accrediting_bodies')
        .select('id, short_name, full_name, jurisdiction')
        .eq('status', 'active')
        .order('short_name', { ascending: true }),
      supabase.from('professions').select('code, label_en').order('display_order', { ascending: true }),
      supabase.from('positions').select('code, label_en').order('display_order', { ascending: true }),
      supabase.from('specialties').select('code, profession_code, label_en').order('display_order', { ascending: true }),
    ]);

  if (!accountResult.ok) {
    const errorParam = accountResult.error === 'not_authorized' ? 'not_authorized' : 'unavailable';
    redirect(`/account/sign-in?error=${errorParam}&next=${encodeURIComponent('/account/complete')}`);
  }

  const bodies: AccreditingBodyView[] = (bodiesResult.data ?? []) as AccreditingBodyView[];
  const professions: ControlledListOption[] = professionsResult.data ?? [];
  const positions: ControlledListOption[] = positionsResult.data ?? [];
  const specialties: (ControlledListOption & { profession_code: string | null })[] = specialtiesResult.data ?? [];

  // Resume where the caller left off — Consent -> Identity -> Professional ->
  // Licence — rather than always restarting at step 1. A caller who already
  // has identity + consents but is missing only a licence shouldn't re-click
  // through three done steps.
  const initialStep = !completeness.consents
    ? 1
    : !completeness.identity
      ? 2
      : !completeness.profile
        ? 3
        : 4;

  return (
    <SiteShell active="account" signedIn>
      <div className="mx-auto w-full max-w-2xl px-grid-margin py-xl">
        <CompleteClient
          initialStep={initialStep}
          initialAccount={accountResult.data.account}
          initialProfile={accountResult.data.profile}
          initialLicences={licencesResult.ok ? licencesResult.data.licences : []}
          activeBodies={bodies}
          professions={professions}
          positions={positions}
          specialties={specialties}
        />
      </div>
    </SiteShell>
  );
}
