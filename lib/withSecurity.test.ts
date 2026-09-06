import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { NotAuthorizedError, type Staff } from './auth';

// Mocks for withSecurity's collaborators. Each is a vi.fn() so individual
// tests can set its resolved/return value per-case via mockResolvedValueOnce
// / mockReturnValueOnce.
const { mockRequireStaff, mockRateLimitBySession, mockSupabaseServer, mockGetSession, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockRequireStaff: vi.fn(),
    mockRateLimitBySession: vi.fn(),
    mockSupabaseServer: vi.fn(),
    mockGetSession: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }));

vi.mock('./auth', async () => {
  const actual = await vi.importActual<typeof import('./auth')>('./auth');
  return {
    ...actual,
    requireStaff: mockRequireStaff,
  };
});
vi.mock('./rateLimit', () => ({
  rateLimitBySession: mockRateLimitBySession,
}));
vi.mock('./supabase/server', () => ({
  supabaseServer: mockSupabaseServer,
}));
vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

import { withSecurity, RLS_SILENT_FAIL, type SecurityCtx } from './withSecurity';

const FAKE_STAFF: Staff = { id: 's-1', email: 'a@b.com', role: 'organiser_member', full_name: 'Alex Bee', organisation_id: 'org-1' };

function mockSupabaseClient() {
  return {
    auth: { getSession: mockGetSession },
  } as any;
}

const RATE_LIMIT_OPTS = { scope: 'testScope', windowMs: 60_000, max: 5 };
const testSchema = z.object({ name: z.string() });

describe('withSecurity', () => {
  it('rejects unauthenticated callers before running the handler', async () => {
    mockRequireStaff.mockReset().mockRejectedValueOnce(new NotAuthorizedError('no session'));
    const handler = vi.fn();
    const action = withSecurity(handler, {
      input: testSchema,
      rateLimit: RATE_LIMIT_OPTS,
    });

    const result = await action({ name: 'ok' });

    expect(result).toEqual({ ok: false, error: 'not_authorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects when rate-limited, without running the handler', async () => {
    mockRequireStaff.mockReset().mockResolvedValueOnce(FAKE_STAFF);
    mockSupabaseServer.mockReset().mockResolvedValueOnce(mockSupabaseClient());
    mockGetSession.mockReset().mockResolvedValueOnce({ data: { session: { access_token: 'tok-1' } } });
    mockRateLimitBySession.mockReset().mockResolvedValueOnce({ allowed: false, retryAfterMs: 4242 });
    const handler = vi.fn();
    const action = withSecurity(handler, {
      input: testSchema,
      rateLimit: RATE_LIMIT_OPTS,
    });

    const result = await action({ name: 'ok' });

    expect(result).toEqual({ ok: false, error: 'rate_limited', retryAfterMs: 4242 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid input via the Zod schema', async () => {
    mockRequireStaff.mockReset().mockResolvedValueOnce(FAKE_STAFF);
    mockSupabaseServer.mockReset().mockResolvedValueOnce(mockSupabaseClient());
    mockGetSession.mockReset().mockResolvedValueOnce({ data: { session: { access_token: 'tok-1' } } });
    mockRateLimitBySession.mockReset().mockResolvedValueOnce({ allowed: true, remaining: 4, resetAt: new Date() });
    const handler = vi.fn();
    const action = withSecurity(handler, {
      input: testSchema,
      rateLimit: RATE_LIMIT_OPTS,
    });

    const result = await action({ name: 123 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_input');
      expect(result.issues).toBeDefined();
      expect(result.issues!.length).toBeGreaterThan(0);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler with server-derived actor + revalidates on success', async () => {
    mockRequireStaff.mockReset().mockResolvedValueOnce(FAKE_STAFF);
    const supabaseClient = mockSupabaseClient();
    mockSupabaseServer.mockReset().mockResolvedValueOnce(supabaseClient);
    mockGetSession.mockReset().mockResolvedValueOnce({ data: { session: { access_token: 'tok-1' } } });
    mockRateLimitBySession.mockReset().mockResolvedValueOnce({ allowed: true, remaining: 4, resetAt: new Date() });
    mockRevalidatePath.mockReset();
    const handler = vi.fn<(input: { name: string }, ctx: SecurityCtx) => Promise<{ id: string }>>(
      async () => ({ id: 'created-1' }),
    );
    const action = withSecurity(handler, {
      input: testSchema,
      rateLimit: RATE_LIMIT_OPTS,
      revalidate: ['/dashboard', '/events/1'],
    });

    const result = await action({ name: 'ok' });

    expect(handler).toHaveBeenCalledTimes(1);
    const [parsedInput, ctx] = handler.mock.calls[0]!;
    expect(parsedInput).toEqual({ name: 'ok' });
    expect(ctx.staff).toBe(FAKE_STAFF);
    expect(ctx.supabase).toBe(supabaseClient);

    // Security review 2026-08-06: the rate-limit key must be the staff id (a
    // UUID), never the access token. The token is a bearer credential + PII and
    // this key is persisted to rate_limits.key and logged on limiter error.
    expect(mockRateLimitBySession).toHaveBeenCalledWith('testScope', FAKE_STAFF.id, {
      windowMs: 60_000,
      max: 5,
    });

    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/events/1');

    expect(result).toEqual({ ok: true, data: { id: 'created-1' } });
  });

  it('surfaces an RLS-silent-fail from the handler as a typed error (Q18)', async () => {
    mockRequireStaff.mockReset().mockResolvedValueOnce(FAKE_STAFF);
    mockSupabaseServer.mockReset().mockResolvedValueOnce(mockSupabaseClient());
    mockGetSession.mockReset().mockResolvedValueOnce({ data: { session: { access_token: 'tok-1' } } });
    mockRateLimitBySession.mockReset().mockResolvedValueOnce({ allowed: true, remaining: 4, resetAt: new Date() });
    mockRevalidatePath.mockReset();
    const handler = vi.fn(async () => RLS_SILENT_FAIL);
    const action = withSecurity(handler, {
      input: testSchema,
      rateLimit: RATE_LIMIT_OPTS,
      revalidate: ['/dashboard'],
    });

    const result = await action({ name: 'ok' });

    expect(result).toEqual({ ok: false, error: 'not_found_or_forbidden' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
