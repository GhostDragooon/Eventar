import { describe, expect, it } from 'vitest';
import { resolveAuthError } from './auth-error-messages';

describe('resolveAuthError', () => {
  it('does not reflect an unknown query value back to the user', () => {
    expect(resolveAuthError('unexpected-secret')).toBe('Log-in could not be completed. Request a new link below.');
  });

  it('returns null for no code', () => {
    expect(resolveAuthError(null)).toBeNull();
  });

  it('resolves every known code (organizer audience is the default)', () => {
    // The word "verification code" meant nothing to someone who clicked a stale link (Band 1 review F4).
    expect(resolveAuthError('missing_code')).toMatch(/expired or was already used/i);
    expect(resolveAuthError('missing_code')).not.toMatch(/verification code/i);
    // A link opened in another browser, device or mail app fails the code exchange
    // exactly like an expired one; the copy has to name that cause or "request a new
    // one" loops forever (user-lens round 2, M2).
    expect(resolveAuthError('exchange_failed')).toMatch(/different browser or app/i);
    expect(resolveAuthError('exchange_failed')).toMatch(/same browser/i);
    expect(resolveAuthError('not_authorized')).toMatch(/couldn't log you in as an organiser/i);
    expect(resolveAuthError('unavailable')).toMatch(/could not check your organizer access/i);
  });

  // D1 (2026-09-25): proxy.ts no longer signs a signed-in non-organiser out;
  // it bounces them to /login?error=not_organiser. With a session /login shows
  // its practitioner panel; this line is for a visitor with none (a pasted URL).
  it('resolves not_organiser to the same wrong-door line as not_authorized', () => {
    expect(resolveAuthError('not_organiser')).toBe(resolveAuthError('not_authorized'));
  });

  // Ivan 2026-11-01: bland, non-enumerating, no password language, points to the Attendee door and Sign up.
  it('the wrong-door line never says whether the email is on a staff list, never mentions a password, and points on', () => {
    for (const code of ['not_authorized', 'not_organiser']) {
      const line = resolveAuthError(code)!;
      expect(line).not.toMatch(/password|staff|list|team|admin|not on/i);
      expect(line).toMatch(/attendee log in/i);
      expect(line).toMatch(/sign up/i);
    }
  });

  it('keeps not_organiser off the attendee door (generic line, never reflected)', () => {
    expect(resolveAuthError('not_organiser', 'attendee')).toBe(
      'Log-in could not be completed. Request a new link below.',
    );
  });

  it('switches to attendee-flavoured copy when passed audience="attendee"', () => {
    // Neutral codes stay identical across audiences.
    expect(resolveAuthError('missing_code', 'attendee')).toMatch(/expired or was already used/i);
    expect(resolveAuthError('exchange_failed', 'attendee')).toMatch(/different browser or app/i);
    // Audience-dependent codes drop the "organizer" framing (attendees are self-serve).
    expect(resolveAuthError('not_authorized', 'attendee')).toMatch(/email is not recognised/i);
    expect(resolveAuthError('not_authorized', 'attendee')).not.toMatch(/organizer|staff/i);
    expect(resolveAuthError('unavailable', 'attendee')).toMatch(/could not verify your account/i);
    expect(resolveAuthError('unavailable', 'attendee')).not.toMatch(/organizer access|staff access/i);
  });
});

// CX-07: `staff` allows one person in two organisations (UNIQUE (email, organisation_id)); the single-row read
// then errors, and the organiser used to be told "try again in a moment" for ever.
describe('multiple_organisations', () => {
  it('says why, in organiser-door copy, and does not call it a transient outage', () => {
    const msg = resolveAuthError('multiple_organisations');
    expect(msg).toBe("Your account belongs to more than one organisation, which isn't supported yet. Ask Eventar support.");
    expect(msg).not.toMatch(/try again|on our side|just now/i);
    expect(msg).not.toContain('\u2014');
  });

  it('is organiser-door only: the attendee door never receives it and falls back to the generic line', () => {
    expect(resolveAuthError('multiple_organisations', 'attendee')).toBe('Log-in could not be completed. Request a new link below.');
  });
});

