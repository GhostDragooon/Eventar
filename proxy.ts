// Next 16 renamed "middleware" → "proxy". File must be at repo root (or src/).
// Exported function must be named `proxy` (or default export).
// See: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isReviewMode } from '@/lib/reviewMode';

export async function proxy(req: NextRequest) {
  // LOCAL REVIEW BYPASS — Layer 1 of the three-layer auth gate. Without this
  // the middleware redirects to /login before any page renders, so the
  // requireStaff bypass alone would be invisible. Same guard function, so both
  // layers open and close together and there is one thing to audit.
  // lib/reviewMode.ts checks NODE_ENV first: a production build never reaches
  // this branch. RLS (Layer 3) is untouched either way.
  if (isReviewMode()) {
    console.warn('[review-mode] proxy gate BYPASSED for', req.nextUrl.pathname);
    return NextResponse.next();
  }

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

  // Same as requireStaff: getUser() reports "no session" as an error, so a
  // failed call and an absent session are the same fact here, and a gate must
  // fail closed to /login on either.
  // eslint-disable-next-line no-restricted-syntax -- see above: no-session and call-failed are the same fact
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirectWithCookies(new URL('/login', req.url));
  }

  const email = user.email?.toLowerCase();
  if (!email) {
    await supabase.auth.signOut();
    return redirectWithCookies(new URL('/login?error=not_authorized', req.url));
  }

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  // An unreadable staff table is an outage, not a verdict. Swallowing the error
  // signed the user out and told them their email is not on the staff list —
  // a false accusation that also destroyed a valid session, so they could not
  // simply retry once the read recovered (rule 12). Still fails closed: no
  // staff route is served, but the session survives and the copy is honest.
  if (staffErr) {
    return redirectWithCookies(new URL('/login?error=unavailable', req.url));
  }

  if (!staff) {
    await supabase.auth.signOut();
    return redirectWithCookies(new URL('/login?error=not_authorized', req.url));
  }

  return res;
}

// Gate staff-only routes. The public /events/[id] page and /events/[id]/poster
// live under app/(public) and are NOT in this matcher. Staff routes are
// /dashboard, /events/new, and /events/[id]/{edit,checkin,details,analytics}.
// Defense-in-depth: each staff page also gates via requireStaff() (Layer 2);
// this matcher is Layer 1.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/events/new',
    '/events/:id/edit',
    '/events/:id/checkin',
    '/events/:id/details',
    '/events/:id/analytics',
    // Global nav-tab index pages. Exact '/checkin' does NOT catch the public
    // attendee pass at /checkin/confirm.
    '/checkin',
    '/analytics',
    '/settings',
  ],
};
