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
//   M3  no top branding on attendee surfaces — BUT login is the staff entry
//       point and branding belongs here (explicit user direction). Wordmark
//       above the hero stack; everything else stays content-first.
function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-lg px-grid-margin py-xxl">
        <p
          aria-label="Eventar"
          className="m-0 text-center text-[28px] font-bold tracking-tight text-on-surface"
        >
          Eventar
        </p>
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
      <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
        Sign in
      </h1>
      {/* §3 sentence stack — single sentence, m-0 so the container gap is the sole rhythm authority. */}
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        We&apos;ll email you a one-tap sign-in link.
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
          <input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
        </label>
        <button
          disabled={pending}
          className="w-full rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md py-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Email me a link'}
        </button>

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
