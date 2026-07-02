import { notFound, redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AgendaTopic } from '@/lib/agenda';
import { buildEventQrPng } from '@/lib/qr';
import { getRequestOrigin } from '@/lib/origin';
import RegisterCard from '@/components/RegisterCard';
import { PublicShell } from '@/components/shell/PublicShell';
import { StatusPill } from '@/components/lifecycle/StatusPill';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';

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
      'id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, description, status, max_attendees, registration_close_at, registration_open_at, hosted_by, organized_by, hero_image_url, created_by',
    )
    .eq('id', id)
    .maybeSingle();

  // Draft handling: anon visitors and non-owners hit 404 as before. The
  // event's OWNER (and managers) silently bounce to /edit so a freshly-
  // created draft they navigated to via the public URL doesn't dead-end.
  // Pre-existing UX bug: clicking the public link for a draft 404'd everyone,
  // including the staff member who just created it.
  if (!event) notFound();
  if (event.status !== 'published') {
    let isOwnerOrManager = false;
    try {
      const staff = await requireStaff(supabase);
      isOwnerOrManager =
        event.created_by === staff.id || staff.role === 'manager';
    } catch (e) {
      if (!(e instanceof NotAuthorizedError)) throw e;
    }
    if (isOwnerOrManager) {
      redirect(`/events/${id}/edit`);
    }
    notFound();
  }

  // Form layer of the registration-window gate: RegisterCard swaps the form
  // for a closed/ended notice outside the 'registering' state. The Server
  // Action enforces the same boundary, so a stale page can't re-open it.
  // eslint-disable-next-line react-hooks/purity
  const lifecycle = computeLifecycle(event as EventLifecycleRow, Date.now());

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

  // Origin via NEXT_PUBLIC_SITE_URL (with header fallback in dev) — prevents
  // host-header spoofing from poisoning the QR URL. See lib/origin.ts.
  const origin = await getRequestOrigin();
  const { pngBase64 } = await buildEventQrPng(
    { id: event.id, title: event.title },
    origin,
  );

  // §1 event-meta: row 1 = address (muted), row 2 = date + time (date accented).
  const dateLabel = formatDate(event.start_time, event.timezone);
  const timeLabel = formatTimeRange(event.start_time, event.end_time, event.timezone);
  // §9: capacity dropped from meta line — capacity context lives in the
  // lifecycle pill / register card. The §7a "one color per concept" rule
  // forbids re-using accent blue here for anything other than the date.

  const heroImageUrl =
    (event as unknown as { hero_image_url?: string | null }).hero_image_url ?? null;

  return (
    <PublicShell>
      {/* Wave 3 — hero backdrop. Full-width band, image when uploaded,
          accent-tinted palette fallback otherwise. No overlay text — the
          existing event-meta block below is the source of truth for title
          + date + venue (per user direction, hero is just a visual). */}
      <div
        aria-hidden
        className="w-full h-[200px] sm:h-[280px] bg-surface-container"
        style={
          heroImageUrl
            ? {
                backgroundImage: `url(${heroImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {
                backgroundImage:
                  'linear-gradient(180deg, var(--tertiary-fixed) 0%, var(--surface-container) 100%)',
              }
        }
      />

      {/* §5 equal-gap rhythm: 480px column, every direct child shares 24px gap.
          Container padding matches the gap so page edges share the rhythm. */}
      <div className="mx-auto flex w-full max-w-md flex-col gap-lg px-grid-margin py-xxl">
        {/* §9 status pill, top-left of its container, leading the title row. */}
        <StatusPill lifecycle={lifecycle} />

        {/* §1 hero + 2-row event meta */}
        <header className="flex flex-col gap-sm">
          <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
            {event.title}
          </h1>
          <div className="flex flex-col gap-xs">
            <p className="font-body-md text-body-md text-on-surface-variant m-0">
              {event.venue_name}
              {event.venue_address ? ` · ${event.venue_address}` : ''}
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant m-0">
              <span className="text-on-primary-container font-semibold">{dateLabel}</span>
              {' · '}
              {timeLabel} ({event.timezone})
            </p>
          </div>
        </header>

        {/* Wave 2 — Hosted by / Organized by strip. Renders only when the
            organizer added partners. Each partner is a name (optionally
            linked to the partner's site). Empty arrays hide the whole strip. */}
        <PartnerStrip
          hostedBy={(event as unknown as { hosted_by?: unknown }).hosted_by}
          organizedBy={(event as unknown as { organized_by?: unknown }).organized_by}
        />

        {/* §3 description: split into <p> per sentence so line-height carries
            the rhythm. Empty-line splits in the source kept as paragraph breaks. */}
        {event.description && (
          <div className="flex flex-col gap-0">
            {splitSentences(event.description).map((s, i) => (
              <p key={i} className="font-body-md text-body-md text-on-surface m-0">
                {s}
              </p>
            ))}
          </div>
        )}

        {(blocks?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-md">
            <h2 className="font-title-lg text-title-lg text-on-surface m-0">Agenda</h2>
            <ul className="flex flex-col gap-md m-0 p-0 list-none">
              {blocks!.map(b => {
                const topics = (Array.isArray(b.topics) ? b.topics : []) as AgendaTopic[];
                return (
                  <li key={b.id} className="flex gap-md">
                    <span
                      className="font-mono text-label-md text-on-primary-container shrink-0 mt-[2px]"
                      style={{ minWidth: 64 }}
                    >
                      {formatClock(b.start_time, event.timezone)}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col gap-xs">
                      <p className="font-body-md text-body-md font-semibold text-on-surface m-0">
                        {b.title}
                      </p>
                      {b.host && (
                        <p className="font-body-md text-body-md text-on-surface-variant m-0">
                          Chair: {b.host}
                        </p>
                      )}
                      {topics.length > 0 && (
                        <ul className="flex flex-col gap-xs m-0 p-0 list-none">
                          {topics.map((t, i) => (
                            <li key={i} className="font-body-md text-body-md text-on-surface m-0">
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <RegisterCard
          eventId={event.id}
          maxAttendees={event.max_attendees}
          currentCount={registrationCount ?? 0}
          lifecycle={lifecycle}
        />

        {/* Share QR — compact, sits inside the rhythm; no separate card chrome. */}
        <section className="flex items-center gap-md">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 data URL */}
          <img
            src={`data:image/png;base64,${pngBase64}`}
            alt="QR code for this event"
            className="w-24 h-24 border border-outline-variant rounded-lg bg-surface-container-lowest p-xs"
          />
          <p className="font-body-md text-body-md text-on-surface-variant m-0 flex-1 min-w-0">
            Scan or share this code to open this event on another device.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}

// ─── tz-aware formatters (small, file-local — same pattern as EventBand) ────

function formatDate(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: tz,
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.weekday} ${m.day} ${m.month}`;
}

function formatClock(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).formatToParts(new Date(iso));
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.hour}:${m.minute}`;
}

function formatTimeRange(startIso: string, endIso: string, tz: string): string {
  return `${formatClock(startIso, tz)}–${formatClock(endIso, tz)}`;
}

// Description sentence split. Splits on period followed by space + capital,
// preserving the period. Single-sentence input passes through as one <p>.
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Split on hard line breaks first (author's intent), then on sentence boundary.
  return trimmed
    .split(/\n+/)
    .flatMap(para => para.split(/(?<=\.)\s+(?=[A-Z])/))
    .map(s => s.trim())
    .filter(Boolean);
}

// ─── Wave 2 partner strip ───────────────────────────────────────────────

type PartnerEntry = { name: string; url?: string };

function normalizePartners(raw: unknown): PartnerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is { name?: unknown; url?: unknown } =>
        typeof r === 'object' && r !== null,
    )
    .map((r) => ({
      name: typeof r.name === 'string' ? r.name.trim() : '',
      url: typeof r.url === 'string' && r.url.trim() !== '' ? r.url.trim() : undefined,
    }))
    .filter((r) => r.name !== '');
}

function PartnerStrip({
  hostedBy,
  organizedBy,
}: {
  hostedBy: unknown;
  organizedBy: unknown;
}) {
  const hosts = normalizePartners(hostedBy);
  const orgs = normalizePartners(organizedBy);
  if (hosts.length === 0 && orgs.length === 0) return null;
  return (
    <section
      aria-label="Hosts and organizers"
      className="flex flex-col gap-sm border-t border-outline-variant pt-md"
    >
      {hosts.length > 0 && (
        <PartnerRow label="Hosted by" partners={hosts} />
      )}
      {orgs.length > 0 && (
        <PartnerRow label="Organized by" partners={orgs} />
      )}
    </section>
  );
}

function PartnerRow({
  label,
  partners,
}: {
  label: string;
  partners: PartnerEntry[];
}) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-x-md gap-y-xs">
        {partners.map((p, i) => (
          <span key={i} className="font-body-md text-body-md text-on-surface">
            {p.url ? (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-tertiary hover:underline"
              >
                {p.name}
              </a>
            ) : (
              p.name
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
