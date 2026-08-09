import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireStaff, NotAuthorizedError, type Staff } from './auth';
import { supabaseServer } from './supabase/server';
import { rateLimitBySession } from './rateLimit';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SecurityCtx = { staff: Staff; supabase: SupabaseClient };

/** Sentinel a handler returns to signal an RLS-silently-filtered mutation (Q18). */
export const RLS_SILENT_FAIL = Symbol('RLS_SILENT_FAIL');

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'not_authorized' | 'rate_limited' | 'invalid_input' | 'not_found_or_forbidden'; retryAfterMs?: number; issues?: z.ZodIssue[] };

export function withSecurity<I, T>(
  handler: (input: I, ctx: SecurityCtx) => Promise<T | typeof RLS_SILENT_FAIL>,
  opts: {
    input: z.ZodType<I>;
    rateLimit: { scope: string; windowMs: number; max: number };
    revalidate?: string[];
  },
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    // 1. Auth — actor derived server-side, never from `raw`.
    let staff: Staff;
    try {
      staff = await requireStaff();
    } catch (e) {
      if (e instanceof NotAuthorizedError) return { ok: false, error: 'not_authorized' };
      throw e; // unexpected — fail visibly
    }
    const supabase = await supabaseServer();

    // 2. Rate limit, keyed to the authenticated staff id (server-derived, and
    // stable across token refreshes). Deliberately NOT the access token: this
    // key is persisted to rate_limits.key and logged on limiter error, and the
    // token is a bearer credential + PII (its JWT payload carries email/phone).
    // staff.id is a UUID and a strictly better key — the prior comment already
    // said so. Security review 2026-08-06.
    const rl = await rateLimitBySession(opts.rateLimit.scope, staff.id, {
      windowMs: opts.rateLimit.windowMs, max: opts.rateLimit.max,
    });
    if (!rl.allowed) return { ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs };

    // 3. Validate input.
    const parsed = opts.input.safeParse(raw);
    if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };

    // 4. Run handler.
    const result = await handler(parsed.data, { staff, supabase });
    if (result === RLS_SILENT_FAIL) return { ok: false, error: 'not_found_or_forbidden' };

    // 5. Revalidate + return.
    for (const p of opts.revalidate ?? []) revalidatePath(p);
    return { ok: true, data: result as T };
  };
}
