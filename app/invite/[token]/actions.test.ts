import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionMissingError } from '@supabase/supabase-js';

// acceptInvite talks to Supabase through the session client only: the user
// lookup, three RLS-scoped existence reads, and the accept_invite_token RPC.
// The client is a hand-rolled fake so each branch can be driven directly.
const { getUser, rpc, reads } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  // What each practitioner table returns, and every (table, column, value)
  // filter the action applied to it.
  reads: {
    result: {} as Record<string, { count: number | null; error: { code: string; message: string } | null }>,
    filters: [] as Array<{ table: string; column: string; value: unknown }>,
    // Every select(columns, options) call, so a test can see HOW it was asked.
    selects: [] as Array<{ table: string; columns: string; options: unknown }>,
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({
    auth: { getUser },
    rpc,
    from: (table: string) => ({
      // Like the real client, a head-count only comes back when it was asked
      // for with { count: 'exact', head: true }; a bare select('id') returns
      // count: null. Without this the fake answered the same either way, and
      // dropping the option (so D3's prompt silently never fires: fail-open)
      // went unnoticed by every test.
      select: (columns: string, options?: { count?: string; head?: boolean }) => ({
        eq: (column: string, value: unknown) => {
          reads.filters.push({ table, column, value });
          reads.selects.push({ table, columns, options });
          const asked = options?.count === 'exact' && options?.head === true;
          return Promise.resolve(asked ? reads.result[table] : { count: null, error: null });
        },
      }),
    }),
  }),
}));

import { acceptInvite } from './actions';

const USER = { id: 'user-1', email: 'invitee@example.com' };
const TABLES = ['professional_profiles', 'practitioner_licences', 'registrations'] as const;

