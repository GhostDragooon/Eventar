import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { buildEventQrPng } from '@/lib/qr';
import { getRequestOrigin } from '@/lib/origin';
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

  // Origin via NEXT_PUBLIC_SITE_URL (with header fallback in dev) — prevents
  // host-header spoofing from poisoning the QR URL. See lib/origin.ts.
  const origin = await getRequestOrigin();

  const { pngBase64 } = await buildEventQrPng(
    { id: event.id, title: event.title },
    origin,
  );

  return (
    <main className="max-w-3xl mx-auto p-grid-margin space-y-xl bg-background print:p-0 print:max-w-none print:bg-white">
      {/* Locks print margins so the poster looks the same out of Chrome, Safari, and Firefox. */}
      <style>{`@page { size: A4; margin: 16mm; }`}</style>
      <header className="text-center">
        <p className="font-label-md text-label-md uppercase tracking-widest text-primary">
          {event.topic ?? 'Event'}
        </p>
        <h1 className="font-display text-display text-on-surface mt-sm print:text-4xl">{event.title}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-md">
          {formatInTz(event.start_time, event.timezone)} →{' '}
          {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs flex items-center justify-center gap-xs">
          <span className="material-symbols-outlined text-[18px] print:hidden" aria-hidden>location_on</span>
          {event.venue_name}
          {event.venue_address ? `, ${event.venue_address}` : ''} — {event.city}
          {event.region ? `, ${event.region}` : ''}, {event.country}
        </p>
      </header>

      <section className="flex flex-col items-center">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-md print:border-0 print:p-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 data URL, not a remote asset */}
          <img
            src={`data:image/png;base64,${pngBase64}`}
            alt="QR code — scan to open this event"
            className="w-64 h-64 print:w-80 print:h-80"
          />
        </div>
        <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mt-sm">
          Scan to register
        </p>
      </section>

      {event.description && (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg print:border-0 print:p-0">
          <h2 className="font-headline-sm text-[20px] text-on-surface mb-sm">About</h2>
          <p className="font-body-md text-body-md whitespace-pre-wrap text-on-surface">{event.description}</p>
        </section>
      )}

      {(blocks?.length ?? 0) > 0 && (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg print:border-0 print:p-0">
          <h2 className="font-headline-sm text-[20px] text-on-surface mb-md">Agenda</h2>
          <ul className="divide-y divide-outline-variant">
            {blocks!.map(b => {
              const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
              return (
                <li key={b.id} className="py-md first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between flex-wrap gap-sm">
                    <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">{b.kind}</span>
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                    </span>
                  </div>
                  <p className="font-title-lg text-title-lg text-on-surface mt-xs">{b.title}</p>
                  {b.host && <p className="font-body-md text-body-md text-on-surface-variant">Chair: {b.host}</p>}
                  {topics.length > 0 && (
                    <ul className="mt-sm font-body-md text-body-md text-on-surface space-y-xs">
                      {topics.map((t, i) => (
                        <li key={i}>
                          • {t.title} — <em>{t.speaker_name}</em>
                          {t.speaker_credential && <span className="text-on-surface-variant"> ({t.speaker_credential})</span>}
                          {t.speaker_affiliation && <span className="text-on-surface-variant">, {t.speaker_affiliation}</span>}
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
