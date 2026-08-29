// scripts/cpd/reconcile-event.ts — backfill CPD credit issuance for one event.
//
// Runtime Contract (docs/plans/2026-07-23-cpd-mvp-architecture.md): credit
// issuance is best-effort and eventually consistent — this is the "eventually"
// half. It heals four real gaps, none of which the inline award at check-in
// time can close on its own:
//   1. A transient technical failure on the inline award (network blip,
//      momentary DB error) that left a real attendee with no credit.
//   2. A kill-switch-off window (CPD_ISSUANCE_ENABLED='false' during the
//      event) — re-run this once the switch is back on to backfill.
//   3. An attendee who resolves to a user + verified licence only AFTER the
//      event (self-serve identity linking, when that ships) — this is the
//      only mechanism that can ever award them a credit at all, since the
//      inline path only fires once, at check-in time.
//   4. Post-2026-08-29 (Stage B4, F1-F5 gate): an attendee whose CPD was
//      HELD at check-in because full account setup was incomplete — walk-in
//      with no user_id, no linked profile, missing consent versions, or no
//      licence for a body. After they claim (claim_registrations_for_user)
//      + complete their profile + declare their licence, re-run this to
//      release the held credit. Idempotent: rows that were 'issued' first
//      time come back 'already'; rows that were 'skipped:*' and still fail
//      the gate come back with the same skip code (fresh no-op). No config
//      change or explicit list-of-held is needed — the DB-side gate is the
//      single source of truth for release eligibility.
//
// Deliberately NOT a diff-then-insert: it just re-calls awardAttendanceCredit
// for every attended registration, unconditionally. The idempotency backstop
// (credit_ledger_attendance_uniq, Stage 1) makes that safe — already-credited
// registrations come back 'already', not a duplicate. Same helper, same
// guards, same kill-switch respect as the two live call sites (Stage 3) — a
// separate reimplementation here would be a second place for the guard logic
// to drift out of sync.
//
// Usage: pnpm exec tsx scripts/cpd/reconcile-event.ts <eventId>
//
// Unlike scripts/demo/*.ts, this is a real operational tool, not a demo
// fixture script — it must be able to run against whichever project the
// environment actually points at (local stack today, Seoul or a future
// production project once real events happen), so it does NOT import
// scripts/demo/lib.ts's admin() (hard-locked to 127.0.0.1 by design, for the
// demo scripts' own safety — reusing it here would either wrongly restrict
// this tool to local-only or require weakening that guard, and neither is
// right). Builds its own client from the same two env vars lib/supabase/
// admin.ts uses, without that file's `import 'server-only'` (a Next.js
// bundler guard that has no meaning in a plain Node CLI script).
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
// Type-only: erased entirely at compile time, so it has no runtime import and
// cannot trigger the server-only issue below. The VALUE import of
// awardAttendanceCredit is deliberately NOT here — see loadAwardAttendanceCredit.
import type { AwardOutcome } from '../../lib/cpd/awardAttendanceCredit';

// lib/cpd/awardAttendanceCredit.ts itself starts with `import 'server-only'`
// (correctly — it touches service-role writes and must never land in a client
// bundle), which throws unconditionally outside Next's build pipeline. Test
// files neutralise this with `vi.mock('server-only', ...)`; this is the same
// neutralisation for a plain Node/tsx script, which has no Vitest to do it for
// us: pre-seed the CJS module cache with an empty module, THEN dynamically
// import the real helper (a static import would be hoisted above this and run
// too early). Reusing the real helper — not reimplementing its guards here —
// is the point; see the file header.
async function loadAwardAttendanceCredit() {
  const req = createRequire(import.meta.url);
  const serverOnlyPath = req.resolve('server-only');
  req.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as NodeJS.Module;
  const mod = await import('../../lib/cpd/awardAttendanceCredit');
  return mod.awardAttendanceCredit;
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function main() {
  const eventId = process.argv[2];
  if (!eventId) {
    console.error('Usage: pnpm exec tsx scripts/cpd/reconcile-event.ts <eventId>');
    process.exit(1);
  }

  const client = admin();
  const awardAttendanceCredit = await loadAwardAttendanceCredit();

  // This writes to an append-only, regulator-facing ledger and can be pointed at
  // local OR production depending on which env vars are loaded. Which database
  // it just acted on must be on screen, not inferred.
  console.log(`Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  // Distinguish "you typed the wrong id" from "nobody has checked in yet" —
  // an operator recovering mid-demo cannot act on a message that conflates them.
  const { data: event, error: eventErr } = await client
    .from('events')
    .select('id, title')
    .eq('id', eventId)
    .maybeSingle();
  if (eventErr) throw eventErr;
  if (!event) {
    console.error(`Event not found: ${eventId} — check the Event ID from the seed banner.`);
    process.exit(1);
  }

  const { data: registrations, error } = await client
    .from('registrations')
    .select('id, registration_code')
    .eq('event_id', eventId)
    .eq('status', 'attended');
  if (error) throw error;

  if (!registrations || registrations.length === 0) {
    console.log(`"${event.title}" has no attended registrations yet — nobody has checked in.`);
    return;
  }

  console.log(`Reconciling ${registrations.length} attended registration(s) for event ${eventId}…`);
  console.log('(One event can now carry several accrediting bodies — the counts below are OUTCOMES, one per body evaluated, not registrations.)\n');

  const tally: Record<AwardOutcome['status'], number> = { issued: 0, already: 0, skipped: 0, failed: 0 };
  const failures: { registrationId: string; bodyId: string | null; reason: string }[] = [];

  for (const reg of registrations) {
    const outcomes = await awardAttendanceCredit(client, {
      eventId,
      registrationCode: reg.registration_code,
    });
    for (const outcome of outcomes) {
      tally[outcome.status] += 1;
      const detail = 'reason' in outcome ? ` (${outcome.reason})` : '';
      const body = outcome.bodyId ? `body=${outcome.bodyId}` : 'body=none';
      // registration id + body id, never full_name — Hard Rule 10 (no PII in
      // logs, UUIDs only). This output lands in scrollback, redirected files
      // and any future CI/cron invocation.
      console.log(`  ${outcome.status.padEnd(8)} ${reg.id} ${body}${detail}`);
      if (outcome.status === 'failed') {
        failures.push({ registrationId: reg.id, bodyId: outcome.bodyId, reason: outcome.reason });
      }
    }
  }

  console.log('\n=== Reconcile summary (outcome counts, not registration counts) ===');
  console.log(`  issued:  ${tally.issued}  (new credits posted)`);
  console.log(`  already: ${tally.already}  (already had a credit — no-op)`);
  console.log(`  skipped: ${tally.skipped}  (business guard — not_cpd / no_user / no_licence / no_role_match / no_occurrences / no_matching_schedule / ambiguous_schedule / disabled)`);
  console.log(`  failed:  ${tally.failed}  (technical error — needs investigation)`);

  if (failures.length > 0) {
    console.error('\nFAILED outcomes (see reasons above) — not silently swallowed:');
    for (const f of failures) console.error(`  ${f.registrationId} body=${f.bodyId ?? 'none'}: ${f.reason}`);
    process.exit(1);
  }
}

main().catch((err) => {
  // Log message + code only, never the whole error: a PostgrestError's
  // details/hint echo row values (Rule 10), and this CLI runs against real
  // registration data. Security review 2026-08-06.
  const e = err as { message?: string; code?: string };
  console.error('[reconcile-event] failed:', { message: e.message ?? String(err), code: e.code });
  process.exit(1);
});
