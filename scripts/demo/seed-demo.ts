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
// the fixture's timing window (start = now + 45min) is fixed at first
// creation, not refreshed on every run: to get a new window, `supabase db
// reset` first (full teardown), then reseed. A lighter tear-down-and-reseed
// is `reset-demo.ts` in the run sheet's reset procedure — not yet built.
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

import { admin } from './lib';
import { generateRegistrationCode } from '../../lib/registrationCode';
import { formatInTz } from '../../lib/tz';

type AdminClient = ReturnType<typeof admin>;

const OPERATOR_EMAIL = 'demo-staff@local.test';
const OPERATOR_PASSWORD = 'demo-staff-pw-2026';
const OPERATOR_NAME = 'Sarah Lee';

const PRACTITIONER_EMAIL = 'demo-doctor@local.test';
// Same demo-<role>-pw-2026 naming pattern as the operator password — not
// the literal same string, so the two logins stay distinguishable live.
const PRACTITIONER_PASSWORD = 'demo-doctor-pw-2026';
const PRACTITIONER_NAME = 'Karen Lau';
const PRACTITIONER_PREFERRED_NAME = 'Dr. Karen Lau';

const EVENT_TITLE = 'Clinical Update Seminar 2026';
const EVENT_TIMEZONE = 'Asia/Hong_Kong';
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

type EventFixture = { id: string; start_time: string; end_time: string };

/** Find the demo event by title, or create it (draft, 2 agenda blocks) via
 * create_event_with_blocks. That RPC is atomic (single PostgREST transaction),
 * so "event exists" implies "its blocks exist too" — no separate block check
 * needed for idempotency. */
async function findOrCreateEvent(client: AdminClient, operatorStaffId: string): Promise<EventFixture> {
  const { data: existing, error: findErr } = await client
    .from('events')
    .select('id, start_time, end_time')
    .eq('title', EVENT_TITLE)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing;

  // 90 min, not 45: registration closes UNCONDITIONALLY once the check-in
  // window opens (start − CHECKIN_OPEN_MINUTES = 60 min — see
  // lib/lifecycle/eventLifecycle.ts computeLifecycle / G11), independent of
  // registration_close_at. A 45-min offset put the event already inside that
  // window at the moment of creation — Beat 3 (public registration) could
  // never succeed (confirmed live during Task 6 rehearsal: the public page
  // showed "Registration has closed" immediately post-seed). 90 min leaves a
  // genuine ~30-min registration-open buffer. Self-check-in (Beat 4) is
  // unaffected either way — it's gated only by the static
  // events.checkin_modes.self_serve flag set below, not by this timing.
  const startTime = new Date(Date.now() + 90 * 60_000);
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
          speaker_name: PRACTITIONER_PREFERRED_NAME,
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

  // Enable self-serve check-in (default is staff-only) — the run sheet's
  // Beat 4 has a second attendee self-check-in by typing their manual code,
  // which the /checkin/confirm page only offers when this is true.
  const { error: modesErr } = await client
    .from('events')
    .update({ checkin_modes: { staff: true, self_serve: true } })
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

  const event = await findOrCreateEvent(client, operatorStaffId);

  const registrations: { attendee: AttendeeFixture; reg: RegistrationFixture }[] = [];
  for (const attendee of ATTENDEES) {
    registrations.push({ attendee, reg: await findOrCreateRegistration(client, event.id, attendee) });
  }

  const demoReg = registrations.find((r) => r.attendee.email === DEMO_ATTENDEE_EMAIL);
  if (!demoReg) throw new Error('demo attendee registration missing after seeding');

  console.log('');
  console.log('=== Demo fixture ready ===');
  console.log(`Event:        ${EVENT_TITLE} (draft)`);
  console.log(`Event ID:     ${event.id}`);
  console.log(`Public path:  /events/${event.id}`);
  console.log(`Venue:        ${VENUE_NAME}`);
  console.log(`Starts:       ${formatInTz(event.start_time, EVENT_TIMEZONE)} HKT`);
  console.log(`Ends:         ${formatInTz(event.end_time, EVENT_TIMEZONE)} HKT`);
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
}

main().catch((err) => {
  console.error('[seed-demo] failed:', err);
  process.exit(1);
});
