// Task 10.8/10.9, sub-task C3 — live backtest of set_event_cpd_config's
// compatibility bridge (20260815020000_accreditation_groups_and_roles.sql):
// the single-body organiser surface now also syncs
// event_accreditation_groups/event_accreditations/event_accreditation_occurrences
// as a degenerate one-group case, the freeze extension blocks changes once
// an event has real credit, and the tie-validation trigger rejects an
// ambiguous explicit_schedule configuration. No RLS test file existed for
// set_event_cpd_config before this — follows event_freeze_trigger.rls.test.ts's
// fixture pattern (own body, own event, real practitioner/licence/credit for
// the freeze half) plus sqlSuperuser for the tie-trigger half (Hard Rule 11
// revokes direct writes to event_accreditation_occurrences from every app
// role including service_role, so only a superuser connection — bypassing
// PostgREST/grants entirely, local-only — can construct that fixture).
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, sqlSuperuser, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

type GroupRow = {
  id: string;
  body_id: string;
  category_code: string | null;
  unit: string | null;
  award_scheme: string;
};

describe.skipIf(!process.env.RLS_TESTS)('set_event_cpd_config — multi-body compatibility bridge', () => {
  let eventOwner: TestUser;
  let practitioner: TestUser;
  let ownerStaffId: string;
  let bodyId: string;
  let bodyId2: string;
  // Separate from bodyId/bodyId2 (which are deleted in afterAll): a
  // practitioner licence gets declared against this one for the freeze
  // test, and practitioner_licences.body_id has no cascade from
  // accrediting_bodies — deleting it afterward would fail with 23503. Same
  // accepted-debt shape as event_freeze_trigger.rls.test.ts's own body
  // fixture: a fixed, reused short_name via upsert (never a fresh row per
  // run), never deleted.
  let freezeBodyId: string;
  let uncreditedEventId: string;
  let creditedEventId: string;
  const ts = Date.now();

  async function makeEvent(title: string): Promise<string> {
    const { data, error } = await admin
      .from('events')
      .insert({
        title,
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: ownerStaffId,
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
    if (error || !data) throw new Error(`event fixture: ${error?.message}`);
    return data.id as string;
  }

  async function groupFor(eventId: string): Promise<GroupRow[]> {
    const { data, error } = await admin
      .from('event_accreditation_groups')
      .select('id, body_id, category_code, unit, award_scheme')
      .eq('event_id', eventId);
    if (error) throw new Error(`group lookup: ${error.message}`);
    return data as GroupRow[];
  }

  beforeAll(async () => {
    eventOwner = await createTestUser(`sec-owner-${ts}`);
    practitioner = await createTestUser(`sec-prac-${ts}`);

    const { error: staffErr } = await admin.from('staff').insert({
      email: eventOwner.email,
      role: 'organiser_admin',
      full_name: 'RLS set_event_cpd_config Test Owner',
      organisation_id: DEFAULT_ORG,
      status: 'active',
    });
    if (staffErr) throw new Error(`staff fixture: ${staffErr.message}`);
    const { data: staffRow, error: staffLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', eventOwner.email)
      .single();
    if (staffLookupErr || !staffRow) throw new Error(`staff lookup: ${staffLookupErr?.message}`);
    ownerStaffId = staffRow.id as string;

    for (const [short, ref] of [
      [`RLS-SEC-1-${ts}`, 'bodyId'],
      [`RLS-SEC-2-${ts}`, 'bodyId2'],
    ] as const) {
      const { data: body, error: bodyErr } = await admin
        .from('accrediting_bodies')
        .insert({
          organisation_id: DEFAULT_ORG,
          short_name: short,
          full_name: `RLS Test Body (set_event_cpd_config fixture, ${ref})`,
          status: 'active',
          cycle_config: {},
          category_taxonomy: {},
        })
        .select('id')
        .single();
      if (bodyErr || !body) throw new Error(`body fixture (${ref}): ${bodyErr?.message}`);
      if (ref === 'bodyId') bodyId = body.id as string;
      else bodyId2 = body.id as string;
    }

    const { data: freezeBody, error: freezeBodyErr } = await admin
      .from('accrediting_bodies')
      // SENTINEL, reused across runs — see roster_eligibility / event_freeze_trigger for the same pattern.
      .upsert(
        {
          organisation_id: DEFAULT_ORG,
          short_name: 'RLS-SEC-FREEZE-FIXTURE',
          full_name: 'RLS Test Body (set_event_cpd_config freeze fixture)',
          status: 'active',
          cycle_config: {},
          category_taxonomy: {},
        },
        { onConflict: 'organisation_id,short_name' },
      )
      .select('id')
      .single();
    if (freezeBodyErr || !freezeBody) throw new Error(`freeze body fixture: ${freezeBodyErr?.message}`);
    freezeBodyId = freezeBody.id as string;

    const { error: authErr } = await admin.from('organisation_body_authorisations').upsert(
      [
        { organisation_id: DEFAULT_ORG, body_id: bodyId, status: 'active' },
        { organisation_id: DEFAULT_ORG, body_id: bodyId2, status: 'active' },
        { organisation_id: DEFAULT_ORG, body_id: freezeBodyId, status: 'active' },
      ],
      { onConflict: 'organisation_id,body_id' },
    );
    if (authErr) throw new Error(`org authorisation fixture: ${authErr.message}`);

    uncreditedEventId = await makeEvent(`set_event_cpd_config UNCREDITED fixture — DELETE ME ${ts}`);
    creditedEventId = await makeEvent(`set_event_cpd_config CREDITED fixture — DELETE ME ${ts}`);
  }, 60_000);

  afterAll(async () => {
    // uncreditedEventId cascades fully (event_occurrences,
    // event_accreditation_groups -> event_accreditations ->
    // event_accreditation_occurrences — the occurrence_id FK is DEFERRABLE
    // INITIALLY DEFERRED specifically so this succeeds, see the migration).
    if (uncreditedEventId) {
      await mustDelete(admin.from('events').delete().eq('id', uncreditedEventId), 'uncredited event fixture');
    }
    // creditedEventId (and transitively freezeBodyId's practitioner licence)
    // is permanently pinned by credit_ledger's NO ACTION FK — same
    // accepted-debt class as event_freeze_trigger.rls.test.ts. freezeBodyId
    // itself is the reused sentinel row (see above) and is never deleted.
    if (bodyId) await mustDelete(admin.from('accrediting_bodies').delete().eq('id', bodyId), 'bodyId fixture');
    if (bodyId2) await mustDelete(admin.from('accrediting_bodies').delete().eq('id', bodyId2), 'bodyId2 fixture');
  }, 30_000);

  describe('compatibility bridge — sync into the multi-body tables', () => {
    it('setting accreditation creates exactly one group/accreditation/occurrence-link triple', async () => {
      const { error } = await eventOwner.client.rpc('set_event_cpd_config', {
        p_event_id: uncreditedEventId,
        p_body_id: bodyId,
        p_cpd_hours: 4.5,
      });
      expect(error).toBeNull();

      const groups = await groupFor(uncreditedEventId);
      expect(groups).toHaveLength(1);
      expect(groups[0].body_id).toBe(bodyId);
      expect(groups[0].award_scheme).toBe('proportional');
      expect(groups[0].category_code).toBeNull();
      expect(groups[0].unit).toBeNull();

      const { data: accreditations } = await admin
        .from('event_accreditations')
        .select('id, credit_value')
        .eq('accreditation_group_id', groups[0].id);
      expect(accreditations).toHaveLength(1);
      expect(Number(accreditations![0].credit_value)).toBe(4.5);

      const { data: occurrences } = await admin.from('event_occurrences').select('id').eq('event_id', uncreditedEventId);
      const { data: links } = await admin
        .from('event_accreditation_occurrences')
        .select('occurrence_id')
        .eq('accreditation_id', accreditations![0].id);
      expect(links).toHaveLength(occurrences!.length);
      expect(new Set(links!.map((l) => l.occurrence_id))).toEqual(new Set(occurrences!.map((o) => o.id)));

      const { data: eventRow } = await admin
        .from('events')
        .select('accrediting_body_id, cpd_hours')
        .eq('id', uncreditedEventId)
        .single();
      expect(eventRow!.accrediting_body_id).toBe(bodyId);
      expect(Number(eventRow!.cpd_hours)).toBe(4.5);
    });

    it('changing body/hours replaces cleanly — old group gone, new one correct, no orphans', async () => {
      const before = await groupFor(uncreditedEventId);
      const oldGroupId = before[0].id;

      const { error } = await eventOwner.client.rpc('set_event_cpd_config', {
        p_event_id: uncreditedEventId,
        p_body_id: bodyId2,
        p_cpd_hours: 7,
      });
      expect(error).toBeNull();

      const after = await groupFor(uncreditedEventId);
      expect(after).toHaveLength(1);
      expect(after[0].id).not.toBe(oldGroupId);
      expect(after[0].body_id).toBe(bodyId2);

      const { data: orphanCheck } = await admin
        .from('event_accreditations')
        .select('id')
        .eq('accreditation_group_id', oldGroupId);
      expect(orphanCheck).toHaveLength(0);

      const { data: accreditations } = await admin
        .from('event_accreditations')
        .select('id, credit_value')
        .eq('accreditation_group_id', after[0].id);
      expect(accreditations).toHaveLength(1);
      expect(Number(accreditations![0].credit_value)).toBe(7);
    });

    it('clearing accreditation removes the group/accreditation/link rows', async () => {
      const { error } = await eventOwner.client.rpc('set_event_cpd_config', {
        p_event_id: uncreditedEventId,
        p_body_id: null,
        p_cpd_hours: null,
      });
      expect(error).toBeNull();

      const groups = await groupFor(uncreditedEventId);
      expect(groups).toHaveLength(0);

      const { data: eventRow } = await admin
        .from('events')
        .select('accrediting_body_id, cpd_hours')
        .eq('id', uncreditedEventId)
        .single();
      expect(eventRow!.accrediting_body_id).toBeNull();
      expect(eventRow!.cpd_hours).toBeNull();
    });
  });

  describe('freeze extension — once an event has real credit, accreditation config is immutable', () => {
    beforeAll(async () => {
      // Give creditedEventId a group via the real bridge, then a real
      // credit_ledger row via the real RPCs (same recipe as
      // event_freeze_trigger.rls.test.ts).
      const { error: cfgErr } = await eventOwner.client.rpc('set_event_cpd_config', {
        p_event_id: creditedEventId,
        p_body_id: freezeBodyId,
        p_cpd_hours: 3,
      });
      if (cfgErr) throw new Error(`credited-event config fixture: ${cfgErr.message}`);

      const { data: licence, error: declErr } = await practitioner.client.rpc('declare_licence', {
        p_body_id: freezeBodyId,
        p_licence_number: `RLS-SEC-${ts}`,
      });
      if (declErr || !licence) throw new Error(`declare_licence fixture: ${declErr?.message}`);
      const licenceId = (licence as { id: string }).id;

      const { error: creditErr } = await admin.rpc('record_credit_entry', {
        p_licence_id: licenceId,
        p_user_id: practitioner.id,
        p_event_id: creditedEventId,
        p_body_id: freezeBodyId,
        p_entry_type: 'credit_earned',
        p_points: null,
        p_hours: 3,
        p_category: null,
        p_effective_date: new Date().toISOString().slice(0, 10),
        p_attestation_status: 'attendance_verified',
      });
      if (creditErr) throw new Error(`record_credit_entry fixture: ${creditErr.message}`);
    }, 60_000);

    it('setting a different accreditation on a credited event fails with 22023, config unchanged', async () => {
      const before = await groupFor(creditedEventId);
      const { error } = await eventOwner.client.rpc('set_event_cpd_config', {
        p_event_id: creditedEventId,
        p_body_id: bodyId2,
        p_cpd_hours: 9,
      });
      expect(error?.code).toBe('22023');

      const after = await groupFor(creditedEventId);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before[0].id);
      expect(after[0].body_id).toBe(freezeBodyId);
    });

    it('clearing accreditation on a credited event fails with 22023, config unchanged', async () => {
      const { error } = await eventOwner.client.rpc('set_event_cpd_config', {
        p_event_id: creditedEventId,
        p_body_id: null,
        p_cpd_hours: null,
      });
      expect(error?.code).toBe('22023');

      const after = await groupFor(creditedEventId);
      expect(after).toHaveLength(1);
      expect(after[0].body_id).toBe(freezeBodyId);
    });

    it("changing the credited event's occurrence starts_at directly fails with 22023", async () => {
      // Probed at the superuser layer, not via `admin` (service_role):
      // event_occurrences already has table-level INSERT/UPDATE/DELETE
      // revoked from service_role (Hard Rule 11, 20260815000000) — a
      // service_role UPDATE attempt is blocked with 42501 at the grant
      // layer before it ever reaches this migration's freeze trigger. That
      // grant boundary is already covered by tests/rls/event_occurrences.rls.test.ts;
      // this test is specifically about the TRIGGER's own logic underneath it.
      const { data: occ } = await admin.from('event_occurrences').select('id, starts_at').eq('event_id', creditedEventId).single();

      await expect(
        sqlSuperuser(`update public.event_occurrences set starts_at = starts_at + interval '1 hour' where id = '${occ!.id}'`),
      ).rejects.toMatchObject({ code: '22023' });

      const { data: unchanged } = await admin.from('event_occurrences').select('starts_at').eq('id', occ!.id).single();
      expect(unchanged!.starts_at).toBe(occ!.starts_at);
    });
  });

  describe('tie-validation trigger — ADR-0002 "Award selection"', () => {
    // Task 10.8/10.9 C4 (20260815030000) corrected check_accreditation_tie:
    // ambiguity is now IDENTICAL occurrence sets, not merely equal
    // cardinality — the original cardinality-only guard rejected ADR-0002's
    // own worked example (HK College of Pathologists: Day1/Day2 both
    // cardinality 1, Both Days cardinality 2), reproduced empirically while
    // building C4 (see that migration's header for the full reasoning).
    // This test's OLD assertion (pushing acc1 to {ordinal1, ordinal2},
    // tying acc2's cardinality at {ordinal2, ordinal3} — different content)
    // is exactly the case the fix now allows through; it is replaced below
    // with an assertion of the corrected behavior plus a genuine
    // identical-set duplicate, which must still be rejected.
    it('allows two same-cardinality rows with DIFFERENT occurrence sets, but rejects an identical-set duplicate', async () => {
      // Hard Rule 11 revokes INSERT on event_accreditation_occurrences from
      // every app role including service_role — only a direct superuser
      // connection can build this fixture (same reasoning as C1's
      // event_occurrences fixtures needing sqlSuperuser).
      const bodyShort = `RLS-TIE-${ts}`;
      const eventTitle = `set_event_cpd_config TIE fixture — DELETE ME ${ts}`;

      await sqlSuperuser(`
        insert into public.accrediting_bodies (organisation_id, short_name, full_name, status, cycle_config, category_taxonomy)
        values ('${DEFAULT_ORG}', '${bodyShort}', 'RLS Test Body (tie fixture)', 'active', '{}', '{}');

        insert into public.events (title, start_time, end_time, timezone, created_by, venue_name, city, country, latitude, longitude, status, organisation_id)
        select '${eventTitle}', now() + interval '3 days', now() + interval '3 days 1 hour', 'Asia/Hong_Kong',
               '${ownerStaffId}', 'v', 'Hong Kong', 'HK', 22.3, 114.2, 'draft', '${DEFAULT_ORG}';

        insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
        select id, 2, 'day', start_time + interval '1 day', start_time + interval '1 day 1 hour' from public.events where title = '${eventTitle}';
        insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
        select id, 3, 'day', start_time + interval '2 day', start_time + interval '2 day 1 hour' from public.events where title = '${eventTitle}';

        insert into public.event_accreditation_groups (event_id, body_id, award_scheme)
        select e.id, b.id, 'explicit_schedule'
        from public.events e, public.accrediting_bodies b
        where e.title = '${eventTitle}' and b.short_name = '${bodyShort}';

        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select ag.id, 5 from public.event_accreditation_groups ag
        join public.events e on e.id = ag.event_id where e.title = '${eventTitle}';
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select ag.id, 6 from public.event_accreditation_groups ag
        join public.events e on e.id = ag.event_id where e.title = '${eventTitle}';

        -- acc1 (credit_value=5) -> ordinal 1 occurrence (cardinality 1).
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select ea.id, eo.id
        from public.event_accreditations ea
        join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
        join public.events e on e.id = ag.event_id
        join public.event_occurrences eo on eo.event_id = e.id and eo.ordinal = 1
        where e.title = '${eventTitle}' and ea.credit_value = 5;

        -- acc2 (credit_value=6) -> ordinals 2 and 3 (cardinality 2).
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select ea.id, eo.id
        from public.event_accreditations ea
        join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
        join public.events e on e.id = ag.event_id
        join public.event_occurrences eo on eo.event_id = e.id and eo.ordinal in (2, 3)
        where e.title = '${eventTitle}' and ea.credit_value = 6;
      `);

      const { data: fixtureEvent } = await admin.from('events').select('id').eq('title', eventTitle).single();
      const { data: fixtureGroup } = await admin
        .from('event_accreditation_groups')
        .select('id')
        .eq('event_id', fixtureEvent!.id)
        .single();
      const { data: fixtureAccreditations } = await admin
        .from('event_accreditations')
        .select('id, credit_value')
        .eq('accreditation_group_id', fixtureGroup!.id);
      const acc1 = fixtureAccreditations!.find((r) => Number(r.credit_value) === 5)!;
      const acc2 = fixtureAccreditations!.find((r) => Number(r.credit_value) === 6)!;

      // This build-up (one multi-statement call = one implicit transaction)
      // must succeed with no tie — acc2 only reaches cardinality 2 at the
      // very end, never observed at cardinality 1 by a DEFERRED check.
      const { data: linkCounts } = await admin
        .from('event_accreditation_occurrences')
        .select('accreditation_id')
        .in('accreditation_id', [acc1.id, acc2.id]);
      expect(linkCounts).toHaveLength(3); // 1 + 2, no tie yet.

      // Push acc1 to cardinality 2 by linking ordinal-2's occurrence too —
      // its set becomes {ordinal1, ordinal2}, which TIES acc2's cardinality
      // (2) but is NOT the same set as acc2's {ordinal2, ordinal3}. The
      // corrected guard allows this (exactly ADR-0002's Day1/Day2/Both
      // shape: two different-content, equal-size rows coexisting).
      await sqlSuperuser(`
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select '${acc1.id}', eo.id
        from public.event_occurrences eo
        where eo.event_id = '${fixtureEvent!.id}' and eo.ordinal = 2;
      `);
      const { data: acc1Links } = await admin.from('event_accreditation_occurrences').select('occurrence_id').eq('accreditation_id', acc1.id);
      expect(acc1Links).toHaveLength(2); // {ordinal1, ordinal2} — allowed, not rejected.

      // A THIRD row linked to the EXACT SAME set as acc2 ({ordinal2,
      // ordinal3}) is a genuine identical-set duplicate — still rejected.
      await sqlSuperuser(`
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select ag.id, 99 from public.event_accreditation_groups ag
        join public.events e on e.id = ag.event_id where e.title = '${eventTitle}';
      `);
      const { data: acc3 } = await admin
        .from('event_accreditations')
        .select('id')
        .eq('accreditation_group_id', fixtureGroup!.id)
        .eq('credit_value', 99)
        .single();

      await expect(
        sqlSuperuser(`
          insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
          select '${acc3!.id}', eo.id
          from public.event_occurrences eo
          where eo.event_id = '${fixtureEvent!.id}' and eo.ordinal in (2, 3);
        `),
      ).rejects.toMatchObject({ code: '22023' });

      // Confirm no residual link was created by the rejected attempt.
      const { data: acc3Links } = await admin.from('event_accreditation_occurrences').select('occurrence_id').eq('accreditation_id', acc3!.id);
      expect(acc3Links).toHaveLength(0);

      // Cleanup — group first (event_occurrences has no cascade from
      // event_accreditation_occurrences.occurrence_id).
      await sqlSuperuser(`
        delete from public.event_accreditation_groups where event_id = (select id from public.events where title = '${eventTitle}');
        delete from public.events where title = '${eventTitle}';
        delete from public.accrediting_bodies where short_name = '${bodyShort}';
      `);
    }, 30_000);
  });
});
