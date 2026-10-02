import { afterEach, describe, expect, it, vi } from 'vitest';

type ClientOptions = { global: { fetch: typeof fetch } };

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn<(url: string, key: string, options: ClientOptions) => object>(() => ({})),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

import { supabaseAnonServer } from './server';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('supabaseAnonServer', () => {
  // The first Accept on a fresh invite session failed 4 of 4 times (Band 1
  // review, F1): its three parallel self-reads were refused by PostgREST as
  // "JWT issued at future". The retry lives in the client's fetch, so every
  // read and write through the session client gets it; this guards the wiring.
  it('builds the session client with the stale-clock retry', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 401,
          headers: { 'www-authenticate': 'Bearer error="invalid_token", error_description="JWT issued at future"' },
        }),
      )
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await supabaseAnonServer();
    const options = createServerClient.mock.lastCall![2];
    const res = await options.global.fetch('https://api.test/rest/v1/registrations');

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
