/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { publishEvent, push, refresh } = vi.hoisted(() => ({ publishEvent: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('./actions', () => ({ publishEvent }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

import PublishDraftButton from './PublishDraftButton';
import { setDraftDirty } from '@/lib/draftDirty';

// Same allowance as the sibling component tests: the first render in a cold
// worker is slow when the whole suite runs at once.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => { cleanup(); setDraftDirty('event-1', false); });
beforeEach(() => { publishEvent.mockReset(); push.mockReset(); refresh.mockReset(); });

const roleNote = /save your changes, then ask an organiser admin to publish this draft/i;
const eventProps = { eventId: 'event-1', title: 'Heart Failure Update', startIso: '2026-11-14T01:00:00.000Z', timezone: 'Asia/Hong_Kong', registrationOpenIso: null };

function open() {
  render(<PublishDraftButton {...eventProps} canPublish />);
  fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
  return screen.getByRole('dialog');
}
function confirm(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Publish event' }));
}

describe('PublishDraftButton', () => {
  // A published event is read-only until a later package, so the card says so BEFORE
  // the one-way step, at reading size, right above the button (not in 12px grey).
  it('warns that details cannot be edited after publishing, above the button, and ties the button to it', () => {
    render(<PublishDraftButton {...eventProps} canPublish />);
    const warning = screen.getByText(/details cannot be edited after publishing yet, so check them first/i);
    const button = screen.getByRole('button', { name: 'Publish event' });
    expect(warning.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning.className).toMatch(/text-body-md/);
    expect(warning.id).not.toBe('');
    expect(button).toHaveAttribute('aria-describedby', warning.id);
  });

  it('does not show that warning to a role that cannot publish', () => {
    render(<PublishDraftButton {...eventProps} canPublish={false} />);
    expect(screen.queryByText(/cannot be edited after publishing/i)).toBeNull();
  });

  it('a role that cannot publish gets what to do instead of a button, and nothing can be sent', () => {
    render(<PublishDraftButton {...eventProps} canPublish={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(roleNote)).toBeInTheDocument();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('asks first: the Publish button opens a confirm and publishes nothing', () => {
    const dialog = open();
    expect(dialog).toHaveTextContent('Heart Failure Update');
    expect(dialog).toHaveTextContent('Registration opens now.');
    expect(dialog).toHaveTextContent('Check-in opens at 14 Nov 2026, 08:00');
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('Keep editing closes the confirm and publishes nothing', () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('publishes the draft it was given, once, and lands on the details page in its Published state', async () => {
    publishEvent.mockResolvedValue({ ok: true });
    confirm(open());
    await waitFor(() => expect(publishEvent).toHaveBeenCalledTimes(1));
    expect(publishEvent).toHaveBeenCalledWith('event-1');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/events/event-1/details?published=1'));
  });

  it('shows progress and ignores a second click while the first is in flight', async () => {
    let finish!: (v: { ok: true }) => void;
    publishEvent.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    confirm(open());

    const pending = await screen.findByRole('button', { name: /publishing/i });
    // aria-disabled, not `disabled`: a disabled button drops keyboard focus to <body>
    // mid-publish, and a screen-reader user loses their place.
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    expect(pending).not.toHaveAttribute('disabled');
    fireEvent.click(pending);
    expect(publishEvent).toHaveBeenCalledTimes(1);

    await act(async () => finish({ ok: true }));
  });

  it('shows a refusal inside the confirm, keeps it open, and lets the organiser try again', async () => {
    publishEvent.mockResolvedValueOnce({ error: 'Cannot publish: event not found or not in your organisation.' });
    const dialog = open();
    confirm(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cannot publish: event not found or not in your organisation.');
    expect(push).not.toHaveBeenCalled();

    // The error clears as soon as they try again.
    let finish!: (v: { ok: true }) => void;
    publishEvent.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    confirm(dialog);
    await waitFor(() => expect(within(dialog).queryByRole('alert')).toBeNull());
    await act(async () => finish({ ok: true }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it('when the draft is no longer current, says so, links Manage, offers only Close, and refreshes the page when closed', async () => {
    publishEvent.mockResolvedValue({ error: "This event can't be published because it is no longer a current draft.", stale: true });
    const dialog = open();
    confirm(dialog);
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent("no longer a current draft");
    expect(within(alert).getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/dashboard/manage');
    expect(within(dialog).queryByRole('button', { name: 'Publish event' })).toBeNull();
    // The DRAFT badge and this card are stale behind the dialog: refresh them when it is dismissed.
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('refuses while the form has unsaved changes: no confirm, no publish, and it says why', () => {
    setDraftDirty('event-1', true);
    render(<PublishDraftButton {...eventProps} canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/changes that are not saved/i);
    expect(publishEvent).not.toHaveBeenCalled();
    // Saved again: the same click now opens the confirm and the notice goes.
    act(() => setDraftDirty('event-1', false));
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not bring the unsaved-changes notice back on a later edit once the form was saved', () => {
    setDraftDirty('event-1', true);
    render(<PublishDraftButton {...eventProps} canPublish />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish event' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => setDraftDirty('event-1', false));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => setDraftDirty('event-1', true)); // typing again, no click on Publish
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // tailwind-merge reads `text-label-md` as a text colour and, without the `!`,
  // silently drops the Button's own `text-on-primary` (the first Band 1 pass hit
  // this on the sign-in button). Both classes must survive, and the target is 44px.
  it('keeps the on-primary text colour next to the type-scale class, at a 44px target', () => {
    render(<PublishDraftButton {...eventProps} canPublish />);
    const classes = screen.getByRole('button', { name: 'Publish event' }).className;
    expect(classes).toMatch(/(^|\s)text-on-primary!(\s|$)/);
    expect(classes).toMatch(/(^|\s)text-label-md(\s|$)/);
    expect(classes).toMatch(/(^|\s)min-h-11(\s|$)/);
  });
});
