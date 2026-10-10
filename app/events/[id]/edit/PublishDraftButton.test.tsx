/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { publishEvent } = vi.hoisted(() => ({ publishEvent: vi.fn() }));
vi.mock('./actions', () => ({ publishEvent }));

import PublishDraftButton from './PublishDraftButton';

// Same allowance as the sibling component tests: the first render in a cold
// worker is slow when the whole suite runs at once.
configure({ asyncUtilTimeout: 3000 });

afterEach(cleanup);
beforeEach(() => publishEvent.mockReset());

const roleNote = /save your changes, then ask an organiser admin to publish this draft/i;

describe('PublishDraftButton', () => {
  // A published event is read-only until a later package, so the card says so BEFORE
  // the one-way step, at reading size, right above the button (not in 12px grey).
  it('warns that details cannot be edited after publishing, above the button', () => {
    render(<PublishDraftButton eventId="event-1" canPublish />);
    const warning = screen.getByText(/details cannot be edited after publishing yet, so check them first/i);
    const button = screen.getByRole('button', { name: 'Publish event' });
    expect(warning.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning.className).toMatch(/text-body-md/);
  });

  it('does not show that warning to a role that cannot publish', () => {
    render(<PublishDraftButton eventId="event-1" canPublish={false} />);
    expect(screen.queryByText(/cannot be edited after publishing/i)).toBeNull();
  });

  it('publishes the draft it was given, once per click', async () => {
    publishEvent.mockResolvedValue({ ok: true });
    render(<PublishDraftButton eventId="event-1" canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(publishEvent).toHaveBeenCalledTimes(1));
    expect(publishEvent).toHaveBeenCalledWith('event-1');
  });

  it('shows progress and ignores a second click while the first is in flight', async () => {
    let finish!: (v: { ok: true }) => void;
    publishEvent.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<PublishDraftButton eventId="event-1" canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));

    const pending = await screen.findByRole('button', { name: /publishing/i });
    // aria-disabled, not `disabled`: a disabled button drops keyboard focus to <body>
    // mid-publish, and a screen-reader user loses their place.
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(pending).not.toHaveAttribute('disabled');
    fireEvent.click(pending);
    expect(publishEvent).toHaveBeenCalledTimes(1);

    await act(async () => finish({ ok: true }));
  });

  it('shows a refusal inline, next to the button, and lets the organiser try again', async () => {
    publishEvent.mockResolvedValue({ error: 'Cannot publish: event not found or not in your organisation.' });
    render(<PublishDraftButton eventId="event-1" canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot publish: event not found or not in your organisation.');
    expect(screen.getByRole('button', { name: 'Publish event' })).toBeEnabled();
  });

  it('clears a previous refusal as soon as the organiser tries again', async () => {
    publishEvent.mockResolvedValueOnce({ error: 'Cannot publish: event not found or not in your organisation.' });
    render(<PublishDraftButton eventId="event-1" canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    let finish!: (v: { ok: true }) => void;
    publishEvent.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('button', { name: /publishing/i })).toHaveAttribute('aria-disabled', 'true');

    await act(async () => finish({ ok: true }));
  });

  it('shows no error after a successful publish', async () => {
    publishEvent.mockResolvedValue({ ok: true });
    render(<PublishDraftButton eventId="event-1" canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(publishEvent).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish event' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a role that cannot publish gets what to do instead of a button, and nothing can be sent', () => {
    render(<PublishDraftButton eventId="event-1" canPublish={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(roleNote)).toBeInTheDocument();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  // tailwind-merge reads `text-label-md` as a text colour and, without the `!`,
  // silently drops the Button's own `text-on-primary` (the first Band 1 pass hit
  // this on the sign-in button). Both classes must survive, and the target is 44px.
  it('keeps the on-primary text colour next to the type-scale class, at a 44px target', () => {
    render(<PublishDraftButton eventId="event-1" canPublish />);
    const classes = screen.getByRole('button', { name: 'Publish event' }).className;
    expect(classes).toMatch(/(^|\s)text-on-primary!(\s|$)/);
    expect(classes).toMatch(/(^|\s)text-label-md(\s|$)/);
    expect(classes).toMatch(/(^|\s)min-h-11(\s|$)/);
  });
});
