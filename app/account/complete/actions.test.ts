// WP5 (N1 + N3) for the completion wizard's consent step: acceptRequiredConsents
// keeps its own copy of the authenticated-self helper (app/account/complete/
// actions.ts), so the practitioner guard in ../actions.ts does not reach it.
// Same contract: a staff session is refused before any consent row is written,
// an 'unknown' staff state fails closed, and an ordinary practitioner proceeds.
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { s } = vi.hoisted(() => ({
  s: {
    user: null as { id: string; email: string } | null,
    staffRow: null as { id: string; email: string; status: string } | null,
    staffError: null as { code: string; message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rateLimit', () => ({
  rateLimitBySession: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}));

// Applies each .eq() predicate to the fixture row (same trick as lib/auth.test.ts).
function staffChain(row: typeof s.staffRow): Record<string, unknown> {
  return {
    eq: (field: string, value: unknown) =>
      staffChain(row && (row as Record<string, unknown>)[field] === value ? row : null),
    maybeSingle: async () => ({
      data: s.staffError || !row ? null : { id: row.id },
      error: s.staffError,
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: s.user }, error: null }) },
    from: (table: string) => {
      if (table !== 'staff') throw new Error(`unexpected table: ${table}`);
      return { select: () => staffChain(s.staffRow) };
    },
    rpc: async (fn: string, args: unknown) => {
      s.rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
  })),
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptRequiredConsents } from './actions';

const EMAIL = 'someone@example.com';

beforeEach(() => {
  s.user = { id: 'user-1', email: EMAIL };
  s.staffRow = null;
  s.staffError = null;
  s.rpcCalls = [];
  // lib/auth consults review mode; pin it off so an exported
  // EVENTAR_REVIEW_MODE=true can't route this into the cookie-reading bypass.
  vi.stubEnv('EVENTAR_REVIEW_MODE', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('acceptRequiredConsents — practitioner guard (N1 + N3)', () => {
  it('refuses a staff session with not_authorized and records no consent', async () => {
    s.staffRow = { id: 'staff-1', email: EMAIL, status: 'active' };

    expect(await acceptRequiredConsents()).toEqual({ ok: false, error: 'not_authorized' });
    expect(s.rpcCalls).toEqual([]);
  });

  it("fails closed on an 'unknown' staff state: db_error, no consent recorded", async () => {
    s.staffError = { code: '57014', message: 'canceling statement due to statement timeout' };

    expect(await acceptRequiredConsents()).toEqual({ ok: false, error: 'db_error' });
    expect(s.rpcCalls).toEqual([]);
  });

  it('positive control: a non-staff practitioner grants both required consents', async () => {
    expect(await acceptRequiredConsents()).toEqual({ ok: true, data: { accepted: true } });
    expect(s.rpcCalls.map((c) => c.fn)).toEqual(['grant_consent', 'grant_consent']);
    expect(s.rpcCalls.map((c) => (c.args as { p_consent_type: string }).p_consent_type)).toEqual([
      'terms_of_service',
      'privacy_policy',
    ]);
  });
});
