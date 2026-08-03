'use server';

// Next 16: 'use server' files may export ONLY async functions. Schemas, types,
// and constants live in ./schema. See app/(public)/events/[id]/actions.ts for
// the same split.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
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

// createEvent returns { error } on validation/DB failure, or redirects on success (never returns).
export async function createEvent(input: {
  event: unknown;
  blocks: unknown;
  status?: unknown;
}): Promise<{ error: string }> {
  const staff = await requireStaff();

  const statusParse = statusSchema.safeParse(input.status);
  if (!statusParse.success) {
    return { error: `status: ${statusParse.error.issues[0]?.message ?? 'invalid'}` };
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

  // A publish that the caller isn't allowed to make raises 42501 inside
  // publish_event and rolls the whole create back — nothing is saved, so say
  // that rather than leaking the raw require_active_staff message. Same
  // treatment publishEvent gives the identical gate (edit/actions.ts).
  if (error) {
    if (statusParse.data === 'published' && error.code === '42501') {
      return { error: 'Cannot publish: this account is not allowed to publish events. Nothing was saved — use "Save as draft".' };
    }
    return { error: error.message };
  }
  if (!data || typeof data !== 'string') return { error: 'no id returned' };

  revalidatePath('/dashboard');
  redirect(`/events/${data}/edit`);
}
