'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { shake } from '@/lib/motion/shake';

export type AuthStatus = { kind: 'success' | 'error' | 'info'; message: string };

export function AuthStatusMessage({ status }: { status: AuthStatus }) {
  const style = status.kind === 'error'
    ? 'bg-error-container text-on-error-container'
    : status.kind === 'success'
      ? 'bg-success-container text-on-success-container'
      : 'bg-primary-container text-on-primary-container';
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status.kind === 'error') shake(ref.current);
  }, [status]);
  const icon = status.kind === 'error' ? 'warning' : status.kind === 'success' ? 'check_circle' : 'info';
  // role="alert" carries an implicit aria-live="assertive" — pairing it with
  // aria-live="polite" overrides that and downgrades the announcement.
  // aria-live is only set explicitly for the non-alert (status) branch,
  // matching every other role="alert" site in this codebase.
  return (
    <div
      ref={ref}
      role={status.kind === 'error' ? 'alert' : 'status'}
      aria-live={status.kind === 'error' ? undefined : 'polite'}
      className={cn('flex items-start gap-sm rounded-[12px] p-md font-body-md text-body-md', style)}
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden>{icon}</span>
      <p>{status.message}</p>
    </div>
  );
}
