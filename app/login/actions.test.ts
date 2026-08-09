import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

// getRequestOrigin reads next/headers in dev fallback; no request context in
// the test runner, so mock it (same convention as registerForEvent tests).
vi.mock('@/lib/origin', () => ({
  getRequestOrigin: vi.fn(async () => 'http://localhost:3000'),
}));

// Writable in-memory cookie jar standing in for the Server-Action cookie
// store. The SSR client persists the PKCE code verifier through this.
const { jar } = vi.hoisted(() => ({
  jar: [] as { name: string; value: string }[],
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => jar,
    set: (name: string, value: string) => {
      jar.push({ name, value });
    },
  })),
}));

import { sendMagicLink } from './actions';

// Captures the GoTrue /otp request instead of sending it — no network, no email.
type OtpRequest = { url: string; body: Record<string, unknown> };
const captured: OtpRequest[] = [];

function makeFormData(email: string): FormData {
  const fd = new FormData();
  fd.set('email', email);
  return fd;
}

beforeEach(() => {
  jar.length = 0;
  captured.length = 0;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : {},
      });
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The magic-link email only carries a usable ?code= redirect when the /otp
// request includes a PKCE code_challenge AND the code verifier is persisted
// as a cookie in the requesting browser. Without either, GoTrue falls back
// to the implicit flow: the emailed link redirects with tokens in the URL
// fragment, /auth/callback sees no ?code=, and login dies with missing_code.
function expectPkceOtpRequest() {
  const otp = captured.find((r) => r.url.includes('/auth/v1/otp'));
  expect(otp, 'expected a GoTrue /otp request').toBeDefined();
  expect(otp!.url).toContain(
    `redirect_to=${encodeURIComponent('http://localhost:3000/auth/callback')}`,
  );
  expect(otp!.body.code_challenge, 'PKCE code_challenge missing → implicit-flow link').toEqual(
    expect.any(String),
  );
  expect(otp!.body.code_challenge_method).toBe('s256');
  expect(
    jar.some((c) => c.name.endsWith('-code-verifier')),
    'code-verifier cookie not written → exchangeCodeForSession would fail',
  ).toBe(true);
}

describe('sendMagicLink', () => {
  // Regression context: the removed EVENTAR_REVIEW_MODE bypass once routed
  // supabaseServer() to the service-role admin client (plain supabase-js =
  // implicit flow, no cookie storage), so magic links landed on
  // /login?error=missing_code. The login action must always use the anon
  // SSR client for token-minting flows.
  it('sends a PKCE code_challenge and persists the verifier cookie', async () => {
    const res = await sendMagicLink(makeFormData('staff@example.com'));
    expect(res).toEqual({ ok: true });
    expectPkceOtpRequest();
  });

  // ADDED 2026-08-09, reversing a 2026-08-06 note that is no longer true.
  //
  // That note rejected this exact case (recovered from the unmerged `709cd6a`
  // on claude/gifted-jemison-31b671) as vacuous, on the grounds that `c43fd95`
  // had stripped the review-mode branch, so "supabaseServer() now
  // unconditionally delegates to supabaseAnonServer() and the failure mode is
  // structurally gone". That was true when written and STOPPED BEING TRUE THE
  // SAME DAY: review mode was reinstated, and lib/supabase/server.ts routes to
  // supabaseAdmin() again whenever it is on.
  //
  // So the failure mode is reachable once more. A plain supabase-js admin
  // client sends no code_challenge and writes no verifier cookie, so if anyone
  // swaps this action back to supabaseServer() while review mode is on, magic
  // links die at /login?error=missing_code — the original bug, exactly.
  //
  // Mutation-tested before landing, not assumed: with the swap applied this
  // case FAILS (no code_challenge) while the other two stay green. It guards
  // something real now.
  it('uses the PKCE anon client even when review mode is on', async () => {
    vi.stubEnv('EVENTAR_REVIEW_MODE', 'true');
    const res = await sendMagicLink(makeFormData('staff@example.com'));
    expect(res).toEqual({ ok: true });
    expectPkceOtpRequest();
  });

  it('rejects an invalid email without calling GoTrue', async () => {
    const res = await sendMagicLink(makeFormData('not-an-email'));
    expect(res).toEqual({ error: 'Please enter a valid email address.' });
    expect(captured).toHaveLength(0);
  });
});
