import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryStaleJwt } from './retryStaleJwt';

const FUTURE = 'Bearer error="invalid_token", error_description="JWT issued at future"';
const EXPIRED = 'Bearer error="invalid_token", error_description="JWT expired"';

const refused = (www: string, status = 401) => new Response(null, { status, headers: { 'www-authenticate': www } });
const ok = () => new Response('[]', { status: 200 });

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('retryStaleJwt', () => {
  it('returns an ordinary response after a single call', async () => {
    const first = ok();
    fetchMock.mockResolvedValueOnce(first);

    expect(await retryStaleJwt(0)('https://api.test/rest/v1/staff')).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once after "JWT issued at future" and returns the second answer', async () => {
    const second = ok();
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(second);

    expect(await retryStaleJwt(0)('https://api.test/rest/v1/staff')).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resends the same request, body included, so a refused write is not lost', async () => {
    const init: RequestInit = { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{"p_token":"x"}' };
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(ok());

    await retryStaleJwt(0)('https://api.test/rest/v1/rpc/accept_invite_token', init);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.test/rest/v1/rpc/accept_invite_token', init);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.test/rest/v1/rpc/accept_invite_token',
      expect.objectContaining({ method: 'POST', headers: init.headers, body: init.body }),
    );
  });

  // Inside a Server Component render Next memoises an identical GET or HEAD, so
  // a plain second call would be answered with the same refusal and the retry
  // would be a no-op. A signal is Next's documented opt-out. (Executed in a real
  // render against a stub: without the signal the final status stayed 401.)
  it('retries with a signal so Next does not memoise the second attempt away', async () => {
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(ok());

    await retryStaleJwt(0)('https://api.test/rest/v1/staff');

    expect(fetchMock.mock.calls[0][1]?.signal).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // postgrest-js always passes an explicit `signal: undefined`. Spreading init
  // AFTER the new signal let that undefined win, and Next memoised the retry again.
  it('opts out of memoisation when init carries an explicit `signal: undefined`', async () => {
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(ok());

    await retryStaleJwt(0)('https://api.test/rest/v1/staff', { method: 'GET', signal: undefined });

    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // The wait is the mechanism: it is what lets PostgREST's clock catch up.
  it('waits the configured delay before retrying', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(ok());

    const pending = retryStaleJwt()('https://api.test/rest/v1/staff');
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a caller's own signal on the retry", async () => {
    const mine = new AbortController().signal;
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(ok());

    await retryStaleJwt(0)('https://api.test/rest/v1/staff', { signal: mine });

    expect(fetchMock.mock.calls[1][1]?.signal).toBe(mine);
  });

  // In a render, each caller holds one tee()'d branch of a memoised response,
  // and a branch's cancel() stays pending until the other branch is cancelled
  // too. Awaiting it hung a render for 60 s (executed). Not awaiting must never
  // block the retry.
  it('does not wait for the refused response body to finish cancelling', async () => {
    const stuck = {
      status: 401,
      headers: new Headers({ 'www-authenticate': FUTURE }),
      body: { cancel: () => new Promise(() => {}) },
    } as unknown as Response;
    const second = ok();
    fetchMock.mockResolvedValueOnce(stuck).mockResolvedValueOnce(second);

    expect(await retryStaleJwt(0)('https://api.test/rest/v1/staff')).toBe(second);
  });

  it.each([
    ['a genuinely bad token', () => refused(EXPIRED)],
    ['other failures, even with the same wording', () => refused(FUTURE, 403)],
  ])('does not retry %s', async (_what, make) => {
    const answer = make();
    fetchMock.mockResolvedValueOnce(answer);

    expect(await retryStaleJwt(0)('https://api.test/rest/v1/staff')).toBe(answer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after one retry and returns the second refusal untouched', async () => {
    const again = refused(FUTURE);
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(again);

    expect(await retryStaleJwt(0)('https://api.test/rest/v1/staff')).toBe(again);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says so in the log when it retries (rule 12: nothing silent)', async () => {
    fetchMock.mockResolvedValueOnce(refused(FUTURE)).mockResolvedValueOnce(ok());

    await retryStaleJwt(0)('https://api.test/rest/v1/staff');

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('retrying once'));
  });
});
