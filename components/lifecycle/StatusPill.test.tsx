/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';

afterEach(cleanup);

describe('StatusPill', () => {
  it.each([
    ['drafted', /^draft$/i],
    ['registering', /registering/i],
    ['upcoming', /upcoming/i],
    ['live', /live/i],
    ['completed', /completed/i],
    ['cancelled', /cancelled/i],
  ] as const)('renders %s pill with matching label', (lifecycle, labelRegex) => {
    render(<StatusPill lifecycle={lifecycle} />);
    expect(screen.getByText(labelRegex)).toBeInTheDocument();
  });

  it('Live pill carries the live-pill-pulse class for background animation', () => {
    const { container } = render(<StatusPill lifecycle="live" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.className).toContain('live-pill-pulse');
  });

  it('Live pill has a leading 6px dot for the broadcast-convention indicator', () => {
    const { container } = render(<StatusPill lifecycle="live" />);
    const dot = container.querySelector('span > span');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain('rounded-full');
    expect(dot?.className).toContain('bg-on-success');
  });

  // UX-R6: a full event is not "Registering" any more; only the registering state is replaced.
  it('says At capacity instead of Registering when the event is full', () => {
    render(<StatusPill lifecycle="registering" full />);
    expect(screen.getByText(/at capacity/i)).toBeInTheDocument();
    expect(screen.queryByText(/registering/i)).not.toBeInTheDocument();
  });

  it('leaves every other state alone when full', () => {
    render(<StatusPill lifecycle="live" full />);
    expect(screen.getByText(/live/i)).toBeInTheDocument();
  });
});
