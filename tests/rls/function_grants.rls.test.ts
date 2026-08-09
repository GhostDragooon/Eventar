// CPD Milestone A / Task 10 — residual function-grant hygiene, verified via
// PostgREST behaviour against the live dev project.
//
//  - pseudonymise_user: was executable by a bare PUBLIC grant + anon (advisor
//    0028). The in-function staff gate already denied non-staff, but exposing
//    the RPC to anon is a footgun. Now authenticated-only → an anon caller is
//    refused at the GRANT level ("permission denied for function"), before the
//    gate is even reached.
//  - self_check_in: was anon-open, now service_role-only (security review
//    2026-08-06, migration 20260806000100). Its guessing-path rate limit keys
//    on a CALLER-supplied p_ip, so a direct anon RPC could rotate p_ip to defeat
//    it. The only real caller is the Server Action, which uses the service_role
//    admin client. An anon caller is now refused at the GRANT level.
//  - require_active_staff: an app_private helper, never part of the exposed
//    API. A PostgREST rpc call resolves to nothing (PGRST202).
//
// Gated: only runs under `pnpm test:rls` (RLS_TESTS=1).
import { describe, it, expect } from 'vitest';
import { createAnonClient } from '../helpers/clients';

describe.skipIf(!process.env.RLS_TESTS)('residual function-grant hygiene', () => {
  const anon = createAnonClient();

  it('anon is refused pseudonymise_user at the grant level (permission denied)', async () => {
    const { error } = await anon.rpc('pseudonymise_user', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_reason: 'grant-probe',
    });
    expect(error).not.toBeNull();
    // Grant-level denial, not the in-function gate's raise: proves the anon
    // EXECUTE grant is gone (before the migration, anon reached the gate).
    expect(error?.message).toMatch(/permission denied for function/i);
  });

  it('anon is refused self_check_in at the grant level (service_role-only since 2026-08-06)', async () => {
    const { error } = await anon.rpc('self_check_in', {
      p_code: 'DEFINITELY-NOT-A-REAL-CODE',
      p_ip: '203.0.113.99',
    });
    // Grant-level denial before the function body: the caller-supplied p_ip
    // guessing bypass is unreachable from anon now. Dedicated coverage (anon +
    // authenticated + service_role) lives in self_check_in_grant.rls.test.ts.
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied for function/i);
  });

  it('require_active_staff is not part of the exposed PostgREST API (PGRST202)', async () => {
    const { error } = await anon.rpc('require_active_staff', { p_roles: ['eventar_staff'] });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('PGRST202');
  });
});
