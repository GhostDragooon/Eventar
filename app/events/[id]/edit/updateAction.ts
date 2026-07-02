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

type UpdateResult = { ok: true } | { error: string };

/**
 * Full-replace update of an event + its agenda blocks, atomic via the
 * update_event_with_blocks RPC.
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS. The RPC is
 * security INVOKER and called through the user-scoped supabaseServer client,
 * so the events/agenda_blocks RLS policies apply inside it; on top of that it
 * RAISEs for unknown/unowned events instead of silently updating 0 rows, so
 * surfacing the rpc() error below already satisfies the Q18 silent-fail check
 * — no extra zero-row guard is needed.
 *
 * RPC contract (see migration 20260613010000 header): full-replace semantics —
 * absent nullable keys overwrite to NULL, so the complete Zod-parsed payload
 * is always sent. `status` is deliberately never sent: the edit form does not
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

  // Explicit in-code owner gate (Q19 — edit is owner-only). The RPC's own
  // owner check covers JWT sessions but is skipped for the service-role
  // executor (review mode / session-less contexts), so this check is the
  // authorization there — admin-after-auth pattern, same as 67d13fd.
  {
    const { data: row } = await supabaseAdmin()
      .from('events')
      .select('created_by')
      .eq('id', idParse.data)
      .maybeSingle();
    if (!row) return { error: 'Event not found.' };
    if (row.created_by !== staff.id) return { error: 'You are not the owner of this event.' };
  }

  const eventParse = eventInputSchema.safeParse(input.event);
  if (!eventParse.success) {
    return { error: zodErrors(eventParse.error.issues) };
  }

  // Deliberate delta vs createEvent (which coerces non-array blocks to []):
  // under full-replace semantics an empty array DELETES every agenda block,
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
  if (error) return { error: error.message };
  if (!data || typeof data !== 'string') return { error: 'no id returned' };

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/edit`);
  revalidatePath(`/events/${eventId}/details`);
  // Dashboard lists title/dates — same convention as publishEvent/createEvent.
  revalidatePath('/dashboard');
  return { ok: true };
}
