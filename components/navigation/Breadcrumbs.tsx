import Link from 'next/link';
import { ChevronRightIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BreadcrumbItem = {
  label: string;
  href?: string;
  /** Optional leading glyph, per the reference design's icon-per-segment shape. */
  icon?: LucideIcon;
};

/**
 * Breadcrumbs — restyled 2026-08-21 to the imported UI reference Ivan supplied
 * (the `Breadcrumb3` specimen: icon + label per segment, chevron separators).
 * Design mapped onto Eventar's own tokens rather than the reference's shadcn
 * `--foreground`/`--muted-foreground` names, per the "convention beats novelty"
 * rule — this codebase names colours `on-surface` / `on-surface-variant`.
 *
 * What changed from the first pass, and why (all measured live, not guessed):
 *  - Links were `text-primary-ink` (#1C3C94) — a saturated blue that competed
 *    with the H1 directly beneath it. The reference keeps the whole trail
 *    muted and resolves to full-contrast only on hover, so the breadcrumb
 *    reads as chrome, not as the page's loudest element.
 *  - The trail carried `font-label-md`, a LABEL token: 600 weight plus 0.6px
 *    tracking, meant for the uppercase eyebrows elsewhere on these pages.
 *    The reference is 14px at normal weight, with `font-medium` reserved for
 *    the current page so it's the one emphasised item.
 *  - Separators are lucide SVGs, NOT `material-symbols-outlined`. That is
 *    deliberate and load-bearing: the Material Symbols stylesheet ships an
 *    unlayered `.material-symbols-outlined { font-size: 24px }`, and unlayered
 *    author CSS beats anything in Tailwind's `@layer utilities` — so the old
 *    `text-[16px]` chevron was silently rendering at 24px next to 12px text
 *    (measured). lucide sizes by width/height, so it is immune to that.
 *
 * Sizes use `calc(… * var(--text-scale))` so the trail tracks the Settings
 * text-size control like the rest of the app; a fixed `size-3.5` would stay
 * put while its own label grew.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: readonly BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-[6px] text-[calc(14px*var(--text-scale))] text-on-surface-variant">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const Icon = item.icon;
          const iconSize = 'size-[calc(14px*var(--text-scale))] shrink-0';
          // px-1/py-0.5 + rounded-sm come from the reference: they give the
          // focus ring something to sit around without shifting the baseline.
          const box = 'flex items-center gap-[6px] rounded-sm px-1 py-0.5';

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-[6px]">
              {last || !item.href ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn(box, 'font-medium text-on-surface')}
                >
                  {Icon && <Icon className={cn(iconSize, 'text-on-surface/80')} aria-hidden />}
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    box,
                    'transition-colors hover:text-on-surface',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  )}
                >
                  {Icon && <Icon className={cn(iconSize, 'text-on-surface-variant')} aria-hidden />}
                  {item.label}
                </Link>
              )}

              {!last && (
                <ChevronRightIcon
                  className={cn(iconSize, 'text-on-surface-variant/70')}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
