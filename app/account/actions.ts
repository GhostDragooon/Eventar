'use server';

// Authenticated-user account + professional-profile Server Actions.
//
// Different auth model from lib/withSecurity (which requireStaff-gates for
// organiser/eventar_staff roles). These actions are for authenticated
// attendees / practitioners updating their own account + profile.
//
// Plan authority: docs/plans/2026-08-29-account-professional-profile-plan.md
//   §7.1 — account edit surface (Server Action side, UI in Stage C)
//   §7.2 — professional profile edit surface
//   §7.4 — claim registrations (Server Action wrapping the definer)
//
// Auth: the cookie-bound supabaseServer() client is used so Postgres
// evaluates RLS in the caller's session. professional_profiles has
// self_insert / self_update / self_read policies; users has self_update /
// self_read. No admin/service_role required for account or profile writes.
// The claim action calls the SECURITY DEFINER claim_registrations_for_user()
// which uses auth.uid() inline and emits its own audit rows.

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { rateLimitBySession } from '@/lib/rateLimit';
import { getRequestOrigin } from '@/lib/origin';
import {
  accountUpdateSchema,
  licenceDeclareSchema,
  professionalProfileUpdateSchema,
  type AccountActionResult,
  type AccountAndProfile,
  type AccountUpdateInput,
  type LicenceRowView,
  type ProfessionalProfileUpdateInput,
} from './schema';

// ---------------------------------------------------------------------------
// Local helper — authenticated-self auth check.
//
// lib/auth.ts's requireStaff throws when the caller has no staff row, which
// is exactly the population these actions target (attendees / practitioners
// with no staff role). A small local helper is smaller than a new global
// wrapper; if a second surface needs the same shape, hoist to lib.
// ---------------------------------------------------------------------------

async function requireAuthenticatedSelf(): Promise<
  | { ok: true; userId: string; email: string | null; emailConfirmed: boolean }
  | { ok: false; error: 'not_authorized' }
> {
  const supabase = await supabaseServer();
  // getUser() reports "no session" as an error; both cases collapse to
  // "no verified identity" (same discipline as lib/auth.ts).
  // eslint-disable-next-line no-restricted-syntax
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (!user) return { ok: false, error: 'not_authorized' };
  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    emailConfirmed: user.email_confirmed_at != null,
  };
}

// ---------------------------------------------------------------------------
// getMyAccountAndProfile
// ---------------------------------------------------------------------------

