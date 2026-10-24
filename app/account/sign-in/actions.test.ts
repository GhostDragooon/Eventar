// The attendee magic link carries the visitor's destination as ?next= on
// /auth/callback. This is the server-side half of spec 001 FR-005: the form's
// hidden field is attacker-controllable (anyone can POST the action), so the
// gate lives here and not only in the pages that render the form.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithOtp } = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  supabaseAnonServer: vi.fn(async () => ({ auth: { signInWithOtp } })),
}));
vi.mock('@/lib/origin', () => ({ getRequestOrigin: vi.fn(async () => 'http://localhost:3100') }));

import { sendAttendeeMagicLink } from './actions';

const EVENT = '37e37c81-b10a-4077-8f7d-5b5d247b1adc';

function form(next?: string) {
  const f = new FormData();
  f.set('email', 'Practitioner@Example.com');
  if (next !== undefined) f.set('next', next);
  return f;
}

async function landing(next?: string) {
  signInWithOtp.mockClear();
  const res = await sendAttendeeMagicLink(form(next));
  expect(res).toEqual({ ok: true });
  expect(signInWithOtp).toHaveBeenCalledTimes(1);
  const { emailRedirectTo } = signInWithOtp.mock.calls[0][0].options;
  const url = new URL(emailRedirectTo);
  expect(url.origin + url.pathname).toBe('http://localhost:3100/auth/callback');
  return url.searchParams.get('next');
}

beforeEach(() => signInWithOtp.mockResolvedValue({ error: null }));

describe('sendAttendeeMagicLink — next', () => {
  it.each(['/account/claim', '/account/complete?next=%2Faccount%2Fclaim', `/events/${EVENT}`])(
    'carries the attendee destination %s into the emailed link',
    async (next) => {
      expect(await landing(next)).toBe(next);
    },
  );

  it('defaults to the record when there is no destination', async () => {
    expect(await landing()).toBe('/account/record');
    expect(await landing('')).toBe('/account/record');
  });

  it.each([
    '//evil.example',
    '/\\evil',
    '/\t/evil.example',
    'https://evil.example/account',
    '/dashboard',
    '/login',
    '/settings',
    '/account/../dashboard',
  ])('a hostile or other-audience destination (%j) falls back to the record', async (next) => {
    expect(await landing(next)).toBe('/account/record');
  });
});
