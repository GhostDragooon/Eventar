/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PublishConfirmDialog } from './PublishConfirmDialog';

afterEach(cleanup);

const facts = {
  registrationOpens: 'Registration opens now.',
  checkinOpens: 'Check-in opens at 14 Nov 2026, 08:00, 60 minutes before the start.',
};

function setup(over: Partial<React.ComponentProps<typeof PublishConfirmDialog>> = {}) {
  const props = { open: true, onOpenChange: vi.fn(), onConfirm: vi.fn(), pending: false, title: 'Heart Failure Update', facts, ...over };
  render(<PublishConfirmDialog {...props} />);
  return props;
}

describe('PublishConfirmDialog', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the event and says what becomes public, what starts, and that it cannot be edited yet', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Publish this event?' });
    expect(dialog).toHaveTextContent('Heart Failure Update');
    expect(dialog).toHaveTextContent('Your registration page goes live. Anyone with the link can register.');
    expect(dialog).toHaveTextContent(facts.registrationOpens);
    expect(dialog).toHaveTextContent(facts.checkinOpens);
    expect(dialog).toHaveTextContent('Details cannot be edited after publishing yet, so check them first.');
  });

  it('publishes only when the organiser confirms', () => {
    const p = setup();
    expect(p.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Keep editing closes without publishing', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it('shows progress, ignores a second click, and cannot be dismissed while publishing', () => {
    const p = setup({ pending: true });
    const btn = screen.getByRole('button', { name: /publishing/i });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(p.onConfirm).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(p.onOpenChange).not.toHaveBeenCalled();
  });

  it('shows a refusal inside the dialog as an alert', () => {
    setup({ error: 'Cannot publish: event not found or not in your organisation.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot publish: event not found or not in your organisation.');
  });

  it('when blocked, drops the Publish button and offers Close', () => {
    setup({ blocked: true, error: 'No longer a current draft.' });
    expect(screen.queryByRole('button', { name: 'Publish event' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('is described by what goes public and what starts, so a screen reader hears it with the title', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Publish this event?' });
    expect(dialog).toHaveAccessibleDescription(/your registration page goes live/i);
    expect(dialog).toHaveAccessibleDescription(/details cannot be edited after publishing/i);
  });
});
