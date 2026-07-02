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
  confirmationsSent: 0,
};

describe('RegistrationSection — "Last sign-up" empty copy (open window only)', () => {
  it.each(['registering', 'upcoming'] as const)(
    'shows forward-looking "Awaiting first registration" on %s lifecycle',
    (lifecycle) => {
      const { getByText } = render(<RegistrationSection {...baseProps} lifecycle={lifecycle} />);
      expect(getByText('Awaiting first registration')).toBeInTheDocument();
    },
  );

  it('shows the actual relative time when there IS a sign-up', () => {
    const nowMs = Date.parse('2026-06-01T12:00:00Z');
    const oneHourAgo = new Date(nowMs - 3_600_000).toISOString();
    const { getByText } = render(
      <RegistrationSection
        {...baseProps}
        nowMs={nowMs}
        registered={1}
        registeredAt={[oneHourAgo]}
        lifecycle="registering"
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

  it('omits the Confirmations stat on the drafted lifecycle (publish copy only)', () => {
    const { queryByText, getByText } = render(
      <RegistrationSection {...baseProps} lifecycle="drafted" confirmationsSent={5} />,
    );
    expect(getByText('Publish to begin registration.')).toBeInTheDocument();
    expect(queryByText('Confirmations')).toBeNull();
    expect(queryByText('5 sent')).toBeNull();
  });
});

describe('RegistrationSection — one-line stub after the door opens', () => {
  it.each(['live', 'completed', 'cancelled'] as const)(
    'collapses to "closed · N final · M confirmed" on %s lifecycle',
    (lifecycle) => {
      const { getByText, queryByText } = render(
        <RegistrationSection
          {...baseProps}
          lifecycle={lifecycle}
          registered={48}
          confirmationsSent={48}
        />,
      );
      expect(getByText(/closed/)).toBeInTheDocument();
      expect(getByText('48 final · 48 confirmed')).toBeInTheDocument();
      // Full-card stats disappear in the stub.
      expect(queryByText('Last sign-up')).toBeNull();
      expect(queryByText('Confirmations')).toBeNull();
    },
  );

  it('keeps the full card while registering (numbered chip + open meta)', () => {
    const { getByText } = render(
      <RegistrationSection {...baseProps} lifecycle="registering" registered={3} />,
    );
    expect(getByText('01')).toBeInTheDocument();
    expect(getByText(/open/)).toBeInTheDocument();
    expect(getByText('Last sign-up')).toBeInTheDocument();
  });
});
