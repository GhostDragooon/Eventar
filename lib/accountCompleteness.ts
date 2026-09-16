// Practitioner account-completion check — the app-layer routing gate that
// forces the guided creation flow (/account/complete) before any other
// account surface is usable.
//
// Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 4.
//
// Mirrors the F1-F5 gate inside award_attendance_credit (migration
// 20260916020000) but is NOT the same check and must not be treated as a
// trust boundary — this is a UI routing decision (surface tier, reads via
// RLS), not the credit-release gate (which stays the single source of
// truth for whether CPD points actually release). The two are allowed to
// disagree slightly without a security consequence: this helper is a
// convenience redirect, not an authorization control.
//
// One round trip: a single PostgREST embedded-resource query over the
// existing FK relationships (professional_profiles.user_id,
// practitioner_licences.user_id, consent_records.user_id all reference
// users.id) rather than four separate queries.

import { supabaseServer } from '@/lib/supabase/server';
import { LEGAL_VERSIONS } from '@/lib/legalVersions';

export type AccountCompleteness = {
  complete: boolean;
  identity: boolean;
  profile: boolean;
  licence: boolean;
  consents: boolean;
};

const INCOMPLETE: AccountCompleteness = {
  complete: false,
  identity: false,
  profile: false,
  licence: false,
  consents: false,
};

type ProfileEmbed = {
  workplace_text: string | null;
  workplace_organisation_id: string | null;
  position_code: string | null;
  position_other: string | null;
  profession_code: string | null;
  specialty_code: string | null;
  specialty_other: string | null;
  department_text: string | null;
};

type LicenceEmbed = { status: string };
type ConsentEmbed = { consent_type: string; version: string; withdrawn_at: string | null };

type CompletenessRow = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  professional_profiles: ProfileEmbed[] | ProfileEmbed | null;
  practitioner_licences: LicenceEmbed[] | null;
  consent_records: ConsentEmbed[] | null;
};

const nonBlank = (v: string | null | undefined) => (v ?? '').trim() !== '';

// F1 (email verified) is auth-tier, not public.users data — the caller
// already has it from the same supabase.auth.getUser() call every account
// page makes, so it's passed in rather than re-fetched here.
export async function isAccountComplete(
  userId: string,
  emailConfirmed: boolean,
): Promise<AccountCompleteness> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('users')
    .select(
      `first_name, last_name, phone,
       professional_profiles(workplace_text, workplace_organisation_id, position_code, position_other, profession_code, specialty_code, specialty_other, department_text),
       practitioner_licences(status),
       consent_records(consent_type, version, withdrawn_at)`,
    )
    .eq('id', userId)
    .maybeSingle<CompletenessRow>();

  // Fail toward showing the completion gate, not away from it (Hard Rule
  // 12): a transient read failure and a genuinely-incomplete account both
  // collapse to INCOMPLETE here. The consequence is a redundant redirect to
  // an idempotent flow (every step re-saves what's already there), never a
  // bypass of a mandatory gate — the asymmetry that makes collapsing safe.
  if (error) {
    console.error('[isAccountComplete] read failed', { userId, message: error.message });
    return INCOMPLETE;
  }
  if (!data) return INCOMPLETE;

  const identity = nonBlank(data.first_name) && nonBlank(data.last_name) && nonBlank(data.phone);

  // professional_profiles is 1:1 (unique user_id); PostgREST still returns
  // an array for a to-many-shaped embed unless queried with an !inner hint,
  // so normalize either shape defensively rather than assume one.
  const ppRaw = data.professional_profiles;
  const pp = Array.isArray(ppRaw) ? (ppRaw[0] ?? null) : ppRaw;
  const profile =
    pp != null &&
    (nonBlank(pp.workplace_text) || pp.workplace_organisation_id != null) &&
    (nonBlank(pp.position_code) || nonBlank(pp.position_other)) &&
    nonBlank(pp.profession_code) &&
    (nonBlank(pp.specialty_code) || nonBlank(pp.specialty_other)) &&
    nonBlank(pp.department_text);

  const licences = data.practitioner_licences ?? [];
  const licence = licences.some((l) => l.status === 'declared' || l.status === 'verified');

  const consents = data.consent_records ?? [];
  const hasConsent = (type: 'terms_of_service' | 'privacy_policy') =>
    consents.some((c) => c.consent_type === type && c.version === LEGAL_VERSIONS[type] && c.withdrawn_at == null);
  const consentsOk = hasConsent('terms_of_service') && hasConsent('privacy_policy');

  return {
    complete: emailConfirmed && identity && profile && licence && consentsOk,
    identity,
    profile,
    licence,
    consents: consentsOk,
  };
}
