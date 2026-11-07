'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff, canCheckIn, canWriteEvent, NotAuthorizedError } from '@/lib/auth';
import { CHECKIN_ROLE_MESSAGE, NOT_EVENT_WRITER, checkInGateMessage, computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { supabaseServer } from '@/lib/supabase/server';
import { deriveSpeakerNames } from '@/lib/agenda';

const inputSchema = z.object({
  event_id: z.string().uuid(),
  // Mirrors the DB check constraint: trimmed (= btrim) and char_length
  // between 1 and 120.
  speaker_name: z.string().transform((v) => v.trim()).pipe(z.string().min(1).max(120)),
});

// 42501 = the speaker_checkins policy refused (another organisation's staff who know a published speaker name).
const NO_ACCESS = 'You do not have access to this event.';

// Same sentence markAttended gives (./actions.ts keeps its copy private: a 'use server' file cannot export a constant
// or a helper without publishing it as an action). A server-side sign-out is a message, not a throw that freezes the card.
const SIGNED_OUT = "You've been signed out. This check-in was not saved. Log in again to continue.";
const NOT_FOUND = 'Check-in failed — event not found or not in your organisation.';

type ToggleResult =
  | { ok: true; checkedInAt: string | null }
  | { error: string };

/**
 * Toggle the check-in state of a speaker/host on the Team-Checkin page (G3).
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS via
 * supabaseServer(). Scoped by RLS to the event's organisation: the agenda_blocks
 * read and the speaker_checkins INSERT/UPDATE policies are organisation-member
 * policies — staff of another organisation hit zero rows / a policy error and
 * get a structured error, never silent success (Q18, CLAUDE.md rule 12).
 *
 * Speakers are NOT a table: the valid-name set is recomputed server-side from
 * the event's agenda blocks via deriveSpeakerNames (host + topic speakers,
 * deduped, no kind filter), so arbitrary names are rejected before any write.
 *
 * Event state and window: a deleted event, and any event outside [start - CHECKIN_OPEN_MINUTES, end] (draft,
 * cancelled, not open yet, ended), is refused with the same wording as the rest of the desk, before any speaker read or
 * write. Same window as attendees (Ivan 2026-11-04, Decide 2): the clock decides, via computeLifecycle, as walk-in does.
 * Clearing a tick is refused outside the window too. The gate is app-layer only (the speaker_checkins policies do not
 * check the clock), and a multi-occurrence event uses its whole span, not each occurrence's own window.
 *
 * Role: the desk tells body_admin and auditor it is read-only, so this refuses them with the same sentence BEFORE any
 * read or write (canCheckIn, the helper mark_attended's gate mirrors).
 *
 * Toggle semantics: no row OR checked_in_at null → stamp now() + updated_by;
 * currently stamped → clear to null (updated_by still recorded).
 */
export async function toggleSpeakerCheckin(
  eventId: string,
  speakerName: string,
): Promise<ToggleResult> {
  const supabase = await supabaseServer();
  let staff;
  try {
    staff = await requireStaff(supabase);
  } catch (e) {
    if (e instanceof NotAuthorizedError) return { error: SIGNED_OUT };
    throw e;
  }
  if (!canCheckIn(staff.role)) return { error: CHECKIN_ROLE_MESSAGE };

  const parsed = inputSchema.safeParse({ event_id: eventId, speaker_name: speakerName });
  if (!parsed.success) return { error: 'Invalid speaker check-in request.' };
  const { event_id, speaker_name } = parsed.data;

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('status, deleted_at, start_time, end_time, registration_close_at, registration_open_at, organisation_id, created_by')
    .eq('id', event_id)
    .maybeSingle();
  if (eventErr) throw eventErr;
  if (!event) return { error: NOT_FOUND };
  if (!canWriteEvent(staff, event)) return { error: NOT_EVENT_WRITER };
  if (event.deleted_at) return { error: 'This event was deleted. Check-in is closed.' };
  const closedMessage = checkInGateMessage(computeLifecycle(event as EventLifecycleRow, Date.now()));
  if (closedMessage) return { error: closedMessage };

  // Server-side recompute of the valid speaker set. RLS-gated read: a
  // staff member of another organisation sees zero blocks, so every name fails the membership
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
      if (insertErr.code === '42501') return { error: NO_ACCESS };
      throw insertErr;
    }
    if (!inserted) {
      // Q18: RLS-filtered write affected zero rows (e.g. another organisation's
      // staff) — structured error, never silent success.
      return { error: NOT_FOUND };
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
    if (updateErr?.code === '42501') return { error: NO_ACCESS };
    if (updateErr) throw updateErr;
    if (!updated) {
      // Q18 zero-rows guard, same as above.
      return { error: NOT_FOUND };
    }
  }

  // Checkin page renders the speakers card; details page shows live-ops state.
  revalidatePath(`/events/${event_id}/checkin`);
  revalidatePath(`/events/${event_id}/details`);
  return { ok: true, checkedInAt };
}
