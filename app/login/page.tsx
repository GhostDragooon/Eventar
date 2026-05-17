'use client';
import { Suspense, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { sendMagicLink } from './actions';

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
    <main className="min-h-screen grid place-items-center p-6 bg-gray-50">
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
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-4"
      >
        <h1 className="text-2xl font-semibold">Sign in to Eventar</h1>
        <p className="text-sm text-gray-600">
          We&apos;ll email you a one-tap sign-in link.
        </p>
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/10"
        />
        <button
          disabled={pending}
          className="w-full rounded-md bg-black text-white py-2 font-medium disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Email me a link'}
        </button>
        {msg && <p className="text-sm text-green-700">{msg}</p>}
        {err && <p className="text-sm text-red-700">{err}</p>}
      </form>
    </main>
  );
}

// Static skeleton shown during the Suspense fallback (effectively zero-time;
// useSearchParams resolves synchronously on the client, but Next needs the
// boundary at prerender time).
function LoginShell() {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Sign in to Eventar</h1>
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    </main>
  );
}
