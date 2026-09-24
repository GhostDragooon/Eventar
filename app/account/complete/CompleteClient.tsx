'use client';

// Guided account-completion flow. Style oracle: AccountClient.tsx /
// ProfileClient.tsx (SectionCard/FieldGroup, status banner pattern,
// useTransition per action). Reuses the SAME server actions those pages
// call — no new RPCs, no new definer functions. See page.tsx for the
// design-pipeline rationale.
//
// Plan: docs/plans/2026-09-16-practitioner-account-creation-plan.md Phase 5.

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  declareMyLicence,
  updateMyAccount,
  updateMyProfessionalProfile,
  uploadAvatar,
} from '../actions';
import { acceptRequiredConsents } from './actions';
import type { AccountView, AccreditingBodyView, LicenceRowView, ProfessionalProfileView } from '../schema';
import type { ControlledListOption } from './schema';

type Status =
  | null
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const SALUTATIONS = ['Dr', 'Prof', 'Mr', 'Ms', 'Mx'];
const STEP_LABELS = ['Consent', 'Identity', 'Professional', 'Licence'] as const;

export function CompleteClient({
  initialStep,
  initialAccount,
  initialProfile,
  initialLicences,
  activeBodies,
  professions,
  positions,
  specialties,
}: {
  initialStep: number;
  initialAccount: AccountView;
  initialProfile: ProfessionalProfileView | null;
  initialLicences: LicenceRowView[];
  activeBodies: AccreditingBodyView[];
  professions: ControlledListOption[];
  positions: ControlledListOption[];
  specialties: (ControlledListOption & { profession_code: string | null })[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), 4));

  // Step 1 — consent
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentStatus, setConsentStatus] = useState<Status>(null);
  const [consentPending, startConsentTransition] = useTransition();

  // Step 2 — identity
  const [account, setAccount] = useState<AccountView>(initialAccount);
  const [identityStatus, setIdentityStatus] = useState<Status>(null);
  const [identityPending, startIdentityTransition] = useTransition();

  // Step 3 — professional profile
  const [profile, setProfile] = useState({
    profession_code: initialProfile?.profession_code ?? '',
    specialty_code: initialProfile?.specialty_code ?? '',
    specialty_other: initialProfile?.specialty_other ?? '',
    position_code: initialProfile?.position_code ?? '',
    position_other: initialProfile?.position_other ?? '',
    workplace_text: initialProfile?.workplace_text ?? '',
    department_text: initialProfile?.department_text ?? '',
  });
  const [profileStatus, setProfileStatus] = useState<Status>(null);
  const [profilePending, startProfileTransition] = useTransition();

  // Step 4 — licence + optional photo
  const [licences, setLicences] = useState<LicenceRowView[]>(initialLicences);
  const [bodyId, setBodyId] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceStatus, setLicenceStatus] = useState<Status>(null);
  const [licencePending, startLicenceTransition] = useTransition();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<Status>(null);
  const [avatarPending, startAvatarTransition] = useTransition();

  const hasLicence = licences.some((l) => l.status === 'declared' || l.status === 'verified');
  const filteredSpecialties = specialties.filter((s) => s.profession_code === profile.profession_code);
  // Only 'medicine' has seeded specialties today (write-up §5: "cardiac /
  // cardiovascular is the first populated set"). Every other profession has
  // zero rows here — dev-review CRITICAL finding: without this check, the
  // free-text fallback was reachable only via picking code 'other', which
  // does not exist when filteredSpecialties is empty, permanently disabling
  // Continue for every non-medicine practitioner. needsFreeText covers
  // "nothing to pick from" the same way 'other' does.
  const specialtyNeedsFreeText = filteredSpecialties.length === 0 || profile.specialty_code === 'other';

  // "Other" alone doesn't say anything — mirrors AccountClient.tsx's
  // positionFilled readiness check (stricter than the DB gate, which treats
  // the literal string 'other' as any other non-blank value). Used to gate
  // the Continue button since HTML5 `required` can't express "this value
  // requires that OTHER field to also be filled."
  const specialtyFilled = specialtyNeedsFreeText
    ? profile.specialty_other.trim() !== ''
    : profile.specialty_code !== '';
  const positionFilled =
    profile.position_code !== '' && profile.position_code !== 'other'
      ? true
      : profile.position_other.trim() !== '';
  const professionalStepValid =
    profile.profession_code !== '' &&
    specialtyFilled &&
    positionFilled &&
    profile.workplace_text.trim() !== '' &&
    profile.department_text.trim() !== '';

  function onAcceptConsent() {
    setConsentStatus(null);
    startConsentTransition(async () => {
      const result = await acceptRequiredConsents();
      if (result.ok) {
        setStep(2);
      } else {
        setConsentStatus({
          kind: 'error',
          message:
            result.error === 'rate_limited'
              ? 'Too many attempts in a short window. Please wait a moment.'
              : 'Could not record your consent right now. Please try again.',
        });
      }
    });
  }

  function onSaveIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIdentityStatus(null);
    startIdentityTransition(async () => {
      const result = await updateMyAccount({
        first_name: account.first_name || null,
        last_name: account.last_name || null,
        salutation: account.salutation || null,
        phone: account.phone || null,
      });
      if (result.ok) {
        setStep(3);
      } else {
        setIdentityStatus({
          kind: 'error',
          message:
            result.error === 'rate_limited'
              ? 'Too many updates in a short window. Please wait a moment.'
              : 'Some fields need attention. Please check and try again.',
        });
      }
    });
  }

  function onSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileStatus(null);
    startProfileTransition(async () => {
      const result = await updateMyProfessionalProfile({
        profession_code: profile.profession_code || null,
        specialty_code: profile.specialty_code || null,
        specialty_other: profile.specialty_other.trim() || null,
        position_code: profile.position_code || null,
        position_other: profile.position_other.trim() || null,
        workplace_text: profile.workplace_text.trim() || null,
        department_text: profile.department_text.trim() || null,
      });
      if (result.ok) {
        setStep(4);
      } else {
        setProfileStatus({
          kind: 'error',
          message:
            result.error === 'rate_limited'
              ? 'Too many updates in a short window. Please wait a moment.'
              : 'Some fields need attention. Please check and try again.',
        });
      }
    });
  }

  function onDeclareLicence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLicenceStatus(null);
    startLicenceTransition(async () => {
      const result = await declareMyLicence({ body_id: bodyId, licence_number: licenceNumber.trim() });
      if (result.ok) {
        const body = activeBodies.find((b) => b.id === bodyId);
        setLicences((prev) => [
          {
            id: result.data.licence_id,
            body_id: bodyId,
            body_short_name: body?.short_name ?? null,
            licence_number: licenceNumber.trim(),
            licence_type: null,
            track: null,
            status: 'declared',
            is_primary: false,
            declared_at: new Date().toISOString(),
            verified_at: null,
            cycle_started_on: null,
          },
          ...prev,
        ]);
        setBodyId('');
        setLicenceNumber('');
        setLicenceStatus({ kind: 'success', message: 'Licence declared.' });
      } else {
        setLicenceStatus({
          kind: 'error',
          message:
            result.error === 'already_declared'
              ? "You've already declared this licence number at that body."
              : result.error === 'body_inactive'
                ? "That body isn't accepting new licences right now."
                : result.error === 'rate_limited'
                  ? 'Too many attempts in a short window. Please wait a moment.'
                  : result.error === 'invalid_input'
                    ? 'Fill both fields — a body and a licence number.'
                    : 'Could not declare right now. Please try again.',
        });
      }
    });
  }

  function onUploadAvatar() {
    if (!avatarFile) return;
    setAvatarStatus(null);
    startAvatarTransition(async () => {
      const formData = new FormData();
      formData.set('file', avatarFile);
      const result = await uploadAvatar(formData);
      if (result.ok) {
        setAvatarStatus({ kind: 'success', message: 'Photo uploaded.' });
      } else {
        setAvatarStatus({
          kind: 'error',
          message:
            result.error === 'invalid_input'
              ? 'That file is too large or not a supported image type (JPEG, PNG, or WebP, up to 5MB).'
              : result.error === 'rate_limited'
                ? 'Too many attempts in a short window. Please wait a moment.'
                : 'Could not upload right now. Please try again.',
        });
      }
    });
  }

  function onFinish() {
    router.push('/account/record');
  }

  return (
    <div className="space-y-md">
      <header className="space-y-xs">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
          <span className="text-[color:var(--on-primary-container)]">Account</span>
          <span className="text-on-surface-variant"> · Complete your profile</span>
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          A few things before you start
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Your CPD/CME records aren&apos;t accessible until this is done. It takes about two minutes —
          after this, event registration only ever asks about the event.
        </p>
      </header>

      <StepIndicator current={step} />

      <StepPanel stepKey={step}>
        {step === 1 && (
          <SectionCard icon="fact_check" title="Privacy and terms">
            <p className="font-body-md text-body-md text-on-surface-variant m-0">
              Eventar uses your professional identity to release CME/CPD credit for events you attend.
              By continuing, you accept the current{' '}
              <span className="font-medium text-on-surface">Terms of Service</span> and{' '}
              <span className="font-medium text-on-surface">Privacy Policy</span>.
            </p>
            <label className="mt-md flex items-start gap-sm cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-outline-variant"
              />
              <span className="font-body-md text-body-md text-on-surface">
                I accept the Terms of Service and Privacy Policy.
              </span>
            </label>
            {consentStatus && <StatusBanner status={consentStatus} />}
            <div className="mt-md flex justify-end">
              <Button type="button" onClick={onAcceptConsent} disabled={!consentChecked || consentPending}>
                {consentPending ? 'Saving…' : 'Continue'}
              </Button>
            </div>
          </SectionCard>
        )}

        {step === 2 && (
          <form onSubmit={onSaveIdentity}>
            <SectionCard icon="badge" title="Identity">
              <div className="grid gap-md md:grid-cols-2">
                <FieldGroup label="Salutation">
                  <select
                    value={account.salutation ?? ''}
                    onChange={(e) => setAccount((prev) => ({ ...prev, salutation: e.target.value || null }))}
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  >
                    <option value="">—</option>
                    {SALUTATIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FieldGroup>
                <div />
                <FieldGroup label="First name">
                  <Input
                    value={account.first_name ?? ''}
                    onChange={(e) => setAccount((prev) => ({ ...prev, first_name: e.target.value || null }))}
                    autoComplete="given-name"
                    maxLength={120}
                    required
                  />
                </FieldGroup>
                <FieldGroup label="Last name">
                  <Input
                    value={account.last_name ?? ''}
                    onChange={(e) => setAccount((prev) => ({ ...prev, last_name: e.target.value || null }))}
                    autoComplete="family-name"
                    maxLength={120}
                    required
                  />
                </FieldGroup>
                <FieldGroup label="Phone">
                  <Input
                    value={account.phone ?? ''}
                    onChange={(e) => setAccount((prev) => ({ ...prev, phone: e.target.value || null }))}
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={40}
                    placeholder="+852 …"
                    required
                  />
                </FieldGroup>
              </div>
              {identityStatus && <StatusBanner status={identityStatus} />}
              <div className="mt-md flex items-center justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={
                    identityPending ||
                    !(account.first_name ?? '').trim() ||
                    !(account.last_name ?? '').trim() ||
                    !(account.phone ?? '').trim()
                  }
                >
                  {identityPending ? 'Saving…' : 'Continue'}
                </Button>
              </div>
            </SectionCard>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={onSaveProfile}>
            <SectionCard icon="work" title="Professional profile">
              <div className="grid gap-md md:grid-cols-2">
                <FieldGroup label="Profession">
                  <select
                    value={profile.profession_code}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, profession_code: e.target.value, specialty_code: '' }))
                    }
                    required
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  >
                    <option value="">Select…</option>
                    {professions.map((p) => (
                      <option key={p.code} value={p.code}>{p.label_en}</option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="Specialty">
                  <select
                    value={profile.specialty_code}
                    onChange={(e) => setProfile((prev) => ({ ...prev, specialty_code: e.target.value }))}
                    disabled={!profile.profession_code || filteredSpecialties.length === 0}
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm disabled:opacity-50"
                  >
                    <option value="">
                      {filteredSpecialties.length === 0 && profile.profession_code ? 'Not listed yet — use the field below' : 'Select…'}
                    </option>
                    {filteredSpecialties.map((s) => (
                      <option key={s.code} value={s.code}>{s.label_en}</option>
                    ))}
                  </select>
                </FieldGroup>
                {/* Renders whenever there's nothing to pick from (this
                    profession has no seeded specialties yet — true for
                    every profession except medicine today), 'other' was
                    picked, or existing data already lives in this field
                    (legacy rows, or a value that no longer matches any
                    controlled-list code) — dev-review CRITICAL + finding 6. */}
                {specialtyNeedsFreeText || profile.specialty_other.trim() !== '' ? (
                  <FieldGroup label={filteredSpecialties.length === 0 ? 'Specialty' : 'Specialty (if not listed)'}>
                    <Input
                      value={profile.specialty_other}
                      onChange={(e) => setProfile((prev) => ({ ...prev, specialty_other: e.target.value }))}
                      maxLength={500}
                      required={specialtyNeedsFreeText}
                    />
                  </FieldGroup>
                ) : null}
                <FieldGroup label="Position / rank">
                  <select
                    value={profile.position_code}
                    onChange={(e) => setProfile((prev) => ({ ...prev, position_code: e.target.value }))}
                    required={!profile.position_other.trim()}
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  >
                    <option value="">Select…</option>
                    {positions.map((p) => (
                      <option key={p.code} value={p.code}>{p.label_en}</option>
                    ))}
                  </select>
                </FieldGroup>
                {profile.position_code === 'other' && (
                  <FieldGroup label="Position (if not listed)">
                    <Input
                      value={profile.position_other}
                      onChange={(e) => setProfile((prev) => ({ ...prev, position_other: e.target.value }))}
                      maxLength={500}
                    />
                  </FieldGroup>
                )}
                <FieldGroup label="Workplace">
                  <Input
                    value={profile.workplace_text}
                    onChange={(e) => setProfile((prev) => ({ ...prev, workplace_text: e.target.value }))}
                    placeholder="e.g. Queen Mary Hospital"
                    maxLength={500}
                    required
                  />
                </FieldGroup>
                <FieldGroup label="Department">
                  <Input
                    value={profile.department_text}
                    onChange={(e) => setProfile((prev) => ({ ...prev, department_text: e.target.value }))}
                    placeholder="e.g. Cardiology"
                    maxLength={500}
                    required
                  />
                </FieldGroup>
              </div>
              {profileStatus && <StatusBanner status={profileStatus} />}
              <div className="mt-md flex items-center justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button type="submit" disabled={profilePending || !professionalStepValid}>
                  {profilePending ? 'Saving…' : 'Continue'}
                </Button>
              </div>
            </SectionCard>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-md">
            <SectionCard icon="verified" title="Licence">
              <p className="font-body-md text-body-md text-on-surface-variant m-0 mb-md">
                Declare at least one licence to release CME/CPD points at that accrediting body.
              </p>
              {hasLicence ? (
                <ul className="flex flex-col gap-sm m-0 p-0 list-none mb-md">
                  {licences.map((l) => (
                    <li key={l.id} className="flex items-center gap-sm">
                      <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-[color:var(--on-primary-container)]" aria-hidden data-fill="1">
                        check_circle
                      </span>
                      <span className="font-title-md text-title-md text-on-surface">{l.body_short_name ?? 'Body'}</span>
                      <span className="font-mono font-body-md text-body-md text-on-surface-variant">{l.licence_number}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <form onSubmit={onDeclareLicence} className="flex flex-col gap-md">
                  <div className="grid gap-md md:grid-cols-2">
                    <FieldGroup label="Accrediting body">
                      <select
                        value={bodyId}
                        onChange={(e) => setBodyId(e.target.value)}
                        required
                        disabled={licencePending}
                        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                      >
                        <option value="">Select a body…</option>
                        {activeBodies.map((b) => (
                          <option key={b.id} value={b.id}>{b.short_name} — {b.full_name}</option>
                        ))}
                      </select>
                    </FieldGroup>
                    <FieldGroup label="Licence number">
                      <Input
                        value={licenceNumber}
                        onChange={(e) => setLicenceNumber(e.target.value)}
                        required
                        placeholder="e.g. M12345"
                        maxLength={120}
                        disabled={licencePending}
                      />
                    </FieldGroup>
                  </div>
                  {licenceStatus && <StatusBanner status={licenceStatus} />}
                  <div className="flex justify-end">
                    <Button type="submit" disabled={licencePending || !bodyId || !licenceNumber.trim()}>
                      {licencePending ? 'Declaring…' : 'Declare licence'}
                    </Button>
                  </div>
                </form>
              )}
            </SectionCard>

            <SectionCard icon="account_circle" title="Photo (optional)">
              <p className="font-body-md text-body-md text-on-surface-variant m-0 mb-md">
                Skippable — add one now or later from your profile. JPEG, PNG, or WebP, up to 5MB.
              </p>
              <div className="flex items-center gap-md flex-wrap">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  disabled={avatarPending}
                  className="font-body-md text-body-md text-on-surface-variant"
                />
                <Button type="button" variant="outline" onClick={onUploadAvatar} disabled={!avatarFile || avatarPending}>
                  {avatarPending ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
              {avatarStatus && <StatusBanner status={avatarStatus} />}
            </SectionCard>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button type="button" onClick={onFinish} disabled={!hasLicence}>
                Done
              </Button>
            </div>
          </div>
        )}
      </StepPanel>
    </div>
  );
}

// Restrained CSS-only step transition (emilkowalski-motion: transform +
// opacity only, ~200ms, no library — none is installed in this project).
// Remounts on stepKey change via key={stepKey}, then flips into its
// entered state on the next frame. motion-reduce collapses to an instant
// swap, same pattern as SiteShell's nav CTA hover.
function StepPanel({ children, stepKey }: { children: React.ReactNode; stepKey: number }) {
  return (
    <div key={stepKey}>
      <StepPanelInner>{children}</StepPanelInner>
    </div>
  );
}

function StepPanelInner({ children }: { children: React.ReactNode }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {children}
    </div>
  );
}

// Step indicator — ui-ux-pro-max Forms §8 (multi-step-progress: "show step
// indicator or progress bar; allow back navigation"). Four small dots
// with labels; current step filled, completed steps show a check.
function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-xs m-0 p-0 list-none" aria-label="Progress">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-xs flex-1 min-w-0">
            <div className="flex items-center gap-xs flex-1 min-w-0">
              <span
                aria-current={active ? 'step' : undefined}
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  done
                    ? 'bg-primary-fixed text-primary-ink'
                    : active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {done ? (
                  <span className="material-symbols-outlined text-[14px]" aria-hidden data-fill="1">check</span>
                ) : (
                  n
                )}
              </span>
              <span
                className={`font-label-md text-label-md truncate ${
                  active ? 'text-on-surface font-semibold' : 'text-on-surface-variant'
                }`}
              >
                {label}
              </span>
            </div>
            {n < STEP_LABELS.length && <span className="h-px flex-1 bg-outline-variant" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function SectionCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
      <div className="flex items-center gap-md mb-md">
        <div aria-hidden className="w-10 h-10 rounded-full bg-primary-fixed text-primary-ink flex items-center justify-center">
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

function StatusBanner({ status }: { status: NonNullable<Status> }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-md font-body-md text-body-md rounded-lg px-md py-sm border ${
        status.kind === 'success'
          ? 'text-on-success-container bg-success-container border-success-container'
          : 'text-on-error-container bg-error-container border-error-container'
      }`}
    >
      {status.message}
    </div>
  );
}
