'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isValidRegistrationCode } from '@/lib/registrationCode';
import { surveyInputSchema, type SubmitSurveyResult } from './schema';

/**
 * Public survey submission via /survey?code=WK-XXXX. No auth — the code IS the
 * bearer token. Admin client because anon has no insert policy on
 * survey_responses. Server re-validates eligibility (event published + attended)
 * — never trusts the page render. One survey per registration is enforced by the
 * registration_id UNIQUE constraint; a unique-violation maps to a friendly
 * "already submitted" (fail-visible, idempotent).
 */
export async function submitSurvey(
  code: string,
  rawAnswers: unknown,
): Promise<SubmitSurveyResult> {
  if (!isValidRegistrationCode(code)) return { error: 'Invalid code format.' };

  const parsed = surveyInputSchema.safeParse(rawAnswers);
  if (!parsed.success) return { error: 'Some answers were invalid. Please review and resubmit.' };
  const answers = parsed.data;

  const admin = supabaseAdmin();

  // Re-check eligibility server-side.
  type RegRow = {
    id: string;
    status: string;
    events: { id: string; status: string } | Array<{ id: string; status: string }> | null;
  };
  const { data: reg, error: lookupErr } = (await admin
    .from('registrations')
    .select('id, status, events!inner(id, status)')
    .eq('registration_code', code)
    .maybeSingle()) as { data: RegRow | null; error: unknown };
  if (lookupErr) {
    // Fail visibly (Rule 12) — log server-side, return friendly copy so the form's
    // error-state branch renders instead of Next's default error UI.
    // Log only code + message: PG/PostgREST `details` can echo row data (PII), Rule 10.
    const e = lookupErr as { code?: string; message?: string };
    console.error('[submitSurvey] registration lookup failed', { code: e.code, message: e.message });
    return { error: "We couldn't save your feedback. Please check your connection and try again." };
  }
  if (!reg || !reg.events) return { error: 'This code is not recognised.' };
  const event = Array.isArray(reg.events) ? reg.events[0] : reg.events;
  if (!event || event.status !== 'published') return { error: 'This code is not recognised.' };
  if (reg.status !== 'attended') return { error: 'The survey opens once you have been checked in.' };

  const { error: insertErr } = await admin.from('survey_responses').insert({
    registration_id: reg.id,
    event_id: event.id,
    session_format: answers.session_format ?? null,
    key_highlights: answers.key_highlights ?? null,
    value_proposition: answers.value_proposition ?? null,
    expectations: answers.expectations ?? null,
    future_preferences: answers.future_preferences,
  });

  if (insertErr) {
    // 23505 = unique_violation on registration_id → already submitted.
    if ((insertErr as { code?: string }).code === '23505') {
      return { error: "You've already submitted this survey." };
    }
    // Log only code + message (Rule 10) — PG error `details` can echo row data.
    const e = insertErr as { code?: string; message?: string };
    console.error('[submitSurvey] insert failed', { code: e.code, message: e.message });
    return { error: "We couldn't save your feedback. Please check your connection and try again." };
  }

  revalidatePath('/survey');
  return { ok: true };
}
