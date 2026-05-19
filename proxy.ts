// Next 16 renamed "middleware" → "proxy". File must be at repo root (or src/).
// Exported function must be named `proxy` (or default export).
// See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(req: NextRequest) {
  // We bind the Supabase client's cookie-setter to `res`. The client may write
  // refreshed-session cookies during `getUser()` or clear cookies during
  // `signOut()`. For the happy path we return `res` directly and those cookies
  // make it back to the browser. For redirect paths, `redirectWithCookies`
  // copies the cookies the client wrote onto the redirect response — without
  // this the signOut path silently fails (browser stays signed in, infinite
  // redirect loop on next request). Same class of bug as the /auth/callback
  // fix in commit 3e5a004.
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          ),
      },
    },
  );

  function redirectWithCookies(url: URL): NextResponse {
    const redirect = NextResponse.redirect(url);
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithCookies(new URL('/login', req.url));
  }

  const email = user.email?.toLowerCase();
  if (!email) {
    await supabase.auth.signOut();
    return redirectWithCookies(new URL('/login?error=not_authorized', req.url));
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!staff) {
    await supabase.auth.signOut();
    return redirectWithCookies(new URL('/login?error=not_authorized', req.url));
  }

  return res;
}

// Gate staff-only routes. The public /events/[id] page lives under app/(public)
// and is NOT in this matcher; only /events/new and /events/[id]/{edit,checkin}
// are staff-gated.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/events/new',
    '/events/:id/edit',
    '/events/:id/checkin',
  ],
};
