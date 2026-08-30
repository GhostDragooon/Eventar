'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { EventCard, type EventCardRecord } from './EventCard';

type Props = {
  event: EventCardRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved?: boolean;
  onSaveChange?: (eventId: string, saved: boolean) => void;
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function ExpandableEventCard({
  event,
  open,
  onOpenChange,
  saved = false,
  onSaveChange,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    closeRef.current?.focus();

    const animation =
      dialog && !matchMedia('(prefers-reduced-motion: reduce)').matches
        ? dialog.animate(
            [
              { opacity: 0, transform: 'translateY(16px) scale(0.96)' },
              { opacity: 1, transform: 'translateY(0) scale(1)' },
            ],
            { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          )
        : null;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;

      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) =>
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true',
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      animation?.cancel();
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onOpenChange]);

  return (
    <>
      {/* Hidden from assistive tech while the dialog is open — otherwise a
          screen reader's browse cursor can still reach these controls even
          though the modal overlay blocks pointer clicks and the focus trap
          blocks Tab. */}
      <div inert={open}>
        <EventCard
          event={event}
          saved={saved}
          onSaveChange={onSaveChange}
          onOpen={() => onOpenChange(true)}
        />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-md" role="presentation">
          {/* Scrim — not a named button (a second "Close" in the a11y tree
              reads as a duplicate); keyboard users have Escape + the real
              close button. Matches components/ui/ConfirmDialog.tsx. */}
          <div aria-hidden onClick={() => onOpenChange(false)} className="absolute inset-0 bg-on-surface/60" />

          <article
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`event-dialog-${event.id}`}
            tabIndex={-1}
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-auto rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-xl"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close event details"
              className="absolute right-md top-md z-10 grid size-11 place-items-center rounded-full bg-surface-container-high text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <span className="material-symbols-outlined" aria-hidden>close</span>
            </button>

            <div className="aspect-[16/7] bg-surface-container" aria-hidden>
              {event.imageUrl && (
                <img src={event.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            <div className="space-y-md p-xl">
              {event.format && (
                <p className="font-label-md text-label-md uppercase tracking-wider text-primary-ink">
                  {event.format}
                </p>
              )}
              <h2
                id={`event-dialog-${event.id}`}
                className="font-headline-lg text-headline-lg text-on-surface"
              >
                {event.title}
              </h2>
              {event.summary && (
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {event.summary}
                </p>
              )}

              <dl className="grid gap-md rounded-[12px] bg-surface-container p-md sm:grid-cols-2">
                <div>
                  <dt className="font-label-md text-label-md text-on-surface-variant">Date</dt>
                  <dd className="font-body-md text-body-md text-on-surface">{event.dateLabel}</dd>
                </div>
                <div>
                  <dt className="font-label-md text-label-md text-on-surface-variant">Venue</dt>
                  <dd className="font-body-md text-body-md text-on-surface">{event.venueLabel}</dd>
                </div>
              </dl>

              {/* Rendered only when the host can actually persist a save —
                  same condition as EventCard. A Save control that no-ops
                  because no handler was supplied is a lie to the user
                  (rule 12: fail visibly, never silently). */}
              {onSaveChange && (
                <div className="flex justify-end border-t border-outline-variant pt-md">
                  {/* Same treatment AND same label as EventCard's Save (variant,
                      classes and text kept in step deliberately): one toggle,
                      one appearance, one wording on both surfaces. Ghost, not
                      filled — a filled primary in a dialog footer reads as the
                      commit action, and a bookmark toggle is not what this
                      dialog is for. */}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={saved}
                    onClick={() => onSaveChange(event.id, !saved)}
                    className="min-h-11 font-label-md text-label-md text-primary-ink hover:bg-primary-container hover:text-primary-ink"
                  >
                    <span
                      className="material-symbols-outlined align-middle text-[18px]"
                      data-fill={saved ? '1' : undefined}
                      aria-hidden
                    >
                      bookmark
                    </span>
                    {saved ? 'Saved' : 'Save'}
                  </Button>
                </div>
              )}
            </div>
          </article>
        </div>
      )}
    </>
  );
}
