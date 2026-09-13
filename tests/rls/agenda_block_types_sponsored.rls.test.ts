// Backtest for the 2026-09-13 agenda block type taxonomy overhaul
// (20260914000000_agenda_block_types_sponsored.sql). Exercises the REAL
// create_event_with_blocks RPC as a signed-in staff member would (not a
// direct table insert), then queries the row back — per the phase-completion
// protocol's backtest definition: execute the actual write, assert the
// observable outcome. Covers what the migration's own self-check (source
// inspection only) cannot: that a NEW primary/secondary kind and
// sponsored/sponsor_name actually persist through the RPC, and that a
// legacy kind (dropped from the UI, kept in the CHECK) still round-trips.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1), against the LOCAL
// stack only (tests/helpers/clients.ts refuses any other URL).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('agenda_blocks kind taxonomy + sponsored (backtest)', () => {
  let staffUser: TestUser;
  const eventIds: string[] = [];

  beforeAll(async () => {
    staffUser = await createTestUser('agenda-taxonomy-staff');
    const { error } = await admin.from('staff').insert({
      email: staffUser.email,
      role: 'organiser_member',
      full_name: 'RLS Test Staff (agenda taxonomy)',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (error) throw new Error(`staff fixture: ${error.message}`);
  });

  afterAll(async () => {
    for (const id of eventIds) {
      await mustDelete(admin.from('events').delete().eq('id', id), `events/${id}`);
    }
    await mustDelete(admin.from('staff').delete().eq('email', staffUser.email), 'staff');
    await deleteTestUser(staffUser);
  });

  async function createViaRpc(blocks: Record<string, unknown>[]) {
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 4 * 3_600_000);
    const { data, error } = await staffUser.client.rpc('create_event_with_blocks', {
      event_input: {
        title: 'Agenda taxonomy backtest — DELETE ME',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        timezone: 'Asia/Hong_Kong',
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'draft',
        created_by: staffUser.id,
      },
      blocks_input: blocks,
    });
    if (error) throw error;
    const eventId = data as string;
    eventIds.push(eventId);
    return eventId;
  }

  it('accepts a new primary kind (case_presentation) and persists sponsored + sponsor_name', async () => {
    const start = new Date(Date.now() + 90_000_000);
    const end = new Date(start.getTime() + 3_600_000);
    const eventId = await createViaRpc([{
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      kind: 'case_presentation',
      title: 'A tricky differential',
      host: 'Dr. Chan',
      topics: [],
      notes: '',
      display_order: 0,
      sponsored: true,
      sponsor_name: 'Acme Pharmaceuticals',
    }]);

    const { data: rows, error } = await admin
      .from('agenda_blocks')
      .select('kind, title, sponsored, sponsor_name')
      .eq('event_id', eventId);
    if (error) throw error;
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      kind: 'case_presentation',
      sponsored: true,
      sponsor_name: 'Acme Pharmaceuticals',
    });
  });

  it('accepts a new secondary kind (awards) with sponsored defaulting to false', async () => {
    const start = new Date(Date.now() + 100_000_000);
    const end = new Date(start.getTime() + 3_600_000);
    const eventId = await createViaRpc([{
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      kind: 'awards',
      title: 'Young Investigator Awards',
      host: '',
      topics: [],
      notes: '',
      display_order: 0,
    }]);

    const { data: rows, error } = await admin
      .from('agenda_blocks')
      .select('kind, sponsored, sponsor_name')
      .eq('event_id', eventId);
    if (error) throw error;
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ kind: 'awards', sponsored: false, sponsor_name: null });
  });

  it('still accepts a legacy kind dropped from the UI (transition) — existing rows stay valid', async () => {
    const start = new Date(Date.now() + 110_000_000);
    const end = new Date(start.getTime() + 900_000);
    const eventId = await createViaRpc([{
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      kind: 'transition',
      title: 'Walk to room B',
      host: '',
      topics: [],
      notes: '',
      display_order: 0,
    }]);

    const { data: rows, error } = await admin
      .from('agenda_blocks')
      .select('kind')
      .eq('event_id', eventId);
    if (error) throw error;
    expect(rows).toHaveLength(1);
    expect(rows![0]!.kind).toBe('transition');
  });

  it('still rejects a kind outside the widened CHECK constraint', async () => {
    await expect(createViaRpc([{
      start_time: new Date(Date.now() + 120_000_000).toISOString(),
      end_time: new Date(Date.now() + 120_003_600_000).toISOString(),
      kind: 'not_a_real_kind',
      title: 'Should not be insertable',
      host: '',
      topics: [],
      notes: '',
      display_order: 0,
    }])).rejects.toMatchObject({ code: '23514' });
  });
});
