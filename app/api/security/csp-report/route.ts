import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

/** Minimal internal CSP violation sink (design §5 Catch 3). No PII: log the
 * violated-directive + blocked-uri ORIGIN only + a random correlation id.
 * Switches to Sentry when Sentry lands. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const r = body?.['csp-report'] ?? body;
    let blockedOrigin = 'unknown';
    try { blockedOrigin = new URL(r?.['blocked-uri'] ?? '').origin || 'inline-or-eval'; } catch { blockedOrigin = 'inline-or-eval'; }
    // The whole report body is client-supplied and untrusted — cap and
    // type-guard every field we log, not just blocked-uri, so "no PII" is
    // actually enforced rather than true only by convention.
    const rawDirective = r?.['violated-directive'] ?? r?.['effective-directive'];
    const violatedDirective =
      typeof rawDirective === 'string' ? rawDirective.slice(0, 100) : 'unknown';
    console.warn('[csp-report]', {
      id: randomUUID(),
      violatedDirective,
      blockedOrigin,   // origin only — never full URL (may carry query PII)
    });
  } catch { /* malformed report — ignore, do not 500 */ }
  return new NextResponse(null, { status: 204 });
}
