'use client';

import { useState, type ReactNode } from 'react';
import { LandingHero } from './LandingHero';
import { HowItWorks } from './HowItWorks';

export type Audience = 'practitioner' | 'organiser';

/**
 * Holds the one audience toggle shared by the Hero and HowItWorks, per
 * LandingHero's own long-standing intent comment: "everything with
 * aud-switched copy swaps together." `children` renders between them so
 * WhyEventar keeps its exact page position without needing the audience
 * value itself. (LedgerWindow moved inside LandingHero's own right column
 * 2026-08-20 — it no longer passes through here.)
 */
export function AudienceExperience({ children }: { children?: ReactNode }) {
  const [audience, setAudience] = useState<Audience>('practitioner');

  return (
    <>
      <LandingHero audience={audience} onAudienceChange={setAudience} />
      {children}
      <HowItWorks audience={audience} />
    </>
  );
}
