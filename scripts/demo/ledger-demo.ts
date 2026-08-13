// scripts/demo/ledger-demo.ts — LOCAL-STACK-ONLY trust-moment choreography.
//
// The demo's climax (run sheet Beat 5): show that a CPD credit, once posted, is
// tamper-EVIDENT. Six narrated checkpoints, each exiting non-zero on any miss:
//
//   1. Practitioner declares a licence (self-actor, status 'declared').
//   2. Staff verifies it            (staff-actor, org-match gate → 'verified').
//   3. An attendee self-checks-in   (anon, by pass code).
//   4. Service role posts a credit  (record_credit_entry → hash-chained row).
//   5. GRANT layer: a direct service-role UPDATE of that credit is refused
//      (42501) — Hard Rule 11 revokes credit_ledger writes even from service_role.
//   6. CHAIN layer: a superuser UPDATE (a power only the LOCAL stack grants)
//      DOES rewrite the row — and verify_ledger_chain() catches it. That's the
//      whole point: even an actor who bypasses the grant can't do so invisibly.
//
// Body note: HKCP (Hong Kong College of Physicians) is the pivot narrative's
// launch body, seeded 2026-08-13 (dual-track Task 1) along with HKAM's other
// 14 Colleges + MCHK. HKAM itself stays 'active' but deliberately unauthorised
// for any org — it's the parent Academy, not an accrediting body — so this
// was HKAM until that migration, per the old note here.
//
// Leaves a deliberately-tampered ledger behind (checkpoint 6) — run
// reset-demo.ts afterwards to restore a clean chain.

import { admin, anonClient, signedInClient, sqlLocal } from './lib';

const BODY_SHORT_NAME = 'HKCP';
const EVENT_TITLE = 'Clinical Update Seminar 2026';
const DEMO_ATTENDEE_EMAIL = 'k.lau@demo.test';
const OPERATOR_EMAIL = 'demo-staff@local.test';
const OPERATOR_PASSWORD = 'demo-staff-pw-2026';
const PRACTITIONER_EMAIL = 'demo-doctor@local.test';
const PRACTITIONER_PASSWORD = 'demo-doctor-pw-2026';
const GUESS_IP = '203.0.113.10'; // TEST-NET-3 documentation range

