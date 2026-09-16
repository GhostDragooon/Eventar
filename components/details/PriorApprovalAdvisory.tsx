import { priorApprovalDeadline } from '@/lib/cpd/priorApproval';
import { formatInTz } from '@/lib/tz';
import type { AccreditingBodyOption } from './CpdAccreditationSection';

type Props = {
  /** The event's own start time — the deadline is derived from this. */
  startTime: string;
  /** The currently-selected/highlighted body, or null if none is picked yet. */
  body: AccreditingBodyOption | null;
};

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
  if (!body) return null;
  const approval = priorApprovalDeadline(startTime, body.cycle_config);
  if (!approval) return null;
  const label = body.short_name ?? body.full_name;

  return (
    <p className="mt-md rounded-lg bg-primary-container px-md py-sm text-body-md text-on-primary-container">
      {approval.passed ? (
        <>
          The suggested prior-approval application deadline for {label} was{' '}
          <strong>{formatInTz(approval.deadline.toISOString(), 'Asia/Hong_Kong')} (HKT)</strong>, and has passed.
          This is advisory only &mdash; saving still works; confirm directly with the body whether a late
          application is possible.
        </>
      ) : (
        <>
          Apply to {label} by{' '}
          <strong>{formatInTz(approval.deadline.toISOString(), 'Asia/Hong_Kong')} (HKT)</strong> to meet its
          prior-approval requirement. This is advisory only &mdash; Eventar doesn&rsquo;t track applications, so
          saving here is never blocked by it.
        </>
      )}
    </p>
  );
}
