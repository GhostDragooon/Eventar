import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './admin';

export async function supabaseServer() {
  // REVIEW MODE — requireStaff() is stubbed in lib/auth.ts so staff pages open
  // without magic-link auth, but that only bypasses APP auth: the SSR client
  // below is still an anon Postgres session, so every RLS-scoped staff read
  // (registrations, surveys, attendance, draft events) returns zero rows and
  // the pages render empty. Return the service-role client so review browsing
  // sees real data. Dev-only; NEVER set EVENTAR_REVIEW_MODE in production —
  // removed together with the rest of the bypass before pushing.
  if (process.env.EVENTAR_REVIEW_MODE === 'true') {
    return supabaseAdmin();
  }

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
