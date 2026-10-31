/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NeedsAttention, type AttentionItem } from './NeedsAttention';

afterEach(cleanup);

const item = (n: number): AttentionItem => ({ id: `i${n}`, tone: 'warn', icon: 'mail', title: `Item ${n}`, detail: 'detail', meta: 'now', href: `/events/${n}/details` });

describe('NeedsAttention limit', () => {
  it('shows every row when no limit is given', () => {
    render(<NeedsAttention items={[1, 2, 3, 4, 5].map(item)} />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(document.querySelector('details')).toBeNull();
  });

  it('with a limit, shows that many most-urgent rows and folds the rest behind a disclosure that still lists them', () => {
    render(<NeedsAttention items={[1, 2, 3, 4, 5].map(item)} limit={3} />);
    const details = document.querySelector('details')!;
    expect(details).not.toBeNull();
    expect(details.hasAttribute('open')).toBe(false);
    expect(within(details).getByText('Show 2 more')).toBeInTheDocument();
    expect(within(details).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('Item 4'), expect.stringContaining('Item 5')]);
    expect(screen.getByText('5 items · every row links to its fix')).toBeInTheDocument();
  });

  it('no disclosure when the items fit the limit', () => {
    render(<NeedsAttention items={[1, 2].map(item)} limit={3} />);
    expect(document.querySelector('details')).toBeNull();
  });
});
