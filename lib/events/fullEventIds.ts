import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Ids of the capped events that have reached their cap. Anon cannot read `registrations` (PII), so the
 * count comes via service-role, only for events that have a cap (an integer, not sensitive). Thrown, not
 * swallowed (rule 12): a failed count must not render a full event as open.
 * ponytail: one head-count per capped event, in parallel; move to one RPC if the callers pass past ~100.
 */
export async function fullEventIds(events: { id: string; max_attendees: number | null }[]): Promise<Set<string>> {
  const capped = events.filter((e) => e.max_attendees != null);
  const checks = await Promise.all(
    capped.map(async (e) => {
      const { count, error } = await supabaseAdmin().from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', e.id);
      if (error) throw error;
      return [e.id, (count ?? 0) >= (e.max_attendees as number)] as const;
    }),
  );
  return new Set(checks.filter(([, isFull]) => isFull).map(([id]) => id));
}
