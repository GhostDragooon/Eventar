'use client';

import VenueSearchBox from '@/components/VenueSearchBox';
import type { Venue } from '@/lib/venue';

type Props = {
  value: Venue | null;
  onChange: (venue: Venue | null) => void;
};

export default function VenueSection({ value, onChange }: Props) {
  return (
    <div className="space-y-md">
      <VenueSearchBox onSelect={onChange} />
      {value && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-md">
          <p className="font-body-md text-body-md font-semibold text-on-surface flex items-center gap-xs">
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] text-primary" aria-hidden>location_on</span>
            {value.venue_name}
          </p>
          {value.venue_address && (
            <p className="font-body-md text-body-md text-on-surface-variant ml-[26px]">{value.venue_address}</p>
          )}
          <p className="font-body-md text-body-md text-on-surface-variant ml-[26px]">
            {value.city}
            {value.region ? `, ${value.region}` : ''}, {value.country}
          </p>
          <button
            type="button"
            className="mt-sm font-label-md text-label-md text-primary hover:underline"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export function venueSummary(v: Venue | null): string {
  return v ? `📍 ${v.venue_name} — ${v.city}, ${v.country}` : 'No venue selected';
}

export function venueValid(v: Venue | null): boolean {
  return v !== null;
}
