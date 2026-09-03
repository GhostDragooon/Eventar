'use server';

// Attendee sign-in via native email OTP. Parallels app/login/actions.ts
// (staff sign-in), same signInWithOtp mechanic, different redirect
// destination — attendees land on /account, not /dashboard, so the
// existing proxy.ts staff gate never touches them.
//
// Plan §7.4 + Q1 (2026-08-30 Stage C decision): separate /account/sign-in
// page using requestAttendeeOtp / signInWithOtp is the attendee door
// (register-as-guest still works via the public event form; account +
// claim + profile is a different door).

import { supabaseAnonServer } from '@/lib/supabase/server';
import { getRequestOrigin } from '@/lib/origin';

export async function sendAttendeeMagicLink(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  // Optional post-sign-in destination the caller passed as a hidden form
  // field. Same open-redirect guard as /auth/callback:23-28 — a relative
  // path that starts with a single '/' only; anything else drops to the
  // default. Walk-in flow round-trips /events/[id] this way.
  const rawNext = String(formData.get('next') ?? '');
  const nextPath =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/account';

  const origin = await getRequestOrigin();
  const supabase = await supabaseAnonServer();

  // shouldCreateUser: true — attendees who have never signed in yet must
  // be able to create their account from this door. Staff /login sets it
  // to whatever the shared helper defaults to (also true) — same posture.
  // emailRedirectTo carries ?next=<path> so /auth/callback lands the
  // attendee where the caller intended (default /account); the callback
  // re-validates the param.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  // Never leak whether an email already exists. Same response either way.
  if (error) {
    console.error('[sendAttendeeMagicLink] supabase error', {
      name: error.name,
      status: error.status,
      code: (error as { code?: string }).code,
    });
    return { error: 'Could not send link right now. Try again.' };
  }
  return { ok: true };
}
