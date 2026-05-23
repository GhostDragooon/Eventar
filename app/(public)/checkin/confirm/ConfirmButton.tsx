'use client';

import { useState, useTransition } from 'react';
import { selfCheckIn } from './actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

export default function ConfirmButton({ code }: { code: string }) {
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
      <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center space-y-2">
        <p className="text-2xl">✓</p>
        <p className="text-lg font-medium text-green-900">You&apos;re checked in!</p>
        <p className="text-sm text-green-800">See you at the event.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={state.kind === 'loading'}
        className="w-full rounded-md bg-blue-600 text-white px-4 py-3 text-base font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {state.kind === 'loading' ? 'Checking in…' : "I'm here — confirm check-in"}
      </button>
      {state.kind === 'error' && (
        <p className="text-sm text-red-700">⚠ {state.message}</p>
      )}
    </div>
  );
}
