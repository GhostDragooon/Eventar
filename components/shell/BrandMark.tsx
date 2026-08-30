import Link from 'next/link';

/**
 * The Eventar mark: "E" tile + wordmark. Sans, not serif — the serif
 * treatment was dropped app-wide 2026-08-21 at Ivan's request.
 *
 * Extracted 2026-08-09 when Ivan reversed the old "no wordmark in shell chrome"
 * rule for EVERY shell, not just the organiser sidebar. Before that the mark
 * existed only in `LandingNav`; putting it in three more places by hand would
 * have created four copies of one brand asset, which is how the rest of this
 * palette drifted in the first place. One definition, four call sites.
 *
 * `href` differs by shell — the landing and public site point home, the staff
 * shell points at /dashboard — so it is a prop rather than hardcoded.
 *
 * `compact` is the sidebar tile (26px vs the nav pill's 30px), which is the
 * only size difference that existed across the four shells. The wordmark itself
 * is 16px everywhere, so it is not parameterised.
 */
export function BrandMark({
  href = '/',
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-sm${compact ? ' px-sm py-xs' : ''}`}
      aria-label="Eventar home"
    >
      <span
        className={`grid place-items-center rounded-lg bg-primary font-semibold text-on-primary ${
          compact
            ? 'h-[26px] w-[26px] text-[calc(15px*var(--text-scale))]'
            : 'h-[30px] w-[30px] text-[calc(17px*var(--text-scale))]'
        }`}
        aria-hidden
      >
        E
      </span>
      <span className="text-[calc(16px*var(--text-scale))] font-semibold tracking-[-0.01em] text-on-surface">
        Eventar
      </span>
    </Link>
  );
}
