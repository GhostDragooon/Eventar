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
});
