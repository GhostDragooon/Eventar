'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendMagicLink } from './actions';
import { SiteShell } from '@/components/shell/SiteShell';
import { MagicLinkSignInForm } from '@/components/auth/MagicLinkSignInForm';
import { ControlledAccessNotice } from '@/components/auth/ControlledAccessNotice';
import { resolveAuthError } from '@/components/auth/auth-error-messages';

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
function LoginLayout({ children }: { children: React.ReactNode }) {
  // SiteShell = the public website chrome (Home · Upcoming events · Sign in)
  // so there's always a way back to the landing from here. Card container
  // keeps the form from floating bare on the page.
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

function LoginForm() {
  // Surface ?error=… from /auth/callback or /proxy redirects so users see why
  // they bounced back here instead of guessing they're stuck in a loop.
  // resolveAuthError is the shared Category-02 dictionary (components/auth/
  // auth-error-messages.ts), kept byte-identical to this page's four known
  // codes; its one behavioural difference is the unknown-code fallback,
  // which is a fixed generic string here instead of reflecting the raw code
  // into the page — a deliberate hardening, not a regression.
  const urlErrorCode = useSearchParams().get('error');
  const urlErr = resolveAuthError(urlErrorCode);

  return (
    <LoginLayout>
      {/* LG v2 (locked) set this eyebrow as `Sign in · Eventar`. Reworded to
          "Log in" 2026-08-08 (Ivan): one label per intent across the product,
          and the nav, the landing CTA and this page were saying three
          different things for the same destination. */}
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
        <span className="text-[color:var(--on-primary-container)]">Log in</span>
        <span className="text-on-surface-variant"> · Eventar</span>
      </p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
        Welcome back
      </h1>
      {/* §3 sentence stack — single sentence, m-0 so the container gap is the sole rhythm authority. */}
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        No password here — we&apos;ll email you a one-tap sign-in link.
      </p>

      <ControlledAccessNotice contactLabel="Contact an admin to be added" />

      <MagicLinkSignInForm submitMagicLink={sendMagicLink} initialError={urlErr} />

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
          <li>Links expire after 15 minutes and work once — request a fresh one above.</li>
          <li>Check spam, and make sure you opened the newest email.</li>
          <li>Only staff emails can sign in. If yours isn&apos;t on the list, ask an admin to add you.</li>
          <li>Lost access to your email? An admin can update your staff record to a new address.</li>
        </ul>
      </details>
    </LoginLayout>
  );
}

// Static skeleton shown during the Suspense fallback (effectively zero-time;
// useSearchParams resolves synchronously on the client, but Next needs the
// boundary at prerender time).
function LoginShell() {
  return (
    <LoginLayout>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Log in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">Loading…</p>
    </LoginLayout>
  );
}
