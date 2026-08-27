'use client';

/**
 * Two-file evidence export: claims JSON + flattened CSV.
 * Mirrors the ExportRegistrantsButton pattern (base64 data URL, synthetic
 * <a> download), extended to trigger both downloads from one Server Action
 * round trip.
 *
 * Disabled unless the event has posted credit — the Server Action returns
 * an error either way, but pre-disabling keeps the user from clicking into
 * a modal they cannot escape.
 */

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { exportEventEvidence } from './exportEvidenceActions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; bodyCount: number; entryCount: number };

function downloadDataUrl(mime: string, base64: string, filename: string): void {
  const a = document.createElement('a');
  a.href = `data:${mime};base64,${base64}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function EvidenceExportButton({
  eventId,
  disabled,
}: {
  eventId: string;
  /** Pass creditsIssued === 0 as `disabled` so the button says why it cannot fire. */
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick(): void {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await exportEventEvidence(eventId);
      if (!res.ok) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      // Two files, back-to-back. Some browsers throttle bulk downloads; a
      // small stagger keeps them from being swallowed as a single popup.
      downloadDataUrl('application/json', res.jsonBase64, `${res.filename}.json`);
      setTimeout(() => downloadDataUrl('text/csv', res.csvBase64, `${res.filename}.csv`), 250);
      setState({ kind: 'ok', bodyCount: res.bodyCount, entryCount: res.entryCount });
    });
  }

  const isLoading = state.kind === 'loading';
  const help =
    state.kind === 'error' ? state.message
    : state.kind === 'ok' ? `Downloaded ${state.entryCount} ledger ${state.entryCount === 1 ? 'entry' : 'entries'} across ${state.bodyCount} ${state.bodyCount === 1 ? 'body' : 'bodies'}.`
    : disabled ? 'Available once credit has posted for this event.'
    : null;

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={disabled || isLoading} className="gap-xs">
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>download</span>
        {isLoading ? 'Preparing…' : 'Export evidence (JSON + CSV)'}
      </Button>
      {help && (
        <p
          role={state.kind === 'error' ? 'alert' : undefined}
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
