import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import SignOutButton from './SignOutButton';

export default async function DashboardPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }

  const supabase = await supabaseServer();
  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_time, timezone, status')
    .order('start_time', { ascending: false })
    .limit(50);

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-gray-600">
            Signed in as {staff.email} ({staff.role})
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/events/new"
            className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium"
          >
            New event
          </Link>
          <SignOutButton />
        </div>
      </header>

      {(events?.length ?? 0) === 0 ? (
        <p className="text-gray-500">No events yet. Create one.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {events!.map((e) => (
            <li key={e.id} className="p-4 flex items-center justify-between">
              <div>
                <Link
                  href={`/events/${e.id}/edit`}
                  className="font-medium hover:underline"
                >
                  {e.title}
                </Link>
                <p className="text-sm text-gray-600">
                  {formatInTz(e.start_time, e.timezone)} · {e.timezone}
                </p>
              </div>
              <span className="text-xs uppercase tracking-wide text-gray-500">
                {e.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
