import { headers } from 'next/headers';

/**
 * Returns the canonical request origin for outbound URLs (QR codes, email
 * links, redirects). Prefers `NEXT_PUBLIC_SITE_URL` so that production
 * cannot be tricked by host-header spoofing — `headers().get('host')`
 * reflects whatever the upstream proxy claims, which is attacker-controlled
 * in many topologies.
 *
 * Falls back to request headers ONLY in development, so localhost still
 * works without an env var. In production, missing `NEXT_PUBLIC_SITE_URL`
 * throws rather than emitting a QR pointing at an attacker-controlled
 * domain — fail visibly (CLAUDE.md rule 12).
 *
 * Phase-8 deploy gate 3: `NEXT_PUBLIC_SITE_URL` MUST be set on Vercel
 * before deploy. See `docs/plans/PROJECT_STATE.md` carried-forward
 * considerations.
 *
 * Used by:
 *   - app/events/[id]/edit/actions.ts::getEventQrPng        (staff)
 *   - app/(public)/events/[id]/page.tsx                     (public info page)
 *   - app/(public)/events/[id]/poster/page.tsx              (public poster)
 */
export async function getRequestOrigin(): Promise<string> {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (envOrigin) return envOrigin.replace(/\/+$/, ''); // strip trailing slash

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is required in production — host-header origin is unsafe (Phase-8 deploy gate 3)',
    );
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}
