// Task 2 (service_role systemic guard) — the standing negative test for the
// audited-mutation write posture. Asserts the intended direct-write matrix on
// the three tables whose sole write path is a SECURITY DEFINER function:
//
//   credit_ledger, audit_events   — PERMANENT append-only: no role may
//                                    INSERT/UPDATE/DELETE, including service_role.
//   participation_evidence         — LIFECYCLE: definer-only INSERT/UPDATE (denied
//                                    to all roles incl service_role), but
//                                    service_role DELETE is deliberately RETAINED
//                                    for cleanup/erasure (same as practitioner_licences).
//   practitioner_licences         — LIFECYCLE: definer-only INSERT/UPDATE (denied
//                                    to all roles incl service_role), but
//                                    service_role DELETE is deliberately RETAINED
//                                    for cleanup/erasure (see 20260709320000).
//   data_subject_requests         — LIFECYCLE (added 2026-10-10): no app role may
//                                    UPDATE or DELETE (transition_dsr, audited, is the
//                                    only way a request changes); the one direct
//                                    INSERT is a person filing THEIR OWN request,
//                                    limited to subject_user_id, request_type and
//                                    request_notes; service_role RETAINS DML for the
//                                    future console. Before 20261010000725 the table
//                                    sat behind RLS alone and let a linked organiser
//                                    close, backdate, re-attribute or delete a
//                                    request, and let a person file one already
//                                    completed and stamped with an operator's id.
//   organisation_body_authorisations — REGISTRY: no app role may write at all;
//                                    service_role RETAINS full DML as the
//                                    seeding path until the Stage 10 approval
//                                    workflow. If `authenticated` could write
//                                    this table, an organiser would grant their
//                                    own organisation the right to claim any
//                                    accrediting body and the DEFERRED-56 gate
//                                    would be decorative (see 20260804000000).
//
// The service_role assertions are the load-bearing ones: service_role has
// BYPASSRLS, so RLS provides zero protection for that credential — only the
// table-level grant revoke blocks it. This is the exact hole caught four times
// across Sprints 2/3 (D1, the anon gap, credit_ledger C3, practitioner_licences).
//
// TRUNCATE and TRIGGER (added 2026-10-11) are the privileges none of those revokes covered:
// the platform's default privileges hand both to anon, authenticated and service_role on every
// table in public. TRUNCATE ignores row-level triggers, RLS and the DELETE revoke; TRIGGER lets a
// role slip a trigger in ahead of the hash-chain trigger. The last describe block asserts that no
// API role holds either on any table in public, and that tables postgres creates there start
// without them.
//
// NON-VACUOUSNESS: every denial asserts the specific permission-denied SQLSTATE
// 42501, NOT merely "an error occurred". A bare not-null check would pass even
// against an OPEN grant, because e.g. inserting a partial row still fails on a
// NOT NULL column (23502). Asserting 42501 means the test can only pass if the
// write was rejected *by the grant*, not by a constraint or anything else — so
// it genuinely fails if a grant is ever re-opened. (Proven red-then-green
// against a transient live grant during authoring; see the handoff.)
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import {
  admin,
  createAnonClient,
  createTestUser,
  deleteTestUser,
  sqlSuperuserQuery,
} from '../helpers/clients';
import { mustDelete } from '../helpers/mustDelete';

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const BOGUS = '00000000-0000-0000-0000-0000000000ff';
const PERMISSION_DENIED = '42501';

