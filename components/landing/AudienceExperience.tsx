'use client';

import type { ReactNode } from 'react';
import { useAudience } from './AudienceContext';
import { LandingHero } from './LandingHero';
import { HowItWorks } from './HowItWorks';

export type { Audience } from './AudienceContext';

/**
 * Holds the one audience toggle shared by the Hero and HowItWorks, per
 * LandingHero's own long-standing intent comment: "everything with
 * aud-switched copy swaps together." `children` renders between them so
 * WhyEventar keeps its exact page position without needing the audience
 * value itself. (LedgerWindow moved inside LandingHero's own right column
 * 2026-08-20 — it no longer passes through here.)
 */
export function AudienceExperience({ children, signedIn = false }: { children?: ReactNode; signedIn?: boolean }) {
  const { audience, setAudience } = useAudience();

  return (
    <>
      <LandingHero audience={audience} onAudienceChange={setAudience} signedIn={signedIn} />
      {children}
      <HowItWorks audience={audience} />
    </>
  );
}
