import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';
import { isReviewMode, resolveReviewStaff } from './reviewMode';

export type Staff = {
  id: string;
  email: string;
  role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
  full_name: string | null;
};

export class NotAuthorizedError extends Error {
  constructor(message = 'not authorized') {
    super(message);
    this.name = 'NotAuthorizedError';
  }
}

export async function requireStaff(client?: SupabaseClient): Promise<Staff> {
  // LOCAL REVIEW BYPASS — see lib/reviewMode.ts, which checks NODE_ENV first
  // and unconditionally, so a production build cannot reach this branch.
  // Warned on every call: a running server must never be quietly in this state.
  if (isReviewMode()) {
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
    .select('id, email, role, full_name')
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
