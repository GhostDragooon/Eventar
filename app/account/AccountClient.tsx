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
import { claimMyRegistrations, updateMyAccount } from './actions';
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
}) {
  const [account, setAccount] = useState<AccountView>(initialAccount);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const [unlinkedCount, setUnlinkedCount] = useState<number>(initialUnlinkedCount);
  const [claimStatus, setClaimStatus] = useState<Status>(null);
  const [claimPending, startClaimTransition] = useTransition();

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
