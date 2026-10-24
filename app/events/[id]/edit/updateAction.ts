'use server';

// Task D.2 (2026-06-11 redesign): updateEvent wired to the
// update_event_with_blocks RPC (migration 20260613010000). Lives in its own
// file beside actions.ts per the checkin/speakerActions.ts precedent — a
// feature action with a colocated test, not mixed into the live-ops actions.
//
// Next 16: 'use server' files may export ONLY async functions, so the Zod
// schemas are imported from app/events/new/schema.ts (DRY) and the two tiny
// helpers below are local copies of the ones in app/events/new/actions.ts.
// Moving them is out of scope for D.2 (rule 3 — surgical changes); when a
// third caller appears, lift them into app/events/new/schema.ts (not a
// 'use server' file, so it can export sync helpers).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { tzFromCoords } from '@/lib/tz';
import {
  blockInputSchema,
  eventInputSchema,
  type BlockInput,
} from '../../new/schema';

// Hoisted so they are not re-allocated on every Server Action call.
const blockArraySchema = z.array(blockInputSchema);
const eventIdSchema = z.string().uuid();

// Local copy of app/events/new/actions.ts::zodErrors (see header note).
function zodErrors(issues: z.ZodIssue[], prefix = ''): string {
  return issues.map(i => `${prefix}${i.path.join('.')}: ${i.message}`).join('; ');
}

// Local copy of app/events/new/actions.ts::blockFitsEnvelope (see header note).
function blockFitsEnvelope(block: BlockInput, event: { start_time: string; end_time: string }): boolean {
  return new Date(block.start_time) >= new Date(event.start_time)
      && new Date(block.end_time)   <= new Date(event.end_time);
}

// `blockIds` are the saved agenda blocks' ids in payload order, so the form can send them back on its next save.
type UpdateResult = { ok: true; blockIds: string[] } | { error: string };

const NOT_A_DRAFT = 'This event is no longer a draft, so its details cannot be edited yet. Your changes were not saved.';
const SURVEY_ANSWERS_PREFIX = 'block_has_survey_answers: ';

// The two refusals update_event_with_blocks raises on purpose (SQLSTATE 22023), as sentences an organiser can act on.
// Anything else keeps the database's own message.
function rpcErrorMessage(message: string): string {
  if (message.startsWith('event_not_draft: ')) return NOT_A_DRAFT;
  // A second tab removed a block this tab still holds: nothing was saved.
  if (/^update_event_with_blocks: block \S+ is not part of event /.test(message)) {
    return 'The agenda changed in another tab or window, so your changes were not saved. Reload this page and try again.';
  }
  if (message.startsWith(SURVEY_ANSWERS_PREFIX)) {
    return `The block "${message.slice(SURVEY_ANSWERS_PREFIX.length)}" has survey answers, so it cannot be removed. Nothing was saved.`;
  }
  return message;
}

/**
 * Update of an event + its agenda blocks, atomic via the update_event_with_blocks
 * RPC: the event row is replaced, and the blocks are upserted by id (a block with
 * an id is updated, one without is inserted, one left out is removed; a block a
 * survey answer points at cannot be removed).
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS. The RPC is
 * security INVOKER and called through the user-scoped supabaseServer client,
 * so the events/agenda_blocks RLS policies apply inside it; on top of that it
 * RAISEs for unknown/unowned events instead of silently updating 0 rows, so
 * surfacing the rpc() error below already satisfies the Q18 silent-fail check
 * — no extra zero-row guard is needed.
 *
 * RPC contract (migrations 20260613010000 and 20261024110000): the event row is
 * full-replace — absent nullable keys overwrite to NULL, so the complete Zod-parsed
 * payload is always sent. `status` is deliberately never sent: the edit form does not
 * manage lifecycle, and the RPC keeps the current value when the key is absent.
 *
 * Timezone is derived server-side from the submitted coordinates via
 * tzFromCoords (pure tz-lookup table, no I/O — same as the create action);
 * a client-sent timezone is never trusted, stale or otherwise.
 */
