import { describe, it, expect } from 'vitest';
import { extractVenue } from './mapbox';

// Minimal SearchBoxRetrieveResponse fixture matching @mapbox/search-js-core@1.5.1:
//   { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties }] }
// where properties is a SearchBoxFeatureProperties with `context` as an object
// keyed by admin-unit category ({ country, region, place, locality, ... }).
function makeRes(opts: {
  name?: string;
  full_address?: string;
  context?: Record<string, { name: string } & Record<string, unknown>>;
  coordinates?: { latitude: number; longitude: number };
  geometry?: [number, number];
  features?: 'empty' | 'missing';
} = {}): any {
  if (opts.features === 'empty') return { type: 'FeatureCollection', features: [] };
  if (opts.features === 'missing') return { type: 'FeatureCollection' };

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: opts.geometry ?? [-122.2007, 37.4123] },
      properties: {
        name: opts.name ?? 'Rosewood Sand Hill',
        full_address: opts.full_address ?? '2825 Sand Hill Rd, Menlo Park, California 94025, United States',
        coordinates: opts.coordinates ?? { latitude: 37.4123, longitude: -122.2007 },
        context: opts.context ?? {
          country: { name: 'United States', country_code: 'US', country_code_alpha_3: 'USA' },
          region:  { name: 'California', region_code: 'CA', region_code_full: 'US-CA' },
          place:   { name: 'Menlo Park' },
        },
      },
    }],
  };
}

describe('extractVenue', () => {
  it('returns null when features array is empty', () => {
    expect(extractVenue(makeRes({ features: 'empty' }))).toBeNull();
  });

  it('returns null when features field is missing', () => {
    expect(extractVenue(makeRes({ features: 'missing' }))).toBeNull();
  });

  it('returns null when geometry coordinates are missing and properties.coordinates is missing', () => {
    const res = makeRes();
    delete res.features[0].geometry;
    delete res.features[0].properties.coordinates;
    expect(extractVenue(res)).toBeNull();
  });

  it('extracts a complete venue from a typical POI response', () => {
    const v = extractVenue(makeRes());
    expect(v).toEqual({
      venue_name: 'Rosewood Sand Hill',
      venue_address: '2825 Sand Hill Rd, Menlo Park, California 94025, United States',
      city: 'Menlo Park',
      region: 'California',
      country: 'United States',
      latitude: 37.4123,
      longitude: -122.2007,
    });
  });

  it('falls back to locality.name when context.place is missing (some non-US results)', () => {
    const v = extractVenue(makeRes({
      context: {
        country:  { name: 'Japan' },
        region:   { name: 'Tokyo' },
        locality: { name: 'Shibuya' },
      },
    }));
    expect(v?.city).toBe('Shibuya');
    expect(v?.country).toBe('Japan');
    expect(v?.region).toBe('Tokyo');
  });

  it('returns empty strings (not undefined) for missing optional admin units', () => {
    const v = extractVenue(makeRes({
      context: { country: { name: 'Antarctica' } },
    }));
    expect(v?.city).toBe('');
    expect(v?.region).toBe('');
    expect(v?.country).toBe('Antarctica');
    expect(v?.venue_address).toBe('2825 Sand Hill Rd, Menlo Park, California 94025, United States');
  });

  it('prefers properties.coordinates over geometry.coordinates when both exist', () => {
    // properties.coordinates is the self-documenting form; geometry.coordinates is [lng, lat]
    // and easy to misread. If both exist we trust properties.coordinates.
    const v = extractVenue(makeRes({
      coordinates: { latitude: 1.234, longitude: 5.678 },
      geometry: [99, 99],
    }));
    expect(v?.latitude).toBe(1.234);
    expect(v?.longitude).toBe(5.678);
  });

  it('falls back to geometry.coordinates [lng, lat] when properties.coordinates is missing', () => {
    const res = makeRes({ geometry: [10.5, 20.5] });
    delete res.features[0].properties.coordinates;
    const v = extractVenue(res);
    expect(v?.longitude).toBe(10.5);
    expect(v?.latitude).toBe(20.5);
  });
});
