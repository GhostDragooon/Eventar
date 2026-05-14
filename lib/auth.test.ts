import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
import { requireStaff, NotAuthorizedError } from './auth';

// Fabricate a minimal supabase client shape that requireStaff depends on.
function mockClient({ user, staffRow }: {
  user: { email: string } | null;
  staffRow: { id: string; email: string; role: 'organizer' | 'manager' } | null;
}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: staffRow, error: null }),
        }),
      }),
    }),
  } as any;
}

describe('requireStaff', () => {
  it('returns staff record when user is logged in and listed in staff', async () => {
    const c = mockClient({
      user: { email: 'a@b.com' },
      staffRow: { id: 's-1', email: 'a@b.com', role: 'organizer' },
    });
    const staff = await requireStaff(c);
    expect(staff).toEqual({ id: 's-1', email: 'a@b.com', role: 'organizer' });
  });

  it('throws NotAuthorizedError when no session', async () => {
    const c = mockClient({ user: null, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });

  it('throws NotAuthorizedError when user is logged in but not in staff', async () => {
    const c = mockClient({ user: { email: 'unknown@x.com' }, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});
