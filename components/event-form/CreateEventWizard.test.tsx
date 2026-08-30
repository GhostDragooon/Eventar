/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CreateEventWizard, type CreateEventWizardValue } from './CreateEventWizard';

afterEach(cleanup);

const emptyValue = { title: '', officialTitle: '', format: '', summary: '' };

describe('CreateEventWizard', () => {
  it('blocks progression until the required event name is supplied', () => {
    render(<CreateEventWizard value={emptyValue} onChange={() => undefined} onReady={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Event name is required.');
  });

  it('advances to the When step once a name is supplied, marking Basics complete and selectable', () => {
    render(
      <CreateEventWizard
        value={{ ...emptyValue, title: 'Clinical workshop' }}
        onChange={() => undefined}
        onReady={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('Start date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /basics/i })).toBeInTheDocument();
  });

  it('calls onReady with the assembled value from the Review step', () => {
    const onReady = vi.fn();
    const value = {
      title: 'Clinical workshop',
      officialTitle: '',
      format: 'Workshop',
      summary: '',
      startDate: '2026-08-20',
      startTime: 9 * 60,
      endDate: '2026-08-20',
      endTime: 17 * 60,
    };
    render(<CreateEventWizard value={value} onChange={() => undefined} onReady={onReady} />);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    expect(onReady).toHaveBeenCalledWith(value);
  });

  it('re-validates before firing onReady even when the step indicator is used to skip the Continue gates', () => {
    const onReady = vi.fn();
    const validValue: CreateEventWizardValue = {
      title: 'Clinical workshop',
      officialTitle: '',
      format: '',
      summary: '',
      startDate: '2026-08-20',
      startTime: 9 * 60,
      endDate: '2026-08-20',
      endTime: 17 * 60,
    };
    const { rerender } = render(
      <CreateEventWizard value={validValue} onChange={() => undefined} onReady={onReady} />,
    );

    // Complete legitimately once, so every step (including Review) becomes
    // a selectable indicator.
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));
    expect(onReady).toHaveBeenCalledTimes(1);
    onReady.mockClear();

    // Jump back to Basics via the indicator and simulate the host clearing
    // the title in response to onChange.
    fireEvent.click(screen.getByRole('button', { name: /basics/i }));
    rerender(
      <CreateEventWizard value={{ ...validValue, title: '' }} onChange={() => undefined} onReady={onReady} />,
    );

    // Jump straight to the now-selectable Review step, skipping both
    // Continue gates, and try to create.
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Event name is required.');
  });
});
