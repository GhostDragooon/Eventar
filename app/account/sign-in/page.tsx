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

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendAttendeeMagicLink } from './actions';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { resolveAuthError } from '@/components/auth/auth-error-messages';
import { supabaseBrowser } from '@/lib/supabase/browser';

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
  const urlErr = resolveAuthError(urlErrorCode);
  // Round-trip destination for the walk-in flow: event page → sign-in → OTP
  // → same event page. The action re-validates; only pass through when it
  // starts with a single '/' (server does the same check as a defence in
  // depth against tampered links).
  const rawNext = searchParams.get('next');
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : undefined;

  // Short-circuit for a visitor who is ALREADY signed in and reached this
  // page anyway (most likely via the pending-credit banner on
  // /checkin/confirm, which unconditionally links here). Redirect to `next`
  // (or /account) instead of asking them to redeem another OTP against the
  // same email they're already signed in as. This is a client-side check
  // rather than a server-side one because the page is 'use client' for the
  // Suspense + useSearchParams shape; a proper server-side auth check would
  // need to split the file — flagged as a future cleanup, not blocking.
  //
  // The form is HELD OUT of the render tree until the session check
  // resolves. Rendering the form eagerly and racing the useEffect lets a
  // reflex-fast signed-in visitor submit the form (sending themselves a
  // magic link they don't need + landing them on a "check your inbox"
  // false-positive) before the redirect fires. Second-pass review IMPORTANT
  // 3. The signed-out latency cost is one getSession() call (cookie read,
  // no network) — invisible in practice.
  const [sessionKnown, setSessionKnown] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line no-restricted-syntax -- no-session collapses to "show the form"
      const { data } = await supabaseBrowser().auth.getSession();
      if (cancelled) return;
      if (data.session) {
        router.replace(next ?? '/account');
        // Do NOT set sessionKnown — leave the form unmounted while the
        // navigation completes so the visitor cannot submit into the void.
      } else {
        setSessionKnown(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  if (!sessionKnown) {
    // Skeleton: same shell the Suspense boundary uses, so signed-out
    // visitors see one continuous frame from server-render through the
    // session-check to the form appearing.
    return <AttendeeSignInShell />;
  }

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
        next={next}
      />
    </AttendeeSignInShell>
  );
}
