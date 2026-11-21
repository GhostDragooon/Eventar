'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export type Audience = 'practitioner' | 'organiser';

/**
 * The landing's Attendee/Organiser toggle, shared by the hero, HowItWorks and the nav's
 * login pill (Ivan 2026-11-21: the toggle decides which door the one login button opens).
 * Outside a provider the default is the attendee view and the setter does nothing.
 */
const Ctx = createContext<{ audience: Audience; setAudience: (a: Audience) => void }>({
  audience: 'practitioner',
  setAudience: () => {},
});

export function AudienceProvider({ children, initial = 'practitioner' }: { children: ReactNode; initial?: Audience }) {
  const [audience, setAudience] = useState<Audience>(initial);
  return <Ctx.Provider value={{ audience, setAudience }}>{children}</Ctx.Provider>;
}

export const useAudience = () => useContext(Ctx);
