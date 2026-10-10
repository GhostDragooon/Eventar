'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { publishEvent } from './actions';

// The draft page's "Ready to publish?" control. The server action used to be
// wired straight into a <form>, so a refusal threw into the crash page; it now
// returns a result and the reason shows here, next to the button, where the
// organiser can act on it. On success the action revalidates the page, which
// swaps this card for the published layout in the same transition.
export default function PublishDraftButton({
  eventId,
  canPublish,
}: {
  eventId: string;
  canPublish: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The card's heading and body already say why this role cannot publish; this
  // says what to do instead, at reading size (the reason used to be 12px grey
  // text no different from a sales line: user-lens 2026-10-02).
  if (!canPublish) {
    return (
      <p className="font-body-md text-body-md text-on-surface">
        Save your changes, then ask an organiser admin to publish this draft.
      </p>
    );
  }

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await publishEvent(eventId);
      if ('error' in res) setError(res.error);
    });
  }

  return (
    <div className="space-y-sm">
      {/* The one-way warning sits HERE, at reading size and directly above the button,
          not in the card's 12px grey body where it was the quietest text on the card
          (user-lens 2026-10-09). A published event is read-only until package P9b. */}
      <p className="font-body-md text-body-md text-on-surface">
        Details cannot be edited after publishing yet, so check them first.
      </p>
      {/* text-on-primary!: tailwind-merge reads `text-label-md` (a font size) as
          a text colour and drops the Button's own `text-on-primary`; the `!`
          keeps both. Same workaround as MagicLinkSignInForm.
          focusableWhenDisabled: a plain `disabled` button drops keyboard focus
          to <body> the moment the click lands, so a screen-reader user loses
          their place while "Publishing…" is in flight. base-ui then marks it
          aria-disabled instead, which the cva's `disabled:` styles do not see,
          hence the explicit aria-disabled:opacity-50. */}
      <Button
        type="button"
        onClick={onClick}
        disabled={pending}
        focusableWhenDisabled
        className="min-h-11 w-full font-label-md text-label-md text-on-primary! aria-disabled:opacity-50"
      >
        {pending ? 'Publishing…' : 'Publish event'}
      </Button>
      {error && (
        <p role="alert" className="flex items-start gap-xs text-sm text-danger">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
            warning
          </span>
          {error}
        </p>
      )}
    </div>
  );
}
