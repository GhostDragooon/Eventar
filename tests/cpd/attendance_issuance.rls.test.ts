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
import { admin, createTestUser, deleteTestUser, sqlSuperuser, type TestUser } from '../helpers/clients';
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
type AwardRow = { body_id: string | null; outcome: string };

// Task 10.8/10.9 C4: award_attendance_credit() now iterates
// event_accreditation_groups and returns a SET of (body_id, outcome), not a
// bare string. Every event fixture below needs an actual group row for the
// engine to see it as CPD-configured at all (event_accreditation_groups is
// definer-only per C3's Hard Rule 11 grant posture — sqlSuperuser is the
// only way a test can write it, same reasoning as
// tests/cpd/set_event_cpd_config.rls.test.ts's own sqlSuperuser fixtures),
// and every registrant needs a registration_checkins row for the
// proportional/explicit_schedule occurrence math to have anything to work
// with — the OLD engine never looked at occurrences at all.

/** Mirrors set_event_cpd_config's compatibility bridge: one group, one
 * accreditation row, linked to every occurrence the event currently has
 * (today always exactly one, the auto-created default). */
async function addCompatBridgeGroup(eventId: string, bodyId: string, creditValue: number): Promise<void> {
  await sqlSuperuser(`
    with grp as (
      insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
      values ('${eventId}', '${bodyId}', null, null, 'proportional')
      returning id
    ), acc as (
      insert into public.event_accreditations (accreditation_group_id, credit_value)
      select id, ${creditValue} from grp
      returning id
    )
    insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
    select acc.id, eo.id from acc, public.event_occurrences eo where eo.event_id = '${eventId}';
  `);
}

/** Direct registration_checkins insert (definer-only table) for the given
 * event's occurrence ordinals — default [1], the auto-created occurrence. */
async function checkin(registrationId: string, eventId: string, ordinals: number[] = [1]): Promise<void> {
  await sqlSuperuser(`
    insert into public.registration_checkins (registration_id, occurrence_id, checked_in_at, check_in_method)
    select '${registrationId}', eo.id, now(), 'manual'
    from public.event_occurrences eo
    where eo.event_id = '${eventId}' and eo.ordinal = any(array[${ordinals.join(',')}]);
  `);
}

