/** @vitest-environment jsdom */
import { vi } from 'vitest';

vi.mock('./speakerActions', () => ({ toggleSpeakerCheckin: vi.fn() }));

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SpeakersCard } from './SpeakersCard';

afterEach(cleanup);

// RV-FINAL F61: a published event's agenda cannot be edited, so "add them to the agenda first" was an instruction
// nobody could follow. The empty state now only states the fact.
describe('SpeakersCard empty state', () => {
  it('states that no speakers are listed and gives no instruction to edit the agenda', () => {
    render(<SpeakersCard eventId="e1" eventTimezone="Asia/Hong_Kong" speakerNames={[]} initialCheckins={[]} canCheckIn />);
    expect(screen.getByText("No speakers are listed on this event's agenda.")).toBeInTheDocument();
    expect(screen.queryByText(/add them to the agenda/i)).toBeNull();
  });
});

// Backtest M1: body_admin and auditor read this desk; the sentence that says why sits once at the top of the desk
// (#checkin-closed-note), the buttons only point at it.
describe('SpeakersCard role gate', () => {
  const props = { eventId: 'e1', eventTimezone: 'Asia/Hong_Kong', speakerNames: ['Ada Lovelace', 'Grace Hopper'], initialCheckins: [] };

  it('disables every Check in button for a role that cannot check in, pointing at the desk note', () => {
    render(<SpeakersCard {...props} canCheckIn={false} />);
    const buttons = screen.getAllByRole('button', { name: /check in/i });
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute('aria-describedby', 'checkin-closed-note');
    }
  });

  it('leaves them enabled for a role that can', () => {
    render(<SpeakersCard {...props} canCheckIn />);
    for (const b of screen.getAllByRole('button', { name: /check in/i })) {
      expect(b).toBeEnabled();
      expect(b).not.toHaveAttribute('aria-describedby');
    }
  });
});
