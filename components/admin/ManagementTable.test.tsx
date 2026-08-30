/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ManagementTable } from './ManagementTable';

afterEach(cleanup);

const records = [{ id: '1', name: 'Record One', owner: 'Alex', status: 'active' as const }];

describe('ManagementTable', () => {
  it('tracks row selection and reports it', () => {
    const onSelectionChange = vi.fn();
    render(<ManagementTable records={records} onSelectionChange={onSelectionChange} onAction={() => undefined} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /select record one/i }));
    expect(onSelectionChange).toHaveBeenCalledWith(['1']);
  });

  it('emits open and archive actions', () => {
    const onAction = vi.fn();
    render(<ManagementTable records={records} onSelectionChange={() => undefined} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onAction).toHaveBeenCalledWith('1', 'open');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onAction).toHaveBeenCalledWith('1', 'archive');
  });
});
