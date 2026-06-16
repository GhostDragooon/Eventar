import Link from 'next/link';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import type { SectionState } from '@/lib/lifecycle/sectionState';
import type { LeadingSession } from '@/lib/details/leadingSession';

// E.3 rework: the latest-comment quote died with key_highlights (G1 — Q2 is
// now session multiple-choice); the redesign replaces it with a
// leading-session readout built from valuable_block_id.
type Props = {
  lifecycle: Lifecycle;
  state: SectionState;
  eventId: string;
  responseCount: number;
  attended: number;
  // G1: modal Q2 answer joined to agenda_blocks.title. `null` when
  // responseCount = 0 or no Q2 answers were recorded.
  leadingSession: LeadingSession | null;
};

export function FeedbackSection({
  lifecycle,
  state,
  eventId,
  responseCount,
  attended,
  leadingSession,
}: Props) {
  // patterns §7a — monochrome ladder. Same wrapper recipe as the other sections.
  const wrapperClass =
    state === 'active'
      ? 'bg-surface-container-lowest border-2 border-primary rounded-[20px] p-lg shadow-sm mb-lg'
      : state === 'locked'
        ? 'bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg opacity-60'
        : 'bg-surface-container-low border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg';

  return (
    <section className={wrapperClass}>
      <div className="flex items-center gap-sm mb-md">
        <span
          className="material-symbols-outlined text-primary bg-primary-container p-xs rounded-md"
          aria-hidden
        >
          chat
        </span>
        <h2 className="font-title-lg text-title-lg text-on-surface">Feedback</h2>
      </div>

      {lifecycle !== 'completed' && (
        <p className="font-body-md text-body-md text-on-surface-variant">
          Survey opens 10 minutes after event ends.
        </p>
      )}

      {lifecycle === 'completed' && (
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

          <Link
            href={`/events/${eventId}/analytics`}
            className="self-start flex items-center gap-sm bg-tertiary text-on-tertiary px-lg py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              insights
            </span>
            View full analytics
          </Link>
        </div>
      )}
    </section>
  );
}
