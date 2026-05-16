'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { tzFromCoords } from '@/lib/tz';

export const KINDS = [
  'workshop','seminar','webinar','scientific_program',
  'panel','roundtable','keynote','other',
  'break','transition',
] as const;

const topicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  speaker_name: z.string().trim().min(1).max(100),
  speaker_credential: z.string().trim().max(120).optional().default(''),
  speaker_affiliation: z.string().trim().max(120).optional().default(''),
});

export const blockInputSchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(200),
  host: z.string().trim().max(120).optional().default(''),
  topics: z.array(topicSchema).default([]),
  notes: z.string().max(2000).optional().default(''),
  display_order: z.number().int().nonnegative().default(0),
})
.refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'Block end must be after start', path: ['end_time'],
})
.refine(d => !(d.kind === 'break' || d.kind === 'transition') || d.topics.length === 0, {
  message: 'Break/transition blocks must not have topics', path: ['topics'],
});

// Hoisted so it's not re-allocated on every Server Action call.
const blockArraySchema = z.array(blockInputSchema);

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Event name required').max(200),
  topic: z.string().trim().max(80).optional().default(''),
  description: z.string().max(4000).optional().default(''),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  venue_name: z.string().trim().min(1, 'Pick a venue from the dropdown').max(200),
  venue_address: z.string().trim().max(300).optional().default(''),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional().default(''),
  country: z.string().trim().min(1).max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  max_attendees: z.coerce.number().int().positive().optional(),
})
.refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time', path: ['end_time'],
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type BlockInput = z.infer<typeof blockInputSchema>;

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

// createEvent returns { error } on validation/DB failure, or redirects on success (never returns).
export async function createEvent(input: {
  event: unknown;
  blocks: unknown;
}): Promise<{ error: string }> {
  await requireStaff();

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
    event_input:  { ...eventParse.data, timezone, status: 'draft' },
    blocks_input: blockParse.data,
  });

  if (error) return { error: error.message };
  if (!data || typeof data !== 'string') return { error: 'no id returned' };

  revalidatePath('/dashboard');
  redirect(`/events/${data}/edit`);
}
