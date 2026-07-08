import { describe, expect, it, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/security/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/security/csp-report', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs origin-only blocked-uri + violated directive and returns 204 for a well-formed report', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = makeRequest({
      'csp-report': {
        'violated-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example.com/x?token=secret',
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, logged] = warnSpy.mock.calls[0];
    expect(logged).toMatchObject({
      violatedDirective: 'script-src-elem',
      blockedOrigin: 'https://evil.example.com',
    });
    // No-PII guarantee: the path/query must NOT survive into the logged value.
    expect(logged.blockedOrigin).not.toContain('/x');
    expect(logged.blockedOrigin).not.toContain('token=secret');
    expect(typeof logged.id).toBe('string');
  });

  it('returns 204 without throwing for a malformed (invalid JSON) body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = makeRequest('{not valid json');

    const res = await POST(req);

    expect(res.status).toBe(204);
  });

  it('returns 204 without throwing for an empty body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = makeRequest('');

    const res = await POST(req);

    expect(res.status).toBe(204);
  });

  it('falls back to "inline-or-eval" when blocked-uri is missing, without crashing on new URL(undefined)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const req = makeRequest({
      'csp-report': {
        'violated-directive': 'style-src',
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(204);
    const [, logged] = warnSpy.mock.calls[0];
    expect(logged).toMatchObject({
      violatedDirective: 'style-src',
      blockedOrigin: 'inline-or-eval',
    });
  });

  it('caps and type-guards violated-directive so the whole client-supplied report is sanitized, not just blocked-uri', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Case 1: absurdly long / non-truncated directive string.
    const longDirective = 'x'.repeat(500);
    let res = await POST(makeRequest({ 'csp-report': { 'violated-directive': longDirective } }));
    expect(res.status).toBe(204);
    let [, logged] = warnSpy.mock.calls.at(-1)!;
    expect((logged.violatedDirective as string).length).toBeLessThanOrEqual(100);

    // Case 2: non-string directive (a malicious/malformed report) must not crash or pass through untouched.
    res = await POST(makeRequest({ 'csp-report': { 'violated-directive': { nested: 'object' } } }));
    expect(res.status).toBe(204);
    [, logged] = warnSpy.mock.calls.at(-1)!;
    expect(logged.violatedDirective).toBe('unknown');
  });
});
