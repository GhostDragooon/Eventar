/** @vitest-environment jsdom */
import { vi } from 'vitest';

// The public Nominatim answers 3 to 5 s after typing (RV-FINAL F50). The fake search resolves when the test says so,
// and ignores the abort signal, so a late answer for an old query really does arrive (the worst case).
const { searchVenues } = vi.hoisted(() => ({ searchVenues: vi.fn() }));
vi.mock('@/lib/nominatim', () => ({ searchVenues }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VenueSearchBox from './VenueSearchBox';
import type { Venue } from '@/lib/venue';

afterEach(cleanup);

const venue = (name: string, address = `${name} Road`): Venue => ({
  venue_name: name, venue_address: address, city: 'X', region: '', country: 'Y', latitude: 22.3, longitude: 114.17,
});

type Deferred = { query: string; resolve: (v: Venue[]) => void };
let pending: Deferred[] = [];

beforeEach(() => {
  pending = [];
  searchVenues.mockReset().mockImplementation(
    (query: string) => new Promise<Venue[]>((resolve) => pending.push({ query, resolve })),
  );
});

function type(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/search a venue/i), { target: { value } });
}
async function searchCalled(n: number) {
  await waitFor(() => expect(searchVenues).toHaveBeenCalledTimes(n), { timeout: 2000 });
}
async function answer(index: number, venues: Venue[]) {
  await act(async () => {
    pending[index]!.resolve(venues);
  });
}

describe('VenueSearchBox', () => {
  it('shows only "Searching…" while a new query loads: the previous rows are gone, not clickable', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Hong Kong');
    await searchCalled(1);
    await answer(0, [venue('Hong Kong Island')]);
    expect(await screen.findByRole('option', { name: /Hong Kong Island/ })).toBeInTheDocument();

    type('Hong Kong Convention');
    // Immediately, before the debounce even fires: the old row must already be unclickable.
    expect(screen.queryByRole('option', { name: /Hong Kong Island/ })).toBeNull();
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    await searchCalled(2); // request in flight
    expect(screen.queryByRole('option', { name: /Hong Kong Island/ })).toBeNull();
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    await answer(1, [venue('Hong Kong Convention and Exhibition Centre')]);
    expect(await screen.findByRole('option', { name: /Convention and Exhibition/ })).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).toBeNull();
  });

  it('drops a late answer for a query that is no longer current', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Hong Kong');
    await searchCalled(1);
    type('Hong Kong Convention');
    await searchCalled(2);

    await answer(0, [venue('Konghong Xian, Xizang')]); // the OLD query answers late
    expect(screen.queryByRole('option', { name: /Xizang/ })).toBeNull();
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    await answer(1, [venue('Hong Kong Convention and Exhibition Centre')]);
    expect(await screen.findByRole('option', { name: /Convention and Exhibition/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Xizang/ })).toBeNull();
  });

  // The overwrite order: the newer query answers first, the older one answers after it and must not replace it.
  it('a late answer for an old query does not replace the rows of the current query', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Hong Kong');
    await searchCalled(1);
    type('Hong Kong Convention');
    await searchCalled(2);

    await answer(1, [venue('Hong Kong Convention and Exhibition Centre')]);
    expect(await screen.findByRole('option', { name: /Convention and Exhibition/ })).toBeInTheDocument();
    await answer(0, [venue('Konghong Xian, Xizang')]);
    expect(screen.getByRole('option', { name: /Convention and Exhibition/ })).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).toBeNull();
  });

  it('lists rows with the same name and address once', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Hong Kong');
    await searchCalled(1);
    await answer(0, [venue('Hong Kong Island'), venue('Hong Kong Island'), venue('Hong Kong Island', 'Other Road')]);
    await screen.findAllByRole('option');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('is a combobox: ArrowDown then Enter picks the highlighted row, Enter alone picks nothing', async () => {
    const onSelect = vi.fn();
    render(<VenueSearchBox onSelect={onSelect} />);
    type('Hong Kong');
    await searchCalled(1);
    const first = venue('Hong Kong Island');
    await answer(0, [first, venue('Hong Kong Park')]);
    await screen.findAllByRole('option');

    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]!.id);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(first);
    expect(box).toHaveValue('Hong Kong Island');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('ArrowUp with nothing highlighted goes to the last row', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Hong Kong');
    await searchCalled(1);
    await answer(0, [venue('A Place'), venue('B Place'), venue('C Place')]);
    await screen.findAllByRole('option');

    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[2]!.id);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id);
  });

  it('does not search again, and the list stays shut, after a pick', async () => {
    const onSelect = vi.fn();
    render(<VenueSearchBox onSelect={onSelect} />);
    type('Hong Kong');
    await searchCalled(1);
    await answer(0, [venue('Hong Kong Island')]);
    await screen.findAllByRole('option');

    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Past the 350 ms debounce: the picked name must not trigger a second request.
    await new Promise((r) => setTimeout(r, 600));
    expect(searchVenues).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByText('Searching…')).toBeNull();

    // Typing again searches again.
    type('Hong Kong Island Park');
    await searchCalled(2);
  });

  it('blur does not strand the box on "Searching…": the answer is kept and shows on refocus, but does not reopen the list while blurred', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    const box = screen.getByRole('combobox');
    fireEvent.focus(box);
    type('Hong Kong');
    await searchCalled(1);
    fireEvent.blur(box);
    await new Promise((r) => setTimeout(r, 250)); // past the 150 ms close delay

    await answer(0, [venue('Hong Kong Island')]);
    expect(screen.queryByRole('option')).toBeNull(); // blurred: stays shut

    fireEvent.focus(box);
    expect(await screen.findByRole('option', { name: /Hong Kong Island/ })).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).toBeNull();
  });

  it('a failed search says so, and does not read as "No matches"', async () => {
    searchVenues.mockReset().mockRejectedValue(new Error('Nominatim error 429'));
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Hong Kong');
    expect(await screen.findByText('Venue search is not responding. Try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText(/No matches/)).toBeNull();
  });

  it('a search that finds nothing still says "No matches"', async () => {
    render(<VenueSearchBox onSelect={vi.fn()} />);
    type('Zzzzzz');
    await searchCalled(1);
    await answer(0, []);
    expect(await screen.findByText(/No matches/)).toBeInTheDocument();
    expect(screen.queryByText(/not responding/)).toBeNull();
  });
});
