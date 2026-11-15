// H1 SQL layer (security audit 2026-11-04, kernel K1, Ivan's sign-off 2026-11-07): staff identity in SQL is the
// JWT email claim matched to public.staff.email. app_private.auth_email() is the one function every staff gate and
// staff RLS policy reads, so it must only return an address whose auth account is confirmed. Without that, anyone
// who signs up with a provisioned staff email while hosted Confirm email is off gets that staff row's powers.
//
// One transaction that is always rolled back: nothing leaks. Refusals are SQLSTATE 42501 (the staff gate's own refusal, not a grant revoke).
// Gated on RLS_TESTS; local stack only.
import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import '../helpers/clients'; // module-load guard: refuses a non-local stack

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

type Who = { email: string; uid: string };

async function probe<T>(fn: (c: Client, w: { ok: Who; unconfirmed: Who }) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: LOCAL_DB });
  await c.connect();
  try {
    await c.query('begin');
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const mk = async (label: string, confirmed: boolean): Promise<Who> => {
      const email = `zz-h1-${label}-${tag}@example.test`;
      const { rows } = await c.query(
        `insert into auth.users (id, email, email_confirmed_at, aud, role, instance_id)
         values (gen_random_uuid(), $1, ${confirmed ? 'now()' : 'null'}, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')
         returning id`,
        [email],
      );
      await c.query(
        `insert into public.staff (email, full_name, role, status, organisation_id)
         values ($1, 'H1 probe', 'organiser_admin', 'active', '00000000-0000-0000-0000-000000000001')`,
        [email],
      );
      return { email, uid: rows[0].id as string };
    };
    const ok = await mk('ok', true);
    const unconfirmed = await mk('unconf', false);
    return await fn(c, { ok, unconfirmed });
  } finally {
    await c.query('rollback');
    await c.end();
  }
}

// `switchRole: false` keeps the superuser connection (the gate function is not executable by authenticated any more;
// it is reached through definer RPCs) while the JWT claims still say who the caller is.
async function asAuthenticated(c: Client, w: Who, switchRole = true): Promise<void> {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ role: 'authenticated', email: w.email, sub: w.uid }),
  ]);
  if (switchRole) await c.query('set local role authenticated');
}

describe.skipIf(!process.env.RLS_TESTS)('app_private.auth_email requires a confirmed auth account (H1, SQL layer)', () => {
  it('a confirmed staff account resolves; the same staff row behind an unconfirmed account does not', async () => {
    await probe(async (c, w) => {
      await asAuthenticated(c, w.ok);
      expect((await c.query('select app_private.auth_email() as e')).rows[0].e).toBe(w.ok.email);
      expect((await c.query('select count(*)::int as n from public.staff where email = $1', [w.ok.email])).rows[0].n).toBe(1);
      await c.query('reset role');

      await asAuthenticated(c, w.unconfirmed);
      expect((await c.query('select app_private.auth_email() as e')).rows[0].e, 'unconfirmed must resolve to empty').toBe('');
      expect((await c.query('select count(*)::int as n from public.staff where email = $1', [w.unconfirmed.email])).rows[0].n, 'staff self-read').toBe(0);
    });
  });

  it('a staff gate (require_active_staff) refuses the unconfirmed account with 42501 and admits the confirmed one', async () => {
    await probe(async (c, w) => {
      await asAuthenticated(c, w.ok, false);
      const row = await c.query(`select (app_private.require_active_staff('organiser_admin')).email as e`);
      expect(row.rows[0].e).toBe(w.ok.email);

      await asAuthenticated(c, w.unconfirmed, false);
      await c.query('savepoint s');
      await expect(c.query(`select app_private.require_active_staff('organiser_admin')`)).rejects.toMatchObject({ code: '42501' });
      await c.query('rollback to savepoint s');
    });
  });

  it('a token whose sub is not the account that owns the claimed email does not resolve', async () => {
    await probe(async (c, w) => {
      await asAuthenticated(c, { email: w.ok.email, uid: w.unconfirmed.uid });
      expect((await c.query('select app_private.auth_email() as e')).rows[0].e).toBe('');
    });
  });

  it('an email claim with no auth account behind it does not resolve', async () => {
    await probe(async (c) => {
      await asAuthenticated(c, { email: 'zz-h1-ghost@example.test', uid: '00000000-0000-0000-0000-0000000000aa' });
      expect((await c.query('select app_private.auth_email() as e')).rows[0].e).toBe('');
    });
  });
});
