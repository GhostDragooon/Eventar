'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SaveToggleButton({
  saved,
  onSaveChange,
}: {
  saved: boolean;
  onSaveChange: (saved: boolean) => Promise<{ ok: true } | { error: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    const result = await onSaveChange(!saved);
    setPending(false);
    if ('error' in result) setError(result.error);
  }

  return (
    <div className="space-y-xs">
      <Button
        type="button"
        variant={saved ? 'secondary' : 'outline'}
        aria-pressed={saved}
        disabled={pending}
        onClick={toggle}
        className={cn('gap-xs', saved && 'bg-success-container text-on-success-container hover:bg-success-container/90')}
      >
        <span className={cn('material-symbols-outlined', saved && '[font-variation-settings:"FILL"_1]')} aria-hidden>
          bookmark
        </span>
        {pending ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </Button>
      {error && <p role="alert" className="text-error">{error}</p>}
    </div>
  );
}
