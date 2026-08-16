// confirm_credit_entry() — the body-confirmation tier for credit_ledger,
// closing the narrow half of doctrine.md's M4/R5 open fork (Decisions Log
// Q38, 2026-08-15). Lets a body_admin/eventar_staff at the organisation
// owning a body post a new 'credit_confirmed' row referencing an
// already-posted 'credit_earned' row — append-only, never an UPDATE.
//
// Deliberately NOT in tests/cpd's test:rls-swept list. Every credit_earned
// fixture this file creates via record_credit_entry becomes permanently
// undeletable (credit_ledger's NO ACTION FKs) — same accepted-debt class as
// attendance_issuance.rls.test.ts / event_freeze_trigger.rls.test.ts. Run
// manually: RLS_TESTS=1 vitest run tests/cpd/confirm_credit_entry.rls.test.ts
// — never against Seoul (tests/helpers/clients.ts hard-throws if
// NEXT_PUBLIC_SUPABASE_URL isn't localhost).
//
// Gated: only runs under `pnpm test:rls`-style invocation (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type LedgerRow = {
  id: string;
  entry_type: string;
  attestation_status: string;
  references_entry_id: string | null;
  points: number | null;
  hours: number | null;
  category: string | null;
  effective_date: string;
  licence_id: string;
  user_id: string;
  event_id: string;
  body_id: string;
  actor_id: string | null;
};

type ChainRow = { link_valid: boolean; content_valid: boolean };

