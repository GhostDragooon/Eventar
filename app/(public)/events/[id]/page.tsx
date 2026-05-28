import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import type { AgendaTopic } from '@/lib/agenda';
import { buildEventQrPng } from '@/lib/qr';
import RegisterCard from '@/components/RegisterCard';
import { PublicShell } from '@/components/shell/PublicShell';

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
      'id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees',
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

  // Registration count for the capacity check. Anon has no SELECT policy on
  // `registrations` (PII — full visibility is organizer/manager only), so the
  // count must come via service-role. The count is non-sensitive (just an
  // integer), so surfacing it on the public page is safe.
  const { count: registrationCount } = await supabaseAdmin()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id);

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const { pngBase64 } = await buildEventQrPng(
    { id: event.id, title: event.title },
    `${proto}://${host}`,
  );

  return (
    <PublicShell>
      <div className="w-full max-w-7xl mx-auto px-grid-margin pb-xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-xl md:gap-xxl">
          {/* Left 4 cols: indigo brand panel */}
          <aside className="md:col-span-4 bg-primary text-on-primary rounded-[20px] p-lg md:p-xl flex flex-col gap-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/0 to-primary-container/40 pointer-events-none" aria-hidden />
            <div className="relative z-10">
              {event.topic && (
                <span className="font-label-md text-label-md uppercase tracking-widest text-primary-fixed">
                  {event.topic}
                </span>
              )}
              <h1 className="font-display text-display text-on-primary mt-sm leading-[1.1]">
                {event.title}
              </h1>
            </div>
            <div className="relative z-10 flex flex-col gap-md mt-md border-t border-primary-fixed/20 pt-md">
              <InfoRow icon="calendar_month" label="When">
                <p className="font-body-lg text-body-lg">
                  {formatInTz(event.start_time, event.timezone)}
                </p>
                <p className="font-body-md text-body-md text-primary-fixed-dim">
                  → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
                </p>
              </InfoRow>
              <InfoRow icon="location_on" label="Where">
                <p className="font-body-lg text-body-lg">{event.venue_name}</p>
                {event.venue_address && (
                  <p className="font-body-md text-body-md text-primary-fixed-dim">
                    {event.venue_address}
                  </p>
                )}
                <p className="font-body-md text-body-md text-primary-fixed-dim">
                  {event.city}{event.region ? `, ${event.region}` : ''}, {event.country}
                </p>
              </InfoRow>
              {event.max_attendees != null && (
                <InfoRow icon="groups" label="Capacity">
                  <p className="font-body-lg text-body-lg">
                    {(registrationCount ?? 0)} / {event.max_attendees} registered
                  </p>
                </InfoRow>
              )}
            </div>
          </aside>

          {/* Right 8 cols: register CTA + about + agenda + QR */}
          <section className="md:col-span-8 space-y-md">
            <RegisterCard
              eventId={event.id}
              maxAttendees={event.max_attendees}
              currentCount={registrationCount ?? 0}
            />

            {event.description && (
              <ContentCard icon="description" iconBg="bg-tertiary-fixed" iconColor="text-tertiary" title="About">
                <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">
                  {event.description}
                </p>
              </ContentCard>
            )}

            {(blocks?.length ?? 0) > 0 && (
              <ContentCard icon="view_agenda" iconBg="bg-primary-fixed" iconColor="text-primary" title="Agenda">
                <ul className="divide-y divide-outline-variant -mx-lg -mb-lg mt-md">
                  {blocks!.map(b => {
                    const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
                    return (
                      <li key={b.id} className="px-lg py-md">
                        <div className="flex items-center justify-between flex-wrap gap-sm mb-xs">
                          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                            {b.kind}
                          </span>
                          <span className="font-body-md text-body-md text-on-surface-variant">
                            {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                          </span>
                        </div>
                        <p className="font-title-lg text-title-lg text-on-surface">{b.title}</p>
                        {b.host && (
                          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                            Chair: {b.host}
                          </p>
                        )}
                        {topics.length > 0 && (
                          <ul className="mt-sm font-body-md text-body-md text-on-surface space-y-xs">
                            {topics.map((t, i) => (
                              <li key={i}>
                                • {t.title} — <em>{t.speaker_name}</em>
                                {t.speaker_credential && (
                                  <span className="text-on-surface-variant"> ({t.speaker_credential})</span>
                                )}
                                {t.speaker_affiliation && (
                                  <span className="text-on-surface-variant">, {t.speaker_affiliation}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </ContentCard>
            )}

            <ContentCard icon="qr_code_2" iconBg="bg-secondary-fixed" iconColor="text-secondary" title="Share">
              <div className="flex items-center gap-md flex-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 data URL */}
                <img
                  src={`data:image/png;base64,${pngBase64}`}
                  alt="QR code for this event"
                  className="w-32 h-32 border border-outline-variant rounded-lg bg-surface-container-lowest p-xs"
                />
                <p className="font-body-md text-body-md text-on-surface-variant flex-1 min-w-[200px]">
                  Scan or share this code to open this event on another device.
                </p>
              </div>
            </ContentCard>

            <p className="font-body-md text-[12px] text-on-surface-variant italic px-md">
              Confirmation emails go live in phase 7. Reminders + survey in phase 9.
            </p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-md">
      <span className="material-symbols-outlined text-primary-fixed mt-[2px]" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="font-label-md text-label-md text-primary-fixed uppercase tracking-wider mb-xs">
          {label}
        </h3>
        {children}
      </div>
    </div>
  );
}

function ContentCard({
  icon,
  iconBg,
  iconColor,
  title,
  children,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
      <div className="flex items-center gap-md mb-md">
        <div aria-hidden className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg} ${iconColor}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <h2 className="font-headline-sm text-[20px] text-on-surface">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}
