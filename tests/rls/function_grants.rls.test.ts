// CPD Milestone A / Task 10 — residual function-grant hygiene, verified via
// PostgREST behaviour against the live dev project.
//
//  - pseudonymise_user: was executable by a bare PUBLIC grant + anon (advisor
//    0028). The in-function staff gate already denied non-staff, but exposing
//    the RPC to anon is a footgun. Now authenticated-only → an anon caller is
//    refused at the GRANT level ("permission denied for function"), before the
//    gate is even reached.
//  - self_check_in: intentionally anon-open (public check-in). An anon caller
//    with a bogus code reaches the function and gets a DOMAIN result
//    ('invalid'), not a permission error — proving execute is still granted.
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

  it('anon CAN still execute self_check_in — bogus code returns a domain result, not a permission error', async () => {
    const { data, error } = await anon.rpc('self_check_in', {
      p_code: 'DEFINITELY-NOT-A-REAL-CODE',
      p_ip: '203.0.113.99',
    });
    expect(error).toBeNull();
    const result = (data as { result: string }[])[0]?.result;
    // Either the code doesn't resolve ('invalid') or the guess limiter trips
    // ('rate_limited') — both prove execute reached the function body.
    expect(['invalid', 'rate_limited']).toContain(result);
  });

  it('require_active_staff is not part of the exposed PostgREST API (PGRST202)', async () => {
    const { error } = await anon.rpc('require_active_staff', { p_roles: ['eventar_staff'] });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('PGRST202');
  });
});
