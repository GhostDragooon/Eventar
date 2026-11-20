/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';

afterEach(cleanup);
beforeEach(() => vi.useRealTimers());

function Trigger({ tone, message }: { tone: 'success' | 'error' | 'neutral'; message: string }) {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast(tone, message)}>
      fire
    </button>
  );
}

describe('ToastProvider / useToast', () => {
  it('renders children and an aria-live notification region', () => {
    const { getByText, container } = render(
      <ToastProvider>
        <span>child-content</span>
      </ToastProvider>,
    );
    expect(getByText('child-content')).toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('shows a toast with role=status and the message', () => {
    const { getByText, getByRole } = render(
      <ToastProvider>
        <Trigger tone="success" message="3 events restored." />
      </ToastProvider>,
    );
    fireEvent.click(getByText('fire'));
    expect(getByRole('status')).toHaveTextContent('3 events restored.');
  });

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers();
    const { getByText, queryByRole } = render(
      <ToastProvider>
        <Trigger tone="error" message="Could not update." />
      </ToastProvider>,
    );
    fireEvent.click(getByText('fire'));
    expect(queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(4600);
    });
    // Still mounted while it animates out, gone after the leave window.
    expect(queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(queryByRole('status')).toBeNull();
  });

  it('can be dismissed manually (leaves for 200ms, then is removed)', () => {
    vi.useFakeTimers();
    const { getByText, getByLabelText, queryByRole } = render(
      <ToastProvider>
        <Trigger tone="neutral" message="Heads up." />
      </ToastProvider>,
    );
    fireEvent.click(getByText('fire'));
    fireEvent.click(getByLabelText('Dismiss notification'));
    expect(queryByRole('status')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(queryByRole('status')).toBeNull();
  });

  it('a toast with an action renders a link and never auto-dismisses', () => {
    vi.useFakeTimers();
    function ActionTrigger() {
      const { toast } = useToast();
      return (
        <button type="button" onClick={() => toast('success', 'Checked in.', { label: 'View', href: '/x' })}>
          fire
        </button>
      );
    }
    const { getByText, getByRole, queryByRole } = render(
      <ToastProvider>
        <ActionTrigger />
      </ToastProvider>,
    );
    fireEvent.click(getByText('fire'));
    expect(getByRole('link', { name: 'View' })).toHaveAttribute('href', '/x');
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(queryByRole('status')).not.toBeNull();
  });

  it('useToast outside the provider throws loudly (no silent no-op)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger tone="neutral" message="x" />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
