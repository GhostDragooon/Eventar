// ADR-0003 evidence layer — participation_evidence RLS probes against the
// local dev stack. Regression cover for 20260912020000_evidence_org_scope_fix,
// which closed TWO holes in the table's original policies (20260912000000):
//   1. participation_evidence_organizer_select_own gated on
//      e.created_by = current_staff_id() instead of org membership.
//   2. participation_evidence_manager_select_all gated on is_manager() alone
//      (true for organiser_admin OR eventar_staff, no org filter) — any
//      organiser_admin in ANY organisation could read every organisation's
//      evidence through this policy, independent of #1. crossOrgStaff below
//      is deliberately 'organiser_admin' (not 'organiser_member') so the
//      cross-org denial test actually exercises this policy, not just #1 —
//      an 'organiser_member' cross-org fixture would pass even with hole #2
//      wide open, since is_manager() doesn't match that role either way.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('participation_evidence RLS', () => {
  let creator: TestUser; // created the event
  let teammate: TestUser; // same org, did NOT create the event
  let crossOrgStaff: TestUser; // different org entirely
  let attendee: TestUser; // the registrant the evidence row is about
  let otherOrgId: string;
  let creatorStaffId: string;
  let eventId: string;
  let registrationId: string;
  let evidenceId: string;
  const staffEmails: string[] = [];

  beforeAll(async () => {
    const { data: org, error: orgError } = await admin
      .from('organisations')
      .insert({ name: 'RLS Test Org 2 (participation_evidence)', slug: `rls-test-org-2-evidence-${Date.now()}` })
      .select('id')
      .single();
    if (orgError || !org) throw new Error(`org fixture: ${orgError?.message}`);
    otherOrgId = org.id as string;

    creator = await createTestUser('evidence-creator');
    teammate = await createTestUser('evidence-teammate');
    crossOrgStaff = await createTestUser('evidence-crossorg');
    attendee = await createTestUser('evidence-attendee');

    const { error: staffErr } = await admin.from('staff').insert([
      {
        email: creator.email,
        role: 'organiser_member',
        full_name: 'RLS Test Evidence Creator',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
      {
        email: teammate.email,
        role: 'organiser_member',
        full_name: 'RLS Test Evidence Teammate',
        organisation_id: DEFAULT_ORG,
        status: 'active',
      },
      {
        // organiser_admin, not organiser_member — is_manager() matches
        // organiser_admin/eventar_staff, so this is the role that actually
        // exercises the manager-policy hole (see header comment).
        email: crossOrgStaff.email,
        role: 'organiser_admin',
        full_name: 'RLS Test Evidence Cross-Org Staff',
        organisation_id: otherOrgId,
        status: 'active',
      },
    ]);
    if (staffErr) throw new Error(`staff fixture: ${staffErr.message}`);
    staffEmails.push(creator.email, teammate.email, crossOrgStaff.email);

    const { data: creatorStaff, error: creatorLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', creator.email)
      .single();
    if (creatorLookupErr || !creatorStaff) throw new Error(`creator staff lookup: ${creatorLookupErr?.message}`);
    creatorStaffId = creatorStaff.id as string;

    const { data: event, error: eventErr } = await admin
      .from('events')
      .insert({
        title: 'participation_evidence RLS fixture — DELETE ME',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: creatorStaffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'published',
        organisation_id: DEFAULT_ORG,
      })
      .select('id')
      .single();
    if (eventErr || !event) throw new Error(`event fixture: ${eventErr?.message}`);
    eventId = event.id as string;

    const { data: reg, error: regErr } = await admin
      .from('registrations')
      .insert({
        event_id: eventId,
        email: 'evidence-fixture@rls-test.invalid',
        full_name: 'RLS Test Evidence Attendee',
        status: 'attended',
        registration_code: 'WK-EVID01',
        user_id: attendee.id,
      })
      .select('id')
      .single();
    if (regErr || !reg) throw new Error(`registration fixture: ${regErr?.message}`);
    registrationId = reg.id as string;

    // record_participation_evidence is service_role-only (Hard Rule 11 —
    // grant-level revoke, not just RLS) — write the fixture row via admin.
    // actor_id references public.users(id) (auth.uid()), NOT staff.id —
    // mark_attended's own calls pass auth.uid()/a registrant's user_id, never
    // a staff row id, so the fixture mirrors that with the attendee's id.
    const { data: evId, error: evErr } = await admin.rpc('record_participation_evidence', {
      p_organisation_id: DEFAULT_ORG,
      p_event_id: eventId,
      p_registration_id: registrationId,
      p_user_id: attendee.id,
      p_evidence_type: 'check_in',
      p_capture_method: 'manual_entry',
      p_source: 'administrative',
      p_attestation_strength: 'standard',
      p_actor_id: attendee.id,
    });
    if (evErr || !evId) throw new Error(`evidence fixture: ${evErr?.message}`);
    evidenceId = evId as string;
  }, 60_000);

  afterAll(async () => {
    if (evidenceId) await mustDelete(admin.from('participation_evidence').delete().eq('id', evidenceId), 'participation_evidence fixture');
    if (registrationId) await mustDelete(admin.from('registrations').delete().eq('id', registrationId), 'registrations fixture');
    if (eventId) await mustDelete(admin.from('events').delete().eq('id', eventId), 'events fixture');
    if (staffEmails.length > 0) await mustDelete(admin.from('staff').delete().in('email', staffEmails), 'staff fixture');
    for (const u of [creator, teammate, crossOrgStaff, attendee]) if (u) await deleteTestUser(u);
    if (otherOrgId) await mustDelete(admin.from('organisations').delete().eq('id', otherOrgId), 'organisations fixture');
  }, 60_000);

  it('a same-org teammate (not the event creator) can SELECT evidence for the org\'s event', async () => {
    const { data, error } = await teammate.client
      .from('participation_evidence')
      .select('id')
      .eq('id', evidenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('an organiser_admin from a different organisation cannot SELECT the evidence row (manager-policy org scope)', async () => {
    const { data, error } = await crossOrgStaff.client
      .from('participation_evidence')
      .select('id')
      .eq('id', evidenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('the attendee the evidence is about can read their own row via the self-read policy', async () => {
    const { data, error } = await attendee.client
      .from('participation_evidence')
      .select('id')
      .eq('id', evidenceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // 42501 specifically, not a bare "an error occurred" (Hard Rule 11): a
  // syntactically-invalid value fails on type coercion too, which would let
  // this test stay green even if the grant revoke were ever accidentally
  // restored. Postgres checks table-level privilege before coercing values,
  // so 42501 fires regardless — but the insert payload is still kept valid
  // (a real hex-encoded bytea) so a future grant restoration surfaces as
  // this test's expected value actually changing, not as a different error
  // class masking the same "still red" result.
  it('nobody can UPDATE or DELETE directly — writer is record_participation_evidence only', async () => {
    const updateRes = await teammate.client
      .from('participation_evidence')
      .update({ attestation_strength: 'weak' })
      .eq('id', evidenceId);
    expect(updateRes.error?.code).toBe('42501');

    const deleteRes = await teammate.client.from('participation_evidence').delete().eq('id', evidenceId);
    expect(deleteRes.error?.code).toBe('42501');
  });
});
