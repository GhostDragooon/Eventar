import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isReviewMode } from '@/lib/reviewMode';

export async function supabaseServer() {
  // LOCAL REVIEW BYPASS. Staff pages read through this client under RLS; with
  // no session that client is `anon`, which has no SELECT on registrations or
  // completed events — so every staff surface renders structurally correct and
  // completely EMPTY. Routing to the service-role client is what makes the
  // pages reviewable at all (this is the same thing the pre-c43fd95 review mode
  // did, and the reason it existed).
  //
  // Safe to reintroduce now for a reason that was NOT true then: the PKCE bug
  // that got the old bypass stripped happened because `sendMagicLink` used
  // supabaseServer(). Auth flows now call `supabaseAnonServer()` explicitly
  // (see the note below), so token-minting never reaches this branch.
  //
  // lib/reviewMode.ts checks NODE_ENV first and unconditionally.
  if (isReviewMode()) {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    return supabaseAdmin();
  }
  return supabaseAnonServer();
}

// Auth flows (sendMagicLink today; anything that mints or exchanges tokens)
// must ALWAYS use this client: a service-role supabase-js client (implicit
// flow, no cookie storage) sends no PKCE code_challenge and persists no
// verifier cookie, so the emailed link lands with fragment tokens instead
// of ?code= and login dies at /login?error=missing_code.
export async function supabaseAnonServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component without a writable cookie store — ignore
          }
        },
      },
    },
  );
}
