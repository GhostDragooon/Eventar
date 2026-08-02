import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import { selectDue, SURVEY_GRACE_HOURS, type DispatchCandidate } from '@/lib/cron/dispatchDue';
import {
  sendReminderToRegistrants,
  sendSurveyInviteToAttendees,
  type EventRow,
  type SendResult,
} from '@/lib/email/eventEmails';

/**
 * The scheduler's single entry point: makes the event loop self-running.
 *
 * The 60-min-before reminder (which carries the personal QR pass people scan at
 * the door) and the 10-min-after survey invite otherwise fire only when a human
 * clicks them in the Event Manager. This endpoint runs the same sends on a
 * schedule.
 *
 * The TRIGGER is deliberately not part of this file — pg_cron + pg_net, a
 * Vercel cron entry, or plain `curl` all hit the same URL. Swapping triggers
 * must never mean touching dispatch logic.
 *
 * Shipped trigger: `vercel.json`, `*／5 * * * *`. Chosen over a pg_cron
 * migration because it needs no extension, no Vault secret and no DB change,
 * so it cannot break CI replay-from-zero or schedule a job pointing at a
 * not-yet-deployed URL. It is inert until deploy.
 *   CAVEAT: Vercel's Hobby plan caps crons at ONE RUN PER DAY — the `*／5`
 *   cadence silently degrades there, which would miss every reminder window.
 *   Pro (or any other trigger hitting this URL) is required for real use.
 *
 * Cadence vs windows: at 5-minute ticks the reminder lands 55–60 min before
 * start (window is 60 min wide) and the survey within 5 min of its opening
 * (window is 24 h wide). Both have ample slack.
 *
 * Authorization is a shared secret, not a session: `requireStaff()` throws
 * without one, which is exactly why this route calls the session-less send core
 * in `@/lib/email/eventEmails` rather than the Server Actions.
 */

// Bounds one invocation so a large backlog cannot exceed a platform function
// timeout. Leftovers are reported, not queued — the next tick picks them up.
const MAX_EVENTS_PER_RUN = 20;

type CandidateRow = EventRow & DispatchCandidate;

/**
 * Constant-time secret comparison. Both sides are hashed first so the compare
 * operands are always 32 bytes: `timingSafeEqual` throws on length mismatch,
 * and a bare length check would leak the secret's length.
 */
function secretMatches(presented: string, configured: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(configured));
}

/**
 * Accepts the secret from either header so the trigger stays swappable:
 * `x-cron-secret` for curl and pg_net, `Authorization: Bearer` because Vercel
 * Cron can only issue GET and authenticates that way.
 */
function presentedSecret(req: NextRequest): string {
  const direct = req.headers.get('x-cron-secret');
  if (direct) return direct;
  const auth = req.headers.get('authorization') ?? '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

async function dispatch(req: NextRequest) {
  const configured = process.env.CRON_SECRET;
  // Fail CLOSED. An unset secret must never degrade to "open to everyone" —
  // that would turn a misconfigured deploy into a public mass-mail trigger.
  if (!configured) {
    console.error('[cron/dispatch] refused: CRON_SECRET is not configured');
    return NextResponse.json({ error: 'cron secret not configured' }, { status: 503 });
  }
  if (!secretMatches(presentedSecret(req), configured)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const nowMs = now.getTime();

  // Bound the candidate scan to what could possibly be due. Both bounds are
  // exact, not slack: a reminder needs now >= start − CHECKIN_OPEN_MINUTES
  // (so start <= now + that), and a survey needs now < end + the grace window
  // (so end > now − that).
  const earliestEnd = new Date(nowMs - SURVEY_GRACE_HOURS * 3_600_000).toISOString();
  const latestStart = new Date(nowMs + CHECKIN_OPEN_MINUTES * 60_000).toISOString();

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('events')
    .select(
      'id, title, status, start_time, end_time, timezone, venue_name, venue_address, created_by, registration_close_at, registration_open_at',
    )
    .in('status', ['published', 'completed'])
    .is('deleted_at', null) // soft-deleted events must never be mailed
    .gte('end_time', earliestEnd)
    .lte('start_time', latestStart);

  if (error) {
    console.error('[cron/dispatch] candidate query failed', { code: error.code });
    return NextResponse.json({ error: 'candidate query failed' }, { status: 500 });
  }

  const candidates = (data ?? []) as CandidateRow[];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const due = selectDue(candidates, nowMs);
  const batch = due.slice(0, MAX_EVENTS_PER_RUN);

  const dispatched: Array<{ eventId: string; purpose: 'reminder' | 'survey' } & SendResult> = [];

  for (const item of batch) {
    const event = byId.get(item.eventId);
    if (!event) continue;
    try {
      const result =
        item.purpose === 'reminder'
          ? await sendReminderToRegistrants(event)
          : await sendSurveyInviteToAttendees(event);
      dispatched.push({ eventId: item.eventId, purpose: item.purpose, ...result });
    } catch (e) {
      // One event's failure must not abort the batch (rule 12): record it,
      // surface it in the response, carry on. UUIDs only — never PII.
      console.error('[cron/dispatch] send threw', {
        eventId: item.eventId,
        purpose: item.purpose,
        message: e instanceof Error ? e.message : 'unknown',
      });
      dispatched.push({
        eventId: item.eventId,
        purpose: item.purpose,
        sent: 0,
        queued: 0,
        skipped: 0,
        failed: 1,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    // Without this an all-green local run reads as "mail delivered" when the
    // stub swallowed every message. `queued` counts are stub writes, not sends.
    delivery: process.env.RESEND_API_KEY ? 'live' : 'stubbed',
    scanned: candidates.length,
    dispatched,
    morePending: due.length > batch.length,
  });
}

// Same logic on both verbs: POST is the honest verb for a mutation (curl,
// pg_net), GET exists because Vercel Cron can only issue GET. The shared secret
// is the gate either way, so GET is not a drive-by trigger.
export const GET = dispatch;
export const POST = dispatch;
