'use client';

import { useActionState, useState } from 'react';
import { setEventCpdConfig } from '@/app/events/[id]/details/cpdActions';
import { priorApprovalDeadline } from '@/lib/cpd/priorApproval';
import { formatInTz } from '@/lib/tz';
import { Button } from '@/components/ui/button';

export type AccreditingBodyOption = {
  id: string;
  full_name: string;
  short_name: string | null;
  cycle_config: unknown;
};

export type CpdAccreditationSectionProps = {
  eventId: string;
  /** The event's own start time — the deadline advisory is derived from this. */
  startTime: string;
  bodies: AccreditingBodyOption[];
  currentBodyId: string | null;
  currentHours: number | null;
  /** Credits already posted to the ledger for this event. Non-zero = frozen. */
  creditsIssued: number;
  /** The bodies lookup failed. Distinct from "there are none" — see below. */
  bodiesUnavailable?: boolean;
  /**
   * The lookup succeeded and this organisation is authorised by no body yet.
   * A third state, deliberately not folded into `bodiesUnavailable`: that one
   * means "try again", this one means "there is nothing to try" and the remedy
   * is out-of-band (DEFERRED 56).
   */
  noAuthorisedBodies?: boolean;
  /**
   * A real config exists via MultiBodyAccreditationWizard (event_accreditation_groups),
   * which set_event_cpd_config's own guard (20260821000000) now refuses to
   * touch. currentBodyId/currentHours can still be non-null here (whatever
   * they held before the wizard took over — the bridge doesn't clear them) —
   * without this flag the badge below reads "Not accredited" for an event
   * that plainly is, just via the other surface (a confirmed live "did this
   * work?" bug), and the form would let an organiser resubmit stale values.
   */
  multiBodyConfigured?: boolean;
  /**
   * Event end, used only to PREFILL an unset hours field (Decision 8).
   * Optional so an omitting caller degrades to today's blank field rather
   * than breaking.
   */
  endTime?: string | null;
};

/**
 * Default the CPD-hours field to the event's wall-clock duration — Ivan's
 * "CPD hour is how long the event is (for now)", implemented as a PREFILL,
 * never a derivation (Decision 8, docs/plans/2026-08-21-grant-mvp-work-plan.md).
 *
 * `cpd_hours` stays a stored, declared value because it is credit-bearing:
 * set_event_cpd_config's compatibility bridge writes it straight into
 * `event_accreditations.credit_value`, and the freeze trigger
 * (20260725073250) rejects any change to it once a single credit_ledger row
 * exists for the event. Deriving it would therefore make awarded credit a
 * function of wall-clock time AND turn every later start/end edit on a
 * credited event into a hard error.
 *
 * Returns '' (a blank field) rather than a number when:
 *  - either timestamp is missing or unparseable,
 *  - the duration is not positive,
 *  - the duration exceeds 24h. cpdActions.ts validates `.max(24)`, so
 *    prefilling e.g. a two-day congress would hand the organiser a value that
 *    fails its own save. Multi-day events are exactly the ICI Summit case the
 *    multi-body wizard exists for, so they get the wizard, not this field.
 *
 * Rounded to the field's own 0.5 step so the prefilled value is one the input
 * actually accepts.
 */
export function durationPrefill(startTime: string, endTime?: string | null): string {
  if (!endTime) return '';
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  const hours = (end - start) / 3_600_000;
  if (hours <= 0 || hours > 24) return '';
  return String(Math.round(hours * 2) / 2);
}

