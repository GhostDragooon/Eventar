'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type AsyncResult = { ok: true } | { error: string };

export function AsyncActionButton({
  idleLabel,
  workingLabel = 'Working…',
  successLabel = 'Complete',
  run,
}: {
  idleLabel: string;
  workingLabel?: string;
  successLabel?: string;
  run: () => Promise<AsyncResult>;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function execute() {
    setState('working');
    setError(null);
    const result = await run();
    if ('error' in result) {
      setState('error');
      setError(result.error);
    } else {
      setState('success');
    }
  }

  return (
    <div className="space-y-xs">
      <Button
        type="button"
        disabled={state === 'working'}
        onClick={execute}
        className={state === 'success' ? 'bg-success-container text-on-success-container hover:bg-success-container/90' : undefined}
      >
        {state === 'working' ? workingLabel : state === 'success' ? successLabel : idleLabel}
      </Button>
      {error && <p role="alert" className="text-error">{error}</p>}
    </div>
  );
}
