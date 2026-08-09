import { isReviewMode } from '@/lib/reviewMode';

/**
 * Persistent "authentication is off" marker.
 *
 * The June incarnation of the review bypass was invisible, and every handoff
 * from that period carries "strip before push" as open debt — an unmarked
 * bypass is one you forget is on. This renders nothing at all unless the
 * bypass is actually engaged, so its presence in the tree is harmless and its
 * absence on screen is meaningful.
 *
 * Fixed to the viewport bottom rather than the top: the staff shell already
 * owns the top edge, and a reviewer scrolling a long roster should not lose
 * the reminder that nothing here checked who they are.
 */
export function ReviewBanner() {
  if (!isReviewMode()) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] flex justify-center px-md pb-md"
    >
      <p className="rounded-full border border-[color:var(--warning,#B26B00)] bg-[color:var(--warning-container,#F9EFD9)] px-md py-[6px] text-[calc(12px*var(--text-scale))] font-semibold text-[color:var(--warning,#B26B00)] shadow-sm">
        Review mode — authentication is bypassed. Local only; impossible in a production build.
      </p>
    </div>
  );
}
