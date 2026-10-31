import { redirect } from 'next/navigation';

// CX-04R: Manage folded into the Events home at /dashboard. The route stays so bookmarks and `next` values keep working;
// the query string is carried across (a bare redirect() would drop it).
export const dynamic = 'force-dynamic';

export default async function ManageRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  const qs = params.toString();
  redirect(qs ? `/dashboard?${qs}` : '/dashboard');
}
