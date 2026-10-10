// Backtest for 20261002000000_create_event_forwards_actor_to_publish.sql.
//
// Finding B3 (docs/plans/handoff_20261001-core-ux.md): create_event_with_blocks
// (status='published') called the nested publish_event(new_event_id) with NO
// actor. A real JWT resolved fine; a service-role client (review mode, scripts)
// has no JWT email, so require_active_staff() raised 42501 for EVERY role and
// the app told the organiser "this account is not allowed to publish".
//
// Executes the real RPC under both identities and reads the rows back: the
// service-role path now publishes for a publishing role and still refuses a
// role that may not publish; the real-JWT path is unchanged, and a created_by
// the caller supplies cannot change who publishes (the override is inert for
// an authenticated caller, 20260814020000).
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1), against the LOCAL
// stack only (tests/helpers/clients.ts refuses any other URL).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, sqlSuperuserQuery, type TestUser } from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!process.env.RLS_TESTS)('create_event_with_blocks forwards its actor to publish_event', () => {
  let member: TestUser; // organiser_member: may publish
  let bodyAdmin: TestUser; // body_admin: may NOT publish
  let memberStaffId: string;
  let bodyAdminStaffId: string;
  const eventIds: string[] = [];

  function eventInput(title: string, extra: Record<string, unknown> = {}) {
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 4 * 3_600_000);
    return {
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      timezone: 'Asia/Hong_Kong',
      venue_name: 'Test Venue',
      city: 'Hong Kong',
      country: 'HK',
      latitude: 22.3,
      longitude: 114.2,
      ...extra,
    };
  }

  const titleOf = (tag: string) => `P2a actor forwarding ${tag} (${Date.now()}) - DELETE ME`;

  async function eventsWithTitle(title: string) {
    const { data, error } = await admin.from('events').select('id, status, published_at, created_by').eq('title', title);
    if (error) throw error;
    for (const row of data ?? []) eventIds.push(row.id as string);
    return data ?? [];
  }

  // A draft owned by the member, created through the same RPC the app uses.
  async function createDraft(tag: string): Promise<string> {
    const { data, error } = await admin.rpc('create_event_with_blocks', {
      event_input: eventInput(titleOf(tag), { status: 'draft', created_by: memberStaffId }),
      blocks_input: [],
    });
    if (error) throw new Error(`draft fixture ${tag}: ${error.message}`);
    eventIds.push(data as string);
    return data as string;
  }

  // One active staff row per role, in the default organisation (no auth user needed:
  // the service-role override path resolves the actor from the staff row alone).
  const stamp = Date.now();
  async function staffIdFor(role: string): Promise<string> {
    const email = `p2a-matrix-${role}-${stamp}@rls-test.invalid`;
    const existing = await admin.from('staff').select('id').eq('email', email).maybeSingle();
    if (existing.data?.id) return existing.data.id as string;
    const { error } = await admin
      .from('staff')
      .insert({ email, role, full_name: `P2a matrix ${role}`, organisation_id: DEFAULT_ORG, status: 'active' });
    if (error) throw new Error(`staff fixture ${role}: ${error.message}`);
    const { data } = await admin.from('staff').select('id').eq('email', email).single();
    return data!.id as string;
  }

  async function statusOf(eventId: string): Promise<string | undefined> {
    const { data } = await admin.from('events').select('status').eq('id', eventId).maybeSingle();
    return data?.status as string | undefined;
  }

  beforeAll(async () => {
    member = await createTestUser('p2a-member');
    bodyAdmin = await createTestUser('p2a-bodyadmin');
    const { error } = await admin.from('staff').insert([
      { email: member.email, role: 'organiser_member', full_name: 'P2a Member', organisation_id: DEFAULT_ORG, status: 'active' },
      { email: bodyAdmin.email, role: 'body_admin', full_name: 'P2a Body Admin', organisation_id: DEFAULT_ORG, status: 'active' },
    ]);
    if (error) throw new Error(`staff fixture: ${error.message}`);
    const { data } = await admin.from('staff').select('id, email').in('email', [member.email, bodyAdmin.email]);
    memberStaffId = data!.find((s) => s.email === member.email)!.id as string;
    bodyAdminStaffId = data!.find((s) => s.email === bodyAdmin.email)!.id as string;
  }, 60_000);

  afterAll(async () => {
    // audit_events is append-only (Hard Rule 11): the event_published rows this
    // file writes stay behind by design, so the cleanup attempt is intentionally
    // not wrapped in mustDelete (same as publish_event.rls.test.ts).
    // Namespace-based, not only id-based: an assertion that fails after an event
    // exists but before its id was recorded must not leave rows behind, because the
    // member and body_admin fixture emails are fixed and a stray row would poison the
    // next run with a duplicate-key error.
    const { data: strays } = await admin.from('events').select('id').like('title', 'P2a actor forwarding%');
    const ids = [...new Set([...eventIds, ...(strays ?? []).map((e) => e.id as string)])];
    if (ids.length > 0) {
      await admin.from('audit_events').delete().in('subject_id', ids);
      await mustDelete(admin.from('events').delete().in('id', ids), 'events fixture');
    }
    await mustDelete(admin.from('staff').delete().like('email', 'p2a-%@rls-test.invalid'), 'staff fixture');
    for (const u of [member, bodyAdmin]) if (u) await deleteTestUser(u);
  }, 60_000);

  it('the applied definition forwards the creator and no longer calls publish_event actorless', async () => {
    const rows = await sqlSuperuserQuery<{ def: string }>(
      "select pg_get_functiondef('public.create_event_with_blocks(jsonb,jsonb)'::regprocedure) as def",
    );
    expect(rows[0].def).toContain('publish_event(new_event_id, creator)');
    expect(rows[0].def).not.toContain('publish_event(new_event_id)');
  });

  // The exact B3 reproduction: this failed with 42501 for every role before.
  it('service role + publishing creator: creates AND publishes, audited with the creator\'s role', async () => {
    const title = titleOf('service-role member');
    const { data, error } = await admin.rpc('create_event_with_blocks', {
      event_input: eventInput(title, { status: 'published', created_by: memberStaffId }),
      blocks_input: [],
    });
    expect(error).toBeNull();
    const eventId = data as string;
    eventIds.push(eventId);

    const { data: event } = await admin.from('events').select('status, published_at, created_by').eq('id', eventId).single();
    expect(event?.status).toBe('published');
    expect(event?.published_at).not.toBeNull();
    expect(event?.created_by).toBe(memberStaffId);

    const { data: audit } = await admin
      .from('audit_events')
      .select('actor_role')
      .eq('event_type', 'event_published')
      .eq('subject_id', eventId)
      .maybeSingle();
    expect(audit?.actor_role).toBe('organiser_member');
  });

  it('service role + a role that may not publish (body_admin): refused 42501 and NOTHING is saved', async () => {
    const title = titleOf('service-role body_admin');
    const { error } = await admin.rpc('create_event_with_blocks', {
      event_input: eventInput(title, { status: 'published', created_by: bodyAdminStaffId }),
      blocks_input: [],
    });
    expect(error?.code).toBe('42501');
    expect(await eventsWithTitle(title)).toEqual([]);
  });

  it('service role creating a DRAFT is unaffected (no publish attempted)', async () => {
    const title = titleOf('service-role draft');
    const { data, error } = await admin.rpc('create_event_with_blocks', {
      event_input: eventInput(title, { status: 'draft', created_by: memberStaffId }),
      blocks_input: [],
    });
    expect(error).toBeNull();
    eventIds.push(data as string);
    const { data: event } = await admin.from('events').select('status, published_at').eq('id', data as string).single();
    expect(event?.status).toBe('draft');
    expect(event?.published_at).toBeNull();
  });

  it('real JWT, organiser_member, published: unchanged, and a forged created_by is ignored', async () => {
    const title = titleOf('jwt member');
    // The caller names the body_admin as creator; the RPC must use the JWT identity.
    const { data, error } = await member.client.rpc('create_event_with_blocks', {
      event_input: eventInput(title, { status: 'published', created_by: bodyAdminStaffId }),
      blocks_input: [],
    });
    expect(error).toBeNull();
    const eventId = data as string;
    eventIds.push(eventId);

    const { data: event } = await admin.from('events').select('status, created_by').eq('id', eventId).single();
    expect(event?.status).toBe('published');
    expect(event?.created_by).toBe(memberStaffId);

    const { data: audit } = await admin
      .from('audit_events')
      .select('actor_role')
      .eq('event_type', 'event_published')
      .eq('subject_id', eventId)
      .maybeSingle();
    expect(audit?.actor_role).toBe('organiser_member');
  });

  it('real JWT, body_admin, published: still refused 42501 and nothing saved (the override changes nothing for a real caller)', async () => {
    const title = titleOf('jwt body_admin');
    // Naming a publishing teammate as created_by must not let a body_admin publish.
    const { error } = await bodyAdmin.client.rpc('create_event_with_blocks', {
      event_input: eventInput(title, { status: 'published', created_by: memberStaffId }),
      blocks_input: [],
    });
    // The specific SQLSTATE, not "an error": only 42501 distinguishes the grant-level
    // refusal from a constraint failing for some other reason (Hard Rule 11).
    expect(error?.code).toBe('42501');
    expect(await eventsWithTitle(title)).toEqual([]);
  });

  // The override is a service-role-only path. publish_event itself must ignore it
  // for an authenticated caller in BOTH directions: it can neither lend a
  // body_admin the right to publish nor take it away from a member.
  it('an authenticated caller\'s p_actor_override is ignored by publish_event itself', async () => {
    const draftA = await createDraft('override-body-admin');
    const refused = await bodyAdmin.client.rpc('publish_event', { p_event_id: draftA, p_actor_override: memberStaffId });
    expect(refused.error?.code).toBe('42501');
    expect((await statusOf(draftA))).toBe('draft');

    const draftB = await createDraft('override-member');
    const ok = await member.client.rpc('publish_event', { p_event_id: draftB, p_actor_override: bodyAdminStaffId });
    expect(ok.error).toBeNull();
    expect(await statusOf(draftB)).toBe('published');
    const { data: audit } = await admin
      .from('audit_events')
      .select('actor_role')
      .eq('event_type', 'event_published')
      .eq('subject_id', draftB)
      .maybeSingle();
    expect(audit?.actor_role).toBe('organiser_member');
  });

  it('a repeated publish is idempotent, while cancelled and deleted events stay unpublished', async () => {
    const published = await createDraft('repeat-publish');
    expect((await member.client.rpc('publish_event', { p_event_id: published })).error).toBeNull();
    expect((await member.client.rpc('publish_event', { p_event_id: published })).error).toBeNull();
    const { count: publishAudits } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'event_published')
      .eq('subject_id', published);
    expect(publishAudits).toBe(1);

    const cancelled = await createDraft('cancelled-not-publishable');
    const { error: cancelSetupError } = await admin
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', cancelled);
    if (cancelSetupError) throw new Error(`cancelled fixture: ${cancelSetupError.message}`);
    const cancelledAttempt = await member.client.rpc('publish_event', { p_event_id: cancelled });
    expect(cancelledAttempt.error?.code).toBe('22023');
    expect(await statusOf(cancelled)).toBe('cancelled');

    const deleted = await createDraft('soft-deleted-not-publishable');
    const { error: deleteSetupError } = await admin
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleted);
    if (deleteSetupError) throw new Error(`deleted fixture: ${deleteSetupError.message}`);
    const deletedAttempt = await member.client.rpc('publish_event', { p_event_id: deleted });
    expect(deletedAttempt.error?.code).toBe('22023');
    const { data: deletedRow } = await admin.from('events').select('status, deleted_at').eq('id', deleted).single();
    expect(deletedRow?.status).toBe('draft');
    expect(deletedRow?.deleted_at).not.toBeNull();

    const { count: rejectedAudits } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'event_published')
      .in('subject_id', [cancelled, deleted]);
    expect(rejectedAudits).toBe(0);
  });

  // Drift guard. The app decides what to SHOW with canPublishEvents(); the database
  // decides what is ALLOWED. lib/auth.test.ts pins the app half; this pins the
  // database half over EVERY role the staff table accepts, so the two lists cannot
  // diverge unnoticed (and a sixth role fails here until someone classifies it).
  it('publish_event accepts exactly organiser_admin, organiser_member and eventar_staff, over every staff role', async () => {
    const [{ def }] = await sqlSuperuserQuery<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'staff_role_check'",
    );
    const dbRoles = [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    const expected: Record<string, boolean> = {
      organiser_admin: true,
      organiser_member: true,
      eventar_staff: true,
      body_admin: false,
      auditor: false,
    };
    expect(dbRoles).toEqual(Object.keys(expected).sort());

    for (const [role, mayPublish] of Object.entries(expected)) {
      const staffId = await staffIdFor(role);
      const draft = await createDraft(`matrix-${role}`);
      const { error } = await admin.rpc('publish_event', { p_event_id: draft, p_actor_override: staffId });
      if (mayPublish) {
        expect(error, `${role} should publish`).toBeNull();
        expect(await statusOf(draft)).toBe('published');
      } else {
        expect(error?.code, `${role} should be refused`).toBe('42501');
        expect(await statusOf(draft)).toBe('draft');
      }
    }
  }, 60_000);

  // The same guard for accreditation. The app decides what to SHOW with
  // canSetAccreditation(); the database decides what is ALLOWED. set_event_cpd_config's
  // resolve_actor admits only organiser_admin and eventar_staff and refuses every other role
  // at the actor gate, before it looks at the body. A role that PASSES the gate can still be
  // refused later with details 'not_authorised_for_body' (the organisation is not authorised
  // by that body), so that detail, or success, is the observable proof the role gate was
  // passed, and a refusal WITHOUT it is the role gate itself.
  it('set_event_cpd_config passes the role gate for exactly organiser_admin and eventar_staff, over every staff role', async () => {
    const { data: body } = await admin.from('accrediting_bodies').select('id').limit(1).single();
    expect(body, 'at least one accrediting body exists locally').toBeTruthy();
    const expected: Record<string, boolean> = {
      organiser_admin: true,
      organiser_member: false,
      eventar_staff: true,
      body_admin: false,
      auditor: false,
    };
    for (const [role, maySet] of Object.entries(expected)) {
      const staffId = await staffIdFor(role);
      const draft = await createDraft(`cpd-matrix-${role}`);
      const { error } = await admin.rpc('set_event_cpd_config', {
        p_event_id: draft,
        p_body_id: body!.id,
        p_cpd_hours: 2,
        p_actor_override: staffId,
      });
      const refusedAtRoleGate = error?.code === '42501' && error.details !== 'not_authorised_for_body';
      if (maySet) {
        expect(refusedAtRoleGate, `${role} should pass the role gate (got ${error?.code} ${error?.message})`).toBe(false);
      } else {
        expect(refusedAtRoleGate, `${role} should be refused at the role gate (got ${error?.code} ${error?.message})`).toBe(true);
      }
    }
  }, 60_000);
});
