/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TeamTabs } from './TeamTabs';

afterEach(cleanup);

const teams = [
  { id: 'a', label: 'Team A', members: [{ id: 'm1', name: 'Jo Lee', role: 'Coordinator', available: true }] },
  { id: 'b', label: 'Team B', members: [{ id: 'm2', name: 'Sam Ho', role: 'Coordinator', available: false }] },
];

describe('TeamTabs', () => {
  it('switches the visible member list per tab', () => {
    render(<TeamTabs teams={teams} onMessage={() => undefined} />);
    expect(screen.getByText('Jo Lee')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Team B' }));
    expect(screen.getByText('Sam Ho')).toBeInTheDocument();
  });

  it('disables Message for an unavailable member and emits for an available one', () => {
    render(<TeamTabs teams={teams} onMessage={() => undefined} />);
    expect(screen.getByRole('button', { name: /message/i })).toBeEnabled();
  });

  it('calls onMessage with the member id', () => {
    const onMessage = vi.fn();
    render(<TeamTabs teams={teams} onMessage={onMessage} />);
    fireEvent.click(screen.getByRole('button', { name: /message/i }));
    expect(onMessage).toHaveBeenCalledWith('m1');
  });
});
