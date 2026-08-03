// M2 — check-in mode reachable from the organiser form.
//
// THE HOLE THIS CLOSES: events.checkin_modes has existed since migration
// 20260701222914 with a NOT NULL default of {"staff": true, "self_serve":
// false}, and NOTHING in the event create/edit UI ever wrote it. Every event
// created through the product was staff-only, so its attendees' passes all
// read "Self check-in isn't enabled for this event — please see reception"
// while the whole self_check_in() path sat built, rate-limited, wired to
// award_attendance_credit() and RLS-tested — and unreachable.
//
// WHY NOT AN AUDITED DEFINER FUNCTION (the set_event_cpd_config treatment):
//   1. `authenticated` ALREADY holds column-level UPDATE on checkin_modes
//      (verified live: has_column_privilege → true, unlike cpd_hours /
//      accrediting_body_id, which 20260725144446 revoked). A definer without
//      a matching revoke would audit the product path and leave the raw
//      PostgREST path wide open — theatre, not a gate.
//   2. HIGH-1 needed the definer because an organiser was asserting ANOTHER
//      organisation's authority (binding any accrediting body, any hours).
//      How the door is run at their own event is squarely their own authority.
//   3. Per-attendance provenance is ALREADY in the audit chain: mark_attended
//      writes actor_role = <staff role> + payload.via = 'staff_scan';
//      self_check_in writes actor_role = 'self_check_in', actor_user_id null.
//      An auditor can already tell self from staff for every check-in, so
//      auditing the toggle adds nothing they cannot derive.
//   4. Rule 11 (convention): migration 20260702105349 states the established
//      pattern verbatim — "adding an event field = re-create the RPCs with the
//      new columns". The CPD columns are the documented exception.
//
// STILL TRUE AND NOT CLOSED HERE: self_check_in() does not read the flag
// (verified live in pg_proc.prosrc). It gates the UI, not the RPC — anyone
// holding a valid registration code can already self-check-in on any event.
// Tracked in docs/DEFERRED.md; this change does not widen that surface.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const STAFF_ONLY = { staff: true, self_serve: false };
const SELF_SERVE = { staff: true, self_serve: true };

type CheckinModes = { staff: boolean; self_serve: boolean };

