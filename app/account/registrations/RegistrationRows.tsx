import Link from 'next/link';
import { formatInTz } from '@/lib/tz';
import { CHECKIN_OPEN_MINUTES } from '@/lib/lifecycle/eventLifecycle';
import type { AttendanceRecordView } from '../schema';

// Shared by Registrations and Check-in (attendee pages, UX-02 shell). Presentational: no data access, no client
// state. List style is app/account/record/RecordClient.tsx's, copied on purpose (convention beats novelty).

const PRIMARY =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-lg font-label-md text-label-md text-on-primary hover:opacity-90';
const OUTLINE =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-outline-variant px-lg font-label-md text-label-md text-on-surface hover:bg-surface-container-high';

export const passHref = (code: string) => `/checkin/confirm?code=${encodeURIComponent(code)}`;

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="space-y-xs">
      <h1 className="m-0 font-headline-lg text-headline-lg text-on-surface">{title}</h1>
      <p className="m-0 font-body-md text-body-md text-on-surface-variant">{lead}</p>
    </header>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg shadow-sm">
      <h2 className="mb-md font-headline-sm text-[calc(20px*var(--text-scale))] text-on-surface">{title}</h2>
      {children}
    </section>
  );
}

export function LoadFailed() {
  return (
    <p role="alert" className="m-0 rounded-lg bg-error-container px-md py-sm font-body-md text-body-md text-on-error-container">
      Your registrations could not be loaded just now. Reload the page to try again.
    </p>
  );
}

/** The empty state: where you are, what to do, where it goes next. One primary action. */
export function EmptyState({ children, action }: { children: React.ReactNode; action: { href: string; label: string } }) {
  return (
    <Section title="Nothing here yet">
      <p className="m-0 mb-md font-body-md text-body-md text-on-surface-variant">{children}</p>
      <Link href={action.href} className={PRIMARY}>
        {action.label}
      </Link>
    </Section>
  );
}

export function Rows({ items, mode, nowMs }: { items: AttendanceRecordView[]; mode: 'list' | 'pass'; nowMs: number }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-md p-0">
      {items.map((r) => (
        <Row key={r.registration_id} r={r} mode={mode} nowMs={nowMs} />
      ))}
    </ul>
  );
}

function Row({ r, mode, nowMs }: { r: AttendanceRecordView; mode: 'list' | 'pass'; nowMs: number }) {
  const tz = r.event_timezone ?? 'UTC';
  const startMs = r.event_start ? new Date(r.event_start).getTime() : 0;
  const open = nowMs >= startMs - CHECKIN_OPEN_MINUTES * 60_000;
  const attended = r.status === 'attended';
  const status = attended ? 'You are checked in' : open ? 'Check-in is open' : null;
  const opensAt = !open && r.event_start ? formatInTz(new Date(startMs - CHECKIN_OPEN_MINUTES * 60_000).toISOString(), tz) : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-md border-b border-outline-variant pb-md last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-60 space-y-xs">
        <p className="m-0 font-title-md text-title-md text-on-surface">
          <Link href={`/events/${r.event_id}`} className="hover:underline">
            {r.event_title ?? 'Event removed'}
          </Link>
        </p>
        {r.event_start && (
          <p className="m-0 font-body-md text-body-md text-on-surface-variant">{formatInTz(r.event_start, tz)}</p>
        )}
        <p className="m-0 font-body-md text-body-md text-on-surface-variant">
          {status ?? (mode === 'pass' ? `Check-in opens at ${opensAt}` : 'Registered')}
        </p>
      </div>
      {mode === 'pass' && !attended && (
        <Link href={passHref(r.registration_code)} className={open ? PRIMARY : OUTLINE}>
          Show my pass
        </Link>
      )}
      {mode === 'list' && open && !attended && (
        <Link href={passHref(r.registration_code)} className={PRIMARY}>
          Show my pass
        </Link>
      )}
    </li>
  );
}

export { OUTLINE as OUTLINE_LINK };
