import type { Venue } from './venue';

// Why this provider and not Mapbox / Google: see
// docs/plans/2026-05-18-geocoder-decision.md (migration triggers + fallback
// plan to LocationIQ / Google Places when traffic grows).
//
// Structural shape of a single Nominatim search result, scoped to the fields
// we read. The upstream OpenStreetMap Nominatim API is documented at
// https://nominatim.org/release-docs/develop/api/Search/ — we only consume
// the JSON `format=json` shape with `addressdetails=1`.
export type NominatimResult = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    region?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
};

/**
 * Adapter from a Nominatim search result → our Venue shape.
 * Returns null when the result lacks coordinates or a usable name; callers
 * should skip those (rare in practice, but the API can return abbreviated
 * entries with only display_name and no structured address).
 */
export function extractVenueFromNominatim(r: NominatimResult): Venue | null {
  if (!r) return null;
  const latitude  = r.lat ? Number(r.lat)  : NaN;
  const longitude = r.lon ? Number(r.lon) : NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  // Prefer `name`; fall back to the first comma-separated segment of
  // display_name when name is empty (some highway/area entries lack name).
  const segments = (r.display_name ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const venue_name = (r.name && r.name.trim()) || segments[0] || '';
  if (!venue_name) return null;

  // venue_address is the display_name minus the leading segment (which is
  // already in venue_name). Avoids "HKCEC, HKCEC, Harbour Road…" duplication.
  const tailSegments = segments[0] === venue_name ? segments.slice(1) : segments;
  const venue_address = tailSegments.join(', ');

  const a = r.address ?? {};
  return {
    venue_name,
    venue_address,
    // city has multiple OSM admin levels; walk the typical hierarchy.
    city:    a.city ?? a.town ?? a.village ?? a.county ?? '',
    region:  a.region ?? a.state ?? '',
    country: a.country ?? '',
    latitude,
    longitude,
  };
}

/**
 * Search Nominatim. Honours the public-instance usage policy (User-Agent
 * required, ≤1 req/sec — the caller is responsible for debouncing).
 *
 * `viewbox` optionally constrains results to a bounding box; we use
 * `bounded=0` so it's a *bias* rather than a hard filter (global fallback
 * preserved per the Phase 1.5b design doc).
 */
export async function searchVenues(
  query: string,
  opts: { signal?: AbortSignal; viewbox?: [number, number, number, number] } = {},
): Promise<Venue[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'en');
  url.searchParams.set('limit', '8');
  if (opts.viewbox) {
    url.searchParams.set('viewbox', opts.viewbox.join(','));
    url.searchParams.set('bounded', '0');
  }

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Eventar/0.1 (https://github.com/GhostDragooon/Eventar)' },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);

  const raw = (await res.json()) as NominatimResult[];
  return raw.map(extractVenueFromNominatim).filter((v): v is Venue => v !== null);
}
