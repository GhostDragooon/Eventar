import Link from 'next/link';

// Chrome for a staff/organiser session landing on an attendee-facing shell
// (SiteShell / PublicShell / LandingNav / LandingAuthPill). Replaces the
// attendee AccountMenu — organisers have no attendee identity, so the
// AccountMenu's My record / Profile / Claim items don't apply to them.
//
// Ivan's 2026-09-24 call: a pill + a small "You're viewing the public page"
// line beside it, so the visitor immediately understands they are looking
// at the public surface (not their organiser workspace) and has a clear
// escape hatch back to /dashboard. Same pill geometry/tokens as the
// existing Account / Sign in pill so the row layout is unchanged.
//
// The caption sits to the LEFT of the pill (reading order → context first,
// then the action), hidden below sm to keep the nav clean at 375px where
// the pill alone is already at the tightness limit — the pill's own
// "Programme" label carries enough context in that width class.
export function StaffProgrammePill() {
  return (
    <div className="flex shrink-0 items-center gap-sm">
      <span
        className="hidden text-[calc(12px*var(--text-scale))] text-on-surface-variant sm:inline"
        aria-hidden
      >
        You&rsquo;re viewing the public page
      </span>
      <Link
        href="/dashboard"
        className="shrink-0 whitespace-nowrap rounded-full bg-primary px-md py-[7px] text-[calc(12.5px*var(--text-scale))] font-semibold text-on-primary transition-transform duration-150 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        Programme
      </Link>
    </div>
  );
}
