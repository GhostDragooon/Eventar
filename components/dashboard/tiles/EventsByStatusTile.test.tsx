/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EventsByStatusTile } from './EventsByStatusTile';

describe('EventsByStatusTile', () => {
  it('renders total event count as headline', () => {
    const { getByText } = render(
      <EventsByStatusTile counts={{ drafted: 2, registering: 5, upcoming: 1, live: 0, completed: 12 }} />,
    );
    expect(getByText('20')).toBeInTheDocument();
  });

  it('renders 0 when no events', () => {
    const { getByText } = render(
      <EventsByStatusTile counts={{ drafted: 0, registering: 0, upcoming: 0, live: 0, completed: 0 }} />,
    );
    expect(getByText('0')).toBeInTheDocument();
  });

  it('renders 5 legend entries with abbreviated labels and counts', () => {
    const { container } = render(
      <EventsByStatusTile counts={{ drafted: 2, registering: 5, upcoming: 1, live: 0, completed: 12 }} />,
    );
    const legend = container.textContent ?? '';
    expect(legend).toContain('D 2');
    expect(legend).toContain('R 5');
    expect(legend).toContain('U 1');
    expect(legend).toContain('L 0');
    expect(legend).toContain('C 12');
  });
});
