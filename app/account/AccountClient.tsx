'use client';

// Attendee-facing account editor. Style oracle: app/settings/SettingsClient.tsx
// SectionCard pattern (bg-surface-container-lowest border border-outline-variant
// rounded-[20px] p-lg shadow-sm) + Base UI Input from components/ui/input.
//
// Plan §7.1 fields: first_name, last_name, salutation, preferred_name,
// phone (+ phone_country_code), country_code, display_language. full_name
// stays canonical + NOT-NULL — Server Action refreshes it from
// first+last when both are set (see updateMyAccount in ./actions.ts,
// following plan §1.8).
//
// Not in this slice (Stage C): licence declare/list, profile edit are on
// /account/profile; claim past events is on /account/claim.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SignOutAction } from '@/components/auth/SignOutAction';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { changeEmail, claimMyRegistrations, resendVerificationEmail, updateMyAccount } from './actions';
import type { AccountView, ProfessionalProfileView } from './schema';

type Status =
  | null
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const SALUTATIONS = ['Dr', 'Prof', 'Mr', 'Ms', 'Mx'];
const LANGUAGES: Array<{ value: 'en' | 'zh-Hant' | 'zh-Hans'; label: string }> = [
  { value: 'en',      label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'zh-Hans', label: '简体中文' },
];