function step(msg: string) {
  console.log(msg);
}
function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const svc = admin(); // asserts local via localEnv()

  // --- Fixtures the choreography needs (from the current seed) ---
  const { data: body, error: bodyErr } = await svc
    .from('accrediting_bodies')
    .select('id, full_name')
    .eq('short_name', BODY_SHORT_NAME)
    .single();
  if (bodyErr || !body) fail(`accrediting body ${BODY_SHORT_NAME} not found: ${bodyErr?.message}`);

  const { data: event, error: evErr } = await svc
    .from('events')
    .select('id, organisation_id')
    .eq('title', EVENT_TITLE)
    .maybeSingle();
  if (evErr || !event) fail(`demo event not found — run seed-demo.ts first: ${evErr?.message}`);

  const { data: reg, error: regErr } = await svc
    .from('registrations')
    .select('registration_code')
    .eq('event_id', event.id)
    .eq('email', DEMO_ATTENDEE_EMAIL)
    .maybeSingle();
  if (regErr || !reg) fail(`demo attendee not registered — run seed-demo.ts first: ${regErr?.message}`);

  console.log('\n=== CPD Ledger — trust moment ===\n');

  // --- 1. Practitioner declares a licence at the body ---
  const practitioner = await signedInClient(PRACTITIONER_EMAIL, PRACTITIONER_PASSWORD);
  const { data: licence, error: declErr } = await practitioner.rpc('declare_licence', {
    p_body_id: body.id,
    p_licence_number: 'M-2026-0417',
    p_licence_type: 'specialist',
  });
  if (declErr || !licence) fail(`declare_licence failed: ${declErr?.message}`);
  const licenceRow = licence as { id: string; user_id: string; status: string };
  step(`1. LICENCE DECLARED     ${BODY_SHORT_NAME} · ${licenceRow.status} · ${licenceRow.id.slice(0, 8)}…`);

  // --- 2. Staff verifies it (org-match gate) ---
  const operator = await signedInClient(OPERATOR_EMAIL, OPERATOR_PASSWORD);
  const { data: verified, error: verErr } = await operator.rpc('verify_licence', {
    p_licence_id: licenceRow.id,
  });
  if (verErr || !verified) fail(`verify_licence failed: ${verErr?.message}`);
  if ((verified as { status: string }).status !== 'verified') {
    fail(`verify_licence returned status ${(verified as { status: string }).status}, expected 'verified'`);
  }
  step(`2. LICENCE VERIFIED ✓   by ${OPERATOR_EMAIL}`);

  // --- 3. Attendee self-checks-in by pass code (anon) ---
  const { data: checkin, error: ciErr } = await anonClient().rpc('self_check_in', {
    p_code: reg.registration_code,
    p_ip: GUESS_IP,
  });
  if (ciErr) fail(`self_check_in errored: ${ciErr.message}`);
  const ciResult = (checkin as { result: string }[])[0]?.result;
  if (ciResult !== 'ok' && ciResult !== 'already') fail(`self_check_in returned '${ciResult}', expected ok/already`);
  step(`3. CHECKED IN ✓         ${reg.registration_code}${ciResult === 'already' ? ' (already attended)' : ''}`);

  // --- 4. Service role posts a hash-chained credit ---
  const today = new Date().toISOString().slice(0, 10);
  const { data: posted, error: postErr } = await svc.rpc('record_credit_entry', {
    p_licence_id: licenceRow.id,
    p_user_id: licenceRow.user_id,
    p_event_id: event.id,
    p_body_id: body.id,
    p_entry_type: 'credit_earned',
    p_points: 3.5,
    p_hours: 3.5,
    p_category: 'clinical',
    p_effective_date: today,
    p_attestation_status: 'organiser_attested',
  });
  if (postErr || !posted) fail(`record_credit_entry failed: ${postErr?.message}`);
  const ledgerId = (posted as { id: string }).id;
  // Read chain_seq + hash back as clean hex (bytea over PostgREST is awkward).
  const meta = (await sqlLocal(
    `select chain_seq, encode(hash,'hex') from public.credit_ledger where id = '${ledgerId}'`,
  )).trim();
  const [chainSeq, hashHex] = meta.split('|');
  step(`4. CREDIT POSTED        3.5 pts · chain #${chainSeq} · ${hashHex.slice(0, 8)}…`);

  // --- 5. GRANT layer: direct service-role edit is refused ---
  const { error: editErr } = await svc
    .from('credit_ledger')
    .update({ points: 99 })
    .eq('id', ledgerId);
  if (!editErr) fail('SECURITY REGRESSION: service-role UPDATE of credit_ledger SUCCEEDED (expected 42501)');
  if (editErr.code !== '42501') fail(`service-role UPDATE blocked, but with ${editErr.code}, expected 42501`);
  step(`5. DIRECT EDIT BLOCKED ✓ (42501 — grant denies service_role)`);

  // --- 6. CHAIN layer: superuser CAN rewrite it, but the chain notices ---
  await sqlLocal(`update public.credit_ledger set points = 99 where chain_seq = ${chainSeq}`);
  const broken = (await sqlLocal(
    `select chain_seq from public.verify_ledger_chain() where not link_valid or not content_valid order by chain_seq`,
  )).trim();
  if (broken === '') fail('TAMPER NOT DETECTED: verify_ledger_chain() reported a clean chain after a superuser edit');
  const brokenSeqs = broken.split('\n').join(', ');
  step(`6. TAMPER DETECTED ✓    verify_ledger_chain flags chain #${brokenSeqs}`);

  console.log('\nThe ledger is now deliberately tampered — run `reset-demo.ts` to restore a clean chain.\n');
}

main().catch((err) => {
  console.error('[ledger-demo] failed:', err);
  process.exit(1);
});