describe.skipIf(!process.env.RLS_TESTS)('audited-table write guard (service_role systemic fix)', () => {
  // ---- PERMANENT append-only: credit_ledger + audit_events ----
  for (const table of ['credit_ledger', 'audit_events'] as const) {
    describe(`${table} — permanent append-only`, () => {
      it('service_role is denied INSERT/UPDATE/DELETE with 42501 (BYPASSRLS: only the grant blocks it)', async () => {
        // Pre-check, so the post-check below actually means something: if a
        // previous crashed run had left BOGUS behind, "the row is absent
        // afterwards" would be vacuously true and the guard could regress
        // unnoticed. Scoped to the id for the same reason as the post-check.
        const { data: before } = await admin.from(table).select('id').eq('id', BOGUS);
        expect(before, `${table}: BOGUS row must not exist before the denied writes`).toHaveLength(0);

        const ins = await admin.from(table).insert({ id: BOGUS });
        expect(ins.error?.code, `${table}: service_role INSERT must be 42501`).toBe(PERMISSION_DENIED);

        const upd = await admin.from(table).update({ id: BOGUS }).eq('id', BOGUS);
        expect(upd.error?.code, `${table}: service_role UPDATE must be 42501`).toBe(PERMISSION_DENIED);

        const del = await admin.from(table).delete().eq('id', BOGUS);
        expect(del.error?.code, `${table}: service_role DELETE must be 42501`).toBe(PERMISSION_DENIED);

        // Belt-and-braces on top of the 42501 assertions: the attempted row
        // must genuinely not be there. Asserted on the KNOWN id rather than on
        // a global row count — audit_events is written by every audited action
        // in the product, so a total-count snapshot is only stable when nothing
        // else writes between the two reads. Under vitest's parallel workers
        // that is not true (self_check_in / session_revocation legitimately
        // append audit rows in other files), which made the count assertion
        // flake as soon as the suite grew an 18th file. The id check tests the
        // same thing more precisely and cannot be perturbed by a concurrent
        // writer: a count can also stay equal if one row lands while another
        // is removed, which this cannot miss.
        const { data: leaked } = await admin.from(table).select('id').eq('id', BOGUS);
        expect(leaked, `${table}: the denied writes must not have created a row`).toEqual([]);
      }, 30_000);

      it('anon and authenticated are denied direct INSERT with 42501', async () => {
        const anon = createAnonClient();
        expect(
          (await anon.from(table).insert({ id: BOGUS })).error?.code,
          `${table}: anon INSERT must be 42501`,
        ).toBe(PERMISSION_DENIED);

        const user = await createTestUser(`guard-${table}`);
        try {
          expect(
            (await user.client.from(table).insert({ id: BOGUS })).error?.code,
            `${table}: authenticated INSERT must be 42501`,
          ).toBe(PERMISSION_DENIED);
        } finally {
          await deleteTestUser(user);
        }
      }, 30_000);
    });
  }

  // ---- LIFECYCLE: practitioner_licences ----
  describe('practitioner_licences — lifecycle (definer-only INSERT/UPDATE, service_role DELETE retained)', () => {
    it('service_role is denied direct INSERT and UPDATE with 42501', async () => {
      const ins = await admin.from('practitioner_licences').insert({
        user_id: BOGUS,
        body_id: BOGUS,
        licence_number: 'GUARD-TEST',
      });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin
        .from('practitioner_licences')
        .update({ status: 'verified' })
        .eq('id', BOGUS);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('practitioner_licences').insert({ user_id: BOGUS, body_id: BOGUS, licence_number: 'GUARD' })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-pl-write');
      try {
        expect(
          (await user.client.from('practitioner_licences').insert({ user_id: user.id, body_id: BOGUS, licence_number: 'GUARD' })).error?.code,
          'authenticated direct INSERT must be 42501 (declare_licence is the only path)',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);

    it('service_role DELETE is retained — proven by a real declare→delete round-trip', async () => {
      // The retained grant (20260709320000): service_role can DELETE for
      // cleanup/erasure, unlike credit_ledger. Exercise it end-to-end via the
      // real definer write path, then confirm the row is actually gone.
      const { data: body, error: bodyErr } = await admin
        .from('accrediting_bodies')
        // SENTINEL, reused across runs — see roster_eligibility for the full note.
        .upsert({
          organisation_id: DEFAULT_ORG,
          short_name: 'GUARD-FIXTURE',
          full_name: 'Write-guard test body',
          status: 'active', // declare_licence now requires an active body (DEFERRED item 30)
          cycle_config: {},
          category_taxonomy: {},
        }, { onConflict: 'organisation_id,short_name' })
        .select('id')
        .single();
      if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);

      const user = await createTestUser('guard-pl-delete');
      try {
        const { data: lic, error: decErr } = await user.client.rpc('declare_licence', {
          p_body_id: body.id,
          p_licence_number: 'GUARD-DELETE-TEST',
        });
        if (decErr || !lic) throw new Error(`declare_licence: ${decErr?.message}`);
        const licenceId = (lic as { id: string }).id;

        const del = await admin.from('practitioner_licences').delete().eq('id', licenceId);
        expect(del.error, 'service_role DELETE must succeed (retained grant)').toBeNull();

        const { data: after } = await admin
          .from('practitioner_licences')
          .select('id')
          .eq('id', licenceId);
        expect(after, 'licence must be gone after service_role DELETE').toHaveLength(0);
      } finally {
        await deleteTestUser(user);
        await mustDelete(admin.from('accrediting_bodies').delete().eq('id', body.id), 'accrediting_bodies fixture');
      }
    }, 60_000);
  });
  // ---- LIFECYCLE: participation_evidence ----
  describe('participation_evidence — lifecycle (definer-only INSERT/UPDATE, service_role DELETE retained)', () => {
    it('service_role is denied direct INSERT and UPDATE with 42501', async () => {
      const ins = await admin.from('participation_evidence').insert({ id: BOGUS });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);

      const upd = await admin
        .from('participation_evidence')
        .update({ evidence_type: 'correction' })
        .eq('id', BOGUS);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const anon = createAnonClient();
      expect(
        (await anon.from('participation_evidence').insert({ id: BOGUS })).error?.code,
        'anon INSERT must be 42501',
      ).toBe(PERMISSION_DENIED);

      const user = await createTestUser('guard-pe-write');
      try {
        expect(
          (await user.client.from('participation_evidence').insert({ id: BOGUS })).error?.code,
          'authenticated direct INSERT must be 42501',
        ).toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);

    it('service_role DELETE is retained', async () => {
      const del = await admin.from('participation_evidence').delete().eq('id', BOGUS);
      expect(del.error, 'service_role DELETE must succeed (retained grant)').toBeNull();
    }, 30_000);
  });

  // ---- REGISTRY: organisation_body_authorisations ----
  describe('organisation_body_authorisations — registry (no app-role writes, service_role retained)', () => {
    it('anon and authenticated are denied INSERT/UPDATE/DELETE with 42501', async () => {
      const anon = createAnonClient();
      const user = await createTestUser(`obaguard-${Date.now()}`);
      try {
        for (const [label, client] of [
          ['anon', anon],
          ['authenticated', user.client],
        ] as const) {
          const ins = await client
            .from('organisation_body_authorisations')
            .insert({ id: BOGUS, organisation_id: DEFAULT_ORG, body_id: BOGUS });
          expect(ins.error?.code, `${label} INSERT must be 42501`).toBe(PERMISSION_DENIED);

          const upd = await client
            .from('organisation_body_authorisations')
            .update({ status: 'active' })
            .eq('organisation_id', DEFAULT_ORG);
          expect(upd.error?.code, `${label} UPDATE must be 42501`).toBe(PERMISSION_DENIED);

          const del = await client
            .from('organisation_body_authorisations')
            .delete()
            .eq('organisation_id', DEFAULT_ORG);
          expect(del.error?.code, `${label} DELETE must be 42501`).toBe(PERMISSION_DENIED);
        }

        // anon must not even READ it: the allow-list names which organisations
        // hold relationships with which bodies, which is not public.
        const sel = await anon.from('organisation_body_authorisations').select('id').limit(1);
        expect(sel.error?.code, 'anon SELECT must be 42501').toBe(PERMISSION_DENIED);
      } finally {
        await deleteTestUser(user);
      }
    }, 60_000);

    it('service_role retains the seeding path (positive round-trip)', async () => {
      const { data: body, error: bodyErr } = await admin
        .from('accrediting_bodies')
        .upsert({
          organisation_id: DEFAULT_ORG,
          short_name: 'OBA-GUARD-FIXTURE',
          full_name: 'RLS Test Body (allow-list guard fixture)',
          cycle_config: {},
          category_taxonomy: {},
        }, { onConflict: 'organisation_id,short_name' })
        .select('id')
        .single();
      if (bodyErr || !body) throw new Error(`body fixture: ${bodyErr?.message}`);
      try {
        const ins = await admin
          .from('organisation_body_authorisations')
          .insert({ organisation_id: DEFAULT_ORG, body_id: body.id, status: 'active' });
        expect(ins.error, 'service_role INSERT must succeed').toBeNull();

        const upd = await admin
          .from('organisation_body_authorisations')
          .update({ status: 'suspended' })
          .eq('organisation_id', DEFAULT_ORG)
          .eq('body_id', body.id);
        expect(upd.error, 'service_role UPDATE must succeed').toBeNull();
      } finally {
        await admin.from('organisation_body_authorisations').delete().eq('body_id', body.id);
        await mustDelete(admin.from('accrediting_bodies').delete().eq('id', body.id), 'accrediting_bodies fixture');
      }
    }, 60_000);
  });

  // ---- LIFECYCLE: data_subject_requests ----
  // RLS is ON for this table, so a denied INSERT can also surface as 42501 from a POLICY
  // ("new row violates row-level security policy"). Every INSERT assertion below therefore also
  // checks the message says "permission denied" (a table or column privilege), so a revoked
  // grant that is silently replaced by an RLS denial still fails this test.
  describe('data_subject_requests — lifecycle (no app-role UPDATE/DELETE, column-limited self-service INSERT, service_role DML retained)', () => {
    const OPERATOR_ONLY_COLUMNS: Array<[string, unknown]> = [
      ['id', BOGUS],
      ['submitted_at', '2020-01-01T00:00:00Z'],
      ['status', 'completed'],
      ['resolver_staff_id', BOGUS],
      ['resolved_at', '2026-01-01T00:00:00Z'],
      ['due_at', '2099-01-01T00:00:00Z'],
      ['resolution_notes', 'forged'],
    ];

    it('anon is denied INSERT, UPDATE and DELETE with a permission error', async () => {
      const anon = createAnonClient();
      const ins = await anon.from('data_subject_requests').insert({ subject_user_id: BOGUS, request_type: 'access' });
      expect(ins.error?.code, 'anon INSERT').toBe(PERMISSION_DENIED);
      expect(ins.error?.message, 'anon INSERT is a grant denial, not RLS').toMatch(/permission denied/i);
      const upd = await anon.from('data_subject_requests').update({ status: 'completed' }).eq('id', BOGUS);
      expect(upd.error?.code, 'anon UPDATE').toBe(PERMISSION_DENIED);
      const del = await anon.from('data_subject_requests').delete().eq('id', BOGUS);
      expect(del.error?.code, 'anon DELETE').toBe(PERMISSION_DENIED);
    }, 30_000);

    it('authenticated may file their own request with only the three columns a person chooses; every operator-only column is denied', async () => {
      const user = await createTestUser(`guard-dsr-${Date.now()}`);
      const created: string[] = [];
      try {
        const ok = await user.client
          .from('data_subject_requests')
          .insert({ subject_user_id: user.id, request_type: 'access', request_notes: 'guard test' })
          .select('id, status, resolver_staff_id, resolved_at')
          .single();
        expect(ok.error, 'own request with the three allowed columns must succeed').toBeNull();
        created.push(ok.data!.id as string);
        // Defaults supplied the rest: it is a fresh pending request.
        expect(ok.data).toMatchObject({ status: 'pending', resolver_staff_id: null, resolved_at: null });

        for (const [column, value] of OPERATOR_ONLY_COLUMNS) {
          const bad = await user.client
            .from('data_subject_requests')
            .insert({ subject_user_id: user.id, request_type: 'access', [column]: value });
          expect(bad.error?.code, `INSERT with ${column}`).toBe(PERMISSION_DENIED);
          expect(bad.error?.message, `INSERT with ${column} is a column-privilege denial, not RLS`).toMatch(/permission denied/i);
        }
        // Nothing but the one legitimate row exists for this user.
        const { data: rows } = await admin.from('data_subject_requests').select('id').eq('subject_user_id', user.id);
        expect(rows).toHaveLength(1);
      } finally {
        try {
          if (created.length) {
            await mustDelete(admin.from('data_subject_requests').delete().in('id', created), 'data_subject_requests');
          }
        } finally {
          await deleteTestUser(user);
        }
      }
    }, 60_000);

    it('authenticated cannot UPDATE or DELETE even their own request (42501): transition_dsr is the only audited way', async () => {
      const user = await createTestUser(`guard-dsr-ud-${Date.now()}`);
      let id: string | undefined;
      try {
        const made = await admin
          .from('data_subject_requests')
          .insert({ subject_user_id: user.id, request_type: 'access' })
          .select('id')
          .single();
        if (made.error || !made.data) throw new Error(`dsr fixture: ${made.error?.message}`);
        id = made.data.id as string;

        const upd = await user.client.from('data_subject_requests').update({ status: 'completed' }).eq('id', id);
        expect(upd.error?.code, 'authenticated UPDATE').toBe(PERMISSION_DENIED);
        const del = await user.client.from('data_subject_requests').delete().eq('id', id);
        expect(del.error?.code, 'authenticated DELETE').toBe(PERMISSION_DENIED);

        const { data: after } = await admin.from('data_subject_requests').select('status').eq('id', id).single();
        expect(after?.status).toBe('pending');
      } finally {
        try {
          if (id) await mustDelete(admin.from('data_subject_requests').delete().eq('id', id), 'data_subject_requests');
        } finally {
          await deleteTestUser(user);
        }
      }
    }, 60_000);

    it('service_role retains DML (positive round-trip): the console path', async () => {
      const user = await createTestUser(`guard-dsr-sr-${Date.now()}`);
      try {
        const ins = await admin
          .from('data_subject_requests')
          .insert({ subject_user_id: user.id, request_type: 'access', status: 'in_progress' })
          .select('id')
          .single();
        expect(ins.error, 'service_role INSERT must succeed').toBeNull();
        const id = ins.data!.id as string;
        const upd = await admin.from('data_subject_requests').update({ status: 'completed' }).eq('id', id);
        expect(upd.error, 'service_role UPDATE must succeed').toBeNull();
        const del = await admin.from('data_subject_requests').delete().eq('id', id);
        expect(del.error, 'service_role DELETE must succeed').toBeNull();
        const { data: gone } = await admin.from('data_subject_requests').select('id').eq('id', id);
        expect(gone).toHaveLength(0);
      } finally {
        await deleteTestUser(user);
      }
    }, 60_000);
  });

  // ---- TRUNCATE and TRIGGER: the privileges no revoke above covers ----
  // INSERT/UPDATE/DELETE are revoked table by table, but the platform's default privileges also hand the API
  // roles TRUNCATE and TRIGGER (plus REFERENCES and MAINTAIN) on every table in public.
  //   TRUNCATE ignores RLS, row-level triggers and the DELETE revoke.
  //   TRIGGER lets a role attach a BEFORE INSERT trigger that sorts ahead of the chain trigger, so it can
  //   rewrite or drop a row before it is hashed.
  // Measured 2026-10-11, local stack, rolled-back transactions: TRUNCATE audit_events succeeded as all three
  // API roles; as service_role TRUNCATE credit_ledger CASCADE and TRUNCATE users CASCADE (14 more tables)
  // succeeded; a trigger created by `authenticated` rewrote an audit event before it was hashed and
  // verify_audit_chain() flagged 0 of 7,677 rows. anon/authenticated were stopped on the ledger cascades only
  // because credit_disputes had lost TRUNCATE in 20260804040000 and references the ledger.
  //
  // Both need SQL running as an API role. PostgREST exposes only GET/POST/PATCH/DELETE and no function in
  // public runs dynamic SQL, so no shipped path reaches them today; this is for the day one does.
  // SECURITY DEFINER functions owned by postgres, and anything on the postgres connection, keep both
  // privileges: that is a code-review matter, not a grant.
  //
  // Catalog reads only: has_table_privilege follows role inheritance and PUBLIC, needs no fixtures, and raises
  // on an unknown table or role, so a rename cannot turn these into vacuous passes. Scope: tables in public.
  // Platform-owned schemas (storage, net, supabase_functions) still grant TRUNCATE to the API roles and are
  // not ours to change. Runs under `pnpm test:rls` only, so the CI replay job does not execute it.
  //
  // To empty a table in a local test or script, connect as postgres (sqlSuperuser in tests/helpers/clients.ts).
  describe('TRUNCATE and TRIGGER — no API role holds them (Hard Rule 11 grant layer)', () => {
    const API_ROLES = `(values ('anon'), ('authenticated'), ('service_role')) r(role)`;
    const PRIVS = `(values ('TRUNCATE'), ('TRIGGER')) p(priv)`;

    // Appended to every failure. The cause is often not the role the message names (PUBLIC, inheritance, or
    // the migration not applied), so say what to do.
    const REMEDY =
      ' | Fix in a NEW migration: revoke truncate, trigger on public.<table> from PUBLIC, anon, authenticated, service_role.' +
      ' Usual cause: `grant all` (grant select, insert, update, delete instead).' +
      ' All three roles on one table = granted to PUBLIC; one role = inherited through a role (psql \\dp, \\du).' +
      ' Every table failing = migration 20261010175112 is not applied to this database.';

    // Tables whose writes Hard Rule 11 or a migration restricts at the grant level, kept as readable rows. Not
    // every such table (invite_tokens, events, staff, ... are covered by the sweep below, the real guard).
    const PROTECTED = [
      // permanent append-only
      'audit_events',
      'credit_ledger',
      // lifecycle: definer-only INSERT/UPDATE (service_role keeps DELETE)
      'practitioner_licences',
      'participation_evidence',
      // lifecycle: a person keeps a self-service write to their own row; the rest is revoked or definer-only
      'data_subject_requests',
      'credit_disputes',
      'professional_profiles',
      // registry
      'organisation_body_authorisations',
      // definer-only: written by triggers and SECURITY DEFINER functions, never by an API role
      'event_occurrences',
      'registration_checkins',
      'registration_roles',
      'event_accreditation_groups',
      'event_accreditations',
      'event_accreditation_occurrences',
    ];

    it.each(PROTECTED)('%s: anon, authenticated and service_role all lack TRUNCATE and TRIGGER', async (table) => {
      const rows = await sqlSuperuserQuery<{ role: string; priv: string; held: boolean }>(
        `select r.role, p.priv, has_table_privilege(r.role, 'public.${table}', p.priv) as held
           from ${API_ROLES} cross join ${PRIVS}
          order by 1, 2`,
      );
      expect(rows, `${table}: the query must cover 3 roles x 2 privileges`).toHaveLength(6);
      const holders = rows.filter((r) => r.held).map((r) => `${r.role} (${r.priv})`);
      // Names go in the message itself: vitest abbreviates long arrays in its one-line summary.
      expect(holders, `${table}: still held by ${holders.join(', ')}${REMEDY}`).toEqual([]);
    }, 30_000);

    it('no API role holds TRUNCATE or TRIGGER on any table in public', async () => {
      const [{ n }] = await sqlSuperuserQuery<{ n: number }>(
        `select count(*)::int as n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind in ('r', 'p', 'f')`,
      );
      expect(n, 'the sweep must at least see every protected table').toBeGreaterThanOrEqual(PROTECTED.length);

      const held = await sqlSuperuserQuery<{ tbl: string; role: string; priv: string }>(
        `select c.relname as tbl, r.role, p.priv
           from pg_class c
           join pg_namespace ns on ns.oid = c.relnamespace
           cross join ${API_ROLES}
           cross join ${PRIVS}
          where ns.nspname = 'public' and c.relkind in ('r', 'p', 'f')
            and has_table_privilege(r.role, c.oid, p.priv)
          order by 1, 2, 3`,
      );
      const offenders = held.map((h) => `${h.tbl} -> ${h.role} (${h.priv})`);
      expect(offenders, `still held: ${offenders.join(', ')}${REMEDY}`).toEqual([]);
    }, 30_000);

    it('default privileges for postgres no longer hand TRUNCATE or TRIGGER to the API roles on new tables', async () => {
      // Only the postgres rows: it is the role migrations run as. supabase_admin's row (tables the platform
      // itself creates) is not ours to change. Namespace 0 is the schema-less row, which is added to the
      // per-schema row for every new table.
      const grants = await sqlSuperuserQuery<{ role: string; priv: string }>(
        `select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as role, a.privilege_type as priv
           from pg_default_acl d, lateral aclexplode(d.defaclacl) a
          where d.defaclrole = 'postgres'::regrole
            and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
            and d.defaclobjtype = 'r'
            and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))`,
      );
      // Control: this is the row init_staff.sql restates, so it must still carry the DML grants. anon is no
      // longer in it (SEC-01, 20261023140000); the sweep for that is in the describe below.
      expect(
        [...new Set(grants.filter((g) => g.priv === 'INSERT').map((g) => g.role))].sort(),
        'default ACL row for postgres in public not found, or it lost the DML grants',
      ).toEqual(['authenticated', 'service_role']);
      const born = grants.filter((g) => g.priv === 'TRUNCATE' || g.priv === 'TRIGGER').map((g) => `${g.role} (${g.priv})`);
      expect(
        born,
        `a table created in public would start with: ${born.join(', ')} | Fix in a NEW migration: alter default privileges for role postgres [in schema public] revoke truncate, trigger on tables from anon, authenticated, service_role.`,
      ).toEqual([]);
    }, 30_000);
  });
  // ---- SEC-01 (2026-10-23): anon holds no DML on any table in public ----
  // The platform's default privileges hand anon INSERT, UPDATE and DELETE on every table, and eleven tables were
  // never narrowed. RLS blocked the writes, so nothing was reachable, but the anon key ships in every browser, so
  // the grant layer is the control that must not depend on a policy staying correct. Every public write in the
  // app goes through a Server Action with the service-role client or through a SECURITY DEFINER function; the
  // only anon client in the app (supabaseAnonServer) signs people in and reads. registrations has an anon INSERT
  // policy (registrations_anon_insert_when_event_published) that stays as defence in depth but can no longer be
  // reached by anon.
  //
  // A grant-layer refusal says "permission denied for table X"; an RLS refusal says "new row violates row-level
  // security policy". Both are SQLSTATE 42501, so the message is what tells them apart.
  describe('anon holds no INSERT, UPDATE or DELETE on any table in public (SEC-01)', () => {
    const ANON_WRITES = `(values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)`;
    // Table-level or column-level: has_table_privilege alone would miss a column grant. DELETE has no column form.
    const HELD_BY_ANON = (rel: string) =>
      `case when p.priv = 'DELETE' then has_table_privilege('anon', ${rel}, p.priv) else has_any_column_privilege('anon', ${rel}, p.priv) end`;
    const REMEDY =
      ' | Fix in a NEW migration: revoke insert, update, delete on public.<table> from PUBLIC, anon.' +
      ' Usual cause: a new table inherits the default privileges, or a seed/migration used `grant all`.' +
      ' Every table failing = migration 20261023140000 is not applied to this database.';

    // The eleven tables no earlier migration narrowed for anon (found 2026-10-23, local stack).
    const NEVER_NARROWED = [
      'accrediting_bodies',
      'agenda_blocks',
      'consent_records',
      'events',
      'organisations',
      'organisers',
      'registrations',
      'speaker_checkins',
      'staff',
      'survey_responses',
      'users',
    ];

    it.each(NEVER_NARROWED)('%s: anon lacks INSERT, UPDATE and DELETE', async (table) => {
      const rows = await sqlSuperuserQuery<{ priv: string; held: boolean }>(
        `select p.priv, ${HELD_BY_ANON(`'public.${table}'::regclass`)} as held from ${ANON_WRITES} order by 1`,
      );
      expect(rows, `${table}: the query must cover 3 privileges`).toHaveLength(3);
      const held = rows.filter((r) => r.held).map((r) => r.priv);
      expect(held, `${table}: anon still holds ${held.join(', ')}${REMEDY}`).toEqual([]);
    }, 30_000);

    it('no table or view in public grants anon INSERT, UPDATE or DELETE', async () => {
      const seen = await sqlSuperuserQuery<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'v', 'm')`,
      );
      const seenNames = new Set(seen.map((r) => r.relname));
      const missing = NEVER_NARROWED.filter((t) => !seenNames.has(t));
      expect(missing, `the sweep did not see: ${missing.join(', ')} (wrong schema or relkind filter?)`).toEqual([]);

      const held = await sqlSuperuserQuery<{ tbl: string; priv: string }>(
        `select c.relname as tbl, p.priv
           from pg_class c
           join pg_namespace ns on ns.oid = c.relnamespace
           cross join ${ANON_WRITES}
          where ns.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'v', 'm')
            and ${HELD_BY_ANON('c.oid')}
          order by 1, 2`,
      );
      const offenders = held.map((h) => `${h.tbl} (${h.priv})`);
      expect(offenders, `anon still holds: ${offenders.join(', ')}${REMEDY}`).toEqual([]);
    }, 30_000);

    it('default privileges for postgres no longer hand anon INSERT, UPDATE or DELETE on new tables', async () => {
      const grants = await sqlSuperuserQuery<{ role: string; priv: string }>(
        `select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as role, a.privilege_type as priv
           from pg_default_acl d, lateral aclexplode(d.defaclacl) a
          where d.defaclrole = 'postgres'::regrole
            and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
            and d.defaclobjtype = 'r'
            and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))`,
      );
      // Control: authenticated and service_role must still be born with DML, so this is the right row.
      const insertRoles = new Set(grants.filter((g) => g.priv === 'INSERT').map((g) => g.role));
      expect(
        ['authenticated', 'service_role'].filter((r) => !insertRoles.has(r)),
        'default ACL row for postgres in public not found, or authenticated/service_role lost their DML grants',
      ).toEqual([]);
      const born = grants
        .filter((g) => (g.role === 'anon' || g.role === 'PUBLIC') && ['INSERT', 'UPDATE', 'DELETE'].includes(g.priv))
        .map((g) => `${g.role} (${g.priv})`);
      expect(
        born,
        `a table created in public would start with: ${born.join(', ')} | Fix in a NEW migration: alter default privileges for role postgres [in schema public] revoke insert, update, delete on tables from anon.`,
      ).toEqual([]);
    }, 30_000);

    // Found by the SEC-01 backtest (2026-10-23): the same policy is TO {anon, authenticated}, and any visitor can
    // get an authenticated JWT (the attendee magic link creates the user), so a signed-in person could POST
    // /rest/v1/registrations directly: past the event's capacity, its registration window, the ended-event check,
    // the per-IP rate limit and the email_log row, all of which live in the registerForEvent Server Action, and
    // with anyone's email. The policy only checks that the event is published. Registration is service_role-only.
    it('authenticated cannot insert registrations directly either (20261023150000)', async () => {
      const [{ held }] = await sqlSuperuserQuery<{ held: boolean }>(
        `select has_table_privilege('authenticated', 'public.registrations', 'INSERT') as held`,
      );
      expect(held, 'authenticated still holds INSERT on registrations | Fix in a NEW migration: revoke insert on public.registrations from authenticated').toBe(false);

      const user = await createTestUser('sec01-reg-insert');
      try {
        const res = await user.client
          .from('registrations')
          .insert({ event_id: BOGUS, full_name: 'sec-01', email: 'sec01-direct@rls-test.invalid' });
        expect(res.error?.code, 'authenticated INSERT must be 42501').toBe(PERMISSION_DENIED);
        expect(res.error?.message ?? '', 'must be the grant layer, not RLS').toMatch(/permission denied for table registrations/i);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);

    it('a real anon write is refused by the grant, not by a policy (registrations has an anon INSERT policy)', async () => {
      const anon = createAnonClient();
      const res = await anon.from('registrations').insert({ event_id: BOGUS, full_name: 'sec-01', email: 'sec01@rls-test.invalid' });
      expect(res.error?.code, 'anon INSERT must be 42501').toBe(PERMISSION_DENIED);
      expect(res.error?.message ?? '', 'must be the grant layer, not RLS').toMatch(/permission denied for table registrations/i);
    }, 30_000);
  });

  // ---- SEC-01: invite_tokens is definer-only for service_role too ----
  // create_invite_token and accept_invite_token are SECURITY DEFINER (owner postgres) and are the only writers.
  // service_role keeps DELETE for cleanup and erasure, as on practitioner_licences and participation_evidence.
  describe('invite_tokens — definer-only INSERT/UPDATE, service_role DELETE retained (SEC-01)', () => {
    it('service_role is denied direct INSERT and UPDATE with 42501 from the grant', async () => {
      const ins = await admin.from('invite_tokens').insert({
        organisation_id: DEFAULT_ORG,
        token_hash: 'sec01-guard',
        role: 'organiser_member',
        created_by: BOGUS,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(ins.error?.code, 'service_role INSERT must be 42501').toBe(PERMISSION_DENIED);
      expect(ins.error?.message ?? '').toMatch(/permission denied for table invite_tokens/i);

      const upd = await admin.from('invite_tokens').update({ accepted_at: new Date().toISOString() }).eq('id', BOGUS);
      expect(upd.error?.code, 'service_role UPDATE must be 42501').toBe(PERMISSION_DENIED);
      expect(upd.error?.message ?? '').toMatch(/permission denied for table invite_tokens/i);
    }, 30_000);

    it('anon and authenticated are denied direct INSERT with 42501', async () => {
      const row = {
        organisation_id: DEFAULT_ORG,
        token_hash: 'sec01-guard-2',
        role: 'organiser_member',
        created_by: BOGUS,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      };
      const anonRes = await createAnonClient().from('invite_tokens').insert(row);
      expect(anonRes.error?.code, 'anon INSERT must be 42501').toBe(PERMISSION_DENIED);
      expect(anonRes.error?.message ?? '', 'must be the grant layer, not RLS').toMatch(/permission denied for table invite_tokens/i);
      const user = await createTestUser('sec01-invite-write');
      try {
        const authRes = await user.client.from('invite_tokens').insert(row);
        expect(authRes.error?.code, 'authenticated INSERT must be 42501').toBe(PERMISSION_DENIED);
        expect(authRes.error?.message ?? '', 'must be the grant layer, not RLS').toMatch(/permission denied for table invite_tokens/i);
      } finally {
        await deleteTestUser(user);
      }
    }, 30_000);

    it('the definer path still works and service_role DELETE is retained: invite, accept, delete round-trip', async () => {
      const adminUser = await createTestUser('sec01-invite-admin');
      const invitee = await createTestUser('sec01-invitee');
      const emails = [adminUser.email, invitee.email];
      // Postgres connection, not service_role: this must clear a crashed run's rows even if the grant under test
      // is broken. Invites first (accepted_by and created_by point at the staff rows), then the staff rows.
      const clearFixtures = async () => {
        await sqlSuperuserQuery(
          `delete from public.invite_tokens
            where created_by in (select id from public.staff where email = any($1))
               or accepted_by in (select id from public.staff where email = any($1))`,
          [emails],
        );
        await sqlSuperuserQuery(`delete from public.staff where email = any($1)`, [emails]);
      };
      let adminStaffId: string | undefined;
      try {
        await clearFixtures();
        const { data: st, error: stErr } = await admin
          .from('staff')
          .insert({ email: adminUser.email, role: 'organiser_admin', full_name: 'SEC-01 admin', organisation_id: DEFAULT_ORG, status: 'active' })
          .select('id')
          .single();
        if (stErr || !st) throw new Error(`staff fixture: ${stErr?.message}`);
        adminStaffId = st.id as string;

        const { data: token, error: createErr } = await adminUser.client.rpc('create_invite_token', { p_role: 'organiser_member' });
        expect(createErr, 'create_invite_token must still work as a definer function').toBeNull();
        expect(typeof token).toBe('string');

        const { data: org, error: acceptErr } = await invitee.client.rpc('accept_invite_token', { p_token: token });
        expect(acceptErr, 'accept_invite_token must still work as a definer function').toBeNull();
        expect(typeof org).toBe('string');

        const { data: made } = await admin.from('invite_tokens').select('id, accepted_at').eq('created_by', adminStaffId);
        expect(made, 'exactly one invite was created by the fixture admin').toHaveLength(1);
        expect(made![0].accepted_at, 'the accept stamped the token').not.toBeNull();

        const del = await admin.from('invite_tokens').delete().eq('created_by', adminStaffId);
        expect(del.error, 'service_role DELETE must succeed (retained grant)').toBeNull();
        const { data: after } = await admin.from('invite_tokens').select('id').eq('created_by', adminStaffId);
        expect(after, 'the invite must be gone after service_role DELETE').toHaveLength(0);
      } finally {
        // The invitee's staff row was created by accept_invite_token; the admin's by this test.
        await clearFixtures();
        await deleteTestUser(adminUser);
        await deleteTestUser(invitee);
      }
    }, 60_000);
  });
  // ---- SEC-02 (2026-10-23): authenticated cannot rewrite who created an event or when ----
  // Found by the UPD-01 backtest [X]: `authenticated` held column UPDATE on id, created_by, created_at,
  // updated_at and deleted_at of events, and events_org_member_update admits any staff member of the
  // organisation, so a colleague PATCHed created_by of a PUBLISHED event to their own staff id (204). That
  // defeats the creator rule (Ivan's ruling 2, 2026-10-23: accreditation and roster roles are creator-only) and
  // the audit trail's idea of who made an event. Nothing in the app writes those columns as a signed-in user:
  // update_event_with_blocks never sets them, created_by is written at INSERT only, a soft delete goes through
  // a definer function, and updated_at is set by a trigger (a trigger's assignment is not a column privilege).
  describe('events — authenticated cannot UPDATE id, created_by, created_at, updated_at or deleted_at (SEC-02)', () => {
    const LOCKED = ['id', 'created_by', 'created_at', 'updated_at', 'deleted_at'];

    it.each(LOCKED)('authenticated lacks UPDATE on events.%s', async (col) => {
      const [{ held }] = await sqlSuperuserQuery<{ held: boolean }>(
        `select has_column_privilege('authenticated', 'public.events', '${col}', 'UPDATE') as held`,
      );
      expect(held, `authenticated still holds UPDATE on events.${col} | Fix in a NEW migration: revoke update on public.events from authenticated, then grant update (<columns without ${col}>)`).toBe(false);
    }, 30_000);

    it('a colleague PATCHing created_by is refused by the grant (42501), and an ordinary column still updates', async () => {
      const colleague = await createTestUser('sec02-colleague');
      const creatorEmail = `sec02-creator-${Date.now()}@rls-test.invalid`;
      let eventId: string | undefined;
      let creatorId: string | undefined;
      let colleagueStaffId: string | undefined;
      try {
        const { data: staff, error: stErr } = await admin
          .from('staff')
          .insert([
            { email: colleague.email, role: 'organiser_member', full_name: 'SEC-02 colleague', organisation_id: DEFAULT_ORG, status: 'active' },
            { email: creatorEmail, role: 'organiser_member', full_name: 'SEC-02 creator', organisation_id: DEFAULT_ORG, status: 'active' },
          ])
          .select('id, email');
        if (stErr || !staff) throw new Error(`staff fixtures: ${stErr?.message}`);
        creatorId = staff.find((r) => r.email === creatorEmail)!.id as string;
        colleagueStaffId = staff.find((r) => r.email === colleague.email)!.id as string;

        const { data: ev, error: evErr } = await admin
          .from('events')
          .insert({
            title: 'SEC-02 fixture — DELETE ME',
            start_time: new Date(Date.now() + 86_400_000).toISOString(),
            end_time: new Date(Date.now() + 90_000_000).toISOString(),
            timezone: 'Asia/Hong_Kong',
            created_by: creatorId,
            venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
            status: 'draft',
            organisation_id: DEFAULT_ORG,
          })
          .select('id')
          .single();
        if (evErr || !ev) throw new Error(`event fixture: ${evErr?.message}`);
        eventId = ev.id as string;

        const steal = await colleague.client.from('events').update({ created_by: colleagueStaffId }).eq('id', eventId).select('id');
        expect(steal.error?.code, 'a colleague taking over created_by must be 42501').toBe(PERMISSION_DENIED);
        expect(steal.error?.message ?? '').toMatch(/permission denied for table events/i);

        const hide = await colleague.client.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', eventId).select('id');
        expect(hide.error?.code, 'a colleague soft-deleting through PATCH must be 42501').toBe(PERMISSION_DENIED);

        const edit = await colleague.client.from('events').update({ title: 'SEC-02 edited — DELETE ME' }).eq('id', eventId).select('id');
        expect(edit.error, 'an ordinary column must still update for an organisation member').toBeNull();
        const { data: after } = await admin.from('events').select('created_by, deleted_at, title').eq('id', eventId).single();
        expect(after?.created_by).toBe(creatorId);
        expect(after?.deleted_at).toBeNull();
        expect(after?.title).toBe('SEC-02 edited — DELETE ME');

        // The real edit path: update_event_with_blocks is SECURITY INVOKER, so it writes with the caller's column
        // grants. It must still save a draft after the revoke (every column it sets stays granted).
        const rpc = await colleague.client.rpc('update_event_with_blocks', {
          event_id_input: eventId,
          event_input: {
            title: 'SEC-02 via rpc — DELETE ME',
            start_time: new Date(Date.now() + 86_400_000).toISOString(),
            end_time: new Date(Date.now() + 90_000_000).toISOString(),
            timezone: 'Asia/Hong_Kong',
            venue_name: 'V2', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
          },
          blocks_input: [],
        });
        expect(rpc.error, 'the edit RPC must still work for an organisation member').toBeNull();
        const { data: viaRpc } = await admin.from('events').select('title, created_by').eq('id', eventId).single();
        expect(viaRpc?.title).toBe('SEC-02 via rpc — DELETE ME');
        expect(viaRpc?.created_by, 'the RPC must not touch created_by').toBe(creatorId);
      } finally {
        if (eventId) await mustDelete(admin.from('events').delete().eq('id', eventId), 'events fixture');
        await mustDelete(admin.from('staff').delete().in('email', [colleague.email, creatorEmail]), 'staff fixtures');
        await deleteTestUser(colleague);
      }
    }, 60_000);
  });

  // SEC-03 (20261024120000): the DB-04 backtest hard-deleted a published event as an organiser_member with a plain
  // DELETE /rest/v1/events: no audit row, and registrations, survey answers and agenda cascaded with it. A delete is a
  // soft delete run as service_role; no API role needs the grant.
  describe('events — nobody on the API deletes a row (SEC-03)', () => {
    it('anon and authenticated hold no DELETE on events; service_role keeps it', async () => {
      const [row] = await sqlSuperuserQuery<{ anon: boolean; auth: boolean; svc: boolean }>(
        `select has_table_privilege('anon', 'public.events', 'DELETE') as anon,
                has_table_privilege('authenticated', 'public.events', 'DELETE') as auth,
                has_table_privilege('service_role', 'public.events', 'DELETE') as svc`,
      );
      expect(row.anon, 'anon holds DELETE on events | Fix in a NEW migration: revoke delete on public.events from anon, authenticated').toBe(false);
      expect(row.auth, 'authenticated holds DELETE on events | Fix in a NEW migration: revoke delete on public.events from anon, authenticated').toBe(false);
      expect(row.svc, 'service_role must keep DELETE (cleanup, erasure)').toBe(true);
    }, 30_000);

    it('a colleague DELETE of a published event is refused by the grant (42501) and the event and its registration survive', async () => {
      const colleague = await createTestUser('sec03-colleague');
      let eventId: string | undefined;
      try {
        const { data: staff, error: stErr } = await admin
          .from('staff')
          .insert({ email: colleague.email, role: 'organiser_member', full_name: 'SEC-03 colleague', organisation_id: DEFAULT_ORG, status: 'active' })
          .select('id')
          .single();
        if (stErr || !staff) throw new Error(`staff fixture: ${stErr?.message}`);
        const { data: ev, error: evErr } = await admin
          .from('events')
          .insert({
            title: 'SEC-03 fixture — DELETE ME',
            start_time: new Date(Date.now() + 86_400_000).toISOString(),
            end_time: new Date(Date.now() + 90_000_000).toISOString(),
            timezone: 'Asia/Hong_Kong', venue_name: 'V', city: 'HK', country: 'HK', latitude: 22.3, longitude: 114.2,
            status: 'published', organisation_id: DEFAULT_ORG, created_by: staff.id,
          })
          .select('id')
          .single();
        if (evErr || !ev) throw new Error(`event fixture: ${evErr?.message}`);
        eventId = ev.id as string;
        const { error: regErr } = await admin
          .from('registrations')
          .insert({ event_id: eventId, email: `sec03-${Date.now()}@rls-test.invalid`, full_name: 'SEC-03 probe', registration_code: `WK-S3${String(Date.now()).slice(-6)}` });
        if (regErr) throw new Error(`registration fixture: ${regErr.message}`);

        const del = await colleague.client.from('events').delete().eq('id', eventId).select('id');
        expect(del.error?.code, 'a colleague hard-deleting a published event must be 42501').toBe(PERMISSION_DENIED);
        const { data: still } = await admin.from('events').select('id').eq('id', eventId);
        expect(still).toHaveLength(1);
        const { data: regs } = await admin.from('registrations').select('id').eq('event_id', eventId);
        expect(regs).toHaveLength(1);
      } finally {
        if (eventId) {
          await mustDelete(admin.from('registrations').delete().eq('event_id', eventId), 'registrations fixture');
          await mustDelete(admin.from('events').delete().eq('id', eventId), 'events fixture');
        }
        await mustDelete(admin.from('staff').delete().eq('email', colleague.email), 'staff fixture');
        await deleteTestUser(colleague);
      }
    }, 60_000);
  });

  // DB-05 (20261025100000): registrations were the last audited-mutation table an organisation member could rewrite
  // directly (status, check_in_at, name, email, code). The roster edit is update_registration_contact; check-in is
  // mark_attended / self_check_in. The behavioural matrix is registration_contact_edit.rls.test.ts.
  describe('registrations — no API role UPDATEs or DELETEs a row (DB-05)', () => {
    it('anon and authenticated hold no UPDATE (table or column) and no DELETE on registrations; service_role keeps both', async () => {
      const [row] = await sqlSuperuserQuery<{ anon: boolean; auth: boolean; svc: boolean }>(
        `select has_any_column_privilege('anon', 'public.registrations', 'UPDATE') or has_table_privilege('anon', 'public.registrations', 'DELETE') as anon,
                has_any_column_privilege('authenticated', 'public.registrations', 'UPDATE') or has_table_privilege('authenticated', 'public.registrations', 'DELETE') as auth,
                has_table_privilege('service_role', 'public.registrations', 'UPDATE') and has_table_privilege('service_role', 'public.registrations', 'DELETE') as svc`,
      );
      expect(row.anon, 'anon holds UPDATE or DELETE on registrations | Fix in a NEW migration: revoke update, delete on public.registrations from anon, authenticated').toBe(false);
      expect(row.auth, 'authenticated holds UPDATE or DELETE on registrations | Fix in a NEW migration: revoke update, delete on public.registrations from anon, authenticated').toBe(false);
      expect(row.svc, 'service_role must keep UPDATE (cancel, claim, scripts, teardown)').toBe(true);
    }, 30_000);
  });
});
