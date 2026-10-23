'use client';

import { useId, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

// The one confirm step in front of every Publish control (UX-01 pick a1): what becomes public, what starts,
// and the one-way warning. Built on the general Dialog, not ConfirmDialog, because it carries a list.
export function PublishConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
  blocked,
  title,
  facts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
  /** A refusal from the publish call, shown here so the organiser can act on it. */
  error?: ReactNode;
  /** The refusal is final (the draft is gone): no Publish button, and Keep editing becomes Close. */
  blocked?: boolean;
  /** The event's title, as shown to the organiser. */
  title: string;
  facts: { registrationOpens: string; checkinOpens: string };
}) {
  const listId = useId();
  const rows: [string, string][] = [
    ['public', 'Your registration page goes live. Anyone with the link can register.'],
    ['how_to_reg', facts.registrationOpens],
    ['qr_code_scanner', facts.checkinOpens],
    ['lock', 'Details cannot be edited after publishing yet, so check them first.'],
  ];
  return (
    <Dialog
      open={open}
      // Closing mid-publish would hide the result; the call finishes either way.
      onOpenChange={(next) => { if (!pending) onOpenChange(next); }}
      title="Publish this event?"
      description={title}
      describedById={listId}
      footer={
        <>
          <Button type="button" variant="outline" className="min-h-11 px-md" onClick={() => onOpenChange(false)} disabled={pending} focusableWhenDisabled>
            {blocked ? 'Close' : 'Keep editing'}
          </Button>
          {!blocked && (
            <Button
              type="button"
              className="min-h-11 px-md font-label-md text-label-md text-on-primary! aria-disabled:opacity-50"
              onClick={() => { if (!pending) onConfirm(); }}
              disabled={pending}
              focusableWhenDisabled
            >
              {pending ? 'Publishing…' : 'Publish event'}
            </Button>
          )}
        </>
      }
    >
      <ul id={listId} className="space-y-sm font-body-md text-body-md text-on-surface">
        {rows.map(([icon, text]) => (
          <li key={icon} className="flex items-start gap-sm">
            <span className="material-symbols-outlined mt-[2px] text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>{icon}</span>
            <span className="min-w-0 flex-1">{text}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-md flex items-start gap-xs font-body-md text-body-md text-error">
          <span className="material-symbols-outlined mt-[2px] text-[calc(18px*var(--text-scale))]" aria-hidden>warning</span>
          <span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
    </Dialog>
  );
}
