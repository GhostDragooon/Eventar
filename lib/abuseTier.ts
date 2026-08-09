import 'server-only';
import { supabaseAdmin } from './supabase/admin';
import { rateLimitByUser } from './rateLimit';

const ABUSE_SCOPE = 'sessionAbuse';
const ABUSE_WINDOW_MS = 60 * 60 * 1000; // 60 min
const ABUSE_MAX = 3;                    // 3 hits in the window → revoke

/**
 * Deterministic abuse tier (§4): 3 session rate-limit hits within 60 min →
 * automatic global session revoke of the offending session's user. A pure
 * measurement (rate-limit counter) driving an automatic action — no
 * inference, no IP enforcement on authenticated routes (pivot §6).
 *
 * Returns whether a revoke was triggered. Fails visibly (Rule 12).
 */
export async function recordAbuseHitAndMaybeRevoke(args: {
  sessionAccessToken: string; userId: string;
}): Promise<{ revoked: boolean }> {
  // Key on userId (a UUID), NOT the access token: the key is persisted to
  // rate_limits.key and logged, and a bearer token must never be either. Per-
  // user is also the stronger abuse semantic here — the revoke is global, and
  // per-session keying would let hits be spread across sessions to duck the cap.
  // The raw token is still needed below for the global signOut. Security review 2026-08-06.
  const rl = await rateLimitByUser(ABUSE_SCOPE, args.userId, {
    windowMs: ABUSE_WINDOW_MS, max: ABUSE_MAX,
  });
  if (rl.allowed) return { revoked: false };

  const admin = supabaseAdmin();
  // P5.1: no by-session-id revoke in auth-js 2.105.4 — global revoke of the
  // offending caller's own token is the verified fallback.
  const { error: soErr } = await admin.auth.admin.signOut(args.sessionAccessToken, 'global');
  if (soErr) console.error('[abuseTier] signOut failed', { code: soErr.code });

  const { error: auditErr } = await admin.rpc('record_session_revocation', {
    p_user_id: args.userId, p_reason: '3_session_rate_limit_hits_60min', p_scope: 'global',
  });
  if (auditErr) console.error('[abuseTier] audit write failed', { code: auditErr.code });

  return { revoked: true };
}
