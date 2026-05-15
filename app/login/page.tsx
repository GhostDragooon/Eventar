'use client';
import { useState, useTransition } from 'react';
import { sendMagicLink } from './actions';

export default function LoginPage() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-gray-50">
      <form
        action={(fd) =>
          start(async () => {
            setMsg(null);
            setErr(null);
            const res = await sendMagicLink(fd);
            if ('error' in res) setErr(res.error);
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
