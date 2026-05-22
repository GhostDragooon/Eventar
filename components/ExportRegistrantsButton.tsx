'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { exportRegistrantsCsv } from '@/app/events/[id]/edit/actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function ExportRegistrantsButton({
  eventId,
  disabled,
}: {
  eventId: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await exportRegistrantsCsv(eventId);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      // Build a data URL and trigger a download via a synthetic <a>.
      const href = `data:text/csv;base64,${res.csvBase64}`;
      const a = document.createElement('a');
      a.href = href;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setState({ kind: 'idle' });
    });
  }

  const isLoading = state.kind === 'loading';
  const errorMessage = state.kind === 'error' ? state.message : null;

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={disabled || isLoading}>
        {isLoading ? 'Preparing…' : 'Export registrants (CSV)'}
      </Button>
      {errorMessage && (
        <p className="text-sm text-red-700">⚠ {errorMessage}</p>
      )}
    </div>
  );
}
