import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url));
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/login?error=exchange_failed', url));
  }

  // Proxy (formerly middleware) does the staff-membership check on the next
  // request; if the email isn't in `staff`, the user is signed out and bounced.
  return NextResponse.redirect(new URL('/dashboard', url));
}
