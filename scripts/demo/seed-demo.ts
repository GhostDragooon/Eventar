// scripts/demo/seed-demo.ts — LOCAL-STACK-ONLY demo fixture.
//
// Builds the fixture the 15-minute run sheet needs (docs/plans/demo-run-sheet.md):
// one draft event with its agenda, an operator + a practitioner auth account,
// and 6 registrations. Read that doc first — this script is its executable
// half.
//
// Idempotent: every write finds-or-creates rather than blindly inserting, so
//   supabase db reset && pnpm exec tsx scripts/demo/seed-demo.ts
// can be re-run any number of times with zero duplicate-key errors — a
// second run (no reset in between) reprints the exact same summary as the
// first, because the event (looked up by title) and every attendee (looked
// up by event_id+email) are reused rather than recreated. That also means
// the fixture's timing window (start = now + 180min) is fixed at first
// creation, NOT refreshed on a plain re-run: to move the window, tear down
// first — `reset-demo.ts` (the run sheet's reset procedure) or `supabase db
// reset` — then reseed. A plain re-run reprints the identical banner, so it
// cannot be used to "buy more time" before registration closes.
//
// Uses the service-role client throughout (bypasses RLS by design — same
// posture as supabase/seed.sql, which this script's staff-upsert convention
// mirrors) since this is fixture data, not a real user flow. The 6
// registrations are inserted directly rather than via the anon
// registerForEvent Server Action because the event is deliberately left in
// `draft` (Beat 2 demos the publish moment) and anon RLS only allows
// registration inserts against published events — service-role bypasses
// that, which is exactly the point here.
//
// Speaker-count note: the run sheet's fixture line reads "(2 agenda blocks,
// 3 speakers, ...)" — read here as 3 TOTAL across the event (keynote 1 +
// panel 2), not 3 additional on top of the keynote. That also keeps the
// poster's "3-up speaker cards" full with no "+N more" overflow chip
// (deriveSpeakerNames dedupes across both blocks — see lib/agenda.ts).

import { admin, signedInClient } from './lib';
import { generateRegistrationCode } from '../../lib/registrationCode';
import { formatInTz } from '../../lib/tz';
import { CHECKIN_OPEN_MINUTES } from '../../lib/lifecycle/eventLifecycle';

type AdminClient = ReturnType<typeof admin>;

const OPERATOR_EMAIL = 'demo-staff@local.test';
const OPERATOR_PASSWORD = 'demo-staff-pw-2026';
const OPERATOR_NAME = 'Sarah Lee';

const PRACTITIONER_EMAIL = 'demo-doctor@local.test';
// Same demo-<role>-pw-2026 naming pattern as the operator password — not
// the literal same string, so the two logins stay distinguishable live.
const PRACTITIONER_PASSWORD = 'demo-doctor-pw-2026';
// MUST NOT collide with any ATTENDEES name, the operator, or a speaker. This
// account is the Beat-5 (ledger-demo.ts) organiser_attested creditee; the
// Beat-4.6 automatic creditee is the ATTENDEE 'Karen Lau' (k.lau@demo.test) —
// a DIFFERENT auth user. Both were previously named 'Karen Lau', so the Beat-5
// ledger readout showed two rows labelled 'Karen Lau' on one event (3h and
// 3.5h) and the run sheet told the operator to call them the same person. In
// front of an accrediting body that reads as sanctioned double-counting.
// Also deliberately NOT a speaker any more: a speaker earning attendance
// credit at their own session is itself a CPD compliance flag.
const PRACTITIONER_NAME = 'Elaine Tsang';
const PRACTITIONER_PREFERRED_NAME = 'Dr. Elaine Tsang';
// The keynote speaker is its own identity, decoupled from the practitioner above.
const KEYNOTE_SPEAKER_NAME = 'Dr. Nadia Rahman';

const EVENT_TITLE = 'Clinical Update Seminar 2026';
const EVENT_TIMEZONE = 'Asia/Hong_Kong';

