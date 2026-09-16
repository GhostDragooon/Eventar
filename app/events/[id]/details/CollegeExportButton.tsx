'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { exportCollegePackage } from './exportCollegeActions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; rowCount: number };

function downloadDataUrl(mime: string, base64: string, filename: string): void {
  const a = document.createElement('a');
  a.href = `data:${mime};base64,${base64}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function CollegeExportButton({
  eventId,
  disabled,
}: {
  eventId: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick(): void {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await exportCollegePackage(eventId);
      if (!res.ok) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      downloadDataUrl('text/csv', res.csvBase64, res.filename);
      setState({ kind: 'ok', rowCount: res.rowCount });
    });
  }

  const isLoading = state.kind === 'loading';
  const help =
    state.kind === 'error' ? state.message
    : state.kind === 'ok' ? `Downloaded ${state.rowCount} credit ${state.rowCount === 1 ? 'row' : 'rows'}.`
    : disabled ? 'Available once credit has been posted for this event.'
    : null;

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={disabled || isLoading} aria-disabled={disabled || isLoading} title={disabled ? 'Available once credit has been posted for this event' : undefined} className="gap-xs">
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>download</span>
        {isLoading ? 'Preparing…' : 'Export College package (CSV)'}
      </Button>
      {help && (
        <p
          role={state.kind === 'error' ? 'alert' : 'status'}
          className={
            state.kind === 'error'
              ? 'flex items-start gap-xs text-sm text-danger'
              : 'text-sm text-on-surface-variant'
          }
        >
          {state.kind === 'error' && (
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>warning</span>
          )}
          {help}
        </p>
      )}
    </div>
  );
}
