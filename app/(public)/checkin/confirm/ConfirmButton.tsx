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
    return (
      <div className="bg-primary text-on-primary rounded-[20px] p-lg text-center space-y-sm shadow-lg">
        <div
          aria-hidden
          className="inline-flex items-center justify-center w-14 h-14 bg-on-primary/10 rounded-full"
        >
          <span className="material-symbols-outlined text-[28px]" data-fill="1">
            check_circle
          </span>
        </div>
        <p className="font-headline-sm text-headline-sm">You&apos;re checked in!</p>
        <p className="font-body-md text-body-md text-on-primary/80">See you at the event.</p>
      </div>
    );
  }

  return (
    <div className="space-y-sm">
      <p className="font-body-md text-body-md text-on-surface-variant text-center">
        Ready to check in for this event?
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === 'loading'}
        className="w-full bg-primary text-on-primary rounded-lg px-md py-md font-label-md text-body-md font-bold hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-sm shadow-sm"
      >
        {state.kind === 'loading' ? (
          'Checking in…'
        ) : (
          <>
            <span className="material-symbols-outlined text-[20px]" aria-hidden>
              check
            </span>
            I&apos;m here — confirm check-in
          </>
        )}
      </button>
      {state.kind === 'error' && (
        <p
          role="alert"
          className="font-body-md text-body-md text-error bg-error-container/20 border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
        >
          <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>
            warning
          </span>
          <span>{state.message}</span>
        </p>
      )}
    </div>
  );
}
