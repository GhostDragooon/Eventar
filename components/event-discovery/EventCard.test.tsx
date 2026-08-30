/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventCard } from './EventCard';

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

describe('EventCard', () => {
  it('emits open and save actions', () => {
    const onOpen = vi.fn();
    const onSaveChange = vi.fn();
    render(<EventCard event={event} onOpen={onOpen} onSaveChange={onSaveChange} />);
    fireEvent.click(screen.getByRole('button', { name: /view details/i }));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onOpen).toHaveBeenCalledWith('event-1');
    expect(onSaveChange).toHaveBeenCalledWith('event-1', true);
  });

  it('reflects a saved event as pressed, with the label switched to "Saved"', () => {
    render(<EventCard event={event} onOpen={() => undefined} onSaveChange={() => undefined} saved />);
    expect(screen.getByRole('button', { name: /^saved$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('omits Save entirely when the host supplies no save handler', () => {
    render(<EventCard event={event} onOpen={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
  });

  it('renders a navigating link instead of a button when href is supplied', () => {
    render(<EventCard event={event} href="/events/event-1" />);
    expect(screen.getByRole('link', { name: /view details/i })).toHaveAttribute('href', '/events/event-1');
  });

  it('renders the date block and status pill when supplied', () => {
    render(
      <EventCard
        event={{ ...event, dateBlock: { day: '16', month: 'Aug' }, status: { label: 'Registering', tone: 'success' }, organizers: ['HKCP'] }}
        href="/events/event-1"
      />,
    );
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Aug')).toBeInTheDocument();
    expect(screen.getByText('Registering')).toBeInTheDocument();
    expect(screen.getByText(/By HKCP/)).toBeInTheDocument();
  });
});
