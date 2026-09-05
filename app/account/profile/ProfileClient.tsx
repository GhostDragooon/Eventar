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
import { declareMyLicence, updateMyProfessionalProfile } from '../actions';
import type {
  AccreditingBodyView,
  LicenceRowView,
  ProfessionalProfileView,
} from '../schema';

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
  initialLicences = [],
  activeBodies = [],
}: {
  initialProfile: ProfessionalProfileView | null;
  /**
   * Caller's own practitioner_licences rows, already app-joined with body
   * short_name (server-side, see listMyLicences). Renders the "Licences"
   * SectionCard's list; empty is a valid render (form still shows).
   */
  initialLicences?: LicenceRowView[];
  /**
   * Active accrediting bodies for the declare picker. A body that goes
   * inactive after a licence was declared still shows in the list (via its
   * cached body_short_name), but drops out of the picker.
   */
  activeBodies?: AccreditingBodyView[];
}) {
  const [form, setForm] = useState<FormState>(toForm(initialProfile));
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const isNew = initialProfile === null;

  // Licence declare state — kept local to this component because there is
  // exactly one licence surface today. If a second consumer emerges, hoist.
  const [licences, setLicences] = useState<LicenceRowView[]>(initialLicences);
  const [lBodyId, setLBodyId] = useState<string>('');
  const [lNumber, setLNumber] = useState<string>('');
  const [licenceStatus, setLicenceStatus] = useState<Status>(null);
  const [licencePending, startLicenceTransition] = useTransition();

  function onDeclareLicence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLicenceStatus(null);
    startLicenceTransition(async () => {
      const result = await declareMyLicence({
        body_id: lBodyId,
        licence_number: lNumber.trim(),
      });
      if (result.ok) {
        // Optimistic append: the RPC returns the licence id, but not the
        // full joined row — synthesize one from the picker + form so the
        // list updates without a page reload. A subsequent server render
        // (via revalidatePath in the action) will produce the canonical row.
        // is_primary: false ALWAYS — declare_licence never grants
        // is_primary=true (migration 20260814200000 omits it from the
        // INSERT, column default false). Only set_primary_licence and the
        // supersession primary-carry-forward do. Faking true here (as an
        // earlier draft did) is the "control one layer above where the
        // write happens" pattern — the client would show a Primary pill
        // for state the platform did not actually grant, until a hard
        // navigation replaced the optimistic row. Dev-lens CRITICAL.
        const body = activeBodies.find((b) => b.id === lBodyId);
        setLicences((prev) => [
          {
            id: result.data.licence_id,
            body_id: lBodyId,
            body_short_name: body?.short_name ?? null,
            licence_number: lNumber.trim(),
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
        setLBodyId('');
        setLNumber('');
        setLicenceStatus({
          kind: 'success',
          message:
            'Licence declared. Credit release also needs a confirmed email, accepted consents, and a complete profile — see the checklist at the top of this page. If you’ve already checked in to an event today, reopen your pass to see the updated credit status (or wait for reception to refresh it).',
        });
      } else {
        setLicenceStatus({
          kind: 'error',
          message:
            result.error === 'already_declared'
              ? "You've already declared this licence number at that body."
              : result.error === 'body_inactive'
                ? "That body isn't accepting new licences right now."
                : result.error === 'body_not_found'
                  // Unreachable via the picker (which lists only active
                  // bodies), so fold into the generic "refresh and retry"
                  // rather than dead-end the user with "not found" and no
                  // next step. User-lens CONFUSING.
                  ? 'Could not declare right now. Refresh the page and try again.'
                  : result.error === 'invalid_input'
                    ? 'Fill both fields — a body and a licence number.'
                    : result.error === 'rate_limited'
                      ? 'Too many attempts in a short window. Please wait a moment.'
                      : 'Could not declare right now. Please try again.',
        });
      }
    });
  }

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
  // F4 gate — a declared licence in a non-terminal state. Lapsed/revoked/
  // superseded rows exist in the caller's history but don't unlock credit,
  // so the "ready" signal must exclude them. Pairing this with f3Ready in
  // the banner below closes the "profile looks green but the check-in gate
  // still trips" hazard user-lens caught (BLOCKER).
  const f4Ready = licences.some((l) => l.status === 'declared' || l.status === 'verified');
  const gatesReady = f3Ready && f4Ready;

  // C1/C2 — credential label. Default is the generic HK-neutral phrasing
  // Ivan locked in the terminology table. When a body is picked, prefer a
  // body-shape label if the short_name tells us we're talking to a
  // Fellowship-issuing college (HKAM's 15 Colleges — every one is HKC*,
  // e.g. HKCP, HKCPath, HKCPsych) or a statutory register (MCHK / AHP*).
  // Anything else falls back to the generic. Small map, not a taxonomy —
  // upgrade path: move to a column on accrediting_bodies when a body needs
  // wording we can't infer from its short_name.
  //   ponytail: string-prefix map, replace with a column when a body forces it.
  const selectedBody = activeBodies.find((b) => b.id === lBodyId);
  const credentialLabel = credentialLabelForBody(selectedBody?.short_name);

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

      {/* F3+F4 combined readiness banner. Goes green ONLY when both the
          profile fields (workplace / position / profession — F3) AND a
          non-terminal licence (declared or verified — F4) are in place.
          User-lens BLOCKER: a green banner with no licence declared is a
          lie — the caller would pass F3 but trip F4 silently at check-in.
          Bullet list under the green copy names the remaining F1/F2/F5
          gates so no user reads "green" as "you're done." */}
      <div
        role="status"
        aria-live="polite"
        className={
          gatesReady
            ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm flex items-start gap-sm'
            : 'font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm'
        }
      >
        <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
          {gatesReady ? 'check_circle' : 'info'}
        </span>
        <span className="flex-1">
          {gatesReady ? (
            <>
              Profile and licences are in place. CME/CPD points at events for
              your declared bodies will release automatically after
              check-in, provided your email is confirmed and consents are
              accepted.
            </>
          ) : (
            <>
              To release CME/CPD points you need all of the following:
              <ul className="list-disc pl-lg mt-xs mb-0">
                <li>
                  Workplace + position + profession filled below —{' '}
                  <span className={f3Ready ? 'text-on-success-container font-semibold' : 'font-semibold'}>
                    {f3Ready ? 'done' : 'not yet'}
                  </span>.
                </li>
                <li>
                  At least one active licence declared for the accrediting body —{' '}
                  <span className={f4Ready ? 'text-on-success-container font-semibold' : 'font-semibold'}>
                    {f4Ready ? 'done' : 'not yet'}
                  </span>.
                </li>
                <li>Confirmed email address, and platform + privacy consents accepted (handled at sign-in).</li>
              </ul>
            </>
          )}
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

      {/* Licences — a SIBLING of the profile form, never a child. The declare
          box below is its own <form>, which is invalid HTML nested inside
          another <form> (H2). Splitting them also matches how a user thinks:
          "profile fields I edit" vs "credentials I declare against a body." */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
        <div className="flex items-center gap-md mb-md">
          <div
            aria-hidden
            className="w-10 h-10 rounded-full bg-primary-fixed text-primary-ink flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[calc(20px*var(--text-scale))]">verified</span>
          </div>
          <h2 className="font-headline-sm text-[calc(20px*var(--text-scale))] text-on-surface">Licences</h2>
        </div>
        {licences.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant m-0">
            No licences declared yet. Declare one below to release CME/CPD points
            at that accrediting body once your profile is complete.
          </p>
        ) : (
          <ul className="flex flex-col gap-sm m-0 p-0 list-none">
            {licences.map((l) => {
              // C6 — Primary badge shows only when this body carries more
              // than one licence, not when the caller has more than one
              // licence overall. A single licence at HKCP is still trivially
              // primary at HKCP even if a second licence at MCHK exists.
              const bodyCount = licences.filter((x) => x.body_id === l.body_id).length;
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-baseline gap-sm border-b border-outline-variant pb-sm last:border-b-0 last:pb-0"
                >
                  <span className="font-title-md text-title-md text-on-surface">
                    {l.body_short_name ?? 'Body'}
                  </span>
                  <span className="font-mono font-body-md text-body-md text-on-surface-variant">
                    {l.licence_number}
                  </span>
                  <LicenceStatusPill status={l.status} />
                  {l.is_primary && bodyCount > 1 && (
                    <span
                      className="font-label-md text-label-md px-sm py-0 rounded-full uppercase inline-flex items-center gap-sm bg-primary-fixed text-primary-ink border border-transparent"
                      title="Primary licence at this body — used when multiple licences at the same body are declared."
                    >
                      Primary
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {/* C4 — self-declared honesty. Says out loud what the status pill
            hints at: Eventar can release credit on a declared licence, but
            declared ≠ verified-by-college. Only render when the caller has
            at least one licence to describe. */}
        {licences.some((l) => l.status === 'declared') && (
          <p className="mt-md font-body-md text-body-md text-on-surface-variant m-0">
            Self-declared. Eventar can release points for this body; this is
            not the same as verification by the college or council.
          </p>
        )}
        {/* H5 — genuine empty state. Without this, the declare box just
            renders a disabled picker and an inscrutable "No bodies
            available" — an attendee has no way to know the fix is not on
            this page. */}
        {activeBodies.length === 0 ? (
          <div
            role="status"
            className="mt-md font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>info</span>
            <span className="flex-1">
              No accrediting bodies are open for self-declare right now. Please
              contact the event organizer.
            </span>
          </div>
        ) : (
          <form onSubmit={onDeclareLicence} className="mt-md flex flex-col gap-md">
            <div className="grid gap-md md:grid-cols-2">
              <FieldGroup label="Accrediting body">
                <select
                  value={lBodyId}
                  onChange={(e) => setLBodyId(e.target.value)}
                  required
                  disabled={licencePending}
                  aria-label="Accrediting body"
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                >
                  <option value="">Select a body…</option>
                  {activeBodies.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.short_name} — {b.full_name}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              {/* C1/C2 — label follows the selected body; falls back to the
                  generic Membership / registration number when nothing is
                  picked or the short_name isn't in the map. */}
              <FieldGroup label={credentialLabel}>
                <Input
                  value={lNumber}
                  onChange={(e) => setLNumber(e.target.value)}
                  required
                  placeholder="e.g. M12345"
                  maxLength={120}
                  disabled={licencePending}
                />
                {/* C3 — helper text so an attendee filling this out for the
                    first time knows which number the form is asking for. */}
                <span className="block mt-xs font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant">
                  The number your college or council uses for you — the same
                  one you&apos;d use on a CME/CPD claim form.
                </span>
              </FieldGroup>
            </div>
            {licenceStatus && (
              <div
                role="status"
                aria-live="polite"
                className={
                  licenceStatus.kind === 'success'
                    ? 'font-body-md text-body-md text-on-success-container bg-success-container border border-success-container rounded-lg px-md py-sm'
                    : 'font-body-md text-body-md text-on-error-container bg-error-container border border-error-container rounded-lg px-md py-sm'
                }
              >
                {licenceStatus.message}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={licencePending || !lBodyId || !lNumber.trim()}
              >
                {licencePending ? 'Declaring…' : 'Declare licence'}
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* H2 aftershock (2026-09-05 user-lens): splitting Licences out of the
          profile form moved the only "Back to account" link WAY up the page.
          After declaring a licence at the bottom, a user has nowhere to
          navigate without scrolling back. One more anchor here, quiet. */}
      <div className="flex items-center justify-end">
        <Link
          href="/account"
          className="text-sm font-medium text-primary-ink hover:underline"
        >
          Back to account
        </Link>
      </div>
    </div>
  );
}

// C1/C2 — small heuristic on short_name. HKAM's 15 Colleges all issue
// Fellowships and their short_names all start "HKC" (HKCP, HKCPath,
// HKCPsych, HKCFP, HKCEM, HKCA, HKCOG, HKCORL, HKCOphth, HKCOS, HKCPaed,
// HKCPS, HKCR, HKCS, HKCCM). MCHK/AHP* are statutory registers — the
// credential is a registration number. Anything else falls back to the
// generic HK-neutral phrasing. Ivan's terminology-table lock.
function credentialLabelForBody(shortName: string | null | undefined): string {
  if (!shortName) return 'Membership / registration number';
  const s = shortName.toUpperCase();
  if (s === 'HKAM' || s.startsWith('HKC')) return 'Fellowship number';
  if (s === 'MCHK' || s.startsWith('AHP')) return 'Registration number';
  return 'Membership / registration number';
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

// Status pill.
// - declared (active, counts for F4 credit release): tertiary-container —
//   visually distinct from the muted "no longer valid" statuses below.
// - verified: success-container (green, matches the wider "you're done"
//   affordance across the app).
// - lapsed / superseded: muted surface-container with an italic label so
//   they read as "historical, no longer active" — user-lens CONFUSING
//   flagged that lapsed/superseded/declared all looked the same.
// - revoked: error-container (destructive terminal state).
// Each pill carries an aria-label prefix so a screen reader announces
// "Status: <name>" instead of a bare adjective. User-lens CONFUSING.
function LicenceStatusPill({ status }: { status: LicenceRowView['status'] }) {
  const label: Record<LicenceRowView['status'], string> = {
    declared:   'Status: declared, pending verification',
    verified:   'Status: verified',
    lapsed:     'Status: lapsed — no longer active',
    revoked:    'Status: revoked',
    superseded: 'Status: superseded by a newer declaration',
  };
  const styles: Record<LicenceRowView['status'], string> = {
    declared:   'bg-tertiary-container text-on-tertiary-container border-transparent',
    verified:   'bg-success-container text-on-success-container border-transparent',
    lapsed:     'bg-surface-container text-on-surface-variant border-outline-variant italic',
    revoked:    'bg-error-container text-on-error-container border-transparent',
    superseded: 'bg-surface-container text-on-surface-variant border-outline-variant italic',
  };
  return (
    <span
      role="status"
      aria-label={label[status]}
      className={`font-label-md text-label-md px-sm py-0 rounded-full uppercase inline-flex items-center gap-sm border ${styles[status]}`}
    >
      {status}
    </span>
  );
}
