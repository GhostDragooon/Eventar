'use client';

// Attendee sign-in page. Mirrors app/login/page.tsx structure verbatim
// (SiteShell + centered card + Suspense boundary + resolveAuthError from
// ?error= query) so the visual style matches. The only differences:
//   1. Copy: "Sign in to your account" instead of "Log in · Eventar".
//   2. No ControlledAccessNotice — that notice is about the staff allowlist,
//      not applicable to attendees.
//   3. submitMagicLink = sendAttendeeMagicLink (different Server Action).
//
// Style oracle: /login/page.tsx + /settings SettingsSection (Ivan, Stage C
// decision Q4 — match verbatim, no reinvention).

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendAttendeeMagicLink } from './actions';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { resolveAuthError } from '@/components/auth/auth-error-messages';

export default function AttendeeSignInPage() {
  return (
    <Suspense fallback={<AttendeeSignInShell />}>
      <AttendeeSignInForm />
    </Suspense>
  );
}

function AttendeeSignInShell({ children }: { children?: React.ReactNode } = {}) {
  return (
    <SiteShell active="signin">
      <div className="mx-auto w-full max-w-md px-grid-margin py-xl">
        <div className="flex flex-col gap-lg bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
          {children}
        </div>
      </div>
    </SiteShell>
  );
}

function AttendeeSignInForm() {
  const urlErrorCode = useSearchParams().get('error');
  const urlErr = resolveAuthError(urlErrorCode);

  return (
    <AttendeeSignInShell>
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
        <span className="text-[color:var(--on-primary-container)]">Sign in</span>
        <span className="text-on-surface-variant"> · Account</span>
      </p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
        Sign in to your account
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        Use the email you registered with. We&apos;ll send you a one-time
        link to sign in.
      </p>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        You can still register for events as a guest without an account —
        this door is for linking past registrations, editing your profile,
        and releasing held CPD credit.
      </p>
      <MagicLinkSignInForm
        submitMagicLink={sendAttendeeMagicLink}
        initialError={urlErr}
        placeholder="you@example.com"
        submitLabel="Send sign-in link"
      />
    </AttendeeSignInShell>
  );
}
