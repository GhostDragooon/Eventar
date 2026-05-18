'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { searchVenues } from '@/lib/nominatim';
import type { Venue } from '@/lib/venue';

// Hong Kong viewbox (south, west, north, east) — biases results toward HK
// without restricting them. Format per Nominatim: 'min_lon,max_lat,max_lon,min_lat'.
const HK_VIEWBOX: [number, number, number, number] = [113.8, 22.6, 114.5, 22.1];

type Props = {
  onSelect: (venue: Venue) => void;
};

export default function VenueSearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search — Nominatim public instance asks for ≤1 req/sec.
  // setState lives inside the async setTimeout callback (allowed by
  // react-hooks/set-state-in-effect); the synchronous body only sets up
  // abort + cleanup. The "too short to search" case is handled by deriving
  // displayResults / displayLoading during render below.
  useEffect(() => {
    const q = query.trim();
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    const timer = setTimeout(async () => {
      if (q.length < 3) return;
      setLoading(true);
      try {
        const found = await searchVenues(q, { signal: ctrl.signal, viewbox: HK_VIEWBOX });
        if (!ctrl.signal.aborted) {
          setResults(found);
          setOpen(true);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  const tooShort = query.trim().length < 3;
  const displayResults = tooShort ? [] : results;
  const displayLoading = tooShort ? false : loading;

  function pick(v: Venue) {
    onSelect(v);
    setQuery(v.venue_name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => displayResults.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}  // delay so click on result registers
        placeholder="Search a venue, building, or address…"
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {open && (displayResults.length > 0 || displayLoading) && (
        <ul
          className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-md"
          role="listbox"
        >
          {displayLoading && displayResults.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">Searching…</li>
          )}
          {displayResults.map((v, i) => (
            <li key={i} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}  // prevent input blur
                onClick={() => pick(v)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
              >
                <div className="font-medium text-gray-900">{v.venue_name}</div>
                <div className="text-gray-600 text-xs mt-0.5 truncate">
                  {v.venue_address || `${v.city}${v.region ? `, ${v.region}` : ''}, ${v.country}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!tooShort && !displayLoading && displayResults.length === 0 && open && (
        <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-md px-3 py-2 text-sm text-gray-500">
          No matches. Try a more specific name or the venue&apos;s address.
        </div>
      )}
    </div>
  );
}
