import 'server-only';
import { supabaseAdmin } from './supabase/admin';
import { supabaseServer } from './supabase/server';
import { rateLimitByUser } from './rateLimit';

const ABUSE_SCOPE = 'sessionAbuse';
const ABUSE_WINDOW_MS = 60 * 60 * 1000; // 60 min
// rate_limit_check allows while count <= max, so max 2 makes the 3rd hit the
// first disallowed one: 3 hits → revoke (Decisions Log Item 11). It was 3,
// which revoked on the 4th hit. Fixed 2026-10-14.
const ABUSE_MAX = 2;
// ponytail: rateLimit uses fixed 60-min buckets, not a sliding hour, so hits
// that straddle a bucket edge can reach 4 before a revoke. Switch to a sliding
// window if that slack ever matters.

/**
 * Deterministic abuse tier (§4, Decisions Log Item 11): 3 session rate-limit
 * hits within 60 min → automatic global session revoke of the offending user.
 * A pure measurement (rate-limit counter) driving an automatic action — no
 * inference, no IP enforcement on authenticated routes (pivot §6).
 *
 * Called by rateLimitBySession on the first rejection in each limiter window.
 * The subject comes from the caller's own session, never from the limiter key:
 * the staff walk-in limiter keys on staff.id, which is NOT an auth user id.
 *
 * Returns whether a revoke was triggered. Fails visibly (Rule 12).
 */
export async function recordAbuseHitAndMaybeRevoke(): Promise<{ revoked: boolean }> {
  // Read the session first, then verify THAT token, so the verified subject is
  // exactly the session being revoked (two independent reads could disagree
  // mid-refresh).
  const supabase = await supabaseServer();
  const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
  const accessToken = sessionRes?.session?.access_token;
  const { data: userRes, error: userErr } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : { data: { user: null }, error: null };
  const userId = userRes?.user?.id;
  if (!userId || !accessToken) {
    // Either read failing and "no session" end the same way: nothing to revoke.
    // The codes say which one it was (Rule 12: visible, not silent).
    const err = sessionErr ?? userErr;
    console.error('[abuseTier] no authenticated session; abuse hit not recorded', {
      code: err?.code, status: err?.status,
    });
    return { revoked: false };
  }

  // Key on userId (a UUID), NOT the access token: the key is persisted to
  // rate_limits.key and logged, and a bearer token must never be either. Per-
  // user is also the stronger abuse semantic here — the revoke is global, and
  // per-session keying would let hits be spread across sessions to duck the cap.
  // The raw token is still needed below for the global signOut. Security review 2026-08-06.
  const rl = await rateLimitByUser(ABUSE_SCOPE, userId, {
    windowMs: ABUSE_WINDOW_MS, max: ABUSE_MAX,
  });
  if (rl.allowed) return { revoked: false };

  const admin = supabaseAdmin();
  // P5.1: no by-session-id revoke in auth-js 2.105.4 — global revoke of the
  // offending caller's own token is the verified fallback.
  const { error: soErr } = await admin.auth.admin.signOut(accessToken, 'global');
  if (soErr) {
    // No revoke happened, so write no `session_revoked` row: audit_events is
    // permanent (Hard Rule 11) and must not record a false fact (Rule 12).
    // The counter is already over the cap, so the next first-rejection retries.
    console.error('[abuseTier] signOut failed; no revoke, no audit row', { code: soErr.code });
    return { revoked: false };
  }

  const { error: auditErr } = await admin.rpc('record_session_revocation', {
    p_user_id: userId, p_reason: '3_session_rate_limit_hits_60min', p_scope: 'global',
  });
  if (auditErr) console.error('[abuseTier] audit write failed', { code: auditErr.code });

  return { revoked: true };
}
