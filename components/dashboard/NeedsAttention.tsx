import Link from 'next/link';

/**
 * "Needs attention" queue — docs/plans/2026-07-12-organiser-ia-spec.md,
 * Dashboard section, which calls this "LoopAI's priority tasks - the single
 * best dashboard motif in the references".
 *
 * The spec's rule is the whole point of the component and is enforced by the
 * type, not by discipline: **every row is actionable and deep-links to the fix;
 * nothing informational-only.** `href` is required, so a row that cannot say
 * where its fix lives cannot be constructed.
 *
 * Spec feed sources: accreditations awaiting body confirmation · reminder sends
 * failing · licence-blocked registrants for imminent events · open disputes ·
 * survey closing soon. Only the ones with real data behind them today are
 * emitted (see buildAttentionItems in app/dashboard/page.tsx) — a queue padded
 * with placeholder rows would be the "chrome that lies" failure this repo keeps
 * catching, and it would also break the deep-link rule above.
 *
 * Presentation follows the spec's data rules: pills for state, right-aligned
 * tabular timing, one-colour-one-meaning (red = blocked/error, amber = pending,
 * neutral = informational-but-actionable).
 */

export type AttentionTone = 'error' | 'warn' | 'info';

export type AttentionItem = {
  id: string;
  tone: AttentionTone;
  icon: string;
  title: string;
  detail: string;
  /** Right-hand timing column: the spec's "progress fraction + due date". */
  meta: string;
  metaSub?: string;
  /** Required by design — see the component docblock. */
  href: string;
};

const TONE: Record<AttentionTone, { chip: string; icon: string }> = {
  error: { chip: 'bg-error-container text-[color:var(--error)]', icon: 'error' },
  warn: { chip: 'bg-warning-container text-on-surface', icon: 'priority_high' },
  info: { chip: 'bg-surface-container-high text-on-surface-variant', icon: 'schedule' },
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <section
      aria-labelledby="needs-attention-heading"
      className="rounded-[14px] border border-outline-variant bg-surface-container-lowest"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-sm border-b border-outline-variant px-lg py-md">
        <h2
          id="needs-attention-heading"
          className="text-[calc(15px*var(--text-scale))] font-semibold text-on-surface"
        >
          Needs attention
        </h2>
        <p className="text-[calc(12px*var(--text-scale))] text-on-surface-variant">
          {items.length === 0
            ? 'nothing right now'
            : `${items.length} item${items.length === 1 ? '' : 's'} · every row links to its fix`}
        </p>
      </header>

      {items.length === 0 ? (
        // Spec rule 6: every empty state names the next action. This one is a
        // genuinely good state, so it says so rather than inventing a task.
        <p className="px-lg py-xl text-center text-[calc(13px*var(--text-scale))] text-on-surface-variant">
          Nothing needs you. Sends are landing, accreditations are confirmed and no survey closes today.
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-[color:var(--outline-variant)] p-0">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="nav-item flex items-start gap-md px-lg py-md hover:bg-surface-container-high"
              >
                <span
                  className={`mt-[2px] grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg ${TONE[it.tone].chip}`}
                  aria-hidden
                >
                  <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]">
                    {it.icon || TONE[it.tone].icon}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[calc(13.5px*var(--text-scale))] font-semibold leading-snug text-on-surface">
                    {it.title}
                  </span>
                  <span className="mt-[2px] block text-[calc(12.5px*var(--text-scale))] leading-snug text-on-surface-variant">
                    {it.detail}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-[calc(12.5px*var(--text-scale))] font-semibold tabular-nums text-on-surface">
                    {it.meta}
                  </span>
                  {it.metaSub && (
                    <span className="block text-[calc(11.5px*var(--text-scale))] text-on-surface-variant">
                      {it.metaSub}
                    </span>
                  )}
                </span>

                <span className="material-symbols-outlined mt-[2px] shrink-0 text-[calc(18px*var(--text-scale))] text-on-surface-variant" aria-hidden>
                  chevron_right
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
