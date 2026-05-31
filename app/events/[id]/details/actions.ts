'use server';

import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

const inputSchema = z.object({
  // datetime-local form input arrives as 'YYYY-MM-DDTHH:mm' (no seconds, no tz)
  // — accept that OR a full ISO string. Empty/null clears the column.
  registration_close_at: z
    .union([z.string().min(1), z.literal(''), z.null()])
    .transform((v) => (v === '' || v == null ? null : v)),
});

type UpdateResult = { error?: string };

export async function updateRegistrationClose(
  eventId: string,
  registrationCloseAt: string | null,
): Promise<UpdateResult> {
  await requireStaff();

  const parsed = inputSchema.safeParse({ registration_close_at: registrationCloseAt });
  if (!parsed.success) {
    return { error: 'Invalid registration close timestamp.' };
  }
  const next = parsed.data.registration_close_at;

  let parsedDate: Date | null = null;
  if (next != null) {
    parsedDate = new Date(next);
    if (isNaN(parsedDate.getTime())) {
      return { error: 'Invalid registration close timestamp.' };
    }
  }

  const supabase = await supabaseServer();

  const { data: event, error: readError } = await supabase
    .from('events')
    .select('id, start_time')
    .eq('id', eventId)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (!event) return { error: 'Event not found.' };

  if (parsedDate != null) {
    const startMs = new Date(event.start_time).getTime();
    if (parsedDate.getTime() >= startMs) {
      return { error: 'Registration close must be before event start.' };
    }
  }

  // .select('id') + .maybeSingle() lets us detect when the update affected 0
  // rows — which happens when RLS silently blocks (e.g. manager-role staff
  // trying to update an event they don't own). Without this check the action
  // would return success but the row would be unchanged. CLAUDE.md rule 12;
  // same pattern as publishEvent in /events/[id]/edit/actions.ts.
  const { data: updated, error: updateError } = await supabase
    .from('events')
    .update({ registration_close_at: parsedDate ? parsedDate.toISOString() : null })
    .eq('id', eventId)
    .select('id')
    .maybeSingle();

  if (updateError) return { error: updateError.message };
  if (!updated) return { error: 'Update failed — event not found or not owned by you.' };
  return {};
}
