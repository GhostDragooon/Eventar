// lib/attendeeAuth.ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Request a native email OTP for an attendee (accounts + sessions).
 * Capability only — no registration linking. Real email delivery waits
 * for a future Resend cutover; until then dev-sender / admin generateLink. */
export async function requestAttendeeOtp(email: string): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return { error: error.message };
  return { ok: true };
}
