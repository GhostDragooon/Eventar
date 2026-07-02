'use client';
import { Suspense, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendMagicLink } from './actions';
import { PublicShell } from '@/components/shell/PublicShell';

const URL_ERROR_MESSAGES: Record<string, string> = {
  missing_code:    'The sign-in link was missing its verification code. Request a new one below.',
  exchange_failed: 'The sign-in link has expired or already been used. Request a new one below.',
  not_authorized:  'Your email is not on the staff list. Contact an admin to be added.',
};

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
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-lg px-grid-margin py-xxl">
        {children}
      </div>
    </PublicShell>
  );
}

function LoginForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Surface ?error=… from /auth/callback or /proxy redirects so users see why
  // they bounced back here instead of guessing they're stuck in a loop.
  const urlErrorCode = useSearchParams().get('error');
  const urlErr = urlErrorCode
    ? (URL_ERROR_MESSAGES[urlErrorCode] ?? `Sign-in failed: ${urlErrorCode}`)
    : null;
  const err = actionErr ?? urlErr;

  return (
    <LoginLayout>
      {/* LG v2 (locked): eyebrow `Sign in · Eventar` + "Welcome back". */}
      <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
        <span className="text-[color:var(--on-primary-container)]">Sign in</span>
        <span className="text-on-surface-variant"> · Eventar</span>
      </p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
        Welcome back
      </h1>
      {/* §3 sentence stack — single sentence, m-0 so the container gap is the sole rhythm authority. */}
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        No password here — we&apos;ll email you a one-tap sign-in link.
      </p>

      <form
        action={(fd) =>
          start(async () => {
            setMsg(null);
            setActionErr(null);
            const res = await sendMagicLink(fd);
            if ('error' in res) setActionErr(res.error);
            else setMsg('Check your inbox for a sign-in link.');
          })
        }
        className="flex flex-col gap-md"
      >
        <label className="block">
          <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface mb-xs">
            Email
          </span>
          {/* The field announces itself: 2px accent border + soft accent halo. */}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="w-full rounded-lg border-2 border-[color:var(--on-primary-container)] shadow-[0_0_0_4px_rgba(0,112,243,0.08)] bg-surface-container-lowest px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-[color:var(--on-primary-container)]/40 transition-shadow"
          />
        </label>
        <button
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-sm rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md py-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden>mail</span>
          {pending ? 'Sending…' : 'Send magic link'}
        </button>
        <p className="font-body-md text-[12px] text-on-surface-variant text-center m-0">
          The link expires after 15 minutes and works once.
        </p>

        {msg && (
          <p className="font-body-md text-body-md text-on-surface bg-secondary-container border border-secondary-container rounded-lg px-md py-sm flex items-start gap-sm">
            <span className="material-symbols-outlined text-primary text-[18px] mt-[2px]" aria-hidden>
              mark_email_read
            </span>
            <span>{msg}</span>
          </p>
        )}
        {err && (
          <p
            role="alert"
            className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
          >
            <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>warning</span>
            <span>{err}</span>
          </p>
        )}
      </form>

      {/* Recovery — "Trouble signing in?" (locked: NOT "Forgot password";
          there is no password in a magic-link flow). */}
      <details className="group">
        <summary className="cursor-pointer font-body-md text-body-md text-[color:var(--on-primary-container)] hover:underline list-none">
          Trouble signing in?
        </summary>
        <ul className="mt-sm font-body-md text-[13px] text-on-surface-variant leading-relaxed list-disc pl-lg flex flex-col gap-xs">
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
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">Sign in</h1>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">Loading…</p>
    </LoginLayout>
  );
}
