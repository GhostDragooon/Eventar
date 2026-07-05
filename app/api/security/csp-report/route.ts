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
    console.warn('[csp-report]', {
      id: randomUUID(),
      violatedDirective: r?.['violated-directive'] ?? r?.['effective-directive'] ?? 'unknown',
      blockedOrigin,   // origin only — never full URL (may carry query PII)
    });
  } catch { /* malformed report — ignore, do not 500 */ }
  return new NextResponse(null, { status: 204 });
}