function signedIn() {
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
}
function practitionerData(tables: readonly string[] = []) {
  for (const table of TABLES) {
    reads.result[table] = { count: tables.includes(table) ? 1 : 0, error: null };
  }
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset().mockResolvedValue({ data: 'Acme Training', error: null });
  reads.result = {};
  reads.filters = [];
  reads.selects = [];
  signedIn();
  practitionerData();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('acceptInvite — how the practitioner-data reads are made', () => {
  it('asks each of the three tables for an exact head-count (a bare select would read as "no data" and skip the D3 prompt)', async () => {
    practitionerData(['practitioner_licences']);
    expect(await acceptInvite('tok-1', { confirmed: false })).toEqual({ needsConfirm: true, email: USER.email });
    expect(reads.selects.map((r) => r.table).sort()).toEqual([...TABLES].sort());
    for (const read of reads.selects) {
      expect(read.options).toEqual({ count: 'exact', head: true });
    }
  });
});

describe('acceptInvite — no practitioner data', () => {
  it('calls the RPC and returns the organisation name', async () => {
    const res = await acceptInvite('tok-1', { confirmed: false });
    expect(res).toEqual({ orgName: 'Acme Training' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('accept_invite_token', { p_token: 'tok-1' });
  });

  it.each([null, undefined, {}, { confirmed: 'yes' }, { confirmed: 1 }])(
    'treats %j as unconfirmed, never as a skipped prompt, and does not throw',
    async (options) => {
      practitionerData(['registrations']);
      // @ts-expect-error a hostile client can send anything as the options argument
      expect(await acceptInvite('tok-1', options)).toEqual({ needsConfirm: true, email: USER.email });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('treats a missing options argument as unconfirmed', async () => {
    practitionerData(['registrations']);
    expect(await acceptInvite('tok-1')).toEqual({ needsConfirm: true, email: USER.email });
    expect(rpc).not.toHaveBeenCalled();
  });

  // The reads rely on RLS (self-read) but must not depend on it alone: each is
  // pinned to the caller's own id as well.
  it("scopes all three reads to the caller's own user id", async () => {
    await acceptInvite('tok-1', { confirmed: false });
    expect(reads.filters).toHaveLength(3);
    for (const table of TABLES) {
      expect(reads.filters).toContainEqual({ table, column: 'user_id', value: USER.id });
    }
  });
});

// D3 (2026-09-25): an invitee whose email already has practitioner records is
// asked to use a separate organiser email first — and may decline. The check
// is an app-layer prompt, not an enforcement control: both outcomes are allowed.
describe('acceptInvite — the email already has practitioner data (D3)', () => {
  it.each(TABLES)('%s alone is enough: returns needsConfirm and does NOT call the RPC', async (table) => {
    practitionerData([table]);
    const res = await acceptInvite('tok-1', { confirmed: false });
    expect(res).toEqual({ needsConfirm: true, email: USER.email });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('data and confirmed: calls the RPC (the invitee chose to proceed)', async () => {
    practitionerData(['professional_profiles', 'practitioner_licences', 'registrations']);
    const res = await acceptInvite('tok-1', { confirmed: true });
    expect(res).toEqual({ orgName: 'Acme Training' });
    expect(rpc).toHaveBeenCalledWith('accept_invite_token', { p_token: 'tok-1' });
  });

  it('confirmed skips the reads entirely, so a failing read cannot block a confirmed accept', async () => {
    reads.result.registrations = { count: null, error: { code: '57014', message: 'timeout' } };
    const res = await acceptInvite('tok-1', { confirmed: true });
    expect(res).toEqual({ orgName: 'Acme Training' });
    expect(reads.filters).toHaveLength(0);
  });

  // Rule 12: not knowing is not the same as "no data". Accepting silently on a
  // blip would skip the very prompt this check exists for.
  it('a failing read fails visibly: generic error, RPC not called, only the code is logged', async () => {
    reads.result.practitioner_licences = {
      count: null,
      error: { code: '57014', message: `canceling statement for ${USER.email}` },
    };
    const res = await acceptInvite('tok-1', { confirmed: false });
    expect(res).toEqual({ error: "We couldn't check your account just now. Try again." });
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain('57014');
    expect(logged).not.toContain(USER.email);
  });
});

describe('acceptInvite — signed out', () => {
  it('asks the caller to sign in, flagged so the page can offer the link; touches nothing else', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const res = await acceptInvite('tok-1', { confirmed: false });
    expect(res).toEqual({ error: 'You must be signed in to accept an invite.', needsSignIn: true });
    expect(reads.filters).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  // A failed lookup is an outage, not a signed-out visitor: telling them to
  // sign in again would be wrong, and the sign-in link must not appear.
  it('a failed user lookup is NOT reported as signed out', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError', status: 0 }),
    });
    const res = await acceptInvite('tok-1', { confirmed: false });
    expect(res).toEqual({ error: "We couldn't verify your sign-in just now. Try again." });
    expect(res).not.toHaveProperty('needsSignIn');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('acceptInvite — RPC errors', () => {
  // Each reason names its next step, and is flagged `final` so the page stops
  // offering a button that cannot succeed (Band 1 review F6: the used, expired
  // and unknown states all left an active Accept button and no way forward).
  it.each([
    ['accept_invite_token: this invite has expired', 'This invite link has expired. Ask your admin for a new one.'],
    [
      'accept_invite_token: invalid or expired invite link',
      "This invite link isn't valid. Check that you copied all of it, or ask your admin for a new one.",
    ],
  ])('maps "%s" to a plain-language, final message with a next step', async (message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message } });
    expect(await acceptInvite('tok-1', { confirmed: true })).toEqual({ error: expected, final: true });
  });

  // The person who already joined with this link and reopens the email lands
  // here too; the page needs to know so it can point them at the dashboard.
  it('flags a used link so the page can offer the dashboard to someone who already joined', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'accept_invite_token: this invite has already been used' } });
    expect(await acceptInvite('tok-1', { confirmed: true })).toEqual({
      error: 'This invite link has already been used. Ask your admin for a new one.',
      final: true,
      used: true,
    });
  });

  // An unknown token says "invalid or expired"; reading the bare word "expired"
  // first told someone holding a mistyped link that it had expired.
  it('does not call an unknown token "expired"', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'accept_invite_token: invalid or expired invite link' } });
    const res = await acceptInvite('tok-1', { confirmed: true });
    expect(res).toHaveProperty('error', expect.not.stringMatching(/has expired/));
  });

  it('flags "already a member" so the page can offer the dashboard', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'accept_invite_token: you are already a member of this organisation' },
    });
    expect(await acceptInvite('tok-1', { confirmed: true })).toEqual({
      error: "You're already a member of this organisation.",
      final: true,
      alreadyMember: true,
    });
  });

  it('an unrecognised failure is not final: the caller may try again', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'accept_invite_token: could not determine your email' } });
    expect(await acceptInvite('tok-1', { confirmed: true })).not.toHaveProperty('final');
  });

  // The old fallback returned error.message verbatim — database wording
  // ("accept_invite_token: could not determine your email") on a public page,
  // with nothing logged for us.
  it('an unrecognised failure shows a generic message, never the raw text, and logs only the code', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'accept_invite_token: could not determine your email',
        details: 'row (invitee@example.com)',
      },
    });
    const res = await acceptInvite('secret-token-value', { confirmed: true });
    expect(res).toEqual({
      error: "We couldn't accept this invite. Try again, or ask your admin for a new link.",
    });
    expect(JSON.stringify(res)).not.toMatch(/accept_invite_token|determine your email/i);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain('P0001');
    expect(logged).not.toContain('could not determine');
    expect(logged).not.toContain('secret-token-value');
    expect(logged).not.toContain(USER.email);
  });
});
