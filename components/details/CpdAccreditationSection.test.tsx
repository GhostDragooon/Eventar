/** @vitest-environment jsdom */
// cpdActions.ts is a Server Action module ('use server') — pulls in
// next/cache, forbidden in jsdom builds. These tests are about the
// section's own rendering given its props, not the action itself.
vi.mock('@/app/events/[id]/details/cpdActions', () => ({
  setEventCpdConfig: vi.fn(),
}));

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CpdAccreditationSection, durationPrefill } from './CpdAccreditationSection';

afterEach(cleanup);

const bodies = [{ id: 'b1', full_name: 'HK College of Pathologists', short_name: 'HKCP', cycle_config: {} }];

describe('CpdAccreditationSection — multi-body coexistence', () => {
  // Regression test: a prior version passed currentBodyId/currentHours
  // straight through and never disabled the field for multiBodyConfigured,
  // so a stale pre-wizard value stayed live, editable, and submittable while
  // a banner claimed the field "stays empty on purpose" (found live,
  // 2026-08-21 user-lens review).
  it('locks the legacy field and states the value shown is stale, not in effect', () => {
    render(
      <CpdAccreditationSection
        eventId="e1"
        startTime="2026-09-01T00:00:00Z"
        bodies={bodies}
        currentBodyId="b1"
        currentHours={3}
        creditsIssued={0}
        multiBodyConfigured
      />,
    );
    expect(screen.getByLabelText(/accrediting body/i)).toBeDisabled();
    expect(screen.getByLabelText(/cpd hours/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    expect(screen.queryByText(/stays empty on purpose/i)).toBeNull();
    expect(screen.getByText(/locked/i)).toBeTruthy();
    expect(screen.getByText(/not what.s actually in effect/i)).toBeTruthy();
  });

  it('leaves the legacy field enabled when no multi-body config exists', () => {
    render(
      <CpdAccreditationSection
        eventId="e1"
        startTime="2026-09-01T00:00:00Z"
        bodies={bodies}
        currentBodyId="b1"
        currentHours={3}
        creditsIssued={0}
      />,
    );
    expect(screen.getByLabelText(/accrediting body/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/cpd hours/i)).not.toBeDisabled();
  });
});

describe('durationPrefill — Decision 8, prefill not derivation', () => {
  it('rounds to the 0.5 step the input itself accepts', () => {
    expect(durationPrefill('2026-09-01T09:00:00Z', '2026-09-01T17:00:00Z')).toBe('8');
    // 7h40m -> 7.5, not 7.666…: an unrounded value fails the input's step
    // and reads as false precision on a credit-bearing number.
    expect(durationPrefill('2026-09-01T09:00:00Z', '2026-09-01T16:40:00Z')).toBe('7.5');
  });

  it('returns blank past 24h, because cpdActions validates max(24)', () => {
    // The ICI Summit case: prefilling a real duration here would hand the
    // organiser a value its own save rejects. Multi-day events get the wizard.
    expect(durationPrefill('2026-09-01T09:00:00Z', '2026-09-02T17:00:00Z')).toBe('');
    // Exactly 24h is still valid input, so it must NOT be blanked.
    expect(durationPrefill('2026-09-01T09:00:00Z', '2026-09-02T09:00:00Z')).toBe('24');
  });

  it('returns blank for missing, unparseable or non-positive durations', () => {
    expect(durationPrefill('2026-09-01T09:00:00Z', null)).toBe('');
    expect(durationPrefill('2026-09-01T09:00:00Z', undefined)).toBe('');
    expect(durationPrefill('2026-09-01T09:00:00Z', 'not-a-date')).toBe('');
    expect(durationPrefill('2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z')).toBe('');
    expect(durationPrefill('2026-09-01T17:00:00Z', '2026-09-01T09:00:00Z')).toBe('');
  });
});

describe('CpdAccreditationSection — hours prefill guards', () => {
  it('prefills an unset field from the event duration', () => {
    render(
      <CpdAccreditationSection
        eventId="e1"
        startTime="2026-09-01T09:00:00Z"
        endTime="2026-09-01T17:00:00Z"
        bodies={bodies}
        currentBodyId={null}
        currentHours={null}
        creditsIssued={0}
      />,
    );
    expect(screen.getByLabelText(/cpd hours/i)).toHaveValue(8);
  });

  it('never overwrites a saved value with a recomputed one', () => {
    // Reopening the page must not silently rewrite a number the organiser
    // chose deliberately — 3 stays 3 even though the event runs 8h.
    render(
      <CpdAccreditationSection
        eventId="e1"
        startTime="2026-09-01T09:00:00Z"
        endTime="2026-09-01T17:00:00Z"
        bodies={bodies}
        currentBodyId="b1"
        currentHours={3}
        creditsIssued={0}
      />,
    );
    expect(screen.getByLabelText(/cpd hours/i)).toHaveValue(3);
  });

  it('leaves the field blank when a wizard config locks it', () => {
    // A plausible number in a disabled field would state an accreditation
    // value that is not real and that no save could establish (42501).
    render(
      <CpdAccreditationSection
        eventId="e1"
        startTime="2026-09-01T09:00:00Z"
        endTime="2026-09-01T17:00:00Z"
        bodies={bodies}
        currentBodyId={null}
        currentHours={null}
        creditsIssued={0}
        multiBodyConfigured
      />,
    );
    const field = screen.getByLabelText(/cpd hours/i);
    expect(field).toBeDisabled();
    expect(field).toHaveValue(null);
  });

  it('leaves the field blank when issued credits freeze it', () => {
    render(
      <CpdAccreditationSection
        eventId="e1"
        startTime="2026-09-01T09:00:00Z"
        endTime="2026-09-01T17:00:00Z"
        bodies={bodies}
        currentBodyId={null}
        currentHours={null}
        creditsIssued={1}
      />,
    );
    const field = screen.getByLabelText(/cpd hours/i);
    expect(field).toBeDisabled();
    expect(field).toHaveValue(null);
  });
});
