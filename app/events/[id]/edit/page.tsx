import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import type { AgendaTopic } from '@/lib/agenda';
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
    .select('id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status')
    .eq('id', id)
    .maybeSingle();
  if (!event) notFound();

  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, kind, title, host, topics, start_time, end_time')
    .eq('event_id', id)
    .order('start_time', { ascending: true });

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <p className="text-sm text-gray-500">
        Status: <strong>{event.status}</strong>
      </p>
      <h1 className="text-3xl font-semibold">{event.title}</h1>
      <p className="text-gray-700">
        {formatInTz(event.start_time, event.timezone)} →{' '}
        {formatInTz(event.end_time, event.timezone)} ({event.timezone})
      </p>

      <section>
        <h2 className="text-sm font-medium text-gray-700">Venue</h2>
        <p>{event.venue_name}</p>
        {event.venue_address && <p className="text-gray-600 text-sm">{event.venue_address}</p>}
        <p className="text-gray-600 text-sm">
          {event.city}{event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </section>

      {event.description && (
        <section>
          <h2 className="text-sm font-medium text-gray-700">About</h2>
          <p className="whitespace-pre-wrap">{event.description}</p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Agenda</h2>
          <ul className="divide-y border rounded-xl">
            {blocks!.map(b => {
              const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
              return (
                <li key={b.id} className="p-3">
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

      <p className="text-xs text-gray-500">Full edit UI is deferred. For now, delete and re-create to change details.</p>
    </main>
  );
}
