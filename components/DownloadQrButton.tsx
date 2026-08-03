'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { getEventQrPng } from '@/app/events/[id]/edit/actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function DownloadQrButton({ eventId }: { eventId: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await getEventQrPng(eventId);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      // Build a data URL and trigger a download via a synthetic <a>.
      const href = `data:image/png;base64,${res.pngBase64}`;
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
      <Button type="button" onClick={onClick} disabled={isLoading}>
        {isLoading ? 'Preparing…' : 'Download QR'}
      </Button>
      {errorMessage && (
        <p role="alert" className="flex items-start gap-xs text-sm text-danger">
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>warning</span>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
