// DEFERRED item 56 — the organiser↔body authorisation model.
//
// THE HOLE: set_event_cpd_config() is authenticated-executable and every gate
// it has is about the CALLER (role, ownership) or the BODY (exists, active).
// Nothing modelled whether the caller's ORGANISATION may legitimately claim a
// relationship with that body — so an organiser could bind their own event to
// any active accrediting body and self-assert accreditation, minting permanent
// regulator-facing credit that body never authorised.
//
// Not a security regression (every other gate holds), a missing product model.
// This suite pins the model: an explicit organisation × accrediting_body
// allow-list, checked inside the definer. The approval workflow bodies drive
// themselves (submission → reference number → confirmation) is Stage 10; for
// the pilot, rows are seeded service-role-side.
//
// Disposable fixtures: own org, body, staff, event. No credit is ever issued
// here, so unlike tests/cpd/attendance_issuance.rls.test.ts nothing becomes
// permanently undeletable and afterAll cleans up fully.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, createTestUser, deleteTestUser, type TestUser } from '../helpers/clients';

const AUTH_TABLE = 'organisation_body_authorisations';

describe.skipIf(!process.env.RLS_TESTS)('organisation↔body authorisation (DEFERRED 56)', () => {
  let orgId: string;
  let otherOrgId: string;
  let bodyId: string;
  let owner: TestUser;
  let ownerStaffId: string;
  let eventId: string;
  const ts = Date.now();

  beforeAll(async () => {
    // Own tenancy root, so the allow-list starts genuinely empty for this org
    // rather than inheriting whatever the default org has been granted.
    const { data: org, error: orgErr } = await admin
      .from('organisations')
      .insert({ name: `RLS Auth Org ${ts}`, slug: `rls-auth-org-${ts}` })
      .select('id')
      .single();
    if (orgErr || !org) throw new Error(`org fixture: ${orgErr?.message}`);
    orgId = org.id as string;

    const { data: other, error: otherErr } = await admin
      .from('organisations')
      .insert({ name: `RLS Auth Other ${ts}`, slug: `rls-auth-other-${ts}` })
      .select('id')
      .single();
    if (otherErr || !other) throw new Error(`other org fixture: ${otherErr?.message}`);
    otherOrgId = other.id as string;

    const { data: body, error: bodyErr } = await admin
      .from('accrediting_bodies')
      .insert({
        organisation_id: orgId,
        short_name: `RLS-AUTH-${ts}`,
        full_name: 'RLS Test Body (authorisation fixture)',
        status: 'active',
        cycle_config: {},
        category_taxonomy: {},
      })
      .select('id')
      .single();
    if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
    bodyId = body.id as string;

    owner = await createTestUser(`auth56-organiser-${ts}`);
    const { error: staffErr } = await admin.from('staff').insert({
      email: owner.email,
      role: 'organiser_admin',
      full_name: 'RLS Item-56 Organiser Admin',
      organisation_id: orgId,
      status: 'active',
    });
    if (staffErr) throw new Error(`staff fixture: ${staffErr.message}`);

    const { data: staffRow, error: staffLookupErr } = await admin
      .from('staff')
      .select('id')
      .eq('email', owner.email)
      .single();
    if (staffLookupErr || !staffRow) throw new Error(`staff lookup: ${staffLookupErr?.message}`);
    ownerStaffId = staffRow.id as string;

    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        title: `RLS Item-56 Event ${ts}`,
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 90_000_000).toISOString(),
        timezone: 'Asia/Hong_Kong',
        created_by: ownerStaffId,
        organisation_id: orgId,
        venue_name: 'Test Venue',
        city: 'Hong Kong',
        country: 'HK',
        latitude: 22.3,
        longitude: 114.2,
        status: 'draft',
      })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`event fixture: ${evErr?.message}`);
    eventId = ev.id as string;
  });

  afterAll(async () => {
    await admin.from(AUTH_TABLE).delete().eq('organisation_id', orgId);
    await admin.from('events').delete().eq('id', eventId);
    await admin.from('staff').delete().eq('id', ownerStaffId);
    await admin.from('accrediting_bodies').delete().eq('id', bodyId);
    await admin.from('organisations').delete().in('id', [orgId, otherOrgId]);
    if (owner) await deleteTestUser(owner);
  });

  it('refuses to bind an event to a body the organisation is not authorised for', async () => {
    const { error } = await owner.client.rpc('set_event_cpd_config', {
      p_event_id: eventId,
      p_body_id: bodyId,
      p_cpd_hours: 3,
    });
    // 42501 specifically, not merely "an error": a missing-body or bad-hours
    // rejection would also error, and only this code distinguishes
    // authorisation-denial from every other reason the call can fail.
    expect(error?.code).toBe('42501');
  });

  it('leaves the event unaccredited after the refusal', async () => {
    const { data } = await admin
      .from('events')
      .select('accrediting_body_id, cpd_hours')
      .eq('id', eventId)
      .single();
    expect(data?.accrediting_body_id).toBeNull();
    expect(data?.cpd_hours).toBeNull();
  });

  it('still refuses when the authorisation exists but is revoked', async () => {
    const { error: seedErr } = await admin
      .from(AUTH_TABLE)
      .insert({ organisation_id: orgId, body_id: bodyId, status: 'revoked' });
    expect(seedErr).toBeNull();

    const { error } = await owner.client.rpc('set_event_cpd_config', {
      p_event_id: eventId,
      p_body_id: bodyId,
      p_cpd_hours: 3,
    });
    expect(error?.code).toBe('42501');
  });

  it('accepts the binding once the organisation is actively authorised', async () => {
    const { error: upErr } = await admin
      .from(AUTH_TABLE)
      .update({ status: 'active' })
      .eq('organisation_id', orgId)
      .eq('body_id', bodyId);
    expect(upErr).toBeNull();

    const { error } = await owner.client.rpc('set_event_cpd_config', {
      p_event_id: eventId,
      p_body_id: bodyId,
      p_cpd_hours: 3,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('events')
      .select('accrediting_body_id, cpd_hours')
      .eq('id', eventId)
      .single();
    expect(data?.accrediting_body_id).toBe(bodyId);
    expect(Number(data?.cpd_hours)).toBe(3);
  });

  it('still allows clearing an accreditation without an authorisation row', async () => {
    // Clearing is not a claim of authority — an organiser must always be able
    // to undo, including after a body's authorisation is later revoked.
    await admin.from(AUTH_TABLE).update({ status: 'revoked' }).eq('organisation_id', orgId);
    const { error } = await owner.client.rpc('set_event_cpd_config', {
      p_event_id: eventId,
      p_body_id: null,
      p_cpd_hours: null,
    });
    expect(error).toBeNull();
  });

  it('does not let an authorisation for a DIFFERENT organisation unlock the body', async () => {
    await admin.from(AUTH_TABLE).delete().eq('organisation_id', orgId);
    const { error: seedErr } = await admin
      .from(AUTH_TABLE)
      .insert({ organisation_id: otherOrgId, body_id: bodyId, status: 'active' });
    expect(seedErr).toBeNull();

    const { error } = await owner.client.rpc('set_event_cpd_config', {
      p_event_id: eventId,
      p_body_id: bodyId,
      p_cpd_hours: 3,
    });
    expect(error?.code).toBe('42501');

    await admin.from(AUTH_TABLE).delete().eq('organisation_id', otherOrgId);
  });

  // Hard Rule 11: RLS is not sufficient on a table whose sole write path is
  // trusted — service_role has BYPASSRLS, so only a grant-level REVOKE blocks
  // a direct write. 42501 specifically: a partial INSERT would fail on a NOT
  // NULL column too, and only this code proves grant-denial.
  it('denies authenticated a direct INSERT into the allow-list (42501)', async () => {
    const { error } = await owner.client
      .from(AUTH_TABLE)
      .insert({ organisation_id: orgId, body_id: bodyId, status: 'active' });
    expect(error?.code).toBe('42501');
  });

  it('denies authenticated a direct UPDATE of the allow-list (42501)', async () => {
    const { error: seedErr } = await admin
      .from(AUTH_TABLE)
      .insert({ organisation_id: orgId, body_id: bodyId, status: 'revoked' });
    expect(seedErr).toBeNull();

    const { error } = await owner.client
      .from(AUTH_TABLE)
      .update({ status: 'active' })
      .eq('organisation_id', orgId)
      .eq('body_id', bodyId);
    expect(error?.code).toBe('42501');
  });
});
