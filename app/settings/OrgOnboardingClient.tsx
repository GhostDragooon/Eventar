'use client';

// WP-D — organisation first-run capture. Mechanical: reuses the existing
// Input/Button/select conventions from SettingsClient.tsx and AccountClient.tsx
// verbatim, just new fields on the established form idiom.
//
// Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 6.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { completeOrgOnboarding } from './orgActions';
import type { ControlledListOption } from '../account/complete/schema';

type Status = null | { kind: 'success'; message: string } | { kind: 'error'; message: string };

const ORG_TYPES: Array<{ value: string; label: string }> = [
  { value: 'training_provider', label: 'Training provider' },
  { value: 'professional_body', label: 'Professional body' },
  { value: 'academic_institution', label: 'Academic institution' },
  { value: 'conference_producer', label: 'Conference producer' },
  { value: 'law_firm', label: 'Law firm' },
  { value: 'accounting_firm', label: 'Accounting firm' },
  { value: 'corporate_lnd', label: 'Corporate L&D' },
  { value: 'medical_society', label: 'Medical society' },
  { value: 'other', label: 'Other' },
];

const SCALES: Array<{ value: string; label: string }> = [
  { value: '1-10', label: '1–10 events a year' },
  { value: '11-50', label: '11–50 events a year' },
  { value: '51-200', label: '51–200 events a year' },
  { value: '201+', label: '201+ events a year' },
];

export function OrgOnboardingClient({
  contactEmailDefault,
  professions,
  specialties,
}: {
  contactEmailDefault: string;
  professions: ControlledListOption[];
  specialties: ControlledListOption[];
}) {
  const router = useRouter();
  const [organisationType, setOrganisationType] = useState('');
  const [professionsServed, setProfessionsServed] = useState<string[]>([]);
  const [specialtiesServed, setSpecialtiesServed] = useState<string[]>([]);
  const [scale, setScale] = useState('');
  const [contactEmail, setContactEmail] = useState(contactEmailDefault);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  function toggle(list: string[], setList: (v: string[]) => void, code: string) {
    setList(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await completeOrgOnboarding({
        organisation_type: organisationType,
        professions_served: professionsServed,
        specialties_served: specialtiesServed,
        approximate_scale: scale,
        contact_email: contactEmail.trim(),
        primary_contact_name: contactName.trim(),
        primary_contact_role: contactRole.trim(),
      });
      if (result.ok) {
        setStatus({ kind: 'success', message: 'Organisation profile saved.' });
        router.refresh();
      } else {
        setStatus({ kind: 'error', message: result.error });
      }
    });
  }

  const valid =
    organisationType !== '' &&
    scale !== '' &&
    contactEmail.trim() !== '' &&
    contactName.trim() !== '' &&
    contactRole.trim() !== '';

  return (
    <section className="mb-xl bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
      <h2 className="font-title-lg text-title-lg text-on-surface mb-xs">Tell us about your organisation</h2>
      <p className="font-body-md text-body-md text-on-surface-variant mb-md">
        A one-time step so we can tailor Eventar to how you run events.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-md">
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
            Organisation type
          </span>
          <select
            value={organisationType}
            onChange={(e) => setOrganisationType(e.target.value)}
            required
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          >
            <option value="">Select…</option>
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
            Professions served (optional)
          </span>
          <div className="flex flex-wrap gap-xs">
            {professions.map((p) => (
              <button
                type="button"
                key={p.code}
                onClick={() => toggle(professionsServed, setProfessionsServed, p.code)}
                className={`rounded-full px-sm py-1 text-[calc(12px*var(--text-scale))] border ${
                  professionsServed.includes(p.code)
                    ? 'bg-primary-fixed text-primary-ink border-transparent'
                    : 'bg-transparent text-on-surface-variant border-outline-variant'
                }`}
              >
                {p.label_en}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
            Specialties served (optional)
          </span>
          <div className="flex flex-wrap gap-xs">
            {specialties.map((s) => (
              <button
                type="button"
                key={s.code}
                onClick={() => toggle(specialtiesServed, setSpecialtiesServed, s.code)}
                className={`rounded-full px-sm py-1 text-[calc(12px*var(--text-scale))] border ${
                  specialtiesServed.includes(s.code)
                    ? 'bg-primary-fixed text-primary-ink border-transparent'
                    : 'bg-transparent text-on-surface-variant border-outline-variant'
                }`}
              >
                {s.label_en}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">
            Typical scale
          </span>
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            required
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          >
            <option value="">Select…</option>
            {SCALES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-md md:grid-cols-3">
          <label className="block">
            <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">Contact email</span>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" required maxLength={254} />
          </label>
          <label className="block">
            <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">Primary contact name</span>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} required maxLength={200} />
          </label>
          <label className="block">
            <span className="block font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-xs">Their role</span>
            <Input value={contactRole} onChange={(e) => setContactRole(e.target.value)} required maxLength={200} placeholder="e.g. Programme Manager" />
          </label>
        </div>

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

        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !valid}>
            {pending ? 'Saving…' : 'Save organisation profile'}
          </Button>
        </div>
      </form>
    </section>
  );
}
