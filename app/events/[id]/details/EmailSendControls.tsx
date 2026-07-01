'use client';

import { useState, useTransition } from 'react';
import { sendReminderForEvent, sendSurveyInviteForEvent } from './emailActions';
import { formatSendResult } from '@/lib/emailSendSummary';

type Kind = 'reminder' | 'survey';

// Minimal manual triggers for Email #2 (reminder/pass) + Email #3 (survey
// invite) so the loop is exercisable on localhost. Deliberately plain — Wave 5
// restyles the Event Manager surface. In dev (RESEND_API_KEY unset) sends land
// on devEmailStub and report "N queued".
export function EmailSendControls({
  eventId,
  showReminder,
  showSurvey,
}: {
  eventId: string;
  showReminder: boolean;
  showSurvey: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Kind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!showReminder && !showSurvey) return null;

  function run(kind: Kind) {
    setActive(kind);
    setMessage(null);
    startTransition(async () => {
      const fn = kind === 'reminder' ? sendReminderForEvent : sendSurveyInviteForEvent;
      const result = await fn(eventId);
      setMessage(`${kind === 'reminder' ? 'Reminders' : 'Survey invites'}: ${formatSendResult(result)}`);
      setActive(null);
    });
  }

  const btn =
    'flex items-center gap-xs bg-surface-container-high text-on-surface px-md py-sm rounded-lg font-label-md text-label-md hover:bg-surface-container-highest transition-colors disabled:opacity-50';

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex gap-sm flex-wrap">
        {showReminder && (
          <button type="button" onClick={() => run('reminder')} disabled={pending} className={btn}>
            <span className="material-symbols-outlined text-[16px]" aria-hidden>notifications</span>
            {active === 'reminder' && pending ? 'Sending…' : 'Send reminders now'}
          </button>
        )}
        {showSurvey && (
          <button type="button" onClick={() => run('survey')} disabled={pending} className={btn}>
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
    </div>
  );
}
