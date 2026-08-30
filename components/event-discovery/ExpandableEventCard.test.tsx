/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ExpandableEventCard } from './ExpandableEventCard';

afterEach(cleanup);

const event = {
  id: 'event-1',
  title: 'Clinical workshop',
  summary: 'Structured event summary.',
  format: 'Workshop',
  dateLabel: '16 August 2026',
  venueLabel: 'Main Hall',
  imageUrl: '/event.jpg',
};

// Card and dialog now share the exact same Save/Saved label — scope every
// query to the dialog explicitly rather than relying on incidental text
// differences to disambiguate (that's the same fragility that produced the
// duplicate "Close event details" bug earlier; do not reintroduce it).
function dialog() {
  return within(screen.getByRole('dialog'));
}

describe('ExpandableEventCard', () => {
  it('closes on Escape and renders the supplied image', () => {
    const onOpenChange = vi.fn();
    render(<ExpandableEventCard event={event} open onOpenChange={onOpenChange} />);
    expect(document.querySelector('article[role="dialog"] img')).toHaveAttribute('src', '/event.jpg');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('wraps forward focus from the last dialog control to the first', () => {
    render(<ExpandableEventCard event={event} open onOpenChange={() => undefined} onSaveChange={() => undefined} />);
    const close = dialog().getByRole('button', { name: /close event details/i });
    const save = dialog().getByRole('button', { name: /^save$/i });
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('wraps reverse focus from the first dialog control to the last', () => {
    render(<ExpandableEventCard event={event} open onOpenChange={() => undefined} onSaveChange={() => undefined} />);
    const close = dialog().getByRole('button', { name: /close event details/i });
    const save = dialog().getByRole('button', { name: /^save$/i });
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
  });

  it('gives the dialog Save the same treatment and label as the card it expands from', () => {
    const { container } = render(
      <ExpandableEventCard event={event} open onOpenChange={() => undefined} onSaveChange={() => undefined} />,
    );
    // The card's Save and the dialog's Save are the only aria-pressed
    // controls here, card first in DOM order.
    const [cardSave, dialogSave] = [...container.querySelectorAll('[aria-pressed]')];
    expect(dialogSave.className).toBe(cardSave.className);
    expect(dialogSave.className).not.toContain('text-on-primary');
    expect(dialogSave.textContent).toBe(cardSave.textContent);
  });

  it('emits save state from the expanded view', () => {
    const onSaveChange = vi.fn();
    render(
      <ExpandableEventCard event={event} open onOpenChange={() => undefined} onSaveChange={onSaveChange} />,
    );
    fireEvent.click(dialog().getByRole('button', { name: /^save$/i }));
    expect(onSaveChange).toHaveBeenCalledWith('event-1', true);
  });

  it('omits Save from the dialog when the host supplies no save handler, matching the card', () => {
    render(<ExpandableEventCard event={event} open onOpenChange={() => undefined} />);
    expect(dialog().queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    // The close button is then the dialog's only control; the focus trap must
    // still hold rather than throwing on a single-element cycle.
    const close = dialog().getByRole('button', { name: /close event details/i });
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
  });

  it('switches the dialog label to "Saved" once saved, matching the card', () => {
    render(<ExpandableEventCard event={event} open onOpenChange={() => undefined} onSaveChange={() => undefined} saved />);
    expect(dialog().getByRole('button', { name: /^saved$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(dialog().queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });
});
