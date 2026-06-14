/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AttendanceSection } from './AttendanceSection';

// vitest.config has no `globals: true` — explicit cleanup keeps jsdom rooted.
afterEach(cleanup);

const baseProps = {
  eventId: 'e1',
  registered: 10,
  attended: 0,
  checkIns: [] as (string | null)[],
  startTime: '2026-06-15T09:00:00Z',
  state: 'active' as const,
};

describe('AttendanceSection — "Scanning live" indicator (§9 top-left)', () => {
  it('renders the live indicator with the live-pill-pulse class when lifecycle=live', () => {
    const { getByText, container } = render(
      <AttendanceSection {...baseProps} lifecycle="live" />,
    );
    const indicator = getByText(/Scanning live/);
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain('live-pill-pulse');
    // §9: same row as the heading, NOT in the top-right of the card.
    // Headings + indicator both live in the first flex row inside the section.
    const heading = container.querySelector('h2');
    expect(heading?.parentElement?.contains(indicator)).toBe(true);
  });

  it('does NOT render the live indicator when lifecycle is not live', () => {
    for (const lc of ['drafted', 'registering', 'upcoming', 'completed', 'cancelled'] as const) {
      cleanup();
      const { queryByText } = render(<AttendanceSection {...baseProps} lifecycle={lc} />);
      expect(queryByText(/Scanning live/)).toBeNull();
    }
  });
});

describe('AttendanceSection — section-state ladder', () => {
  it('active state paints the accent ring (live lifecycle)', () => {
    const { container } = render(
      <AttendanceSection {...baseProps} lifecycle="live" state="active" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('border-primary');
  });

  it('locked state dims the card', () => {
    const { container } = render(
      <AttendanceSection {...baseProps} lifecycle="drafted" state="locked" />,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('opacity-60');
  });
});
