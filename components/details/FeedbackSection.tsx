import Link from 'next/link';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import type { LeadingSession } from '@/lib/details/leadingSession';
import { SectionShell, SectionStub } from './SectionChrome';

type Props = {
  lifecycle: Lifecycle;
  eventId: string;
  responseCount: number;
  attended: number;
  // G1: modal Q2 answer joined to agenda_blocks.title. `null` when
  // responseCount = 0 or no Q2 answers were recorded.
  leadingSession: LeadingSession | null;
  endTime: string;
  timezone: string;
  // Section-scoped operations (e.g. "Send survey invites" once completed).
  actionSlot?: React.ReactNode;
};

// Section 03 — Feedback. One-line stub until the event wraps (survey opens
// 10 minutes after end); full card once completed.
export function FeedbackSection({
  lifecycle,
  eventId,
  responseCount,
  attended,
  leadingSession,
  endTime,
  timezone,
  actionSlot,
}: Props) {
  if (lifecycle === 'cancelled') {
    return <SectionStub index="03" title="Feedback" detail="cancelled — no survey" />;
  }

  if (lifecycle !== 'completed') {
    return (
      <SectionStub
        index="03"
        title="Feedback"
        detail={`opens ${fmtHM(new Date(endTime).getTime() + 10 * 60_000, timezone)}`}
        meta="10 min after wrap"
      />
    );
  }

  return (
    <SectionShell
      index="03"
      title="Feedback"
      meta={attended > 0 ? `${responseCount} of ${attended} responded` : 'no attendees'}
    >
      <div className="flex flex-col gap-md">
        <div>
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
            Response rate
          </p>
          <p className="font-title-lg text-title-lg text-on-surface">
            {responseCount} of {attended}
            {attended > 0 && (
              <span className="text-on-surface-variant ml-xs">
                ({Math.round((responseCount / attended) * 100)}%)
              </span>
            )}
          </p>
        </div>

        {/* G1: leading-session readout — replaces the dead "Latest highlight"
            quote. Renders only when we have a modal answer to surface. */}
        {leadingSession != null && (
          <div>
            <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Leading session
            </p>
            <p className="font-title-lg text-title-lg text-on-surface">
              {leadingSession.kind === 'overall'
                ? 'General sessions / overall'
                : leadingSession.title}
            </p>
          </div>
        )}

        <div className="flex items-center gap-sm flex-wrap">
          <Link
            href={`/events/${eventId}/analytics`}
            className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>
              insights
            </span>
            View full analytics
          </Link>
          {actionSlot}
        </div>
      </div>
    </SectionShell>
  );
}

function fmtHM(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(ms);
}
