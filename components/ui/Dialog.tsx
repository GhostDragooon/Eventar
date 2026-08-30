'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * General content dialog.
 *
 * ConfirmDialog is deliberately NOT this: it is a locked confirm/cancel pair
 * with its own copy contract. This is for dialogs that carry arbitrary content
 * (a form, a scanner, a detail view) and need a title, an optional description
 * and a close affordance.
 *
 * The focus/scrim behaviour here is the same shape ConfirmDialog and
 * ExpandableEventCard already use, kept in step on purpose:
 *   - the scrim is an aria-hidden <div>, never a named button (a second
 *     "Close" in the a11y tree reads as a duplicate);
 *   - focus moves in on open and is restored to the opener on close;
 *   - Tab cycles inside the dialog, Escape closes;
 *   - the open animation is skipped under prefers-reduced-motion and is
 *     cancelled on unmount so a fast open/close cannot leak an animation.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  labelledById,
  className,
  icon,
  iconTone = 'primary',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Override the generated id when a caller needs to reference the title. */
  labelledById?: string;
  className?: string;
  /** material-symbols-outlined glyph name shown left of the title. */
  icon?: string;
  iconTone?: 'primary' | 'error';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = labelledById ?? 'dialog-title';

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Prefer the first field over the close button: for a form dialog the
    // operator's next action is typing, not dismissing.
    const firstField = panel?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])');
    (firstField ?? closeRef.current)?.focus();

    const animation =
      panel && !matchMedia('(prefers-reduced-motion: reduce)').matches
        ? panel.animate(
            [
              { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
              { opacity: 1, transform: 'translateY(0) scale(1)' },
            ],
            { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
          )
        : null;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-md" role="presentation">
      <div aria-hidden onClick={() => onOpenChange(false)} className="absolute inset-0 bg-on-surface/60" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-auto rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg shadow-xl',
          className,
        )}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={`Close ${title}`}
          className="absolute right-md top-md grid size-11 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="material-symbols-outlined" aria-hidden>close</span>
        </button>

        <div className="flex items-start gap-md pr-11">
          {icon && (
            <span
              aria-hidden
              className={cn(
                'material-symbols-outlined grid size-11 shrink-0 place-items-center rounded-full',
                iconTone === 'error'
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-primary-container text-on-primary-container',
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-headline-sm text-headline-sm text-on-surface">
              {title}
            </h2>
            {description && (
              <div className="mt-xs font-body-md text-body-md text-on-surface-variant">{description}</div>
            )}
          </div>
        </div>

        {children && <div className="mt-lg">{children}</div>}
        {footer && <div className="mt-lg flex justify-end gap-sm">{footer}</div>}
      </div>
    </div>
  );
}
