import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { buildEventQrPng } from '@/lib/qr';
import type { AgendaTopic } from '@/lib/agenda';
import RegisterCard from '@/components/RegisterCard';
import PrintPosterButton from '@/components/PrintPosterButton';

export const dynamic = 'force-dynamic';

export default async function EventPosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select(
      'id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees',
    )
    .eq('id', id)
    .maybeSingle();

  // RLS filters to status='published' for anon; this 404s drafts + non-existent.
  // Defense-in-depth status check matches the existing /events/[id] page.
  if (!event || event.status !== 'published') notFound();

  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, kind, title, host, topics, start_time, end_time')
    .eq('event_id', id)
    .order('start_time', { ascending: true });

  // Service-role count: anon has no SELECT policy on registrations (PII gated
  // to organizer/manager). Same pattern as the existing public event page.
  const { count: registrationCount } = await supabaseAdmin()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  const { pngBase64 } = await buildEventQrPng(
    { id: event.id, title: event.title },
    origin,
  );

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8 print:p-0 print:max-w-none">
      <header className="text-center">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {event.topic ?? 'Event'}
        </p>
        <h1 className="text-5xl font-semibold mt-2 print:text-4xl">{event.title}</h1>
        <p className="text-gray-700 mt-3 text-lg">
          {formatInTz(event.start_time, event.timezone)} →{' '}
          {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        <p className="text-gray-700 mt-1">
          📍 {event.venue_name}
          {event.venue_address ? `, ${event.venue_address}` : ''} — {event.city}
          {event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </header>

      <section className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 data URL, not a remote asset */}
        <img
          src={`data:image/png;base64,${pngBase64}`}
          alt="QR code — scan to open this event"
          className="w-64 h-64 print:w-80 print:h-80"
        />
        <p className="text-sm text-gray-600 mt-2">Scan to register</p>
      </section>

      {event.description && (
        <section>
          <h2 className="text-lg font-medium mb-2">About</h2>
          <p className="whitespace-pre-wrap text-gray-800">{event.description}</p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-2">Agenda</h2>
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

      <div className="print:hidden">
        <RegisterCard
          eventId={event.id}
          maxAttendees={event.max_attendees}
          currentCount={registrationCount ?? 0}
        />
      </div>

      <div className="flex justify-center print:hidden">
        <PrintPosterButton />
      </div>
    </main>
  );
}
