'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DraftSavedBanner } from '@/components/event-form/DraftSavedBanner';
import PublishDraftButton from '@/app/events/[id]/edit/PublishDraftButton';
import { markDraftSaved, resetDraftStatus, setDraftDirty } from '@/lib/draftDirty';
import { ActionCard, TITLE } from './frames';

const ID = 'specimen-draft';

// The shipped DraftSavedBanner and PublishDraftButton, driven by the shipped draft store. The three buttons
// stand in for typing in the form and for pressing Save changes. Nothing reaches the server unless you press
// "Publish event" inside the dialog, so press Keep editing there.
export function LiveToday() {
  useEffect(() => () => resetDraftStatus(ID), []);
  return (
    <div className="space-y-md">
      <div className="flex flex-wrap gap-sm">
        <Button type="button" variant="outline" className="min-h-11 px-md" onClick={() => setDraftDirty(ID, true)}>Type in the form</Button>
        <Button type="button" variant="outline" className="min-h-11 px-md" onClick={() => markDraftSaved(ID)}>Press Save changes</Button>
        <Button type="button" variant="ghost" className="min-h-11 px-md" onClick={() => resetDraftStatus(ID)}>Reset</Button>
      </div>
      <div className="grid gap-md md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-sm">
          <h2 className="text-[calc(22px*var(--text-scale))] font-extrabold leading-tight tracking-[-0.025em] text-on-surface">{TITLE}</h2>
          <DraftSavedBanner eventId={ID} savedOnLoad={false} canPublish />
        </div>
        <div id="publish-card">
          <ActionCard
            title="Ready to publish?"
            body="Makes the registration page live with the version you last saved, and unlocks the event QR code."
          >
            <PublishDraftButton
              eventId={ID}
              canPublish
              title={TITLE}
              startIso="2026-11-14T01:00:00.000Z"
              timezone="Asia/Hong_Kong"
              registrationOpenIso={null}
            />
          </ActionCard>
        </div>
      </div>
    </div>
  );
}
