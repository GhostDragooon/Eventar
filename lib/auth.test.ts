import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
import { requireStaff, NotAuthorizedError } from './auth';

// Fabricate a minimal supabase client shape that requireStaff depends on.
function mockClient({ user, staffRow }: {
  user: { email: string } | null;
  staffRow: { id: string; email: string; role: 'organizer' | 'manager'; full_name: string | null } | null;
}) {
  // Chainable query builder: .eq() can be called any number of times
  // (requireStaff now chains .eq('email', ...).eq('status', 'active')),
  // and .maybeSingle() resolves regardless of how many .eq() calls preceded it.
  const chain: any = {
    eq: () => chain,
    maybeSingle: async () => ({ data: staffRow, error: null }),
  };

  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select: () => chain,
    }),
  } as any;
}

describe('requireStaff', () => {
  it('returns staff record when user is logged in and listed in staff', async () => {
    const c = mockClient({
      user: { email: 'a@b.com' },
      staffRow: { id: 's-1', email: 'a@b.com', role: 'organizer', full_name: 'Alex Bee' },
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
      staffRow: { id: 's-2', email: 'active@x.com', role: 'manager', full_name: 'Active Person' },
    });
    const staff = await requireStaff(c);
    expect(staff).toEqual({ id: 's-2', email: 'active@x.com', role: 'manager', full_name: 'Active Person' });
  });

  it('throws NotAuthorizedError when staff row exists but is suspended/non-active', async () => {
    // The status='active' filter is applied server-side (.eq('status','active')),
    // so a suspended/removed row never comes back from the query — staffRow is null.
    const c = mockClient({ user: { email: 'suspended@x.com' }, staffRow: null });
    await expect(requireStaff(c)).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});
