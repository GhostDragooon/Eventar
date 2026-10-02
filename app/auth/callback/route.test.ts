import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The code-exchange leg talks to GoTrue; stub just that call. The error-door
// cases below never reach it (no ?code=).
const { exchange } = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

import { GET } from './route';

const EVENT = '37e37c81-b10a-4077-8f7d-5b5d247b1adc';

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/auth/callback${query}`);
}

function next(path: string): string {
  return `?next=${encodeURIComponent(path)}`;
}

async function errorRedirect(query: string) {
  const res = await GET(makeRequest(query));
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get('location')!);
  return { pathname: location.pathname, error: location.searchParams.get('error') };
}

beforeEach(() => {
  exchange.mockReset();
});

describe('GET /auth/callback — error redirects respect the audience door (?next=)', () => {
  it('missing code, ?next=/account (attendee flow) → redirects to /account/sign-in, not /login', async () => {
    const res = await GET(makeRequest('?next=%2Faccount'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/account/sign-in');
    expect(new URL(location).searchParams.get('error')).toBe('missing_code');
  });

  it('missing code, no ?next= (staff flow) → redirects to /login', async () => {
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/login');
    expect(new URL(location).searchParams.get('error')).toBe('missing_code');
  });

  it('missing code, ?next= pointing outside /account (e.g. tampered) → falls back to /login', async () => {
    const res = await GET(makeRequest('?next=%2Fdashboard'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/login');
  });

  it('missing code, ?next=/events/<uuid> (public event page sign-in round-trip) → redirects to /account/sign-in, not /login', async () => {
    // Regression: the public event page's "Sign in" link round-trips
    // through /account/sign-in?next=/events/{id}, which is an attendee
    // flow but doesn't start with /account — must not fall through to the
    // organizer door. (Event ids are UUIDs; the classifier matches on that
    // shape, so this used to read /events/123.)
    const res = await GET(makeRequest(next(`/events/${EVENT}`)));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/account/sign-in');
    expect(new URL(location).searchParams.get('error')).toBe('missing_code');
  });

  // I4 (2026-09-25): the old prefix heuristic called everything under
  // /events/ attendee except exactly /events/new, so every other organiser
  // route under /events/<id>/ bounced a failed organiser sign-in to the
  // practitioner door.
  it.each(['edit', 'checkin', 'details', 'analytics'])(
    'missing code, ?next=/events/<uuid>/%s (organiser route) → /login, not the attendee door',
    async (sub) => {
      expect(await errorRedirect(next(`/events/${EVENT}/${sub}`))).toEqual({
        pathname: '/login',
        error: 'missing_code',
      });
    },
  );

  it('missing code, ?next=/events/new → /login (the old hand-carved exception, now covered)', async () => {
    expect(await errorRedirect(next('/events/new'))).toEqual({ pathname: '/login', error: 'missing_code' });
  });

  it('missing code, ?next=/invite/<token> → /login (an invitee signs in through the organiser door)', async () => {
    expect(await errorRedirect(next('/invite/x'))).toEqual({ pathname: '/login', error: 'missing_code' });
  });

  it('missing code, ?next=/settings → /login', async () => {
    expect(await errorRedirect(next('/settings'))).toEqual({ pathname: '/login', error: 'missing_code' });
  });

  it('missing code, ?next=/account/claim → /account/sign-in', async () => {
    expect(await errorRedirect(next('/account/claim'))).toEqual({
      pathname: '/account/sign-in',
      error: 'missing_code',
    });
  });

  it('missing code, ?next= with a query string still classifies on the path', async () => {
    expect(await errorRedirect(next('/account/record?from=email'))).toEqual({
      pathname: '/account/sign-in',
      error: 'missing_code',
    });
  });

  it('exchange_failed uses the same door as missing_code', async () => {
    exchange.mockResolvedValue({ error: new Error('otp expired') });
    expect(await errorRedirect(`?code=abc&next=${encodeURIComponent('/account/claim')}`)).toEqual({
      pathname: '/account/sign-in',
      error: 'exchange_failed',
    });
    expect(await errorRedirect(`?code=abc&next=${encodeURIComponent(`/events/${EVENT}/checkin`)}`)).toEqual({
      pathname: '/login',
      error: 'exchange_failed',
    });
    expect(exchange).toHaveBeenCalledTimes(2);
  });
});

// m3 (Band 1 dev review): a consumed or expired magic link used to lose the
// invite. /auth/callback?next=/invite/<token> became /login?error=...; the next
// request then carried no `next`, so the invitee landed on /dashboard and was
// bounced to the "practitioner account" panel with nothing about the invite.
describe('GET /auth/callback — error redirects keep a safe `next`', () => {
  async function location(query: string) {
    const res = await GET(makeRequest(query));
    expect(res.status).toBe(307);
    return new URL(res.headers.get('location')!);
  }

  it('missing code keeps the invite destination on the organiser door', async () => {
    const url = await location(next('/invite/token-123'));
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('missing_code');
    expect(url.searchParams.get('next')).toBe('/invite/token-123');
  });

  it('exchange_failed keeps it too, with its query string intact', async () => {
    exchange.mockResolvedValue({ error: new Error('otp expired') });
    const url = await location(`?code=abc&next=${encodeURIComponent('/dashboard/manage?tab=drafts')}`);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('exchange_failed');
    expect(url.searchParams.get('next')).toBe('/dashboard/manage?tab=drafts');
  });

  it('keeps it on the attendee door as well', async () => {
    const url = await location(next('/account/claim'));
    expect(url.pathname).toBe('/account/sign-in');
    expect(url.searchParams.get('next')).toBe('/account/claim');
  });

  it('adds no `next` when there was none', async () => {
    expect((await location('')).searchParams.has('next')).toBe(false);
  });

  it.each([
    ['backslash', '/\\evil.example.com'],
    ['tab', '/\t/evil.example.com'],
    ['protocol-relative', '//evil.example.com'],
  ])('drops a hostile `next` instead of echoing it (%s)', async (_label, hostile) => {
    const url = await location(next(hostile));
    expect(url.host).toBe('localhost:3000');
    expect(url.searchParams.has('next')).toBe(false);
  });
});

describe('GET /auth/callback — successful exchange lands on `next`', () => {
  it('forwards an invite link to the invite page (the invitee leg of B1)', async () => {
    exchange.mockResolvedValue({ error: null });
    const res = await GET(makeRequest(`?code=abc&next=${encodeURIComponent('/invite/token-123')}`));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/invite/token-123');
    expect(exchange).toHaveBeenCalledWith('abc');
  });

  it('defaults to /dashboard when `next` is absent', async () => {
    exchange.mockResolvedValue({ error: null });
    const res = await GET(makeRequest('?code=abc'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
  });

  // The terminal server-side sink of the open redirect: with the old guard,
  // /\\evil.example.com passed and the 307 pointed at http://evil.example.com/.
  it.each([
    ['protocol-relative', '//evil.example.com'],
    ['backslash', '/\\evil.example.com'],
    ['slash then backslash', '/\\/evil.example.com'],
    ['tab', '/\t/evil.example.com'],
    ['line feed', '/\n/evil.example.com'],
    ['dot-segments', '/..//evil.example.com'],
  ])('falls back to /dashboard on this host for a hostile `next` (%s)', async (_label, hostile) => {
    exchange.mockResolvedValue({ error: null });
    const res = await GET(makeRequest(`?code=abc&next=${encodeURIComponent(hostile)}`));
    const location = new URL(res.headers.get('location')!);
    expect(location.host).toBe('localhost:3000');
    expect(location.pathname).toBe('/dashboard');
  });
});
