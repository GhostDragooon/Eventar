// Venue domain type — shared across the venue search component, the
// new-event form's Server Action payload, and the edit/public page reads.
// Lives here (not in any specific geocoder file) because the type outlives
// any one provider; we've already switched provider once (Mapbox → Nominatim).
export type Venue = {
  venue_name: string;
  venue_address: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
};
