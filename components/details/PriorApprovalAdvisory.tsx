'use client';

import { useSyncExternalStore } from 'react';
import { priorApprovalDeadline } from '@/lib/cpd/priorApproval';
import { timezoneForJurisdiction } from '@/lib/cpd/jurisdictionTz';
import { browserTz, formatInTzWithZone } from '@/lib/tz';
import type { AccreditingBodyOption } from './CpdAccreditationSection';

type Props = {
  /** The event's own start time — the deadline is derived from this. */
  startTime: string;
  /** The currently-selected/highlighted body, or null if none is picked yet. */
  body: AccreditingBodyOption | null;
};

const subscribeNever = () => () => {};

/**
 * Advisory-only prior-approval deadline notice (Task 10.9/10.9 — "S3").
 * Shared by the single-body form (CpdAccreditationSection) and the
 * multi-body wizard's body picker — same source, same copy, same
 * non-blocking behaviour, so an organiser sees one consistent notice
 * regardless of which surface they configure accreditation from.
 * Renders nothing when no body is selected or the selected body has no
 * sourced `prior_approval` key in its `cycle_config` (most bodies today).
 */
export function PriorApprovalAdvisory({ startTime, body }: Props) {
  // The viewer's own zone is known only in the browser, so it appears after mount (same as the venue-time line).
  const viewerTz = useSyncExternalStore(subscribeNever, browserTz, () => null);
  if (!body) return null;
  // The deadline is the body's own: HK body, HK clock; AU body, AU clock. No known zone: say UTC, never guess HK.
  const bodyTz = timezoneForJurisdiction(body.jurisdiction) ?? 'UTC';
  const approval = priorApprovalDeadline(startTime, body.cycle_config, bodyTz);
  if (!approval) return null;
  const label = body.short_name ?? body.full_name;
  const iso = approval.deadline.toISOString();
  const when = formatInTzWithZone(iso, bodyTz);
  const yours = viewerTz && viewerTz !== bodyTz ? formatInTzWithZone(iso, viewerTz) : null;

  return (
    <p className="mt-md rounded-lg bg-primary-container px-md py-sm text-body-md text-on-primary-container">
      {approval.passed ? (
        <>
          The suggested prior-approval application deadline for {label} was{' '}
          <strong>{when}</strong>, and has passed.{yours && <> Your time: {yours}.</>}
          This is advisory only &mdash; saving still works; confirm directly with the body whether a late
          application is possible.
        </>
      ) : (
        <>
          Apply to {label} by{' '}
          <strong>{when}</strong>{yours && <> (your time: {yours})</>} to meet its
          prior-approval requirement. This is advisory only &mdash; Eventar doesn’t track applications, so
          saving here is never blocked by it.
        </>
      )}
    </p>
  );
}
