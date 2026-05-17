'use client';

import dynamic from 'next/dynamic';
import type { Venue } from '@/lib/mapbox';

const VenueSearchBox = dynamic(() => import('@/components/VenueSearchBox'), { ssr: false });

type Props = {
  value: Venue | null;
  onChange: (venue: Venue | null) => void;
};

export default function VenueSection({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <VenueSearchBox
        token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
        onSelect={onChange}
      />
      {value && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="font-medium">📍 {value.venue_name}</p>
          {value.venue_address && (
            <p className="text-gray-600">{value.venue_address}</p>
          )}
          <p className="text-gray-600">
            {value.city}
            {value.region ? `, ${value.region}` : ''}, {value.country}
          </p>
          <button
            type="button"
            className="mt-2 text-xs text-blue-700 hover:underline"
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
