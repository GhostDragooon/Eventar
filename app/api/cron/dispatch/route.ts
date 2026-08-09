import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import { selectDue, SURVEY_GRACE_HOURS, type DispatchCandidate } from '@/lib/cron/dispatchDue';
import {
  zero,
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
 * ⚠️ THERE IS CURRENTLY NO TRIGGER. Nothing fires this endpoint.
 *
 * A `vercel.json` entry existed briefly and was reverted in 72cda80 ("Vercel is
 * not in scope yet"); the comment claiming it was still the shipped trigger
 * outlived the file and was corrected here (2026-08-05). No pg_cron job exists
 * either — grep `cron.schedule` across supabase/migrations: nothing.
 *
 * DEPLOYING WITHOUT ADDING ONE SHIPS A DEAD SCHEDULER, and it fails silently:
 * no reminder means no QR pass, which means no door check-in, which means no
 * attendance, which means no CPD credit. Choosing the trigger is deliberately
 * deferred to the deploy decision because it depends on the host (Stage 8).
 * Whichever is chosen, it hits this same URL — no logic here changes.
 *   - Vercel Cron: needs Pro. The Hobby plan caps crons at ONE RUN PER DAY,
 *     so a `*／5` entry silently degrades and misses every reminder window.
 *   - pg_cron + pg_net: host-independent, but costs an extension, a Vault
 *     secret for CRON_SECRET, and a DB change CI replay must tolerate.
 *   - Any external scheduler that can issue an authenticated GET or POST.
 *
 * Cadence vs windows: at 5-minute ticks the reminder lands 55–60 min before
 * start (window is 60 min wide) and the survey within 5 min of its opening
 * (window is 24 h wide). Both have ample slack. A tick interval longer than
 * 60 min can miss a reminder window entirely.
 *
 * Authorization is a shared secret, not a session: `requireStaff()` throws
 * without one, which is exactly why this route calls the session-less send core
 * in `@/lib/email/eventEmails` rather than the Server Actions.
 */

/**
 * Platform function timeout. Without this the host default applies (10–15s on
 * Vercel), which a real batch exceeds easily: the per-recipient work is a QR
 * render plus an email render plus a provider round-trip, run sequentially. A
 * kill mid-batch leaves rows stuck at 'queued', which is TERMINAL under
 * email_log_dedup_idx — so a timeout is permanent mail loss, not a retry.
 *
 * 60 is a conservative choice, NOT a verified plan ceiling — the per-plan
 * limits could not be checked from this environment (vercel.com unreachable).
 * Confirm the chosen host's real maximum at Stage 8, and whether exceeding it
 * is a build error or a silent clamp; a silent clamp would mean this line
 * reads as protection it is not actually providing.
 *
 * ⚠️ IT IS A HINT, NOT A TIMEOUT. Next's own docs say platforms *can* use
 * maxDuration from the build output — Vercel does; self-hosted Node, Netlify
 * and Cloudflare ignore it. On a host that ignores it this mitigates nothing
 * and the mid-batch-kill mail loss is fully unmitigated, so the host choice
 * (still open — see docs/DEFERRED.md) decides whether this line does anything.
 */
export const maxDuration = 60;

/**
 * Bounds one invocation so a large backlog cannot exceed the timeout above.
 *
 * NOTE this bounds EVENTS, not recipients, while the cost is per recipient —
 * 20 events × 30 registrants is 600 sequential sends. The mitigation for now is
 * `selectDue`'s urgency ordering: when more is due than fits, the work whose
 * window closes soonest goes first, so the cap degrades gracefully instead of
 * arbitrarily. Leftovers are reported via `morePending`.
 *
 * Do NOT read that as "the next tick picks them up" (this comment's previous
 * claim, which was false): selection is purely time-based and has no idea what
 * was already sent, so the same events are re-selected every tick until their
 * windows close. Recipient-level chunking is the real fix and is deferred —
 * see docs/DEFERRED.md for the re-entry criterion.
 */
const MAX_EVENTS_PER_RUN = 20;

/**
 * The bound that actually matters. `MAX_EVENTS_PER_RUN` counts events while the
 * cost is per RECIPIENT — a QR render plus an email render plus a provider
 * round-trip, run sequentially — so 20 events x 200 registrants is 4000
 * sequential sends against a 60s budget. A kill mid-batch leaves rows at
 * 'queued', which is TERMINAL under email_log_dedup_idx, so an overrun is
 * permanent mail loss rather than a retry.
 *
 * Events are taken in `selectDue`'s urgency order until this is reached, so
 * what gets deferred is always the work with the most window left.
 *
 * ~300 recipients at roughly 150ms each is well inside 60s with room for a slow
 * provider. Tune it against real send latency, not arithmetic.
 */
const MAX_RECIPIENTS_PER_RUN = 300;

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

  // Fill the batch by RECIPIENT COUNT, in urgency order. One count query per
  // candidate event (head:true — no rows transferred), which is cheap next to
  // the per-recipient send work it is protecting.
  const batch: typeof due = [];
  let budget = 0;
  for (const item of due.slice(0, MAX_EVENTS_PER_RUN)) {
    const event = byId.get(item.eventId);
    if (!event) continue;

    const { count, error: countErr } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', item.eventId)
      .eq('status', item.purpose === 'reminder' ? 'registered' : 'attended');

    if (countErr) {
      // Unknown size. Take it rather than skip it — deferring an event because
      // a COUNT failed would silently drop mail, and the send itself is still
      // bounded by its own roster.
      console.error('[cron/dispatch] recipient count failed — taking the event anyway', {
        eventId: item.eventId,
        code: countErr.code,
      });
    }

    // Always take the first item, however big: an event larger than the whole
    // budget would otherwise be starved forever while smaller ones jump it.
    if (batch.length > 0 && budget + (count ?? 0) > MAX_RECIPIENTS_PER_RUN) break;

    batch.push(item);
    budget += count ?? 0;
  }

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
      // NOT `failed: 1`. That read as one recipient when the truth is that the
      // whole event was skipped — a 200-person roster rendered as "1 failed",
      // which radically under-reports the blast radius. No email_log rows were
      // written, so the next tick retries cleanly; what matters here is that
      // the number a human reads is not a lie.
      dispatched.push({
        eventId: item.eventId,
        purpose: item.purpose,
        ...zero('send threw — no recipients were processed for this event'),
      });
    }
  }

  // `ok` is DERIVED, never asserted. An external trigger or uptime monitor sees
  // the status code and this flag, not the per-event detail below — so a tick
  // where every send failed used to report success at the only layer anyone
  // watches. That is the signature defect of this repo (a control one layer
  // above where the work happens) at the response boundary, and Stage 8 is what
  // wires the consumer that would be misled.
  const trouble = dispatched.reduce(
    (n, d) => n + (d.error ? 1 : 0) + d.failed + d.gaveUp + d.stalled,
    0,
  );

  return NextResponse.json({
    ok: trouble === 0,
    // Roll-up so a trigger can alert without parsing the per-event array.
    needsAttention: trouble,
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
