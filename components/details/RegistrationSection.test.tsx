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
  state: 'active' as const,
  confirmationsSent: 0,
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

describe('RegistrationSection — G6 confirmations "sent" wording', () => {
  it('renders the confirmation count with the word "sent" (NOT "delivered")', () => {
    const { getByText, queryByText } = render(
      <RegistrationSection {...baseProps} lifecycle="registering" confirmationsSent={58} />,
    );
    expect(getByText('58 sent')).toBeInTheDocument();
    expect(getByText('Confirmations')).toBeInTheDocument();
    // The G6 wording rule: "delivered" must never appear anywhere on this card.
    expect(queryByText(/delivered/i)).toBeNull();
  });

  it('renders 0 sent when no confirmations have gone out yet', () => {
    const { getByText } = render(
      <RegistrationSection {...baseProps} lifecycle="registering" confirmationsSent={0} />,
    );
    expect(getByText('0 sent')).toBeInTheDocument();
  });

  it('omits the Confirmations stat on the drafted lifecycle (publish copy only)', () => {
    const { queryByText, getByText } = render(
      <RegistrationSection {...baseProps} lifecycle="drafted" confirmationsSent={5} />,
    );
    expect(getByText('Publish to begin registration.')).toBeInTheDocument();
    expect(queryByText('Confirmations')).toBeNull();
    expect(queryByText('5 sent')).toBeNull();
  });
});

describe('RegistrationSection — section-state ladder (patterns §7a)', () => {
  it('active state paints the accent ring (border-primary)', () => {
    const { container } = render(
      <RegistrationSection {...baseProps} lifecycle="registering" state="active" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('border-primary');
    expect(section?.className).toContain('border-2');
  });

  it('locked state dims the card (opacity-60)', () => {
    const { container } = render(
      <RegistrationSection {...baseProps} lifecycle="drafted" state="locked" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('opacity-60');
  });

  it('done state has no accent ring and no opacity dim', () => {
    const { container } = render(
      <RegistrationSection {...baseProps} lifecycle="completed" state="done" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).not.toContain('border-primary');
    expect(section?.className).not.toContain('opacity-60');
  });
});
