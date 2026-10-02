import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Layer 1 of the three-layer staff gate. The Supabase client is the only
// collaborator; stub it so each branch of the gate can be driven directly.
const { getUser, signOut, from } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser, signOut }, from }),
}));

import { proxy } from './proxy';

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

/** Wires from('staff').select().eq().eq().maybeSingle() and returns the `eq` spy. */
function stubStaffLookup(result: { data: unknown; error: unknown }) {
  const eq = vi.fn();
  const chain = { eq, maybeSingle: vi.fn(async () => result) };
  eq.mockReturnValue(chain);
  from.mockReturnValue({ select: vi.fn(() => chain) });
  return eq;
}

function location(res: Response): URL {
  expect(res.status).toBe(307);
  return new URL(res.headers.get('location')!);
}

beforeEach(() => {
  // Review mode would short-circuit the gate; keep the suite independent of
  // whatever the developer's shell exports.
  vi.stubEnv('EVENTAR_REVIEW_MODE', 'false');
  getUser.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
  from.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy — signed-out visitor on a staff route', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('Auth session missing!') });
  });

  // I5 (2026-09-25): the redirect used to be a bare /login, so an organiser
  // who followed a deep link, signed in, and landed on /dashboard instead.
  it('redirects to /login carrying the destination as ?next= (path + query)', async () => {
    const res = await proxy(request('/dashboard/manage?tab=drafts'));
    const to = location(res);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('next')).toBe('/dashboard/manage?tab=drafts');
    expect(to.searchParams.get('error')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('carries a path with no query as-is', async () => {
    const to = location(await proxy(request('/events/new')));
    expect(to.searchParams.get('next')).toBe('/events/new');
  });
});

describe('proxy — staff lookup', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { email: 'Staff@Example.com' } }, error: null });
  });

  // N2 (2026-09-25): the gate matched on email alone, so a suspended or
  // removed staff row still passed Layer 1 (requireStaff already filtered).
  it('matches the lower-cased email AND status = active', async () => {
    const eq = stubStaffLookup({ data: { id: 'staff-1' }, error: null });
    await proxy(request('/dashboard'));
    expect(eq).toHaveBeenCalledWith('email', 'staff@example.com');
    expect(eq).toHaveBeenCalledWith('status', 'active');
  });

  it('lets an active staff member through (no redirect, no sign-out)', async () => {
    stubStaffLookup({ data: { id: 'staff-1' }, error: null });
    const res = await proxy(request('/dashboard'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});

// D1 (2026-09-25): a signed-in session that is not an organiser is NOT signed
// out here any more. Signing out destroyed a practitioner's login for clicking
// "Start an Event" and then told them their email was "not on the organizer
// list" (I1). /login now explains the session and lets the person choose.
describe('proxy — signed in, but no active staff row', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { email: 'practitioner@example.com' } }, error: null });
    stubStaffLookup({ data: null, error: null });
  });

  it('keeps the session: /login?error=not_organiser with the destination, and no sign-out', async () => {
    const to = location(await proxy(request('/events/new')));
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('error')).toBe('not_organiser');
    expect(to.searchParams.get('next')).toBe('/events/new');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('carries the query string of the destination', async () => {
    const to = location(await proxy(request('/dashboard/manage?tab=drafts')));
    expect(to.searchParams.get('next')).toBe('/dashboard/manage?tab=drafts');
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('proxy — branches that did not change', () => {
  // A session with no email is broken, not merely unprivileged: it can never
  // match a staff row, so this is still the one place the gate signs out.
  it('a session with no email is signed out and sent to /login?error=not_authorized', async () => {
    getUser.mockResolvedValue({ data: { user: { email: undefined } }, error: null });
    const to = location(await proxy(request('/dashboard')));
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('error')).toBe('not_authorized');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  // An unreadable staff table is an outage, not a verdict (rule 12): fail
  // closed, keep the session, say it is on our side.
  it('an unreadable staff table is an outage: /login?error=unavailable, session kept', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'staff@example.com' } }, error: null });
    stubStaffLookup({ data: null, error: { code: '57014', message: 'canceling statement' } });
    const to = location(await proxy(request('/dashboard')));
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('error')).toBe('unavailable');
    expect(signOut).not.toHaveBeenCalled();
  });
});
