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
  let practitioner: TestUser;
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
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-FREEZE-${ts}`,
        full_name: 'RLS Test Body (freeze-trigger fixture)',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    const bodyAdmin = await createTestUser(`freeze-body-admin-${ts}`);
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
  }, 60_000);

  afterAll(async () => {
    // creditedEventId (and transitively its practitioner/licence/staff) is
    // permanently pinned by the credit_ledger row's NO ACTION FKs — same
    // accepted-debt class as attendance_issuance.rls.test.ts. Only the
    // uncredited control event carries zero credit reference.
    await mustDelete(admin.from('events').delete().eq('id', uncreditedEventId), 'uncredited event fixture');
  }, 30_000);

  it('blocks changing cpd_hours or accrediting_body_id on an event that already has a credit', async () => {
    const { error: hoursErr } = await admin.from('events').update({ cpd_hours: 5 }).eq('id', creditedEventId);
    expect(hoursErr?.code).toBe('22023');

    const { data: otherBody } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: DEFAULT_ORG,
        short_name: `RLS-FREEZE-OTHER-${ts}`,
        full_name: 'RLS Test Body (freeze-trigger, unreferenced)',
        cycle_config: {},
        category_taxonomy: {},
      })
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
});
