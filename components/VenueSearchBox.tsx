'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { searchVenues } from '@/lib/nominatim';
import type { Venue } from '@/lib/venue';

// Hong Kong viewbox in Nominatim's documented order — min_lon, max_lat,
// max_lon, min_lat — i.e. two diagonally opposite corners (NW then SE).
// `bounded=0` in lib/nominatim.ts keeps this as a *bias*, not a hard filter.
const HK_VIEWBOX: [number, number, number, number] = [113.8, 22.6, 114.5, 22.1];

// Nominatim often returns the same place twice (RV-FINAL F52: two "Hong Kong Island" rows); one row per name+address.
function uniqueVenues(venues: Venue[]): Venue[] {
  const seen = new Set<string>();
  return venues.filter((v) => {
    const key = `${v.venue_name}\u0000${v.venue_address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Props = {
  onSelect: (venue: Venue) => void;
};

export default function VenueSearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  // Rows only mean something for the text they were fetched for: a row from an older query must never be shown
  // or clickable while a newer search runs (RV-FINAL F50: the list was rewritten under the pointer and one click
  // picked a place in Xizang, which silently set the event timezone).
  // `failed` = the request itself failed (rate limit, network), which is not the same answer as "no matches".
  const [found, setFound] = useState<{ forQuery: string; venues: Venue[]; failed?: boolean }>({ forQuery: '', venues: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The text of the venue just picked. It is the venue's name, not a search, so it must not start one.
  const [picked, setPicked] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  // A late answer opens the list only while the box still has focus.
  const focusedRef = useRef(false);
  const listId = useId();

  // Debounced search — Nominatim public instance asks for ≤1 req/sec.
  // setState lives inside the async setTimeout callback (allowed by
  // react-hooks/set-state-in-effect); the synchronous body only sets up
  // abort + cleanup. The "too short to search" case is handled by deriving
  // the display values during render below.
  useEffect(() => {
    const q = query.trim();
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    const timer = setTimeout(async () => {
      if (q.length < 3 || q === picked) return;
      try {
        const venues = await searchVenues(q, { signal: ctrl.signal, viewbox: HK_VIEWBOX });
        // A late answer for a query that is no longer current is dropped (the effect cleanup aborts it).
        if (!ctrl.signal.aborted) {
          setFound({ forQuery: q, venues: uniqueVenues(venues) });
          setActive(-1);
          if (focusedRef.current) setOpen(true);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError' && !ctrl.signal.aborted) {
          setFound({ forQuery: q, venues: [], failed: true });
          if (focusedRef.current) setOpen(true);
        }
      }
    }, 350);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, picked]);

  const q = query.trim();
  const tooShort = q.length < 3;
  // Searching = the rows on hand belong to some other text. Until the matching rows arrive, only "Searching…" shows.
  const current = found.forQuery === q;
  const searching = !tooShort && !current && q !== picked;
  const displayResults = tooShort || !current ? [] : found.venues;

  function pick(v: Venue) {
    onSelect(v);
    setQuery(v.venue_name);
    setPicked(v.venue_name.trim());
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (displayResults.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const n = displayResults.length;
      // Nothing highlighted yet: ArrowDown starts at the first row, ArrowUp at the last.
      setActive((a) => (a < 0 && step < 0 ? n - 1 : (a + step + n) % n));
    } else if (e.key === 'Enter' && open && active >= 0 && displayResults[active]) {
      e.preventDefault(); // do not submit the surrounding form
      pick(displayResults[active]!);
    }
  }

  return (
    <div className="relative">
      <Input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPicked(''); setActive(-1); setOpen(true); }}
        onKeyDown={onKeyDown}
        onFocus={() => { focusedRef.current = true; if (displayResults.length > 0 || searching) setOpen(true); }}
        onBlur={() => {
          // The request is left to finish and its rows are kept (aborting it left the box on "Searching…" for
          // that text for good). focusedRef keeps a late answer from reopening the list after the user moved on.
          focusedRef.current = false;
          setTimeout(() => setOpen(false), 150);  // delay so click on result registers
        }}
        placeholder="Search a venue, building, or address…"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      />

      {open && !tooShort && (displayResults.length > 0 || searching) && (
        <ul
          id={listId}
          className="absolute z-20 left-0 right-0 mt-xs max-h-72 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg"
          role="listbox"
        >
          {searching && (
            <li role="presentation" className="px-md py-sm font-body-md text-body-md text-on-surface-variant">Searching…</li>
          )}
          {displayResults.map((v, i) => (
            <li key={i} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}  // prevent input blur
                onClick={() => pick(v)}
                className={`w-full text-left px-md py-sm hover:bg-surface-container-low transition-colors ${i === active ? 'bg-surface-container-low' : ''}`}
              >
                <div className="font-body-md text-body-md font-semibold text-on-surface">{v.venue_name}</div>
                <div className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant mt-[2px] truncate">
                  {v.venue_address || `${v.city}${v.region ? `, ${v.region}` : ''}, ${v.country}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!tooShort && !searching && current && displayResults.length === 0 && open && (
        <div className="absolute z-20 left-0 right-0 mt-xs rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg px-md py-sm font-body-md text-body-md text-on-surface-variant">
          {found.failed
            ? 'Venue search is not responding. Try again in a moment.'
            : <>No matches. Try a more specific name or the venue&apos;s address.</>}
        </div>
      )}
    </div>
  );
}