// CPD MVP Stage 4 — config-free issuance needs the event to declare a body +
// hours, and at least one attendee to have a real account + verified licence
// at that body (award_attendance_credit resolves registration.email -> a real
// auth.users row -> an active practitioner_licences row; most real attendees
// won't have either yet, pre-self-serve — this fixture models the one that
// does). HKAM, not HKCP: the seeded accrediting_bodies reference set
// (20260709240000) has no HKCP row — see ledger-demo.ts's same note.
const CPD_BODY_SHORT_NAME = 'HKAM';
const CPD_HOURS = 3;
const VENUE_NAME = 'HKCEC — Room 2';
const VENUE_ADDRESS = '1 Expo Drive, Wan Chai, Hong Kong';
// Hong Kong Convention and Exhibition Centre, approx. — only used for the
// event row's lat/lng columns; this script sets timezone explicitly rather
// than deriving it via tzFromCoords, so precision here doesn't matter.
const VENUE_LAT = 22.2829;
const VENUE_LNG = 114.1735;

type AttendeeFixture = { full_name: string; email: string };

// 6 plausibly-named fake attendees (run-sheet fixture spec: "6 plausibly-
// named fake attendees, one pre-registered"). The first is that
// pre-registered attendee — its code is the one the run sheet's Beat 4 shows
// on the demo phone's rendered reminder pass, so it's printed prominently
// below as DEMO PASS CODE.
const ATTENDEES: AttendeeFixture[] = [
  { full_name: 'Karen Lau', email: 'k.lau@demo.test' },
  { full_name: 'Wing Yan Ho', email: 'w.ho@demo.test' },
  { full_name: 'Michael Chan', email: 'm.chan@demo.test' },
  { full_name: 'Priya Sharma', email: 'p.sharma@demo.test' },
  { full_name: 'David Wong', email: 'd.wong@demo.test' },
  { full_name: 'Samantha Yip', email: 's.yip@demo.test' },
];
const DEMO_ATTENDEE_EMAIL = ATTENDEES[0].email;
// Karen Lau's REGISTRATION identity, above, is separate from an account — most
// registrations are anonymous by design. She's the one attendee this fixture
// resolves to a real account + verified licence (see CPD_BODY_SHORT_NAME
// above), so her check-in demonstrates automatic issuance. Not printed in the
// banner: no UI surface uses this login (self-serve attendee auth is
// deferred) — it exists only so award_attendance_credit's email resolution
// has a real auth.users row to find.
const DEMO_ATTENDEE_PASSWORD = 'demo-attendee-pw-2026';

/** Find an existing local-stack auth user by email, or create one. Returns the user id. */
async function findOrCreateAuthUser(
  client: AdminClient,
  email: string,
  password: string,
  fullName: string,
): Promise<string> {
  const list = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw list.error;
  const existing = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;

  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error) {
    // Race between the listUsers() above and this call (e.g. a concurrent
    // run) — re-fetch rather than fail on what's actually success.
    if (created.error.code === 'email_exists') {
      const retry = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (retry.error) throw retry.error;
      const found = retry.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) return found.id;
    }
    throw created.error;
  }
  return created.data.user.id;
}

/** Upsert the operator's staff row (on_conflict mirrors supabase/seed.sql's
 * staff_email_org_key convention). Returns the staff id. */
async function upsertOperatorStaff(client: AdminClient): Promise<string> {
  const { error: upsertErr } = await client
    .from('staff')
    .upsert(
      { email: OPERATOR_EMAIL, full_name: OPERATOR_NAME, role: 'eventar_staff', status: 'active' },
      { onConflict: 'email,organisation_id', ignoreDuplicates: true },
    );
  if (upsertErr) throw upsertErr;

  const { data, error } = await client.from('staff').select('id').eq('email', OPERATOR_EMAIL).single();
  if (error) throw error;
  return data.id;
}

/** Look up an accrediting body's id by short_name (e.g. 'HKAM'). Throws if the
 * seed reference set (20260709240000) doesn't have it — a hard prerequisite,
 * not a fixture this script creates. */
async function findBodyId(client: AdminClient, shortName: string): Promise<string> {
  const { data, error } = await client
    .from('accrediting_bodies')
    .select('id')
    .eq('short_name', shortName)
    .single();
  if (error || !data) throw new Error(`accrediting body ${shortName} not found: ${error?.message}`);
  return data.id as string;
}

