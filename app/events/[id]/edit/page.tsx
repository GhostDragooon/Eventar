import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireStaff, NotAuthorizedError } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInTz } from '@/lib/tz';
import type { AgendaTopic } from '@/lib/agenda';
import { publishEvent } from './actions';
import { updateEvent } from './updateAction';
import DownloadQrButton from '@/components/DownloadQrButton';
import ExportRegistrantsButton from '@/components/ExportRegistrantsButton';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { StaffShell } from '@/components/shell/StaffShell';
import NewEventForm, {
  type InitialEvent,
  type InitialBlock,
  type SubmitPayload,
} from '@/app/events/new/NewEventForm';
import type { BlockKind, TopicDraft } from '@/components/event-form/AgendaSection';

export default async function StaffEventEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    if (e instanceof NotAuthorizedError) redirect('/login');
    throw e;
  }
  const { id } = await params;

  const supabase = await supabaseServer();
  const { data: event } = await supabase
    .from('events')
    .select('id, title, topic, start_time, end_time, timezone, venue_name, venue_address, city, region, country, latitude, longitude, description, status, max_attendees, created_by, hosted_by, organized_by, hero_image_url')
    .eq('id', id)
    .maybeSingle();
  if (!event) notFound();

  // Owner-only gate: /edit is the mutation surface (Publish, future field
  // edits). Per the 2026-06-02 access policy refinement, only the event
  // owner reaches this page; non-owners (other organisers via direct URL,
  // managers viewing on the dashboard) get bounced to /details which is
  // the read-only ops view. RLS would deny their UPDATEs anyway — this
  // just stops them from seeing a page their writes would silently fail.
  if (event.created_by !== staff.id) {
    redirect(`/events/${id}/details`);
  }

  // Read every column the form treats as full-replace input. Omitting any of
  // them and round-tripping to updateEvent would silently wipe the persisted
  // value (rule 12) — the RPC overwrites NULLable keys to NULL when absent.
  // - `notes` was previously omitted: a no-edit Save wrote '' over every
  //   organiser-authored block note.
  // - `display_order` was previously omitted and order came from `start_time`
  //   only: identical start times (or any future drift between persisted
  //   `display_order` and chronological order) would have shuffled blocks on
  //   save, since the form re-emits `display_order: i` from the in-memory
  //   array index. Ordering by `display_order` first pins the round-trip.
  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, kind, title, host, topics, notes, start_time, end_time, display_order')
    .eq('event_id', id)
    .order('display_order', { ascending: true })
    .order('start_time', { ascending: true });

  // Close gate for the CSV export: registration is "closed" when end_time has
  // passed OR capacity is reached. Service-role count mirrors the public page +
  // the exportRegistrantsCsv action's gate. Computing server-side so the button
  // renders disabled at first paint (no client-side flicker).
  const { count: registeredCount, error: countErr } = await supabaseAdmin()
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id);
  if (countErr) throw countErr;

  const ended = new Date(event.end_time).getTime() < new Date().getTime();
  const atCapacity =
    event.max_attendees != null && (registeredCount ?? 0) >= event.max_attendees;
  const registrationClosed = ended || atCapacity;

  return (
    <StaffShell staff={{ email: staff.email, role: staff.role }} backHref="/dashboard" backLabel="Dashboard">
      {/* Per patterns §8 the StaffShell's NAV owns all back-navigation; this
          header only carries the page title (no breadcrumb — that would
          duplicate the top NAV's "Back to Dashboard" link). */}
      <header className="mb-lg">
        <div className="flex items-center gap-md mb-sm flex-wrap">
          <StatusPill status={event.status} />
          {event.topic && (
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              {event.topic}
            </span>
          )}
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{event.title}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mt-sm">
          {formatInTz(event.start_time, event.timezone)} → {formatInTz(event.end_time, event.timezone)} ({event.timezone})
        </p>
      </header>

      {/* Draft state: render the generalized event form pre-filled with the
          stored values (Task D.3a). The form owns its own status/completion
          panel and Save Changes button; lifecycle (Publish) lives on a
          separate ActionCard in the right column so the form's "Save
          changes" stays purely about content edits. The D.3 plan requires
          publish to remain reachable from /edit while the event is a draft.
          Non-draft: keep the existing read-only + ActionCards sidebar
          layout untouched. */}
      {event.status === 'draft' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-grid-gutter items-start">
          <div className="lg:col-span-8 min-w-0">
            <DraftEditFormPanel event={event} blocks={blocks ?? []} />
          </div>
          <aside className="lg:col-span-4 lg:sticky lg:top-grid-margin space-y-md self-start">
            <ActionCard
              icon="publish"
              title="Ready to publish?"
              body="Publishing makes the registration page live. The QR also unlocks."
            >
              <form
                action={async () => {
                  'use server';
                  await publishEvent(event.id);
                }}
              >
                <button
                  type="submit"
                  className="w-full bg-tertiary text-on-tertiary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
                >
                  Publish event
                </button>
              </form>
            </ActionCard>
          </aside>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-grid-gutter">
        {/* Left (8 cols): event content */}
        <div className="lg:col-span-8 space-y-md">
          <Section icon="location_on" iconBg="bg-secondary-fixed" iconColor="text-secondary" title="Venue">
            <p className="font-body-md text-body-md text-on-surface">{event.venue_name}</p>
            {event.venue_address && (
              <p className="font-body-md text-body-md text-on-surface-variant">{event.venue_address}</p>
            )}
            <p className="font-body-md text-body-md text-on-surface-variant">
              {event.city}{event.region ? `, ${event.region}` : ''}, {event.country}
            </p>
          </Section>

          {event.description && (
            <Section icon="description" iconBg="bg-tertiary-fixed" iconColor="text-tertiary" title="About">
              <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap">
                {event.description}
              </p>
            </Section>
          )}

          {(blocks?.length ?? 0) > 0 && (
            <Section icon="view_agenda" iconBg="bg-primary-fixed" iconColor="text-primary" title="Agenda">
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
            </Section>
          )}

          {event.status !== 'draft' && (
            <p className="font-body-md text-[12px] text-on-surface-variant italic">
              Editing event details isn&apos;t available yet — this view is read-only.
              Need a change? Ask an admin.
            </p>
          )}
        </div>

        {/* Right (4 cols): sticky action panel */}
        <aside className="lg:col-span-4 lg:sticky lg:top-grid-margin space-y-md self-start">
          {event.status === 'draft' && (
            <ActionCard
              icon="publish"
              title="Ready to publish?"
              body="Publishing makes the registration page live. The QR also unlocks."
            >
              <form
                action={async () => {
                  'use server';
                  await publishEvent(event.id);
                }}
              >
                <button
                  type="submit"
                  className="w-full bg-tertiary text-on-tertiary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
                >
                  Publish event
                </button>
              </form>
            </ActionCard>
          )}

          {event.status === 'published' && (
            <>
              <ActionCard
                icon="public"
                title="Public page"
                body="Live and accepting registrations."
              >
                <Link
                  href={`/events/${event.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-xs font-label-md text-label-md text-primary hover:underline"
                >
                  View public page
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>open_in_new</span>
                </Link>
              </ActionCard>

              <ActionCard
                icon="dashboard"
                title="Operations"
                body="Registration progress, attendance, and live event status."
              >
                <Link
                  href={`/events/${event.id}/details`}
                  className="inline-flex items-center gap-xs font-label-md text-label-md text-primary hover:underline"
                >
                  View details
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
                </Link>
              </ActionCard>

              <ActionCard
                icon="analytics"
                title="Analytics"
                body="Registrations, attendance, and post-event survey results."
              >
                <Link
                  href={`/events/${event.id}/analytics`}
                  className="inline-flex items-center gap-xs font-label-md text-label-md text-primary hover:underline"
                >
                  View analytics
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
                </Link>
              </ActionCard>

              <ActionCard
                icon="qr_code_2"
                title="QR code"
                body="Anyone who scans this lands on the public registration page."
              >
                <div className="flex flex-wrap gap-sm items-center">
                  <DownloadQrButton eventId={event.id} />
                  <Link
                    href={`/events/${event.id}/poster`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-xs font-label-md text-label-md text-primary hover:underline"
                  >
                    View poster
                    <span className="material-symbols-outlined text-[16px]" aria-hidden>open_in_new</span>
                  </Link>
                </div>
              </ActionCard>

              <ActionCard
                icon="how_to_reg"
                title="On-site check-in"
                body="Tablet-friendly roster, QR scanner, manual mark-attended."
              >
                <Link
                  href={`/events/${event.id}/checkin`}
                  className="inline-flex items-center bg-tertiary text-on-tertiary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity"
                >
                  Open check-in
                </Link>
              </ActionCard>

              <ActionCard
                icon="download"
                title="Registrant export"
                body={
                  registrationClosed
                    ? `Registration closed (${atCapacity ? 'capacity reached' : 'event ended'}).`
                    : 'Available once registration closes (event ends or capacity is reached).'
                }
              >
                <ExportRegistrantsButton eventId={event.id} disabled={!registrationClosed} />
              </ActionCard>
            </>
          )}
        </aside>
      </div>
      )}
    </StaffShell>
  );
}

/**
 * Draft-state edit view: pre-fills the generalized NewEventForm with the
 * stored event row + agenda blocks, then dispatches save through the
 * updateEvent server action (which the form receives as a `submit` prop so
 * the form itself stays free of action-routing logic).
 *
 * Publish remains accessible from the read-only/non-draft side of this same
 * page once the user clicks "Save changes" — the form deliberately does NOT
 * send `status` (per updateAction.ts), so saving the form leaves the event
 * in draft. Lifecycle (publish) lives on the existing ActionCard surface for
 * non-draft views; for draft-state the user reaches publish via the dashboard
 * publish action (a follow-up D.3b will surface a "Save & publish" button
 * here on the form itself).
 */
function DraftEditFormPanel({
  event,
  blocks,
}: {
  event: {
    id: string;
    title: string;
    topic: string | null;
    description: string | null;
    max_attendees: number | null;
    start_time: string;
    end_time: string;
    venue_name: string;
    venue_address: string | null;
    city: string;
    region: string | null;
    country: string;
    latitude: number;
    longitude: number;
  };
  blocks: Array<{
    id: string;
    kind: string;
    title: string;
    host: string | null;
    topics: unknown;
    notes: string | null;
    start_time: string;
    end_time: string;
  }>;
}) {
  const initialEvent: InitialEvent = {
    title: event.title,
    topic: event.topic,
    description: event.description,
    max_attendees: event.max_attendees,
    start_time: event.start_time,
    end_time: event.end_time,
    venue_name: event.venue_name,
    venue_address: event.venue_address,
    city: event.city,
    region: event.region,
    country: event.country,
    latitude: event.latitude,
    longitude: event.longitude,
    // Wave 2 — supabase-js's generated types haven't picked up the new
    // jsonb columns yet; cast through unknown until typegen is rerun.
    hosted_by: (() => {
      const v = (event as unknown as { hosted_by?: unknown }).hosted_by;
      return Array.isArray(v) ? (v as Array<{ name: string; url?: string }>) : [];
    })(),
    organized_by: (() => {
      const v = (event as unknown as { organized_by?: unknown }).organized_by;
      return Array.isArray(v) ? (v as Array<{ name: string; url?: string }>) : [];
    })(),
    hero_image_url: (() => {
      const v = (event as unknown as { hero_image_url?: unknown }).hero_image_url;
      return typeof v === 'string' ? v : null;
    })(),
  };

  // Pass raw ISO strings + the rest of each row's fields; the form converts
  // them to HH:MM client-side so encode and decode share the browser's tz.
  // Doing the HH:MM derivation here would use the Vercel function's tz
  // (UTC), causing a silent tz drift on every no-edit Save.
  const initialBlocks: InitialBlock[] = blocks.map((b) => ({
    id: b.id,
    start_time: b.start_time,
    end_time: b.end_time,
    kind: b.kind as BlockKind,
    title: b.title,
    host: b.host,
    topics: (Array.isArray(b.topics) ? b.topics : []) as Array<Partial<TopicDraft>>,
    // Prefill from the row (nullable in the DB; the form converts to ''). A
    // no-edit Save would otherwise wipe organiser notes via the full-replace
    // payload — exactly the rule-12 silent-loss pattern.
    notes: b.notes,
  }));

  return (
    <NewEventForm
      mode="edit"
      eventId={event.id}
      initialEvent={initialEvent}
      initialBlocks={initialBlocks}
      submit={async (payload: SubmitPayload) => {
        'use server';
        return updateEvent(event.id, { event: payload.event, blocks: payload.blocks });
      }}
    />
  );
}

function Section({
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
      <div className="space-y-xs">{children}</div>
    </section>
  );
}

function ActionCard({
  icon,
  title,
  body,
  children,
}: {
  icon: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-md shadow-sm">
      <div className="flex items-start gap-sm mb-sm">
        <span className="material-symbols-outlined text-primary text-[20px] mt-[2px]" aria-hidden>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-title-lg text-[16px] text-on-surface leading-tight">{title}</h3>
          <p className="font-body-md text-[12px] text-on-surface-variant mt-xs">{body}</p>
        </div>
      </div>
      <div className="mt-sm">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-primary text-on-primary',
    draft: 'bg-surface-container-high text-on-surface-variant',
    completed: 'bg-secondary-fixed text-on-secondary-fixed',
  };
  const cls = styles[status] ?? styles.draft;
  return (
    <span className={`font-label-md text-label-md px-sm py-xs rounded-full uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}
