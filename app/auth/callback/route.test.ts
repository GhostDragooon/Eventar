import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/auth/callback${query}`);
}

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

  it('missing code, ?next=/events/[id] (public event page sign-in round-trip) → redirects to /account/sign-in, not /login', async () => {
    // Regression: the public event page's "Sign in" link round-trips
    // through /account/sign-in?next=/events/{id}, which is an attendee
    // flow but doesn't start with /account — must not fall through to the
    // organizer door.
    const res = await GET(makeRequest('?next=%2Fevents%2F123'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/account/sign-in');
    expect(new URL(location).searchParams.get('error')).toBe('missing_code');
  });
});
