'use client';

import { useState } from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import { extractVenue, type Venue } from '@/lib/mapbox';

type Props = {
  token: string;
  onSelect: (venue: Venue) => void;
};

export default function VenueSearchBox({ token, onSelect }: Props) {
  const [value, setValue] = useState('');

  return (
    <SearchBox
      accessToken={token}
      value={value}
      onChange={setValue}
      onRetrieve={(res) => {
        const venue = extractVenue(res);
        if (!venue) return;
        onSelect(venue);
        setValue(venue.venue_name);
      }}
      placeholder="Search for a venue, hotel, or address…"
      options={{
        // String form 'lng,lat' — the {lng, lat} object form went through the
        // web-component prop bridge in a way that didn't take effect (fallback
        // to IP geolocation surfaced Vietnam results from a CDN edge node).
        // String form is what the underlying Search Box REST API uses verbatim.
        proximity: '114.1694,22.3193',          // Victoria Harbour
        // No `language` filter — was excluding POIs whose primary indexed name
        // is in their local language (HKCEC, Taipei 101, etc.).
        // No `country` filter — global fallback retained per design doc.
        types: 'poi,address,place',
        limit: 10,
      }}
    />
  );
}
