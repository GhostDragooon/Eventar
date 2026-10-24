// Spec 001 FR-005, server half: /account/complete?next=<dest> runs the wizard
// for an incomplete account and hands on to <dest> at the end; a complete
// account is passed straight through to it. <dest> is read here from the
// query, so it is gated here, whatever the sign-up page did before it.
import { vi } from 'vitest';

const { s, redirect } = vi.hoisted(() => ({
  s: {
    user: { id: 'u1', email_confirmed_at: '2026-10-24T00:00:00Z' } as { id: string; email_confirmed_at: string } | null,
    complete: false,
    actionRerender: false,
    accountError: null as string | null,
  },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({ headers: async () => ({ has: () => s.actionRerender }) }));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: s.user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }), order: async () => ({ data: [] }) }) }),
  }),
}));
vi.mock('@/lib/accountCompleteness', () => ({
  isAccountComplete: async () => ({ complete: s.complete, consents: true, identity: true, profile: true }),
}));
vi.mock('../actions', () => ({
  getMyAccountAndProfile: async () =>
    s.accountError
      ? { ok: false, error: s.accountError }
      : { ok: true, data: { account: { id: 'u1' }, profile: null } },
  listMyLicences: async () => ({ ok: true, data: { licences: [] } }),
}));
vi.mock('@/components/shell/SiteShell', () => ({ SiteShell: ({ children }: { children: unknown }) => children }));
vi.mock('./CompleteClient', () => ({ CompleteClient: () => null }));

import { beforeEach, describe, expect, it } from 'vitest';
import CompleteAccountPage from './page';

type El = { props?: { children?: unknown } };

async function run(next?: string) {
  redirect.mockClear();
  try {
    const tree = await CompleteAccountPage({ searchParams: Promise.resolve(next === undefined ? {} : { next }) });
    // SiteShell(div(CompleteClient)) with SiteShell mocked to pass children through.
    const client = (tree as unknown as { props: { children: El } }).props.children.props!.children as {
      props: { next?: string };
    };
    return { redirectedTo: null as string | null, clientNext: client.props.next };
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (!m) throw e;
    return { redirectedTo: m[1], clientNext: undefined };
  }
}

beforeEach(() => {
  s.user = { id: 'u1', email_confirmed_at: '2026-10-24T00:00:00Z' };
  s.complete = false;
  s.actionRerender = false;
  s.accountError = null;
});

describe('/account/complete — an incomplete account running the wizard', () => {
  it('hands the destination to the wizard', async () => {
    expect((await run('/account/claim')).clientNext).toBe('/account/claim');
  });

  it('hands over nothing when there is none (the client then defaults to the record)', async () => {
    expect((await run()).clientNext).toBeUndefined();
  });

  it.each(['//evil.example', '/\\evil', '/dashboard', '/login', '/account/../dashboard', '/account/complete'])(
    'ignores a hostile, other-audience or self-referential destination (%j)',
    async (hostile) => {
      expect((await run(hostile)).clientNext).toBeUndefined();
    },
  );

  it('keeps the destination across the wizard\'s own Server Action re-renders (same URL, same query)', async () => {
    s.complete = true; // declaring the licence flips completeness mid-action
    s.actionRerender = true;
    const r = await run('/account/claim');
    expect(r.redirectedTo).toBeNull();
    expect(r.clientNext).toBe('/account/claim');
  });
});

describe('/account/complete — an account that is already complete is passed straight through', () => {
  beforeEach(() => {
    s.complete = true;
  });

  it('to the destination', async () => {
    expect((await run('/account/claim')).redirectedTo).toBe('/account/claim');
  });

  it('to the record by default', async () => {
    expect((await run()).redirectedTo).toBe('/account/record');
  });

  it.each(['//evil.example', '/\\evil', '/dashboard', '/login', '/account/../dashboard', '/account/complete'])(
    'to the record, not %j',
    async (hostile) => {
      expect((await run(hostile)).redirectedTo).toBe('/account/record');
    },
  );
});

describe('/account/complete — a visitor whose session is gone', () => {
  beforeEach(() => {
    s.user = null;
  });

  it('is sent to sign in and comes back with the destination still attached', async () => {
    const back = `/account/complete?next=${encodeURIComponent('/account/claim')}`;
    expect((await run('/account/claim')).redirectedTo).toBe(`/account/sign-in?next=${encodeURIComponent(back)}`);
  });

  it('comes back to the bare wizard when the destination was hostile', async () => {
    expect((await run('/dashboard')).redirectedTo).toBe(`/account/sign-in?next=${encodeURIComponent('/account/complete')}`);
  });
});

describe('/account/complete — the account read fails', () => {
  it('sends the visitor to sign in with the error and the destination still attached', async () => {
    s.accountError = 'not_authorized';
    const back = `/account/complete?next=${encodeURIComponent('/account/claim')}`;
    expect((await run('/account/claim')).redirectedTo).toBe(
      `/account/sign-in?error=not_authorized&next=${encodeURIComponent(back)}`,
    );
  });
});
