'use client';

import { useState, useTransition } from 'react';
import { sendReminderForEvent, sendSurveyInviteForEvent } from './emailActions';
import { composeSendMessage } from '@/lib/emailSendSummary';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type Kind = 'reminder' | 'survey';

// Minimal manual triggers for Email #2 (reminder/pass) + Email #3 (survey
// invite) so the loop is exercisable on localhost. Deliberately plain — Wave 5
// restyles the Event Manager surface. In dev (RESEND_API_KEY unset) sends land
// on devEmailStub and report "logged (dev — not emailed)".
export function EmailSendControls({
  eventId,
  showReminder,
  showSurvey,
  registeredCount,
  attendedCount,
}: {
  eventId: string;
  showReminder: boolean;
  showSurvey: boolean;
  registeredCount: number;
  attendedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Kind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<Kind | null>(null);

  if (!showReminder && !showSurvey) return null;

  // Sending is irreversible and goes to real attendees — a designed dialog
  // names the recipient count before anything fires (no window.confirm).
  function requestSend(kind: Kind) {
    setConfirmKind(kind);
  }

  function run(kind: Kind) {
    setConfirmKind(null);
    setActive(kind);
    setMessage(null);
    startTransition(async () => {
      const fn = kind === 'reminder' ? sendReminderForEvent : sendSurveyInviteForEvent;
      const result = await fn(eventId);
      setMessage(composeSendMessage(kind, result));
      setActive(null);
    });
  }

  const confirmCount = confirmKind === 'reminder' ? registeredCount : attendedCount;

  const btn =
    'flex items-center gap-xs bg-surface-container-high text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container-highest transition-colors disabled:opacity-50';

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex gap-sm flex-wrap">
        {showReminder && (
          <button type="button" onClick={() => requestSend('reminder')} disabled={pending} className={btn}>
            <span className="material-symbols-outlined text-[16px]" aria-hidden>notifications</span>
            {active === 'reminder' && pending ? 'Sending…' : 'Send reminders now'}
          </button>
        )}
        {showSurvey && (
          <button type="button" onClick={() => requestSend('survey')} disabled={pending} className={btn}>
            <span className="material-symbols-outlined text-[16px]" aria-hidden>reviews</span>
            {active === 'survey' && pending ? 'Sending…' : 'Send survey invites'}
          </button>
        )}
      </div>
      {message && (
        <p className="font-body-sm text-body-sm text-on-surface-variant" role="status">
          {message}
        </p>
      )}

      <ConfirmDialog
        open={confirmKind != null}
        title={confirmKind === 'reminder' ? 'Send reminders now?' : 'Send survey invites now?'}
        body={
          confirmKind === 'reminder'
            ? `The reminder + personal check-in pass goes to ${confirmCount} registered attendee${confirmCount === 1 ? '' : 's'}. Sending can't be undone.`
            : `The survey invite goes to ${confirmCount} checked-in attendee${confirmCount === 1 ? '' : 's'}. Sending can't be undone.`
        }
        confirmLabel={confirmKind === 'reminder' ? `Send to ${confirmCount}` : `Send to ${confirmCount}`}
        pending={pending}
        onConfirm={() => confirmKind && run(confirmKind)}
        onCancel={() => setConfirmKind(null)}
      />
    </div>
  );
}
