import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
}));
vi.mock('next/navigation', () => ({ redirect }));

import ManageRedirect from './page';

// CX-04R folded Manage into the Events home. The old URL stays alive for bookmarks and `next` values.
async function goes(query: Record<string, string | string[] | undefined>) {
  redirect.mockClear();
  await expect(ManageRedirect({ searchParams: Promise.resolve(query) })).rejects.toThrow('NEXT_REDIRECT');
  return redirect.mock.calls[0][0];
}

describe('/dashboard/manage', () => {
  it('redirects to /dashboard', async () => {
    expect(await goes({})).toBe('/dashboard');
  });

  it('carries the query string across, repeated keys included', async () => {
    expect(await goes({ tab: 'drafts', x: ['1', '2'], skipped: undefined })).toBe('/dashboard?tab=drafts&x=1&x=2');
  });
});
