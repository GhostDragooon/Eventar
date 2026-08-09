'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Landing hero — ported from the approved design artifact
 * (`cpd-design-exploration`, aesthetic variant **D · White stage**, the one
 * marked selected there). Ivan's call 2026-08-06: match the artifact closely.
 *
 * The audience toggle is the hero's spine, not decoration: Eventar sells to two
 * people with opposite problems, and the artifact answers both in the same
 * space rather than picking one and losing the other. Everything with
 * `aud`-switched copy swaps together.
 *
 * Deliberately NOT the previous v5 hero: that one led with "Workshops that run
 * themselves on the day" — the pre-pivot workshop product — on a near-black
 * ground, which also contradicted the locked "white ground, loads light for
 * everyone, dark is the toggle only" rule.
 *
 * NOTE on the artifact's own caption: it describes "teal as the only
 * highlight". That text is stale inside the artifact — teal was retired
 * 2026-07-16 and its CSS uses the blue ramp (#1C3C94 / #0E79EC). The CSS wins.
 */

type Audience = 'practitioner' | 'organiser';

const COPY = {
  practitioner: {
    chip: 'For practitioners · CPD that keeps itself',
    head: ['Your CPD log should not', 'be your job.'],
    sub: 'Find accredited courses, attend, and your record updates itself. The certificate hunting and the renewal spreadsheet are gone.',
    primary: 'Get started',
    secondary: 'See how it works',
    secondaryHref: '#how-it-works',
  },
  organiser: {
    chip: 'For organisers & training providers',
    head: ['Run the event,', 'not the admin behind it.'],
    sub: 'Publish to practitioners looking for accredited hours, keep accreditation in one place, and let verified records issue themselves. The chasing and reconciling are gone.',
    primary: 'Get started',
    secondary: 'Book a demo',
    secondaryHref: '#get-started',
  },
} as const;

export function LandingHero() {
  const [aud, setAud] = useState<Audience>('practitioner');
  const c = COPY[aud];

  return (
    <div className="hero-zone relative">
      <div className="hero-atmo pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative px-lg pt-[58px] text-center">
        {/* "I'm a…" — the artifact's sliding-thumb pill. The thumb is a single
            element that translates, so the two labels never reflow. */}
        <div className="mb-[24px] flex flex-col items-center gap-sm">
          <span className="text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[.08em] text-on-surface-variant">
            I&rsquo;m a&hellip;
          </span>
          <div
            role="tablist"
            aria-label="Choose your view"
            className="aud-toggle relative inline-grid grid-flow-col auto-cols-fr overflow-hidden rounded-full border border-outline bg-surface-container-lowest"
          >
            <span
              aria-hidden
              className="aud-thumb absolute inset-y-0 left-0 z-0 w-1/2 bg-primary"
              style={{ transform: aud === 'organiser' ? 'translateX(100%)' : 'none' }}
            />
            {(['practitioner', 'organiser'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={aud === k}
                onClick={() => setAud(k)}
                className={`relative z-[1] whitespace-nowrap rounded-full px-[14px] py-[10px] text-[calc(12px*var(--text-scale))] font-semibold transition-colors sm:px-[22px] sm:text-[calc(13px*var(--text-scale))] ${
                  aud === k ? 'text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                {/* "Organiser or training provider" overflows 375px at the
                    artifact's padding. Shortened below sm rather than letting
                    the pill scroll the page sideways; the full phrase returns
                    as soon as there is room for it. */}
                {k === 'practitioner' ? (
                  'Practitioner'
                ) : (
                  <>
                    <span className="sm:hidden">Organiser</span>
                    <span className="hidden sm:inline">Organiser or training provider</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        <span className="inline-flex items-center gap-sm rounded-full border border-outline-variant bg-surface-container-lowest px-md py-[5px] text-[calc(12px*var(--text-scale))] font-semibold text-on-surface-variant">
          <span className="h-[6px] w-[6px] rounded-full bg-[#0E79EC]" aria-hidden />
          {c.chip}
        </span>

        {/* Variant D flips the artifact's default: the headline is SANS and the
            emphasis is serif-italic in the link blue — not the other way round. */}
        <h1 className="mx-auto mt-[18px] max-w-[21ch] text-[calc(44px*var(--text-scale))] font-bold leading-[1.1] tracking-[-0.02em] text-on-surface">
          {c.head[0]}
          <br />
          <em className="font-serif font-medium italic text-[#0E79EC]">{c.head[1]}</em>
        </h1>

        <p className="mx-auto mt-md max-w-[56ch] text-[calc(16px*var(--text-scale))] leading-[1.6] text-on-surface-variant">
          {c.sub}
        </p>

        {/* Both CTAs previously pointed at /login, so "See how verification
            works" and "Book a demo" both dumped the visitor on a sign-in form
            that answers neither. The secondary now goes to the section that
            actually shows the thing it names. */}
        <div className="mt-[22px] flex flex-wrap justify-center gap-sm">
          <Link
            href="/events"
            className="rounded-full bg-[#0D74E2] px-[19px] py-[9px] text-[calc(13px*var(--text-scale))] font-semibold text-white transition-shadow hover:shadow-[0_8px_22px_rgba(13,116,226,.35)]"
          >
            {c.primary}
          </Link>
          <a
            href={c.secondaryHref}
            className="rounded-full border border-outline bg-surface-container-lowest/75 px-[19px] py-[9px] text-[calc(13px*var(--text-scale))] font-semibold text-on-surface backdrop-blur-sm"
          >
            {c.secondary}
          </a>
        </div>

        {/* "8 bodies" means encoded rulebooks, NOT endorsements — the artifact
            is explicit about that and the copy must not imply otherwise. */}
        <p className="mt-[18px] flex flex-wrap items-center justify-center gap-sm text-[calc(12px*var(--text-scale))] text-on-surface-variant">
          Rule-aware for <b className="font-semibold text-on-surface">8 Hong Kong accrediting bodies</b>
          <span className="text-on-surface-variant">· HKICPA · Law Society · HKIE · HKCR · +4</span>
        </p>
      </div>
    </div>
  );
}