type EventFixture = { id: string; start_time: string; end_time: string };

/** Find the demo event by title, or create it (draft, 2 agenda blocks) via
 * create_event_with_blocks. That RPC is atomic (single PostgREST transaction),
 * so "event exists" implies "its blocks exist too" — no separate block check
 * needed for idempotency. accrediting_body_id/cpd_hours are set on an existing
 * event too (not just at creation) — cheap, and means a pre-Stage-4 fixture
 * left over from an earlier seed run still ends up CPD-configured on the next
 * plain re-run, no reset required. */
// Minutes from now to the event's start. Registration is open while
// now < start - CHECKIN_OPEN_MINUTES; check-in is open from that moment until
// end_time. The two never overlap (G11), so a full walkthrough re-runs this
// script with a second offset rather than trying to satisfy both at once.
const START_OFFSET_MIN = Number(process.env.DEMO_START_OFFSET_MIN ?? 180);

async function findOrCreateEvent(
  client: AdminClient,
  operatorStaffId: string,
  bodyId: string,
): Promise<EventFixture> {
  const { data: existing, error: findErr } = await client
    .from('events')
    .select('id, start_time, end_time')
    .eq('title', EVENT_TITLE)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    const { error: cpdErr } = await client
      .from('events')
      .update({ accrediting_body_id: bodyId, cpd_hours: CPD_HOURS })
      .eq('id', existing.id);
    // Stage 8's freeze trigger rejects a CPD-config change once a credit
    // references this event. Same values re-written = no-op, so a plain re-seed
    // is unaffected; this only fires if CPD_BODY_SHORT_NAME/CPD_HOURS changed
    // after a run that issued a credit. Give the remedy instead of a raw dump —
    // the script's "re-runnable with zero errors" contract holds only while
    // those constants are unchanged.
    if (cpdErr?.code === '22023') {
      throw new Error(
        `This event already has an issued CPD credit, so its body/hours are frozen.\n` +
          `To change CPD_BODY_SHORT_NAME or CPD_HOURS, tear down first:\n` +
          `  pnpm exec tsx scripts/demo/reset-demo.ts`,
      );
    }
    if (cpdErr) throw cpdErr;

    // Move the window to the requested offset. WITHOUT this a re-seed reused
    // whatever times the row was first created with, so the fixture silently
    // rotted: on 2026-08-05 a plain re-seed returned an event that had ended
    // ten days earlier, with registration closed and check-in closed — the
    // whole loop unwalkable and nothing saying why.
    //
    // It is also the clock knob. Registration and check-in windows are
    // DISJOINT by design (see below), so one event cannot have both open at
    // once. Re-run with a different offset to move between them:
    //   DEMO_START_OFFSET_MIN=180  -> registration open  (walk register)
    //   DEMO_START_OFFSET_MIN=-10  -> check-in open      (walk check-in)
    // Times are not frozen by the CPD freeze trigger — only body/hours are —
    // so this stays legal after a credit has been issued.
    const reStart = new Date(Date.now() + START_OFFSET_MIN * 60_000);
    const reEnd = new Date(reStart.getTime() + 4 * 60 * 60_000);
    const { error: timeErr } = await client
      .from('events')
      .update({ start_time: reStart.toISOString(), end_time: reEnd.toISOString() })
      .eq('id', existing.id);
    if (timeErr) throw timeErr;

    // Shift the agenda blocks by the same delta. WITHOUT this the blocks keep
    // whatever times they were first created with, so a re-seed moves the
    // event's window but leaves its own agenda dated days away from it — the
    // public event page then shows an agenda that looks broken (times with
    // no correlation to the event) even though the event's own window is
    // correct. Same class of bug this fix is patching one layer up.
    const delta = reStart.getTime() - new Date(existing.start_time).getTime();
    const { data: existingBlocks, error: blocksFindErr } = await client
      .from('agenda_blocks')
      .select('id, start_time, end_time')
      .eq('event_id', existing.id);
    if (blocksFindErr) throw blocksFindErr;
    for (const block of existingBlocks ?? []) {
      const { error: blockShiftErr } = await client
        .from('agenda_blocks')
        .update({
          start_time: new Date(new Date(block.start_time).getTime() + delta).toISOString(),
          end_time: new Date(new Date(block.end_time).getTime() + delta).toISOString(),
        })
        .eq('id', block.id);
      if (blockShiftErr) throw blockShiftErr;
    }

    return { ...existing, start_time: reStart.toISOString(), end_time: reEnd.toISOString() };
  }

  // 180 min. Registration closes UNCONDITIONALLY once the check-in window
  // opens (start − CHECKIN_OPEN_MINUTES = 60 min — see
  // lib/lifecycle/eventLifecycle.ts computeLifecycle / G11), independent of
  // registration_close_at, so the registration-open window is exactly
  // (offset − 60) min wide. The original 45-min offset opened the event
  // already inside the closed window (Beat 3 failed on arrival). 90 fixed
  // that but left only a ~30-min window — which the run sheet's own ~30-min
  // prep block consumes, so registration could still be closed by the time
  // the operator reaches Beat 3 live. 180 leaves a ~120-min window that
  // comfortably outlasts prep + the 15-min demo.
  //
  // ⚠️ 2026-08-04 — "self-check-in is unaffected by this offset" USED TO BE
  // TRUE AND NO LONGER IS. self_check_in() had no time window at all until
  // DEFERRED item 57 closed (20260804010000); it now refuses outside
  // [start − CHECKIN_OPEN_MINUTES, end] like every other surface. At a 180-min
  // offset the self-serve tap returns 'not_open'.
  //
  // This is not a tuning problem — the two windows are DISJOINT BY DESIGN.
  // registerForEvent closes registration at min(registration_close_at,
  // start − CHECKIN_OPEN_MINUTES), i.e. unconditionally when check-in opens
  // (G11), so no offset makes Beat 3 (live registration) and a self-serve
  // Beat 4 both work at the same wall-clock moment. The old script only
  // worked because the guard was missing.
  //
  // STILL WORKING at this offset: Beat 3, Beat 4's staff scan and manual
  // entry (mark_attended is deliberately NOT time-gated — a trusted,
  // physically-present actor), and Beat 4.6's credit, which fires off that
  // staff scan. ONLY the self-serve tap is affected. Awaiting Ivan's call —
  // see docs/plans/demo-run-sheet.md Beat 4.
  const startTime = new Date(Date.now() + START_OFFSET_MIN * 60_000);
  const endTime = new Date(startTime.getTime() + 4 * 60 * 60_000);
  const keynoteEnd = new Date(startTime.getTime() + 60 * 60_000);
  const panelEnd = new Date(keynoteEnd.getTime() + 75 * 60_000);

  const event_input = {
    title: EVENT_TITLE,
    topic: 'Clinical updates for HK CPD practitioners',
    description:
      'An afternoon of clinical updates and case discussion for HK-registered practitioners pursuing CPD credit.',
    max_attendees: 180,
    status: 'draft',
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    timezone: EVENT_TIMEZONE,
    venue_name: VENUE_NAME,
    venue_address: VENUE_ADDRESS,
    city: 'Hong Kong',
    country: 'Hong Kong',
    latitude: VENUE_LAT,
    longitude: VENUE_LNG,
    category: 'life_sciences',
    // Only honoured by the RPC for the service-role executor — see
    // 20260702112004_rpcs_service_role_context.sql.
    created_by: operatorStaffId,
  };

  const blocks_input = [
    {
      start_time: startTime.toISOString(),
      end_time: keynoteEnd.toISOString(),
      kind: 'keynote',
      title: 'Opening Keynote: Advances in Clinical Practice 2026',
      topics: [
        {
          title: 'Advances in Clinical Practice: A 2026 Update',
          speaker_name: KEYNOTE_SPEAKER_NAME,
          speaker_credential: 'MBBS, FHKCP',
          speaker_affiliation: 'Hong Kong Sanatorium & Hospital',
        },
      ],
      display_order: 0,
    },
    {
      start_time: keynoteEnd.toISOString(),
      end_time: panelEnd.toISOString(),
      kind: 'panel',
      title: 'Case Panel: Complex Presentations in Primary Care',
      topics: [
        {
          title: 'Diagnostic pitfalls in atypical presentations',
          speaker_name: 'Dr. Marcus Cheung',
          speaker_credential: 'MBBS, FRCP',
          speaker_affiliation: 'Queen Mary Hospital',
        },
        {
          title: 'Multidisciplinary management strategies',
          speaker_name: 'Dr. Anita Fernandes',
          speaker_credential: 'MBChB, FHKAM(Medicine)',
          speaker_affiliation: 'Prince of Wales Hospital',
        },
      ],
      display_order: 1,
    },
  ];

  const { data: eventId, error: rpcErr } = await client.rpc('create_event_with_blocks', {
    event_input,
    blocks_input,
  });
  if (rpcErr) throw rpcErr;
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('create_event_with_blocks returned no id');
  }

  // Self-serve check-in stays OFF (2026-08-06, Ivan's call). It used to be
  // enabled here so the run sheet's Beat 4 could demo an attendee tapping
  // "Confirm I'm here" on /checkin/confirm. That tap is a check-in from
  // anywhere on earth inside the event window — `self_check_in` has no location
  // check of any kind — which contradicts the product model: an attendee scans
  // a QR at the venue, or staff scan/key their code. Nothing else.
  // The venue-scan path that Beat 4 should have been demoing is specified in
  // docs/plans/2026-08-06-venue-scan-checkin-spec.md and is deliberately NOT
  // built yet (Stage 8 is the active phase). Until it is, the demo shows the
  // two paths that actually exist: staff scan, and staff manual entry.
  // Same update also sets the CPD config columns not in create_event_with_blocks'
  // fixed insert list (Stage 4) — one round-trip, not a second update call.
  const { error: modesErr } = await client
    .from('events')
    .update({
      checkin_modes: { staff: true, self_serve: false },
      accrediting_body_id: bodyId,
      cpd_hours: CPD_HOURS,
    })
    .eq('id', eventId);
  if (modesErr) throw modesErr;

  return { id: eventId, start_time: event_input.start_time, end_time: event_input.end_time };
}

