import Link from 'next/link';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

// E.3 rework: the latest-comment quote died with key_highlights (G1 — Q2 is
// now session multiple-choice); the redesign replaces it with a
// leading-session readout built from valuable_block_id.
type Props = {
  lifecycle: Lifecycle;
  eventId: string;
  responseCount: number;
  attended: number;
};

export function FeedbackSection({
  lifecycle,
  eventId,
  responseCount,
  attended,
}: Props) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg">
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

          <Link
            href={`/events/${eventId}/analytics`}
            className="self-start flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-lg font-label-md text-label-md hover:opacity-90 transition-opacity"
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
