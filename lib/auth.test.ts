import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// Partial mock: keep isReviewMode/hasRealAuthCookie real (that's the branch
// under test in the describe block below), stub only resolveReviewStaff so
// the bypass path doesn't need a real admin client.
const { resolveReviewStaff } = vi.hoisted(() => ({ resolveReviewStaff: vi.fn() }));
vi.mock('./reviewMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./reviewMode')>()),
  resolveReviewStaff,
}));

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => 'admin-client-marker' }));

import { afterEach, describe, expect, it } from 'vitest';
import { requireStaff, NotAuthorizedError } from './auth';

// Fabricate a minimal supabase client shape that requireStaff depends on.
// The fake chain actually APPLIES each .eq(field, value) predicate against
// the fixture row (nulling it out on a mismatch), so a regression that
// removes a .eq(...) call from requireStaff is caught here rather than
// silently passing regardless of the filter.
function mockClient({ user, staffRow }: {
  user: { email: string } | null;
  staffRow: { id: string; email: string; role: 'organizer' | 'manager'; full_name: string | null; status: string } | null;
}) {
  function makeChain(row: typeof staffRow) {
    return {
      eq: (field: string, value: unknown) => {
        if (row && (row as Record<string, unknown>)[field] !== value) {
          return makeChain(null);
        }
        return makeChain(row);
      },
      // requireStaff only selects id/email/role/full_name — project down to
      // that shape so `status` (filter-only) never leaks into the returned
      // Staff object, matching real Postgres SELECT-column behavior.
      maybeSingle: async () => ({
        data: row ? { id: row.id, email: row.email, role: row.role, full_name: row.full_name } : null,
        error: null,
      }),
    };
  }
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({ select: () => makeChain(staffRow) }),
  } as any;
}

describe('requireStaff', () => {
  it('returns staff record when user is logged in and listed in staff', async () => {
    const c = mockClient({
      user: { email: 'a@b.com' },
      staffRow: { id: 's-1', email: 'a@b.com', role: 'organizer', full_name: 'Alex Bee', status: 'active' },
    });
    const staff = await requireStaff(c);
    expect(staff).toEqual({ id: 's-1', email: 'a@b.com', role: 'organizer', full_name: 'Alex Bee' });
  });

  it('throws NotAuthorizedError when no session', async () => {
    const c = mockClient({ user: null, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('throws NotAuthorizedError when user is logged in but not in staff', async () => {
    const c = mockClient({ user: { email: 'unknown@x.com' }, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('returns staff record when the active staff row matches (role type unchanged)', async () => {
    const c = mockClient({
      user: { email: 'active@x.com' },
      staffRow: { id: 's-2', email: 'active@x.com', role: 'manager', full_name: 'Active Person', status: 'active' },
    });
    const staff = await requireStaff(c);
    expect(staff).toEqual({ id: 's-2', email: 'active@x.com', role: 'manager', full_name: 'Active Person' });
  });

  it('throws NotAuthorizedError when staff row exists but is suspended/non-active', async () => {
    const c = mockClient({
      user: { email: 'suspended@x.com' },
      staffRow: { id: 's-3', email: 'suspended@x.com', role: 'organizer', full_name: 'Suspended Person', status: 'suspended' },
    });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});

// Regression for the bug found 2026-09-16: requireStaff()'s review-mode
// bypass used to borrow an identity UNCONDITIONALLY, while supabaseServer()
// only did so with no real session cookie — so a request with a genuine
// staff session got a borrowed identity here but a real, different identity
// from whatever supabaseServer()-backed client it went on to use, and a
// SECURITY DEFINER RPC resolving its actor via auth.email() trusted the real
// one over the borrowed one requireStaff() had just returned. An event ended
// up silently attributed to the wrong organisation. Both functions now share
// one condition (lib/reviewMode.ts's isRealAuthCookiePresent); this asserts
// requireStaff() actually respects it end to end, not just that the shared
// predicate itself is correct (reviewMode.test.ts covers that in isolation).
describe('requireStaff — review mode only borrows when there is no real session', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resolveReviewStaff.mockReset();
    cookiesMock.mockReset();
  });

  it('borrows the review identity when review mode is on and no real auth cookie exists', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVENTAR_REVIEW_MODE', 'true');
    cookiesMock.mockResolvedValue({ getAll: () => [{ name: 'theme', value: 'dark' }] });
    resolveReviewStaff.mockResolvedValue({
      id: 'borrowed-1',
      email: 'borrowed@localhost.invalid',
      role: 'eventar_staff',
      full_name: 'Review Mode',
      organisation_id: null,
    });

    const staff = await requireStaff(mockClient({ user: null, staffRow: null }));

    expect(staff.id).toBe('borrowed-1');
    expect(resolveReviewStaff).toHaveBeenCalledWith('admin-client-marker');
  });

  it('falls through to the REAL staff lookup when review mode is on but a real auth cookie exists', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVENTAR_REVIEW_MODE', 'true');
    cookiesMock.mockResolvedValue({ getAll: () => [{ name: 'sb-project-auth-token', value: 'jwt...' }] });
    const c = mockClient({
      user: { email: 'real.organiser@x.com' },
      staffRow: { id: 'real-staff-1', email: 'real.organiser@x.com', role: 'organizer', full_name: 'Real Organiser', status: 'active' },
    });

    const staff = await requireStaff(c);

    expect(staff).toEqual({ id: 'real-staff-1', email: 'real.organiser@x.com', role: 'organizer', full_name: 'Real Organiser' });
    expect(resolveReviewStaff).not.toHaveBeenCalled();
  });

  it('with a real cookie present, still rejects a real session that is genuinely not staff (no silent borrow)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVENTAR_REVIEW_MODE', 'true');
    cookiesMock.mockResolvedValue({ getAll: () => [{ name: 'sb-project-auth-token', value: 'jwt...' }] });
    const c = mockClient({ user: { email: 'not.staff@x.com' }, staffRow: null });

    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
    expect(resolveReviewStaff).not.toHaveBeenCalled();
  });
});
