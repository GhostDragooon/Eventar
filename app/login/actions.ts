'use server';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';

export async function sendMagicLink(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  // Origin from request headers so this works on localhost, Vercel preview, and prod.
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  // Never leak whether the email exists in `staff`. Same response either way.
  // But log the underlying error so we can debug rate-limit / config issues
  // server-side without exposing them to anonymous users.
  if (error) {
    console.error('[sendMagicLink] supabase error', {
      name: error.name,
      status: error.status,
      code: (error as { code?: string }).code,
    });
    return { error: 'Could not send link right now. Try again.' };
  }
  return { ok: true };
}
