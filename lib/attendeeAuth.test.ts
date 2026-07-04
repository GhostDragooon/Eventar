import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

// Mock the SDK factory itself: requestAttendeeOtp uses the plain anon
// signInWithOtp, which WOULD attempt a real email send via the project's
// configured sender in a live environment. Real signup->OTP->consent
// coverage against live Supabase Auth lives in
// tests/rls/attendee_otp.rls.test.ts (admin generateLink shortcut — no
// email sent). This test only checks requestAttendeeOtp's own contract.
const signInWithOtp = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

import { describe, expect, it, beforeEach } from 'vitest';
import { requestAttendeeOtp } from './attendeeAuth';

describe('requestAttendeeOtp', () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('returns { ok: true } when signInWithOtp succeeds', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const result = await requestAttendeeOtp('attendee@example.com');
    expect(result).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'attendee@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('returns { error } when signInWithOtp fails', async () => {
    signInWithOtp.mockResolvedValue({ data: null, error: { message: 'rate limit exceeded' } });
    const result = await requestAttendeeOtp('attendee@example.com');
    expect(result).toEqual({ error: 'rate limit exceeded' });
  });
});