export async function updateEvent(
  eventId: string,
  input: { event: unknown; blocks: unknown },
): Promise<UpdateResult> {
  const staff = await requireStaff();

  const idParse = eventIdSchema.safeParse(eventId);
  if (!idParse.success) {
    return { error: 'Invalid event id.' };
  }

  // Explicit in-code organisation gate: any active staff of the event's organisation may edit a draft (the RPC checks
  // the same organisation, not the creator). The platform operator passes THIS gate for any organisation, but the RPC
  // refuses an operator from another organisation (no UPDATE policy lets them write; a clean 42501). The RPC's own
  // check covers JWT sessions but is skipped for the service-role executor (review mode / session-less
  // contexts), so this check is the authorization there — admin-after-auth pattern, same as 67d13fd.
  {
    const { data: row, error: rowErr } = await supabaseAdmin()
      .from('events')
      .select('organisation_id, status, deleted_at')
      .eq('id', idParse.data)
      .maybeSingle();
    if (rowErr) return { error: 'Could not verify ownership of this event. Please try again.' };
    // A soft-deleted event is gone for everyone (the public read path and the list already hide it).
    if (!row || row.deleted_at != null) return { error: 'Event not found.' };
    if (staff.role !== 'eventar_staff' && row.organisation_id !== staff.organisation_id) {
      return { error: 'You do not have access to this event.' };
    }
    // Only a draft can be edited here, whoever asks (the platform operator included): the screens already say
    // "Details cannot be edited after publishing yet", and the RPC would otherwise rewrite a published event
    // with no audit row. Checked after the organisation gate so a stranger learns nothing about the status.
    // Lifts with the audited post-publish edit (P9b); update_event_with_blocks takes the same rule in DB-04.
    if (row.status !== 'draft') {
      return { error: NOT_A_DRAFT };
    }
  }

  const eventParse = eventInputSchema.safeParse(input.event);
  if (!eventParse.success) {
    return { error: zodErrors(eventParse.error.issues) };
  }

  // Deliberate delta vs createEvent (which coerces non-array blocks to []):
  // an empty array removes every agenda block (the ones a survey answer points at refuse the save),
  // so silently coercing a malformed payload would be silent data loss
  // (rule 12). A real "no blocks" submission is an actual [] from the form.
  if (!Array.isArray(input.blocks)) {
    return { error: 'blocks must be an array' };
  }
  const blockParse = blockArraySchema.safeParse(input.blocks);
  if (!blockParse.success) {
    return { error: zodErrors(blockParse.error.issues, 'block ') };
  }

  // Envelope-fit validation, same rule as createEvent.
  const outOfEnvelope = blockParse.data.find(b => !blockFitsEnvelope(b, eventParse.data));
  if (outOfEnvelope) {
    return { error: `Block "${outOfEnvelope.title}" runs outside the event's start/end window` };
  }

  const timezone = tzFromCoords(eventParse.data.latitude, eventParse.data.longitude);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('update_event_with_blocks', {
    event_id_input: idParse.data,
    event_input:    { ...eventParse.data, timezone },
    blocks_input:   blockParse.data,
  });

  // Non-owner / not-visible events make the RPC RAISE; supabase surfaces that
  // here. Structured return, same shape as createEvent — never silent success.
  if (error) return { error: rpcErrorMessage(error.message) };
  if (!data || typeof data !== 'string') return { error: 'no id returned' };

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  revalidatePath(`/events/${eventId}/details`);
  // Dashboard lists title/dates — same convention as publishEvent/createEvent.
  revalidatePath('/dashboard');

  // The RPC returns the event id, not the block ids. display_order is the payload index, so reading the blocks back
  // in that order gives index i of the result = payload block i. A count that differs means the mapping would be
  // wrong, so refuse it: the save itself went through, which the message says.
  const { data: saved, error: readErr } = await supabase
    .from('agenda_blocks')
    .select('id')
    .eq('event_id', idParse.data)
    .order('display_order', { ascending: true });
  if (readErr || !saved || saved.length !== blockParse.data.length) {
    return { error: 'Your changes were saved, but the agenda could not be read back. Reload this page before saving again.' };
  }
  return { ok: true, blockIds: saved.map(r => r.id) };
}
