'use client';

import { useEffect, useRef } from 'react';

// Designed confirmation dialog — replaces window.confirm() everywhere.
// Accessible: role=dialog + aria-modal, focus moves to the primary action,
// Escape/backdrop cancel, danger variant for destructive verbs.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Scrim — strong enough to isolate the dialog. Backdrop click cancels;
          it is NOT a named button (a second "Cancel" in the a11y tree reads
          as a duplicate) — keyboard users have Escape + the real Cancel. */}
      <div aria-hidden onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-[420px] rounded-[16px] bg-surface-container-lowest border border-outline-variant shadow-xl p-lg">
        <h2 id="confirm-dialog-title" className="text-[18px] font-bold tracking-[-0.01em] text-on-surface mb-xs">
          {title}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-lg">{body}</p>
        <div className="flex justify-end gap-sm">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-11 px-lg py-sm rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`min-h-11 px-lg py-sm rounded-lg font-label-md text-label-md transition-opacity disabled:opacity-50 ${
              tone === 'danger'
                ? 'bg-[color:var(--error)] text-white hover:opacity-90'
                : 'bg-tertiary text-on-tertiary hover:opacity-90'
            }`}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
