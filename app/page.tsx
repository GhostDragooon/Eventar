import Link from 'next/link';
import { LandingNav } from '@/components/landing/LandingNav';
import { AudienceExperience } from '@/components/landing/AudienceExperience';
import { WhyEventar } from '@/components/landing/WhyEventar';
import { SiteFooter } from '@/components/shell/SiteFooter';

/**
 * Landing — ported from the approved design artifact `cpd-design-exploration`,
 * aesthetic variant **D · White stage** (the variant marked selected there).
 * Ivan's call 2026-08-06: bring the artifact across and match it closely.
 *
 * REPLACES the v5 editorial landing, which was wrong on two counts beyond
 * style: it sold "Workshops that run themselves on the day" — the pre-pivot
 * workshop product, not CPD for regulated professions — and it did so on a
 * near-black hero, contradicting the locked "white ground, loads light for
 * everyone, dark is the toggle only" decision.
 *
 * `SiteShell` is deliberately not used here: it supplies the in-product nav
 * (Home / Upcoming events / Sign in), which still belongs on /events. The
 * landing is a marketing surface and brings its own glass pill nav + footer.
 */

// WP4 Path A — softened wording. Old title/description implied a verified
// end-to-end record that Eventar alone doesn't own (iCMECPD does).
export const metadata = {
  title: 'Eventar — CME/CPD attendance without the paperwork',
  description:
    'Accredited CME/CPD events for Hong Kong professionals. Check in on the day, and your attendance and points are captured on your Eventar record — alongside iCMECPD and your college, not instead of them.',
};

const FEATURES = {
  // WP4 Path A — softened for honesty against what actually ships: register
  // → check in → Eventar record. No claims of pre-verified point totals,
  // no "CPD Ledger" branding, no "audit-ready" export. Kept the "stop
  // <problem>" shape and the three-item cadence.
  practitioner: [
    {
      t: 'Skip the certificate hunt',
      d: 'Register on Eventar and every attendance is captured against your account — no PDFs to hoard, no emails to flag, nothing to key in after the fact.',
    },
    {
      t: 'Check in once, on the day',
      d: 'Scan your personal QR at the door. If your profile and membership number are set up, CME/CPD points are released straight to your Eventar record.',
    },
    {
      t: 'See what you did through Eventar',
      d: 'Your Eventar record shows the events you attended, when, and the points released — a running log alongside iCMECPD and your college, not a replacement for them.',
    },
  ],
  organiser: [
    {
      t: 'Stop paying to chase attention',
      d: 'List your event where practitioners look for accredited hours — the professionals who need your CPD find you, without ad spend.',
    },
    {
      t: 'Stop risking your accreditation',
      d: 'Requirements, approvals and point assignments live in one auditable workflow. Nothing is lost in an email thread; nothing publishes without approved points attached.',
    },
    {
      t: 'Stop arguing over attendance',
      d: 'On-site check-in writes straight to the participant’s Eventar record. No manual certificates, no data entry, no post-event disputes.',
    },
  ],
} as const;

export default function LandingPage() {
  return (
    <div className="hero-ground flex min-h-screen flex-col text-on-surface">
      {/* Page-level, so `position: sticky` is bound by the whole document and
          the nav stays reachable to the footer. It does NOT reintroduce the
          white band it was moved to fix: `.hero-ground` paints the glow from
          y=0 on this container, so the nav floats on the gradient rather than
          on `bg-background`. */}
      {/* Auth-varying pill sits inside LandingNav as a client island, so this
          page stays a static prerender (Dev-lens MODERATE 1, 2026-09-06). */}
      <LandingNav />

      <main className="flex-1">
        {/* LedgerWindow now renders inside LandingHero itself (its right
            column, 2026-08-20) rather than as a page-level child here. */}
        <AudienceExperience>
          <WhyEventar />

          {/* Was a bare `id="verification"` on the ledger mockup: a nav item
              pointing at a picture, with no heading carrying the word and
              nothing explaining what verification meant. Replaced by a real
              walkthrough — and since 2026-08-20 it shares AudienceExperience's
              toggle, so it renders here as a child alongside WhyEventar rather
              than as its own sibling. */}
        </AudienceExperience>

        <FeatureBand
          id="platform"
          audience="practitioner"
          title="What it changes for a practitioner"
          sub="Three things that stop being your problem."
        />
        <FeatureBand
          id="for-organisers"
          audience="organiser"
          title="What it changes for an organiser"
          sub="Three things that stop being your problem."
        />

        {/* CTA band — one line per audience, so neither is an afterthought. */}
        <section id="get-started" className="mx-auto mt-[46px] max-w-[1200px] px-[15px]">
          <div className="rounded-[18px] border border-outline-variant bg-surface-container-low p-xl text-center">
            <h2 className="text-[calc(26px*var(--text-scale))] font-semibold tracking-[-0.01em] text-on-surface">
              Your next event keeps your record for you
            </h2>
            <p className="mt-sm text-[calc(13.5px*var(--text-scale))] text-on-surface-variant">
              Run your next accredited event on Eventar.
            </p>
            <div className="mt-lg flex flex-wrap justify-center gap-sm">
              <Link
                href="/events"
                className="rounded-full bg-primary px-[19px] py-[9px] text-[calc(13px*var(--text-scale))] font-semibold text-white"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-outline bg-surface-container-lowest px-[19px] py-[9px] text-[calc(13px*var(--text-scale))] font-semibold text-on-surface"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function FeatureBand({
  id,
  audience,
  title,
  sub,
}: {
  id: string;
  audience: keyof typeof FEATURES;
  title: string;
  sub: string;
}) {
  return (
    <section id={id} className="mx-auto mt-[46px] max-w-[1200px] px-[15px]">
      <h2 className="text-center text-[calc(26px*var(--text-scale))] font-semibold tracking-[-0.01em] text-on-surface">
        {title}
      </h2>
      <p className="mt-[6px] text-center text-[calc(13.5px*var(--text-scale))] text-on-surface-variant">{sub}</p>
      <div className="mt-lg grid gap-md md:grid-cols-3">
        {FEATURES[audience].map((f) => (
          <article key={f.t} className="rounded-[14px] border border-outline-variant bg-surface-container-lowest p-lg">
            <h3 className="text-[calc(15px*var(--text-scale))] font-semibold leading-snug text-on-surface">{f.t}</h3>
            <p className="mt-sm text-[calc(13px*var(--text-scale))] leading-[1.55] text-on-surface-variant">{f.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
