/**
 * Readiness strip — docs/plans/2026-07-12-organiser-ia-spec.md, Events section:
 *
 *   "Overview tab opens with a readiness strip (Cadre's `2/3 CONTRACTED ·
 *    0 UNPAID · 4 MISSING ITINERARIES` motif): `148/180 registered · 3 speakers
 *    confirmed · accreditation ✓ HKCP 3.5 · reminder scheduled T-60m · survey
 *    armed`. One glance = is this event ready to run."
 *
 * Every cell is a FACT WITH A STATE, not a number: the operator is answering
 * "can this run tomorrow", so each cell says ok / attention / neutral and the
 * strip as a whole is scannable in one pass. Colour follows the spec's
 * one-colour-one-meaning rule (§7a): green = ready/verified, amber = pending or
 * needs a decision, red = blocked, neutral = not applicable.
 *
 * `null` state means "nothing to assert here" and renders muted rather than
 * green — claiming readiness we have not checked is the failure mode this whole
 * surface exists to prevent.
 */

export type ReadinessState = 'ok' | 'warn' | 'blocked' | 'idle';

export type ReadinessCell = {
  /** Big value, e.g. "148/180" or "HKCP 3.5". Tabular so cells align. */
  value: string;
  /** What the value is, e.g. "registered". */
  label: string;
  state: ReadinessState;
  /** Optional short qualifier, e.g. "on pace" or "3 licence-lapsed". */
  note?: string;
};

const DOT: Record<ReadinessState, string> = {
  ok: 'bg-[color:var(--success)]',
  warn: 'bg-[color:var(--warning)]',
  blocked: 'bg-[color:var(--error)]',
  idle: 'bg-outline',
};

const NOTE: Record<ReadinessState, string> = {
  ok: 'text-[color:var(--success)]',
  warn: 'text-on-surface',
  blocked: 'text-[color:var(--error)]',
  idle: 'text-on-surface-variant',
};

export function ReadinessStrip({ cells }: { cells: ReadinessCell[] }) {
  return (
    <section
      aria-label="Event readiness"
      className="mb-lg grid gap-px overflow-hidden rounded-[14px] border border-outline-variant bg-[color:var(--outline-variant)] sm:grid-cols-2 lg:grid-cols-5"
    >
      {/* gap-px over a tinted parent draws the hairline dividers without a
          border on every child (which double-draws at the seams). */}
      {cells.map((c) => (
        <div key={c.label} className="bg-surface-container-lowest px-md py-sm">
          <p className="flex items-center gap-xs text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[.07em] text-on-surface-variant">
            <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${DOT[c.state]}`} aria-hidden />
            {c.label}
          </p>
          <p className="mt-[3px] text-[calc(17px*var(--text-scale))] font-semibold tabular-nums leading-tight text-on-surface">
            {c.value}
          </p>
          {c.note && (
            <p className={`mt-[1px] text-[calc(11.5px*var(--text-scale))] ${NOTE[c.state]}`}>{c.note}</p>
          )}
        </div>
      ))}
    </section>
  );
}
