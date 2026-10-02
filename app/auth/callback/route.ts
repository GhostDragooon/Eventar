import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { classifyPath, safeNextPath } from '@/lib/authDoor';

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
  // Same-origin redirect target the sign-in surface passed in
  // (?next=/account for attendee flows, unset for the pre-plan staff flow
  // which continues to land on /dashboard). safeNextPath is the open-redirect
  // guard: anything that is not a path on this origin is dropped, and the
  // success redirect falls back to the staff default.
  const safeNext = safeNextPath(url.searchParams.get('next'));
  // A failed sign-in bounces back to the door it started from. Both audiences
  // share this callback, and `next` is the only signal of which one — the
  // attendee door's links carry /account/* or the public /events/<id> page,
  // the organiser door's carry staff routes, /invite/<token> or nothing.
  // lib/authDoor.ts holds the explicit inventory (it replaced a path-prefix
  // heuristic that sent organiser sub-routes under /events/<id>/ to the
  // attendee door — finding I4, 2026-09-25). Neutral or unknown → /login,
  // the same default a bare callback has always had.
  const errorBase = classifyPath(safeNext) === 'attendee' ? '/account/sign-in' : '/login';
  // The error redirect keeps `next`, so a re-requested link (an expired or
  // already-used one) still lands the invitee on /invite/<token> instead of
  // silently dropping them on /dashboard and the wrong door.
  const keepNext = safeNext ? `&next=${encodeURIComponent(safeNext)}` : '';

  if (!code) {
    return NextResponse.redirect(new URL(`${errorBase}?error=missing_code${keepNext}`, url));
  }

  const response = NextResponse.redirect(new URL(safeNext ?? '/dashboard', url));

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
    return NextResponse.redirect(new URL(`${errorBase}?error=exchange_failed${keepNext}`, url));
  }

  return response;
}
