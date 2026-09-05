import { Fragment } from 'react';
import type { Audience } from './AudienceExperience';

/**
 * How it works — the five-beat walkthrough of the actual product loop.
 *
 * Replaces the "Verification" nav item, which pointed at the ledger mockup: a
 * section with no heading containing that word and no explanation of what
 * verification means. Ivan 2026-08-09: "get rid of verification, change it to
 * how it works and populate the page with a simple walk through with image and
 * descriptions."
 *
 * Restructured 2026-08-20 from vertical alternating cards to a horizontal
 * numbered-circle row with dashed connectors, matching a reference layout
 * Ivan supplied. Icons are `material-symbols-outlined` glyphs, not the
 * earlier hand-drawn SVG schematics — same "diagram, not screenshot"
 * restraint, simpler shape to fit a small circle. Two layouts: a horizontal
 * row with connectors on wider viewports, a plain stacked list on narrow
 * ones (five circles across ~375px has no room to breathe).
 *
 * Audience-switched 2026-08-20: the five beats are the same mechanism for
 * both audiences, so the icon (`art:` kind) is identical between variants —
 * only who is doing each step, and what they see, changes.
 */

type StepArtKind = 'find' | 'register' | 'checkin' | 'ledger' | 'verify';

const ICONS: Record<StepArtKind, string> = {
  find: 'calendar_month',
  register: 'group',
  checkin: 'qr_code_2',
  ledger: 'receipt_long',
  verify: 'upload_file',
};

// WP4 Path A — trimmed of "before you register" (points are known when the
// organizer configures accreditation, which happens BEFORE listing — so
// technically ok, but Ivan flagged it as an overclaim in practice), "CPD
// ledger" branding, and the "audit-ready / tamper-evident" export promise
// that today's UI does not surface (evidence-pack export is S5+, deferred).
const STEPS_BY_AUDIENCE: Record<Audience, readonly { t: string; d: string; art: StepArtKind }[]> = {
  practitioner: [
    {
      t: 'Find an accredited event',
      d: 'Each listing names the accrediting body and the points it awards.',
      art: 'find',
    },
    {
      t: 'Register in under a minute',
      d: 'Name and email. A confirmation arrives immediately, and a QR pass an hour before it starts.',
      art: 'register',
    },
    {
      t: 'Check in at the door',
      d: 'Reception scans your pass on arrival. That scan is the moment attendance becomes a fact.',
      art: 'checkin',
    },
    {
      t: 'Points land on your Eventar record',
      d: 'Once your profile and membership number are complete, points release straight to your Eventar record — no forms to submit later.',
      art: 'ledger',
    },
    {
      t: 'See what you did through Eventar',
      d: 'Your Eventar record is a running log alongside iCMECPD and your college — not a replacement, and not a college-verified export.',
      art: 'verify',
    },
  ],
  organiser: [
    {
      t: 'Create the accredited event',
      d: 'Set the schedule, capacity, and accrediting body once. The listing shows the points.',
      art: 'find',
    },
    {
      t: 'Registrations come to you',
      d: 'Practitioners register directly — no chasing, no spreadsheet imports.',
      art: 'register',
    },
    {
      t: 'Verify attendance at the door',
      d: 'Reception scans each pass on arrival. That scan is the moment attendance becomes a fact.',
      art: 'checkin',
    },
    {
      t: 'Points release automatically',
      d: 'Each check-in releases the configured points to eligible attendees’ Eventar records — nothing to key in.',
      art: 'ledger',
    },
    {
      t: 'Have the roster in one place',
      d: 'The event roster records who attended and the points released. External submissions to your accrediting body stay in your existing workflow.',
      art: 'verify',
    },
  ],
} as const;

export function HowItWorks({ audience }: { audience: Audience }) {
  const STEPS = STEPS_BY_AUDIENCE[audience];

  return (
    <section id="how-it-works" className="mx-auto mt-[46px] max-w-[1200px] px-[15px]">
      <p className="text-center text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[.08em] text-primary-ink">
        How it works
      </p>
      <h2 className="mt-xs text-center text-[calc(26px*var(--text-scale))] font-semibold tracking-[-0.01em] text-on-surface">
        Five steps, and only two of them are yours
      </h2>

      {/* Narrow viewports: stacked, no connectors — five-across has no room to breathe under ~640px. */}
      <div className="mt-xl flex flex-col gap-lg sm:hidden">
        {STEPS.map((s, i) => (
          <div key={s.t} className="flex flex-col items-center text-center">
            <StepCircle icon={ICONS[s.art]} index={i} />
            <h3 className="mt-md text-[calc(14px*var(--text-scale))] font-semibold leading-snug text-on-surface">{s.t}</h3>
            <p className="mt-xs max-w-[280px] text-[calc(12.5px*var(--text-scale))] leading-[1.5] text-on-surface-variant">{s.d}</p>
          </div>
        ))}
      </div>

      {/* Wide viewports: horizontal row, circles joined by a dashed connector. */}
      <div className="mt-xl hidden items-start sm:flex">
        {STEPS.map((s, i) => (
          <Fragment key={s.t}>
            {i > 0 && <div className="mt-7 h-0 flex-1 border-t-2 border-dashed border-outline-variant" aria-hidden />}
            <div className="flex w-[152px] shrink-0 flex-col items-center text-center">
              <StepCircle icon={ICONS[s.art]} index={i} />
              <h3 className="mt-md text-[calc(13px*var(--text-scale))] font-semibold leading-snug text-on-surface">{s.t}</h3>
              <p className="mt-xs text-[calc(11.5px*var(--text-scale))] leading-[1.5] text-on-surface-variant">{s.d}</p>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function StepCircle({ icon, index }: { icon: string; index: number }) {
  return (
    <div className="relative">
      <div className="grid size-14 place-items-center rounded-full bg-primary-container text-on-primary-container">
        <span className="material-symbols-outlined text-[24px]" aria-hidden>{icon}</span>
      </div>
      <span
        className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-on-primary"
        aria-hidden
      >
        {index + 1}
      </span>
    </div>
  );
}
