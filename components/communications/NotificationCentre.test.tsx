/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotificationCentre } from './NotificationCentre';

afterEach(cleanup);

const items = [
  { id: 'n1', kind: 'notification' as const, title: 'Reminder sent', body: 'Body', read: false },
  { id: 't1', kind: 'team' as const, title: 'Teammate joined', body: 'Body', read: true },
];

describe('NotificationCentre', () => {
  it('filters items by the active tab', () => {
    render(<NotificationCentre items={items} onMarkRead={() => undefined} />);
    expect(screen.getByText('Reminder sent')).toBeInTheDocument();
    expect(screen.queryByText('Teammate joined')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Team updates' }));
    expect(screen.getByText('Teammate joined')).toBeInTheDocument();
  });

  it('calls onMarkRead for an unread item', () => {
    const onMarkRead = vi.fn();
    render(<NotificationCentre items={items} onMarkRead={onMarkRead} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(onMarkRead).toHaveBeenCalledWith('n1');
  });
});
