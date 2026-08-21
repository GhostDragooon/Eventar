/** @vitest-environment jsdom */
// cpdActions.ts is a Server Action module ('use server') — pulls in
// next/cache, forbidden in jsdom builds. These tests are about the
// section's own rendering given its props, not the action itself.
vi.mock('@/app/events/[id]/details/cpdActions', () => ({
  setEventCpdConfig: vi.fn(),
}));

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CpdAccreditationSection } from './CpdAccreditationSection';

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
