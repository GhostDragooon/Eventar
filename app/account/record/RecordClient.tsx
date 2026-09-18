'use client';

// Practitioner Eventar record (2026-09-18 product decision). Style oracle:
// app/account/AccountClient.tsx's SectionCard + app/account/profile/ProfileClient.tsx's
// licence-row / LicenceStatusPill vocabulary — reused verbatim, no new visual
// pattern introduced (MECHANICAL per the frontend threshold rule).

import Link from 'next/link';
import { formatInTz } from '@/lib/tz';
import type { AttendanceRecordView, CreditRecordView } from '../schema';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// effective_date is a plain SQL `date` (no time-of-day), so formatInTz's
// Intl+timezone machinery is the wrong tool here (it exists to convert an
// instant across timezones; a date has no instant to convert) — and
// new Date(isoDate) is an outright bug magnet, since it parses as UTC
// midnight and .getDate()/.getMonth() would shift the displayed day
// backward in negative-offset timezones. Splitting the "YYYY-MM-DD"
// string avoids Date parsing entirely, matching formatInTz's "DD Mon
// YYYY" display convention (user-lens 2026-09-19: was raw ISO,
// inconsistent with the Attendance section right above it).
function formatDateOnly(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
}

export function RecordClient({
  attendance,
  credits,
}: {
  attendance: AttendanceRecordView[];
  credits: CreditRecordView[];
}) {
  return (
    <div className="space-y-md">
      <header className="space-y-xs">
        <p className="text-label-md font-semibold uppercase tracking-[0.18em] m-0">
          <span className="text-[color:var(--on-primary-container)]">Record</span>
          <span className="text-on-surface-variant"> · Eventar</span>
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface m-0">
          Your Eventar record
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Attendance and points through Eventar — a running log, not a substitute for iCMECPD or your college.
        </p>
      </header>

      <SectionCard icon="event_available" title="Attendance">
        {attendance.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant m-0">
            No linked events yet. Register for an event or link past registrations from{' '}
            <Link href="/account" className="text-primary-ink font-medium hover:underline">
              Account
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-sm m-0 p-0 list-none">
            {attendance.map((r) => (
              <li
                key={r.registration_id}
                className="flex flex-wrap items-baseline gap-sm border-b border-outline-variant pb-sm last:border-b-0 last:pb-0"
              >
                <span className="font-title-md text-title-md text-on-surface">
                  {r.event_title ?? 'Event removed'}
                </span>
                {r.event_start && r.event_timezone && (
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    {formatInTz(r.event_start, r.event_timezone)}
                  </span>
                )}
                <AttendanceStatusPill status={r.status} />
                {r.status === 'attended' && r.check_in_at && (
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    Checked in {formatInTz(r.check_in_at, r.event_timezone ?? 'UTC')}
                    {r.check_in_method ? ` · ${r.check_in_method}` : ''}
                  </span>
                )}
                {r.status === 'attended' && <CreditChip hasCredit={r.has_credit} />}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon="workspace_premium" title="CPD points">
        {credits.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant m-0">
            No points on your Eventar record yet. Points release after check-in once your{' '}
            <Link href="/account/profile" className="text-primary-ink font-medium hover:underline">
              profile and licence
            </Link>{' '}
            are complete.
          </p>
        ) : (
          <ul className="flex flex-col gap-sm m-0 p-0 list-none">
            {credits.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline gap-sm border-b border-outline-variant pb-sm last:border-b-0 last:pb-0"
              >
                <span className="font-title-md text-title-md text-on-surface">
                  {c.event_title ?? 'Event removed'}
                </span>
                <span className="font-body-md text-body-md text-on-surface-variant">
                  {c.body_short_name ?? 'Body'}
                </span>
                {(c.points != null || c.hours != null) && (
                  <span className="font-mono font-body-md text-body-md text-on-surface-variant">
                    {[
                      c.points != null ? `${c.points} pts` : null,
                      c.hours != null ? `${c.hours} hrs` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                <EntryTypePill entryType={c.entry_type} />
                <span className="font-body-md text-body-md text-on-surface-variant">
                  {formatDateOnly(c.effective_date)}
                </span>
                {c.attestation_status && (
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    {ATTESTATION_LABEL[c.attestation_status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// Duplicated from AccountClient.tsx verbatim — same "match style, do not
// reinvent" constraint that file's own SectionCard comment states.
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

// Status colours follow the app's fixed role convention (brand blue ramp for
// brand chrome; green/amber/red reserved for status) with one deliberate
// choice: 'attended' stays brand-neutral (primary-fixed), NOT success-green,
// so it never reads as interchangeable with the credit chip below — spec
// success criterion: "Attended without ledger is clearly not yet on record,
// not success-green credit." Green is reserved for CreditChip alone.
function AttendanceStatusPill({ status }: { status: AttendanceRecordView['status'] }) {
  const label: Record<AttendanceRecordView['status'], string> = {
    registered: 'Status: registered',
    attended: 'Status: attended',
    cancelled: 'Status: cancelled',
  };
  const styles: Record<AttendanceRecordView['status'], string> = {
    registered: 'bg-tertiary-container text-on-tertiary-container border-transparent',
    attended: 'bg-primary-fixed text-primary-ink border-transparent',
    cancelled: 'bg-surface-container text-on-surface-variant border-outline-variant italic',
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

// hasCredit === null means the ledger read itself failed — render a
// distinct "couldn't check" state, never a confident "not yet on record"
// (dev-lens 2026-09-19: a transient read failure must not tell a
// practitioner who already has real credit that they don't).
function CreditChip({ hasCredit }: { hasCredit: boolean | null }) {
  if (hasCredit === null) {
    return (
      <span
        role="status"
        aria-label="Credit: couldn't check right now"
        className="font-label-md text-label-md px-sm py-0 rounded-full uppercase inline-flex items-center gap-sm border bg-surface-container text-on-surface-variant border-outline-variant italic"
      >
        Couldn&apos;t check
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-label={hasCredit ? 'Credit: on record' : 'Credit: not yet on record'}
      className={`font-label-md text-label-md px-sm py-0 rounded-full uppercase inline-flex items-center gap-sm border ${
        hasCredit
          ? 'bg-success-container text-on-success-container border-transparent'
          : 'bg-surface-container text-on-surface-variant border-outline-variant'
      }`}
    >
      {hasCredit ? 'On record' : 'Not yet on record'}
    </span>
  );
}

const ENTRY_TYPE_LABEL: Record<CreditRecordView['entry_type'], string> = {
  credit_earned: 'Earned',
  credit_confirmed: 'Confirmed',
  credit_adjusted: 'Adjusted',
  credit_transferred: 'Transferred',
  credit_expired: 'Expired',
  credit_revoked: 'Revoked',
};

const ENTRY_TYPE_STYLE: Record<CreditRecordView['entry_type'], string> = {
  credit_earned: 'bg-success-container text-on-success-container border-transparent',
  credit_confirmed: 'bg-success-container text-on-success-container border-transparent',
  credit_adjusted: 'bg-tertiary-container text-on-tertiary-container border-transparent',
  credit_transferred: 'bg-tertiary-container text-on-tertiary-container border-transparent',
  credit_expired: 'bg-error-container text-on-error-container border-transparent',
  credit_revoked: 'bg-error-container text-on-error-container border-transparent',
};

function EntryTypePill({ entryType }: { entryType: CreditRecordView['entry_type'] }) {
  return (
    <span
      role="status"
      aria-label={`Entry: ${ENTRY_TYPE_LABEL[entryType]}`}
      className={`font-label-md text-label-md px-sm py-0 rounded-full uppercase inline-flex items-center gap-sm border ${ENTRY_TYPE_STYLE[entryType]}`}
    >
      {ENTRY_TYPE_LABEL[entryType]}
    </span>
  );
}

const ATTESTATION_LABEL: Record<NonNullable<CreditRecordView['attestation_status']>, string> = {
  organiser_attested: 'Organiser-attested',
  body_confirmed: 'Body-confirmed',
  attendance_verified: 'Attendance-verified',
};
