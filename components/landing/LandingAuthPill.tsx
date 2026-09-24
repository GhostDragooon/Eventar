'use client';

// Small client island isolating the auth-varying pill so `app/page.tsx` can
// stay a static prerender (Dev-lens MODERATE 1, 2026-09-06). Reading the
// session server-side promoted the landing to ƒ Dynamic and defeated CDN
// caching for the busiest marketing surface.
//
// First paint matches the signed-out default (majority case for a marketing
// visitor); once the browser session resolves, a signed-in visitor's pill
// flips to "Account". One repaint, no layout shift (identical footprint).
// Matches the shape of PublicShell.tsx's state-aware CTA (commit f406d4e).

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { StaffProgrammePill } from '@/components/shell/StaffProgrammePill';
import { getAccountMenuState } from '@/app/account/actions';

const PILL_CLASS =
  'rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export function LandingAuthPill() {
  // Signed-out default = safe first paint. `undefined` would suppress render
  // until the session check resolves, which introduces a layout shift a
  // marketing visitor should never see.
  const [signedIn, setSignedIn] = useState(false);
  // Resolved only once signedIn flips true — a signed-out visitor never pays
  // for the extra Server Action round trip. Renders a plain (non-menu)
  // "Account" pill for the brief window between signedIn resolving and this
  // resolving; same one-repaint cost the signedIn flip already accepts.
  // isStaff added 2026-09-24 (Ivan): staff session → StaffProgrammePill
  // instead of AccountMenu (organisers have no attendee identity).
  const [menuState, setMenuState] = useState<{ isStaff: boolean; accountComplete: boolean; unlinkedCount: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line no-restricted-syntax -- no-session collapses to "signed out"
      const { data } = await supabaseBrowser().auth.getSession();
      if (cancelled || !data.session) return;
      setSignedIn(true);
      const state = await getAccountMenuState();
      if (!cancelled) setMenuState(state);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) {
    return (
      <Link href="/account/sign-in" className={PILL_CLASS}>
        Sign in
      </Link>
    );
  }
  if (!menuState) {
    return (
      <Link href="/account" className={PILL_CLASS}>
        Account
      </Link>
    );
  }
  if (menuState.isStaff) {
    return <StaffProgrammePill />;
  }
  return <AccountMenu complete={menuState.accountComplete} unlinkedCount={menuState.unlinkedCount} />;
}
