'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { deriveSpeakerNames } from '@/lib/agenda';

const inputSchema = z.object({
  event_id: z.string().uuid(),
  // Mirrors the DB check constraint: trimmed (= btrim) and char_length
  // between 1 and 120.
  speaker_name: z.string().transform((v) => v.trim()).pipe(z.string().min(1).max(120)),
});

type ToggleResult =
  | { ok: true; checkedInAt: string | null }
  | { error: string };

/**
 * Toggle the check-in state of a speaker/host on the Team-Checkin page (G3).
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS via
 * supabaseServer(). Owner-only by RLS: the agenda_blocks read is gated by
 * `agenda_blocks_organizer_full` (+ manager read), and speaker_checkins
 * INSERT/UPDATE policies are owner-only — managers and non-owner organisers
 * hit zero rows / a policy error and get a structured error, never silent
 * success (Q18, CLAUDE.md rule 12).
 *
 * Speakers are NOT a table: the valid-name set is recomputed server-side from
 * the event's agenda blocks via deriveSpeakerNames (host + topic speakers,
 * deduped, no kind filter), so arbitrary names are rejected before any write.
 *
 * Toggle semantics: no row OR checked_in_at null → stamp now() + updated_by;
 * currently stamped → clear to null (updated_by still recorded).
 */
export async function toggleSpeakerCheckin(
  eventId: string,
  speakerName: string,
): Promise<ToggleResult> {
  const staff = await requireStaff();

  const parsed = inputSchema.safeParse({ event_id: eventId, speaker_name: speakerName });
  if (!parsed.success) return { error: 'Invalid speaker check-in request.' };
  const { event_id, speaker_name } = parsed.data;

  const supabase = await supabaseServer();

  // Server-side recompute of the valid speaker set. RLS-gated read: a
  // non-owner organiser sees zero blocks, so every name fails the membership
  // check — info-hiding identical to markAttended's "Code not recognised".
  const { data: blocks, error: blocksErr } = await supabase
    .from('agenda_blocks')
    .select('host, topics')
    .eq('event_id', event_id);
  // Unexpected DB errors THROW (Next logs them with a digest) — same
  // convention as markAttended in ./actions.ts. Structured returns are
  // reserved for expected cases: Zod rejection, non-agenda name, Q18
  // zero-row writes, and the 23505 insert race.
  if (blocksErr) throw blocksErr;

  const speakers = deriveSpeakerNames(blocks ?? []);
  if (!speakers.includes(speaker_name)) {
    return { error: 'That name is not a speaker on this event’s agenda.' };
  }

  const { data: existing, error: existingErr } = await supabase
    .from('speaker_checkins')
    .select('id, checked_in_at')
    .eq('event_id', event_id)
    .eq('speaker_name', speaker_name)
    .maybeSingle();
  if (existingErr) throw existingErr;

  let checkedInAt: string | null;

  if (!existing) {
    // First toggle for this speaker: create the row already checked in.
    checkedInAt = new Date().toISOString();
    const { data: inserted, error: insertErr } = await supabase
      .from('speaker_checkins')
      .insert({
        event_id,
        speaker_name,
        checked_in_at: checkedInAt,
        updated_by: staff.id,
      })
      .select('id')
      .maybeSingle();
    if (insertErr) {
      // 23505 = unique (event_id, speaker_name): another device created the
      // row between our read and this insert. Surface it; the refreshed page
      // shows the winning state. Fail visibly, never silently (rule 12).
      if (insertErr.code === '23505') {
        return { error: 'This speaker was just updated on another device — refresh and retry.' };
      }
      throw insertErr;
    }
    if (!inserted) {
      // Q18: RLS-filtered write affected zero rows (e.g. manager or non-owner
      // organiser) — structured error, never silent success.
      return { error: 'Check-in failed — event not found or not owned by you.' };
    }
  } else {
    // Toggle: null → stamp now; stamped → clear.
    checkedInAt = existing.checked_in_at ? null : new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('speaker_checkins')
      .update({ checked_in_at: checkedInAt, updated_by: staff.id })
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated) {
      // Q18 zero-rows guard, same as above.
      return { error: 'Check-in failed — event not found or not owned by you.' };
    }
  }

  // Checkin page renders the speakers card; details page shows live-ops state.
  revalidatePath(`/events/${event_id}/checkin`);
  revalidatePath(`/events/${event_id}/details`);
  return { ok: true, checkedInAt };
}
