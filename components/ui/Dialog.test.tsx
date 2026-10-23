/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Dialog open={false} onOpenChange={() => undefined} title="Enter code" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('labels itself by its title', () => {
    render(<Dialog open onOpenChange={() => undefined} title="Enter code" />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Enter code');
  });

  it('closes on Escape and on scrim click', () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <Dialog open onOpenChange={onOpenChange} title="Enter code" />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    // The scrim is the aria-hidden sibling of the panel, deliberately not a
    // named button — click it directly rather than by role.
    const scrim = container.querySelector('[aria-hidden]');
    fireEvent.click(scrim!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves focus to the first field rather than the close button when one exists', () => {
    render(
      <Dialog open onOpenChange={() => undefined} title="Enter code">
        <input aria-label="Code" />
      </Dialog>,
    );
    expect(screen.getByLabelText('Code')).toHaveFocus();
  });

  it('falls back to the close button when the dialog has no field', () => {
    render(<Dialog open onOpenChange={() => undefined} title="Scan badge" />);
    expect(screen.getByRole('button', { name: /close scan badge/i })).toHaveFocus();
  });

  it('traps Tab in both directions', () => {
    render(
      <Dialog
        open
        onOpenChange={() => undefined}
        title="Enter code"
        footer={<button type="button">Done</button>}
      />,
    );
    const close = screen.getByRole('button', { name: /close enter code/i });
    const done = screen.getByRole('button', { name: 'Done' });

    done.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
  });

  it('restores focus to the opener when it closes', () => {
    const harness = (open: boolean) => (
      <>
        <button type="button" data-testid="opener">
          Open
        </button>
        <Dialog open={open} onOpenChange={() => undefined} title="Enter code" />
      </>
    );

    // Real sequence: the opener holds focus BEFORE the dialog opens — that is
    // what the dialog captures as the element to restore to.
    const { rerender } = render(harness(false));
    const opener = screen.getByTestId('opener');
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(harness(true));
    expect(opener).not.toHaveFocus();

    rerender(harness(false));
    expect(opener).toHaveFocus();
  });

  // Callers pass inline callbacks, so the prop changes identity on every parent render (a pending flag, an
  // error message). The effect that moves focus in and plays the open animation must not re-run for that:
  // it pulled focus off the button being pressed and replayed the animation (review UX-03 M1).
  it('keeps focus and does not replay the open animation when the parent re-renders with a new callback', () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    const ui = (cb: () => void) => (
      <Dialog open onOpenChange={cb} title="Publish" footer={<button type="button">Confirm</button>} />
    );
    const { rerender } = render(ui(() => undefined));
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    confirm.focus();
    const playedAtOpen = animate.mock.calls.length;

    rerender(ui(() => undefined));
    expect(confirm).toHaveFocus();
    expect(animate.mock.calls.length).toBe(playedAtOpen);
  });

  it('closes through the latest callback, not the one it had when it opened', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog open onOpenChange={first} title="Enter code" />);
    rerender(<Dialog open onOpenChange={second} title="Enter code" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second).toHaveBeenCalledWith(false);
    expect(first).not.toHaveBeenCalled();
  });
});
