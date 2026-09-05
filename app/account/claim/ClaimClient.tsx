'use client';

// Explicit-button claim UX (Stage C decision Q3). Renders a card explaining
// what "link past registrations" means, a Claim button, and a result surface
// that distinguishes "we linked N" from "nothing to link".

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { claimMyRegistrations } from '../actions';
import { claimErrorCopy } from '../claimErrorCopy';

type Status =
  | null
  | { kind: 'linked'; count: number }
  | { kind: 'nothing' }
  | { kind: 'error'; message: string };

export function ClaimClient({
  email,
  emailVerified,
}: {
  email: string;
  emailVerified: boolean;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function onClaim() {
    setStatus(null);
    startTransition(async () => {
      const result = await claimMyRegistrations();
      if (!result.ok) {
        // H4 — one dictionary; do NOT branch per-caller. Copy for
        // email_unverified now says the actual next step (check inbox) —
        // matches what AccountClient shows for the same error.
        setStatus({ kind: 'error', message: claimErrorCopy(result.error) });
        return;
      }
      setStatus(
        result.data.claimed > 0
          ? { kind: 'linked', count: result.data.claimed }
          : { kind: 'nothing' },
      );
    });
  }

  return (
    <div className="space-y-md">
      <header className="space-y-xs">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
          <span className="text-[color:var(--on-primary-container)]">Account</span>
          <span className="text-on-surface-variant"> · Link past events</span>
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          Link your past registrations
        </h1>
      </header>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm space-y-md">
        <div className="flex items-start gap-md">
          <div
            aria-hidden
            className="w-10 h-10 rounded-full bg-primary-fixed text-primary-ink flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-[calc(20px*var(--text-scale))]">link</span>
          </div>
          <div className="flex-1">
            <h2 className="font-headline-sm text-[calc(20px*var(--text-scale))] text-on-surface m-0">
              We&apos;ll link any past registration under {email || 'your email'}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
              This connects registrations you made as a guest — before you
              had an account — to this profile, so held CME/CPD points can be
              released once your profile and licence are complete.
            </p>
            <ul className="font-body-md text-body-md text-on-surface-variant mt-md list-disc pl-lg space-y-xs">
              <li>Only matches your own verified email — nobody else&apos;s.</li>
              <li>Safe to run again — nothing happens if there&apos;s nothing new to link.</li>
              <li>Won&apos;t change any name or details you already saved on a past registration.</li>
            </ul>
          </div>
        </div>

        {!emailVerified && (
          <div
            role="status"
            aria-live="polite"
            className="font-body-md text-body-md text-on-warning-container bg-warning-container border border-warning-container rounded-lg px-md py-sm flex items-start gap-sm"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
              info
            </span>
            <span className="flex-1">
              Your email isn&apos;t verified yet.{' '}
              <Link href="/account" className="font-medium text-primary-ink underline">
                Head to your account
              </Link>{' '}
              to resend the confirmation link.
            </span>
          </div>
        )}

        {status?.kind === 'linked' && (
          <div
            role="status"
            aria-live="polite"
            className="font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm flex items-start gap-sm"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden data-fill="1">
              check_circle
            </span>
            <span className="flex-1">
              Linked {status.count} past {status.count === 1 ? 'registration' : 'registrations'} to your account.
            </span>
          </div>
        )}

        {status?.kind === 'nothing' && (
          <div
            role="status"
            aria-live="polite"
            className="font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
              info
            </span>
            <span className="flex-1">
              Nothing to link — no past guest registrations were found under
              your email. You&apos;re all set.{' '}
              <Link href="/account" className="font-medium text-primary-ink underline">
                Back to your account
              </Link>
              .
            </span>
          </div>
        )}

        {status?.kind === 'error' && (
          <div
            role="status"
            aria-live="polite"
            className="font-body-md text-body-md text-on-error-container bg-error-container border border-error-container rounded-lg px-md py-sm"
          >
            {status.message}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-md">
          <Link
            href="/account"
            className="text-sm font-medium text-primary-ink hover:underline"
          >
            Back to account
          </Link>
          <Button type="button" onClick={onClaim} disabled={pending || !emailVerified}>
            {pending ? 'Linking…' : 'Link my past registrations'}
          </Button>
        </div>
      </section>
    </div>
  );
}
