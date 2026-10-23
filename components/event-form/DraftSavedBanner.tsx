'use client';

import { useEffect } from 'react';
import { useDraftDirty, useDraftSaved } from '@/lib/draftDirty';

// UX-01 pick c1. After Save draft the browser moves to this page, so the page has to say the draft is saved
// (`savedOnLoad`, from `?saved=1`). It also confirms a later Save changes, and turns into a plain notice the
// moment the form changes again. Always-mounted live region, so each change is announced.
export function DraftSavedBanner({
  eventId,
  savedOnLoad,
  canPublish,
}: {
  eventId: string;
  savedOnLoad: boolean;
  canPublish: boolean;
}) {
  const dirty = useDraftDirty(eventId);
  const saved = useDraftSaved(eventId);

  // The flag is a one-time arrival signal, not part of the address: drop it so a reload does not repeat it.
  // `null` state on purpose: Next patches replaceState and only syncs its router's own copy of the URL when the
  // state is not one it created. Passing window.history.state left `?saved=1` in the router, so the next
  // router.refresh() brought it back (review UX-03 m1, user lens F5).
  useEffect(() => {
    if (savedOnLoad) window.history.replaceState(null, '', window.location.pathname);
  }, [savedOnLoad]);

  function goToPublish() {
    const card = document.getElementById('publish-card');
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  const showSaved = !dirty && (saved || savedOnLoad);

  return (
    <div role="status" aria-live="polite" className="mb-md empty:hidden">
      {dirty && (
        <p className="flex items-start gap-sm rounded-lg border border-outline-variant px-md py-sm font-body-md text-body-md text-on-surface-variant">
          You have changes that are not saved.
        </p>
      )}
      {showSaved && (
        <p className="flex items-start gap-sm rounded-lg border border-success-container bg-success-container px-md py-sm font-body-md text-body-md text-on-success-container">
          <span className="material-symbols-outlined mt-[2px] text-[calc(18px*var(--text-scale))]" aria-hidden data-fill="1">check_circle</span>
          <span className="min-w-0 flex-1">
            {canPublish ? (
              <>
                Draft saved.{' '}
                <button type="button" onClick={goToPublish} className="underline underline-offset-4">Review and publish</button>
                {' '}when you are ready.
              </>
            ) : (
              'Draft saved. Publishing needs an organiser admin.'
            )}
          </span>
        </p>
      )}
    </div>
  );
}
