import 'server-only';
import { isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from './supabase/server';
import { isReviewMode, resolveReviewStaff, hasRealAuthCookie } from './reviewMode';

export type Staff = {
  id: string;
  email: string;
  role: 'organiser_admin' | 'organiser_member' | 'body_admin' | 'auditor' | 'eventar_staff';
  full_name: string | null;
  organisation_id: string | null;
};

// `staff` allows one email in two organisations (UNIQUE (email, organisation_id)); .maybeSingle() then fails with
// PGRST116. UUID and code only: never the email (rule 10).
function logMultipleStaffRows(userId: string | undefined, code: string) {
  console.error('[auth] staff email matches more than one active row', { userId, code });
}

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

// Which roles publish_event() accepts: its resolve_actor gate names exactly
// these three (set in 20260910000000, unchanged by 20261002010000, which only
// narrows WHICH events it will transition). body_admin and auditor cannot publish (they can
// still save a draft). This decides what to SHOW (a Publish control a role
// cannot use, or the plain reason it is missing); the database stays the
// authority and still refuses the call, so a stale or hostile client gains
// nothing.
export function canPublishEvents(role: Staff['role']): boolean {
  return role === 'organiser_admin' || role === 'organiser_member' || role === 'eventar_staff';
}

// Which roles update_registration_contact() and set_registration_role() accept: organiser_admin, organiser_member
// and eventar_staff. body_admin and auditor read the Registrations list and cannot change it. Decides what to
// SHOW; the database refuses regardless.
export function canEditRegistrations(role: Staff['role']): boolean {
  return role === 'organiser_admin' || role === 'organiser_member' || role === 'eventar_staff';
}

// Role chips are editable only by the event's creator (set_registration_role() refuses any other organiser), and by
// eventar_staff. Decides what to SHOW, on the Registrations page and in the Check-in header sentence that points at it;
// the database refuses regardless.
export function canEditRegistrationRoles(staff: Pick<Staff, 'id' | 'role'>, event: { created_by: string | null }): boolean {
  return canEditRegistrations(staff.role) && (staff.role === 'eventar_staff' || event.created_by === staff.id);
}

// Which roles mark_attended() accepts: its resolve_actor gate names organiser_admin, organiser_member and
// eventar_staff (20261023170000). body_admin and auditor read the desk and cannot check anyone in. The walk-in
// action checks this BEFORE it inserts a registration (a refusal after the insert left an orphan row, RV-FINAL F2);
// the desk uses it to say so up front. The database stays the authority.
export function canCheckIn(role: Staff['role']): boolean {
  return role === 'organiser_admin' || role === 'organiser_member' || role === 'eventar_staff';
}

// Which roles bulk_update_event_status() accepts (20261104100000): cancel, archive and restore events. Same three
// as publish_event; body_admin and auditor read and cannot change an event's state. Until that migration the RPC
// named no roles, so any active staff role could cancel or delete every event in its organisation. The database
// refuses regardless; this lets the action answer plainly before the call.
export function canChangeEventStatus(role: Staff['role']): boolean {
  return role === 'organiser_admin' || role === 'organiser_member' || role === 'eventar_staff';
}

// Which roles set_event_cpd_config() accepts: its resolve_actor gate names only
// these two (read from the live definition on 2026-10-02). An organiser_member
// can create and publish an event but not accredit it; the create form used to
// offer the picker anyway and ended on a half-success. Same contract as above:
// this decides what to show, the database refuses regardless.
export function canSetAccreditation(role: Staff['role']): boolean {
  return role === 'organiser_admin' || role === 'eventar_staff';
}

// Non-throwing mirror of requireStaff — the single source of truth for
// "is this session an organiser?" (Q32 audience boundary). Ivan's 2026-09-24
// restatement: organisers own the organiser side; they have no attendee
// identity by design; attendee surfaces must not silently render attendee
// chrome to a staff session or accumulate practitioner data under a staff
// UUID.
//
// Tri-state because the two kinds of consumer fail in opposite directions.
// A WRITE that must not attach practitioner data to a staff UUID acts only
// on 'not_staff' — 'unknown' (a failed read) is never "not staff" (N1,
// 2026-09-25: the old boolean collapsed a DB blip into "not staff", and no
// RLS policy catches the gap — registerForEvent writes via service_role and
// the self-write policies key on auth.uid() alone). UI framing uses
// isStaffSession below, which stays fail-open.
//
// "No session" is a definite 'not_staff' (nobody to protect); any other
// identity-read failure is 'unknown'.
export async function getStaffSessionState(
  client?: SupabaseClient,
): Promise<'staff' | 'not_staff' | 'unknown'> {
  // Review-mode identical to requireStaff's early branch: only fires when
  // there is no real auth cookie. NODE_ENV=production short-circuits
  // isReviewMode() unconditionally, so a production build cannot reach
  // this branch. A real session on a dev server takes the query path below.
  if (isReviewMode() && !(await hasRealAuthCookie())) {
    return 'not_staff';
  }
  const supabase = client ?? (await supabaseServer());
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  const email = userRes?.user?.email?.toLowerCase();
  if (!email) return userErr && !isAuthSessionMissingError(userErr) ? 'unknown' : 'not_staff';
  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id')
    .eq('email', email)
    .eq('status', 'active')
    .maybeSingle();
  if (staffErr) {
    // One email in two organisations (PGRST116): two active rows prove the person is staff, so say 'staff' and
    // say why in the log. Every consumer uses 'staff' only to deny or to frame, never to grant (CX-07).
    if (staffErr.code === 'PGRST116') {
      logMultipleStaffRows(userRes?.user?.id, staffErr.code);
      return 'staff';
    }
    return 'unknown';
  }
  return staff != null ? 'staff' : 'not_staff';
}

// Fail-open boolean for UI framing and route redirects (shells, the
// /account/* layout, getAccountMenuState): a read error renders attendee
// posture instead of a 500. Never use it to decide a write — use
// getStaffSessionState and act only on 'not_staff'.
export async function isStaffSession(client?: SupabaseClient): Promise<boolean> {
  return (await getStaffSessionState(client)) === 'staff';
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
  // Staff is matched on the email string, so the address must be proven (security audit H1, 2026-11-04). An
  // unconfirmed address would otherwise inherit whichever staff row carries it. proxy.ts applies the same check.
  // getStaffSessionState deliberately does NOT: it only denies or frames, so an unconfirmed address that matches
  // a staff row must still read as staff there (the practitioner-write guards depend on it). Only meaningful while hosted Auth has "Confirm email" ON: with
  // autoconfirm every address counts as confirmed at signup. The RLS side (app_private.auth_email()) is not
  // covered here: it reads the JWT email claim and is a kernel change (Decisions Log + Ivan sign-off).
  if (!userRes?.user?.email_confirmed_at) throw new NotAuthorizedError('email not confirmed');

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
  if (staffErr) {
    if (staffErr.code === 'PGRST116') logMultipleStaffRows(userRes?.user?.id, staffErr.code);
    throw staffErr;
  }
  if (!staff) throw new NotAuthorizedError('email not in staff table');
  return staff as Staff;
}
