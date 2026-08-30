/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MultiStepRunButton } from './MultiStepRunButton';

afterEach(cleanup);

describe('MultiStepRunButton', () => {
  it('runs steps in order and calls onComplete', async () => {
    const onComplete = vi.fn();
    const steps = [
      { id: 'a', label: 'Step A', run: vi.fn().mockResolvedValue({ ok: true as const }) },
      { id: 'b', label: 'Step B', run: vi.fn().mockResolvedValue({ ok: true as const }) },
    ];
    render(<MultiStepRunButton steps={steps} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run workflow' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument());
    expect(steps[0].run).toHaveBeenCalled();
    expect(steps[1].run).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('stops and surfaces the error on a failing step', async () => {
    const steps = [
      { id: 'a', label: 'Step A', run: vi.fn().mockResolvedValue({ error: 'Step A failed.' }) },
      { id: 'b', label: 'Step B', run: vi.fn().mockResolvedValue({ ok: true as const }) },
    ];
    render(<MultiStepRunButton steps={steps} onComplete={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run workflow' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Step A failed.'));
    expect(steps[1].run).not.toHaveBeenCalled();
  });
});
