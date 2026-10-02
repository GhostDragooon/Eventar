'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { SiteShell } from '@/components/shell/SiteShell';
import { cn } from '@/lib/utils';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { acceptInvite } from './actions';

type View =
  | { kind: 'ready' }
  | { kind: 'confirm'; email: string | null }
  | { kind: 'success'; orgName: string };

// What the action returns on failure; the page's own errors (a dropped
// connection, a failed sign-out) use the same shape.
type Failure = Extract<Awaited<ReturnType<typeof acceptInvite>>, { error: string }>;

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  // null = the browser session has not been read yet.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // Shown so someone signed in under a personal address does not join a team as
  // that identity without noticing (user-lens round 2, m1).
  const [email, setEmail] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'ready' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The pressed button is disabled while the action runs, which drops keyboard
  // focus on <body>. When a retryable error lands, focus goes to the error itself:
  // a screen reader reads it where focus is (moving focus to the button instead
  // can cut the alert short), and Shift+Tab is one step back to the button.
  const alertRef = useRef<HTMLParagraphElement>(null);

  // An invitee signs in through the organiser door and comes back here (B1,
  // 2026-09-25). The shell's own "Sign in" pill is the practitioner door and
  // would drop the invite on the floor.
  const signInHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;

  // Read the session in the browser so a signed-out visitor is offered the
  // sign-in link up front rather than an accept button that can only fail. The
  // action re-checks on the server either way: if the browser session turns
  // out to be stale, its error carries the same link.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let has = false;
      let who: string | null = null;
      try {
        // No session, or an unreadable one, collapses to "signed out" on purpose.
        const session = (await supabaseBrowser().auth.getSession()).data.session;
        has = Boolean(session);
        who = session?.user.email ?? null;
      } catch {
        // Unreadable storage: offer the sign-in link rather than an invite card
        // with no action at all.
      }
      if (!cancelled) {
        setSignedIn(has);
        setEmail(who);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The card the visitor just pressed a button in is replaced by the prompt,
  // the success screen or the closing frame; put focus on the new heading
  // rather than <body>.
  useEffect(() => {
    if (view.kind !== 'ready' || error?.final) headingRef.current?.focus();
  }, [view.kind, error?.final]);

  useEffect(() => {
    if (error && !error.final) alertRef.current?.focus();
  }, [error]);

  async function accept(confirmed: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await acceptInvite(token, { confirmed });
      if ('error' in res) {
        setError(res);
      } else if ('needsConfirm' in res) setView({ kind: 'confirm', email: res.email });
      else setView({ kind: 'success', orgName: res.orgName });
    } catch {
      // A rejected Server Action (network down) must not leave a dead button.
      setError({ error: "We couldn't reach Eventar just now. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  // D3: the invitee chose a separate organiser email. Sign out explicitly, then
  // the organiser door, carrying the invite.
  async function switchToAnotherEmail() {
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await supabaseBrowser().auth.signOut();
      if (signOutError) throw signOutError;
      router.push(signInHref);
      // Stay "pending" while the navigation completes.
    } catch {
      setPending(false);
      setError({ error: "Couldn't sign you out. Try again." });
    }
  }

  const signInLink = (
    <Link href={signInHref} className={cn(buttonVariants(), 'min-h-11 w-full')}>
      Sign in to accept
    </Link>
  );

  const errorBlock = error && (
    <>
      <p
        ref={alertRef}
        tabIndex={-1}
        role="alert"
        className="mb-md rounded-xl bg-error-container p-md text-on-error-container text-body-md outline-none"
      >
        {error.error}
      </p>
      {error.needsSignIn && <div className="mb-md">{signInLink}</div>}
    </>
  );

  // Used, expired, unknown, or already a member: nothing on this page can fix
  // it, so say why and what to do next instead of leaving a live button.
  if (error?.final) {
    return (
      <InviteFrame>
        <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-md" aria-hidden>
          {error.alreadyMember ? 'group' : 'link_off'}
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="font-headline-md text-headline-md text-on-surface mb-sm text-balance outline-none">
          {error.alreadyMember ? "You're already on this team" : "This invite can't be used"}
        </h1>
        <p className={cn('font-body-lg text-body-lg text-on-surface-variant', (error.alreadyMember || error.used) && 'mb-lg')}>
          {error.error}
        </p>
        {error.alreadyMember && (
          <Button onClick={() => router.push('/dashboard')} className="min-h-11 w-full">
            Go to dashboard
          </Button>
        )}
        {/* They may be the person who used this link: they joined, then reopened
            the email. "Ask your admin for a new one" is the wrong advice for them. */}
        {error.used && !error.alreadyMember && (
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="min-h-11 w-full">
            Already joined? Go to your dashboard
          </Button>
        )}
      </InviteFrame>
    );
  }

  if (view.kind === 'success') {
    return (
      <InviteFrame>
        <span className="material-symbols-outlined text-[48px] text-success mb-md" aria-hidden>check_circle</span>
        <h1 ref={headingRef} tabIndex={-1} className="font-headline-md text-headline-md text-on-surface mb-sm text-balance outline-none">You&apos;re in!</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg [overflow-wrap:anywhere]">
          You&apos;ve joined <strong>{view.orgName}</strong>
          {email ? ` as ${email}` : ''}.
        </p>
        <Button onClick={() => router.push('/dashboard')} className="min-h-11 w-full">
          Go to dashboard
        </Button>
      </InviteFrame>
    );
  }

  if (view.kind === 'confirm') {
    return (
      <InviteFrame>
        <span className="material-symbols-outlined text-[48px] text-primary mb-md" aria-hidden>info</span>
        <h1 ref={headingRef} tabIndex={-1} className="font-headline-md text-headline-md text-on-surface mb-md text-balance outline-none">
          This email already has practitioner records
        </h1>
        <div className="mb-lg flex flex-col gap-md text-left font-body-lg text-body-lg text-on-surface-variant">
          <p>
            {/* The explicit space is deliberate: Next 16.2.12's SWC drops the space
                after a closing tag when a multi-line text node also holds an
                entity. tests/jsxWhitespace.test.ts guards the class. */}
            <strong className="[overflow-wrap:anywhere]">{view.email ?? 'This email'}</strong>{' '}
            has practitioner records on Eventar (profile, licences or event registrations).
          </p>
          <p>
            If you accept with this email, those records stay saved, but you won&apos;t be able to open them while
            it&apos;s an organiser account. We recommend signing up for your organiser account with a different email.
          </p>
        </div>
        {errorBlock}
        <div className="flex flex-col gap-sm">
          <Button onClick={switchToAnotherEmail} disabled={pending} className="min-h-11 w-full">
            Use a different email
          </Button>
          <Button variant="outline" onClick={() => accept(true)} disabled={pending} className="min-h-11 w-full">
            Accept with this email anyway
          </Button>
        </div>
      </InviteFrame>
    );
  }

  return (
    <InviteFrame>
      <span className="material-symbols-outlined text-[48px] text-primary mb-md" aria-hidden>group_add</span>
      <h1 className="font-headline-md text-headline-md text-on-surface mb-sm text-balance">Join your team</h1>
      <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg">
        You&apos;ve been invited to join an organisation on Eventar. Click below to accept.
        {signedIn === true && email && (
          <span className="mt-sm block [overflow-wrap:anywhere]">
            You&apos;re signed in as <strong>{email}</strong>.
          </span>
        )}
      </p>
      {errorBlock}
      {signedIn === true && (
        <Button onClick={() => accept(false)} disabled={pending} className="min-h-11 w-full">
          {pending ? 'Joining…' : 'Accept invite'}
        </Button>
      )}
      {signedIn === false && signInLink}
    </InviteFrame>
  );
}

function InviteFrame({ children }: { children: React.ReactNode }) {
  return (
    // No `active` item: this page belongs to none of the nav entries, and
    // marking Home as "you are here" was wrong (as the organiser door, M1).
    <SiteShell>
      {/* py-xl, as the door pages have: the spacing token is xxl, so the py-2xl
          this had set no padding at all and the card sat under the sticky header. */}
      <div className="mx-auto max-w-md px-md py-xl text-center">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-xl shadow-sm">
          {children}
        </div>
      </div>
    </SiteShell>
  );
}
