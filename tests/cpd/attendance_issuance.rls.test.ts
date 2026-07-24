// CPD MVP Stage 5 — award_attendance_credit() invariants against the live dev
// project. Tests the DB function directly (all business logic — eligibility,
// identity resolution, issuance, idempotency — lives there per Stage 2's design;
// email->user needs auth.users, unreachable from PostgREST/TS). The Server-Action
// wiring (Stage 3: fires only on a fresh check-in, never fails the attendance
// response) is covered by lib/cpd/awardAttendanceCredit.test.ts + the unaffected
// full suite — not re-driven live here, same boundary this repo already draws
// for definer-function tests (see tests/audit/licence_mutations.test.ts).
//
// Disposable fixtures — own accrediting body, events, users, licences.
//
// credit_ledger rows are append-only (HR11) and intentionally NOT cleaned up,
// same convention as every other RLS suite exercising an audited mutation. That
// has a wider blast radius here than elsewhere: credit_ledger.licence_id,
// .user_id (via practitioner_licences.user_id -> public.users), .event_id, and
// .body_id are all plain `references` with the Postgres default NO ACTION — so
// once a real credit is issued, its licence, practitioner (auth user + public
// mirror), event, AND accrediting-body fixture ALL become permanently
// undeletable, not just the ledger row (found running this file — the FK
// RESTRICT bubbles through deleteTestUser() and the event/body cleanup, not
// only the explicit practitioner_licences delete). Regulator-grade property
// (can't erase the entities behind an issued credit) but means practitionerA,
// practitionerB, their licences, cpdEventId, and bodyId all become PERMANENT
// residue on the target project every run this suite actually issues a credit
// (tests 1-3) — and it goes one hop further still: events.created_by ->
// staff.id is ALSO plain `references` (NO ACTION), so cpdEventId (itself
// pinned) permanently pins bodyAdmin's STAFF ROW too. Not bodyAdmin's auth
// user, though — `staff` has no FK to auth.users, it's matched by email — so
// deleteTestUser(bodyAdmin) is safe; only the explicit staff-table row delete
// is blocked. Same accepted-debt class as DEFERRED.md items 24/25 (credit_ledger
// has no safe cleanup path) — logged there as its own row. Only clean what
// carries zero credit reference: nonCpdEventId (no credit ever references it),
// all registrations (credit_ledger has no FK to registrations at all), and the
// auth-side of bodyAdmin + practitionerNoLicence.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type ChainRow = { link_valid: boolean; content_valid: boolean };
type CreditRow = {
  id: string;
  entry_type: string;
  attestation_status: string | null;
  hours: string | null;
  licence_id: string;
};

