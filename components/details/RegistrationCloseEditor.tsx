'use client';

import { useState, useTransition } from 'react';
import { updateRegistrationClose } from '@/app/events/[id]/details/actions';

type Props = {
  eventId: string;
  current: string | null; // ISO or null
};

// `<input type="datetime-local">` requires 'YYYY-MM-DDTHH:mm' in the user's
// LOCAL timezone (no Z, no seconds). Adjust for the local offset so the
// stored UTC value renders as the wall-clock time the organizer expects.
function isoToLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function RegistrationCloseEditor({ eventId, current }: Props) {
  const [value, setValue] = useState(current ? isoToLocalInputValue(current) : '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = (current ? isoToLocalInputValue(current) : '') !== value;

  function handleSave() {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateRegistrationClose(eventId, value || null);
      if (result.error) setError(result.error);
      else setSavedAt(Date.now());
    });
  }

  return (
    <div className="flex flex-col gap-xs">
      <label
        htmlFor={`reg-close-${eventId}`}
        className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"
      >
        Close registration on{' '}
        <span className="normal-case tracking-normal text-on-surface-variant/70">(optional)</span>
      </label>
      <div className="flex items-center gap-sm flex-wrap">
        <input
          id={`reg-close-${eventId}`}
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="bg-surface-container-low border border-outline-variant rounded-lg px-sm py-xs font-body-md text-body-md text-on-surface focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="bg-primary text-on-primary px-md py-xs rounded-full font-label-md text-label-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            disabled={isPending}
            className="text-label-md font-label-md text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="font-label-md text-label-md text-on-error-container">
          {error}
        </p>
      )}
      {savedAt && !error && !dirty && (
        <p className="font-label-md text-label-md text-on-surface-variant">Saved.</p>
      )}
      <p className="font-label-md text-label-md text-on-surface-variant">
        Leave empty to keep registration open until event starts.
      </p>
    </div>
  );
}
