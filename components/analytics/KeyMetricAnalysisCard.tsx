import { keyMetricAnalysisText, type NarrativeMetrics } from '@/lib/analytics/narrative';

export function KeyMetricAnalysisCard({ metrics }: { metrics: NarrativeMetrics }) {
  return (
    <div className="mt-md p-lg bg-surface-container-high rounded-xxl border border-outline-variant flex items-start gap-md">
      <span className="material-symbols-outlined text-primary-ink" aria-hidden>
        analytics
      </span>
      <div>
        <h3 className="font-headline-sm text-title-lg text-on-surface mb-xs font-display">
          Key Operational Metric Analysis
        </h3>
        <p className="text-body-md text-on-surface-variant font-body-md">{keyMetricAnalysisText(metrics)}</p>
      </div>
    </div>
  );
}
