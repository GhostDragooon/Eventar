/**
 * LOCAL REVIEW BYPASS — lets a reviewer walk every staff surface without an
 * account. Reintroduced 2026-08-06 at Ivan's request so he can check each page.
 *
 * ⚠️ THIS DISABLES AUTHENTICATION. Read the gate before changing anything.
 *
 * It is deliberately impossible to enable in production:
 *
 *   1. `NODE_ENV === 'production'` short-circuits FIRST and unconditionally.
 *      `next build` bakes NODE_ENV=production, so a production bundle cannot
 *      take the bypass branch even if the env var is set on the host.
 *   2. The env var must be the exact string 'true' — no truthiness, so a
 *      stray `EVENTAR_REVIEW_MODE=false` or `=0` cannot enable it by accident.
 *
 * A previous incarnation of this bypass lived in `lib/auth.ts` + `proxy.ts` and
 * every handoff from June carried "strip before push" as open debt until
 * `c43fd95` removed it. That is exactly why the production check is inside this
 * single function rather than copied to each call site: there is one place to
 * audit, and it fails closed.
 *
 * The synthetic identity is `eventar_staff` — the widest role — because the
 * point is to see every surface. It is NOT a real staff row, so anything that
 * joins on staff.id will find nothing; surfaces that depend on ownership will
 * behave as "not your event" rather than crashing.
 */

/**
 * Last-resort identity if the database has no active staff at all. Owns
 * nothing, so ownership-scoped pages render empty rather than crashing.
 */
export const REVIEW_STAFF = {
  id: '00000000-0000-4000-8000-0000000review',
  email: 'review@localhost.invalid',
  role: 'eventar_staff' as const,
  full_name: 'Review Mode',
  organisation_id: null as string | null,
};

/**
 * Borrow a REAL staff row for the review session.
 *
 * A synthetic id owns no events, and most staff surfaces scope by
 * `created_by` — so a made-up identity produces an empty dashboard, an empty
 * roster and an empty analytics page, which is worse than useless for someone
 * trying to review how the pages look with content in them.
 *
 * Prefers the demo operator the seed script creates, then any active
 * `eventar_staff`, then anyone active. Falls back to REVIEW_STAFF only if the
 * staff table is genuinely empty.
 */
export async function resolveReviewStaff(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<typeof REVIEW_STAFF> {
  const { data, error } = await admin
    .from('staff')
    .select('id, email, role, full_name, organisation_id')
    .eq('status', 'active');

  if (error) {
    console.warn('[review-mode] staff lookup failed, using synthetic identity', { code: error.code });
    return REVIEW_STAFF;
  }

  const rows = (data ?? []) as Array<typeof REVIEW_STAFF>;
  if (rows.length === 0) return REVIEW_STAFF;

  return (
    rows.find((r) => r.email === 'demo-staff@local.test') ??
    rows.find((r) => r.role === 'eventar_staff') ??
    rows[0]
  );
}

export function isReviewMode(): boolean {
  // Production first, and unconditional. Never reorder these.
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.EVENTAR_REVIEW_MODE === 'true';
}

/**
 * Pure predicate — given a request's cookies, is a real Supabase auth session
 * present? Shared by every review-mode call site so "should this request
 * bypass auth" is answered the same way everywhere.
 *
 * `lib/supabase/server.ts` originally had this check alone; `requireStaff()`
 * in `lib/auth.ts` bypassed unconditionally instead, so a request with a real
 * staff session (e.g. a tester signed in for real, then continuing to browse
 * other staff pages under review mode without signing out) got a genuine
 * session-bound Supabase client for its data reads but a borrowed identity
 * for its authorization check — two different actors resolved for one
 * request, with a SECURITY DEFINER RPC free to trust whichever one it read
 * (`auth.email()`/`current_staff_id()`) over the borrowed one the app layer
 * passed along. Found 2026-09-16 creating an event that silently landed
 * under the wrong organisation.
 *
 * `proxy.ts` (middleware/edge runtime) had the SAME unconditional bypass and
 * needed the SAME fix, but can't use `hasRealAuthCookie()` below —
 * `next/headers`'s `cookies()` isn't available there; middleware reads
 * `req.cookies.getAll()` directly. Both shapes are `{name, value}[]`, so this
 * one pure function serves both callers instead of proxy.ts growing its own
 * copy of the predicate — which is what proxy.ts's own comment ("Same guard
 * function, so both layers open and close together and there is one thing to
 * audit") already claimed, before this fix actually made it true. Found
 * 2026-09-17 via live user-lens review: a real non-staff session under review
 * mode sailed past proxy.ts's own specific "not on the organizer list"
 * rejection into a bare, unlabelled `/login` bounce from the page layer.
 */
export function isRealAuthCookiePresent(cookies: Array<{ name: string }>): boolean {
  return cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
}

/** Server Component / Server Action convenience wrapper — see the predicate above for why proxy.ts can't use this one. */
export async function hasRealAuthCookie(): Promise<boolean> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return isRealAuthCookiePresent(cookieStore.getAll());
}
