// Task 2 (service_role systemic guard) — the standing negative test for the
// audited-mutation write posture. Asserts the intended direct-write matrix on
// the three tables whose sole write path is a SECURITY DEFINER function:
//
//   credit_ledger, audit_events   — PERMANENT append-only: no role may
//                                    INSERT/UPDATE/DELETE, including service_role.
//   practitioner_licences         — LIFECYCLE: definer-only INSERT/UPDATE (denied
//                                    to all roles incl service_role), but
//                                    service_role DELETE is deliberately RETAINED
//                                    for cleanup/erasure (see 20260709320000).
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
        .insert({
          organisation_id: DEFAULT_ORG,
          short_name: `GUARD-${Date.now()}`,
          full_name: 'Write-guard test body',
          cycle_config: {},
          category_taxonomy: {},
        })
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
});
