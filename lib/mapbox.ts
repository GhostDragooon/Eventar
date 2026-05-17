// Structural shape of the Mapbox Search Box `/retrieve` response, scoped to
// the fields we actually consume. The upstream type lives in
// `@mapbox/search-js-core` which is a transitive dep (not in our package.json),
// so a structural local type avoids forcing it into our dependency graph just
// to spell out the seven fields we read.
type RetrieveResponse = {
  features?: Array<{
    geometry?: { coordinates?: number[] };
    properties?: {
      name?: string;
      full_address?: string;
      coordinates?: { latitude?: number; longitude?: number };
      context?: {
        country?:  { name?: string };
        region?:   { name?: string };
        place?:    { name?: string };
        locality?: { name?: string };
      };
    };
  }>;
};

export type Venue = {
  venue_name: string;
  venue_address: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
};

/**
 * Adapter from Mapbox Search Box `/retrieve` response → our Venue shape.
 * Pure function so the React wrapper stays trivially small and the
 * admin-hierarchy edge cases (locality-fallback, missing coordinates,
 * empty features) are tested without a DOM.
 *
 * Returns null when the response carries no usable feature; callers
 * should not invoke `onSelect` in that case (form's hidden venue fields
 * stay empty and the Zod layer rejects the submission).
 */
export function extractVenue(res: RetrieveResponse): Venue | null {
  const feature = res?.features?.[0];
  if (!feature) return null;

  const props = feature.properties ?? {};

  // Coordinates: prefer the self-documenting properties.coordinates form
  // (latitude/longitude named keys); fall back to GeoJSON geometry.coordinates
  // which is [lng, lat] (a common source of bugs when read wrong).
  let latitude: number | undefined = props.coordinates?.latitude;
  let longitude: number | undefined = props.coordinates?.longitude;
  if (latitude === undefined || longitude === undefined) {
    const g = feature.geometry?.coordinates;
    if (Array.isArray(g) && g.length >= 2) {
      longitude = g[0];
      latitude = g[1];
    }
  }
  if (latitude === undefined || longitude === undefined) return null;

  const ctx = props.context ?? {};

  return {
    venue_name:    props.name ?? '',
    venue_address: props.full_address ?? '',
    // Mapbox uses `place` for cities like Tokyo, `locality` for sub-place
    // entities in some countries. Accept either; Zod enforces non-empty.
    city:    ctx.place?.name   ?? ctx.locality?.name ?? '',
    region:  ctx.region?.name  ?? '',
    country: ctx.country?.name ?? '',
    latitude,
    longitude,
  };
}
