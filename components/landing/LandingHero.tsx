'use client';

import Link from 'next/link';
import type { Audience } from './AudienceExperience';
import { LedgerWindow } from './LedgerWindow';

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
 *
 * Audience state moved out to AudienceExperience (2026-08-20) so HowItWorks
 * further down the page can switch with it — "everything with aud-switched
 * copy swaps together" was already the stated intent, this just makes it true
 * of a second component instead of only the hero itself.
 *
 * Two-column restructure (2026-08-20, Ivan's request): was copy stacked
 * centered above LedgerWindow (full width, below the whole hero). Now the
 * toggle stays centered on top, then a row splits into copy (left) and
 * LedgerWindow (right) at the `lg` breakpoint; below that it still stacks,
 * centered — a 2-column split has no room to breathe under ~1024px.
 */

// WP4 Path A — hero copy trimmed of "verified records issue themselves" and
// "your record updates itself" claims that overstate what Eventar owns.
// The record Eventar issues is an Eventar record — a running log of what
// happened through the platform, not a substitute for iCMECPD or the college.
const COPY = {
  practitioner: {
    chip: 'For practitioners · CME/CPD attendance without the paperwork',
    head: ['Your CME/CPD log', 'should keep itself.'],
    sub: 'Find accredited events, register, check in on the day. Your Eventar record captures what you attended and the points released — alongside iCMECPD and your college, not instead of them.',
    primary: 'Get started',
    secondary: 'See how it works',
    secondaryHref: '#how-it-works',
  },
  organiser: {
    chip: 'For organisers & training providers',
    head: ['Run the event,', 'not the admin behind it.'],
    sub: 'Publish to practitioners looking for accredited hours, keep accreditation configuration in one place, and let attendance and points fall out of the check-in itself.',
    primary: 'Get started',
    secondary: 'Book a demo',
    secondaryHref: '#get-started',
  },
} as const;

export function LandingHero({
  audience,
  onAudienceChange,
}: {
  audience: Audience;
  onAudienceChange: (audience: Audience) => void;
}) {
  const aud = audience;
  const c = COPY[aud];

  return (
    <div className="hero-zone relative">
      <div className="hero-atmo pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative mx-auto max-w-[1200px] px-[15px] pt-[33px] text-center">
        {/* "I'm a…" — the artifact's sliding-thumb pill. The thumb is a single
            element that translates, so the two labels never reflow. Stays
            centered above the two-column split below.
            Equal top/bottom (Ivan, 2026-08-21): "top of hero" is really
            14px (.hero-zone's own padding-top, a pre-existing rule) + 33px
            (this pt) = 47px total — not 33px alone, which is what made the
            two sides look unequal before. mb-[47px] below matches that real
            47px total exactly (47 > the grid's own mt-xl/32px, so it wins
            the margin-collapse outright, no ambiguity). 17px label-to-pill
            is unchanged, not part of this instruction. */}
        <div className="mb-[47px] flex flex-col items-center gap-[17px]">
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
                onClick={() => onAudienceChange(k)}
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

        {/* Two-column split: copy left, LedgerWindow right, from `lg` up.
            Below that it stacks and stays centered, same as before.
            items-start, not items-center (2026-08-21 fix): the organiser
            copy wraps to 3 lines where practitioner's wraps to 2, so
            center-aligning the row made the whole left column visibly jump
            up/down when the toggle switched audience. Top-aligning both
            columns keeps the chip/headline start position fixed regardless
            of how many lines the copy underneath it wraps to. */}
        <div className="mt-xl grid items-start gap-xl text-center lg:grid-cols-2 lg:text-left">
          <div className="hero-copy">
            <span className="inline-flex items-center gap-sm rounded-full border border-outline-variant bg-surface-container-lowest px-md py-[5px] text-[calc(12px*var(--text-scale))] font-semibold text-on-surface-variant">
              <span className="h-[6px] w-[6px] rounded-full bg-primary" aria-hidden />
              {c.chip}
            </span>

            {/* Variant D flips the artifact's default: the headline is SANS and
                the emphasis is serif-italic in the link blue — not the other
                way round. */}
            <h1 className="mx-auto mt-[18px] max-w-[21ch] text-[calc(44px*var(--text-scale))] font-bold leading-[1.1] tracking-[-0.02em] text-on-surface lg:mx-0">
              {c.head[0]}
              <br />
              <em className="font-medium italic text-primary">{c.head[1]}</em>
            </h1>

            {/* min-h reserves 3 lines (16px * 1.6 line-height * 3), matching
                the organiser copy's actual wrap — practitioner's is 2 lines,
                so without this the row height (and everything below: CTAs,
                stat line) would still shift when the copy underneath it got
                shorter, even with items-start fixing the top. Scales with
                --text-scale like every other size on this page, not a bare
                px value that would clip at the Large text-size setting. */}
            <p className="mx-auto mt-md max-w-[56ch] min-h-[calc(16px*1.6*3*var(--text-scale))] text-[calc(16px*var(--text-scale))] leading-[1.6] text-on-surface-variant lg:mx-0">
              {c.sub}
            </p>

            {/* Both CTAs previously pointed at /login, so "See how verification
                works" and "Book a demo" both dumped the visitor on a sign-in
                form that answers neither. The secondary now goes to the
                section that actually shows the thing it names. */}
            <div className="mt-[22px] flex flex-wrap justify-center gap-sm lg:justify-start">
              <Link
                href="/events"
                className="rounded-full bg-primary px-[19px] py-[9px] text-[calc(13px*var(--text-scale))] font-semibold text-white transition-shadow hover:shadow-[0_8px_22px_rgba(13,116,226,.35)]"
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

            {/* "8 bodies" means encoded rulebooks, NOT endorsements — the
                artifact is explicit about that and the copy must not imply
                otherwise. */}
            <p className="mt-[18px] flex flex-wrap items-center justify-center gap-sm text-[calc(12px*var(--text-scale))] text-on-surface-variant lg:justify-start">
              Rule-aware for <b className="font-semibold text-on-surface">8 Hong Kong accrediting bodies</b>
              <span className="text-on-surface-variant">· HKICPA · Law Society · HKIE · HKCR · +4</span>
            </p>
          </div>

          <LedgerWindow />
        </div>
      </div>
    </div>
  );
}
