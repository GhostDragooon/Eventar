/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublishedNextSteps } from './PublishedNextSteps';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const checkin = 'Check-in opens at 14 Nov 2026, 08:00, 60 minutes before the start.';

function setClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

// UX-01 pick a1: after confirming, the organiser lands here and is told, in words, that the event is public
// and what to do next.
describe('PublishedNextSteps', () => {
  it('says in words that the event is public, and takes focus so it is announced', () => {
    render(<PublishedNextSteps eventId="e1" origin="https://events.example.test" checkinOpens={checkin} />);
    const banner = screen.getByText('Published. Your registration page is live.').closest('[role=status]') as HTMLElement;
    expect(banner).toHaveTextContent('Published. Your registration page is live.');
    expect(document.activeElement).toBe(banner);
  });

  it('lists what to do next: share the link, where registrations show, when check-in opens', () => {
    render(<PublishedNextSteps eventId="e1" origin="https://events.example.test" checkinOpens={checkin} />);
    expect(screen.getByRole('heading', { name: 'What to do next' })).toBeInTheDocument();
    expect(screen.getByText('Share the link')).toBeInTheDocument();
    expect(screen.getByText(/registrations show in the registered count/i)).toBeInTheDocument();
    expect(screen.getByText(checkin)).toBeInTheDocument();
  });

  // Until the Registrations page exists (UX-04) no link here may land on the check-in desk under another name (O6).
  it('links nowhere: no control called registrations lands on the check-in desk', () => {
    render(<PublishedNextSteps eventId="e1" origin="https://events.example.test" checkinOpens={checkin} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('copies the public registration link and confirms it, driven by the result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<PublishedNextSteps eventId="e1" origin="https://events.example.test" checkinOpens={checkin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://events.example.test/events/e1'));
    // A live region, so a screen reader hears it; the button keeps its name.
    expect(await screen.findByText('Link copied')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('says so when the link cannot be copied, and keeps the link visible to select', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<PublishedNextSteps eventId="e1" origin="https://events.example.test" checkinOpens={checkin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not copy/i);
    expect(screen.getByText('https://events.example.test/events/e1')).toBeInTheDocument();
  });

  it('drops the published flag from the address once it has arrived, so a reload does not repeat it', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    render(<PublishedNextSteps eventId="e1" origin="https://events.example.test" checkinOpens={checkin} />);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toBeNull();
    expect(String(replace.mock.calls[0][2])).not.toContain('published=1');
  });
});
