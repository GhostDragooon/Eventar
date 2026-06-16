'use client';

import { useState, useTransition } from 'react';
import { selfCheckIn } from './actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export default function ConfirmButton({
  code,
}: {
  code: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await selfCheckIn(code);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      setState({ kind: 'ok' });
    });
  }

  if (state.kind === 'ok') {
    // Success message in the §5 rhythm — flat text, no medallion. The
    // page's surrounding pill + meta already give the visual anchor.
    return (
      <p
        role="status"
        aria-live="polite"
        className="font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm flex items-start gap-sm m-0"
      >
        <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden data-fill="1">check_circle</span>
        <span className="flex-1">You&apos;re checked in. See you at the event.</span>
      </p>
    );
  }

  // Mockup CI-6: full-width primary "Confirm I'm here". Compact label
  // (mockup verbatim) — the previous "I'm here — confirm check-in" was
  // wordier and added an icon the mockup doesn't show.
  return (
    <div className="flex flex-col gap-sm">
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === 'loading'}
        className="w-full bg-tertiary text-on-tertiary rounded-lg px-md py-md font-label-md text-body-md font-bold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
      >
        {state.kind === 'loading' ? 'Checking in…' : "Confirm I'm here"}
      </button>
      {state.kind === 'error' && (
        <p
          role="alert"
          className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>warning</span>
          <span>{state.message}</span>
        </p>
      )}
    </div>
  );
}
