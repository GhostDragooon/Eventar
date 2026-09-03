'use client';

// Professional profile editor. Same style oracle as AccountClient.tsx.
// Plan §7.2 fields + storage-only speaker_discovery_opt_in.
//
// The three F3-adjacent fields (workplace_text, position_code,
// profession_code) are what the F1-F5 gate requires for CPD credit release
// — a helper strip at the top of the form calls that out so a signed-in
// user knows what "profile complete enough to release credit" means.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateMyProfessionalProfile } from '../actions';
import type { ProfessionalProfileView } from '../schema';

type Status =
  | null
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type FormState = {
  workplace_text: string;
  position_code: string;
  position_other: string;
  profession_code: string;
  specialty_code: string;
  specialty_other: string;
  department_text: string;
  biography: string;
  speaker_discovery_opt_in: boolean;
};

function toForm(p: ProfessionalProfileView | null): FormState {
  return {
    workplace_text:            p?.workplace_text            ?? '',
    position_code:             p?.position_code             ?? '',
    position_other:            p?.position_other            ?? '',
    profession_code:           p?.profession_code           ?? '',
    specialty_code:            p?.specialty_code            ?? '',
    specialty_other:           p?.specialty_other           ?? '',
    department_text:           p?.department_text           ?? '',
    biography:                 p?.biography                 ?? '',
    speaker_discovery_opt_in:  p?.speaker_discovery_opt_in  ?? false,
  };
}

export function ProfileClient({
  initialProfile,
}: {
  initialProfile: ProfessionalProfileView | null;
}) {
  const [form, setForm] = useState<FormState>(toForm(initialProfile));
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const isNew = initialProfile === null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await updateMyProfessionalProfile({
        workplace_text:            form.workplace_text.trim()  || null,
        position_code:             form.position_code.trim()   || null,
        position_other:            form.position_other.trim()  || null,
        profession_code:           form.profession_code.trim() || null,
        specialty_code:            form.specialty_code.trim()  || null,
        specialty_other:           form.specialty_other.trim() || null,
        department_text:           form.department_text.trim() || null,
        biography:                 form.biography.trim()       || null,
        speaker_discovery_opt_in:  form.speaker_discovery_opt_in,
      });
      if (result.ok) {
        setStatus({
          kind: 'success',
          message: result.data.profile_created
            ? 'Profile created. You can update it anytime.'
            : 'Saved.',
        });
      } else {
        setStatus({
          kind: 'error',
          message:
            result.error === 'rate_limited'
              ? 'Too many updates in a short window. Please wait a moment.'
              : result.error === 'invalid_input'
              ? 'Some fields need attention. Blank values must contain something other than whitespace.'
              : 'Could not save right now. Please try again.',
        });
      }
    });
  }

  const f3Ready =
    form.workplace_text.trim() !== '' &&
    (form.position_code.trim() !== '' || form.position_other.trim() !== '') &&
    form.profession_code.trim() !== '';

  return (
    <div className="space-y-md">
      <header className="space-y-xs">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
          <span className="text-[color:var(--on-primary-container)]">Profile</span>
          <span className="text-on-surface-variant"> · Professional</span>
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          {isNew ? 'Add your professional profile' : 'Your professional profile'}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Snapshotted onto every event you register for after this page saves.
          Past registrations keep whatever profile you had at the time.
        </p>
      </header>

      <div
        role="status"
        aria-live="polite"
        className={
          f3Ready
            ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm flex items-start gap-sm'
            : 'font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm'
        }
      >
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
          {f3Ready ? 'check_circle' : 'info'}
        </span>
        <span className="flex-1">
          {f3Ready
            ? 'Your profile meets the CPD release requirements (workplace, position, and profession are set).'
            : 'To release CPD credit, fill workplace, either a position code or position (other), and profession. Everything else is optional.'}
        </span>
      </div>

      <form onSubmit={onSubmit} className="space-y-md">
        <SectionCard icon="apartment" title="Workplace">
          <FieldGroup label="Workplace">
            <Input
              value={form.workplace_text}
              onChange={(e) => set('workplace_text', e.target.value)}
              placeholder="e.g. Queen Mary Hospital"
              maxLength={500}
            />
          </FieldGroup>
          <div className="mt-md">
            <FieldGroup label="Department (optional)">
              <Input
                value={form.department_text}
                onChange={(e) => set('department_text', e.target.value)}
                placeholder="e.g. Cardiology"
                maxLength={500}
              />
            </FieldGroup>
          </div>
        </SectionCard>

        <SectionCard icon="work" title="Role">
          <div className="grid gap-md md:grid-cols-2">
            <FieldGroup label="Position code">
              <Input
                value={form.position_code}
                onChange={(e) => set('position_code', e.target.value)}
                placeholder="e.g. consultant"
                maxLength={120}
              />
            </FieldGroup>
            <FieldGroup label="Position (other)">
              <Input
                value={form.position_other}
                onChange={(e) => set('position_other', e.target.value)}
                placeholder="If your role isn't in the list"
                maxLength={500}
              />
            </FieldGroup>
            <FieldGroup label="Profession">
              <Input
                value={form.profession_code}
                onChange={(e) => set('profession_code', e.target.value)}
                placeholder="e.g. medicine"
                maxLength={120}
              />
            </FieldGroup>
            <div />
            <FieldGroup label="Specialty">
              <Input
                value={form.specialty_code}
                onChange={(e) => set('specialty_code', e.target.value)}
                placeholder="e.g. cardiology"
                maxLength={120}
              />
            </FieldGroup>
            <FieldGroup label="Specialty (other)">
              <Input
                value={form.specialty_other}
                onChange={(e) => set('specialty_other', e.target.value)}
                placeholder="If your specialty isn't in the list"
                maxLength={500}
              />
            </FieldGroup>
          </div>
        </SectionCard>

        <SectionCard icon="mic" title="Speaker preferences">
          <FieldGroup label="Biography (optional)">
            <textarea
              value={form.biography}
              onChange={(e) => set('biography', e.target.value)}
              placeholder="A short bio for events where you are a speaker."
              maxLength={4000}
              rows={5}
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
          </FieldGroup>
          <label className="mt-md flex items-start gap-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.speaker_discovery_opt_in}
              onChange={(e) => set('speaker_discovery_opt_in', e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-outline-variant"
            />
            <span className="flex-1">
              <span className="block font-body-md text-body-md text-on-surface">
                Discoverable as a potential speaker
              </span>
              <span className="block font-body-md text-body-md text-on-surface-variant mt-xs">
                Storage-only in this slice — no discovery product yet. Opt in
                if you want to be considered when we build it.
              </span>
            </span>
          </label>
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
          <Link
            href="/account"
            className="text-sm font-medium text-primary-ink hover:underline"
          >
            Back to account
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : isNew ? 'Create profile' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

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
