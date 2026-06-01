/** @vitest-environment jsdom */
import { vi } from 'vitest';

// RegistrationCloseEditor is a Client Component whose Server Action import
// pulls in 'server-only' — forbidden in browser/jsdom builds. Stub it out:
// these tests are about RegistrationSection's own rendering, not the editor.
vi.mock('./RegistrationCloseEditor', () => ({
  RegistrationCloseEditor: () => null,
}));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RegistrationSection } from './RegistrationSection';

// Vitest doesn't auto-import RTL's cleanup (project config has `globals` off);
// without this, it.each iterations accumulate in jsdom and getByText finds
// duplicates across cases that share the same copy.
afterEach(cleanup);

const baseProps = {
  eventId: 'e1',
  registered: 0,
  maxAttendees: null,
  registrationCloseAt: null,
  registeredAt: [],
  nowMs: Date.parse('2026-06-01T00:00:00Z'),
};

describe('RegistrationSection — "Last sign-up" empty copy is lifecycle-aware', () => {
  it.each(['registering', 'upcoming', 'live'] as const)(
    'shows forward-looking "Awaiting first registration" on %s lifecycle',
    (lifecycle) => {
      const { getByText } = render(<RegistrationSection {...baseProps} lifecycle={lifecycle} />);
      expect(getByText('Awaiting first registration')).toBeInTheDocument();
    },
  );

  it.each(['completed', 'cancelled'] as const)(
    'shows "No registrations received" on %s lifecycle (event window has closed)',
    (lifecycle) => {
      // U-LIVE #2: on a completed or cancelled event, "Awaiting first
      // registration" is semantically wrong — nothing is being awaited.
      const { getByText, queryByText } = render(
        <RegistrationSection {...baseProps} lifecycle={lifecycle} />,
      );
      expect(getByText('No registrations received')).toBeInTheDocument();
      expect(queryByText('Awaiting first registration')).toBeNull();
    },
  );

  it('shows the actual relative time when there IS a sign-up, regardless of lifecycle', () => {
    const nowMs = Date.parse('2026-06-01T12:00:00Z');
    const oneHourAgo = new Date(nowMs - 3_600_000).toISOString();
    const { getByText } = render(
      <RegistrationSection
        {...baseProps}
        nowMs={nowMs}
        registered={1}
        registeredAt={[oneHourAgo]}
        lifecycle="completed"
      />,
    );
    expect(getByText('1h ago')).toBeInTheDocument();
  });
});
