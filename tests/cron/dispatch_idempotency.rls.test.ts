// Scheduler (M2 Stage C) — proves the concurrency property the whole dispatcher
// rests on, against a real database.
//
// `/api/cron/dispatch` holds NO lock and keeps NO "already dispatched" state.
// Its entire idempotency guarantee is delegated to one database object:
//
//   email_log_dedup_idx — UNIQUE (event_id, registration_id, purpose)
//                         WHERE registration_id IS NOT NULL
//                           AND status <> 'failed'
//
// The `status <> 'failed'` arm was added 2026-08-05 (20260805000000). Before it,
// ANY existing row blocked the next insert, so a transient provider error lost
// that recipient's mail permanently and the dispatcher counted the loss as
// `skipped` — "already handled". Tests 5 and 6 pin both halves of the fix: a
// failed row retries, a sent row still cannot.
//
// combined with Hard Rule 2 (insert email_log FIRST, send SECOND). The insert
// itself is therefore the concurrency lock: a second dispatcher racing the
// first loses with 23505 and must skip, never retry. `runBulkSend`'s reaction
// to 23505 (skip WITHOUT sending) is unit-tested in
// app/events/[id]/details/emailActions.test.ts; what cannot be mocked — that
// the index actually serialises concurrent writers — is proven here.
//
// THE `queued` ARM (plan §2A.4, decided here): a `queued` row is TERMINAL under
// this index. Test 2 proves an existing `queued` row cannot be replaced or
// re-inserted, so the dispatcher can never "resume" one. The dispatcher
// therefore treats `queued` as DONE-OR-STUCK, never as "needs sending".
// Rationale: a queued row is genuinely ambiguous (the process may have died
// before sending, or sent and failed to update status). Treating it as
// "send it" risks a duplicate to a real practitioner; treating it as done risks
// a silent non-send. A silent non-send is recoverable — the operator's manual
// send button is still there and a human decides — whereas a duplicate to a
// regulated professional is not. We take the recoverable failure.
//
// Fixtures are fully disposable: email_log and registrations both cascade from
// events ON DELETE, so deleting the event cleans up everything.
//
// Gated: only runs with RLS_TESTS=1. Point it at the LOCAL stack by presetting
// the env (tests/helpers/env.ts only fills vars that are unset, and .env.local
// points at Seoul):
//
//   eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
//   NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY \
//   SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY RLS_TESTS=1 \
//   pnpm exec vitest run tests/cron
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

type InsertOutcome = { ok: boolean; code?: string };

