/**
 * E.5 funnel card: Registered → Attended → Responded. Each step shows the
 * absolute count and the conversion percentage from the previous step
 * (rounded). Visual: three step rectangles narrowing left-to-right via
 * a CSS clip-path-style chevron (kept simple with right-edge triangles).
 */
type FunnelStep = {
  label: string;
  count: number;
  // % of previous step. `null` on the first step (no "previous" to convert from).
  pctOfPrev: number | null;
};

export function FunnelCard({
  registered,
  attended,
  responded,
}: {
  registered: number;
  attended: number;
  responded: number;
}) {
  const pct = (numer: number, denom: number): number | null => {
    if (denom <= 0) return null;
    return Math.round((numer / denom) * 100);
  };

  const steps: FunnelStep[] = [
    { label: 'Registered', count: registered, pctOfPrev: null },
    { label: 'Attended', count: attended, pctOfPrev: pct(attended, registered) },
    { label: 'Responded', count: responded, pctOfPrev: pct(responded, attended) },
  ];

  // Opacity ramp: full → 70% → 40%. Matches the Q4 stacked-bar accent ramp
  // (plan spec) for visual coherence across analytics surfaces.
  const STEP_OPACITY = [1, 0.7, 0.4];

  return (
    <section
      aria-label="Conversion funnel"
      className="mt-lg p-lg bg-surface-container-lowest border border-outline-variant rounded-xxl shadow-sm"
    >
      <div className="flex items-center gap-sm mb-md">
        <span className="material-symbols-outlined text-primary" aria-hidden>
          filter_alt
        </span>
        <h2 className="font-title-lg text-title-lg text-on-surface">Conversion funnel</h2>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-sm">
        {steps.map((step, i) => (
          <li key={step.label} className="relative">
            <div
              className="rounded-lg p-lg flex flex-col gap-xs"
              style={{
                background: `color-mix(in srgb, var(--color-primary) ${STEP_OPACITY[i] * 100}%, transparent)`,
                color: 'var(--color-on-primary)',
              }}
            >
              <p className="text-label-md font-label-md uppercase tracking-wide opacity-90">
                {step.label}
              </p>
              <p className="font-display text-3xl font-bold leading-none">{step.count}</p>
              {step.pctOfPrev !== null && (
                <p className="text-label-sm opacity-90">
                  {step.pctOfPrev}% of {steps[i - 1].label.toLowerCase()}
                </p>
              )}
            </div>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="hidden md:block absolute right-[-12px] top-1/2 -translate-y-1/2 text-on-surface-variant"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
