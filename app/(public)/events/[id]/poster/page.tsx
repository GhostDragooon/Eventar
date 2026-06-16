import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatInTz } from '@/lib/tz';
import { buildEventQrPng } from '@/lib/qr';
import { getRequestOrigin } from '@/lib/origin';
import { deriveSpeakerNames, type AgendaTopic } from '@/lib/agenda';
import RegisterCard from '@/components/RegisterCard';
import PrintPosterButton from '@/components/PrintPosterButton';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';

export const dynamic = 'force-dynamic';

/**
 * deriveInitials — first letter of first word + first letter of last word, both
 * uppercased. Single word → first letter only. Empty / whitespace-only → "?".
 * Co-located: one-off, used only on the avatar tile below; doesn't justify a
 * lib export per Rule 2 ("no abstractions for single-use code").
 */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}

// PO-scoped, light-always tokens. NOT in app/globals.css and NOT in the dark
// media block: the poster prints on paper — it must stay light regardless of
// OS theme. Band color chosen as primary black (#0A0A0A) for maximum print
// contrast and per §7a (accent blue is reserved for "active focus", not
// headline chrome).
const POSTER_TOKENS = `
  --po-bg: #FFFFFF;
  --po-surface: #FAFAFA;
  --po-fg: #0A0A0A;
  --po-muted: #525252;
  --po-divider: #EAEAEA;
  --po-accent: #0A0A0A;
  --po-accent-fg: #FFFFFF;
  --po-accent-soft: #F4F4F5;
  --po-dot: #E5E5E5;
`;

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
      'id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees, registration_close_at',
    )
    .eq('id', id)
    .maybeSingle();

  // RLS filters to status='published' for anon; this 404s drafts + non-existent.
  // Defense-in-depth status check matches the existing /events/[id] page.
  if (!event || event.status !== 'published') notFound();

  // Same form-layer registration-window gate as the public event page.
  // eslint-disable-next-line react-hooks/purity
  const lifecycle = computeLifecycle(event as EventLifecycleRow, Date.now());

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

  const speakers = deriveSpeakerNames(blocks ?? []);
  const visibleSpeakers = speakers.slice(0, 3);
  const extraSpeakers = Math.max(0, speakers.length - 3);

  // §1 event-meta-derived formatters: date in row, time range in row, venue
  // in row, seats only when set. Hairline divider between fields — no "·".
  const dateLabel = formatInTz(event.start_time, event.timezone);
  const timeLabel = `${formatInTz(event.start_time, event.timezone)} → ${formatInTz(event.end_time, event.timezone)} (${event.timezone})`;
  const venueLabel = [
    event.venue_name,
    event.venue_address,
    [event.city, event.region, event.country].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
  // G12: NO "Free ·" prefix. Seats line only when capacity is set.
  const seatsLabel = event.max_attendees != null ? `${event.max_attendees} seats` : null;

  // G7: full event URL printed in the footer for accessibility — no short links.
  const eventUrl = `${origin}/events/${event.id}`;

  return (
    <>
      {/* Locks print margins so the poster looks the same out of Chrome,
          Safari, and Firefox. */}
      <style>{`@page { size: A4; margin: 16mm; }`}</style>
      {/* PO-scoped light-always tokens. Cascade applies to descendants only. */}
      <style>{`.po-root { ${POSTER_TOKENS} }`}</style>

      <main
        className="po-root relative min-h-screen bg-[var(--po-bg)] text-[var(--po-fg)] print:bg-white"
      >
        {/* Dot-grid background — subtle, on second look. Kept at very low
            opacity in print to preserve ink. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 print:opacity-25"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, var(--po-dot) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        />
        {/* Corner-shape decorative chrome — thin L-brackets, screen only.
            Off in print to keep the page disciplined on paper. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-[160px] w-[160px] border-l-2 border-t-2 border-[var(--po-accent)] opacity-25 print:hidden"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 h-[160px] w-[160px] border-b-2 border-r-2 border-[var(--po-accent)] opacity-25 print:hidden"
        />

        <div className="mx-auto flex max-w-3xl flex-col gap-xl p-grid-margin print:max-w-none print:p-0 print:gap-lg">
          {/* Eventar wordmark — centered above the band so the brand sits
              consistently across every surface (revised §8). Small + muted
              on the poster so the event identity in the band stays primary. */}
          <p
            aria-label="Eventar"
            className="m-0 text-center text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--po-muted)]"
          >
            Eventar
          </p>

          {/* ── Accent header band ─────────────────────────────────────────
              Primary-black band with title block on the left and white QR
              card on the top-right. The QR's lifecycle-aware caption stays
              with the QR. */}
          <header className="rounded-2xl bg-[var(--po-accent)] text-[var(--po-accent-fg)] p-lg print:rounded-none print:p-md">
            <div className="flex flex-col gap-md md:flex-row md:items-start md:justify-between print:flex-row print:items-start print:justify-between">
              <div className="flex min-w-0 flex-col gap-sm">
                <p className="m-0 font-label-md text-label-md uppercase tracking-widest opacity-80">
                  {event.topic ?? 'Event'}
                </p>
                <h1 className="m-0 font-display text-display leading-tight print:text-4xl">
                  {event.title}
                </h1>
                <p className="m-0 font-body-lg text-body-lg opacity-90">
                  {dateLabel}
                </p>
                <p className="m-0 font-body-md text-body-md opacity-80">
                  {event.venue_name}
                  {event.venue_address ? `, ${event.venue_address}` : ''}
                </p>
              </div>
              {/* White QR card — rounded, drops shadow on screen, clean on print. */}
              <div className="flex flex-col items-center gap-xs rounded-xl bg-white p-md text-[var(--po-fg)] shadow-sm print:shadow-none">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 data URL, not a remote asset */}
                <img
                  src={`data:image/png;base64,${pngBase64}`}
                  alt="QR code — scan to open this event"
                  className="h-40 w-40 print:h-44 print:w-44"
                />
                <p className="m-0 font-label-md text-label-md uppercase tracking-wider text-[var(--po-muted)]">
                  {lifecycle === 'registering' ? 'Scan to register' : 'Scan for event details'}
                </p>
              </div>
            </div>
          </header>

          {/* ── Divided info strip ─────────────────────────────────────────
              Hairline dividers between fields (border-l), never a "·" char.
              Seats field only present when max_attendees is set (G12). */}
          <section
            aria-label="Event details"
            className="flex flex-col divide-y divide-[var(--po-divider)] rounded-xl border border-[var(--po-divider)] bg-[var(--po-surface)] md:flex-row md:divide-x md:divide-y-0 print:flex-row print:divide-x print:divide-y-0 print:rounded-none print:border-y print:border-x-0 print:bg-transparent"
          >
            <InfoCell label="Date" value={dateLabel} />
            <InfoCell label="Time" value={timeLabel} />
            <InfoCell label="Venue" value={venueLabel} />
            {seatsLabel && <InfoCell label="Capacity" value={seatsLabel} />}
          </section>

          {/* ── 3-up speaker cards ─────────────────────────────────────────
              Gated by deriveSpeakerNames(blocks).length > 0. Always 3
              columns in print so the layout doesn't reflow off-paper. */}
          {visibleSpeakers.length > 0 && (
            <section className="flex flex-col gap-md">
              <h2 className="m-0 font-title-lg text-title-lg">Speakers</h2>
              <ul
                className={[
                  'grid list-none gap-md p-0',
                  visibleSpeakers.length === 1 && 'grid-cols-1 md:grid-cols-1',
                  visibleSpeakers.length === 2 && 'grid-cols-1 md:grid-cols-2',
                  visibleSpeakers.length >= 3 && 'grid-cols-1 md:grid-cols-3',
                  'print:grid-cols-3',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {visibleSpeakers.map((name, i) => (
                  <li
                    key={i}
                    className="flex flex-col items-center gap-sm rounded-xl border border-[var(--po-divider)] bg-white p-md text-center print:rounded-none"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--po-accent-soft)] text-lg font-semibold text-[var(--po-accent)]"
                    >
                      {deriveInitials(name)}
                    </span>
                    <p className="m-0 font-body-md text-body-md font-semibold text-[var(--po-fg)]">
                      {name}
                    </p>
                  </li>
                ))}
              </ul>
              {extraSpeakers > 0 && (
                <p className="m-0 text-center font-label-md text-label-md uppercase tracking-wider text-[var(--po-muted)]">
                  + {extraSpeakers} more
                </p>
              )}
            </section>
          )}

          {/* ── About ─────────────────────────────────────────────────────── */}
          {event.description && (
            <section className="flex flex-col gap-sm rounded-xl border border-[var(--po-divider)] bg-[var(--po-surface)] p-lg print:rounded-none print:border-0 print:bg-transparent print:p-0">
              <h2 className="m-0 font-title-lg text-title-lg">About</h2>
              <p className="m-0 whitespace-pre-wrap font-body-md text-body-md text-[var(--po-fg)]">
                {event.description}
              </p>
            </section>
          )}

          {/* ── Agenda ─────────────────────────────────────────────────────
              Restyled to PO tokens — no M3-indigo accents. */}
          {(blocks?.length ?? 0) > 0 && (
            <section className="flex flex-col gap-md rounded-xl border border-[var(--po-divider)] bg-[var(--po-surface)] p-lg print:rounded-none print:border-0 print:bg-transparent print:p-0">
              <h2 className="m-0 font-title-lg text-title-lg">Agenda</h2>
              <ul className="m-0 list-none divide-y divide-[var(--po-divider)] p-0">
                {blocks!.map(b => {
                  const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
                  return (
                    <li key={b.id} className="py-md first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-sm">
                        <span className="font-label-md text-label-md uppercase tracking-wider text-[var(--po-muted)]">
                          {b.kind}
                        </span>
                        <span className="font-body-md text-body-md text-[var(--po-muted)]">
                          {formatInTz(b.start_time, event.timezone)} → {formatInTz(b.end_time, event.timezone)}
                        </span>
                      </div>
                      <p className="mt-xs font-title-lg text-title-lg text-[var(--po-fg)]">{b.title}</p>
                      {b.host && (
                        <p className="font-body-md text-body-md text-[var(--po-muted)]">
                          Chair: {b.host}
                        </p>
                      )}
                      {topics.length > 0 && (
                        <ul className="mt-sm space-y-xs font-body-md text-body-md text-[var(--po-fg)]">
                          {topics.map((t, i) => (
                            <li key={i}>
                              • {t.title} — <em>{t.speaker_name}</em>
                              {t.speaker_credential && (
                                <span className="text-[var(--po-muted)]"> ({t.speaker_credential})</span>
                              )}
                              {t.speaker_affiliation && (
                                <span className="text-[var(--po-muted)]">, {t.speaker_affiliation}</span>
                              )}
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

          {/* ── Footer: real event URL (G7 — no short links) ──────────────── */}
          <footer className="text-center">
            <p className="m-0 font-mono text-xs text-[var(--po-muted)]">{eventUrl}</p>
          </footer>

          {/* ── Screen-only registration affordance + print button ─────────
              Lifecycle-aware: when closed, RegisterCard renders the closed
              notice instead of the form. Hidden in print so the printed
              poster carries only the QR + URL as the call-to-action. */}
          <div className="print:hidden">
            <RegisterCard
              eventId={event.id}
              maxAttendees={event.max_attendees}
              currentCount={registrationCount ?? 0}
              lifecycle={lifecycle}
            />
          </div>

          <div className="flex justify-center print:hidden">
            <PrintPosterButton />
          </div>
        </div>
      </main>
    </>
  );
}

// Single field in the divided info strip. Hairline dividers come from the
// parent's divide-{x|y} utility — InfoCell itself has no border so the
// strip stays one continuous shape.
function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-xs px-md py-sm">
      <span className="font-label-md text-label-md uppercase tracking-widest text-[var(--po-muted)]">
        {label}
      </span>
      <span className="font-body-md text-body-md text-[var(--po-fg)]">{value}</span>
    </div>
  );
}
