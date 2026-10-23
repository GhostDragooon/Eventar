import { describe, expect, it, vi, beforeEach } from 'vitest';

// requireStaff is the auth gate; the RPC is the write path. Both are mocked so these tests exercise THIS
// module's own logic: the role check that must run after requireStaff() and before any RPC (CX-05).
const requireStaffMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('server-only', () => ({}));
// canSetAccreditation stays REAL: the role check is what is under test.
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  requireStaff: () => requireStaffMock(),
}));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({ rpc: rpcMock }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  addAccreditationGroup,
  removeAccreditationGroup,
  addAccreditationRow,
  removeAccreditationRow,
  linkAccreditationOccurrence,
  unlinkAccreditationOccurrence,
  setRegistrationRole,
  removeRegistrationRole,
} from './multiBodyActions';

const ID = '11111111-2222-4333-8444-555555555555';
const ID2 = '99999999-8888-4777-8666-555555555555';

// The six accreditation writes: each must refuse a role that cannot set accreditation.
const ACCREDITATION_ACTIONS: [string, () => Promise<unknown>][] = [
  ['addAccreditationGroup', () => addAccreditationGroup({ eventId: ID, bodyId: ID2, categoryCode: null, unit: 'hours', awardScheme: 'proportional' })],
  ['removeAccreditationGroup', () => removeAccreditationGroup({ groupId: ID, eventId: ID2 })],
  ['addAccreditationRow', () => addAccreditationRow({ groupId: ID, eventId: ID2, creditValue: 2 })],
  ['removeAccreditationRow', () => removeAccreditationRow({ accreditationId: ID, eventId: ID2 })],
  ['linkAccreditationOccurrence', () => linkAccreditationOccurrence({ accreditationId: ID, occurrenceId: ID2, eventId: ID })],
  ['unlinkAccreditationOccurrence', () => unlinkAccreditationOccurrence({ accreditationId: ID, occurrenceId: ID2, eventId: ID })],
];

const ROLE_REFUSAL = 'Your role can’t set accreditation. Ask an organiser admin to add or change it.';

beforeEach(() => {
  requireStaffMock.mockReset();
  // add_* RPCs end in .single(); the others are awaited directly. One thenable serves both.
  rpcMock.mockReset().mockImplementation(() => {
    const result = Promise.resolve({ data: { id: ID }, error: null });
    return Object.assign(result, { single: () => result });
  });
});

describe.each(['organiser_member', 'body_admin', 'auditor'])('accreditation actions as %s', (role) => {
  it.each(ACCREDITATION_ACTIONS)('%s is refused before any RPC', async (_name, call) => {
    requireStaffMock.mockResolvedValue({ id: ID, role });
    expect(await call()).toEqual({ error: ROLE_REFUSAL });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe.each(['organiser_admin', 'eventar_staff'])('accreditation actions as %s', (role) => {
  it.each(ACCREDITATION_ACTIONS)('%s reaches the RPC', async (_name, call) => {
    requireStaffMock.mockResolvedValue({ id: ID, role });
    expect(await call()).toMatchObject({ ok: true });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

// Registration roles (presenter, chair) are NOT accreditation settings: set_registration_role admits
// organiser_admin, organiser_member and eventar_staff, so the roster keeps working for a member who owns
// the event. Gating these two with canSetAccreditation would silently take that away.
describe('registration role actions are not gated by canSetAccreditation', () => {
  it.each([
    ['setRegistrationRole', () => setRegistrationRole({ registrationId: ID, eventId: ID2, roleCode: 'presenter' })],
    ['removeRegistrationRole', () => removeRegistrationRole({ registrationId: ID, eventId: ID2, roleCode: 'presenter' })],
  ])('%s still reaches the RPC for organiser_member', async (_name, call) => {
    requireStaffMock.mockResolvedValue({ id: ID, role: 'organiser_member' });
    expect(await call()).toMatchObject({ ok: true });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
