import 'server-only';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { supabaseAdmin } from './supabase/admin';

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: Date }
  // firstRejection: this call is the first one over the limit in its window.
  // sessionRevoked: this rejection was the 3rd abuse hit and signed the caller
  // out everywhere (set by rateLimitBySession only), so the action must say
  // so instead of "please wait".
  | { allowed: false; retryAfterMs: number; firstRejection: boolean; sessionRevoked?: true };

/**
 * Pure helper exported for unit testing. Parses an X-Forwarded-For value
 * (which is "client, proxy1, proxy2…") into the original client IP, with
 * a fallback to X-Real-IP and finally an "unknown" bucket.
 *
 * The "unknown" bucket is shared across all callers that strip XFF — a
 * minor risk in dev / behind misconfigured proxies, but Vercel always
 * sets X-Forwarded-For in production so this only matters in dev.
 */
export function parseClientIp(h: { xff: string | null; xRealIp: string | null }): string {
  if (h.xff) return h.xff.split(',')[0]!.trim();
  return h.xRealIp ?? 'unknown';
}

/**
 * Aligns a wall-clock ms timestamp to the start of its fixed window.
 * Pure helper exported for unit testing.
 */
export function windowStartMs(nowMs: number, windowMs: number): number {
  return nowMs - (nowMs % windowMs);
}

/** Exported so callers needing the raw IP (not just an IP-keyed rate-limit
 * check) can get it directly — e.g. self_check_in's guessing-path guard,
 * which needs the IP as a DB-function parameter, not just a rateLimit key. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return parseClientIp({
    xff: h.get('x-forwarded-for'),
    xRealIp: h.get('x-real-ip'),
  });
}

/**
 * Fixed-window rate limiter backed by Postgres `rate_limits` table.
 *
 * Why DB-backed and not in-memory: Server Actions run on serverless
 * functions in production (Vercel) — each in its own short-lived process.
 * An in-memory counter resets every cold start, defeating the limit.
 *
 * Why fixed-window and not sliding-window: at 200-attendee project scale
 * fixed-window is fine. A burst attacker can get up to 2x the limit at
 * window boundaries; the simpler implementation isn't worth complicating
 * for the marginal risk increase.
 *
 * Fail-open on limiter errors: a broken limiter shouldn't take the app
 * down for legit users. The console.error makes the failure visible
 * (CLAUDE.md Rule 12) so we can react.
 */
export async function rateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  const admin = supabaseAdmin();
  const nowMs = Date.now();
  const winStart = windowStartMs(nowMs, opts.windowMs);

  const { data, error } = await admin.rpc('rate_limit_check', {
    p_key: key,
    p_window_start: new Date(winStart).toISOString(),
    p_max: opts.max,
  });
  if (error) {
    const e = error as { code?: string; message?: string };
    // Fail-visible (Rule 12) + fail-open (policy choice — see above).
    // Log the SCOPE only, never the full key: the discriminator is a client IP
    // (rateLimitByIp) — personal data under Rule 10 — and would be a bearer
    // token if a session-keyed caller ever failed here. Scope alone identifies
    // which limiter broke. Security review 2026-08-06.
    console.error('[rateLimit] check failed; failing open', {
      scope: key.split(':')[0],
      code: e.code,
      message: e.message,
    });
    return { allowed: true, remaining: opts.max, resetAt: new Date(winStart + opts.windowMs) };
  }

  const result = data as { allowed: boolean; count: number };
  if (!result.allowed) {
    // rate_limit_check counts every call, rejected ones included, so the first
    // rejection in a window is exactly count == max + 1.
    return {
      allowed: false,
      retryAfterMs: winStart + opts.windowMs - nowMs,
      firstRejection: result.count === opts.max + 1,
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, opts.max - result.count),
    resetAt: new Date(winStart + opts.windowMs),
  };
}

/**
 * Convenience wrapper: rate-limit by client IP. The `scope` keeps different
 * surfaces from sharing a counter (e.g. selfCheckIn:1.2.3.4 is distinct
 * from submitSurvey:1.2.3.4).
 *
 * Call from any Server Action or Server Component:
 *   const r = await rateLimitByIp('selfCheckIn', { windowMs: 60_000, max: 10 });
 *   if (!r.allowed) return { error: 'Too many attempts...' };
 */
export async function rateLimitByIp(
  scope: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  const ip = await getClientIp();
  return rateLimit(composeRateKey(scope, ip), opts);
}

/** Compose a rate-limit key. Exported for unit testing. */
export function composeRateKey(scope: string, discriminator: string): string {
  return `${scope}:${discriminator}`;
}

/**
 * Rate-limit an authenticated caller, keyed by a server-derived id (the auth
 * user id, or staff.id) — never by client input. Every authenticated limiter
 * routes through here, so the §4 abuse tier (Decisions Log Item 11) is wired
 * here once: the first rejection in each window counts one abuse hit, and 3
 * hits in 60 min revoke the caller's sessions (lib/abuseTier.ts).
 *
 * Pass `abuseTier: false` for read-only / page-render limiters: they still
 * rate-limit, but a fast reload must never count toward a sign-out (Ivan,
 * 2026-10-14, Q45 clarification).
 */
export async function rateLimitBySession(
  scope: string,
  sessionId: string,
  opts: { windowMs: number; max: number; abuseTier?: false },
): Promise<RateLimitResult> {
  const result = await rateLimit(composeRateKey(scope, sessionId), opts);
  if (!result.allowed && result.firstRejection && opts.abuseTier !== false) {
    // Dynamic import: abuseTier imports this module (rateLimitByUser).
    try {
      const { recordAbuseHitAndMaybeRevoke } = await import('./abuseTier');
      const { revoked } = await recordAbuseHitAndMaybeRevoke();
      if (revoked) return { ...result, sessionRevoked: true };
    } catch (e) {
      // Let Next control-flow errors (redirect, notFound, dynamic usage) through.
      unstable_rethrow(e);
      // Fail visible but keep the rejection: an abuse-tier outage must not
      // turn a rate-limited request into a 500 (same fail-open stance as
      // rateLimit above).
      // code + name only, never the message: an auth error message can carry
      // an email (Rule 10).
      console.error('[rateLimit] abuse tier failed', {
        scope, code: (e as { code?: string }).code, name: (e as Error).name,
      });
    }
  }
  return result;
}

/** Rate-limit by user id (broader than session — all of a user's activity). */
export async function rateLimitByUser(
  scope: string,
  userId: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  return rateLimit(composeRateKey(scope, userId), opts);
}
