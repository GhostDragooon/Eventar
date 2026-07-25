// scripts/demo/reset-demo.ts — LOCAL-STACK-ONLY between-rehearsals reset.
//
// The run sheet (docs/plans/demo-run-sheet.md) needs a fast "wipe the demo
// back to a pristine seeded fixture" between rehearsals — lighter than a full
// `supabase db reset` (which replays all migrations). This tears down every
// demo-created row in FK-dependency order, then re-runs seed-demo.ts, then
// asserts both integrity chains are clean.
//
// Because the ledger trust-moment demo (ledger-demo.ts) both WRITES real
// credit_ledger/audit_events rows AND tampers one via superuser, a clean
// reset must be able to delete from those append-only tables — which
// service_role cannot (Hard Rule 11 revokes its INSERT/UPDATE/DELETE). So the
// append-only chains are cleared via sqlLocal (postgres superuser); that power
// exists only on the local stack, which is the whole point of the tamper demo.
//
// Method split (mirrors the plan's Task 3 spec):
//   - append-only + most tables: sqlLocal (superuser; robust, no RLS/grant friction)
//   - practitioner_licences:      service-role DELETE (exercises the grant Hard
//                                 Rule 11 deliberately RETAINED — 20260709320000)
//   - auth users:                 auth.admin.deleteUser (cascades public.users)
//
// Fresh fixture each run: seed-demo.ts recreates the event with a NEW timing
// window and NEW registration codes, so reset output differs run-to-run by
// design. "Idempotent" here means every run completes cleanly (no FK errors,
// no orphans), not that output is identical.

import { admin, sqlLocal, localEnv } from './lib';
import { execFileSync } from 'node:child_process';

const OPERATOR_EMAIL = 'demo-staff@local.test';
const PRACTITIONER_EMAIL = 'demo-doctor@local.test';
// Stage 4 gave the demo attendee 'Karen Lau' a real auth account so
// award_attendance_credit's email resolution has something to find. It was
// missing here, so every reset left it behind — contradicting this script's
// stated contract of removing every demo-created row.
const DEMO_ATTENDEE_EMAIL = 'k.lau@demo.test';
const DEMO_AUTH_EMAILS = [OPERATOR_EMAIL, PRACTITIONER_EMAIL, DEMO_ATTENDEE_EMAIL];
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

async function assertChainClean(fn: 'verify_audit_chain' | 'verify_ledger_chain'): Promise<void> {
  // Each verifier returns one row PER entry with link_valid/content_valid
  // booleans (zero rows when the table is empty). "Clean" = no row is broken —
  // NOT count(*) = 0, which is only true on an empty chain.
  const broken = (
    await sqlLocal(`select count(*) from public.${fn}() where not link_valid or not content_valid`)
  ).trim();
  if (broken !== '0') throw new Error(`${fn}: ${broken} broken link(s) after reset — chain not clean`);
}

async function deleteDemoAuthUsers(client: ReturnType<typeof admin>): Promise<void> {
  const list = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw list.error;
  for (const email of DEMO_AUTH_EMAILS) {
    const user = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) continue;
    const { error } = await client.auth.admin.deleteUser(user.id); // cascades public.users
    if (error) throw new Error(`deleteUser ${email}: ${error.message}`);
  }
}

async function main() {
  localEnv(); // hard local-only guard (throws on any non-127.0.0.1 target)
  const client = admin();

  // --- Teardown in FK-dependency order (child rows before their parents) ---
  // Append-only chains first (they reference events/users/licences, and only
  // superuser may delete them).
  await sqlLocal('delete from public.credit_disputes'); // → credit_ledger, users
  await sqlLocal('delete from public.credit_ledger'); //   → licences, events, users, accrediting_bodies(keep)
  await sqlLocal('delete from public.audit_events'); //    standalone hash chain

  // Event-linked rows (all children of events / registrations / agenda_blocks).
  await sqlLocal('delete from public.survey_responses'); // → agenda_blocks, events, registrations
  await sqlLocal('delete from public.email_log'); //        → events, registrations
  await sqlLocal('delete from public.speaker_checkins'); // → events, staff
  await sqlLocal('delete from public.registrations'); //    → events
  await sqlLocal('delete from public.agenda_blocks'); //    → events

  // practitioner_licences via the RETAINED service-role DELETE (Hard Rule 11
  // carve-out — proves that grant still works). References users + self; a
  // whole-table delete resolves the self-FK in one statement.
  const { error: licErr } = await client
    .from('practitioner_licences')
    .delete()
    .neq('id', ZERO_UUID); // supabase-js requires a filter; no real row is the zero-uuid
  if (licErr) throw new Error(`practitioner_licences delete (service-role): ${licErr.message} [${licErr.code}]`);

  await sqlLocal('delete from public.events'); // → organisations(keep), staff

  // User-linked rows before deleting the users themselves (auth.users delete
  // cascades public.users; clear the mirror's children explicitly so no
  // resolver_staff_id / subject_user_id FK survives into the staff delete).
  await sqlLocal('delete from public.consent_records'); //      → users
  await sqlLocal('delete from public.data_subject_requests'); // → users, staff

  await deleteDemoAuthUsers(client); // cascades public.users mirror

  // Operator staff row (events.created_by / speaker_checkins.updated_by /
  // data_subject_requests.resolver_staff_id all cleared above).
  await sqlLocal(`delete from public.staff where email = '${OPERATOR_EMAIL}'`);

  console.log('[reset-demo] demo rows cleared. Reseeding…\n');

  // --- Re-seed (spawn, so seed-demo.ts stays the single source of the fixture) ---
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/demo/seed-demo.ts'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  // --- Verify both integrity chains survived the churn ---
  await assertChainClean('verify_audit_chain');
  await assertChainClean('verify_ledger_chain');

  console.log('\n[reset-demo] audit + ledger chains clean.');
  console.log('RESET OK');
}

main().catch((err) => {
  console.error('[reset-demo] failed:', err);
  process.exit(1);
});
