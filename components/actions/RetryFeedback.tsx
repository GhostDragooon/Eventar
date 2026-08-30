'use client';

import { Button } from '@/components/ui/button';

export function RetryFeedback({
  message,
  pending,
  onRetry,
}: {
  message: string;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-md rounded-[12px] bg-error-container p-md text-on-error-container">
      <span className="material-symbols-outlined" aria-hidden>error</span>
      <p className="min-w-0 flex-1">{message}</p>
      <Button type="button" variant="outline" disabled={pending} onClick={onRetry} className="border-error text-error">
        {pending ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}
