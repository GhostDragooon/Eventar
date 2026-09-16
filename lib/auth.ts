import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';
import { isReviewMode, resolveReviewStaff, hasRealAuthCookie } from './reviewMode';

export type Staff = {
  id: string;
  email: string;
  role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
  full_name: string | null;
  organisation_id: string | null;
};

export class NotAuthorizedError extends Error {
  constructor(message = 'not authorized') {
    super(message);
    this.name = 'NotAuthorizedError';
  }
}

export function canManageEvent(
  event: { organisation_id: string | null },
  staff: Staff,
): boolean {
  if (staff.role === 'eventar_staff') return true;
  return event.organisation_id != null && event.organisation_id === staff.organisation_id;
}

export async function requireStaff(client?: SupabaseClient): Promise<Staff> {
  // LOCAL REVIEW BYPASS — see lib/reviewMode.ts, which checks NODE_ENV first
  // and unconditionally, so a production build cannot reach this branch.
  // Warned on every call: a running server must never be quietly in this state.
  //
  // Gated on the SAME "no real session" condition supabaseServer() uses
  // (lib/supabase/server.ts) — not unconditional. A request that already
  // carries a real auth cookie gets the real staff lookup below instead of a
  // borrowed identity: previously this branch borrowed regardless, so a
  // request with a genuine session resolved to a borrowed identity here but
  // a real, cookie-bound Supabase client wherever the caller went on to run
  // a query or RPC — two different actors for one request. A SECURITY
  // DEFINER function resolving its own actor via auth.email() (rather than
  // trusting an app-passed id) would then silently act as the REAL session,
  // not the identity this function just returned. Found 2026-09-16: an event
  // created under review mode landed under a different organisation than the
  // one displayed, because create_event_with_blocks did exactly that.
  if (isReviewMode() && !(await hasRealAuthCookie())) {
    // Borrows a real staff row so ownership-scoped pages actually have content
    // — see resolveReviewStaff. Admin client because there is no session to
    // read `staff` with; that is the whole point of the bypass.
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const staff = await resolveReviewStaff(supabaseAdmin());
    // Hard rule 10: UUIDs only, never PII. This logged staff.email until
    // 2026-08-09 — a real address, since resolveReviewStaff borrows a live
    // staff row rather than inventing one. The id identifies the borrowed
    // identity just as well for anyone reading the log.
    console.warn('[review-mode] AUTH BYPASSED — acting as staff id', staff.id);
    return staff as Staff;
  }

  const supabase = client ?? (await supabaseServer());

  // getUser() reports "no session" as an error, so here a failed call and an
  // absent session are genuinely the same fact: no verified identity. Both
  // must fail closed to /login, which is what the NotAuthorizedError below does.
  // eslint-disable-next-line no-restricted-syntax -- see above: no-session and call-failed are the same fact
  const { data: userRes } = await supabase.auth.getUser();
  const email = userRes?.user?.email?.toLowerCase();
  if (!email) throw new NotAuthorizedError('no session');

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id, email, role, full_name, organisation_id')
    .eq('email', email)
    .eq('status', 'active')          // reconciled: suspended/removed lose access immediately
    .maybeSingle();

  // Not a NotAuthorizedError: this read failing is an outage, and callers turn
  // NotAuthorizedError into a redirect to /login with "your email is not on the
  // staff list" — a false accusation against a real staff member (rule 12).
  // Throwing the underlying error still fails closed (no access is granted);
  // it just stops lying about why.
  if (staffErr) throw staffErr;
  if (!staff) throw new NotAuthorizedError('email not in staff table');
  return staff as Staff;
}
