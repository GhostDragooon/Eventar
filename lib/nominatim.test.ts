import { describe, it, expect } from 'vitest';
import { extractVenueFromNominatim } from './nominatim';

// Sample Nominatim response shape (verified against actual API output for HKCEC):
// {
//   lat: '22.2826248',  lon: '114.1730688',
//   name: 'Hong Kong Convention and Exhibition Centre',
//   display_name: 'Hong Kong Convention and Exhibition Centre, Harbour Road, Wan Chai, ...',
//   address: { road, suburb, city, region, country, country_code, ... }
// }
function sample(overrides: any = {}): any {
  return {
    place_id: 1,
    lat: '22.2826248',
    lon: '114.1730688',
    name: 'Hong Kong Convention and Exhibition Centre',
    display_name: 'Hong Kong Convention and Exhibition Centre, Harbour Road, Wan Chai, Wan Chai District, Hong Kong Island, Hong Kong, China',
    address: {
      road: 'Harbour Road',
      suburb: 'Wan Chai',
      city: 'Hong Kong',
      region: 'Hong Kong',
      country: 'China',
      country_code: 'cn',
    },
    ...overrides,
  };
}

describe('extractVenueFromNominatim', () => {
  it('extracts a complete HK venue with all fields', () => {
    const v = extractVenueFromNominatim(sample());
    expect(v).toEqual({
      venue_name: 'Hong Kong Convention and Exhibition Centre',
      venue_address: 'Harbour Road, Wan Chai, Wan Chai District, Hong Kong Island, Hong Kong, China',
      city: 'Hong Kong',
      region: 'Hong Kong',
      country: 'China',
      latitude: 22.2826248,
      longitude: 114.1730688,
    });
  });

  it('returns null when lat or lon is missing/unparseable', () => {
    expect(extractVenueFromNominatim(sample({ lat: undefined }))).toBeNull();
    expect(extractVenueFromNominatim(sample({ lon: 'not-a-number' }))).toBeNull();
  });

  it('returns null when name is missing AND display_name is missing', () => {
    expect(extractVenueFromNominatim(sample({ name: '', display_name: '' }))).toBeNull();
  });

  it('falls back to first segment of display_name when name is empty', () => {
    const v = extractVenueFromNominatim(sample({
      name: '',
      display_name: 'Some Building, Some Street, Some City',
    }));
    expect(v?.venue_name).toBe('Some Building');
  });

  it('falls back to town then village then county for city when city is missing', () => {
    expect(extractVenueFromNominatim(sample({
      address: { ...sample().address, city: undefined, town: 'Tai Po' },
    }))?.city).toBe('Tai Po');

    expect(extractVenueFromNominatim(sample({
      address: { ...sample().address, city: undefined, town: undefined, village: 'Sai Kung' },
    }))?.city).toBe('Sai Kung');

    expect(extractVenueFromNominatim(sample({
      address: { ...sample().address, city: undefined, town: undefined, village: undefined, county: 'New Territories' },
    }))?.city).toBe('New Territories');
  });

  it('falls back to state for region when region is missing', () => {
    const v = extractVenueFromNominatim(sample({
      address: { ...sample().address, region: undefined, state: 'New South Wales' },
    }));
    expect(v?.region).toBe('New South Wales');
  });

  it('returns empty strings (not undefined) for missing optional admin units', () => {
    const v = extractVenueFromNominatim(sample({
      address: { country: 'China' },  // only country
    }));
    expect(v?.city).toBe('');
    expect(v?.region).toBe('');
    expect(v?.country).toBe('China');
  });

  it('venue_address strips the leading name segment to avoid duplication', () => {
    // display_name starts with the same name; address should drop that first segment.
    const v = extractVenueFromNominatim(sample());
    expect(v?.venue_address).not.toContain('Hong Kong Convention and Exhibition Centre,');
    expect(v?.venue_address.startsWith('Harbour Road')).toBe(true);
  });

  it('parses lat/lon as numbers from string fields', () => {
    const v = extractVenueFromNominatim(sample({ lat: '1.5', lon: '-100.25' }));
    expect(v?.latitude).toBe(1.5);
    expect(v?.longitude).toBe(-100.25);
  });
});