type RegistrationFixture = { id: string; registration_code: string };

/** Find-or-create one registration row, retrying on registration_code
 * collisions — same 5-attempt convention as registerForEvent (see
 * app/(public)/events/[id]/actions.ts). */
async function findOrCreateRegistration(
  client: AdminClient,
  eventId: string,
  attendee: AttendeeFixture,
): Promise<RegistrationFixture> {
  const { data: existing, error: findErr } = await client
    .from('registrations')
    .select('id, registration_code')
    .eq('event_id', eventId)
    .eq('email', attendee.email)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRegistrationCode();
    const { data, error } = await client
      .from('registrations')
      .insert({
        event_id: eventId,
        email: attendee.email,
        full_name: attendee.full_name,
        registration_code: candidate,
      })
      .select('id, registration_code')
      .single();
    if (!error) return data;
    const isCodeCollision = error.code === '23505' && error.message.includes('registrations_code_unique');
    if (!isCodeCollision) throw error;
  }
  throw new Error(`Could not allocate a registration_code for ${attendee.email} after 5 attempts`);
}

/** Give the demo attendee a real account + a verified licence at the CPD body
 * (Stage 4) — the one identity award_attendance_credit can actually resolve.
 * Find-first on the licence: declare_licence isn't itself idempotent (a second
 * call would create a second declared row), so this mirrors
 * findOrCreateRegistration's pattern rather than calling it unconditionally.
 * Declares as the attendee (their own auth.uid()), then verifies as the
 * operator (an eventar_staff row, which satisfies verify_licence's org-match
 * gate against the default org — same as ledger-demo.ts's choreography). */
