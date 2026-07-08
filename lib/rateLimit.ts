import 'server-only';
import { headers } from 'next/headers';
import { supabaseAdmin } from './supabase/admin';

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: Date }
  | { allowed: false; retryAfterMs: number };

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
    console.error('[rateLimit] check failed; failing open', {
      key,
      code: e.code,
      message: e.message,
    });
    return { allowed: true, remaining: opts.max, resetAt: new Date(winStart + opts.windowMs) };
  }

  const result = data as { allowed: boolean; count: number };
  if (!result.allowed) {
    return { allowed: false, retryAfterMs: winStart + opts.windowMs - nowMs };
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
 * Rate-limit by the caller's Supabase session (access-token-derived id).
 * Used by the §4 authenticated abuse tier. `sessionId` is derived server-side
 * from the authenticated session — never from client input.
 */
export async function rateLimitBySession(
  scope: string,
  sessionId: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  return rateLimit(composeRateKey(scope, sessionId), opts);
}

/** Rate-limit by user id (broader than session — all of a user's activity). */
export async function rateLimitByUser(
  scope: string,
  userId: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  return rateLimit(composeRateKey(scope, userId), opts);
}
