import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockRequireStaff = vi.fn();
vi.mock('@/lib/auth', () => ({ requireStaff: (...args: unknown[]) => mockRequireStaff(...args) }));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-user-1' } } }) },
  })),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { provisionOrganisation } from './orgActions';

const validInput = {
  name: 'Test Org',
  slug: 'test-org',
  jurisdiction: 'HK',
  firstAdminEmail: 'admin@test.org',
};

const eventar = { id: 'staff-op', email: 'op@eventar.test', role: 'eventar_staff', full_name: 'Op' };

beforeEach(() => {
  mockRequireStaff.mockReset().mockResolvedValue(eventar);
  mockFrom.mockReset();
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
});

function mockInsertChain(data: unknown, error: unknown = null) {
  return mockFrom.mockReturnValueOnce({
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data, error }) }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  });
}

describe('provisionOrganisation', () => {
  it('happy path: creates org + staff + audit', async () => {
    mockInsertChain({ id: 'org-1' }); // org insert
    mockInsertChain({ id: 'staff-1' }); // staff insert

    const res = await provisionOrganisation(validInput);
    expect(res).toEqual({ orgId: 'org-1', staffId: 'staff-1' });
    expect(mockRpc).toHaveBeenCalledWith('write_audit_event', expect.objectContaining({
      p_event_type: 'org_provisioned',
      p_actor_user_id: 'auth-user-1',
      p_organisation_id: 'org-1',
      p_subject_type: 'organisation',
    }));
  });

  it('rejects non-eventar_staff callers', async () => {
    mockRequireStaff.mockResolvedValue({ ...eventar, role: 'organiser_admin' });
    const res = await provisionOrganisation(validInput);
    expect(res).toEqual({ error: 'Only Eventar operators can provision organisations.' });
  });

  it('rejects duplicate slug (23505)', async () => {
    mockInsertChain(null, { code: '23505', message: 'duplicate key' });
    const res = await provisionOrganisation(validInput);
    expect(res).toEqual({ error: 'An organisation with this slug already exists.' });
  });

  it('rejects invalid slug format', async () => {
    const res = await provisionOrganisation({ ...validInput, slug: 'Bad Slug!' });
    expect(res).toHaveProperty('error');
    expect((res as { error: string }).error).toContain('alphanumeric');
  });

  it('rejects missing name', async () => {
    const res = await provisionOrganisation({ ...validInput, name: '' });
    expect(res).toHaveProperty('error');
  });

  it('rejects invalid email', async () => {
    const res = await provisionOrganisation({ ...validInput, firstAdminEmail: 'not-an-email' });
    expect(res).toHaveProperty('error');
  });
});
