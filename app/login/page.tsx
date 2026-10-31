'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendMagicLink } from './actions';
import { AuthBackdropCard } from '@/components/auth/AuthBackdropCard';
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
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthBackdropCard door="organiser">{children}</AuthBackdropCard>;
}

function Eyebrow() {
  return (
    <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
      <span className="text-[color:var(--on-primary-container)]">Organiser</span>
      <span className="text-on-surface-variant"> · Log in</span>
    </p>
  );
}

type View =
  | { kind: 'checking' }
  | { kind: 'form'; checkFailed?: boolean }
  | { kind: 'practitioner'; email: string | null; accountComplete: boolean; unlinkedCount: number };

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlErrorCode = searchParams.get('error');
  const urlErr = resolveAuthError(urlErrorCode);
  const next = safeNextPath(searchParams.get('next')) ?? undefined;
  const isInvite = Boolean(next && next.startsWith('/invite/') && classifyPath(next) === 'organiser');

  const skipsCheck = Boolean(urlErrorCode && urlErrorCode !== 'not_organiser');
  const [view, setView] = useState<View>(() => (skipsCheck ? { kind: 'form' } : { kind: 'checking' }));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusHeading, setFocusHeading] = useState(false);
  const [signedOutHere, setSignedOutHere] = useState(false);

  useEffect(() => {
    if (view.kind !== 'checking' || skipsCheck) return;
    let cancelled = false;
    (async () => {
      let session: { user: { email?: string | null } } | null = null;
      try {
        session = (await supabaseBrowser().auth.getSession()).data.session;
      } catch {
        // show form
      }
      if (cancelled) return;
      if (!session) {
        setView({ kind: 'form' });
        return;
      }

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
        setView({ kind: 'form', checkFailed: true });
      } else {
        setView({
          kind: 'practitioner',
          email: session.user.email ?? null,
          accountComplete: state.accountComplete,
          unlinkedCount: state.unlinkedCount,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind, skipsCheck, router, next, isInvite]);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  if (view.kind === 'checking' && !skipsCheck) return <LoginShell />;

  if (view.kind === 'practitioner') {
    return (
      <LoginLayout>
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
        {isInvite ? 'Sign in to accept your invite' : 'Sign in'}
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        {isInvite ? (
          "No password. We'll email a one-tap link, then return you to your invite."
        ) : (
          <>
            Staff emails only. Need an account as a practitioner?{' '}
            <Link
              href="/account/sign-up"
              className="font-semibold text-[color:var(--on-primary-container)] hover:underline"
            >
              Attendee sign up
            </Link>
            .
          </>
        )}
      </p>

      {!isInvite && <ControlledAccessNotice contactLabel="Contact an admin to be added" />}

      <MagicLinkSignInForm
        submitMagicLink={sendMagicLink}
        initialError={
          view.kind === 'form' && view.checkFailed
            ? resolveAuthError('unavailable')
            : signedOutHere
              ? null
              : urlErr
        }
        next={next}
        audience={isInvite ? 'invitee' : 'organizer'}
        submitLabel="Continue"
      />

      <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant text-center m-0">
        The link expires after 15 minutes and works once.
      </p>

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
          <li>
            Open the link in the same browser you asked for it in. A link opened on another device,
            or inside a mail app&apos;s built-in browser, won&apos;t sign you in.
          </li>
          {isInvite ? (
            <li>
              Your invite link is separate from the sign-in link, and works once. If it stops
              working, ask your admin for a new one.
            </li>
          ) : (
            <>
              <li>
                Only organizer emails can sign in. If yours isn&apos;t on the list, ask an admin to
                add you.
              </li>
              <li>Changing address? Sign in with your current one, then update it from Settings.</li>
              <li>
                Lost access to your inbox entirely? Ask an admin to update your organizer record —
                magic-link-only sign-in means we can&apos;t self-serve you back in from this screen.
              </li>
            </>
          )}
        </ul>
      </details>
    </LoginLayout>
  );
}

function PractitionerPanel({
  email,
  hasRecord,
  onSignedOut,
}: {
  email: string | null;
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
      setPending(false);
      setFailed(true);
    }
  }

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
      className={cn(
        buttonVariants({ variant: hasRecord ? 'default' : 'outline' }),
        hasRecord ? primary : cta,
      )}
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
            <strong className="font-semibold text-on-surface [overflow-wrap:anywhere]">{email}</strong>.
            This email isn&apos;t on an organiser team.
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

function LoginShell() {
  return (
    <LoginLayout>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Sign in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">Loading…</p>
    </LoginLayout>
  );
}