export function AccountClient({
  initialAccount,
  initialProfile,
  initialUnlinkedCount = 0,
  email = '',
  emailConfirmed = false,
}: {
  initialAccount: AccountView;
  initialProfile: ProfessionalProfileView | null;
  /**
   * Count of guest registrations matching the caller's email that are still
   * unlinked (server-computed via getUnlinkedRegistrationCount). > 0 shows
   * the "we found N registrations" banner; a successful inline claim drops
   * the local count to 0 and hides it. Defaults to 0 so older callers /
   * tests do not need to thread it.
   */
  initialUnlinkedCount?: number;
  /**
   * The caller's currently-signed-in email (from auth.getUser()). Displayed
   * in the Session card; also the address the "Resend verification" button
   * would target if unconfirmed. Defaults to '' so older callers/tests do
   * not need to thread it — the sign-out button still works with an empty
   * label.
   */
  email?: string;
  /**
   * Whether the caller's email has been confirmed (F1). When false, the
   * "Verify your email" section appears with a resend button. Defaults to
   * FALSE — the honest direction for a Rule-12 warning: a caller that
   * forgets to thread this shows an extra prompt (worst case: nag someone
   * already verified), rather than silently hiding the safety signal.
   * Flipped per dev-lens MINOR 3.
   */
  emailConfirmed?: boolean;
}) {
  const [account, setAccount] = useState<AccountView>(initialAccount);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const [unlinkedCount, setUnlinkedCount] = useState<number>(initialUnlinkedCount);
  const [claimStatus, setClaimStatus] = useState<Status>(null);
  const [claimPending, startClaimTransition] = useTransition();
  // Local status for the resend-verification button — kept separate from the
  // save-form status so a resend attempt doesn't clobber a save toast, and
  // vice-versa. Same pattern as claimStatus/status.
  const [resendStatus, setResendStatus] = useState<Status>(null);
  const [resendPending, startResendTransition] = useTransition();

  // Change-email state — moved here from ProfileClient (user-lens BLOCKER
  // 1: attendees look for account controls on /account, not on the
  // professional profile page). Same shared Server Action either way; the
  // page passes `next=/account` so the confirmation click on the new
  // address inbox lands back here.
  const [emailNew, setEmailNew] = useState<string>('');
  const [emailChangeStatus, setEmailChangeStatus] = useState<Status>(null);
  const [emailChangePending, startEmailChangeTransition] = useTransition();

  function onChangeEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailChangeStatus(null);
    startEmailChangeTransition(async () => {
      const result = await changeEmail(emailNew, '/account');
      if (result.ok) {
        setEmailNew('');
        setEmailChangeStatus({
          kind: 'success',
          message: `Confirmation sent to ${result.data.new_email}. Click the link there to complete the change — your email won't update until you do.`,
        });
      } else {
        setEmailChangeStatus({
          kind: 'error',
          message:
            result.error === 'invalid_email'
              ? 'That doesn’t look like a valid email address.'
              : result.error === 'same_email'
                ? 'That’s already your email.'
                : result.error === 'email_exists'
                  ? 'Another account already uses that email.'
                  : result.error === 'rate_limited'
                    ? 'Too many attempts in a short window. Please wait a moment.'
                    : 'Could not send the confirmation right now. Please try again.',
        });
      }
    });
  }

  function onResendVerification() {
    setResendStatus(null);
    startResendTransition(async () => {
      const result = await resendVerificationEmail();
      if (result.ok) {
        setResendStatus({
          kind: 'success',
          message: `Verification email sent to ${email}. Click the link there to confirm your address.`,
        });
      } else {
        setResendStatus({
          kind: 'error',
          message:
            result.error === 'already_confirmed'
              ? 'Your email is already verified — no need to resend.'
              : result.error === 'rate_limited'
                ? 'Too many attempts in a short window. Please wait a moment.'
                : 'Could not send right now. Please try again.',
        });
      }
    });
  }

  function onClaim() {
    setClaimStatus(null);
    startClaimTransition(async () => {
      const result = await claimMyRegistrations();
      if (result.ok) {
        setUnlinkedCount(0);
        const n = result.data.claimed;
        setClaimStatus({
          kind: 'success',
          message:
            n === 0
              ? 'Nothing new to link. Your registrations are already up to date.'
              : n === 1
                ? 'Linked 1 registration to your account.'
                : `Linked ${n} registrations to your account.`,
        });
      } else {
        setClaimStatus({
          kind: 'error',
          message:
            result.error === 'email_unverified'
              ? 'Confirm your email first (check your inbox for a link from Eventar).'
              : result.error === 'rate_limited'
                ? 'Too many attempts in a short window. Please wait a moment.'
                : 'Could not link right now. Please try again.',
        });
      }
    });
  }

  function set<K extends keyof AccountView>(key: K, value: AccountView[K]) {
    setAccount((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await updateMyAccount({
        first_name:         account.first_name         || null,
        last_name:          account.last_name          || null,
        salutation:         account.salutation         || null,
        preferred_name:     account.preferred_name     || null,
        phone:              account.phone              || null,
        phone_country_code: account.phone_country_code || null,
        country_code:       account.country_code       || null,
        display_language:   (account.display_language as 'en' | 'zh-Hant' | 'zh-Hans'),
      });
      if (result.ok) {
        setStatus({ kind: 'success', message: `Saved. You appear as “${result.data.full_name}”.` });
        setAccount((prev) => ({ ...prev, full_name: result.data.full_name }));
      } else {
        setStatus({
          kind: 'error',
          message:
            result.error === 'rate_limited'
              ? 'Too many updates in a short window. Please wait a moment.'
              : result.error === 'invalid_input'
              ? 'Some fields need attention. Please check and try again.'
              : 'Could not save right now. Please try again.',
        });
      }
    });
  }

  return (
    <div className="space-y-md">
      <header className="space-y-xs">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
          <span className="text-[color:var(--on-primary-container)]">Account</span>
          <span className="text-on-surface-variant"> · {account.full_name}</span>
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          Your account
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Update how your name and contact appear on registrations.
          Full name is used for emails, badges, and your event roster.
        </p>
      </header>

      {/* Walk-in flow banner: surfaces the "system checks email → match" step
          without silent auto-linking (Stage C decision Q3 kept — the claim is
          still explicit). Renders only when the server-computed count is > 0;
          a successful claim drops the local count to 0 and hides it without a
          refresh. */}
      {unlinkedCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="bg-primary-fixed border border-outline-variant rounded-[20px] p-lg flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-md">
            <div
              aria-hidden
              className="w-10 h-10 rounded-full bg-surface-container-lowest text-primary-ink flex items-center justify-center shrink-0"
            >
              <span className="material-symbols-outlined text-[calc(20px*var(--text-scale))]" data-fill="1">link</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-title-md text-title-md text-on-surface m-0">
                {unlinkedCount === 1
                  ? 'We found 1 unlinked registration for your email.'
                  : `We found ${unlinkedCount} unlinked registrations for your email.`}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant m-0 mt-xs">
                Link them to your account so CPD credit can be released once your profile is complete.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Button
              type="button"
              onClick={onClaim}
              disabled={claimPending}
              aria-label={
                claimPending
                  ? 'Linking registrations…'
                  : unlinkedCount === 1
                    ? 'Link 1 registration to my account'
                    : `Link ${unlinkedCount} registrations to my account`
              }
            >
              {claimPending ? 'Linking…' : 'Link them'}
            </Button>
          </div>
        </div>
      )}
      {claimStatus && (
        <div
          role="status"
          aria-live="polite"
          className={
            claimStatus.kind === 'success'
              ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm'
              : 'font-body-md text-body-md text-on-error-container bg-error-container border border-error-container rounded-lg px-md py-sm'
          }
        >
          {claimStatus.message}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-md">
        <SectionCard icon="badge" title="Identity">
          <div className="grid gap-md md:grid-cols-2">
            <FieldGroup label="Salutation">
              <select
                value={account.salutation ?? ''}
                onChange={(e) => set('salutation', e.target.value || null)}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                <option value="">—</option>
                {SALUTATIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FieldGroup>
            <FieldGroup label="Preferred name">
              <Input
                value={account.preferred_name ?? ''}
                onChange={(e) => set('preferred_name', e.target.value || null)}
                placeholder="Optional — how we address you"
                maxLength={120}
              />
            </FieldGroup>
            <FieldGroup label="First name">
              <Input
                value={account.first_name ?? ''}
                onChange={(e) => set('first_name', e.target.value || null)}
                autoComplete="given-name"
                maxLength={120}
              />
            </FieldGroup>
            <FieldGroup label="Last name">
              <Input
                value={account.last_name ?? ''}
                onChange={(e) => set('last_name', e.target.value || null)}
                autoComplete="family-name"
                maxLength={120}
              />
            </FieldGroup>
          </div>
          <p className="mt-md font-body-md text-body-md text-on-surface-variant">
            Your display name is “{account.full_name}”. Filling both
            first and last name here refreshes it on your next save.
          </p>
        </SectionCard>

        <SectionCard icon="call" title="Contact">
          <div className="grid gap-md md:grid-cols-[minmax(0,7rem)_1fr_minmax(0,10rem)]">
            <FieldGroup label="Country code">
              <Input
                value={account.phone_country_code ?? ''}
                onChange={(e) => set('phone_country_code', e.target.value || null)}
                placeholder="+852"
                inputMode="tel"
                maxLength={8}
              />
            </FieldGroup>
            <FieldGroup label="Phone (optional)">
              <Input
                value={account.phone ?? ''}
                onChange={(e) => set('phone', e.target.value || null)}
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                placeholder="No SMS sent yet — for future notifications"
              />
            </FieldGroup>
            <FieldGroup label="Country (ISO)">
              <Input
                value={account.country_code ?? ''}
                onChange={(e) => set('country_code', (e.target.value.toUpperCase() || null))}
                placeholder="HK"
                maxLength={2}
              />
            </FieldGroup>
          </div>
        </SectionCard>

        <SectionCard icon="translate" title="Display language">
          <div className="max-w-xs">
            <FieldGroup label="Language">
              <select
                value={account.display_language}
                onChange={(e) => set('display_language', e.target.value as AccountView['display_language'])}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </FieldGroup>
          </div>
        </SectionCard>

        {status && (
          <div
            role="status"
            aria-live="polite"
            className={
              status.kind === 'success'
                ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm'
                : 'font-body-md text-body-md text-on-error-container bg-error-container border border-error-container rounded-lg px-md py-sm'
            }
          >
            {status.message}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-md">
          <div className="flex gap-md flex-wrap">
            <Link
              href="/account/profile"
              className="text-sm font-medium text-primary-ink hover:underline"
            >
              {initialProfile
                ? 'Edit professional profile & licences'
                : 'Add professional profile & licences'}
            </Link>
            <Link
              href="/account/claim"
              className="text-sm font-medium text-primary-ink hover:underline"
            >
              Link past registrations
            </Link>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      {/* Verify-email prompt: only when the caller is signed in but has not
          confirmed. Blocks F1 (and therefore CPD credit release + claim); a
          resend button here means they never have to wonder how to get a
          fresh link. Hidden once confirmed — the server truth (email_confirmed_at)
          gates the render, not client state. */}
      {!emailConfirmed && (
        <SectionCard icon="mark_email_unread" title="Verify your email">
          <p className="font-body-md text-body-md text-on-surface-variant m-0">
            Your email <span className="font-medium text-on-surface">{email}</span> hasn&apos;t
            been verified yet. Verification is required before we can link
            past registrations or release CPD credit.
          </p>
          <div className="mt-md flex items-center justify-between flex-wrap gap-md">
            <p className="font-body-md text-body-md text-on-surface-variant m-0">
              {/* Swap the invitation line once a resend has just succeeded so
                  the CTA-adjacent copy doesn't invite a duplicate click while
                  the success toast says the opposite (user-lens IMPORTANT 3). */}
              {resendStatus?.kind === 'success'
                ? 'A fresh link was just sent — check your inbox.'
                : 'Didn’t receive the link, or it expired? Send a fresh one.'}
            </p>
            <Button
              type="button"
              onClick={onResendVerification}
              disabled={resendPending || resendStatus?.kind === 'success'}
              aria-label="Resend verification email"
            >
              {resendPending ? 'Sending…' : resendStatus?.kind === 'success' ? 'Link sent' : 'Resend verification email'}
            </Button>
          </div>
          {resendStatus && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-md ${
                resendStatus.kind === 'success'
                  ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm'
                  : 'font-body-md text-body-md text-on-error-container bg-error-container border border-error-container rounded-lg px-md py-sm'
              }`}
            >
              {resendStatus.message}
            </div>
          )}
        </SectionCard>
      )}

      {/* Change email — sits on /account (not /account/profile) because
          attendees look for account controls here, not on the professional
          profile page (user-lens BLOCKER 1). Same shared Server Action as
          organizer /settings, differing only in the next= param routing the
          post-confirmation click back here. The change isn't live until the
          caller clicks the link in the new-address inbox. */}
      <SectionCard icon="alternate_email" title="Change email">
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Your current email is{' '}
          <span className="font-medium text-on-surface">{email || '—'}</span>. Changing
          it sends a confirmation link to the new address — the change only
          applies once you click that link.
        </p>
        <form onSubmit={onChangeEmail} className="mt-md flex flex-col gap-md">
          <label className="block">
            <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">New email</span>
            <Input
              value={emailNew}
              onChange={(e) => setEmailNew(e.target.value)}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              required
              disabled={emailChangePending}
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={emailChangePending || !emailNew.trim()}>
              {emailChangePending ? 'Sending…' : 'Send confirmation'}
            </Button>
          </div>
        </form>
        {emailChangeStatus && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-md ${
              emailChangeStatus.kind === 'success'
                ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm'
                : 'font-body-md text-body-md text-on-error-container bg-error-container border border-error-container rounded-lg px-md py-sm'
            }`}
          >
            {emailChangeStatus.message}
          </div>
        )}
      </SectionCard>

      {/* Session card — matches organizer /settings' Session block. The
          sign-out uses the same client-side supabase.auth.signOut() pattern as
          SettingsSignOut, differing only in the post-signout destination
          (attendee → '/', organizer → '/login'). The audience-boundary rule
          says an attendee door should never dump into an organizer door. */}
      <SectionCard icon="logout" title="Session">
        {email && (
          <p className="font-body-md text-body-md text-on-surface-variant m-0 mb-md">
            Signed in as <span className="font-medium text-on-surface">{email}</span>.
          </p>
        )}
        <SignOutAction
          signOut={async () => {
            await supabaseBrowser().auth.signOut();
            window.location.href = '/';
          }}
        />
        <p className="mt-md font-body-md text-body-md text-on-surface-variant m-0">
          Appearance and text size follow your device settings.
        </p>
      </SectionCard>
    </div>
  );
}

// Mirror of app/settings/SettingsClient.tsx's SettingsSection helper.
// Duplicated because Ivan's Stage C constraint is "match style verbatim, do
// not reinvent" — a shared extraction would be a follow-up cleanup, not
// this slice.
function SectionCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
      <div className="flex items-center gap-md mb-md">
        <div
          aria-hidden
          className="w-10 h-10 rounded-full bg-primary-fixed text-primary-ink flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-[calc(20px*var(--text-scale))]">{icon}</span>
        </div>
        <h2 className="font-headline-sm text-[calc(20px*var(--text-scale))] text-on-surface">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">{label}</span>
      {children}
    </label>
  );
}
