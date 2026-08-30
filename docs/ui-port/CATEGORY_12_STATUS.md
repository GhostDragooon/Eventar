# Category 12 — Public Website, Marketing and Social Proof: status

**Library-only. Not wired to any route.** Every component in this category
overlaps something already shipped and deliberately designed on the real
landing page — ported for completeness, not because a gap exists.

- **`BrandFooter.tsx` — do not wire.** `components/shell/SiteFooter.tsx` is
  the "one footer, used by every shell" (Ivan, 2026-08-09 — see that file's
  own header comment). Wiring `BrandFooter` anywhere would re-fragment
  exactly what that unification pass removed. If a richer footer (link
  groups, contact CTA, legal row) is ever wanted, extend `SiteFooter`
  in place — don't introduce a second footer component.
- **`FeatureShowcase.tsx` — soft conflict.** `components/landing/LandingHero.tsx`
  already occupies this page position: an artifact-matched hero with an
  audience toggle, "Ivan's call 2026-08-06: match the artifact closely."
  `FeatureShowcase` is a generic, differently-shaped alternative (2-column
  grid + visual slot, no audience toggle). Flagging rather than wiring —
  swapping the real hero for a generic one is a design decision, not a gap.
- **`MetricsSection.tsx`** — no approved metrics exist to populate it yet.
  Eventar is pre-launch (HK pilot, first accrediting body not yet live), so
  there's no real usage data to source `ApprovedMetric` records from. Ready
  for whenever that changes.
- **`TestimonialCarousel.tsx`** — same reason: no customers yet, so no
  `ApprovedTestimonial` records exist to be approved.
- **`ServiceCardCarousel.tsx`** — conceptually overlaps
  `components/landing/HowItWorks.tsx` (the real, bespoke 5-step walkthrough
  built 2026-08-09), though the container shape differs (one-card-at-a-time
  carousel vs. all-steps-visible). Lower-confidence flag than the other two —
  worth a look before ever wiring, not a hard conflict.
