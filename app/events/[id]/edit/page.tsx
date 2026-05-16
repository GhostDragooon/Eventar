import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import { publishEvent } from './actions';

export default async function StaffEventEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, country, description, status')
    .eq('id', id)
    .maybeSingle();
  if (!event) notFound();

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <p className="text-sm text-gray-500">
        Status: <strong>{event.status}</strong>
      </p>
      <h1 className="text-3xl font-semibold">{event.title}</h1>
      <p className="text-gray-700">
        {formatInTz(event.start_time, event.timezone)} →{' '}
        {formatInTz(event.end_time, event.timezone)} ({event.timezone})
      </p>
      {event.venue_name && (
        <p>{event.venue_name}{event.city ? `, ${event.city}` : ''}{event.country ? `, ${event.country}` : ''}</p>
      )}
      {event.description && (
        <p className="whitespace-pre-wrap">{event.description}</p>
      )}

      {event.status === 'draft' && (
        <form
          action={async () => {
            'use server';
            await publishEvent(event.id);
          }}
        >
          <button className="rounded-md bg-black text-white px-4 py-2 font-medium">
            Publish
          </button>
        </form>
      )}
      {event.status === 'published' && (
        <a
          className="text-blue-700 underline"
          href={`/events/${event.id}`}
          target="_blank"
          rel="noreferrer"
        >
          View public page →
        </a>
      )}
    </main>
  );
}
