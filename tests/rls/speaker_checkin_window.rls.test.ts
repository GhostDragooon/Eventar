// F1 (MVP walk r3/r4): a speaker check-in only lands inside the event's check-in window, at the database.
// Before 20261121100000 only the Server Action (toggleSpeakerCheckin) refused: any authenticated member of the
// organisation could INSERT or UPDATE a speaker_checkins row through PostgREST 5 hours before the window opened.
//
// Window = [start - 60 min, end], the same as mark_attended and computeLifecycle. The gate applies to the API
// roles (authenticated, anon). service_role and the superuser keep writing at any time (fixtures, erasure).
// Every probe runs in a transaction that is always rolled back. Gated on RLS_TESTS; local stack only.
import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import '../helpers/clients'; // module-load guard: refuses a non-local stack

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const MIN = 60_000;

type Fixture = { eventId: string; staffId: string; uid: string; email: string };

async function inTx<T>(startOffsetMin: number, endOffsetMin: number, fn: (c: Client, f: Fixture) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: LOCAL_DB });
  await c.connect();
  try {
    await c.query('begin');
    // A throwaway organiser_admin and its confirmed auth account (app_private.auth_email() needs both; see role_rights_q51).
    const email = `zz-spkwin-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const staff = (
      await c.query(
        `insert into public.staff (email, full_name, role, status, organisation_id)
         values ($1, 'ZZ spkwin', 'organiser_admin', 'active', '00000000-0000-0000-0000-000000000001') returning id`,
        [email],
      )
    ).rows[0] as { id: string };
    const uid = (await c.query('select gen_random_uuid() as u')).rows[0].u as string;
    await c.query(
      `insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id)
       values ($1, $2, now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')`,
      [uid, email],
    );
    const now = Date.now();
    const ev = (
      await c.query(
        `insert into public.events (title, start_time, end_time, timezone, venue_name, city, country, latitude, longitude, organisation_id, created_by, status)
         values ('ZZ-SPKWIN probe', $1, $2, 'Asia/Hong_Kong', 'V', 'HK', 'HK', 22.3, 114.2, '00000000-0000-0000-0000-000000000001', $3, 'published')
         returning id`,
        [new Date(now + startOffsetMin * MIN).toISOString(), new Date(now + endOffsetMin * MIN).toISOString(), staff.id],
      )
    ).rows[0] as { id: string };
    return await fn(c, { eventId: ev.id, staffId: staff.id, uid, email });
  } finally {
    await c.query('rollback');
    await c.end();
  }
}

async function asStaff(c: Client, f: Fixture) {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ role: 'authenticated', email: f.email, sub: f.uid }),
  ]);
  await c.query('set local role authenticated');
}

async function attempt(c: Client, run: () => Promise<unknown>): Promise<string | undefined> {
  await c.query('savepoint sp');
  try {
    await run();
    await c.query('release savepoint sp');
    return undefined;
  } catch (e) {
    await c.query('rollback to savepoint sp');
    return (e as { code?: string; message?: string }).message;
  }
}

const insertSpeaker = (c: Client, f: Fixture, name: string) =>
  c.query('insert into public.speaker_checkins (event_id, speaker_name, checked_in_at, updated_by) values ($1, $2, now(), $3)', [
    f.eventId,
    name,
    f.staffId,
  ]);

describe.skipIf(!process.env.RLS_TESTS)('speaker check-in only inside the window (DB layer)', () => {
  it('refuses an authenticated INSERT before the window opens', async () => {
    await inTx(5 * 60, 8 * 60, async (c, f) => {
      await asStaff(c, f);
      const msg = await attempt(c, () => insertSpeaker(c, f, 'Early Speaker'));
      expect(msg).toMatch(/check_in_not_open_yet/);
    });
  });

  it('refuses an authenticated INSERT after the event ended', async () => {
    await inTx(-5 * 60, -60, async (c, f) => {
      await asStaff(c, f);
      const msg = await attempt(c, () => insertSpeaker(c, f, 'Late Speaker'));
      expect(msg).toMatch(/check_in_closed/);
    });
  });

  it('accepts an authenticated INSERT inside the window, and from 60 minutes before the start', async () => {
    await inTx(30, 3 * 60, async (c, f) => {
      await asStaff(c, f);
      expect(await attempt(c, () => insertSpeaker(c, f, 'Live Speaker'))).toBeUndefined();
    });
    await inTx(59, 3 * 60, async (c, f) => {
      await asStaff(c, f);
      expect(await attempt(c, () => insertSpeaker(c, f, 'Pre-open Speaker'))).toBeUndefined();
    });
  });

  it('refuses an authenticated UPDATE (tick or clear) outside the window', async () => {
    await inTx(5 * 60, 8 * 60, async (c, f) => {
      await c.query(`insert into public.speaker_checkins (event_id, speaker_name) values ($1, 'Seeded')`, [f.eventId]); // superuser fixture
      await asStaff(c, f);
      const msg = await attempt(c, () =>
        c.query(`update public.speaker_checkins set checked_in_at = now() where event_id = $1`, [f.eventId]),
      );
      expect(msg).toMatch(/check_in_not_open_yet/);
    });
  });

  it('leaves the superuser path alone (fixtures, erasure)', async () => {
    await inTx(5 * 60, 8 * 60, async (c, f) => {
      expect(await attempt(c, () => insertSpeaker(c, f, 'Fixture Speaker'))).toBeUndefined();
    });
  });
});
