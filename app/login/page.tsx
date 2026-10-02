'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendMagicLink } from './actions';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { ControlledAccessNotice } from '@/components/auth/ControlledAccessNotice';
import { AuthStatusMessage } from '@/components/auth/AuthStatusMessage';
import { resolveAuthError } from '@/components/auth/auth-error-messages';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { classifyPath, safeNextPath } from '@/lib/authDoor';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { getAccountMenuState } from '@/app/account/actions';

export default function LoginPage() {
  // useSearchParams must be inside a Suspense boundary in Next 16 (the page
  // would otherwise opt out of static prerendering with a CSR-bailout error).
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

// Locked patterns (docs/plans/eventar-design-patterns.md):
//   §5  flex column with gap-lg (24px) on a 480px-max content column
//   §3  sentence stack: each <p> stands alone, line-height carries the rhythm
//   §2  "By Eventar" footer applied page-wide by PublicShell — NOT inside this layout
//   §8 revised (2026-06-16) — PublicShell now provides the centered Eventar
//       wordmark in its top bar, so login no longer needs an in-form wordmark.
function LoginLayout({
  children,
  signedIn,
}: {
  children: React.ReactNode;
  /** Set only when the page knows the visitor is a signed-in practitioner,
   *  so the shell's chrome agrees with the card instead of saying "Sign in". */
  signedIn?: { accountComplete: boolean; unlinkedCount: number };
}) {
  // SiteShell = the public website chrome (Home · Upcoming events · Sign in)
  // so there's always a way back to the landing from here. Card container
  // keeps the form from floating bare on the page. No `active` item: this is
  // the organiser door, and the shell's "Sign in" pill points at the
  // practitioner one, so highlighting it here was wrong (M1, 2026-09-25).
  return (
    <SiteShell
      signedIn={Boolean(signedIn)}
      accountComplete={signedIn?.accountComplete}
      unlinkedCount={signedIn?.unlinkedCount}
    >
      <div className="mx-auto w-full max-w-md px-grid-margin py-xl">
        <div className="flex flex-col gap-lg bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
          {children}
        </div>
      </div>
    </SiteShell>
  );
}

// LG v2 (locked) set this eyebrow as `Sign in · Eventar`. Reworded to
// "Log in" 2026-08-08 (Ivan): one label per intent across the product,
// and the nav, the landing CTA and this page were saying three
// different things for the same destination.
function Eyebrow() {
  return (
    <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
      <span className="text-[color:var(--on-primary-container)]">Log in</span>
      <span className="text-on-surface-variant"> · Eventar</span>
    </p>
  );
}

type View =
  | { kind: 'checking' }
  | { kind: 'form'; checkFailed?: boolean }
  | { kind: 'practitioner'; email: string | null; accountComplete: boolean; unlinkedCount: number };

function LoginForm() {
  // Surface ?error=… from /auth/callback or /proxy redirects so users see why
  // they bounced back here instead of guessing they're stuck in a loop.
  // resolveAuthError is the shared Category-02 dictionary (components/auth/
  // auth-error-messages.ts), kept byte-identical to this page's known
  // codes; its one behavioural difference is the unknown-code fallback,
  // which is a fixed generic string here instead of reflecting the raw code
  // into the page — a deliberate hardening, not a regression.
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlErrorCode = searchParams.get('error');
  const urlErr = resolveAuthError(urlErrorCode);
  // Round-trip destination for the organiser CTA that links here with
  // ?next=/events/new (LandingHero/LandingNav "Start an Event" — 2026-09-24),
  // for a deep link bounced here by proxy.ts, and for an invite link
  // (/invite/<token>). safeNextPath is the shared open-redirect guard
  // (lib/authDoor.ts). The action re-validates; this is defence in depth
  // against a tampered link.
  const next = safeNextPath(searchParams.get('next')) ?? undefined;
  // An invitee arrives here from /invite/<token>; the page is theirs to finish
  // (Band 1 review F2), so it must not tell them to "contact an admin to be
  // added" or that access is "limited to authorised records".
  const isInvite = Boolean(next && next.startsWith('/invite/') && classifyPath(next) === 'organiser');

  // This page used to read no session at all, so a signed-in organiser was
  // asked to log in again (I2) and a signed-in practitioner who followed
  // "Start an Event" was shown the organiser form and, on submitting it, had
  // their session destroyed by proxy.ts (I1). Now it reads the browser session
  // the way /account/sign-in does and routes by who is signed in (D1,
  // 2026-09-25):
  //   organiser                  → on to `next` if it is an organiser route,
  //                                else /dashboard
  //   practitioner, next=/invite → on to the invite: an invitee has no staff row
  //                                yet, accepting is what creates it
  //   practitioner, otherwise    → a panel that says so; the session is never
  //                                signed out implicitly
  //   nobody                     → the form
  // The form is HELD OUT of the render tree until the check resolves, so a
  // signed-in visitor cannot submit it in the meantime.
  //
  // An error on the URL other than `not_organiser` means an upstream check
  // already failed once (a bad link, an unreadable staff table) — checking
  // again could loop, so the form renders at once with that error.
  // `not_organiser` is proxy.ts's "signed in, no active staff row" bounce and
  // is exactly the case that needs the check (it carries the panel).
  const [view, setView] = useState<View>(() =>
    urlErrorCode && urlErrorCode !== 'not_organiser' ? { kind: 'form' } : { kind: 'checking' },
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusHeading, setFocusHeading] = useState(false);
  // After "Sign out and use another email" the URL still says ?error=not_organiser,
  // and the form used to open under a red "That page is for organisers" banner
  // right after a deliberate sign-out (user-lens round 2, m4).
  const [signedOutHere, setSignedOutHere] = useState(false);

  useEffect(() => {
    if (view.kind !== 'checking') return;
    let cancelled = false;
    (async () => {
      let session: { user: { email?: string | null } } | null = null;
      try {
        // No session, or an unreadable one, collapses to "show the form" on purpose.
        session = (await supabaseBrowser().auth.getSession()).data.session;
      } catch {
        // Unreadable storage must not leave the page on "Loading…" for good.
      }
      if (cancelled) return;
      if (!session) {
        setView({ kind: 'form' });
        return;
      }

      // The browser session says someone is signed in; only the server can say
      // whether they are an organiser.
      let state: Awaited<ReturnType<typeof getAccountMenuState>>;
      try {
        state = await getAccountMenuState();
      } catch {
        if (!cancelled) setView({ kind: 'form', checkFailed: true });
        return;
      }
      if (cancelled) return;

      if (state.isStaff) {
        router.replace(next && classifyPath(next) === 'organiser' ? next : '/dashboard');
      } else if (isInvite && next) {
        router.replace(next);
      } else if (state.staffUnknown) {
        // The staff read failed (or the server holds no session for this browser):
        // do not tell a possible organiser they are a practitioner. Show the form
        // with the same "could not check your organizer access" message the
        // proxy uses for the same failure.
        setView({ kind: 'form', checkFailed: true });
      } else {
        setView({
          kind: 'practitioner',
          email: session.user.email ?? null,
          accountComplete: state.accountComplete,
          unlinkedCount: state.unlinkedCount,
        });
      }
      // On a redirect, deliberately leave the view as 'checking': the form
      // stays unmounted while the navigation completes.
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind, router, next, isInvite]);

  // After "Sign out and use another email" the panel the user just pressed a
  // button in disappears; put focus on the new heading rather than <body>.
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  if (view.kind === 'checking') return <LoginShell />;

  if (view.kind === 'practitioner') {
    return (
      <LoginLayout signedIn={view}>
        <PractitionerPanel
          email={view.email}
          hasRecord={view.accountComplete || view.unlinkedCount > 0}
          onSignedOut={() => {
            setView({ kind: 'form' });
            setFocusHeading(true);
            setSignedOutHere(true);
          }}
        />
      </LoginLayout>
    );
  }

  return (
    <LoginLayout>
      <Eyebrow />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-headline-lg text-headline-lg text-on-surface m-0 outline-none"
      >
        {isInvite ? 'Sign in to accept your invite' : 'Welcome back'}
      </h1>
      {/* §3 sentence stack — single sentence, m-0 so the container gap is the sole rhythm authority. */}
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        {isInvite
          ? "No password here. We'll email you a one-tap sign-in link, then bring you straight back to your invite."
          : <>No password here — we&apos;ll email you a one-tap sign-in link.</>}
      </p>

      {!isInvite && <ControlledAccessNotice contactLabel="Contact an admin to be added" />}

      <MagicLinkSignInForm
        submitMagicLink={sendMagicLink}
        initialError={view.checkFailed ? resolveAuthError('unavailable') : signedOutHere ? null : urlErr}
        next={next}
        audience={isInvite ? 'invitee' : 'organizer'}
      />

      <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant text-center m-0">
        The link expires after 15 minutes and works once.
      </p>

      {/* Recovery — "Trouble signing in?" (locked: NOT "Forgot password";
          there is no password in a magic-link flow). */}
      <details className="group">
        <summary className="cursor-pointer font-body-md text-body-md text-[color:var(--on-primary-container)] hover:underline list-none">
          Trouble signing in?
        </summary>
        <ul className="mt-sm font-body-md text-[calc(13px*var(--text-scale))] text-on-surface-variant leading-relaxed list-disc pl-lg flex flex-col gap-xs">
          <li>
            {isInvite
              ? 'Sign-in links expire after 15 minutes and work once. Request a fresh one above.'
              : 'Links expire after 15 minutes and work once — request a fresh one above.'}
          </li>
          <li>Check spam, and make sure you opened the newest email.</li>
          <li>Open the link in the same browser you asked for it in. A link opened on another device, or inside a mail app&apos;s built-in browser, won&apos;t sign you in.</li>
          {isInvite ? (
            <li>Your invite link is separate from the sign-in link, and works once. If it stops working, ask your admin for a new one.</li>
          ) : (
            <>
              <li>Only organizer emails can sign in. If yours isn&apos;t on the list, ask an admin to add you.</li>
              <li>Changing address? Sign in with your current one, then update it from Settings.</li>
              <li>Lost access to your inbox entirely? Ask an admin to update your organizer record — magic-link-only sign-in means we can&apos;t self-serve you back in from this screen.</li>
            </>
          )}
        </ul>
      </details>
    </LoginLayout>
  );
}

// Shown to a signed-in practitioner who reached the organiser door (D1). Says
// what is going on instead of showing a form that would lead nowhere, and
// leaves the session alone unless they choose to sign out.
function PractitionerPanel({
  email,
  hasRecord,
  onSignedOut,
}: {
  email: string | null;
  /** The session already has a practitioner footprint (a finished account or
   *  registrations to claim). Without one this is most likely someone who wants
   *  to be an organiser and has not been invited yet, and "my record" would
   *  only lead into practitioner onboarding (Band 1 review F3). */
  hasRecord: boolean;
  onSignedOut: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const { error } = await supabaseBrowser().auth.signOut();
      if (error) throw error;
      onSignedOut();
    } catch {
      // The session is still there — say so rather than pretend (rule 12).
      setPending(false);
      setFailed(true);
    }
  }

  // tailwind-merge reads `text-label-md` (a font size) as a text colour and
  // drops the default Button's own `text-on-primary`, leaving dark text on the
  // blue fill (3.82:1; 1.96:1 in dark). The `!` keeps the colour. Remove it
  // when cn() learns the type scale (G1 token sweep).
  const cta = 'min-h-11 w-full font-label-md text-label-md';
  const primary = `${cta} text-on-primary!`;

  const signOutButton = (
    <Button
      type="button"
      variant={hasRecord ? 'outline' : 'default'}
      disabled={pending}
      onClick={signOut}
      className={hasRecord ? cta : primary}
    >
      {pending ? 'Signing out…' : 'Sign out and use another email'}
    </Button>
  );
  const recordLink = (
    <Link
      href="/account/record"
      className={cn(buttonVariants({ variant: hasRecord ? 'default' : 'outline' }), hasRecord ? primary : cta)}
    >
      {hasRecord ? 'Back to my record' : 'Go to my account'}
    </Link>
  );

  return (
    <>
      <Eyebrow />
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Organiser log in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        {email ? (
          <>
            You&apos;re signed in as{' '}
            <strong className="font-semibold text-on-surface [overflow-wrap:anywhere]">{email}</strong>. This email
            isn&apos;t on an organiser team.
          </>
        ) : (
          <>You&apos;re signed in, but this account isn&apos;t on an organiser team.</>
        )}{' '}
        To join one, open the invite link your admin sent you, or ask an admin to add you.
      </p>
      <div className="flex flex-col gap-sm">
        {hasRecord ? (
          <>
            {recordLink}
            {signOutButton}
          </>
        ) : (
          <>
            {signOutButton}
            {recordLink}
          </>
        )}
      </div>
      {failed && (
        <AuthStatusMessage status={{ kind: 'error', message: "Couldn't sign you out. Try again." }} />
      )}
    </>
  );
}

// Static skeleton shown during the Suspense fallback and while the session
// check runs (a cookie read, no network — effectively instant).
function LoginShell() {
  return (
    <LoginLayout>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Log in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">Loading…</p>
    </LoginLayout>
  );
}
