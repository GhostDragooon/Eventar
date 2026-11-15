// M7 (security audit 2026-11-04), capacity half: registerForEvent and the staff walk-in action each count the event's
// registrations and then insert, so N concurrent submits all read "one seat left" and all insert. The check is now
// also a database guard: a BEFORE INSERT trigger takes the event row lock, counts, and refuses with
// 'event_at_capacity' (SQLSTATE 23514), so concurrent inserts serialise on that lock.
//
// Same counting rule as the two actions (every registration row of the event counts, status included), so nothing
// the app allowed before is refused now except the overflow. Gated on RLS_TESTS; local stack only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, sqlSuperuserQuery } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const RUN = String(Date.now()).slice(-7);
const eventIds: string[] = [];
let creator: string;

async function makeEvent(maxAttendees: number | null): Promise<string> {
  const { data, error } = await admin
    .from('events')
    .insert({
      title: `ZZ-CAPACITY ${RUN}`,
      start_time: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      end_time: new Date(Date.now() + 5 * 86_400_000 + 3_600_000).toISOString(),
      timezone: 'Asia/Hong_Kong', created_by: creator, venue_name: 'V', city: 'HK', country: 'HK',
      latitude: 22.3, longitude: 114.2, status: 'published', organisation_id: DEFAULT_ORG,
      max_attendees: maxAttendees,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`event fixture: ${error?.message}`);
  eventIds.push(data.id as string);
  return data.id as string;
}

let seq = 0;
const register = (eventId: string, source: 'self_registration' | 'walk_in' = 'self_registration') => {
  const n = ++seq;
  return admin.from('registrations').insert({
    event_id: eventId, email: `cap-${RUN}-${n}@rls-test.invalid`, full_name: `Cap ${n}`,
    registration_code: (Number(RUN) * 100 + n).toString(36).toUpperCase().padStart(6, '0'), source,
  });
};

describe.skipIf(!process.env.RLS_TESTS)('registration capacity is a database guard (M7)', () => {
  beforeAll(async () => {
    const [{ id }] = await sqlSuperuserQuery<{ id: string }>('select id from public.staff order by created_at limit 1');
    creator = id;
  });

  afterAll(async () => {
    if (eventIds.length) {
      await mustDelete(admin.from('registrations').delete().in('event_id', eventIds), 'registrations fixture');
      await mustDelete(admin.from('events').delete().in('id', eventIds), 'events fixture');
    }
  }, 60_000);

  it('eight concurrent registrations on a one-seat event insert exactly one row; the rest are refused with 23514', async () => {
    const id = await makeEvent(1);
    const results = await Promise.all(Array.from({ length: 8 }, () => register(id)));
    const ok = results.filter((r) => !r.error).length;
    const refused = results.filter((r) => r.error);
    expect(ok, 'exactly one seat').toBe(1);
    expect(refused).toHaveLength(7);
    for (const r of refused) {
      expect(r.error?.code).toBe('23514');
      expect(r.error?.message).toMatch(/event_at_capacity/);
    }
    const { count } = await admin.from('registrations').select('id', { count: 'exact', head: true }).eq('event_id', id);
    expect(count).toBe(1);
  }, 60_000);

  it('fills to the limit, then refuses; a walk-in is held to the same limit as the staff action holds it', async () => {
    const id = await makeEvent(3);
    for (let i = 0; i < 3; i++) expect((await register(id)).error).toBeNull();
    const over = await register(id, 'walk_in');
    expect(over.error?.code).toBe('23514');
  }, 60_000);

  it('no limit (max_attendees null) never refuses', async () => {
    const id = await makeEvent(null);
    const results = await Promise.all(Array.from({ length: 5 }, () => register(id)));
    expect(results.filter((r) => r.error)).toHaveLength(0);
  }, 60_000);
});
