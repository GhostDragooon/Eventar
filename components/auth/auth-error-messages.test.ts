import { describe, expect, it } from 'vitest';
import { resolveAuthError } from './auth-error-messages';

describe('resolveAuthError', () => {
  it('does not reflect an unknown query value back to the user', () => {
    expect(resolveAuthError('unexpected-secret')).toBe('Sign-in could not be completed. Request a new link below.');
  });

  it('returns null for no code', () => {
    expect(resolveAuthError(null)).toBeNull();
  });

  it('resolves every known code, matching the production dictionary in app/login/page.tsx', () => {
    expect(resolveAuthError('missing_code')).toMatch(/verification code/i);
    expect(resolveAuthError('exchange_failed')).toMatch(/expired or already been used/i);
    expect(resolveAuthError('not_authorized')).toMatch(/not on the staff list/i);
    expect(resolveAuthError('unavailable')).toMatch(/could not check your staff access/i);
  });
});
