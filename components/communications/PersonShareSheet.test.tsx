/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PersonShareSheet } from './PersonShareSheet';

afterEach(cleanup);

const people = [{ id: 'p1', name: 'Ada Wong', detail: 'ada@example.com' }];

describe('PersonShareSheet', () => {
  it('keeps Share disabled until a person is selected, then calls onSend', async () => {
    const onSend = vi.fn().mockResolvedValue({ ok: true });
    render(<PersonShareSheet people={people} onSend={onSend} />);
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Shared successfully.');
    expect(onSend).toHaveBeenCalledWith(['p1']);
  });
});
