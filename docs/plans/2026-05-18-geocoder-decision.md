# Geocoder choice — decision + fallback plan

**Date:** 2026-05-18
**Status:** Decided. Shipped in [67f4e0c](https://github.com/GhostDragooon/Eventar/commit/67f4e0c).
**Implements:** [components/VenueSearchBox.tsx](../../components/VenueSearchBox.tsx), [lib/nominatim.ts](../../lib/nominatim.ts)

---

## Decision

**Use OpenStreetMap Nominatim** (public instance) for venue search in the new-event form.

**Plan to migrate to Google Places API once traffic picks up.** Triggers below.

## Why Nominatim now

Direct curl tests against five providers proved Mapbox has near-zero coverage of HK / Asian landmarks (HKCEC search → Vietnam result, 1,679km away). The full evidence chain is in commit [67f4e0c](https://github.com/GhostDragooon/Eventar/commit/67f4e0c)'s message. Nominatim, by contrast, returned the actual HKCEC at the correct lat/lon on the first query.

For Eventar's current scale (staff-only, ~500 venue searches/month estimated), Nominatim's public-instance 1 req/sec limit is wildly oversized. No account, no API key, no billing — zero setup friction.

## Migration triggers — when to swap to Google Places

Move to **Google Places API** when *any* of these become true:

1. **Volume exceeds Nominatim's public-instance budget** — > 50,000 searches/month sustained. Public Nominatim's published policy is "moderate use"; at scale we should be a paying customer somewhere, not free-riding on the OSM Foundation.
2. **Fuzzy matching becomes critical** — staff report repeated "I typed X and got nothing" incidents where X is a typo of a real venue. Nominatim is exact-match; Google handles typos / abbreviations well. Three reports in a week = signal to migrate.
3. **POI coverage gap surfaces** — a real customer-facing venue (event with confirmed attendees) can't be found in Nominatim AND can be found in Google. One blocker incident is enough to migrate.
4. **Need commercial SLA** — when the business depends on venue search uptime (registration page outages cost real money), the OSM Foundation's "best effort" SLA isn't enough. Likely tied to going public-launch.

## Alternatives considered

Evaluated against three criteria: HK POI quality (the hard constraint), free tier sufficiency for our scale, setup friction.

| Provider | Data source | HK POI quality | Free tier | Setup | Decision |
|---|---|---|---|---|---|
| **OpenStreetMap Nominatim** | OSM | ✅ verified — HKCEC, Taipei 101, AsiaWorld-Expo, Tokyo Big Sight | unlimited; 1 req/sec | none | **Chosen** |
| **Google Places API** | Google proprietary | ✅ likely best (industry consensus) | $200/mo credit ≈ 12k autocompletes | Cloud project + billing + API key | **Migration target** (see triggers above) |
| Mapbox Search Box | Mapbox proprietary | ❌ verified bad — HKCEC returned Vietnam | 100k/mo | API key | Rejected after direct evidence |
| HERE Geocoding & Search | HERE proprietary | ✅ likely good (not directly tested) | 250k/mo | API key | Viable, but no compelling advantage over Google as upgrade |
| LocationIQ | OSM (same as Nominatim) | ✅ same as Nominatim | 5k/day (≈150k/mo) | API key | **Cheap interim step** — if we exceed Nominatim's quota but Google migration isn't ready, drop in here (same data, same response shape, just a different host) |
| Geoapify / OpenCage / Maps.co | OSM | same as Nominatim | varies | API key | No incremental value over Nominatim |
| Radar | Proprietary, US-focused | unverified | 100k/mo | API key | US bias; not a fit for HK |
| Geocodio | US/Canada focus | not covered | 2.5k/day | API key | Wrong region |
| Foursquare Places | Proprietary | strong but US-leaning | 100k/mo | API key | Less HK / Asia depth than Google |

## What's NOT a viable upgrade target

These get suggested often but don't solve our actual problem:

- **IP geolocation APIs** (Telize, IPWHOIS, geoPlugin, Google Geolocation API for cell-tower lookup, etc.) — these answer "what country is this IP in?", not "find a place by name." A different problem entirely; would only matter if we wanted to auto-set the proximity bias for non-HK staff.
- **Mapbox** — proven inadequate. Don't revisit unless they materially expand Asian POI coverage.

## Operational notes

- **User-Agent header** is required by the Nominatim Usage Policy and set in [lib/nominatim.ts:65](../../lib/nominatim.ts) to `Eventar/0.1 (https://github.com/GhostDragooon/Eventar)`.
- **Debouncing** is enforced client-side in [components/VenueSearchBox.tsx](../../components/VenueSearchBox.tsx) at 350ms after the last keystroke — more than enough to respect the 1 req/sec policy.
- **Viewbox** parameter biases results toward Hong Kong (`113.8,22.6,114.5,22.1`) without restricting them (`bounded=0`) — global searches still work.
- **`accept-language=en`** is set so place names come back in English.

## How to migrate to Google Places (when triggered)

Rough scope estimate: 1–2 hours.

1. Create Google Cloud project + enable Places API (New) + set up billing + create API key. Restrict the key to the production domain + localhost.
2. Add `GOOGLE_PLACES_API_KEY` to `.env.local` (gitignored) and to the Vercel project's env config.
3. Create `lib/google-places.ts` with the same shape as [lib/nominatim.ts](../../lib/nominatim.ts):
   - `extractVenueFromGooglePlace(place): Venue | null`
   - `searchVenues(query, opts): Promise<Venue[]>` (Autocomplete + Place Details, or the new "Text Search" endpoint)
4. TDD: copy `lib/nominatim.test.ts` → `lib/google-places.test.ts`, fixture a Google Place response shape, port the tests.
5. In [components/VenueSearchBox.tsx](../../components/VenueSearchBox.tsx), swap the `searchVenues` import. (The `Venue` type is provider-neutral and lives in [lib/venue.ts](../../lib/venue.ts), so the component itself doesn't change.)
6. Delete `lib/nominatim.*` and the User-Agent header (Google uses API key in URL).
7. Add billing alert at $50/mo as a guard rail.

The `Venue` type's deliberate provider-neutrality (it was moved out of `lib/mapbox.ts` to `lib/venue.ts` for exactly this reason) makes the swap a single-file change for the consumer code.

## How to drop in LocationIQ instead (interim step)

If we hit Nominatim's quota but Google migration isn't ready: LocationIQ uses the same OSM data and a nearly identical response shape. Estimated 30 min:

1. Sign up at locationiq.com → get API key.
2. Add `LOCATIONIQ_KEY` to `.env.local`.
3. In [lib/nominatim.ts](../../lib/nominatim.ts), change the URL from `nominatim.openstreetmap.org/search` to `eu1.locationiq.com/v1/search.php` and append `&key=${process.env.LOCATIONIQ_KEY}`.
4. Drop the User-Agent requirement (not required by LocationIQ).
5. All extraction logic + tests carry over unchanged.

## References

- [getambee.com: Best Free Geocoding APIs](https://www.getambee.com/blogs/best-free-geocoding-apis) — broadest survey
- [continuuiti.com: Best Geocoding API](https://continuuiti.com/blog/best-geocoding-api/) — free-tier comparison
- [radar.com: Best Geocoding API](https://radar.com/blog/best-geocoding-api) — commercial-comparison angle
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Google Places API pricing](https://mapsplatform.google.com/pricing/)

## Cross-reference

Mirror in the Obsidian vault: `02 — Decisions Log.md` (add an entry when convenient).
