'use client';

// Attendee sign-in — same SiteShell + white card as /account/sign-up.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendAttendeeMagicLink } from './actions';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { resolveAuthError } from '@/components/auth/auth-error-messages';
import { attendeeNextPath } from './attendeeNext';
import { checkDoorSession } from '@/lib/doorSession';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlErrorCode = searchParams.get('error');
  const urlErr = resolveAuthError(urlErrorCode, 'attendee');
  const next = attendeeNextPath(searchParams.get('next')) ?? undefined;

  const [sessionKnown, setSessionKnown] = useState(() => Boolean(urlErrorCode));
  const [endedErr, setEndedErr] = useState<string | null>(null);
  useEffect(() => {
    if (urlErrorCode) return;
    let cancelled = false;
    (async () => {
      const session = await checkDoorSession();
      if (cancelled) return;
      if (session === 'signed_in') {
        router.replace(next ?? '/account/registrations');
        return;
      }
      if (session === 'ended') setEndedErr(resolveAuthError('session_ended', 'attendee'));
      setSessionKnown(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next, urlErrorCode]);

  if (!sessionKnown) {
    return <AttendeeSignInShell />;
  }

  return (
    <AttendeeSignInShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Log in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        We’ll email a one-time link, no password.
      </p>
      <MagicLinkSignInForm
        submitMagicLink={sendAttendeeMagicLink}
        initialError={urlErr ?? endedErr}
        placeholder="you@example.com"
        submitLabel="Next"
        next={next}
      />

      <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
        New here?{' '}
        <Link
          href={next ? `/account/sign-up?next=${encodeURIComponent(next)}` : '/account/sign-up'}
          className="text-[color:var(--on-primary-container)] hover:underline"
        >
          Sign up
        </Link>
      </p>

      <details className="group">
        <summary className="cursor-pointer font-body-md text-body-md text-[color:var(--on-primary-container)] hover:underline list-none">
          Trouble logging in?
        </summary>
        <ul className="mt-sm font-body-md text-[calc(13px*var(--text-scale))] text-on-surface-variant leading-relaxed list-disc pl-lg flex flex-col gap-xs">
          <li>Links expire after 15 minutes and work once. Request a new one above.</li>
          <li>Check spam, and make sure you opened the newest email.</li>
          <li>Open the link in the same browser you asked for it in, and use the address you registered with.</li>
        </ul>
      </details>
    </AttendeeSignInShell>
  );
}