export async function getMyAccountAndProfile(): Promise<AccountActionResult<AccountAndProfile>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await supabaseServer();

  const { data: account, error: accountErr } = await supabase
    .from('users')
    .select(
      'id, full_name, first_name, last_name, salutation, preferred_name, phone, phone_country_code, country_code, display_language, locale, timezone',
    )
    .eq('id', auth.userId)
    .maybeSingle();
  if (accountErr) return { ok: false, error: 'db_error' };
  if (!account) return { ok: false, error: 'not_found' };

  const { data: profile, error: profileErr } = await supabase
    .from('professional_profiles')
    .select(
      'workplace_text, workplace_organisation_id, position_code, position_other, profession_code, specialty_code, specialty_other, department_text, biography, expertise_codes, presentation_languages, speaker_discovery_opt_in, speaker_discovery_opt_in_at',
    )
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (profileErr) return { ok: false, error: 'db_error' };

  return {
    ok: true,
    data: {
      account,
      profile: profile ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// updateMyAccount
// ---------------------------------------------------------------------------

export async function updateMyAccount(
  raw: unknown,
): Promise<AccountActionResult<{ full_name: string }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  // Per-user rate limit — cheap protection against a runaway client submit
  // loop. Same shape lib/withSecurity uses for staff actions.
  const rl = await rateLimitBySession('account.update', auth.userId, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  const parsed = accountUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };
  const input: AccountUpdateInput = parsed.data;

  // Plan §1.8: full_name refresh from first + last when both are present.
  // Never blank an existing full_name. The refresh is derivative of the
  // caller's payload — we do not read the pre-existing users row just to
  // preserve full_name; that field remains NOT NULL at the schema level.
  const update: Record<string, unknown> = { ...input };
  const firstIn = typeof input.first_name === 'string' ? input.first_name.trim() : null;
  const lastIn = typeof input.last_name === 'string' ? input.last_name.trim() : null;
  if (firstIn && lastIn) {
    update.full_name = `${firstIn} ${lastIn}`;
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', auth.userId)
    .select('full_name')
    .single();
  if (error) return { ok: false, error: 'db_error' };
  if (!data) return { ok: false, error: 'not_found' };

  revalidatePath('/account');
  return { ok: true, data: { full_name: data.full_name } };
}

// ---------------------------------------------------------------------------
// updateMyProfessionalProfile
// ---------------------------------------------------------------------------

export async function updateMyProfessionalProfile(
  raw: unknown,
): Promise<AccountActionResult<{ profile_created: boolean }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  const rl = await rateLimitBySession('account.profile.update', auth.userId, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  const parsed = professionalProfileUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };
  const input: ProfessionalProfileUpdateInput = parsed.data;

  const supabase = await supabaseServer();

  // Upsert: RLS self_insert + self_update both key on user_id = auth.uid().
  // onConflict on user_id (UNIQUE per 20260829090000) covers the both-INSERT-
  // and-UPDATE cases in one call. The trigger keeps
  // speaker_discovery_opt_in_at in sync automatically.
  const payload = { user_id: auth.userId, ...input };
  const { data, error, status } = await supabase
    .from('professional_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('id, created_at, updated_at')
    .single();
  if (error) return { ok: false, error: 'db_error' };
  if (!data) return { ok: false, error: 'not_found' };

  // Rough insert-vs-update signal: created_at == updated_at means we just
  // inserted. Cheap heuristic — the UI can use it to celebrate "profile
  // created" the first time. 201 status would be nicer but supabase-js does
  // not consistently expose it for upsert.
  const profileCreated = data.created_at === data.updated_at || status === 201;

  revalidatePath('/account');
  return { ok: true, data: { profile_created: profileCreated } };
}

// ---------------------------------------------------------------------------
// getUnlinkedRegistrationCount — count of guest registrations that match the
// caller's verified email and are still unlinked. Feeds the AccountClient
// banner ("we found N registrations for your email — link them?"). Same
// predicate `claim_registrations_for_user` uses internally (case-insensitive
// email match, `user_id IS NULL`), so the count and the claim stay in
// lockstep without duplicating SQL.
//
// Reads through supabaseAdmin() because `registrations` has no anon SELECT
// policy (PII) — same pattern events/[id]/page.tsx uses for its capacity
// count. Only a bare integer leaves the boundary; no row content escapes.
// ---------------------------------------------------------------------------

export async function getUnlinkedRegistrationCount(): Promise<AccountActionResult<{ count: number }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  // A caller with no email on their session has nothing to match against; the
  // banner should stay hidden.
  if (!auth.email) return { ok: true, data: { count: 0 } };

  // Match `claim_registrations_for_user`'s own gate (migration
  // 20260829110000, lines 102-108): the definer raises 'email_unverified'
  // when email_confirmed_at is null. If the count function counted anyway,
  // the AccountClient banner would promise a claim ("we found N") that the
  // very next click fails with "Confirm your email first" — the exact
  // "control one layer above where the write happens" pattern the repo has
  // already caught six times. Producer and consumer stay in lockstep.
  if (!auth.emailConfirmed) return { ok: true, data: { count: 0 } };

  // Per-user rate limit — cheap symmetry with the neighbouring SAs
  // (updateMyAccount / claimMyRegistrations / updateMyProfessionalProfile).
  // Auth-gated + own-inbox-only + integer-only over the boundary makes the
  // abuse surface nil, but convention wins over novelty (Rule 11).
  const rl = await rateLimitBySession('account.unlinked_count', auth.userId, {
    windowMs: 60_000,
    max: 30,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  // Normalize the auth-side email the same way `registrations_lowercase_email`
  // (migration 20260520010000) normalizes on write, and the way the RPC's
  // predicate (`lower(trim(email)) = lower(trim(auth.email))`) reads. ILIKE
  // treats `%` and `_` as wildcards — escape so an address like
  // `first_last@x.com` matches literally and not as a pattern.
  const normalized = auth.email.trim().toLowerCase();
  const escaped = normalized.replace(/[\\%_]/g, (m) => `\\${m}`);

  const { count, error } = await supabaseAdmin()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .ilike('email', escaped)
    .is('user_id', null);
  if (error) return { ok: false, error: 'db_error' };

  return { ok: true, data: { count: count ?? 0 } };
}

export async function claimMyRegistrations(): Promise<AccountActionResult<{ claimed: number }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  // The definer re-checks email_confirmed_at server-side and raises
  // 'email_unverified' (SQLSTATE 42501) if the caller has not confirmed.
  // We check here too so the UI can show a specific message without a
  // round-trip.
  if (!auth.emailConfirmed) return { ok: false, error: 'email_unverified' };

  const rl = await rateLimitBySession('account.claim_registrations', auth.userId, {
    windowMs: 60_000,
    max: 6,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('claim_registrations_for_user');
  if (error) {
    // Map the definer's known 42501 raises to structured errors; anything
    // else is db_error.
    if (error.code === '42501' && error.message === 'email_unverified') {
      return { ok: false, error: 'email_unverified' };
    }
    if (error.code === '42501') {
      return { ok: false, error: 'not_authorized' };
    }
    return { ok: false, error: 'db_error' };
  }

  const claimed = typeof data === 'number' ? data : 0;
  // Revalidate any surface that might list "my registrations" once it exists
  // (Stage C). Cheap even if the route is not built yet.
  revalidatePath('/account');
  revalidatePath('/checkin');
  return { ok: true, data: { claimed } };
}

// ---------------------------------------------------------------------------
// listMyLicences — reads the caller's own practitioner_licences rows and
// app-joins body short_name for display. Practitioner_licences has a
// `self_read` RLS policy, so this runs under the cookie-bound session and
// requires no service-role bypass.
// ---------------------------------------------------------------------------

export async function listMyLicences(): Promise<AccountActionResult<{ licences: LicenceRowView[] }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('practitioner_licences')
    .select(
      'id, body_id, licence_number, licence_type, track, status, is_primary, declared_at, verified_at, cycle_started_on',
    )
    .eq('user_id', auth.userId)
    .order('is_primary', { ascending: false })
    .order('declared_at', { ascending: false });
  if (error) return { ok: false, error: 'db_error' };

  const rows = data ?? [];
  // Collect body ids to join short_name in one round-trip. accrediting_bodies
  // has an anon-friendly public-read-active policy; a licence declared
  // against an inactive body still shows in the caller's list, so we read
  // the union rather than filtering by status here.
  const bodyIds = Array.from(new Set(rows.map((r) => r.body_id)));
  const bodyShortNames = new Map<string, string>();
  if (bodyIds.length > 0) {
    // eslint-disable-next-line no-restricted-syntax -- join failure downgrades to null short_name, list still renders
    const { data: bodies } = await supabase
      .from('accrediting_bodies')
      .select('id, short_name')
      .in('id', bodyIds);
    for (const b of bodies ?? []) bodyShortNames.set(b.id, b.short_name);
  }

  const licences: LicenceRowView[] = rows.map((r) => ({
    id: r.id,
    body_id: r.body_id,
    body_short_name: bodyShortNames.get(r.body_id) ?? null,
    licence_number: r.licence_number,
    licence_type: r.licence_type,
    track: r.track,
    status: r.status,
    is_primary: r.is_primary,
    declared_at: r.declared_at,
    verified_at: r.verified_at,
    cycle_started_on: r.cycle_started_on,
  }));

  return { ok: true, data: { licences } };
}

// ---------------------------------------------------------------------------
// resendVerificationEmail — asks Supabase to re-send the "confirm your email"
// signup link to the caller's own address. Only makes sense when the caller
// is signed in but has not yet confirmed (F1 gate); once confirmed, the
// UI hides the section and this action bails out with `already_confirmed`
// to keep the client and server in lockstep (same "control one layer above
// where the write happens" doctrine the repo has caught seven times).
//
// Rate limit matches sibling actions (30/60s). Under the hood this calls the
// admin client's `auth.resend({type:'signup', email})` — the caller's OWN
// email is filled in from the session, never trusted from client input.
// ---------------------------------------------------------------------------

export async function resendVerificationEmail(): Promise<AccountActionResult<{ sent: true }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.email) return { ok: false, error: 'not_found' };
  if (auth.emailConfirmed) return { ok: false, error: 'already_confirmed' };

  const rl = await rateLimitBySession('account.email.resend_verification', auth.userId, {
    windowMs: 60_000,
    max: 3,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  // Same emailRedirectTo posture as the walk-in flow: land the confirming
  // click on /account so the user sees "your email is now verified" instead
  // of the default /dashboard (organizer) or a bare landing.
  const origin = await getRequestOrigin();
  const { error } = await supabaseAdmin().auth.resend({
    type: 'signup',
    email: auth.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/account')}`,
    },
  });
  if (error) {
    // Never leak whether Supabase found or didn't find the user. Same posture
    // as the sign-in action. Log server-side for operator diagnosis; return a
    // generic error to the UI.
    console.error('[resendVerificationEmail] supabase error', {
      name: error.name,
      status: error.status,
      code: (error as { code?: string }).code,
    });
    return { ok: false, error: 'db_error' };
  }
  return { ok: true, data: { sent: true } };
}

// ---------------------------------------------------------------------------
// changeEmail — self-serve email change for the caller (both attendee and
// organizer). Wraps `supabase.auth.updateUser({email})`, which starts a
// double-opt-in flow: Supabase sends a confirmation link to the NEW address;
// clicking it lands on /auth/callback which exchanges the code and updates
// `auth.users.email` in one step. If the project has "Secure email change"
// enabled (dashboard setting; separate from this code path), Supabase ALSO
// notifies the old address — the recommended posture but not enforceable
// from here.
//
// nextPath: where the confirmation click lands after `/auth/callback`.
// Passed by the caller so the same Server Action can serve both surfaces:
// attendee → /account, organizer → /settings.
// ---------------------------------------------------------------------------

export async function changeEmail(
  rawNewEmail: unknown,
  nextPath: '/account' | '/settings',
): Promise<AccountActionResult<{ sent: true; new_email: string }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  // Runtime guard for nextPath — the TS union is compile-time only, any
  // authenticated caller can pass any string as a Server Action arg (dev-lens
  // MODERATE 1). /auth/callback re-validates the `next` param downstream, but
  // reject the bad value here so the confirmation link never gets minted
  // with attacker-controlled content in the first place.
  if (nextPath !== '/account' && nextPath !== '/settings') {
    return { ok: false, error: 'invalid_input' };
  }

  const rl = await rateLimitBySession('account.email.change', auth.userId, {
    windowMs: 60_000,
    max: 3,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  // Local Zod-lite: the change-email flow only takes one field and we do not
  // want to import the whole `email` shape from a shared schema for one call.
  // Same regex the attendee sign-in action uses (loose intentionally — the
  // real check is Supabase's server-side, which understands more than any
  // regex could).
  if (typeof rawNewEmail !== 'string') return { ok: false, error: 'invalid_email' };
  const newEmail = rawNewEmail.trim().toLowerCase();
  if (!newEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return { ok: false, error: 'invalid_email' };
  }
  // No-op guard: asking to change email to the current email would fail
  // Supabase-side anyway (or silently succeed depending on version) — bail
  // out with a specific code so the UI can say "that's already your email".
  if (auth.email && auth.email.toLowerCase() === newEmail) {
    return { ok: false, error: 'same_email' };
  }

  const origin = await getRequestOrigin();
  // updateUser MUST run on the caller's OWN session, not the admin client —
  // the admin client would update the wrong (or no) row. supabaseServer()
  // is the cookie-bound session client.
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  );
  if (error) {
    // Supabase surfaces "email already in use" as a distinct error code
    // (`email_exists`) which we want to render as a user-fixable message
    // rather than a generic failure. Everything else collapses to db_error;
    // the operator gets the full context in logs.
    const code = (error as { code?: string }).code;
    if (code === 'email_exists') return { ok: false, error: 'email_exists' };
    console.error('[changeEmail] supabase error', {
      name: error.name,
      status: error.status,
      code,
    });
    return { ok: false, error: 'db_error' };
  }
  return { ok: true, data: { sent: true, new_email: newEmail } };
}

// ---------------------------------------------------------------------------
// declareMyLicence — Server Action wrapper around the declare_licence RPC.
// The 5-arg signature landed in 20260814200000; UI collects the three
// user-visible fields (body_id, licence_number, and optionally track +
// cycle_started_on) and forwards. RPC errors mapped explicitly per the
// tests/audit/licence_mutations.test.ts contract.
// ---------------------------------------------------------------------------

export async function declareMyLicence(
  raw: unknown,
): Promise<AccountActionResult<{ licence_id: string }>> {
  const auth = await requireAuthenticatedSelf();
  if (!auth.ok) return { ok: false, error: auth.error };

  const rl = await rateLimitBySession('account.licences.declare', auth.userId, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

  const parsed = licenceDeclareSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };
  const input = parsed.data;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('declare_licence', {
    p_body_id: input.body_id,
    p_licence_number: input.licence_number,
    p_licence_type: input.licence_type ?? null,
    p_track: input.track ?? null,
    p_cycle_started_on: input.cycle_started_on ?? null,
  });
  if (error) {
    // 23505 = unique_violation on (user_id, body_id, licence_number) — same
    // licence declared twice at the same body. Not a real error; the UI
    // treats it as "you already declared this one" and re-reads the list.
    if (error.code === '23505') return { ok: false, error: 'already_declared' };
    // P0002 raised for two distinct conditions; the message text
    // discriminates. Test file tests/audit/licence_mutations.test.ts asserts
    // both strings. UI copy differs.
    if (error.code === 'P0002') {
      if (typeof error.message === 'string' && error.message.includes('not active')) {
        return { ok: false, error: 'body_inactive' };
      }
      return { ok: false, error: 'body_not_found' };
    }
    if (error.code === '42501') return { ok: false, error: 'not_authorized' };
    return { ok: false, error: 'db_error' };
  }

  const licenceId =
    data && typeof data === 'object' && 'id' in data && typeof (data as { id: unknown }).id === 'string'
      ? (data as { id: string }).id
      : '';
  // Fail visibly (Hard Rule 12): the audit event has already been written
  // and the row exists — the RPC succeeded — but we didn't get a usable
  // handle back. Reporting ok+empty-id would let the client render a React
  // row with key='' and collide on a second declare in the same session.
  // Downgrade to db_error; the next listMyLicences read reconciles.
  if (!licenceId) return { ok: false, error: 'db_error' };
  revalidatePath('/account/profile');
  return { ok: true, data: { licence_id: licenceId } };
}
