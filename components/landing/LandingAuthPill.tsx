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

const PILL_CLASS =
  'rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0';

export function LandingAuthPill() {
  // Signed-out default = safe first paint. `undefined` would suppress render
  // until the session check resolves, which introduces a layout shift a
  // marketing visitor should never see.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line no-restricted-syntax -- no-session collapses to "signed out"
      const { data } = await supabaseBrowser().auth.getSession();
      if (!cancelled && data.session) setSignedIn(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return signedIn ? (
    <Link href="/account" className={PILL_CLASS}>
      Account
    </Link>
  ) : (
    <Link href="/account/sign-in" className={PILL_CLASS}>
      Sign in
    </Link>
  );
}
