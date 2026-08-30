/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UserManagementTable } from './UserManagementTable';

afterEach(cleanup);

const users = [
  { id: '1', name: 'Alex Wong', email: 'a@example.com', role: 'Organiser', status: 'active' as const },
  { id: '2', name: 'Beth Chan', email: 'b@example.com', role: 'Manager', status: 'invited' as const },
];

describe('UserManagementTable', () => {
  it('filters users and opens the matching record', () => {
    const onOpen = vi.fn();
    render(<UserManagementTable users={users} onCreate={() => undefined} onOpen={onOpen} />);
    fireEvent.change(screen.getByRole('textbox', { name: /search users/i }), { target: { value: 'Beth' } });
    expect(screen.queryByText('Alex Wong')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledWith('2');
  });

  it('calls onCreate from the Create user action', () => {
    const onCreate = vi.fn();
    render(<UserManagementTable users={users} onCreate={onCreate} onOpen={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    expect(onCreate).toHaveBeenCalled();
  });
});
