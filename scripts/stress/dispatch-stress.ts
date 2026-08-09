/**
 * Stress harness for the scheduler — /api/cron/dispatch.
 *
 * The dispatcher holds NO lock and keeps NO "already dispatched" state. Its
 * entire correctness under concurrency rests on one database object
 * (`email_log_dedup_idx`) plus Hard Rule 2 ordering. `tests/cron/` proves the
 * index in isolation with hand-written inserts; this drives the REAL HTTP
 * endpoint, through the real Server-Action-free send core, against a real
 * database, with real overlapping requests — which is the only way to catch a
 * defect that lives between those layers rather than inside one of them.
 *
 * Local stack only. Run against the dev server started by
 * scripts/demo/dev-local.sh, after seeding an event whose reminder window is
 * open (DEMO_START_OFFSET_MIN=30 pnpm exec tsx scripts/demo/seed-demo.ts).
 *
 *   pnpm exec tsx scripts/stress/dispatch-stress.ts
 *
 * Exits non-zero on any assertion failure so it can gate a run.
 */
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.STRESS_BASE_URL ?? 'http://localhost:3100';
const SECRET = process.env.CRON_SECRET ?? 'local-dev-cron-not-a-secret';
const WAVE = Number(process.env.STRESS_WAVE ?? 12);
const ROUNDS = Number(process.env.STRESS_ROUNDS ?? 3);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (eval "$(supabase status -o env ...)").');
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error(`Refusing to stress a non-local database: ${url}`);
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const failures: string[] = [];
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

async function dispatch(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/cron/dispatch`, {
    method: 'POST',
    headers: { 'x-cron-secret': SECRET },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function countLogs(purpose: string) {
  const { data, error } = await db
    .from('email_log')
    .select('event_id, registration_id, purpose, status')
    .eq('purpose', purpose);
  if (error) throw new Error(`countLogs: ${error.message}`);
  return data ?? [];
}

/**
 * The harness is only meaningful if something is actually DUE. A stale fixture
 * (the seed's clock offset ages out within hours) produces an all-green run
 * that proved nothing — this has wasted time three times, so fail loudly and
 * say exactly how to fix it rather than leaving one cryptic assertion.
 */
async function assertSomethingIsDue() {
  const { data, error } = await db
    .from('events')
    .select('id, title, status, start_time, end_time')
    .in('status', ['published', 'completed']);
  if (error) throw new Error(`precondition read failed: ${error.message}`);

  const now = Date.now();
  const due: string[] = [];
  for (const e of data ?? []) {
    const start = new Date(e.start_time as string).getTime();
    const end = new Date(e.end_time as string).getTime();
    const purpose = now >= start - 60 * 60_000 && now < start
      ? 'registered'
      : now >= end + 10 * 60_000 && now < end + 24 * 3_600_000
        ? 'attended'
        : null;
    if (!purpose) continue;

    // A window being open is NOT enough — the survey targets `attended` rows,
    // and a freshly seeded fixture has none, so the run would dispatch nothing
    // and every assertion would pass vacuously.
    const { count } = await db
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', e.id as string)
      .eq('status', purpose);
    if ((count ?? 0) > 0) due.push(`${e.title} (${purpose === 'registered' ? 'reminder' : 'survey'}, ${count})`);
  }

  if (due.length === 0) {
    console.error('\nPRECONDITION FAILED — no published event is inside a dispatch window.');
    console.error('Nothing can be dispatched, so this run would prove nothing.\n');
    console.error('Fix it with a fresh fixture whose reminder window is open:');
    console.error('  DEMO_START_OFFSET_MIN=30 pnpm exec tsx scripts/demo/seed-demo.ts');
    console.error('  (then publish it — the seed creates a DRAFT on purpose)\n');
    process.exit(1);
  }
  console.log(`  precondition: ${due.join(', ')}\n`);
}

async function main() {
  console.log(`\nOrchestrator stress — ${BASE}\n`);
  await assertSomethingIsDue();

  // 1. The gate holds under load before anything else is trusted.
  const bad = await Promise.all(
    Array.from({ length: WAVE }, () =>
      fetch(`${BASE}/api/cron/dispatch`, { method: 'POST', headers: { 'x-cron-secret': 'wrong' } }),
    ),
  );
  check('rejects every request with a bad secret', bad.every((r) => r.status === 401), `${bad.length} sent`);

  const noHeader = await fetch(`${BASE}/api/cron/dispatch`, { method: 'POST' });
  check('rejects a request with no secret at all', noHeader.status === 401 || noHeader.status === 503);

  // 2. Baseline: what the ledger holds before we start.
  const before = await countLogs('reminder');

  // 3. Overlapping ticks. This is the real test — the dispatcher has no lock,
  //    so N simultaneous requests all select the same due events and race to
  //    insert the same email_log rows.
  const t0 = Date.now();
  const waves: Array<{ status: number; body: Record<string, unknown> }> = [];
  for (let r = 0; r < ROUNDS; r++) {
    const results = await Promise.all(Array.from({ length: WAVE }, () => dispatch()));
    waves.push(...results);
  }
  const elapsed = Date.now() - t0;

  check('every concurrent tick returned 200', waves.every((w) => w.status === 200), `${waves.length} requests in ${elapsed}ms`);
  check('no tick returned an error body', waves.every((w) => !w.body.error), JSON.stringify(waves.find((w) => w.body.error)?.body ?? {}));

  // 4. The invariant that matters: one row per (event, registration, purpose),
  //    no matter how many ticks raced.
  const after = await countLogs('reminder');
  const seen = new Map<string, number>();
  for (const row of after) {
    const k = `${row.event_id}:${row.registration_id}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);

  check('no recipient has more than one reminder row', dupes.length === 0, dupes.length ? JSON.stringify(dupes.slice(0, 3)) : `${seen.size} recipients`);
  check('the run actually dispatched something', after.length > before.length, `${before.length} → ${after.length} rows`);

  // 5. Repeat ticks must be free: once every recipient has a row, further
  //    ticks report skips, never new sends.
  const settled = await dispatch();
  const dispatched = (settled.body.dispatched ?? []) as Array<Record<string, number>>;
  const newSends = dispatched.reduce((n, d) => n + (d.sent ?? 0) + (d.queued ?? 0), 0);
  check('a tick after everyone is handled sends nothing new', newSends === 0, `sent+queued=${newSends}`);

  const finalCount = (await countLogs('reminder')).length;
  check('the settling tick added no rows', finalCount === after.length, `${after.length} → ${finalCount}`);

  console.log(`\n${failures.length === 0 ? 'PASS' : `FAIL — ${failures.length}: ${failures.join(', ')}`}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
