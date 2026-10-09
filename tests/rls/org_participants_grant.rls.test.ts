// Cross-org read via get_org_participants (found 2026-10-01).
//
// get_org_participants(p_org_id) is SECURITY DEFINER, takes the organisation id as a
// CALLER argument and checks nothing, yet 20260911010000 granted EXECUTE to
// `authenticated`. Attendee sign-up is open, so any throwaway account could call
// /rest/v1/rpc/get_org_participants with any organisation's id (readable from its
// public events) and receive that organisation's registrants' names and emails.
// The only legitimate application caller, app/participants/actions.ts, uses the
// service-role client with the signed-in organiser's server-derived organisation id.
//
// Closed by the get_org_participants_service_role_only migration: EXECUTE revoked
// from anon/authenticated/public, and the function switched to SECURITY INVOKER so
// a future re-grant still runs inside RLS. service_role keeps EXECUTE.
//
// Gated on RLS_TESTS. Local stack only: tests/helpers/clients.ts refuses otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createAnonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const ts = Date.now();

describe.skipIf(!process.env.RLS_TESTS)('get_org_participants — service-role only', () => {
  let orgId: string;
  let staffId: string;
  let eventId: string;
  let attendee: TestUser | null = null;
  const registrantEmail = `org-participants-reg-${ts}@rls-test.invalid`;

  beforeAll(async () => {
    const org = await admin
      .from('organisations')
      .insert({ name: `Org participants fixture ${ts}`, slug: `org-participants-${ts}` })
      .select('id')
      .single();
    if (org.error || !org.data) throw new Error(`organisation fixture: ${org.error?.message}`);
    orgId = org.data.id as string;

    const staff = await admin
      .from('staff')
      .insert({ email: `org-participants-staff-${ts}@rls-test.invalid`, role: 'organiser_admin', organisation_id: orgId })
      .select('id')
      .single();
    if (staff.error || !staff.data) throw new Error(`staff fixture: ${staff.error?.message}`);
    staffId = staff.data.id as string;

    const ev = await admin
      .from('events')
      .insert({
        title: 'Org participants fixture — DELETE ME',
        start_time: new Date(Date.now() + 3_600_000).toISOString(),
        end_time: new Date(Date.now() + 7_200_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: staffId,
        venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
        status: 'published',
      })
      .select('id')
      .single();
    if (ev.error || !ev.data) throw new Error(`event fixture: ${ev.error?.message}`);
    eventId = ev.data.id as string;

    const reg = await admin.from('registrations').insert({
      event_id: eventId,
      email: registrantEmail,
      full_name: 'Org Participants Registrant',
      registration_code: `WK-OP${String(ts).slice(-5)}`,
    });
    if (reg.error) throw new Error(`registration fixture: ${reg.error.message}`);
  }, 60_000);

  afterAll(async () => {
    if (attendee) await deleteTestUser(attendee);
    if (eventId) {
      await mustDelete(admin.from('registrations').delete().eq('event_id', eventId), 'registrations');
      await mustDelete(admin.from('events').delete().eq('id', eventId), 'events');
    }
    if (staffId) await mustDelete(admin.from('staff').delete().eq('id', staffId), 'staff');
    if (orgId) await mustDelete(admin.from('organisations').delete().eq('id', orgId), 'organisations');
  });

  it('DENIES the anon role EXECUTE via rpc', async () => {
    const { data, error } = await createAnonClient().rpc('get_org_participants', { p_org_id: orgId });
    expect(error?.code).toBe('42501'); // permission denied for function
    expect(data).toBeNull();
  });

  it("DENIES a signed-in attendee EXECUTE, so they cannot read another organisation's registrants", async () => {
    attendee = await createTestUser(`org-participants-attendee-${ts}`);
    const { data, error } = await attendee.client.rpc('get_org_participants', { p_org_id: orgId });
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('STILL ALLOWS the service_role client (the Participants page path) and returns the registrant', async () => {
    const { data, error } = await admin.rpc('get_org_participants', { p_org_id: orgId });
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ email: registrantEmail, full_name: 'Org Participants Registrant', events_count: 1, attended_count: 0 }),
    ]);
  });
});
