'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PublishConfirmDialog } from '@/components/event-form/PublishConfirmDialog';
import { useDraftDirty } from '@/lib/draftDirty';
import { publishFacts, type PublishFacts } from '@/lib/publishFacts';
import { publishEvent } from './actions';

// The draft page's "Ready to publish?" control. Publish asks first (a confirm that lists what goes live and
// what starts), then lands on the details page in its Published state. The server action returns a result
// instead of throwing, so a refusal shows inside the confirm where the organiser can act on it.
export default function PublishDraftButton({
  eventId,
  canPublish,
  title,
  startIso,
  timezone,
  registrationOpenIso,
}: {
  eventId: string;
  canPublish: boolean;
  title: string;
  startIso: string;
  timezone: string;
  registrationOpenIso: string | null;
}) {
  const router = useRouter();
  const warningId = useId();
  const dirty = useDraftDirty(eventId);
  // The facts are worked out when the organiser clicks (they depend on "now"), and double as "is it open".
  const [facts, setFacts] = useState<PublishFacts | null>(null);
  const [notice, setNotice] = useState(false);
  // One value, so the message and "this refusal is final" can never be seen out of step.
  const [refusal, setRefusal] = useState<{ message: string; stale: boolean } | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [pending, startTransition] = useTransition();
  // The notice is about one unsaved state; once that is saved it must not come back on the next keystroke.
  if (notice && !dirty) setNotice(false);

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

  // This card sits outside the form and publishes the last SAVED version. Rather than publish a version the
  // organiser can no longer see on screen, refuse while the form has unsaved changes.
  function onPublishClick() {
    if (dirty) {
      setNotice(true);
      return;
    }
    setNotice(false);
    setRefusal(null);
    setFacts(publishFacts({ startIso, timezone, registrationOpenIso, nowMs: Date.now() }));
  }

  function onConfirm() {
    setRefusal(null);
    startTransition(async () => {
      const res = await publishEvent(eventId);
      if ('error' in res) {
        setRefusal({ message: res.error, stale: res.stale === true });
        return;
      }
      setRedirecting(true);
      router.push(`/events/${eventId}/details?published=1`);
    });
  }

  function onOpenChange(next: boolean) {
    if (next) return;
    setFacts(null);
    // A stale refusal means the DRAFT badge and this card are out of date: refresh once it has been read.
    if (refusal?.stale) {
      setRefusal(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-sm">
      {/* The one-way warning sits HERE, at reading size and directly above the button,
          not in the card's 12px grey body where it was the quietest text on the card
          (user-lens 2026-10-09). A published event is read-only until package P9b. */}
      <p id={warningId} className="font-body-md text-body-md text-on-surface">
        Details cannot be edited after publishing yet, so check them first.
      </p>
      {/* text-on-primary!: tailwind-merge reads `text-label-md` (a font size) as
          a text colour and drops the Button's own `text-on-primary`; the `!`
          keeps both. Same workaround as MagicLinkSignInForm.
          focusableWhenDisabled: a plain `disabled` button drops keyboard focus
          to <body> the moment the click lands, so a screen-reader user loses
          their place. */}
      <Button
        type="button"
        onClick={onPublishClick}
        aria-describedby={warningId}
        className="min-h-11 w-full font-label-md text-label-md text-on-primary!"
      >
        Publish event
      </Button>
      {notice && dirty && (
        <p role="alert" className="flex items-start gap-xs font-body-md text-body-md text-error">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>warning</span>
          You have changes that are not saved. Save them first, then publish.
        </p>
      )}
      {facts && (
        <PublishConfirmDialog
          open
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
          pending={pending || redirecting}
          blocked={refusal?.stale === true}
          title={title}
          facts={facts}
          error={
            refusal &&
            (refusal.stale ? (
              <span>
                {refusal.message} Check it in{' '}
                <Link href="/dashboard/manage" className="underline underline-offset-4">Manage</Link>.
              </span>
            ) : (
              refusal.message
            ))
          }
        />
      )}
    </div>
  );
}