describe.skipIf(!process.env.RLS_TESTS)('events.checkin_modes through the event RPCs', () => {
  let owner: TestUser;
  let ownerStaffId: string;
  const eventIds: string[] = [];
  const staffEmails: string[] = [];

  // Mirrors what app/events/new/actions.ts sends after Zod: the complete
  // full-replace payload. Anything the RPC whitelists but this omits would be
  // overwritten to NULL, which is exactly the class of bug being guarded.
  function eventInput(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      title: 'checkin_modes RLS fixture — DELETE ME',
      topic: 'Testing',
      description: 'fixture',
      start_time: new Date(Date.now() + 86_400_000).toISOString(),
      end_time: new Date(Date.now() + 90_000_000).toISOString(),
      timezone: 'Asia/Hong_Kong',
      venue_name: 'Test Venue',
      venue_address: '1 Test Road',
      city: 'Hong Kong',
      region: 'HK',
      country: 'HK',
      latitude: 22.3,
      longitude: 114.2,
      ...over,
    };
  }

  async function readModes(eventId: string): Promise<CheckinModes> {
    const { data, error } = await admin
      .from('events')
      .select('checkin_modes')
      .eq('id', eventId)
      .single();
    if (error) throw new Error(`readModes: ${error.message}`);
    return data.checkin_modes as CheckinModes;
  }

  async function createVia(over: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await owner.client.rpc('create_event_with_blocks', {
      event_input: eventInput(over),
      blocks_input: [],
    });
    if (error) throw new Error(`create_event_with_blocks: ${error.message}`);
    eventIds.push(data as string);
    return data as string;
  }

  beforeAll(async () => {
    owner = await createTestUser('checkinmodes-owner');
    staffEmails.push(owner.email);
    const { error } = await admin.from('staff').insert({
      email: owner.email,
      role: 'organiser_member',
      full_name: 'RLS Test Owner',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture: ${error.message}`);
    const { data } = await admin.from('staff').select('id').eq('email', owner.email).single();
    ownerStaffId = data!.id as string;
    expect(ownerStaffId).toBeTruthy();
  });

  afterEach(async () => {
    while (eventIds.length) {
      await mustDelete(admin.from('events').delete().eq('id', eventIds.pop()!), 'events');
    }
  });

  afterAll(async () => {
    for (const email of staffEmails) {
      await mustDelete(admin.from('staff').delete().eq('email', email), 'staff');
    }
    await deleteTestUser(owner);
  });

  it('create_event_with_blocks persists self-serve when the organiser enables it', async () => {
    const id = await createVia({ checkin_modes: SELF_SERVE });
    expect(await readModes(id)).toEqual(SELF_SERVE);
  });

  it('create_event_with_blocks falls back to the column default when the key is absent', async () => {
    // Every pre-existing caller (seed scripts, other RLS fixtures) omits the
    // key. Absent must mean staff-only, never NULL — the column is NOT NULL.
    const id = await createVia();
    expect(await readModes(id)).toEqual(STAFF_ONLY);
  });

  it('update_event_with_blocks turns self-serve on for an existing event', async () => {
    const id = await createVia();
    const { error } = await owner.client.rpc('update_event_with_blocks', {
      event_id_input: id,
      event_input: eventInput({ checkin_modes: SELF_SERVE }),
      blocks_input: [],
    });
    expect(error).toBeNull();
    expect(await readModes(id)).toEqual(SELF_SERVE);
  });

  it('update_event_with_blocks turns self-serve back off (the kill switch)', async () => {
    const id = await createVia({ checkin_modes: SELF_SERVE });
    const { error } = await owner.client.rpc('update_event_with_blocks', {
      event_id_input: id,
      event_input: eventInput({ checkin_modes: STAFF_ONLY }),
      blocks_input: [],
    });
    expect(error).toBeNull();
    expect(await readModes(id)).toEqual(STAFF_ONLY);
  });

  it('an update payload omitting checkin_modes keeps the current value', async () => {
    // The RPC is full-replace: absent nullable keys overwrite to NULL. On a
    // NOT NULL column that is a 23502 crash, and coalescing to the column
    // DEFAULT instead would silently disable self-serve for any older caller
    // that does not send the key. Neither is acceptable — keep what is there.
    const id = await createVia({ checkin_modes: SELF_SERVE });
    const { error } = await owner.client.rpc('update_event_with_blocks', {
      event_id_input: id,
      event_input: eventInput(),
      blocks_input: [],
    });
    expect(error).toBeNull();
    expect(await readModes(id)).toEqual(SELF_SERVE);
  });

  it('rejects a malformed checkin_modes shape with 23514, not silently', async () => {
    // Layer 3 of the three-layer validation. The read side does
    // `checkin_modes?.self_serve === true`, so a truthy-but-not-boolean value
    // would read as OFF forever with no error anywhere (rule 12). Asserted on
    // the exact SQLSTATE: a bare "an error occurred" would also match a NOT
    // NULL violation or an RLS denial, which prove nothing about the CHECK.
    const id = await createVia();
    const { error } = await admin
      .from('events')
      .update({ checkin_modes: { staff: true, self_serve: 'yes' } })
      .eq('id', id);
    expect(error?.code).toBe('23514');
    expect(await readModes(id)).toEqual(STAFF_ONLY);
  });

  it('rejects a checkin_modes object missing self_serve with 23514', async () => {
    // The NULL trap: `jsonb_typeof(col->'missing_key')` is SQL NULL, and a
    // CHECK whose expression evaluates to NULL PASSES. Without the `is true`
    // wrapper this exact case would slip through.
    const id = await createVia();
    const { error } = await admin
      .from('events')
      .update({ checkin_modes: { staff: true } })
      .eq('id', id);
    expect(error?.code).toBe('23514');
    expect(await readModes(id)).toEqual(STAFF_ONLY);
  });

  it('rejects a jsonb-null checkin_modes with 23514', async () => {
    // Same NULL trap one level up: jsonb 'null' is NOT SQL NULL, so it
    // satisfies the NOT NULL column constraint and then indexes to SQL NULL
    // on every key lookup.
    const id = await createVia();
    const { error } = await admin
      .from('events')
      .update({ checkin_modes: null })
      .eq('id', id);
    // PostgREST sends JSON null as SQL NULL → NOT NULL violation (23502);
    // either way it must be refused, and the row must not change.
    expect(['23514', '23502']).toContain(error?.code);
    expect(await readModes(id)).toEqual(STAFF_ONLY);
  });
});
