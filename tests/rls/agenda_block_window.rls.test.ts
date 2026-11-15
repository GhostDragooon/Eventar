// Hard rule 8, layer 3: an agenda block sits inside its event's window (block.start >= event.start and
// block.end <= event.end, inclusive, the same rule as blockFitsEnvelope in the form and the Server Actions).
// Before 20261114120000 only the form and the action checked it, so a direct RPC or PostgREST write could place a
// block outside the event.
//
// The check is a DEFERRED constraint trigger, so one transaction can move the event window and its blocks together
// (update_event_with_blocks does the event first, then the blocks). Each probe runs in a transaction that is always
// rolled back; `set constraints all immediate` runs the deferred check at that point. Refusals are SQLSTATE 23514.
// Gated on RLS_TESTS; local stack only.
import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import '../helpers/clients'; // module-load guard: refuses a non-local stack

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const H = 3_600_000;

async function inTx<T>(fn: (c: Client, eventId: string) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: LOCAL_DB });
  await c.connect();
  try {
    await c.query('begin');
    const t0 = Date.now() + 5 * 24 * H;
    const { rows } = await c.query(
      `insert into public.events (title, start_time, end_time, timezone, venue_name, city, country, latitude, longitude, organisation_id, created_by)
       values ('ZZ-WINDOW probe', $1, $2, 'Asia/Hong_Kong', 'V', 'HK', 'HK', 22.3, 114.2, '00000000-0000-0000-0000-000000000001',
               (select id from public.staff order by created_at limit 1))
       returning id`,
      [new Date(t0).toISOString(), new Date(t0 + 4 * H).toISOString()],
    );
    return await fn(c, rows[0].id as string);
  } finally {
    await c.query('rollback');
    await c.end();
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const addBlock = (c: Client, eventId: string, startMs: number, endMs: number) =>
  c.query(
    `insert into public.agenda_blocks (event_id, start_time, end_time, kind, title, display_order) values ($1, $2, $3, 'lecture', 'ZZ block', 0) returning id`,
    [eventId, iso(startMs), iso(endMs)],
  );
async function refused(c: Client, run: () => Promise<unknown>): Promise<string | undefined> {
  await c.query('savepoint sp');
  try {
    await run();
    await c.query('set constraints all immediate');
    await c.query('release savepoint sp');
    return undefined;
  } catch (e) {
    await c.query('rollback to savepoint sp');
    return (e as { code?: string }).code;
  }
}

describe.skipIf(!process.env.RLS_TESTS)('agenda blocks sit inside the event window (DB layer)', () => {
  it('a block inside the window is accepted, bounds inclusive', async () => {
    await inTx(async (c, id) => {
      const t0 = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time as Date;
      const s = t0.getTime();
      expect(await refused(c, () => addBlock(c, id, s, s + 4 * H))).toBeUndefined();
    });
  });

  it('a block that ends after the event, or starts before it, is refused with 23514', async () => {
    await inTx(async (c, id) => {
      const s = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time.getTime() as number;
      expect(await refused(c, () => addBlock(c, id, s + 3 * H, s + 5 * H)), 'ends late').toBe('23514');
      expect(await refused(c, () => addBlock(c, id, s - H, s + H)), 'starts early').toBe('23514');
    });
  });

  // A STABLE trigger function does not see the rows its own statement wrote, so with the constraint set IMMEDIATE
  // before the write the check passed a bad block (dev-lens M1). The other cases set IMMEDIATE only after the write.
  it('a bad block is refused when the constraint is IMMEDIATE before the write', async () => {
    await inTx(async (c, id) => {
      const s = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time.getTime() as number;
      await c.query('set constraints all immediate');
      expect(await refused(c, () => addBlock(c, id, s - H, s + H))).toBe('23514');
    });
  });

  it('moving a block outside the window is refused; moving it inside is accepted', async () => {
    await inTx(async (c, id) => {
      const s = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time.getTime() as number;
      const { rows } = await addBlock(c, id, s + H, s + 2 * H);
      const bid = rows[0].id as string;
      expect(await refused(c, () => c.query('update public.agenda_blocks set end_time = $2 where id = $1', [bid, iso(s + 9 * H)]))).toBe('23514');
      expect(await refused(c, () => c.query('update public.agenda_blocks set end_time = $2 where id = $1', [bid, iso(s + 3 * H)]))).toBeUndefined();
    });
  });

  it('shrinking the event window past an existing block is refused', async () => {
    await inTx(async (c, id) => {
      const s = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time.getTime() as number;
      await addBlock(c, id, s + 2 * H, s + 3 * H);
      expect(await refused(c, () => c.query('update public.events set end_time = $2 where id = $1', [id, iso(s + 2 * H)]))).toBe('23514');
    });
  });

  it('moving the event and its block together in one transaction is accepted (the check is deferred)', async () => {
    await inTx(async (c, id) => {
      const s = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time.getTime() as number;
      await addBlock(c, id, s + H, s + 2 * H);
      const shift = 10 * 24 * H;
      expect(
        await refused(c, async () => {
          await c.query('update public.events set start_time = $2, end_time = $3 where id = $1', [id, iso(s + shift), iso(s + shift + 4 * H)]);
          await c.query('update public.agenda_blocks set start_time = start_time + $2::interval, end_time = end_time + $2::interval where event_id = $1', [id, `${shift / 1000} seconds`]);
        }),
      ).toBeUndefined();
    });
  });

  it('a legacy block already outside the window does not block an unrelated edit (title, order, event title)', async () => {
    await inTx(async (c, id) => {
      const s = (await c.query('select start_time from public.events where id = $1', [id])).rows[0].start_time.getTime() as number;
      // Plant the legacy row with the check off, as it exists on databases that predate the rule. The replica role
      // skips user triggers for this transaction only; `alter table … disable trigger` would lock the whole table.
      await c.query('set local session_replication_role = replica');
      const { rows } = await addBlock(c, id, s - 2 * H, s - H);
      await c.query('set local session_replication_role = origin');
      expect(await refused(c, () => c.query(`update public.agenda_blocks set title = 'renamed', display_order = 3 where id = $1`, [rows[0].id]))).toBeUndefined();
      expect(await refused(c, () => c.query(`update public.events set title = 'ZZ renamed' where id = $1`, [id]))).toBeUndefined();
    });
  });
});
