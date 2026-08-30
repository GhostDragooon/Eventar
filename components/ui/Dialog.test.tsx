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
});
