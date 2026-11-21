'use client';

import { SiteNav } from '@/components/shell/SiteNav';
import { useAudience } from './AudienceContext';
import { LandingAuthPill } from './LandingAuthPill';

/**
 * The landing nav is the shared SiteNav (2026-11-20, Ivan: one top nav on every
 * public and auth page). The landing-only anchors and "Start an Event" left the
 * nav; their sections stay on the page.
 *
 * Sticky at top:10px, as a direct child of the `.hero-ground` column flexbox
 * (app/page.tsx): the gradient must start at y=0 and the sticky containing block
 * must be the full document. The width classes reproduce the old 1200px content
 * column inset by 15px so the pill lines up with the sections below; explicit
 * width is load-bearing because a flex item's `mx-auto` disables cross-axis stretch.
 *
 * One login control (Ivan 2026-11-21): the pill opens the door the landing toggle is on,
 * attendee `/account/sign-in` or organiser `/login`. Passing `loginHref` drops SiteNav's
 * separate "Organiser log in" link, so no two buttons open the same page.
 *
 * `app/page.tsx` is dynamic and always passes `signedIn`, so SiteNav's own CTA renders.
 * The `LandingAuthPill` client island is the fallback for a caller that omits `signedIn`
 * (it resolves the session in the browser); `/` no longer takes that path.
 */
export function LandingNav({
  signedIn,
  isStaff = false,
  accountComplete = true,
  unlinkedCount = 0,
}: { signedIn?: boolean; isStaff?: boolean; accountComplete?: boolean; unlinkedCount?: number } = {}) {
  const { audience } = useAudience();
  const organiser = audience === 'organiser';
  return (
    <SiteNav
      className="mx-auto w-[calc(100%-1.875rem)] max-w-[73.125rem]"
      loginHref={organiser ? '/login' : '/account/sign-in'}
      loginLabel={organiser ? 'Organiser log in' : 'Log in'}
      signedIn={signedIn ?? false}
      isStaff={isStaff}
      accountComplete={accountComplete}
      unlinkedCount={unlinkedCount}
      authSlot={signedIn === undefined ? <LandingAuthPill /> : undefined}
    />
  );
}
