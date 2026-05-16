import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';

export const dynamic = 'force-dynamic';

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select(
      'id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status',
    )
    .eq('id', id)
    .maybeSingle();

  // RLS filters to status='published' for anon; this 404s drafts + non-existent.
  if (!event || event.status !== 'published') notFound();

  const venueLine = [event.venue_name, event.city, event.country].filter(Boolean).join(', ');

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {event.topic ?? 'Event'}
        </p>
        <h1 className="text-4xl font-semibold mt-1">{event.title}</h1>
        <p className="text-gray-700 mt-2">
          {formatInTz(event.start_time, event.timezone)} →{' '}
          {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        {venueLine && (
          <p className="text-gray-700 mt-1">📍 {venueLine}</p>
        )}
      </header>
      {event.description && (
        <section>
          <h2 className="text-lg font-medium mb-2">About</h2>
          <p className="whitespace-pre-wrap text-gray-800">
            {event.description}
          </p>
        </section>
      )}
      <footer className="pt-6 text-sm text-gray-500">
        Registration opens here in phase 2.
      </footer>
    </main>
  );
}
