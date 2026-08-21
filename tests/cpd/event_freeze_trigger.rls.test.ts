// CPD MVP Stage 8 — freeze_cpd_config_if_credited() trigger, live invariant
// test. Once a credit_ledger row references an event, changing that event's
// cpd_hours/accrediting_body_id must be rejected (22023) so future issuance
// can't drift off the config earlier credits were snapshot against. Everything
// else on the row — and the same fields on an event nothing has credited yet —
// must still work. Runs against the real Postgres trigger (SECURITY DEFINER:
// an event owner has no RLS-visibility into credit_ledger for someone else's
// credits, so an invoker-rights trigger would see zero rows and never fire).
//
// Disposable fixtures — own accrediting body, event, practitioner+licence.
// Same accepted-debt class as tests/cpd/attendance_issuance.rls.test.ts: once
// record_credit_entry posts a row, its licence/practitioner/event/staff become
// permanently undeletable (credit_ledger's NO ACTION FKs) — only the uncredited
// control event is cleaned up.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('freeze_cpd_config_if_credited — event-config freeze trigger', () => {
  let bodyAdminStaffId: string;
  // The staff account that OWNS the event fixtures — needed as a real
  // authenticated JWT for the HIGH-1 column-lock tests (created_by =
  // current_staff_id(), so RLS passes and only the grant can deny).
  let eventOwner: TestUser;
  let practitioner: TestUser;
  // C5's granular CRUD functions require organiser_admin/eventar_staff —
  // eventOwner's staff role above is body_admin (this file's own fixture,
  // unrelated to C5), which resolve_actor's role filter rejects before ever
  // reaching the freeze check. A minimal eventar_staff actor closes that gap.
  let c5StaffId: string;
  let bodyId: string;
  let creditedEventId: string;
  let uncreditedEventId: string;
  const ts = Date.now();

  async function makeEvent(title: string, cpdHours: number): Promise<string> {
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
        accrediting_body_id: bodyId,
        cpd_hours: cpdHours,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`event fixture: ${error?.message}`);
    return data.id as string;
  }

  beforeAll(async () => {
    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      // SENTINEL, reused across runs — see roster_eligibility for the full note.
      .upsert({
        organisation_id: DEFAULT_ORG,
        short_name: 'RLS-FREEZE-FIXTURE',
        full_name: 'RLS Test Body (freeze-trigger fixture)',
        // Pre-existing gap, found running this file on a freshly-reset local
        // stack: without this, a first-ever insert of this sentinel takes
        // the column default ('onboarding'), which declare_licence's
        // active-body check (DEFERRED item 30) correctly rejects. Every
        // sibling fixture in this test suite sets this explicitly; this one
        // only worked before because the sentinel row already existed
        // active from an earlier run.
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      }, { onConflict: 'organisation_id,short_name' })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    eventOwner = await createTestUser(`freeze-body-admin-${ts}`);
    const bodyAdmin = eventOwner;
    practitioner = await createTestUser(`freeze-prac-${ts}`);

    const { error: staffErr } = await admin.from('staff').insert({
      email: bodyAdmin.email,
      role: 'body_admin',
      full_name: 'RLS Freeze-Trigger Test Body Admin',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (staffErr) throw new Error(`staff fixture: ${staffErr.message}`);
    // Not tracked for cleanup: permanently pinned once creditedEventId
    // (created_by = its id) earns a credit — see header.

    const { data: staffRow, error: staffLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', bodyAdmin.email)
      .single();
    if (staffLookupErr || !staffRow) throw new Error(`staff lookup: ${staffLookupErr?.message}`);
    bodyAdminStaffId = staffRow.id as string;

    creditedEventId = await makeEvent(`freeze-trigger CREDITED fixture — DELETE ME ${ts}`, 3);
    uncreditedEventId = await makeEvent(`freeze-trigger UNCREDITED fixture — DELETE ME ${ts}`, 3);

    const { data: licence, error: declErr } = await practitioner.client.rpc('declare_licence', {
      p_body_id: bodyId,
      p_licence_number: `RLS-FREEZE-${ts}`,
    });
    if (declErr || !licence) throw new Error(`declare_licence fixture: ${declErr?.message}`);
    const licenceId = (licence as { id: string }).id;

    const { error: creditErr } = await admin.rpc('record_credit_entry', {
      p_licence_id: licenceId,
      p_user_id: practitioner.id,
      p_event_id: creditedEventId,
      p_body_id: bodyId,
      p_entry_type: 'credit_earned',
      p_points: null,
      p_hours: 3,
      p_category: null,
      p_effective_date: new Date().toISOString().slice(0, 10),
      p_attestation_status: 'attendance_verified',
    });
    if (creditErr) throw new Error(`record_credit_entry fixture: ${creditErr.message}`);

    // add_event_accreditation_group checks org-authorisation before it ever
    // reaches the freeze check (same guard order as set_event_cpd_config) —
    // this file's original fixture never needed one, since its own tests
    // only ever UPDATE events directly via the admin client, bypassing that
    // check entirely.
    const { error: authErr } = await admin
      .from('organisation_body_authorisations')
      .upsert({ organisation_id: DEFAULT_ORG, body_id: bodyId, status: 'active' }, { onConflict: 'organisation_id,body_id' });
    if (authErr) throw new Error(`org authorisation fixture: ${authErr.message}`);

    const { data: c5Staff, error: c5StaffErr } = await admin
      .from('staff')
      .insert({
        email: `freeze-c5-staff-${ts}@example.com`,
        role: 'eventar_staff',
        full_name: 'RLS Freeze-Trigger C5 Staff',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      })
      .select('id')
      .single();
    if (c5StaffErr || !c5Staff) throw new Error(`c5 staff fixture: ${c5StaffErr?.message}`);
    c5StaffId = c5Staff.id as string;
  }, 60_000);

  afterAll(async () => {
    // creditedEventId (and transitively its practitioner/licence/staff) is
    // permanently pinned by the credit_ledger row's NO ACTION FKs — same
    // accepted-debt class as attendance_issuance.rls.test.ts. Only the
    // uncredited control event carries zero credit reference.
    await mustDelete(admin.from('events').delete().eq('id', uncreditedEventId), 'uncredited event fixture');
    await mustDelete(admin.from('staff').delete().eq('id', c5StaffId), 'c5 staff fixture');
  }, 30_000);

  it('blocks changing cpd_hours or accrediting_body_id on an event that already has a credit', async () => {
    const { error: hoursErr } = await admin.from('events').update({ cpd_hours: 5 }).eq('id', creditedEventId);
    expect(hoursErr?.code).toBe('22023');

    const { data: otherBody } = await admin
      .from('accrediting_bodies')
      .upsert({
        organisation_id: DEFAULT_ORG,
        short_name: 'RLS-FREEZE-OTHER-FIXTURE',
        full_name: 'RLS Test Body (freeze-trigger, unreferenced)',
        cycle_config: {},
        category_taxonomy: {},
      }, { onConflict: 'organisation_id,short_name' })
      .select('id')
      .single();
    const { error: bodyIdErr } = await admin
      .from('events')
      .update({ accrediting_body_id: otherBody!.id as string })
      .eq('id', creditedEventId);
    expect(bodyIdErr?.code).toBe('22023');
    await mustDelete(admin.from('accrediting_bodies').delete().eq('id', otherBody!.id as string), 'other body fixture');

    const { data: unchanged } = await admin
      .from('events')
      .select('cpd_hours, accrediting_body_id')
      .eq('id', creditedEventId)
      .single();
    expect(Number(unchanged!.cpd_hours)).toBe(3);
    expect(unchanged!.accrediting_body_id).toBe(bodyId);
  });

  it('allows an unrelated-field update on a credited event', async () => {
    const { error } = await admin
      .from('events')
      .update({ title: `freeze-trigger CREDITED fixture (touched) — DELETE ME ${ts}` })
      .eq('id', creditedEventId);
    expect(error).toBeNull();
  });

  it('allows cpd_hours/accrediting_body_id changes on an event with no credit', async () => {
    const { error } = await admin.from('events').update({ cpd_hours: 4 }).eq('id', uncreditedEventId);
    expect(error).toBeNull();
  });

  // --- HIGH-1 column lock (2026-07-25 three-lens review) -------------------
  // events_organizer_update_own is `for update to authenticated using
  // (created_by = current_staff_id())` with NO column restriction, and both CPD
  // columns carried a table-level UPDATE grant — so an organiser could bind
  // their own event to ANY accrediting body with any hours straight through
  // PostgREST, and every registrant with a verified licence at that body earned
  // a permanent credit the body never authorised. Closed at the GRANT layer
  // (Hard Rule 11's logic: RLS alone is not the control here).
  it('denies an authenticated organiser a direct write to the CPD config columns', async () => {
    const { error: hoursErr } = await eventOwner.client
      .from('events')
      .update({ cpd_hours: 99 })
      .eq('id', uncreditedEventId);
    // 42501 specifically — a bare "an error occurred" would also match an RLS
    // no-op or a constraint rejection, which prove nothing about the grant.
    expect(hoursErr?.code).toBe('42501');

    const { error: bodyErr } = await eventOwner.client
      .from('events')
      .update({ accrediting_body_id: bodyId })
      .eq('id', uncreditedEventId);
    expect(bodyErr?.code).toBe('42501');
  });

  it('still allows that organiser to update a non-CPD column (no over-revoke)', async () => {
    const { error } = await eventOwner.client
      .from('events')
      .update({ title: `freeze-trigger UNCREDITED fixture (owner touch) — DELETE ME ${ts}` })
      .eq('id', uncreditedEventId);
    expect(error).toBeNull();
  });

  it('rejects cpd_hours above the 24h ceiling', async () => {
    // Was `> 0` only, so 1e9 was legal and would be snapshotted immutably.
    const { error } = await admin.from('events').update({ cpd_hours: 999 }).eq('id', uncreditedEventId);
    expect(error?.code).toBe('23514');
  });

  // C5 (Task 10.8/10.9) added a second family of writers to the same three
  // tables the freeze triggers guard. Those functions deliberately do NOT
  // duplicate the credit-existence check themselves — this proves the
  // trigger they rely on instead actually fires for them too, not just for
  // the legacy set_event_cpd_config path exercised above.
  it('blocks add_event_accreditation_group on an event that already has a credit', async () => {
    const { error } = await admin.rpc('add_event_accreditation_group', {
      p_event_id: creditedEventId,
      p_body_id: bodyId,
      p_category_code: null,
      p_unit: 'hours',
      p_award_scheme: 'proportional',
      p_actor_override: c5StaffId,
    });
    expect(error?.code).toBe('22023');
  });
});
