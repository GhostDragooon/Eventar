// participation_evidence keeps a service_role DELETE grant (Hard Rule 11,
// lifecycle row) that only test teardown uses: no app code or DB function
// deletes evidence, and ADR-0003 says CPD history is not erasable. Before
// 20261106110000_audit_evidence_deletes_align_verifiers.sql a delete left a
// broken link in verify_evidence_chain with no trace of what was removed
// (19,767 local evidence_recorded audit rows pointed at missing rows on
// 2026-11-06). Every delete now writes an evidence_deleted audit row, so each
// break can be matched to the row that left it.
//
// The chain verifiers also get one grant shape: service_role only.
//
// The delete test runs in one rolled-back transaction, so nothing persists.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { Client as PgClient } from 'pg';
import { sqlSuperuserQuery } from '../helpers/clients';

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const VERIFIERS = ['verify_audit_chain', 'verify_evidence_chain', 'verify_ledger_chain'];

describe.skipIf(!process.env.RLS_TESTS)('evidence deletes are audited; verifiers are service_role only', () => {
  it('every chain verifier is executable by service_role only', async () => {
    const rows = await sqlSuperuserQuery<{ proname: string; rolname: string; can: boolean }>(
      `select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') can
         from pg_proc p cross join pg_roles r
        where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
          and r.rolname in ('anon', 'authenticated', 'service_role')
        order by 1, 2`,
      [VERIFIERS],
    );
    expect(rows).toEqual(
      VERIFIERS.flatMap((proname) => [
        { proname, rolname: 'anon', can: false },
        { proname, rolname: 'authenticated', can: false },
        { proname, rolname: 'service_role', can: true },
      ]),
    );
  });

  it('a service_role delete writes an evidence_deleted audit row with the row hash', async () => {
    const c = new PgClient({ connectionString: LOCAL_DB });
    await c.connect();
    try {
      await c.query('begin');
      const staff = await c.query<{ id: string }>(
        `insert into public.staff (email, role, full_name, organisation_id, status)
         values ('evidence-del-${Date.now()}@rls-test.invalid', 'organiser_admin', 'Evidence Delete Test',
                 '00000000-0000-0000-0000-000000000001', 'active')
         returning id`,
      );
      const event = await c.query<{ id: string; organisation_id: string }>(
        `insert into public.events (title, start_time, end_time, timezone, created_by,
                                    venue_name, city, country, latitude, longitude)
         values ('ZZ- evidence delete test', now() + interval '1 day', now() + interval '1 day 2 hours',
                 'Asia/Hong_Kong', $1, 'Test venue', 'Hong Kong', 'HK', 22.3, 114.2)
         returning id, organisation_id`,
        [staff.rows[0].id],
      );
      // Two rows, so the test pins one audit row per deleted row.
      const rows: { id: string; chain_seq: string; hash: string; prev_hash: string }[] = [];
      for (let i = 0; i < 2; i++) {
        const ev = await c.query<{ id: string; chain_seq: string; hash: string; prev_hash: string }>(
          `insert into public.participation_evidence
             (organisation_id, event_id, evidence_type, capture_method, source,
              captured_at, attestation_strength)
           values ($1, $2, 'check_in', 'manual_entry', 'administrative', now(), 'standard')
           returning id, chain_seq, encode(hash, 'hex') hash, encode(prev_hash, 'hex') prev_hash`,
          [event.rows[0].organisation_id, event.rows[0].id],
        );
        rows.push(ev.rows[0]);
      }
      const ids = rows.map((r) => r.id);

      // The real teardown path: PostgREST as service_role, one statement.
      await c.query(`set local role service_role`);
      await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      const del = await c.query('delete from public.participation_evidence where id = any($1)', [ids]);
      expect(del.rowCount).toBe(2);
      await c.query('reset role');

      const audit = await c.query<{
        subject_id: string;
        organisation_id: string;
        subject_type: string;
        payload: Record<string, unknown>;
        recomputed: string;
      }>(
        // Recompute the deleted row's hash from the payload alone, with the
        // same input order as compute_evidence_hash.
        `select subject_id, organisation_id, subject_type, payload,
                encode(extensions.digest(
                  subject_id::text || (payload->>'evidence_type') || (payload->>'event_id')
                  || coalesce(payload->>'registration_id', '') || coalesce(payload->>'occurrence_id', '')
                  || (payload->>'capture_method') || (payload->>'source')
                  || (payload->>'captured_at') || (payload->>'attestation_strength')
                  || ('\\x' || (payload->>'prev_hash')) || (payload->>'created_at'),
                  'sha256'), 'hex') recomputed
           from public.audit_events
          where event_type = 'evidence_deleted' and subject_id = any($1)
          order by (payload->>'chain_seq')::bigint`,
        [ids],
      );
      expect(audit.rows).toHaveLength(2);
      audit.rows.forEach((a, i) => {
        expect(a.subject_id).toBe(rows[i].id);
        expect(a.organisation_id).toBe(event.rows[0].organisation_id);
        expect(a.subject_type).toBe('participation_evidence');
        expect(a.payload).toMatchObject({
          chain_seq: Number(rows[i].chain_seq),
          hash: rows[i].hash,
          prev_hash: rows[i].prev_hash,
          event_id: event.rows[0].id,
          evidence_type: 'check_in',
          deleted_by_role: 'service_role',
        });
        expect(a.recomputed).toBe(rows[i].hash);
      });
      // The second row chained to the first, so the payloads link too.
      expect(audit.rows[1].payload.prev_hash).toBe(audit.rows[0].payload.hash);
    } finally {
      await c.query('rollback').catch(() => {});
      await c.end();
    }
  });
});
