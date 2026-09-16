import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReviewMode, isRealAuthCookiePresent } from './reviewMode';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isReviewMode', () => {
  it('is off when the env var is unset', () => {
    vi.stubEnv('EVENTAR_REVIEW_MODE', '');
    expect(isReviewMode()).toBe(false);
  });

  it('is on for the exact string "true" outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVENTAR_REVIEW_MODE', 'true');
    expect(isReviewMode()).toBe(true);
  });

  // THE guard. This bypass disables authentication, so the production check has
  // to hold even when the env var is set — a leaked var on a host must not be
  // able to open every staff surface to the internet.
  it('REFUSES to engage in production even with the flag set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EVENTAR_REVIEW_MODE', 'true');
    expect(isReviewMode()).toBe(false);
  });

  // No truthiness: a half-configured env must fail closed, not open.
  it.each(['false', '1', 'yes', 'TRUE', 'on', ' true'])(
    'stays off for the non-exact value %o',
    (value) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('EVENTAR_REVIEW_MODE', value);
      expect(isReviewMode()).toBe(false);
    },
  );
});

// Shared by lib/auth.ts's requireStaff(), lib/supabase/server.ts's
// supabaseServer(), and proxy.ts — three call sites disagreeing on this
// predicate is exactly the bug class fixed 2026-09-16/17 (see reviewMode.ts's
// own doc comment). One test file for the one predicate all three share.
describe('isRealAuthCookiePresent', () => {
  it('is false with no cookies at all', () => {
    expect(isRealAuthCookiePresent([])).toBe(false);
  });

  it('is false for unrelated cookies', () => {
    expect(isRealAuthCookiePresent([{ name: 'theme' }, { name: 'sb-project-ref' }])).toBe(false);
  });

  it('is true for a real Supabase auth-token cookie', () => {
    expect(isRealAuthCookiePresent([{ name: 'sb-abcdefgh-auth-token' }])).toBe(true);
  });

  it('is true when the auth-token cookie is chunked (sb-...-auth-token.0, .1, ...)', () => {
    expect(isRealAuthCookiePresent([{ name: 'sb-abcdefgh-auth-token.0' }])).toBe(true);
  });
});