describe.skipIf(!process.env.RLS_TESTS)('award_attendance_credit — config-free issuance', () => {
  let bodyAdmin: TestUser; // verifies licences + owns the event fixtures (created_by)
  let bodyAdminStaffId: string;
  let practitionerA: TestUser; // verified licence @ body — sequential issue/idempotency
  let practitionerB: TestUser; // verified licence @ body — concurrent-race case
  let practitionerNoLicence: TestUser; // no licence anywhere
  let bodyId: string;
  let cpdEventId: string;
  let nonCpdEventId: string;
  const registrationIds: string[] = [];
  const ts = Date.now();

  async function makeRegistration(eventId: string, user: TestUser, codeSuffix: string): Promise<string> {
    const { data, error } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: user.email, // MUST match auth.users.email — the function resolves by email
        full_name: 'RLS CPD Test Attendee',
        status: 'attended',
        registration_code: `WK-CPD${codeSuffix}`,
      })
      .select('id, registration_code')
      .single();
    if (error || !data) throw new Error(`registration fixture: ${error?.message}`);
    registrationIds.push(data.id as string);
    return data.registration_code as string;
  }

  async function verifiedLicence(user: TestUser, licenceNumber: string): Promise<string> {
    const { data: declared, error: declErr } = await user.client.rpc('declare_licence', {
      p_body_id: bodyId,
      p_licence_number: licenceNumber,
    });
    if (declErr || !declared) throw new Error(`declare_licence fixture: ${declErr?.message}`);
    const licenceId = (declared as { id: string }).id;
    const { error: verErr } = await bodyAdmin.client.rpc('verify_licence', { p_licence_id: licenceId });
    if (verErr) throw new Error(`verify_licence fixture: ${verErr.message}`);
    return licenceId;
  }

  async function creditsFor(userId: string, eventId: string): Promise<CreditRow[]> {
    const { data, error } = await admin
      .from('credit_ledger')
      .select('id, entry_type, attestation_status, hours, licence_id')
      .eq('user_id', userId)
      .eq('event_id', eventId);
    if (error) throw new Error(`credit_ledger query: ${error.message}`);
    return data as CreditRow[];
  }

  beforeAll(async () => {
    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-CPD-${ts}`,
        full_name: 'RLS Test Body (attendance_issuance fixture)',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    bodyAdmin = await createTestUser(`cpd-body-admin-${ts}`);
    practitionerA = await createTestUser(`cpd-prac-a-${ts}`);
    practitionerB = await createTestUser(`cpd-prac-b-${ts}`);
    practitionerNoLicence = await createTestUser(`cpd-prac-nolicence-${ts}`);

    const { error: staffErr } = await admin.from('staff').insert({
      email: bodyAdmin.email,
      role: 'body_admin',
      full_name: 'RLS CPD Test Body Admin',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (staffErr) throw new Error(`staff fixture: ${staffErr.message}`);
    // Not tracked for cleanup: this staff row becomes permanently pinned once
    // cpdEventId (created_by = its id) earns a credit — see header.

    const { data: staffRow, error: staffLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', bodyAdmin.email)
      .single();
    if (staffLookupErr || !staffRow) throw new Error(`staff lookup: ${staffLookupErr?.message}`);
    bodyAdminStaffId = staffRow.id as string;

    const eventBase = {
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3_600_000).toISOString(),
      timezone: 'Asia/Hong_Kong',
      created_by: bodyAdminStaffId,
      venue_name: 'Test Venue',
      city: 'Hong Kong',
      country: 'HK',
      latitude: 22.3,
      longitude: 114.2,
      status: 'published',
    };

    const { data: cpdEvent, error: cpdErr } = await admin
      .from('events')
      .insert({ ...eventBase, title: `attendance_issuance CPD fixture — DELETE ME ${ts}`, accrediting_body_id: bodyId, cpd_hours: 3 })
      .select('id')
      .single();
    if (cpdErr || !cpdEvent) throw new Error(`cpd event fixture: ${cpdErr?.message}`);
    cpdEventId = cpdEvent.id as string;

    const { data: nonCpdEvent, error: nonCpdErr } = await admin
      .from('events')
      .insert({ ...eventBase, title: `attendance_issuance non-CPD fixture — DELETE ME ${ts}` })
      .select('id')
      .single();
    if (nonCpdErr || !nonCpdEvent) throw new Error(`non-CPD event fixture: ${nonCpdErr?.message}`);
    nonCpdEventId = nonCpdEvent.id as string;

    await verifiedLicence(practitionerA, `RLS-CPD-A-${ts}`);
    await verifiedLicence(practitionerB, `RLS-CPD-B-${ts}`);
    // practitionerNoLicence intentionally gets no licence at all.
  }, 60_000);

  afterAll(async () => {
    // credit_ledger rows, and everything they now transitively pin via NO ACTION
    // FKs (see the file header), are intentionally left in place: cpdEventId,
    // bodyId, practitionerA/B's practitioner_licences + auth users. Only clean
    // what carries zero credit reference.
    if (registrationIds.length > 0) {
      await mustDelete(admin.from('registrations').delete().in('id', registrationIds), 'registrations fixture');
    }
    await mustDelete(admin.from('events').delete().eq('id', nonCpdEventId), 'non-CPD event fixture');
    // bodyAdmin's staff row is NOT deleted (permanently pinned by cpdEventId,
    // see header) — but its auth user has no such FK, so deleteTestUser is safe.
    for (const u of [bodyAdmin, practitionerNoLicence]) {
      if (u) await deleteTestUser(u);
    }
    // practitionerA/B are NOT deleted at all — see header (their licences earn
    // real credits, which permanently pins them via credit_ledger's NO ACTION FKs).
  }, 60_000);

  it('a fresh attendance issues one attendance_verified credit; a repeat call is idempotent; chain stays valid', async () => {
    // One registration_code, called twice — models both real call sites sharing
    // the same code (self-check-in vs. staff scan, or a retry), not two distinct
    // registrations (which would collide on registrations_event_id_email_key).
    const code = await makeRegistration(cpdEventId, practitionerA, `SEQ${ts}`);

    const first = await admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code });
    expect(first.error).toBeNull();
    expect(first.data).toBe('issued');

    const rows = await creditsFor(practitionerA.id, cpdEventId);
    expect(rows).toHaveLength(1);
    expect(rows[0].entry_type).toBe('credit_earned');
    expect(rows[0].attestation_status).toBe('attendance_verified');
    expect(Number(rows[0].hours)).toBe(3);

    const { data: chain, error: chainErr } = await admin.rpc('verify_ledger_chain');
    expect(chainErr).toBeNull();
    const broken = (chain as ChainRow[]).filter((r) => !r.link_valid || !r.content_valid);
    expect(broken).toHaveLength(0);

    // Repeat call — idempotent, still exactly one credit.
    const second = await admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code });
    expect(second.error).toBeNull();
    expect(second.data).toBe('already');
    expect(await creditsFor(practitionerA.id, cpdEventId)).toHaveLength(1);
  }, 30_000);

  it('a true concurrent race on a fresh registration still yields exactly one credit', async () => {
    const code = await makeRegistration(cpdEventId, practitionerB, `RACE${ts}`);
    const [r1, r2] = await Promise.all([
      admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code }),
      admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code }),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const results = [r1.data, r2.data].sort();
    expect(results).toEqual(['already', 'issued']);

    const rows = await creditsFor(practitionerB.id, cpdEventId);
    expect(rows).toHaveLength(1);
  }, 30_000);

  it('a non-CPD event (no accrediting_body_id / cpd_hours) never writes a credit', async () => {
    const code = await makeRegistration(nonCpdEventId, practitionerA, `NONCPD${ts}`);
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: nonCpdEventId,
      p_registration_code: code,
    });
    expect(error).toBeNull();
    expect(data).toBe('skipped:not_cpd');

    const rows = await creditsFor(practitionerA.id, nonCpdEventId);
    expect(rows).toHaveLength(0);
  }, 30_000);

  it('an attendee with no licence at the event body writes no credit (skipped, not failed)', async () => {
    const code = await makeRegistration(cpdEventId, practitionerNoLicence, `NOLIC${ts}`);
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: cpdEventId,
      p_registration_code: code,
    });
    expect(error).toBeNull();
    expect(data).toBe('skipped:no_licence');

    const rows = await creditsFor(practitionerNoLicence.id, cpdEventId);
    expect(rows).toHaveLength(0);
  }, 30_000);
});
