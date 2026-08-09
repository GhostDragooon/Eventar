/**
 * Backtest the email_log ledger semantics against the REAL database.
 *
 * Covers the three things unit tests mock away and therefore cannot prove:
 *   1. `origin` exists, defaults correctly, and is constrained.
 *   2. The dedup index still tells `failed` (retryable) from `sent`/`queued`
 *      (terminal) AFTER the origin migration.
 *   3. The retry budget counts scheduler failures only — a human's rescue
 *      attempts must not exhaust the automation's budget (dev-lens I-3).
 *
 * Local stack only. Cleans up everything it creates.
 *   pnpm exec tsx scripts/backtest/send-ledger.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!/localhost|127\.0\.0\.1/.test(url ?? '')) {
  console.error(`Refusing to run against a non-local database: ${url}`);
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let bad = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) bad++;
};

const ts = Date.now();
let eventId = '';
let staffId = '';
const regIds: string[] = [];

async function insertLog(registrationId: string, status: string, origin: string) {
  return db.from('email_log').insert({
    purpose: 'reminder',
    event_id: eventId,
    registration_id: registrationId,
    recipient_email: `bt-${registrationId}@local.invalid`,
    status,
    origin,
  });
}

async function main() {
  console.log('\nBacktest — email_log ledger semantics\n');

  const { data: staff } = await db
    .from('staff')
    .insert({ email: `bt-ledger-${ts}@local.invalid`, role: 'eventar_staff' })
    .select('id')
    .single();
  staffId = staff!.id;

  const start = new Date(Date.now() + 30 * 60_000);
  const { data: ev } = await db
    .from('events')
    .insert({
      title: `backtest ledger — DELETE ME ${ts}`,
      start_time: start.toISOString(),
      end_time: new Date(start.getTime() + 3_600_000).toISOString(),
      timezone: 'Asia/Hong_Kong',
      created_by: staffId,
      venue_name: 'T',
      city: 'Hong Kong',
      country: 'HK',
      latitude: 22.3,
      longitude: 114.2,
      status: 'published',
    })
    .select('id')
    .single();
  eventId = ev!.id;

  for (const suffix of ['A', 'B']) {
    const { data } = await db
      .from('registrations')
      .insert({
        event_id: eventId,
        email: `bt-${suffix}-${ts}@local.invalid`,
        full_name: `Backtest ${suffix}`,
        status: 'registered',
        registration_code: `WK-BT${suffix}${String(ts).slice(-4)}`,
      })
      .select('id')
      .single();
    regIds.push(data!.id);
  }

  // 1. origin column: default + constraint.
  const { error: defErr } = await db.from('email_log').insert({
    purpose: 'survey',
    event_id: eventId,
    registration_id: regIds[0],
    recipient_email: 'bt-default@local.invalid',
    status: 'queued',
  });
  check('a row inserted without origin is accepted', !defErr, defErr?.message ?? '');
  const { data: defRow } = await db
    .from('email_log')
    .select('origin')
    .eq('event_id', eventId)
    .eq('purpose', 'survey')
    .single();
  check('…and defaults to scheduler', defRow?.origin === 'scheduler', String(defRow?.origin));

  const { error: badOrigin } = await db.from('email_log').insert({
    purpose: 'confirmation',
    event_id: eventId,
    registration_id: regIds[1],
    recipient_email: 'bt-bad@local.invalid',
    status: 'queued',
    origin: 'not-a-real-origin',
  });
  check('an unknown origin is rejected by the CHECK', badOrigin?.code === '23514', badOrigin?.code ?? 'accepted!');

  // 2. Dedup semantics survive the migration.
  const first = await insertLog(regIds[0], 'queued', 'scheduler');
  check('first reminder row inserts', !first.error, first.error?.message ?? '');

  const dupQueued = await insertLog(regIds[0], 'queued', 'scheduler');
  check('a queued row is still TERMINAL (23505)', dupQueued.error?.code === '23505', dupQueued.error?.code ?? 'accepted!');

  // A manual row for the SAME recipient must also collide — origin is
  // deliberately NOT in the index, or a manual send could double-deliver.
  const dupManual = await insertLog(regIds[0], 'queued', 'manual');
  check('a manual row cannot bypass the dedup index', dupManual.error?.code === '23505', dupManual.error?.code ?? 'ACCEPTED — double-send hole!');

  await db.from('email_log').update({ status: 'failed' }).eq('event_id', eventId).eq('registration_id', regIds[0]).eq('purpose', 'reminder');
  const retry = await insertLog(regIds[0], 'queued', 'scheduler');
  check('a failed row is still RETRYABLE after the migration', !retry.error, retry.error?.message ?? '');

  // 3. Budget counts scheduler failures only.
  await db.from('email_log').delete().eq('event_id', eventId).eq('purpose', 'reminder');
  await insertLog(regIds[1], 'failed', 'manual');
  await insertLog(regIds[1], 'failed', 'manual');
  await insertLog(regIds[1], 'failed', 'manual');
  await insertLog(regIds[1], 'failed', 'scheduler');

  const { data: schedFails } = await db
    .from('email_log')
    .select('registration_id')
    .eq('event_id', eventId)
    .eq('purpose', 'reminder')
    .eq('status', 'failed')
    .eq('origin', 'scheduler');
  check(
    'three manual failures do NOT exhaust the scheduler budget',
    (schedFails ?? []).length === 1,
    `scheduler-origin failures = ${(schedFails ?? []).length} (manual ones ignored)`,
  );

  // Cleanup — email_log + registrations cascade from the event.
  await db.from('events').delete().eq('id', eventId);
  await db.from('staff').delete().eq('id', staffId);
  const { count } = await db.from('email_log').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
  check('fixtures cleaned up', (count ?? 0) === 0, `${count ?? 0} rows left`);

  console.log(`\n${bad === 0 ? 'BACKTEST PASS' : `BACKTEST FAIL (${bad})`}\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  if (eventId) await db.from('events').delete().eq('id', eventId);
  if (staffId) await db.from('staff').delete().eq('id', staffId);
  process.exit(1);
});
