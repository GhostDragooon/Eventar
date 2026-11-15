// M3 (security audit 2026-11-04): frame-ancestors lives only in the report-only CSP, which browsers do not
// enforce, so every route could be framed. X-Frame-Options is the enforcing control.
import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config';

describe('next.config security headers', () => {
  it('sends X-Frame-Options DENY on every route and hides X-Powered-By', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    expect(all, 'the catch-all header rule must exist').toBeDefined();
    const xfo = all!.headers.find((h) => h.key === 'X-Frame-Options');
    expect(xfo?.value).toBe('DENY');
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
