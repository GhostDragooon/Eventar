// DB-01 (MVP plan, B7): local seed must not widen what the migrations narrowed.
//
// supabase/seed.sql opens with a blanket `grant select, insert, update, delete
// on all tables` (CLI 2.109 workaround, local only) and then re-asserts each
// migration's revokes by hand. A table missing from that list silently holds
// MORE privilege locally than on hosted, so local RLS runs prove less than
// they claim. Found 2026-10-11: invite_tokens, credit_disputes, professions.
//
// This test runs the REAL seed.sql inside a transaction that is always rolled
// back, then reads has_table_privilege for the tables below and compares with
// the posture their migrations leave on hosted (which never runs the seed).
// Hermetic: it does not depend on how the local DB was last reset, and leaves
// no trace. Control: it first strips anon SELECT on events, which only the
// seed's blanket grant restores, so a seed that silently did nothing fails here
// instead of passing vacuously.
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import '../helpers/clients'; // module-load guard: refuses a non-local stack

type Priv = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
const ALL: Priv[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const NONE: Priv[] = [];
type Posture = { anon: Priv[]; authenticated: Priv[]; service_role: Priv[] };

// Controlled lists: 20260916000000 revokes all, grants SELECT to anon+authenticated,
// ALL to service_role.
const LOOKUP: Posture = { anon: ['SELECT'], authenticated: ['SELECT'], service_role: ALL };

// Expected hosted posture (default privileges grant the API roles DML; migrations narrow it).
// anon on invite_tokens: 20260911000000 revokes I/U/D from anon+authenticated; SELECT stays. service_role keeps
// SELECT and DELETE only: SEC-01 (20261023140000) revoked its INSERT and UPDATE (definer-only table).
const EXPECTED: Record<string, Posture> = {
  invite_tokens: { anon: ['SELECT'], authenticated: ['SELECT'], service_role: ['SELECT', 'DELETE'] }, // 20260911000000 + SEC-01 20261023140000
  credit_disputes: { anon: NONE, authenticated: ['SELECT', 'INSERT'], service_role: ALL }, // 20260804040000
  // anon: SELECT only (RLS returns it nothing); authenticated lost INSERT in SEC-01 part 2 (20261023150000) and UPDATE in
  // DB-05 (20261025100000), which took DELETE with it.
  registrations: { anon: ['SELECT'], authenticated: ['SELECT'], service_role: ALL },
  professions: LOOKUP,
  positions: LOOKUP,
  degrees: LOOKUP,
  specialties: LOOKUP,
  societies: LOOKUP,
  professional_profiles: { anon: NONE, authenticated: ['SELECT', 'INSERT', 'UPDATE'], service_role: ALL }, // 20260829090000 + 20260829130000
  additional_appointments: { anon: NONE, authenticated: ALL, service_role: ALL }, // 20260916040000
  society_memberships: { anon: NONE, authenticated: ALL, service_role: ALL }, // 20260916040000
};

describe.skipIf(!process.env.RLS_TESTS)('seed.sql grant posture matches the migrations (DB-01)', () => {
  it('after the real seed, no table in the matrix holds more or less than its migration leaves', async () => {
    const seed = readFileSync(resolve(process.cwd(), 'supabase/seed.sql'), 'utf8');
    const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    await c.connect();
    const diffs: string[] = [];
    try {
      await c.query('begin');
      await c.query('revoke select on public.events from anon'); // control, restored only by the seed
      await c.query(seed);

      const control = await c.query(`select has_table_privilege('anon','public.events','SELECT') as held`);
      expect(control.rows[0].held, 'seed did not execute: its blanket grant did not run').toBe(true);

      for (const [table, posture] of Object.entries(EXPECTED)) {
        for (const [role, want] of Object.entries(posture)) {
          const r = await c.query(
            `select p as priv, has_table_privilege($1, 'public.' || $2, p) as held
               from unnest($3::text[]) p`,
            [role, table, ALL],
          );
          const held = r.rows.filter((x) => x.held).map((x) => x.priv as Priv);
          const extra = held.filter((p) => !want.includes(p));
          const missing = want.filter((p) => !held.includes(p));
          if (extra.length) diffs.push(`${table}: ${role} holds extra ${extra.join(',')}`);
          if (missing.length) diffs.push(`${table}: ${role} lacks ${missing.join(',')}`);
        }
      }
      // SEC-01 (20261023140000): after the real seed, anon holds no INSERT, UPDATE or DELETE on ANY table or view in
      // public (table or column level). The seed's blanket grant hands it back, so seed.sql re-revokes in one
      // statement; a new table cannot be forgotten.
      const anon = await c.query(
        `select c.relname || ' (' || p.priv || ')' as held
           from pg_class c
           join pg_namespace ns on ns.oid = c.relnamespace
           cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
          where ns.nspname = 'public' and c.relkind in ('r', 'p', 'f', 'v', 'm')
            and case when p.priv = 'DELETE' then has_table_privilege('anon', c.oid, p.priv)
                     else has_any_column_privilege('anon', c.oid, p.priv) end
          order by 1`,
      );
      for (const row of anon.rows) diffs.push(`anon holds ${row.held} after the seed`);

      // SEC-02 (20261023160000): the seed's events column grant must not hand identity columns back.
      const idCols = await c.query(
        `select col from unnest(array['id','created_by','created_at','updated_at','deleted_at']) col
          where has_column_privilege('authenticated', 'public.events', col, 'UPDATE')`,
      );
      for (const row of idCols.rows) diffs.push(`authenticated holds UPDATE on events.${row.col} after the seed`);
    } finally {
      await c.query('rollback');
      await c.end();
    }
    expect(diffs).toEqual([]);
  });
});
