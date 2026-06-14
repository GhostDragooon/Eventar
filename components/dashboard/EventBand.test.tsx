/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EventBand, type TileEvent } from './EventBand';

// Vitest config has no `globals`, so RTL renders accumulate without explicit
// cleanup between tests.
afterEach(cleanup);

const T = '2026-06-18T09:00:00Z'; // Thu 18 Jun (UTC)
const NOW = new Date('2026-06-14T09:00:00Z').getTime();

function makeEvent(over: Partial<TileEvent> = {}): TileEvent {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    title: 'Onboarding Workshop',
    start_time: T,
    timezone: 'UTC',
    max_attendees: 60,
    registered: 32,
    attended: 0,
    registration_close_at: null,
    lifecycle: 'upcoming',
    ...over,
  };
}

describe('EventBand', () => {
  it('renders nothing when there are no events', () => {
    const { container } = render(<EventBand lifecycle="live" events={[]} nowMs={NOW} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders pill, count, and tile for a single upcoming event in the Live band', () => {
    render(
      <EventBand lifecycle="live" events={[makeEvent({ lifecycle: 'upcoming' })]} nowMs={NOW} />,
    );
    expect(screen.getByText(/Live/)).toBeInTheDocument();
    expect(screen.getByText(/1 event\b/)).toBeInTheDocument();
    expect(screen.getByText('Onboarding Workshop')).toBeInTheDocument();
    // Meta line: short date + capacity with "registered" label (added per
    // UX review — bare "32 / 60" was unexplained on first encounter).
    expect(screen.getByText(/Thu 18 Jun · 32 \/ 60 registered/)).toBeInTheDocument();
    // Stat line: derived from start − CHECKIN_OPEN_MINUTES; 4 days here
    expect(screen.getByText(/Check-in opens in 4 days/)).toBeInTheDocument();
    // Title links to /details for upcoming
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/events/11111111-2222-4333-8444-555555555555/details',
    );
  });

  it('uses registration_close_at for registering tiles', () => {
    render(
      <EventBand
        lifecycle="live"
        events={[
          makeEvent({
            lifecycle: 'registering',
            registration_close_at: '2026-06-20T09:00:00Z', // 6 days from NOW
          }),
        ]}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText(/Registration closes in 6 days/)).toBeInTheDocument();
  });

  it('falls back to "Registration open" when registration_close_at is null', () => {
    render(
      <EventBand
        lifecycle="live"
        events={[makeEvent({ lifecycle: 'registering', registration_close_at: null })]}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText(/Registration open/)).toBeInTheDocument();
  });

  it('shows "Live now" for live tiles', () => {
    render(
      <EventBand lifecycle="live" events={[makeEvent({ lifecycle: 'live' })]} nowMs={NOW} />,
    );
    expect(screen.getByText(/Live now/)).toBeInTheDocument();
  });

  it('renders draft tile with edit link and warning stat', () => {
    render(
      <EventBand
        lifecycle="draft"
        events={[
          makeEvent({
            lifecycle: 'drafted',
            title: 'Design system workshop',
            max_attendees: null,
            registered: 0,
          }),
        ]}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText(/Draft · not yet published/)).toBeInTheDocument();
    expect(screen.getByText('Date not set · capacity not set')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/events/11111111-2222-4333-8444-555555555555/edit',
    );
  });

  it('renders completed tile with attended count and analytics route', () => {
    render(
      <EventBand
        lifecycle="completed"
        events={[
          makeEvent({
            lifecycle: 'completed',
            title: 'May Engineering All-hands',
            registered: 48,
            attended: 48,
            max_attendees: 60,
          }),
        ]}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText(/48 \/ 60 attended/)).toBeInTheDocument();
    expect(screen.getByText(/View analytics/)).toBeInTheDocument();
    // The mockup's "View analytics →" stat is signaling that the whole tile
    // navigates to /analytics for completed events — not the default /details.
    expect(screen.getByRole('link', { name: /May Engineering All-hands/ })).toHaveAttribute(
      'href',
      '/events/11111111-2222-4333-8444-555555555555/analytics',
    );
  });

  it('renders every event without a truncation cap (UX review HIGH — dead-end "Showing N of M" line removed)', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ id: `id-${i}`, title: `Event ${i}`, lifecycle: 'upcoming' }),
    );
    render(<EventBand lifecycle="live" events={events} nowMs={NOW} />);
    expect(screen.getAllByRole('link')).toHaveLength(8);
    expect(screen.queryByText(/Showing \d+ of \d+ events/)).toBeNull();
  });
});
