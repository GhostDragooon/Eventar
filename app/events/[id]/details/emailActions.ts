'use server';

// Next 16: 'use server' files may export ONLY async functions. Shared types +
// helpers live in `@/lib/email/eventEmails` so this module stays compliant —
// and so the session-less cron dispatcher can reuse the send core without
// going through requireStaff(), which throws when there is no session.
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  sendReminderToRegistrants,
  sendSurveyInviteToAttendees,
  zero,
  type EventRow,
  type SendResult,
} from '@/lib/email/eventEmails';

/**
 * requireStaff + owner/manager gate for the event, reading it under RLS.
 * Owner-only-by-default (Q19); managers see all (Q16). Returns the event row
 * on success or a whole-batch error string.
 */
async function authorizeEvent(eventId: string): Promise<{ event: EventRow } | { error: string }> {
  const staff = await requireStaff();
  // Admin read (RLS-independent): surveys target *completed* events, which the
  // anon RLS session (review mode) cannot read via supabaseServer — the events
  // anon policy exposes only 'published'. Authorization is enforced in-code by
  // the explicit owner/manager gate below; requireStaff already established
  // identity.
  const admin = supabaseAdmin();
  const { data: event } = await admin
    .from('events')
    .select('id, title, status, start_time, end_time, timezone, venue_name, venue_address, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { error: 'Event not found.' };
  const canManage = event.created_by === staff.id || staff.role === 'eventar_staff';
  if (!canManage) return { error: 'You are not authorized for this event.' };
  return { event: event as EventRow };
}

/**
 * Email #2 — send the 60-min reminder + personal check-in pass to every
 * registered attendee of the event. Staff-gated; idempotent per recipient.
 * The cron dispatcher reaches the same send core via `/api/cron/dispatch`.
 */
export async function sendReminderForEvent(eventId: string): Promise<SendResult> {
  const gate = await authorizeEvent(eventId);
  if ('error' in gate) return zero(gate.error);

  const result = await sendReminderToRegistrants(gate.event);
  revalidatePath(`/events/${eventId}/details`);
  return result;
}

/**
 * Email #3 — send the post-event survey invite to every attended registrant.
 * Staff-gated; idempotent per recipient. The cron dispatcher reaches the same
 * send core via `/api/cron/dispatch`.
 */
export async function sendSurveyInviteForEvent(eventId: string): Promise<SendResult> {
  const gate = await authorizeEvent(eventId);
  if ('error' in gate) return zero(gate.error);

  const result = await sendSurveyInviteToAttendees(gate.event);
  revalidatePath(`/events/${eventId}/details`);
  return result;
}