export function CpdAccreditationSection({
  eventId,
  startTime,
  endTime,
  bodies,
  currentBodyId,
  currentHours,
  creditsIssued,
  bodiesUnavailable = false,
  noAuthorisedBodies = false,
  multiBodyConfigured = false,
}: CpdAccreditationSectionProps) {
  const [bodyId, setBodyId] = useState(currentBodyId ?? '');
  // A SAVED value always wins — the prefill fills an empty field, it never
  // recomputes over a number the organiser chose deliberately (reopening this
  // page must not silently rewrite their input).
  //
  // And never prefill into a field that cannot be saved: once credits exist the
  // freeze trigger rejects the write, and once a wizard config exists the
  // multi_body_configured guard (42501) does. Putting a plausible number into a
  // disabled field there would state an accreditation value that is not real
  // and that no save could ever establish.
  const [hours, setHours] = useState(() => {
    if (currentHours != null) return String(currentHours);
    if (creditsIssued > 0 || multiBodyConfigured) return '';
    return durationPrefill(startTime, endTime);
  });
  // useActionState + <form action={...}>: submission works with or without
  // client JS, so a click that lands before hydration is handled instead of
  // silently falling back to a native GET.
  const [result, formAction, pending] = useActionState(setEventCpdConfig, null);

  // Once a single credit exists the DB trigger refuses config changes, so the
  // form is disabled rather than letting the organiser type into fields whose
  // save can only fail. The reason is stated, not just the disabled state.
  const frozen = creditsIssued > 0;
  // multiBodyConfigured locks this field the same way `frozen` does: the DB
  // guard (20260821000000_set_event_cpd_config_multi_body_guard.sql) already
  // refuses any save while a wizard config exists, so the form must say so
  // up front rather than let a submit fail. currentBodyId/currentHours can
  // still hold a real prior value here (the bridge writes them, and they
  // aren't cleared when the wizard takes over) — locking, not hiding it, is
  // consistent with how `frozen` treats existing data.
  const locked = frozen || multiBodyConfigured;
  const accredited = (currentBodyId !== null && currentHours !== null) || multiBodyConfigured;

  // An event can be bound to a body that is no longer `active` (retired, or
  // moved back to onboarding). The options list only carries active bodies, so
  // without this the <select> would silently fall back to "Not accredited" —
  // showing an accredited event as unaccredited, and clearing its body on the
  // next save. Surface the current binding as its own option instead.
  const currentIsMissing = currentBodyId !== null && !bodies.some((b) => b.id === currentBodyId);

  // Derived, advisory only — recomputed live as the organiser changes the
  // <select>. `null` (no sourced prior_approval key on this body, or no
  // body selected) means render nothing: not a placeholder, not a zero-date.
  const selectedBody = bodies.find((b) => b.id === bodyId) ?? null;
  const approval = selectedBody ? priorApprovalDeadline(startTime, selectedBody.cycle_config) : null;
  const approvalBodyLabel = selectedBody ? (selectedBody.short_name ?? selectedBody.full_name) : '';

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-lg">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h2 className="font-heading text-headline-sm text-on-surface">CPD accreditation</h2>
          <p className="mt-xs text-body-md text-on-surface-variant">
            Attendees with a verified licence at this body earn credit automatically when they check in.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-xs rounded-full px-md py-xs text-label-md font-semibold ${
            accredited
              ? 'bg-success-container text-on-success-container'
              : 'bg-surface-container-high text-on-surface-variant'
          }`}
        >
          {multiBodyConfigured ? 'Accredited (multiple bodies)' : accredited ? 'Accredited' : 'Not accredited'}
        </span>
      </div>

      {multiBodyConfigured && (
        <p className="mt-md rounded-lg bg-primary-container px-md py-sm text-body-md text-on-primary-container">
          This event is accredited via the multiple-body wizard below, so the field here is locked — any value it
          shows is left over from before the wizard was used and is not what&rsquo;s actually in effect.
        </p>
      )}

      {bodiesUnavailable && (
        <p className="mt-md rounded-lg bg-error-container px-md py-sm text-body-md text-on-error-container">
          The list of accrediting bodies could not be loaded, so accreditation can&rsquo;t be changed right now. Existing
          accreditation is unaffected. Reload to try again.
        </p>
      )}

      {noAuthorisedBodies && !bodiesUnavailable && (
        <p className="mt-md rounded-lg bg-warning-container px-md py-sm text-body-md text-on-warning-container">
          Your organisation isn&rsquo;t yet authorised by any accrediting body, so events can&rsquo;t be marked as
          CPD-accredited. This is arranged with the body directly &mdash; reloading won&rsquo;t change it. Existing
          accreditation is unaffected.
        </p>
      )}

      {frozen && (
        <p className="mt-md rounded-lg bg-warning-container px-md py-sm text-body-md text-on-warning-container">
          <strong>{creditsIssued}</strong> credit{creditsIssued === 1 ? ' has' : 's have'} already been issued for this
          event, so its accreditation is locked. Changing it now would alter records an accrediting body already holds.
        </p>
      )}

      {approval && (
        <p className="mt-md rounded-lg bg-primary-container px-md py-sm text-body-md text-on-primary-container">
          {approval.passed ? (
            <>
              The suggested prior-approval application deadline for {approvalBodyLabel} was{' '}
              <strong>{formatInTz(approval.deadline.toISOString(), 'Asia/Hong_Kong')} (HKT)</strong>, and has passed.
              This is advisory only &mdash; saving still works; confirm directly with the body whether a late
              application is possible.
            </>
          ) : (
            <>
              Apply to {approvalBodyLabel} by{' '}
              <strong>{formatInTz(approval.deadline.toISOString(), 'Asia/Hong_Kong')} (HKT)</strong> to meet its
              prior-approval requirement. This is advisory only &mdash; Eventar doesn&rsquo;t track applications, so
              saving here is never blocked by it.
            </>
          )}
        </p>
      )}

      <form action={formAction} className="mt-lg grid gap-md sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <input type="hidden" name="eventId" value={eventId} />

        <div>
          <label htmlFor="cpd-body" className="block text-label-md font-semibold text-on-surface-variant">
            Accrediting body
          </label>
          <select
            id="cpd-body"
            name="bodyId"
            value={bodyId}
            disabled={locked || pending || bodiesUnavailable}
            onChange={(e) => setBodyId(e.target.value)}
            className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface disabled:opacity-60"
          >
            <option value="">Not accredited</option>
            {currentIsMissing && (
              <option value={currentBodyId ?? ''}>Current body (no longer accepting new events)</option>
            )}
            {bodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.short_name ? `${b.short_name} — ${b.full_name}` : b.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cpd-hours" className="block text-label-md font-semibold text-on-surface-variant">
            CPD hours
          </label>
          <input
            id="cpd-hours"
            name="cpdHours"
            type="number"
            step="0.5"
            min="0.5"
            max="24"
            value={hours}
            disabled={locked || pending || bodiesUnavailable}
            onChange={(e) => setHours(e.target.value)}
            placeholder="—"
            className="mt-xs w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-body-md text-on-surface disabled:opacity-60"
          />
        </div>

        <Button
          type="submit"
          disabled={locked || pending || bodiesUnavailable}
          className="px-lg py-sm text-label-md font-semibold"
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </form>

      {result && (
        <p
          role="status"
          data-testid="cpd-config-message"
          className={`mt-md text-body-md ${'ok' in result ? 'text-on-success-container' : 'text-error'}`}
        >
          {'ok' in result ? 'Accreditation saved.' : result.error}
        </p>
      )}
    </section>
  );
}
