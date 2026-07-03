import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
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
