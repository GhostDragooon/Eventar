'use client';

// Attendee sign-up page. Clone of /account/sign-in/page.tsx — same shell,
// same form, same Server Action (sendAttendeeMagicLink is already
// dual-purpose: shouldCreateUser: true means a first-time email creates the
// account, a returning email just signs in). Sign-up is a distinct ROUTE for
// funnel clarity (2026-09-21 two-persona instruction §4.5 — "prefer a
// dedicated route if it keeps funnels obvious"), not a distinct backend.
//
// Copy differs from sign-in: framed as account creation, not "sign in to
// an account you already have". A quiet "Already have an account? Sign in"
// line covers the visitor who lands here by mistake.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { sendAttendeeMagicLink } from '../sign-in/actions';
import { attendeeNextPath, wizardLandingPath } from '../sign-in/attendeeNext';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { resolveAuthError } from '@/components/auth/auth-error-messages';
import { checkDoorSession } from '@/lib/doorSession';

export default function AttendeeSignUpPage() {
  return (
    <Suspense fallback={<AttendeeSignUpShell />}>
      <AttendeeSignUpForm />
    </Suspense>
  );
}

function AttendeeSignUpShell({ children }: { children?: React.ReactNode } = {}) {
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

function AttendeeSignUpForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlErrorCode = searchParams.get('error');
  const urlErr = resolveAuthError(urlErrorCode, 'attendee');
  // Same open-redirect guard as /account/sign-in — see that page for the
  // reasoning (re-validated server-side in the Server Action either way).
  const next = attendeeNextPath(searchParams.get('next')) ?? undefined;
  // FR-005: with a destination, the emailed link lands on the first-run wizard
  // (/account/complete), which runs it for a new account and hands on to the
  // destination at the end, or passes a returning account straight through to
  // it. Without one the default flow is untouched. `next` itself (not this) is
  // what the Sign in link and the already-signed-in redirect below use.
  const emailedNext =
    next && wizardLandingPath(next) ? `/account/complete?next=${encodeURIComponent(next)}` : next;

  // Same already-signed-in short-circuit as /account/sign-in — a visitor who
  // reaches this page while already signed in doesn't need to create an
  // account again. See that page's comment for the full reasoning (client-
  // side check, form held out of the render tree until it resolves).
  const [sessionKnown, setSessionKnown] = useState(() => Boolean(urlErrorCode));
  const [endedErr, setEndedErr] = useState<string | null>(null);
  useEffect(() => {
    if (urlErrorCode) return;
    let cancelled = false;
    (async () => {
      // Server-verified, not a bare cookie read: see lib/doorSession.ts.
      const session = await checkDoorSession();
      if (cancelled) return;
      if (session === 'signed_in') {
        router.replace(next ?? '/account/record');
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
    return <AttendeeSignUpShell />;
  }

  return (
    <AttendeeSignUpShell>
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
        <span className="text-[color:var(--on-primary-container)]">Sign up</span>
        <span className="text-on-surface-variant"> · Create your Eventar record</span>
      </p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
        Create your Eventar record
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        Enter your email and we&apos;ll send you a one-time link. No password
        to set — the same link works whether this is your first time or your
        hundredth.
      </p>
      {next === '/account/claim' && (
        <p className="font-body-md text-body-md text-on-surface m-0">
          Use the same email you just registered with, so that registration can be added to your record.
        </p>
      )}
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        You can still register for events as a guest without an account —
        creating one is for linking past registrations, editing your
        profile, and releasing held CME/CPD points.
      </p>
      <MagicLinkSignInForm
        submitMagicLink={sendAttendeeMagicLink}
        initialError={urlErr ?? endedErr}
        placeholder="you@example.com"
        submitLabel="Send sign-up link"
        next={emailedNext}
        audience="attendee"
      />

      <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant text-center m-0">
        The link expires after 15 minutes and works once.
      </p>

      <p className="font-body-md text-body-md text-on-surface-variant text-center m-0">
        Already have an account?{' '}
        <Link
          href={next ? `/account/sign-in?next=${encodeURIComponent(next)}` : '/account/sign-in'}
          className="text-[color:var(--on-primary-container)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AttendeeSignUpShell>
  );
}
