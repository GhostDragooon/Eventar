import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import type { AgendaTopic } from '@/lib/agenda';

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

  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, kind, title, host, topics, start_time, end_time')
    .eq('event_id', id)
    .order('start_time', { ascending: true });

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
        <p className="text-gray-700 mt-1">
          📍 {event.venue_name}{event.venue_address ? `, ${event.venue_address}` : ''} — {event.city}{event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </header>

      {event.description && (
        <section>
          <h2 className="text-lg font-medium mb-2">About</h2>
          <p className="whitespace-pre-wrap text-gray-800">
            {event.description}
          </p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-2">Program</h2>
          <ul className="divide-y border rounded-xl">
            {blocks!.map(b => {
              const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
              return (
                <li key={b.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-gray-500">{b.kind}</span>
                    <span className="text-sm text-gray-700">
                      {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                    </span>
                  </div>
                  <p className="font-medium mt-1">{b.title}</p>
                  {b.host && <p className="text-sm text-gray-600">Chair: {b.host}</p>}
                  {topics.length > 0 && (
                    <ul className="mt-2 text-sm space-y-1">
                      {topics.map((t, i) => (
                        <li key={i}>
                          • {t.title} — <em>{t.speaker_name}</em>
                          {t.speaker_credential && <span className="text-gray-500"> ({t.speaker_credential})</span>}
                          {t.speaker_affiliation && <span className="text-gray-500">, {t.speaker_affiliation}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="pt-6 text-sm text-gray-500">Registration opens here in phase 2.</footer>
    </main>
  );
}
