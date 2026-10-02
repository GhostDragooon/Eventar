// PostgREST 14 before 14.18 (and 16 before 16.3) can answer 401 PGRST303 "JWT
// issued at future" to a token minted a moment ago. It checks the token's iat
// against a cached clock (auto-update's mkAutoUpdate) that can be stale after an
// idle spell by more than the 30 s of skew it allows, so the first burst of
// requests after quiet time (typically a sign-in followed by a page that fans
// out reads) gets part of the burst refused. Upstream: PostgREST #5196, fixed in
// 14.18 and 16.3; the first attempt, #5159 in 14.17, was not enough. The local
// stack runs 14.15; the hosted version is not visible from outside.
//
// The request is refused before any SQL runs, so repeating it is safe for every
// method, and by the second try the clock has caught up. One retry, and only for
// this exact reason: a genuinely bad token (invalid, expired) still fails on the
// first answer, and a second refusal is returned as it is.
//
// DELETE THIS MODULE, and its wiring in server.ts, once every PostgREST we run
// is 14.18 / 16.3 or later.
const STALE_CLOCK = 'JWT issued at future';

export function retryStaleJwt(delayMs = 250): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, init);
    if (res.status !== 401 || !res.headers.get('www-authenticate')?.includes(STALE_CLOCK)) return res;
    // Not awaited, on purpose: inside a Server Component render Next hands every
    // caller a tee()'d clone of one memoised response, and a branch's cancel()
    // only settles once the other branch is cancelled as well. That never
    // happens, so awaiting it hangs the render (seen: 60 s).
    void res.body?.cancel().catch(() => {});
    console.warn('[supabase] PostgREST refused a fresh JWT as issued-at-future; retrying once');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    // A signal is Next's documented opt-out from per-render fetch memoisation,
    // which would otherwise answer an identical GET or HEAD with the same
    // refused response again. A caller's own signal already opts out; keep it.
    return fetch(input, { ...init, signal: init?.signal ?? new AbortController().signal });
  };
}
