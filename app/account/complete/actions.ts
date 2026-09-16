'use server';

// Server Action for the guided account-completion flow's consent step.
// Identity / professional-profile / licence steps reuse the EXISTING
// updateMyAccount / updateMyProfessionalProfile / declareMyLicence actions
// from ../actions.ts — no new RPCs, no new definer functions.
//
// Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 4.

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { rateLimitBySession } from '@/lib/rateLimit';
import { LEGAL_VERSIONS } from '@/lib/legalVersions';
import type { AccountActionResult } from '../schema';

async function requireAuthenticatedSelf(): Promise<
  { ok: true; userId: string } | { ok: false; error: 'not_authorized' }
> {
  const supabase = await supabaseServer();
  // eslint-disable-next-line no-restricted-syntax -- no-session and call-failed collapse to "must sign in"
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (!user) return { ok: false, error: 'not_authorized' };
  return { ok: true, userId: user.id };
}

// Calls the existing grant_consent RPC (migration 20260704170748) for both
// required consent types at their current pinned versions. The RPC is
// idempotent-adjacent in effect (a second grant just inserts another row;
// the F2 gate and this flow both only care whether at least one non-
// withdrawn row exists at the current version), so re-running this action
// on a page reload mid-flow is safe.
export async function acceptRequiredConsents(): Promise<AccountActionResult<{ accepted: true }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  const rl = await rateLimitBySession('account.complete.consents', auth.userId, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  const supabase = await supabaseServer();
  const { error: tosError } = await supabase.rpc('grant_consent', {
    p_consent_type: 'terms_of_service',
    p_version: LEGAL_VERSIONS.terms_of_service,
  });
  if (tosError) return { ok: false, error: 'db_error' };

  const { error: ppError } = await supabase.rpc('grant_consent', {
    p_consent_type: 'privacy_policy',
    p_version: LEGAL_VERSIONS.privacy_policy,
  });
  if (ppError) return { ok: false, error: 'db_error' };

  revalidatePath('/account/complete');
  return { ok: true, data: { accepted: true } };
}
