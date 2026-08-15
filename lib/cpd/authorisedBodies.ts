import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AccreditingBodyOption } from '@/components/details/CpdAccreditationSection';

/**
 * The accrediting bodies an organisation may actually claim — active bodies
 * that ALSO hold an active row in the organisation↔body allow-list.
 *
 * Why this exists as one function and not two inline queries: the CPD card has
 * "one mutation surface, two homes" (/edit and /details), and the two pickers
 * drifting apart is precisely the bug this closes. Before DEFERRED 56 they
 * filtered on `status = 'active'` alone, so an organiser was offered every
 * active body and 7 of 9 failed at save — after they had chosen a body and
 * typed the hours. The DB gate shipped without its UI half.
 *
 * Uses the admin client deliberately. The allow-list's RLS policy is scoped to
 * the *caller's* organisation, but the gate inside set_event_cpd_config checks
 * the *event's* — identical for an owner, different for `eventar_staff` acting
 * on another tenant's event. Reading as admin against the event's organisation
 * makes the picker show exactly what the server will accept, for both.
 *
 * Returns `unavailable: true` only for a genuine lookup failure — distinct from
 * an empty list, which legitimately means "authorised for nothing yet" and
 * needs a completely different message (rule 12: the two must never be
 * collapsed, which is how an empty picker once read as "this deployment has no
 * accrediting bodies").
 */
export async function listAuthorisedBodies(
  organisationId: string,
): Promise<{ bodies: AccreditingBodyOption[]; unavailable: boolean }> {
  const admin = supabaseAdmin();

  const authRes = await admin
    .from('organisation_body_authorisations')
    .select('body_id')
    .eq('organisation_id', organisationId)
    .eq('status', 'active');

  if (authRes.error) {
    console.error('[cpd] authorisation lookup failed', { code: authRes.error.code });
    return { bodies: [], unavailable: true };
  }

  const bodyIds = (authRes.data ?? []).map((r) => r.body_id as string);
  // No authorisations at all: skip the second round trip. An empty `.in()` list
  // is not a valid PostgREST filter, so this is correctness, not just economy.
  if (bodyIds.length === 0) return { bodies: [], unavailable: false };

  // Still filtered to active: an authorisation against a body that has since
  // moved to onboarding/retired is stale, and set_event_cpd_config refuses it.
  const bodiesRes = await admin
    .from('accrediting_bodies')
    .select('id, full_name, short_name, cycle_config')
    .eq('status', 'active')
    .in('id', bodyIds)
    .order('short_name');

  if (bodiesRes.error) {
    console.error('[cpd] accrediting_bodies read failed', { code: bodiesRes.error.code });
    return { bodies: [], unavailable: true };
  }

  return { bodies: (bodiesRes.data ?? []) as AccreditingBodyOption[], unavailable: false };
}
