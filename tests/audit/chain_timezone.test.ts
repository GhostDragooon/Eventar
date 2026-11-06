// Hash-chain verification must not depend on the session's TimeZone,
// DateStyle or bytea_output. The audit and evidence hashes cast timestamps
// (and, for evidence, a bytea prev_hash) to text, so before
// 20261106100000_pin_chain_hash_session_settings.sql a row written or
// verified from a non-UTC session failed content verification. Measured
// 2026-11-05: under Asia/Hong_Kong, every local audit and evidence row and
// all 38,081 Seoul audit rows read as tampered. The credit ledger was
// already pinned and passed.
//
// Everything below runs inside one transaction that is rolled back, so no
// permanent audit_events / participation_evidence row is left behind.
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1), in its serial stage:
// the transaction holds both chain locks across full-chain verify scans.
import { describe, it, expect } from 'vitest';
import { Client as PgClient } from 'pg';
import { sqlSuperuserQuery } from '../helpers/clients';

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PINNED = ['TimeZone=UTC', 'DateStyle=ISO, MDY', 'bytea_output=hex'];
const CHAIN_FUNCTIONS = [
  'compute_audit_hash',
  'verify_audit_chain',
  'compute_evidence_hash',
  'verify_evidence_chain',
  'compute_credit_ledger_hash',
  'verify_ledger_chain',
];

describe.skipIf(!process.env.RLS_TESTS)('hash chains ignore session settings', () => {
  // A later `create or replace function` without the SET clauses silently
  // drops them, so this catalog check guards every future redefinition.
  it('pins TimeZone, DateStyle and bytea_output on every hash and verify function', async () => {
    const rows = await sqlSuperuserQuery<{ proname: string; proconfig: string[] | null }>(
      `select proname, proconfig from pg_proc
        where pronamespace = 'public'::regnamespace and proname = any($1)`,
      [CHAIN_FUNCTIONS],
    );
    expect(rows.map((r) => r.proname).sort()).toEqual([...CHAIN_FUNCTIONS].sort());
    for (const r of rows) {
      for (const setting of PINNED) {
        expect(r.proconfig ?? [], `${r.proname} missing ${setting}`).toContain(setting);
      }
      // Five of the six are SECURITY DEFINER: losing search_path is worse
      // than losing the time zone.
      expect(
        (r.proconfig ?? []).some((s) => s.startsWith('search_path=')),
        `${r.proname} lost search_path`,
      ).toBe(true);
    }
  });

  it('a row hashed in a Hong Kong session verifies in UTC and Hong Kong sessions', async () => {
    const c = new PgClient({ connectionString: LOCAL_DB });
    await c.connect();
    try {
      await c.query('begin');
      // Deliberately hostile session: non-UTC zone, non-ISO DateStyle,
      // escape-format bytea text.
      await c.query(`set local timezone = 'Asia/Hong_Kong'`);
      await c.query(`set local datestyle = 'SQL, DMY'`);
      await c.query(`set local bytea_output = 'escape'`);

      const staff = await c.query<{ id: string }>(
        `insert into public.staff (email, role, full_name, organisation_id, status)
         values ('chain-tz-${Date.now()}@rls-test.invalid', 'organiser_admin', 'Chain TZ Test',
                 '00000000-0000-0000-0000-000000000001', 'active')
         returning id`,
      );
      const event = await c.query<{ id: string; organisation_id: string }>(
        `insert into public.events (title, start_time, end_time, timezone, created_by,
                                    venue_name, city, country, latitude, longitude)
         values ('ZZ- chain timezone test', now() + interval '1 day', now() + interval '1 day 2 hours',
                 'Asia/Hong_Kong', $1, 'Test venue', 'Hong Kong', 'HK', 22.3, 114.2)
         returning id, organisation_id`,
        [staff.rows[0].id],
      );
      // Two rows, so the second hashes a real (non-null) bytea prev_hash.
      let evidenceSeq = '';
      for (let i = 0; i < 2; i++) {
        const ev = await c.query<{ chain_seq: string }>(
          `insert into public.participation_evidence
             (organisation_id, event_id, evidence_type, capture_method, source,
              captured_at, attestation_strength)
           values ($1, $2, 'check_in', 'manual_entry', 'administrative', now(), 'standard')
           returning chain_seq`,
          [event.rows[0].organisation_id, event.rows[0].id],
        );
        evidenceSeq = ev.rows[0].chain_seq;
      }

      // Audit insert last: production check-in takes the evidence-chain lock
      // before the audit-chain lock, and the reverse order here could
      // deadlock a parallel check-in.
      const audit = await c.query<{ chain_seq: string }>(
        `insert into public.audit_events (event_type, payload)
         values ('chain_test_timezone', '{}'::jsonb) returning chain_seq`,
      );
      const auditSeq = audit.rows[0].chain_seq;

      const check = async () => {
        const a = await c.query<{ content_valid: boolean; link_valid: boolean }>(
          'select content_valid, link_valid from public.verify_audit_chain() where chain_seq = $1',
          [auditSeq],
        );
        const e = await c.query<{ content_valid: boolean; link_valid: boolean }>(
          'select content_valid, link_valid from public.verify_evidence_chain() where chain_seq = $1',
          [evidenceSeq],
        );
        return { audit: a.rows[0], evidence: e.rows[0] };
      };

      expect(await check()).toEqual({
        audit: { content_valid: true, link_valid: true },
        evidence: { content_valid: true, link_valid: true },
      });

      await c.query(`set local timezone = 'UTC'`);
      await c.query(`set local datestyle = 'ISO, MDY'`);
      await c.query(`set local bytea_output = 'hex'`);
      expect(await check()).toEqual({
        audit: { content_valid: true, link_valid: true },
        evidence: { content_valid: true, link_valid: true },
      });
    } finally {
      await c.query('rollback').catch(() => {});
      await c.end();
    }
  });
});
