'use client';

import { useState } from 'react';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { ControlledAccessNotice } from '@/components/auth/ControlledAccessNotice';
import { SignOutAction } from '@/components/auth/SignOutAction';

export default function LoginPreview() {
  const [demoState, setDemoState] = useState<'idle' | 'error' | 'success' | 'info'>('idle');

  return (
    <SiteShell active="signin">
      <div className="mx-auto flex max-w-md flex-col gap-lg px-grid-margin py-xl">
        <div className="flex flex-col gap-lg rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg shadow-sm">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">Staff sign-in</h1>
            <p className="mt-xs font-body-md text-body-md text-on-surface-variant">
              Enter your work email to receive a one-time sign-in link.
            </p>
          </div>

          <ControlledAccessNotice />

          {demoState !== 'idle' && (
            <AuthStatusMessage
              status={
                demoState === 'error'
                  ? { kind: 'error', message: 'Could not send link right now. Try again.' }
                  : demoState === 'success'
                    ? { kind: 'success', message: 'Check your inbox for a sign-in link.' }
                    : { kind: 'info', message: 'Access is limited to authorised staff.' }
              }
            />
          )}

          <MagicLinkSignInForm submitMagicLink={async () => ({ ok: true })} />

          {/* Demo-only controls, not part of Category 02 — just to show every banner state without waiting on a real send. */}
          <div className="flex gap-xs border-t border-outline-variant pt-md">
            <button type="button" onClick={() => setDemoState('error')} className="text-label-md text-error underline">error</button>
            <button type="button" onClick={() => setDemoState('success')} className="text-label-md text-success underline">success</button>
            <button type="button" onClick={() => setDemoState('info')} className="text-label-md text-primary-ink underline">info</button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[16px] border border-outline-variant bg-surface-container-lowest p-md">
          <span className="font-body-sm text-body-sm text-on-surface-variant">Already signed in, as a demo:</span>
          <SignOutAction signOut={async () => undefined} />
        </div>
      </div>
    </SiteShell>
  );
}