async function ensureVerifiedLicence(client: AdminClient, bodyId: string): Promise<void> {
  const attendeeUserId = await findOrCreateAuthUser(
    client,
    DEMO_ATTENDEE_EMAIL,
    DEMO_ATTENDEE_PASSWORD,
    ATTENDEES[0].full_name,
  );

  const { data: existing, error: findErr } = await client
    .from('practitioner_licences')
    .select('id')
    .eq('user_id', attendeeUserId)
    .eq('body_id', bodyId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return;

  const attendee = await signedInClient(DEMO_ATTENDEE_EMAIL, DEMO_ATTENDEE_PASSWORD);
  const { data: declared, error: declErr } = await attendee.rpc('declare_licence', {
    p_body_id: bodyId,
    p_licence_number: 'HKAM-2026-DEMO-01',
    p_licence_type: 'specialist',
  });
  if (declErr || !declared) throw new Error(`declare_licence: ${declErr?.message}`);

  const operator = await signedInClient(OPERATOR_EMAIL, OPERATOR_PASSWORD);
  const { error: verErr } = await operator.rpc('verify_licence', {
    p_licence_id: (declared as { id: string }).id,
  });
  if (verErr) throw new Error(`verify_licence: ${verErr.message}`);
}

async function main() {
  const client = admin();

  await findOrCreateAuthUser(client, OPERATOR_EMAIL, OPERATOR_PASSWORD, OPERATOR_NAME);
  const operatorStaffId = await upsertOperatorStaff(client);

  const practitionerUserId = await findOrCreateAuthUser(
    client,
    PRACTITIONER_EMAIL,
    PRACTITIONER_PASSWORD,
    PRACTITIONER_NAME,
  );
  const { error: prefErr } = await client
    .from('users')
    .update({ preferred_name: PRACTITIONER_PREFERRED_NAME })
    .eq('id', practitionerUserId);
  if (prefErr) throw prefErr;

  const bodyId = await findBodyId(client, CPD_BODY_SHORT_NAME);
  const event = await findOrCreateEvent(client, operatorStaffId, bodyId);

  const registrations: { attendee: AttendeeFixture; reg: RegistrationFixture }[] = [];
  for (const attendee of ATTENDEES) {
    registrations.push({ attendee, reg: await findOrCreateRegistration(client, event.id, attendee) });
  }

  const demoReg = registrations.find((r) => r.attendee.email === DEMO_ATTENDEE_EMAIL);
  if (!demoReg) throw new Error('demo attendee registration missing after seeding');

  await ensureVerifiedLicence(client, bodyId);

  // Registration closes when the check-in window opens (start − CHECKIN_OPEN_MINUTES),
  // since this fixture sets no explicit registration_close_at. Surface that
  // deadline — it's the one clock the operator has to beat at Beat 3, and it's
  // fixed at first creation (a plain re-seed will NOT move it — see header).
  const regCloseMs = new Date(event.start_time).getTime() - CHECKIN_OPEN_MINUTES * 60_000;
  const regCloseMinsFromNow = Math.round((regCloseMs - Date.now()) / 60_000);

  // Say plainly which half of the loop is walkable right now. The two windows
  // are disjoint, so exactly one of these is open at any moment, and a tester
  // who does not know that reads the closed one as a broken build.
  const nowMs = Date.now();
  const endMs = new Date(event.end_time).getTime();
  const registrationOpen = nowMs < regCloseMs;
  const inCheckinWindow = nowMs >= regCloseMs && nowMs <= endMs;
  // Publication is a separate gate from the clock, and forgetting it is how
  // this banner first lied: the fixture is created as a DRAFT on purpose (so
  // the organiser walkthrough includes the publish step), and every attendee
  // surface correctly refuses a draft. A window that is open on the clock is
  // still shut if nobody published.
  const { data: statusRow, error: statusErr } = await client
    .from('events').select('status').eq('id', event.id).maybeSingle();
  // A failed read must not read as "not published yet". It degrades the same
  // way either way, so the banner has to say WHICH it is — otherwise the
  // operator spends the demo hunting for a publish button that already worked.
  if (statusErr) {
    console.error(`\n⚠️  Could not read the event's status (${statusErr.code ?? 'unknown'}).`);
    console.error('   The walkability lines below assume NOT published and may be wrong.\n');
  }
  const published = statusRow?.status === 'published';
  const checkinOpen = inCheckinWindow && published;

  console.log('');
  console.log('=== Demo fixture ready ===');
  console.log(`Event:        ${EVENT_TITLE} (${statusRow?.status ?? 'unknown'})`);
  console.log(`Event ID:     ${event.id}`);
  console.log(`Public path:  /events/${event.id}`);
  console.log(`Venue:        ${VENUE_NAME}`);
  console.log(`Starts:       ${formatInTz(event.start_time, EVENT_TIMEZONE)} HKT`);
  console.log(`Ends:         ${formatInTz(event.end_time, EVENT_TIMEZONE)} HKT`);
  console.log(
    `Reg. closes:  ${formatInTz(new Date(regCloseMs).toISOString(), EVENT_TIMEZONE)} HKT` +
      `  (${regCloseMinsFromNow} min from now — the Beat 3 registration deadline)`,
  );
  console.log(
    `CPD credit:   ${CPD_HOURS} hrs @ ${CPD_BODY_SHORT_NAME} — ${demoReg.attendee.full_name} has a verified` +
      ` licence, so their check-in (pass code below) auto-posts a credit`,
  );
  console.log('');
  console.log('Logins:');
  console.log(`  Operator:      ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}`);
  console.log(
    `  Practitioner:  ${PRACTITIONER_EMAIL} / ${PRACTITIONER_PASSWORD}  (${PRACTITIONER_PREFERRED_NAME})`,
  );
  console.log('');
  console.log('Attendees (6):');
  for (const { attendee, reg } of registrations) {
    console.log(`  ${reg.registration_code}  ${attendee.full_name.padEnd(16)} ${attendee.email}`);
  }
  console.log('');
  console.log(`DEMO PASS CODE: ${demoReg.reg.registration_code}`);
  console.log(`  (${demoReg.attendee.full_name}, ${demoReg.attendee.email})`);
  console.log('');
  const site = process.env.DEMO_SITE_URL ?? 'http://localhost:3100';
  console.log('=== What you can walk RIGHT NOW ===');
  if (!published) {
    console.log(`  ⚠️  The event is a DRAFT. Publish it first (attendee pages refuse a draft):`);
    console.log(`       ${site}/events/${event.id}/edit  →  Publish`);
    console.log('');
  }
  if (registrationOpen) {
    if (published) {
      console.log(`  ✅ REGISTER — ${site}/events/${event.id}`);
    } else {
      console.log(`  ⛔ REGISTER — the event is still a DRAFT; publish it first (see above).`);
    }
    console.log(`     Registration closes in ${regCloseMinsFromNow} min, when check-in opens.`);
    console.log('  ⛔ CHECK-IN — not open yet (opens 60 min before start).');
    console.log('     To walk the check-in half, re-run with the clock moved:');
    console.log('       DEMO_START_OFFSET_MIN=-10 pnpm exec tsx scripts/demo/seed-demo.ts');
  } else if (inCheckinWindow) {
    if (checkinOpen) {
      console.log(`  ✅ CHECK IN — ${site}/checkin/confirm?code=${demoReg.reg.registration_code}`);
    } else {
      console.log(`  ⛔ CHECK IN — the event is still a DRAFT; publish it first (see above).`);
    }
    console.log('     Self-serve is on, so the pass shows a "Confirm I\'m here" button.');
    console.log(`     That check-in posts a real CPD credit (${CPD_HOURS} hrs @ ${CPD_BODY_SHORT_NAME}).`);
    console.log(`  ✅ ROSTER  — ${site}/events/${event.id}/checkin  (watch it tick over)`);
    console.log('  ⛔ REGISTER — closed; registration always closes when check-in opens.');
    console.log('     To walk the registration half, re-run with the clock moved:');
    console.log('       DEMO_START_OFFSET_MIN=180 pnpm exec tsx scripts/demo/seed-demo.ts');
  } else {
    console.log('  ⛔ The event has ENDED — nothing is walkable. Re-run to move the clock:');
    console.log('       DEMO_START_OFFSET_MIN=180 pnpm exec tsx scripts/demo/seed-demo.ts');
  }
  console.log('');
}

main().catch((err) => {
  console.error('[seed-demo] failed:', err);
  process.exit(1);
});
