import { afterEach, describe, expect, it, vi } from 'vitest';
import { isReviewMode } from './reviewMode';

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
