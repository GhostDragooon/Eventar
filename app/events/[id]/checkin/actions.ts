'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { isValidRegistrationCode } from '@/lib/registrationCode';

/**
 * Mark a registrant as attended by their registration_code.
 *
 * Three-layer auth: middleware (proxy.ts) → requireStaff() → RLS via
 * supabaseServer(). The `registrations_organizer_update_own` policy gates
 * the UPDATE to the event owner only. Non-owners (managers, other
 * organisers) hit zero rows affected, distinguished from "code doesn't
 * exist" by the fallback lookup — which is ALSO RLS-gated, so non-owners
 * get the generic "Code not recognised" rather than confirmation that
 * the code exists on someone else's event. Info-hiding by design.
 *
 * REVERSES Q4 (2026-05-22 design) — that decision used supabaseAdmin() to
 * enable cross-owner check-in by managers. Per the 2026-06-02 access
 * policy refinement, check-in is owner-exclusive and managers are
 * strictly view-only. Multi-event check-in must be solved by
 * organiser-per-tablet, not by elevating manager privileges.
 *
 * Idempotent via WHERE status != 'attended': a second writer for the
 * same code returns { error: 'Already attended at ...' } rather than
 * silently re-stamping check_in_at (CLAUDE.md rule 12).
 */
export async function markAttended(
  code: string,
  method: 'qr' | 'manual',
): Promise<
  | { ok: true; registration: { id: string; full_name: string; event_id: string; event_title: string } }
  | { error: string; alreadyAttendedAt?: string }
> {
  await requireStaff();
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const supabase = await supabaseServer();

  const { data: updated, error: updateErr } = await supabase
    .from('registrations')
    .update({
      status: 'attended',
      check_in_at: new Date().toISOString(),
      check_in_method: method,
    })
    .eq('registration_code', code)
    .neq('status', 'attended')
    .select('id, full_name, event_id')
    .maybeSingle();
  if (updateErr) throw updateErr;

  if (!updated) {
    // RLS-gated lookup: non-owners (whose UPDATE returned 0 rows because the
    // registration belongs to an event they don't own) get `existing = null`
    // here too — so they see "Code not recognised" without learning whether
    // the code is valid. Owners on their own event get the truthful
    // "Already attended" branch.
    const { data: existing, error: lookupErr } = await supabase
      .from('registrations')
      .select('id, full_name, event_id, check_in_at')
      .eq('registration_code', code)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!existing) return { error: 'Code not recognised.' };
    // Return raw ISO; client formats with eventTimezone (action stays
    // timezone-agnostic — formatting belongs to the UI layer).
    return {
      error: 'Already attended.',
      alreadyAttendedAt: existing.check_in_at ?? undefined,
    };
  }

  const { data: event, error: evtErr } = await supabase
    .from('events')
    .select('title')
    .eq('id', updated.event_id)
    .maybeSingle();
  if (evtErr) throw evtErr;

  revalidatePath(`/events/${updated.event_id}/checkin`);
  return {
    ok: true,
    registration: {
      id: updated.id,
      full_name: updated.full_name,
      event_id: updated.event_id,
      event_title: event?.title ?? '',
    },
  };
}
