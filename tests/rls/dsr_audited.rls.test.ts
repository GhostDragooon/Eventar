// Sprint 2 / Task 7 — transition_dsr RLS + audit probes against the live
// dev project, as real JWTs.
//
// This is also the first automated regression coverage for
// app_private.require_active_staff (Task 2): app_private isn't
// PostgREST-exposed, so that gate could only be verified manually via raw
// SQL until transition_dsr (which calls it) shipped. Test its role-list
// filtering thoroughly, not just a single happy path.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('transition_dsr RLS + audit', () => {
  let nonStaff: TestUser;
  let managerStaff: TestUser;
  let eventarStaff: TestUser;
  let organizerStaff: TestUser;
  const dsrIds: string[] = [];
  const staffEmails: string[] = [];

  async function makeStaffFixture(
    localPart: string,
    role: 'organiser_admin' | 'eventar_staff' | 'organiser_member',
  ): Promise<TestUser> {
    const user = await createTestUser(localPart);
    const { error } = await admin.from('staff').insert({
      email: user.email,
      role,
      full_name: 'RLS Test Operator',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture (${role}): ${error.message}`);
    staffEmails.push(user.email);
    return user;
  }

  async function makeDsrFixture(subjectUserId: string): Promise<string> {
    const { data, error } = await admin
      .from('data_subject_requests')
      .insert({
        subject_user_id: subjectUserId,
        request_type: 'access',
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) throw new Error(`dsr fixture: ${error.message}`);
    dsrIds.push(data.id as string);
    return data.id as string;
  }

  beforeAll(async () => {
    nonStaff = await createTestUser('dsr-plain');
    managerStaff = await makeStaffFixture('dsr-manager', 'organiser_admin');
    eventarStaff = await makeStaffFixture('dsr-eventarstaff', 'eventar_staff');
    organizerStaff = await makeStaffFixture('dsr-organizer', 'organiser_member');
  }, 60_000);

  afterAll(async () => {
    if (dsrIds.length > 0) {
      await mustDelete(admin.from('data_subject_requests').delete().in('id', dsrIds), 'data_subject_requests fixture');
    }
    for (const email of staffEmails) {
      await mustDelete(admin.from('staff').delete().eq('email', email), `staff ${email}`);
    }
    for (const u of [nonStaff, managerStaff, eventarStaff, organizerStaff]) {
      if (u) await deleteTestUser(u);
    }
  }, 60_000);

  // ---- 1. non-staff caller is rejected (proves require_active_staff denies) ----
  it('non-staff caller gets 42501', async () => {
    const dsrId = await makeDsrFixture(nonStaff.id);
    const { data, error } = await nonStaff.client.rpc('transition_dsr', {
      p_id: dsrId,
      p_status: 'in_progress',
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');

    // Confirm the row was NOT transitioned.
    const { data: row } = await admin
      .from('data_subject_requests')
      .select('status')
      .eq('id', dsrId)
      .single();
    expect(row?.status).toBe('pending');
  });

  // ---- 2. active organiser_admin transitions a fixture DSR successfully ----
  it('active organiser_admin transitions a DSR to completed and writes an audit event', async () => {
    const dsrId = await makeDsrFixture(nonStaff.id);
    const { error } = await managerStaff.client.rpc('transition_dsr', {
      p_id: dsrId,
      p_status: 'completed',
      p_notes: 'resolved via test',
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from('data_subject_requests')
      .select('status, resolver_staff_id, resolution_notes, resolved_at')
      .eq('id', dsrId)
      .single();
    expect(row?.status).toBe('completed');
    expect(row?.resolver_staff_id).not.toBeNull();
    expect(row?.resolution_notes).toBe('resolved via test');
    expect(row?.resolved_at).not.toBeNull();

    const { data: ev } = await admin
      .from('audit_events')
      .select('event_type, subject_id, payload')
      .eq('event_type', 'dsr_transitioned')
      .eq('subject_id', dsrId)
      .maybeSingle();
    expect(ev).not.toBeNull();
    expect((ev?.payload as { status?: string })?.status).toBe('completed');
  });

  // ---- 3. active eventar_staff-role staff can also transition ----
  it('active eventar_staff caller can also transition a DSR', async () => {
    const dsrId = await makeDsrFixture(nonStaff.id);
    const { error } = await eventarStaff.client.rpc('transition_dsr', {
      p_id: dsrId,
      p_status: 'in_progress',
    });
    expect(error).toBeNull();

    const { data: row } = await admin
      .from('data_subject_requests')
      .select('status, resolver_staff_id')
      .eq('id', dsrId)
      .single();
    expect(row?.status).toBe('in_progress');
    expect(row?.resolver_staff_id).not.toBeNull();
  });

  // ---- 4. organiser_member staff (not organiser_admin/eventar_staff) is rejected ----
  it('active organiser_member staff (not in allowed role list) gets 42501', async () => {
    const dsrId = await makeDsrFixture(nonStaff.id);
    const { data, error } = await organizerStaff.client.rpc('transition_dsr', {
      p_id: dsrId,
      p_status: 'in_progress',
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');

    const { data: row } = await admin
      .from('data_subject_requests')
      .select('status')
      .eq('id', dsrId)
      .single();
    expect(row?.status).toBe('pending');
  });

  // ---- 5. invalid p_status is rejected (not 42501 — a later check) ----
  it('invalid p_status is rejected with a non-42501 error', async () => {
    const dsrId = await makeDsrFixture(nonStaff.id);
    const { data, error } = await managerStaff.client.rpc('transition_dsr', {
      p_id: dsrId,
      p_status: 'bogus_status',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).not.toBe('42501');

    const { data: row } = await admin
      .from('data_subject_requests')
      .select('status')
      .eq('id', dsrId)
      .single();
    expect(row?.status).toBe('pending');
  });

  // ---- 6. non-existent DSR id is rejected (distinct from gate/status errors) ----
  it('transitioning a non-existent DSR id is rejected', async () => {
    const { data, error } = await managerStaff.client.rpc('transition_dsr', {
      p_id: '00000000-0000-0000-0000-00000000dead',
      p_status: 'in_progress',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).not.toBe('42501');
    expect(error?.message).toMatch(/not found/);
  });
});
