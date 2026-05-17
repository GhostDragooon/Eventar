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
      options={{ types: 'poi,address,place', limit: 10 }}
    />
  );
}