describe.skipIf(!process.env.RLS_TESTS)('award_attendance_credit — config-free issuance', () => {
  let bodyAdmin: TestUser; // verifies licences + owns the event fixtures (created_by)
  let bodyAdminStaffId: string;
  let practitionerA: TestUser; // verified licence @ body — sequential issue/idempotency
  let practitionerB: TestUser; // verified licence @ body — concurrent-race case
  let practitionerNoLicence: TestUser; // no licence anywhere
  let bodyId: string;
  let cpdEventId: string;
  let nonCpdEventId: string;
  // Guard-test events (2026-07-25 review). Each guard test needs its OWN event:
  // registrations carry a unique (event_id, email), so a practitioner already
  // registered on cpdEventId cannot get a second registration there. All of
  // these are guard-blocked, so no credit ever references them — safe to delete.
  const guardEventIds: string[] = [];
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
    // Full attendance by default — the new engine's proportional/explicit_schedule
    // math needs a real registration_checkins row; the old engine never looked at
    // occurrences at all. Harmless for nonCpdEventId (zero groups short-circuits
    // before occurrence logic) and for guard-blocked registrations (cancelled/stale
    // window return before the group loop too).
    await checkin(data.id as string, eventId);
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

  /** A CPD-configured event at an arbitrary time, for the guard tests. */
  async function makeGuardEvent(label: string, startOffsetMs: number): Promise<string> {
    const start = new Date(Date.now() + startOffsetMs);
    const { data, error } = await admin
      .from('events')
      .insert({
        title: `attendance_issuance ${label} fixture — DELETE ME ${ts}`,
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + 3_600_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: bodyAdminStaffId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'published',
        accrediting_body_id: bodyId,
        cpd_hours: 3,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`${label} event fixture: ${error?.message}`);
    guardEventIds.push(data.id as string);
    await addCompatBridgeGroup(data.id as string, bodyId, 3);
    return data.id as string;
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
      // SENTINEL, reused across runs — see roster_eligibility for the full note.
      // A per-run `RLS-CPD-${ts}` body becomes undeletable the moment this suite
      // issues its first credit (credit_ledger.body_id is NO ACTION), so every
      // run permanently widened the table. This suite is the biggest offender:
      // it is excluded from `test:rls` precisely because it writes real ledger rows.
      .upsert({
        organisation_id: DEFAULT_ORG,
        short_name: 'RLS-CPD-FIXTURE',
        full_name: 'RLS Test Body (attendance_issuance fixture)',
        // Explicit — found failing on a fresh local stack while verifying C4:
        // this upsert never set status, so a first-ever insert defaults to
        // 'onboarding' (the column default) and declare_licence's active-body
        // check (DEFERRED item 30, closed 2026-08-14, postdates this fixture)
        // then rejects every licence declaration against it. Pre-existing gap,
        // unrelated to C4's own change — fixed here since C4's new tests share
        // this exact beforeAll.
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      }, { onConflict: 'organisation_id,short_name' })
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
    // events.accrediting_body_id/cpd_hours above are no longer what the engine
    // reads (C4) — the real signal is this group, mirroring what
    // set_event_cpd_config's compatibility bridge would have produced.
    await addCompatBridgeGroup(cpdEventId, bodyId, 3);

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
    // Guard-test events are all blocked before issuance, so no credit references
    // them — unlike cpdEventId they are genuinely deletable.
    if (guardEventIds.length > 0) {
      await mustDelete(admin.from('events').delete().in('id', guardEventIds), 'guard event fixtures');
    }
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

    const first = await admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code, p_enforce_full_setup: false });
    expect(first.error).toBeNull();
    expect(first.data).toEqual([{ body_id: bodyId, outcome: 'issued' }]);

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
    const second = await admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code, p_enforce_full_setup: false });
    expect(second.error).toBeNull();
    expect(second.data).toEqual([{ body_id: bodyId, outcome: 'already' }]);
    expect(await creditsFor(practitionerA.id, cpdEventId)).toHaveLength(1);
  }, 30_000);

  it('a true concurrent race on a fresh registration still yields exactly one credit', async () => {
    const code = await makeRegistration(cpdEventId, practitionerB, `RACE${ts}`);
    const [r1, r2] = await Promise.all([
      admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code, p_enforce_full_setup: false }),
      admin.rpc('award_attendance_credit', { p_event_id: cpdEventId, p_registration_code: code, p_enforce_full_setup: false }),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const results = [(r1.data as AwardRow[])[0].outcome, (r2.data as AwardRow[])[0].outcome].sort();
    expect(results).toEqual(['already', 'issued']);

    const rows = await creditsFor(practitionerB.id, cpdEventId);
    expect(rows).toHaveLength(1);
  }, 30_000);

  it('a non-CPD event (no accrediting_body_id / cpd_hours) never writes a credit', async () => {
    const code = await makeRegistration(nonCpdEventId, practitionerA, `NONCPD${ts}`);
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: nonCpdEventId,
      p_registration_code: code, p_enforce_full_setup: false });
    expect(error).toBeNull();
    // Zero event_accreditation_groups — the single-outcome equivalent of the
    // old scalar 'skipped:not_cpd', body_id null (nothing was ever evaluated).
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:not_cpd' }]);

    const rows = await creditsFor(practitionerA.id, nonCpdEventId);
    expect(rows).toHaveLength(0);
  }, 30_000);

  // --- Guards added by the 2026-07-25 three-lens review (HIGH-2) ---------
  // 'attendance_verified' asserted venue-captured presence, but nothing bound
  // the credit to the event's lifecycle. Both of these WOULD have issued a
  // permanent, unrevocable credit before the fix. Neither issues one now, so
  // neither adds ledger residue.

  it('a cancelled registration earns no credit', async () => {
    // self_check_in's predicate is `status <> 'attended'`, and 'cancelled' is a
    // legal registrations.status — so a cancelled registrant could reach
    // issuance and mint a credit labelled venue-verified.
    const eventId = await makeGuardEvent('CANCELLED', 0);
    const code = await makeRegistration(eventId, practitionerA, `CANCEL${ts}`);
    const { error: updErr } = await admin
      .from('registrations')
      .update({ status: 'cancelled' })
      .eq('registration_code', code);
    expect(updErr).toBeNull();

    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId,
      p_registration_code: code, p_enforce_full_setup: false });
    expect(error).toBeNull();
    // Pre-loop gate — fires before any group is evaluated, so body_id is null
    // regardless of how many groups the event has.
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:cancelled' }]);
    expect(await creditsFor(practitionerA.id, eventId)).toHaveLength(0);
  }, 30_000);

  it('a check-in far outside the event window earns no credit', async () => {
    // The fraud this closes: an attendee never shows up, then POSTs the code
    // from the reminder email days later. Window is start-24h..end+24h.
    const eventId = await makeGuardEvent('STALE', -10 * 86_400_000); // ended ~10 days ago
    const code = await makeRegistration(eventId, practitionerA, `STALE${ts}`);
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: eventId,
      p_registration_code: code, p_enforce_full_setup: false });
    expect(error).toBeNull();
    expect(data).toEqual([{ body_id: null, outcome: 'skipped:outside_window' }]);
    expect(await creditsFor(practitionerA.id, eventId)).toHaveLength(0);
  }, 30_000);

  it('an attendee with no licence at the event body writes no credit (skipped, not failed)', async () => {
    const code = await makeRegistration(cpdEventId, practitionerNoLicence, `NOLIC${ts}`);
    const { data, error } = await admin.rpc('award_attendance_credit', {
      p_event_id: cpdEventId,
      p_registration_code: code, p_enforce_full_setup: false });
    expect(error).toBeNull();
    expect(data).toEqual([{ body_id: bodyId, outcome: 'skipped:no_licence' }]);

    const rows = await creditsFor(practitionerNoLicence.id, cpdEventId);
    expect(rows).toHaveLength(0);
  }, 30_000);

  // ---------------------------------------------------------------------
  // Task 10.8/10.9 C4 — multi-body attribution (ADR-0002). Nested so it can
  // reuse bodyAdmin/bodyAdminStaffId (same organisation, so verify_licence's
  // org-match check passes for every new body created here too).
  // ---------------------------------------------------------------------
  describe('multi-body attribution — ADR-0002 (Task 10.8/10.9 C4)', () => {
    let bodyPath: string; // explicit_schedule, unit=points — HK College of Pathologists shape
    let bodyAnaes: string; // proportional, unit=hours
    let bodyPsych: string; // proportional — practitionerFull is NOT licensed here at first
    let bodyOrphan: string; // proportional, its one accreditation row links to ZERO occurrences
    let bodyRoleTax: string; // proportional, category_code set — exercises R1's role->category path
    let icEventId: string;

    let practitionerFull: TestUser; // licensed @ Path + Anaes, attends both days
    let practitionerPartial: TestUser; // licensed @ Path + Anaes, attends Day 1 only
    let practitionerOrphan: TestUser; // licensed @ Orphan only
    let practitionerRoleChair: TestUser; // licensed @ RoleTax, role=chair
    let practitionerRoleMismatch: TestUser; // licensed @ RoleTax, no role row (defaults attendee)

    let fullReg: { id: string; code: string };
    let partialReg: { id: string; code: string };
    let orphanReg: { id: string; code: string };
    let roleChairReg: { id: string; code: string };
    let roleMismatchReg: { id: string; code: string };
    const mbTs = Date.now();

    function outcomeFor(rows: AwardRow[], forBodyId: string): AwardRow | undefined {
      return rows.find((r) => r.body_id === forBodyId);
    }

    async function newBody(shortName: string, extra: Record<string, unknown> = {}): Promise<string> {
      const { data, error } = await admin
        .from('accrediting_bodies')
        .insert({
          organisation_id: DEFAULT_ORG,
          short_name: shortName,
          full_name: `RLS Test Body (multi-body fixture, ${shortName})`,
          status: 'active',
          cycle_config: {},
          category_taxonomy: {},
          ...extra,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`body fixture (${shortName}): ${error?.message}`);
      return data.id as string;
    }

    async function declareAndVerify(user: TestUser, forBodyId: string, licenceNumber: string): Promise<void> {
      const { data: declared, error: declErr } = await user.client.rpc('declare_licence', {
        p_body_id: forBodyId,
        p_licence_number: licenceNumber,
      });
      if (declErr || !declared) throw new Error(`declare_licence (${licenceNumber}): ${declErr?.message}`);
      const { error: verErr } = await bodyAdmin.client.rpc('verify_licence', { p_licence_id: (declared as { id: string }).id });
      if (verErr) throw new Error(`verify_licence (${licenceNumber}): ${verErr.message}`);
    }

    async function regFor(eventId: string, user: TestUser, codeSuffix: string): Promise<{ id: string; code: string }> {
      const { data, error } = await admin
        .from('registrations')
        .insert({
          event_id: eventId,
          email: user.email,
          full_name: 'RLS Multi-Body Test Attendee',
          status: 'attended',
          registration_code: `WK-MB${codeSuffix}`,
        })
        .select('id, registration_code')
        .single();
      if (error || !data) throw new Error(`registration fixture (${codeSuffix}): ${error?.message}`);
      return { id: data.id as string, code: data.registration_code as string };
    }

    async function ledgerRowsFor(userId: string, eventId: string) {
      const { data, error } = await admin
        .from('credit_ledger')
        .select('body_id, points, hours, category')
        .eq('user_id', userId)
        .eq('event_id', eventId);
      if (error) throw new Error(`credit_ledger query: ${error.message}`);
      return data as { body_id: string; points: string | null; hours: string | null; category: string | null }[];
    }

    beforeAll(async () => {
      bodyPath = await newBody(`MB-PATH-${mbTs}`);
      bodyAnaes = await newBody(`MB-ANAES-${mbTs}`);
      bodyPsych = await newBody(`MB-PSYCH-${mbTs}`);
      bodyOrphan = await newBody(`MB-ORPHAN-${mbTs}`);
      bodyRoleTax = await newBody(`MB-ROLETAX-${mbTs}`, {
        category_taxonomy: { role_mappings: { chair: 'CHAIR-CAT', attendee: 'OTHER-CAT' } },
      });

      const start = new Date();
      const { data: ev, error: evErr } = await admin
        .from('events')
        .insert({
          title: `attendance_issuance MULTI-BODY fixture — DELETE ME ${mbTs}`,
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 3_600_000).toISOString(),
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
      if (evErr || !ev) throw new Error(`multi-body event fixture: ${evErr?.message}`);
      icEventId = ev.id as string;

      // Day 1 is the auto-created ordinal=1 occurrence (spans start..end).
      // Day 2 follows immediately — non-overlapping half-open ranges.
      await sqlSuperuser(`
        insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
        select id, 2, 'day', end_time, end_time + interval '1 hour' from public.events where id = '${icEventId}';
      `);

      // groupPath — explicit_schedule, unit=points. ADR-0002's own worked
      // example (HK College of Pathologists): Day1=5, Day2=6, BOTH DAYS=12.
      // 12, not 5+6=11 — a different published value than the day-sum, so a
      // passing test proves selection of the published row, not summation.
      await sqlSuperuser(`
        with grp as (
          insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
          values ('${icEventId}', '${bodyPath}', null, 'points', 'explicit_schedule')
          returning id
        ), day1 as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 5 from grp returning id
        ), day2 as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 6 from grp returning id
        ), both_days as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 12 from grp returning id
        )
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select day1.id, eo.id from day1, public.event_occurrences eo where eo.event_id = '${icEventId}' and eo.ordinal = 1
        union all
        select day2.id, eo.id from day2, public.event_occurrences eo where eo.event_id = '${icEventId}' and eo.ordinal = 2
        union all
        select both_days.id, eo.id from both_days, public.event_occurrences eo where eo.event_id = '${icEventId}';
      `);

      // groupAnaes / groupPsych — proportional, one accreditation row each,
      // linked to every occurrence the event has right now (both days).
      await addCompatBridgeGroup(icEventId, bodyAnaes, 7);
      await addCompatBridgeGroup(icEventId, bodyPsych, 4);

      // groupOrphan — proportional, its accreditation row links to ZERO
      // occurrences. Exercises the divide-by-zero guard (skipped:no_occurrences).
      await sqlSuperuser(`
        insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
        values ('${icEventId}', '${bodyOrphan}', null, 'hours', 'proportional');
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select id, 9 from public.event_accreditation_groups where event_id = '${icEventId}' and body_id = '${bodyOrphan}';
      `);

      // groupRoleTax — proportional, category_code SET (the real R1 path —
      // no seeded body populates this yet, so this is the synthetic fixture
      // the task brief asked for). Linked to Day 1 only.
      await sqlSuperuser(`
        insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
        values ('${icEventId}', '${bodyRoleTax}', 'CHAIR-CAT', 'hours', 'proportional');
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select id, 8 from public.event_accreditation_groups where event_id = '${icEventId}' and body_id = '${bodyRoleTax}';
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select ea.id, eo.id
        from public.event_accreditations ea
        join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
        join public.event_occurrences eo on eo.event_id = ag.event_id and eo.ordinal = 1
        where ag.event_id = '${icEventId}' and ag.body_id = '${bodyRoleTax}';
      `);

      practitionerFull = await createTestUser(`mb-full-${mbTs}`);
      await declareAndVerify(practitionerFull, bodyPath, `MB-FULL-PATH-${mbTs}`);
      await declareAndVerify(practitionerFull, bodyAnaes, `MB-FULL-ANAES-${mbTs}`);

      practitionerPartial = await createTestUser(`mb-partial-${mbTs}`);
      await declareAndVerify(practitionerPartial, bodyPath, `MB-PARTIAL-PATH-${mbTs}`);
      await declareAndVerify(practitionerPartial, bodyAnaes, `MB-PARTIAL-ANAES-${mbTs}`);

      practitionerOrphan = await createTestUser(`mb-orphan-${mbTs}`);
      await declareAndVerify(practitionerOrphan, bodyOrphan, `MB-ORPHAN-${mbTs}`);

      practitionerRoleChair = await createTestUser(`mb-rolechair-${mbTs}`);
      await declareAndVerify(practitionerRoleChair, bodyRoleTax, `MB-ROLECHAIR-${mbTs}`);

      practitionerRoleMismatch = await createTestUser(`mb-rolemismatch-${mbTs}`);
      await declareAndVerify(practitionerRoleMismatch, bodyRoleTax, `MB-ROLEMISMATCH-${mbTs}`);

      fullReg = await regFor(icEventId, practitionerFull, `FULL${mbTs}`);
      await checkin(fullReg.id, icEventId, [1, 2]);

      partialReg = await regFor(icEventId, practitionerPartial, `PART${mbTs}`);
      await checkin(partialReg.id, icEventId, [1]);

      orphanReg = await regFor(icEventId, practitionerOrphan, `ORPH${mbTs}`);
      await checkin(orphanReg.id, icEventId, [1, 2]);

      roleChairReg = await regFor(icEventId, practitionerRoleChair, `RCH${mbTs}`);
      await checkin(roleChairReg.id, icEventId, [1]);
      await sqlSuperuser(`insert into public.registration_roles (registration_id, role_code) values ('${roleChairReg.id}', 'chair');`);

      roleMismatchReg = await regFor(icEventId, practitionerRoleMismatch, `RMM${mbTs}`);
      await checkin(roleMismatchReg.id, icEventId, [1]);
      // No registration_roles row for this one — the implicit default is 'attendee'.
    }, 90_000);

    afterAll(async () => {
      // registrations carry no FK from credit_ledger at all (unlike
      // licences/events/bodies/staff) — always safely deletable, same as
      // the outer describe's own registrationIds cleanup.
      await mustDelete(
        admin.from('registrations').delete().in('id', [fullReg.id, partialReg.id, orphanReg.id, roleChairReg.id, roleMismatchReg.id]),
        'multi-body registration fixtures',
      );
      // NOT deleted: icEventId (permanently pinned — bodyPath/bodyAnaes/
      // bodyPsych all earn real credit against it across the tests below),
      // its 5 accrediting bodies, or any of the 5 practitioners' auth
      // users. The auth users are NOT deletable even for the ones that
      // never earn credit (practitionerOrphan, practitionerRoleMismatch):
      // practitioner_licences.user_id -> users(id) is a plain NO ACTION FK
      // that blocks deletion the moment declare_licence runs, regardless of
      // whether that licence ever earns a credit_ledger reference — a
      // second, independent pinning mechanism beyond credit_ledger's own
      // NO ACTION FKs (which this file's header only attributes pinning to
      // credit_ledger; both are real).
    }, 30_000);

    it('the real ICI shape: licensed at 2 of 3 bodies, attends both days -> exactly 2 issued rows with correct values, nothing for the unlicensed body', async () => {
      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: fullReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      const rows = data as AwardRow[];
      expect(rows).toHaveLength(5); // one outcome per group on this event

      expect(outcomeFor(rows, bodyPath)).toEqual({ body_id: bodyPath, outcome: 'issued' });
      expect(outcomeFor(rows, bodyAnaes)).toEqual({ body_id: bodyAnaes, outcome: 'issued' });
      expect(outcomeFor(rows, bodyPsych)).toEqual({ body_id: bodyPsych, outcome: 'skipped:no_licence' });
      expect(outcomeFor(rows, bodyOrphan)).toEqual({ body_id: bodyOrphan, outcome: 'skipped:no_licence' });
      expect(outcomeFor(rows, bodyRoleTax)).toEqual({ body_id: bodyRoleTax, outcome: 'skipped:no_licence' });

      const ledgerRows = await ledgerRowsFor(practitionerFull.id, icEventId);
      expect(ledgerRows).toHaveLength(2);

      const pathRow = ledgerRows.find((r) => r.body_id === bodyPath)!;
      expect(Number(pathRow.points)).toBe(12); // published "Both Days" value, not 5+6=11
      expect(pathRow.hours).toBeNull();
      expect(pathRow.category).toBeNull();

      const anaesRow = ledgerRows.find((r) => r.body_id === bodyAnaes)!;
      expect(Number(anaesRow.hours)).toBe(7); // 7 * earned(2)/available(2) — full attendance
      expect(anaesRow.points).toBeNull();
    }, 30_000);

    it('idempotency: a second call returns already for the two credited bodies, unchanged for the rest, no duplicate rows', async () => {
      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: fullReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      const rows = data as AwardRow[];
      expect(outcomeFor(rows, bodyPath)).toEqual({ body_id: bodyPath, outcome: 'already' });
      expect(outcomeFor(rows, bodyAnaes)).toEqual({ body_id: bodyAnaes, outcome: 'already' });
      expect(outcomeFor(rows, bodyPsych)).toEqual({ body_id: bodyPsych, outcome: 'skipped:no_licence' });

      expect(await ledgerRowsFor(practitionerFull.id, icEventId)).toHaveLength(2);
    }, 30_000);

    // Verification item 4 asked for "a THIRD body added between calls still
    // gets issued on the second call". That literal construction is
    // BLOCKED: C3's freeze_accreditation_groups_if_credited trigger freezes
    // the event's ENTIRE accreditation config the moment ANY credit_ledger
    // row exists for it (checked by event_id alone, not per body) — and by
    // this point in the suite, bodyPath/bodyAnaes already have real credit
    // rows against icEventId from the tests above, so inserting a new group
    // here would raise 22023. Substituted: bodyPsych's GROUP already
    // existed from the start (beforeAll); what changes here is the
    // practitioner's LICENCE eligibility, which is untouched by the freeze
    // trigger. This exercises the same real concern the verification step
    // was after — one body's 'already' outcome must not gate or skip
    // evaluation of another body in the same call — without the
    // structurally-blocked literal construction.
    it('a body that becomes eligible BETWEEN calls still gets issued, unaffected by other bodies already returning already', async () => {
      await declareAndVerify(practitionerFull, bodyPsych, `MB-FULL-PSYCH-${mbTs}`);

      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: fullReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      const rows = data as AwardRow[];
      expect(outcomeFor(rows, bodyPath)).toEqual({ body_id: bodyPath, outcome: 'already' });
      expect(outcomeFor(rows, bodyAnaes)).toEqual({ body_id: bodyAnaes, outcome: 'already' });
      expect(outcomeFor(rows, bodyPsych)).toEqual({ body_id: bodyPsych, outcome: 'issued' });

      const ledgerRows = await ledgerRowsFor(practitionerFull.id, icEventId);
      expect(ledgerRows).toHaveLength(3);
      const psychRow = ledgerRows.find((r) => r.body_id === bodyPsych)!;
      expect(Number(psychRow.hours)).toBe(4); // 4 * 2/2 — full attendance
    }, 30_000);

    it('partial attendance (Day 1 only): explicit_schedule matches the smaller satisfied row, proportional produces a real fraction', async () => {
      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: partialReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      const rows = data as AwardRow[];
      expect(outcomeFor(rows, bodyPath)).toEqual({ body_id: bodyPath, outcome: 'issued' });
      expect(outcomeFor(rows, bodyAnaes)).toEqual({ body_id: bodyAnaes, outcome: 'issued' });

      const ledgerRows = await ledgerRowsFor(practitionerPartial.id, icEventId);
      const pathRow = ledgerRows.find((r) => r.body_id === bodyPath)!;
      // Day-1-only row (5) selected — NOT Both Days (12: unsatisfied, needs Day 2 too).
      expect(Number(pathRow.points)).toBe(5);

      const anaesRow = ledgerRows.find((r) => r.body_id === bodyAnaes)!;
      // earned(1)/available(2) * 7 = 3.5 — proves numeric, not integer-truncated, division.
      expect(Number(anaesRow.hours)).toBe(3.5);
    }, 30_000);

    it('a proportional group whose accreditation links to zero occurrences returns skipped:no_occurrences, not an error', async () => {
      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: orphanReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      expect(outcomeFor(data as AwardRow[], bodyOrphan)).toEqual({ body_id: bodyOrphan, outcome: 'skipped:no_occurrences' });
      expect(await ledgerRowsFor(practitionerOrphan.id, icEventId)).toHaveLength(0);
    }, 30_000);

    // ---- 20260815040000 fix: proportional zero-earned must skip, not post a
    // zero-value row. Different from the test above (bodyOrphan's group has
    // ZERO occurrences at all — v_available=0); this is a group WITH real
    // occurrences that the registration simply didn't attend any of
    // (v_available>0, v_earned=0). Self-contained fixture, not the shared
    // icEventId one, since this issues no credit and is fully cleanable.
    it('proportional, group has occurrences but the registration attended none of them -> skipped:no_attendance, not a zero-value row', async () => {
      const zeTs = Date.now();
      const { data: body, error: bodyErr } = await admin
        .from('accrediting_bodies')
        .insert({
          organisation_id: DEFAULT_ORG,
          short_name: `MB-ZEROEARN-${zeTs}`,
          full_name: 'RLS Test Body (zero-earned proportional fixture)',
          status: 'active',
          cycle_config: {},
          category_taxonomy: {},
        })
        .select('id')
        .single();
      if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
      const zeBodyId = body.id as string;

      const zePractitioner = await createTestUser(`zeroearn-${zeTs}`);
      const { data: declared, error: declErr } = await zePractitioner.client.rpc('declare_licence', {
        p_body_id: zeBodyId,
        p_licence_number: `ZE-${zeTs}`,
      });
      if (declErr || !declared) throw new Error(`declare_licence: ${declErr?.message}`);
      const { error: verErr } = await bodyAdmin.client.rpc('verify_licence', { p_licence_id: (declared as { id: string }).id });
      if (verErr) throw new Error(`verify_licence: ${verErr.message}`);

      const start = new Date();
      const { data: ev, error: evErr } = await admin
        .from('events')
        .insert({
          title: `attendance_issuance ZERO-EARNED fixture — DELETE ME ${zeTs}`,
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 3_600_000).toISOString(),
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
      if (evErr || !ev) throw new Error(`event fixture: ${evErr?.message}`);
      const zeEventId = ev.id as string;

      // Occurrence 2 alongside the auto-created occurrence 1.
      await sqlSuperuser(`
        insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
        select id, 2, 'day', end_time, end_time + interval '1 hour' from public.events where id = '${zeEventId}';
      `);

      // Group scoped ONLY to occurrence 2.
      await sqlSuperuser(`
        with grp as (
          insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
          values ('${zeEventId}', '${zeBodyId}', null, 'points', 'proportional')
          returning id
        ), acc as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 10 from grp returning id
        )
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select acc.id, eo.id from acc, public.event_occurrences eo
        where eo.event_id = '${zeEventId}' and eo.ordinal = 2;
      `);

      const { data: reg, error: regErr } = await admin
        .from('registrations')
        .insert({
          event_id: zeEventId,
          email: zePractitioner.email,
          full_name: 'RLS Zero-Earned Test Attendee',
          status: 'attended',
          registration_code: `WK-ZE${zeTs}`,
        })
        .select('id, registration_code')
        .single();
      if (regErr || !reg) throw new Error(`registration fixture: ${regErr?.message}`);

      // Attend ONLY occurrence 1 — the group covers ONLY occurrence 2.
      await checkin(reg.id as string, zeEventId, [1]);

      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: zeEventId,
        p_registration_code: reg.registration_code as string, p_enforce_full_setup: false });
      expect(error).toBeNull();
      expect(outcomeFor(data as AwardRow[], zeBodyId)).toEqual({ body_id: zeBodyId, outcome: 'skipped:no_attendance' });

      const { data: ledgerRows } = await admin
        .from('credit_ledger')
        .select('id')
        .eq('user_id', zePractitioner.id)
        .eq('event_id', zeEventId);
      expect(ledgerRows).toHaveLength(0);

      // No credit was ever issued here — fully cleanable, unlike the rest of
      // this file's fixtures (see header). event_accreditation_groups is
      // Hard Rule 11 definer-only — service_role has no direct DELETE, same
      // reasoning as its INSERT above — so sqlSuperuser, not admin, clears it.
      await mustDelete(admin.from('registrations').delete().eq('id', reg.id as string), 'zero-earned registration fixture');
      await sqlSuperuser(`delete from public.event_accreditation_groups where event_id = '${zeEventId}'`);
      await mustDelete(admin.from('events').delete().eq('id', zeEventId), 'zero-earned event fixture');
      await mustDelete(admin.from('practitioner_licences').delete().eq('body_id', zeBodyId), 'zero-earned licence fixture');
      await mustDelete(admin.from('accrediting_bodies').delete().eq('id', zeBodyId), 'zero-earned body fixture');
      await deleteTestUser(zePractitioner);
    }, 30_000);

    it("role -> category resolution: a matching role lets the group apply and the posted row carries the resolved category", async () => {
      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: roleChairReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      expect(outcomeFor(data as AwardRow[], bodyRoleTax)).toEqual({ body_id: bodyRoleTax, outcome: 'issued' });

      const row = (await ledgerRowsFor(practitionerRoleChair.id, icEventId)).find((r) => r.body_id === bodyRoleTax)!;
      expect(Number(row.hours)).toBe(8); // earned(1)/available(1) * 8
      expect(row.category).toBe('CHAIR-CAT');
    }, 30_000);

    it("role -> category resolution: no role maps to the group's category -> skipped:no_role_match", async () => {
      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: icEventId,
        p_registration_code: roleMismatchReg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      expect(outcomeFor(data as AwardRow[], bodyRoleTax)).toEqual({ body_id: bodyRoleTax, outcome: 'skipped:no_role_match' });
      expect(await ledgerRowsFor(practitionerRoleMismatch.id, icEventId)).toHaveLength(0);
    }, 30_000);

    it('a genuine tie at the maximum satisfied cardinality (no covering row) returns skipped:ambiguous_schedule and posts nothing — constructed for real, not merely reasoned about', async () => {
      // Two DIFFERENT-content, equal-cardinality (2) explicit_schedule rows
      // with NO covering row for "all three days attended". Constructible
      // only because this migration's own fix to C3's tie-guard (see the
      // migration file) narrowed config-time rejection to IDENTICAL
      // occurrence sets — the original cardinality-only guard would have
      // rejected this pair (and even ADR-0002's own Day1/Day2/Both example)
      // regardless of content. This is exactly the case C4's own
      // ambiguous_schedule branch exists to catch at the ledger-write layer.
      const ambigBody = await newBody(`MB-AMBIG-${mbTs}`);
      const practitionerAmbig = await createTestUser(`mb-ambig-${mbTs}`);
      await declareAndVerify(practitionerAmbig, ambigBody, `MB-AMBIG-${mbTs}`);

      const start = new Date();
      const { data: ev, error: evErr } = await admin
        .from('events')
        .insert({
          title: `attendance_issuance MULTI-BODY AMBIG fixture — DELETE ME ${mbTs}`,
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 3_600_000).toISOString(),
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
      if (evErr || !ev) throw new Error(`ambig event fixture: ${evErr?.message}`);
      const ambigEventId = ev.id as string;

      await sqlSuperuser(`
        insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
        select id, 2, 'day', end_time, end_time + interval '1 hour' from public.events where id = '${ambigEventId}';
        insert into public.event_occurrences (event_id, ordinal, occurrence_type, starts_at, ends_at)
        select id, 3, 'day', end_time + interval '1 hour', end_time + interval '2 hour' from public.events where id = '${ambigEventId}';

        insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
        values ('${ambigEventId}', '${ambigBody}', null, 'hours', 'explicit_schedule');

        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select id, 10 from public.event_accreditation_groups where event_id = '${ambigEventId}' and body_id = '${ambigBody}';
        insert into public.event_accreditations (accreditation_group_id, credit_value)
        select id, 20 from public.event_accreditation_groups where event_id = '${ambigEventId}' and body_id = '${ambigBody}';

        -- accX (10) -> ordinals 1,2. accY (20) -> ordinals 1,3. Same
        -- cardinality (2), different content — not rejected by the
        -- corrected tie-guard, since the two sets are not identical.
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select ea.id, eo.id
        from public.event_accreditations ea
        join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
        join public.event_occurrences eo on eo.event_id = ag.event_id and eo.ordinal in (1, 2)
        where ag.event_id = '${ambigEventId}' and ea.credit_value = 10;

        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select ea.id, eo.id
        from public.event_accreditations ea
        join public.event_accreditation_groups ag on ag.id = ea.accreditation_group_id
        join public.event_occurrences eo on eo.event_id = ag.event_id and eo.ordinal in (1, 3)
        where ag.event_id = '${ambigEventId}' and ea.credit_value = 20;
      `);

      const reg = await regFor(ambigEventId, practitionerAmbig, `AMBIG${mbTs}`);
      await checkin(reg.id, ambigEventId, [1, 2, 3]); // attends all three days — no covering row exists

      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: ambigEventId,
        p_registration_code: reg.code, p_enforce_full_setup: false });
      expect(error).toBeNull();
      expect(data).toEqual([{ body_id: ambigBody, outcome: 'skipped:ambiguous_schedule' }]);
      expect(await ledgerRowsFor(practitionerAmbig.id, ambigEventId)).toHaveLength(0);

      // The event/groups are safe to remove (never credited). ambigBody
      // itself is NOT — confirmed by running this: declare_licence already
      // pins it via practitioner_licences.body_id's own NO ACTION FK
      // (accrediting_bodies_body_id_fkey), independent of credit_ledger.
      // practitionerAmbig's auth user is likewise not deleted, same reason
      // (see the outer afterAll's comment).
      await mustDelete(admin.from('registrations').delete().eq('id', reg.id), 'ambig registration fixture');
      await sqlSuperuser(`
        delete from public.event_accreditation_groups where event_id = '${ambigEventId}';
        delete from public.events where id = '${ambigEventId}';
      `);
    }, 30_000);

    // -----------------------------------------------------------------
    // A2 — role_award_rule enforcement (Task 10.4 code half, added
    // 20260826000000_role_award_rule_enforcement.sql). Four scenarios
    // per brief §4.4: shipped single-satisfied path unaffected; the
    // three fail-closed rule branches raise PT002 before any
    // credit_ledger write.
    //
    // ARCHITECTURE CONFLICT SURFACED WHILE WRITING THIS (rule 7, rule 14):
    // The shipped index `event_accreditation_groups_event_body_uniq`
    // (added 20260821020000) enforces one-group-per-body-per-event, which
    // makes ADR-0002 R1's multi-category-per-body scenario unreachable
    // through the shipped write paths. R1 assumes multiple groups per
    // body (`3. Match mapped categories against this event's
    // event_accreditation_groups for that body_id`); 20260821020000
    // forbids it. The `role_award_rule` enforcement this migration adds
    // is therefore DORMANT in production: no writer can currently create
    // the >1-satisfied-per-body configuration that would trigger it.
    // Reported in full in the dispatch report — do not "reconcile" it
    // silently in either direction (rule 7).
    //
    // For the runtime tests to exercise the pre-pass at all, this nested
    // describe DROPS `event_accreditation_groups_event_body_uniq` in
    // beforeAll and re-creates it in afterAll. This proves the
    // enforcement lands and would fire the moment the schema conflict is
    // resolved (either by widening this index, or by keeping the
    // one-group-per-body invariant and dropping the enforcement).
    //
    // Fixture shape (shared across the three multi-satisfied cases):
    //   - one body per rule variant (bodies are pinned by declare_licence
    //     regardless of credit — same accepted debt as the file header)
    //   - taxonomy: role_mappings = {chair: 'CAT_CHAIR', attendee: 'CAT_ATT'}
    //     plus the rule under test (or absent, for the null case)
    //   - event with TWO groups on that body, category_code = CAT_CHAIR
    //     and CAT_ATT respectively — both satisfied by a two-role
    //     practitioner (chair + default attendee)
    //   - one practitioner with a verified licence AND both roles
    // -----------------------------------------------------------------
    // Nested describe so the drop/restore is scoped: the multi-body tests
    // above rely on the one-group-per-body invariant for correctness.
    // Wrapping only the A2 cases keeps the outer suite unaffected.
    describe('A2 — role_award_rule enforcement (schema conflict scoped)', () => {
      beforeAll(async () => {
        await sqlSuperuser(
          `drop index if exists public.event_accreditation_groups_event_body_uniq;`,
        );
      }, 15_000);
      afterAll(async () => {
        // Restore the invariant so the rest of the test run + subsequent
        // suites see the shipped schema shape. Guarded with IF NOT EXISTS
        // so a re-entry (e.g. a re-run without teardown) is a no-op.
        await sqlSuperuser(
          `create unique index if not exists event_accreditation_groups_event_body_uniq on public.event_accreditation_groups (event_id, body_id);`,
        );
      }, 15_000);

    async function makeA2Fixture(shortName: string, taxonomy: Record<string, unknown>) {
      const bodyId = await newBody(shortName, {
        category_taxonomy: {
          role_mappings: { chair: 'CAT_CHAIR', attendee: 'CAT_ATT' },
          ...taxonomy,
        },
      });
      const start = new Date();
      const { data: ev, error: evErr } = await admin
        .from('events')
        .insert({
          title: `A2 ${shortName} fixture — DELETE ME ${mbTs}`,
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 3_600_000).toISOString(),
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
      if (evErr || !ev) throw new Error(`A2 ${shortName} event fixture: ${evErr?.message}`);
      const eventId = ev.id as string;

      // Two groups, one per category — a two-role practitioner satisfies both.
      // proportional/hours matches the other role-tax fixture's shape.
      await sqlSuperuser(`
        with grp_chair as (
          insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
          values ('${eventId}', '${bodyId}', 'CAT_CHAIR', 'hours', 'proportional')
          returning id
        ), acc_chair as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 4 from grp_chair returning id
        ), grp_att as (
          insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
          values ('${eventId}', '${bodyId}', 'CAT_ATT', 'hours', 'proportional')
          returning id
        ), acc_att as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 3 from grp_att returning id
        )
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select acc.id, eo.id from acc_chair acc, public.event_occurrences eo where eo.event_id = '${eventId}'
        union all
        select acc.id, eo.id from acc_att   acc, public.event_occurrences eo where eo.event_id = '${eventId}';
      `);

      const user = await createTestUser(`a2-${shortName}-${mbTs}`);
      await declareAndVerify(user, bodyId, `A2-${shortName}-${mbTs}`);
      const reg = await regFor(eventId, user, `A2${shortName}${mbTs}`);
      await checkin(reg.id, eventId, [1]);
      // BOTH roles explicit — inserting only 'chair' loses the implicit
      // attendee default (that default only kicks in when registration_roles
      // has zero rows for a registration; explicit rows fully replace it),
      // and would leave only CAT_CHAIR satisfied, defeating the multi-satisfied
      // fixture. Verified live against the DB before writing this comment.
      await sqlSuperuser(`
        insert into public.registration_roles (registration_id, role_code) values
          ('${reg.id}', 'chair'),
          ('${reg.id}', 'attendee');
      `);

      return { bodyId, eventId, user, reg };
    }

    // Post-test cleanup — events/groups/registrations are safe (no credit ever
    // posted for the fail-closed paths). Bodies and auth users leak per the
    // file header's accepted-debt pattern.
    async function cleanupA2({ eventId, reg }: { bodyId: string; eventId: string; user: TestUser; reg: { id: string; code: string } }) {
      await mustDelete(admin.from('registrations').delete().eq('id', reg.id), 'A2 registration fixture');
      await sqlSuperuser(`
        delete from public.event_accreditation_groups where event_id = '${eventId}';
        delete from public.events where id = '${eventId}';
      `);
    }

    // Assertion 1 — the shipped path (a body with a single applicable group)
    // still awards even when `role_award_rule` is present. This mirrors
    // 20260820090000's HKCP/MCHK seed (all roles → 'A' + rule='highest_only'),
    // and would break if the pre-pass conflated "rule present" with "consult
    // rule". Constructed here as a body with rule='highest_only' but only ONE
    // matching category — the pre-pass must skip (1 satisfied ≤ 1).
    it('A2 assertion 1: single-satisfied body with rule="highest_only" still awards (shipped path unaffected)', async () => {
      const shipSuffix = Math.random().toString(36).slice(2, 8);
      const shipBody = await newBody(`A2-SHIP-${shipSuffix}`, {
        category_taxonomy: {
          role_mappings: { attendee: 'A', chair: 'A', presenter: 'A' },
          role_award_rule: 'highest_only',
        },
      });
      const start = new Date();
      const { data: ev, error: evErr } = await admin
        .from('events')
        .insert({
          title: `A2 SHIP fixture — DELETE ME ${mbTs}`,
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + 3_600_000).toISOString(),
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
      if (evErr || !ev) throw new Error(`A2 SHIP event fixture: ${evErr?.message}`);
      const shipEventId = ev.id as string;
      await sqlSuperuser(`
        with grp as (
          insert into public.event_accreditation_groups (event_id, body_id, category_code, unit, award_scheme)
          values ('${shipEventId}', '${shipBody}', 'A', 'hours', 'proportional')
          returning id
        ), acc as (
          insert into public.event_accreditations (accreditation_group_id, credit_value)
          select id, 5 from grp returning id
        )
        insert into public.event_accreditation_occurrences (accreditation_id, occurrence_id)
        select acc.id, eo.id from acc, public.event_occurrences eo where eo.event_id = '${shipEventId}';
      `);
      const shipUser = await createTestUser(`a2-ship-${shipSuffix}`);
      await declareAndVerify(shipUser, shipBody, `A2-SHIP-${shipSuffix}`);
      const shipReg = await regFor(shipEventId, shipUser, `A2SHIP${shipSuffix}`);
      await checkin(shipReg.id, shipEventId, [1]);

      const { data, error } = await admin.rpc('award_attendance_credit', {
        p_event_id: shipEventId,
        p_registration_code: shipReg.code, p_enforce_full_setup: false });

      expect(error).toBeNull();
      const rows = data as AwardRow[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ body_id: shipBody, outcome: 'issued' });

      // A ledger row IS posted here — the "assertion 1 does not break the
      // shipped path" check. shipBody, shipEventId, and shipUser all become
      // permanently pinned by that credit (accepted per file header);
      // event_accreditation_groups is frozen by the freeze trigger too.
      // Only registrations is safely deletable (no FK from credit_ledger).
      await mustDelete(admin.from('registrations').delete().eq('id', shipReg.id), 'A2 ship registration');
    }, 30_000);

    // The three fail-closed variants all use the same shape: two categories,
    // one two-role practitioner, only the rule varies. On raise, no
    // credit_ledger row lands — verified explicitly.
    it('A2 assertion 2: no role_award_rule + two satisfied groups raises role_award_rule_missing (PT422)', async () => {
      const fx = await makeA2Fixture(`A2-MISS-${Math.random().toString(36).slice(2, 8)}`, { /* no role_award_rule key */ });
      try {
        const { error } = await admin.rpc('award_attendance_credit', {
          p_event_id: fx.eventId,
          p_registration_code: fx.reg.code, p_enforce_full_setup: false });
        expect(error).not.toBeNull();
        expect(error!.code).toBe('PT422');
        expect(error!.message).toContain('role_award_rule_missing');

        const { data: ledgerRows } = await admin
          .from('credit_ledger')
          .select('id')
          .eq('user_id', fx.user.id)
          .eq('event_id', fx.eventId);
        expect(ledgerRows).toHaveLength(0);
      } finally {
        await cleanupA2(fx);
      }
    }, 30_000);

    it('A2 assertion 3: role_award_rule="highest_only" + two satisfied groups + no priority raises role_award_ambiguous (PT422)', async () => {
      const fx = await makeA2Fixture(`A2-AMB-${Math.random().toString(36).slice(2, 8)}`, { role_award_rule: 'highest_only' });
      try {
        const { error } = await admin.rpc('award_attendance_credit', {
          p_event_id: fx.eventId,
          p_registration_code: fx.reg.code, p_enforce_full_setup: false });
        expect(error).not.toBeNull();
        expect(error!.code).toBe('PT422');
        expect(error!.message).toContain('role_award_ambiguous');

        const { data: ledgerRows } = await admin
          .from('credit_ledger')
          .select('id')
          .eq('user_id', fx.user.id)
          .eq('event_id', fx.eventId);
        expect(ledgerRows).toHaveLength(0);
      } finally {
        await cleanupA2(fx);
      }
    }, 30_000);

    // Brief §4.4 assertion 4 as WRITTEN ("posts two ledger rows") is
    // unimplementable within this dispatch's boundaries: the shipped
    // credit_ledger_attendance_uniq is (user_id, event_id, body_id) partial
    // on credit_earned, so a second row per body raises 23505 which the loop
    // catches as 'already' — turning cumulative into first-satisfied-wins by
    // iteration order (loop has no ORDER BY). Widening the index touches
    // credit_ledger, forbidden by brief §4. The pre-pass therefore fails
    // closed for cumulative too, with a distinct message pointing at the
    // dependency. This assertion pins that behaviour so a future ledger
    // widening removes both the raise and this test at the same time.
    it('A2 assertion 4 (adapted): role_award_rule="cumulative" + two satisfied groups raises role_award_cumulative_needs_ledger_widening (PT422)', async () => {
      const fx = await makeA2Fixture(`A2-CUM-${Math.random().toString(36).slice(2, 8)}`, { role_award_rule: 'cumulative' });
      try {
        const { error } = await admin.rpc('award_attendance_credit', {
          p_event_id: fx.eventId,
          p_registration_code: fx.reg.code, p_enforce_full_setup: false });
        expect(error).not.toBeNull();
        expect(error!.code).toBe('PT422');
        expect(error!.message).toContain('role_award_cumulative_needs_ledger_widening');

        const { data: ledgerRows } = await admin
          .from('credit_ledger')
          .select('id')
          .eq('user_id', fx.user.id)
          .eq('event_id', fx.eventId);
        expect(ledgerRows).toHaveLength(0);
      } finally {
        await cleanupA2(fx);
      }
    }, 30_000);

    // A future body publishing manual_selection with no UI to select against
    // must not silently pick one — same fail-closed posture.
    it('A2 bonus: role_award_rule="manual_selection" + two satisfied groups raises role_award_requires_manual_selection (PT422)', async () => {
      const fx = await makeA2Fixture(`A2-MAN-${Math.random().toString(36).slice(2, 8)}`, { role_award_rule: 'manual_selection' });
      try {
        const { error } = await admin.rpc('award_attendance_credit', {
          p_event_id: fx.eventId,
          p_registration_code: fx.reg.code, p_enforce_full_setup: false });
        expect(error).not.toBeNull();
        expect(error!.code).toBe('PT422');
        expect(error!.message).toContain('role_award_requires_manual_selection');
      } finally {
        await cleanupA2(fx);
      }
    }, 30_000);
    });
  });
});