describe.skipIf(!process.env.RLS_TESTS)('confirm_credit_entry — body-confirmation attestation tier', () => {
  let bodyId: string;
  let bodyAdminStaffId: string;
  let bodyAdmin: TestUser; // DEFAULT_ORG — authorized to confirm this body's entries
  let otherOrgBodyAdmin: TestUser; // different org — should be rejected
  let nonStaffUser: TestUser;
  let practitioner: TestUser;
  let licenceId: string;
  let otherOrgId: string;
  const staffEmails: string[] = [];
  const ts = Date.now();

  async function makeStaffFixture(
    localPart: string,
    role: 'body_admin' | 'eventar_staff',
    organisationId: string,
    trackForCleanup = true,
  ): Promise<TestUser> {
    const user = await createTestUser(localPart);
    const { error } = await admin.from('staff').insert({
      email: user.email,
      role,
      full_name: 'RLS Test Body Admin',
      organisation_id: organisationId,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture (${role}): ${error.message}`);
    if (trackForCleanup) staffEmails.push(user.email);
    return user;
  }

  async function makeEvent(title: string): Promise<string> {
    const { data, error } = await admin
      .from('events')
      .insert({
        title,
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
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`event fixture: ${error?.message}`);
    return data.id as string;
  }

  async function makeCreditEarned(eventId: string): Promise<LedgerRow> {
    const { data, error } = await admin.rpc('record_credit_entry', {
      p_licence_id: licenceId,
      p_user_id: practitioner.id,
      p_event_id: eventId,
      p_body_id: bodyId,
      p_entry_type: 'credit_earned',
      p_points: null,
      p_hours: 3,
      p_category: null,
      p_effective_date: new Date().toISOString().slice(0, 10),
      p_attestation_status: 'attendance_verified',
    });
    if (error || !data) throw new Error(`credit_earned fixture: ${error?.message}`);
    return data as LedgerRow;
  }

  beforeAll(async () => {
    // Sentinel, reused across runs (permanently pinned once credited —
    // matches event_freeze_trigger.rls.test.ts's own fixture body).
    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .upsert(
        {
          organisation_id: DEFAULT_ORG,
          short_name: 'RLS-CONFIRM-FIXTURE',
          full_name: 'RLS Test Body (confirm_credit_entry fixture)',
          status: 'active',
          cycle_config: {},
          category_taxonomy: {},
        },
        { onConflict: 'organisation_id,short_name' },
      )
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    const { data: org, error: orgErr } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org (confirm_credit_entry)', slug: `rls-test-org-cce-${ts}` })
      .select('id')
      .single();
    if (orgErr || !org) throw new Error(`org fixture: ${orgErr?.message}`);
    otherOrgId = org.id as string;

    // trackForCleanup=false: bodyAdmin's staff row becomes the created_by of
    // every event fixture (below), and NO ACTION FKs pin the staff row
    // permanently once any of those events is credited (same accepted-debt
    // class as event_freeze_trigger.rls.test.ts's eventOwner). Attempting
    // deletion would fail loudly via mustDelete — correctly, per Rule 12 —
    // so it's simplest not to attempt it at all, matching that file's
    // precedent of never tracking its event-owning staff fixture for cleanup.
    // ts-suffixed (unlike the other fixtures below): this one is never
    // cleaned up (see the comment above), so its email must be unique per
    // run or a re-run collides with the previous run's permanent residue.
    bodyAdmin = await makeStaffFixture(`cce-body-admin-${ts}`, 'body_admin', DEFAULT_ORG, false);
    otherOrgBodyAdmin = await makeStaffFixture('cce-other-org-body-admin', 'body_admin', otherOrgId);

    const { data: staffRow, error: staffLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', bodyAdmin.email)
      .single();
    if (staffLookupErr || !staffRow) throw new Error(`staff lookup: ${staffLookupErr?.message}`);
    bodyAdminStaffId = staffRow.id as string;

    nonStaffUser = await createTestUser('cce-non-staff');
    // ts-suffixed — never cleaned up (its licence is referenced by permanent
    // credit_ledger rows once any test issues a credit), same reasoning as
    // bodyAdmin above.
    practitioner = await createTestUser(`cce-practitioner-${ts}`);

    const { data: licence, error: declErr } = await practitioner.client.rpc('declare_licence', {
      p_body_id: bodyId,
      p_licence_number: `RLS-CONFIRM-${ts}`,
    });
    if (declErr || !licence) throw new Error(`declare_licence fixture: ${declErr?.message}`);
    licenceId = (licence as { id: string }).id;
  }, 60_000);

  afterAll(async () => {
    for (const email of staffEmails) {
      await mustDelete(admin.from('staff').delete().eq('email', email), `staff ${email}`);
    }
    for (const u of [otherOrgBodyAdmin, nonStaffUser]) {
      if (u) await deleteTestUser(u);
    }
    // bodyAdmin and practitioner are NOT deleted — bodyAdmin's staff row is
    // permanently pinned as the created_by of credited events (see the
    // trackForCleanup=false note above); practitioner's licence is referenced
    // by permanent credit_ledger rows once any test issues a credit (NO ACTION FK), same
    // accepted-debt class as attendance_issuance.rls.test.ts. Event fixtures
    // are pinned the same way once credited, so none are cleaned up here.
    if (otherOrgId) {
      await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'organisations fixture');
    }
  }, 60_000);

  it('body_admin confirms a credit_earned row: new credit_confirmed row, correct shape, chain stays valid', async () => {
    const eventId = await makeEvent(`confirm-success fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const { data, error } = await bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(error).toBeNull();
    const row = data as LedgerRow;

    expect(row.entry_type).toBe('credit_confirmed');
    expect(row.attestation_status).toBe('body_confirmed');
    expect(row.references_entry_id).toBe(original.id);
    expect(row.licence_id).toBe(original.licence_id);
    expect(row.user_id).toBe(original.user_id);
    expect(row.event_id).toBe(original.event_id);
    expect(row.body_id).toBe(original.body_id);
    expect(Number(row.hours)).toBe(Number(original.hours));
    expect(row.points).toBe(original.points);
    expect(row.category).toBe(original.category);
    expect(row.effective_date).toBe(original.effective_date);
    expect(row.actor_id).toBe(bodyAdmin.id);

    const { data: chain, error: chainErr } = await admin.rpc('verify_ledger_chain');
    expect(chainErr).toBeNull();
    const broken = (chain as ChainRow[]).filter((r) => !r.link_valid || !r.content_valid);
    expect(broken).toHaveLength(0);
  }, 30_000);

  it('confirming the same entry twice is idempotent: same row returned, exactly one credit_confirmed row exists', async () => {
    const eventId = await makeEvent(`confirm-idempotent fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const first = await bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(first.error).toBeNull();
    const firstRow = first.data as LedgerRow;

    const second = await bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(second.error).toBeNull();
    const secondRow = second.data as LedgerRow;
    expect(secondRow.id).toBe(firstRow.id);

    const { data: confirmations, error: countErr } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('references_entry_id', original.id)
      .eq('entry_type', 'credit_confirmed');
    expect(countErr).toBeNull();
    expect(confirmations).toHaveLength(1);
  }, 30_000);

  it('a true concurrent double-confirm still yields exactly one credit_confirmed row', async () => {
    const eventId = await makeEvent(`confirm-race fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const [r1, r2] = await Promise.all([
      bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id }),
      bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id }),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect((r1.data as LedgerRow).id).toBe((r2.data as LedgerRow).id);

    const { data: confirmations, error: countErr } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('references_entry_id', original.id)
      .eq('entry_type', 'credit_confirmed');
    expect(countErr).toBeNull();
    expect(confirmations).toHaveLength(1);
  }, 30_000);

  it('non-staff caller is rejected with 42501, nothing posted', async () => {
    const eventId = await makeEvent(`confirm-nonstaff fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const { data, error } = await nonStaffUser.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');

    const { data: confirmations } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('references_entry_id', original.id)
      .eq('entry_type', 'credit_confirmed');
    expect(confirmations).toHaveLength(0);
  }, 30_000);

  it('body_admin of a DIFFERENT organisation is rejected with 42501, nothing posted', async () => {
    const eventId = await makeEvent(`confirm-wrongorg fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const { data, error } = await otherOrgBodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');

    const { data: confirmations } = await admin
      .from('credit_ledger')
      .select('id')
      .eq('references_entry_id', original.id)
      .eq('entry_type', 'credit_confirmed');
    expect(confirmations).toHaveLength(0);
  }, 30_000);

  it('a nonexistent entry id fails with P0002', async () => {
    const { data, error } = await bodyAdmin.client.rpc('confirm_credit_entry', {
      p_entry_id: '00000000-0000-0000-0000-000000000099',
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('P0002');
  }, 30_000);

  it('confirmation still succeeds when a compensating entry already exists, and flags it via audit_events (Q39, 2026-08-16)', async () => {
    const eventId = await makeEvent(`confirm-compensating-flag fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const { data: adjusted, error: adjustErr } = await admin.rpc('record_credit_entry', {
      p_licence_id: original.licence_id,
      p_user_id: original.user_id,
      p_event_id: original.event_id,
      p_body_id: original.body_id,
      p_entry_type: 'credit_adjusted',
      p_points: null,
      p_hours: 1,
      p_category: null,
      p_effective_date: original.effective_date,
      p_attestation_status: original.attestation_status,
      p_references_entry_id: original.id,
      p_reason: 'compensating-flag fixture: pre-existing adjustment',
    });
    if (adjustErr || !adjusted) throw new Error(`credit_adjusted fixture: ${adjustErr?.message}`);

    const { data, error } = await bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(error).toBeNull();
    const row = data as LedgerRow;
    expect(row.entry_type).toBe('credit_confirmed');
    expect(row.references_entry_id).toBe(original.id);

    const { data: flags, error: flagErr } = await admin
      .from('audit_events')
      .select('event_type, subject_type, subject_id, payload')
      .eq('event_type', 'credit_confirmation_flagged')
      .eq('subject_id', original.id);
    expect(flagErr).toBeNull();
    expect(flags).toHaveLength(1);
    expect(flags![0].subject_type).toBe('credit_ledger');
    expect(flags![0].payload).toMatchObject({
      original_entry_id: original.id,
      confirmed_entry_id: row.id,
      compensating_entry_id: (adjusted as LedgerRow).id,
      compensating_entry_type: 'credit_adjusted',
    });
  }, 30_000);

  it('confirming a non-credit_earned row (e.g. an already-confirmed one) fails with P0002', async () => {
    const eventId = await makeEvent(`confirm-wrongtype fixture — DELETE ME ${ts}`);
    const original = await makeCreditEarned(eventId);

    const confirmed = await bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: original.id });
    expect(confirmed.error).toBeNull();
    const confirmedRow = confirmed.data as LedgerRow;

    const { data, error } = await bodyAdmin.client.rpc('confirm_credit_entry', { p_entry_id: confirmedRow.id });
    expect(data).toBeNull();
    expect(error?.code).toBe('P0002');
  }, 30_000);
});
