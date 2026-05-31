/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it.each([
    ['drafted', /drafted/i],
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

  it('Live pill has a leading 6px white dot for the broadcast-convention indicator', () => {
    const { container } = render(<StatusPill lifecycle="live" />);
    const dot = container.querySelector('span > span');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain('rounded-full');
    expect(dot?.className).toContain('bg-on-error');
  });
});
