import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// IMPORTANT: do not use the @/lib/supabase/server helper here. In Next 15+/16
// Route Handlers, cookies set via the implicit `cookies()` store are NOT
// merged into a manually returned NextResponse.redirect — they're dropped,
// the browser never receives the session, and the user ends up back at
// /login. The fix is to create the redirect response FIRST and write
// cookies onto it via response.cookies.set(...).
// See: https://supabase.com/docs/guides/auth/server-side/nextjs
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url));
  }

  const response = NextResponse.redirect(new URL('/dashboard', url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/login?error=exchange_failed', url));
  }

  return response;
}
