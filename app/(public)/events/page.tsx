import { supabaseServer } from '@/lib/supabase/server';
import { SiteShell } from '@/components/shell/SiteShell';
import { computeLifecycle, type EventLifecycleRow } from '@/lib/lifecycle/eventLifecycle';
import { EventsListClient, type PublicEventCard } from './EventsListClient';

export const metadata = {
  title: 'Upcoming events',
};

export const dynamic = 'force-dynamic';

// Public events list (final v15 — Design Session Log §"Events list"):
// centered header, sentence-case category tabs (area of profession) with an
// accent underline, single column of rich cards sorted soonest-first.
export default async function PublicEventsPage() {
  const supabase = await supabaseServer();
  // Session probe for the shell's state-aware CTA — signed-in visitors get
  // "Account" pointing at /account; anon gets "Sign in". Swallow-with-null
  // is intentional; the shell falls back to the signed-out CTA.
  // eslint-disable-next-line no-restricted-syntax -- no-session is a valid public state
  const { data: authRes } = await supabase.auth.getUser();
  const signedIn = Boolean(authRes?.user);
  // Anon RLS exposes published events only; deleted_at filter is defense in
  // depth for the review-mode service-role client.
  // Thrown, not swallowed (rule 12): a discarded error rendered the "no
  // upcoming events" empty state, telling the public this organiser runs
  // nothing when the truth was that the list failed to load.
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, description, status, start_time, end_time, timezone, venue_name, city, category, registration_close_at, registration_open_at, hosted_by, organized_by, deleted_at')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('start_time', { ascending: true })
    .limit(100);
  if (eventsErr) throw eventsErr;

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  type PartnerEntry = { name?: string } | string;
  const names = (v: unknown): string[] =>
    Array.isArray(v)
      ? (v as PartnerEntry[])
          .map((p) => (typeof p === 'string' ? p : p?.name ?? ''))
          .filter(Boolean)
      : [];

  const cards: PublicEventCard[] = (events ?? [])
    .map((e) => ({ e, lifecycle: computeLifecycle(e as EventLifecycleRow, nowMs) }))
    .filter(({ lifecycle }) => lifecycle === 'registering' || lifecycle === 'upcoming' || lifecycle === 'live')
    .map(({ e, lifecycle }) => {
      const start = new Date(e.start_time);
      const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: e.timezone }).format(start);
      const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: e.timezone }).format(start);
      const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: e.timezone }).format(start);
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        category: e.category,
        day,
        month,
        time,
        venue: [e.venue_name, e.city].filter(Boolean).join(', '),
        organizers: [...names(e.hosted_by), ...names(e.organized_by)].slice(0, 3),
        lifecycle,
      };
    });

  return (
    <SiteShell active="events" signedIn={signedIn}>
      <div className="max-w-[860px] mx-auto px-grid-margin py-xl">
        <header className="text-center mb-lg">
          <p className="text-label-md font-semibold uppercase tracking-[0.18em] text-[color:var(--on-primary-container)] mb-xs">Events</p>
          <h1 className="text-[calc(34px*var(--text-scale))] font-extrabold tracking-[-0.03em] text-on-surface mb-xs">Upcoming events</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Open programmes across the professions — register in under a minute.
          </p>
        </header>

        <EventsListClient events={cards} />
      </div>
    </SiteShell>
  );
}
