import { describe, expect, it } from 'vitest';
import { resolveAuthError } from './auth-error-messages';

describe('resolveAuthError', () => {
  it('does not reflect an unknown query value back to the user', () => {
    expect(resolveAuthError('unexpected-secret')).toBe('Sign-in could not be completed. Request a new link below.');
  });

  it('returns null for no code', () => {
    expect(resolveAuthError(null)).toBeNull();
  });

  it('resolves every known code (organizer audience is the default)', () => {
    expect(resolveAuthError('missing_code')).toMatch(/verification code/i);
    expect(resolveAuthError('exchange_failed')).toMatch(/expired or already been used/i);
    expect(resolveAuthError('not_authorized')).toMatch(/not on the organizer list/i);
    expect(resolveAuthError('unavailable')).toMatch(/could not check your organizer access/i);
  });

  it('switches to attendee-flavoured copy when passed audience="attendee"', () => {
    // Neutral codes stay identical across audiences.
    expect(resolveAuthError('missing_code', 'attendee')).toMatch(/verification code/i);
    expect(resolveAuthError('exchange_failed', 'attendee')).toMatch(/expired or already been used/i);
    // Audience-dependent codes drop the "organizer" framing (attendees are self-serve).
    expect(resolveAuthError('not_authorized', 'attendee')).toMatch(/email is not recognised/i);
    expect(resolveAuthError('not_authorized', 'attendee')).not.toMatch(/organizer|staff/i);
    expect(resolveAuthError('unavailable', 'attendee')).toMatch(/could not verify your account/i);
    expect(resolveAuthError('unavailable', 'attendee')).not.toMatch(/organizer access|staff access/i);
  });
});
