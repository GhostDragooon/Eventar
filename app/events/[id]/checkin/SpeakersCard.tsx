'use client';

import { useState, useTransition } from 'react';
import { formatInTz } from '@/lib/tz';
import { toggleSpeakerCheckin } from './speakerActions';

export type SpeakerCheckinRow = {
  speaker_name: string;
  checked_in_at: string | null;
};

/**
 * TC speakers card (E.4 / G3): one row per derived speaker name with a
 * toggle. Optimistic local state for snappy tablet taps; rolls back on
 * Server-Action error. Empty state when no speakers — the slot stays
 * visible so the layout doesn't reflow when an agenda is added.
 */
export function SpeakersCard({
  eventId,
  eventTimezone,
  speakerNames,
  initialCheckins,
  onError,
}: {
  eventId: string;
  eventTimezone: string;
  speakerNames: string[];
  initialCheckins: SpeakerCheckinRow[];
  onError?: (message: string) => void;
}) {
  // Map<speaker_name, checked_in_at|null>. Names absent from the map are
  // treated as never-checked-in (UI shows "Check in").
  const [state, setState] = useState<Map<string, string | null>>(() => {
    const m = new Map<string, string | null>();
    for (const row of initialCheckins) {
      m.set(row.speaker_name, row.checked_in_at);
    }
    return m;
  });
  const [pending, startTransition] = useTransition();
  const [busyName, setBusyName] = useState<string | null>(null);

  function handleToggle(name: string) {
    const prev = state.get(name) ?? null;
    // Optimistic: stamped → null, null → stamp(now).
    const optimistic = prev ? null : new Date().toISOString();
    setState((s) => {
      const next = new Map(s);
      next.set(name, optimistic);
      return next;
    });
    setBusyName(name);

    startTransition(async () => {
      const res = await toggleSpeakerCheckin(eventId, name);
      setBusyName(null);
      if ('error' in res) {
        // Roll back optimistic state.
        setState((s) => {
          const next = new Map(s);
          next.set(name, prev);
          return next;
        });
        onError?.(res.error);
        return;
      }
      // Sync to server truth (action returns ISO or null).
      setState((s) => {
        const next = new Map(s);
        next.set(name, res.checkedInAt);
        return next;
      });
    });
  }

  return (
    <section
      aria-label="Speakers"
      className="bg-surface-container-lowest rounded-[20px] border border-outline-variant p-md"
    >
      <header className="mb-sm flex items-center justify-between">
        <h2 className="font-label-md text-label-md uppercase text-on-surface-variant">
          Speakers
        </h2>
        {speakerNames.length > 0 && (
          <span className="font-label-md text-label-md text-on-surface-variant">
            {countCheckedIn(speakerNames, state)} / {speakerNames.length}
          </span>
        )}
      </header>

      {speakerNames.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant py-sm">
          No speakers configured — add them to the agenda first.
        </p>
      ) : (
        <ul className="divide-y divide-surface-container-highest">
          {speakerNames.map((name) => {
            const checkedAt = state.get(name) ?? null;
            const isChecked = checkedAt !== null;
            const isBusy = pending && busyName === name;
            return (
              <li
                key={name}
                className="py-sm flex items-center justify-between gap-md"
              >
                <div className="min-w-0">
                  <p className="font-body-md text-body-md text-on-surface truncate">
                    {name}
                  </p>
                  {isChecked && checkedAt && (
                    <p className="font-label-md text-label-md text-on-surface-variant">
                      Checked in at {formatInTz(checkedAt, eventTimezone)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(name)}
                  disabled={isBusy}
                  aria-pressed={isChecked}
                  className={
                    'shrink-0 min-h-11 min-w-24 rounded-lg px-md py-sm font-label-md text-label-md transition-colors disabled:opacity-60 ' +
                    (isChecked
                      ? 'bg-primary-container text-on-primary-container hover:opacity-90'
                      : 'bg-transparent text-primary-ink border border-outline-variant hover:bg-surface-container-low')
                  }
                >
                  {isChecked ? '✓ Checked in' : 'Check in'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function countCheckedIn(
  names: string[],
  state: Map<string, string | null>,
): number {
  let n = 0;
  for (const name of names) {
    if ((state.get(name) ?? null) !== null) n++;
  }
  return n;
}
