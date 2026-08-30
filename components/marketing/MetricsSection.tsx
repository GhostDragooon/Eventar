/**
 * No approved metrics exist yet (Eventar is pre-launch) — see
 * docs/ui-port/CATEGORY_12_STATUS.md. Library-only.
 */

export type ApprovedMetric = { id: string; label: string; displayValue: string; description: string; sourceLabel: string; approvalVersion: string };

export function MetricsSection({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  metrics: readonly ApprovedMetric[];
}) {
  return (
    <section className="bg-surface-container-low px-grid-margin py-xxl">
      <div className="mx-auto max-w-7xl">
        <header className="max-w-2xl">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">{title}</h2>
          <p className="mt-sm text-on-surface-variant">{description}</p>
        </header>
        <dl className="mt-xl grid gap-md md:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.id} className="rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg shadow-sm">
              <dt className="font-label-md text-label-md uppercase text-on-surface-variant">{metric.label}</dt>
              <dd className="mt-sm font-headline-md text-headline-md text-on-surface">{metric.displayValue}</dd>
              <p className="mt-sm text-on-surface-variant">{metric.description}</p>
              <p className="mt-md font-label-md text-label-md text-primary-ink">Source: {metric.sourceLabel} · {metric.approvalVersion}</p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
