'use server';
import { supabaseAnonServer } from '@/lib/supabase/server';
import { getRequestOrigin } from '@/lib/origin';

export async function sendMagicLink(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  // NEXT_PUBLIC_SITE_URL in prod (Phase-8 gate 3); request headers in dev.
  const origin = await getRequestOrigin();

  // supabaseAnonServer, NOT supabaseServer: the review-mode service-role
  // client can't do PKCE (see lib/supabase/server.ts) and the emailed link
  // would arrive without ?code=.
  const supabase = await supabaseAnonServer();
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
