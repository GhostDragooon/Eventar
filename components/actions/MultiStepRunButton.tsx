'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type RunStep = { id: string; label: string; run: () => Promise<{ ok: true } | { error: string }> };

export function MultiStepRunButton({
  steps,
  onComplete,
}: {
  steps: readonly RunStep[];
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    for (let i = 0; i < steps.length; i++) {
      setIndex(i);
      const result = await steps[i].run();
      if ('error' in result) {
        setError(result.error);
        setRunning(false);
        return;
      }
    }
    setIndex(steps.length);
    setRunning(false);
    onComplete();
  }

  const complete = index === steps.length;

  return (
    <div className="space-y-sm">
      <Button
        type="button"
        disabled={running || complete}
        onClick={run}
        className={complete ? 'bg-success-container text-on-success-container hover:bg-success-container/90' : undefined}
      >
        {complete ? 'Completed' : running ? (steps[index]?.label ?? 'Starting…') : 'Run workflow'}
      </Button>
      {running && <progress max={steps.length} value={index + 1} className="block w-full accent-primary" />}
      {error && <p role="alert" className="text-error">{error}</p>}
    </div>
  );
}