describe.skipIf(!process.env.RLS_TESTS)('cron dispatch — email_log idempotency', () => {
  const ts = Date.now();
  let staffId: string;
  let eventId: string;
  let regA: string;
  let regB: string;
  let regC: string;
  let regD: string;

  /** Drives a row to a terminal-or-retryable state the way runBulkSend does. */
  async function setStatus(registrationId: string, status: 'sent' | 'failed'): Promise<void> {
    const { error } = await admin
      .from('email_log')
      .update({ status, ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) })
      .eq('event_id', eventId)
      .eq('registration_id', registrationId)
      .eq('purpose', 'reminder');
    if (error) throw new Error(`setStatus(${status}): ${error.message}`);
  }

  /** One email_log insert, shaped exactly as runBulkSend writes it. */
  async function insertLog(
    registrationId: string,
    purpose: 'reminder' | 'survey',
  ): Promise<InsertOutcome> {
    const { error } = await admin.from('email_log').insert({
      purpose,
      event_id: eventId,
      registration_id: registrationId,
      recipient_email: `dispatch-${registrationId}@rls-test.invalid`,
      status: 'queued',
    });
    return error ? { ok: false, code: error.code } : { ok: true };
  }

  async function countLogs(purpose?: string): Promise<number> {
    let q = admin.from('email_log').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
    if (purpose) q = q.eq('purpose', purpose);
    const { count, error } = await q;
    if (error) throw new Error(`countLogs: ${error.message}`);
    return count ?? 0;
  }

  beforeAll(async () => {
    const { data: staff, error: staffErr } = await admin
      .from('staff')
      .insert({ email: `cron-dispatch-${ts}@rls-test.invalid`, role: 'eventar_staff' })
      .select('id')
      .single();
    if (staffErr || !staff) throw new Error(`staff fixture: ${staffErr?.message}`);
    staffId = staff.id as string;

    const start = new Date(Date.now() + 30 * 60_000);
    const { data: event, error: eventErr } = await admin
      .from('events')
      .insert({
        title: `cron dispatch idempotency fixture — DELETE ME ${ts}`,
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: staffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'published',
      })
      .select('id')
      .single();
    if (eventErr || !event) throw new Error(`event fixture: ${eventErr?.message}`);
    eventId = event.id as string;

    const makeReg = async (suffix: string): Promise<string> => {
      const { data, error } = await admin
        .from('registrations')
        .insert({
          event_id: eventId,
          email: `cron-${suffix}-${ts}@rls-test.invalid`,
          full_name: 'Cron Dispatch Test Attendee',
          status: 'registered',
          registration_code: `WK-CR${suffix}${String(ts).slice(-4)}`,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`registration fixture ${suffix}: ${error?.message}`);
      return data.id as string;
    };
    regA = await makeReg('A');
    regB = await makeReg('B');
    regC = await makeReg('C');
    regD = await makeReg('D');
  });

  afterAll(async () => {
    // email_log + registrations cascade from the event.
    if (eventId) await mustDelete(admin.from('events').delete().eq('id', eventId), 'event fixture');
    if (staffId) await mustDelete(admin.from('staff').delete().eq('id', staffId), 'staff fixture');
  });

  it('two concurrent inserts for the same recipient+purpose: exactly one wins, loser gets 23505', async () => {
    const outcomes = await Promise.all([insertLog(regA, 'reminder'), insertLog(regA, 'reminder')]);

    const winners = outcomes.filter((o) => o.ok);
    const losers = outcomes.filter((o) => !o.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    // The specific code matters: 23505 is unique-violation (already handled).
    // Any other code would mean the skip path is masking a real failure.
    expect(losers[0].code).toBe('23505');
    expect(await countLogs('reminder')).toBe(1);
  });

  it('a queued row is TERMINAL — it cannot be replaced by a later insert', async () => {
    // regA already has a 'queued' reminder row from the previous test.
    const { data: existing, error: existingErr } = await admin
      .from('email_log')
      .select('status')
      .eq('event_id', eventId)
      .eq('registration_id', regA)
      .eq('purpose', 'reminder')
      .single();
    expect(existingErr).toBeNull();
    expect(existing?.status).toBe('queued');

    const retry = await insertLog(regA, 'reminder');

    expect(retry.ok).toBe(false);
    expect(retry.code).toBe('23505');
    expect(await countLogs('reminder')).toBe(1);
  });

  it('the index is scoped per purpose — a survey is not blocked by the reminder', async () => {
    const survey = await insertLog(regA, 'survey');

    expect(survey.ok).toBe(true);
    expect(await countLogs('survey')).toBe(1);
  });

  // A transient Resend error (429, 5xx, network blip) must not cost a
  // practitioner their QR pass forever. `failed` is the one status the index
  // lets through, so the next tick makes a fresh attempt rather than counting
  // the loss as "already handled".
  it('a failed row is RETRYABLE — the next tick starts a fresh attempt', async () => {
    expect((await insertLog(regC, 'reminder')).ok).toBe(true);
    await setStatus(regC, 'failed');

    const retry = await insertLog(regC, 'reminder');

    expect(retry.ok).toBe(true);
    // Both rows survive: the failure stays on the ledger as evidence (rule 12),
    // the retry is a new attempt beside it — not an overwrite of the history.
    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('registration_id', regC)
      .eq('purpose', 'reminder');
    expect(count).toBe(2);
  });

  // The other half of the same rule: a delivered email is never re-sent. This
  // is what keeps retryability from becoming a duplicate-send channel.
  it('a sent row is TERMINAL — retryability never duplicates a delivered email', async () => {
    expect((await insertLog(regD, 'reminder')).ok).toBe(true);
    await setStatus(regD, 'sent');

    const retry = await insertLog(regD, 'reminder');

    expect(retry.ok).toBe(false);
    expect(retry.code).toBe('23505');
  });

  // runBulkSend's retry cap reads prior failures with exactly this query, and
  // that read is mocked in every unit test — so this is the only place the real
  // query shape is exercised against PostgREST. regC ended the retry test with
  // one 'failed' row and one 'queued' row; only the failed one may be counted,
  // or a recipient mid-retry would be given up on early.
  it('the retry-cap read counts failed attempts only, not the queued retry beside them', async () => {
    const { data, error } = await admin
      .from('email_log')
      .select('registration_id')
      .eq('event_id', eventId)
      .eq('purpose', 'reminder')
      .eq('status', 'failed');

    expect(error).toBeNull();

    const attempts = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ registration_id: string | null }>) {
      if (!row.registration_id) continue;
      attempts.set(row.registration_id, (attempts.get(row.registration_id) ?? 0) + 1);
    }

    expect(attempts.get(regC)).toBe(1);
    // regA/regB never failed; regD was marked sent, not failed.
    expect(attempts.get(regD)).toBeUndefined();
    expect(attempts.get(regA)).toBeUndefined();
  });

  it('two concurrent dispatch batches over the same roster produce one row per recipient', async () => {
    // Four concurrent writers, two recipients: the realistic shape of two cron
    // ticks overlapping. Expect exactly 2 rows, not 4.
    const outcomes = await Promise.all([
      insertLog(regB, 'reminder'),
      insertLog(regB, 'reminder'),
      insertLog(regB, 'survey'),
      insertLog(regB, 'survey'),
    ]);

    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
    expect(outcomes.filter((o) => o.code === '23505')).toHaveLength(2);

    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('registration_id', regB);
    expect(count).toBe(2);
  });
});
