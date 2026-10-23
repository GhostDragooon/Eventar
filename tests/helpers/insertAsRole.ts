// One INSERT as an API role with the privilege granted back for the duration of the statement.
//
// SEC-01 (20261023140000, 20261023150000) took INSERT on public.registrations away from anon and authenticated.
// The policy and the triggers on that table are defence in depth now: unreachable over PostgREST, but they must
// still hold if a grant is ever restored. This helper reaches them anyway: it connects as postgres, grants INSERT
// back inside a transaction that is ALWAYS rolled back (so no other session ever sees the grant, and no row
// lands), SETs LOCAL ROLE to the API role, and runs one INSERT. current_user is then the API role, which is what
// the triggers key on. Local stack only: the connection string is the fixed local one.
import { Client } from 'pg';
import './clients'; // module-load guard: refuses a non-local stack

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export type InsertOutcome = { ok: true } | { ok: false; code?: string; message: string };

export async function insertAsRoleWithGrant(
  role: 'anon' | 'authenticated',
  table: string,
  row: Record<string, unknown>,
): Promise<InsertOutcome> {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`insertAsRoleWithGrant: bad table name ${table}`);
  const cols = Object.keys(row);
  if (cols.some((c) => !/^[a-z_]+$/.test(c))) throw new Error('insertAsRoleWithGrant: bad column name');
  const c = new Client({ connectionString: LOCAL_DB });
  await c.connect();
  try {
    await c.query('begin');
    await c.query(`grant insert on public.${table} to ${role}`);
    await c.query(`set local role ${role}`);
    try {
      await c.query(
        `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        cols.map((k) => row[k]),
      );
      return { ok: true };
    } catch (e) {
      const err = e as { code?: string; message: string };
      return { ok: false, code: err.code, message: err.message };
    }
  } finally {
    await c.query('rollback');
    await c.end();
  }
}
