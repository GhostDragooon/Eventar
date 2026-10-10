'use server';

// Next 16: 'use server' files may export ONLY async functions. Schemas, types,
// and constants live in ./schema. See app/(public)/events/[id]/actions.ts for
// the same split.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canPublishEvents, canSetAccreditation, requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { tzFromCoords } from '@/lib/tz';
import {
  blockInputSchema,
  eventInputSchema,
  type BlockInput,
} from './schema';

// Hoisted so it's not re-allocated on every Server Action call.
const blockArraySchema = z.array(blockInputSchema);

function zodErrors(issues: z.ZodIssue[], prefix = ''): string {
  return issues.map(i => `${prefix}${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * Returns true when the block's window is fully contained within the event envelope.
 * Uses inclusive bounds on both ends (block.start >= event.start AND block.end <= event.end).
 * This is intentionally different from findParallelBlockIds which uses strict < for overlap
 * detection (where adjacent blocks are NOT considered parallel).
 */
function blockFitsEnvelope(block: BlockInput, event: { start_time: string; end_time: string }): boolean {
  return new Date(block.start_time) >= new Date(event.start_time)
      && new Date(block.end_time)   <= new Date(event.end_time);
}

// Status the caller is asking for. Defaults to 'draft' so older call sites
// (and the test suite) keep working unchanged. Validated against an explicit
// enum so an unknown value can never reach the RPC.
//
// 'published' does NOT land in the insert: create_event_with_blocks creates the
// row as a draft and then calls publish_event() (SECURITY DEFINER, audited,
// sets published_at) in the same transaction — migration 20260802182411. Before
// that, this action wrote status='published' straight into the row, leaving
// published_at NULL and no event_published row in the audit chain.
const statusSchema = z.enum(['draft', 'published']).default('draft');

// Optional CPD accreditation from the create form. Both-or-neither mirrors
// set_event_cpd_config's own rule: a body with no hours (or hours with no body)
// is a half-configured event that award_attendance_credit silently skips, so
// the organiser would believe it was accredited and no credit would ever post.
const cpdSchema = z
  .object({
    bodyId: z.string().uuid().nullable().optional(),
    hours: z.number().positive().max(24).nullable().optional(),
  })
  .refine((d) => !d.bodyId === !d.hours, {
    message: 'Accrediting body and CPD hours must be set together',
  })
  .optional();

const PUBLISH_REFUSED =
  "Your role can't publish events. Nothing was saved. Save a draft, then ask an organiser admin to publish it.";

const ACCREDITATION_REFUSED =
  "Your role can't set accreditation. Nothing was saved. Remove the accreditation to continue, or ask an organiser admin to add it after you save.";
const CPD_HOURS_INVALID = 'CPD hours must be more than 0 and at most 24.';
const CPD_PAIR_INVALID = 'Choose the accrediting body and enter its CPD hours together, or leave both empty.';

// createEvent returns { error } on validation/DB failure, or redirects on
// success (never returns). `eventId` is present only in the one partial-success
// case: the event saved but its accreditation did not, so the caller can link
// the user straight to the event instead of stranding them.
export async function createEvent(input: {
  event: unknown;
  blocks: unknown;
  status?: unknown;
  cpd?: unknown;
}): Promise<{ error: string; eventId?: string }> {
  const staff = await requireStaff();

  const statusParse = statusSchema.safeParse(input.status);
  if (!statusParse.success) {
    return { error: `status: ${statusParse.error.issues[0]?.message ?? 'invalid'}` };
  }

  // A role that may not publish never reaches the database with a publish
  // request: say so plainly and save nothing. Three layers, as everywhere: the
  // form hides the control, this check explains, and publish_event() is the
  // authority that refuses regardless.
  if (statusParse.data === 'published' && !canPublishEvents(staff.role)) {
    return { error: PUBLISH_REFUSED };
  }

  // Same shape for accreditation: set_event_cpd_config refuses organiser_member,
  // body_admin and auditor, and it runs AFTER the event exists. Without this a
  // member who chose a body and pressed Publish got a LIVE event and an error, and
  // the re-enabled buttons made a second live event one click away (dev-lens
  // 2026-10-02). Refused here, before anything is written.
  const cpd = cpdSchema.safeParse(input.cpd);
  if (!cpd.success) {
    // The form checks this before it submits, so this is a stale or hand-built payload.
    return { error: cpd.error.issues.some((i) => i.path[0] === 'hours') ? CPD_HOURS_INVALID : CPD_PAIR_INVALID };
  }
  if (cpd.data?.bodyId && !canSetAccreditation(staff.role)) {
    return { error: ACCREDITATION_REFUSED };
  }

  const eventParse = eventInputSchema.safeParse(input.event);
  if (!eventParse.success) {
    return { error: zodErrors(eventParse.error.issues) };
  }
  const blocksRaw = Array.isArray(input.blocks) ? input.blocks : [];
  const blockParse = blockArraySchema.safeParse(blocksRaw);
  if (!blockParse.success) {
    return { error: zodErrors(blockParse.error.issues, 'block ') };
  }

  // Envelope-fit validation
  const outOfEnvelope = blockParse.data.find(b => !blockFitsEnvelope(b, eventParse.data));
  if (outOfEnvelope) {
    return { error: `Block "${outOfEnvelope.title}" runs outside the event's start/end window` };
  }

  const timezone = tzFromCoords(eventParse.data.latitude, eventParse.data.longitude);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('create_event_with_blocks', {
    // created_by is only honoured by the RPC for the service-role executor
    // (review mode / session-less contexts); JWT sessions derive it from
    // app_private.current_staff_id() and ignore this key.
    event_input:  { ...eventParse.data, timezone, status: statusParse.data, created_by: staff.id },
    blocks_input: blockParse.data,
  });

  // A publish the database refuses raises 42501 inside publish_event and rolls
  // the whole create back, so nothing is saved: say that rather than leaking
  // the raw require_active_staff message. Since 20261002000000 the nested
  // publish carries the creator, so for a publishing role this is no longer
  // reachable except if the role changed after the page loaded; it used to
  // fire under review mode for EVERY role and the copy blamed "this account".
  if (error) {
    if (statusParse.data === 'published' && error.code === '42501') {
      return { error: PUBLISH_REFUSED };
    }
    return { error: error.message };
  }
  if (!data || typeof data !== 'string') return { error: 'no id returned' };

  // CPD accreditation, if the organiser set it on the create form. Routed
  // through set_event_cpd_config — the SAME audited definer the /edit and
  // /details cards use — and deliberately NOT by widening
  // create_event_with_blocks' column whitelist: accrediting_body_id and
  // cpd_hours were revoked from every app role in July precisely so an
  // organiser cannot write them directly, and INSERT was closed too in
  // 20260802182411 after a review found a new event could be POSTed
  // pre-accredited.
  //
  // Sequenced after the create rather than inside it: the definer needs the
  // event to exist and to be owned by the caller. The event is therefore
  // created even if accreditation is refused — which is the right failure
  // shape (the organiser keeps their work) as long as we SAY SO rather than
  // redirecting as though everything succeeded (rule 12).
  if (cpd.success && cpd.data && cpd.data.bodyId) {
    // p_actor_override: inert for a real session, makes this callable under
    // review mode too — see 20260814020000.
    const { error: cpdErr } = await supabase.rpc('set_event_cpd_config', {
      p_event_id: data,
      p_body_id: cpd.data.bodyId,
      p_cpd_hours: cpd.data.hours,
      p_actor_override: staff.id,
    });
    if (cpdErr) {
      const bodyRefused = cpdErr.code === '42501' && cpdErr.details === 'not_authorised_for_body';
      const roleRefused = cpdErr.code === '42501' && !bodyRefused;
      const reason = bodyRefused
        ? 'your organisation isn’t authorised by that accrediting body'
        : roleRefused
          ? 'your role can’t set accreditation'
          : cpdErr.code === '23514'
            ? 'CPD hours must be between 0 and 24'
            : 'the accreditation could not be set';
      const next = roleRefused
        ? 'Ask an organiser admin to add it from the event page.'
        : 'Open it and set the accreditation there.';
      if (!bodyRefused && !roleRefused && cpdErr.code !== '23514') {
        console.error('[events/new] accreditation not set', { code: cpdErr.code });
      }
      // Say what actually happened: with Publish pressed the event is LIVE.
      const done = statusParse.data === 'published' ? 'published' : 'saved';
      return { error: `The event was ${done}, but ${reason}. ${next}`, eventId: data };
    }
  }

  revalidatePath('/dashboard');
  redirect(`/events/${data}/edit`);
}
