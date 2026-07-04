import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { describe, expect, it } from 'vitest';
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
