// The count behind the claim banner is advisory: a failed or throwing read is 0, so there is never a false banner
// and never a broken page (Ivan 2026-11-02, pick 5a).
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

const { count } = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('./actions', () => ({ getUnlinkedRegistrationCount: count }));

import { afterEach, describe, expect, it, vi as v } from 'vitest';
import { readUnlinkedCount } from './readUnlinkedCount';

describe('readUnlinkedCount', () => {
  afterEach(() => v.restoreAllMocks());

  it('returns the count when the read is ok', async () => {
    count.mockResolvedValueOnce({ ok: true, data: { count: 4 } });
    expect(await readUnlinkedCount()).toBe(4);
  });

  it('a failed read (ok: false) is 0, so no false banner', async () => {
    count.mockResolvedValueOnce({ ok: false, error: 'rate_limited', retryAfterMs: 1 });
    expect(await readUnlinkedCount()).toBe(0);
  });

  it('logs the error code (code only, nothing else) when the read fails, so a persistent failure is not invisible', async () => {
    const log = v.spyOn(console, 'error').mockImplementation(() => {});
    count.mockResolvedValueOnce({ ok: false, error: 'db_error' });
    expect(await readUnlinkedCount()).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[readUnlinkedCount] read failed', { code: 'db_error' });
  });

  it('logs the error name, not its message, when the read throws', async () => {
    const log = v.spyOn(console, 'error').mockImplementation(() => {});
    count.mockRejectedValueOnce(new TypeError('person@example.com down'));
    expect(await readUnlinkedCount()).toBe(0);
    expect(log).toHaveBeenCalledWith('[readUnlinkedCount] read threw', { name: 'TypeError' });
  });

  it('does not log when the read is ok', async () => {
    const log = v.spyOn(console, 'error').mockImplementation(() => {});
    count.mockResolvedValueOnce({ ok: true, data: { count: 0 } });
    await readUnlinkedCount();
    expect(log).not.toHaveBeenCalled();
  });

  it('a throwing read is 0 too: the advisory never breaks the page', async () => {
    count.mockRejectedValueOnce(new Error('db down'));
    expect(await readUnlinkedCount()).toBe(0);
  });
});
